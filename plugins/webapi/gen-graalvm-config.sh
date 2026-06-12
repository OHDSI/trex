#!/usr/bin/env bash
# Capture GraalVM native-image config (proxy/reflect/resource) by running OHDSI
# WebAPI on a normal JVM under the native-image tracing agent.
#
# Why: some dynamic JDK proxies are only created at runtime — notably the Cosium
# spring-data-jpa-entity-graph proxy over jakarta.persistence.Query that
# CleanupScheduler.removeOldCache triggers via a derived (criteria) query. Those
# proxies aren't reachable by static analysis, so the closed-world native build
# fails them at runtime with MissingReflectionRegistrationUtils.forProxy. The
# agent records the exact interface set and merges it into graalvm-config/, which
# the native build consumes via -H:ConfigurationFileDirectories.
#
# This boots WebAPI with cache.generation.cleanupInterval shrunk to a few seconds
# so removeOldCache fires repeatedly during the run, exercising the missing proxy.
#
# After it runs, review and commit the changes under plugins/webapi/graalvm-config/,
# then rebuild libwebapi-native.so (build-native-lib.sh).
#
# Needs: GraalVM (ships the agent), Maven, an ephemeral PostgreSQL. ~6-8 GB RAM.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBAPI_DIR="$REPO_ROOT/plugins/webapi"
WEBAPI_BE_DIR="$WEBAPI_DIR/webapi-be"
CONFIG_DIR="$WEBAPI_DIR/graalvm-config"

export GRAAL_HOME="${GRAAL_HOME:-/opt/graalvm}"
export JAVA_HOME="${JAVA_HOME:-$GRAAL_HOME}"
export PATH="$JAVA_HOME/bin:$PATH"

RUN_LOG="${RUN_LOG:-/tmp/webapi-agent.log}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-300}"   # seconds to wait for "Started WebApi" (Flyway is slow)
CAPTURE_SECONDS="${CAPTURE_SECONDS:-45}"  # extra time to let the scheduler fire several ticks

# --- 1. GraalVM: the tracing agent ships inside the GraalVM JDK ---
if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "[gen-config] installing GraalVM"
  bash "$WEBAPI_DIR/install-graalvm.sh"
fi
# The tracing agent (libnative-image-agent) ships only with a GraalVM JDK.
AGENT_LIB="$(find "$JAVA_HOME" -name 'libnative-image-agent.*' 2>/dev/null | head -1)"
if [ -z "$AGENT_LIB" ]; then
  echo "[gen-config] ERROR: native-image tracing agent not found under $JAVA_HOME — need a GraalVM JDK." >&2
  echo "[gen-config] lib entries mentioning 'agent':" >&2
  find "$JAVA_HOME" -iname '*agent*' 2>/dev/null >&2 || true
  exit 1
fi
echo "[gen-config] tracing agent: $AGENT_LIB"

# --- 2. Build a runnable (Spring Boot) WebAPI jar ---
# Note: build-native-lib.sh installs a *thin* jar (repackage.skip=true) for the
# native build; here we want the Boot-executable jar so we can `java -jar` it.
echo "[gen-config] building Spring Boot WebAPI jar"
( cd "$WEBAPI_BE_DIR" && mvn -B -q -DskipUnitTests=true -DskipITtests=true -Dpackaging.type=jar package )
BOOT_JAR="$(find "$WEBAPI_BE_DIR/target" -maxdepth 1 -name 'WebAPI*.jar' \
  ! -name '*-sources.jar' ! -name '*-javadoc.jar' ! -name '*-thin.jar' | head -1)"
if [ -z "$BOOT_JAR" ]; then
  echo "[gen-config] ERROR: Boot jar not found in $WEBAPI_BE_DIR/target" >&2
  exit 1
fi
echo "[gen-config] boot jar: $BOOT_JAR"

# --- 3. Ephemeral PostgreSQL (mirrors build-native-lib.sh) ---
echo "[gen-config] starting postgres"
service postgresql start
until pg_isready -q; do sleep 1; done
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ohdsi_app_user'\" | grep -q 1 || psql -c \"CREATE USER ohdsi_app_user WITH PASSWORD 'app1';\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='webapi'\" | grep -q 1 || createdb -O ohdsi_app_user webapi"
su postgres -c "psql -d webapi -c 'CREATE SCHEMA IF NOT EXISTS webapi AUTHORIZATION ohdsi_app_user;'"

# trexsql.enabled=true: the entity-graph proxy lives in WebAPI core (Cosium) so it
# is captured regardless of trexsql; enabling trexsql here additionally exercises the
# JDBC cache path so the tracing agent records the JDBC *driver* reflection and the
# java.sql.Driver service load that the cache fallback path needs.  (The cache query
# builder is HoneySQL, not Java SqlRender, so there are no SqlRender resources to
# capture — only the JDBC driver metadata.)  cleanupInterval is shrunk so
# CleanupScheduler.removeOldCache runs every few seconds.
export SPRING_APPLICATION_JSON='{
  "trexsql.enabled":"true",
  "trexsql.cache-path":"/tmp/trexcache",
  "datasource.url":"jdbc:postgresql://localhost:5432/webapi",
  "datasource.username":"ohdsi_app_user",
  "datasource.password":"app1",
  "datasource.ohdsi.schema":"webapi",
  "spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi",
  "spring.flyway.user":"ohdsi_app_user",
  "spring.flyway.password":"app1",
  "spring.flyway.schemas":"webapi",
  "spring.batch.repository.table-prefix":"webapi.BATCH_",
  "cache.generation.cleanupInterval":"4000",
  "cache.generation.invalidAfterDays":"1"
}'

# --- 4. Run WebAPI under the tracing agent, merging into graalvm-config/ ---
mkdir -p "$CONFIG_DIR"
echo "[gen-config] launching WebAPI under native-image-agent (merge -> $CONFIG_DIR)"
"$JAVA_HOME/bin/java" \
  -agentlib:native-image-agent=config-merge-dir="$CONFIG_DIR" \
  -jar "$BOOT_JAR" > "$RUN_LOG" 2>&1 &
APP_PID=$!

cleanup() {
  # SIGTERM lets the agent flush the merged config on the JVM shutdown hook.
  if kill -0 "$APP_PID" 2>/dev/null; then
    echo "[gen-config] stopping WebAPI (graceful, agent flushes config)"
    kill -TERM "$APP_PID" 2>/dev/null || true
    for _ in $(seq 1 30); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 1; done
    kill -9 "$APP_PID" 2>/dev/null || true
  fi
  service postgresql stop || true
}
trap cleanup EXIT

echo "[gen-config] waiting up to ${BOOT_TIMEOUT}s for WebAPI to start"
started=""
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
  if grep -q "Started WebApi" "$RUN_LOG" 2>/dev/null; then started=1; break; fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then echo "[gen-config] WebAPI exited early; see $RUN_LOG" >&2; tail -40 "$RUN_LOG" >&2; exit 1; fi
  sleep 1
done
[ -n "$started" ] || { echo "[gen-config] WebAPI did not start within ${BOOT_TIMEOUT}s; see $RUN_LOG" >&2; tail -40 "$RUN_LOG" >&2; exit 1; }

# Let the cleanup scheduler fire several times so the entity-graph proxy is recorded.
echo "[gen-config] capturing for ${CAPTURE_SECONDS}s (CleanupScheduler tick = 4s)"
sleep "$CAPTURE_SECONDS"

# --- Capture the JDBC cache path (trexsql enabled) ---
# The native-image tracing agent is attached for the whole JVM run; exercising
# cache creation here makes it record the JDBC *driver* reflection and the
# java.sql.Driver service load that the cache fallback path needs. (The cache
# query builder is HoneySQL, not Java SqlRender, so there are no SqlRender
# resources to capture — only the JDBC driver metadata.)
echo "[gen-config] registering a self-referential Postgres source + exercising cache creation"
BASE="http://localhost:8080/WebAPI"
curl -fsS -X POST "$BASE/source" -H 'Content-Type: application/json' -d '{
  "sourceName":"gen-config-pg","sourceKey":"gen_config_pg","sourceDialect":"postgresql",
  "sourceConnection":"jdbc:postgresql://localhost:5432/webapi",
  "username":"ohdsi_app_user","password":"app1",
  "daimons":[{"daimonType":"CDM","tableQualifier":"webapi","priority":0}]
}' -o /tmp/gen-config-source.json -w "[gen-config] source-register: %{http_code}\n" || \
  echo "[gen-config] WARN: source registration returned non-zero (cache trace may be incomplete)"
curl -fsS -X POST "$BASE/source/gen_config_pg/cache" -H 'Content-Type: application/json' \
  -d '{"schemaName":"webapi"}' -o /tmp/gen-config-cache.json \
  -w "[gen-config] cache-create: %{http_code}\n" || \
  echo "[gen-config] WARN: cache creation returned non-zero (cache trace may be incomplete)"
sleep 5

# cleanup() (EXIT trap) stops the app gracefully so the agent writes the merged config.
echo "[gen-config] done — review changes:"
echo "    git -C '$REPO_ROOT' diff -- plugins/webapi/graalvm-config/"
echo "  then rebuild: plugins/webapi/build-native-lib.sh"
