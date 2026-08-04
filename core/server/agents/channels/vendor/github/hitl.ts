// Reimplemented for trex — there is NO eve source to vendor. eve's GitHub
// channel has no human-in-the-loop widget (its HITL widgets live on the
// Discord/Slack/Telegram channels, which have rich interactive surfaces).
// GitHub comments have no buttons, so the trex GitHub channel renders an input
// request as a Markdown checklist + reply-instructions comment and maps the
// user's next comment back to an option. The encode/decode is deliberately
// stateless and text-only — mirroring twilio/hitl.ts (an issue/PR thread carries
// no length-limited callback id to pack, so the option→reply mapping is a plain
// slash-command / number / keyword match). See vendor/VENDOR.md.

import type { InputOption, InputRequest, InputResponse } from "./shared.ts";

/**
 * Renders an input request as a GitHub comment body: the prompt, a Markdown
 * checklist of options each with a `/slash` reply command, and a one-line
 * instruction. Text-only (no widgets).
 */
export function renderGitHubInputRequest(request: InputRequest): string {
  const options = request.options ?? [];
  const lines: string[] = [request.prompt, ""];
  options.forEach((opt, i) => {
    lines.push(`- [ ] **${opt.label}** — reply with \`/${opt.id}\` or \`${i + 1}\``);
  });
  if (options.length > 0) {
    const commands = options.map((o) => `\`/${o.id}\``).join(" or ");
    lines.push("", `Reply with ${commands} (or the option's number) to choose.`);
  } else if (request.allowFreeform) {
    lines.push("", "Reply with a comment to answer.");
  }
  return lines.join("\n");
}

/**
 * Maps a reply comment body back to the input option it selects, robustly:
 *   1) a `/slash` command matching an option id (`/approve`);
 *   2) a bare option index (`"2"`, `"2."`), 1-based, within range;
 *   3) a case-insensitive exact match of an option's id or label;
 *   4) a case-insensitive match of the FIRST word.
 * Falls back to freeform text when the request allows it, else `null`. Never throws.
 */
export function deriveGitHubInputResponse(body: string, request: InputRequest): InputResponse | null {
  const options = request.options ?? [];
  const trimmed = body.trim();
  if (trimmed.length === 0) return freeform(request, body);

  // 1) /slash command.
  const slash = trimmed.match(/^\/([A-Za-z0-9_-]+)/);
  if (slash) {
    const byId = options.find((o) => o.id.toLowerCase() === slash[1].toLowerCase());
    if (byId) return { requestId: request.requestId, optionId: byId.id };
  }

  // 2) numeric index (tolerating a trailing dot).
  const numeric = trimmed.match(/^(\d+)\.?$/);
  if (numeric) {
    const idx = Number(numeric[1]) - 1;
    if (idx >= 0 && idx < options.length) return { requestId: request.requestId, optionId: options[idx].id };
  }

  // 3) exact id/label, then 4) first-word.
  const lowered = trimmed.toLowerCase();
  const firstWord = lowered.split(/\s+/)[0];
  const byExact = options.find((o) => o.id.toLowerCase() === lowered || o.label.toLowerCase() === lowered);
  if (byExact) return { requestId: request.requestId, optionId: byExact.id };
  const byWord = options.find((o) => o.id.toLowerCase() === firstWord || o.label.toLowerCase() === firstWord);
  if (byWord) return { requestId: request.requestId, optionId: byWord.id };

  return freeform(request, body);
}

function freeform(request: InputRequest, body: string): InputResponse | null {
  return request.allowFreeform || (request.options ?? []).length === 0
    ? { requestId: request.requestId, text: body }
    : null;
}

export type { InputOption, InputRequest, InputResponse };
