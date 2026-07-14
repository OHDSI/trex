// Reimplemented for trex — there is NO eve source to vendor. eve's Twilio
// channel only implements voice/text delivery, not a human-in-the-loop widget
// (its HITL widgets live on the Discord/Slack/Telegram channels, which have rich
// interactive surfaces). SMS has no buttons, so the trex Twilio channel renders
// an input request as a numbered PLAIN-TEXT list and maps the user's reply SMS
// back to an option. The encode/decode is deliberately stateless and text-only —
// unlike Telegram's callback-data packing there is no length-limited id to pack,
// so the option→reply mapping is a straight number/keyword match. See
// vendor/VENDOR.md.

import type { InputOption, InputRequest, InputResponse } from "./shared.ts";

/**
 * Renders an input request as an SMS body: the prompt, a numbered option list,
 * and a one-line instruction telling the user how to reply. Text-only (no
 * widgets), concise for SMS.
 */
export function renderTwilioInputRequest(request: InputRequest): string {
  const options = request.options ?? [];
  const lines: string[] = [request.prompt];
  options.forEach((opt, i) => {
    lines.push(`${i + 1}. ${opt.label}`);
  });
  if (options.length > 0) {
    lines.push(`Reply with a number (1-${options.length}) to choose.`);
  } else if (request.allowFreeform) {
    lines.push("Reply with your answer.");
  }
  return lines.join("\n");
}

/**
 * Maps a reply SMS body back to the input option it selects, robustly:
 *   1) a bare option index (`"2"`, or `"2."`), 1-based, within range;
 *   2) a case-insensitive exact match of an option's id or label;
 *   3) a case-insensitive match of the FIRST word (so `"approve please"` picks
 *      the "approve" option) against an id/label.
 * Falls back to freeform text when the request allows it, else `null` (no match →
 * the caller decides what to do, e.g. re-prompt). Never throws.
 */
export function deriveTwilioInputResponse(body: string, request: InputRequest): InputResponse | null {
  const options = request.options ?? [];
  const trimmed = body.trim();
  if (trimmed.length === 0) return freeform(request, body);

  // 1) numeric index (tolerating a trailing dot / whitespace).
  const numeric = trimmed.match(/^(\d+)\.?$/);
  if (numeric) {
    const idx = Number(numeric[1]) - 1;
    if (idx >= 0 && idx < options.length) return { requestId: request.requestId, optionId: options[idx].id };
  }

  // 2) exact id/label match, then 3) first-word match.
  const lowered = trimmed.toLowerCase();
  const firstWord = lowered.split(/\s+/)[0];
  const byExact = matchOption(options, (o) => o.id.toLowerCase() === lowered || o.label.toLowerCase() === lowered);
  if (byExact) return { requestId: request.requestId, optionId: byExact.id };
  const byWord = matchOption(options, (o) => o.id.toLowerCase() === firstWord || o.label.toLowerCase() === firstWord);
  if (byWord) return { requestId: request.requestId, optionId: byWord.id };

  return freeform(request, body);
}

function matchOption(options: readonly InputOption[], pred: (o: InputOption) => boolean): InputOption | undefined {
  return options.find(pred);
}

function freeform(request: InputRequest, body: string): InputResponse | null {
  return request.allowFreeform || (request.options ?? []).length === 0
    ? { requestId: request.requestId, text: body }
    : null;
}
