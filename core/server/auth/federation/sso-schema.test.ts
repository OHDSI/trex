// What trexdb.sso_provider has to look like before @better-auth/sso may be
// mounted at all.
//
// Since 1.7 a schema Better Auth disagrees with does not warn, it throws — and
// the enforcement point is runWithTransaction
// (@better-auth/core/dist/context/transaction.mjs:59), which sign-UP goes
// through as much as sign-in (better-auth/dist/api/routes/sign-up.mjs:143,
// db/internal-adapter.mjs:121). So mounting the plugin against an unmigrated
// table does not degrade federation, it breaks the whole engine. That is the
// thing this file measures: the engine, with sso() mounted, still signs a user
// up and back in.
//
// Gated on DATABASE_URL like schema-validate.test.ts and the rest of the auth
// suite: none of it can be asserted without a real database, and inventing a
// URL would un-gate every later suite in the same process against one that
// does not exist.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { sso } from "@better-auth/sso";
import { ssoProviderSchema } from "./sso-config.ts";
import { _resetRootKeyCache } from "../keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * better-auth.ts derives its secret from TREX_ROOT_KEY at module evaluation
 * time, so the variable has to be in place before the import and handed back
 * afterwards — keys.test.ts asserts getRootKey throws without it.
 */
async function loadModules() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      auth: (await import("../better-auth.ts")).auth,
      pool: (await import("../../db.ts")).pool,
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    _resetRootKeyCache();
  }
}

const loaded = DATABASE_URL ? await loadModules() : null;

/**
 * The production engine plus the plugin, and nothing else changed.
 *
 * Built from `auth.options` rather than from a fresh option block on purpose:
 * a minimal instance would not declare trexdb."user"'s own NOT NULL columns
 * and would fail the schema check for reasons that have nothing to do with
 * sso_provider — which would make every assertion below pass or fail for the
 * wrong table.
 *
 * redirectURI is a literal rather than federationRedirectUri(), which throws
 * when TREX_FEDERATION_REDIRECT_URI is unset (spike §8.5).
 */
function authWithSso(options: Record<string, unknown>) {
  return betterAuth({
    ...options,
    plugins: [
      ...(options.plugins as unknown[]),
      sso({
        redirectURI: "https://trex.test/api/auth/sso/callback",
        schema: { ssoProvider: ssoProviderSchema },
      }),
    ],
  } as Parameters<typeof betterAuth>[0]);
}

/**
 * The pg pool is a singleton owned by ../../db.ts and deliberately outlives
 * every test, so the resource and op sanitizers would report it as a leak.
 */
function dbTest(name: string, fn: (l: NonNullable<typeof loaded>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !loaded,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(loaded!),
  });
}

/** The migration under test, replayed the way core/schema is applied. */
const MIGRATION = new URL("../../../schema/V20__sso_provider_better_auth.sql", import.meta.url);

dbTest("the engine with sso() mounted has no outstanding schema migration", async ({ auth }) => {
  // The plugin declares issuer, oidcConfig, samlConfig, userId, providerId,
  // organizationId and domain. diffSchema counts every declared field as a
  // column Better Auth writes and reports a missing-column for one the table
  // has not got (schema-diff.mjs:44-46) — so this is the whole of what the
  // migration owes the plugin, stated as data rather than as a list in a brief.
  const complaints: string[] = [];
  const { toBeCreated, toBeAdded, toBeAddedIndexes, unsafeChanges, schemaProblems } =
    await getMigrations({
      ...authWithSso(auth.options as unknown as Record<string, unknown>).options,
      logger: {
        disabled: false,
        log: (level: string, message: string) => {
          if (level === "warn" || level === "error") complaints.push(message);
        },
      },
      // The plan is only read, never run, so a refusal to add a column must
      // come back as data rather than as a throw that hides the rest of it.
    } as Parameters<typeof getMigrations>[0], { throwOnUnsafe: false });

  assertEquals(
    {
      toBeCreated: toBeCreated.map((t) => t.table),
      toBeAdded: toBeAdded.map((t) => `${t.table}: ${Object.keys(t.fields).join(", ")}`),
      toBeAddedIndexes: toBeAddedIndexes.map((i) => `${i.table}: ${i.name}`),
      unsafeChanges,
      schemaProblems,
      // Pinned rather than emptied, because each one is a deliberate
      // divergence and an empty expectation could only be bought by giving up
      // one of them. Listed here so a NEW warning — including one about a
      // table the migration does own — fails this test.
      //
      //   issuer/domain — V11 left issuer nullable so a pre-federation row
      //     keeps working and is simply not usable for federation;
      //     loadProviders' `issuer IS NOT NULL` is what carries the
      //     distinction, and domain is derived from issuer so it is NULL for
      //     exactly those rows.
      //   userId — trex has no value for it: the admin API authenticates with
      //     a service-role key that names no user.
      //   email_domain_allowlist — Better Auth's `string[]` means jsonb on
      //     postgres (get-migration.mjs:536-540), and the column is TEXT[]
      //     from V12. Reads are unaffected (node-postgres parses the array
      //     before the adapter sees it) and nothing writes the column through
      //     the engine — sso-config.ts declares it `input: false` and the
      //     federation admin API writes it with its own SQL. There is no field
      //     type that describes a Postgres text[], so the warning cannot be
      //     removed without dropping the declaration, which would silently
      //     drop the column from every adapter read (spike §3/Q3b).
      //
      // providerId is NOT in this list: the migration makes it NOT NULL, which
      // is the whole point of the mirror.
      complaints: complaints.map((c) => c.replace(/\s+/g, " ").slice(0, 60)),
    },
    {
      toBeCreated: [],
      toBeAdded: [],
      toBeAddedIndexes: [],
      unsafeChanges: [],
      schemaProblems: [],
      complaints: [
        'Column "issuer" on table "sso_provider" stays nullable while',
        'Column "userId" on table "sso_provider" stays nullable while',
        'Column "domain" on table "sso_provider" stays nullable while',
        "Field email_domain_allowlist in table sso_provider has a dif",
      ],
    },
  );
});

dbTest("Better Auth's own schema check passes with sso() mounted", async ({ auth }) => {
  // getMigrations cannot see a column trex has that Better Auth does not
  // write; only the runtime check reports an unexpected-required-column, and
  // it is the check that actually runs in production. Assert the real thing.
  const ctx = await authWithSso(auth.options as unknown as Record<string, unknown>)
    .$context as { checkSchema?: () => Promise<void> | undefined };
  assertEquals(typeof ctx.checkSchema, "function");
  await ctx.checkSchema!();
});

dbTest("the engine still signs a user up and back in with sso() mounted", async ({ auth }) => {
  // The measurement §8.1 of the spike addendum records: with sso() mounted
  // against an unmigrated table, auth.api.signUpEmail itself throws
  // "Database schema mismatch", because runWithTransaction validates before
  // the insert. Sign-up and sign-in here are therefore not federation tests,
  // they are the blast-radius test — the whole engine is what the migration
  // protects.
  const engine = authWithSso(auth.options as unknown as Record<string, unknown>);
  const email = `sso-schema-${crypto.randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";

  const signedUp = await engine.api.signUpEmail({
    body: { email, password, name: "SSO schema probe" },
  });
  assertEquals(signedUp.user.email, email);

  const signedIn = await engine.api.signInEmail({ body: { email, password } });
  assertEquals(signedIn.user.email, email);
});

dbTest("the plugin resolves a provider row by providerId", async ({ auth, pool }) => {
  // resolveOIDCProvider looks a provider up by providerId on every
  // /sign-in/sso and every callback (dist/index.mjs:4082-4103), never by the
  // primary key. trex's primary key is `id`; the migration's backfill is what
  // makes the two agree, and the adapter read below is the one the plugin
  // actually makes.
  const id = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  // A second row, shaped like the provider the one installation that matters
  // actually carries. The minimal row reaches none of the three expressions
  // that installation depends on — its issuer has no trailing slash, its
  // claim_map is empty and its authorization_endpoint is NULL — so the
  // trailing-slash trim, the claim_map lookup and the override could each be
  // deleted from the migration with every assertion below still passing. That
  // is the "the fixture never reaches the branch" hole, and it has to be closed
  // here rather than in a manual rehearsal, because the migration runs once,
  // against that installation.
  const d2eId = `task4d_${crypto.randomUUID().replace(/-/g, "").slice(0, 11)}`;
  const migration = await Deno.readTextFile(MIGRATION);
  // The row has to be genuinely legacy-shaped — providerId, domain and
  // oidcConfig all NULL, which is what a pre-V20 database holds. The mirror
  // trigger and the NOT NULL the migration installs would otherwise fill or
  // refuse providerId on the INSERT, and this test would pass whether or not
  // the backfill works at all. Putting the table back the way V19 left it and
  // replaying the migration over it is therefore both the setup for the
  // assertions and the check that the migration converts a populated database
  // rather than only an empty one.
  await pool.query(
    `ALTER TABLE trexdb.sso_provider ALTER COLUMN "providerId" DROP NOT NULL;
     DROP TRIGGER IF EXISTS trg_sso_provider_mirror_provider_id ON trexdb.sso_provider`,
  );
  try {
    await pool.query(
      `INSERT INTO trexdb.sso_provider
         (id, "displayName", "clientId", "clientSecret", enabled, issuer, discovery_url)
       VALUES ($1, 'Task 4 probe', 'probe-client', 'probe-secret', true,
               'https://idp.example.test/oidc', NULL)`,
      [id],
    );
    await pool.query(
      `INSERT INTO trexdb.sso_provider
         (id, "displayName", "clientId", "clientSecret", enabled, issuer, discovery_url,
          scopes, claim_map, authorization_endpoint)
       VALUES ($1, 'Task 4 d2e-shaped probe', 'd2e', 'sec', true,
               -- Trailing slashes and mixed case, because d2e's Logto issuer
               -- has them and because both are load-bearing: one feeds the trim
               -- that builds discoveryEndpoint, the other the lower() that
               -- builds domain.
               'https://Proj-Logto-1.d2e.local:3001/oidc///', NULL,
               -- A double space, so the empty element array_remove drops is
               -- present rather than assumed absent.
               'openid  profile email',
               '{"email":"username","name":"display_name"}'::jsonb,
               -- V13's whole reason for existing: Logto serves discovery over
               -- an internal hostname but names an authorize URL no browser can
               -- resolve.
               'https://logto.example.test/oidc/auth')`,
      [d2eId],
    );
    const legacy = await pool.query(
      `SELECT id, "providerId", domain, "oidcConfig"
         FROM trexdb.sso_provider WHERE id = ANY($1) ORDER BY id`,
      [[id, d2eId].sort()],
    );
    assertEquals(
      legacy.rows.map((r: Record<string, unknown>) => ({
        providerId: r.providerId,
        domain: r.domain,
        oidcConfig: r.oidcConfig,
      })),
      [
        { providerId: null, domain: null, oidcConfig: null },
        { providerId: null, domain: null, oidcConfig: null },
      ],
      "a row was not legacy-shaped, so the backfill below proves nothing",
    );

    await pool.query(migration);

    const ctx = await authWithSso(auth.options as unknown as Record<string, unknown>).$context;
    const row = await ctx.adapter.findOne({
      model: "ssoProvider",
      where: [{ field: "providerId", value: id }],
    }) as Record<string, unknown> | null;

    assertNotEquals(row, null, "the plugin cannot find the row by providerId");
    assertEquals(row!.id, id);
    assertEquals(row!.providerId, id);
    assertEquals(row!.domain, "idp.example.test");
    // The plugin reads its whole per-provider configuration out of this JSON,
    // as a string — not as jsonb. `type: "string"` in its model means the
    // column must be text, and JSON.parse is what the plugin itself does.
    assertEquals(typeof row!.oidcConfig, "string");
    const config = JSON.parse(row!.oidcConfig as string);
    assertEquals(config.issuer, "https://idp.example.test/oidc");
    assertEquals(config.clientId, "probe-client");
    assertEquals(config.clientSecret, "probe-secret");
    assertEquals(
      config.discoveryEndpoint,
      "https://idp.example.test/oidc/.well-known/openid-configuration",
    );
    assertEquals(config.mapping.email, "sub");
    assertEquals(config.tokenEndpointAuthentication, "client_secret_post");
    assertEquals(config.overrideUserInfo, false);
    // jsonb_strip_nulls has to drop the key, not store a literal null: a null
    // would pass a presence check written as `"authorizationEndpoint" in config`.
    assertEquals("authorizationEndpoint" in config, false);
    // Declared by the plugin's model but with no source value in trex. They
    // must be present as columns and are legitimately NULL.
    assertEquals(row!.samlConfig, null);
    assertEquals(row!.userId, null);
    assertEquals(row!.organizationId, null);

    const d2eRow = await ctx.adapter.findOne({
      model: "ssoProvider",
      where: [{ field: "providerId", value: d2eId }],
    }) as Record<string, unknown> | null;
    assertNotEquals(d2eRow, null, "the plugin cannot find the d2e-shaped row");
    // Lowercased: hostnames are case-insensitive and the plugin compares this
    // column as text. The port belongs to the host and stays.
    assertEquals(d2eRow!.domain, "proj-logto-1.d2e.local:3001");
    const d2e = JSON.parse(d2eRow!.oidcConfig as string);
    // The issuer itself is preserved verbatim, case and trailing slashes
    // included — it is compared against the `iss` claim, so the migration must
    // not normalise it.
    assertEquals(d2e.issuer, "https://Proj-Logto-1.d2e.local:3001/oidc///");
    // ...but the URL derived from it must be trimmed, or discovery is fetched
    // from an issuer//.well-known path the upstream does not serve.
    assertEquals(
      d2e.discoveryEndpoint,
      "https://Proj-Logto-1.d2e.local:3001/oidc/.well-known/openid-configuration",
    );
    // The override, carried through rather than dropped. Without it the browser
    // is sent to an internal hostname it cannot resolve.
    assertEquals(d2e.authorizationEndpoint, "https://logto.example.test/oidc/auth");
    // The lever the whole phase's GO verdict rests on: mapping.email names a
    // claim, and for a username-only upstream naming the wrong one refuses
    // every identity at dist/index.mjs:3938. claim_map's entry must win over
    // the 'sub' fallback, and an unmapped field must still fall back.
    assertEquals(d2e.mapping.email, "username");
    assertEquals(d2e.mapping.name, "display_name");
    assertEquals(d2e.mapping.emailVerified, "email_verified");
    // The double space in `scopes` must not become an empty scope.
    assertEquals(d2e.scopes, ["openid", "profile", "email"]);

    // The replay must also have restored the two guards it dropped above, or
    // the next row written the pre-V20 way is invisible again.
    const guards = await pool.query(
      `SELECT (SELECT attnotnull
                 FROM pg_attribute
                WHERE attrelid = 'trexdb.sso_provider'::regclass
                  AND attname = 'providerId')                       AS not_null,
              EXISTS (SELECT 1 FROM pg_trigger
                       WHERE tgrelid = 'trexdb.sso_provider'::regclass
                         AND tgname = 'trg_sso_provider_mirror_provider_id') AS mirrored`,
    );
    assertEquals(guards.rows[0], { not_null: true, mirrored: true });
  } finally {
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = ANY($1)`, [[id, d2eId]]);
    // Whatever happened above, the table must not be left without the guards
    // the migration installs.
    await pool.query(migration);
  }
});

dbTest("a provider written the pre-V20 way is still resolvable by the plugin", async ({ pool }) => {
  // trexdb.save_sso_provider (V1) inserts five columns and knows nothing about
  // providerId; the sso-save MCP tool still calls it. Without the mirror
  // trigger such a row exists, is enabled, and no sign-in can ever resolve it,
  // because the plugin looks a provider up by providerId alone.
  const id = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await pool.query(`SELECT trexdb.save_sso_provider($1, 'Legacy writer', 'c', 's', true)`, [id]);
  try {
    const { rows } = await pool.query(
      `SELECT "providerId" FROM trexdb.sso_provider WHERE id = $1`,
      [id],
    );
    assertEquals(rows[0].providerId, id);
  } finally {
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});

dbTest("replaying the migration does not rewrite a row that already has a config", async ({ pool }) => {
  // The one installation that matters already has provider rows, and the
  // migration has to be safe to replay against it. A backfill that overwrote
  // a configured value would silently discard whatever wrote it — so every
  // UPDATE is guarded on the column still being NULL, and this pins that.
  const id = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await pool.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer,
        "providerId", domain, "oidcConfig")
     VALUES ($1, 'Task 4 replay', 'c', 's', true, 'https://idp.example.test/oidc',
             $1, 'chosen.example.test', '{"issuer":"hand-written"}')`,
    [id],
  );
  try {
    await pool.query(await Deno.readTextFile(MIGRATION));
    const { rows } = await pool.query(
      `SELECT domain, "oidcConfig" FROM trexdb.sso_provider WHERE id = $1`,
      [id],
    );
    assertEquals(rows[0].domain, "chosen.example.test");
    assertEquals(rows[0].oidcConfig, '{"issuer":"hand-written"}');
  } finally {
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});

dbTest("providerId is unique, because the plugin declares it so", async ({ pool }) => {
  // The plugin's model says `required: true, unique: true`, and it resolves a
  // provider by this column alone — two rows sharing one providerId would make
  // which upstream a sign-in reaches a matter of row order.
  //
  // The mirror CHECK makes a duplicate unconstructible through an ordinary
  // insert — two rows sharing a providerId would have to share an id, which the
  // primary key already refuses — so it is dropped for the length of this test
  // and put back by replaying the migration. That is not a way of weakening the
  // assertion: it is the only way to show the unique constraint would still
  // catch a duplicate on its own, which is exactly what has to remain true if
  // providerId is ever decoupled from id.
  const a = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const b = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await pool.query(
    `ALTER TABLE trexdb.sso_provider
       DROP CONSTRAINT sso_provider_provider_id_mirrors_id_check`,
  );
  await pool.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", "providerId")
     VALUES ($1, 'A', 'c', 's', $1)`,
    [a],
  );
  try {
    let message = "";
    try {
      await pool.query(
        `INSERT INTO trexdb.sso_provider
           (id, "displayName", "clientId", "clientSecret", "providerId")
         VALUES ($1, 'B', 'c', 's', $2)`,
        [b, a],
      );
    } catch (error) {
      message = (error as Error).message;
    }
    assertStringIncludes(message, "sso_provider_provider_id_key");
  } finally {
    // The rows have to go before the replay, or restoring the CHECK fails on
    // the very row this test created to violate it.
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = ANY($1)`, [[a, b]]);
    await pool.query(await Deno.readTextFile(MIGRATION));
  }
});

dbTest("providerId cannot be pointed anywhere but at id", async ({ pool }) => {
  // The trigger fills only a NULL, by design, so without the CHECK an explicit
  // UPDATE splits trex's identity for a provider — everything trex has keys on
  // id — from the plugin's, which resolves by providerId alone, inside one row.
  // That is the "two sides disagree about which upstreams exist" failure the
  // mirror exists to prevent, and it has to fail where it happens rather than
  // be silently corrected: the writer most likely to get this wrong is a future
  // one reading the wrong field into the column.
  const id = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await pool.query(
    `INSERT INTO trexdb.sso_provider (id, "displayName", "clientId", "clientSecret")
     VALUES ($1, 'Mirror', 'c', 's')`,
    [id],
  );
  try {
    let message = "";
    try {
      await pool.query(
        `UPDATE trexdb.sso_provider SET "providerId" = $2 WHERE id = $1`,
        [id, `${id}_other`],
      );
    } catch (error) {
      message = (error as Error).message;
    }
    assertStringIncludes(message, "sso_provider_provider_id_mirrors_id_check");

    // Setting it back to NULL is not a way around the CHECK either: the trigger
    // refills it from id before the constraint is evaluated.
    await pool.query(`UPDATE trexdb.sso_provider SET "providerId" = NULL WHERE id = $1`, [id]);
    const { rows } = await pool.query(
      `SELECT "providerId" FROM trexdb.sso_provider WHERE id = $1`,
      [id],
    );
    assertEquals(rows[0].providerId, id);
  } finally {
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});

dbTest("the constraint guards key on the column, not on the constraint name", async ({ pool }) => {
  // A guard that keys on the name adds a second, duplicate constraint to any
  // database where the first was renamed, and skips a constraint that is
  // missing under a different name. The unique constraint and the userId
  // foreign key are both guarded on their column set instead; this drops one
  // and renames the other, replays, and asserts the migration reaches the right
  // conclusion about each.
  const migration = await Deno.readTextFile(MIGRATION);
  // The foreign key is dropped by looking it up on its column, not by its name
  // — an inline REFERENCES on ADD COLUMN produces `sso_provider_userId_fkey`
  // rather than the name the migration gives it, so a drop keyed on one name
  // silently removes nothing and the assertion below would pass against the
  // very shape this test exists to rule out. (Measured: it did.)
  await pool.query(
    `DO $$
     DECLARE fk_name TEXT;
     BEGIN
       SELECT conname INTO fk_name
         FROM pg_constraint
        WHERE conrelid = 'trexdb.sso_provider'::regclass
          AND contype = 'f'
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                               WHERE attrelid = 'trexdb.sso_provider'::regclass
                                 AND attname = 'userId')];
       IF fk_name IS NULL THEN
         RAISE EXCEPTION 'no foreign key on userId to drop';
       END IF;
       EXECUTE format('ALTER TABLE trexdb.sso_provider DROP CONSTRAINT %I', fk_name);
     END
     $$;
     ALTER TABLE trexdb.sso_provider
       RENAME CONSTRAINT sso_provider_provider_id_key TO sso_provider_pid_renamed`,
  );
  try {
    await pool.query(migration);
    const { rows } = await pool.query(
      `SELECT contype::text, conname, confdeltype::text
         FROM pg_constraint
        WHERE conrelid = 'trexdb.sso_provider'::regclass
          AND contype IN ('u', 'f')
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                               WHERE attrelid = 'trexdb.sso_provider'::regclass
                                 AND attname = CASE contype WHEN 'u' THEN 'providerId'
                                                            ELSE 'userId' END)]
        ORDER BY contype`,
    );
    // Exactly one unique constraint on providerId — the renamed one, kept, not
    // a duplicate alongside it.
    const unique = rows.filter((r: Record<string, unknown>) => r.contype === "u");
    assertEquals(unique.length, 1);
    assertEquals(unique[0].conname, "sso_provider_pid_renamed");
    // The foreign key is back even though the column already existed, which an
    // inline REFERENCES on ADD COLUMN IF NOT EXISTS would not have managed.
    const fk = rows.filter((r: Record<string, unknown>) => r.contype === "f");
    assertEquals(fk.length, 1);
    // 'n' is SET NULL. getMigrations does not diff foreign key actions, so this
    // is the only place the deliberate choice of SET NULL over Better Auth's
    // CASCADE is checked at all.
    assertEquals(fk[0].confdeltype, "n");
  } finally {
    await pool.query(
      `ALTER TABLE trexdb.sso_provider
         RENAME CONSTRAINT sso_provider_pid_renamed TO sso_provider_provider_id_key`,
    );
  }
});

dbTest("the pool Better Auth is handed bypasses the table's RLS policy", async ({ pool }) => {
  // Spike §2: trexdb.sso_provider carries admin_all_sso_providers, and under a
  // role the policy applies to an UPDATE returns NULL rather than erroring —
  // which is how Phase 1 came to report a migration that linked nobody. This
  // measures core/server/db.ts's pool, which is both what the engine is handed
  // and what core/schema is applied through in this suite, so a pool routed
  // through `authenticated` or `anon` would make every assertion in this file
  // pass while changing nothing.
  const { rows } = await pool.query(
    `SELECT current_user::text                                    AS role,
            (SELECT usesuper FROM pg_user WHERE usename = current_user) AS superuser,
            pg_get_userbyid(c.relowner)                           AS owner,
            c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'trexdb' AND c.relname = 'sso_provider'`,
  );
  const identity = rows[0];
  assertEquals(
    identity.superuser === true || identity.owner === identity.role,
    true,
    `RLS applies to ${identity.role}: an UPDATE would return null, not throw`,
  );
  assertEquals(identity.relforcerowsecurity, false);
});
