import { assertEquals } from "jsr:@std/assert";
import { splitPathList } from "./utils.ts";

Deno.test("splitPathList splits colon-separated entries", () => {
  assertEquals(
    splitPathList("/usr/src/plugins-dev:/usr/src/plugins-dx"),
    ["/usr/src/plugins-dev", "/usr/src/plugins-dx"],
  );
});

Deno.test("splitPathList returns single entry when no colon", () => {
  assertEquals(splitPathList("./plugins-dev"), ["./plugins-dev"]);
});

Deno.test("splitPathList trims entries and drops empties", () => {
  assertEquals(
    splitPathList(" /a : :/b:"),
    ["/a", "/b"],
  );
});
