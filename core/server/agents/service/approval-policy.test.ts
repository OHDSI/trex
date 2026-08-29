import { assertEquals } from "jsr:@std/assert";
import {
  type EscalateList,
  matchEscalate,
  matchesEscalate,
  parseEscalateList,
  resolveApproval,
} from "./approval-policy.ts";

const NONE: EscalateList = [];
const ESC: EscalateList = [
  { tool: "GitPush", scopes: [], tier: "hard" },
  { tool: "Bash", scopes: ["rm"], tier: "hard" },
];

function outcome(over: Partial<Parameters<typeof resolveApproval>[0]>) {
  return resolveApproval({
    toolName: "Write", scopeKey: "a.ts", consent: null,
    unattended: false, channelBound: false, escalate: NONE, ...over,
  }).outcome;
}

Deno.test("a plain gated tool still gates", () => {
  assertEquals(outcome({}), "gate");
});

Deno.test("sticky never denies, and outranks everything", () => {
  assertEquals(outcome({ consent: "never" }), "deny");
  assertEquals(outcome({ consent: "never", unattended: true }), "deny");
  assertEquals(outcome({ consent: "never", toolName: "GitPush", escalate: ESC, channelBound: true }), "deny");
});

Deno.test("sticky always allows", () => {
  assertEquals(outcome({ consent: "always" }), "allow");
});

Deno.test("an unattended session allows an ordinary gated tool", () => {
  assertEquals(outcome({ unattended: true }), "allow");
});

// The security property of this whole change: the deployment floor outranks
// both a user's sticky grant and the unattended flag.
Deno.test("escalate outranks sticky always and unattended", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: ESC, consent: "always", channelBound: true }), "gate");
  assertEquals(outcome({ toolName: "GitPush", escalate: ESC, unattended: true, channelBound: true }), "gate");
});

// Parking would move the 30-minute hang rather than fix it.
Deno.test("escalate with no channel to ask denies rather than gating", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: ESC, unattended: true, channelBound: false }), "deny");
  assertEquals(outcome({ toolName: "GitPush", escalate: ESC, consent: "always", channelBound: false }), "deny");
});

Deno.test("a scoped escalate entry matches only its scopes", () => {
  assertEquals(outcome({ toolName: "Bash", scopeKey: "rm", escalate: ESC, unattended: true, channelBound: true }), "gate");
  assertEquals(outcome({ toolName: "Bash", scopeKey: "npm", escalate: ESC, unattended: true, channelBound: true }), "allow");
});

Deno.test("matchesEscalate is case-insensitive on the scope, exact on the tool", () => {
  assertEquals(matchesEscalate(ESC, "Bash", "RM"), true);
  assertEquals(matchesEscalate(ESC, "bash", "rm"), false);
});

Deno.test("parseEscalateList reads the grammar", () => {
  const list = parseEscalateList("GitPush,Bash:rm|sudo");
  assertEquals(list, [
    { tool: "GitPush", scopes: [], tier: "soft" },
    { tool: "Bash", scopes: ["rm", "sudo"], tier: "soft" },
  ]);
});

Deno.test("an unset value uses the built-in default", () => {
  const list = parseEscalateList(undefined);
  assertEquals(matchesEscalate(list, "GitPush", ""), true);
  assertEquals(matchesEscalate(list, "Bash", "rm"), true);
  assertEquals(matchesEscalate(list, "Bash", "npm"), false);
});

Deno.test("an explicitly empty value disables escalation", () => {
  assertEquals(parseEscalateList(""), []);
});

// An env typo must not silently remove the floor.
Deno.test("an unparseable value falls back to the default, not to empty", () => {
  const list = parseEscalateList(",,:,");
  assertEquals(matchesEscalate(list, "GitPush", ""), true);
});

Deno.test("malformed entries are skipped without dropping good ones", () => {
  assertEquals(parseEscalateList("GitPush,:,Bash:"), [{ tool: "GitPush", scopes: [], tier: "soft" }]);
});

Deno.test("a deny reports which rule produced it", () => {
  assertEquals(resolveApproval({ toolName: "Write", scopeKey: "a.ts", consent: "never",
    unattended: false, channelBound: false, escalate: NONE }).reason, "consent-never");
  assertEquals(resolveApproval({ toolName: "GitPush", scopeKey: "", consent: null,
    unattended: true, channelBound: false, escalate: ESC }).reason, "no-approver");
});

// The floor's whole purpose: a compound command that hides `rm` behind a
// harmless first token must still reach a human, or be denied when there is none.
Deno.test("a compound Bash scope key escalates on ANY of its parts", () => {
  assertEquals(matchesEscalate(ESC, "Bash", "cd+rm"), true);
  assertEquals(matchesEscalate(ESC, "Bash", "cat+ls"), false);
  assertEquals(
    outcome({ toolName: "Bash", scopeKey: "cd+rm", escalate: ESC, unattended: true }),
    "deny",
  );
  assertEquals(
    outcome({ toolName: "Bash", scopeKey: "cd+rm", escalate: ESC, unattended: true, channelBound: true }),
    "gate",
  );
});

const HARD: EscalateList = [
  { tool: "GitPush", scopes: [], tier: "hard" },
  { tool: "Bash", scopes: ["sudo"], tier: "hard" },
];
const SOFT: EscalateList = [
  { tool: "DeleteFile", scopes: [], tier: "soft" },
  { tool: "Bash", scopes: ["rm"], tier: "soft" },
];

// THE sub-project in one assertion: on the same unattended session a hard
// match denies and a soft match runs.
Deno.test("soft yields to unattended, hard does not", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: HARD, unattended: true, channelBound: false }), "deny");
  assertEquals(outcome({ toolName: "DeleteFile", escalate: SOFT, unattended: true, channelBound: false }), "allow");
  assertEquals(outcome({ toolName: "Bash", scopeKey: "sudo", escalate: HARD, unattended: true, channelBound: false }), "deny");
  assertEquals(outcome({ toolName: "Bash", scopeKey: "rm", escalate: SOFT, unattended: true, channelBound: false }), "allow");
});

// Soft still gates a human, so an interactive user is unaffected.
Deno.test("soft gates an attended session", () => {
  assertEquals(outcome({ toolName: "DeleteFile", escalate: SOFT, unattended: false }), "gate");
});

// Neither tier may be bypassed by a sticky grant.
Deno.test("neither tier yields to a sticky always", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: HARD, consent: "always", channelBound: true }), "gate");
  assertEquals(outcome({ toolName: "DeleteFile", escalate: SOFT, consent: "always" }), "gate");
});

Deno.test("sticky never still outranks both tiers", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: HARD, consent: "never", channelBound: true }), "deny");
  assertEquals(outcome({ toolName: "DeleteFile", escalate: SOFT, consent: "never", unattended: true }), "deny");
});

Deno.test("hard on a channel-bound session gates rather than denying", () => {
  assertEquals(outcome({ toolName: "GitPush", escalate: HARD, unattended: true, channelBound: true }), "gate");
});

Deno.test("matchEscalate reports the tier, or null", () => {
  assertEquals(matchEscalate(HARD, "GitPush", ""), "hard");
  assertEquals(matchEscalate(SOFT, "Bash", "rm"), "soft");
  assertEquals(matchEscalate(SOFT, "Bash", "npm"), null);
  assertEquals(matchEscalate(HARD, "Write", "a.ts"), null);
});

Deno.test("the ! prefix marks hard, its absence marks soft", () => {
  const list = parseEscalateList("!GitPush,DeleteFile,!Bash:sudo,Bash:rm");
  assertEquals(list, [
    { tool: "GitPush", scopes: [], tier: "hard" },
    { tool: "DeleteFile", scopes: [], tier: "soft" },
    { tool: "Bash", scopes: ["sudo"], tier: "hard" },
    { tool: "Bash", scopes: ["rm"], tier: "soft" },
  ]);
});

// A bare `!` has no tool name and must be skipped like any malformed entry.
Deno.test("a lone ! is malformed, not a hard match on the empty tool", () => {
  assertEquals(parseEscalateList("!,GitPush"), [{ tool: "GitPush", scopes: [], tier: "soft" }]);
});

Deno.test("the default list keeps sudo hard and rm soft", () => {
  const list = parseEscalateList(undefined);
  assertEquals(matchEscalate(list, "Bash", "sudo"), "hard");
  assertEquals(matchEscalate(list, "Bash", "rm"), "soft");
  assertEquals(matchEscalate(list, "GitPush", ""), "hard");
  assertEquals(matchEscalate(list, "DeleteFile", ""), "soft");
  assertEquals(matchEscalate(list, "Bash", "npm"), null);
});
