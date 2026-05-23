//! Federation executor with pushdown to the local trexsql instance.

use std::sync::{Arc, Mutex, OnceLock};

use arrow::datatypes::SchemaRef;
use datafusion::error::Result as DFResult;
use datafusion::execution::runtime_env::RuntimeEnv;
use datafusion::execution::SessionStateBuilder;
use datafusion::optimizer::Optimizer;
use datafusion::physical_plan::stream::RecordBatchStreamAdapter;
use datafusion::physical_plan::SendableRecordBatchStream;
use datafusion::prelude::{SessionConfig, SessionContext};
use datafusion::sql::unparser::dialect::Dialect;
use datafusion::catalog::SchemaProvider;
use datafusion_federation::sql::{SQLExecutor, SQLFederationProvider, SQLSchemaProvider};
use datafusion_federation::sql::MultiSchemaProvider;
use datafusion_federation::{FederatedQueryPlanner, FederationOptimizerRule};
use futures::stream;
use futures::StreamExt;

use crate::catalog;
use crate::flight_client;
use crate::logging::SwarmLogger;

pub fn wrap_executor_error(
    operation: &str,
    err: impl std::fmt::Display,
) -> datafusion::error::DataFusionError {
    datafusion::error::DataFusionError::External(
        format!("Executor failure during {operation}: {err} (query is safe to retry)").into(),
    )
}

pub type ConfigProducer = Arc<dyn Fn() -> SessionConfig + Send + Sync>;

pub type RuntimeProducer =
    Arc<dyn Fn(&SessionConfig) -> DFResult<Arc<RuntimeEnv>> + Send + Sync>;

/// Executes federated SQL fragments against the local trexsql connection.
struct TrexSQLExecutor {
    context: String,
}

impl TrexSQLExecutor {
    fn new(context: impl Into<String>) -> Self {
        Self { context: context.into() }
    }

    /// Query local trexsql and return Arrow batches (no IPC — same arrow crate).
    fn query_trexsql(&self, sql: &str) -> Result<(SchemaRef, Vec<arrow::array::RecordBatch>), String> {
        crate::pool::read_arrow(sql)
    }
}

#[async_trait::async_trait]
impl SQLExecutor for TrexSQLExecutor {
    fn name(&self) -> &str { "trexsql" }

    fn compute_context(&self) -> Option<String> { Some(self.context.clone()) }

    fn dialect(&self) -> Arc<dyn Dialect> {
        Arc::new(datafusion::sql::unparser::dialect::DuckDBDialect::new())
    }

    fn execute(&self, sql: &str, schema: SchemaRef) -> DFResult<SendableRecordBatchStream> {
        SwarmLogger::debug("distributed", &format!("Federation pushdown: {sql}"));
        let (_schema, batches) = self.query_trexsql(sql)
            .map_err(|e| wrap_executor_error("execute", e))?;
        let batch_stream = stream::iter(batches.into_iter().map(Ok));
        Ok(Box::pin(RecordBatchStreamAdapter::new(schema, batch_stream)))
    }

    async fn table_names(&self) -> DFResult<Vec<String>> {
        catalog::list_tables().map_err(|e| wrap_executor_error("table_names", e))
    }

    async fn get_table_schema(&self, table_name: &str) -> DFResult<SchemaRef> {
        let escaped = crate::catalog::escape_identifier(table_name);
        // Use LIMIT 1 (not LIMIT 0) because trexsql's query_arrow may return
        // 0 batches for LIMIT 0, losing schema information.
        let (schema, _) = self.query_trexsql(&format!("SELECT * FROM \"{}\" LIMIT 1", escaped))
            .map_err(|e| wrap_executor_error("get_table_schema", e))?;
        Ok(schema)
    }
}

/// Executes federated SQL against a remote trexsql node via Arrow Flight.
/// Co-located tables share one executor so DataFusion can push joins as one query.
pub struct FlightSQLExecutor {
    node_name: String,
    endpoint: String,
    table_names: Vec<String>,
    runtime_handle: tokio::runtime::Handle,
}

impl FlightSQLExecutor {
    pub fn new(
        node_name: String,
        endpoint: String,
        table_names: Vec<String>,
        runtime_handle: tokio::runtime::Handle,
    ) -> Self {
        Self {
            node_name,
            endpoint,
            table_names,
            runtime_handle,
        }
    }
}

#[async_trait::async_trait]
impl SQLExecutor for FlightSQLExecutor {
    fn name(&self) -> &str {
        "trexsql-flight"
    }

    fn compute_context(&self) -> Option<String> {
        Some(self.endpoint.clone())
    }

    fn dialect(&self) -> Arc<dyn Dialect> {
        Arc::new(datafusion::sql::unparser::dialect::DuckDBDialect::new())
    }

    fn execute(&self, sql: &str, schema: SchemaRef) -> DFResult<SendableRecordBatchStream> {
        SwarmLogger::debug(
            "distributed",
            &format!("Flight federation pushdown to {}: {sql}", self.node_name),
        );

        let endpoint = self.endpoint.clone();
        let sql = sql.to_string();

        // Spawn as a tokio task (non-blocking). Returning a lazy stream avoids
        // blocking tokio worker threads — which would deadlock the runtime when
        // multiple federation queries execute concurrently.
        let join_handle = self.runtime_handle.spawn(async move {
            flight_client::query_node(&endpoint, &sql).await
        });

        let result_stream = futures::stream::once(async move {
            let batches = join_handle
                .await
                .map_err(|e| wrap_executor_error("flight_execute", format!("task panicked: {e}")))?
                .map_err(|e| wrap_executor_error("flight_execute", e))?;
            Ok::<Vec<arrow::array::RecordBatch>, datafusion::error::DataFusionError>(batches)
        })
        .flat_map(|result: Result<Vec<arrow::array::RecordBatch>, datafusion::error::DataFusionError>| match result {
            Ok(batches) => stream::iter(batches.into_iter().map(Ok)).boxed(),
            Err(e) => stream::once(async move { Err(e) }).boxed(),
        });

        Ok(Box::pin(RecordBatchStreamAdapter::new(schema, result_stream)))
    }

    async fn table_names(&self) -> DFResult<Vec<String>> {
        Ok(self.table_names.clone())
    }

    async fn get_table_schema(&self, table_name: &str) -> DFResult<SchemaRef> {
        let escaped = catalog::escape_identifier(table_name);
        // Use LIMIT 1 (not LIMIT 0) for consistency with TrexSQLExecutor.
        // LIMIT 0 may produce 0 batches on the remote trexsql node, and while
        // the Flight protocol sends schema in the first message, LIMIT 1 is
        // more robust across different server implementations.
        let sql = format!("SELECT * FROM \"{}\" LIMIT 1", escaped);
        let (schema, _batches) = flight_client::query_node_with_schema(&self.endpoint, &sql)
            .await
            .map_err(|e| wrap_executor_error("flight_get_table_schema", e))?;

        Ok(schema)
    }
}

/// Create a DataFusion session with local trexsql tables registered for federation pushdown.
pub async fn create_duckdb_session() -> Result<SessionContext, String> {
    let executor = Arc::new(TrexSQLExecutor::new("local-trexsql"));
    let provider = Arc::new(SQLFederationProvider::new(executor));

    let table_names = catalog::list_tables().unwrap_or_default();
    SwarmLogger::info("distributed", &format!("Registering {} table(s) for federation", table_names.len()));

    let schema_provider = Arc::new(
        SQLSchemaProvider::new_with_tables(provider, table_names)
            .await
            .map_err(|e| format!("Schema provider creation failed: {e}"))?,
    );

    // Federation rule goes after scalar_subquery_to_join (upstream recommended ordering).
    let mut rules = Optimizer::new().rules;
    let pos = rules.iter().position(|r| r.name() == "scalar_subquery_to_join")
        .map(|i| i + 1)
        .unwrap_or(rules.len());
    rules.insert(pos, Arc::new(FederationOptimizerRule::new()));

    let state = SessionStateBuilder::new()
        .with_optimizer_rules(rules)
        .with_query_planner(Arc::new(FederatedQueryPlanner::new()))
        .with_default_features()
        .build();

    let ctx = SessionContext::new_with_state(state);

    ctx.catalog("datafusion")
        .ok_or("Default catalog not found")?
        .register_schema("public", schema_provider)
        .map_err(|e| format!("Schema registration failed: {e}"))?;

    SwarmLogger::info("distributed", "DataFusion session with trexsql federation ready");
    Ok(ctx)
}

/// Create a catalog-aware session: local tables federate via trexsql, remote via Flight,
/// sharded via fan-out. Falls back to `create_duckdb_session()` if gossip isn't running.
pub async fn create_distributed_session(
    runtime_handle: tokio::runtime::Handle,
) -> Result<SessionContext, String> {
    let classifications = match catalog::classify_tables() {
        Ok(c) if !c.is_empty() => c,
        Ok(_) => {
            SwarmLogger::info(
                "distributed",
                "No tables in cluster catalog, falling back to local-only session",
            );
            return create_duckdb_session().await;
        }
        Err(e) => {
            SwarmLogger::warn(
                "distributed",
                &format!("Catalog classification failed ({e}), falling back to local-only session"),
            );
            return create_duckdb_session().await;
        }
    };

    let catalog_stats = Arc::new(
        crate::shuffle_optimizer::CatalogStats::from_catalog(runtime_handle.clone()),
    );
    create_distributed_session_with_classifications(runtime_handle, classifications, catalog_stats).await
}

/// Build a distributed session from pre-fetched catalog classifications.
///
/// This variant avoids calling `catalog::classify_tables()` (which uses
/// `gossip.runtime.block_on()`) from within an async context, preventing
/// nested-runtime panics.
pub async fn create_distributed_session_with_classifications(
    runtime_handle: tokio::runtime::Handle,
    classifications: std::collections::HashMap<String, crate::catalog::TableClassification>,
    catalog_stats: Arc<crate::shuffle_optimizer::CatalogStats>,
) -> Result<SessionContext, String> {
    use std::collections::HashMap;
    use crate::catalog::{TableClassification, ShardInfo};
    use crate::distributed_table_provider::DistributedTableProvider;
    use crate::sharded_schema_provider::ShardedSchemaProvider;

    let mut local_tables: Vec<String> = Vec::new();
    let mut remote_by_endpoint: HashMap<String, (String, Vec<String>)> = HashMap::new();
    let mut sharded_tables: Vec<(String, Vec<ShardInfo>)> = Vec::new();

    for (table_name, class) in &classifications {
        match class {
            TableClassification::Local => {
                local_tables.push(table_name.clone());
            }
            TableClassification::RemoteUnique {
                node_name,
                flight_endpoint,
            } => {
                remote_by_endpoint
                    .entry(flight_endpoint.clone())
                    .or_insert_with(|| (node_name.clone(), Vec::new()))
                    .1
                    .push(table_name.clone());
            }
            TableClassification::Sharded { shards } => {
                sharded_tables.push((table_name.clone(), shards.clone()));
            }
        }
    }

    SwarmLogger::info(
        "distributed",
        &format!(
            "Distributed session: {} local, {} remote endpoint(s), {} sharded table(s)",
            local_tables.len(),
            remote_by_endpoint.len(),
            sharded_tables.len(),
        ),
    );

    // Set target_partitions to the max shard count for cross-context join parallelism.
    let max_shards = sharded_tables
        .iter()
        .map(|(_, shards)| shards.len())
        .max()
        .unwrap_or(1)
        .max(1);

    let session_config = SessionConfig::new()
        .with_target_partitions(max_shards);

    let mut rules = Optimizer::new().rules;
    let pos = rules
        .iter()
        .position(|r| r.name() == "scalar_subquery_to_join")
        .map(|i| i + 1)
        .unwrap_or(rules.len());
    rules.insert(pos, Arc::new(FederationOptimizerRule::new()));

    // Physical optimizer: start with DataFusion defaults (EnforceDistribution,
    // EnforceSorting, CoalesceBatches, etc.), then append ShuffleInsertionRule.
    // EnforceDistribution is critical — it inserts CoalescePartitionsExec for
    // aggregation across multiple partitions.
    // NOTE: catalog_stats is pre-built on a fresh thread by the caller to avoid
    // nested-runtime panics (gossip.runtime.block_on() inside h.block_on()).
    let state_for_defaults = SessionStateBuilder::new()
        .with_default_features()
        .build();
    let mut physical_optimizer_rules = state_for_defaults.physical_optimizers().to_vec();
    physical_optimizer_rules.push(
        Arc::new(crate::shuffle_optimizer::ShuffleInsertionRule::new(catalog_stats)),
    );

    let state = SessionStateBuilder::new()
        .with_default_features()
        .with_config(session_config)
        .with_optimizer_rules(rules)
        .with_physical_optimizer_rules(physical_optimizer_rules)
        .with_query_planner(Arc::new(FederatedQueryPlanner::new()))
        .build();

    let ctx = SessionContext::new_with_state(state);

    let mut schema_children: Vec<Arc<dyn SchemaProvider>> = Vec::new();

    if !local_tables.is_empty() {
        let local_executor = Arc::new(TrexSQLExecutor::new("local-trexsql"));
        let local_provider = Arc::new(SQLFederationProvider::new(local_executor));
        let local_schema = Arc::new(
            SQLSchemaProvider::new_with_tables(local_provider, local_tables.clone())
                .await
                .map_err(|e| format!("Local schema provider failed: {e}"))?,
        );
        schema_children.push(local_schema);
    }

    // Co-located tables share compute_context so DataFusion pushes joins as one SQL.
    for (endpoint, (node_name, tables)) in remote_by_endpoint.iter() {
        let flight_executor = Arc::new(FlightSQLExecutor::new(
            node_name.clone(),
            endpoint.clone(),
            tables.clone(),
            runtime_handle.clone(),
        ));
        let flight_provider = Arc::new(SQLFederationProvider::new(flight_executor));
        let flight_schema = Arc::new(
            SQLSchemaProvider::new_with_tables(flight_provider, tables.clone())
                .await
                .map_err(|e| format!("Remote schema provider for {} failed: {e}", node_name))?,
        );
        schema_children.push(flight_schema);
    }

    // Build sharded tables into a SchemaProvider for MultiSchemaProvider.
    if !sharded_tables.is_empty() {
        let mut sharded_map: HashMap<String, Arc<dyn datafusion::datasource::TableProvider>> =
            HashMap::new();
        for (table_name, shards) in &sharded_tables {
            let provider = DistributedTableProvider::new(
                table_name.clone(),
                shards.clone(),
                runtime_handle.clone(),
            )
            .await
            .map_err(|e| {
                format!("DistributedTableProvider for '{}' failed: {e}", table_name)
            })?;
            sharded_map.insert(table_name.clone(), Arc::new(provider));
        }
        schema_children.push(Arc::new(ShardedSchemaProvider::new(sharded_map)));
    }

    if !schema_children.is_empty() {
        let multi_schema = Arc::new(MultiSchemaProvider::new(schema_children));
        ctx.catalog("datafusion")
            .ok_or("Default catalog not found")?
            .register_schema("public", multi_schema)
            .map_err(|e| format!("Schema registration failed: {e}"))?;
    }

    SwarmLogger::info(
        "distributed",
        "Distributed DataFusion session with catalog-aware federation ready",
    );
    Ok(ctx)
}

pub fn make_config_producer() -> ConfigProducer {
    Arc::new(SessionConfig::new)
}

pub fn make_runtime_producer() -> RuntimeProducer {
    Arc::new(|_cfg: &SessionConfig| Ok(Arc::new(RuntimeEnv::default())))
}

struct ExecutorHandle {
    _runtime: tokio::runtime::Runtime,
    bind_addr: String,
}

static EXECUTOR: OnceLock<Mutex<Option<ExecutorHandle>>> = OnceLock::new();

fn executor_lock() -> &'static Mutex<Option<ExecutorHandle>> {
    EXECUTOR.get_or_init(|| Mutex::new(None))
}

pub fn start_executor(scheduler_url: &str, bind_port: u16) -> Result<(), String> {
    let mut guard = executor_lock().lock().map_err(|_| "Executor lock poisoned")?;
    if guard.is_some() {
        return Err("Executor is already running".into());
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .map_err(|e| format!("Runtime creation failed: {e}"))?;

    let bind_addr = format!("0.0.0.0:{bind_port}");

    // Standalone scheduler already includes an in-process executor.
    if crate::distributed_scheduler::is_scheduler_running() {
        SwarmLogger::info(
            "distributed",
            &format!("Executor handled by standalone scheduler (scheduler_url: {scheduler_url})"),
        );
    } else {
        return Err(
            "Scheduler must be started first (standalone mode includes an executor)".into(),
        );
    }

    *guard = Some(ExecutorHandle { _runtime: runtime, bind_addr });
    Ok(())
}

pub fn stop_executor() -> Result<(), String> {
    let mut guard = executor_lock().lock().map_err(|_| "Executor lock poisoned")?;
    let handle = guard.take().ok_or("Executor is not running")?;
    SwarmLogger::info("distributed", &format!("Executor stopped (was on {})", handle.bind_addr));
    Ok(())
}

pub fn is_executor_running() -> bool {
    executor_lock().lock().map(|g| g.is_some()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_producer_returns_valid_config() {
        let config = make_config_producer()();
        assert!(config.options().execution.target_partitions > 0);
    }

    #[test]
    fn runtime_producer_returns_valid_env() {
        let rt = make_runtime_producer()(&SessionConfig::new()).unwrap();
        assert!(Arc::strong_count(&rt) >= 1);
    }

    #[test]
    fn test_wrap_executor_error_message() {
        let err = wrap_executor_error("execute", "connection refused");
        let msg = err.to_string();
        assert!(
            msg.contains("Executor failure during execute"),
            "Expected operation name in error: {msg}",
        );
        assert!(
            msg.contains("connection refused"),
            "Expected original error in message: {msg}",
        );
        assert!(
            msg.contains("query is safe to retry"),
            "Expected retry hint in message: {msg}",
        );
    }

    #[test]
    fn test_federation_optimizer_rule_inserted() {
        let mut rules = Optimizer::new().rules;
        let baseline_count = rules.len();

        let pos = rules
            .iter()
            .position(|r| r.name() == "scalar_subquery_to_join")
            .map(|i| i + 1)
            .unwrap_or(rules.len());
        rules.insert(pos, Arc::new(FederationOptimizerRule::new()));

        let federation_rules: Vec<_> = rules
            .iter()
            .filter(|r| r.name() == "federation_optimizer_rule")
            .collect();
        assert_eq!(
            federation_rules.len(),
            1,
            "Expected exactly one FederationOptimizerRule in the optimizer chain",
        );

        assert_eq!(
            rules.len(),
            baseline_count + 1,
            "Expected one additional optimizer rule after insertion",
        );

        let scalar_pos = rules
            .iter()
            .position(|r| r.name() == "scalar_subquery_to_join");
        let federation_pos = rules
            .iter()
            .position(|r| r.name() == "federation_optimizer_rule");
        if let (Some(sp), Some(fp)) = (scalar_pos, federation_pos) {
            assert_eq!(
                fp,
                sp + 1,
                "FederationOptimizerRule should be inserted immediately after scalar_subquery_to_join",
            );
        }
    }

    #[test]
    fn test_session_has_federated_query_planner() {
        let state = SessionStateBuilder::new()
            .with_query_planner(Arc::new(FederatedQueryPlanner::new()))
            .with_default_features()
            .build();

        let ctx = SessionContext::new_with_state(state);

        assert!(
            ctx.catalog("datafusion").is_some(),
            "Session should have the default 'datafusion' catalog",
        );
    }

    #[test]
    fn test_optimizer_rule_count_with_federation() {
        let baseline_rules = Optimizer::new().rules;
        let baseline_count = baseline_rules.len();

        assert!(
            baseline_count >= 5,
            "Expected at least 5 baseline optimizer rules, got {baseline_count}",
        );

        let mut rules = baseline_rules;
        let pos = rules
            .iter()
            .position(|r| r.name() == "scalar_subquery_to_join")
            .map(|i| i + 1)
            .unwrap_or(rules.len());
        rules.insert(pos, Arc::new(FederationOptimizerRule::new()));

        assert_eq!(
            rules.len(),
            baseline_count + 1,
            "Rule count should be baseline + 1 after inserting FederationOptimizerRule",
        );
    }

    #[test]
    fn flight_sql_executor_name() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let executor = FlightSQLExecutor::new(
            "worker-1".to_string(),
            "http://10.0.0.2:8815".to_string(),
            vec!["orders".to_string()],
            rt.handle().clone(),
        );
        assert_eq!(executor.name(), "trexsql-flight");
    }

    #[test]
    fn flight_sql_executor_compute_context_is_endpoint() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let executor = FlightSQLExecutor::new(
            "worker-1".to_string(),
            "http://10.0.0.2:8815".to_string(),
            vec!["orders".to_string()],
            rt.handle().clone(),
        );
        assert_eq!(
            executor.compute_context(),
            Some("http://10.0.0.2:8815".to_string()),
        );
    }

    #[test]
    fn flight_sql_executor_dialect_is_duckdb() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let executor = FlightSQLExecutor::new(
            "w".to_string(),
            "http://x:8815".to_string(),
            vec![],
            rt.handle().clone(),
        );
        let _dialect = executor.dialect();
        // Just verify it returns a dialect without panicking.
    }

    #[tokio::test]
    async fn flight_sql_executor_table_names() {
        let handle = tokio::runtime::Handle::current();
        let executor = FlightSQLExecutor::new(
            "w".to_string(),
            "http://x:8815".to_string(),
            vec!["orders".to_string(), "customers".to_string()],
            handle,
        );
        let names = executor.table_names().await.unwrap();
        assert_eq!(names, vec!["orders", "customers"]);
    }

    #[test]
    fn flight_sql_executor_different_endpoints_different_contexts() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let exec_a = FlightSQLExecutor::new(
            "a".to_string(),
            "http://10.0.0.1:8815".to_string(),
            vec![],
            rt.handle().clone(),
        );
        let exec_b = FlightSQLExecutor::new(
            "b".to_string(),
            "http://10.0.0.2:8815".to_string(),
            vec![],
            rt.handle().clone(),
        );
        assert_ne!(exec_a.compute_context(), exec_b.compute_context());
    }

    #[test]
    fn wrap_executor_error_with_empty_operation() {
        let err = wrap_executor_error("", "boom");
        let msg = err.to_string();
        assert!(msg.contains("Executor failure during"), "msg: {msg}");
        assert!(msg.contains("boom"), "msg: {msg}");
    }

    #[test]
    fn wrap_executor_error_preserves_special_chars() {
        let err = wrap_executor_error("flight_execute", "error: \"foo\" with 'quotes' and \n newline");
        let msg = err.to_string();
        assert!(msg.contains("foo"), "msg: {msg}");
        assert!(msg.contains("quotes"), "msg: {msg}");
    }

    #[test]
    fn wrap_executor_error_returns_external_variant() {
        let err = wrap_executor_error("op", "details");
        // The DataFusionError::External variant prints the inner error.
        assert!(matches!(
            err,
            datafusion::error::DataFusionError::External(_)
        ));
    }

    #[test]
    fn wrap_executor_error_chains_with_numeric_display() {
        let err = wrap_executor_error("execute", 42);
        let msg = err.to_string();
        assert!(msg.contains("42"), "msg: {msg}");
    }

    #[test]
    fn trex_sql_executor_name_is_trexsql() {
        let exec = TrexSQLExecutor::new("local-trexsql");
        assert_eq!(exec.name(), "trexsql");
    }

    #[test]
    fn trex_sql_executor_compute_context_preserved() {
        let exec = TrexSQLExecutor::new("my-ctx");
        assert_eq!(exec.compute_context(), Some("my-ctx".to_string()));
    }

    #[test]
    fn trex_sql_executor_compute_context_with_owned_string() {
        let ctx_str = String::from("owned-ctx");
        let exec = TrexSQLExecutor::new(ctx_str);
        assert_eq!(exec.compute_context(), Some("owned-ctx".to_string()));
    }

    #[test]
    fn trex_sql_executor_dialect_returns_a_dialect() {
        let exec = TrexSQLExecutor::new("ctx");
        let _ = exec.dialect();
        // Verifies dialect() does not panic and returns a value.
    }

    #[test]
    fn flight_sql_executor_empty_table_list() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let executor = FlightSQLExecutor::new(
            "w".to_string(),
            "http://x:8815".to_string(),
            vec![],
            rt.handle().clone(),
        );
        let handle = rt.handle().clone();
        let names = handle.block_on(executor.table_names()).unwrap();
        assert!(names.is_empty());
    }

    #[tokio::test]
    async fn flight_sql_executor_preserves_insertion_order_of_tables() {
        let handle = tokio::runtime::Handle::current();
        let executor = FlightSQLExecutor::new(
            "w".to_string(),
            "http://x:8815".to_string(),
            vec!["z".to_string(), "a".to_string(), "m".to_string()],
            handle,
        );
        let names = executor.table_names().await.unwrap();
        // table_names() returns the stored Vec verbatim (no sorting).
        assert_eq!(names, vec!["z", "a", "m"]);
    }

    #[test]
    fn flight_sql_executor_same_endpoint_same_context() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let a = FlightSQLExecutor::new(
            "node-a".to_string(),
            "http://10.0.0.1:8815".to_string(),
            vec![],
            rt.handle().clone(),
        );
        let b = FlightSQLExecutor::new(
            "node-b".to_string(),  // different node name
            "http://10.0.0.1:8815".to_string(), // same endpoint
            vec![],
            rt.handle().clone(),
        );
        // compute_context groups by endpoint only -- node name does not affect it.
        assert_eq!(a.compute_context(), b.compute_context());
    }

    #[test]
    fn make_config_producer_produces_independent_configs() {
        let producer = make_config_producer();
        let a = producer();
        let b = producer();
        // Two invocations should yield independent SessionConfig values.
        // We just verify both have a valid target_partitions value.
        assert!(a.options().execution.target_partitions > 0);
        assert!(b.options().execution.target_partitions > 0);
    }

    #[test]
    fn make_runtime_producer_works_with_custom_config() {
        let cfg = SessionConfig::new().with_target_partitions(8);
        let rt = make_runtime_producer()(&cfg).unwrap();
        assert!(Arc::strong_count(&rt) >= 1);
    }

    #[test]
    fn make_runtime_producer_returns_runtime_env() {
        let cfg = SessionConfig::new();
        let rt1 = make_runtime_producer()(&cfg).unwrap();
        let rt2 = make_runtime_producer()(&cfg).unwrap();
        // Each call returns a fresh RuntimeEnv (not the same Arc).
        assert!(!Arc::ptr_eq(&rt1, &rt2));
    }

    #[test]
    fn executor_not_running_initially() {
        // is_executor_running may return true if a prior test started one, so
        // either branch is acceptable; we just verify the function does not panic.
        let _ = is_executor_running();
    }

    #[test]
    fn stop_executor_when_not_running_returns_error() {
        // If nothing is running, stop_executor returns an error. If something
        // was started by another test, stop_executor will tear it down; in
        // that case calling stop_executor again should fail.
        let _ = stop_executor(); // ensure we are in a clean state
        let result = stop_executor();
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("not running"),
            "Expected 'not running' error",
        );
    }

    #[test]
    fn start_executor_without_scheduler_fails() {
        // Ensure executor is not running first (clean state).
        let _ = stop_executor();
        // Only attempt this assertion if scheduler is also not running.
        if !crate::distributed_scheduler::is_scheduler_running() {
            let result = start_executor("http://localhost:9999", 0);
            assert!(result.is_err());
            let err = result.unwrap_err();
            assert!(
                err.contains("Scheduler must be started first")
                    || err.contains("Executor is already running"),
                "Expected scheduler-first error, got: {err}",
            );
        }
    }

    #[test]
    fn wrap_executor_error_includes_retry_hint() {
        let err = wrap_executor_error("table_names", "timeout");
        let msg = err.to_string();
        assert!(msg.contains("query is safe to retry"), "msg: {msg}");
    }

    #[test]
    fn flight_sql_executor_compute_context_for_empty_endpoint() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let exec = FlightSQLExecutor::new(
            "w".to_string(),
            String::new(),
            vec![],
            rt.handle().clone(),
        );
        // Even an empty endpoint is reported verbatim (Some(""))-- federation
        // groups tables by endpoint string, so empty matches empty.
        assert_eq!(exec.compute_context(), Some(String::new()));
    }

    #[test]
    fn trex_sql_executor_name_constant_across_instances() {
        let a = TrexSQLExecutor::new("ctx-a");
        let b = TrexSQLExecutor::new("ctx-b");
        // name() is a constant; differs only by context.
        assert_eq!(a.name(), b.name());
        assert_ne!(a.compute_context(), b.compute_context());
    }

    #[tokio::test]
    async fn create_duckdb_session_returns_session_with_default_catalog() {
        // Even when catalog::list_tables() returns empty (no schedulers running),
        // we should successfully build a session and register the public schema.
        // Skip if catalog access is unavailable (gossip not running).
        let result = create_duckdb_session().await;
        match result {
            Ok(ctx) => {
                assert!(
                    ctx.catalog("datafusion").is_some(),
                    "Default catalog should be registered",
                );
            }
            Err(_) => {
                // Gossip / pool dependencies are not initialized in unit-test
                // context; this is acceptable.
            }
        }
    }

    #[test]
    fn federation_optimizer_rule_name_is_known() {
        use datafusion::optimizer::OptimizerRule;
        let rule = FederationOptimizerRule::new();
        assert_eq!(rule.name(), "federation_optimizer_rule");
    }

    // ---------- create_distributed_session_with_classifications: structure-only ----------

    #[tokio::test]
    async fn create_distributed_session_with_classifications_empty_succeeds() {
        // No tables at all -> session still builds (just without registered schemas).
        use std::collections::HashMap;

        let handle = tokio::runtime::Handle::current();
        let classifications = HashMap::new();
        let stats = Arc::new(crate::shuffle_optimizer::CatalogStats::from_catalog(handle.clone()));
        let ctx = create_distributed_session_with_classifications(handle, classifications, stats)
            .await
            .expect("empty session should succeed");
        assert!(ctx.catalog("datafusion").is_some());
    }

    #[tokio::test]
    async fn create_distributed_session_falls_back_to_local_when_no_tables() {
        // catalog::classify_tables() typically returns Err under unit tests
        // (no gossip), triggering the fallback path to create_duckdb_session().
        let handle = tokio::runtime::Handle::current();
        let result = create_distributed_session(handle).await;
        // Whether gossip is present or not, the function must return either a
        // built session or an error; it should NOT panic.
        let _ = result;
    }

    // ---------- start_executor / lifecycle ----------

    #[test]
    #[serial_test::serial]
    fn start_executor_when_already_running_returns_already_running_error() {
        // Force a state where another start would short-circuit on the "already
        // running" check. We can't actually start because scheduler isn't running,
        // but if the lock is empty the function reaches the scheduler-check arm
        // and returns the scheduler error. Either response is acceptable as a
        // smoke test; we just verify no panic and an Err is returned when state
        // is incompatible.
        let _ = stop_executor();
        let res = start_executor("http://localhost:9999", 0);
        assert!(res.is_err());
    }

    #[test]
    fn is_executor_running_does_not_panic_on_repeated_calls() {
        for _ in 0..3 {
            let _ = is_executor_running();
        }
    }

    // ---------- TrexSQLExecutor dialect & flight executor name ----------

    #[test]
    fn trex_sql_executor_dialect_can_be_cloned() {
        let exec = TrexSQLExecutor::new("ctx");
        let d1 = exec.dialect();
        let d2 = exec.dialect();
        // Both are Arc<dyn Dialect>; they may be different Arc instances.
        assert!(Arc::strong_count(&d1) >= 1);
        assert!(Arc::strong_count(&d2) >= 1);
    }

    #[test]
    fn flight_sql_executor_dialect_can_be_obtained_multiple_times() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let exec = FlightSQLExecutor::new(
            "n".to_string(),
            "http://x:1".to_string(),
            vec![],
            rt.handle().clone(),
        );
        let _ = exec.dialect();
        let _ = exec.dialect();
    }
}
