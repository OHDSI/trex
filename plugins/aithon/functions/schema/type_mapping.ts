// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/type_mapping.rs

export function fhirToDuckdbType(fhirType: string): string {
  switch (fhirType) {
    case "boolean":
      return "BOOLEAN";
    case "integer":
      return "INTEGER";
    case "positiveInt":
      return "UINTEGER";
    case "unsignedInt":
      return "UINTEGER";
    case "decimal":
      return "DOUBLE";
    case "string":
    case "code":
    case "id":
    case "markdown":
    case "uri":
    case "url":
    case "canonical":
    case "oid":
    case "uuid":
      return "VARCHAR";
    case "date":
    case "dateTime":
      return "VARCHAR"; // Partial precision prevents DATE/TIMESTAMP
    case "instant":
      return "TIMESTAMP";
    case "time":
      return "TIME";
    case "base64Binary":
      return "VARCHAR";
    case "xhtml":
      return "VARCHAR";
    default:
      return "VARCHAR";
  }
}

export function isPrimitiveType(typeCode: string): boolean {
  switch (typeCode) {
    case "boolean":
    case "integer":
    case "positiveInt":
    case "unsignedInt":
    case "decimal":
    case "string":
    case "code":
    case "id":
    case "markdown":
    case "uri":
    case "url":
    case "canonical":
    case "oid":
    case "uuid":
    case "date":
    case "dateTime":
    case "instant":
    case "time":
    case "base64Binary":
    case "xhtml":
      return true;
    default:
      return false;
  }
}

export function isComplexType(typeCode: string): boolean {
  return !isPrimitiveType(typeCode) && typeCode !== "Resource" && typeCode !== "Element";
}
