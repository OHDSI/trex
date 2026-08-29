import { assert, assertEquals } from "jsr:@std/assert";
import { capHookOutput } from "./hook-output.ts";
import { estimateTokens } from "./budget.ts";

Deno.test("output under the cap is returned unchanged", async () => {
  const { text, spilled } = await capHookOutput("short", { maxTokens: 2500 });
  assertEquals(text, "short");
  assertEquals(spilled, undefined);
});

Deno.test("output over the cap is replaced by a one-line pointer", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const big = "x ".repeat(20_000);
    const { text, spilled } = await capHookOutput(big, { maxTokens: 2500, spillPath: tmpDir });
    assert(text.length < 500, "the injected text must be a pointer, not the payload");
    assert(spilled !== undefined, "over-cap output must spill to a file");
    assert(text.includes(spilled), "the pointer must name the spill file");
    assertEquals(await Deno.readTextFile(spilled), big);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// Uncapped injection can undo the compaction that just ran. Regression guard:
// a naive implementation might compare raw text.length against maxTokens
// (treating one character as one token) instead of the real chars/4 estimate
// budget.ts uses everywhere else — that would over-spill on any text longer
// than maxTokens characters, CJK or not.
Deno.test("the cap is measured in tokens, not raw character count", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const wide = "中".repeat(8_000); // 8,000 chars > maxTokens, but ~2,000 estimated tokens < maxTokens
    assert(wide.length > 2500, "test setup: char count must exceed maxTokens to exercise the distinction");
    assert(estimateTokens(wide) < 2500, "test setup: real token estimate must stay under maxTokens");
    const { text, spilled } = await capHookOutput(wide, { maxTokens: 2500, spillPath: tmpDir });
    assertEquals(text, wide);
    assertEquals(spilled, undefined);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("a wide-character run that genuinely exceeds the token cap still spills", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const wide = "中".repeat(11_000); // ~2,750 estimated tokens > 2500 cap
    const { text, spilled } = await capHookOutput(wide, { maxTokens: 2500, spillPath: tmpDir });
    assert(spilled !== undefined);
    assert(text.length < 500);
    assertEquals(await Deno.readTextFile(spilled), wide);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("a spill failure falls back to inline truncation instead of throwing", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // A regular file, not a directory: writing "<spillPath>/<name>" under it fails.
    const notADir = `${tmpDir}/not-a-directory`;
    await Deno.writeTextFile(notADir, "occupied");
    const big = "x ".repeat(20_000);
    const { text, spilled } = await capHookOutput(big, { maxTokens: 2500, spillPath: notADir });
    assertEquals(spilled, undefined);
    assert(text.length < big.length, "fallback must still shrink the injected text");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("default cap is 2500 tokens when maxTokens is omitted", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const justUnder = "a".repeat(2500 * 4 - 4); // stays at or below the ceil(chars/4) cap
    const { spilled: notSpilled } = await capHookOutput(justUnder, { spillPath: tmpDir });
    assertEquals(notSpilled, undefined);

    const over = "a".repeat(2500 * 4 + 40);
    const { spilled } = await capHookOutput(over, { spillPath: tmpDir });
    assert(spilled !== undefined);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
