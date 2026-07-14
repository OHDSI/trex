// Structural tests for the memory worker staging (H3). These do NOT exercise
// the edge runtime (EdgeRuntime.userWorkers lives in the trex-runtime
// submodule, not checked out here — see task-h3-report.md) — they only
// prove `buildMemoryWorkerConfig` lays out a servicePath on disk that a
// worker COULD load: the staged gbrain copy, the handler, the Deno.serve
// entry point, and both import-map files with the `gbrain/` alias +
// dependency closure. `mountMemoryWorker` itself (which additionally calls
// `_addFunction`) is intentionally NOT called here for the same reason H2's
// report gives for not running the edge runtime — there is nothing to
// assert about a mounted Express route without a live worker behind it.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildMemoryWorkerConfig,
  memoryWorkerBasePath,
} from "./mount.ts";
import type { MemoryEntry } from "../../plugin/memory.ts";

const ENTRIES: MemoryEntry[] = [
  { name: "alpha", sources: [{ name: "default", dir: "docs" }] },
  { name: "beta", sources: [{ name: "default", dir: "docs" }] },
];

Deno.test("buildMemoryWorkerConfig stages gbrain + handler + index.ts + import maps", async () => {
  const cfg = await buildMemoryWorkerConfig(ENTRIES);
  try {
    // Staged vendored gbrain core (dest is `${tmp}/gbrain/src/`, not
    // `${tmp}/gbrain/` — see mount.ts's comment on why the extra `src`
    // level matters for the `gbrain/` import alias).
    const gbrainEngineStat = await Deno.stat(
      `${cfg.servicePath}/gbrain/src/core/postgres-engine.ts`,
    );
    assert(gbrainEngineStat.isFile);
    // Sanity: this is the real vendored tree, not an empty placeholder —
    // spot-check a second, unrelated file exists too.
    const multiTenantStat = await Deno.stat(
      `${cfg.servicePath}/gbrain/src/core/multi-tenant.ts`,
    );
    assert(multiTenantStat.isFile);

    const handlerStat = await Deno.stat(`${cfg.servicePath}/handler.ts`);
    assert(handlerStat.isFile);

    const indexSrc = await Deno.readTextFile(`${cfg.servicePath}/index.ts`);
    assertStringIncludes(indexSrc, "Deno.serve(");
    assertStringIncludes(indexSrc, "createMemoryHandler(");
    assertStringIncludes(indexSrc, "gbrain/core/postgres-engine.ts");
    assertStringIncludes(indexSrc, "GBRAIN_MEMORY_ALLOWLIST");
    assertStringIncludes(indexSrc, "TREX_MEMORY_BASE");

    // Both import-map files present (static graph creation reads deno.json;
    // the importMapPath worker option is runtime-only — see mount.ts).
    const denoJson = JSON.parse(
      await Deno.readTextFile(`${cfg.servicePath}/deno.json`),
    );
    const importMap = JSON.parse(
      await Deno.readTextFile(cfg.importMapPath),
    );
    for (const map of [denoJson, importMap]) {
      assertEquals(map.imports["gbrain/"], "./gbrain/src/");
      // Spot-check a representative slice of the npm dependency closure H2
      // already worked out (reused verbatim, not re-derived).
      assert(typeof map.imports["postgres"] === "string");
      assert(typeof map.imports["ai"] === "string");
      assert(typeof map.imports["@modelcontextprotocol/sdk"] === "string");
      assert(typeof map.imports["fs"] === "string");
    }
    // @aws-sdk/client-s3 was deliberately dropped by H2 (only reachable via
    // a gated, never-hit code path) — assert it stays dropped through H3's
    // reuse, not silently reintroduced.
    assertEquals(denoJson.imports["@aws-sdk/client-s3"], undefined);

    assertEquals(cfg.importMapPath, `${cfg.servicePath}/import_map.json`);

    // Env: allow-list is the declared memory names, comma-joined.
    assertEquals(cfg.env.GBRAIN_MEMORY_ALLOWLIST, "alpha,beta");
    assert("DATABASE_URL" in cfg.env);
    assert("GBRAIN_MEMORY_TOKEN" in cfg.env);
    // TREX_MEMORY_BASE is NOT set by buildMemoryWorkerConfig itself —
    // mountMemoryWorker adds it on top (see mount.ts) once it knows the
    // actual mount basePath. Assert the staging step doesn't guess at it.
    assertEquals("TREX_MEMORY_BASE" in cfg.env, false);
  } finally {
    await Deno.remove(cfg.servicePath, { recursive: true });
  }
});

Deno.test("buildMemoryWorkerConfig: empty entries still stages a valid (empty-allowlist) worker", async () => {
  const cfg = await buildMemoryWorkerConfig([]);
  try {
    await Deno.stat(`${cfg.servicePath}/gbrain/src/core/postgres-engine.ts`);
    assertEquals(cfg.env.GBRAIN_MEMORY_ALLOWLIST, "");
  } finally {
    await Deno.remove(cfg.servicePath, { recursive: true });
  }
});

Deno.test("memoryWorkerBasePath: scope-prefix only, matches PLUGINS_BASE_PATH/trex", () => {
  // Default PLUGINS_BASE_PATH (no env override in this test process) is
  // "/plugins"; MEMORY_PLUGIN_NAME is fixed at "@trex/memory" -> scope
  // "/trex". Asserts the DELIBERATE asymmetry vs agents' TREX_AGENT_BASE
  // documented in mount.ts: this is the scope prefix ONLY, no "/memory"
  // suffix, so handler.ts's parseMemoryPath still sees a leading
  // "/memory/<name>/..." after the strip.
  const base = memoryWorkerBasePath();
  assert(base.endsWith("/trex"));
  assert(!base.endsWith("/memory"));
});
