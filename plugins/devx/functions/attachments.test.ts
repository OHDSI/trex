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
      // https, not http: http is already rejected by the scheme check alone,
      // so using it here would let this test pass even if every IP deny
      // rule were deleted. https is what actually exercises the IP rules.
      { name: "metadata.json", url: "https://169.254.169.254/latest/meta-data/" },
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

// FIX 6a: a protocol-relative Location ("//host/path") must be resolved
// against the current hop's scheme and re-validated like any other
// redirect — the metadata host must never actually be fetched.
Deno.test("fetchAttachment: a protocol-relative redirect to the metadata address is rejected, not followed", async () => {
  const calls: string[] = [];
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    calls.push(u);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: "//169.254.169.254/latest/meta-data/" } }),
      );
    }
    throw new Error(`test fake fetch should never be called with: ${u}`);
  };
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch));
  assertEquals(calls, ["https://public.example.com/a.png"]);
});

// FIX 6b: with an allowlist configured, a redirect to a host NOT on the
// allowlist must be rejected at the second hop — the allowlist applies to
// every hop, not just the first.
Deno.test("fetchAttachment: with an allowlist set, a redirect to a non-allowlisted host is rejected at hop 2", async () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "public.example.com" : undefined);
  const calls: string[] = [];
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    calls.push(u);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://not-allowed.example.com/b.png" } }),
      );
    }
    throw new Error(`test fake fetch should never be called with: ${u}`);
  };
  await assertRejects(() => fetchAttachment("https://public.example.com/a.png", env, fakeFetch));
  assertEquals(calls, ["https://public.example.com/a.png"]);
});

// FIX 4: a redirect response's body must be drained (canceled) before the
// loop moves on to the next hop — otherwise the connection sits undrained
// until GC.
Deno.test("fetchAttachment: a redirect response's body is canceled before following the next hop", async () => {
  let canceled = false;
  const redirectBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
    cancel() {
      canceled = true;
    },
  });
  const fakeFetch = (input: string | URL) => {
    const u = String(input);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(redirectBody, { status: 302, headers: { location: "https://other.example.com/b.png" } }),
      );
    }
    if (u === "https://other.example.com/b.png") {
      return Promise.resolve(new Response(new Uint8Array([9])));
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  const res = await fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch);
  assertEquals(res.status, 200);
  assertEquals(canceled, true);
});

// FIX 4: a non-ok terminal response's body must be drained before
// materializeAttachments throws — that path lives in attachments.ts's
// `if (!res.ok) throw`.
Deno.test("materializeAttachments: a non-ok response's body is canceled before the fetch is abandoned", async () => {
  const ws = await Deno.makeTempDir();
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
    cancel() {
      canceled = true;
    },
  });
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(body, { status: 404 }));
  try {
    const saved = await materializeAttachments(ws, [{ name: "a.png", url: "https://example.invalid/a.png" }]);
    assertEquals(saved, []);
    assertEquals(canceled, true);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(ws, { recursive: true });
  }
});

// FIX 5: the fetch-timeout signal must be created ONCE before the redirect
// loop and reused for every hop, so the timeout bounds the whole chain
// (not a fresh budget per hop).
Deno.test("fetchAttachment: the same abort signal instance is used across every redirect hop", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const fakeFetch = (input: string | URL, init?: RequestInit) => {
    const u = String(input);
    signals.push(init?.signal);
    if (u === "https://public.example.com/a.png") {
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://other.example.com/b.png" } }),
      );
    }
    if (u === "https://other.example.com/b.png") {
      return Promise.resolve(new Response(new Uint8Array([9])));
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  await fetchAttachment("https://public.example.com/a.png", noEnv, fakeFetch);
  assertEquals(signals.length, 2);
  assertEquals(signals[0], signals[1]);
});

Deno.test("readCappedBody: an under-cap body returns intact bytes", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const res = new Response(streamFromChunks([data]));
  const out = await readCappedBody(res, 10);
  assertEquals(out, data);
});

Deno.test("readCappedBody: an over-cap body with an honest Content-Length is rejected without ever reading the stream", async () => {
  // `res.body.locked === false` alone would only prove this code never
  // called getReader() on THIS particular stream object — it says nothing
  // about whether the stream was actually pulled. Prove it for real: make
  // pulling the stream itself fail with a distinguishable error, so if the
  // Content-Length check did not short-circuit before any read, the
  // rejection we observe would be this one, not "too large".
  let pulled = false;
  const stream = new ReadableStream({
    pull(controller) {
      pulled = true;
      controller.error(new Error("stream was pulled — the Content-Length check did not short-circuit"));
    },
  });
  const res = new Response(stream, { headers: { "content-length": "1000" } });
  await assertRejects(() => readCappedBody(res, 10), Error, "too large");
  assertEquals(pulled, false);
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

// FIX F: the Content-Length rejection path must cancel the body it never
// reads from — otherwise the connection is left undrained.
Deno.test("readCappedBody: an over-cap Content-Length rejection cancels the body", async () => {
  let canceled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
    cancel() {
      canceled = true;
    },
  });
  const res = new Response(stream, { headers: { "content-length": "1000" } });
  await assertRejects(() => readCappedBody(res, 10));
  assertEquals(canceled, true);
});

// FIX F: if reader.read() itself rejects mid-stream, the reader must still
// end up released (not left locked with an undrained connection behind it).
Deno.test("readCappedBody: a mid-stream read() rejection still releases the reader lock", async () => {
  let reads = 0;
  const stream = new ReadableStream({
    pull(controller) {
      reads++;
      if (reads === 1) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        return;
      }
      controller.error(new Error("simulated mid-stream network failure"));
    },
  });
  const res = new Response(stream, { headers: { "content-length": "3" } });
  await assertRejects(() => readCappedBody(res, 10), Error, "simulated mid-stream network failure");
  assertEquals(res.body!.locked, false);
});

Deno.test("renderAttachmentBlock is empty for no files and lists paths otherwise", () => {
  assertEquals(renderAttachmentBlock([]), "");
  const block = renderAttachmentBlock([{ path: "attachments/0-a.png", contentType: "image/png" }]);
  assertStringIncludes(block, "<user_attachments>");
  assertStringIncludes(block, "attachments/0-a.png (image/png)");
  assertStringIncludes(block, "Read tool");
});
