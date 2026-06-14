import { getAt } from "./fhirPath";

export function capType(tc: string): string {
  return tc.charAt(0).toUpperCase() + tc.slice(1);
}

/** value + Quantity -> valueQuantity ; value + string -> valueString */
export function choiceProp(base: string, tc: string): string {
  return base + capType(tc);
}

/** Which type is currently populated in the model (else first option). */
export function activeChoiceType(
  model: any,
  basePath: (string | number)[],
  name: string,
  typeCodes: string[],
): string {
  for (const tc of typeCodes) {
    if (getAt(model, [...basePath, choiceProp(name, tc)]) != null) return tc;
  }
  return typeCodes[0];
}
