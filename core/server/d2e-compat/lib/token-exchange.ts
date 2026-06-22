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

async function exchangeToken(logtoToken: string): Promise<string | null> {
  const webApiUrl = "http://localhost:8080/WebAPI/user/login/openidDirect";

  try {
    console.log(`[d2e-compat] Token exchange: calling ${webApiUrl}`);
    const response = await fetch(webApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${logtoToken}`,
      },
    });

    console.log(`[d2e-compat] Token exchange response: status=${response.status}`);

    if (!response.ok) {
      const body = await response.text();
      console.error(`[d2e-compat] Token exchange failed: ${response.status} ${body}`);
      return null;
    }

    const webApiToken = response.headers.get("Bearer");
    if (!webApiToken) {
      const headerNames: string[] = [];
      response.headers.forEach((_v, k) => headerNames.push(k));
      console.error(
        `[d2e-compat] Token exchange: no Bearer header in response. Response header names: ${headerNames.join(", ")}`,
      );
      return null;
    }

    console.log("[d2e-compat] Token exchange: success");
    return webApiToken;
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
