use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::AppError;
use crate::export::ndjson;
use crate::fhir::resource_registry::ResourceRegistry;
use crate::sql_safety::{validate_dataset_id, validate_resource_type, validate_uuid};
use crate::state::AppState;

/// Parse the `_type` parameter into a list of resource types, validating each.
/// When `_type` is absent, return all known types from the registry.
pub fn parse_export_types(
    params: &HashMap<String, String>,
    registry: &ResourceRegistry,
) -> Result<Vec<String>, AppError> {
    if let Some(types) = params.get("_type") {
        let parsed: Vec<String> = types.split(',').map(|s| s.trim().to_string()).collect();
        for rt in &parsed {
            validate_resource_type(rt, registry)?;
        }
        Ok(parsed)
    } else {
        Ok(registry.resource_type_names())
    }
}

/// Build the `(StatusCode, json)` payload for the synchronous status response of a job
/// fetched from `_export_jobs`. Returns Err for "error" / unknown statuses.
pub fn build_status_response(
    job: &Value,
    dataset_id: &str,
    job_id: &str,
) -> Result<(StatusCode, Value), AppError> {
    let status = job.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");

    match status {
        "in-progress" | "accepted" => Ok((
            StatusCode::ACCEPTED,
            json!({"status": status, "jobId": job_id}),
        )),
        "complete" => {
            let output_files: Vec<Value> = job
                .get("output_files")
                .and_then(|v| v.as_str())
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            Ok((
                StatusCode::OK,
                json!({
                    "transactionTime": job.get("completed_at").and_then(|v| v.as_str()).unwrap_or(""),
                    "request": format!("/{}/$export", dataset_id),
                    "requiresAccessToken": false,
                    "output": output_files,
                    "error": []
                }),
            ))
        }
        "error" => {
            let _msg = job.get("error_message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
            Err(AppError::Internal("Export failed".to_string()))
        }
        _ => Err(AppError::Internal("Unknown job status".to_string())),
    }
}

pub async fn system_export(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let resource_types = parse_export_types(&params, &state.registry)?;

    let meta = state.meta_schema();

    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let job_id = ndjson::create_export_job(
        &conn,
        &dataset_id,
        Some(&resource_types),
        &meta,
    )
    .await
    .map_err(|e| {
        eprintln!("[fhir] Failed to create export job: {}", e);
        AppError::Internal("Failed to create export job".to_string())
    })?;

    let ds_id = dataset_id.clone();
    let jid = job_id.clone();
    let types = resource_types.clone();
    let db_name = state.db_name.clone();
    tokio::spawn(async move {
        if let Err(e) = ndjson::execute_export(&ds_id, &jid, &types, &db_name).await {
            eprintln!("[fhir] Export job {} failed: {}", jid, e);
        }
    });

    Ok((
        StatusCode::ACCEPTED,
        [(
            "Content-Location",
            format!("/{}/$export/status/{}", dataset_id, job_id),
        )],
        Json(json!({"status": "accepted", "jobId": job_id})),
    ))
}

pub async fn type_export(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;

    let resource_types = vec![resource_type.clone()];
    let meta = state.meta_schema();

    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let job_id = ndjson::create_export_job(
        &conn,
        &dataset_id,
        Some(&resource_types),
        &meta,
    )
    .await
    .map_err(|e| {
        eprintln!("[fhir] Failed to create export job: {}", e);
        AppError::Internal("Failed to create export job".to_string())
    })?;

    let ds_id = dataset_id.clone();
    let jid = job_id.clone();
    let types = resource_types.clone();
    let db_name = state.db_name.clone();
    tokio::spawn(async move {
        if let Err(e) = ndjson::execute_export(&ds_id, &jid, &types, &db_name).await {
            eprintln!("[fhir] Export job {} failed: {}", jid, e);
        }
    });

    Ok((
        StatusCode::ACCEPTED,
        [(
            "Content-Location",
            format!("/{}/$export/status/{}", dataset_id, job_id),
        )],
        Json(json!({"status": "accepted", "jobId": job_id})),
    ))
}

pub async fn export_status(
    State(state): State<Arc<AppState>>,
    Path((_dataset_id, job_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    validate_uuid(&job_id)?;

    let meta = state.meta_schema();
    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let job = ndjson::get_export_job(&conn, &job_id, &meta)
        .await
        .map_err(|e| {
            eprintln!("[fhir] Failed to get export job: {}", e);
            AppError::Internal("Failed to get export job".to_string())
        })?
        .ok_or_else(|| AppError::NotFound(format!("Export job not found: {}", job_id)))?;

    let (status, body) = build_status_response(&job, &_dataset_id, &job_id)?;
    Ok((status, Json(body)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn real_registry() -> ResourceRegistry {
        ResourceRegistry::with_definitions(
            crate::fhir_server::load_default_definitions().expect("definitions"),
        )
    }

    #[test]
    fn parse_export_types_returns_all_when_absent() {
        let registry = real_registry();
        let params = HashMap::new();
        let types = parse_export_types(&params, &registry).unwrap();
        assert!(types.iter().any(|t| t == "Patient"));
        assert!(types.len() >= 100);
    }

    #[test]
    fn parse_export_types_parses_comma_separated() {
        let registry = real_registry();
        let mut params = HashMap::new();
        params.insert("_type".to_string(), "Patient, Observation".to_string());
        let types = parse_export_types(&params, &registry).unwrap();
        assert_eq!(types, vec!["Patient".to_string(), "Observation".to_string()]);
    }

    #[test]
    fn parse_export_types_rejects_unknown() {
        let registry = real_registry();
        let mut params = HashMap::new();
        params.insert("_type".to_string(), "Patient,Nonsense".to_string());
        assert!(parse_export_types(&params, &registry).is_err());
    }

    #[test]
    fn status_response_accepted() {
        let job = json!({"status": "accepted"});
        let (code, body) = build_status_response(&job, "ds", "abc").unwrap();
        assert_eq!(code, StatusCode::ACCEPTED);
        assert_eq!(body["status"], "accepted");
        assert_eq!(body["jobId"], "abc");
    }

    #[test]
    fn status_response_in_progress() {
        let job = json!({"status": "in-progress"});
        let (code, body) = build_status_response(&job, "ds", "abc").unwrap();
        assert_eq!(code, StatusCode::ACCEPTED);
        assert_eq!(body["status"], "in-progress");
    }

    #[test]
    fn status_response_complete_includes_output() {
        let job = json!({
            "status": "complete",
            "completed_at": "2026-05-23T00:00:00Z",
            "output_files": r#"[{"type":"Patient","url":"/foo.ndjson","count":3}]"#
        });
        let (code, body) = build_status_response(&job, "ds", "abc").unwrap();
        assert_eq!(code, StatusCode::OK);
        assert_eq!(body["transactionTime"], "2026-05-23T00:00:00Z");
        assert_eq!(body["requiresAccessToken"], false);
        assert_eq!(body["request"], "/ds/$export");
        assert_eq!(body["output"][0]["type"], "Patient");
    }

    #[test]
    fn status_response_complete_empty_output() {
        let job = json!({"status": "complete"});
        let (_code, body) = build_status_response(&job, "ds", "abc").unwrap();
        assert!(body["output"].as_array().unwrap().is_empty());
    }

    #[test]
    fn status_response_error_returns_internal() {
        let job = json!({"status": "error", "error_message": "boom"});
        let err = build_status_response(&job, "ds", "abc").unwrap_err();
        assert!(matches!(err, AppError::Internal(_)));
    }

    #[test]
    fn status_response_unknown_returns_internal() {
        let job = json!({"status": "wat"});
        let err = build_status_response(&job, "ds", "abc").unwrap_err();
        assert!(matches!(err, AppError::Internal(_)));
    }
}
