// Vendored from eve@0.19.0 dist/src/public/channels/slack/hitl.js (Apache-2.0).
// Modified: de-minified; the `#public/channels/slack/limits` import is rewritten
// to the sibling `./limits.ts`; the `InputRequest` type comes from the sibling
// `./shared.ts`. Block Kit rendering + click-decode logic unchanged. See
// vendor/VENDOR.md.

import type { InputOption, InputRequest } from "./shared.ts";
import { SLACK_SECTION_TEXT_MAX_LENGTH, truncateModalTitle, truncatePlainText, truncateSectionText } from "./limits.ts";

/** Wire-format prefix every framework HITL widget mints onto its `action_id`. */
export const HITL_ACTION_PREFIX = "eve_input:";
/** `action_id` prefix for the "Type your answer" button that opens a modal. */
export const HITL_FREEFORM_ACTION_PREFIX = "eve_input_freeform:";
/** `view.callback_id` carried on the freeform-answer modal. */
export const HITL_FREEFORM_MODAL_CALLBACK_ID = "eve_input_freeform_submit";
/** `block_id` of the modal's text-input block. */
export const HITL_FREEFORM_MODAL_BLOCK_ID = "eve_freeform_block";
/** `action_id` of the text input inside the freeform-answer modal. */
export const HITL_FREEFORM_MODAL_ACTION_ID = "eve_freeform_text";

const BUTTON_ACTION_ID_RE = /^(?<requestId>.+):button:\d+$/u;

/** Subset of one Slack interactivity action the HITL decoder reads. */
export interface SlackHitlAction {
  readonly actionId: string;
  readonly value?: string;
  readonly selectedOptionValue?: string;
}

/** Resolved HITL response derived from one Slack interactivity action. */
export interface DerivedHitlResponse {
  readonly requestId: string;
  readonly optionId: string;
}

/**
 * Decodes one Slack interactivity action into an HITL response, or `null` when
 * the action does not match an HITL widget the framework rendered. Buttons carry
 * the option on `value`; radio/static selects carry it on `selectedOptionValue`.
 */
export function deriveHitlResponse(action: SlackHitlAction): DerivedHitlResponse | null {
  if (!action.actionId.startsWith(HITL_ACTION_PREFIX)) return null;
  const rest = action.actionId.slice(HITL_ACTION_PREFIX.length);
  if (action.selectedOptionValue !== undefined) {
    return rest ? { optionId: action.selectedOptionValue, requestId: rest } : null;
  }
  if (action.value !== undefined) {
    const requestId = BUTTON_ACTION_ID_RE.exec(rest)?.groups?.requestId;
    return requestId ? { optionId: action.value, requestId } : null;
  }
  return null;
}

/** True when an action id was minted by an HITL widget the framework rendered. */
export function isHitlAction(actionId: string): boolean {
  return actionId.startsWith(HITL_ACTION_PREFIX);
}

/** True when an action id was minted by the framework's freeform-answer button. */
export function isFreeformAction(actionId: string): boolean {
  return actionId.startsWith(HITL_FREEFORM_ACTION_PREFIX);
}

/** Extracts the requestId from a freeform-answer button's `action_id`. */
export function freeformRequestIdFromActionId(actionId: string): string | undefined {
  if (!isFreeformAction(actionId)) return undefined;
  const rest = actionId.slice(HITL_FREEFORM_ACTION_PREFIX.length);
  return rest.length > 0 ? rest : undefined;
}

/** Renders one `InputRequest` as Block Kit blocks. Always emits the prompt section. */
export function renderInputRequestBlocks(request: InputRequest): Record<string, unknown>[] {
  const promptBlock = { text: { text: truncateSectionText(request.prompt), type: "mrkdwn" }, type: "section" };
  const detailBlocks = renderInputRequestDetailBlocks(request);
  const actionId = `${HITL_ACTION_PREFIX}${request.requestId}`;
  const options = request.options;
  const allowFreeform = request.allowFreeform === true || !options || options.length === 0;

  if (options && options.length > 0 && request.display === "select") {
    const element = options.length <= 6
      ? { type: "radio_buttons", action_id: actionId, options: options.map(buildOption) }
      : {
        type: "static_select",
        action_id: actionId,
        options: options.map(buildOption),
        placeholder: { type: "plain_text", text: "Choose an option" },
      };
    return [promptBlock, ...detailBlocks, { type: "actions", elements: [element] }];
  }

  if (options && options.length > 0) {
    return [promptBlock, ...detailBlocks, { type: "actions", elements: options.map((o, i) => buildButton(o, actionId, i)) }];
  }

  if (allowFreeform) {
    return [promptBlock, ...detailBlocks, {
      type: "actions",
      elements: [{
        type: "button",
        action_id: `${HITL_FREEFORM_ACTION_PREFIX}${request.requestId}`,
        text: { type: "plain_text", text: "Type your answer" },
        style: "primary",
        value: request.requestId,
      }],
    }];
  }

  return [promptBlock];
}

/** Fallback text for one HITL request, including approval tool-input details. */
export function formatInputRequestFallbackText(request: InputRequest): string {
  const details = formatToolInputDetails(request);
  return details === undefined ? request.prompt : `${request.prompt}\n${details}`;
}

/** Metadata round-tripped on the freeform-answer modal's `private_metadata`. */
export interface HitlFreeformModalMetadata {
  readonly continuationToken: string;
  readonly channelId: string;
  readonly threadTs: string;
  readonly messageTs: string;
  readonly requestId: string;
}

/** Builds the `views.open` payload for the freeform-answer modal. */
export function buildFreeformModalView(
  input: { readonly metadata: HitlFreeformModalMetadata; readonly prompt?: string },
): Record<string, unknown> {
  const title = input.prompt ? truncateModalTitle(input.prompt) : "Your answer";
  const promptBlocks = input.prompt
    ? [{ type: "section", text: { type: "mrkdwn", text: truncateSectionText(input.prompt) } }]
    : [];
  return {
    type: "modal",
    callback_id: HITL_FREEFORM_MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify(input.metadata),
    title: { type: "plain_text", text: title },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [...promptBlocks, {
      type: "input",
      block_id: HITL_FREEFORM_MODAL_BLOCK_ID,
      element: {
        type: "plain_text_input",
        action_id: HITL_FREEFORM_MODAL_ACTION_ID,
        multiline: true,
        placeholder: { type: "plain_text", text: "Type your answer here..." },
      },
      label: { type: "plain_text", text: "Answer" },
    }],
  };
}

/** Renders the "answered" replacement blocks for a previously-posted HITL card. */
export function buildAnsweredBlocks(
  input: { readonly promptBlocks: readonly unknown[]; readonly answerLabel: string; readonly userId?: string },
): unknown[] {
  const blocks: unknown[] = [];
  for (const b of input.promptBlocks) if (b != null) blocks.push(b);
  const label = truncateWithEllipsis(input.answerLabel, SLACK_SECTION_TEXT_MAX_LENGTH - 20 - 1);
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `:white_check_mark: *${label}*` } });
  if (input.userId && input.userId.length > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Answered by <@${input.userId}>` }] });
  }
  return blocks;
}

function renderInputRequestDetailBlocks(request: InputRequest): Record<string, unknown>[] {
  const details = formatToolInputDetails(request);
  return details === undefined ? [] : [{ type: "section", text: { type: "mrkdwn", text: details } }];
}

function formatToolInputDetails(request: InputRequest): string | undefined {
  if (!isApprovalRequest(request)) return undefined;
  const json = JSON.stringify((request.action as { input?: unknown }).input, null, 2);
  if (json === "{}") return undefined;
  return `*Tool input*\n\`\`\`\n${truncateWithEllipsis(json, SLACK_SECTION_TEXT_MAX_LENGTH - 17 - 4)}\n\`\`\``;
}

function isApprovalRequest(request: InputRequest): request is InputRequest & { action: { input?: unknown } } {
  const o = request.options;
  // Defensive add vs. eve: also require `action` present. eve's InputRequest type
  // guarantees it for approvals, but this vendor widened `action` to optional, so
  // guard here so a shaped approve/deny request without an action never throws.
  return request.action != null && request.display === "confirmation" && o?.length === 2 &&
    o[0]?.id === "approve" && o[1]?.id === "deny";
}

function buildButton(option: InputOption, prefix: string, index: number): Record<string, unknown> {
  const button: Record<string, unknown> = {
    action_id: `${prefix}:button:${index}`,
    text: { text: truncatePlainText(option.label), type: "plain_text" },
    type: "button",
    value: option.id,
  };
  if (option.style === "primary" || option.style === "danger") button.style = option.style;
  return button;
}

function buildOption(option: InputOption): Record<string, unknown> {
  const opt: Record<string, unknown> = {
    text: { text: truncatePlainText(option.label), type: "plain_text" },
    value: option.id,
  };
  const description = truncatePlainText(option.description);
  if (description && description.length > 0) opt.description = { text: description, type: "plain_text" };
  return opt;
}

function truncateWithEllipsis(value: string, max: number): string {
  if (value.length <= max) return value;
  const end = Math.max(0, max - 3);
  return `${value.slice(0, end).trimEnd()}...`;
}
