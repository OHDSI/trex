-- Application roles carried by a client itself.
--
-- The client credentials grant authenticates a service rather than a person, so
-- there is no user whose roles the token could carry. Without roles of its own a
-- service token authenticates and authorizes nothing, which leaves a deployment
-- either impersonating a human account for machine work or treating every
-- credential holder as an administrator.
ALTER TABLE trexdb.oidc_client
    ADD COLUMN IF NOT EXISTS client_roles text[] NOT NULL DEFAULT '{}';
