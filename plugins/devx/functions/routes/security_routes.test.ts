// deno test --no-check --allow-all plugins/devx/functions/routes/security_routes.test.ts
//
// Covers the API-key gate in runAgentReview (security_routes.ts): a provider
// row whose engine no longer exists must be rejected here, not waived into
// streamAgentChat. createModel's last branch is the OpenAI-compatible client,
// which resolves an absent apiKey from the worker's own OPENAI_API_KEY — so a
// waived, keyless row would run one user's review on the operator's account.
//
// Same in-memory fake-db approach as provider_config_routes.test.ts: driven
// off the literal query shapes security_routes.ts issues today, white-box on
// purpose.
import { assertEquals } from "jsr:@std/assert";
import { handleSecurityRoutes } from "./security_routes.ts";
import { __resetMigrationCacheForTests } from "../provider_key.ts";

const CORS = { "content-type": "application/json" };
const USER = "u-review";
const APP = "app-review";

// assertProviderConfigEncryptionMigrated caches its probe result process-wide
// (see provider_key.ts) — reset it so this file's first probe hits its own
// fake db rather than state cached by another test file in the same run.
__resetMigrationCacheForTests();

/**
 * runAgentReview is only reached once the route has confirmed app ownership
 * AND buildCodeReviewMessage found code files on disk, so the review path
 * needs a real workspace with at least one file matching CODE_EXTENSIONS.
 */
async function withWorkspace<T>(fn: () => Promise<T>): Promise<T> {
  const base = await Deno.makeTempDir({ prefix: "devx-security-routes-test-" });
  const prev = Deno.env.get("DEVX_WORKSPACE_DIR");
  Deno.env.set("DEVX_WORKSPACE_DIR", base);
  try {
    await Deno.mkdir(`${base}/${USER}/${APP}`, { recursive: true });
    await Deno.writeTextFile(`${base}/${USER}/${APP}/main.ts`, "export const answer = 42;\n");
    return await fn();
  } finally {
    if (prev === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prev);
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
}

function makeFakeDb(activeProviderRow: Record<string, unknown> | null) {
  const calls: string[] = [];

  const sql = async (q: string, _p: unknown[] = []) => {
    calls.push(q);

    if (q.includes("information_schema.columns")) {
      // Simulate the encryption migration applied, so the route exercises its
      // real row-selection behaviour rather than the unmigrated shortcut.
      return { rows: [{ column_name: "api_key_encrypted" }] };
    }
    if (q.includes("FROM devx.apps")) {
      return { rows: [{ id: APP }] };
    }
    if (q.includes("FROM devx.provider_configs")) {
      return { rows: activeProviderRow ? [activeProviderRow] : [] };
    }
    // The legacy devx.settings fallback selects `provider`; the prefs read
    // does not. Give the legacy row a usable key so that if the route ever
    // took that branch it would sail past the gate — a 400 below therefore
    // proves the provider_configs row is what was rejected.
    if (q.includes("FROM devx.settings") && q.includes("provider")) {
      return { rows: [{ provider: "openai", model: "gpt-4o", api_key: "sk-legacy", base_url: null }] };
    }
    if (q.includes("FROM devx.settings")) {
      return { rows: [{ ai_rules: null, auto_approve: false, max_steps: 20 }] };
    }
    throw new Error(`unexpected query: ${q}`);
  };

  return { sql, calls };
}

function reviewRequest() {
  return new Request(`http://x/apps/${APP}/security/review`, { method: "POST" });
}

Deno.test("security review: an active provider_configs row left on the removed copilot provider is rejected by the key gate", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb({
      provider: "copilot",
      model: "gpt-4o",
      api_key: null,
      api_key_encrypted: null,
      api_key_iv: null,
      base_url: null,
    });

    const res = await handleSecurityRoutes(
      `/apps/${APP}/security/review`,
      "POST",
      reviewRequest(),
      USER,
      db.sql,
      CORS,
    );

    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: "AI provider not configured. Set your API key in Settings." });

    // Guard against a false pass: the 400 must come from the gate acting on
    // the copilot provider_configs row, not from the "no rows at all" legacy
    // branch (which returns the identical message) and not from the earlier
    // "No code files found to review" bail-out.
    assertEquals(db.calls.some((q) => q.includes("FROM devx.provider_configs")), true);
    assertEquals(db.calls.some((q) => q.includes("FROM devx.settings") && q.includes("provider")), false);
    // Rejected before any review row could be written.
    assertEquals(db.calls.some((q) => q.includes("devx.agent_results")), false);
  });
});

Deno.test("security review: a keyless openai row is rejected the same way (the gate is provider-agnostic)", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb({
      provider: "openai",
      model: "gpt-4o",
      api_key: null,
      api_key_encrypted: null,
      api_key_iv: null,
      base_url: null,
    });

    const res = await handleSecurityRoutes(
      `/apps/${APP}/security/review`,
      "POST",
      reviewRequest(),
      USER,
      db.sql,
      CORS,
    );

    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: "AI provider not configured. Set your API key in Settings." });
  });
});
