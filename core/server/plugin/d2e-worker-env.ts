// Environment the engine adds to every plugin worker, request and init alike.
// Kept in one place because _callWorker and _callInit carried identical copies.

export interface D2eWorkerEnvDeps {
  get: (key: string) => string | undefined;
  databaseCredentialsJson: () => string;
  serviceRoleKey: () => Promise<string | undefined>;
  // The plugin's package name (e.g. "@data2evidence/d2e-functions"), as
  // addPlugin/_addFunction know it.
  pluginName?: string;
  // True when this plugin was registered through Plugins.registerFromPath —
  // the devx/runtime registration path (a live HTTP call, or the re-register
  // of a devx.apps row at boot) — rather than found by the boot-time
  // directory scan of PLUGINS_DEV_PATH/PLUGINS_PATH. A runtime-registered
  // plugin's package.json is not something trex vetted: a devx app can name
  // itself "@data2evidence/anything" and, without this flag, would receive a
  // 100-year service_role JWT able to call /admin/federation — account
  // takeover. So the key goes ONLY to a plugin from the boot-time scan whose
  // package name is in the "@data2evidence/" scope; PLUGINS_DEV_PATH counts
  // as boot-scanned here (it is an operator-controlled mount, not
  // attacker-reachable at runtime). Trusted @trex/@ohdsi plugins and agent
  // workers never get it either way, regardless of this flag, because their
  // package name is never in scope.
  //
  // Fails closed: only an explicit `false` counts as boot-scanned. `true`
  // AND a missing/undefined value both deny the key — a caller that forgets
  // to pass this (as memory/gbrain-worker/mount.ts's _addFunction call once
  // did, an 8-argument call against a 9-argument signature that a plain
  // `deno test --no-check` run doesn't type-check) must not silently fall
  // back to the trusted branch.
  runtimeRegistered?: boolean;
}

const D2E_SCOPE_PREFIX = "@data2evidence/";

export async function d2eWorkerEnv(deps: D2eWorkerEnvDeps): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // d2e functions build their `services` object from SERVICE_ROUTES.
  const routes = deps.get("SERVICE_ROUTES");
  if (routes) out.SERVICE_ROUTES = routes;
  if (deps.get("D2E_COMPAT") !== "true") return out;

  // The live DB registry, as d2e fed its services DATABASE_CREDENTIALS.
  out.DATABASE_CREDENTIALS = deps.databaseCredentialsJson();
  // deps.runtimeRegistered !== false (i.e. true OR undefined) denies the key —
  // see the deny-by-default note on the field above.
  if (deps.runtimeRegistered !== false || !deps.pluginName?.startsWith(D2E_SCOPE_PREFIX)) return out;

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
