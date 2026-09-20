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
    const legacy = await pool.query(
      `SELECT "providerId", domain, "oidcConfig" FROM trexdb.sso_provider WHERE id = $1`,
      [id],
    );
    assertEquals(
      legacy.rows[0],
      { providerId: null, domain: null, oidcConfig: null },
      "the row was not legacy-shaped, so the backfill below proves nothing",
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
    // Declared by the plugin's model but with no source value in trex. They
    // must be present as columns and are legitimately NULL.
    assertEquals(row!.samlConfig, null);
    assertEquals(row!.userId, null);
    assertEquals(row!.organizationId, null);

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
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
    // Whatever happened above, the table must not be left without the trigger
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
  const a = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const b = `task4_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = ANY($1)`, [[a, b]]);
  }
});

dbTest("the migration's own connection owns the table it rewrites", async ({ pool }) => {
  // Spike §2: trexdb.sso_provider carries admin_all_sso_providers, and under a
  // role the policy applies to an UPDATE returns NULL rather than erroring —
  // which is how Phase 1 came to report a migration that linked nobody. The
  // backfills above are only meaningful because the connection running them
  // bypasses RLS on two independent grounds, so assert that rather than assume
  // it: a pool routed through `authenticated` or `anon` would make every
  // assertion in this file pass while changing nothing.
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
