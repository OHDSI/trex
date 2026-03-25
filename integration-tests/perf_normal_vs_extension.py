"""Microbenchmark: normal DuckDB query vs query via db extension (single node).

Compares direct SQL execution against trex_db_query() on the same node.
Run:  python -u perf_normal_vs_extension.py
"""

import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from conftest import Node, DB_EXT, alloc_ports, wait_for


def log(msg):
    print(msg, flush=True)


def bench(node, sql, iterations=50, warmup=5):
    """Run sql repeatedly, return timing stats in ms."""
    for _ in range(warmup):
        node.execute(sql)

    times = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        node.execute(sql)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        times.append(elapsed_ms)

    return {
        "min": round(min(times), 2),
        "median": round(statistics.median(times), 2),
        "mean": round(statistics.mean(times), 2),
        "p95": round(sorted(times)[int(len(times) * 0.95)], 2),
        "max": round(max(times), 2),
    }


def print_row(label, stats):
    log(f"  {label:<30} {stats['min']:>8.2f} {stats['median']:>8.2f} "
        f"{stats['mean']:>8.2f} {stats['p95']:>8.2f} {stats['max']:>8.2f}")


def main():
    iterations = 30
    warmup = 5
    table_size = 10_000_000

    log("=" * 80)
    log("Microbenchmark: Normal Query vs trex_db_query() — Single Node")
    log("=" * 80)

    gp, fp, pp = alloc_ports()
    node = Node([DB_EXT], gp, fp, pp)

    # Create table BEFORE starting gossip so first catalog scan picks it up
    node.execute(
        f"CREATE TABLE orders AS "
        f"SELECT i AS id, "
        f"  CASE WHEN i % 3 = 0 THEN 'US' WHEN i % 3 = 1 THEN 'EU' ELSE 'APAC' END AS region, "
        f"  (i % 1000) * 0.99 AS price "
        f"FROM range({table_size}) t(i)"
    )

    # Start flight + gossip
    node.execute(f"SELECT trex_db_flight_start('0.0.0.0', {fp})")
    node.execute(f"SELECT trex_db_start('0.0.0.0', {gp}, 'bench-cluster')")
    node.execute(f"SELECT trex_db_register_service('flight', '127.0.0.1', {fp})")

    log("Waiting for cluster self-discovery and catalog sync...")
    wait_for(node, "SELECT * FROM trex_db_nodes()", lambda r: len(r) >= 1, timeout=30)
    log("  Node discovered.")
    wait_for(node, "SELECT * FROM trex_db_tables()",
             lambda r: any('orders' in str(row) for row in r), timeout=60)
    log("  Table visible in catalog.")

    # Sanity check
    result = wait_for(
        node,
        "SELECT * FROM trex_db_query('SELECT COUNT(*) AS cnt FROM orders')",
        lambda r: len(r) >= 1,
        timeout=30,
    )
    log(f"  trex_db_query sanity check: {result}")

    queries = [
        ("SELECT COUNT(*)",      "SELECT COUNT(*) FROM orders"),
        ("SELECT * LIMIT 10",    "SELECT * FROM orders LIMIT 10"),
        ("ORDER BY LIMIT 10",    "SELECT * FROM orders ORDER BY price DESC LIMIT 10"),
        ("WHERE filter + COUNT", "SELECT COUNT(*) FROM orders WHERE region = 'US'"),
        ("GROUP BY + SUM",       "SELECT region, SUM(price) FROM orders GROUP BY region"),
        ("GROUP BY + COUNT",     "SELECT region, COUNT(*) FROM orders GROUP BY region"),
        ("SUM aggregate",        "SELECT SUM(price) FROM orders"),
    ]

    log(f"\n--- {table_size:,} rows (debug build) ---")
    log(f"  {'Query':<30} {'Min':>8} {'Median':>8} {'Mean':>8} {'P95':>8} {'Max':>8}  (ms, n={iterations})")
    log(f"  {'-'*30} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")

    for label, sql in queries:
        # Normal direct query
        normal = bench(node, sql, iterations, warmup)

        # Same query via db extension
        escaped = sql.replace("'", "''")
        ext_sql = f"SELECT * FROM trex_db_query('{escaped}')"
        extension = bench(node, ext_sql, iterations, warmup)

        overhead = extension['median'] - normal['median']
        ratio = extension['median'] / normal['median'] if normal['median'] > 0 else float('inf')

        print_row(f"{label} [normal]", normal)
        print_row(f"{label} [extension]", extension)
        log(f"  {'  → overhead':<30} {overhead:>+8.2f} ms ({ratio:.2f}x)")
        log("")

    node.close()
    log("Done.")


if __name__ == "__main__":
    main()
