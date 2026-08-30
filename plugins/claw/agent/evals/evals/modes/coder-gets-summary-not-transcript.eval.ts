import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { driveClaw } from "../helpers.ts";

// askCodeAgent's contract (tools/askCodeAgent.ts's description + `message`
// input description, instructions.md's "Talking to the coder"): the coder
// receives claw's OWN summary of the ask, never a transcript and never a hint
// that a team is behind it. Seeds a multi-participant disagreement that
// resolves, drives claw to delegate, and asserts on the RECORDED askCodeAgent
// argument — not on claw's channel-facing prose, a different voice entirely —
// that it names no participant, uses none of the team/channel/thread/Discord/
// first-person-plural vocabulary, and is not a verbatim copy of any seeded
// message. Asserting on the tool argument (rather than a reply) is the point:
// it is the actual text the coder would see, so this fails for the right
// reason if the summarize-and-own-it contract regresses.
const DISCUSSION = [
  { author: "priya", content: "/trex the reports page is slow, we need caching" },
  { author: "devon", content: "I'd rather add a db index than cache anything, caching is a bandaid" },
  { author: "morgan", content: "an index won't help, the query is CPU-bound. cache it with a short TTL" },
  { author: "devon", content: "fine, cache it, 5 minute TTL, let's move on" },
  { author: "priya", content: "agreed: 5 minute TTL cache on /api/reports" },
];

const PARTICIPANTS = ["priya", "devon", "morgan"];
// Word-boundary match: naive substring matching false-positives on e.g. "hour"
// containing "our", or "however" containing "we".
const LEAK_PATTERN = /\b(team|channel|thread|discord|we|us|our|ours|ourselves)\b/i;

function askCodeAgentInput(events: readonly unknown[]): { message?: unknown } | undefined {
  for (const e of events) {
    const ev = e as { type?: string; data?: { actions?: Array<{ toolName?: string; input?: unknown }> } };
    if (ev?.type !== "actions.requested") continue;
    const hit = ev.data?.actions?.find((a) => a.toolName === "askCodeAgent");
    if (hit) return hit.input as { message?: unknown };
  }
  return undefined;
}

export default defineEval({
  description: "the coder gets claw's own summary of a resolved disagreement, never the transcript or a hint of the team behind it",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.", {
      evalDiscussion: DISCUSSION,
    });
    session.calledTool("askCodeAgent");
    const input = askCodeAgentInput(session.events);
    const message = String(input?.message ?? "");

    t.check(message, satisfies((v) => String(v).length > 0, "askCodeAgent received a non-empty message"));
    t.check(
      message,
      satisfies(
        (v) => !PARTICIPANTS.some((name) => String(v).toLowerCase().includes(name)),
        "message names no participant",
      ),
    );
    t.check(
      message,
      satisfies((v) => !LEAK_PATTERN.test(String(v)), "message carries no team/channel/thread/Discord/first-person-plural language"),
    );
    t.check(
      message,
      satisfies(
        (v) => !DISCUSSION.some((m) => String(v).toLowerCase().includes(m.content.toLowerCase())),
        "message is not a verbatim copy of any seeded channel message",
      ),
    );
  },
});
