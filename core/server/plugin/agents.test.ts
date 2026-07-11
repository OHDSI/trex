import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { addAgentsPlugin, agentsCoreMigrationTarget, buildAgentWorkerConfig, isTrexScopedAgentsPlugin, normalizeAgentsValue } from "./agents.ts";

Deno.test("normalizeAgentsValue accepts array and single-object forms", () => {
  assertEquals(normalizeAgentsValue([{ name: "a", dir: "agent" }]), [{ name: "a", dir: "agent" }]);
  assertEquals(normalizeAgentsValue({ name: "a" }), [{ name: "a", dir: "agent" }]);
});

Deno.test("normalizeAgentsValue rejects entries without a name", () => {
  let threw = false;
  try { normalizeAgentsValue([{ dir: "agent" }]); } catch { threw = true; }
  assert(threw);
});

Deno.test("buildAgentWorkerConfig produces worker env and generated import map", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  assertEquals(cfg.source, "/toy");
  // TREX_AGENT_DIR is the staged copy inside the servicePath, not the plugin
  // dir: the worker's module loader only resolves files under its
  // servicePath, and loader.ts dynamic-imports agent code from this dir.
  assertEquals(cfg.env.TREX_AGENT_DIR, `${cfg.servicePath}/agent`);
  assertEquals(cfg.env.TREX_AGENT_NAME, "toy");
  // import map exists on disk and maps "eve" to the staged shim
  const map = JSON.parse(await Deno.readTextFile(cfg.importMapPath));
  assert(map.imports["eve"].endsWith("/agents/eve-shim/mod.ts"));
  assert(map.imports["eve"].startsWith(`file://${cfg.servicePath}/`));
  assertEquals(map.imports["ai"], "npm:ai@^6");
});

Deno.test("buildAgentWorkerConfig stages a self-contained servicePath (packaged-image module confinement)", async () => {
  // The runtime's user-worker module loader only resolves file: specifiers
  // under the worker's servicePath — out-of-tree file:// imports fail in the
  // packaged image (statically at graph creation, dynamically at module
  // evaluation), and import.meta.url there points into a build-time compile
  // graph that doesn't exist on disk. Everything the worker imports must
  // therefore be staged inside the servicePath.
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  // Staged runtime: entrypoint chain and the eve shim the import map targets.
  for (const f of ["index.ts", "agents/service/index.ts", "agents/loader.ts", "agents/eve-shim/mod.ts"]) {
    const st = await Deno.stat(`${cfg.servicePath}/${f}`);
    assert(st.isFile, `expected staged file ${f}`);
  }
  // Staged agent code: contents copied from the plugin's agent dir.
  const staged = await Deno.readTextFile(`${cfg.servicePath}/agent/instructions.md`);
  const original = await Deno.readTextFile(`${toyPlugin}/agent/instructions.md`);
  assertEquals(staged, original);
  // The generated entrypoint imports the staged service relatively — no
  // absolute file:// URL that the confined module loader would reject.
  const entry = await Deno.readTextFile(`${cfg.servicePath}/index.ts`);
  assert(entry.includes('"./agents/service/index.ts"'));
  assert(!entry.includes("file://"));
  // Every file: entry in the import map stays inside the servicePath.
  const map = JSON.parse(await Deno.readTextFile(cfg.importMapPath));
  for (const [k, v] of Object.entries(map.imports) as [string, string][]) {
    if (v.startsWith("file://")) {
      assert(v.startsWith(`file://${cfg.servicePath}/`), `${k} escapes servicePath: ${v}`);
    }
  }
});

Deno.test("agentsCoreMigrationTarget resolves the migrations dir on disk (not via import.meta.url)", async () => {
  const target = await agentsCoreMigrationTarget();
  assertEquals(target.name, "agents-core");
  assertEquals(target.schema, "agents");
  const st = await Deno.stat(target.path);
  assert(st.isDirectory, `migrations dir must exist on disk: ${target.path}`);
});

Deno.test("buildAgentWorkerConfig gives each agent its own servicePath (no shared worker pool key)", async () => {
  // The runtime's worker pool is keyed by servicePath and reuses the FIRST
  // worker created for a given path — env/import map are creation-time
  // only. If every agent shared the core service dir as servicePath, every
  // agent after the first would silently run with the first agent's env.
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfgA = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  const cfgB = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  // Per-agent temp dir, not the shared core service dir.
  assert(!cfgA.servicePath.endsWith("/agents/service"));
  // import_map.json sits alongside index.ts in that same temp dir.
  assertEquals(cfgA.importMapPath, `${cfgA.servicePath}/import_map.json`);
  // Two builds (e.g. two agents, or the same agent registered twice) never
  // collide on the same servicePath.
  assert(cfgA.servicePath !== cfgB.servicePath);

  // index.ts sits alongside import_map.json in the temp dir and just
  // imports the real, shared service entrypoint.
  const entry = await Deno.readTextFile(`${cfgA.servicePath}/index.ts`);
  assert(entry.includes("agents/service/index.ts"));
  assert(entry.trim().startsWith('import "'));
});

Deno.test("buildAgentWorkerConfig accepts EDN-only agent dirs (instructions.edn)", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.mkdir(`${tmp}/agent`);
  await Deno.writeTextFile(`${tmp}/agent/instructions.edn`, `"You are an EDN-configured agent."`);
  const cfg = await buildAgentWorkerConfig(tmp, { name: "ednagent", dir: "agent" }, "@trex/edn-agent");
  assertEquals(cfg.source, "/ednagent");
  assertEquals(cfg.env.TREX_AGENT_DIR, `${cfg.servicePath}/agent`);
});

Deno.test("buildAgentWorkerConfig fails fast when instructions.md missing", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.mkdir(`${tmp}/agent`);
  await assertRejects(
    () => buildAgentWorkerConfig(tmp, { name: "x", dir: "agent" }, "@trex/x"),
    Error, "instructions.md",
  );
});

Deno.test("buildAgentWorkerConfig surfaces a non-NotFound stat error with its own cause (like loader.ts)", async () => {
  const tmp = await Deno.makeTempDir();
  // agentDir itself is a plain file, not a directory: statting
  // `${agentDir}/instructions.md` throws NotADirectory, not NotFound — this
  // must surface as a real failure with the underlying cause, not get
  // swallowed into the generic "is required but missing" message the way a
  // genuine NotFound does.
  await Deno.writeTextFile(`${tmp}/agent`, "not a directory");
  await assertRejects(
    () => buildAgentWorkerConfig(tmp, { name: "x", dir: "agent" }, "@trex/x"),
    Error, "failed to stat",
  );
  try {
    await buildAgentWorkerConfig(tmp, { name: "x", dir: "agent" }, "@trex/x");
    assert(false, "expected rejection");
  } catch (e) {
    assert(e instanceof Error);
    assert(!e.message.includes("is required but missing"));
  }
});

Deno.test("isTrexScopedAgentsPlugin only accepts the @trex scope", () => {
  assertEquals(isTrexScopedAgentsPlugin("@trex/toy-agent"), true);
  assertEquals(isTrexScopedAgentsPlugin("@evil/agent"), false);
  assertEquals(isTrexScopedAgentsPlugin("unscoped-agent"), false);
});

Deno.test("addAgentsPlugin skips registration for a non-@trex plugin name without throwing", async () => {
  // A bogus dir/value would make buildAgentWorkerConfig throw if it were
  // ever reached — proving the auth-scope guard short-circuits before any
  // filesystem work or route registration happens.
  const fakeApp = { all: () => { throw new Error("must not register a route"); } };
  await addAgentsPlugin(
    fakeApp as never,
    { name: "x", dir: "does-not-exist" },
    "/does/not/exist",
    "@evil/agent",
  );
});

Deno.test("buildAgentWorkerConfig resolves entry env with ${VAR:-default} substitution", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;

  // Test with unset var — should use fallback
  const cfgUnset = await buildAgentWorkerConfig(
    toyPlugin,
    { name: "a", dir: "agent", env: { FOO: "${__AGENTS_TEST_VAR:-fallback}" } },
    "@trex/toy-agent"
  );
  assertEquals(cfgUnset.env.FOO, "fallback");

  // Test with set var — should use live value
  Deno.env.set("__AGENTS_TEST_VAR", "live");
  try {
    const cfgSet = await buildAgentWorkerConfig(
      toyPlugin,
      { name: "b", dir: "agent", env: { FOO: "${__AGENTS_TEST_VAR:-fallback}" } },
      "@trex/toy-agent"
    );
    assertEquals(cfgSet.env.FOO, "live");
  } finally {
    Deno.env.delete("__AGENTS_TEST_VAR");
  }
});

// task-v1-brief.md: plugins/devx's real "agents" trex-block entry
// ({ name: "devx-agent", dir: "agent" }) loads through the same
// buildAgentWorkerConfig path as any other agents-type plugin — run here
// (not under plugins/devx itself) because loader.ts's agent.ts import ("eve")
// and buildAgentWorkerConfig's own express/pg/edn-data deps only resolve
// inside core/server's own configured Deno workspace member. This
// deliberately stops at buildAgentWorkerConfig, not a direct in-process
// loadAgent(devxAgentDir) call: plugins/devx isn't itself a workspace
// member, so a same-process dynamic import() of its agent.ts resolves "eve"
// against the OUTER repo-root workspace config (no "imports" of its own)
// rather than core/server's — a same-process-testing artifact, not a real
// production gap, since a real agent worker always runs as its own process
// launched with buildAgentWorkerConfig's generated --import-map (verified
// below), never via an ambient workspace-discovered config.
// plugins/devx/agent/lib/context.test.ts covers the adapter unit tests.
Deno.test("manifest: buildAgentWorkerConfig succeeds for the devx-agent trex.agents entry", async () => {
  const devxPlugin = new URL("../../../plugins/devx", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(devxPlugin, { name: "devx-agent", dir: "agent" }, "@trex/devx");
  assertEquals(cfg.source, "/devx-agent");
  assertEquals(cfg.env.TREX_AGENT_DIR, `${cfg.servicePath}/agent`);
  assertEquals(cfg.env.TREX_AGENT_NAME, "devx-agent");
  assertEquals(cfg.env.TREX_PLUGIN_NAME, "@trex/devx");
  // No plugins/devx/agent/deno.json is checked in (see task-v1 report):
  // buildAgentWorkerConfig's own generated import map already resolves
  // "eve"/"eve/tools" to absolute file:// URLs regardless of which plugin
  // declares the agent — this is what makes that unnecessary.
  const generated = JSON.parse(await Deno.readTextFile(cfg.importMapPath));
  assert(String(generated.imports.eve).endsWith("eve-shim/mod.ts"));
  assert(String(generated.imports["eve/tools"]).endsWith("eve-shim/tools.ts"));
});

Deno.test("buildAgentWorkerConfig entry env cannot clobber reserved keys", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;

  const cfg = await buildAgentWorkerConfig(
    toyPlugin,
    { name: "a", dir: "agent", env: { TREX_AGENT_DIR: "/evil" } },
    "@trex/toy-agent"
  );

  // Reserved key must retain its real value (the staged copy), not the
  // evil override
  assertEquals(cfg.env.TREX_AGENT_DIR, `${cfg.servicePath}/agent`);
  assertEquals(cfg.env.TREX_AGENT_NAME, "a");
});
