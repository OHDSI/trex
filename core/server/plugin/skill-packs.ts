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
