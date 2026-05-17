#!/usr/bin/env bash
set -euo pipefail

# Bring up the two-node trex stack and verify a SQL round-trip from the
# server node down into the data node via Flight.
#
# NOTE: This test depends on plugins/db/src/config.rs accepting the cluster
# config in docker-compose.yml. If both nodes advertise 0.0.0.0:4200,
# validate() will reject it as duplicate. See the related follow-up task on
# gossip addressing if this test fails at boot.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/../.."
cd "$ROOT"

cleanup() {
  # Tear down on exit so multiple runs don't leave stale state.
  docker compose -f docker-compose.yml down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting trex-data + trex-server stack"
docker compose -f docker-compose.yml up -d trex-init postgres trex-data trex-server

echo "==> Waiting for trex-server to report healthy (max 240s)"
deadline=$((SECONDS + 240))
while (( SECONDS < deadline )); do
  status=$(docker compose -f docker-compose.yml ps --format json trex-server \
    | python3 -c 'import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    obj=json.loads(line)
    print(obj.get("Health","")) ; sys.exit(0)' 2>/dev/null || true)
  if [[ "$status" == "healthy" ]]; then
    echo "    trex-server is healthy"
    break
  fi
  sleep 5
done

if [[ "$status" != "healthy" ]]; then
  echo "ERROR: trex-server did not become healthy in 240s"
  docker compose -f docker-compose.yml logs --tail 100 trex-server trex-data
  exit 1
fi

echo "==> Running pgwire round-trip on host port 5433"
# Use the postgres image's psql so we don't depend on having one installed locally.
docker run --rm --network host -i \
  -e PGPASSWORD=trex \
  postgres:16 \
  psql -h localhost -p 5433 -U trex -d trexdb <<'SQL'
CREATE TABLE IF NOT EXISTS t_split (id INTEGER, label TEXT);
INSERT INTO t_split VALUES (1, 'a'), (2, 'b');
SELECT count(*) AS n FROM t_split;
SQL

echo "==> Verifying that t_split lives on the data node"
# trex_db_tables() lists tables advertised by each data node via gossip.
# We expect to see node_name='data' as the owner.
result=$(docker run --rm --network host -i \
  -e PGPASSWORD=trex \
  postgres:16 \
  psql -h localhost -p 5433 -U trex -d trexdb -tAc \
  "SELECT node_name FROM trex_db_tables() WHERE table_name='t_split'" 2>/dev/null \
  | tr -d '[:space:]')

if [[ "$result" == "data" ]]; then
  echo "==> OK — t_split is on the data node ($result)"
  exit 0
else
  echo "ERROR: expected node_name='data', got '$result'"
  echo "Last 50 log lines:"
  docker compose -f docker-compose.yml logs --tail 50 trex-server trex-data
  exit 1
fi
