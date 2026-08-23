// deno test --no-check --allow-all plugins/devx/functions/routes/github_routes.test.ts
//
// Covers the `gh` CLI authentication routes. The shell layer really runs
// commands through DuckDB's devx-ext bridge, which no unit test has, so it is
// swapped for a recorder via __setShellRunnerForTests — that seam exists for
// exactly this. What is asserted here is the route's own logic: which command
// it builds, how it classifies `gh`'s output, and the response shape the UI
// switches on. The parse helpers are exercised against verbatim `gh` 2.65
// output rather than paraphrases.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  __setShellRunnerForTests,
  buildGhLoginCommand,
  GH_CLI_SCOPES,
  handleGithubRoutes,
  parseGhAccount,
  parseGhScopes,
  parseLoginUrl,
  parseUserCode,
} from "./github_routes.ts";

const CORS = { "content-type": "application/json" };

// devx.integrations is never touched by any cli-auth route; if one ever starts
// issuing SQL, this throws rather than silently passing.
const noDb = async (q: string) => {
  throw new Error("cli-auth routes must not query the database: " + q);
};

function req(method: string) {
  return new Request("http://x/integrations/github/cli-auth", { method });
}

/**
 * Fake shell: matches on command substrings and records every command run,
 * so tests can assert on what would have been executed.
 */
function fakeShell(responses: Array<[string, { output: string; exit_code: number }]>) {
  const commands: string[] = [];
  const run = async (command: string) => {
    commands.push(command);
    for (const [needle, result] of responses) {
      if (command.includes(needle)) return result;
    }
    return { output: "", exit_code: 127 };
  };
  return { run, commands };
}

const GH_VERSION_OK = {
  output: "gh version 2.65.0 (2025-01-06)\nhttps://github.com/cli/cli/releases/tag/v2.65.0",
  exit_code: 0,
};

// Verbatim `gh auth status` output, gh 2.65.
const GH_STATUS_LOGGED_IN = {
  output: [
    "github.com",
    "  ✓ Logged in to github.com account octocat (/home/node/.config/gh/hosts.yml)",
    "  - Active account: true",
    "  - Git operations protocol: https",
    "  - Token: gho_************************************",
    "  - Token scopes: 'gist', 'read:org', 'repo'",
  ].join("\n"),
  exit_code: 0,
};

const GH_STATUS_LOGGED_OUT = {
  output: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
  exit_code: 1,
};

// --- parse helpers --------------------------------------------------------

Deno.test("parseGhAccount reads the account from gh 2.65 status output", () => {
  // The "Active account: true" line also matches a naive /account (\S+)/,
  // so the ordering of the alternatives in parseGhAccount is load-bearing.
  assertEquals(parseGhAccount(GH_STATUS_LOGGED_IN.output), "octocat");
});

Deno.test("parseGhAccount falls back to the older 'as <user>' phrasing", () => {
  assertEquals(parseGhAccount("✓ Logged in to github.com as octocat (oauth_token)"), "octocat");
});

Deno.test("parseGhScopes strips the quoting gh uses", () => {
  assertEquals(parseGhScopes(GH_STATUS_LOGGED_IN.output), "gist, read:org, repo");
  assertEquals(parseGhScopes(GH_STATUS_LOGGED_OUT.output), null);
});

Deno.test("parseLoginUrl and parseUserCode read the device handshake gh prints", () => {
  const out = [
    "! First copy your one-time code: 3C4F-9A2B",
    "Open this URL to continue in your web browser: https://github.com/login/device",
  ].join("\n");
  assertEquals(parseUserCode(out), "3C4F-9A2B");
  assertEquals(parseLoginUrl(out), "https://github.com/login/device");
});

Deno.test("parseLoginUrl returns null when gh failed before printing anything usable", () => {
  assertEquals(parseLoginUrl("sh: 1: gh: not found"), null);
  assertEquals(parseUserCode("sh: 1: gh: not found"), null);
});

// --- the login command ----------------------------------------------------

Deno.test("the login command requests repo+read:org and nothing broader", () => {
  const cmd = buildGhLoginCommand();
  assertEquals(GH_CLI_SCOPES, "repo,read:org");
  assertStringIncludes(cmd, "--scopes 'repo,read:org'");
  // Scopes that would let the CLI token rewrite CI or destroy repos.
  for (const forbidden of ["workflow", "delete_repo", "admin:"]) {
    assert(!cmd.includes(forbidden), `login command must not request ${forbidden}`);
  }
});

Deno.test("the login command is a fixed string with no interpolated input", () => {
  // Two builds must be byte-identical: nothing per-call (no uuid, no clock, and
  // above all no caller-supplied value) may reach the shell.
  assertEquals(buildGhLoginCommand(), buildGhLoginCommand());
});

Deno.test("the login command detaches gh and releases the runner's pipe", () => {
  const cmd = buildGhLoginCommand();
  // Backgrounded (gh blocks until the user authorizes) with stdout+stderr
  // redirected to a file and stdin closed — otherwise the command runner
  // waits on the inherited pipe until the device code expires. The redirect
  // must apply to the whole { ... } group, not just the last command in it.
  assertStringIncludes(cmd, "; } < /dev/null > /tmp/.devx-gh-cli-login.out 2>&1 &");
  assertStringIncludes(cmd, "{ GH_TOKEN= GITHUB_TOKEN= BROWSER=false");
  // Chained onto a successful login so an already-running coder sidecar gets
  // push credentials without a restart.
  assertStringIncludes(cmd, "gh auth setup-git --hostname github.com");
  // The stale-attempt guard: unlink before launching.
  assertStringIncludes(cmd, "rm -f /tmp/.devx-gh-cli-login.out");
  // --web selects the device flow explicitly. gh does run `auth login` without
  // a TTY, and --web does not switch to a localhost callback: verified against
  // real gh, it prints the one-time code and https://github.com/login/device,
  // which is exactly what parseUserCode/parseLoginUrl read.
  assertStringIncludes(cmd, "--web");
  assertStringIncludes(cmd, "GH_PROMPT_DISABLED=1");
  // A gh that dies without printing anything must not make the caller sit out
  // the whole handshake timeout.
  assertStringIncludes(cmd, "kill -0 $login_pid 2>/dev/null || break");
});

// --- GET /integrations/github/cli-auth ------------------------------------

Deno.test("GET cli-auth reports the authenticated account and scopes", async () => {
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_IN],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    assertEquals(res!.status, 200);
    assertEquals(await res!.json(), {
      installed: true,
      authenticated: true,
      version: "gh version 2.65.0 (2025-01-06)",
      account: "octocat",
      scopes: "gist, read:org, repo",
    });
  } finally {
    restore();
  }
});

Deno.test("GET cli-auth: installed but signed out is not reported as an account", async () => {
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_OUT],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    const body = await res!.json();
    assertEquals(body.installed, true);
    assertEquals(body.authenticated, false);
    // "not logged into any GitHub hosts" contains no account, and must not be
    // scraped for one.
    assertEquals(body.account, null);
    assertEquals(body.scopes, null);
  } finally {
    restore();
  }
});

Deno.test("GET cli-auth: gh missing reports installed:false and never probes auth", async () => {
  const shell = fakeShell([["gh --version", { output: "sh: 1: gh: not found", exit_code: 127 }]]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    assertEquals(res!.status, 200);
    assertEquals(await res!.json(), {
      installed: false, authenticated: false, version: null, account: null, scopes: null,
    });
    assertEquals(shell.commands.length, 1);
  } finally {
    restore();
  }
});

Deno.test("GET cli-auth: a throwing shell layer degrades to a 200 status body, not a 500", async () => {
  // The Settings page polls this route; a DuckDB hiccup must render as
  // "unknown", not blow up the whole Integrations section.
  const restore = __setShellRunnerForTests(async () => { throw new Error("duckdb pool exhausted"); });
  try {
    const res = await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    assertEquals(res!.status, 200);
    const body = await res!.json();
    assertEquals(body.installed, false);
    assertEquals(body.authenticated, false);
    assertEquals(body.error, "duckdb pool exhausted");
  } finally {
    restore();
  }
});

// --- POST /integrations/github/cli-auth/login -----------------------------

Deno.test("POST cli-auth/login returns the code and URL and leaves gh running", async () => {
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_OUT],
    ["gh auth login", {
      output: [
        "! First copy your one-time code: 3C4F-9A2B",
        "Open this URL to continue in your web browser: https://github.com/login/device",
      ].join("\n"),
      exit_code: 0,
    }],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/login", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(res!.status, 200);
    assertEquals(await res!.json(), {
      status: "pending",
      login_url: "https://github.com/login/device",
      user_code: "3C4F-9A2B",
      message: "Open the URL and enter the code to authorize the CLI.",
    });
  } finally {
    restore();
  }
});

Deno.test("POST cli-auth/login is a no-op when gh is already authenticated", async () => {
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_IN],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/login", "POST", req("POST"), "u1", noDb, CORS,
    );
    const body = await res!.json();
    assertEquals(body.status, "already_authenticated");
    assertEquals(body.account, "octocat");
    // Critically: no second login was launched, which would strand a
    // background process polling a code nobody will ever enter.
    assert(!shell.commands.some((c) => c.includes("gh auth login")));
  } finally {
    restore();
  }
});

Deno.test("POST cli-auth/login reports not_installed instead of launching a doomed login", async () => {
  const shell = fakeShell([["gh --version", { output: "sh: 1: gh: not found", exit_code: 127 }]]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/login", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(res!.status, 200);
    const body = await res!.json();
    assertEquals(body.status, "not_installed");
    assert(!shell.commands.some((c) => c.includes("gh auth login")));
  } finally {
    restore();
  }
});

Deno.test("POST cli-auth/login surfaces gh's own output when no URL ever appears", async () => {
  // The handshake timed out, or gh refused to start. The UI needs a 200 with
  // status:"error" — apiFetch throws on non-2xx, which would lose the message.
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_OUT],
    ["gh auth login", { output: "error connecting to github.com", exit_code: 1 }],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/login", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(res!.status, 200);
    const body = await res!.json();
    assertEquals(body.status, "error");
    assertStringIncludes(body.output, "error connecting to github.com");
  } finally {
    restore();
  }
});

// --- POST /integrations/github/cli-auth/logout ----------------------------

Deno.test("POST cli-auth/logout answers gh's confirmation prompt", async () => {
  const shell = fakeShell([["gh auth logout", { output: "✓ Logged out of github.com account octocat", exit_code: 0 }]]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/logout", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(res!.status, 200);
    assertEquals(await res!.json(), { ok: true, message: "✓ Logged out of github.com account octocat" });
    assertStringIncludes(shell.commands[0], "gh auth logout --hostname github.com");
  } finally {
    restore();
  }
});

Deno.test("POST cli-auth/logout reports ok:false when gh refuses", async () => {
  // The real failure, observed with GITHUB_TOKEN set: gh exits 1 and explains
  // itself on stdout. Returning ok:true here left the user clicking Sign out,
  // watching the block keep saying "Signed in as ...", and being told nothing.
  const shell = fakeShell([["gh auth logout", {
    output: "The value of the GITHUB_TOKEN environment variable is being used for authentication.",
    exit_code: 1,
  }]]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/logout", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(res!.status, 200);
    const body = await res!.json();
    assertEquals(body.ok, false);
    // gh's own explanation is what the user needs; don't swallow it.
    assertStringIncludes(body.message, "GITHUB_TOKEN environment variable");
  } finally {
    restore();
  }
});

Deno.test("POST cli-auth/logout still reports a failure that printed nothing", async () => {
  const shell = fakeShell([["gh auth logout", { output: "", exit_code: 1 }]]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes(
      "/x/integrations/github/cli-auth/logout", "POST", req("POST"), "u1", noDb, CORS,
    );
    assertEquals(await res!.json(), { ok: false, message: "Sign out failed." });
  } finally {
    restore();
  }
});

// --- environment-token scrubbing -----------------------------------------

Deno.test("every gh command blanks GH_TOKEN and GITHUB_TOKEN", async () => {
  // An env token outranks the credential store: `gh auth status` exits 0 off
  // it alone (so the GET would report authenticated for a token these routes
  // do not manage and no skill can renew), and login/logout refuse outright.
  // devx documents setting GITHUB_TOKEN elsewhere, so this is a real config.
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_LOGGED_OUT],
    ["gh auth login", { output: "https://github.com/login/device ABCD-1234", exit_code: 0 }],
    ["gh auth logout", { output: "done", exit_code: 0 }],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    await handleGithubRoutes("/x/integrations/github/cli-auth/login", "POST", req("POST"), "u1", noDb, CORS);
    await handleGithubRoutes("/x/integrations/github/cli-auth/logout", "POST", req("POST"), "u1", noDb, CORS);

    assert(shell.commands.length >= 4);
    for (const cmd of shell.commands) {
      assertStringIncludes(cmd, "GH_TOKEN= GITHUB_TOKEN=");
    }
    // The login script runs two gh commands; `&&` does not carry the first
    // command's assignments to the second, so setup-git needs its own.
    const loginCmd = shell.commands.find((c) => c.includes("gh auth login"))!;
    assertStringIncludes(loginCmd, "&& GH_TOKEN= GITHUB_TOKEN= gh auth setup-git");
  } finally {
    restore();
  }
});

// --- multi-account output -------------------------------------------------

// gh holding two accounts for one host. The active one is NOT printed first
// here — that is the whole point: it is the only credential other gh
// invocations use, so naming the first would report an account whose token
// nothing actually runs as.
const GH_STATUS_TWO_ACCOUNTS = {
  output: [
    "github.com",
    "  ✓ Logged in to github.com account stale-user (/home/node/.config/gh/hosts.yml)",
    "  - Active account: false",
    "  - Token: gho_************************************",
    "  - Token scopes: 'gist'",
    "  ✓ Logged in to github.com account octocat (/home/node/.config/gh/hosts.yml)",
    "  - Active account: true",
    "  - Token: gho_************************************",
    "  - Token scopes: 'gist', 'read:org', 'repo'",
  ].join("\n"),
  exit_code: 0,
};

Deno.test("parseGhAccount and parseGhScopes read the ACTIVE account, not the first", () => {
  assertEquals(parseGhAccount(GH_STATUS_TWO_ACCOUNTS.output), "octocat");
  assertEquals(parseGhScopes(GH_STATUS_TWO_ACCOUNTS.output), "gist, read:org, repo");
});

Deno.test("GET cli-auth reports the active account for a multi-account gh", async () => {
  const shell = fakeShell([
    ["gh --version", GH_VERSION_OK],
    ["gh auth status", GH_STATUS_TWO_ACCOUNTS],
  ]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    const res = await handleGithubRoutes("/x/integrations/github/cli-auth", "GET", req("GET"), "u1", noDb, CORS);
    const body = await res!.json();
    assertEquals(body.account, "octocat");
    assertEquals(body.scopes, "gist, read:org, repo");
  } finally {
    restore();
  }
});

// --- dispatch -------------------------------------------------------------

Deno.test("a DELETE to a cli-auth path cannot reach the OAuth disconnect route", async () => {
  // The routes are matched by path SUFFIX, and DELETE /integrations/github
  // deletes the stored OAuth token. So the risk worth testing is a cli-auth
  // URL that also satisfies that matcher — not a method nothing accepts.
  // noDb throws on any query, so reaching the disconnect route fails loudly
  // rather than quietly returning a passing null.
  const shell = fakeShell([]);
  const restore = __setShellRunnerForTests(shell.run);
  try {
    for (const p of [
      "/x/integrations/github/cli-auth",
      "/x/integrations/github/cli-auth/login",
      "/x/integrations/github/cli-auth/logout",
    ]) {
      assertEquals(await handleGithubRoutes(p, "DELETE", req("DELETE"), "u1", noDb, CORS), null);
    }
    assertEquals(shell.commands.length, 0);
  } finally {
    restore();
  }
});

Deno.test("the OAuth disconnect route still matches its own path", async () => {
  // Keeps the test above from passing for the wrong reason: if the DELETE
  // matcher were deleted outright, every assertion above would still hold.
  let deleted = false;
  const sql = async (q: string) => {
    if (q.includes("DELETE FROM devx.integrations")) { deleted = true; return { rows: [] }; }
    throw new Error("unexpected query: " + q);
  };
  const res = await handleGithubRoutes("/x/integrations/github", "DELETE", req("DELETE"), "u1", sql, CORS);
  assertEquals(res!.status, 200);
  assert(deleted);
});
