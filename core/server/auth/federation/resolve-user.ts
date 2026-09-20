// trex's link policy, as @better-auth/sso's one identity-resolution hook.
//
// Everything decideLink decides is still decided here and in the same order,
// because the order is the policy: an existing link wins over any address the
// upstream now asserts, an identity with no address is judged before the
// verified-email rule rather than by it, and an allowlist that cannot be
// evaluated refuses rather than passes.
//
// Four of the decisions have no equivalent anywhere in the plugin and would
// simply stop being made if this hook were left unset — the provider enable
// switch (resolveOIDCProvider filters on providerId alone, dist/index.mjs:
// 4090-4097), per-provider auto-provision, the multi-domain allowlist, and the
// elevated-account guard.
//
// The provider row is re-read rather than passed in: the hook's input carries
// only the providerId and an opaque reference (dist/index-sM6JWXeV.d.mts:
// 255-292), and the columns that hold the whole policy live on that row.
// Reading it through context.database keeps it inside the same transaction the
// plugin locked the row in, so the configuration this decision is made under is
// the configuration the callback already fingerprinted.
//
// Nothing here throws for a policy reason. resolveSSOUser turns anything thrown
// into a generic SSO_USER_RESOLUTION_FAILED 500 (dist/index.mjs:1600-1606),
// which would make a refusal indistinguishable from a database outage; a
// refusal is returned as { action: "reject", code } instead, and the code is
// one of trex's own fixed strings — never upstream text — because it reaches a
// browser through refusalRedirect's `?error=`.
import type {
  SSOUserResolution,
  SSOUserResolutionContext,
  SSOUserResolutionInput,
} from "@better-auth/sso";
import { decideLink, normaliseDomains } from "./link.ts";
import type { ExistingUser } from "./link.ts";
import type { UpstreamIdentity } from "./types.ts";

const reject = (code: string): SSOUserResolution => ({ action: "reject", code });

/**
 * The two ways trex retires an account, tested the way the rest of the tree
 * tests them (oidc/mount.ts's isRetired). Truthiness rather than `=== true`:
 * this decides whether to refuse, so anything that is not plainly "not
 * disabled" must refuse.
 */
function isRetired(user: { deletedAt?: unknown; banned?: unknown }): boolean {
  return Boolean(user.deletedAt || user.banned);
}

/**
 * The trex user a verified upstream address resolves to.
 *
 * This is findLinkCandidateByEmail's predicate, re-expressed against the
 * adapter because the adapter cannot express it: there is no `IS NOT TRUE`
 * operator (@better-auth/core/dist/db/adapter/index.d.mts:291), and a
 * `{ operator: "ne", value: true }` would drop every row whose column is NULL
 * — which is most of them — instead of keeping them. So the rows are filtered
 * here, where NULL and false can be told apart from true explicitly.
 *
 * Both exclusions are load-bearing and neither substitutes for the other:
 *
 *  - a soft-deleted or banned holder must never resolve, or a deactivated
 *    account is resurrected for whoever controls that address at the upstream;
 *  - a placeholder address (<subject>@d2e.local, which V17 backfilled onto 64
 *    rows) was asserted by nobody and can be reached by nobody, so an upstream
 *    verifying one is claiming an identity rather than proving one.
 *
 * `undefined` means no candidate, `"ambiguous"` means more than one survived —
 * which V16's unique index on lower(email) forbids, so it is reachable only on
 * a database missing it, and that is exactly the state a takeover needs. There
 * is nothing to order the two by that distinguishes a victim from an attacker,
 * so the sign-in goes rather than the guess.
 */
const AMBIGUOUS = "ambiguous" as const;

async function findCandidate(
  database: SSOUserResolutionContext["database"],
  email: string,
): Promise<ExistingUser | null | typeof AMBIGUOUS> {
  // Exact match on the lower-cased address, which is what Better Auth's own
  // findUserByEmail does everywhere (better-auth/dist/db/internal-adapter.mjs:
  // 572, 620) and what createUser writes (:126, :145). trex's own SQL says
  // `lower(email) = lower($1)`, which would also match a row stored in mixed
  // case; the adapter has no way to say that. The divergence is fail-closed —
  // a miss refuses or provisions rather than linking — and it keeps this
  // lookup identical to the one the engine itself would make next.
  //
  // Not limited to one row: the count after filtering is the ambiguity signal,
  // so the query has to be able to see a second one. Two is all V16 permits and
  // the cap is generous against a database missing that index.
  const rows = await database.findMany<Record<string, unknown>>({
    model: "user",
    where: [{ field: "email", value: email.toLowerCase() }],
    limit: 10,
  });
  const live = rows.filter((r) => !isRetired(r) && r.is_placeholder_email !== true);
  if (live.length > 1) return AMBIGUOUS;
  const row = live[0];
  if (!row) return null;
  return { id: String(row.id), role: typeof row.role === "string" ? row.role : null };
}

export const resolveSsoUser = async (
  input: SSOUserResolutionInput,
  context: SSOUserResolutionContext,
): Promise<SSOUserResolution> => {
  if (input.protocol !== "oidc") {
    // SAML is a non-goal (spec, "Non-goals"). Refusing is not a gap: nothing
    // writes a samlConfig, so reaching here means a row was hand-edited — and
    // none of the columns below describe a SAML flow.
    return reject("unsupported_protocol");
  }

  // providerReference.source.recordId is the trexdb.sso_provider.id of the
  // exact row this flow was fingerprinted against and that the transaction
  // locked, so it is the honest handle for the re-read. A "configured" source
  // is defaultSSO, which trex does not use; keyed on providerId so a future
  // one is not silently unpoliced.
  const source = input.providerReference.source;
  const row = await context.database.findOne<Record<string, unknown>>({
    model: "ssoProvider",
    where: source.type === "persisted"
      ? [{ field: "id", value: source.recordId }]
      : [{ field: "providerId", value: input.providerId }],
  });
  if (!row) return reject("unknown_provider");

  // `enabled` is trex's own column and everything that is not exactly true
  // means off, including a column an older database has not got — the same
  // rule loadProviders applied with `enabled = true` in its WHERE clause.
  // Checked before the account lookup on purpose: an operator disabling a
  // provider during an incident is disabling it for the people already linked
  // to it, who are otherwise the ones it would keep authenticating.
  if (row.enabled !== true) return reject("provider_disabled");

  // Identity first, email second. handleOAuthUserInfo would find this account
  // itself, but only after deciding nothing; the ban check and the "never
  // re-ask the verified-email question" rule both need the answer here.
  const account = await context.database.findOne<{ userId: string }>({
    model: "account",
    where: [
      { field: "providerId", value: input.providerId },
      { field: "accountId", value: input.accountKey.accountId },
    ],
  });
  if (account) {
    const linked = await context.database.findOne<Record<string, unknown>>({
      model: "user",
      where: [{ field: "id", value: account.userId }],
    });
    // A missing user behind a live account row is a torn state, not an
    // ordinary one — account."userId" has a foreign key. Falling through to
    // the email path would hand this identity whoever now holds the address.
    if (!linked || isRetired(linked)) return reject("account_disabled");
    // "preserve", never "update": user.email is trex's own identifier, it is
    // UNIQUE, and it is what the password grant authenticates against — an
    // upstream that could rewrite it could move a trex account onto an address
    // it chose. It is also what keeps a migrated user's address intact while
    // mapping.email is pointing at a username claim.
    return { action: "link", userId: String(linked.id), profile: "preserve" };
  }

  // First sighting. Only now does the address decide anything, and only under
  // the provider's policy.
  const claims = input.verifiedIdTokenClaims;
  const rawEmail = claims.email;
  const identity: UpstreamIdentity = {
    sub: input.accountKey.accountId,
    // Deliberately the id_token's own `email` claim, not providerUser.email:
    // the latter is whatever mapping.email selected, which on a username-only
    // upstream is a username or the subject (that is the whole point of the
    // mapping — it satisfies dist/index.mjs:3938, which runs after mapping and
    // before the account lookup with no hook in between). Treating it as an
    // address would hand a username to the allowlist and to the existing-user
    // lookup, and a trex user whose address happened to equal it would be
    // signed into by whoever holds that username upstream.
    //
    // This is a deliberate divergence from applyClaimMap, which reads the
    // address through claim_map.email: V20 re-purposed that same column as
    // `mapping.email`, so post-cutover its value names the stand-in claim
    // rather than the address claim, and the two readings cannot both be had
    // from one column.
    email: typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null,
    // providerUser.emailVerified is hard-coded false unless the deprecated
    // trustEmailVerified is on (dist/index.mjs:3922, :3933), so the claim is
    // read here off the cryptographically verified id_token instead — which is
    // the stronger source anyway. Absent means unverified, never defaulted
    // true: the whole link policy rests on it, and so does `=== true` rather
    // than a truthiness test, which would accept the string "true".
    emailVerified: claims.email_verified === true,
  };

  const candidate = identity.email === null
    ? null
    : await findCandidate(context.database, identity.email);
  if (candidate === AMBIGUOUS) return reject("ambiguous_account");

  const decision = decideLink(identity, {
    // `=== true` throughout, for the reason loadProviders gives on
    // allowElevatedAutoLink: these decide whether an upstream may mint trex
    // accounts and whether it may take over an administrator's, so the one
    // value that enables them is the boolean true.
    autoProvision: row.auto_provision === true,
    emailDomainAllowlist: normaliseDomains(row.email_domain_allowlist),
    allowElevatedAutoLink: row.allow_elevated_auto_link === true,
  }, candidate);

  if (decision.action === "refuse") return reject(decision.reason);
  if (decision.action === "link") {
    return { action: "link", userId: decision.userId, profile: "preserve" };
  }

  // decideLink says "provision", and under its original caller that meant
  // `provisionUser`, which owns the address: it synthesises <slug>@d2e.local
  // for an identity that asserted none and sets is_placeholder_email. Under
  // the plugin it means something else — handleOAuthUserInfo creates the user
  // with `providerUser.email`, which is whatever mapping.email selected, and
  // that is NOT the address this function just judged.
  //
  // Measured on a real database: with auto_provision on and
  // claim_map {"email":"username"}, the created row is email = 'alice',
  // is_placeholder_email = false — a bare username in a UNIQUE NOT NULL
  // address column, flagged as a legitimate link candidate, which is precisely
  // the row V17 spent a migration eliminating. Worse, in the variant where the
  // id_token ALSO carries a real verified address, the allowlist and
  // isEngineAddressable both passed on that address and 'alice' was still what
  // got written — so every address check above is vacuous on this branch
  // unless the value the engine will store is the value that was checked.
  //
  // Hence the guard, and it is equality rather than mere addressability: a
  // mapping naming some other address-shaped claim would store an address the
  // allowlist and the elevated-account guard never saw. The engine must write
  // the address the policy judged, or nothing.
  //
  // Refusing rather than synthesising a placeholder here, deliberately. The
  // resolver is a decision, not a writer: is_placeholder_email is declared
  // `input: false` so the adapter strips it from a create, which means a
  // placeholder minted through context.database would be written unflagged —
  // the same defect in a new place. Writing it any other way would put a
  // second provisioning path, with its own slug and collision rules, beside
  // provisionUser's.
  //
  // What it costs, stated plainly: auto-provision through the plugin now works
  // only where mapping.email names the upstream's real address claim. Since
  // oidcConfigFor falls back to "sub", that means a provider must set
  // claim_map.email to a genuine address claim to provision at all. Every
  // other configuration refuses a first-time identity instead of minting an
  // account nobody can authenticate as. Pre-linked identities — all 64 of the
  // migrated ones — are untouched: they never reach this branch.
  const mapped = input.providerUser.email;
  if (
    identity.email === null || typeof mapped !== "string" ||
    mapped.trim().toLowerCase() !== identity.email.trim().toLowerCase()
  ) {
    return reject("upstream_email_unusable");
  }
  return { action: "continue" };
};
