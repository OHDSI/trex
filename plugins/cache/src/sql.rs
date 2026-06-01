/// Quote a SQL identifier, doubling any embedded double-quotes.
pub fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

/// Escape a value for embedding inside a single-quoted SQL literal.
fn lit(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn create_schema(target: &str) -> String {
    format!("CREATE SCHEMA IF NOT EXISTS {}", quote_ident(target))
}

/// List user tables of an attached catalog/schema via DuckDB's catalog view.
/// Uniform across all native-scanner dialects.
pub fn list_tables_sql(alias: &str, schema: &str) -> String {
    format!(
        "SELECT table_name FROM duckdb_tables() \
         WHERE database_name = '{}' AND schema_name = '{}' ORDER BY table_name",
        lit(alias),
        lit(schema)
    )
}

/// Snapshot one source table into the target schema (drop + recreate).
pub fn copy_table(target: &str, table: &str, source_ref: &str) -> String {
    format!(
        "CREATE OR REPLACE TABLE {}.{} AS SELECT * FROM {}",
        quote_ident(target),
        quote_ident(table),
        source_ref
    )
}

pub fn count_rows(target: &str, table: &str) -> String {
    format!(
        "SELECT CAST(count(*) AS VARCHAR) FROM {}.{}",
        quote_ident(target),
        quote_ident(table)
    )
}
