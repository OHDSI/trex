// Vendored from eve@0.19.0 dist/src/public/channels/teams/hitl.js (Apache-2.0),
// de-minified. PURE — its imports are `#shared/guards` (isObject), `#shared/json`
// (parseJsonObject), and the sibling `limits.js` constants, all consolidated
// here or in `shared.ts`, so no eve import survives. The Adaptive-Card shapes
// are eve's, unchanged: `input.requested` → an `AdaptiveCard` (v1.5) with a
// prompt `TextBlock` and either `Action.Submit` buttons (confirmation) or an
// `Input.ChoiceSet` (select) / `Input.Text` (freeform); each submit carries an
// `eve_input: { requestId, optionId }` data payload. `deriveTeamsInputResponses`
// reads that payload back off an inbound message/invoke Activity's `value`
// (the card round-trip). Modified: only the render + derive helpers the trex
// factory needs are kept (YAGNI) — eve's `renderAnsweredInputRequestMessage`
// (the post-answer card update) is DROPPED. See vendor/VENDOR.md.

import { isObject, type InputRequest, parseJsonObject } from "./shared.ts";
import {
  TEAMS_ADAPTIVE_CARD_ACTION_LIMIT,
  TEAMS_ADAPTIVE_CARD_ACTION_TITLE_MAX_LENGTH,
  TEAMS_ADAPTIVE_CARD_CHOICE_TITLE_MAX_LENGTH,
  TEAMS_ADAPTIVE_CARD_TEXT_MAX_LENGTH,
} from "./limits.ts";

export const TEAMS_ADAPTIVE_CARD_CONTENT_TYPE = "application/vnd.microsoft.card.adaptive";
export const TEAMS_HITL_DATA_KEY = "eve_input";
export const TEAMS_HITL_CHOICE_INPUT_ID = "eve_option";
export const TEAMS_HITL_FREEFORM_INPUT_ID = "eve_freeform_text";

/** One derived input response read off a card-submit Activity. */
export interface TeamsInputResponse {
  readonly requestId: string;
  readonly optionId?: string;
  readonly text?: string;
}

/** A Teams outbound message with an Adaptive-Card attachment. */
export interface TeamsCardMessage {
  readonly text: string;
  readonly attachments: readonly { readonly contentType: string; readonly content: Record<string, unknown> }[];
}

/** Renders an input request as a Teams message carrying an Adaptive Card. */
export function renderInputRequestMessage(
  request: InputRequest,
  opts: { adaptiveCardVersion?: string } = {},
): TeamsCardMessage {
  return { attachments: [renderInputRequestAttachment(request, opts)], text: request.prompt };
}

/** Builds just the Adaptive-Card attachment for an input request. */
export function renderInputRequestAttachment(
  request: InputRequest,
  opts: { adaptiveCardVersion?: string } = {},
): { contentType: string; content: Record<string, unknown> } {
  return {
    content: parseJsonObject({
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      actions: renderActions(request),
      body: [
        { text: truncate(request.prompt, TEAMS_ADAPTIVE_CARD_TEXT_MAX_LENGTH), type: "TextBlock", wrap: true },
        ...renderInputs(request),
      ],
      type: "AdaptiveCard",
      version: opts.adaptiveCardVersion ?? "1.5",
    }),
    contentType: TEAMS_ADAPTIVE_CARD_CONTENT_TYPE,
  };
}

function renderInputs(request: InputRequest): Record<string, unknown>[] {
  const options = request.options ?? [];
  if (request.display === "select" && options.length > 0) {
    return [{
      choices: options.map((o) => ({ title: truncate(o.label, TEAMS_ADAPTIVE_CARD_CHOICE_TITLE_MAX_LENGTH), value: o.id })),
      id: TEAMS_HITL_CHOICE_INPUT_ID,
      isMultiSelect: false,
      style: "compact",
      type: "Input.ChoiceSet",
    }];
  }
  if (request.allowFreeform === true || options.length === 0) {
    return [{ id: TEAMS_HITL_FREEFORM_INPUT_ID, isMultiline: true, placeholder: "Type your answer", type: "Input.Text" }];
  }
  return [];
}

function renderActions(request: InputRequest): Record<string, unknown>[] {
  const options = request.options ?? [];
  if (options.length > 0 && request.display !== "select") {
    return options.slice(0, TEAMS_ADAPTIVE_CARD_ACTION_LIMIT).map((o) => ({
      data: { [TEAMS_HITL_DATA_KEY]: { optionId: o.id, requestId: request.requestId } },
      title: truncate(o.label, TEAMS_ADAPTIVE_CARD_ACTION_TITLE_MAX_LENGTH),
      type: "Action.Submit",
    }));
  }
  return [{ data: { [TEAMS_HITL_DATA_KEY]: { requestId: request.requestId } }, title: "Submit", type: "Action.Submit" }];
}

/** True when an inbound Activity carries a HITL card-submit payload. */
export function isTeamsInputResponseActivity(activity: { type?: string; value?: unknown }): boolean {
  return deriveTeamsInputResponses(activity).length > 0;
}

/** Reads the `eve_input` payload (+ any Input.ChoiceSet/Input.Text values) off a card-submit Activity. */
export function deriveTeamsInputResponses(activity: { type?: string; value?: unknown }): readonly TeamsInputResponse[] {
  const value = readActivityValue(activity);
  if (!value) return [];
  const payload = readHitlPayload(value);
  if (!payload) return [];
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  if (!requestId) return [];
  const optionId = typeof payload.optionId === "string"
    ? payload.optionId
    : typeof value[TEAMS_HITL_CHOICE_INPUT_ID] === "string"
    ? value[TEAMS_HITL_CHOICE_INPUT_ID] as string
    : undefined;
  const freeform = typeof value[TEAMS_HITL_FREEFORM_INPUT_ID] === "string"
    ? value[TEAMS_HITL_FREEFORM_INPUT_ID] as string
    : undefined;
  if (optionId !== undefined) return [{ optionId, requestId }];
  if (freeform !== undefined) return [{ requestId, text: freeform }];
  return [{ requestId }];
}

/** The `invoke` response body a Teams `adaptiveCard/action` expects. */
export function teamsInvokeResponse(opts: { statusCode?: number; message?: string } = {}): Record<string, unknown> {
  return {
    statusCode: opts.statusCode ?? 200,
    type: "application/vnd.microsoft.activity.message",
    value: opts.message ?? "Answer received.",
  };
}

function readActivityValue(activity: { type?: string; value?: unknown }): Record<string, unknown> | null {
  if (activity.type === "message") return isObject(activity.value) ? activity.value : null;
  if (activity.type === "invoke") return readInvokeValue(activity.value);
  return null;
}

function readInvokeValue(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const action = isObject(value.action) ? value.action : null;
  const data = action && isObject(action.data) ? action.data : null;
  return data ?? value;
}

function readHitlPayload(value: Record<string, unknown>): Record<string, unknown> | null {
  const direct = value[TEAMS_HITL_DATA_KEY];
  if (isObject(direct)) return direct;
  const action = isObject(value.action) ? value.action : null;
  const nested = action && isObject(action.data) ? (action.data as Record<string, unknown>)[TEAMS_HITL_DATA_KEY] : undefined;
  return isObject(nested) ? nested : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}
