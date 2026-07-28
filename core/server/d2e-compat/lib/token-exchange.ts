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
 * WebAPI's OIDC login is a two-step handshake: `openidDirect` validates the
 * Logto token and answers with a short-lived single-use code, which
 * `otc` then exchanges for the WebAPI session JWT.
 */
async function exchangeToken(logtoToken: string): Promise<string | null> {
  try {
    const codeResponse = await fetch(`${WEBAPI_BASE_URL}/user/login/openidDirect`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${logtoToken}`,
      },
    });

    if (!codeResponse.ok) {
      console.error(
        `[d2e-compat] Token exchange failed: ${codeResponse.status} ${await codeResponse.text()}`,
      );
      return null;
    }

    const { code } = await codeResponse.json() as { code?: string };
    if (!code) {
      console.error("[d2e-compat] Token exchange: openidDirect returned no one-time code");
      return null;
    }

    const jwtResponse = await fetch(
      `${WEBAPI_BASE_URL}/user/login/otc?code=${encodeURIComponent(code)}`,
    );

    if (!jwtResponse.ok) {
      console.error(
        `[d2e-compat] Token exchange: one-time code rejected: ${jwtResponse.status} ${await jwtResponse.text()}`,
      );
      return null;
    }

    const { jwt } = await jwtResponse.json() as { jwt?: string };
    if (!jwt) {
      console.error("[d2e-compat] Token exchange: redeemed one-time code carried no JWT");
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
