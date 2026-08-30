// plugins/claw/agent/lib/tokio.ts
import { CODE_SERVICE, type TokioClient } from "./code-session.ts";

// Trex.req(service, url, init) returns a streamable Response (namespaces.js "user" kind).
type ReqFn = (service: string, url: string, init: unknown) => Promise<Response>;

export function makeTokioClient(req: ReqFn, service = CODE_SERVICE): TokioClient {
  return {
    req(url, init) {
      return req(service, url, init);
    },
  };
}

// The worker injects Trex.req; outside a Trex worker it is absent (tests build
// their own TokioClient instead), so this reports null rather than throwing.
export function tokioClientFromGlobal(service = CODE_SERVICE): TokioClient | null {
  const trex = (globalThis as unknown as { Trex?: { req?: ReqFn } }).Trex;
  if (typeof trex?.req !== "function") return null;
  return makeTokioClient(trex.req.bind(trex), service);
}
