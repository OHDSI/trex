import { assertEquals } from "jsr:@std/assert";
import { nativeIdpEnabled } from "./native-idp.ts";

Deno.test("nativeIdpEnabled defaults to disabled (unset/empty/falsy)", () => {
  for (const v of [undefined, "", "0", "false", "no", "off", "disabled"]) {
    assertEquals(nativeIdpEnabled(v), false, `expected ${JSON.stringify(v)} -> false`);
  }
});

Deno.test("nativeIdpEnabled is true only for explicit truthy values", () => {
  for (const v of ["1", "true", "TRUE", " yes ", "on"]) {
    assertEquals(nativeIdpEnabled(v), true, `expected ${JSON.stringify(v)} -> true`);
  }
});
