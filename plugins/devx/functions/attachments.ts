// @ts-nocheck - Deno edge function
// Materialize channel attachments (screenshots etc., relayed by claw as
// name/url metadata) into `<workspace>/attachments/` so the coder can Read
// them — images render multimodally through the Read tool, so nothing is ever
// inlined into a prompt. Returns the workspace-relative paths written; failures
// are per-file and non-fatal (the turn still runs, the miss is logged).
import { assertSafeAttachmentUrl } from "./attachment_url.ts";

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20MB per file

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
      // or a cloud metadata endpoint.
      const safeUrl = assertSafeAttachmentUrl(a.url);
      const res = await fetch(safeUrl);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > ATTACHMENT_MAX_BYTES) throw new Error(`too large (${bytes.byteLength} bytes)`);
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
