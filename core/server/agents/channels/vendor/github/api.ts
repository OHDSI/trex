// Vendored from eve@0.19.0 dist/src/public/channels/github/api.js (Apache-2.0),
// de-minified. eve's `api.js` is PURE — its imports are `#shared/guards`
// (isObject), `#shared/json` (parseJsonObject), and `#public/channels/github/
// auth.js` (resolveGitHubInstallationToken), all siblings in this directory — so
// no eve import survives. Modified: only the delivery path the trex factory needs
// is kept (YAGNI) — `callGitHubApi`, `createGitHubIssueComment`, `GitHubApiError`.
// The PR-review / review-comment / reaction / repository / files helpers are
// DROPPED. The auth header (`Bearer <installation token>`), the
// `application/vnd.github+json` + `2022-11-28` version headers, and the
// `POST /repos/{owner}/{repo}/issues/{number}/comments` shape are eve's,
// unchanged. See vendor/VENDOR.md.

import { isObject, parseJsonObject } from "./shared.ts";
import {
  type GitHubApiOptions,
  type GitHubCredentials,
  type GitHubFetch,
  resolveGitHubInstallationToken,
} from "./auth.ts";

export type { GitHubApiOptions, GitHubCredentials, GitHubFetch };

/** Decoded result of a GitHub JSON REST call. */
export interface GitHubApiResponse {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

/** One posted comment normalized from the API response. */
export interface GitHubPostedComment {
  readonly htmlUrl: string | undefined;
  readonly id: number;
  readonly raw: unknown;
  readonly url: string | undefined;
}

/** Error carrying a non-2xx GitHub REST response. */
export class GitHubApiError extends Error {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  constructor(init: { body: unknown; method: string; path: string; status: number }) {
    super(`GitHub ${init.method} ${init.path} failed with HTTP ${init.status}.`);
    this.name = "GitHubApiError";
    this.body = init.body;
    this.method = init.method;
    this.path = init.path;
    this.status = init.status;
  }
}

/**
 * Low-level GitHub REST call. Attaches a `Bearer <installation token>` (minted
 * from the App JWT) unless `options.auth === false`, sends the standard
 * `accept`/version headers, and JSON-encodes the body. Throws `GitHubApiError`
 * on a non-2xx response.
 */
export async function callGitHubApi(input: {
  readonly api?: GitHubApiOptions;
  readonly body?: unknown;
  readonly credentials?: GitHubCredentials;
  readonly installationId?: number | string;
  readonly method: string;
  readonly options?: { auth?: boolean; headers?: Record<string, string>; installationId?: number | string };
  readonly path: string;
}): Promise<GitHubApiResponse> {
  const doFetch = input.api?.fetch ?? fetch;
  const authenticate = input.options?.auth !== false;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...input.options?.headers,
  };
  if (input.body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
  if (authenticate) {
    headers.authorization = `Bearer ${
      await resolveGitHubInstallationToken({
        api: input.api,
        credentials: input.credentials,
        installationId: input.options?.installationId ?? input.installationId,
      })
    }`;
  }
  const res = await doFetch(`${input.api?.apiBaseUrl ?? "https://api.github.com"}${input.path}`, {
    body: input.body === undefined ? undefined : JSON.stringify(parseJsonObject(input.body)),
    headers,
    method: input.method,
  });
  const body = await parseResponseBody(res);
  if (!res.ok) throw new GitHubApiError({ body, method: input.method, path: input.path, status: res.status });
  return { body, ok: res.ok, status: res.status };
}

/** Creates an issue/PR timeline comment: `POST /repos/{owner}/{repo}/issues/{number}/comments`. */
export async function createGitHubIssueComment(input: {
  readonly api?: GitHubApiOptions;
  readonly body: string | { body: string };
  readonly credentials?: GitHubCredentials;
  readonly installationId?: number | string;
  readonly issueNumber: number;
  readonly owner: string;
  readonly repo: string;
}): Promise<GitHubPostedComment> {
  const res = await callGitHubApi({
    api: input.api,
    body: normalizeCommentBody(input.body),
    credentials: input.credentials,
    installationId: input.installationId,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues/${input.issueNumber}/comments`,
  });
  return toPostedComment(res.body);
}

function normalizeCommentBody(body: string | { body: string }): { body: string } {
  return { body: typeof body === "string" ? body : body.body };
}

function toPostedComment(raw: unknown): GitHubPostedComment {
  const o = isObject(raw) ? raw : {};
  return {
    htmlUrl: typeof o.html_url === "string" ? o.html_url : undefined,
    id: typeof o.id === "number" ? o.id : 0,
    raw,
    url: typeof o.url === "string" ? o.url : undefined,
  };
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
