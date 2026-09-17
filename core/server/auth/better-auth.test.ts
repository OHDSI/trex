// better-auth.ts derives its secret from TREX_ROOT_KEY and opens trex's pool,
// both at module evaluation time. A static import would run that before any
// Deno.env.set here could take effect, so the module is pulled in dynamically
// once the environment is arranged.
//
// Like auth-router.contract.test.ts, this file is gated on DATABASE_URL and
// skips without one rather than inventing a URL: DATABASE_URL is process-wide
// and the suites evaluated after this one (federation/admin, sb-keys) gate
// themselves on it too, so faking it here would un-gate them against a database
// that does not exist.
import { assertEquals } from "jsr:@std/assert";
import { _resetRootKeyCache } from "./keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  const priorRoot = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return await import("./better-auth.ts");
  } finally {
    // getRootKey caches, and keys.test.ts asserts it throws when the variable is
    // unset. Hand both the variable and the cache back the way they were found.
    if (priorRoot === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", priorRoot);
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

function test(name: string, fn: (m: NonNullable<typeof mod>) => void) {
  Deno.test({ name, ignore: !mod, fn: () => fn(mod!) });
}

test("better-auth is mounted on a private base path", ({ authBasePath }) => {
  // Not a public surface: everything the outside world calls is /auth/v1,
  // /oidc or /admin. Anything reaching /_auth directly is a mistake we want to
  // be able to see in a route table.
  assertEquals(authBasePath().endsWith("/_auth"), true);
});

test("the instance exposes the credential endpoints the router will call", ({ auth }) => {
  assertEquals(typeof auth.api.signInEmail, "function");
  assertEquals(typeof auth.api.getSession, "function");
});

test("both password hooks are trex's, not Better Auth's defaults", ({ auth }) => {
  // Better Auth resolves `hash` and `verify` independently, each falling back
  // to its own scrypt. Supplying only `hash` therefore fails silently: sign-up
  // writes a trex r=8 hash and the default verifier recomputes it at r=16, so
  // every later sign-in returns 401. Pin both.
  const password = auth.options.emailAndPassword?.password;
  assertEquals(typeof password?.hash, "function");
  assertEquals(typeof password?.verify, "function");
});

test("nothing is mounted on the public /auth/v1 prefix", ({ authBasePath }) => {
  // Task 3 adds the engine only. If this ever starts with /auth/v1 the engine
  // has begun answering the GoTrue contract directly, which is a different
  // task and a different set of response envelopes.
  assertEquals(authBasePath().includes("/auth/v1"), false);
});
