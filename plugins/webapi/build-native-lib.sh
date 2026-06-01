#!/usr/bin/env bash
# Build libwebapi-native.so embedding OHDSI WebAPI + the trexsql/bao integration.
#
# Heavy build: needs GraalVM, Maven, Leiningen, an ephemeral PostgreSQL, and
# ~12-16 GB RAM. Intended to run inside Dockerfile.native-lib (or a CI runner
# that already provides GraalVM + Postgres).
#
# Steps: install GraalVM -> lein install trexsql -> mvn install WebAPI jar ->
# start ephemeral PG -> native build -> copy libwebapi-native.so to plugins/webapi/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBAPI_DIR="$REPO_ROOT/plugins/webapi"
BAO_JAVA_DIR="$REPO_ROOT/plugins/bao/java"
WEBAPI_BE_DIR="$WEBAPI_DIR/webapi-be"
WRAPPER_DIR="$WEBAPI_DIR/webapi-native-lib"

export GRAAL_HOME="${GRAAL_HOME:-/opt/graalvm}"
export JAVA_HOME="${JAVA_HOME:-$GRAAL_HOME}"
export PATH="$JAVA_HOME/bin:$PATH"

# --- 1. GraalVM (skip if native-image already present) ---
if ! command -v native-image >/dev/null 2>&1; then
  echo "[webapi-native] installing GraalVM"
  bash "$WEBAPI_DIR/install-graalvm.sh"
fi
native-image --version

# --- 2. Build + install the bao trexsql jar to local .m2 (org.trex:trexsql:0.1.23) ---
echo "[webapi-native] lein install trexsql"
( cd "$BAO_JAVA_DIR" && lein install )

# --- 3. Install the WebAPI jar to local .m2 (org.ohdsi:WebAPI:3.0.0-SNAPSHOT) ---
# WebAPI binds surefire's skipTests to ${skipUnitTests} (and failsafe to
# ${skipITtests}), so the standard -DskipTests is ignored — use WebAPI's own
# skip properties, otherwise its tests run and fail (no embedded Postgres on arm).
# spring-boot.repackage.skip: keep the installed artifact a plain thin jar (classes
# at the root) instead of a Boot executable jar (classes under BOOT-INF/classes),
# so the wrapper module can load org.ohdsi.webapi.WebApi as a normal dependency.
echo "[webapi-native] mvn install WebAPI jar"
( cd "$WEBAPI_BE_DIR" && mvn -B -q -DskipUnitTests=true -DskipITtests=true \
    -Dspring-boot.repackage.skip=true -Dpackaging.type=jar install )

# --- 4. Ephemeral PostgreSQL for Spring AOT context refresh ---
echo "[webapi-native] starting ephemeral PostgreSQL"
service postgresql start
until pg_isready -q; do sleep 1; done
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ohdsi_app_user'\" | grep -q 1 || psql -c \"CREATE USER ohdsi_app_user WITH PASSWORD 'app1';\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='webapi'\" | grep -q 1 || createdb -O ohdsi_app_user webapi"
su postgres -c "psql -d webapi -c 'CREATE SCHEMA IF NOT EXISTS webapi AUTHORIZATION ohdsi_app_user;'"
export SPRING_APPLICATION_JSON='{"datasource.url":"jdbc:postgresql://localhost:5432/webapi","datasource.username":"ohdsi_app_user","datasource.password":"app1","datasource.ohdsi.schema":"webapi","spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi","spring.flyway.user":"ohdsi_app_user","spring.flyway.password":"app1","spring.flyway.schemas":"webapi","spring.batch.repository.table-prefix":"webapi.BATCH_"}'

# --- 5. Native build (Spring AOT + native-image shared library) ---
echo "[webapi-native] building native shared library"
( cd "$WRAPPER_DIR" && mvn -B -DskipTests package )

service postgresql stop || true

# --- 6. Locate and copy the produced shared library ---
NATIVE_SO="$(find "$WRAPPER_DIR/target" -maxdepth 1 -name 'libwebapi-native.so' -o -maxdepth 1 -name 'libwebapi-native.dylib' | head -1)"
if [ -z "$NATIVE_SO" ]; then
  echo "[webapi-native] ERROR: libwebapi-native shared library not found in $WRAPPER_DIR/target" >&2
  exit 1
fi
cp -f "$NATIVE_SO" "$WEBAPI_DIR/$(basename "$NATIVE_SO")"
echo "[webapi-native] done: $WEBAPI_DIR/$(basename "$NATIVE_SO")"
