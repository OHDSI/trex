import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import CqlEditor from "./CqlEditor.vue";

const mockRunCql = vi.fn();

vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({
    client: { runCql: mockRunCql },
    profile: {},
  }),
}));

// Stub @atlas-ui
vi.mock("@atlas-ui", () => ({
  AtlasPageShell: { template: '<div><slot name="actions" /><slot /></div>', props: ["eyebrow", "title"] },
  AtlasButton: { template: '<button v-bind="$attrs" :disabled="loading"><slot /></button>', props: ["variant", "loading"] },
  AtlasAlert: { template: '<div data-error class="alert">{{ title }}</div>', props: ["severity", "title"] },
}));

// Stub CodeMirror modules so they don't blow up in jsdom
vi.mock("@codemirror/view", () => ({
  EditorView: class {
    static theme() { return {}; }
    static updateListener = { of: () => ({}) };
    constructor() {}
    destroy() {}
    get state() { return { doc: { toString: () => "" } }; }
  },
  keymap: { of: () => ({}) },
  lineNumbers: () => ({}),
}));

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
}));

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: () => ({}),
  },
}));

const vuetify = createVuetify({ components });

const mountOptions = () => ({
  props: { dataset: "ds1" },
  global: {
    plugins: [vuetify, createTestingPinia()],
  },
});

describe("CqlEditor", () => {
  it("renders the Run button", () => {
    const w = mount(CqlEditor, mountOptions());
    expect(w.find("[data-run]").exists()).toBe(true);
  });

  it("calls runCql with the editor text and renders results", async () => {
    mockRunCql.mockResolvedValueOnce({
      resourceType: "Parameters",
      parameter: [{ name: "All Patients", valueInteger: 3 }],
    });

    const w = mount(CqlEditor, mountOptions());
    await flushPromises(); // let onMounted finish

    await w.find("[data-run]").trigger("click");
    await flushPromises();

    expect(mockRunCql).toHaveBeenCalledWith("ds1", expect.any(String));

    const text = w.text();
    expect(text).toContain("All Patients");
    expect(text).toContain("3");
  });

  it("shows error alert when runCql rejects with FhirError", async () => {
    const { FhirError } = await import("@/services/fhirClient");
    mockRunCql.mockRejectedValueOnce(new FhirError("CQL extension not available", 501));

    const w = mount(CqlEditor, mountOptions());
    await flushPromises();

    await w.find("[data-run]").trigger("click");
    await flushPromises();

    expect(w.find("[data-error]").exists()).toBe(true);
    expect(w.find("[data-error]").text()).toContain("CQL extension not available");
  });

  it("clears previous error on subsequent run", async () => {
    const { FhirError } = await import("@/services/fhirClient");
    mockRunCql.mockRejectedValueOnce(new FhirError("first error", 500));
    mockRunCql.mockResolvedValueOnce({
      resourceType: "Parameters",
      parameter: [{ name: "Count", valueInteger: 0 }],
    });

    const w = mount(CqlEditor, mountOptions());
    await flushPromises();

    await w.find("[data-run]").trigger("click");
    await flushPromises();
    expect(w.find("[data-error]").exists()).toBe(true);

    await w.find("[data-run]").trigger("click");
    await flushPromises();
    expect(w.find("[data-error]").exists()).toBe(false);
  });
});
