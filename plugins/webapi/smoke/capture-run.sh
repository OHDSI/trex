#!/usr/bin/env bash
# Comprehensive native-image metadata capture: boot the JVM WebAPI under the
# tracing agent against an EXISTING (seeded) Postgres, log in, and exercise the
# full endpoint surface Pythia uses — reads, /user/me, writes, populated-entity
# detail, vocab search, and the cleanup scheduler. The agent records reflection,
# proxy, serialization and resource metadata for everything it touches and merges
# it into $CONFIG_DIR. Intended to run on the compose network against atlas3-postgres.
set -uo pipefail
CONFIG_DIR=${CONFIG_DIR:-/config}
DB_HOST=${DB_HOST:-atlas3-postgres}
PW=${POSTGRES_PASSWORD:-mypass}
mkdir -p "$CONFIG_DIR"

DS="jdbc:postgresql://${DB_HOST}:5432/postgres?currentSchema=webapi"
export SPRING_APPLICATION_JSON="{\"server.port\":\"8080\",\"trexsql.enabled\":\"false\",\"spring.flyway.enabled\":\"false\",\"datasource.driverClassName\":\"org.postgresql.Driver\",\"datasource.url\":\"${DS}\",\"datasource.username\":\"postgres\",\"datasource.password\":\"${PW}\",\"datasource.ohdsi.schema\":\"webapi\",\"spring.batch.repository.table-prefix\":\"webapi.batch_\",\"security.auth.db.enabled\":\"true\",\"security.auth.db.datasource.driverClassName\":\"org.postgresql.Driver\",\"security.auth.db.datasource.url\":\"${DS}\",\"security.auth.db.datasource.username\":\"postgres\",\"security.auth.db.datasource.password\":\"${PW}\",\"security.auth.db.datasource.schema\":\"webapi\",\"cache.generation.cleanupInterval\":\"4000\",\"cache.generation.invalidAfterDays\":\"1\"}"

echo "[capture] booting WebAPI under native-image-agent (merge -> $CONFIG_DIR)"
"$JAVA_HOME/bin/java" -agentlib:native-image-agent=config-merge-dir="$CONFIG_DIR" -jar /app-webapi.jar > /tmp/cap.log 2>&1 &
PID=$!
for i in $(seq 1 180); do
  grep -q "Started WebApi" /tmp/cap.log && { echo "[capture] started after ~${i}s"; break; }
  kill -0 "$PID" 2>/dev/null || { echo "[capture] WebAPI exited early:"; tail -40 /tmp/cap.log; exit 1; }
  sleep 1
done
grep -q "Started WebApi" /tmp/cap.log || { echo "[capture] did not start:"; tail -40 /tmp/cap.log; exit 1; }

BASE=http://localhost:8080/WebAPI
TOKEN=$(curl -s -m 20 -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'login=admin&password=admin' "$BASE/user/login/db" | sed -E 's/.*"jwt":"([^"]+)".*/\1/')
echo "[capture] token len ${#TOKEN}"
A="Authorization: Bearer $TOKEN"
hit() { local m="$1" p="$2" b="${3:-}"
  local code
  if [ "$m" = GET ]; then code=$(curl -s -m 25 -o /dev/null -w "%{http_code}" -H "$A" "$BASE$p" 2>/dev/null || echo ERR)
  else code=$(curl -s -m 30 -o /dev/null -w "%{http_code}" -H "$A" -H 'Content-Type: application/json' -d "$b" "$BASE$p" 2>/dev/null || echo ERR); fi
  echo "  $code  $m $p"
}
echo "[capture] exercising endpoint surface"
for p in /info /user/me /user/refresh /source/sources /vocabulary/EUNOMIA/info \
  /cohortdefinition /conceptset /cohort-characterization /feature-analysis \
  /pathway-analysis /ir /tag /reusable /notifications /job/execution \
  /user /role /permission /cohortdefinition/1 /conceptset/1 /source/EUNOMIA; do
  hit GET "$p"
done
hit POST /conceptset '{"name":"cap-cs"}'
hit POST /cohortdefinition '{"name":"cap-cd","expressionType":"SIMPLE_EXPRESSION","expression":{"ConceptSets":[],"PrimaryCriteria":{"CriteriaList":[],"ObservationWindow":{"PriorDays":0,"PostDays":0},"PrimaryCriteriaLimit":{"Type":"First"}},"QualifiedLimit":{"Type":"First"},"ExpressionLimit":{"Type":"First"},"InclusionRules":[],"CensoringCriteria":[],"CollapseSettings":{"CollapseType":"ERA","EraPad":0}}}'
hit POST /ir '{"name":"cap-ir"}'
hit POST /vocabulary/EUNOMIA/search '{"QUERY":"diabetes"}'

echo "[capture] dwell 12s for cleanup scheduler (entity-graph path)"
sleep 12
echo "[capture] stopping WebAPI (agent flushes config)"
kill -TERM "$PID" 2>/dev/null || true
for i in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
kill -9 "$PID" 2>/dev/null || true
echo "[capture] done. config files:"
ls -la "$CONFIG_DIR"
