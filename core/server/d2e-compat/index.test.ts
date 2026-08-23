// Kept out of the plugin tests so this file stays type-checkable: importing
// ./index.ts pulls in routes.ts, which has pre-existing Buffer type errors.
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { assertD2eProvisioned } from "./index.ts";

function withEnv(vars: Record<string, string>, fn: () => void) {
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) Deno.env.delete(k);
  }
}

Deno.test("assertD2eProvisioned is a no-op when D2E_COMPAT is disabled", () => {
  assertEquals(Deno.env.get("D2E_COMPAT"), undefined);
  assertD2eProvisioned(0);
});

Deno.test("assertD2eProvisioned passes when a provision plugin ran", () => {
  withEnv({
    D2E_COMPAT: "true",
    POSTGRES_MANAGE_CONFIG: "{}",
    POSTGRES_MANAGE_USERS: "{}",
  }, () => assertD2eProvisioned(1));
});

Deno.test("assertD2eProvisioned aborts a configured d2e with no provision plugin", () => {
  // The failure this exists to prevent: trex boots healthy onto an
  // unprovisioned database and alp-logto crash-loops on a missing role.
  withEnv({
    D2E_COMPAT: "true",
    POSTGRES_MANAGE_CONFIG: "{}",
    POSTGRES_MANAGE_USERS: "{}",
  }, () =>
    assertThrows(
      () => assertD2eProvisioned(0),
      Error,
      "no trex.provision plugin was found",
    ));
});

Deno.test("assertD2eProvisioned tolerates a d2e without bootstrap config", () => {
  withEnv({ D2E_COMPAT: "true" }, () => assertD2eProvisioned(0));
});
