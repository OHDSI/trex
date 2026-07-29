import { assertEquals } from "jsr:@std/assert";
import { fetchIssueCore, parseGithubIssueUrl } from "./fetchGithubIssue.ts";

Deno.test("parseGithubIssueUrl: issues, PRs, trailing fragments; rejects everything else", () => {
  assertEquals(parseGithubIssueUrl("https://github.com/OHDSI/Data2Evidence/issues/2951"), {
    owner: "OHDSI", repo: "Data2Evidence", number: 2951,
  });
  assertEquals(parseGithubIssueUrl("https://github.com/o/r/pull/7#issuecomment-1"), { owner: "o", repo: "r", number: 7 });
  assertEquals(parseGithubIssueUrl("https://www.github.com/o/r/issues/1?x=1"), { owner: "o", repo: "r", number: 1 });
  assertEquals(parseGithubIssueUrl("https://github.com/o/r"), null);
  assertEquals(parseGithubIssueUrl("https://gitlab.com/o/r/issues/1"), null);
  assertEquals(parseGithubIssueUrl("not a url"), null);
});

Deno.test("fetchIssueCore: maps issue + comments, truncates, GETs only", async () => {
  const calls: { url: string; method: string; auth: string | null }[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/comments?per_page=10")) {
      return Promise.resolve(Response.json([{ user: { login: "alice" }, body: "same here" }]));
    }
    return Promise.resolve(Response.json({
      html_url: "https://github.com/o/r/issues/5",
      title: "Popup missing close button",
      state: "open",
      user: { login: "peter" },
      labels: [{ name: "bug" }, { name: "ui" }],
      created_at: "2026-07-25T00:00:00Z",
      body: "B".repeat(5000),
      comments: 1,
    }));
  }) as unknown as typeof fetch;

  const out = await fetchIssueCore({ owner: "o", repo: "r", number: 5 }, fetchFn, "tok-1");
  assertEquals(out.found, true);
  assertEquals(out.issue?.title, "Popup missing close button");
  assertEquals(out.issue?.labels, ["bug", "ui"]);
  assertEquals(out.issue?.isPullRequest, false);
  assertEquals(out.issue?.body.length, 4000); // truncated
  assertEquals(out.comments, [{ author: "alice", body: "same here" }]);
  assertEquals(out.totalComments, 1);
  // Read-only by construction: every request is a GET, token attached.
  assertEquals(calls.map((c) => c.method), ["GET", "GET"]);
  assertEquals(calls[0].auth, "Bearer tok-1");
});

Deno.test("fetchIssueCore: 404 (private/unknown) -> found:false, no throw", async () => {
  const fetchFn = (() => Promise.resolve(new Response("{}", { status: 404 }))) as unknown as typeof fetch;
  const out = await fetchIssueCore({ owner: "o", repo: "r", number: 9 }, fetchFn);
  assertEquals(out.found, false);
  assertEquals(out.reason?.includes("private"), true);
});
