// The Linear channel adapter — a thin trex factory over eve's Linear helpers.
//
// COUPLING SURPRISE (see vendor/VENDOR.md): eve@0.19.0's Linear channel is built
// on Linear's **Agent Session** platform (`AgentSessionEvent` webhooks →
// `agentActivityCreate`), NOT the classic Comment/Issue webhook + `commentCreate`
// model this adapter implements (the GitHub-analog the brief prescribes). So only
// the model-agnostic pieces are reused from eve: the webhook signature+timestamp
// verify ALGORITHM (reimplemented on WebCrypto), the credential resolvers
// (`LINEAR_WEBHOOK_SECRET` / `LINEAR_API_KEY`), and the GraphQL transport
// (`callLinearGraphQL`). The inbound parse, the `commentCreate` delivery, the
// HITL comment, and the auth projection are trex-shaped for the comment model.
//
// SIGNATURE-BEFORE-SEND (trust boundary): the channel layer serves this route
// WITHOUT the trex JWT. Linear's auth is an HMAC-SHA256 (lowercase hex)
// signature over the RAW request body, keyed by LINEAR_WEBHOOK_SECRET, echoed in
// `Linear-Signature`, PLUS a `webhookTimestamp` replay window (eve's ~60s). That
// constant-time compare + freshness check is the ONLY thing authenticating the
// caller, so the route runs `verifyLinearInbound` FIRST and returns 401 (fail
// closed on a missing secret) BEFORE ever calling `send()`.
//
// LOOP GUARD (required): Linear echoes the bot's OWN comments back as
// `Comment.create` webhooks, so a naive adapter would answer its own comments
// forever. Every inbound event is filtered through `isIgnoredLinearEvent` (drops
// events authored by the configured `botUserId`, or carrying the trex marker)
// BEFORE any send().
//
// ISSUE THREAD === SESSION: one Linear issue is one agent session, keyed by the
// raw issue id (the continuation token). Replies go back out via the Linear
// GraphQL `commentCreate` mutation — NOT the webhook response — because agent
// turns are async: the webhook returns an immediate 200 ack and the real comment
// is posted once the turn completes (`message.completed` → `commentCreate`, split
// to a conservative comment cap).
//
// HITL: Linear has no widgets, so `input.requested` → a comment with a numbered
// option list + reply-instructions (e.g. "Reply with `/approve`"). The reply
// carries a decision but NO requestId, so the DEFAULT (`defaultLinearResume`)
// routes it through the channel layer's resume primitive in MODE B (by token,
// single pending): it applies ONLY when the issue has exactly one pending
// approval, else `{ok:false}` and the comment falls through to a normal turn
// (nothing dropped). `opts.resume` remains an override with its own store.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import { type LinearWebhookVerifier, verifyLinearInbound } from "../vendor/linear/verify.ts";
import {
  formatLinearContextBlock,
  isIgnoredLinearEvent,
  LINEAR_TREX_MARKER,
  type LinearInboundEvent,
  type LinearIssueRef,
  linearContinuationToken,
  linearIssueBody,
  type LinearUserRef,
  parseLinearWebhookEvent,
  readLinearActor,
  readLinearIssueRef,
} from "../vendor/linear/inbound.ts";
import type { LinearApiOptions, LinearCredentials } from "../vendor/linear/auth.ts";
import { getEnv } from "../vendor/linear/shared.ts";
import { createLinearComment } from "../vendor/linear/api.ts";
import { splitLinearCommentBody } from "../vendor/linear/limits.ts";
import { renderLinearInputRequest } from "../vendor/linear/hitl.ts";
import { defaultLinearAuth } from "../vendor/linear/defaults.ts";

// Per-session Linear routing threaded as the channel session `state` — set on
// send() and read by the delivery (`events`) handlers so comments go back to the
// right issue thread.
interface LinearDeliveryState {
  issueId?: string;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface LinearCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL reply comment. */
export interface LinearResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  /** Raw channel continuation token (the issue id) addressing the parked session. */
  continuationToken: string;
  issueId: string;
  /** The reply comment body verbatim (an integration decodes it against its parked request). */
  body: string;
}

export interface LinearChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `LINEAR_*` env. */
  credentials?: LinearCredentials;
  /**
   * The agent's own Linear user id. Used for the LOOP GUARD — inbound
   * comments/events authored by this id are dropped (Linear echoes the bot's own
   * comments back as `Comment.create` webhooks). Falls back to `LINEAR_BOT_USER_ID`.
   */
  botUserId?: string;
  /** GraphQL overrides for tests / non-standard runtimes. */
  api?: LinearApiOptions;
  /** Replay window (ms) for `webhookTimestamp`. Defaults to eve's 60_000. */
  maxSkewMs?: number;
  /** Caller-supplied inbound verifier (replaces the signature check for upstream-authenticated forwards). */
  webhookVerifier?: LinearWebhookVerifier;
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (event: LinearInboundEvent) => LinearCommandResult | null | Promise<LinearCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: LinearResumeContext) => void | Promise<void>;
}

/**
 * Maps a reply-shaped comment to an approve/deny verb — trex renders approve as
 * option 1 / deny as option 2 and its reply-instructions use `/approve`,
 * `/deny`. Returns null when the comment isn't a clear decision (→ ordinary turn).
 */
function decodeApprovalDecision(body: string): "approve" | "deny" | null {
  const t = body.trim().toLowerCase().replace(/\.$/, "");
  if (t === "1" || t === "approve" || t === "/approve") return "approve";
  if (t === "2" || t === "deny" || t === "/deny") return "deny";
  return null;
}

// DEFAULT resume (Mode B — by token, single pending): decode the reply into a
// decision and apply it to the issue's SOLE pending approval via the channel
// layer's resume primitive. Returns true when it consumed the comment as an
// approval, false when there is no single pending approval or the comment isn't
// a clear decision — the caller then treats it as an ordinary turn (nothing
// dropped). Never throws. `opts.resume` overrides this entirely.
export async function defaultLinearResume(ctx: LinearResumeContext): Promise<boolean> {
  const decision = decodeApprovalDecision(ctx.body);
  if (!decision) return false;
  try {
    const result = await ctx.args.resume(ctx.continuationToken, { decision });
    return result.ok;
  } catch (e) {
    console.error("linear: HITL resume failed:", e);
    return false;
  }
}

/** A dispatch candidate distilled from a parsed webhook event, or null to ignore. */
interface DispatchCandidate {
  issueId: string;
  body: string;
  actor: LinearUserRef | undefined;
  commentId?: string;
  issue?: LinearIssueRef;
}

/**
 * Distills a parsed webhook event into a dispatch candidate — applying the
 * type/action allow-list. Only `Comment.create` and `Issue.create`/`Issue.update`
 * start a turn; everything else (comment edits/removes, other resources) returns
 * null. Does NOT apply the loop guard — the caller does.
 */
function toCandidate(event: LinearInboundEvent): DispatchCandidate | null {
  if (event.type === "Comment") {
    if (event.action !== "create") return null;
    const issueId = typeof event.data.issueId === "string" ? event.data.issueId : undefined;
    const body = typeof event.data.body === "string" ? event.data.body : "";
    if (!issueId) return null;
    return {
      actor: readLinearActor(event),
      body,
      commentId: typeof event.data.id === "string" ? event.data.id : undefined,
      issue: readLinearIssueRef(event.data.issue),
      issueId,
    };
  }
  if (event.type === "Issue") {
    if (event.action !== "create" && event.action !== "update") return null;
    const issueId = typeof event.data.id === "string" ? event.data.id : undefined;
    if (!issueId) return null;
    return {
      actor: readLinearActor(event),
      body: linearIssueBody(event.data),
      issue: readLinearIssueRef(event.data),
      issueId,
    };
  }
  return null;
}

export function linearChannel(opts: LinearChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";
  const botUserId = () => opts.botUserId ?? getEnv("LINEAR_BOT_USER_ID");

  const stateOf = (channelCtx: unknown): LinearDeliveryState =>
    ((channelCtx as { state?: LinearDeliveryState } | undefined)?.state ?? {}) as LinearDeliveryState;

  // Posts one comment chunk back to the issue thread via GraphQL (best-effort).
  // Every outgoing comment carries the hidden LINEAR_TREX_MARKER so Linear's echo
  // of our own comment (a `Comment.create` webhook) is dropped by the loop guard
  // even with NO bot-id configured — the config-free self-loop protection.
  async function postComment(state: LinearDeliveryState, body: string) {
    if (!state.issueId) return;
    const stamped = `${body}\n\n${LINEAR_TREX_MARKER}`;
    await createLinearComment({ api: opts.api, body: stamped, credentials: opts.credentials, issueId: state.issueId });
  }

  const builtinEvents: ChannelEventHandlers = {
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.issueId) return;
      try {
        for (const chunk of splitLinearCommentBody(message)) {
          await postComment(state, chunk);
        }
      } catch (e) {
        console.error("linear: message.completed delivery failed:", e);
      }
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.issueId) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string } }>;
      try {
        for (const item of requests) {
          const toolName = item.action?.toolName ?? "action";
          // trex's input.requested is a tool-approval request; shape an approve/deny
          // request for the renderer (→ a reply-instructions comment).
          const text = renderLinearInputRequest({
            requestId: item.requestId,
            prompt: `Approve \`${toolName}\`?`,
            display: "confirmation",
            options: [
              { id: "approve", label: "Approve", style: "primary" },
              { id: "deny", label: "Deny", style: "danger" },
            ],
          });
          for (const chunk of splitLinearCommentBody(text)) {
            await postComment(state, chunk);
          }
        }
      } catch (e) {
        console.error("linear: input.requested delivery failed:", e);
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  // ---- inbound event --------------------------------------------------------

  async function dispatch(event: LinearInboundEvent, args: ChannelRouteArgs, req: Request) {
    const candidate = toCandidate(event);
    if (candidate === null) return;

    // LOOP GUARD — never start a turn for the bot's own content. Config-free:
    // drops our own marker-stamped comments AND app/agent-token-authored events
    // (data.botActor, no human) even when botUserId is unset.
    if (isIgnoredLinearEvent(event, candidate.body, botUserId())) return;

    const continuationToken = linearContinuationToken(candidate.issueId);
    const isComment = event.type === "Comment";

    // A reply-shaped comment could be a HITL answer. Linear has no distinct
    // interaction surface to tell one apart from a new message, so it is applied
    // ONLY when the issue has a single pending approval (Mode B); otherwise it
    // falls through and is handled as a normal turn (nothing dropped).
    if (isComment && isReplyShaped(candidate.body)) {
      const ctx: LinearResumeContext = { req, args, continuationToken, issueId: candidate.issueId, body: candidate.body };
      if (opts.resume) {
        // An integrator override fully owns the reply (its own pending-request store).
        try {
          await opts.resume(ctx);
        } catch (e) {
          console.error("linear: HITL resume failed:", e);
        }
        return;
      }
      if (await defaultLinearResume(ctx)) return;
    }

    let result: LinearCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(event) : {};
    } catch (e) {
      console.error("linear: message handler failed:", e);
      return;
    }
    if (result === null) return;

    // Nothing to dispatch on an empty body (e.g. an issue with no title/description).
    if (candidate.body.trim().length === 0) return;

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default Linear
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(event, candidate);
    const state: LinearDeliveryState = { issueId: candidate.issueId };
    const contextBlock = formatLinearContextBlock({
      action: event.action,
      commentId: candidate.commentId,
      deliveryId: event.delivery.id,
      issue: candidate.issue,
      issueId: candidate.issueId,
      organizationId: event.organizationId,
      type: event.type,
    });
    const fullMessage = [contextBlock, ...(result.context ?? []), candidate.body].join("\n\n");
    try {
      await args.send(fullMessage, { auth, continuationToken, state, title: firstLine(candidate.body) });
    } catch (e) {
      console.error("linear: send failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SIGNATURE + TIMESTAMP FIRST — 401 before any parse or send().
        const verified = await verifyLinearInbound(req, {
          maxSkewMs: opts.maxSkewMs,
          webhookSecret: opts.credentials?.webhookSecret,
          webhookVerifier: opts.webhookVerifier,
        });
        if (verified === null) return new Response("unauthorized", { status: 401 });

        // 2) parse the delivery (reusing the payload verify already parsed).
        //    Unsupported / malformed → 200 ack.
        const event = parseLinearWebhookEvent({ body: verified.body, headers: req.headers, payload: verified.payload });
        if (event === null) return ack();

        // 3) dispatch the turn ASYNC (waitUntil) and return an immediate ack —
        //    the real comment reply is delivered later via GraphQL.
        args.waitUntil(dispatch(event, args, req));
        return ack();
      }),
    ],
  });
}

/** The immediate webhook ack — 200 (eve's jsonOk), real reply is async via GraphQL. */
function ack(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });
}

/** A bare option index / slash command — the only inbound shape treated as a HITL reply. */
function isReplyShaped(body: string): boolean {
  return /^\s*(\/[A-Za-z0-9_-]+|\d+\.?)\s*$/.test(body.trim());
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0].trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

// Maps the vendored Linear auth context to the layer's ChannelAuth (subject +
// issuer folded into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(event: LinearInboundEvent, candidate: DispatchCandidate): ChannelAuth {
  const a = defaultLinearAuth({
    action: event.action,
    actor: candidate.actor,
    commentId: candidate.commentId,
    deliveryId: event.delivery.id,
    issue: candidate.issue,
    issueId: candidate.issueId,
    organizationId: event.organizationId,
    type: event.type,
  });
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}), ...(a.subject ? { subject: a.subject } : {}) },
  };
}
