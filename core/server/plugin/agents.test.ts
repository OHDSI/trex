import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { addAgentsPlugin, buildAgentWorkerConfig, isTrexScopedAgentsPlugin, normalizeAgentsValue } from "./agents.ts";

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
  assertEquals(cfg.env.TREX_AGENT_DIR, `${toyPlugin}/agent`);
  assertEquals(cfg.env.TREX_AGENT_NAME, "toy");
  // import map exists on disk and maps "eve" to the shim
  const map = JSON.parse(await Deno.readTextFile(cfg.importMapPath));
  assert(map.imports["eve"].endsWith("/agents/eve-shim/mod.ts"));
  assertEquals(map.imports["ai"], "npm:ai@^6");
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
  assertEquals(cfg.env.TREX_AGENT_DIR, `${tmp}/agent`);
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
