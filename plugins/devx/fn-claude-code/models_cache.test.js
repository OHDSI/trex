import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_MODELS, seedResponse, authKey, getCached, setCached, TTL_MS } from "./models_cache.js";

test("SEED_MODELS has the agreed fallback set", () => {
  assert.deepEqual(SEED_MODELS.map((m) => m.value), ["default", "sonnet", "haiku"]);
  assert.equal(SEED_MODELS[0].displayName, "Default (recommended)");
  assert.equal(SEED_MODELS.find((m) => m.value === "sonnet").supportsEffort, true);
});

test("seedResponse wraps SEED_MODELS with source=fallback", () => {
  assert.deepEqual(seedResponse(), { models: SEED_MODELS, source: "fallback" });
});

test("authKey is a stable sha256 hex, not the raw token", () => {
  const k = authKey("secret-token");
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.notEqual(k, "secret-token");
  assert.equal(k, authKey("secret-token"));
});

test("cache returns value within TTL and null after it", () => {
  const cache = new Map();
  const models = [{ value: "sonnet", displayName: "Sonnet", description: "" }];
  setCached(cache, "k", models, 1000);
  assert.equal(getCached(cache, "k", 1000), models);
  assert.equal(getCached(cache, "k", 1000 + TTL_MS - 1), models);
  assert.equal(getCached(cache, "k", 1000 + TTL_MS + 1), null);
});

test("cache isolates keys", () => {
  const cache = new Map();
  setCached(cache, "a", [{ value: "haiku", displayName: "Haiku", description: "" }], 0);
  assert.equal(getCached(cache, "b", 0), null);
});
