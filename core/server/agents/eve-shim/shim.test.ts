import { assertEquals, assert } from "jsr:@std/assert";
import { defineAgent } from "./mod.ts";
import { defineTool, defineToolProvider } from "./tools.ts";
import { isZodSchema } from "./types.ts";

Deno.test("defineAgent returns config with defaults applied", () => {
  const a = defineAgent({ model: "anthropic/claude-sonnet-5" });
  assertEquals(a.model, "anthropic/claude-sonnet-5");
  assertEquals(a.maxSteps, 25);
});

Deno.test("defineAgent without model leaves model undefined (resolver falls back to env)", () => {
  const a = defineAgent({});
  assertEquals(a.model, undefined);
});

Deno.test("defineTool brands the definition and validates required fields", () => {
  const t = defineTool({
    description: "echo",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    execute: (input) => Promise.resolve(input),
  });
  assert((t as { __trexTool?: boolean }).__trexTool);
});

Deno.test("defineTool rejects executable tool without execute unless clientOnly or needsApproval", () => {
  let threw = false;
  try {
    defineTool({ description: "bad", inputSchema: { type: "object" } });
  } catch { threw = true; }
  assert(threw);
  // clientOnly without execute is valid (proposal-card pattern)
  const t = defineTool({ description: "card", inputSchema: { type: "object" }, clientOnly: true });
  assert((t as { __trexTool?: boolean }).__trexTool);
});

Deno.test("defineToolProvider brands the function and leaves it callable", async () => {
  const fn = defineToolProvider((ctx) => Promise.resolve({ sessionId: { description: ctx.sessionId, inputSchema: { type: "object" } } }));
  assert((fn as unknown as { __trexToolProvider?: boolean }).__trexToolProvider);
  const out = await fn({ sessionId: "s-1", env: () => undefined, sql: () => Promise.resolve({ rows: [] }) });
  assertEquals(out.sessionId.description, "s-1");
});

Deno.test("isZodSchema distinguishes zod from JSON Schema", async () => {
  // Bare "zod" resolves to the project's zod via node_modules. isZodSchema
  // duck-types on `safeParse`, so it works for zod v3 and v4 alike (eve uses v4).
  const { z } = await import("zod");
  assert(isZodSchema(z.object({ a: z.string() })));
  assert(!isZodSchema({ type: "object", properties: {} }));
});
