// The Twilio (SMS) channel adapter — a thin trex factory over eve's Twilio
// helpers. Because eve ships the actual Twilio verify/REST/parse logic as
// BUNDLED, MINIFIED `#compiled` chunks (the "pure" verify.js/api.js/inbound.js/
// twiml.js are one-line re-exports of those non-vendorable chunks), the
// vendor/twilio/* helpers are REIMPLEMENTED from the minified source and
// labelled honestly; the pure `defaultTwilioAuth` is genuinely vendored, and the
// SMS text HITL has no eve source at all (invented for trex). Only the wiring
// into `defineChannel` (this file) plus the signature gate is trex glue.
//
// SIGNATURE-BEFORE-SEND (trust boundary): the channel layer serves this route
// WITHOUT the trex JWT — the proxy exempts {basePath}/eve/v1/twilio/* so an
// unauthenticated Twilio webhook can reach it. Twilio's auth is an HMAC-SHA1
// (base64) signature over the request URL + form params (sorted, keyed by
// TWILIO_AUTH_TOKEN), echoed in `X-Twilio-Signature`. That constant-time compare
// is the ONLY thing authenticating the caller, so the route runs
// `verifyTwilioInbound` FIRST and returns 401 (fail-closed on a missing token)
// BEFORE ever calling `send()` (the only path from a route to an agent session).
//
// URL RESOLUTION: Twilio signs the PUBLIC webhook URL, which behind a proxy can
// differ from `request.url`. `opts.publicUrl` (string or fn) pins/derives the
// exact URL Twilio hashed; without it we fall back to `request.url`.
//
// CONVERSATION === SESSION: an SMS conversation is one agent session, keyed by
// `${From}:${To}`. The continuation token is that raw pair (the layer namespaces
// it). Replies go back out via the Twilio REST API — NOT the TwiML response —
// because agent turns are async: the webhook returns an immediate empty TwiML
// ack (`<Response/>`) and the real SMS answer is sent once the turn completes
// (`message.completed` → REST Messages.json, split to Twilio's per-request cap).
//
// HITL: SMS has no widgets, so `input.requested` → a numbered PLAIN-TEXT options
// SMS ("Reply with a number …"). The user's reply is a plain SMS, and SMS has NO
// distinct interaction surface to tell a HITL reply apart from a new message, so
// resume is an injectable seam (`opts.resume`): when provided, a reply-shaped
// inbound (a bare option number) is forwarded to it; the integration resolves
// the parked request from its own store keyed by the continuation token. Without
// it the default (`defaultTwilioResume`) is a LOUD NO-OP — it warns and drops the
// approval; it does NOT POST to a resume route that would 404, identical posture
// to discord.ts/slack.ts/telegram.ts. See task-11-report.md.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import {
  type TwilioAuthToken,
  type TwilioWebhookUrl,
  type TwilioWebhookVerifier,
  verifyTwilioInbound,
} from "../vendor/twilio/verify.ts";
import { parseTwilioTextMessage, formatTwilioContextBlock, type TwilioTextMessage } from "../vendor/twilio/inbound.ts";
import {
  type TwilioAccountSid,
  type TwilioFetch,
  sendTwilioMessage,
  splitTwilioMessageBody,
  twilioContinuationToken,
} from "../vendor/twilio/api.ts";
import { emptyTwilioResponse } from "../vendor/twilio/twiml.ts";
import { renderTwilioInputRequest } from "../vendor/twilio/hitl.ts";
import { defaultTwilioAuth } from "../vendor/twilio/defaults.ts";

// Per-session Twilio routing threaded as the channel session `state` — set on
// send() and read by the delivery (`events`) handlers so REST replies go back to
// the right conversation. `from` is the user's number (the reply `To`); `to` is
// our Twilio number (the reply `From`, unless overridden by opts.messaging).
interface TwilioDeliveryState {
  from?: string;
  to?: string;
  messageSid?: string;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface TwilioCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL reply SMS. */
export interface TwilioResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  /** Raw channel continuation token (`${from}:${to}`) addressing the parked session. */
  continuationToken: string;
  from: string;
  to: string;
  /** The reply SMS body verbatim (an integration decodes it against its parked request). */
  body: string;
}

export interface TwilioChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `TWILIO_*` env. */
  credentials?: {
    authToken?: TwilioAuthToken;
    accountSid?: TwilioAccountSid;
    webhookVerifier?: TwilioWebhookVerifier;
  };
  /** The public URL Twilio signed (string or per-request fn). Defaults to request.url. */
  publicUrl?: TwilioWebhookUrl;
  /** Outbound sender config for REST replies. `from` defaults to the inbound `To`. */
  messaging?: {
    from?: string;
    messagingServiceSid?: string;
    statusCallbackUrl?: string;
  };
  /** REST overrides for tests / non-standard runtimes. */
  api?: { fetch?: TwilioFetch; apiBaseUrl?: string };
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (message: TwilioTextMessage) => TwilioCommandResult | null | Promise<TwilioCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: TwilioResumeContext) => void | Promise<void>;
}

/** A bare option index (`"1"`, `"2."`) — the only inbound shape we treat as a HITL reply. */
function isReplyShaped(body: string): boolean {
  return /^\s*\d+\.?\s*$/.test(body);
}

// DEFAULT resume: a LOUD NO-OP. Identical posture to discord.ts/slack.ts/
// telegram.ts — the channel layer has no token→session resume primitive, so any
// default POST would 404. Warn and drop rather than pretend. `opts.resume` is
// the injection seam an integration wires with its own pending-request store.
export function defaultTwilioResume(_ctx: TwilioResumeContext): void {
  console.warn(
    "agents/twilio: HITL reply received but no opts.resume provided — the channel layer has no " +
      "token→session resume primitive yet, so this reply cannot be applied to the parked request. " +
      "Provide opts.resume to wire SMS HITL end-to-end.",
  );
}

export function twilioChannel(opts: TwilioChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";
  const apiOpts = () => ({
    apiBaseUrl: opts.api?.apiBaseUrl,
    credentials: { accountSid: opts.credentials?.accountSid, authToken: opts.credentials?.authToken },
    fetch: opts.api?.fetch,
  });

  const stateOf = (channelCtx: unknown): TwilioDeliveryState =>
    ((channelCtx as { state?: TwilioDeliveryState } | undefined)?.state ?? {}) as TwilioDeliveryState;

  // Sends one SMS chunk back to the conversation via REST. `from` is our Twilio
  // number (the inbound `To`) unless opts.messaging overrides it.
  async function sendReply(state: TwilioDeliveryState, body: string) {
    if (!state.from) return;
    await sendTwilioMessage({
      ...apiOpts(),
      body,
      from: opts.messaging?.from ?? state.to,
      messagingServiceSid: opts.messaging?.messagingServiceSid,
      statusCallbackUrl: opts.messaging?.statusCallbackUrl,
      to: state.from,
    });
  }

  const builtinEvents: ChannelEventHandlers = {
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.from) return;
      for (const chunk of splitTwilioMessageBody(message)) {
        await sendReply(state, chunk);
      }
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.from) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string } }>;
      for (const item of requests) {
        const toolName = item.action?.toolName ?? "action";
        // trex's input.requested is a tool-approval request; shape an approve/deny
        // request for the vendored renderer (→ a numbered plain-text SMS).
        const text = renderTwilioInputRequest({
          requestId: item.requestId,
          prompt: `Approve ${toolName}?`,
          display: "confirmation",
          options: [
            { id: "approve", label: "Approve", style: "primary" },
            { id: "deny", label: "Deny", style: "danger" },
          ],
        });
        // A confirmation body is short, but split defensively so a long tool name
        // can never overrun Twilio's per-request cap.
        for (const chunk of splitTwilioMessageBody(text)) {
          await sendReply(state, chunk);
        }
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  async function runResume(ctx: TwilioResumeContext) {
    try {
      await (opts.resume ?? defaultTwilioResume)(ctx);
    } catch (e) {
      console.error("twilio: HITL resume failed:", e);
    }
  }

  // ---- inbound message ------------------------------------------------------

  async function dispatchText(message: TwilioTextMessage, args: ChannelRouteArgs, req: Request) {
    const continuationToken = twilioContinuationToken(message.from, message.to);

    // A reply-shaped SMS (a bare option number) is a candidate HITL answer. Only
    // route it to resume when a transport is wired — otherwise treat it as an
    // ordinary message so nothing is dropped (SMS cannot reliably distinguish the
    // two). See the HITL note atop this file.
    if (opts.resume && isReplyShaped(message.body)) {
      await runResume({ req, args, continuationToken, from: message.from, to: message.to, body: message.body });
      return;
    }

    let result: TwilioCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(message) : {};
    } catch (e) {
      console.error("twilio: message handler failed:", e);
      return;
    }
    if (result === null) return;

    // No onCommand override + empty body (e.g. media-only MMS) → nothing to dispatch.
    if (!opts.onCommand && message.body.trim().length === 0) return;

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default Twilio
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(message);
    const state: TwilioDeliveryState = { from: message.from, to: message.to, messageSid: message.messageSid };
    const contextBlock = formatTwilioContextBlock({ from: message.from, to: message.to, messageSid: message.messageSid });
    const fullMessage = [contextBlock, ...(result.context ?? []), message.body].join("\n\n");
    try {
      await args.send(fullMessage, { auth, continuationToken, state, title: message.body });
    } catch (e) {
      console.error("twilio: send failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SIGNATURE FIRST — 401 before any parse or send().
        const read = await verifyTwilioInbound(req, {
          authToken: opts.credentials?.authToken,
          webhookUrl: opts.publicUrl,
          webhookVerifier: opts.credentials?.webhookVerifier,
        });
        if (read === null) return new Response("unauthorized", { status: 401 });

        // 2) parse the SMS form. Non-text (status callback / unsupported) → ack.
        const message = parseTwilioTextMessage(read.params);
        if (message === null) return emptyTwilioResponse();

        // 3) dispatch the turn ASYNC (waitUntil) and return the immediate TwiML
        //    ack — the real SMS reply is delivered later via REST.
        args.waitUntil(dispatchText(message, args, req));
        return emptyTwilioResponse();
      }),
    ],
  });
}

// Maps the vendored Twilio auth context to the layer's ChannelAuth (issuer folded
// into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(message: TwilioTextMessage): ChannelAuth {
  const a = defaultTwilioAuth({ channel: "text", from: message.from, to: message.to });
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}) },
  };
}
