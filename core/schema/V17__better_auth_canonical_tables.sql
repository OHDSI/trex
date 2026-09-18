-- Better Auth 1.7.5 owns the user/session/account/verification tables from
-- here on. Since 1.7 it compares them against the shape it generates at boot
-- and on every request that awaits validation, and reports a SchemaMismatchError
-- for a missing column or for a NOT NULL column it never writes. V1 was written
-- against Better Auth's shape in February, so this closes the drift that
-- accumulated while the hand-written router owned these tables.

-- Passwords move to their canonical home: Better Auth reads account.password
-- for providerId = 'credential'. auth-router.ts had been lazily copying them
-- the other way, into user.password_hash. The hashes are trex's own scrypt and
-- Better Auth verifies them through the hooks better-auth.ts installs, so they
-- are moved verbatim — re-hashing would need a plaintext nobody has.
INSERT INTO trexdb.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, 'credential', u.id, u.password_hash, NOW(), NOW()
  FROM trexdb."user" u
 WHERE u.password_hash IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM trexdb.account a
      WHERE a."userId" = u.id AND a."providerId" = 'credential'
   );

UPDATE trexdb.account a
   SET password = u.password_hash, "updatedAt" = NOW()
  FROM trexdb."user" u
 WHERE a."userId" = u.id
   AND a."providerId" = 'credential'
   AND a.password IS NULL
   AND u.password_hash IS NOT NULL;

-- Better Auth's admin plugin writes session.impersonatedBy; V1 predates it.
ALTER TABLE trexdb.session
  ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

-- Addresses move to the engine's storage convention: Better Auth looks a user
-- up with `email = <the address it was given, lower-cased>` and lower-cases
-- every address it writes itself, so a row still holding the spelling somebody
-- typed is invisible to it. Its holder is not told that nothing can see them —
-- they are told their password is wrong.
--
-- THIS IS ONLY SAFE BECAUSE V16 PRECEDES IT. V16's user_email_lower_key already
-- admits at most one row per folded address, so folding cannot collide with a
-- case variant that would have to be resolved by hand, and the identity that
-- index defines does not change. Reordering or renumbering these two turns this
-- statement into one that can abort the migration on a duplicate key.
--
-- auth-router.ts folds the same way on the sign-in path, and both are needed.
-- This one settles the population that exists at the deploy, so nobody has to
-- sign in to become visible and nothing reading user.email sees a mixture.
-- That one settles the rows written afterwards, because PUT /user stores the
-- spelling the account holder typed and is pinned to that by the wire contract.
-- Removing either leaves a way for a row to be unreachable by the engine.
UPDATE trexdb."user" SET email = lower(email) WHERE email <> lower(email);

-- Better Auth requires an address on every user, so the rows V14 allowed to be
-- NULL get a synthesised one. The flag is what keeps them out of mail paths:
-- an address invented here was never asserted by anybody and must never be
-- treated as a way to reach the person.
ALTER TABLE trexdb."user"
  ADD COLUMN IF NOT EXISTS is_placeholder_email BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE
  -- trex's migration plugin (plugins/migration/src/lib.rs) hands each file's
  -- text to the session verbatim and checksums that same text into
  -- refinery_schema_history. It substitutes nothing, and a per-deployment
  -- substitution would give every deployment a different checksum for V17, so
  -- the domain is fixed here rather than configured. It is never resolvable and
  -- never routed to; is_placeholder_email is what code must branch on.
  --
  -- This block backfills the users that existed when Better Auth took the
  -- tables over; auth/federation/providers.ts mints the ones that arrive
  -- afterwards, under the same domain and the same slug rule, so that a row
  -- from either is indistinguishable from a row from the other. Changing
  -- either side is changing both.
  placeholder_domain CONSTANT TEXT := 'd2e.local';
  candidate TEXT;
  local_part TEXT;
  id_local_part TEXT;
  r RECORD;
BEGIN
  FOR r IN
    -- The local part comes from the identifier the user actually signs in with,
    -- not from "user".name: name is a display name, is not unique, and would
    -- both invent nonsense addresses and abort this migration on the UNIQUE
    -- constraint. A federated row's accountId is the upstream subject, which is
    -- what the directory knows the user by; the credential row's accountId is
    -- only ever a copy of the user id, so it sorts last and leaves the upstream
    -- subject to win when a user has both.
    SELECT u.id,
           (SELECT a."accountId"
              FROM trexdb.account a
             WHERE a."userId" = u.id
             ORDER BY (a."providerId" = 'credential'), a."createdAt", a.id
             LIMIT 1) AS sign_in_id
      FROM trexdb."user" u
     WHERE u.email IS NULL
     ORDER BY u.id
  LOOP
    -- The id is the only identifier guaranteed distinct, so it is the backbone
    -- of the scheme rather than merely a fallback, and it is slugified like any
    -- other: a user migrated off another identity provider deliberately keeps
    -- its upstream subject as its id (auth/federation/providers.ts), so an id
    -- outside [a-z0-9._-] is reachable and would otherwise yield a malformed
    -- local part. Without a usable one there is nothing left to fall back to.
    id_local_part := btrim(regexp_replace(lower(r.id), '[^a-z0-9._-]+', '-', 'g'), '-.');
    IF id_local_part = '' THEN
      RAISE EXCEPTION
        'cannot synthesise a placeholder address for user %: its id yields no usable local part', r.id;
    END IF;

    local_part := btrim(
      regexp_replace(lower(COALESCE(r.sign_in_id, r.id)), '[^a-z0-9._-]+', '-', 'g'),
      '-.'
    );
    IF local_part = '' THEN
      local_part := id_local_part;
    END IF;
    candidate := local_part || '@' || placeholder_domain;

    -- Two upstream subjects can slugify to the same local part.
    IF EXISTS (SELECT 1 FROM trexdb."user" WHERE lower(email) = candidate) THEN
      candidate := id_local_part || '@' || placeholder_domain;
    END IF;

    -- Reusing an address that is already taken would hand one person's row the
    -- identity another person signs in with. Refuse the migration instead.
    IF EXISTS (SELECT 1 FROM trexdb."user" WHERE lower(email) = candidate) THEN
      RAISE EXCEPTION
        'cannot synthesise a placeholder address for user %: % is already taken', r.id, candidate;
    END IF;

    -- The cursor read this row as address-less, but the UPDATE takes a fresh
    -- snapshot under READ COMMITTED: re-test the condition here so a concurrent
    -- commit that gave the user a real address cannot be overwritten with a
    -- synthetic one.
    UPDATE trexdb."user"
       SET email = candidate,
           is_placeholder_email = true,
           "emailVerified" = false
     WHERE id = r.id
       AND email IS NULL;
  END LOOP;
END
$$;

-- Better Auth declares email, emailVerified, createdAt and updatedAt required.
-- A nullable column with a default still lets an old row hold NULL, which the
-- adapter reads back as a missing required field, so the rows are backfilled
-- and the columns closed.
UPDATE trexdb."user" SET "emailVerified" = false WHERE "emailVerified" IS NULL;
UPDATE trexdb."user" SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb."user" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.session SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.session SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.account SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.account SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.verification SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.verification SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;

ALTER TABLE trexdb."user"
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN "emailVerified" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.session
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.account
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.verification
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

COMMENT ON COLUMN trexdb."user".is_placeholder_email IS
  'The address is synthesised, not a contact address. Mail paths must refuse it.';

-- Supersedes V14's comment: the column is NOT NULL again, and an address-less
-- federated user is now carried by is_placeholder_email instead of by NULL.
COMMENT ON COLUMN trexdb."user".email IS
  'Login address. Synthesised for a federated user whose upstream asserted none; see is_placeholder_email.';
