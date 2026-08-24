import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { fetchAttachment, materializeAttachments, readCappedBody, renderAttachmentBlock } from "./attachments.ts";

const noEnv = () => undefined;

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

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

Deno.test("an unsafe attachment url (SSRF target) is skipped without fetching and without failing the turn", async () => {
  const ws = await Deno.makeTempDir();
  const original = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  };
  try {
    const saved = await materializeAttachments(ws, [
      { name: "metadata.json", url: "http://169.254.169.254/latest/meta-data/" },
    ]);
    assertEquals(saved, []);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(ws, { recursive: true });
  }
});

// FIX A: Deno's default `redirect: "follow"` means fetch() itself would
// silently chase a 3xx to wherever it points, and assertSafeAttachmentUrl
// only ever saw the first url. fetchAttachment must fetch with
// `redirect: "manual"` and re-validate every hop itself.

Deno.test("fetchAttachment: a redirect from a public host to the cloud metadata address is rejected, not followed", async () => {
  const calls: string[] = [];
  const fakeFetch = (input: string | URL, _init?: RequestInit) => {
    const u = String(input);
    calls.push(u);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" },
        }),
      );
    }
    throw new Error(`test fake fetch should never be called with: ${u}`);
  };
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch));
  assertEquals(calls, ["https://public.example.com/a.png"]);
});

Deno.test("fetchAttachment: a single legitimate hop (no redirect) succeeds", async () => {
  const fakeFetch = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  const res = await fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch);
  assertEquals(res.status, 200);
});

Deno.test("fetchAttachment: a 302 to another legitimate https url succeeds", async () => {
  const calls: string[] = [];
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    calls.push(u);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://other.example.com/b.png" } }),
      );
    }
    if (u === "https://other.example.com/b.png") {
      return Promise.resolve(new Response(new Uint8Array([9, 9])));
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  const res = await fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch);
  assertEquals(res.status, 200);
  assertEquals(calls, ["https://public.example.com/a.png", "https://other.example.com/b.png"]);
});

Deno.test("fetchAttachment: a relative Location is resolved against the current hop, not the original url", async () => {
  const calls: string[] = [];
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    calls.push(u);
    if (u === "https://public.example.com/dir/a.png") {
      return Promise.resolve(new Response(null, { status: 302, headers: { location: "b.png" } }));
    }
    if (u === "https://public.example.com/dir/b.png") {
      return Promise.resolve(new Response(new Uint8Array([1])));
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  const res = await fetchAttachment("https://public.example.com/dir/a.png", noEnv, fakeFetch);
  assertEquals(res.status, 200);
  assertEquals(calls, ["https://public.example.com/dir/a.png", "https://public.example.com/dir/b.png"]);
});

Deno.test("fetchAttachment: a redirect chain longer than the hop cap throws", async () => {
  let n = 0;
  const fakeFetch = () => {
    n++;
    return Promise.resolve(
      new Response(null, { status: 302, headers: { location: `https://public.example.com/hop-${n}` } }),
    );
  };
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch));
});

Deno.test("fetchAttachment: a 3xx with no Location header throws", async () => {
  const fakeFetch = () => Promise.resolve(new Response(null, { status: 302 }));
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch));
});

Deno.test("fetchAttachment: a redirect to a loopback address throws", async () => {
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(new Response(null, { status: 302, headers: { location: "https://127.0.0.1/" } }));
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch));
});

Deno.test("readCappedBody: an under-cap body returns intact bytes", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const res = new Response(streamFromChunks([data]));
  const out = await readCappedBody(res, 10);
  assertEquals(out, data);
});

Deno.test("readCappedBody: an over-cap body with an honest Content-Length is rejected without reading", async () => {
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  const res = new Response(stream, { headers: { "content-length": "1000" } });
  await assertRejects(() => readCappedBody(res, 10));
  // A reader was never obtained from the body — the Content-Length check
  // short-circuited before any read() call locked the stream.
  assertEquals(res.body.locked, false);
});

Deno.test("readCappedBody: an over-cap body with NO Content-Length is still rejected", async () => {
  const chunks = [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)]; // 24 bytes, cap 10
  const res = new Response(streamFromChunks(chunks));
  await assertRejects(() => readCappedBody(res, 10));
});

Deno.test("readCappedBody: a body exactly at the cap is accepted", async () => {
  const data = new Uint8Array(10);
  const res = new Response(streamFromChunks([data]));
  const out = await readCappedBody(res, 10);
  assertEquals(out.byteLength, 10);
});

Deno.test("renderAttachmentBlock is empty for no files and lists paths otherwise", () => {
  assertEquals(renderAttachmentBlock([]), "");
  const block = renderAttachmentBlock([{ path: "attachments/0-a.png", contentType: "image/png" }]);
  assertStringIncludes(block, "<user_attachments>");
  assertStringIncludes(block, "attachments/0-a.png (image/png)");
  assertStringIncludes(block, "Read tool");
});
