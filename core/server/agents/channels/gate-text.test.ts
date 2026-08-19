import { assert } from "jsr:@std/assert";
import { isStatusPing } from "./gate-text.ts";

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
