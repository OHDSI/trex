// Characterization tests for the client-side loop router that Phase 4 Task 2
// deleted (src/hooks/effectiveLoop.ts, src/hooks/useEffectiveLoop.ts). Task 1
// proved a delegated agent's turn never reaches resolveModel on the session
// route devx actually uses, and Task 1b closed the one remaining hole in
// eve's /chat route — so the reason effectiveLoop.ts gave for forcing the
// claude-code provider onto the legacy loop no longer applies to devx, and
// there is no other provider-specific case left to route around.
//
// devx has no vitest/RTL/jsdom, so ChatPanel.tsx (React/JSX, "@/..." aliases)
// cannot be imported into this Deno suite — the same constraint that put the
// original tests in this file rather than next to the component. Reading its
// source text is the established substitute in this codebase (see
// functions/provider_support.test.ts's agent-provider-allowlist test and
// functions/git_identity.test.ts).
//
// Must pass unmodified against CURRENT ChatPanel.tsx: if any case here
// fails, either the router survived (Task 2 is incomplete) or ChatPanel
// stopped rendering AgentsChatPanel for a claude-code account, which is
// exactly the regression this file exists to catch.
import { assert, assertEquals, assertMatch, assertStrictEquals } from "jsr:@std/assert";

const CHAT_PANEL_URL = new URL("../../src/components/ChatPanel.tsx", import.meta.url);

async function readChatPanelSource(): Promise<string> {
  return await Deno.readTextFile(CHAT_PANEL_URL);
}

Deno.test("ChatPanel: the two-loop router is gone — no reference to useEffectiveLoop or effectiveLoop", async () => {
  const src = await readChatPanelSource();
  assertEquals(src.includes("useEffectiveLoop"), false, "useEffectiveLoop.ts was deleted; nothing should still import it");
  assertEquals(src.includes("effectiveLoop"), false, "effectiveLoop.ts was deleted; nothing should still import it");
});

// A claude-code account is the one case the old router forced onto the
// legacy loop. With the router gone, ChatPanel must render AgentsChatPanel
// unconditionally, so there is no branch left for provider to affect at all.
Deno.test("ChatPanel: renders AgentsChatPanel unconditionally — a claude-code account reaches it like any other", async () => {
  const src = await readChatPanelSource();
  assertEquals(src.includes("claude-code"), false, "no provider-specific branch should remain in ChatPanel");
  assertEquals(src.includes("LegacyChatPanel"), false, "the legacy branch was removed, not just made unreachable");

  // The exported ChatPanel function's body is a single AgentsChatPanel
  // return with no conditional in between — proves "unconditional", not
  // just "AgentsChatPanel is mentioned somewhere in the file".
  const fn = src.match(/export function ChatPanel\(props: ChatPanelProps\) \{([\s\S]*?)\n\}/);
  assert(fn, "could not find the exported ChatPanel function");
  const body = fn[1];
  assertEquals(/\bif\s*\(/.test(body), false, "ChatPanel's body must contain no branching — every provider takes the same path");
  assertMatch(body.trim(), /^return <AgentsChatPanel\b/, "ChatPanel must return AgentsChatPanel directly");
});

// Phase 3 built loading/error states into useEffectiveLoop specifically so a
// failed settings fetch could not silently degrade to a loop choice. That
// machinery is legitimate to delete only if nothing else needs settings
// before render. AgentsChatPanel (src/components/AgentsChatPanel.tsx) takes
// chatId/mode/appId as props and its data hook, useAgentsChat
// (src/hooks/useAgentsChat.ts), never calls api.getSettings or
// api.getActiveProviderConfig — grep confirms zero hits. Settings were fetched
// for exactly one purpose: choosing a loop. With that choice gone, so is the
// state machine — this test pins that ChatPanel no longer gates on a
// loading/error status before rendering.
Deno.test("ChatPanel: no settings-fetch loading/error gate remains — nothing downstream needs settings before render", async () => {
  const src = await readChatPanelSource();
  for (const token of ["loading", "SETTINGS_FETCH_FAILED", "Couldn't load chat settings", "loopState"]) {
    assertEquals(src.includes(token), false, `ChatPanel should no longer reference "${token}"`);
  }
});

// The old files themselves must be gone, not just unreferenced — an orphaned
// hook whose only remaining job is to return a constant is exactly what this
// task was told not to leave behind.
Deno.test("effectiveLoop.ts and useEffectiveLoop.ts no longer exist", async () => {
  for (const name of ["effectiveLoop.ts", "useEffectiveLoop.ts"]) {
    const url = new URL(`../../src/hooks/${name}`, import.meta.url);
    let stat: Deno.FileInfo | undefined;
    try {
      stat = await Deno.stat(url);
    } catch (err) {
      assert(err instanceof Deno.errors.NotFound, `unexpected error checking ${name}: ${err}`);
    }
    assertStrictEquals(stat, undefined, `${name} should have been deleted, not left behind`);
  }
});
