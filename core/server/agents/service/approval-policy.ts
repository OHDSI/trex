// Decides what happens when a needsApproval tool is called. Pure by contract so
// the precedence below is exhaustively testable without Postgres — see
// approval-policy.test.ts, which pins rule 2 above rules 3 and 4.
export type ApprovalOutcome = "allow" | "gate" | "deny";

export interface ApprovalVerdict {
  outcome: ApprovalOutcome;
  // Why a deny happened, so callers never re-derive it from their inputs.
  reason?: "consent-never" | "no-approver";
}

// One parsed escalate rule. Empty `scopes` matches every invocation of the tool.
export type EscalateList = Array<{ tool: string; scopes: string[] }>;

export interface ApprovalPolicyInput {
  toolName: string;
  scopeKey: string;
  consent: "always" | "never" | null;
  unattended: boolean;
  channelBound: boolean;
  escalate: EscalateList;
}

export const DEFAULT_ESCALATE =
  "GitPush,ExecuteSQL,DeleteFile,CronCreate,CronDelete,RestartApp," +
  "Bash:rm|sudo|curl|wget|ssh|scp|dd|chmod|chown";

// Parsed once. toolset.ts falls back to this when a caller passes no list;
// the environment override is read by handler.ts, not here.
export const DEFAULT_ESCALATE_LIST: EscalateList = parseEscalateList(undefined);

function parseEntries(raw: string): EscalateList {
  const out: EscalateList = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    const tool = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim();
    const scopeRaw = colon === -1 ? "" : trimmed.slice(colon + 1).trim();
    if (!tool || (colon !== -1 && !scopeRaw)) {
      console.warn(`agents: skipping malformed AGENTS_ESCALATE_TOOLS entry '${entry}'`);
      continue;
    }
    const scopes = scopeRaw === ""
      ? []
      : scopeRaw.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
    out.push({ tool, scopes });
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

export function matchesEscalate(list: EscalateList, toolName: string, scopeKey: string): boolean {
  const scope = scopeKey.toLowerCase();
  return list.some((e) => e.tool === toolName && (e.scopes.length === 0 || e.scopes.includes(scope)));
}

export function resolveApproval(input: ApprovalPolicyInput): ApprovalVerdict {
  if (input.consent === "never") return { outcome: "deny", reason: "consent-never" };
  // Above `always` and `unattended` deliberately: the escalate list is the
  // deployment's floor, and under a shared bot identity one click would
  // otherwise disarm it for everyone. No channel to ask means deny, not park.
  if (matchesEscalate(input.escalate, input.toolName, input.scopeKey)) {
    return input.channelBound ? { outcome: "gate" } : { outcome: "deny", reason: "no-approver" };
  }
  if (input.consent === "always") return { outcome: "allow" };
  if (input.unattended) return { outcome: "allow" };
  return { outcome: "gate" };
}
