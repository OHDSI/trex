/**
 * d2e UserMgmt group resolution for the central authz gate — ported from d2e's
 * pre-migration auth/authz.ts + api/UserMgmtAPI.ts.
 *
 * The Logto access token carries only coarse `roles` (Logto scope names), NOT the
 * `userMgmtGroups` (alp_role_* flags) the role/URL scope check needs. Old main
 * fetched those per-request from the usermgmt service (POST /user-group/list) and
 * cached them by the token's `jti`. This does the same against the in-process
 * usermgmt worker so a non-admin caller resolves the scopes old main granted.
 */

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 10_000;
type Entry = { value: Record<string, unknown>; expiresAt: number };
const groupsCache = new Map<string, Entry>();

function usermgmtBase(): string {
  try {
    const routes = JSON.parse(Deno.env.get("SERVICE_ROUTES") ?? "{}");
    if (routes && typeof routes.usermgmt === "string" && routes.usermgmt) {
      return routes.usermgmt as string;
    }
  } catch (_) {
    // fall through to the in-process default
  }
  return "http://localhost:8000/usermgmt/api";
}

/**
 * Resolve a user's userMgmtGroups (the `alp_role_*` metadata) via the usermgmt
 * worker, cached by `jti:idpUserId` (TTL bounded by the token's own expiry, capped
 * at 60s — same policy old main used). Returns null on any failure so the caller
 * can fail closed.
 */
export async function fetchUserGroups(
  bearerJwt: string,
  idpUserId: string,
  jti?: string,
  exp?: number,
): Promise<Record<string, unknown> | null> {
  const key = jti ? `${jti}:${idpUserId}` : undefined;
  if (key) {
    const cached = groupsCache.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.value;
      groupsCache.delete(key);
    }
  }

  const url = `${usermgmtBase()}/user-group/list`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerJwt}`,
      },
      body: JSON.stringify({ userId: idpUserId }),
    });
    if (!res.ok) {
      console.error(`[d2e-compat] user-group/list ${res.status} for ${idpUserId}`);
      return null;
    }
    const body = await res.json();
    // Old main read the axios response body (result.data); with fetch that is the
    // JSON body itself, but tolerate a { data } envelope too.
    const groups = body && typeof body === "object" && "data" in body
      ? (body as { data: unknown }).data
      : body;

    if (key && typeof exp === "number") {
      const expiresAt = Math.min(exp * 1000, Date.now() + CACHE_TTL_MS);
      if (expiresAt > Date.now()) {
        if (groupsCache.size >= CACHE_MAX) {
          const oldest = groupsCache.keys().next().value;
          if (oldest) groupsCache.delete(oldest);
        }
        groupsCache.set(key, { value: groups as Record<string, unknown>, expiresAt });
      }
    }
    return groups as Record<string, unknown>;
  } catch (err) {
    console.error(`[d2e-compat] user-group/list fetch failed: ${err}`);
    return null;
  }
}
