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
