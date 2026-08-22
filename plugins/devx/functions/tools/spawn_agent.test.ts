// deno test --no-check --allow-all plugins/devx/functions/tools/spawn_agent.test.ts
//
// The Agent tool re-reads the active devx.provider_configs row itself instead
// of reusing the settings its caller already vetted, so the route-layer gates
// (index.ts's two /stream sites, security_routes.ts's runAgentReview) do not
// cover it. Without its own gates, a row naming the removed copilot engine
// reaches createModel's final `return openai(model)` — the OpenAI-compatible
// client, which resolves an absent apiKey from the worker's own
// OPENAI_API_KEY, running the subagent turn on the operator's account.
//
// execute() is driven directly with a fake ctx (same in-memory fake-db
// approach as provider_config_routes.test.ts). The gates sit ahead of the
// dynamic `import("../agent.ts")`, so these cases never pull in the engine or
// its provider SDKs.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { spawnAgentTool } from "./spawn_agent.ts";
import { __resetMigrationCacheForTests } from "../provider_key.ts";

const USER = "u-spawn";

// assertProviderConfigEncryptionMigrated caches its probe process-wide — reset
// so this file's first probe hits its own fake db, not another file's state.
__resetMigrationCacheForTests();

function makeCtx(activeProviderRow: Record<string, unknown> | null) {
  const calls: string[] = [];
  const events: Record<string, unknown>[] = [];
  const runUpdates: unknown[][] = [];

  const sql = async (q: string, p: unknown[] = []) => {
    calls.push(q);

    if (q.includes("information_schema.columns")) {
      return { rows: [{ column_name: "api_key_encrypted" }] };
    }
    if (q.includes("FROM devx.agents")) {
      return {
        rows: [{
          name: "code-explorer",
          model: "inherit",
          max_steps: 10,
          body: "You explore code.",
          allowed_tools: null,
        }],
      };
    }
    if (q.includes("INSERT INTO devx.subagent_runs")) {
      return { rows: [{ id: "run-1" }] };
    }
    if (q.includes("UPDATE devx.subagent_runs")) {
      runUpdates.push(p);
      return { rows: [] };
    }
    if (q.includes("FROM devx.provider_configs")) {
      return { rows: activeProviderRow ? [activeProviderRow] : [] };
    }
    // The legacy fallback selects `provider`; the prefs read does not. Leave
    // the legacy row empty so the `|| {}` branch is what the last test below
    // exercises.
    if (q.includes("FROM devx.settings") && q.includes("provider")) {
      return { rows: [] };
    }
    if (q.includes("FROM devx.settings")) {
      return { rows: [{ ai_rules: null, auto_approve: false, max_steps: 15 }] };
    }
    throw new Error(`unexpected query: ${q}`);
  };

  const ctx = {
    sql,
    userId: USER,
    chatId: "chat-1",
    appId: "app-1",
    send: (data: Record<string, unknown>) => { events.push(data); },
  };

  return { ctx, calls, events, runUpdates };
}

function run(ctx: unknown) {
  // deno-lint-ignore no-explicit-any
  return (spawnAgentTool as any).execute({ agent_name: "code-explorer", task: "look around" }, ctx);
}

Deno.test("Agent tool: an active row left on the removed copilot provider fails the subagent turn instead of reaching the engine", async () => {
  const { ctx, calls, events, runUpdates } = makeCtx({
    provider: "copilot",
    model: "gpt-4o",
    api_key: null,
    api_key_encrypted: null,
    api_key_iv: null,
    base_url: null,
  });

  const result = await run(ctx);

  assertEquals(
    result,
    "Subagent error: GitHub Copilot support has been removed — choose another provider in Settings.",
  );
  // The run row is closed out as failed, and the caller sees the same string.
  assertEquals(runUpdates.length, 1);
  assertEquals(runUpdates[0][0], result);
  assertEquals(events.at(-1)?.type, "subagent_done");
  assertEquals(events.at(-1)?.error, result);
  // Proves the gate fired on the re-read provider row, not somewhere earlier.
  assertEquals(calls.some((q) => q.includes("FROM devx.provider_configs")), true);
});

// Same reasoning as security_routes.test.ts's WITH-a-key case: POST
// /provider-configs accepts any provider string with any api_key, so the gate
// must key on the provider name, not on the key being absent.
Deno.test("Agent tool: a copilot row WITH an api_key is still rejected", async () => {
  const { ctx } = makeCtx({
    provider: "copilot",
    model: "gpt-4o",
    api_key: "ghu_some_github_token",
    api_key_encrypted: null,
    api_key_iv: null,
    base_url: null,
  });

  assertEquals(
    await run(ctx),
    "Subagent error: GitHub Copilot support has been removed — choose another provider in Settings.",
  );
});

Deno.test("Agent tool: a keyless non-waived row is rejected by the key gate (never reaches the OpenAI-compatible client)", async () => {
  const { ctx } = makeCtx({
    provider: "openai",
    model: "gpt-4o",
    api_key: null,
    api_key_encrypted: null,
    api_key_iv: null,
    base_url: null,
  });

  assertStringIncludes(await run(ctx), "No provider configured. Please set up your provider in Settings.");
});

// spawn_agent.ts's legacy branch ends in `|| {}` — an empty settings object
// has no provider and no key, and used to fall through to `openai(undefined)`
// on the worker's own credentials.
Deno.test("Agent tool: no provider row at all is rejected rather than defaulting to the worker's credentials", async () => {
  const { ctx } = makeCtx(null);

  assertStringIncludes(await run(ctx), "No provider configured. Please set up your provider in Settings.");
});
