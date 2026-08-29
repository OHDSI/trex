import { assert, assertEquals } from "jsr:@std/assert";
import { forkParentHistory, parseForkTurns } from "./fork.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./budget.ts";
import type { TurnRow } from "./history.ts";

const turn = (seq: number, msg: string, text: string): TurnRow => ({
  seq,
  message: msg,
  metadata: null,
  steps: [{ kind: "text", name: null, payload: { text } }],
});

Deno.test("parseForkTurns understands none, all and integers", () => {
  assertEquals(parseForkTurns(undefined), "none");
  assertEquals(parseForkTurns("none"), "none");
  assertEquals(parseForkTurns("all"), "all");
  assertEquals(parseForkTurns("3"), 3);
  assertEquals(parseForkTurns("0"), "none");
  assertEquals(parseForkTurns("-2"), "none");
  assertEquals(parseForkTurns("banana"), "none");
});

Deno.test("fork none yields no inherited context", () => {
  const turns = [turn(1, "a", "A"), turn(2, "b", "B")];
  assertEquals(forkParentHistory(turns, "none", DEFAULT_CONTEXT_CONFIG, 100_000), []);
});

Deno.test("fork N takes the most recent N turns", () => {
  const turns = [turn(1, "oldest", "O"), turn(2, "middle", "M"), turn(3, "newest", "N")];
  const out = forkParentHistory(turns, "2", DEFAULT_CONTEXT_CONFIG, 100_000);
  const s = JSON.stringify(out);
  assert(!s.includes("oldest"), "the oldest turn must be dropped");
  assert(s.includes("middle") && s.includes("newest"));
});

Deno.test("fork 1 yields only the single most recent turn", () => {
  const turns = [turn(1, "oldest", "O"), turn(2, "middle", "M"), turn(3, "newest", "N")];
  const s = JSON.stringify(forkParentHistory(turns, "1", DEFAULT_CONTEXT_CONFIG, 100_000));
  assert(!s.includes("oldest") && !s.includes("middle"));
  assert(s.includes("newest"));
});

Deno.test("fork all takes everything", () => {
  const turns = [turn(1, "oldest", "O"), turn(2, "newest", "N")];
  const s = JSON.stringify(forkParentHistory(turns, "all", DEFAULT_CONTEXT_CONFIG, 100_000));
  assert(s.includes("oldest") && s.includes("newest"));
});

Deno.test("the token budget trims whole turns from the oldest end", () => {
  const big = "x".repeat(40_000); // ~10k tokens each
  const turns = [turn(1, "oldest", big), turn(2, "middle", big), turn(3, "newest", big)];
  const s = JSON.stringify(forkParentHistory(turns, "all", DEFAULT_CONTEXT_CONFIG, 12_000));
  assert(!s.includes("oldest"), "budget must drop the oldest turn");
  assert(s.includes("newest"), "the newest turn must survive");
});

Deno.test("a budget too small for even the single newest turn yields empty, never a partial turn", () => {
  const big = "x".repeat(40_000); // ~10k tokens
  const turns = [turn(1, "only", big)];
  assertEquals(forkParentHistory(turns, "all", DEFAULT_CONTEXT_CONFIG, 100), []);
});

Deno.test("a forked slice never orphans a tool call", () => {
  const turns: TurnRow[] = [{
    seq: 1,
    message: "run it",
    metadata: null,
    steps: [{ kind: "tool-call", name: "Bash", payload: { toolCallId: "c1", input: {} } }],
  }];
  const out = forkParentHistory(turns, "all", DEFAULT_CONTEXT_CONFIG, 100_000);
  const toolResults = out.filter((m) => m.role === "tool");
  assertEquals(toolResults.length, 1, "the orphan call must be given a synthetic result");
});

Deno.test("forkParentHistory does not mutate the turns array it was given", () => {
  const turns = [turn(1, "oldest", "O"), turn(2, "middle", "M"), turn(3, "newest", "N")];
  const before = JSON.stringify(turns);
  forkParentHistory(turns, "2", DEFAULT_CONTEXT_CONFIG, 100_000);
  assertEquals(JSON.stringify(turns), before);
});
