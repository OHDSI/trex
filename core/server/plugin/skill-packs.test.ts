import { assert, assertEquals, assertThrows, assertRejects } from "jsr:@std/assert";
import {
  _clearDeclaredSkillPacksForTest,
  hasFrontmatterDescription,
  normalizeSkillsValue,
  packsForAgent,
  packTargetsAgent,
  registerSkillPack,
  stageSkillPacks,
  validateSkillPackDir,
  type SkillPackEntry,
} from "./skill-packs.ts";

function pack(over: Partial<SkillPackEntry> = {}): SkillPackEntry {
  return { name: "p1", dir: "pack", agents: ["toy"], srcDir: "/src/p1", pluginName: "@trex/a", ...over };
}

Deno.test("normalizeSkillsValue accepts array and single-object forms, defaults dir to 'pack'", () => {
  assertEquals(
    normalizeSkillsValue([{ name: "a", dir: "d", agents: ["toy"] }]),
    [{ name: "a", dir: "d", agents: ["toy"] }],
  );
  assertEquals(normalizeSkillsValue({ name: "a", agents: ["*"] }), [{ name: "a", dir: "pack", agents: ["*"] }]);
});

Deno.test("normalizeSkillsValue rejects bad names, '--', missing/empty/invalid agents, duplicates", () => {
  assertThrows(() => normalizeSkillsValue([{ name: "", agents: ["toy"] }]), Error, "needs a name");
  assertThrows(() => normalizeSkillsValue([{ name: "a--b", agents: ["toy"] }]), Error, "needs a name");
  assertThrows(() => normalizeSkillsValue([{ name: "a" }]), Error, "agents");
  assertThrows(() => normalizeSkillsValue([{ name: "a", agents: [] }]), Error, "agents");
  assertThrows(() => normalizeSkillsValue([{ name: "a", agents: ["bad name"] }]), Error, "agents");
  assertThrows(
    () => normalizeSkillsValue([{ name: "a", agents: ["toy"] }, { name: "a", agents: ["*"] }]),
    Error,
    "duplicate",
  );
});

Deno.test("registerSkillPack: new → true; identical re-registration → false; cross-plugin name clash → throws", () => {
  _clearDeclaredSkillPacksForTest();
  assertEquals(registerSkillPack(pack()), true);
  // The boot pre-pass records packs before dispatch; the dispatch pass
  // re-encountering the identical pack must be a silent no-op.
  assertEquals(registerSkillPack(pack()), false);
  assertThrows(
    () => registerSkillPack(pack({ pluginName: "@trex/b", srcDir: "/src/other" })),
    Error,
    "already declared",
  );
});

Deno.test("packTargetsAgent matches exact names and '*'", () => {
  assert(packTargetsAgent(pack({ agents: ["toy", "claw"] }), "toy"));
  assert(!packTargetsAgent(pack({ agents: ["toy"] }), "claw"));
  assert(packTargetsAgent(pack({ agents: ["*"] }), "anything"));
});

Deno.test("packsForAgent returns matching packs name-sorted (deterministic staging order)", () => {
  _clearDeclaredSkillPacksForTest();
  registerSkillPack(pack({ name: "zeta", agents: ["*"] }));
  registerSkillPack(pack({ name: "alpha", agents: ["toy"] }));
  registerSkillPack(pack({ name: "other", agents: ["claw"] }));
  assertEquals(packsForAgent("toy").map((p) => p.name), ["alpha", "zeta"]);
  assertEquals(packsForAgent("nobody").map((p) => p.name), ["zeta"]);
});

// Writes a minimal valid pack on disk and returns its SkillPackEntry.
async function writePack(root: string, name: string, opts: { connection?: string } = {}): Promise<SkillPackEntry> {
  const srcDir = `${root}/${name}-src`;
  await Deno.mkdir(`${srcDir}/skills/greeting/references`, { recursive: true });
  await Deno.writeTextFile(
    `${srcDir}/skills/greeting/SKILL.md`,
    "---\ndescription: How to greet.\n---\n\n# Greeting\n\nSee references/styles.md.\n",
  );
  await Deno.writeTextFile(`${srcDir}/skills/greeting/references/styles.md`, "- formal\n- casual\n");
  if (opts.connection !== undefined) {
    await Deno.mkdir(`${srcDir}/connections`, { recursive: true });
    await Deno.writeTextFile(`${srcDir}/connections/svc.ts`, opts.connection);
  }
  return { name, dir: "pack", agents: ["toy"], srcDir, pluginName: "@trex/test" };
}

const CONN_OK = `import { defineMcpClientConnection } from "eve/connections";
export default defineMcpClientConnection({ description: "svc", url: "http://localhost:9/mcp" });
`;

Deno.test("hasFrontmatterDescription: true only with a frontmatter description line", () => {
  assert(hasFrontmatterDescription("---\ndescription: x\n---\nbody"));
  assert(!hasFrontmatterDescription("---\ntitle: x\n---\nbody"));
  assert(!hasFrontmatterDescription("no frontmatter at all"));
});

Deno.test("validateSkillPackDir accepts a well-formed pack (with and without connections)", async () => {
  const tmp = await Deno.makeTempDir();
  await validateSkillPackDir(await writePack(tmp, "plain"));
  await validateSkillPackDir(await writePack(tmp, "conn", { connection: CONN_OK }));
});

Deno.test("validateSkillPackDir rejects: no skills dir, zero skills, missing description, bad connection", async () => {
  const tmp = await Deno.makeTempDir();

  const noDir = { name: "nodir", dir: "pack", agents: ["toy"], srcDir: `${tmp}/nodir-src`, pluginName: "@trex/test" };
  await assertRejects(() => validateSkillPackDir(noDir), Error, "no");

  const empty = await writePack(tmp, "empty");
  await Deno.remove(`${empty.srcDir}/skills/greeting`, { recursive: true });
  await assertRejects(() => validateSkillPackDir(empty), Error, "at least one");

  const nodesc = await writePack(tmp, "nodesc");
  await Deno.writeTextFile(`${nodesc.srcDir}/skills/greeting/SKILL.md`, "# no frontmatter\n");
  await assertRejects(() => validateSkillPackDir(nodesc), Error, "description");

  const badconn = await writePack(tmp, "badconn", { connection: "export default {};\n" });
  await assertRejects(() => validateSkillPackDir(badconn), Error, "eve/connections");
});

Deno.test("stageSkillPacks stages skills (with supporting files) and connections under pack-- prefixes", async () => {
  const tmp = await Deno.makeTempDir();
  const p = await writePack(tmp, "mypack", { connection: CONN_OK });
  const staged = `${tmp}/agent`;
  await Deno.mkdir(staged, { recursive: true });
  await stageSkillPacks(staged, [p]);
  const md = await Deno.readTextFile(`${staged}/skills/mypack--greeting/SKILL.md`);
  assert(md.includes("description: How to greet."));
  const ref = await Deno.readTextFile(`${staged}/skills/mypack--greeting/references/styles.md`);
  assert(ref.includes("formal"));
  const conn = await Deno.readTextFile(`${staged}/connections/mypack--svc.ts`);
  assert(conn.includes("defineMcpClientConnection"));
});

Deno.test("stageSkillPacks skips a skills/ dir entry without SKILL.md (same as the loader)", async () => {
  const tmp = await Deno.makeTempDir();
  const p = await writePack(tmp, "mypack");
  await Deno.mkdir(`${p.srcDir}/skills/not-a-skill`, { recursive: true });
  const staged = `${tmp}/agent`;
  await stageSkillPacks(staged, [p]);
  await assertRejects(() => Deno.stat(`${staged}/skills/mypack--not-a-skill`), Deno.errors.NotFound);
});

Deno.test("stageSkillPacks throws on collision instead of overwriting", async () => {
  const tmp = await Deno.makeTempDir();
  const p = await writePack(tmp, "mypack");
  const staged = `${tmp}/agent`;
  await Deno.mkdir(`${staged}/skills/mypack--greeting`, { recursive: true });
  await assertRejects(() => stageSkillPacks(staged, [p]), Error, "refusing to overwrite");
});
