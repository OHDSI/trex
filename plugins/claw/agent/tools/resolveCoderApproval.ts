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
import { attachCodeStream, resolveCodeApproval, type TokioClient } from "../lib/code-session.ts";
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
  attach?: typeof attachCodeStream;
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

// A second pick on the same gate (Discord clears the select on the first one,
// adapters/discord.ts's selectionOutcomeResponse, but a racing double-click
// still lands twice) 404s as "already-decided". That is the decision having
// WORKED, so it must not read to the channel as a failure.
function describeRefusal(error: string | undefined): string {
  const detail = error ?? "approval was not resolved";
  return detail.includes("already-decided")
    ? `That decision was already recorded — the coder has it, nothing more to do (${detail})`
    : detail;
}

export async function resolveCore(
  sql: QueryFn,
  client: TokioClient,
  ctx: { sessionId: string; userId: string; channelId?: string },
  input: Input,
  deps: ResolveDeps = {},
): Promise<ResolveResult> {
  const resolve = deps.resolve ?? resolveCodeApproval;
  const attach = deps.attach ?? attachCodeStream;
  const postGates = deps.postGates ?? postApprovalGates;

  const prior = await readOrchestration(sql, ctx.sessionId);
  const codeSessionId = prior?.codeSessionId;
  if (!codeSessionId) {
    return { resolved: false, error: "no coder session on this thread — nothing is waiting for approval" };
  }

  // SUBSCRIBE FIRST, decide second. The coder's approval poll wakes within
  // ~500ms of the decision landing (toolset.ts:213) and publishes the rest of
  // the turn immediately. Most of that is persisted and would still replay, but
  // the events that end the read need not be: if the coder parks again, the
  // next gate's input.requested is live-only (events.ts:80-88), so a stream
  // opened after it was published replays to the end of the persisted steps and
  // then blocks until the 90-minute turn timeout — with no gate in the thread.
  // handler.ts's stream route subscribes to the live tail BEFORE it replays
  // (handler.ts:1678-1723), so an attach that has RETURNED cannot miss them.
  const startCursor = prior.eventCursor;
  const stream = await attach(client, { codeSessionId, startCursor, userId: ctx.userId });

  let outcome: { resolved: boolean; error?: string };
  try {
    outcome = await resolve(client, {
      codeSessionId,
      requestId: input.requestId,
      decision: input.decision,
      userId: ctx.userId,
    });
  } catch (e) {
    await stream.cancel();
    throw e;
  }
  // An expired or already-decided request is a normal outcome, not a crash:
  // report it so claw can tell the channel instead of re-asking the coder.
  if (!outcome.resolved) {
    await stream.cancel();
    return { resolved: false, error: describeRefusal(outcome.error) };
  }

  const turn = await stream.collect();
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
