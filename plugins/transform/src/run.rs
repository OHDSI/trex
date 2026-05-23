use crate::compile::compile_project;
use crate::dag::transitive_dependents;
use crate::parser::{extract_dependencies, rewrite_table_references, rewrite_table_references_dual};
use crate::project::{load_project, BatchSize, IncrementalStrategy, Materialization, SnapshotStrategy};
use crate::state::{delete_state, ensure_state_table, query_state, upsert_state};
use crate::{escape_sql_ident, escape_sql_str, execute_sql, query_sql};
use chrono::Utc;
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use siphasher::sip::SipHasher13;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

struct RunResult {
    name: String,
    action: String,
    materialized: String,
    duration_ms: i64,
    message: String,
}

fn compute_model_checksum(name: &str, sql: &str, yaml: Option<&str>) -> String {
    let mut hasher = SipHasher13::new();
    name.hash(&mut hasher);
    sql.hash(&mut hasher);
    if let Some(y) = yaml {
        y.hash(&mut hasher);
    }
    hasher.finish().to_string()
}

pub struct IncrementalConfig {
    pub strategy: IncrementalStrategy,
    pub unique_key: Option<Vec<String>>,
    pub updated_at: Option<String>,
    pub batch_size: Option<BatchSize>,
    pub lookback: Option<u32>,
    pub merge_update_columns: Option<Vec<String>>,
    pub merge_exclude_columns: Option<Vec<String>>,
    pub last_watermark: Option<String>,
}

fn process_incremental_markers(sql: &str, schema: &str, model_name: &str, is_new: bool) -> String {
    let start_marker = "-- __is_incremental__";
    let end_marker = "-- __end_incremental__";

    let this_ref = format!(
        "\"{}\".\"{}\"",
        escape_sql_ident(schema),
        escape_sql_ident(model_name)
    );

    let mut result = String::new();
    let mut remaining = sql;

    loop {
        let start_pos = match remaining.find(start_marker) {
            Some(pos) => pos,
            None => {
                result.push_str(remaining);
                break;
            }
        };

        let after_start = &remaining[start_pos + start_marker.len()..];
        let end_pos = match after_start.find(end_marker) {
            Some(pos) => pos,
            None => {
                    result.push_str(remaining);
                break;
            }
        };

        let before = &remaining[..start_pos];
        let block = &after_start[..end_pos];
        remaining = &after_start[end_pos + end_marker.len()..];

        if is_new {
            result.push_str(before.trim_end());
        } else {
            result.push_str(before.trim_end());
            result.push_str(&block.replace("__this__", &this_ref));
        }
    }

    result
}

fn build_append_sql(schema: &str, model_name: &str, rewritten: &str) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);
    vec![format!(
        "INSERT INTO \"{esc_schema}\".\"{esc_name}\" {rewritten}"
    )]
}

fn materialize_append(
    schema: &str,
    model_name: &str,
    rewritten: &str,
) -> Result<(), Box<dyn Error>> {
    for sql in build_append_sql(schema, model_name, rewritten) {
        execute_sql(&sql)?;
    }
    Ok(())
}

fn build_delete_insert_sql(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    unique_key: &[String],
) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);

    let mut stmts = Vec::with_capacity(2);
    if unique_key.len() == 1 {
        let esc_key = escape_sql_ident(&unique_key[0]);
        stmts.push(format!(
            "DELETE FROM \"{esc_schema}\".\"{esc_name}\" \
             WHERE \"{esc_key}\" IN (SELECT \"{esc_key}\" FROM ({rewritten}))"
        ));
    } else {
        let where_clause: Vec<String> = unique_key
            .iter()
            .map(|k| {
                let ek = escape_sql_ident(k);
                format!("\"{esc_schema}\".\"{esc_name}\".\"{ek}\" = __src__.\"{ek}\"")
            })
            .collect();
        stmts.push(format!(
            "DELETE FROM \"{esc_schema}\".\"{esc_name}\" WHERE EXISTS (\
             SELECT 1 FROM ({rewritten}) AS __src__ WHERE {})",
            where_clause.join(" AND ")
        ));
    }

    stmts.push(format!(
        "INSERT INTO \"{esc_schema}\".\"{esc_name}\" {rewritten}"
    ));
    stmts
}

fn materialize_delete_insert(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    unique_key: &[String],
) -> Result<(), Box<dyn Error>> {
    for sql in build_delete_insert_sql(schema, model_name, rewritten, unique_key) {
        execute_sql(&sql)?;
    }
    Ok(())
}

fn build_merge_staging_create_sql(esc_staging: &str, rewritten: &str) -> Vec<String> {
    vec![format!(
        "CREATE TEMPORARY TABLE \"{esc_staging}\" AS {rewritten}"
    )]
}

fn build_merge_staging_drop_sql(esc_staging: &str) -> Vec<String> {
    vec![format!("DROP TABLE IF EXISTS \"{esc_staging}\"")]
}

fn build_merge_staging_columns_query_sql(staging: &str) -> String {
    format!(
        "SELECT column_name FROM information_schema.columns \
         WHERE table_schema = 'temp' AND table_name = '{}'",
        escape_sql_str(staging)
    )
}

fn build_merge_inner_sql(
    schema: &str,
    model_name: &str,
    esc_staging: &str,
    unique_key: &[String],
    merge_update_columns: Option<&Vec<String>>,
    merge_exclude_columns: Option<&Vec<String>>,
    all_columns: &[String],
) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);

    let key_set: HashSet<&str> = unique_key.iter().map(|s| s.as_str()).collect();

    let update_cols: Vec<&String> = if let Some(whitelist) = merge_update_columns {
        whitelist.iter().filter(|c| !key_set.contains(c.as_str())).collect()
    } else {
        let exclude_set: HashSet<&str> = merge_exclude_columns
            .map(|v| v.iter().map(|s| s.as_str()).collect())
            .unwrap_or_default();
        all_columns
            .iter()
            .filter(|c| !key_set.contains(c.as_str()) && !exclude_set.contains(c.as_str()))
            .collect()
    };

    let mut stmts = Vec::new();

    if !update_cols.is_empty() {
        let set_clause: Vec<String> = update_cols
            .iter()
            .map(|c| {
                let ec = escape_sql_ident(c);
                format!("\"{ec}\" = __stg__.\"{ec}\"")
            })
            .collect();

        let join_clause: Vec<String> = unique_key
            .iter()
            .map(|k| {
                let ek = escape_sql_ident(k);
                format!(
                    "\"{esc_schema}\".\"{esc_name}\".\"{ek}\" = __stg__.\"{ek}\""
                )
            })
            .collect();

        stmts.push(format!(
            "UPDATE \"{esc_schema}\".\"{esc_name}\" SET {} \
             FROM \"{esc_staging}\" AS __stg__ WHERE {}",
            set_clause.join(", "),
            join_clause.join(" AND ")
        ));
    }

    let insert_join: Vec<String> = unique_key
        .iter()
        .map(|k| {
            let ek = escape_sql_ident(k);
            format!(
                "\"{esc_schema}\".\"{esc_name}\".\"{ek}\" = \"{esc_staging}\".\"{ek}\""
            )
        })
        .collect();

    let col_list: Vec<String> = all_columns
        .iter()
        .map(|c| format!("\"{}\"", escape_sql_ident(c)))
        .collect();

    stmts.push(format!(
        "INSERT INTO \"{esc_schema}\".\"{esc_name}\" ({cols}) \
         SELECT {cols} FROM \"{esc_staging}\" \
         WHERE NOT EXISTS (\
             SELECT 1 FROM \"{esc_schema}\".\"{esc_name}\" WHERE {join}\
         )",
        cols = col_list.join(", "),
        join = insert_join.join(" AND ")
    ));

    stmts
}

fn materialize_merge(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    unique_key: &[String],
    merge_update_columns: Option<&Vec<String>>,
    merge_exclude_columns: Option<&Vec<String>>,
) -> Result<(), Box<dyn Error>> {
    let staging = format!("__staging_{model_name}__");
    let esc_staging = escape_sql_ident(&staging);

    for sql in build_merge_staging_create_sql(&esc_staging, rewritten) {
        execute_sql(&sql)?;
    }

    let result = materialize_merge_inner(
        schema,
        model_name,
        &staging,
        &esc_staging,
        unique_key,
        merge_update_columns,
        merge_exclude_columns,
    );

    for sql in build_merge_staging_drop_sql(&esc_staging) {
        let _ = execute_sql(&sql);
    }

    result
}

fn materialize_merge_inner(
    schema: &str,
    model_name: &str,
    staging: &str,
    esc_staging: &str,
    unique_key: &[String],
    merge_update_columns: Option<&Vec<String>>,
    merge_exclude_columns: Option<&Vec<String>>,
) -> Result<(), Box<dyn Error>> {
    // Temporary tables live in the 'temp' schema
    let col_rows = query_sql(&build_merge_staging_columns_query_sql(staging))?;
    let all_columns: Vec<String> = col_rows.iter().map(|r| r.columns[0].clone()).collect();

    for sql in build_merge_inner_sql(
        schema,
        model_name,
        esc_staging,
        unique_key,
        merge_update_columns,
        merge_exclude_columns,
        &all_columns,
    ) {
        execute_sql(&sql)?;
    }

    Ok(())
}

fn build_microbatch_batch_end_query_sql(batch_size: BatchSize) -> String {
    let trunc = batch_size.as_trunc();
    format!("SELECT date_trunc('{trunc}', CURRENT_TIMESTAMP)::VARCHAR")
}

fn build_microbatch_batch_start_query_sql(
    watermark: &str,
    lookback: u32,
    batch_size: BatchSize,
) -> String {
    let interval = batch_size.as_interval();
    format!(
        "SELECT ('{watermark}'::TIMESTAMP - {lookback} * INTERVAL '{interval}')::VARCHAR",
        watermark = escape_sql_str(watermark),
        lookback = lookback,
        interval = interval,
    )
}

fn build_microbatch_min_query_sql(schema: &str, model_name: &str, updated_at: &str) -> String {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);
    let esc_updated_at = escape_sql_ident(updated_at);
    format!("SELECT MIN(\"{esc_updated_at}\")::VARCHAR FROM \"{esc_schema}\".\"{esc_name}\"")
}

fn build_microbatch_empty_insert_sql(
    schema: &str,
    model_name: &str,
    rewritten: &str,
) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);
    vec![format!(
        "INSERT INTO \"{esc_schema}\".\"{esc_name}\" {rewritten}"
    )]
}

fn build_microbatch_apply_sql(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    updated_at: &str,
    batch_start: &str,
    batch_end: &str,
) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);
    let esc_updated_at = escape_sql_ident(updated_at);

    vec![
        format!(
            "DELETE FROM \"{esc_schema}\".\"{esc_name}\" \
             WHERE \"{esc_updated_at}\" >= '{batch_start}'::TIMESTAMP \
             AND \"{esc_updated_at}\" < '{batch_end}'::TIMESTAMP",
            batch_start = escape_sql_str(batch_start),
            batch_end = escape_sql_str(batch_end),
        ),
        format!(
            "INSERT INTO \"{esc_schema}\".\"{esc_name}\" \
             SELECT * FROM ({rewritten}) AS __batch__ \
             WHERE \"{esc_updated_at}\" >= '{batch_start}'::TIMESTAMP \
             AND \"{esc_updated_at}\" < '{batch_end}'::TIMESTAMP",
            batch_start = escape_sql_str(batch_start),
            batch_end = escape_sql_str(batch_end),
        ),
    ]
}

fn materialize_microbatch(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    updated_at: &str,
    batch_size: BatchSize,
    lookback: u32,
    last_watermark: Option<&str>,
) -> Result<Option<String>, Box<dyn Error>> {
    let batch_end_rows = query_sql(&build_microbatch_batch_end_query_sql(batch_size))?;
    let batch_end = batch_end_rows
        .first()
        .map(|r| r.columns[0].clone())
        .ok_or("Failed to compute batch_end")?;

    let batch_start = if let Some(watermark) = last_watermark {
        let start_rows = query_sql(&build_microbatch_batch_start_query_sql(
            watermark, lookback, batch_size,
        ))?;
        start_rows
            .first()
            .map(|r| r.columns[0].clone())
            .ok_or_else(|| "Failed to compute batch_start".to_string())?
    } else {
        let min_rows = query_sql(&build_microbatch_min_query_sql(schema, model_name, updated_at))?;
        let min_val = min_rows
            .first()
            .and_then(|r| {
                let v = &r.columns[0];
                if v.is_empty() { None } else { Some(v.clone()) }
            });
        match min_val {
            Some(v) => v,
            None => {
                for sql in build_microbatch_empty_insert_sql(schema, model_name, rewritten) {
                    execute_sql(&sql)?;
                }
                return Ok(Some(batch_end));
            }
        }
    };

    for sql in build_microbatch_apply_sql(
        schema,
        model_name,
        rewritten,
        updated_at,
        &batch_start,
        &batch_end,
    ) {
        execute_sql(&sql)?;
    }

    Ok(Some(batch_end))
}

fn execute_hooks(
    hooks: &[String],
    schema: &str,
    model_name: &str,
) -> Result<(), Box<dyn Error>> {
    let this_ref = format!(
        "\"{}\".\"{}\"",
        escape_sql_ident(schema),
        escape_sql_ident(model_name)
    );
    for hook in hooks {
        let resolved = hook.replace("{{this}}", &this_ref);
        execute_sql(&resolved)?;
    }
    Ok(())
}

fn inline_ephemeral_models(
    sql: &str,
    ephemeral_models: &HashMap<String, String>,
    schema: &str,
    known_names: &HashSet<String>,
    source_names: Option<&HashSet<String>>,
    source_schema: Option<&str>,
) -> String {
    if ephemeral_models.is_empty() {
        return sql.to_string();
    }

    let referenced: Vec<String> = match extract_dependencies(sql) {
        Ok(deps) => deps
            .into_iter()
            .filter(|d| ephemeral_models.contains_key(d))
            .collect(),
        Err(_) => return sql.to_string(),
    };

    if referenced.is_empty() {
        return sql.to_string();
    }

    let mut all_needed: HashSet<String> = HashSet::new();
    let mut queue: std::collections::VecDeque<String> = referenced.into_iter().collect();
    while let Some(name) = queue.pop_front() {
        if !all_needed.insert(name.clone()) {
            continue;
        }
        if let Some(eph_sql) = ephemeral_models.get(&name) {
            if let Ok(deps) = extract_dependencies(eph_sql) {
                for dep in deps {
                    if ephemeral_models.contains_key(&dep) && !all_needed.contains(&dep) {
                        queue.push_back(dep);
                    }
                }
            }
        }
    }

    let mut edges: HashMap<String, HashSet<String>> = HashMap::new();
    for name in &all_needed {
        let mut deps = HashSet::new();
        if let Some(eph_sql) = ephemeral_models.get(name) {
            if let Ok(all_deps) = extract_dependencies(eph_sql) {
                for d in all_deps {
                    if all_needed.contains(&d) {
                        deps.insert(d);
                    }
                }
            }
        }
        edges.insert(name.clone(), deps);
    }

    let nodes: Vec<String> = all_needed.iter().cloned().collect();
    let sorted = match crate::dag::topological_sort(&nodes, &edges) {
        Ok(s) => s,
        Err(_) => return sql.to_string(),
    };

    let mut cte_parts: Vec<String> = Vec::new();
    for name in &sorted {
        if let Some(eph_sql) = ephemeral_models.get(name) {
            let non_ephemeral_names: HashSet<String> = known_names
                .iter()
                .filter(|n| !ephemeral_models.contains_key(*n))
                .cloned()
                .collect();
            let rewritten = if let (Some(src_names), Some(src_schema)) = (source_names, source_schema) {
                match rewrite_table_references_dual(eph_sql, &non_ephemeral_names, src_names, schema, src_schema) {
                    Ok(r) => r,
                    Err(_) => eph_sql.clone(),
                }
            } else {
                match rewrite_table_references(eph_sql, &non_ephemeral_names, schema) {
                    Ok(r) => r,
                    Err(_) => eph_sql.clone(),
                }
            };
            cte_parts.push(format!("{} AS ({})", name, rewritten.trim()));
        }
    }

    if cte_parts.is_empty() {
        return sql.to_string();
    }

    let trimmed = sql.trim_start();
    let cte_prefix = cte_parts.join(",\n     ");

    if let Some(rest) = trimmed.strip_prefix("WITH") {
        format!("WITH {},\n     {}", cte_prefix, rest.trim_start())
    } else {
        format!("WITH {}\n{}", cte_prefix, sql)
    }
}

fn build_snapshot_hash_expr(
    strategy: SnapshotStrategy,
    updated_at: Option<&str>,
    check_cols: Option<&Vec<String>>,
) -> String {
    match strategy {
        SnapshotStrategy::Timestamp => {
            let col = escape_sql_ident(updated_at.unwrap());
            format!("hash(\"{col}\"::VARCHAR)")
        }
        SnapshotStrategy::Check => {
            let cols = check_cols.unwrap();
            let parts: Vec<String> = cols
                .iter()
                .map(|c| format!("\"{}\"::VARCHAR", escape_sql_ident(c)))
                .collect();
            format!("hash({})", parts.join(" || '|' || "))
        }
    }
}

fn build_snapshot_staging_create_sql(
    esc_staging: &str,
    rewritten: &str,
    hash_expr: &str,
) -> Vec<String> {
    vec![format!(
        "CREATE TEMPORARY TABLE \"{esc_staging}\" AS \
         SELECT *, {hash_expr} AS _stg_hash FROM ({rewritten})"
    )]
}

fn build_snapshot_staging_drop_sql(esc_staging: &str) -> Vec<String> {
    vec![format!("DROP TABLE IF EXISTS \"{esc_staging}\"")]
}

fn build_snapshot_new_sql(schema: &str, model_name: &str, esc_staging: &str) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);
    vec![format!(
        "CREATE TABLE \"{esc_schema}\".\"{esc_name}\" AS \
         SELECT *, CURRENT_TIMESTAMP AS _snapshot_valid_from, \
         NULL::TIMESTAMP AS _snapshot_valid_to, \
         _stg_hash AS _snapshot_hash \
         FROM \"{esc_staging}\""
    )]
}

fn build_snapshot_update_sql(
    schema: &str,
    model_name: &str,
    esc_staging: &str,
    unique_key: &[String],
) -> Vec<String> {
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);

    let key_match_target_staging: Vec<String> = unique_key
        .iter()
        .map(|k| {
            let ek = escape_sql_ident(k);
            format!(
                "\"{esc_schema}\".\"{esc_name}\".\"{ek}\" = \"{esc_staging}\".\"{ek}\""
            )
        })
        .collect();
    let key_match_str = key_match_target_staging.join(" AND ");

    let key_match_staging_tgt: Vec<String> = unique_key
        .iter()
        .map(|k| {
            let ek = escape_sql_ident(k);
            format!("\"{esc_staging}\".\"{ek}\" = __tgt__.\"{ek}\"")
        })
        .collect();
    let key_match_staging_tgt_str = key_match_staging_tgt.join(" AND ");

    vec![
        format!(
            "UPDATE \"{esc_schema}\".\"{esc_name}\" SET _snapshot_valid_to = CURRENT_TIMESTAMP \
             WHERE _snapshot_valid_to IS NULL \
             AND (NOT EXISTS (SELECT 1 FROM \"{esc_staging}\" WHERE {key_match_str}) \
                  OR _snapshot_hash != (SELECT _stg_hash FROM \"{esc_staging}\" WHERE {key_match_str}))"
        ),
        format!(
            "INSERT INTO \"{esc_schema}\".\"{esc_name}\" \
             SELECT \"{esc_staging}\".*, CURRENT_TIMESTAMP, NULL, \"{esc_staging}\"._stg_hash \
             FROM \"{esc_staging}\" \
             WHERE NOT EXISTS (\
                 SELECT 1 FROM \"{esc_schema}\".\"{esc_name}\" AS __tgt__ \
                 WHERE {key_match_staging_tgt_str} \
                 AND __tgt__._snapshot_valid_to IS NULL \
                 AND __tgt__._snapshot_hash = \"{esc_staging}\"._stg_hash\
             )"
        ),
    ]
}

fn materialize_snapshot(
    schema: &str,
    model_name: &str,
    rewritten: &str,
    is_new: bool,
    unique_key: &[String],
    strategy: SnapshotStrategy,
    updated_at: Option<&str>,
    check_cols: Option<&Vec<String>>,
) -> Result<(), Box<dyn Error>> {
    let staging = format!("__snap_staging_{model_name}__");
    let esc_staging = escape_sql_ident(&staging);

    let hash_expr = build_snapshot_hash_expr(strategy, updated_at, check_cols);

    for sql in build_snapshot_staging_create_sql(&esc_staging, rewritten, &hash_expr) {
        execute_sql(&sql)?;
    }

    let result: Result<(), Box<dyn Error>> = if is_new {
        // Original called execute_sql once and used the Result as `result`.
        let mut last: Result<(), Box<dyn Error>> = Ok(());
        for sql in build_snapshot_new_sql(schema, model_name, &esc_staging) {
            last = execute_sql(&sql);
            if last.is_err() {
                break;
            }
        }
        last
    } else {
        // Original: first UPDATE used `?` (propagates Err out of the whole function
        // before DROP runs); second INSERT was the trailing expression returned as
        // `result`. Preserve that: short-circuit out of the function on UPDATE error.
        let stmts = build_snapshot_update_sql(schema, model_name, &esc_staging, unique_key);
        let mut iter = stmts.into_iter();
        if let Some(update_sql) = iter.next() {
            execute_sql(&update_sql)?;
        }
        let mut last: Result<(), Box<dyn Error>> = Ok(());
        for sql in iter {
            last = execute_sql(&sql);
            if last.is_err() {
                break;
            }
        }
        last
    };

    for sql in build_snapshot_staging_drop_sql(&esc_staging) {
        let _ = execute_sql(&sql);
    }
    result
}

fn materialize_model(
    model_name: &str,
    sql: &str,
    materialization: Materialization,
    schema: &str,
    known_names: &HashSet<String>,
    is_new: bool,
    incremental_config: Option<&IncrementalConfig>,
    ephemeral_models: &HashMap<String, String>,
    snapshot_strategy: Option<SnapshotStrategy>,
    snapshot_updated_at: Option<&str>,
    snapshot_check_cols: Option<&Vec<String>>,
    unique_key: Option<&Vec<String>>,
    source_names: Option<&HashSet<String>>,
    source_schema: Option<&str>,
) -> Result<Option<String>, Box<dyn Error>> {
    let with_ephemerals = inline_ephemeral_models(sql, ephemeral_models, schema, known_names, source_names, source_schema);
    // Must process incremental markers before SQL rewriting because sqlparser strips comments
    let processed = process_incremental_markers(&with_ephemerals, schema, model_name, is_new);
    let rewritten = if let (Some(src_names), Some(src_schema)) = (source_names, source_schema) {
        rewrite_table_references_dual(&processed, known_names, src_names, schema, src_schema)?
    } else {
        rewrite_table_references(&processed, known_names, schema)?
    };
    let esc_schema = escape_sql_ident(schema);
    let esc_name = escape_sql_ident(model_name);

    match materialization {
        Materialization::Ephemeral => {
            Ok(None)
        }
        Materialization::View => {
            execute_sql(&format!(
                "CREATE OR REPLACE VIEW \"{esc_schema}\".\"{esc_name}\" AS {rewritten}"
            ))?;
            Ok(None)
        }
        Materialization::Table => {
            execute_sql(&format!(
                "DROP TABLE IF EXISTS \"{esc_schema}\".\"{esc_name}\""
            ))?;
            execute_sql(&format!(
                "CREATE TABLE \"{esc_schema}\".\"{esc_name}\" AS {rewritten}"
            ))?;
            Ok(None)
        }
        Materialization::Snapshot => {
            let strategy = snapshot_strategy.unwrap_or(SnapshotStrategy::Timestamp);
            let uk = unique_key.ok_or_else(|| {
                format!("Model '{}': snapshot requires unique_key", model_name)
            })?;
            materialize_snapshot(
                schema,
                model_name,
                &rewritten,
                is_new,
                uk,
                strategy,
                snapshot_updated_at,
                snapshot_check_cols,
            )?;
            Ok(None)
        }
        Materialization::Incremental => {
            if is_new {
                execute_sql(&format!(
                    "CREATE TABLE \"{esc_schema}\".\"{esc_name}\" AS {rewritten}"
                ))?;
                if let Some(config) = incremental_config {
                    if config.strategy == IncrementalStrategy::Microbatch {
                        if let Some(batch_size) = config.batch_size {
                            let trunc = batch_size.as_trunc();
                            let rows = query_sql(&format!(
                                "SELECT date_trunc('{trunc}', CURRENT_TIMESTAMP)::VARCHAR"
                            ))?;
                            return Ok(rows.first().map(|r| r.columns[0].clone()));
                        }
                    }
                }
                return Ok(None);
            }

            let config = incremental_config;
            let strategy = config
                .map(|c| c.strategy)
                .unwrap_or(IncrementalStrategy::DeleteInsert);

            match strategy {
                IncrementalStrategy::Append => {
                    materialize_append(schema, model_name, &rewritten)?;
                    Ok(None)
                }
                IncrementalStrategy::DeleteInsert => {
                    if let Some(keys) = config.and_then(|c| c.unique_key.as_ref()) {
                        materialize_delete_insert(schema, model_name, &rewritten, keys)?;
                    } else {
                        execute_sql(&format!(
                            "DROP TABLE IF EXISTS \"{esc_schema}\".\"{esc_name}\""
                        ))?;
                        execute_sql(&format!(
                            "CREATE TABLE \"{esc_schema}\".\"{esc_name}\" AS {rewritten}"
                        ))?;
                    }
                    Ok(None)
                }
                IncrementalStrategy::Merge => {
                    let keys = config
                        .and_then(|c| c.unique_key.as_ref())
                        .ok_or_else(|| {
                            format!("Model '{}': merge strategy requires unique_key", model_name)
                        })?;
                    materialize_merge(
                        schema,
                        model_name,
                        &rewritten,
                        keys,
                        config.and_then(|c| c.merge_update_columns.as_ref()),
                        config.and_then(|c| c.merge_exclude_columns.as_ref()),
                    )?;
                    Ok(None)
                }
                IncrementalStrategy::Microbatch => {
                    let cfg = config.ok_or_else(|| {
                        format!("Model '{}': microbatch requires config", model_name)
                    })?;
                    let updated_at = cfg.updated_at.as_ref().ok_or_else(|| {
                        format!("Model '{}': microbatch requires updated_at", model_name)
                    })?;
                    let batch_size = cfg.batch_size.ok_or_else(|| {
                        format!("Model '{}': microbatch requires batch_size", model_name)
                    })?;
                    let lookback = cfg.lookback.unwrap_or(0);
                    materialize_microbatch(
                        schema,
                        model_name,
                        &rewritten,
                        updated_at,
                        batch_size,
                        lookback,
                        cfg.last_watermark.as_deref(),
                    )
                }
            }
        }
    }
}

fn run_project(path: &str, schema: &str, source_schema: Option<&str>) -> Result<Vec<RunResult>, Box<dyn Error>> {
    let project = load_project(path)?;
    let compiled = compile_project(&project)?;

    execute_sql(&format!(
        "CREATE SCHEMA IF NOT EXISTS \"{}\"",
        escape_sql_ident(schema)
    ))?;
    ensure_state_table(schema)?;

    let existing_state = query_state(schema)?;

    let known_names: HashSet<String> = project
        .models
        .iter()
        .map(|m| m.name.clone())
        .chain(project.seeds.iter().map(|s| s.name.clone()))
        .collect();

    let src_names: Option<HashSet<String>> = source_schema.map(|_| {
        project.source_tables.iter().cloned().collect()
    });

    let mut edges: HashMap<String, HashSet<String>> = HashMap::new();
    for model in &project.models {
        if let Ok(all_refs) = extract_dependencies(&model.sql) {
            let deps: HashSet<String> = all_refs
                .into_iter()
                .filter(|r| known_names.contains(r) && *r != model.name)
                .collect();
            edges.insert(model.name.clone(), deps);
        }
    }

    let mut directly_changed: HashSet<String> = HashSet::new();
    let mut checksums: HashMap<String, String> = HashMap::new();
    for model in &project.models {
        let checksum =
            compute_model_checksum(&model.name, &model.sql, model.yaml_content.as_deref());
        checksums.insert(model.name.clone(), checksum.clone());
        if model.materialization == Materialization::Ephemeral {
            continue;
        }
        match existing_state.get(&model.name) {
            Some(state) => {
                if state.checksum != checksum {
                    directly_changed.insert(model.name.clone());
                }
            }
            None => {
                directly_changed.insert(model.name.clone());
            }
        }
    }

    let all_model_names: Vec<String> = project.models.iter().map(|m| m.name.clone()).collect();
    let affected = transitive_dependents(&directly_changed, &all_model_names, &edges);

    let project_names: HashSet<String> = known_names.clone();
    let mut results = Vec::new();

    for (name, state) in &existing_state {
        if !project_names.contains(name) && state.materialized != "seed" {
            let start = Instant::now();
            let drop_sql = if state.materialized == "view" {
                format!(
                    "DROP VIEW IF EXISTS \"{}\".\"{}\"",
                    escape_sql_ident(schema),
                    escape_sql_ident(name)
                )
            } else {
                format!(
                    "DROP TABLE IF EXISTS \"{}\".\"{}\"",
                    escape_sql_ident(schema),
                    escape_sql_ident(name)
                )
            };

            match execute_sql(&drop_sql) {
                Ok(_) => {
                    delete_state(schema, name)?;
                    results.push(RunResult {
                        name: name.clone(),
                        action: "drop".to_string(),
                        materialized: state.materialized.clone(),
                        duration_ms: start.elapsed().as_millis() as i64,
                        message: String::new(),
                    });
                }
                Err(e) => {
                    return Err(format!("Failed to drop {}: {}", name, e).into());
                }
            }
        }
    }

    let ephemeral_models: HashMap<String, String> = project
        .models
        .iter()
        .filter(|m| m.materialization == Materialization::Ephemeral)
        .map(|m| (m.name.clone(), m.sql.clone()))
        .collect();

    for cr in &compiled {
        if cr.materialized == "seed" || cr.materialized == "ephemeral" {
            continue;
        }

        let model = project
            .models
            .iter()
            .find(|m| m.name == cr.name)
            .unwrap();

        let is_new = !existing_state.contains_key(&cr.name);
        let needs_rebuild = affected.contains(&cr.name);

        // Force rebuild when incremental strategy changes to avoid incompatible state
        let strategy_changed = if model.materialization == Materialization::Incremental {
            let current_strategy = model
                .incremental_strategy
                .unwrap_or(IncrementalStrategy::DeleteInsert);
            existing_state.get(&cr.name).map_or(false, |s| {
                s.incremental_strategy
                    .as_deref()
                    .map_or(false, |stored| stored != current_strategy.as_str())
            })
        } else {
            false
        };

        // These strategies process new data each run regardless of definition changes
        let always_run = match model.materialization {
            Materialization::Snapshot => true,
            Materialization::Incremental => {
                let strategy = model
                    .incremental_strategy
                    .unwrap_or(IncrementalStrategy::DeleteInsert);
                strategy == IncrementalStrategy::Append
                    || strategy == IncrementalStrategy::Microbatch
            }
            _ => false,
        };

        if !is_new && !needs_rebuild && !always_run && !strategy_changed {
            results.push(RunResult {
                name: cr.name.clone(),
                action: "no_change".to_string(),
                materialized: cr.materialized.clone(),
                duration_ms: 0,
                message: String::new(),
            });
            continue;
        }

        let inc_config = if model.materialization == Materialization::Incremental {
            let strategy = model
                .incremental_strategy
                .unwrap_or(IncrementalStrategy::DeleteInsert);
            let last_watermark = if strategy_changed {
                None
            } else {
                existing_state
                    .get(&cr.name)
                    .and_then(|s| s.last_watermark.clone())
            };
            Some(IncrementalConfig {
                strategy,
                unique_key: model.unique_key.clone(),
                updated_at: model.updated_at.clone(),
                batch_size: model.batch_size,
                lookback: model.lookback,
                merge_update_columns: model.merge_update_columns.clone(),
                merge_exclude_columns: model.merge_exclude_columns.clone(),
                last_watermark,
            })
        } else {
            None
        };

        let action = if is_new { "create" } else { "update" };
        let start = Instant::now();

        // Create a session for the entire transaction block so that
        // BEGIN/COMMIT/ROLLBACK and all intermediate statements are
        // pinned to the same connection.
        let session_id = trex_pool_client::create_session()
            .map_err(|e| -> Box<dyn Error> { e.into() })?;
        let prev_session = crate::set_active_session(Some(session_id));

        let txn_result: Result<(), Box<dyn Error>> = (|| {
            execute_sql("BEGIN TRANSACTION;")?;

            if let Some(hooks) = &model.pre_hooks {
                if let Err(e) = execute_hooks(hooks, schema, &model.name) {
                    let _ = execute_sql("ROLLBACK;");
                    return Err(format!("Pre-hook failed for {}: {}", model.name, e).into());
                }
            }

            match materialize_model(
                &model.name,
                &model.sql,
                model.materialization,
                schema,
                &known_names,
                is_new,
                inc_config.as_ref(),
                &ephemeral_models,
                model.strategy,
                model.updated_at.as_deref(),
                model.check_cols.as_ref(),
                model.unique_key.as_ref(),
                src_names.as_ref(),
                source_schema,
            ) {
                Ok(new_watermark) => {
                    if let Some(hooks) = &model.post_hooks {
                        if let Err(e) = execute_hooks(hooks, schema, &model.name) {
                            let _ = execute_sql("ROLLBACK;");
                            return Err(
                                format!("Post-hook failed for {}: {}", model.name, e).into()
                            );
                        }
                    }

                    let checksum = checksums
                        .get(&model.name)
                        .cloned()
                        .unwrap_or_default();
                    let deployed_at = Utc::now().to_rfc3339();
                    let strategy_str = inc_config.as_ref().map(|c| c.strategy.as_str());
                    upsert_state(
                        schema,
                        &model.name,
                        model.materialization.as_str(),
                        &checksum,
                        &deployed_at,
                        strategy_str,
                        new_watermark.as_deref(),
                    )?;
                    execute_sql("COMMIT;")?;
                    results.push(RunResult {
                        name: cr.name.clone(),
                        action: action.to_string(),
                        materialized: cr.materialized.clone(),
                        duration_ms: start.elapsed().as_millis() as i64,
                        message: String::new(),
                    });
                }
                Err(e) => {
                    let _ = execute_sql("ROLLBACK;");
                    return Err(format!("Failed to materialize {}: {}", model.name, e).into());
                }
            }
            Ok(())
        })();

        crate::set_active_session(prev_session);
        let _ = trex_pool_client::destroy_session(session_id);
        txn_result?;
    }

    Ok(results)
}

#[repr(C)]
pub struct RunBindData {
    path: String,
    schema: String,
    source_schema: Option<String>,
}

#[repr(C)]
pub struct RunInitData {
    results: Vec<RunResult>,
    index: AtomicUsize,
}

pub struct RunVTab;

impl VTab for RunVTab {
    type InitData = RunInitData;
    type BindData = RunBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("action", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "materialized",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column(
            "duration_ms",
            LogicalTypeHandle::from(LogicalTypeId::Bigint),
        );
        bind.add_result_column("message", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        let source_schema = bind
            .get_named_parameter("source_schema")
            .map(|v| v.to_string())
            .filter(|s| !s.is_empty());
        Ok(RunBindData { path, schema, source_schema })
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

        let results = run_project(&path, &schema, source_schema.as_deref())?;

        Ok(RunInitData {
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

        let action_vector = output.flat_vector(1);
        action_vector.insert(0, result.action.as_str());

        let mat_vector = output.flat_vector(2);
        mat_vector.insert(0, result.materialized.as_str());

        let mut dur_vector = output.flat_vector(3);
        dur_vector.as_mut_slice::<i64>()[0] = result.duration_ms;

        let msg_vector = output.flat_vector(4);
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
mod run_tests {
    use super::*;

    // ---- compute_model_checksum -------------------------------------------------

    #[test]
    fn compute_model_checksum_is_stable_for_identical_input() {
        let a = compute_model_checksum("orders", "SELECT 1", Some("config: yes"));
        let b = compute_model_checksum("orders", "SELECT 1", Some("config: yes"));
        assert_eq!(a, b, "checksum must be deterministic");
    }

    #[test]
    fn compute_model_checksum_changes_when_sql_changes() {
        let a = compute_model_checksum("orders", "SELECT 1", None);
        let b = compute_model_checksum("orders", "SELECT 2", None);
        assert_ne!(a, b, "SQL change must change the checksum");
    }

    #[test]
    fn compute_model_checksum_changes_when_yaml_changes() {
        let a = compute_model_checksum("orders", "SELECT 1", Some("a: 1"));
        let b = compute_model_checksum("orders", "SELECT 1", Some("a: 2"));
        assert_ne!(a, b, "YAML change must change the checksum");
    }

    #[test]
    fn compute_model_checksum_distinguishes_none_from_some_yaml() {
        let none_yaml = compute_model_checksum("orders", "SELECT 1", None);
        let empty_yaml = compute_model_checksum("orders", "SELECT 1", Some(""));
        assert_ne!(
            none_yaml, empty_yaml,
            "None vs Some(\"\") must produce distinct checksums"
        );
    }

    // ---- process_incremental_markers --------------------------------------------
    //
    // The incremental block is delimited by the raw SQL comment markers
    //   -- __is_incremental__
    //   -- __end_incremental__
    // (the user-facing Jinja-style `{% if is_incremental %}` is rewritten upstream
    // to these markers). When `is_new` is true the block is dropped; otherwise it
    // is kept and `__this__` is replaced by the fully-qualified table reference.

    #[test]
    fn process_incremental_markers_passes_through_sql_without_markers() {
        let sql = "SELECT * FROM upstream";
        let out_new = process_incremental_markers(sql, "main", "orders", true);
        let out_inc = process_incremental_markers(sql, "main", "orders", false);
        assert_eq!(out_new, sql, "no-marker SQL must be returned unchanged (is_new)");
        assert_eq!(out_inc, sql, "no-marker SQL must be returned unchanged (incremental)");
    }

    #[test]
    fn process_incremental_markers_strips_block_for_new_model() {
        // On the first build (`is_new = true`) the block is dropped entirely so the
        // model performs a full refresh.
        let sql = "SELECT *\nFROM upstream\n-- __is_incremental__\nWHERE ts > (SELECT max(ts) FROM __this__)\n-- __end_incremental__";
        let out = process_incremental_markers(sql, "main", "orders", true);
        assert!(!out.contains("WHERE ts >"), "incremental filter should be stripped for new model: {out}");
        assert!(!out.contains("__is_incremental__"), "markers should be gone: {out}");
        assert!(!out.contains("__this__"), "__this__ placeholder should be gone: {out}");
        assert!(out.contains("FROM upstream"), "base query should remain: {out}");
    }

    #[test]
    fn process_incremental_markers_keeps_block_and_substitutes_this_when_not_new() {
        let sql = "SELECT *\nFROM upstream\n-- __is_incremental__\nWHERE ts > (SELECT max(ts) FROM __this__)\n-- __end_incremental__";
        let out = process_incremental_markers(sql, "main", "orders", false);
        assert!(out.contains("WHERE ts >"), "incremental filter should be kept: {out}");
        assert!(
            out.contains("\"main\".\"orders\""),
            "__this__ should be replaced with fully-qualified ref: {out}"
        );
        assert!(!out.contains("__this__"), "no raw __this__ placeholder should remain: {out}");
        assert!(!out.contains("__is_incremental__"), "markers themselves should be removed: {out}");
    }

    #[test]
    fn process_incremental_markers_handles_multiple_blocks() {
        let sql = "A\n-- __is_incremental__X-- __end_incremental__\nB\n-- __is_incremental__Y-- __end_incremental__\nC";
        let kept = process_incremental_markers(sql, "main", "m", false);
        // Both inner contents are kept when not new.
        assert!(kept.contains('X'), "first block kept: {kept}");
        assert!(kept.contains('Y'), "second block kept: {kept}");

        let stripped = process_incremental_markers(sql, "main", "m", true);
        assert!(!stripped.contains('X'), "first block stripped: {stripped}");
        assert!(!stripped.contains('Y'), "second block stripped: {stripped}");
        assert!(stripped.contains('A') && stripped.contains('B') && stripped.contains('C'));
    }

    #[test]
    fn process_incremental_markers_escapes_quotes_in_identifiers() {
        // escape_sql_ident doubles embedded quotes; the resulting reference must
        // therefore contain the doubled-quote form.
        let sql = "-- __is_incremental__\nFROM __this__\n-- __end_incremental__";
        let out = process_incremental_markers(sql, "sch\"ema", "mo\"del", false);
        assert!(
            out.contains("\"sch\"\"ema\".\"mo\"\"del\""),
            "embedded quotes should be doubled in the qualified ref: {out}"
        );
    }

    // ---- inline_ephemeral_models ------------------------------------------------

    #[test]
    fn inline_ephemeral_models_returns_unchanged_when_no_ephemerals() {
        let eph: HashMap<String, String> = HashMap::new();
        let known: HashSet<String> = HashSet::new();
        let sql = "SELECT * FROM upstream";
        let out = inline_ephemeral_models(sql, &eph, "main", &known, None, None);
        assert_eq!(out, sql, "empty ephemeral map should be a no-op");
    }

    #[test]
    fn inline_ephemeral_models_returns_unchanged_when_no_ephemeral_referenced() {
        // An ephemeral model exists but the SQL does not reference it.
        let mut eph: HashMap<String, String> = HashMap::new();
        eph.insert("eph_a".to_string(), "SELECT 1 AS x".to_string());
        let known: HashSet<String> = ["eph_a".to_string()].into_iter().collect();
        let sql = "SELECT * FROM something_else";
        let out = inline_ephemeral_models(sql, &eph, "main", &known, None, None);
        assert_eq!(out, sql, "unreferenced ephemeral should not be inlined");
    }

    #[test]
    fn inline_ephemeral_models_inlines_referenced_ephemeral_as_cte() {
        let mut eph: HashMap<String, String> = HashMap::new();
        eph.insert("eph_a".to_string(), "SELECT 1 AS x".to_string());
        let known: HashSet<String> = ["eph_a".to_string()].into_iter().collect();
        let sql = "SELECT * FROM eph_a";
        let out = inline_ephemeral_models(sql, &eph, "main", &known, None, None);
        assert!(out.starts_with("WITH "), "expected CTE prefix, got: {out}");
        assert!(out.contains("eph_a AS ("), "expected eph_a CTE, got: {out}");
        assert!(out.contains("SELECT 1 AS x"), "CTE body should be inlined: {out}");
        assert!(out.contains("FROM eph_a"), "outer SELECT should survive: {out}");
    }

    #[test]
    fn inline_ephemeral_models_inlines_transitive_ephemerals() {
        // eph_b depends on eph_a; the outer SQL only references eph_b directly,
        // but both must end up in the CTE block.
        let mut eph: HashMap<String, String> = HashMap::new();
        eph.insert("eph_a".to_string(), "SELECT 1 AS x".to_string());
        eph.insert("eph_b".to_string(), "SELECT * FROM eph_a".to_string());
        let known: HashSet<String> = ["eph_a".to_string(), "eph_b".to_string()]
            .into_iter()
            .collect();
        let sql = "SELECT * FROM eph_b";
        let out = inline_ephemeral_models(sql, &eph, "main", &known, None, None);
        assert!(out.contains("eph_a AS ("), "transitive ephemeral missing: {out}");
        assert!(out.contains("eph_b AS ("), "direct ephemeral missing: {out}");
        // eph_a must be defined before eph_b in the WITH clause.
        let pos_a = out.find("eph_a AS (").expect("eph_a CTE present");
        let pos_b = out.find("eph_b AS (").expect("eph_b CTE present");
        assert!(pos_a < pos_b, "eph_a must precede eph_b in CTE order: {out}");
    }

    // ---- build_append_sql -------------------------------------------------------

    #[test]
    fn build_append_sql_emits_single_insert() {
        let stmts = build_append_sql("main", "orders", "SELECT 1");
        assert_eq!(stmts.len(), 1, "append builder must emit exactly one statement");
        assert_eq!(
            stmts[0],
            "INSERT INTO \"main\".\"orders\" SELECT 1",
            "unexpected INSERT shape: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_append_sql_escapes_embedded_quotes_in_identifiers() {
        let stmts = build_append_sql("sch\"ema", "or\"ders", "SELECT 1");
        assert_eq!(
            stmts[0],
            "INSERT INTO \"sch\"\"ema\".\"or\"\"ders\" SELECT 1",
            "embedded quotes in schema/model must be doubled: {}",
            stmts[0]
        );
    }

    // ---- build_delete_insert_sql ------------------------------------------------

    #[test]
    fn build_delete_insert_sql_single_unique_key_uses_in_subquery() {
        let stmts = build_delete_insert_sql(
            "main",
            "orders",
            "SELECT * FROM src",
            &["id".to_string()],
        );
        assert_eq!(stmts.len(), 2, "delete+insert must emit two statements");
        assert_eq!(
            stmts[0],
            "DELETE FROM \"main\".\"orders\" WHERE \"id\" IN (SELECT \"id\" FROM (SELECT * FROM src))",
            "single-key DELETE shape mismatch: {}",
            stmts[0]
        );
        assert_eq!(
            stmts[1],
            "INSERT INTO \"main\".\"orders\" SELECT * FROM src",
            "INSERT shape mismatch: {}",
            stmts[1]
        );
    }

    #[test]
    fn build_delete_insert_sql_composite_unique_key_uses_exists_subquery() {
        let stmts = build_delete_insert_sql(
            "main",
            "orders",
            "SELECT * FROM src",
            &["a".to_string(), "b".to_string()],
        );
        assert_eq!(stmts.len(), 2);
        assert_eq!(
            stmts[0],
            "DELETE FROM \"main\".\"orders\" WHERE EXISTS (\
             SELECT 1 FROM (SELECT * FROM src) AS __src__ WHERE \
             \"main\".\"orders\".\"a\" = __src__.\"a\" AND \
             \"main\".\"orders\".\"b\" = __src__.\"b\")",
            "composite-key DELETE shape mismatch: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_delete_insert_sql_escapes_identifiers() {
        let stmts = build_delete_insert_sql(
            "sch\"ema",
            "ord\"ers",
            "SELECT 1",
            &["i\"d".to_string()],
        );
        // The DELETE should contain doubled quotes inside identifiers.
        assert!(
            stmts[0].contains("\"sch\"\"ema\".\"ord\"\"ers\""),
            "schema/name not properly escaped: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("\"i\"\"d\""),
            "key identifier not properly escaped: {}",
            stmts[0]
        );
    }

    // ---- build_merge_inner_sql --------------------------------------------------

    #[test]
    fn build_merge_inner_sql_single_key_and_default_update_cols() {
        // No whitelist/exclude: every non-key column becomes an UPDATE target.
        let all_cols = vec!["id".to_string(), "name".to_string(), "amt".to_string()];
        let stmts = build_merge_inner_sql(
            "main",
            "orders",
            "__staging_orders__",
            &["id".to_string()],
            None,
            None,
            &all_cols,
        );
        assert_eq!(stmts.len(), 2, "merge_inner must emit UPDATE + INSERT");
        assert!(
            stmts[0].starts_with("UPDATE \"main\".\"orders\" SET "),
            "UPDATE prefix wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("\"name\" = __stg__.\"name\""),
            "non-key 'name' should be in SET clause: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("\"amt\" = __stg__.\"amt\""),
            "non-key 'amt' should be in SET clause: {}",
            stmts[0]
        );
        // The SET clause is the part between "SET " and " FROM ".
        let set_part = stmts[0]
            .split_once(" SET ")
            .and_then(|(_, rest)| rest.split_once(" FROM "))
            .map(|(s, _)| s)
            .unwrap_or("");
        assert!(
            !set_part.contains("\"id\" = __stg__.\"id\""),
            "key 'id' must NOT be in SET clause (set_part = {:?}, full = {})",
            set_part,
            stmts[0]
        );
        assert!(
            stmts[1].contains(
                "INSERT INTO \"main\".\"orders\" (\"id\", \"name\", \"amt\")"
            ),
            "INSERT column list shape wrong: {}",
            stmts[1]
        );
        assert!(
            stmts[1].contains("FROM \"__staging_orders__\""),
            "INSERT must source from staging: {}",
            stmts[1]
        );
    }

    #[test]
    fn build_merge_inner_sql_composite_key_join_conditions() {
        let all_cols = vec!["a".to_string(), "b".to_string(), "v".to_string()];
        let stmts = build_merge_inner_sql(
            "main",
            "t",
            "__staging_t__",
            &["a".to_string(), "b".to_string()],
            None,
            None,
            &all_cols,
        );
        assert!(
            stmts[0].contains(
                "\"main\".\"t\".\"a\" = __stg__.\"a\" AND \"main\".\"t\".\"b\" = __stg__.\"b\""
            ),
            "composite UPDATE join clause wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[1].contains(
                "\"main\".\"t\".\"a\" = \"__staging_t__\".\"a\" AND \
                 \"main\".\"t\".\"b\" = \"__staging_t__\".\"b\""
            ),
            "composite INSERT NOT EXISTS join wrong: {}",
            stmts[1]
        );
    }

    #[test]
    fn build_merge_inner_sql_whitelist_skips_update_when_only_keys() {
        // When the whitelist contains only key columns, update_cols is empty so
        // the UPDATE statement is omitted entirely.
        let all_cols = vec!["id".to_string(), "v".to_string()];
        let stmts = build_merge_inner_sql(
            "main",
            "t",
            "__staging_t__",
            &["id".to_string()],
            Some(&vec!["id".to_string()]),
            None,
            &all_cols,
        );
        assert_eq!(stmts.len(), 1, "no update_cols => only INSERT emitted");
        assert!(
            stmts[0].starts_with("INSERT INTO "),
            "sole stmt must be INSERT: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_merge_inner_sql_exclude_columns_drops_them_from_set_clause() {
        let all_cols = vec![
            "id".to_string(),
            "name".to_string(),
            "secret".to_string(),
        ];
        let stmts = build_merge_inner_sql(
            "main",
            "t",
            "__staging_t__",
            &["id".to_string()],
            None,
            Some(&vec!["secret".to_string()]),
            &all_cols,
        );
        assert!(
            stmts[0].contains("\"name\" = __stg__.\"name\""),
            "'name' should be updated: {}",
            stmts[0]
        );
        assert!(
            !stmts[0].contains("\"secret\""),
            "'secret' should be excluded from UPDATE: {}",
            stmts[0]
        );
        // INSERT still references all columns (including 'secret').
        assert!(
            stmts[1].contains("\"secret\""),
            "INSERT must still include all columns: {}",
            stmts[1]
        );
    }

    // ---- build_merge_staging_*_sql ----------------------------------------------

    #[test]
    fn build_merge_staging_create_and_drop_emit_expected_sql() {
        let create = build_merge_staging_create_sql("__staging_t__", "SELECT 1");
        assert_eq!(
            create,
            vec!["CREATE TEMPORARY TABLE \"__staging_t__\" AS SELECT 1".to_string()]
        );
        let drop = build_merge_staging_drop_sql("__staging_t__");
        assert_eq!(
            drop,
            vec!["DROP TABLE IF EXISTS \"__staging_t__\"".to_string()]
        );
    }

    #[test]
    fn build_merge_staging_columns_query_escapes_staging_name() {
        let q = build_merge_staging_columns_query_sql("weird'name");
        // escape_sql_str doubles single quotes inside string literals.
        assert!(
            q.contains("table_name = 'weird''name'"),
            "staging name not escaped: {q}"
        );
    }

    // ---- build_microbatch_* -----------------------------------------------------

    #[test]
    fn build_microbatch_batch_end_query_uses_trunc_unit() {
        let q = build_microbatch_batch_end_query_sql(BatchSize::Day);
        assert_eq!(q, "SELECT date_trunc('day', CURRENT_TIMESTAMP)::VARCHAR");
        let q_h = build_microbatch_batch_end_query_sql(BatchSize::Hour);
        assert!(q_h.contains("'hour'"), "hour trunc unit missing: {q_h}");
    }

    #[test]
    fn build_microbatch_batch_start_query_uses_lookback_and_interval() {
        let q = build_microbatch_batch_start_query_sql("2024-01-01", 2, BatchSize::Day);
        assert_eq!(
            q,
            "SELECT ('2024-01-01'::TIMESTAMP - 2 * INTERVAL '1 DAY')::VARCHAR"
        );
    }

    #[test]
    fn build_microbatch_min_query_quotes_identifiers() {
        let q = build_microbatch_min_query_sql("main", "orders", "ts");
        assert_eq!(
            q,
            "SELECT MIN(\"ts\")::VARCHAR FROM \"main\".\"orders\""
        );
    }

    #[test]
    fn build_microbatch_empty_insert_emits_plain_insert() {
        let stmts = build_microbatch_empty_insert_sql("main", "t", "SELECT 1");
        assert_eq!(stmts, vec!["INSERT INTO \"main\".\"t\" SELECT 1".to_string()]);
    }

    #[test]
    fn build_microbatch_apply_sql_emits_delete_then_insert_with_bounds() {
        let stmts = build_microbatch_apply_sql(
            "main",
            "t",
            "SELECT * FROM src",
            "ts",
            "2024-01-01 00:00:00",
            "2024-01-02 00:00:00",
        );
        assert_eq!(stmts.len(), 2, "apply must emit DELETE then INSERT");
        assert!(
            stmts[0].starts_with("DELETE FROM \"main\".\"t\""),
            "DELETE prefix wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("\"ts\" >= '2024-01-01 00:00:00'::TIMESTAMP"),
            "DELETE lower bound missing: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("\"ts\" < '2024-01-02 00:00:00'::TIMESTAMP"),
            "DELETE upper bound missing: {}",
            stmts[0]
        );
        assert!(
            stmts[1].contains("SELECT * FROM (SELECT * FROM src) AS __batch__"),
            "INSERT subquery shape wrong: {}",
            stmts[1]
        );
    }

    // ---- build_snapshot_* -------------------------------------------------------

    #[test]
    fn build_snapshot_hash_expr_timestamp_strategy_uses_updated_at_column() {
        let h = build_snapshot_hash_expr(SnapshotStrategy::Timestamp, Some("updated_at"), None);
        assert_eq!(h, "hash(\"updated_at\"::VARCHAR)");
    }

    #[test]
    fn build_snapshot_hash_expr_check_strategy_concatenates_columns() {
        let cols = vec!["a".to_string(), "b".to_string()];
        let h = build_snapshot_hash_expr(SnapshotStrategy::Check, None, Some(&cols));
        assert_eq!(
            h,
            "hash(\"a\"::VARCHAR || '|' || \"b\"::VARCHAR)",
            "check-strategy hash expression wrong: {h}"
        );
    }

    #[test]
    fn build_snapshot_staging_create_includes_hash_expr() {
        let stmts =
            build_snapshot_staging_create_sql("__snap__", "SELECT 1", "hash(\"x\"::VARCHAR)");
        assert_eq!(
            stmts,
            vec![
                "CREATE TEMPORARY TABLE \"__snap__\" AS \
                 SELECT *, hash(\"x\"::VARCHAR) AS _stg_hash FROM (SELECT 1)"
                    .to_string()
            ]
        );
    }

    #[test]
    fn build_snapshot_new_sql_creates_target_with_snapshot_columns() {
        let stmts = build_snapshot_new_sql("main", "snap", "__snap_staging_snap__");
        assert_eq!(stmts.len(), 1);
        assert!(
            stmts[0].starts_with("CREATE TABLE \"main\".\"snap\" AS "),
            "CREATE TABLE prefix wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("CURRENT_TIMESTAMP AS _snapshot_valid_from"),
            "missing valid_from: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("NULL::TIMESTAMP AS _snapshot_valid_to"),
            "missing valid_to: {}",
            stmts[0]
        );
        assert!(
            stmts[0].contains("_stg_hash AS _snapshot_hash"),
            "missing hash column: {}",
            stmts[0]
        );
    }

    #[test]
    fn build_snapshot_update_sql_emits_update_then_insert_with_key_matches() {
        let stmts = build_snapshot_update_sql(
            "main",
            "snap",
            "__snap_staging_snap__",
            &["id".to_string()],
        );
        assert_eq!(stmts.len(), 2, "snapshot update branch must emit UPDATE + INSERT");
        assert!(
            stmts[0].starts_with("UPDATE \"main\".\"snap\" SET _snapshot_valid_to = "),
            "UPDATE prefix wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[0]
                .contains("\"main\".\"snap\".\"id\" = \"__snap_staging_snap__\".\"id\""),
            "UPDATE key match missing: {}",
            stmts[0]
        );
        assert!(
            stmts[1].starts_with("INSERT INTO \"main\".\"snap\""),
            "INSERT prefix wrong: {}",
            stmts[1]
        );
        assert!(
            stmts[1].contains("\"__snap_staging_snap__\".\"id\" = __tgt__.\"id\""),
            "INSERT NOT EXISTS key match missing: {}",
            stmts[1]
        );
    }

    #[test]
    fn build_snapshot_update_sql_supports_composite_unique_keys() {
        let stmts = build_snapshot_update_sql(
            "main",
            "snap",
            "__snap_staging_snap__",
            &["a".to_string(), "b".to_string()],
        );
        assert!(
            stmts[0].contains(
                "\"main\".\"snap\".\"a\" = \"__snap_staging_snap__\".\"a\" AND \
                 \"main\".\"snap\".\"b\" = \"__snap_staging_snap__\".\"b\""
            ),
            "composite UPDATE key match wrong: {}",
            stmts[0]
        );
        assert!(
            stmts[1].contains(
                "\"__snap_staging_snap__\".\"a\" = __tgt__.\"a\" AND \
                 \"__snap_staging_snap__\".\"b\" = __tgt__.\"b\""
            ),
            "composite INSERT key match wrong: {}",
            stmts[1]
        );
    }

    #[test]
    fn inline_ephemeral_models_extends_existing_with_clause() {
        let mut eph: HashMap<String, String> = HashMap::new();
        eph.insert("eph_a".to_string(), "SELECT 1 AS x".to_string());
        let known: HashSet<String> = ["eph_a".to_string()].into_iter().collect();
        // The outer query already has its own CTE — the function must merge rather
        // than nest WITHs.
        let sql = "WITH user_cte AS (SELECT 2) SELECT * FROM eph_a JOIN user_cte ON 1=1";
        let out = inline_ephemeral_models(sql, &eph, "main", &known, None, None);
        let with_count = out.matches("WITH").count();
        assert_eq!(with_count, 1, "expected a single merged WITH, got {with_count}: {out}");
        assert!(out.contains("eph_a AS ("), "ephemeral CTE missing: {out}");
        assert!(out.contains("user_cte AS"), "original CTE must survive: {out}");
    }
}
