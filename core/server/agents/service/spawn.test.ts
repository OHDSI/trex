// Task 6: thread child-spawn capabilities onto ToolBuildCtx. See
// .superpowers/sdd/2026-08-27-agent-orchestration/task-6-brief.md.
import { assert, assertEquals } from "jsr:@std/assert";
import { createSpawnCapabilities } from "./spawn.ts";

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
        createChildSession: () => Promise.resolve("c-1"),
        getHistory: () => Promise.resolve([]),
        ...(over.store as object ?? {}),
      },
      config: { freshTurns: 3 },
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

Deno.test("a nickname is not reused among live siblings", async () => {
  const { deps } = fakeDeps({
    store: {
      countChildren: () => Promise.resolve({ live: 1, total: 1 }),
      listChildren: () => Promise.resolve([{ nickname: "Euclid" }]),
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
// Stubs for capabilities filled in by later tasks — must fail loudly, never
// silently no-op, so a mis-wired caller (e.g. a tool reaching for
// waitForChildren before Task 10 lands) cannot mistake a throw-away no-op
// for a real result.
// ---------------------------------------------------------------------------

Deno.test("waitForChildren, stopChild and sendToChild throw a clear not-implemented error", async () => {
  const { deps } = fakeDeps();
  // deno-lint-ignore no-explicit-any
  const caps = createSpawnCapabilities(deps as any);
  for (
    const call of [
      () => caps.waitForChildren(null, 1000),
      () => caps.stopChild("c-1"),
      () => caps.sendToChild("c-1", "hi"),
    ]
  ) {
    await call().then(
      () => {
        throw new Error("expected a throw");
      },
      (e: Error) => assert(e.message.toLowerCase().includes("not implemented"), e.message),
    );
  }
});
