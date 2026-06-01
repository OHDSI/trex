/**
 * Map a trex user role to the Postgres role PostGraphile should SET LOCAL.
 * Admins map to service_role (BYPASSRLS) per the Supabase-faithful design;
 * everyone else to authenticated, where RLS scopes them to their own rows.
 */
export function pgRoleForUserRole(trexRole: string): "authenticated" | "service_role" {
  return trexRole === "admin" ? "service_role" : "authenticated";
}
