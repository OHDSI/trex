# FHIR UI — Tracked Follow-ups

Out-of-scope items from the initial implementation (design/plan: see `2026-06-13-fhir-ui-design.md` / `-plan.md`).

## Done in follow-up passes
- ✅ **AtlasDataTable for search results** — `ResourceSearch` now uses `AtlasDataTable` + a FHIR datatype-aware cell formatter, columns derived from the StructureDefinition.
- ✅ **answerOption editor** — choice questions are authorable in the builder (add/remove options, live in preview).
- ✅ **enableBehavior (any/all)** — `enableWhen` respects `item.enableBehavior`.
- ✅ **contentReference resolution** — `fhir-fn` resolves `contentReference` elements (depth-bounded) so recursive structures (e.g. `Questionnaire.item.item`) render their fields.
- ✅ **Choice `[x]` type picker** — `isChoice` elements render a type dropdown binding to `value<Type>`; primitives via leaf widget, complex via per-type sub-form (`childrenByType`). Both mock and real `fhir-fn` supply the resolved definitions.
- ✅ **Complex-type resolution** — `fhir-fn` now resolves named complex types (HumanName→family/given, Quantity→value/unit, …) for the UI endpoint, matching the demo mock, so production forms are as rich as the demo.
- ✅ **Drag-reorder in the questionnaire item editor** — functional native HTML5 drag-and-drop (no dependency), per nesting level.
- ✅ **Error handling + loading states in DatasetPicker / ResourceBrowser** — try/catch + `AtlasAlert` + loading/empty states.
- ✅ **Create-entity flows** — "New {Type}" on search, "+" on browser cards, and a new-questionnaire flow (title field, create on Publish).
- ✅ **Nested questionnaire groups** — groups nest questions (recursive editor + grouped preview).
- ✅ **All FHIR entities** — engine is fully generic; demo backend serves all 146 R4 resource types.

## Remaining (need external systems or host decisions)
1. **apiKey injection at runtime.** `src/services/config.ts` reads `globalThis.__FHIR_UI_CONFIG__` (or `VITE_FHIR_APIKEY`), but the web shell's `SingleSpaMount` does not yet inject it. `fhir-fn` currently has no auth check, so this is dormant; wire it (session JWT/cookie → `__FHIR_UI_CONFIG__`) before `fhir-fn` is secured. Needs the web-shell auth model.
2. **ValueSet `$expand` for CodeWidget.** Feed terminology-expanded options into `CodeWidget` (currently degrades to free text). Needs a terminology server / `$expand` endpoint.
3. **E2e seed fixtures.** `tests/e2e/*` assume a seeded `e2e` dataset (Patient `p1`, Questionnaire `intake`); add a seed/setup step before enabling them in CI. Needs CI infra.
4. **New-resource field disclosure.** For resource types with required fields, a new form initially shows only those + "Show advanced". Could surface the top ~6 fields so new forms feel fuller. (Deliberately left as-is per user.)
