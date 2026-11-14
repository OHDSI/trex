import { assertEquals } from "jsr:@std/assert";
import { REDACTED_ATTACHMENT, redactAttachments } from "./redact-attachments.ts";

Deno.test("redactAttachments drops file data but keeps its description", () => {
  const msg = {
    id: "m1",
    role: "user",
    parts: [
      { type: "file", mediaType: "image/png", filename: "attrition.png", url: "data:image/png;base64,AAAA" },
      { type: "text", text: "What does this show?" },
    ],
  };
  assertEquals(redactAttachments(msg), {
    id: "m1",
    role: "user",
    parts: [
      { type: "file", mediaType: "image/png", filename: "attrition.png", url: REDACTED_ATTACHMENT },
      { type: "text", text: "What does this show?" },
    ],
  });
});

Deno.test("redactAttachments drops text marked as attachment content", () => {
  const meta = { trex: { attachment: { filename: "protocol.pdf", mediaType: "application/pdf", pages: 3 } } };
  const msg = {
    role: "user",
    parts: [
      { type: "text", text: "<attachment>secret protocol text</attachment>", providerMetadata: meta },
      { type: "text", text: "Build section 3", providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } } },
    ],
  };
  const out = redactAttachments(msg);
  assertEquals(out.parts[0], { type: "text", text: REDACTED_ATTACHMENT, providerMetadata: meta });
  assertEquals(out.parts[1], msg.parts[1]);
});

Deno.test("redactAttachments does not mutate the message the model receives", () => {
  const msg = { role: "user", parts: [{ type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,BBBB" }] };
  redactAttachments(msg);
  assertEquals(msg.parts[0].url, "data:image/jpeg;base64,BBBB");
});

Deno.test("redactAttachments passes through messages without parts", () => {
  assertEquals(redactAttachments({ role: "user", content: "hi" }), { role: "user", content: "hi" });
  assertEquals(redactAttachments(undefined), undefined);
});
