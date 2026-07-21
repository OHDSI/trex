import { createHash } from "node:crypto";

export const TTL_MS = 300_000; // 5 minutes

export const SEED_MODELS = [
  { value: "default", displayName: "Default (recommended)", description: "", supportsEffort: true },
  { value: "sonnet", displayName: "Sonnet", description: "", supportsEffort: true },
  { value: "haiku", displayName: "Haiku", description: "" },
];

export function seedResponse() {
  return { models: SEED_MODELS, source: "fallback" };
}

export function authKey(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function getCached(cache, key, now) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now > entry.expires) return null;
  return entry.models;
}

export function setCached(cache, key, models, now, ttlMs = TTL_MS) {
  cache.set(key, { models, expires: now + ttlMs });
}
