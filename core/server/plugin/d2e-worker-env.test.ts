import { assertEquals } from "jsr:@std/assert";
import { d2eWorkerEnv } from "./d2e-worker-env.ts";

const deps = (env: Record<string, string>, key?: string) => ({
  get: (k: string) => env[k],
  databaseCredentialsJson: () => "[]",
  serviceRoleKey: () => Promise.resolve(key),
});

Deno.test("outside d2e only SERVICE_ROUTES passes through, and only when set", async () => {
  assertEquals(await d2eWorkerEnv(deps({})), {});
  assertEquals(await d2eWorkerEnv(deps({ SERVICE_ROUTES: "{}" })), { SERVICE_ROUTES: "{}" });
});

Deno.test("under d2e workers get the DB registry and the service-role key", async () => {
  assertEquals(await d2eWorkerEnv(deps({ D2E_COMPAT: "true" }, "srk")), {
    DATABASE_CREDENTIALS: "[]",
    SUPABASE_SERVICE_ROLE_KEY: "srk",
  });
});

Deno.test("a key that cannot be resolved is left out rather than set empty", async () => {
  const failing = { ...deps({ D2E_COMPAT: "true" }), serviceRoleKey: () => Promise.reject(new Error("db down")) };
  assertEquals(await d2eWorkerEnv(failing), { DATABASE_CREDENTIALS: "[]" });
});
