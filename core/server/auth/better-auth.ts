// The authentication engine, and — since the OAuth provider is one of its
// plugins — the OIDC provider too.
//
// /auth/v1 keeps the GoTrue-compatible wire contract and calls this through
// `auth.api`, because trex issues stateless access tokens and rotating refresh
// tokens, which Better Auth has no concept of (see the spec's "The router is
// kept, not replaced"). What IS served over HTTP is the provider, at the issuer
// path and nothing else: oidc/mount.ts 404s every Better Auth route that is not
// the provider's own.
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, jwt } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { pool } from "../db.ts";
import { oidcIssuer, trustedProxies } from "./oidc/config.ts";
import { trexOAuthProvider } from "./oidc/provider.ts";
import { defaultServiceResource, refuseRetiredSubject } from "./oidc/hooks.ts";
import { deriveSubkeyBase64, LABELS } from "./keys.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { nativePasswordLoginEnabled } from "./federation/config.ts";
import { configuredFederationRedirectUri, ssoProviderSchema } from "./federation/sso-config.ts";
import { resolveSsoUser } from "./federation/resolve-user.ts";
import { accountTokenHooks } from "./federation/account-tokens.ts";
import { provisionSsoUser } from "./federation/provision.ts";

/**
 * Where the engine answers. Every endpoint URL in the discovery document is
 * `${ctx.context.baseURL}/oauth2/...` and better-call routes on
 * `new URL(ctx.baseURL).pathname` (better-auth@1.7.5 api/index.ts:154), so the
 * base path is not a free choice: it has to BE the issuer path, or the
 * document advertises endpoints that are not where the provider listens.
 */
export function authBasePath(): string {
  return new URL(oidcIssuer()).pathname;
}

/**
 * Without an explicit base URL Better Auth derives the origin from whichever
 * request happens to arrive, which is how callbacks and redirects come to work
 * in development and break behind an ingress.
 *
 * It is the issuer, not BETTER_AUTH_URL's origin, and that is the whole of the
 * cutover's URL story: `authServerMetadata` builds authorization_endpoint,
 * token_endpoint, userinfo_endpoint, end_session_endpoint and jwks_uri from
 * `ctx.context.baseURL` and only `issuer` from the jwt plugin's own issuer
 * option, so a base URL that disagreed with the issuer would advertise a
 * document Spring's `fromOidcIssuerLocation` refuses.
 *
 * One consequence worth knowing before it surprises somebody: the session
 * cookie's name follows the base URL's scheme. An https issuer gives Better
 * Auth's `createCookieGetter` the `__Secure-` prefix and `secure: true`, where
 * an http BETTER_AUTH_URL did not.
 */
function authBaseUrl(): string {
  return oidcIssuer();
}

// The same variable and the same split as the CORS allow-list in index.ts, so
// an origin trusted for one cannot silently differ from the other.
const trustedOrigins = (Deno.env.get("BETTER_AUTH_TRUSTED_ORIGINS") || "")
  .split(",")
  .filter(Boolean);

// Better Auth wants a string; the root key is 32 raw bytes and is never handed
// to a third party directly.
const secret = await deriveSubkeyBase64(LABELS.betterAuthEngine);

/**
 * A raw `Error` thrown out of either password hook is not caught by Better
 * Auth: it becomes a 500 with a completely empty body — no JSON, no code — and
 * on sign-up the user and account rows are rolled back, so the caller cannot
 * even tell what failed. An `APIError` is rendered verbatim instead.
 */
function infrastructureFailure(message: string, cause: unknown): APIError {
  console.error(`[better-auth] ${message}:`, cause);
  return new APIError("INTERNAL_SERVER_ERROR", {
    message,
    code: "PASSWORD_HASHING_UNAVAILABLE",
  });
}

export const auth = betterAuth({
  database: pool,
  basePath: authBasePath(),
  baseURL: authBaseUrl(),
  trustedOrigins,
  secret,
  // On, not left to the default. The provider's endpoints are mounted at
  // ${BASE_PATH}/oidc ahead of trex's own apiLimiter, and the deleted router.ts
  // had authLimiter on /authorize and /token — so without this /oauth2/token is
  // unthrottled. Better Auth's own default is `isProduction`, which is false
  // everywhere in this tree because nothing sets NODE_ENV=production.
  rateLimit: { enabled: true },
  advanced: {
    // x-forwarded-for is what Caddy sends and already what Better Auth reads,
    // so only the proxy list is worth stating. Empty unless the deployment says
    // otherwise — oidc/config.ts's trustedProxies carries the reasoning, and
    // the consequence of leaving it empty is a shared bucket rather than a
    // wrong one.
    ipAddress: { trustedProxies: trustedProxies() },
  },
  emailAndPassword: {
    enabled: nativePasswordLoginEnabled(),
    // trex's own scrypt: the salt goes into scrypt as the hex string, new
    // hashes are r=8, and r=16 is still accepted for the V2-seeded admin.
    // Better Auth's default verifier would reject every password written here
    // since March.
    password: {
      hash: async (password: string) => {
        try {
          return await hashPassword(password);
        } catch (cause) {
          throw infrastructureFailure("password hashing failed", cause);
        }
      },
      // `verifyPassword` already answers `false` for a wrong password and for a
      // malformed stored hash; the catch is for the scrypt call itself dying,
      // which must not be reported to the caller as a wrong password.
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        try {
          return await verifyPassword(password, hash);
        } catch (cause) {
          throw infrastructureFailure("password verification failed", cause);
        }
      },
    },
  },
  user: {
    additionalFields: {
      password_hash: { type: "string", required: false, input: false },
      email_confirmed_at: { type: "date", required: false, input: false },
      last_sign_in_at: { type: "date", required: false, input: false },
      phone: { type: "string", required: false, input: false },
      // jsonb columns. Better Auth maps `json` to jsonb and `string` to text
      // unconditionally, so `string` here would describe the wrong column type.
      user_metadata: { type: "json", required: false, input: false },
      app_metadata: { type: "json", required: false, input: false },
      mustChangePassword: { type: "boolean", required: false, input: false },
      // What keeps a synthesised <subject>@d2e.local from being claimed is a
      // predicate in trex's own SQL (findLinkCandidateByEmail), not anything
      // Better Auth knows. `plugins` below holds no social or OIDC provider
      // today; adding one would bring Better Auth's own account linking, which
      // matches by email inside the adapter and never calls that function — so
      // it would reopen the takeover on exactly these rows. Any such provider
      // has to arrive with its own placeholder rule.
      is_placeholder_email: { type: "boolean", required: false, input: false },
      // trex's soft-delete marker (V1's delete_user()). Better Auth has no
      // concept of one, and its adapter returns only the fields it has been
      // told about — so without this declaration a user read routed through
      // the engine would hand back a retired account as a live one, and
      // GET /user, /change-password and the admin block all pin a 404 for
      // exactly those rows.
      deletedAt: { type: "date", required: false, input: false },
    },
  },
  plugins: [
    admin(),
    // RS256, not the plugin's EdDSA default: WebAPI is Spring Security and its
    // default JWT decoder rejects anything else — the same failure already seen
    // with Logto's ES384 tokens.
    //
    // jwksPath is relative to the base URL, which is now the issuer — so the
    // key set is served at `<issuer>/.well-known/jwks.json`, exactly where trex
    // serves it today and exactly what the discovery document advertises.
    // Before the cutover the same line resolved under ${BASE_PATH}/_auth; the
    // comment describing it as the issuer path only became true here.
    // disableSettingJwtHeader is what the jwt plugin's own types recommend when
    // an OAuth provider plugin is installed: session payloads must not be
    // signed into a response header.
    jwt({
      jwks: {
        keyPairConfig: { alg: "RS256", modulusLength: 2048 },
        jwksPath: "/.well-known/jwks.json",
      },
      jwt: { issuer: oidcIssuer() },
      disableSettingJwtHeader: true,
    }),
    // Installed unconditionally, while TREX_OIDC_PROVIDER_ENABLED gates the
    // HTTP mount rather than the plugin. Keeping the option block constant is
    // what lets schema-validate.test.ts see the same tables a provider
    // deployment needs, and the plugin serves nothing on its own — it only adds
    // routes to a handler that, without the mount, nothing calls.
    trexOAuthProvider(),
    // The relying-party half of federation, on trexdb.sso_provider itself
    // rather than on a second table: one row per provider stays the whole
    // truth, so the admin API, trex's own router and the plugin can never
    // disagree about which upstreams exist.
    //
    // Mounted unconditionally, like the provider above and for the same
    // reason: the option block has to be constant for schema-validate.test.ts
    // to see the tables a federating deployment needs, and the plugin serves
    // nothing on its own — oidc/mount.ts 404s every path outside /oauth2/ and
    // /.well-known/, which is all of the plugin's own /sso/* routes.
    //
    // V20 is what makes this safe to mount at all: since 1.7 a schema Better
    // Auth disagrees with throws rather than warns, and the enforcement point
    // is runWithTransaction, which sign-UP goes through as much as sign-in. So
    // against an unmigrated table this line would break the whole engine, not
    // federation. sso-schema.test.ts is the guard on that.
    sso({
      schema: { ssoProvider: ssoProviderSchema },
      // The upstream redirects the browser back to trex's own path, not the
      // plugin's, because that URI is registered at every existing provider.
      // Spread rather than passed: the value cannot be resolved at module
      // scope in a deployment that does not federate. See
      // configuredFederationRedirectUri.
      ...(configuredFederationRedirectUri()
        ? { redirectURI: configuredFederationRedirectUri()! }
        : {}),
      // trex's whole per-provider link policy, which the plugin has none of.
      // Setting it also turns on three things this cutover wants and cannot
      // ask for separately (dist/index.mjs:3908, :4015-4016): an id_token
      // becomes mandatory, non-database writes are deferred out of the
      // transaction, and account binding must be exact.
      resolveUser: resolveSsoUser,
      // Provider rows are written by /admin/federation and by nothing else.
      // This closes update and delete; it is NOT reached on create, which has
      // no guard hook at all (the create at dist/index.mjs:3473 calls
      // guardSSOProviderMutation nowhere), so registration is closed by the
      // limit below instead.
      //
      // Both routes would fail anyway, on V1's CHECK (id ~ '^[a-z][a-z0-9_]*$')
      // — the adapter generates a random id for the insert, and update's
      // proposal is not trex's to accept. Refusing them here makes that a
      // stable conflict with a reason rather than a constraint violation
      // surfacing as a 500.
      guardProviderMutation: () => {
        throw new Error("sso_provider rows are written only by /admin/federation");
      },
      // Zero is "registration is disabled" (dist/index.mjs:3341), checked
      // before anything else the register route does. This is the only lever
      // the plugin offers over create, and without it a session holder could
      // insert a provider row trex's own id constraint would then reject.
      providersLimit: 0,
      // The idp block and last_sign_in_at. The plugin has no hook that can
      // write them from inside the sign-in transaction — resolveUser cannot
      // write at all, and mounting it turns deferNonDatabaseWrites on — so
      // this runs after the commit and before the session cookie is set.
      // Without it groups_source and groups_claim are columns read by nothing
      // and an installation that configured group mapping gets no groups and
      // no error.
      provisionUser: provisionSsoUser,
      // The groups an upstream asserts change between sign-ins, and the idp
      // block must describe the current one. Without this it would be written
      // once, at registration, and then be wrong forever — and never written
      // at all for the migrated users, who are all already registered.
      provisionUserOnEveryLogin: true,
    }),
  ],
  account: {
    // Not Better Auth's cipher: it is XChaCha20-Poly1305 over SHA-256(secret),
    // it leaves idToken in the clear, and every existing trexdb.account row
    // holds DEK ciphertext that its isLikelyEncrypted test would hand back as
    // plaintext. Stated rather than left to the default, because the default
    // is the thing that would change under us. databaseHooks.account below
    // seals these columns under trex's DEK instead.
    encryptOAuthTokens: false,
  },
  // The DEK envelope on accessToken, refreshToken and idToken. It lives here
  // rather than in the option above for the reasons that option's comment
  // gives; account-tokens.ts carries the rest of the argument. Both create and
  // update, because a first sign-in creates the row and every later one
  // updates it.
  databaseHooks: {
    account: accountTokenHooks,
  },
  // The provider plugin has no option for either of these and a Better Auth
  // plugin cannot reach them; oidc/hooks.ts carries the measurement for each.
  // Both are no-ops on every path but the one they name.
  hooks: {
    before: defaultServiceResource,
    after: refuseRetiredSubject,
  },
});

// Better Auth resolves `hash` and `verify` independently — `options.password
// ?.hash || <its own>`, same again for verify — so dropping one of the two
// fails silently rather than loudly: sign-up writes a trex r=8 hash, the
// default verifier recomputes it at r=16, and every subsequent sign-in returns
// 401. Refuse to boot instead.
const wiredPassword = auth.options.emailAndPassword?.password;
if (
  typeof wiredPassword?.hash !== "function" ||
  typeof wiredPassword?.verify !== "function"
) {
  throw new Error(
    "Better Auth must be given both emailAndPassword.password.hash and " +
      ".verify. With only one, Better Auth silently falls back to its own " +
      "scrypt for the other and no trex password can be verified.",
  );
}
