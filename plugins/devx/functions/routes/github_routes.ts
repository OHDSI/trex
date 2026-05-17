// @ts-nocheck - Deno edge function
import { encryptToken, decryptToken } from "../crypto.ts";
import { gitOps } from "../git.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";

function getClientId(): string {
  const id = Deno.env.get("GITHUB_CLIENT_ID");
  if (!id) throw new Error("GITHUB_CLIENT_ID not configured");
  return id;
}

export async function handleGithubRoutes(path, method, req, userId, sql, corsHeaders) {
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

    // Set remote in workspace
    const wsPath = getAppWorkspacePath(userId, appId);
    await gitOps.setRemote(wsPath, repo.clone_url);
    await sql(`UPDATE devx.apps SET git_remote_url = $1 WHERE id = $2`, [repo.clone_url, appId]);

    // Push
    const authUrl = repo.clone_url.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
    try {
      await gitOps.push(wsPath, authUrl);
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
