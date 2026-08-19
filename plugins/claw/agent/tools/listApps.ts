// listApps — grounds claw's app choice in what actually exists. Reads
// devx.apps so claw can resolve "the dashboard app" to a real app id (and
// offer the team concrete options when the ask doesn't name one) before
// handing the task to the coding agent via askCodeAgent's `app` input.
import { defineTool } from "eve/tools";
import type { QueryFn } from "../lib/state.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";
import { apiBase, mintToken } from "../lib/code-stream.ts";

export interface AppRow {
  id: string;
  name: string;
  tech_stack: string | null;
  updated_at: string;
}

export interface AppFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: AppFileNode[];
}

// Bounded, first-hit-wins walk of one app's file tree (breadth-first, so a
// shallow match is preferred over a deep one). Pure and synchronous — no
// network, no recursion depth of its own — so it cannot blow up regardless of
// how the tree was fetched.
export function firstComponentMatch(nodes: AppFileNode[], needle: string): string | undefined {
  const queue = [...nodes];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.name.toLowerCase().includes(needle)) return node.path;
    if (node.type === "directory" && node.children?.length) queue.push(...node.children);
  }
  return undefined;
}

// A team names things by product ("Whiterabbit"), not by devx app. Before claw
// tells anyone a repository is unregistered, look for the name INSIDE the
// registered apps' checked-out trees: it is usually a plugin/module of one of
// them. This calls devx's existing GET /apps/:id/files (the same file-tree
// endpoint the devx UI's file browser uses) — it already caps depth at 5 and
// excludes build/vendor dirs, and already re-scaffolds or returns [] when an
// app's workspace is not checked out, so a missing workspace here degrades to
// "no match" rather than an error.
export async function findComponentInApp(
  appId: string,
  userId: string,
  component: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const token = await mintToken(userId);
    const res = await fetchImpl(`${apiBase()}/apps/${appId}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const tree = await res.json();
    return Array.isArray(tree) ? firstComponentMatch(tree, component.toLowerCase()) : undefined;
  } catch {
    // Unreachable API, non-JSON body, missing workspace, etc. — one app
    // failing to answer must not fail the whole listApps call.
    return undefined;
  }
}

export type ComponentFinder = (appId: string, userId: string, component: string) => Promise<string | undefined>;

export async function listAppsCore(
  sql: QueryFn,
  userId: string | undefined,
  component?: string,
  findComponent: ComponentFinder = findComponentInApp,
): Promise<{ apps: Array<{ id: string; name: string; techStack: string | null; matchedPath?: string }> }> {
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
  const apps = (rows as AppRow[]).map((r) => ({ id: r.id, name: r.name, techStack: r.tech_stack ?? null }));

  // Only search when asked to (never a background full-tree walk of every app
  // on a plain listApps call), and only when there is a user identity to mint
  // a token with — the files endpoint is auth'd per user, same as every other
  // devx-api call claw makes.
  if (!component || !userId) return { apps };

  const withMatches = await Promise.all(apps.map(async (a) => {
    const matchedPath = await findComponent(a.id, userId, component);
    return matchedPath ? { ...a, matchedPath } : a;
  }));
  return { apps: withMatches };
}

export default defineTool({
  description:
    "List the devx apps the coding agent can work on (id, name, tech stack; most recently " +
    "updated first). Use it to resolve which app a task targets before delegating: match " +
    "the team's wording against the names, and if the ask doesn't clearly name one, offer " +
    "these as options in your clarifying question. Pass the chosen id as askCodeAgent's `app`. " +
    "Before telling anyone a name is not a registered app, call again with `component` set to " +
    "that name — it searches inside each app's checked-out tree and sets `matchedPath` on any " +
    "app that contains it, since a product/component name (e.g. a plugin) is often part of an " +
    "already-registered app rather than its own repo.",
  inputSchema: {
    type: "object",
    properties: {
      component: {
        type: "string",
        description:
          "Optional: search the registered apps' checked-out trees for this name (a file or " +
          "directory) before concluding it isn't registered anywhere. Matching apps get a " +
          "`matchedPath`.",
      },
    },
  },
  execute: (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.listApps(ctx);
    if (!ctx?.sql) throw new Error("listApps: ctx.sql unavailable");
    const userId = effectiveUserId(ctx.userId, (k) => Deno.env.get(k));
    return listAppsCore(ctx.sql, userId, input?.component);
  },
});
