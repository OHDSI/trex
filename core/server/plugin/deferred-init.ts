// Plugin init functions normally run while trex boots, before the HTTP server
// listens, which is right for schema migrations and seeds. An init that has to
// call trex's own HTTP API cannot run then: nothing is listening yet. Such an
// entry sets "afterListen": true and is queued here, then run once the server
// is up. Boot does not wait for these.
//
// Two phases, tracked by `hasRun`. Before the listen callback's one call to
// runDeferredInits(), deferInit just queues — that call drains the queue in
// registration order. After it, boot is long over and nothing will call
// runDeferredInits() again, so a plugin registered later at runtime (e.g. via
// Plugins.registerFromPath, used by devx) would sit in the queue forever and
// never execute. Once past that point, deferInit runs the init immediately in
// the background instead of queueing it.

const queue: Array<{ label: string; run: () => Promise<unknown> }> = [];
let hasRun = false;

const defaultLog = (msg: string, err?: unknown) => console.error(msg, err ?? "");

export function deferInit(label: string, run: () => Promise<unknown>): void {
  if (hasRun) {
    run().catch((err) => defaultLog(`[plugins] deferred init ${label} failed`, err));
    return;
  }
  queue.push({ label, run });
}

export async function runDeferredInits(
  log: (msg: string, err?: unknown) => void = defaultLog,
): Promise<void> {
  hasRun = true;
  const pending = queue.splice(0, queue.length);
  for (const { label, run } of pending) {
    try {
      await run();
    } catch (err) {
      log(`[plugins] deferred init ${label} failed`, err);
    }
  }
}

export function _resetDeferredInitsForTests(): void {
  hasRun = false;
  queue.splice(0, queue.length);
}
