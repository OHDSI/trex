// V16's DO block and placeholderLocalPart() slugify the same identifiers into
// the same addresses, in SQL and in TypeScript, and they cannot share code: a
// V-file is handed to the session verbatim and checksummed into
// refinery_schema_history (plugins/migration/src/lib.rs), so it can hold no
// call into the server. The rule is therefore written twice, and the only thing
// that can keep the two honest is a test that runs both.
//
// It matters because both run over the same rows: V16 backfills the users that
// existed at the cutover, providers.ts mints the ones that arrive afterwards.
// A user the migration addressed and the same user re-provisioned later must
// land on the same address, or a re-provision collides with — or worse, fails
// to recognise — the row the migration wrote.
//
// The SQL side is read out of V16 rather than restated here: a copy would be a
// third place to drift. Editing V16's expression changes what this test runs.
//
// ASCII only, by design. JS `toLowerCase()` expands U+0130 (İ) to `i` + U+0307,
// so `İstanbul` slugifies to `i-stanbul` here and to `istanbul` in Postgres,
// whose `lower()` is locale-dependent besides. That divergence is known,
// bounded to identifiers holding a character whose lowercase is more than one
// code point, and documented on placeholderLocalPart() — asserting it would
// pin a behaviour neither side intends.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { placeholderLocalPart } from "./providers.ts";

const V16_PATH = new URL(
  "../../../schema/V16__better_auth_canonical_tables.sql",
  import.meta.url,
);

const v16 = await Deno.readTextFile(V16_PATH);

/**
 * One slug expression lifted out of V16, with the row reference it reads
 * swapped for a bind parameter so it can be evaluated on its own.
 *
 * Both call sites are extracted, not just the one the parity table runs:
 * V16 slugifies twice — once for the user id, once for the sign-in id — and an
 * edit to only one of them is drift the table alone would not see.
 */
function slugExpression(pattern: RegExp, argument: string): string {
  const m = v16.match(pattern);
  assert(
    m,
    `V16 no longer contains a slug assignment matching ${pattern} — this test ` +
      `extracts the SQL it compares, so update the pattern rather than deleting it`,
  );
  const sql = m[1].replace(argument, "$1::text").replace(/\s+/g, " ").trim();
  assert(
    sql.includes("$1::text"),
    `V16's slug expression no longer reads ${argument}: ${sql}`,
  );
  return sql;
}

const idSlug = slugExpression(
  /id_local_part\s*:=\s*([\s\S]+?);\s*\n/,
  "r.id",
);
const signInSlug = slugExpression(
  /\n\s*local_part\s*:=\s*(btrim\([\s\S]+?);\s*\n/,
  "COALESCE(r.sign_in_id, r.id)",
);

Deno.test("V16 slugifies the sign-in id and the user id by one rule", () => {
  // Both now read `lower($1::text)`, so any remaining difference is a
  // difference in the rule itself. Compared with the layout taken out: the two
  // assignments are formatted differently in the file and always were.
  assertEquals(signInSlug.replace(/\s/g, ""), idSlug.replace(/\s/g, ""));
  assertMatch(idSlug, /^btrim\(regexp_replace\(lower\(\$1::text\)/);
});

/**
 * Shapes a real `sub` claim takes, plus the ones that exercise every branch of
 * the expression: characters outside the allowed set collapsing to a single
 * dash, leading and trailing punctuation trimmed, and nothing usable left at
 * all. Underscores are in the allowed set and are NOT trimmed, which is easy to
 * get wrong in only one of the two implementations.
 */
const INPUTS = [
  "jo",
  "Jo.Smith_1-2",
  "JOSMITH",
  "auth0|5f3c9d",
  "CN=Jo Smith,OU=People",
  "user+tag@example.test",
  "00000000-0000-4000-8000-000000000000",
  "a b\tc\nd",
  "..leading",
  "trailing..",
  "--dashed--",
  "-.mixed.-",
  "a...b",
  // A run of allowed characters that a narrower character class would collapse
  // to one: the difference between keeping `-` in the class and dropping it is
  // invisible on every other input here.
  "a--b",
  "a-_-b",
  "___",
  "_edge_",
  "@@@",
  ".",
  "-",
  "",
  " ",
  "100%",
  "o'brien",
  'quote"d',
  "back\\slash",
  "semi;colon",
];

Deno.test({
  name: "[db] V16's slug expression and placeholderLocalPart agree on ASCII",
  // Gated like every other database-backed auth suite: the SQL half can only
  // be evaluated by Postgres. CI asserts nothing here is skipped.
  ignore: !Deno.env.get("DATABASE_URL"),
  fn: async () => {
    const { Client } = await import("npm:pg");
    const db = new Client({ connectionString: Deno.env.get("DATABASE_URL") });
    await db.connect();
    try {
      for (const input of INPUTS) {
        const { rows } = await db.query(`SELECT ${idSlug} AS slug`, [input]);
        assertEquals(
          rows[0].slug,
          placeholderLocalPart(input),
          `V16 and placeholderLocalPart disagree on ${JSON.stringify(input)}`,
        );
      }
    } finally {
      await db.end();
    }
  },
});
