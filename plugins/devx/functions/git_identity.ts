// @ts-nocheck - Deno edge function
/**
 * Per-user git identity + SSH commit signing, applied to app repos via a
 * devx-owned include file.
 *
 * Mechanism: `.git/devx.gitconfig` (written wholly from Deno, full control
 * over quoting) wired once with `git config include.path devx.gitconfig`.
 * Per-repo config is the one layer every commit path honors: the devx-ext CLI
 * paths (git_commit/git_init/git_revert), trex_devx_run_command merges (no env
 * injection), git worktrees (they share the main repo's .git/config), and the
 * claude-code coder sidecar (local config beats its `git config --global`
 * identity). The devx-ext run_git env identity was removed for exactly this
 * reason — GIT_CONFIG_* env outranks .git/config and would silently override
 * everything here.
 *
 * IMPORTANT: with the env identity gone, this file is also what supplies the
 * FALLBACK identity (DevX <devx@trex.local>) — ensureGitConfig must run for
 * unconfigured users too, or bare `git commit` fails with "tell me who you
 * are".
 *
 * The private key is stored AES-256-GCM encrypted in devx.integrations
 * (provider 'git_signing', same pattern as the GitHub token) and lazily
 * materialized to <workspace-root>/<user>/.gitkeys/ — outside every git tree,
 * on the filesystem both the engine process and the coder sidecar share.
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { getWorkspacePath, getAppWorkspacePath } from "./tools/workspace.ts";
import { decryptToken } from "./crypto.ts";
import { duckdb, escapeSql } from "./duckdb.ts";

export const SIGNING_PROVIDER = "git_signing";
const FALLBACK_NAME = "DevX";
const FALLBACK_EMAIL = "devx@trex.local";

export function getSigningKeyDir(userId: string): string {
  return join(getWorkspacePath(userId), ".gitkeys");
}

export function signingKeyPath(userId: string): string {
  return join(getSigningKeyDir(userId), "signing_key");
}

export function allowedSignersPath(userId: string): string {
  return join(getSigningKeyDir(userId), "allowed_signers");
}

export interface GitIdentity {
  name: string;
  email: string;
  /** true when a git_signing integration row exists */
  hasSigningKey: boolean;
  /** authorized_keys-style public line, from the integration row's metadata */
  publicKeyLine: string | null;
}

export async function loadGitIdentity(userId: string, sql): Promise<GitIdentity> {
  const settingsResult = await sql(
    `SELECT git_author_name, git_author_email FROM devx.settings WHERE user_id = $1`,
    [userId],
  );
  const row = settingsResult.rows[0] ?? {};
  const keyResult = await sql(
    `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = $2 LIMIT 1`,
    [userId, SIGNING_PROVIDER],
  );
  const metadata = keyResult.rows[0]?.metadata ?? null;
  const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  return {
    name: row.git_author_name || FALLBACK_NAME,
    email: row.git_author_email || FALLBACK_EMAIL,
    hasSigningKey: keyResult.rows.length > 0,
    publicKeyLine: meta?.public_key ?? null,
  };
}

/**
 * Write (or remove) the on-disk private key + allowed_signers for a user from
 * the DB row. Idempotent; safe after container restarts (the key dir lives in
 * the same durability class as the workspaces themselves). Returns the key
 * path when a key is configured, null otherwise.
 */
export async function materializeSigningKey(userId: string, sql, identity?: GitIdentity): Promise<string | null> {
  const result = await sql(
    `SELECT encrypted_token, token_iv, metadata FROM devx.integrations WHERE user_id = $1 AND provider = $2 LIMIT 1`,
    [userId, SIGNING_PROVIDER],
  );
  const dir = getSigningKeyDir(userId);
  if (result.rows.length === 0) {
    // No key configured — drop any stale files so a removed key stops signing.
    await Deno.remove(dir, { recursive: true }).catch(() => {});
    return null;
  }
  let privateKey: string;
  try {
    privateKey = await decryptToken(result.rows[0].encrypted_token, result.rows[0].token_iv);
  } catch (err) {
    console.warn("[git-signing] could not decrypt signing key (skipping):", err?.message || err);
    return null;
  }
  const metadata = result.rows[0].metadata;
  const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;

  await Deno.mkdir(dir, { recursive: true });
  const keyPath = signingKeyPath(userId);
  await Deno.writeTextFile(keyPath, privateKey);
  // ssh-keygen refuses group/world-readable private keys. Best-effort: the
  // edge sandbox may not expose chmod; the single-uid container mitigates.
  await Deno.chmod?.(keyPath, 0o600)?.catch?.(() => {});

  // allowed_signers lets `git log --show-signature` verify locally. Principal
  // is the author email (matched against the committer), falling back to any.
  if (meta?.public_key) {
    const id = identity ?? await loadGitIdentity(userId, sql);
    const principal = id.email || "*";
    // public_key is "ssh-ed25519 AAAA... comment" — signers format wants
    // "<principal> <type> <blob>".
    const [type, blob] = String(meta.public_key).split(/\s+/);
    await Deno.writeTextFile(allowedSignersPath(userId), `${principal} ${type} ${blob}\n`);
  }
  return keyPath;
}

// git config value quoting: wrap in double quotes, escape backslash + quote.
function iniQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Pure renderer, unit-tested separately. */
export function renderGitConfig(
  identity: { name: string; email: string },
  signing: { keyPath: string; signersPath: string } | null,
): string {
  const lines = [
    "# Written by devx (Settings -> Integrations -> Git). Do not edit; changes",
    "# are overwritten whenever devx syncs the user's git identity.",
    "[user]",
    `\tname = ${iniQuote(identity.name)}`,
    `\temail = ${iniQuote(identity.email)}`,
  ];
  if (signing) {
    lines.push(
      `\tsigningkey = ${iniQuote(signing.keyPath)}`,
      "[commit]",
      "\tgpgsign = true",
      "[gpg]",
      "\tformat = ssh",
      '[gpg "ssh"]',
      `\tallowedSignersFile = ${iniQuote(signing.signersPath)}`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Idempotently apply the user's identity/signing config to one repo. Call
 * before/around anything that creates commits. No-ops when the path has no
 * .git DIRECTORY (worktrees have a .git FILE and share the main repo's
 * config — the main repo's include covers them).
 */
export async function ensureGitConfig(wsPath: string, userId: string, sql): Promise<void> {
  let gitStat;
  try {
    gitStat = await Deno.stat(join(wsPath, ".git"));
  } catch {
    return; // not a git repo (yet)
  }
  if (!gitStat.isDirectory) return; // worktree — main repo's config applies

  const identity = await loadGitIdentity(userId, sql);
  const keyPath = identity.hasSigningKey ? await materializeSigningKey(userId, sql, identity) : null;

  const content = renderGitConfig(
    identity,
    keyPath ? { keyPath, signersPath: allowedSignersPath(userId) } : null,
  );
  const configPath = join(wsPath, ".git", "devx.gitconfig");
  let existing: string | null = null;
  try {
    existing = await Deno.readTextFile(configPath);
  } catch { /* first write */ }
  if (existing !== content) {
    await Deno.writeTextFile(configPath, content);
  }

  // Wire the include once per repo. Idempotent single-value set; relative
  // include paths resolve against the file containing the directive
  // (.git/config), so this lands on .git/devx.gitconfig. No spaces in the
  // command — trex_devx_run_command splits on whitespace with no shell.
  try {
    const json = await duckdb(
      `SELECT * FROM trex_devx_run_command('${escapeSql(wsPath)}', '${escapeSql("git config include.path devx.gitconfig")}')`,
    );
    const r = JSON.parse(json);
    if (!r.ok) console.warn("[git-signing] include.path wiring failed:", r.output);
  } catch (err) {
    console.warn("[git-signing] include.path wiring failed:", err?.message || err);
  }
}

/**
 * Re-sync every existing app repo of the user. Called after settings/key
 * changes so already-cloned apps pick the new identity up immediately.
 */
export async function refreshUserGitConfigs(userId: string, sql): Promise<void> {
  const apps = await sql(`SELECT id FROM devx.apps WHERE user_id = $1`, [userId]);
  for (const app of apps.rows) {
    const wsPath = getAppWorkspacePath(userId, app.id);
    try {
      await ensureGitConfig(wsPath, userId, sql);
    } catch (err) {
      console.warn(`[git-signing] refresh failed for app ${app.id}:`, err?.message || err);
    }
  }
}
