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

# --- 2. Build + install the bao trexsql jar to local .m2 (org.trex:trexsql) ---
# Read the version back off project.clj rather than pinning it in the wrapper
# pom: a plugin version bump would otherwise leave the pom pointing at a
# coordinate `lein install` no longer publishes, and the build falls through to
# clojars looking for a jar that was never released there.
echo "[webapi-native] lein install trexsql"
( cd "$BAO_JAVA_DIR" && lein install )
TREXSQL_VERSION="$(sed -n '1s/.*defproject[[:space:]]\+org\.trex\/trexsql[[:space:]]\+"\([^"]*\)".*/\1/p' "$BAO_JAVA_DIR/project.clj")"
if [ -z "$TREXSQL_VERSION" ]; then
  echo "[webapi-native] could not read trexsql version from project.clj" >&2
  exit 1
fi
echo "[webapi-native] trexsql version: $TREXSQL_VERSION"

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
# trexsql.enabled=true so TrexSQLAutoConfiguration's @ConditionalOnProperty passes
# during Spring AOT — conditions are frozen at build time in a closed-world native
# image, so the trexsql beans must be present at AOT to exist at runtime.
#
# security.auth.db.enabled=true for the same reason: DatabaseAuthConfig,
# LoginController.Database (the POST /user/login/db endpoint) and AuthDataSource
# are all @ConditionalOnProperty(security.auth.db.enabled=true). Without this at
# AOT they are pruned and DB login 404s at runtime regardless of env. The
# security.auth.db.datasource.* values point at the ephemeral build DB so the
# AuthDataSource bean initialises during the AOT context refresh; the real
# values are supplied by env at runtime. JWT (HS256) beans are matchIfMissing
# so they are already included.
#
# security.auth.oidc.enabled=true for the same reason: the whole OidcAuthConfig
# (the /user/login/openidDirect direct-token endpoint, the oauth2Login callback
# chain and the OIDC client registration) is @ConditionalOnProperty(security.auth.
# oidc.enabled=true). Without it at AOT the OIDC stack is pruned and every token
# exchange 401s at runtime regardless of SECURITY_AUTH_OIDC_ENABLED. Its beans call
# ClientRegistrations.fromIssuerLocation / NimbusJwtDecoder.withIssuerLocation, which
# fetch the provider discovery doc at construction, so serve a static one locally for
# the AOT context refresh (JWKS is fetched lazily at runtime, not at build). Real
# issuer/clientId/secret come from env at runtime when the beans are re-instantiated.
# Serve the discovery doc (as application/json — Spring's discovery parser requires it)
# for any path, so both the .well-known lookup and any oauth-authorization-server probe
# resolve. JWKS/token endpoints are not hit at build (only at runtime).
python3 - <<'PY' >/dev/null 2>&1 &
import http.server, socketserver
body = b'{"issuer":"http://127.0.0.1:8099/oidc","authorization_endpoint":"http://127.0.0.1:8099/oidc/auth","token_endpoint":"http://127.0.0.1:8099/oidc/token","jwks_uri":"http://127.0.0.1:8099/oidc/jwks","userinfo_endpoint":"http://127.0.0.1:8099/oidc/me","response_types_supported":["code"],"subject_types_supported":["public"],"id_token_signing_alg_values_supported":["RS256"],"scopes_supported":["openid","profile","email"]}'
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
socketserver.TCPServer(("127.0.0.1", 8099), H).serve_forever()
PY
echo $! > /tmp/oidc_mock.pid
for _ in $(seq 1 20); do curl -sf http://127.0.0.1:8099/oidc/.well-known/openid-configuration >/dev/null 2>&1 && break; sleep 0.5; done

export SPRING_APPLICATION_JSON='{"trexsql.enabled":"true","datasource.url":"jdbc:postgresql://localhost:5432/webapi","datasource.username":"ohdsi_app_user","datasource.password":"app1","datasource.ohdsi.schema":"webapi","spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi","spring.flyway.user":"ohdsi_app_user","spring.flyway.password":"app1","spring.flyway.schemas":"webapi","spring.batch.repository.table-prefix":"webapi.BATCH_","security.auth.db.enabled":"true","security.auth.db.datasource.driverClassName":"org.postgresql.Driver","security.auth.db.datasource.url":"jdbc:postgresql://localhost:5432/webapi","security.auth.db.datasource.username":"ohdsi_app_user","security.auth.db.datasource.password":"app1","security.auth.db.datasource.schema":"webapi","security.auth.oidc.enabled":"true","security.auth.oidc.clientId":"build","security.auth.oidc.apiSecret":"build","security.auth.oidc.url":"http://127.0.0.1:8099/oidc/.well-known/openid-configuration","security.auth.oauth.callback.api":"http://127.0.0.1:8099/cb","security.auth.oauth.callback.ui":"http://127.0.0.1:8099/ui"}'

# --- 5. Native build (Spring AOT + native-image shared library) ---
echo "[webapi-native] building native shared library"
( cd "$WRAPPER_DIR" && mvn -B -DskipTests -Dtrexsql.version="$TREXSQL_VERSION" package )

kill "$(cat /tmp/oidc_mock.pid 2>/dev/null)" 2>/dev/null || true
service postgresql stop || true

# --- 6. Locate and copy the produced shared library ---
NATIVE_SO="$(find "$WRAPPER_DIR/target" -maxdepth 1 -name 'libwebapi-native.so' -o -maxdepth 1 -name 'libwebapi-native.dylib' | head -1)"
if [ -z "$NATIVE_SO" ]; then
  echo "[webapi-native] ERROR: libwebapi-native shared library not found in $WRAPPER_DIR/target" >&2
  exit 1
fi
cp -f "$NATIVE_SO" "$WEBAPI_DIR/$(basename "$NATIVE_SO")"
echo "[webapi-native] done: $WEBAPI_DIR/$(basename "$NATIVE_SO")"
