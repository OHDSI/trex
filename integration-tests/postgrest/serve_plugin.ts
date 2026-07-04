// Thin HTTP wrapper around the postgrest plugin's pure handle(req) for the
// differential conformance harness (NOT the trex stack — the express bridge
// is tested elsewhere).
//
// The worker expects the mount prefix ("/postgrest/...") on every URL and
// treats "/postgrest/" as the PostgREST root (OpenAPI). This server maps
//   http://127.0.0.1:PLUGIN_PORT/<path>?<qs>  ->  http://plugin.internal/postgrest/<path>?<qs>
// keeping the path + query bytes verbatim (no URL re-encoding) so the plugin
// sees exactly what the oracle sees.
//
// Config comes from PGRST_* env vars (see plugin.env / the Makefile).

import { handle } from "../../plugins/postgrest/functions/app.ts";

const port = Number(Deno.env.get("PLUGIN_PORT") ?? "13001");

Deno.serve(
  {
    port,
    hostname: "127.0.0.1",
    onListen: ({ hostname, port }) => console.log(`[serve_plugin] listening on http://${hostname}:${port}`),
  },
  async (req) => {
    // Grab the raw path+query from the request line; new URL() would
    // re-encode and could diverge from what the oracle received.
    const rawPathAndQuery = req.url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") || "/";
    const target = `http://plugin.internal/postgrest${rawPathAndQuery}`;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? new Uint8Array(await req.arrayBuffer()) : undefined;
    const inner = new Request(target, { method: req.method, headers: req.headers, body });
    try {
      return await handle(inner);
    } catch (err) {
      console.error("[serve_plugin] handle() threw:", err);
      return new Response(JSON.stringify({ message: String(err), harness: "serve_plugin crash" }), {
        status: 599,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
);
