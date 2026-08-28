import { assertEquals } from "jsr:@std/assert";
import {
  type EscalateList,
  matchesEscalate,
  parseEscalateList,
  resolveApproval,
} from "./approval-policy.ts";

const NONE: EscalateList = [];
const ESC: EscalateList = [{ tool: "GitPush", scopes: [] }, { tool: "Bash", scopes: ["rm"] }];

function outcome(over: Partial<Parameters<typeof resolveApproval>[0]>) {
  return resolveApproval({
    toolName: "Write", scopeKey: "a.ts", consent: null,
    unattended: false, channelBound: false, escalate: NONE, ...over,
  });
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
  assertEquals(list, [{ tool: "GitPush", scopes: [] }, { tool: "Bash", scopes: ["rm", "sudo"] }]);
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
  assertEquals(parseEscalateList("GitPush,:,Bash:"), [{ tool: "GitPush", scopes: [] }]);
});
