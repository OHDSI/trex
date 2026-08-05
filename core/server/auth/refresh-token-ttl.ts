// Absolute lifetime for a refresh token, independent of rotation. Refresh
// tokens are single-use (revoked on redemption) but had no maximum age, so a
// leaked-but-unused token was redeemable indefinitely. This caps it.
// Configurable via REFRESH_TOKEN_TTL_DAYS; defaults to 30 days.
export function refreshTokenTtlDays(): number {
  const raw = Deno.env.get("REFRESH_TOKEN_TTL_DAYS");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * True if a refresh token issued at `createdAt` is older than its TTL and must
 * be rejected. Fails closed (returns true) on an unparseable timestamp.
 */
export function isRefreshTokenExpired(
  createdAt: Date | string | number,
  now: number = Date.now(),
  ttlDays: number = refreshTokenTtlDays(),
): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  return now - created > ttlDays * 24 * 60 * 60 * 1000;
}
