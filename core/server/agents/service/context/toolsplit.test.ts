import { assertEquals } from "jsr:@std/assert";
import { partitionTools } from "./toolsplit.ts";

const tools = { Read: {}, Bash: {}, KBSearch: {}, FigmaPullMockups: {} } as never;

Deno.test("partitionTools withholds deferred tools not yet activated", () => {
  const out = partitionTools(tools, [], ["KBSearch", "FigmaPullMockups"]);
  assertEquals(out.core.map(([n]) => n), ["Read", "Bash"]);
  assertEquals(out.activated, []);
});

Deno.test("partitionTools promotes activated tools into the activated group", () => {
  const out = partitionTools(tools, ["KBSearch"], ["KBSearch", "FigmaPullMockups"]);
  assertEquals(out.core.map(([n]) => n), ["Read", "Bash"]);
  assertEquals(out.activated.map(([n]) => n), ["KBSearch"]);
});

Deno.test("partitionTools ignores an activated tool that no longer exists", () => {
  const out = partitionTools(tools, ["DeletedTool"], ["KBSearch"]);
  assertEquals(out.activated, []);
});

Deno.test("partitionTools keeps core order stable regardless of activation", () => {
  const a = partitionTools(tools, [], ["KBSearch"]).core.map(([n]) => n);
  const b = partitionTools(tools, ["KBSearch"], ["KBSearch"]).core.map(([n]) => n);
  assertEquals(a, b);
});
