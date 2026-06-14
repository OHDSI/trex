// The host may inject globalThis.__FHIR_UI_CONFIG__ = { baseUrl, apiKey }.
export interface FhirUiConfig { baseUrl: string; apiKey: string; }
export function resolveConfig(): FhirUiConfig {
  const injected = (globalThis as any).__FHIR_UI_CONFIG__;
  return {
    baseUrl: injected?.baseUrl || import.meta.env.VITE_FHIR_BASE_URL || "/plugins/trex/fhir",
    apiKey: injected?.apiKey || import.meta.env.VITE_FHIR_APIKEY || "",
  };
}
