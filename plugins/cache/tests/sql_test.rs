use cache::exec::string_column_0;
use cache::sql::{copy_table, count_rows, create_schema, list_tables_sql, quote_ident};
use std::sync::Arc;
use trex_pool_client::arrow_array::{ArrayRef, RecordBatch, StringArray};
use trex_pool_client::arrow_schema::{DataType, Field, Schema};

#[test]
fn quote_ident_wraps_and_doubles_quotes() {
    assert_eq!(quote_ident("orders"), "\"orders\"");
    assert_eq!(quote_ident("we\"ird"), "\"we\"\"ird\"");
}

#[test]
fn create_schema_is_if_not_exists() {
    assert_eq!(create_schema("pg_cache"), "CREATE SCHEMA IF NOT EXISTS \"pg_cache\"");
}

#[test]
fn list_tables_sql_filters_by_database_and_schema() {
    assert_eq!(
        list_tables_sql("src_1", "public"),
        "SELECT table_name FROM duckdb_tables() \
         WHERE database_name = 'src_1' AND schema_name = 'public' ORDER BY table_name"
    );
}

#[test]
fn copy_table_uses_create_or_replace() {
    assert_eq!(
        copy_table("pg_cache", "orders", "\"src_1\".\"public\".\"orders\""),
        "CREATE OR REPLACE TABLE \"pg_cache\".\"orders\" AS SELECT * FROM \"src_1\".\"public\".\"orders\""
    );
}

#[test]
fn count_rows_targets_the_cached_table() {
    assert_eq!(
        count_rows("pg_cache", "orders"),
        "SELECT CAST(count(*) AS VARCHAR) FROM \"pg_cache\".\"orders\""
    );
}

#[test]
fn string_column_0_extracts_non_null_values() {
    let schema = Arc::new(Schema::new(vec![Field::new("table_name", DataType::Utf8, true)]));
    let col: ArrayRef = Arc::new(StringArray::from(vec![Some("orders"), None, Some("users")]));
    let batch = RecordBatch::try_new(schema, vec![col]).unwrap();

    let out = string_column_0(&[batch]).unwrap();
    assert_eq!(out, vec!["orders".to_string(), "users".to_string()]);
}
