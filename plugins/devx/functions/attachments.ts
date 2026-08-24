// @ts-nocheck - Deno edge function
// Materialize channel attachments (screenshots etc., relayed by claw as
// name/url metadata) into `<workspace>/attachments/` so the coder can Read
// them — images render multimodally through the Read tool, so nothing is ever
// inlined into a prompt. Returns the workspace-relative paths written; failures
// are per-file and non-fatal (the turn still runs, the miss is logged).
import { assertSafeAttachmentUrl } from "./attachment_url.ts";

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20MB per file

// A slow trickle (or a peer that never finishes) under the byte cap would
// otherwise stall the turn indefinitely — bound every attachment fetch.
const ATTACHMENT_FETCH_TIMEOUT_MS = 60_000; // 60s per hop, generous for a small attachment

// Deno's fetch() defaults to `redirect: "follow"`, which would chase a 3xx
// anywhere — including back into a private network — after
// assertSafeAttachmentUrl had only ever validated the FIRST url. This walks
// redirects itself, fetching with `redirect: "manual"` and re-validating
// every hop through the same guard before following it, so a redirect can
// never be used to reach somewhere the first hop was not allowed to reach.
const MAX_ATTACHMENT_REDIRECTS = 5;

export async function fetchAttachment(
  rawUrl,
  env = (k) => Deno.env.get(k),
  fetchImpl = fetch,
) {
  let url = assertSafeAttachmentUrl(rawUrl, env);
  for (let redirects = 0; ; redirects++) {
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(ATTACHMENT_FETCH_TIMEOUT_MS),
    });

    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) return res;

    if (redirects >= MAX_ATTACHMENT_REDIRECTS) {
      throw new Error(`attachment fetch followed more than ${MAX_ATTACHMENT_REDIRECTS} redirects`);
    }
    const location = res.headers.get("location");
    if (!location) {
      throw new Error(`attachment fetch got a ${res.status} redirect with no Location header`);
    }
    // Location may be relative — resolve it against the CURRENT url, then
    // send the resolved absolute url back through the exact same guard the
    // first hop went through (including the allowlist, if configured).
    const resolved = new URL(location, url).toString();
    url = assertSafeAttachmentUrl(resolved, env);
  }
}

// Read a fetch Response body without ever buffering more than maxBytes in
// memory. A naive `await res.arrayBuffer()` pulls the whole response in
// before any size check runs, so an oversized (or endless) response can
// exhaust worker memory even though it is ultimately rejected. Here the
// Content-Length header (when present and honest) short-circuits before the
// body is read at all; the body is otherwise read incrementally and the
// running total is checked after every chunk, so a missing or lying
// Content-Length cannot defeat the cap.
export async function readCappedBody(res, maxBytes) {
  const contentLength = res.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      // Never read from it, but don't leave it undrained either.
      await res.body?.cancel();
      throw new Error(`too large (${declared} bytes)`);
    }
  }

  if (!res.body) return new Uint8Array(0);

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`too large (${total} bytes)`);
      }
      chunks.push(value);
    }
  } finally {
    // Whether we broke out normally, hit the size cap, or reader.read()
    // itself rejected mid-stream (a network failure), the reader must never
    // be left locked with an undrained connection behind it.
    try {
      await reader.cancel();
    } catch {
      // already closed/errored — nothing further to release.
    }
    try {
      reader.releaseLock();
    } catch {
      // cancel() above may already have released it.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function materializeAttachments(
  workspacePath,
  attachments,
) {
  const saved = [];
  const dir = `${workspacePath}/attachments`;
  for (const a of attachments) {
    // Basename only, conservative charset — the name is remote input.
    const base = String(a.name).split(/[\\/]/).pop() || "file";
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    try {
      // a.url is remote input (relayed from a chat channel) — validate it
      // before ever fetching, so it cannot be pointed at internal services
      // or a cloud metadata endpoint. fetchAttachment re-validates every
      // redirect hop the same way, so a 3xx cannot be used to reach
      // somewhere the original url was not allowed to reach.
      const res = await fetchAttachment(a.url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const bytes = await readCappedBody(res, ATTACHMENT_MAX_BYTES);
      await Deno.mkdir(dir, { recursive: true });
      // Prefix with an index to keep same-named files from clobbering.
      const rel = `attachments/${saved.length}-${safe}`;
      await Deno.writeFile(`${workspacePath}/${rel}`, bytes);
      saved.push({ path: rel, contentType: a.contentType });
    } catch (err) {
      console.warn(`[attachments] attachment '${safe}' skipped:`, err?.message || err);
    }
  }
  return saved;
}

// The prompt half of the same feature. It lived inline in the sidecar
// engine; both engines need identical wording, so it moves here rather than
// being retyped — only paths ever enter a prompt, never file content.
export function renderAttachmentBlock(saved) {
  if (!saved?.length) return "";
  const listing = saved
    .map((s) => `- ${s.path}${s.contentType ? ` (${s.contentType})` : ""}`)
    .join("\n");
  return `\n\n<user_attachments>\nThe user attached files with this request; they are saved in the workspace:\n${listing}\nView them with the Read tool (images render visually) when they are relevant to the task.\n</user_attachments>`;
}
