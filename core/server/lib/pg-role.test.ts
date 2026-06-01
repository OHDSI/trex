import { assertEquals } from "jsr:@std/assert";
import { pgRoleForUserRole } from "./pg-role.ts";

Deno.test("admin trex_role maps to service_role (BYPASSRLS)", () => {
  assertEquals(pgRoleForUserRole("admin"), "service_role");
});

Deno.test("user trex_role maps to authenticated", () => {
  assertEquals(pgRoleForUserRole("user"), "authenticated");
});

Deno.test("unknown/empty trex_role falls back to authenticated", () => {
  assertEquals(pgRoleForUserRole(""), "authenticated");
  assertEquals(pgRoleForUserRole("something-else"), "authenticated");
});
