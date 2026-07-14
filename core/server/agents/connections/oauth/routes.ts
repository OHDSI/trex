// The OAuth consent routes (spec §5, §7), mounted on the agent worker at
//   GET {basePath}/eve/v1/oauth/<connector>/start?state=<signed>
//   GET {basePath}/eve/v1/oauth/<connector>/callback?code=&state=<signed>
//
// TRUST BOUNDARY — these routes are EXEMPT from the proxy's authContext/
// pluginAuthz (like channel routes; see plugin/agents.ts's
// channelAuthExemptPattern, which excludes only session|health|info|eve).
// There is NO trex JWT on a provider's browser redirect. The ONLY thing that
// authenticates a callback is the signed `state`:
//   * verifyState MUST return ok before we redirect (start) or write a token
//     (callback). A tampered/expired/forged state → 400, and the callback
//     writes NOTHING.
//   * redirect_uri is FIXED per connector (derived from the request's own
//     origin + basePath, server-side), never an attacker-supplied query param.
//   * the client secret is resolved from the connector's env-ref at exchange
//     time; an unset ref is a HARD ERROR (500, no exchange), never sent as
//     `undefined`. The secret is never logged.

import type { OAuthStore } from "./store.ts";
import type { FetchLike } from "../openapi.ts";
import { verifyState } from "./state.ts";
import { parseTokenResponse } from "./broker.ts";

export interface OAuthRouteDeps {
  /** Connector id parsed from the path. */
  connector: string;
  store: OAuthStore;
  /** HMAC secret used to verify `state`. */
  secret: string;
  /** The worker's mount prefix, used to build the FIXED callback redirect_uri. */
  basePath: string;
  /** Injectable fetch for the token exchange (tests pass a mock). */
  fetch?: FetchLike;
  /** Injectable clock (tests). */
  now?: () => number;
}

const jsonErr = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

const htmlPage = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

// The FIXED per-connector callback URL: the request's own origin + the worker's
// mount prefix. Derived server-side so it can never be an attacker-controlled
// input, and identical between start (sent to the provider) and callback (sent
// again at exchange) as the OAuth spec requires.
function callbackRedirectUri(req: Request, basePath: string, connector: string): string {
  const u = new URL(req.url);
  return `${u.origin}${basePath}/eve/v1/oauth/${encodeURIComponent(connector)}/callback`;
}

// GET …/oauth/<connector>/start?state=<signed> → 302 to the provider's
// authorization endpoint. Verifies the signed state first; nothing is minted or
// written here — it only redirects with the SAME state threaded through.
export async function handleOAuthStart(req: Request, deps: OAuthRouteDeps): Promise<Response> {
  const state = new URL(req.url).searchParams.get("state");
  if (!state) return jsonErr("missing state", 400);
  const v = await verifyState(state, deps.secret, deps.now?.());
  if (!v.ok) return jsonErr(`invalid state: ${v.reason}`, 400);
  // The signed connector must match the path — a state minted for connector A
  // can't be replayed against connector B's start route.
  if (v.payload.connector !== deps.connector) return jsonErr("state/connector mismatch", 400);

  const c = await deps.store.getConnector(deps.connector);
  if (!c) return jsonErr("unknown connector", 404);

  const redirectUri = callbackRedirectUri(req, deps.basePath, deps.connector);
  const authUrl = new URL(c.authorizationUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", c.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  if (c.scopes) authUrl.searchParams.set("scope", c.scopes);
  authUrl.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: authUrl.toString() } });
}

// GET …/oauth/<connector>/callback?code=&state=<signed> → verify state,
// exchange the code at the connector's tokenUrl, persist the token. The parked
// tool's poll (provider) then observes the token and resumes. A bad state, a
// missing code, an unset client secret, or a failed exchange all return an
// error WITHOUT writing any token.
export async function handleOAuthCallback(req: Request, deps: OAuthRouteDeps): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!state) return jsonErr("missing state", 400);
  const v = await verifyState(state, deps.secret, deps.now?.());
  // Tamper / expiry / forgery → reject BEFORE any token write.
  if (!v.ok) return jsonErr(`invalid state: ${v.reason}`, 400);
  if (v.payload.connector !== deps.connector) return jsonErr("state/connector mismatch", 400);
  if (!code) return jsonErr("missing code", 400);

  const c = await deps.store.getConnector(deps.connector);
  if (!c) return jsonErr("unknown connector", 404);
  // HARD ERROR: an unset OR empty client-secret env-ref must never be sent to
  // the IdP (neither `undefined` nor `client_secret=`). Do not proceed.
  if (!c.clientSecret) {
    console.error(`agents oauth: connector "${deps.connector}" client secret env-ref is unset or empty — refusing token exchange`);
    return jsonErr("connector misconfigured", 500);
  }

  const redirectUri = callbackRedirectUri(req, deps.basePath, deps.connector);
  const fetchFn = deps.fetch ?? ((u, i) => fetch(u, i));
  const now = deps.now?.() ?? Date.now();

  let res: Response;
  try {
    res = await fetchFn(c.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }).toString(),
    });
  } catch {
    console.error(`agents oauth: token exchange request failed for connector "${deps.connector}"`);
    return jsonErr("token exchange failed", 502);
  }
  if (!res.ok) {
    console.error(`agents oauth: token endpoint returned ${res.status} for connector "${deps.connector}"`);
    return jsonErr("token exchange rejected", 502);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return jsonErr("token exchange returned non-JSON", 502);
  }
  const token = parseTokenResponse(json, c, { now });
  if (!token) return jsonErr("token exchange returned no access_token", 502);

  // Persist under the SAME (principalType, principalId) the broker signed into
  // the state — this is exactly the key the parked poll reads.
  await deps.store.putToken(v.payload.principalType, v.payload.principalId, deps.connector, token);

  return htmlPage(
    "<!doctype html><meta charset=utf-8><title>Authorized</title>" +
      "<p>Authorization complete. You can return to your conversation.</p>",
  );
}
