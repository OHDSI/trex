// postQuestion — ask the channel an OPEN (free-text) question with a native
// Discord answer flow: the question posts with an "Answer" button, the click
// opens a modal with a text field, and the submitted text resumes claw's parked
// session as a message (the same args.send path a /trex command uses — see the
// eve_question branches in channels/adapters/discord.ts). Use it for clarifying
// questions with no fixed option set; for discrete options use postChoice, and
// for a go/no-go use awaitApproval. HITL approvals are verb-restricted
// (approve/deny), so free-text answers cannot ride needsApproval — this tool
// mirrors postChoice's direct-REST + resume-by-message pattern instead.
import { defineTool } from "eve/tools";
import { postChannelMessage } from "../lib/discord-rest.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

// Must match QUESTION_CUSTOM_ID in the Discord adapter's handleComponent branch.
const QUESTION_CUSTOM_ID = "eve_question";

interface Input { channelId: string; question: string }

export default defineTool({
  // Task 5 (claw-devx-reliability), fix round 1 — see postUpdate.ts.
  postsToChannel: true,
  description:
    "Ask the channel an open (free-text) clarifying question with a native answer UI: the " +
    "question posts with an 'Answer' button that opens a text modal, and the submitted answer " +
    "resumes your session as a message. Use this for open-ended questions (wording, scope, " +
    "acceptance criteria) instead of asking in plain text — plain-text questions have no " +
    "affordance and often go unanswered. For a pick between discrete options use postChoice; " +
    "for approve/reject use awaitApproval. Ask ONE question per call, then end your turn — the " +
    "session parks until someone answers (via the modal or a plain thread message). " +
    "The server overrides channelId with the session's thread channel when available.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (the server overrides this with the session thread channel)." },
      question: { type: "string", description: "The question, phrased so a one-line answer resolves it. Also shown as the modal title (truncated)." },
    },
    required: ["channelId", "question"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postQuestion();
    const { question } = input as Input;
    const channelId = (ctx?.metadata as any)?.channelId ?? (input as Input).channelId;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("postQuestion: DISCORD_BOT_TOKEN not set");
    if (!question?.trim()) throw new Error("postQuestion: question is required");

    // Plain content (not an embed): the adapter's modal branch titles the modal
    // from the message content (readMessageContent), like the freeform HITL flow.
    const components = [{
      type: 1, // action row
      components: [{
        type: 2, // button
        style: 1, // primary
        label: "Answer",
        custom_id: QUESTION_CUSTOM_ID,
      }],
    }];

    await postChannelMessage(fetch, {
      botToken: token,
      channelId,
      content: question.slice(0, 2000),
      components,
    });
    return { posted: true };
  },
});
