#!/usr/bin/env bash
# Verify the java.text.Normalizer reflection fix actually lets jasypt ENCRYPT a
# real source row at boot (ensureSourceEncrypted), not just survive an empty DB.
#
# Phase 1: boot WebAPI with jasypt OFF -> flyway creates webapi.source; seed a row
#          with a known PLAINTEXT password, then stop.
# Phase 2: boot WebAPI with jasypt ON  -> SourceService.postConstruct.ensureSourceEncrypted
#          runs jasypt.encrypt over the seeded row. With the fix this succeeds and
#          the stored password changes to an ENC blob; without it, boot dies with
#          "Cannot find a valid UNICODE normalizer".
set -uo pipefail
PSQL="su postgres -c"

echo "[verify] starting postgres"
service postgresql start
until pg_isready -q; do sleep 1; done
$PSQL "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='ohdsi_app_user'\" | grep -q 1 || psql -c \"CREATE USER ohdsi_app_user WITH PASSWORD 'app1';\""
$PSQL "psql -tc \"SELECT 1 FROM pg_database WHERE datname='webapi'\" | grep -q 1 || createdb -O ohdsi_app_user webapi"
$PSQL "psql -d webapi -c 'CREATE SCHEMA IF NOT EXISTS webapi AUTHORIZATION ohdsi_app_user;'"

echo "[verify] starting mock OIDC discovery server"
python3 - <<'PY' >/dev/null 2>&1 &
import http.server, socketserver
body = b'{"issuer":"http://127.0.0.1:8099/oidc","authorization_endpoint":"http://127.0.0.1:8099/oidc/auth","token_endpoint":"http://127.0.0.1:8099/oidc/token","jwks_uri":"http://127.0.0.1:8099/oidc/jwks","userinfo_endpoint":"http://127.0.0.1:8099/oidc/me","response_types_supported":["code"],"subject_types_supported":["public"],"id_token_signing_alg_values_supported":["RS256"],"scopes_supported":["openid","profile","email"]}'
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self,*a): pass
socketserver.TCPServer(("127.0.0.1",8099),H).serve_forever()
PY
for _ in $(seq 1 20); do curl -sf http://127.0.0.1:8099/oidc/.well-known/openid-configuration >/dev/null 2>&1 && break; sleep 0.5; done

SAJ_BASE='"trexsql.enabled":"true","trexsql.cache-path":"/tmp/trexcache","datasource.url":"jdbc:postgresql://localhost:5432/webapi","datasource.username":"ohdsi_app_user","datasource.password":"app1","datasource.ohdsi.schema":"webapi","spring.flyway.url":"jdbc:postgresql://localhost:5432/webapi","spring.flyway.user":"ohdsi_app_user","spring.flyway.password":"app1","spring.flyway.schemas":"webapi","spring.batch.repository.table-prefix":"webapi.BATCH_","security.auth.oidc.enabled":"true","security.auth.oidc.clientId":"smoke","security.auth.oidc.apiSecret":"smoke","security.auth.oidc.url":"http://127.0.0.1:8099/oidc/.well-known/openid-configuration","security.auth.oauth.callback.api":"http://127.0.0.1:8099/cb","security.auth.oauth.callback.ui":"http://127.0.0.1:8099/ui"'

boot() { # $1=logfile  ; uses current env (jasypt vars) + SPRING_APPLICATION_JSON
  export SPRING_APPLICATION_JSON="{${SAJ_BASE}}"
  /app/harness > "$1" 2>&1 &
  echo $!
}
wait_boot() { # $1=logfile -> echoes running|error|exited
  for i in $(seq 1 90); do
    grep -q "WEBAPI_STATUS=running" "$1" && { echo running; return; }
    grep -q "WEBAPI_START=error" "$1" && { echo error; return; }
    kill -0 "$2" 2>/dev/null || { echo exited; return; }
    sleep 2
  done
  echo timeout
}

echo "=============== PHASE 1: boot jasypt OFF, seed a source row ==============="
unset JASYPT_ENCRYPTOR_ENABLED JASYPT_ENCRYPTOR_PASSWORD JASYPT_ENCRYPTOR_ALGORITHM
P1=$(boot /tmp/p1.log); R1=$(wait_boot /tmp/p1.log "$P1")
echo "[verify] phase1 boot: $R1"
if [ "$R1" != running ]; then echo "[verify] FATAL: phase1 did not boot"; tail -40 /tmp/p1.log; exit 1; fi
echo "[verify] source table columns:"
$PSQL "psql -d webapi -c '\d webapi.source'" 2>&1 | sed 's/^/    /'
# Seed one source row with plaintext password. Insert only the always-present NOT NULL-ish cols.
$PSQL "psql -d webapi -v ON_ERROR_STOP=0 -c \"INSERT INTO webapi.source (source_id, source_name, source_key, source_connection, username, source_password, source_dialect) VALUES (9001,'seed-src','seed_key','jdbc:postgresql://localhost:5432/webapi','ohdsi_app_user','PLAINSECRET','postgresql');\"" 2>&1 | sed 's/^/    /'
# Some schemas name the column 'password' not 'source_password' — try that too.
$PSQL "psql -d webapi -v ON_ERROR_STOP=0 -c \"INSERT INTO webapi.source (source_id, source_name, source_key, source_connection, username, password, source_dialect) VALUES (9002,'seed-src2','seed_key2','jdbc:postgresql://localhost:5432/webapi','ohdsi_app_user','PLAINSECRET','postgresql');\"" 2>&1 | sed 's/^/    /'
echo "[verify] seeded rows (raw password columns BEFORE jasypt):"
$PSQL "psql -d webapi -c \"SELECT source_id, username, password FROM webapi.source WHERE source_id IN (9001,9002);\"" 2>&1 | sed 's/^/    /'
kill "$P1" 2>/dev/null; sleep 3

echo "=============== PHASE 2: boot jasypt ON -> ensureSourceEncrypted ==============="
export JASYPT_ENCRYPTOR_ENABLED=true
export JASYPT_ENCRYPTOR_PASSWORD=smokeJasyptPwd1234567890abcdef
export JASYPT_ENCRYPTOR_ALGORITHM=PBEWITHSHA256AND256BITAES-CBC-BC
P2=$(boot /tmp/p2.log); R2=$(wait_boot /tmp/p2.log "$P2")
echo "[verify] phase2 boot (jasypt ON): $R2"
echo "[verify] UNICODE normalizer errors in phase2: $(grep -c 'Cannot find a valid UNICODE normalizer' /tmp/p2.log)"
echo "[verify] Application run failed in phase2:     $(grep -c 'Application run failed' /tmp/p2.log)"
echo "[verify] raw password columns AFTER jasypt boot (expect ENC/base64, not PLAINSECRET):"
$PSQL "psql -d webapi -c \"SELECT source_id, username, password FROM webapi.source WHERE source_id IN (9001,9002);\"" 2>&1 | sed 's/^/    /'
echo "=============== phase2 boot tail (for context) ==============="
grep -vE "WEBAPI_STATUS=" /tmp/p2.log | tail -25
echo "[verify] done"
