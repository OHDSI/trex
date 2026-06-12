// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/search_parameter.rs

import { ResourceRegistry } from "./resource_registry.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum SearchParamType {
  String = "String",
  Token = "Token",
  Reference = "Reference",
  Date = "Date",
  Quantity = "Quantity",
  Number = "Number",
  Uri = "Uri",
  Composite = "Composite",
  Special = "Special",
}

export interface SearchParamDef {
  name: string;
  paramType: SearchParamType;
  expression: string;
  base: string[];
}

// ---------------------------------------------------------------------------
// SearchParamRegistry
// ---------------------------------------------------------------------------

export class SearchParamRegistry {
  private params: Map<string, SearchParamDef>;

  private constructor(params: Map<string, SearchParamDef>) {
    this.params = params;
  }

  // Rust: load_from_json
  static loadFromJson(jsonStr: string): SearchParamRegistry {
    let bundle: unknown;
    try {
      bundle = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e}`);
    }

    const entries = (bundle as Record<string, unknown>)?.["entry"];
    if (!Array.isArray(entries)) {
      throw new Error("Bundle missing 'entry' array");
    }

    const params = new Map<string, SearchParamDef>();

    for (const entry of entries) {
      const resource = (entry as Record<string, unknown>)?.["resource"];
      if (!resource) continue;

      const rt = (resource as Record<string, unknown>)?.["resourceType"];
      if (rt !== "SearchParameter") continue;

      const nameVal = (resource as Record<string, unknown>)?.["code"];
      if (typeof nameVal !== "string" || nameVal === "") continue;
      const name = nameVal;

      if (name.startsWith("_")) continue;

      const typeStr = (resource as Record<string, unknown>)?.["type"];
      let paramType: SearchParamType;
      switch (typeStr) {
        case "string":    paramType = SearchParamType.String;    break;
        case "token":     paramType = SearchParamType.Token;     break;
        case "reference": paramType = SearchParamType.Reference; break;
        case "date":      paramType = SearchParamType.Date;      break;
        case "quantity":  paramType = SearchParamType.Quantity;  break;
        case "number":    paramType = SearchParamType.Number;    break;
        case "uri":       paramType = SearchParamType.Uri;       break;
        case "composite": paramType = SearchParamType.Composite; break;
        case "special":   paramType = SearchParamType.Special;   break;
        default:          continue;
      }

      const expressionVal = (resource as Record<string, unknown>)?.["expression"];
      const expression = typeof expressionVal === "string" ? expressionVal : "";
      if (expression === "") continue;

      const baseArr = (resource as Record<string, unknown>)?.["base"];
      const base: string[] = Array.isArray(baseArr)
        ? baseArr.filter((v): v is string => typeof v === "string")
        : [];

      const def: SearchParamDef = { name, paramType, expression, base };

      for (const resourceType of base) {
        params.set(`${resourceType} ${name}`, def);
      }
    }

    return new SearchParamRegistry(params);
  }

  // Rust: load_from_json using embedded data file
  static async loadDefault(): Promise<SearchParamRegistry> {
    const url = new URL("../../data/search-parameters.json", import.meta.url);
    const jsonStr = await Deno.readTextFile(url);
    return SearchParamRegistry.loadFromJson(jsonStr);
  }

  // Rust: get
  get(resourceType: string, paramName: string): SearchParamDef | undefined {
    return this.params.get(`${resourceType} ${paramName}`);
  }

  // Rust: params_for_type
  paramsForType(resourceType: string): SearchParamDef[] {
    const prefix = `${resourceType} `;
    const result: SearchParamDef[] = [];
    for (const [key, def] of this.params) {
      if (key.startsWith(prefix)) {
        result.push(def);
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// generateSearchSql — public entry point
// ---------------------------------------------------------------------------

export function generateSearchSql(
  searchRegistry: SearchParamRegistry,
  resourceRegistry: ResourceRegistry,
  resourceType: string,
  params: Record<string, string>,
): string {
  const conditions: string[] = [];

  for (const [paramName, paramValue] of Object.entries(params)) {
    if (paramName.startsWith("_")) continue;

    const colonPos = paramName.indexOf(":");
    const baseName = colonPos !== -1 ? paramName.slice(0, colonPos) : paramName;
    const modifier: string | undefined = colonPos !== -1 ? paramName.slice(colonPos + 1) : undefined;

    const paramDef = searchRegistry.get(resourceType, baseName);
    if (paramDef === undefined) {
      throw new Error(`Unknown search parameter '${baseName}' for ${resourceType}`);
    }

    const jsonPath = fhirpathToJsonPath(paramDef.expression, resourceType);

    const pathStr = jsonPath.startsWith("$.") ? jsonPath.slice(2) : "";
    const segments: string[] = pathStr === "" ? [] : pathStr.split(".");
    const arrayIndices = findArraySegments(resourceRegistry, resourceType, segments);

    let condition: string;
    if (arrayIndices.length > 0) {
      condition = buildArrayCondition(segments, arrayIndices, paramDef.paramType, paramValue, modifier);
    } else {
      switch (paramDef.paramType) {
        case SearchParamType.String:
          condition = generateStringCondition(jsonPath, paramValue, modifier);
          break;
        case SearchParamType.Token:
          condition = generateTokenCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Reference:
          condition = generateReferenceCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Date:
          condition = generateDateCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Number:
          condition = generateNumberCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Quantity:
          condition = generateQuantityCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Uri:
          condition = generateUriCondition(jsonPath, paramValue);
          break;
        case SearchParamType.Composite:
        case SearchParamType.Special:
          continue;
        default:
          continue;
      }
    }

    conditions.push(condition);
  }

  if (conditions.length === 0) {
    return "";
  }

  return conditions.join(" AND ");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function fhirpathToJsonPath(expression: string, resourceType: string): string {
  // Take the first alternative (before |) and trim
  const expr = (expression.split("|")[0] ?? expression).trim();

  let path: string;
  if (expr.startsWith(resourceType)) {
    path = expr.slice(resourceType.length).replace(/^\./, "");
  } else if (expr.startsWith("Resource.")) {
    path = expr.slice("Resource.".length);
  } else {
    path = expr;
  }

  // Filter out FHIRPath function segments
  const cleanPath = path
    .split(".")
    .filter((segment) =>
      segment !== "" &&
      !segment.startsWith("where(") &&
      !segment.startsWith("as(") &&
      !segment.startsWith("ofType(") &&
      !segment.startsWith("resolve(")
    )
    .join(".");

  if (cleanPath === "") {
    return "$";
  }

  return `$.${cleanPath}`;
}

// Returns indices of segments that correspond to array elements.
function findArraySegments(
  resourceRegistry: ResourceRegistry,
  resourceType: string,
  segments: string[],
): number[] {
  const definitions = resourceRegistry.definitions();
  if (definitions === undefined) return [];

  const resourceDef = definitions.getResource(resourceType);
  if (resourceDef === undefined) return [];

  const result: number[] = [];
  let currentElements = resourceDef.elements;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const elem = currentElements.find((e) => e.name === segment);
    if (elem === undefined) break;

    if (elem.isArray) {
      result.push(i);
    }

    if (elem.children.length > 0) {
      currentElements = elem.children;
    } else if (elem.typeCodes.length > 0) {
      const typeName = elem.typeCodes[0];
      const typeDef = definitions.getType(typeName);
      if (typeDef !== undefined) {
        currentElements = typeDef.elements;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return result;
}

// Build nested EXISTS(... json_each(...)) for each array segment in the path.
function buildArrayCondition(
  segments: string[],
  arrayIndices: number[],
  paramType: SearchParamType,
  value: string,
  modifier: string | undefined,
): string {
  const lastArrayIdx = arrayIndices[arrayIndices.length - 1];
  const innerSegments = segments.slice(lastArrayIdx + 1);
  const innerJsonPath = innerSegments.length === 0 ? "$" : `$.${innerSegments.join(".")}`;

  let innerCondition: string;
  switch (paramType) {
    case SearchParamType.String:
      innerCondition = generateStringCondition(innerJsonPath, value, modifier);
      break;
    case SearchParamType.Token:
      innerCondition = generateTokenCondition(innerJsonPath, value);
      break;
    case SearchParamType.Reference:
      innerCondition = generateReferenceCondition(innerJsonPath, value);
      break;
    case SearchParamType.Date:
      innerCondition = generateDateCondition(innerJsonPath, value);
      break;
    case SearchParamType.Number:
      innerCondition = generateNumberCondition(innerJsonPath, value);
      break;
    case SearchParamType.Quantity:
      innerCondition = generateQuantityCondition(innerJsonPath, value);
      break;
    case SearchParamType.Uri:
      innerCondition = generateUriCondition(innerJsonPath, value);
      break;
    default:
      throw new Error("Unsupported search parameter type for array search");
  }

  const innermostDepth = arrayIndices.length - 1;
  innerCondition = innerCondition.replaceAll("_raw", `_arr${innermostDepth}.value`);

  let result = innerCondition;
  for (let depth = arrayIndices.length - 1; depth >= 0; depth--) {
    const arrIdx = arrayIndices[depth];
    const alias = `_arr${depth}`;

    const pathStart = depth === 0 ? 0 : arrayIndices[depth - 1] + 1;
    const pathSegments = segments.slice(pathStart, arrIdx + 1);
    const jsonPath = `$.${pathSegments.join(".")}`;

    const base = depth === 0 ? "_raw" : `_arr${depth - 1}.value`;

    result = `EXISTS (SELECT 1 FROM json_each(json_extract(${base}, '${jsonPath}')) AS ${alias} WHERE ${result})`;
  }

  return result;
}

function generateStringCondition(
  jsonPath: string,
  value: string,
  modifier: string | undefined,
): string {
  const escapedValue = value.replaceAll("'", "''");

  switch (modifier) {
    case "exact":
      return `json_extract_string(_raw, '${jsonPath}') = '${escapedValue}'`;
    case "contains":
      return `LOWER(json_extract_string(_raw, '${jsonPath}')) LIKE '%${escapedValue.toLowerCase()}%'`;
    default:
      return `LOWER(json_extract_string(_raw, '${jsonPath}')) LIKE '${escapedValue.toLowerCase()}%'`;
  }
}

function generateTokenCondition(jsonPath: string, value: string): string {
  const escapedValue = value.replaceAll("'", "''");

  const pipePos = escapedValue.indexOf("|");
  if (pipePos !== -1) {
    const system = escapedValue.slice(0, pipePos);
    const code = escapedValue.slice(pipePos + 1);

    if (system === "") {
      // code-only via pipe: |code
      return (
        `json_extract_string(_raw, '${jsonPath}.code') = '${code}' OR ` +
        `EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '${jsonPath}.coding')) AS c WHERE json_extract_string(c.value, '$.code') = '${code}')`
      );
    } else if (code === "") {
      // system-only: system|
      return (
        `json_extract_string(_raw, '${jsonPath}.system') = '${system}' OR ` +
        `EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '${jsonPath}.coding')) AS c WHERE json_extract_string(c.value, '$.system') = '${system}')`
      );
    } else {
      // system|code
      return (
        `(json_extract_string(_raw, '${jsonPath}.system') = '${system}' AND json_extract_string(_raw, '${jsonPath}.code') = '${code}') OR ` +
        `EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '${jsonPath}.coding')) AS c WHERE json_extract_string(c.value, '$.system') = '${system}' AND json_extract_string(c.value, '$.code') = '${code}')`
      );
    }
  } else {
    // No pipe: bare code or boolean
    return (
      `json_extract_string(_raw, '${jsonPath}.code') = '${escapedValue}' OR ` +
      `json_extract_string(_raw, '${jsonPath}') = '${escapedValue}' OR ` +
      `EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '${jsonPath}.coding')) AS c WHERE json_extract_string(c.value, '$.code') = '${escapedValue}')`
    );
  }
}

function generateReferenceCondition(jsonPath: string, value: string): string {
  const escapedValue = value.replaceAll("'", "''");
  return (
    `json_extract_string(_raw, '${jsonPath}.reference') = '${escapedValue}' OR ` +
    `json_extract_string(_raw, '${jsonPath}.reference') LIKE '%/${escapedValue}'`
  );
}

function generateDateCondition(jsonPath: string, value: string): string {
  const [prefix, dateValue] = parsePrefix(value);
  const escapedDate = dateValue.replaceAll("'", "''");
  const field = `json_extract_string(_raw, '${jsonPath}')`;

  switch (prefix) {
    case "eq":
    case "":
      return `${field} = '${escapedDate}'`;
    case "ne":
      return `${field} != '${escapedDate}'`;
    case "lt":
    case "eb":
      return `${field} < '${escapedDate}'`;
    case "gt":
    case "sa":
      return `${field} > '${escapedDate}'`;
    case "ge":
      return `${field} >= '${escapedDate}'`;
    case "le":
      return `${field} <= '${escapedDate}'`;
    default:
      throw new Error(`Unknown date prefix: ${prefix}`);
  }
}

function generateNumberCondition(jsonPath: string, value: string): string {
  const [prefix, numValue] = parsePrefix(value);
  const parsed = parseFloat(numValue);
  if (isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${numValue}`);
  }

  const field = `CAST(json_extract_string(_raw, '${jsonPath}') AS DOUBLE)`;

  switch (prefix) {
    case "eq":
    case "":
      return `${field} = ${parsed}`;
    case "ne":
      return `${field} != ${parsed}`;
    case "lt":
      return `${field} < ${parsed}`;
    case "gt":
      return `${field} > ${parsed}`;
    case "ge":
      return `${field} >= ${parsed}`;
    case "le":
      return `${field} <= ${parsed}`;
    default:
      throw new Error(`Unknown number prefix: ${prefix}`);
  }
}

function generateQuantityCondition(jsonPath: string, value: string): string {
  const [prefix, rest] = parsePrefix(value);
  // Mirror Rust's rest.splitn(3, '|'): at most 3 parts; the 3rd absorbs any remaining pipes.
  const rawParts = rest.split("|");
  const parts = rawParts.length >= 3
    ? [rawParts[0], rawParts[1], rawParts.slice(2).join("|")]
    : rawParts;
  const numStr = parts[0];

  // NOTE: Rust parses num_value via .parse::<f64>() then embeds via Display (always decimal,
  // e.g. 0.0000001 not 1e-7). JS parseFloat + template-literal can emit scientific notation for
  // very small inputs (e.g. 1e-7). This is a documented minor divergence; scientific-notation
  // quantity values do not occur in real FHIR searches.
  const parsed = parseFloat(numStr);
  if (isNaN(parsed)) {
    throw new Error(`Invalid numeric quantity value: ${numStr}`);
  }

  const field = `CAST(json_extract_string(_raw, '${jsonPath}.value') AS DOUBLE)`;

  let numCondition: string;
  switch (prefix) {
    case "eq":
    case "":
      numCondition = `${field} = ${parsed}`;
      break;
    case "ne":
      numCondition = `${field} != ${parsed}`;
      break;
    case "lt":
      numCondition = `${field} < ${parsed}`;
      break;
    case "gt":
      numCondition = `${field} > ${parsed}`;
      break;
    case "ge":
      numCondition = `${field} >= ${parsed}`;
      break;
    case "le":
      numCondition = `${field} <= ${parsed}`;
      break;
    default:
      throw new Error(`Unknown quantity prefix: ${prefix}`);
  }

  if (parts.length >= 3) {
    const system = parts[1].replaceAll("'", "''");
    const code = parts[2].replaceAll("'", "''");
    return `(${numCondition} AND json_extract_string(_raw, '${jsonPath}.system') = '${system}' AND json_extract_string(_raw, '${jsonPath}.code') = '${code}')`;
  } else if (parts.length === 2) {
    const code = parts[1].replaceAll("'", "''");
    return `(${numCondition} AND (json_extract_string(_raw, '${jsonPath}.code') = '${code}' OR json_extract_string(_raw, '${jsonPath}.unit') = '${code}'))`;
  } else {
    return numCondition;
  }
}

function generateUriCondition(jsonPath: string, value: string): string {
  const escapedValue = value.replaceAll("'", "''");
  return `json_extract_string(_raw, '${jsonPath}') = '${escapedValue}'`;
}

function parsePrefix(value: string): [string, string] {
  const prefixes = ["eq", "ne", "lt", "gt", "ge", "le", "sa", "eb", "ap"];
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      const rest = value.slice(prefix.length);
      const firstChar = rest.length > 0 ? rest[0] : "";
      if (firstChar >= "0" && firstChar <= "9" || firstChar === "-" || firstChar === "+") {
        return [prefix, rest];
      }
    }
  }
  return ["", value];
}
