"""Microbenchmark: normal vs db extension with 1, 2, 4, 8 nodes.

All modes in one table for easy comparison.
Run:  python -u perf_all_modes.py
"""

import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from conftest import Node, DB_EXT, alloc_ports, wait_for


def log(msg):
    print(msg, flush=True)


def bench(node, sql, iterations=30, warmup=5):
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


TABLE_SQL = (
    "CREATE TABLE orders AS "
    "SELECT i AS id, "
    "  CASE WHEN i % 3 = 0 THEN 'US' WHEN i % 3 = 1 THEN 'EU' ELSE 'APAC' END AS region, "
    "  (i % 1000) * 0.99 AS price "
    "FROM range({start}, {end}) t(i)"
)


def setup_cluster(node_count, total_rows, cluster_id):
    """Set up an N-node cluster with data split evenly. Returns (coordinator, all_nodes)."""
    chunk = total_rows // node_count
    nodes = []

    for i in range(node_count):
        gp, fp, pp = alloc_ports()
        node = Node([DB_EXT], gp, fp, pp)
        start = i * chunk
        end = start + chunk if i < node_count - 1 else total_rows
        node.execute(TABLE_SQL.format(start=start, end=end))
        node.execute(f"SELECT trex_db_flight_start('0.0.0.0', {fp})")

        if i == 0:
            node.execute(f"SELECT trex_db_start('0.0.0.0', {gp}, '{cluster_id}')")
            seed_port = gp
        else:
            node.execute(
                f"SELECT trex_db_start_seeds('0.0.0.0', {gp}, '{cluster_id}', "
                f"'127.0.0.1:{seed_port}')"
            )

        node.execute(f"SELECT trex_db_register_service('flight', '127.0.0.1', {fp})")
        nodes.append(node)

    coordinator = nodes[0]
    wait_for(coordinator, "SELECT * FROM trex_db_nodes()",
             lambda r: len(r) >= node_count, timeout=30)
    wait_for(coordinator, "SELECT * FROM trex_db_tables()",
             lambda r: sum(1 for row in r if 'orders' in str(row)) >= node_count, timeout=60)
    return coordinator, nodes


def main():
    iterations = 30
    warmup = 5
    total_rows = 50_000_000
    node_counts = [1, 2, 4, 8]

    log("=" * 110)
    log(f"Microbenchmark: Normal vs Extension with 1/2/4/8 nodes — {total_rows:,} rows")
    log("=" * 110)

    # --- Baseline: plain DuckDB, no extension ---
    log("Setting up baseline node (normal query, no extension overhead)...")
    gp0, fp0, pp0 = alloc_ports()
    baseline = Node([DB_EXT], gp0, fp0, pp0)
    baseline.execute(TABLE_SQL.format(start=0, end=total_rows))
    log("  Baseline ready.")

    # --- N-node clusters ---
    coordinators = {}
    all_nodes = []
    for n in node_counts:
        log(f"Setting up {n}-node cluster ({total_rows // n:,} rows/node)...")
        coord, nodes = setup_cluster(n, total_rows, f"cluster-{n}")
        coordinators[n] = coord
        all_nodes.extend(nodes)
        count = coord.execute("SELECT * FROM trex_db_query('SELECT COUNT(*) FROM orders')")
        log(f"  {n}-node ready, count={count[0][0]}")

    queries = [
        ("SELECT COUNT(*)",      "SELECT COUNT(*) FROM orders"),
        ("SELECT * LIMIT 10",    "SELECT * FROM orders LIMIT 10"),
        ("ORDER BY LIMIT 10",    "SELECT * FROM orders ORDER BY price DESC LIMIT 10"),
        ("WHERE filter + COUNT", "SELECT COUNT(*) FROM orders WHERE region = 'US'"),
        ("GROUP BY + SUM",       "SELECT region, SUM(price) FROM orders GROUP BY region"),
        ("GROUP BY + COUNT",     "SELECT region, COUNT(*) FROM orders GROUP BY region"),
        ("SUM aggregate",        "SELECT SUM(price) FROM orders"),
    ]

    hdr_nodes = "".join(f" {f'{n}n (ms)':>12}" for n in node_counts)
    hdr_ratios = "".join(f" {f'{n}n ratio':>9}" for n in node_counts)
    sep_nodes = "".join(f" {'-'*12}" for _ in node_counts)
    sep_ratios = "".join(f" {'-'*9}" for _ in node_counts)

    log(f"\n--- {total_rows:,} rows ---")
    log(f"  {'Query':<25} {'Normal':>12}{hdr_nodes} {hdr_ratios}")
    log(f"  {'-'*25} {'-'*12}{sep_nodes} {sep_ratios}")

    for label, sql in queries:
        escaped = sql.replace("'", "''")
        ext_sql = f"SELECT * FROM trex_db_query('{escaped}')"

        normal = bench(baseline, sql, iterations, warmup)

        results = {}
        for n in node_counts:
            results[n] = bench(coordinators[n], ext_sql, iterations, warmup)

        vals = "".join(f" {results[n]['median']:>12.2f}" for n in node_counts)
        ratios = "".join(
            f" {results[n]['median'] / normal['median'] if normal['median'] > 0 else 0:>8.2f}x"
            for n in node_counts
        )

        log(f"  {label:<25} {normal['median']:>12.2f}{vals} {ratios}")

    log("")
    baseline.close()
    for node in all_nodes:
        node.close()
    log("Done.")


if __name__ == "__main__":
    main()
