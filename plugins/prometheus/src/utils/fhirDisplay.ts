export function formatFhirValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(formatFhirValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as any;
    // HumanName
    if (o.family || o.given) return [o.prefix?.join?.(" "), o.given?.join?.(" "), o.family].filter(Boolean).join(" ").trim();
    if (typeof o.text === "string") return o.text;                       // CodeableConcept / Address.text etc.
    if (o.coding?.[0]) return o.coding[0].display || o.coding[0].code || "";  // CodeableConcept
    if (o.display || o.code) return o.display || o.code;                  // Coding
    if (o.value != null && o.unit != null) return `${o.value} ${o.unit}`; // Quantity
    if (o.value != null && o.system) return String(o.value);              // ContactPoint / Identifier
    if (o.reference) return o.reference;                                  // Reference
    if (o.city || o.line) return [o.line?.join?.(", "), o.city, o.postalCode].filter(Boolean).join(", "); // Address
    if (o.start || o.end) return [o.start, o.end].filter(Boolean).join(" – "); // Period
    return "";  // unknown object → empty, NOT raw JSON
  }
  return String(v);
}
