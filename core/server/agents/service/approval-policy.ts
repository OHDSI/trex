// Decides what happens when a needsApproval tool is called. Pure by contract so
// the precedence below is exhaustively testable without Postgres — see
// approval-policy.test.ts, which pins rule 2 above rules 3 and 4.
export type ApprovalOutcome = "allow" | "gate" | "deny";

export interface ApprovalVerdict {
  outcome: ApprovalOutcome;
  // Why a deny happened, so callers never re-derive it from their inputs.
  reason?: "consent-never" | "no-approver";
}

export type EscalateTier = "hard" | "soft";

// `tier` distinguishes "a human must see this, always" from "prefer a human,
// but do not permanently grant it". Both refuse a sticky always; only hard
// blocks an unattended session.
export type EscalateList = Array<{ tool: string; scopes: string[]; tier: EscalateTier }>;

export interface ApprovalPolicyInput {
  toolName: string;
  scopeKey: string;
  consent: "always" | "never" | null;
  unattended: boolean;
  channelBound: boolean;
  escalate: EscalateList;
}

// The `!Tool` entries name DEVX TOOLS. An external engine (the claude-code
// sidecar) has no such tools — it does the same things through `Bash` — so
// every hard devx entry that has a shell equivalent needs a Bash scope beside
// it, or the floor exists only on the model loop: `git:push` for GitPush
// (scope-key.ts's SUBCOMMAND_TOOLS is what makes that distinguishable from
// `git status`), `psql` for ExecuteSQL, `crontab` for CronCreate/CronDelete.
// RestartApp has no shell equivalent — it drives the process manager through
// devx's own duckdb functions, which a sidecar shell cannot reach.
// `git:subtree` is here because `git subtree push` IS a push and keys on the
// subcommand `subtree`, not on `push`. Nesting a second subcommand level to
// separate it from `subtree add/split/pull` would buy precision on a command an
// unattended coder essentially never runs, so the whole subcommand is escalated
// and the over-gate on the other three is deliberate.
export const DEFAULT_ESCALATE =
  "!GitPush,!ExecuteSQL,!CronCreate,!CronDelete,!RestartApp," +
  "!Bash:sudo|dd|ssh|scp|psql|crontab|git:push|git:subtree," +
  "DeleteFile,Bash:rm|curl|wget|chmod|chown";

// Parsed once. toolset.ts falls back to this when a caller passes no list;
// the environment override is read by handler.ts, not here.
export const DEFAULT_ESCALATE_LIST: EscalateList = parseEscalateList(undefined);

function parseEntries(raw: string): EscalateList {
  const out: EscalateList = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const hard = trimmed.startsWith("!");
    const rest = hard ? trimmed.slice(1).trim() : trimmed;
    if (!rest) {
      console.warn(`agents: skipping malformed AGENTS_ESCALATE_TOOLS entry '${entry}'`);
      continue;
    }
    const colon = rest.indexOf(":");
    const tool = (colon === -1 ? rest : rest.slice(0, colon)).trim();
    const scopeRaw = colon === -1 ? "" : rest.slice(colon + 1).trim();
    if (!tool || (colon !== -1 && !scopeRaw)) {
      console.warn(`agents: skipping malformed AGENTS_ESCALATE_TOOLS entry '${entry}'`);
      continue;
    }
    const scopes = scopeRaw === ""
      ? []
      : scopeRaw.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
    out.push({ tool, scopes, tier: hard ? "hard" : "soft" });
  }
  return out;
}

// Unset uses the default; an explicitly empty string is a deliberate opt-out; a
// value that parses to nothing is a typo and must NOT silently remove the floor.
export function parseEscalateList(raw: string | undefined): EscalateList {
  if (raw !== undefined && raw.trim() === "") return [];
  if (raw === undefined) return parseEntries(DEFAULT_ESCALATE);
  const parsed = parseEntries(raw);
  if (parsed.length === 0) {
    console.warn("agents: AGENTS_ESCALATE_TOOLS had no usable entries — using the default list");
    return parseEntries(DEFAULT_ESCALATE);
  }
  return parsed;
}

// Returns null when `raw` yields no usable entries, so a caller can tell
// "unparseable" from "deliberately the default". parseEscalateList cannot:
// it substitutes the default internally.
export function parseEscalateStrict(raw: string): EscalateList | null {
  const parsed = parseEntries(raw);
  return parsed.length > 0 ? parsed : null;
}

// Pure so a test can supply a deployment list that differs from the built-in
// default; a module-level env-derived const is not something a test can vary.
export function resolveEscalateFor(
  authored: string | undefined,
  deployment: EscalateList,
  agentName?: string,
): EscalateList {
  if (typeof authored === "string" && authored.trim() !== "") {
    const parsed = parseEscalateStrict(authored);
    if (parsed) return parsed;
    console.warn(`agents: agent '${agentName ?? "?"}' has an unparseable escalate list — using the deployment list`);
  }
  return deployment;
}

// Returns the matched tier, or null. A boolean cannot express the hard/soft
// distinction, so callers that only need "matched at all" test `!== null`.
export function matchEscalate(
  list: EscalateList,
  toolName: string,
  scopeKey: string,
): EscalateTier | null {
  const scope = scopeKey.toLowerCase();
  // A `+`-joined Bash key is a SET of executables; matching ANY part is
  // correct, and over-matching a path containing a literal `+` errs toward
  // MORE escalation, which is the safe direction.
  const parts = scope.split("+");
  let soft: EscalateTier | null = null;
  for (const e of list) {
    if (e.tool !== toolName) continue;
    if (e.scopes.length !== 0 && !e.scopes.some((s) => parts.includes(s))) continue;
    if (e.tier === "hard") return "hard"; // hard wins outright
    soft = "soft";
  }
  return soft;
}

export function resolveApproval(input: ApprovalPolicyInput): ApprovalVerdict {
  if (input.consent === "never") return { outcome: "deny", reason: "consent-never" };
  const tier = matchEscalate(input.escalate, input.toolName, input.scopeKey);
  // Both tiers sit above the sticky grant, so neither can be bought off with
  // one "always" click under a shared bot identity.
  if (tier === "hard") {
    return input.channelBound ? { outcome: "gate" } : { outcome: "deny", reason: "no-approver" };
  }
  if (tier === "soft") {
    // Yields to a bot so a coder can run rm/curl, still gates a human.
    return input.unattended ? { outcome: "allow" } : { outcome: "gate" };
  }
  if (input.consent === "always") return { outcome: "allow" };
  if (input.unattended) return { outcome: "allow" };
  return { outcome: "gate" };
}
