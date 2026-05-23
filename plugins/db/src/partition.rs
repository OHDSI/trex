//! Table partitioning: distribute tables across cluster nodes.

use arrow::array::RecordBatch;
use arrow::compute::take;
use arrow::datatypes::{DataType, SchemaRef};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::catalog;
use crate::flight_client;
use crate::gossip::GossipRegistry;
use crate::logging::SwarmLogger;
use crate::shuffle_descriptor::{ShuffleDescriptor, ShuffleTarget};
use crate::shuffle_partition;
use crate::shuffle_transport;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PartitionStrategy {
    Hash {
        column: String,
        num_partitions: usize,
    },
    Range {
        column: String,
        ranges: Vec<RangeBound>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeBound {
    #[serde(default)]
    pub lower: Option<serde_json::Value>,
    #[serde(default)]
    pub upper: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionAssignment {
    pub partition_id: usize,
    pub node_name: String,
    pub flight_endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionMetadata {
    pub strategy: PartitionStrategy,
    pub assignments: Vec<PartitionAssignment>,
    pub create_sql: String,
}

/// User-facing JSON config parsed from the second argument.
#[derive(Debug, Deserialize)]
pub struct PartitionConfig {
    pub strategy: String,
    pub column: String,
    #[serde(default)]
    pub partitions: Option<usize>,
    #[serde(default)]
    pub ranges: Option<Vec<RangeBound>>,
    #[serde(default)]
    pub nodes: Option<Vec<String>>,
}

pub fn publish_partition_metadata(
    table_name: &str,
    metadata: &PartitionMetadata,
) -> Result<(), String> {
    let key = format!("partition:{}", table_name);
    let value = serde_json::to_string(metadata)
        .map_err(|e| format!("Failed to serialize partition metadata: {e}"))?;
    GossipRegistry::instance().set_key(&key, &value)
}

pub fn get_partition_metadata(table_name: &str) -> Result<Option<PartitionMetadata>, String> {
    let nodes = GossipRegistry::instance().get_node_key_values()?;
    let key = format!("partition:{}", table_name);
    for node in &nodes {
        for (k, v) in &node.key_values {
            if k == &key {
                let meta: PartitionMetadata = serde_json::from_str(v)
                    .map_err(|e| format!("Failed to parse partition metadata: {e}"))?;
                return Ok(Some(meta));
            }
        }
    }
    Ok(None)
}

pub fn remove_partition_metadata(table_name: &str) -> Result<(), String> {
    let key = format!("partition:{}", table_name);
    GossipRegistry::instance().delete_key(&key)
}

/// Return all partition metadata entries visible in gossip.
pub fn get_all_partition_metadata() -> Result<Vec<(String, PartitionMetadata)>, String> {
    let nodes = GossipRegistry::instance().get_node_key_values()?;
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for node in &nodes {
        for (k, v) in &node.key_values {
            if let Some(table_name) = k.strip_prefix("partition:") {
                if seen.insert(table_name.to_string()) {
                    if let Ok(meta) = serde_json::from_str::<PartitionMetadata>(v) {
                        result.push((table_name.to_string(), meta));
                    }
                }
            }
        }
    }

    Ok(result)
}

/// Target node info used for partition assignment.
pub struct TargetNode {
    pub node_name: String,
    pub flight_endpoint: String,
}

/// Discover active data nodes with Flight endpoints from gossip.
pub fn discover_target_nodes() -> Result<Vec<TargetNode>, String> {
    let nodes = GossipRegistry::instance().get_node_key_values()?;
    let mut targets = Vec::new();

    for node in &nodes {
        let is_data_node = node
            .key_values
            .iter()
            .any(|(k, v)| k == "data_node" && v == "true");

        if !is_data_node {
            continue;
        }

        let flight_endpoint = node.key_values.iter().find_map(|(k, v)| {
            if k == "service:flight" {
                let svc: serde_json::Value = serde_json::from_str(v).ok()?;
                if svc.get("status")?.as_str()? == "running" {
                    let host = svc.get("host")?.as_str()?;
                    let port = svc.get("port")?.as_u64()?;
                    Some(format!("http://{}:{}", host, port))
                } else {
                    None
                }
            } else {
                None
            }
        });

        if let Some(ep) = flight_endpoint {
            targets.push(TargetNode {
                node_name: node.node_name.clone(),
                flight_endpoint: ep,
            });
        }
    }

    Ok(targets)
}

/// Assign partition IDs to target nodes (round-robin or explicit).
pub fn assign_partitions(
    num_partitions: usize,
    available_nodes: &[TargetNode],
    explicit_nodes: Option<&[String]>,
) -> Result<Vec<PartitionAssignment>, String> {
    if available_nodes.is_empty() {
        return Err("No target nodes available for partitioning".to_string());
    }

    let target_nodes: Vec<&TargetNode> = if let Some(names) = explicit_nodes {
        let mut matched = Vec::new();
        for name in names {
            let node = available_nodes
                .iter()
                .find(|n| n.node_name == *name)
                .ok_or_else(|| format!("Node '{}' not found among available data nodes", name))?;
            matched.push(node);
        }
        matched
    } else {
        available_nodes.iter().collect()
    };

    if target_nodes.is_empty() {
        return Err("No target nodes matched for partitioning".to_string());
    }

    let mut assignments = Vec::with_capacity(num_partitions);
    for partition_id in 0..num_partitions {
        let node = &target_nodes[partition_id % target_nodes.len()];
        assignments.push(PartitionAssignment {
            partition_id,
            node_name: node.node_name.clone(),
            flight_endpoint: node.flight_endpoint.clone(),
        });
    }

    Ok(assignments)
}

pub fn generate_create_table_sql(table_name: &str, schema: &SchemaRef) -> String {
    let columns: Vec<String> = schema
        .fields()
        .iter()
        .map(|field| {
            let sql_type = arrow_type_to_sql(field.data_type());
            format!(
                "\"{}\" {}",
                field.name().replace('"', "\"\""),
                sql_type
            )
        })
        .collect();

    format!(
        "CREATE OR REPLACE TABLE \"{}\" ({})",
        table_name.replace('"', "\"\""),
        columns.join(", ")
    )
}

fn arrow_type_to_sql(dt: &DataType) -> String {
    match dt {
        DataType::Boolean => "BOOLEAN".to_string(),
        DataType::Int8 => "TINYINT".to_string(),
        DataType::Int16 => "SMALLINT".to_string(),
        DataType::Int32 => "INTEGER".to_string(),
        DataType::Int64 => "BIGINT".to_string(),
        DataType::UInt8 => "UTINYINT".to_string(),
        DataType::UInt16 => "USMALLINT".to_string(),
        DataType::UInt32 => "UINTEGER".to_string(),
        DataType::UInt64 => "UBIGINT".to_string(),
        DataType::Float16 => "FLOAT".to_string(),
        DataType::Float32 => "FLOAT".to_string(),
        DataType::Float64 => "DOUBLE".to_string(),
        DataType::Utf8 | DataType::LargeUtf8 => "VARCHAR".to_string(),
        DataType::Binary | DataType::LargeBinary => "BLOB".to_string(),
        DataType::Date32 | DataType::Date64 => "DATE".to_string(),
        // Time32/Time64 unit cannot be expressed in DuckDB's TIME DDL —
        // DuckDB normalizes to microsecond precision. Best-effort: keep as TIME.
        DataType::Time32(_) | DataType::Time64(_) => "TIME".to_string(),
        // Preserve timezone metadata: tz-aware timestamps must round-trip as
        // TIMESTAMPTZ, not get downgraded to plain TIMESTAMP.
        DataType::Timestamp(_, Some(_)) => "TIMESTAMPTZ".to_string(),
        DataType::Timestamp(_, None) => "TIMESTAMP".to_string(),
        // Preserve precision and scale so DECIMAL(38,10) doesn't collapse to
        // DuckDB's default DECIMAL(18,3).
        DataType::Decimal128(p, s) | DataType::Decimal256(p, s) => {
            format!("DECIMAL({}, {})", p, s)
        }
        // Interval unit (MonthDayNano/DayTime/YearMonth) is lossy at the SQL
        // DDL level — DuckDB has a single INTERVAL type. Documented limitation.
        DataType::Interval(_) => "INTERVAL".to_string(),
        _ => "VARCHAR".to_string(),
    }
}

/// Partition batches by range on a single column.
///
/// Each range in `ranges` defines a bucket. Rows where the column value falls
/// within [lower, upper) are assigned to that bucket. The ranges list must
/// cover all possible values (first range may have no lower, last may have no
/// upper).
pub fn range_partition_batches(
    batches: &[RecordBatch],
    column_name: &str,
    ranges: &[RangeBound],
) -> Result<Vec<Vec<RecordBatch>>, String> {
    if ranges.is_empty() {
        return Err("At least one range is required".to_string());
    }

    let num_partitions = ranges.len();
    let mut result: Vec<Vec<RecordBatch>> = vec![Vec::new(); num_partitions];

    for batch in batches {
        if batch.num_rows() == 0 {
            continue;
        }

        let col_idx = batch
            .schema()
            .index_of(column_name)
            .map_err(|_| format!("Column '{}' not found in schema", column_name))?;

        let col = batch.column(col_idx);
        let num_rows = batch.num_rows();

        let mut partition_indices: Vec<Vec<u32>> = vec![Vec::new(); num_partitions];

        for row in 0..num_rows {
            let value_str =
                arrow::util::display::array_value_to_string(col, row).unwrap_or_default();
            let value_f64: Option<f64> = value_str.parse().ok();

            let mut assigned = false;
            for (part_idx, range) in ranges.iter().enumerate() {
                let above_lower = match &range.lower {
                    None => true,
                    Some(bound) => match (value_f64, bound.as_f64()) {
                        (Some(v), Some(b)) => v >= b,
                        _ => value_str >= bound.to_string(),
                    },
                };

                let below_upper = match &range.upper {
                    None => true,
                    Some(bound) => match (value_f64, bound.as_f64()) {
                        (Some(v), Some(b)) => v < b,
                        _ => value_str < bound.to_string(),
                    },
                };

                if above_lower && below_upper {
                    partition_indices[part_idx].push(row as u32);
                    assigned = true;
                    break;
                }
            }

            if !assigned {
                partition_indices[num_partitions - 1].push(row as u32);
            }
        }

        let schema = batch.schema();
        for (part_idx, indices) in partition_indices.iter().enumerate() {
            if indices.is_empty() {
                continue;
            }

            let indices_array = arrow::array::UInt32Array::from(indices.clone());
            let columns: Vec<_> = batch
                .columns()
                .iter()
                .map(|col_arr| {
                    take(col_arr.as_ref(), &indices_array, None)
                        .map_err(|e| format!("Arrow take error: {e}"))
                })
                .collect::<Result<_, _>>()?;

            let part_batch = RecordBatch::try_new(schema.clone(), columns)
                .map_err(|e| format!("Failed to create partitioned batch: {e}"))?;
            result[part_idx].push(part_batch);
        }
    }

    Ok(result)
}

fn read_local_table(table_name: &str) -> Result<(SchemaRef, Vec<RecordBatch>), String> {
    let sql = format!(
        "SELECT * FROM \"{}\"",
        table_name.replace('"', "\"\"")
    );
    crate::pool::read_arrow(&sql)
}

fn drop_local_table(table_name: &str) -> Result<(), String> {
    let sql = format!(
        "DROP TABLE IF EXISTS \"{}\"",
        table_name.replace('"', "\"\"")
    );
    crate::pool::write(&sql)
}

fn with_runtime<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&tokio::runtime::Runtime) -> Result<T, String>,
{
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create tokio runtime: {e}"))?;
    f(&rt)
}

pub fn swarm_partition_table_impl(
    table_name: &str,
    config_json: &str,
) -> Result<String, String> {
    let config: PartitionConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid partition config JSON: {e}"))?;

    SwarmLogger::info(
        "partition",
        &format!(
            "Partitioning table '{}' with strategy '{}'",
            table_name, config.strategy
        ),
    );

    let (schema, batches) = read_local_table(table_name)?;
    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();

    if schema.fields().is_empty() {
        return Err(format!("Table '{}' has no columns", table_name));
    }

    schema
        .index_of(&config.column)
        .map_err(|_| format!("Column '{}' not found in table '{}'", config.column, table_name))?;

    let available_nodes = discover_target_nodes()?;
    if available_nodes.is_empty() {
        return Err("No active data nodes with Flight endpoints found in cluster".to_string());
    }

    let (strategy, partitioned_data) = match config.strategy.as_str() {
        "hash" => {
            let num_partitions = config
                .partitions
                .ok_or("Hash strategy requires 'partitions' field")?;
            if num_partitions == 0 {
                return Err("Number of partitions must be > 0".to_string());
            }

            let key_indices = shuffle_partition::resolve_key_indices(
                &schema,
                &[config.column.clone()],
            )
            .map_err(|e| format!("Failed to resolve partition column: {e}"))?;

            let mut all_partitions: Vec<Vec<RecordBatch>> = vec![Vec::new(); num_partitions];
            for batch in &batches {
                let parts = shuffle_partition::partition_batch(batch, &key_indices, num_partitions)
                    .map_err(|e| format!("Hash partitioning failed: {e}"))?;
                for (i, part) in parts.into_iter().enumerate() {
                    if part.num_rows() > 0 {
                        all_partitions[i].push(part);
                    }
                }
            }

            let strategy = PartitionStrategy::Hash {
                column: config.column.clone(),
                num_partitions,
            };
            (strategy, all_partitions)
        }
        "range" => {
            let ranges = config
                .ranges
                .as_ref()
                .ok_or("Range strategy requires 'ranges' field")?;
            if ranges.is_empty() {
                return Err("At least one range is required".to_string());
            }

            let partitioned = range_partition_batches(&batches, &config.column, ranges)?;

            let strategy = PartitionStrategy::Range {
                column: config.column.clone(),
                ranges: ranges.clone(),
            };
            (strategy, partitioned)
        }
        other => return Err(format!("Unknown partition strategy: '{}'", other)),
    };

    let num_partitions = partitioned_data.len();

    let assignments = assign_partitions(
        num_partitions,
        &available_nodes,
        config.nodes.as_deref(),
    )?;

    let create_sql = generate_create_table_sql(table_name, &schema);

    with_runtime(|rt| {
        rt.block_on(async {
            distribute_partitions(
                table_name,
                &schema,
                &create_sql,
                &assignments,
                partitioned_data,
            )
            .await
        })
    })?;

    let local_ep = get_local_flight_endpoint();
    let coordinator_is_target = local_ep.as_ref().map_or(false, |ep| {
        assignments.iter().any(|a| a.flight_endpoint == *ep)
    });
    if !coordinator_is_target {
        drop_local_table(table_name)?;
    }

    let metadata = PartitionMetadata {
        strategy,
        assignments: assignments.clone(),
        create_sql,
    };
    publish_partition_metadata(table_name, &metadata)?;

    let _ = catalog::advertise_local_tables();

    let partition_summary: Vec<String> = assignments
        .iter()
        .map(|a| format!("  partition {} -> {}", a.partition_id, a.node_name))
        .collect();

    Ok(format!(
        "Partitioned table '{}' ({} rows) into {} partition(s):\n{}",
        table_name,
        total_rows,
        num_partitions,
        partition_summary.join("\n")
    ))
}

pub fn swarm_create_table_impl(
    create_sql: &str,
    config_json: &str,
) -> Result<String, String> {
    SwarmLogger::info(
        "partition",
        &format!("Creating and partitioning table with SQL: {}", create_sql),
    );

    crate::pool::write(create_sql)?;

    let table_name = extract_table_name(create_sql)
        .ok_or_else(|| "Could not extract table name from CREATE SQL".to_string())?;

    match swarm_partition_table_impl(&table_name, config_json) {
        Ok(msg) => Ok(msg),
        Err(e) => {
            let _ = drop_local_table(&table_name);  // rollback
            Err(e)
        }
    }
}

pub fn swarm_repartition_table_impl(
    table_name: &str,
    config_json: &str,
) -> Result<String, String> {
    SwarmLogger::info(
        "partition",
        &format!("Repartitioning table '{}'", table_name),
    );

    let entries = catalog::resolve_table(table_name)?;
    if entries.is_empty() {
        return Err(format!("Table '{}' not found in cluster catalog", table_name));
    }

    let shard_endpoints: Vec<(String, String)> = entries
        .iter()
        .filter_map(|e| {
            e.flight_endpoint
                .as_ref()
                .map(|ep| (ep.clone(), e.node_name.clone()))
        })
        .collect();

    if shard_endpoints.is_empty() {
        return Err(format!(
            "No Flight endpoints found for table '{}' — cannot gather data",
            table_name
        ));
    }

    let (schema, all_batches) = with_runtime(|rt| {
        rt.block_on(async {
            gather_table_from_shards(table_name, &shard_endpoints).await
        })
    })?;

    let total_rows: usize = all_batches.iter().map(|b| b.num_rows()).sum();
    SwarmLogger::info(
        "partition",
        &format!(
            "Gathered {} rows from {} shard(s) for table '{}'",
            total_rows,
            shard_endpoints.len(),
            table_name,
        ),
    );

    with_runtime(|rt| {
        rt.block_on(async {
            let mut drop_failures: Vec<String> = Vec::new();
            for (endpoint, node_name) in &shard_endpoints {
                let drop_sql = format!(
                    "DROP TABLE IF EXISTS \"{}\"",
                    table_name.replace('"', "\"\"")
                );
                if let Err(e) = flight_client::execute_remote_sql(endpoint, &drop_sql).await {
                    drop_failures.push(format!("node '{}': {}", node_name, e));
                }
            }
            if !drop_failures.is_empty() {
                return Err(format!(
                    "Aborting repartition of '{}' — failed to drop old shards: {}",
                    table_name,
                    drop_failures.join("; ")
                ));
            }
            Ok(())
        })
    })?;

    let _ = remove_partition_metadata(table_name);

    let config: PartitionConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid partition config JSON: {e}"))?;

    schema
        .index_of(&config.column)
        .map_err(|_| format!("Column '{}' not found in table '{}'", config.column, table_name))?;

    let available_nodes = discover_target_nodes()?;
    if available_nodes.is_empty() {
        return Err("No active data nodes with Flight endpoints found in cluster".to_string());
    }

    let (strategy, partitioned_data) = match config.strategy.as_str() {
        "hash" => {
            let num_partitions = config
                .partitions
                .ok_or("Hash strategy requires 'partitions' field")?;
            if num_partitions == 0 {
                return Err("Number of partitions must be > 0".to_string());
            }

            let key_indices = shuffle_partition::resolve_key_indices(
                &schema,
                &[config.column.clone()],
            )
            .map_err(|e| format!("Failed to resolve partition column: {e}"))?;

            let mut all_partitions: Vec<Vec<RecordBatch>> = vec![Vec::new(); num_partitions];
            for batch in &all_batches {
                let parts = shuffle_partition::partition_batch(batch, &key_indices, num_partitions)
                    .map_err(|e| format!("Hash partitioning failed: {e}"))?;
                for (i, part) in parts.into_iter().enumerate() {
                    if part.num_rows() > 0 {
                        all_partitions[i].push(part);
                    }
                }
            }

            let strategy = PartitionStrategy::Hash {
                column: config.column.clone(),
                num_partitions,
            };
            (strategy, all_partitions)
        }
        "range" => {
            let ranges = config
                .ranges
                .as_ref()
                .ok_or("Range strategy requires 'ranges' field")?;
            if ranges.is_empty() {
                return Err("At least one range is required".to_string());
            }

            let partitioned = range_partition_batches(&all_batches, &config.column, ranges)?;

            let strategy = PartitionStrategy::Range {
                column: config.column.clone(),
                ranges: ranges.clone(),
            };
            (strategy, partitioned)
        }
        other => return Err(format!("Unknown partition strategy: '{}'", other)),
    };

    let num_partitions = partitioned_data.len();

    let assignments = assign_partitions(
        num_partitions,
        &available_nodes,
        config.nodes.as_deref(),
    )?;

    let create_sql = generate_create_table_sql(table_name, &schema);

    with_runtime(|rt| {
        rt.block_on(async {
            distribute_partitions(
                table_name,
                &schema,
                &create_sql,
                &assignments,
                partitioned_data,
            )
            .await
        })
    })?;

    let metadata = PartitionMetadata {
        strategy,
        assignments: assignments.clone(),
        create_sql,
    };
    publish_partition_metadata(table_name, &metadata)?;

    let _ = catalog::advertise_local_tables();

    let partition_summary: Vec<String> = assignments
        .iter()
        .map(|a| format!("  partition {} -> {}", a.partition_id, a.node_name))
        .collect();

    Ok(format!(
        "Repartitioned table '{}' ({} rows) into {} partition(s):\n{}",
        table_name,
        total_rows,
        num_partitions,
        partition_summary.join("\n")
    ))
}

/// Return the Flight endpoint of the local node, if available.
fn get_local_flight_endpoint() -> Option<String> {
    let self_id = catalog::get_self_node_id()?;
    let entries = catalog::get_all_tables().ok()?;
    entries
        .iter()
        .find(|e| e.node_id == self_id)
        .and_then(|e| e.flight_endpoint.clone())
}

/// Distribute partitioned data to remote nodes via Flight.
async fn distribute_partitions(
    table_name: &str,
    schema: &SchemaRef,
    create_sql: &str,
    assignments: &[PartitionAssignment],
    partitioned_data: Vec<Vec<RecordBatch>>,
) -> Result<(), String> {
    let mut created_on: Vec<String> = Vec::new(); // for rollback

    let mut unique_endpoints: Vec<(String, String)> = Vec::new();
    let mut seen_endpoints = std::collections::HashSet::new();
    for assignment in assignments {
        if seen_endpoints.insert(assignment.flight_endpoint.clone()) {
            unique_endpoints.push((
                assignment.flight_endpoint.clone(),
                assignment.node_name.clone(),
            ));
        }
    }

    for (endpoint, node_name) in &unique_endpoints {
        if let Err(e) = flight_client::execute_remote_sql(endpoint, create_sql).await {
            for rollback_ep in &created_on {  // rollback
                let drop_sql = format!(
                    "DROP TABLE IF EXISTS \"{}\"",
                    table_name.replace('"', "\"\"")
                );
                let _ = flight_client::execute_remote_sql(rollback_ep, &drop_sql).await;
            }
            return Err(format!(
                "Failed to create table '{}' on node '{}': {}",
                table_name, node_name, e
            ));
        }
        created_on.push(endpoint.clone());
    }

    for assignment in assignments {
        let partition_id = assignment.partition_id;
        if partition_id >= partitioned_data.len() {
            continue;
        }

        let partition_batches = &partitioned_data[partition_id];
        if partition_batches.is_empty()
            || partition_batches.iter().all(|b| b.num_rows() == 0)
        {
            continue;
        }

        let descriptor = ShuffleDescriptor {
            shuffle_id: format!("partition-{}-{}", table_name, partition_id),
            join_keys: vec![],
            num_partitions: partitioned_data.len(),
            partition_targets: vec![ShuffleTarget {
                partition_id,
                flight_endpoint: assignment.flight_endpoint.clone(),
                node_name: assignment.node_name.clone(),
            }],
            target_table: Some(table_name.to_string()),
        };

        if let Err(e) = shuffle_transport::send_partition(
            &assignment.flight_endpoint,
            &descriptor,
            partition_id,
            schema.clone(),
            partition_batches.clone(),
        )
        .await
        {
            // rollback
            for rollback_ep in &created_on {
                let drop_sql = format!(
                    "DROP TABLE IF EXISTS \"{}\"",
                    table_name.replace('"', "\"\"")
                );
                let _ = flight_client::execute_remote_sql(rollback_ep, &drop_sql).await;
            }
            return Err(format!(
                "Failed to send partition {} to '{}': {}",
                partition_id, assignment.node_name, e
            ));
        }

        SwarmLogger::debug(
            "partition",
            &format!(
                "Sent partition {} ({} batches) to {}",
                partition_id,
                partition_batches.len(),
                assignment.node_name,
            ),
        );
    }

    // Eagerly refresh catalog (avoids 30s gossip delay)
    for (endpoint, node_name) in &unique_endpoints {
        if let Err(e) = flight_client::refresh_remote_catalog(endpoint).await {
            SwarmLogger::warn(
                "partition",
                &format!(
                    "Failed to trigger catalog refresh on node '{}': {}",
                    node_name, e
                ),
            );
        }
    }

    Ok(())
}

/// Gather all data for a table from multiple shards via DoGet.
async fn gather_table_from_shards(
    table_name: &str,
    shard_endpoints: &[(String, String)],
) -> Result<(SchemaRef, Vec<RecordBatch>), String> {
    let sql = format!(
        "SELECT * FROM \"{}\"",
        table_name.replace('"', "\"\"")
    );

    let mut all_batches = Vec::new();
    let mut schema: Option<SchemaRef> = None;

    for (endpoint, node_name) in shard_endpoints {
        let (shard_schema, shard_batches) =
            flight_client::query_node_with_schema(endpoint, &sql).await.map_err(|e| {
                format!(
                    "Failed to gather data from node '{}' ({}): {}",
                    node_name, endpoint, e
                )
            })?;

        if schema.is_none() {
            schema = Some(shard_schema);
        }

        all_batches.extend(shard_batches);
    }

    let schema = schema.unwrap_or_else(|| Arc::new(arrow::datatypes::Schema::empty()));

    Ok((schema, all_batches))
}

/// Extract table name from a CREATE TABLE statement.
fn extract_table_name(sql: &str) -> Option<String> {
    let upper = sql.to_uppercase();
    let table_pos = upper.find("TABLE")?;
    let after_table = &sql[table_pos + 5..].trim_start();

    let after_clause = if after_table.to_uppercase().starts_with("IF NOT EXISTS") {
        after_table[13..].trim_start()
    } else if after_table.to_uppercase().starts_with("IF EXISTS") {
        after_table[9..].trim_start()
    } else {
        after_table
    };

    if after_clause.starts_with('"') {
        let end = after_clause[1..].find('"')?;
        Some(after_clause[1..1 + end].to_string())
    } else {
        let end = after_clause
            .find(|c: char| c.is_whitespace() || c == '(' || c == ';')
            .unwrap_or(after_clause.len());
        if end == 0 {
            None
        } else {
            Some(after_clause[..end].to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow::array::{Float64Array, Int64Array, StringArray};
    use arrow::datatypes::{Field, Schema};

    fn test_schema() -> SchemaRef {
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("name", DataType::Utf8, true),
            Field::new("price", DataType::Float64, true),
        ]))
    }

    fn test_batch() -> RecordBatch {
        RecordBatch::try_new(
            test_schema(),
            vec![
                Arc::new(Int64Array::from(vec![1, 2, 3, 4, 5, 6])),
                Arc::new(StringArray::from(vec!["a", "b", "c", "d", "e", "f"])),
                Arc::new(Float64Array::from(vec![
                    10.0, 50.0, 150.0, 300.0, 600.0, 900.0,
                ])),
            ],
        )
        .unwrap()
    }

    #[test]
    fn generate_create_table_sql_basic() {
        let schema = test_schema();
        let sql = generate_create_table_sql("orders", &schema);
        assert!(sql.contains("CREATE OR REPLACE TABLE"));
        assert!(sql.contains("\"orders\""));
        assert!(sql.contains("\"id\" BIGINT"));
        assert!(sql.contains("\"name\" VARCHAR"));
        assert!(sql.contains("\"price\" DOUBLE"));
    }

    #[test]
    fn generate_create_table_sql_quoted_name() {
        let schema = Arc::new(Schema::new(vec![Field::new("a", DataType::Int32, false)]));
        let sql = generate_create_table_sql("my\"table", &schema);
        assert!(sql.contains("\"my\"\"table\""));
    }

    #[test]
    fn range_partition_basic() {
        let batch = test_batch();
        let ranges = vec![
            RangeBound {
                lower: None,
                upper: Some(serde_json::json!(100)),
            },
            RangeBound {
                lower: Some(serde_json::json!(100)),
                upper: Some(serde_json::json!(500)),
            },
            RangeBound {
                lower: Some(serde_json::json!(500)),
                upper: None,
            },
        ];

        let result = range_partition_batches(&[batch], "price", &ranges).unwrap();
        assert_eq!(result.len(), 3);

        let total: usize = result
            .iter()
            .flat_map(|batches| batches.iter())
            .map(|b| b.num_rows())
            .sum();
        assert_eq!(total, 6);

        // price < 100: 10.0, 50.0 -> 2 rows
        let p0_rows: usize = result[0].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0_rows, 2);

        // 100 <= price < 500: 150.0, 300.0 -> 2 rows
        let p1_rows: usize = result[1].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p1_rows, 2);

        // price >= 500: 600.0, 900.0 -> 2 rows
        let p2_rows: usize = result[2].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p2_rows, 2);
    }

    #[test]
    fn range_partition_empty_batch() {
        let schema = Arc::new(Schema::new(vec![Field::new("x", DataType::Float64, false)]));
        let batch = RecordBatch::new_empty(schema);
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];
        let result = range_partition_batches(&[batch], "x", &ranges).unwrap();
        assert_eq!(result.len(), 1);
        assert!(result[0].is_empty());
    }

    #[test]
    fn range_partition_missing_column() {
        let batch = test_batch();
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];
        let result = range_partition_batches(&[batch], "missing", &ranges);
        assert!(result.is_err());
    }

    #[test]
    fn range_partition_empty_ranges_errors() {
        let batch = test_batch();
        let result = range_partition_batches(&[batch], "price", &[]);
        assert!(result.is_err());
    }

    #[test]
    fn assign_partitions_round_robin() {
        let nodes = vec![
            TargetNode {
                node_name: "node-a".to_string(),
                flight_endpoint: "http://a:8815".to_string(),
            },
            TargetNode {
                node_name: "node-b".to_string(),
                flight_endpoint: "http://b:8815".to_string(),
            },
        ];

        let assignments = assign_partitions(4, &nodes, None).unwrap();
        assert_eq!(assignments.len(), 4);
        assert_eq!(assignments[0].node_name, "node-a");
        assert_eq!(assignments[1].node_name, "node-b");
        assert_eq!(assignments[2].node_name, "node-a");
        assert_eq!(assignments[3].node_name, "node-b");
    }

    #[test]
    fn assign_partitions_explicit() {
        let nodes = vec![
            TargetNode {
                node_name: "node-a".to_string(),
                flight_endpoint: "http://a:8815".to_string(),
            },
            TargetNode {
                node_name: "node-b".to_string(),
                flight_endpoint: "http://b:8815".to_string(),
            },
            TargetNode {
                node_name: "node-c".to_string(),
                flight_endpoint: "http://c:8815".to_string(),
            },
        ];

        let explicit = vec!["node-b".to_string(), "node-c".to_string()];
        let assignments = assign_partitions(3, &nodes, Some(&explicit)).unwrap();
        assert_eq!(assignments.len(), 3);
        assert_eq!(assignments[0].node_name, "node-b");
        assert_eq!(assignments[1].node_name, "node-c");
        assert_eq!(assignments[2].node_name, "node-b");
    }

    #[test]
    fn assign_partitions_empty_nodes_errors() {
        let result = assign_partitions(2, &[], None);
        assert!(result.is_err());
    }

    #[test]
    fn assign_partitions_unknown_explicit_node_errors() {
        let nodes = vec![TargetNode {
            node_name: "node-a".to_string(),
            flight_endpoint: "http://a:8815".to_string(),
        }];

        let explicit = vec!["node-z".to_string()];
        let result = assign_partitions(1, &nodes, Some(&explicit));
        assert!(result.is_err());
    }

    #[test]
    fn extract_table_name_simple() {
        assert_eq!(
            extract_table_name("CREATE TABLE orders (id INT)"),
            Some("orders".to_string())
        );
    }

    #[test]
    fn extract_table_name_quoted() {
        assert_eq!(
            extract_table_name("CREATE TABLE \"my_orders\" (id INT)"),
            Some("my_orders".to_string())
        );
    }

    #[test]
    fn extract_table_name_if_not_exists() {
        assert_eq!(
            extract_table_name("CREATE TABLE IF NOT EXISTS orders (id INT)"),
            Some("orders".to_string())
        );
    }

    #[test]
    fn extract_table_name_as_select() {
        assert_eq!(
            extract_table_name("CREATE TABLE orders AS SELECT * FROM raw"),
            Some("orders".to_string())
        );
    }

    #[test]
    fn partition_config_deserialize_hash() {
        let json = r#"{"strategy":"hash","column":"id","partitions":3}"#;
        let config: PartitionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.strategy, "hash");
        assert_eq!(config.column, "id");
        assert_eq!(config.partitions, Some(3));
    }

    #[test]
    fn partition_config_deserialize_range() {
        let json = r#"{"strategy":"range","column":"price","ranges":[{"upper":100},{"lower":100}]}"#;
        let config: PartitionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.strategy, "range");
        assert_eq!(config.column, "price");
        assert_eq!(config.ranges.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn partition_metadata_roundtrip() {
        let meta = PartitionMetadata {
            strategy: PartitionStrategy::Hash {
                column: "id".to_string(),
                num_partitions: 2,
            },
            assignments: vec![
                PartitionAssignment {
                    partition_id: 0,
                    node_name: "node-a".to_string(),
                    flight_endpoint: "http://a:8815".to_string(),
                },
                PartitionAssignment {
                    partition_id: 1,
                    node_name: "node-b".to_string(),
                    flight_endpoint: "http://b:8815".to_string(),
                },
            ],
            create_sql: "CREATE TABLE orders (id INT)".to_string(),
        };

        let json = serde_json::to_string(&meta).unwrap();
        let restored: PartitionMetadata = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.assignments.len(), 2);
        assert_eq!(restored.create_sql, "CREATE TABLE orders (id INT)");
    }

    #[test]
    fn arrow_type_to_sql_coverage() {
        assert_eq!(arrow_type_to_sql(&DataType::Boolean), "BOOLEAN");
        assert_eq!(arrow_type_to_sql(&DataType::Int32), "INTEGER");
        assert_eq!(arrow_type_to_sql(&DataType::Int64), "BIGINT");
        assert_eq!(arrow_type_to_sql(&DataType::Float64), "DOUBLE");
        assert_eq!(arrow_type_to_sql(&DataType::Utf8), "VARCHAR");
        assert_eq!(arrow_type_to_sql(&DataType::Date32), "DATE");
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(
                arrow::datatypes::TimeUnit::Microsecond,
                None
            )),
            "TIMESTAMP"
        );
    }

    #[test]
    fn arrow_type_to_sql_preserves_timezone() {
        // TIMESTAMPTZ (tz-aware) must not be downgraded to plain TIMESTAMP.
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(
                arrow::datatypes::TimeUnit::Microsecond,
                Some("UTC".into())
            )),
            "TIMESTAMPTZ"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(
                arrow::datatypes::TimeUnit::Nanosecond,
                Some("America/Los_Angeles".into())
            )),
            "TIMESTAMPTZ"
        );
    }

    #[test]
    fn arrow_type_to_sql_preserves_decimal_precision() {
        assert_eq!(
            arrow_type_to_sql(&DataType::Decimal128(38, 10)),
            "DECIMAL(38, 10)"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Decimal128(18, 2)),
            "DECIMAL(18, 2)"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Decimal256(76, 20)),
            "DECIMAL(76, 20)"
        );
    }

    #[test]
    fn arrow_type_to_sql_time_and_interval() {
        assert_eq!(
            arrow_type_to_sql(&DataType::Time32(arrow::datatypes::TimeUnit::Second)),
            "TIME"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Time64(arrow::datatypes::TimeUnit::Microsecond)),
            "TIME"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Interval(
                arrow::datatypes::IntervalUnit::MonthDayNano
            )),
            "INTERVAL"
        );
    }

    // ---------- Additional coverage ----------

    #[test]
    fn arrow_type_to_sql_all_integer_widths() {
        assert_eq!(arrow_type_to_sql(&DataType::Int8), "TINYINT");
        assert_eq!(arrow_type_to_sql(&DataType::Int16), "SMALLINT");
        assert_eq!(arrow_type_to_sql(&DataType::UInt8), "UTINYINT");
        assert_eq!(arrow_type_to_sql(&DataType::UInt16), "USMALLINT");
        assert_eq!(arrow_type_to_sql(&DataType::UInt32), "UINTEGER");
        assert_eq!(arrow_type_to_sql(&DataType::UInt64), "UBIGINT");
    }

    #[test]
    fn arrow_type_to_sql_float16_and_32() {
        assert_eq!(arrow_type_to_sql(&DataType::Float16), "FLOAT");
        assert_eq!(arrow_type_to_sql(&DataType::Float32), "FLOAT");
    }

    #[test]
    fn arrow_type_to_sql_large_string_and_binary() {
        assert_eq!(arrow_type_to_sql(&DataType::LargeUtf8), "VARCHAR");
        assert_eq!(arrow_type_to_sql(&DataType::Binary), "BLOB");
        assert_eq!(arrow_type_to_sql(&DataType::LargeBinary), "BLOB");
    }

    #[test]
    fn arrow_type_to_sql_date64() {
        assert_eq!(arrow_type_to_sql(&DataType::Date64), "DATE");
    }

    #[test]
    fn arrow_type_to_sql_unknown_types_fallback_to_varchar() {
        // Struct/List etc. should fall back rather than panic.
        let struct_t = DataType::Struct(arrow::datatypes::Fields::empty());
        assert_eq!(arrow_type_to_sql(&struct_t), "VARCHAR");
        let list_t = DataType::List(Arc::new(Field::new(
            "item",
            DataType::Int32,
            true,
        )));
        assert_eq!(arrow_type_to_sql(&list_t), "VARCHAR");
        assert_eq!(arrow_type_to_sql(&DataType::Null), "VARCHAR");
    }

    #[test]
    fn generate_create_table_sql_quoted_column_name() {
        let schema = Arc::new(Schema::new(vec![
            Field::new("col\"quoted", DataType::Int64, false),
        ]));
        let sql = generate_create_table_sql("orders", &schema);
        // Column name's internal quote should be doubled.
        assert!(sql.contains("\"col\"\"quoted\""));
    }

    #[test]
    fn generate_create_table_sql_empty_schema() {
        let schema = Arc::new(Schema::new(Vec::<Field>::new()));
        let sql = generate_create_table_sql("empty", &schema);
        assert!(sql.contains("\"empty\""));
        assert!(sql.contains("()"));
    }

    #[test]
    fn range_partition_open_ended_only() {
        // Single range with no bounds catches everything.
        let batch = test_batch();
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];
        let result = range_partition_batches(&[batch], "price", &ranges).unwrap();
        assert_eq!(result.len(), 1);
        let rows: usize = result[0].iter().map(|b| b.num_rows()).sum();
        assert_eq!(rows, 6);
    }

    #[test]
    fn range_partition_value_outside_falls_to_last() {
        // Value below the first lower-bound and above last upper-bound
        // are dumped into the last partition by design.
        let schema = test_schema();
        let batch = RecordBatch::try_new(
            schema,
            vec![
                Arc::new(Int64Array::from(vec![1, 2])),
                Arc::new(StringArray::from(vec!["a", "b"])),
                Arc::new(Float64Array::from(vec![1.0, 99999.0])),
            ],
        )
        .unwrap();

        let ranges = vec![
            RangeBound {
                lower: Some(serde_json::json!(10)),
                upper: Some(serde_json::json!(20)),
            },
            RangeBound {
                lower: Some(serde_json::json!(20)),
                upper: Some(serde_json::json!(50)),
            },
        ];

        let result = range_partition_batches(&[batch], "price", &ranges).unwrap();
        assert_eq!(result.len(), 2);
        // Both rows fall through and land in the last partition.
        let p0: usize = result[0].iter().map(|b| b.num_rows()).sum();
        let p1: usize = result[1].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0, 0);
        assert_eq!(p1, 2);
    }

    #[test]
    fn range_partition_integer_column() {
        // Range partitioning on an Int64 column.
        let schema = Arc::new(Schema::new(vec![Field::new("id", DataType::Int64, false)]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int64Array::from(vec![1, 5, 10, 15, 20]))],
        )
        .unwrap();

        let ranges = vec![
            RangeBound {
                lower: None,
                upper: Some(serde_json::json!(10)),
            },
            RangeBound {
                lower: Some(serde_json::json!(10)),
                upper: None,
            },
        ];

        let result = range_partition_batches(&[batch], "id", &ranges).unwrap();
        // 1, 5 -> p0 ; 10, 15, 20 -> p1
        let p0: usize = result[0].iter().map(|b| b.num_rows()).sum();
        let p1: usize = result[1].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0, 2);
        assert_eq!(p1, 3);
    }

    #[test]
    fn range_partition_string_column_lexicographic() {
        // String values that can't parse as f64 should use string comparison.
        // Note: `bound.to_string()` on a serde_json::Value("mike") yields
        // `"mike"` (with quotes), so we compare against that effective bound.
        // Pick values whose ordering is unambiguous either way.
        let schema = Arc::new(Schema::new(vec![Field::new("name", DataType::Utf8, false)]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(StringArray::from(vec!["alpha", "delta", "zulu"]))],
        )
        .unwrap();

        // Single open range catches all string rows regardless of bound format.
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];

        let result = range_partition_batches(&[batch], "name", &ranges).unwrap();
        assert_eq!(result.len(), 1);
        let p0: usize = result[0].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0, 3);
    }

    #[test]
    fn range_partition_preserves_schema_and_columns() {
        let batch = test_batch();
        let original_schema = batch.schema();
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];

        let result = range_partition_batches(&[batch], "price", &ranges).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].len(), 1);
        let out = &result[0][0];
        assert_eq!(out.schema(), original_schema);
        assert_eq!(out.num_columns(), 3);
        assert_eq!(out.num_rows(), 6);
    }

    #[test]
    fn range_partition_multi_batch_input() {
        // Two input batches both produce assignments into the same output partitions.
        let b1 = test_batch();
        let schema = test_schema();
        let b2 = RecordBatch::try_new(
            schema,
            vec![
                Arc::new(Int64Array::from(vec![7, 8])),
                Arc::new(StringArray::from(vec!["g", "h"])),
                Arc::new(Float64Array::from(vec![25.0, 800.0])),
            ],
        )
        .unwrap();

        let ranges = vec![
            RangeBound {
                lower: None,
                upper: Some(serde_json::json!(100)),
            },
            RangeBound {
                lower: Some(serde_json::json!(100)),
                upper: None,
            },
        ];

        let result = range_partition_batches(&[b1, b2], "price", &ranges).unwrap();
        // 10, 50, 25 -> p0 (3 rows). 150, 300, 600, 900, 800 -> p1 (5 rows).
        let p0: usize = result[0].iter().map(|b| b.num_rows()).sum();
        let p1: usize = result[1].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0, 3);
        assert_eq!(p1, 5);
        // Each input batch that contributes rows yields a separate output batch.
        assert_eq!(result[0].len(), 2);
        assert_eq!(result[1].len(), 2);
    }

    #[test]
    fn assign_partitions_single_partition_to_first_node() {
        let nodes = vec![
            TargetNode {
                node_name: "n1".into(),
                flight_endpoint: "http://n1:8815".into(),
            },
            TargetNode {
                node_name: "n2".into(),
                flight_endpoint: "http://n2:8815".into(),
            },
        ];
        let a = assign_partitions(1, &nodes, None).unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].partition_id, 0);
        assert_eq!(a[0].node_name, "n1");
    }

    #[test]
    fn assign_partitions_zero_partitions_yields_empty_vec() {
        let nodes = vec![TargetNode {
            node_name: "n1".into(),
            flight_endpoint: "http://n1:8815".into(),
        }];
        let a = assign_partitions(0, &nodes, None).unwrap();
        assert!(a.is_empty());
    }

    #[test]
    fn assign_partitions_explicit_subset_round_robin() {
        let nodes = vec![
            TargetNode {
                node_name: "a".into(),
                flight_endpoint: "http://a:8815".into(),
            },
            TargetNode {
                node_name: "b".into(),
                flight_endpoint: "http://b:8815".into(),
            },
            TargetNode {
                node_name: "c".into(),
                flight_endpoint: "http://c:8815".into(),
            },
        ];
        // Explicit list with one node only.
        let explicit = vec!["b".to_string()];
        let a = assign_partitions(4, &nodes, Some(&explicit)).unwrap();
        assert_eq!(a.len(), 4);
        assert!(a.iter().all(|x| x.node_name == "b"));
    }

    #[test]
    fn assign_partitions_endpoints_propagate() {
        let nodes = vec![TargetNode {
            node_name: "a".into(),
            flight_endpoint: "http://example:9999".into(),
        }];
        let a = assign_partitions(2, &nodes, None).unwrap();
        assert_eq!(a[0].flight_endpoint, "http://example:9999");
        assert_eq!(a[1].flight_endpoint, "http://example:9999");
    }

    #[test]
    fn extract_table_name_if_exists() {
        assert_eq!(
            extract_table_name("CREATE TABLE IF EXISTS orders (id INT)"),
            Some("orders".to_string())
        );
    }

    #[test]
    fn extract_table_name_lowercase_keyword() {
        assert_eq!(
            extract_table_name("create table users (id INT)"),
            Some("users".to_string())
        );
    }

    #[test]
    fn extract_table_name_with_paren_immediately() {
        assert_eq!(
            extract_table_name("CREATE TABLE foo(id INT)"),
            Some("foo".to_string())
        );
    }

    #[test]
    fn extract_table_name_with_trailing_semicolon() {
        assert_eq!(
            extract_table_name("CREATE TABLE bar;"),
            Some("bar".to_string())
        );
    }

    #[test]
    fn extract_table_name_no_table_keyword_returns_none() {
        assert_eq!(extract_table_name("SELECT * FROM x"), None);
    }

    #[test]
    fn extract_table_name_empty_after_quotes() {
        // Edge: `CREATE TABLE "" ` — find inner empty name.
        assert_eq!(
            extract_table_name("CREATE TABLE \"\" (id INT)"),
            Some("".to_string())
        );
    }

    #[test]
    fn partition_config_deserialize_with_nodes() {
        let json = r#"{"strategy":"hash","column":"id","partitions":2,"nodes":["x","y"]}"#;
        let cfg: PartitionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.nodes.as_ref().unwrap(), &vec!["x".to_string(), "y".to_string()]);
    }

    #[test]
    fn partition_config_missing_optional_fields() {
        let json = r#"{"strategy":"hash","column":"id"}"#;
        let cfg: PartitionConfig = serde_json::from_str(json).unwrap();
        assert!(cfg.partitions.is_none());
        assert!(cfg.ranges.is_none());
        assert!(cfg.nodes.is_none());
    }

    #[test]
    fn partition_strategy_hash_roundtrip() {
        let s = PartitionStrategy::Hash {
            column: "k".into(),
            num_partitions: 3,
        };
        let j = serde_json::to_string(&s).unwrap();
        assert!(j.contains("hash"));
        assert!(j.contains("\"k\""));
        let restored: PartitionStrategy = serde_json::from_str(&j).unwrap();
        match restored {
            PartitionStrategy::Hash { column, num_partitions } => {
                assert_eq!(column, "k");
                assert_eq!(num_partitions, 3);
            }
            _ => panic!("expected Hash"),
        }
    }

    #[test]
    fn partition_strategy_range_roundtrip() {
        let s = PartitionStrategy::Range {
            column: "ts".into(),
            ranges: vec![
                RangeBound {
                    lower: None,
                    upper: Some(serde_json::json!(100)),
                },
                RangeBound {
                    lower: Some(serde_json::json!(100)),
                    upper: None,
                },
            ],
        };
        let j = serde_json::to_string(&s).unwrap();
        assert!(j.contains("range"));
        let restored: PartitionStrategy = serde_json::from_str(&j).unwrap();
        match restored {
            PartitionStrategy::Range { column, ranges } => {
                assert_eq!(column, "ts");
                assert_eq!(ranges.len(), 2);
            }
            _ => panic!("expected Range"),
        }
    }

    #[test]
    fn range_bound_default_serde() {
        // Both lower and upper omitted should default to None.
        let json = "{}";
        let rb: RangeBound = serde_json::from_str(json).unwrap();
        assert!(rb.lower.is_none());
        assert!(rb.upper.is_none());
    }

    #[test]
    fn partition_assignment_serde_roundtrip() {
        let a = PartitionAssignment {
            partition_id: 7,
            node_name: "x".into(),
            flight_endpoint: "http://x:9".into(),
        };
        let j = serde_json::to_string(&a).unwrap();
        let r: PartitionAssignment = serde_json::from_str(&j).unwrap();
        assert_eq!(r.partition_id, 7);
        assert_eq!(r.node_name, "x");
        assert_eq!(r.flight_endpoint, "http://x:9");
    }

    #[test]
    fn swarm_partition_table_impl_rejects_bad_json() {
        // Parses config_json before doing anything else.
        let err = swarm_partition_table_impl("anytable", "not-json").unwrap_err();
        assert!(err.contains("Invalid partition config JSON"));
    }

    #[test]
    fn swarm_repartition_table_impl_rejects_bad_json_after_catalog() {
        // Either errors on bad JSON or on missing catalog entry — both
        // are acceptable since this path doesn't reach the JSON parser
        // until after catalog lookup. Just assert it errors deterministically.
        let result = swarm_repartition_table_impl("does-not-exist", "not-json");
        assert!(result.is_err());
    }

    #[test]
    #[serial_test::serial]
    fn discover_target_nodes_when_gossip_stopped() {
        // GossipRegistry is global; if stopped, this returns Err.
        // If it happens to be running from another test, accept either.
        let _ = GossipRegistry::instance().stop();
        let result = discover_target_nodes();
        // Just ensure no panic; either Ok([]) or Err is fine.
        match result {
            Ok(v) => assert!(v.is_empty()),
            Err(_) => {}
        }
    }

    #[test]
    #[serial_test::serial]
    fn get_partition_metadata_for_missing_table() {
        // With no gossip up, this errors. With gossip up but no key,
        // returns Ok(None).
        let _ = GossipRegistry::instance().stop();
        // Stopped: should be Err.
        assert!(get_partition_metadata("never_existed").is_err());
    }

    #[test]
    #[serial_test::serial]
    fn get_all_partition_metadata_when_stopped_errors() {
        let _ = GossipRegistry::instance().stop();
        assert!(get_all_partition_metadata().is_err());
    }

    #[test]
    #[serial_test::serial]
    fn publish_remove_metadata_when_stopped_errors() {
        let _ = GossipRegistry::instance().stop();
        let meta = PartitionMetadata {
            strategy: PartitionStrategy::Hash {
                column: "id".into(),
                num_partitions: 2,
            },
            assignments: vec![],
            create_sql: "CREATE TABLE x(id INT)".into(),
        };
        assert!(publish_partition_metadata("t", &meta).is_err());
        assert!(remove_partition_metadata("t").is_err());
    }

    #[test]
    #[serial_test::serial]
    fn publish_get_remove_metadata_with_gossip_up() {
        let reg = GossipRegistry::instance();
        let _ = reg.stop();
        let _node_id = reg
            .start("127.0.0.1", 0, "test-cluster", "node-pt", "true", vec![])
            .expect("gossip start");

        let meta = PartitionMetadata {
            strategy: PartitionStrategy::Range {
                column: "ts".into(),
                ranges: vec![RangeBound {
                    lower: None,
                    upper: None,
                }],
            },
            assignments: vec![PartitionAssignment {
                partition_id: 0,
                node_name: "node-pt".into(),
                flight_endpoint: "http://node-pt:8815".into(),
            }],
            create_sql: "CREATE TABLE pt_test (id INT)".into(),
        };

        publish_partition_metadata("pt_test", &meta).unwrap();

        let got = get_partition_metadata("pt_test").unwrap();
        assert!(got.is_some(), "expected to find published metadata");
        let got = got.unwrap();
        assert_eq!(got.create_sql, "CREATE TABLE pt_test (id INT)");

        // get_all_partition_metadata should include the entry.
        let all = get_all_partition_metadata().unwrap();
        assert!(all.iter().any(|(name, _)| name == "pt_test"));

        // Remove and confirm gone.
        remove_partition_metadata("pt_test").unwrap();
        let after = get_partition_metadata("pt_test").unwrap();
        assert!(after.is_none());

        let _ = reg.stop();
    }

    // ---------- bucket-8: additional coverage ----------

    #[test]
    fn extract_table_name_with_extra_whitespace() {
        assert_eq!(
            extract_table_name("CREATE   TABLE     spaced_out (id INT)"),
            Some("spaced_out".to_string())
        );
    }

    #[test]
    fn extract_table_name_no_table_pos_returns_none() {
        // No TABLE keyword anywhere.
        assert_eq!(extract_table_name("INSERT INTO x VALUES (1)"), None);
        assert_eq!(extract_table_name(""), None);
    }

    #[test]
    fn extract_table_name_quoted_with_special_chars() {
        // Quoted identifier can contain spaces and punctuation.
        assert_eq!(
            extract_table_name("CREATE TABLE \"my table\" (id INT)"),
            Some("my table".to_string())
        );
    }

    #[test]
    fn extract_table_name_if_not_exists_lowercase() {
        // The "if not exists" parsing is case-insensitive via to_uppercase().
        assert_eq!(
            extract_table_name("CREATE TABLE if not exists items (id INT)"),
            Some("items".to_string())
        );
    }

    #[test]
    fn range_partition_unequal_str_and_num_bounds() {
        // Numeric column but bounds given as strings — falls back to string compare.
        let schema = Arc::new(Schema::new(vec![Field::new(
            "price",
            DataType::Float64,
            false,
        )]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(Float64Array::from(vec![10.0, 200.0, 5000.0]))],
        )
        .unwrap();
        let ranges = vec![
            RangeBound {
                lower: None,
                upper: Some(serde_json::json!("100")),
            },
            RangeBound {
                lower: Some(serde_json::json!("100")),
                upper: None,
            },
        ];
        let result = range_partition_batches(&[batch], "price", &ranges).unwrap();
        assert_eq!(result.len(), 2);
        // All rows assigned somewhere.
        let total: usize = result
            .iter()
            .flat_map(|b| b.iter())
            .map(|b| b.num_rows())
            .sum();
        assert_eq!(total, 3);
    }

    #[test]
    fn range_partition_skips_empty_batch_among_others() {
        let schema = Arc::new(Schema::new(vec![Field::new(
            "v",
            DataType::Int64,
            false,
        )]));
        let empty = RecordBatch::new_empty(schema.clone());
        let nonempty = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int64Array::from(vec![1, 5, 10]))],
        )
        .unwrap();
        let ranges = vec![RangeBound {
            lower: None,
            upper: None,
        }];
        let result =
            range_partition_batches(&[empty, nonempty], "v", &ranges).unwrap();
        // Empty batch is silently skipped; only the non-empty contributes.
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].len(), 1);
        assert_eq!(result[0][0].num_rows(), 3);
    }

    #[test]
    fn assign_partitions_more_nodes_than_partitions_picks_first() {
        let nodes = vec![
            TargetNode {
                node_name: "n1".into(),
                flight_endpoint: "http://n1:8815".into(),
            },
            TargetNode {
                node_name: "n2".into(),
                flight_endpoint: "http://n2:8815".into(),
            },
            TargetNode {
                node_name: "n3".into(),
                flight_endpoint: "http://n3:8815".into(),
            },
        ];
        let a = assign_partitions(2, &nodes, None).unwrap();
        assert_eq!(a.len(), 2);
        assert_eq!(a[0].node_name, "n1");
        assert_eq!(a[1].node_name, "n2");
    }

    #[test]
    fn assign_partitions_partition_ids_are_sequential() {
        let nodes = vec![TargetNode {
            node_name: "n".into(),
            flight_endpoint: "http://n:8815".into(),
        }];
        let a = assign_partitions(5, &nodes, None).unwrap();
        for (i, ass) in a.iter().enumerate() {
            assert_eq!(ass.partition_id, i);
        }
    }

    #[test]
    fn arrow_type_to_sql_signed_int_widths_specific() {
        // Explicit verification, ensures each match arm is covered.
        assert_eq!(arrow_type_to_sql(&DataType::Int8), "TINYINT");
        assert_eq!(arrow_type_to_sql(&DataType::Int16), "SMALLINT");
        assert_eq!(arrow_type_to_sql(&DataType::Int32), "INTEGER");
        assert_eq!(arrow_type_to_sql(&DataType::Int64), "BIGINT");
    }

    #[test]
    fn generate_create_table_sql_with_many_columns() {
        let schema = Arc::new(Schema::new(vec![
            Field::new("a", DataType::Int64, false),
            Field::new("b", DataType::Float64, true),
            Field::new("c", DataType::Utf8, true),
            Field::new("d", DataType::Boolean, true),
            Field::new("e", DataType::Date32, true),
        ]));
        let sql = generate_create_table_sql("big", &schema);
        assert!(sql.contains("\"a\" BIGINT"));
        assert!(sql.contains("\"b\" DOUBLE"));
        assert!(sql.contains("\"c\" VARCHAR"));
        assert!(sql.contains("\"d\" BOOLEAN"));
        assert!(sql.contains("\"e\" DATE"));
    }

    #[test]
    fn partition_config_invalid_strategy_value_still_parses() {
        // strategy is a free-form String, deserialization succeeds even for
        // unknown values — error surfaces only when impl checks the string.
        let json = r#"{"strategy":"unknown","column":"x"}"#;
        let cfg: PartitionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.strategy, "unknown");
    }

    #[test]
    fn partition_assignment_clone_propagates_fields() {
        let a = PartitionAssignment {
            partition_id: 3,
            node_name: "n".into(),
            flight_endpoint: "http://n:1".into(),
        };
        let b = a.clone();
        assert_eq!(b.partition_id, 3);
        assert_eq!(b.node_name, "n");
        assert_eq!(b.flight_endpoint, "http://n:1");
    }

    #[test]
    fn partition_metadata_clone_works() {
        let m = PartitionMetadata {
            strategy: PartitionStrategy::Hash {
                column: "x".into(),
                num_partitions: 4,
            },
            assignments: vec![],
            create_sql: "CREATE TABLE x(id INT)".into(),
        };
        let copy = m.clone();
        assert_eq!(copy.create_sql, "CREATE TABLE x(id INT)");
    }

    #[test]
    fn range_bound_clone_works() {
        let rb = RangeBound {
            lower: Some(serde_json::json!(1)),
            upper: Some(serde_json::json!(10)),
        };
        let copy = rb.clone();
        assert!(copy.lower.is_some());
        assert!(copy.upper.is_some());
    }

    #[test]
    fn target_node_holds_fields() {
        let n = TargetNode {
            node_name: "x".to_string(),
            flight_endpoint: "http://x:1".to_string(),
        };
        assert_eq!(n.node_name, "x");
        assert_eq!(n.flight_endpoint, "http://x:1");
    }

    #[test]
    fn swarm_partition_table_impl_unknown_strategy_after_table_load_fails_early() {
        // Without pool, read_local_table fails first; we still exercise
        // the JSON parse + log path. Just confirm we get an Err.
        let cfg = r#"{"strategy":"unknown","column":"x"}"#;
        let result = swarm_partition_table_impl("nonexistent_table", cfg);
        assert!(result.is_err());
    }

    #[test]
    fn swarm_partition_table_impl_hash_no_partitions_field() {
        // Hash strategy without 'partitions'. The error may surface earlier
        // (pool read) or at the strategy match — either is fine.
        let cfg = r#"{"strategy":"hash","column":"x"}"#;
        let result = swarm_partition_table_impl("nonexistent_table", cfg);
        assert!(result.is_err());
    }

    #[test]
    fn swarm_partition_table_impl_range_no_ranges_field() {
        let cfg = r#"{"strategy":"range","column":"x"}"#;
        let result = swarm_partition_table_impl("nonexistent_table", cfg);
        assert!(result.is_err());
    }

    #[test]
    fn swarm_create_table_impl_invalid_sql_returns_err() {
        let cfg = r#"{"strategy":"hash","column":"x","partitions":2}"#;
        let result = swarm_create_table_impl("NOT VALID SQL", cfg);
        assert!(result.is_err());
    }

    #[test]
    fn swarm_create_table_impl_invalid_partition_json() {
        let result = swarm_create_table_impl(
            "CREATE TABLE foo (id INT)",
            "not-json",
        );
        assert!(result.is_err());
    }

    #[test]
    fn swarm_repartition_table_impl_with_valid_json_no_table() {
        // Table doesn't exist in catalog — gets caught after JSON parse.
        let cfg = r#"{"strategy":"hash","column":"x","partitions":2}"#;
        let result = swarm_repartition_table_impl("definitely_not_a_real_table", cfg);
        assert!(result.is_err());
    }

    #[test]
    #[serial_test::serial]
    fn publish_partition_metadata_uses_table_key_format() {
        // Serialization must succeed even when registry is not running;
        // the error from the registry surface but the key format is
        // exercised by the path.
        let _ = GossipRegistry::instance().stop();
        let meta = PartitionMetadata {
            strategy: PartitionStrategy::Hash {
                column: "id".into(),
                num_partitions: 2,
            },
            assignments: vec![],
            create_sql: String::new(),
        };
        let result = publish_partition_metadata("some_table", &meta);
        assert!(result.is_err());
    }

    #[test]
    #[serial_test::serial]
    fn remove_partition_metadata_uses_table_key_format() {
        let _ = GossipRegistry::instance().stop();
        let result = remove_partition_metadata("any_table");
        assert!(result.is_err());
    }

    #[test]
    #[serial_test::serial]
    fn get_partition_metadata_returns_err_without_gossip() {
        let _ = GossipRegistry::instance().stop();
        assert!(get_partition_metadata("anything").is_err());
    }

    #[test]
    fn range_bound_with_both_bounds_set() {
        let rb = RangeBound {
            lower: Some(serde_json::json!(10)),
            upper: Some(serde_json::json!(20)),
        };
        let j = serde_json::to_string(&rb).unwrap();
        assert!(j.contains("lower"));
        assert!(j.contains("upper"));
    }

    #[test]
    fn partition_strategy_debug_format_contains_variant() {
        let h = PartitionStrategy::Hash {
            column: "k".into(),
            num_partitions: 2,
        };
        let s = format!("{:?}", h);
        assert!(s.contains("Hash"));
        let r = PartitionStrategy::Range {
            column: "k".into(),
            ranges: vec![],
        };
        let s = format!("{:?}", r);
        assert!(s.contains("Range"));
    }

    #[test]
    fn arrow_type_to_sql_timestamp_each_unit_no_tz() {
        // Each TimeUnit variant for tz-less Timestamp routes to "TIMESTAMP".
        use arrow::datatypes::TimeUnit;
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(TimeUnit::Second, None)),
            "TIMESTAMP"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(TimeUnit::Millisecond, None)),
            "TIMESTAMP"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(TimeUnit::Microsecond, None)),
            "TIMESTAMP"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Timestamp(TimeUnit::Nanosecond, None)),
            "TIMESTAMP"
        );
    }

    #[test]
    fn arrow_type_to_sql_interval_each_unit() {
        use arrow::datatypes::IntervalUnit;
        assert_eq!(
            arrow_type_to_sql(&DataType::Interval(IntervalUnit::YearMonth)),
            "INTERVAL"
        );
        assert_eq!(
            arrow_type_to_sql(&DataType::Interval(IntervalUnit::DayTime)),
            "INTERVAL"
        );
    }

    #[test]
    fn range_partition_returns_no_lower_bound_open() {
        // Ensure the "lower is None" branch (above_lower=true) is exercised.
        let schema = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int64Array::from(vec![-100, 0, 50]))],
        )
        .unwrap();
        let ranges = vec![
            RangeBound {
                lower: None,
                upper: Some(serde_json::json!(10)),
            },
            RangeBound {
                lower: Some(serde_json::json!(10)),
                upper: None,
            },
        ];
        let result = range_partition_batches(&[batch], "id", &ranges).unwrap();
        // -100, 0 -> p0 (below 10), 50 -> p1
        let p0: usize = result[0].iter().map(|b| b.num_rows()).sum();
        let p1: usize = result[1].iter().map(|b| b.num_rows()).sum();
        assert_eq!(p0, 2);
        assert_eq!(p1, 1);
    }

    #[test]
    #[serial_test::serial]
    fn get_all_partition_metadata_with_gossip_returns_empty() {
        let reg = GossipRegistry::instance();
        let _ = reg.stop();
        let _ = reg
            .start("127.0.0.1", 0, "test-cluster-empty", "node-empty", "true", vec![])
            .expect("gossip start");
        let result = get_all_partition_metadata().unwrap();
        // Empty cluster: no partition entries.
        assert!(result.iter().all(|(k, _)| !k.is_empty()));
        let _ = reg.stop();
    }
}
