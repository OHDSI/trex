import { assertEquals } from "jsr:@std/assert";
import { d2eWorkerEnv } from "./d2e-worker-env.ts";

const deps = (env: Record<string, string>, key?: string, pluginName?: string) => ({
  get: (k: string) => env[k],
  databaseCredentialsJson: () => "[]",
  serviceRoleKey: () => Promise.resolve(key),
  pluginName,
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
