use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::bundle_processor;
use crate::handlers::upsert;
use crate::query_executor::QueryResult;
use crate::schema::sql_builder;
use crate::sql_safety::validate_dataset_id;
use crate::state::AppState;

const MAX_BUNDLE_ENTRIES: usize = 10_000;

pub async fn process_bundle(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let rt = body
        .get("resourceType")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if rt != "Bundle" {
        return Err(AppError::BadRequest(
            "Expected a FHIR Bundle resource".to_string(),
        ));
    }

    let bundle_type = body
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match bundle_type {
        "transaction" => process_transaction(state, &dataset_id, &body).await,
        "batch" => process_batch(state, &dataset_id, &body).await,
        _ => Err(AppError::BadRequest(format!(
            "Unsupported Bundle type: '{}'. Must be 'transaction' or 'batch'",
            bundle_type
        ))),
    }
}

async fn process_transaction(
    state: Arc<AppState>,
    dataset_id: &str,
    bundle: &Value,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let entries = bundle_processor::process_bundle_entries(bundle, MAX_BUNDLE_ENTRIES)
        .map_err(|e| AppError::BadRequest(e))?;

    if entries.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(json!({
                "resourceType": "Bundle",
                "type": "transaction-response",
                "entry": []
            })),
        ));
    }

    let schema_name = state.qualified_schema(dataset_id);

    // Pin all transaction queries to a single worker so BEGIN/COMMIT/ROLLBACK
    // all run on the same DuckDB connection.
    let worker_id = state.executor.next_worker_id();

    if let QueryResult::Error(e) = state.executor.submit_on(worker_id, "BEGIN TRANSACTION".to_string()).await {
        eprintln!("[fhir] Failed to begin transaction: {}", e);
        return Err(AppError::Internal(
            "Failed to begin transaction".to_string(),
        ));
    }

    let mut response_entries = Vec::new();

    for entry in &entries {
        match process_single_entry(&state, &schema_name, dataset_id, entry, Some(worker_id)).await {
            Ok(resp_entry) => {
                response_entries.push(resp_entry);
            }
            Err(e) => {
                let _ = state.executor.submit_on(worker_id, "ROLLBACK".to_string()).await;
                return Err(AppError::BadRequest(format!(
                    "Transaction failed on {}/{}: {}",
                    entry.resource_type, entry.server_id, e
                )));
            }
        }
    }

    if let QueryResult::Error(e) = state.executor.submit_on(worker_id, "COMMIT".to_string()).await {
        eprintln!("[fhir] Failed to commit transaction: {}", e);
        return Err(AppError::Internal(
            "Failed to commit transaction".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "resourceType": "Bundle",
            "type": "transaction-response",
            "entry": response_entries
        })),
    ))
}

async fn process_batch(
    state: Arc<AppState>,
    dataset_id: &str,
    bundle: &Value,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let entries = bundle_processor::process_bundle_entries(bundle, MAX_BUNDLE_ENTRIES)
        .map_err(|e| AppError::BadRequest(e))?;

    if entries.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(json!({
                "resourceType": "Bundle",
                "type": "batch-response",
                "entry": []
            })),
        ));
    }

    let schema_name = state.qualified_schema(dataset_id);
    let mut response_entries = Vec::new();

    for entry in &entries {
        match process_single_entry(&state, &schema_name, dataset_id, entry, None).await {
            Ok(resp_entry) => {
                response_entries.push(resp_entry);
            }
            Err(e) => {
                response_entries.push(json!({
                    "response": {
                        "status": "400 Bad Request",
                        "outcome": {
                            "resourceType": "OperationOutcome",
                            "issue": [{
                                "severity": "error",
                                "code": "processing",
                                "diagnostics": e.to_string()
                            }]
                        }
                    }
                }));
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "resourceType": "Bundle",
            "type": "batch-response",
            "entry": response_entries
        })),
    ))
}

async fn process_single_entry(
    state: &AppState,
    schema_name: &str,
    dataset_id: &str,
    entry: &bundle_processor::ProcessedEntry,
    worker_id: Option<usize>,
) -> Result<Value, String> {
    let table_name = entry.resource_type.to_lowercase();

    match entry.method.as_str() {
        "POST" => {
            let now = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string();
            let mut resource = entry.resource.clone();
            if let Some(obj) = resource.as_object_mut() {
                obj.insert("id".to_string(), Value::String(entry.server_id.clone()));
                obj.insert(
                    "meta".to_string(),
                    json!({
                        "versionId": "1",
                        "lastUpdated": now
                    }),
                );
            }
            let raw_json = serde_json::to_string(&resource)
                .map_err(|e| format!("JSON serialize: {}", e))?;

            let transform_spec = state.registry.get_json_transform(&entry.resource_type)
                .map_err(|e| format!("Transform spec: {}", e))?;
            let column_names = state.registry.get_column_names(&entry.resource_type)
                .map_err(|e| format!("Column names: {}", e))?;
            let insert_sql = sql_builder::build_insert_sql(
                schema_name, &table_name, 1, &transform_spec, &column_names,
            );

            let result = if let Some(wid) = worker_id {
                state.executor.submit_params_on(wid, insert_sql, vec![entry.server_id.clone(), raw_json]).await
            } else {
                state.executor.submit_params(insert_sql, vec![entry.server_id.clone(), raw_json]).await
            };

            match result {
                QueryResult::Error(e) => Err(format!("Insert failed: {}", e)),
                _ => Ok(json!({
                    "response": {
                        "status": "201 Created",
                        "location": format!("/{}/{}/{}", dataset_id, entry.resource_type, entry.server_id),
                        "etag": "W/\"1\""
                    }
                })),
            }
        }
        "PUT" => {
            let transform_spec = state.registry.get_json_transform(&entry.resource_type)
                .map_err(|e| format!("Transform spec: {}", e))?;
            let column_names = state.registry.get_column_names(&entry.resource_type)
                .map_err(|e| format!("Column names: {}", e))?;
            let mut resource = entry.resource.clone();

            let result = upsert::upsert_resource(
                state,
                schema_name,
                &entry.resource_type,
                &entry.server_id,
                &mut resource,
                &transform_spec,
                &column_names,
                worker_id,
            )
            .await?;

            let status = if result.is_new { "201 Created" } else { "200 OK" };
            Ok(json!({
                "response": {
                    "status": status,
                    "location": format!("/{}/{}/{}", dataset_id, entry.resource_type, entry.server_id),
                    "etag": format!("W/\"{}\"", result.version)
                }
            }))
        }
        "DELETE" => {
            if entry.server_id.is_empty() {
                return Err("DELETE entry missing resource id".to_string());
            }

            let delete_sql = format!(
                "UPDATE {schema}.\"{table}\" SET _is_deleted = true, \
                 _version_id = _version_id + 1, _last_updated = CURRENT_TIMESTAMP \
                 WHERE _id = $1",
                schema = schema_name,
                table = table_name,
            );

            let result = if let Some(wid) = worker_id {
                state.executor.submit_params_on(wid, delete_sql, vec![entry.server_id.clone()]).await
            } else {
                state.executor.submit_params(delete_sql, vec![entry.server_id.clone()]).await
            };

            match result {
                QueryResult::Error(e) => Err(format!("Delete failed: {}", e)),
                _ => Ok(json!({
                    "response": {
                        "status": "204 No Content"
                    }
                })),
            }
        }
        _ => Err(format!("Unsupported method: {}", entry.method)),
    }
}
