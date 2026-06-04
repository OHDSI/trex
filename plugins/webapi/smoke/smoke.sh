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
BASE=http://localhost:8080/WebAPI
echo "=== WebAPI endpoint sweep (code  path) ==="
for path in \
  /info /source/sources /source/priorityVocabulary \
  /cohortdefinition /conceptset /cohortcharacterization /cohort-characterization \
  /featureanalysis /feature-analysis /pathway-analysis /ir /cohort-sample \
  /estimation /prediction /reusable /tag /notifications /job/execution \
  /user /role /permission /me /saved-analysis /cdmresults /featureextraction \
  /evidence /vocabulary /penelope /sqlrender/translate /ddl/results \
  /trexsql/study/envs ; do
  code=$(curl -s -m 12 -o /dev/null -w "%{http_code}" "$BASE$path" 2>/dev/null || echo "ERR")
  echo "  $code  $path"
done

echo "=== native-image reachability errors during the sweep (server log) ==="
grep -iE "UnsupportedFeatureError|ClassNotFoundException|NoClassDefFoundError|not registered for reflection|NoSuchMethodError|InaccessibleObjectException|No such (field|method) found|registered for reflection" /tmp/harness.log \
  | grep -viE "error loading .* driver|WEBAPI_STATUS" | sort -u | head -25
echo "(empty above = no native-image reachability gaps hit on the swept endpoints)"

echo "=== server-side errors/exceptions during the sweep (root causes of 500s) ==="
grep -nE "ERROR|Exception|Caused by|Servlet.service|nested exception" /tmp/harness.log \
  | grep -viE "error loading .* driver|WEBAPI_STATUS=" | tail -60

echo "[smoke] done"
