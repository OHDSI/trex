#!/usr/bin/env python3
"""Replays the extracted corpus against the PostgREST v12.2.3 oracle container
and the plugin dev server, then diffs normalized responses.

Buckets: every corpus entry is tagged with the config bucket its spec module
runs under in upstream Main.hs (see bucket_config.py for the bucket -> PGRST_*
env mapping). With --orchestrate the runner manages the stack itself: per
bucket it regenerates report/oracle.env, force-recreates the oracle container
and (re)spawns serve_plugin.ts with the matching env, then replays that
bucket's entries. Without --orchestrate it replays against whatever stack is
currently running (only sensible for the bucket the stack is configured for).

Replay phases per bucket:
  * plain entries: both sides share the rollback-configured database; all
    sequences are reset via psql before every request so serial keys match.
  * commit units (any entry/group with `Prefer: tx=commit`, every group, and
    mutating requests in the disallowRollback bucket): replayed as a SEQUENCE
    per side — full fixture-data restore (truncate + reload of the pristine
    pg_dump taken at initdb time), then all steps on the oracle, restore
    again, all steps on the plugin, then diff step-wise. This keeps both
    sides' visible state identical even though the requests commit.

Compared per entry:
  * status
  * allowlisted headers: content-type (params order-insensitive),
    content-range, content-location, preference-applied (order-insensitive),
    location, www-authenticate, allow (order-insensitive)
  * body: JSON deep-equal for json-ish content types (top-level arrays as
    multisets when the request has no order=), exact text otherwise
    (modulo one trailing newline)

exceptions.yaml ({id: reason} or {bucket:id: reason}) marks known/accepted
diffs: they are reported separately and do not fail the run.

Usage:
  run_diff.py [--buckets DEFAULT] [--modules Mod1,Mod2] [--limit N]
  run_diff.py --buckets ALL --orchestrate     # the full variant sweep
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

from bucket_config import BUCKETS, SKIPPED_BUCKETS, bucket_env, render_env_file

HERE = Path(__file__).parent

ALLOWLIST = [
    "content-type",
    "content-range",
    "content-location",
    "preference-applied",
    "location",
    "www-authenticate",
    "allow",
]

# ---------------------------------------------------------------------------
# Database reset channel (persistent psql inside the db container)
# ---------------------------------------------------------------------------

class DbResetter:
    """Two reset levels against the fixture db:

    * reset_sequences(): setval() every sequence back to its snapshot value —
      cheap, used before every plain replayed request (sequences advance even
      inside rolled-back transactions).
    * full_reset(): TRUNCATE every fixture table and reload the pristine
      data-only pg_dump taken by initdb/zz-load-fixtures.sh — used around
      commit units. The dump's setval() calls restore the sequences too.
    """

    PGDATA = "/var/lib/postgresql/data"
    DUMP = PGDATA + "/pristine_data.sql"

    SEQ_SNAPSHOT_SQL = (
        "select format('select setval(%L, %s, %s);',"
        " quote_ident(schemaname)||'.'||quote_ident(sequencename),"
        " coalesce(last_value, start_value),"
        " case when last_value is null then 'false' else 'true' end)"
        " from pg_sequences;"
    )
    # every non-extension ordinary/partitioned table in user schemas
    TABLES_SQL = (
        "select string_agg(format('%I.%I', n.nspname, c.relname), ', ')"
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where c.relkind in ('r', 'p') and not c.relispartition"
        "   and n.nspname not in ('pg_catalog', 'information_schema')"
        "   and n.nspname not like 'pg\\_%'"
        "   and not exists (select 1 from pg_depend d"
        "     where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');"
    )
    MATVIEWS_SQL = (
        "select coalesce(string_agg(format('refresh materialized view %I.%I;',"
        " schemaname, matviewname), ' '), '')"
        " from pg_matviews where schemaname not in ('pg_catalog', 'information_schema');"
    )

    def __init__(self, container: str, log_path: Path):
        self.container = container
        self.log = open(log_path, "a")
        self.proc = subprocess.Popen(
            ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-qAt"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True,
        )
        self.seq_reset_sql = ""
        self.truncate_sql = ""
        self.matview_sql = ""
        self.full_resets = 0

    def _roundtrip(self, sql: str) -> list[str]:
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(sql + "\n\\echo __DONE__\n")
        self.proc.stdin.flush()
        out = []
        while True:
            line = self.proc.stdout.readline()
            if not line or line.strip() == "__DONE__":
                break
            out.append(line)
        return out

    def has_dump(self) -> bool:
        return subprocess.run(
            ["docker", "exec", self.container, "test", "-f", self.DUMP],
            capture_output=True, check=False,
        ).returncode == 0

    def ensure_dump(self) -> bool:
        """Returns True if the pristine dump is (now) available."""
        if self.has_dump():
            return True
        # Older db volumes predate the initdb snapshot step; take it now and
        # trust that the rollback-mode stack kept the data pristine.
        print("[reset] pristine_data.sql missing — snapshotting the current data "
              "(recreate the db with `make down up` for a guaranteed-pristine dump)")
        r = subprocess.run(
            ["docker", "exec", self.container, "pg_dump", "-U", "postgres", "-d", "postgres",
             "--data-only", "--disable-triggers", "--exclude-table=*.spatial_ref_sys",
             "-f", self.DUMP],
            capture_output=True, text=True, check=False,
        )
        if r.returncode != 0:
            print(f"[reset] pg_dump failed: {r.stderr.strip()}")
            return False
        return True

    def snapshot(self) -> None:
        self.seq_reset_sql = "".join(self._roundtrip(self.SEQ_SNAPSHOT_SQL))
        self.truncate_sql = "".join(self._roundtrip(self.TABLES_SQL)).strip()
        self.matview_sql = "".join(self._roundtrip(self.MATVIEWS_SQL)).strip()
        n = self.seq_reset_sql.count("setval")
        t = self.truncate_sql.count(",") + 1 if self.truncate_sql else 0
        print(f"[reset] snapshot: {n} sequences, {t} tables")

    def reset_sequences(self) -> None:
        self._roundtrip(self.seq_reset_sql)

    def full_reset(self) -> None:
        assert self.truncate_sql, "snapshot() not taken"
        self.full_resets += 1
        self._roundtrip(
            "set client_min_messages = warning;\n"
            f"truncate {self.truncate_sql} cascade;\n"
            f"\\i {self.DUMP}\n"
            f"{self.matview_sql}\n"
            "reset client_min_messages;"
        )

    def self_test(self) -> None:
        """full_reset must reproduce the fixture row counts."""
        before = "".join(self._roundtrip("select count(*) from test.items;")).strip()
        self._roundtrip("insert into test.items(id) select i from generate_series(20000, 20004) i;")
        self.full_reset()
        after = "".join(self._roundtrip("select count(*) from test.items;")).strip()
        if before != after or not before:
            raise RuntimeError(f"full_reset self-test failed: items {before!r} -> {after!r}")

    def close(self) -> None:
        try:
            self.proc.stdin.close()  # type: ignore[union-attr]
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        self.log.close()


# ---------------------------------------------------------------------------
# HTTP replay
# ---------------------------------------------------------------------------

# RFC3986 pchar/query characters. hspec-wai feeds raw bytes straight to the
# WAI app, so specs contain unencoded ">", '"', "{", "#", spaces... Real HTTP
# parsers (hyper under Deno.serve; warp is laxer) reject those in the request
# line, so we percent-encode them identically for BOTH sides — PostgREST
# decodes them back before parsing.
_SAFE = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            "-._~!$&'()*+,;=:@/?%")


def encode_path(path: str) -> str:
    out = []
    for ch in path:
        if ch in _SAFE:
            out.append(ch)
        else:
            out.append("".join(f"%{x:02X}" for x in ch.encode("utf-8")))
    return "".join(out)


def send(host: str, port: int, entry: dict, timeout: float = 30.0) -> dict:
    body = base64.b64decode(entry["body_b64"]) if "body_b64" in entry else entry.get("body", "").encode()
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request(entry["method"], encode_path(entry["path"]), body=body or None, headers=entry.get("headers", {}))
        resp = conn.getresponse()
        raw = resp.read()
        return {"status": resp.status, "headers": resp.getheaders(), "body": raw}
    finally:
        conn.close()


def entry_prefer(entry: dict) -> str:
    return " ".join(v for k, v in entry.get("headers", {}).items() if k.lower() == "prefer")


def wait_http(host: str, port: int, what: str, timeout: float = 90.0) -> None:
    """Waits until the endpoint answers with anything but 503 (PostgREST
    serves 503 while its pool/schema cache is still starting)."""
    deadline = time.time() + timeout
    last = "no response"
    while time.time() < deadline:
        try:
            r = send(host, port, {"method": "GET", "path": "/", "headers": {}})
            if r["status"] != 503:
                return
            last = f"status {r['status']}"
        except Exception as exc:
            last = f"{type(exc).__name__}: {exc}"
        time.sleep(0.5)
    raise RuntimeError(f"{what} did not come up on {host}:{port} ({last})")


# ---------------------------------------------------------------------------
# Normalization / diffing
# ---------------------------------------------------------------------------

def header_map(headers: list[tuple[str, str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in headers:
        k = k.lower()
        out[k] = f"{out[k]}, {v}" if k in out else v
    return out


def parse_media_type(v: str):
    parts = [p.strip() for p in v.split(";")]
    mtype = parts[0].lower()
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, val = p.split("=", 1)
            params[k.strip().lower()] = val.strip().lower()
        elif p:
            params[p.lower()] = ""
    return mtype, params


def norm_header(name: str, value: str | None):
    if value is None:
        return None
    if name == "content-type":
        return parse_media_type(value)
    if name in ("preference-applied", "allow"):
        return sorted(t.strip() for t in value.split(",") if t.strip())
    return value


def is_jsonish(ct: str | None) -> bool:
    if not ct:
        return False
    mtype, _ = parse_media_type(ct)
    return mtype.endswith("+json") or mtype == "application/json"


def canon(x) -> str:
    return json.dumps(x, sort_keys=True, ensure_ascii=False)


def json_first_diff(a, b, path="$"):
    """Returns (path, aval, bval) of the first structural difference."""
    if type(a) is not type(b):
        return path, a, b
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                return f"{path}.{k}", a.get(k, "<absent>"), b.get(k, "<absent>")
            d = json_first_diff(a[k], b[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}(len)", len(a), len(b)
        for i, (x, y) in enumerate(zip(a, b)):
            d = json_first_diff(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    return None if a == b else (path, a, b)


# EXPLAIN output fields that depend on runtime/caching, not on the query:
# both sides run the same SQL but can never produce equal measurements.
_PLAN_VOLATILE_KEYS = re.compile(
    r"^(Execution Time|Planning Time|Actual (Total|Startup) Time|I/O (Read|Write) Time|"
    r"(Shared|Local|Temp) (Hit|Read|Dirtied|Written) Blocks|Planning|Peak Memory Usage|"
    r"Sort Space Used|Heap Fetches)$"
)
_PLAN_VOLATILE_TEXT = [
    (re.compile(r"actual time=\d+\.\d+\.\.\d+\.\d+"), "actual time=X..X"),
    (re.compile(r"^(Execution|Planning) Time: \d+\.\d+ ms", re.M), r"\1 Time: X ms"),
    (re.compile(r"Buffers: [a-z]+(?: [a-z]+=\d+)+.*$", re.M), "Buffers: X"),
    (re.compile(r"Memory( Usage)?: \d+kB"), r"Memory\1: XkB"),
    (re.compile(r"Heap Fetches: \d+"), "Heap Fetches: X"),
]


def is_planish(ct: str | None) -> bool:
    return bool(ct) and parse_media_type(ct)[0] == "application/vnd.pgrst.plan+json"


def scrub_plan_json(x):
    if isinstance(x, dict):
        return {k: (0 if _PLAN_VOLATILE_KEYS.match(k) else scrub_plan_json(v)) for k, v in x.items()}
    if isinstance(x, list):
        return [scrub_plan_json(v) for v in x]
    return x


def scrub_plan_text(t: str) -> str:
    for rx, repl in _PLAN_VOLATILE_TEXT:
        t = rx.sub(repl, t)
    return t


def diff_bodies(entry: dict, o_ct: str | None, p_ct: str | None, o_body: bytes, p_body: bytes) -> list[str]:
    if is_planish(o_ct) and is_planish(p_ct):
        try:
            oj = scrub_plan_json(json.loads(o_body))
            pj = scrub_plan_json(json.loads(p_body))
        except ValueError:
            oj = pj = None
        if oj is not None:
            if oj == pj:
                return []
            d = json_first_diff(oj, pj)
            where, ov, pv = d if d else ("$", oj, pj)
            return [f"body-json at {where}: oracle={canon(ov)[:120]} plugin={canon(pv)[:120]}"]
    if o_ct and p_ct and parse_media_type(o_ct)[0].startswith("application/vnd.pgrst.plan") \
            and parse_media_type(p_ct)[0].startswith("application/vnd.pgrst.plan"):
        ot = scrub_plan_text(o_body.decode("utf-8", "replace")).rstrip("\n")
        pt = scrub_plan_text(p_body.decode("utf-8", "replace")).rstrip("\n")
        if ot == pt:
            return []
        return [f"body-text: oracle={ot[:160]!r} plugin={pt[:160]!r}"]
    if is_jsonish(o_ct) and is_jsonish(p_ct):
        try:
            oj = json.loads(o_body) if o_body.strip() else None
            pj = json.loads(p_body) if p_body.strip() else None
        except ValueError:
            oj = pj = Ellipsis
        if oj is not Ellipsis:
            if oj == pj:
                return []
            unordered = "order=" not in entry["path"]
            if unordered and isinstance(oj, list) and isinstance(pj, list):
                if sorted(map(canon, oj)) == sorted(map(canon, pj)):
                    return []
            d = json_first_diff(oj, pj)
            where, ov, pv = d if d else ("$", oj, pj)
            return [f"body-json at {where}: oracle={canon(ov)[:120]} plugin={canon(pv)[:120]}"]
    ot = o_body.decode("utf-8", "replace").rstrip("\n")
    pt = p_body.decode("utf-8", "replace").rstrip("\n")
    if ot == pt:
        return []
    return [f"body-text: oracle={ot[:160]!r} plugin={pt[:160]!r}"]


def diff_entry(entry: dict, o: dict, p: dict) -> list[str]:
    diffs: list[str] = []
    if o["status"] != p["status"]:
        diffs.append(f"status: oracle={o['status']} plugin={p['status']}")
    oh, ph = header_map(o["headers"]), header_map(p["headers"])
    for name in ALLOWLIST:
        ov, pv = norm_header(name, oh.get(name)), norm_header(name, ph.get(name))
        if ov != pv:
            if name in ("content-location", "location") and ov and pv \
                    and isinstance(ov, str) and isinstance(pv, str) \
                    and urllib.parse.unquote(ov) == urllib.parse.unquote(pv):
                diffs.append(f"header {name} encoding-only: oracle={oh.get(name)!r} plugin={ph.get(name)!r}")
            else:
                diffs.append(f"header {name}: oracle={oh.get(name)!r} plugin={ph.get(name)!r}")
    if entry["method"] != "HEAD":
        diffs.extend(diff_bodies(entry, oh.get("content-type"), ph.get("content-type"), o["body"], p["body"]))
    # encoding-only diffs are the least interesting; sort them last so the
    # failure cluster key (first diff) surfaces more significant mismatches
    diffs.sort(key=lambda d: d.split(":")[0].endswith("encoding-only"))
    return diffs


# ---------------------------------------------------------------------------
# Report writing
# ---------------------------------------------------------------------------

def fmt_response(tag: str, r: dict) -> str:
    lines = [f"--- {tag} ---", f"status: {r['status']}"]
    for k, v in sorted(r["headers"]):
        lines.append(f"{k}: {v}")
    body = r["body"].decode("utf-8", "replace")
    if len(body) > 4000:
        body = body[:4000] + f"... [{len(r['body'])} bytes total]"
    lines.append("")
    lines.append(body)
    return "\n".join(lines)


def write_failure(report_dir: Path, bucket: str, entry: dict, o: dict, p: dict, diffs: list[str]) -> None:
    mod = entry["module"].split(".")[-1]
    d = report_dir / "failures" / bucket / mod
    d.mkdir(parents=True, exist_ok=True)
    body = entry.get("body", "")
    if "body_b64" in entry:
        body = f"<binary, {len(entry['body_b64'])} b64 chars>"
    content = "\n".join(
        [
            f"id: {entry['id']}",
            f"bucket: {bucket}",
            f"source: {entry['source']}",
            f"group: {entry.get('group', '-')}",
            f"request: {entry['method']} {entry['path']}",
            f"headers: {json.dumps(entry.get('headers', {}), ensure_ascii=False)}",
            f"body: {body[:2000]}",
            "",
            "=== DIFFS ===",
            *diffs,
            "",
            fmt_response("oracle", o),
            "",
            fmt_response("plugin", p),
            "",
        ]
    )
    (d / f"{entry['id']}.diff").write_text(content)


# ---------------------------------------------------------------------------
# Corpus / units
# ---------------------------------------------------------------------------

def load_corpus(corpus_dir: Path) -> list[dict]:
    entries = []
    for f in sorted(corpus_dir.glob("*.jsonl")):
        if f.name == "skipped.jsonl":
            continue
        for line in f.read_text().splitlines():
            if line.strip():
                entries.append(json.loads(line))
    return entries


def load_exceptions(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        import yaml
        data = yaml.safe_load(path.read_text()) or {}
        return {str(k): str(v) for k, v in data.items()}
    except ImportError:
        out = {}
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and ":" in line:
                k, v = line.rsplit(":", 1)
                out[k.strip().strip('"')] = v.strip()
        return out


def build_units(entries: list[dict]) -> list[list[dict]]:
    """Consecutive entries sharing a `group` become one replay unit."""
    units: list[list[dict]] = []
    i = 0
    while i < len(entries):
        g = entries[i].get("group")
        if g:
            j = i
            while j < len(entries) and entries[j].get("group") == g:
                j += 1
            units.append(entries[i:j])
            i = j
        else:
            units.append([entries[i]])
            i += 1
    return units


MUTATING = ("POST", "PUT", "PATCH", "DELETE")


def is_commit_unit(unit: list[dict], bucket: str) -> bool:
    """Units that need the full-restore sequenced replay: anything that can
    COMMIT data changes, plus every multi-request group (their later steps
    depend on the earlier ones having run on the same side)."""
    if len(unit) > 1:
        return True
    if any("tx=commit" in entry_prefer(e) for e in unit):
        return True
    # tx-end=commit: even requests without Prefer: tx=commit persist
    if BUCKETS[bucket].env.get("PGRST_DB_TX_END") == "commit":
        return unit[0]["method"] in MUTATING
    return False


# ---------------------------------------------------------------------------
# Stack management (--orchestrate)
# ---------------------------------------------------------------------------

class Stack:
    def __init__(self, args, report_dir: Path):
        self.args = args
        self.report_dir = report_dir
        self.plugin_proc: subprocess.Popen | None = None
        self.plugin_log = None
        self.o_host, self.o_port = split_hostport(args.oracle)
        self.p_host, self.p_port = split_hostport(args.plugin)

    def compose(self, *cmd: str) -> None:
        subprocess.run(
            ["docker", "compose", "-f", str(HERE / "docker-compose.yml"), *cmd],
            cwd=HERE, check=True, capture_output=True, text=True,
        )

    def start_bucket(self, bucket: str) -> None:
        (self.report_dir / "oracle.env").write_text(render_env_file(bucket, "oracle"))
        self.compose("up", "-d", "--force-recreate", "--no-deps", "oracle")
        wait_http(self.o_host, self.o_port, f"oracle[{bucket}]")
        self.stop_plugin()
        env = {k: v for k, v in os.environ.items() if not k.startswith("PGRST_")}
        env.update(bucket_env(bucket, "plugin"))
        env["PLUGIN_PORT"] = str(self.p_port)
        self.plugin_log = open(self.report_dir / f"serve_plugin.{bucket}.log", "w")
        self.plugin_proc = subprocess.Popen(
            [self.args.deno, "run", "--allow-net", "--allow-env", "--allow-read", "serve_plugin.ts"],
            cwd=HERE, env=env, stdout=self.plugin_log, stderr=self.plugin_log,
        )
        wait_http(self.p_host, self.p_port, f"plugin[{bucket}]")

    def stop_plugin(self) -> None:
        if self.plugin_proc is not None:
            self.plugin_proc.terminate()
            try:
                self.plugin_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.plugin_proc.kill()
            self.plugin_proc = None
        if self.plugin_log is not None:
            self.plugin_log.close()
            self.plugin_log = None
        # leftovers from `make serve` (the deno node-shim can detach children)
        subprocess.run(["pkill", "-f", r"deno run.*serve_plugin\.ts"], capture_output=True, check=False)
        time.sleep(0.3)


def split_hostport(s: str) -> tuple[str, int]:
    host, port = s.rsplit(":", 1)
    return host, int(port)


# ---------------------------------------------------------------------------
# Replay
# ---------------------------------------------------------------------------

class Runner:
    def __init__(self, args, entries, exceptions, resetter, report_dir):
        self.args = args
        self.entries = entries
        self.exceptions = exceptions
        self.resetter = resetter
        self.report_dir = report_dir
        self.o_host, self.o_port = split_hostport(args.oracle)
        self.p_host, self.p_port = split_hostport(args.plugin)
        self.module_filter = {m for m in args.modules.split(",") if m}
        # (bucket, module) -> counter
        self.stats: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.clusters: dict[tuple[str, str, str], list[str]] = defaultdict(list)
        self.failures: list[str] = []
        self.expected: list[str] = []
        self.replayed = 0
        self.commit_enabled = False

    def exception_for(self, bucket: str, eid: str) -> str | None:
        return self.exceptions.get(f"{bucket}:{eid}") or self.exceptions.get(eid)

    def record(self, bucket: str, entry: dict, o: dict, p: dict) -> None:
        mod = entry["module"].split(".")[-1]
        s = self.stats[(bucket, mod)]
        diffs = diff_entry(entry, o, p)
        exc = self.exception_for(bucket, entry["id"])
        if not diffs:
            s["pass"] += 1
            if exc is not None:
                self.expected.append(f"{bucket}:{entry['id']} PASSES but is in exceptions.yaml ({exc})")
        elif exc is not None:
            s["expected_diff"] += 1
            self.expected.append(f"{bucket}:{entry['id']} expected-diff: {exc}")
        else:
            s["fail"] += 1
            self.failures.append(f"{bucket}:{entry['id']} {diffs[0]}")
            first = re.sub(r"(oracle|plugin)=.*?( |$)", r"\1=… ", diffs[0])[:100]
            self.clusters[(bucket, mod, first.strip())].append(entry["id"])
            write_failure(self.report_dir, bucket, entry, o, p, diffs)

    def error(self, bucket: str, entry: dict, exc: Exception) -> None:
        mod = entry["module"].split(".")[-1]
        self.stats[(bucket, mod)]["error"] += 1
        self.clusters[(bucket, mod, f"transport-error: {type(exc).__name__}")].append(entry["id"])
        self.failures.append(f"{bucket}:{entry['id']} ERROR {exc}")

    def replay_bucket(self, bucket: str) -> None:
        cfgs = set(BUCKETS[bucket].corpus or [bucket])
        sel = []
        for e in self.entries:
            if e.get("config") not in cfgs:
                continue
            mod = e["module"].split(".")[-1]
            if self.module_filter and mod not in self.module_filter:
                continue
            self.stats[(bucket, mod)]["total"] += 1
            sel.append(e)
        units = build_units(sel)
        plain = [u for u in units if not is_commit_unit(u, bucket)]
        commit = [u for u in units if is_commit_unit(u, bucket)]

        for unit in plain:
            e = unit[0]
            s = self.stats[(bucket, e["module"].split(".")[-1])]
            if e["method"] in ("CONNECT", "TRACE"):
                s["skip_transport"] += 1
                continue
            if self.args.limit and self.replayed >= self.args.limit:
                s["skip_limit"] += 1
                continue
            self.replayed += 1
            try:
                self.resetter.reset_sequences()
                o = send(self.o_host, self.o_port, e)
                self.resetter.reset_sequences()
                p = send(self.p_host, self.p_port, e)
            except Exception as exc:
                self.error(bucket, e, exc)
                continue
            self.record(bucket, e, o, p)

        ran_commit = False
        for unit in commit:
            if not self.commit_enabled or (self.args.limit and self.replayed >= self.args.limit):
                key = "skip_commit" if not self.commit_enabled else "skip_limit"
                for e in unit:
                    self.stats[(bucket, e["module"].split(".")[-1])][key] += 1
                continue
            ran_commit = True
            self.replayed += len(unit)
            try:
                self.resetter.full_reset()
                o_resps = [send(self.o_host, self.o_port, e) for e in unit]
                self.resetter.full_reset()
                p_resps = [send(self.p_host, self.p_port, e) for e in unit]
            except Exception as exc:
                for e in unit:
                    self.error(bucket, e, exc)
                self.resetter.full_reset()
                continue
            for e, o, p in zip(unit, o_resps, p_resps):
                self.record(bucket, e, o, p)
        if ran_commit:
            self.resetter.full_reset()  # leave the db pristine


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def print_scoreboard(runner: Runner, replayed_buckets: list[str], t0: float) -> dict:
    cols = ["total", "pass", "fail", "expected_diff", "error",
            "skip_commit", "skip_transport", "skip_limit"]
    print()
    print(f"{'bucket/module':44s} " + " ".join(f"{c:>13s}" for c in cols))
    tot = defaultdict(int)
    for bucket in replayed_buckets:
        rows = sorted(m for (b, m) in runner.stats if b == bucket)
        btot = defaultdict(int)
        for mod in rows:
            s = runner.stats[(bucket, mod)]
            for c in cols:
                btot[c] += s[c]
                tot[c] += s[c]
            print(f"{bucket + '/' + mod:44s} " + " ".join(f"{s[c]:>13d}" for c in cols))
        if len(replayed_buckets) > 1 or len(rows) > 1:
            print(f"{'  = ' + bucket:44s} " + " ".join(f"{btot[c]:>13d}" for c in cols))
    print(f"{'TOTAL':44s} " + " ".join(f"{tot[c]:>13d}" for c in cols))
    print(f"\nreplayed {runner.replayed} entries in {time.time() - t0:.1f}s "
          f"({runner.resetter.full_resets} full db restores)")

    if runner.expected:
        print(f"\n=== expected diffs ({len(runner.expected)}) ===")
        for line in runner.expected:
            print("  " + line)

    if runner.clusters:
        print("\n=== failure clusters ===")
        ranked = sorted(runner.clusters.items(), key=lambda kv: -len(kv[1]))
        for (bucket, mod, pat), ids in ranked:
            print(f"{len(ids):4d}  {bucket + '/' + mod:36s} {pat}")
            print(f"      e.g. {', '.join(ids[:4])}")
    return dict(tot)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-dir", default=str(HERE / "corpus"))
    ap.add_argument("--report-dir", default=str(HERE / "report"))
    ap.add_argument("--exceptions", default=str(HERE / "exceptions.yaml"))
    ap.add_argument("--oracle", default="127.0.0.1:13000")
    ap.add_argument("--plugin", default="127.0.0.1:13001")
    ap.add_argument("--buckets", default="DEFAULT",
                    help="comma-separated bucket names, or ALL for the full sweep")
    ap.add_argument("--orchestrate", action="store_true",
                    help="restart oracle + plugin with each bucket's env (required for non-DEFAULT buckets)")
    ap.add_argument("--modules", default="", help="comma-separated module short-name filter")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--db-container", default="pgrst-diff-db")
    ap.add_argument("--deno", default=os.environ.get("DENO_BIN", "deno"))
    args = ap.parse_args()

    if args.buckets == "ALL":
        buckets = list(BUCKETS)
    else:
        buckets = [b for b in args.buckets.split(",") if b]
        unknown = [b for b in buckets if b not in BUCKETS]
        if unknown:
            skipped = [b for b in unknown if b in SKIPPED_BUCKETS]
            for b in skipped:
                print(f"[skip] bucket {b} is deliberately not replayed: {SKIPPED_BUCKETS[b]}")
            unknown = [b for b in unknown if b not in SKIPPED_BUCKETS]
            if unknown:
                print(f"unknown buckets: {unknown}; known: {sorted(BUCKETS)}", file=sys.stderr)
                return 2
            buckets = [b for b in buckets if b in BUCKETS]

    entries = load_corpus(Path(args.corpus_dir))
    exceptions = load_exceptions(Path(args.exceptions))
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    resetter = DbResetter(args.db_container, report_dir / "db_reset.log")
    runner = Runner(args, entries, exceptions, resetter, report_dir)
    runner.commit_enabled = resetter.ensure_dump()
    if not runner.commit_enabled:
        print("[reset] no pristine dump — tx=commit units will be SKIPPED")
    resetter.snapshot()  # table/matview lists (needed by full_reset)
    if runner.commit_enabled:
        resetter.full_reset()  # pristine start even after an aborted run
        resetter.snapshot()  # re-take the sequence values from pristine state
        resetter.self_test()

    t0 = time.time()
    stack = Stack(args, report_dir) if args.orchestrate else None
    try:
        for bucket in buckets:
            print(f"\n=== bucket {bucket} ({BUCKETS[bucket].upstream}) ===")
            import shutil
            shutil.rmtree(report_dir / "failures" / bucket, ignore_errors=True)
            if stack is not None:
                stack.start_bucket(bucket)
            runner.replay_bucket(bucket)
    finally:
        if stack is not None:
            stack.stop_plugin()
        # runs without --orchestrate leave the running stack alone

    tot = print_scoreboard(runner, buckets, t0)
    resetter.close()

    if args.buckets == "ALL" and SKIPPED_BUCKETS:
        print("\n=== buckets deliberately not replayed (see README) ===")
        for b, reason in SKIPPED_BUCKETS.items():
            print(f"  {b}: {reason}")

    summary = {
        "buckets": buckets,
        "stats": {f"{b}/{m}": dict(s) for (b, m), s in runner.stats.items()},
        "clusters": {f"{b}/{m}|{p}": ids for (b, m, p), ids in runner.clusters.items()},
    }
    (report_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    return 1 if tot.get("fail") or tot.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
