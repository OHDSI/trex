// Vendored from eve@0.19.0 dist/src/public/channels/discord/hitl.js (Apache-2.0).
// Modified: imports rewritten from `#public/channels/discord/inbound` +
// `#runtime/input/types` to the sibling `./inbound.ts` / `./shared.ts`; Node
// Buffer base64url encode/decode swapped for the sibling `utf8ToBase64Url` /
// `base64UrlToUtf8` helpers. Component-encoding logic unchanged. See
// vendor/VENDOR.md.

import { DISCORD_INTERACTION_RESPONSE_TYPE } from "./inbound.ts";
import type { DiscordComponentInteraction, DiscordModalSubmitInteraction } from "./inbound.ts";
import { base64UrlToUtf8, type InputRequest, type InputResponse, utf8ToBase64Url } from "./shared.ts";

/** Maps Discord component kinds to their wire `type` integers. */
export const DISCORD_COMPONENT_TYPE = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
} as const;

export const DISCORD_HITL_CUSTOM_ID_PREFIX = "eve_input:";
export const DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX = "eve_input_freeform:";
export const DISCORD_HITL_FREEFORM_TEXT_INPUT_ID = "eve_freeform_text";

type Row = Readonly<Record<string, unknown>>;

/**
 * Renders an input request into Discord action-row components: a string-select
 * for `display: "select"` with options, else option buttons chunked into rows,
 * else a freeform-answer button when freeform is accepted. Empty array when no
 * control applies.
 */
export function renderInputRequestComponents(request: InputRequest): Row[] {
  const options = request.options;
  const allowFreeform = request.allowFreeform === true || !options || options.length === 0;

  if (options && options.length > 0 && request.display === "select") {
    return [{
      components: [{
        custom_id: encodeHitlCustomId(DISCORD_HITL_CUSTOM_ID_PREFIX, { requestId: request.requestId }),
        options: options.slice(0, 25).map((o) => {
          const opt: Record<string, unknown> = { label: truncate(o.label, 100), value: truncate(o.id, 100) };
          if (o.description !== undefined) opt.description = truncate(o.description, 100);
          return opt;
        }),
        placeholder: "Choose an option",
        type: DISCORD_COMPONENT_TYPE.STRING_SELECT,
      }],
      type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
    }];
  }

  if (options && options.length > 0) {
    return chunk(options.slice(0, 25), 5).map((group) => ({
      components: group.map((o) => ({
        custom_id: encodeHitlCustomId(DISCORD_HITL_CUSTOM_ID_PREFIX, { optionId: o.id, requestId: request.requestId }),
        label: truncate(o.label, 80),
        style: toDiscordButtonStyle(o.style),
        type: DISCORD_COMPONENT_TYPE.BUTTON,
      })),
      type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
    }));
  }

  if (allowFreeform) {
    return [{
      components: [{
        custom_id: encodeHitlCustomId(DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX, { requestId: request.requestId }),
        label: "Type your answer",
        style: 1,
        type: DISCORD_COMPONENT_TYPE.BUTTON,
      }],
      type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
    }];
  }

  return [];
}

/** Builds a Discord modal response for one freeform HITL request. */
export function buildFreeformModalResponse(
  input: { readonly customId: string; readonly prompt: string | undefined },
): Record<string, unknown> {
  const decoded = decodeHitlCustomId(input.customId, DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX);
  if (!decoded) throw new Error("discordChannel: freeform custom_id is malformed.");
  return {
    data: {
      components: [{
        components: [{
          custom_id: DISCORD_HITL_FREEFORM_TEXT_INPUT_ID,
          label: "Answer",
          max_length: 4000,
          min_length: 1,
          placeholder: "Type your answer here...",
          required: true,
          style: 2,
          type: DISCORD_COMPONENT_TYPE.TEXT_INPUT,
        }],
        type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
      }],
      custom_id: encodeHitlCustomId(DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX, { requestId: decoded.requestId }),
      title: truncate(input.prompt ?? "Your answer", 45),
    },
    type: DISCORD_INTERACTION_RESPONSE_TYPE.MODAL,
  };
}

/** Returns true when a component custom id starts the freeform modal flow. */
export function isDiscordFreeformComponent(customId: string): boolean {
  return decodeHitlCustomId(customId, DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX) !== null;
}

/**
 * Decodes an eve HITL component interaction into input responses. Empty array if
 * the custom id is not an eve HITL id; otherwise one response from the encoded
 * option id (buttons) or the first selected value (selects).
 */
export function deriveComponentInputResponses(interaction: DiscordComponentInteraction): InputResponse[] {
  const decoded = decodeHitlCustomId(interaction.customId, DISCORD_HITL_CUSTOM_ID_PREFIX);
  if (!decoded) return [];
  if (decoded.optionId !== undefined) return [{ optionId: decoded.optionId, requestId: decoded.requestId }];
  const value = interaction.values[0];
  if (value === undefined) return [];
  return [{ optionId: value, requestId: decoded.requestId }];
}

/**
 * Decodes an eve freeform modal submission into a single text input response.
 * Empty array unless the custom id matches the freeform prefix and the freeform
 * text field is present.
 */
export function deriveModalInputResponses(interaction: DiscordModalSubmitInteraction): InputResponse[] {
  const decoded = decodeHitlCustomId(interaction.customId, DISCORD_HITL_FREEFORM_CUSTOM_ID_PREFIX);
  const text = interaction.textInputs[DISCORD_HITL_FREEFORM_TEXT_INPUT_ID];
  if (!decoded || text === undefined) return [];
  return [{ requestId: decoded.requestId, text }];
}

interface DecodedCustomId {
  requestId: string;
  optionId?: string;
}

// Payload is packed as `requestId` (optionally + \u001f + optionId) rather than JSON:
// a UUID requestId plus an "approve"/"deny" optionId, JSON-wrapped and base64url'd,
// exceeds Discord's 100-char custom_id cap (~106 chars), so every approval-button
// render threw. The compact form keeps a UUID + verb at ~70 chars. \u001f can't
// appear in a UUID or an option id, so it is an unambiguous separator.
const HITL_FIELD_SEP = "\u001f"; // US (0x1f)

function encodeHitlCustomId(prefix: string, payload: DecodedCustomId): string {
  const raw = payload.optionId === undefined
    ? payload.requestId
    : `${payload.requestId}${HITL_FIELD_SEP}${payload.optionId}`;
  const encoded = `${prefix}${utf8ToBase64Url(raw)}`;
  if (encoded.length > 100) {
    throw new Error("discordChannel: HITL custom_id exceeded Discord's 100-character limit.");
  }
  return encoded;
}

function decodeHitlCustomId(customId: string, prefix: string): DecodedCustomId | null {
  if (!customId.startsWith(prefix)) return null;
  try {
    const raw = base64UrlToUtf8(customId.slice(prefix.length));
    const [requestId, optionId] = raw.split(HITL_FIELD_SEP);
    if (typeof requestId !== "string" || requestId.length === 0) return null;
    return typeof optionId === "string" ? { requestId, optionId } : { requestId };
  } catch {
    return null;
  }
}

function toDiscordButtonStyle(style: string | undefined): number {
  return style === "primary" ? 1 : style === "danger" ? 4 : 2;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const end = Math.max(0, max - 3);
  return `${value.slice(0, end).trimEnd()}...`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
