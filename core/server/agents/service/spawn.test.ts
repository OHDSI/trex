// Task 6: thread child-spawn capabilities onto ToolBuildCtx. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-6-brief.md.
import { assert, assertEquals } from "jsr:@std/assert";
import { createSpawnCapabilities, WAIT_DEFAULT_MS, WAIT_MAX_MS } from "./spawn.ts";
import { STOPPED_BY_PARENT_ERROR } from "./orchestration.ts";
import { clearChildTurnAbort, liveChildTurnAborts, registerChildTurnAbort } from "./aborts.ts";

// deno-lint-ignore no-explicit-any
function fakeDeps(over: Record<string, unknown> = {}) {
  const started: unknown[] = [];
  return {
    started,
    deps: {
      sessionId: "p-1",
      turnId: "t-1",
      plugin: "devx",
      agent: "devx",
      store: {
        countChildren: () => Promise.resolve({ live: 0, total: 0 }),
        listChildren: () => Promise.resolve([]),
        isUnattended: () => Promise.resolve(false),
        isChannelBound: () => Promise.resolve(false),
        createChildSession: () => Promise.resolve("c-1"),
        getHistory: () => Promise.resolve([]),
        ...(over.store as object ?? {}),
      },
      config: { freshTurns: 3 },
      // Fix round 1: defaults to a durable-session parent (matches every
      // existing test in this file, which spawns detached:true fixtures);
      // /chat's own ephemeral-parent case is covered separately below.
      allowDetached: true,
      startChildTurn: (o: unknown) => {
        started.push(o);
        return Promise.resolve();
      },
      ...over,
    },
  };
}

Deno.test("spawnChild creates a child session and starts its turn", async () => {
  const { deps, started } = fakeDeps();
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.spawnChild({
    subagent: "code-reviewer",
    prompt: "review it",
    forkTurns: "none",
    detached: true,
  });
  assertEquals(out.agentId, "c-1");
  assert(out.nickname.length > 0, "a nickname must be assigned");
  assertEquals(started.length, 1, "the child's first turn must be started");
});

Deno.test("spawnChild refuses once the live cap is reached", async () => {
  const { deps, started } = fakeDeps({
    store: { countChildren: () => Promise.resolve({ live: 8, total: 8 }) },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: true })
    .then(() => {
      throw new Error("should have refused");
    })
    .catch((e: Error) => assert(e.message.includes("8"), e.message));
  assertEquals(started.length, 0, "no turn may start when the spawn is refused");
});

// The parent's history is a full turns+steps read of a session that may have
// been running for hours. fork_turns "none" (the DEFAULT, and the
// overwhelming majority of delegations) discards it entirely, so it must
// never be fetched at all.
Deno.test("spawnChild does not read the parent's history when fork_turns is \"none\"", async () => {
  let historyReads = 0;
  const { deps, started } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 0, total: 0 }),
      listChildren: () => Promise.resolve([]),
      isUnattended: () => Promise.resolve(false),
      isChannelBound: () => Promise.resolve(false),
      createChildSession: () => Promise.resolve("c-1"),
      getHistory: () => {
        historyReads++;
        return Promise.resolve([]);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: true });
  assertEquals(historyReads, 0, "fork_turns \"none\" must not read the parent's history");
  assertEquals(started.length, 1);
  assertEquals((started[0] as { history?: unknown }).history, undefined);
});

// ...and an unparseable spec degrades to "none" through the same
// parseForkTurns classifier forkParentHistory uses, so it must not read
// either.
Deno.test("spawnChild does not read the parent's history for a fork_turns value that parses to \"none\"", async () => {
  let historyReads = 0;
  const { deps } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 0, total: 0 }),
      listChildren: () => Promise.resolve([]),
      isUnattended: () => Promise.resolve(false),
      isChannelBound: () => Promise.resolve(false),
      createChildSession: () => Promise.resolve("c-1"),
      getHistory: () => {
        historyReads++;
        return Promise.resolve([]);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "not-a-number", detached: true });
  assertEquals(historyReads, 0);
});

Deno.test("spawnChild DOES read the parent's history when fork_turns asks for turns", async () => {
  let historyReads = 0;
  const { deps, started } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 0, total: 0 }),
      listChildren: () => Promise.resolve([]),
      isUnattended: () => Promise.resolve(false),
      isChannelBound: () => Promise.resolve(false),
      createChildSession: () => Promise.resolve("c-1"),
      getHistory: () => {
        historyReads++;
        return Promise.resolve([
          {
            seq: 1,
            message: "earlier work",
            metadata: null,
            steps: [{ kind: "text", name: null, payload: { text: "ok" } }],
          },
        ]);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "all", detached: true });
  assertEquals(historyReads, 1, "fork_turns \"all\" must read the parent's history exactly once");
  const seeded = (started[0] as { history?: unknown[] }).history;
  assert(seeded && seeded.length > 0, "the forked slice must reach the child's first turn");
});

Deno.test("a nickname is not reused among live siblings", async () => {
  const { deps } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 1, total: 1 }),
      listChildren: () => Promise.resolve([{ nickname: "Euclid" }]),
      isUnattended: () => Promise.resolve(false),
      isChannelBound: () => Promise.resolve(false),
      createChildSession: () => Promise.resolve("c-2"),
      getHistory: () => Promise.resolve([]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: true });
  assert(out.nickname !== "Euclid", "must not reuse a live sibling's nickname");
});

// ---------------------------------------------------------------------------
// awaitChild / listChildren are NOT stubs — Task 7's blocking `agent` tool
// needs them working now (see toolset.ts's runAsChild).
// ---------------------------------------------------------------------------

Deno.test("awaitChild returns the child's final text once its turn completes", async () => {
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "Kepler", status: "completed" }),
      getHistory: () =>
        Promise.resolve([
          { seq: 1, message: "go", metadata: null, steps: [{ kind: "text", name: null, payload: { text: "done" } }] },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { text: "done" });
});

Deno.test("awaitChild returns the child's error once its turn fails", async () => {
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "Kepler", status: "failed" }),
      getHistory: () =>
        Promise.resolve([
          { seq: 1, message: "go", metadata: null, steps: [{ kind: "error", name: null, payload: { message: "boom" } }] },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { error: "boom" });
});

Deno.test("awaitChild polls until the child's turn leaves running", async () => {
  let calls = 0;
  const { deps } = fakeDeps({
    store: {
      getChild: () => {
        calls++;
        return Promise.resolve({ agentId: "c-1", nickname: "K", status: calls > 2 ? "completed" : "running" });
      },
      getHistory: () =>
        Promise.resolve([
          { seq: 1, message: "go", metadata: null, steps: [{ kind: "text", name: null, payload: { text: "ok" } }] },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { text: "ok" });
  assert(calls >= 3, `expected at least 3 polls, got ${calls}`);
});

Deno.test("awaitChild reports an unknown (foreign or nonexistent) agent id as an error, not a throw", async () => {
  const { deps } = fakeDeps({ store: { getChild: () => Promise.resolve(null) } });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.awaitChild("someone-elses-child");
  assert("error" in out && out.error.includes("someone-elses-child"));
});

Deno.test("listChildren delegates to the parent-scoped store method", async () => {
  const children = [{ agentId: "c-1", nickname: "K", status: "running" }];
  const { deps } = fakeDeps({
    store: { listChildren: (id: string) => Promise.resolve(id === "p-1" ? children : []) },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.listChildren(), children);
});

// ---------------------------------------------------------------------------
// Task 12 (2026-08-27-agent-orchestration): agent_send / sendToChild. A
// child has exactly ONE turn, so delivery is only meaningful while it is
// still `running` — see runner.ts's makePrepareStep, which is what actually
// drains what this queues. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-12-brief.md.
// ---------------------------------------------------------------------------

Deno.test("sendToChild queues a follow-up and reports delivered for a running child", async () => {
  const queued: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "running" }),
      queueFollowUp: (sessionId: string, text: string) => {
        queued.push({ sessionId, text });
        return Promise.resolve();
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.sendToChild("c-1", "wrap it up");
  assertEquals(out, { delivered: true });
  assertEquals(queued, [{ sessionId: "c-1", text: "wrap it up" }]);
});

Deno.test("sendToChild reports not-delivered for a finished child, without queueing anything", async () => {
  const queued: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "completed" }),
      queueFollowUp: () => {
        queued.push(true);
        return Promise.resolve();
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.sendToChild("c-1", "hi"), { delivered: false });
  assertEquals(queued.length, 0, "a finished child must not have anything queued for it");
});

Deno.test("sendToChild reports not-delivered for an unknown/foreign child id", async () => {
  const { deps } = fakeDeps({ store: { getChild: () => Promise.resolve(null) } });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.sendToChild("someone-elses-child", "hi"), { delivered: false });
});

// ---------------------------------------------------------------------------
// Fix round 1, Finding 1/2: /chat's parent session is ephemeral (created per
// request, never revisited) — a DETACHED child spawned from it would be
// silently orphaned, since nothing will ever poll/wake for its result.
// spawnChild refuses at the capability level so a future built-in that
// forgets to gate its own registration on `allowDetached` still fails
// loudly instead of quietly leaking an unreachable child.
// ---------------------------------------------------------------------------

Deno.test("spawnChild refuses a detached child when the parent session disallows it", async () => {
  const { deps, started } = fakeDeps({ allowDetached: false });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(caps.allowDetached, false);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: true })
    .then(() => {
      throw new Error("should have refused");
    })
    .catch((e: Error) => assert(e.message.toLowerCase().includes("detached"), e.message));
  assertEquals(started.length, 0, "no turn may start when the spawn is refused");
});

Deno.test("spawnChild still allows a NON-detached (blocking) child when the parent disallows detached", async () => {
  const { deps, started } = fakeDeps({ allowDetached: false });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: false });
  assertEquals(out.agentId, "c-1");
  assertEquals(started.length, 1);
});

Deno.test("SpawnCapabilities.allowDetached reflects the deps it was built from", async () => {
  const { deps: allowed } = fakeDeps({ allowDetached: true });
  const { deps: disallowed } = fakeDeps({ allowDetached: false });
  // deno-lint-ignore no-explicit-any
  assertEquals(createSpawnCapabilities(allowed as any).allowDetached, true);
  // deno-lint-ignore no-explicit-any
  assertEquals(createSpawnCapabilities(disallowed as any).allowDetached, false);
});

// ---------------------------------------------------------------------------
// Fix round 1, Finding 3: awaitChild must return STEP-SCOPED text (what the
// old in-process runSubagent got for free from ai's own `result.text`), not
// runner.ts's cross-step narrative `text` field — a child that narrates
// before calling a tool ("Let me check the config...") must not have that
// preamble leak into the answer agent_wait/agent callers see.
// ---------------------------------------------------------------------------

Deno.test("awaitChild returns lastStepText (step-scoped), not the cross-step text, when both are present", async () => {
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "completed" }),
      getHistory: () =>
        Promise.resolve([
          {
            seq: 1,
            message: "go",
            metadata: null,
            steps: [{
              kind: "text",
              name: null,
              payload: { text: "Let me check the config...found it", lastStepText: "found it" },
            }],
          },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { text: "found it" });
});

Deno.test("awaitChild falls back to `text` only when lastStepText is genuinely absent (pre-migration data)", async () => {
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "completed" }),
      getHistory: () =>
        Promise.resolve([
          { seq: 1, message: "go", metadata: null, steps: [{ kind: "text", name: null, payload: { text: "done" } }] },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { text: "done" });
});

Deno.test("awaitChild returns an intentionally-empty lastStepText as-is, not the stale earlier-step text", async () => {
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "completed" }),
      getHistory: () =>
        Promise.resolve([
          {
            seq: 1,
            message: "go",
            metadata: null,
            steps: [{ kind: "text", name: null, payload: { text: "stale preamble", lastStepText: "" } }],
          },
        ]),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.awaitChild("c-1"), { text: "" });
});

// ---------------------------------------------------------------------------
// Task 10 (2026-08-27-agent-orchestration): agent_wait / waitForChildren. A
// mailbox wait, NOT a join — it reports WHICH children reached a terminal
// state, never their content. See task-10-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_wait returns as soon as one child finishes", async () => {
  let calls = 0;
  const { deps } = fakeDeps({
    store: {
      listChildren: () => {
        calls++;
        return Promise.resolve([
          { agentId: "c-1", nickname: "Kepler", status: calls > 1 ? "completed" : "running" },
          { agentId: "c-2", nickname: "Faraday", status: "running" },
        ]);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.waitForChildren(null, 5_000);
  assertEquals(out.length, 1);
  assertEquals(out[0].nickname, "Kepler");
});

Deno.test("agent_wait times out without failing the turn", async () => {
  const { deps } = fakeDeps({
    store: { listChildren: () => Promise.resolve([{ agentId: "c-1", nickname: "K", status: "running" }]) },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.waitForChildren(null, 150), []);
});

Deno.test("agent_wait ignores an agent_id from another session (never fetch-then-filter)", async () => {
  const { deps } = fakeDeps({
    store: {
      listChildren: () => Promise.resolve([]),
      // Parent-scoped getChild returns null for a foreign child — the
      // ownership check IS the query, never a JS filter over a wider result.
      getChild: () => Promise.resolve(null),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.waitForChildren(["someone-elses-child"], 150), []);
});

Deno.test("agent_wait resolves explicit agent_ids through the parent-scoped store, not listChildren", async () => {
  const { deps } = fakeDeps({
    store: {
      listChildren: () => {
        throw new Error("must not list all children when specific agent_ids were given");
      },
      getChild: (id: string) =>
        Promise.resolve(id === "c-1" ? { agentId: "c-1", nickname: "Kepler", status: "completed" } : null),
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  const out = await caps.waitForChildren(["c-1"], 5_000);
  assertEquals(out.length, 1);
  assertEquals(out[0].agentId, "c-1");
});

// Not exercised end-to-end (WAIT_MAX_MS is 10 minutes — far too slow for a
// unit test to actually wait out); this pins the constants' values instead,
// since Math.min(timeoutMs, WAIT_MAX_MS) in the implementation is what
// bounds a wedged child from blocking a parent turn forever.
Deno.test("WAIT_DEFAULT_MS and WAIT_MAX_MS have the specified values", () => {
  assertEquals(WAIT_DEFAULT_MS, 60_000);
  assertEquals(WAIT_MAX_MS, 600_000);
});

// ---------------------------------------------------------------------------
// Task 11 (2026-08-27-agent-orchestration): agent_stop, and the ownership
// guard shared by every id-taking capability. See task-11-brief.md.
// ---------------------------------------------------------------------------

Deno.test("agent_stop marks a running child stopped, writing the exact STOPPED_BY_PARENT_ERROR constant", async () => {
  const updates: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "running" }),
      failTurnsForSession: (...a: unknown[]) => {
        updates.push(a);
        return Promise.resolve(1);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.stopChild("c-1"), "running");
  // Strict equality against the shared constant, not a substring match — the
  // status-deriving store queries key off this exact string.
  assertEquals(updates, [["c-1", STOPPED_BY_PARENT_ERROR]]);
});

// The half that makes agent_stop an interrupt rather than a bookkeeping
// entry. The ORDER is the substance: the database marking must land before the
// abort, or the child could finish, win finishTurn, and deliver a result for
// an agent its parent had just stopped.
Deno.test("agent_stop aborts a running child on this worker, and marks its turn BEFORE doing so", async () => {
  const order: string[] = [];
  const controller = registerChildTurnAbort("c-1");
  try {
    const { deps } = fakeDeps({
      store: {
        getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "running" }),
        failTurnsForSession: () => {
          order.push("marked");
          return Promise.resolve(1);
        },
      },
    });
    // deno-lint-ignore no-explicit-any
    const caps = createSpawnCapabilities(deps as any);
    controller.signal.addEventListener("abort", () => order.push("aborted"));
    await caps.stopChild("c-1");
    assertEquals(order, ["marked", "aborted"], "the turn must be marked failed before the abort fires");
    assert(controller.signal.aborted, "the child's streamText signal must be aborted");
    assertEquals(liveChildTurnAborts(), 0, "an aborted child must not stay in the registry");
  } finally {
    clearChildTurnAbort("c-1", controller);
  }
});

// A parent on another worker is the ordinary case, not an error case: the
// database marking is the whole of the stop there, exactly as it was before
// any abort existed.
Deno.test("agent_stop still marks the turn when the child is running on another worker", async () => {
  const updates: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "elsewhere", nickname: "K", status: "running" }),
      failTurnsForSession: (...a: unknown[]) => {
        updates.push(a);
        return Promise.resolve(1);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  assertEquals(await caps.stopChild("elsewhere"), "running");
  assertEquals(updates, [["elsewhere", STOPPED_BY_PARENT_ERROR]]);
});

Deno.test("agent_stop does not abort a child that has already finished", async () => {
  const controller = registerChildTurnAbort("c-done");
  try {
    const { deps } = fakeDeps({
      store: {
        getChild: () => Promise.resolve({ agentId: "c-done", nickname: "K", status: "completed" }),
        failTurnsForSession: () => Promise.reject(new Error("must not be reached")),
      },
    });
    // deno-lint-ignore no-explicit-any
    const caps = createSpawnCapabilities(deps as any);
    assertEquals(await caps.stopChild("c-done"), "completed");
    assert(!controller.signal.aborted, "a finished child's turn must not be aborted");
  } finally {
    clearChildTurnAbort("c-done", controller);
  }
});

Deno.test("agent_stop refuses a child belonging to another session (ownership is the query, not a JS filter)", async () => {
  const updates: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      // Parent-scoped: this simulates the real store.getChild returning null
      // for a foreign id, indistinguishable from a nonexistent one.
      getChild: () => Promise.resolve(null),
      failTurnsForSession: (...a: unknown[]) => {
        updates.push(a);
        return Promise.resolve(1);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.stopChild("foreign").then(
    () => {
      throw new Error("should have refused");
    },
    (e: Error) => assert(e.message.toLowerCase().includes("unknown")),
  );
  assertEquals(updates.length, 0, "a foreign child must never be touched");
});

Deno.test("agent_stop returns the previous status without mutating an already-finished child", async () => {
  const updates: unknown[] = [];
  const { deps } = fakeDeps({
    store: {
      getChild: () => Promise.resolve({ agentId: "c-1", nickname: "K", status: "completed" }),
      failTurnsForSession: (...a: unknown[]) => {
        updates.push(a);
        return Promise.resolve(0);
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  // The model learns the child already finished from the return value, not
  // from a silent no-op.
  assertEquals(await caps.stopChild("c-1"), "completed");
  assertEquals(updates.length, 0, "an already-finished child must not be mutated");
});

// A channel session never writes the unattended column — its unattended-ness
// comes from the binding. Reading only the column left the child gating on a
// stream no channel adapter subscribes to, parking until the deadline.
Deno.test("a child of a channel-bound parent inherits unattended", async () => {
  let unattended: unknown = undefined;
  const { deps } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 0, total: 0 }),
      listChildren: () => Promise.resolve([]),
      getHistory: () => Promise.resolve([]),
      isUnattended: () => Promise.resolve(false),
      isChannelBound: () => Promise.resolve(true),
      createChildSession: (o: { unattended?: boolean }) => {
        unattended = o.unattended;
        return Promise.resolve("c-1");
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  await caps.spawnChild({ subagent: null, prompt: "x", forkTurns: "none", detached: true });
  assertEquals(unattended, true);
});
