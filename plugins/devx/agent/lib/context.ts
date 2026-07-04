// Adapter: eve's per-request ToolContext -> the legacy devx AgentContext
// (plugins/devx/functions/tools/types.ts) that the ~76 pre-existing devx
// tools are written against. Ported tools keep their original signature
// (execute(args, devxCtx)) unmodified; wrap() below is the one place a
// ported tools/<name>.ts file has to touch to become an eve-authored tool.
//
// Field-by-field mapping (task-v1-brief.md):
//  - userId:        ONLY from ToolContext.userId (the x-user-id-authenticated
//                    caller — see core/server/agents/README.md's
//                    "ToolContext.userId" section). NEVER from metadata,
//                    which is client-supplied and untrusted.
//  - workspacePath:  ensureWorkspace/ensureAppWorkspace, reused as-is from
//                    ../../functions/tools/workspace.ts (relative import —
//                    same worker substrate/filesystem, not copied).
//  - send:           routed through evectx.emit (H3), defaulting the event
//                    name to "devx" when the payload carries none.
//  - sql:            the query fn threaded onto ToolContext via
//                    core's hookCtx.sql -> ToolContext.sql (see the sibling
//                    core-side commit "feat(agents): expose hookCtx.sql on
//                    ToolContext" — authoredTool in toolset.ts).
//  - requireConsent: stubbed to always-approve. Consent is now enforced
//                    BEFORE execute() ever runs, via the tool's own
//                    needsApproval (mapped from defaultConsent === "ask" in
//                    wrap() below) plus H4 sticky always/never decisions.
//                    This field only exists so ported tools that still call
//                    ctx.requireConsent(...) inline keep compiling/running.
import { defineTool } from "eve/tools";
// Type-only imports: erased at build/runtime, so importing straight from
// core's agents module here does not create a real runtime dependency
// (agent directories must stay portable to real eve — see eve-shim/types.ts's
// header comment). The runtime-visible surface is only "eve"/"eve/tools",
// same as every other agent-authored file.
import type { QueryFn, ToolContext, ToolDef } from "../../../../core/server/agents/eve-shim/types.ts";
import { ensureAppWorkspace, ensureWorkspace } from "../../functions/tools/workspace.ts";
import type { AgentContext as DevxAgentContext, ConsentLevel } from "../../functions/tools/types.ts";

export type { DevxAgentContext };

// Client-advisory metadata contract from the (future) devx-agent UI. All
// three fields are untrusted client input — never used for authorization,
// only to pick a workspace path / label events. `mode` selection (which
// system-prompt variant to build) is wired via V3's buildInstructions hook,
// not read here.
export interface DevxMetadata {
  mode: "ask" | "plan" | "build";
  chatId: string;
  appId?: string;
}

// Exported for agent.ts's buildInstructions hook (V3), which needs the same
// chatId/appId extraction to derive a workspacePath — reused as-is rather
// than duplicated. NOTE: filterTools (agent.ts) does NOT reuse this for its
// own mode reading — this function's "unset -> build" default is right for
// workspace routing (some concrete mode must be picked) but wrong for
// filterTools's "no mode -> allow everything" contract, so that hook reads
// ctx.metadata.mode directly instead. See agent.ts's own readMode.
export function readMetadata(metadata: unknown): DevxMetadata {
  const m = (metadata ?? {}) as Partial<DevxMetadata>;
  return {
    mode: m.mode === "ask" || m.mode === "plan" ? m.mode : "build",
    chatId: typeof m.chatId === "string" ? m.chatId : "",
    appId: typeof m.appId === "string" ? m.appId : undefined,
  };
}

// Adapts eve's ToolContext (+ the worker's sql query fn) into the legacy
// devx AgentContext shape. `evectx.sql` is required here — a ported tool
// that needs it will fail loudly (a clear error, not a silent undefined
// call) if the caller never wired a hookCtx.sql through, same posture as
// the rest of the H1/H2 hooks (see core/server/agents/README.md).
export async function toDevxCtx(evectx: ToolContext & { sql: QueryFn }): Promise<DevxAgentContext> {
  if (!evectx.sql) {
    throw new Error("devx agent adapter: ToolContext.sql is required but was not provided — is hookCtx.sql wired?");
  }
  const { chatId, appId } = readMetadata(evectx.metadata);
  const userId = evectx.userId ?? "";
  const workspacePath = appId ? await ensureAppWorkspace(userId, appId) : await ensureWorkspace(userId);
  return {
    chatId,
    userId,
    appId: appId ?? null,
    workspacePath,
    send: (data: unknown) => {
      const type = (data as { type?: string } | null | undefined)?.type ?? "devx";
      evectx.emit?.(type, data);
    },
    sql: evectx.sql,
    requireConsent: () => Promise.resolve(true),
  };
}

// Legacy tool definition shape (plugins/devx/functions/tools/types.ts's
// ToolDefinition), minus `name` (eve derives the tool name from the
// tools/<name>.ts filename) and `parameters`/`getConsentPreview` (V2 maps
// ToolDefinition.parameters onto this `schema` field at the call site; a
// getConsentPreview has no eve-side equivalent now that approval prompts
// are driven by needsApproval, not a custom preview string).
export interface LegacyToolDef<T = unknown> {
  description: string;
  schema: unknown; // JSON Schema or zod — forwarded to defineTool's inputSchema verbatim
  execute: (args: T, ctx: DevxAgentContext) => Promise<string>;
  modifiesState?: boolean;
  defaultConsent?: ConsentLevel;
}

// Wraps one legacy devx tool definition as an eve-authored ToolDef.
// `modifiesState` is carried through as a passthrough field for V3's
// filterTools to read (e.g. dropping state-mutating tools in ask/plan
// mode) — not part of eve's ToolDef shape, but defineTool/Object.assign
// (eve-shim/tools.ts) doesn't strip unknown fields, so it survives onto
// the branded result.
export function wrap<T = unknown>(def: LegacyToolDef<T>): ToolDef & { modifiesState?: boolean } {
  const toolDef: ToolDef & { modifiesState?: boolean } = {
    description: def.description,
    inputSchema: def.schema,
    needsApproval: def.defaultConsent === "ask",
    modifiesState: def.modifiesState,
    execute: async (input: unknown, ctx?: ToolContext) => {
      const devxCtx = await toDevxCtx((ctx ?? { sessionId: "" }) as ToolContext & { sql: QueryFn });
      return await def.execute(input as T, devxCtx);
    },
  };
  return defineTool(toolDef) as ToolDef & { modifiesState?: boolean };
}
