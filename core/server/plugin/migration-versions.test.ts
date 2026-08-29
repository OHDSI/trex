// Guard against two migrations claiming the same version number.
//
// This is not hypothetical. #272 added `V17__loop_default_agents.sql` and #260
// added `V17__agent_model_selection.sql`; each passed CI on its own branch,
// nothing compared them, and the collision only existed once both were on
// develop. The runtime does detect it — plugins/migration/src/lib.rs raises
// "Duplicate version 17: found in both ..." — but it detects it at BOOT, and
// its response is to abort that schema's entire migration run. devx therefore
// sat pinned at version 16 in a live deployment: V17 never applied (so
// `devx.agent_model_selection` did not exist and per-agent model assignment was
// silently dead), and V18 behind it never applied either.
//
// A duplicate is invisible in review — the two files are added by different
// PRs, in different directories in the diff — so it needs a mechanical check.
import { assertEquals } from "jsr:@std/assert";
import { dirname, fromFileUrl, join, relative } from "jsr:@std/path";

const REPO_ROOT = join(dirname(fromFileUrl(import.meta.url)), "..", "..", "..");

/** Every directory named `migrations` that holds refinery-style `V<n>__*.sql`. */
async function findMigrationDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  const skip = new Set(["node_modules", ".git", "target", "dist", "build", ".worktrees", "vendor"]);
  async function walk(dir: string, depth: number) {
    if (depth > 6) return;
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(dir)];
    } catch {
      return; // unreadable (submodule not checked out, permissions) — not our concern
    }
    for (const e of entries) {
      if (!e.isDirectory || skip.has(e.name) || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.name === "migrations") found.push(full);
      else await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return found;
}

Deno.test("no two migrations in one directory share a version number", async () => {
  const dirs = await findMigrationDirs(REPO_ROOT);
  // If the walk ever stops finding anything (a refactor moves migrations, the
  // skip list grows too aggressive), this test would pass vacuously forever.
  // Fail loudly instead — a guard that silently guards nothing is worse than
  // no guard, because it reads as coverage.
  assertEquals(dirs.length > 0, true, "found no migrations directories — the walk is broken, not the repo clean");

  const collisions: string[] = [];
  for (const dir of dirs) {
    const byVersion = new Map<number, string[]>();
    for (const entry of Deno.readDirSync(dir)) {
      if (!entry.isFile) continue;
      const m = entry.name.match(/^V(\d+)__.+\.sql$/);
      if (!m) continue;
      const version = Number(m[1]);
      byVersion.set(version, [...(byVersion.get(version) ?? []), entry.name]);
    }
    for (const [version, files] of [...byVersion].sort((a, b) => a[0] - b[0])) {
      if (files.length > 1) {
        collisions.push(`${relative(REPO_ROOT, dir)}: V${version} claimed by ${files.sort().join(" and ")}`);
      }
    }
  }

  assertEquals(
    collisions,
    [],
    `Duplicate migration versions will abort the whole schema's migration run at boot, ` +
      `leaving it pinned at the last good version and silently disabling every migration behind it. ` +
      `Renumber the one that merged LATER to the next free version:\n  ${collisions.join("\n  ")}`,
  );
});
