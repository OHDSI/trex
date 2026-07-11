#!/usr/bin/env bash
set -uo pipefail

# Wrapper around main.ts (the @supabase/realtime-js reference-client E2E for
# trex's native "realtime" feature). Deno's client only speaks the Phoenix
# wire protocol — it has no way to run DDL or manage the WAL publication —
# so this script does the out-of-band Postgres prep the postgres_changes
# check needs:
#
#   1. CREATE TABLE public.rt_e2e (id int PRIMARY KEY)
#   2. ALTER PUBLICATION supabase_realtime ADD TABLE public.rt_e2e
#   3. run main.ts, watch its stdout for the READY_FOR_INSERT sentinel
#   4. INSERT INTO public.rt_e2e (id) VALUES (1) right after it appears
#   5. propagate main.ts's exit code
#   6. clean up (drop table, drop from publication), even on failure
#
# DEFERRED-RUN: requires a running trex stack (docker compose up) and its
# backing Postgres reachable — matching test_realtime_standalone.py's
# defaults (postgres://postgres:mypass@localhost:65433/testdb). It was
# authored WITHOUT such a stack available; running it for real is the
# deferred full-stack pass.
#
# Usage:
#   TREX_ANON_KEY=<jwt> ./run.sh
#
# If TREX_ANON_KEY is not set, it is fetched from trexdb.setting the same
# way test_realtime_standalone.py's anon_token fixture does (the anon key is
# a long-lived JWT minted once at boot and stored there — see
# core/server/auth/jwt.ts / api-keys.ts). A per-user JWT can also be minted
# via POST /trex/auth/v1/token?grant_type=password like the Python suite's
# admin_token fixture, if you'd rather exercise a specific role.
#
# Env vars (all optional, defaults match docker-compose.yml / the Python suite):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE   Postgres connection
#   TREX_WS_URL                                       realtime WS endpoint
#   TREX_ANON_KEY                                     trex JWT (fetched if unset)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-65433}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-mypass}"
PGDATABASE="${PGDATABASE:-testdb}"
export TREX_WS_URL="${TREX_WS_URL:-ws://localhost:8001/trex/realtime/v1}"

# Runs a psql statement against the target Postgres via the postgres:16
# image over host networking, so this script doesn't require a local psql
# install — same convention as
# integration-tests/cluster-split/test_basic_roundtrip.sh.
pg() {
  docker run --rm --network host -i \
    -e PGPASSWORD="$PGPASSWORD" \
    postgres:16 \
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

if [[ -z "${TREX_ANON_KEY:-}" ]]; then
  echo "==> TREX_ANON_KEY not set; fetching auth.anonKey from trexdb.setting"
  TREX_ANON_KEY="$(pg -tAc "SELECT value #>> '{}' FROM trexdb.setting WHERE key = 'auth.anonKey'" | tr -d '[:space:]')"
  if [[ -z "$TREX_ANON_KEY" ]]; then
    echo "ERROR: could not fetch auth.anonKey from trexdb.setting (is the stack up?)" >&2
    exit 1
  fi
fi
export TREX_ANON_KEY

cleanup() {
  echo "==> Cleaning up public.rt_e2e"
  pg -c "ALTER PUBLICATION supabase_realtime DROP TABLE public.rt_e2e" >/dev/null 2>&1 || true
  pg -c "DROP TABLE IF EXISTS public.rt_e2e" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Preparing public.rt_e2e (table + publication)"
pg -c "DROP TABLE IF EXISTS public.rt_e2e" || exit 1
pg -c "CREATE TABLE public.rt_e2e (id int PRIMARY KEY)" || exit 1
pg -c "GRANT SELECT ON public.rt_e2e TO authenticated, anon" || exit 1
pg -c "ALTER PUBLICATION supabase_realtime ADD TABLE public.rt_e2e" || exit 1

echo "==> Running realtime-js reference-client E2E (deno)"
FIFO="$(mktemp -u)"
mkfifo "$FIFO"

deno run --allow-net --allow-env main.ts >"$FIFO" 2>&1 &
DENO_PID=$!

inserted=0
while IFS= read -r line; do
  echo "$line"
  if [[ "$line" == "READY_FOR_INSERT" && "$inserted" -eq 0 ]]; then
    inserted=1
    echo "==> READY_FOR_INSERT seen; inserting row (1) into public.rt_e2e"
    pg -c "INSERT INTO public.rt_e2e (id) VALUES (1)" || true
  fi
done <"$FIFO"

wait "$DENO_PID"
EXIT_CODE=$?
rm -f "$FIFO"

exit "$EXIT_CODE"
