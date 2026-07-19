# Skills Plugin Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `skills` plugin type: plugins declare named packs of agent skills (markdown + supporting files, optional MCP connections) that name their target agents and get staged into those agents' worker dirs — including agents already running (re-stage-and-swap).

**Architecture:** Pack model/staging live in a new `core/server/plugin/skill-packs.ts` (import-cycle-free so `agents.ts` can use it); dispatch orchestration in a new `core/server/plugin/skills.ts`; `buildAgentWorkerConfig` stages targeted packs at agent staging time; a mutable "live config" ref threaded through `_addFunction` lets a post-boot pack deployment atomically repoint a mounted agent at a freshly staged dir (worker pool keys by servicePath, so the next request gets a new worker). Spec: `plugins/skills-example/docs/2026-07-19-skills-plugin-type-design.md`.

**Tech Stack:** Deno TypeScript (core/server), `jsr:@std/assert` tests, no new dependencies.

## Global Constraints

- Trusted scopes only: packs from plugins outside `TRUSTED_PLUGIN_SCOPES` (`@trex/`, `@ohdsi/`, from `core/server/plugin/function.ts:471`) are skipped with a `console.error`, never a throw.
- `--` is the reserved pack/skill separator: rejected in pack names and pack skill dir names; staged skills are `skills/<pack>--<skill>/`, staged connections `connections/<pack>--<file>`.
- Pack staging writes ONLY into an agent's staged dir (the `trex-agents-*` temp dir), never into any plugin's source dir.
- Collisions with existing files/dirs in the staged agent dir throw (mirror `agent-memory.ts:256-261`).
- No DB persistence, no GraphQL/MCP admin surface changes, no changes to the install SQL surface.
- Run tests from `core/` (the Deno workspace root): `cd core && deno test -A server/plugin/<file>.test.ts`. The plugin tests here need no `DATABASE_URL`.
- Match existing code style: 2-space indent, doc comments explain *why* (see `agents.ts`), conventional-commit messages (`feat(skills): ...`), no AI trailers.
- Global registries (`DECLARED_SKILL_PACKS`, `AGENT_MOUNTS`) get `_clear...ForTest()` helpers; every test that touches them clears them first.

---

### Task 1: Move `copyDirRecursive` into `utils.ts`

`skill-packs.ts` (Task 3) needs recursive copy; it must not import `agents.ts` (agents.ts will import skill-packs.ts — that would be a cycle). Move the existing helper to `utils.ts`.

**Files:**
- Modify: `core/server/plugin/utils.ts` (append)
- Modify: `core/server/plugin/agents.ts:71-95` (delete local helper, import instead)
- Test: existing `core/server/plugin/agents.test.ts` (unchanged — proves the move)

**Interfaces:**
- Produces: `copyDirRecursive(src: string, dest: string, skipNames?: ReadonlySet<string>): Promise<void>` exported from `core/server/plugin/utils.ts`.

- [ ] **Step 1: Move the helper**

Cut lines 71-95 of `core/server/plugin/agents.ts` (the comment block + `async function copyDirRecursive`) and paste at the end of `core/server/plugin/utils.ts`, adding `export`:

```ts
// `skipNames`, when given, is applied only at THIS call's own level (never
// forwarded into the recursive calls for subdirectories) — it exists so
// callers can exclude specific top-level entries (see agents.ts's `evals`
// exclusion) without accidentally skipping a same-named dir nested deeper in
// the tree.
export async function copyDirRecursive(src: string, dest: string, skipNames?: ReadonlySet<string>): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    if (skipNames?.has(entry.name)) continue;
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    // Deno.stat follows symlinks, so linked files/dirs are copied as content.
    const info = entry.isSymlink ? await Deno.stat(s) : entry;
    if (info.isDirectory) await copyDirRecursive(s, d);
    else if (info.isFile) await Deno.copyFile(s, d);
  }
}
```

In `agents.ts`, add to the existing `./utils.ts`-style imports (there is none yet — add a new import line below the existing imports at the top):

```ts
import { copyDirRecursive } from "./utils.ts";
```

- [ ] **Step 2: Run the existing agents tests to prove the move is behavior-neutral**

Run: `cd core && deno test -A server/plugin/agents.test.ts server/plugin/utils.test.ts`
Expected: all PASS (the staging tests exercise `copyDirRecursive` heavily).

- [ ] **Step 3: Commit**

```bash
git add core/server/plugin/utils.ts core/server/plugin/agents.ts
git commit -m "refactor(plugin): move copyDirRecursive to utils for reuse by skill packs"
```

---

### Task 2: Pack manifest model + declaration registry (`skill-packs.ts`, pure part)

**Files:**
- Create: `core/server/plugin/skill-packs.ts`
- Test: `core/server/plugin/skill-packs.test.ts`

**Interfaces:**
- Produces:
  - `interface SkillPackDecl { name: string; dir: string; agents: string[] }`
  - `interface SkillPackEntry extends SkillPackDecl { srcDir: string; pluginName: string }`
  - `normalizeSkillsValue(value: unknown): SkillPackDecl[]` — throws on invalid input
  - `registerSkillPack(pack: SkillPackEntry): boolean` — true iff newly added; identical re-registration is a no-op `false`; same name from a different plugin/dir throws
  - `packTargetsAgent(pack: SkillPackEntry, agentName: string): boolean`
  - `packsForAgent(agentName: string): SkillPackEntry[]` — name-sorted
  - `_clearDeclaredSkillPacksForTest(): void`

- [ ] **Step 1: Write the failing tests**

Create `core/server/plugin/skill-packs.test.ts`:

```ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  _clearDeclaredSkillPacksForTest,
  normalizeSkillsValue,
  packsForAgent,
  packTargetsAgent,
  registerSkillPack,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && deno test -A server/plugin/skill-packs.test.ts`
Expected: FAIL — module `./skill-packs.ts` not found.

- [ ] **Step 3: Implement the model**

Create `core/server/plugin/skill-packs.ts`:

```ts
// The `skills` plugin type (design: plugins/skills-example/docs/
// 2026-07-19-skills-plugin-type-design.md): a plugin declares named packs of
// agent skills (markdown + supporting files, optionally MCP connections),
// and the PACK names its target agents — inverted relative to memory links
// (agent-memory.ts), so a pack can be deployed after its target agent is
// already installed and running. This module is the pack model + staging;
// dispatch-time orchestration (trust gate, dynamic re-stage) lives in
// skills.ts, kept separate so agents.ts can import THIS module without an
// import cycle (skills.ts imports agents.ts).
import { copyDirRecursive } from "./utils.ts";

// Same alphabet as agents.ts's agent-name regex. "--" is additionally
// rejected: it is the reserved separator in staged `skills/<pack>--<skill>/`
// dirs, and how /eve/v1/info derives pack provenance from a skill name.
const SKILL_PACK_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const AGENT_TARGET_RE = /^[a-z0-9][a-z0-9_-]*$/i;

export interface SkillPackDecl {
  name: string;
  dir: string;
  // Exact agent names, or "*" for every agent on the deployment.
  agents: string[];
}

export interface SkillPackEntry extends SkillPackDecl {
  // Absolute pack dir: `${pluginDir}/${decl.dir}`.
  srcDir: string;
  // Declaring plugin's full (scoped) name — identity for idempotent
  // re-registration and for the cross-plugin name-clash error.
  pluginName: string;
}

export function normalizeSkillsValue(value: unknown): SkillPackDecl[] {
  const arr = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  return arr.map((e) => {
    const entry = e as { name?: string; dir?: string; agents?: unknown };
    if (!entry?.name || !SKILL_PACK_NAME_RE.test(entry.name) || entry.name.includes("--")) {
      throw new Error(
        `skills: each pack needs a name ([a-zA-Z0-9_-], no "--"), got ${JSON.stringify(e)}`,
      );
    }
    if (seen.has(entry.name)) {
      throw new Error(`skills: duplicate pack name "${entry.name}"`);
    }
    seen.add(entry.name);
    const agents = Array.isArray(entry.agents) ? entry.agents : [];
    const valid = agents.length > 0 &&
      agents.every((a) => typeof a === "string" && (a === "*" || AGENT_TARGET_RE.test(a)));
    if (!valid) {
      throw new Error(
        `skills: pack "${entry.name}" needs agents: ["<agent-name>" | "*", ...] (non-empty), got ${JSON.stringify(entry.agents)}`,
      );
    }
    return { name: entry.name, dir: entry.dir ?? "pack", agents: agents as string[] };
  });
}

// Declared packs across every plugin, keyed by pack name (a GLOBAL
// namespace). Populated by a boot pre-pass (collectDeclaredSkillPacks in
// Task 6 — run before any plugin is dispatched, same rationale as
// plugin.ts's DECLARED_MEMORY_NAMES: the pack-declaring plugin and the
// agent-declaring plugin can be scanned in either order) and incrementally
// by skills.ts's addSkillsPlugin for post-boot dynamic registrations.
const DECLARED_SKILL_PACKS = new Map<string, SkillPackEntry>();

// True iff the pack is NEW (i.e. a post-boot dynamic deployment — at boot
// the pre-pass has already recorded every on-disk pack, so the dispatch
// pass re-encountering the identical declaration returns false). A
// same-named pack from a different plugin or dir is a hard error.
export function registerSkillPack(pack: SkillPackEntry): boolean {
  const existing = DECLARED_SKILL_PACKS.get(pack.name);
  if (existing) {
    if (existing.pluginName === pack.pluginName && existing.srcDir === pack.srcDir) return false;
    throw new Error(
      `skills: pack name "${pack.name}" already declared by ${existing.pluginName} (${existing.srcDir}) — pack names are global`,
    );
  }
  DECLARED_SKILL_PACKS.set(pack.name, pack);
  return true;
}

export function packTargetsAgent(pack: SkillPackEntry, agentName: string): boolean {
  return pack.agents.includes("*") || pack.agents.includes(agentName);
}

// Name-sorted so staging (and any collision error) is deterministic
// regardless of declaration order.
export function packsForAgent(agentName: string): SkillPackEntry[] {
  return [...DECLARED_SKILL_PACKS.values()]
    .filter((p) => packTargetsAgent(p, agentName))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function _clearDeclaredSkillPacksForTest(): void {
  DECLARED_SKILL_PACKS.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && deno test -A server/plugin/skill-packs.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/server/plugin/skill-packs.ts core/server/plugin/skill-packs.test.ts
git commit -m "feat(skills): skill-pack manifest model and declaration registry"
```

---

### Task 3: Pack validation + staging (`skill-packs.ts`, I/O part)

**Files:**
- Modify: `core/server/plugin/skill-packs.ts` (append)
- Test: `core/server/plugin/skill-packs.test.ts` (append)

**Interfaces:**
- Consumes: `copyDirRecursive` from Task 1, model from Task 2.
- Produces:
  - `hasFrontmatterDescription(markdown: string): boolean`
  - `validateSkillPackDir(pack: SkillPackEntry): Promise<void>` — throws with a `skills: pack "<name>"`-prefixed message on: missing `skills/` dir, zero skills, invalid skill dir name, `SKILL.md` without a frontmatter description, non-`.ts`/`.js` connection entries, connection files not importing `"eve/connections"`.
  - `stageSkillPacks(stagedAgentDir: string, packs: SkillPackEntry[]): Promise<void>` — copies `skills/<s>/` → `skills/<pack>--<s>/` and `connections/<f>` → `connections/<pack>--<f>`; throws on collision.

- [ ] **Step 1: Write the failing tests**

Append to `core/server/plugin/skill-packs.test.ts`:

```ts
import { assertRejects } from "jsr:@std/assert";
import { hasFrontmatterDescription, stageSkillPacks, validateSkillPackDir } from "./skill-packs.ts";

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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd core && deno test -A server/plugin/skill-packs.test.ts`
Expected: FAIL — `hasFrontmatterDescription` / `validateSkillPackDir` / `stageSkillPacks` not exported.

- [ ] **Step 3: Implement validation + staging**

Append to `core/server/plugin/skill-packs.ts`:

```ts
// Frontmatter `description:` presence check — mirrors what loader.ts's
// parseSkillDescription reads first (the one-liner shown in the system
// prompt), kept local so plugin/ doesn't pull the whole agents loader (and
// its edn-data dep) into the server process just to validate a manifest.
export function hasFrontmatterDescription(markdown: string): boolean {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  return !!fm && /^description:\s*\S/m.test(fm[1]);
}

export async function validateSkillPackDir(pack: SkillPackEntry): Promise<void> {
  const label = `skills: pack "${pack.name}" (${pack.pluginName})`;
  let found = 0;
  try {
    for await (const entry of Deno.readDir(`${pack.srcDir}/skills`)) {
      if (!entry.isDirectory) continue;
      if (!SKILL_PACK_NAME_RE.test(entry.name) || entry.name.includes("--")) {
        throw new Error(`${label}: invalid skill dir name "${entry.name}" ([a-zA-Z0-9_-], no "--")`);
      }
      let md: string;
      try {
        md = await Deno.readTextFile(`${pack.srcDir}/skills/${entry.name}/SKILL.md`);
      } catch (e) {
        // Dir without SKILL.md: the loader skips it silently (loader.ts's
        // skills discovery) — so do we, rather than failing the pack.
        if (e instanceof Deno.errors.NotFound) continue;
        throw e;
      }
      if (!hasFrontmatterDescription(md)) {
        throw new Error(`${label}: skills/${entry.name}/SKILL.md needs a frontmatter "description:" line`);
      }
      found++;
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error(`${label}: no ${pack.srcDir}/skills directory`);
    }
    throw e;
  }
  if (found === 0) {
    throw new Error(`${label}: declares no skills — need at least one skills/<name>/SKILL.md`);
  }
  // connections/ is optional. Full __trexConnection brand validation can only
  // happen at worker load (a same-process dynamic import can't resolve the
  // "eve/connections" bare specifier) — a cheap content sniff catches the
  // common mistake of dropping a non-connection file in the dir, which would
  // otherwise break the TARGET agent's worker boot (loader.ts throws on
  // unbranded connection modules).
  try {
    for await (const entry of Deno.readDir(`${pack.srcDir}/connections`)) {
      if (!entry.isFile || !/\.(ts|js)$/.test(entry.name)) {
        throw new Error(`${label}: connections/${entry.name} — only .ts/.js connection modules allowed`);
      }
      const src = await Deno.readTextFile(`${pack.srcDir}/connections/${entry.name}`);
      if (!src.includes("eve/connections")) {
        throw new Error(`${label}: connections/${entry.name} does not import "eve/connections" — not a connection module`);
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

async function assertVacant(path: string, packName: string, what: string): Promise<void> {
  let exists = true;
  try {
    await Deno.stat(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) exists = false;
    else throw e;
  }
  if (exists) {
    throw new Error(
      `skills: refusing to overwrite "${path}" (collides with pack "${packName}" ${what})`,
    );
  }
}

// Stages every given pack into an agent's STAGED dir (see agents.ts's
// buildAgentWorkerConfig for where that comes from) — all I/O confined to
// stagedAgentDir, same rule as agent-memory.ts's generateMemoryArtifacts.
// Collision → throw: hand-authored agent content wins by failing loudly.
export async function stageSkillPacks(stagedAgentDir: string, packs: SkillPackEntry[]): Promise<void> {
  for (const pack of packs) {
    for await (const entry of Deno.readDir(`${pack.srcDir}/skills`)) {
      if (!entry.isDirectory) continue;
      try {
        await Deno.stat(`${pack.srcDir}/skills/${entry.name}/SKILL.md`);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) continue;
        throw e;
      }
      const dest = `${stagedAgentDir}/skills/${pack.name}--${entry.name}`;
      await assertVacant(dest, pack.name, `skill "${entry.name}"`);
      await copyDirRecursive(`${pack.srcDir}/skills/${entry.name}`, dest);
    }
    try {
      for await (const entry of Deno.readDir(`${pack.srcDir}/connections`)) {
        if (!entry.isFile) continue;
        const dest = `${stagedAgentDir}/connections/${pack.name}--${entry.name}`;
        await assertVacant(dest, pack.name, `connection "${entry.name}"`);
        await Deno.mkdir(`${stagedAgentDir}/connections`, { recursive: true });
        await Deno.copyFile(`${pack.srcDir}/connections/${entry.name}`, dest);
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && deno test -A server/plugin/skill-packs.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add core/server/plugin/skill-packs.ts core/server/plugin/skill-packs.test.ts
git commit -m "feat(skills): pack validation and staging into agent dirs"
```

---

### Task 4: Stage targeted packs in `buildAgentWorkerConfig`

**Files:**
- Modify: `core/server/plugin/agents.ts` (signature + one staging block)
- Test: `core/server/plugin/agents.test.ts` (append)

**Interfaces:**
- Consumes: `packsForAgent`, `stageSkillPacks`, `SkillPackEntry` from `skill-packs.ts`.
- Produces: `buildAgentWorkerConfig(pluginDir, entry, pluginFullName, skillPacks: SkillPackEntry[] = packsForAgent(entry.name))` — 4th param defaults to the global registry; explicit for tests. Return type unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `core/server/plugin/agents.test.ts`:

```ts
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
```

(`assertRejects` is already imported at the top of this test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && deno test -A server/plugin/agents.test.ts`
Expected: the two new tests FAIL (4th argument ignored / no staging), all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `core/server/plugin/agents.ts`, add to imports:

```ts
import { packsForAgent, stageSkillPacks, type SkillPackEntry } from "./skill-packs.ts";
```

Change the `buildAgentWorkerConfig` signature (agents.ts:97-101):

```ts
export async function buildAgentWorkerConfig(
  pluginDir: string,
  entry: AgentEntry,
  pluginFullName: string,
  skillPacks: SkillPackEntry[] = packsForAgent(entry.name),
): Promise<{ source: string; servicePath: string; importMapPath: string; env: Record<string, string> }> {
```

Directly below the `generateMemoryArtifacts` block (after agents.ts:164), add:

```ts
  // Skill packs (skills plugin type): every declared `trex.skills` pack
  // targeting this agent (exact name or "*") is staged into the agent's
  // staged dir — same servicePath-confinement rule as the linked-memory
  // artifacts above. The default comes from the global pack registry
  // (pre-pass-populated, so plugin scan order doesn't matter — see
  // skill-packs.ts); tests and explicit re-stage flows can inject.
  if (skillPacks.length) {
    await stageSkillPacks(stagedAgentDir, skillPacks);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && deno test -A server/plugin/agents.test.ts server/plugin/skill-packs.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add core/server/plugin/agents.ts core/server/plugin/agents.test.ts
git commit -m "feat(skills): stage targeted skill packs in buildAgentWorkerConfig"
```

---

### Task 5: Live worker config indirection + agent mount registry + rebuild

The new mechanism from the spec §4. `_addFunction` captures `path`/`imports`/`xenv` in TWO places — the fnmap handler (function.ts:498-501) and the Express route's `_callWorker` call (function.ts:607) — both must resolve through the live ref.

**Files:**
- Modify: `core/server/plugin/function.ts` (`_addFunction`)
- Modify: `core/server/plugin/agents.ts` (`addAgentsPlugin` + new registry/rebuild)
- Test: `core/server/plugin/agents.test.ts` (append)

**Interfaces:**
- Produces (function.ts):
  - `interface LiveWorkerConfig { servicePath: string; importMapPath: string | null; xenv: unknown }` (exported)
  - `_addFunction` honors optional `fncfg.liveConfig: LiveWorkerConfig` — when present, every request reads `servicePath`/`importMapPath`/`xenv` from it instead of the captured arguments. Absent → behavior byte-for-byte unchanged.
- Produces (agents.ts):
  - `interface AgentMountRecord { entry: AgentEntry; pluginDir: string; pluginFullName: string; basePath: string; envOverrides: Record<string, string>; live: LiveWorkerConfig }`
  - `AGENT_MOUNTS: Map<string, AgentMountRecord>` keyed `` `${pluginFullName}/${entry.name}` `` (exported)
  - `rebuildAgentMount(rec: AgentMountRecord, opts?: { cleanupDelayMs?: number }): Promise<void>`
  - `_clearAgentMountsForTest(): void`

- [ ] **Step 1: Write the failing tests**

Append to `core/server/plugin/agents.test.ts`:

```ts
import { _clearAgentMountsForTest, AGENT_MOUNTS, rebuildAgentMount } from "./agents.ts";

// Route-registering app stub: _addFunction's app.all(...) must succeed but
// nothing is served — these tests exercise mount bookkeeping, not HTTP.
const stubApp = { all: () => {} } as never;

Deno.test("addAgentsPlugin records an AgentMountRecord whose live config matches the mount", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  _clearAgentMountsForTest();
  _clearDeclaredSkillPacksForTest();
  await addAgentsPlugin(stubApp, { name: "toy", dir: "agent" }, toyPlugin, "@trex/toy-agent");
  const rec = AGENT_MOUNTS.get("@trex/toy-agent/toy");
  assert(rec, "mount record must exist");
  assertEquals(rec.pluginDir, toyPlugin);
  assertEquals(rec.basePath, "/plugins/trex/toy");
  assertEquals(rec.envOverrides.TREX_AGENT_BASE, "/plugins/trex/toy");
  // Live config points at the staged dir and carries the merged worker env.
  assertEquals(rec.live.importMapPath, `${rec.live.servicePath}/import_map.json`);
  const shared = (rec.live.xenv as { _shared: Record<string, string> })._shared;
  assertEquals(shared.TREX_AGENT_DIR, `${rec.live.servicePath}/agent`);
  assertEquals(shared.TREX_AGENT_BASE, "/plugins/trex/toy");
});

Deno.test("rebuildAgentMount swaps the live config to a freshly staged dir (and can stage new packs)", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  _clearAgentMountsForTest();
  _clearDeclaredSkillPacksForTest();
  try {
    await addAgentsPlugin(stubApp, { name: "toy", dir: "agent" }, toyPlugin, "@trex/toy-agent");
    const rec = AGENT_MOUNTS.get("@trex/toy-agent/toy")!;
    const oldPath = rec.live.servicePath;
    // Pack deployed AFTER the agent was mounted:
    registerSkillPack(await writeTestPack("latepack", ["toy"]));
    await rebuildAgentMount(rec, { cleanupDelayMs: 0 });
    assert(rec.live.servicePath !== oldPath, "servicePath must be swapped");
    // New staged dir has the late pack; env re-derived against the new dir,
    // with mount-time overrides re-applied.
    await Deno.stat(`${rec.live.servicePath}/agent/skills/latepack--greeting/SKILL.md`);
    const shared = (rec.live.xenv as { _shared: Record<string, string> })._shared;
    assertEquals(shared.TREX_AGENT_DIR, `${rec.live.servicePath}/agent`);
    assertEquals(shared.TREX_AGENT_BASE, "/plugins/trex/toy");
    // Old staged dir removed (cleanupDelayMs: 0 → immediate).
    await assertRejects(() => Deno.stat(oldPath), Deno.errors.NotFound);
  } finally {
    _clearDeclaredSkillPacksForTest();
    _clearAgentMountsForTest();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && deno test -A server/plugin/agents.test.ts`
Expected: FAIL — `AGENT_MOUNTS` / `rebuildAgentMount` / `_clearAgentMountsForTest` not exported.

- [ ] **Step 3: Implement the function.ts indirection**

In `core/server/plugin/function.ts`, add near `TRUSTED_PLUGIN_SCOPES` (function.ts:471):

```ts
// Live-config indirection (skills plugin type, re-stage-and-swap): an agents
// mount passes fncfg.liveConfig, a MUTABLE ref whose fields are re-read on
// every request. Swapping servicePath/importMapPath/xenv on the ref
// atomically repoints the mount at a freshly staged dir — the worker pool
// keys workers by servicePath, so the next request lazily creates a worker
// from the new dir; no restart API needed. Absent liveConfig (every other
// plugin type), behavior is unchanged.
export interface LiveWorkerConfig {
  servicePath: string;
  importMapPath: string | null;
  xenv: unknown;
}
```

In `_addFunction` (function.ts:476), directly after the `REGISTERED_FUNCTIONS.push(...)` line, add:

```ts
  const live = fncfg?.liveConfig as LiveWorkerConfig | undefined;
  const cur = () => live ?? { servicePath: path, importMapPath: imports, xenv };
```

Replace the fnmap handler (function.ts:498-499):

```ts
  const handler = (req: globalThis.Request) => {
    const c = cur();
    return _callWorker(req, c.servicePath, c.importMapPath, fncfg, dir, c.xenv);
  };
```

Replace the Express route's worker call (function.ts:607):

```ts
      const c = cur();
      const workerResponse = await _callWorker(webReq, c.servicePath, c.importMapPath, fncfg, dir, c.xenv, controller.signal);
```

- [ ] **Step 4: Implement the mount registry + rebuild in agents.ts**

Add to agents.ts imports:

```ts
import type { LiveWorkerConfig } from "./function.ts";
```

(merge into the existing `./function.ts` import line as a separate `import type`).

Add above `addAgentsPlugin`:

```ts
export interface AgentMountRecord {
  entry: AgentEntry;
  pluginDir: string;
  pluginFullName: string;
  basePath: string;
  // Mount-time env applied ON TOP of buildAgentWorkerConfig's env, re-applied
  // verbatim on every rebuild: TREX_AGENT_BASE always; the gateway signer's
  // DISCORD_PUBLIC_KEY when gateway mode is on (the ephemeral keypair lives
  // in startDiscordGateway's client — a rebuild must keep the SAME public key
  // or the loopback shim stops passing the adapter's signature gate).
  envOverrides: Record<string, string>;
  live: LiveWorkerConfig;
}

// One record per mounted agent, keyed `${pluginFullName}/${entry.name}`.
// The skills plugin type (skills.ts) uses this to find and re-stage agents
// that were already mounted when a pack targeting them is deployed.
export const AGENT_MOUNTS = new Map<string, AgentMountRecord>();

export function _clearAgentMountsForTest(): void {
  AGENT_MOUNTS.clear();
}

// Re-stages an agent's worker dir from source (picking up newly declared
// skill packs via buildAgentWorkerConfig's registry default) and atomically
// repoints the mount through the shared live ref (see function.ts's
// LiveWorkerConfig). On failure the swap never happens — the caller logs and
// the running agent keeps serving from its current staged dir.
export async function rebuildAgentMount(
  rec: AgentMountRecord,
  opts: { cleanupDelayMs?: number } = {},
): Promise<void> {
  const cfg = await buildAgentWorkerConfig(rec.pluginDir, rec.entry, rec.pluginFullName);
  const old = rec.live.servicePath;
  rec.live.servicePath = cfg.servicePath;
  rec.live.importMapPath = cfg.importMapPath;
  rec.live.xenv = { _shared: { ...cfg.env, ...rec.envOverrides } };
  // The previous worker may still be mid-request against the old dir —
  // delete after a grace period, not immediately. (First cleanup this code
  // path has ever had: boot-time staged dirs were never removed.)
  const delay = opts.cleanupDelayMs ?? 5 * 60_000;
  const rm = () => Deno.remove(old, { recursive: true }).catch(() => {});
  if (delay === 0) {
    await rm();
  } else {
    const t = setTimeout(rm, delay);
    // Cleanup must never keep the process alive.
    Deno.unrefTimer(t);
  }
}
```

In `addAgentsPlugin`, replace the signer-env line and the `_addFunction` call (agents.ts:403-421) with:

```ts
    const signer = gateway ? await createGatewaySigner() : null;
    const envOverrides: Record<string, string> = { TREX_AGENT_BASE: basePath };
    if (signer) {
      cfg.env.DISCORD_PUBLIC_KEY = signer.publicKeyHex;
      envOverrides.DISCORD_PUBLIC_KEY = signer.publicKeyHex;
    }
    const live: LiveWorkerConfig = {
      servicePath: cfg.servicePath,
      importMapPath: cfg.importMapPath,
      xenv: { _shared: { ...cfg.env, ...envOverrides } },
    };
    // Re-registration (dev reload) overwrites the record — same idempotency
    // convention as the discordGateways map below.
    AGENT_MOUNTS.set(`${name}/${entry.name}`, {
      entry, pluginDir: dir, pluginFullName: name, basePath, envOverrides, live,
    });
    _addFunction(
      app,
      cfg.source,
      cfg.servicePath,
      cfg.importMapPath,
      {
        function: `/agents/${entry.name}`,
        allowHostFsAccess: true,
        // Channel subpaths ({basePath}/eve/v1/<channelId>/*) bypass proxy auth;
        // the worker enforces adapter signature verification instead. session/
        // chat/health/info keep authContext+pluginAuthz. See the pattern's doc.
        authExemptPattern: channelAuthExemptPattern(basePath),
        liveConfig: live,
      },
      dir,
      name,
      live.xenv,
    );
```

(The old `{ _shared: { ...cfg.env, TREX_AGENT_BASE: basePath } }` xenv is now `live.xenv` with identical contents.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd core && deno test -A server/plugin/agents.test.ts`
Expected: all PASS (including all pre-existing tests — the no-liveConfig path must be untouched).

- [ ] **Step 6: Commit**

```bash
git add core/server/plugin/function.ts core/server/plugin/agents.ts core/server/plugin/agents.test.ts
git commit -m "feat(skills): live worker config indirection and agent mount registry/rebuild"
```

---

### Task 6: `skills` plugin type dispatch + boot pre-pass (`skills.ts`, `plugin.ts`)

**Files:**
- Create: `core/server/plugin/skills.ts`
- Modify: `core/server/plugin/skill-packs.ts` (append `collectDeclaredSkillPacks`)
- Modify: `core/server/plugin/plugin.ts` (orderRank, dispatch case, pre-pass call)
- Test: `core/server/plugin/skills.test.ts` (create)

**Interfaces:**
- Consumes: Task 2/3 model, Task 5 `AGENT_MOUNTS`/`rebuildAgentMount`, `isTrustedPluginScope`/`TRUSTED_PLUGIN_SCOPES` from `function.ts`, `scanPluginDirectory`/`splitPathList` from `utils.ts`.
- Produces:
  - `addSkillsPlugin(app: Express, value: unknown, dir: string, name: string): Promise<void>` in `skills.ts`
  - `collectDeclaredSkillPacks(rawPaths: string[]): Promise<void>` in `skill-packs.ts`

- [ ] **Step 1: Write the failing tests**

Create `core/server/plugin/skills.test.ts`:

```ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { addSkillsPlugin } from "./skills.ts";
import {
  _clearDeclaredSkillPacksForTest,
  packsForAgent,
} from "./skill-packs.ts";
import { _clearAgentMountsForTest, addAgentsPlugin, AGENT_MOUNTS } from "./agents.ts";

const stubApp = { all: () => {} } as never;

// Writes a plugin dir declaring one pack targeting `agents`, returns its dir.
async function writeSkillsPluginDir(packName: string, agents: string[]): Promise<string> {
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
  const dir = await writeSkillsPluginDir("evilpack", ["*"]);
  await addSkillsPlugin(stubApp, [{ name: "evilpack", dir: "pack", agents: ["*"] }], dir, "@evil/skills");
  assertEquals(packsForAgent("toy"), []);
});

Deno.test("addSkillsPlugin registers a valid pack (no mounted agents → no rebuild)", async () => {
  _clearDeclaredSkillPacksForTest();
  _clearAgentMountsForTest();
  const dir = await writeSkillsPluginDir("goodpack", ["toy"]);
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
      const dir = await writeSkillsPluginDir("latepack", ["toy"]);
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
    const dir = await writeSkillsPluginDir("otherpack", ["someone-else"]);
    await addSkillsPlugin(stubApp, [{ name: "otherpack", dir: "pack", agents: ["someone-else"] }], dir, "@trex/skills-test");
    assertEquals(rec.live.servicePath, oldPath, "untargeted agent must not be re-staged");
  } finally {
    _clearDeclaredSkillPacksForTest();
    _clearAgentMountsForTest();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd core && deno test -A server/plugin/skills.test.ts`
Expected: FAIL — module `./skills.ts` not found.

- [ ] **Step 3: Implement `skills.ts`**

Create `core/server/plugin/skills.ts`:

```ts
// The `skills` plugin type — dispatch-time orchestration. The pack model and
// staging live in skill-packs.ts (import-cycle-free so agents.ts can stage
// packs); this module owns what happens when a skills plugin REGISTERS:
// trust-gate, validate and record its packs, and for packs that are NEW at
// this point — which can only mean a post-boot dynamic deployment, since the
// boot pre-pass (collectDeclaredSkillPacks) records every on-disk pack
// before any agent is staged — re-stage-and-swap every mounted agent they
// target (the spec's "deploy skills to a running agent" flow).
import type { Express } from "express";
import { isTrustedPluginScope, TRUSTED_PLUGIN_SCOPES } from "./function.ts";
import { AGENT_MOUNTS, rebuildAgentMount } from "./agents.ts";
import {
  normalizeSkillsValue,
  packTargetsAgent,
  registerSkillPack,
  validateSkillPackDir,
  type SkillPackEntry,
} from "./skill-packs.ts";

export async function addSkillsPlugin(
  _app: Express,
  value: unknown,
  dir: string,
  name: string,
): Promise<void> {
  if (!isTrustedPluginScope(name)) {
    // Log and skip, don't throw — same convention as agents/memory: packs
    // inject prompt content and MCP connections into OTHER plugins' agents,
    // so only first-party scopes may declare them.
    console.error(
      `skills: plugin ${name} skipped — trex.skills requires a trusted scope (${TRUSTED_PLUGIN_SCOPES.join(", ")})`,
    );
    return;
  }
  const fresh: SkillPackEntry[] = [];
  for (const decl of normalizeSkillsValue(value)) {
    const pack: SkillPackEntry = { ...decl, srcDir: `${dir}/${decl.dir}`, pluginName: name };
    await validateSkillPackDir(pack);
    if (registerSkillPack(pack)) fresh.push(pack);
    console.log(`skills: pack "${decl.name}" (${name}) declared for agents: ${decl.agents.join(", ")}`);
  }
  if (fresh.length === 0) return;
  for (const [key, rec] of AGENT_MOUNTS) {
    if (!fresh.some((p) => packTargetsAgent(p, rec.entry.name))) continue;
    try {
      await rebuildAgentMount(rec);
      console.log(`skills: re-staged mounted agent ${key} with newly deployed pack(s)`);
    } catch (e) {
      // The swap never happened — the agent keeps serving its current dir.
      console.error(
        `skills: re-stage of agent ${key} failed — agent unchanged:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
```

- [ ] **Step 4: Implement the pre-pass in `skill-packs.ts`**

Append to `core/server/plugin/skill-packs.ts` (and add the imports to its top):

```ts
import { scanPluginDirectory, splitPathList } from "./utils.ts";
import { isTrustedPluginScope } from "./function.ts";
```

```ts
// Boot pre-pass, run once at the top of initPlugins BEFORE any plugin is
// dispatched (same rationale as plugin.ts's collectDeclaredMemoryNames: the
// pack-declaring plugin and the agent-declaring plugin can be scanned in
// either order, and buildAgentWorkerConfig must see every pack when it
// stages an agent). Invalid declarations are swallowed here — they surface
// with a real error when the dispatch pass reaches that plugin.
export async function collectDeclaredSkillPacks(rawPaths: string[]): Promise<void> {
  for (const rawPath of rawPaths) {
    for (const dir of splitPathList(rawPath)) {
      const scanned = await scanPluginDirectory(dir);
      for (const { dir: pluginDir, pkg } of scanned) {
        const value = pkg?.trex?.skills;
        if (value === undefined) continue;
        if (!isTrustedPluginScope(pkg?.name ?? "")) continue;
        try {
          for (const decl of normalizeSkillsValue(value)) {
            registerSkillPack({ ...decl, srcDir: `${pluginDir}/${decl.dir}`, pluginName: pkg.name });
          }
        } catch {
          // Reported by addSkillsPlugin in the dispatch pass.
        }
      }
    }
  }
}
```

- [ ] **Step 5: Wire `plugin.ts`**

In `core/server/plugin/plugin.ts`:

Add imports:

```ts
import { addSkillsPlugin } from "./skills.ts";
import { collectDeclaredSkillPacks } from "./skill-packs.ts";
```

Update `orderRank` (plugin.ts:125-135) — `skills` sorts BEFORE `agents` so a dynamically registered plugin declaring both its own agent and its own packs registers the packs first and stages its agent exactly once (at boot the pre-pass already makes order irrelevant):

```ts
      const orderRank = (k: string): number => {
        switch (k) {
          case "ui": return 0;
          case "transform": return 1;
          case "functions": return 2;
          case "flow": return 3;
          case "skills": return 4;
          case "agents": return 5;
          case "memory": return 6;
          default: return 7;
        }
      };
```

Add the dispatch case (in the `switch (key)`, before `case "memory"`):

```ts
          case "skills":
            await addSkillsPlugin(app, value, dir, fullName);
            break;
```

In `initPlugins` (after the `collectDeclaredMemoryNames` call, plugin.ts:234):

```ts
    // Same pre-pass rationale as collectDeclaredMemoryNames directly above,
    // for `trex.skills` packs (see skill-packs.ts).
    await collectDeclaredSkillPacks([devPath, pluginsPath]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd core && deno test -A server/plugin/skills.test.ts server/plugin/skill-packs.test.ts server/plugin/agents.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add core/server/plugin/skills.ts core/server/plugin/skills.test.ts core/server/plugin/skill-packs.ts core/server/plugin/plugin.ts
git commit -m "feat(skills): skills plugin type dispatch, boot pre-pass, dynamic re-stage"
```

---

### Task 7: Pack provenance in `/eve/v1/info`

**Files:**
- Modify: `core/server/agents/loader.ts` (one exported helper)
- Modify: `core/server/agents/service/handler.ts:298-304` (skills.static map)
- Test: `core/server/agents/loader.test.ts` (append)

**Interfaces:**
- Produces: `packOfSkillName(name: string): string | null` exported from `loader.ts` (staged into workers alongside the loader, so handler.ts can import it).

- [ ] **Step 1: Write the failing test**

Append to `core/server/agents/loader.test.ts`:

```ts
import { packOfSkillName } from "./loader.ts";

Deno.test("packOfSkillName derives pack provenance from the reserved '--' separator", () => {
  assertEquals(packOfSkillName("mypack--greeting"), "mypack");
  assertEquals(packOfSkillName("hand-authored"), null);   // single dashes are fine
  assertEquals(packOfSkillName("plain"), null);
  assertEquals(packOfSkillName("--weird"), null);          // no empty pack name
});
```

(Use this test file's existing assert imports; add `assertEquals` if not present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && deno test -A server/agents/loader.test.ts`
Expected: FAIL — `packOfSkillName` not exported.

- [ ] **Step 3: Implement**

In `core/server/agents/loader.ts`, add below `parseSkillDescription` (loader.ts:92):

```ts
// A skill staged from a skills-plugin pack is named `<pack>--<skill>`
// (plugin/skill-packs.ts's staging convention; "--" is rejected in pack and
// pack-skill names, and reserved — hand-authored skills should not use it).
// Returns the pack name, or null for a hand-authored skill.
export function packOfSkillName(name: string): string | null {
  const i = name.indexOf("--");
  return i > 0 ? name.slice(0, i) : null;
}
```

In `core/server/agents/service/handler.ts`, add `packOfSkillName` to the existing `../loader.ts` import, then extend the `skills.static` map (handler.ts:300-303):

```ts
          static: agent.skills.map((s) => ({
            name: s.name, logicalPath: s.path, sourceKind: "module",
            description: s.description, markdown: s.content ?? "",
            // Provenance: which skills-plugin pack injected this skill
            // (null = hand-authored in the agent dir).
            pack: packOfSkillName(s.name),
          })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && deno test -A server/agents/loader.test.ts server/agents/service/handler.test.ts`
Expected: all PASS. (If `handler.test.ts` requires `DATABASE_URL`, run it as `DATABASE_URL=<your local pg url> deno test ...` per the repo gotcha; the loader test needs nothing.)

- [ ] **Step 5: Commit**

```bash
git add core/server/agents/loader.ts core/server/agents/loader.test.ts core/server/agents/service/handler.ts
git commit -m "feat(skills): expose pack provenance for injected skills in /eve/v1/info"
```

---

### Task 8: Example plugin + docs + full verification

**Files:**
- Create: `plugins/skills-example/package.json`
- Create: `plugins/skills-example/pack/skills/haiku-mode/SKILL.md`
- Create: `plugins/skills-example/pack/skills/haiku-mode/references/format.md`
- Modify: `core/server/agents/README.md` (new "Skill packs" section, after the linked-memories section)
- Test: `core/server/plugin/skills.test.ts` (append manifest test)

- [ ] **Step 1: Write the failing manifest test**

Append to `core/server/plugin/skills.test.ts` (same pattern as agents.test.ts's devx manifest test):

```ts
import { normalizeSkillsValue, validateSkillPackDir } from "./skill-packs.ts";

Deno.test("manifest: the real plugins/skills-example pack normalizes and validates", async () => {
  const pluginDir = new URL("../../../plugins/skills-example", import.meta.url).pathname;
  const pkg = JSON.parse(await Deno.readTextFile(`${pluginDir}/package.json`));
  const decls = normalizeSkillsValue(pkg.trex.skills);
  assertEquals(decls, [{ name: "examplepack", dir: "pack", agents: ["toy"] }]);
  await validateSkillPackDir({ ...decls[0], srcDir: `${pluginDir}/pack`, pluginName: pkg.name });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && deno test -A server/plugin/skills.test.ts`
Expected: the new test FAILS — `plugins/skills-example/package.json` not found.

- [ ] **Step 3: Create the example plugin**

`plugins/skills-example/package.json`:

```json
{
  "name": "@trex/skills-example",
  "version": "0.1.0",
  "description": "Example skills plugin: deploys a skill pack to the toy agent",
  "trex": {
    "skills": [
      { "name": "examplepack", "dir": "pack", "agents": ["toy"] }
    ]
  }
}
```

`plugins/skills-example/pack/skills/haiku-mode/SKILL.md`:

```markdown
---
description: Answer in haiku form when the user asks for a poetic reply.
---

# Haiku mode

When the user asks for a poetic, haiku, or verse-style answer:

1. Answer with a single haiku — nothing else.
2. Follow the exact layout in references/format.md (staged alongside this
   skill; read it with your file tools relative to this skill's directory).
```

`plugins/skills-example/pack/skills/haiku-mode/references/format.md`:

```markdown
# Haiku layout

- Three lines: 5 / 7 / 5 syllables.
- No title, no trailing commentary.
- Concrete imagery from the user's topic in at least one line.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && deno test -A server/plugin/skills.test.ts`
Expected: all PASS.

- [ ] **Step 5: Document in the agents README**

In `core/server/agents/README.md`, after the linked-memories section (README.md:713-731), add:

```markdown
## Skill packs (`trex.skills`)

A plugin can declare named packs of skills that get injected into OTHER
plugins' agents — the pack names its targets, so you deploy the agent first
and skills to it afterwards:

​```json
{
  "name": "@trex/ohdsi-skills",
  "trex": {
    "skills": [
      { "name": "ohdsi-cohorts", "dir": "pack", "agents": ["claw", "coder"] },
      { "name": "house-style",   "dir": "style", "agents": ["*"] }
    ]
  }
}
​```

Pack layout (directory-form skills only, so supporting files travel with the
skill; `connections/` is optional):

​```
pack/
  skills/
    cohort-building/
      SKILL.md            # frontmatter `description:` + body
      references/*.md     # supporting files, referenced by relative path
  connections/
    atlas.ts              # defineMcpClientConnection(...) — tools surface as
                          #   <pack>--atlas__<tool>
​```

Semantics:

- `agents` lists exact agent names, or `"*"` for every agent on the
  deployment (including agents from plugins installed later — a `"*"` pack
  changes other plugins' prompt surface by design; declare deliberately).
- Trusted scopes only (`@trex/`, `@ohdsi/`) — packs inject prompt content
  and MCP connections.
- Staged skills are namespaced `skills/<pack>--<skill>/` (`--` is reserved;
  don't use it in hand-authored skill names). `/eve/v1/info` reports the
  pack per skill in `skills.static[].pack`.
- A pack colliding with a hand-authored file fails the deployment loudly;
  the agent is left unchanged.
- Deploying a skills plugin after its target agent is running re-stages that
  agent's worker dir and swaps it in atomically; the next request runs with
  the new skills (sessions are DB-backed — nothing is lost). Removing the
  plugin takes effect at next boot.
- A pack targeting an agent that doesn't exist yet simply waits; it attaches
  when that agent appears.
​```
```

(Remove the zero-width characters before the inner code fences when pasting — they only keep this plan's own markdown valid.)

- [ ] **Step 6: Full verification**

Run: `cd core && deno test -A server/plugin/ server/agents/loader.test.ts`
Expected: all PASS.

Run: `cd core && deno check server/plugin/skills.ts server/plugin/skill-packs.ts server/plugin/agents.ts server/plugin/plugin.ts server/plugin/function.ts`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/skills-example core/server/agents/README.md core/server/plugin/skills.test.ts
git commit -m "feat(skills): example skills plugin and authoring docs"
```

---

## Post-plan verification (live stack, manual)

Not part of the automated tasks — the worker-serving half of the spec's integration test needs the edge runtime:

1. Boot the dev stack (`docker-compose.dev.yml` — see the dev-stack gotcha memory for first-boot blockers).
2. With the toy agent registered, `GET {basePath}/eve/v1/info` → `skills.static` contains `examplepack--haiku-mode` with `pack: "examplepack"`.
3. Deploy a second pack at runtime via `Plugins.registerFromPath` (devx path) targeting the running agent; re-fetch `/eve/v1/info` → new skill present without a server restart.
4. Chat with the agent and confirm the `skill` tool lists and loads the injected skill.
