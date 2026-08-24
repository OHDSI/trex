import { assertEquals, assertRejects } from "jsr:@std/assert";
import { fetchSupportModelOverride } from "./agent-model-override.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("fetchSupportModelOverride: returns null when devx reports nothing configured", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ configured: false }), { status: 200 });
  const result = await fetchSupportModelOverride(env({ D2ESUPPORT_USER_ID: "user-1" }), fakeFetch, async () => "token");
  assertEquals(result, null);
});

Deno.test("fetchSupportModelOverride: returns the resolved spec when configured", async () => {
  const fakeFetch = async (url: string) => {
    assertEquals(String(url).endsWith("/agent-model/d2esupport"), true);
    return new Response(
      JSON.stringify({ configured: true, provider: "google", model: "gemini-2.5-pro", apiKey: "gk-x", baseUrl: null }),
      { status: 200 },
    );
  };
  const result = await fetchSupportModelOverride(env({ D2ESUPPORT_USER_ID: "user-1" }), fakeFetch, async () => "token");
  assertEquals(result, { provider: "google", modelId: "gemini-2.5-pro", apiKey: "gk-x", baseURL: undefined });
});

Deno.test("fetchSupportModelOverride: returns null when D2ESUPPORT_USER_ID is unset, without calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response("{}"); };
  const result = await fetchSupportModelOverride(env({}), fakeFetch, async () => "token");
  assertEquals(result, null);
  assertEquals(called, false);
});

Deno.test("fetchSupportModelOverride: throws when devx failed to resolve a configured selection", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: "Invalid encryption key: ..." }), { status: 500 });
  await assertRejects(
    () => fetchSupportModelOverride(env({ D2ESUPPORT_USER_ID: "user-1" }), fakeFetch, async () => "token"),
    Error,
    "Invalid encryption key",
  );
});

Deno.test("fetchSupportModelOverride: throws on an unrepresentable provider", async () => {
  const fakeFetch = async () => new Response(
    JSON.stringify({ configured: true, provider: "claude-code", model: "sonnet", apiKey: null, baseUrl: null }),
    { status: 200 },
  );
  await assertRejects(
    () => fetchSupportModelOverride(env({ D2ESUPPORT_USER_ID: "user-1" }), fakeFetch, async () => "token"),
    Error,
    "claude-code",
  );
});
