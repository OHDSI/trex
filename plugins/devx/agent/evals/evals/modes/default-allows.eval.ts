import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Absent/unknown mode (agent.ts filterTools: readMode(ctx.metadata) returns
// undefined, which falls through to "allow") is the framework default. This
// is the one mode eval that does NOT need the sendWithMode/attachSession
// workaround the other three use: a plain `t.send()` never puts a
// `metadata` field on the request at all (SendTurnPayload has no such
// field — see modes/helpers.ts's header comment), so an absent field is
// exactly the condition under test here, not a limitation to work around.
//
// Asserts both an allowlisted-everywhere-but-build tool (Read) and a
// mutating tool ask/plan/build all restrict (Write) are called in the same
// turn — the Write half is what actually distinguishes "default" from
// ask-blocks-mutation.eval.ts and plan-restricted.eval.ts, not just from
// build-no-tools.eval.ts.
export default defineEval({
  description: "absent mode allows the full toolset, including tools ask/plan/build all restrict",
  async test(t) {
    await t.send(
      "Use the Read tool to read fixture/notes/greeting.txt and tell me the codeword it contains. Then use the Write tool to create fixture/tmp/default-mode.txt containing DEFAULT_MODE, and reply DONE when finished.",
    );
    t.succeeded();
    t.calledTool("Read");
    t.calledTool("Write");
    t.check(t.reply, includes("PLUM"));
  },
});
