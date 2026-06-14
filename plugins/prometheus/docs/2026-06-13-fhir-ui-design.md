# FHIR UI — Profile-Driven Editor — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan
**Scope:** A new Vue 3 + Vuetify micro-frontend plugin (`plugins/fhir-ui`) for browsing and editing FHIR resources on the `fhir-fn` server, where every screen is generated from FHIR profile metadata (StructureDefinition / CapabilityStatement) rather than hardcoded per resource type. Reuses the Atlas3 design system and control library.

---

## 1. Goal & Principles

Build an end-user-friendly editor for the `fhir-fn` FHIR R4 server. Two primary personas:

- **Data authors / curators** — create & edit FHIR resource instances (Patient, Observation, …).
- **Form designers** — build Questionnaires that others fill in.

Form-filling (QuestionnaireResponse capture) is a secondary, supported flow.

**Design principles:**

1. **Profile-driven, not hardcoded.** Fields, sections, search filters, table columns, and input widgets are all derived from FHIR profile metadata. Adding/altering a resource type requires no UI code.
2. **Approachable, not admin-cluttered.** Explicitly avoid the Medplum "raw resource admin" feel. Progressive disclosure (required/common fields first, advanced fields collapsed), plain-language labels, sensible widgets.
3. **Reuse the Atlas3 control library wherever possible.** Compose from the `@ohdsi/atlas-ui` `Atlas*` components and design tokens. Build new components only for the genuinely FHIR-specific surfaces (the two engines, the widget registry, the questionnaire builder canvas).

---

## 2. Architecture

A new micro-frontend plugin mounted into the existing React `web` shell via single-spa (the same mechanism `devx`/`notebook` use; `single-spa-vue` is already an Atlas3 dependency).

```
web shell (React, single-spa host)
   └── plugins/fhir-ui   (Vue 3 + Vuetify micro-frontend)
         ├── fhirClient            REST wrapper over fhir-fn
         ├── profileStore (Pinia)  fetch + cache StructureDefinitions / CapabilityStatement
         ├── Engine 1: SDFormRenderer        StructureDefinition → edit form
         ├── Engine 2: QuestionnaireRenderer Questionnaire instance → fillable form (SDC)
         ├── widgetRegistry        FHIR datatype → Atlas input component
         └── screens               thin compositions (browse / search / edit / build / fill)
```

### Components (each one clear job)

- **`fhirClient`** — typed wrapper over the FHIR REST API: datasets, search (`GET /{ds}/{Type}?params`), CRUD, history, `metadata` (CapabilityStatement), and the new `StructureDefinition` endpoint. Handles the `apikey` auth header and `application/fhir+json`. Knows nothing about UI.
- **`profileStore` (Pinia)** — fetches and caches StructureDefinitions and the CapabilityStatement for the active dataset; resolves an element definition by FHIR path; exposes "what resource types exist, and what does each field look like." Single source of truth for profile metadata.
- **Engine 1 — `SDFormRenderer`** — given `(resourceType, instance)`, walks the StructureDefinition snapshot and renders an edit form. Recursion (nested backbone elements → collapsible cards), repeating elements (`0..*` → add/remove/reorder), cardinality, and required-ness all come from the definition. Editing `Questionnaire.item[]` through this engine *is* the questionnaire builder structure editor.
- **Widget registry** — maps a FHIR **datatype** (not resource type) to an Atlas input component. Pure lookup; the single place new input UX is added. Keeps everything generic.
- **Engine 2 — `QuestionnaireRenderer` (SDC)** — given a Questionnaire *instance*, renders a fillable form that produces a QuestionnaireResponse. Driven by the questionnaire's own `item` tree (`type`, `answerOption`/`answerValueSet`, `enableWhen`, `required`). Powers both the builder's live preview and the standalone form-filler. Works for any questionnaire.
- **Screens** — thin compositions of the above (see §5).

### Widget registry — default datatype → Atlas component map

| FHIR datatype | Widget (Atlas component) |
|---|---|
| `string`, `markdown`, `uri`, `id` | `AtlasTextField` |
| `integer`, `decimal`, `positiveInt`, `unsignedInt` | `AtlasTextField` (number) |
| `boolean` | `AtlasSwitch` |
| `date`, `dateTime`, `instant`, `time` | date/time picker (Vuetify `VDatePicker` wrapped to Atlas styling) |
| `code` / `Coding` / `CodeableConcept` with a bound ValueSet | `AtlasAutocomplete` (ValueSet-backed; degrades to free text if no terminology) |
| `code` with a small `required` binding (e.g. gender) | `AtlasSelect` |
| `Reference` | resource search-picker (new component, built on `AtlasAutocomplete` + `fhirClient` search) |
| `Quantity` | composite: `AtlasTextField` (value) + unit `AtlasAutocomplete` |
| BackboneElement / complex type | collapsible `AtlasCard` containing nested fields |
| repeating element (`max > 1`) | repeat group: list of cards + `AtlasButton` "Add", `AtlasIconButton` remove/reorder |

Unknown/unsupported datatypes degrade to a read-only display plus a raw-JSON escape hatch, never a crash.

---

## 3. Backend change (fhir-fn)

The server already loads the full R4 StructureDefinition registry (`data/profiles-resources.json`, `profiles-types.json`) but does not expose individual definitions over HTTP. Add:

```
GET /{dataset}/StructureDefinition           → Bundle of all StructureDefinitions (searchset)
GET /{dataset}/StructureDefinition/{type}    → single StructureDefinition (e.g. Patient, Questionnaire)
```

Served from the existing `DefinitionRegistry`. This keeps the UI thin, makes the server the single source of truth, and allows custom/per-dataset profiles to flow through the same path later. Implemented as a new route kind in `plugins/fhir-fn/functions/router.ts` + a handler reading the registry. Must honor the existing `apikey` auth and return `application/fhir+json`.

> The CapabilityStatement (`GET /{dataset}/metadata`) is already available and supplies the resource-type list and per-type SearchParameters used by screens 1 & 2.

---

## 4. Atlas3 reuse

Consume the Atlas design system rather than rebuild it:

- **Design tokens & theme** — `@ohdsi/atlas-ui` exports `tokens` + `buildVuetifyOptions()`. Use the same Vuetify theme (primary `#1f425a`, accent `#eb6622`, compact density, `outlined` inputs, rounded radii) so the plugin is visually identical to Atlas.
- **Control library (use wherever possible)** — the 36 `Atlas*` components. Mapping of mockup surfaces → Atlas components:

| Screen surface | Atlas component(s) |
|---|---|
| Top nav / header | Atlas `NavBar` pattern (white bar, primary underline on active) |
| Page header (eyebrow + title + accent rule + actions) | `AtlasPageShell` |
| Resource-type cards | `AtlasCard` (interactive) |
| Search filter inputs | `AtlasTextField`, `AtlasSelect`, `AtlasAutocomplete` |
| Results table | `AtlasDataTable` + `AtlasPagination`; status via `AtlasChip` |
| Editor sections | `AtlasCard` + `AtlasDivider` |
| Editor inputs | `AtlasTextField` / `AtlasSelect` / `AtlasSwitch` / `AtlasAutocomplete` / `AtlasRadioGroup` |
| Validation panel | `AtlasAlert` |
| Form/JSON toggle, builder tabs | `AtlasTabs` |
| Builder item rows, add/remove/drag controls | `AtlasCard`, `AtlasIconButton`, `AtlasMenu` |
| Form-filler progress | `AtlasProgressLinear` |
| Toasts / dialogs | `AtlasSnackbar`, `AtlasDialog` |
| Buttons / icons / tooltips / avatars | `AtlasButton`, `AtlasIcon`, `AtlasTooltip`, `AtlasAvatar` |

**New components** are limited to the genuinely FHIR-specific parts: `SDFormRenderer`, `QuestionnaireRenderer`, the widget-registry widgets (notably the `Reference` search-picker and the ValueSet autocomplete wrapper), and the questionnaire builder canvas (drag/nest interactions). All are composed *from* Atlas primitives.

**Open implementation decision (resolve in the plan):** how `plugins/fhir-ui` consumes `@ohdsi/atlas-ui`, given Atlas3 is a sibling repo, not part of this monorepo. Options: (a) add Atlas3 as a git submodule (repo already uses submodules) and build/link the lib; (b) depend on the published `@ohdsi/atlas-ui` package from the registry; (c) vendor the built `atlas-ui` dist. Recommendation: start with the published package or a vendored dist for fast iteration; revisit submodule if we need to co-evolve components. This does not affect mockups or engine design.

---

## 5. Screens

All screens are thin compositions over the engines + profileStore. (Mockups: `.superpowers/brainstorm/.../screens-v2.html`.)

1. **Resource browser** (`/fhir-ui/{dataset}`) — landing. Grid of resource-type cards with counts and search-field tags, sourced from the CapabilityStatement. Global search bar; New / Import actions.
2. **Search & results** (`/fhir-ui/{dataset}/{Type}`) — left filter panel generated from the type's SearchParameters; results in `AtlasDataTable` with columns chosen from the profile's key elements; pagination; New / Export actions.
3. **Generic resource editor** (`/fhir-ui/{dataset}/{Type}/{id}/edit`) — **Engine 1**. Sections from the StructureDefinition, repeating cards, datatype widgets, required markers, progressive disclosure of advanced fields, validation panel, Form/JSON toggle.
4. **Questionnaire builder** (`/fhir-ui/{dataset}/Questionnaire/{id}/build`) — **Engine 1 + Engine 2**. Left: edit the `item` tree (type dropdowns, nesting, `enableWhen`, drag-reorder). Right: live SDC preview.
5. **Form filler** (`/fhir-ui/{dataset}/Questionnaire/{id}/fill`) — **Engine 2** standalone. Renders a published questionnaire as a clean form with conditional logic and validation; submits a QuestionnaireResponse.

Likely-needed supporting views (confirm in plan): a read-only **resource detail** view (before edit), a **dataset picker**, and **version history** (the server exposes `_history`).

---

## 6. Data flow

1. On load, `fhirClient` resolves the active dataset; `profileStore` fetches the CapabilityStatement → resource-type list + SearchParameters (screens 1–2).
2. Opening a type/instance, `profileStore` lazily fetches that type's StructureDefinition (cached).
3. **Engine 1** renders from `(StructureDefinition, instance)`; edits mutate an in-memory FHIR resource draft; the widget registry picks inputs by datatype.
4. Save → `fhirClient` `POST`/`PUT` (with `If-Match` ETag for updates) → `OperationOutcome` surfaces in the validation panel / `AtlasSnackbar`.
5. **Engine 2** renders from a Questionnaire instance; in the builder it re-renders live as the `item` tree changes; on submit it builds a QuestionnaireResponse and `POST`s it.

---

## 7. Error handling

- All API errors return FHIR `OperationOutcome`; `fhirClient` normalizes these to a typed error surfaced via `AtlasAlert`/`AtlasSnackbar` with the issue text.
- Unknown/unsupported datatypes degrade to read-only + raw-JSON escape hatch (never crash the form).
- Missing StructureDefinition → clear empty-state with the raw-JSON editor as fallback.
- Optimistic-concurrency conflicts (412 on `If-Match`) → prompt to reload/merge.

---

## 8. Testing

- **Vitest unit tests** for the engines driven by fixture StructureDefinitions: a Patient SD and a Questionnaire SD → assert the right fields/sections/widgets render, required markers appear, repeating add/remove works, and the widget registry maps datatypes correctly.
- **Engine 2** tests: `enableWhen` show/hide, answerOption rendering, QuestionnaireResponse output shape.
- **Playwright** end-to-end for two flows: edit & save a Patient; build a small Questionnaire and fill it.
- A round-trip test against the new `StructureDefinition` endpoint in fhir-fn.

---

## 9. Out of scope (initial)

- Full terminology server / ValueSet `$expand` (coded fields degrade to free text/code entry where no expansion is available).
- Custom profile authoring UI (the endpoint supports custom profiles; authoring them is later).
- Bulk editing, references graph visualization, role-based field-level permissions.
