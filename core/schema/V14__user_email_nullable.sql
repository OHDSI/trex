-- A trex user may have no email address.
--
-- Federated sign-in takes whatever the upstream asserts, and a directory of
-- username-only accounts asserts no address at all: on a d2e installation
-- migrating off Logto, 64 of 69 accounts have none. Those users are already
-- linked to a trex user by subject, so they sign in on identity alone, but a
-- provisioning path could not create such a row while the column was NOT NULL.
--
-- The UNIQUE constraint stays. Postgres does not compare NULLs, so any number
-- of address-less users coexist, while two users still cannot share an address.
ALTER TABLE trexdb."user"
  ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN trexdb."user".email IS
  'Login address for the native password grant. NULL for a federated user whose upstream asserted no address.';
