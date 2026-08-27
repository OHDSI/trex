// Model-call retry with exponential backoff, ported from codex's
// `core/src/responses_retry.rs`. Before this module a 429 anywhere in the
// agent runtime surfaced to the user as a failed turn — and since subagents
// became real turns (one child = one turn, one wake = one turn, compaction =
// its own model call), a single fan-out is 8+ model calls billed to one
// key. A 429 mid-fan-out killed a child and handed its parent
// `Agent <name> failed: rate limit exceeded` as the delegated result.
//
// Two entry points:
//   withModelRetry    — for a whole-response call (generateText).
//   streamWithModelRetry — for streamText, whose failure mode is different
//                          enough to need its own contract (see below).

import { APICallError, RetryError } from "ai";
import type { AgentEvent } from "./events.ts";

/** Attempts INCLUDING the first, so 5 means one call plus four retries. */
export const MAX_MODEL_ATTEMPTS = 5;
/** Backoff after the first failed attempt. Doubles from here. */
export const INITIAL_RETRY_DELAY_MS = 5_000;
export const RETRY_BACKOFF_FACTOR = 2;
/** Ceiling on a single wait, so the schedule cannot run away. */
export const MAX_RETRY_DELAY_MS = 60_000;
/**
 * How many leading stream parts streamWithModelRetry will hold before it
 * declares the attempt committed (see its contract). Bounded because a model
 * can stream an arbitrarily long reasoning block — all of which runner.ts
 * ignores — and buffering it whole to preserve a retry option nobody will
 * use is just a memory leak with extra steps.
 */
export const MAX_BUFFERED_PREFIX_PARTS = 64;

/**
 * Delay to wait AFTER the given (1-based) attempt failed.
 * 5s -> 10s -> 20s -> 40s, capped at MAX_RETRY_DELAY_MS.
 */
export function retryDelayMs(attempt: number): number {
  const raw = INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
  return Math.min(raw, MAX_RETRY_DELAY_MS);
}

export interface ModelErrorClassification {
  retryable: boolean;
  /** Short human-readable cause, safe to put on the wire. */
  reason: string;
  statusCode?: number;
}

/** Unwrap the layers ai@6 puts between us and the error the provider actually returned. */
function unwrap(err: unknown): unknown {
  // `ai` retries the request itself (maxRetries, default 2 — deliberately
  // left alone, see the note on streamWithModelRetry) and, when that budget
  // is exhausted, rethrows a RetryError carrying the individual failures.
  // Classifying the wrapper instead of the last real failure would make every
  // exhausted-inner-retry look terminal.
  for (let depth = 0; depth < 8; depth++) {
    if (RetryError.isInstance(err)) {
      const last = err.lastError ?? err.errors?.[err.errors.length - 1];
      if (last != null && last !== err) {
        err = last;
        continue;
      }
    }
    // A provider or middleware may rethrow with the real APICallError as
    // `cause`; follow that chain too, but only while it gets us closer.
    if (!APICallError.isInstance(err) && err instanceof Error && err.cause != null && err.cause !== err) {
      err = err.cause;
      continue;
    }
    break;
  }
  return err;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * Whether this error is worth waiting on.
 *
 * Keyed on the AI SDK's own error type rather than on message strings:
 * `@ai-sdk/provider`'s APICallError (re-exported by `ai`) carries a
 * `statusCode` and an `isRetryable` flag, and `APICallError.isInstance` is a
 * Symbol.for marker check, so it holds across duplicate copies of the package.
 * A genuine connection failure is ALREADY normalised into an APICallError by
 * provider-utils' handleFetchError, with no statusCode and `isRetryable:
 * true` — which is why the no-status branch below trusts the flag.
 *
 * Where we deliberately diverge from `isRetryable`: the SDK's default also
 * retries 408 and 409. Our policy is 429 and 5xx only (codex's), and nothing
 * is lost by narrowing — the SDK's own in-request retry budget still covers
 * 408/409 quickly, on the layer that can read a Retry-After header. This
 * outer layer exists for the long-horizon rate-limit case, not for blips.
 *
 * Everything else is TERMINAL on the first attempt. An auth failure, a
 * model-not-found, a quota/billing rejection, a malformed request: retrying
 * those only delays a message the user has to act on by 75 seconds.
 */
export function classifyModelError(error: unknown): ModelErrorClassification {
  const err = unwrap(error);

  // A cancelled turn is not a failed one. agent_stop reaching a running child
  // must end it, not restart it four more times.
  if (isAbort(err)) return { retryable: false, reason: "aborted" };

  if (APICallError.isInstance(err)) {
    const statusCode = err.statusCode;
    if (statusCode == null) {
      // No HTTP status: the transport never got an answer. handleFetchError
      // marks exactly this case retryable.
      return {
        retryable: err.isRetryable,
        reason: err.isRetryable ? "connection error" : err.message,
      };
    }
    if (statusCode === 429) return { retryable: true, reason: "rate limited (429)", statusCode };
    if (statusCode >= 500) return { retryable: true, reason: `server error (${statusCode})`, statusCode };
    return { retryable: false, reason: `${err.message} (${statusCode})`, statusCode };
  }

  // Not an APICallError at all. A raw fetch rejection can reach us when a
  // caller supplies its own fetch, or from a provider that throws before
  // handleFetchError wraps it; those are TypeErrors with a known message set.
  if (err instanceof TypeError) {
    const m = err.message.toLowerCase();
    if (m.includes("fetch failed") || m.includes("failed to fetch") || m.includes("error sending request")) {
      return { retryable: true, reason: "connection error" };
    }
  }

  return { retryable: false, reason: err instanceof Error ? err.message : String(err) };
}

export interface ModelRetryOpts {
  /**
   * Called just before each wait. Wired at both call sites to publish a
   * `model.retrying` event, so a UI can say "rate limited, retrying in 10s"
   * instead of looking hung for over a minute.
   */
  onRetry?: (info: { attempt: number; maxAttempts: number; delayMs: number; reason: string }) => void;
  /**
   * Injected so tests can assert the 5/10/20/40 schedule without actually
   * sleeping through it. Defaults to a real timer.
   */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  /** Abandons the retry loop when the turn is cancelled mid-wait. */
  signal?: AbortSignal;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying a 429/5xx/connection failure on the schedule above.
 * The error surfaced after the last attempt is the provider's own, unwrapped
 * and rethrown as-is — callers upstream already know how to render it.
 */
export async function withModelRetry<T>(fn: () => Promise<T>, opts: ModelRetryOpts = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? MAX_MODEL_ATTEMPTS;
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const { retryable, reason } = classifyModelError(err);
      if (!retryable || attempt >= maxAttempts || opts.signal?.aborted) throw err;
      const delayMs = retryDelayMs(attempt);
      try {
        opts.onRetry?.({ attempt, maxAttempts, delayMs, reason });
      } catch (e) {
        // A throwing subscriber must not convert a retryable failure into a
        // terminal one — telling someone is a courtesy, retrying is the point.
        console.error("[agents] failed to publish the model-retry event:", e);
      }
      await sleep(delayMs);
    }
  }
}

/**
 * Stream part types runner.ts actually acts on. Anything else in ai@6's
 * fullStream (`start`, `start-step`, `text-start`, the reasoning-* and
 * tool-input-* families, `source`, `file`, `raw`) is inert to this codebase
 * and therefore safe to discard and re-request.
 */
const COMMITTING_PART_TYPES: ReadonlySet<string> = new Set([
  "text-delta",
  "tool-call",
  "tool-result",
  "finish-step",
  "finish",
  "abort",
]);

/**
 * streamText with retry, under a deliberately narrow contract:
 *
 *   A stream is retried only while it has produced NOTHING the turn acted on.
 *
 * Why not more. streamText returns before its stream is consumed, so a naive
 * `withModelRetry(() => streamText(...))` retries only the argument-validation
 * path and never a 429, which arrives when the stream is read — and this
 * codebase's own runner.ts comment records that fullStream surfaces such
 * errors as an `error` PART rather than by throwing. Retrying at any later
 * point is worse than not retrying: a second attempt re-streams the whole
 * response from the top, so any text already emitted to the channel, any tool
 * already executed, and any step already persisted would be duplicated. There
 * is no resume-from-offset in the SDK to make that safe.
 *
 * So: this function drains the leading inert parts (bounded by
 * MAX_BUFFERED_PREFIX_PARTS), and an error arriving in that window — or a
 * rejection from the stream itself — is retried with a fresh streamText call.
 * The first committing part seals the attempt; from then on an error is the
 * turn's, exactly as before this module existed. In practice that covers the
 * case that matters: a rate limit is refused at request time, before a single
 * token comes back.
 *
 * The SDK's own per-request `maxRetries` (default 2, Retry-After aware) is
 * left untouched. It is the fast inner layer for blips; this is the slow
 * outer layer for a rate limit that outlives them.
 */
export async function streamWithModelRetry<P extends { type: string }>(
  start: () => { fullStream: AsyncIterable<P> },
  opts: ModelRetryOpts = {},
): Promise<AsyncIterable<P>> {
  return await withModelRetry(async () => {
    const iterator = start().fullStream[Symbol.asyncIterator]();
    const prefix: P[] = [];
    try {
      while (prefix.length < MAX_BUFFERED_PREFIX_PARTS) {
        const next = await iterator.next();
        if (next.done) break;
        const part = next.value;
        // An `error` part is how a mid-stream provider failure arrives. Throw
        // the RAW error (not a stringified one) so classifyModelError can read
        // its statusCode.
        if (part.type === "error") {
          throw (part as unknown as { error: unknown }).error ?? new Error("unknown model error");
        }
        prefix.push(part);
        if (COMMITTING_PART_TYPES.has(part.type)) break;
      }
    } catch (err) {
      // Release the abandoned stream before the next attempt opens another.
      await iterator.return?.().catch(() => {});
      throw err;
    }
    return replay(prefix, iterator);
  }, opts);
}

/** Yields the buffered prefix, then hands the rest of the stream straight through. */
async function* replay<P>(prefix: P[], iterator: AsyncIterator<P>): AsyncIterable<P> {
  for (const p of prefix) yield p;
  while (true) {
    const next = await iterator.next();
    if (next.done) return;
    yield next.value;
  }
}

/** Builds the `onRetry` hook both call sites use, given a stream publisher. */
export function retryEmitter(
  emit: (e: AgentEvent) => void,
  ctx: { turnId?: string; phase: "turn" | "compaction" },
): ModelRetryOpts["onRetry"] {
  return ({ attempt, maxAttempts, delayMs, reason }) =>
    emit({
      type: "model.retrying",
      data: { ...(ctx.turnId ? { turnId: ctx.turnId } : {}), phase: ctx.phase, attempt, maxAttempts, delayMs, reason },
    });
}
