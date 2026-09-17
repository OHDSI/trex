// Since 1.7, Better Auth compares the tables it owns against the shape it
// generates — at boot and again on every request that awaits validation — and
// a mismatch surfaces as a SchemaMismatchError rather than a startup warning.
// The drift is therefore an outage, and it is one nothing in trex would catch:
// the migration lives in core/schema and the expectation lives in
// better-auth.ts, so either side can move without the other. Assert here that
// the two still agree, instead of discovering it at the first sign-in.
//
// Gated on DATABASE_URL like better-auth.test.ts and the contract suite: the
// check can only be made against a real database, and inventing a URL would
// un-gate every later suite in the same process against a database that does
// not exist.
import { assertEquals } from "jsr:@std/assert";
// better-auth/db exports getSchema (what Better Auth *wants*); the plan that
// compares it with what the database *has* is a separate entry point.
import { getMigrations } from "better-auth/db/migration";
import { _resetRootKeyCache } from "./keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * better-auth.ts derives its secret from TREX_ROOT_KEY at module evaluation
 * time, so the variable has to be in place before the import and handed back
 * afterwards — keys.test.ts asserts getRootKey throws without it.
 */
async function loadAuth() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return (await import("./better-auth.ts")).auth;
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    _resetRootKeyCache();
  }
}

const auth = DATABASE_URL ? await loadAuth() : null;

/**
 * The pg pool is a singleton owned by ../db.ts and deliberately outlives every
 * test, so the resource and op sanitizers would report it as a leak.
 */
function schemaTest(name: string, fn: (a: NonNullable<typeof auth>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !auth,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(auth!),
  });
}

schemaTest("no schema migration is outstanding", async (auth) => {
  // getMigrations reports a column it would have to *add* in its result, but
  // reports a column whose nullability or type is wrong only through the
  // logger. Both are drift, so the logger is captured and asserted on too —
  // a nullable column that Better Auth declares required reads back as a
  // missing required field at runtime, which is exactly the failure this test
  // exists to prevent.
  const complaints: string[] = [];
  const { toBeCreated, toBeAdded, toBeAddedIndexes, unsafeChanges, schemaProblems } =
    await getMigrations({
      ...auth.options,
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
      complaints,
    },
    {
      toBeCreated: [],
      toBeAdded: [],
      toBeAddedIndexes: [],
      unsafeChanges: [],
      schemaProblems: [],
      complaints: [],
    },
  );
});

schemaTest("Better Auth's own schema check passes", async (auth) => {
  // The plan above cannot see a column trex has that Better Auth does not
  // write: a NOT NULL one makes every insert into that table fail. Only the
  // runtime check looks for those, and it is the check that actually runs in
  // production, so assert the real thing rather than a reconstruction of it.
  const ctx = await auth.$context as { checkSchema?: () => Promise<void> | undefined };
  await ctx.checkSchema?.();
});
