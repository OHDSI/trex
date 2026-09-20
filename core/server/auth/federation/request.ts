// Request-shaping helpers for the relying-party routes: where a browser may be
// sent back to, and what an upstream's own error code is allowed to say.
//
// The state helpers that used to live here are gone with state.ts: single use,
// expiry and the browser binding are @better-auth/sso's now (see router.ts).
//
// Two more went at the cutover:
//
//  - callbackUri derived the redirect_uri from the request when
//    TREX_FEDERATION_REDIRECT_URI was unset. The plugin takes one fixed value
//    at construction and has no request to derive anything from, so the
//    configured half is sso-config.ts's federationRedirectUri and the header
//    fallback is gone: a federating deployment must now state the variable.
//    environment.md says so and federationRedirectUri throws naming it.
//  - refusalRedirect built the login-page URL a refusal landed on. router.ts
//    builds the same URL one hop earlier as the plugin's errorCallbackURL —
//    same login URL, same kept query, same safeRedirectTo'd return_to — and
//    reproduces the null-login-URL JSON body through REFUSAL_SENTINEL_PATH.
//    router.test.ts drives all four cases over HTTP.
//
// Separate from router.ts, which imports express, because express drags in
// @types/node and this deployment's node_modules does not declare it — a test
// that imported router.ts would fail to type-check before running a single
// assertion. These are pure functions of their input either way, which is how
// the rest of federation/ is organised (see flags.ts).

/**
 * Only same-origin paths are honoured: an absolute URL here would turn the
 * callback into an open redirect, and `//host` is absolute despite looking
 * relative. Mirrors d2e's login page rule.
 *
 * Two cases beyond the plain `//` check, both of which a browser resolves to an
 * authority rather than a path: a backslash in the authority position
 * (`/\evil.test` — WHATWG URL treats `\` as `/` there), and control characters,
 * which are stripped before parsing and so can re-form `//host` out of a string
 * that passed a naive prefix test.
 */
export function safeRedirectTo(raw: string | undefined): string {
  // typeof rather than a truthiness check alone: express hands back an array
  // for a repeated query parameter (?redirect_to=a&redirect_to=b), and the
  // callers' `as string` would otherwise reach .startsWith on an array.
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  if (raw.length > 1 && (raw[1] === "/" || raw[1] === "\\")) return "/";
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f]/.test(raw)) return "/";
  return raw;
}

/**
 * An upstream error code, echoed back only when it is a bounded token. The
 * provider chooses this text, and it lands in a JSON body a browser renders.
 */
export function safeErrorCode(raw: unknown): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return typeof s === "string" && /^[a-z_]{1,64}$/.test(s) ? s : "upstream_error";
}
