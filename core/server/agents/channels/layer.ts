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
import { resolveApprovalDecision } from "../service/approvals.ts";
import type { AgentEvent } from "../service/events.ts";
import type { ChannelDef } from "./types.ts";
import { registerDelivery as defaultRegisterDelivery } from "./delivery.ts";

// Background-delivery executor (Task 5). The Task-0 spike verified
// EdgeRuntime.waitUntil keeps a background fetch alive past the HTTP response
// (specs/008-agents-channels/spike-channels.md); when the global is absent
// (unit tests, non-edge hosts) fall back to a detached promise so delivery
// still runs — it just isn't guaranteed against isolate reclamation.
function edgeWaitUntil(p: Promise<unknown>): void {
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") er.waitUntil(p);
  else void Promise.resolve(p).catch((e) => console.error("agents: channel delivery task failed:", e));
}

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
  // Task 5 — server-initiated outbound delivery. All three are injectable so a
  // test can drive delivery without EdgeRuntime; production leaves them unset
  // and the defaults below (delivery.ts's registerDelivery + EdgeRuntime.waitUntil)
  // apply. When a started channel turn's channel declares `events` handlers,
  // send() registers them as a background subscriber on the session stream.
  registerDelivery?: typeof defaultRegisterDelivery;
  waitUntil?: (p: Promise<unknown>) => void;
  buildChannelCtx?: (
    info: ChannelSessionStarted & { channel: ChannelDef },
  ) => { channelCtx: unknown; ctx?: unknown };
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

    // Own-property + brand + shape guard: never treat an inherited key
    // (constructor/__proto__/toString/…) as a channel — that would reach
    // matchRoute with an undefined `routes` and throw an UNAUTHENTICATED 500.
    // An unknown or non-channel key is a 404, same as any other miss.
    const channel = Object.hasOwn(agent.channels, channelId) ? agent.channels[channelId] : undefined;
    if (!channel || channel.__trexChannel !== true || !Array.isArray(channel.routes)) {
      return json({ error: `channel '${channelId}' not found` }, 404);
    }

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

  // Shared session-start path. send() (current channel) and receive() (a
  // different, TARGET channel) both funnel through here — the ONLY difference is
  // which channel id owns the session key + delivery. `sessionChannelId` is that
  // owner; `channel` is its ChannelDef (used to decide/wire delivery).
  const startChannelSession = async (
    sessionChannelId: string,
    channel: ChannelDef | undefined,
    message: unknown,
    opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string },
  ): Promise<{ id: string }> => {
    // The raw token is adapter-owned; namespace it with the channelId so two
    // channels minting the same raw token address distinct sessions.
    const token = namespacedToken(sessionChannelId, opts.continuationToken);
    // created_by is the trex x-user-id: set it ONLY when the channel auth is a
    // real trex user (the JWT-authed eve-web channel, authenticator "trex").
    // Every platform-webhook channel authenticates by platform signature and
    // has no trex user (authenticator "discord"/"slack"/…) — those stay null
    // (principal-only). This makes the native approval-ownership check protect
    // an eve-web session, matching the native POST /eve/v1/session path.
    const createdBy = opts.auth &&
        opts.auth.authenticator === "trex" &&
        opts.auth.principalType === "user"
      ? opts.auth.principalId
      : null;
    const { sessionId, created } = await deps.channelStore.resolveOrCreateSession(
      sessionChannelId,
      token,
      deps.plugin,
      deps.agentName,
      opts.auth,
      createdBy,
    );
    deps.startTurn(sessionId, message);
    const info: ChannelSessionStarted = {
      channelId: sessionChannelId,
      sessionId,
      created,
      auth: opts.auth,
      continuationToken: opts.continuationToken,
      state: opts.state,
      title: opts.title,
    };
    deps.onSessionStarted?.(info);

    // Server-initiated delivery (Task 5): if this channel declares `events`
    // handlers, subscribe them to the session's live stream so the adapter
    // posts the agent's reply back to the platform AFTER this response
    // returns. No-op for channels without events (e.g. the toy webhook).
    if (channel?.events) {
      const waitUntil = deps.waitUntil ?? edgeWaitUntil;
      (deps.registerDelivery ?? defaultRegisterDelivery)({
        channel,
        sessionId,
        subscribe: deps.subscribe,
        waitUntil,
        buildChannelCtx: () =>
          deps.buildChannelCtx
            ? deps.buildChannelCtx({ ...info, channel })
            : {
              // Default context the events handlers receive as 2nd/3rd args.
              // Adapter tasks supply a richer one via deps.buildChannelCtx.
              channelCtx: { channelId: sessionChannelId, sessionId, state: info.state, title: info.title, auth: info.auth, env: deps.env },
              ctx: { sessionId, channelId: sessionChannelId, waitUntil },
            },
      });
    }
    return { id: sessionId };
  };

  return {
    params,
    requestIp,

    send(message, opts) {
      const channel = Object.hasOwn(deps.agent.channels, channelId)
        ? deps.agent.channels[channelId]
        : undefined;
      return startChannelSession(channelId, channel, message, opts);
    },

    getSession(sessionId) {
      if (!sessionId) return null;
      return {
        // Store-backed existence check (native /stream parity): a non-empty id
        // is not necessarily a real session, so a route 404s on !exists().
        async exists() {
          return !!(await deps.store.getSession(sessionId));
        },
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

    // Cross-channel hand-off (spec §4.5): start a session on a DIFFERENT
    // channel (e.g. an incident webhook opening a Slack thread). Does NOT start
    // a session on the current channel — the current route's own HTTP response
    // is whatever its handler returns. Reuses the same send() path, keyed to the
    // TARGET channel's id + delivery.
    async receive(targetChannel, input) {
      // eve parity: the target is passed by REFERENCE (its ChannelDef default
      // export). Map it back to its id by identity match against the agent's
      // channels — that id owns the session key + delivery.
      let targetId: string | undefined;
      for (const [id, def] of Object.entries(deps.agent.channels)) {
        if (def === targetChannel) { targetId = id; break; }
      }
      if (targetId === undefined) {
        throw new Error("agents: receive() target is not a registered channel of this agent");
      }

      const { message, target, auth } = (input ?? {}) as {
        message?: unknown;
        target?: { channelId?: string };
        auth?: ChannelAuth | null;
      };

      // Derive the continuation token + initial state. If the target declares a
      // `receive` hook, it owns that derivation (from {message, target, auth}).
      // Otherwise default to the target's channelId as the raw token (else a
      // fresh UUID) and empty state — startChannelSession namespaces the raw
      // token to `${targetId}:<raw>`, same as send().
      const derived = typeof targetChannel.receive === "function"
        ? await targetChannel.receive(input)
        : { continuationToken: target?.channelId ?? crypto.randomUUID() };

      return startChannelSession(targetId, targetChannel, message, {
        auth: auth ?? null,
        continuationToken: derived.continuationToken,
        state: derived.state,
        title: derived.title,
      });
    },

    // Channel HITL resume (Task 17): apply an approval decision to the parked
    // session behind `continuationToken`. Namespaces the raw token exactly like
    // send() (so it addresses the same session the inbound message opened),
    // looks it up WITHOUT creating a session, and — on a hit — delegates the DB
    // write to the SAME resolver the native routes use. No turn is driven: the
    // session's still-alive poll loop consumes the decision. Channel sessions
    // carry no trex user, so sticky "always"/"never" (which needs one) is
    // rejected by the resolver; approve/deny work. An unknown token is a logged
    // soft failure, never a throw (an adapter default calls this best-effort).
    async resume(continuationToken, input) {
      const token = namespacedToken(channelId, continuationToken);
      const sessionId = await deps.channelStore.getSessionByToken(channelId, token);
      if (!sessionId) {
        console.error(`agents: channel resume found no session for token '${token}'`);
        return { ok: false, error: "no session for token" };
      }
      return await resolveApprovalDecision(deps.store, sessionId, input, {
        plugin: deps.plugin,
        agentName: deps.agentName,
        // Platform-webhook channel sessions have no trex user; sticky verbs are
        // rejected by the resolver (v1 gap — parity with native's "always/never
        // requires an authenticated user"). Task 18 may thread the session's
        // created_by here for the JWT-authed eve-web channel.
        userId: undefined,
      });
    },

    waitUntil(p) {
      // Fire-and-forget: keep the task alive past the response and swallow
      // rejections so a deferred failure never becomes an unhandled rejection.
      void Promise.resolve(p).catch((e) => console.error("agents: channel waitUntil task failed:", e));
    },
  };
}
