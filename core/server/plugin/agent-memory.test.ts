import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import {
  curatedOps,
  generateMemoryArtifacts,
  parseMemoryLinks,
  renderMemorySkill,
  renderMemoryTool,
} from "./agent-memory.ts";

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

// ---------------------------------------------------------------------------
// Task 3: generateMemoryArtifacts — stages rendered tools/skills onto disk.

Deno.test("generateMemoryArtifacts writes curated tools + skill per link, read vs readwrite", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await generateMemoryArtifacts(tmp, [
      { name: "d2e", mode: "read" },
      { name: "notes", mode: "readwrite" },
    ]);

    // read link: search/recall/get_page present, no capture.
    for (const op of ["search", "recall", "get_page"]) {
      const path = `${tmp}/tools/d2e_${op}.ts`;
      const info = await Deno.stat(path);
      assert(info.isFile);
      const src = await Deno.readTextFile(path);
      assert(src.includes("d2e"));
    }
    await assertRejects(() => Deno.stat(`${tmp}/tools/d2e_capture.ts`), Deno.errors.NotFound);

    // readwrite link: capture present too.
    const capturePath = `${tmp}/tools/notes_capture.ts`;
    const captureInfo = await Deno.stat(capturePath);
    assert(captureInfo.isFile);
    const captureSrc = await Deno.readTextFile(capturePath);
    assert(captureSrc.includes("notes"));
    for (const op of ["search", "recall", "get_page"]) {
      const info = await Deno.stat(`${tmp}/tools/notes_${op}.ts`);
      assert(info.isFile);
    }

    // skills for both links.
    const d2eSkill = await Deno.readTextFile(`${tmp}/skills/d2e-memory.md`);
    assert(d2eSkill.includes("d2e"));
    const notesSkill = await Deno.readTextFile(`${tmp}/skills/notes-memory.md`);
    assert(notesSkill.includes("notes"));
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("generateMemoryArtifacts throws on collision with a hand-authored tool file", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/tools`, { recursive: true });
    await Deno.writeTextFile(`${tmp}/tools/d2e_search.ts`, "// hand-authored, do not clobber\n");

    await assertRejects(
      () => generateMemoryArtifacts(tmp, [{ name: "d2e", mode: "read" }]),
      Error,
      "d2e_search.ts",
    );

    // Must not have been overwritten.
    const src = await Deno.readTextFile(`${tmp}/tools/d2e_search.ts`);
    assertEquals(src, "// hand-authored, do not clobber\n");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
