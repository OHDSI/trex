// listApps — grounds claw's app choice in what actually exists. Reads
// devx.apps so claw can resolve "the dashboard app" to a real app id (and
// offer the team concrete options when the ask doesn't name one) before
// handing the task to the coding agent via askCodeAgent's `app` input.
import { defineTool } from "eve/tools";
import type { QueryFn } from "../lib/state.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

export interface AppRow {
  id: string;
  name: string;
  tech_stack: string | null;
  updated_at: string;
}

export async function listAppsCore(
  sql: QueryFn,
  userId: string | undefined,
): Promise<{ apps: Array<{ id: string; name: string; techStack: string | null }> }> {
  // Apps are user-scoped (workspaces too) — filter when we know the user.
  // Without one (no CLAW_CODE_USER_ID configured), list everything so a
  // single-user deployment still works; the inbound allow-list gates who can
  // reach this at all.
  const { rows } = userId
    ? await sql(
      `SELECT id, name, tech_stack, updated_at FROM devx.apps WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    )
    : await sql(
      `SELECT id, name, tech_stack, updated_at FROM devx.apps ORDER BY updated_at DESC LIMIT 50`,
    );
  return {
    apps: (rows as AppRow[]).map((r) => ({ id: r.id, name: r.name, techStack: r.tech_stack ?? null })),
  };
}

export default defineTool({
  description:
    "List the devx apps the coding agent can work on (id, name, tech stack; most recently " +
    "updated first). Use it to resolve which app a task targets before delegating: match " +
    "the team's wording against the names, and if the ask doesn't clearly name one, offer " +
    "these as options in your clarifying question. Pass the chosen id as askCodeAgent's `app`.",
  inputSchema: { type: "object", properties: {} },
  execute: (_input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.listApps(ctx);
    if (!ctx?.sql) throw new Error("listApps: ctx.sql unavailable");
    const userId = effectiveUserId(ctx.userId, (k) => Deno.env.get(k));
    return listAppsCore(ctx.sql, userId);
  },
});
