import { assertEquals } from "jsr:@std/assert";

import {
  bootReseedDatabaseCredentials,
  reseedDatabaseCredentialsWithRetry,
} from "./prefect-sync.ts";

/** Collects sleep durations instead of waiting. */
function fakeSleep() {
  const slept: number[] = [];
  return {
    slept,
    sleep: (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

Deno.test("boot re-seed stops as soon as the block is written", async () => {
  const timer = fakeSleep();
  let attempts = 0;
  const outcome = await reseedDatabaseCredentialsWithRetry({
    attempt: () => {
      attempts++;
      return Promise.resolve("written" as const);
    },
    attempts: 5,
    delayMs: 10_000,
    sleep: timer.sleep,
  });

  assertEquals(outcome, "written");
  assertEquals(attempts, 1);
  assertEquals(timer.slept, []);
});

Deno.test("boot re-seed does not retry when there is nothing to seed", async () => {
  const timer = fakeSleep();
  let attempts = 0;
  const outcome = await reseedDatabaseCredentialsWithRetry({
    attempt: () => {
      attempts++;
      return Promise.resolve("skipped" as const);
    },
    attempts: 5,
    delayMs: 10_000,
    sleep: timer.sleep,
  });

  // An empty registry is a settled answer, not a transient failure.
  assertEquals(outcome, "skipped");
  assertEquals(attempts, 1);
  assertEquals(timer.slept, []);
});

Deno.test("boot re-seed retries while Prefect is unreachable, then writes", async () => {
  const timer = fakeSleep();
  let attempts = 0;
  const outcome = await reseedDatabaseCredentialsWithRetry({
    attempt: () => {
      attempts++;
      // Prefect comes up on the 3rd try.
      return Promise.resolve(attempts < 3 ? ("failed" as const) : ("written" as const));
    },
    attempts: 5,
    delayMs: 10_000,
    sleep: timer.sleep,
  });

  assertEquals(outcome, "written");
  assertEquals(attempts, 3);
  assertEquals(timer.slept, [10_000, 10_000]);
});

Deno.test("boot re-seed gives up after the attempt budget", async () => {
  const timer = fakeSleep();
  let attempts = 0;
  const outcome = await reseedDatabaseCredentialsWithRetry({
    attempt: () => {
      attempts++;
      return Promise.resolve("failed" as const);
    },
    attempts: 3,
    delayMs: 5_000,
    sleep: timer.sleep,
  });

  assertEquals(outcome, "failed");
  assertEquals(attempts, 3);
  // No trailing sleep after the final attempt.
  assertEquals(timer.slept, [5_000, 5_000]);
});

Deno.test("boot re-seed treats a thrown attempt as a failed one", async () => {
  const timer = fakeSleep();
  let attempts = 0;
  const outcome = await reseedDatabaseCredentialsWithRetry({
    attempt: () => {
      attempts++;
      if (attempts < 2) throw new Error("fetch failed");
      return Promise.resolve("written" as const);
    },
    attempts: 4,
    delayMs: 1_000,
    sleep: timer.sleep,
  });

  assertEquals(outcome, "written");
  assertEquals(attempts, 2);
  assertEquals(timer.slept, [1_000]);
});

// ---------------------------------------------------------------------------
// bootReseedDatabaseCredentials — first pass + delayed verification pass
// ---------------------------------------------------------------------------

Deno.test("boot re-seed verifies once more after a successful write", async () => {
  const timer = fakeSleep();
  let passes = 0;
  await bootReseedDatabaseCredentials({
    attempt: () => {
      passes++;
      return Promise.resolve("written" as const);
    },
    verifyDelayMs: 120_000,
    sleep: timer.sleep,
  });

  // A d2e alp-dataflow-gen-init from an older bundle can still write an empty
  // block AFTER us; the verification pass repairs that without a manual edit.
  assertEquals(passes, 2);
  assertEquals(timer.slept, [120_000]);
});

Deno.test("boot re-seed skips verification when the first pass wrote nothing", async () => {
  const timer = fakeSleep();
  let passes = 0;
  await bootReseedDatabaseCredentials({
    attempt: () => {
      passes++;
      return Promise.resolve("skipped" as const);
    },
    verifyDelayMs: 120_000,
    sleep: timer.sleep,
  });

  assertEquals(passes, 1);
  assertEquals(timer.slept, []);
});

Deno.test("boot re-seed verification can be disabled with a zero delay", async () => {
  const timer = fakeSleep();
  let passes = 0;
  await bootReseedDatabaseCredentials({
    attempt: () => {
      passes++;
      return Promise.resolve("written" as const);
    },
    verifyDelayMs: 0,
    sleep: timer.sleep,
  });

  assertEquals(passes, 1);
  assertEquals(timer.slept, []);
});
