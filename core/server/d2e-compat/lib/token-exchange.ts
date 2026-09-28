/**
 * Ported from d2e services/trex/core/server/auth/token-exchange.ts
 * Adapted: removed d2e logger/env imports; uses console directly; no local deps.
 */
import { decodeJwt } from "npm:jose";

export function getTokenSubject(token: string): string | null {
  try {
    const payload = decodeJwt(token);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

const WEBAPI_BASE_URL = "http://localhost:8080/WebAPI";

/**
 * `openidDirect` validates the Logto token, but which credential it answers
 * with depends on the pinned webapi-be: older builds return the WebAPI session
 * JWT inline (`LoginService.Result`, mirrored in a `Bearer` response header),
 * newer ones return a short-lived `OneTimeCodeResponse` that must be redeemed
 * at `/user/login/otc`. Accept both — the submodule pin moves independently of
 * this shim, and reading only one shape takes every `/WebAPI` call down with a
 * 401 the moment the other is deployed.
 */
async function exchangeToken(logtoToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${WEBAPI_BASE_URL}/user/login/openidDirect`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${logtoToken}`,
      },
    });

    if (!response.ok) {
      console.error(
        `[d2e-compat] Token exchange failed: ${response.status} ${await response.text()}`,
      );
      return null;
    }

    const headerJwt = response.headers.get("Bearer");
    const body = await response.json().catch(() => null) as
      | { jwt?: string | null; code?: string | null }
      | null;

    const directJwt = body?.jwt || headerJwt;
    if (directJwt) {
      return directJwt;
    }

    if (!body?.code) {
      console.error(
        "[d2e-compat] Token exchange: openidDirect returned neither a WebAPI JWT nor a one-time code",
      );
      return null;
    }

    return await redeemOneTimeCode(body.code);
  } catch (err) {
    console.error(`[d2e-compat] Token exchange error: ${err}`);
    return null;
  }
}

async function redeemOneTimeCode(code: string): Promise<string | null> {
  const response = await fetch(
    `${WEBAPI_BASE_URL}/user/login/otc?code=${encodeURIComponent(code)}`,
  );

  if (!response.ok) {
    console.error(
      `[d2e-compat] Token exchange: one-time code rejected: ${response.status} ${await response
        .text()}`,
    );
    return null;
  }

  const { jwt } = await response.json() as { jwt?: string | null };
  if (!jwt) {
    console.error("[d2e-compat] Token exchange: redeemed one-time code carried no JWT");
    return null;
  }

  return jwt;
}

/**
 * Exchanges already running, keyed by token subject.
 *
 * WHY THIS IS NOT AN OPTIMISATION. `openidDirect` does not just mint a JWT --
 * WebAPI rewrites the caller's roles as part of it, deleting their existing
 * `webapi.SEC_USER_ROLE` rows and reinserting. Run two of those at once for the
 * same user and the second deletes nothing, because the first already did:
 *
 *   HHH100501: Exception executing batch
 *     StaleStateException: Batch update returned unexpected row count from
 *     update [0]; actual row count: 0; expected: 1;
 *     statement executed: delete from webapi.SEC_USER_ROLE ...
 *   ObjectOptimisticLockingFailureException
 *   [d2e-compat] Token exchange failed: 500
 *
 * Every /WebAPI call used to exchange for itself, so a page that fans out hit
 * WebAPI with that many concurrent role rewrites. Atlas's data-source picker
 * asks /vocabulary/{key}/info for every source at once: on develop that is 16
 * parallel exchanges, one wins and the rest 500. The user sees no data sources
 * at all, and the dataset they pick is discarded because none of them validate
 * -- nothing that points at a role table.
 *
 * Sharing the in-flight promise makes those 16 into 1, which removes the race
 * rather than narrowing it: with a single writer there is no second delete to
 * lose. A plain result cache would NOT be enough -- the stampede happens before
 * any call has returned, so there would be nothing cached yet to reuse.
 *
 * Deliberately not caching the JWT afterwards. The map holds a promise only
 * while it is unresolved, so a later request always exchanges again and a role
 * change takes effect on the next call, exactly as before this.
 */
const inflightExchanges = new Map<string, Promise<string | null>>();

export async function getWebApiToken(logtoToken: string): Promise<string | null> {
  const subject = getTokenSubject(logtoToken);
  if (!subject) {
    console.error("[d2e-compat] Token exchange: cannot extract subject");
    return null;
  }

  const running = inflightExchanges.get(subject);
  if (running) return await running;

  const exchange = exchangeToken(logtoToken).finally(() => {
    // Cleared whatever the outcome: a failed exchange must not be latched as a
    // rejected promise that every later caller re-throws without retrying.
    inflightExchanges.delete(subject);
  });
  inflightExchanges.set(subject, exchange);

  return await exchange;
}

/** Test seam: the map is module state and outlives a single test. */
export function _resetInflightExchanges(): void {
  inflightExchanges.clear();
}
