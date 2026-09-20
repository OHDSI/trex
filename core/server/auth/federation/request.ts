// Request-shaping helpers for the relying-party routes: where a browser may be
// sent back to, what redirect_uri the upstream sees, and how a refusal reaches
// the login page.
//
// The state helpers that used to live here are gone with state.ts: single use,
// expiry and the browser binding are @better-auth/sso's now (see router.ts).
//
// Separate from router.ts, which imports express, because express drags in
// @types/node and this deployment's node_modules does not declare it — a test
// that imported router.ts would fail to type-check before running a single
// assertion. These are pure functions of their input either way, which is how
// the rest of federation/ is organised (see config.ts).

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
 * The redirect_uri the upstream sees, which must be byte-identical in the
 * authorization request and in the token exchange or the provider rejects the
 * code.
 *
 * Configuration wins over the request, for the same reason the OIDC provider
 * derives its issuer from `TREX_OIDC_ISSUER` rather than from Host: a proxied
 * or spoofed `X-Forwarded-Host` would otherwise vary the value per caller. The
 * header fallback keeps a single-host deployment working with no extra
 * configuration; anything behind a proxy it does not control should set
 * `TREX_FEDERATION_REDIRECT_URI` to the URI registered at the provider.
 */
export function callbackUri(
  // deno-lint-ignore no-explicit-any
  req: any,
  basePath: string,
  configured: string | undefined = Deno.env.get("TREX_FEDERATION_REDIRECT_URI"),
): string {
  if (configured && configured.length > 0) return configured;
  // Either header can arrive repeated or as a list ("https, http"); the first
  // entry is what the outermost proxy saw, i.e. what the browser used.
  const first = (v: unknown): string | undefined => {
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" ? s.split(",")[0].trim() : undefined;
  };
  // req.protocol before the "https" default: on a plain-HTTP deployment with no
  // proxy header, defaulting to https produces a redirect_uri the provider has
  // not registered and the sign-in fails with nothing to point at. Express
  // derives req.protocol from the connection, and from X-Forwarded-Proto itself
  // once `trust proxy` is set.
  const proto = first(req.headers["x-forwarded-proto"]) ?? first(req.protocol) ?? "https";
  const host = first(req.headers["x-forwarded-host"]) ?? first(req.headers.host);
  return `${proto}://${host}${basePath}/auth/v1/callback`;
}

/**
 * An upstream error code, echoed back only when it is a bounded token. The
 * provider chooses this text, and it lands in a JSON body a browser renders.
 */
export function safeErrorCode(raw: unknown): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return typeof s === "string" && /^[a-z_]{1,64}$/.test(s) ? s : "upstream_error";
}

/**
 * Where a refused federated sign-in sends the browser: back to the deployment's
 * login page, which can explain the refusal, instead of a bare JSON body. The
 * code is one of trex's fixed refusal strings; the return path goes through
 * safeRedirectTo so the login page cannot be used to leave the origin.
 */
export function refusalRedirect(login: string | null, code: string, redirectTo: string): string | null {
  if (!login) return null;
  const url = new URL(login);
  url.searchParams.set("error", code);
  url.searchParams.set("return_to", safeRedirectTo(redirectTo));
  return url.toString();
}
