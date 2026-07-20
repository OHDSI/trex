// @ts-nocheck - Deno edge function
/**
 * Git commit-signing key management (Settings -> Integrations -> Git).
 *
 * The ed25519 private key is generated (or pasted) here, AES-256-GCM encrypted
 * via crypto.ts (DEVX_ENCRYPTION_KEY) and stored in devx.integrations
 * (provider 'git_signing') — the same pattern as the GitHub OAuth token. The
 * private key is NEVER returned by any endpoint; status exposes only the
 * public key + fingerprint from the row's metadata. Application to repos
 * happens in git_identity.ts (per-repo devx.gitconfig include).
 */
import { encryptToken } from "../crypto.ts";
import { generateEd25519, parseOpensshPrivateKey } from "../ssh_keys.ts";
import {
  SIGNING_PROVIDER,
  getSigningKeyDir,
  materializeSigningKey,
  refreshUserGitConfigs,
  signingKeyPath,
} from "../git_identity.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

async function storeKey(userId, sql, privateKeyOpenssh, publicKeyLine, fingerprint, source) {
  const { ciphertext, iv } = await encryptToken(privateKeyOpenssh);
  const metadata = JSON.stringify({
    public_key: publicKeyLine,
    fingerprint,
    source,
    created_at: new Date().toISOString(),
  });
  await sql(
    `INSERT INTO devx.integrations (user_id, provider, name, encrypted_token, token_iv, metadata)
     VALUES ($1, $2, 'default', $3, $4, $5)
     ON CONFLICT (user_id, provider, name) DO UPDATE SET
       encrypted_token = EXCLUDED.encrypted_token,
       token_iv = EXCLUDED.token_iv,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [userId, SIGNING_PROVIDER, ciphertext, iv, metadata],
  );
}

// Verify the materialized key with the real toolchain. Git's SSH signing
// shells out to ssh-keygen, so a deployment without openssh-client would fail
// on EVERY commit once gpgsign is armed — surface that at setup time instead.
// Returns a warning string, or null when the probe passed.
async function probeSshKeygen(userId): Promise<string | null> {
  try {
    const keyPath = signingKeyPath(userId);
    const dir = getSigningKeyDir(userId);
    const json = await duckdb(
      `SELECT * FROM trex_devx_run_command('${escapeSql(dir)}', '${escapeSql(`ssh-keygen -y -f ${keyPath}`)}')`,
    );
    const r = JSON.parse(json);
    if (!r.ok) return `signing key verification failed: ${r.output || "ssh-keygen error"}`;
    return null;
  } catch (err) {
    return `ssh-keygen is not available on this server — commits will fail to sign until openssh-client is installed (${err?.message || err})`;
  }
}

export async function handleSigningRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /integrations/git-signing/status
  if (path.endsWith("/integrations/git-signing/status") && method === "GET") {
    const result = await sql(
      `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = $2 LIMIT 1`,
      [userId, SIGNING_PROVIDER],
    );
    if (result.rows.length === 0) {
      return Response.json({ configured: false }, { headers: corsHeaders });
    }
    const metadata = result.rows[0].metadata;
    const meta = (typeof metadata === "string" ? JSON.parse(metadata) : metadata) ?? {};
    return Response.json(
      {
        configured: true,
        public_key: meta.public_key ?? null,
        fingerprint: meta.fingerprint ?? null,
        source: meta.source ?? null,
        created_at: meta.created_at ?? null,
      },
      { headers: corsHeaders },
    );
  }

  // POST /integrations/git-signing/generate — create (or rotate) a keypair.
  if (path.endsWith("/integrations/git-signing/generate") && method === "POST") {
    const key = await generateEd25519();
    await storeKey(userId, sql, key.privateKeyOpenssh, key.publicKeyLine, key.fingerprint, "generated");
    await materializeSigningKey(userId, sql);
    const warning = await probeSshKeygen(userId);
    await refreshUserGitConfigs(userId, sql);
    return Response.json(
      { public_key: key.publicKeyLine, fingerprint: key.fingerprint, ...(warning ? { warning } : {}) },
      { headers: corsHeaders },
    );
  }

  // POST /integrations/git-signing/import — paste an existing private key.
  if (path.endsWith("/integrations/git-signing/import") && method === "POST") {
    const body = await req.json();
    if (!body.private_key || typeof body.private_key !== "string") {
      return Response.json({ error: "private_key required" }, { status: 400, headers: corsHeaders });
    }
    let parsed;
    try {
      parsed = await parseOpensshPrivateKey(body.private_key);
    } catch (err) {
      return Response.json({ error: err?.message || "invalid private key" }, { status: 400, headers: corsHeaders });
    }
    await storeKey(userId, sql, parsed.privateKeyOpenssh, parsed.publicKeyLine, parsed.fingerprint, "imported");
    await materializeSigningKey(userId, sql);
    const warning = await probeSshKeygen(userId);
    await refreshUserGitConfigs(userId, sql);
    return Response.json(
      { public_key: parsed.publicKeyLine, fingerprint: parsed.fingerprint, ...(warning ? { warning } : {}) },
      { headers: corsHeaders },
    );
  }

  // DELETE /integrations/git-signing — remove the key; identity config stays.
  if (path.endsWith("/integrations/git-signing") && method === "DELETE") {
    await sql(
      `DELETE FROM devx.integrations WHERE user_id = $1 AND provider = $2`,
      [userId, SIGNING_PROVIDER],
    );
    // materializeSigningKey with no row removes the on-disk key files;
    // refresh rewrites the include files without the signing block.
    await materializeSigningKey(userId, sql);
    await refreshUserGitConfigs(userId, sql);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
