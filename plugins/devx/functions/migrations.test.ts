// Guards against two migrations shipping under the same version number.
//
// The runner keys applied migrations on version, so a collision means one file
// is silently skipped on a fresh deployment while both appear to be "in the
// repo". That is how V17 shipped twice; V18__v17_collision_repair.sql repairs
// it, and this test stops the next one.
//
// Applied migrations can never be renumbered (the checksum verifier hard-fails
// deployments that already ran them), so the historical collision is
// grandfathered by version number rather than fixed in place.
import { assertEquals } from "jsr:@std/assert";

const REPO_ROOT = new URL("../../../", import.meta.url);

/** Migration directories checked by this guard, repo-root relative. */
const MIGRATION_DIRS = [
  "plugins/devx/migrations",
  "core/server/agents/migrations",
];

/**
 * Collisions that already shipped and cannot be renumbered. Never add to this
 * list to make a new failure go away — add a forward repair migration instead,
 * the way V18__v17_collision_repair.sql does.
 */
const GRANDFATHERED: Record<string, number[]> = {
  // Empty on purpose. devx V17 was grandfathered here because an applied
  // collision cannot be renumbered — but that collision was resolved by
  // renumbering the UNAPPLIED side (V17__agent_model_selection -> V19), so the
  // exception went stale and this test's own staleness check caught it.
};

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
  // test file. V7__context.sql ships with V7__context.test.ts beside it, so
  // assert that pairing exists on disk and that V7 still resolves to exactly
  // one name.
  const dir = new URL("core/server/agents/migrations/", REPO_ROOT);
  const onDisk = new Set<string>();
  for await (const entry of Deno.readDir(dir)) if (entry.isFile) onDisk.add(entry.name);
  assertEquals(onDisk.has("V7__context.sql"), true, "fixture moved: V7__context.sql no longer exists");
  assertEquals(
    onDisk.has("V7__context.test.ts"),
    true,
    "fixture moved: this test needs a migration with an adjacent .test.ts to be meaningful",
  );

  const byVersion = await versionsIn("core/server/agents/migrations");
  assertEquals(byVersion.get(7), ["V7__context.sql"], "the adjacent .test.ts was matched as a migration");
});
