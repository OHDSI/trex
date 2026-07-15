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
import { runCodeTurn, type TokioClient } from "../lib/code-session.ts";
import { makeTokioClient } from "../lib/tokio.ts";
import { readOrchestration, upsertOrchestration, type QueryFn } from "../lib/state.ts";

interface Input {
  message: string;
  app?: string;
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
  client: TokioClient,
  sql: QueryFn,
  ctx: { sessionId: string; userId?: string },
  input: Input,
): Promise<{ reply: string }> {
  const prior = await readOrchestration(sql, ctx.sessionId);
  // The stored app wins once the Code session exists; the input picks it on
  // first use only.
  const appId = prior?.codeSessionId ? prior.appId : (input.app ?? prior?.appId ?? null);
  if (prior?.codeSessionId && input.app && input.app !== prior.appId) {
    console.warn(`claw: askCodeAgent ignored app change '${input.app}' — session is fixed to '${prior.appId}'`);
  }
  const { codeSessionId, replyText, nextCursor } = await runCodeTurn(client, {
    codeSessionId: prior?.codeSessionId ?? null,
    message: input.message,
    userId: ctx.userId,
    startCursor: prior?.eventCursor ?? 0,
    appId,
  });
  await upsertOrchestration(sql, {
    sessionId: ctx.sessionId,
    codeSessionId,
    eventCursor: nextCursor,
    appId,
  });
  return { reply: replyText };
}

export default defineTool({
  description:
    "Send a message to the shared coding-agent session and return its reply verbatim. " +
    "Use this to hand the coding agent CLEAR, unambiguous instructions once the ask is " +
    "understood, and to relay the participants' clarified answers to the coding agent's " +
    "own questions. The coding agent runs its full planning + implementation process " +
    "(with its own skills and gates); it continues the SAME session across calls. " +
    "Pass `app` (a devx app id from listApps) on the FIRST call when the task targets an " +
    "existing app — it fixes the coder's workspace and project rules for the whole task " +
    "and cannot be changed later.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The clear instruction, answer, or message for the coding agent.",
      },
      app: {
        type: "string",
        description:
          "Optional devx app id (from listApps) scoping the task to that app's workspace and project rules. Only honored on the first call of a task.",
      },
    },
    required: ["message"],
  },
  execute: (input, ctx) => {
    const g = globalThis as any;
    if (!g.Trex?.req) throw new Error("askCodeAgent: Trex.req unavailable (not a user worker)");
    if (!ctx?.sql) throw new Error("askCodeAgent: ctx.sql unavailable");
    const client = makeTokioClient(g.Trex.req.bind(g.Trex));
    const userId = effectiveUserId(ctx.userId, (k) => Deno.env.get(k));
    return askCore(client, ctx.sql, { sessionId: ctx.sessionId, userId }, input as Input);
  },
});
