-- An email address is a case-insensitive identity, and the database has to be
-- the thing that says so.
--
-- Three places disagreed. V1 declared `email TEXT NOT NULL UNIQUE`, which is a
-- case-SENSITIVE index; auth-router's fetchUserByEmail matched `email = $1`,
-- also case-sensitive, and /signup used it as its duplicate check; federation's
-- findLinkCandidateByEmail matched `lower(email) = lower($1)`. The gap between
-- them is an account takeover: on a deployment with self-registration on, an
-- attacker signs up as `VICTIM@corp.com` while the victim holds
-- `victim@corp.com` — the duplicate check misses it and this UNIQUE index
-- accepts it — and the victim's next federated sign-in lower-matches, finds the
-- attacker's row and links the victim's verified upstream identity onto it.
--
-- Closing it in the code alone leaves the database able to hold the colliding
-- pair, so any path that inserts without asking first (the MCP user-create
-- tool, an operator's psql session, a restore) re-opens it. This index is the
-- invariant: at most one user per address, whatever case it is written in. The
-- stored spelling is untouched — this is unique-by-case-folded-value, not
-- normalisation, so an address keeps the capitalisation its owner typed.
--
-- NULL emails stay unconstrained. lower(NULL) is NULL and Postgres does not
-- compare NULLs, so the address-less federated users V14 exists for still
-- coexist freely.
--
-- V1's UNIQUE(email) is left in place. It is subsumed by this index (unique
-- case-folded implies unique exact), and dropping a constraint that has stood
-- since V1 is a separate change with its own blast radius.
--
-- ── Policy on rows that already collide ─────────────────────────────────────
--
-- Neither row wins, nothing is deleted, nothing is merged, and the migration
-- refuses to apply. Both rows are real accounts: one may own dashboards, roles,
-- credentials and sessions, and picking a survivor by age or by id would pick
-- the attacker's row exactly as often as the victim's. There is no evidence in
-- the schema for which is which, so there is no safe automatic resolution and
-- this fails loudly instead, naming every conflicting address so an operator
-- can decide.
--
-- Resolving one means changing or removing an address, not just soft-deleting a
-- row: `"deletedAt"` does not free the address, and this index spans deleted
-- rows on purpose (the same way UNIQUE(email) always has, which admin-store's
-- pre-link path relies on to refuse a requested id whose address is taken).
--
-- trexsql's boot logs a failed migration and carries on serving (src/main.rs),
-- so refusing here costs the operator a startup warning and a retry on the next
-- boot, not an outage — and until they act, findLinkCandidateByEmail refuses to
-- resolve the ambiguous address rather than guessing.
DO $$
DECLARE
  conflicting text;
BEGIN
  SELECT string_agg(addr, ', ' ORDER BY addr) INTO conflicting FROM (
    SELECT lower(email) AS addr
      FROM trexdb."user"
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING count(*) > 1
  ) dupes;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'trexdb."user" holds accounts that differ only by the case of their email address: %',
      conflicting
      USING HINT =
        'Two accounts sharing one address cannot both keep it. For each address '
        'above, decide which account is the real one, then give the other a '
        'different address or delete it outright (soft-deleting is not enough: '
        'a deleted row still holds the address). Re-run the migration after.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_email_lower_key
  ON trexdb."user" (lower(email));

COMMENT ON INDEX trexdb.user_email_lower_key IS
  'One user per email address, case-insensitively: the identity is the mailbox, not its spelling.';
