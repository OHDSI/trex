-- An authorization code's user_id holds a trexdb."user".id, which is TEXT.
--
-- V7 typed it uuid because every user trex had minted until then had a UUID
-- id. Users pre-linked by the federation admin API keep the id they had at
-- their previous identity provider (a Logto id is 12 alphanumerics), since that
-- id is their token `sub`. Inserting such an id here fails, so one of those
-- users could not complete an authorization-code sign-in at all.
--
-- Codes live for a minute, so converting the few rows present is harmless.
ALTER TABLE trexdb.oidc_authorization_code
  ALTER COLUMN user_id TYPE text USING user_id::text;
