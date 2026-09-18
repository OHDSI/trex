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

-- Reconciled, not merely filled. `AND a.password IS NULL` was here, on the
-- assumption that an account row carrying a password already carried the right
-- one. It does not always: develop's PUT /user (720b3c33, auth-router.ts:566)
-- writes trexdb.account BEFORE the trexdb."user" UPDATE at :583, so a request
-- that also changed the address and collided on the unique index answered 500
-- with the credential already rotated and user.password_hash left behind.
-- Those rows are in production databases now — this is not a rollout window —
-- and the cutover is what makes them dangerous: afterwards account.password is
-- what signs the account in, so the abandoned credential becomes the working
-- password while the holder's real one is refused.
--
-- user.password_hash is authoritative here because this runs BEFORE the
-- cutover, when it is the column every successful password change wrote last
-- and nothing legitimate makes account.password newer: pre-V17 trex wrote the
-- account row only as a mirror.
UPDATE trexdb.account a
   SET password = u.password_hash, "updatedAt" = NOW()
  FROM trexdb."user" u
 WHERE a."userId" = u.id
   AND a."providerId" = 'credential'
   AND u.password_hash IS NOT NULL
   AND a.password IS DISTINCT FROM u.password_hash;

-- Better Auth's admin plugin writes session.impersonatedBy; V1 predates it.
ALTER TABLE trexdb.session
  ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

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
    --
    -- Three passes, and the middle one is why: `.` is inside the allowed set, so
    -- a run of them survives the first pass, and `foo..bar` would mint
    -- foo..bar@d2e.local — an address with an empty atom, which the check below
    -- refuses. A migration that aborts on a row the statement above it created
    -- is a trap, not a warning, and the operator's only remedy would be to
    -- change a primary key. Runs of `.` collapse the way runs of everything
    -- else already do; btrim then takes the ends, so what survives is a local
    -- part of [a-z0-9._-] with no leading, trailing or empty atom — which is
    -- exactly what makes it addressable. The refusal below is unchanged: what
    -- changed is that this stopped producing input that trips it.
    id_local_part := btrim(
      regexp_replace(
        regexp_replace(lower(r.id), '[^a-z0-9._-]+', '-', 'g'),
        '\.{2,}', '.', 'g'
      ),
      '-.'
    );
    IF id_local_part = '' THEN
      RAISE EXCEPTION
        'cannot synthesise a placeholder address for user %: its id yields no usable local part', r.id;
    END IF;

    local_part := btrim(
      regexp_replace(
        regexp_replace(lower(COALESCE(r.sign_in_id, r.id)), '[^a-z0-9._-]+', '-', 'g'),
        '\.{2,}', '.', 'g'
      ),
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

-- Every address the engine will be handed has to be one it will accept.
--
-- Better Auth runs zod's z.email() on the address before it looks anybody up,
-- on every credential endpoint, and that rule requires a dotted domain. A row
-- holding `ops@localhost` — which V1 allowed, having imposed no format at all —
-- therefore stops being able to sign in the moment the engine owns
-- verification, with a correct password and a correct credential row, and is
-- told only that its credentials are invalid. That is a silent, permanent
-- lockout, and the person who finds it is the user rather than the operator.
--
-- Refused, not repaired. An address is an identity: there is no safe automatic
-- choice of a new one, for the same reason V16 refuses to pick a winner between
-- two rows sharing a mailbox. Relaxing what the engine validates would mean
-- forking its route or keeping a second credential path alive, and removing the
-- second path is what this plan is for. Told before the deploy, an operator
-- resolves this in minutes; told after, they hear it from a locked-out user.
--
-- Placed after the placeholder backfill on purpose, so it sees the addresses
-- this migration itself mints and not only the ones it inherited. The fold
-- below moved with it: the backfill compares candidates with lower(email) on
-- both sides and mints lower-case local parts, so folding before or after it is
-- the same thing, and one check over the final population is worth more than
-- two over halves of it.
--
-- Refusing this late leaves nothing behind, but NOT by the mechanism the
-- migration plugin's own comment suggests. A Postgres migration takes the
-- `is_postgres` branch of execute_migrations_in_schema
-- (plugins/migration/src/lib.rs), which issues no BEGIN and no COMMIT — the
-- explicit wrapper is on the other branch, the one this file never takes. What
-- discards the statements above is Postgres itself: a simple query carrying
-- several statements runs in one implicit transaction, and an error in any of
-- them throws all of it away.
--
-- That guarantee is therefore contingent on postgres_execute receiving this
-- file as ONE simple query, which is what postgres_execute_sql does today
-- (lib.rs:646 passes the whole text as a single argument). If it ever split the
-- file into statements, or moved to the extended protocol, each statement would
-- commit on its own: this check would still refuse, but the fold and the
-- backfill above it would already have landed, and this comment would be the
-- only thing still claiming otherwise. Changing how migrations are submitted
-- means coming back here.
--
-- The history row is written by a separate call (insert_migration_record_in),
-- so a migration and its record are not atomic with each other: a crash between
-- them re-runs the file. Everything here is written to survive that.
--
-- TWIN OF isEngineAddressable IN core/server/auth/engine-address.ts, which is
-- itself a copy of zod's z.email(). (auth-router.ts re-exports the name, so a
-- search that lands there is one hop from the definition.) All three must move together; a parity test
-- (auth/auth-engine-cutover.test.ts) asks this expression, that predicate and
-- the live engine the same addresses and fails if any of them disagrees. The
-- expression is restated here rather than shared because a migration is text
-- handed to the session verbatim and checksummed, and can call nothing.
DO $$
DECLARE
  unusable text;
BEGIN
  SELECT string_agg(email, ', ' ORDER BY email) INTO unusable
    FROM trexdb."user"
   WHERE email IS NOT NULL
     AND email !~ '^(?:[A-Za-z0-9_''+-]+\.)*[A-Za-z0-9_''+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$';

  IF unusable IS NOT NULL THEN
    RAISE EXCEPTION
      'trexdb."user" holds addresses the authentication engine will not accept: %',
      unusable
      USING HINT =
        'Better Auth validates the address before it looks a user up, so each '
        'account above would be unable to sign in after this migration, with no '
        'error but "invalid credentials". Give each one an address with a dotted '
        'domain (someone@example.com, not someone@localhost), or delete the '
        'account if it is defunct — soft-deleting is not enough, a deleted row '
        'still holds the address. Re-run the migration after.';
  END IF;
END
$$;

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

-- Every row on the placeholder domain is marked as one, not only the rows this
-- migration synthesised.
--
-- The backfill above flags what it mints (WHERE u.email IS NULL). That covers
-- an installation whose address-less users are still address-less when V17
-- runs. It does NOT cover the one this migration will actually meet: an
-- installation that has ALREADY run d2e's IdP migration, whose users therefore
-- arrive here holding <username>@d2e.local as an ordinary address. Those rows
-- pass through V17 untouched — placeholder false, verified true — and are then
-- link candidates for any upstream that asserts one, which is the whole reason
-- the flag exists.
--
-- Beside the addressability sweep below rather than inside the backfill,
-- because it is the same kind of statement: a rule about the address, asked of
-- the entire population, whoever wrote it. auth/engine-address.ts's
-- isPlaceholderAddress is this expression's twin and the five routes that write
-- an address all ask it; this is the seventh door, and the migration is the one
-- place that can close it for rows that predate them all.
--
-- After the fold above on purpose, so `email` is already lower-cased; the
-- lower() here is belt-and-braces and makes the statement true read on its own.
-- The domain is taken after the LAST '@', matching emailDomain's rule, so a
-- quoted local part cannot smuggle one in.
UPDATE trexdb."user"
   SET is_placeholder_email = true,
       "emailVerified" = false,
       email_confirmed_at = NULL
 WHERE lower(substring(email from '[^@]*$')) = 'd2e.local'
   AND (is_placeholder_email IS NOT TRUE
        OR "emailVerified" IS TRUE
        OR email_confirmed_at IS NOT NULL);

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
