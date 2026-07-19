import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { addSkillsPlugin } from "./skills.ts";
import {
  _clearDeclaredSkillPacksForTest,
  packsForAgent,
} from "./skill-packs.ts";
import { _clearAgentMountsForTest, addAgentsPlugin, AGENT_MOUNTS } from "./agents.ts";

const stubApp = { all: () => {} } as never;

// Writes a plugin dir declaring one pack targeting `agents`, returns its dir.
async function writeSkillsPluginDir(): Promise<string> {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/pack/skills/greeting`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/pack/skills/greeting/SKILL.md`,
    "---\ndescription: How to greet.\n---\n\n# Greeting\n",
  );
  return dir;
}

Deno.test("addSkillsPlugin skips untrusted scopes without registering packs", async () => {
  _clearDeclaredSkillPacksForTest();
  const dir = await writeSkillsPluginDir();
  await addSkillsPlugin(stubApp, [{ name: "evilpack", dir: "pack", agents: ["*"] }], dir, "@evil/skills");
  assertEquals(packsForAgent("toy"), []);
});

Deno.test("addSkillsPlugin registers a valid pack (no mounted agents → no rebuild)", async () => {
  _clearDeclaredSkillPacksForTest();
  _clearAgentMountsForTest();
  const dir = await writeSkillsPluginDir();
  await addSkillsPlugin(stubApp, [{ name: "goodpack", dir: "pack", agents: ["toy"] }], dir, "@trex/skills-test");
  assertEquals(packsForAgent("toy").map((p) => p.name), ["goodpack"]);
});

Deno.test("addSkillsPlugin surfaces validation errors (pack registered only if valid)", async () => {
  _clearDeclaredSkillPacksForTest();
  const dir = await Deno.makeTempDir(); // no skills/ inside → invalid
  await assertRejects(
    () => addSkillsPlugin(stubApp, [{ name: "badpack", dir: "pack", agents: ["*"] }], dir, "@trex/skills-test"),
    Error,
    "badpack",
  );
  assertEquals(packsForAgent("toy"), []);
});

// The headline scenario: agent deployed FIRST, pack deployed AFTERWARDS —
// the mounted agent is re-staged and its live config swapped, without any
// restart API. (Worker-serving verification is a live-stack step; here we
// prove the mount now points at a staged dir containing the pack.)
Deno.test({
  name: "addSkillsPlugin re-stages already-mounted target agents (deploy-after-agent)",
  // rebuildAgentMount schedules a grace-period cleanup timer for the old
  // staged dir (unref'd); opt out of the op sanitizer for this one test.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
    _clearDeclaredSkillPacksForTest();
    _clearAgentMountsForTest();
    try {
      await addAgentsPlugin(stubApp, { name: "toy", dir: "agent" }, toyPlugin, "@trex/toy-agent");
      const rec = AGENT_MOUNTS.get("@trex/toy-agent/toy")!;
      const oldPath = rec.live.servicePath;
      const dir = await writeSkillsPluginDir();
      await addSkillsPlugin(stubApp, [{ name: "latepack", dir: "pack", agents: ["toy"] }], dir, "@trex/skills-test");
      assert(rec.live.servicePath !== oldPath, "live servicePath must be swapped");
      const md = await Deno.readTextFile(`${rec.live.servicePath}/agent/skills/latepack--greeting/SKILL.md`);
      assert(md.includes("How to greet"));
    } finally {
      _clearDeclaredSkillPacksForTest();
      _clearAgentMountsForTest();
    }
  },
});

Deno.test("addSkillsPlugin does NOT rebuild mounted agents the pack doesn't target", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  _clearDeclaredSkillPacksForTest();
  _clearAgentMountsForTest();
  try {
    await addAgentsPlugin(stubApp, { name: "toy", dir: "agent" }, toyPlugin, "@trex/toy-agent");
    const rec = AGENT_MOUNTS.get("@trex/toy-agent/toy")!;
    const oldPath = rec.live.servicePath;
    const dir = await writeSkillsPluginDir();
    await addSkillsPlugin(stubApp, [{ name: "otherpack", dir: "pack", agents: ["someone-else"] }], dir, "@trex/skills-test");
    assertEquals(rec.live.servicePath, oldPath, "untargeted agent must not be re-staged");
  } finally {
    _clearDeclaredSkillPacksForTest();
    _clearAgentMountsForTest();
  }
});
