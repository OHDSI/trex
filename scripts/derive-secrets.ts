#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write
// Usage: derive-secrets.ts <secrets-dir>
//
// Ensures <secrets-dir>/root.env contains TREX_ROOT_KEY (generates 32 random
// bytes base64-encoded if missing). Then derives all per-purpose subkeys
// from the root and writes them to <secrets-dir>/derived.env in a format
// suitable for docker-compose env_file consumption.

import { deriveSubkey, deriveSubkeyBase64, LABELS, _resetRootKeyCache } from "../core/server/auth/keys.ts";

const dir = Deno.args[0];
if (!dir) {
  console.error("usage: derive-secrets.ts <secrets-dir>");
  Deno.exit(2);
}

await Deno.mkdir(dir, { recursive: true });

const rootPath = `${dir}/root.env`;
let rootKey: string;
let needsGenerate = false;
try {
  const existing = await Deno.readTextFile(rootPath);
  const match = existing.match(/^TREX_ROOT_KEY=(.+)$/m);
  if (!match) throw new Error("malformed root.env");
  rootKey = match[1].trim();
  console.error(`[derive-secrets] reusing existing root key from ${rootPath}`);
} catch (err) {
  if (!(err instanceof Deno.errors.NotFound)) {
    console.error(`[derive-secrets] FATAL: ${rootPath} exists but cannot be read or parsed: ${err}`);
    Deno.exit(1);
  }
  needsGenerate = true;
}
if (needsGenerate) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  rootKey = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/=+$/, "");
  await Deno.writeTextFile(rootPath, `TREX_ROOT_KEY=${rootKey}\n`, { mode: 0o600 });
  console.error(`[derive-secrets] generated new root key at ${rootPath}`);
}

Deno.env.set("TREX_ROOT_KEY", rootKey);
_resetRootKeyCache();

// We emit env var names exactly as each downstream service expects, so the
// compose env_file can be consumed directly without a translating
// `environment:` block (compose's ${VAR} interpolation runs at parse time,
// before env_file is loaded — so a translation layer would always see empty
// strings on first boot). Several services share the same underlying secret
// (the JWT signing key) under different names; that's intentional.
// The JWT signing key (HKDF label "trex.jwt.hs256.v1") is the shared HMAC
// secret used by core/server to SIGN access tokens, the anon key, and the
// service_role key. Every external service that VERIFIES those tokens
// (PostgREST, Studio's AUTH_JWT_SECRET path, Realtime's API/metrics JWTs)
// must receive the same key.
const jwtKey = await deriveSubkeyBase64(LABELS.jwtHs256);
const pgmeta = await deriveSubkeyBase64(LABELS.pgmetaAes);
// Realtime's SECRET_KEY_BASE: Erlang expects at least 64 chars. Concat two
// derivations from distinct labels and trim. The base64 slicing is acceptable
// here — the underlying HKDF output is 32 random bytes per label, and Erlang
// only needs ≥64 chars of opaque secret material, not full entropy.
const realtimeInternal = await deriveSubkeyBase64(LABELS.realtimeInternal);
const realtimeExtra = await deriveSubkeyBase64(LABELS.dekWrap);
const realtimeBase = (realtimeInternal + realtimeExtra).slice(0, 64);
// Realtime's DB_ENC_KEY must be exactly 16 chars (upstream AES-128 limit).
// Use the first 8 bytes of HKDF output hex-encoded so all 128 bits of key
// material come from the derivation; a base64 slice would only carry ~96
// bits of entropy across 16 chars (6 bits per char).
const realtimeDbEncBytes = (await deriveSubkey(LABELS.realtimeInternal)).slice(0, 8);
const realtimeDbEnc = Array.from(realtimeDbEncBytes, (b) => b.toString(16).padStart(2, "0")).join("");

const lines = [
  `PGRST_JWT_SECRET=${jwtKey}`,          // postgrest
  `PG_META_CRYPTO_KEY=${pgmeta}`,         // studio + pg-meta plugin
  `AUTH_JWT_SECRET=${jwtKey}`,            // studio (verifies trex-issued JWTs)
  `API_JWT_SECRET=${jwtKey}`,             // realtime (verifies trex-issued JWTs)
  `METRICS_JWT_SECRET=${jwtKey}`,         // realtime
  `SECRET_KEY_BASE=${realtimeBase}`,      // realtime (Erlang-internal)
  `DB_ENC_KEY=${realtimeDbEnc}`,          // realtime (internal AES-128)
];

const derivedPath = `${dir}/derived.env`;
await Deno.writeTextFile(derivedPath, lines.join("\n") + "\n", { mode: 0o600 });
console.error(`[derive-secrets] wrote ${lines.length} derived secrets to ${derivedPath}`);
