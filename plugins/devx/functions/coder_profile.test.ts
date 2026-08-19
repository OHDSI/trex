import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
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
