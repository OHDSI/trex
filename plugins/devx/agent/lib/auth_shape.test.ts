// Unit tests for functions/auth_shape.ts's deriveAuthShape (final-007
// merge-gate re-review): the server-side, non-secret credential-shape hint
// that GET /provider-configs and GET /settings attach as `auth_shape`,
// computed from the UNMASKED api_key before masking. Lives here (agent/lib/)
// rather than next to the route because functions/ has no test harness of
// its own — this directory's suite invocation is the
// one that runs against functions/ code via relative imports, same as
// tools_batch_*/parity tests.
import { assertEquals } from "jsr:@std/assert";
import { deriveAuthShape } from "../../functions/auth_shape.ts";

Deno.test("deriveAuthShape: null/undefined/empty -> 'none'", () => {
  assertEquals(deriveAuthShape(null), "none");
  assertEquals(deriveAuthShape(undefined), "none");
  assertEquals(deriveAuthShape(""), "none");
});

Deno.test("deriveAuthShape: bearer-token-shaped JSON -> 'bearer'", () => {
  assertEquals(deriveAuthShape(JSON.stringify({ bearerToken: "bt-1" })), "bearer");
  // bearerToken wins even when IAM keys are also present (matches
  // SettingsPage.tsx's unpacking and legacy createModel's precedence).
  assertEquals(deriveAuthShape(JSON.stringify({ bearerToken: "bt-1", accessKeyId: "AKIA" })), "bearer");
});

Deno.test("deriveAuthShape: IAM-shaped JSON -> 'iam'", () => {
  assertEquals(deriveAuthShape(JSON.stringify({ accessKeyId: "AKIA...", secretAccessKey: "shh" })), "iam");
  assertEquals(deriveAuthShape(JSON.stringify({ accessKeyId: "AKIA..." })), "iam");
  assertEquals(deriveAuthShape(JSON.stringify({ secretAccessKey: "shh" })), "iam");
  // An EMPTY bearerToken does not count as bearer — the IAM keys decide.
  assertEquals(deriveAuthShape(JSON.stringify({ bearerToken: "", accessKeyId: "AKIA..." })), "iam");
});

Deno.test("deriveAuthShape: ordinary opaque keys (non-JSON) -> 'plain'", () => {
  assertEquals(deriveAuthShape("sk-ant-api03-abc123"), "plain");
  assertEquals(deriveAuthShape("not json at all"), "plain");
});

Deno.test("deriveAuthShape: valid-JSON scalars and neither-shape objects -> 'plain'", () => {
  assertEquals(deriveAuthShape("null"), "plain");
  assertEquals(deriveAuthShape("42"), "plain");
  assertEquals(deriveAuthShape('"a-bare-json-string"'), "plain");
  assertEquals(deriveAuthShape(JSON.stringify({ bearerToken: "" })), "plain");
  assertEquals(deriveAuthShape(JSON.stringify({ unrelated: true })), "plain");
  assertEquals(deriveAuthShape("{}"), "plain");
});

Deno.test("deriveAuthShape: a MASKED api_key (what GET responses carry) is never 'iam' — why the hint must be server-derived", () => {
  const raw = JSON.stringify({ accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "shh" });
  const masked = raw.substring(0, 8) + "..." + raw.slice(-4);
  assertEquals(deriveAuthShape(raw), "iam");
  assertEquals(deriveAuthShape(masked), "plain"); // masked form is unparseable
});
