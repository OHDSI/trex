// @ts-nocheck - Deno edge function, not compiled by tsc
// One coder, two interaction contracts. The engineering behaviour (skills,
// tools, knowledge base) is identical; what differs is who is on the other end.
// Selected from `remoteChannel`, which claw already sets on every /stream call.
import { CHANNEL_CODER_SYSTEM_PROMPT } from "./prompts_channel.ts";

export type CoderProfileName = "ui" | "channel";

export interface CoderProfile {
  name: CoderProfileName;
  /** Replaces the mode-derived base prompt; null keeps today's UI prompt. */
  basePrompt: string | null;
  /** Tools that make no sense for this caller and are withheld. */
  denyTools: string[];
  /** Lower bound on the step budget for this profile. */
  maxStepsFloor: number;
  /** Whether the coder may block on its own question tool. */
  blockingQuestions: boolean;
}

// The preview panel does not exist on a chat channel: these tools either drive
// it or produce assets only the workbench can show.
// DISCLOSED SCAFFOLDING: nothing consumes this list yet. The claude-code
// sidecar (plugins/devx/fn-claude-code/server.js) has no allowedTools/
// disallowedTools wiring in its SDK query() opts, and these three tool names
// aren't even registered as SDK tools on that path in the first place (they
// only exist in tools/registry.ts's buildToolSet, consumed by agent.ts's own
// non-claude-code tool-calling path, which doesn't thread `profile` through
// either). Enforcing this requires wiring one of those two places — do not
// mistake this list for live protection until then.
const CHANNEL_DENY_TOOLS = ["RestartApp", "RefreshPreview", "GenerateImage"];

export function resolveCoderProfile(opts: { remoteChannel?: boolean }): CoderProfile {
  if (opts.remoteChannel === true) {
    return {
      name: "channel",
      basePrompt: CHANNEL_CODER_SYSTEM_PROMPT,
      denyTools: CHANNEL_DENY_TOOLS,
      maxStepsFloor: 200,
      blockingQuestions: false,
    };
  }
  return { name: "ui", basePrompt: null, denyTools: [], maxStepsFloor: 0, blockingQuestions: true };
}
