// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

// D2E Wizard: a cohort wizard (guided cohort-builder flow) plus its cohort
// dashboard (Shiny for Python, compiled to ShinyLive by the d2e portal).
// Scaffolds the three artifacts that must share ONE id: the wizardsConfig
// entry, the dashboard app, and the per-dialect SQL templates. The
// `creating-wizard-dashboards` skill is the companion reference for
// registration and verification.
export const template: AppTemplate = {
  id: "d2e-wizard",
  name: "D2E Wizard",
  description: "Cohort wizard + Shiny cohort dashboard for the D2E portal",
  tech_stack: "python-shiny",
  dev_command: "",
  install_command: "",
  build_command: "",
  files: {
    "TREX.md": `# D2E Wizard project

A d2e "wizard" = a guided cohort-builder flow plus a cohort dashboard.
Use the \\\`creating-wizard-dashboards\\\` skill for the full anatomy,
registration steps, and verification flow. THE rule: one shared id everywhere —
wizard \\\`id\\\` == dashboard name == \\\`template_id\\\` in dashboard/app.py ==
the SQL filename under sql/<dialect>/.

Rename checklist when you pick the real wizard id (default: my-wizard):
1. \\\`wizard-config.json\\\` -> id
2. \\\`dashboard/app.py\\\` -> dashboard_name / template_id
3. \\\`sql/duckdb/my-wizard.sql\\\` and \\\`sql/hana/my-wizard.sql\\\` -> rename the files
`,
    "README.md": `# D2E Wizard

Three artifacts, one shared id (see TREX.md):

| File | What it is | Registered where |
|------|------------|------------------|
| wizard-config.json | entry for wizardsConfig.wizards[] | Admin portal -> Setup -> Cohort builder config |
| dashboard/app.py | Shiny (Python) cohort dashboard | Admin portal -> Datasets -> Manage dashboard (codeType "cohort", name == wizard id) + trigger the ShinyLive build |
| sql/<dialect>/<id>.sql | data template for /parquet-export | pasted in the same Manage-dashboard session |

Dialect rule: HANA payload keys CONCEPT_CODE1..5 <-> {{CONCEPT_CODEn}};
DuckDB/Postgres CONCEPT_ID1..5 (ints, 0 = empty) <-> {{CONCEPT_IDn}}.
dashboard/app.py already branches on the dialect it receives — keep the SQL in
sync when you change either side.

Local dev loop without a d2e stack: clone
https://github.com/data2evidence/wizards-dashboard and use its dev/ harness
(mock_server.py + mock_host.html) — point it at your app.py and SQL.
`,
    "wizard-config.json": `{
  "id": "my-wizard",
  "name": "My wizard",
  "description": "Describe what cohort this wizard builds and what the dashboard shows.",
  "surfaces": ["wizardApp"],
  "flow": "required-fields",
  "fields": [
    {
      "id": "yearRange",
      "type": "yearRange",
      "label": "Observation years",
      "required": true
    },
    {
      "id": "conditions",
      "type": "text",
      "label": "Condition concepts (up to 5)",
      "required": false,
      "configPath": "patient.interactions.conditionoccurrence.attributes.conceptcode",
      "allowFreeText": true
    }
  ]
}
`,
    "dashboard/app.py": `"""
Cohort dashboard for the D2E portal (Shiny for Python -> ShinyLive).

Handshake: the portal iframe sends AUTH_TOKEN via postMessage with
{datasetId, cohortId, wizardConfig, mriquery, dialect}; this app fetches data
from POST /parquet-export and renders it. Keep template_id == the wizard id ==
the SQL filename.
"""

import json

import pandas as pd
import plotly.express as px
from pyodide.http import pyfetch
from shiny import App, reactive, render, ui
from shinywidgets import output_widget, render_widget

# One shared id: wizard id == dashboard name == SQL template filename.
dashboard_name = "my-wizard"
template_id = name = "my-wizard"
dashboard_type = "cohort"
result_format = "json"

HANDSHAKE_JS = """
(function() {
  window.d2e_token = null;
  window.d2e_context = {};
  let retryInterval = null;

  function pushContextToShiny() {
    if (!window.Shiny || typeof window.Shiny.setInputValue !== 'function') return false;
    try {
      window.Shiny.setInputValue('d2e_token', window.d2e_token, {priority: 'event'});
      window.Shiny.setInputValue('d2e_datasetId', window.d2e_context.datasetId, {priority: 'event'});
      window.Shiny.setInputValue('d2e_cohortId', window.d2e_context.cohortId, {priority: 'event'});
      window.Shiny.setInputValue('d2e_wizardConfig', window.d2e_context.wizardConfig, {priority: 'event'});
      window.Shiny.setInputValue('d2e_dialect', window.d2e_context.dialect, {priority: 'event'});
      window.Shiny.setInputValue('auth_ready', Date.now(), {priority: 'event'});
      if (window.top && window.top !== window) window.top.postMessage({type: 'AUTH_READY'}, '*');
      return true;
    } catch (err) { return false; }
  }

  function retryPush() {
    if (pushContextToShiny() || retryInterval !== null) return;
    let attempts = 0;
    retryInterval = window.setInterval(function() {
      attempts += 1;
      if (pushContextToShiny() || attempts >= 20) {
        window.clearInterval(retryInterval);
        retryInterval = null;
      }
    }, 250);
  }

  window.addEventListener('message', function(event) {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || data.type !== 'AUTH_TOKEN') return;
      window.d2e_token = data.token || null;
      window.d2e_context = {
        datasetId: (data.context && data.context.datasetId) || null,
        cohortId: (data.context && data.context.cohortId) || null,
        wizardConfig: (data.context && data.context.wizardConfig) || null,
        dialect: (data.context && data.context.dialect) || null
      };
      retryPush();
    } catch (err) { console.error('[D2E] message handling failed:', err); }
  }, false);

  function sendReady() {
    if (window.top && window.top !== window) {
      window.top.postMessage({type: 'SHINYLIVE_READY'}, '*');
    }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') sendReady();
  else document.addEventListener('DOMContentLoaded', sendReady);
  window.setTimeout(sendReady, 500);
  window.setTimeout(sendReady, 1500);
})();
"""

app_ui = ui.page_fluid(
    ui.tags.script(HANDSHAKE_JS),
    ui.h2("My wizard"),
    ui.output_ui("status"),
    output_widget("subjects_plot"),
)


def server(input, output, session):
    data_store = reactive.Value(None)
    error_store = reactive.Value(None)

    @reactive.Effect
    @reactive.event(input.auth_ready)
    async def fetch_data():
        try:
            token = input.d2e_token()
            dataset_id = input.d2e_datasetId()
            cohort_id = input.d2e_cohortId()
            wizard_config = input.d2e_wizardConfig() or {}
            dialect = (input.d2e_dialect() or "").lower()

            year = wizard_config.get("year") or {}
            conditions = wizard_config.get("conditions") or []

            # HANA matches on concept_code (strings); everything else on
            # concept_id (ints, 0 = empty slot). Keep the SQL template in sync.
            is_hana = dialect in ("", "hana")
            key = "CONCEPT_CODE" if is_hana else "CONCEPT_ID"
            cond_payload = []
            for idx in range(5):
                item = {}
                if idx < len(conditions):
                    raw = str(conditions[idx].get("value", ""))
                    item[f"{key}{idx + 1}"] = raw if is_hana else int(raw or 0)
                    item[f"WILDCARD_FLAG{idx + 1}"] = 1 if conditions[idx].get("useDescendants") else 0
                else:
                    item[f"{key}{idx + 1}"] = "" if is_hana else 0
                    item[f"WILDCARD_FLAG{idx + 1}"] = 0
                cond_payload.append(item)

            body = {
                "datasetId": dataset_id,
                "cohortId": int(cohort_id),
                "templateId": template_id,
                "name": name,
                "type": dashboard_type,
                "format": result_format,
                "yearRange": {"from": str(year.get("from", "2010")), "to": str(year.get("to", "2030"))},
                "conditions": cond_payload,
            }
            res = await pyfetch(
                "/parquet-export",
                method="POST",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "datasetId": str(dataset_id),
                },
                body=json.dumps(body),
            )
            if res.status != 200:
                raise RuntimeError(f"parquet-export returned {res.status}")
            rows = json.loads(await res.text())
            data_store.set(pd.DataFrame(rows))
            error_store.set(None)
        except Exception as err:  # surface fetch problems in the UI
            error_store.set(str(err))

    @output
    @render.ui
    def status():
        if error_store.get():
            return ui.div(f"Error: {error_store.get()}", style="color: #b00020;")
        if data_store.get() is None:
            return ui.div("Waiting for data...")
        return ui.div(f"{len(data_store.get())} rows loaded.")

    @output
    @render_widget
    def subjects_plot():
        df = data_store.get()
        if df is None or df.empty:
            return px.bar(title="No data yet")
        return px.bar(df, x="year", y="subjects", title="Cohort subjects per year")


app = App(app_ui, server)
`,
    "sql/duckdb/my-wizard.sql": `-- Starter: cohort subjects per cohort-start year (DuckDB/Postgres dialect:
-- condition slots arrive as {{CONCEPT_IDn}} ints, 0 = empty — extend the WHERE
-- clause when you use them).
SELECT
  EXTRACT(YEAR FROM c.cohort_start_date) AS year,
  COUNT(DISTINCT c.subject_id) AS subjects
FROM {{RESULTS_SCHEMA}}.cohort AS c
WHERE c.cohort_definition_id = {{COHORT_ID}}
  AND EXTRACT(YEAR FROM c.cohort_start_date) BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}
GROUP BY 1
ORDER BY 1;
`,
    "sql/hana/my-wizard.sql": `-- Starter: cohort subjects per cohort-start year (HANA dialect: condition
-- slots arrive as quoted {{CONCEPT_CODEn}} strings — extend the WHERE clause
-- when you use them).
SELECT
  YEAR(c."cohort_start_date") AS "year",
  COUNT(DISTINCT c."subject_id") AS "subjects"
FROM {{RESULTS_SCHEMA}}."cohort" AS c
WHERE c."cohort_definition_id" = {{COHORT_ID}}
  AND YEAR(c."cohort_start_date") BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}
GROUP BY YEAR(c."cohort_start_date")
ORDER BY "year";
`,
  },
};
