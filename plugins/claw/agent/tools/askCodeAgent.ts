// askCodeAgent — claw's single hand-off to the coding agent. It forwards a
// message to the SHARED Code agent session (opening one on first use) with the
// FULL toolset (no devx mode: see lib/code-session.ts for why) and returns the
// coder's reply verbatim. claw uses it to hand over clear instructions and to
// relay participants' clarified answers; the coder runs its own gated
// planning/implementation from there.
import { defineTool } from "eve/tools";
import { runCodeTurn, type TokioClient } from "../lib/code-session.ts";
import { makeTokioClient } from "../lib/tokio.ts";
import { readOrchestration, upsertOrchestration, type QueryFn } from "../lib/state.ts";

interface Input { message: string }

export async function askCore(
  client: TokioClient,
  sql: QueryFn,
  ctx: { sessionId: string; userId?: string },
  input: Input,
): Promise<{ reply: string }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  const { codeSessionId, replyText, nextCursor } = await runCodeTurn(client, {
    codeSessionId: prior?.codeSessionId ?? null,
    message: input.message,
    userId: ctx.userId,
    startCursor: prior?.eventCursor ?? 0,
  });
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId,
    eventCursor: nextCursor,
  });
  return { reply: replyText };
}

export default defineTool({
  description:
    "Send a message to the shared coding-agent session and return its reply verbatim. " +
    "Use this to hand the coding agent CLEAR, unambiguous instructions once the ask is " +
    "understood, and to relay the participants' clarified answers to the coding agent's " +
    "own questions. The coding agent runs its full planning + implementation process " +
    "(with its own skills and gates); it continues the SAME session across calls.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The clear instruction, answer, or message for the coding agent.",
      },
    },
    required: ["message"],
  },
  execute: (input, ctx) => {
    const g = globalThis as any;
    if (!g.Trex?.req) throw new Error("askCodeAgent: Trex.req unavailable (not a user worker)");
    if (!ctx?.sql) throw new Error("askCodeAgent: ctx.sql unavailable");
    const client = makeTokioClient(g.Trex.req.bind(g.Trex));
    return askCore(client, ctx.sql, { sessionId: ctx.sessionId, userId: ctx.userId }, input as Input);
  },
});
