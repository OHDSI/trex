#!/usr/bin/env python3
"""Extracts a replayable HTTP request corpus from the PostgREST v12.2.3
hspec-wai feature specs (test/spec/Feature/**/*.hs).

Recognized request forms (Test.Hspec.Wai):
    get "/path"
    post/put/patch "/path" <body>
    delete/options "/path"
    request methodX "/path" <headers> <body>

Bodies: string literals, [json|...|] / [str|...|] quasi-quotes, mempty /
BL.empty, (readFixtureFile "f"), (getInsertDataForTiobePlsTable n).
Headers: literal [(name, value), ...] lists plus the SpecHelper.hs helpers
acceptHdrs / rangeHdrs / rangeHdrsWithCount / planHdr / rangeUnit /
authHeader / authHeaderJWT (inlined by value). Requests built from variables
or unresolved helpers are skipped and counted.

Each entry is tagged with the config bucket its module runs under in
test/spec/Main.hs (baseCfg == "DEFAULT"; everything else is a variant
config). Output: corpus/<Module>.jsonl + corpus/skipped.jsonl +
corpus/supabase-js.jsonl (hand-built supabase-js v2 wire shapes).

Usage: extract_corpus.py --spec-root <postgrest checkout> [--out corpus]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Config buckets — the Main.hs spec -> AppConfig mapping.
# ---------------------------------------------------------------------------

DEFAULT = "DEFAULT"

# Whole module runs under baseCfg (Main.hs `specs` list + the standalone
# before-withApp blocks).
DEFAULT_MODULES = {
    "Feature.Auth.AuthSpec",
    "Feature.ConcurrentSpec",
    "Feature.CorsSpec",
    "Feature.Query.CustomMediaSpec",
    "Feature.NoSuperuserSpec",
    "Feature.OpenApi.OpenApiSpec",
    "Feature.OptionsSpec",
    "Feature.Query.AndOrParamsSpec",
    "Feature.Query.ComputedRelsSpec",
    "Feature.Query.DeleteSpec",
    "Feature.Query.EmbedDisambiguationSpec",
    "Feature.Query.EmbedInnerJoinSpec",
    "Feature.Query.InsertSpec",
    "Feature.Query.JsonOperatorSpec",
    "Feature.Query.NullsStripSpec",
    "Feature.Query.PreferencesSpec",
    "Feature.Query.QuerySpec",
    "Feature.Query.RawOutputTypesSpec",
    "Feature.Query.RelatedQueriesSpec",
    "Feature.Query.RpcSpec",
    "Feature.Query.SingularSpec",
    "Feature.Query.SpreadQueriesSpec",
    "Feature.Query.UpdateSpec",
    "Feature.Query.UpsertSpec",
    "Feature.Query.RangeSpec",       # beforeAll_ analyze, still baseCfg
    "Feature.Query.LimitedMutationSpec",
}

# Whole module runs under one variant config.
VARIANT_MODULES = {
    "Feature.Query.QueryLimitedSpec": "maxRows",
    "Feature.Query.UnicodeSpec": "unicode",
    "Feature.OpenApi.DisabledOpenApiSpec": "disabledOpenApi",
    "Feature.OpenApi.IgnorePrivOpenApiSpec": "ignorePrivOpenApi",
    "Feature.OpenApi.ProxySpec": "proxy",
    "Feature.OpenApi.SecurityOpenApiSpec": "securityOpenApi",
    "Feature.Auth.NoAnonSpec": "noAnon",
    "Feature.Auth.NoJwtSpec": "noJwt",
    "Feature.Auth.BinaryJwtSecretSpec": "binaryJwt",
    "Feature.Auth.AudienceJwtSecretSpec": "audienceJwt",
    "Feature.Auth.AsymmetricJwtSpec": "asymmetricJwk",
    "Feature.ExtraSearchPathSpec": "extraSearchPath",
    "Feature.Query.PostGISSpec": "extraSearchPath",
    "Feature.OpenApi.RootSpec": "rootSpec",
    "Feature.RpcPreRequestGucsSpec": "responseHeaders",
    "Feature.Query.MultipleSchemaSpec": "multipleSchema",
    "Feature.ObservabilitySpec": "observability",
    "Feature.Query.ServerTimingSpec": "serverTiming",
}

# Modules whose top-level functions run under different configs. Requests in
# unmapped top-level helpers get bucket "MIXED-HELPER" (never replayed as
# DEFAULT: attribution would be ambiguous).
FUNCTION_CONFIG = {
    ("Feature.Query.ErrorSpec", "pgErrorCodeMapping"): DEFAULT,
    ("Feature.Query.ErrorSpec", "nonExistentSchema"): "nonexistentSchema",
    ("Feature.Query.PgSafeUpdateSpec", "disabledSpec"): DEFAULT,
    ("Feature.Query.PgSafeUpdateSpec", "spec"): "pgSafeUpdate",
    ("Feature.Query.PlanSpec", "disabledSpec"): DEFAULT,
    ("Feature.Query.PlanSpec", "spec"): "planEnabled",
    ("Feature.Query.AggregateFunctionsSpec", "disallowed"): DEFAULT,
    ("Feature.Query.AggregateFunctionsSpec", "allowed"): "aggregatesEnabled",
    ("Feature.RollbackSpec", "allowed"): DEFAULT,
    ("Feature.RollbackSpec", "disallowed"): "disallowRollback",
    ("Feature.RollbackSpec", "forced"): "forceRollback",
}
SPLIT_MODULES = {m for (m, _f) in FUNCTION_CONFIG}


def config_for(module: str, function: str) -> str:
    if module in DEFAULT_MODULES:
        return DEFAULT
    if module in VARIANT_MODULES:
        return VARIANT_MODULES[module]
    if module in SPLIT_MODULES:
        return FUNCTION_CONFIG.get((module, function), "MIXED-HELPER")
    return "UNMAPPED"


# ---------------------------------------------------------------------------
# Haskell source masking: blank out strings, comments and quasi-quote bodies
# so structural scanning (anchors, bracket matching) is safe.
# ---------------------------------------------------------------------------

QQ_OPEN = re.compile(r"\[([a-zA-Z]+)\|")


def mask_source(text: str) -> str:
    out = list(text)
    i, n = 0, len(text)

    def blank(a: int, b: int) -> None:
        for k in range(a, b):
            if out[k] != "\n":
                out[k] = "\x01"

    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n:
                if text[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if text[j] == '"':
                    break
                j += 1
            blank(i + 1, j)
            i = j + 1
            continue
        if text.startswith("--", i):
            j = text.find("\n", i)
            j = n if j == -1 else j
            blank(i, j)
            i = j
            continue
        if text.startswith("{-", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if text.startswith("{-", j):
                    depth, j = depth + 1, j + 2
                elif text.startswith("-}", j):
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            blank(i, j)
            i = j
            continue
        m = QQ_OPEN.match(text, i)
        if m:
            j = text.find("|]", m.end())
            j = n if j == -1 else j
            blank(m.end(), j)
            i = j + 2 if j < n else n
            continue
        i += 1
    return "".join(out)


# ---------------------------------------------------------------------------
# Argument scanner — parses one applied argument at a position.
# ---------------------------------------------------------------------------

class Unresolvable(Exception):
    pass


HS_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "'": "'", "0": "\0", "a": "\a", "b": "\b", "f": "\f", "v": "\v"}
IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_.']*")


def skip_ws(masked: str, pos: int) -> int:
    # \x01 is masked comment/string-interior filler; interiors always sit
    # behind an unmasked delimiter, so skipping filler only skips comments.
    n = len(masked)
    while pos < n and masked[pos] in " \t\n\x01":
        pos += 1
    return pos


def parse_hs_string(text: str, pos: int) -> tuple[str, int]:
    """Parses a Haskell string literal starting at text[pos] == '"'."""
    assert text[pos] == '"'
    i, n = pos + 1, len(text)
    out: list[str] = []
    while i < n:
        c = text[i]
        if c == '"':
            return "".join(out), i + 1
        if c == "\\":
            i += 1
            c2 = text[i]
            if c2 in HS_ESCAPES:
                out.append(HS_ESCAPES[c2])
                i += 1
            elif c2 == "&":
                i += 1
            elif c2.isspace():  # string gap
                while i < n and text[i].isspace():
                    i += 1
                if i < n and text[i] == "\\":
                    i += 1
            elif c2.isdigit():
                j = i
                while j < n and text[j].isdigit():
                    j += 1
                out.append(chr(int(text[i:j])))
                i = j
            elif c2 == "x":
                j = i + 1
                while j < n and text[j] in "0123456789abcdefABCDEF":
                    j += 1
                out.append(chr(int(text[i + 1:j], 16)))
                i = j
            else:
                raise Unresolvable(f"string escape \\{c2}")
        else:
            out.append(c)
            i += 1
    raise Unresolvable("unterminated string")


def match_delim(masked: str, pos: int, open_c: str, close_c: str) -> int:
    depth, i, n = 0, pos, len(masked)
    while i < n:
        if masked[i] == open_c:
            depth += 1
        elif masked[i] == close_c:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise Unresolvable(f"unbalanced {open_c}{close_c}")


def parse_arg(text: str, masked: str, pos: int):
    """Returns (kind, payload, endpos). Kinds: str, qq, list, paren, ident."""
    pos = skip_ws(masked, pos)
    if pos >= len(text):
        raise Unresolvable("eof")
    c = text[pos]
    if c == "$":  # f $ arg — transparent
        return parse_arg(text, masked, pos + 1)
    if c == '"':
        val, end = parse_hs_string(text, pos)
        return "str", val, end
    m = QQ_OPEN.match(text, pos)
    if m:
        close = text.find("|]", m.end())
        if close == -1:
            raise Unresolvable("unterminated quasiquote")
        return "qq", (m.group(1), text[m.end():close]), close + 2
    if c == "[":
        end = match_delim(masked, pos, "[", "]")
        return "list", text[pos:end + 1], end + 1
    if c == "(":
        end = match_delim(masked, pos, "(", ")")
        return "paren", text[pos + 1:end], end + 1
    m = IDENT_RE.match(text, pos)
    if m:
        return "ident", m.group(0), m.end()
    raise Unresolvable(f"unparsable arg at {text[pos:pos+20]!r}")


# ---------------------------------------------------------------------------
# Expression resolution (paths / headers / bodies)
# ---------------------------------------------------------------------------

def split_top_level(s: str, sep: str) -> list[str]:
    """Splits on a separator at paren/bracket depth 0, string-aware."""
    parts, depth, i, n, last = [], 0, 0, len(s), 0
    while i < n:
        c = s[i]
        if c == '"':
            _, i = parse_hs_string(s, i)
            continue
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif depth == 0 and s.startswith(sep, i):
            # avoid splitting "<>" when sep="," etc.: sep is literal
            parts.append(s[last:i])
            i += len(sep)
            last = i
            continue
        i += 1
    parts.append(s[last:])
    return parts


def resolve_string_expr(s: str) -> str:
    """Resolves a string literal or `<>` concat of literals."""
    s = s.strip()
    parts = split_top_level(s, "<>")
    out = []
    for p in parts:
        p = p.strip()
        while p.startswith("(") and p.endswith(")"):
            p = p[1:-1].strip()
        if p.startswith('"'):
            val, end = parse_hs_string(p, 0)
            if p[end:].strip():
                raise Unresolvable(f"trailing tokens after string: {p!r}")
            out.append(val)
        else:
            raise Unresolvable(f"non-literal string part: {p!r}")
    return "".join(out)


# ---------------------------------------------------------------------------
# Local bindings (`let x = ...` / where clauses) — inlined by value so
# requests like `request methodGet "/x" [singular] ""` resolve.
# ---------------------------------------------------------------------------

BINDING_RE = re.compile(r"(?<![\w'])([a-z][A-Za-z0-9_']*)[ \t]*=(?![=>])")


def binding_expr_text(text: str, masked: str, start: int) -> str:
    """The binding's RHS: to end of line, extended while ()/[]/QQ unbalanced."""
    i, n, depth = start, len(text), 0
    while i < n:
        c = masked[i]
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif c == "\n" and depth <= 0:
            break
        i += 1
    expr = text[start:i].strip()
    return re.sub(r"\s+in$", "", expr)


class Ctx:
    """Per-request resolution context: nearest local binding wins."""

    def __init__(self, text: str, masked: str, bindings: list[tuple[int, str, int]],
                 span: tuple[int, int], reqpos: int):
        self.text, self.masked = text, masked
        self.bindings, self.span, self.reqpos = bindings, span, reqpos
        self.depth = 0

    def lookup(self, name: str) -> str | None:
        lo, hi = self.span
        cands = [(off, es) for off, n, es in self.bindings if n == name and lo <= off < hi]
        if not cands:
            return None
        before = [c for c in cands if c[0] <= self.reqpos]
        off, expr_start = max(before) if before else min(cands)
        return binding_expr_text(self.text, self.masked, expr_start)

    def guard(self):
        self.depth += 1
        if self.depth > 6:
            raise Unresolvable("binding recursion")


HEADER_NAME_IDENTS = {
    "hAccept": "Accept",
    "hAuthorization": "Authorization",
    "hContentType": "Content-Type",
    "hOrigin": "Origin",
    "hHost": "Host",
    "hRange": "Range",
    "hAcceptLanguage": "Accept-Language",
    "hIfNoneMatch": "If-None-Match",
    "hUserAgent": "User-Agent",
}


def byte_range_value(expr: str) -> str:
    """Network.HTTP.Types renderByteRange for the constructors used in specs."""
    e = expr.strip()
    while e.startswith("$") or (e.startswith("(") and e.endswith(")")):
        e = e.lstrip("$").strip()
        if e.startswith("(") and e.endswith(")"):
            e = e[1:-1].strip()
    m = re.match(r"ByteRangeFromTo\s+(\(?-?\d+\)?)\s+(\(?-?\d+\)?)$", e)
    if m:
        return f"{m.group(1).strip('()')}-{m.group(2).strip('()')}"
    m = re.match(r"ByteRangeFrom\s+(\(?-?\d+\)?)$", e)
    if m:
        return f"{m.group(1).strip('()')}-"
    m = re.match(r"ByteRangeSuffix\s+(\(?-?\d+\)?)$", e)
    if m:
        return f"-{m.group(1).strip('()')}"
    raise Unresolvable(f"byte range: {expr!r}")


def resolve_ident_string(name: str, ctx: "Ctx | None") -> str:
    if ctx is None:
        raise Unresolvable(f"string variable {name!r}")
    expr = ctx.lookup(name)
    if expr is None:
        raise Unresolvable(f"string variable {name!r}")
    ctx.guard()
    return resolve_string_expr(expr)


def resolve_header_elem(elem: str, ctx: "Ctx | None" = None) -> list[tuple[str, str]]:
    e = elem.strip()
    if not e:
        return []
    if e.startswith("("):
        inner = e[1:-1] if e.endswith(")") else None
        if inner is not None and "," in inner:
            parts = split_top_level(inner, ",")
            if len(parts) == 2:
                name_part, val_part = parts[0].strip(), parts[1].strip()
                if name_part.startswith('"'):
                    name = resolve_string_expr(name_part)
                elif name_part in HEADER_NAME_IDENTS:
                    name = HEADER_NAME_IDENTS[name_part]
                else:
                    raise Unresolvable(f"header name: {name_part!r}")
                return [(name, resolve_string_expr(val_part))]
        # parenthesized application, e.g. (authHeaderJWT "...")
        return resolve_headers_expr(e[1:-1] if e.endswith(")") else e, ctx)
    if e == "planHdr":
        return [("Accept", "application/vnd.pgrst.plan+json")]
    if e == "rangeUnit":
        return [("Range-Unit", "items")]
    m = re.match(r"authHeaderJWT\s+(.+)$", e, re.S)
    if m:
        tok = m.group(1).strip()
        val = resolve_string_expr(tok) if tok.startswith("\"") or tok.startswith("(") \
            else resolve_ident_string(tok, ctx)
        return [("Authorization", "Bearer " + val)]
    m = re.match(r"authHeader\s+(\"[^\"]*\")\s+(.+)$", e, re.S)
    if m:
        cred = m.group(2).strip()
        val = resolve_string_expr(cred) if cred.startswith("\"") or cred.startswith("(") \
            else resolve_ident_string(cred, ctx)
        return [("Authorization", resolve_string_expr(m.group(1)) + " " + val)]
    # a local binding, e.g. `let singular = ("Accept", ...)` / `auth = authHeaderJWT ...`
    if ctx is not None and re.fullmatch(r"[a-z][A-Za-z0-9_']*", e):
        expr = ctx.lookup(e)
        if expr is not None:
            ctx.guard()
            return resolve_headers_expr(expr, ctx)
    raise Unresolvable(f"header element: {e!r}")


def resolve_headers_expr(s: str, ctx: "Ctx | None" = None) -> list[tuple[str, str]]:
    s = s.strip()
    if s in ("[]", "mempty"):
        return []
    # top-level `<>` concatenation
    concat_parts = split_top_level(s, "<>")
    if len(concat_parts) > 1:
        out: list[tuple[str, str]] = []
        for p in concat_parts:
            out.extend(resolve_headers_expr(p, ctx))
        return out
    if s.startswith("[") and s.endswith("]"):
        out = []
        for elem in split_top_level(s[1:-1], ","):
            out.extend(resolve_header_elem(elem, ctx))
        return out
    if s.startswith("(") and s.endswith(")"):
        if len(split_top_level(s[1:-1], ",")) == 2:  # a bare header tuple
            return resolve_header_elem(s, ctx)
        return resolve_headers_expr(s[1:-1], ctx)
    m = re.match(r"acceptHdrs\s+(.+)$", s, re.S)
    if m:
        return [("Accept", resolve_string_expr(m.group(1)))]
    m = re.match(r"rangeHdrsWithCount\s+(.+)$", s, re.S)
    if m:
        return [("Prefer", "count=exact"), ("Range-Unit", "items"), ("Range", byte_range_value(m.group(1)))]
    m = re.match(r"rangeHdrs\s+(.+)$", s, re.S)
    if m:
        return [("Range-Unit", "items"), ("Range", byte_range_value(m.group(1)))]
    return resolve_header_elem(s, ctx)


def heredoc_decode(raw: str) -> str:
    """Text.Heredoc [str|...|]: strip the whitespace+'|' margin per line."""
    lines = raw.split("\n")
    out = [lines[0]]
    for line in lines[1:]:
        m = re.match(r"\s*\|(.*)$", line, re.S)
        if m:
            out.append(m.group(1))
        elif line.strip() == "":
            out.append("")  # terminator margin line -> trailing newline
        else:
            out.append(line)
    return "\n".join(out)


def tiobe_pls_body(rows: int) -> str:
    """SpecHelper.hs getInsertDataForTiobePlsTable (aeson-encoded)."""
    return json.dumps(
        [{"name": f"Lang {i}", "rank": i} for i in range(20, rows + 20 + 1)],
        separators=(",", ":"),
    )


class BodyResult:
    def __init__(self, text: str | None = None, b64: str | None = None):
        self.text, self.b64 = text, b64


def resolve_body(kind: str, payload, fixtures_dir: Path, ctx: "Ctx | None" = None) -> BodyResult:
    if kind == "str":
        return BodyResult(text=payload)
    if kind == "qq":
        tag, raw = payload
        if "#{" in raw:
            raise Unresolvable("quasiquote interpolation #{..}")
        if tag == "json":
            return BodyResult(text=raw.strip())
        if tag == "str":
            return BodyResult(text=heredoc_decode(raw))
        raise Unresolvable(f"quasiquoter [{tag}|]")
    if kind == "ident":
        if payload in ("mempty", "BL.empty"):
            return BodyResult(text="")
        if ctx is not None:
            expr = ctx.lookup(payload)
            if expr is not None:
                ctx.guard()
                try:  # applications/concats first (readFixtureFile "x", "a" <> "b")
                    return resolve_body("paren", expr, fixtures_dir, ctx)
                except Unresolvable:
                    pass
                emasked = mask_source(expr)
                k2, p2, _ = parse_arg(expr, emasked, 0)
                if k2 == "ident":
                    raise Unresolvable(f"body variable {payload!r} -> {p2!r}")
                return resolve_body(k2, p2, fixtures_dir, ctx)
        raise Unresolvable(f"body variable {payload!r}")
    if kind == "paren":
        inner = payload.strip()
        m = re.match(r"readFixtureFile\s+\"([^\"]+)\"$", inner)
        if m:
            data = (fixtures_dir / m.group(1)).read_bytes()
            return BodyResult(b64=base64.b64encode(data).decode())
        m = re.match(r"getInsertDataForTiobePlsTable\s+(\d+)$", inner)
        if m:
            return BodyResult(text=tiobe_pls_body(int(m.group(1))))
        try:
            return BodyResult(text=resolve_string_expr(inner))
        except Unresolvable:
            raise Unresolvable(f"body expression ({inner[:60]!r})")
    raise Unresolvable(f"body kind {kind}")


# ---------------------------------------------------------------------------
# Spec-file scanning
# ---------------------------------------------------------------------------

SIMPLE_FORMS = {"get": 1, "delete": 1, "options": 1, "post": 2, "put": 2, "patch": 2}
ANCHOR_RE = re.compile(
    r"(?<![\w'.\"])(?:(get|post|put|patch|delete|options)(?=[ \t\n]+[\"(\[$])|request[ \t\n]+method([A-Z][a-zA-Z]*))"
)
TOPLEVEL_RE = re.compile(r"^([a-z][A-Za-z0-9_']*)\s*(?:::|=|\s)", re.M)
# hspec `it "..."` blocks: requests between two `it`s belong to the first one.
# Used to group multi-request blocks that contain a `Prefer: tx=commit` step,
# so the runner can replay the whole block as one sequence per side.
IT_RE = re.compile(r"(?<![\w'])it[ \t\n]+[\"$(]")


def toplevel_defs(masked: str) -> list[tuple[int, str]]:
    """(offset, name) of top-level (column 0) definitions, in order."""
    defs: list[tuple[int, str]] = []
    for m in re.finditer(r"^([a-z][A-Za-z0-9_']*)[ \t]*(::|.*?=)", masked, re.M):
        name = m.group(1)
        if not defs or defs[-1][1] != name:
            defs.append((m.start(), name))
    return defs


def function_at(defs: list[tuple[int, str]], pos: int) -> str:
    name = ""
    for off, n in defs:
        if off <= pos:
            name = n
        else:
            break
    return name


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def scan_file(path: Path, rel: str, module: str, fixtures_dir: Path):
    text = path.read_text()
    masked = mask_source(text)
    defs = toplevel_defs(masked)
    bindings = [(bm.start(1), bm.group(1), bm.end()) for bm in BINDING_RE.finditer(masked)]
    it_positions = [m.start() for m in IT_RE.finditer(masked)]
    entries, skipped = [], []

    def it_block_of(pos: int) -> int:
        """Index of the nearest preceding `it` block (-1 if none)."""
        idx = -1
        for i, off in enumerate(it_positions):
            if off <= pos:
                idx = i
            else:
                break
        return idx

    def span_at(pos: int) -> tuple[int, int]:
        lo, hi = 0, len(text)
        for off, _n in defs:
            if off <= pos:
                lo = off
            else:
                hi = off
                break
        return lo, hi

    for m in ANCHOR_RE.finditer(masked):
        simple, method_word = m.group(1), m.group(2)
        if method_word is not None:
            method = method_word.upper()
            argspec = ("path", "headers", "body")
        else:
            method = {"get": "GET", "post": "POST", "put": "PUT", "patch": "PATCH",
                      "delete": "DELETE", "options": "OPTIONS"}[simple]
            argspec = ("path",) if SIMPLE_FORMS[simple] == 1 else ("path", "body")

        pos = m.end()
        src = f"{rel}:{line_of(text, m.start())}"
        func = function_at(defs, m.start())
        ctx = Ctx(text, masked, bindings, span_at(m.start()), m.start())
        record = {"source": src, "module": module, "function": func, "method": method}
        try:
            path_val: str | None = None
            headers: list[tuple[str, str]] = []
            body = BodyResult(text="")
            for what in argspec:
                kind, payload, pos = parse_arg(text, masked, pos)
                if what == "path":
                    if kind == "str":
                        path_val = payload
                    elif kind == "paren":
                        path_val = resolve_string_expr(payload)
                    else:
                        raise Unresolvable(f"path is {kind} {str(payload)[:40]!r}")
                elif what == "headers":
                    if kind == "list":
                        headers = resolve_headers_expr(payload, ctx)
                    elif kind == "paren":
                        headers = resolve_headers_expr(payload, ctx)
                    elif kind == "ident":
                        headers = resolve_headers_expr(payload, ctx)
                    else:
                        raise Unresolvable(f"headers are {kind}")
                else:  # body
                    body = resolve_body(kind, payload, fixtures_dir, ctx)
            record["path"] = path_val
            hdrs: dict[str, str] = {}
            for k, v in headers:
                hdrs[k] = f"{hdrs[k]}, {v}" if k in hdrs else v
            record["headers"] = hdrs
            if body.b64 is not None:
                record["body_b64"] = body.b64
            else:
                record["body"] = body.text or ""
            record["config"] = config_for(module, func)
            record["_it"] = it_block_of(m.start())
            entries.append(record)
        except Unresolvable as exc:
            record["reason"] = str(exc)
            record["config"] = config_for(module, func)
            skipped.append(record)

    # Group the entries of any `it` block that contains a tx=commit request:
    # those blocks are request SEQUENCES whose later steps observe the earlier
    # commits (e.g. InsertSpec inserts + verify-GET + rpc/reset_table). The
    # runner replays a group in order per side, with a full data reset before
    # each side (run_diff.py commit phase).
    commit_blocks = set()
    for e in entries:
        prefer = " ".join(v for k, v in e["headers"].items() if k.lower() == "prefer")
        if "tx=commit" in prefer and e["_it"] >= 0:
            commit_blocks.add((e["config"], e["_it"]))
    short = module.split(".")[-1]
    for e in entries:
        if (e["config"], e["_it"]) in commit_blocks:
            e["group"] = f"{short}-it{e['_it']:03d}"
        del e["_it"]
    return entries, skipped


# ---------------------------------------------------------------------------
# Feature.RollbackSpec — hand-ported corpus
#
# RollbackSpec's requests live in helper functions parameterized by the Prefer
# headers (`shouldRespondToReads reqHeaders ...`), which the scanner cannot
# resolve. The spec is small and stable, so it is ported by hand: the
# describe-blocks of `allowed` (runs under baseCfg -> DEFAULT), `disallowed`
# (testCfgDisallowRollback) and `forced` (testCfgForceRollback) are expanded
# into concrete entries mirroring test/spec/Feature/RollbackSpec.hs verbatim.
#
# Mutation helpers are request SEQUENCES (setup postItem / verify GETs /
# cleanup deleteItems); each `it` block becomes one replay group.
# ---------------------------------------------------------------------------

ROLLBACK_PREFERS = {
    "default": [("Prefer", "return=representation")],
    "commit": [("Prefer", "return=representation"), ("Prefer", "tx=commit")],
    "rollback": [("Prefer", "return=representation"), ("Prefer", "tx=rollback")],
}

# postItem / deleteItems (RollbackSpec.hs top of file)
_POST_ITEM = ("POST", "/items", [("Prefer", "tx=commit"), ("Prefer", "resolution=ignore-duplicates")], '{"id":0}')
_DELETE_ITEMS = ("DELETE", "/items?id=lte.0", [("Prefer", "tx=commit")], "")


def _rollback_blocks(hdrs, persist: bool):
    """The `it` blocks of shouldRespondToReads / shouldRaiseExceptions /
    should(Not)PersistMutations, as (block-name, grouped?, [requests])."""
    reads = [
        ("reads-get", False, [("GET", "/items?id=eq.1", hdrs, "")]),
        ("reads-head", False, [("HEAD", "/items?id=eq.1", hdrs, "")]),
        ("reads-get-rpc", False, [("GET", "/rpc/search?id=1", hdrs, "")]),
        ("reads-post-rpc", False, [("POST", "/rpc/search", hdrs, '{"id":1}')]),
    ]
    if persist:
        mutations = [
            ("persist-post", True, [
                ("POST", "/items", hdrs, '{"id":0}'),
                ("GET", "/items?id=eq.0", [], ""),
                _DELETE_ITEMS,
            ]),
            ("persist-put", True, [
                ("PUT", "/items?id=eq.0", hdrs, '{"id":0}'),
                ("GET", "/items?id=eq.0", [], ""),
                _DELETE_ITEMS,
            ]),
            ("persist-patch", True, [
                _POST_ITEM,
                ("PATCH", "/items?id=eq.0", hdrs, '{"id":-1}'),
                ("GET", "/items?id=eq.0", [], ""),
                ("GET", "/items?id=eq.-1", [], ""),
                _DELETE_ITEMS,
            ]),
            ("persist-delete", True, [
                _POST_ITEM,
                ("DELETE", "/items?id=eq.0", hdrs, ""),
                ("GET", "/items?id=eq.0", [], ""),
            ]),
        ]
    else:
        mutations = [
            ("nopersist-post", True, [
                ("POST", "/items", hdrs, '{"id":0}'),
                ("GET", "/items?id=eq.0", [], ""),
            ]),
            ("nopersist-put", True, [
                ("PUT", "/items?id=eq.0", hdrs, '{"id":0}'),
                ("GET", "/items?id=eq.0", [], ""),
            ]),
            ("nopersist-patch", True, [
                ("PATCH", "/items?id=eq.1", hdrs, '{"id":0}'),
                ("GET", "/items?id=eq.0", [], ""),
                # upstream says `get "items?id=eq.1"` (no leading slash) —
                # hspec-wai tolerates it, a real HTTP request line does not
                ("GET", "/items?id=eq.1", [], ""),
            ]),
            ("nopersist-delete", True, [
                ("DELETE", "/items?id=eq.1", hdrs, ""),
                ("GET", "/items?id=eq.1", [], ""),
            ]),
        ]
    raises = [
        ("raises-immediate", False, [("POST", "/rpc/raise_constraint", hdrs, "")]),
        ("raises-deferred", False, [("POST", "/rpc/raise_constraint", hdrs, '{"deferred": true}')]),
    ]
    return reads + mutations + raises


def rollback_corpus(module: str):
    """All RollbackSpec entries: (function, prefer-variant, persist?) matrix
    exactly as the allowed/disallowed/forced describes compose the helpers."""
    matrix = [
        # RollbackSpec.hs `allowed` (Main.hs: before withApp -> baseCfg)
        ("allowed", "default", False),
        ("allowed", "commit", True),
        ("allowed", "rollback", False),
        # `disallowed` (tx-end=commit): everything persists
        ("disallowed", "default", True),
        ("disallowed", "commit", True),
        ("disallowed", "rollback", True),
        # `forced` (tx-end=rollback): nothing persists
        ("forced", "default", False),
        ("forced", "commit", False),
        ("forced", "rollback", False),
    ]
    entries = []
    for func, prefer, persist in matrix:
        for block, grouped, requests in _rollback_blocks(ROLLBACK_PREFERS[prefer], persist):
            for method, path, headers, body in requests:
                hdrs: dict[str, str] = {}
                for k, v in headers:
                    hdrs[k] = f"{hdrs[k]}, {v}" if k in hdrs else v
                e = {
                    "source": f"Feature/RollbackSpec.hs ({func}/{prefer}/{block}, hand-ported)",
                    "module": module,
                    "function": func,
                    "method": method,
                    "path": path,
                    "headers": hdrs,
                    "body": body,
                    "config": config_for(module, func),
                }
                if grouped:
                    e["group"] = f"RollbackSpec-{func}-{prefer}-{block}"
                entries.append(e)
    return entries, []


# ---------------------------------------------------------------------------
# supabase-js v2 wire-shape corpus (hand-built)
# ---------------------------------------------------------------------------

JWT_SECRET = "reallyreallyreallyreallyverysafe"


def make_jwt(claims: dict) -> str:
    try:
        import jwt as pyjwt  # PyJWT
        return pyjwt.encode(claims, JWT_SECRET, algorithm="HS256")
    except ImportError:
        import hashlib
        import hmac

        def b64url(b: bytes) -> str:
            return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

        header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
        payload = b64url(json.dumps(claims, separators=(",", ":")).encode())
        sig = b64url(hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
        return f"{header}.{payload}.{sig}"


def supabase_corpus() -> list[dict]:
    """~60 requests replicating supabase-js v2 (postgrest-js) wire shapes
    against the spec fixtures. Roles: anon (apikey) and postgrest_test_author
    (fixtures' JWT-impersonated role, from roles.sql/privileges.sql)."""
    anon = make_jwt({"role": "postgrest_test_anonymous"})
    author = make_jwt({"role": "postgrest_test_author"})

    base = {  # headers supabase-js v2 always sends
        "X-Client-Info": "supabase-js/2.45.0",
        "Accept": "application/json",
    }
    auth_anon = {**base, "apikey": anon, "Authorization": f"Bearer {anon}"}
    auth_author = {**base, "apikey": anon, "Authorization": f"Bearer {author}"}

    entries: list[dict] = []

    def add(method: str, path: str, headers: dict | None = None, body=None, role="anon"):
        hdrs = dict(auth_author if role == "author" else auth_anon)
        if headers:
            hdrs.update(headers)
        e = {"method": method, "path": path, "headers": hdrs, "config": DEFAULT}
        if body is None:
            e["body"] = ""
        elif isinstance(body, str):
            e["body"] = body
            e["headers"].setdefault("Content-Type", "application/json")
        else:
            e["body"] = json.dumps(body, separators=(",", ":"))
            e["headers"].setdefault("Content-Type", "application/json")
        entries.append(e)

    # --- .select() basics -------------------------------------------------
    add("GET", "/projects?select=*")
    add("GET", "/projects?select=id,name")
    add("GET", "/projects?select=id,name,clients(id,name)")
    add("GET", "/clients?select=id,name,projects(id,name,tasks(id,name))")
    add("GET", "/projects?select=id,name&id=eq.1")
    add("GET", "/projects?select=*&name=like.*Windows*")
    add("GET", "/projects?select=*&id=in.(1,2,3)")
    add("GET", "/projects?select=*&id=gte.2&id=lte.4")
    add("GET", "/users?select=*&name=ilike.*angela*")
    add("GET", "/entities?select=*&arr=cs.{1,2}")
    add("GET", "/tasks?select=*&or=(id.eq.1,id.eq.2)")
    add("GET", "/projects?select=*&and=(id.gte.1,id.lte.2)")
    # order / limit / offset (supabase-js uses query params)
    add("GET", "/projects?select=*&order=id.desc")
    add("GET", "/projects?select=*&order=name.asc.nullsfirst")
    add("GET", "/projects?select=*&order=id.asc&limit=2")
    add("GET", "/projects?select=*&order=id.asc&limit=2&offset=2")
    add("GET", "/projects?select=*,clients(*)&clients.order=id.desc")
    # .range() — postgrest-js v2 also supports header form; exercise both
    add("GET", "/projects?select=*&order=id.asc", {"Range": "0-1", "Range-Unit": "items"})
    add("GET", "/items?order=id.asc", {"Range": "5-9", "Range-Unit": "items", "Prefer": "count=exact"})

    # --- counts ------------------------------------------------------------
    add("GET", "/projects?select=*", {"Prefer": "count=exact"})
    add("GET", "/projects?select=*", {"Prefer": "count=planned"})
    add("GET", "/projects?select=*", {"Prefer": "count=estimated"})
    add("HEAD", "/projects?select=*", {"Prefer": "count=exact"})
    add("HEAD", "/items?select=*&id=gt.5", {"Prefer": "count=exact"})

    # --- .single() / .maybeSingle() -----------------------------------------
    add("GET", "/projects?select=*&id=eq.1", {"Accept": "application/vnd.pgrst.object+json"})
    add("GET", "/projects?select=*&id=eq.999", {"Accept": "application/vnd.pgrst.object+json"})
    add("GET", "/projects?select=*&id=eq.999", {"Accept": "application/json"})  # maybeSingle fallback
    add("GET", "/projects?select=*", {"Accept": "application/vnd.pgrst.object+json"})  # multi-row error

    # --- CSV ----------------------------------------------------------------
    add("GET", "/projects?select=id,name", {"Accept": "text/csv"})
    add("GET", "/no_pk?select=*", {"Accept": "text/csv"})

    # --- insert -------------------------------------------------------------
    add("POST", "/projects", {"Prefer": "return=representation"}, {"id": 77, "name": "sb insert", "client_id": 1})
    add("POST", "/projects?select=id,name", {"Prefer": "return=representation"}, {"id": 78, "name": "sb insert 2", "client_id": None})
    add("POST", "/projects", {"Prefer": "return=minimal"}, {"id": 79, "name": "sb minimal", "client_id": 2})
    add("POST", "/projects?columns=id,name", {"Prefer": "return=representation,missing=default"}, {"id": 80, "name": "sb missing"})
    # bulk insert
    add("POST", "/projects", {"Prefer": "return=representation"},
        [{"id": 81, "name": "sb bulk 1", "client_id": 1}, {"id": 82, "name": "sb bulk 2", "client_id": 2}])
    add("POST", "/projects", {"Prefer": "return=representation,count=exact"},
        [{"id": 83, "name": "sb bulk count", "client_id": 1}])

    # --- upsert -------------------------------------------------------------
    add("POST", "/projects", {"Prefer": "resolution=merge-duplicates,return=representation"},
        {"id": 1, "name": "sb upserted", "client_id": 1})
    add("POST", "/projects", {"Prefer": "resolution=ignore-duplicates,return=representation"},
        {"id": 1, "name": "sb ignored", "client_id": 1})
    add("POST", "/tiobe_pls?on_conflict=name", {"Prefer": "resolution=merge-duplicates,return=representation"},
        {"name": "Python", "rank": 6})
    add("PUT", "/projects?id=eq.1", {"Prefer": "return=representation"}, {"id": 1, "name": "sb put", "client_id": 2})

    # --- update / delete ----------------------------------------------------
    add("PATCH", "/projects?id=eq.1", {"Prefer": "return=representation"}, {"name": "sb patched"})
    add("PATCH", "/projects?id=eq.1", {"Prefer": "return=minimal"}, {"name": "sb patched min"})
    add("PATCH", "/projects?id=in.(1,2)", {"Prefer": "return=representation,count=exact"}, {"name": "sb multi patch"})
    add("DELETE", "/projects?id=eq.4", {"Prefer": "return=representation"})
    add("DELETE", "/projects?id=eq.4", {"Prefer": "return=minimal"})
    add("DELETE", "/projects?id=in.(3,4)", {"Prefer": "return=representation,count=exact"})

    # --- rpc ----------------------------------------------------------------
    add("POST", "/rpc/add_them", None, {"a": 1, "b": 2})
    add("GET", "/rpc/add_them?a=1&b=2")
    add("POST", "/rpc/sayhello", None, {"name": "supabase"})
    add("GET", "/rpc/sayhello?name=supabase")
    add("POST", "/rpc/getproject", {"Accept": "application/vnd.pgrst.object+json"}, {"id": 1})
    add("POST", "/rpc/getallprojects?select=id,name", None, {})
    add("POST", "/rpc/getallprojects", {"Prefer": "count=exact"}, {})
    add("HEAD", "/rpc/getallprojects?select=*", {"Prefer": "count=exact"})
    add("POST", "/rpc/ret_setof_integers", {"Prefer": "count=exact"}, {})

    # --- auth'd role (postgrest_test_author on authors_only) ----------------
    add("GET", "/authors_only?select=*", None, None, role="author")
    add("POST", "/authors_only", {"Prefer": "return=representation"},
        {"owner": "supabase author", "secret": "s3kr3t"}, role="author")
    add("GET", "/authors_only?select=*")  # anon -> 401/403 parity
    add("POST", "/rpc/privileged_hello", None, {"name": "supabase"}, role="author")
    add("POST", "/rpc/privileged_hello", None, {"name": "supabase"})  # anon denied

    # --- misc wire shapes ---------------------------------------------------
    add("GET", "/")  # openapi root, supabase-js health-ish probe
    add("OPTIONS", "/projects")
    add("GET", "/projects?select=*&limit=0")
    add("GET", "/nonexistent_table?select=*")
    add("GET", "/projects?select=bogus_column")
    add("GET", "/projects?select=*&id=eq.notanumber")

    for i, e in enumerate(entries, 1):
        e["id"] = f"supabase-js-{i:04d}"
        e["source"] = "supabase-js.jsonl (hand-built)"
        e["module"] = "SupabaseJs"
        e["function"] = "wire"
    return entries


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec-root", default=os.environ.get("POSTGREST_SRC"),
                    help="PostgREST v12.2.3 checkout (contains test/spec)")
    ap.add_argument("--out", default=str(Path(__file__).parent / "corpus"))
    args = ap.parse_args()
    if not args.spec_root:
        print("--spec-root or POSTGREST_SRC required", file=sys.stderr)
        return 2

    spec_root = Path(args.spec_root)
    feature_dir = spec_root / "test" / "spec" / "Feature"
    fixtures_dir = spec_root / "test" / "spec" / "fixtures"
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_skipped = []
    per_module_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"extracted": 0, "skipped": 0})
    total = 0

    for path in sorted(feature_dir.rglob("*.hs")):
        rel = str(path.relative_to(spec_root / "test" / "spec"))
        module = rel[:-3].replace("/", ".")
        if module == "Feature.RollbackSpec":
            entries, skipped = rollback_corpus(module)
        else:
            entries, skipped = scan_file(path, rel, module, fixtures_dir)
        for i, e in enumerate(entries, 1):
            e["id"] = f"{module.split('.')[-1]}-{i:04d}"
        short = module.split(".")[-1]
        with open(out_dir / f"{short}.jsonl", "w") as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        all_skipped.extend(skipped)
        per_module_counts[short]["extracted"] += len(entries)
        per_module_counts[short]["skipped"] += len(skipped)
        total += len(entries)

    with open(out_dir / "skipped.jsonl", "w") as f:
        for e in all_skipped:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    sb = supabase_corpus()
    with open(out_dir / "supabase-js.jsonl", "w") as f:
        for e in sb:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    per_module_counts["supabase-js"]["extracted"] = len(sb)

    print(f"{'module':45s} {'extracted':>9s} {'skipped':>8s}")
    for mod in sorted(per_module_counts):
        c = per_module_counts[mod]
        print(f"{mod:45s} {c['extracted']:>9d} {c['skipped']:>8d}")
    print(f"{'TOTAL':45s} {total + len(sb):>9d} {len(all_skipped):>8d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
