import { assertEquals } from "jsr:@std/assert";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
// deno-lint-ignore no-explicit-any
type Pool = any;

function dbTest(name: string, fn: (pool: Pool, userId: string) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const { pool } = await import("../db.ts");
      const userId = crypto.randomUUID();
      const clientId = `retire-${userId.slice(0, 8)}`;
      await pool.query(
        `INSERT INTO trexdb."user" (id, name, email, role, "emailVerified")
         VALUES ($1, 'R', $2, 'user', true)`,
        [userId, `retire-${userId.slice(0, 8)}@example.com`],
      );
      await pool.query(
        `INSERT INTO trexdb.session (id, "userId", token, "expiresAt") VALUES ($1, $2, $3, NOW() + interval '1 day')`,
        [`s-${userId}`, userId, `t-${userId}`],
      );
      await pool.query(
        `INSERT INTO trexdb.refresh_token (token_hash, "userId", session_id) VALUES ($1, $2, gen_random_uuid())`,
        [`h-${userId}`, userId],
      );
      await pool.query(
        `INSERT INTO trexdb."oauthClient" (id, "clientId", "redirectUris") VALUES ($1, $1, '[]'::jsonb)`,
        [clientId],
      );
      await pool.query(
        `INSERT INTO trexdb."oauthRefreshToken" (id, token, "clientId", "sessionId", "userId", "expiresAt", "createdAt", scopes)
         VALUES ($1, $1, $2, $3, $4, NOW() + interval '1 day', NOW(), '[]'::jsonb)`,
        [`ort-${userId}`, clientId, `s-${userId}`, userId],
      );
      await pool.query(
        `INSERT INTO trexdb."oauthAccessToken" (id, token, "clientId", "sessionId", "userId", "expiresAt", "createdAt", scopes)
         VALUES ($1, $1, $2, $3, $4, NOW() + interval '1 day', NOW(), '[]'::jsonb)`,
        [`oat-${userId}`, clientId, `s-${userId}`, userId],
      );
      try {
        await fn(pool, userId);
      } finally {
        await pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [userId]);
        await pool.query(`DELETE FROM trexdb."oauthClient" WHERE id = $1`, [clientId]);
      }
    },
  });
}

async function live(pool: Pool, userId: string) {
  const q = async (sql: string) => (await pool.query(sql, [userId])).rows[0].n as number;
  return {
    sessions: await q(`SELECT count(*)::int AS n FROM trexdb.session WHERE "userId" = $1`),
    refresh: await q(`SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1 AND revoked = false`),
    oidc: await q(`SELECT count(*)::int AS n FROM trexdb."oauthRefreshToken" WHERE "userId" = $1`),
    access: await q(`SELECT count(*)::int AS n FROM trexdb."oauthAccessToken" WHERE "userId" = $1`),
  };
}

dbTest("banning through a plain UPDATE revokes every credential", async (pool, userId) => {
  await pool.query(`UPDATE trexdb."user" SET banned = true WHERE id = $1`, [userId]);
  assertEquals(await live(pool, userId), { sessions: 0, refresh: 0, oidc: 0, access: 0 });
});

dbTest("soft_delete_user revokes every credential", async (pool, userId) => {
  await pool.query(`SELECT trexdb.soft_delete_user($1)`, [userId]);
  assertEquals(await live(pool, userId), { sessions: 0, refresh: 0, oidc: 0, access: 0 });
});

dbTest("an unrelated update revokes nothing", async (pool, userId) => {
  await pool.query(`UPDATE trexdb."user" SET name = 'Renamed' WHERE id = $1`, [userId]);
  assertEquals(await live(pool, userId), { sessions: 1, refresh: 1, oidc: 1, access: 1 });
});

dbTest("re-saving an already-banned row and unbanning revoke nothing new", async (pool, userId) => {
  await pool.query(`UPDATE trexdb."user" SET banned = true WHERE id = $1`, [userId]);
  await pool.query(
    `INSERT INTO trexdb.session (id, "userId", token, "expiresAt") VALUES ($1, $2, $3, NOW() + interval '1 day')`,
    [`s2-${userId}`, userId, `t2-${userId}`],
  );
  await pool.query(`UPDATE trexdb."user" SET banned = true, "banReason" = 'again' WHERE id = $1`, [userId]);
  await pool.query(`UPDATE trexdb."user" SET banned = false WHERE id = $1`, [userId]);
  // The first ban already fired and wiped refresh/oidc/access; re-banning and
  // unbanning don't match the trigger's WHEN clause, so nothing more happens.
  assertEquals(await live(pool, userId), { sessions: 1, refresh: 0, oidc: 0, access: 0 });
});

dbTest("restore_user revokes nothing", async (pool, userId) => {
  await pool.query(`SELECT trexdb.soft_delete_user($1)`, [userId]);
  await pool.query(
    `INSERT INTO trexdb.session (id, "userId", token, "expiresAt") VALUES ($1, $2, $3, NOW() + interval '1 day')`,
    [`s3-${userId}`, userId, `t3-${userId}`],
  );
  await pool.query(`SELECT trexdb.restore_user($1)`, [userId]);
  // soft_delete_user already fired and wiped refresh/oidc/access; restore_user
  // doesn't match the trigger's WHEN clause, so nothing more happens.
  assertEquals(await live(pool, userId), { sessions: 1, refresh: 0, oidc: 0, access: 0 });
});
