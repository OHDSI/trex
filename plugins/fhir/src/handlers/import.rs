use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::AppError;
use crate::handlers::upsert;
use crate::sql_safety::{validate_dataset_id, validate_fhir_id};
use crate::state::AppState;

pub async fn import_ndjson(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let quoted_schema = state.qualified_schema(&dataset_id);
    let text = String::from_utf8(body.to_vec())
        .map_err(|_| AppError::BadRequest("Request body is not valid UTF-8".to_string()))?;

    let mut success_counts: HashMap<String, usize> = HashMap::new();
    let mut error_counts: HashMap<String, usize> = HashMap::new();
    let mut error_details: Vec<Value> = Vec::new();
    let mut total_success = 0usize;
    let mut total_errors = 0usize;

    for (line_idx, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let line_num = line_idx + 1;

        // Parse JSON
        let mut resource: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                total_errors += 1;
                *error_counts.entry("_parse".to_string()).or_default() += 1;
                error_details.push(json!({
                    "line": line_num,
                    "error": format!("Invalid JSON: {}", e)
                }));
                continue;
            }
        };

        // Extract resourceType
        let resource_type = match resource.get("resourceType").and_then(|v| v.as_str()) {
            Some(rt) => rt.to_string(),
            None => {
                total_errors += 1;
                *error_counts.entry("_parse".to_string()).or_default() += 1;
                error_details.push(json!({
                    "line": line_num,
                    "error": "Missing resourceType"
                }));
                continue;
            }
        };

        // Check if known type
        if !state.registry.is_known_type(&resource_type) {
            total_errors += 1;
            *error_counts.entry(resource_type.clone()).or_default() += 1;
            error_details.push(json!({
                "line": line_num,
                "resourceType": resource_type,
                "error": format!("Unknown resource type: {}", resource_type)
            }));
            continue;
        }

        // Determine id
        let id = match resource.get("id").and_then(|v| v.as_str()) {
            Some(id) => {
                if let Err(e) = validate_fhir_id(id) {
                    total_errors += 1;
                    *error_counts.entry(resource_type.clone()).or_default() += 1;
                    error_details.push(json!({
                        "line": line_num,
                        "resourceType": resource_type,
                        "error": format!("Invalid resource id: {}", e)
                    }));
                    continue;
                }
                id.to_string()
            }
            None => uuid::Uuid::new_v4().to_string(),
        };

        // Get transform spec and column names
        let transform_spec = match state.registry.get_json_transform(&resource_type) {
            Ok(s) => s,
            Err(e) => {
                total_errors += 1;
                *error_counts.entry(resource_type.clone()).or_default() += 1;
                error_details.push(json!({
                    "line": line_num,
                    "resourceType": resource_type,
                    "error": format!("Transform spec: {}", e)
                }));
                continue;
            }
        };

        let column_names = match state.registry.get_column_names(&resource_type) {
            Ok(c) => c,
            Err(e) => {
                total_errors += 1;
                *error_counts.entry(resource_type.clone()).or_default() += 1;
                error_details.push(json!({
                    "line": line_num,
                    "resourceType": resource_type,
                    "error": format!("Column names: {}", e)
                }));
                continue;
            }
        };

        match upsert::upsert_resource(
            &state,
            &quoted_schema,
            &resource_type,
            &id,
            &mut resource,
            &transform_spec,
            &column_names,
            None,
        )
        .await
        {
            Ok(_) => {
                total_success += 1;
                *success_counts.entry(resource_type).or_default() += 1;
            }
            Err(e) => {
                if e.contains("does not exist") || e.contains("Table") {
                    return Err(AppError::NotFound(format!(
                        "Dataset '{}' not found", dataset_id
                    )));
                }
                total_errors += 1;
                *error_counts.entry(resource_type.clone()).or_default() += 1;
                error_details.push(json!({
                    "line": line_num,
                    "resourceType": resource_type,
                    "error": e
                }));
            }
        }
    }

    let mut response = json!({
        "outcome": "complete",
        "total": {
            "success": total_success,
            "errors": total_errors
        },
        "success": success_counts,
        "errors": error_counts,
    });

    if !error_details.is_empty() {
        response
            .as_object_mut()
            .unwrap()
            .insert("errorDetails".to_string(), Value::Array(error_details));
    }

    Ok((StatusCode::OK, Json(response)))
}
