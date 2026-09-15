// Plugin init functions normally run while trex boots, before the HTTP server
// listens, which is right for schema migrations and seeds. An init that has to
// call trex's own HTTP API cannot run then: nothing is listening yet. Such an
// entry sets "afterListen": true and is queued here, then run once the server
// is up. Boot does not wait for these.

const queue: Array<{ label: string; run: () => Promise<unknown> }> = [];

export function deferInit(label: string, run: () => Promise<unknown>): void {
  queue.push({ label, run });
}

export async function runDeferredInits(
  log: (msg: string, err?: unknown) => void = (msg, err) => console.error(msg, err ?? ""),
): Promise<void> {
  const pending = queue.splice(0, queue.length);
  for (const { label, run } of pending) {
    try {
      await run();
    } catch (err) {
      log(`[plugins] deferred init ${label} failed`, err);
    }
  }
}
