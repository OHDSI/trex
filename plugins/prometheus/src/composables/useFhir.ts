import { FhirClient } from "@/services/fhirClient";
import { resolveConfig } from "@/services/config";
import { useProfileStore } from "@/stores/profile";

let client: FhirClient | null = null;
export function useFhir(dataset?: string) {
  if (!client) { const c = resolveConfig(); client = new FhirClient(c.baseUrl, c.apiKey); }
  const profile = useProfileStore();
  if (dataset && profile.dataset !== dataset) profile.init(client, dataset);
  return { client, profile };
}
