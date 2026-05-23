//! Distributed query coordinator: resolves nodes, fans out via Flight,
//! collects partial results, and merges (with aggregation decomposition).

use std::sync::Arc;
use std::time::Instant;

use arrow::array::RecordBatch;
use arrow::compute::concat_batches;
use arrow::datatypes::SchemaRef;
use uuid::Uuid;

use crate::aggregation::{self, DecomposedQuery};
use crate::catalog;
use crate::flight_client;
use crate::logging::{LogLevel, SwarmLogger};

pub struct QueryResult {
    pub schema: SchemaRef,
    pub batches: Vec<RecordBatch>,
}

/// Execute a SQL query across the cluster. Creates an internal tokio runtime
/// for the async fan-out phase to avoid nested `block_on` calls.
pub fn execute_distributed_query(
    sql: &str,
    partial_results: bool,
) -> Result<QueryResult, String> {
    let query_id = Uuid::new_v4();
    let start = Instant::now();

    SwarmLogger::log_with_context(
        LogLevel::Info,
        "coordinator",
        &[("query_id", &query_id.to_string())],
        &format!("Received query: {sql}"),
    );

    let table_name = match extract_table_name(sql) {
        Ok(name) => name,
        Err(e) if e.contains("No table found") => {
            SwarmLogger::log_with_context(
                LogLevel::Debug,
                "coordinator",
                &[("query_id", &query_id.to_string())],
                "No table in query, executing locally",
            );
            return execute_local_query(sql);
        }
        Err(e) => return Err(e),
    };

    SwarmLogger::log_with_context(
        LogLevel::Debug,
        "coordinator",
        &[("query_id", &query_id.to_string())],
        &format!("Extracted table name: {table_name}"),
    );

    let catalog_entries = catalog::resolve_table(&table_name)?;

    if catalog_entries.is_empty() {
        return Err(format!(
            "No data nodes found for table '{table_name}'"
        ));
    }

    let target_nodes: Vec<String> = catalog_entries
        .iter()
        .filter_map(|e| e.flight_endpoint.clone())
        .collect();

    if target_nodes.is_empty() {
        return Err(format!(
            "No Flight endpoints available for table '{table_name}' (found {} node(s) but none have Flight running)",
            catalog_entries.len(),
        ));
    }

    let node_list = target_nodes.join(", ");
    SwarmLogger::log_with_context(
        LogLevel::Info,
        "coordinator",
        &[("query_id", &query_id.to_string())],
        &format!(
            "Resolved {} target node(s) for table '{}': [{}]",
            target_nodes.len(),
            table_name,
            node_list,
        ),
    );

    let decomposed = aggregation::decompose_query(sql)?;

    SwarmLogger::log_with_context(
        LogLevel::Debug,
        "coordinator",
        &[("query_id", &query_id.to_string())],
        &format!(
            "Decomposed query: has_aggregations={}, node_sql=\"{}\", merge_sql=\"{}\"",
            decomposed.has_aggregations, decomposed.node_sql, decomposed.merge_sql,
        ),
    );

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create fan-out runtime: {e}"))?;

    let fan_out_start = Instant::now();
    let (all_node_batches, errors) = rt.block_on(async {
        let mut handles = Vec::with_capacity(target_nodes.len());

        for endpoint in &target_nodes {
            let ep = endpoint.clone();
            let node_sql = decomposed.node_sql.clone();
            let qid = query_id.to_string();

            handles.push(tokio::spawn(async move {
                let node_start = Instant::now();
                let result = flight_client::query_node(&ep, &node_sql).await;
                let elapsed_ms = node_start.elapsed().as_millis();

                match &result {
                    Ok(batches) => {
                        let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
                        SwarmLogger::log_with_context(
                            LogLevel::Debug,
                            "coordinator",
                            &[("query_id", &qid), ("node", &ep)],
                            &format!(
                                "Node returned {} batch(es), {} row(s) in {}ms",
                                batches.len(),
                                total_rows,
                                elapsed_ms,
                            ),
                        );
                    }
                    Err(e) => {
                        SwarmLogger::log_with_context(
                            LogLevel::Error,
                            "coordinator",
                            &[("query_id", &qid), ("node", &ep)],
                            &format!("Node query failed after {}ms: {e}", elapsed_ms),
                        );
                    }
                }

                (ep, result)
            }));
        }

        let mut all_node_batches: Vec<Vec<RecordBatch>> = Vec::with_capacity(target_nodes.len());
        let mut errors: Vec<String> = Vec::new();

        for handle in handles {
            match handle.await {
                Ok((endpoint, result)) => match result {
                    Ok(batches) => {
                        all_node_batches.push(batches);
                    }
                    Err(e) => {
                        let msg = format!("Node {endpoint} failed: {e}");
                        if partial_results {
                            SwarmLogger::log_with_context(
                                LogLevel::Warn,
                                "coordinator",
                                &[("query_id", &query_id.to_string())],
                                &format!(
                                    "Partial results mode: ignoring failure from {endpoint}: {e}"
                                ),
                            );
                        } else {
                            SwarmLogger::log_with_context(
                                LogLevel::Error,
                                "coordinator",
                                &[("query_id", &query_id.to_string())],
                                &msg,
                            );
                            errors.push(msg);
                        }
                    }
                },
                Err(e) => {
                    errors.push(format!("Task join error: {e}"));
                }
            }
        }

        (all_node_batches, errors)
    });

    let fan_out_ms = fan_out_start.elapsed().as_millis();

    if !errors.is_empty() {
        return Err(format!(
            "Distributed query failed on {} node(s): {}",
            errors.len(),
            errors.join("; "),
        ));
    }

    if all_node_batches.is_empty()
        || all_node_batches.iter().all(|nb| nb.is_empty())
    {
        SwarmLogger::log_with_context(
            LogLevel::Info,
            "coordinator",
            &[("query_id", &query_id.to_string())],
            &format!(
                "Query returned no results from any node (fan-out took {}ms)",
                fan_out_ms,
            ),
        );

        // Try to preserve schema from any batch (even zero-row ones)
        let schema = all_node_batches
            .iter()
            .flat_map(|nb| nb.iter())
            .find(|b| b.num_columns() > 0)
            .map(|b| b.schema())
            .unwrap_or_else(|| Arc::new(arrow::datatypes::Schema::empty()));
        return Ok(QueryResult {
            schema,
            batches: vec![],
        });
    }

    let merge_start = Instant::now();
    let result = merge_batches(all_node_batches, &decomposed)?;
    let merge_ms = merge_start.elapsed().as_millis();

    let total_rows: usize = result.batches.iter().map(|b| b.num_rows()).sum();
    let total_ms = start.elapsed().as_millis();

    SwarmLogger::log_with_context(
        LogLevel::Info,
        "coordinator",
        &[("query_id", &query_id.to_string())],
        &format!(
            "Query complete: {} row(s), fan-out={}ms, merge={}ms, total={}ms",
            total_rows, fan_out_ms, merge_ms, total_ms,
        ),
    );

    Ok(result)
}

/// Execute locally for queries without a FROM clause.
fn execute_local_query(sql: &str) -> Result<QueryResult, String> {
    let (_schema, batches) = crate::pool::read_arrow(sql)?;

    let schema = if let Some(first) = batches.first() {
        first.schema()
    } else {
        Arc::new(arrow::datatypes::Schema::empty())
    };

    Ok(QueryResult { schema, batches })
}

/// Extract the first table name from the FROM clause of a SQL SELECT.
pub fn extract_table_name(sql: &str) -> Result<String, String> {
    use sqlparser::ast::Statement;
    use sqlparser::dialect::GenericDialect;
    use sqlparser::parser::Parser;

    let dialect = GenericDialect {};
    let statements =
        Parser::parse_sql(&dialect, sql).map_err(|e| format!("SQL parse error: {e}"))?;

    if statements.is_empty() {
        return Err("Empty SQL statement".to_string());
    }

    let stmt = &statements[0];

    match stmt {
        Statement::Query(query) => extract_table_from_query(query),
        _ => Err("Only SELECT queries are supported for distributed execution".to_string()),
    }
}

fn extract_table_from_query(query: &sqlparser::ast::Query) -> Result<String, String> {
    use sqlparser::ast::SetExpr;

    match query.body.as_ref() {
        SetExpr::Select(select) => {
            for table_with_joins in &select.from {
                if let Some(name) = extract_table_from_factor(&table_with_joins.relation) {
                    return Ok(name);
                }
                for join in &table_with_joins.joins {
                    if let Some(name) = extract_table_from_factor(&join.relation) {
                        return Ok(name);
                    }
                }
            }
            Err("No table found in FROM clause".to_string())
        }
        SetExpr::Query(inner) => extract_table_from_query(inner),
        SetExpr::SetOperation { left, .. } => {
            if let SetExpr::Select(select) = left.as_ref() {
                for table_with_joins in &select.from {
                    if let Some(name) =
                        extract_table_from_factor(&table_with_joins.relation)
                    {
                        return Ok(name);
                    }
                }
            }
            Err("No table found in FROM clause".to_string())
        }
        _ => Err("Unsupported query form for distributed execution".to_string()),
    }
}

fn extract_table_from_factor(factor: &sqlparser::ast::TableFactor) -> Option<String> {
    use sqlparser::ast::TableFactor;

    match factor {
        TableFactor::Table { name, .. } => {
            // Last ident, ignoring schema qualifiers.
            name.0.last().map(|ident| ident.value.clone())
        }
        TableFactor::Derived { subquery, .. } => {
            extract_table_from_query(subquery).ok()
        }
        TableFactor::NestedJoin { table_with_joins, .. } => {
            extract_table_from_factor(&table_with_joins.relation)
        }
        _ => None,
    }
}

/// Merge per-node batches: concatenate for non-aggregates, or load into
/// DuckDB and run merge SQL for aggregates.
pub fn merge_batches(
    node_batches: Vec<Vec<RecordBatch>>,
    decomposed: &DecomposedQuery,
) -> Result<QueryResult, String> {
    let all_batches: Vec<RecordBatch> = node_batches
        .into_iter()
        .flat_map(|nb| nb.into_iter())
        .collect();

    if all_batches.is_empty() {
        let schema = Arc::new(arrow::datatypes::Schema::empty());
        return Ok(QueryResult {
            schema,
            batches: vec![],
        });
    }

    let schema = all_batches[0].schema();

    if !decomposed.has_aggregations {
        return Ok(QueryResult {
            schema,
            batches: all_batches,
        });
    }

    merge_with_duckdb(&schema, all_batches, &decomposed.merge_sql)
}

/// Load batches into DuckDB via arrow(?,?) and run merge SQL.
/// Replaces `_merged` with an inline arrow subquery (DuckDB doesn't allow
/// prepared params in DDL).
fn merge_with_duckdb(
    schema: &SchemaRef,
    batches: Vec<RecordBatch>,
    merge_sql: &str,
) -> Result<QueryResult, String> {
    use duckdb::vtab::arrow::{arrow_recordbatch_to_query_params, ArrowVTab};

    let merged_batch = concat_batches(schema, &batches)
        .map_err(|e| format!("Failed to concatenate record batches: {e}"))?;

    let rewritten_sql = merge_sql.replace(
        "FROM _merged",
        "FROM (SELECT * FROM arrow(?, ?)) AS _merged",
    );

    crate::local_connections::with_connection(|conn| {
        let _ = conn.register_table_function::<ArrowVTab>("arrow");

        let params = arrow_recordbatch_to_query_params(merged_batch);

        let mut stmt = conn
            .prepare(&rewritten_sql)
            .map_err(|e| format!("Failed to prepare merge SQL: {e}"))?;

        let result_batches: Vec<RecordBatch> = stmt
            .query_arrow(params)
            .map_err(|e| format!("Failed to execute merge SQL: {e}"))?
            .collect();

        let result_schema = if let Some(first) = result_batches.first() {
            first.schema()
        } else {
            Arc::new(arrow::datatypes::Schema::empty())
        };

        Ok(QueryResult {
            schema: result_schema,
            batches: result_batches,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_simple_table() {
        let result = extract_table_name("SELECT * FROM orders").unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_with_schema() {
        let result = extract_table_name("SELECT * FROM public.orders WHERE id > 5").unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_with_alias() {
        let result = extract_table_name("SELECT o.id FROM orders o").unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_with_join() {
        let result =
            extract_table_name("SELECT * FROM orders o JOIN users u ON o.user_id = u.id")
                .unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_case_insensitive_from() {
        let result = extract_table_name("select count(*) from orders").unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_no_from_clause() {
        let result = extract_table_name("SELECT 1 + 2");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No table found"));
    }

    #[test]
    fn extract_table_non_select() {
        let result = extract_table_name("INSERT INTO orders VALUES (1)");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Only SELECT queries are supported"));
    }

    #[test]
    fn extract_table_invalid_sql() {
        let result = extract_table_name("NOT VALID SQL !!!");
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_subquery() {
        let result =
            extract_table_name("SELECT * FROM (SELECT id FROM orders) AS sub").unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_with_where_and_group_by() {
        let result = extract_table_name(
            "SELECT region, SUM(price) FROM orders WHERE active = true GROUP BY region",
        )
        .unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn merge_empty_batches_no_agg() {
        let decomposed = DecomposedQuery {
            node_sql: "SELECT * FROM t".to_string(),
            merge_sql: "SELECT * FROM _merged".to_string(),
            has_aggregations: false,
        };
        let result = merge_batches(vec![], &decomposed).unwrap();
        assert!(result.batches.is_empty());
    }

    #[test]
    fn merge_concatenates_batches_no_agg() {
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};

        let schema = Arc::new(Schema::new(vec![Field::new("a", DataType::Int32, false)]));
        let batch1 = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int32Array::from(vec![1, 2, 3]))],
        )
        .unwrap();
        let batch2 = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int32Array::from(vec![4, 5]))],
        )
        .unwrap();

        let decomposed = DecomposedQuery {
            node_sql: "SELECT a FROM t".to_string(),
            merge_sql: "SELECT * FROM _merged".to_string(),
            has_aggregations: false,
        };

        let result = merge_batches(vec![vec![batch1], vec![batch2]], &decomposed).unwrap();
        assert_eq!(result.batches.len(), 2);
        let total_rows: usize = result.batches.iter().map(|b| b.num_rows()).sum();
        assert_eq!(total_rows, 5);
    }

    #[test]
    fn merge_with_aggregation_without_local_conn_errors() {
        // local_connections is not initialized under cargo test --lib, so the
        // duckdb-backed merge path returns a "not initialized" error.
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};

        let schema = Arc::new(Schema::new(vec![Field::new("a", DataType::Int32, false)]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int32Array::from(vec![1, 2, 3]))],
        )
        .unwrap();

        let decomposed = DecomposedQuery {
            node_sql: "SELECT SUM(a) FROM t".to_string(),
            merge_sql: "SELECT SUM(a) FROM _merged".to_string(),
            has_aggregations: true,
        };

        let result = merge_batches(vec![vec![batch]], &decomposed);
        let err = match result {
            Ok(_) => panic!("expected merge_batches to fail without local connections"),
            Err(e) => e,
        };
        assert!(
            err.contains("not initialized") || err.contains("local conn"),
            "got: {err}"
        );
    }

    #[test]
    fn extract_table_union_set_operation() {
        let sql = "SELECT a FROM orders UNION ALL SELECT a FROM other";
        let result = extract_table_name(sql).unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_nested_select() {
        // (SELECT * FROM (SELECT * FROM orders))
        let sql = "SELECT * FROM (SELECT * FROM (SELECT * FROM orders) a) b";
        let result = extract_table_name(sql).unwrap();
        assert_eq!(result, "orders");
    }

    #[test]
    fn extract_table_empty_sql_errors() {
        let result = extract_table_name("");
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_update_unsupported() {
        let result = extract_table_name("UPDATE orders SET active = false");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Only SELECT queries are supported"));
    }

    #[test]
    fn execute_distributed_query_no_from_errors_without_pool() {
        // No FROM clause -> execute_local_query path, which needs pool::read_arrow.
        // Under cargo test --lib the pool is not loaded, so this returns Err.
        let result = execute_distributed_query("SELECT 1 + 2", false);
        assert!(matches!(result, Err(_)), "expected pool failure");
    }

    #[test]
    #[serial_test::serial]
    fn execute_distributed_query_with_table_errors_without_gossip() {
        // catalog::resolve_table calls GossipRegistry which is not running here.
        let _ = crate::gossip::GossipRegistry::instance().stop();
        let result = execute_distributed_query("SELECT * FROM orders", false);
        assert!(matches!(result, Err(_)), "expected gossip failure");
    }

    #[test]
    fn execute_distributed_query_propagates_invalid_sql() {
        let result = execute_distributed_query("NOT VALID SQL !!!", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn query_result_struct_holds_schema_and_batches() {
        let schema = Arc::new(arrow::datatypes::Schema::empty());
        let qr = QueryResult {
            schema: schema.clone(),
            batches: vec![],
        };
        assert_eq!(qr.schema.fields().len(), 0);
        assert!(qr.batches.is_empty());
    }

    // ---------- Additional extract_table_name shapes ----------

    #[test]
    fn extract_table_three_part_qualified_name_uses_last() {
        let sql = "SELECT * FROM mydb.myschema.orders";
        assert_eq!(extract_table_name(sql).unwrap(), "orders");
    }

    #[test]
    fn extract_table_quoted_identifier() {
        let sql = r#"SELECT * FROM "Order Items""#;
        assert_eq!(extract_table_name(sql).unwrap(), "Order Items");
    }

    #[test]
    fn extract_table_with_inner_join_and_alias_finds_first() {
        let sql = "SELECT * FROM customers c INNER JOIN orders o ON c.id = o.customer_id";
        assert_eq!(extract_table_name(sql).unwrap(), "customers");
    }

    #[test]
    fn extract_table_with_multiple_joins_returns_first_table() {
        let sql = "SELECT * FROM a JOIN b ON a.x = b.x JOIN c ON b.y = c.y";
        assert_eq!(extract_table_name(sql).unwrap(), "a");
    }

    #[test]
    fn extract_table_with_left_join() {
        let sql = "SELECT * FROM orders LEFT JOIN customers ON orders.cid = customers.id";
        assert_eq!(extract_table_name(sql).unwrap(), "orders");
    }

    #[test]
    fn extract_table_with_full_outer_join() {
        let sql = "SELECT * FROM orders FULL OUTER JOIN customers ON orders.cid = customers.id";
        assert_eq!(extract_table_name(sql).unwrap(), "orders");
    }

    #[test]
    fn extract_table_intersect_set_operation() {
        let sql = "SELECT id FROM left_table INTERSECT SELECT id FROM right_table";
        assert_eq!(extract_table_name(sql).unwrap(), "left_table");
    }

    #[test]
    fn extract_table_except_set_operation() {
        let sql = "SELECT id FROM left_table EXCEPT SELECT id FROM right_table";
        assert_eq!(extract_table_name(sql).unwrap(), "left_table");
    }

    #[test]
    fn extract_table_with_order_by_and_limit() {
        let sql = "SELECT * FROM orders ORDER BY id DESC LIMIT 10";
        assert_eq!(extract_table_name(sql).unwrap(), "orders");
    }

    #[test]
    fn extract_table_delete_unsupported() {
        let sql = "DELETE FROM orders WHERE id = 1";
        let err = extract_table_name(sql).unwrap_err();
        assert!(err.contains("Only SELECT queries are supported"));
    }

    #[test]
    fn extract_table_create_table_unsupported() {
        let sql = "CREATE TABLE foo (id INT)";
        let err = extract_table_name(sql).unwrap_err();
        assert!(err.contains("Only SELECT queries are supported"));
    }

    #[test]
    fn extract_table_drop_unsupported() {
        let sql = "DROP TABLE foo";
        let err = extract_table_name(sql).unwrap_err();
        assert!(err.contains("Only SELECT queries are supported"));
    }

    #[test]
    fn extract_table_whitespace_only_errors() {
        // sqlparser typically rejects whitespace-only as empty.
        let result = extract_table_name("   ");
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_explicit_cross_join() {
        let sql = "SELECT * FROM a CROSS JOIN b";
        assert_eq!(extract_table_name(sql).unwrap(), "a");
    }

    #[test]
    fn extract_table_nested_join_factor() {
        // (a JOIN b) JOIN c — surfaces via NestedJoin in some parsers.
        let sql = "SELECT * FROM (a JOIN b ON a.x = b.x) JOIN c ON a.y = c.y";
        // Generic dialect may or may not synthesize NestedJoin; either way the
        // first table 'a' is returned.
        let name = extract_table_name(sql).unwrap();
        assert!(name == "a" || name == "b" || name == "c", "got: {name}");
    }

    // ---------- merge_batches additional shapes ----------

    #[test]
    fn merge_batches_single_node_no_agg_preserves_schema() {
        use arrow::array::Int64Array;
        use arrow::datatypes::{DataType, Field, Schema};

        let schema = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
        ]));
        let b = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int64Array::from(vec![10, 20, 30]))],
        )
        .unwrap();

        let decomposed = DecomposedQuery {
            node_sql: "SELECT id FROM t".to_string(),
            merge_sql: "SELECT * FROM _merged".to_string(),
            has_aggregations: false,
        };
        let result = merge_batches(vec![vec![b]], &decomposed).unwrap();
        // Schema preserved from the first batch.
        assert_eq!(result.schema.fields().len(), 1);
        assert_eq!(result.schema.field(0).name(), "id");
    }

    #[test]
    fn merge_batches_all_empty_node_lists_no_agg() {
        let decomposed = DecomposedQuery {
            node_sql: "SELECT * FROM t".to_string(),
            merge_sql: "SELECT * FROM _merged".to_string(),
            has_aggregations: false,
        };
        // Two nodes, each returned zero batches.
        let result = merge_batches(vec![vec![], vec![]], &decomposed).unwrap();
        assert!(result.batches.is_empty());
        // Schema is empty since no batches were available.
        assert_eq!(result.schema.fields().len(), 0);
    }

    #[test]
    fn merge_batches_multi_node_multi_batch_no_agg() {
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};

        let schema = Arc::new(Schema::new(vec![
            Field::new("x", DataType::Int32, false),
        ]));
        let make = |vals: Vec<i32>| {
            RecordBatch::try_new(schema.clone(), vec![Arc::new(Int32Array::from(vals))]).unwrap()
        };
        let node_a = vec![make(vec![1, 2]), make(vec![3])];
        let node_b = vec![make(vec![4, 5, 6])];
        let decomposed = DecomposedQuery {
            node_sql: "SELECT x FROM t".to_string(),
            merge_sql: "SELECT * FROM _merged".to_string(),
            has_aggregations: false,
        };
        let result = merge_batches(vec![node_a, node_b], &decomposed).unwrap();
        let total: usize = result.batches.iter().map(|b| b.num_rows()).sum();
        assert_eq!(total, 6);
        assert_eq!(result.batches.len(), 3);
    }

    // ---------- execute_distributed_query: error paths without pool/gossip ----------

    #[test]
    fn execute_distributed_query_delete_returns_err() {
        let result = execute_distributed_query("DELETE FROM orders", false);
        let err = match result {
            Ok(_) => panic!("expected DELETE to be rejected"),
            Err(e) => e,
        };
        assert!(
            err.contains("Only SELECT queries are supported"),
            "got: {err}"
        );
    }

    #[test]
    fn execute_distributed_query_update_returns_err() {
        let result = execute_distributed_query("UPDATE orders SET x = 1", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn execute_distributed_query_create_table_returns_err() {
        let result = execute_distributed_query("CREATE TABLE foo (id INT)", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn execute_distributed_query_empty_sql_returns_err() {
        let result = execute_distributed_query("", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn execute_distributed_query_partial_results_flag_does_not_change_parse_path() {
        // Same parse-error regardless of partial-results flag.
        let r1 = execute_distributed_query("NOT VALID", false);
        let r2 = execute_distributed_query("NOT VALID", true);
        assert!(matches!(r1, Err(_)));
        assert!(matches!(r2, Err(_)));
    }

    // ---------- bucket-8: additional coverage ----------

    #[test]
    fn extract_table_with_having() {
        let sql = "SELECT a, SUM(b) FROM t GROUP BY a HAVING SUM(b) > 0";
        assert_eq!(extract_table_name(sql).unwrap(), "t");
    }

    #[test]
    fn extract_table_with_distinct() {
        let sql = "SELECT DISTINCT a FROM users";
        assert_eq!(extract_table_name(sql).unwrap(), "users");
    }

    #[test]
    fn extract_table_with_offset() {
        let sql = "SELECT * FROM page OFFSET 5 LIMIT 10";
        assert_eq!(extract_table_name(sql).unwrap(), "page");
    }

    #[test]
    fn extract_table_with_cte() {
        // Common-table expression: outer query may pick the CTE alias name.
        let sql = "WITH c AS (SELECT * FROM orders) SELECT * FROM c";
        let result = extract_table_name(sql);
        // Either "c" (uses the CTE alias) or "orders" — both are valid for our impl.
        assert!(result.is_ok(), "got: {result:?}");
    }

    #[test]
    fn extract_table_with_function_call_in_select() {
        let sql = "SELECT COUNT(*) FROM events WHERE ts > NOW()";
        assert_eq!(extract_table_name(sql).unwrap(), "events");
    }

    #[test]
    fn extract_table_truncate_unsupported() {
        // TRUNCATE is not a SELECT, so it's rejected.
        let result = extract_table_name("TRUNCATE TABLE foo");
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_alter_unsupported() {
        let result = extract_table_name("ALTER TABLE foo ADD COLUMN x INT");
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_values_no_from() {
        // VALUES has no FROM table — parses but extraction should fail.
        let result = extract_table_name("VALUES (1, 2), (3, 4)");
        assert!(result.is_err());
    }

    #[test]
    fn merge_batches_aggregation_path_propagates_local_conn_failure() {
        // Aggregation path goes through DuckDB; without local_connections this
        // returns a deterministic error. Reaches `merge_with_duckdb` branch.
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};
        let schema = Arc::new(Schema::new(vec![Field::new("k", DataType::Int32, false)]));
        let b1 = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int32Array::from(vec![1, 2]))],
        )
        .unwrap();
        let b2 = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int32Array::from(vec![3, 4]))],
        )
        .unwrap();
        let decomposed = DecomposedQuery {
            node_sql: "SELECT k FROM t".to_string(),
            merge_sql: "SELECT SUM(k) FROM _merged".to_string(),
            has_aggregations: true,
        };
        // Two node batches, both merged.
        let result = merge_batches(vec![vec![b1], vec![b2]], &decomposed);
        assert!(result.is_err(), "expected merge failure");
    }

    #[test]
    fn merge_batches_one_empty_one_nonempty_no_agg() {
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};
        let schema = Arc::new(Schema::new(vec![Field::new("v", DataType::Int32, false)]));
        let b = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int32Array::from(vec![42]))],
        )
        .unwrap();
        let decomposed = DecomposedQuery {
            node_sql: "x".to_string(),
            merge_sql: "y".to_string(),
            has_aggregations: false,
        };
        // First node empty, second has a batch.
        let result = merge_batches(vec![vec![], vec![b]], &decomposed).unwrap();
        assert_eq!(result.batches.len(), 1);
        assert_eq!(result.batches[0].num_rows(), 1);
    }

    #[test]
    fn query_result_can_hold_batches() {
        use arrow::array::Int32Array;
        use arrow::datatypes::{DataType, Field, Schema};
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::Int32, false)]));
        let b = RecordBatch::try_new(
            schema.clone(),
            vec![Arc::new(Int32Array::from(vec![1, 2, 3]))],
        )
        .unwrap();
        let qr = QueryResult {
            schema,
            batches: vec![b],
        };
        assert_eq!(qr.batches.len(), 1);
        assert_eq!(qr.batches[0].num_rows(), 3);
        assert_eq!(qr.schema.fields().len(), 1);
    }

    #[test]
    fn extract_table_subquery_with_join() {
        let sql = "SELECT * FROM (SELECT x FROM t1) s JOIN t2 ON s.x = t2.x";
        let name = extract_table_name(sql).unwrap();
        // Derived subquery name comes back as the inner table.
        assert_eq!(name, "t1");
    }

    #[test]
    fn extract_table_select_with_window_function() {
        let sql = "SELECT id, ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) FROM events";
        assert_eq!(extract_table_name(sql).unwrap(), "events");
    }

    #[test]
    fn extract_table_multiline_sql() {
        let sql = "SELECT *\n  FROM orders\n WHERE active = true";
        assert_eq!(extract_table_name(sql).unwrap(), "orders");
    }

    #[test]
    fn extract_table_with_only_semicolon_errors() {
        let result = extract_table_name(";");
        assert!(result.is_err());
    }

    #[test]
    fn execute_distributed_query_drop_table_returns_err() {
        let result = execute_distributed_query("DROP TABLE foo", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn execute_distributed_query_insert_returns_err() {
        let result = execute_distributed_query("INSERT INTO foo VALUES (1)", false);
        assert!(matches!(result, Err(_)));
    }

    #[test]
    fn execute_distributed_query_select_constant_no_pool() {
        // SELECT without FROM goes through local query path which needs pool.
        let result = execute_distributed_query("SELECT 'hello'", false);
        assert!(matches!(result, Err(_)));
    }
}
