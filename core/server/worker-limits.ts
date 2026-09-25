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

/**
 * How long a user worker may live before the supervisor retires it.
 *
 * The same story as the memory ceiling, by the other trigger. trex-runtime
 * raises a resource alert on the second wall-clock tick:
 *
 *   } else if state.wall_clock_alerts == 1 {
 *     early_retire_fn();
 *     error!("wall clock duration warning: isolate: {:?}", key);
 *
 * and `has_resource_alert()` counts `wall_clock_alerts == 2`, so once pending
 * work drains the worker is dropped — reason `EarlyDrop`, exactly as for
 * memory. At five minutes a d2e e2e run logged 46 of them, every one preceded
 * by a wall-clock warning and none by a memory one.
 *
 * Each recycle leaves a window where a request arrives and no worker is ready.
 * That is how the wizard-dashboard test fails on develop: not in the wizard at
 * all, but on its first line, `page.goto('/d2e/portal')`, timing out after 60s
 * because the portal had no worker at that moment.
 *
 * Thirty minutes keeps the limit — a worker that never ages out is how a slow
 * leak becomes permanent — while making a recycle something that happens
 * between runs rather than six times an hour.
 *
 * ZERO IS MEANINGFUL and is trex-runtime's own spelling for "no wall-clock
 * limit" (`is_wall_clock_limit_disabled: worker_timeout_ms == 0`). It is
 * accepted so a deployment can express that deliberately, which is why this
 * parser admits 0 where the memory one does not.
 */
export const workerWallClockTimeoutMs = (
  raw: string | undefined = Deno.env.get("TREX_WORKER_TIMEOUT_MS"),
): number => {
  // Blank is ABSENT, not zero. Number("") and Number("  ") are both 0, and 0
  // here means "no wall-clock limit at all" -- so an env var that is present
  // but empty, the ordinary result of `TREX_WORKER_TIMEOUT_MS=` in a compose
  // file, would silently disable the limit instead of leaving the default.
  // The memory parser cannot hit this because it requires n > 0.
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return 30 * 60 * 1000;

  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : 30 * 60 * 1000;
};
