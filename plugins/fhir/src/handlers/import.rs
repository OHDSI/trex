use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::resource_registry::ResourceRegistry;
use crate::handlers::upsert;
use crate::sql_safety::{validate_dataset_id, validate_fhir_id};
use crate::state::AppState;

/// Outcome of parsing a single NDJSON line into a resource we'll attempt to upsert.
#[derive(Debug)]
pub enum LineOutcome {
    /// Line was blank — skip.
    Empty,
    /// Line failed parsing or validation; do not attempt upsert.
    Rejected {
        resource_type: Option<String>,
        error: String,
    },
    /// Line was accepted; ready for upsert with the given id.
    Accepted {
        resource: Value,
        resource_type: String,
        id: String,
    },
}

/// Classify one NDJSON line without performing any DB work. Pure on inputs except
/// for `uuid::Uuid::new_v4()` when the resource has no id.
pub fn classify_import_line(line: &str, registry: &ResourceRegistry) -> LineOutcome {
    let line = line.trim();
    if line.is_empty() {
        return LineOutcome::Empty;
    }

    let resource: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            return LineOutcome::Rejected {
                resource_type: None,
                error: format!("Invalid JSON: {}", e),
            };
        }
    };

    let resource_type = match resource.get("resourceType").and_then(|v| v.as_str()) {
        Some(rt) => rt.to_string(),
        None => {
            return LineOutcome::Rejected {
                resource_type: None,
                error: "Missing resourceType".to_string(),
            };
        }
    };

    if !registry.is_known_type(&resource_type) {
        return LineOutcome::Rejected {
            resource_type: Some(resource_type.clone()),
            error: format!("Unknown resource type: {}", resource_type),
        };
    }

    let id = match resource.get("id").and_then(|v| v.as_str()) {
        Some(id) => {
            if let Err(e) = validate_fhir_id(id) {
                return LineOutcome::Rejected {
                    resource_type: Some(resource_type),
                    error: format!("Invalid resource id: {}", e),
                };
            }
            id.to_string()
        }
        None => uuid::Uuid::new_v4().to_string(),
    };

    LineOutcome::Accepted {
        resource,
        resource_type,
        id,
    }
}

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
        let line_num = line_idx + 1;

        let (mut resource, resource_type, id) = match classify_import_line(line, &state.registry) {
            LineOutcome::Empty => continue,
            LineOutcome::Rejected { resource_type, error } => {
                total_errors += 1;
                let key = resource_type.clone().unwrap_or_else(|| "_parse".to_string());
                *error_counts.entry(key).or_default() += 1;
                let mut detail = json!({"line": line_num, "error": error});
                if let Some(rt) = resource_type {
                    detail
                        .as_object_mut()
                        .unwrap()
                        .insert("resourceType".to_string(), json!(rt));
                }
                error_details.push(detail);
                continue;
            }
            LineOutcome::Accepted { resource, resource_type, id } => (resource, resource_type, id),
        };

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

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_registry() -> ResourceRegistry {
        ResourceRegistry::new()
    }

    fn real_registry() -> ResourceRegistry {
        ResourceRegistry::with_definitions(
            crate::fhir_server::load_default_definitions().expect("definitions"),
        )
    }

    #[test]
    fn empty_line_is_empty() {
        let r = empty_registry();
        assert!(matches!(classify_import_line("", &r), LineOutcome::Empty));
        assert!(matches!(classify_import_line("   ", &r), LineOutcome::Empty));
        assert!(matches!(classify_import_line("\n", &r), LineOutcome::Empty));
    }

    #[test]
    fn invalid_json_is_rejected() {
        let r = empty_registry();
        match classify_import_line("{not json", &r) {
            LineOutcome::Rejected { resource_type, error } => {
                assert!(resource_type.is_none());
                assert!(error.contains("Invalid JSON"));
            }
            other => panic!("expected Rejected, got {:?}", other),
        }
    }

    #[test]
    fn missing_resource_type_is_rejected() {
        let r = empty_registry();
        match classify_import_line(r#"{"name": "x"}"#, &r) {
            LineOutcome::Rejected { resource_type, error } => {
                assert!(resource_type.is_none());
                assert!(error.contains("Missing resourceType"));
            }
            other => panic!("expected Rejected, got {:?}", other),
        }
    }

    #[test]
    fn unknown_resource_type_is_rejected() {
        let r = empty_registry();
        match classify_import_line(r#"{"resourceType": "Patient"}"#, &r) {
            LineOutcome::Rejected { resource_type, error } => {
                assert_eq!(resource_type.as_deref(), Some("Patient"));
                assert!(error.contains("Unknown resource type"));
            }
            other => panic!("expected Rejected, got {:?}", other),
        }
    }

    #[test]
    fn invalid_id_is_rejected() {
        let r = real_registry();
        match classify_import_line(r#"{"resourceType": "Patient", "id": "bad id!"}"#, &r) {
            LineOutcome::Rejected { resource_type, error } => {
                assert_eq!(resource_type.as_deref(), Some("Patient"));
                assert!(error.contains("Invalid resource id"));
            }
            other => panic!("expected Rejected, got {:?}", other),
        }
    }

    #[test]
    fn accepted_with_client_id() {
        let r = real_registry();
        match classify_import_line(r#"{"resourceType": "Patient", "id": "abc-123"}"#, &r) {
            LineOutcome::Accepted { resource_type, id, .. } => {
                assert_eq!(resource_type, "Patient");
                assert_eq!(id, "abc-123");
            }
            other => panic!("expected Accepted, got {:?}", other),
        }
    }

    #[test]
    fn accepted_without_id_gets_generated_uuid() {
        let r = real_registry();
        match classify_import_line(r#"{"resourceType": "Patient"}"#, &r) {
            LineOutcome::Accepted { id, .. } => {
                // UUID v4 strings are 36 characters with hyphens at known offsets
                assert_eq!(id.len(), 36);
                assert!(uuid::Uuid::parse_str(&id).is_ok());
            }
            other => panic!("expected Accepted, got {:?}", other),
        }
    }
}
