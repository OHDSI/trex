//! Execute SQL on Arrow RecordBatches via the DuckDB `arrow()` table function.
//! Ensures full trexsql SQL compatibility for post-join expressions, window
//! functions, and other trexsql-specific syntax.

use std::sync::Arc;

use arrow::array::RecordBatch;
use arrow::compute::concat_batches;
use arrow::datatypes::SchemaRef;
use duckdb::vtab::arrow::{ArrowBatchRegistration, ArrowVTab};

pub struct FinalPassResult {
    pub schema: SchemaRef,
    pub batches: Vec<RecordBatch>,
}

/// Run `outer_sql` against Arrow batches. Rewrites `_result` references to
/// use the `arrow()` table function.
pub fn execute_final_pass(
    batches: Vec<RecordBatch>,
    schema: &SchemaRef,
    outer_sql: &str,
) -> Result<FinalPassResult, String> {
    let rewritten = rewrite_with_arrow_source(outer_sql, "_result");
    execute_on_connection(batches, schema, &rewritten)
}

/// Like [`execute_final_pass`] but uses `_data` as the table alias.
pub fn execute_sql_on_batches(
    batches: Vec<RecordBatch>,
    schema: &SchemaRef,
    sql: &str,
) -> Result<FinalPassResult, String> {
    let rewritten = rewrite_with_arrow_source(sql, "_data");
    execute_on_connection(batches, schema, &rewritten)
}

/// Function names (uppercased, matched as substrings) that route a query
/// through the DuckDB final pass.
const DUCKDB_ONLY_FUNCTIONS: &[&str] = &[
    "LIST_AGGREGATE",
    "LIST_SORT",
    "LIST_DISTINCT",
    "LIST_UNIQUE",
    "STRUCT_PACK",
    "STRUCT_INSERT",
    "STRUCT_EXTRACT",
    "REGEXP_MATCHES",
    "REGEXP_REPLACE",
    "REGEXP_EXTRACT",
    "STRING_SPLIT",
    "STRING_SPLIT_REGEX",
    "ARRAY_AGG",
    "ARRAY_SLICE",
    "MAP",
    "MAP_KEYS",
    "MAP_VALUES",
    "UNNEST",
    "GENERATE_SERIES",
    "EPOCH_MS",
    "EPOCH_US",
    "TRY_CAST",
    "IF(",
    "HASH(",
    "MD5(",
    "SHA256(",
];

/// Returns `true` if the query uses trexsql-specific functions that
/// DataFusion cannot execute natively.
pub fn needs_final_pass(sql: &str) -> bool {
    let upper = sql.to_uppercase();
    DUCKDB_ONLY_FUNCTIONS.iter().any(|f| upper.contains(f))
}

/// Replace the first `FROM {table_ref}` with `FROM (SELECT * FROM trex_db_arrow(?)) AS {table_ref}`.
/// Case-insensitive search for the FROM keyword.
pub fn rewrite_with_arrow_source(sql: &str, table_ref: &str) -> String {
    let upper = sql.to_uppercase();
    let needle = format!("FROM {}", table_ref.to_uppercase());
    if let Some(pos) = upper.find(&needle) {
        let replacement = format!("FROM (SELECT * FROM trex_db_arrow(?)) AS {table_ref}");
        format!("{}{}{}", &sql[..pos], replacement, &sql[pos + needle.len()..])
    } else {
        sql.to_string()
    }
}

fn execute_on_connection(
    batches: Vec<RecordBatch>,
    schema: &SchemaRef,
    sql: &str,
) -> Result<FinalPassResult, String> {
    if batches.is_empty() {
        return Ok(FinalPassResult {
            schema: Arc::new(arrow::datatypes::Schema::empty()),
            batches: vec![],
        });
    }

    let merged = concat_batches(schema, &batches)
        .map_err(|e| format!("Failed to concatenate record batches: {e}"))?;

    crate::local_connections::with_connection(|conn| {
        // Re-registered on every call over pooled connections; "already exists" is expected.
        let _ = conn.register_table_function::<ArrowVTab>("trex_db_arrow");

        let batch = ArrowBatchRegistration::new(merged);
        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("Failed to prepare final pass SQL: {e}"))?;

        let result_batches: Vec<RecordBatch> = stmt
            .query_arrow([&batch])
            .map_err(|e| format!("Failed to execute final pass SQL: {e}"))?
            .collect();

        let result_schema = result_batches
            .first()
            .map(|b| b.schema())
            .unwrap_or_else(|| Arc::new(arrow::datatypes::Schema::empty()));

        Ok(FinalPassResult {
            schema: result_schema,
            batches: result_batches,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_replaces_table_ref() {
        let sql = "SELECT a, b FROM _result WHERE a > 1";
        let rewritten = rewrite_with_arrow_source(sql, "_result");
        assert_eq!(
            rewritten,
            "SELECT a, b FROM (SELECT * FROM trex_db_arrow(?)) AS _result WHERE a > 1"
        );
    }

    #[test]
    fn rewrite_replaces_only_first_occurrence() {
        let sql = "SELECT * FROM _data UNION ALL SELECT * FROM _data";
        let rewritten = rewrite_with_arrow_source(sql, "_data");
        assert!(rewritten.starts_with(
            "SELECT * FROM (SELECT * FROM trex_db_arrow(?)) AS _data"
        ));
        assert!(rewritten.ends_with("SELECT * FROM _data"));
    }

    #[test]
    fn execute_final_pass_empty_batches() {
        let schema = Arc::new(arrow::datatypes::Schema::empty());
        let result = execute_final_pass(vec![], &schema, "SELECT * FROM _result").unwrap();
        assert!(result.batches.is_empty());
    }

    #[test]
    fn test_needs_final_pass_duckdb_functions() {
        assert!(needs_final_pass("SELECT list_aggregate(col, 'sum') FROM t"));
        assert!(needs_final_pass("SELECT list_sort(my_list) FROM t"));
        assert!(needs_final_pass("SELECT list_distinct(arr) FROM t"));
        assert!(needs_final_pass("SELECT list_unique(arr) FROM t"));
        assert!(needs_final_pass("SELECT struct_pack(a := 1, b := 2)"));
        assert!(needs_final_pass("SELECT struct_insert(s, c := 3) FROM t"));
        assert!(needs_final_pass("SELECT struct_extract(s, 'a') FROM t"));
        assert!(needs_final_pass("SELECT regexp_matches(col, '\\d+') FROM t"));
        assert!(needs_final_pass("SELECT regexp_replace(col, '\\d', 'X') FROM t"));
        assert!(needs_final_pass("SELECT regexp_extract(col, '(\\d+)') FROM t"));
        assert!(needs_final_pass("SELECT string_split(col, ',') FROM t"));
        assert!(needs_final_pass("SELECT string_split_regex(col, '\\s+') FROM t"));
        assert!(needs_final_pass("SELECT array_agg(col) FROM t"));
        assert!(needs_final_pass("SELECT array_slice(arr, 1, 3) FROM t"));
        assert!(needs_final_pass("SELECT map([1,2], ['a','b'])"));
        assert!(needs_final_pass("SELECT map_keys(m) FROM t"));
        assert!(needs_final_pass("SELECT map_values(m) FROM t"));
        assert!(needs_final_pass("SELECT unnest(arr) FROM t"));
        assert!(needs_final_pass("SELECT * FROM generate_series(1, 10)"));
        assert!(needs_final_pass("SELECT epoch_ms(ts) FROM t"));
        assert!(needs_final_pass("SELECT epoch_us(ts) FROM t"));
        assert!(needs_final_pass("SELECT try_cast('abc' AS INTEGER)"));
        assert!(needs_final_pass("SELECT if(x > 0, 'pos', 'neg') FROM t"));
        assert!(needs_final_pass("SELECT hash(col) FROM t"));
        assert!(needs_final_pass("SELECT md5(col) FROM t"));
        assert!(needs_final_pass("SELECT sha256(col) FROM t"));
    }

    #[test]
    fn test_needs_final_pass_standard_sql() {
        assert!(!needs_final_pass("SELECT a, b FROM t WHERE a > 1"));
        assert!(!needs_final_pass("SELECT a FROM t1 JOIN t2 ON t1.id = t2.id"));
        assert!(!needs_final_pass("SELECT a, COUNT(*) FROM t GROUP BY a"));
        assert!(!needs_final_pass("SELECT * FROM t ORDER BY a DESC LIMIT 10"));
        assert!(!needs_final_pass("SELECT SUM(a), AVG(b) FROM t"));
        assert!(!needs_final_pass("SELECT DISTINCT a FROM t"));
        assert!(!needs_final_pass(
            "SELECT a, b FROM t1 INNER JOIN t2 ON t1.id = t2.id WHERE t1.x > 5"
        ));
        assert!(!needs_final_pass("SELECT CAST(a AS VARCHAR) FROM t"));
        assert!(!needs_final_pass("SELECT COALESCE(a, b) FROM t"));
        assert!(!needs_final_pass("SELECT CASE WHEN x > 0 THEN 'a' ELSE 'b' END FROM t"));
    }

    #[test]
    fn test_needs_final_pass_case_insensitive() {
        assert!(needs_final_pass("SELECT list_aggregate(col, 'sum') FROM t"));
        assert!(needs_final_pass("SELECT LIST_AGGREGATE(col, 'sum') FROM t"));
        assert!(needs_final_pass("SELECT List_Aggregate(col, 'sum') FROM t"));
        assert!(needs_final_pass("select try_cast('1' as integer)"));
        assert!(needs_final_pass("SELECT Regexp_Matches(col, '\\d+') FROM t"));
        assert!(needs_final_pass("select md5(col) from t"));
        assert!(needs_final_pass("SELECT Hash(col) FROM t"));
    }

    // Pins the `duckdb_functions()` column this check reads and that every
    // name in DUCKDB_ONLY_FUNCTIONS (bar the TRY_CAST keyword) is still a function.
    #[test]
    #[ignore = "needs the DuckDB C API table, which only a real extension LOAD initialises; verified on the 2.0 CLI"]
    fn duckdb_functions_columns_present() {
        let conn = duckdb::Connection::open_in_memory().expect("open in-memory duckdb");
        let mut stmt = conn
            .prepare("SELECT column_name FROM (DESCRIBE SELECT * FROM duckdb_functions())")
            .unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(columns.iter().any(|c| c == "function_name"), "{columns:?}");

        for f in DUCKDB_ONLY_FUNCTIONS.iter().filter(|f| **f != "TRY_CAST") {
            let name = f.trim_end_matches('(').to_lowercase();
            let n: i64 = conn
                .query_row(
                    "SELECT count(*) FROM duckdb_functions() WHERE function_name = ?",
                    [&name],
                    |r| r.get(0),
                )
                .unwrap();
            assert!(n > 0, "{name} missing from duckdb_functions()");
        }
    }
}
