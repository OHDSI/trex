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

export async function getWebApiToken(logtoToken: string): Promise<string | null> {
  const subject = getTokenSubject(logtoToken);
  if (!subject) {
    console.error("[d2e-compat] Token exchange: cannot extract subject");
    return null;
  }

  return await exchangeToken(logtoToken);
}
