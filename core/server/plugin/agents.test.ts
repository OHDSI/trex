import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  addAgentsPlugin,
  agentsCoreMigrationTarget,
  buildAgentWorkerConfig,
  channelAuthExemptPattern,
  isTrustedScopeAgentsPlugin,
  normalizeAgentsValue,
  unknownMemoryLinks,
} from "./agents.ts";

// Security-sensitive invariant: the proxy auth-exemption regex must exempt
// channel subpaths (adapter-signature-verified) while KEEPING full trex auth on
// the session/chat/health/info routes. A regression here silently unauthenticates
// the session API, so it gets its own table-driven test against full paths.
Deno.test("channelAuthExemptPattern: keeps auth on session/health/info, exempts channel subpaths", () => {
  const basePath = "/plugins/trex/toy";
  const re = channelAuthExemptPattern(basePath);
  const p = (suffix: string) => `${basePath}${suffix}`;

  // NOT matched → proxy auth (authContext+pluginAuthz) is KEPT.
  const kept = [
    "/eve/v1/session",
    "/eve/v1/session/abc",
    "/eve/v1/session/abc/stream",
    "/eve/v1/session/abc/approval",
    "/eve/v1/health",
    "/eve/v1/info",
    // The built-in `eve` WEB channel authenticates via trex JWT (spec §5), not a
    // platform signature — so its routes must KEEP proxy auth, exactly like the
    // session API. Both the create route and the per-session stream stay authed.
    "/eve/v1/eve",
    "/eve/v1/eve/session",
    "/eve/v1/eve/session/x/stream",
  ];
  for (const s of kept) {
    assert(!re.test(p(s)), `expected auth KEPT (no match) for ${s}`);
  }

  // MATCHED → auth EXEMPT (adapter verifies the platform signature in-worker).
  const exempt = [
    "/eve/v1/discord/message",
    "/eve/v1/discord",
    "/eve/v1/slack/events",
    // A channel whose id merely STARTS with a reserved word is a real channel,
    // not the reserved route — the lookahead is boundaried by `/` or end.
    "/eve/v1/sessionx/x",
    "/eve/v1/healthcheck/ping",
    // Starts with the reserved word "eve" but is a distinct channel id (the
    // `(?:/|$)` boundary stops the lookahead from swallowing it) — still exempt.
    "/eve/v1/eventbridge/x",
  ];
  for (const s of exempt) {
    assert(re.test(p(s)), `expected auth EXEMPT (match) for ${s}`);
  }

  // The exemption is anchored to THIS agent's basePath — another agent's paths
  // (or a bare /eve/v1) must not be exempted by this pattern.
  assert(!re.test("/plugins/trex/other/eve/v1/discord/message"));
  assert(!re.test("/eve/v1/discord/message"));
});

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

Deno.test("isTrustedScopeAgentsPlugin accepts the trusted scopes and rejects everything else", () => {
  assertEquals(isTrustedScopeAgentsPlugin("@trex/toy-agent"), true);
  // @ohdsi is trusted like @trex: first-party OHDSI plugins publish to GitHub
  // Packages, which only accepts owner-scoped names (e.g. @ohdsi/pythia-agent).
  assertEquals(isTrustedScopeAgentsPlugin("@ohdsi/pythia-agent"), true);
  assertEquals(isTrustedScopeAgentsPlugin("@evil/agent"), false);
  assertEquals(isTrustedScopeAgentsPlugin("@data2evidence/agent"), false);
  assertEquals(isTrustedScopeAgentsPlugin("unscoped-agent"), false);
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

// ---------------------------------------------------------------------------
// Task 4: linked-memory generation + env injection at staging, and
// declared-memory allow-list validation.

Deno.test("buildAgentWorkerConfig with a valid memory link stages tools/skill and injects env", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(
    toyPlugin,
    { name: "toy", dir: "agent", memory: [{ name: "d2e", mode: "read" }] },
    "@trex/toy-agent",
  );
  const stagedAgentDir = cfg.env.TREX_AGENT_DIR;

  // Generated tool + skill land inside the staged agent dir.
  for (const op of ["search", "recall", "get_page"]) {
    const info = await Deno.stat(`${stagedAgentDir}/tools/d2e_${op}.ts`);
    assert(info.isFile);
  }
  const skill = await Deno.readTextFile(`${stagedAgentDir}/skills/d2e-memory.md`);
  assert(skill.includes("d2e"));

  // Env injected only because entry.memory is non-empty.
  assertEquals(cfg.env.TREX_AGENT_MEMORIES, "d2e");
  assert("GBRAIN_MEMORY_TOKEN" in cfg.env);
  assert("MEMORY_MCP_URL" in cfg.env);
  // Sane default when GBRAIN_MEMORY_INTERNAL_URL isn't set on the host.
  assertEquals(cfg.env.MEMORY_MCP_URL, "http://127.0.0.1:8001/plugins/trex");
});

Deno.test("buildAgentWorkerConfig without a memory link injects no memory env", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  assert(!("TREX_AGENT_MEMORIES" in cfg.env));
  assert(!("GBRAIN_MEMORY_TOKEN" in cfg.env));
  assert(!("MEMORY_MCP_URL" in cfg.env));
  // No generated memory tool/skill files either — never touches disk for a
  // link-free agent (toy-agent's own tools/skills dirs still exist from the
  // plain copy, so assert absence of a specific generated filename, not the
  // dirs themselves).
  await assertRejects(() => Deno.stat(`${cfg.env.TREX_AGENT_DIR}/tools/d2e_search.ts`), Deno.errors.NotFound);
  await assertRejects(() => Deno.stat(`${cfg.env.TREX_AGENT_DIR}/skills/d2e-memory.md`), Deno.errors.NotFound);
});

Deno.test("buildAgentWorkerConfig respects GBRAIN_MEMORY_INTERNAL_URL override", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  Deno.env.set("GBRAIN_MEMORY_INTERNAL_URL", "http://internal-memory:9000");
  try {
    const cfg = await buildAgentWorkerConfig(
      toyPlugin,
      { name: "toy", dir: "agent", memory: [{ name: "d2e", mode: "read" }] },
      "@trex/toy-agent",
    );
    assertEquals(cfg.env.MEMORY_MCP_URL, "http://internal-memory:9000");
  } finally {
    Deno.env.delete("GBRAIN_MEMORY_INTERNAL_URL");
  }
});

Deno.test("unknownMemoryLinks: empty when links is undefined or all names are declared", () => {
  assertEquals(unknownMemoryLinks(undefined, new Set(["d2e"])), []);
  assertEquals(
    unknownMemoryLinks([{ name: "d2e", mode: "read" }], new Set(["d2e", "notes"])),
    [],
  );
});

Deno.test("unknownMemoryLinks: flags a link whose name isn't in the declared-memory allow-list", () => {
  const links = [{ name: "d2e", mode: "read" as const }, { name: "ghost", mode: "read" as const }];
  assertEquals(unknownMemoryLinks(links, new Set(["d2e"])), [{ name: "ghost", mode: "read" }]);
});

Deno.test("addAgentsPlugin skips an agent whose memory link is not a declared memory, without crashing boot", async () => {
  // Bogus dir: if the validation guard didn't short-circuit BEFORE
  // buildAgentWorkerConfig, the missing instructions.md would throw and
  // fail this test — proving the skip happens first, same trick the
  // existing non-@trex-scope test above uses.
  const fakeApp = { all: () => { throw new Error("must not register a route"); } };
  await addAgentsPlugin(
    fakeApp as never,
    { name: "toy", dir: "does-not-exist", memory: [{ name: "unknown_mem" }] },
    "/does/not/exist",
    "@trex/toy-agent",
    new Set(["some_other_memory"]),
  );
});

Deno.test("addAgentsPlugin proceeds when the memory link IS declared (reaches buildAgentWorkerConfig)", async () => {
  // Same bogus-dir trick in reverse: a DECLARED memory link must not be
  // skipped, so this should fail on the missing instructions.md (proving
  // the validation guard let it through), not silently no-op.
  const fakeApp = { all: () => { throw new Error("must not register a route"); } };
  await assertRejects(
    () =>
      addAgentsPlugin(
        fakeApp as never,
        { name: "toy", dir: "does-not-exist", memory: [{ name: "d2e" }] },
        "/does/not/exist",
        "@trex/toy-agent",
        new Set(["d2e"]),
      ),
    Error,
    "instructions.md",
  );
});

Deno.test("buildAgentWorkerConfig excludes the authoring-only evals/ dir from the staged agent tree", async () => {
  // plugins/devx/agent/evals/ is eve's own local dev/test harness (its own
  // node_modules pulls in @ai-sdk/amazon-bedrock, eve, etc., ~100MB) — it
  // must never be copied into a worker's servicePath. Use the real
  // devx-agent dir (which actually has an evals/ subdir on disk) rather than
  // the toy-agent testdata fixture, so this proves the exclusion against the
  // real tree, not a synthetic one.
  const devxPlugin = new URL("../../../plugins/devx", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(devxPlugin, { name: "devx-agent", dir: "agent" }, "@trex/devx");
  let evalsStaged = true;
  try {
    await Deno.stat(`${cfg.servicePath}/agent/evals`);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) evalsStaged = false;
    else throw e;
  }
  assert(!evalsStaged, "staged agent dir must not contain an evals/ entry");
  // Sanity: real agent files the worker actually needs are still staged.
  const st = await Deno.stat(`${cfg.servicePath}/agent/instructions.md`);
  assert(st.isFile);
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

// ---------------------------------------------------------------------------
// Task 5: skill packs (skills plugin type)

import {
  _clearDeclaredSkillPacksForTest,
  registerSkillPack,
  type SkillPackEntry,
} from "./skill-packs.ts";

async function writeTestPack(name: string, agents: string[]): Promise<SkillPackEntry> {
  const srcDir = await Deno.makeTempDir();
  await Deno.mkdir(`${srcDir}/skills/greeting/references`, { recursive: true });
  await Deno.writeTextFile(
    `${srcDir}/skills/greeting/SKILL.md`,
    "---\ndescription: How to greet.\n---\n\n# Greeting\n",
  );
  await Deno.writeTextFile(`${srcDir}/skills/greeting/references/styles.md`, "- formal\n");
  return { name, dir: "pack", agents, srcDir, pluginName: "@trex/skilltest" };
}

Deno.test("buildAgentWorkerConfig stages explicitly passed skill packs into the staged agent dir", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const p = await writeTestPack("mypack", ["toy"]);
  const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent", [p]);
  const md = await Deno.readTextFile(`${cfg.env.TREX_AGENT_DIR}/skills/mypack--greeting/SKILL.md`);
  assert(md.includes("How to greet"));
  const ref = await Deno.readTextFile(`${cfg.env.TREX_AGENT_DIR}/skills/mypack--greeting/references/styles.md`);
  assert(ref.includes("formal"));
});

Deno.test("buildAgentWorkerConfig defaults to the declared-pack registry, honoring targeting", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  _clearDeclaredSkillPacksForTest();
  try {
    registerSkillPack(await writeTestPack("forall", ["*"]));
    registerSkillPack(await writeTestPack("fortoy", ["toy"]));
    registerSkillPack(await writeTestPack("forother", ["someone-else"]));
    const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
    await Deno.stat(`${cfg.env.TREX_AGENT_DIR}/skills/forall--greeting/SKILL.md`);
    await Deno.stat(`${cfg.env.TREX_AGENT_DIR}/skills/fortoy--greeting/SKILL.md`);
    await assertRejects(
      () => Deno.stat(`${cfg.env.TREX_AGENT_DIR}/skills/forother--greeting/SKILL.md`),
      Deno.errors.NotFound,
    );
  } finally {
    _clearDeclaredSkillPacksForTest();
  }
});
