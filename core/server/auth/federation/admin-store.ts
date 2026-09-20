// The federation admin API's database work. Takes a client so tests can script
// it; the router owns connection handling.
import type { LinkRequest, ProviderUpsert } from "./admin-policy.ts";
import { findLinkedUser, provisionUser, upsertAccount } from "./providers.ts";
import { oidcConfigFor } from "./sso-config.ts";
import { isEngineAddressable } from "../engine-address.ts";

// deno-lint-ignore no-explicit-any
type PgClient = any;

/**
 * Rebuild trexdb.sso_provider."oidcConfig" from the row's own columns.
 *
 * V20 gave the table the column and backfilled it, and asserted a
 * synchronisation property that no code provided: `oidcConfig` had no writer at
 * all. @better-auth/sso reads its whole per-provider configuration out of that
 * one JSON column, while trex's own router reads the source columns — so
 * without this a provider created through the admin API has `oidcConfig = NULL`
 * and cannot authenticate anybody, and an *edited* one goes stale: a rotated
 * secret, a changed issuer or a changed authorize URL is honoured by trex's
 * router and silently ignored by the plugin, which is the worse of the two
 * because nothing looks broken.
 *
 * Read back rather than computed from the caller's payload, because two of the
 * columns the configuration is built from are not in any writer's payload:
 * `claim_map` (which decides `mapping.email`, and so decides whether a
 * username-only upstream can sign in at all) and, for V1's save_sso_provider,
 * every federation column. The row after the write is the only place they agree.
 *
 * No discovery fetch, and so no network dependency on an administrator's write.
 * `jwksEndpoint` is left out: ensureRuntimeDiscovery runs unconditionally on
 * the callback, the sign-in path and the IdP bounce
 * (@better-auth/sso/dist/index.mjs:3820, :3698, :4114) and fills it precisely
 * because it is absent, and discoverOIDCConfig merges `existingConfig?.X ?? doc.X`
 * so nothing stored here is overwritten. Persisting it would be an
 * optimisation, not a repair, and it would make provider administration fail
 * whenever the upstream happened to be unreachable.
 *
 * Returns false for a row that carries no issuer: V1's save_sso_provider can
 * create one, it is configuration in progress rather than a provider, and
 * `loadProviders` already excludes it. Building a configuration around a NULL
 * issuer would produce a row the plugin resolves and then fails on.
 *
 * A rewrite does abort any sign-in already in flight against the old
 * configuration (isCurrentSSOProviderReference, dist/index.mjs:3717). That is
 * the wanted outcome for this caller and not a side effect to design around: an
 * administrator who has just rotated a client secret does not want the flows
 * still using the old one to complete.
 */
export async function refreshProviderOidcConfig(client: PgClient, id: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT "clientId", "clientSecret", issuer, discovery_url, authorization_endpoint,
            scopes, claim_map
       FROM trexdb.sso_provider WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.issuer == null) return false;
  const written = await client.query(
    `UPDATE trexdb.sso_provider SET "oidcConfig" = $2 WHERE id = $1 RETURNING id`,
    [id, oidcConfigFor({ ...row, claim_map: row.claim_map ?? {}, jwks_endpoint: null })],
  );
  if (written.rows.length === 0) {
    // Under a role trexdb.sso_provider's admin_all_sso_providers policy applies
    // to, an UPDATE returns zero rows and raises nothing — which is how a
    // Phase 1 migration came to report success having changed nothing. The row
    // was read one statement ago, so a write that matches nothing is that, not
    // a deleted provider.
    throw new Error(
      `could not write oidcConfig for sso_provider ${id}: the UPDATE matched no row, ` +
        `which under row-level security means the connection may not write this table`,
    );
  }
  return true;
}

export async function upsertProvider(client: PgClient, p: ProviderUpsert): Promise<void> {
  // One transaction, because a row written with a stale or absent oidcConfig is
  // exactly the state this function exists to prevent: the admin API would
  // answer 500 and leave a provider trex's router honours and the plugin
  // cannot.
  await client.query("BEGIN");
  try {
    await upsertProviderRow(client, p);
    await refreshProviderOidcConfig(client, p.id);
    await client.query("COMMIT");
  } catch (err) {
    // A rollback that itself fails must not replace the real error.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

/**
 * The row itself: trex's own federation columns, plus the two the plugin needs
 * on every row and that nothing else on this path would fill.
 *
 * "providerId" is written rather than left to V20's BEFORE INSERT OR UPDATE
 * trigger. The trigger fills only a NULL and V20's own comment calls that "the
 * default, not the rule", so relying on it would make the admin API's rows
 * correct by way of a mechanism that exists for the writers that cannot be
 * changed (trexdb.save_sso_provider). Writing $1 into it is what the CHECK
 * ("providerId" = id) already requires, so this can only ever agree with the
 * trigger — and it keeps the statement true on its own.
 *
 * domain is the issuer's host, PORT INCLUDED, lower-cased — computed here with
 * V20's backfill expression character for character, so a provider created
 * through this route and one migrated by V20 from the same issuer hold the same
 * value. It is derived in SQL rather than with `new URL(p.issuer).host` for two
 * reasons: parseProviderUpsert checks only that issuer is a non-empty string,
 * so `new URL` would turn a PUT that is a 204 today into a 500 for an issuer
 * that is not a URL; and one expression in two places cannot drift the way two
 * implementations can.
 *
 * The column is inert while domainVerification stays disabled — isTrustedProvider
 * is gated on `"domainVerified" in provider` (dist/index.mjs:3952, :3008), which
 * the model does not carry, and findVerifiedDomainProviders filters on the same
 * flag — so this is not a trust decision. It is written because the plugin's
 * model declares the field required, because it feeds
 * computeProviderAuthenticationFingerprint (:916-920), and because a NULL here
 * on new rows only would be a silent disagreement with every migrated row.
 *
 * jwks_endpoint is NOT written, and not because it is unimportant: there is no
 * such column. V20 says so explicitly — the resolved JWKS URL lives inside the
 * serialized oidcConfig — and it is left out of that too, because
 * ensureRuntimeDiscovery runs unconditionally ahead of the jwks_endpoint_not_found
 * check (dist/index.mjs:3820) and fills it precisely because it is absent. See
 * refreshProviderOidcConfig.
 *
 * Every optional column is ASSIGNED from EXCLUDED, never COALESCEd with the
 * stored value. This is a PUT: a body that omits discoveryUrl means "there is
 * no discovery URL override", and merging would make it impossible to clear one
 * through this API at all. The sibling upsertAccount does merge refresh tokens,
 * for a reason that is specific to refresh tokens and does not generalise here.
 */
async function upsertProviderRow(client: PgClient, p: ProviderUpsert): Promise<void> {
  await client.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer, discovery_url,
        authorization_endpoint, scopes, groups_source, groups_claim, auto_provision,
        "providerId", domain, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $1,
             lower(split_part(regexp_replace($6, '^[A-Za-z][A-Za-z0-9+.-]*://', ''), '/', 1)),
             NOW())
     ON CONFLICT (id) DO UPDATE SET
       "displayName" = EXCLUDED."displayName",
       "clientId" = EXCLUDED."clientId",
       "clientSecret" = EXCLUDED."clientSecret",
       enabled = EXCLUDED.enabled,
       issuer = EXCLUDED.issuer,
       discovery_url = EXCLUDED.discovery_url,
       authorization_endpoint = EXCLUDED.authorization_endpoint,
       scopes = EXCLUDED.scopes,
       groups_source = EXCLUDED.groups_source,
       groups_claim = EXCLUDED.groups_claim,
       auto_provision = EXCLUDED.auto_provision,
       "providerId" = EXCLUDED."providerId",
       -- Recomputed from the issuer in the same statement that writes the
       -- issuer, so the two can never disagree after an edit that moves the
       -- upstream to a different host.
       domain = EXCLUDED.domain,
       "updatedAt" = NOW()`,
    [p.id, p.displayName, p.clientId, p.clientSecret, p.enabled, p.issuer, p.discoveryUrl,
     p.authorizationEndpoint, p.scopes, p.groupsSource, p.groupsClaim, p.autoProvision],
  );
}

export async function setProviderEnabled(client: PgClient, id: string, enabled: boolean): Promise<boolean> {
  const { rows } = await client.query(
    `UPDATE trexdb.sso_provider SET enabled = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING id`,
    [id, enabled],
  );
  return rows.length > 0;
}

export type LinkResult =
  | { userId: string; outcome: "linked" | "created" | "already_linked" }
  | { conflict: true; userId: string }
  | { unaddressableEmail: true; email: string }
  | { unknownProvider: true };

/**
 * Pre-link one upstream identity to a trex user, ahead of its first sign-in.
 *
 * Unlike the email path at /callback, this is an administrator's assertion, so
 * it links regardless of email verification and of the elevated-account guard.
 * The one thing it refuses is re-pointing a user who is already linked to a
 * different account at the same provider: that is two people, not one.
 *
 * With `r.userId` set, the identity is bound to exactly that trex user id or to
 * nothing. The id is the token `sub`; linking to a user with any other id would
 * hand the person a different `sub` and orphan everything keyed by the old one.
 *
 * The address the caller supplies is checked against isEngineAddressable
 * wherever it would be resolved or written, and nowhere else. It is one of the
 * six routes that write a login address, all enumerated on isEngineAddressable
 * — and the one a migration drives, in bulk, AFTER V17 has run, so an address
 * the engine cannot resolve would walk straight past V17's refusal and create
 * an account nobody can ever sign in to. A refusal per identity is what a migration wants: it records
 * the skip with a reason and keeps going, which is strictly better than a user
 * row that looks migrated and is not.
 *
 * Deliberately not checked for an identity that is already linked, nor for one
 * bound by `r.userId` to a user that exists: neither reads the address at all,
 * and re-running a migration over rows it already created must stay idempotent.
 */
export async function linkIdentity(client: PgClient, r: LinkRequest): Promise<LinkResult> {
  const provider = await client.query(`SELECT id FROM trexdb.sso_provider WHERE id = $1`, [r.providerId]);
  if (provider.rows.length === 0) return { unknownProvider: true };

  await client.query("BEGIN");
  try {
    let result: LinkResult;
    // An advisory lock and a row lock close the races READ COMMITTED leaves
    // open between the check and the insert, since `account` has no unique
    // index on ("userId","providerId") to serialize on:
    //   - the (providerId, accountId) advisory lock: two concurrent calls for
    //     the same upstream account must not both fall through
    //     findLinkedUser's "no existing link" branch and each provision/attach
    //     their own user.
    //   - the row lock on the matched trexdb."user" row (FOR UPDATE below):
    //     two concurrent calls for the *same* accountId but different emails
    //     that resolve to different users must not both pass the "other
    //     account at this provider" check before either has inserted — one has
    //     to wait, see the other's account row, and get the 409.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${r.providerId}:${r.accountId}`]);
    if (r.userId !== null) {
      // A row lock cannot serialize two calls that both find no user with this
      // id and both try to create it; this can. Always taken after the account
      // lock, so the two levels are acquired in one order and cannot deadlock.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`user:${r.userId}`]);
    }
    const existing = await findLinkedUser(client, r.providerId, r.accountId);
    if (existing) {
      if (r.userId !== null && existing.userId !== r.userId) {
        await client.query("ROLLBACK").catch(() => {});
        return { conflict: true, userId: existing.userId };
      }
      result = { userId: existing.userId, outcome: "already_linked" };
    } else {
      const target = r.userId !== null
        ? await resolveRequestedUser(client, r, r.userId)
        : await resolveUserByEmail(client, r);
      if ("conflict" in target || "unaddressableEmail" in target) {
        // A rollback that itself fails must not replace this outcome.
        await client.query("ROLLBACK").catch(() => {});
        return target;
      }
      await upsertAccount(client, { userId: target.userId, providerId: r.providerId, accountId: r.accountId });
      result = target;
    }
    if (r.banned) {
      await client.query(`UPDATE trexdb."user" SET banned = true WHERE id = $1`, [result.userId]);
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    // A rollback that itself fails must not replace the real error.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

type LinkTarget =
  | { userId: string; outcome: "linked" | "created" }
  | { conflict: true; userId: string }
  | { unaddressableEmail: true; email: string };

/** Refuses a user who already carries a different account at this provider. */
async function otherAccountConflict(
  client: PgClient,
  userId: string,
  r: LinkRequest,
): Promise<LinkTarget | null> {
  const other = await client.query(
    `SELECT "accountId" FROM trexdb.account WHERE "userId" = $1 AND "providerId" = $2 LIMIT 1`,
    [userId, r.providerId],
  );
  if (other.rows[0] && other.rows[0].accountId !== r.accountId) return { conflict: true, userId };
  return null;
}

async function resolveUserByEmail(client: PgClient, r: LinkRequest): Promise<LinkTarget> {
  // Every path out of here either matches an existing row on this address or
  // provisions a user with it, so the address has to be one the engine can
  // resolve before either happens.
  if (!isEngineAddressable(r.email)) return { unaddressableEmail: true, email: r.email };
  const byEmail = await client.query(
    `SELECT id FROM trexdb."user" WHERE lower(email) = lower($1) AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE`,
    [r.email],
  );
  if (byEmail.rows[0]) {
    const userId: string = byEmail.rows[0].id;
    return (await otherAccountConflict(client, userId, r)) ?? { userId, outcome: "linked" };
  }
  const userId = await provisionUser(client, {
    sub: r.accountId, email: r.email, name: r.name ?? undefined, emailVerified: true,
  });
  return { userId, outcome: "created" };
}

async function resolveRequestedUser(client: PgClient, r: LinkRequest, userId: string): Promise<LinkTarget> {
  const byId = await client.query(
    `SELECT id, "deletedAt" FROM trexdb."user" WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  if (byId.rows[0]) {
    // A soft-deleted row still owns the id, so creating would fail on the
    // primary key; linking would resurrect an account an administrator
    // removed. Neither is this call's decision to make.
    if (byId.rows[0].deletedAt != null) return { conflict: true, userId };
    return (await otherAccountConflict(client, userId, r)) ?? { userId, outcome: "linked" };
  }
  // No user has this id, so this call is about to resolve or write the address.
  // Asked here rather than at the top: the branch above never reads it, and an
  // identity already bound to an existing user must keep linking.
  if (!isEngineAddressable(r.email)) return { unaddressableEmail: true, email: r.email };
  // A user holding the address under a different id is the same person migrated
  // some other way, or a different person; either way the requested id cannot be
  // honoured without an administrator reconciling them.
  // Deleted rows count too: user.email is UNIQUE across them, so the insert
  // would fail anyway, and a 409 naming the row beats an opaque 500.
  const byEmail = await client.query(
    `SELECT id FROM trexdb."user" WHERE lower(email) = lower($1)
      ORDER BY ("deletedAt" IS NULL) DESC LIMIT 1`,
    [r.email],
  );
  if (byEmail.rows[0]) return { conflict: true, userId: byEmail.rows[0].id };
  await provisionUser(client, {
    sub: r.accountId, email: r.email, name: r.name ?? undefined, emailVerified: true,
  }, { id: userId });
  return { userId, outcome: "created" };
}
