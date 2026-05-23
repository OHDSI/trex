use crate::project::load_project;
use crate::state::{ensure_state_table, query_state, upsert_state, ModelState};
use crate::{escape_sql_ident, escape_sql_str, execute_sql};
use chrono::Utc;
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use siphasher::sip::SipHasher13;
use std::collections::HashMap;
use std::error::Error;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SeedResult {
    name: String,
    action: String,
    rows: String,
    message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum SeedDecision {
    NoChange,
    Create,
    Update,
}

impl SeedDecision {
    pub(crate) fn to_action_str(&self) -> &'static str {
        match self {
            SeedDecision::Create => "create",
            SeedDecision::Update => "update",
            SeedDecision::NoChange => "no_change",
        }
    }
}

pub(crate) fn decide_seed_action(
    seed_name: &str,
    new_checksum: &str,
    existing_state: &HashMap<String, ModelState>,
) -> SeedDecision {
    match existing_state.get(seed_name) {
        Some(state) if state.checksum == new_checksum => SeedDecision::NoChange,
        Some(_) => SeedDecision::Update,
        None => SeedDecision::Create,
    }
}

pub(crate) fn build_seed_load_sql(schema: &str, seed_name: &str, seed_path: &str) -> String {
    format!(
        "CREATE OR REPLACE TABLE \"{schema}\".\"{name}\" AS SELECT * FROM read_csv_auto('{path}')",
        schema = escape_sql_ident(schema),
        name = escape_sql_ident(seed_name),
        path = escape_sql_str(seed_path),
    )
}

pub(crate) fn build_seed_no_change_result(seed_name: &str) -> SeedResult {
    SeedResult {
        name: seed_name.to_string(),
        action: "no_change".to_string(),
        rows: String::new(),
        message: String::new(),
    }
}

pub(crate) fn build_seed_success_result(seed_name: &str, action: SeedDecision) -> SeedResult {
    SeedResult {
        name: seed_name.to_string(),
        action: action.to_action_str().to_string(),
        rows: String::new(),
        message: "ok".to_string(),
    }
}

pub(crate) fn build_seed_error_result(seed_name: &str, err_msg: &str) -> SeedResult {
    SeedResult {
        name: seed_name.to_string(),
        action: "error".to_string(),
        rows: String::new(),
        message: err_msg.to_string(),
    }
}

fn compute_seed_checksum(name: &str, path: &str) -> String {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let mut hasher = SipHasher13::new();
    name.hash(&mut hasher);
    content.hash(&mut hasher);
    hasher.finish().to_string()
}

#[repr(C)]
pub struct SeedBindData {
    path: String,
    schema: String,
}

#[repr(C)]
pub struct SeedInitData {
    results: Vec<SeedResult>,
    index: AtomicUsize,
}

pub struct SeedVTab;

impl VTab for SeedVTab {
    type InitData = SeedInitData;
    type BindData = SeedBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("action", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("rows", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("message", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        Ok(SeedBindData { path, schema })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
            )
        };

        let project = load_project(&path)?;

        execute_sql(&format!(
            "CREATE SCHEMA IF NOT EXISTS \"{}\"",
            escape_sql_ident(&schema)
        ))?;
        ensure_state_table(&schema)?;

        let existing_state = query_state(&schema)?;
        let mut results = Vec::new();

        for seed in &project.seeds {
            let checksum = compute_seed_checksum(&seed.name, &seed.path);
            let decision = decide_seed_action(&seed.name, &checksum, &existing_state);

            if decision == SeedDecision::NoChange {
                results.push(build_seed_no_change_result(&seed.name));
                continue;
            }

            let sql = build_seed_load_sql(&schema, &seed.name, &seed.path);

            match execute_sql(&sql) {
                Ok(_) => {
                    let deployed_at = Utc::now().to_rfc3339();
                    upsert_state(&schema, &seed.name, "seed", &checksum, &deployed_at, None, None)?;
                    results.push(build_seed_success_result(&seed.name, decision));
                }
                Err(e) => {
                    results.push(build_seed_error_result(&seed.name, &format!("{}", e)));
                }
            }
        }

        Ok(SeedInitData {
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

        let rows_vector = output.flat_vector(2);
        rows_vector.insert(0, result.rows.as_str());

        let msg_vector = output.flat_vector(3);
        msg_vector.insert(0, result.message.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        ])
    }
}

#[cfg(test)]
mod seed_tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_seed(contents: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().expect("temp file");
        f.write_all(contents.as_bytes()).expect("write seed");
        f
    }

    #[test]
    fn compute_seed_checksum_is_stable_for_identical_input() {
        let f = write_seed("id,name\n1,alice\n2,bob\n");
        let path = f.path().to_str().expect("path utf8");
        let a = compute_seed_checksum("users", path);
        let b = compute_seed_checksum("users", path);
        assert_eq!(a, b, "checksum must be deterministic for unchanged file");
    }

    #[test]
    fn compute_seed_checksum_changes_when_name_changes() {
        let f = write_seed("id,name\n1,alice\n");
        let path = f.path().to_str().expect("path utf8");
        let a = compute_seed_checksum("users", path);
        let b = compute_seed_checksum("customers", path);
        assert_ne!(a, b, "different seed name should produce different checksum");
    }

    #[test]
    fn compute_seed_checksum_changes_when_content_changes() {
        let f1 = write_seed("id,name\n1,alice\n");
        let f2 = write_seed("id,name\n1,alice\n2,bob\n");
        let a = compute_seed_checksum("users", f1.path().to_str().unwrap());
        let b = compute_seed_checksum("users", f2.path().to_str().unwrap());
        assert_ne!(a, b, "different file content should produce different checksum");
    }

    #[test]
    fn compute_seed_checksum_treats_missing_file_as_empty_content() {
        // The implementation swallows fs errors via unwrap_or_default, so a
        // missing path hashes the same as an empty file with the same name.
        let empty = write_seed("");
        let missing_hash = compute_seed_checksum("users", "/does/not/exist/seed.csv");
        let empty_hash = compute_seed_checksum("users", empty.path().to_str().unwrap());
        assert_eq!(
            missing_hash, empty_hash,
            "missing file should hash like an empty file"
        );
    }

    fn make_state(name: &str, checksum: &str) -> ModelState {
        ModelState {
            model_name: name.to_string(),
            materialized: "seed".to_string(),
            checksum: checksum.to_string(),
            deployed_at: "2026-01-01T00:00:00Z".to_string(),
            incremental_strategy: None,
            last_watermark: None,
        }
    }

    #[test]
    fn decide_seed_action_returns_create_when_not_in_state() {
        let state: HashMap<String, ModelState> = HashMap::new();
        let decision = decide_seed_action("users", "abc123", &state);
        assert_eq!(decision, SeedDecision::Create, "missing seed should be Create");
    }

    #[test]
    fn decide_seed_action_returns_no_change_when_checksum_matches() {
        let mut state = HashMap::new();
        state.insert("users".to_string(), make_state("users", "abc123"));
        let decision = decide_seed_action("users", "abc123", &state);
        assert_eq!(
            decision,
            SeedDecision::NoChange,
            "matching checksum should be NoChange"
        );
    }

    #[test]
    fn decide_seed_action_returns_update_when_checksum_differs() {
        let mut state = HashMap::new();
        state.insert("users".to_string(), make_state("users", "old"));
        let decision = decide_seed_action("users", "new", &state);
        assert_eq!(
            decision,
            SeedDecision::Update,
            "differing checksum should be Update"
        );
    }

    #[test]
    fn seed_decision_to_action_str_maps_all_variants() {
        assert_eq!(SeedDecision::Create.to_action_str(), "create");
        assert_eq!(SeedDecision::Update.to_action_str(), "update");
        assert_eq!(SeedDecision::NoChange.to_action_str(), "no_change");
    }

    #[test]
    fn build_seed_load_sql_plain_inputs() {
        let sql = build_seed_load_sql("main", "users", "/data/users.csv");
        assert_eq!(
            sql,
            "CREATE OR REPLACE TABLE \"main\".\"users\" AS SELECT * FROM read_csv_auto('/data/users.csv')",
            "plain SQL must match original format!"
        );
    }

    #[test]
    fn build_seed_load_sql_escapes_double_quotes_in_idents() {
        let sql = build_seed_load_sql("my\"schema", "my\"seed", "/p.csv");
        assert_eq!(
            sql,
            "CREATE OR REPLACE TABLE \"my\"\"schema\".\"my\"\"seed\" AS SELECT * FROM read_csv_auto('/p.csv')",
            "double quotes in idents must be doubled"
        );
    }

    #[test]
    fn build_seed_load_sql_escapes_single_quotes_in_path() {
        let sql = build_seed_load_sql("main", "users", "/data/o'brien.csv");
        assert_eq!(
            sql,
            "CREATE OR REPLACE TABLE \"main\".\"users\" AS SELECT * FROM read_csv_auto('/data/o''brien.csv')",
            "single quotes in path must be doubled"
        );
    }

    #[test]
    fn build_seed_no_change_result_has_expected_shape() {
        let r = build_seed_no_change_result("users");
        assert_eq!(
            r,
            SeedResult {
                name: "users".to_string(),
                action: "no_change".to_string(),
                rows: String::new(),
                message: String::new(),
            },
            "no_change result must have empty rows and message"
        );
    }

    #[test]
    fn build_seed_success_result_for_create() {
        let r = build_seed_success_result("users", SeedDecision::Create);
        assert_eq!(
            r,
            SeedResult {
                name: "users".to_string(),
                action: "create".to_string(),
                rows: String::new(),
                message: "ok".to_string(),
            },
            "Create success must map to action=create, message=ok"
        );
    }

    #[test]
    fn build_seed_success_result_for_update() {
        let r = build_seed_success_result("users", SeedDecision::Update);
        assert_eq!(
            r,
            SeedResult {
                name: "users".to_string(),
                action: "update".to_string(),
                rows: String::new(),
                message: "ok".to_string(),
            },
            "Update success must map to action=update, message=ok"
        );
    }

    #[test]
    fn build_seed_error_result_passes_message_through() {
        let r = build_seed_error_result("users", "boom: bad csv");
        assert_eq!(
            r,
            SeedResult {
                name: "users".to_string(),
                action: "error".to_string(),
                rows: String::new(),
                message: "boom: bad csv".to_string(),
            },
            "error result must use action=error and pass message through"
        );
    }
}
