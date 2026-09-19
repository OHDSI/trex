// The federation block trex writes onto a user, read back.
//
// The producer is federation/router.ts, which writes trexdb."user".app_metadata
// inside the callback transaction; the consumer is oidc/custom-claims.ts, which
// spreads federationFromAppMetadata(user.app_metadata) into the claims the
// plugin emits. These exercise the join between the two without a database;
// custom-claims.test.ts covers what the claims callback then does with it.
import { assertEquals } from "jsr:@std/assert";
import { federationFromAppMetadata, IDP_METADATA_KEY } from "./claims.ts";

Deno.test("a federated session's app_metadata is read back as provider and groups", () => {
  const written = {
    provider: "sso",
    trex_role: "user",
    [IDP_METADATA_KEY]: { provider: "logto", groups: ["alp-admins", "study-42"] },
  };
  assertEquals(federationFromAppMetadata(written), {
    idpProvider: "logto",
    idpGroups: ["alp-admins", "study-42"],
  });
});

Deno.test("a native session's app_metadata yields no idp fields at all", () => {
  const native = { provider: "email", providers: ["email"], trex_role: "user" };
  assertEquals(federationFromAppMetadata(native), {});
});

// app_metadata is a free-form JSONB column that long predates federation.
Deno.test("a malformed federation block degrades to a native session", () => {
  assertEquals(federationFromAppMetadata(null), {});
  assertEquals(federationFromAppMetadata(undefined), {});
  assertEquals(federationFromAppMetadata("nonsense"), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: "logto" }), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: { groups: ["a"] } }), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "" } }), {});
  // A provider with an unusable group list is still a federated session; it
  // simply asserts no groups, rather than being demoted to a native one.
  assertEquals(
    federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "logto" } }),
    { idpProvider: "logto", idpGroups: [] },
  );
  assertEquals(
    federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "logto", groups: [1, 2] } }),
    { idpProvider: "logto", idpGroups: [] },
  );
});
