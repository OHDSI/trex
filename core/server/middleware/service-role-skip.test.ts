import { assertEquals } from "jsr:@std/assert";
import { _resetRootKeyCache } from "../auth/keys.ts";
import { _resetJwtSecretCache, generateAnonKey, generateServiceRoleKey, signAccessToken } from "../auth/jwt.ts";
import { isServiceRoleBearer } from "./service-role-skip.ts";

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

function setRoot() {
  _resetRootKeyCache();
  _resetJwtSecretCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

Deno.test("no Authorization header is not service-role", async () => {
  setRoot();
  assertEquals(await isServiceRoleBearer(undefined), false);
});

Deno.test("a non-Bearer header is not service-role", async () => {
  setRoot();
  assertEquals(await isServiceRoleBearer("Basic abc123"), false);
});

Deno.test("a garbage bearer token is not service-role", async () => {
  setRoot();
  assertEquals(await isServiceRoleBearer("Bearer not-a-real-jwt"), false);
});

Deno.test("an ordinary user's access token is not service-role", async () => {
  setRoot();
  const token = await signAccessToken(
    { id: "u1", email: "a@x.test", role: "user" },
    "sess1",
  );
  assertEquals(await isServiceRoleBearer(`Bearer ${token}`), false);
});

Deno.test("the anon key is not service-role", async () => {
  setRoot();
  const anon = await generateAnonKey();
  assertEquals(await isServiceRoleBearer(`Bearer ${anon}`), false);
});

Deno.test("a valid service_role key is service-role", async () => {
  setRoot();
  const key = await generateServiceRoleKey();
  assertEquals(await isServiceRoleBearer(`Bearer ${key}`), true);
});
