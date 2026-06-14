import { defineStore } from "pinia";
import { markRaw } from "vue";
import type { FhirClient } from "@/services/fhirClient";
import type { CapabilityStatement, ParsedStructureDefinition } from "@/types/fhir";

export interface SearchParam { name: string; type: string; }

export const useProfileStore = defineStore("profile", {
  state: () => ({
    client: null as FhirClient | null,
    dataset: "" as string,
    defs: markRaw(new Map<string, ParsedStructureDefinition>()),
    capability: null as CapabilityStatement | null,
  }),
  actions: {
    init(client: FhirClient, dataset: string) {
      this.client = client;
      this.dataset = dataset;
      this.defs = markRaw(new Map<string, ParsedStructureDefinition>());
      this.capability = null;
    },

    async getDefinition(type: string): Promise<ParsedStructureDefinition> {
      const cached = this.defs.get(type);
      if (cached) return cached;
      const sd = await this.client!.getStructureDefinition(this.dataset, type);
      this.defs.set(type, sd);
      return sd;
    },

    async getCapability(): Promise<CapabilityStatement> {
      if (!this.capability) this.capability = await this.client!.metadata(this.dataset);
      return this.capability;
    },

    async getSearchParams(type: string): Promise<SearchParam[]> {
      const cap = await this.getCapability();
      const entry = cap.rest?.[0]?.resource?.find((r) => r.type === type);
      return (entry?.searchParam ?? []) as SearchParam[];
    },

    async getResourceTypes(): Promise<string[]> {
      const cap = await this.getCapability();
      return (cap.rest?.[0]?.resource ?? []).map((r) => r.type);
    },
  },
});
