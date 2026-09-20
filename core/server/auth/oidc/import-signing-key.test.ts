// The import is what lets tokens already in the wild keep validating: the
// jwks row's id IS the kid in the JWS header, so reusing it means relying
// parties do not have to re-fetch, re-register or re-authenticate.
//
// The legacy key is written here in SQL rather than minted through
// oidc/keys.ts, which the cutover deleted along with the provider it served.
// trexdb.oidc_signing_key is not dropped — it is the source the import reads,
// and on a real installation it holds the key the hand-written provider signed
// with — so the fixture is what that installation looks like.
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
      crypto: await import("../crypto.ts"),
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

interface LegacyKey {
  kid: string;
  jwk: Record<string, string>;
}

/**
 * The row the hand-written provider left behind: an RS256 private key stored
 * base64 PKCS#8 under the DEK, its public half as a JWK, and the kid every
 * id_token in the wild names. Rebuilt on each call so a re-run of this suite
 * against the same database is not testing a key it already imported.
 */
async function writeLegacyKey(m: NonNullable<typeof mod>): Promise<LegacyKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const pkcs8 = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
    ),
  );
  const kid = crypto.randomUUID().replaceAll("-", "");
  const jwk = {
    kid,
    kty: publicJwk.kty ?? "RSA",
    alg: "RS256",
    use: "sig",
    n: publicJwk.n ?? "",
    e: publicJwk.e ?? "AQAB",
  };

  // The importer takes the newest active row, so the previous one is retired
  // rather than left to race with this fixture.
  await m.db.pool.query(`UPDATE trexdb.oidc_signing_key SET is_active = false WHERE is_active`);
  await m.db.pool.query(
    `INSERT INTO trexdb.oidc_signing_key (kid, alg, private_key_encrypted, public_jwk, is_active)
     VALUES ($1, 'RS256', $2, $3, true)`,
    [kid, await m.crypto.encryptSecret(pkcs8), JSON.stringify(jwk)],
  );
  return { kid, jwk };
}

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
  const legacy = await writeLegacyKey(m);

  const { kid, imported } = await m.importer.importOidcSigningKey();
  assertEquals(kid, legacy.kid);
  assertEquals(imported, true);

  const row = await m.db.pool.query(
    `SELECT id, alg, "publicKey" FROM trexdb.jwks WHERE id = $1`,
    [legacy.kid],
  );
  assertEquals(row.rows.length, 1);
  assertEquals(row.rows[0].alg, "RS256");
  // Copied verbatim, so the published JWKS entry is unchanged.
  assertEquals(JSON.parse(row.rows[0].publicKey), legacy.jwk);
});

test("importing twice changes nothing", async (m) => {
  await writeLegacyKey(m);
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
  const legacy = await writeLegacyKey(m);
  await m.importer.importOidcSigningKey();

  const jwtPlugin = m.auth.options.plugins.find((p: { id: string }) => p.id === "jwt");
  assertNotEquals(jwtPlugin, undefined);

  const resolved = await resolveSigningKey(
    // deno-lint-ignore no-explicit-any
    { context: await m.auth.$context } as any,
    // deno-lint-ignore no-explicit-any
    (jwtPlugin as any).options,
  );
  assertEquals(resolved?.kid, legacy.kid);
  assertEquals(resolved?.alg, "RS256");
});
