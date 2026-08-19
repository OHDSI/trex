import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
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
