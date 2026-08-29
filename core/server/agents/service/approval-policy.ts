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

export const DEFAULT_ESCALATE =
  "!GitPush,!ExecuteSQL,!CronCreate,!CronDelete,!RestartApp,!Bash:sudo|dd|ssh|scp," +
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
