import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { classifyCoderError } from "./error_codes.ts";

Deno.test("classifies an expired OAuth token", () => {
  const got = classifyCoderError("API Error: 401 OAuth access token has expired. Re-authenticate to continue.");
  assertEquals(got.code, "auth_expired");
});

Deno.test("classifies a Deno runtime boot failure", () => {
  const got = classifyCoderError(
    "failed to bootstrap runtime: https://deno.land/std@0.214.0/crypto/_wasm/lib/deno_std_wasm_crypto.generated.mjs: brotli error",
  );
  assertEquals(got.code, "workspace_boot_failed");
});

Deno.test("classifies rate limits and quota separately", () => {
  assertEquals(classifyCoderError("429 Rate limit exceeded").code, "rate_limited");
  assertEquals(classifyCoderError("API quota exceeded for this org").code, "quota");
});

Deno.test("falls back to unclassified with a generic safe message", () => {
  const got = classifyCoderError("something nobody predicted");
  assertEquals(got.code, "unclassified");
  assertEquals(got.safe, "An error occurred while generating a response. Check the server logs for details.");
});

// Wrong-base and already-open-PR both produced multi-turn retry loops in the
// live system: the coder reran the identical command four times because the
// raw git/gh text gave it nothing to act on. Both classifiers must sit ahead
// of the generic 404 / "not found" checks, whose substrings appear inside this
// output for unrelated reasons.
Deno.test("classifyCoderError: an unrelated base branch is named as the problem, not retried", () => {
  for (
    const raw of [
      `pull request create failed: GraphQL: The trex/data-source-access-state-ui branch has no history in common with develop`,
      `fatal: refusing to merge unrelated histories`,
      `The rebase failed because the feature branch has 2137 unrelated commits`,
    ]
  ) {
    const { code, safe } = classifyCoderError(raw);
    assertEquals(code, "git_unrelated_base", `misclassified: ${raw}`);
    assertStringIncludes(safe, "origin/HEAD");
    assertStringIncludes(safe, "Retrying the same command");
  }
});

Deno.test("classifyCoderError: an existing PR points at lookup rather than another create", () => {
  const { code, safe } = classifyCoderError(
    `{"message":"Validation Failed","errors":[{"resource":"PullRequest","code":"custom","message":"A pull request already exists for OHDSI:trex/data-source-ui-plugin-pr."}],"status":"422"}`,
  );
  assertEquals(code, "pr_already_exists");
  assertStringIncludes(safe, "gh pr list --head");
});
