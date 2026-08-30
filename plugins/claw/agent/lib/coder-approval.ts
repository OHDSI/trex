// Rendering the CODER's approval gates in the task thread.
//
// The coder runs in devx's own eve session, which is not channel-bound (devx
// registers no channel adapter), so the runtime cannot render its gates
// anywhere — claw reads the coder's event stream, so claw renders them. It
// reuses the SAME round-trip postChoice.ts already uses: an `eve_choice` select
// whose pick the Discord adapter turns into a "The team selected: <value>"
// resume of claw's own session (adapters/discord.ts's handleComponent). The
// runtime's own Approve/Deny buttons (awaitApproval.ts) are not usable here:
// their callback resolves an approval on CLAW's session, and this request
// belongs to the coder's.
//
// Both outcomes come back the same way, which is why this is a select rather
// than an approve-only gate: a deny must reach the coder too, or its turn sits
// parked until the 30-minute approval timeout.
import { postChannelMessage } from "./discord-rest.ts";
import type { PendingApproval } from "./code-session.ts";

// Must match CHOICE_CUSTOM_ID in the Discord adapter's handleComponent branch.
const CHOICE_CUSTOM_ID = "eve_choice";
const AMBER = 0xE67E22;
// Discord caps a select option's value at 100 chars; a requestId is a uuid.
const VALUE_MAX = 100;
const INPUT_PREVIEW_MAX = 1200;

export type ApprovalDecision = "approve" | "deny";

// What claw is told was picked. It has to be self-describing: the adapter
// resumes claw with this literal string, and claw reads the requestId back out
// of it to call resolveCoderApproval.
export function approvalChoiceValue(decision: ApprovalDecision, requestId: string): string {
  const value = `${decision} ${requestId}`;
  // Never truncate: a clipped id posts a gate whose every decision 404s as
  // "unknown or already-decided" with nothing to explain why. Fail here, where
  // the cause is still visible, and let the caller fall back to asking in text.
  if (value.length > VALUE_MAX) {
    throw new Error(`approval requestId too long for a Discord select value (${value.length} > ${VALUE_MAX})`);
  }
  return value;
}

/** One-line human summary of the tool call being gated. */
export function describeToolCall(pending: PendingApproval): string {
  const input = pending.input === undefined ? "" : JSON.stringify(pending.input);
  return input ? `${pending.toolName} ${input}` : pending.toolName;
}

// Posts one card per pending request: what the coder wants to run, and an
// Approve/Deny select carrying that request's id.
export async function postApprovalRequest(
  fetchFn: typeof fetch,
  opts: { botToken: string; channelId: string; pending: PendingApproval },
): Promise<{ id: string }> {
  const { pending } = opts;
  const raw = pending.input === undefined ? "" : JSON.stringify(pending.input, null, 2);
  const preview = raw.length > INPUT_PREVIEW_MAX ? `${raw.slice(0, INPUT_PREVIEW_MAX)}\n…` : raw;
  const embed = {
    title: `Coder needs approval: ${pending.toolName}`.slice(0, 256),
    description: (preview ? `\`\`\`json\n${preview}\n\`\`\`` : "No arguments.") +
      "\n\nThe coding agent is paused until someone decides.",
    color: AMBER,
  };
  const components = [{
    type: 1, // action row
    components: [{
      type: 3, // string select
      custom_id: CHOICE_CUSTOM_ID,
      placeholder: "Approve or deny…",
      min_values: 1,
      max_values: 1,
      options: [
        {
          label: `Approve ${pending.toolName}`.slice(0, 100),
          value: approvalChoiceValue("approve", pending.requestId),
          description: "Let the coder run it",
        },
        {
          label: `Deny ${pending.toolName}`.slice(0, 100),
          value: approvalChoiceValue("deny", pending.requestId),
          description: "Refuse; the coder is told and continues",
        },
      ],
    }],
  }];
  return await postChannelMessage(fetchFn, {
    botToken: opts.botToken,
    channelId: opts.channelId,
    embeds: [embed],
    components,
  });
}

// What claw is handed back while the coder is parked. Names the requestId
// explicitly so the relay works even if the pick's resume message is lost.
export function parkedReply(pending: PendingApproval[], posted: boolean): string {
  const lines = pending.map((p) => `- \`${p.requestId}\` — ${describeToolCall(p)}`);
  return [
    "The coder is PAUSED waiting for a human decision on:",
    ...lines,
    posted
      ? "Approve/Deny buttons are in the thread. When the team picks, you are resumed with " +
        "\"The team selected: approve <requestId>\" (or deny) — call resolveCoderApproval with that " +
        "requestId and decision. Do NOT send the coder a new message: it would start a second turn " +
        "on top of the parked one."
      : "No channel to render the gate in — ask the humans here, then call resolveCoderApproval with " +
        "the requestId and their decision. Do NOT send the coder a new message.",
  ].join("\n");
}

// Posts one gate card per pending request. A failed post must NOT fail the
// hand-off — the coder is already parked and its requestIds are in the reply
// either way, so claw can still ask the humans in plain text. Returns whether
// every card actually went up.
export async function postApprovalGates(
  fetchFn: typeof fetch,
  opts: { botToken?: string; channelId?: string; pending: PendingApproval[] },
): Promise<boolean> {
  if (!opts.botToken || !opts.channelId || !opts.pending.length) return false;
  let posted = 0;
  for (const pending of opts.pending) {
    try {
      await postApprovalRequest(fetchFn, { botToken: opts.botToken, channelId: opts.channelId, pending });
      posted++;
    } catch (e) {
      console.error(`claw: failed to post the coder approval gate for ${pending.requestId}:`, e);
    }
  }
  return posted === opts.pending.length;
}
