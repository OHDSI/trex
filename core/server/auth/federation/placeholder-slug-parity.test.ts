// V17's DO block and placeholderLocalPart() slugify the same identifiers into
// the same addresses, in SQL and in TypeScript, and they cannot share code: a
// V-file is handed to the session verbatim and checksummed into
// refinery_schema_history (plugins/migration/src/lib.rs), so it can hold no
// call into the server. The rule is therefore written twice, and the only thing
// that can keep the two honest is a test that runs both.
//
// It matters because both run over the same rows: V17 backfills the users that
// existed at the cutover, providers.ts mints the ones that arrive afterwards.
// A user the migration addressed and the same user re-provisioned later must
// land on the same address, or a re-provision collides with — or worse, fails
// to recognise — the row the migration wrote.
//
// The SQL side is read out of V17 rather than restated here: a copy would be a
// third place to drift. Editing V17's expression changes what this test runs.
//
// ASCII only, by design. JS `toLowerCase()` expands U+0130 (İ) to `i` + U+0307,
// so `İstanbul` slugifies to `i-stanbul` here and to `istanbul` in Postgres,
// whose `lower()` is locale-dependent besides. That divergence is known,
// bounded to identifiers holding a character whose lowercase is more than one
// code point, and documented on placeholderLocalPart() — asserting it would
// pin a behaviour neither side intends.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { PLACEHOLDER_EMAIL_DOMAIN, placeholderLocalPart } from "./providers.ts";

const V17_PATH = new URL("../../../schema/V17__better_auth.sql", import.meta.url);

const v17 = await Deno.readTextFile(V17_PATH);

/**
 * One slug expression lifted out of V17, with the row reference it reads
 * swapped for a bind parameter so it can be evaluated on its own.
 *
 * Both call sites are extracted, not just the one the parity table runs:
 * V17 slugifies twice — once for the user id, once for the sign-in id — and an
 * edit to only one of them is drift the table alone would not see.
 */
function slugExpression(pattern: RegExp, argument: string): string {
  const m = v17.match(pattern);
  assert(
    m,
    `V17 no longer contains a slug assignment matching ${pattern} — this test ` +
      `extracts the SQL it compares, so update the pattern rather than deleting it`,
  );
  const sql = m[1].replace(argument, "$1::text").replace(/\s+/g, " ").trim();
  assert(
    sql.includes("$1::text"),
    `V17's slug expression no longer reads ${argument}: ${sql}`,
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

Deno.test("V17 slugifies the sign-in id and the user id by one rule", () => {
  // Both now read `lower($1::text)`, so any remaining difference is a
  // difference in the rule itself. Compared with the layout taken out: the two
  // assignments are formatted differently in the file and always were.
  assertEquals(signInSlug.replace(/\s/g, ""), idSlug.replace(/\s/g, ""));
  // The inner substitution is the one that maps the disallowed characters; the
  // outer one collapses the runs of `.` that the inner one leaves behind.
  // Pinned as a shape so an edit that drops either pass is visible here even
  // before the table below disagrees.
  assertMatch(
    idSlug.replace(/\s/g, ""),
    /^btrim\(regexp_replace\(regexp_replace\(lower\(\$1::text\),'\[\^a-z0-9\._-\]\+','-','g'\),'\\\.\{2,\}','\.','g'\),'-\.'\)$/,
  );
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
  // Dot runs, which are the shapes that used to mint an address with an empty
  // atom — one the engine rejects and V17 then refuses to migrate past, over a
  // row V17 itself had just written. Interior, adjacent to a dash, doubled up,
  // and alone.
  "foo..bar",
  "a..b..c",
  "..",
  "...",
  "a.-.b",
  ".-.",
  "x..",
  "..x",
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
  name: "[db] V17's slug expression and placeholderLocalPart agree on ASCII",
  // Gated like every other database-backed auth suite: the SQL half can only
  // be evaluated by Postgres. CI asserts nothing here is skipped.
  ignore: !Deno.env.get("DATABASE_URL"),
  fn: async () => {
    const { Client } = await import("npm:pg");
    // The predicate V17's own refusal uses, so the two claims below are about
    // one rule: that the addresses this mints are addresses the engine accepts,
    // and therefore that the migration can never abort over a row it wrote.
    const { isEngineAddressable } = await import("../auth-router.ts");
    const db = new Client({ connectionString: Deno.env.get("DATABASE_URL") });
    await db.connect();
    try {
      for (const input of INPUTS) {
        const { rows } = await db.query(`SELECT ${idSlug} AS slug`, [input]);
        const slug = rows[0].slug;
        assertEquals(
          slug,
          placeholderLocalPart(input),
          `V17 and placeholderLocalPart disagree on ${JSON.stringify(input)}`,
        );

        // An empty slug is the caller's problem and both sides refuse it out
        // loud. Anything else becomes an address, and an address the engine
        // will not accept is one V17 refuses to migrate past — over a row V17
        // itself wrote one statement earlier.
        if (slug !== "") {
          assert(
            isEngineAddressable(`${slug}@${PLACEHOLDER_EMAIL_DOMAIN}`),
            `${JSON.stringify(input)} mints ${slug}@${PLACEHOLDER_EMAIL_DOMAIN}, ` +
              `which the engine rejects and V17 would refuse to migrate`,
          );
        }
      }
    } finally {
      await db.end();
    }
  },
});
