use crate::dag::topological_sort;
use crate::parser::extract_dependencies;
use crate::project::{load_project, Project};
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct CompileResult {
    pub name: String,
    pub materialized: String,
    pub dependencies: String,
    pub order: i32,
    pub status: String,
    pub message: String,
    pub endpoint_path: String,
    pub endpoint_roles: String,
    pub endpoint_formats: String,
}

pub fn compile_project(project: &Project) -> Result<Vec<CompileResult>, Box<dyn Error>> {
    let mut results = Vec::new();

    let known_names: HashSet<String> = project
        .models
        .iter()
        .map(|m| m.name.clone())
        .chain(project.seeds.iter().map(|s| s.name.clone()))
        .collect();

    let mut edges: HashMap<String, HashSet<String>> = HashMap::new();
    let mut parse_errors: Vec<CompileResult> = Vec::new();

    for model in &project.models {
        match extract_dependencies(&model.sql) {
            Ok(all_refs) => {
                let deps: HashSet<String> = all_refs
                    .into_iter()
                    .filter(|r| known_names.contains(r) && *r != model.name)
                    .collect();
                edges.insert(model.name.clone(), deps);
            }
            Err(e) => {
                parse_errors.push(CompileResult {
                    name: model.name.clone(),
                    materialized: model.materialization.as_str().to_string(),
                    dependencies: String::new(),
                    order: -1,
                    status: "error".to_string(),
                    message: format!("SQL parse error: {}", e),
                    endpoint_path: String::new(),
                    endpoint_roles: String::new(),
                    endpoint_formats: String::new(),
                });
            }
        }
    }

    if !parse_errors.is_empty() {
        return Ok(parse_errors);
    }

    for seed in &project.seeds {
        edges.insert(seed.name.clone(), HashSet::new());
    }

    let all_nodes: Vec<String> = project
        .seeds
        .iter()
        .map(|s| s.name.clone())
        .chain(project.models.iter().map(|m| m.name.clone()))
        .collect();

    let sorted = topological_sort(&all_nodes, &edges)?;

    let model_map: HashMap<&str, &crate::project::Model> = project
        .models
        .iter()
        .map(|m| (m.name.as_str(), m))
        .collect();

    let seed_names: HashSet<&str> = project.seeds.iter().map(|s| s.name.as_str()).collect();

    for (order, name) in sorted.iter().enumerate() {
        let deps = edges.get(name).cloned().unwrap_or_default();
        let deps_str = {
            let mut d: Vec<&String> = deps.iter().collect();
            d.sort();
            d.iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        };

        let model = model_map.get(name.as_str()).copied();

        let materialized = if seed_names.contains(name.as_str()) {
            "seed".to_string()
        } else if let Some(m) = model {
            m.materialization.as_str().to_string()
        } else {
            "unknown".to_string()
        };

        let (ep_path, ep_roles, ep_formats) = match model.and_then(|m| m.endpoint.as_ref()) {
            Some(ep) => (
                ep.path.clone(),
                ep.roles.join(","),
                ep.formats.join(","),
            ),
            None => (String::new(), String::new(), String::new()),
        };

        results.push(CompileResult {
            name: name.clone(),
            materialized,
            dependencies: deps_str,
            order: order as i32,
            status: "ok".to_string(),
            message: String::new(),
            endpoint_path: ep_path,
            endpoint_roles: ep_roles,
            endpoint_formats: ep_formats,
        });
    }

    Ok(results)
}

#[repr(C)]
pub struct CompileBindData {
    path: String,
}

#[repr(C)]
pub struct CompileInitData {
    results: Vec<CompileResult>,
    index: AtomicUsize,
}

pub struct CompileVTab;

impl VTab for CompileVTab {
    type InitData = CompileInitData;
    type BindData = CompileBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "materialized",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column(
            "dependencies",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("order", LogicalTypeHandle::from(LogicalTypeId::Integer));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("message", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "endpoint_path",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column(
            "endpoint_roles",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column(
            "endpoint_formats",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );

        let path = bind.get_parameter(0).to_string();
        Ok(CompileBindData { path })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let path = unsafe { (*bind_data).path.clone() };

        let project = load_project(&path)?;
        let results = compile_project(&project)?;

        Ok(CompileInitData {
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

        let mat_vector = output.flat_vector(1);
        mat_vector.insert(0, result.materialized.as_str());

        let deps_vector = output.flat_vector(2);
        deps_vector.insert(0, result.dependencies.as_str());

        let mut order_vector = output.flat_vector(3);
        order_vector.as_mut_slice::<i32>()[0] = result.order;

        let status_vector = output.flat_vector(4);
        status_vector.insert(0, result.status.as_str());

        let msg_vector = output.flat_vector(5);
        msg_vector.insert(0, result.message.as_str());

        let ep_path_vector = output.flat_vector(6);
        ep_path_vector.insert(0, result.endpoint_path.as_str());

        let ep_roles_vector = output.flat_vector(7);
        ep_roles_vector.insert(0, result.endpoint_roles.as_str());

        let ep_formats_vector = output.flat_vector(8);
        ep_formats_vector.insert(0, result.endpoint_formats.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
    }
}

#[cfg(test)]
mod compile_tests {
    use super::*;
    use crate::project::{
        EndpointConfig, Materialization, Model, Project, ProjectConfig, Seed,
    };

    fn project_config() -> ProjectConfig {
        ProjectConfig {
            name: "test".to_string(),
            models_path: "models".to_string(),
            seeds_path: "seeds".to_string(),
            tests_path: "tests".to_string(),
            source_tables: Vec::new(),
        }
    }

    fn make_project(models: Vec<Model>, seeds: Vec<Seed>) -> Project {
        Project {
            config: project_config(),
            models,
            seeds,
            tests: Vec::new(),
            sources: Vec::new(),
            source_tables: Vec::new(),
            base_path: String::new(),
        }
    }

    fn make_model(name: &str, sql: &str) -> Model {
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

    fn position(results: &[CompileResult], name: &str) -> usize {
        results
            .iter()
            .position(|r| r.name == name)
            .expect("expected model missing from compile output")
    }

    #[test]
    fn compile_project_returns_empty_for_empty_project() {
        let project = make_project(Vec::new(), Vec::new());
        let results = compile_project(&project).unwrap();
        assert!(
            results.is_empty(),
            "empty project should produce no compile rows, got {}",
            results.len()
        );
    }

    #[test]
    fn compile_project_emits_single_ok_row_for_single_model() {
        let project = make_project(
            vec![make_model("solo", "SELECT 1 AS x")],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 1, "expected one compile row");
        let row = &results[0];
        assert_eq!(row.name, "solo");
        assert_eq!(row.status, "ok", "status should be ok, got {}", row.status);
        assert_eq!(row.message, "", "ok rows should have empty message");
        assert_eq!(row.order, 0, "single model should get order 0");
        assert_eq!(row.materialized, "view");
        assert_eq!(row.dependencies, "");
    }

    #[test]
    fn compile_project_orders_dependent_after_dependency() {
        // model_b depends on model_a; expected topo order: a before b.
        let project = make_project(
            vec![
                make_model("model_a", "SELECT 1 AS id"),
                make_model("model_b", "SELECT * FROM model_a"),
            ],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 2);
        let pa = position(&results, "model_a");
        let pb = position(&results, "model_b");
        assert!(pa < pb, "model_a should come before model_b (got {pa} vs {pb})");
        assert_eq!(results[pa].order as usize, pa);
        assert_eq!(results[pb].order as usize, pb);
        assert_eq!(results[pa].dependencies, "");
        assert_eq!(results[pb].dependencies, "model_a");
        assert!(results.iter().all(|r| r.status == "ok"));
    }

    #[test]
    fn compile_project_excludes_unknown_table_refs_from_dependencies() {
        // model_b references model_a (known) and ghost_table (unknown).
        let project = make_project(
            vec![
                make_model("model_a", "SELECT 1 AS id"),
                make_model(
                    "model_b",
                    "SELECT * FROM model_a JOIN ghost_table ON model_a.id = ghost_table.id",
                ),
            ],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        let b = &results[position(&results, "model_b")];
        assert_eq!(
            b.dependencies, "model_a",
            "unknown table 'ghost_table' must not appear in deps; got: {}",
            b.dependencies
        );
    }

    #[test]
    fn compile_project_reports_parse_error_with_order_minus_one() {
        // Malformed SQL — parser should fail; we expect a single error row with order -1.
        let project = make_project(
            vec![make_model("broken", "SELECT FROM WHERE")],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 1, "exactly one error row expected");
        let row = &results[0];
        assert_eq!(row.name, "broken");
        assert_eq!(row.status, "error", "status should be error, got {}", row.status);
        assert_eq!(row.order, -1, "error rows must carry order = -1");
        assert!(
            !row.message.is_empty(),
            "error row must carry a non-empty message"
        );
        assert!(
            row.message.contains("SQL parse error"),
            "expected parse-error context in message, got: {}",
            row.message
        );
        // Materialization still flows through even on error.
        assert_eq!(row.materialized, "view");
    }

    #[test]
    fn compile_project_errors_on_cycle_between_models() {
        // model_a depends on model_b and vice versa — topological_sort surfaces a cycle error.
        let project = make_project(
            vec![
                make_model("model_a", "SELECT * FROM model_b"),
                make_model("model_b", "SELECT * FROM model_a"),
            ],
            Vec::new(),
        );
        let msg = match compile_project(&project) {
            Ok(_) => panic!("cycle should bubble up as Err, but compile_project returned Ok"),
            Err(e) => e.to_string(),
        };
        assert!(
            msg.contains("Circular dependency"),
            "expected circular-dependency error, got: {msg}"
        );
        assert!(msg.contains("model_a") && msg.contains("model_b"));
    }

    #[test]
    fn compile_project_includes_seed_references_in_dependencies() {
        // Seeds count as known names; a model referencing a seed must pick it up.
        let project = make_project(
            vec![make_model("uses_seed", "SELECT * FROM my_seed")],
            vec![Seed {
                name: "my_seed".to_string(),
                path: "/tmp/my_seed.csv".to_string(),
            }],
        );
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 2, "should contain seed and model rows");
        let seed_row = &results[position(&results, "my_seed")];
        assert_eq!(seed_row.materialized, "seed");
        assert_eq!(seed_row.dependencies, "");
        let model_row = &results[position(&results, "uses_seed")];
        assert_eq!(
            model_row.dependencies, "my_seed",
            "seed should appear in model's dependencies"
        );
        // Seed sorts before its dependent.
        assert!(
            position(&results, "my_seed") < position(&results, "uses_seed"),
            "seed must come before model that depends on it"
        );
    }

    #[test]
    fn compile_project_filters_self_references_from_dependencies() {
        // Even if a model's SQL names itself, that self-ref must not appear in deps.
        let project = make_project(
            vec![make_model(
                "recursive_ish",
                "SELECT * FROM recursive_ish",
            )],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 1);
        let row = &results[0];
        assert_eq!(row.status, "ok");
        assert_eq!(
            row.dependencies, "",
            "self-reference must be stripped from deps; got: {}",
            row.dependencies
        );
    }

    #[test]
    fn compile_project_propagates_endpoint_metadata() {
        let mut model = make_model("api_model", "SELECT 1 AS id");
        model.materialization = Materialization::Table;
        model.endpoint = Some(EndpointConfig {
            path: "/v1/api_model".to_string(),
            roles: vec!["admin".to_string(), "viewer".to_string()],
            formats: vec!["json".to_string(), "csv".to_string()],
        });
        let project = make_project(vec![model], Vec::new());
        let results = compile_project(&project).unwrap();
        assert_eq!(results.len(), 1);
        let row = &results[0];
        assert_eq!(row.endpoint_path, "/v1/api_model");
        assert_eq!(
            row.endpoint_roles, "admin,viewer",
            "roles should be comma-joined in declared order"
        );
        assert_eq!(
            row.endpoint_formats, "json,csv",
            "formats should be comma-joined in declared order"
        );
        assert_eq!(row.materialized, "table");
    }

    #[test]
    fn compile_project_leaves_endpoint_fields_empty_when_unset() {
        let project = make_project(
            vec![make_model("plain", "SELECT 1")],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        let row = &results[0];
        assert_eq!(row.endpoint_path, "");
        assert_eq!(row.endpoint_roles, "");
        assert_eq!(row.endpoint_formats, "");
    }

    #[test]
    fn compile_project_sorts_multiple_dependencies_alphabetically() {
        // model_c depends on model_a and model_b — deps string must be sorted.
        let project = make_project(
            vec![
                make_model("model_a", "SELECT 1 AS id"),
                make_model("model_b", "SELECT 1 AS id"),
                make_model(
                    "model_c",
                    "SELECT * FROM model_b JOIN model_a ON model_a.id = model_b.id",
                ),
            ],
            Vec::new(),
        );
        let results = compile_project(&project).unwrap();
        let c = &results[position(&results, "model_c")];
        assert_eq!(
            c.dependencies, "model_a, model_b",
            "deps must be alphabetically sorted and comma-space joined"
        );
        // Both upstreams come before model_c.
        let pc = position(&results, "model_c");
        assert!(position(&results, "model_a") < pc);
        assert!(position(&results, "model_b") < pc);
    }
}
