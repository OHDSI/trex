import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildCoderContext } from "./coder_context.ts";
import { resolveCoderProfile } from "./coder_profile.ts";

Deno.test("the default profile is ui and changes nothing", () => {
  const p = resolveCoderProfile({});
  assertEquals(p.name, "ui");
  assertEquals(p.basePrompt, null);
  assertEquals(p.denyTools, []);
  assertEquals(p.blockingQuestions, true);
});

Deno.test("remoteChannel selects the channel profile", () => {
  const p = resolveCoderProfile({ remoteChannel: true });
  assertEquals(p.name, "channel");
  assertEquals(p.blockingQuestions, false);
});

Deno.test("the channel profile denies the preview-panel tools", () => {
  const p = resolveCoderProfile({ remoteChannel: true });
  for (const t of ["RestartApp", "RefreshPreview", "GenerateImage"]) {
    assertEquals(p.denyTools.includes(t), true, t);
  }
});

Deno.test("the channel base prompt states the gate protocol and drops the preview framing", () => {
  const p = resolveCoderProfile({ remoteChannel: true });
  assertStringIncludes(p.basePrompt!, "STOP after the step");
  assertEquals(p.basePrompt!.includes("iframe"), false);
});

// Every locked chat observed in production began with the coder leaving a
// foreign branch checked out at turn end. The guard recovers regardless
// (chat_worktree.ts), but the coder should not be creating the state at all.
Deno.test("the coder prompt tells the coder to finish on the branch it was given", async () => {
  const { systemPrompt } = await buildCoderContext({ mode: "build", remoteChannel: true });
  assertStringIncludes(systemPrompt, "<worktree-hygiene>");
  assertStringIncludes(systemPrompt, "switch BACK to the branch you started on");
  assertStringIncludes(systemPrompt, "half-finished");
  assertStringIncludes(systemPrompt, "Never rename or delete the branch you were given.");
});
