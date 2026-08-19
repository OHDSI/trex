import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describeCoderError } from "./code-error.ts";

Deno.test("auth_expired names the repair action", () => {
  const got = describeCoderError("auth_expired", "401 OAuth access token has expired");
  assertStringIncludes(got, "re-authenticate");
});

Deno.test("workspace_boot_failed says it is not the team's code", () => {
  const got = describeCoderError("workspace_boot_failed", "brotli error");
  assertStringIncludes(got, "workspace runtime");
  assertStringIncludes(got, "not a problem in your repository");
});

Deno.test("an unknown code still surfaces the raw message", () => {
  const got = describeCoderError(undefined, "socket hang up while streaming");
  assertStringIncludes(got, "socket hang up while streaming");
});

Deno.test("no code and no raw degrades honestly", () => {
  assertEquals(
    describeCoderError(undefined, undefined),
    "The coding session failed without reporting a reason. Nothing was changed.",
  );
});

// `code: "constructor"` must not resolve to Function.prototype.constructor
// via an unguarded SENTENCES[code] index — it must fall through to the
// raw-message branch like any other unknown code.
Deno.test("a prototype-polluting code falls through to the raw message instead of resolving a function", () => {
  const got = describeCoderError("constructor", "some raw detail");
  assertStringIncludes(got, "some raw detail");
});

// An unclassified raw error is whatever the upstream provider produced — it
// can quote back a credential (a common shape in 401/403 bodies) or run
// arbitrarily long. Both must be cleaned up before the message reaches
// Discord.
Deno.test("obvious secret shapes are scrubbed from an unclassified raw error", () => {
  const got = describeCoderError(undefined, "401 unauthorized: Bearer sk-abcdefgh12345678 rejected, token=xyz789 key=abc123");
  assertEquals(got.includes("sk-abcdefgh12345678"), false);
  assertEquals(got.includes("xyz789"), false);
  assertEquals(got.includes("abc123"), false);
  assertStringIncludes(got, "[redacted]");
});

Deno.test("an overlong unclassified raw error is capped", () => {
  const got = describeCoderError(undefined, "x".repeat(5000));
  assert(got.length < 400, `expected a capped message, got length ${got.length}`);
});
