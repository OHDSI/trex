import { assertEquals } from "jsr:@std/assert";
import {
  type EndSessionRow,
  looksLikeCompactJws,
  resolveEndSessionEndpoint,
} from "./upstream-logout.ts";

// A federated logout has to reach the upstream's end-session endpoint in a
// browser. The endpoint the upstream publishes is the one IT can see, which in
// a split deployment is an internal hostname no browser resolves, so the
// origin has to come from V13's authorization_endpoint instead. What must NOT
// happen is the PATH coming from there too: that turns a wrong origin into a
// wrong URL, which is worse, because a missing endpoint skips the hop cleanly
// and a fabricated one strands the browser.

const LOGTO: EndSessionRow = {
  issuer: "https://d2e-logto-1.d2e.local:3001/oidc",
  discovery_url: null,
  authorization_endpoint: "https://logto.example.com/oidc/auth",
  oidcConfig: null,
};

Deno.test("moves a discovered endpoint to the browser-facing origin", () => {
  assertEquals(
    resolveEndSessionEndpoint(
      LOGTO,
      "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
    ),
    "https://logto.example.com/oidc/session/end",
  );
});

Deno.test("keeps the upstream's own end-session path", () => {
  // Keycloak authorizes at /protocol/openid-connect/auth and ends sessions at
  // /protocol/openid-connect/logout. Deriving the path from the authorize URL
  // produces /protocol/openid-connect/session/end, which does not exist there.
  const keycloak: EndSessionRow = {
    issuer: "https://kc.internal:8443/realms/r",
    discovery_url: null,
    authorization_endpoint: "https://sso.example.com/realms/r/protocol/openid-connect/auth",
    oidcConfig: null,
  };
  assertEquals(
    resolveEndSessionEndpoint(
      keycloak,
      "https://kc.internal:8443/realms/r/protocol/openid-connect/logout",
    ),
    "https://sso.example.com/realms/r/protocol/openid-connect/logout",
  );
});

Deno.test("the operator's persisted value outranks discovery", () => {
  const row: EndSessionRow = {
    ...LOGTO,
    oidcConfig: { end_session_endpoint: "https://logto.example.com/oidc/session/end" },
  };
  assertEquals(
    resolveEndSessionEndpoint(row, "https://d2e-logto-1.d2e.local:3001/oidc/elsewhere"),
    "https://logto.example.com/oidc/session/end",
  );
});

Deno.test("a persisted value off the issuer's origin is left alone", () => {
  // The operator has already said where the browser goes. Rewriting it to the
  // authorize origin would discard that answer.
  const row: EndSessionRow = {
    ...LOGTO,
    oidcConfig: { end_session_endpoint: "https://logout.elsewhere.example/end" },
  };
  assertEquals(
    resolveEndSessionEndpoint(row, null),
    "https://logout.elsewhere.example/end",
  );
});

Deno.test("an upstream that publishes no endpoint skips the hop", () => {
  assertEquals(resolveEndSessionEndpoint(LOGTO, null), null);
  assertEquals(resolveEndSessionEndpoint({ ...LOGTO, oidcConfig: {} }, ""), null);
});

Deno.test("no override leaves the published endpoint as it is", () => {
  // Nothing on the row is browser-facing, so there is nothing to move it to.
  assertEquals(
    resolveEndSessionEndpoint(
      { ...LOGTO, authorization_endpoint: null },
      "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
    ),
    "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
  );
});

Deno.test("a whitespace-only override counts as absent", () => {
  // sso-config.ts's rule for this column, which exists for hand-edited rows.
  assertEquals(
    resolveEndSessionEndpoint(
      { ...LOGTO, authorization_endpoint: "   " },
      "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
    ),
    "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
  );
});

Deno.test("an override with surrounding whitespace still applies", () => {
  assertEquals(
    resolveEndSessionEndpoint(
      { ...LOGTO, authorization_endpoint: "  https://logto.example.com/oidc/auth\n" },
      "https://d2e-logto-1.d2e.local:3001/oidc/session/end",
    ),
    "https://logto.example.com/oidc/session/end",
  );
});

Deno.test("an endpoint already on the browser-facing origin is unchanged", () => {
  assertEquals(
    resolveEndSessionEndpoint(
      { ...LOGTO, issuer: "https://logto.example.com/oidc" },
      "https://logto.example.com/oidc/session/end",
    ),
    "https://logto.example.com/oidc/session/end",
  );
});

Deno.test("query and fragment survive the move", () => {
  assertEquals(
    resolveEndSessionEndpoint(
      LOGTO,
      "https://d2e-logto-1.d2e.local:3001/oidc/session/end?client_id=abc#x",
    ),
    "https://logto.example.com/oidc/session/end?client_id=abc#x",
  );
});

Deno.test("a non-URL endpoint resolves to nothing rather than a bad redirect", () => {
  assertEquals(resolveEndSessionEndpoint(LOGTO, "not-a-url"), null);
});

// The hint guard. A column that went through the DEK hook twice decrypts
// cleanly to the inner ciphertext, so the bad value arrives as a plausible
// string rather than as a throw — and DEK ciphertext is one base64 blob with
// no dots, which is what separates it from a token.
Deno.test("accepts a compact JWS", () => {
  assertEquals(looksLikeCompactJws("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1LTEifQ.c2ln"), true);
});

Deno.test("rejects double-encrypted ciphertext and other non-tokens", () => {
  assertEquals(looksLikeCompactJws("YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="), false);
  assertEquals(looksLikeCompactJws("header.payload"), false);
  assertEquals(looksLikeCompactJws("a.b.c.d"), false);
  assertEquals(looksLikeCompactJws(""), false);
  assertEquals(looksLikeCompactJws("he ader.payload.sig"), false);
});
