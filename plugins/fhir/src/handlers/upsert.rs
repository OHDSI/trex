use serde_json::{json, Value};

use crate::query_executor::QueryResult;
use crate::schema::sql_builder;
use crate::state::AppState;

pub struct UpsertResult {
    pub version: i64,
    pub is_new: bool,
}

/// Shared upsert logic: reads current version, writes history, stamps meta, upserts.
/// Mirrors the pattern in crud.rs::update_resource.
///
/// When `worker_id` is `Some`, all queries are pinned to that worker (required
/// for transaction bundles so every statement runs on the same connection).
pub async fn upsert_resource(
    state: &AppState,
    schema: &str,
    resource_type: &str,
    id: &str,
    resource: &mut Value,
    transform_spec: &str,
    column_names: &[String],
    worker_id: Option<usize>,
) -> Result<UpsertResult, String> {
    let table_name = resource_type.to_lowercase();

    // 1. Read current version
    let check_sql = format!(
        "SELECT _version_id::VARCHAR, _raw FROM {schema}.\"{table}\" WHERE _id = $1",
        schema = schema,
        table = table_name,
    );

    let check_result = if let Some(wid) = worker_id {
        state.executor.submit_params_on(wid, check_sql, vec![id.to_string()]).await
    } else {
        state.executor.submit_params(check_sql, vec![id.to_string()]).await
    };

    let (current_version, is_new, current_raw) = match check_result {
        QueryResult::Select { rows, .. } => {
            if rows.is_empty() {
                (0i64, true, String::new())
            } else {
                let v = rows[0]
                    .get(0)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(1);
                let raw = rows[0]
                    .get(1)
                    .and_then(|v| v.as_str())
                    .unwrap_or("{}")
                    .to_string();
                (v, false, raw)
            }
        }
        QueryResult::Error(e) => {
            return Err(format!("Failed to check resource: {}", e));
        }
        _ => (0, true, String::new()),
    };

    // 2. Compute new version and stamp meta
    let new_version = current_version + 1;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    if let Some(obj) = resource.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.to_string()));
        obj.insert(
            "meta".to_string(),
            json!({
                "versionId": new_version.to_string(),
                "lastUpdated": now
            }),
        );
    }

    let raw_json = serde_json::to_string(&resource)
        .map_err(|e| format!("JSON serialize: {}", e))?;

    // 3. Write history (only if updating existing resource)
    if !is_new {
        let history_sql = format!(
            "INSERT INTO {schema}._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) \
             VALUES ($1, $2, {version}, CURRENT_TIMESTAMP, $3, false)",
            schema = schema,
            version = current_version,
        );
        let params = vec![id.to_string(), resource_type.to_string(), current_raw];
        if let Some(wid) = worker_id {
            let _ = state.executor.submit_params_on(wid, history_sql, params).await;
        } else {
            let _ = state.executor.submit_params(history_sql, params).await;
        }
    }

    // 4. Upsert main table
    let upsert_sql = sql_builder::build_upsert_sql(
        schema,
        &table_name,
        new_version,
        transform_spec,
        column_names,
    );

    let params = vec![id.to_string(), raw_json];
    let result = if let Some(wid) = worker_id {
        state.executor.submit_params_on(wid, upsert_sql, params).await
    } else {
        state.executor.submit_params(upsert_sql, params).await
    };

    match result {
        QueryResult::Error(e) => Err(format!("Upsert failed: {}", e)),
        _ => Ok(UpsertResult {
            version: new_version,
            is_new,
        }),
    }
}
