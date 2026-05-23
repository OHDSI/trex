use crate::parser::{rewrite_table_references, rewrite_table_references_dual};
use crate::project::load_project;
use crate::{escape_sql_ident, query_sql};
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use std::collections::HashSet;
use std::error::Error;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TestResult {
    name: String,
    status: String,
    rows_returned: String,
    message: String,
}

pub(crate) enum TestKind {
    Data,
    Column { test_type: String },
}

/// Build the SQL string for a column test (`not_null` or `unique`).
/// Pure: applies `escape_sql_ident` to schema, table, and column.
/// Returns `Err("Unknown test type: {test_type}")` for unrecognised types.
pub(crate) fn build_column_test_sql(
    schema: &str,
    table: &str,
    column: &str,
    test_type: &str,
) -> Result<String, String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_table = escape_sql_ident(table);
    let esc_col = escape_sql_ident(column);

    match test_type {
        "not_null" => Ok(format!(
            "SELECT \"{esc_col}\" FROM \"{esc_schema}\".\"{esc_table}\" WHERE \"{esc_col}\" IS NULL"
        )),
        "unique" => Ok(format!(
            "SELECT \"{esc_col}\", COUNT(*) as cnt \
             FROM \"{esc_schema}\".\"{esc_table}\" \
             GROUP BY \"{esc_col}\" HAVING COUNT(*) > 1"
        )),
        other => Err(format!("Unknown test type: {}", other)),
    }
}

/// Convert a query outcome into the `TestResult` row for either a data-test
/// or a column-test. Pure: no I/O.
pub(crate) fn evaluate_test_outcome(
    name: String,
    rows: Result<usize, String>,
    kind: TestKind,
) -> TestResult {
    match rows {
        Ok(count) => {
            let status = if count == 0 { "pass" } else { "fail" };
            let message = if count > 0 {
                match &kind {
                    TestKind::Data => {
                        format!("Test returned {} rows (expected 0)", count)
                    }
                    TestKind::Column { test_type } => {
                        format!("{} test failed: {} rows with violations", test_type, count)
                    }
                }
            } else {
                String::new()
            };
            TestResult {
                name,
                status: status.to_string(),
                rows_returned: count.to_string(),
                message,
            }
        }
        Err(e) => TestResult {
            name,
            status: "error".to_string(),
            rows_returned: String::new(),
            message: e,
        },
    }
}

fn run_tests(path: &str, schema: &str, source_schema: Option<&str>) -> Result<Vec<TestResult>, Box<dyn Error>> {
    let project = load_project(path)?;
    let mut results = Vec::new();

    let known_names: HashSet<String> = project
        .models
        .iter()
        .map(|m| m.name.clone())
        .chain(project.seeds.iter().map(|s| s.name.clone()))
        .collect();

    let src_names: Option<HashSet<String>> = source_schema.map(|_| {
        project.source_tables.iter().cloned().collect()
    });

    for test in &project.tests {
        let rewritten = if let (Some(sn), Some(ss)) = (&src_names, source_schema) {
            rewrite_table_references_dual(&test.sql, &known_names, sn, schema, ss)?
        } else {
            rewrite_table_references(&test.sql, &known_names, schema)?
        };
        let rows = query_sql(&rewritten)
            .map(|r| r.len())
            .map_err(|e| format!("{}", e));
        results.push(evaluate_test_outcome(
            test.name.clone(),
            rows,
            TestKind::Data,
        ));
    }

    for model in &project.models {
        for col_test in &model.column_tests {
            for test_type in &col_test.tests {
                let test_name = format!("{}_{}", model.name, col_test.name);

                let sql = match build_column_test_sql(
                    schema,
                    &model.name,
                    &col_test.name,
                    test_type.as_str(),
                ) {
                    Ok(sql) => sql,
                    Err(msg) => {
                        // Preserve the original quirk: the unknown-test-type row's
                        // name includes the offending `test_type` as a 3rd field.
                        results.push(evaluate_test_outcome(
                            format!("{}_{}_{}", model.name, col_test.name, test_type),
                            Err(msg),
                            TestKind::Column { test_type: test_type.clone() },
                        ));
                        continue;
                    }
                };

                let rows = query_sql(&sql)
                    .map(|r| r.len())
                    .map_err(|e| format!("{}", e));
                results.push(evaluate_test_outcome(
                    format!("{}_{}", test_name, test_type),
                    rows,
                    TestKind::Column { test_type: test_type.clone() },
                ));
            }
        }
    }

    Ok(results)
}

#[repr(C)]
pub struct TestBindData {
    path: String,
    schema: String,
    source_schema: Option<String>,
}

#[repr(C)]
pub struct TestInitData {
    results: Vec<TestResult>,
    index: AtomicUsize,
}

pub struct TestVTab;

impl VTab for TestVTab {
    type InitData = TestInitData;
    type BindData = TestBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "rows_returned",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("message", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        let source_schema = bind
            .get_named_parameter("source_schema")
            .map(|v| v.to_string())
            .filter(|s| !s.is_empty());
        Ok(TestBindData { path, schema, source_schema })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema, source_schema) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
                (*bind_data).source_schema.clone(),
            )
        };

        let results = run_tests(&path, &schema, source_schema.as_deref())?;

        Ok(TestInitData {
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

        let status_vector = output.flat_vector(1);
        status_vector.insert(0, result.status.as_str());

        let rows_vector = output.flat_vector(2);
        rows_vector.insert(0, result.rows_returned.as_str());

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

    fn named_parameters() -> Option<Vec<(String, LogicalTypeHandle)>> {
        Some(vec![
            ("source_schema".to_string(), LogicalTypeHandle::from(LogicalTypeId::Varchar)),
        ])
    }
}

#[cfg(test)]
mod test_tests {
    use super::*;

    #[test]
    fn build_column_test_sql_not_null_emits_is_null_query() {
        let sql = build_column_test_sql("main", "orders", "user_id", "not_null").unwrap();
        assert_eq!(
            sql,
            "SELECT \"user_id\" FROM \"main\".\"orders\" WHERE \"user_id\" IS NULL"
        );
    }

    #[test]
    fn build_column_test_sql_unique_emits_group_by_having_query() {
        let sql = build_column_test_sql("main", "orders", "user_id", "unique").unwrap();
        assert_eq!(
            sql,
            "SELECT \"user_id\", COUNT(*) as cnt \
             FROM \"main\".\"orders\" \
             GROUP BY \"user_id\" HAVING COUNT(*) > 1"
        );
    }

    #[test]
    fn build_column_test_sql_doubles_embedded_quotes_in_identifiers() {
        // Embedded `"` in any of schema/table/column must be doubled.
        let sql = build_column_test_sql("we\"ird", "ta\"ble", "co\"l", "not_null").unwrap();
        assert_eq!(
            sql,
            "SELECT \"co\"\"l\" FROM \"we\"\"ird\".\"ta\"\"ble\" WHERE \"co\"\"l\" IS NULL"
        );
    }

    #[test]
    fn build_column_test_sql_unknown_type_returns_err() {
        let err = build_column_test_sql("main", "orders", "user_id", "foo").unwrap_err();
        assert_eq!(err, "Unknown test type: foo");
    }

    #[test]
    fn evaluate_test_outcome_data_zero_rows_passes_with_empty_message() {
        let r = evaluate_test_outcome("t1".to_string(), Ok(0), TestKind::Data);
        assert_eq!(
            r,
            TestResult {
                name: "t1".to_string(),
                status: "pass".to_string(),
                rows_returned: "0".to_string(),
                message: String::new(),
            }
        );
    }

    #[test]
    fn evaluate_test_outcome_data_nonzero_rows_fails_with_count_message() {
        let r = evaluate_test_outcome("t1".to_string(), Ok(5), TestKind::Data);
        assert_eq!(
            r,
            TestResult {
                name: "t1".to_string(),
                status: "fail".to_string(),
                rows_returned: "5".to_string(),
                message: "Test returned 5 rows (expected 0)".to_string(),
            }
        );
    }

    #[test]
    fn evaluate_test_outcome_data_err_yields_error_status_and_empty_rows() {
        let r = evaluate_test_outcome(
            "t1".to_string(),
            Err("boom".to_string()),
            TestKind::Data,
        );
        assert_eq!(
            r,
            TestResult {
                name: "t1".to_string(),
                status: "error".to_string(),
                rows_returned: String::new(),
                message: "boom".to_string(),
            }
        );
    }

    #[test]
    fn evaluate_test_outcome_column_not_null_zero_rows_passes() {
        let r = evaluate_test_outcome(
            "orders_user_id_not_null".to_string(),
            Ok(0),
            TestKind::Column { test_type: "not_null".to_string() },
        );
        assert_eq!(r.status, "pass");
        assert_eq!(r.rows_returned, "0");
        assert_eq!(r.message, "");
    }

    #[test]
    fn evaluate_test_outcome_column_not_null_nonzero_uses_column_message() {
        let r = evaluate_test_outcome(
            "orders_user_id_not_null".to_string(),
            Ok(3),
            TestKind::Column { test_type: "not_null".to_string() },
        );
        assert_eq!(r.status, "fail");
        assert_eq!(r.rows_returned, "3");
        assert_eq!(r.message, "not_null test failed: 3 rows with violations");
    }

    #[test]
    fn evaluate_test_outcome_column_unique_err_yields_error_status() {
        let r = evaluate_test_outcome(
            "orders_user_id_unique".to_string(),
            Err("query failed".to_string()),
            TestKind::Column { test_type: "unique".to_string() },
        );
        assert_eq!(r.status, "error");
        assert_eq!(r.rows_returned, "");
        assert_eq!(r.message, "query failed");
    }

    #[test]
    fn evaluate_test_outcome_preserves_name_passthrough() {
        // Name supplied by caller flows straight through, regardless of kind.
        let r = evaluate_test_outcome(
            "custom_synthetic_name".to_string(),
            Ok(0),
            TestKind::Column { test_type: "not_null".to_string() },
        );
        assert_eq!(r.name, "custom_synthetic_name");
    }

    #[test]
    fn evaluate_test_outcome_column_unique_nonzero_uses_unique_test_type_in_message() {
        // Locks in that the `test_type` string is interpolated verbatim.
        let r = evaluate_test_outcome(
            "orders_user_id_unique".to_string(),
            Ok(7),
            TestKind::Column { test_type: "unique".to_string() },
        );
        assert_eq!(r.message, "unique test failed: 7 rows with violations");
    }
}
