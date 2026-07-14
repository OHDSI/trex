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
import { buildMemoryWorkerConfig, memoryWorkerBasePath } from "./mount.ts";
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
    // H4: the generated entry point self-imports staged sources (self-import.ts,
    // staged alongside handler.ts) before Deno.serve.
    assertStringIncludes(indexSrc, "importStagedSources(");
    assertStringIncludes(indexSrc, "./self-import.ts");

    // H4: self-import.ts itself is staged next to handler.ts.
    const selfImportStat = await Deno.stat(`${cfg.servicePath}/self-import.ts`);
    assert(selfImportStat.isFile);

    // H4: sources/manifest.json is always written (even if empty for these
    // ENTRIES — their "docs" dirs don't exist relative to Deno.cwd() in the
    // test process, so materializeSource fails per-source and is skipped,
    // non-fatally — see the dedicated staging test below for a source that
    // DOES resolve real content).
    const manifestStat = await Deno.stat(
      `${cfg.servicePath}/sources/manifest.json`,
    );
    assert(manifestStat.isFile);

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

Deno.test("buildMemoryWorkerConfig: H4 stages a real inline source's markdown + manifest entry", async () => {
  // A real inline source, `dir` relative to `pluginDir` (Task 11's
  // materializeSource contract) — set up an actual on-disk plugin dir with
  // markdown so staging has real content to copy, unlike ENTRIES above
  // (whose "docs" dirs don't exist and are skipped non-fatally).
  const pluginDir = await Deno.makeTempDir({ prefix: "trex-memory-plugin-" });
  const entries: MemoryEntry[] = [
    {
      name: "gamma",
      sources: [{ name: "handbook", dir: "docs", pluginDir }],
    },
  ];
  try {
    await Deno.mkdir(`${pluginDir}/docs`, { recursive: true });
    await Deno.writeTextFile(
      `${pluginDir}/docs/intro.md`,
      "# Intro\nhello staged world",
    );

    const cfg = await buildMemoryWorkerConfig(entries);
    try {
      const manifest = JSON.parse(
        await Deno.readTextFile(`${cfg.servicePath}/sources/manifest.json`),
      );
      assertEquals(manifest.length, 1);
      assertEquals(manifest[0].memory, "gamma");
      assertEquals(manifest[0].source, "handbook");
      assertEquals(manifest[0].slugs, ["intro"]);
      assert(
        typeof manifest[0].version === "string" &&
          manifest[0].version.length > 0,
      );

      const staged = await Deno.readTextFile(
        `${cfg.servicePath}/sources/gamma/handbook/intro.md`,
      );
      assertStringIncludes(staged, "hello staged world");
    } finally {
      await Deno.remove(cfg.servicePath, { recursive: true });
    }
  } finally {
    await Deno.remove(pluginDir, { recursive: true });
  }
});

Deno.test(
  "buildMemoryWorkerConfig: staged servicePath's module graph actually resolves (deno info) — regression guard for the gbrain/package.json staging bug",
  async () => {
    // Every assertion above only stats individual files it already knows to
    // look for; none of them would have caught the CRITICAL bug where
    // vendor/gbrain/src/version.ts's
    // `import pkg from '../package.json' with { type: 'json' }` resolved,
    // at the staged copy, to `${servicePath}/gbrain/package.json` — a path
    // buildMemoryWorkerConfig never staged. The worker's module loader
    // resolves its ENTIRE static import graph at worker-create time, so a
    // missing file anywhere in that graph is a deterministic
    // module-not-found — the worker never boots. `deno info` builds that
    // same static graph (no type-checking, so the ~110-120 pre-existing
    // vendor TS errors documented in task-h2/h4-report.md don't apply here)
    // against the REAL staged deno.json (the file the static graph builder
    // actually reads per mount.ts's comment — not the runtime-only
    // importMapPath), so this is the closest a unit test gets to proving
    // the worker would actually boot.
    const cfg = await buildMemoryWorkerConfig(ENTRIES);
    try {
      const cmd = new Deno.Command(Deno.execPath(), {
        args: [
          "info",
          "--config",
          `${cfg.servicePath}/deno.json`,
          `${cfg.servicePath}/index.ts`,
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await cmd.output();
      const out = new TextDecoder().decode(stdout) +
        new TextDecoder().decode(stderr);

      assertEquals(code, 0, `deno info exited non-zero:\n${out}`);
      // `deno info` marks an import that resolves to a LOCAL FILE PATH that
      // doesn't exist on disk as "(missing)" in the printed tree — distinct
      // from "(resolve error)", which it uses for a bare specifier that
      // isn't in the import map at all (this vendored graph has ~14
      // pre-existing resolve-errors for optional/dynamic imports outside
      // the staged map — e.g. web-tree-sitter, @aws-sdk/client-s3,
      // heic-decode — which are expected and must NOT fail this test).
      // "(missing)" is the precise, narrow signal for exactly the
      // package.json-not-staged failure this test guards against.
      //
      // Verified this actually catches the regression: temporarily
      // deleting `${cfg.servicePath}/gbrain/package.json` before this
      // assertion reproduces `deno info` printing
      // ".../gbrain/package.json (missing)" (still exit 0 — deno info
      // annotates rather than failing the process, which is exactly why the
      // exit-code check alone is not sufficient here).
      assert(
        !out.includes("(missing)"),
        `staged module graph has an unresolved local file — regression: is gbrain/package.json staged?\n${out}`,
      );
    } finally {
      await Deno.remove(cfg.servicePath, { recursive: true });
    }
  },
);

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
