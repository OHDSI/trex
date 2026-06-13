// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/resource_registry.rs

import { DefinitionRegistry } from "./structure_definition.ts";
import { generateDdl, generateAllDdl } from "../schema/generator.ts";
import { generateJsonTransform, generateColumnNames } from "../schema/json_transform.ts";

export class ResourceRegistry {
  private _definitions: DefinitionRegistry | undefined;
  private _ddlCache: Map<string, string>;
  private _transformCache: Map<string, string>;

  private constructor(definitions: DefinitionRegistry | undefined) {
    this._definitions = definitions;
    this._ddlCache = new Map();
    this._transformCache = new Map();
  }

  // Rust: new() — no definitions
  static empty(): ResourceRegistry {
    return new ResourceRegistry(undefined);
  }

  // Rust: with_definitions
  static withDefinitions(defs: DefinitionRegistry): ResourceRegistry {
    return new ResourceRegistry(defs);
  }

  // Convenience: withDefinitions(await DefinitionRegistry.loadDefault())
  static async loadDefault(): Promise<ResourceRegistry> {
    const defs = await DefinitionRegistry.loadDefault();
    return ResourceRegistry.withDefinitions(defs);
  }

  definitions(): DefinitionRegistry | undefined {
    return this._definitions;
  }

  // Rust: resource_type_names — tolerant of missing definitions (returns [])
  resourceTypeNames(): string[] {
    if (this._definitions === undefined) {
      return [];
    }
    return this._definitions.resourceTypeNames();
  }

  /** Return a sorted list of all concrete resource type names (tolerant of missing definitions). */
  listResourceTypes(): string[] {
    return this._definitions?.listResourceTypes() ?? [];
  }

  /** Return the parsed definition for a resource type, or undefined if unknown or no definitions. */
  getResourceDefinition(type: string): import("./structure_definition.ts").ParsedStructureDefinition | undefined {
    return this._definitions?.getResourceDefinition(type);
  }

  // Rust: is_known_type — tolerant of missing definitions (returns false)
  isKnownResourceType(resourceType: string): boolean {
    if (this._definitions === undefined) {
      return false;
    }
    return this._definitions.getResource(resourceType) !== undefined;
  }

  // Rust: get_ddl — cached by "{schemaName}.{resourceType}"; throws when no definitions
  getDdl(resourceType: string, schemaName: string): string {
    const cacheKey = `${schemaName}.${resourceType}`;
    const cached = this._ddlCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (this._definitions === undefined) {
      throw new Error("No definitions loaded");
    }

    // generateDdl throws on unknown type — let it propagate (don't cache failures)
    const ddl = generateDdl(this._definitions, resourceType, schemaName);
    this._ddlCache.set(cacheKey, ddl);
    return ddl;
  }

  // Rust: get_json_transform — cached by resourceType; throws when no definitions
  getJsonTransform(resourceType: string): string {
    const cached = this._transformCache.get(resourceType);
    if (cached !== undefined) {
      return cached;
    }

    if (this._definitions === undefined) {
      throw new Error("No definitions loaded");
    }

    // generateJsonTransform throws on unknown type — let it propagate (don't cache failures)
    const transform = generateJsonTransform(this._definitions, resourceType);
    this._transformCache.set(resourceType, transform);
    return transform;
  }

  // Rust: get_column_names — not cached (matches Rust); throws when no definitions
  getColumnNames(resourceType: string): string[] {
    if (this._definitions === undefined) {
      throw new Error("No definitions loaded");
    }
    return generateColumnNames(this._definitions, resourceType);
  }

  // Rust: generate_all_ddl — tolerant of missing definitions (returns [])
  generateAllDdl(schemaName: string): Array<{ resourceType: string; ddl: string | null; error: string | null }> {
    if (this._definitions === undefined) {
      return [];
    }
    return generateAllDdl(this._definitions, schemaName);
  }

  // Rust: table_name
  static tableName(resourceType: string): string {
    return resourceType.toLowerCase();
  }
}
