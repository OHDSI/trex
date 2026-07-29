import { assertEquals } from "jsr:@std/assert";
import { handleClaudeCodeModelsRoutes, SEED_RESPONSE } from "./claude_code_models_routes.ts";

const cors = { "content-type": "application/json" };
const noSql = (async () => ({ rows: [] })) as unknown as (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>;

Deno.test("SEED_RESPONSE matches the agreed fallback set", () => {
  assertEquals(SEED_RESPONSE.source, "fallback");
  assertEquals(SEED_RESPONSE.models.map((m) => m.value), ["default", "sonnet", "haiku"]);
});

Deno.test("returns null for unrelated paths", async () => {
  const res = await handleClaudeCodeModelsRoutes(
    "/provider-configs", "GET", new Request("http://x/provider-configs"), "u1", noSql, cors,
  );
  assertEquals(res, null);
});

Deno.test("returns seed list (source=fallback) when no OAuth token", async () => {
  // Force no token by pointing the token file at a missing path.
  Deno.env.set("CLAUDE_CODE_TOKEN_PATH", "/tmp/does-not-exist-" + crypto.randomUUID() + ".json");
  const res = await handleClaudeCodeModelsRoutes(
    "/claude-code/models", "GET", new Request("http://x/claude-code/models"), "u1", noSql, cors,
  );
  assertEquals(res?.status, 200);
  const body = await res!.json();
  assertEquals(body.source, "fallback");
  assertEquals(body.models.map((m: { value: string }) => m.value), ["default", "sonnet", "haiku"]);
});
