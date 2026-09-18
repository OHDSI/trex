// The authentication engine. Not mounted publicly: /auth/v1 keeps the
// GoTrue-compatible wire contract and calls this, because trex issues stateless
// access tokens and rotating refresh tokens, which Better Auth has no concept
// of (see the spec's "The router is kept, not replaced").
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, jwt } from "better-auth/plugins";
import { pool } from "../db.ts";
import { BASE_PATH } from "../config.ts";
import { issuerUrl } from "./oidc/config.ts";
import { deriveSubkeyBase64, LABELS } from "./keys.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { nativePasswordLoginEnabled } from "./federation/config.ts";

export function authBasePath(): string {
  return `${BASE_PATH}/_auth`;
}

/**
 * Without an explicit base URL Better Auth derives the origin from whichever
 * request happens to arrive, which is how callbacks and redirects come to work
 * in development and break behind an ingress.
 *
 * Only the origin of BETTER_AUTH_URL is used, because that variable already
 * carries a path elsewhere in trex — index.ts defaults it to
 * `http://localhost:8001${BASE_PATH}` for the edge-function workers — and
 * concatenating that with a base path that also starts with BASE_PATH would
 * yield /trex/trex/_auth. auth/jwt.ts narrows the same variable the same way
 * when it builds the token issuer.
 */
function authBaseUrl(): string {
  const raw = Deno.env.get("BETTER_AUTH_URL") || "http://localhost:8000";
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    origin = raw;
  }
  return `${origin}${authBasePath()}`;
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
 * The `iss` every token carries. The same expression d2e-compat/idp.ts:65 uses
 * to tell relying parties where to look, so the two cannot drift.
 */
function oidcIssuer(): string {
  const issuer = issuerUrl(Deno.env.get("TREX_OIDC_ISSUER"), `${BASE_PATH}/oidc`);
  assertIssuerScheme(issuer);
  return issuer;
}

/**
 * The OAuth provider plugin does not refuse an `http:` issuer on a routable
 * host: validateIssuerUrl rewrites the scheme to `https:` and strips query and
 * hash (@better-auth/oauth-provider@1.7.5). Tokens would then be minted with an
 * `iss` nobody configured, and the mismatch surfaces at the relying party as an
 * invalid token rather than here as a misconfiguration. Fail boot instead.
 *
 * Deliberately no laxer than the plugin's own loopback test: anything this
 * accepts, validateIssuerUrl leaves alone.
 */
function assertIssuerScheme(issuer: string): void {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(`TREX_OIDC_ISSUER is not a URL: ${issuer}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = host === "localhost" || host.endsWith(".localhost") ||
    host === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (url.protocol !== "https:" && !loopback) {
    throw new Error(
      `The OIDC issuer must be https: or a loopback host, not ${issuer}. ` +
        "Better Auth silently rewrites the scheme to https:, so tokens would " +
        "be issued with an `iss` no relying party expects.",
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      `The OIDC issuer must carry no query and no fragment, not ${issuer}. ` +
        "Better Auth strips both, so the issued `iss` would not be this value.",
    );
  }
}

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
    // jwksPath puts the key set exactly where trex serves it today, so
    // d2e-compat/idp.ts and every cached discovery document keep resolving.
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
  ],
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
