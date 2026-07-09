// Ports the embedding/RPC error payload helpers of src/PostgREST/Error.hs
// (PostgREST v12.2.3): noRelBetweenHint / noRpcHint (the "Perhaps you meant"
// fuzzy suggestions for PGRST200/PGRST202) and compressedRel / relHint (the
// details/hint payloads of PGRST201).
//
// The fuzzy matching reimplements the fuzzyset-0.2.4 Haskell package
// (Data.FuzzySet, itself a port of fuzzyset.js) that upstream depends on:
// cosine similarity over 2-/3-grams of the normalized strings, re-scored with
// the normalized Levenshtein distance, with a minimum score of 0.33.

import type {
  QualifiedIdentifier,
  Relationship,
  RelationshipsMap,
  Routine,
} from "./schema-cache/types.ts";
import { relsMapKey } from "./schema-cache/types.ts";

// ---------------------------------------------------------------------------
// Data.FuzzySet (fuzzyset-0.2.4)
// ---------------------------------------------------------------------------

/** Data.FuzzySet.Types FuzzySetItem. */
interface FuzzySetItem {
  vectorMagnitude: number;
  normalizedEntry: string;
}

/** Data.FuzzySet.Types GramInfo. */
interface GramInfo {
  itemIndex: number;
  gramCount: number;
}

// defaultSet = emptySet 2 3 True
const GRAM_SIZE_LOWER = 2;
const GRAM_SIZE_UPPER = 3;
const MIN_MATCH_SCORE = 0.33;

/**
 * Data.FuzzySet.Util normalized — lowercase and remove non-word characters,
 * except for spaces and commas (isAlphaNum is Unicode-aware in Haskell).
 */
function normalized(value: string): string {
  let out = "";
  for (const char of value.toLowerCase()) {
    if (/[\p{L}\p{N}]/u.test(char) || /\s/.test(char) || char === ",") out += char;
  }
  return out;
}

/** Data.FuzzySet.Internal grams — n-grams of the normalized value enclosed in hyphens. */
function grams(value: string, size: number): string[] {
  const str = `-${normalized(value)}-`;
  const out: string[] = [];
  for (let offset = 0; offset <= str.length - size; offset++) {
    out.push(str.slice(offset, offset + size));
  }
  return out;
}

/** Data.FuzzySet.Internal gramVector — sparse vector of n-gram counts. */
function gramVector(value: string, size: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const gram of grams(value, size)) out.set(gram, (out.get(gram) ?? 0) + 1);
  return out;
}

/** Data.FuzzySet.Util norm — the euclidean magnitude of the count vector. */
function euclideanNorm(counts: Iterable<number>): number {
  let sum = 0;
  for (const count of counts) sum += count * count;
  return Math.sqrt(sum);
}

/** Data.Text.Metrics levenshteinNorm: 1 - distance / max(length a, length b).
 * Computed as a single division of the exact ratio, like Haskell's
 * `fromRational . toRational`, so the doubles match bit for bit. */
function levenshteinNorm(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const substCost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + substCost));
    }
    prev = cur;
  }
  const maxLen = Math.max(a.length, b.length);
  return (maxLen - prev[b.length]) / maxLen;
}

/** Data.FuzzySet FuzzySet — 2-/3-gram cosine similarity with Levenshtein re-scoring. */
export class FuzzySet {
  /** lowercased key -> original value. */
  private exactSet = new Map<string, string>();
  private matchDict = new Map<string, GramInfo[]>();
  private items = new Map<number, FuzzySetItem[]>();

  /** Data.FuzzySet add/addToSet. */
  add(value: string): void {
    const key = value.toLowerCase();
    if (this.exactSet.has(key)) return;
    for (let gramSize = GRAM_SIZE_LOWER; gramSize <= GRAM_SIZE_UPPER; gramSize++) {
      const gv = gramVector(key, gramSize);
      const itemVector = this.items.get(gramSize) ?? [];
      const itemIndex = itemVector.length;
      itemVector.push({ vectorMagnitude: euclideanNorm(gv.values()), normalizedEntry: key });
      this.items.set(gramSize, itemVector);
      for (const [gram, gramCount] of gv) {
        const infos = this.matchDict.get(gram) ?? [];
        infos.push({ itemIndex, gramCount });
        this.matchDict.set(gram, infos);
      }
    }
    this.exactSet.set(key, value);
  }

  /** Data.FuzzySet get/getWithMinScore — results ordered by score, best first. */
  get(value: string, minScore: number = MIN_MATCH_SCORE): [number, string][] {
    const key = value.toLowerCase();
    const exactMatch = this.exactSet.get(key);
    if (exactMatch !== undefined) return [[1, exactMatch]];
    for (let gramSize = GRAM_SIZE_UPPER; gramSize >= GRAM_SIZE_LOWER; gramSize--) {
      const results = this.getMatches(key, minScore, gramSize);
      if (results.length > 0) return results;
    }
    return [];
  }

  /** Data.FuzzySet getOne — the closest match, if one is found. */
  getOne(value: string): string | null {
    const results = this.get(value);
    return results.length === 0 ? null : results[0][1];
  }

  /** Data.FuzzySet.Internal getMatches. */
  private getMatches(key: string, minScore: number, gramSize: number): [number, string][] {
    const queryVector = gramVector(key, gramSize);
    const queryMagnitude = euclideanNorm(queryVector.values());
    const itemsVector = this.items.get(gramSize) ?? [];
    // Data.FuzzySet.Internal matches — dot products per matched item index.
    const dotProducts = new Map<number, number>();
    for (const [gram, count] of queryVector) {
      for (const { itemIndex, gramCount } of this.matchDict.get(gram) ?? []) {
        dotProducts.set(itemIndex, (dotProducts.get(itemIndex) ?? 0) + gramCount * count);
      }
    }
    let results: [number, string][] = [];
    for (const [itemIndex, score] of dotProducts) {
      const item = itemsVector[itemIndex];
      if (item !== undefined) {
        results.push([score / (queryMagnitude * item.vectorMagnitude), item.normalizedEntry]);
      }
    }
    results.sort((a, b) => b[0] - a[0]);
    // With Levenshtein enabled the top 50 cosine candidates are re-scored;
    // the minimum-score filter applies to the re-scored values.
    results = results
      .slice(0, 50)
      .map(([, entry]): [number, string] => [levenshteinNorm(key, entry), entry]);
    results.sort((a, b) => b[0] - a[0]);
    return results
      .filter(([score]) => score >= minScore)
      .map(([score, entry]): [number, string] => [score, this.exactSet.get(entry) ?? ""]);
  }
}

/** Data.FuzzySet fromList (addMany = foldr (flip add): last element added first). */
export function fuzzyFromList(values: string[]): FuzzySet {
  const set = new FuzzySet();
  for (let i = values.length - 1; i >= 0; i--) set.add(values[i]);
  return set;
}

// ---------------------------------------------------------------------------
// Error.hs noRelBetweenHint / noRpcHint
// ---------------------------------------------------------------------------

/**
 * Ports Error.hs noRelBetweenHint:
 * - looks for parent suggestions if the parent is not found,
 * - looks for child suggestions if the parent is found but the child is not,
 * - gives no suggestion if both are found (a problem with the embed hint).
 */
export function noRelBetweenHint(
  parent: string,
  child: string,
  schema: string,
  allRels: RelationshipsMap,
): string | null {
  const findParent = allRels.get(relsMapKey({ schema, name: parent }, schema));
  // Upstream lists [qiName (fst p) | p <- HM.keys allRels, snd p == schema].
  // Our map keys are strings, so the (origin table, foreign schema) pair is
  // recovered from the values: all rels under a key share both (see the map
  // assembly in schema-cache/index.ts); keys with empty lists are skipped.
  const parentNames: string[] = [];
  for (const rels of allRels.values()) {
    const rel = rels[0];
    if (rel === undefined) continue;
    const foreignSchema = rel.kind === "computed" ? rel.function.schema : rel.foreignTable.schema;
    if (foreignSchema === schema) parentNames.push(rel.table.name);
  }
  const fuzzySetOfParents = fuzzyFromList(parentNames);
  const fuzzySetOfChildren = fuzzyFromList((findParent ?? []).map((rel) => rel.foreignTable.name));
  if (findParent !== undefined) {
    // Do not give a suggestion if the child is found in the relations (weight = 1.0).
    const suggestChild = fuzzySetOfChildren.get(child).find(([score]) => score < 1.0)?.[1] ?? null;
    return suggestChild === null ? null : `Perhaps you meant '${suggestChild}' instead of '${child}'.`;
  }
  const suggestParent = fuzzySetOfParents.getOne(parent);
  return suggestParent === null ? null : `Perhaps you meant '${suggestParent}' instead of '${parent}'.`;
}

/**
 * Ports Error.hs noRpcHint: fuzzy search over the same-schema functions when
 * none matches the name, or over the overloads' parameter lists — rendered as
 * "(param1, param2, ...)" (sorted) — when the name matched but no params did.
 * Exported for the RPC phase (PGRST202).
 */
export function noRpcHint(
  schema: string,
  procName: string,
  params: string[],
  allProcs: QualifiedIdentifier[],
  overloadedProcs: Routine[],
): string | null {
  const listToText = (names: string[]): string => `(${[...names].sort().join(", ")})`;
  const fuzzySetOfProcs = fuzzyFromList(allProcs.filter((qi) => qi.schema === schema).map((qi) => qi.name));
  const fuzzySetOfParams = fuzzyFromList(overloadedProcs.map((ov) => listToText(ov.params.map((p) => p.name))));
  let possibleProcs: string | null;
  if (overloadedProcs.length === 0) {
    possibleProcs = fuzzySetOfProcs.getOne(procName);
  } else {
    const match = fuzzySetOfParams.getOne(listToText(params));
    possibleProcs = match === null ? null : procName + match;
  }
  return possibleProcs === null ? null : `Perhaps you meant to call the function ${schema}.${possibleProcs}`;
}

// ---------------------------------------------------------------------------
// Error.hs compressedRel / relHint (AmbiguousRelBetween payload, PGRST201)
// ---------------------------------------------------------------------------

/** Ports Error.hs compressedRel — one candidate of the PGRST201 details array. */
export function compressedRel(rel: Relationship): unknown {
  // An ambiguousness error cannot happen for computed relationships.
  if (rel.kind === "computed") return {};
  const fmtEls = (els: string[]): string => `(${els.join(", ")})`;
  const embedding = `${rel.table.name} with ${rel.foreignTable.name}`;
  const card = rel.cardinality;
  if (card.tag === "M2M") {
    const jun = card.junction;
    return {
      embedding,
      cardinality: "many-to-many",
      relationship: `${jun.table.name} using ${jun.constraint1}${fmtEls(jun.colsSource.map(([, jc]) => jc))} and ${jun.constraint2}${fmtEls(jun.colsTarget.map(([, jc]) => jc))}`,
    };
  }
  const cardinality = card.tag === "M2O" ? "many-to-one" : card.tag === "O2O" ? "one-to-one" : "one-to-many";
  return {
    embedding,
    cardinality,
    relationship: `${card.constraint} using ${rel.table.name}${fmtEls(card.columns.map(([c]) => c))} and ${rel.foreignTable.name}${fmtEls(card.columns.map(([, fc]) => fc))}`,
  };
}

/** Ports Error.hs relHint — the "'target!hint'" list of the PGRST201 hint. */
export function relHint(rels: Relationship[]): string {
  const hintList = (rel: Relationship): string => {
    // An ambiguousness error cannot happen for computed relationships.
    if (rel.kind === "computed") return "";
    const card = rel.cardinality;
    const hint = card.tag === "M2M" ? card.junction.table.name : card.constraint;
    return `'${rel.foreignTable.name}!${hint}'`;
  };
  return rels.map(hintList).join(", ");
}
