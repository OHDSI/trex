// Stable machine-readable classification for coder-turn failures. The `safe`
// string is what the devx browser UI shows; the `code` is what claw maps to a
// channel-ready sentence with a repair action (plugins/claw/agent/lib/code-error.ts).
// Keep the two vocabularies in sync — a new code needs a claw-side sentence.
export type CoderErrorCode =
  | "auth_expired"
  | "workspace_boot_failed"
  | "rate_limited"
  | "quota"
  | "model_not_found"
  | "invalid_key"
  | "git_workflow_scope"
  | "git_unrelated_base"
  | "pr_already_exists"
  | "workspace_quarantined"
  | "unclassified";

const GENERIC = "An error occurred while generating a response. Check the server logs for details.";

export function classifyCoderError(raw: string): { code: CoderErrorCode; safe: string } {
  const msg = (raw ?? "").trim();

  // GitHub rejects a push whose diff creates or updates anything under
  // .github/workflows/ unless the token carries the `workflow` scope, which
  // github_routes.ts deliberately does NOT request (it would let an
  // autonomous agent rewrite CI). The remote's wording never mentions the
  // token or what to do, so the coder read it as "auth is broken" and burned
  // whole turns re-running `gh auth status` / `gh auth token` /
  // `gh auth setup-git` and spawning subagents to re-check — 14 rejections in
  // 90 minutes. Classify it before the generic 403/permission checks below so
  // it cannot be mistaken for an expired or invalid credential, and name both
  // real remedies: the usual cause is a branch carrying workflow commits it
  // did not author (a stale base), not a missing permission.
  if (/refusing to allow .*(?:OAuth App|integration|GitHub App).*workflow/is.test(msg) || /without .*\bworkflow\b.* scope/is.test(msg)) {
    const files = [...msg.matchAll(/(\.github\/workflows\/[\w.\-\/]+)/g)].map((m) => m[1]);
    const uniq = [...new Set(files)];
    const which = uniq.length ? ` (${uniq.slice(0, 3).join(", ")}${uniq.length > 3 ? ", …" : ""})` : "";
    return {
      code: "git_workflow_scope",
      safe:
        `The push was rejected because it changes GitHub Actions workflow files${which} and the ` +
        "configured token has no `workflow` scope. This is usually a stale branch carrying CI " +
        "commits it did not author — rebase onto the current remote base, or drop those files " +
        "from the branch, and push again. Granting the `workflow` scope is a deliberate " +
        "decision for a human to make, not a step to retry. Re-running `gh auth status` will not " +
        "change this.",
    };
  }
  const lower = msg.toLowerCase();

  // Both of these MUST precede the generic 404 / "not found" and auth checks
  // below, whose substrings ("not found", "404") appear inside git and gh
  // output for entirely unrelated reasons.

  // Wrong base branch. Data2Evidence has both `main` and `develop` and they
  // share NO history, so a coder that targeted `main` got these errors and then
  // retried the same command for four turns, ending with a worktree left
  // detached mid-rebase. The repair is never a retry — it is a different base.
  if (
    /no history in common/i.test(msg) ||
    /refusing to merge unrelated histories/i.test(msg) ||
    /\bunrelated commits\b/i.test(msg)
  ) {
    return {
      code: "git_unrelated_base",
      safe: "The branch and the base you targeted share no history — the base branch is wrong. " +
        "Check what the remote's default actually is (`git rev-parse --abbrev-ref origin/HEAD`) and use that; " +
        "in this repo `main` and `develop` are unrelated roots, so rebasing or opening a PR across them can never work. " +
        "Retrying the same command will produce the same error.",
    };
  }

  // The chat's workspace was unusable and got reset. Not a failure the coder
  // should retry or reason about — and emphatically not something a human needs
  // to fix with git commands on their laptop, which is what the agent concluded
  // from the raw "chat worktree ... is unusable" string it used to receive.
  if (/quarantined .*->|is unusable .* could not be quarantined/i.test(msg)) {
    const dest = msg.match(/->\s*(\S+)/)?.[1];
    return {
      code: "workspace_quarantined",
      safe: "This chat's workspace was in a state it could not be used from, so it was reset to a clean one" +
        (dest ? ` (the previous one is kept at \`${dest}\` and nothing was deleted)` : "") +
        ". Send the request again and it will run on the fresh workspace.",
    };
  }

  // The PR already exists. Retrying `gh pr create` cannot succeed; the useful
  // action is to report the PR that is already open.
  if (/a pull request already exists/i.test(msg)) {
    return {
      code: "pr_already_exists",
      safe: "A pull request already exists for this branch. Look it up " +
        "(`gh pr list --head <branch>`) and report its URL instead of creating another.",
    };
  }

  if (lower.includes("oauth") && lower.includes("expired")) {
    return { code: "auth_expired", safe: "The coding session's credentials expired. Re-authenticate to continue." };
  }
  if (lower.includes("brotli error") || lower.includes("failed to bootstrap runtime") || lower.includes("worker boot error")) {
    return { code: "workspace_boot_failed", safe: "The workspace runtime failed to start. Its dependency cache needs repair." };
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return { code: "rate_limited", safe: "Rate limit exceeded. Please wait and try again." };
  }
  if (lower.includes("api quota")) {
    return { code: "quota", safe: "API quota exhausted for this account." };
  }
  if (lower.includes("404") || lower.includes("not_found") || lower.includes("not found")) {
    return { code: "model_not_found", safe: "Model not found. Check the model name in Settings." };
  }
  if (lower.includes("401") || lower.includes("authentication") || (lower.includes("invalid") && lower.includes("key"))) {
    return { code: "invalid_key", safe: "Invalid API key. Please check your API key in Settings." };
  }
  return { code: "unclassified", safe: GENERIC };
}
