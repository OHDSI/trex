// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/json_transform.rs

import type { DefinitionRegistry, ElementInfo } from "../fhir/structure_definition.ts";
import { fhirToDuckdbType, isPrimitiveType } from "./type_mapping.ts";

const MAX_RECURSION_DEPTH = 4;

export function generateColumnNames(
  registry: DefinitionRegistry,
  resourceType: string,
): string[] {
  const sd = registry.getResource(resourceType);
  if (!sd) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }

  return sd.elements
    .filter((e) => e.name !== "resourceType")
    .filter((e) => elementToTransformField(registry, e, 0) !== null)
    .map((e) => e.name);
}

export function generateJsonTransform(
  registry: DefinitionRegistry,
  resourceType: string,
): string {
  const sd = registry.getResource(resourceType);
  if (!sd) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const fields: string[] = sd.elements
    .filter((e) => e.name !== "resourceType")
    .flatMap((element) => {
      const field = elementToTransformField(registry, element, 0);
      return field !== null ? [field] : [];
    });

  return `{${fields.join(", ")}}`;
}

function elementToTransformField(
  registry: DefinitionRegistry,
  element: ElementInfo,
  depth: number,
): string | null {
  const name = element.name;
  const typeStr = elementToTransformType(registry, element, depth);
  if (typeStr === null) {
    return null;
  }
  return `"${name}": ${typeStr}`;
}

function elementToTransformType(
  registry: DefinitionRegistry,
  element: ElementInfo,
  depth: number,
): string | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    return '"VARCHAR"';
  }

  if (element.contentReference !== undefined) {
    if (depth >= MAX_RECURSION_DEPTH - 1) {
      const t = element.isArray ? '["VARCHAR"]' : '"VARCHAR"';
      return t;
    }
  }

  // Choice types not supported by json_transform; stored in _raw.
  if (element.isChoice) {
    return null;
  }

  if (element.typeCodes.length === 0) {
    if (element.children.length > 0) {
      const structStr = childrenToTransform(registry, element.children, depth);
      return element.isArray ? `[${structStr}]` : structStr;
    }
    return null;
  }

  const typeCode = element.typeCodes[0];

  if (element.children.length > 0) {
    const structStr = childrenToTransform(registry, element.children, depth);
    return element.isArray ? `[${structStr}]` : structStr;
  }

  const resolved = resolveTransformType(registry, typeCode, depth);
  return element.isArray ? `[${resolved}]` : resolved;
}

function resolveTransformType(
  registry: DefinitionRegistry,
  typeCode: string,
  depth: number,
): string {
  if (isPrimitiveType(typeCode)) {
    return `"${fhirToDuckdbType(typeCode)}"`;
  }

  const typeDef = registry.getType(typeCode);
  if (typeDef !== undefined) {
    if (typeDef.elements.length === 0) {
      return '"VARCHAR"';
    }
    return childrenToTransform(registry, typeDef.elements, depth + 1);
  }

  switch (typeCode) {
    case "Extension":
    case "BackboneElement":
    case "Element":
      return '"VARCHAR"';
    case "Resource":
      return '"JSON"';
    case "Narrative":
      return '{"status": "VARCHAR", "div": "VARCHAR"}';
    case "Reference":
      return '{"reference": "VARCHAR", "type": "VARCHAR", "display": "VARCHAR"}';
    default:
      return '"VARCHAR"';
  }
}

function childrenToTransform(
  registry: DefinitionRegistry,
  children: ElementInfo[],
  depth: number,
): string {
  if (depth >= MAX_RECURSION_DEPTH) {
    return '"VARCHAR"';
  }

  const fields: string[] = children.flatMap((child) => {
    const field = elementToTransformField(registry, child, depth + 1);
    return field !== null ? [field] : [];
  });

  if (fields.length === 0) {
    return '"VARCHAR"';
  }

  return `{${fields.join(", ")}}`;
}
