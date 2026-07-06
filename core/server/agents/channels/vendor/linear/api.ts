// Partly vendored from eve@0.19.0 dist/src/public/channels/linear/api.js
// (Apache-2.0), de-minified. **Vendored:** the GraphQL transport
// `callLinearGraphQL` (POST `https://api.linear.app/graphql`, `Authorization:
// Bearer <token>`, JSON body, `errors[]`/non-2xx → `LinearApiError`) and the
// `LinearApiError` class are eve's, unchanged — its imports (`#shared/guards`,
// `#shared/json`, the sibling `auth.js`) map to siblings here, so no eve import
// survives. **Trex-added (NOT vendored):** `createLinearComment` (the
// `commentCreate` mutation). eve's Linear delivery posts an **Agent Activity**
// (`agentActivityCreate`) into an Agent Session — there is no `commentCreate` in
// eve — but the trex Linear channel follows the classic comment model (brief),
// so it issues `commentCreate($input: CommentCreateInput!)` against the same
// transport. eve's agent-session mutations (`agentActivityCreate`,
// `agentSessionCreateOn*`, `agentSessionUpdate`, `listAgentSessionActivities`)
// are DROPPED (YAGNI — a different integration model).
//
// AUTH-HEADER NOTE (flagged): the vendored transport sends `Authorization:
// Bearer <token>`, which is correct for a Linear OAuth **agent access token**.
// A personal **API key** (`lin_api_…`, the brief's `LINEAR_API_KEY`) is
// technically sent RAW (no `Bearer`) per Linear's docs. This is preserved from
// eve verbatim; an integration using a personal key should pass an OAuth token
// or a `credentials.accessToken` provider that omits the scheme. See
// vendor/VENDOR.md.

import { isObject, parseJsonObject } from "./shared.ts";
import { type LinearApiOptions, type LinearCredential, resolveLinearAccessToken } from "./auth.ts";

export type { LinearApiOptions };

/** Error carrying a failed Linear GraphQL response (non-2xx or `errors[]`). */
export class LinearApiError extends Error {
  readonly body: unknown;
  readonly queryName: string;
  readonly status: number;
  constructor(init: { body: unknown; queryName: string; status: number }) {
    super(`Linear GraphQL ${init.queryName} failed with HTTP ${init.status}.`);
    this.name = "LinearApiError";
    this.body = init.body;
    this.queryName = init.queryName;
    this.status = init.status;
  }
}

/**
 * Low-level Linear GraphQL call. POSTs `{ query, variables }` to the Linear
 * GraphQL endpoint with a `Bearer <access token>` authorization header, and
 * throws `LinearApiError` on a non-2xx response, a GraphQL `errors[]`, or a
 * missing `data`. Returns the `data` object on success.
 */
export async function callLinearGraphQL(input: {
  readonly api?: LinearApiOptions;
  readonly credentials?: { accessToken?: LinearCredential };
  readonly query: string;
  readonly queryName: string;
  readonly variables?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const doFetch = input.api?.fetch ?? fetch;
  const token = await resolveLinearAccessToken(input.credentials?.accessToken);
  const res = await doFetch(input.api?.apiBaseUrl ?? "https://api.linear.app/graphql", {
    body: JSON.stringify({ query: input.query, variables: input.variables ?? {} }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    method: "POST",
  });
  const body = await parseResponseBody(res);
  if (!res.ok || hasGraphQLErrors(body) || !isObject(body) || !isObject(body.data)) {
    throw new LinearApiError({ body, queryName: input.queryName, status: res.status });
  }
  return body.data;
}

/** Result of a `commentCreate` mutation. */
export interface LinearPostedComment {
  readonly id: string;
  readonly success: boolean;
}

/**
 * Creates a comment on a Linear issue: `commentCreate($input: CommentCreateInput!)`
 * with `{ issueId, body }`. Trex-added — eve's Linear delivery uses Agent
 * Activities, not comments. Throws `LinearApiError` on failure.
 */
export async function createLinearComment(input: {
  readonly api?: LinearApiOptions;
  readonly credentials?: { accessToken?: LinearCredential };
  readonly issueId: string;
  readonly body: string;
}): Promise<LinearPostedComment> {
  const data = await callLinearGraphQL({
    api: input.api,
    credentials: input.credentials,
    query: `
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment { id }
        }
      }
    `,
    queryName: "CommentCreate",
    variables: { input: parseJsonObject({ body: input.body, issueId: input.issueId }) },
  });
  const result = isObject(data.commentCreate) ? data.commentCreate : {};
  const comment = isObject(result.comment) ? result.comment : {};
  return {
    id: typeof comment.id === "string" ? comment.id : "",
    success: result.success === true,
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

function hasGraphQLErrors(v: unknown): boolean {
  return isObject(v) && Array.isArray(v.errors) && v.errors.length > 0;
}
