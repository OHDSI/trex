// The trex native identity provider — the GoTrue-compatible email/password auth
// in auth-router.ts (signup, /token password+refresh grant, recover,
// change-password, ...) — is DISABLED by default. A deployment fronted by an
// external IdP (e.g. d2e + Logto) never wants native logins or the seeded
// admin@trex.local credential; local/standalone stacks set TREX_IDP_ENABLED=true
// to turn it on.
export function nativeIdpEnabled(
  raw: string | undefined = Deno.env.get("TREX_IDP_ENABLED"),
): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
