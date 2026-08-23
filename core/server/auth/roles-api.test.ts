import { assertEquals } from "jsr:@std/assert";
import { parseRoleAssignment } from "./roles-api.ts";

Deno.test("a role assignment needs both a user and a role name", () => {
  assertEquals(parseRoleAssignment({ userId: "u1", role: "USER_ADMIN" }), {
    userId: "u1",
    role: "USER_ADMIN",
  });
  for (const body of [null, undefined, {}, { userId: "u1" }, { role: "USER_ADMIN" },
                      { userId: "", role: "x" }, { userId: "u1", role: "  " }, "nope"]) {
    assertEquals(parseRoleAssignment(body), null, `expected null for ${JSON.stringify(body)}`);
  }
});

Deno.test("role names keep their exact spelling, including the dataset suffix", () => {
  // RESEARCHER.<tokenStudyCode> is parsed downstream by splitting on the first
  // dot; trimming or case-folding here would silently break that.
  const parsed = parseRoleAssignment({ userId: "u1", role: " RESEARCHER.Demo_Code " });
  assertEquals(parsed?.role, "RESEARCHER.Demo_Code");
});
