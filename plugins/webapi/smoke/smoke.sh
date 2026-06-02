#!/usr/bin/env bash
# Runtime smoke test for libwebapi-native.so: boot WebAPI (native) against a local
# Postgres and probe a few endpoints, including the trexsql servlet.
set -uo pipefail

echo "[smoke] starting postgres"
service postgresql start
until pg_isready -q; do sleep 1; done
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ohdsi_app_user'\" | grep -q 1 || psql -c \"CREATE USER ohdsi_app_user WITH PASSWORD 'app1';\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='webapi'\" | grep -q 1 || createdb -O ohdsi_app_user webapi"
su postgres -c "psql -d webapi -c 'CREATE SCHEMA IF NOT EXISTS webapi AUTHORIZATION ohdsi_app_user;'"

export SPRING_APPLICATION_JSON='{"trexsql.enabled":"true","trexsql.cache-path":"/tmp/trexcache","datasource.url":"jdbc:postgresql://localhost:5432/webapi","datasource.username":"ohdsi_app_user","datasource.password":"app1","datasource.ohdsi.schema":"webapi","spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi","spring.flyway.user":"ohdsi_app_user","spring.flyway.password":"app1","spring.flyway.schemas":"webapi","spring.batch.repository.table-prefix":"webapi.BATCH_"}'

echo "[smoke] launching native WebAPI host"
/app/harness > /tmp/harness.log 2>&1 &
HPID=$!

# Wait for the server to report running, or bail as soon as webapi_start returns an
# error (Flyway migration of a fresh schema can take a while, so allow ~3 min).
for i in $(seq 1 90); do
  grep -q "WEBAPI_STATUS=running" /tmp/harness.log && { echo "[smoke] status=running after ~$((i*2))s"; break; }
  grep -q "WEBAPI_START=error" /tmp/harness.log && { echo "[smoke] webapi_start returned an error after ~$((i*2))s"; break; }
  if ! kill -0 "$HPID" 2>/dev/null; then echo "[smoke] harness exited early"; break; fi
  sleep 2
done

echo "=== webapi_start result ==="
grep -E "ISOLATE_OK|WEBAPI_START=" /tmp/harness.log | head -3
echo "=== deepest cause (reflection frames) ==="
grep -nE "Caused by|NoSuchField|NoSuchMethod|ClassNotFound|getField|getDeclaredField|getMethod|at org.trex|at trexsql|at clojure|at reitit|at muuntaja|at jsonista|at honeysql" /tmp/harness.log | tail -30
echo "=== harness.log boot output (full) ==="
grep -vE "WEBAPI_STATUS=" /tmp/harness.log | head -300

echo "=== endpoint probes (http code) ==="
for url in \
  http://localhost:8080/WebAPI/info \
  http://localhost:8080/WebAPI/source/sources \
  http://localhost:8080/trexsql/ \
  http://localhost:8080/WebAPI/trexsql/ \
  http://localhost:8080/info ; do
  code=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "ERR")
  echo "  $code  $url"
done

echo "[smoke] done"
