//! Distributed scheduler lifecycle: singleton management, query submission,
//! and co-location detection for distributed query execution.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex, OnceLock};

use arrow::array::RecordBatch;
use arrow::datatypes::SchemaRef;
use datafusion::prelude::SessionContext;

use crate::catalog;
use crate::logging::SwarmLogger;

pub struct SchedulerConfig {
    pub bind_addr: String,
}

struct SchedulerHandle {
    runtime: tokio::runtime::Runtime,
    bind_addr: String,
    ctx: Arc<tokio::sync::RwLock<SessionContext>>,
    active_queries: Arc<AtomicUsize>,
}

/// RAII guard that decrements active_queries on drop.
struct QueryGuard(Arc<AtomicUsize>);
impl Drop for QueryGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, AtomicOrdering::SeqCst);
    }
}

static SCHEDULER: OnceLock<Mutex<Option<SchedulerHandle>>> = OnceLock::new();

fn scheduler_lock() -> &'static Mutex<Option<SchedulerHandle>> {
    SCHEDULER.get_or_init(|| Mutex::new(None))
}

pub fn start_scheduler(config: SchedulerConfig) -> Result<(), String> {
    let mut guard = scheduler_lock()
        .lock()
        .map_err(|_| "Scheduler lock poisoned".to_string())?;

    if guard.is_some() {
        return Err("Scheduler is already running".to_string());
    }

    // Create the Tokio runtime on a separate thread to avoid "Cannot start a
    // runtime from within a runtime" when called from a DuckDB scalar function
    // that has previously used block_on on the gossip runtime (leaving a
    // thread-local Tokio context).
    let runtime = std::thread::spawn(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
    })
    .join()
    .map_err(|_| "Runtime creation thread panicked".to_string())?
    .map_err(|e| format!("Failed to create scheduler runtime: {e}"))?;

    let rt_handle = runtime.handle().clone();

    // Fetch catalog classifications and CatalogStats.  GossipRegistry methods
    // use exec_on_runtime() internally (spawn + channel), so they are safe to
    // call from any context — no need for a dedicated thread.
    let classifications = catalog::classify_tables().unwrap_or_default();
    let catalog_stats = std::sync::Arc::new(
        crate::shuffle_optimizer::CatalogStats::from_catalog(rt_handle.clone()),
    );

    // Create the DataFusion session on a separate thread so we can use
    // block_on() without interfering with the current thread.
    let ctx = {
        let h = rt_handle.clone();
        std::thread::spawn(move || {
            h.block_on(async {
                if classifications.is_empty() {
                    crate::federation_executor::create_duckdb_session()
                        .await
                        .map_err(|e| format!("Failed to create local session: {e}"))
                } else {
                    crate::federation_executor::create_distributed_session_with_classifications(
                        h.clone(),
                        classifications,
                        catalog_stats,
                    )
                    .await
                    .map_err(|e| format!("Failed to create distributed session: {e}"))
                }
            })
        })
        .join()
        .map_err(|_| "Scheduler initialization thread panicked".to_string())?
    }?;

    SwarmLogger::info(
        "scheduler",
        &format!("Scheduler started on {}", config.bind_addr),
    );

    *guard = Some(SchedulerHandle {
        runtime,
        bind_addr: config.bind_addr,
        ctx: Arc::new(tokio::sync::RwLock::new(ctx)),
        active_queries: Arc::new(AtomicUsize::new(0)),
    });

    Ok(())
}

pub fn stop_scheduler() -> Result<(), String> {
    let active = {
        let guard = scheduler_lock()
            .lock()
            .map_err(|_| "Scheduler lock poisoned".to_string())?;
        let handle = guard
            .as_ref()
            .ok_or_else(|| "Scheduler is not running".to_string())?;
        Arc::clone(&handle.active_queries)
    };

    // Wait up to 5 seconds for active queries to drain.
    for _ in 0..50 {
        if active.load(AtomicOrdering::SeqCst) == 0 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let mut guard = scheduler_lock()
        .lock()
        .map_err(|_| "Scheduler lock poisoned".to_string())?;

    let handle = guard
        .take()
        .ok_or_else(|| "Scheduler is not running".to_string())?;

    SwarmLogger::info(
        "scheduler",
        &format!("Scheduler stopped (was on {})", handle.bind_addr),
    );

    Ok(())
}

/// Rebuild session context from catalog to pick up cluster topology changes.
pub fn refresh_session() -> Result<(), String> {
    let (rt_handle, ctx_lock) = {
        let guard = scheduler_lock()
            .lock()
            .map_err(|_| "Scheduler lock poisoned".to_string())?;
        let handle = guard
            .as_ref()
            .ok_or_else(|| "Scheduler is not running".to_string())?;
        (handle.runtime.handle().clone(), Arc::clone(&handle.ctx))
    };

    // Fetch classifications and CatalogStats.  GossipRegistry methods are
    // safe to call from any context (no runtime nesting).
    let classifications = catalog::classify_tables().unwrap_or_default();
    let catalog_stats = std::sync::Arc::new(
        crate::shuffle_optimizer::CatalogStats::from_catalog(rt_handle.clone()),
    );

    // Rebuild session on a separate thread for block_on().
    let new_ctx = {
        let h = rt_handle.clone();
        std::thread::spawn(move || {
            h.block_on(async {
                if classifications.is_empty() {
                    crate::federation_executor::create_duckdb_session()
                        .await
                        .map_err(|e| format!("Failed to rebuild local session: {e}"))
                } else {
                    crate::federation_executor::create_distributed_session_with_classifications(
                        h.clone(),
                        classifications,
                        catalog_stats,
                    )
                    .await
                    .map_err(|e| format!("Failed to rebuild distributed session: {e}"))
                }
            })
        })
        .join()
        .map_err(|_| "Session refresh thread panicked".to_string())?
    }?;

    {
        let h = rt_handle.clone();
        std::thread::spawn(move || {
            h.block_on(async {
                let mut ctx_write = ctx_lock.write().await;
                *ctx_write = new_ctx;
            })
        })
        .join()
        .map_err(|_| "Session refresh write thread panicked".to_string())?;
    }

    crate::logging::SwarmLogger::info(
        "scheduler",
        "Session refreshed with updated catalog",
    );

    Ok(())
}

pub fn is_scheduler_running() -> bool {
    scheduler_lock()
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn submit_query(sql: &str) -> Result<(SchemaRef, Vec<RecordBatch>), String> {
    // Release the lock before block_on to avoid holding it across await points.
    let (rt_handle, ctx, active) = {
        let guard = scheduler_lock()
            .lock()
            .map_err(|_| "Scheduler lock poisoned".to_string())?;
        let handle = guard
            .as_ref()
            .ok_or_else(|| "Scheduler is not running".to_string())?;
        (handle.runtime.handle().clone(), Arc::clone(&handle.ctx), Arc::clone(&handle.active_queries))
    };

    active.fetch_add(1, AtomicOrdering::SeqCst);
    let _guard = QueryGuard(active);

    let sql = sql.to_string();
    // Run block_on in a separate thread to avoid nested-runtime panic when
    // called from a DuckDB function that is inside a tokio context.
    let (schema, batches) = std::thread::spawn(move || {
        rt_handle.block_on(async {
            let ctx_read = ctx.read().await;
            let df = ctx_read
                .sql(&sql)
                .await
                .map_err(|e| format!("Distributed SQL planning failed: {e}"))?;
            // Capture schema from the DataFrame before collect() so we have
            // column metadata even when the result set is empty.
            let schema: SchemaRef = Arc::new(df.schema().as_arrow().clone());
            let batches = df.collect()
                .await
                .map_err(|e| format!("Distributed query execution failed: {e}"))?;
            Ok::<_, String>((schema, batches))
        })
    })
    .join()
    .map_err(|_| "Query execution thread panicked".to_string())??;

    Ok((schema, batches))
}

/// Returns `Some(flight_endpoint)` if all tables are co-located, `None` if distributed.
pub fn check_colocation(table_names: &[String]) -> Result<Option<String>, String> {
    if table_names.is_empty() {
        return Ok(None);
    }

    let all_entries = catalog::get_all_tables()?;

    let mut table_nodes: HashMap<&str, Vec<(&str, Option<&str>)>> = HashMap::new();
    for entry in &all_entries {
        table_nodes
            .entry(&entry.table_name)
            .or_default()
            .push((&entry.node_id, entry.flight_endpoint.as_deref()));
    }

    for name in table_names {
        if !table_nodes.contains_key(name.as_str()) {
            SwarmLogger::debug(
                "scheduler",
                &format!("Co-location check: table '{}' not found in catalog", name),
            );
            return Ok(None);
        }
    }

    let mut candidate_nodes: Option<HashMap<&str, Option<&str>>> = None;

    for name in table_names {
        let nodes_for_table: HashMap<&str, Option<&str>> = table_nodes
            .get(name.as_str())
            .unwrap() // safe: existence checked above
            .iter()
            .map(|&(node_id, endpoint)| (node_id, endpoint))
            .collect();

        candidate_nodes = Some(match candidate_nodes {
            None => nodes_for_table,
            Some(prev) => prev
                .into_iter()
                .filter(|(node_id, _)| nodes_for_table.contains_key(node_id))
                .collect(),
        });
    }

    if let Some(candidates) = candidate_nodes {
        for (_node_id, endpoint) in &candidates {
            if let Some(ep) = endpoint {
                SwarmLogger::debug(
                    "scheduler",
                    &format!(
                        "Co-location check: all {} table(s) co-located at {}",
                        table_names.len(),
                        ep,
                    ),
                );
                return Ok(Some(ep.to_string()));
            }
        }
    }

    SwarmLogger::debug(
        "scheduler",
        &format!(
            "Co-location check: {} table(s) require distributed execution",
            table_names.len(),
        ),
    );

    Ok(None)
}

/// Extract table names from FROM/JOIN clauses. Returns empty vec on parse failure.
pub fn extract_table_names_from_sql(sql: &str) -> Vec<String> {
    use sqlparser::ast::Statement;
    use sqlparser::dialect::GenericDialect;
    use sqlparser::parser::Parser;

    let dialect = GenericDialect {};
    let statements = match Parser::parse_sql(&dialect, sql) {
        Ok(stmts) => stmts,
        Err(_) => return Vec::new(),
    };

    let mut names = Vec::new();

    for stmt in &statements {
        if let Statement::Query(query) = stmt {
            collect_table_names_from_set_expr(query.body.as_ref(), &mut names);
        }
    }

    names.sort();
    names.dedup();
    names
}

fn collect_table_names_from_set_expr(
    set_expr: &sqlparser::ast::SetExpr,
    names: &mut Vec<String>,
) {
    use sqlparser::ast::SetExpr;

    match set_expr {
        SetExpr::Select(select) => {
            for table_with_joins in &select.from {
                collect_table_names_from_table_factor(&table_with_joins.relation, names);
                for join in &table_with_joins.joins {
                    collect_table_names_from_table_factor(&join.relation, names);
                }
            }
        }
        SetExpr::SetOperation { left, right, .. } => {
            collect_table_names_from_set_expr(left, names);
            collect_table_names_from_set_expr(right, names);
        }
        SetExpr::Query(query) => {
            collect_table_names_from_set_expr(query.body.as_ref(), names);
        }
        _ => {}
    }
}

fn collect_table_names_from_table_factor(
    factor: &sqlparser::ast::TableFactor,
    names: &mut Vec<String>,
) {
    use sqlparser::ast::TableFactor;

    match factor {
        TableFactor::Table { name, .. } => {
            // Use last part of qualified name (e.g. "schema.table" -> "table").
            let table_name = name
                .0
                .last()
                .map(|ident| ident.value.clone())
                .unwrap_or_default();
            if !table_name.is_empty() {
                names.push(table_name);
            }
        }
        TableFactor::Derived { subquery, .. } => {
            collect_table_names_from_set_expr(subquery.body.as_ref(), names);
        }
        TableFactor::NestedJoin { table_with_joins, .. } => {
            collect_table_names_from_table_factor(&table_with_joins.relation, names);
            for join in &table_with_joins.joins {
                collect_table_names_from_table_factor(&join.relation, names);
            }
        }
        _ => {}
    }
}

pub fn check_colocation_for_sql(sql: &str) -> Result<Option<String>, String> {
    let table_names = extract_table_names_from_sql(sql);
    check_colocation(&table_names)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scheduler_not_running_initially() {
        assert!(!is_scheduler_running());
    }

    #[test]
    fn submit_query_without_scheduler_returns_error() {
        let result = submit_query("SELECT 1");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not running"));
    }

    #[test]
    fn check_colocation_empty_tables() {
        let result = check_colocation(&[]);
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn stop_scheduler_when_not_running_returns_error() {
        let result = stop_scheduler();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not running"));
    }

    #[test]
    fn extract_tables_simple_select() {
        let tables = extract_table_names_from_sql("SELECT * FROM orders");
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_join() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders o JOIN customers c ON o.id = c.id",
        );
        assert!(tables.contains(&"orders".to_string()), "Should contain 'orders': {:?}", tables);
        assert!(tables.contains(&"customers".to_string()), "Should contain 'customers': {:?}", tables);
    }

    #[test]
    fn extract_tables_empty_on_error() {
        let tables = extract_table_names_from_sql("NOT VALID SQL !!!@#$");
        assert!(tables.is_empty(), "Invalid SQL should return empty vec: {:?}", tables);
    }

    #[test]
    fn extract_tables_empty_sql_returns_empty() {
        let tables = extract_table_names_from_sql("");
        assert!(tables.is_empty(), "Empty SQL should return empty vec: {:?}", tables);
    }

    #[test]
    fn extract_tables_qualified_name_uses_last_part() {
        let tables = extract_table_names_from_sql("SELECT * FROM myschema.orders");
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_three_part_qualified_name() {
        let tables = extract_table_names_from_sql("SELECT * FROM mydb.myschema.orders");
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_dedups_repeated_references() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders o1 JOIN orders o2 ON o1.parent_id = o2.id",
        );
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_set_operation_union() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM orders UNION SELECT id FROM customers",
        );
        // Sorted: customers, orders
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_set_operation_intersect() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM orders INTERSECT SELECT id FROM customers",
        );
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_derived_subquery() {
        let tables = extract_table_names_from_sql(
            "SELECT x.id FROM (SELECT id FROM orders) x",
        );
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_nested_subquery_in_set_expr() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM (SELECT id FROM orders UNION SELECT id FROM customers) sub",
        );
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_multiple_joins() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders o \
             JOIN customers c ON o.cust_id = c.id \
             JOIN products p ON o.prod_id = p.id",
        );
        assert_eq!(tables, vec!["customers", "orders", "products"]);
    }

    #[test]
    fn extract_tables_left_outer_join() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders LEFT JOIN customers ON orders.id = customers.id",
        );
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_results_are_sorted() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM zebras z JOIN apples a ON z.id = a.id JOIN mangos m ON a.id = m.id",
        );
        let mut sorted = tables.clone();
        sorted.sort();
        assert_eq!(tables, sorted);
    }

    #[test]
    fn extract_tables_non_select_statement() {
        // CREATE TABLE is not a Query statement -- should return empty.
        let tables = extract_table_names_from_sql("CREATE TABLE foo (id INT)");
        assert!(tables.is_empty(), "Non-query statement should return empty: {:?}", tables);
    }

    #[test]
    fn extract_tables_where_clause_subquery_ignored_or_included() {
        // WHERE clause subqueries aren't visited via SetExpr::Select.from, so
        // they should not appear -- only top-level FROM tables.
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders WHERE id IN (SELECT id FROM customers)",
        );
        assert!(tables.contains(&"orders".to_string()), "Expected orders: {:?}", tables);
    }

    #[test]
    fn check_colocation_for_sql_with_invalid_sql_returns_none() {
        // Invalid SQL parses to empty table list, which short-circuits to Ok(None).
        let result = check_colocation_for_sql("NOT VALID @@@");
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn check_colocation_for_sql_with_empty_query_returns_none() {
        let result = check_colocation_for_sql("");
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn refresh_session_when_not_running_returns_error() {
        let result = refresh_session();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not running"));
    }

    #[test]
    fn extract_tables_cte_with_main_query() {
        // CTEs are query-level constructs; the main FROM still picks up orders.
        let tables = extract_table_names_from_sql(
            "WITH cte AS (SELECT 1 AS x) SELECT * FROM orders",
        );
        assert!(tables.contains(&"orders".to_string()), "Expected orders in {:?}", tables);
    }

    #[test]
    fn query_guard_decrements_on_drop() {
        let active = Arc::new(AtomicUsize::new(5));
        {
            let _g = QueryGuard(Arc::clone(&active));
            assert_eq!(active.load(AtomicOrdering::SeqCst), 5);
        }
        assert_eq!(active.load(AtomicOrdering::SeqCst), 4);
    }

    #[test]
    fn query_guard_multiple_drops_decrement_independently() {
        let active = Arc::new(AtomicUsize::new(3));
        {
            let _g1 = QueryGuard(Arc::clone(&active));
            let _g2 = QueryGuard(Arc::clone(&active));
            let _g3 = QueryGuard(Arc::clone(&active));
            assert_eq!(active.load(AtomicOrdering::SeqCst), 3);
        }
        assert_eq!(active.load(AtomicOrdering::SeqCst), 0);
    }

    #[test]
    fn scheduler_config_holds_bind_addr() {
        let cfg = SchedulerConfig {
            bind_addr: "0.0.0.0:9999".to_string(),
        };
        assert_eq!(cfg.bind_addr, "0.0.0.0:9999");
    }

    // ---------- extract_table_names_from_sql: additional SQL shapes ----------

    #[test]
    fn extract_tables_full_outer_join() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders FULL OUTER JOIN customers ON orders.cid = customers.id",
        );
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_cross_join() {
        let tables = extract_table_names_from_sql("SELECT * FROM a CROSS JOIN b");
        assert_eq!(tables, vec!["a", "b"]);
    }

    #[test]
    fn extract_tables_intersect_set_operation() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM a INTERSECT SELECT id FROM b",
        );
        assert_eq!(tables, vec!["a", "b"]);
    }

    #[test]
    fn extract_tables_except_set_operation() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM a EXCEPT SELECT id FROM b",
        );
        assert_eq!(tables, vec!["a", "b"]);
    }

    #[test]
    fn extract_tables_multiple_unions() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM a UNION SELECT id FROM b UNION SELECT id FROM c",
        );
        assert_eq!(tables, vec!["a", "b", "c"]);
    }

    #[test]
    fn extract_tables_nested_derived_subquery() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM (SELECT * FROM (SELECT * FROM inner_t) AS m) AS o",
        );
        assert_eq!(tables, vec!["inner_t"]);
    }

    #[test]
    fn extract_tables_subquery_in_join() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders JOIN (SELECT id FROM customers) c ON orders.cid = c.id",
        );
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_quoted_identifier() {
        let tables = extract_table_names_from_sql(r#"SELECT * FROM "Order Items""#);
        assert_eq!(tables, vec!["Order Items"]);
    }

    #[test]
    fn extract_tables_with_order_by_and_limit() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders ORDER BY id LIMIT 10",
        );
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_with_group_by_having() {
        let tables = extract_table_names_from_sql(
            "SELECT cust, SUM(total) FROM orders GROUP BY cust HAVING SUM(total) > 100",
        );
        assert_eq!(tables, vec!["orders"]);
    }

    #[test]
    fn extract_tables_select_constant_returns_empty() {
        // SELECT without FROM should still return empty.
        let tables = extract_table_names_from_sql("SELECT 1 + 1");
        assert!(tables.is_empty());
    }

    #[test]
    fn extract_tables_select_only_whitespace_returns_empty() {
        let tables = extract_table_names_from_sql("   \n\t  ");
        assert!(tables.is_empty());
    }

    #[test]
    fn extract_tables_multiple_distinct_qualified_names() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM s1.orders JOIN s2.customers ON s1.orders.cid = s2.customers.id",
        );
        // Last component is used; both names survive in sorted order.
        assert_eq!(tables, vec!["customers", "orders"]);
    }

    #[test]
    fn extract_tables_drop_statement_returns_empty() {
        let tables = extract_table_names_from_sql("DROP TABLE foo");
        assert!(tables.is_empty());
    }

    #[test]
    fn extract_tables_insert_statement_returns_empty() {
        let tables = extract_table_names_from_sql("INSERT INTO foo VALUES (1)");
        assert!(tables.is_empty());
    }

    #[test]
    fn extract_tables_update_statement_returns_empty() {
        let tables = extract_table_names_from_sql("UPDATE foo SET x = 1");
        assert!(tables.is_empty());
    }

    #[test]
    fn extract_tables_with_clause_then_join() {
        // CTE with a join in the main query — both joined tables surface.
        let tables = extract_table_names_from_sql(
            "WITH cte AS (SELECT 1) SELECT * FROM orders JOIN customers ON orders.cid = customers.id",
        );
        assert!(tables.contains(&"orders".to_string()));
        assert!(tables.contains(&"customers".to_string()));
    }

    // ---------- check_colocation / check_colocation_for_sql edge cases ----------

    #[test]
    fn check_colocation_without_gossip_returns_err() {
        // Non-empty table list reaches catalog::get_all_tables() which requires gossip.
        let result = check_colocation(&["orders".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn check_colocation_for_sql_with_valid_query_without_gossip_returns_err() {
        // Valid SQL produces a non-empty table list -> check_colocation -> gossip err.
        let result = check_colocation_for_sql("SELECT * FROM orders");
        assert!(result.is_err());
    }

    #[test]
    fn check_colocation_for_sql_whitespace_returns_none() {
        // Whitespace -> empty table list -> short-circuits to Ok(None).
        let result = check_colocation_for_sql("    ");
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn check_colocation_for_sql_select_constant_returns_none() {
        // No FROM clause -> empty table list -> Ok(None).
        let result = check_colocation_for_sql("SELECT 1");
        assert_eq!(result.unwrap(), None);
    }

    // ---------- query_guard / scheduler lifecycle ----------

    #[test]
    fn query_guard_starts_from_zero() {
        let active = Arc::new(AtomicUsize::new(1));
        {
            let _g = QueryGuard(Arc::clone(&active));
        }
        assert_eq!(active.load(AtomicOrdering::SeqCst), 0);
    }

    #[test]
    fn submit_query_with_select_from_table_returns_not_running_error() {
        // Even valid SELECT — without a running scheduler we get the same error.
        let result = submit_query("SELECT * FROM orders");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not running"));
    }

    #[test]
    fn submit_query_empty_string_returns_not_running_error() {
        let result = submit_query("");
        assert!(result.is_err());
    }

    #[test]
    fn scheduler_config_can_be_constructed_with_arbitrary_address() {
        let cfg = SchedulerConfig {
            bind_addr: "[::1]:0".to_string(),
        };
        assert_eq!(cfg.bind_addr, "[::1]:0");
    }

    // ---------- extract_table_names_from_sql: more edge SQL shapes ----------

    #[test]
    fn extract_tables_natural_join() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders NATURAL JOIN customers",
        );
        assert!(tables.contains(&"orders".to_string()));
        assert!(tables.contains(&"customers".to_string()));
    }

    #[test]
    fn extract_tables_self_join_via_aliases() {
        let tables = extract_table_names_from_sql(
            "SELECT * FROM employees e1 JOIN employees e2 ON e1.mgr_id = e2.id",
        );
        // Same underlying table — dedup keeps it once.
        assert_eq!(tables, vec!["employees"]);
    }

    #[test]
    fn extract_tables_union_all_keeps_both() {
        let tables = extract_table_names_from_sql(
            "SELECT id FROM a UNION ALL SELECT id FROM b",
        );
        assert_eq!(tables, vec!["a", "b"]);
    }

    #[test]
    fn extract_tables_idempotent_on_repeated_call() {
        let sql = "SELECT * FROM orders JOIN customers ON orders.cid = customers.id";
        let a = extract_table_names_from_sql(sql);
        let b = extract_table_names_from_sql(sql);
        assert_eq!(a, b);
    }

    #[test]
    fn extract_tables_complex_query_with_subquery_in_where() {
        // WHERE-clause subqueries are NOT visited (only FROM/JOIN are walked).
        let tables = extract_table_names_from_sql(
            "SELECT * FROM orders WHERE id IN (SELECT order_id FROM line_items)",
        );
        // Only "orders" comes from FROM; "line_items" lives in a WHERE subquery.
        assert!(tables.contains(&"orders".to_string()));
        assert!(!tables.contains(&"line_items".to_string()));
    }
}
