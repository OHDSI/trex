// plugins/claw/agent/tools/dispatchToCode.ts
import { defineTool } from "eve/tools";
import { runCodeTurn, type TokioClient } from "../lib/code-session.ts";
import { makeTokioClient } from "../lib/tokio.ts";
import { readOrchestration, upsertOrchestration, type QueryFn, type Status } from "../lib/state.ts";

interface Input { mode: "plan" | "build"; message: string }

export async function dispatchCore(
  client: TokioClient,
  sql: QueryFn,
  ctx: { sessionId: string; userId?: string },
  input: Input,
): Promise<{ reply: string }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  const { codeSessionId, replyText, nextCursor } = await runCodeTurn(client, {
    codeSessionId: prior?.codeSessionId ?? null,
    message: input.message,
    mode: input.mode,
    userId: ctx.userId,
    startCursor: prior?.eventCursor ?? 0,
  });
  const status: Status = input.mode === "plan" ? "awaiting_plan_approval" : "implementing";
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId,
    plan: input.mode === "plan" ? replyText : (prior?.plan ?? null),
    status,
    eventCursor: nextCursor,
  });
  return { reply: replyText };
}

export default defineTool({
  description:
    "Delegate to the Code agent. mode='plan' asks it to produce an implementation plan; " +
    "mode='build' tells it to implement the approved plan, run all checks, and apply autofixes. " +
    "Returns the Code agent's reply text.",
  inputSchema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["plan", "build"] },
      message: { type: "string", description: "Task or instruction for the Code agent." },
    },
    required: ["mode", "message"],
  },
  execute: (input, ctx) => {
    const g = globalThis as any;
    if (!g.Trex?.req) throw new Error("dispatchToCode: Trex.req unavailable (not a user worker)");
    if (!ctx?.sql) throw new Error("dispatchToCode: ctx.sql unavailable");
    const client = makeTokioClient(g.Trex.req.bind(g.Trex));
    return dispatchCore(client, ctx.sql, { sessionId: ctx.sessionId, userId: ctx.userId }, input as Input);
  },
});
