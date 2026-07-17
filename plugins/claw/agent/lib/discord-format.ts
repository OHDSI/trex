// Discord renders no Markdown tables (pipes show as raw text), but text inside a
// ``` code block is monospace, so a space-aligned table lines up. This mirrors
// core's markdownTablesToCodeBlocks (discord adapter) for claw tools that post
// directly (postPlan/postChoice) instead of through the adapter's message path.

function isPipeRow(line: string | undefined): boolean {
  return typeof line === "string" && line.includes("|") && line.trim() !== "";
}

function splitTableCells(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string | undefined): boolean {
  if (!isPipeRow(line)) return false;
  const cells = splitTableCells(line as string);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function renderMonospaceTable(rows: string[]): string {
  const header = splitTableCells(rows[0]);
  const data = rows.slice(2).map(splitTableCells); // rows[1] is the separator
  const cols = header.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(header[c]?.length ?? 0, ...data.map((r) => r[c]?.length ?? 0)));
  const fmt = (r: string[]) => r.map((cell, c) => (cell ?? "").padEnd(widths[c])).join("  ").replace(/\s+$/, "");
  const sep = widths.map((w) => "-".repeat(Math.max(w, 3))).join("  ");
  return ["```", fmt(header), sep, ...data.map(fmt), "```"].join("\n");
}

/** Rewrite each GFM Markdown table as a fenced, column-aligned plain-text table. */
export function markdownTablesToCodeBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      out.push(lines[i]);
      i++;
      continue;
    }
    if (!inFence && isPipeRow(lines[i]) && isSeparatorRow(lines[i + 1])) {
      const block: string[] = [];
      while (i < lines.length && isPipeRow(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      out.push(renderMonospaceTable(block));
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}
