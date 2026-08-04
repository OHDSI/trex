// Vendored from eve@0.19.0 dist/src/public/channels/github/inbound.js
// (Apache-2.0), de-minified. eve's `inbound.js` is PURE — its only imports are
// `#shared/guards` (isObject) and `#shared/json` (parseJsonObject), both
// consolidated into the sibling `shared.ts`, so no eve import survives.
// Modified: (1) the CI event parsers (`check_suite`/`check_run`/`workflow_run`)
// are DROPPED — the trex factory handles only issue/PR/comment events, so those
// deliveries parse to null (YAGNI); (2) `isIgnoredGitHubComment` is EXPORTED as
// the factory's loop guard (eve kept it private); (3) `githubContinuationToken`
// is trex-shaped as `${owner}/${repo}#${number}` (a human-readable thread key the
// adapter owns) instead of eve's numeric `repo:{id}:issue:{n}` form. The webhook
// classification, payload normalization, mention-trigger extraction, and
// bot/self-comment ignore rules are eve's, unchanged. See vendor/VENDOR.md.

import { isObject, type JsonObject, parseJsonObject } from "./shared.ts";
import type {
  GitHubCommentTrigger,
  GitHubConversationRef,
  GitHubDelivery,
  GitHubInboundEvent,
  GitHubIssueComment,
  GitHubIssueCommentEvent,
  GitHubIssueWebhookEvent,
  GitHubPingEvent,
  GitHubPullRequestReviewComment,
  GitHubPullRequestReviewCommentEvent,
  GitHubPullRequestWebhookEvent,
  GitHubRepositoryRef,
  GitHubUser,
} from "./inbound-types.ts";

/** Raw inbound webhook the parser consumes: the raw body + request headers. */
export interface GitHubWebhookInput {
  readonly body: string;
  readonly headers: Headers;
  readonly contentType?: string;
}

/**
 * Composite continuation token addressing one issue/PR thread as one session,
 * `${owner}/${repo}#${number}`. Trex-shaped (human-readable) — the runtime
 * namespaces it with the channel id.
 */
export function githubContinuationToken(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}

/**
 * Decides whether an inbound comment should ignore-and-drop rather than start a
 * turn — the LOOP GUARD. True when the comment carries eve's own hidden marker,
 * is authored by a `Bot`, or is authored by the app's own `${botName}[bot]`
 * account. Without this the agent would reply to its own comments forever.
 */
export function isIgnoredGitHubComment(body: string, author: GitHubUser | undefined, botName?: string): boolean {
  if (body.includes("<!-- eve:github:")) return true;
  if (author === undefined) return false;
  if (author.type === "Bot") return true;
  const self = botName ? `${botName}[bot]`.toLowerCase() : "";
  return self.length > 0 && author.login.toLowerCase() === self;
}

/**
 * Extracts a `@botName` mention trigger from a comment body, returning the
 * message with the mention stripped, or null when the bot is not mentioned.
 */
export function extractGitHubCommentTrigger(input: {
  readonly body: string;
  readonly botName?: string;
}): GitHubCommentTrigger | null {
  const name = input.botName?.trim();
  if (!name) return null;
  const match = new RegExp(`@${escapeRegExp(name)}(?=$|[^A-Za-z0-9_-])`, "iu").exec(input.body);
  if (match === null) return null;
  const start = match.index;
  const end = start + match[0].length;
  return { kind: "mention", message: `${input.body.slice(0, start)}${input.body.slice(end)}`.trim(), token: match[0] };
}

/**
 * True when a comment should start a turn: not ignored (loop guard) AND it
 * mentions the bot. Requires `botName`; without one it never dispatches (eve's
 * mention-gated default).
 */
export function shouldDispatchGitHubComment(input: {
  readonly body: string;
  readonly author: GitHubUser | undefined;
  readonly botName?: string;
}): boolean {
  if (isIgnoredGitHubComment(input.body, input.author, input.botName)) return false;
  return extractGitHubCommentTrigger({ body: input.body, botName: input.botName }) !== null;
}

/** Identity + response guidance for the model-visible context block. */
export interface GitHubContextInput {
  readonly repository: GitHubRepositoryRef;
  readonly sender: GitHubUser;
  readonly issueNumber?: number | null;
  readonly pullRequestNumber?: number | null;
  readonly commentUrl?: string;
  readonly headSha?: string;
  readonly deliveryId: string;
}

/** Renders one `<github_context>` block with repository/thread/sender identity. */
export function formatGitHubContextBlock(context: GitHubContextInput): string {
  return [
    "<github_context>",
    `repository: ${context.repository.fullName}`,
    `repository_id: ${context.repository.id}`,
    ...(context.issueNumber !== undefined && context.issueNumber !== null ? [`issue_number: ${context.issueNumber}`] : []),
    ...(context.pullRequestNumber !== undefined && context.pullRequestNumber !== null
      ? [`pull_request_number: ${context.pullRequestNumber}`]
      : []),
    `sender: ${context.sender.login}`,
    `sender_type: ${context.sender.type}`,
    ...(context.commentUrl ? [`comment_url: ${context.commentUrl}`] : []),
    ...(context.headSha ? [`head_sha: ${context.headSha}`] : []),
    `delivery_id: ${context.deliveryId}`,
    "</github_context>",
  ].join("\n");
}

/**
 * Parses a raw GitHub webhook delivery into a normalized event, or null when the
 * payload is unsupported (a CI delivery, malformed, or missing repository/sender).
 * The event name comes from `X-GitHub-Event` (falling back to payload shape).
 */
export function parseGitHubWebhookEvent(input: GitHubWebhookInput): GitHubInboundEvent | null {
  const raw = decodePayload(input.body, input.contentType);
  const event = readHeader(input.headers, "x-github-event") ?? inferGitHubWebhookEventName(raw);
  if (event === null) return null;
  const repository = normalizeRepository(raw.repository);
  const sender = normalizeUser(raw.sender);
  if (repository === null || sender === undefined) return null;
  const base: GitHubInboundEventBaseRaw = {
    delivery: {
      event,
      hookId: readHeader(input.headers, "x-github-hook-id") ?? readGitHubHookId(raw),
      id: readHeader(input.headers, "x-github-delivery") ?? inferGitHubDeliveryId(event, raw),
    },
    installationId: readInstallationId(raw.installation),
    raw,
    repository,
    sender,
  };
  if (event === "ping") return { ...base, kind: "ping" } as GitHubPingEvent;
  if (event === "issue_comment") return parseIssueCommentEvent(base);
  if (event === "pull_request_review_comment") return parsePullRequestReviewCommentEvent(base);
  if (event === "issues") return parseIssueEvent(base);
  if (event === "pull_request") return parsePullRequestEvent(base);
  return null;
}

interface GitHubInboundEventBaseRaw {
  readonly delivery: GitHubDelivery;
  readonly installationId: number | undefined;
  readonly raw: JsonObject;
  readonly repository: GitHubRepositoryRef;
  readonly sender: GitHubUser;
}

function inferGitHubWebhookEventName(raw: JsonObject): string | null {
  if (isObject(raw.hook) && typeof raw.zen === "string") return "ping";
  if (isObject(raw.comment) && isObject(raw.issue)) return "issue_comment";
  if (isObject(raw.comment) && isObject(raw.pull_request)) return "pull_request_review_comment";
  if (isObject(raw.issue)) return "issues";
  if (isObject(raw.pull_request) && !isObject(raw.review)) return "pull_request";
  return null;
}

function inferGitHubDeliveryId(event: string, raw: JsonObject): string {
  const id = readObjectNumber(raw.comment, "id") ??
    readObjectNumber(raw.issue, "id") ??
    readObjectNumber(raw.issue, "number") ??
    readObjectNumber(raw.pull_request, "id") ??
    readObjectNumber(raw.pull_request, "number") ??
    readObjectNumber(raw.hook, "id") ??
    "unknown";
  return `inferred:${event}:${id}:${readAction(raw) || "unknown"}`;
}

function readHeader(headers: Headers, name: string): string | undefined {
  const v = headers.get(name)?.trim();
  return v && v.length > 0 ? v : undefined;
}

function parseIssueCommentEvent(base: GitHubInboundEventBaseRaw): GitHubIssueCommentEvent | null {
  const issue = isObject(base.raw.issue) ? base.raw.issue : null;
  const comment = isObject(base.raw.comment) ? parseJsonObject(base.raw.comment) : null;
  const issueNumber = typeof issue?.number === "number" ? issue.number : undefined;
  if (comment === null || issue === null || issueNumber === undefined) return null;
  const pullRequestNumber = isObject(issue.pull_request) ? issueNumber : null;
  const normalized: GitHubIssueComment = {
    author: normalizeUser(comment.user),
    body: typeof comment.body === "string" ? comment.body : "",
    htmlUrl: typeof comment.html_url === "string" ? comment.html_url : undefined,
    id: typeof comment.id === "number" ? comment.id : 0,
    issueNumber,
    pullRequestNumber,
    raw: comment,
    url: typeof comment.url === "string" ? comment.url : undefined,
  };
  return {
    ...base,
    action: readAction(base.raw),
    baseRef: null,
    baseSha: null,
    comment: normalized,
    conversation: { issueNumber, kind: pullRequestNumber === null ? "issue" : "pull_request", pullRequestNumber },
    defaultBranch: null,
    headRef: null,
    headSha: null,
    kind: "issue_comment",
  };
}

function parsePullRequestReviewCommentEvent(
  base: GitHubInboundEventBaseRaw,
): GitHubPullRequestReviewCommentEvent | null {
  const comment = isObject(base.raw.comment) ? parseJsonObject(base.raw.comment) : null;
  const pr = isObject(base.raw.pull_request) ? base.raw.pull_request : null;
  const prNumber = typeof pr?.number === "number" ? pr.number : undefined;
  if (comment === null || prNumber === undefined) return null;
  const id = typeof comment.id === "number" ? comment.id : 0;
  const inReplyToId = typeof comment.in_reply_to_id === "number" ? comment.in_reply_to_id : null;
  const normalized: GitHubPullRequestReviewComment = {
    author: normalizeUser(comment.user),
    body: typeof comment.body === "string" ? comment.body : "",
    htmlUrl: typeof comment.html_url === "string" ? comment.html_url : undefined,
    id,
    inReplyToId,
    pullRequestNumber: prNumber,
    raw: comment,
    reviewThreadRootCommentId: inReplyToId ?? id,
    url: typeof comment.url === "string" ? comment.url : undefined,
  };
  return {
    ...base,
    action: readAction(base.raw),
    baseRef: readPullRequestBaseRef(pr),
    baseSha: readPullRequestBaseSha(pr),
    comment: normalized,
    conversation: { issueNumber: null, kind: "review_thread", pullRequestNumber: prNumber },
    defaultBranch: readPullRequestDefaultBranch(pr),
    headRef: readPullRequestHeadRef(pr),
    headSha: readPullRequestHeadSha(pr),
    kind: "pull_request_review_comment",
  };
}

function parseIssueEvent(base: GitHubInboundEventBaseRaw): GitHubIssueWebhookEvent | null {
  const issue = isObject(base.raw.issue) ? base.raw.issue : null;
  const issueNumber = typeof issue?.number === "number" ? issue.number : undefined;
  if (issue === null || issueNumber === undefined) return null;
  const action = readAction(base.raw);
  return {
    ...base,
    action,
    conversation: { issueNumber, kind: "issue", pullRequestNumber: null },
    issue: { action, issueNumber, raw: parseJsonObject(issue) },
    kind: "issues",
  };
}

function parsePullRequestEvent(base: GitHubInboundEventBaseRaw): GitHubPullRequestWebhookEvent | null {
  const pr = isObject(base.raw.pull_request) ? base.raw.pull_request : null;
  const prNumber = typeof pr?.number === "number" ? pr.number : undefined;
  if (pr === null || prNumber === undefined) return null;
  const action = readAction(base.raw);
  return {
    ...base,
    action,
    baseRef: readPullRequestBaseRef(pr),
    baseSha: readPullRequestBaseSha(pr),
    conversation: { issueNumber: null, kind: "pull_request", pullRequestNumber: prNumber },
    defaultBranch: readPullRequestDefaultBranch(pr),
    headRef: readPullRequestHeadRef(pr),
    headSha: readPullRequestHeadSha(pr),
    kind: "pull_request",
    pullRequest: { action, headSha: readPullRequestHeadSha(pr), pullRequestNumber: prNumber, raw: parseJsonObject(pr) },
  };
}

function readObjectNumber(v: unknown, key: string): number | null {
  return isObject(v) && typeof v[key] === "number" ? v[key] as number : null;
}

function decodePayload(body: string, contentType?: string): JsonObject {
  if (contentType?.includes("application/x-www-form-urlencoded") === true) {
    const payload = new URLSearchParams(body).get("payload") ?? "";
    return parseJsonObject(JSON.parse(payload));
  }
  return parseJsonObject(JSON.parse(body));
}

function normalizeRepository(v: unknown): GitHubRepositoryRef | null {
  if (!isObject(v)) return null;
  const fullName = typeof v.full_name === "string" ? v.full_name : "";
  const [ownerPart = "", namePart = ""] = fullName.split("/");
  const owner = isObject(v.owner) && typeof v.owner.login === "string" ? v.owner.login : ownerPart;
  const name = typeof v.name === "string" ? v.name : namePart;
  const id = typeof v.id === "number" ? v.id : 0;
  if (!owner || !name) return null;
  return { fullName: fullName || `${owner}/${name}`, id, name, owner, private: v.private === true };
}

function normalizeUser(v: unknown): GitHubUser | undefined {
  if (!isObject(v)) return undefined;
  const login = typeof v.login === "string" ? v.login : "";
  if (!login) return undefined;
  return {
    htmlUrl: typeof v.html_url === "string" ? v.html_url : undefined,
    id: typeof v.id === "number" ? v.id : 0,
    login,
    type: typeof v.type === "string" ? v.type : "User",
    url: typeof v.url === "string" ? v.url : undefined,
  };
}

function readInstallationId(v: unknown): number | undefined {
  if (isObject(v)) return typeof v.id === "number" ? v.id : undefined;
  return undefined;
}

function readGitHubHookId(raw: JsonObject): string | undefined {
  if (typeof raw.hook_id === "number") return String(raw.hook_id);
  if (typeof raw.hook_id === "string" && raw.hook_id.length > 0) return raw.hook_id;
  const id = readObjectNumber(raw.hook, "id");
  return id === null ? undefined : String(id);
}

function readAction(raw: JsonObject): string {
  return typeof raw.action === "string" ? raw.action : "";
}

function readPullRequestHeadSha(pr: unknown): string | null {
  const head = isObject(pr) && isObject(pr.head) ? pr.head : null;
  return typeof head?.sha === "string" ? head.sha : null;
}

function readPullRequestHeadRef(pr: unknown): string | null {
  const head = isObject(pr) && isObject(pr.head) ? pr.head : null;
  return typeof head?.ref === "string" ? head.ref : null;
}

function readPullRequestBaseRef(pr: unknown): string | null {
  const base = isObject(pr) && isObject(pr.base) ? pr.base : null;
  return typeof base?.ref === "string" ? base.ref : null;
}

function readPullRequestBaseSha(pr: unknown): string | null {
  const base = isObject(pr) && isObject(pr.base) ? pr.base : null;
  return typeof base?.sha === "string" ? base.sha : null;
}

function readPullRequestDefaultBranch(pr: unknown): string | null {
  const base = isObject(pr) && isObject(pr.base) ? pr.base : null;
  const repo = isObject(base) && isObject(base.repo) ? base.repo : null;
  return typeof repo?.default_branch === "string" ? repo.default_branch : null;
}

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export type { GitHubConversationRef, GitHubInboundEvent };
