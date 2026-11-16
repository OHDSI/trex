// Calibration examples for the judges, supplied by the deployment (ideally
// its own reviewed mappings) as a CSV file: source_data_identifier,
// source_code, original_source_name, source_name, target_concept_id,
// predicate. Only concept ids are given; names come from the deployment's
// vocabulary at runtime. Nothing is bundled with the plugin.
import { parseCsvRecords } from "./csv.ts";
import type { Env } from "./vocab.ts";

export interface GoldExample {
  source_data_identifier: string;
  source_code: string;
  original_source_name: string;
  source_name: string;
  target_concept_id: number;
  predicate: "exactMatch" | "broadMatch";
}

const COLUMNS = ["source_data_identifier", "source_code", "original_source_name", "source_name", "target_concept_id", "predicate"];

export function parseExamplesCsv(text: string): { examples: GoldExample[]; errors: string[] } {
  const records = parseCsvRecords(text);
  const header = (records[0] ?? []).map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { examples: [], errors: [`missing column(s): ${missing.join(", ")}`] };
  const at = (r: string[], c: string) => (r[header.indexOf(c)] ?? "").trim();
  const examples: GoldExample[] = [];
  const errors: string[] = [];
  records.slice(1).forEach((r, i) => {
    const id = Number(at(r, "target_concept_id"));
    const predicate = at(r, "predicate");
    if (!Number.isInteger(id) || id <= 0 || (predicate !== "exactMatch" && predicate !== "broadMatch")) {
      errors.push(`row ${i + 1}: needs an integer target_concept_id and predicate exactMatch or broadMatch`);
      return;
    }
    examples.push({
      source_data_identifier: at(r, "source_data_identifier"),
      source_code: at(r, "source_code"),
      original_source_name: at(r, "original_source_name"),
      source_name: at(r, "source_name"),
      target_concept_id: id,
      predicate,
    });
  });
  return { examples, errors };
}

export function examplesFor(
  all: GoldExample[],
  sourceDataIdentifier: string,
): { matchedInstitution: boolean; examples: GoldExample[] } {
  const matched = all.filter((e) => e.source_data_identifier === sourceDataIdentifier);
  return matched.length ? { matchedInstitution: true, examples: matched } : { matchedInstitution: false, examples: all };
}

let cache: { path: string; examples: GoldExample[] } | undefined;

/** Examples from CONCEPT_MAPPING_EXAMPLES_FILE, or none when it is unset. */
export async function loadExamples(env: Env): Promise<GoldExample[]> {
  const path = env("CONCEPT_MAPPING_EXAMPLES_FILE")?.trim();
  if (!path) return [];
  if (cache?.path !== path) {
    const { examples, errors } = parseExamplesCsv(await Deno.readTextFile(path));
    if (errors.length) console.warn(`concept-mapper: ${errors.length} invalid example row(s) skipped: ${errors.slice(0, 3).join("; ")}`);
    cache = { path, examples };
  }
  return cache.examples;
}
