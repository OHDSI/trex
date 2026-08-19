import { assertEquals } from "jsr:@std/assert";
import { looksLikeGateResponse, matchGateText } from "./gate-text.ts";

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

// looksLikeGateResponse (R1 residual, final review): a looser predicate than
// matchGateText — it answers "is this message about the gate at all", not
// "does it cleanly resolve it". Used by service/handler.ts's busy branch to
// gate the deny so ordinary chatter doesn't auto-deny a pending approval.
Deno.test("looksLikeGateResponse: a qualified answer counts even though matchGateText rejects it", () => {
  assertEquals(looksLikeGateResponse("yes but first explain why the chunk count is wrong"), true);
  assertEquals(matchGateText("yes but first explain why the chunk count is wrong"), null);
});

Deno.test("looksLikeGateResponse: unrelated chatter is not a gate response", () => {
  for (const t of ["fyi @alice is out today", "lol nice", "thanks!", "also rename the tests to .test.ts", "\u{1F44D}"]) {
    assertEquals(looksLikeGateResponse(t), false, t);
  }
});

Deno.test("looksLikeGateResponse: strips a leading <discord_context> block and any <attachments> block before judging", () => {
  const wrapped = [
    "<discord_context>",
    "response_medium: discord",
    "user_id: u-1",
    "channel_id: c-1",
    "message_id: m-1",
    "</discord_context>",
    "<attachments>",
    '[{"name":"screenshot.png","url":"https://cdn.example/screenshot.png"}]',
    "</attachments>",
    "yes but first explain why the chunk count is wrong",
  ].join("\n\n");
  assertEquals(looksLikeGateResponse(wrapped), true);

  const wrappedChatter = [
    "<discord_context>",
    "response_medium: discord",
    "user_id: u-1",
    "channel_id: c-1",
    "message_id: m-1",
    "</discord_context>",
    "fyi @alice is out today",
  ].join("\n\n");
  assertEquals(looksLikeGateResponse(wrappedChatter), false);
});

// R1 residual, second pass: adapters/discord.ts's mention-in-thread trigger
// composes a THIRD block into the message — `<thread_messages>` (up to 50
// lines of past conversation, discord-messages.ts's formatMessagesBlock) —
// and reuses the same continuation token as thread-turn, so it can land on
// the same pending gate. That history is full of ordinary yes/no/ok words
// unrelated to the CURRENT reply and must be stripped too, same as
// mention-in-channel's `<channel_messages>` variant.
Deno.test("looksLikeGateResponse: strips a <thread_messages> history block full of stale yes/no/ok before judging", () => {
  const historyBlock = [
    "<thread_messages>",
    "[alice] yes let's do that",
    "[bob] no I don't think so",
    "[alice] ok fine, moving on",
    "</thread_messages>",
  ].join("\n");
  const contextBlock = [
    "<discord_context>",
    "response_medium: discord",
    "user_id: u-1",
    "channel_id: c-1",
    "message_id: m-1",
    "</discord_context>",
  ].join("\n");

  const chatterWrapped = [contextBlock, historyBlock, "also rename the tests to .test.ts"].join("\n\n");
  assertEquals(looksLikeGateResponse(chatterWrapped), false);

  const qualifiedWrapped = [contextBlock, historyBlock, "yes but first explain why the chunk count is wrong"].join(
    "\n\n",
  );
  assertEquals(looksLikeGateResponse(qualifiedWrapped), true);

  const channelHistoryBlock = historyBlock.replace(/thread_messages/g, "channel_messages");
  const channelWrapped = [contextBlock, channelHistoryBlock, "also rename the tests to .test.ts"].join("\n\n");
  assertEquals(looksLikeGateResponse(channelWrapped), false);
});

Deno.test("looksLikeGateResponse: an option label or id counts as a gate response", () => {
  const options = [{ id: "none", label: "None — ship it" }, { id: "code-review", label: "Code review" }];
  assertEquals(looksLikeGateResponse("let's do code review please", options), true);
  assertEquals(looksLikeGateResponse("none of the above, keep going", options), true);
  assertEquals(looksLikeGateResponse("fyi @alice is out today", options), false);
});
