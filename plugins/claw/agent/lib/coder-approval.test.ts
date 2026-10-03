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

Deno.test("postApprovalRequest posts eve_choice BUTTONS whose custom_ids carry the decision and requestId", async () => {
  const { fn, posts } = fakeFetch();
  await postApprovalRequest(fn, {
    botToken: "tok",
    channelId: "chan-1",
    pending: { requestId: "req-1", toolName: "runCommand", input: { cmd: "rm -rf build" } },
  });

  assertEquals(posts.length, 1);
  assertStringIncludes(posts[0].url, "/channels/chan-1/messages");
  const row = (posts[0].body.components as Array<{ components: Array<Record<string, unknown>> }>)[0].components;
  // Buttons (type 2), not a select (type 3): one tap, and the chosen state does
  // not linger on screen looking like nothing happened.
  assertEquals(row.map((c) => c.type), [2, 2]);
  // Must match the Discord adapter's handleComponent branch, or the pick never
  // resumes claw. A button has no `values`, so the choice rides in custom_id.
  assertEquals(row.map((c) => c.custom_id), ["eve_choice:approve req-1", "eve_choice:deny req-1"]);
  assert(row.every((c) => String(c.custom_id).length <= 100));
  assertEquals(row.map((c) => c.label), ["Approve", "Deny"]);
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

// The gate renders BUTTONS. A select needed two interactions and left its pick
// on screen afterwards, which read as "nothing happened" to the people
// answering; and a button carries no `values`, so the decision has to ride in
// the custom_id for the adapter to recover it.
Deno.test("postApprovalRequest renders approve/deny buttons carrying the decision in custom_id", async () => {
  let body: Record<string, unknown> = {};
  const fakeFetch = ((_u: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }));
  }) as unknown as typeof fetch;

  await postApprovalRequest(fakeFetch, {
    botToken: "t",
    channelId: "c",
    pending: { requestId: "req-9", toolName: "Bash", input: { command: "ls" } },
  });

  const row = (body.components as { components: Record<string, unknown>[] }[])[0];
  assertEquals(row.components.length, 2);
  // type 2 is a button; a string select would be type 3.
  assertEquals(row.components.map((c) => c.type), [2, 2]);
  assertEquals(row.components.map((c) => c.label), ["Approve", "Deny"]);
  for (const c of row.components) {
    const id = String(c.custom_id);
    assertStringIncludes(id, "req-9");
    assert(id.startsWith("eve_choice:"), `the adapter keys on this prefix: ${id}`);
    assert(id.length <= 100, "Discord rejects a custom_id over 100 chars");
  }
  // The decision must be recoverable from the id alone — no `values` on a button.
  assertStringIncludes(String(row.components[0].custom_id), "approve");
  assertStringIncludes(String(row.components[1].custom_id), "deny");
});
