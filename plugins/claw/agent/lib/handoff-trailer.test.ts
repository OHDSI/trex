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

// Review fix (round 1): [^>]* used to let a `>` embedded in an attribute
// value terminate the match early, dropping the whole trailer AND leaving
// the raw <handoff .../> markup in the channel-facing body — exactly the
// leak this feature exists to prevent. blocked/needs are free-prose fields
// ("one-line blocker", "the one thing you need") where "A > B" or
// "coverage > 80%" is a natural thing for the coder to write.
Deno.test("a '>' inside an attribute value does not defeat the match", () => {
  const reply = 'Done.\n<handoff track="light" blocked="needs decision: A > B"/>';
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer?.track, "light");
  assertEquals(trailer?.blocked, "needs decision: A > B");
  assertEquals(body, "Done.");
});

// The hardened (non-greedy but still end-anchored) regex must not regress the
// anchoring guarantee: a <handoff .../> mentioned mid-prose, with real text
// after it, is not a trailer — it must be left alone, not stripped or mangled.
Deno.test("mid-prose <handoff> markup with trailing prose is still not treated as a trailer", () => {
  const reply = 'I discussed the <handoff track="light"/> tag design, then explained more text after.';
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer, null);
  assertEquals(body, reply);
});

// Review fix (round 1), minor #2: the attribute regex is [^"]*, so a literal
// (unescaped) `"` inside a value truncates that value at the first embedded
// quote. This is not a crash and the body is still stripped correctly — the
// contract asks the coder to keep values free of `"` (see prompts_channel.ts)
// rather than build quote-escaping. Pinned here so the truncation is
// documented behavior, not a surprise.
Deno.test("an embedded quote in a value truncates it silently, but the body is still stripped", () => {
  const reply = 'Done.\n<handoff needs="the "real" answer"/>';
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer?.needs, "the");
  assertEquals(body, "Done.");
});

// Review fix (round 1), minor #4: attr()/list() used to search for
// `name="..."` anywhere in the raw attribute span, so a name that is a suffix
// of another attribute's name (separated by a non-word character, e.g. a
// hypothetical "sub-remaining") could bleed its value into the shorter name.
// Anchoring on a preceding boundary (start-of-string or whitespace) fixes it.
Deno.test("an attribute name that is a suffix of another (with a separator) does not steal its value", () => {
  const reply = 'Done.\n<handoff sub-remaining="x" remaining="a,b"/>';
  const { trailer } = parseTrailer(reply);
  assertEquals(trailer?.remaining, ["a", "b"]);
});

// Review fix (round 2): round 1's fix ([\s\S]*? on a whole-string regex) let
// the match start at the FIRST "<handoff"-shaped substring — e.g. a decoy the
// coder quotes while explaining the trailer format, or pastes from a prior
// reply inside a fenced code block — and stretch non-greedily to whatever
// closing ">" it could reach from there. That silently took facts from the
// decoy instead of the real trailer at the end, and truncated the body back
// to before the decoy, dropping the closing fence and anything after it. The
// fix anchors on the LAST "<handoff" via lastIndexOf, so an earlier
// occurrence is never even a candidate.
Deno.test("a decoy <handoff> earlier in the reply is ignored when a real trailer follows — the real trailer wins and the decoy stays in the body", () => {
  const reply =
    '```\nUse this: <handoff track="light" saved="x"/>\n```\n\n' +
    '<handoff track="full" saved="x.md" tests="1/1 pass"/>';
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer?.track, "full");
  assertEquals(trailer?.saved, "x.md");
  assertEquals(trailer?.tests, "1/1 pass");
  assertEquals(body, '```\nUse this: <handoff track="light" saved="x"/>\n```');
});

Deno.test("a decoy <handoff> with no real trailer after it parses as null and the body is byte-identical", () => {
  const reply = '```\nUse this: <handoff track="light" saved="x"/>\n```';
  const { trailer, body } = parseTrailer(reply);
  assertEquals(trailer, null);
  assertEquals(body, reply);
});

// Final whole-branch review, Important 6: `triggers` is a comma-list, parsed
// with the SAME `list()` helper as `done`/`remaining` — so it carries the
// same absent-vs-empty asymmetry (no attribute at all -> undefined, an
// attribute present but empty -> []). Step 6 of facilitate-coding-task.md
// depends on this distinction: "the attribute is absent" (older/non-
// conforming reply, fall back to prose) must read differently from "the
// coder deliberately reported no triggers" (a FULL-track reply with none of
// the four labels — trust it, don't fall back to scanning prose that won't
// have them either).
Deno.test("parses triggers as a comma-list, off the same list() helper as done/remaining", () => {
  const reply = 'Assessed the task.\n<handoff track="full" triggers="schema change,multiple components"/>';
  const { trailer } = parseTrailer(reply);
  assertEquals(trailer?.triggers, ["schema change", "multiple components"]);
});

Deno.test("triggers absent-vs-empty: no attribute is undefined, an empty attribute is []", () => {
  const withTriggers = parseTrailer('Done.\n<handoff track="full" triggers="design space"/>');
  assertEquals(withTriggers.trailer?.triggers, ["design space"]);

  const emptyTriggers = parseTrailer('Done.\n<handoff track="full" triggers=""/>');
  assertEquals(emptyTriggers.trailer?.triggers, []);

  const noTriggersAttr = parseTrailer('Done.\n<handoff track="light" saved="x"/>');
  assertEquals(noTriggersAttr.trailer?.triggers, undefined);
});
