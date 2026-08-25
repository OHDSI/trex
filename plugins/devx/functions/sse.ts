// One SSE writer for every devx `ReadableStream` route, so the
// "enqueue after close" hazard is handled in a single tested place.
//
// The hazard, from a real incident: a chat turn failed on an upstream rate
// limit, the catch block called an UNGUARDED `send({type:"error"})`, the
// controller was already closed, so `enqueue` threw
// "The stream controller cannot close or enqueue". That throw escaped the
// catch and skipped its own `controller.close()`, so the HTTP response never
// terminated — and claw's `runCodeTurn`, which is an internal caller reading
// that stream, blocked on the fetch for 65 minutes until its 90-minute
// timeout. A coding hand-off looked hung for over an hour because of a
// recoverable rate limit.
//
// The same file already guarded its 15s heartbeat with a try/catch but not
// `send`; supabase_routes.ts and security_routes.ts each had their own
// unguarded copy with the identical catch-then-close shape. Three hand-rolled
// copies is how that drift happened, so the invariants live here instead:
//
//   1. Writing to a dead stream NEVER throws — a lost frame is reported and
//      the caller keeps going. A frame nobody can receive is not worth
//      failing a turn over.
//   2. `close()` is idempotent and never throws, so every terminal path can
//      call it unconditionally. Terminating the response matters far more
//      than the frame that prompted it: an unterminated stream is what
//      strands a reader.

export interface SseWriter {
  /** Write a JSON `data:` frame. Returns false if the stream was already gone. */
  send(data: unknown): boolean;
  /** Write a pre-formatted frame (e.g. the bare `data: [DONE]` sentinel, or a `:` comment heartbeat). */
  sendRaw(frame: string): boolean;
  /** Close the stream. Idempotent, never throws. */
  close(): void;
  /** True once close() has run — for callers that want to skip further work. */
  readonly closed: boolean;
}

/**
 * Minimal structural type for a ReadableStream's controller: only what an SSE
 * writer needs. Declared rather than imported so this module stays trivially
 * testable with a fake.
 */
export interface SseController {
  enqueue(chunk: Uint8Array): void;
  close(): void;
}

export function createSseWriter(controller: SseController, label = "devx"): SseWriter {
  const encoder = new TextEncoder();
  let closed = false;

  const sendRaw = (frame: string): boolean => {
    try {
      controller.enqueue(encoder.encode(frame));
      return true;
    } catch (e) {
      console.warn(`${label}: dropped an SSE frame — stream already closed:`, e instanceof Error ? e.message : e);
      return false;
    }
  };

  return {
    sendRaw,
    // `[DONE]` is a bare sentinel, not JSON — callers send it via sendRaw so it
    // isn't wrapped in quotes.
    send: (data: unknown) => sendRaw(`data: ${JSON.stringify(data)}\n\n`),
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch (e) {
        console.warn(`${label}: stream already closed on close():`, e instanceof Error ? e.message : e);
      }
    },
    get closed() {
      return closed;
    },
  };
}
