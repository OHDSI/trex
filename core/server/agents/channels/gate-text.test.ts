import { assertEquals } from "jsr:@std/assert";
import { matchGateText } from "./gate-text.ts";

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
