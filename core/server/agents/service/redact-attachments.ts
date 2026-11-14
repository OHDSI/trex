// Attachments a chat client sends with a message (images, document text) go to
// the model, but they are not kept on the server. POST /chat stores the latest
// user message as the turn's `message` for observability; this copy of that
// message drops the attachment content and keeps only what describes it.
//
// Two kinds of part count as attachments:
//   - a `file` part (AI SDK FileUIPart): its `url` is usually a base64 data URL
//     holding the whole file;
//   - a `text` part the client marked with `providerMetadata.trex.attachment`:
//     text the client pulled out of a file (for example a PDF) and sends as
//     plain text. Providers ignore the `trex` key, so the marker costs nothing
//     on the way to the model.
//
// Everything else in the message is returned unchanged. The input is never
// mutated: the caller still sends the original message to the model.

type Part = Record<string, unknown>;

export const REDACTED_ATTACHMENT = "[attachment content not stored]";

function isMarkedAttachmentText(part: Part): boolean {
  if (part.type !== "text") return false;
  const meta = part.providerMetadata as { trex?: { attachment?: unknown } } | undefined;
  return meta?.trex?.attachment != null;
}

function redactPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const p = part as Part;
  if (p.type === "file") {
    const { url: _url, ...rest } = p;
    return { ...rest, url: REDACTED_ATTACHMENT };
  }
  if (isMarkedAttachmentText(p)) {
    return { ...p, text: REDACTED_ATTACHMENT };
  }
  return part;
}

export function redactAttachments<T>(message: T): T {
  if (!message || typeof message !== "object") return message;
  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return message;
  return { ...message, parts: parts.map(redactPart) };
}
