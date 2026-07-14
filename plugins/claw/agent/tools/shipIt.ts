// plugins/claw/agent/tools/shipIt.ts
//
// Step-3 pre-read (core/server/agents/eve-shim/types.ts's ToolDef,
// core/server/agents/service/toolset.ts:98-131): the approval-gating field
// really is `needsApproval?: boolean` on ToolDef, exactly as the brief
// assumed — no rename needed. There is NO per-tool timeout override on
// ToolDef: `approvalTimeoutMs`/`approvalPollMs` live only on the whole-build
// `ToolBuildCtx` (toolset.ts:38-39), set once by the caller (session
// runner.ts / chat handler.ts) for the entire tool set, not per authored
// tool. So this file cannot widen the 5-minute default itself; doing so
// would require a ToolBuildCtx-level change at the runner/handler call site,
// which is out of scope here. Left as a follow-up note rather than invented.
import { defineTool } from "eve/tools";
import { runCodeTurn, type TokioClient } from "../lib/code-session.ts";
import { makeTokioClient } from "../lib/tokio.ts";
import { readOrchestration, upsertOrchestration, type QueryFn } from "../lib/state.ts";

interface Input { summary: string }

export async function shipCore(
  client: TokioClient,
  sql: QueryFn,
  ctx: { sessionId: string; userId?: string },
  _input: Input,
): Promise<{ reply: string }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  if (!prior?.codeSessionId) throw new Error("shipIt: no Code session to ship");
  const { replyText, nextCursor } = await runCodeTurn(client, {
    codeSessionId: prior.codeSessionId,
    message: "Commit the approved changes and push. Report the commit/PR result.",
    mode: "build",
    userId: ctx.userId,
    startCursor: prior.eventCursor,
  });
  await upsertOrchestration(sql, { ...prior, status: "done", eventCursor: nextCursor });
  return { reply: replyText };
}

export default defineTool({
  description: "Final ship gate: after human approval, tell the Code agent to commit and push the approved changes.",
  needsApproval: true,
  inputSchema: {
    type: "object",
    properties: { summary: { type: "string", description: "One-line description of what is being shipped." } },
    required: ["summary"],
  },
  execute: (input, ctx) => {
    const g = globalThis as any;
    if (!g.Trex?.req) throw new Error("shipIt: Trex.req unavailable");
    if (!ctx?.sql) throw new Error("shipIt: ctx.sql unavailable");
    return shipCore(makeTokioClient(g.Trex.req.bind(g.Trex)), ctx.sql, { sessionId: ctx.sessionId, userId: ctx.userId }, input as Input);
  },
});
