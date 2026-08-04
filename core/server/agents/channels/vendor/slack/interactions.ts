// Vendored from eve@0.19.0 dist/src/public/channels/slack/interactions.js (Apache-2.0).
// Modified: only the PURE payload parsers are vendored. eve's
// `handleInteractionPost` (and the shared-chat-SDK `block_actions` branch of
// `parseBlockActionsPayload`) are shaped against eve's runtime — they import
// `#internal/logging`, `#compiled/@chat-adapter/slack/webhook`, the runtime
// `buildSlackBinding`/`resolveSlackBotToken`/`buildSlackAuthContext`, and issue
// their own `fetch` to Slack — so they are NOT vendorable; the trex factory
// (adapters/slack.ts) supplies that wiring. Kept here: the raw-Slack-payload
// branch of `parseBlockActionsPayload` plus a `parseViewSubmission` for the
// freeform modal. Parsing logic unchanged. Types added from interactions.d.ts.
// See vendor/VENDOR.md.

/** One decoded Slack interactivity action. */
export interface SlackInteractionAction {
  readonly actionId: string;
  readonly value?: string;
  readonly blockId?: string;
  readonly selectedOptionValue?: string;
  readonly messageTs?: string;
  readonly label?: string;
  readonly user: { readonly id: string; readonly username?: string; readonly name?: string };
}

/** Decoded view of a Slack `block_actions` payload. */
export interface ParsedBlockActionsPayload {
  readonly actions: SlackInteractionAction[];
  readonly channelId: string;
  readonly threadTs: string;
  readonly teamId: string | undefined;
  /** Full block list off the clicked message (for answered-card updates). */
  readonly messageBlocks: readonly unknown[];
}

/**
 * Decodes a raw Slack `block_actions` payload into a {@link ParsedBlockActionsPayload}.
 * Returns `null` for payloads that don't carry the channel/thread metadata the
 * handler needs.
 */
export function parseBlockActionsPayload(body: Record<string, unknown>): ParsedBlockActionsPayload | null {
  const actions = body.actions;
  if (!Array.isArray(actions)) return null;
  const channel = body.channel as { id?: string } | undefined;
  const channelId = channel?.id;
  const message = body.message as { ts?: string; thread_ts?: string; blocks?: unknown[] } | undefined;
  const threadTs = message?.thread_ts ?? message?.ts;
  if (!channelId || !threadTs) return null;
  const team = body.team as { id?: string } | undefined;
  const user = (body.user ?? {}) as { id: string; username?: string; name?: string; team_id?: string };
  const teamId = team?.id ?? user.team_id;
  const clicker = { id: user.id, username: user.username, name: user.name };
  const messageBlocks = message?.blocks ?? [];
  return {
    actions: actions.map((a: Record<string, unknown>) => ({
      actionId: String(a.action_id ?? ""),
      value: a.value == null ? undefined : String(a.value),
      blockId: a.block_id == null ? undefined : String(a.block_id),
      selectedOptionValue: extractSelectedOptionValue(a),
      messageTs: message?.ts,
      label: extractActionLabel(a),
      user: clicker,
    })),
    channelId,
    threadTs,
    teamId,
    messageBlocks,
  };
}

function extractSelectedOptionValue(action: Record<string, unknown>): string | undefined {
  const selected = action.selected_option as { value?: unknown } | undefined;
  return typeof selected?.value === "string" ? selected.value : undefined;
}

function extractActionLabel(action: Record<string, unknown>): string | undefined {
  const selectedText = (action.selected_option as { text?: { text?: unknown } } | undefined)?.text?.text;
  if (typeof selectedText === "string" && selectedText.length > 0) return selectedText;
  const text = (action.text as { text?: unknown } | undefined)?.text;
  if (typeof text === "string" && text.length > 0) return text;
  return undefined;
}

/** One submitted value from a Slack `view_submission` modal state. */
export interface SlackViewValue {
  readonly blockId: string;
  readonly actionId: string;
  readonly value: string;
}

/** Decoded view of a Slack `view_submission` payload (freeform modal). */
export interface ParsedViewSubmission {
  readonly callbackId: string;
  readonly privateMetadata: string;
  readonly values: SlackViewValue[];
  readonly user: { readonly id: string; readonly username?: string; readonly name?: string } | undefined;
  readonly teamId: string | undefined;
}

/**
 * Decodes a raw Slack `view_submission` payload into a {@link ParsedViewSubmission}.
 * Returns `null` when the payload is not a `view_submission`.
 */
export function parseViewSubmission(body: Record<string, unknown>): ParsedViewSubmission | null {
  if (body.type !== "view_submission") return null;
  const view = (body.view ?? {}) as {
    callback_id?: unknown;
    private_metadata?: unknown;
    state?: { values?: Record<string, Record<string, { value?: unknown }>> };
  };
  const values: SlackViewValue[] = [];
  const stateValues = view.state?.values ?? {};
  for (const [blockId, actions] of Object.entries(stateValues)) {
    for (const [actionId, field] of Object.entries(actions)) {
      if (typeof field?.value === "string") values.push({ blockId, actionId, value: field.value });
    }
  }
  const user = body.user as { id: string; username?: string; name?: string; team_id?: string } | undefined;
  const team = body.team as { id?: string } | undefined;
  return {
    callbackId: typeof view.callback_id === "string" ? view.callback_id : "",
    privateMetadata: typeof view.private_metadata === "string" ? view.private_metadata : "",
    values,
    user: user ? { id: user.id, username: user.username, name: user.name } : undefined,
    teamId: team?.id ?? user?.team_id,
  };
}
