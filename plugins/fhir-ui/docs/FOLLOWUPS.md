# FHIR UI — Tracked Follow-ups

Out-of-scope items from the initial implementation (design/plan: see `2026-06-13-fhir-ui-design.md` / `-plan.md`). Each is a real enhancement, not a blocking bug.

1. **apiKey injection at runtime.** `src/services/config.ts` reads `globalThis.__FHIR_UI_CONFIG__` (or `VITE_FHIR_APIKEY`), but the web shell's `SingleSpaMount` does not yet inject it. fhir-fn currently has no auth check, so this is dormant; wire it (session JWT/cookie → `__FHIR_UI_CONFIG__`) before fhir-fn is secured.
2. **AtlasDataTable for search results.** `ResourceSearch.vue` uses a hand-rolled `<table>`; swap to `AtlasDataTable` for sort/pagination/Atlas styling (matches "use Atlas where possible").
3. **answerOption editor in the questionnaire builder.** `QuestionnaireItemEditor` lets you pick type `choice` but has no UI to add/edit options; add an option editor so choice questions are fully authorable.
4. **enableBehavior (any/all).** `enableWhen.ts` always uses `all` (`.every`); add `enableBehavior` to `QItem` and support `any`.
5. **contentReference resolution.** When `ElementInfo.contentReference` is set, resolve the referenced path's children instead of rendering an empty card.
6. **Choice `[x]` type picker.** Render a datatype picker for `isChoice` elements (e.g. `Observation.value[x]`) instead of a plain string field.
7. **ValueSet `$expand` for CodeWidget.** Feed terminology-expanded options into `CodeWidget` (currently degrades to free text when no options).
8. **Drag-reorder in the questionnaire item editor.** Handle renders but is non-functional (deferred); wire with a DnD lib.
9. **Error handling + loading states in DatasetPicker / ResourceBrowser.** Add try/catch + `AtlasAlert` and a loading indicator, consistent with the other screens.
10. **E2e seed fixtures.** `tests/e2e/*` assume a seeded `e2e` dataset (Patient `p1`, Questionnaire `intake`); add a seed/setup step before enabling them in CI.
