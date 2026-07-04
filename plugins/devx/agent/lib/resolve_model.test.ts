// Unit tests for agent.ts's resolveModel hook (task-v3-brief.md): port of
// functions/index.ts:290-333 (settings assembly) + functions/agent.ts's
// createModel (:41-119). Exercised through the SAME default export
// loader.ts consumes (`mod.default.resolveModel`), with a fake HookCtx.sql —
// same "record the query, branch on its text" convention as
// core/server/agents/service/hooks.test.ts's fakeHookCtx, adapted to devx's
// devx.provider_configs / devx.settings schema.
import { assertEquals, assertRejects } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig from "../agent.ts";

const resolveModel = agentConfig.resolveModel!;

type Row = Record<string, unknown>;

function fakeHookCtx(rows: { activeProvider?: Row; settings?: Row }, overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-1",
    sql: (query: string) => {
      if (query.includes("FROM devx.provider_configs")) {
        return Promise.resolve({ rows: rows.activeProvider ? [rows.activeProvider] : [] });
      }
      if (query.includes("FROM devx.settings")) {
        return Promise.resolve({ rows: rows.settings ? [rows.settings] : [] });
      }
      throw new Error(`unexpected query: ${query}`);
    },
    ...overrides,
  };
}

Deno.test("resolveModel: active provider_configs row wins and maps straight onto ModelSpec", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "anthropic", model: "claude-sonnet-5", api_key: "sk-ant-1", base_url: null },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-ant-1", baseURL: undefined });
});

Deno.test("resolveModel: no provider_configs row falls back to legacy devx.settings", async () => {
  const ctx = fakeHookCtx({
    settings: { provider: "google", model: "gemini-2.5-pro", api_key: "g-key", base_url: null },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "google", modelId: "gemini-2.5-pro", apiKey: "g-key", baseURL: undefined });
});

Deno.test("resolveModel: no provider_configs and no devx.settings row falls back to the hardcoded legacy default", async () => {
  const ctx = fakeHookCtx({});
  const spec = await resolveModel(ctx);
  assertEquals(spec, {
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    apiKey: undefined,
    baseURL: undefined,
  });
});

Deno.test("resolveModel: an unrecognized provider name maps to the OpenAI-compatible fallback", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "my-custom-proxy", model: "gpt-4o", api_key: "k-1", base_url: "https://proxy.example/v1" },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "openai", modelId: "gpt-4o", apiKey: "k-1", baseURL: "https://proxy.example/v1" });
});

Deno.test("resolveModel: claude-code provider throws (sidecar providers use the legacy endpoint)", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "claude-code", model: "claude-sonnet-5", api_key: null, base_url: null },
  });
  await assertRejects(() => resolveModel(ctx), Error, "sidecar providers use the legacy endpoint");
});

Deno.test("resolveModel: copilot provider throws (sidecar providers use the legacy endpoint)", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "copilot", model: "gpt-4o", api_key: null, base_url: null },
  });
  await assertRejects(() => resolveModel(ctx), Error, "sidecar providers use the legacy endpoint");
});

Deno.test("resolveModel: bedrock with no api_key configured returns apiKey undefined (core resolves the env-based bearer token)", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "bedrock", model: "anthropic.claude-3-5-sonnet", api_key: null, base_url: null },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: undefined, baseURL: undefined });
});

Deno.test("resolveModel: no ctx.userId throws a clear error", async () => {
  const ctx = fakeHookCtx({}, { userId: undefined });
  await assertRejects(() => resolveModel(ctx), Error, "devx agent requires an authenticated user");
});
