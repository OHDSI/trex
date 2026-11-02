"""Every DUCKDB_ONLY_FUNCTIONS name in plugins/db must exist in duckdb_functions().

The db plugin routes queries through a DuckDB final pass when they mention one
of these names; a rename upstream (as happened across 1.x -> 2.0) silently
breaks that routing. TRY_CAST is a keyword, not a catalog function.
"""

import os
import re

from conftest import REPO_ROOT

FINAL_PASS_RS = os.path.join(REPO_ROOT, "plugins/db/src/duckdb_final_pass.rs")
KEYWORDS = {"try_cast"}


def _duckdb_only_functions():
    src = open(FINAL_PASS_RS).read()
    body = re.search(r"DUCKDB_ONLY_FUNCTIONS: &\[&str\] = &\[(.*?)\];", src, re.S)
    assert body, "DUCKDB_ONLY_FUNCTIONS not found"
    names = [n.rstrip("(").lower() for n in re.findall(r'"([^"]+)"', body.group(1))]
    assert len(names) > 10, names
    return names


def test_final_pass_function_names_exist(node_factory):
    node = node_factory()
    present = {r[0] for r in node.execute("SELECT DISTINCT function_name FROM duckdb_functions()")}
    names = _duckdb_only_functions()
    missing = [n for n in names if n not in KEYWORDS and n not in present]
    assert not missing, f"missing from duckdb_functions(): {missing}"
    # Guards the KEYWORDS exemption: try_cast must stay a keyword that parses.
    assert node.execute("SELECT TRY_CAST('x' AS INTEGER)") == [(None,)]
