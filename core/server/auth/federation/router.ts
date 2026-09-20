// The federation relying-party endpoints, served from @better-auth/sso.
//
// These are NOT the OIDC provider's /authorize (that lives under
// `${BASE_PATH}/oidc` and faces the other way, serving relying parties such as
// WebAPI). These send the browser OUT to an upstream identity provider and
// receive it back, then issue exactly the session the native password grant
// issues — so from the moment /callback finishes the request is
// indistinguishable from a native login, and neither the OIDC provider nor any
// relying party needs to know federation exists.
//
// Both paths, both methods and both refusal envelopes are unchanged. What is
// gone is everything behind them: state, PKCE, discovery, id_token
// verification and single-use enforcement are the plugin's now.
//
//  - the self-contained encrypt-then-MAC `state` is replaced by the plugin's
//    database state strategy, which better-auth picks by default whenever a
//    database is configured (context/create-context.mjs:137). The payload goes
//    into trexdb.verification and the opaque `state` value into a SIGNED
//    cookie;
//  - that signed cookie IS what `__Host-trex_federation` was: the callback
//    compares it against the state it was handed (better-auth
//    dist/state.mjs:132-136) and refuses a browser that did not start the
//    flow. `account.skipStateCookieCheck` would switch that comparison off and
//    is deliberately left unset — router.test.ts pins that;
//  - the per-process replay map is replaced by
//    deleteVerificationByIdentifier(state) (dist/state.mjs:139), which is
//    strictly stronger: the row is gone for every replica, not only for the
//    process that happened to see the first use;
//  - STATE_TTL_SECONDS is replaced by `expiresAt` inside the stored payload
//    (:141), and PKCE S256 by `oidcConfig.pkce: true` per provider.
//
// "Exactly the session" is two cookies and not one, and the claim above was
// false for as long as it was one: sb-access-token is measured to be no
// session at all at /oauth2/authorize, which reads Better Auth's own cookie
// and nothing else. Both are still set — the engine's by the plugin's own
// Set-Cookie headers, which /callback forwards, and sb-access-token by
// createTokenResponse.
import { Router } from "express";
import { isAPIError } from "better-auth/api";
import { authLimiter } from "../../middleware/rate-limit.ts";
import { auth } from "../better-auth.ts";
import { createTokenResponse } from "../auth-router.ts";
import { loginUrl } from "../oidc/config.ts";
import { federationEnabled } from "./config.ts";
import { federationRedirectUri } from "./sso-config.ts";
import { callbackUri, refusalRedirect, safeErrorCode, safeRedirectTo } from "./request.ts";

// Re-exported so these read as one unit from outside; request.ts exists only to
// keep express out of the unit tests' module graph.
export { callbackUri, refusalRedirect, safeErrorCode, safeRedirectTo };

// deno-lint-ignore no-explicit-any
type Req = any;
// deno-lint-ignore no-explicit-any
type Res = any;

/**
 * Where /authorize points the plugin when this deployment has configured no
 * login page, and the one thing /callback needs in order to tell a refusal it
 * must render as JSON from one it must redirect.
 *
 * refusalRedirect answers `null` without a login URL, and the pre-cutover
 * callback then replied with a JSON body rather than redirecting. The plugin
 * has no such mode — it always appends `?error=` to a URL and redirects — so
 * the JSON refusal is reproduced by pointing it at a path that is mounted
 * nowhere and recognising that path on the way back. Nothing is ever served
 * here and no browser ever reaches it.
 */
const REFUSAL_SENTINEL_PATH = "/__trex_federation_refused";

/**
 * The refusals that mean "this callback did not start in this browser", which
 * the pre-cutover route answered with a 401 body rather than by sending the
 * browser anywhere.
 *
 * All four come out of parseState/handleOIDCCallback rather than out of trex's
 * policy, and between them they cover every successor to the binding cookie and
 * the replay map: a missing or mismatched signed state cookie and a rotated
 * provider are `state_mismatch`/`invalid_state`, a redeemed or expired state is
 * `state_mismatch` (its verification row is gone), an absent one is
 * `state_not_found` and an undecryptable one is `state_invalid`.
 *
 * Kept as a body and not a redirect deliberately. These are the codes an
 * attacker can cause on a victim's browser, and the login page is the one place
 * that victim would be inclined to re-enter credentials; the pre-cutover route
 * never sent them there and neither does this.
 */
const STATE_REFUSAL_CODES = new Set([
  "state_mismatch",
  "state_not_found",
  "state_invalid",
  "invalid_state",
]);

/**
 * The headers the forwarded callback carries into the engine: the cookies, and
 * an address.
 *
 * The address is not a nicety. Better Auth's limiter keys on
 * `createRateLimitKey(getIP(req, options), path)` and `getIP` reads
 * `x-forwarded-for` and nothing else (@better-auth/core utils/ip.mjs:203-219).
 * A Request without one resolves to no IP, and every caller in the process then
 * shares the single key `no-trusted-ip|/sso/callback`
 * (api/rate-limiter/index.mjs:232-245) at the engine's default of 100 requests
 * per 10 seconds — so roughly ten junk GETs a second, from anywhere, with no
 * cookie and no valid state, locked out every federated user of the
 * installation. Nothing in the response said so: a 429 from the engine reaches
 * the browser as this route's generic 401. Pre-cutover there was no ceiling at
 * all, because the route never called auth.handler.
 *
 * `req.ip`, not the raw `x-forwarded-for` header, and the distinction is the
 * whole security of it. With no `trustedProxies` configured Better Auth trusts
 * a single-value forwarded header outright (utils/ip.mjs:190-194), so passing
 * the client's own header through would let any caller mint a fresh bucket per
 * request and hand the DoS straight back. `req.ip` is express's resolution
 * under `trust proxy`, which index.ts:72 pins to one hop by default — the same
 * value trex's own authLimiter buckets on, so the two limiters cannot disagree
 * about who is calling.
 */
function engineHeaders(req: Req): Headers {
  const headers = new Headers({ cookie: req.headers.cookie ?? "" });
  // Single-valued deliberately: getIPFromHeader refuses a chain it cannot
  // attribute (`forwardedIps.length !== 1`) and falls back to the shared
  // bucket, which is the state being fixed.
  if (typeof req.ip === "string" && req.ip.length > 0) {
    headers.set("x-forwarded-for", req.ip);
  }
  return headers;
}

/** The plugin's own shared callback, in this process rather than over HTTP. */
function pluginCallbackUrl(baseURL: string): URL {
  // better-call routes on `new URL(ctx.baseURL).pathname`, so the path is built
  // from the engine's OWN resolved base URL rather than from the issuer: a
  // trailing slash, or a base path the engine normalised differently, would
  // route to nothing and 404 every federated sign-in.
  return new URL(`${baseURL.replace(/\/+$/, "")}/sso/callback`);
}

export function registerFederationRoutes(
  // deno-lint-ignore no-explicit-any
  app: any,
  basePath: string,
  // deno-lint-ignore no-explicit-any
  pool: any,
): void {
  if (!federationEnabled()) return;
  const router = Router();

  router.get("/authorize", authLimiter, async (req: Req, res: Res) => {
    const providerId = String(req.query.provider ?? "");
    try {
      // trex's own gate, and it stays AT /authorize rather than moving to the
      // resolver. The plugin has no hook on /sign-in/sso, so resolveUser's
      // `enabled` check fires only at the callback — which is after the person
      // has already authenticated upstream. An operator who disables a provider
      // during an incident means "stop offering this", not "let them sign in
      // upstream and then say no". The pre-cutover route refused here too:
      // loadProviders selected `WHERE enabled = true AND issuer IS NOT NULL`,
      // so a disabled or half-configured row was already "Unknown provider",
      // which is why that envelope is what this returns. Both gates are kept;
      // neither is sufficient alone.
      const { rows } = await pool.query(
        `SELECT 1 FROM trexdb.sso_provider
          WHERE id = $1 AND enabled = true AND issuer IS NOT NULL`,
        [providerId],
      );
      if (rows.length === 0) {
        res.status(400).json({ error: "invalid_request", error_description: "Unknown provider" });
        return;
      }

      const returnTo = safeRedirectTo(req.query.redirect_to as string | undefined);
      // The origin the upstream sends the browser back to, i.e. the redirect
      // URI registered at the provider. The throwing form on purpose: a
      // federating deployment that has not set it would otherwise send an
      // unregistered redirect_uri and fail at the upstream with nothing to
      // point at.
      const origin = new URL(federationRedirectUri()).origin;
      // The plugin appends ?error=<code> (and error_description) to
      // errorCallbackURL on every refusal (@better-auth/sso
      // dist/index.mjs:3804-3810), so the return path is put on it here. That
      // reproduces refusalRedirect's output — the login URL, its own query
      // parameters kept, plus error and return_to — without a second redirect.
      const login = loginUrl();
      const errorCallbackURL = new URL(login ?? `${origin}${REFUSAL_SENTINEL_PATH}`);
      errorCallbackURL.searchParams.set("return_to", returnTo);

      const started = await auth.api.signInSSO({
        body: {
          providerId,
          callbackURL: `${origin}${returnTo}`,
          errorCallbackURL: errorCallbackURL.toString(),
        },
        returnHeaders: true,
      });
      // The signed state cookie IS the browser binding: the callback refuses
      // when it does not match the state it was handed. Forwarding these
      // headers is not optional.
      for (const cookie of started.headers.getSetCookie()) res.append("Set-Cookie", cookie);
      res.redirect(302, started.response.url);
    } catch (err) {
      // The detail stays in the log: a discovery fetch, a database error or a
      // key derivation can name internal hosts, and this response goes to a
      // browser.
      console.error("[federation] /authorize failed:", err);
      if (res.headersSent) return;
      // Branch rather than collapse every throw into 400. signInSSO answers
      // NOT_FOUND for a providerId no row matches (dist/index.mjs:3687) — that
      // is the case the d2e login page distinguishes from a server error.
      // Everything else it raises is a server-side fault dressed as a 4xx: a
      // missing BETTER_AUTH_TRUSTED_ORIGINS entry, for one, arrives here as a
      // BAD_REQUEST out of mapDiscoveryErrorToAPIError, and reporting that as
      // "Unknown provider" would send an operator to the provider row instead
      // of to the variable. Those keep the pre-cutover 500.
      if (isAPIError(err) && err.statusCode === 404) {
        res.status(400).json({ error: "invalid_request", error_description: "Unknown provider" });
        return;
      }
      res.status(500).json({
        error: "server_error",
        error_description: "Federated sign-in could not be started",
      });
    }
  });

  router.get("/callback", authLimiter, async (req: Req, res: Res) => {
    try {
      const ctx = await auth.$context;
      // The upstream redirects here because this is the redirect_uri every
      // provider has registered; the plugin's own handler lives at
      // ${baseURL}/sso/callback and reads the providerId out of the state
      // (dist/index.mjs:4164-4193). Forwarding rather than re-registering keeps
      // d2e's Logto, its Helm values and its ENV_YML secret untouched.
      const target = pluginCallbackUrl(ctx.baseURL);
      target.search = new URL(req.originalUrl, target.origin).search;
      const handled = await auth.handler(
        new Request(target, { headers: engineHeaders(req) }),
      );

      const location = handled.headers.get("location");
      // Set-Cookie repeats legitimately and Headers folds repeats into one
      // comma-joined value, which turns two cookies into one unparseable one.
      // getSetCookie is the only reader that keeps them apart.
      const setCookies = handled.headers.getSetCookie();
      for (const cookie of setCookies) res.append("Set-Cookie", cookie);
      if (!location) {
        res.status(401).json({
          error: "invalid_request",
          error_description: "Federated sign-in failed",
        });
        return;
      }

      const landing = new URL(location, ctx.baseURL);
      const refusal = landing.searchParams.get("error");
      if (refusal !== null) {
        // A refusal already carries ?error= on the URL /authorize supplied, so
        // it is passed through untouched rather than re-derived — except for
        // the two landings no browser should be sent to.
        if (STATE_REFUSAL_CODES.has(refusal)) {
          res.status(401).json({
            error: "invalid_request",
            error_description: "This sign-in did not start in this browser",
          });
          return;
        }
        if (landing.pathname === REFUSAL_SENTINEL_PATH) {
          // No login page is configured, so there is nothing to redirect to
          // that could explain this. Same envelope the pre-cutover route used
          // when refusalRedirect returned null.
          res.status(403).json({
            error: "access_denied",
            error_description: safeErrorCode(refusal),
          });
          return;
        }
        if (landing.pathname === new URL(`${ctx.baseURL.replace(/\/+$/, "")}/error`).pathname) {
          // The engine's default error page, which oidc/mount.ts 404s. It is
          // reached only when the failure happened before any per-flow errorURL
          // was recovered, so there is no login page to send anyone to that was
          // chosen by this flow. Generic body, same as any other failed
          // exchange.
          res.status(401).json({
            error: "invalid_request",
            error_description: "Federated sign-in failed",
          });
          return;
        }
        // The upstream chooses the text of `error` and `error_description` when
        // it is the upstream that declined (dist/index.mjs:3807), and the
        // plugin appends both verbatim. Neither is trex's to put on its own
        // login page: refusalRedirect set a bounded `error` and no description
        // at all, and that is what is rebuilt here. A trex or plugin code is a
        // bounded token already and passes through unchanged.
        landing.searchParams.set("error", safeErrorCode(refusal));
        landing.searchParams.delete("error_description");
        res.redirect(302, landing.toString());
        return;
      }

      // Issue exactly the session the password grant issues: it sets the
      // sb-access-token cookie same-origin iframes read. Better Auth's own
      // session cookie is already on the response — the plugin's
      // setSessionCookie put it there and the loop above forwarded it — and
      // that is the one /oauth2/authorize authenticates against, so the two
      // cookies the pre-cutover route set by hand are both still set.
      const session = await auth.api.getSession({
        headers: new Headers({
          cookie: setCookies.map((c) => c.split(";")[0]).join("; "),
        }),
      });
      if (!session?.user) throw new Error("federated sign-in produced no session");
      // The columns createTokenResponse's DbUser needs, named rather than
      // SELECT *: the session it signs is built out of this row.
      const { rows } = await pool.query(
        `SELECT id, name, email, image, role, banned, "emailVerified", email_confirmed_at,
                last_sign_in_at, "mustChangePassword", user_metadata, app_metadata,
                password_hash, "createdAt", "updatedAt"
           FROM trexdb."user"
          WHERE id = $1 AND "deletedAt" IS NULL AND banned IS NOT TRUE`,
        [session.user.id],
      );
      // Belt and braces on the disabled-user rule: no session is ever built
      // from a row this SELECT would not return.
      if (!rows.length) {
        throw new Error("federated user is gone or deactivated between link and session");
      }
      await createTokenResponse(rows[0], undefined, res);
      res.redirect(302, location);
    } catch (err) {
      // One generic code covers every failure of the exchange; an upstream URL,
      // a JWKS failure or a database message must not reach the browser.
      console.error("[federation] /callback failed:", err);
      if (!res.headersSent) {
        res.status(401).json({
          error: "invalid_request",
          error_description: "Federated sign-in failed",
        });
      }
    }
  });

  app.use(`${basePath}/auth/v1`, router);
  console.log(`Federation endpoints mounted on ${basePath}/auth/v1/{authorize,callback}`);
  // Fired rather than awaited: registerFederationRoutes is called from index.ts
  // on the synchronous boot path, and nothing about serving the routes depends
  // on the answer. A failure to run the audit must not take the server down.
  void auditTrustedIssuerOrigins(pool).catch((err) => {
    console.warn(
      "[federation] could not check issuer origins against BETTER_AUTH_TRUSTED_ORIGINS:",
      err,
    );
  });
}

// ── The deployment requirement this cutover introduces ──────────────────────

/**
 * Every upstream's issuer origin must now be in BETTER_AUTH_TRUSTED_ORIGINS.
 *
 * This is new configuration for every existing deployment and it is the one
 * part of the cutover that cannot be read off the provider row.
 * `fetchOIDCEndpoint` refuses discovery, the token exchange and JWKS for an
 * origin outside the list (@better-auth/sso dist/index.mjs:395, :421, :505),
 * and the refusal arrives as a DiscoveryError that mapDiscoveryErrorToAPIError
 * turns into a plain 400. Left to itself that reads as an upstream outage or a
 * bad provider row — an operator would spend the incident in Logto's logs — so
 * it is named here, at boot, with the exact value to add.
 *
 * The predicate is the engine's OWN isTrustedOrigin rather than a
 * reimplementation: it is the function the plugin will actually call,
 * wildcards and all, so this cannot drift from it. A hand-rolled string
 * comparison would raise a false alarm for every deployment configured with
 * `*.example.test`, and a false alarm at boot is how an operator learns to
 * ignore the line.
 */
export async function untrustedIssuerOrigins(
  // deno-lint-ignore no-explicit-any
  pool: any,
  isTrusted?: (url: string) => boolean,
): Promise<{ id: string; url: string; origin: string }[]> {
  let predicate = isTrusted;
  if (!predicate) {
    const ctx = await auth.$context;
    predicate = (url: string) => ctx.isTrustedOrigin(url);
  }
  const { rows } = await pool.query(
    `SELECT id, issuer, discovery_url FROM trexdb.sso_provider
      WHERE enabled = true AND issuer IS NOT NULL`,
  );
  const out: { id: string; url: string; origin: string }[] = [];
  for (const row of rows) {
    // The same URL oidcConfigFor serialises as discoveryEndpoint, because that
    // is the one the plugin fetches first and the one every later endpoint is
    // normalised against.
    const url = row.discovery_url ??
      String(row.issuer).replace(/\/+$/, "") + "/.well-known/openid-configuration";
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      // A row whose issuer is not a URL is broken in a way this check is not
      // about, and it fails loudly at its first sign-in anyway.
      continue;
    }
    if (!predicate(url)) out.push({ id: String(row.id), url, origin });
  }
  return out;
}

/** The audit above, said out loud. Separate so a test can drive either half. */
export async function auditTrustedIssuerOrigins(
  // deno-lint-ignore no-explicit-any
  pool: any,
  log: (msg: string) => void = console.error,
  isTrusted?: (url: string) => boolean,
): Promise<void> {
  const missing = await untrustedIssuerOrigins(pool, isTrusted);
  if (missing.length === 0) return;
  const origins = [...new Set(missing.map((m) => m.origin))];
  log(
    "[federation] MISCONFIGURED: BETTER_AUTH_TRUSTED_ORIGINS does not contain the " +
      `issuer origin of ${missing.length} enabled provider(s) — ` +
      `${missing.map((m) => `${m.id} (${m.origin})`).join(", ")}. ` +
      "Every federated sign-in through them will fail at discovery with a " +
      "generic 400 that looks like an upstream outage. Add these origins to " +
      `BETTER_AUTH_TRUSTED_ORIGINS (comma-separated): ${origins.join(",")}`,
  );
}
