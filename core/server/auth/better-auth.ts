// The authentication engine. Not mounted publicly: /auth/v1 keeps the
// GoTrue-compatible wire contract and calls this, because trex issues stateless
// access tokens and rotating refresh tokens, which Better Auth has no concept
// of (see the spec's "The router is kept, not replaced").
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { pool } from "../db.ts";
import { BASE_PATH } from "../config.ts";
import { deriveSubkeyBase64, LABELS } from "./keys.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { nativePasswordLoginEnabled } from "./federation/config.ts";

export function authBasePath(): string {
  return `${BASE_PATH}/_auth`;
}

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
      user_metadata: { type: "string", required: false, input: false },
      app_metadata: { type: "string", required: false, input: false },
      mustChangePassword: { type: "boolean", required: false, input: false },
      is_placeholder_email: { type: "boolean", required: false, input: false },
    },
  },
  plugins: [admin()],
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
