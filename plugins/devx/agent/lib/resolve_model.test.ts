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
import { encryptToken } from "../../functions/crypto.ts";

const resolveModel = agentConfig.resolveModel!;

type Row = Record<string, unknown>;

function fakeHookCtx(rows: { activeProvider?: Row; settings?: Row }, overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-1",
    sql: (query: string) => {
      // resolveModel probes this (via assertProviderConfigEncryptionMigrated)
      // before selecting the encrypted columns — simulate V15 applied so
      // every test below exercises the real row-selection behaviour, same
      // as a migrated deployment.
      if (query.includes("information_schema.columns")) {
        return Promise.resolve({ rows: [{ column_name: "api_key_encrypted" }] });
      }
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

Deno.test("resolveModel: no provider_configs and no devx.settings row throws (no silent model fallback)", async () => {
  const ctx = fakeHookCtx({});
  await assertRejects(() => resolveModel(ctx), Error, "no model provider configured");
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

// The copilot engine is gone but its provider_configs/devx.settings rows were
// deliberately left unmigrated, so this input is still reachable in production.
// Match the removal message specifically, not a bare Error: if the arm is ever
// dropped, copilot falls into the OpenAI-compatible branch with apiKey
// undefined and core's buildModel backfills the operator's OPENAI_API_KEY.
// A bare `Error` matcher would not fail on that; asserting the message does.
Deno.test("resolveModel: a row left on the removed copilot provider throws the removal message, never the OpenAI fallback", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "copilot", model: "gpt-4o", api_key: null, base_url: null },
  });
  await assertRejects(
    () => resolveModel(ctx),
    Error,
    "GitHub Copilot support has been removed — choose another provider in devx Settings",
  );
});

// Same row shape, but arriving via the legacy devx.settings fallback rather
// than provider_configs — that table was never migrated either.
Deno.test("resolveModel: a legacy devx.settings row left on copilot throws the same removal message", async () => {
  const ctx = fakeHookCtx({
    settings: { provider: "copilot", model: "gpt-4o", api_key: null, base_url: null },
  });
  await assertRejects(
    () => resolveModel(ctx),
    Error,
    "GitHub Copilot support has been removed — choose another provider in devx Settings",
  );
});

Deno.test("resolveModel: bedrock with no api_key configured returns apiKey undefined (core resolves the env-based bearer token)", async () => {
  const ctx = fakeHookCtx({
    activeProvider: { provider: "bedrock", model: "anthropic.claude-3-5-sonnet", api_key: null, base_url: null },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: undefined, baseURL: undefined });
});

Deno.test("resolveModel: bedrock with bearer-token-shaped api_key JSON unpacks the bearer token onto ModelSpec.apiKey", async () => {
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "bedrock",
      model: "anthropic.claude-3-5-sonnet",
      api_key: JSON.stringify({ bearerToken: "bt-123" }),
      base_url: "us-east-1",
    },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: "bt-123", baseURL: "us-east-1" });
});

Deno.test("resolveModel: bedrock with IAM-shaped api_key JSON (accessKeyId/secretAccessKey) throws a clear, actionable error", async () => {
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "bedrock",
      model: "anthropic.claude-3-5-sonnet",
      api_key: JSON.stringify({ accessKeyId: "AKIA...", secretAccessKey: "shh" }),
      base_url: null,
    },
  });
  await assertRejects(
    () => resolveModel(ctx),
    Error,
    "bedrock IAM credentials are not supported on the agents loop yet",
  );
});

Deno.test("resolveModel: bedrock with a non-JSON api_key drops it (falls through to core's env-based bearer fallback)", async () => {
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "bedrock",
      model: "anthropic.claude-3-5-sonnet",
      api_key: "not-json-at-all",
      base_url: null,
    },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: undefined, baseURL: undefined });
});

Deno.test("resolveModel: bedrock with valid-JSON-but-neither-shape api_key treats it as absent, never forwards the raw JSON", async () => {
  for (const apiKey of [JSON.stringify({ bearerToken: "" }), JSON.stringify({ unrelated: true }), "{}"]) {
    const ctx = fakeHookCtx({
      activeProvider: { provider: "bedrock", model: "anthropic.claude-3-5-sonnet", api_key: apiKey, base_url: null },
    });
    const spec = await resolveModel(ctx);
    assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: undefined, baseURL: undefined });
  }
});

Deno.test("resolveModel: bedrock with a JSON-scalar api_key ('null', numbers, bare strings) treats it as absent without throwing", async () => {
  for (const apiKey of ["null", "42", '"bare-string"']) {
    const ctx = fakeHookCtx({
      activeProvider: { provider: "bedrock", model: "anthropic.claude-3-5-sonnet", api_key: apiKey, base_url: null },
    });
    const spec = await resolveModel(ctx);
    assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: undefined, baseURL: undefined });
  }
});

Deno.test("resolveModel: no ctx.userId throws a clear error", async () => {
  const ctx = fakeHookCtx({}, { userId: undefined });
  await assertRejects(() => resolveModel(ctx), Error, "devx agent requires an authenticated user");
});

// Fix round 1 (task-6): resolveModel must route the active provider_configs
// row through the same encryption helper as index.ts's read sites, and must
// NEVER let a decrypt failure fall through to apiKey: undefined — core's
// buildModel (model.ts) backfills an undefined apiKey from the operator's own
// ANTHROPIC_API_KEY/GOOGLE_GENERATIVE_AI_API_KEY/OPENAI_API_KEY env var, which
// on a shared deployment is cross-tenant credential substitution, not a UX gap.
const KEY = "0".repeat(64);

Deno.test("resolveModel: an encrypted provider_configs row decrypts onto ModelSpec.apiKey", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken("sk-ant-encrypted");
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "anthropic", model: "claude-sonnet-5", api_key: null,
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: null,
    },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-ant-encrypted", baseURL: undefined });
});

Deno.test("resolveModel: an encrypted row with no DEVX_ENCRYPTION_KEY configured throws — never falls through to apiKey undefined", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken("sk-ant-encrypted");
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "anthropic", model: "claude-sonnet-5", api_key: null,
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: null,
    },
  });
  // The critical regression this fix round exists to close: silently
  // resolving to { apiKey: undefined } here would make core's buildModel
  // fall back to the operator's own ANTHROPIC_API_KEY env var.
  await assertRejects(() => resolveModel(ctx), Error);
});

Deno.test("resolveModel: an encrypted row that fails to decrypt (rotated key) throws instead of falling through", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken("sk-ant-encrypted");
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64)); // rotated/wrong key
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "anthropic", model: "claude-sonnet-5", api_key: null,
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: null,
    },
  });
  await assertRejects(() => resolveModel(ctx), Error);
});

// The legacy devx.settings fallback carries the same encrypted-pair columns
// as provider_configs (V16) — resolved through the same readProviderKey
// call, not a second, differently-shaped resolution.
Deno.test("resolveModel: a plaintext legacy devx.settings row still resolves with no encryption key configured", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const ctx = fakeHookCtx({
    settings: { provider: "anthropic", model: "claude-sonnet-5", api_key: "sk-legacy-plain", base_url: null },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-legacy-plain", baseURL: undefined });
});

Deno.test("resolveModel: an encrypted legacy devx.settings row decrypts onto ModelSpec.apiKey", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken("sk-settings-encrypted");
  const ctx = fakeHookCtx({
    settings: {
      provider: "anthropic", model: "claude-sonnet-5", api_key: null,
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: null,
    },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-settings-encrypted", baseURL: undefined });
});

Deno.test("resolveModel: an encrypted legacy devx.settings row that fails to decrypt (rotated key) throws — never falls back to plaintext", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken("sk-settings-encrypted");
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64)); // rotated/wrong key
  const ctx = fakeHookCtx({
    settings: {
      provider: "anthropic", model: "claude-sonnet-5",
      // A stale plaintext value in the legacy column is what makes the
      // "never falls back" claim observable: with api_key null there is
      // nothing to fall back TO, so the test would pass even if the fallback
      // existed. V7__multi_provider.sql left exactly this state behind on
      // real rows (it copied the key out without clearing the source).
      api_key: "sk-settings-stale-plaintext",
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: null,
    },
  });
  // Matched on the message, not just `Error`: a bare Error matcher also
  // accepts fakeHookCtx's own "unexpected query" throw, which would pass
  // while proving nothing about decryption. resolveModel rethrows
  // classifyCoderError's safe string (agent.ts), so this is the invalid_key
  // wording the UI shows — not the raw crypto detail, which goes to the log.
  await assertRejects(() => resolveModel(ctx), Error, "Invalid API key");
});

Deno.test("resolveModel: a bedrock row's bearer token still unpacks correctly after decrypting the encrypted JSON blob", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const { ciphertext, iv } = await encryptToken(JSON.stringify({ bearerToken: "bt-encrypted" }));
  const ctx = fakeHookCtx({
    activeProvider: {
      provider: "bedrock", model: "anthropic.claude-3-5-sonnet", api_key: null,
      api_key_encrypted: ciphertext, api_key_iv: iv, base_url: "us-east-1",
    },
  });
  const spec = await resolveModel(ctx);
  assertEquals(spec, { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet", apiKey: "bt-encrypted", baseURL: "us-east-1" });
});
