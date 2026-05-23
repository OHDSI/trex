use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::bundle_processor;
use crate::handlers::upsert;
use crate::query_executor::{QueryResult, RequestConn};
use crate::schema::sql_builder;
use crate::sql_safety::validate_dataset_id;
use crate::state::AppState;

const MAX_BUNDLE_ENTRIES: usize = 10_000;

/// Build the response entry for a POST in a transaction/batch bundle.
pub fn build_post_response_entry(dataset_id: &str, resource_type: &str, server_id: &str) -> Value {
    json!({
        "response": {
            "status": "201 Created",
            "location": format!("/{}/{}/{}", dataset_id, resource_type, server_id),
            "etag": "W/\"1\""
        }
    })
}

/// Build the response entry for a PUT in a transaction/batch bundle.
pub fn build_put_response_entry(
    dataset_id: &str,
    resource_type: &str,
    server_id: &str,
    version: i64,
    is_new: bool,
) -> Value {
    let status = if is_new { "201 Created" } else { "200 OK" };
    json!({
        "response": {
            "status": status,
            "location": format!("/{}/{}/{}", dataset_id, resource_type, server_id),
            "etag": format!("W/\"{}\"", version)
        }
    })
}

/// Build the response entry for a DELETE in a transaction/batch bundle.
pub fn build_delete_response_entry() -> Value {
    json!({
        "response": {
            "status": "204 No Content"
        }
    })
}

/// Build an OperationOutcome wrapper for a single failing entry in a batch bundle.
pub fn build_batch_error_entry(error_message: &str) -> Value {
    json!({
        "response": {
            "status": "400 Bad Request",
            "outcome": {
                "resourceType": "OperationOutcome",
                "issue": [{
                    "severity": "error",
                    "code": "processing",
                    "diagnostics": error_message
                }]
            }
        }
    })
}

/// Build the outer Bundle response wrapper given the per-entry list and the type
/// ("transaction-response" or "batch-response").
pub fn build_bundle_response(entries: Vec<Value>, bundle_type: &str) -> Value {
    json!({
        "resourceType": "Bundle",
        "type": bundle_type,
        "entry": entries
    })
}

/// Build the SELECT used by the bundle DELETE branch to fetch current version + raw.
pub fn build_delete_check_sql(schema_name: &str, resource_type: &str) -> String {
    format!(
        "SELECT _version_id::VARCHAR, _raw FROM {schema}.\"{table}\" WHERE _id = $1 AND NOT _is_deleted",
        schema = schema_name,
        table = resource_type.to_lowercase(),
    )
}

/// Build the soft-delete UPDATE used by the bundle DELETE branch.
pub fn build_bundle_delete_sql(schema_name: &str, resource_type: &str, new_version: i64) -> String {
    format!(
        "UPDATE {schema}.\"{table}\" SET _is_deleted = true, \
         _version_id = {version}, _last_updated = CURRENT_TIMESTAMP \
         WHERE _id = $1",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        version = new_version,
    )
}

/// Stamp `id` and meta (versionId=1, lastUpdated) on a POST'd resource.
pub fn stamp_post_resource_meta(resource: &mut Value, server_id: &str, now: &str) {
    if let Some(obj) = resource.as_object_mut() {
        obj.insert("id".to_string(), Value::String(server_id.to_string()));
        obj.insert(
            "meta".to_string(),
            json!({
                "versionId": "1",
                "lastUpdated": now
            }),
        );
    }
}

fn classify_bundle(body: &Value) -> Result<&str, AppError> {
    let rt = body.get("resourceType").and_then(|v| v.as_str()).unwrap_or("");
    if rt != "Bundle" {
        return Err(AppError::BadRequest(
            "Expected a FHIR Bundle resource".to_string(),
        ));
    }
    let bundle_type = body.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match bundle_type {
        "transaction" | "batch" => Ok(bundle_type),
        _ => Err(AppError::BadRequest(format!(
            "Unsupported Bundle type: '{}'. Must be 'transaction' or 'batch'",
            bundle_type
        ))),
    }
}

pub async fn process_bundle(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let bundle_type = classify_bundle(&body)?;

    match bundle_type {
        "transaction" => process_transaction(state, &dataset_id, &body).await,
        "batch" => process_batch(state, &dataset_id, &body).await,
        _ => unreachable!("classify_bundle only returns transaction/batch"),
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
            Json(build_bundle_response(vec![], "transaction-response")),
        ));
    }

    let schema_name = state.qualified_schema(dataset_id);

    // All transaction queries share one connection so BEGIN/COMMIT/ROLLBACK
    // and intermediate writes see consistent state.
    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    if let QueryResult::Error(e) = conn.execute("BEGIN TRANSACTION".to_string()).await {
        eprintln!("[fhir] Failed to begin transaction: {}", e);
        return Err(AppError::Internal(
            "Failed to begin transaction".to_string(),
        ));
    }

    let mut response_entries = Vec::new();

    for entry in &entries {
        match process_single_entry(&state, &schema_name, dataset_id, entry, Some(&conn)).await {
            Ok(resp_entry) => {
                response_entries.push(resp_entry);
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK".to_string()).await;
                return Err(AppError::BadRequest(format!(
                    "Transaction failed on {}/{}: {}",
                    entry.resource_type, entry.server_id, e
                )));
            }
        }
    }

    if let QueryResult::Error(e) = conn.execute("COMMIT".to_string()).await {
        eprintln!("[fhir] Failed to commit transaction: {}", e);
        return Err(AppError::Internal(
            "Failed to commit transaction".to_string(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(build_bundle_response(response_entries, "transaction-response")),
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
            Json(build_bundle_response(vec![], "batch-response")),
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
                response_entries.push(build_batch_error_entry(&e.to_string()));
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(build_bundle_response(response_entries, "batch-response")),
    ))
}

async fn process_single_entry(
    state: &AppState,
    schema_name: &str,
    dataset_id: &str,
    entry: &bundle_processor::ProcessedEntry,
    outer_conn: Option<&RequestConn>,
) -> Result<Value, String> {
    let table_name = entry.resource_type.to_lowercase();

    match entry.method.as_str() {
        "POST" => {
            let now = chrono::Utc::now()
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string();
            let mut resource = entry.resource.clone();
            stamp_post_resource_meta(&mut resource, &entry.server_id, &now);
            let raw_json = serde_json::to_string(&resource)
                .map_err(|e| format!("JSON serialize: {}", e))?;

            let transform_spec = state.registry.get_json_transform(&entry.resource_type)
                .map_err(|e| format!("Transform spec: {}", e))?;
            let column_names = state.registry.get_column_names(&entry.resource_type)
                .map_err(|e| format!("Column names: {}", e))?;
            let insert_sql = sql_builder::build_insert_sql(
                schema_name, &table_name, 1, &transform_spec, &column_names,
            );

            let result = match outer_conn {
                Some(conn) => conn.execute_params(insert_sql, vec![entry.server_id.clone(), raw_json]).await,
                None => {
                    let conn = state.new_request_conn().map_err(|e| format!("conn: {e}"))?;
                    conn.execute_params(insert_sql, vec![entry.server_id.clone(), raw_json]).await
                }
            };

            match result {
                QueryResult::Error(e) => Err(format!("Insert failed: {}", e)),
                _ => Ok(build_post_response_entry(dataset_id, &entry.resource_type, &entry.server_id)),
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
                outer_conn,
            )
            .await?;

            Ok(build_put_response_entry(
                dataset_id,
                &entry.resource_type,
                &entry.server_id,
                result.version,
                result.is_new,
            ))
        }
        "DELETE" => {
            if entry.server_id.is_empty() {
                return Err("DELETE entry missing resource id".to_string());
            }

            let check_sql = build_delete_check_sql(schema_name, &entry.resource_type);

            // Reuse the outer transaction conn when present so all delete-related
            // statements run on the same connection; otherwise use a fresh per-op conn.
            let owned_conn;
            let conn_ref: &RequestConn = match outer_conn {
                Some(c) => c,
                None => {
                    owned_conn = state.new_request_conn().map_err(|e| format!("conn: {e}"))?;
                    &owned_conn
                }
            };

            let check_result = conn_ref
                .execute_params(check_sql, vec![entry.server_id.clone()])
                .await;

            let (current_version, current_raw) = match check_result {
                QueryResult::Select { rows, .. } => {
                    if rows.is_empty() {
                        return Err(format!("Resource {}/{} not found", entry.resource_type, entry.server_id));
                    }
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
                    (v, raw)
                }
                QueryResult::Error(e) => return Err(format!("Delete check failed: {}", e)),
                _ => return Err(format!("Resource {}/{} not found", entry.resource_type, entry.server_id)),
            };

            let new_version = current_version + 1;

            let history_sql = crate::handlers::crud::build_history_insert_sql(schema_name, current_version);
            let history_params = vec![entry.server_id.clone(), entry.resource_type.clone(), current_raw];
            if let QueryResult::Error(e) = conn_ref.execute_params(history_sql, history_params).await {
                eprintln!("[fhir] WARNING: history write failed for {}/{}: {}", entry.resource_type, entry.server_id, e);
            }

            let delete_sql = build_bundle_delete_sql(schema_name, &entry.resource_type, new_version);

            let result = conn_ref
                .execute_params(delete_sql, vec![entry.server_id.clone()])
                .await;

            match result {
                QueryResult::Error(e) => Err(format!("Delete failed: {}", e)),
                _ => Ok(build_delete_response_entry()),
            }
        }
        _ => Err(format!("Unsupported method: {}", entry.method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classify_rejects_non_bundle() {
        let v = json!({"resourceType": "Patient"});
        let res = classify_bundle(&v);
        assert!(matches!(res, Err(AppError::BadRequest(_))));
    }

    #[test]
    fn classify_rejects_unknown_bundle_type() {
        let v = json!({"resourceType": "Bundle", "type": "searchset"});
        let res = classify_bundle(&v);
        assert!(matches!(res, Err(AppError::BadRequest(_))));
    }

    #[test]
    fn classify_accepts_transaction() {
        let v = json!({"resourceType": "Bundle", "type": "transaction"});
        assert_eq!(classify_bundle(&v).unwrap(), "transaction");
    }

    #[test]
    fn classify_accepts_batch() {
        let v = json!({"resourceType": "Bundle", "type": "batch"});
        assert_eq!(classify_bundle(&v).unwrap(), "batch");
    }

    #[test]
    fn post_response_entry_shape() {
        let e = build_post_response_entry("ds", "Patient", "abc");
        assert_eq!(e["response"]["status"], "201 Created");
        assert_eq!(e["response"]["location"], "/ds/Patient/abc");
        assert_eq!(e["response"]["etag"], "W/\"1\"");
    }

    #[test]
    fn put_response_entry_new_is_201() {
        let e = build_put_response_entry("ds", "Patient", "abc", 1, true);
        assert_eq!(e["response"]["status"], "201 Created");
        assert_eq!(e["response"]["etag"], "W/\"1\"");
    }

    #[test]
    fn put_response_entry_existing_is_200() {
        let e = build_put_response_entry("ds", "Patient", "abc", 3, false);
        assert_eq!(e["response"]["status"], "200 OK");
        assert_eq!(e["response"]["etag"], "W/\"3\"");
        assert_eq!(e["response"]["location"], "/ds/Patient/abc");
    }

    #[test]
    fn delete_response_entry_is_204() {
        let e = build_delete_response_entry();
        assert_eq!(e["response"]["status"], "204 No Content");
    }

    #[test]
    fn batch_error_entry_wraps_operation_outcome() {
        let e = build_batch_error_entry("boom");
        assert_eq!(e["response"]["status"], "400 Bad Request");
        assert_eq!(e["response"]["outcome"]["resourceType"], "OperationOutcome");
        assert_eq!(e["response"]["outcome"]["issue"][0]["severity"], "error");
        assert_eq!(e["response"]["outcome"]["issue"][0]["code"], "processing");
        assert_eq!(e["response"]["outcome"]["issue"][0]["diagnostics"], "boom");
    }

    #[test]
    fn bundle_response_wraps_entries_with_type() {
        let entries = vec![json!({"a": 1}), json!({"b": 2})];
        let bundle = build_bundle_response(entries, "batch-response");
        assert_eq!(bundle["resourceType"], "Bundle");
        assert_eq!(bundle["type"], "batch-response");
        assert_eq!(bundle["entry"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn bundle_response_empty_entries() {
        let bundle = build_bundle_response(vec![], "transaction-response");
        assert!(bundle["entry"].as_array().unwrap().is_empty());
    }

    #[test]
    fn delete_check_sql_lowercases_table() {
        let sql = build_delete_check_sql("\"db\".\"ds\"", "MedicationRequest");
        assert!(sql.contains("\"medicationrequest\""));
        assert!(sql.contains("WHERE _id = $1"));
        assert!(sql.contains("NOT _is_deleted"));
    }

    #[test]
    fn bundle_delete_sql_sets_flags_and_version() {
        let sql = build_bundle_delete_sql("\"db\".\"ds\"", "Patient", 9);
        assert!(sql.contains("\"patient\""));
        assert!(sql.contains("_is_deleted = true"));
        assert!(sql.contains("_version_id = 9"));
        assert!(sql.contains("WHERE _id = $1"));
    }

    #[test]
    fn stamp_post_resource_meta_sets_id_and_version_one() {
        let mut r = json!({"resourceType": "Patient"});
        stamp_post_resource_meta(&mut r, "p1", "2026-05-23T10:00:00Z");
        assert_eq!(r["id"], "p1");
        assert_eq!(r["meta"]["versionId"], "1");
        assert_eq!(r["meta"]["lastUpdated"], "2026-05-23T10:00:00Z");
    }

    #[test]
    fn stamp_post_resource_meta_noop_on_non_object() {
        let mut r = json!("not-object");
        stamp_post_resource_meta(&mut r, "p1", "now");
        assert_eq!(r, json!("not-object"));
    }
}
