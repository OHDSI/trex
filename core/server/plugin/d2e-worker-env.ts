// Environment the engine adds to every plugin worker, request and init alike.
// Kept in one place because _callWorker and _callInit carried identical copies.

export interface D2eWorkerEnvDeps {
  get: (key: string) => string | undefined;
  databaseCredentialsJson: () => string;
  serviceRoleKey: () => Promise<string | undefined>;
}

export async function d2eWorkerEnv(deps: D2eWorkerEnvDeps): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // d2e functions build their `services` object from SERVICE_ROUTES.
  const routes = deps.get("SERVICE_ROUTES");
  if (routes) out.SERVICE_ROUTES = routes;
  if (deps.get("D2E_COMPAT") !== "true") return out;

  // The live DB registry, as d2e fed its services DATABASE_CREDENTIALS.
  out.DATABASE_CREDENTIALS = deps.databaseCredentialsJson();
  // d2e functions call trex's admin APIs (roles, federation) with this key.
  // Edge functions already receive it; plugin workers did not, which left
  // deployments without a way to hand it over (Helm) unable to write roles.
  try {
    const key = await deps.serviceRoleKey();
    if (key) out.SUPABASE_SERVICE_ROLE_KEY = key;
  } catch (err) {
    console.warn("[plugin] service-role key unavailable for d2e workers:", err);
  }
  return out;
}
