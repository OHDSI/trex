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
 * `openidDirect` validates the Logto token and answers in one hop with
 * `LoginService.Result` — {login, jwt, roles, message} — carrying the WebAPI
 * session JWT, mirrored in a `Bearer` response header (OidcAuthConfig
 * .OpenidDirect). There is no one-time-code handshake to redeem.
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
    const body = await response.json().catch(() => null) as { jwt?: string | null } | null;
    const jwt = body?.jwt || headerJwt;
    if (!jwt) {
      console.error("[d2e-compat] Token exchange: openidDirect returned no WebAPI JWT");
      return null;
    }

    return jwt;
  } catch (err) {
    console.error(`[d2e-compat] Token exchange error: ${err}`);
    return null;
  }
}

export async function getWebApiToken(logtoToken: string): Promise<string | null> {
  const subject = getTokenSubject(logtoToken);
  if (!subject) {
    console.error("[d2e-compat] Token exchange: cannot extract subject");
    return null;
  }

  return await exchangeToken(logtoToken);
}
