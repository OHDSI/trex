// askCodeAgent — claw's single hand-off to the coding agent. It forwards a
// message to the SHARED Code agent session (opening one on first use) with the
// FULL toolset (no devx mode: see lib/code-session.ts for why) and returns the
// coder's reply verbatim. claw uses it to hand over clear instructions and to
// relay participants' clarified answers; the coder runs its own gated
// planning/implementation from there.
//
// App scoping: the optional `app` input (devx.apps.id, from listApps) is
// honored on the FIRST call of a task — it fixes which app workspace/project
// rules the Code session runs with, and rides every subsequent turn as
// metadata.appId. Once the session exists the stored app wins; a different
// `app` mid-task is ignored (one task = one thread = one app).
import { defineTool } from "eve/tools";
import { runCodeTurn, type CodeTurnArgs } from "../lib/code-stream.ts";
import { readOrchestration, upsertOrchestration, type QueryFn } from "../lib/state.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

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

export async function askCore(
  sql: QueryFn,
  ctx: { sessionId: string; userId: string },
  input: Input,
  // Injected for testability (defaults to the real /stream turn); tests pass a
  // stub so askCore's orchestration can be exercised without a live coder.
  runTurn: (args: CodeTurnArgs) => Promise<{ chatId: string; replyText: string }> = runCodeTurn,
): Promise<{ reply: string }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  // codeSessionId now holds the devx chat id; the stored app wins once the chat
  // exists, the input picks it on first use only.
  const appId = prior?.codeSessionId ? prior.appId : (input.app ?? prior?.appId ?? null);
  if (prior?.codeSessionId && input.app && input.app !== prior.appId) {
    console.warn(`claw: askCodeAgent ignored app change '${input.app}' — chat is fixed to '${prior.appId}'`);
  }
  const { chatId, replyText } = await runTurn({
    chatId: prior?.codeSessionId ?? null,
    message: input.message,
    userId: ctx.userId,
    appId,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  });
  // eventCursor is unused on the /stream path (each turn streams to completion);
  // the column is retained for schema compatibility.
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId: chatId,
    eventCursor: 0,
    appId,
  });
  return { reply: replyText };
}

export default defineTool({
  description:
    "Send a message to the shared coding-agent session and return its reply verbatim. " +
    "It continues the SAME session across calls, so drive the coder ONE gated step at a " +
    "time: tell it exactly which superpowers skill to run now and to STOP for approval " +
    "(e.g. 'run your brainstorming skill and present options, do not write code, stop'; " +
    "then, after the channel approves, 'run writing-plans for option B, stop'; then, after " +
    "approval, 'implement the approved plan with subagent-driven-development'). Relay each " +
    "reply to the channel and wait for the humans before the next step. Also use this to " +
    "relay the participants' answers. Pass `app` (a devx app id from listApps) on the FIRST " +
    "call when the task targets an existing app — it fixes the coder's workspace and project " +
    "rules for the whole task and cannot be changed later.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The clear single-step instruction, answer, or message for the coding agent.",
      },
      app: {
        type: "string",
        description:
          "Optional devx app id (from listApps) scoping the task to that app's workspace and project rules. Only honored on the first call of a task.",
      },
      attachments: {
        type: "array",
        description:
          "Files the team attached in the channel, copied VERBATIM from the message's <attachments> block (name/url/contentType). They are materialized into the coder's workspace automatically — do not download, describe, or paste them anywhere yourself.",
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
    return askCore(ctx.sql, { sessionId: ctx.sessionId, userId }, input as Input);
  },
});
