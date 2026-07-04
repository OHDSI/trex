#!/usr/bin/env python3
"""Single source of truth for the per-bucket PGRST_* environments.

Each corpus entry is tagged with the config bucket its spec module runs under
in the upstream test/spec/Main.hs. This module ports every SpecHelper.hs
`testCfg*` function to the equivalent PGRST_* env overrides on top of baseCfg
(BASE below), for both sides of the diff:

  * side "oracle": the postgrest/postgrest:v12.2.3 container (db reachable as
    db:5432 on the compose network). docker-compose.yml points the oracle's
    env_file at report/oracle.env, which `make up` / the orchestrator
    (re)generate from here.
  * side "plugin": the serve_plugin.ts Deno process on the host (db reachable
    through the published port 15433). run_diff.py --orchestrate spawns it
    with this env directly (no shell parsing, so schema names with quotes and
    backslashes survive verbatim).

CLI: bucket_config.py --bucket DEFAULT --side oracle [--out FILE]
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field

DB_URI = {
    "oracle": "postgres://postgrest_test_authenticator@db:5432/postgres",
    "plugin": "postgres://postgrest_test_authenticator@127.0.0.1:15433/postgres",
}

# SpecHelper.hs baseCfg, key by key (see the comments that used to live in
# docker-compose.yml / plugin.env for the field-by-field mapping):
#   configDbUri            -> PGRST_DB_URI (per side, above)
#   configAppSettings      -> PGRST_APP_SETTINGS_*
#   configDbMaxRows = Nothing / configDbRootSpec = Nothing / jwtAud = Nothing
#     -> keys left unset
#   configServerHost/Port only feed the OpenAPI host output and must match on
#     both sides.
BASE = {
    "PGRST_APP_SETTINGS_app_host": "localhost",
    "PGRST_APP_SETTINGS_external_api_secret": "0123456789abcdef",
    "PGRST_DB_AGGREGATES_ENABLED": "false",
    "PGRST_DB_ANON_ROLE": "postgrest_test_anonymous",
    "PGRST_DB_CHANNEL_ENABLED": "true",
    # empty value parses to [""], which postgres treats as no extra schema
    "PGRST_DB_EXTRA_SEARCH_PATH": "",
    "PGRST_DB_HOISTED_TX_SETTINGS": "default_transaction_isolation,plan_filter.statement_cost_limit,statement_timeout",
    "PGRST_DB_PLAN_ENABLED": "false",
    "PGRST_DB_POOL": "10",
    "PGRST_DB_POOL_ACQUISITION_TIMEOUT": "10",
    "PGRST_DB_PRE_REQUEST": "test.switch_role",
    "PGRST_DB_PREPARED_STATEMENTS": "true",
    "PGRST_DB_SCHEMAS": "test",
    "PGRST_DB_CONFIG": "false",
    "PGRST_JWT_SECRET": "reallyreallyreallyreallyverysafe",
    "PGRST_JWT_SECRET_IS_BASE64": "false",
    "PGRST_JWT_ROLE_CLAIM_KEY": ".role",
    "PGRST_JWT_CACHE_MAX_LIFETIME": "0",
    "PGRST_LOG_LEVEL": "crit",
    "PGRST_OPENAPI_MODE": "follow-privileges",
    "PGRST_OPENAPI_SECURITY_ACTIVE": "false",
    "PGRST_SERVER_HOST": "*4",
    "PGRST_SERVER_PORT": "3000",
    "PGRST_DB_TX_END": "rollback-allow-override",
    "PGRST_SERVER_TIMING_ENABLED": "true",
}

# The binary JWT secret of testCfgBinaryJWT/testCfgAudienceJWT: B64.decodeLenient
# of this string (which happens to decode to the baseCfg secret text).
_BINARY_SECRET_B64 = "cmVhbGx5cmVhbGx5cmVhbGx5cmVhbGx5dmVyeXNhZmU="

# testCfgAsymJWK / testCfgAsymJWKSet (SpecHelper.hs, verbatim minus heredoc margins)
_ASYM_JWK = (
    '{"alg":"RS256","e":"AQAB","key_ops":["verify"],"kty":"RSA",'
    '"n":"0etQ2Tg187jb04MWfpuogYGV75IFrQQBxQaGH75eq_FpbkyoLcEpRUEWSbECP2eeFya2yZ9vIO5ScD-lPmovePk4Aa4SzZ8jdjhmAbNykleRPCxMg0481kz6PQhnHRUv3nF5WP479CnObJKqTVdEagVL66oxnX9VhZG9IZA7k0Th5PfKQwrKGyUeTGczpOjaPqbxlunP73j9AfnAt4XCS8epa-n3WGz1j-wfpr_ys57Aq-zBCfqP67UYzNpeI1AoXsJhD9xSDOzvJgFRvc3vm2wjAW4LEMwi48rCplamOpZToIHEPIaPzpveYQwDnB1HFTR1ove9bpKJsHmi-e2uzQ",'
    '"use":"sig"}'
)
_ASYM_JWK_SET = '{"keys": [' + _ASYM_JWK + "]}"


@dataclass
class Bucket:
    """One oracle+plugin configuration to replay corpus entries under."""

    # env overrides on top of BASE
    env: dict[str, str] = field(default_factory=dict)
    # BASE keys to remove (Nothing-valued upstream config fields)
    unset: list[str] = field(default_factory=list)
    # corpus `config` tags replayed under this bucket (defaults to [name])
    corpus: list[str] | None = None
    # upstream SpecHelper.hs config function, for traceability
    upstream: str = ""


# Replay order: DEFAULT first, schema-cache variants in the middle, the
# rollback buckets last (mirroring Main.hs, which runs them non-parallel at
# the end because they commit).
BUCKETS: dict[str, Bucket] = {
    "DEFAULT": Bucket(upstream="testCfg (baseCfg)"),
    "maxRows": Bucket(env={"PGRST_DB_MAX_ROWS": "2"}, upstream="testMaxRowsCfg"),
    "aggregatesEnabled": Bucket(env={"PGRST_DB_AGGREGATES_ENABLED": "true"}, upstream="testCfgAggregatesEnabled"),
    # testCfgServerTiming == baseCfg { configDbPlanEnabled = True } — identical
    # env to testPlanEnabledCfg, so ServerTimingSpec rides along here (the
    # harness never compares Server-Timing values; see README).
    "planEnabled": Bucket(
        env={"PGRST_DB_PLAN_ENABLED": "true"},
        corpus=["planEnabled", "serverTiming"],
        upstream="testPlanEnabledCfg / testCfgServerTiming",
    ),
    "unicode": Bucket(env={"PGRST_DB_SCHEMAS": "تست"}, upstream="testUnicodeCfg"),
    "extraSearchPath": Bucket(
        # configDbExtraSearchPath = ["public", "extensions", "EXTRA \"@/\\#~_-"]
        env={"PGRST_DB_EXTRA_SEARCH_PATH": 'public,extensions,EXTRA "@/\\#~_-'},
        upstream="testCfgExtraSearchPath",
    ),
    "multipleSchema": Bucket(
        # configDbSchemas = ["v1", "v2", "SPECIAL \"@/\\#~_-"]
        env={"PGRST_DB_SCHEMAS": 'v1,v2,SPECIAL "@/\\#~_-'},
        upstream="testMultipleSchemaCfg",
    ),
    "ignorePrivOpenApi": Bucket(
        env={"PGRST_OPENAPI_MODE": "ignore-privileges", "PGRST_DB_SCHEMAS": "test,v1"},
        upstream="testIgnorePrivOpenApiCfg",
    ),
    "disabledOpenApi": Bucket(env={"PGRST_OPENAPI_MODE": "disabled"}, upstream="testDisabledOpenApiCfg"),
    "securityOpenApi": Bucket(env={"PGRST_OPENAPI_SECURITY_ACTIVE": "true"}, upstream="testSecurityOpenApiCfg"),
    "rootSpec": Bucket(env={"PGRST_DB_ROOT_SPEC": "root"}, upstream="testCfgRootSpec"),
    "responseHeaders": Bucket(env={"PGRST_DB_PRE_REQUEST": "custom_headers"}, upstream="testCfgResponseHeaders"),
    "nonexistentSchema": Bucket(env={"PGRST_DB_SCHEMAS": "nonexistent"}, upstream="testNonexistentSchemaCfg"),
    "noAnon": Bucket(unset=["PGRST_DB_ANON_ROLE"], upstream="testCfgNoAnon"),
    "noJwt": Bucket(unset=["PGRST_JWT_SECRET", "PGRST_JWT_SECRET_IS_BASE64"], upstream="testCfgNoJWT"),
    "binaryJwt": Bucket(
        env={"PGRST_JWT_SECRET": _BINARY_SECRET_B64, "PGRST_JWT_SECRET_IS_BASE64": "true"},
        upstream="testCfgBinaryJWT",
    ),
    "audienceJwt": Bucket(
        env={
            "PGRST_JWT_SECRET": _BINARY_SECRET_B64,
            "PGRST_JWT_SECRET_IS_BASE64": "true",
            "PGRST_JWT_AUD": "youraudience",
        },
        upstream="testCfgAudienceJWT",
    ),
    # Main.hs runs AsymmetricJwtSpec twice: once with a single JWK, once with
    # a JWKSet. Both bucket runs replay the same corpus entries.
    "asymmetricJwk": Bucket(env={"PGRST_JWT_SECRET": _ASYM_JWK}, upstream="testCfgAsymJWK"),
    "asymmetricJwkSet": Bucket(
        env={"PGRST_JWT_SECRET": _ASYM_JWK_SET},
        corpus=["asymmetricJwk"],
        upstream="testCfgAsymJWKSet",
    ),
    # tx-rollback-all = false, tx-allow-override = false: every request COMMITS
    "disallowRollback": Bucket(env={"PGRST_DB_TX_END": "commit"}, upstream="testCfgDisallowRollback"),
    # tx-rollback-all = true, tx-allow-override = false
    "forceRollback": Bucket(env={"PGRST_DB_TX_END": "rollback"}, upstream="testCfgForceRollback"),
}

for _name, _b in BUCKETS.items():
    if _b.corpus is None:
        _b.corpus = [_name]

# Buckets that exist in the corpus tagging but are deliberately not replayed.
# (See README "Config buckets".)
SKIPPED_BUCKETS: dict[str, str] = {
    "proxy": "ProxySpec's only requests come from SpecHelper.validateOpenApiResponse "
    "(parameterized headers + dynamically JSON-encoded body) and are unresolvable "
    "at extraction time; the bucket has zero replayable corpus entries.",
    "observability": "testObservabilityCfg only sets server-trace-header; the plugin "
    "deliberately does not implement PGRST_SERVER_TRACE_HEADER (the trex stack has its "
    "own request-id middleware) and the spec's only assertions are on the echoed "
    "X-Request-Id header.",
    "pgSafeUpdate": "test.load_safeupdate() does LOAD 'safeupdate', which needs the "
    "pg-safeupdate C library; the postgis/postgis:16-3.4 fixture image does not ship "
    "it (upstream's nix test env does).",
}


def bucket_env(name: str, side: str) -> dict[str, str]:
    b = BUCKETS[name]
    env = dict(BASE)
    env["PGRST_DB_URI"] = DB_URI[side]
    env.update(b.env)
    for key in b.unset:
        env.pop(key, None)
    return env


def _env_file_line(key: str, value: str) -> str:
    # compose env-file syntax: single-quote values with characters that the
    # dotenv parser could mangle (inline comments, surrounding whitespace,
    # escapes). Values here never contain single quotes.
    if any(c in value for c in ' #"\\') or value == "":
        assert "'" not in value, f"cannot single-quote {key}"
        return f"{key}='{value}'"
    return f"{key}={value}"


def render_env_file(name: str, side: str) -> str:
    lines = [
        f"# generated by bucket_config.py — bucket {name} ({BUCKETS[name].upstream}), side {side}",
        "# do not edit; regenerate with: python3 bucket_config.py --bucket "
        f"{name} --side {side}",
    ]
    for key, value in bucket_env(name, side).items():
        lines.append(_env_file_line(key, value))
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", default="DEFAULT", choices=sorted(BUCKETS))
    ap.add_argument("--side", default="oracle", choices=["oracle", "plugin"])
    ap.add_argument("--out", default="-")
    args = ap.parse_args()
    text = render_env_file(args.bucket, args.side)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        from pathlib import Path

        p = Path(args.out)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
