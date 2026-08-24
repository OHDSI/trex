import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { materializeAttachments, renderAttachmentBlock } from "./attachments.ts";

Deno.test("saves a file under attachments/ with an index prefix and a sanitized name", async () => {
  const ws = await Deno.makeTempDir();
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  try {
    const saved = await materializeAttachments(ws, [
      { name: "../../etc/pass wd.png", url: "https://example.invalid/a.png", contentType: "image/png" },
    ]);
    assertEquals(saved.length, 1);
    assertEquals(saved[0].path, "attachments/0-pass_wd.png");
    assertEquals((await Deno.readFile(`${ws}/${saved[0].path}`)).length, 3);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(ws, { recursive: true });
  }
});

Deno.test("a failed download is skipped without failing the turn", async () => {
  const ws = await Deno.makeTempDir();
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("nope", { status: 404 }));
  try {
    assertEquals(await materializeAttachments(ws, [{ name: "a.png", url: "https://example.invalid/a.png" }]), []);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(ws, { recursive: true });
  }
});

Deno.test("renderAttachmentBlock is empty for no files and lists paths otherwise", () => {
  assertEquals(renderAttachmentBlock([]), "");
  const block = renderAttachmentBlock([{ path: "attachments/0-a.png", contentType: "image/png" }]);
  assertStringIncludes(block, "<user_attachments>");
  assertStringIncludes(block, "attachments/0-a.png (image/png)");
  assertStringIncludes(block, "Read tool");
});
