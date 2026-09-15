import { assertEquals } from "jsr:@std/assert";
import { d2eWorkerEnv } from "./d2e-worker-env.ts";

const deps = (
  env: Record<string, string>,
  key?: string,
  pluginName?: string,
  runtimeRegistered = false,
) => ({
  get: (k: string) => env[k],
  databaseCredentialsJson: () => "[]",
  serviceRoleKey: () => Promise.resolve(key),
  pluginName,
  runtimeRegistered,
});

Deno.test("outside d2e only SERVICE_ROUTES passes through, and only when set", async () => {
  assertEquals(await d2eWorkerEnv(deps({})), {});
  assertEquals(await d2eWorkerEnv(deps({ SERVICE_ROUTES: "{}" })), { SERVICE_ROUTES: "{}" });
});

Deno.test("under d2e a @data2evidence/ plugin gets the DB registry and the service-role key", async () => {
  assertEquals(
    await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk", "@data2evidence/d2e-functions")),
    { DATABASE_CREDENTIALS: "[]", SUPABASE_SERVICE_ROLE_KEY: "srk" },
  );
});

Deno.test("under d2e a non-d2e plugin gets the DB registry but not the service-role key", async () => {
  assertEquals(
    await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk", "@trex/agents")),
    { DATABASE_CREDENTIALS: "[]" },
  );
  assertEquals(
    await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk", undefined)),
    { DATABASE_CREDENTIALS: "[]" },
  );
});

Deno.test("a key that cannot be resolved is left out rather than set empty", async () => {
  const failing = {
    ...deps({ D2E_COMPAT: "true" }, undefined, "@data2evidence/d2e-functions"),
    serviceRoleKey: () => Promise.reject(new Error("db down")),
  };
  assertEquals(await d2eWorkerEnv(failing), { DATABASE_CREDENTIALS: "[]" });
});

// F1: a devx app registered at runtime (Plugins.registerFromPath) can self-declare
// any package name in its own package.json, including "@data2evidence/...". Trusting
// that name for the service-role key grant would let it mint a request carrying a
// 100-year service_role JWT able to call /admin/federation — account takeover. Only
// a plugin the boot-time directory scan found (PLUGINS_DEV_PATH/PLUGINS_PATH) may
// receive the key.
Deno.test("a runtime-registered @data2evidence/ plugin does not get the service-role key, but still gets the DB registry", async () => {
  assertEquals(
    await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk", "@data2evidence/d2e-functions", true)),
    { DATABASE_CREDENTIALS: "[]" },
  );
});

Deno.test("a boot-scanned @data2evidence/ plugin still gets the service-role key", async () => {
  assertEquals(
    await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk", "@data2evidence/d2e-functions", false)),
    { DATABASE_CREDENTIALS: "[]", SUPABASE_SERVICE_ROLE_KEY: "srk" },
  );
});
