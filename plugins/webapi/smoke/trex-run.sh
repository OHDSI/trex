#!/usr/bin/env bash
# Drive the webapi.trex DuckDB extension end to end: LOAD it in trexsql/DuckDB and
# SELECT webapi_start() (which dlopens libwebapi-native.so and boots WebAPI).
set -uo pipefail

echo "[trex] starting postgres"
service postgresql start
until pg_isready -q; do sleep 1; done
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ohdsi_app_user'\" | grep -q 1 || psql -c \"CREATE USER ohdsi_app_user WITH PASSWORD 'app1';\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='webapi'\" | grep -q 1 || createdb -O ohdsi_app_user webapi"
su postgres -c "psql -d webapi -c 'CREATE SCHEMA IF NOT EXISTS webapi AUTHORIZATION ohdsi_app_user;'"

export WEBAPI_NATIVE_LIB=/app/libwebapi-native.so
export LD_LIBRARY_PATH=/usr/local/lib
export SPRING_APPLICATION_JSON='{"trexsql.enabled":"true","datasource.url":"jdbc:postgresql://localhost:5432/webapi","datasource.username":"ohdsi_app_user","datasource.password":"app1","datasource.ohdsi.schema":"webapi","spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi","spring.flyway.user":"ohdsi_app_user","spring.flyway.password":"app1","spring.flyway.schemas":"webapi","spring.batch.repository.table-prefix":"webapi.BATCH_"}'

echo "[trex] running DuckDB client: LOAD webapi.trex; SELECT webapi_start()"
/app/trex_test > /tmp/trex.log 2>&1 &
CPID=$!
for i in $(seq 1 90); do
  grep -q "WEBAPI_STATUS=running" /tmp/trex.log && { echo "[trex] webapi running after ~$((i*2))s"; break; }
  grep -qE "WEBAPI_START=error|failed|open failed" /tmp/trex.log && { echo "[trex] start error"; break; }
  kill -0 "$CPID" 2>/dev/null || { echo "[trex] client exited early"; break; }
  sleep 2
done

echo "=== client output ==="
grep -E "DUCKDB_OPEN_OK|EXTENSION_LOADED|WEBAPI_START=" /tmp/trex.log | head
grep -vE "WEBAPI_STATUS=stopped" /tmp/trex.log | grep -E "WEBAPI_STATUS=|ERROR|error" | head -5

echo "=== endpoint probes (via the extension-booted server) ==="
for url in \
  http://localhost:8080/WebAPI/info \
  http://localhost:8080/WebAPI/source/sources \
  http://localhost:8080/WebAPI/trexsql/study/envs ; do
  code=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo ERR)
  echo "  $code  $url"
done
echo "[trex] done"
