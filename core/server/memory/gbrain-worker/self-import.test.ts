// Live-DB integration test for H4's boot-time in-worker importer. Builds a
// temp `sources/` dir shaped exactly like mount.ts's `stageMemorySources`
// staging output (a manifest.json + staged `.md` files) WITHOUT going
// through mount.ts itself (no gbrain copy, no _addFunction) — this is
// self-import.ts's own contract, tested directly: given a staged sources
// dir + a connected engine, does it import the right pages and skip on an
// unchanged version. Same hand-rolled-assert / live-Postgres style as
// handler.test.ts (this repo's convention for gbrain-worker tests) — per
// the H4 brief this MUST run live, not skip.
import { PostgresEngine } from "gbrain/core/postgres-engine.ts";
import { dispatchToolCall } from "gbrain/mcp/dispatch.ts";
import {
  importStagedSources,
  type StagedManifestEntry,
} from "./self-import.ts";

function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg ?? "assertion failed");
}
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const same = typeof actual === "object" && typeof expected === "object"
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected;
  if (!same) {
    throw new Error(
      msg ??
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const DATABASE_URL = Deno.env.get("GBRAIN_TEST_DATABASE_URL") ??
  "postgres://postgres:postgres@127.0.0.1:5433/gbrain_test";

// Unique-ish per test run so re-running this file doesn't collide with a
// stale memory_h4test schema / memory_import_state row from a prior run —
// mirrors handler.test.ts's h2test convention but namespaced for H4.
const MEMORY = "h4test";
const SOURCE = "default";

async function writeStagedSources(
  root: string,
  manifest: StagedManifestEntry[],
  files: Record<string, string>,
): Promise<void> {
  await Deno.mkdir(root, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const full = `${root}/${relPath}`;
    await Deno.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(full, content);
  }
  await Deno.writeTextFile(
    `${root}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );
}

Deno.test({
  name:
    "importStagedSources: imports staged pages, then skips on unchanged version",
  // Same rationale as handler.test.ts: gbrain's PostgresEngine runs
  // background maintenance timers that outlive a single connect() in a
  // short-lived test process — orthogonal to what this test verifies.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
    const engine = new PostgresEngine();
    await engine.connect(
      { engine: "postgres", database_url: DATABASE_URL } as never,
    );

    // Clean slate: drop any prior run's schema + import-state row so this
    // test is deterministic across repeated runs (not just the "run twice
    // in the same process" case below, which exercises the real skip path).
    await engine.executeRaw(`DROP SCHEMA IF EXISTS memory_${MEMORY} CASCADE`);
    await engine.executeRaw(
      `DELETE FROM trexdb.memory_import_state WHERE memory = $1 AND source = $2`,
      [MEMORY, SOURCE],
    );

    const tmp = await Deno.makeTempDir({
      prefix: "trex-memory-self-import-test-",
    });
    const manifest: StagedManifestEntry[] = [
      {
        memory: MEMORY,
        source: SOURCE,
        version: "v1",
        slugs: ["alpha", "nested/beta"],
      },
    ];

    try {
      await t.step(
        "first run: imports both pages, version not yet skip-tracked",
        async () => {
          await writeStagedSources(tmp, manifest, {
            [`${MEMORY}/${SOURCE}/alpha.md`]: "# Alpha\nfirst page",
            [`${MEMORY}/${SOURCE}/nested/beta.md`]:
              "# Beta\nsecond page, nested",
          });

          await importStagedSources(engine, tmp, {});

          const schema = `memory_${MEMORY}`;
          const alpha = await engine.withSchema(
            schema,
            (s) =>
              dispatchToolCall(s, "get_page", { slug: `${SOURCE}/alpha` }, {
                schema,
                sourceId: "default",
              }),
          );
          assert(
            !alpha.isError,
            `get_page alpha failed: ${JSON.stringify(alpha)}`,
          );
          const alphaText = JSON.parse(
            (alpha.content[0] as { text: string }).text,
          );
          assert(
            String(alphaText.compiled_truth ?? "").includes("first page"),
            `alpha page content missing: ${JSON.stringify(alphaText)}`,
          );

          const beta = await engine.withSchema(
            schema,
            (s) =>
              dispatchToolCall(
                s,
                "get_page",
                { slug: `${SOURCE}/nested/beta` },
                { schema, sourceId: "default" },
              ),
          );
          assert(
            !beta.isError,
            `get_page nested/beta failed: ${JSON.stringify(beta)}`,
          );
          const betaText = JSON.parse(
            (beta.content[0] as { text: string }).text,
          );
          assert(
            String(betaText.compiled_truth ?? "").includes(
              "second page, nested",
            ),
            `beta page content missing: ${JSON.stringify(betaText)}`,
          );

          // Version got recorded (failed === 0 on the import).
          const rows = await engine.executeRaw<{ version: string }>(
            `SELECT version FROM trexdb.memory_import_state WHERE memory = $1 AND source = $2`,
            [MEMORY, SOURCE],
          );
          assertEquals(rows[0]?.version, "v1");
        },
      );

      await t.step(
        "second run, same version: skip-tracked, no re-import needed",
        async () => {
          // Overwrite alpha.md on disk with different content but DON'T bump
          // the manifest version — if the version-skip logic works,
          // importStagedSources must never read this file, so the stored page
          // stays at its first-run content.
          await Deno.writeTextFile(
            `${tmp}/${MEMORY}/${SOURCE}/alpha.md`,
            "# Alpha\nCHANGED CONTENT — must not be imported",
          );

          await importStagedSources(engine, tmp, {});

          const schema = `memory_${MEMORY}`;
          const alpha = await engine.withSchema(
            schema,
            (s) =>
              dispatchToolCall(s, "get_page", { slug: `${SOURCE}/alpha` }, {
                schema,
                sourceId: "default",
              }),
          );
          assert(
            !alpha.isError,
            `get_page alpha failed on second run: ${JSON.stringify(alpha)}`,
          );
          const alphaText = JSON.parse(
            (alpha.content[0] as { text: string }).text,
          );
          assert(
            String(alphaText.compiled_truth ?? "").includes("first page"),
            `expected first-run content to survive the version-skip (no re-import), got: ${
              JSON.stringify(alphaText)
            }`,
          );
          assert(
            !String(alphaText.compiled_truth ?? "").includes("CHANGED CONTENT"),
            `version-skip did NOT skip — the changed content on disk got re-imported`,
          );
        },
      );

      await t.step(
        "version bump: re-imports even though a prior version was recorded",
        async () => {
          const bumped: StagedManifestEntry[] = [
            {
              memory: MEMORY,
              source: SOURCE,
              version: "v2",
              slugs: ["alpha", "nested/beta"],
            },
          ];
          await Deno.writeTextFile(
            `${tmp}/manifest.json`,
            JSON.stringify(bumped, null, 2),
          );
          // alpha.md on disk still holds the "CHANGED CONTENT" text from the
          // previous step — a version bump should now pick it up.

          await importStagedSources(engine, tmp, {});

          const schema = `memory_${MEMORY}`;
          const alpha = await engine.withSchema(
            schema,
            (s) =>
              dispatchToolCall(s, "get_page", { slug: `${SOURCE}/alpha` }, {
                schema,
                sourceId: "default",
              }),
          );
          const alphaText = JSON.parse(
            (alpha.content[0] as { text: string }).text,
          );
          assert(
            String(alphaText.compiled_truth ?? "").includes("CHANGED CONTENT"),
            `expected the version bump to re-import the changed content, got: ${
              JSON.stringify(alphaText)
            }`,
          );

          const rows = await engine.executeRaw<{ version: string }>(
            `SELECT version FROM trexdb.memory_import_state WHERE memory = $1 AND source = $2`,
            [MEMORY, SOURCE],
          );
          assertEquals(rows[0]?.version, "v2");
        },
      );
    } finally {
      await Deno.remove(tmp, { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  name:
    "importStagedSources: missing manifest is logged and non-fatal (no throw)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const engine = new PostgresEngine();
    await engine.connect(
      { engine: "postgres", database_url: DATABASE_URL } as never,
    );
    const tmp = await Deno.makeTempDir({
      prefix: "trex-memory-self-import-empty-",
    });
    try {
      // No manifest.json written at all — must not throw.
      await importStagedSources(engine, tmp, {});
    } finally {
      await Deno.remove(tmp, { recursive: true }).catch(() => {});
    }
  },
});
