use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::Value;
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::validation;
use crate::query_executor::QueryResult;
use crate::schema::sql_builder;
use crate::sql_safety::{validate_dataset_id, validate_fhir_id, validate_resource_type};
use crate::state::AppState;

/// Stamp `id` and `meta` (`versionId`, `lastUpdated`) onto a FHIR resource JSON object.
/// No-op if `resource` is not a JSON object.
pub fn stamp_resource_meta(resource: &mut Value, id: &str, version: i64, now: &str) {
    if let Some(obj) = resource.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.to_string()));
        obj.insert(
            "meta".to_string(),
            serde_json::json!({
                "versionId": version.to_string(),
                "lastUpdated": now
            }),
        );
    }
}

/// Extract a numeric version from an If-Match etag like `W/"3"` or `"3"`. Returns
/// `None` if the string doesn't parse to a non-negative integer.
pub fn parse_if_match_etag(etag: &str) -> Option<i64> {
    etag.trim_matches('"')
        .trim_start_matches("W/\"")
        .trim_end_matches('"')
        .parse::<i64>()
        .ok()
}

/// Classify a DuckDB error string as "table missing" → `NotFound` or "other" → `Internal`.
pub fn map_table_or_internal_error(
    msg: &str,
    resource_type: &str,
    dataset_id: &str,
    internal_label: &str,
) -> AppError {
    if msg.contains("does not exist") || msg.contains("Table") {
        AppError::NotFound(format!(
            "Resource type '{}' not found in dataset '{}'",
            resource_type, dataset_id
        ))
    } else {
        AppError::Internal(internal_label.to_string())
    }
}

/// Build the SELECT used by read_resource to fetch the current version + tombstone.
pub fn build_read_sql(schema_name: &str, resource_type: &str, resource_id: &str) -> String {
    format!(
        "SELECT _raw, _is_deleted::VARCHAR, _version_id::VARCHAR FROM {schema}.\"{table}\" WHERE _id = '{id}'",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = resource_id.replace('\'', "''")
    )
}

/// Build the SELECT used by update to check whether a resource exists + current version.
pub fn build_check_version_sql(schema_name: &str, resource_type: &str, resource_id: &str) -> String {
    format!(
        "SELECT _version_id::VARCHAR, _raw FROM {schema}.\"{table}\" WHERE _id = '{id}'",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = resource_id.replace('\'', "''")
    )
}

/// Build the parameterized INSERT into `_history` for the version we are about to supersede.
pub fn build_history_insert_sql(schema_name: &str, current_version: i64) -> String {
    format!(
        "INSERT INTO {schema}._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) \
         VALUES ($1, $2, {version}, CURRENT_TIMESTAMP, $3, false)",
        schema = schema_name,
        version = current_version,
    )
}

/// Build the soft-delete UPDATE statement used by delete_resource.
pub fn build_soft_delete_sql(schema_name: &str, resource_type: &str, new_version: i64) -> String {
    format!(
        "UPDATE {schema}.\"{table}\" SET _is_deleted = true, _version_id = {version}, \
         _last_updated = CURRENT_TIMESTAMP WHERE _id = $1",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        version = new_version,
    )
}

/// Parse a check-version row into (version, raw_json).
/// Returns defaults if the row is malformed.
pub fn parse_check_row(row: &[Value]) -> (i64, String) {
    let v = row
        .get(0)
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(1);
    let raw = row
        .get(1)
        .and_then(|v| v.as_str())
        .unwrap_or("{}")
        .to_string();
    (v, raw)
}

pub async fn create_resource(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;

    let validation_result = validation::validate_resource(&body, &resource_type, &state.registry);
    if !validation_result.is_valid() {
        return Err(AppError::BadRequest(
            serde_json::to_string(&validation_result.to_operation_outcome())
                .unwrap_or_else(|_| "Validation failed".to_string()),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let schema_name = state.qualified_schema(&dataset_id);
    let table_name = resource_type.to_lowercase();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let mut resource = body.clone();
    stamp_resource_meta(&mut resource, &id, 1, &now);

    let raw_json = serde_json::to_string(&resource)
        .map_err(|e| AppError::Internal(format!("JSON serialize: {}", e)))?;

    let transform_spec = state.registry.get_json_transform(&resource_type)
        .map_err(|e| AppError::Internal(format!("Transform spec: {}", e)))?;
    let column_names = state.registry.get_column_names(&resource_type)
        .map_err(|e| AppError::Internal(format!("Column names: {}", e)))?;
    let insert_sql = sql_builder::build_insert_sql(&schema_name, &table_name, 1, &transform_spec, &column_names);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    if let QueryResult::Error(e) = conn.execute_params(insert_sql, vec![id.clone(), raw_json]).await {
        eprintln!("[fhir] INSERT error for {}.{}: {}", dataset_id, resource_type, e);
        if e.contains("does not exist") || e.contains("Table") {
            return Err(AppError::NotFound(format!(
                "Resource type '{}' not found in dataset '{}'",
                resource_type, dataset_id
            )));
        }
        return Err(AppError::Internal(
            "Failed to create resource".to_string(),
        ));
    }

    let location = format!("/{}/{}/{}", dataset_id, resource_type, id);
    let mut headers = HeaderMap::new();
    if let Ok(v) = location.parse() {
        headers.insert("Location", v);
    }
    if let Ok(v) = "W/\"1\"".parse() {
        headers.insert("ETag", v);
    }
    if let Ok(v) = "application/fhir+json".parse() {
        headers.insert("Content-Type", v);
    }

    Ok((StatusCode::CREATED, headers, Json(resource)))
}

pub async fn read_resource(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id)): Path<(String, String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;

    let schema_name = state.qualified_schema(&dataset_id);

    let sql = build_read_sql(&schema_name, &resource_type, &resource_id);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => {
            if rows.is_empty() {
                return Err(AppError::NotFound(format!(
                    "{}/{} not found",
                    resource_type, resource_id
                )));
            }

            let row = &rows[0];
            let is_deleted = row
                .get(1)
                .and_then(|v| v.as_str())
                .map(|s| s == "true")
                .unwrap_or(false);

            if is_deleted {
                return Err(AppError::Gone(format!(
                    "{}/{} has been deleted",
                    resource_type, resource_id
                )));
            }

            let raw_json = row.get(0).and_then(|v| v.as_str()).unwrap_or("{}");

            let resource: Value = serde_json::from_str(raw_json)
                .map_err(|e| AppError::Internal(format!("JSON parse: {}", e)))?;

            let version_id = row.get(2).and_then(|v| v.as_str()).unwrap_or("1");

            let mut headers = HeaderMap::new();
            if let Ok(v) = format!("W/\"{}\"", version_id).parse() {
                headers.insert("ETag", v);
            }
            if let Ok(v) = "application/fhir+json".parse() {
                headers.insert("Content-Type", v);
            }

            Ok((headers, Json(resource)))
        }
        QueryResult::Error(e) => {
            if e.contains("does not exist") || e.contains("not found") || e.contains("Table") {
                return Err(AppError::NotFound(format!(
                    "Resource type '{}' not found in dataset '{}'",
                    resource_type, dataset_id
                )));
            }
            eprintln!("[fhir] Failed to read resource: {}", e);
            Err(AppError::Internal(
                "Failed to read resource".to_string(),
            ))
        }
        _ => Err(AppError::NotFound(format!(
            "{}/{} not found",
            resource_type, resource_id
        ))),
    }
}

pub async fn update_resource(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id)): Path<(String, String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;

    let validation_result =
        validation::validate_resource_update(&body, &resource_type, &resource_id, &state.registry);
    if !validation_result.is_valid() {
        return Err(AppError::BadRequest(
            serde_json::to_string(&validation_result.to_operation_outcome())
                .unwrap_or_else(|_| "Validation failed".to_string()),
        ));
    }

    let schema_name = state.qualified_schema(&dataset_id);
    let table_name = resource_type.to_lowercase();

    // BEGIN/COMMIT around the read-modify-write sequence prevents version races
    // when concurrent requests target the same resource.
    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    if let QueryResult::Error(e) = conn.execute("BEGIN TRANSACTION".to_string()).await {
        eprintln!("[fhir] Failed to begin transaction: {}", e);
        return Err(AppError::Internal("Failed to begin transaction".to_string()));
    }

    let check_sql = build_check_version_sql(&schema_name, &resource_type, &resource_id);

    let (current_version, is_new, current_raw) = match conn.execute(check_sql).await {
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
            let _ = conn.execute("ROLLBACK".to_string()).await;
            if e.contains("does not exist") || e.contains("Table") {
                return Err(AppError::NotFound(format!(
                    "Resource type '{}' not found in dataset '{}'",
                    resource_type, dataset_id
                )));
            }
            eprintln!("[fhir] Failed to check resource: {}", e);
            return Err(AppError::Internal(
                "Failed to check resource".to_string(),
            ));
        }
        _ => (0, true, String::new()),
    };

    if let Some(if_match) = headers.get("If-Match") {
        if let Ok(etag) = if_match.to_str() {
            if let Some(expected) = parse_if_match_etag(etag) {
                if !is_new && expected != current_version {
                    let _ = conn.execute("ROLLBACK".to_string()).await;
                    return Err(AppError::Conflict(format!(
                        "Version conflict: expected {}, current {}",
                        expected, current_version
                    )));
                }
            }
        }
    }

    let new_version = current_version + 1;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    let mut resource = body.clone();
    stamp_resource_meta(&mut resource, &resource_id, new_version, &now);

    let raw_json = match serde_json::to_string(&resource) {
        Ok(s) => s,
        Err(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            return Err(AppError::Internal(format!("JSON serialize: {}", e)));
        }
    };

    if !is_new {
        let history_sql = build_history_insert_sql(&schema_name, current_version);
        if let QueryResult::Error(e) = conn.execute_params(history_sql, vec![
            resource_id.clone(),
            resource_type.clone(),
            current_raw,
        ]).await {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            eprintln!("[fhir] WARNING: history write failed for {}/{}: {}", resource_type, resource_id, e);
            return Err(AppError::Internal("Failed to write history".to_string()));
        }
    }

    let transform_spec = match state.registry.get_json_transform(&resource_type) {
        Ok(s) => s,
        Err(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            return Err(AppError::Internal(format!("Transform spec: {}", e)));
        }
    };
    let column_names = match state.registry.get_column_names(&resource_type) {
        Ok(s) => s,
        Err(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            return Err(AppError::Internal(format!("Column names: {}", e)));
        }
    };
    let sql = if is_new {
        sql_builder::build_insert_sql(&schema_name, &table_name, new_version, &transform_spec, &column_names)
    } else {
        sql_builder::build_update_sql(&schema_name, &table_name, new_version, &transform_spec, &column_names)
    };

    if let QueryResult::Error(e) = conn.execute_params(sql, vec![resource_id.clone(), raw_json]).await {
        let _ = conn.execute("ROLLBACK".to_string()).await;
        eprintln!("[fhir] Failed to update resource: {}", e);
        return Err(AppError::Internal(
            "Failed to update resource".to_string(),
        ));
    }

    if let QueryResult::Error(e) = conn.execute("COMMIT".to_string()).await {
        eprintln!("[fhir] Failed to commit update transaction: {}", e);
        return Err(AppError::Internal("Failed to commit transaction".to_string()));
    }

    let status = if is_new {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };

    let mut resp_headers = HeaderMap::new();
    if let Ok(v) = format!("W/\"{}\"", new_version).parse() {
        resp_headers.insert("ETag", v);
    }
    if let Ok(v) = "application/fhir+json".parse() {
        resp_headers.insert("Content-Type", v);
    }

    Ok((status, resp_headers, Json(resource)))
}

pub async fn delete_resource(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id)): Path<(String, String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;

    let schema_name = state.qualified_schema(&dataset_id);

    // BEGIN/COMMIT around the read-modify-write sequence prevents version races
    // when concurrent requests target the same resource.
    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    if let QueryResult::Error(e) = conn.execute("BEGIN TRANSACTION".to_string()).await {
        eprintln!("[fhir] Failed to begin transaction: {}", e);
        return Err(AppError::Internal("Failed to begin transaction".to_string()));
    }

    let check_sql = format!(
        "SELECT _version_id::VARCHAR, _raw FROM {schema}.\"{table}\" WHERE _id = '{id}' AND NOT _is_deleted",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = resource_id.replace('\'', "''")
    );

    let (current_version, current_raw) = match conn.execute(check_sql).await {
        QueryResult::Select { rows, .. } => {
            if rows.is_empty() {
                let _ = conn.execute("ROLLBACK".to_string()).await;
                return Err(AppError::NotFound(format!(
                    "{}/{} not found",
                    resource_type, resource_id
                )));
            }
            parse_check_row(&rows[0])
        }
        QueryResult::Error(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            if e.contains("does not exist") || e.contains("Table") {
                return Err(AppError::NotFound(format!(
                    "Resource type '{}' not found in dataset '{}'",
                    resource_type, dataset_id
                )));
            }
            eprintln!("[fhir] Failed to check resource: {}", e);
            return Err(AppError::Internal(
                "Failed to check resource".to_string(),
            ));
        }
        _ => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            return Err(AppError::NotFound(format!(
                "{}/{} not found",
                resource_type, resource_id
            )));
        }
    };

    let new_version = current_version + 1;

    let history_sql = build_history_insert_sql(&schema_name, current_version);
    if let QueryResult::Error(e) = conn.execute_params(history_sql, vec![
        resource_id.clone(),
        resource_type.clone(),
        current_raw,
    ]).await {
        let _ = conn.execute("ROLLBACK".to_string()).await;
        eprintln!("[fhir] WARNING: history write failed for {}/{}: {}", resource_type, resource_id, e);
        return Err(AppError::Internal("Failed to write history".to_string()));
    }

    let delete_sql = build_soft_delete_sql(&schema_name, &resource_type, new_version);

    if let QueryResult::Error(e) = conn.execute_params(delete_sql, vec![resource_id.clone()]).await {
        let _ = conn.execute("ROLLBACK".to_string()).await;
        eprintln!("[fhir] Failed to delete resource: {}", e);
        return Err(AppError::Internal(
            "Failed to delete resource".to_string(),
        ));
    }

    if let QueryResult::Error(e) = conn.execute("COMMIT".to_string()).await {
        eprintln!("[fhir] Failed to commit delete transaction: {}", e);
        return Err(AppError::Internal("Failed to commit transaction".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stamp_resource_meta_sets_id_and_version() {
        let mut r = json!({"resourceType": "Patient"});
        stamp_resource_meta(&mut r, "abc", 3, "2026-05-23T10:00:00Z");
        assert_eq!(r["id"], "abc");
        assert_eq!(r["meta"]["versionId"], "3");
        assert_eq!(r["meta"]["lastUpdated"], "2026-05-23T10:00:00Z");
    }

    #[test]
    fn stamp_resource_meta_overwrites_existing() {
        let mut r = json!({"resourceType": "Patient", "id": "old", "meta": {"versionId": "99"}});
        stamp_resource_meta(&mut r, "new", 1, "now");
        assert_eq!(r["id"], "new");
        assert_eq!(r["meta"]["versionId"], "1");
    }

    #[test]
    fn stamp_resource_meta_noop_on_non_object() {
        let mut r = json!("not an object");
        stamp_resource_meta(&mut r, "x", 1, "now");
        assert_eq!(r, json!("not an object"));
    }

    #[test]
    fn parse_if_match_etag_with_weak_prefix() {
        assert_eq!(parse_if_match_etag("W/\"3\""), Some(3));
    }

    #[test]
    fn parse_if_match_etag_with_plain_quotes() {
        assert_eq!(parse_if_match_etag("\"7\""), Some(7));
    }

    #[test]
    fn parse_if_match_etag_bare_number() {
        assert_eq!(parse_if_match_etag("42"), Some(42));
    }

    #[test]
    fn parse_if_match_etag_invalid_returns_none() {
        assert!(parse_if_match_etag("not-a-number").is_none());
        assert!(parse_if_match_etag("W/\"abc\"").is_none());
    }

    #[test]
    fn map_table_error_to_not_found() {
        let err = map_table_or_internal_error(
            "Table xyz does not exist",
            "Patient",
            "ds1",
            "fallback",
        );
        match err {
            AppError::NotFound(m) => {
                assert!(m.contains("Patient"));
                assert!(m.contains("ds1"));
            }
            other => panic!("expected NotFound, got {:?}", other),
        }
    }

    #[test]
    fn map_other_error_to_internal() {
        let err = map_table_or_internal_error("some random error", "Patient", "ds1", "Failed");
        match err {
            AppError::Internal(m) => assert_eq!(m, "Failed"),
            other => panic!("expected Internal, got {:?}", other),
        }
    }

    #[test]
    fn build_read_sql_lowercases_table_and_escapes() {
        let sql = build_read_sql("\"db\".\"ds\"", "Observation", "o'1");
        assert!(sql.contains("\"observation\""));
        assert!(sql.contains("'o''1'"));
        assert!(sql.contains("_raw"));
        assert!(sql.contains("_is_deleted"));
        assert!(sql.contains("_version_id"));
    }

    #[test]
    fn build_check_version_sql_lowercases_and_escapes() {
        let sql = build_check_version_sql("\"db\".\"ds\"", "Patient", "p'1");
        assert!(sql.contains("\"patient\""));
        assert!(sql.contains("'p''1'"));
    }

    #[test]
    fn build_history_insert_sql_embeds_version() {
        let sql = build_history_insert_sql("\"db\".\"ds\"", 7);
        assert!(sql.contains("\"db\".\"ds\"._history"));
        assert!(sql.contains("_version_id"));
        assert!(sql.contains(", 7, "));
        assert!(sql.contains("_is_deleted"));
    }

    #[test]
    fn soft_delete_sql_uses_lowercased_table_and_sets_flags() {
        let sql = build_soft_delete_sql("\"db\".\"ds\"", "Patient", 5);
        assert!(sql.contains("\"db\".\"ds\".\"patient\""));
        assert!(sql.contains("_is_deleted = true"));
        assert!(sql.contains("_version_id = 5"));
        assert!(sql.contains("_last_updated = CURRENT_TIMESTAMP"));
        assert!(sql.contains("WHERE _id = $1"));
    }

    #[test]
    fn parse_check_row_extracts_version_and_raw() {
        let row = vec![json!("3"), json!(r#"{"resourceType":"Patient"}"#)];
        let (v, raw) = parse_check_row(&row);
        assert_eq!(v, 3);
        assert!(raw.contains("Patient"));
    }

    #[test]
    fn parse_check_row_defaults_on_missing() {
        let row: Vec<Value> = vec![];
        let (v, raw) = parse_check_row(&row);
        assert_eq!(v, 1);
        assert_eq!(raw, "{}");
    }

    #[test]
    fn parse_check_row_defaults_on_bad_types() {
        let row = vec![json!(42), json!(null)];
        let (v, raw) = parse_check_row(&row);
        assert_eq!(v, 1);
        assert_eq!(raw, "{}");
    }
}
