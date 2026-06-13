/**
 * Converts a camelCase / dotted FHIR path segment into a human-readable label.
 * "birthDate"        → "Birth date"
 * "postalCode"       → "Postal code"
 * "Patient.name"     → "Name"
 * "Patient.postalCode" → "Postal code"
 */
export function humanize(s: string): string {
  const last = s.includes(".") ? s.split(".").pop()! : s;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
