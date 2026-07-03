// HTTP surface per spec §6: eve session API (compat) + AI SDK chat endpoint.
// deno-lint-ignore-file no-explicit-any
import { convertToModelMessages, streamText, stepCountIs } from "ai";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import { runTurn } from "./runner.ts";
import { publish, subscribe, ndjsonEncode } from "./stream.ts";
import { buildSdkTools, buildSystemPrompt } from "./toolset.ts";
import { resolveModel } from "./model.ts";

interface Deps {
  agent: LoadedAgent;
  store: AgentStore;
  plugin: string;
  agentName: string;
  basePath: string;
  model?: any;
}

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
    default:
      // "model" / "approval-request" steps are not currently persisted by
      // runner.ts — fall back to a passthrough so an unexpected kind is
      // still visible on the stream rather than silently dropped.
      return { type: row.kind, data: { turnId, name: row.name, ...p } };
  }
}

function startTurn(deps: Deps, sessionId: string, message: unknown, metadata: unknown, bearerToken?: string) {
  // Fire and forget: the turn streams via publish(); errors land as error
  // events + failed turn status, never as unhandled rejections.
  (async () => {
    const history = await historyForModel(deps.store, sessionId);
    const turn = await deps.store.addTurn(sessionId, message, metadata);
    publish(sessionId, { type: "turn.started", data: { turnId: turn.id, sequence: turn.seq } });
    try {
      await runTurn({
        agent: deps.agent, sessionId, turnId: turn.id, history, message, metadata,
        store: deps.store, emit: (e) => publish(sessionId, e),
        model: deps.model, bearerToken,
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
      const sessionId = await store.createSession(deps.plugin, deps.agentName, undefined);
      if (body.message != null) startTurn(deps, sessionId, body.message, body.metadata, bearerToken);
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
          if (!r?.requestId || !["approve", "deny"].includes(r.optionId)) {
            return json({ error: "inputResponses[].requestId and optionId (approve|deny) required" }, 400);
          }
          await store.resolveApproval(r.requestId, r.optionId);
        }
      }
      if (body.message != null) startTurn(deps, sessionId, body.message, body.metadata, bearerToken);
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
      if (!body.requestId || !["approve", "deny"].includes(body.decision)) {
        return json({ error: "requestId and decision (approve|deny) required" }, 400);
      }
      const ok = await store.resolveApproval(body.requestId, body.decision);
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
      const past = (await store.listEvents(sessionId)).slice(startIndex);
      // Hoisted so the abort listener and the stream's cancel() (consumer
      // detached without an abort event) share the same unsubscribe.
      let unsub: (() => void) | undefined;
      const body = new ReadableStream({
        start(controller) {
          for (const ev of past) controller.enqueue(ndjsonEncode(stepToEvent(ev)));
          if (replayOnly) { controller.close(); return; }
          unsub = subscribe(sessionId, (e) => {
            try { controller.enqueue(ndjsonEncode(e)); } catch { unsub?.(); }
          });
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
      const sessionId = await store.createSession(deps.plugin, deps.agentName, undefined);
      const turn = await store.addTurn(sessionId, body.messages.at(-1), body.metadata);
      const model = deps.model ?? resolveModel(agent.config.model);
      // Shared tool builder (same as the session runner). No emit/turnId here,
      // so needsApproval tools answer with an "use the session API" error
      // instead of hanging a stateless request.
      const tools = buildSdkTools({
        agent, sessionId, metadata: body.metadata, bearerToken, model, store,
      });
      // ai@6's convertToModelMessages is async (Promise<ModelMessage[]>) —
      // the brief assumed the v2-era sync signature. `deno check` rejected
      // passing the bare Promise as streamText's `messages`; awaiting it is
      // the only change, no effect on the endpoint contract.
      const result = streamText({
        model,
        system: buildSystemPrompt(agent, body.metadata),
        messages: await convertToModelMessages(body.messages),
        tools,
        stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
        onFinish: async ({ text, totalUsage }) => {
          await store.addStep(turn.id, 1, "text", null, { text }, totalUsage)
            .catch((e) => console.error("agents: chat persist failed:", e));
          await store.finishTurn(turn.id, "completed")
            .catch((e) => console.error("agents: chat persist failed:", e));
        },
      });
      return result.toUIMessageStreamResponse();
    }

    return json({ error: "not found" }, 404);
  };
}
