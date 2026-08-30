// The scope a devx session declares AT CREATION (agents.sessions, V14): the
// tool allowlist filterTools enforces and the workspace resolveWorkspace /
// context.ts honour. Read from the session row, NEVER from ctx.metadata — a
// restriction the model can restate per turn is one it can widen. Same posture
// as V13's approver_reachable (store.ts's isApproverReachable).
//
// Type-only import, same posture as agent.ts's: erased at build/runtime, so
// no real dependency on core is created.
import type { QueryFn } from "../../../../core/server/agents/eve-shim/types.ts";
import { getRunWorktreePath } from "../../functions/tools/workspace.ts";

export interface SessionScope {
  /** undefined = none declared, i.e. every tool allowed. An EMPTY array is a
   * declared allowlist OF NOTHING and drops every tool. */
  allowedTools?: readonly string[];
  /** Exactly as declared — validated per use by acceptDeclaredWorkspace. */
  workspace?: string;
}

const NOTHING_DECLARED: SessionScope = Object.freeze({});

export function parseSessionScopeRow(row: unknown): SessionScope {
  const r = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const scope: SessionScope = {};
  // Only a strict `true` declares, matching handler.ts's approverReachable
  // read: a stray truthy value must not turn an unrestricted session into an
  // allowlisted one, nor the reverse.
  if (r.tool_allowlist_declared === true) {
    scope.allowedTools = Array.isArray(r.tool_allowlist) ? r.tool_allowlist.filter((t): t is string => typeof t === "string") : [];
  }
  if (typeof r.workspace_path === "string" && r.workspace_path !== "") scope.workspace = r.workspace_path;
  return scope;
}

// One read per session per worker: the row is written before the session's
// first turn and never changes. Bounded like context.ts's chatOwnershipCache
// so a long-lived worker cannot accumulate an entry per session forever.
const CACHE_MAX = 512;
const loaded = new Map<string, SessionScope>();
const inFlight = new Map<string, Promise<SessionScope>>();

function remember(sessionId: string, scope: SessionScope): SessionScope {
  if (loaded.size >= CACHE_MAX) {
    const oldest = loaded.keys().next().value;
    if (oldest !== undefined) loaded.delete(oldest);
  }
  loaded.set(sessionId, scope);
  return scope;
}

export function loadSessionScope(sessionId: string, sql: QueryFn): Promise<SessionScope> {
  const cached = loaded.get(sessionId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(sessionId);
  if (pending) return pending;
  // Wrapped so a query fn that throws SYNCHRONOUSLY lands in the catch below
  // rather than escaping into the caller's hook.
  const p = Promise.resolve()
    .then(() =>
      sql(
        `SELECT tool_allowlist, tool_allowlist_declared, workspace_path FROM agents.sessions WHERE id = $1`,
        [sessionId],
      )
    )
    .then((r) => remember(sessionId, parseSessionScopeRow(r.rows[0])))
    // A deployment whose agents.sessions predates V14 has no such columns and
    // errors here. That is "nothing declared" — today's behaviour — and it is
    // cached, so the whole session does not re-query on every turn.
    .catch((e) => {
      console.log(`devx: session scope unreadable for ${sessionId} (${e instanceof Error ? e.message : String(e)}) — treating as nothing declared`);
      return remember(sessionId, NOTHING_DECLARED);
    })
    .finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, p);
  return p;
}

/** The already-loaded scope, for the synchronous hooks (filterTools,
 * resolveWorkspace) that cannot await. undefined = never loaded. */
export function peekSessionScope(sessionId: string): SessionScope | undefined {
  return loaded.get(sessionId);
}

/**
 * The declared workspace, but only when it is a value devx itself could have
 * produced for THIS user and app: an isolated run worktree. Equality against
 * getRunWorktreePath — not a prefix test — is what rejects `..`, a path
 * outside the managed base dir, and anything shaped like an ensureWorkspace/
 * ensureAppWorkspace result for another app or user (that generator cannot
 * emit one). It matters because the workspace is half of every consent scope
 * key (core/server/agents/service/scope-key.ts).
 */
export function acceptDeclaredWorkspace(
  declared: string | undefined,
  userId: string | undefined,
  appId: string | undefined,
): string | undefined {
  if (!declared || !userId || !appId) return undefined;
  const leaf = declared.slice(declared.lastIndexOf("/") + 1);
  if (leaf && declared === getRunWorktreePath(userId, appId, leaf)) return declared;
  console.log(`devx: declared workspace ${JSON.stringify(declared)} is not a run worktree for this session — falling back to the derived workspace`);
  return undefined;
}
