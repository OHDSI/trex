// Child-spawn capabilities threaded onto ToolBuildCtx (see toolset.ts's
// ToolBuildCtx.spawn). Built once per turn by handler.ts's startTurn and
// passed down as a plain callback object — toolset.ts cannot import
// handler.ts's (module-private) startTurn without creating an import cycle
// (handler.ts already imports buildSdkTools from toolset.ts), so handler.ts
// supplies `startChildTurn` as a closure instead. Same pattern as
// `activateTools` being threaded onto ToolContext rather than the raw store.
import type { ChildAgent } from "./orchestration.ts";
import { checkSpawnAllowed, STOPPED_BY_PARENT_ERROR } from "./orchestration.ts";
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

// agent_wait is a MAILBOX WAIT over the store's plain QueryFn, not a
// LISTEN/NOTIFY push — the store exposes no notification channel, and adding
// one is its own change (noted in COMPAT.md). WAIT_POLL_MS trades latency for
// query load; WAIT_MAX_MS is the hard ceiling so a wedged/slow child can
// never block a parent's turn indefinitely — a caller wanting longer just
// calls agent_wait again. WAIT_DEFAULT_MS is what a caller gets when it
// doesn't specify (the `agent_wait` tool itself defaults to this).
export const WAIT_DEFAULT_MS = 60_000;
export const WAIT_MAX_MS = 600_000;
const WAIT_POLL_MS = 500;

const TERMINAL_STATUSES = new Set<ChildAgent["status"]>(["completed", "failed", "stopped"]);

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
  // Whether spawnChild will accept detached: true for THIS parent session.
  // False for an ephemeral, never-revisited session (/chat — see
  // handler.ts's wiring) where a detached child's completion would have
  // nobody left to observe it. Built-ins that create detached children
  // (agent_spawn/agent_list — Task 9; agent_wait/agent_stop/agent_send —
  // Tasks 10-12) MUST gate their own registration on this flag, not merely
  // on ctx.spawn being truthy — /chat wires ctx.spawn too, for the
  // BLOCKING `agent` tool. spawnChild itself also refuses a detached
  // request when this is false, so a caller that skips the registration
  // check still fails loudly instead of silently orphaning a child.
  readonly allowDetached: boolean;
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
  // See SpawnCapabilities.allowDetached — passed straight through.
  allowDetached: boolean;
  // The trex user id of whoever caused the PARENT turn, written to the child
  // session's created_by. store.createChildSession has always accepted this;
  // nothing ever supplied it, so every child session in the database was
  // anonymous — invisible to any created_by-scoped ownership check, and
  // unattributable in billing/audit. Optional because a channel session has
  // no trex user at all (see handler.ts's channel wiring).
  createdBy?: string;
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

export function createSpawnCapabilities(deps: SpawnDeps): SpawnCapabilities {
  const { store, sessionId: parentSessionId, turnId: parentTurnId, plugin, agent, config } = deps;

  return {
    allowDetached: deps.allowDetached,

    async spawnChild({ subagent, prompt, forkTurns, detached }) {
      if (detached && !deps.allowDetached) {
        throw new Error(
          "agents: this session cannot spawn a detached agent — it is never revisited, " +
            "so a detached child's result would be silently orphaned; use blocking delegation instead",
        );
      }
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
        createdBy: deps.createdBy,
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
      // lastStepText (runner.ts) is step-scoped, matching what a nested
      // in-process call's own `result.text` always gave — a preamble step
      // ("Let me check the config...") before a tool call must not leak
      // into a delegated answer, even if the FINAL step itself produced no
      // text at all (then this is correctly ""; see runner.ts). `??`, not
      // `||`: an intentional empty final step must not fall back to the
      // (stale, earlier-step) `text` field — that fallback is only for a
      // turn persisted before lastStepText existed at all (field genuinely
      // absent), or a test fixture that fabricates only `text`.
      const payload = textStep?.payload as { text?: string; lastStepText?: string } | undefined;
      const text = payload?.lastStepText ?? payload?.text ?? "";
      return { text };
    },

    listChildren(): Promise<ChildAgent[]> {
      return store.listChildren(parentSessionId);
    },

    // Reports WHICH children reached a terminal state, never their content —
    // a mailbox wait, not a join. `agentIds` given: resolved ONE AT A TIME
    // through the parent-scoped store.getChild, exactly like awaitChild —
    // never listChildren-then-filter — so a foreign id simply comes back
    // null and is dropped, indistinguishable from one that never existed.
    // `agentIds` omitted: waits on every child via listChildren, which is
    // already parent-scoped by construction.
    async waitForChildren(agentIds: string[] | null, timeoutMs: number): Promise<ChildAgent[]> {
      const deadline = Date.now() + Math.min(Math.max(timeoutMs, 0), WAIT_MAX_MS);
      for (;;) {
        const children = agentIds
          ? (await Promise.all(agentIds.map((id) => store.getChild(id, parentSessionId))))
            .filter((c): c is ChildAgent => c !== null)
          : await store.listChildren(parentSessionId);

        const done = children.filter((c) => TERMINAL_STATUSES.has(c.status));
        if (done.length > 0) return done;
        if (Date.now() >= deadline) return [];
        await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
      }
    },

    // Ownership resolved through the parent-scoped store.getChild, same as
    // awaitChild/waitForChildren — a child of another session comes back
    // null and is indistinguishable from one that never existed; never
    // widen this to a raw-id lookup filtered in JS. Returns the PREVIOUS
    // status rather than silently no-op'ing on an already-finished child:
    // the model must learn "already done" from the return value, not from
    // nothing happening.
    async stopChild(agentId: string): Promise<ChildAgent["status"]> {
      const child = await store.getChild(agentId, parentSessionId);
      if (!child) throw new Error(`unknown agent "${agentId}"`);
      if (child.status === "running") {
        // Recorded as an ordinary `failed` turn carrying this EXACT error
        // string — store.ts's status-deriving queries key off it (strict
        // equality) to display "stopped" instead of "failed". Must use the
        // shared constant, never a duplicated literal.
        await store.failTurnsForSession(agentId, STOPPED_BY_PARENT_ERROR);
      }
      return child.status;
    },
    // Ownership resolved through the parent-scoped store.getChild, same as
    // awaitChild/stopChild — a foreign or unknown agent id comes back null
    // and is indistinguishable from "not delivered", never a thrown error.
    // A child has exactly one turn (see runner.ts's makePrepareStep), so
    // `running` is the only status a message can still reach — anything
    // else means the turn already ended and there is no later turn for a
    // queued message to ride into.
    async sendToChild(agentId: string, message: string): Promise<{ delivered: boolean }> {
      const child = await store.getChild(agentId, parentSessionId);
      // Not an error: a finished (or foreign) child simply cannot receive
      // anything, and the model needs to learn that from the return value
      // rather than assume delivery landed.
      if (!child || child.status !== "running") return { delivered: false };
      await store.queueFollowUp(agentId, message);
      return { delivered: true };
    },
  };
}
