import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { bedrockSupportsPromptCaching, cacheProviderOptions, isAnthropicModel, isBedrockModel, isOpenAIModel, mergeProviderOptions, parseModelString, reasoningEffortProviderOptions, resolveModel, vertexSettings, withSystemCachePoint, withToolCachePoint } from "./model.ts";

Deno.test("parseModelString splits on first slash only", () => {
  assertEquals(parseModelString("anthropic/claude-sonnet-5"), {
    provider: "anthropic", modelId: "claude-sonnet-5",
  });
  // Bedrock model ids contain dots and can contain slashes-free ARN-ish ids
  assertEquals(parseModelString("bedrock/us.anthropic.claude-sonnet-4-6"), {
    provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-6",
  });
});

Deno.test("parseModelString rejects strings without provider prefix", () => {
  assertThrows(() => parseModelString("claude-sonnet-5"));
});

Deno.test("resolveModel falls back to TREX_AGENTS_DEFAULT_MODEL", () => {
  const env = (k: string) =>
    ({ TREX_AGENTS_DEFAULT_MODEL: "openai/gpt-5.4-mini", OPENAI_API_KEY: "sk-test" } as Record<string, string>)[k];
  const m = resolveModel(undefined, env);
  assertEquals(m.modelId, "gpt-5.4-mini");
});

Deno.test("resolveModel throws with no model and no default", () => {
  assertThrows(() => resolveModel(undefined, () => undefined));
});

Deno.test("resolveModel builds a model for each supported provider", () => {
  const env = (k: string) =>
    ({
      ANTHROPIC_API_KEY: "sk-a", OPENAI_API_KEY: "sk-o",
      GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
      AWS_BEARER_TOKEN_BEDROCK: "bearer", AWS_REGION: "us-east-1",
    } as Record<string, string>)[k];
  for (const s of [
    "anthropic/claude-sonnet-5", "openai/gpt-5.4-mini",
    "google/gemini-2.5-pro", "bedrock/us.anthropic.claude-sonnet-4-6",
  ]) {
    const m = resolveModel(s, env);
    assertEquals(typeof m.modelId, "string");
  }
});

Deno.test("isBedrockModel is true only for provider === amazon-bedrock", () => {
  assertEquals(isBedrockModel({ provider: "amazon-bedrock" }), true);
  assertEquals(isBedrockModel({ provider: "anthropic" }), false);
  assertEquals(isBedrockModel({ provider: "openai" }), false);
  assertEquals(isBedrockModel({ provider: undefined }), false);
  assertEquals(isBedrockModel(undefined), false);
  assertEquals(isBedrockModel(null), false);
  assertEquals(isBedrockModel({}), false);
});

Deno.test("isAnthropicModel is true only for provider === anthropic.messages", () => {
  // "anthropic.messages" is what @ai-sdk/anthropic's language-model objects
  // actually report (see isAnthropicModel's comment) — a bare "anthropic"
  // never occurs on a model object and must NOT match.
  assertEquals(isAnthropicModel({ provider: "anthropic.messages" }), true);
  assertEquals(isAnthropicModel({ provider: "anthropic" }), false);
  assertEquals(isAnthropicModel({ provider: "amazon-bedrock" }), false);
  assertEquals(isAnthropicModel({ provider: "openai" }), false);
  assertEquals(isAnthropicModel({ provider: undefined }), false);
  assertEquals(isAnthropicModel(undefined), false);
  assertEquals(isAnthropicModel(null), false);
  assertEquals(isAnthropicModel({}), false);
});

Deno.test("bedrockSupportsPromptCaching is true only for Anthropic-on-Bedrock model ids", () => {
  // Anthropic Claude on Bedrock (with and without a cross-region prefix) caches.
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" }), true);
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0" }), true);
  // Non-Anthropic Bedrock models (e.g. Z.AI GLM) do NOT support prompt caching —
  // sending a cachePoint makes Bedrock reject the whole request with
  // AccessDeniedException, so these must be excluded.
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "zai.glm-5" }), false);
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "amazon.nova-pro-v1:0" }), false);
  // A bedrock model object with no modelId is treated as non-caching (safe default).
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock" }), false);
  // Non-bedrock providers are never in scope here.
  assertEquals(bedrockSupportsPromptCaching({ provider: "anthropic.messages", modelId: "claude-sonnet-5" }), false);
});

Deno.test("withSystemCachePoint wraps system in a cache-pointed SystemModelMessage for an Anthropic bedrock model", () => {
  const system = "You are a helpful agent.\nFollow the rules.";
  const wrapped = withSystemCachePoint({ provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" }, system);
  assertEquals(wrapped, {
    role: "system",
    content: system,
    providerOptions: { bedrock: { cachePoint: { type: "default" } } },
  });
  // Text content must be byte-identical to the original — no truncation or
  // mutation, since the cache key depends on exact bytes.
  assertEquals((wrapped as { content: string }).content, system);
});

Deno.test("withSystemCachePoint is a no-op for a non-Anthropic bedrock model (e.g. GLM)", () => {
  // Regression: a cachePoint on zai.glm-5 makes Bedrock reject the turn with
  // AccessDeniedException ("unsupported model or your request did not allow
  // prompt caching"), silently killing it. Such models must be invoked plain.
  const system = "You are a helpful agent.";
  assertEquals(withSystemCachePoint({ provider: "amazon-bedrock", modelId: "zai.glm-5" }, system), system);
});

Deno.test("withSystemCachePoint wraps system with an ephemeral cacheControl for anthropic", () => {
  const system = "You are a helpful agent.\nFollow the rules.";
  const wrapped = withSystemCachePoint({ provider: "anthropic.messages" }, system);
  assertEquals(wrapped, {
    role: "system",
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });
  // Same byte-identity requirement as the bedrock branch — the cache key
  // depends on exact prefix bytes.
  assertEquals((wrapped as { content: string }).content, system);
});

Deno.test("withSystemCachePoint is a no-op (identity) for providers without caching support", () => {
  const system = "You are a helpful agent.";
  assertEquals(withSystemCachePoint({ provider: "openai" }, system), system);
  assertEquals(withSystemCachePoint({ provider: "google" }, system), system);
  assertEquals(withSystemCachePoint({ provider: undefined }, system), system);
  assertEquals(withSystemCachePoint(undefined, system), system);
});

Deno.test("isOpenAIModel matches openai.* provider ids (incl. openai-compatible gateways)", () => {
  assertEquals(isOpenAIModel({ provider: "openai.responses" }), true);
  assertEquals(isOpenAIModel({ provider: "openai.chat" }), true);
  assertEquals(isOpenAIModel({ provider: "amazon-bedrock" }), false);
  assertEquals(isOpenAIModel({ provider: "anthropic.messages" }), false);
  assertEquals(isOpenAIModel({ provider: undefined }), false);
  assertEquals(isOpenAIModel(undefined), false);
});

Deno.test("cacheProviderOptions returns a promptCacheKey only for openai models", () => {
  // openai (incl. mantle/openai-compatible) → routing key under providerOptions.openai.
  assertEquals(
    cacheProviderOptions({ provider: "openai.responses" }, "trex-agents/claw"),
    { openai: { promptCacheKey: "trex-agents/claw" } },
  );
  // Non-openai providers get no providerOptions (bedrock/anthropic cache via
  // withSystemCachePoint's markers; a stray openai key would be meaningless).
  assertEquals(cacheProviderOptions({ provider: "amazon-bedrock", modelId: "zai.glm-5" }, "k"), {});
  assertEquals(cacheProviderOptions({ provider: "anthropic.messages" }, "k"), {});
  // No key → nothing to route on, even for openai.
  assertEquals(cacheProviderOptions({ provider: "openai.responses" }, ""), {});
});

// reasoningEffortProviderOptions / mergeProviderOptions (agent-orchestration
// Task 14): a subagent's declared reasoningEffort applied to its resolved
// model's providerOptions, merged with cacheProviderOptions' output without
// either clobbering the other's provider key.

Deno.test("reasoningEffortProviderOptions applies only to openai models", () => {
  assertEquals(
    reasoningEffortProviderOptions({ provider: "openai.responses" }, "high"),
    { openai: { reasoningEffort: "high" } },
  );
  assertEquals(reasoningEffortProviderOptions({ provider: "anthropic.messages" }, "high"), {});
  assertEquals(reasoningEffortProviderOptions({ provider: "amazon-bedrock" }, "high"), {});
});

Deno.test("reasoningEffortProviderOptions is a no-op when effort is unset", () => {
  assertEquals(reasoningEffortProviderOptions({ provider: "openai.responses" }, undefined), {});
});

Deno.test("reasoningEffortProviderOptions sends reasoning.effort for OpenAI models on bedrock-runtime", () => {
  const gpt = { provider: "amazon-bedrock", modelId: "global.openai.gpt-6-luna" };
  assertEquals(reasoningEffortProviderOptions(gpt, "high"), {
    bedrock: { additionalModelRequestFields: { reasoning: { effort: "high" } } },
  });
  assertEquals(reasoningEffortProviderOptions({ ...gpt, modelId: "openai.gpt-6-luna" }, "low"), {
    bedrock: { additionalModelRequestFields: { reasoning: { effort: "low" } } },
  });
  assertEquals(reasoningEffortProviderOptions({ ...gpt, modelId: "us.openai.gpt-oss-120b-1:0" }, "high"), {
    bedrock: { additionalModelRequestFields: { reasoning_effort: "high" } },
  });
});

Deno.test("reasoningEffortProviderOptions defaults OpenAI models on bedrock-runtime to medium", () => {
  assertEquals(
    reasoningEffortProviderOptions({ provider: "amazon-bedrock", modelId: "global.openai.gpt-6-luna" }, undefined),
    { bedrock: { additionalModelRequestFields: { reasoning: { effort: "medium" } } } },
  );
});

Deno.test("reasoningEffortProviderOptions leaves other bedrock models alone", () => {
  for (const modelId of ["us.anthropic.claude-sonnet-4-6", "minimax.minimax-m2.5", "zai.glm-5"]) {
    assertEquals(reasoningEffortProviderOptions({ provider: "amazon-bedrock", modelId }, undefined), {});
  }
});

// Fix round 1 (Important finding 2): silently doing nothing off-openai is
// exactly the trap an agent author falls into — `:reasoning-effort "high"`
// parses, loads, and then vanishes with nothing in the logs on
// anthropic/bedrock, the primary provider family in this codebase. Captures
// real console.warn calls (not a fake) so this is testing the actual
// production log line, not a stand-in for it. Each test uses a unique
// agentLabel to avoid the module-level one-time-warn dedup state leaking
// between tests (or between this file and any other module that happens to
// import the same reasoningEffortProviderOptions in the same test run).
function captureWarnings(fn: () => void): string[] {
  const logged: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    fn();
  } finally {
    console.warn = orig;
  }
  return logged;
}

Deno.test("reasoningEffortProviderOptions warns once, naming the agent and the resolved provider, when set off-openai", () => {
  const logged = captureWarnings(() => {
    reasoningEffortProviderOptions({ provider: "anthropic.messages" }, "high", "code-reviewer-warn-test");
  });
  assertEquals(logged.length, 1);
  assert(logged[0].includes("code-reviewer-warn-test"), "warning should name the agent");
  assert(logged[0].includes("anthropic.messages"), "warning should name the resolved provider");
  assert(logged[0].includes("high"), "warning should name the declared effort value");
});

Deno.test("reasoningEffortProviderOptions warns only ONCE per agent, not per call", () => {
  const logged = captureWarnings(() => {
    reasoningEffortProviderOptions({ provider: "amazon-bedrock" }, "low", "repeat-warn-test");
    reasoningEffortProviderOptions({ provider: "amazon-bedrock" }, "low", "repeat-warn-test");
    reasoningEffortProviderOptions({ provider: "amazon-bedrock" }, "low", "repeat-warn-test");
  });
  assertEquals(logged.length, 1, "a warning on every call (e.g. every turn/step) would be its own bug");
});

Deno.test("reasoningEffortProviderOptions does not warn for an openai model", () => {
  const logged = captureWarnings(() => {
    reasoningEffortProviderOptions({ provider: "openai.responses" }, "high", "no-warn-openai-test");
  });
  assertEquals(logged.length, 0);
});

Deno.test("reasoningEffortProviderOptions does not warn when effort is unset", () => {
  const logged = captureWarnings(() => {
    reasoningEffortProviderOptions({ provider: "anthropic.messages" }, undefined, "no-warn-unset-test");
  });
  assertEquals(logged.length, 0);
});

Deno.test("mergeProviderOptions merges per-provider-key rather than clobbering", () => {
  const merged = mergeProviderOptions(
    { openai: { promptCacheKey: "trex-agents/claw" } },
    { openai: { reasoningEffort: "low" } },
  );
  assertEquals(merged, { openai: { promptCacheKey: "trex-agents/claw", reasoningEffort: "low" } });
});

Deno.test("mergeProviderOptions keeps distinct provider keys separate", () => {
  const merged = mergeProviderOptions(
    { anthropic: { cacheControl: { type: "ephemeral" } } },
    { openai: { reasoningEffort: "low" } },
  );
  assertEquals(merged, {
    anthropic: { cacheControl: { type: "ephemeral" } },
    openai: { reasoningEffort: "low" },
  });
});

// withToolCachePoint (Task 14): the cache breakpoint moves from the system
// message (withSystemCachePoint, above) onto the LAST CORE tool, so that
// appending activated tools after it never shifts what's cached — only the
// content up to and including the marked tool is hashed for the cache key.

Deno.test("withToolCachePoint marks the last core tool for anthropic", () => {
  // NOTE: model.provider for the real @ai-sdk/anthropic provider is
  // "anthropic.messages" (see isAnthropicModel's comment above) — the task
  // brief's sample test used a bare "anthropic", which isAnthropicModel
  // never matches. Corrected here.
  const model = { provider: "anthropic.messages", modelId: "claude-sonnet-5" };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
  const names = Object.keys(out);
  assertEquals(names, ["Read", "Bash", "KBSearch"]);
  assertEquals(
    (out.Bash as never as { providerOptions: unknown }).providerOptions,
    { anthropic: { cacheControl: { type: "ephemeral" } } },
  );
  // The marker sits ONLY on the last core tool — never on an earlier core
  // tool and never on an appended activated tool (that would defeat the
  // whole point: activation must not change what's inside the cached span).
  assertEquals((out.Read as { providerOptions?: unknown }).providerOptions, undefined);
  assertEquals((out.KBSearch as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint marks the last core tool for bedrock", () => {
  const model = { provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [] as never);
  assertEquals(
    (out.Bash as never as { providerOptions: unknown }).providerOptions,
    { bedrock: { cachePoint: { type: "default" } } },
  );
  assertEquals((out.Read as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint adds no marker for openai/google — stable ordering only", () => {
  // OpenAI does automatic prefix caching (see cacheProviderOptions' comment)
  // and Google gets nothing at all; both must see the core tools followed by
  // activated tools, untouched, with no providerOptions key added anywhere.
  for (const model of [{ provider: "openai.responses" }, { provider: "google" }, { provider: undefined }]) {
    const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
    assertEquals(Object.keys(out), ["Read", "Bash", "KBSearch"]);
    for (const def of Object.values(out)) {
      assertEquals((def as { providerOptions?: unknown }).providerOptions, undefined);
    }
  }
});

Deno.test("withToolCachePoint appends activated tools after core, unmarked, in given order", () => {
  const model = { provider: "anthropic.messages" };
  const out = withToolCachePoint(
    model,
    [["Read", {}], ["Bash", {}]] as never,
    [["KBSearch", {}], ["FigmaPullMockups", {}]] as never,
  );
  assertEquals(Object.keys(out), ["Read", "Bash", "KBSearch", "FigmaPullMockups"]);
  assertEquals((out.KBSearch as { providerOptions?: unknown }).providerOptions, undefined);
  assertEquals((out.FigmaPullMockups as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint handles an empty core list without crashing", () => {
  const model = { provider: "anthropic.messages" };
  const out = withToolCachePoint(model, [] as never, [["KBSearch", {}]] as never);
  assertEquals(Object.keys(out), ["KBSearch"]);
});

Deno.test("serialized core prefix is byte-identical across activation", () => {
  // The point of the whole design: activating a deferred tool mid-session
  // must never change the bytes of the cached TOOLS+SYSTEM prefix, or every
  // subsequent request pays a full cache-write instead of a cache-read.
  const model = { provider: "anthropic.messages", modelId: "claude-sonnet-5" };
  const before = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [] as never);
  const after = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
  const prefix = (o: Record<string, unknown>) =>
    JSON.stringify(Object.fromEntries(Object.entries(o).filter(([n]) => n !== "KBSearch")));
  assertEquals(prefix(before), prefix(after));
});

Deno.test("withToolCachePoint merges the cache marker into an existing providerOptions, not replacing it", () => {
  // Fix round 1, Finding 2: a tool that already sets its own providerOptions
  // (e.g. a future connection-backed tool with provider-specific hints) must
  // keep them — the cache marker is added alongside, never in place of.
  const model = { provider: "anthropic.messages", modelId: "claude-sonnet-5" };
  const bashWithHints = { providerOptions: { openai: { reasoningEffort: "low" } } };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", bashWithHints]] as never, [] as never);
  assertEquals(
    (out.Bash as never as { providerOptions: unknown }).providerOptions,
    { openai: { reasoningEffort: "low" }, anthropic: { cacheControl: { type: "ephemeral" } } },
  );
});

// The case this branch was gated wrongly for, and the one that was never
// tested. A non-Anthropic Bedrock model (e.g. Z.AI's zai.glm-*) rejects ANY
// request carrying a cachePoint with AccessDeniedException — on a streaming
// turn that kills the turn silently: typing indicator, no reply.
// withSystemCachePoint has always used the narrow bedrockSupportsPromptCaching
// gate for exactly this; withToolCachePoint shipped with the broad
// isBedrockModel gate, reintroducing the defect.
Deno.test("withToolCachePoint adds NO marker for a non-Anthropic bedrock model", () => {
  const model = { provider: "amazon-bedrock", modelId: "zai.glm-4-6" };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
  assertEquals(Object.keys(out), ["Read", "Bash", "KBSearch"]);
  for (const [name, def] of Object.entries(out)) {
    assertEquals(
      (def as { providerOptions?: unknown }).providerOptions,
      undefined,
      `${name} must not carry a cachePoint — a non-Anthropic bedrock model rejects the whole request`,
    );
  }
});

// The narrow gate and the tool-level marker must agree: whatever
// withSystemCachePoint decides to mark, withToolCachePoint decides the same
// way. A divergence here is how the broad gate crept back in.
Deno.test("withToolCachePoint and withSystemCachePoint agree on which bedrock models get a marker", () => {
  for (const modelId of ["us.anthropic.claude-sonnet-4-6", "anthropic.claude-haiku-4-5", "zai.glm-4-6", "meta.llama3-70b"]) {
    const model = { provider: "amazon-bedrock", modelId };
    const system = withSystemCachePoint(model, "SYSTEM");
    const systemMarked = typeof system !== "string";
    const tools = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [] as never);
    const toolMarked = (tools.Bash as { providerOptions?: unknown }).providerOptions !== undefined;
    assertEquals(toolMarked, systemMarked, `disagreement on ${modelId}`);
    assertEquals(toolMarked, bedrockSupportsPromptCaching(model), `neither matches the narrow gate on ${modelId}`);
  }
});

// ---------- cloud provider routes ----------
// Each test stubs fetch, starts a real request through the resolved model and
// checks where it went and how it authenticated; the stub then fails the call.

interface Captured { url: string; headers: Headers; body: string }

async function captureRequests(
  model: { doGenerate: (opts: unknown) => Promise<unknown> },
  // deno-lint-ignore no-explicit-any
  respond: (url: string) => Response | undefined = () => undefined,
): Promise<Captured[]> {
  const seen: Captured[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    const body = typeof init?.body === "string" ? init.body : String(init?.body ?? "");
    seen.push({ url, headers, body });
    return respond(url) ?? new Response(JSON.stringify({ error: { message: "stubbed" } }), { status: 418 });
  }) as typeof fetch;
  try {
    await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
  } catch { /* the stubbed 418 */ } finally {
    globalThis.fetch = orig;
  }
  return seen;
}

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("azure/ routes to the Azure OpenAI resource with api-key auth", async () => {
  const m = resolveModel("azure/my-gpt-deployment", envOf({ AZURE_RESOURCE_NAME: "acme", AZURE_API_KEY: "az-key" }));
  assertEquals(m.provider, "azure.responses");
  const [req] = await captureRequests(m);
  assertEquals(req.url, "https://acme.openai.azure.com/openai/v1/responses?api-version=v1");
  assertEquals(req.headers.get("api-key"), "az-key");
  assertEquals(JSON.parse(req.body).model, "my-gpt-deployment");
});

Deno.test("azure/ honours AZURE_BASE_URL and AZURE_API_VERSION", async () => {
  const m = resolveModel("azure/dep", envOf({
    AZURE_BASE_URL: "https://acme-eu.openai.azure.com/openai", AZURE_API_KEY: "k", AZURE_API_VERSION: "2025-04-01-preview",
  }));
  const [req] = await captureRequests(m);
  assertEquals(req.url, "https://acme-eu.openai.azure.com/openai/v1/responses?api-version=2025-04-01-preview");
});

Deno.test("azure-anthropic/ routes to Microsoft Foundry's Anthropic API with x-api-key", async () => {
  const m = resolveModel("azure-anthropic/sonnet-deployment", envOf({
    ANTHROPIC_FOUNDRY_RESOURCE: "acme-foundry", ANTHROPIC_FOUNDRY_API_KEY: "f-key",
  }));
  assertEquals(isAnthropicModel(m), true);
  const [req] = await captureRequests(m);
  assertEquals(req.url, "https://acme-foundry.services.ai.azure.com/anthropic/v1/messages");
  assertEquals(req.headers.get("x-api-key"), "f-key");
  assertEquals(JSON.parse(req.body).model, "sonnet-deployment");
});

Deno.test("bedrock-openai/ routes to bedrock-mantle with the Bedrock API key", async () => {
  const m = resolveModel("bedrock-openai/openai.gpt-oss-120b", envOf({ AWS_BEARER_TOKEN_BEDROCK: "br-key", AWS_REGION: "eu-west-1" }));
  assertEquals(isOpenAIModel(m), true);
  const [req] = await captureRequests(m);
  assertEquals(req.url, "https://bedrock-mantle.eu-west-1.api.aws/openai/v1/responses");
  assertEquals(req.headers.get("authorization"), "Bearer br-key");
});

Deno.test("bedrock/ signs with AWS access keys when there is no Bedrock API key", async () => {
  const m = resolveModel("bedrock/minimax.minimax-m2.5", envOf({
    AWS_REGION: "us-west-2", AWS_ACCESS_KEY_ID: "AKIATEST", AWS_SECRET_ACCESS_KEY: "secret", AWS_SESSION_TOKEN: "session",
  }));
  const [req] = await captureRequests(m);
  assertEquals(req.url, "https://bedrock-runtime.us-west-2.amazonaws.com/model/minimax.minimax-m2.5/converse");
  assert(req.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256 Credential=AKIATEST/"));
  assertEquals(req.headers.get("x-amz-security-token"), "session");
});

Deno.test("vertex/ with an express-mode API key", async () => {
  const m = resolveModel("vertex/gemini-2.5-pro", envOf({ GOOGLE_VERTEX_API_KEY: "v-key" }));
  const [req] = await captureRequests(m);
  assert(req.url.startsWith("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:generateContent"));
  assertEquals(req.headers.get("x-goog-api-key"), "v-key");
});

// Service-account auth goes through google-auth-library's own HTTP client,
// not fetch, so these tests check the settings and endpoints instead of a
// captured request (a real token exchange would reach Google).

Deno.test("vertexSettings passes service-account credentials to google-auth-library", () => {
  const sa = { type: "service_account", client_email: "pythia@acme-proj.iam.gserviceaccount.com" };
  assertEquals(
    vertexSettings(envOf({
      GOOGLE_VERTEX_PROJECT: "acme-proj", GOOGLE_VERTEX_LOCATION: "us-east5",
      GOOGLE_VERTEX_CREDENTIALS: JSON.stringify(sa),
    })),
    { project: "acme-proj", location: "us-east5", googleAuthOptions: { credentials: sa } },
  );
  assertEquals(
    vertexSettings(envOf({ GOOGLE_VERTEX_PROJECT: "p", GOOGLE_VERTEX_LOCATION: "global", GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/sa.json" })),
    { project: "p", location: "global", googleAuthOptions: { keyFilename: "/run/secrets/sa.json" } },
  );
  // neither: google-auth-library's own discovery (metadata server etc.)
  assertEquals(vertexSettings(envOf({ GOOGLE_VERTEX_PROJECT: "p", GOOGLE_VERTEX_LOCATION: "us-east5" })), {
    project: "p", location: "us-east5",
  });
});

Deno.test("vertex-anthropic/ targets the Anthropic publisher on the project's region", () => {
  const m = resolveModel("vertex-anthropic/sonnet-model", envOf({
    GOOGLE_VERTEX_PROJECT: "acme-proj", GOOGLE_VERTEX_LOCATION: "us-east5",
  }));
  assertEquals(isAnthropicModel(m), true);
  assertEquals(
    m.config.buildRequestUrl(m.config.baseURL, false),
    "https://us-east5-aiplatform.googleapis.com/v1/projects/acme-proj/locations/us-east5/publishers/anthropic/models/sonnet-model:rawPredict",
  );
});

Deno.test("vertex-maas/ targets the OpenAI-compatible Vertex endpoint", () => {
  const m = resolveModel("vertex-maas/openai/gpt-oss-120b-maas", envOf({
    GOOGLE_VERTEX_PROJECT: "acme-proj", GOOGLE_VERTEX_LOCATION: "us-central1",
  }));
  assertEquals(m.modelId, "openai/gpt-oss-120b-maas");
  const url = m.config.url({ path: "/chat/completions", modelId: m.modelId });
  assert(url.includes("/projects/acme-proj/locations/us-central1/endpoints/openapi/chat/completions"), url);
});

Deno.test("isAnthropicModel covers Anthropic models on Vertex", () => {
  assertEquals(isAnthropicModel({ provider: "vertex.anthropic.messages" }), true);
  assertEquals(withSystemCachePoint({ provider: "vertex.anthropic.messages" }, "sys"), {
    role: "system",
    content: "sys",
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });
});
