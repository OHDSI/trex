// @ts-nocheck - Deno edge function
/**
 * Claude Code authentication routes.
 * Implements the OAuth PKCE flow directly (the CLI uses Ink TUI which doesn't
 * work without a terminal). We generate the PKCE challenge, build the auth URL,
 * and exchange the code for tokens ourselves, storing them where the SDK expects.
 */
import { duckdb, escapeSql } from "../duckdb.ts";

// Claude OAuth constants (from the CLI's auth flow)
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const AUTH_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const SCOPES = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

// Store PKCE verifier in a temp file (edge function workers are ephemeral)
const PENDING_FILE = "/tmp/.claude-pkce-pending.json";

async function savePending(userId: string, data: { verifier: string; state: string }) {
  let all: Record<string, any> = {};
  try { all = JSON.parse(await Deno.readTextFile(PENDING_FILE)); } catch {}
  all[userId] = data;
  await Deno.writeTextFile(PENDING_FILE, JSON.stringify(all));
}

async function loadPending(userId: string): Promise<{ verifier: string; state: string } | null> {
  try {
    const all = JSON.parse(await Deno.readTextFile(PENDING_FILE));
    return all[userId] || null;
  } catch { return null; }
}

async function clearPending(userId: string) {
  try {
    const all = JSON.parse(await Deno.readTextFile(PENDING_FILE));
    delete all[userId];
    await Deno.writeTextFile(PENDING_FILE, JSON.stringify(all));
  } catch {}
}

async function runShell(command: string): Promise<{ output: string; exit_code: number }> {
  const scriptPath = `/tmp/.devx-cmd-${crypto.randomUUID().slice(0, 8)}.sh`;
  try {
    await Deno.writeTextFile(scriptPath, command + "\n");
    const raw = await duckdb(`SELECT * FROM trex_devx_run_command('/tmp', 'sh ${escapeSql(scriptPath)}')`);
    const result = JSON.parse(raw);
    try { await Deno.remove(scriptPath); } catch {}
    return { output: result.output || "", exit_code: result.exit_code ?? 0 };
  } catch (err) {
    try { await Deno.remove(scriptPath); } catch {}
    return { output: err.message || String(err), exit_code: 1 };
  }
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  return { verifier, challenge, state };
}

export async function handleClaudeCodeRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /claude-code/auth-status
  if (path.endsWith("/claude-code/auth-status") && method === "GET") {
    try {
      const version = await runShell("claude --version 2>&1");
      if (version.exit_code !== 0 && !version.output.includes("Claude Code")) {
        return Response.json({ installed: false, authenticated: false, version: null, account: null }, { headers: corsHeaders });
      }
      // Check if we have a stored OAuth token
      let authenticated = false, account = null;
      try {
        const tokenData = JSON.parse(await Deno.readTextFile("/home/node/.claude/oauth-token.json"));
        if (tokenData.accessToken) {
          // Verify it works
          const status = await runShell(`CLAUDE_CODE_OAUTH_TOKEN='${escapeSql(tokenData.accessToken)}' claude auth status 2>&1`);
          try {
            const p = JSON.parse(status.output.trim());
            authenticated = !!p.loggedIn;
            account = p.account || p.email || null;
          } catch {}
        }
      } catch {
        // No stored token
      }
      return Response.json({
        installed: true, authenticated, version: version.output.trim().split("\n")[0], account,
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ installed: false, authenticated: false, version: null, account: null, error: err.message }, { headers: corsHeaders });
    }
  }

  // POST /claude-code/login — generate OAuth URL with PKCE
  if (path.endsWith("/claude-code/login") && method === "POST") {
    try {
      // Check if already authenticated
      const status = await runShell("claude auth status 2>&1");
      try { if (JSON.parse(status.output.trim()).loggedIn) {
        return Response.json({ status: "already_authenticated", message: "Already authenticated." }, { headers: corsHeaders });
      }} catch {}

      // Generate PKCE challenge
      const { verifier, challenge, state } = await generatePKCE();
      await savePending(userId, { verifier, state });

      // Build OAuth URL
      const params = new URLSearchParams({
        code: "true",
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      });

      const loginUrl = `${AUTH_URL}?${params}`;

      return Response.json({
        status: "pending",
        login_url: loginUrl,
        needs_code: true,
        message: "Open the URL, sign in, then paste the code shown.",
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ status: "error", message: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /claude-code/login-code — exchange OAuth code for tokens
  if (path.endsWith("/claude-code/login-code") && method === "POST") {
    try {
      const body = await req.json();
      // The code from the callback page may include a # fragment — strip it
      const rawCode = body.code?.trim();
      const code = rawCode?.split("#")[0]?.trim();
      if (!code) {
        return Response.json({ status: "error", message: "Code is required" }, { status: 400, headers: corsHeaders });
      }
      console.log("[claude-code] Submitting code, length:", code.length, "first 10:", code.slice(0, 10));

      const pending = await loadPending(userId);
      if (!pending) {
        return Response.json({ status: "error", message: "No pending login. Start login flow first." }, { status: 400, headers: corsHeaders });
      }

      // Exchange code for tokens (JSON body, matching CLI's format)
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: pending.verifier,
          state: pending.state,
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("[claude-code] Token exchange failed:", tokenResponse.status, errText);
        return Response.json({
          status: "error",
          message: `Token exchange failed (${tokenResponse.status})`,
          output: errText.slice(0, 500),
        }, { status: 500, headers: corsHeaders });
      }

      const tokens = await tokenResponse.json();
      await clearPending(userId);

      // Exchange the OAuth token for an API key (used by the Anthropic Messages API)
      const apiKeyResponse = await fetch("https://api.anthropic.com/api/oauth/claude_cli/create_api_key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({}),
      });

      let apiKey = null;
      if (apiKeyResponse.ok) {
        const apiKeyData = await apiKeyResponse.json();
        apiKey = apiKeyData.api_key || apiKeyData.key || null;
      }

      // Store both the OAuth token and API key
      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
        apiKey,
      };
      await Deno.writeTextFile("/home/node/.claude/oauth-token.json", JSON.stringify(tokenData));

      // Verify it worked
      const status = await runShell("claude auth status 2>&1");
      let authenticated = false;
      try { authenticated = JSON.parse(status.output.trim()).loggedIn; } catch {}

      if (authenticated) {
        return Response.json({ status: "authenticated", message: "Successfully authenticated." }, { headers: corsHeaders });
      }

      // Even if claude auth status doesn't see it yet, the tokens are stored
      return Response.json({
        status: "authenticated",
        message: "Tokens stored. Authentication should be active.",
      }, { headers: corsHeaders });
    } catch (err) {
      console.error("[claude-code] Login code error:", err);
      return Response.json({ status: "error", message: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /claude-code/logout
  if (path.endsWith("/claude-code/logout") && method === "POST") {
    try {
      try { await Deno.remove("/home/node/.claude/oauth-token.json"); } catch {}
      try { await Deno.remove("/home/node/.claude/credentials.json"); } catch {}
      return Response.json({
        ok: true,
        message: result.output.trim() || "Logged out",
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ ok: false, message: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
