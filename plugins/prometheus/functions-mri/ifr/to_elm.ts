// @ts-nocheck - Deno edge function
import { Ifr, IfrFilterCard, IfrAttribute, IfrBoolean } from "./types.ts";
import { AttrMapping, ConfigMapping } from "../config/mapping.ts";
import { ElmQuery, ElmExpr, ElmRetrieve, ElmAxis } from "../elm/types.ts";

/** Build the SQL value expression for an attribute relative to a resource alias. */
export function valueExprFor(m: AttrMapping, alias: string): string {
  const raw = `json_extract_string(${alias}._raw, '${m.jsonPath}')`;
  if (m.derive === "ageYears") {
    return `date_diff('year', CAST(${raw} AS DATE), current_date)`;
  }
  if (m.kind === "num") return `CAST(${raw} AS DOUBLE)`;
  return raw;
}

function exprFromConstraints(m: AttrMapping, alias: string, c: IfrBoolean<any>): ElmExpr {
  const valueExpr = valueExprFor(m, alias);
  const ops = (c.content ?? []).map((e: any): ElmExpr => {
    const isNum = m.kind === "num" && Number.isFinite(Number(e.value));
    return {
      type: "Compare",
      op: (e.operator ?? "=") as any,
      valueExpr,
      literal: isNum ? Number(e.value) : e.value,
    };
  });
  if (ops.length === 0) return { type: "True" };
  return c.op === "OR" ? { type: "Or", operands: ops } : { type: "And", operands: ops };
}

/** Flatten the nested cards boolean tree into a flat list of FilterCards. */
function collectCards(node: any, out: IfrFilterCard[]): void {
  if (!node) return;
  if (node.type === "FilterCard") { out.push(node); return; }
  if (node.type === "BooleanContainer") for (const ch of node.content ?? []) collectCards(ch, out);
}

export function ifrToElm(ifr: Ifr, mapping: ConfigMapping): ElmQuery {
  const cards: IfrFilterCard[] = [];
  collectCards(ifr.filter?.cards, cards);

  const patientPreds: ElmExpr[] = [];
  const filters: ElmRetrieve[] = [];
  let aliasN = 0;

  for (const card of cards) {
    const attrs: IfrAttribute[] = (card.attributes?.content ?? []).filter((a: any) => a.type === "Attribute");
    // Patient-level filter card → predicates on base patient table
    if (card.configPath === "patient" || card.configPath.startsWith("patient.attributes.")) {
      for (const a of attrs) {
        const m = mapping[a.configPath];
        if (m && m.resourceType === "Patient") patientPreds.push(exprFromConstraints(m, "p", a.constraints));
      }
      continue;
    }
    // Interaction filter card → EXISTS over its resource
    const sample = attrs.map((a) => mapping[a.configPath]).find(Boolean);
    if (!sample) continue;
    const alias = `c${aliasN++}`;
    const preds = attrs.map((a) => {
      const m = mapping[a.configPath];
      return m ? exprFromConstraints(m, alias, a.constraints) : { type: "True" } as ElmExpr;
    });
    filters.push({
      resourceType: sample.resourceType,
      alias,
      joinToPatient: true,
      where: preds.length ? { type: "And", operands: preds } : { type: "True" },
    });
  }

  // Axes (MVP: Patient-level attributes, alias "p")
  const axes: ElmAxis[] = [];
  for (const ax of ifr.axisSelection ?? []) {
    if (!ax.attributeId || ax.attributeId === "n/a") continue;
    const m = mapping[ax.attributeId];
    if (!m || m.resourceType !== "Patient") continue; // interaction-attr axes deferred
    const binSize = ax.binsize && ax.binsize !== "n/a" ? Number(ax.binsize) : undefined;
    axes.push({ id: ax.categoryId, valueExpr: valueExprFor(m, "p"), kind: m.kind, binSize: Number.isFinite(binSize) ? binSize : undefined });
  }

  return {
    patientWhere: patientPreds.length ? { type: "And", operands: patientPreds } : { type: "True" },
    filters,
    axes,
  };
}
