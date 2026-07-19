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
  // Phase 1: build and validate EVERY declared pack before registering any.
  // Registering pack 1 and then throwing on pack 2's validation would leave
  // pack 1 registered-but-never-staged: registerSkillPack returns false on a
  // later retry with the identical decl, so a targeted agent never picks it
  // up until the process restarts.
  const packs: SkillPackEntry[] = normalizeSkillsValue(value).map((decl) => ({
    ...decl,
    srcDir: `${dir}/${decl.dir}`,
    pluginName: name,
  }));
  for (const pack of packs) {
    await validateSkillPackDir(pack);
  }
  // Phase 2: every pack validated — now register.
  const fresh: SkillPackEntry[] = [];
  for (const pack of packs) {
    if (registerSkillPack(pack)) fresh.push(pack);
    console.log(`skills: pack "${pack.name}" (${name}) declared for agents: ${pack.agents.join(", ")}`);
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
