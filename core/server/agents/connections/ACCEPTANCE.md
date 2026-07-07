# Connections — live-acceptance checklist

The connections feature is fully unit-tested (loader discovery + `<name>__<tool>`
naming, `connection_search` ranking, `allow`/`block` filtering, `approval` →
`needsApproval` mapping, provider-error-continues, the OpenAPI generator over
inline specs, and the OAuth broker: signed-`state` round-trip, code→token
exchange, encrypt/store/retrieve via the DEK, refresh, park→callback→resume,
`__app__` scope, `principal_required` — see `connections/*.test.ts` and
`connections/oauth/*.test.ts`, all with fake MCP clients / inline OpenAPI specs /
mock token endpoints). What those tests **cannot** cover is a real end-to-end
round trip against a live external service, because that needs real service
endpoints, real OAuth client credentials, and a publicly reachable trex host.

This file is the manual checklist to run once such an environment is available
(the deferred "live acceptance" step — Task 10 in `specs/009-agents-connections/`,
spec §9). It exercises **one real MCP connection**, **one real OpenAPI
connection**, and **one real OAuth consent round-trip**.

## Prerequisites

- A trex host reachable from the public internet at
  `<trex-host>/plugins/<scope>/<agent>/…` (the OAuth provider redirects a browser
  back to it). A tunnel (e.g. ngrok/cloudflared) to a local stack is fine.
  `<base>` below is `<trex-host>/plugins/<scope>/<agent>/eve/v1`.
- A model credential wired for the agent (`ANTHROPIC_API_KEY` etc., or
  `TREX_AGENTS_DEFAULT_MODEL`), so a turn can actually run and call the tools.
- For the OAuth round-trip: `TREX_ROOT_KEY` set on the agent worker (gates the
  whole broker — without it the `/oauth/*` routes 404 and `trexConnect`
  connections skip), plus the connector's `client_secret_ref` env var set to the
  OAuth app's client secret.
- Authenticate as a real end user: send requests with an `x-user-id` header (the
  broker keys user-scoped tokens on it). A **channel**-initiated session cannot
  complete OAuth in v1 (see COMPAT.md limitation (a)) — use the web/session API
  path with `x-user-id`.

## Part A — MCP connection

1. **Author it.** Drop `connections/<name>.ts`:
   ```ts
   import { defineMcpClientConnection } from "eve/connections";
   export default defineMcpClientConnection({
     description: "<service> via MCP.",
     url: "<real MCP server url>",
     auth: { getToken: async () => ({ token: process.env.MCP_TOKEN! }) }, // or headers, or omit
   });
   ```
2. **Discover.** Start a session and prompt the agent to find the service's
   tools, e.g. "search your connections for a tool that can <do X>". Expect
   `connection_search` to return `<name>__<tool>` entries.
   - _Verifies:_ loader discovery, MCP connect (streamable-HTTP → SSE fallback),
     `listTools`, `<name>__<tool>` naming, `connection_search` ranking.
3. **Call.** Prompt the agent to actually use one of those tools. Expect the
   real remote result to come back in the reply.
   - _Verifies:_ static-auth header injection, `callTool`, result flattening.
4. _(optional)_ Add `tools: { allow: [...] }` (or `block`) and confirm only the
   intended tools show up; add `approval: once()` and confirm the call pauses for
   an approval (`input.requested`) before running.

## Part B — OpenAPI connection

1. **Author it** with an inline spec object (v1 supports inline object / JSON
   string only):
   ```ts
   import { defineOpenApiConnection } from "eve/connections";
   export default defineOpenApiConnection({
     description: "<service> HTTP API.",
     spec: {/* the real OpenAPI 3.x / Swagger 2.0 document */},
     baseUrl: "<real base url>", // if the spec's servers block isn't reachable as-is
     auth: { headers: { "X-Api-Key": process.env.SVC_KEY! } }, // or getToken, or omit
   });
   ```
2. **Discover + call.** Prompt the agent to use one of the generated
   `<name>__<operationId>` tools; expect a real HTTP response shaped back into the
   reply.
   - _Verifies:_ the OpenAPI generator (operation naming, param/requestBody →
     inputSchema, server-URL extraction, security placement, request building,
     response shaping), and that it tracks eve@0.19.0's algorithm on a real spec.

## Part C — OAuth consent round-trip

1. **Register a connector.** Insert an `agents.oauth_connectors` row directly via
   SQL (v1 has no connector-registration route — see COMPAT.md limitation (f))
   with the provider's `authorization_url` / `token_url` / real
   `client_id`, a `client_secret_ref` naming an env var you've set, `scopes`, and
   `principal_scope = 'user'`. Register the provider-side redirect URI as
   `<base>/oauth/<connector>/callback` at the OAuth app.
2. **Author a `trexConnect` connection** (MCP **or** OpenAPI) whose `auth` is
   `trexConnect("<connector>")`. (For a first run, OpenAPI is easier — it parks
   cleanly from cold; an oauth-gated MCP connection can only enumerate its tools
   *after* the first authorization, COMPAT.md limitation (b).)
3. **Trigger consent.** As an `x-user-id`-authenticated user, prompt the agent to
   call one of the connection's tools with **no token stored yet**. Expect:
   - a `tool.event` named `authorization.required` on the stream, carrying a
     `<base>/oauth/<connector>/start?state=…` URL, and the **turn parks**.
   - _Verifies:_ broker resolve → no token → signed-`state` mint →
     `authorization.required` + park.
4. **Authorize in a browser.** Open the `start` URL. It should 302 to the
   provider's consent screen (with `client_id`, the fixed `redirect_uri`, and the
   scopes). Approve. The provider redirects to the `callback`, which exchanges the
   code, stores the encrypted token, and shows "Authorization complete."
   - _Verifies:_ signed-state verify, fixed `redirect_uri`, code→token exchange,
     DEK-encrypted store, and — critically — that the parked turn **resumes** and
     the tool call now succeeds with the real token (the reply arrives).
5. **Second call — no consent.** Prompt the same tool again as the same user.
   Expect it to run immediately (the stored token is reused; no consent URL).
   - _Verifies:_ token reuse. If you can force an expiry (short-lived token), a
     third call should silently **refresh** via the `refresh_token` rather than
     re-prompt.
6. **Fail-closed check.** Repeat step 3 **without** an `x-user-id` (or from a
   channel session): the tool should return `principal_required` and never borrow
   another principal's token.

## Pass criteria

- Part A: MCP tools discovered + a real call returns a real result.
- Part B: OpenAPI operation tools generated + a real call returns a real
  response.
- Part C: first call parks with a consent URL; browser authorize resumes the
  parked turn and the call succeeds; a second call reuses the token with no
  consent; a no-principal call fails closed with `principal_required`.

Record the outcome (and any spec/endpoint-shape surprises — especially anything
where a real OpenAPI spec or a provider's token response diverged from what the
generator/broker assumed) back into COMPAT.md so the next pass inherits it.
