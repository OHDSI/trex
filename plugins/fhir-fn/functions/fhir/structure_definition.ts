// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/structure_definition.rs

export interface ElementInfo {
  path: string;
  name: string;
  typeCodes: string[];
  min: number;
  max: string;
  isArray: boolean;
  isChoice: boolean;
  contentReference: string | undefined;
  children: ElementInfo[];
}

export interface ParsedStructureDefinition {
  resourceType: string;
  kind: string;
  isAbstract: boolean;
  elements: ElementInfo[];
}

export class DefinitionRegistry {
  private resources: Map<string, ParsedStructureDefinition>;
  private types: Map<string, ParsedStructureDefinition>;

  private constructor(
    resources: Map<string, ParsedStructureDefinition>,
    types: Map<string, ParsedStructureDefinition>,
  ) {
    this.resources = resources;
    this.types = types;
  }

  // Rust: new()
  static empty(): DefinitionRegistry {
    return new DefinitionRegistry(new Map(), new Map());
  }

  // Rust: load_from_json
  static loadFromJson(resourcesJson: string, typesJson: string): DefinitionRegistry {
    let resourcesBundle: unknown;
    let typesBundle: unknown;

    try {
      resourcesBundle = JSON.parse(resourcesJson);
    } catch (e) {
      throw new Error(`Invalid resources JSON: ${e}`);
    }
    try {
      typesBundle = JSON.parse(typesJson);
    } catch (e) {
      throw new Error(`Invalid types JSON: ${e}`);
    }

    const registry = DefinitionRegistry.empty();

    // Parse types first so they are available as lookup targets.
    const typeDefs = DefinitionRegistry._loadBundle(typesBundle);
    for (const sd of typeDefs) {
      switch (sd.kind) {
        case "complex-type":
        case "primitive-type":
          registry.types.set(sd.resourceType, sd);
          break;
        case "resource":
          if (!sd.isAbstract) {
            registry.resources.set(sd.resourceType, sd);
          }
          break;
        default:
          registry.types.set(sd.resourceType, sd);
          break;
      }
    }

    const resourceDefs = DefinitionRegistry._loadBundle(resourcesBundle);
    for (const sd of resourceDefs) {
      switch (sd.kind) {
        case "resource":
          if (!sd.isAbstract) {
            registry.resources.set(sd.resourceType, sd);
          }
          break;
        case "complex-type":
        case "primitive-type":
          registry.types.set(sd.resourceType, sd);
          break;
        default:
          // ignored
          break;
      }
    }

    return registry;
  }

  // Rust: load_from_json using embedded data files
  static async loadDefault(): Promise<DefinitionRegistry> {
    const resourcesUrl = new URL("../../data/profiles-resources.json", import.meta.url);
    const typesUrl = new URL("../../data/profiles-types.json", import.meta.url);
    const [resourcesJson, typesJson] = await Promise.all([
      Deno.readTextFile(resourcesUrl),
      Deno.readTextFile(typesUrl),
    ]);
    return DefinitionRegistry.loadFromJson(resourcesJson, typesJson);
  }

  // Rust: load_bundle
  private static _loadBundle(bundle: unknown): ParsedStructureDefinition[] {
    const entries = (bundle as Record<string, unknown>)?.["entry"];
    if (!Array.isArray(entries)) {
      throw new Error("Bundle missing 'entry' array");
    }

    const definitions: ParsedStructureDefinition[] = [];

    for (const entry of entries) {
      const resource = (entry as Record<string, unknown>)?.["resource"];
      if (!resource) continue;

      const rt = (resource as Record<string, unknown>)?.["resourceType"];
      if (rt !== "StructureDefinition") continue;

      // We only want specialization definitions (not constraints/profiles).
      const derivation = ((resource as Record<string, unknown>)?.["derivation"] as string) ?? "";
      // Base abstract types lack a derivation field — accept those too.
      if (derivation !== "" && derivation !== "specialization") {
        continue;
      }

      try {
        const sd = DefinitionRegistry._parseStructureDefinition(resource as Record<string, unknown>);
        definitions.push(sd);
      } catch (_e) {
        continue;
      }
    }

    return definitions;
  }

  // Rust: parse_structure_definition
  private static _parseStructureDefinition(
    sd: Record<string, unknown>,
  ): ParsedStructureDefinition {
    const kind = ((sd["kind"] as string) ?? "");
    const isAbstract = ((sd["abstract"] as boolean) ?? false);

    const typeOrName = sd["type"] ?? sd["name"];
    if (typeof typeOrName !== "string" || typeOrName === "") {
      throw new Error("StructureDefinition missing 'type'/'name'");
    }
    const resourceType = typeOrName;

    const snapshotElements = (sd["snapshot"] as Record<string, unknown> | undefined)
      ?.["element"];

    let elements: ElementInfo[];
    if (Array.isArray(snapshotElements)) {
      elements = DefinitionRegistry._buildElementTree(snapshotElements, resourceType);
    } else {
      elements = [];
    }

    return { resourceType, kind, isAbstract, elements };
  }

  // Rust: build_element_tree
  private static _buildElementTree(
    elements: unknown[],
    rootPath: string,
  ): ElementInfo[] {
    if (elements.length === 0) return [];

    const flat: ElementInfo[] = [];
    // skip(1) — skip the root element
    for (const elemVal of elements.slice(1)) {
      const info = DefinitionRegistry._parseElement(elemVal as Record<string, unknown>, rootPath);
      if (info !== null) {
        flat.push(info);
      }
    }

    return DefinitionRegistry._nestElements(flat, rootPath);
  }

  // Rust: nest_elements — build tree bottom-up so children attach before their parent does.
  private static _nestElements(flat: ElementInfo[], rootPath: string): ElementInfo[] {
    if (flat.length === 0) return [];

    // Clone the flat list for mutation
    const items: ElementInfo[] = flat.map((e) => ({ ...e, children: [...e.children] }));
    const pathToIndex = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      pathToIndex.set(items[i].path, i);
    }

    const len = items.length;
    for (let i = len - 1; i >= 0; i--) {
      const path = items[i].path;
      const dotPos = path.lastIndexOf(".");
      if (dotPos === -1) continue; // top-level under root – keep as-is

      const parentPath = path.slice(0, dotPos);

      if (parentPath === rootPath) continue;

      const parentIdx = pathToIndex.get(parentPath);
      if (parentIdx !== undefined) {
        const child = items[i];
        items[parentIdx].children.unshift(child);
        items[i] = { ...items[i], path: "" };
      }
    }

    return items.filter((e) => {
      if (e.path === "") return false;
      const dotPos = e.path.lastIndexOf(".");
      if (dotPos === -1) return false;
      return e.path.slice(0, dotPos) === rootPath;
    });
  }

  // Rust: parse_element
  private static _parseElement(
    elem: Record<string, unknown>,
    rootPath: string,
  ): ElementInfo | null {
    const path = elem["path"];
    if (typeof path !== "string") return null;

    if (path === rootPath) return null;

    const name = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path;

    const typeArr = elem["type"];
    let typeCodes: string[] = [];
    if (Array.isArray(typeArr)) {
      typeCodes = typeArr
        .filter((t) => typeof (t as Record<string, unknown>)?.["code"] === "string")
        .map((t) => {
          const code = (t as Record<string, unknown>)["code"] as string;
          // Normalise fhirpath System URIs (e.g. System.String → string).
          if (code.startsWith("http://hl7.org/fhirpath/")) {
            const lastDot = code.lastIndexOf(".");
            const simple = lastDot !== -1 ? code.slice(lastDot + 1) : "String";
            return simple.toLowerCase();
          }
          return code;
        });
    }

    const min = typeof elem["min"] === "number" ? Math.floor(elem["min"]) : 0;
    const max = typeof elem["max"] === "string" ? elem["max"] : "1";
    const isArray = max === "*";

    const isChoice = name.endsWith("[x]");

    let contentReference: string | undefined;
    const cr = elem["contentReference"];
    if (typeof cr === "string") {
      contentReference = cr.startsWith("#") ? cr.slice(1) : cr;
    }

    return {
      path,
      name,
      typeCodes,
      min,
      max,
      isArray,
      isChoice,
      contentReference,
      children: [],
    };
  }

  // Public API

  resourceTypeNames(): string[] {
    const names = Array.from(this.resources.keys());
    names.sort();
    return names;
  }

  getResource(name: string): ParsedStructureDefinition | undefined {
    return this.resources.get(name);
  }

  getType(name: string): ParsedStructureDefinition | undefined {
    return this.types.get(name);
  }

  /** Return a sorted list of all concrete resource type names. */
  listResourceTypes(): string[] {
    return this.resourceTypeNames();
  }

  /** Return the parsed definition for a resource type, or undefined if unknown. */
  getResourceDefinition(type: string): ParsedStructureDefinition | undefined {
    return this.getResource(type);
  }
}
