import { assertEquals } from "jsr:@std/assert";
import { toAuthenticatorUrl } from "./db-url.ts";

Deno.test("toAuthenticatorUrl swaps user and password to authenticator", () => {
  assertEquals(
    toAuthenticatorUrl("postgres://postgres:secret@db:5432/testdb"),
    "postgres://authenticator:authenticator_pass@db:5432/testdb",
  );
});

Deno.test("toAuthenticatorUrl preserves host, port, db name and query params", () => {
  assertEquals(
    toAuthenticatorUrl("postgresql://owner:pw@127.0.0.1:6543/trex?sslmode=require"),
    "postgresql://authenticator:authenticator_pass@127.0.0.1:6543/trex?sslmode=require",
  );
});

Deno.test("toAuthenticatorUrl only rewrites the first @ (credential segment)", () => {
  assertEquals(
    toAuthenticatorUrl("postgres://postgres@db:5432/testdb"),
    "postgres://authenticator:authenticator_pass@db:5432/testdb",
  );
});

Deno.test("toAuthenticatorUrl throws when the URL has no credential segment", () => {
  let threw = false;
  try {
    toAuthenticatorUrl("postgres://db:5432/testdb");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
