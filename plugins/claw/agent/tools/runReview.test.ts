import { assertEquals } from "jsr:@std/assert";
import { availabilityFrom } from "./runReview.ts";

Deno.test("code and security are always available", () => {
  const got = availabilityFrom({ devServerRunning: false });
  assertEquals(got.available, ["code", "security"]);
});

Deno.test("qa and design need the dev server and say so when missing", () => {
  const got = availabilityFrom({ devServerRunning: false });
  assertEquals(got.unavailable, [
    { kind: "qa", reason: "the app's dev server is not running" },
    { kind: "design", reason: "the app's dev server is not running" },
  ]);
});

Deno.test("everything is available with a dev server", () => {
  const got = availabilityFrom({ devServerRunning: true });
  assertEquals(got.available, ["code", "security", "qa", "design"]);
  assertEquals(got.unavailable, []);
});
