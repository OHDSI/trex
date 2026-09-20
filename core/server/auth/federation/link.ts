// Whether an upstream identity may become, or join, a trex user.
//
// The rule that matters: an unverified upstream email links to nothing, ever.
// A provider that lets someone set an address they do not control would
// otherwise be a takeover path into any existing account with that address.
//
// An identity carrying no address at all is a separate case, not a failure of
// that rule: it can match no existing account, so it may only provision, and
// only where the provider was configured to allow it.
//
// Two further guards, both optional and both applying ONLY to an upstream
// identity seen for the first time (an identity that already has an account
// row is an established link and never reaches this module):
//
//   * `emailDomainAllowlist` — a verified address is still only as trustworthy
//     as the provider that asserted it. With several upstreams configured,
//     nothing in the flow otherwise stops the least-trusted of them asserting
//     an address in a domain it has no authority over.
//   * `allowElevatedAutoLink` — even inside an allowed domain, silently handing
//     a federated identity an existing *administrator's* account is a decision
//     a deployment should make on purpose, not a default.
//
// And one guard that applies only to provisioning: the address has to be one
// the authentication engine can serve. applyClaimMap takes the upstream `email`
// claim verbatim — it has to, since it is an identifier and not trex's to
// rewrite — so an IdP asserting `alice@localhost` with auto_provision on would
// otherwise create exactly the row V17 refuses to migrate, after V17 has run.
// See isEngineAddressable for the other five routes that ask the same rule.
import type { ProviderConfig, UpstreamIdentity } from "./types.ts";
import { emailDomain, isEngineAddressable } from "../engine-address.ts";
// Re-exported: emailDomain's rule is an address rule and now lives beside the
// other two, but federation is where its callers and its tests look for it.
export { emailDomain };

/** The trex user an upstream address resolved to, as far as linking cares. */
export interface ExistingUser {
  id: string;
  /** trexdb."user".role: 'user' (or NULL) by default, 'admin' for a trex admin. */
  role: string | null;
}

export type LinkDecision =
  | { action: "link"; userId: string }
  // "provision" leaves the address to the caller and says nothing about what it
  // will be. resolveFederatedUser's caller hands it to provisionUser, which
  // synthesises <slug>@d2e.local for an address-less identity and flags the
  // row; resolve-user.ts's caller hands it to Better Auth, which writes
  // mapping.email's value instead — so that caller has its own guard. A future
  // third caller owes one too: the branches below check isEngineAddressable
  // against `identity.email`, not against whatever the caller will store.
  | { action: "provision" }
  // Fixed codes, never upstream text: they are returned to a browser.
  // "upstream_email_unverified" | "upstream_email_unusable" |
  // "email_domain_not_allowed" | "elevated_account_link_refused" |
  // "no_account" from here, and "account_disabled" from
  // resolveFederatedUser's existing-link path.
  | { action: "refuse"; reason: string };

/**
 * `null`/empty allowlist means unrestricted, which is the pre-existing
 * behaviour and what every existing row has.
 *
 * An address whose domain cannot be determined is refused whenever a list is
 * set — a restriction that cannot be evaluated must not pass.
 */
export function emailDomainAllowed(email: string, allowlist: string[] | null): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  const domain = emailDomain(email);
  if (!domain) return false;
  // Domains are case-insensitive. loadProviders already lower-cases the stored
  // list; doing it again here costs nothing and keeps this function correct for
  // any caller, including a test that passes a list straight in.
  return allowlist.some((entry) => entry.trim().toLowerCase() === domain);
}

/**
 * Whether a trex user holds more than an ordinary account.
 *
 * `trexdb."user".role` is trex's own system role (distinct from the named
 * application roles in `user_role`): it defaults to 'user', is set to 'admin'
 * for the first user / ADMIN_EMAIL, and is what auth-router's admin endpoints
 * gate on. So the only *non*-elevated values are the default ones.
 *
 * Deliberately "anything that is not 'user'" rather than "=== 'admin'": those
 * admin gates are equality checks against a name, so a deployment that adds a
 * further privileged value later would silently fall outside a check written
 * the other way round. Erring towards "elevated" costs an operator one opt-in
 * flag; erring the other way costs an account.
 */
export function isElevatedRole(role: string | null | undefined): boolean {
  if (role === null || role === undefined) return false;
  const normalised = role.trim().toLowerCase();
  return normalised !== "" && normalised !== "user";
}

/**
 * A configured allowlist, reduced to bare lower-cased domains. Whitespace and
 * a leading '@' (a natural way to write a domain in configuration) are
 * tolerated; anything empty is dropped, and a list left with nothing in it
 * becomes `null`, i.e. "no restriction" — the same as an unset column.
 *
 * Moved here from providers.ts, unchanged, because it is now read twice: once
 * by loadProviders, which normalises a whole ProviderConfig, and once by
 * resolve-user.ts, which is handed one raw column off an adapter read and has
 * no ProviderConfig to build. Both have to reach the same answer from the same
 * column or an allowlist would mean one thing on trex's own router and another
 * inside the plugin.
 */
export function normaliseDomains(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().replace(/^@/, "").toLowerCase())
    .filter((d) => d.length > 0);
  return out.length > 0 ? out : null;
}

/**
 * The part of a provider's configuration that decides linking, and nothing
 * else.
 *
 * Narrower than ProviderConfig on purpose: resolve-user.ts is handed a raw
 * adapter row rather than a loaded ProviderConfig and can honestly produce
 * exactly these three fields, where widening the row to a ProviderConfig would
 * mean inventing values for ten columns this decision never reads. A
 * ProviderConfig still satisfies it, so loadProviders' callers are unchanged.
 */
export type LinkPolicy = Pick<
  ProviderConfig,
  "autoProvision" | "emailDomainAllowlist" | "allowElevatedAutoLink"
>;

export function decideLink(
  identity: UpstreamIdentity,
  provider: LinkPolicy,
  existing: ExistingUser | null,
): LinkDecision {
  // No address at all. Decided before the verified-email rule, which exists to
  // stop an upstream claiming an account by asserting its address: with nothing
  // asserted there is no account to claim and nothing to verify, so applying
  // that rule here would refuse every username-only identity instead.
  if (identity.email === null) {
    // Same reasoning as an address with no determinable domain: a restriction
    // that cannot be evaluated must not pass.
    if (provider.emailDomainAllowlist && provider.emailDomainAllowlist.length > 0) {
      return { action: "refuse", reason: "email_domain_not_allowed" };
    }
    if (provider.autoProvision) return { action: "provision" };
    return { action: "refuse", reason: "no_account" };
  }
  if (!identity.emailVerified) {
    return { action: "refuse", reason: "upstream_email_unverified" };
  }
  // Before either branch: an address outside the allowlist is not this
  // provider's to speak for, so it may neither claim an existing account nor
  // mint a new one.
  if (!emailDomainAllowed(identity.email, provider.emailDomainAllowlist)) {
    return { action: "refuse", reason: "email_domain_not_allowed" };
  }
  if (existing) {
    if (isElevatedRole(existing.role) && !provider.allowElevatedAutoLink) {
      return { action: "refuse", reason: "elevated_account_link_refused" };
    }
    return { action: "link", userId: existing.id };
  }
  if (provider.autoProvision) {
    // The only one of the six address-writing routes (enumerated on
    // isEngineAddressable) reached without an administrator: an upstream
    // asserts the address and this branch writes it.
    //
    // Refused rather than repaired, for the reason V17 refuses rather than
    // repairs: an address is an identity and trex cannot pick a different one.
    // Refusing costs this person one sign-in and an error code an operator can
    // act on; provisioning costs them an account that exists, looks migrated,
    // and cannot authenticate — Better Auth validates the address before it
    // looks anybody up, so they would be told only that their credentials are
    // invalid.
    //
    // Only the provision branch asks it. An identity already linked never
    // reaches this module at all, and the `existing` branch above writes no
    // address — it matched one already stored, which whichever route created it
    // has already vetted. The address-less branch above is exempt for a different
    // reason: it provisions a synthesised placeholder, and the slug rule is
    // pinned addressable by placeholder-slug-parity.test.ts.
    if (!isEngineAddressable(identity.email)) {
      return { action: "refuse", reason: "upstream_email_unusable" };
    }
    // Provisioning creates a role-'user' row (see provisionUser), so it cannot
    // produce an elevated account and needs no guard of its own.
    return { action: "provision" };
  }
  return { action: "refuse", reason: "no_account" };
}
