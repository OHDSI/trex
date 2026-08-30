import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { resolveCore } from "./resolveCoderApproval.ts";
import type { AttachedStream, PendingApproval, TokioClient, TurnResult } from "../lib/code-session.ts";

function fakeSql(row?: Record<string, unknown>) {
  const store = new Map<string, Record<string, unknown>>();
  if (row) store.set(String(row.session_id), row);
  const fn = (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("SELECT")) {
      const r = store.get(String(params[0]));
      return Promise.resolve({ rows: r ? [r] : [] });
    }
    store.set(String(params[0]), {
      session_id: params[0],
      code_session_id: params[1],
      event_cursor: params[2],
      app_id: params[3] ?? null,
    });
    return Promise.resolve({ rows: [] });
  };
  return { fn, store };
}

const NO_CLIENT: TokioClient = {
  req: () => Promise.reject(new Error("the transport must be reached through the injected deps")),
};

function turn(over: Partial<TurnResult>): TurnResult {
  return {
    codeSessionId: "code-1",
    replyText: "",
    nextCursor: 0,
    reason: "completed",
    pending: [],
    ...over,
  };
}

function deps(over: {
  resolved?: { resolved: boolean; error?: string };
  result?: TurnResult;
} = {}) {
  const resolves: Array<{ codeSessionId: string; requestId: string; decision: string }> = [];
  const attaches: Array<{ codeSessionId: string; startCursor: number }> = [];
  const gates: PendingApproval[][] = [];
  // Order matters more than content here: "attach" must precede "resolve".
  const timeline: string[] = [];
  const cancels = { count: 0 };
  return {
    resolves,
    attaches,
    gates,
    timeline,
    cancels,
    d: {
      resolve: (_c: TokioClient, a: { codeSessionId: string; requestId: string; decision: "approve" | "deny" }) => {
        timeline.push("resolve");
        resolves.push(a);
        return Promise.resolve(over.resolved ?? { resolved: true });
      },
      attach: (_c: TokioClient, a: { codeSessionId: string; startCursor: number }): Promise<AttachedStream> => {
        timeline.push("attach");
        attaches.push(a);
        return Promise.resolve({
          collect: () => {
            timeline.push("collect");
            return Promise.resolve(over.result ?? turn({ replyText: "did it", nextCursor: a.startCursor + 3 }));
          },
          cancel: () => {
            cancels.count++;
            return Promise.resolve();
          },
        });
      },
      postGates: (_f: typeof fetch, o: { pending: PendingApproval[] }) => {
        gates.push(o.pending);
        return Promise.resolve(o.pending.length > 0);
      },
    },
  };
}

const ROW = { session_id: "s1", code_session_id: "code-1", event_cursor: 7, app_id: "app-1" };

Deno.test("resolveCore relays the decision, RE-ATTACHES at the stored cursor, and returns the rest of the turn", async () => {
  const sql = fakeSql(ROW);
  const t = deps();
  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1", channelId: "chan-1" },
    { requestId: "req-1", decision: "approve" },
    t.d,
  );

  assertEquals(t.resolves, [{ codeSessionId: "code-1", requestId: "req-1", decision: "approve", userId: "u1" }]);
  // Re-attach, not a new message: the parked turn continues where it stopped.
  assertEquals(t.attaches, [{ codeSessionId: "code-1", startCursor: 7, userId: "u1" }]);
  // Subscribed BEFORE the decision could publish anything — see the next test.
  assertEquals(t.timeline, ["attach", "resolve", "collect"]);
  assertEquals(out, { resolved: true, parked: false, reply: "did it", trailer: null });
  // The advanced cursor is persisted, so a later re-attach never replays it.
  const row = sql.store.get("s1");
  assertEquals(Number(row?.event_cursor), 10);
  assert(Number(row?.event_cursor) > 7);
  assertEquals(row?.app_id, "app-1");
});

Deno.test("resolveCore relays a deny the same way — the coder must be told, or it sits parked until the gate times out", async () => {
  const sql = fakeSql(ROW);
  const t = deps();
  await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1" },
    { requestId: "req-1", decision: "deny" },
    t.d,
  );
  assertEquals(t.resolves[0].decision, "deny");
  assertEquals(t.attaches.length, 1);
});

Deno.test("resolveCore reports a refused approval and does NOT re-attach", async () => {
  const sql = fakeSql(ROW);
  const t = deps({ resolved: { resolved: false, error: "404: unknown or already-decided request" } });
  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1" },
    { requestId: "req-1", decision: "approve" },
    t.d,
  );
  assertEquals(out.resolved, false);
  assertStringIncludes(String(out.error), "already-decided");
  // A second pick on a gate that already landed is not a failure to report as one.
  assertStringIncludes(String(out.error), "already recorded");
  // The stream was opened first, so it must be released rather than left open.
  assertEquals(t.attaches.length, 1);
  assertEquals(t.timeline, ["attach", "resolve"]);
  assertEquals(t.cancels.count, 1);
});

Deno.test("resolveCore reports a thread with no coder session instead of calling the transport", async () => {
  const sql = fakeSql();
  const t = deps();
  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1" },
    { requestId: "req-1", decision: "approve" },
    t.d,
  );
  assertEquals(out.resolved, false);
  assertEquals(t.resolves.length, 0);
  assertEquals(t.attaches.length, 0);
});

Deno.test("a re-attach that parks on a NEW gate posts it and returns — one round-trip, no spinning", async () => {
  const sql = fakeSql(ROW);
  const next: PendingApproval = { requestId: "req-2", toolName: "writeFile", input: { path: "a" } };
  const t = deps({ result: turn({ reason: "input-requested", nextCursor: 11, pending: [next] }) });
  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1", channelId: "chan-1" },
    { requestId: "req-1", decision: "approve" },
    t.d,
  );
  assertEquals(out.resolved, true);
  assertEquals(out.parked, true);
  assertEquals(t.attaches.length, 1);
  assertEquals(t.gates, [[next]]);
  assertStringIncludes(String(out.reply), "req-2");
  assertEquals(Number(sql.store.get("s1")?.event_cursor), 11);
});

// A pending set that still names the request just resolved means the decision
// did not take effect; re-posting it would loop the same gate forever.
Deno.test("a re-attach still parked on the SAME request does not re-post that gate", async () => {
  const sql = fakeSql(ROW);
  const same: PendingApproval = { requestId: "req-1", toolName: "runCommand", input: {} };
  const t = deps({ result: turn({ reason: "input-requested", nextCursor: 9, pending: [same] }) });
  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1", channelId: "chan-1" },
    { requestId: "req-1", decision: "approve" },
    t.d,
  );
  assertEquals(out.parked, true);
  assertEquals(t.gates, [[]]);
  assertStringIncludes(String(out.reply), "req-1");
});

// Fix round 1's regression test. The real race is a timing one — the coder's
// poll wakes ~500ms after the decision lands (toolset.ts:213) and publishes
// what follows — and a fake client cannot make wall-clock time race. What it
// CAN pin is the invariant that makes the race harmless: the subscription must
// exist before the decision is sent. This transport enforces exactly that
// consequence — events published with no subscriber are gone, and the stream
// that missed them would block until the 90-minute turn timeout, which is what
// the rejection below stands in for. Reordering resolveCore back to
// POST-then-GET turns this test red.
Deno.test("a decision whose events publish immediately is still collected — the stream is subscribed before the decision is sent", async () => {
  const sql = fakeSql(ROW);
  const nextGate: PendingApproval = { requestId: "req-2", toolName: "writeFile", input: { path: "a" } };
  const timeline: string[] = [];
  let subscribed = false;
  let missed = false;

  const attach = (_c: TokioClient, a: { codeSessionId: string; startCursor: number }): Promise<AttachedStream> => {
    timeline.push("attach");
    subscribed = true;
    return Promise.resolve({
      collect: () =>
        missed
          // The coder's follow-up gate is live-only (events.ts:80-88): nothing
          // replays it, so a stream opened after it was published waits forever.
          ? Promise.reject(new Error("attached too late — the decision's events were already published and are unreplayable"))
          : Promise.resolve({
            codeSessionId: "code-1",
            replyText: "",
            nextCursor: a.startCursor + 2,
            reason: "input-requested" as const,
            pending: [nextGate],
          }),
      cancel: () => Promise.resolve(),
    });
  };
  const resolve = () => {
    timeline.push("resolve");
    // The publish happens here, in the same tick the decision lands.
    if (!subscribed) missed = true;
    return Promise.resolve({ resolved: true });
  };

  const out = await resolveCore(
    sql.fn,
    NO_CLIENT,
    { sessionId: "s1", userId: "u1", channelId: "chan-1" },
    { requestId: "req-1", decision: "deny" },
    { resolve, attach, postGates: () => Promise.resolve(true) },
  );

  assertEquals(timeline, ["attach", "resolve"]);
  assertEquals(missed, false);
  assertEquals(out.resolved, true);
  assertEquals(out.parked, true);
  assertStringIncludes(String(out.reply), "req-2");
  assert(Number(sql.store.get("s1")?.event_cursor) > 7);
});
