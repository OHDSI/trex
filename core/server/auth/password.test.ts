import { assertEquals } from "jsr:@std/assert";
import { MIN_PASSWORD_LENGTH, validatePasswordLength } from "./password.ts";

Deno.test("validatePasswordLength refuses a password shorter than the minimum", () => {
  assertEquals(validatePasswordLength("short"), "Password must be at least 8 characters");
  assertEquals(validatePasswordLength("a".repeat(MIN_PASSWORD_LENGTH - 1)), "Password must be at least 8 characters");
});

Deno.test("validatePasswordLength accepts a password of at least the minimum", () => {
  assertEquals(validatePasswordLength("a".repeat(MIN_PASSWORD_LENGTH)), null);
  assertEquals(validatePasswordLength("longenough"), null);
});

Deno.test("validatePasswordLength refuses a non-string password", () => {
  assertEquals(validatePasswordLength(12345678), "Password must be at least 8 characters");
  assertEquals(validatePasswordLength(null), "Password must be at least 8 characters");
});
