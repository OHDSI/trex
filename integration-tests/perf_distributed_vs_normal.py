"""Microbenchmark: single-node normal query vs two-node distributed query.

Data is split 50/50 across two nodes. Compares:
  - Normal query on one node with all data
  - trex_db_query() across two nodes with 50% each

Run:  python -u perf_distributed_vs_normal.py
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


def print_row(label, stats):
    log(f"  {label:<35} {stats['min']:>8.2f} {stats['median']:>8.2f} "
        f"{stats['mean']:>8.2f} {stats['p95']:>8.2f} {stats['max']:>8.2f}")


def main():
    iterations = 30
    warmup = 5
    total_rows = 10_000_000
    half = total_rows // 2

    log("=" * 85)
    log("Microbenchmark: Single Node vs Two-Node Distributed (50/50 split)")
    log("=" * 85)

    # --- Single node (baseline) with all data ---
    gp0, fp0, pp0 = alloc_ports()
    baseline = Node([DB_EXT], gp0, fp0, pp0)
    log("Creating baseline node with all data...")
    baseline.execute(
        f"CREATE TABLE orders AS "
        f"SELECT i AS id, "
        f"  CASE WHEN i % 3 = 0 THEN 'US' WHEN i % 3 = 1 THEN 'EU' ELSE 'APAC' END AS region, "
        f"  (i % 1000) * 0.99 AS price "
        f"FROM range({total_rows}) t(i)"
    )

    # --- Two-node cluster ---
    log("Creating two-node cluster (50/50 split)...")

    # Node A: first half
    gp_a, fp_a, pp_a = alloc_ports()
    node_a = Node([DB_EXT], gp_a, fp_a, pp_a)
    node_a.execute(
        f"CREATE TABLE orders AS "
        f"SELECT i AS id, "
        f"  CASE WHEN i % 3 = 0 THEN 'US' WHEN i % 3 = 1 THEN 'EU' ELSE 'APAC' END AS region, "
        f"  (i % 1000) * 0.99 AS price "
        f"FROM range({half}) t(i)"
    )
    node_a.execute(f"SELECT trex_db_flight_start('0.0.0.0', {fp_a})")
    node_a.execute(f"SELECT trex_db_start('0.0.0.0', {gp_a}, 'bench-cluster')")
    node_a.execute(f"SELECT trex_db_register_service('flight', '127.0.0.1', {fp_a})")

    # Node B: second half
    gp_b, fp_b, pp_b = alloc_ports()
    node_b = Node([DB_EXT], gp_b, fp_b, pp_b)
    node_b.execute(
        f"CREATE TABLE orders AS "
        f"SELECT i AS id, "
        f"  CASE WHEN i % 3 = 0 THEN 'US' WHEN i % 3 = 1 THEN 'EU' ELSE 'APAC' END AS region, "
        f"  (i % 1000) * 0.99 AS price "
        f"FROM range({half}, {total_rows}) t(i)"
    )
    node_b.execute(f"SELECT trex_db_flight_start('0.0.0.0', {fp_b})")
    node_b.execute(
        f"SELECT trex_db_start_seeds('0.0.0.0', {gp_b}, 'bench-cluster', "
        f"'127.0.0.1:{gp_a}')"
    )
    node_b.execute(f"SELECT trex_db_register_service('flight', '127.0.0.1', {fp_b})")

    # Wait for cluster convergence
    log("Waiting for cluster convergence...")
    wait_for(node_a, "SELECT * FROM trex_db_nodes()", lambda r: len(r) >= 2, timeout=30)
    log("  Both nodes discovered.")
    wait_for(node_a, "SELECT * FROM trex_db_tables()",
             lambda r: sum(1 for row in r if 'orders' in str(row)) >= 2, timeout=60)
    log("  Tables visible on both nodes.")

    # Sanity check
    result = wait_for(
        node_a,
        f"SELECT * FROM trex_db_query('SELECT COUNT(*) AS cnt FROM orders')",
        lambda r: len(r) >= 1 and int(r[0][0]) == total_rows,
        timeout=30,
    )
    log(f"  Distributed COUNT sanity check: {result}")

    queries = [
        ("SELECT COUNT(*)",      "SELECT COUNT(*) FROM orders"),
        ("SELECT * LIMIT 10",    "SELECT * FROM orders LIMIT 10"),
        ("ORDER BY LIMIT 10",    "SELECT * FROM orders ORDER BY price DESC LIMIT 10"),
        ("WHERE filter + COUNT", "SELECT COUNT(*) FROM orders WHERE region = 'US'"),
        ("GROUP BY + SUM",       "SELECT region, SUM(price) FROM orders GROUP BY region"),
        ("GROUP BY + COUNT",     "SELECT region, COUNT(*) FROM orders GROUP BY region"),
        ("SUM aggregate",        "SELECT SUM(price) FROM orders"),
    ]

    log(f"\n--- {total_rows:,} total rows ({half:,} per node) ---")
    log(f"  {'Query':<35} {'Min':>8} {'Median':>8} {'Mean':>8} {'P95':>8} {'Max':>8}  (ms, n={iterations})")
    log(f"  {'-'*35} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")

    for label, sql in queries:
        # Baseline: normal query on single node with all data
        normal = bench(baseline, sql, iterations, warmup)

        # Distributed: query across two nodes
        escaped = sql.replace("'", "''")
        dist_sql = f"SELECT * FROM trex_db_query('{escaped}')"
        distributed = bench(node_a, dist_sql, iterations, warmup)

        overhead = distributed['median'] - normal['median']
        ratio = distributed['median'] / normal['median'] if normal['median'] > 0 else float('inf')
        speedup = normal['median'] / distributed['median'] if distributed['median'] > 0 else float('inf')

        print_row(f"{label} [1 node, normal]", normal)
        print_row(f"{label} [2 nodes, distributed]", distributed)
        if ratio <= 1:
            log(f"  {'  → speedup':<35} {-overhead:>+8.2f} ms ({speedup:.2f}x faster)")
        else:
            log(f"  {'  → overhead':<35} {overhead:>+8.2f} ms ({ratio:.2f}x slower)")
        log("")

    baseline.close()
    node_a.close()
    node_b.close()
    log("Done.")


if __name__ == "__main__":
    main()
