/**
 * Whether the engine will accept this as an address at all.
 *
 * A twin of zod's `z.email()` — the check Better Auth runs first on every
 * credential endpoint — copied from zod v4's regexes.ts rather than invented,
 * because an address trex accepts and the engine does not is a registration
 * that gets as far as writing rows and then fails.
 *
 * TWIN OF THE EXPRESSION IN core/schema/V17, which refuses to migrate an
 * installation still holding an address the engine would reject — that refusal
 * and this predicate have to be the same rule, or the migration passes an
 * installation whose users then cannot sign in. All three (this, V17's, zod's)
 * move together, and the parity test in auth-engine-cutover.test.ts asks all
 * three the same addresses, so a zod upgrade that moves the rule fails a test
 * rather than drifting quietly.
 *
 * Every route that writes an address has to ask it, not only the ones that hand
 * one to the engine directly. V17 refuses to migrate an installation holding an
 * address the engine cannot resolve, and /signup refuses to create one; a
 * PUT /user that accepted one would be a back door into the exact state both of
 * those exist to prevent, one request after the migration refused it, and the
 * account that walked through it could never sign in again. The federation
 * admin link at PUT /federation/links is the fourth such door, and the one a
 * migration drives at volume — see linkIdentity.
 *
 * Its own module rather than the router's, because the rule now governs three
 * subsystems (the /auth/v1 routes, the federation admin API and V17) and the
 * federation admin path has no other reason to load a 60KB express router.
 */
const ENGINE_EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export function isEngineAddressable(email: unknown): boolean {
  return typeof email === "string" && ENGINE_EMAIL.test(email);
}
