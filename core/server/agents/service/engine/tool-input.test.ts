import { assertEquals } from "jsr:@std/assert";
import { toDevxToolInput } from "./tool-input.ts";
import { deriveScopeKey } from "../scope-key.ts";

const WS = "/workspace/app-a";

// Read/Glob/Grep are devx's `defaultConsent: "always"` tools (see
// plugins/devx/functions/tools/{read_file,list_files,grep}.ts) — they are
// never gated in devx, and scope-key.ts's PATH_TOOLS set correctly excludes
// them, so their derived action half is "" by design, not by omission. A
// mapping that forced a non-empty action for these three could only do so by
// mis-tagging `tool` as something scope-key.ts DOES scope (e.g. "Write"),
// which would let a granted Read consent double as a Write grant — far worse
// than an empty action. See the report for this discrepancy against the task
// brief, which asked for a non-empty action on all six.

Deno.test("toDevxToolInput maps Write's file_path to devx's path, non-empty action", () => {
  const mapped = toDevxToolInput("Write", { file_path: "src/a.ts", content: "hi" });
  assertEquals(mapped, { tool: "Write", input: { path: "src/a.ts", content: "hi" } });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+src/a.ts`);
});

Deno.test("toDevxToolInput maps Edit's file_path/old_string/new_string, non-empty action", () => {
  const mapped = toDevxToolInput("Edit", {
    file_path: "src/a.ts",
    old_string: "foo",
    new_string: "bar",
  });
  assertEquals(mapped, {
    tool: "Edit",
    input: { path: "src/a.ts", old_text: "foo", new_text: "bar" },
  });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+src/a.ts`);
});

Deno.test("toDevxToolInput maps Bash's command through unchanged, non-empty action", () => {
  const mapped = toDevxToolInput("Bash", { command: "npm test", description: "run tests" });
  assertEquals(mapped, {
    tool: "Bash",
    input: { command: "npm test", description: "run tests" },
  });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+npm`);
});

Deno.test("toDevxToolInput maps Read's file_path to devx's path (action legitimately empty)", () => {
  const mapped = toDevxToolInput("Read", { file_path: "src/a.ts", offset: 10, limit: 5 });
  assertEquals(mapped, { tool: "Read", input: { path: "src/a.ts" } });
  // Same key a native devx Read call at this path produces: Read isn't a
  // PATH_TOOL, so both key identically regardless of the path argument.
  assertEquals(
    deriveScopeKey(mapped.tool, mapped.input, WS),
    deriveScopeKey("Read", { path: "src/a.ts" }, WS),
  );
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);
});

Deno.test("toDevxToolInput maps Glob's path through (action legitimately empty)", () => {
  const mapped = toDevxToolInput("Glob", { pattern: "**/*.ts", path: "src" });
  assertEquals(mapped, { tool: "Glob", input: { path: "src" } });
  assertEquals(
    deriveScopeKey(mapped.tool, mapped.input, WS),
    deriveScopeKey("Glob", { path: "src" }, WS),
  );
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);
});

Deno.test("toDevxToolInput maps Grep's glob to devx's include_glob (action legitimately empty)", () => {
  const mapped = toDevxToolInput("Grep", { pattern: "foo", path: "src", glob: "*.ts" });
  assertEquals(mapped, {
    tool: "Grep",
    input: { pattern: "foo", path: "src", include_glob: "*.ts" },
  });
  assertEquals(
    deriveScopeKey(mapped.tool, mapped.input, WS),
    deriveScopeKey("Grep", { pattern: "foo", path: "src", include_glob: "*.ts" }, WS),
  );
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);
});

Deno.test("toDevxToolInput passes an unknown SDK tool through unmapped, empty action half", () => {
  const mapped = toDevxToolInput("WebFetch", { url: "https://example.com" });
  assertEquals(mapped, { tool: "WebFetch", input: { url: "https://example.com" } });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);
});

Deno.test("toDevxToolInput never throws on a known tool with an unexpected input shape", () => {
  const mapped = toDevxToolInput("Write", { path: "src/a.ts" }); // wrong field name
  assertEquals(mapped, { tool: "Write", input: {} });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);

  const wrongType = toDevxToolInput("Bash", { command: 42 });
  assertEquals(deriveScopeKey(wrongType.tool, wrongType.input, WS), `${WS}+`);
});

Deno.test("toDevxToolInput never throws on malformed (non-object) input", () => {
  const mapped = toDevxToolInput("Write", null as unknown as Record<string, unknown>);
  assertEquals(mapped, { tool: "Write", input: {} });
  assertEquals(deriveScopeKey(mapped.tool, mapped.input, WS), `${WS}+`);
});
