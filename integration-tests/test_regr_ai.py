"""Regression tests for AI plugin fixes.

These tests run against the dockerized trex container exposing pgwire on
localhost:5433 (the standard dev setup). They verify three recent fixes:

1. trex_ai_load_model honors the alias parameter (used to be ignored).
2. trex_ai_download_model accepts the `<org>/<repo>` shorthand and constructs
   the HuggingFace resolve URL automatically.
3. BERT/MiniLM embedding models now produce finite, non-zero pooled vectors
   (previously returned all-zeros because pooling type was never configured).

All paths are *inside the container*. The fixtures stage the necessary model
files into the container before the SQL is executed.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import urllib.request

import psycopg2
import pytest
import logging

logger = logging.getLogger(__name__)


CONTAINER = "trexsql-trex-1"
PG_DSN = dict(host="127.0.0.1", port=5433, user="trex", password="trex", dbname="main")

# Tiny ~5 MB GGUF used as a generic model for the alias test.
TINY_MODEL_URL = (
    "https://huggingface.co/aladar/TinyLLama-v0-GGUF/resolve/main/TinyLLama-v0.Q8_0.gguf"
)
TINY_MODEL_HOST = "/tmp/trexsql_test_model.gguf"  # local cache on the host
TINY_MODEL_CONTAINER = "/tmp/trexsql_test_model.gguf"

# 20 MB BERT GGUF used to verify the pooling fix.
BERT_MODEL_URL = (
    "https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/"
    "resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf"
)
BERT_MODEL_HOST = "/tmp/trexsql_test_bert.gguf"
BERT_MODEL_CONTAINER = "/tmp/trexsql_test_bert.gguf"


def _docker_exec(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", "exec", CONTAINER, *args], capture_output=True, text=True, check=False)


def _docker_cp_to_container(src: str, dst: str) -> None:
    subprocess.run(
        ["docker", "cp", src, f"{CONTAINER}:{dst}"], check=True,
        capture_output=True, text=True,
    )


def _container_has_file(path: str) -> bool:
    return _docker_exec("test", "-f", path).returncode == 0


def _ensure_local(path: str, url: str, min_size: int) -> None:
    if os.path.exists(path) and os.path.getsize(path) >= min_size:
        return
    urllib.request.urlretrieve(url, path)


def _ensure_in_container(host_path: str, container_path: str) -> None:
    if not _container_has_file(container_path):
        _docker_cp_to_container(host_path, container_path)


@pytest.fixture(scope="module")
def conn():
    """A pgwire connection to the trex container with the ai extension loaded."""
    c = psycopg2.connect(**PG_DSN, connect_timeout=10)
    c.autocommit = True
    with c.cursor() as cur:
        cur.execute("LOAD 'ai'")
    yield c
    c.close()


@pytest.fixture(scope="module")
def tiny_model_in_container():
    _ensure_local(TINY_MODEL_HOST, TINY_MODEL_URL, min_size=1_000_000)
    _ensure_in_container(TINY_MODEL_HOST, TINY_MODEL_CONTAINER)
    return TINY_MODEL_CONTAINER


@pytest.fixture(scope="module")
def bert_model_in_container():
    _ensure_local(BERT_MODEL_HOST, BERT_MODEL_URL, min_size=10_000_000)
    _ensure_in_container(BERT_MODEL_HOST, BERT_MODEL_CONTAINER)
    return BERT_MODEL_CONTAINER


def _safe_unload(cur, name: str) -> None:
    try:
        cur.execute("SELECT trex_ai_unload_model(%s)", (name,))
        cur.fetchall()
    except Exception as e:
        logger.debug("ignoring %s: %s", type(e).__name__, e)


def test_alias_respected(conn, tiny_model_in_container):
    """trex_ai_load_model('<path>', 'foo') should register under 'foo', not the file stem."""
    alias = "regr_alias_foo"
    with conn.cursor() as cur:
        _safe_unload(cur, alias)
        cur.execute(
            "SELECT trex_ai_load_model(%s, %s)",
            (tiny_model_in_container, alias),
        )
        load_resp = cur.fetchall()[0][0]
        assert "success" in load_resp, load_resp

        cur.execute("SELECT trex_ai_list_loaded()")
        listed = json.loads(cur.fetchall()[0][0])
        assert alias in listed, f"expected alias '{alias}' in {listed}"
        # The stem-based name should NOT appear (unless coincidentally equal).
        assert "trexsql_test_model" not in listed, listed

        _safe_unload(cur, alias)


def test_download_url_shorthand(conn):
    """trex_ai_download_model('org/repo', 'file', '<dir>') expands to a HF URL."""
    out_dir = "/tmp/trexsql_regr_dl"
    fname = "TinyLLama-v0.Q8_0.gguf"
    # Clean target so the call has to actually download (not "already_exists").
    _docker_exec("rm", "-rf", out_dir)
    _docker_exec("mkdir", "-p", out_dir)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT trex_ai_download_model(%s, %s, %s)",
            ("aladar/TinyLLama-v0-GGUF", fname, out_dir),
        )
        resp = cur.fetchall()[0][0]

    assert "success" in resp, resp
    parsed = json.loads(resp)
    assert parsed.get("filename") == fname, parsed
    assert parsed.get("size", 0) > 1_000_000, parsed
    # File should now exist in the container.
    assert _container_has_file(f"{out_dir}/{fname}"), resp


def test_bert_embed_nonzero(conn, bert_model_in_container):
    """BERT (MiniLM-L6) embedding produces a finite, non-zero pooled vector."""
    alias = "regr_minilm"
    with conn.cursor() as cur:
        _safe_unload(cur, alias)
        cur.execute(
            "SELECT trex_ai_load_model_for_embeddings(%s, %s)",
            (bert_model_in_container, alias),
        )
        load_resp = cur.fetchall()[0][0]
        assert "success" in load_resp, load_resp

        cur.execute("SELECT trex_ai_embed(%s, %s)", (alias, "hello"))
        embed_resp = cur.fetchall()[0][0]
        parsed = json.loads(embed_resp)
        embeddings = parsed.get("embeddings", [])

        assert len(embeddings) > 0, embed_resp
        assert all(math.isfinite(x) for x in embeddings), "non-finite values present"
        # MiniLM-L6 returns a 384-dim vector.
        assert len(embeddings) == 384, len(embeddings)
        nonzero = sum(1 for x in embeddings if x != 0.0)
        # Pooled BERT output should be nearly fully non-zero.
        assert nonzero >= 0.9 * len(embeddings), f"only {nonzero}/{len(embeddings)} non-zero"

        _safe_unload(cur, alias)
