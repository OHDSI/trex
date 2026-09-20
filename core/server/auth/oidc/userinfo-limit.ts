// A per-caller budget for /oauth2/userinfo requests that FAIL, spent in front
// of Better Auth so a flood of them cannot spend the budget a sign-in needs.
//
// The hole, as measured on a real stack during the cutover rehearsal: every
// WebAPI sign-in makes one authenticated /oauth2/userinfo call and fails
// outright if it does not answer, and 594 requests with an invalid bearer
// filled that endpoint's rate-limit bucket in 2.4 seconds — after which a real
// login failed with `[invalid_user_info_response] … 429`. Any anonymous caller
// could deny sign-in to the whole installation for fifteen minutes.
//
// Why this cannot be a Better Auth rate-limit rule. Its limiter keys on
// `<ip>|<path>` (createRateLimitKey, @better-auth/core utils/ip.mjs) and
// exposes no hook to change the key, so a tighter `customRules` entry for
// /oauth2/userinfo would still share ONE counter with the authenticated
// requests. The attacker would fill it and the sign-in would read it as full,
// which is exactly today's behaviour. Two independent budgets need two
// independent counters, and the only place trex can hold one is in front.
//
// Keyed on FAILURE, not on whether a credential was presented. The rehearsal's
// flood carried an invalid bearer, so "does it present a token" is a test an
// attacker passes by typing one more word. A /oauth2/userinfo request that the
// provider answers 401 is the thing with no legitimate volume: a real sign-in's
// call answers 200 and is never counted here at all.
//
// In memory on purpose. It is a shock absorber, not an accounting record: a
// restart forgiving an attacker one window is not worth a round trip to
// postgres on every request, and the database is part of what is being
// protected.

export interface FailureBudget {
  /** True when this key has already spent its budget for the current window. */
  overBudget(key: string): boolean;
  /** Counts one failure against the key. */
  record(key: string): void;
  /** Seconds until the key's current window resets. For Retry-After. */
  retryAfter(key: string): number;
  /** Test seam. */
  size(): number;
}

/**
 * `now` is injectable so the window can be tested without waiting for it, and
 * so a test cannot pass merely because it ran fast.
 */
export function createFailureBudget(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): FailureBudget {
  const windows = new Map<string, { count: number; resetAt: number }>();

  // Unbounded growth would make this a memory exhaustion lever of its own — one
  // entry per address — so expired entries are dropped whenever one is written.
  // Sweeping is affordable because an entry only exists while a caller is
  // inside its window, and it avoids a timer that would keep the isolate alive.
  function prune(t: number): void {
    for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
  }

  return {
    overBudget(key) {
      const w = windows.get(key);
      if (!w) return false;
      if (w.resetAt <= now()) return false;
      return w.count >= max;
    },
    record(key) {
      const t = now();
      prune(t);
      const w = windows.get(key);
      if (!w || w.resetAt <= t) {
        windows.set(key, { count: 1, resetAt: t + windowMs });
        return;
      }
      // Counted even once the budget is spent, so a caller that keeps
      // hammering stays refused for the whole window rather than being
      // forgiven by the refusal itself.
      w.count += 1;
    },
    retryAfter(key) {
      const w = windows.get(key);
      if (!w) return 0;
      return Math.max(0, Math.ceil((w.resetAt - now()) / 1000));
    },
    size: () => windows.size,
  };
}

/**
 * Whether the provider's answer to a /oauth2/userinfo request was a refusal
 * that should be charged to the caller.
 *
 * 401 is every authentication outcome the endpoint has — `access token not
 * found`, an invalid or expired token, a retired subject — and 400 covers the
 * malformed request (two transport methods, a broken Authorization header).
 * A 200 is a real sign-in and costs nothing; a 5xx is trex's own fault and
 * charging a caller for it would let an outage lock everyone out on top.
 */
export function isUserInfoRefusal(status: number): boolean {
  return status === 400 || status === 401;
}
