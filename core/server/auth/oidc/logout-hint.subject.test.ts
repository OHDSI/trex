import { assertEquals } from "jsr:@std/assert";
import { subjectFromHint } from "./logout-hint.ts";

// A federated logout ended trex's session and left the upstream's alone, so the
// next sign-in reused it and never asked who the user was. Deciding whether to
// offer the extra hop starts with reading the hint, and the hint arrives
// base64url — the encoding the decoder has to get right for any of it to run.

// Encoded the way a real token is: UTF-8 bytes, then base64url. btoa alone
// would encode UTF-16 code units as Latin-1 and disagree with every issuer.
const hintFor = (payload: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${b64}.signature`;
};

Deno.test("reads the subject out of an id_token_hint", () => {
  assertEquals(subjectFromHint(hintFor({ sub: "user-1", aud: "d2e" })), "user-1");
});

Deno.test("decodes base64url, not base64", () => {
  // A raw base64 decode mangles any payload containing - or _, and the sub is
  // then read off a different object or not at all.
  const sub = "a-b_c" + "ÿ".repeat(3);
  assertEquals(subjectFromHint(hintFor({ sub })), sub);
});

Deno.test("no hint, no subject", () => {
  assertEquals(subjectFromHint(null), null);
});

Deno.test("a hint that is not a JWT yields no subject rather than throwing", () => {
  // The logout must not fail because the hint was junk: trex's session is
  // already gone by the time this runs.
  assertEquals(subjectFromHint("not-a-jwt"), null);
  assertEquals(subjectFromHint("a.!!!.c"), null);
  assertEquals(subjectFromHint(hintFor({ aud: "d2e" })), null);
});
