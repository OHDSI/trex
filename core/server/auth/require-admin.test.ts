import { assertEquals } from "jsr:@std/assert";
import { _resetRootKeyCache } from "./keys.ts";
import { _resetJwtSecretCache, generateServiceRoleKey, signAccessToken } from "./jwt.ts";
import { requireAdmin } from "./require-admin.ts";

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

function setRoot() {
  _resetRootKeyCache();
  _resetJwtSecretCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

// Minimal fake req/res: requireAdmin only reads req.headers.authorization and
// calls res.status(n).json(body) on refusal.
// deno-lint-ignore no-explicit-any
function fakeReq(authorization?: string): any {
  return { headers: authorization ? { authorization } : {} };
}

function fakeRes() {
  const calls: { status?: number; body?: unknown } = {};
  return {
    calls,
    // deno-lint-ignore no-explicit-any
    status(code: number): any {
      calls.status = code;
      return {
        json(body: unknown) {
          calls.body = body;
        },
      };
    },
  };
}

Deno.test("requireAdmin refuses a missing Authorization header with 401", async () => {
  setRoot();
  const res = fakeRes();
  const ok = await requireAdmin(fakeReq(), res as never);
  assertEquals(ok, false);
  assertEquals(res.calls.status, 401);
});

Deno.test("requireAdmin refuses an invalid token with 401", async () => {
  setRoot();
  const res = fakeRes();
  const ok = await requireAdmin(fakeReq("Bearer not-a-real-jwt"), res as never);
  assertEquals(ok, false);
  assertEquals(res.calls.status, 401);
});

Deno.test("requireAdmin refuses an ordinary user's token with 403", async () => {
  setRoot();
  const token = await signAccessToken(
    { id: "u1", email: "a@x.test", role: "user" },
    "sess1",
  );
  const res = fakeRes();
  const ok = await requireAdmin(fakeReq(`Bearer ${token}`), res as never);
  assertEquals(ok, false);
  assertEquals(res.calls.status, 403);
});

Deno.test("requireAdmin passes a token whose app_metadata.trex_role is admin", async () => {
  setRoot();
  const token = await signAccessToken(
    { id: "u1", email: "a@x.test", role: "admin" },
    "sess1",
  );
  const res = fakeRes();
  const ok = await requireAdmin(fakeReq(`Bearer ${token}`), res as never);
  assertEquals(ok, true);
  assertEquals(res.calls.status, undefined);
});

Deno.test("requireAdmin passes the service_role key", async () => {
  setRoot();
  const key = await generateServiceRoleKey();
  const res = fakeRes();
  const ok = await requireAdmin(fakeReq(`Bearer ${key}`), res as never);
  assertEquals(ok, true);
  assertEquals(res.calls.status, undefined);
});
