import { deriveSubkey, LABELS } from "./keys.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let _dek: Uint8Array | null = null;

export function _resetDekCache(): void { _dek = null; }
/** Test-only hook. Caller must pass a 32-byte Uint8Array — this is unchecked. */
export function _setDekForTests(dek: Uint8Array): void { _dek = dek; }

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "AES-GCM", length: 256 }, false, usages);
}

function b64encode(b: Uint8Array): string {
  return btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Wrap a DEK with the KEK (subkey LABELS.dekWrap). Returns base64(iv || ciphertext+tag). */
export async function wrapDek(dek: Uint8Array): Promise<string> {
  const kek = await importAesKey(await deriveSubkey(LABELS.dekWrap), ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, kek, dek.buffer as ArrayBuffer),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64encode(out);
}

/** Reverse of wrapDek. Throws on tag mismatch. */
export async function unwrapDek(wrapped: string): Promise<Uint8Array> {
  const buf = b64decode(wrapped);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const kek = await importAesKey(await deriveSubkey(LABELS.dekWrap), ["decrypt"]);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, kek, ct.buffer as ArrayBuffer),
  );
  if (pt.length !== 32) throw new Error(`unwrapped DEK has wrong length: ${pt.length}`);
  return pt;
}

/**
 * Initialize the in-memory DEK from the trexdb.kek_wrapped_dek row marked
 * active=true. If no row exists, generate a new DEK, wrap it, persist as
 * version 1, mark active, and cache it.
 *
 * Must be called once at boot before any encryptWithDek/decryptWithDek call.
 */
export async function initDek(pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ wrapped: string }> }> }): Promise<void> {
  if (_dek) return;
  const existing = await pool.query(
    "SELECT wrapped FROM trexdb.kek_wrapped_dek WHERE active = true LIMIT 1",
  );
  if (existing.rows.length > 0) {
    _dek = await unwrapDek(existing.rows[0].wrapped);
    return;
  }
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  // ON CONFLICT(version) only absorbs the primary-key conflict. The partial
  // unique index `kek_wrapped_dek_one_active` is a separate arbiter, and a
  // concurrent first-boot from another replica can trip it before the PK
  // check fires. Swallow the unique-violation here and fall through to the
  // re-read branch below — whichever process won the race left the canonical
  // active row, and unwrapping it gives every replica the same DEK.
  try {
    await pool.query(
      `INSERT INTO trexdb.kek_wrapped_dek (version, wrapped, active)
       VALUES (1, $1, TRUE)
       ON CONFLICT (version) DO NOTHING`,
      [wrapped],
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // 23505 = unique_violation. Anything else is a real error.
    if (code !== "23505") throw err;
  }
  // Re-read: pick up whichever row ended up active. On a clean race, that's
  // either our insert or the other node's. If neither inserted (because a
  // stale inactive version=1 row already existed and blocked the ON CONFLICT),
  // promote it to active and use it — its wrap is still valid under the
  // current KEK.
  const after = await pool.query(
    "SELECT wrapped FROM trexdb.kek_wrapped_dek WHERE active = true LIMIT 1",
  );
  if (after.rows.length > 0) {
    _dek = await unwrapDek(after.rows[0].wrapped);
    return;
  }
  const fallback = await pool.query(
    "SELECT wrapped FROM trexdb.kek_wrapped_dek WHERE version = 1 LIMIT 1",
  );
  if (fallback.rows.length === 0) {
    throw new Error("initDek: no kek_wrapped_dek row present after insert; check DB connectivity and migration state");
  }
  await pool.query("UPDATE trexdb.kek_wrapped_dek SET active = TRUE WHERE version = 1 AND active = false");
  _dek = await unwrapDek(fallback.rows[0].wrapped);
}

export function getDek(): Uint8Array {
  if (!_dek) throw new Error("DEK not initialized; call initDek() at boot");
  return _dek;
}

export async function encryptWithDek(plaintext: string): Promise<string> {
  const key = await importAesKey(getDek(), ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, encoder.encode(plaintext).buffer as ArrayBuffer),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64encode(out);
}

export async function decryptWithDek(encrypted: string): Promise<string> {
  const buf = b64decode(encrypted);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const key = await importAesKey(getDek(), ["decrypt"]);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer),
  );
  return decoder.decode(pt);
}
