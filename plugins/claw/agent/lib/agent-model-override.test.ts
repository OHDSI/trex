import { assertEquals, assertRejects } from "jsr:@std/assert";
import { fetchClawModelOverride } from "./agent-model-override.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("fetchClawModelOverride: returns null when devx reports nothing configured", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ configured: false }), { status: 200 });
  const result = await fetchClawModelOverride(env({}), "user-1", fakeFetch, async () => "token");
  assertEquals(result, null);
});

Deno.test("fetchClawModelOverride: returns the resolved spec when configured", async () => {
  const fakeFetch = async (url: string, init: RequestInit) => {
    assertEquals(String(url).endsWith("/agent-model/claw"), true);
    assertEquals((init.headers as Record<string, string>)["Authorization"], "Bearer token");
    return new Response(
      JSON.stringify({ configured: true, provider: "anthropic", model: "claude-sonnet-5", apiKey: "sk-x", baseUrl: null }),
      { status: 200 },
    );
  };
  const result = await fetchClawModelOverride(env({}), "user-1", fakeFetch, async () => "token");
  assertEquals(result, { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-x", baseURL: undefined });
});

Deno.test("fetchClawModelOverride: returns null when the loopback call itself fails (devx not loaded)", async () => {
  const fakeFetch = async () => { throw new Error("connection refused"); };
  const result = await fetchClawModelOverride(env({}), "user-1", fakeFetch, async () => "token");
  assertEquals(result, null);
});

Deno.test("fetchClawModelOverride: throws when devx resolved a selection but failed to decrypt it", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: "Invalid encryption key: ..." }), { status: 500 });
  await assertRejects(
    () => fetchClawModelOverride(env({}), "user-1", fakeFetch, async () => "token"),
    Error,
    "Invalid encryption key",
  );
});

Deno.test("fetchClawModelOverride: throws on an unrepresentable provider (defense in depth)", async () => {
  const fakeFetch = async () => new Response(
    JSON.stringify({ configured: true, provider: "claude-code", model: "sonnet", apiKey: null, baseUrl: null }),
    { status: 200 },
  );
  await assertRejects(
    () => fetchClawModelOverride(env({}), "user-1", fakeFetch, async () => "token"),
    Error,
    "claude-code",
  );
});

Deno.test("fetchClawModelOverride: returns null without calling fetch when no user id can be resolved", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  const result = await fetchClawModelOverride(env({}), undefined, fakeFetch, async () => "token");
  assertEquals(result, null);
  assertEquals(called, false);
});
