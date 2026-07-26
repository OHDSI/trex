// fetchGithubIssue — READ-ONLY retrieval of a GitHub issue (or PR) the user
// linked, so the support agent can build a concrete brief from the issue's
// actual content instead of asking the user to summarize it. Strictly limited
// to GETs on the issues API: this tool can never post, comment, label, or
// otherwise write to GitHub — read-only by construction, not by policy.
//
// Auth is optional: public repos (the normal OHDSI case) work unauthenticated;
// set D2ESUPPORT_GITHUB_TOKEN (or GITHUB_TOKEN) in the worker env to read
// private repos / avoid the anonymous rate limit. A private repo without a
// token surfaces as found:false (GitHub masks it as 404), never as an error.
import { defineTool } from "eve/tools";

export interface GithubIssueRef {
  owner: string;
  repo: string;
  number: number;
}

/** Parses a github.com issue/PR url. Null for anything else (incl. non-GitHub links). */
export function parseGithubIssueUrl(url: string): GithubIssueRef | null {
  const m = url.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)(?:[/#?].*)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

const BODY_MAX = 4000;
const COMMENT_MAX = 1000;
const COMMENTS_LIMIT = 10;

export interface FetchedIssue {
  found: boolean;
  reason?: string;
  issue?: {
    url: string;
    title: string;
    state: string;
    isPullRequest: boolean;
    author: string;
    labels: string[];
    createdAt: string;
    body: string;
  };
  comments?: { author: string; body: string }[];
  totalComments?: number;
}

export async function fetchIssueCore(
  ref: GithubIssueRef,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<FetchedIssue> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "d2e-support-agent",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`;

  const res = await fetchImpl(base, { headers });
  if (res.status === 404) {
    // GitHub masks private repos as 404 for unauthorized callers.
    return { found: false, reason: "issue not found (or the repo is private and no read token is configured)" };
  }
  if (!res.ok) throw new Error(`fetchGithubIssue: GitHub returned ${res.status}`);
  // deno-lint-ignore no-explicit-any
  const j = await res.json() as any;

  let comments: { author: string; body: string }[] = [];
  if ((j.comments ?? 0) > 0) {
    try {
      const cRes = await fetchImpl(`${base}/comments?per_page=${COMMENTS_LIMIT}`, { headers });
      if (cRes.ok) {
        // deno-lint-ignore no-explicit-any
        comments = ((await cRes.json()) as any[]).map((c) => ({
          author: c.user?.login ?? "unknown",
          body: String(c.body ?? "").slice(0, COMMENT_MAX),
        }));
      }
    } catch { /* comments are best-effort; the issue itself already answered */ }
  }

  return {
    found: true,
    issue: {
      url: String(j.html_url ?? ""),
      title: String(j.title ?? ""),
      state: String(j.state ?? ""),
      isPullRequest: j.pull_request != null,
      author: String(j.user?.login ?? "unknown"),
      // deno-lint-ignore no-explicit-any
      labels: Array.isArray(j.labels) ? j.labels.map((l: any) => String(l?.name ?? "")).filter(Boolean) : [],
      createdAt: String(j.created_at ?? ""),
      body: String(j.body ?? "").slice(0, BODY_MAX),
    },
    comments,
    totalComments: Number(j.comments ?? 0),
  };
}

export default defineTool({
  description:
    "READ-ONLY: fetch a GitHub issue or PR the user linked (title, body, state, labels, up to " +
    `${COMMENTS_LIMIT} comments) so you can write the task brief from its real content instead ` +
    "of asking the user to summarize. Use it whenever a message contains a github.com issue/PR " +
    "url. Returns {found:false, reason} for private/unknown issues — then just forward the URL " +
    "verbatim in the brief. This tool can only READ; it can never post or change anything on " +
    "GitHub.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The github.com issue or PR url exactly as the user shared it." },
    },
    required: ["url"],
  },
  execute: async (input) => {
    const ref = parseGithubIssueUrl(String(input.url ?? ""));
    if (!ref) return { found: false, reason: "not a github.com issue/PR url" };
    const token = Deno.env.get("D2ESUPPORT_GITHUB_TOKEN") || Deno.env.get("GITHUB_TOKEN") || undefined;
    return await fetchIssueCore(ref, fetch, token);
  },
});
