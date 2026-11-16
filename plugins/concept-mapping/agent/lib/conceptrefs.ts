// Concept references in shipped prompts are written as {{concept:ID}} or
// {{name:ID}} and rendered at runtime from the deployment's own vocabulary,
// so the plugin never redistributes licensed terminology text.

const REF = /\{\{(concept|name):(\d+)\}\}/g;

export function conceptRefIds(text: string): number[] {
  return [...new Set([...text.matchAll(REF)].map((m) => Number(m[2])))];
}

export function renderConceptRefs(text: string, names: Map<number, string>): string {
  return text.replace(REF, (_, kind: string, id: string) => {
    const name = names.get(Number(id)) ?? `concept ${id}`;
    return kind === "concept" ? `${name} (${id})` : name;
  });
}
