// The Microsoft Teams channel adapter — a thin trex factory over eve's Teams
// helpers. eve's Teams helpers split cleanly into PURE pieces genuinely VENDORED
// into vendor/teams/* (`inbound.ts` — Activity parsing; `api.ts` — the
// client-credentials token + reply delivery + split; `hitl.ts` — the Adaptive
// Card render/derive; `limits.ts`; `defaultTeamsAuth`) and ONE reimplemented
// piece: `verify.ts` (the inbound JWT), because eve validates it with its bundled
// `#compiled/jose` + `#internal/logging`, both absent in the Deno worker. Only
// the wiring into `defineChannel` (this file) is trex glue.
//
// INBOUND AUTH — JWT-BEFORE-SEND (the trust boundary): the channel layer serves
// this route WITHOUT the trex JWT. Teams' only authentication is the Azure Bot
// Framework JWT in `Authorization: Bearer <jwt>` — an RS256 token whose signature
// is verified against the Bot Framework JWKS (fetched from the OpenID metadata,
// cached, refreshed on an unknown `kid`), with `alg:none` and any non-RS256 alg
// REJECTED, and `iss`/`aud`(=MICROSOFT_APP_ID)/`exp`/`nbf` all validated. A weak
// validator here is a total auth bypass, so the route runs `verifyTeamsInbound`
// FIRST and returns 401 (fail closed on a missing app id / unfetchable JWKS /
// unknown kid / any claim mismatch) BEFORE ever calling `send()`.
//
// CONVERSATION === SESSION: one Teams conversation is one agent session, keyed by
// the raw `conversation.id` (the continuation token). Replies go back out via the
// Bot Framework connector REST — NOT the webhook response — because agent turns
// are async: the webhook returns an immediate 200 ack and the real reply Activity
// is POSTed once the turn completes (`message.completed` → reply to
// `${serviceUrl}/v3/conversations/{id}/activities/{activityId}`, split to Teams'
// ~80 KB message cap). Delivery auth is a Bot Framework client-credentials token
// (cached until near expiry) used as the Bearer.
//
// HITL: Teams has rich Adaptive Cards, so `input.requested` → an Adaptive Card
// with `Action.Submit` buttons (vendored `hitl`). The card round-trip (a submit
// Activity carrying `eve_input` → derived responses) IS parsed inbound, but
// applying it requires a token→session resume primitive the channel layer does
// not have yet, so resume is an injectable seam (`opts.resume`); the DEFAULT
// (`defaultTeamsResume`) is a LOUD NO-OP — it warns and drops rather than POSTing
// to a resume route that would 404, identical posture to the prior adapters.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import {
  type TeamsJwksSource,
  type TeamsVerifyOptions,
  type TeamsWebhookVerifier,
  verifyTeamsInbound,
} from "../vendor/teams/verify.ts";
import {
  formatTeamsContextBlock,
  parseTeamsActivity,
  type TeamsActivity,
} from "../vendor/teams/inbound.ts";
import {
  type TeamsApiOptions,
  type TeamsCredential,
  type TeamsCredentials,
  replyToTeamsActivity,
  splitTeamsMessageText,
  teamsContinuationToken,
} from "../vendor/teams/api.ts";
import {
  deriveTeamsInputResponses,
  isTeamsInputResponseActivity,
  renderInputRequestMessage,
  type TeamsInputResponse,
  teamsInvokeResponse,
} from "../vendor/teams/hitl.ts";
import { parseJsonObject } from "../vendor/teams/shared.ts";
import { defaultTeamsAuth } from "../vendor/teams/defaults.ts";

// Per-session Teams routing threaded as the channel session `state` — set on
// send() and read by the delivery (`events`) handlers so replies go back to the
// right conversation + reply-to activity.
interface TeamsDeliveryState {
  serviceUrl?: string;
  conversationId?: string;
  activityId?: string;
  tenantId?: string;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface TeamsCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL card submission. */
export interface TeamsResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  /** Raw channel continuation token (the conversation id) addressing the parked session. */
  continuationToken: string;
  conversationId: string;
  /** The derived input responses (option ids / freeform text) from the card submit. */
  responses: readonly TeamsInputResponse[];
}

export interface TeamsChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `MICROSOFT_*` / `TEAMS_*` env. */
  credentials?: TeamsCredentials;
  /**
   * The bot's app id — the required JWT `aud`. Defaults to `credentials.appId`,
   * else `MICROSOFT_APP_ID` / `TEAMS_APP_ID`.
   */
  appId?: TeamsCredential;
  /**
   * When true (the default), a non-personal (channel/group) message is only
   * dispatched if it @-mentions the bot; personal (1:1) chats always dispatch.
   * Set false to dispatch every message.
   */
  requireMention?: boolean;
  /** REST/token overrides for tests / non-standard runtimes. */
  api?: TeamsApiOptions;
  /** Injected JWKS (tests / upstream key mirrors) — bypasses the network fetch. */
  jwks?: TeamsJwksSource;
  /** OpenID-metadata / JWKS URL overrides. */
  openIdMetadataUrl?: string;
  jwksUrl?: string;
  /** Clock skew tolerance (seconds) for `exp`/`nbf`. Defaults to 300. */
  maxSkewSeconds?: number;
  /** Adaptive Card schema version for HITL cards. Defaults to "1.5". */
  adaptiveCardVersion?: string;
  /** Caller-supplied inbound verifier (replaces the JWT check for upstream-authenticated forwards). */
  webhookVerifier?: TeamsWebhookVerifier;
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (activity: TeamsActivity) => TeamsCommandResult | null | Promise<TeamsCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: TeamsResumeContext) => void | Promise<void>;
}

// DEFAULT resume: a LOUD NO-OP. Identical posture to the prior adapters — the
// channel layer has no token→session resume primitive, so any default action
// would be a dead end. Warn and drop rather than pretend. `opts.resume` is the
// injection seam an integration wires with its own pending-request store.
export function defaultTeamsResume(_ctx: TeamsResumeContext): void {
  console.warn(
    "agents/teams: HITL card response received but no opts.resume provided — the channel layer has no " +
      "token→session resume primitive yet, so this response cannot be applied to the parked request. " +
      "Provide opts.resume to wire Teams Adaptive Card HITL end-to-end.",
  );
}

export function teamsChannel(opts: TeamsChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";

  const verifyOptions: TeamsVerifyOptions = {
    appId: opts.appId ?? opts.credentials?.appId,
    jwks: opts.jwks,
    fetch: opts.api?.fetch,
    openIdMetadataUrl: opts.openIdMetadataUrl,
    jwksUrl: opts.jwksUrl,
    maxSkewSeconds: opts.maxSkewSeconds,
    webhookVerifier: opts.webhookVerifier,
  };

  const stateOf = (channelCtx: unknown): TeamsDeliveryState =>
    ((channelCtx as { state?: TeamsDeliveryState } | undefined)?.state ?? {}) as TeamsDeliveryState;

  // Posts one reply Activity chunk back to the conversation via the connector
  // REST (best-effort). Replies to the inbound activity so the post threads
  // correctly in channels.
  async function postReply(state: TeamsDeliveryState, body: Record<string, unknown>) {
    if (!state.serviceUrl || !state.conversationId || !state.activityId) return;
    await replyToTeamsActivity({
      activityId: state.activityId,
      api: opts.api,
      body: parseJsonObject(body),
      conversationId: state.conversationId,
      credentials: opts.credentials,
      serviceUrl: state.serviceUrl,
    });
  }

  const builtinEvents: ChannelEventHandlers = {
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.serviceUrl) return;
      try {
        for (const chunk of splitTeamsMessageText(message)) {
          await postReply(state, { text: chunk, textFormat: "markdown", type: "message" });
        }
      } catch (e) {
        console.error("teams: message.completed delivery failed:", e);
      }
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.serviceUrl) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string } }>;
      try {
        for (const item of requests) {
          const toolName = item.action?.toolName ?? "action";
          // trex's input.requested is a tool-approval request; shape an approve/deny
          // request for the vendored renderer (→ an Adaptive Card with buttons).
          const card = renderInputRequestMessage({
            requestId: item.requestId,
            prompt: `Approve \`${toolName}\`?`,
            display: "confirmation",
            options: [
              { id: "approve", label: "Approve", style: "primary" },
              { id: "deny", label: "Deny", style: "danger" },
            ],
          }, { adaptiveCardVersion: opts.adaptiveCardVersion });
          await postReply(state, { attachments: card.attachments, text: card.text, type: "message" });
        }
      } catch (e) {
        console.error("teams: input.requested delivery failed:", e);
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  async function runResume(ctx: TeamsResumeContext) {
    try {
      await (opts.resume ?? defaultTeamsResume)(ctx);
    } catch (e) {
      console.error("teams: HITL resume failed:", e);
    }
  }

  // ---- inbound message ------------------------------------------------------

  async function dispatch(activity: TeamsActivity, args: ChannelRouteArgs) {
    // Self-guard: never start a turn for the bot's own account (Bot Framework does
    // not normally echo the bot's own posts, but guard anyway).
    if (activity.from.id === activity.recipient.id) return;

    // In non-personal (channel/group) scopes, only answer when @-mentioned
    // (unless requireMention is explicitly disabled) — matching eve's default
    // and keeping the bot from replying to every channel message.
    const requireMention = opts.requireMention ?? true;
    if (requireMention && activity.scope !== "personal" && !activity.isBotMentioned) return;

    const continuationToken = teamsContinuationToken(activity.conversation.id);

    let result: TeamsCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(activity) : {};
    } catch (e) {
      console.error("teams: message handler failed:", e);
      return;
    }
    if (result === null) return;

    // Nothing to dispatch on an empty message.
    if (activity.text.trim().length === 0) return;

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default Teams
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(activity);
    const state: TeamsDeliveryState = {
      serviceUrl: activity.serviceUrl,
      conversationId: activity.conversation.id,
      activityId: activity.id,
      tenantId: activity.tenantId,
    };
    const contextBlock = formatTeamsContextBlock({
      activityId: activity.id,
      channelId: activity.teamsChannelId,
      conversationId: activity.conversation.id,
      conversationType: activity.conversationType,
      scope: activity.scope,
      teamId: activity.teamId,
      tenantId: activity.tenantId,
      userId: activity.from.id,
      userName: activity.from.name,
    });
    const fullMessage = [contextBlock, ...(result.context ?? []), activity.text].join("\n\n");
    try {
      await args.send(fullMessage, { auth, continuationToken, state, title: firstLine(activity.text) });
    } catch (e) {
      console.error("teams: send failed:", e);
    }
  }

  async function handleInputResponse(activity: TeamsActivity, args: ChannelRouteArgs, req: Request) {
    const responses = deriveTeamsInputResponses(activity);
    if (responses.length === 0) return;
    await runResume({
      req,
      args,
      continuationToken: teamsContinuationToken(activity.conversation.id),
      conversationId: activity.conversation.id,
      responses,
    });
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) JWT FIRST — 401 before any parse or send().
        const body = await verifyTeamsInbound(req, verifyOptions);
        if (body === null) return new Response("unauthorized", { status: 401 });

        // 2) parse the Activity. Malformed / unsupported type → 200 ack.
        let parsed: unknown;
        try {
          parsed = parseJsonObject(JSON.parse(body));
        } catch {
          return ack();
        }
        const activity = parseTeamsActivity(parsed);
        if (activity === null) return ack();

        // 3) a HITL card submission → resume (async), acking with the invoke
        //    response shape for `invoke` activities.
        if (isTeamsInputResponseActivity(activity)) {
          args.waitUntil(handleInputResponse(activity, args, req));
          return activity.type === "invoke" ? Response.json(teamsInvokeResponse()) : ack();
        }

        // 4) a message → dispatch the turn ASYNC (waitUntil); the real reply is
        //    delivered later via the connector REST.
        if (activity.type === "message") {
          args.waitUntil(dispatch(activity, args));
        }
        return ack();
      }),
    ],
  });
}

/** The immediate webhook ack — 200, real reply is async via the connector REST. */
function ack(): Response {
  return new Response("ok", { status: 200 });
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0].trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

// Maps the vendored Teams auth context to the layer's ChannelAuth (subject +
// issuer folded into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(activity: TeamsActivity): ChannelAuth {
  const a = defaultTeamsAuth({
    conversation: { id: activity.conversation.id },
    from: activity.from,
    id: activity.id,
    scope: activity.scope,
    teamId: activity.teamId,
    teamsChannelId: activity.teamsChannelId,
    tenantId: activity.tenantId,
  });
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: {
      ...a.attributes,
      ...(a.issuer ? { issuer: a.issuer } : {}),
      ...(a.subject ? { subject: a.subject } : {}),
    },
  };
}
