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
import { ensureAppWorkspace, readProjectRules } from "../functions/tools/workspace.ts";
import { DEFAULT_AI_RULES } from "../functions/prompts.ts";

// Port of functions/tools/registry.ts's buildToolSet PLAN_MODE_TOOLS
// (registry.ts:197-205) — legacy names map 1:1 to the eve wrapper names
// ported in plugins/devx/agent/tools/ (batch A/B, task-v2-brief.md).
// NOTE: transcribed, not imported — the legacy const is unexported (declared
// inline inside buildToolSet), so keep this list in sync manually.
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
  // ToolDef shape, hence the cast. The built-in "agent" tool carries no
  // modifiesState field (it's a generic eve built-in, not a devx-authored
  // ToolDef) but legacy's own Agent tool IS modifiesState:true and gets
  // dropped in ask mode (spawn_agent.ts:33) — name-check it explicitly here
  // to close that asymmetry (documented in task-v4-report.md).
  if (mode === "ask" && (name === "agent" || (def as { modifiesState?: boolean } | undefined)?.modifiesState)) return false;

  if (mode === "plan" && !PLAN_MODE_TOOLS.has(name)) return false;

  // No mode / unknown mode: agent-framework default, allow.
  return true;
}

// Port of the dynamic parts of functions/prompts.ts's constructSystemPrompt
// that V1's static instructions.md extraction deferred (that file is
// LOCAL_AGENT_SYSTEM_PROMPT with the trailing `[[AI_RULES]]` placeholder
// removed — see prompts.ts:654-676). Legacy semantics reproduced exactly
// (functions/agent.ts:171-177 + prompts.ts's wrapAiRules, :982-987): a
// SINGLE winner is chosen — workspace project rules (TREX.md/AI_RULES.md,
// read ONLY when metadata carries an appId, legacy's gate) || the user's
// devx.settings.ai_rules || DEFAULT_AI_RULES — and stands in for
// [[AI_RULES]]. A user/project winner is wrapped in <user_defined_ai_rules>
// exactly as wrapAiRules wraps a non-default value; the DEFAULT_AI_RULES
// fallback goes in unwrapped, also per wrapAiRules. The one residual
// divergence is POSITION only: the winner is appended after base (the
// static instructions.md has no placeholder to substitute mid-prompt) —
// in the legacy LOCAL_AGENT_SYSTEM_PROMPT the [[AI_RULES]] slot was the
// final section anyway, so the appended position matches it.
async function buildInstructions(base: string, ctx: HookCtx): Promise<string> {
  const userId = ctx.userId;

  // User-level rules from devx.settings — same source functions/agent.ts:173
  // reads before the project-rules override. Falsy (null/empty) counts as
  // absent, matching legacy's `effectiveSettings.ai_rules || undefined`.
  let rules: string | undefined;
  if (userId) {
    const settingsResult = await ctx.sql(`SELECT ai_rules FROM devx.settings WHERE user_id = $1`, [userId]);
    rules = (settingsResult.rows[0] as { ai_rules?: string | null } | undefined)?.ai_rules || undefined;
  }

  // Project rules override user rules, but ONLY for app-scoped chats —
  // legacy gates the readProjectRules call on appId (functions/agent.ts:174).
  const { appId } = readMetadata(ctx.metadata);
  if (userId && appId) {
    const workspacePath = await ensureAppWorkspace(userId, appId);
    const projectRules = await readProjectRules(workspacePath);
    if (projectRules !== undefined) rules = projectRules;
  }

  // wrapAiRules replica: a real winner is wrapped, the default is not.
  const section = rules ? `<user_defined_ai_rules>\n${rules}\n</user_defined_ai_rules>` : DEFAULT_AI_RULES;
  return `${base}\n\n${section}`;
}

export default defineAgent({
  maxSteps: 25,
  resolveModel,
  filterTools,
  buildInstructions,
});
