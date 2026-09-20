// Why an RP-initiated logout that carried an `id_token_hint` did not act on it,
// said out loud.
//
// THE CAUSE, located rather than guessed. `verifyLogoutHint` resolves the key
// set over HTTP from the provider's own public issuer:
//
//   jwksFetch: jwtPluginOptions?.jwks?.remoteUrl
//     ?? `${ctx.context.baseURL}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`
//   (@better-auth/oauth-provider@1.7.5 dist/authorize-riRRCSbC.mjs:547)
//
// while the two sibling call sites that need the same key set — the JWT access
// token validator (:2245) and `revokeJwtAccessToken` (:3436) — pass a FUNCTION
// that reads it locally (`jwtPlugin.endpoints.getJwks(ctx)`) and never leave the
// process. :547 is the odd one out, and the round trip it makes is the whole
// failure: on a local stack the issuer is `https://localhost:41100/...`, which
// from inside the container is the container's own loopback, so the fetch is
// refused before TLS is even reached. `extra_hosts` cannot redirect it,
// because glibc special-cases `localhost` (RFC 6761).
//
// AND THE OBVIOUS WORKAROUND IS A TRAP. `jwks.remoteUrl` is what :547 prefers,
// so pointing it at a container-local address would make the hint verifiable —
// and would also:
//   1. rewrite the advertised `jwks_uri` in the discovery document to that
//      internal address (`jwks_uri: opts?.jwks?.remoteUrl ?? …`,
//      dist/authorize-riRRCSbC.mjs:695), publishing an unreachable plaintext
//      URL to every relying party; and
//   2. make trex stop serving its own key set at all — the jwt plugin's JWKS
//      route answers 404 whenever remoteUrl is set
//      (better-auth@1.7.5 dist/plugins/jwt/index.mjs:116).
// Both were read off the pinned packages. So there is no configuration that
// fixes the fetch without breaking discovery, and trex does not set it.
//
// What is left is to stop the failure being SILENT. To a browser it is
// invisible today: a hint the provider could not verify produces the same
// "Confirm logout" page as no hint at all, so a user who was supposed to be
// returned to their application just sees a button. This module is what makes
// the difference observable — in the log, in a response header, and on the page
// itself.

/** The cookie the provider sets exactly when it decides to ask for confirmation. */
const LOGOUT_CONFIRMATION_COOKIE_SUFFIX = ".oauth_logout_confirmation";

/** The marker the provider puts on its confirmation form, and nowhere else. */
const CONFIRMATION_FORM_MARKER = "data-oidc-logout-confirmation";

/**
 * Whether the provider declined to act on a hint that was supplied.
 *
 * Two outcomes, because the endpoint answers a browser and an API caller
 * differently for the same refusal (dist/authorize-riRRCSbC.mjs:661-663):
 *
 * - a browser navigation with a live session gets the confirmation page, and
 *   the confirmation cookie is the only thing that distinguishes it from the
 *   success page — both are 200 HTML;
 * - anything else gets 401 `The id_token_hint is invalid`.
 *
 * A verified hint takes neither path: it deletes the session and redirects to
 * the registered post-logout URI (:666-675).
 */
export function logoutHintWasRejected(status: number, setCookies: string[]): boolean {
  if (status === 401) return true;
  return setCookies.some((c) => c.split("=")[0]?.includes(LOGOUT_CONFIRMATION_COOKIE_SUFFIX));
}

export type HintVerdict = "signature-valid" | "signature-invalid" | "unverifiable";

/**
 * What to say about it, in one line, keyed on what trex could prove locally.
 *
 * `signature-valid` is the diagnostic that matters: trex verified the very
 * token the provider could not, against the very key set the provider was
 * trying to fetch — which leaves the fetch as the only difference between them.
 * That sentence is the difference between "your certificate is wrong" (the
 * first guess, and wrong) and a one-line reproduction.
 */
export function logoutHintDiagnosis(verdict: HintVerdict): string {
  switch (verdict) {
    case "signature-valid":
      return "the id_token_hint is genuine — trex verified it against its own key set — so the " +
        "provider's refusal is its own JWKS fetch failing, not a bad token. " +
        "@better-auth/oauth-provider resolves the key set over HTTP from the public issuer " +
        "(dist/authorize-riRRCSbC.mjs:547) instead of reading it locally as its two sibling " +
        "call sites do, and a deployment whose public origin is not reachable from inside the " +
        "container — every stack whose FQDN is `localhost` — cannot answer that fetch. " +
        "Logout still completes if the user presses Confirm; the hint's redirect does not.";
    case "signature-invalid":
      return "the id_token_hint did not verify against trex's own key set either, so the " +
        "relying party sent a token this provider did not issue, or one signed by a key that " +
        "has since been rotated out.";
    case "unverifiable":
      return "trex could not check the id_token_hint itself, so the cause is undetermined. " +
        "The usual cause is the provider's own JWKS fetch: it resolves the key set over HTTP " +
        "from the public issuer, so a deployment whose issuer names a host the container " +
        "cannot reach itself — `localhost`, or a public FQDN with no route from inside — has " +
        "that fetch refused before TLS is reached, and every id_token_hint is rejected.";
  }
}

/**
 * Puts the diagnosis on the confirmation page.
 *
 * Inserted rather than replacing the page: the Confirm button still works and
 * still logs the user out, and taking that away to make a point would be a
 * regression. Anchored on the provider's own form marker so it cannot land on
 * the success page or on an error page by accident, and a no-op if the markup
 * ever moves — a missing banner is a smaller problem than a corrupted page.
 */
export function annotateLogoutConfirmation(html: string, verdict: HintVerdict): string {
  if (!html.includes(CONFIRMATION_FORM_MARKER)) return html;
  const notice = `<p data-trex-logout-hint="${verdict}"><strong>The sign-out request from the ` +
    `application could not be completed automatically.</strong> You were asked to confirm ` +
    `because this server could not verify the token the application sent. Pressing Confirm ` +
    `still signs you out, but you will not be returned to the application automatically.</p>`;
  return html.replace("</main>", `${notice}</main>`);
}

/**
 * The `id_token_hint` as the endpoint itself reads it: query OR body
 * (dist/authorize-riRRCSbC.mjs:635-640). Reading only the query would report
 * "no hint" for every POST logout.
 *
 * The body is the buffer readBody already produced, not `req.body`: this mount
 * sits in FRONT of trex's body middleware, so nothing has parsed it.
 */
export function hintFromRequest(url: string, body: Buffer | undefined): string | null {
  const fromQuery = new URL(url, "http://localhost").searchParams.get("id_token_hint");
  if (fromQuery) return fromQuery;
  if (!body) return null;
  const fromBody = new URLSearchParams(body.toString("utf8")).get("id_token_hint");
  return fromBody && fromBody.length > 0 ? fromBody : null;
}
