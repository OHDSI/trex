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
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { handleSecurityRoutes } from "./security_routes.ts";
import { __resetMigrationCacheForTests } from "../provider_key.ts";
import { browserlessRefusal, DELEGATED_PROVIDER, REVIEW_TOOLSETS } from "./review_tools.ts";

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

function makeFakeDb(activeProviderRow: Record<string, unknown> | null, order?: string[]) {
  const calls: string[] = [];
  const params: unknown[][] = [];

  const sql = async (q: string, p: unknown[] = []) => {
    calls.push(q);
    params.push(p);
    // Only the queries this file asserts an ORDER on go in the shared log —
    // the provider-gate reads would bury the four calls that matter.
    if (order && q.includes("UPDATE agents.sessions")) order.push("sql UPDATE agents.sessions");

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
    // The happy path continues past the gate: no previous review, the session
    // scope write, then the findings insert.
    if (q.includes("SELECT findings")) return { rows: [] };
    // RETURNING id — a zero-row answer refuses the turn, so report the match.
    if (q.includes("UPDATE agents.sessions")) return { rows: [{ id: "s-1" }] };
    if (q.includes("INSERT INTO devx.agent_results")) {
      return { rows: [{ id: "rev-1", created_at: "2026-08-30T00:00:00.000Z" }] };
    }
    throw new Error(`unexpected query: ${q}`);
  };

  return { sql, calls, params };
}

function reviewRequest() {
  return new Request(`http://x/apps/${APP}/security/review`, { method: "POST" });
}

Deno.test("security review: an active provider_configs row left on the removed copilot provider is rejected, and says so", async () => {
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
    assertEquals(await res.json(), {
      error: "GitHub Copilot support has been removed — choose another provider in Settings.",
    });

    // Guard against a false pass: the 400 must come from the gate acting on
    // the copilot provider_configs row, not from the "no rows at all" legacy
    // branch and not from the earlier "No code files found to review" bail-out.
    assertEquals(db.calls.some((q) => q.includes("FROM devx.provider_configs")), true);
    assertEquals(db.calls.some((q) => q.includes("FROM devx.settings") && q.includes("provider")), false);
    // Rejected before any review row could be written.
    assertEquals(db.calls.some((q) => q.includes("devx.agent_results")), false);
  });
});

// The reason the copilot gate keys on the provider NAME rather than on the
// absent key: POST /provider-configs accepts any provider string with any
// api_key (provider_config_routes.ts:89-106), so "copilot rows are always
// keyless" is a Settings-UI habit, not a server invariant. A key gate alone
// would wave this row into createModel's OpenAI-compatible branch and spend a
// GitHub credential as an OpenAI one.
Deno.test("security review: a copilot row WITH an api_key is still rejected (the gate does not rely on the key being absent)", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb({
      provider: "copilot",
      model: "gpt-4o",
      api_key: "ghu_some_github_token",
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
    assertEquals(await res.json(), {
      error: "GitHub Copilot support has been removed — choose another provider in Settings.",
    });
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

// ── The review runs on eve (Phase 3) ───────────────────────────────────────
// The legacy call passed a SYNTHETIC chat id and auto_approve:true to bypass
// consent. On eve the review is an unattended session with no approver, so
// hard-tier tools deny instead — and the caller has to be able to see that.

const OPENAI_ROW = {
  provider: "openai",
  model: "gpt-4o",
  api_key: "sk-real",
  api_key_encrypted: null,
  api_key_iv: null,
  base_url: null,
};

const EVE_ROOT = "http://eve.test";
const EVE_BASE = `${EVE_ROOT}/plugins/trex/devx-agent/eve/v1/session`;

interface EveCall {
  url: string;
  method: string;
  body: string;
  authorization: string | null;
}

/** Stand in for the eve loopback for the duration of one review. */
async function withEve<T>(
  events: unknown[],
  fn: (calls: EveCall[]) => Promise<T>,
  order?: string[],
): Promise<T> {
  const calls: EveCall[] = [];
  const enc = new TextEncoder();
  const realFetch = globalThis.fetch;
  const prevUrl = Deno.env.get("DEVX_EVE_LOOPBACK_URL");
  Deno.env.set("DEVX_EVE_LOOPBACK_URL", EVE_ROOT);
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : "",
      authorization: new Headers(init?.headers).get("authorization"),
    });
    order?.push(`${method} ${url.replace(EVE_BASE, "")}`.trim());
    if (method === "POST" && url.endsWith("/session")) {
      return Promise.resolve(new Response(JSON.stringify({ sessionId: "s-rev" }), { status: 200 }));
    }
    if (method === "GET" && url.includes("/stream")) {
      return Promise.resolve(
        new Response(new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } }), { status: 200 }),
      );
    }
    for (const e of events) controller?.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
    controller?.close();
    return Promise.resolve(new Response("{}", { status: 202 }));
  }) as typeof fetch;

  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
    if (prevUrl === undefined) Deno.env.delete("DEVX_EVE_LOOPBACK_URL");
    else Deno.env.set("DEVX_EVE_LOOPBACK_URL", prevUrl);
  }
}

function turnEvents(text: string, extra: unknown[] = []) {
  return [
    ...extra,
    { type: "message.completed", data: { turnId: "t1", message: text, finishReason: "stop" } },
    { type: "turn.completed", data: { turnId: "t1", finishReason: "stop" } },
  ];
}

async function sseFrames(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text.split("\n\n")
    .map((b) => b.replace(/^data: /, "").trim())
    .filter((b) => b.length > 0)
    .map((b) => JSON.parse(b) as Record<string, unknown>);
}

const FINDING =
  `<security-finding title="Hardcoded key" level="high">main.ts embeds an API key.</security-finding>`;

Deno.test("security review: runs on eve and returns the findings its reply carried", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb(OPENAI_ROW);
    await withEve(turnEvents(`Reviewed.\n${FINDING}`), async (calls) => {
      const res = await handleSecurityRoutes(
        `/apps/${APP}/security/review`,
        "POST",
        new Request(`http://x/apps/${APP}/security/review`, {
          method: "POST",
          headers: { authorization: "Bearer caller-jwt" },
        }),
        USER,
        db.sql,
        CORS,
      );

      const frames = await sseFrames(res);
      const done = frames.find((f) => f.type === "review_done");
      assertEquals(frames.some((f) => f.type === "review_error"), false);
      assertEquals((done?.review as { findings: unknown[] }).findings, [
        { title: "Hardcoded key", level: "high", description: "main.ts embeds an API key." },
      ]);
      assertEquals((done?.review as { denials: unknown[] }).denials, []);

      // The review reached eve, on the caller's own token.
      assertEquals(calls.map((c) => `${c.method} ${c.url}`), [
        `POST ${EVE_BASE}`,
        `GET ${EVE_BASE}/s-rev/stream?startIndex=0`,
        `POST ${EVE_BASE}/s-rev`,
      ]);
      for (const c of calls) assertEquals(c.authorization, "Bearer caller-jwt");
      // Unattended, and claiming no approver it does not have.
      const create = JSON.parse(calls[0].body);
      assertEquals(create.unattended, true);
      assertEquals("approverReachable" in create, false);
    });
  });
});

Deno.test("security review: the read-only allowlist is on the session row before the turn is posted", async () => {
  await withWorkspace(async () => {
    // ONE log for the db writes and the eve calls, so this asserts an
    // interleaving. Two separate arrays cannot: each is in order by
    // construction whatever the other did.
    const order: string[] = [];
    const db = makeFakeDb(OPENAI_ROW, order);
    await withEve(turnEvents("Reviewed."), async () => {
      const res = await handleSecurityRoutes(
        `/apps/${APP}/security/review`,
        "POST",
        reviewRequest(),
        USER,
        db.sql,
        CORS,
      );
      // The route's work happens in the stream's start(); draining it is what
      // waits for the run to finish.
      await res.text();

      assertEquals(order, [
        "POST",
        "sql UPDATE agents.sessions",
        "GET /s-rev/stream?startIndex=0",
        "POST /s-rev",
      ]);
      const scopeIdx = db.calls.findIndex((q) => q.includes("UPDATE agents.sessions"));
      const [tools, declared, workspace, sessionId] = db.params[scopeIdx];
      assertEquals(tools, ["Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus"]);
      assertEquals(declared, true);
      assertEquals(workspace, "");
      assertEquals(sessionId, "s-rev");
    }, order);
  });
});

Deno.test("security review: a hard-tier denial completes the review and is reported to the caller", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb(OPENAI_ROW);
    const denied = {
      type: "action.result",
      data: {
        turnId: "t1",
        result: {
          kind: "tool-result",
          callId: "c1",
          toolName: "ExecuteSQL",
          output: { error: "ExecuteSQL requires approval but this session has no approver" },
        },
        status: "completed",
      },
    };
    await withEve(turnEvents("Reviewed what I could.", [denied]), async () => {
      const res = await handleSecurityRoutes(
        `/apps/${APP}/security/review`,
        "POST",
        reviewRequest(),
        USER,
        db.sql,
        CORS,
      );

      const frames = await sseFrames(res);
      const done = frames.find((f) => f.type === "review_done");
      const denials = [{
        toolName: "ExecuteSQL",
        reason: "ExecuteSQL requires approval but this session has no approver",
      }];
      // The review still completed and was stored…
      assertEquals(typeof (done?.review as { id: unknown }).id, "string");
      // …and the denial rides the REVIEW object, not a sibling field: onDone
      // forwards only `parsed.review`, and the progress line it would otherwise
      // use is cleared by onDone in the same breath.
      assertEquals((done?.review as { denials: unknown[] }).denials, denials);
      // Durable, not just live: a reload of a review whose tools were refused
      // must not look like a review that cleanly found nothing (V21).
      const insertIdx = db.calls.findIndex((q) => q.includes("INSERT INTO devx.agent_results"));
      assertEquals(insertIdx >= 0, true);
      assertEquals(db.calls[insertIdx].includes("denials"), true);
      assertEquals(JSON.parse(String(db.params[insertIdx][4])), denials);
    });
  });
});

// ---------------------------------------------------------------------------
// User ruling: QA and design reviews REFUSE to start on the delegated
// (claude-code) path. That loop has no browser tool at all, so the review would
// read files and report on a page it never opened; a partial-but-flagged result
// is not enough, because a reader who misses the banner reads it as a real pass.
// Security and code review still run there — Read/Glob/Grep genuinely cover them.
// ---------------------------------------------------------------------------

const CLAUDE_CODE_ROW = {
  provider: DELEGATED_PROVIDER,
  model: "sonnet",
  api_key: null,
  api_key_encrypted: null,
  api_key_iv: null,
  base_url: null,
};

Deno.test("browserlessRefusal: refuses exactly the two browser-dependent reviews, and only on the delegated path", () => {
  for (const reviewType of ["qa-test", "design-review"]) {
    const msg = browserlessRefusal(reviewType, DELEGATED_PROVIDER);
    assert(msg, `${reviewType} must be refused on ${DELEGATED_PROVIDER}`);
    // Names every browser tool it would have needed, so the message says WHY.
    for (const tool of REVIEW_TOOLSETS[reviewType].filter((t) => t.startsWith("Browser"))) {
      assertStringIncludes(String(msg), tool);
    }
    // And says there is no fallback: a claude-code account has no API key, so
    // resolveModel throws and the model loop is not an option either.
    assertStringIncludes(String(msg), "no API key");
    assertStringIncludes(String(msg), "Settings");
  }
  // The reviews that genuinely work on that path are untouched.
  for (const reviewType of ["security-review", "code-review", "docs-update"]) {
    assertEquals(browserlessRefusal(reviewType, DELEGATED_PROVIDER), null);
  }
  // And no review is refused on a model-loop provider.
  for (const reviewType of Object.keys(REVIEW_TOOLSETS)) {
    assertEquals(browserlessRefusal(reviewType, "openai"), null);
    assertEquals(browserlessRefusal(reviewType, null), null);
  }
});

Deno.test("a security review still runs on the delegated path — the refusal is scoped, not blanket", async () => {
  await withWorkspace(async () => {
    const db = makeFakeDb(CLAUDE_CODE_ROW);
    await withEve(turnEvents(`Reviewed.\n${FINDING}`), async (calls) => {
      const res = await handleSecurityRoutes(
        `/apps/${APP}/security/review`,
        "POST",
        new Request(`http://x/apps/${APP}/security/review`, {
          method: "POST",
          headers: { authorization: "Bearer caller-jwt" },
        }),
        USER,
        db.sql,
        CORS,
      );
      assertEquals(res.status, 200);
      const frames = await sseFrames(res);
      assertEquals(frames.some((f) => f.type === "review_error"), false);
      assert(frames.some((f) => f.type === "review_done"));
      assert(calls.some((c) => c.url.endsWith("/session")), "the review should have reached eve");
    });
  });
});

// The refusal must come BEFORE the dev-server precondition it makes irrelevant.
// Reported the other way round it costs two round trips to reach a reason that
// was knowable before the first: the user starts a dev server, retries, and only
// then learns the provider has no browser tools at all. No workspace and no dev
// server here on purpose — reaching either would itself be the regression.
Deno.test("a browserless QA review is refused before the dev-server check, not after", async () => {
  const db = makeFakeDb(CLAUDE_CODE_ROW);
  const res = await handleSecurityRoutes(
    `/apps/${APP}/qa/review`,
    "POST",
    new Request(`http://x/apps/${APP}/qa/review`, { method: "POST" }),
    USER,
    db.sql,
    CORS,
  );

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "browser_tools_unavailable");
  assertStringIncludes(body.error, "BrowserNavigate");
  // The dev-server precondition was never consulted.
  assert(!String(body.error).includes("Dev server"), `got the dev-server error instead: ${body.error}`);
});

Deno.test("the design review refuses at the same point, on the same provider", async () => {
  const db = makeFakeDb(CLAUDE_CODE_ROW);
  const res = await handleSecurityRoutes(
    `/apps/${APP}/design/review`,
    "POST",
    new Request(`http://x/apps/${APP}/design/review`, { method: "POST" }),
    USER,
    db.sql,
    CORS,
  );

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "browser_tools_unavailable");
  assert(!String(body.error).includes("Dev server"));
});

// Reordered, not removed: a provider that HAS browser tools still meets the
// dev-server precondition exactly as before.
Deno.test("a model-loop provider still gets the dev-server precondition, unchanged", async () => {
  const db = makeFakeDb(OPENAI_ROW);
  const res = await handleSecurityRoutes(
    `/apps/${APP}/qa/review`,
    "POST",
    new Request(`http://x/apps/${APP}/qa/review`, { method: "POST" }),
    USER,
    db.sql,
    CORS,
  );

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, undefined, "an openai QA review must not be refused for want of browser tools");
  assertStringIncludes(body.error, "Dev server");
});
