use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use etl_lib::destination::Destination;
use etl_lib::error::EtlResult;
use etl_lib::types::{Event, TableId, TableRow};
use etl_postgres::types::{ColumnSchema, TableSchema};

use crate::pipeline_registry;
use crate::type_mapping::{cell_to_sql_literal, pg_type_to_duckdb};

/// trexsql destination for the Supabase ETL pipeline.
///
/// Implements the ETL `Destination` trait, writing CDC events and table rows
/// into the local trexsql database via the shared trex_pool write queue.
#[derive(Clone)]
pub struct DuckDbDestination {
    pipeline_name: String,
    schemas: Arc<Mutex<HashMap<TableId, TableSchema>>>,
}

impl DuckDbDestination {
    pub fn new(
        pipeline_name: String,
        schemas: Arc<Mutex<HashMap<TableId, TableSchema>>>,
    ) -> Self {
        Self {
            pipeline_name,
            schemas,
        }
    }

    fn execute_sql(&self, sql: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let session_id = trex_pool_client::create_session()
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { e.into() })?;
        let result = trex_pool_client::session_execute(session_id, sql);
        let _ = trex_pool_client::destroy_session(session_id);
        result
            .map(|_| ())
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { e.into() })
    }

    fn build_ensure_schema_sql(schema_name: &str) -> String {
        format!(
            "CREATE SCHEMA IF NOT EXISTS \"{}\"",
            schema_name.replace('"', "\"\"")
        )
    }

    fn ensure_schema(&self, schema_name: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.execute_sql(&Self::build_ensure_schema_sql(schema_name))
    }

    fn build_ensure_table_sql(table_schema: &TableSchema) -> String {
        let schema_name = &table_schema.name.schema;
        let table_name = &table_schema.name.name;

        let columns: Vec<String> = table_schema
            .column_schemas
            .iter()
            .map(|col| {
                let duckdb_type = pg_type_to_duckdb(&col.typ);
                format!(
                    "\"{}\" {}",
                    col.name.replace('"', "\"\""),
                    duckdb_type
                )
            })
            .collect();

        format!(
            "CREATE TABLE IF NOT EXISTS \"{}\".\"{}\" ({})",
            schema_name.replace('"', "\"\""),
            table_name.replace('"', "\"\""),
            columns.join(", ")
        )
    }

    fn ensure_table(
        &self,
        table_schema: &TableSchema,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.ensure_schema(&table_schema.name.schema)?;
        self.execute_sql(&Self::build_ensure_table_sql(table_schema))
    }

    fn build_schema_evolution_sqls(table_schema: &TableSchema) -> Vec<String> {
        let schema_name = &table_schema.name.schema;
        let table_name = &table_schema.name.name;

        table_schema
            .column_schemas
            .iter()
            .map(|col| {
                let duckdb_type = pg_type_to_duckdb(&col.typ);
                format!(
                    "ALTER TABLE \"{}\".\"{}\" ADD COLUMN IF NOT EXISTS \"{}\" {}",
                    schema_name.replace('"', "\"\""),
                    table_name.replace('"', "\"\""),
                    col.name.replace('"', "\"\""),
                    duckdb_type
                )
            })
            .collect()
    }

    fn handle_schema_evolution(
        &self,
        table_schema: &TableSchema,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        for sql in Self::build_schema_evolution_sqls(table_schema) {
            let _ = self.execute_sql(&sql);
        }
        Ok(())
    }

    fn build_insert_sql(
        &self,
        schema: &str,
        table: &str,
        columns: &[ColumnSchema],
        row: &TableRow,
    ) -> String {
        let col_names: Vec<String> = columns
            .iter()
            .map(|c| format!("\"{}\"", c.name.replace('"', "\"\"")))
            .collect();

        let values: Vec<String> = row.values.iter().map(|c| cell_to_sql_literal(c)).collect();

        format!(
            "INSERT INTO \"{}\".\"{}\" ({}) VALUES ({})",
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            col_names.join(", "),
            values.join(", ")
        )
    }

    fn build_update_sql(
        &self,
        schema: &str,
        table: &str,
        columns: &[ColumnSchema],
        row: &TableRow,
    ) -> Option<String> {
        let pk_cols: Vec<(usize, &ColumnSchema)> = columns
            .iter()
            .enumerate()
            .filter(|(_, c)| c.primary)
            .collect();

        if pk_cols.is_empty() {
            return None;
        }

        let set_clauses: Vec<String> = columns
            .iter()
            .enumerate()
            .filter(|(_, c)| !c.primary)
            .filter_map(|(i, c)| {
                row.values.get(i).map(|v| {
                    format!(
                        "\"{}\" = {}",
                        c.name.replace('"', "\"\""),
                        cell_to_sql_literal(v)
                    )
                })
            })
            .collect();

        if set_clauses.is_empty() {
            return None;
        }

        let where_clauses: Vec<String> = pk_cols
            .iter()
            .filter_map(|(i, c)| {
                row.values.get(*i).map(|v| {
                    format!(
                        "\"{}\" = {}",
                        c.name.replace('"', "\"\""),
                        cell_to_sql_literal(v)
                    )
                })
            })
            .collect();

        Some(format!(
            "UPDATE \"{}\".\"{}\" SET {} WHERE {}",
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            set_clauses.join(", "),
            where_clauses.join(" AND ")
        ))
    }

    fn build_delete_sql(
        &self,
        schema: &str,
        table: &str,
        columns: &[ColumnSchema],
        row: &TableRow,
    ) -> Option<String> {
        let pk_cols: Vec<(usize, &ColumnSchema)> = columns
            .iter()
            .enumerate()
            .filter(|(_, c)| c.primary)
            .collect();

        if pk_cols.is_empty() {
            return None;
        }

        let where_clauses: Vec<String> = pk_cols
            .iter()
            .filter_map(|(i, c)| {
                row.values.get(*i).map(|v| {
                    format!(
                        "\"{}\" = {}",
                        c.name.replace('"', "\"\""),
                        cell_to_sql_literal(v)
                    )
                })
            })
            .collect();

        Some(format!(
            "DELETE FROM \"{}\".\"{}\" WHERE {}",
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            where_clauses.join(" AND ")
        ))
    }
}

impl Destination for DuckDbDestination {
    fn name() -> &'static str {
        "duckdb"
    }

    async fn truncate_table(&self, table_id: TableId) -> EtlResult<()> {
        let schema = self
            .schemas
            .lock()
            .map_err(|e| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationError,
                    "schema lock failed",
                    e.to_string(),
                ))
            })?
            .get(&table_id)
            .cloned();

        if let Some(ts) = schema {
            let sql = format!(
                "DELETE FROM \"{}\".\"{}\"",
                ts.name.schema.replace('"', "\"\""),
                ts.name.name.replace('"', "\"\"")
            );
            self.execute_sql(&sql).map_err(|e| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationQueryFailed,
                    "truncate failed",
                    e.to_string(),
                ))
            })?;
        }

        Ok(())
    }

    async fn write_table_rows(
        &self,
        table_id: TableId,
        table_rows: Vec<TableRow>,
    ) -> EtlResult<()> {
        if table_rows.is_empty() {
            return Ok(());
        }

        let schema = self
            .schemas
            .lock()
            .map_err(|e| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationError,
                    "schema lock failed",
                    e.to_string(),
                ))
            })?
            .get(&table_id)
            .cloned()
            .ok_or_else(|| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationError,
                    "no schema for table during snapshot copy",
                ))
            })?;

        self.ensure_table(&schema).map_err(|e| {
            etl_lib::error::EtlError::from((
                etl_lib::error::ErrorKind::DestinationQueryFailed,
                "ensure_table failed during snapshot copy",
                e.to_string(),
            ))
        })?;

        let mut sql_batch = Vec::new();
        for row in &table_rows {
            sql_batch.push(self.build_insert_sql(
                &schema.name.schema,
                &schema.name.name,
                &schema.column_schemas,
                row,
            ));
        }

        if !sql_batch.is_empty() {
            let combined = sql_batch.join(";\n") + ";";
            self.execute_sql(&combined).map_err(|e| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationQueryFailed,
                    "batch SQL execution failed during snapshot copy",
                    e.to_string(),
                ))
            })?;
        }

        let row_count = table_rows.len() as u64;
        pipeline_registry::registry().update_stats(&self.pipeline_name, row_count);

        Ok(())
    }

    async fn write_events(&self, events: Vec<Event>) -> EtlResult<()> {
        pipeline_registry::registry().transition_to_streaming_once(&self.pipeline_name);

        let mut sql_batch = Vec::new();
        let mut rows_written: u64 = 0;
        let mut current_schemas: std::collections::HashMap<TableId, TableSchema> =
            std::collections::HashMap::new();

        for event in &events {
            match event {
                Event::Relation(rel) => {
                    let ts = &rel.table_schema;
                    if let Err(e) = self.ensure_table(ts) {
                        eprintln!("etl: ensure_table error: {}", e);
                    }
                    if let Err(e) = self.handle_schema_evolution(ts) {
                        eprintln!("etl: schema_evolution error: {}", e);
                    }
                    current_schemas.insert(ts.id, ts.clone());
                    if let Ok(mut cache) = self.schemas.lock() {
                        cache.insert(ts.id, ts.clone());
                    }
                }
                Event::Insert(ins) => {
                    if let Some(ts) = current_schemas.get(&ins.table_id) {
                        let stmt = self.build_insert_sql(
                            &ts.name.schema,
                            &ts.name.name,
                            &ts.column_schemas,
                            &ins.table_row,
                        );
                        sql_batch.push(stmt);
                        rows_written += 1;
                    }
                }
                Event::Update(upd) => {
                    if let Some(ts) = current_schemas.get(&upd.table_id) {
                        if let Some(stmt) = self.build_update_sql(
                            &ts.name.schema,
                            &ts.name.name,
                            &ts.column_schemas,
                            &upd.table_row,
                        ) {
                            sql_batch.push(stmt);
                            rows_written += 1;
                        }
                    }
                }
                Event::Delete(del) => {
                    if let Some(old_row) = &del.old_table_row {
                        if let Some(ts) = current_schemas.get(&del.table_id) {
                            if let Some(stmt) = self.build_delete_sql(
                                &ts.name.schema,
                                &ts.name.name,
                                &ts.column_schemas,
                                &old_row.1,
                            ) {
                                sql_batch.push(stmt);
                                rows_written += 1;
                            }
                        }
                    }
                }
                Event::Truncate(trunc) => {
                    for rel_id in &trunc.rel_ids {
                        let tid = TableId::new(*rel_id);
                        if let Some(ts) = current_schemas.get(&tid) {
                            sql_batch.push(format!(
                                "DELETE FROM \"{}\".\"{}\"",
                                ts.name.schema.replace('"', "\"\""),
                                ts.name.name.replace('"', "\"\"")
                            ));
                        }
                    }
                }
                Event::Begin(_) | Event::Commit(_) | Event::Unsupported => {}
            }
        }

        if !sql_batch.is_empty() {
            let combined = sql_batch.join(";\n") + ";";
            self.execute_sql(&combined).map_err(|e| {
                etl_lib::error::EtlError::from((
                    etl_lib::error::ErrorKind::DestinationQueryFailed,
                    "batch SQL execution failed",
                    e.to_string(),
                ))
            })?;
        }

        if rows_written > 0 {
            pipeline_registry::registry().update_stats(&self.pipeline_name, rows_written);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use etl_lib::types::{Cell, TableRow, Type};
    use etl_postgres::types::{ColumnSchema, TableId, TableName, TableSchema};
    use std::sync::Arc;

    fn make_schema(cols: Vec<(&str, Type, bool)>) -> TableSchema {
        TableSchema {
            id: TableId::new(1),
            name: TableName {
                schema: "public".to_string(),
                name: "t".to_string(),
            },
            column_schemas: cols
                .into_iter()
                .map(|(n, ty, pk)| ColumnSchema {
                    name: n.to_string(),
                    typ: ty,
                    modifier: -1,
                    nullable: !pk,
                    primary: pk,
                })
                .collect(),
        }
    }

    fn dest() -> DuckDbDestination {
        DuckDbDestination::new(
            "p".to_string(),
            Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        )
    }

    // --- build_ensure_schema_sql ---

    #[test]
    fn build_ensure_schema_basic() {
        assert_eq!(
            DuckDbDestination::build_ensure_schema_sql("public"),
            "CREATE SCHEMA IF NOT EXISTS \"public\""
        );
    }

    #[test]
    fn build_ensure_schema_quotes_embedded_quote() {
        // a" should become a"" inside the quoted identifier.
        assert_eq!(
            DuckDbDestination::build_ensure_schema_sql("a\"b"),
            "CREATE SCHEMA IF NOT EXISTS \"a\"\"b\""
        );
    }

    // --- build_ensure_table_sql ---

    #[test]
    fn build_ensure_table_basic() {
        let s = make_schema(vec![
            ("id", Type::INT4, true),
            ("name", Type::VARCHAR, false),
        ]);
        let sql = DuckDbDestination::build_ensure_table_sql(&s);
        assert_eq!(
            sql,
            "CREATE TABLE IF NOT EXISTS \"public\".\"t\" (\"id\" INTEGER, \"name\" VARCHAR)"
        );
    }

    #[test]
    fn build_ensure_table_quotes_identifiers() {
        let mut s = make_schema(vec![("a\"b", Type::INT4, true)]);
        s.name.schema = "sch\"ema".to_string();
        s.name.name = "ta\"ble".to_string();
        let sql = DuckDbDestination::build_ensure_table_sql(&s);
        assert!(sql.contains("\"sch\"\"ema\".\"ta\"\"ble\""));
        assert!(sql.contains("\"a\"\"b\" INTEGER"));
    }

    #[test]
    fn build_ensure_table_no_columns() {
        let s = make_schema(vec![]);
        let sql = DuckDbDestination::build_ensure_table_sql(&s);
        assert_eq!(sql, "CREATE TABLE IF NOT EXISTS \"public\".\"t\" ()");
    }

    // --- build_schema_evolution_sqls ---

    #[test]
    fn build_schema_evolution_sqls_one_per_column() {
        let s = make_schema(vec![
            ("id", Type::INT4, true),
            ("name", Type::VARCHAR, false),
        ]);
        let sqls = DuckDbDestination::build_schema_evolution_sqls(&s);
        assert_eq!(sqls.len(), 2);
        assert_eq!(
            sqls[0],
            "ALTER TABLE \"public\".\"t\" ADD COLUMN IF NOT EXISTS \"id\" INTEGER"
        );
        assert_eq!(
            sqls[1],
            "ALTER TABLE \"public\".\"t\" ADD COLUMN IF NOT EXISTS \"name\" VARCHAR"
        );
    }

    #[test]
    fn build_schema_evolution_sqls_quotes_identifiers() {
        let mut s = make_schema(vec![("c\"x", Type::INT4, false)]);
        s.name.schema = "s\"ch".to_string();
        s.name.name = "t\"bl".to_string();
        let sqls = DuckDbDestination::build_schema_evolution_sqls(&s);
        assert_eq!(sqls.len(), 1);
        assert_eq!(
            sqls[0],
            "ALTER TABLE \"s\"\"ch\".\"t\"\"bl\" ADD COLUMN IF NOT EXISTS \"c\"\"x\" INTEGER"
        );
    }

    #[test]
    fn build_schema_evolution_sqls_empty() {
        let s = make_schema(vec![]);
        let sqls = DuckDbDestination::build_schema_evolution_sqls(&s);
        assert!(sqls.is_empty());
    }

    // --- build_insert_sql ---

    #[test]
    fn build_insert_sql_basic() {
        let d = dest();
        let s = make_schema(vec![("id", Type::INT4, true), ("name", Type::VARCHAR, false)]);
        let row = TableRow {
            values: vec![Cell::I32(7), Cell::String("alice".into())],
        };
        let sql = d.build_insert_sql("public", "t", &s.column_schemas, &row);
        assert_eq!(
            sql,
            "INSERT INTO \"public\".\"t\" (\"id\", \"name\") VALUES (7, 'alice')"
        );
    }

    #[test]
    fn build_insert_sql_quotes_identifiers_and_values() {
        let d = dest();
        let s = make_schema(vec![("c\"x", Type::VARCHAR, false)]);
        let row = TableRow {
            values: vec![Cell::String("a'b".into())],
        };
        let sql = d.build_insert_sql("sch\"x", "t\"x", &s.column_schemas, &row);
        assert!(sql.contains("\"sch\"\"x\".\"t\"\"x\""));
        assert!(sql.contains("\"c\"\"x\""));
        assert!(sql.contains("'a''b'"));
    }

    #[test]
    fn build_insert_sql_handles_nulls() {
        let d = dest();
        let s = make_schema(vec![("id", Type::INT4, true), ("name", Type::VARCHAR, false)]);
        let row = TableRow {
            values: vec![Cell::I32(1), Cell::Null],
        };
        let sql = d.build_insert_sql("public", "t", &s.column_schemas, &row);
        assert_eq!(
            sql,
            "INSERT INTO \"public\".\"t\" (\"id\", \"name\") VALUES (1, NULL)"
        );
    }

    // --- build_update_sql ---

    #[test]
    fn build_update_sql_basic() {
        let d = dest();
        let s = make_schema(vec![
            ("id", Type::INT4, true),
            ("name", Type::VARCHAR, false),
            ("active", Type::BOOL, false),
        ]);
        let row = TableRow {
            values: vec![Cell::I32(7), Cell::String("bob".into()), Cell::Bool(true)],
        };
        let sql = d
            .build_update_sql("public", "t", &s.column_schemas, &row)
            .unwrap();
        assert_eq!(
            sql,
            "UPDATE \"public\".\"t\" SET \"name\" = 'bob', \"active\" = TRUE WHERE \"id\" = 7"
        );
    }

    #[test]
    fn build_update_sql_no_primary_key_returns_none() {
        let d = dest();
        let s = make_schema(vec![("a", Type::INT4, false), ("b", Type::INT4, false)]);
        let row = TableRow {
            values: vec![Cell::I32(1), Cell::I32(2)],
        };
        assert!(d
            .build_update_sql("public", "t", &s.column_schemas, &row)
            .is_none());
    }

    #[test]
    fn build_update_sql_all_columns_primary_returns_none() {
        // No non-primary columns → no SET clauses → None.
        let d = dest();
        let s = make_schema(vec![("a", Type::INT4, true), ("b", Type::INT4, true)]);
        let row = TableRow {
            values: vec![Cell::I32(1), Cell::I32(2)],
        };
        assert!(d
            .build_update_sql("public", "t", &s.column_schemas, &row)
            .is_none());
    }

    #[test]
    fn build_update_sql_composite_primary_key() {
        let d = dest();
        let s = make_schema(vec![
            ("a", Type::INT4, true),
            ("b", Type::INT4, true),
            ("v", Type::VARCHAR, false),
        ]);
        let row = TableRow {
            values: vec![Cell::I32(1), Cell::I32(2), Cell::String("x".into())],
        };
        let sql = d
            .build_update_sql("public", "t", &s.column_schemas, &row)
            .unwrap();
        assert_eq!(
            sql,
            "UPDATE \"public\".\"t\" SET \"v\" = 'x' WHERE \"a\" = 1 AND \"b\" = 2"
        );
    }

    // --- build_delete_sql ---

    #[test]
    fn build_delete_sql_basic() {
        let d = dest();
        let s = make_schema(vec![("id", Type::INT4, true), ("name", Type::VARCHAR, false)]);
        let row = TableRow {
            values: vec![Cell::I32(7), Cell::String("ignored".into())],
        };
        let sql = d
            .build_delete_sql("public", "t", &s.column_schemas, &row)
            .unwrap();
        assert_eq!(sql, "DELETE FROM \"public\".\"t\" WHERE \"id\" = 7");
    }

    #[test]
    fn build_delete_sql_no_primary_key_returns_none() {
        let d = dest();
        let s = make_schema(vec![("a", Type::INT4, false)]);
        let row = TableRow {
            values: vec![Cell::I32(1)],
        };
        assert!(d
            .build_delete_sql("public", "t", &s.column_schemas, &row)
            .is_none());
    }

    #[test]
    fn build_delete_sql_composite_primary_key() {
        let d = dest();
        let s = make_schema(vec![
            ("a", Type::INT4, true),
            ("b", Type::INT4, true),
            ("v", Type::VARCHAR, false),
        ]);
        let row = TableRow {
            values: vec![Cell::I32(1), Cell::I32(2), Cell::String("x".into())],
        };
        let sql = d
            .build_delete_sql("public", "t", &s.column_schemas, &row)
            .unwrap();
        assert_eq!(
            sql,
            "DELETE FROM \"public\".\"t\" WHERE \"a\" = 1 AND \"b\" = 2"
        );
    }
}
