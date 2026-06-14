// @ts-nocheck - Deno edge function, not compiled by tsc

import { getState } from "./state.ts";
import { route } from "./router.ts";

/** Pure request handler — exported so unit tests can call it without a socket. */
export async function handle(req: Request): Promise<Response> {
  const state = await getState();
  return route(req, state);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
