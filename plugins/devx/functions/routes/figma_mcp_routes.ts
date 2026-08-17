// @ts-nocheck - Deno edge function
/**
 * Figma MCP (official remote server) authentication routes.
 *
 * Figma's remote MCP server (https://mcp.figma.com/mcp) is OAuth-only. Its
 * authorization server (https://api.figma.com) supports RFC 7591 dynamic
 * client registration + PKCE (verified live against
 * /.well-known/oauth-authorization-server), so a headless deployment can
 * complete the flow without a pre-registered app:
 *
 *   1. POST /figma-mcp/login {redirectUri}: register a client for that
 *      redirect URI (once; re-registered when the URI changes), build a PKCE
 *      auth URL, park verifier+state, return the URL. The redirect URI is the
 *      devx SETTINGS PAGE itself — the browser lands back there authenticated,
 *      so no unauthenticated callback route is needed (every devx route
 *      requires x-user-id).
 *   2. The Settings page finds ?code&state in its URL and POSTs them to
 *      /figma-mcp/exchange, which redeems the code (PKCE + client secret) and
 *      persists the tokens.
 *   3. getValidFigmaMcpToken() hands the coder a fresh access token,
 *      refreshing via refresh_token when close to expiry — same contract as
 *      claude_code_routes.ts's getValidOAuthToken.
 */

// Verified live (2026-08-17) from https://api.figma.com/.well-known/oauth-authorization-server
// and https://mcp.figma.com/.well-known/oauth-protected-resource.
export const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";
const AUTHORIZE_URL = "https://www.figma.com/oauth/mcp";
const TOKEN_URL = "https://api.figma.com/v1/oauth/token";
const REGISTER_URL = "https://api.figma.com/v1/oauth/mcp/register";
const SCOPE = "mcp:connect";

// Persisted on the trex-dx volume next to the Claude Code oauth token, so the
// connection survives container recreates.
const STATE_PATH = Deno.env.get("FIGMA_MCP_STATE_PATH") ??
  "/home/node/.claude/figma-mcp.json";

interface FigmaMcpState {
  client?: { clientId: string; clientSecret?: string; redirectUri: string };
  tokens?: { accessToken: string; refreshToken?: string; expiresAt: number };
  pending?: { verifier: string; state: string; redirectUri: string };
}

async function loadState(): Promise<FigmaMcpState> {
  try {
    return JSON.parse(await Deno.readTextFile(STATE_PATH));
  } catch {
    return {};
  }
}

async function saveState(state: FigmaMcpState): Promise<void> {
  await Deno.writeTextFile(STATE_PATH, JSON.stringify(state));
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  return { verifier, challenge, state };
}

/** Pure URL builder, unit-tested in figma_mcp_routes.test.ts. */
export function buildFigmaAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    scope: SCOPE,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    // RFC 8707 resource indicator — the MCP spec requires binding the grant
    // to the resource server.
    resource: FIGMA_MCP_URL,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function registerClient(redirectUri: string) {
  const resp = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "D2E devx coding agent",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: SCOPE,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Figma client registration failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }
  const reg = await resp.json();
  if (!reg.client_id) throw new Error("Figma client registration returned no client_id");
  return { clientId: reg.client_id, clientSecret: reg.client_secret, redirectUri };
}

/**
 * Return a non-expired Figma MCP access token, refreshing when within `skewMs`
 * of expiry. Returns null when not connected. On refresh failure, falls back
 * to the stored token (surfaces as a 401 at the MCP server → reconnect).
 */
export async function getValidFigmaMcpToken(skewMs = 60_000): Promise<string | null> {
  const state = await loadState();
  const tokens = state.tokens;
  if (!tokens?.accessToken) return null;
  if (tokens.expiresAt - skewMs > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken || !state.client) return tokens.accessToken;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: state.client.clientId,
      resource: FIGMA_MCP_URL,
    });
    if (state.client.clientSecret) body.set("client_secret", state.client.clientSecret);
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      console.error("[figma-mcp] token refresh failed:", resp.status, (await resp.text()).slice(0, 300));
      return tokens.accessToken;
    }
    const t = await resp.json();
    state.tokens = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
    };
    await saveState(state);
    console.log("[figma-mcp] access token refreshed; expires in", t.expires_in || 3600, "s");
    return state.tokens.accessToken;
  } catch (err) {
    console.error("[figma-mcp] token refresh error:", err?.message || String(err));
    return tokens.accessToken;
  }
}

export async function handleFigmaMcpRoutes(
  path: string,
  method: string,
  req: Request,
  _userId: string,
  _sql: unknown,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // GET /figma-mcp/status
  if (path.endsWith("/figma-mcp/status") && method === "GET") {
    const state = await loadState();
    return Response.json({
      connected: !!state.tokens?.accessToken,
      expiresAt: state.tokens?.expiresAt ?? null,
      clientRegistered: !!state.client,
    }, { headers: corsHeaders });
  }

  // POST /figma-mcp/login {redirectUri} → { authUrl }
  if (path.endsWith("/figma-mcp/login") && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const redirectUri = body.redirectUri;
      if (!redirectUri || !/^https?:\/\//.test(redirectUri)) {
        return Response.json(
          { error: "redirectUri (the settings page URL) is required" },
          { status: 400, headers: corsHeaders },
        );
      }
      const state = await loadState();
      if (!state.client || state.client.redirectUri !== redirectUri) {
        state.client = await registerClient(redirectUri);
      }
      const { verifier, challenge, state: oauthState } = await generatePkce();
      state.pending = { verifier, state: oauthState, redirectUri };
      await saveState(state);
      return Response.json({
        authUrl: buildFigmaAuthUrl({
          clientId: state.client.clientId,
          redirectUri,
          state: oauthState,
          challenge,
        }),
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /figma-mcp/exchange {code, state} — the settings page relays the
  // params Figma appended to its URL after the user approved.
  if (path.endsWith("/figma-mcp/exchange") && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const stored = await loadState();
      if (!stored.pending || !stored.client) {
        return Response.json({ error: "No pending Figma login. Start the login flow first." }, { status: 400, headers: corsHeaders });
      }
      if (!body.code || body.state !== stored.pending.state) {
        return Response.json({ error: "State mismatch or missing code." }, { status: 400, headers: corsHeaders });
      }
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        redirect_uri: stored.pending.redirectUri,
        client_id: stored.client.clientId,
        code_verifier: stored.pending.verifier,
        resource: FIGMA_MCP_URL,
      });
      if (stored.client.clientSecret) params.set("client_secret", stored.client.clientSecret);
      const resp = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error("[figma-mcp] token exchange failed:", resp.status, text.slice(0, 300));
        return Response.json({ error: `Token exchange failed (${resp.status})` }, { status: 500, headers: corsHeaders });
      }
      const t = await resp.json();
      stored.tokens = {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
      };
      delete stored.pending;
      await saveState(stored);
      return Response.json({ connected: true }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /figma-mcp/logout — drop tokens, keep the registered client.
  if (path.endsWith("/figma-mcp/logout") && method === "POST") {
    const state = await loadState();
    delete state.tokens;
    delete state.pending;
    await saveState(state);
    return Response.json({ connected: false }, { headers: corsHeaders });
  }

  return null;
}
