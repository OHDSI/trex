// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/generator.rs

import type { DefinitionRegistry, ElementInfo } from "../fhir/structure_definition.ts";
import { fhirToDuckdbType, isPrimitiveType } from "./type_mapping.ts";

const MAX_RECURSION_DEPTH = 4;

export function generateDdl(
  registry: DefinitionRegistry,
  resourceType: string,
  schemaName: string,
): string {
  const sd = registry.getResource(resourceType);
  if (!sd) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const tableName = resourceType.toLowerCase();
  const columns: string[] = [];

  columns.push("    _id VARCHAR NOT NULL");
  columns.push("    _version_id INTEGER NOT NULL DEFAULT 1");
  columns.push("    _last_updated TIMESTAMP NOT NULL DEFAULT now()");
  columns.push("    _is_deleted BOOLEAN NOT NULL DEFAULT false");
  columns.push("    _raw JSON NOT NULL");

  for (const element of sd.elements) {
    const colDef = elementToColumn(registry, element, 0);
    if (colDef !== null) {
      columns.push(`    ${colDef}`);
    }
  }

  columns.push("    PRIMARY KEY (_id)");

  return `CREATE TABLE IF NOT EXISTS ${schemaName}."${tableName}"\n(\n${columns.join(",\n")}\n)`;
}

function elementToColumn(
  registry: DefinitionRegistry,
  element: ElementInfo,
  depth: number,
): string | null {
  // Skip resourceType field (already known from table name)
  if (element.name === "resourceType") {
    return null;
  }

  const colName = quoteColumnName(element.name);
  const typeStr = elementToType(registry, element, depth);
  if (typeStr === null) {
    return null;
  }

  return `${colName} ${typeStr}`;
}

function elementToType(
  registry: DefinitionRegistry,
  element: ElementInfo,
  depth: number,
): string | null {
  if (element.contentReference !== undefined) {
    if (depth >= MAX_RECURSION_DEPTH) {
      // Prevent infinite recursion in self-referential types.
      const baseType = "VARCHAR";
      return element.isArray ? `${baseType}[]` : baseType;
    }
  }

  if (element.isChoice && element.typeCodes.length > 1) {
    const variants: string[] = element.typeCodes.map((tc) => {
      const variantName = `${element.name.replace(/\[x\]$/, "")}${capitalize(tc)}`;
      const variantType = resolveType(registry, tc, depth);
      return `${quoteColumnName(variantName)} ${variantType}`;
    });

    const unionType = `UNION(${variants.join(", ")})`;
    return element.isArray ? `${unionType}[]` : unionType;
  }

  if (element.typeCodes.length === 0) {
    if (element.children.length > 0) {
      const structType = childrenToStruct(registry, element.children, depth);
      return element.isArray ? `${structType}[]` : structType;
    }
    return null;
  }

  const typeCode = element.typeCodes[0];

  if (element.children.length > 0) {
    const structType = childrenToStruct(registry, element.children, depth);
    return element.isArray ? `${structType}[]` : structType;
  }

  const resolved = resolveType(registry, typeCode, depth);
  return element.isArray ? `${resolved}[]` : resolved;
}

function resolveType(registry: DefinitionRegistry, typeCode: string, depth: number): string {
  if (isPrimitiveType(typeCode)) {
    return fhirToDuckdbType(typeCode);
  }

  const typeDef = registry.getType(typeCode);
  if (typeDef !== undefined) {
    if (typeDef.elements.length === 0) {
      return "VARCHAR";
    }
    return childrenToStruct(registry, typeDef.elements, depth + 1);
  }

  switch (typeCode) {
    case "BackboneElement":
    case "Element":
      return "VARCHAR";
    case "Resource":
      return "JSON";
    case "Extension":
      return "VARCHAR";
    case "Narrative":
      return "STRUCT(status VARCHAR, div VARCHAR)";
    case "Reference":
      return "STRUCT(reference VARCHAR, type VARCHAR, display VARCHAR)";
    case "Meta":
      return "STRUCT(versionId VARCHAR, lastUpdated VARCHAR, source VARCHAR, profile VARCHAR[], security STRUCT(system VARCHAR, code VARCHAR, display VARCHAR)[], tag STRUCT(system VARCHAR, code VARCHAR, display VARCHAR)[])";
    default:
      return "VARCHAR";
  }
}

function childrenToStruct(
  registry: DefinitionRegistry,
  children: ElementInfo[],
  depth: number,
): string {
  if (depth >= MAX_RECURSION_DEPTH) {
    return "VARCHAR"; // JSON fallback
  }

  const fields: string[] = children.flatMap((child) => {
    const typeStr = elementToType(registry, child, depth + 1);
    if (typeStr === null) return [];
    return [`${quoteColumnName(child.name)} ${typeStr}`];
  });

  if (fields.length === 0) {
    return "VARCHAR";
  }

  return `STRUCT(${fields.join(", ")})`;
}

function quoteColumnName(name: string): string {
  // Strip FHIR choice type suffix [x] — not valid in SQL identifiers
  const clean = name.replace(/\[x\]$/, "");
  // Always quote to avoid SQL reserved word conflicts (when, for, end, etc.)
  return `"${clean}"`;
}

function capitalize(s: string): string {
  if (s.length === 0) return "";
  return s[0].toUpperCase() + s.slice(1);
}

export interface DdlResult {
  resourceType: string;
  ddl: string | null;
  error: string | null;
}

export function generateAllDdl(
  registry: DefinitionRegistry,
  schemaName: string,
): DdlResult[] {
  return registry.resourceTypeNames().map((name) => {
    try {
      const ddl = generateDdl(registry, name, schemaName);
      return { resourceType: name, ddl, error: null };
    } catch (e) {
      return { resourceType: name, ddl: null, error: String(e) };
    }
  });
}
