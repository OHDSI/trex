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
import { assertProviderConfigEncryptionMigrated, readProviderKey } from "../functions/provider_key.ts";
import { classifyCoderError } from "../functions/error_codes.ts";
import { buildCoderContext, DEFAULT_MAX_STEPS } from "../functions/coder_context.ts";

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
  api_key_encrypted?: string | null;
  api_key_iv?: string | null;
  base_url: string | null;
}

// Port of functions/index.ts:290-333 (settings assembly) + functions/agent.ts's
// createModel (:41-119), minus the Bedrock JSON-credential unpacking and the
// OpenAI-compatible client construction itself — those become core's job
// (model.ts's resolveModelSpec/buildModel) once we hand back a ModelSpec.
async function resolveModel(ctx: HookCtx): Promise<ModelSpec> {
  if (!ctx.userId) {
    throw new Error("devx agent requires an authenticated user");
  }
  const userId = ctx.userId;

  // Probe before selecting the encrypted columns — see provider_key.ts's
  // assertProviderConfigEncryptionMigrated header comment.
  await assertProviderConfigEncryptionMigrated(ctx.sql);
  const activeProviderResult = await ctx.sql(
    `SELECT pc.provider, pc.model, pc.api_key, pc.api_key_encrypted, pc.api_key_iv, pc.base_url
     FROM devx.provider_configs pc
     WHERE pc.user_id = $1 AND pc.is_active = true
     LIMIT 1`,
    [userId],
  );
  let row = activeProviderResult.rows[0] as ProviderRow | undefined;

  // Fall back to the legacy devx.settings row (backward compat) when the
  // user has no active provider_configs row — functions/index.ts:305-333.
  // devx.settings was never migrated to encrypted storage, so it carries no
  // api_key_encrypted/api_key_iv — readProviderKey below treats that as an
  // ordinary plaintext row, same as it always has.
  if (!row) {
    const legacyResult = await ctx.sql(
      `SELECT provider, model, api_key, base_url FROM devx.settings WHERE user_id = $1`,
      [userId],
    );
    row = legacyResult.rows[0] as ProviderRow | undefined;
  }

  // No silent model fallback: the former hardcoded anthropic/claude-sonnet
  // default resolved against the worker env's ANTHROPIC_API_KEY, silently
  // running unconfigured users on the operator's account.
  if (!row) {
    throw new Error("devx: no model provider configured — set up a provider in devx Settings");
  }

  // Resolve through the encryption helper before ANY use of the key below —
  // never let row.api_key (NULL once a row is encrypted) reach ModelSpec.apiKey
  // as undefined, which core's buildModel (model.ts:55/60/71) silently
  // backfills from the operator's own ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_
  // API_KEY / OPENAI_API_KEY env var — cross-tenant credential substitution on
  // any deployment where those vars happen to be set. A decrypt failure must
  // fail this turn the same way every other throw in this function does
  // (module header: "propagates and fails the turn"), never continue with an
  // absent key. classifyCoderError mirrors the wording index.ts's read sites
  // use, so the failure reads the same regardless of which loop produced it.
  let resolvedApiKey: string | null;
  try {
    resolvedApiKey = await readProviderKey(row);
  } catch (err) {
    // classifyCoderError's `safe` string is generic for the UI — log the
    // actual cause (e.g. a rotated DEVX_ENCRYPTION_KEY) so it's diagnosable
    // from the server log, not just a misleading UI message.
    console.error("[devx] provider key read failed for agents-loop turn:", err instanceof Error ? err.message : err);
    const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
    throw new Error(classified.safe);
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

  // Bedrock credentials are packed as JSON in api_key (functions/agent.ts's
  // createModel, :56-75's "Credentials are packed as JSON in api_key"
  // branch) — unlike anthropic/google/openai, where api_key is used
  // verbatim, a bedrock row's api_key must be unpacked to tell a bearer
  // token apart from IAM access-key/secret-key credentials before it can be
  // handed to core's ModelSpec.apiKey (which core's resolveModelSpec/
  // bedrockModel treats as a bearer token ONLY — see eve-shim/types.ts's
  // ModelSpec doc comment). IAM creds have NO equivalent on this loop: core
  // never implemented the SigV4 accessKeyId/secretAccessKey path, only the
  // bearer-token custom-fetch one legacy's own createModel used for bearer
  // auth (see COMPAT.md's ToolContext.sql divergence entry, which also notes
  // this bedrock=bearer-only gap). Silently dropping IAM creds would swap in
  // whatever AWS_BEARER_TOKEN_BEDROCK happens to be set (or nothing at all,
  // producing a confusing downstream auth failure) — throw a clear,
  // actionable error instead; useEffectiveLoop.ts routes IAM-shaped bedrock
  // users to the legacy loop before this hook is ever reached, so reaching
  // this throw in production means that client-side gate was bypassed or is
  // out of sync, and failing loud here is strictly better than a silent
  // wrong-credential turn (same "a thrown resolveModel fails the turn"
  // posture as every other error path in this file).
  let apiKey: string | undefined = resolvedApiKey ?? undefined;
  if (provider === "bedrock" && resolvedApiKey) {
    let parsed: unknown;
    let parseable = true;
    try {
      parsed = JSON.parse(resolvedApiKey);
    } catch {
      // Not JSON — legacy's own createModel silently falls through to the
      // AWS_BEARER_TOKEN_BEDROCK env var in this case (its catch{} is
      // empty); core's bedrockModel does the same env fallback when
      // ModelSpec.apiKey is undefined, so drop the unparseable value
      // rather than forwarding it as a bogus apiKey.
      parseable = false;
    }
    if (!parseable || typeof parsed !== "object" || parsed === null) {
      // Unparseable, or a valid-JSON scalar ("null", numbers, bare
      // strings): no recognizable credential structure — treat as absent
      // (env fallback). The property access below is guarded by the
      // object/null check so a stored "null" can't TypeError here
      // (merge-gate re-review ride-along a).
      apiKey = undefined;
    } else {
      const creds = parsed as { bearerToken?: unknown; accessKeyId?: unknown; secretAccessKey?: unknown };
      if (creds.bearerToken && typeof creds.bearerToken === "string") {
        apiKey = creds.bearerToken;
      } else if (creds.accessKeyId || creds.secretAccessKey) {
        throw new Error(
          "bedrock IAM credentials are not supported on the agents loop yet — use bearer token or the legacy loop",
        );
      } else {
        // Valid JSON object but NEITHER shape (e.g. {"bearerToken": ""} or
        // unrelated keys): never forward the raw JSON blob as a bearer
        // token — treat as absent, same env fallback as above.
        apiKey = undefined;
      }
    }
  }

  return {
    provider,
    modelId: row.model,
    apiKey,
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

// This loop's own contribution is ONLY the ai_rules winner-selection below —
// legacy semantics reproduced exactly (functions/agent.ts:171-177 +
// prompts.ts's wrapAiRules, :982-987): a SINGLE winner is chosen — workspace
// project rules (TREX.md/AI_RULES.md, read ONLY when metadata carries an
// appId, legacy's gate) || the user's devx.settings.ai_rules ||
// DEFAULT_AI_RULES. The surrounding prompt is no longer hand-assembled here:
// the resolved winner is handed to functions/coder_context.ts's
// buildCoderContext (the same builder the ai-sdk/Claude Agent SDK/Copilot
// engines use), which interpolates it via prompts.ts's own wrapAiRules — the
// exact "wrap a real winner in <user_defined_ai_rules>, leave the
// DEFAULT_AI_RULES fallback unwrapped" logic this function used to replicate
// by hand. Passing the RAW resolved winner (not pre-wrapped) is deliberate:
// wrapAiRules already does the wrapping, so wrapping here first would
// double-wrap a real winner. Verified empirically (task-1-report.md) by
// diffing the assembled ai_rules section before/after this change for all
// three precedence cases — identical wrapped/unwrapped treatment in both.
//
// `base` (instructions + agent.skills listing + <context> metadata, built by
// toolset.ts's buildSystemPrompt) is accepted for hook-signature
// compatibility but is NO LONGER the prompt's spine — buildCoderContext
// supplies its own base (prompts.ts's LOCAL_AGENT_SYSTEM_PROMPT via
// mode:"agent"). The static agent/instructions.md file this used to extend
// is intentionally left in place; see task-1-report.md for what it still
// contains that the shared prompt does not.
//
// askToolAvailable: false — this loop registers no mcp__ask__ask_question
// tool. eve's ask_question is unimplemented on this runtime altogether (see
// core/server/agents/COMPAT.md's "HITL is approval-only" note); the only
// question-asking tool here is the differently-named, legacy-ported
// AskUserQuestion (tools/AskUserQuestion.ts, a thin wrapper over
// planningQuestionnaireTool), which is NOT what buildAskQuestionRule's
// <asking-questions> block instructs the model to call. Passing `true` here
// would tell the model to MUST call a tool that does not exist.
//
// remoteChannel: false — this loop is the browser workbench (the "ui"
// coder profile), never a chat channel.
//
// settings.max_steps: undefined — this loop's step budget is set once at
// definition time (defineAgent's maxSteps below), not per turn; see Task 2.
export async function buildInstructions(base: string, ctx: HookCtx): Promise<string> {
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

  const { systemPrompt } = await buildCoderContext({
    mode: "agent",
    aiRules: rules,
    remoteChannel: false,
    askToolAvailable: false,
    settings: { max_steps: undefined },
  });
  return systemPrompt;
}

export default defineAgent({
  // Definition-time, not per-turn: eve's AgentConfig.maxSteps (eve-shim/
  // types.ts) is read once here and consumed at runner.ts:118 as
  // `agent.config.maxSteps ?? 25` when the agent is defined, not per turn.
  // There is no runtime hook that can override it, so the per-user
  // settings.max_steps and the channel profile's maxStepsFloor (both
  // applied inside buildCoderContext for the other three engines) CANNOT
  // reach this loop — buildInstructions above deliberately passes
  // `settings: { max_steps: undefined }` because there is nowhere for a
  // resolved value to go. Reaching per-turn control here would require the
  // agents runner (runner.ts) to accept a maxSteps override from a hook
  // result (e.g. buildInstructions or a new hook) instead of only reading
  // the static config value — out of scope for this change. Using the
  // shared DEFAULT_MAX_STEPS at least keeps this single hardcoded number in
  // sync with the other engines' fallback instead of drifting silently.
  maxSteps: DEFAULT_MAX_STEPS,
  resolveModel,
  filterTools,
  buildInstructions,
});
