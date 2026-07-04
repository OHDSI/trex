#!/usr/bin/env python3
"""Replays the extracted corpus against the PostgREST v12.2.3 oracle container
and the plugin dev server, then diffs normalized responses.

Both sides share ONE fixture database in db-tx-end=rollback-allow-override
mode, so data stays pristine; entries that request `Prefer: tx=commit` are
skipped (deferred to a later harness version). Sequences still advance inside
rolled-back transactions, so before every replayed request (on each side) all
sequences are reset to their post-fixture values via psql in the db container
— serial keys come out identical on both sides.

Compared per entry:
  * status
  * allowlisted headers: content-type (params order-insensitive),
    content-range, content-location, preference-applied (order-insensitive),
    location, www-authenticate, allow (order-insensitive)
  * body: JSON deep-equal for json-ish content types (top-level arrays as
    multisets when the request has no order=), exact text otherwise
    (modulo one trailing newline)

exceptions.yaml ({id: reason}) marks known/accepted diffs: they are reported
separately and do not fail the run.

Usage: run_diff.py [--buckets DEFAULT] [--modules Mod1,Mod2] [--limit N]
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import re
import subprocess
import sys
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

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
# Sequence reset channel (persistent psql inside the db container)
# ---------------------------------------------------------------------------

class SeqResetter:
    SNAPSHOT_SQL = (
        "select format('select setval(%L, %s, %s);',"
        " quote_ident(schemaname)||'.'||quote_ident(sequencename),"
        " coalesce(last_value, start_value),"
        " case when last_value is null then 'false' else 'true' end)"
        " from pg_sequences;"
    )

    def __init__(self, container: str):
        self.proc = subprocess.Popen(
            ["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-qAt"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        self.reset_sql = "".join(self._roundtrip(self.SNAPSHOT_SQL))
        n = self.reset_sql.count("setval")
        print(f"[seq] snapshot of {n} sequences taken")

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

    def reset(self) -> None:
        self._roundtrip(self.reset_sql)

    def close(self) -> None:
        try:
            self.proc.stdin.close()  # type: ignore[union-attr]
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


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


def diff_bodies(entry: dict, o_ct: str | None, p_ct: str | None, o_body: bytes, p_body: bytes) -> list[str]:
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


def write_failure(report_dir: Path, entry: dict, o: dict, p: dict, diffs: list[str]) -> None:
    mod = entry["module"].split(".")[-1]
    d = report_dir / "failures" / mod
    d.mkdir(parents=True, exist_ok=True)
    body = entry.get("body", "")
    if "body_b64" in entry:
        body = f"<binary, {len(entry['body_b64'])} b64 chars>"
    content = "\n".join(
        [
            f"id: {entry['id']}",
            f"source: {entry['source']}",
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
# main
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
                k, v = line.split(":", 1)
                out[k.strip().strip('"')] = v.strip()
        return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-dir", default=str(HERE / "corpus"))
    ap.add_argument("--report-dir", default=str(HERE / "report"))
    ap.add_argument("--exceptions", default=str(HERE / "exceptions.yaml"))
    ap.add_argument("--oracle", default="127.0.0.1:13000")
    ap.add_argument("--plugin", default="127.0.0.1:13001")
    ap.add_argument("--buckets", default="DEFAULT", help="comma-separated config buckets to replay")
    ap.add_argument("--modules", default="", help="comma-separated module short-name filter")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--db-container", default="pgrst-diff-db")
    ap.add_argument("--no-seq-reset", action="store_true")
    args = ap.parse_args()

    o_host, o_port = args.oracle.rsplit(":", 1)
    p_host, p_port = args.plugin.rsplit(":", 1)
    o_port, p_port = int(o_port), int(p_port)
    buckets = set(args.buckets.split(","))
    module_filter = {m for m in args.modules.split(",") if m}

    entries = load_corpus(Path(args.corpus_dir))
    exceptions = load_exceptions(Path(args.exceptions))
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    resetter = None if args.no_seq_reset else SeqResetter(args.db_container)

    stats: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    clusters: dict[tuple[str, str], list[str]] = defaultdict(list)
    failures: list[str] = []
    expected: list[str] = []
    t0 = time.time()
    replayed = 0

    for entry in entries:
        mod = entry["module"].split(".")[-1]
        if module_filter and mod not in module_filter:
            continue
        s = stats[mod]
        s["total"] += 1
        if entry.get("config") not in buckets:
            s["skip_bucket"] += 1
            continue
        prefer = " ".join(v for k, v in entry.get("headers", {}).items() if k.lower() == "prefer")
        if "tx=commit" in prefer:
            s["skip_txcommit"] += 1
            continue
        if entry["method"] in ("CONNECT", "TRACE"):
            s["skip_transport"] += 1
            continue
        if args.limit and replayed >= args.limit:
            s["skip_limit"] += 1
            continue
        replayed += 1
        try:
            if resetter:
                resetter.reset()
            o = send(o_host, o_port, entry)
            if resetter:
                resetter.reset()
            p = send(p_host, p_port, entry)
        except Exception as exc:
            s["error"] += 1
            clusters[(mod, f"transport-error: {type(exc).__name__}")].append(entry["id"])
            failures.append(f"{entry['id']} ERROR {exc}")
            continue

        diffs = diff_entry(entry, o, p)
        if not diffs:
            s["pass"] += 1
            if entry["id"] in exceptions:
                expected.append(f"{entry['id']} PASSES but is in exceptions.yaml ({exceptions[entry['id']]})")
        elif entry["id"] in exceptions:
            s["expected_diff"] += 1
            expected.append(f"{entry['id']} expected-diff: {exceptions[entry['id']]}")
        else:
            s["fail"] += 1
            failures.append(f"{entry['id']} {diffs[0]}")
            first = re.sub(r"(oracle|plugin)=.*?( |$)", r"\1=… ", diffs[0])[:100]
            clusters[(mod, first.strip())].append(entry["id"])
            write_failure(report_dir, entry, o, p, diffs)

    if resetter:
        resetter.close()

    # ---- scoreboard --------------------------------------------------------
    cols = ["total", "pass", "fail", "expected_diff", "error", "skip_bucket", "skip_txcommit", "skip_transport", "skip_limit"]
    print()
    print(f"{'module':32s} " + " ".join(f"{c:>13s}" for c in cols))
    tot = defaultdict(int)
    for mod in sorted(stats):
        s = stats[mod]
        for c in cols:
            tot[c] += s[c]
        print(f"{mod:32s} " + " ".join(f"{s[c]:>13d}" for c in cols))
    print(f"{'TOTAL':32s} " + " ".join(f"{tot[c]:>13d}" for c in cols))
    print(f"\nreplayed {replayed} entries in {time.time() - t0:.1f}s")

    if expected:
        print(f"\n=== expected diffs ({len(expected)}) ===")
        for line in expected:
            print("  " + line)

    if clusters:
        print(f"\n=== failure clusters ===")
        ranked = sorted(clusters.items(), key=lambda kv: -len(kv[1]))
        for (mod, pat), ids in ranked:
            print(f"{len(ids):4d}  {mod:28s} {pat}")
            print(f"      e.g. {', '.join(ids[:4])}")

    summary = {
        "stats": {m: dict(s) for m, s in stats.items()},
        "clusters": {f"{m}|{p}": ids for (m, p), ids in clusters.items()},
    }
    (report_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    return 1 if tot["fail"] or tot["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
