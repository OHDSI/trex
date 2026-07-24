// The Slack channel adapter — a thin trex factory over eve's vendored PURE Slack
// helpers (vendor/slack/*): Block Kit HITL render/decode, event-envelope parse,
// interactivity-payload parse, auth-context derivation, and form encoding are
// all vendored; only the wiring into `defineChannel` (this file) plus the
// signing-secret HMAC verify and the minimal web-API client are trex code
// (eve's Slack verify + api modules delegate to non-vendorable
// `#compiled/@chat-adapter` runtime primitives — see vendor/VENDOR.md).
//
// SIGNATURE-BEFORE-SEND (trust boundary): the channel layer serves this route
// WITHOUT the trex JWT — the proxy exempts {basePath}/eve/v1/slack/* so an
// unauthenticated Slack webhook can reach it (layer.ts's TRUST BOUNDARY note).
// The ONLY thing authenticating the caller is the Slack signing-secret HMAC, so
// the route runs `verifySlackInbound` FIRST and returns 401 on failure BEFORE
// ever calling `send()` (the only path from a route to an agent session). Even
// Slack's `url_verification` challenge is echoed only AFTER the signature check.
//
// THREAD === SESSION: a Slack thread (`channel + thread_ts`) is one agent
// session. The continuation token is the raw `${channel}:${thread_ts}` (the
// layer namespaces it). Replies are posted back into that thread.
//
// HITL: `input.requested` → Block Kit buttons/select (vendored render); the
// interactivity callback → derive InputResponses (vendored) → resume the parked
// session. The continuation token is the SAME `${channel}:${thread_ts}` the
// inbound message used for send(), so the channel layer's resume primitive
// (`args.resume`, Task 17) resolves it back to that parked session and applies
// the decision. `opts.resume` remains an injectable override; without it the
// default routes the decoded decision through `args.resume` (a miss is logged,
// never thrown). See task-9-report.md / task-18-report.md.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import { verifySlackInbound } from "../vendor/slack/verify.ts";
import type { SlackSigningSecret, SlackWebhookVerifier } from "../vendor/slack/verify.ts";
import {
  callSlackApi,
  openSlackView,
  postSlackMessage,
  type SlackFetch,
  slackContinuationToken,
  splitSlackMessageText,
  updateSlackMessage,
} from "../vendor/slack/api.ts";
import { parseAppMentionEvent, parseDirectMessageEvent, parseThreadMessageEvent, type SlackMessage } from "../vendor/slack/inbound.ts";
import {
  parseBlockActionsPayload,
  type ParsedBlockActionsPayload,
  parseViewSubmission,
} from "../vendor/slack/interactions.ts";
import {
  buildAnsweredBlocks,
  buildFreeformModalView,
  deriveHitlResponse,
  formatInputRequestFallbackText,
  freeformRequestIdFromActionId,
  HITL_FREEFORM_MODAL_ACTION_ID,
  HITL_FREEFORM_MODAL_BLOCK_ID,
  HITL_FREEFORM_MODAL_CALLBACK_ID,
  isFreeformAction,
  isHitlAction,
  renderInputRequestBlocks,
} from "../vendor/slack/hitl.ts";
import { buildSlackAuthContext } from "../vendor/slack/auth.ts";
import { decodeSlackApiBody } from "../vendor/slack/api-encoding.ts";
import { getEnv, type InputResponse } from "../vendor/slack/shared.ts";
import { channelAllows, envAllowList } from "../allow.ts";
import type { ChannelAllowList } from "../types.ts";

// Per-session Slack routing threaded as the channel session `state` — set on
// send() and read by the delivery (`events`) handlers to post into the thread.
interface SlackDeliveryState {
  channelId?: string;
  threadTs?: string;
  teamId?: string | null;
  triggeringUserId?: string | null;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface SlackCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL callback. */
export interface SlackResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  channelId: string;
  threadTs: string;
  /** Raw channel continuation token (`<channelId>:<threadTs>`) addressing the parked session. */
  continuationToken: string;
  inputResponses: readonly InputResponse[];
  interaction: unknown;
}

export type SlackAllowFn = (id: { userId?: string; conversationId?: string }) => boolean | Promise<boolean>;

export interface SlackChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `SLACK_*` env. */
  credentials?: {
    signingSecret?: SlackSigningSecret;
    botToken?: string | (() => string | Promise<string>);
    webhookVerifier?: SlackWebhookVerifier;
  };
  /** REST overrides for tests / non-standard runtimes. */
  api?: { fetch?: SlackFetch; apiBaseUrl?: string };
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (message: SlackMessage) => SlackCommandResult | null | Promise<SlackCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: SlackResumeContext) => void | Promise<void>;
  /** Inbound allow-list: a static list (default: SLACK_ALLOWED_USERS/_CHANNELS env) or an async callback. A miss is acked silently. */
  allow?: ChannelAllowList | SlackAllowFn;
  /**
   * Whether the agent responds in direct messages. Default false: DM work
   * bypasses team visibility, and each top-level DM message starts its own
   * disconnected session (no thread context). DM messages are acked and
   * dropped silently; channel @mentions are unaffected.
   */
  directMessages?: boolean;
  /**
   * Thread-following: once the agent has a session for a thread (someone
   * @mentioned it there), every human reply in that thread becomes a turn —
   * no re-mentioning. JOIN-ONLY: a thread reply never creates a session
   * (args.hasSession gates dispatch), so ordinary channel chatter stays
   * ignored. Requires the Slack app to subscribe to `message.channels`
   * (+ `message.groups` for private channels) with `channels:history`.
   */
  threads?: boolean;
}

const OK = () => new Response("ok", { status: 200 });

export function slackChannel(opts: SlackChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";
  const apiOpts = () => ({
    apiBaseUrl: opts.api?.apiBaseUrl,
    credentials: { botToken: opts.credentials?.botToken },
    fetch: opts.api?.fetch,
  });

  const allowOpt = opts.allow;
  async function allowed(id: { userId?: string; conversationId?: string }): Promise<boolean> {
    if (typeof allowOpt === "function") {
      try {
        return await allowOpt(id);
      } catch (e) {
        console.warn("slack: allow callback failed — denying:", e);
        return false;
      }
    }
    return channelAllows(allowOpt ?? envAllowList("SLACK"), id);
  }

  const stateOf = (channelCtx: unknown): SlackDeliveryState =>
    ((channelCtx as { state?: SlackDeliveryState } | undefined)?.state ?? {}) as SlackDeliveryState;

  async function tryTyping(state: SlackDeliveryState, status: string) {
    // Best-effort typing via assistant.threads.setStatus; requires the bot token
    // and a live thread. A failure never affects the turn.
    if (!opts.credentials?.botToken && !getEnv("SLACK_BOT_TOKEN")) return;
    if (!state.channelId || !state.threadTs) return;
    try {
      // assistant.threads.setStatus is best-effort typing feedback.
      await callSlackApi({
        operation: "assistant.threads.setStatus",
        body: { channel_id: state.channelId, thread_ts: state.threadTs, status },
        botToken: opts.credentials?.botToken,
        apiBaseUrl: opts.api?.apiBaseUrl,
        fetch: opts.api?.fetch,
      });
    } catch (e) {
      console.warn("slack: typing status failed — swallowed:", e);
    }
  }

  const builtinEvents: ChannelEventHandlers = {
    async "turn.started"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx), "Working...");
    },
    async "actions.requested"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx), "Working...");
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.channelId) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string; input?: unknown } }>;
      for (const item of requests) {
        const toolName = item.action?.toolName ?? "action";
        // trex's input.requested is a tool-approval request; shape an approve/deny
        // request for the vendored renderer (→ approve/deny buttons).
        const request = {
          requestId: item.requestId,
          prompt: `Approve \`${toolName}\`?`,
          action: item.action,
          display: "confirmation" as const,
          options: [
            { id: "approve", label: "Approve", style: "primary" as const },
            { id: "deny", label: "Deny", style: "danger" as const },
          ],
        };
        const blocks = renderInputRequestBlocks(request);
        await postSlackMessage({
          ...apiOpts(),
          channelId: state.channelId,
          threadTs: state.threadTs,
          blocks,
          text: formatInputRequestFallbackText(request),
        });
      }
    },
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string; finishReason?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.channelId) return;
      for (const chunk of splitSlackMessageText(message)) {
        await postSlackMessage({ ...apiOpts(), channelId: state.channelId, threadTs: state.threadTs, text: chunk });
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  // ---- inbound message (Events API) ---------------------------------------

  async function handleMessage(message: SlackMessage, args: ChannelRouteArgs): Promise<Response> {
    if (!(await allowed({ userId: message.author?.userId, conversationId: message.channelId }))) return OK();
    let result: SlackCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(message) : {};
    } catch (e) {
      console.error("slack: message handler failed:", e);
      return OK();
    }
    if (result === null) return OK();

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default Slack
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(message);
    const fullMessage = [...(result.context ?? []), message.text].join("\n\n");
    const state: SlackDeliveryState = {
      channelId: message.channelId,
      threadTs: message.threadTs,
      teamId: message.teamId ?? null,
      triggeringUserId: message.author?.userId ?? null,
    };
    await args.send(fullMessage, {
      auth,
      continuationToken: slackContinuationToken(message.channelId, message.threadTs),
      state,
      title: message.text,
    });
    return OK();
  }

  // ---- interactivity (block_actions / view_submission) --------------------

  async function handleInteraction(payload: Record<string, unknown>, args: ChannelRouteArgs, req: Request): Promise<Response> {
    if (payload.type === "view_submission") return handleViewSubmission(payload, args, req);

    const parsed = parseBlockActionsPayload(payload);
    if (!parsed) return OK();

    const actorId = (payload.user as { id?: string } | undefined)?.id;
    if (!(await allowed({ userId: actorId, conversationId: parsed.channelId }))) return OK();

    // Freeform "Type your answer" click → open a modal (trigger_id is short-lived,
    // so this runs inline, not under waitUntil).
    const freeform = parsed.actions.find((a) => isFreeformAction(a.actionId));
    if (freeform) {
      await openFreeformModal(payload, parsed, freeform.actionId).catch((e) => console.warn("slack: views.open failed — swallowed:", e));
      return OK();
    }

    const inputResponses = parsed.actions.map(deriveHitlResponse).filter((r): r is NonNullable<typeof r> => r !== null);
    if (inputResponses.length > 0) {
      await runResume({
        req,
        args,
        channelId: parsed.channelId,
        threadTs: parsed.threadTs,
        continuationToken: slackContinuationToken(parsed.channelId, parsed.threadTs),
        inputResponses,
        interaction: payload,
      });
      // Best-effort: strip the interactive controls off the answered card.
      await updateAnsweredCard(parsed).catch((e) => console.warn("slack: answered-card update failed — swallowed:", e));
    }
    return OK();
  }

  async function handleViewSubmission(payload: Record<string, unknown>, args: ChannelRouteArgs, req: Request): Promise<Response> {
    const view = parseViewSubmission(payload);
    if (!view || view.callbackId !== HITL_FREEFORM_MODAL_CALLBACK_ID) return new Response(null, { status: 200 });
    let meta: { continuationToken?: string; channelId?: string; threadTs?: string; requestId?: string };
    try {
      meta = JSON.parse(view.privateMetadata || "{}");
    } catch {
      return new Response(null, { status: 200 });
    }
    const text = view.values.find((v) => v.blockId === HITL_FREEFORM_MODAL_BLOCK_ID && v.actionId === HITL_FREEFORM_MODAL_ACTION_ID)?.value ?? "";
    if (!meta.continuationToken || !meta.requestId || text.length === 0) return new Response(null, { status: 200 });
    // The channel comes from the modal's server-written metadata (set by
    // openFreeformModal), not the payload — view_submission carries no channel,
    // and the request already passed signature verification.
    const actorId = (payload.user as { id?: string } | undefined)?.id;
    if (!(await allowed({ userId: actorId, conversationId: meta.channelId }))) return new Response(null, { status: 200 });
    await runResume({
      req,
      args,
      channelId: meta.channelId ?? "",
      threadTs: meta.threadTs ?? "",
      continuationToken: meta.continuationToken,
      inputResponses: [{ requestId: meta.requestId, text }],
      interaction: payload,
    });
    return new Response(null, { status: 200 });
  }

  async function openFreeformModal(payload: Record<string, unknown>, parsed: ParsedBlockActionsPayload, actionId: string) {
    const triggerId = payload.trigger_id;
    if (typeof triggerId !== "string" || triggerId.length === 0) return;
    const requestId = freeformRequestIdFromActionId(actionId);
    if (!requestId) return;
    const action = parsed.actions.find((a) => a.actionId === actionId);
    const messageTs = action?.messageTs;
    if (!messageTs) return;
    const view = buildFreeformModalView({
      metadata: {
        continuationToken: slackContinuationToken(parsed.channelId, parsed.threadTs),
        channelId: parsed.channelId,
        threadTs: parsed.threadTs,
        messageTs,
        requestId,
      },
    });
    await openSlackView({ ...apiOpts(), triggerId, view });
  }

  async function updateAnsweredCard(parsed: ParsedBlockActionsPayload) {
    const action = parsed.actions.find((a) => isHitlAction(a.actionId));
    if (!action?.messageTs) return;
    const answer = action.label ?? action.selectedOptionValue ?? action.value;
    if (!answer) return;
    const promptBlocks = findPromptBlocks(parsed.messageBlocks);
    const blocks = buildAnsweredBlocks({ promptBlocks, answerLabel: answer, userId: action.user.id });
    await updateSlackMessage({ ...apiOpts(), channelId: parsed.channelId, ts: action.messageTs, blocks, text: `Answered: ${answer}` });
  }

  async function runResume(ctx: SlackResumeContext) {
    try {
      if (opts.resume) {
        // An integrator override fully owns applying the decision.
        await opts.resume(ctx);
        return;
      }
      // DEFAULT: apply the decoded decision to the parked session via the channel
      // layer's resume primitive. `ctx.continuationToken` is the SAME
      // `${channel}:${thread_ts}` the inbound message used for send(), so the layer
      // resolves it to that session. A miss returns `{ok:false}` (logged, never
      // thrown); the interactivity ACK is returned by the caller regardless.
      const result = await ctx.args.resume(ctx.continuationToken, {
        inputResponses: ctx.inputResponses.map((r) => ({ requestId: r.requestId, optionId: r.optionId })),
      });
      if (!result.ok) {
        console.warn(`agents/slack: HITL resume did not apply the decision: ${result.error ?? "unknown error"}`);
      }
    } catch (e) {
      console.error("slack: HITL resume failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SIGNATURE FIRST — 401 before any parse or send().
        const rawBody = await verifySlackInbound(req, opts.credentials);
        if (rawBody === null) return new Response("unauthorized", { status: 401 });

        const contentType = req.headers.get("content-type");

        // 2a) interactivity + slash commands arrive form-encoded.
        if (contentType?.includes("application/x-www-form-urlencoded")) {
          const decoded = decodeSlackApiBody(rawBody, contentType);
          const payload = (decoded as { payload?: unknown })?.payload;
          if (payload && typeof payload === "object") {
            return handleInteraction(payload as Record<string, unknown>, args, req);
          }
          return OK(); // slash command / unrecognized form body — ack, no session
        }

        // 2b) Events API (JSON).
        let envelope: Record<string, unknown>;
        try {
          envelope = JSON.parse(rawBody);
        } catch {
          return OK();
        }
        // url_verification handshake — echo the challenge (AFTER signature verify).
        if (envelope.type === "url_verification") {
          return new Response(String(envelope.challenge ?? ""), { status: 200, headers: { "content-type": "text/plain" } });
        }
        if (envelope.type === "event_callback") {
          // DMs are off by default (see SlackChannelOptions.directMessages).
          const message = parseAppMentionEvent(envelope as never) ??
            (opts.directMessages === true ? parseDirectMessageEvent(envelope as never) : null);
          if (message) return handleMessage(message, args);
          // Thread-following (opts.threads): a plain human reply inside a
          // thread reaches the agent ONLY when a session for that thread
          // already exists — join-only, never session-creating, so ordinary
          // channel chatter stays ignored.
          if (opts.threads === true) {
            const threadMsg = parseThreadMessageEvent(envelope as never);
            if (threadMsg && await args.hasSession(slackContinuationToken(threadMsg.channelId, threadMsg.threadTs))) {
              return handleMessage(threadMsg, args);
            }
          }
          return OK();
        }
        return OK();
      }),
    ],
  });
}

function findPromptBlocks(blocks: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const b of blocks) {
    if (typeof b !== "object" || !b) continue;
    const type = (b as { type?: string }).type;
    if (type === "actions") break;
    if (type === "section" || type === "context" || type === "divider" || type === "image") out.push(b);
  }
  return out;
}

// Maps the vendored Slack auth context to the layer's ChannelAuth (issuer folded
// into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(message: SlackMessage): ChannelAuth {
  const a = buildSlackAuthContext({
    channelId: message.channelId,
    threadTs: message.threadTs,
    userId: message.author?.userId ?? "",
    userName: message.author?.userName,
    fullName: message.author?.fullName,
    isBot: message.author?.isBot,
    teamId: message.teamId,
  });
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}) },
  };
}
