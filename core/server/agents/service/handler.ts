// HTTP surface per spec §6: eve session API (compat) + AI SDK chat endpoint.
// deno-lint-ignore-file no-explicit-any
import { convertToModelMessages, generateText, streamText, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { LoadedAgent } from "../loader.ts";
import { packOfSkillName } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import { runTurn } from "./runner.ts";
import { publish, subscribe, ndjsonEncode } from "./stream.ts";
import { buildSdkTools, buildSystemPrompt, resolveInstructions } from "./toolset.ts";
import { cacheProviderOptions, parseModelString, resolveModelForTurn, withSystemCachePoint } from "./model.ts";
import type { AgentEvent } from "./events.ts";
import type { HookCtx, QueryFn } from "../eve-shim/types.ts";
import { createChannelHandler, type ChannelSessionStarted } from "../channels/layer.ts";
import type { ChannelStore } from "../channels/store.ts";
import { resolveApprovalDecision } from "./approvals.ts";
import { handleOAuthCallback, handleOAuthStart } from "../connections/oauth/routes.ts";
import type { OAuthProviderDeps } from "../connections/provider.ts";
import { looksLikeGateResponse, matchGateText } from "../channels/gate-text.ts";
import { assembleHistory, ensureToolResultsPresent, type ModelMessage, type TurnRow } from "./context/history.ts";
import { estimatePrefixTokens, estimateTokens, type ContextConfig } from "./context/budget.ts";
import { maybeCompact } from "./context/compact.ts";
import { partitionTools } from "./context/toolsplit.ts";
import { SUMMARY_PREFIX } from "./context/prompts.ts";
import { createSpawnCapabilities, type SpawnCapabilities } from "./spawn.ts";

type EnvFn = (k: string) => string | undefined;

// OAuth broker wiring. index.ts builds this (a DEK-backed OAuthStore +
// the HMAC state secret) only when the worker has a root key; absent → oauth
// connections are skipped and the /oauth routes 404. Combines OAuthProviderDeps
// (threaded to the connection provider) with the routes' basePath.
export interface OAuthBrokerDeps extends OAuthProviderDeps {
  basePath: string;
}

interface Deps {
  agent: LoadedAgent;
  store: AgentStore;
  plugin: string;
  agentName: string;
  basePath: string;
  model?: any;
  // The worker's pg pool query fn, threaded through to hookCtx.sql —
  // index.ts passes the real pool query; tests inject a fake. Optional so
  // existing createHandler callers/tests that never configure a hook keep
  // working; a hook that actually calls ctx.sql without one configured
  // fails loudly at call time instead of silently no-oping.
  sql?: QueryFn;
  env?: EnvFn;
  // Channel layer. Optional so existing createHandler callers/tests
  // that never exercise channels keep working; when set, {basePath}/eve/v1/
  // <channelId>/* is dispatched to the channel layer (see the channel branch
  // below). channel routes are auth-exempt at the proxy — see plugin/agents.ts.
  channelStore?: ChannelStore;
  // Delivery-registration hook, threaded straight through to the layer.
  onSessionStarted?: (info: ChannelSessionStarted) => void;
  // OAuth broker. When set: the /eve/v1/oauth/<connector>/{start,callback}
  // consent routes are mounted (auth-exempt at the proxy, gated by signed state)
  // AND the connection provider gets the broker so kind:"oauth" connections
  // resolve/park tokens. Unset → those routes 404 and oauth connections skip.
  oauth?: OAuthBrokerDeps;
}

const defaultEnv: EnvFn = (k) => Deno.env.get(k);
const unconfiguredSql: QueryFn = () =>
  Promise.reject(new Error("agents: hookCtx.sql used but no sql query fn was configured for this handler"));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Rebuilds prior turns into the ai@6 ModelMessage[] shape streamText
// consumes. Fixes the defect where the model never saw what its own tool
// calls actually did: tool-call/tool-result steps are now replayed back into
// the request messages (assembleHistory), not just the turn's final text,
// and any tool-call left unresolved by an interrupted turn gets a synthetic
// result so the provider never rejects the request (ensureToolResultsPresent).
export async function buildHistory(sessionId: string, store: AgentStore, config: ContextConfig): Promise<ModelMessage[]> {
  const turns = await store.getHistory(sessionId);
  return ensureToolResultsPresent(assembleHistory(turns as TurnRow[], config));
}

// Maps a persisted `agents.steps` row back to the same wire vocabulary
// runner.ts emits live (events.ts), so a stream replay and a live tail are
// indistinguishable to a client. "text" (the final concatenated assistant
// text plus the finishReason it ended with, persisted once per turn — see
// runner.ts's `finally` block) has no live per-delta equivalent in storage,
// so it replays as a single message.completed event (the event eve's own
// client actually reads the final reply off — see events.ts) rather than
// the incremental message.appended deltas eve's live stream would have
// shown; a replaying client never sees those deltas, only the final text.
export function stepToEvent(row: { turn_id: string; kind: string; name: string | null; payload: unknown; usage?: unknown }): unknown {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const turnId = row.turn_id;
  switch (row.kind) {
    case "tool-call":
      return { type: "actions.requested", data: { turnId, actions: [{ kind: "tool-call", callId: p.toolCallId, toolName: row.name, input: p.input }] } };
    case "client-tool-call":
      return { type: "actions.requested", data: { turnId, actions: [{ kind: "tool-call", callId: p.toolCallId, toolName: row.name, input: p.input, clientOnly: true }] } };
    case "tool-result":
      return { type: "action.result", data: { turnId, result: { kind: "tool-result", callId: p.toolCallId, toolName: row.name, output: p.output }, status: "completed" } };
    case "finish":
      return { type: "turn.completed", data: { turnId, finishReason: p.finishReason, usage: row.usage ?? {} } };
    case "error":
      return { type: "turn.failed", data: { turnId, message: p.message } };
    case "text":
      return { type: "message.completed", data: { turnId, message: p.text, finishReason: p.finishReason ?? "stop" } };
    case "custom":
      // ToolContext.emit's persisted step (runner.ts's toolEmit) — the
      // payload IS the data a tool passed to emit(name, data), not
      // necessarily an object, so read `row.payload` raw rather than the
      // `p` fallback above (which coerces null to `{}`, wrong for a tool
      // that legitimately emitted `null`/a primitive/an array).
      return { type: "tool.event", data: { name: row.name, payload: row.payload } };
    default:
      // "model" / "approval-request" steps are not currently persisted by
      // runner.ts — fall back to a passthrough so an unexpected kind is
      // still visible on the stream rather than silently dropped.
      return { type: row.kind, data: { turnId, name: row.name, ...p } };
  }
}

// Per-request context for the agent's resolveModel/buildInstructions hooks —
// built fresh on every call, never cached. `userId` must come from the caller's
// x-user-id-derived value only (never metadata, which is client-supplied
// request payload) — see createHandler's createdBy.
function buildHookCtx(deps: Deps, sessionId: string, metadata: unknown, bearerToken: string | undefined, userId: string | undefined): HookCtx {
  return {
    sessionId, bearerToken, userId, metadata,
    // OAuth broker principal: a native session's end-user principal IS
    // its x-user-id. A channel session (no x-user-id) leaves this undefined, so
    // a user-scoped oauth connection fails closed (principal_required) until the
    // channel principal is threaded here — see the report's follow-up note.
    principal: userId ? { principalType: "user", principalId: userId } : undefined,
    env: deps.env ?? defaultEnv,
    sql: deps.sql ?? unconfiguredSql,
  };
}

// The connection-provider opts for a turn: the OAuth broker deps
// when configured, so kind:"oauth" connections resolve/park tokens. Built fresh
// per call; undefined when no broker is wired (oauth connections then skip).
function connectionOptsFor(deps: Deps) {
  return deps.oauth ? { oauth: deps.oauth } : undefined;
}

// Used both as the lazy-reap cutoff below (startTurn, fired on-message) and,
// re-exported, as the periodic sweep's cutoff (service/index.ts wires
// service/sweep.ts's startStaleTurnSweep with this same constant). A session
// nobody messages again after it gets stuck would never hit the lazy path
// below; the sweep is what actually recovers it — see sweep.ts's header.
//
// Defined in ./turn-lifetime.ts so plugin/agents.ts can size the worker's
// lifetime to it without importing this module's graph (`ai`, loader, runner).
// Re-exported here because existing callers import it from handler.ts.
export { HEARTBEAT_STALE_MS, STALE_TURN_MS } from "./turn-lifetime.ts";
import { HEARTBEAT_STALE_MS, STALE_TURN_MS } from "./turn-lifetime.ts";
import { startTurnHeartbeat } from "./heartbeat.ts";
import { notifyReaped } from "./reap-notify.ts";

// A turn's `message` column (and the follow-up queue) both want a plain
// string; non-string messages (only possible on the native /eve/v1/session
// routes, which accept arbitrary JSON) are stringified the same way
// runner.ts's own userContent conversion does.
const asText = (m: unknown): string => typeof m === "string" ? m : JSON.stringify(m);

function startTurn(
  deps: Deps,
  sessionId: string,
  message: unknown,
  metadata: unknown,
  bearerToken?: string,
  userId?: string,
  onTurnCreated?: (turnId: string) => void,
  // Set only by a child session's very first turn (see spawn.ts's
  // spawnChild / createSpawnCapabilities' startChildTurn below) — the
  // parent's forked history slice, seeded directly since a brand-new child
  // session has no persisted turns of its own for buildHistory to assemble
  // from.
  seedHistory?: ModelMessage[],
) {
  // Fire and forget: the turn streams via publish(); errors land as error
  // events + failed turn status, never as unhandled rejections.
  (async () => {
    // "One turn at a time per session". 43 of 263 real turns (16%) started
    // while the previous turn on the same session was still running — in one
    // case two turns drove the same coding-agent chat 22s apart with
    // contradictory instructions, and the coder acted on the wrong one. A
    // message that arrives while a turn is still running is queued instead of
    // started as a second, concurrent turn; startTurn is the single choke point
    // every caller (channel adapters via layer.ts's send(), and native
    // /eve/v1/session[/:id]) goes through, so this check covers all of them.
    //
    // Not airtight: the window between this getRunningTurn read and the
    // addTurn write below is check-then-act, not a DB-level lock, and it is
    // NOT millisecond-scale. Awaited between the two: takeFollowUps,
    // getHistory, getLastTurnUsage, and — whenever the session is over the
    // compaction threshold — a whole generateText summarization call plus
    // the addStep that persists its checkpoint and a second getHistory to
    // re-read it. So the window spans several network round trips on an
    // ordinary turn and a full model call on a compacting one; it has grown
    // since this comment was first written, not shrunk. A webhook
    // redelivery or a genuine double-submit landing in that window can still
    // both pass the check. A
    // DB-level uniqueness guard (e.g. a partial unique index on
    // agents.turns(session_id) WHERE status = 'running') would close this
    // fully but is out of scope for this round — kept as check-then-act on
    // purpose (see the report).
    let running = await deps.store.getRunningTurn(sessionId);
    if (running) {
      // Lazy reaping, not a scheduler — this repo has none to invent into.
      // Serialization means a turn stuck `running` forever (a worker
      // crash/redeploy mid-turn — the same 21-turn defect reapStaleTurns
      // exists for) now wedges every LATER message on that session too, not
      // just races one. Rather than adding a scheduler, reap on the way in:
      // if the running turn is actually stale, this marks it failed and
      // clears it, so the message below proceeds as a normal turn instead of
      // being queued behind a zombie forever. A genuinely live turn is
      // untouched (the cutoff only matches turns older than it) and falls
      // through to the queue exactly as before.
      //
      // This runs on EVERY message that lands on a busy session, so a
      // transient reap/re-read failure here is a real failure mode, not
      // hypothetical. It must not escape to the outer
      // "turn crashed" catch below (no turn was ever created on this path —
      // same reasoning as the queueFollowUp catch a few lines down) and it
      // must not silently drop the incoming message either. Degrade to the
      // safe assumption instead: keep treating the session as busy (the
      // `running` value already read above), log distinctly, and fall
      // through to the queue branch so the message still gets queued and
      // still gets acknowledged.
      try {
        const reaped = await deps.store.reapStaleTurns(sessionId, STALE_TURN_MS, HEARTBEAT_STALE_MS);
        running = await deps.store.getRunningTurn(sessionId);
        // The lazy path used to reap in total silence: the turn just vanished,
        // and the human — who had already been waiting on it — got no hint
        // that anything had gone wrong or that their message was now driving a
        // fresh turn. publish() cannot carry this: no delivery is registered
        // for THIS message's turn yet (registerForTurn runs after addTurn,
        // further down), so the event would go to no subscriber.
        if (reaped.length > 0) await notifyReapedForSession(deps, sessionId, reaped);
      } catch (e) {
        console.error(`agents: stale-turn reap failed for session ${sessionId} (treating session as busy):`, e);
      }
    }
    if (running) {
      // A pending approval gate keeps its turn `status='running'` for the whole
      // approval poll (up to 30 minutes). A QUALIFIED reply to that gate — e.g.
      // "yes but first explain why the chunk count is wrong" — is not a bare
      // yes/no, so matchGateText correctly returns null (see gate-text.ts) and
      // a pre-checking caller (discord.ts's tryResolveGate) falls through to
      // here with the gate STILL pending. Queueing that reply behind the very
      // gate it answers stalls the thread for the rest of the poll, with
      // neither side able to move — the human is waiting on the queued reply to
      // be seen, and the running turn is waiting on a click that will never
      // come because the human already replied in words. Deny the pending gate
      // so the parked awaitApproval returns immediately and the coder revises;
      // the reply queued just below rides the very next turn as that revision's
      // driving instruction, matching the skill's existing "Deny -> relay the
      // team's changes, have the coder revise, gate again" semantics
      // (facilitate-coding-task.md).
      //
      // Deliberately narrow: only a gate the incoming text does NOT already
      // match is denied here. A caller that never pre-checks the gate (only
      // discord.ts does today) can still land here with matching text (e.g.
      // a bare "approve" on a channel with no pre-check) — that text is left
      // for the existing queue/fold path exactly as before; this fix does
      // not add gate resolution for callers that opted out of it.
      //
      // asText(message) here is the message the channel adapter actually
      // composed — for Discord (the only
      // adapter that reaches this path) that's always a `<discord_context>`
      // block plus the human's words (adapters/discord.ts's sendToThread),
      // so matchGateText(asText(message), ...) is essentially ALWAYS null —
      // decision or not. Denying on that alone turned any thread chatter
      // ("fyi @alice is out today", a stray emoji) into an auto-deny.
      // looksLikeGateResponse (gate-text.ts) strips the composed wrapper and
      // asks the narrower question: do the human's actual words look like
      // they're answering the gate at all? Only deny when BOTH hold: the
      // composed text isn't a clean resolution (matchGateText -> null) AND
      // the underlying words plausibly are about the gate.
      let deniedPendingGate = false;
      try {
        const pending = await deps.store.getSinglePendingApproval(sessionId);
        if (
          pending && matchGateText(asText(message), pending.options) === null &&
          looksLikeGateResponse(asText(message), pending.options)
        ) {
          const resolved = await resolveApprovalDecision(
            deps.store,
            sessionId,
            { requestId: pending.requestId, decision: "deny" },
            { plugin: deps.plugin, agentName: deps.agentName, userId },
          );
          deniedPendingGate = resolved.ok;
        }
      } catch (e) {
        // Never let a pending-gate check failure escape to the outer "turn
        // crashed" catch (no turn was created/touched on this path) or block
        // the queue write below — degrade to "queue without resolving",
        // same posture as the reap-failure branch above.
        console.error(`agents: pending-gate check failed for session ${sessionId} (queueing without resolving):`, e);
      }
      try {
        await deps.store.queueFollowUp(sessionId, asText(message));
        // Queued messages previously vanished with no acknowledgement until
        // the next turn happened to fold them in. message.queued is a
        // turn-agnostic trex extension to the event
        // vocabulary (same pattern as session.waiting/session.failed in
        // events.ts — live-only, not persisted/replayed) so it reaches
        // whichever channel delivery subscription is already live for this
        // session's running turn (delivery.ts passes through any event with
        // no turnId to every active subscriber). The Discord adapter turns
        // it into a one-line reply (see discord.ts's builtinEvents) rather
        // than a message reaction, since the original Discord message id
        // isn't threaded through session state to react to. `deniedPendingGate`
        // lets that ack say what actually happened instead of always
        // implying the ball is still in the running turn's court.
        publish(sessionId, { type: "message.queued", data: { text: asText(message), deniedPendingGate } });
      } catch (e) {
        // Distinct from the "turn crashed" catch below: no turn was ever
        // created on this path, so that wording would misdescribe a queue
        // write failure as a turn failure.
        console.error(`agents: follow-up queue write failed for session ${sessionId} (message dropped):`, e);
      }
      return;
    }

    // Fold in anything queued while an earlier turn on this session was
    // running (see above) — it rides along with this turn's message instead
    // of racing it as a separate turn. Ordinary case (nothing queued) is a
    // no-op DB round trip that leaves `message` untouched.
    //
    // `queued` items arrived and were queued BEFORE this call's `message`
    // (they were queued behind a
    // turn that has since finished or failed; `message` is what just
    // triggered THIS startTurn call, chronologically after all of them) —
    // store.ts's takeFollowUps docstring promises "in the order they
    // arrived", so they must lead, not trail.
    const queued = await deps.store.takeFollowUps(sessionId);
    const turnMessage = queued.length > 0 ? [...queued, asText(message)].join("\n\n") : message;

    // Built once, up front, so both the pre-turn compaction call below and
    // the real turn's runTurn call (further down) share the same per-request
    // hookCtx — resolveModel/buildInstructions hooks are meant to be called
    // fresh per REQUEST, not per model resolution within it.
    const hookCtx = buildHookCtx(deps, sessionId, metadata, bearerToken, userId);

    // Pre-turn compaction (task 12; see compact.ts's maybeCompact for the
    // full rationale). Deliberately PRE-turn only — never mid-stream, since a
    // mid-turn summary would have to be injected above the last user message
    // or the model misreads it. Cheap no-op on the common case: an empty or
    // comfortably-under-budget session short-circuits inside maybeCompact
    // without ever calling a model.
    const priorTurns = (await deps.store.getHistory(sessionId)) as TurnRow[];
    // Assembled ONCE and reused as this turn's `history` on the common path.
    // The compaction check needs the assembled messages anyway (to size the
    // estimate fallback and the tokensBefore/tokensAfter payload), and the
    // turn needs exactly the same messages — running getHistory +
    // assembleHistory + ensureToolResultsPresent twice per turn bought
    // nothing. Only a compaction that actually persisted a checkpoint makes
    // this stale, and that path re-fetches below.
    let history: ModelMessage[] = ensureToolResultsPresent(
      assembleHistory(priorTurns, deps.agent.config.context),
    );
    // A brand-new child session has no persisted turns of its own (priorTurns
    // is always [] here), so this can never clobber a session's real history.
    if (seedHistory && seedHistory.length > 0) history = seedHistory;
    let compacted = false;
    if (priorTurns.length > 0) {
      const priorMsgs = history;
      const lastUsage = await deps.store.getLastTurnUsage(sessionId).catch((e) => {
        console.error(`agents: getLastTurnUsage failed for session ${sessionId} (falling back to an estimate):`, e);
        return null;
      });
      // parseModelString throws on anything not "provider/model-id" shaped.
      // This whole pre-turn block runs before addTurn, with no enclosing
      // try/catch of its own — it's covered only by the outer fire-and-forget
      // IIFE's `.catch(... "turn crashed" ...)`, which produces no
      // turn.failed/session.failed (see that catch's own comment below), so
      // a malformed static config.model would silently hang every /stream
      // reader on this session instead of failing the turn gracefully the
      // way it used to inside runTurn. Degrade to "" (same as the
      // config.model-absent case) — resolveContextWindow("") falls back to
      // the conservative FALLBACK_CONTEXT_WINDOW — and log it so it's
      // diagnosable.
      let modelId = "";
      try {
        if (deps.agent.config.model) modelId = parseModelString(deps.agent.config.model).modelId;
      } catch (e) {
        console.error(
          `agents: could not parse agent model "${deps.agent.config.model}" for session ${sessionId} (using the conservative fallback context window):`,
          e,
        );
      }
      // The system-prompt + tool-schema term the estimate fallback was
      // missing. maybeCompact applies it to the estimate only (the observed
      // count already includes both); it is computed unconditionally anyway
      // because the tokensAfter figure below is always an estimate and so
      // always needs it, and a before/after pair measured two different ways
      // is not a pair.
      //
      // Every input here is already resolved, in memory, and synchronous:
      // buildSystemPrompt is string concatenation over agent.instructions +
      // agent.skills + metadata, agent.tools was populated at load time, and
      // partitionTools is a single pass. NOTHING is awaited, deliberately —
      // this block sits inside the check-then-act window documented at the
      // getRunningTurn read above, and that window must not grow again. The
      // cost of that constraint is a floor rather than an exact figure
      // (see estimatePrefixTokens): a buildInstructions hook's output and the
      // dynamic/connection/built-in tools are all behind an await and stay
      // uncounted. Under-counting by less is the whole improvement here;
      // under-counting by nothing would cost a wider race.
      const prefixTokens = estimatePrefixTokens(
        buildSystemPrompt(deps.agent, metadata),
        // Deferred tools are withheld from the request unless activated, so
        // the core partition is what actually ships. `activated` is passed
        // empty rather than read: getActivatedTools is an awaited round trip
        // (it happens after addTurn, below) and pulling it up here to sharpen
        // an estimate is exactly the widening this comment rules out.
        partitionTools(deps.agent.tools, [], deps.agent.config.context.deferredTools).core,
      );
      const outcome = await maybeCompact({
        turns: priorTurns,
        msgs: priorMsgs,
        config: deps.agent.config.context,
        modelId,
        observedInputTokens: lastUsage?.inputTokens,
        prefixTokens,
        // Model resolution happens lazily, INSIDE callModel: a throw here
        // (a rejecting resolveModel hook, no credentials, a provider error)
        // rejects summarize() the exact same way a 502 mid-call would, which
        // maybeCompact's own catch turns into the drop-oldest-turns
        // fallback — so a broken model can never prevent that fallback from
        // still reclaiming budget, and (requirement 5) can never fail the
        // turn itself either.
        callModel: async (req) => {
          const model = deps.model ?? await resolveModelForTurn(deps.agent.config, hookCtx);
          const { text } = await generateText({ model, system: req.system, messages: req.messages as any });
          return text;
        },
        // The spec's error table requires a warning EVENT when summarization
        // fails, not just a log line: the drop fallback silently discards
        // turns the summary would have preserved, and the user is the only
        // one who can supply that context again. Published on the session
        // stream even though no turn exists yet (compaction is pre-turn) —
        // context.compacted is turn-agnostic for exactly this reason.
        emit: (e) => publish(sessionId, e),
      });
      if (outcome.compacted) {
        compacted = true;
        // The compaction step is attached to the LAST turn being replaced
        // (replacedTurnSeqTo), not to the new turn about to be created:
        // history.ts's assembleHistory resumes assembly right after the
        // newest turn carrying a "compaction" step, so attaching it there is
        // what makes the verbatimTurnsAfterCompaction window (the turns
        // AFTER this boundary) survive into the rebuilt history below,
        // instead of being discarded along with the replaced range.
        const boundaryTurn = priorTurns.find((t) => t.seq === outcome.replacedTurnSeqTo);
        if (boundaryTurn?.id) {
          // Both halves of the pair count the fixed prefix: the observed
          // value includes it already, and each estimate adds it explicitly.
          // Without that, tokensAfter measured a strictly smaller thing than
          // tokensBefore and the reported saving was inflated by the prefix.
          const tokensBefore = lastUsage?.inputTokens ?? (estimateTokens(JSON.stringify(priorMsgs)) + prefixTokens);
          // Local reconstruction of what assembleHistory will produce once
          // the step below is persisted and re-fetched — purely to size
          // tokensAfter for the payload; the actual `history` used to drive
          // this turn still comes from the real re-fetch further down.
          const keptTurns = priorTurns.slice(priorTurns.indexOf(boundaryTurn) + 1);
          const keptMsgs = ensureToolResultsPresent(assembleHistory(keptTurns, deps.agent.config.context));
          const afterMsgs: ModelMessage[] = outcome.summary
            ? [{ role: "user", content: SUMMARY_PREFIX + outcome.summary }, ...keptMsgs]
            : keptMsgs;
          await deps.store.addStep(
            boundaryTurn.id,
            boundaryTurn.steps.length + 1,
            "compaction",
            null,
            {
              summary: outcome.summary,
              replacedTurnSeqFrom: priorTurns[0].seq,
              replacedTurnSeqTo: outcome.replacedTurnSeqTo,
              tokensBefore,
              tokensAfter: estimateTokens(JSON.stringify(afterMsgs)) + prefixTokens,
            },
          ).catch((e) =>
            console.error(`agents: failed to persist compaction step for session ${sessionId} (continuing without it):`, e)
          );
        } else {
          console.error(
            `agents: compaction outcome had no matching turn for seq ${outcome.replacedTurnSeqTo} on session ${sessionId} — skipping persist`,
          );
        }
      }
    }

    // Re-fetched ONLY when compaction just persisted a checkpoint — that is
    // the single thing that can have invalidated the assembly done above,
    // and it goes through the same buildHistory path every other call uses,
    // so checkpoint-resume logic keeps exactly one implementation
    // (history.ts's assembleHistory). On every other turn the messages
    // assembled above are already exactly right.
    if (compacted) history = await buildHistory(sessionId, deps.store, deps.agent.config.context);
    const turn = await deps.store.addTurn(sessionId, turnMessage, metadata);
    // Surface the freshly-created turn id to the caller (the channel layer uses
    // it to scope its background delivery to THIS turn) BEFORE publishing any
    // event, so a subscriber registered here can't miss the turn's events.
    // Isolated: delivery registration runs synchronous adapter code
    // (buildChannelCtx). A throw there must NEVER abort the turn — otherwise the
    // IIFE unwinds before turn.started/runTurn and the turn dies with no
    // turn.failed/session.failed, hanging every /stream reader. Log and carry on.
    try {
      onTurnCreated?.(turn.id);
    } catch (e) {
      console.error(`agents: channel delivery registration failed for turn ${turn.id}:`, e);
    }
    publish(sessionId, { type: "turn.started", data: { turnId: turn.id, sequence: turn.seq } });
    // Task 15: whatever ToolSearch has activated on earlier turns of THIS
    // session, read fresh (never cached) so a tool activated last turn is
    // still visible this turn. Degrades to "none activated" on a read
    // failure — same posture as the getLastTurnUsage fallback above — rather
    // than failing a turn over a withheld-tool bookkeeping read.
    const activatedTools = await deps.store.getActivatedTools(sessionId).catch((e) => {
      console.error(`agents: getActivatedTools failed for session ${sessionId} (continuing with none activated):`, e);
      return [];
    });
    // Liveness stamp for as long as this turn runs. Without it the only signal
    // that a turn is still alive is `started_at`, so a worker killed mid-turn
    // (crash, redeploy, or the runtime's EarlyDrop at half of workerTimeoutMs)
    // leaves the row `running` and every later message on the session queued
    // behind it until the two-hour started_at cutoff.
    const heartbeat = startTurnHeartbeat(deps.store, turn.id);
    // Built fresh per turn (spawnChild forks THIS turn's parent history at
    // spawn time, and a spawned child's parent_turn_id is this turn's own
    // id — neither is known any earlier in this function). true: this
    // session is durable and gets revisited, so a detached child (Task 9+)
    // can be woken later — see buildSpawnCapabilities' own comment for why
    // /chat passes false here instead.
    const spawn = buildSpawnCapabilities(deps, sessionId, turn.id, true);
    // Depth, from DURABLE STATE (store.isChildSession), not a value threaded
    // down from spawn time — see toolset.ts's ToolBuildCtx.depth and
    // store.ts's isChildSession for why: a passed parameter would be
    // forgotten by a future spawn call site and lost entirely once a reaped
    // child turn is restarted by a different worker, while parent_session_id
    // cannot drift from the truth. This is what keeps a child structurally
    // unable to spawn its own children (the spec's wake-loop safety
    // argument depends on exactly this). Checked fresh on EVERY turn, not
    // cached: nothing here distinguishes a session's first turn from any
    // later one. A read failure is left to fail the turn (the catch below)
    // rather than guessed in either direction — this table was just written
    // to (addTurn, above) moments ago, and guessing 0 on a blip could let a
    // child spawn a grandchild for the one turn it guessed wrong.
    const depth = (await deps.store.isChildSession(sessionId)) ? 1 : 0;
    try {
      await runTurn({
        agent: deps.agent, sessionId, turnId: turn.id, history, message: turnMessage, metadata,
        store: deps.store, emit: (e) => publish(sessionId, e),
        model: deps.model, bearerToken, userId, hookCtx,
        plugin: deps.plugin, agentName: deps.agentName,
        connectionOpts: connectionOptsFor(deps),
        activatedTools,
        spawn,
        depth,
      });
      await deps.store.finishTurn(turn.id, "completed");
      // A follow-up may have been queued WHILE this turn ran (the
      // getRunningTurn check above only sees turns that existed before THIS
      // one started). Drain and run it immediately as the next turn — rather
      // than publishing session.waiting and waiting for some future message
      // to arrive and pick it up — so an instruction the user already sent
      // during the busy window is never silently stranded in the queue.
      // Reuses onTurnCreated so a channel's delivery still gets registered
      // for this follow-up turn.
      const followUps = await deps.store.takeFollowUps(sessionId);
      if (followUps.length > 0) {
        startTurn(deps, sessionId, followUps.join("\n\n"), metadata, bearerToken, userId, onTurnCreated);
        return;
      }
      // eve's client (t.send()/MessageResponse.result()) ends its per-turn
      // read on session.waiting/session.completed/session.failed, not
      // turn.completed — see events.ts. We have no multi-turn parking state,
      // so "turn completed" and "session parked, ready for the next message"
      // are the same moment for us.
      publish(sessionId, { type: "session.waiting", data: { wait: "next-user-message" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      publish(sessionId, { type: "turn.failed", data: { turnId: turn.id, message: msg } });
      await deps.store.finishTurn(turn.id, "failed", msg);
      publish(sessionId, { type: "session.failed", data: { sessionId, message: msg } });
    } finally {
      // Both exits stop the ticker: a turn that ended is no longer alive, and
      // a beat landing after finishTurn would be a lie. (store.heartbeatTurn's
      // `status = 'running'` guard makes that harmless, but leaving the timer
      // running would leak one per turn for the worker's whole lifetime.)
      heartbeat.stop();
    }
  })().catch((e) => console.error("agents: turn crashed:", e));
}

// Shared by every route that can delegate (the session/turn path above and
// /chat below) so there is exactly ONE wiring of ctx.spawn, and therefore
// exactly one implementation of delegation (toolset.ts's runAsChild) for the
// built-in `agent` tool to go through — see fix-round-1 in
// task-6-7-report.md for why a second, divergent implementation
// (the old in-process runSubagent, now deleted) was a bug factory: fork_turns
// honored on one route and silently ignored on the other, errors returned on
// one and thrown on the other, progress events differing between them.
//
// `allowDetached` is the one real difference between the two callers: the
// session path's session is durable and gets revisited (a later message, the
// periodic sweep, ...), so a detached child (Task 9's agent_spawn onward) can
// be woken later by something. /chat's session is created fresh per request
// and never revisited (COMPAT.md) — a detached child spawned from it would be
// silently orphaned, since nothing will ever poll or wake for its result. See
// spawn.ts's SpawnCapabilities.allowDetached for where this is actually
// enforced (spawnChild itself refuses a detached request when this is
// false — not just a "don't register the tool" convention a future built-in
// could get wrong).
function buildSpawnCapabilities(
  deps: Deps,
  sessionId: string,
  turnId: string,
  allowDetached: boolean,
): SpawnCapabilities {
  return createSpawnCapabilities({
    sessionId,
    turnId,
    plugin: deps.plugin,
    agent: deps.agentName,
    store: deps.store,
    config: deps.agent.config.context,
    allowDetached,
    startChildTurn: (o) => {
      // A named subagent's child turn must run under ITS OWN
      // instructions/tools/model, not the parent's — mirrors the
      // Object.hasOwn guard resolveTarget applies before a subagent name
      // ever reaches here (toolset.ts), repeated defensively so a bogus
      // value can never resolve through the prototype chain.
      const childAgent = o.subagent && Object.hasOwn(deps.agent.subagents, o.subagent)
        ? deps.agent.subagents[o.subagent]
        : deps.agent;
      if (o.subagent && childAgent === deps.agent) {
        console.error(
          `agents: spawnChild resolved an unknown subagent "${o.subagent}" on session ${sessionId} — running the child as a copy of the parent instead`,
        );
      }
      startTurn(
        { ...deps, agent: childAgent },
        o.sessionId,
        o.message,
        undefined,
        undefined,
        undefined,
        undefined,
        o.history,
      );
    },
  });
}

// Reap notifications need the agent's channel definitions and the channel
// store, both of which live on Deps — bridged here so startTurn's lazy path and
// index.ts's sweep can share one notifier (service/reap-notify.ts).
async function notifyReapedForSession(
  deps: Deps,
  sessionId: string,
  reaped: Array<{ id: string; metadata: unknown }>,
): Promise<void> {
  const channelStore = deps.channelStore;
  if (!channelStore) return;
  await notifyReaped(sessionId, reaped, {
    channels: deps.agent.channels ?? {},
    channelForSession: (id) => channelStore.channelForSession(id),
  });
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const { agent, store, basePath } = deps;

  // Channel dispatch is only wired when a channelStore is configured (index.ts
  // always sets one; unit tests that don't exercise channels leave it unset).
  const channelHandler = deps.channelStore
    ? createChannelHandler({
        agent,
        store,
        channelStore: deps.channelStore,
        plugin: deps.plugin,
        agentName: deps.agentName,
        basePath,
        // Channel sessions have no trex user, so no bearerToken/userId here.
        startTurn: (sessionId, message, metadata, onTurnCreated) =>
          startTurn(deps, sessionId, message, metadata, undefined, undefined, onTurnCreated),
        subscribe,
        env: deps.env,
        onSessionStarted: deps.onSessionStarted,
      })
    : undefined;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let path = url.pathname;
    // Anchor on basePath: the control server only proxies prefixed paths to
    // this worker, so an unprefixed path is never one of our routes.
    if (basePath) {
      if (!path.startsWith(basePath)) return json({ error: "not found" }, 404);
      path = path.slice(basePath.length);
    }
    if (!path.startsWith("/")) path = `/${path}`;
    const bearerToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || undefined;
    // The control-server proxy (plugin/function.ts) injects x-user-id from
    // the auth-context middleware for @trex-scoped plugins; carry it into
    // created_by so a session's owner is recoverable. Absent for
    // unauthenticated/d2e-style requests — createSession treats undefined
    // as NULL.
    const createdBy = req.headers.get("x-user-id") || undefined;

    // Pre-eve alias, kept for back-compat with existing callers/tests —
    // /eve/v1/health below is the eve-documented route (Targets: "the
    // runner polls /eve/v1/health, verifies /eve/v1/info").
    if (req.method === "GET" && path === "/healthz") {
      return json({ agent: deps.agentName, tools: Object.keys(agent.tools) });
    }

    if (req.method === "GET" && path === "/eve/v1/health") {
      return json({ status: "ok" });
    }

    if (req.method === "GET" && path === "/eve/v1/info") {
      // Matches eve's real `AgentInfoResultSchema` (extracted from
      // node_modules/eve/dist/src/client/agent-info-schema.js — the prose in
      // docs/concepts/sessions-runs-and-streaming.md undersells how strict
      // and deep this shape is; `eve eval`'s client validates the response
      // against this schema with zod and refuses to proceed on a mismatch).
      // Fields for slots we don't implement (channels/connections/hooks/
      // sandbox/schedules/workflow) are present but empty — see COMPAT.md.
      const toolInfo = (name: string, def: unknown) => {
        const d = def as { description?: string; clientOnly?: boolean; needsApproval?: boolean; execute?: unknown; inputSchema?: unknown };
        return {
          name, logicalPath: `tools/${name}.ts`, sourceKind: "module",
          description: d.description ?? "",
          // z.unknown() in eve's schema is still a required (non-optional)
          // key — a JSON-serialized `undefined` (an absent key) fails
          // validation, so this must always be present, even if the
          // underlying tool's inputSchema is a zod object we can't
          // JSON-serialize faithfully (fall back to `{}`).
          inputSchema: (d.inputSchema && typeof d.inputSchema === "object" && !("safeParse" in (d.inputSchema as object)))
            ? d.inputSchema
            : {},
          hasAuth: false, hasExecute: !!d.execute, hasModelOutputProjection: false,
          hasOutputSchema: false, origin: "authored" as const,
          replacesFrameworkTool: false, requiresApproval: !!d.needsApproval,
          // trex extension (additive, not in eve's AgentInfoResultSchema):
          // lets a frontend tell a client-rendered tool from a
          // server-executed one via /info, matching the clientOnly flag
          // carried on actions.requested (COMPAT.md divergence 8).
          clientOnly: !!d.clientOnly,
        };
      };
      const tools = Object.entries(agent.tools).map(([name, def]) => toolInfo(name, def));
      return json({
        kind: "eve-agent-info",
        version: 1,
        mode: "development",
        agent: {
          agentRoot: agent.dir,
          appRoot: agent.dir,
          name: deps.agentName,
          model: { id: agent.config.model ?? "unknown" },
        },
        capabilities: { devRoutes: false },
        channels: { authored: [], available: [], disabledFramework: [], framework: [] },
        connections: [],
        diagnostics: { discoveryErrors: 0, discoveryWarnings: 0 },
        hooks: [],
        instructions: {
          dynamic: [],
          static: { name: "instructions", logicalPath: "instructions.md", sourceKind: "static-file", markdown: agent.instructions },
        },
        sandbox: null,
        schedules: [],
        skills: {
          dynamic: [],
          static: agent.skills.map((s) => ({
            name: s.name, logicalPath: s.path, sourceKind: "module",
            description: s.description, markdown: s.content ?? "",
            // Provenance: which skills-plugin pack injected this skill
            // (null = hand-authored in the agent dir).
            pack: packOfSkillName(s.name),
          })),
        },
        subagents: {
          local: Object.entries(agent.subagents).map(([name, sub]) => ({
            name, logicalPath: sub.dir, sourceKind: "module",
            description: sub.instructions.slice(0, 200),
            entryPath: sub.dir, nodeId: name, rootPath: sub.dir,
            summary: {
              channels: 0, connections: 0, hooks: 0,
              instructions: true, schedules: 0,
              skills: sub.skills.length, tools: Object.keys(sub.tools).length,
            },
          })),
          total: Object.keys(agent.subagents).length,
        },
        tools: { authored: tools, available: tools, disabledFramework: [], dynamic: [], framework: [], reserved: [] },
        workflow: { enabled: false, toolName: "" },
        workspace: { resourceRoot: null, rootEntries: [] },
      });
    }

    if (req.method === "POST" && path === "/eve/v1/session") {
      const body = await req.json().catch(() => ({}));
      const sessionId = await store.createSession(deps.plugin, deps.agentName, createdBy);
      if (body.message != null) startTurn(deps, sessionId, body.message, body.metadata, bearerToken, createdBy);
      // eve returns separate sessionId/continuationToken handles (one owned by
      // the channel, one by the runtime — see COMPAT.md). We have no channel
      // layer, so continuationToken is the sessionId.
      return json({ sessionId, continuationToken: sessionId }, 200, { "x-eve-session-id": sessionId });
    }

    // Follow-up: POST /eve/v1/session/:id (eve's bare-id route, not our old
    // /message suffix — see COMPAT.md). Accepts `message` and/or
    // `inputResponses` (structured HITL answers, `{requestId, optionId}[]`);
    // `optionId` must be "approve"/"deny" — we don't implement ask_question,
    // so any other optionId is rejected.
    const bare = path.match(/^\/eve\/v1\/session\/([^/]+)$/);
    if (bare && req.method === "POST") {
      const [, sessionId] = bare;
      const session = await store.getSession(sessionId);
      if (!session) return json({ error: "session not found" }, 404);
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body.inputResponses)) {
        // Session-ownership check: a session with a known owner (created_by set
        // from x-user-id at creation) only lets that same owner resolve its
        // pending approvals — without this, any authenticated caller who learns
        // (sessionId, requestId) could resolve someone else's approval and,
        // with sticky always/never, accrue a durable consent on their behalf.
        // Anonymous sessions (created_by NULL) keep the pre-existing behavior:
        // anyone who has the sessionId can resolve. Checked once for the whole
        // batch, before any request in it is touched.
        if (session.created_by != null && session.created_by !== createdBy) {
          return json({ error: "approval can only be resolved by the session owner" }, 403);
        }
        for (const r of body.inputResponses) {
          if (!r?.requestId || !["approve", "deny", "always", "never"].includes(r.optionId)) {
            return json({ error: "inputResponses[].requestId and optionId (approve|deny|always|never) required" }, 400);
          }
          // Sticky verbs need an identity to key the consent on — see
          // resolveApprovalDecision. Anonymous sessions (no x-user-id) can
          // still approve/deny, just not stick the decision.
          if ((r.optionId === "always" || r.optionId === "never") && !createdBy) {
            return json({ error: "always/never decisions require an authenticated user" }, 400);
          }
          await resolveApprovalDecision(
            store,
            sessionId,
            { requestId: r.requestId, decision: r.optionId },
            { plugin: deps.plugin, agentName: deps.agentName, userId: createdBy },
          );
        }
      }
      if (body.message != null) startTurn(deps, sessionId, body.message, body.metadata, bearerToken, createdBy);
      else if (!Array.isArray(body.inputResponses)) return json({ error: "message or inputResponses required" }, 400);
      return json({ accepted: true }, 202);
    }

    // Additive convenience route (not part of eve's documented HTTP surface
    // — see COMPAT.md): resolve a single approval directly by requestId
    // instead of routing it through a follow-up `inputResponses` message.
    const approval = path.match(/^\/eve\/v1\/session\/([^/]+)\/approval$/);
    if (approval && req.method === "POST") {
      const [, sessionId] = approval;
      const session = await store.getSession(sessionId);
      if (!session) return json({ error: "session not found" }, 404);
      // Same session-ownership check as the inputResponses path above — see
      // that branch's comment.
      if (session.created_by != null && session.created_by !== createdBy) {
        return json({ error: "approval can only be resolved by the session owner" }, 403);
      }
      const body = await req.json().catch(() => ({}));
      if (!body.requestId || !["approve", "deny", "always", "never"].includes(body.decision)) {
        return json({ error: "requestId and decision (approve|deny|always|never) required" }, 400);
      }
      if ((body.decision === "always" || body.decision === "never") && !createdBy) {
        return json({ error: "always/never decisions require an authenticated user" }, 400);
      }
      const { ok } = await resolveApprovalDecision(
        store,
        sessionId,
        { requestId: body.requestId, decision: body.decision },
        { plugin: deps.plugin, agentName: deps.agentName, userId: createdBy },
      );
      return ok ? json({ resolved: true }) : json({ error: "unknown or already-decided request" }, 404);
    }

    const stream = path.match(/^\/eve\/v1\/session\/([^/]+)\/stream$/);
    if (stream && req.method === "GET") {
      const [, sessionId] = stream;
      const session = await store.getSession(sessionId);
      if (!session) return json({ error: "session not found" }, 404);
      // eve reconnects with ?startIndex=<count> (event-count cursor); we also
      // keep our own ?replayOnly=1 (skip the live tail — useful for tests and
      // the eval-runner fallback) as an additive extension. See COMPAT.md.
      const startIndex = Number(url.searchParams.get("startIndex") ?? "0") || 0;
      const replayOnly = url.searchParams.get("replayOnly") === "1";
      // Hoisted so the abort listener and the stream's cancel() (consumer
      // detached without an abort event) share the same unsubscribe.
      let unsub: (() => void) | undefined;
      const body = new ReadableStream({
        async start(controller) {
          // Subscribe to the live tail BEFORE awaiting listEvents(): if we
          // replayed first and subscribed after, an event published in
          // that window (between the listEvents query and the subscribe
          // call) would be lost — neither in the replay snapshot nor seen
          // live. Subscribing first means such an event lands in `buffer`
          // instead; it's flushed right after replay so output order stays
          // replay-then-live. See COMPAT.md's durability section for the
          // resulting (rare, harmless) at-least-once double-delivery case.
          let buffering = !replayOnly;
          const buffer: AgentEvent[] = [];
          if (!replayOnly) {
            unsub = subscribe(sessionId, (e) => {
              try {
                if (buffering) buffer.push(e);
                else controller.enqueue(ndjsonEncode(e));
              } catch { unsub?.(); }
            });
          }
          try {
            const past = (await store.listEvents(sessionId)).slice(startIndex);
            for (const ev of past) controller.enqueue(ndjsonEncode(stepToEvent(ev)));
          } catch (e) {
            // If replay fails, the subscriber registered above would leak
            // permanently in buffering mode (buffer growing on every
            // publish; the abort listener isn't attached yet and cancel()
            // never fires on an errored stream) — release it first, then
            // surface the failure to the consumer.
            unsub?.();
            controller.error(e);
            return;
          }
          if (replayOnly) { controller.close(); return; }
          // Flush anything that arrived live while we were awaiting
          // listEvents() — buffered events come after the replay snapshot,
          // preserving chronological order for the common case.
          buffering = false;
          for (const e of buffer) {
            try { controller.enqueue(ndjsonEncode(e)); } catch { unsub?.(); break; }
          }
          req.signal.addEventListener("abort", () => { unsub?.(); try { controller.close(); } catch { /* closed */ } });
        },
        cancel() { unsub?.(); },
      });
      return new Response(body, {
        headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache", connection: "keep-alive" },
      });
    }

    if (req.method === "POST" && path === "/chat") {
      // Stateless UIMessage chat for useChat frontends (Pythia). Persists a
      // session per request for observability, but history comes from the client.
      const body = await req.json().catch(() => ({}));
      if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: "messages[] required" }, 400);
      const sessionId = await store.createSession(deps.plugin, deps.agentName, createdBy);
      const turn = await store.addTurn(sessionId, body.messages.at(-1), body.metadata);
      // Same hooks as the session path: built fresh per request, never
      // cached — resolveModelForTurn/resolveInstructions apply
      // config.resolveModel/buildInstructions when configured.
      const hookCtx = buildHookCtx(deps, sessionId, body.metadata, bearerToken, createdBy);
      const model = deps.model ?? await resolveModelForTurn(agent.config, hookCtx);
      const system = await resolveInstructions(agent, body.metadata, hookCtx);
      // ai@6's convertToModelMessages is async (Promise<ModelMessage[]>) —
      // the brief assumed the v2-era sync signature. `deno check` rejected
      // passing the bare Promise as streamText's `messages`; awaiting it is
      // the only change, no effect on the endpoint contract.
      const modelMessages = await convertToModelMessages(body.messages);
      // /chat's emit channel — writes a `data-${name}` UIMessage part
      // interleaved into the SAME stream useChat consumes, AI SDK v6's
      // documented convention for custom data parts. Unlike the session
      // path (runner.ts's toolEmit), this is stream-only: no agents.steps
      // write, matching /chat's existing behavior of never persisting
      // tool-call/tool-result steps either (only the final "text" step, in
      // onFinish below) — /chat is the stateless per-request endpoint
      // (history comes from the client, not replay), so there is nothing to
      // replay a custom event into.
      //
      // Late-bound writer indirection: tools are built HERE, in the setup
      // phase, so a setup-time throw (a throwing filterTools hook, a broken
      // tool build) still rejects this route with an HTTP error exactly as it
      // did before this change — moving buildSdkTools inside the stream's
      // execute() would demote those to a 200 + in-stream SSE error frame. But
      // the writer that toolEmit needs to write to only exists inside execute()
      // — so toolEmit targets this rebindable slot instead, and execute()
      // points it at the real writer before any tool can run. An emit fired
      // before the stream opens is dropped silently — same fire-and-forget
      // posture as the rest of ToolContext.emit.
      let writeData: ((part: { type: `data-${string}`; data: unknown }) => void) | undefined;
      const toolEmit = (name: string, data: unknown) => {
        writeData?.({ type: `data-${name}`, data });
      };
      // Shared tool builder (same as the session runner). No emit/turnId here
      // for the approval AgentEvent channel, so needsApproval tools answer with
      // an "use the session API" error instead of hanging a stateless request.
      // Async (dynamic-tools.ts provider); hookCtx is the same one just used
      // for resolveModelForTurn/resolveInstructions above.
      //
      // No activatedTools read here, deliberately — unlike startTurn, which
      // reads what earlier turns of the SAME session activated. `sessionId`
      // above was created moments ago by this very request, so
      // getActivatedTools could only ever answer [] : a guaranteed-empty
      // round trip on every /chat call. buildSdkTools defaults to the same
      // [], so omitting it is behaviour-identical.
      //
      // The consequence is a real limitation, recorded in COMPAT.md:
      // ToolSearch on /chat still WRITES activated_tools, and nothing will
      // ever read it back, so a deferred tool cannot be reached on this
      // endpoint at all. Fixing that needs a session id the caller supplies
      // and reuses across requests — which is exactly the statelessness
      // /chat is defined by ("history comes from the client"), plus an
      // ownership check on a client-supplied id. Activation only takes
      // effect from the NEXT request, so nothing short of a client that
      // persists the id would help. There is no such client: the one
      // in-repo caller (devx's AGENTS_CHAT_URL) moved to the session API
      // and is now unreferenced.
      // false: /chat's session is created fresh per request and never
      // revisited — see buildSpawnCapabilities' own comment. The built-in
      // `agent` tool still works (spawnChild/awaitChild both run and
      // resolve inside THIS request, same as the session path), but a
      // detached child (Task 9's agent_spawn onward) would be orphaned, so
      // spawnChild refuses one outright.
      const spawn = buildSpawnCapabilities(deps, sessionId, turn.id, false);
      const tools = await buildSdkTools({
        agent, sessionId, metadata: body.metadata, bearerToken, userId: createdBy, model, store, hookCtx, toolEmit,
        plugin: deps.plugin, agentName: deps.agentName,
        connectionOpts: connectionOptsFor(deps),
        spawn,
      });
      // Switched from the bare `result.toUIMessageStreamResponse()` to
      // createUIMessageStream + writer.merge so ToolContext.emit has somewhere
      // to write on this path — a plain streamText UIMessage stream has no way
      // to interleave extra parts into itself; wrapping it in a writer-driven
      // stream does (confirmed against the installed ai@6.0.219 package:
      // `createUIMessageStream`/`createUIMessageStreamResponse` and
      // `UIMessageStreamWriter.write`/`.merge`). streamText stays inside
      // execute() (it IS the streaming phase); only the setup calls above run
      // before the stream so their failures keep the same HTTP-error semantics
      // as before.
      const uiStream = createUIMessageStream({
        execute: ({ writer }) => {
          writeData = (p) => writer.write(p);
          const result = streamText({
            model,
            // Same system cache-point wrap as runner.ts/toolset.ts (see
            // withSystemCachePoint in model.ts) — bedrock cachePoint /
            // anthropic cacheControl, no-op elsewhere.
            system: withSystemCachePoint(model, system),
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
            // Same openai prompt-cache routing as runner.ts, keyed by agent dir.
            providerOptions: cacheProviderOptions(model, agent.dir),
            onFinish: async ({ text, totalUsage }) => {
              await store.addStep(turn.id, 1, "text", null, { text }, totalUsage)
                .catch((e) => console.error("agents: chat persist failed:", e));
              await store.finishTurn(turn.id, "completed")
                .catch((e) => console.error("agents: chat persist failed:", e));
            },
          });
          // task-u1: attach usage to the finish part's messageMetadata so
          // /chat's stateless clients (useChat) can read token counts —
          // previously toUIMessageStream() was called with no options, so
          // the finish part shipped as bare {type:"finish",finishReason}
          // and totalUsage never reached the wire (it was only persisted to
          // agents.steps above, for observability). messageMetadata is
          // called on both "start" and "finish" TextStreamParts (ai@6's
          // UIMessageStreamOptions); only "finish" carries totalUsage.
          writer.merge(result.toUIMessageStream({
            messageMetadata: ({ part }) => part.type === "finish" ? { usage: part.totalUsage } : undefined,
          }));
        },
      });
      return createUIMessageStreamResponse({ stream: uiStream });
    }

    // OAuth consent routes: {basePath}/eve/v1/oauth/<connector>/{start,
    // callback}. EXEMPT from proxy auth (channelAuthExemptPattern excludes only
    // session|health|info|eve, so `oauth` falls through to the exemption) — a
    // provider's browser redirect carries no trex JWT; the signed `state` is the
    // sole authenticator (verified inside the handlers before any redirect or
    // token write). Matched BEFORE the channel branch so an agent that happens to
    // declare a channel named "oauth" can't shadow the broker. 404 when no broker
    // is configured (deps.oauth unset).
    const oauthM = path.match(/^\/eve\/v1\/oauth\/([^/]+)\/(start|callback)$/);
    if (oauthM && req.method === "GET") {
      if (!deps.oauth) return json({ error: "oauth not configured" }, 404);
      const [, connector, kind] = oauthM;
      const routeDeps = {
        connector,
        store: deps.oauth.store,
        secret: deps.oauth.secret,
        basePath,
        fetch: deps.oauth.fetch,
      };
      return kind === "start" ? handleOAuthStart(req, routeDeps) : handleOAuthCallback(req, routeDeps);
    }

    // Channel branch: {basePath}/eve/v1/{channelId}{routePath}, where
    // channelId is one of the agent's loaded channels (never `session`/`health`/
    // `info`, which the explicit routes above already handled). Served WITHOUT
    // the x-user-id/JWT the session/chat routes rely on: the proxy exempts these
    // subpaths from pluginAuthz (see plugin/agents.ts) and the adapter's own
    // signature verify() authenticates the caller inside the route handler. The
    // session/chat routes above are untouched — their proxy auth is unchanged.
    if (channelHandler) {
      const ch = path.match(/^\/eve\/v1\/([^/]+)(?:\/.*)?$/);
      // Object.hasOwn (not a truthy index): a request to /eve/v1/constructor/x
      // must NOT match an inherited prototype key — that would enter the layer
      // and 500 on undefined routes. Inherited/unknown keys fall through to the
      // final 404 below. The layer re-guards the same way as defense in depth.
      if (ch && Object.hasOwn(agent.channels, ch[1])) return channelHandler(req);
    }

    return json({ error: "not found" }, 404);
  };
}
