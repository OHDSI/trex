use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::cql::compiler;
use crate::cql::elm_types::ElmLibrary;
use crate::error::AppError;
use crate::query_executor::QueryResult;
use crate::sql_safety::{validate_dataset_id, validate_fhir_id};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct EvaluateMeasureParams {
    pub measure: Option<String>,
    #[serde(rename = "periodStart")]
    pub period_start: Option<String>,
    #[serde(rename = "periodEnd")]
    pub period_end: Option<String>,
}

pub async fn evaluate_measure(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Query(params): Query<EvaluateMeasureParams>,
    body: Option<Json<Value>>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    let schema_name = state.qualified_schema(&dataset_id);

    let measure_url = params
        .measure
        .or_else(|| extract_measure_param_from_body(&body))
        .ok_or_else(|| {
            AppError::BadRequest(
                "Missing 'measure' parameter (query string or Parameters body)".to_string(),
            )
        })?;

    let period_start = params.period_start.as_deref().unwrap_or(DEFAULT_PERIOD_START);
    let period_end = params.period_end.as_deref().unwrap_or(DEFAULT_PERIOD_END);

    let measure_sql = build_measure_by_url_sql(&schema_name, &measure_url);

    let measure_raw = load_single_resource(&state, &measure_sql, "Measure", &measure_url).await?;

    evaluate_measure_impl(&state, &schema_name, &measure_raw, &measure_url, period_start, period_end).await
}

/// Default period start (`1900-01-01`) when caller did not provide one.
pub const DEFAULT_PERIOD_START: &str = "1900-01-01";
/// Default period end (`2100-12-31`) when caller did not provide one.
pub const DEFAULT_PERIOD_END: &str = "2100-12-31";

/// Build the SQL that selects the latest Measure by canonical URL.
pub fn build_measure_by_url_sql(schema_name: &str, measure_url: &str) -> String {
    format!(
        "SELECT _raw FROM {}.\"measure\" WHERE json_extract_string(_raw, '$.url') = '{}' AND NOT _is_deleted ORDER BY json_extract_string(_raw, '$.version') DESC LIMIT 1",
        schema_name,
        measure_url.replace('\'', "''")
    )
}

/// Build the SQL that selects a Measure by its FHIR id.
pub fn build_measure_by_id_sql(schema_name: &str, measure_id: &str) -> String {
    format!(
        "SELECT _raw FROM {}.\"measure\" WHERE _id = '{}' AND NOT _is_deleted LIMIT 1",
        schema_name,
        measure_id.replace('\'', "''")
    )
}

/// Resolve a measure URL given the raw Measure JSON, falling back to a
/// `Measure/<id>` reference when no `url` is set.
pub fn resolve_measure_url_from_raw(measure_raw: &str, measure_id: &str) -> String {
    serde_json::from_str::<Value>(measure_raw)
        .ok()
        .and_then(|v| v.get("url").and_then(|u| u.as_str()).map(String::from))
        .unwrap_or_else(|| format!("Measure/{}", measure_id))
}

pub async fn evaluate_measure_instance(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, measure_id)): Path<(String, String)>,
    Query(params): Query<EvaluateMeasureParams>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_fhir_id(&measure_id)?;
    let schema_name = state.qualified_schema(&dataset_id);

    let period_start = params.period_start.as_deref().unwrap_or(DEFAULT_PERIOD_START);
    let period_end = params.period_end.as_deref().unwrap_or(DEFAULT_PERIOD_END);

    let measure_sql = build_measure_by_id_sql(&schema_name, &measure_id);

    let measure_raw = load_single_resource(&state, &measure_sql, "Measure", &measure_id).await?;

    let measure_url = resolve_measure_url_from_raw(&measure_raw, &measure_id);

    evaluate_measure_impl(&state, &schema_name, &measure_raw, &measure_url, period_start, period_end).await
}

/// Extract the first library URL from a Measure resource.
pub fn extract_measure_library_url(measure: &Value) -> Option<String> {
    measure
        .get("library")
        .and_then(|l| l.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(String::from)
}

/// Extract the initial-population criteria expression name from a Measure resource.
pub fn extract_measure_expression_name(measure: &Value) -> Option<String> {
    measure
        .get("group")
        .and_then(|g| g.as_array())
        .and_then(|arr| arr.first())
        .and_then(|g| g.get("population"))
        .and_then(|p| p.as_array())
        .and_then(|arr| arr.first())
        .and_then(|p| p.get("criteria"))
        .and_then(|c| c.get("expression"))
        .and_then(|e| e.as_str())
        .map(String::from)
}

/// Build the SQL that fetches the latest non-deleted Library resource by URL.
pub fn build_library_query_sql(schema_name: &str, library_url: &str) -> String {
    format!(
        "SELECT _raw FROM {}.\"library\" WHERE json_extract_string(_raw, '$.url') = '{}' AND NOT _is_deleted ORDER BY json_extract_string(_raw, '$.version') DESC LIMIT 1",
        schema_name,
        library_url.replace('\'', "''")
    )
}

/// Build the MeasureReport JSON wrapping the population count.
pub fn build_measure_report(
    measure_url: &str,
    period_start: &str,
    period_end: &str,
    count: i64,
) -> Value {
    json!({
        "resourceType": "MeasureReport",
        "status": "complete",
        "type": "summary",
        "measure": measure_url,
        "period": {
            "start": period_start,
            "end": period_end
        },
        "group": [{
            "population": [{
                "code": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/measure-population",
                        "code": "initial-population"
                    }]
                },
                "count": count
            }]
        }]
    })
}

async fn evaluate_measure_impl(
    state: &AppState,
    schema_name: &str,
    measure_raw: &str,
    measure_url: &str,
    period_start: &str,
    period_end: &str,
) -> Result<Json<Value>, AppError> {
    let measure: Value = serde_json::from_str(measure_raw)
        .map_err(|e| AppError::Internal(format!("Invalid Measure JSON: {}", e)))?;

    let library_url = extract_measure_library_url(&measure)
        .ok_or_else(|| AppError::BadRequest("Measure has no library reference".to_string()))?;

    let expression_name = extract_measure_expression_name(&measure).ok_or_else(|| {
        AppError::BadRequest(
            "Measure has no group[0].population[0].criteria.expression".to_string(),
        )
    })?;

    let library_sql = build_library_query_sql(schema_name, &library_url);

    let library_raw = load_single_resource(state, &library_sql, "Library", &library_url).await?;

    let library: Value = serde_json::from_str(&library_raw)
        .map_err(|e| AppError::Internal(format!("Invalid Library JSON: {}", e)))?;

    let elm_json = extract_elm_from_library(state, &library).await?;

    let elm_library: ElmLibrary = serde_json::from_value(elm_json)
        .map_err(|e| AppError::BadRequest(format!("Invalid ELM JSON: {}", e)))?;

    let sql = compiler::compile_measure_population(&elm_library, schema_name, &expression_name)
        .map_err(|e| AppError::BadRequest(format!("CQL compilation error: {}", e)))?;

    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let count = match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0),
        QueryResult::Error(e) => {
            eprintln!("[fhir] Measure evaluation error: {}", e);
            return Err(AppError::Internal("Measure evaluation failed".to_string()));
        }
        _ => 0,
    };

    Ok(Json(build_measure_report(
        measure_url, period_start, period_end, count,
    )))
}

fn extract_measure_param_from_body(body: &Option<Json<Value>>) -> Option<String> {
    body.as_ref().and_then(|b| {
        b.get("parameter")
            .and_then(|p| p.as_array())
            .and_then(|arr| {
                arr.iter().find_map(|param| {
                    if param.get("name")?.as_str()? == "measure" {
                        param
                            .get("valueString")
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    } else {
                        None
                    }
                })
            })
    })
}

async fn load_single_resource(
    state: &AppState,
    sql: &str,
    resource_type: &str,
    identifier: &str,
) -> Result<String, AppError> {
    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    match conn.execute(sql.to_string()).await {
        QueryResult::Select { rows, .. } => rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| {
                AppError::NotFound(format!("{} not found: {}", resource_type, identifier))
            }),
        QueryResult::Error(e) => {
            if e.contains("does not exist") || e.contains("Table") {
                Err(AppError::NotFound(format!(
                    "{} resource type not available in this dataset",
                    resource_type
                )))
            } else {
                Err(AppError::Internal(format!(
                    "Failed to query {}: {}",
                    resource_type, e
                )))
            }
        }
        _ => Err(AppError::NotFound(format!(
            "{} not found: {}",
            resource_type, identifier
        ))),
    }
}

async fn extract_elm_from_library(state: &AppState, library: &Value) -> Result<Value, AppError> {
    let content = library
        .get("content")
        .and_then(|c| c.as_array())
        .ok_or_else(|| AppError::BadRequest("Library has no content".to_string()))?;

    for item in content {
        let content_type = item
            .get("contentType")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if content_type == "application/elm+json" {
            if let Some(data) = item.get("data").and_then(|v| v.as_str()) {
                let decoded = base64_decode(data).map_err(|e| {
                    AppError::BadRequest(format!("Invalid base64 in Library content: {}", e))
                })?;
                let elm: Value = serde_json::from_str(&decoded).map_err(|e| {
                    AppError::BadRequest(format!("Invalid ELM JSON in Library: {}", e))
                })?;
                if let Some(inner) = elm.get("library") {
                    return Ok(inner.clone());
                }
                return Ok(elm);
            }
        }
    }

    for item in content {
        let content_type = item
            .get("contentType")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if content_type == "text/cql" {
            if let Some(data) = item.get("data").and_then(|v| v.as_str()) {
                let cql_text = base64_decode(data).map_err(|e| {
                    AppError::BadRequest(format!("Invalid base64 in Library CQL content: {}", e))
                })?;
                return translate_cql_to_elm(state, &cql_text).await;
            }
        }
    }

    Err(AppError::BadRequest(
        "Library has no application/elm+json or text/cql content".to_string(),
    ))
}

async fn translate_cql_to_elm(state: &AppState, cql_text: &str) -> Result<Value, AppError> {
    let escaped = cql_text.replace('\'', "''");
    let sql = format!("SELECT cql_to_elm('{}')", escaped);
    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => {
            let elm_str = rows
                .first()
                .and_then(|r| r.first())
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::Internal("CQL translation returned no result".to_string())
                })?;

            let elm: Value = serde_json::from_str(elm_str).map_err(|e| {
                AppError::Internal(format!("Invalid ELM JSON from translator: {}", e))
            })?;

            if let Some(library) = elm.get("library") {
                Ok(library.clone())
            } else {
                Ok(elm)
            }
        }
        QueryResult::Error(e) if e.contains("does not exist") || e.contains("cql_to_elm") => {
            Err(AppError::BadRequest(
                "CQL text translation requires the cql2elm extension to be loaded. \
                 Provide pre-compiled ELM JSON in the Library content instead."
                    .to_string(),
            ))
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] CQL translation error: {}", e);
            Err(AppError::BadRequest(format!(
                "CQL translation failed: {}",
                e
            )))
        }
        _ => Err(AppError::Internal(
            "Unexpected result from CQL translation".to_string(),
        )),
    }
}

fn base64_decode(input: &str) -> Result<String, String> {
    let chars: Vec<u8> = input
        .bytes()
        .filter(|b| *b != b'\n' && *b != b'\r' && *b != b' ')
        .collect();
    let mut output = Vec::new();
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    fn decode_char(c: u8, table: &[u8]) -> Result<u8, String> {
        table
            .iter()
            .position(|&t| t == c)
            .map(|p| p as u8)
            .ok_or_else(|| format!("Invalid base64 character: {}", c as char))
    }

    let mut i = 0;
    while i < chars.len() {
        let a = if chars[i] == b'=' {
            0
        } else {
            decode_char(chars[i], table)?
        };
        let b = if i + 1 < chars.len() && chars[i + 1] != b'=' {
            decode_char(chars[i + 1], table)?
        } else {
            0
        };
        let c = if i + 2 < chars.len() && chars[i + 2] != b'=' {
            decode_char(chars[i + 2], table)?
        } else {
            0
        };
        let d = if i + 3 < chars.len() && chars[i + 3] != b'=' {
            decode_char(chars[i + 3], table)?
        } else {
            0
        };

        output.push((a << 2) | (b >> 4));
        if i + 2 < chars.len() && chars[i + 2] != b'=' {
            output.push(((b & 0x0f) << 4) | (c >> 2));
        }
        if i + 3 < chars.len() && chars[i + 3] != b'=' {
            output.push(((c & 0x03) << 6) | d);
        }

        i += 4;
    }

    String::from_utf8(output).map_err(|e| format!("Invalid UTF-8 in decoded base64: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use serde_json::json;

    #[test]
    fn base64_decodes_ascii() {
        assert_eq!(base64_decode("dGVzdA==").unwrap(), "test");
    }

    #[test]
    fn base64_rejects_invalid_char() {
        assert!(base64_decode("aGVsbG8!").is_err());
    }

    #[test]
    fn extract_measure_param_none_when_body_none() {
        let body: Option<Json<serde_json::Value>> = None;
        assert!(extract_measure_param_from_body(&body).is_none());
    }

    #[test]
    fn extract_measure_param_finds_named_parameter() {
        let body = Some(Json(json!({
            "resourceType": "Parameters",
            "parameter": [
                {"name": "measure", "valueString": "Measure/abc"}
            ]
        })));
        assert_eq!(
            extract_measure_param_from_body(&body),
            Some("Measure/abc".to_string())
        );
    }

    #[test]
    fn extract_measure_param_none_when_missing() {
        let body = Some(Json(json!({
            "resourceType": "Parameters",
            "parameter": [
                {"name": "other", "valueString": "x"}
            ]
        })));
        assert!(extract_measure_param_from_body(&body).is_none());
    }

    #[test]
    fn library_url_from_measure() {
        let m = json!({
            "resourceType": "Measure",
            "library": ["http://example.com/Library/lib1"]
        });
        assert_eq!(
            extract_measure_library_url(&m).as_deref(),
            Some("http://example.com/Library/lib1")
        );
    }

    #[test]
    fn library_url_none_when_missing() {
        assert!(extract_measure_library_url(&json!({})).is_none());
        assert!(extract_measure_library_url(&json!({"library": []})).is_none());
        assert!(extract_measure_library_url(&json!({"library": "not-array"})).is_none());
    }

    #[test]
    fn expression_name_from_measure() {
        let m = json!({
            "group": [{
                "population": [{
                    "criteria": {"expression": "InitialPop"}
                }]
            }]
        });
        assert_eq!(
            extract_measure_expression_name(&m).as_deref(),
            Some("InitialPop")
        );
    }

    #[test]
    fn expression_name_none_when_path_missing() {
        assert!(extract_measure_expression_name(&json!({})).is_none());
        assert!(extract_measure_expression_name(&json!({"group": []})).is_none());
        assert!(extract_measure_expression_name(&json!({
            "group": [{"population": []}]
        }))
        .is_none());
    }

    #[test]
    fn library_query_sql_orders_by_version() {
        let sql = build_library_query_sql("\"db\".\"ds\"", "urn:lib:1");
        assert!(sql.contains("\"db\".\"ds\".\"library\""));
        assert!(sql.contains("'urn:lib:1'"));
        assert!(sql.contains("$.url"));
        assert!(sql.contains("ORDER BY"));
        assert!(sql.contains("$.version"));
        assert!(sql.contains("DESC"));
        assert!(sql.contains("LIMIT 1"));
        assert!(sql.contains("NOT _is_deleted"));
    }

    #[test]
    fn library_query_sql_escapes_quotes() {
        let sql = build_library_query_sql("\"db\".\"ds\"", "urn:o'r");
        assert!(sql.contains("'urn:o''r'"));
    }

    #[test]
    fn measure_report_shape() {
        let r = build_measure_report("Measure/m1", "2025-01-01", "2025-12-31", 42);
        assert_eq!(r["resourceType"], "MeasureReport");
        assert_eq!(r["status"], "complete");
        assert_eq!(r["type"], "summary");
        assert_eq!(r["measure"], "Measure/m1");
        assert_eq!(r["period"]["start"], "2025-01-01");
        assert_eq!(r["period"]["end"], "2025-12-31");
        assert_eq!(r["group"][0]["population"][0]["count"], 42);
        assert_eq!(
            r["group"][0]["population"][0]["code"]["coding"][0]["code"],
            "initial-population"
        );
    }

    #[test]
    fn measure_by_url_sql_orders_by_version() {
        let sql = build_measure_by_url_sql("\"db\".\"ds\"", "urn:m1");
        assert!(sql.contains("\"measure\""));
        assert!(sql.contains("$.url"));
        assert!(sql.contains("'urn:m1'"));
        assert!(sql.contains("ORDER BY"));
        assert!(sql.contains("DESC"));
        assert!(sql.contains("LIMIT 1"));
    }

    #[test]
    fn measure_by_url_sql_escapes_quotes() {
        let sql = build_measure_by_url_sql("\"db\".\"ds\"", "urn:o'r");
        assert!(sql.contains("'urn:o''r'"));
    }

    #[test]
    fn measure_by_id_sql_uses_id_filter() {
        let sql = build_measure_by_id_sql("\"db\".\"ds\"", "m1");
        assert!(sql.contains("\"measure\""));
        assert!(sql.contains("_id = 'm1'"));
        assert!(sql.contains("NOT _is_deleted"));
        assert!(sql.contains("LIMIT 1"));
    }

    #[test]
    fn resolve_url_uses_explicit_url_when_present() {
        let raw = r#"{"resourceType":"Measure","url":"http://example.com/Measure/m1"}"#;
        let url = resolve_measure_url_from_raw(raw, "m1");
        assert_eq!(url, "http://example.com/Measure/m1");
    }

    #[test]
    fn resolve_url_falls_back_to_id_reference() {
        let raw = r#"{"resourceType":"Measure"}"#;
        let url = resolve_measure_url_from_raw(raw, "abc");
        assert_eq!(url, "Measure/abc");
    }

    #[test]
    fn resolve_url_falls_back_on_bad_json() {
        let url = resolve_measure_url_from_raw("not-json", "abc");
        assert_eq!(url, "Measure/abc");
    }

    #[test]
    fn default_periods_are_inclusive() {
        assert_eq!(DEFAULT_PERIOD_START, "1900-01-01");
        assert_eq!(DEFAULT_PERIOD_END, "2100-12-31");
    }
}
