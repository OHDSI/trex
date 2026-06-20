/**
 * d2e-compat Express routes.
 *
 * Mounted only when D2E_COMPAT=true (see core/server/d2e-compat/index.ts).
 * Task 1.4 will extend this function with additional routes.
 */
import type { Express } from "express";
import { logtoAuthn } from "./auth.ts";

export function mountD2eRoutes(app: Express): void {
  // ---------------------------------------------------------------------------
  // /WebAPI/* proxy — forwards requests to the local WebAPI instance on :8080.
  // Logto JWT validation + token exchange is performed by logtoAuthn before the
  // proxy handler runs. The exchanged WebAPI token is set on req.webApiToken.
  // ---------------------------------------------------------------------------
  app.all(/^\/WebAPI\/.*/, logtoAuthn, async (req, res) => {
    const target = `http://localhost:8080${req.originalUrl}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v && k.toLowerCase() !== "host") headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const tok = (req as any).webApiToken;
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    let body: Uint8Array | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Uint8Array[] = [];
      for await (const c of req as any) chunks.push(typeof c === "string" ? new TextEncoder().encode(c) : c);
      if (chunks.length) body = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
    }
    try {
      const r = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
      res.status(r.status);
      r.headers.forEach((val, key) => { if (key.toLowerCase() !== "transfer-encoding") res.setHeader(key, val); });
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error(`[d2e-compat] WebAPI proxy error: ${e}`);
      res.status(502).json({ error: "WebAPI proxy error" });
    }
  });
}
