import { assertEquals } from "jsr:@std/assert";
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

Deno.test("classifies GitHub's workflow-scope push rejection and names the files", () => {
  const got = classifyCoderError(
    "refusing to allow an OAuth App to create or update workflow\n.github/workflows/cleanup-stale-pr-tags.yml\nwithout workflow scope",
  );
  assertEquals(got.code, "git_workflow_scope");
  assertEquals(got.safe.includes("cleanup-stale-pr-tags.yml"), true);
  assertEquals(got.safe.includes("stale branch"), true);
});

Deno.test("the workflow-scope rejection is not mistaken for an auth/credential failure", () => {
  // It must NOT fall through to auth_expired/invalid_key: the coder previously
  // read it as broken auth and re-ran `gh auth status` for whole turns.
  const got = classifyCoderError(
    "! [remote rejected] feat -> feat (refusing to allow an OAuth App to create or update workflow .github/workflows/ci.yml without workflow scope)",
  );
  assertEquals(got.code, "git_workflow_scope");
});
