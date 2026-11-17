// Guards against shipping third-party terminology content (SNOMED CT
// descriptions, CPT descriptors, national catalogs) inside the plugin.
// Concept names must come from the deployment's own licensed vocabulary.
import { assert, assertEquals } from "jsr:@std/assert";

const AGENT = new URL("./", import.meta.url);

Deno.test("the judge prompt references concepts by id placeholder only", async () => {
  const judge = await Deno.readTextFile(new URL("prompts/judge.md", AGENT));
  assertEquals(judge.match(/\(\d{6,9}\)/g), null, "write {{concept:ID}} instead of 'Name (ID)'");
  assertEquals(judge.match(/`\d{6,9} [A-Z]/g), null, "no literal concept names next to ids");
  assert(!/\bCPT\b/.test(judge), "no CPT content in the prompt");
});

Deno.test("no bundled example or vocabulary data files", async () => {
  const found: string[] = [];
  for await (const e of Deno.readDir(AGENT)) if (e.name === "data") found.push(e.name);
  assertEquals(found, []);
});

Deno.test("the judge prompt carries the default-state, laterality and source-of-truth rules", async () => {
  const judge = await Deno.readTextFile(new URL("prompts/judge.md", AGENT));
  for (const marker of [
    "Default states are not qualifiers",
    'explicitly says "without contrast"',
    "the unlateralized concept is a broadMatch",
    "the original is authoritative",
  ]) {
    assert(judge.includes(marker), marker);
  }
});

Deno.test("the judge prompt contains no concept ids or example mappings", async () => {
  const judge = await Deno.readTextFile(new URL("prompts/judge.md", AGENT));
  assertEquals(judge.match(/\b\d{6,9}\b/g), null);
  assertEquals(judge.includes("{{concept:"), false);
});
