// An autonomous devx run (devx.subagent_runs) as one eve turn. Extracted from
// index.ts's POST /agent-runs/:id/start so the run's prompt and its declared
// session scope are testable: the route body lives inside Deno.serve and
// cannot be imported.
//
// No provider branch. The legacy loop forked here — a plan run on the
// `claude-code` provider went to streamClaudeCodeChat, everything else to
// streamAgentChat. On eve the fork is agent.ts's resolveEngine, which picks
// the delegating sidecar engine off the user's provider row (see
// agent/lib/resolve_engine.test.ts), so this seam never sees a provider.

import { type EveSql, runOnEve, type RunOnEveResult } from "./eve_run.ts";
import type { DevxSseFrame } from "./eve_sse.ts";

/** The devx.subagent_runs columns this seam reads. */
export interface AgentRunRow {
  run_kind?: string | null;
  plan_id?: string | null;
  task?: string | null;
  app_id?: string | null;
}

export function isPlanRun(run: AgentRunRow): boolean {
  return run.run_kind === "agent" && !!run.plan_id;
}

// A plan run's prompt pre-decides subagent-driven execution so the skill does
// not stop to ask which strategy to use — an unattended run has nobody to ask.
export function buildRunPrompt(run: AgentRunRow): string {
  const task = run.task ?? "";
  return isPlanRun(run)
    ? `Execute the following implementation plan using the subagent-driven-development skill. Do not ask which execution strategy to use — use subagent-driven execution. Implement everything end-to-end with your tools.\n\nPLAN:\n${task}`
    : `${task}. Use your tools to thoroughly analyze the project.`;
}

export interface AgentRunOpts {
  userId: string;
  run: AgentRunRow;
  /** The matched skill's body; rides the user message (eve refuses a
   * client-supplied system prompt). */
  skillContext?: string;
  /** The matched skill's allowed_tools, if it declared any. */
  allowedTools?: string[] | null;
  /** A plan run's isolated worktree, when one was created. */
  workspacePathOverride?: string;
  send: (frame: DevxSseFrame) => void;
  sql: EveSql;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

// No `mode`: the legacy call used chatMode "agent", which filterTools reads as
// "no mode restriction". Passing "plan" here would strip the very tools a plan
// run exists to use.
export function runAgentRunOnEve(opts: AgentRunOpts): Promise<RunOnEveResult> {
  return runOnEve({
    userId: opts.userId,
    appId: opts.run.app_id,
    prompt: buildRunPrompt(opts.run),
    skillContext: opts.skillContext,
    allowedTools: opts.allowedTools,
    workspacePathOverride: opts.workspacePathOverride,
    send: opts.send,
    sql: opts.sql,
    bearerToken: opts.bearerToken,
    fetchImpl: opts.fetchImpl,
    baseUrl: opts.baseUrl,
  });
}
