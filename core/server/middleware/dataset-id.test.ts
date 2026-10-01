import { assertEquals } from "jsr:@std/assert";
import { Buffer } from "node:buffer";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { extractDatasetIds } from "./dataset-id.ts";

async function deflate(text: string, format: CompressionFormat = "deflate"): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function mriquery(obj: unknown): Promise<string> {
  return encodeURIComponent(encodeBase64(await deflate(JSON.stringify(obj))));
}

function streamReq(
  url: string,
  bytes: Uint8Array,
  headers: Record<string, string>,
): any {
  return {
    originalUrl: url,
    method: "POST",
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(bytes);
    },
  };
}

function getReq(url: string, headers: Record<string, string> = {}): any {
  return { originalUrl: url, method: "GET", headers };
}

Deno.test("extractDatasetIds", async (t) => {
  await t.step("reads the query parameter", async () => {
    const r = await extractDatasetIds(getReq("/a/b?datasetId=X"), "datasetId");
    assertEquals(r, { ids: ["X"], unverifiable: false });
  });

  await t.step("reads every value of a repeated or bracketed query parameter", async () => {
    const r = await extractDatasetIds(
      getReq("/a?datasetId=X&datasetId=Y&datasetId%5B0%5D=Z"),
      "datasetId",
    );
    assertEquals(r.ids.sort(), ["X", "Y", "Z"]);
  });

  await t.step("reads datasetId from a zlib+base64 mriquery", async () => {
    const q = await mriquery({ datasetId: "Y", filter: {} });
    const r = await extractDatasetIds(getReq(`/pa/services/x?mriquery=${q}`), "datasetId");
    assertEquals(r, { ids: ["Y"], unverifiable: false });
  });

  await t.step("flags a malformed mriquery without throwing", async () => {
    const r = await extractDatasetIds(getReq("/pa?mriquery=not-base64!!"), "datasetId");
    assertEquals(r, { ids: [], unverifiable: true });
  });

  await t.step("reads a streamed JSON body and keeps its bytes on req.body", async () => {
    const raw = new TextEncoder().encode(JSON.stringify({ datasetId: "Y", x: 1 }));
    const req = streamReq("/a", raw, { "content-type": "application/json; charset=utf-8" });
    const r = await extractDatasetIds(req, "datasetId");
    assertEquals(r, { ids: ["Y"], unverifiable: false });
    assertEquals(Buffer.isBuffer(req.body), true);
    assertEquals(new Uint8Array(req.body), raw);
  });

  await t.step("reads an already parsed JSON body", async () => {
    const req: any = {
      originalUrl: "/a",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { datasetId: ["X", "Y"] },
      _body: true,
    };
    const r = await extractDatasetIds(req, "datasetId");
    assertEquals(r.ids.includes("Y"), true);
  });

  await t.step("reads a gzip-encoded urlencoded body", async () => {
    const raw = await deflate("datasetId=Y&a=1", "gzip");
    const req = streamReq("/a", raw, {
      "content-type": "application/x-www-form-urlencoded",
      "content-encoding": "gzip",
    });
    const r = await extractDatasetIds(req, "datasetId");
    assertEquals(r, { ids: ["Y"], unverifiable: false });
    assertEquals(new Uint8Array(req.body), raw);
  });

  await t.step("reads the header", async () => {
    const r = await extractDatasetIds(getReq("/a", { datasetid: "Y" }), "datasetId");
    assertEquals(r, { ids: ["Y"], unverifiable: false });
  });

  await t.step("reads a URL-encoded JSON path segment", async () => {
    const r = await extractDatasetIds(
      getReq("/cohort/SYNTAX/%7B%22datasetId%22%3A%22Y%22%7D"),
      "datasetId",
    );
    assertEquals(r, { ids: ["Y"], unverifiable: false });
  });

  await t.step("does not read a body of another content type", async () => {
    const raw = new TextEncoder().encode("datasetId=Y");
    const req = streamReq("/a", raw, { "content-type": "text/plain" });
    const r = await extractDatasetIds(req, "datasetId");
    assertEquals(r, { ids: [], unverifiable: false });
    assertEquals(req.body, undefined);
  });

  await t.step("reads the default key alongside a custom one", async () => {
    const r = await extractDatasetIds(getReq("/a?dsid=X&datasetId=Y"), "dsid");
    assertEquals(r.ids.sort(), ["X", "Y"]);
  });
});
