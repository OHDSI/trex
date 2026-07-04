export interface PhoenixMessage {
  topic: string;
  event: string;
  payload: any;
  ref: string | null;
  join_ref?: string | null;
}

export function decodeFrame(raw: string): PhoenixMessage | null {
  try {
    const o = JSON.parse(raw);
    if (typeof o?.topic !== "string" || typeof o?.event !== "string") return null;
    return { topic: o.topic, event: o.event, payload: o.payload ?? {}, ref: o.ref ?? null, join_ref: o.join_ref ?? null };
  } catch {
    return null;
  }
}

export function encodeFrame(msg: PhoenixMessage): string {
  const out: Record<string, unknown> = {
    topic: msg.topic, event: msg.event, payload: msg.payload, ref: msg.ref,
  };
  if (msg.join_ref != null) out.join_ref = msg.join_ref;
  return JSON.stringify(out);
}

export function reply(req: PhoenixMessage, status: "ok" | "error", response: unknown): PhoenixMessage {
  return { topic: req.topic, event: "phx_reply", payload: { status, response }, ref: req.ref };
}
