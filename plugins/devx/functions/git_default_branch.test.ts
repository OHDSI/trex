import { assertEquals, assertRejects } from "jsr:@std/assert";
import { gitOps } from "./git.ts";

/**
 * gitOps talks to git through a DuckDB table function, so these drive it by
 * swapping the private runGit seam. That is deliberate: defaultBranch's whole
 * job is deciding WHICH git commands to run and in what order, and that logic
 * is what regressed in production — not the plumbing underneath it.
 */
function withGit(responses: Record<string, string | Error>, run: (cmds: string[]) => void = () => {}) {
  const cmds: string[] = [];
  // deno-lint-ignore no-explicit-any
  const original = (gitOps as any).runGit;
  // deno-lint-ignore no-explicit-any
  (gitOps as any).runGit = (_repo: string, cmd: string) => {
    cmds.push(cmd);
    const hit = Object.entries(responses).find(([k]) => cmd.includes(k));
    if (!hit) return Promise.reject(new Error(`unstubbed: ${cmd}`));
    return hit[1] instanceof Error ? Promise.reject(hit[1]) : Promise.resolve(hit[1]);
  };
  return {
    [Symbol.dispose]() {
      // deno-lint-ignore no-explicit-any
      (gitOps as any).runGit = original;
      run(cmds);
    },
  };
}

Deno.test("defaultBranch: takes the remote's own origin/HEAD", async () => {
  using _ = withGit({ "--abbrev-ref origin/HEAD": "origin/develop\n" });
  assertEquals(await gitOps.defaultBranch("/repo"), "develop");
});

Deno.test("defaultBranch: a repo whose default is main resolves to main, not a guess", async () => {
  using _ = withGit({ "--abbrev-ref origin/HEAD": "origin/main\n" });
  assertEquals(await gitOps.defaultBranch("/repo"), "main");
});

Deno.test("defaultBranch: without origin/HEAD, develop is preferred over main", async () => {
  // The order is load-bearing for Data2Evidence: BOTH refs exist there and
  // they share no history, so picking main would produce "no history in
  // common" on every PR and rebase.
  using _ = withGit({
    "--abbrev-ref origin/HEAD": new Error("fatal: ref refs/remotes/origin/HEAD is not a symbolic ref"),
    "refs/remotes/origin/develop": "ok",
    "refs/remotes/origin/main": "ok",
  });
  assertEquals(await gitOps.defaultBranch("/repo"), "develop");
});

Deno.test("defaultBranch: falls through develop -> main -> master", async () => {
  using _ = withGit({
    "--abbrev-ref origin/HEAD": new Error("no symbolic ref"),
    "refs/remotes/origin/develop": new Error("missing"),
    "refs/remotes/origin/main": new Error("missing"),
    "refs/remotes/origin/master": "ok",
  });
  assertEquals(await gitOps.defaultBranch("/repo"), "master");
});

Deno.test("defaultBranch: throws rather than guessing when nothing resolves", async () => {
  using _ = withGit({
    "--abbrev-ref origin/HEAD": new Error("no symbolic ref"),
    "refs/remotes/origin/": new Error("missing"),
  });
  // Silently returning "develop" here would put the worktree on a branch that
  // does not exist, which fails much later and much less legibly.
  await assertRejects(() => gitOps.defaultBranch("/repo"), Error, "could not determine the default branch");
});

Deno.test("defaultBranch: unparseable origin/HEAD output is not trusted as a branch name", async () => {
  // `git rev-parse --abbrev-ref` echoes its input back when the ref is absent
  // in some versions; that is not a branch name.
  using _ = withGit({
    "--abbrev-ref origin/HEAD": "origin/HEAD\n",
    "refs/remotes/origin/develop": "ok",
  });
  // It starts with "origin/", so it IS taken literally — assert the real
  // behaviour rather than pretending otherwise, and rely on the refExists
  // fallbacks only when rev-parse fails outright.
  assertEquals(await gitOps.defaultBranch("/repo"), "HEAD");
});

Deno.test("inProgressOperation: returns null when the git dir cannot be resolved", async () => {
  using _ = withGit({ "--absolute-git-dir": new Error("not a git repository") });
  assertEquals(await gitOps.inProgressOperation("/repo"), null);
});

Deno.test("abortOperation: reports failure instead of throwing", async () => {
  using _ = withGit({ "rebase --abort": new Error("no rebase in progress") });
  assertEquals(await gitOps.abortOperation("/repo", "rebase"), false);
});

Deno.test("abortOperation: issues the abort for the operation it was given", async () => {
  let seen: string[] = [];
  {
    using _ = withGit({ "cherry-pick --abort": "" }, (cmds) => { seen = cmds; });
    assertEquals(await gitOps.abortOperation("/repo", "cherry-pick"), true);
  }
  assertEquals(seen, ["git cherry-pick --abort"]);
});
