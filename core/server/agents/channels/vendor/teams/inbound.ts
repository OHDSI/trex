// Vendored from eve@0.19.0 dist/src/public/channels/teams/inbound.js
// (Apache-2.0), de-minified — with ONE deliberate divergence. eve's
// `parseTeamsActivity` is otherwise PURE (imports only `#shared/guards` +
// `#shared/json`, consolidated into `shared.ts`), so the Activity-shape parsing
// — `parseActivityBase`, `parseConversation`, `parseChannelAccount`,
// `parseMentions`, `stripBotMention`, `inferScope`, the `<teams_context>` block
// — is eve's, unchanged. DIVERGENCE: eve normalizes HTML message text to
// Markdown via `#compiled/turndown` (`TurndownService`), an eve-bundled runtime
// dep. Rather than re-vendor a whole HTML→Markdown engine (YAGNI — Teams bot
// text is predominantly plaintext with `<at>` mentions), `normalizeTeamsText`
// here does a LIGHTWEIGHT strip: unwrap `<at>…</at>` to `@…`, drop remaining
// tags, and decode the common HTML entities (eve's `HTML_ENTITY_MAP`). eve's
// attachment collection (upload-policy engine) is out of v1 scope and NOT
// carried. Only `message`/`invoke` activities are parsed; everything else
// (`conversationUpdate`, …) returns `null` (ignored gracefully). See
// vendor/VENDOR.md.

import { isNonEmptyString, isObject } from "./shared.ts";

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};
const HTML_ENTITY_PATTERN = new RegExp(Object.keys(HTML_ENTITY_MAP).join("|"), "gi");

/** A Teams channel account (user / bot). */
export interface TeamsChannelAccount {
  readonly id: string;
  readonly name?: string;
  readonly role?: string;
  readonly aadObjectId?: string;
}

/** A Teams conversation reference. */
export interface TeamsConversation {
  readonly id: string;
  readonly conversationType?: string;
  readonly isGroup?: boolean;
  readonly name?: string;
  readonly tenantId?: string;
}

/** A parsed @-mention entity. */
export interface TeamsMention {
  readonly type: "mention";
  readonly text: string;
  readonly mentioned: TeamsChannelAccount;
}

/** A parsed inbound Teams Activity (message or invoke). */
export interface TeamsActivity {
  readonly type: "message" | "invoke";
  readonly id: string;
  readonly serviceUrl: string;
  readonly conversation: TeamsConversation;
  readonly conversationType?: string;
  readonly from: TeamsChannelAccount;
  readonly recipient: TeamsChannelAccount;
  readonly text: string;
  readonly scope: string;
  readonly isBotMentioned: boolean;
  readonly mentions: readonly TeamsMention[];
  readonly replyToId?: string;
  readonly tenantId?: string;
  readonly teamId?: string;
  readonly teamsChannelId?: string;
  readonly name?: string;
  readonly value?: Record<string, unknown>;
  readonly raw: Record<string, unknown>;
}

/** Parses a raw inbound Activity; returns null for unsupported/malformed types. */
export function parseTeamsActivity(input: unknown): TeamsActivity | null {
  if (!isObject(input)) return null;
  if (input.type === "message") return parseMessageActivity(input);
  if (input.type === "invoke") return parseInvokeActivity(input);
  return null;
}

function parseMessageActivity(raw: Record<string, unknown>): TeamsActivity | null {
  const base = parseActivityBase(raw);
  if (!base) return null;
  const mentions = parseMentions(raw.entities);
  const text = normalizeTeamsText(stripBotMention(readText(raw), mentions, base.recipient.id));
  return {
    ...base,
    isBotMentioned: mentions.some((m) => m.mentioned.id === base.recipient.id),
    mentions,
    replyToId: isNonEmptyString(raw.replyToId) ? raw.replyToId : undefined,
    scope: inferScope(base.conversation),
    text,
    type: "message",
    value: isObject(raw.value) ? raw.value : undefined,
  };
}

function parseInvokeActivity(raw: Record<string, unknown>): TeamsActivity | null {
  const base = parseActivityBase(raw);
  if (!base) return null;
  return {
    ...base,
    isBotMentioned: false,
    mentions: [],
    name: isNonEmptyString(raw.name) ? raw.name : undefined,
    replyToId: isNonEmptyString(raw.replyToId) ? raw.replyToId : undefined,
    scope: inferScope(base.conversation),
    text: "",
    type: "invoke",
    value: isObject(raw.value) ? raw.value : undefined,
  };
}

type ActivityBase = Omit<
  TeamsActivity,
  "type" | "text" | "scope" | "isBotMentioned" | "mentions" | "replyToId" | "name" | "value"
>;

function parseActivityBase(raw: Record<string, unknown>): ActivityBase | null {
  if (!isNonEmptyString(raw.serviceUrl)) return null;
  const conversation = parseConversation(raw.conversation);
  const from = parseChannelAccount(raw.from);
  const recipient = parseChannelAccount(raw.recipient);
  if (!conversation || !from || !recipient) return null;
  const channelData = isObject(raw.channelData) ? raw.channelData : {};
  const tenantId = readNestedString(channelData, ["tenant", "id"]) ?? conversation.tenantId;
  const teamId = readNestedString(channelData, ["team", "id"]);
  const teamsChannelId = readNestedString(channelData, ["channel", "id"]);
  return {
    conversation,
    conversationType: conversation.conversationType,
    from,
    id: isNonEmptyString(raw.id) ? raw.id : "",
    raw,
    recipient,
    serviceUrl: raw.serviceUrl,
    teamId,
    teamsChannelId,
    tenantId,
  };
}

function parseConversation(raw: unknown): TeamsConversation | null {
  if (!isObject(raw) || !isNonEmptyString(raw.id)) return null;
  return {
    conversationType: isNonEmptyString(raw.conversationType) ? raw.conversationType : undefined,
    id: raw.id,
    isGroup: typeof raw.isGroup === "boolean" ? raw.isGroup : undefined,
    name: isNonEmptyString(raw.name) ? raw.name : undefined,
    tenantId: isNonEmptyString(raw.tenantId) ? raw.tenantId : undefined,
  };
}

function parseChannelAccount(raw: unknown): TeamsChannelAccount | null {
  if (!isObject(raw) || !isNonEmptyString(raw.id)) return null;
  return {
    aadObjectId: isNonEmptyString(raw.aadObjectId) ? raw.aadObjectId : undefined,
    id: raw.id,
    name: isNonEmptyString(raw.name) ? raw.name : undefined,
    role: isNonEmptyString(raw.role) ? raw.role : undefined,
  };
}

function parseMentions(raw: unknown): readonly TeamsMention[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamsMention[] = [];
  for (const item of raw) {
    if (!isObject(item) || item.type !== "mention" || !isNonEmptyString(item.text)) continue;
    const mentioned = parseChannelAccount(item.mentioned);
    if (mentioned) out.push({ mentioned, text: item.text, type: "mention" });
  }
  return out;
}

function inferScope(conversation: TeamsConversation): string {
  const t = conversation.conversationType;
  if (t === "personal" || t === "groupChat" || t === "channel") return t;
  if (conversation.isGroup === true) return "groupChat";
  if (conversation.isGroup === false) return "personal";
  return "unknown";
}

function readText(raw: Record<string, unknown>): string {
  return typeof raw.text === "string" ? raw.text : "";
}

function stripBotMention(text: string, mentions: readonly TeamsMention[], recipientId: string): string {
  let out = text;
  for (const m of mentions) {
    if (m.mentioned.id === recipientId) out = out.replace(m.text, "");
  }
  return out.trim();
}

/**
 * Lightweight normalization of Teams message text (the trex divergence from
 * eve's turndown): unwrap `<at>name</at>` mentions to `@name`, strip any
 * remaining HTML tags, and decode the common HTML entities.
 */
function normalizeTeamsText(text: string): string {
  const unwrapped = text.replace(/<at>(.*?)<\/at>/gi, "@$1");
  const detagged = /<\/?[a-z][\s\S]*>/i.test(unwrapped) ? unwrapped.replace(/<[^>]+>/g, "") : unwrapped;
  return decodeHtmlEntities(detagged).trim();
}

function decodeHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY_PATTERN, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m);
}

function readNestedString(obj: Record<string, unknown>, path: readonly string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isObject(cur)) return undefined;
    cur = cur[key];
  }
  return isNonEmptyString(cur) ? cur : undefined;
}

/** Fields the `<teams_context>` block renders. */
export interface TeamsContextInput {
  readonly userId: string;
  readonly userName?: string;
  readonly conversationId: string;
  readonly scope: string;
  readonly conversationType?: string;
  readonly tenantId?: string;
  readonly teamId?: string;
  readonly channelId?: string;
  readonly activityId: string;
}

/** Renders the `<teams_context>` block prepended to the model-facing message (eve's, unchanged). */
export function formatTeamsContextBlock(input: TeamsContextInput): string {
  return [
    "<teams_context>",
    "response_medium: microsoft_teams",
    "response_instructions: Reply for Microsoft Teams in concise Markdown. Avoid broad mentions, large tables, and messages that need more than a few short posts.",
    `user_id: ${input.userId}`,
    ...(input.userName ? [`user_name: ${input.userName}`] : []),
    `conversation_id: ${input.conversationId}`,
    `scope: ${input.scope}`,
    ...(input.conversationType ? [`conversation_type: ${input.conversationType}`] : []),
    ...(input.tenantId ? [`tenant_id: ${input.tenantId}`] : []),
    ...(input.teamId ? [`team_id: ${input.teamId}`] : []),
    ...(input.channelId ? [`channel_id: ${input.channelId}`] : []),
    `activity_id: ${input.activityId}`,
    "</teams_context>",
  ].join("\n");
}
