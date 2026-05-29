use crate::{escape_sql_ident, escape_sql_str, execute_sql, query_sql, QueryRow};
use std::collections::HashMap;
use std::error::Error;

#[derive(Debug, Clone)]
pub struct ModelState {
    pub model_name: String,
    pub materialized: String,
    pub checksum: String,
    #[allow(dead_code)]
    pub deployed_at: String,
    #[allow(dead_code)]
    pub incremental_strategy: Option<String>,
    pub last_watermark: Option<String>,
}

fn build_ensure_state_table_sql(schema: &str) -> Vec<String> {
    let esc = escape_sql_ident(schema);
    vec![
        format!(
            "CREATE TABLE IF NOT EXISTS \"{esc}\".\"_transform_state\" (\
                model_name VARCHAR PRIMARY KEY,\
                materialized VARCHAR NOT NULL,\
                checksum VARCHAR NOT NULL,\
                deployed_at VARCHAR NOT NULL\
            );"
        ),
        format!(
            "ALTER TABLE \"{esc}\".\"_transform_state\" ADD COLUMN IF NOT EXISTS incremental_strategy VARCHAR"
        ),
        format!(
            "ALTER TABLE \"{esc}\".\"_transform_state\" ADD COLUMN IF NOT EXISTS last_watermark VARCHAR"
        ),
    ]
}

pub fn ensure_state_table(schema: &str) -> Result<(), Box<dyn Error>> {
    for sql in build_ensure_state_table_sql(schema) {
        execute_sql(&sql)?;
    }
    Ok(())
}

fn build_query_state_sql(schema: &str) -> String {
    format!(
        "SELECT model_name, materialized, checksum, deployed_at, \
         incremental_strategy, last_watermark \
         FROM \"{}\".\"_transform_state\" ORDER BY model_name",
        escape_sql_ident(schema)
    )
}

fn parse_state_rows(rows: Vec<QueryRow>) -> HashMap<String, ModelState> {
    let mut map = HashMap::new();
    for row in rows {
        if row.columns.len() < 4 {
            continue;
        }
        let incremental_strategy = row
            .columns
            .get(4)
            .filter(|s| !s.is_empty())
            .cloned();
        let last_watermark = row
            .columns
            .get(5)
            .filter(|s| !s.is_empty())
            .cloned();
        let state = ModelState {
            model_name: row.columns[0].clone(),
            materialized: row.columns[1].clone(),
            checksum: row.columns[2].clone(),
            deployed_at: row.columns[3].clone(),
            incremental_strategy,
            last_watermark,
        };
        map.insert(state.model_name.clone(), state);
    }
    map
}

pub fn query_state(schema: &str) -> Result<HashMap<String, ModelState>, Box<dyn Error>> {
    let rows = query_sql(&build_query_state_sql(schema)).unwrap_or_default();
    Ok(parse_state_rows(rows))
}

fn build_upsert_state_sql(
    schema: &str,
    model_name: &str,
    materialized: &str,
    checksum: &str,
    deployed_at: &str,
    incremental_strategy: Option<&str>,
    last_watermark: Option<&str>,
) -> Vec<String> {
    let strategy_val = match incremental_strategy {
        Some(s) => format!("'{}'", escape_sql_str(s)),
        None => "NULL".to_string(),
    };
    let watermark_val = match last_watermark {
        Some(w) => format!("'{}'", escape_sql_str(w)),
        None => "NULL".to_string(),
    };
    vec![format!(
        "INSERT OR REPLACE INTO \"{schema}\".\"_transform_state\" \
         (model_name, materialized, checksum, deployed_at, incremental_strategy, last_watermark) \
         VALUES ('{name}', '{mat}', '{cksum}', '{deployed}', {strategy}, {watermark})",
        schema = escape_sql_ident(schema),
        name = escape_sql_str(model_name),
        mat = escape_sql_str(materialized),
        cksum = escape_sql_str(checksum),
        deployed = escape_sql_str(deployed_at),
        strategy = strategy_val,
        watermark = watermark_val,
    )]
}

pub fn upsert_state(
    schema: &str,
    model_name: &str,
    materialized: &str,
    checksum: &str,
    deployed_at: &str,
    incremental_strategy: Option<&str>,
    last_watermark: Option<&str>,
) -> Result<(), Box<dyn Error>> {
    for sql in build_upsert_state_sql(
        schema,
        model_name,
        materialized,
        checksum,
        deployed_at,
        incremental_strategy,
        last_watermark,
    ) {
        execute_sql(&sql)?;
    }
    Ok(())
}

fn build_delete_state_sql(schema: &str, model_name: &str) -> Vec<String> {
    vec![format!(
        "DELETE FROM \"{schema}\".\"_transform_state\" WHERE model_name = '{name}'",
        schema = escape_sql_ident(schema),
        name = escape_sql_str(model_name),
    )]
}

pub fn delete_state(schema: &str, model_name: &str) -> Result<(), Box<dyn Error>> {
    for sql in build_delete_state_sql(schema, model_name) {
        execute_sql(&sql)?;
    }
    Ok(())
}

#[cfg(test)]
mod state_tests {
    use super::*;

    #[test]
    fn build_ensure_state_table_sql_emits_three_statements() {
        let stmts = build_ensure_state_table_sql("main");
        assert_eq!(stmts.len(), 3, "expected exactly 3 DDL statements");
        assert!(
            stmts[0].starts_with("CREATE TABLE IF NOT EXISTS \"main\".\"_transform_state\""),
            "create stmt mismatch: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("model_name VARCHAR PRIMARY KEY"),
            "create stmt missing PK column: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("materialized VARCHAR NOT NULL")
                && stmts[0].contains("checksum VARCHAR NOT NULL")
                && stmts[0].contains("deployed_at VARCHAR NOT NULL"),
            "create stmt missing required columns: {}",
            stmts[0]
        );
        assert_eq!(
            stmts[1],
            "ALTER TABLE \"main\".\"_transform_state\" ADD COLUMN IF NOT EXISTS incremental_strategy VARCHAR",
        );
        assert_eq!(
            stmts[2],
            "ALTER TABLE \"main\".\"_transform_state\" ADD COLUMN IF NOT EXISTS last_watermark VARCHAR",
        );
    }

    #[test]
    fn build_ensure_state_table_sql_escapes_schema_identifier() {
        let stmts = build_ensure_state_table_sql("we\"ird");
        for stmt in &stmts {
            assert!(
                stmt.contains("\"we\"\"ird\".\"_transform_state\""),
                "schema with embedded quote should be doubled: {stmt}"
            );
        }
    }

    #[test]
    fn build_query_state_sql_matches_exact_select() {
        let sql = build_query_state_sql("main");
        assert_eq!(
            sql,
            "SELECT model_name, materialized, checksum, deployed_at, \
             incremental_strategy, last_watermark \
             FROM \"main\".\"_transform_state\" ORDER BY model_name",
        );
    }

    #[test]
    fn build_query_state_sql_escapes_schema_identifier() {
        let sql = build_query_state_sql("we\"ird");
        assert!(
            sql.contains("FROM \"we\"\"ird\".\"_transform_state\""),
            "embedded double-quote should be escaped: {sql}"
        );
    }

    #[test]
    fn build_upsert_state_sql_with_strategy_and_watermark() {
        let stmts = build_upsert_state_sql(
            "main",
            "users",
            "table",
            "abc123",
            "2026-01-01",
            Some("append"),
            Some("2025-12-31"),
        );
        assert_eq!(stmts.len(), 1);
        assert_eq!(
            stmts[0],
            "INSERT OR REPLACE INTO \"main\".\"_transform_state\" \
             (model_name, materialized, checksum, deployed_at, incremental_strategy, last_watermark) \
             VALUES ('users', 'table', 'abc123', '2026-01-01', 'append', '2025-12-31')",
        );
    }

    #[test]
    fn build_upsert_state_sql_with_neither_renders_null_unquoted() {
        let stmts = build_upsert_state_sql(
            "main",
            "users",
            "table",
            "abc123",
            "2026-01-01",
            None,
            None,
        );
        assert_eq!(stmts.len(), 1);
        // NULL must be bare (unquoted) so DuckDB treats it as the SQL null literal.
        assert!(
            stmts[0].ends_with(", NULL, NULL)"),
            "trailing NULLs should be unquoted: {}",
            stmts[0]
        );
        assert!(
            !stmts[0].contains("'NULL'"),
            "NULL must not be quoted as a string: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_upsert_state_sql_with_only_strategy() {
        let stmts = build_upsert_state_sql(
            "main",
            "users",
            "table",
            "abc123",
            "2026-01-01",
            Some("merge"),
            None,
        );
        assert!(
            stmts[0].ends_with(", 'merge', NULL)"),
            "expected strategy quoted, watermark NULL: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_upsert_state_sql_with_only_watermark() {
        let stmts = build_upsert_state_sql(
            "main",
            "users",
            "table",
            "abc123",
            "2026-01-01",
            None,
            Some("2025-12-31"),
        );
        assert!(
            stmts[0].ends_with(", NULL, '2025-12-31')"),
            "expected strategy NULL, watermark quoted: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_upsert_state_sql_escapes_identifiers_and_values() {
        let stmts = build_upsert_state_sql(
            "we\"ird",
            "o'reilly",
            "table",
            "ab'c",
            "2026-01-01",
            Some("it's"),
            Some("w'm"),
        );
        // Schema identifier: embedded " is doubled.
        assert!(
            stmts[0].contains("\"we\"\"ird\".\"_transform_state\""),
            "schema escape missing: {}",
            stmts[0]
        );
        // String values: embedded ' is doubled.
        assert!(
            stmts[0].contains("'o''reilly'"),
            "model name escape missing: {}",
            stmts[0]
        );
        assert!(stmts[0].contains("'ab''c'"), "checksum escape missing: {}", stmts[0]);
        assert!(stmts[0].contains("'it''s'"), "strategy escape missing: {}", stmts[0]);
        assert!(stmts[0].contains("'w''m'"), "watermark escape missing: {}", stmts[0]);
    }

    #[test]
    fn build_delete_state_sql_basic() {
        let stmts = build_delete_state_sql("main", "users");
        assert_eq!(stmts.len(), 1);
        assert_eq!(
            stmts[0],
            "DELETE FROM \"main\".\"_transform_state\" WHERE model_name = 'users'",
        );
    }

    #[test]
    fn build_delete_state_sql_escapes_identifier_and_value() {
        let stmts = build_delete_state_sql("we\"ird", "o'reilly");
        assert_eq!(
            stmts[0],
            "DELETE FROM \"we\"\"ird\".\"_transform_state\" WHERE model_name = 'o''reilly'",
        );
    }

    #[test]
    fn parse_state_rows_empty_input_yields_empty_map() {
        let map = parse_state_rows(Vec::new());
        assert!(map.is_empty(), "empty input must produce empty map");
    }

    #[test]
    fn parse_state_rows_populates_all_fields_when_present() {
        let rows = vec![QueryRow {
            columns: vec![
                "users".to_string(),
                "table".to_string(),
                "abc123".to_string(),
                "2026-01-01".to_string(),
                "append".to_string(),
                "2025-12-31".to_string(),
            ],
        }];
        let map = parse_state_rows(rows);
        assert_eq!(map.len(), 1);
        let state = map.get("users").expect("users entry must exist");
        assert_eq!(state.model_name, "users");
        assert_eq!(state.materialized, "table");
        assert_eq!(state.checksum, "abc123");
        assert_eq!(state.deployed_at, "2026-01-01");
        assert_eq!(state.incremental_strategy.as_deref(), Some("append"));
        assert_eq!(state.last_watermark.as_deref(), Some("2025-12-31"));
    }

    #[test]
    fn parse_state_rows_treats_empty_optional_strings_as_none() {
        let rows = vec![QueryRow {
            columns: vec![
                "users".to_string(),
                "table".to_string(),
                "abc123".to_string(),
                "2026-01-01".to_string(),
                "".to_string(),
                "".to_string(),
            ],
        }];
        let map = parse_state_rows(rows);
        let state = map.get("users").expect("users entry must exist");
        assert!(
            state.incremental_strategy.is_none(),
            "empty incremental_strategy must become None"
        );
        assert!(
            state.last_watermark.is_none(),
            "empty last_watermark must become None"
        );
    }

    #[test]
    fn parse_state_rows_skips_rows_with_fewer_than_four_columns() {
        let rows = vec![
            QueryRow {
                columns: vec![
                    "short".to_string(),
                    "table".to_string(),
                    "abc".to_string(),
                ],
            },
            QueryRow {
                columns: vec![
                    "ok".to_string(),
                    "table".to_string(),
                    "def".to_string(),
                    "2026-01-01".to_string(),
                ],
            },
        ];
        let map = parse_state_rows(rows);
        assert_eq!(map.len(), 1, "row with <4 columns must be skipped");
        assert!(map.contains_key("ok"));
        assert!(!map.contains_key("short"));
        // The 4-column row has no optional fields available; both should be None.
        let state = map.get("ok").unwrap();
        assert!(state.incremental_strategy.is_none());
        assert!(state.last_watermark.is_none());
    }
}
