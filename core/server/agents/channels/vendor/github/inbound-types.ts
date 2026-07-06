// Vendored from eve@0.19.0 dist/src/public/channels/github/inbound-types.d.ts
// (Apache-2.0). Type-only. Modified: `JsonObject` (eve `#shared/json`) → the
// sibling `shared.ts` alias; the CI event shapes (`check_suite`/`check_run`/
// `workflow_run`) are DROPPED — the trex factory handles only issue/PR/comment
// events (YAGNI), so `parseGitHubWebhookEvent` returns null for CI deliveries and
// their types are not carried. See vendor/VENDOR.md.

import type { JsonObject } from "./shared.ts";

/** GitHub conversation kinds represented by the channel state. */
export type GitHubConversationKind = "issue" | "pull_request" | "review_thread";

/** Stable repository identity normalized from webhook payloads. */
export interface GitHubRepositoryRef {
  readonly fullName: string;
  readonly id: number;
  readonly name: string;
  readonly owner: string;
  readonly private: boolean;
}

/** GitHub actor metadata normalized from webhook payloads. */
export interface GitHubUser {
  readonly htmlUrl: string | undefined;
  readonly id: number;
  readonly login: string;
  readonly type: string;
  readonly url: string | undefined;
}

/** GitHub webhook delivery metadata. */
export interface GitHubDelivery {
  readonly event: string;
  readonly hookId: string | undefined;
  readonly id: string;
}

/** Channel-local conversation reference. */
export interface GitHubConversationRef {
  readonly issueNumber: number | null;
  readonly kind: GitHubConversationKind;
  readonly pullRequestNumber: number | null;
}

/** Normalized issue/PR timeline comment. */
export interface GitHubIssueComment {
  readonly author: GitHubUser | undefined;
  readonly body: string;
  readonly htmlUrl: string | undefined;
  readonly id: number;
  readonly issueNumber: number;
  readonly pullRequestNumber: number | null;
  readonly raw: JsonObject;
  readonly url: string | undefined;
}

/** Normalized inline pull-request review comment. */
export interface GitHubPullRequestReviewComment {
  readonly author: GitHubUser | undefined;
  readonly body: string;
  readonly htmlUrl: string | undefined;
  readonly id: number;
  readonly inReplyToId: number | null;
  readonly pullRequestNumber: number;
  readonly raw: JsonObject;
  readonly reviewThreadRootCommentId: number;
  readonly url: string | undefined;
}

/** Common `issues` webhook actions, kept open to any action GitHub sends. */
export type GitHubIssueAction =
  | "assigned"
  | "closed"
  | "edited"
  | "labeled"
  | "opened"
  | "reopened"
  | "unassigned"
  | "unlabeled"
  | (string & {});

/** Common `pull_request` webhook actions, kept open to any action GitHub sends. */
export type GitHubPullRequestAction =
  | "closed"
  | "edited"
  | "labeled"
  | "opened"
  | "ready_for_review"
  | "reopened"
  | "synchronize"
  | "unlabeled"
  | (string & {});

/** Normalized issue event payload. */
export interface GitHubIssueEvent {
  readonly action: GitHubIssueAction;
  readonly issueNumber: number;
  readonly raw: JsonObject;
}

/** Normalized pull-request event payload. */
export interface GitHubPullRequestEvent {
  readonly action: GitHubPullRequestAction;
  readonly headSha: string | null;
  readonly pullRequestNumber: number;
  readonly raw: JsonObject;
}

export interface GitHubInboundEventBase {
  readonly delivery: GitHubDelivery;
  readonly installationId: number | undefined;
  readonly raw: JsonObject;
  readonly repository: GitHubRepositoryRef;
  readonly sender: GitHubUser;
}

export interface GitHubPingEvent extends GitHubInboundEventBase {
  readonly kind: "ping";
}

export interface GitHubIssueCommentEvent extends GitHubInboundEventBase {
  readonly action: string;
  readonly baseRef: string | null;
  readonly baseSha: string | null;
  readonly comment: GitHubIssueComment;
  readonly conversation: GitHubConversationRef;
  readonly defaultBranch: string | null;
  readonly headRef: string | null;
  readonly headSha: string | null;
  readonly kind: "issue_comment";
}

export interface GitHubPullRequestReviewCommentEvent extends GitHubInboundEventBase {
  readonly action: string;
  readonly baseRef: string | null;
  readonly baseSha: string | null;
  readonly comment: GitHubPullRequestReviewComment;
  readonly conversation: GitHubConversationRef;
  readonly defaultBranch: string | null;
  readonly headRef: string | null;
  readonly headSha: string | null;
  readonly kind: "pull_request_review_comment";
}

export interface GitHubIssueWebhookEvent extends GitHubInboundEventBase {
  readonly action: string;
  readonly conversation: GitHubConversationRef;
  readonly issue: GitHubIssueEvent;
  readonly kind: "issues";
}

export interface GitHubPullRequestWebhookEvent extends GitHubInboundEventBase {
  readonly action: string;
  readonly baseRef: string | null;
  readonly baseSha: string | null;
  readonly conversation: GitHubConversationRef;
  readonly defaultBranch: string | null;
  readonly headRef: string | null;
  readonly headSha: string | null;
  readonly kind: "pull_request";
  readonly pullRequest: GitHubPullRequestEvent;
}

/** Parsed GitHub webhook event shape consumed by the channel. */
export type GitHubInboundEvent =
  | GitHubIssueCommentEvent
  | GitHubIssueWebhookEvent
  | GitHubPingEvent
  | GitHubPullRequestReviewCommentEvent
  | GitHubPullRequestWebhookEvent;

/** Parsed mention trigger for a bot-directed GitHub comment. */
export interface GitHubCommentTrigger {
  readonly kind: "mention";
  readonly message: string;
  readonly token: string;
}
