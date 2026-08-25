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
  "plugins/devx/migrations": [17],
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

Deno.test("migration with adjacent test file is not reported as collision", async () => {
  // Regression test: a migration .sql file may have an adjacent .test.ts file
  // (e.g., V7__context.sql and V7__context.test.ts). Only .sql files are
  // migrations; .test.ts files must not be matched as duplicates.
  const byVersion = await versionsIn("core/server/agents/migrations");
  for (const [_version, names] of byVersion) {
    const sqlCount = names.filter((n) => n.endsWith(".sql")).length;
    assertEquals(
      sqlCount <= 1,
      true,
      `Multiple .sql files with same version in core/server/agents/migrations: ${names.join(", ")}`,
    );
  }
});
