// The federation admin API's database work. Takes a client so tests can script
// it; the router owns connection handling.
import type { LinkRequest, ProviderUpsert } from "./admin-policy.ts";
import { findLinkedUser, provisionUser, upsertAccount } from "./providers.ts";

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
  | { unknownProvider: true };

/**
 * Pre-link one upstream identity to a trex user, ahead of its first sign-in.
 *
 * Unlike the email path at /callback, this is an administrator's assertion, so
 * it links regardless of email verification and of the elevated-account guard.
 * The one thing it refuses is re-pointing a user who is already linked to a
 * different account at the same provider: that is two people, not one.
 */
export async function linkIdentity(client: PgClient, r: LinkRequest): Promise<LinkResult> {
  const provider = await client.query(`SELECT id FROM trexdb.sso_provider WHERE id = $1`, [r.providerId]);
  if (provider.rows.length === 0) return { unknownProvider: true };

  await client.query("BEGIN");
  try {
    let result: LinkResult;
    // Two advisory locks close the races READ COMMITTED leaves open between the
    // check and the insert, since `account` has no unique index on
    // ("userId","providerId") to serialize on:
    //   - the (providerId, accountId) lock: two concurrent calls for the same
    //     upstream account must not both fall through findLinkedUser's "no
    //     existing link" branch and each provision/attach their own user.
    //   - the row lock on the matched trexdb."user" row (FOR UPDATE below):
    //     two concurrent calls for the *same* accountId but different emails
    //     that resolve to different users must not both pass the "other
    //     account at this provider" check before either has inserted — one has
    //     to wait, see the other's account row, and get the 409.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${r.providerId}:${r.accountId}`]);
    const existing = await findLinkedUser(client, r.providerId, r.accountId);
    if (existing) {
      result = { userId: existing.userId, outcome: "already_linked" };
    } else {
      const byEmail = await client.query(
        `SELECT id FROM trexdb."user" WHERE lower(email) = lower($1) AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE`,
        [r.email],
      );
      let userId: string;
      let outcome: "linked" | "created";
      if (byEmail.rows[0]) {
        userId = byEmail.rows[0].id;
        const other = await client.query(
          `SELECT "accountId" FROM trexdb.account WHERE "userId" = $1 AND "providerId" = $2 LIMIT 1`,
          [userId, r.providerId],
        );
        if (other.rows[0] && other.rows[0].accountId !== r.accountId) {
          await client.query("ROLLBACK");
          return { conflict: true, userId };
        }
        outcome = "linked";
      } else {
        userId = await provisionUser(client, {
          sub: r.accountId, email: r.email, name: r.name ?? undefined, emailVerified: true,
        });
        outcome = "created";
      }
      await upsertAccount(client, { userId, providerId: r.providerId, accountId: r.accountId });
      result = { userId, outcome };
    }
    if (r.banned) {
      await client.query(`UPDATE trexdb."user" SET banned = true WHERE id = $1`, [result.userId]);
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
