// @ts-nocheck — ../../auth/keys.ts resolves inside the staged agent worker only
// (core copies its auth dir next to the servicePath), same as claw's code-stream.
export function loopbackRoot(): string {
  return (Deno.env.get("SLACK_GATEWAY_LOOPBACK_URL")?.trim() ||
    Deno.env.get("DISCORD_GATEWAY_LOOPBACK_URL")?.trim() ||
    "http://127.0.0.1:33001").replace(/\/+$/, "");
}

export function devxApiBase(): string {
  return `${loopbackRoot()}/plugins/trex/devx-api`;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Mint the same HS256 access token core issues at login (see claw's
// code-stream.ts:41-64 — identical mechanism, signing key from auth/keys.ts).
export async function mintToken(userId: string): Promise<string> {
  const { deriveSubkeyBase64, LABELS } = await import("../../auth/keys.ts");
  const secret = await deriveSubkeyBase64(LABELS.jwtHs256);
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({
    sub: userId, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600,
  })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

export function supportUserId(): string | undefined {
  const v = Deno.env.get("D2ESUPPORT_USER_ID")?.trim();
  return v || undefined;
}
