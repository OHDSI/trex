"""Regression tests for atlas/fhir JNI/Graal stability.

Originally suspected JNI/Graal isolate state leaks (see KNOWN_ISSUES.md
under plugins/atlas/), these regressions cover:

1. The OHDSI Atlas tutorial's full cohort JSON — minimal cohorts always
   worked, but the tutorial's cohort with InclusionRules + Demographic age
   criteria was reported to crash trex. Test renders the full pipeline:
   trex_atlas_json_to_sql -> trex_atlas_sql_translate.

2. trex_fhir_start / trex_fhir_stop / trex_fhir_start on the same port —
   reported to crash trex when the second start ran before the previous
   server had released the port.

Both repros pass with the current codebase. The tests stay in the suite
to guard against regressions.
"""
import base64



# Tutorial cohort JSON (clinical-analytics tutorial, plugins/docs/docs/tutorials).
# Type 2 diabetes cohort restricted to ages 50-75 — has both ConceptSets and
# InclusionRules + DemographicCriteriaList, which is the shape that previously
# tripped the cohort SQL renderer.
_TUTORIAL_COHORT_JSON = """
{
  "ConceptSets": [
    {
      "id": 0,
      "name": "Type 2 diabetes",
      "expression": {
        "items": [{
          "concept": { "CONCEPT_ID": 201826, "CONCEPT_NAME": "Type 2 diabetes mellitus" },
          "isExcluded": false,
          "includeDescendants": true,
          "includeMapped": false
        }]
      }
    }
  ],
  "PrimaryCriteria": {
    "CriteriaList": [{
      "ConditionOccurrence": { "CodesetId": 0 }
    }],
    "ObservationWindow": { "PriorDays": 0, "PostDays": 0 },
    "PrimaryCriteriaLimit": { "Type": "First" }
  },
  "QualifiedLimit": { "Type": "First" },
  "ExpressionLimit": { "Type": "First" },
  "InclusionRules": [{
    "name": "Aged 50-75",
    "expression": {
      "Type": "ALL",
      "CriteriaList": [],
      "DemographicCriteriaList": [
        { "Age": { "Value": 50, "Op": "gte" } },
        { "Age": { "Value": 75, "Op": "lte" } }
      ],
      "Groups": []
    }
  }],
  "EndStrategy": { "DateOffset": { "DateField": "StartDate", "Offset": 0 } },
  "CensoringCriteria": [],
  "CollapseSettings": { "CollapseType": "ERA", "EraPad": 0 },
  "CensorWindow": {}
}
"""

_TUTORIAL_COHORT_B64 = base64.b64encode(
    _TUTORIAL_COHORT_JSON.strip().encode()
).decode()

_OPTIONS_JSON = (
    '{"cdmSchema":"cdm","resultSchema":"results",'
    '"targetTable":"cohort","cohortId":1,"generateStats":false}'
)


def test_atlas_full_cohort(node_factory):
    """Tutorial cohort (InclusionRules + age) renders + translates without crashing."""
    node = node_factory(load_atlas=True, load_db=False)

    # 1. Render annotated SqlRender SQL from the cohort JSON.
    rendered = node.execute(
        f"SELECT trex_atlas_json_to_sql('{_TUTORIAL_COHORT_B64}', '{_OPTIONS_JSON}')",
        timeout=60,
    )
    assert len(rendered) == 1
    rendered_sql = rendered[0][0]
    assert "SELECT" in rendered_sql.upper()
    # The rendered template is large (~13 KB) and includes age-criteria CTEs.
    assert len(rendered_sql) > 5000, f"unexpectedly short: {len(rendered_sql)}"

    # 2. Translate the rendered SqlRender template to duckdb dialect.
    # Use a dollar-quoted literal so the SQL body's quotes don't fight the
    # outer SQL parser.
    translated = node.execute(
        f"SELECT trex_atlas_sql_translate($trxt${rendered_sql}$trxt$, 'duckdb')",
        timeout=60,
    )
    assert len(translated) == 1
    assert "SELECT" in translated[0][0].upper()

    # 3. Combined call: same flow via the convenience function.
    combined = node.execute(
        f"SELECT trex_atlas_generate_and_translate("
        f"'{_TUTORIAL_COHORT_B64}', '{_OPTIONS_JSON}')",
        timeout=60,
    )
    assert len(combined) == 1
    assert len(combined[0][0]) > 5000

    # 4. Re-run the same rendering several times in the same connection.
    # Catches isolate / thread-local state leaks where the second call
    # crashes after the first.
    for _ in range(3):
        again = node.execute(
            f"SELECT trex_atlas_json_to_sql('{_TUTORIAL_COHORT_B64}', '{_OPTIONS_JSON}')",
            timeout=60,
        )
        assert again[0][0] == rendered_sql


def test_fhir_restart_same_port(node_factory):
    """trex_fhir_start / stop / start on the same port works repeatedly."""
    node = node_factory(load_fhir=True, load_db=False)

    # Use a high port unlikely to collide with anything else in CI.
    port = 28190
    host = "127.0.0.1"

    for cycle in range(3):
        started = node.execute(
            f"SELECT trex_fhir_start('{host}', {port}, 'fhir')", timeout=60
        )
        assert "Started" in started[0][0], (
            f"cycle {cycle}: unexpected start result {started}"
        )

        stopped = node.execute(
            f"SELECT trex_fhir_stop('{host}', {port})", timeout=60
        )
        assert any(
            keyword in stopped[0][0] for keyword in ("Stopped", "Shutdown")
        ), f"cycle {cycle}: unexpected stop result {stopped}"

    # Stopping a port that isn't running returns an error string (not a
    # crash). The function never raises — it stuffs the error into the
    # result column.
    extra_stop = node.execute(
        f"SELECT trex_fhir_stop('{host}', {port})", timeout=10
    )
    assert "Error" in extra_stop[0][0] or "No server" in extra_stop[0][0]
