// task-u1/u2: chat client for the ported eve/agents runtime, gated behind
// devx.settings.loop === 'agents' (see ChatPanel.tsx's single flag branch
// point). U1 shipped this against the stateless /chat endpoint (useChat +
// DefaultChatTransport); U2 replaces the transport with the eve/v1 session
// API (POST /eve/v1/session, follow-up POSTs, GET .../stream NDJSON tail,
// POST .../approval) so `needsApproval` tools actually pause mid-turn for a
// live decision instead of erroring out (see lib/agentsSession.ts's header
// comment and task-u2-report.md's evidence table for why). useChat itself is
// no longer usable here: it speaks the AI SDK's UIMessage wire protocol,
// which the session API does not implement — this hook hand-rolls the
// stream reader instead, the same shape as
// plugins/web/src/pages/admin/AgentRunDetail.tsx's live tail. The output
// shape (DevxUIMessage / legacy Message mirrors) is UNCHANGED from U1, so
// every downstream renderer (AgentsMessagesList, AgentsChatMessage,
// ToolCallCard) needed zero changes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToolName, isToolUIPart } from "ai";
import * as api from "@/lib/api";
import { getAuthToken } from "@/lib/api";
import { AGENTS_SESSION_URL } from "@/lib/config";
import type { AgentTodo, BuildAction, ChatMode, ConsentRequest } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";
import {
  type DevxUIMessage,
  storedMessagesToUIMessages,
  uiMessageText,
  uiMessageToolCalls,
  uiMessageToLegacyMessage,
  extractUsage,
  isApprovalRequiredOutput,
  FILE_MUTATING_TOOLS,
} from "@/lib/agentsChat";
import {
  type SessionChatState,
  initialSessionState,
  reduceSessionEvent,
  parseSessionEvent,
  loadCachedSessionId,
  saveCachedSessionId,
  clearCachedSessionId,
  createInFlightGate,
} from "@/lib/agentsSession";

/** Error with the HTTP status attached, so send()'s stale-session recovery
 * can distinguish a 404 (cached agents.sessions id no longer exists —
 * recoverable by creating a fresh session) from every other failure. */
class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface UseAgentsChatOptions {
  onAppCommand?: (command: string) => void;
  onBuildAction?: (action: BuildAction) => void;
  onModeChange?: (mode: string) => void;
}

// DevxMetadata (agent/lib/context.ts) — mode is omitted (undefined) for
// legacy's "agent" chat mode, matching agent.ts's readMode contract ("no
// mode / unknown mode" -> filterTools allows everything, the same posture
// legacy's own free-form mode has).
function toAgentMode(mode: ChatMode): "ask" | "plan" | "build" | undefined {
  return mode === "ask" || mode === "plan" || mode === "build" ? mode : undefined;
}

function buildContextNote(context?: { visualEdit?: VisualEditContext; selectedComponents?: SelectedComponent[] }): string {
  // Simplification vs. legacy (functions/index.ts:344-393): the server-side
  // loop reads the target file from the app's workspace and inlines a code
  // snippet around the target line. The ported agent has real Read/Glob tool
  // access and can look at the file itself if it needs to — see U1's report
  // for the fuller rationale (unchanged by U2).
  if (!context) return "";
  const notes: string[] = [];
  if (context.visualEdit) {
    notes.push(`Selected component: ${context.visualEdit.componentName} (${context.visualEdit.filePath}:${context.visualEdit.line})`);
  }
  for (const c of context.selectedComponents ?? []) {
    notes.push(`Selected component: ${c.devxName} (${c.filePath}:${c.line})`);
  }
  return notes.length > 0 ? `${notes.join("\n")}\n\n` : "";
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    "content-type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// How long after an ACCEPTED follow-up POST (202) to wait for the turn's
// first sign of life on the stream (turn.started/turn.failed, which release
// the send gate) before concluding the stream silently hung and freeing the
// composer with a retriable error. Generous on purpose: turn.started is
// emitted before any model call (handler.ts's startTurn emits it right after
// the agents.turns insert), so even a cold worker should beat this by two
// orders of magnitude — this only fires on genuinely broken plumbing.
const TURN_ACK_WATCHDOG_MS = 30_000;

export function useAgentsChat(
  chatId: string | null,
  mode: ChatMode,
  appId: string | null | undefined,
  options?: UseAgentsChatOptions,
) {
  const [loading, setLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionChatState>(() => initialSessionState([]));

  // History: devx.messages (read here via the existing REST, same as
  // useMessages.ts) is still the single source of truth for chat history
  // across BOTH loops, and how this hook seeds its local state on chat
  // switch/reload — the session API has no "give me the full history"
  // endpoint of its own (it only accepts one new message per turn; its own
  // memory is scoped to whichever agents.sessions row the turn runs under,
  // see agentsSession.ts's session-id-cache comment).
  useEffect(() => {
    let cancelled = false;
    setSessionState(initialSessionState([]));
    setPersistError(null);
    if (!chatId) return;
    setLoading(true);
    Promise.all([api.listMessages(chatId), api.getTodos(chatId).catch(() => [] as AgentTodo[])])
      .then(([msgs, chatTodos]) => {
        if (cancelled) return;
        setSessionState((prev) => ({ ...initialSessionState(storedMessagesToUIMessages(msgs)), todos: chatTodos, pendingApproval: prev.pendingApproval }));
        setLoading(false);
      })
      .catch((err) => {
        console.error("useAgentsChat: failed to load history:", err);
        if (cancelled) return;
        setSessionState(initialSessionState([]));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // metadata: a ref, not a dependency of send/ensureStream — mode/appId can
  // change without needing to tear down an in-flight turn.
  const metadataRef = useRef<{ mode?: "ask" | "plan" | "build"; chatId: string; appId?: string }>({
    chatId: chatId ?? "",
  });
  useEffect(() => {
    metadataRef.current = { mode: toAgentMode(mode), chatId: chatId ?? "", appId: appId ?? undefined };
  }, [mode, chatId, appId]);

  // Session lifecycle: one agents.sessions row per devx chat, reused across
  // turns (and page reloads, via the localStorage cache) so runner.ts's
  // historyForModel sees prior turns. `streamController` guards against
  // opening a second concurrent tail for the same session (send() and the
  // eager reconnect-on-load effect below could otherwise race).
  const sessionIdRef = useRef<string | null>(null);
  // The open live tail, WITH the session it belongs to (fix, re-review #3):
  // the "already open" short-circuit in ensureStreamOpen must verify the
  // existing connection is for the REQUESTED session — after a 404-retry
  // swaps sessions, a bare controller ref would happily return "open" for
  // the wrong session's stream.
  const streamRef = useRef<{ sessionId: string; controller: AbortController } | null>(null);
  const seenFileMutationsRef = useRef<Set<string>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Fix (review): stale-stream supersede. Mirrors AgentRunDetail.tsx's
  // per-instance `superseded` flag, generation-counter style: every
  // ensureStreamOpen caller captures the epoch at start; the chat-switch
  // cleanup bumps it. A superseded instance (its initial GET fetch resolving
  // AFTER the chat switched, when the cleanup's abort was a no-op because
  // streamRef wasn't assigned yet) must neither claim streamRef nor reduce
  // a single event into the NEW chat's state. Re-review #1: send() shares
  // the same epoch for its ENTIRE pipeline (session create, stream open,
  // message POST, watchdog) — every success-path ref write checks it.
  const streamEpochRef = useRef(0);

  // Fix (review): synchronous double-submit guard. See agentsSession.ts's
  // createInFlightGate — `streaming` (turn.started-derived state) flips far
  // too late to stop a double-click/double-Enter during the session-create +
  // stream-open + POST window. `sendPending` mirrors the gate into state so
  // the UI (`streaming` below) disables the send button for the same window.
  const sendGateRef = useRef(createInFlightGate());
  const [sendPending, setSendPending] = useState(false);

  // Fix (re-review #2): post-turn watchdog. The follow-up POST returning 202
  // proves the server ACCEPTED the turn, but the gate is only handed off
  // when `turn.started` (or turn.failed/session.failed) arrives on the
  // stream — a silently-hung stream (reader.read() never resolving, no
  // events at all) would otherwise leave the gate held and the composer
  // disabled forever, with manual Cancel as the only way out. One timer at
  // a time is enough: the gate guarantees at most one pre-ack send exists.
  const watchdogRef = useRef<number | null>(null);

  // Imperative send-gate hand-off (fix, re-re-review #1): releasing the gate
  // must NOT depend on the [turnActive, turnError] effect below — when
  // turn.started and turn.completed arrive in ONE NDJSON chunk, React
  // batches both reducer updates into a single render where turnActive is
  // false before AND after (net no-op), the effect never fires, the gate
  // stays held, and the watchdog later surfaces a false "no response" error
  // after a turn that actually SUCCEEDED. This helper is called imperatively
  // from consumeStream's per-line loop (already epoch-guarded there) the
  // moment an ack-class event is processed; it's idempotent, so the effect
  // stays as a harmless fallback for any path that renders normally.
  const releaseSendGate = useCallback(() => {
    if (watchdogRef.current != null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    sendGateRef.current.release();
    setSendPending(false);
  }, []);

  const persistAssistantMessage = useCallback(
    (message: DevxUIMessage, isStale: () => boolean) => {
      if (!chatId) return;
      const usage = extractUsage(message);
      const content = uiMessageText(message);
      const toolCalls = uiMessageToolCalls(message);
      api
        .createMessage(chatId, { role: "assistant", content, tool_calls: toolCalls.length > 0 ? toolCalls : undefined })
        .catch((err) => {
          console.error("useAgentsChat: failed to persist assistant message:", err);
          // The .catch resolves asynchronously — a chat switch may have
          // happened since the (epoch-guarded) event that triggered this
          // persist. A stale chat's persistence failure logs to the console
          // only; it must not surface in the NEW chat's UI (fix, re-re-review
          // #2 — same invariant as every other late write in this hook).
          if (isStale()) return;
          setPersistError("Reply generated but failed to save to chat history.");
        });
      // FILE_MUTATING_TOOLS heuristic (parity with useMessages.ts/U1): fire
      // onBuildAction("file_change") once per successfully-completed
      // mutating tool call so the preview panel refreshes.
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.state !== "output-available") continue;
        if (seenFileMutationsRef.current.has(part.toolCallId)) continue;
        seenFileMutationsRef.current.add(part.toolCallId);
        if (isApprovalRequiredOutput(part.output)) continue;
        const stripped = getToolName(part).replace(/^mcp__[^_]+__/, "");
        if (FILE_MUTATING_TOOLS.has(stripped)) {
          optionsRef.current?.onBuildAction?.({ action: "file_change" });
        }
      }
      if (usage) setSessionState((prev) => ({ ...prev, tokenUsage: usage }));
    },
    [chatId],
  );

  // Consumes one session's NDJSON tail until it ends/errors/is aborted.
  // Race-free approval ordering (see task-u2-report.md): the caller MUST
  // await this function's promise resolving PAST the initial `fetch` (i.e.
  // await `ensureStreamOpen`, not this function directly) before POSTing any
  // message that starts a turn — the server subscribes to the session's live
  // event bus synchronously while constructing the stream Response, so by
  // the time `fetch()`'s promise resolves, no `input.requested` (or any
  // other live-only event) emitted after that point can be missed.
  const consumeStream = useCallback(
    async (sessionId: string, res: Response, isStale: () => boolean) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!isStale()) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            // Checked per event, not just per chunk: the chat-switch cleanup
            // can land between two lines of an already-read chunk, and a
            // superseded instance must not reduce even one more event into
            // the new chat's state (same posture as AgentRunDetail.tsx's
            // `if (superseded) break`).
            if (isStale()) return;
            const event = parseSessionEvent(line);
            if (!event) continue;
            let finishedMessage: DevxUIMessage | null = null;
            setSessionState((prev) => {
              const { state: next, effects } = reduceSessionEvent(prev, event);
              if (effects.appCommand) optionsRef.current?.onAppCommand?.(effects.appCommand);
              if (effects.buildAction) optionsRef.current?.onBuildAction?.(effects.buildAction);
              if (effects.modeChange) optionsRef.current?.onModeChange?.(effects.modeChange);
              if (event.type === "turn.completed") {
                finishedMessage = next.messages.find((m) => m.id === event.data.turnId) ?? null;
              }
              return next;
            });
            // Imperative gate hand-off (fix, re-re-review #1) — see
            // releaseSendGate's comment for the React-batching false
            // positive this closes. Epoch-guarded by the `isStale()` check
            // at the top of this iteration (no await between it and here,
            // so staleness cannot develop mid-iteration).
            //  - turn.started: the ack the gate is waiting for. Live-only
            //    (handler.ts's stepToEvent never replays it — turn starts
            //    aren't persisted steps), so a replayed history can never
            //    release a held gate prematurely through this branch.
            //  - turn.completed/turn.failed/session.failed: belt and braces
            //    for an ack that got lost, but ONLY while the watchdog is
            //    armed (i.e. this send's POST was accepted and we are
            //    specifically awaiting its ack). turn.completed/turn.failed
            //    ARE replayable, and without the watchdog condition a
            //    replayed old turn's epilogue arriving during a send's
            //    stream-open phase would re-enable the composer mid-send —
            //    reopening the double-submit window the gate exists for.
            if (
              event.type === "turn.started" ||
              ((event.type === "turn.completed" || event.type === "turn.failed" || event.type === "session.failed") &&
                watchdogRef.current != null)
            ) {
              releaseSendGate();
            }
            if (finishedMessage) persistAssistantMessage(finishedMessage, isStale);
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("useAgentsChat: session stream dropped", sessionId, err);
        }
      }
    },
    [persistAssistantMessage, releaseSendGate],
  );

  // `streamOpenRef` serializes concurrent callers (the eager
  // reconnect-on-load effect below and `send()` can both call this for the
  // same session): without it, two callers racing before either's `fetch`
  // resolves would each see `streamRef.current` still null and open a
  // SECOND parallel connection — not just wasteful, but a correctness bug,
  // since every event would then be reduced twice (once per connection)
  // into session state. Tracks sessionId (fix, re-review #3) and a
  // per-instance cancel so a pending open for the WRONG session can be
  // superseded without staling the whole epoch.
  const streamOpenRef = useRef<{ sessionId: string; promise: Promise<void>; cancel: () => void } | null>(null);

  const ensureStreamOpen = useCallback(
    (sessionId: string, epoch: number): Promise<void> => {
      // `epoch` is the CALLER's captured epoch (fix, re-review #1), not
      // self-captured: a stale send() calling in here after a chat switch
      // must produce a stale stream instance that refuses to attach — if
      // this function captured a fresh epoch itself, a stale caller could
      // open a fresh-looking stream that feeds the new chat's state.
      if (streamRef.current) {
        if (streamRef.current.sessionId === sessionId) return Promise.resolve();
        // Open stream belongs to a DIFFERENT session (e.g. after a
        // 404-retry swapped sessions) — replace it (fix, re-review #3).
        streamRef.current.controller.abort();
        streamRef.current = null;
      }
      if (streamOpenRef.current) {
        if (streamOpenRef.current.sessionId === sessionId) return streamOpenRef.current.promise;
        streamOpenRef.current.cancel();
        streamOpenRef.current = null;
      }
      let cancelledByReplacement = false;
      const isStale = () => cancelledByReplacement || epoch !== streamEpochRef.current;
      const opening = (async () => {
        const controller = new AbortController();
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${AGENTS_SESSION_URL}/${sessionId}/stream`, { headers, signal: controller.signal });
        if (isStale()) {
          // Chat switched (or this open was replaced) while the fetch was
          // pending — the cleanup's abort was a no-op (controller wasn't
          // published yet). Kill the late connection and refuse to feed
          // the current chat's state.
          controller.abort();
          throw new HttpError("session stream superseded", 0);
        }
        if (!res.ok || !res.body) throw new HttpError(`session stream failed (${res.status})`, res.status);
        streamRef.current = { sessionId, controller };
        void consumeStream(sessionId, res, isStale).finally(() => {
          if (streamRef.current?.controller === controller) streamRef.current = null;
        });
      })();
      // Same self-identity check as streamRef above: an old instance's
      // finally must not null out a NEWER instance's pending entry
      // (possible after a chat switch/replacement already replaced it).
      const entry = {
        sessionId,
        cancel: () => {
          cancelledByReplacement = true;
        },
        promise: undefined as unknown as Promise<void>,
      };
      entry.promise = opening.finally(() => {
        if (streamOpenRef.current === entry) streamOpenRef.current = null;
      });
      streamOpenRef.current = entry;
      return entry.promise;
    },
    [consumeStream],
  );

  // Reconnect eagerly when a chat with a cached session loads: a turn or a
  // pending approval may already be in flight from before a reload (best
  // effort only — `input.requested` is a live-only event with no replay, so
  // a pending approval from before this reload cannot be recovered here; the
  // server's own approvalTimeoutMs eventually resolves it as "timed out" —
  // see task-u2-report.md's residual-risk note. Ordinary in-progress text
  // and tool-call/result events DO replay correctly).
  useEffect(() => {
    // Stable-identity snapshot for the cleanup (the gate object is created
    // once per hook instance and never replaced) — satisfies the
    // ref-in-cleanup lint rule without changing behavior.
    const gate = sendGateRef.current;
    if (chatId) {
      const cached = loadCachedSessionId(chatId);
      if (cached) {
        sessionIdRef.current = cached;
        ensureStreamOpen(cached, streamEpochRef.current).catch((err) => {
          if (err instanceof HttpError && err.status === 404) {
            // Stale cache (session row gone server-side): drop it now so the
            // next send() goes straight to fresh-session creation instead of
            // hitting its own 404-retry path.
            clearCachedSessionId(chatId);
            if (sessionIdRef.current === cached) sessionIdRef.current = null;
          } else {
            console.warn("useAgentsChat: reconnect failed", err);
          }
        });
      } else {
        sessionIdRef.current = null;
      }
    }
    return () => {
      // Supersede FIRST (see streamEpochRef): any instance whose fetch is
      // still pending — for which the abort below is a no-op — must see the
      // epoch bump when it resolves and refuse to attach/consume. The LIVE
      // ref is mutated on purpose (a counter, not a DOM node — the lint
      // rule's stale-snapshot concern is exactly the behavior wanted here).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      streamEpochRef.current++;
      streamRef.current?.controller.abort();
      streamRef.current = null;
      streamOpenRef.current = null;
      // A pending post-turn watchdog belongs to the OLD chat's send.
      if (watchdogRef.current != null) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      // A send() in flight for the OLD chat must not keep the NEW chat's
      // input disabled (its own paths skip state writes once stale).
      gate.release();
      setSendPending(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // `streaming` (what the UI's send/cancel toggle keys on) covers BOTH the
  // server-acknowledged turn (turnActive, flips on turn.started) AND the
  // client-side window before that ack (sendPending, mirrors the gate) — so
  // the send button disables the moment send() is called, not a network
  // round-trip later.
  const streaming = sessionState.turnActive || sendPending;

  // Gate hand-off FALLBACK only (re-re-review #1): the authoritative release
  // is the imperative call in consumeStream's per-line loop — this effect
  // cannot be relied on because React batching can collapse a same-chunk
  // turn.started + turn.completed into a render where turnActive never
  // appears true (see releaseSendGate's comment). Kept because it is free,
  // idempotent, and still covers state transitions that arrive via renders
  // (e.g. send()'s own catch setting turnError).
  useEffect(() => {
    if (sessionState.turnActive || sessionState.turnError) {
      releaseSendGate();
    }
  }, [sessionState.turnActive, sessionState.turnError, releaseSendGate]);

  const send = useCallback(
    (prompt: string, context?: { visualEdit?: VisualEditContext; selectedComponents?: SelectedComponent[] }) => {
      if (!chatId || streaming) return;
      // Fix (review): synchronous double-submit guard — check-and-set BEFORE
      // any await (and before the optimistic state writes below), so a
      // second same-tick call (double-click/double-Enter) bails here even
      // though `streaming` hasn't re-rendered yet. React-state guards alone
      // leave the whole session-create + stream-open + POST window open.
      if (!sendGateRef.current.tryAcquire()) return;
      setSendPending(true);
      // This send's `superseded` marker (same epoch as the stream instances):
      // if the user switches chats while this send's network work is in
      // flight, NO path — success or failure — may touch the shared refs
      // (sessionIdRef/streamRef) or write into the NEW chat's state
      // (fix, re-review #1: the first version only checked in the outer
      // catch, so a stale send's success path could claim sessionIdRef for
      // chat A's session while chat B was showing, streaming A's turn into
      // B's UI and pointing B's next send at A's session).
      const epoch = streamEpochRef.current;
      const isStale = () => epoch !== streamEpochRef.current;
      const note = buildContextNote(context);
      const text = note ? `${note}${prompt}` : prompt;
      setPersistError(null);
      api.createMessage(chatId, { role: "user", content: text }).catch((err) => {
        console.error("useAgentsChat: failed to persist user message:", err);
        // Epoch-guarded like every other late write in this pipeline (fix,
        // re-re-review #2): if the user switched chats before this persist
        // settled, the failure belongs to the OLD chat — console only, never
        // the new chat's UI.
        if (isStale()) return;
        setPersistError("Message sent but failed to save to chat history.");
      });
      setSessionState((prev) => ({
        ...prev,
        turnError: null,
        messages: [...prev.messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }],
      }));

      // Created WITHOUT `message` on purpose: the stream must be subscribed
      // BEFORE the turn starts (see consumeStream's comment) — creating-
      // with-message would race the fire-and-forget turn against our
      // not-yet-open GET stream.
      const createSession = async (): Promise<string> => {
        const res = await fetch(AGENTS_SESSION_URL, { method: "POST", headers: authHeaders(), body: "{}" });
        if (!res.ok) throw new HttpError(`session create failed (${res.status})`, res.status);
        const body = await res.json();
        const id = body.sessionId as string;
        // Epoch check BEFORE the ref writes (fix, re-review #1): a chat
        // switch during the fetch must not let the OLD chat's new session
        // claim sessionIdRef (and be cached under the OLD chatId while the
        // refs now serve the new chat). The just-created row is an orphan —
        // harmless server-side (no turn ran, nothing streams client-side;
        // same footprint as /chat's per-request observability sessions).
        if (isStale()) throw new HttpError("send superseded by chat switch", 0);
        sessionIdRef.current = id;
        saveCachedSessionId(chatId, id);
        return id;
      };
      const postTurn = async (sessionId: string): Promise<void> => {
        // Pass OUR epoch (fix, re-review #1): a stale send must not let
        // ensureStreamOpen self-capture a fresh epoch and open a stream
        // that considers itself current.
        await ensureStreamOpen(sessionId, epoch);
        // Re-check before the message POST: past this point the server
        // starts a real turn — a stale send must not commit the OLD chat's
        // message to a turn nobody is watching from the visible chat.
        if (isStale()) throw new HttpError("send superseded by chat switch", 0);
        const res = await fetch(`${AGENTS_SESSION_URL}/${sessionId}`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ message: text, metadata: metadataRef.current }),
        });
        if (!res.ok) throw new HttpError(`send failed (${res.status})`, res.status);
      };

      void (async () => {
        try {
          const existing = sessionIdRef.current;
          if (existing) {
            try {
              await postTurn(existing);
            } catch (err) {
              // Fix (review): stale cached session id (agents.sessions row
              // gone server-side, e.g. wiped DB behind a browser that kept
              // localStorage) — recover transparently with ONE retry on a
              // fresh session instead of surfacing "send failed (404)".
              // Staleness gates the retry too (fix, re-review #1): a
              // superseded send must not clear the cache / abort the stream
              // / create a session on behalf of a chat it no longer serves
              // — rethrow instead, the outer catch bails silently.
              if (!isStale() && err instanceof HttpError && err.status === 404) {
                clearCachedSessionId(chatId);
                sessionIdRef.current = null;
                streamRef.current?.controller.abort();
                streamRef.current = null;
                await postTurn(await createSession());
              } else {
                throw err;
              }
            }
          } else {
            await postTurn(await createSession());
          }
          // Fix (re-review #2): the POST was accepted — arm the watchdog
          // for the turn's first sign of life. Cleared by the
          // turnActive/turnError effect, cancel(), and the chat-switch
          // cleanup; checks the gate at fire time because a released gate
          // means turn.started/turn.failed already handled the hand-off.
          if (isStale()) return;
          if (watchdogRef.current != null) clearTimeout(watchdogRef.current);
          watchdogRef.current = window.setTimeout(() => {
            watchdogRef.current = null;
            if (epoch !== streamEpochRef.current) return;
            if (!sendGateRef.current.held) return;
            sendGateRef.current.release();
            setSendPending(false);
            setSessionState((prev) => ({ ...prev, turnError: "no response from agent — try again" }));
          }, TURN_ACK_WATCHDOG_MS);
        } catch (err) {
          // Superseded by a chat switch: the cleanup already released the
          // gate for the new chat; don't write this stale send's error into
          // the new chat's state.
          if (isStale()) return;
          sendGateRef.current.release();
          setSendPending(false);
          console.error("useAgentsChat: send failed:", err);
          setSessionState((prev) => ({ ...prev, turnError: err instanceof Error ? err.message : "send failed" }));
        }
      })();
    },
    [chatId, streaming, ensureStreamOpen],
  );

  // No server-side turn-cancellation endpoint exists on the session API
  // (startTurn is fire-and-forget, unlike /chat's request-scoped stream) —
  // this can only stop the CLIENT from watching the turn, not the turn
  // itself. Documented gap, not a bug: see task-u2-report.md's evidence
  // table ("risk" row).
  const cancel = useCallback(() => {
    streamRef.current?.controller.abort();
    streamRef.current = null;
    // Also frees a send whose turn.started never arrived (e.g. stream died
    // right after the POST was accepted) — the cancel button is reachable
    // precisely because sendPending keeps `streaming` true in that state.
    releaseSendGate();
    setSessionState((prev) => ({ ...prev, turnActive: false }));
  }, [releaseSendGate]);

  const respondToConsent = useCallback(
    async (decision: "allow" | "deny" | "always") => {
      const sessionId = sessionIdRef.current;
      const pending = sessionState.pendingApproval;
      if (!sessionId || !pending) return;
      const wire = decision === "allow" ? "approve" : decision;
      setConsentError(null);
      try {
        const res = await fetch(`${AGENTS_SESSION_URL}/${sessionId}/approval`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ requestId: pending.requestId, decision: wire }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setConsentError(body?.error ?? `approval failed (${res.status})`);
          return;
        }
        // The already-open stream's next `action.result` clears
        // pendingApproval (see reduceSessionEvent) — no local mutation
        // needed here beyond letting the live tail do its job.
      } catch (err) {
        console.error("useAgentsChat: approval decision failed:", err);
        setConsentError(err instanceof Error ? err.message : "approval failed");
      }
    },
    [sessionState.pendingApproval],
  );

  const answerQuestionnaire = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!chatId || !sessionState.questionnaire) return;
      try {
        await api.answerQuestionnaire(chatId, sessionState.questionnaire.requestId, answers);
        setSessionState((prev) => ({ ...prev, questionnaire: null }));
      } catch (err) {
        console.error("useAgentsChat: failed to send questionnaire answers:", err);
        setSessionState((prev) => ({ ...prev, questionnaire: null }));
        throw err;
      }
    },
    [chatId, sessionState.questionnaire],
  );

  // Legacy-shaped Message[] mirror — ChatInput's useTokenCount only needs
  // {content}, so an exact interleave-position round trip isn't required
  // here (unlike the live rendering path, see AgentsChatMessage.tsx).
  const legacyMessages = useMemo(
    () => sessionState.messages.map((m) => uiMessageToLegacyMessage(chatId ?? "", m)),
    [sessionState.messages, chatId],
  );

  const consentRequest: ConsentRequest | null = sessionState.pendingApproval;
  useEffect(() => {
    if (consentRequest) setConsentError(null);
    // Only the identity of the pending request matters here, not the whole
    // (freshly-derived-every-render) object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentRequest?.requestId]);

  return {
    uiMessages: sessionState.messages,
    legacyMessages,
    loading,
    streaming,
    error: persistError ?? sessionState.turnError,
    todos: sessionState.todos,
    questionnaire: sessionState.questionnaire,
    planContent: sessionState.planContent,
    tokenUsage: sessionState.tokenUsage,
    buildActions: sessionState.buildActions,
    consentRequest,
    consentError,
    send,
    cancel,
    answerQuestionnaire,
    respondToConsent,
  };
}
