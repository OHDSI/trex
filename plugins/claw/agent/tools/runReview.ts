// runReview — runs one of devx's maintained check agents (code, security, QA,
// design reviews, plus the docs-update writer) and returns its structured
// findings. For "docs" the agent WRITES documentation into the app's docs
// website on the SHARED workspace and its findings are the pages touched — so
// during a facilitated task (where work lives on a feature worktree) claw
// instead asks the coder to run its documenting skill; this kind is for
// standalone docs updates outside a task.
//
// Why this exists: without it the only way for claw to get a review is to ask the
// coding agent to "do a security review", which improvises one from a general-purpose
// coder. That path never loads devx's review system prompts, never applies their tool
// allowlists or step caps, and writes nothing to devx.agent_results — so the review is
// absent from the app's review history in the devx UI. This tool drives the same
// endpoint the devx UI's review buttons do, so a review requested in Discord and one
// clicked in the browser are the same run, stored the same way.
//
// Transport mirrors code-stream.ts: a direct loopback fetch carrying a minted user
// token, not Trex.req — the review agent runs for minutes and the inter-service
// channel buffers the whole response under a 30s timeout.
import { defineTool } from "eve/tools";
import { apiBase, mintToken } from "../lib/code-stream.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

const KINDS = ["code", "security", "qa", "design", "docs"] as const;
export type ReviewKind = typeof KINDS[number];

export interface ReviewFinding {
  title: string;
  level: string;
  description: string;
}

export interface RunReviewResult {
  kind: ReviewKind;
  reviewId?: string;
  findings: ReviewFinding[];
  counts: Record<string, number>;
  error?: string;
}

export async function runReviewCore(
  appId: string,
  kind: ReviewKind,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RunReviewResult> {
  const token = await mintToken(userId);
  const res = await fetchImpl(`${apiBase()}/apps/${appId}/${kind}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });

  // The QA and design reviews drive a browser against the app's dev server and
  // refuse to run when it is down; that arrives as a JSON error, not a stream.
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/event-stream")) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON body — keep the status line
    }
    return { kind, findings: [], counts: {}, error: detail };
  }

  // Drain the SSE stream. Progress events (chunk / tool_call_start / step) drive the
  // devx UI and are not useful here; the terminal event carries the persisted review.
  let review: { id?: string; findings?: ReviewFinding[] } | undefined;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt?.review) review = evt.review;
      } catch {
        // partial or non-JSON frame — the next chunk completes it
      }
    }
  }

  const findings = review?.findings ?? [];
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const level = (f.level ?? "unknown").toLowerCase();
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return { kind, reviewId: review?.id, findings, counts };
}

export default defineTool({
  description:
    "Run one of devx's check agents against an app and return its findings. `kind` is " +
    "'code', 'security', 'qa', 'design' (reviews) or 'docs' (writes feature documentation " +
    "into the app's docs website; findings list the pages touched). Prefer this over asking " +
    "the coding agent to improvise: it uses devx's maintained prompts and stores the result " +
    "in the app's history, so the team can re-read it in the devx UI. Runs take minutes. " +
    "'qa' and 'design' drive a browser and need the app's dev server running — they " +
    "return an error saying so if it is not. 'docs' works on the SHARED app workspace — " +
    "during a facilitated task whose work lives on a feature worktree, have the coder run " +
    "its documenting-d2e-features skill instead so the docs land on the feature branch. " +
    "Report the findings; do not fix anything without asking first.",
  inputSchema: {
    type: "object",
    properties: {
      app: {
        type: "string",
        description: "devx app id (from listApps) to review.",
      },
      kind: {
        type: "string",
        enum: [...KINDS],
        description: "Which review to run.",
      },
    },
    required: ["app", "kind"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.runReview(ctx, input.kind);
    const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
    if (!userId) throw new Error("runReview: no user id — set CLAW_CODE_USER_ID");
    if (!KINDS.includes(input.kind)) {
      throw new Error(`runReview: unknown kind '${input.kind}' (expected ${KINDS.join(", ")})`);
    }
    return await runReviewCore(input.app, input.kind, userId);
  },
});
