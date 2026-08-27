import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createHandler, buildHistory, deliverChildResult } from "./handler.ts";
import { loadAgent } from "../loader.ts";
import type { LoadedAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { MAX_CONSECUTIVE_WAKES } from "./orchestration.ts";
import { publish, subscribe, subscriberCount } from "./stream.ts";
import type { AgentEvent } from "./events.ts";
import { formatDiscordMessageContextBlock, formatMessagesBlock, type HistoryMessage } from "../channels/adapters/discord-messages.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./context/budget.ts";
import { ABANDONED_CHILD_ERROR } from "./sweep.ts";

// Builds the message the way adapters/discord.ts:807's sendToThread actually
// composes it for a thread-turn (`[contextBlock, attachmentsBlock, text]`
// joined on "\n\n", empty parts filtered) — no attachments, matching the
// common case. Real shape, not a stand-in, so tests against it exercise what
// startTurn's busy branch genuinely receives from the only adapter that
// reaches this path.
function composeDiscordMessage(humanText: string): string {
  const contextBlock = formatDiscordMessageContextBlock({
    userId: "u-1",
    username: "alice",
    channelId: "c-1",
    messageId: "m-1",
  });
  return [contextBlock, humanText].join("\n\n");
}

// adapters/discord.ts:866-869's mention-in-thread
// trigger composes a THIRD block into the same message —
// `formatMessagesBlock("thread_messages", history)`, up to 50 lines of past
// conversation — and reuses the same continuation token as thread-turn
// (discordContinuationToken(threadId, threadId)), so it can land on the same
// session/pending gate. Builds that exact three-part shape:
// `[contextBlock, thread_messages block, attachmentsBlock, text]`.
function composeMentionInThreadMessage(humanText: string, history: HistoryMessage[]): string {
  const contextBlock = formatDiscordMessageContextBlock({
    userId: "u-1",
    username: "alice",
    channelId: "c-1",
    messageId: "m-1",
  });
  const block = formatMessagesBlock("thread_messages", history);
  return [contextBlock, block, humanText].filter((p) => p.length > 0).join("\n\n");
}

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "http://local/plugins/trex/toy";

function inMemoryDb() {
  // Minimal in-memory impl of the SQL the store issues, keyed by table.
  // Exposed state (turns/steps/approvals) lets tests assert on persistence
  // and drive approval decisions without Postgres.
  const sessions = new Map<string, {
    status: string;
    created_by: string | null;
    // Orchestration columns (fix round 1) — undefined for an ordinary
    // (non-child) session, same as agents.sessions' real nullable columns.
    parent_session_id?: string;
    subagent?: string | null;
    nickname?: string;
    detached?: boolean;
    // Task 8 (deliverChildResult's wake budget) — undefined reads as 0, same
    // as the real column's NOT NULL DEFAULT 0.
    consecutive_wakes?: number;
    createdAt: Date;
  }>();
  const turns: Array<
    { id: string; session_id: string; seq: number; status: string; error: string | null; message: unknown; startedAt: Date }
  > = [];
  const steps: Array<{ turn_id: string; seq: number; kind: string; name: string | null; payload: unknown; usage: unknown }> = [];
  const approvals = new Map<string, { decision: string | null; sessionId: string; tool: string; turnId: string }>();
  // The follow-up queue a busy session's new message folds into (store.ts's
  // queueFollowUp/takeFollowUps), keyed the same order-preserving way
  // agents.turn_followups is (insertion order).
  const followUps: Array<{ session_id: string; message: string }> = [];
  // (userId, plugin, agent, tool) -> consent, keyed the same way as the
  // real table's primary key.
  const toolConsents = new Map<string, "always" | "never">();
  // Every call the store issues, in order — lets tests assert on the exact
  // params a route handed to the store (e.g. created_by, session-scoping)
  // without needing a real Postgres.
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let n = 0;
  const query = (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    // Orchestration (fix round 1): createChildSession's INSERT also matches
    // the generic "INSERT INTO agents.sessions" substring below, so it MUST
    // be checked first — distinguished by the parent_session_id column,
    // which only this statement's column list names.
    if (sql.includes("INSERT INTO agents.sessions") && sql.includes("parent_session_id")) {
      const id = `s-${++n}`;
      const [plugin_, agent_, createdBy, parentSessionId, , subagent, nickname, detached] = params as [
        string,
        string,
        string | null,
        string,
        string | null,
        string | null,
        string,
        boolean,
      ];
      void plugin_;
      void agent_;
      sessions.set(id, {
        status: "active",
        created_by: createdBy,
        parent_session_id: parentSessionId,
        subagent,
        nickname,
        detached,
        createdAt: new Date(),
      });
      return Promise.resolve({ rows: [{ id }] });
    }
    // countChildren — live/total over parent_session_id's children.
    if (sql.includes("count(*) FILTER")) {
      const pid = params[0] as string;
      const children = [...sessions.entries()].filter(([, s]) => s.parent_session_id === pid);
      const live = children.filter(([id]) => turns.some((t) => t.session_id === id && t.status === "running")).length;
      return Promise.resolve({ rows: [{ live, total: children.length }] });
    }
    // getChild / listChildren — LEFT JOIN LATERAL the latest turn (by seq)
    // for each child session; getChild additionally scopes to one id.
    if (sql.includes("turn_status") && sql.includes("turn_error")) {
      const pid = sql.includes("s.id = $1 AND s.parent_session_id = $2") ? (params[1] as string) : (params[0] as string);
      const onlyId = sql.includes("s.id = $1 AND s.parent_session_id = $2") ? (params[0] as string) : undefined;
      const rows = [...sessions.entries()]
        .filter(([id, s]) => s.parent_session_id === pid && (onlyId === undefined || id === onlyId))
        .map(([id, s]) => {
          const latest = turns.filter((t) => t.session_id === id).sort((a, b) => b.seq - a.seq)[0];
          return {
            id,
            nickname: s.nickname,
            subagent: s.subagent ?? null,
            detached: s.detached ?? false,
            created_at: s.createdAt,
            turn_status: latest?.status ?? null,
            turn_error: latest?.error ?? null,
          };
        });
      return Promise.resolve({ rows });
    }
    if (sql.includes("INSERT INTO agents.sessions")) {
      const id = `s-${++n}`;
      sessions.set(id, { status: "active", created_by: (params[2] as string | null) ?? null, createdAt: new Date() });
      return Promise.resolve({ rows: [{ id }] });
    }
    // getSession — matched on a short, stable prefix (not the full SELECT
    // text) so adding columns (Task 8: parent_session_id/detached/nickname,
    // for deliverChildResult) doesn't silently stop matching this branch.
    if (sql.includes("SELECT id, status, created_by")) {
      const s = sessions.get(params[0] as string);
      return Promise.resolve({
        rows: s
          ? [{
            id: params[0],
            status: s.status,
            created_by: s.created_by,
            parent_session_id: s.parent_session_id ?? null,
            detached: s.detached ?? false,
            nickname: s.nickname ?? null,
          }]
          : [],
      });
    }
    // isChildSession (fix round 2) — depth, derived fresh every turn.
    if (sql.includes("SELECT parent_session_id FROM agents.sessions")) {
      const s = sessions.get(params[0] as string);
      return Promise.resolve({ rows: [{ parent_session_id: s?.parent_session_id ?? null }] });
    }
    // bumpConsecutiveWakes / resetConsecutiveWakes (Task 8).
    if (sql.includes("consecutive_wakes = consecutive_wakes + 1")) {
      const s = sessions.get(params[0] as string);
      if (!s) return Promise.resolve({ rows: [] });
      s.consecutive_wakes = (s.consecutive_wakes ?? 0) + 1;
      return Promise.resolve({ rows: [{ consecutive_wakes: s.consecutive_wakes }] });
    }
    if (sql.includes("SET consecutive_wakes = 0")) {
      const s = sessions.get(params[0] as string);
      if (s) s.consecutive_wakes = 0;
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("SELECT id, seq, started_at FROM agents.turns")) {
      // getRunningTurn — the most-recently-started running turn.
      const running = turns.filter((t) => t.session_id === params[0] && t.status === "running")
        .sort((a, b) => b.seq - a.seq);
      const t = running[0];
      return Promise.resolve({ rows: t ? [{ id: t.id, seq: t.seq, started_at: t.startedAt }] : [] });
    }
    if (sql.includes("INSERT INTO agents.turns")) {
      const seq = turns.filter((t) => t.session_id === params[0]).length + 1;
      const t = {
        id: `t-${++n}`, session_id: params[0] as string, seq, status: "running", error: null,
        message: JSON.parse(params[1] as string), startedAt: new Date(),
      };
      turns.push(t);
      return Promise.resolve({ rows: [{ id: t.id, seq }] });
    }
    if (sql.includes("UPDATE agents.turns") && sql.includes("WHERE id = $1 AND status = 'running'")) {
      // finishTurn (fix round 1, 2026-08-27-agent-orchestration tasks 12-13
      // review) — scoped to the turn still being `running`; RETURNING id
      // reports whether THIS call actually won the running->{completed,
      // failed} transition (false when a reap already claimed it first).
      // Matched on the WHERE clause specifically (not just "UPDATE
      // agents.turns" + "RETURNING id") because reapStaleTurns/
      // failTurnsForSession's real SQL also contains "RETURNING id" but with
      // a different params shape ([sessionId, cutoff, errorText, ...] /
      // [sessionId, error]) that this branch must never be handed.
      const t = turns.find((t) => t.id === params[0] && t.status === "running");
      if (!t) return Promise.resolve({ rows: [] });
      t.status = params[1] as string;
      t.error = (params[2] as string | null) ?? null;
      return Promise.resolve({ rows: [{ id: t.id }] });
    }
    if (sql.includes("UPDATE agents.turns") && sql.includes("RETURNING id")) {
      // reapStaleTurns — cutoff is a JS-computed Date passed as a param (see
      // store.ts), matched against each turn's real startedAt the same way
      // the real `started_at < $n` predicate would. Also session-scoped —
      // params are [sessionId, cutoff, errorText], matching the real
      // `session_id = $1 AND started_at < $2` predicate.
      const sid = params[0] as string;
      const cutoff = params[1] as Date;
      const errorText = params[2] as string;
      const stale = turns.filter((t) =>
        t.session_id === sid && t.status === "running" && t.startedAt.getTime() < cutoff.getTime()
      );
      for (const t of stale) {
        t.status = "failed";
        t.error = errorText;
      }
      return Promise.resolve({ rows: stale.map((t) => ({ id: t.id })) });
    }
    if (sql.includes("UPDATE agents.turns")) {
      const t = turns.find((t) => t.id === params[0]);
      if (t) {
        t.status = params[1] as string;
        t.error = (params[2] as string | null) ?? null;
      }
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("INSERT INTO agents.turn_followups")) {
      // queueFollowUp.
      followUps.push({ session_id: params[0] as string, message: params[1] as string });
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("DELETE FROM agents.turn_followups")) {
      // takeFollowUps — drains (removes) every queued follow-up for
      // the session, oldest-first (insertion order, same as the CTE's
      // ORDER BY created_at against the real table).
      const sid = params[0] as string;
      const mine = followUps.filter((f) => f.session_id === sid);
      for (const f of mine) followUps.splice(followUps.indexOf(f), 1);
      return Promise.resolve({ rows: mine.map((f) => ({ message: f.message })) });
    }
    if (sql.includes("INSERT INTO agents.steps")) {
      steps.push({
        turn_id: params[0] as string, seq: params[1] as number, kind: params[2] as string,
        name: params[3] as string | null, payload: params[4], usage: params[5],
      });
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("INSERT INTO agents.approvals")) {
      const id = `r-${++n}`;
      approvals.set(id, {
        decision: null, sessionId: params[0] as string, turnId: params[1] as string, tool: params[2] as string,
      });
      return Promise.resolve({ rows: [{ request_id: id }] });
    }
    if (sql.includes("UPDATE agents.approvals")) {
      // params: [requestId, decision, sessionId] — mirrors store.ts's
      // `WHERE request_id = $1 AND session_id = $3 AND decision IS NULL`.
      const a = approvals.get(params[0] as string);
      if (!a || a.decision !== null || a.sessionId !== params[2]) return Promise.resolve({ rows: [] });
      a.decision = params[1] as string;
      return Promise.resolve({ rows: [{ request_id: params[0] }] });
    }
    if (sql.includes("SELECT request_id, tool, input FROM agents.approvals")) {
      // getSinglePendingApproval — the session's sole still-undecided
      // approval, mirroring store.ts's
      // `WHERE session_id = $1 AND decision IS NULL`.
      const sid = params[0] as string;
      const pending = [...approvals.entries()].filter(([, a]) => a.sessionId === sid && a.decision === null);
      return Promise.resolve({
        rows: pending.map(([id, a]) => ({ request_id: id, tool: a.tool, input: null })),
      });
    }
    if (sql.includes("SELECT decision")) {
      const a = approvals.get(params[0] as string);
      return Promise.resolve({ rows: a ? [{ decision: a.decision }] : [] });
    }
    if (sql.includes("SELECT tool FROM agents.approvals")) {
      const a = approvals.get(params[0] as string);
      return Promise.resolve({ rows: a ? [{ tool: a.tool }] : [] });
    }
    if (sql.includes("SELECT t.status FROM agents.approvals")) {
      // getApprovalTurnStatus — joins the approval to its turn the same way
      // the real `JOIN agents.turns t ON t.id = a.turn_id` does, so
      // resolveApprovalDecision's turn-status guard (Task 2 of the
      // never-stuck plan) sees a genuinely running/finished turn instead of
      // always missing (which would 404 every approval in this suite).
      const a = approvals.get(params[0] as string);
      const t = a ? turns.find((t) => t.id === a.turnId) : undefined;
      return Promise.resolve({ rows: t ? [{ status: t.status }] : [] });
    }
    if (sql.includes("SELECT consent FROM agents.tool_consents")) {
      const [userId, plugin, agentName, tool] = params as string[];
      const consent = toolConsents.get(`${userId}|${plugin}|${agentName}|${tool}`);
      return Promise.resolve({ rows: consent ? [{ consent }] : [] });
    }
    if (sql.includes("INSERT INTO agents.tool_consents")) {
      const [userId, plugin, agentName, tool, consent] = params as string[];
      toolConsents.set(`${userId}|${plugin}|${agentName}|${tool}`, consent as "always" | "never");
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("FROM agents.steps")) {
      const sid = params[0] as string;
      // store.addStep JSON.stringifies payload/usage before the "insert" (it
      // targets a jsonb column on real Postgres, which parses the text back
      // into an object on SELECT) — parse them back here too, or every
      // consumer of listEvents() sees strings instead of objects, unlike
      // production.
      const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
      const rows = steps
        .filter((s) => turns.some((t) => t.id === s.turn_id && t.session_id === sid))
        .map((s) => ({ turn_id: s.turn_id, kind: s.kind, name: s.name, payload: parse(s.payload), usage: parse(s.usage) }));
      return Promise.resolve({ rows });
    }
    // getHistory — turns with their steps aggregated (used by both the
    // compaction/history-assembly path and, orchestration-wise, by
    // spawn.ts's spawnChild (forking the parent's history) and awaitChild
    // (reading a child's own final text/error step).
    if (sql.includes("jsonb_agg")) {
      const sid = params[0] as string;
      const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
      const rows = turns
        .filter((t) => t.session_id === sid)
        .sort((a, b) => a.seq - b.seq)
        .map((t) => ({
          id: t.id,
          seq: t.seq,
          message: t.message,
          metadata: null,
          steps: steps
            .filter((s) => s.turn_id === t.id)
            .sort((a, b) => a.seq - b.seq)
            .map((s) => ({ kind: s.kind, name: s.name, payload: parse(s.payload) })),
        }));
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };
  return { query, sessions, turns, steps, approvals, toolConsents, calls, followUps };
}

// See runner.test.ts's FINISH/sequencedModel comment: ai@6's raw doStream
// "finish" chunk nests usage under inputTokens.total/outputTokens.total and
// finishReason under {unified, raw} (was flat in the v2 shape the brief was
// drafted against); doStream itself must return a Promise, not a bare
// object. Chunk arrays are typed `any[]` (matching runner.test.ts's
// `sequencedModel` precedent) so the literals aren't structurally checked
// against the full LanguageModelV3StreamPart union field-by-field.
// deno-lint-ignore no-explicit-any
const textChunks = (text: string): any[] => [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: text },
  { type: "text-end", id: "1" },
  {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 2 } },
  },
];
// deno-lint-ignore no-explicit-any
const toolCallChunks = (toolName: string, input: unknown): any[] => [
  { type: "tool-call", toolCallId: "c-1", toolName, input: JSON.stringify(input) },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

// Multi-step conversations call doStream once per step; cycle through the
// given responses (last one repeats) — same pattern as runner.test.ts.
// deno-lint-ignore no-explicit-any
function sequencedModel(...responses: any[][]) {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: () => {
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
}

function model(text: string) {
  return sequencedModel(textChunks(text));
}

async function makeHandler(
  opts: {
    model?: unknown;
    mutate?: (agent: LoadedAgent) => void;
    // Lets a test observe or override individual store calls without
    // reimplementing createStore — used to assert a round trip is NOT made.
    wrapStore?: (s: ReturnType<typeof createStore>) => ReturnType<typeof createStore>;
  } = {},
) {
  const agent = await loadAgent(TOY);
  opts.mutate?.(agent);
  const db = inMemoryDb();
  const base = createStore(db.query as never);
  const handler = createHandler({
    agent, store: opts.wrapStore ? opts.wrapStore(base) : base,
    plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: opts.model ?? model("hello from toy"),
  });
  return { handler, db };
}

// Poll until the fire-and-forget turn work settles. Draining background work
// inside the test that starts it (rather than disabling sanitizeOps /
// sanitizeResources) keeps Deno's sanitizer defaults meaningful — ai@6's
// simulateReadableStream schedules real setTimeout(...,0) timers per chunk,
// and returning before the async turn resolves would leak them into the
// next test.
async function until(cond: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const settled = (db: ReturnType<typeof inMemoryDb>) =>
  db.turns.length > 0 && db.turns.every((t) => t.status !== "running");

Deno.test("POST /eve/v1/session creates a session and returns the id header", async () => {
  const { handler, db } = await makeHandler();
  const res = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  assertEquals(res.status, 200);
  const sid = res.headers.get("x-eve-session-id");
  assert(sid);
  const body = await res.json();
  assertEquals(body.sessionId, sid);
  await until(() => settled(db)); // drain the fire-and-forget turn (see until())
  assertEquals(db.turns[0].status, "completed");
});

// Review fix (task 10-12, round 1): a malformed static config.model used to
// throw straight out of the pre-turn compaction block's
// parseModelString(deps.agent.config.model) call. That call sits between
// takeFollowUps and addTurn, with no try/catch of its own — only the outer
// fire-and-forget IIFE's `.catch(... "turn crashed" ...)`, which (per its own
// comment in handler.ts) never emits turn.failed/session.failed, so the
// throw would have silently hung every /stream reader on the session
// instead of failing the turn gracefully. The guard must degrade to "" (the
// same value the config.model-ABSENT branch already produces) and let the
// turn proceed.
//
// Requires a session with a PRIOR (completed) turn — the pre-turn compaction
// block only runs when priorTurns.length > 0 — and this file's inMemoryDb()
// fake has no matcher for getHistory's SQL shape (it always returns `[]`
// there, same gap noted in the task 10-12 report's "concerns" section), so
// that guard can never actually be reached against the usual db/makeHandler
// fixture. This needs a real store against Postgres, same as the sibling
// e2e test below.
Deno.test({
  name: "a malformed static config.model does not throw out of the pre-turn compaction path and the turn still completes",
  ignore: !Deno.env.get("DATABASE_URL"),
  fn: async () => {
    const pg = await import("npm:pg@^8");
    const pool = new pg.default.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
    const query = (sql: string, params?: unknown[]) => pool.query(sql, params as never);
    const store = createStore(query as never);
    // Hoisted so the finally block can clean up even when an assertion fails
    // — a failed run must not be the one that leaves rows behind.
    let sessionId: string | undefined;
    try {
      sessionId = await store.createSession("toy-agent", "toy", "model-guard-e2e-user");
      const t1 = await store.addTurn(sessionId, "first");
      await store.addStep(t1.id, 1, "text", null, { text: "hello from toy" });
      await store.addStep(t1.id, 2, "finish", null, { finishReason: "stop" }, { inputTokens: 10, outputTokens: 5 });
      await store.finishTurn(t1.id, "completed");

      // deps.model below always wins over config.model for the actual turn
      // (see resolveModelForTurn's precedence), so corrupting config.model
      // here isolates the parseModelString guard itself rather than also
      // requiring a working model resolution.
      const agent = await loadAgent(TOY);
      agent.config.model = "not-a-valid-provider-model-id-string";
      const handler = createHandler({
        agent, store, plugin: "toy-agent", agentName: "toy",
        basePath: "/plugins/trex/toy", model: model("hello again"),
      });

      const origError = console.error;
      const logged: string[] = [];
      console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
      try {
        const res = await handler(new Request(`${BASE}/eve/v1/session/${sessionId}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "second" }),
        }));
        assertEquals(res.status, 202);

        // Poll for BOTH the row count and its status: an unguarded throw
        // happens before addTurn, so turn 2 never gets created at all — a
        // naive "status of the latest turn" check would then just keep
        // re-reading turn 1's already-"completed" row and pass regardless of
        // the bug. Asserting the count is what actually catches that.
        const deadline = Date.now() + 10_000;
        let rows: Array<{ status: string }> = [];
        while (Date.now() < deadline) {
          const r = await pool.query(
            `SELECT status FROM agents.turns WHERE session_id = $1 ORDER BY seq`,
            [sessionId],
          );
          rows = r.rows;
          if (rows.length >= 2 && rows[1].status !== "running") break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        assertEquals(rows.length, 2, "turn 2 was never created — the pre-turn compaction path likely threw before addTurn");
        // The turn ran to completion — it was never silently hung by the throw.
        assertEquals(rows[1].status, "completed");
      } finally {
        console.error = origError;
      }
      assert(
        logged.some((l) => l.includes("could not parse agent model") && l.includes("not-a-valid-provider-model-id-string")),
        "malformed model value was not logged for diagnosis",
      );
    } finally {
      // Deleting the session cascades to its turns, steps and approvals
      // (V1__agents_init.sql's ON DELETE CASCADE), so the shared test
      // database does not accumulate a session per run of this file.
      if (sessionId) await pool.query(`DELETE FROM agents.sessions WHERE id = $1`, [sessionId]);
      await pool.end();
    }
  },
});

Deno.test("GET /stream replays persisted events as NDJSON after the turn ran", async () => {
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db)); // let the async turn finish (mock model is instant)
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  assertEquals(res.headers.get("content-type"), "application/x-ndjson");
  const text = await res.text();
  assert(text.includes('"turn.completed"'));
  // Replay of the persisted "text" step maps to message.completed, not
  // message.appended (see handler.ts's stepToEvent) — that's the event
  // eve's own client reads the final reply off (see events.ts).
  assert(text.includes('"message.completed"'));
  assert(text.includes('"hello from toy"'));
  // NDJSON framing (ndjsonEncode contract): every non-blank line is exactly
  // one JSON object, no SSE "data: " prefix or blank-line separators.
  const lines = text.split("\n").filter((l) => l !== "");
  assert(lines.length > 0);
  for (const line of lines) {
    assert(/^\{.*\}$/.test(line), `bad NDJSON line: ${JSON.stringify(line)}`);
    JSON.parse(line); // throws if malformed
  }
});

Deno.test("replay preserves live event order: message.completed before turn.completed", async () => {
  // Live order (asserted in runner.test.ts) is message.completed →
  // turn.completed; replay is seq-ordered over agents.steps, so the "text"
  // step must be persisted BEFORE the "finish" step (runner.ts's
  // persistText) or replay inverts the order eve clients depend on
  // (extractCompletedMessage reads the reply before the turn boundary).
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const types = (await res.text()).split("\n").filter((l) => l !== "")
    .map((l) => (JSON.parse(l) as { type: string }).type);
  const completedIdx = types.indexOf("message.completed");
  const finishIdx = types.indexOf("turn.completed");
  assert(completedIdx >= 0, `no message.completed in replay: [${types.join(", ")}]`);
  assert(finishIdx >= 0, `no turn.completed in replay: [${types.join(", ")}]`);
  assert(completedIdx < finishIdx, `replay order inverted: [${types.join(", ")}]`);
});

// Replay maps a persisted `custom` step (from ToolContext.emit on the
// session path — runner.test.ts covers the live side) back to the same
// `tool.event` a live subscriber would have seen, same as every other step
// kind (see handler.ts's stepToEvent).
Deno.test("GET /stream replays a persisted custom step as tool.event", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  assert(db.steps.some((s) => s.kind === "custom"), "expected a persisted custom step");
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const text = await res.text();
  assert(text.includes('"tool.event"'), `no tool.event in replay: ${text}`);
  const lines = text.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
  const toolEvent = lines.find((l) => l.type === "tool.event");
  assert(toolEvent, `no tool.event line: ${text}`);
  assertEquals(toolEvent.data.name, "progress");
  assertEquals(toolEvent.data.payload, { step: 1 });
});

// Regression guard for replay ordering: a custom step (persisted through
// the shared stepSeq counter during the tool phase) must replay BEFORE the
// text step's message.completed, which in turn must replay BEFORE finish's
// turn.completed — the eve-client ordering fix (persistText before the
// finish step, see runner.ts) that a future persist-sequencing change could
// silently break.
Deno.test("replay orders tool.event before message.completed before turn.completed", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const types = (await res.text()).split("\n").filter((l) => l !== "")
    .map((l) => (JSON.parse(l) as { type: string }).type);
  const toolEventIdx = types.indexOf("tool.event");
  const completedIdx = types.indexOf("message.completed");
  const finishIdx = types.indexOf("turn.completed");
  assert(toolEventIdx >= 0, `no tool.event in replay: [${types.join(", ")}]`);
  assert(completedIdx >= 0, `no message.completed in replay: [${types.join(", ")}]`);
  assert(finishIdx >= 0, `no turn.completed in replay: [${types.join(", ")}]`);
  assert(toolEventIdx < completedIdx, `tool.event after message.completed: [${types.join(", ")}]`);
  assert(completedIdx < finishIdx, `message.completed after turn.completed: [${types.join(", ")}]`);
});

Deno.test("unknown session 404s; unknown route 404s; healthz/eve-info list tools", async () => {
  const { handler } = await makeHandler();
  assertEquals((await handler(new Request(`${BASE}/eve/v1/session/nope/stream`))).status, 404);
  assertEquals((await handler(new Request(`${BASE}/eve/v1/session/nope`, { method: "POST", body: "{}" }))).status, 404);
  assertEquals((await handler(new Request(`${BASE}/bogus`))).status, 404);
  // basePath is anchored: unprefixed paths never hit our routes.
  assertEquals((await handler(new Request(`http://local/healthz`))).status, 404);
  const health = await (await handler(new Request(`${BASE}/healthz`))).json();
  assertEquals(health.tools.sort(), ["echo", "propose_card"]);
  assertEquals((await handler(new Request(`${BASE}/eve/v1/health`))).status, 200);
  const info = await (await handler(new Request(`${BASE}/eve/v1/info`))).json();
  assertEquals(info.kind, "eve-agent-info");
  assertEquals(info.tools.authored.map((t: { name: string }) => t.name).sort(), ["echo", "propose_card"]);
  // trex extension: /info surfaces clientOnly (always present as a boolean).
  const byName = Object.fromEntries(info.tools.authored.map((t: { name: string; clientOnly: boolean }) => [t.name, t.clientOnly]));
  assertEquals(byName.propose_card, true);
  assertEquals(byName.echo, false);
});

Deno.test("POST /eve/v1/session/:id (bare) on an existing session accepts and records a turn", async () => {
  const { handler, db } = await makeHandler();
  // Create the session without a first message — no turn starts.
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  assertEquals(db.turns.length, 0);
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  assertEquals(res.status, 202);
  await until(() => settled(db));
  assertEquals(db.turns.length, 1);
  assertEquals(db.turns[0].status, "completed");
  assert(db.steps.some((s) => s.turn_id === db.turns[0].id));
});

Deno.test("POST /eve/v1/session/:id with inputResponses resolves a pending approval", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const bad = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "ask_question" }] }),
  }));
  assertEquals(bad.status, 400);

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  assertEquals(res.status, 202);
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval resolves a pending approval and unblocks the turn; unknown requestId 404s", async () => {
  // Toy agent + an in-memory needsApproval tool (same pattern as runner.test.ts).
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  // The turn blocks inside the guarded tool until an approval decision lands.
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // Unknown requestId → 404 (checked while the real one is still pending).
  const missing = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: "nope", decision: "approve" }),
  }));
  assertEquals(missing.status, 404);

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { resolved: true });

  // Toolset default poll is 500ms; give the turn time to observe the decision.
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
  assert(db.steps.some((s) => s.kind === "tool-result" && s.name === "guarded"));
});

Deno.test("POST /approval 404s a requestId that belongs to a different session", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // A second, unrelated session — the pending approval belongs to `sid`,
  // not this one.
  const otherCreate = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const otherSid = otherCreate.headers.get("x-eve-session-id")!;

  const wrongSession = await handler(new Request(`${BASE}/eve/v1/session/${otherSid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(wrongSession.status, 404);

  // The real session can still resolve it — proves the 404 above was
  // session-scoping, not the approval being consumed/expired.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

// Sticky tool-consent decisions: POST /approval's
// "always"/"never" decisions resolve the pending request (as approve/deny)
// AND upsert agents.tool_consents for the authenticated user.
Deno.test("POST /approval with decision 'always' resolves as approve and upserts a sticky consent", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { resolved: true });
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "always");

  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval with decision 'never' resolves as deny and upserts a sticky consent", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "never" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "deny");
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "never");

  // Drain the fire-and-forget turn (denied tool call still lets the turn
  // finish, per the existing deny path) — see the `until` helper's own comment
  // on why leaving this pending leaks a timer into the next test.
  await until(() => settled(db), 10_000);
});

Deno.test("POST /approval rejects an 'always'/'never' decision without an authenticated user (400)", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(rejected.status, 400);
  // Still pending — the 400 must not have resolved it as a side effect.
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // Drain the fire-and-forget turn with a plain (non-sticky) decision, which
  // needs no authenticated user — otherwise the guarded tool's poll loop
  // leaks a timer past this test.
  await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "deny" }),
  }));
  await until(() => settled(db), 10_000);
});

// Same sticky handling on the inputResponses follow-up path (POST
// /eve/v1/session/:id), not just the standalone /approval convenience route.
Deno.test("POST /eve/v1/session/:id with inputResponses optionId 'always' resolves as approve and upserts a sticky consent", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "always" }] }),
  }));
  assertEquals(res.status, 202);
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "always");
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /eve/v1/session/:id rejects inputResponses optionId 'never' without an authenticated user (400)", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "never" }] }),
  }));
  assertEquals(rejected.status, 400);
  assertEquals(db.approvals.get(requestId)!.decision, null);
  // The 400 must not have produced a sticky consent row.
  assertEquals(db.toolConsents.size, 0);

  // Drain the fire-and-forget turn (see the sibling /approval test's comment).
  await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "deny" }] }),
  }));
  await until(() => settled(db), 10_000);
});

// Ride-along security fix: approval resolution must verify the caller is the
// session's owner, not just (requestId, sessionId) — otherwise any
// authenticated user who learns those ids could resolve someone else's pending
// approval and, with the sticky verbs, accrue a durable consent on their
// behalf.
Deno.test("POST /approval: the session owner (matching x-user-id) can resolve their own approval", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval: a non-owner user is rejected with 403, the pending request is untouched, and no consent row is created", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // A different authenticated user learns (sessionId, requestId) somehow and
  // tries to resolve it — including a sticky "always", which would have
  // accrued a consent under their own identity if unchecked.
  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-2" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(rejected.status, 403);
  assertEquals(await rejected.json(), { error: "approval can only be resolved by the session owner" });
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // The real owner can still resolve it — proves the 403 was ownership, not
  // approval corruption.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  await until(() => settled(db), 10_000);
});

Deno.test("POST /eve/v1/session/:id inputResponses: a non-owner user is rejected with 403 and the pending request is untouched", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-2" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  assertEquals(rejected.status, 403);
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // Drain with the real owner so no timer leaks into the next test.
  await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  await until(() => settled(db), 10_000);
});

Deno.test("POST /approval: an anonymous session (no created_by) can still be resolved by anyone", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // No x-user-id at all on the resolve either — pre-existing anonymous
  // behavior must be unaffected by the ownership check.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  await until(() => settled(db), 10_000);
});

Deno.test("model failure marks the turn failed and persists an error event (no unhandled rejection)", async () => {
  const failing = new MockLanguageModelV3({
    doStream: () => Promise.reject(new Error("model exploded")),
  });
  const { handler, db } = await makeHandler({ model: failing });
  // The fake DB ids are deterministic (first session is always "s-1"), so we
  // can subscribe to the live stream registry BEFORE the POST — no race with
  // the fire-and-forget turn — and count lifecycle events on the wire.
  const live: AgentEvent[] = [];
  const unsub = subscribe("s-1", (e) => live.push(e));
  // streamText's default onError logs the stream error via console.error;
  // capture it so the expected diagnostic becomes an assertion instead of
  // noise in the test output.
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const res = await handler(new Request(`${BASE}/eve/v1/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    }));
    assertEquals(res.status, 200); // the failure is async — session creation still succeeds
    await until(() => settled(db));
  } finally {
    console.error = origError;
    unsub();
  }
  assertEquals(db.turns[0].status, "failed");
  assert(db.turns[0].error && db.turns[0].error.includes("model exploded"));
  assert(db.steps.some((s) => s.kind === "error"));
  assert(logged.some((l) => l.includes("model exploded")));
  // Exactly ONE turn.failed on the wire: handler.ts's startTurn catch owns
  // turn-lifecycle events; runner.ts's error case must not emit a second
  // one (it only persists the error step).
  assertEquals(live.filter((e) => e.type === "turn.failed").length, 1);
  assertEquals(live.filter((e) => e.type === "session.failed").length, 1);
  // No unhandled rejection / leaked timer: the test failing on Deno's default
  // sanitizers or an uncaught-error crash IS the assertion here.
});

// "One turn at a time per session". Measured over two weeks of real
// transcripts: 43 of 263 turns (16%) started while the previous turn on the
// same session was still running — one case had two turns drive the same
// coding-agent chat 22s apart with contradictory instructions ("Option B" then
// "stop do A instead") and the coder acted on the wrong one. startTurn (this
// file) is the single choke point every caller (channel adapters' send(),
// native /eve/v1/session[/:id]) goes through, so the fix lives here rather than
// in a specific channel adapter.
Deno.test("a message arriving while a turn is running is queued, not started as a second concurrent turn", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate; // blocks the first turn "in flight" until the test releases it
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");

  // A queued message must not silently vanish — it gets a live,
  // turn-agnostic acknowledgement event a channel adapter
  // can turn into a reply/reaction (see discord.ts's "message.queued"
  // handler for the Discord-side consumption of this).
  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const second = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "second, urgent" }),
  }));
  assertEquals(second.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid)); // drain the fire-and-forget queue write
  unsub();

  // No second, concurrent turn — the message was folded into the queue instead.
  assertEquals(db.turns.length, 1);
  assertEquals(db.turns[0].status, "running");
  assertEquals(db.followUps, [{ session_id: sid, message: "second, urgent" }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack, `expected a message.queued event, got: [${live.map((e) => e.type).join(", ")}]`);
  assertEquals((ack.data as { text: string }).text, "second, urgent");

  releaseGate();
  // The queued follow-up is run automatically as soon as the first turn
  // finishes — not left waiting for some future external message to arrive
  // and pick it up, which would silently strand an instruction the user
  // already sent during the busy window.
  await until(() => db.turns.length === 2 && settled(db));
  assertEquals(db.turns[0].status, "completed");
  assertEquals(db.turns[1].status, "completed");
  assertEquals(db.turns[1].message, "second, urgent");
  assertEquals(db.followUps.length, 0); // drained
});

Deno.test("a follow-up queued during a turn that fails is folded into the next externally-triggered turn", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      throw new Error("model exploded");
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");

  await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "queued while busy" }),
  }));
  await until(() => db.followUps.some((f) => f.session_id === sid));

  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    releaseGate();
    await until(() => db.turns.length === 1 && settled(db)); // the first turn fails; no auto-continuation on failure
  } finally {
    console.error = origError;
  }
  assertEquals(db.turns[0].status, "failed");
  // Not lost: still queued, waiting for the next real message.
  assertEquals(db.followUps, [{ session_id: sid, message: "queued while busy" }]);
  assert(logged.some((l) => l.includes("model exploded")));

  // Model recovers; a genuinely new message arrives and drains the queue,
  // folding it into ITS turn's message.
  const recoveredModel = model("recovered");
  const agent = await loadAgent(TOY);
  const recoveredHandler = createHandler({
    agent, store: createStore(db.query as never), plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: recoveredModel,
  });
  await recoveredHandler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "try again" }),
  }));
  await until(() => db.turns.length === 2 && settled(db));
  assertEquals(db.turns[1].status, "completed");
  // "queued while busy" arrived BEFORE "try again" (it was queued while the
  // first turn was still running; "try again" is what finally re-triggered
  // this turn afterward) — store.ts's takeFollowUps docstring promises "in
  // the order they arrived", so the queued item must lead, not trail.
  assertEquals(db.turns[1].message, "queued while busy\n\ntry again");
  assertEquals(db.followUps.length, 0);
});

// Lazy reaping, not a scheduler. Serialization means a turn stuck `running`
// forever (the same defect reapStaleTurns exists for — 21 turns observed) now
// wedges every LATER message on that session too, since nothing else ever
// un-blocks getRunningTurn. There is no periodic hook in this runtime to run
// reapStaleTurns on a timer, so startTurn reaps on the way in instead:
// finding a running turn, it calls
// reapStaleTurns, then re-reads getRunningTurn — a genuinely stale turn is
// now failed and the new message proceeds normally; a live one still folds
// into the queue exactly as before (covered by the sibling tests above).
Deno.test("a stale (abandoned) running turn is reaped when a new message arrives, and that message runs immediately instead of queuing behind it forever", async () => {
  let releaseStuckGate: () => void = () => {};
  const stuckGate = new Promise<void>((resolve) => { releaseStuckGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const stuckModel = new MockLanguageModelV3({
    doStream: async () => {
      await stuckGate;
      return { stream: simulateReadableStream({ chunks: textChunks("stuck turn finally answers") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: stuckModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  // Simulate an abandoned turn (e.g. a worker crash/redeploy mid-turn): well
  // past the 2h reap cutoff. No DB-backed backdateTurn helper exists in this
  // file's fake-store convention (see store.test.ts's own tests, which drive
  // the store's SQL/params directly instead) — this file's equivalent is
  // direct fake-state mutation, same as every other test here that reads/
  // asserts on `db.turns` directly.
  db.turns[0].startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);

  // A second handler instance shares the same underlying fake store/db —
  // standing in for "a different request hits the worker" (the stuck turn's
  // own model call above never resolves on its own).
  const agent = await loadAgent(TOY);
  const recoveredHandler = createHandler({
    agent, store: createStore(db.query as never), plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: model("recovered"),
  });
  await recoveredHandler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "are you there?" }),
  }));
  await until(() => db.turns.length === 2 && db.turns[1].status === "completed");

  assertEquals(db.turns[0].status, "failed"); // reaped, not left running forever
  assert(db.turns[0].error?.includes("turn abandoned"));
  // Ran immediately as its own turn — NOT folded/queued behind the zombie.
  assertEquals(db.turns[1].message, "are you there?");
  assertEquals(db.followUps.length, 0);

  releaseStuckGate(); // let the original stuck call settle so it doesn't leak past the test
  await until(() => true); // yield a tick for the release to be observed
});

// The lazy-reap call must sit INSIDE the queue branch's try/catch — a
// transient reap failure (a real failure mode, since this runs on every
// message that lands on a busy session, not a hypothetical) would otherwise
// escape to the outer "turn crashed" catch and silently drop the incoming
// message (queueFollowUp never reached, no queue row, no ack). It must
// instead degrade to the safe assumption: treat the session as still busy
// and queue the message exactly as if reaping had found nothing stale.
Deno.test("a reap failure during the busy-check still queues and acknowledges the message (not dropped, not logged as a turn crash)", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const db = inMemoryDb();
  const baseStore = createStore(db.query as never);
  const brokenReapStore = {
    ...baseStore,
    reapStaleTurns: () => Promise.reject(new Error("reap query timed out")),
  };
  const agent = await loadAgent(TOY);
  const handler = createHandler({
    agent, store: brokenReapStore as never, plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: gatedModel,
  });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "second" }),
    }));
    await until(() => db.followUps.some((f) => f.session_id === sid));
  } finally {
    console.error = origError;
    unsub();
    releaseGate();
  }

  assertEquals(db.turns.length, 1); // no second, concurrent turn
  assertEquals(db.followUps, [{ session_id: sid, message: "second" }]); // still queued despite the reap failure
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack, `expected a message.queued event, got: [${live.map((e) => e.type).join(", ")}]`);
  assertEquals((ack.data as { text: string }).text, "second");
  assert(
    logged.some((l) => l.includes("stale-turn reap failed") && l.includes("treating session as busy")),
    `expected the distinct reap-failure log, got: ${JSON.stringify(logged)}`,
  );
  assert(!logged.some((l) => l.includes("turn crashed")), `"turn crashed" must not fire for a reap failure: ${JSON.stringify(logged)}`);
});

// The queue-write path (busy session) must not be misreported through the
// generic "turn crashed" log — no turn was ever created on that path.
Deno.test("a follow-up queue write failure is logged distinctly from a turn crash", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const db = inMemoryDb();
  const baseStore = createStore(db.query as never);
  const brokenStore = {
    ...baseStore,
    queueFollowUp: () => Promise.reject(new Error("db unavailable")),
  };
  const agent = await loadAgent(TOY);
  const handler = createHandler({
    agent, store: brokenStore as never, plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: gatedModel,
  });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");

  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "second" }),
    }));
    await until(() => logged.some((l) => l.includes("db unavailable")));
  } finally {
    console.error = origError;
    releaseGate();
  }
  assert(logged.some((l) => l.includes("follow-up queue write failed") && !l.includes("turn crashed")));
  assert(!logged.some((l) => l.includes("turn crashed")));
});

// A QUALIFIED reply to a pending approval gate ("yes but first explain why
// the chunk count is wrong") is not
// a bare yes/no — matchGateText returns null for it (gate-text.ts) — so a
// pre-checking caller (discord.ts's tryResolveGate) falls through to send()/
// startTurn with the gate STILL pending. Before this fix that reply was
// queued behind the very gate it answered, for up to the whole 30-minute
// approval poll, with neither side able to move. The busy branch now denies
// the pending gate itself (letting the parked awaitApproval return and the
// coder revise) and still queues the reply to ride the next turn as the
// revision's driving instruction.
Deno.test("a qualified reply arriving while a gate is pending resolves the gate as deny and does not strand the message", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate; // stands in for the turn parked inside a poll on the pending gate
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");

  // A pending gate on this session — direct fake-state mutation, same
  // convention as the stale-turn test above backdating db.turns[0].startedAt.
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const reply = "yes but first explain why the chunk count is wrong";
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: reply }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  // The gate was resolved as deny — the parked awaitApproval poll returns
  // instead of sitting there for the rest of the 30-minute window.
  assertEquals(db.approvals.get("r-1")?.decision, "deny");
  // The reply itself is NOT stranded — it is queued to drive the revision.
  assertEquals(db.followUps, [{ session_id: sid, message: reply }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack, `expected a message.queued event, got: [${live.map((e) => e.type).join(", ")}]`);
  assertEquals((ack.data as { text: string; deniedPendingGate: boolean }).text, reply);
  // The ack carries what actually happened, so the channel adapter can say
  // something other than the generic "the ball is not in your court" line.
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, true);
});

Deno.test("a reply arriving on a busy session with NO pending gate still queues exactly as it does today", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  // No pending approval on this session.

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "also rename the tests to .test.ts" }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.followUps, [{ session_id: sid, message: "also rename the tests to .test.ts" }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, false);
});

// A reply that matches matchGateText's
// vocabulary CLEANLY (raw, unwrapped text — the shape a hypothetical
// non-Discord caller that skips tryResolveGate would send directly) must
// still be left alone here: matchGateText("approve") is non-null, so the
// deny condition's first clause is false regardless of
// looksLikeGateResponse. This is the "caller that never pre-checks the
// gate" case the comment above describes — distinct from, and still valid
// alongside, the composed-message coverage below.
Deno.test("a busy-session reply with RAW text that matches the pending gate's vocabulary cleanly is left alone (not auto-resolved)", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "approve" }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.approvals.get("r-1")?.decision, null); // untouched — not auto-resolved
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, false);
});

// The actual regression: adapters/discord.ts
// composes the inbound message as `[contextBlock, attachmentsBlock,
// text].join("\n\n")` BEFORE it ever reaches startTurn — so asText(message)
// here is always wrapped in a `<discord_context>` block. Pre-fix,
// matchGateText(composed text) was always null (the wrapper alone blows past
// MAX_DECISION_WORDS) so EVERY message on a busy session with a pending gate
// was denied, not just qualified answers. looksLikeGateResponse must strip
// the wrapper and judge the human's actual words: a qualified "yes but…"
// answers the gate (deny + queue as the revision instruction) while ordinary
// chatter does not (queue only, gate left pending).
Deno.test("a composed Discord message that qualifiedly answers the pending gate is denied and queued", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const composed = composeDiscordMessage("yes but first explain why the chunk count is wrong");
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: composed }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.approvals.get("r-1")?.decision, "deny");
  assertEquals(db.followUps, [{ session_id: sid, message: composed }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, true);
});

Deno.test("a composed Discord message that is unrelated chatter does NOT deny the pending gate, only queues", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const composed = composeDiscordMessage("fyi @alice is out today");
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: composed }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.approvals.get("r-1")?.decision, null); // gate left pending, not denied
  assertEquals(db.followUps, [{ session_id: sid, message: composed }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, false);
});

// Composed-message shape, no pending gate: unchanged behaviour (queue only,
// deniedPendingGate false) — the composition itself must not trip any part
// of the deny path when there is nothing to deny.
Deno.test("a composed Discord message on a busy session with NO pending gate still just queues", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  // No pending approval on this session.

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const composed = composeDiscordMessage("also rename the tests to .test.ts");
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: composed }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.followUps, [{ session_id: sid, message: composed }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, false);
});

// adapters/discord.ts's
// mention-in-thread trigger composes a THIRD block — `<thread_messages>`,
// up to 50 lines of past conversation — into the same message, reusing the
// same continuation token as thread-turn, so it can land on the same
// session/pending gate. Before stripComposedWrapper also stripped that
// block, a message that is unambiguously NOT a gate answer
// ("also rename the tests to .test.ts") flipped to looksLikeGateResponse ==
// true purely because the STALE history happened to contain ordinary
// yes/no/ok words — auto-denying the gate on account of someone else's old
// message, not the human's current reply.
Deno.test("a composed mention-in-thread message (three-part shape, stale yes/no/ok history) does NOT deny the pending gate on history alone", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const staleHistory: HistoryMessage[] = [
    { author: "alice", bot: false, content: "yes let's do that" },
    { author: "bob", bot: false, content: "no I don't think so" },
    { author: "alice", bot: false, content: "ok fine, moving on" },
  ];
  const composed = composeMentionInThreadMessage("also rename the tests to .test.ts", staleHistory);
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: composed }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.approvals.get("r-1")?.decision, null); // gate left pending, not denied
  assertEquals(db.followUps, [{ session_id: sid, message: composed }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, false);
});

// Same three-part shape, but the CURRENT reply (not the history) is a
// genuine qualified answer — must still deny, same as the two-part shape.
Deno.test("a composed mention-in-thread message whose CURRENT reply qualifiedly answers the gate is still denied", async () => {
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  // deno-lint-ignore no-explicit-any
  const gatedModel = new MockLanguageModelV3({
    doStream: async () => {
      await gate;
      return { stream: simulateReadableStream({ chunks: textChunks("first done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: gatedModel });

  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "first" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.turns.length === 1 && db.turns[0].status === "running");
  db.approvals.set("r-1", { decision: null, sessionId: sid, tool: "awaitApproval", turnId: db.turns[0].id });

  const live: AgentEvent[] = [];
  const unsub = subscribe(sid, (e) => live.push(e));

  const staleHistory: HistoryMessage[] = [
    { author: "alice", bot: false, content: "yes let's do that" },
    { author: "bob", bot: false, content: "no I don't think so" },
  ];
  const composed = composeMentionInThreadMessage(
    "yes but first explain why the chunk count is wrong",
    staleHistory,
  );
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: composed }),
  }));
  assertEquals(res.status, 202);
  await until(() => db.followUps.some((f) => f.session_id === sid));
  unsub();
  releaseGate();

  assertEquals(db.approvals.get("r-1")?.decision, "deny");
  assertEquals(db.followUps, [{ session_id: sid, message: composed }]);
  const ack = live.find((e) => e.type === "message.queued");
  assertExists(ack);
  assertEquals((ack.data as { deniedPendingGate: boolean }).deniedPendingGate, true);
});

// reapStaleTurns must not reach across sessions. Before the fix a message on
// ANY busy session marked EVERY stale `running` turn deployment-wide, so
// another session's genuinely long-running turn (plausible: the channel step
// floor was raised to 200 and streamTurn has no timeout) could be failed out
// from under it by an unrelated session's traffic, re-opening the
// two-concurrent-turns hole this reap-scoping fix exists to close.
Deno.test("a stale turn on ANOTHER session is left alone while the calling session's stale turn is reaped", async () => {
  let releaseA: () => void = () => {};
  const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
  // deno-lint-ignore no-explicit-any
  const modelA = new MockLanguageModelV3({
    doStream: async () => {
      await gateA;
      return { stream: simulateReadableStream({ chunks: textChunks("a done") }) };
    },
  });
  const { handler, db } = await makeHandler({ model: modelA });

  // Session A: its own stale (abandoned) running turn, well past the 2h cutoff.
  const createA = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "a-first" }),
  }));
  const sidA = createA.headers.get("x-eve-session-id")!;
  await until(() => db.turns.some((t) => t.session_id === sidA && t.status === "running"));
  const turnA = db.turns.find((t) => t.session_id === sidA)!;
  turnA.startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);

  // Session B: a DIFFERENT, unrelated session with its own live-but-old
  // running turn — stands in for a genuinely long-running turn elsewhere in
  // the deployment (not the caller's own zombie).
  let releaseB: () => void = () => {};
  const gateB = new Promise<void>((resolve) => { releaseB = resolve; });
  // deno-lint-ignore no-explicit-any
  const modelB = new MockLanguageModelV3({
    doStream: async () => {
      await gateB;
      return { stream: simulateReadableStream({ chunks: textChunks("b done") }) };
    },
  });
  const agent = await loadAgent(TOY);
  const handlerB = createHandler({
    agent, store: createStore(db.query as never), plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: modelB,
  });
  const createB = await handlerB(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "b-first" }),
  }));
  const sidB = createB.headers.get("x-eve-session-id")!;
  await until(() => db.turns.some((t) => t.session_id === sidB && t.status === "running"));
  const turnB = db.turns.find((t) => t.session_id === sidB)!;
  turnB.startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // also past the cutoff

  // A new message lands on session A ONLY — this is what triggers the lazy
  // reap, and it must only touch session A's own stale turn.
  const recoveredHandler = createHandler({
    agent, store: createStore(db.query as never), plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: model("a recovered"),
  });
  await recoveredHandler(new Request(`${BASE}/eve/v1/session/${sidA}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "are you there?" }),
  }));
  await until(() => turnA.status === "failed");

  assertEquals(turnA.status, "failed"); // reaped — the caller's own session
  assert(turnA.error?.includes("turn abandoned"));
  // Session B's stale turn is UNTOUCHED — still running, not reaped out from
  // under it by session A's traffic.
  assertEquals(turnB.status, "running");
  assertEquals(turnB.error, null);

  releaseA();
  releaseB();
  await until(() => true);
});

Deno.test("channel turn: a throwing delivery registration (onTurnCreated) does NOT abort the turn (robustness)", async () => {
  const agent = await loadAgent(TOY);
  // A channel whose `events` access throws — this fires inside startTurn's
  // onTurnCreated (the delivery-registration callback: layer.ts's registerForTurn
  // reads channel.events). Pre-fix that throw unwound the turn's IIFE BEFORE
  // turn.started/runTurn, so the turn died with no turn.failed/session.failed and
  // any /stream reader hung forever. The turn must now run to completion and emit
  // its own lifecycle regardless of a delivery-registration failure.
  // deno-lint-ignore no-explicit-any
  (agent.channels as any).boomevt = {
    __trexChannel: true,
    get events() { throw new Error("registration boom"); },
    routes: [{
      method: "POST",
      path: "/in",
      // deno-lint-ignore no-explicit-any
      handler: async (_req: Request, args: any) => {
        const s = await args.send("hi", { auth: null, continuationToken: "u-1" });
        return Response.json({ sessionId: s.id });
      },
    }],
  };

  const db = inMemoryDb();
  const channelStore = {
    resolveOrCreateSession: () => Promise.resolve({ sessionId: "chan-sess", created: true }),
    setContinuationToken: () => Promise.resolve(),
  };
  const handler = createHandler({
    agent,
    store: createStore(db.query as never),
    plugin: "toy-agent",
    agentName: "toy",
    basePath: "/plugins/trex/toy",
    model: model("hello from toy"),
    channelStore: channelStore as never,
  });

  // Deterministic sessionId from the fake channelStore -> subscribe before the POST.
  const live: AgentEvent[] = [];
  const unsub = subscribe("chan-sess", (e) => live.push(e));
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const res = await handler(new Request(`${BASE}/eve/v1/boomevt/in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    assertEquals(res.status, 200); // send() already returned before the async throw
    await until(() => settled(db)); // pre-fix this would hang (turn stuck "running")
  } finally {
    console.error = origError;
    unsub();
  }

  // The turn ran to completion despite the registration throw...
  assertEquals(db.turns[0].status, "completed");
  // ...and published its full lifecycle on the wire (turn.started + a terminal).
  assert(live.some((e) => e.type === "turn.started"), "turn.started was published");
  assert(live.some((e) => e.type === "turn.completed"), "turn.completed was published");
  assert(live.some((e) => e.type === "session.waiting"), "session parked (terminal reached)");
  // The registration failure was logged, not silently swallowed.
  assert(logged.some((l) => l.includes("delivery registration failed")), "logged the registration failure");
});

Deno.test("POST /chat returns a UIMessage stream", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  assertEquals(res.status, 200);
  assert((res.headers.get("content-type") || "").includes("text/event-stream"));
  const body = await res.text();
  assert(body.length > 0);
});

// Fix round 1, Finding 1: /chat is a second live production route
// (COMPAT.md — kept for useChat frontends), and it now wires ctx.spawn too
// (handler.ts's buildSpawnCapabilities), so the built-in `agent` tool goes
// through the SAME child-session delegation the session/turn path uses —
// there is exactly one implementation, not two that can silently diverge on
// fork_turns/error-shape/progress-events by which route the caller happens
// to hit. This proves it actually works end-to-end on /chat, not merely
// that the code compiles: a real child session gets created, runs its own
// turn (through the SAME mocked model, since /chat's tool call blocks on
// awaitChild before the parent's own next model call can happen), and its
// answer reaches the parent's final reply.
Deno.test("POST /chat: the built-in agent tool spawns and awaits a REAL child session", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(
      toolCallChunks("agent", { prompt: "say hi" }),
      textChunks("child says hi"),
      textChunks("parent says done"),
    ),
  });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "delegate this" }] }] }),
  }));
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(text.includes("parent says done"), `expected the parent's post-delegation answer in the stream: ${text}`);

  // Proves this went through spawnChild/createChildSession for real — a
  // child session row exists, scoped to the /chat request's (ephemeral)
  // session as its parent.
  const childEntries = [...db.sessions.entries()].filter(([, s]) => s.parent_session_id !== undefined);
  assertEquals(childEntries.length, 1, "expected exactly one child session created by the agent tool");
  const [childId] = childEntries[0];
  // Fix round 2, Minor: `session_id` is set on EVERY turn row (including the
  // parent's), so filtering on it alone proved nothing — this would have
  // passed even if the child's turn never ran at all. Scope to the actual
  // child session id and assert its OWN turn reached "completed" (not left
  // "running", i.e. orphaned).
  const childTurn = db.turns.find((t) => t.session_id === childId);
  assert(childTurn, "expected the child session to have its own turn row");
  assertEquals(childTurn.status, "completed", "expected the child's own turn to have completed, not be left running/orphaned");
});

// Fix round 2 (task-6-7-report.md), Critical finding: depth must be derived
// from durable state (agents.sessions.parent_session_id, via
// store.isChildSession), not threaded from spawn time — a child session's
// OWN turn must never receive the built-in `agent` tool, or it could spawn a
// grandchild, defeating the one-level depth cap the wake-loop safety
// argument depends on. Drives the exact same real spawn as the test above,
// but inspects the ACTUAL tool schema sent to the model for both the
// parent's call (must include "agent") and the child's own call (must not),
// via a model that captures its doStream() options — the strongest proof
// available: the tool is unreachable by the model, not merely absent from
// some intermediate object nothing downstream reads.
Deno.test("POST /chat: a spawned child's own turn is depth-capped — it does not receive the agent tool", async () => {
  // deno-lint-ignore no-explicit-any
  const calls: any[] = [];
  let call = 0;
  const responses = [
    toolCallChunks("agent", { prompt: "say hi" }), // parent's step 1: delegate
    textChunks("child says hi"), // child's own (and only) step
    textChunks("parent says done"), // parent's step 2: after the child returns
  ];
  const model = new MockLanguageModelV3({
    // deno-lint-ignore no-explicit-any
    doStream: (options: any) => {
      calls.push(options);
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
  const { handler } = await makeHandler({ model });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "delegate this" }] }] }),
  }));
  await res.text(); // drain the stream so the whole delegation actually runs to completion

  assertEquals(calls.length, 3, `expected exactly 3 model calls (parent, child, parent); got ${calls.length}`);
  const toolNames = (i: number): string[] =>
    ((calls[i].tools ?? []) as Array<{ name: string }>).map((t) => t.name);
  assert(toolNames(0).includes("agent"), "the parent's own turn must offer the agent tool");
  assert(!toolNames(1).includes("agent"), "the spawned child's own turn must NOT offer the agent tool (depth must be 1, not 0)");
});

// task-u1: usage must reach the wire via the finish part's messageMetadata —
// toUIMessageStream() previously ran with no options, so totalUsage was only
// persisted to agents.steps (observability) and never sent to the client.
Deno.test("POST /chat: finish part carries usage in messageMetadata", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  const text = await res.text();
  assert(text.includes('"type":"finish"'), `no finish part in stream: ${text}`);
  assert(text.includes('"messageMetadata"'), `finish part missing messageMetadata: ${text}`);
  // model("hello from toy") -> textChunks' usage: inputTokens.total=1, outputTokens.total=2
  assert(text.includes('"inputTokens"'), `messageMetadata missing usage.inputTokens: ${text}`);
  assert(text.includes('"outputTokens"'), `messageMetadata missing usage.outputTokens: ${text}`);
});

// ToolContext.emit on /chat interleaves a `data-${name}` UIMessage part into
// the SAME stream useChat consumes (createUIMessageStream + writer.merge — see
// handler.ts for the v6 API verification). No agents.steps write on this path
// (unlike the session path) — /chat never persisted tool-call/tool-result steps
// either.
Deno.test("POST /chat interleaves ToolContext.emit as a data-* UIMessage part", async () => {
  const { handler } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }] }),
  }));
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(text.includes('"type":"data-progress"'), `no data-progress part in stream: ${text}`);
  assert(text.includes('"step":1'), `emitted payload missing from stream: ${text}`);
});

// /chat setup-phase failures must keep the same HTTP-error semantics as before.
// buildSdkTools (and its filterTools hook) runs BEFORE createUIMessageStream,
// so a throwing hook rejects the route — it must NOT be demoted to a 200
// response carrying an in-stream SSE error frame (which is what moving tool
// building inside the stream's execute() would have done). Matches
// hooks.test.ts's assertRejects posture for a throwing resolveModel on /chat.
Deno.test("POST /chat: a throwing filterTools hook rejects the request (setup phase, no 200+SSE-error demotion)", async () => {
  const { handler } = await makeHandler({
    mutate: (agent) => {
      agent.config.filterTools = () => {
        throw new Error("filterTools exploded");
      };
    },
  });
  await assertRejects(
    () =>
      handler(new Request(`${BASE}/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
      })),
    Error,
    "filterTools exploded",
  );
});

// A tool that never calls ctx.emit must not add any data-* part — same
// no-op-when-unused posture as the session path (runner.test.ts).
Deno.test("POST /chat: a tool that never calls ctx.emit adds no data-* part", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  const text = await res.text();
  assert(!/"type":"data-/.test(text), `unexpected data-* part: ${text}`);
});

Deno.test("POST /chat rejects a missing or empty messages array with 400", async () => {
  const { handler } = await makeHandler();
  for (const payload of [{}, { messages: [] }]) {
    const res = await handler(new Request(`${BASE}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: "messages[] required" });
  }
});

// /chat creates a FRESH session per request (it is the stateless endpoint —
// history comes from the client, not from replay), so its activated-tools
// read could only ever return []. It was a guaranteed-empty round trip per
// request. Making it meaningful needs a session id the caller supplies and
// reuses across requests, which is the thing /chat is defined not to have —
// see COMPAT.md's deferred-tool-loading entry.
Deno.test("POST /chat does not read activated tools (its session is new, so there are none)", async () => {
  let reads = 0;
  const { handler } = await makeHandler({
    wrapStore: (s) => ({
      ...s,
      getActivatedTools: (id: string) => {
        reads++;
        return s.getActivatedTools(id);
      },
    }),
  });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  assertEquals(res.status, 200);
  await res.text(); // drain the stream so the request fully settles
  assertEquals(reads, 0, "/chat made an activated-tools read that can only return []");
});

// The proxy (plugin/function.ts) injects x-user-id from auth-context
// middleware into the worker request headers; handler.ts must read it back
// off and pass it through as created_by so a session's owner is
// recoverable — it was previously always NULL regardless of who created it.
Deno.test("x-user-id header populates created_by on session creation (POST /eve/v1/session)", async () => {
  const { handler, db } = await makeHandler();
  await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "user-42" },
    body: JSON.stringify({}),
  }));
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", "user-42"]);
});

Deno.test("created_by is null when x-user-id header is absent (POST /eve/v1/session)", async () => {
  const { handler, db } = await makeHandler();
  await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", null]);
});

Deno.test("x-user-id header populates created_by on the /chat endpoint's session", async () => {
  const { handler, db } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "user-7" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  // Drain the UIMessage stream (same as "POST /chat returns a UIMessage
  // stream" below) — simulateReadableStream schedules real setTimeout(...)
  // timers per chunk; leaving the body unread leaks them into later tests.
  await res.text();
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", "user-7"]);
});

Deno.test("GET /stream (live tail) delivers events published after replay completes", async () => {
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const readUntil = async (needle: string, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!text.includes(needle)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${needle}: ${text}`);
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  };
  await readUntil('"turn.completed"'); // the replay snapshot
  publish(sid, { type: "session.waiting", data: { wait: "next-user-message" } });
  await readUntil('"session.waiting"'); // the live event, published well after replay
  await reader.cancel();
});

Deno.test("GET /stream subscribes before replay: an event published during the replay window is not lost, and buffered events flush after the replay snapshot", async () => {
  // Regression test for the replay/live gap: previously the route did
  // listEvents() → replay → subscribe(), so anything published in that
  // window was neither in the replay snapshot nor caught live — genuinely
  // lost. Now it subscribes first (buffering into memory), replays, then
  // flushes the buffer — so a same-window event is delivered exactly once
  // more than it would have been (after the replay snapshot), never zero.
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));

  // A store wrapper whose listEvents() blocks on `gate` — simulates the
  // window between "start replaying" and "replay snapshot ready" during
  // which a live event can land.
  const baseStore = createStore(db.query as never);
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const gatedStore = {
    ...baseStore,
    listEvents: async (id: string) => {
      await gate;
      return baseStore.listEvents(id);
    },
  };
  const agent = await loadAgent(TOY);
  const gatedHandler = createHandler({
    agent, store: gatedStore, plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
  });

  const streamPromise = gatedHandler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  // Let microtasks run: the route's async start() calls subscribe()
  // synchronously before its first await (on the gated listEvents()), so by
  // the time this resolves, the subscription is already live.
  await new Promise((r) => setTimeout(r, 10));
  // Published "during the replay window" — subscribe() already happened,
  // listEvents() has not resolved yet.
  publish(sid, { type: "session.waiting", data: { wait: "next-user-message" } });
  releaseGate();

  const res = await streamPromise;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 5000;
  while (!text.includes('"session.waiting"') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  await reader.cancel();

  const types = text.split("\n").filter((l) => l !== "").map((l) => (JSON.parse(l) as { type: string }).type);
  assert(types.includes("message.completed"), `no message.completed in output: [${types.join(", ")}]`);
  assert(types.includes("session.waiting"), `buffered event was lost: [${types.join(", ")}]`);
  // Buffer flush ordering: the replay snapshot (message.completed /
  // turn.completed) precedes the buffered live event in the output.
  const lastReplayedIdx = Math.max(types.lastIndexOf("message.completed"), types.lastIndexOf("turn.completed"));
  const waitingIdx = types.indexOf("session.waiting");
  assert(lastReplayedIdx < waitingIdx, `replay/buffer order inverted: [${types.join(", ")}]`);
});

Deno.test("GET /stream releases the subscriber when replay (listEvents) fails", async () => {
  // subscribe() now runs BEFORE the awaited listEvents(); if that query
  // rejects, the subscriber must be released (unsub + controller.error) or
  // it leaks permanently in buffering mode — buffer growing on every
  // publish, with the abort listener never attached and cancel() never
  // firing on an errored stream.
  const { handler: _seed, db } = await makeHandler();
  await _seed(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = "s-1"; // deterministic fake-DB id (see model-failure test)
  await until(() => settled(db));

  const baseStore = createStore(db.query as never);
  const failingStore = {
    ...baseStore,
    listEvents: () => Promise.reject(new Error("replay query exploded")),
  };
  const agent = await loadAgent(TOY);
  const failingHandler = createHandler({
    agent, store: failingStore, plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
  });

  const before = subscriberCount(sid);
  const res = await failingHandler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  // The rejection surfaces through the errored stream body, not the
  // (already-sent) 200 response head.
  let errored = false;
  try {
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (e) {
    errored = true;
    assert(String(e).includes("replay query exploded"));
  }
  assert(errored, "stream body should error when replay fails");
  // No leaked subscriber: the registry is back to its pre-request count.
  assertEquals(subscriberCount(sid), before);
});

// ── OAuth broker routes ──────────────────────────────────────────────────────
import { signState } from "../connections/oauth/state.ts";
import type { OAuthConnector, OAuthStore, OAuthToken } from "../connections/oauth/store.ts";

const OAUTH_SECRET = "handler-oauth-secret";

function oauthHandler() {
  const puts: Array<{ pt: string; pid: string; c: string; token: OAuthToken }> = [];
  const connectors: Record<string, OAuthConnector> = {
    github: {
      authorizationUrl: "https://prov.example/authorize",
      tokenUrl: "https://prov.example/token",
      clientId: "cid",
      clientSecret: "csecret",
      scopes: "repo",
      principalScope: "user",
    },
  };
  const store: OAuthStore = {
    getToken: () => Promise.resolve(null),
    putToken: (pt, pid, c, token) => {
      puts.push({ pt, pid, c, token });
      return Promise.resolve();
    },
    getConnector: (id) => Promise.resolve(connectors[id] ?? null),
  } as OAuthStore;
  return { store, puts, connectors };
}

Deno.test("oauth route: 404 when no broker is configured", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/start?state=x`));
  assertEquals(res.status, 404);
});

Deno.test("oauth start route is mounted and 302s on a valid signed state", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const { store } = oauthHandler();
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
    oauth: { store, secret: OAUTH_SECRET, startUrlBase: "/plugins/trex/toy/eve/v1/oauth", basePath: "/plugins/trex/toy" },
  });
  const state = await signState(
    { session: "s", principalType: "user", principalId: "u", connector: "github", nonce: "n", exp: Date.now() + 600_000 },
    OAUTH_SECRET,
  );
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/start?state=${encodeURIComponent(state)}`));
  assertEquals(res.status, 302);
  assert((res.headers.get("location") ?? "").startsWith("https://prov.example/authorize"));
});

Deno.test("oauth callback route rejects a tampered state with 400 (no token write)", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const { store, puts } = oauthHandler();
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
    oauth: { store, secret: OAUTH_SECRET, startUrlBase: "/plugins/trex/toy/eve/v1/oauth", basePath: "/plugins/trex/toy" },
  });
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/callback?code=X&state=forged.sig`));
  assertEquals(res.status, 400);
  assertEquals(puts.length, 0);
});

Deno.test("buildHistory feeds tool calls and results back to the model", async () => {
  const store = {
    getHistory: () => Promise.resolve([{
      seq: 1,
      message: "read config.ts", metadata: null,
      steps: [
        { kind: "tool-call", name: "Read", payload: { toolCallId: "c1", input: { path: "config.ts" } } },
        { kind: "tool-result", name: "Read", payload: { toolCallId: "c1", output: "export const x = 1;" } },
        { kind: "text", name: null, payload: { text: "It exports x." } },
      ],
    }]),
  };
  const msgs = await buildHistory("s-1", store as never, DEFAULT_CONTEXT_CONFIG);
  const kinds = msgs.map((m) => m.role);
  assertEquals(kinds, ["user", "assistant", "tool", "assistant"]);
});

Deno.test({
  name: "e2e: turn 2 sees turn 1's tool result in its request messages",
  ignore: !Deno.env.get("DATABASE_URL"),
  fn: async () => {
    const pg = await import("npm:pg@^8");
    const pool = new pg.default.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
    const query = (sql: string, params?: unknown[]) => pool.query(sql, params as never);
    const store = createStore(query as never);
    // Hoisted for the finally-block cleanup — see the sibling e2e test above.
    let sessionId: string | undefined;
    try {
      sessionId = await store.createSession("toy-agent", "toy", "e2e-user");

      // Turn 1: a Read tool call and its result.
      const t1 = await store.addTurn(sessionId, "read config.ts");
      await store.addStep(t1.id, 1, "tool-call", "Read", { toolCallId: "c1", input: { path: "config.ts" } });
      await store.addStep(t1.id, 2, "tool-result", "Read", { toolCallId: "c1", output: "export const PORT = 8080;" });
      await store.addStep(t1.id, 3, "text", null, { text: "It sets PORT to 8080." });
      // Real turns always finish before the next one starts — enforced by
      // idx_agents_turns_one_running_per_session (V9) — so this must too.
      await store.finishTurn(t1.id, "completed");

      // Turn 2: what the model would actually be sent.
      await store.addTurn(sessionId, "what port was that?");
      const msgs = await buildHistory(sessionId, store, DEFAULT_CONTEXT_CONFIG);

      const serialized = JSON.stringify(msgs);
      assert(
        serialized.includes("export const PORT = 8080;"),
        "turn 1 tool result missing from turn 2 context — the original defect",
      );
      assert(serialized.includes("c1"), "tool call id missing");
      assertEquals(msgs.filter((m) => m.role === "tool").length, 1);
    } finally {
      // Cascades to turns and steps — see the sibling e2e test above.
      if (sessionId) await pool.query(`DELETE FROM agents.sessions WHERE id = $1`, [sessionId]);
      await pool.end();
    }
  },
});

// --- Task 8: deliverChildResult (completion delivery and parent wake) -----
//
// A deliberately narrow fake — not a full store/handler — so these tests
// exercise deliverChildResult's own decision logic (blocking vs detached,
// busy-parent, the wake budget) in isolation from a real runTurn/model.
// `wakes` seeds what bumpConsecutiveWakes resolves TO (the post-increment
// value a real UPDATE...RETURNING would give), not a pre-increment count.
function fakeDeliverDeps(opts: {
  followUps?: unknown[];
  started?: unknown[];
  child?: { detached?: boolean };
  runningTurn?: { id: string } | null;
  wakes?: number;
} = {}) {
  const followUps = opts.followUps ?? [];
  const started = opts.started ?? [];
  const pending: string[] = [];
  return {
    store: {
      getSession: (_id: string) =>
        Promise.resolve({ parent_session_id: "p-1", detached: true, nickname: "wisp", ...opts.child }),
      queueFollowUp: (sessionId: string, text: string) => {
        followUps.push({ sessionId, text });
        pending.push(text);
        return Promise.resolve();
      },
      getRunningTurn: (_sessionId: string) => Promise.resolve(opts.runningTurn ?? null),
      bumpConsecutiveWakes: (_sessionId: string) => Promise.resolve(opts.wakes ?? 1),
      takeFollowUps: (_sessionId: string) => Promise.resolve(pending.splice(0)),
    },
    wake: (sessionId: string, message: string, childSessionId: string) => {
      started.push({ sessionId, message, childSessionId });
    },
  };
}

Deno.test("a detached child's completion queues a followup and wakes the parent", async () => {
  const followUps: unknown[] = [];
  const started: unknown[] = [];
  await deliverChildResult(fakeDeliverDeps({ followUps, started }) as never, "c-1", { text: "found three bugs" });
  assertEquals(followUps.length, 1);
  assert(JSON.stringify(followUps[0]).includes("found three bugs"));
  assertEquals(started.length, 1, "an idle parent must be woken");
});

Deno.test("a blocking child neither queues nor wakes", async () => {
  const followUps: unknown[] = [];
  const started: unknown[] = [];
  await deliverChildResult(
    fakeDeliverDeps({ followUps, started, child: { detached: false } }) as never,
    "c-1",
    { text: "x" },
  );
  assertEquals(followUps.length, 0);
  assertEquals(started.length, 0);
});

Deno.test("a failed child still reaches its parent", async () => {
  const followUps: unknown[] = [];
  await deliverChildResult(fakeDeliverDeps({ followUps }) as never, "c-1", { error: "model refused" });
  assert(JSON.stringify(followUps[0]).includes("model refused"), "a failure must not vanish");
});

Deno.test("a busy parent gets the followup but no second turn", async () => {
  const followUps: unknown[] = [];
  const started: unknown[] = [];
  await deliverChildResult(
    fakeDeliverDeps({ followUps, started, runningTurn: { id: "t-9" } }) as never,
    "c-1",
    { text: "x" },
  );
  assertEquals(followUps.length, 1);
  assertEquals(started.length, 0, "one turn at a time — the running turn will drain it");
});

Deno.test("the wake budget stops a runaway loop", async () => {
  const started: unknown[] = [];
  await deliverChildResult(
    fakeDeliverDeps({ started, wakes: MAX_CONSECUTIVE_WAKES }) as never,
    "c-1",
    { text: "x" },
  );
  assertEquals(started.length, 0, "at the cap the parent must not be woken again");
});

Deno.test("a session with no parent (or an unknown session) is left alone", async () => {
  const followUps: unknown[] = [];
  const started: unknown[] = [];
  const deps = fakeDeliverDeps({ followUps, started });
  // deno-lint-ignore no-explicit-any
  (deps.store as any).getSession = (_id: string) => Promise.resolve(null);
  await deliverChildResult(deps as never, "top-level-session", { text: "x" });
  assertEquals(followUps.length, 0);
  assertEquals(started.length, 0);
});

// --- Task 8: end-to-end through the real handler --------------------------

Deno.test("a real detached child's completion wakes its idle parent with a followup turn", async () => {
  const { handler, db } = await makeHandler({ model: model("the subtask is done") });
  const store = createStore(db.query as never);

  const parentRes = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "kick off a background task" }),
  }));
  const parentId = parentRes.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const turnsBeforeWake = db.turns.filter((t) => t.session_id === parentId).length;

  const childId = await store.createChildSession({
    plugin: "toy-agent",
    agent: "toy",
    parentSessionId: parentId,
    parentTurnId: null,
    subagent: null,
    nickname: "wisp",
    detached: true,
  });

  const childRes = await handler(new Request(`${BASE}/eve/v1/session/${childId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "do the subtask" }),
  }));
  assertEquals(childRes.status, 202);

  // Waits for the wake turn's row to actually appear before checking it
  // finished — settled(db) alone would race true the instant the child's own
  // turn completes but before deliverChildResult has started the parent's
  // next turn.
  await until(() => db.turns.filter((t) => t.session_id === parentId).length > turnsBeforeWake);
  await until(() => settled(db));

  const parentTurns = db.turns.filter((t) => t.session_id === parentId).sort((a, b) => a.seq - b.seq);
  assertEquals(parentTurns.length, turnsBeforeWake + 1, "the parent should have gained exactly one new turn");
  const wokenTurn = parentTurns[parentTurns.length - 1];
  assertEquals(wokenTurn.status, "completed");
  assert(
    typeof wokenTurn.message === "string" && wokenTurn.message.includes("wisp") &&
      wokenTurn.message.includes("the subtask is done"),
    `expected the woken turn's message to name the child and carry its result: ${JSON.stringify(wokenTurn.message)}`,
  );
  assertEquals(db.sessions.get(parentId)?.consecutive_wakes, 1, "the wake budget should have bumped exactly once");
});

// Task 13 (2026-08-27-agent-orchestration): the LAZY on-message reap (see the
// "stale (abandoned) running turn" tests above, in the busy-branch section)
// only ever notified the CHANNEL a turn came from (notifyReapedForSession) —
// a DETACHED CHILD's parent heard nothing when its child was reaped this
// way, which is exactly the silent-hang class the heartbeat work exists to
// close: a child abandoned on a session nobody messages again would recover
// via the periodic sweep (sweep.test.ts covers that path), but a child that
// SOMEONE re-messages directly (its own session id, known to the caller)
// hits this lazy path instead, and used to leave its parent waiting forever.
//
// Deliberately placed here (with the other end-to-end deliverChildResult
// tests) rather than beside the busy-branch reap tests above: this file's
// "stale (abandoned) running turn" tests deliberately leave a genuinely
// pending model call running past the end of their own test (see their own
// comments) — an unrelated, pre-existing Deno leak-sanitizer artifact of
// that technique (green in CI) that otherwise bleeds into whichever test
// runs immediately next in file order.
Deno.test("a lazily-reaped DETACHED CHILD's abandonment reaches its parent, not just the channel", async () => {
  const { handler, db } = await makeHandler({ model: model("kicked off") });
  const store = createStore(db.query as never);

  const parentRes = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "kick off a background task" }),
  }));
  const parentId = parentRes.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const turnsBeforeWake = db.turns.filter((t) => t.session_id === parentId).length;

  const childId = await store.createChildSession({
    plugin: "toy-agent", agent: "toy", parentSessionId: parentId, parentTurnId: null,
    subagent: null, nickname: "wisp", detached: true,
  });

  // A running turn on the child, fabricated directly via the store (no real
  // model/turn loop involved — a genuinely-stuck model call would leave a
  // dangling timer for this test's whole lifetime, since nothing here ever
  // needs it to actually finish). Backdated well past the reap cutoff, same
  // technique the busy-branch reap tests use, standing in for a worker that
  // died mid-turn.
  await store.addTurn(childId, "do the subtask");
  const childTurn = db.turns.find((t) => t.session_id === childId)!;
  childTurn.startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);

  // A message lands on the (stale) CHILD session directly — e.g. a caller
  // that knows the child's session id re-messaging it. This is what
  // triggers the LAZY on-message reap (handler.ts's startTurn busy branch);
  // the periodic sweep is covered separately in sweep.test.ts.
  await handler(new Request(`${BASE}/eve/v1/session/${childId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "are you still there?" }),
  }));

  // Waits for the SPECIFIC abandonment wake turn, by content, rather than a
  // turn count — re-messaging the child session directly (as this test
  // does, to trigger the lazy path at all) ALSO falls through, once reaped,
  // to the same pre-existing, session-agnostic "then run the incoming
  // message as this session's own fresh turn" recovery behavior the
  // ORIGINAL "stale (abandoned) running turn" test (above) exercises for a
  // top-level session — unrelated to and out of scope for both fix-round-1
  // findings, but it means the CHILD session here can legitimately go on to
  // complete a second, real turn of its own after being reaped, which (now
  // correctly, per fix round 1) delivers a SECOND, separate, genuine result
  // to the parent. A turn-count assertion would be racy against exactly
  // when that second, unrelated delivery lands; asserting by content is not.
  await until(() =>
    db.turns.some((t) =>
      t.session_id === parentId && typeof t.message === "string" && t.message.toLowerCase().includes("abandoned")
    )
  );
  await until(() => settled(db)); // drain the (unrelated) second child turn too, so nothing leaks past this test

  assertEquals(childTurn.status, "failed", "the child's abandoned turn must be reaped");
  const abandonedWake = db.turns.find((t) =>
    t.session_id === parentId && typeof t.message === "string" && t.message.toLowerCase().includes("abandoned")
  );
  assert(abandonedWake, "expected a wake turn on the parent saying the child was abandoned");
  assert(db.turns.filter((t) => t.session_id === parentId).length > turnsBeforeWake, "the parent must have gained at least one new (wake) turn");
});

Deno.test("a blocking (non-detached) child's completion never wakes its parent", async () => {
  const { handler, db } = await makeHandler({ model: model("blocking child result") });
  const store = createStore(db.query as never);

  const parentRes = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const parentId = parentRes.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const turnsBeforeWake = db.turns.filter((t) => t.session_id === parentId).length;

  const childId = await store.createChildSession({
    plugin: "toy-agent",
    agent: "toy",
    parentSessionId: parentId,
    parentTurnId: null,
    subagent: null,
    nickname: "blocker",
    detached: false,
  });

  await handler(new Request(`${BASE}/eve/v1/session/${childId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "do it" }),
  }));
  await until(() => settled(db));
  // Give any (incorrect) wake a moment to land before asserting its absence.
  await new Promise((r) => setTimeout(r, 100));

  assertEquals(
    db.turns.filter((t) => t.session_id === parentId).length,
    turnsBeforeWake,
    "a blocking child's completion must never start a new parent turn",
  );
  assertEquals(db.followUps.filter((f) => f.session_id === parentId).length, 0);
});

// ---------------------------------------------------------------------------
// Fix round 1 (2026-08-27-agent-orchestration, tasks 12-13 review), finding
// 2: "a child has exactly one turn" must be actually true, not usually true.
// The post-finishTurn drain-and-chain used to be unconditional: an
// agent_send message landing in the narrow window after the child's LAST
// prepareStep call (runner.ts) but before this finishTurn would get drained
// here and chained into a SECOND turn — the exact same message would
// sometimes be read mid-turn (if it arrived earlier) and sometimes start a
// whole new turn (if it arrived in this window), decided by timing the
// caller cannot observe. It is now gated on depth===0 (top-level only).
// ---------------------------------------------------------------------------

Deno.test("fix round 1 (finding 2): a follow-up that lands in the race window right before a child's finishTurn is never chained into a second turn", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const baseStore = createStore(db.query as never);

  // Assigned once the child session exists (below), same pattern as the
  // finding-1 test above — targets only the CHILD's own turn.
  let childId = "";
  let queuedOnce = false;
  const raceyStore = {
    ...baseStore,
    finishTurn: async (turnId: string, status: "completed" | "failed", error?: string) => {
      const t = db.turns.find((t) => t.id === turnId);
      if (status === "completed" && !queuedOnce && t && t.session_id === childId) {
        queuedOnce = true;
        // Simulates an agent_send message (spawn.ts's sendToChild ->
        // store.queueFollowUp) landing in the exact race window: after the
        // child's last prepareStep call already drained nothing, but before
        // this finishTurn commits.
        await baseStore.queueFollowUp(childId, "wrap it up now");
      }
      return baseStore.finishTurn(turnId, status, error);
    },
  };

  const handler = createHandler({
    agent, store: raceyStore as never, plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: model("the subtask is done"),
  });

  const parentRes = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "kick off a background task" }),
  }));
  const parentId = parentRes.headers.get("x-eve-session-id")!;
  await until(() => settled(db));

  childId = await baseStore.createChildSession({
    plugin: "toy-agent", agent: "toy", parentSessionId: parentId, parentTurnId: null,
    subagent: null, nickname: "wisp", detached: true,
  });

  await handler(new Request(`${BASE}/eve/v1/session/${childId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "do the subtask" }),
  }));
  await until(() => settled(db));
  await until(() => queuedOnce);
  // Give any (incorrect) second turn a moment to land before asserting its
  // absence — matching the "blocking child" test's own posture above.
  await new Promise((r) => setTimeout(r, 100));

  assertEquals(
    db.turns.filter((t) => t.session_id === childId).length,
    1,
    "a child must never gain a second turn, even when a follow-up is queued for it in the finishTurn race window",
  );
  assertEquals(
    db.followUps.filter((f) => f.session_id === childId).length,
    1,
    "the follow-up is simply never read (documented consequence, runner.ts's makePrepareStep) — not silently drained either",
  );
});

// Single real turn (not two) — a second full turn through the toy agent's
// real MCP connection attempt is what made this test flake on Deno's leak
// sanitizer (an environmental issue shared with several pre-existing
// Discord/channel-gate tests in this file, not a bug in this logic). The
// wake e2e test above already proves the OTHER half — that a wake-started
// turn does NOT reset the budget — via its final consecutive_wakes === 1
// assertion (a buggy unconditional reset there would zero it back out after
// deliverChildResult's bump).
Deno.test("resetConsecutiveWakes fires for an ordinary (non-wake) turn", async () => {
  const resets: string[] = [];
  const { handler, db } = await makeHandler({
    wrapStore: (s) => ({
      ...s,
      resetConsecutiveWakes: (id: string) => {
        resets.push(id);
        return s.resetConsecutiveWakes(id);
      },
    }),
  });
  const res = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sessionId = res.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  assertEquals(resets, [sessionId], "an ordinary, non-wake turn must reset the wake budget");
});

// Fix round 1 (review): the wake marker must not be readable from any
// client-writable field. Before the fix, startTurn keyed the reset decision
// off `metadata.wokenBy` — but on the session routes `metadata` IS
// `body.metadata`, caller-supplied JSON. A client sending
// `{"message":"...","metadata":{"wokenBy":"anything"}}` would have had its
// own, human-started turn silently treated as wake-started, skipping the
// reset and walking consecutive_wakes toward MAX_CONSECUTIVE_WAKES with
// nothing in the logs to explain why that session's fan-outs went quiet.
// This test forges exactly that request body and asserts the reset still
// fires — it would have failed against the pre-fix code.
Deno.test("a client-forged metadata.wokenBy does not suppress the wake-budget reset", async () => {
  const resets: string[] = [];
  const { handler, db } = await makeHandler({
    wrapStore: (s) => ({
      ...s,
      resetConsecutiveWakes: (id: string) => {
        resets.push(id);
        return s.resetConsecutiveWakes(id);
      },
    }),
  });
  const res = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // A real wake never reaches startTurn this way (deliverChildResult's
    // `wake` call passes no metadata at all — see startTurn's dedicated
    // `wokenByChildId` parameter) — this is exactly what an ordinary,
    // externally-supplied request body forging that shape looks like.
    body: JSON.stringify({ message: "hi", metadata: { wokenBy: "forged-child-id" } }),
  }));
  const sessionId = res.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  assertEquals(
    resets,
    [sessionId],
    "a client-supplied metadata.wokenBy must not be able to suppress the wake-budget reset",
  );
  assertEquals(db.sessions.get(sessionId)?.consecutive_wakes, 0);
});

// Minor (review): a child whose final step produced no text must not
// silently deliver "Agent x finished:\n\n" with nothing after it — that
// reads, to a model, like a truncated message rather than a turn that
// genuinely had nothing to report.
Deno.test("a detached child with no final text step delivers an explicit no-output notice", async () => {
  const followUps: unknown[] = [];
  await deliverChildResult(fakeDeliverDeps({ followUps }) as never, "c-1", { text: "" });
  assertEquals(followUps.length, 1);
  const delivered = (followUps[0] as { text: string }).text;
  assert(!delivered.includes("finished:\n\n\n"), "must not produce a bare, contentless followup");
  assert(delivered.includes("no output"), `expected an explicit no-output notice, got: ${delivered}`);
});

// ---------------------------------------------------------------------------
// Fix round 1 (2026-08-27-agent-orchestration, tasks 12-13 review):
// deliverChildResult must be reached AT MOST ONCE per child. This is no
// longer enforced by a guard inside deliverChildResult itself (an earlier
// draft used a per-process WeakMap keyed on store identity; deleted once the
// database became the sole arbiter — see handler.ts's Invariant 5 comment).
// It is enforced structurally, one level up: store.finishTurn is now scoped
// to `WHERE status = 'running'` and reports whether the caller actually won
// that transition (store.test.ts covers the scoping directly); handler.ts's
// success tail and failure catch both skip the follow-up chain AND
// deliverChildResult when they lose that race. This test proves the
// end-to-end contract: a reap wins first (marks the turn `failed` and
// delivers, exactly like sweep.ts/handler.ts's own reap paths), and the
// SAME worker's own stalled `finishTurn("completed")` resurfacing afterward
// must neither resurrect the row nor deliver a second, contradictory result.
// It would fail against the pre-fix (unscoped finishTurn) code: the row
// would flip back to `completed` and the parent would gain a second wake
// turn from the real deliverChildResult call handler.ts's success tail used
// to make unconditionally.
// ---------------------------------------------------------------------------

Deno.test("fix round 1: a turn a reap already claimed is not resurrected by a late finishTurn, and the parent is not delivered to a second time", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const baseStore = createStore(db.query as never);
  const simulatedReapDeliveries: unknown[] = [];

  // Forces the exact race fix round 1 closes: the FIRST time this worker's
  // own success tail tries to finishTurn("completed"), a reap (the periodic
  // sweep or the lazy on-message reap, running concurrently in the real
  // system) wins FIRST — marking the SAME row `failed` and delivering to the
  // parent, exactly like sweep.ts's/handler.ts's own reap paths do — before
  // this call's own finishTurn runs.
  // Assigned once the child session exists (below) — the closure reads the
  // variable at call time, not at construction time, so this correctly
  // targets only the CHILD's own turn, never the parent's own first turn
  // (which also calls finishTurn("completed") earlier in this same test).
  let childId = "";
  let racedOnce = false;
  const raceyStore = {
    ...baseStore,
    finishTurn: async (turnId: string, status: "completed" | "failed", error?: string) => {
      const t = db.turns.find((t) => t.id === turnId);
      if (status === "completed" && !racedOnce && t && t.session_id === childId) {
        racedOnce = true;
        t.status = "failed";
        t.error = ABANDONED_CHILD_ERROR;
        // A recording `wake`, not a real one — proves the REAP's own
        // delivery landed exactly once, independent of whatever handler.ts's
        // real (possibly still-buggy) success tail does moments later.
        await deliverChildResult(
          { store: baseStore, wake: (sid, msg, childId) => simulatedReapDeliveries.push({ sid, msg, childId }) } as never,
          t.session_id,
          { error: ABANDONED_CHILD_ERROR },
        );
      }
      return baseStore.finishTurn(turnId, status, error);
    },
  };

  const handler = createHandler({
    agent, store: raceyStore as never, plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: model("too late"),
  });

  const parentRes = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "kick off a background task" }),
  }));
  const parentId = parentRes.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const turnsBeforeWake = db.turns.filter((t) => t.session_id === parentId).length;

  childId = await baseStore.createChildSession({
    plugin: "toy-agent", agent: "toy", parentSessionId: parentId, parentTurnId: null,
    subagent: null, nickname: "wisp", detached: true,
  });

  await handler(new Request(`${BASE}/eve/v1/session/${childId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "do the subtask" }),
  }));
  await until(() => settled(db));
  await until(() => simulatedReapDeliveries.length > 0);

  const childTurn = db.turns.find((t) => t.session_id === childId)!;
  assertEquals(
    childTurn.status,
    "failed",
    "the reap's failure must survive the stalled worker's late finishTurn(completed) — the row must not be resurrected",
  );
  assertEquals(simulatedReapDeliveries.length, 1, "sanity: the simulated reap's own delivery landed exactly once");
  assertEquals(
    db.turns.filter((t) => t.session_id === parentId).length,
    turnsBeforeWake,
    "the parent must gain NO real wake turn from the stale, losing finishTurn(completed) — only the reap's delivery (recorded above, not a real turn) may have happened",
  );
});
