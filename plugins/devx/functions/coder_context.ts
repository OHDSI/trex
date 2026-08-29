// @ts-nocheck - Deno edge function, not compiled by tsc
// plugins/devx/functions/coder_context.ts
// The one place a coder turn's system prompt and step budget are assembled.
// Both engines (ai-sdk, the Claude Agent SDK sidecar) consume this; neither
// may append to the prompt afterwards. Before this existed the two assembled
// it separately and had already drifted apart — the channel profile reached
// only one of them, and even the component-selection sentence was worded
// two ways.
import { constructSystemPrompt } from "./prompts.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

export const DEFAULT_MAX_STEPS = 100;

export const COMPONENT_SELECTION_LINE =
  "\nThe user has selected specific components for editing. Focus your modifications on those components.";

// Only the ui profile (blockingQuestions: true) gets told to call
// mcp__ask__ask_question — a human is at the keyboard to answer it. That
// handler (see /pending-responses below and server.js's askServer) polls for
// up to 5 minutes for a reply written by the browser UI; on a channel turn
// nobody is watching this devx chat, so calling it just burns the full
// timeout and comes back empty. The channel profile's own prompt
// (CHANNEL_CODER_SYSTEM_PROMPT's <gated_protocol>) already tells the coder to
// put the question in its reply and stop instead — injecting this rule too
// would tell it to do both, the exact "two agents at once" defect this
// profile split exists to remove. Exported so it's unit-testable without the
// network/duckdb side effects the rest of this module carries.
export function buildAskQuestionRule(profile: { blockingQuestions: boolean }): string {
  if (!profile.blockingQuestions) return "";
  return `<asking-questions>\nWhenever you need to ask the user ANYTHING — a clarifying question, a choice between options, or a confirmation — you MUST use the \`mcp__ask__ask_question\` tool. Pass \`options\` for a single choice, add \`multiSelect: true\` for multiple, or omit \`options\` for free text. This applies everywhere, not only during brainstorming. NEVER write a question as plain text in your reply: plain-text questions do NOT render as an interactive prompt and the user may not answer them.\n</asking-questions>`;
}

const SKILL_USAGE_RULE = `<skill-usage>\nThe skills above are real and invocable via the Skill tool. When the user asks you to build a feature, component, app, or mockups, FIRST invoke the appropriate skill (e.g. the brainstorming skill to explore the idea and present design options) BEFORE writing app code. Do not jump straight to implementation, and do not write throwaway mockups into the user's app.\n</skill-usage>`;

// Belt-and-braces with the sidecar's includeCoAuthoredBy=false (server.js
// disableCoderAttribution): that suppresses the SDK's automatic trailer/
// footer; this stops the model from MENTIONING the tooling in text it
// writes itself.
const COMMIT_HYGIENE_RULE = `<commit-pr-hygiene>\nCommits, branch names, and pull-request text belong to the user, not the tooling. Never mention Claude, Anthropic, AI, or that the work was generated/assisted, anywhere in a commit message, commit trailer (no Co-Authored-By: Claude or similar), branch name, PR title, or PR description. Write them exactly as the human author of the change would. Branch names always follow <github-username>/<topic> (the connected GitHub account's username, short kebab-case topic, e.g. p-hoffmann/fix-filter-race).\nBranches are created DIRECTLY in the app repository and pushed to its origin — the connected account has push access. Never fork the repository or push to a fork (no \`gh repo fork\`, no \`gh pr create --fork\`); if pushing to origin fails, report the permission problem instead of falling back to a fork.\nIf you wrote a plan or spec for the change (e.g. under trex/plans/), COMMIT that file to the same feature branch before opening the PR — the plan is part of the reviewable change, not a scratch artifact. Keep it updated if the implementation diverges from it.\nNever commit \`trex/screenshots/\` — those images are posted to the channel, not reviewed in the diff.\n</commit-pr-hygiene>`;

// The workspace you are given IS an isolated branch of its own. Every locked
// chat observed in production began the same way: the coder checked out some
// other branch and left it checked out at turn end. The guard then refused the
// next turn — before the coder starts, so nothing in-session could repair it.
// Defence in depth only: chat_worktree.ts must (and does) recover regardless.
const WORKTREE_HYGIENE_RULE = `<worktree-hygiene>\nYou are already on an isolated branch created for this task — do your work on it. You rarely need another branch; do not create one just to have a nicer name.\nIf you must check out a different branch (to inspect or iterate on an existing PR), switch BACK to the branch you started on before you finish the turn, and commit or stash anything you changed first. A turn that ends on someone else's branch with uncommitted files leaves the workspace unusable for the next message.\nNever end a turn with a rebase, merge, cherry-pick or revert half-finished — complete it or abort it.\nNever rename or delete the branch you were given.\n</worktree-hygiene>`;

// Always-on preamble: the using-skills skill content is injected into
// every session's system prompt. Loaded lazily and cached for the worker
// lifecycle (skills/sync.ts already resolves the same plugin base path).
let _skillsPreamble: string | null = null;
async function loadSkillsPreamble(): Promise<string> {
  if (_skillsPreamble !== null) return _skillsPreamble;
  try {
    const fnPath = Deno.env.get("TREX_FUNCTION_PATH") || new URL("../", import.meta.url).pathname;
    const pluginBase = fnPath.replace(/\/functions\/?$/, "").replace(/\/$/, "");
    const body = await Deno.readTextFile(`${pluginBase}/skills/using-skills/SKILL.md`);
    // Strip frontmatter so the body reads as a system-prompt section, not a skill file.
    const stripped = body.replace(/^---\n[\s\S]*?\n---\n+/, "");
    _skillsPreamble = stripped.trim();
  } catch (err) {
    console.warn("[coder_context] using-skills preamble not loaded:", err?.message || err);
    _skillsPreamble = "";
  }
  return _skillsPreamble;
}

export interface CoderContextInput {
  mode: string;
  aiRules?: string;
  skillContext?: string;
  remoteChannel?: boolean;
  hasComponentSelection?: boolean;
  settings: { max_steps?: number };
  // Enabled skills for this user, rendered as a listing immediately before
  // SKILL_USAGE_RULE -- which tells the model "The skills above are real and
  // invocable", a sentence that previously referred to nothing on either loop.
  // Sourced from devx.skills via loadSkillMetadata so both loops render the
  // identical block from one place.
  skills?: Array<{ name: string; description: string }>;
  // Whether THIS engine actually registers the mcp__ask__ask_question tool
  // that buildAskQuestionRule's <asking-questions> block instructs the model
  // to call. Today that tool exists only in the claude-code sidecar
  // (fn-claude-code/server.js) — the ai-sdk tool registry (tools/registry.ts)
  // doesn't have it. Telling a model to MUST use a tool it doesn't have, and
  // to NEVER ask in plain text instead, silently breaks its only real way to
  // ask a question. This is a per-engine tool-availability fact, not
  // something the ui/channel profile can infer, so it is threaded in
  // explicitly rather than derived. Defaults to false (safe: no engine is
  // assumed to have the tool unless it says so).
  askToolAvailable?: boolean;
}

export interface CoderContext {
  systemPrompt: string;
  maxSteps: number;
}

export async function buildCoderContext(input: CoderContextInput): Promise<CoderContext> {
  const profile = resolveCoderProfile({ remoteChannel: input.remoteChannel === true });

  let systemPrompt = constructSystemPrompt(input.mode, input.aiRules, input.skillContext, profile);

  const skillsPreamble = await loadSkillsPreamble();
  if (skillsPreamble) {
    // Gate on BOTH: the profile allowing blocking questions at all (ui, not
    // channel — buildAskQuestionRule already enforces this), AND the calling
    // engine actually providing the tool the rule tells the model to call.
    const askQuestionRule = input.askToolAvailable ? buildAskQuestionRule(profile) : "";
    const skillsListing = (input.skills ?? []).length > 0
      ? `<available-skills>\n${(input.skills ?? []).map((s) => `- ${s.name}: ${s.description}`).join("\n")}\n</available-skills>\n\n`
      : "";
    systemPrompt =
      `<skills-protocol>\n${skillsPreamble}\n</skills-protocol>\n\n${skillsListing}${SKILL_USAGE_RULE}\n\n` +
      `${askQuestionRule ? askQuestionRule + "\n\n" : ""}${COMMIT_HYGIENE_RULE}\n\n${WORKTREE_HYGIENE_RULE}\n\n${systemPrompt}`;
  }

  if (input.hasComponentSelection) systemPrompt += COMPONENT_SELECTION_LINE;

  // Channel turns run long, unattended, multi-step protocols (plan, implement,
  // verify) — never let a lower per-user setting starve one below the floor the
  // profile needs to finish a step.
  const maxSteps = Math.max(input.settings?.max_steps || DEFAULT_MAX_STEPS, profile.maxStepsFloor);

  return { systemPrompt, maxSteps };
}
