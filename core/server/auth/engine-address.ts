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
 * account that walked through it could never sign in again.
 *
 * SIX ROUTES trex serves create or change a login address, and all six ask
 * this:
 *
 *   POST /auth/v1/signup
 *   POST /auth/v1/admin/users
 *   PUT  /auth/v1/user
 *   PUT  /auth/v1/federation/links  (linkIdentity — what a migration drives at
 *                                    volume, after V17 has already run)
 *   federated sign-in, auto-provision branch (decideLink — the only one reached
 *                                    with no administrator in the loop, since
 *                                    the upstream asserts the address itself
 *                                    and trex stores that claim verbatim)
 *   the MCP tool user-create         (mcp/tools/users.ts — an admin API key,
 *                                    the same privilege tier as /admin/users)
 *
 * A seventh means asking it there too.
 *
 * WHAT THIS IS NOT is a guarantee about the table. PostGraphile mounts trexdb
 * (index.ts), trexdb."user" carries no @omit, and V3 leaves service_role with
 * GRANT ALL on it — so a service-role token can UPDATE email directly and this
 * predicate never runs. That is not a door left open; it is what service_role
 * means, and the same holds for psql. The invariant this file supports is
 * "every route trex serves asks the rule", not "no unservable address can exist
 * in the table". V17 is what checks the second, over the whole population, at
 * the one moment trex can still refuse to proceed.
 *
 * Its own module rather than the router's, because the rule now governs four
 * subsystems (the /auth/v1 routes, federation, the MCP tools, and V17's twin)
 * and none of the last three has any other reason to load a 60KB express
 * router.
 */
const ENGINE_EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export function isEngineAddressable(email: unknown): boolean {
  return typeof email === "string" && ENGINE_EMAIL.test(email);
}
