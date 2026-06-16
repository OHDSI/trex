// @ts-nocheck - Deno edge function

const MEASURE_ID = "patient.attributes.pcount";

interface AxisMeta { id: string; kind: "text" | "num"; binSize?: number; axisNum: number; }
interface CategoryLabel { name: string; }

export interface BarchartResult {
  data: Array<Record<string, string | number>>;
  categories: Array<{ id: string; name: string; type: string; axis: number; binsize?: number; order: string }>;
  measures: Array<{ id: string; name: string; type: string; group: number }>;
  totalPatientCount: number;
  postProcessingConfig: { fillMissingValuesEnabled: boolean; NOVALUE: string; shouldFormatBinningLabels: boolean };
}

/** Assemble the MRI barchart response, filling the Cartesian product of axis values. */
export function assembleBarchart(
  rows: Array<Record<string, any>>,
  axes: AxisMeta[],
  labels: CategoryLabel[],
): BarchartResult {
  // Normalize numeric pcount.
  const norm = rows.map((r) => {
    const o: Record<string, any> = { pcount: parseInt(String(r.pcount ?? r.column0 ?? "0"), 10) || 0 };
    for (const ax of axes) o[ax.id] = ax.kind === "num" ? Number(r[ax.id]) : (r[ax.id] ?? "NO_VALUE");
    return o;
  });

  const total = norm.reduce((s, r) => s + r.pcount, 0);

  // Distinct values per axis (sorted).
  const distinct = axes.map((ax) => {
    const vals = Array.from(new Set(norm.map((r) => r[ax.id])));
    vals.sort((a, b) => (ax.kind === "num" ? Number(a) - Number(b) : String(a).localeCompare(String(b))));
    return vals;
  });

  // Cartesian product → keyed lookup → fill 0.
  const key = (combo: any[]) => JSON.stringify(combo); // collision-free combo key
  const found = new Map<string, number>();
  for (const r of norm) found.set(key(axes.map((ax) => r[ax.id])), r.pcount);

  const combos: any[][] = distinct.reduce<any[][]>(
    (acc, vals) => acc.flatMap((prefix) => vals.map((v) => [...prefix, v])),
    [[]],
  );

  const data = combos.map((combo) => {
    const row: Record<string, string | number> = {};
    axes.forEach((ax, i) => { row[ax.id] = combo[i]; });
    row[MEASURE_ID] = found.get(key(combo)) ?? 0;
    return row;
  });

  const categories = axes.map((ax, i) => ({
    id: ax.id,
    name: labels[i]?.name ?? ax.id,
    type: ax.kind,
    axis: ax.axisNum,
    binsize: ax.binSize,
    order: "ASC",
  }));

  return {
    data,
    categories,
    measures: [{ id: MEASURE_ID, name: "Patient Count", type: "measure", group: 1 }],
    totalPatientCount: total,
    postProcessingConfig: { fillMissingValuesEnabled: true, NOVALUE: "NO_VALUE", shouldFormatBinningLabels: true },
  };
}
