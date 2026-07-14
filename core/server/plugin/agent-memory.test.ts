import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { curatedOps, parseMemoryLinks, renderMemorySkill, renderMemoryTool } from "./agent-memory.ts";

Deno.test("parseMemoryLinks parses an array, defaulting mode to read", () => {
  const links = parseMemoryLinks([{ name: "d2e" }, { name: "notes", mode: "readwrite" }]);
  assertEquals(links, [
    { name: "d2e", mode: "read" },
    { name: "notes", mode: "readwrite" },
  ]);
});

Deno.test("parseMemoryLinks wraps a single-object form", () => {
  const links = parseMemoryLinks({ name: "d2e" });
  assertEquals(links, [{ name: "d2e", mode: "read" }]);
});

Deno.test("parseMemoryLinks rejects a bad name (uppercase)", () => {
  assertThrows(() => parseMemoryLinks([{ name: "Bad" }]), Error);
});

Deno.test("parseMemoryLinks rejects a bad name (hyphen)", () => {
  assertThrows(() => parseMemoryLinks([{ name: "a-b" }]), Error);
});

Deno.test("parseMemoryLinks rejects an invalid mode", () => {
  assertThrows(() => parseMemoryLinks([{ name: "d2e", mode: "write" }]), Error);
});

Deno.test("parseMemoryLinks rejects a duplicate link name", () => {
  let threw = false;
  try {
    parseMemoryLinks([{ name: "d2e" }, { name: "d2e", mode: "readwrite" }]);
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
  }
  assert(threw);
});

Deno.test("curatedOps(read) has search/recall/get_page, no capture", () => {
  const ops = curatedOps("read");
  const names = ops.map((o) => o.op);
  assertEquals(names, ["search", "recall", "get_page"]);
  const search = ops.find((o) => o.op === "search")!;
  assertEquals(search.gbrainOp, "query");
  assertEquals(search.tool("d2e"), "d2e_search");
  const recall = ops.find((o) => o.op === "recall")!;
  assertEquals(recall.gbrainOp, "recall");
  const getPage = ops.find((o) => o.op === "get_page")!;
  assertEquals(getPage.gbrainOp, "get_page");
});

Deno.test("curatedOps(readwrite) includes capture -> put_page", () => {
  const ops = curatedOps("readwrite");
  const names = ops.map((o) => o.op);
  assertEquals(names, ["search", "recall", "get_page", "capture"]);
  const capture = ops.find((o) => o.op === "capture")!;
  assertEquals(capture.gbrainOp, "put_page");
  assertEquals(capture.tool("notes"), "notes_capture");
});

Deno.test("renderMemoryTool produces a defineTool source calling gbrainOp via callMemory", () => {
  const search = curatedOps("read").find((o) => o.op === "search")!;
  const src = renderMemoryTool("d2e", search);
  assert(src.includes("defineTool("));
  assert(src.includes('from "eve/tools"'));
  assert(src.includes('"query"'));
  assert(src.includes("d2e"));
  assert(src.includes("MEMORY_MCP_URL"));
  assert(src.includes("GBRAIN_MEMORY_TOKEN"));
});

Deno.test("renderMemoryTool for capture references put_page", () => {
  const capture = curatedOps("readwrite").find((o) => o.op === "capture")!;
  const src = renderMemoryTool("notes", capture);
  assert(src.includes("defineTool("));
  assert(src.includes('"put_page"'));
  assert(src.includes("notes"));
});

Deno.test("renderMemorySkill (read) has description line + read-only caveat", () => {
  const md = renderMemorySkill({ name: "d2e", mode: "read" });
  assert(/description:.*"d2e".*brain/i.test(md) || /"d2e" knowledge brain/i.test(md));
  assert(/read-only/i.test(md));
  assert(!/_capture\b/i.test(md));
});

Deno.test("renderMemorySkill (readwrite) documents capture", () => {
  const md = renderMemorySkill({ name: "notes", mode: "readwrite" });
  assert(/"notes" knowledge brain/i.test(md));
  assert(!/read-only/i.test(md));
  assert(/capture/i.test(md));
  assert(/default/i.test(md));
});
