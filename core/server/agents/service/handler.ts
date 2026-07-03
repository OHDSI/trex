// HTTP surface per spec §6: eve session API (compat) + AI SDK chat endpoint.
// deno-lint-ignore-file no-explicit-any
import { convertToModelMessages, streamText, stepCountIs } from "ai";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import { runTurn } from "./runner.ts";
import { publish, subscribe, sseEncode } from "./stream.ts";
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

function startTurn(deps: Deps, sessionId: string, message: unknown, metadata: unknown, bearerToken?: string) {
  // Fire and forget: the turn streams via publish(); errors land as error
  // events + failed turn status, never as unhandled rejections.
  (async () => {
    const history = await historyForModel(deps.store, sessionId);
    const turn = await deps.store.addTurn(sessionId, message, metadata);
    publish(sessionId, { type: "turn-start", turnId: turn.id, seq: turn.seq });
    try {
      await runTurn({
        agent: deps.agent, sessionId, turnId: turn.id, history, message, metadata,
        store: deps.store, emit: (e) => publish(sessionId, e),
        model: deps.model, bearerToken,
      });
      await deps.store.finishTurn(turn.id, "completed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      publish(sessionId, { type: "error", message: msg });
      await deps.store.finishTurn(turn.id, "failed", msg);
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

    if (req.method === "GET" && path === "/healthz") {
      return json({ agent: deps.agentName, tools: Object.keys(agent.tools) });
    }

    if (req.method === "POST" && path === "/eve/v1/session") {
      const body = await req.json().catch(() => ({}));
      const sessionId = await store.createSession(deps.plugin, deps.agentName, undefined);
      if (body.message != null) startTurn(deps, sessionId, body.message, body.metadata, bearerToken);
      return json({ sessionId }, 200, { "x-eve-session-id": sessionId });
    }

    const m = path.match(/^\/eve\/v1\/session\/([^/]+)\/(stream|message|approval)$/);
    if (m) {
      const [, sessionId, action] = m;
      const session = await store.getSession(sessionId);
      if (!session) return json({ error: "session not found" }, 404);

      if (action === "message" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body.message == null) return json({ error: "message required" }, 400);
        startTurn(deps, sessionId, body.message, body.metadata, bearerToken);
        return json({ accepted: true }, 202);
      }

      if (action === "approval" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (!body.requestId || !["approve", "deny"].includes(body.decision)) {
          return json({ error: "requestId and decision (approve|deny) required" }, 400);
        }
        const ok = await store.resolveApproval(body.requestId, body.decision);
        return ok ? json({ resolved: true }) : json({ error: "unknown or already-decided request" }, 404);
      }

      if (action === "stream" && req.method === "GET") {
        const replayOnly = url.searchParams.get("replayOnly") === "1";
        const past = await store.listEvents(sessionId);
        // Hoisted so the abort listener and the stream's cancel() (consumer
        // detached without an abort event) share the same unsubscribe.
        let unsub: (() => void) | undefined;
        const stream = new ReadableStream({
          start(controller) {
            for (const ev of past) controller.enqueue(sseEncode({ type: ev.kind, name: ev.name, ...(ev.payload as object ?? {}) }));
            if (replayOnly) { controller.close(); return; }
            unsub = subscribe(sessionId, (e) => {
              try { controller.enqueue(sseEncode(e)); } catch { unsub?.(); }
            });
            req.signal.addEventListener("abort", () => { unsub?.(); try { controller.close(); } catch { /* closed */ } });
          },
          cancel() { unsub?.(); },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
        });
      }
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
