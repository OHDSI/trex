// Identity headers the gateway injects into the worker request from VERIFIED
// auth context (authContext/pluginAuthz on the trex path, d2eAuthn on the d2e
// path). Workers such as the sibyl functions (metadata-api, hades-api,
// network-api) treat `x-user-id` as an authenticated identity, so a client must
// never be able to supply these headers directly. They are stripped from the
// inbound request before the verified values are set — otherwise a forged
// `x-user-id` on a request that carries no verified identity (anon route,
// no-scope route, or the d2e path where pgSettings is unset) would pass through
// untouched and impersonate any user.
export const INJECTED_IDENTITY_HEADERS = ["x-user-id", "x-user-role"];

// Hop-by-hop / body headers the outer proxy or fetch must recompute. Stripped
// so the worker doesn't double-compress or truncate on a rebuilt body.
const TRANSPORT_STRIP_HEADERS = [
  "accept-encoding",
  "content-length",
  "transfer-encoding",
];

const STRIP_HEADERS = new Set<string>([
  ...TRANSPORT_STRIP_HEADERS,
  ...INJECTED_IDENTITY_HEADERS,
]);

export interface WorkerAuthContext {
  userId?: string | null;
  userRole?: string | null;
}

/**
 * Build the header set forwarded to a plugin worker from the inbound request
 * headers plus the verified auth context. Client-supplied identity headers are
 * dropped; identity is set ONLY from the verified context.
 */
export function buildWorkerHeaders(
  reqHeaders: Record<string, unknown>,
  auth: WorkerAuthContext,
): Headers {
  const headers = new Headers();
  for (const [key, val] of Object.entries(reqHeaders)) {
    if (!val) continue;
    if (STRIP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
  }
  if (auth.userId) headers.set("x-user-id", auth.userId);
  if (auth.userRole) headers.set("x-user-role", auth.userRole);
  return headers;
}
