// The per-turn `metadata` payload useAgentsChat.ts POSTs to the eve/agents
// session API. Factored out of the hook (same reason effectiveLoop.ts was —
// R9) so the Deno suite can pin it: attachments were silently dropped for the
// whole life of this loop because nothing in the repo ever WROTE
// metadata.attachments, so agent/agent.ts's buildUserMessage always hit its
// `!attachments?.length` early return. The seam that guarantees the two ends
// agree now has a test (agent/lib/turn_metadata.test.ts feeds this function's
// output straight into buildUserMessage).
//
// Must stay dependency-free (no React, no "@/..." aliases, no window) so both
// the Vite frontend build and Deno can import it directly — hence apiBase is
// a parameter rather than a config.ts import.

// A row returned by POST /chats/:id/attachments (functions/routes/
// attachment_routes.ts) — the file is already stored server-side at this
// point; only its identity travels in the turn metadata.
export interface UploadedAttachment {
  id: string;
  filename: string;
  content_type?: string | null;
}

// The shape agent/lib/context.ts's DevxMetadata declares and agent.ts's
// buildUserMessage filters for ({url, name} required, contentType advisory).
export interface TurnAttachment {
  url: string;
  name: string;
  contentType?: string;
}

export interface TurnMetadata {
  mode?: "ask" | "plan" | "build";
  chatId: string;
  appId?: string;
  attachments?: TurnAttachment[];
}

export interface TurnMetadataBase {
  mode?: "ask" | "plan" | "build";
  chatId: string;
  appId?: string;
}

// `attachments` is omitted entirely when there is nothing to send, so an
// ordinary turn's metadata is byte-identical to what it was before this
// wiring existed.
export function buildTurnMetadata(
  base: TurnMetadataBase,
  uploaded: UploadedAttachment[] | undefined,
  apiBase: string,
): TurnMetadata {
  if (!uploaded || uploaded.length === 0) return { ...base };
  const attachments = uploaded
    .filter((a) => a && typeof a.id === "string" && a.id.length > 0)
    .map((a) => ({
      url: `${apiBase.replace(/\/$/, "")}/attachments/${a.id}`,
      name: a.filename,
      ...(a.content_type ? { contentType: a.content_type } : {}),
    }));
  if (attachments.length === 0) return { ...base };
  return { ...base, attachments };
}
