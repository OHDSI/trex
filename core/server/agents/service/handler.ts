// HTTP surface per spec §6: eve session API (compat) + AI SDK chat endpoint.
// deno-lint-ignore-file no-explicit-any
import { convertToModelMessages, streamText, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import { runTurn } from "./runner.ts";
import { publish, subscribe, ndjsonEncode } from "./stream.ts";
import { buildSdkTools, resolveInstructions } from "./toolset.ts";
import { resolveModelForTurn } from "./model.ts";
import type { AgentEvent } from "./events.ts";
import type { HookCtx, QueryFn } from "../eve-shim/types.ts";

type EnvFn = (k: string) => string | undefined;

interface Deps {
  agent: LoadedAgent;
  store: AgentStore;
  plugin: string;
  agentName: string;
  basePath: string;
  model?: any;
  // The worker's pg pool query fn, threaded through to hookCtx.sql (H1) —
  // index.ts passes the real pool query; tests inject a fake. Optional so
  // existing createHandler callers/tests that never configure a hook keep
  // working; a hook that actually calls ctx.sql without one configured
  // fails loudly at call time instead of silently no-oping.
  sql?: QueryFn;
  env?: EnvFn;
}

const defaultEnv: EnvFn = (k) => Deno.env.get(k);
const unconfiguredSql: QueryFn = () =>
  Promise.reject(new Error("agents: hookCtx.sql used but no sql query fn was configured for this handler"));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function historyForModel(store: AgentStore, sessionId: string): Promise<any[]> {
  // Rebuild prior turns as user/assistant text pairs. Tool traffic is
  // persisted in steps but replayed to the model as part of assistant text
  // context only in v1 (matches Pythia's stateless-chat semantics).
  const turns = await store.getHistory(sessionId);
  const msgs: any[] = [];
  for (const t of turns) {
    const m = t.message as any;
    msgs.push({ role: "user", content: typeof m === "string" ? m : JSON.stringify(m) });
    const textStep = (t.steps as any[]).find((s) => s.kind === "text");
    if (textStep?.payload?.text) msgs.push({ role: "assistant", content: textStep.payload.text });
  }
  return msgs;
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
function stepToEvent(row: { turn_id: string; kind: string; name: string | null; payload: unknown; usage?: unknown }): unknown {
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
      // H3: ToolContext.emit's persisted step (runner.ts's toolEmit) — the
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

// Per-request context for the agent's resolveModel/buildInstructions hooks
// (H1) — built fresh on every call, never cached. `userId` must come from
// the caller's x-user-id-derived value only (never metadata, which is
// client-supplied request payload) — see createHandler's createdBy.
function buildHookCtx(deps: Deps, sessionId: string, metadata: unknown, bearerToken: string | undefined, userId: string | undefined): HookCtx {
  return {
    sessionId, bearerToken, userId, metadata,
    env: deps.env ?? defaultEnv,
    sql: deps.sql ?? unconfiguredSql,
  };
}

// H4 (sticky tool-consent decisions — task-h4-brief.md): shared by both
// approval resolve sites — the standalone POST .../approval route and the
// inputResponses follow-up on POST /eve/v1/session/:id — so the two can't
// drift on what "always"/"never" mean. `decision` is the wire-level verb
// (approve|deny|always|never); `approve`/`deny` persist as-is (unchanged
// from pre-H4 behavior). `always`/`never` require an authenticated userId
// (no x-user-id header => 400, checked by the caller BEFORE calling this —
// see both call sites) and, once the pending request resolves, additionally
// upsert agents.tool_consents keyed on (userId, deps.plugin, deps.agentName,
// the approval's own tool — looked up via getApprovalTool since the
// approvals table doesn't carry plugin/agent). agents.approvals.decision's
// CHECK constraint stays approve/deny — the sticky verbs never reach it.
async function resolveApprovalDecision(
  deps: Deps,
  sessionId: string,
  requestId: string,
  decision: "approve" | "deny" | "always" | "never",
  userId: string | undefined,
): Promise<boolean> {
  const sticky = decision === "always" || decision === "never";
  const persistedDecision = sticky ? (decision === "always" ? "approve" : "deny") : decision;
  const ok = await deps.store.resolveApproval(requestId, persistedDecision, sessionId);
  if (ok && sticky) {
    // userId is guaranteed present here — callers 400 before reaching this
    // function when sticky is requested without one.
    const tool = await deps.store.getApprovalTool(requestId);
    if (tool) await deps.store.setToolConsent(userId!, deps.plugin, deps.agentName, tool, decision);
  }
  return ok;
}

function startTurn(deps: Deps, sessionId: string, message: unknown, metadata: unknown, bearerToken?: string, userId?: string) {
  // Fire and forget: the turn streams via publish(); errors land as error
  // events + failed turn status, never as unhandled rejections.
  (async () => {
    const history = await historyForModel(deps.store, sessionId);
    const turn = await deps.store.addTurn(sessionId, message, metadata);
    publish(sessionId, { type: "turn.started", data: { turnId: turn.id, sequence: turn.seq } });
    const hookCtx = buildHookCtx(deps, sessionId, metadata, bearerToken, userId);
    try {
      await runTurn({
        agent: deps.agent, sessionId, turnId: turn.id, history, message, metadata,
        store: deps.store, emit: (e) => publish(sessionId, e),
        model: deps.model, bearerToken, userId, hookCtx,
        plugin: deps.plugin, agentName: deps.agentName,
      });
      await deps.store.finishTurn(turn.id, "completed");
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
    }
  })().catch((e) => console.error("agents: turn crashed:", e));
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const { agent, store, basePath } = deps;

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
          await resolveApprovalDecision(deps, sessionId, r.requestId, r.optionId, createdBy);
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
      const body = await req.json().catch(() => ({}));
      if (!body.requestId || !["approve", "deny", "always", "never"].includes(body.decision)) {
        return json({ error: "requestId and decision (approve|deny|always|never) required" }, 400);
      }
      if ((body.decision === "always" || body.decision === "never") && !createdBy) {
        return json({ error: "always/never decisions require an authenticated user" }, 400);
      }
      const ok = await resolveApprovalDecision(deps, sessionId, body.requestId, body.decision, createdBy);
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
      // Same hooks as the session path (H1): built fresh per request, never
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
      // H3: /chat's emit channel — writes a `data-${name}` UIMessage part
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
      // tool build) still rejects this route with an HTTP error exactly as
      // it did pre-H3 — moving buildSdkTools inside the stream's execute()
      // would demote those to a 200 + in-stream SSE error frame. But the
      // writer toolEmit needs only exists inside execute() — so toolEmit
      // targets this rebindable slot instead, and execute() points it at
      // the real writer before any tool can run. An emit fired before the
      // stream opens is dropped silently — same fire-and-forget posture as
      // the rest of ToolContext.emit.
      let writeData: ((part: { type: `data-${string}`; data: unknown }) => void) | undefined;
      const toolEmit = (name: string, data: unknown) => {
        writeData?.({ type: `data-${name}`, data });
      };
      // Shared tool builder (same as the session runner). No emit/turnId
      // here for the approval AgentEvent channel, so needsApproval tools
      // answer with an "use the session API" error instead of hanging a
      // stateless request. H2: async (dynamic-tools.ts provider); hookCtx
      // is the same one just used for
      // resolveModelForTurn/resolveInstructions above.
      const tools = await buildSdkTools({
        agent, sessionId, metadata: body.metadata, bearerToken, userId: createdBy, model, store, hookCtx, toolEmit,
        plugin: deps.plugin, agentName: deps.agentName,
      });
      // H3: switched from the bare `result.toUIMessageStreamResponse()` to
      // createUIMessageStream + writer.merge so ToolContext.emit has
      // somewhere to write on this path — a plain streamText UIMessage
      // stream has no way to interleave extra parts into itself; wrapping it
      // in a writer-driven stream does (confirmed against the installed
      // ai@6.0.219 package: `createUIMessageStream`/`createUIMessageStreamResponse`
      // and `UIMessageStreamWriter.write`/`.merge` — see task-h3-report.md).
      // streamText stays inside execute() (it IS the streaming phase); only
      // the setup calls above run before the stream so their failures keep
      // pre-H3 HTTP-error semantics.
      const uiStream = createUIMessageStream({
        execute: ({ writer }) => {
          writeData = (p) => writer.write(p);
          const result = streamText({
            model,
            system,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
            onFinish: async ({ text, totalUsage }) => {
              await store.addStep(turn.id, 1, "text", null, { text }, totalUsage)
                .catch((e) => console.error("agents: chat persist failed:", e));
              await store.finishTurn(turn.id, "completed")
                .catch((e) => console.error("agents: chat persist failed:", e));
            },
          });
          writer.merge(result.toUIMessageStream());
        },
      });
      return createUIMessageStreamResponse({ stream: uiStream });
    }

    return json({ error: "not found" }, 404);
  };
}
