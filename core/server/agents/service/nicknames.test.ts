import { assert } from "jsr:@std/assert";
import { AGENT_NAMES, pickNickname } from "./nicknames.ts";

Deno.test("pickNickname returns an unused name", () => {
  const n = pickNickname([]);
  assert(AGENT_NAMES.includes(n), `${n} not in the name list`);
});

Deno.test("pickNickname avoids names already in use", () => {
  const taken = AGENT_NAMES.slice(0, 5);
  const n = pickNickname([...taken]);
  assert(!taken.includes(n), "returned a name already in use");
});

Deno.test("pickNickname suffixes on wraparound", () => {
  const n = pickNickname([...AGENT_NAMES]);
  assert(n.endsWith(" the 2nd"), `expected a wraparound suffix, got ${n}`);
});

Deno.test("pickNickname keeps suffixing past the second lap", () => {
  const taken = [...AGENT_NAMES, ...AGENT_NAMES.map((n) => `${n} the 2nd`)];
  const n = pickNickname(taken);
  assert(n.endsWith(" the 3rd"), `expected a third-lap suffix, got ${n}`);
});
