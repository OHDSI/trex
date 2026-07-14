import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { lastAssistantMessage, sendWithMode } from "./helpers";

// build mode (agent.ts filterTools, mode === "build") drops EVERY tool,
// including eve's own built-in skill/agent tools — the legacy AI-SDK loop
// this ports never used tools in build mode at all (registry.ts:208-209).
// `usedNoTools()` is a real EveEvalAssertions member (not a manual
// event-parse), so this is the strongest available check: the agent must
// have called literally nothing, even though the prompt explicitly asks it
// to use Read. The content check below is a second, independent signal that
// the block is real rather than the model just failing to notice its own
// tools: without Read access the agent cannot possibly have seen the real
// fixture file, so its reply must not leak the codeword seed.sh planted
// there ("PLUM").
export default defineEval({
  description: "build mode exposes no tools at all, even for a direct Read request",
  async test(t) {
    const session = await sendWithMode(
      t,
      "Use the Read tool to read fixture/notes/greeting.txt and tell me the codeword it contains. If you have no tools available, say so.",
      "build",
    );
    session.succeeded();
    session.usedNoTools();
    t.check(
      lastAssistantMessage(session.events),
      satisfies((v) => !String(v).includes("PLUM"), "reply does not leak the fixture codeword"),
    );
  },
});
