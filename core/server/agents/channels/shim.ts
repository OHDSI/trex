import type { ChannelConfig, ChannelDef, ChannelRoute } from "./types.ts";

// Brands a channel file's config as a trex channel definition (the loader
// checks `__trexChannel` before trusting a default export), defaulting
// `routes` to `[]` and validating that every route carries a method, path,
// and handler — mirroring defineTool's brand+validate pattern.
export function defineChannel(cfg: ChannelConfig): ChannelDef {
  const routes = cfg.routes ?? [];
  for (const route of routes) {
    if (!route || typeof route !== "object") {
      throw new Error("defineChannel: each route must be an object");
    }
    if (!route.method) throw new Error("defineChannel: route.method is required");
    if (!route.path) throw new Error("defineChannel: route.path is required");
    if (typeof route.handler !== "function") {
      throw new Error("defineChannel: route.handler is required");
    }
  }
  return Object.assign({}, cfg, { routes, __trexChannel: true as const });
}

// Route builders. POST/GET produce a plain ChannelRoute the runtime dispatches
// on. WS is reserved for a future adapter: it accepts a handler for authoring
// parity but wraps it so any invocation fails loudly — WebSocket channels are
// out of scope for v1.
export function POST(path: string, handler: ChannelRoute["handler"]): ChannelRoute {
  return { method: "POST", path, handler };
}

export function GET(path: string, handler: ChannelRoute["handler"]): ChannelRoute {
  return { method: "GET", path, handler };
}

export function WS(path: string, _handler: unknown): ChannelRoute {
  return {
    method: "WS",
    path,
    handler: () => {
      throw new Error("agents: WebSocket channels are not supported in v1");
    },
  };
}

export type {
  ChannelAllowList,
  ChannelAuth,
  ChannelConfig,
  ChannelDef,
  ChannelEventHandlers,
  ChannelRoute,
  ChannelRouteArgs,
} from "./types.ts";
