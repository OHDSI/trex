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
