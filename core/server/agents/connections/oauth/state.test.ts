import { assert, assertEquals } from "jsr:@std/assert";
import { signState, type StatePayload, verifyState } from "./state.ts";

const SECRET = "test-server-secret-0123456789";

function payload(over: Partial<StatePayload> = {}): StatePayload {
  return {
    session: "s-1",
    principalType: "user",
    principalId: "u-1",
    connector: "github",
    nonce: "nonce-abc",
    exp: Date.now() + 600_000,
    ...over,
  };
}

Deno.test("signState/verifyState round-trip returns the payload", async () => {
  const p = payload();
  const signed = await signState(p, SECRET);
  const v = await verifyState(signed, SECRET);
  assert(v.ok);
  assertEquals(v.payload, p);
});

Deno.test("verifyState rejects a tampered payload (MAC no longer matches)", async () => {
  const signed = await signState(payload({ principalId: "u-1" }), SECRET);
  const [body, sig] = signed.split(".");
  // Re-encode a body that swaps the principal to someone else's id, keep the sig.
  const forgedBody = btoa(JSON.stringify(payload({ principalId: "victim" })))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const v = await verifyState(`${forgedBody}.${sig}`, SECRET);
  assert(!v.ok);
  assertEquals(v.reason, "bad_signature");
  // Also: a flipped signature byte is rejected.
  const flipped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
  const v2 = await verifyState(`${body}.${flipped}`, SECRET);
  assert(!v2.ok);
});

Deno.test("verifyState rejects a state signed with a different secret", async () => {
  const signed = await signState(payload(), SECRET);
  const v = await verifyState(signed, "some-other-secret");
  assert(!v.ok);
  assertEquals(v.reason, "bad_signature");
});

Deno.test("verifyState rejects an expired state", async () => {
  const now = 1_000_000_000_000;
  const signed = await signState(payload({ exp: now - 1 }), SECRET);
  const v = await verifyState(signed, SECRET, now);
  assert(!v.ok);
  assertEquals(v.reason, "expired");
});

Deno.test("verifyState accepts a not-yet-expired state at `now`", async () => {
  const now = 1_000_000_000_000;
  const signed = await signState(payload({ exp: now + 1 }), SECRET);
  const v = await verifyState(signed, SECRET, now);
  assert(v.ok);
});

Deno.test("verifyState rejects malformed strings", async () => {
  for (const bad of ["", "no-dot", ".", "a.", ".b", "notbase64!.sig"]) {
    const v = await verifyState(bad, SECRET);
    assert(!v.ok, `expected reject for ${JSON.stringify(bad)}`);
  }
});
