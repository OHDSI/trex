// Live NDJSON fan-out per session. Workers are reused per servicePath, so
// all requests for one agent land in the same worker instance — an
// in-memory subscriber registry is sufficient for live-tail. Replay comes
// from the DB. NDJSON (one JSON object per line), not SSE, per eve's
// documented session stream (docs/concepts/sessions-runs-and-streaming.md
// — see COMPAT.md); there was no existing SSE consumer of this stream to
// migrate.
import type { AgentEvent } from "./events.ts";

const subscribers = new Map<string, Set<(e: AgentEvent) => void>>();

export function publish(sessionId: string, e: AgentEvent) {
  for (const fn of subscribers.get(sessionId) ?? []) {
    try { fn(e); } catch { /* subscriber gone */ }
  }
}

export function subscribe(sessionId: string, fn: (e: AgentEvent) => void): () => void {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId)!.add(fn);
  return () => {
    subscribers.get(sessionId)?.delete(fn);
    if (subscribers.get(sessionId)?.size === 0) subscribers.delete(sessionId);
  };
}

export function ndjsonEncode(e: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(e)}\n`);
}
