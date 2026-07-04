#!/bin/bash
# Loads the PostgREST v12.2.3 spec fixtures the same way the upstream test
# harness does (nix/tools/withTools.nix): fixtures are loaded by the postgres
# superuser with -v PGUSER pointing at the minimally privileged login role the
# server later connects as, and PGOPTIONS mirrors the upstream default
# search_path=public,test.
set -e

# Upstream: createuser postgrest_test_authenticator --no-inherit --login ...
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE ROLE postgrest_test_authenticator NOINHERIT LOGIN;"

PGOPTIONS="-c search_path=public,test" \
  psql -v ON_ERROR_STOP=1 -v PGUSER=postgrest_test_authenticator \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /fixtures/load.sql

# Main.hs runs ANALYZE on these before Feature.Query.RangeSpec (EXPLAIN tests).
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'ANALYZE test.items;' -c 'ANALYZE test.child_entities;'
