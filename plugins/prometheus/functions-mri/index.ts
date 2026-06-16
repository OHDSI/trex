// @ts-nocheck - Deno edge function
import { getMriState } from "./state.ts";
import { parseMriRoute } from "./router.ts";

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = parseMriRoute(req.method, url.pathname, url.searchParams);
  if (route.kind === "notFound") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  // Warm the state singleton; dispatch (with state) is wired in later phases.
  await getMriState();
  return Response.json({ error: "not implemented" }, { status: 501 });
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
