// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/capability.rs

import { ResourceRegistry } from "./resource_registry.ts";
import { SearchParamRegistry, SearchParamType } from "./search_parameter.ts";

function searchParamTypeStr(t: SearchParamType): string {
  switch (t) {
    case SearchParamType.String:    return "string";
    case SearchParamType.Token:     return "token";
    case SearchParamType.Reference: return "reference";
    case SearchParamType.Date:      return "date";
    case SearchParamType.Quantity:  return "quantity";
    case SearchParamType.Number:    return "number";
    case SearchParamType.Uri:       return "uri";
    case SearchParamType.Composite: return "composite";
    case SearchParamType.Special:   return "special";
    default:                        return "string";
  }
}

export function buildCapabilityStatement(
  registry: ResourceRegistry,
  searchParams: SearchParamRegistry,
  datasetId: string,
): any {
  const resourceTypes = registry.resourceTypeNames();

  const resources = resourceTypes.map((rt) => {
    const params = searchParams.paramsForType(rt);
    const searchParamsJson = params.map((p) => ({
      name: p.name,
      type: searchParamTypeStr(p.paramType),
      documentation: p.expression,
    }));

    const resource: Record<string, unknown> = {
      type: rt,
      interaction: [
        { code: "read" },
        { code: "create" },
        { code: "update" },
        { code: "delete" },
        { code: "search-type" },
        { code: "history-instance" },
      ],
      versioning: "versioned",
      readHistory: true,
      updateCreate: true,
      conditionalCreate: false,
      conditionalRead: "not-supported",
      conditionalUpdate: false,
      conditionalDelete: "not-supported",
    };

    if (searchParamsJson.length > 0) {
      resource.searchParam = searchParamsJson;
    }

    return resource;
  });

  return {
    resourceType: "CapabilityStatement",
    id: `${datasetId}-capability`,
    status: "active",
    date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    kind: "instance",
    software: {
      name: "TrexSQL FHIR Server",
      version: "0.1.0",
    },
    implementation: {
      description: `TrexSQL FHIR R4 Server - Dataset: ${datasetId}`,
    },
    fhirVersion: "4.0.1",
    format: ["json"],
    rest: [
      {
        mode: "server",
        resource: resources,
        interaction: [
          { code: "transaction" },
          { code: "batch" },
        ],
        operation: [
          {
            name: "export",
            definition: "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/export",
          },
          {
            name: "cql",
            definition: "http://hl7.org/fhir/uv/cql/OperationDefinition/cql",
          },
        ],
      },
    ],
  };
}
