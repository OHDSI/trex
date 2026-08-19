// postChoice — present design options as a Discord dropdown (string select) so
// the team picks one with a click. When someone selects, the Discord adapter's
// `eve_choice` branch resumes claw's parked session with the chosen value as a
// message (see channels/adapters/discord.ts). Use at Gate 1 when there are
// multiple real options; for a plain go/no-go, use awaitApproval instead.
//
// Task 6 (claw-devx-reliability): unlike awaitApproval, the pick is NOT
// observable here. This tool's execute() only fires once, to POST the
// dropdown — the resume on selection is driven entirely by
// core/server/agents/channels/adapters/discord.ts's handleComponent
// (CHOICE_CUSTOM_ID branch), which resumes the session via `args.send("The
// team selected: <value>", ...)` outside plugins/claw and outside any
// authored tool's execute. There is no callback into this file when a pick
// happens, so postChoice itself cannot append to the decision ledger.
// Deliberately not hooked from that adapter either — claw.orchestrations is
// claw-owned and the adapter is shared channel infrastructure, so the
// layering must not invert. Fix round 1: claw records the pick itself, one
// step later, by calling recordDecision.ts once the resumed "The team
// selected: ..." message reaches it (see facilitate-coding-task.md).
import { defineTool } from "eve/tools";
import { postChannelMessage } from "../lib/discord-rest.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

// Must match CHOICE_CUSTOM_ID in the Discord adapter's handleComponent branch.
const CHOICE_CUSTOM_ID = "eve_choice";
const BLURPLE = 0x5865F2;

interface OptionIn { label: string; value: string; description?: string }
interface Input { channelId: string; title: string; intro?: string; options: OptionIn[]; multi?: boolean }

export default defineTool({
  // Task 5 (claw-devx-reliability), fix round 1 — see postUpdate.ts.
  postsToChannel: true,
  description:
    "Present design options to the channel as a dropdown (select menu) the team picks from with " +
    "one click — use at Gate 1 when the coder offered multiple real options. `title`/`intro` " +
    "render as an embed above the menu. Each option has a `label` (shown in the dropdown) and a " +
    "short `value` (what claw is told was picked, so keep it meaningful e.g. 'Option B: server-side " +
    "filtering'). On selection, claw's session resumes with that value — continue to Gate 2 with it. " +
    "For a plain approve/reject, use awaitApproval instead. " +
    "The server overrides channelId with the session's thread channel when available.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (the server overrides this with the session thread channel)." },
      title: { type: "string", description: "Heading for the options embed, e.g. 'Design options'." },
      intro: { type: "string", description: "Optional short markdown shown above the dropdown (e.g. a one-line summary of each option)." },
      multi: { type: "boolean", description: "Allow selecting MORE THAN ONE option (e.g. run several checks). Default false (single pick). The resume message joins the picks with commas." },
      options: {
        type: "array",
        description: "2-25 options.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Dropdown text (≤100 chars)." },
            value: { type: "string", description: "What claw is told was picked (≤100 chars) — make it self-explanatory." },
            description: { type: "string", description: "Optional sub-text under the label (≤100 chars)." },
          },
          required: ["label", "value"],
        },
      },
    },
    required: ["channelId", "title", "options"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postChoice();
    const { title, intro, options, multi } = input as Input;
    const channelId = (ctx?.metadata as any)?.channelId ?? (input as Input).channelId;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("postChoice: DISCORD_BOT_TOKEN not set");
    if (!options?.length) throw new Error("postChoice: at least one option is required");

    const menuOptions = options.slice(0, 25).map((o) => ({
      label: o.label.slice(0, 100),
      value: o.value.slice(0, 100),
      ...(o.description ? { description: o.description.slice(0, 100) } : {}),
    }));
    const embed = {
      title: title.slice(0, 256),
      description: (intro ?? "Pick an option from the menu below.").slice(0, 4096),
      color: BLURPLE,
    };
    const components = [{
      type: 1, // action row
      components: [{
        type: 3, // string select
        custom_id: CHOICE_CUSTOM_ID,
        placeholder: multi ? "Select one or more…" : "Select an option…",
        min_values: 1,
        max_values: multi ? menuOptions.length : 1,
        options: menuOptions,
      }],
    }];

    await postChannelMessage(fetch, { botToken: token, channelId, embeds: [embed], components });
    return { posted: menuOptions.length };
  },
});
