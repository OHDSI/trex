// The `skills` plugin type (design: plugins/skills-example/docs/
// 2026-07-19-skills-plugin-type-design.md): a plugin declares named packs of
// agent skills (markdown + supporting files, optionally MCP connections),
// and the PACK names its target agents — inverted relative to memory links
// (agent-memory.ts), so a pack can be deployed after its target agent is
// already installed and running. This module is the pack model + staging;
// dispatch-time orchestration (trust gate, dynamic re-stage) lives in
// skills.ts, kept separate so agents.ts can import THIS module without an
// import cycle (skills.ts imports agents.ts).
import { copyDirRecursive, scanPluginDirectory, splitPathList } from "./utils.ts";
import { isTrustedPluginScope } from "./function.ts";

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
