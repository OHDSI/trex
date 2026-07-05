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
  ): { getEventStream(o?: { startIndex?: number }): ReadableStream } | null;
  receive(channel: ChannelDef, input: unknown): Promise<{ id: string }>;
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

// The branded channel definition produced by defineChannel and consumed by the
// loader/runtime (Tasks 2/5/8+). `__trexChannel` is the brand the loader checks
// before trusting a channel file's default export, exactly as `__trexTool` /
// `__trexToolProvider` gate the tool surface.
export interface ChannelDef {
  __trexChannel: true;
  routes: ChannelRoute[];
  events?: ChannelEventHandlers;
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
