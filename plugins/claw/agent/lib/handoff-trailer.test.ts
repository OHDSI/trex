import { assertEquals } from "jsr:@std/assert";
import { parseTrailer } from "./handoff-trailer.ts";

Deno.test("parses a full trailer and strips it from the body", () => {
  const reply = `Implemented the fix and ran the suite.\n\n<handoff track="light" saved="trex/specs/2026-08-19-x.md" tests="12/12 pass" done="edit,test" remaining="" blocked="" needs=""/>`;
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer?.track, "light");
  assertEquals(trailer?.saved, "trex/specs/2026-08-19-x.md");
  assertEquals(trailer?.tests, "12/12 pass");
  assertEquals(trailer?.done, ["edit", "test"]);
  assertEquals(trailer?.remaining, []);
  assertEquals(trailer?.blocked, undefined);
  assertEquals(body, "Implemented the fix and ran the suite.");
});

Deno.test("a reply with no trailer parses as null and is unchanged", () => {
  const { trailer, body } = parseTrailer("Just prose.");
  assertEquals(trailer, null);
  assertEquals(body, "Just prose.");
});

Deno.test("a blocked trailer keeps the reason", () => {
  const { trailer } = parseTrailer(`Could not run it.\n<handoff track="full" blocked="docker unavailable in sandbox"/>`);
  assertEquals(trailer?.blocked, "docker unavailable in sandbox");
});
