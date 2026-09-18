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

/**
 * The domain part of an address, lower-cased, or null if there isn't one.
 *
 * Split on the LAST '@', not the first: a local part may legitimately contain
 * one when quoted (`"a@b"@example.test`), and an attacker who controls the
 * local part at a permissive upstream would otherwise choose what trex reads
 * as the domain — `"victim@allowed.test"@attacker.test` must resolve to
 * attacker.test, never allowed.test.
 */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  // at <= 0 covers both "no @ at all" and an empty local part.
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * The domain every synthesised address sits under.
 *
 * Identical to the `placeholder_domain` constant in
 * core/schema/V17__better_auth_canonical_tables.sql, and it has to stay that
 * way: V17 backfilled the users that existed when Better Auth took the tables
 * over, federation's provisionUser mints the ones that arrive afterwards, and a
 * row from either must be indistinguishable from a row from the other. It cannot be
 * read from configuration on this side because it cannot be on that one —
 * trex's migration runner substitutes nothing into a V-file and checksums the
 * text it executes (plugins/migration/src/lib.rs).
 *
 * Never resolvable and never routed to. `is_placeholder_email` is the flag code
 * branches on — federation's findLinkCandidateByEmail already does, and any
 * mail path added later must — and the domain is only what makes the address
 * inert if something tries anyway. isPlaceholderAddress below is how a row
 * supplied with an address in this domain gets the same flag as one
 * synthesised into it.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "d2e.local";

/**
 * Whether an address is synthetic BY CONSTRUCTION, whoever supplied it.
 *
 * The domain is trex's own and resolves nowhere, so nothing legitimately
 * receives mail there and no upstream can speak for it. An address in it is
 * therefore a placeholder regardless of which path produced it — which is the
 * gap this closes. provisionUser used to flag only the addresses it synthesised
 * itself, i.e. only the identities that asserted none; but the federation admin
 * link cannot reach that branch at all, because parseLinkRequest requires an
 * address containing '@'. A migration with no address to give sends
 * `<username>@<its configured domain>`, and at d2e's default that string is
 * byte-identical to this constant — so 66 of 69 migrated users landed on this
 * domain with is_placeholder_email false, emailVerified true and
 * email_confirmed_at set.
 *
 * That is not cosmetic. federation's findLinkCandidateByEmail excludes flagged
 * rows
 * precisely so an upstream asserting `<somebody's subject>@d2e.local` cannot
 * claim the row that holds it; unflagged, all 66 were candidates again, and a
 * second enabled upstream asserting one of those addresses as verified linked
 * straight onto the migrated account. Unconditionally — second upstream or not
 * — those rows also claimed a confirmed, verified address nobody can receive
 * mail at, which is the opposite of what the flag exists to tell a mail path.
 *
 * Keyed on the domain and nothing else: not on the caller, not on the shape of
 * the local part. A rule about who is asking would have missed this caller, and
 * the next one too.
 *
 * ASKED BY FIVE OF THE SIX ADDRESS-WRITING ROUTES enumerated above:
 * PUT /federation/links and federated auto-provision (both via provisionUser),
 * POST /admin/users, the MCP tool user-create, and PUT /user — which derives
 * the flag from the new address on every update rather than clearing it, so the
 * invariant holds on write and not only on creation.
 *
 * POST /signup is the deliberate exception. It creates an account somebody is
 * registering for themselves, the bootstrap administrator included, and writing
 * that row emailVerified=false would be the wrong outcome rather than a safer
 * one. It is also the one route where the flag buys nothing: user_email_lower_key
 * stops a registration taking an address a row already holds, and
 * synthesisePlaceholderEmail falls back to <id>@d2e.local when a slug is taken,
 * so a self-registered @d2e.local address cannot be used to reach anybody
 * else's row. Anything that makes either of those two things untrue makes this
 * exception untrue with it — a mail path that reads the column, or a relaxed
 * unique index, and the reasoning above stops holding.
 *
 * WHAT IT DOES NOT CLAIM is that squatting is harmless. Registering an address
 * before its owner arrives puts their federated identity inside the squatter's
 * account, and "onto the attacker's own row" is precisely that harm, not its
 * absence. But that is decideLink's general posture on every domain, not
 * something about this one: an upstream asserting any verified address links to
 * the row holding it, and emailDomainAllowlist is the intended control (see
 * link.ts). d2e.local is neither more nor less exposed than example.com here,
 * which is the point — the flag is about what a row MEANS, and the squat is a
 * separate question with its own separate answer.
 */
export function isPlaceholderAddress(email: string | null): boolean {
  return email !== null && emailDomain(email) === PLACEHOLDER_EMAIL_DOMAIN;
}
