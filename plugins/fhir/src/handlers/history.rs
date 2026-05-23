use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::AppError;
use crate::query_executor::QueryResult;
use crate::sql_safety::{validate_dataset_id, validate_fhir_id, validate_resource_type, validate_version_id};
use crate::state::AppState;

/// Build the SELECT that pulls history rows for one resource (newest version first).
pub fn build_history_sql(schema_name: &str, resource_type: &str, resource_id: &str) -> String {
    format!(
        "SELECT _version_id::VARCHAR, _last_updated::VARCHAR, _raw, _is_deleted::VARCHAR FROM {schema}._history \
         WHERE _id = '{id}' AND _resource_type = '{rtype}' \
         ORDER BY _version_id DESC",
        schema = schema_name,
        id = resource_id.replace('\'', "''"),
        rtype = resource_type.replace('\'', "''")
    )
}

/// Build the SELECT that pulls the current version of one resource from its table.
pub fn build_current_version_sql(schema_name: &str, resource_type: &str, resource_id: &str) -> String {
    format!(
        "SELECT _version_id::VARCHAR, _last_updated::VARCHAR, _raw, _is_deleted::VARCHAR FROM {schema}.\"{table}\" WHERE _id = '{id}'",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = resource_id.replace('\'', "''")
    )
}

/// Build a single history bundle entry from a row of (version_id, _, _raw, _is_deleted).
/// Returns `None` if `_raw` is not parseable JSON.
pub fn build_history_entry(
    dataset_id: &str,
    resource_type: &str,
    resource_id: &str,
    version: &str,
    raw: &str,
    is_deleted: bool,
) -> Option<Value> {
    let resource: Value = serde_json::from_str(raw).ok()?;
    let method = if is_deleted { "DELETE" } else { "PUT" };
    Some(json!({
        "fullUrl": format!("/{}/{}/{}", dataset_id, resource_type, resource_id),
        "resource": resource,
        "request": {
            "method": method,
            "url": format!("{}/{}", resource_type, resource_id)
        },
        "response": {
            "status": "200",
            "etag": format!("W/\"{}\"", version)
        }
    }))
}

/// Build the final Bundle wrapping a Vec of history entries.
pub fn build_history_bundle(entries: Vec<Value>) -> Value {
    json!({
        "resourceType": "Bundle",
        "type": "history",
        "total": entries.len(),
        "entry": entries
    })
}

/// Build the SELECT that fetches a specific historical version row from `_history`.
pub fn build_history_version_sql(
    schema_name: &str,
    resource_type: &str,
    resource_id: &str,
    version_id: &str,
) -> String {
    format!(
        "SELECT _raw FROM {schema}._history \
         WHERE _id = '{id}' AND _resource_type = '{rtype}' AND _version_id = {version}",
        schema = schema_name,
        id = resource_id.replace('\'', "''"),
        rtype = resource_type.replace('\'', "''"),
        version = version_id
    )
}

/// Build the SELECT that fetches a specific version row from the current resource table.
/// Used as a fallback when the row isn't in `_history` yet (it's the live version).
pub fn build_current_version_by_id_sql(
    schema_name: &str,
    resource_type: &str,
    resource_id: &str,
    version_id: &str,
) -> String {
    format!(
        "SELECT _raw FROM {schema}.\"{table}\" WHERE _id = '{id}' AND _version_id = {version}",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = resource_id.replace('\'', "''"),
        version = version_id
    )
}

pub async fn resource_history(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id)): Path<(String, String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;

    let schema_name = state.qualified_schema(&dataset_id);

    let sql = build_history_sql(&schema_name, &resource_type, &resource_id);
    let current_sql = build_current_version_sql(&schema_name, &resource_type, &resource_id);

    let mut entries = Vec::new();

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    if let QueryResult::Select { rows, .. } = conn.execute(current_sql).await {
        for row in &rows {
            let raw = row.get(2).and_then(|v| v.as_str()).unwrap_or("{}");
            let version = row.get(0).and_then(|v| v.as_str()).unwrap_or("1");
            let is_deleted = row.get(3).and_then(|v| v.as_str()).map(|s| s == "true").unwrap_or(false);
            if let Some(entry) = build_history_entry(
                &dataset_id, &resource_type, &resource_id, version, raw, is_deleted,
            ) {
                entries.push(entry);
            }
        }
    }

    if let QueryResult::Select { rows, .. } = conn.execute(sql).await {
        for row in &rows {
            let raw = row.get(2).and_then(|v| v.as_str()).unwrap_or("{}");
            let version = row.get(0).and_then(|v| v.as_str()).unwrap_or("1");
            if let Some(entry) = build_history_entry(
                &dataset_id, &resource_type, &resource_id, version, raw, false,
            ) {
                entries.push(entry);
            }
        }
    }

    Ok(Json(build_history_bundle(entries)))
}

pub async fn read_resource_version(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id, version_id)): Path<(String, String, String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;
    validate_version_id(&version_id)?;

    let schema_name = state.qualified_schema(&dataset_id);

    let sql = build_history_version_sql(&schema_name, &resource_type, &resource_id, &version_id);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => {
            if rows.is_empty() {
                let current_sql = build_current_version_by_id_sql(
                    &schema_name, &resource_type, &resource_id, &version_id,
                );
                match conn.execute(current_sql).await {
                    QueryResult::Select { rows, .. } if !rows.is_empty() => {
                        let raw = rows[0].first().and_then(|v| v.as_str()).unwrap_or("{}");
                        let resource: Value = serde_json::from_str(raw)
                            .map_err(|e| AppError::Internal(format!("JSON parse: {}", e)))?;
                        Ok(Json(resource))
                    }
                    _ => Err(AppError::NotFound(format!(
                        "Version {} of {}/{} not found",
                        version_id, resource_type, resource_id
                    ))),
                }
            } else {
                let raw = rows[0].first().and_then(|v| v.as_str()).unwrap_or("{}");
                let resource: Value = serde_json::from_str(raw)
                    .map_err(|e| AppError::Internal(format!("JSON parse: {}", e)))?;
                Ok(Json(resource))
            }
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] Failed to read version: {}", e);
            Err(AppError::Internal("Failed to read version".to_string()))
        }
        _ => Err(AppError::NotFound(format!(
            "Version {} of {}/{} not found",
            version_id, resource_type, resource_id
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_history_sql_escapes_quotes() {
        let sql = build_history_sql("\"db\".\"ds\"", "Patient", "abc'def");
        assert!(sql.contains("\"db\".\"ds\"._history"));
        assert!(sql.contains("'abc''def'"));
        assert!(sql.contains("ORDER BY _version_id DESC"));
    }

    #[test]
    fn build_current_version_sql_uses_lowercase_table() {
        let sql = build_current_version_sql("\"db\".\"ds\"", "MedicationRequest", "x1");
        assert!(sql.contains("\"medicationrequest\""));
        assert!(sql.contains("'x1'"));
    }

    #[test]
    fn history_entry_with_valid_resource() {
        let entry = build_history_entry(
            "ds", "Patient", "p1", "3",
            r#"{"resourceType":"Patient","id":"p1"}"#,
            false,
        )
        .unwrap();
        assert_eq!(entry["request"]["method"], "PUT");
        assert_eq!(entry["request"]["url"], "Patient/p1");
        assert_eq!(entry["fullUrl"], "/ds/Patient/p1");
        assert_eq!(entry["response"]["etag"], "W/\"3\"");
        assert_eq!(entry["resource"]["id"], "p1");
    }

    #[test]
    fn history_entry_marks_delete_when_deleted() {
        let entry = build_history_entry(
            "ds", "Patient", "p1", "4", r#"{"resourceType":"Patient","id":"p1"}"#, true,
        )
        .unwrap();
        assert_eq!(entry["request"]["method"], "DELETE");
    }

    #[test]
    fn history_entry_returns_none_for_invalid_json() {
        let entry = build_history_entry("ds", "Patient", "p1", "1", "not-json", false);
        assert!(entry.is_none());
    }

    #[test]
    fn history_bundle_wraps_entries() {
        let entries = vec![json!({"fullUrl": "/a"}), json!({"fullUrl": "/b"})];
        let bundle = build_history_bundle(entries);
        assert_eq!(bundle["resourceType"], "Bundle");
        assert_eq!(bundle["type"], "history");
        assert_eq!(bundle["total"], 2);
        assert_eq!(bundle["entry"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn history_bundle_empty() {
        let bundle = build_history_bundle(vec![]);
        assert_eq!(bundle["total"], 0);
        assert!(bundle["entry"].as_array().unwrap().is_empty());
    }

    #[test]
    fn history_version_sql_includes_filters() {
        let sql = build_history_version_sql("\"db\".\"ds\"", "Patient", "abc", "5");
        assert!(sql.contains("\"db\".\"ds\"._history"));
        assert!(sql.contains("_id = 'abc'"));
        assert!(sql.contains("_resource_type = 'Patient'"));
        assert!(sql.contains("_version_id = 5"));
    }

    #[test]
    fn history_version_sql_escapes_quotes() {
        let sql = build_history_version_sql("\"db\".\"ds\"", "Patient", "a'b", "1");
        assert!(sql.contains("'a''b'"));
    }

    #[test]
    fn current_version_by_id_sql_lowercases_table() {
        let sql = build_current_version_by_id_sql("\"db\".\"ds\"", "MedicationRequest", "m1", "7");
        assert!(sql.contains("\"medicationrequest\""));
        assert!(sql.contains("_id = 'm1'"));
        assert!(sql.contains("_version_id = 7"));
    }
}
