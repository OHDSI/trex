// Vendored from eve@0.19.0 dist/src/public/channels/github/defaults.js
// (Apache-2.0). Modified: ONLY the pure `defaultGitHubAuth` is vendored (its
// input shape narrowed to a `GitHubAuthInput`, its `#channel/types`
// `SessionAuthContext` return → the sibling `GitHubAuthContext`); de-minified.
// The auth-projection logic is unchanged. eve's `defaultOnComment`,
// `createDefaultEvents`, and `checkoutRepositoryForTurn` were intentionally NOT
// copied — they are shaped against eve's runtime channel handle (`ctx.thread`,
// `getSandbox()`) and its `#internal/logging` / git-checkout modules, i.e. eve
// runtime code (and the git checkout is out of v1 scope). The trex factory
// supplies its own `events` + dispatch against `ChannelRouteArgs`. See
// vendor/VENDOR.md.

import type { GitHubAuthContext } from "./shared.ts";
import type { GitHubConversationRef, GitHubRepositoryRef, GitHubUser } from "./inbound-types.ts";

/** Inputs the default auth projection reads from a parsed webhook event. */
export interface GitHubAuthInput {
  readonly sender: GitHubUser;
  readonly conversation: GitHubConversationRef;
  readonly repository: GitHubRepositoryRef;
  readonly delivery: { readonly id: string };
  readonly installationId?: number;
}

/** Default auth projection for a GitHub webhook actor. */
export function defaultGitHubAuth(input: GitHubAuthInput): GitHubAuthContext {
  const sender = input.sender;
  return {
    attributes: {
      conversation_kind: input.conversation.kind,
      delivery_id: input.delivery.id,
      installation_id: String(input.installationId ?? ""),
      issue_number: String(input.conversation.issueNumber ?? ""),
      pull_request_number: String(input.conversation.pullRequestNumber ?? ""),
      repository: input.repository.fullName,
      repository_id: String(input.repository.id),
      user_login: sender.login,
      user_type: sender.type,
    },
    authenticator: "github-webhook",
    issuer: `github:${input.repository.owner}`,
    principalId: `github:${sender.id}`,
    principalType: sender.type === "Bot" ? "service" : "user",
    subject: sender.login,
  };
}
