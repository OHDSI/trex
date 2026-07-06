// The channel layer (spec §6 / task-4): dispatches an inbound HTTP request to
// the matching channel's route on an agent, builds the per-request
// ChannelRouteArgs the route handler uses, and turns a route's send() into a
// resolved session + a started turn.
//
// TRUST BOUNDARY — channel routes are served WITHOUT the trex JWT / x-user-id
// that the session/chat routes require. The proxy (plugin/agents.ts) exempts
// {basePath}/eve/v1/<channelId>/* from authContext/pluginAuthz precisely so an
// unauthenticated platform webhook (Discord/Slack/…) can reach this layer. The
// caller is instead authenticated by the ADAPTER's own platform-signature
// verify(), which every adapter MUST run inside its route handler before
// calling send() (enforced per-adapter in later tasks). send() is the only path
// from a channel route to an agent session, so an adapter that forgets to
// verify is the only way this boundary is crossed — hence the per-adapter test.
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "../service/store.ts";
import type { ChannelStore } from "./store.ts";
import type { ChannelAuth, ChannelRoute, ChannelRouteArgs } from "./types.ts";
import { namespacedToken } from "./continuation.ts";
import { ndjsonEncode } from "../service/stream.ts";
import { stepToEvent } from "../service/handler.ts";
import type { AgentEvent } from "../service/events.ts";

// Fired right after a send() starts a turn so the delivery layer (Task 6) can
// register where the agent's reply should be routed. A no-op for Task 4 — the
// interface is kept stable so delivery can plug in without touching send().
export interface ChannelSessionStarted {
  channelId: string;
  sessionId: string;
  created: boolean;
  auth: ChannelAuth | null;
  continuationToken: string;
  state?: unknown;
  title?: string;
}

export interface ChannelLayerDeps {
  agent: LoadedAgent;
  store: AgentStore;
  channelStore: ChannelStore;
  plugin: string;
  agentName: string;
  basePath: string;
  // Fire-and-forget turn start (handler.ts's startTurn, pre-bound to its Deps).
  // Channel sessions carry no trex user, so no bearerToken/userId is threaded.
  startTurn: (sessionId: string, message: unknown, metadata?: unknown) => void;
  subscribe: (sessionId: string, fn: (e: AgentEvent) => void) => () => void;
  env?: (k: string) => string | undefined;
  onSessionStarted?: (info: ChannelSessionStarted) => void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Normalize a path into non-empty segments; "/" and "" both yield [].
function segments(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

// Match a route's path (with `:param` placeholders) against a concrete request
// path, express-style. Returns the captured params on a hit, or null.
function matchRoute(
  routes: ChannelRoute[],
  method: string,
  routePath: string,
): { route: ChannelRoute; params: Record<string, string> } | null {
  const reqSegs = segments(routePath);
  for (const route of routes) {
    if (route.method !== method) continue;
    const defSegs = segments(route.path);
    if (defSegs.length !== reqSegs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < defSegs.length; i++) {
      const d = defSegs[i];
      if (d.startsWith(":")) params[d.slice(1)] = decodeURIComponent(reqSegs[i]);
      else if (d !== reqSegs[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function createChannelHandler(deps: ChannelLayerDeps): (req: Request) => Promise<Response> {
  const { agent, basePath } = deps;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let path = url.pathname;
    if (basePath) {
      if (!path.startsWith(basePath)) return json({ error: "not found" }, 404);
      path = path.slice(basePath.length);
    }
    if (!path.startsWith("/")) path = `/${path}`;

    // {basePath}/eve/v1/{channelId}{routePath}. routePath defaults to "/" when
    // the request targets the channel root (…/eve/v1/webhook or …/webhook/).
    const m = path.match(/^\/eve\/v1\/([^/]+)((?:\/.*)?)$/);
    if (!m) return json({ error: "not found" }, 404);
    const channelId = m[1];
    const routePath = m[2] === "" ? "/" : m[2];

    const channel = agent.channels[channelId];
    if (!channel) return json({ error: `channel '${channelId}' not found` }, 404);

    const matched = matchRoute(channel.routes, req.method, routePath);
    if (!matched) return json({ error: "route not found" }, 404);

    const args = buildArgs(deps, channelId, matched.params, req);
    // Deliberately NOT wrapped: a throwing route handler propagates so the
    // worker's Deno.serve turns it into a 500 (platform retry), and — because
    // send() is the only path to a session — a throw before send() leaves no
    // orphaned session. Adapters own their own try/catch for graceful replies.
    return await matched.route.handler(req, args);
  };
}

function buildArgs(
  deps: ChannelLayerDeps,
  channelId: string,
  params: Record<string, string>,
  req: Request,
): ChannelRouteArgs {
  const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  return {
    params,
    requestIp,

    async send(message, opts) {
      // The raw token is adapter-owned; namespace it with the channelId so two
      // channels minting the same raw token address distinct sessions.
      const token = namespacedToken(channelId, opts.continuationToken);
      const { sessionId, created } = await deps.channelStore.resolveOrCreateSession(
        channelId,
        token,
        deps.plugin,
        deps.agentName,
        opts.auth,
      );
      deps.startTurn(sessionId, message);
      deps.onSessionStarted?.({
        channelId,
        sessionId,
        created,
        auth: opts.auth,
        continuationToken: opts.continuationToken,
        state: opts.state,
        title: opts.title,
      });
      return { id: sessionId };
    },

    getSession(sessionId) {
      if (!sessionId) return null;
      return {
        getEventStream(o) {
          const startIndex = o?.startIndex ?? 0;
          let unsub: (() => void) | undefined;
          return new ReadableStream({
            async start(controller) {
              // Subscribe before replay so an event published in the
              // listEvents() window is buffered, not lost (same ordering
              // discipline as handler.ts's /stream route).
              let buffering = true;
              const buffer: AgentEvent[] = [];
              unsub = deps.subscribe(sessionId, (e) => {
                try {
                  if (buffering) buffer.push(e);
                  else controller.enqueue(ndjsonEncode(e));
                } catch { unsub?.(); }
              });
              try {
                const past = (await deps.store.listEvents(sessionId)).slice(startIndex);
                for (const ev of past) controller.enqueue(ndjsonEncode(stepToEvent(ev)));
              } catch (e) {
                unsub?.();
                controller.error(e);
                return;
              }
              buffering = false;
              for (const e of buffer) {
                try { controller.enqueue(ndjsonEncode(e)); } catch { unsub?.(); break; }
              }
            },
            cancel() { unsub?.(); },
          });
        },
      };
    },

    // Reserved for adapters that forward inbound platform input through a
    // channel's own event pipeline. Out of scope for v1 (adapters use send());
    // kept on the interface so the shape is stable — mirrors shim.ts's WS stub.
    receive() {
      return Promise.reject(new Error("agents: ChannelRouteArgs.receive() is not implemented in v1"));
    },

    waitUntil(p) {
      // Fire-and-forget: keep the task alive past the response and swallow
      // rejections so a deferred failure never becomes an unhandled rejection.
      void Promise.resolve(p).catch((e) => console.error("agents: channel waitUntil task failed:", e));
    },
  };
}
