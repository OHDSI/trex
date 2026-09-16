import { assertEquals } from "jsr:@std/assert";
import { loadExternalProviders } from "./settings-providers.ts";

// Deliberately explicit in every call below: both parameters default to an
// environment read (TREX_FEDERATION_ENABLED and
// TREX_NATIVE_PASSWORD_LOGIN_ENABLED), and a test that let a default fire would
// pass or fail with the developer's environment.
Deno.test("a failing provider query still yields email-only settings", async () => {
  // Simulates a missing sso_provider table (pre-migration) or a transient
  // database error. /settings must still resolve with something a sign-in
  // page can render — email/password only — rather than 500ing the whole
  // GoTrue-compatible discovery endpoint that runs unconditionally at boot.
  const failingClient = {
    query: () => Promise.reject(new Error(`relation "trexdb.sso_provider" does not exist`)),
  };
  const external = await loadExternalProviders(failingClient, true, true);
  assertEquals(external, { email: true });
});

Deno.test("a successful provider query is advertised alongside email", async () => {
  const client = {
    query: () =>
      Promise.resolve({
        rows: [{
          id: "entra",
          displayName: "Entra",
          clientId: "x",
          clientSecret: "y",
          issuer: "https://entra.example",
          discovery_url: null,
          scopes: [],
          claim_map: {},
          groups_source: null,
          groups_claim: null,
          link_policy: null,
          auto_provision: false,
        }],
      }),
  };
  const external = await loadExternalProviders(client, true, true);
  assertEquals(external, { email: true, entra: true });
});

// The routes are mounted only when TREX_FEDERATION_ENABLED is on. Advertising
// a provider while they are not gives the sign-in page a button whose
// /authorize does not exist.
Deno.test("providers are not advertised while federation is disabled", async () => {
  let asked = false;
  const client = {
    query: () => {
      asked = true;
      return Promise.resolve({
        rows: [{
          id: "entra",
          displayName: "Entra",
          clientId: "x",
          clientSecret: "y",
          issuer: "https://entra.example",
          discovery_url: null,
          scopes: [],
          claim_map: {},
          groups_source: null,
          groups_claim: null,
          link_policy: null,
          auto_provision: false,
        }],
      });
    },
  };
  assertEquals(await loadExternalProviders(client, false, true), { email: true });
  // Not merely hidden: a disabled deployment does not query for them at all.
  assertEquals(asked, false);
});

// The native password form is itself a switch. An installation federating a
// directory of passwordless accounts has nobody whose password would work, so
// offering the form there reads as a broken login rather than an absent one.
Deno.test("the native password form is advertised unless it is turned off", async () => {
  const client = { query: () => Promise.resolve({ rows: [] }) };
  assertEquals(await loadExternalProviders(client, false, true), { email: true });
  assertEquals(await loadExternalProviders(client, false, false), { email: false });
});

// The one test that lets the default fire, with the variable pinned unset:
// an existing deployment that never heard of the flag keeps its password form.
Deno.test("the native password form is advertised by default", async () => {
  const saved = Deno.env.get("TREX_NATIVE_PASSWORD_LOGIN_ENABLED");
  Deno.env.delete("TREX_NATIVE_PASSWORD_LOGIN_ENABLED");
  try {
    const client = { query: () => Promise.resolve({ rows: [] }) };
    assertEquals(await loadExternalProviders(client, false), { email: true });
  } finally {
    if (saved !== undefined) Deno.env.set("TREX_NATIVE_PASSWORD_LOGIN_ENABLED", saved);
  }
});

Deno.test("turning the password form off leaves the upstream providers advertised", async () => {
  const client = {
    query: () =>
      Promise.resolve({
        rows: [{
          id: "logto",
          displayName: "Logto",
          clientId: "x",
          clientSecret: "y",
          issuer: "https://logto.example",
          discovery_url: null,
          scopes: [],
          claim_map: {},
          groups_source: null,
          groups_claim: null,
          link_policy: null,
          auto_provision: false,
        }],
      }),
  };
  assertEquals(await loadExternalProviders(client, true, false), { email: false, logto: true });
});
