// Guards against two migrations shipping under the same version number.
//
// The runner keys applied migrations on version, so a collision means one file
// is silently skipped on a fresh deployment while both appear to be "in the
// repo". This test has already caught two real collisions: V17 in
// plugins/devx/migrations, and the V7/V18 pairs that #275 and #278 landed
// within hours of each other without any textual conflict for git to catch.
//
// Two ways out of a collision, and which one is legal depends on deployment:
// renumber the newer file (only safe while NOTHING has applied it — the
// checksum verifier hard-fails a deployment whose recorded version changes
// underneath it), or leave both and add a forward migration that re-applies
// the skipped body idempotently. GRANDFATHERED exists for the case where
// neither is possible; it is empty, and adding to it should feel wrong.
import { assertEquals } from "jsr:@std/assert";

const REPO_ROOT = new URL("../../../", import.meta.url);

/** Migration directories checked by this guard, repo-root relative. */
const MIGRATION_DIRS = [
  "plugins/devx/migrations",
  "core/server/agents/migrations",
];

/**
 * Collisions that already shipped and can be neither renumbered nor repaired
 * forward. Never add to this list to make a new failure go away — renumber the
 * unapplied file, or add a forward repair migration.
 *
 * Empty by design. The original V17 entry was removed once #278 renumbered
 * V17__agent_model_selection.sql to V19, which left version 17 unambiguous.
 */
const GRANDFATHERED: Record<string, number[]> = {};

async function versionsIn(dir: string): Promise<Map<number, string[]>> {
  const byVersion = new Map<number, string[]>();
  const path = new URL(dir + "/", REPO_ROOT);
  for await (const entry of Deno.readDir(path)) {
    if (!entry.isFile) continue;
    const m = entry.name.match(/^V(\d+)__.*\.sql$/);
    if (!m) continue;
    const version = Number(m[1]);
    const names = byVersion.get(version) ?? [];
    names.push(entry.name);
    byVersion.set(version, names);
  }
  return byVersion;
}

for (const dir of MIGRATION_DIRS) {
  Deno.test(`no duplicate migration versions in ${dir}`, async () => {
    const byVersion = await versionsIn(dir);
    const allowed = new Set(GRANDFATHERED[dir] ?? []);
    const collisions: string[] = [];
    for (const [version, names] of byVersion) {
      if (names.length > 1 && !allowed.has(version)) {
        collisions.push(`V${version}: ${names.sort().join(", ")}`);
      }
    }
    assertEquals(
      collisions,
      [],
      `duplicate migration versions in ${dir} — the runner keys on version and ` +
        `will silently skip all but one. Renumber the NEW file (an unapplied ` +
        `migration is safe to renumber); never edit or renumber one that has shipped.`,
    );
  });
}

Deno.test("every grandfathered collision still exists and is still a collision", async () => {
  // If a grandfathered entry stops colliding, the exception is stale and must
  // be deleted so the guard stays honest.
  for (const [dir, versions] of Object.entries(GRANDFATHERED)) {
    const byVersion = await versionsIn(dir);
    for (const v of versions) {
      const names = byVersion.get(v) ?? [];
      assertEquals(
        names.length > 1,
        true,
        `${dir} V${v} is grandfathered but no longer collides — remove it from GRANDFATHERED`,
      );
    }
  }
});

Deno.test("a migration's adjacent .test.ts file is not counted as a second migration", async () => {
  // versionsIn's regex requires a .sql suffix, so re-filtering its output on
  // .endsWith(".sql") could never fail — the earlier version of this test
  // asserted a tautology and would have stayed green even if the regex
  // started matching .test.ts files.
  //
  // What actually needs pinning is that the regex EXCLUDES a real adjacent
  // test file. V8__context.sql ships with V8__context.test.ts beside it, so
  // assert that pairing exists on disk and that V8 still resolves to exactly
  // one name.
  const dir = new URL("core/server/agents/migrations/", REPO_ROOT);
  const onDisk = new Set<string>();
  for await (const entry of Deno.readDir(dir)) if (entry.isFile) onDisk.add(entry.name);
  assertEquals(onDisk.has("V8__context.sql"), true, "fixture moved: V8__context.sql no longer exists");
  assertEquals(
    onDisk.has("V8__context.test.ts"),
    true,
    "fixture moved: this test needs a migration with an adjacent .test.ts to be meaningful",
  );

  const byVersion = await versionsIn("core/server/agents/migrations");
  assertEquals(byVersion.get(8), ["V8__context.sql"], "the adjacent .test.ts was matched as a migration");
});
