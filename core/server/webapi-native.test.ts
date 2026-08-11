import { assertEquals } from "jsr:@std/assert";
import { startNativeWebApi, WEBAPI_NATIVE_ENABLED } from "./webapi-native.ts";

// The start call used to sit inside d2eBoot(), so it only ran when D2E_COMPAT
// was set. It is on by default now, independent of that flag — a deployment
// that wants nothing else from d2e compatibility still gets its WebAPI.
Deno.test("native WebAPI is enabled by default", () => {
  assertEquals(WEBAPI_NATIVE_ENABLED, true);
});

// Boot must survive an image with no webapi extension (or an arch where it
// will not load): the node still has to come up and serve everything else.
// There is no global Trex binding under `deno test`, so this exercises the
// failure path.
Deno.test("startNativeWebApi never throws when the extension is unavailable", async () => {
  await startNativeWebApi();
});
