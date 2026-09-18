// The import is what lets tokens already in the wild keep validating: the
// jwks row's id IS the kid in the JWS header, so reusing it means relying
// parties do not have to re-fetch, re-register or re-authenticate.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one: DATABASE_URL is process-wide and every later DB-backed suite
// gates itself on it too.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { resolveSigningKey } from "better-auth/plugins";
import { _setDekForTests } from "../dek.ts";
import { _resetRootKeyCache } from "../keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * better-auth.ts derives its secret from TREX_ROOT_KEY at module evaluation
 * time and import-signing-key.ts pulls it in, so the variable has to be in
 * place before the import and handed back afterwards — keys.test.ts asserts
 * getRootKey throws without it.
 */
async function load() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      importer: await import("./import-signing-key.ts"),
      keys: await import("./keys.ts"),
      db: await import("../../db.ts"),
      auth: (await import("../better-auth.ts")).auth,
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

// The signing key is encrypted with the DEK, which boot normally unwraps from
// trexdb.kek_wrapped_dek with the root key. Pinning it here keeps the suite
// independent of TREX_ROOT_KEY at call time, which no other suite leaves set.
if (mod) _setDekForTests(new Uint8Array(32).map((_, i) => 200 - i));

/**
 * The pg pool is a singleton owned by ../../db.ts and outlives every test, so
 * the resource and op sanitizers would report it as a leak.
 */
function test(name: string, fn: (m: NonNullable<typeof mod>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(mod!),
  });
}

test("the existing signing key is imported under its own kid", async (m) => {
  // The importer is idempotent by design, so a second run of this suite against
  // the same database would otherwise see the row it wrote last time and report
  // `imported: false`. Clear it, not the oidc_signing_key row: the key trex
  // signs with must stay the key under test.
  m.keys._resetSigningKeyCache();
  const existing = await m.keys.getActiveSigningKey();
  await m.db.pool.query(`DELETE FROM trexdb.jwks WHERE id = $1`, [existing.kid]);

  const { kid, imported } = await m.importer.importOidcSigningKey();
  assertEquals(kid, existing.kid);
  assertEquals(imported, true);

  const row = await m.db.pool.query(
    `SELECT id, alg, "publicKey" FROM trexdb.jwks WHERE id = $1`,
    [existing.kid],
  );
  assertEquals(row.rows.length, 1);
  assertEquals(row.rows[0].alg, "RS256");
  // Copied verbatim, so the published JWKS entry is unchanged.
  assertEquals(JSON.parse(row.rows[0].publicKey), (await m.keys.getJwks()).keys[0]);
});

test("importing twice changes nothing", async (m) => {
  await m.importer.importOidcSigningKey();
  const second = await m.importer.importOidcSigningKey();
  assertEquals(second.imported, false);
});

test("the plugin signs with the imported key rather than minting a new one", async (m) => {
  // The column assertions above cannot see the one thing that matters at run
  // time: whether the plugin can actually get the private key back out. It
  // stores the ciphertext JSON-encoded and decrypts with JSON.parse, so a row
  // holding the bare ciphertext reads as a decryption failure — the plugin then
  // throws, or mints a fresh key, and every token in the wild stops verifying.
  // Ask the plugin's own resolver instead of re-implementing its unwrapping.
  await m.importer.importOidcSigningKey();
  const expected = await m.keys.getActiveSigningKey();

  const jwtPlugin = m.auth.options.plugins.find((p: { id: string }) => p.id === "jwt");
  assertNotEquals(jwtPlugin, undefined);

  const resolved = await resolveSigningKey(
    // deno-lint-ignore no-explicit-any
    { context: await m.auth.$context } as any,
    // deno-lint-ignore no-explicit-any
    (jwtPlugin as any).options,
  );
  assertEquals(resolved?.kid, expected.kid);
  assertEquals(resolved?.alg, "RS256");
});
