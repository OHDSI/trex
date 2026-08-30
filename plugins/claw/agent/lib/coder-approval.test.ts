import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import { approvalChoiceValue, parkedReply, postApprovalGates, postApprovalRequest } from "./coder-approval.ts";

function fakeFetch(status = 200) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const fn = ((url: string, init?: RequestInit) => {
    posts.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(new Response(JSON.stringify({ id: "msg-1" }), { status }));
  }) as typeof fetch;
  return { fn, posts };
}

Deno.test("postApprovalRequest posts an eve_choice select whose values carry the decision and the requestId", async () => {
  const { fn, posts } = fakeFetch();
  await postApprovalRequest(fn, {
    botToken: "tok",
    channelId: "chan-1",
    pending: { requestId: "req-1", toolName: "runCommand", input: { cmd: "rm -rf build" } },
  });

  assertEquals(posts.length, 1);
  assertStringIncludes(posts[0].url, "/channels/chan-1/messages");
  const row = (posts[0].body.components as Array<{ components: Array<Record<string, unknown>> }>)[0].components[0];
  // Must match the Discord adapter's handleComponent branch, or the pick never
  // resumes claw.
  assertEquals(row.custom_id, "eve_choice");
  assertEquals(row.type, 3);
  const options = row.options as Array<{ value: string; label: string }>;
  assertEquals(options.map((o) => o.value), ["approve req-1", "deny req-1"]);
  assert(options.every((o) => o.value.length <= 100));
  assertStringIncludes(options[0].label, "runCommand");
  // The arguments the human is deciding on are shown, not just the tool name.
  assertStringIncludes(String((posts[0].body.embeds as Array<{ description: string }>)[0].description), "rm -rf build");
});

// Truncating would post a corrupted id, and every decision made on that card
// would 404 as "unknown or already-decided" with nothing to explain why.
Deno.test("approvalChoiceValue refuses to truncate an id past Discord's 100-char select value cap", () => {
  assertEquals(approvalChoiceValue("approve", "r".repeat(50)).length, 58);
  assertThrows(
    () => approvalChoiceValue("approve", "r".repeat(200)),
    Error,
    "too long",
  );
});

Deno.test("an unpostable id degrades to 'no gate rendered', not to a broken card or a failed hand-off", async () => {
  const { fn, posts } = fakeFetch();
  const ok = await postApprovalGates(fn, {
    botToken: "tok",
    channelId: "chan-1",
    pending: [{ requestId: "r".repeat(200), toolName: "runCommand", input: {} }],
  });
  // claw then asks the humans in plain text — parkedReply's no-channel variant.
  assertEquals(ok, false);
  assertEquals(posts.length, 0);
});

Deno.test("postApprovalGates posts one card per pending request and reports success", async () => {
  const { fn, posts } = fakeFetch();
  const ok = await postApprovalGates(fn, {
    botToken: "tok",
    channelId: "chan-1",
    pending: [
      { requestId: "req-1", toolName: "runCommand", input: {} },
      { requestId: "req-2", toolName: "writeFile", input: {} },
    ],
  });
  assertEquals(ok, true);
  assertEquals(posts.length, 2);
});

Deno.test("postApprovalGates posts nothing and reports false without a token or a channel", async () => {
  const { fn, posts } = fakeFetch();
  assertEquals(await postApprovalGates(fn, { channelId: "chan-1", pending: [{ requestId: "r", toolName: "t", input: {} }] }), false);
  assertEquals(await postApprovalGates(fn, { botToken: "tok", pending: [{ requestId: "r", toolName: "t", input: {} }] }), false);
  assertEquals(posts.length, 0);
});

// The coder is already parked when this runs; a Discord outage must not turn
// that into a failed hand-off.
Deno.test("postApprovalGates swallows a failing post and reports false", async () => {
  const { fn } = fakeFetch(500);
  const ok = await postApprovalGates(fn, {
    botToken: "tok",
    channelId: "chan-1",
    pending: [{ requestId: "req-1", toolName: "runCommand", input: {} }],
  });
  assertEquals(ok, false);
});

Deno.test("parkedReply names every requestId and forbids sending the parked coder a new message", () => {
  const text = parkedReply([{ requestId: "req-1", toolName: "runCommand", input: { cmd: "ls" } }], true);
  assertStringIncludes(text, "req-1");
  assertStringIncludes(text, "runCommand");
  assertStringIncludes(text, "resolveCoderApproval");
  assertStringIncludes(text, "Do NOT send the coder a new message");
});

Deno.test("parkedReply still hands the requestIds over when the gate could not be posted", () => {
  const text = parkedReply([{ requestId: "req-1", toolName: "runCommand", input: {} }], false);
  assertStringIncludes(text, "req-1");
  assertStringIncludes(text, "resolveCoderApproval");
});
