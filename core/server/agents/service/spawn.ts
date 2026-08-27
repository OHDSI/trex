// Child-spawn capabilities threaded onto ToolBuildCtx (see toolset.ts's
// ToolBuildCtx.spawn). Built once per turn by handler.ts's startTurn and
// passed down as a plain callback object — toolset.ts cannot import
// handler.ts's (module-private) startTurn without creating an import cycle
// (handler.ts already imports buildSdkTools from toolset.ts), so handler.ts
// supplies `startChildTurn` as a closure instead. Same pattern as
// `activateTools` being threaded onto ToolContext rather than the raw store.
import type { ChildAgent } from "./orchestration.ts";
import { checkSpawnAllowed } from "./orchestration.ts";
import { pickNickname } from "./nicknames.ts";
import { forkParentHistory } from "./context/fork.ts";
import type { ContextConfig } from "./context/budget.ts";
import { FALLBACK_CONTEXT_WINDOW } from "./context/budget.ts";
import type { ModelMessage, TurnRow } from "./context/history.ts";
import { STALE_TURN_MS } from "./turn-lifetime.ts";

// A forked slice must leave the child's OWN system prompt, tool schemas and
// the task instruction itself room to fit too. Fixed rather than a fraction
// of the child's real context window: at spawn time the child's model isn't
// resolved yet (it may not even match the parent's) — there's no window to
// take a fraction of. A quarter of the conservative fallback window is the
// same "never guess high" posture context/budget.ts already uses.
const FORK_TOKEN_BUDGET = Math.floor(FALLBACK_CONTEXT_WINDOW / 4);

// How often awaitChild polls the child's status, and how long it will wait
// before giving up. The child runs as its own detached turn (started via
// startChildTurn, fire-and-forget) — there is no promise to await directly,
// so a blocking `agent` call polls the parent-scoped getChild until the
// child's turn reaches a terminal state. The ceiling mirrors STALE_TURN_MS:
// a turn (parent or child) is allowed to run that long elsewhere in this
// codebase, and a shorter cap here would abandon a legitimately long child.
const AWAIT_CHILD_POLL_MS = 200;
const AWAIT_CHILD_TIMEOUT_MS = STALE_TURN_MS;

export interface SpawnChildOpts {
  subagent: string | null;
  prompt: string;
  forkTurns: string;
  detached: boolean;
}

export interface SpawnCapabilities {
  spawnChild(opts: SpawnChildOpts): Promise<{ agentId: string; nickname: string }>;
  /** Polls until the child's turn reaches a terminal state (see AWAIT_CHILD_*). */
  awaitChild(agentId: string): Promise<{ text: string } | { error: string }>;
  listChildren(): Promise<ChildAgent[]>;
  // Filled in by Task 10 (agent_wait). Present now so a caller that reaches
  // for it fails loudly instead of silently doing nothing.
  waitForChildren(agentIds: string[] | null, timeoutMs: number): Promise<ChildAgent[]>;
  // Filled in by Task 11 (agent_stop).
  stopChild(agentId: string): Promise<ChildAgent["status"]>;
  // Filled in by Task 12 (agent_send).
  sendToChild(agentId: string, message: string): Promise<{ delivered: boolean }>;
}

// Narrow slice of AgentStore this module actually calls — kept explicit
// (rather than importing the full AgentStore type) so a fake in tests only
// has to implement what spawn.ts uses.
export interface SpawnStore {
  countChildren(parentSessionId: string): Promise<{ live: number; total: number }>;
  listChildren(parentSessionId: string): Promise<ChildAgent[]>;
  createChildSession(opts: {
    plugin: string;
    agent: string;
    createdBy?: string;
    parentSessionId: string;
    parentTurnId: string | null;
    subagent: string | null;
    nickname: string;
    detached: boolean;
  }): Promise<string>;
  getHistory(sessionId: string): Promise<TurnRow[]>;
  getChild(agentId: string, parentSessionId: string): Promise<ChildAgent | null>;
  failTurnsForSession(sessionId: string, error: string): Promise<number>;
  queueFollowUp(sessionId: string, text: string): Promise<void>;
  takeFollowUps(sessionId: string): Promise<string[]>;
}

export interface SpawnDeps {
  sessionId: string; // parent session id
  turnId: string | null; // parent turn id
  plugin: string;
  agent: string;
  store: SpawnStore;
  config: ContextConfig;
  // Kicks off the child's first turn. Fire-and-forget (same posture as
  // handler.ts's own startTurn) — this resolves once the turn has been
  // asked to start, not once it finishes. `history`, when given, seeds the
  // child's first-turn messages directly (the forked slice from the
  // PARENT's history); a brand-new child session has no persisted turns of
  // its own for buildHistory to assemble, so this is the only way the
  // inherited context reaches the child's first request.
  startChildTurn(
    o: { sessionId: string; message: unknown; subagent: string | null; history?: ModelMessage[] },
  ): void | Promise<void>;
}

const NOT_IMPLEMENTED = (name: string) => (): Promise<never> =>
  Promise.reject(new Error(`agents: SpawnCapabilities.${name} is not implemented yet`));

export function createSpawnCapabilities(deps: SpawnDeps): SpawnCapabilities {
  const { store, sessionId: parentSessionId, turnId: parentTurnId, plugin, agent, config } = deps;

  return {
    async spawnChild({ subagent, prompt, forkTurns, detached }) {
      const counts = await store.countChildren(parentSessionId);
      const admit = checkSpawnAllowed(counts);
      if (!admit.allowed) throw new Error(admit.reason);

      const siblings = await store.listChildren(parentSessionId);
      const nickname = pickNickname(siblings.map((c) => c.nickname).filter(Boolean));

      // Resolved from the PARENT's history, which carries real tool calls
      // since #275 — the whole reason fork_turns was gated on it.
      const parentTurns = await store.getHistory(parentSessionId);
      const inherited = forkParentHistory(parentTurns, forkTurns, config, FORK_TOKEN_BUDGET);

      const agentId = await store.createChildSession({
        plugin,
        agent,
        parentSessionId,
        parentTurnId,
        subagent,
        nickname,
        detached,
      });

      await deps.startChildTurn({
        sessionId: agentId,
        message: prompt,
        subagent,
        ...(inherited.length ? { history: inherited } : {}),
      });
      return { agentId, nickname };
    },

    async awaitChild(agentId: string): Promise<{ text: string } | { error: string }> {
      const deadline = Date.now() + AWAIT_CHILD_TIMEOUT_MS;
      let child: ChildAgent | null = null;
      for (;;) {
        child = await store.getChild(agentId, parentSessionId);
        if (!child) return { error: `unknown agent "${agentId}"` };
        if (child.status !== "running") break;
        if (Date.now() >= deadline) {
          return { error: `agent "${child.nickname}" did not finish within the wait limit` };
        }
        await new Promise((r) => setTimeout(r, AWAIT_CHILD_POLL_MS));
      }

      if (child.status === "stopped") {
        return { error: `agent "${child.nickname}" was stopped before it finished` };
      }

      // ChildAgent carries only a display status, not the turn's actual
      // text/error — read those back from the child's own history, which is
      // parent-agnostic (a child never needs an ownership check on its own
      // session id).
      const turns = await store.getHistory(agentId);
      const lastTurn = turns[turns.length - 1];
      const steps = lastTurn?.steps ?? [];
      const textStep = [...steps].reverse().find((s) => s.kind === "text");
      const errorStep = [...steps].reverse().find((s) => s.kind === "error");

      if (child.status === "failed") {
        const message = (errorStep?.payload as { message?: string } | undefined)?.message;
        return { error: message ?? `agent "${child.nickname}" failed` };
      }
      const text = (textStep?.payload as { text?: string } | undefined)?.text ?? "";
      return { text };
    },

    listChildren(): Promise<ChildAgent[]> {
      return store.listChildren(parentSessionId);
    },

    waitForChildren: NOT_IMPLEMENTED("waitForChildren"),
    stopChild: NOT_IMPLEMENTED("stopChild"),
    sendToChild: NOT_IMPLEMENTED("sendToChild"),
  };
}
