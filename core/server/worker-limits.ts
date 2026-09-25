/**
 * Resource budget for a user worker.
 *
 * WHY THIS IS NOT JUST A NUMBER. trex-runtime does not wait for a worker to
 * exhaust its memory limit before retiring it. Half is enough:
 *
 *   // runtime/mod.rs
 *   if total_malloced_bytes >= limit / 2 { state.mem_reached_half.raise(); }
 *
 * and that flag is a resource alert, which makes the worker eligible to be
 * dropped at its next idle moment:
 *
 *   fn has_resource_alert(&self) -> bool { ... || self.is_mem_half_reached || ... }
 *   fn can_early_drop(&self) -> bool {
 *     self.has_resource_alert() && self.have_all_pending_tasks_been_resolved()
 *   }
 *
 * The drop itself is orderly -- nothing in flight is killed, which is why this
 * is not a correctness bug. What it costs is availability: every recycle leaves
 * a window in which a request arrives and no worker is ready for it, and that
 * window answers 502.
 *
 * At the previous 150MB the alert fired at 75MB, which the functions here cross
 * in ordinary use, so workers were being retired more or less continuously --
 * 30 to 41 `Shutdown` events with reason `EarlyDrop` in a single d2e e2e run,
 * enough that three consecutive runs each died on a different test.
 *
 * 512MB puts the alert at 256MB. Note this is a CEILING, not an allocation: a
 * worker that uses 40MB still uses 40MB. Raising it costs nothing until a
 * worker actually grows, and buys the headroom that stops healthy workers being
 * churned.
 *
 * Configurable because the right ceiling depends on the host, and a deployment
 * packing many workers onto a small machine may want the old behaviour back.
 * Same escape hatch as TREX_API_RATE_LIMIT_MAX, and the same parse rule: a
 * positive integer wins, anything else falls back to the default rather than
 * failing a boot over a typo.
 */
export const workerMemoryLimitMb = (
  raw: string | undefined = Deno.env.get("TREX_WORKER_MEMORY_LIMIT_MB"),
): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 512;
};
