// V3 (task-v3-brief.md): resolveModel/filterTools/buildInstructions hooks —
// see core/server/agents/README.md's "Runtime hooks" section for the
// contract each is called under (per-request, never cached at agent-load
// time; a thrown resolveModel/buildInstructions propagates and fails the
// turn rather than silently falling back to env credentials or the static
// instructions.md).
import { defineAgent } from "eve";
import type { HookCtx, ModelSpec } from "eve";
// Type-only import: ToolDef isn't part of eve's public re-export surface
// (see eve-shim/mod.ts) — this is erased at build/runtime, same posture as
// lib/context.ts's own core-relative type-only imports (see that file's
// header comment for why this doesn't create a real dependency on core).
import type { ToolDef } from "../../../core/server/agents/eve-shim/types.ts";
import { readMetadata } from "./lib/context.ts";
import { ensureAppWorkspace, ensureWorkspace, readProjectRules } from "../functions/tools/workspace.ts";

// Port of functions/tools/registry.ts's buildToolSet PLAN_MODE_TOOLS
// (registry.ts:197-205) — legacy names map 1:1 to the eve wrapper names
// ported in plugins/devx/agent/tools/ (batch A/B, task-v2-brief.md).
const PLAN_MODE_TOOLS = new Set([
  "Read", "Glob", "Grep", "CodeSearch",
  "GitStatus", "GitLog", "GitBranchList",
  "AskUserQuestion", "WritePlan", "ExitPlanMode",
  "KBListRepos", "KBInit", "KBUpdate", "KBRead", "KBSearch",
  "KBListFiles", "KBOverview", "KBFindSymbols",
  "TaskGet", "TaskList",
  "CronList", "ToolSearch",
]);

interface ProviderRow {
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
}

// functions/index.ts:322-332's hardcoded legacy default, used when a user
// has neither a devx.provider_configs row nor a devx.settings row at all.
const DEFAULT_PROVIDER_ROW: ProviderRow = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  api_key: null,
  base_url: null,
};

// Port of functions/index.ts:290-333 (settings assembly) + functions/agent.ts's
// createModel (:41-119), minus the Bedrock JSON-credential unpacking and the
// OpenAI-compatible client construction itself — those become core's job
// (model.ts's resolveModelSpec/buildModel) once we hand back a ModelSpec.
async function resolveModel(ctx: HookCtx): Promise<ModelSpec> {
  if (!ctx.userId) {
    throw new Error("devx agent requires an authenticated user");
  }
  const userId = ctx.userId;

  const activeProviderResult = await ctx.sql(
    `SELECT pc.provider, pc.model, pc.api_key, pc.base_url
     FROM devx.provider_configs pc
     WHERE pc.user_id = $1 AND pc.is_active = true
     LIMIT 1`,
    [userId],
  );
  let row = activeProviderResult.rows[0] as ProviderRow | undefined;

  // Fall back to the legacy devx.settings row (backward compat) when the
  // user has no active provider_configs row — functions/index.ts:305-333.
  if (!row) {
    const legacyResult = await ctx.sql(
      `SELECT provider, model, api_key, base_url FROM devx.settings WHERE user_id = $1`,
      [userId],
    );
    row = (legacyResult.rows[0] as ProviderRow | undefined) ?? DEFAULT_PROVIDER_ROW;
  }

  // The UI routes these to the legacy /stream endpoint (claude_code_agent.ts /
  // copilot_agent.ts) — the eve/agents runtime has no sidecar-process
  // equivalent (V4 concern per the brief).
  if (row.provider === "claude-code" || row.provider === "copilot") {
    throw new Error("sidecar providers use the legacy endpoint");
  }

  // anthropic/google/bedrock map straight onto ModelSpec.provider; any other
  // provider name (including self-hosted/OpenAI-compatible endpoints) is the
  // OpenAI-compatible fallback branch createModel used for everything it
  // didn't special-case (functions/agent.ts:113-118).
  const provider: ModelSpec["provider"] =
    row.provider === "anthropic" || row.provider === "google" || row.provider === "bedrock" ? row.provider : "openai";

  // For bedrock, row.api_key may be null/absent (no key configured) — we
  // deliberately do NOT parse it as packed JSON credentials or fall back to
  // AWS_BEARER_TOKEN_BEDROCK here (functions/agent.ts:56-75's job); core's
  // resolveModelSpec/bedrockModel (model.ts) already does the env-based
  // bearer-token fallback when ModelSpec.apiKey is undefined.
  return {
    provider,
    modelId: row.model,
    apiKey: row.api_key ?? undefined,
    baseURL: row.base_url ?? undefined,
  };
}

// ctx.metadata is untrusted client input (same posture as lib/context.ts's
// readMetadata) — read directly here rather than through readMetadata,
// because that helper defaults an unset/invalid mode to "build" (right for
// workspace routing, which always needs SOME concrete choice) whereas this
// hook's contract requires "no mode / unknown mode" to mean "allow
// everything", not "treat it as build".
function readMode(metadata: unknown): "ask" | "plan" | "build" | undefined {
  const mode = (metadata as { mode?: unknown } | null | undefined)?.mode;
  return mode === "ask" || mode === "plan" || mode === "build" ? mode : undefined;
}

// Port of functions/tools/registry.ts's buildToolSet mode-filtering
// (registry.ts:180-221). The legacy "never" consent branch (registry.ts:190)
// is intentionally NOT ported — core's sticky always/never consent store
// (toolset.ts's authoredTool, keyed on userId/plugin/agentName/tool) now
// owns that decision.
function filterTools(name: string, def: ToolDef, ctx: HookCtx): boolean {
  const mode = readMode(ctx.metadata);

  // Build mode doesn't use tools in the legacy AI-SDK loop (raw streaming) —
  // registry.ts:208-209 drops EVERY tool, including (here) the eve built-in
  // skill/agent tools, which filterTools sees in the same merged set.
  if (mode === "build") return false;

  // Ask mode drops state-mutating tools — modifiesState is a devx-only
  // passthrough field carried by lib/context.ts's wrap(), not part of eve's
  // ToolDef shape, hence the cast.
  if (mode === "ask" && (def as { modifiesState?: boolean } | undefined)?.modifiesState) return false;

  if (mode === "plan" && !PLAN_MODE_TOOLS.has(name)) return false;

  // No mode / unknown mode: agent-framework default, allow.
  return true;
}

// Port of the dynamic parts of functions/prompts.ts's constructSystemPrompt
// that V1's static instructions.md extraction deferred (that file is
// LOCAL_AGENT_SYSTEM_PROMPT with the trailing `[[AI_RULES]]` placeholder
// removed — see prompts.ts:654-676). Base stays first; legacy substitutes
// the resolved AI_RULES string at the position the placeholder occupied,
// i.e. the END of the prompt, so both appended sections below go after base.
async function buildInstructions(base: string, ctx: HookCtx): Promise<string> {
  let instructions = base;
  const userId = ctx.userId;
  if (!userId) return instructions;

  // AI_RULES (devx.settings), same source functions/agent.ts:173 reads
  // before the project-rules override. Wrapped the same way legacy's
  // wrapAiRules does for a non-default value (prompts.ts:982-987).
  const settingsResult = await ctx.sql(`SELECT ai_rules FROM devx.settings WHERE user_id = $1`, [userId]);
  const aiRules = (settingsResult.rows[0] as { ai_rules?: string | null } | undefined)?.ai_rules;
  if (aiRules) {
    instructions += `\n\n<user_defined_ai_rules>\n${aiRules}\n</user_defined_ai_rules>`;
  }

  // Workspace project rules (TREX.md / legacy AI_RULES.md — workspace.ts's
  // readProjectRules). Legacy (functions/agent.ts:171-177) treats this as an
  // OVERRIDE: when appId is set and a rules file exists, it REPLACES
  // effectiveSettings.ai_rules outright rather than appending. We diverge
  // and append both instead of silently dropping a user's devx.settings
  // AI_RULES whenever their app happens to also carry a TREX.md — appending
  // project rules LAST (closest to the position `[[AI_RULES]]` occupied in
  // the legacy template) mirrors legacy's "project rules win" precedence
  // without discarding the settings-level rules.
  const { appId } = readMetadata(ctx.metadata);
  const workspacePath = appId ? await ensureAppWorkspace(userId, appId) : await ensureWorkspace(userId);
  const projectRules = await readProjectRules(workspacePath);
  if (projectRules !== undefined) {
    instructions += `\n\n<project_rules>\n${projectRules}\n</project_rules>`;
  }

  return instructions;
}

export default defineAgent({
  maxSteps: 25,
  resolveModel,
  filterTools,
  buildInstructions,
});
