// @ts-nocheck - Deno edge function
/**
 * Figma REST API authentication routes (personal access token).
 *
 * Replaces the former figma-mcp OAuth flow. Figma's dynamic client
 * registration only issues mcp:connect-scoped clients (verified live
 * 2026-08-23 via /.well-known/oauth-authorization-server: scopes_supported =
 * ["mcp:connect"]), so a headless deployment can never OAuth its way to the
 * REST API. A personal access token (Figma → Settings → Security, scope
 * file_content:read) works everywhere via the X-Figma-Token header.
 *
 * Storage follows github_routes.ts: AES-256-GCM via crypto.ts, one row in
 * devx.integrations (provider='figma'); the account handle lives in the
 * metadata JSONB for the Settings UI.
 */
import { decryptToken, encryptToken } from "../crypto.ts";

export const FIGMA_API = "https://api.figma.com";

/**
 * Decrypted PAT for this user, or null when not connected / not decryptable.
 * Shared by the Figma tools and the Claude Code sidecar env.
 */
export async function getFigmaToken(userId: string, sql): Promise<string | null> {
  const result = await sql(
    `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'figma' LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  try {
    return await decryptToken(result.rows[0].encrypted_token, result.rows[0].token_iv);
  } catch (err) {
    console.warn("[figma] could not decrypt stored token:", err?.message || err);
    return null;
  }
}

export async function handleFigmaRoutes(
  path: string,
  method: string,
  req: Request,
  userId: string,
  sql,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // GET /figma/status — from the DB row only; no live call, no token echo.
  if (path.endsWith("/figma/status") && method === "GET") {
    const result = await sql(
      `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = 'figma' LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    const metadata = typeof row?.metadata === "string" ? JSON.parse(row.metadata) : row?.metadata;
    return Response.json(
      { connected: !!row, handle: metadata?.handle ?? null },
      { headers: corsHeaders },
    );
  }

  // POST /figma/token {token} — validate live, then store encrypted.
  if (path.endsWith("/figma/token") && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token) {
        return Response.json({ error: "token is required" }, { status: 400, headers: corsHeaders });
      }
      const me = await fetch(`${FIGMA_API}/v1/me`, { headers: { "X-Figma-Token": token } });
      if (!me.ok) {
        return Response.json(
          {
            error:
              `Figma rejected the token (${me.status}). Generate one under Figma → Settings → Security with the file_content:read scope.`,
          },
          { status: 400, headers: corsHeaders },
        );
      }
      const user = await me.json();
      const { ciphertext, iv } = await encryptToken(token);
      const metadata = JSON.stringify({ handle: user.handle ?? null, email: user.email ?? null });
      await sql(
        `INSERT INTO devx.integrations (user_id, provider, name, encrypted_token, token_iv, metadata, updated_at)
         VALUES ($1, 'figma', 'figma', $2, $3, $4::jsonb, NOW())
         ON CONFLICT (user_id, provider, name)
         DO UPDATE SET encrypted_token = $2, token_iv = $3, metadata = $4::jsonb, updated_at = NOW()`,
        [userId, ciphertext, iv, metadata],
      );
      return Response.json({ connected: true, handle: user.handle ?? null }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /figma/logout — forget the token.
  if (path.endsWith("/figma/logout") && method === "POST") {
    await sql(`DELETE FROM devx.integrations WHERE user_id = $1 AND provider = 'figma'`, [userId]);
    return Response.json({ connected: false }, { headers: corsHeaders });
  }

  return null;
}
