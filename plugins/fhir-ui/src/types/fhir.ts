export interface ElementInfo {
  path: string; name: string; typeCodes: string[]; min: number; max: string;
  isArray: boolean; isChoice: boolean; contentReference?: string; children: ElementInfo[];
  childrenByType?: Record<string, ElementInfo[]>;
}
export interface ParsedStructureDefinition { resourceType: string; kind: string; isAbstract: boolean; elements: ElementInfo[]; }
export interface FhirResource { resourceType: string; id?: string; [k: string]: unknown; }
export interface BundleEntry { resource: FhirResource; }
export interface Bundle { resourceType: "Bundle"; total?: number; entry?: BundleEntry[]; }
export interface CapabilityStatement {
  resourceType: "CapabilityStatement";
  rest: Array<{ resource: Array<{ type: string; searchParam?: Array<{ name: string; type: string }> }> }>;
}
