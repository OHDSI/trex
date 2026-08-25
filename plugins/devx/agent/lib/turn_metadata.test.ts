// The attachment seam, end to end across the two halves that were never
// connected: src/hooks/turnMetadata.ts's buildTurnMetadata (what
// useAgentsChat.ts POSTs as the turn's `metadata`) feeding agent.ts's
// buildUserMessage (what materializes attachments into the workspace).
//
// WHAT THIS DOES NOT COVER: the React plumbing above buildTurnMetadata —
// ChatInput's onSend second argument, AgentsChatPanel's callback, and
// useAgentsChat's upload loop. devx has no vitest/RTL/jsdom setup (R9), so
// those three call sites are not reachable from any suite; this file pins
// the contract they hand off to, which is where the bug actually was (the
// two ends disagreed about whether `attachments` existed at all).
import { assert, assertEquals } from "jsr:@std/assert";
import { buildTurnMetadata } from "../../src/hooks/turnMetadata.ts";
import { buildUserMessage } from "../agent.ts";

const API_BASE = "https://trex.example/plugins/devx/devx-api";

function hookCtx(metadata: unknown) {
  return {
    sessionId: "s1",
    userId: "u1",
    metadata,
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
  } as any;
}

// buildUserMessage writes into the REAL workspace base dir; point it at a
// temp one for the duration so the suite leaves nothing behind.
async function withTempWorkspace<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await Deno.makeTempDir();
  const prev = Deno.env.get("DEVX_WORKSPACE_DIR");
  Deno.env.set("DEVX_WORKSPACE_DIR", dir);
  try {
    return await fn();
  } finally {
    if (prev === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prev);
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

Deno.test("buildTurnMetadata omits `attachments` entirely when nothing was picked", () => {
  assertEquals(
    buildTurnMetadata({ mode: "build", chatId: "c1", appId: "a1" }, [], API_BASE),
    { mode: "build", chatId: "c1", appId: "a1" },
  );
  assertEquals(
    buildTurnMetadata({ mode: "build", chatId: "c1", appId: "a1" }, undefined, API_BASE),
    { mode: "build", chatId: "c1", appId: "a1" },
  );
});

Deno.test("buildTurnMetadata renders uploaded rows as the {url, name} shape buildUserMessage filters for", () => {
  const md = buildTurnMetadata(
    { mode: "build", chatId: "c1", appId: "a1" },
    [{ id: "att-1", filename: "shot.png", content_type: "image/png" }],
    API_BASE,
  );
  assertEquals(md.attachments, [
    { url: `${API_BASE}/attachments/att-1`, name: "shot.png", contentType: "image/png" },
  ]);
});

// The regression guard: this exact metadata object, produced by the frontend
// helper, must drive buildUserMessage past its `!attachments?.length` early
// return and produce the attachment block.
Deno.test("metadata from buildTurnMetadata reaches buildUserMessage and produces the attachment block", async () => {
  await withTempWorkspace(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    try {
      const metadata = buildTurnMetadata(
        { mode: "build", chatId: "c1", appId: "a1" },
        [{ id: "att-1", filename: "shot.png", content_type: "image/png" }],
        "https://trex.example/plugins/devx/devx-api",
      );
      const out = await buildUserMessage("fix the header", hookCtx(metadata));
      assert(out.startsWith("fix the header"));
      assert(out.includes("<user_attachments>"), "the attachment block must be appended");
      assert(out.includes("shot.png"), "the materialized path must name the file");
      assert(!out.includes("\x01\x02\x03"), "only the path may enter the prompt, never file bytes");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// Mutation guard for the actual historical defect: a metadata object built
// WITHOUT the attachments field (what useAgentsChat sent before this wiring)
// silently produces no block at all.
Deno.test("metadata with no attachments field leaves the user message untouched", async () => {
  await withTempWorkspace(async () => {
    const metadata = { mode: "build", chatId: "c1", appId: "a1" };
    assertEquals(await buildUserMessage("fix the header", hookCtx(metadata)), "fix the header");
  });
});
