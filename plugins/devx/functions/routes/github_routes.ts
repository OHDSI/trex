// @ts-nocheck - Deno edge function
import { encryptToken, decryptToken } from "../crypto.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { gitOps } from "../git.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";

// Public client id of the "TREX" GitHub OAuth App (device flow → public client,
// no secret involved, so this is safe to ship in source). Override per-deployment
// with the GITHUB_CLIENT_ID env var to point at your own OAuth App.
const DEFAULT_GITHUB_CLIENT_ID = "Ov23liIuZqILnwdyKSfM";

function getClientId(): string {
  return Deno.env.get("GITHUB_CLIENT_ID") || DEFAULT_GITHUB_CLIENT_ID;
}

/**
 * Best-effort fetch of the user's stored GitHub OAuth token, or null if it
 * can't be produced (not connected, no DEVX_ENCRYPTION_KEY configured, or
 * decrypt failure). Shared by github/git routes so private clone/push/pull can
 * authenticate — but a missing token must NOT break public, no-auth operations,
 * so callers treat null as "proceed unauthenticated".
 */
export async function getGithubToken(userId: string, sql): Promise<string | null> {
  const result = await sql(
    `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  try {
    return await decryptToken(result.rows[0].encrypted_token, result.rows[0].token_iv);
  } catch (err) {
    console.warn("[github] could not decrypt stored token (proceeding unauthenticated):", err?.message || err);
    return null;
  }
}

/**
 * Inject a token into an https GitHub URL as the basic-auth user so git can
 * authenticate non-interactively. The token is never persisted in this form —
 * callers build it transiently per push/pull/clone. Non-GitHub / non-https
 * URLs are returned unchanged.
 */
export function injectToken(url: string, token: string | null): string {
  if (!token) return url;
  if (url.startsWith("https://github.com/")) {
    return url.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
  }
  return url;
}

// --- GitHub CLI (`gh`) authentication -------------------------------------
//
// Distinct from the OAuth connection above. That one stores a token in
// devx.integrations and is used by this service's own git push/pull/clone.
// This one authenticates the `gh` binary installed in the container, whose
// credential store lives on a volume at ~/.config/gh. The coder sidecar calls
// `gh auth setup-git` / `gh api user` at boot to get non-interactive push
// credentials and a commit identity, and the branch/review skills shell out to
// `gh pr create` and `gh api`. Without this, a freshly provisioned deployment
// ships an unauthenticated `gh` and those all fail.

// Scopes requested for the CLI token. `repo` is what `gh pr create` and
// `gh api repos/...` need on private repositories; `read:org` lets those
// resolve org-owned repos and team reviewers. `gh` unions these with its own
// minimum set, so the granted token also carries `gist`. Deliberately NOT
// requested: `workflow` (would let pushes rewrite CI definitions),
// `delete_repo`, or any `admin:*`.
export const GH_CLI_SCOPES = "repo,read:org";

// Fixed path — nothing a caller supplies ever reaches a shell command in this
// module. The launcher unlinks it first, so a stale login process left over
// from an abandoned attempt keeps writing to the old (now unreferenced) inode
// instead of interleaving with the new attempt's output.
const GH_LOGIN_OUTPUT_PATH = "/tmp/.devx-gh-cli-login.out";

// Seconds the login route waits for `gh` to print its code + URL before giving
// up and reporting whatever it has. The device flow is asynchronous: `gh auth
// login` keeps running in the background polling GitHub until the user
// authorizes (or the code expires), so this only bounds the initial handshake.
const GH_LOGIN_HANDSHAKE_TIMEOUT_SECONDS = 12;

/** Result of a shell command run through the DuckDB devx-ext bridge. */
export interface ShellResult {
  output: string;
  exit_code: number;
}

type ShellRunner = (command: string) => Promise<ShellResult>;

/**
 * Run a shell command via temp script + DuckDB devx-ext `sh` execution.
 * The Deno edge runtime sandbox does not allow Deno.Command directly, so
 * everything that needs a subprocess goes through trex_devx_run_command.
 */
async function runShellViaDuckdb(command: string): Promise<ShellResult> {
  const scriptPath =`/tmp/.devx-cmd-${crypto.randomUUID().slice(0, 8)}.sh`;
  try {
    await Deno.writeTextFile(scriptPath, command + "\n");
    const raw = await duckdb(
      `SELECT * FROM trex_devx_run_command('/tmp', 'sh ${escapeSql(scriptPath)}')`,
    );
    const result = JSON.parse(raw);
    try { await Deno.remove(scriptPath); } catch { /* best-effort */ }
    return {
      output: result.output || "",
      exit_code: result.exit_code ?? (result.error ? 1 : 0),
    };
  } catch (err) {
    try { await Deno.remove(scriptPath); } catch { /* best-effort */ }
    return { output: err?.message || String(err), exit_code: 1 };
  }
}

let shellRunner: ShellRunner = runShellViaDuckdb;

/**
 * Swap the shell layer for a fake. The real one needs a live DuckDB instance
 * with devx-ext loaded, which no unit test has; returns a restore function.
 */
export function __setShellRunnerForTests(fn: ShellRunner): () => void {
  const previous = shellRunner;
  shellRunner = fn;
  return () => { shellRunner = previous; };
}

/** Parse a URL from command output. */
export function parseLoginUrl(text: string): string | null {
  const urlMatch = text.match(/https:\/\/[^\s"'<>]+/);
  return urlMatch ? urlMatch[0] : null;
}

/** Parse a device code (e.g. ABCD-1234) from command output. */
export function parseUserCode(text: string): string | null {
  const codeMatch = text.match(/\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/);
  return codeMatch ? codeMatch[0] : null;
}

/** Parse the logged-in account from `gh auth status` output. */
export function parseGhAccount(text: string): string | null {
  const match = text.match(/Logged in to \S+ account (\S+)/i) ||
    text.match(/Logged in to \S+ as (\S+)/i) ||
    text.match(/\baccount\s+(\S+)/i);
  return match ? match[1] : null;
}

/** Parse the `Token scopes: 'a', 'b'` line from `gh auth status` output. */
export function parseGhScopes(text: string): string | null {
  const match = text.match(/Token scopes:\s*(.+)/i);
  if (!match) return null;
  return match[1].trim().replace(/['"]/g, "") || null;
}

/**
 * The command that starts the device flow. A fixed string — no interpolation
 * of anything a caller supplies. `gh auth login` blocks until the user
 * authorizes in a browser, so the whole group is backgrounded with its output
 * redirected to a file (which also releases the pipe the runner waits on); the
 * script then waits for the code + URL to appear and prints them.
 *
 * `gh auth setup-git` is chained onto a successful login so the credential
 * helper is installed the moment authorization lands. The coder sidecar runs
 * it too, but only at its own startup — a sidecar already running when the
 * user signs in here would otherwise stay without push credentials until it
 * was restarted.
 */
export function buildGhLoginCommand(): string {
  return [
    `rm -f ${GH_LOGIN_OUTPUT_PATH}`,
    `{ BROWSER=false DISPLAY= NO_COLOR=1 GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1 ` +
      `gh auth login --hostname github.com --git-protocol https --web --scopes '${GH_CLI_SCOPES}' ` +
      `&& gh auth setup-git --hostname github.com; } ` +
      `< /dev/null > ${GH_LOGIN_OUTPUT_PATH} 2>&1 &`,
    `login_pid=$!`,
    `i=0`,
    `while [ $i -lt ${GH_LOGIN_HANDSHAKE_TIMEOUT_SECONDS} ]; do`,
    // Read the file before testing liveness, so output written by a process
    // that has since exited is never missed.
    `  grep -q 'https://' ${GH_LOGIN_OUTPUT_PATH} 2>/dev/null && break`,
    // gh died without ever printing a URL — stop waiting out the full timeout
    // and let the caller report the error now.
    `  kill -0 $login_pid 2>/dev/null || break`,
    `  sleep 1`,
    `  i=$((i+1))`,
    `done`,
    `cat ${GH_LOGIN_OUTPUT_PATH} 2>/dev/null || true`,
  ].join("\n");
}

/** Probe `gh`: installed, authenticated, as whom, with which scopes. */
async function readGhCliAuthState() {
  const ghVersion = await shellRunner("gh --version 2>&1");
  const installed = ghVersion.exit_code === 0 || ghVersion.output.includes("gh version");
  if (!installed) {
    return { installed: false, authenticated: false, version: null, account: null, scopes: null };
  }

  const authStatus = await shellRunner("gh auth status 2>&1");
  const authenticated = authStatus.exit_code === 0;

  return {
    installed: true,
    authenticated,
    version: ghVersion.output.trim().split("\n")[0] || null,
    account: authenticated ? parseGhAccount(authStatus.output) : null,
    scopes: authenticated ? parseGhScopes(authStatus.output) : null,
  };
}

export async function handleGithubRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /integrations/github/cli-auth — is `gh` installed/authenticated
  if (path.endsWith("/integrations/github/cli-auth") && method === "GET") {
    try {
      return Response.json(await readGhCliAuthState(), { headers: corsHeaders });
    } catch (err) {
      return Response.json({
        installed: false,
        authenticated: false,
        version: null,
        account: null,
        scopes: null,
        error: err?.message || String(err),
      }, { headers: corsHeaders });
    }
  }

  // POST /integrations/github/cli-auth/login — start the device flow
  if (path.endsWith("/integrations/github/cli-auth/login") && method === "POST") {
    try {
      const state = await readGhCliAuthState();
      if (!state.installed) {
        return Response.json({
          status: "not_installed",
          message: "The `gh` CLI is not installed in this container.",
        }, { headers: corsHeaders });
      }
      if (state.authenticated) {
        return Response.json({
          status: "already_authenticated",
          account: state.account,
          message: `The gh CLI is already authenticated as ${state.account || "an unknown account"}.`,
        }, { headers: corsHeaders });
      }

      const login = await shellRunner(buildGhLoginCommand());
      const login_url = parseLoginUrl(login.output);
      const user_code = parseUserCode(login.output);

      if (login_url) {
        return Response.json({
          status: "pending",
          login_url,
          user_code,
          message: "Open the URL and enter the code to authorize the CLI.",
        }, { headers: corsHeaders });
      }

      return Response.json({
        status: "error",
        message: "Could not start the gh login flow.",
        output: login.output.slice(0, 500),
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({
        status: "error",
        message: err?.message || "Failed to start the gh login flow",
      }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /integrations/github/cli-auth/logout
  if (path.endsWith("/integrations/github/cli-auth/logout") && method === "POST") {
    try {
      const result = await shellRunner("echo y | gh auth logout --hostname github.com 2>&1");
      return Response.json({
        ok: true,
        message: result.output.trim() || "Signed out.",
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({
        ok: false,
        message: err?.message || String(err),
      }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /integrations/github/device-code — start device flow
  if (path.endsWith("/integrations/github/device-code") && method === "POST") {
    const clientId = getClientId();
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "repo,user:email" }),
    });
    if (!res.ok) {
      return Response.json({ error: "Failed to start GitHub device flow" }, { status: 502, headers: corsHeaders });
    }
    const data = await res.json();
    return Response.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      interval: data.interval || 5,
      expires_in: data.expires_in || 900,
    }, { headers: corsHeaders });
  }

  // POST /integrations/github/poll-token — poll for access token
  if (path.endsWith("/integrations/github/poll-token") && method === "POST") {
    const body = await req.json();
    const { device_code } = body;
    if (!device_code) {
      return Response.json({ error: "device_code required" }, { status: 400, headers: corsHeaders });
    }

    const clientId = getClientId();
    const res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data = await res.json();

    if (data.error === "authorization_pending") {
      return Response.json({ status: "pending" }, { headers: corsHeaders });
    }
    if (data.error === "slow_down") {
      return Response.json({ status: "slow_down" }, { headers: corsHeaders });
    }
    if (data.error) {
      return Response.json({ status: "error", error: data.error_description || data.error }, { headers: corsHeaders });
    }
    if (data.access_token) {
      // Encrypt and store token
      const { ciphertext, iv } = await encryptToken(data.access_token);

      // Fetch GitHub user info
      const userRes = await fetch(`${GITHUB_API}/user`, {
        headers: { "Authorization": `Bearer ${data.access_token}`, "Accept": "application/json" },
      });
      const user = userRes.ok ? await userRes.json() : {};

      await sql(
        `INSERT INTO devx.integrations (user_id, provider, name, encrypted_token, token_iv, metadata)
         VALUES ($1, 'github', 'default', $2, $3, $4)
         ON CONFLICT (user_id, provider, name) DO UPDATE SET
           encrypted_token = $2, token_iv = $3, metadata = $4, updated_at = NOW()`,
        [userId, ciphertext, iv, JSON.stringify({ username: user.login, email: user.email, scopes: data.scope })],
      );

      return Response.json({ status: "connected", username: user.login }, { headers: corsHeaders });
    }

    return Response.json({ status: "error", error: "Unexpected response" }, { headers: corsHeaders });
  }

  // GET /integrations/github/status
  if (path.endsWith("/integrations/github/status") && method === "GET") {
    const result = await sql(
      `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
      [userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ connected: false }, { headers: corsHeaders });
    }
    const meta = result.rows[0].metadata || {};
    return Response.json({ connected: true, username: meta.username }, { headers: corsHeaders });
  }

  // DELETE /integrations/github
  if (path.endsWith("/integrations/github") && method === "DELETE") {
    await sql(`DELETE FROM devx.integrations WHERE user_id = $1 AND provider = 'github'`, [userId]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /integrations/github/repos
  if (path.endsWith("/integrations/github/repos") && method === "GET") {
    const tokenResult = await sql(
      `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
      [userId],
    );
    if (tokenResult.rows.length === 0) {
      return Response.json({ error: "GitHub not connected" }, { status: 400, headers: corsHeaders });
    }
    const token = await decryptToken(tokenResult.rows[0].encrypted_token, tokenResult.rows[0].token_iv);
    const res = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=50`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    });
    if (!res.ok) {
      return Response.json({ error: "Failed to list repos" }, { status: 502, headers: corsHeaders });
    }
    const repos = await res.json();
    const simplified = repos.map((r) => ({
      name: r.full_name,
      url: r.html_url,
      clone_url: r.clone_url,
      private: r.private,
      default_branch: r.default_branch,
    }));
    return Response.json(simplified, { headers: corsHeaders });
  }

  // POST /apps/:id/github/create-repo
  const createRepoMatch = path.match(/\/apps\/([^/]+)\/github\/create-repo$/);
  if (createRepoMatch && method === "POST") {
    const appId = createRepoMatch[1];
    const appCheck = await sql(`SELECT id, name FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const repoName = body.name || appCheck.rows[0].name;
    const isPrivate = body.private !== false;

    const tokenResult = await sql(
      `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
      [userId],
    );
    if (tokenResult.rows.length === 0) {
      return Response.json({ error: "GitHub not connected" }, { status: 400, headers: corsHeaders });
    }
    const token = await decryptToken(tokenResult.rows[0].encrypted_token, tokenResult.rows[0].token_iv);

    // Create repo on GitHub
    const res = await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false }),
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Failed to create repo: ${err}` }, { status: 502, headers: corsHeaders });
    }
    const repo = await res.json();

    // Set remote in workspace (store the clean URL; token is injected at push time)
    const wsPath = getAppWorkspacePath(userId, appId);
    await gitOps.setRemote(wsPath, repo.clone_url);
    await sql(`UPDATE devx.apps SET git_remote_url = $1 WHERE id = $2`, [repo.clone_url, appId]);

    // Push the current branch to the new repo.
    try {
      await gitOps.push(wsPath, injectToken(repo.clone_url, token));
    } catch { /* may fail if no commits yet */ }

    return Response.json({ url: repo.html_url, clone_url: repo.clone_url }, { headers: corsHeaders });
  }

  // POST /apps/:id/github/connect-repo
  const connectRepoMatch = path.match(/\/apps\/([^/]+)\/github\/connect-repo$/);
  if (connectRepoMatch && method === "POST") {
    const appId = connectRepoMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const repoUrl = body.url;
    if (!repoUrl) {
      return Response.json({ error: "url required" }, { status: 400, headers: corsHeaders });
    }

    const wsPath = getAppWorkspacePath(userId, appId);
    await gitOps.setRemote(wsPath, repoUrl);
    await sql(`UPDATE devx.apps SET git_remote_url = $1 WHERE id = $2`, [repoUrl, appId]);

    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
