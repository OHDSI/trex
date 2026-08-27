import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { APICallError, RetryError } from "ai";
import {
  classifyModelError,
  INITIAL_RETRY_DELAY_MS,
  MAX_MODEL_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  retryDelayMs,
  streamWithModelRetry,
  withModelRetry,
} from "./retry.ts";

const apiError = (statusCode: number, message = `http ${statusCode}`) =>
  new APICallError({ message, url: "https://example.test/v1", requestBodyValues: {}, statusCode });

/** Records what it was asked to wait for instead of actually waiting. */
function fakeClock() {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) };
}

Deno.test("retryDelayMs follows 5s -> 10s -> 20s -> 40s and caps at 60s", () => {
  assertEquals(retryDelayMs(1), 5_000);
  assertEquals(retryDelayMs(2), 10_000);
  assertEquals(retryDelayMs(3), 20_000);
  assertEquals(retryDelayMs(4), 40_000);
  // The cap binds from the fifth wait on, which the 5-attempt budget never
  // reaches — asserted anyway so raising MAX_MODEL_ATTEMPTS cannot silently
  // produce an 80s wait.
  assertEquals(retryDelayMs(5), MAX_RETRY_DELAY_MS);
  assertEquals(retryDelayMs(9), MAX_RETRY_DELAY_MS);
  assertEquals(retryDelayMs(1), INITIAL_RETRY_DELAY_MS);
});

Deno.test("a 429 then success yields one result and exactly one retry event", async () => {
  const clock = fakeClock();
  const events: { attempt: number; delayMs: number; reason: string }[] = [];
  let attempts = 0;

  const result = await withModelRetry(() => {
    attempts++;
    if (attempts === 1) return Promise.reject(apiError(429, "rate limit exceeded"));
    return Promise.resolve("ok");
  }, { sleep: clock.sleep, onRetry: (i) => events.push(i) });

  assertEquals(result, "ok");
  assertEquals(attempts, 2);
  assertEquals(events.length, 1);
  assertEquals(events[0]?.attempt, 1);
  assertEquals(events[0]?.delayMs, 5_000);
  assert(events[0]?.reason.includes("429"));
  assertEquals(clock.waits, [5_000]);
});

Deno.test("five consecutive 429s surface a terminal error on the specified backoff schedule", async () => {
  const clock = fakeClock();
  const events: { attempt: number; delayMs: number }[] = [];
  let attempts = 0;

  const err = await assertRejects(() =>
    withModelRetry(() => {
      attempts++;
      return Promise.reject(apiError(429, "rate limit exceeded"));
    }, { sleep: clock.sleep, onRetry: (i) => events.push(i) })
  );

  assertEquals(attempts, MAX_MODEL_ATTEMPTS);
  // Four waits for five attempts — nothing is waited for after the last one.
  assertEquals(clock.waits, [5_000, 10_000, 20_000, 40_000]);
  assertEquals(events.length, 4);
  // The provider's own error is what reaches the caller, not a wrapper.
  assert(APICallError.isInstance(err));
  assertEquals((err as APICallError).statusCode, 429);
});

Deno.test("a 5xx is retried", async () => {
  const clock = fakeClock();
  let attempts = 0;
  const result = await withModelRetry(() => {
    attempts++;
    if (attempts < 3) return Promise.reject(apiError(503));
    return Promise.resolve("ok");
  }, { sleep: clock.sleep });
  assertEquals(result, "ok");
  assertEquals(attempts, 3);
  assertEquals(clock.waits, [5_000, 10_000]);
});

Deno.test("a 401 is terminal on the first attempt and is never retried", async () => {
  const clock = fakeClock();
  const events: unknown[] = [];
  let attempts = 0;

  await assertRejects(() =>
    withModelRetry(() => {
      attempts++;
      return Promise.reject(apiError(401, "invalid api key"));
    }, { sleep: clock.sleep, onRetry: (i) => events.push(i) })
  );

  assertEquals(attempts, 1);
  assertEquals(clock.waits, []);
  assertEquals(events.length, 0);
});

Deno.test("model-not-found, quota/billing and other 4xx are terminal on the first attempt", async () => {
  for (const status of [400, 402, 403, 404, 422]) {
    const clock = fakeClock();
    let attempts = 0;
    await assertRejects(() =>
      withModelRetry(() => {
        attempts++;
        return Promise.reject(apiError(status));
      }, { sleep: clock.sleep })
    );
    assertEquals(attempts, 1, `status ${status} must not be retried`);
    assertEquals(clock.waits, []);
  }
});

Deno.test("classifyModelError keys on the SDK's APICallError, not on message text", () => {
  assertEquals(classifyModelError(apiError(429)).retryable, true);
  assertEquals(classifyModelError(apiError(500)).retryable, true);
  assertEquals(classifyModelError(apiError(529)).retryable, true);
  assertEquals(classifyModelError(apiError(401)).retryable, false);
  assertEquals(classifyModelError(apiError(404)).retryable, false);
  // Deliberately narrower than the SDK's own isRetryable default, which also
  // covers 408/409 — the SDK's in-request retry budget handles those.
  assertEquals(classifyModelError(apiError(408)).retryable, false);
  assertEquals(classifyModelError(apiError(409)).retryable, false);
  // A message that merely LOOKS like a rate limit is not one.
  assertEquals(classifyModelError(new Error("rate limit exceeded")).retryable, false);
});

Deno.test("a connection error (no status, SDK-marked retryable) is retried", () => {
  // Exactly the shape provider-utils' handleFetchError produces.
  const connErr = new APICallError({
    message: "Cannot connect to API: connection refused",
    url: "https://example.test/v1",
    requestBodyValues: {},
    isRetryable: true,
  });
  assertEquals(classifyModelError(connErr).retryable, true);
  assertEquals(classifyModelError(connErr).reason, "connection error");
  // And a raw fetch rejection that never got wrapped.
  assertEquals(classifyModelError(new TypeError("fetch failed")).retryable, true);
});

Deno.test("a RetryError from the SDK's own exhausted retry budget is unwrapped, not treated as terminal", () => {
  const wrapped = new RetryError({
    message: "Failed after 3 attempts",
    reason: "maxRetriesExceeded",
    errors: [apiError(429), apiError(429)],
  });
  assertEquals(classifyModelError(wrapped).retryable, true);
  assertEquals(classifyModelError(wrapped).statusCode, 429);

  const terminal = new RetryError({
    message: "Failed after 1 attempt",
    reason: "errorNotRetryable",
    errors: [apiError(401)],
  });
  assertEquals(classifyModelError(terminal).retryable, false);
});

Deno.test("an aborted turn is terminal — a cancelled child is never restarted", async () => {
  const clock = fakeClock();
  let attempts = 0;
  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  await assertRejects(() =>
    withModelRetry(() => {
      attempts++;
      return Promise.reject(abortErr);
    }, { sleep: clock.sleep })
  );
  assertEquals(attempts, 1);
  assertEquals(classifyModelError(abortErr).reason, "aborted");
});

Deno.test("a throwing onRetry subscriber does not turn a retryable failure terminal", async () => {
  const clock = fakeClock();
  let attempts = 0;
  const result = await withModelRetry(() => {
    attempts++;
    if (attempts === 1) return Promise.reject(apiError(429));
    return Promise.resolve("ok");
  }, {
    sleep: clock.sleep,
    onRetry: () => {
      throw new Error("subscriber blew up");
    },
  });
  assertEquals(result, "ok");
  assertEquals(attempts, 2);
});

// --- streaming contract -----------------------------------------------------

type Part = { type: string; text?: string; error?: unknown };

const streamOf = (parts: Part[]) => ({
  fullStream: (async function* () {
    for (const p of parts) yield p;
  })(),
});

async function drain(stream: AsyncIterable<Part>): Promise<Part[]> {
  const out: Part[] = [];
  for await (const p of stream) out.push(p);
  return out;
}

Deno.test("a 429 arriving before any output is retried, and the caller sees one clean stream", async () => {
  const clock = fakeClock();
  const events: { attempt: number; delayMs: number }[] = [];
  let starts = 0;

  const stream = await streamWithModelRetry<Part>(() => {
    starts++;
    if (starts === 1) return streamOf([{ type: "start" }, { type: "error", error: apiError(429) }]);
    return streamOf([
      { type: "start" },
      { type: "text-delta", text: "hello" },
      { type: "finish" },
    ]);
  }, { sleep: clock.sleep, onRetry: (i) => events.push(i) });

  const parts = await drain(stream);
  assertEquals(starts, 2);
  assertEquals(events.length, 1);
  assertEquals(clock.waits, [5_000]);
  // Exactly one copy of the text — the abandoned attempt emitted nothing.
  assertEquals(parts.filter((p) => p.type === "text-delta").map((p) => p.text), ["hello"]);
  assertEquals(parts.map((p) => p.type), ["start", "text-delta", "finish"]);
});

Deno.test("a rejected stream (not an error part) before any output is also retried", async () => {
  const clock = fakeClock();
  let starts = 0;
  const stream = await streamWithModelRetry<Part>(() => {
    starts++;
    if (starts === 1) {
      return {
        fullStream: (async function* () {
          throw apiError(503);
          // deno-lint-ignore no-unreachable
          yield { type: "start" } as Part;
        })(),
      };
    }
    return streamOf([{ type: "text-delta", text: "ok" }]);
  }, { sleep: clock.sleep });

  assertEquals((await drain(stream)).map((p) => p.text), ["ok"]);
  assertEquals(starts, 2);
});

Deno.test("a 429 arriving AFTER output has been emitted is NOT retried — the contract is pre-output only", async () => {
  const clock = fakeClock();
  const events: unknown[] = [];
  let starts = 0;

  const stream = await streamWithModelRetry<Part>(() => {
    starts++;
    return streamOf([
      { type: "text-delta", text: "partial" },
      { type: "error", error: apiError(429) },
    ]);
  }, { sleep: clock.sleep, onRetry: (i) => events.push(i) });

  // The stream was already sealed by the text-delta, so the error part is
  // handed straight to the caller's loop (runner.ts fails the turn on it)
  // rather than causing a second, text-duplicating attempt.
  const parts = await drain(stream);
  assertEquals(starts, 1);
  assertEquals(events.length, 0);
  assertEquals(clock.waits, []);
  assertEquals(parts.map((p) => p.type), ["text-delta", "error"]);
});

Deno.test("a terminal error before any output surfaces without retrying", async () => {
  const clock = fakeClock();
  let starts = 0;
  await assertRejects(() =>
    streamWithModelRetry<Part>(() => {
      starts++;
      return streamOf([{ type: "start" }, { type: "error", error: apiError(401) }]);
    }, { sleep: clock.sleep })
  );
  assertEquals(starts, 1);
  assertEquals(clock.waits, []);
});

Deno.test("an abandoned attempt's stream is closed before the next one opens", async () => {
  const clock = fakeClock();
  let returned = 0;
  let starts = 0;

  const stream = await streamWithModelRetry<Part>(() => {
    starts++;
    if (starts === 1) {
      return {
        fullStream: {
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.resolve({ done: false, value: { type: "error", error: apiError(429) } as Part }),
            return: () => (returned++, Promise.resolve({ done: true as const, value: undefined as unknown as Part })),
          }),
        },
      };
    }
    return streamOf([{ type: "text-delta", text: "ok" }]);
  }, { sleep: clock.sleep });

  await drain(stream);
  assertEquals(returned, 1);
});
