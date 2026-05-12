// @ts-nocheck - Deno edge function
// Studio proxy: forwards every request received by the trex dispatcher
// (mounted at /plugins/trex/studio/**) to the Studio Next.js standalone
// sidecar reachable at STUDIO_INTERNAL_URL inside the docker network.
//
// The trex dispatcher rewrites the public URL /plugins/trex/studio/... to
// /studio-proxy/... so it matches this function plugin's declared `source`.
// Studio is built with NEXT_PUBLIC_BASE_PATH=/plugins/trex/studio, so it
// only serves URLs under that prefix — we strip /studio-proxy and prepend
// the basePath when forwarding upstream.

const SOURCE_PREFIX = "/studio-proxy";
const STUDIO_BASE_PATH = "/plugins/trex/studio";

Deno.serve(async (req: Request) => {
  const target = Deno.env.get("STUDIO_INTERNAL_URL");
  if (!target) {
    return Response.json(
      { error: "Studio sidecar not configured", message: "STUDIO_INTERNAL_URL is not set on the trex container" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const idx = url.pathname.indexOf(SOURCE_PREFIX);
  const tail = idx >= 0 ? url.pathname.slice(idx + SOURCE_PREFIX.length) : url.pathname;
  const upstream = target.replace(/\/$/, "") + STUDIO_BASE_PATH + tail + url.search;

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const lower = k.toLowerCase();
    if (lower === "host" || lower === "content-length") continue;
    headers.set(k, v);
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
    if ((body as ArrayBuffer).byteLength === 0) body = undefined;
  }

  try {
    const res = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const outHeaders = new Headers();
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") return;
      outHeaders.set(key, value);
    });

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
    });
  } catch (e) {
    console.error("[studio-proxy] Upstream error:", e);
    return Response.json(
      { error: "Studio sidecar unreachable", message: e.message },
      { status: 502 },
    );
  }
});
