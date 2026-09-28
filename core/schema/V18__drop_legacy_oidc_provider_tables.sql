-- The hand-rolled OIDC provider's tables, superseded by
-- @better-auth/oauth-provider in V17 and left behind by it.
--
-- WHY THEY CANNOT SIMPLY SIT THERE. Both sets live in `trexdb`, and PostGraphile
-- inflects a snake_case table name to camelCase — so `oauth_access_token`
-- resolves to the same name as the provider's own "oauthAccessToken" table:
--
--   Attempted to add a second codec named 'oauthAccessToken'
--     (existing: RecordCodec(oauthAccessToken), new: RecordCodec(oauthAccessToken))
--
-- That is thrown while the schema is built, so it fails EVERY GraphQL request on
-- the node, not only the ones that would touch these tables. Measured on a
-- deployment upgraded through the cutover: the portal could authenticate and
-- still not load, which points nowhere near a pair of unused tables.
--
-- WHY DROPPING IS SAFE. Nothing reads or writes them after V17 — the provider
-- has its own — and what they held is either ephemeral or re-created:
--   * oauth_access_token, oauth_authorization_code: short-lived credentials; the
--     worst case is that a user signs in again.
--   * oauth_consent: a consent prompt is shown once more.
--   * oauth_application: registered clients, which trex re-seeds from its own
--     environment on every boot (auth/oidc/seed-client.ts).
-- On the deployment this was found on, all four were empty while the provider's
-- tables held live rows.
--
-- CASCADE because V3 granted on them; the grants have to go with the tables.
-- IF EXISTS because a database created after V17 never had them.
DROP TABLE IF EXISTS trexdb.oauth_access_token CASCADE;
DROP TABLE IF EXISTS trexdb.oauth_authorization_code CASCADE;
DROP TABLE IF EXISTS trexdb.oauth_consent CASCADE;
DROP TABLE IF EXISTS trexdb.oauth_application CASCADE;
