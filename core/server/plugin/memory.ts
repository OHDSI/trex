// The `memory` plugin type: each declared memory maps 1:1 to a gbrain brain =
// one Postgres schema (memory_<name>), served at /memory/<name> by the shared
// vendored-gbrain subprocess (see core/server/memory/gbrain-process.ts).
//
// mountMemoryProxy (below) is the reverse-proxy half of this plugin type: it
// forwards /memory/<name>/* to the local gbrain subprocess, mirroring the
// forward/stream house pattern in plugin/function.ts:492-596 (header
// stripping, SSE/NDJSON-aware streaming vs buffered response).
//
// Two distinct name regexes are used deliberately:
//  - MEMORY_NAME_RE has NO hyphen: a memory name is interpolated unquoted
//    into DDL as `memory_<name>` (a Postgres schema identifier), where a
//    hyphen is illegal.
//  - SOURCE_NAME_RE allows hyphens: a source name is a namespace within a
//    memory, not a schema identifier.
import type { Express, Request, Response } from "express";
import { Buffer } from "node:buffer";
import { gbrainBaseUrl } from "../memory/gbrain-process.ts";

const MEMORY_NAME_RE = /^[a-z0-9][a-z0-9_]*$/;
const SOURCE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export interface MemorySource {
  name: string;
  repo?: string; // git source
  ref?: string; // git ref, default "main"
  dir?: string; // subdir within repo (git) OR path within the plugin package (inline)
}
export interface MemoryEntry {
  name: string;
  sources: MemorySource[];
}

export function normalizeMemoryValue(value: unknown): MemoryEntry[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((e) => {
    const entry = e as { name?: string; sources?: unknown };
    if (!entry?.name || !MEMORY_NAME_RE.test(entry.name)) {
      throw new Error(
        `memory: each entry needs a name (${MEMORY_NAME_RE}), got ${
          JSON.stringify(e)
        }`,
      );
    }
    const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
    if (rawSources.length === 0) {
      throw new Error(`memory ${entry.name}: at least one source is required`);
    }
    const seen = new Set<string>();
    const sources: MemorySource[] = rawSources.map((s) => {
      const src = s as MemorySource;
      if (!src?.name || !SOURCE_NAME_RE.test(src.name)) {
        throw new Error(
          `memory ${entry.name}: source needs a name (${SOURCE_NAME_RE})`,
        );
      }
      if (seen.has(src.name)) {
        throw new Error(
          `memory ${entry.name}: duplicate source name ${src.name}`,
        );
      }
      seen.add(src.name);
      if (!src.repo && !src.dir) {
        throw new Error(`memory ${entry.name}/${src.name}: needs repo or dir`);
      }
      return src.repo
        ? {
          name: src.name,
          repo: src.repo,
          ref: src.ref ?? "main",
          dir: src.dir,
        }
        : { name: src.name, dir: src.dir };
    });
    return { name: entry.name, sources };
  });
}

// SSE (text/event-stream) and NDJSON (application/x-ndjson) must be piped to
// the client as they arrive rather than buffered — buffering waits for the
// gbrain stream to close, which for a live tail never happens until the
// client disconnects. Mirrors function.ts's isStreamingContentType.
function isStreamingContentType(contentType: string): boolean {
  return contentType.includes("text/event-stream") ||
    contentType.includes("application/x-ndjson");
}

// Test hook: lets memory.test.ts point the proxy at a stub server without
// starting a real gbrain subprocess. Falls back to the real supervisor
// (Task 9) when unset.
function targetBase(): string | null {
  const override = (globalThis as Record<string, unknown>)
    .__GBRAIN_BASE_URL_OVERRIDE__;
  if (override !== undefined) return override as string | null;
  return gbrainBaseUrl();
}

// Guards against double-registering the same Express app (idempotent per
// app instance — a WeakSet rather than a single module-level boolean so
// tests, which each build their own app, aren't sterilized by a previous
// test's mount).
const mountedApps = new WeakSet<Express>();

// Reverse-proxies /memory/<name>/* to the local gbrain subprocess
// (core/server/memory/gbrain-process.ts), forwarding method/headers/body and
// streaming the response back. Mirrors the forward/stream house pattern in
// plugin/function.ts:492-596.
export function mountMemoryProxy(app: Express): void {
  if (mountedApps.has(app)) return;
  mountedApps.add(app);

  app.all(["/memory", "/memory/*"], async (req: Request, res: Response) => {
    const base = targetBase();
    if (!base) {
      res.status(503).json({ error: "memory_runtime_unavailable" });
      return;
    }

    // Propagate a client disconnect into the gbrain fetch so a long-lived
    // stream doesn't run forever unread. "close" also fires on a normal,
    // fully-written response — only abort when the response hasn't
    // finished, i.e. this is a genuine premature disconnect.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (!val) continue;
        // Strip encoding/framing headers: the body below is rebuilt
        // (re-serialized from req.body, or re-read), so the client's
        // original content-length/transfer-encoding no longer match; and
        // host must point at gbrain, not trex. Let fetch recompute these.
        const lower = key.toLowerCase();
        if (
          lower === "accept-encoding" || lower === "content-length" ||
          lower === "transfer-encoding" || lower === "host"
        ) continue;
        headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
      }

      let body: Blob | string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        // If body was already parsed by middleware (e.g. express.json()),
        // re-serialize it. Otherwise read the raw stream.
        const parsed = (req as unknown as { body?: unknown }).body;
        if (
          parsed && typeof parsed === "object" &&
          Object.keys(parsed as object).length > 0
        ) {
          body = JSON.stringify(parsed);
        } else {
          const chunks: Uint8Array[] = [];
          try {
            for await (const chunk of req as unknown as AsyncIterable<unknown>) {
              chunks.push(
                typeof chunk === "string"
                  ? new TextEncoder().encode(chunk)
                  : (chunk as Uint8Array),
              );
            }
          } catch {
            // Stream may not be async iterable in some environments.
          }
          if (chunks.length > 0) body = new Blob(chunks as BlobPart[]);
        }
      }

      const upstream = await fetch(`${base}${req.originalUrl}`, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });

      res.status(upstream.status);
      upstream.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (
          lower === "content-encoding" || lower === "content-length" ||
          lower === "transfer-encoding"
        ) return;
        res.setHeader(key, val);
      });

      const contentType = upstream.headers.get("content-type") || "";
      if (isStreamingContentType(contentType) && upstream.body) {
        // SSE / NDJSON: pipe the stream directly — don't buffer.
        res.flushHeaders();
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump().catch(() => res.end());
      } else {
        const responseBody = await upstream.arrayBuffer();
        res.end(Buffer.from(responseBody));
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({ error: "memory_proxy_error", message: String(err) });
      } else {
        res.end();
      }
    }
  });
}
