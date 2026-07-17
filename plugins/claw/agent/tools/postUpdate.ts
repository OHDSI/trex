// postUpdate — post a short status line to the channel right away. claw's normal
// reply text is only delivered when the turn ends (after a blocking askCodeAgent
// call), so the channel would otherwise sit silent while a long step runs. Use
// this to narrate the action BEFORE kicking it off (brainstorm/plan/implement/
// checks), e.g. "On it, starting the implementation now."
import { defineTool } from "eve/tools";
import { postChannelMessage } from "../lib/discord-rest.ts";
import { markdownTablesToCodeBlocks } from "../lib/discord-format.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input { channelId: string; text: string }

export default defineTool({
  description:
    "Post a short status line to the channel immediately, so the team sees what you are doing " +
    "while a long step runs. Your normal reply only lands when the turn ends (after a blocking " +
    "coder call), so call this FIRST to narrate the action you are about to take — e.g. " +
    "'On it, starting the implementation now.' or 'Exploring a couple of options.' Keep it to one " +
    "short line. Not for plans/options (use postPlan) or decisions (use postChoice / awaitApproval).",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id." },
      text: { type: "string", description: "One short status line, e.g. 'Starting the implementation now.'" },
    },
    required: ["channelId", "text"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postUpdate();
    const { channelId, text } = input as Input;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("postUpdate: DISCORD_BOT_TOKEN not set");
    if (!text?.trim()) throw new Error("postUpdate: text is required");
    await postChannelMessage(fetch, {
      botToken: token,
      channelId,
      content: markdownTablesToCodeBlocks(text).slice(0, 2000),
    });
    return { posted: true };
  },
});
