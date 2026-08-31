// Phase 4 Task 4: devx.settings.loop selected between two chat loops; Task 2
// deleted the client-side router that read it, so the flag now chooses
// between one option and the Settings UI's "Chat Engine" toggle controls
// nothing. This asserts the dead field and its UI control are gone from the
// PUT/GET /settings handlers and SettingsPage.tsx — source-text checks, same
// pattern as prompt_divergence.test.ts, because index.ts's route handlers
// aren't unit-testable in isolation. The DB column itself is intentionally
// left in place (see V22 migration comment), and "loop" as an ordinary
// English word (dev-server poll loop, agent loop steps, etc.) is untouched
// elsewhere in both files — these checks are scoped to the flag's specific
// tokens, not a blanket word-boundary scan.
import { assertEquals } from "jsr:@std/assert";

Deno.test("PUT /settings no longer validates or writes body.loop", async () => {
  const src = await Deno.readTextFile("plugins/devx/functions/index.ts");
  assertEquals(src.includes("body.loop"), false, "index.ts still reads body.loop");
  assertEquals(src.includes("hasLoopUpdate"), false, "index.ts still tracks hasLoopUpdate");
  assertEquals(src.includes("EXCLUDED.loop"), false, "PUT /settings still writes the loop column");
  assertEquals(src.includes("loop must be"), false, "loop validation error message still present");
});

Deno.test("GET/PUT /settings no longer select or return the loop column", async () => {
  const src = await Deno.readTextFile("plugins/devx/functions/index.ts");
  assertEquals(src.includes("devx.settings.loop"), false, "index.ts still references devx.settings.loop");
  // Column appears in SELECT/INSERT/RETURNING lists immediately followed by
  // git_author_name in all three sites (GET SELECT, PUT INSERT columns, PUT
  // RETURNING) — a single substring check catches all of them.
  assertEquals(src.includes("loop, git_author_name"), false, "a settings column list still names loop");
});

Deno.test("SettingsPage.tsx no longer renders the Chat Engine toggle", async () => {
  const src = await Deno.readTextFile("plugins/devx/src/pages/SettingsPage.tsx");
  assertEquals(src.includes("Chat Engine"), false, "Chat Engine toggle markup still present");
  assertEquals(src.includes("setLoop"), false, "loop state setter still present");
  assertEquals(src.includes("settings.loop"), false, "SettingsPage.tsx still reads settings.loop");
  assertEquals(/devx\.settings\.loop|useEffectiveLoop/.test(src), false, "stale loop-flag comment still present");
});
