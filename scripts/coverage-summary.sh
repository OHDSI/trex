#!/usr/bin/env bash
# Emit per-crate coverage summary as JSON. Used by the ratchet to detect regressions.
set -euo pipefail

PLUGINS=(chdb db etl fhir hana migration pg_trex pgt pgwire pool runtime tpm transform)
OUT=${1:-coverage/summary.json}
mkdir -p "$(dirname "$OUT")"

echo "{" > "$OUT"
first=1
for p in "${PLUGINS[@]}"; do
  dir="plugins/$p"
  [ -f "$dir/Cargo.toml" ] || continue
  summary=$(cd "$dir" && cargo llvm-cov --summary-only --json 2>/dev/null || echo '{}')
  lines=$(echo "$summary" | jq '.data[0].totals.lines.percent // 0')
  regions=$(echo "$summary" | jq '.data[0].totals.regions.percent // 0')
  functions=$(echo "$summary" | jq '.data[0].totals.functions.percent // 0')
  if [ $first -eq 0 ]; then echo "," >> "$OUT"; fi
  first=0
  printf '  "%s": {"lines": %s, "regions": %s, "functions": %s}' \
    "$p" "$lines" "$regions" "$functions" >> "$OUT"
done
echo "" >> "$OUT"
echo "}" >> "$OUT"
