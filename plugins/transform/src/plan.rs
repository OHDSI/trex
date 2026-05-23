use crate::compile::compile_project;
use crate::dag::transitive_dependents;
use crate::parser::extract_dependencies;
use crate::project::{load_project, Materialization};
use crate::state::{ensure_state_table, query_state};
use crate::{escape_sql_ident, execute_sql};
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use siphasher::sip::SipHasher13;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PlanResult {
    pub(crate) name: String,
    pub(crate) action: String,
    pub(crate) materialized: String,
    pub(crate) reason: String,
}

pub(crate) fn compute_plan(
    project: &crate::project::Project,
    compiled: &[crate::compile::CompileResult],
    existing_state: &std::collections::HashMap<String, crate::state::ModelState>,
) -> Vec<PlanResult> {
    let known_names: HashSet<String> = project
        .models
        .iter()
        .map(|m| m.name.clone())
        .chain(project.seeds.iter().map(|s| s.name.clone()))
        .collect();

    let mut edges: HashMap<String, HashSet<String>> = HashMap::new();
    for model in &project.models {
        if let Ok(all_refs) = extract_dependencies(&model.sql) {
            let deps: HashSet<String> = all_refs
                .into_iter()
                .filter(|r| known_names.contains(r) && *r != model.name)
                .collect();
            edges.insert(model.name.clone(), deps);
        }
    }

    let mut directly_changed: HashSet<String> = HashSet::new();
    for model in &project.models {
        if model.materialization == Materialization::Ephemeral {
            continue;
        }
        let checksum =
            compute_model_checksum(&model.name, &model.sql, model.yaml_content.as_deref());
        match existing_state.get(&model.name) {
            Some(state) => {
                if state.checksum != checksum {
                    directly_changed.insert(model.name.clone());
                }
            }
            None => {
                directly_changed.insert(model.name.clone());
            }
        }
    }

    let all_nodes: Vec<String> = project.models.iter().map(|m| m.name.clone()).collect();
    let affected = transitive_dependents(&directly_changed, &all_nodes, &edges);

    let project_names: HashSet<String> = project
        .models
        .iter()
        .map(|m| m.name.clone())
        .chain(project.seeds.iter().map(|s| s.name.clone()))
        .collect();

    let mut results = Vec::new();

    for cr in compiled {
        if cr.materialized == "seed" || cr.materialized == "ephemeral" {
            continue;
        }

        if !existing_state.contains_key(&cr.name) {
            results.push(PlanResult {
                name: cr.name.clone(),
                action: "create".to_string(),
                materialized: cr.materialized.clone(),
                reason: "new model".to_string(),
            });
        } else if directly_changed.contains(&cr.name) {
            results.push(PlanResult {
                name: cr.name.clone(),
                action: "update".to_string(),
                materialized: cr.materialized.clone(),
                reason: "model changed".to_string(),
            });
        } else if affected.contains(&cr.name) {
            results.push(PlanResult {
                name: cr.name.clone(),
                action: "update".to_string(),
                materialized: cr.materialized.clone(),
                reason: "dependency changed".to_string(),
            });
        } else {
            results.push(PlanResult {
                name: cr.name.clone(),
                action: "no_change".to_string(),
                materialized: cr.materialized.clone(),
                reason: String::new(),
            });
        }
    }

    for (name, state) in existing_state {
        if !project_names.contains(name) && state.materialized != "seed" {
            results.push(PlanResult {
                name: name.clone(),
                action: "drop".to_string(),
                materialized: state.materialized.clone(),
                reason: "model removed from project".to_string(),
            });
        }
    }

    results
}

fn compute_model_checksum(name: &str, sql: &str, yaml: Option<&str>) -> String {
    let mut hasher = SipHasher13::new();
    name.hash(&mut hasher);
    sql.hash(&mut hasher);
    if let Some(y) = yaml {
        y.hash(&mut hasher);
    }
    hasher.finish().to_string()
}

#[repr(C)]
pub struct PlanBindData {
    path: String,
    schema: String,
    source_schema: Option<String>,
}

#[repr(C)]
pub struct PlanInitData {
    results: Vec<PlanResult>,
    index: AtomicUsize,
}

pub struct PlanVTab;

impl VTab for PlanVTab {
    type InitData = PlanInitData;
    type BindData = PlanBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("action", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "materialized",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("reason", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        let source_schema = bind
            .get_named_parameter("source_schema")
            .map(|v| v.to_string())
            .filter(|s| !s.is_empty());
        Ok(PlanBindData { path, schema, source_schema })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema, _source_schema) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
                (*bind_data).source_schema.clone(),
            )
        };

        let project = load_project(&path)?;
        let compiled = compile_project(&project)?;

        let _ = execute_sql(&format!(
            "CREATE SCHEMA IF NOT EXISTS \"{}\"",
            escape_sql_ident(&schema)
        ));
        let _ = ensure_state_table(&schema);

        let existing_state = query_state(&schema).unwrap_or_default();

        let results = compute_plan(&project, &compiled, &existing_state);

        Ok(PlanInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let name_vector = output.flat_vector(0);
        name_vector.insert(0, result.name.as_str());

        let action_vector = output.flat_vector(1);
        action_vector.insert(0, result.action.as_str());

        let mat_vector = output.flat_vector(2);
        mat_vector.insert(0, result.materialized.as_str());

        let reason_vector = output.flat_vector(3);
        reason_vector.insert(0, result.reason.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        ])
    }

    fn named_parameters() -> Option<Vec<(String, LogicalTypeHandle)>> {
        Some(vec![
            ("source_schema".to_string(), LogicalTypeHandle::from(LogicalTypeId::Varchar)),
        ])
    }
}

#[cfg(test)]
mod plan_tests {
    use super::*;

    #[test]
    fn compute_model_checksum_is_stable_for_identical_input() {
        // Same inputs must yield the same hash on repeated calls — the function
        // is the cache key, so non-determinism would defeat incremental planning.
        let a = compute_model_checksum("orders", "SELECT 1", Some("config: yes"));
        let b = compute_model_checksum("orders", "SELECT 1", Some("config: yes"));
        assert_eq!(a, b, "checksum must be deterministic");
    }

    #[test]
    fn compute_model_checksum_changes_when_name_changes() {
        let a = compute_model_checksum("orders", "SELECT 1", None);
        let b = compute_model_checksum("customers", "SELECT 1", None);
        assert_ne!(a, b, "different name should produce a different checksum");
    }

    #[test]
    fn compute_model_checksum_changes_when_sql_changes() {
        let a = compute_model_checksum("orders", "SELECT 1", None);
        let b = compute_model_checksum("orders", "SELECT 2", None);
        assert_ne!(a, b, "different SQL should produce a different checksum");
    }

    #[test]
    fn compute_model_checksum_changes_when_yaml_changes() {
        let a = compute_model_checksum("orders", "SELECT 1", Some("a: 1"));
        let b = compute_model_checksum("orders", "SELECT 1", Some("a: 2"));
        assert_ne!(a, b, "different YAML should produce a different checksum");
    }

    #[test]
    fn compute_model_checksum_distinguishes_none_from_empty_yaml() {
        // The implementation only hashes the YAML bytes when Some — an absent
        // config is therefore distinguishable from an empty-string config.
        let none_yaml = compute_model_checksum("orders", "SELECT 1", None);
        let empty_yaml = compute_model_checksum("orders", "SELECT 1", Some(""));
        assert_ne!(
            none_yaml, empty_yaml,
            "None and Some(\"\") must hash differently"
        );
    }

    // ------------------------------------------------------------------
    // compute_plan: pure-logic tests
    //
    // These tests exercise the planner without touching the database. We
    // build small in-memory `Project` / `CompileResult` / `ModelState`
    // fixtures and feed them straight to `compute_plan`. The DB-bound
    // preamble (load_project, compile_project, ensure_state_table,
    // query_state) is intentionally *out of scope* — it's wired up by
    // `PlanVTab::init`, which we cover separately.
    // ------------------------------------------------------------------

    use crate::compile::CompileResult;
    use crate::project::{
        Materialization, Model, ProjectConfig, Project, Seed,
    };
    use crate::state::ModelState;
    use std::collections::HashMap;

    /// Build a `Model` with view materialization and the given SQL.
    fn mk_model(name: &str, sql: &str) -> Model {
        Model {
            name: name.to_string(),
            sql: sql.to_string(),
            materialization: Materialization::View,
            unique_key: None,
            incremental_strategy: None,
            updated_at: None,
            batch_size: None,
            lookback: None,
            merge_update_columns: None,
            merge_exclude_columns: None,
            strategy: None,
            check_cols: None,
            pre_hooks: None,
            post_hooks: None,
            column_tests: Vec::new(),
            yaml_content: None,
            endpoint: None,
        }
    }

    /// Build a `Project` from the given models and seeds. Other fields are
    /// inert defaults — the planner only reads `models` and `seeds`.
    fn mk_project(models: Vec<Model>, seeds: Vec<Seed>) -> Project {
        Project {
            config: ProjectConfig {
                name: "test".to_string(),
                models_path: "models".to_string(),
                seeds_path: "seeds".to_string(),
                tests_path: "tests".to_string(),
                source_tables: Vec::new(),
            },
            models,
            seeds,
            tests: Vec::new(),
            sources: Vec::new(),
            source_tables: Vec::new(),
            base_path: String::new(),
        }
    }

    /// Build a `CompileResult` with the given name and materialization.
    /// The planner only inspects `name` and `materialized`; the rest is
    /// padding so the struct is constructable.
    fn mk_compiled(name: &str, materialized: &str) -> CompileResult {
        CompileResult {
            name: name.to_string(),
            materialized: materialized.to_string(),
            dependencies: String::new(),
            order: 0,
            status: "ok".to_string(),
            message: String::new(),
            endpoint_path: String::new(),
            endpoint_roles: String::new(),
            endpoint_formats: String::new(),
        }
    }

    /// Build a `ModelState` whose checksum matches what `compute_plan`
    /// will calculate for the given (name, sql, yaml). Use this when a
    /// test wants a model to appear *unchanged* relative to state.
    fn state_matching(name: &str, sql: &str, yaml: Option<&str>, materialized: &str) -> ModelState {
        ModelState {
            model_name: name.to_string(),
            materialized: materialized.to_string(),
            checksum: compute_model_checksum(name, sql, yaml),
            deployed_at: String::new(),
            incremental_strategy: None,
            last_watermark: None,
        }
    }

    /// Build a `ModelState` with an explicit (likely mismatching) checksum.
    fn state_with_checksum(name: &str, checksum: &str, materialized: &str) -> ModelState {
        ModelState {
            model_name: name.to_string(),
            materialized: materialized.to_string(),
            checksum: checksum.to_string(),
            deployed_at: String::new(),
            incremental_strategy: None,
            last_watermark: None,
        }
    }

    #[test]
    fn compute_plan_empty_project_yields_empty_results() {
        // Nothing to compile, nothing in state — planner has no work.
        let project = mk_project(vec![], vec![]);
        let results = compute_plan(&project, &[], &HashMap::new());
        assert!(results.is_empty(), "no inputs ⇒ no plan rows");
    }

    #[test]
    fn compute_plan_new_model_yields_create() {
        // Model exists in compiled output but is absent from state ⇒ "create".
        let project = mk_project(vec![mk_model("orders", "SELECT 1")], vec![]);
        let compiled = vec![mk_compiled("orders", "view")];
        let results = compute_plan(&project, &compiled, &HashMap::new());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "orders");
        assert_eq!(results[0].action, "create");
        assert_eq!(results[0].materialized, "view");
        assert_eq!(results[0].reason, "new model");
    }

    #[test]
    fn compute_plan_unchanged_model_yields_no_change() {
        // State checksum matches model checksum ⇒ no_change, empty reason.
        let project = mk_project(vec![mk_model("orders", "SELECT 1")], vec![]);
        let compiled = vec![mk_compiled("orders", "view")];
        let mut state = HashMap::new();
        state.insert(
            "orders".to_string(),
            state_matching("orders", "SELECT 1", None, "view"),
        );
        let results = compute_plan(&project, &compiled, &state);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, "no_change");
        assert_eq!(results[0].reason, "");
    }

    #[test]
    fn compute_plan_changed_sql_yields_update_with_model_changed_reason() {
        // The model is in state but its checksum no longer matches —
        // a direct change, so reason must be "model changed" (not "dependency changed").
        let project = mk_project(vec![mk_model("orders", "SELECT 2")], vec![]);
        let compiled = vec![mk_compiled("orders", "view")];
        let mut state = HashMap::new();
        // Stale checksum: state was deployed when SQL was "SELECT 1".
        state.insert(
            "orders".to_string(),
            state_matching("orders", "SELECT 1", None, "view"),
        );
        let results = compute_plan(&project, &compiled, &state);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, "update");
        assert_eq!(results[0].reason, "model changed");
    }

    #[test]
    fn compute_plan_dependency_change_propagates_as_update() {
        // DAG: B depends on A. A's SQL changed; B's SQL is unchanged.
        // Expectation: A is "update / model changed", B is "update / dependency changed".
        let project = mk_project(
            vec![
                mk_model("a", "SELECT 1 AS x"),
                mk_model("b", "SELECT * FROM a"),
            ],
            vec![],
        );
        let compiled = vec![mk_compiled("a", "view"), mk_compiled("b", "view")];
        let mut state = HashMap::new();
        // A's stored checksum is stale.
        state.insert(
            "a".to_string(),
            state_with_checksum("a", "stale-checksum", "view"),
        );
        // B's stored checksum matches current B SQL — B itself didn't change.
        state.insert(
            "b".to_string(),
            state_matching("b", "SELECT * FROM a", None, "view"),
        );
        let results = compute_plan(&project, &compiled, &state);
        // Two rows, one per model.
        assert_eq!(results.len(), 2);
        let by_name: HashMap<&str, &PlanResult> =
            results.iter().map(|r| (r.name.as_str(), r)).collect();
        assert_eq!(by_name["a"].action, "update");
        assert_eq!(by_name["a"].reason, "model changed");
        assert_eq!(by_name["b"].action, "update");
        assert_eq!(by_name["b"].reason, "dependency changed");
    }

    #[test]
    fn compute_plan_state_only_model_yields_drop() {
        // The model is in state but no longer in the project ⇒ "drop".
        let project = mk_project(vec![], vec![]);
        let compiled: Vec<CompileResult> = vec![];
        let mut state = HashMap::new();
        state.insert(
            "old_model".to_string(),
            state_with_checksum("old_model", "x", "table"),
        );
        let results = compute_plan(&project, &compiled, &state);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "old_model");
        assert_eq!(results[0].action, "drop");
        assert_eq!(results[0].materialized, "table");
        assert_eq!(results[0].reason, "model removed from project");
    }

    #[test]
    fn compute_plan_skips_seed_and_ephemeral_in_compiled_iteration() {
        // Seeds and ephemerals must produce no create/update/no_change rows
        // — they're filtered at the top of the loop over `compiled`.
        let project = mk_project(
            vec![{
                let mut m = mk_model("eph", "SELECT 1");
                m.materialization = Materialization::Ephemeral;
                m
            }],
            vec![Seed { name: "people".to_string(), path: String::new() }],
        );
        let compiled = vec![
            mk_compiled("people", "seed"),
            mk_compiled("eph", "ephemeral"),
        ];
        let results = compute_plan(&project, &compiled, &HashMap::new());
        assert!(
            results.is_empty(),
            "seed and ephemeral compiled rows must not produce plan rows; got {:?}",
            results
        );
    }

    #[test]
    fn compute_plan_does_not_drop_seeds_left_in_state() {
        // A seed that's been removed from disk but still has state must NOT
        // produce a drop row — the explicit `state.materialized != "seed"`
        // guard exists so seeds get re-managed by the seed loader.
        let project = mk_project(vec![], vec![]);
        let compiled: Vec<CompileResult> = vec![];
        let mut state = HashMap::new();
        state.insert(
            "old_seed".to_string(),
            state_with_checksum("old_seed", "x", "seed"),
        );
        let results = compute_plan(&project, &compiled, &state);
        assert!(
            results.is_empty(),
            "seed state rows should not produce drop rows; got {:?}",
            results
        );
    }

    #[test]
    fn compute_plan_ephemeral_does_not_enter_directly_changed() {
        // Ephemerals are skipped in the directly_changed loop. If an
        // ephemeral X is in the project but absent from state, and a
        // downstream model Y depends on it, Y must NOT be flagged
        // "dependency changed" via X — because X never entered the
        // changed set in the first place. Y is, however, "create" itself
        // since it's also new to state. We assert specifically that Y's
        // reason is the "new model" reason, not a dependency-driven one.
        let project = mk_project(
            vec![
                {
                    let mut m = mk_model("eph", "SELECT 1");
                    m.materialization = Materialization::Ephemeral;
                    m
                },
                mk_model("downstream", "SELECT * FROM eph"),
            ],
            vec![],
        );
        let compiled = vec![
            mk_compiled("eph", "ephemeral"),
            mk_compiled("downstream", "view"),
        ];
        // Ephemeral has no state entry at all — confirm it isn't directly_changed.
        let results = compute_plan(&project, &compiled, &HashMap::new());
        // Only downstream produces a row (ephemeral filtered).
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "downstream");
        // It's new ⇒ "create" wins, not "dependency changed".
        assert_eq!(results[0].action, "create");
        assert_eq!(results[0].reason, "new model");
    }

    #[test]
    fn compute_plan_create_wins_over_change_branch() {
        // Action priority: when a model is BOTH new (no state) AND its checksum
        // would differ from any state entry, the `if !existing_state.contains_key`
        // branch fires first — so the row is "create" / "new model", not
        // "update" / "model changed". This locks the if/else if ordering.
        let project = mk_project(vec![mk_model("orders", "SELECT 1")], vec![]);
        let compiled = vec![mk_compiled("orders", "view")];
        // No state entry for "orders" ⇒ "create" branch must fire even though
        // the model has clearly never been deployed.
        let results = compute_plan(&project, &compiled, &HashMap::new());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, "create", "create must win over update");
        assert_eq!(results[0].reason, "new model");
    }

    #[test]
    fn compute_plan_change_wins_over_affected_branch() {
        // Action priority: a directly-changed model must report
        // "model changed", not "dependency changed", even if it's also
        // transitively affected by another change. Set-up: A and B both
        // change directly. B depends on A — so B is also in `affected`.
        // The directly_changed branch must fire first for B.
        let project = mk_project(
            vec![
                mk_model("a", "SELECT 2"),
                mk_model("b", "SELECT * FROM a"),
            ],
            vec![],
        );
        let compiled = vec![mk_compiled("a", "view"), mk_compiled("b", "view")];
        let mut state = HashMap::new();
        // Both A and B have stale checksums ⇒ both in directly_changed.
        state.insert(
            "a".to_string(),
            state_with_checksum("a", "stale-a", "view"),
        );
        state.insert(
            "b".to_string(),
            state_with_checksum("b", "stale-b", "view"),
        );
        let results = compute_plan(&project, &compiled, &state);
        let by_name: HashMap<&str, &PlanResult> =
            results.iter().map(|r| (r.name.as_str(), r)).collect();
        // B is changed directly *and* downstream of A. The directly_changed
        // branch must fire first.
        assert_eq!(by_name["b"].action, "update");
        assert_eq!(
            by_name["b"].reason, "model changed",
            "direct change must win over dependency-changed reason"
        );
    }

    #[test]
    fn compute_plan_drop_rows_collected_as_set_regardless_of_order() {
        // `existing_state` is a HashMap; iteration order over its entries
        // is not specified. The planner intentionally preserves that
        // (no sort) — so a deterministic assertion here must compare as
        // a set, not by index.
        let project = mk_project(vec![], vec![]);
        let compiled: Vec<CompileResult> = vec![];
        let mut state = HashMap::new();
        state.insert(
            "gone_a".to_string(),
            state_with_checksum("gone_a", "x", "view"),
        );
        state.insert(
            "gone_b".to_string(),
            state_with_checksum("gone_b", "y", "table"),
        );
        state.insert(
            "gone_c".to_string(),
            state_with_checksum("gone_c", "z", "incremental"),
        );
        let results = compute_plan(&project, &compiled, &state);
        assert_eq!(results.len(), 3);
        // All rows must be drops; assert membership as a set.
        let names: std::collections::HashSet<&str> =
            results.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(
            names,
            ["gone_a", "gone_b", "gone_c"].iter().copied().collect()
        );
        assert!(
            results.iter().all(|r| r.action == "drop"
                && r.reason == "model removed from project"),
            "every state-only row must be a drop"
        );
        // Materializations must be carried through from state, not from project.
        let mat: HashMap<&str, &str> = results
            .iter()
            .map(|r| (r.name.as_str(), r.materialized.as_str()))
            .collect();
        assert_eq!(mat["gone_a"], "view");
        assert_eq!(mat["gone_b"], "table");
        assert_eq!(mat["gone_c"], "incremental");
    }

    #[test]
    fn compute_plan_preserves_compiled_order_for_model_rows() {
        // Model rows are emitted in the order they appear in `compiled`
        // (drop rows are appended afterwards, in HashMap iteration order).
        // Verify that the compiled-driven prefix preserves input order.
        let project = mk_project(
            vec![
                mk_model("z_last", "SELECT 1"),
                mk_model("a_first", "SELECT 1"),
                mk_model("m_mid", "SELECT 1"),
            ],
            vec![],
        );
        // Intentionally not alphabetical — we want to see this order out.
        let compiled = vec![
            mk_compiled("z_last", "view"),
            mk_compiled("a_first", "view"),
            mk_compiled("m_mid", "view"),
        ];
        let results = compute_plan(&project, &compiled, &HashMap::new());
        let names: Vec<&str> = results.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, vec!["z_last", "a_first", "m_mid"]);
    }
}
