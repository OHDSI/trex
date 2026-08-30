// askCodeAgent — claw's single hand-off to the coding agent. It forwards a
// message to the SHARED Code agent session (opening one on first use) with the
// FULL toolset (no devx mode: see lib/code-session.ts for why) and returns the
// coder's reply with its machine trailer parsed off (see handoff-trailer.ts) —
// `reply` is the prose the channel should see, `trailer` the structured facts
// (track/saved/tests/blocked/needs/done/remaining/triggers) the reply ended
// with, or null when the coder sent none. claw uses it to hand over clear instructions
// and to relay participants' clarified answers; the coder runs its own gated
// planning/implementation from there.
//
// App scoping: the optional `app` input (devx.apps.id, from listApps) is
// honored on the FIRST call of a task — it fixes which app workspace/project
// rules the Code session runs with, and rides every subsequent turn as
// metadata.appId. Once the session exists the stored app wins; a different
// `app` mid-task is ignored (one task = one thread = one app).
import { defineTool } from "eve/tools";
import { apiBase, mintToken, runCodeTurn as runLegacyTurn, type CodeTurnArgs } from "../lib/code-stream.ts";
import { runCodeTurn as runEveTurn, type PendingApproval, type TokioClient, type TurnEnd } from "../lib/code-session.ts";
import { tokioClientFromGlobal } from "../lib/tokio.ts";
import { chooseCoderTransport } from "../lib/code-route.ts";
import { parkedReply, postApprovalGates } from "../lib/coder-approval.ts";
import { readOrchestration, upsertOrchestration, readDecisions, renderDecisionLedger, type QueryFn } from "../lib/state.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";
import { postChannelMessage } from "../lib/discord-rest.ts";
import { parseTrailer, type HandoffTrailer } from "../lib/handoff-trailer.ts";

// The eve transport (code-session.ts) reports HOW the turn ended and, when it
// parked on a human approval, which requests are pending. The legacy /stream
// transport reports neither — and a result without them means exactly what its
// absence says: the turn ran to the end.
export interface CodeTurnOutcome {
  chatId: string;
  replyText: string;
  nextCursor?: number;
  reason?: TurnEnd;
  pending?: PendingApproval[];
}

interface Input {
  message: string;
  app?: string;
  // Files the team attached in the channel (from an <attachments> block),
  // relayed VERBATIM — claw never downloads, describes, or embeds them. The
  // devx side materializes them into the coder's workspace.
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
}

// Discord sessions carry no trex user; CLAW_CODE_USER_ID pins the Code
// session (workspaces + app ownership are user-scoped) to the deployment's
// devx user so claw's coder sees the same apps/workspaces as the devx UI.
export function effectiveUserId(ctxUserId: string | undefined, env: (k: string) => string | undefined): string | undefined {
  // Empty string counts as unset: the manifest's `${CLAW_CODE_USER_ID:-}`
  // substitution bakes "" into the worker env when the host var is absent.
  if (ctxUserId?.trim()) return ctxUserId;
  const fromEnv = env("CLAW_CODE_USER_ID")?.trim();
  return fromEnv || undefined;
}

// Reads the coder account's provider the SAME way code-stream.ts's
// ensureCoderProvider does (mint the same access token, GET the devx-api
// settings mount) rather than inventing a second path to the same data.
async function fetchCoderProvider(userId: string): Promise<string | undefined> {
  const token = await mintToken(userId);
  const res = await fetch(`${apiBase()}/settings`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`coder settings fetch failed: ${res.status}`);
  const body = (await res.json()) as { provider?: unknown };
  return typeof body.provider === "string" ? body.provider : undefined;
}

// Injected so routeCodeTurn's provider-based branch can be exercised in tests
// without ever invoking mintToken/Trex.req (mintToken's dynamic import only
// resolves inside a staged worker — see code-stream.ts's header — and
// Trex.req does not exist outside one either).
export interface TransportDeps {
  getProvider?: (userId: string) => Promise<string | undefined>;
  runLegacy?: (args: CodeTurnArgs) => Promise<CodeTurnOutcome>;
  runEve?: typeof runEveTurn;
  getClient?: () => TokioClient | null;
}

// Real production routing, used only when the caller supplies no runTurn
// override (see askCore below). Exported for testing only.
export async function routeCodeTurn(
  args: CodeTurnArgs,
  startCursor: number,
  deps: TransportDeps = {},
): Promise<CodeTurnOutcome> {
  const getProvider = deps.getProvider ?? fetchCoderProvider;
  const runLegacy = deps.runLegacy ?? runLegacyTurn;
  const runEve = deps.runEve ?? runEveTurn;
  const getClient = deps.getClient ?? tokioClientFromGlobal;

  let transport: ReturnType<typeof chooseCoderTransport>;
  try {
    transport = chooseCoderTransport(await getProvider(args.userId));
  } catch (e) {
    // Mirrors effectiveLoop.ts's SETTINGS_FETCH_FAILURE_LOOP: an unreadable
    // provider might be the sidecar, which eve cannot host, so an unknown
    // configuration degrades to the transport that works for every provider.
    console.error("claw: coder provider fetch failed, defaulting to legacy transport:", e);
    transport = "legacy";
  }
  if (transport === "legacy") return await runLegacy(args);

  // devx's buildUserMessage (agent.ts:583) materializes attachments only when
  // userId AND appId AND attachments all hold — with no appId they vanish
  // silently (the turn succeeds, no files land). Fail loudly here instead.
  if (args.attachments?.length && !args.appId) {
    throw new Error("askCodeAgent: attachments need an app (pass `app`) to reach the coder on the eve transport");
  }
  const client = getClient();
  if (!client) throw new Error("askCodeAgent: Trex.req unavailable for the eve transport");
  const onProgress = args.onProgress;
  const result = await runEve(client, {
    codeSessionId: args.chatId,
    message: args.message,
    userId: args.userId,
    startCursor,
    appId: args.appId,
    attachments: args.attachments,
    // eve's heartbeat carries no activity text (unlike streamTurn's chunk
    // accumulation), so this uses the same fallback summarizeActivity gives
    // before any prose has arrived.
    onHeartbeat: onProgress ? () => onProgress("still working") : undefined,
  });
  return {
    chatId: result.codeSessionId,
    replyText: result.replyText,
    nextCursor: result.nextCursor,
    reason: result.reason,
    pending: result.pending,
  };
}

export async function askCore(
  sql: QueryFn,
  ctx: { sessionId: string; userId: string; channelId?: string },
  input: Input,
  // Injected for testability; tests pass a stub so askCore's orchestration can
  // be exercised without a live coder. Omitted (production) routes for real
  // via routeCodeTurn, chosen by the account's provider.
  runTurn?: (args: CodeTurnArgs) => Promise<CodeTurnOutcome>,
): Promise<{ reply: string; trailer: HandoffTrailer | null }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  // codeSessionId now holds the devx chat id; the stored app wins once the chat
  // exists, the input picks it on first use only.
  const appId = prior?.codeSessionId ? prior.appId : (input.app ?? prior?.appId ?? null);
  if (prior?.codeSessionId && input.app && input.app !== prior.appId) {
    console.warn(`claw: askCodeAgent ignored app change '${input.app}' — chat is fixed to '${prior.appId}'`);
  }
  // While this hand-off is blocked, claw can post nothing else to the channel —
  // the heartbeat is the only sign of life the thread gets for a long step. No
  // channel, no timer: a channelId-less caller (no ctx.metadata.channelId) gets
  // no onProgress at all, rather than a no-op that still burns an interval for
  // nothing.
  const onProgress = ctx.channelId
    ? (note: string) => {
        // Fire-and-forget: a failed heartbeat must never fail the turn — a
        // Discord outage must not break a coding hand-off.
        postChannelMessage(fetch, {
          botToken: Deno.env.get("DISCORD_BOT_TOKEN")!,
          channelId: ctx.channelId!,
          content: `Still on it: ${note}`,
        }).catch(() => {});
      }
    : undefined;
  // Prepend what the team already settled, so the coder (and claw, reading its
  // own reply back) is never re-asked something a hand-off ago already
  // answered.
  const ledger = renderDecisionLedger(await readDecisions(sql, ctx.sessionId));
  const message = ledger ? `${ledger}${input.message}` : input.message;
  const turnArgs: CodeTurnArgs = {
    chatId: prior?.codeSessionId ?? null,
    message,
    userId: ctx.userId,
    appId,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(onProgress ? { onProgress } : {}),
  };
  const outcome = runTurn ? await runTurn(turnArgs) : await routeCodeTurn(turnArgs, prior?.eventCursor ?? 0);
  // The cursor is what a re-attach resumes from after a parked approval, so it
  // must be stored on EVERY turn. The legacy /stream path reports none (each
  // turn streams to completion there) and keeps writing 0.
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId: outcome.chatId,
    eventCursor: outcome.nextCursor ?? 0,
    appId,
  });
  // Parked on a human: the coder's turn is still open, so the channel gets the
  // gate and claw gets the requestIds — NOT a reply to relay. Sending the coder
  // another message here would start a second turn on top of the parked one.
  if (outcome.reason === "input-requested") {
    const pending = outcome.pending ?? [];
    const posted = await postApprovalGates(fetch, {
      botToken: Deno.env.get("DISCORD_BOT_TOKEN"),
      channelId: ctx.channelId,
      pending,
    });
    return { reply: parkedReply(pending, posted), trailer: null };
  }
  // The coder ends its reply with a machine trailer (see prompts_channel.ts's
  // <reply_contract>); strip it from what the channel sees and hand the parsed
  // facts back alongside.
  const { trailer, body } = parseTrailer(outcome.replyText);
  return { reply: body, trailer };
}

export default defineTool({
  description:
    "Send a message to the shared coding-agent session and return its reply. " +
    "It continues the SAME session across calls, so drive the coder ONE gated step at a " +
    "time: tell it exactly which superpowers skill to run now and to STOP for approval " +
    "(e.g. 'run your brainstorming skill and present options, do not write code, stop'; " +
    "then, after the channel approves, 'run writing-plans for option B, stop'; then, after " +
    "approval, 'implement the approved plan with subagent-driven-development'). Relay each " +
    "reply to the channel and wait for the humans before the next step. Every message you " +
    "send is YOUR OWN summary, in your own words, of what's needed — including a clarified " +
    "answer, never a copy of a channel message. To the coder you are one person: never " +
    "mention a team, channel, thread, participant, or Discord. Pass `app` (a devx app id " +
    "from listApps) on the FIRST call when the task targets an existing app — it fixes the " +
    "coder's workspace and project rules for the whole task and cannot be changed later.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "The clear single-step instruction, answer, or message for the coding agent — always " +
          "YOUR OWN summary in the first person singular, never a copied channel message, and " +
          "never naming a team, channel, thread, participant, or Discord.",
      },
      app: {
        type: "string",
        description:
          "Optional devx app id (from listApps) scoping the task to that app's workspace and project rules. Only honored on the first call of a task.",
      },
      attachments: {
        type: "array",
        description:
          "Files the team attached in the channel, copied VERBATIM from the message's <attachments> block (name/url/contentType) — or from an [attachment: {...}] entry in the thread/channel history block when the file was posted in an earlier message. They are materialized into the coder's workspace automatically — do not download, describe, or paste them anywhere yourself. Never claim a file is available to the coder before relaying it here.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Filename as attached, e.g. screen.png." },
            url: { type: "string", description: "The attachment url from the <attachments> block, unchanged." },
            contentType: { type: "string", description: "MIME type when present, e.g. image/png." },
          },
          required: ["name", "url"],
        },
      },
    },
    required: ["message"],
  },
  execute: (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.askCodeAgent((input as Input).message);
    if (!ctx?.sql) throw new Error("askCodeAgent: ctx.sql unavailable");
    const userId = effectiveUserId(ctx.userId, (k) => Deno.env.get(k));
    // The coder chat is user-scoped (workspaces, app ownership, minted token
    // subject); without a resolvable user there is nothing to talk to.
    if (!userId) throw new Error("askCodeAgent: no user id (set CLAW_CODE_USER_ID)");
    const channelId = (ctx.metadata as { channelId?: string } | undefined)?.channelId;
    return askCore(ctx.sql, { sessionId: ctx.sessionId, userId, channelId }, input as Input);
  },
});
