// The GitHub channel adapter — a thin trex factory over eve's GitHub helpers.
// eve's GitHub helpers split cleanly: `inbound.js`, `api.js`, `limits.js`, and
// `defaultGitHubAuth` are PURE (only `#shared` guards/json + the sibling
// `auth.js`) and are genuinely VENDORED (de-minified) into vendor/github/*; only
// `verify.js` (webhook HMAC) and `auth.js` (the App-JWT mint) use `node:crypto`
// primitives absent in the Deno worker, so those two are REIMPLEMENTED on
// WebCrypto (HMAC-SHA256 for verify; RSASSA-PKCS1-v1_5 SHA-256 for the RS256
// JWT) and labelled honestly. The comment HITL has no eve source (invented for
// trex, like Twilio's SMS HITL). Only the wiring into `defineChannel` (this
// file) plus the signature gate + loop guard is trex glue.
//
// SIGNATURE-BEFORE-SEND (trust boundary): the channel layer serves this route
// WITHOUT the trex JWT — the proxy exempts {basePath}/eve/v1/github/* so an
// unauthenticated GitHub webhook can reach it. GitHub's auth is an HMAC-SHA256
// (hex, `sha256=`) signature over the RAW request body, keyed by
// GITHUB_WEBHOOK_SECRET, echoed in `X-Hub-Signature-256`. That constant-time
// compare is the ONLY thing authenticating the caller, so the route runs
// `verifyGitHubInbound` FIRST and returns 401 (fail-closed on a missing secret)
// BEFORE ever calling `send()` (the only path from a route to an agent session).
//
// LOOP GUARD (required): GitHub delivers the app's OWN comments back as
// `issue_comment` webhooks, so a naive adapter would answer its own comments
// forever. Every inbound comment/event is filtered through
// `isIgnoredGitHubComment` (drops `Bot` authors, the app's own `${botName}[bot]`
// account, and eve's hidden marker) BEFORE any send().
//
// THREAD === SESSION: an issue/PR thread is one agent session, keyed by
// `${owner}/${repo}#${number}` (the continuation token). Replies go back out via
// the GitHub REST API — NOT the webhook response — because agent turns are async:
// the webhook returns an immediate 202 ack and the real comment is posted once
// the turn completes (`message.completed` → `POST /issues/{n}/comments`, split to
// GitHub's 65536-char comment cap). Delivery auth mints a short-lived App JWT
// (RS256) and exchanges it for an installation token used as the Bearer.
//
// HITL: GitHub has no widgets, so `input.requested` → a comment with a Markdown
// checklist + reply-instructions (e.g. "Reply with `/approve`"). The reply
// carries a decision but NO requestId, so the DEFAULT (`defaultGitHubResume`)
// routes it through the channel layer's resume primitive in MODE B (by token,
// single pending): it applies ONLY when the thread has exactly one pending
// approval, else `{ok:false}` and the comment falls through to a normal message
// (nothing dropped). `opts.resume` remains an override with its own store.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";

import { type GitHubWebhookVerifier, verifyGitHubInbound } from "../vendor/github/verify.ts";
import {
  extractGitHubCommentTrigger,
  formatGitHubContextBlock,
  githubContinuationToken,
  type GitHubInboundEvent,
  isIgnoredGitHubComment,
  parseGitHubWebhookEvent,
  shouldDispatchGitHubComment,
} from "../vendor/github/inbound.ts";
import type { GitHubUser } from "../vendor/github/inbound-types.ts";
import type { GitHubApiOptions, GitHubCredentials, GitHubFetch } from "../vendor/github/auth.ts";
import { getEnv } from "../vendor/github/shared.ts";
import { createGitHubIssueComment } from "../vendor/github/api.ts";
import { splitGitHubCommentBody } from "../vendor/github/limits.ts";
import { renderGitHubInputRequest } from "../vendor/github/hitl.ts";
import { defaultGitHubAuth } from "../vendor/github/defaults.ts";

// Per-session GitHub thread routing threaded as the channel session `state` — set
// on send() and read by the delivery (`events`) handlers so REST comments go back
// to the right issue/PR thread.
interface GitHubDeliveryState {
  owner?: string;
  repo?: string;
  number?: number;
}

/** Result of the message hook: how to attribute + shape the turn (or null to ignore). */
export interface GitHubCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
}

/** Context handed to a resume transport for a HITL reply comment. */
export interface GitHubResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  /** Raw channel continuation token (`${owner}/${repo}#${number}`) addressing the parked session. */
  continuationToken: string;
  owner: string;
  repo: string;
  number: number;
  /** The reply comment body verbatim (an integration decodes it against its parked request). */
  body: string;
}

export interface GitHubChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials. Each falls back to `GITHUB_*` env. */
  credentials?: GitHubCredentials & { installationId?: number | string };
  /**
   * The app's GitHub App slug (WITHOUT the `[bot]` suffix). Used for the loop
   * guard (ignore the app's own `${botName}[bot]` comments) and, with
   * `requireMention`, for @-mention gating + stripping.
   */
  botName?: string;
  /** When true (with `botName`), only dispatch comments that @-mention the bot; the mention is stripped. */
  requireMention?: boolean;
  /** REST overrides for tests / non-standard runtimes. */
  api?: GitHubApiOptions;
  /** Caller-supplied inbound verifier (replaces the signature check for upstream-authenticated forwards). */
  webhookVerifier?: GitHubWebhookVerifier;
  /** Message hook: decide auth + extra context, or return null to ignore the message. */
  onCommand?: (event: GitHubInboundEvent) => GitHubCommandResult | null | Promise<GitHubCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: GitHubResumeContext) => void | Promise<void>;
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
// decision and apply it to the thread's SOLE pending approval via the channel
// layer's resume primitive. Returns true when it consumed the comment as an
// approval, false when there is no single pending approval or the comment isn't
// a clear decision — the caller then treats it as an ordinary turn (nothing
// dropped). Never throws. `opts.resume` overrides this entirely.
export async function defaultGitHubResume(ctx: GitHubResumeContext): Promise<boolean> {
  const decision = decodeApprovalDecision(ctx.body);
  if (!decision) return false;
  try {
    const result = await ctx.args.resume(ctx.continuationToken, { decision });
    return result.ok;
  } catch (e) {
    console.error("github: HITL resume failed:", e);
    return false;
  }
}

/** A dispatch candidate distilled from a parsed webhook event, or null to ignore. */
interface DispatchCandidate {
  number: number;
  body: string;
  author: GitHubUser | undefined;
  commentUrl?: string;
  headSha?: string;
  issueNumber: number | null;
  pullRequestNumber: number | null;
  conversationKind: string;
}

/**
 * Distills a parsed webhook event into a dispatch candidate — applying the
 * event/action allow-list. Only `issue_comment.created`,
 * `pull_request_review_comment.created`, `issues.opened`, and
 * `pull_request.opened` start a turn; everything else (edits, closes, pings, CI)
 * returns null. Does NOT apply the loop guard — the caller does.
 */
function toCandidate(event: GitHubInboundEvent): DispatchCandidate | null {
  if (event.kind === "issue_comment") {
    if (event.action !== "created") return null;
    return {
      number: event.comment.issueNumber,
      body: event.comment.body,
      author: event.comment.author,
      commentUrl: event.comment.htmlUrl,
      issueNumber: event.conversation.issueNumber,
      pullRequestNumber: event.conversation.pullRequestNumber,
      conversationKind: event.conversation.kind,
    };
  }
  if (event.kind === "pull_request_review_comment") {
    if (event.action !== "created") return null;
    return {
      number: event.comment.pullRequestNumber,
      body: event.comment.body,
      author: event.comment.author,
      commentUrl: event.comment.htmlUrl,
      headSha: event.headSha ?? undefined,
      issueNumber: null,
      pullRequestNumber: event.comment.pullRequestNumber,
      conversationKind: event.conversation.kind,
    };
  }
  if (event.kind === "issues") {
    if (event.action !== "opened") return null;
    return {
      number: event.issue.issueNumber,
      body: issueBody(event.issue.raw),
      author: event.sender,
      issueNumber: event.issue.issueNumber,
      pullRequestNumber: null,
      conversationKind: event.conversation.kind,
    };
  }
  if (event.kind === "pull_request") {
    if (event.action !== "opened") return null;
    return {
      number: event.pullRequest.pullRequestNumber,
      body: issueBody(event.pullRequest.raw),
      author: event.sender,
      headSha: event.headSha ?? undefined,
      issueNumber: null,
      pullRequestNumber: event.pullRequest.pullRequestNumber,
      conversationKind: event.conversation.kind,
    };
  }
  return null;
}

/** Renders an opened issue/PR body as `title\n\nbody` from its raw payload. */
function issueBody(raw: Record<string, unknown>): string {
  const title = typeof raw.title === "string" ? raw.title : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  return [title, body].filter((s) => s.length > 0).join("\n\n");
}

export function githubChannel(opts: GitHubChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";
  const credentials: GitHubCredentials = {
    appId: opts.credentials?.appId,
    privateKey: opts.credentials?.privateKey,
    webhookSecret: opts.credentials?.webhookSecret,
    installationToken: opts.credentials?.installationToken,
  };
  const installationId = () => opts.credentials?.installationId ?? getEnv("GITHUB_APP_INSTALLATION_ID");

  const stateOf = (channelCtx: unknown): GitHubDeliveryState =>
    ((channelCtx as { state?: GitHubDeliveryState } | undefined)?.state ?? {}) as GitHubDeliveryState;

  // Posts one comment chunk back to the thread via REST (best-effort).
  async function postComment(state: GitHubDeliveryState, body: string) {
    if (!state.owner || !state.repo || state.number === undefined) return;
    await createGitHubIssueComment({
      api: opts.api,
      body,
      credentials,
      installationId: installationId(),
      issueNumber: state.number,
      owner: state.owner,
      repo: state.repo,
    });
  }

  const builtinEvents: ChannelEventHandlers = {
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      if (!state.owner) return;
      try {
        for (const chunk of splitGitHubCommentBody(message)) {
          await postComment(state, chunk);
        }
      } catch (e) {
        console.error("github: message.completed delivery failed:", e);
      }
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      if (!state.owner) return;
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string } }>;
      try {
        for (const item of requests) {
          const toolName = item.action?.toolName ?? "action";
          // trex's input.requested is a tool-approval request; shape an approve/deny
          // request for the vendored renderer (→ a Markdown checklist comment).
          const text = renderGitHubInputRequest({
            requestId: item.requestId,
            prompt: `Approve \`${toolName}\`?`,
            display: "confirmation",
            options: [
              { id: "approve", label: "Approve", style: "primary" },
              { id: "deny", label: "Deny", style: "danger" },
            ],
          });
          for (const chunk of splitGitHubCommentBody(text)) {
            await postComment(state, chunk);
          }
        }
      } catch (e) {
        console.error("github: input.requested delivery failed:", e);
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  // ---- inbound event --------------------------------------------------------

  async function dispatch(event: GitHubInboundEvent, args: ChannelRouteArgs, req: Request) {
    const candidate = toCandidate(event);
    if (candidate === null) return;

    // LOOP GUARD — never start a turn for the app/bot's own content.
    if (isIgnoredGitHubComment(candidate.body, candidate.author, opts.botName)) return;

    const owner = event.repository.owner;
    const repo = event.repository.name;
    const continuationToken = githubContinuationToken(owner, repo, candidate.number);

    // Optional @-mention gating (comments only). When required, drop non-mentions
    // and strip the mention token from the model-facing body.
    let body = candidate.body;
    const isComment = event.kind === "issue_comment" || event.kind === "pull_request_review_comment";
    if (opts.requireMention && opts.botName && isComment) {
      if (!shouldDispatchGitHubComment({ body: candidate.body, author: candidate.author, botName: opts.botName })) return;
      const trigger = extractGitHubCommentTrigger({ body: candidate.body, botName: opts.botName });
      if (trigger) body = trigger.message;
    }

    // A reply-shaped comment could be a HITL answer. GitHub has no distinct
    // interaction surface to tell one apart from a new message, so it is applied
    // ONLY when the thread has a single pending approval (Mode B); otherwise it
    // falls through and is handled as a normal turn (nothing dropped).
    if (isComment && isReplyShaped(candidate.body)) {
      const ctx: GitHubResumeContext = { req, args, continuationToken, owner, repo, number: candidate.number, body: candidate.body };
      if (opts.resume) {
        // An integrator override fully owns the reply (its own pending-request store).
        try {
          await opts.resume(ctx);
        } catch (e) {
          console.error("github: HITL resume failed:", e);
        }
        return;
      }
      if (await defaultGitHubResume(ctx)) return;
    }

    let result: GitHubCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(event) : {};
    } catch (e) {
      console.error("github: message handler failed:", e);
      return;
    }
    if (result === null) return;

    // Nothing to dispatch on an empty body (e.g. an issue opened with no title/body).
    if (body.trim().length === 0) return;

    // Honor an EXPLICIT `{ auth: null }`; only fall back to the default GitHub
    // identity when the hook omits `auth` entirely.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(event, candidate);
    const state: GitHubDeliveryState = { owner, repo, number: candidate.number };
    const contextBlock = formatGitHubContextBlock({
      repository: event.repository,
      sender: event.sender,
      issueNumber: candidate.issueNumber,
      pullRequestNumber: candidate.pullRequestNumber,
      commentUrl: candidate.commentUrl,
      headSha: candidate.headSha,
      deliveryId: event.delivery.id,
    });
    const fullMessage = [contextBlock, ...(result.context ?? []), body].join("\n\n");
    try {
      await args.send(fullMessage, { auth, continuationToken, state, title: firstLine(body) });
    } catch (e) {
      console.error("github: send failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SIGNATURE FIRST — 401 before any parse or send().
        const body = await verifyGitHubInbound(req, {
          webhookSecret: opts.credentials?.webhookSecret,
          webhookVerifier: opts.webhookVerifier,
        });
        if (body === null) return new Response("unauthorized", { status: 401 });

        // 2) parse the delivery. Ping / unsupported (CI) / malformed → 202 ack.
        const event = parseGitHubWebhookEvent({
          body,
          headers: req.headers,
          contentType: req.headers.get("content-type") ?? undefined,
        });
        if (event === null || event.kind === "ping") return ack();

        // 3) dispatch the turn ASYNC (waitUntil) and return an immediate ack —
        //    the real comment reply is delivered later via REST.
        args.waitUntil(dispatch(event, args, req));
        return ack();
      }),
    ],
  });
}

/** The immediate webhook ack — 202, real reply is async via REST. */
function ack(): Response {
  return new Response("accepted", { status: 202 });
}

/** A bare option index / slash command — the only inbound shape treated as a HITL reply. */
function isReplyShaped(body: string): boolean {
  return /^\s*(\/[A-Za-z0-9_-]+|\d+\.?)\s*$/.test(body.trim());
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0].trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

// Maps the vendored GitHub auth context to the layer's ChannelAuth (subject +
// issuer folded into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(event: GitHubInboundEvent, candidate: DispatchCandidate): ChannelAuth {
  const actor = candidate.author ?? event.sender;
  const a = defaultGitHubAuth({
    sender: actor,
    conversation: {
      issueNumber: candidate.issueNumber,
      kind: candidate.conversationKind as "issue" | "pull_request" | "review_thread",
      pullRequestNumber: candidate.pullRequestNumber,
    },
    repository: event.repository,
    delivery: { id: event.delivery.id },
    installationId: event.installationId,
  });
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}), ...(a.subject ? { subject: a.subject } : {}) },
  };
}
