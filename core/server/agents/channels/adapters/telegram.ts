// The Telegram channel adapter — a thin trex factory over eve's vendored PURE
// Telegram helpers (vendor/telegram/*): inbound Update parsing, the Bot API
// client (sendMessage/sendChatAction/answerCallbackQuery + 4096-char split),
// and the auth projection are vendored; the HITL inline-keyboard render/decode
// is REIMPLEMENTED (stateless — eve's is coupled to durable channel state, see
// vendor/telegram/hitl.ts). Only the wiring into `defineChannel` (this file)
// plus the secret-token gate is trex code.
//
// SECRET-TOKEN-BEFORE-SEND (trust boundary): the channel layer serves this
// route WITHOUT the trex JWT — the proxy exempts {basePath}/eve/v1/telegram/*
// so an unauthenticated Telegram webhook can reach it (layer.ts's TRUST
// BOUNDARY note). Telegram's auth is NOT HMAC: when you set `secret_token` on
// `setWebhook`, Telegram echoes it in `X-Telegram-Bot-Api-Secret-Token` on
// every request, and that constant-time equality is the ONLY thing
// authenticating the caller. So the route runs `verifyTelegramInbound` FIRST
// and returns 401 (fail-closed on a missing configured secret) BEFORE ever
// calling `send()` (the only path from a route to an agent session).
//
// CHAT === SESSION: a Telegram chat is one agent session. The continuation
// token is the raw `${chatId}` (the layer namespaces it). Replies are posted
// back to that chat via the Bot API.
//
// HITL: `input.requested` → an inline keyboard (approve/deny buttons, vendored
// render); the `callback_query` → derive InputResponses (vendored decode) →
// resume the parked session. The continuation token is the SAME raw `${chatId}`
// the inbound message used for send(), so the channel layer's resume primitive
// (`args.resume`, Task 17) resolves it back to that parked session and applies
// the decision. `opts.resume` remains an injectable override; without it the
// default routes the decoded decision through `args.resume` (a miss is logged,
// never thrown). See task-10-report.md / task-18-report.md.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import {
  type TelegramWebhookSecretToken,
  type TelegramWebhookVerifier,
  verifyTelegramInbound,
} from "../vendor/telegram/verify.ts";
import {
  parseTelegramUpdate,
  type TelegramCallbackQuery,
  type TelegramMessage,
} from "../vendor/telegram/inbound.ts";
import {
  answerTelegramCallbackQuery,
  type TelegramBotToken,
  type TelegramFetch,
  sendTelegramChatAction,
  sendTelegramMessage,
  splitTelegramMessageText,
} from "../vendor/telegram/api.ts";
import { deriveTelegramInputResponse, renderTelegramInputRequest } from "../vendor/telegram/hitl.ts";
import { defaultTelegramAuth } from "../vendor/telegram/defaults.ts";
import { getEnv, type InputResponse } from "../vendor/telegram/shared.ts";

// Per-session Telegram routing threaded as the channel session `state` — set on
// send() and read by the delivery (`events`) handlers to post into the chat.
interface TelegramDeliveryState {
  chatId?: string;
  messageThreadId?: number;
  chatType?: string;
  triggeringUserId?: string | null;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface TelegramCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL callback. */
export interface TelegramResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  chatId: string;
  /** Raw channel continuation token (`${chatId}`) addressing the parked session. */
  continuationToken: string;
  inputResponses: readonly InputResponse[];
  callbackQuery: TelegramCallbackQuery;
}

export interface TelegramChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `TELEGRAM_*` env. */
  credentials?: {
    botToken?: TelegramBotToken;
    webhookSecret?: TelegramWebhookSecretToken;
    webhookVerifier?: TelegramWebhookVerifier;
  };
  /** REST overrides for tests / non-standard runtimes. */
  api?: { fetch?: TelegramFetch; apiBaseUrl?: string };
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (message: TelegramMessage) => TelegramCommandResult | null | Promise<TelegramCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: TelegramResumeContext) => void | Promise<void>;
}

const OK = () => new Response("ok", { status: 200 });

export function telegramChannel(opts: TelegramChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";
  const apiOpts = () => ({
    apiBaseUrl: opts.api?.apiBaseUrl,
    credentials: { botToken: opts.credentials?.botToken },
    fetch: opts.api?.fetch,
  });

  const stateOf = (channelCtx: unknown): TelegramDeliveryState =>
    ((channelCtx as { state?: TelegramDeliveryState } | undefined)?.state ?? {}) as TelegramDeliveryState;

  async function tryTyping(state: TelegramDeliveryState) {
    // Best-effort typing via sendChatAction; requires the bot token and a chat.
    // A failure never affects the turn.
    if (!opts.credentials?.botToken && !getEnv("TELEGRAM_BOT_TOKEN")) return;
    if (!state.chatId) return;
    try {
      await sendTelegramChatAction({
        ...apiOpts(),
        action: "typing",
        chatId: state.chatId,
        messageThreadId: state.messageThreadId,
      });
    } catch (e) {
      console.warn("telegram: typing action failed — swallowed:", e);
    }
  }

  const builtinEvents: ChannelEventHandlers = {
    async "turn.started"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx));
    },
    async "actions.requested"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx));
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.chatId) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string; input?: unknown } }>;
      for (const item of requests) {
        const toolName = item.action?.toolName ?? "action";
        // trex's input.requested is a tool-approval request; shape an
        // approve/deny request for the vendored renderer (→ inline keyboard).
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
        const rendered = renderTelegramInputRequest(request);
        await sendTelegramMessage({
          ...apiOpts(),
          chatId: state.chatId,
          body: {
            text: rendered.text,
            message_thread_id: state.messageThreadId,
            reply_markup: rendered.replyMarkup,
          },
        });
      }
    },
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string; finishReason?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.chatId) return;
      for (const chunk of splitTelegramMessageText(message)) {
        await sendTelegramMessage({
          ...apiOpts(),
          chatId: state.chatId,
          body: { text: chunk, message_thread_id: state.messageThreadId },
        });
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  // ---- inbound message ------------------------------------------------------

  async function handleMessage(message: TelegramMessage, args: ChannelRouteArgs): Promise<Response> {
    // Never react to the bot's own messages (avoids self-dispatch loops).
    if (message.from?.isBot === true) return OK();

    let result: TelegramCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(message) : {};
    } catch (e) {
      console.error("telegram: message handler failed:", e);
      return OK();
    }
    if (result === null) return OK();

    const text = message.text || message.caption;
    // No onCommand override + empty text/caption → nothing to dispatch.
    if (!opts.onCommand && text.trim().length === 0) return OK();

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default Telegram
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(message);
    const state: TelegramDeliveryState = {
      chatId: message.chat.id,
      messageThreadId: message.messageThreadId,
      chatType: message.chat.type,
      triggeringUserId: message.from?.id ?? null,
    };
    const fullMessage = [...(result.context ?? []), text].join("\n\n");
    await args.send(fullMessage, {
      auth,
      continuationToken: message.chat.id,
      state,
      title: text,
    });
    return OK();
  }

  // ---- callback_query (HITL inline-keyboard answers) ------------------------

  async function handleCallbackQuery(query: TelegramCallbackQuery, args: ChannelRouteArgs, req: Request): Promise<Response> {
    const response = deriveTelegramInputResponse(query.data);
    // Best-effort: clear the client-side loading spinner on the button.
    await acknowledgeCallback(query).catch((e) => console.warn("telegram: answerCallbackQuery failed — swallowed:", e));

    if (response === null) return OK();
    const chatId = query.message?.chat.id;
    if (!chatId) return OK();
    await runResume({
      req,
      args,
      chatId,
      continuationToken: chatId,
      inputResponses: [response],
      callbackQuery: query,
    });
    return OK();
  }

  async function acknowledgeCallback(query: TelegramCallbackQuery) {
    if (!opts.credentials?.botToken && !getEnv("TELEGRAM_BOT_TOKEN")) return;
    await answerTelegramCallbackQuery({ ...apiOpts(), callbackQueryId: query.id, text: "Answer received." });
  }

  async function runResume(ctx: TelegramResumeContext) {
    try {
      if (opts.resume) {
        // An integrator override fully owns applying the decision.
        await opts.resume(ctx);
        return;
      }
      // DEFAULT: apply the decoded decision to the parked session via the channel
      // layer's resume primitive. `ctx.continuationToken` is the SAME raw
      // `${chatId}` the inbound message used for send(), so the layer resolves it
      // to that session. A miss returns `{ok:false}` (logged, never thrown); the
      // answerCallbackQuery ACK is issued by the caller regardless.
      const result = await ctx.args.resume(ctx.continuationToken, {
        inputResponses: ctx.inputResponses.map((r) => ({ requestId: r.requestId, optionId: r.optionId })),
      });
      if (!result.ok) {
        console.warn(`agents/telegram: HITL resume did not apply the decision: ${result.error ?? "unknown error"}`);
      }
    } catch (e) {
      console.error("telegram: HITL resume failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SECRET TOKEN FIRST — 401 before any parse or send().
        const rawBody = await verifyTelegramInbound(req, opts.credentials);
        if (rawBody === null) return new Response("unauthorized", { status: 401 });

        // 2) parse the Update.
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return OK();
        }
        const update = parseTelegramUpdate(payload);
        if (update === null) return OK();

        // 3) dispatch.
        if (update.kind === "message") return handleMessage(update.message, args);
        return handleCallbackQuery(update.callbackQuery, args, req);
      }),
    ],
  });
}

// Maps the vendored Telegram auth context to the layer's ChannelAuth (issuer
// folded into attributes; principalType widens to the ChannelAuth union). Null
// when the message carries no identifiable sender.
function toChannelAuth(message: TelegramMessage): ChannelAuth | null {
  const a = defaultTelegramAuth(message);
  if (!a) return null;
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}) },
  };
}
