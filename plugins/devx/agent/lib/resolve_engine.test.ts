// Unit tests for agent.ts's resolveEngine hook (Task 6, the cut-over):
// a claude-code account's turn is handed to the sidecar engine, every other
// provider stays on runner.ts's model loop. Same convention as
// resolve_model.test.ts — the SAME default export loader.ts consumes, with a
// fake HookCtx.sql — because the two hooks must agree on which row they read.
import { assertEquals, assertExists } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig from "../agent.ts";
import { SIDECAR_ENGINE_NAME } from "./sidecar_engine.ts";

const resolveEngine = agentConfig.resolveEngine;

type Row = Record<string, unknown>;

function fakeHookCtx(rows: { activeProvider?: Row; settings?: Row }, overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-1",
    sql: (query: string) => {
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

Deno.test("resolveEngine: an active claude-code provider hands the turn to the sidecar engine", async () => {
  assertExists(resolveEngine);
  const engine = await resolveEngine(fakeHookCtx({
    activeProvider: { provider: "claude-code", model: "claude-sonnet-5", api_key: null, base_url: null },
  }));
  assertEquals(engine?.name, SIDECAR_ENGINE_NAME);
});

Deno.test("resolveEngine: a claude-code row in the legacy devx.settings fallback counts too", async () => {
  assertExists(resolveEngine);
  const engine = await resolveEngine(fakeHookCtx({
    settings: { provider: "claude-code", model: "claude-sonnet-5", api_key: null, base_url: null },
  }));
  assertEquals(engine?.name, SIDECAR_ENGINE_NAME);
});

Deno.test("resolveEngine: every other provider stays on the model loop", async () => {
  assertExists(resolveEngine);
  for (const provider of ["anthropic", "google", "bedrock", "my-custom-proxy"]) {
    const engine = await resolveEngine(fakeHookCtx({
      activeProvider: { provider, model: "m", api_key: "k", base_url: null },
    }));
    assertEquals(engine, undefined, `${provider} must not be delegated`);
  }
});

Deno.test("resolveEngine: an unconfigured account resolves no engine rather than failing the turn", async () => {
  assertExists(resolveEngine);
  // A rejecting resolveEngine fails the turn outright (delegate.ts), so
  // "no provider configured" must NOT throw here — resolveModel already
  // reports that, with a message the user can act on.
  assertEquals(await resolveEngine(fakeHookCtx({})), undefined);
});

Deno.test("resolveEngine: an anonymous request resolves no engine", async () => {
  assertExists(resolveEngine);
  assertEquals(await resolveEngine(fakeHookCtx({}, { userId: undefined })), undefined);
});
