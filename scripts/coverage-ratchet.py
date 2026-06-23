#!/usr/bin/env python3
"""Compare a fresh coverage summary against the committed baseline.

Exits non-zero only when a crate's line coverage drops by more than
TOLERANCE_PP percentage points. New crates and crates whose baseline is
marked build_failed are skipped. Meta keys (those starting with "_") in
the baseline are skipped — they exist for documentation only.

TOLERANCE_PP absorbs run-to-run measurement noise: larger crates with
integration tests routinely swing ~1pp between identical runs (test
ordering, timing-dependent branches, container flakiness), so a tight
threshold fails PRs that never touched the crate. The gate still catches
real regressions, which come from removing or disabling tests and are
much larger than the noise band.
"""
import json
import sys
from pathlib import Path

TOLERANCE_PP = 2.0

def main():
    baseline = json.loads(Path("coverage/baseline.json").read_text())
    current = json.loads(Path(sys.argv[1]).read_text())

    regressions = []
    improvements = []
    for plugin, base in baseline.items():
        if plugin.startswith("_"):
            continue
        if base.get("build_failed"):
            continue
        cur = current.get(plugin)
        if cur is None or cur.get("build_failed"):
            continue
        delta = cur["lines"] - base["lines"]
        if delta < -TOLERANCE_PP:
            regressions.append((plugin, base["lines"], cur["lines"], delta))
        elif delta > 0.1:
            improvements.append((plugin, base["lines"], cur["lines"], delta))

    for p, b, c, d in improvements:
        print(f"  + {p}: {b:.2f}% -> {c:.2f}% ({d:+.2f}pp)")
    for p, b, c, d in regressions:
        print(f"  - {p}: {b:.2f}% -> {c:.2f}% ({d:+.2f}pp)", file=sys.stderr)

    if regressions:
        print(f"\nFAIL: {len(regressions)} crate(s) regressed > {TOLERANCE_PP}pp", file=sys.stderr)
        sys.exit(1)
    print("\nOK: no regressions")

if __name__ == "__main__":
    main()
