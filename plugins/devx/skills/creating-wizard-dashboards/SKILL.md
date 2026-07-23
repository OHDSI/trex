---
name: creating-wizard-dashboards
description: Use when creating or changing a d2e "wizard" — a guided cohort-builder flow plus its cohort dashboard (Shiny/ShinyLive) shown for a dataset. Covers the wizardsConfig JSON in the cohort-builder (PA) config, the dashboard app contract (postMessage handshake, /parquet-export, per-dialect SQL), registration in the admin portal, and the local dev loop.
---

# Creating d2e wizards (config + cohort dashboard)

A **wizard** is a guided flow in the researcher portal: the user fills a short
form, d2e generates a cohort from it, and a **cohort dashboard** (a Python
Shiny app compiled to ShinyLive/WASM) renders analytics for that cohort in an
iframe. One wizard = three artifacts that MUST agree on one id:

| # | Artifact | Where it lives | Registered in |
|---|----------|----------------|---------------|
| 1 | Wizard entry (`wizardsConfig.wizards[]`) | the dataset's cohort-builder (PA) config JSON | Admin portal → Setup → **Cohort builder config** |
| 2 | Dashboard app (Python Shiny source) | `dataset_code_query` per dataset, built to ShinyLive | Admin portal → Datasets → dataset action **Manage dashboard** (`codeType: "cohort"`) |
| 3 | SQL template (per DB dialect) | same Manage-dashboard session as #2 | with #2 |

The shared id: wizard `id` (#1) == dashboard name (#2) == `templateId` the app
sends to `/parquet-export` (#3's filename). The researcher iframe URL is
derived from it: `/gateway/api/dataset/shiny-live/{datasetId}_cohort_{wizardId}_python/`.

Starting fresh? Scaffold with the **D2E Wizard app template** (devx → new app
→ D2E Wizard): it lays down `wizard-config.json`, `dashboard/app.py` (working
handshake + dialect-aware fetch), and synced `sql/duckdb|hana/<id>.sql`
starters — then follow its TREX.md rename checklist to set the real id.
Reference implementations: the `data2evidence/wizards-dashboard` repo
(`samples/TEMPLATE_SHINY_DASHBOARD.py` to copy; `shinylive/python/calculate-prevalence.py`
as the best full example) and `plugins/ui/apps/wizards/wizards-config.json`
(worked config with 5 wizards).

## 1. The wizard entry (cohort-builder config)

Admins paste raw JSON into the Setup → Cohort builder config editor (SAPUI5,
`wizardsConfig` section — a TextArea, no form). Shape
(`plugins/ui/apps/wizards/src/types/wizard.ts`):

```ts
interface WizardConfig {
  id: string;             // THE shared id, e.g. "calculate-prevalence"
  name: string;           // shown to the researcher
  description: string;
  surfaces?: ("wizardApp" | "cohortBuilder")[];
  flow?: "required-fields" | "table1-config";
  fields: FieldDefinition[];
}
interface FieldDefinition {
  id: string;
  type: "text" | "num" | "datetime" | "time" | "yearRange";
  label: string;
  required: boolean;
  configPath?: string;      // MRI filter-card attribute path, e.g. "patient.attributes.Age"
  placeholder?: string;
  filterCardPath?: string;
  fixedAttributes?: { configPath: string; operator: string; value: string | number }[];
  isWizardField?: boolean;
  allowFreeText?: boolean;
  excludeDescendantsByDefault?: boolean;
}
```

`configPath` values must exist in the SAME PA config's filter cards — the
wizard form writes them into an MRI bookmark. Storage: the PA config row in
`"ConfigDbModels_Config"` (Type `HC/MRI/PA`); the dataset links to it via
`dataset.pa_config_id`. Wizards for a dataset are served by
`GET /d2e/pa-config-svc/wizards/config?datasetId=` — verify your entry appears
there after saving.

## 2. The dashboard app (Shiny for Python)

Single-file app; copy `samples/TEMPLATE_SHINY_DASHBOARD.py` and keep this
skeleton:

```python
dashboard_name = "my-wizard"          # display
template_id = name = "my-wizard"      # == wizard id == SQL template name
dashboard_type = "cohort"
result_format = "json"

def create_ui():   # ui.page_fluid with the handshake <script> block (copy verbatim)
def create_server():
    def server(input, output, session):
        # read input.d2e_token(), input.d2e_datasetId(), input.d2e_cohortId(),
        # input.d2e_wizardConfig(), input.d2e_dialect()
        @reactive.Effect
        @reactive.event(input.auth_ready)   # fires once the host delivered the token
        async def fetch_data(): ...          # POST /parquet-export -> pandas -> reactive.Value
        # @render_widget plotly outputs (or raw ui.tags.table for Table-1 style)
app = App(create_ui(), create_server())
```

**Host handshake (do not reinvent — copy the template's `<script>` block):**
1. iframe posts `{type:"SHINYLIVE_READY"}` to `window.top`;
2. the portal (`ShinyDashboardIframe.tsx`) replies
   `{type:"AUTH_TOKEN", token, context:{datasetId, cohortId, wizardConfig, mriquery}, parentOrigin}`;
3. the script bridges these into Shiny inputs (`d2e_token`, `d2e_context`,
   `d2e_datasetId`, `d2e_cohortId`, `d2e_wizardConfig`, `d2e_mriquery`,
   `auth_ready`) and answers `{type:"AUTH_READY"}`.
The `cohortId` is the cohort the wizard just generated — that's your subject
population.

**Data access — only via `POST /parquet-export`** (Bearer token + `datasetId`
header; never query the DB directly):

```python
body = {
  "datasetId": dataset_id, "cohortId": int(cohort_id),
  "templateId": template_id, "name": name,
  "type": dashboard_type, "format": result_format,
  "yearRange": {"from": "2010", "to": "2023"},
  "conditions": conditions,   # up to 5 entries — KEY DEPENDS ON DIALECT, below
}
```

**Dialect rule (the classic mistake — keep app and SQL in sync):**
- HANA: payload keys `CONCEPT_CODE1..5` (strings), template placeholders `{{CONCEPT_CODEn}}` (matches `concept.concept_code`).
- DuckDB/Postgres: payload keys `CONCEPT_ID1..5` (ints, `0` = empty slot), placeholders `{{CONCEPT_IDn}}` (matches `concept.concept_id`).
- Read `input.d2e_dialect()` and branch; update the Python payload AND the SQL template in the same session.

## 3. The SQL template

Mustache-style placeholders substituted by parquet-export:
`{{SCHEMA}}` (CDM: person/death/condition_occurrence), `{{RESULTS_SCHEMA}}`
(cohort table: cohort_definition_id/subject_id/cohort_start_date/cohort_end_date),
`{{VOCAB_SCHEMA}}` (concept/concept_ancestor), `{{COHORT_ID}}`,
`{{STARTYEAR}}`/`{{ENDYEAR}}`, `{{CONCEPT_CODE1-5}}` or `{{CONCEPT_ID1-5}}`,
`{{WILDCARD_FLAG1-5}}` (include descendants, 1/0). Look at
`sql-scripts/duckdb/prevalencerate.sql` vs `sql-scripts/hana/calculate-prevalence.sql`
for a synced pair. Write one template per dialect the deployment uses.

## 4. Registering in the admin portal

1. **Wizard entry**: Setup → Cohort builder config → open the dataset's config →
   wizardsConfig → add your entry to `wizards[]` → save. Confirm via
   `GET /d2e/pa-config-svc/wizards/config?datasetId=<id>`.
2. **Dashboard**: Datasets → the dataset's ⋮ action → **Manage dashboard** →
   new entry with `codeType: "cohort"`, name == wizard `id`, language python →
   paste the Shiny source (and the SQL template) → save
   (`upsertDashboardCode`) → **trigger the ShinyLive asset build**
   (`POST /shiny-live/flow-run`, a Prefect flow — takes a while). The
   dashboard only exists for researchers once that build finishes.
3. Do NOT use the legacy `dataset_dashboard` (name/url/basePath) entity — it
   has no active UI and the wizards flow does not read it; ShinyLive
   registrations are the live mechanism.

## 5. Verify end-to-end (researcher flow)

Wizards app (researcher portal) → pick your wizard → the form should show your
`fields` → submit: it creates a bookmark (`POST /analytics-svc/api/services/bookmark`),
materializes the cohort (`POST /analytics-svc/api/services/cohort`, description
"Generated by Wizards"), then opens your dashboard iframe with the new
`cohortId`. Charts rendering with plausible numbers = done. Use the
`testing-d2e-ui` skill's build+overwrite flow to drive this with Playwright.

## 6. Local dev loop (no d2e stack)

In the wizards-dashboard repo: `pip install -r requirements.txt`, then
`python dev/setup_demo_db.py` (synthetic OMOP DuckDB) →
`python dev/mock_server.py` (FastAPI :8090 with `/parquet-export` doing naive
`{{VAR}}` substitution against `sql-scripts/duckdb/`) →
`bash dev/run_app.sh <name>` (server-side `shiny run` on :8765, no WASM build
needed while iterating) → open `http://localhost:8090/host` (`mock_host.html`
simulates the portal's postMessage side; its form sets datasetId/cohortId/
years/conditions). `bash dev/serve_apps.sh` does the shinylive WASM export if
you need to test the compiled form.

## Gotchas

- One id everywhere: wizard `id` == dashboard name == `templateId` == SQL
  filename. A mismatch fails silently (iframe 404 or empty data).
- The ShinyLive runtime is Pyodide: `pyfetch` is async and Pyodide-only;
  synchronous `urllib.request` works too (see table-1.py) but then build the
  absolute URL from `AUTH_TOKEN.parentOrigin`.
- `wizardsConfig` is only loosely validated server-side (must be an object;
  editor checks `wizards` is an array) — a typo in a field ships silently, so
  test through the researcher flow, not just by saving.
- Conditions are capped at 5 slots; unused non-HANA slots must be `0` (the SQL
  filters `concept_id != 0`).
- postgres templates in the reference repo are placeholders (empty files) —
  don't assume a dialect is implemented; check the template exists.
