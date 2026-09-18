// The federation admin API's database work. Takes a client so tests can script
// it; the router owns connection handling.
import type { LinkRequest, ProviderUpsert } from "./admin-policy.ts";
import { findLinkedUser, provisionUser, upsertAccount } from "./providers.ts";
import { isEngineAddressable } from "../engine-address.ts";

// deno-lint-ignore no-explicit-any
type PgClient = any;

export async function upsertProvider(client: PgClient, p: ProviderUpsert): Promise<void> {
  await client.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer, discovery_url,
        authorization_endpoint, scopes, groups_source, groups_claim, auto_provision, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
 * wherever it would be resolved or written, and nowhere else. This is the
 * fourth of the five doors onto trexdb."user": V17 refuses to migrate an
 * installation the engine cannot serve, /signup and /admin/create-user refuse
 * to create such a user, PUT /user refuses to set one, and decideLink refuses
 * to auto-provision one from an upstream claim — but a migration drives THIS
 * route, in bulk, AFTER V17 has run, so an address the engine cannot resolve
 * would walk straight past the first three and create an account nobody can
 * ever sign in to. A refusal per identity is what a migration wants: it records
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
