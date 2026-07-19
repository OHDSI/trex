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
