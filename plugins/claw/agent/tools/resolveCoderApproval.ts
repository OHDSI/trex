// resolveCoderApproval — relay the channel's Approve/Deny back to the PARKED
// coder turn, then collect the rest of that turn.
//
// askCodeAgent posts the gate (lib/coder-approval.ts) when the coder's stream
// yields `input.requested`; the pick resumes claw with "The team selected:
// approve <requestId>", and this tool carries that decision to the coder over
// POST /eve/v1/session/:id/approval and RE-ATTACHES to the same turn at the
// stored cursor. Re-attaching is the whole point: sending the coder a new
// message would start a second turn on top of the parked one.
//
// No eval stub (same as awaitApproval): the eval harness stubs askCodeAgent, so
// no coder turn ever parks there and this is never reached.
import { defineTool } from "eve/tools";
import { reattachCodeTurn, resolveCodeApproval, type TokioClient } from "../lib/code-session.ts";
import { tokioClientFromGlobal } from "../lib/tokio.ts";
import { parkedReply, postApprovalGates } from "../lib/coder-approval.ts";
import { readOrchestration, upsertOrchestration, type QueryFn } from "../lib/state.ts";
import { parseTrailer, type HandoffTrailer } from "../lib/handoff-trailer.ts";
import { effectiveUserId } from "./askCodeAgent.ts";

interface Input {
  requestId: string;
  decision: "approve" | "deny";
}

export interface ResolveDeps {
  resolve?: typeof resolveCodeApproval;
  reattach?: typeof reattachCodeTurn;
  postGates?: typeof postApprovalGates;
  botToken?: string;
}

export interface ResolveResult {
  resolved: boolean;
  parked?: boolean;
  reply?: string;
  trailer?: HandoffTrailer | null;
  error?: string;
}

export async function resolveCore(
  sql: QueryFn,
  client: TokioClient,
  ctx: { sessionId: string; userId: string; channelId?: string },
  input: Input,
  deps: ResolveDeps = {},
): Promise<ResolveResult> {
  const resolve = deps.resolve ?? resolveCodeApproval;
  const reattach = deps.reattach ?? reattachCodeTurn;
  const postGates = deps.postGates ?? postApprovalGates;

  const prior = await readOrchestration(sql, ctx.sessionId);
  const codeSessionId = prior?.codeSessionId;
  if (!codeSessionId) {
    return { resolved: false, error: "no coder session on this thread — nothing is waiting for approval" };
  }

  const outcome = await resolve(client, {
    codeSessionId,
    requestId: input.requestId,
    decision: input.decision,
    userId: ctx.userId,
  });
  // An expired or already-decided request is a normal outcome, not a crash:
  // report it so claw can tell the channel instead of re-asking the coder.
  if (!outcome.resolved) return { resolved: false, error: outcome.error ?? "approval was not resolved" };

  const startCursor = prior.eventCursor;
  const turn = await reattach(client, { codeSessionId, startCursor, userId: ctx.userId });
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId,
    eventCursor: turn.nextCursor,
    appId: prior.appId,
  });

  if (turn.reason === "input-requested") {
    // A pending set that still names the request just resolved means the
    // decision did not take effect — report it rather than re-posting the same
    // gate and looping on it.
    const fresh = turn.pending.filter((p) => p.requestId !== input.requestId);
    const posted = await postGates(fetch, {
      botToken: deps.botToken ?? Deno.env.get("DISCORD_BOT_TOKEN"),
      channelId: ctx.channelId,
      pending: fresh,
    });
    return { resolved: true, parked: true, reply: parkedReply(fresh.length ? fresh : turn.pending, posted) };
  }

  const { trailer, body } = parseTrailer(turn.replyText);
  return { resolved: true, parked: false, reply: body, trailer };
}

export default defineTool({
  description:
    "Relay the channel's Approve/Deny decision to the coding agent's PAUSED turn and return " +
    "what it did next. Call this — and only this — right after you are resumed with " +
    "\"The team selected: approve <requestId>\" (or deny), passing that exact requestId and " +
    "decision. NEVER answer a paused coder with askCodeAgent: that starts a second turn on top " +
    "of the paused one. If the reply says the coder is paused again, relay the new gate and " +
    "wait for the next decision.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "The approval request id, exactly as it appeared in the selection you were resumed with.",
      },
      decision: {
        type: "string",
        enum: ["approve", "deny"],
        description: "What the team picked.",
      },
    },
    required: ["requestId", "decision"],
  },
  execute: (input, ctx) => {
    if (!ctx?.sql) throw new Error("resolveCoderApproval: ctx.sql unavailable");
    const userId = effectiveUserId(ctx.userId, (k) => Deno.env.get(k));
    if (!userId) throw new Error("resolveCoderApproval: no user id (set CLAW_CODE_USER_ID)");
    const client = tokioClientFromGlobal();
    if (!client) throw new Error("resolveCoderApproval: Trex.req unavailable");
    const channelId = (ctx.metadata as { channelId?: string } | undefined)?.channelId;
    return resolveCore(ctx.sql, client, { sessionId: ctx.sessionId, userId, channelId }, input as Input);
  },
});
