import { assert, assertEquals } from "jsr:@std/assert";
import { isStatusPing, matchGateText } from "./gate-text.ts";

Deno.test("isStatusPing matches common status-check phrasings, case/punctuation-insensitive", () => {
  const yes = [
    "status", "status?", "Status?", "STATUS",
    "any update?", "any progress?", "Any Update",
    "still working?", "working?", "are you still working?", "are you working",
    "on it?", "still there?", "there?", "online?", "still online",
    "update?", "update",
    "  status?  ", "status!", "status?!",
  ];
  for (const t of yes) assert(isStatusPing(t), `expected isStatusPing(${JSON.stringify(t)}) to be true`);
});

Deno.test("isStatusPing does not match an ordinary instruction or unrelated question", () => {
  const no = [
    "also rename the tests to .test.ts",
    "stop, do A instead",
    "what's the status of the migration table?",
    "is this still working as expected in prod?",
    "",
    "please give me an update on the schema, and also fix the typo",
  ];
  for (const t of no) assert(!isStatusPing(t), `expected isStatusPing(${JSON.stringify(t)}) to be false`);
});

Deno.test("recognises the affirmatives seen in real threads", () => {
  for (const t of ["approve", "Approve", "approved", "go ahead", "yes", "ship it", "lgtm", "do it", "ok go"]) {
    assertEquals(matchGateText(t), { kind: "approve" }, t);
  }
});

Deno.test("recognises negatives", () => {
  for (const t of ["no", "stop", "hold", "wait", "deny", "not yet"]) {
    assertEquals(matchGateText(t), { kind: "deny" }, t);
  }
});

Deno.test("matches a choice by label when options are pending", () => {
  const options = [{ id: "none", label: "None — ship it" }, { id: "code review", label: "Code review" }];
  assertEquals(matchGateText("no checks open pr", options), { kind: "option", optionId: "none" });
  assertEquals(matchGateText("code review", options), { kind: "option", optionId: "code review" });
});

Deno.test("a sentence that merely contains a keyword is NOT a decision", () => {
  assertEquals(matchGateText("does the solution work for large bigquery datasets?"), null);
  assertEquals(matchGateText("yes but first explain why the chunk count is wrong"), null);
});
