// better-auth.ts derives its secret from TREX_ROOT_KEY and opens trex's pool,
// both at module evaluation time. A static import would run that before any
// Deno.env.set in this file could take effect, so the module is pulled in
// dynamically after the environment is arranged. The fallback DATABASE_URL is
// never connected to: pg's Pool is lazy and nothing here issues a query.
import { assertEquals } from "jsr:@std/assert";

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
if (!Deno.env.get("DATABASE_URL")) {
  Deno.env.set("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:1/unused");
}

const { auth, authBasePath } = await import("./better-auth.ts");

Deno.test("better-auth is mounted on a private base path", () => {
  // Not a public surface: everything the outside world calls is /auth/v1,
  // /oidc or /admin. Anything reaching /_auth directly is a mistake we want to
  // be able to see in a route table.
  assertEquals(authBasePath().endsWith("/_auth"), true);
});

Deno.test("the instance exposes the credential endpoints the router will call", () => {
  assertEquals(typeof auth.api.signInEmail, "function");
  assertEquals(typeof auth.api.getSession, "function");
});

Deno.test("both password hooks are trex's, not Better Auth's defaults", () => {
  // Better Auth resolves `hash` and `verify` independently, each falling back
  // to its own scrypt. Supplying only `hash` therefore fails silently: sign-up
  // writes a trex r=8 hash and the default verifier recomputes it at r=16, so
  // every later sign-in returns 401. Pin both.
  const password = auth.options.emailAndPassword?.password;
  assertEquals(typeof password?.hash, "function");
  assertEquals(typeof password?.verify, "function");
});

Deno.test("nothing is mounted on the public /auth/v1 prefix", () => {
  // Task 3 adds the engine only. If this ever starts with /auth/v1 the engine
  // has begun answering the GoTrue contract directly, which is a different
  // task and a different set of response envelopes.
  assertEquals(authBasePath().includes("/auth/v1"), false);
});
