// Structural type surface for the "channels" authoring API — the eve-compatible
// way an agent-dir channel file describes its HTTP/WS routes, events, and state.
// Keep this file dependency-free: channel files import it transitively via
// "eve/channels" and must stay portable. Mirrors eve-shim/types.ts's posture.

// Identity resolved by a channel's authenticator, attached to a send() call so
// the runtime can attribute the message to a principal (or `null` when the
// channel is unauthenticated / the sender could not be identified).
export interface ChannelAuth {
  authenticator: string;
  principalType: "user" | "service" | "app";
  principalId: string;
  attributes?: Record<string, unknown>;
}

// The per-request toolkit handed to a channel route handler by the runtime
// (Task 5+ supplies the concrete implementation). A handler uses these to push
// a message into an agent session (`send`), stream an existing session's events
// (`getSession`), forward inbound platform input (`receive`), read matched path
// params, defer background work past the response (`waitUntil`), and inspect the
// caller IP.
export interface ChannelRouteArgs {
  send(
    message: string,
    opts: {
      auth: ChannelAuth | null;
      continuationToken: string;
      state?: unknown;
      title?: string;
    },
  ): Promise<{ id: string }>;
  getSession(
    sessionId: string,
  ):
    | {
      // Existence check against the session store — the runtime's getSession
      // handle is synchronous (empty id => null) but cannot know whether a
      // non-empty id names a REAL session without a store round-trip. A route
      // that must 404 an unknown session (e.g. the eve stream) awaits this
      // before streaming, matching the native session API's 404 semantics.
      exists(): Promise<boolean>;
      getEventStream(o?: { startIndex?: number }): ReadableStream;
    }
    | null;
  receive(channel: ChannelDef, input: unknown): Promise<{ id: string }>;
  // Apply a HITL decision to a PARKED session (Task 17). Resolves the
  // (adapter-owned) `continuationToken` back to its session, then writes the
  // approve/deny/always/never decision the same way the native resolve routes
  // do — the session's `waitUntil`-alive poll loop consumes it and the SAME turn
  // continues. This does NOT drive a turn (no `send`). Sticky "always"/"never"
  // needs an authenticated trex user; a platform-webhook caller (no trex user)
  // can only approve/deny. An unknown token resolves to `{ ok: false, error }`
  // (logged, never thrown). Wiring an adapter's default resume to this is Task 18.
  resume(
    continuationToken: string,
    input: {
      requestId?: string;
      decision?: "approve" | "deny" | "always" | "never";
      inputResponses?: Array<{ requestId?: string; optionId?: string }>;
    },
  ): Promise<{ ok: boolean; error?: string }>;
  params: Record<string, string>;
  waitUntil(p: Promise<unknown>): void;
  requestIp: string | null;
}

// A single route exposed by a channel. `handler` receives the raw Request plus
// the runtime-supplied ChannelRouteArgs.
export type ChannelRoute = {
  method: "POST" | "GET" | "WS";
  path: string;
  handler: (
    req: Request,
    args: ChannelRouteArgs,
  ) => Promise<Response> | Response;
};

// Named event handlers a channel can react to (platform webhooks, lifecycle,
// etc.). Kept loosely typed (eve parity) since payload shapes are adapter-owned.
export type ChannelEventHandlers = Record<
  string,
  // deno-lint-ignore no-explicit-any
  (eventData: any, channel: any, ctx?: any) => void | Promise<void>
>;

// Inbound access filter: which platform principals may talk to the agent
// through a channel. Empty/absent list = no restriction on that dimension;
// both set = both must match. Enforced by each adapter before send().
export interface ChannelAllowList {
  users?: string[];
  conversations?: string[];
}

// What a channel's `receive` hook returns for a cross-channel hand-off (§4.5).
// `continuationToken` is the RAW token (adapter-owned format) — the runtime
// namespaces it with the target channel id, exactly like send()'s opts token —
// so a hook must NOT pre-namespace it.
export interface ChannelReceiveResult {
  continuationToken: string;
  state?: unknown;
  title?: string;
}

// The branded channel definition produced by defineChannel and consumed by the
// loader/runtime (Tasks 2/5/8+). `__trexChannel` is the brand the loader checks
// before trusting a channel file's default export, exactly as `__trexTool` /
// `__trexToolProvider` gate the tool surface.
export interface ChannelDef {
  __trexChannel: true;
  routes: ChannelRoute[];
  events?: ChannelEventHandlers;
  // Cross-channel hand-off hook (§4.5). When another channel's route calls
  // args.receive(thisChannel, input), the runtime invokes this to derive the
  // continuation token + optional initial state/title for the session it starts
  // on THIS channel, from the caller-supplied {message, target, auth} input.
  // Optional: without it, receive() falls back to a default token (target's
  // channelId, else a fresh UUID) and empty state.
  // deno-lint-ignore no-explicit-any
  receive?: (input: any) => ChannelReceiveResult | Promise<ChannelReceiveResult>;
  state?: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  metadata?: (state: any) => Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  context?: (state: any, session: any) => any;
  cors?: true | { origin: string[]; methods?: string[]; allowHeaders?: string[] };
}

// Author-facing input to defineChannel: everything on ChannelDef except the
// brand (which defineChannel stamps), with `routes` optional (defaults to []).
export type ChannelConfig = Omit<ChannelDef, "__trexChannel" | "routes"> & {
  routes?: ChannelRoute[];
};
