use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::cql::compiler;
use crate::cql::elm_types::ElmLibrary;
use crate::error::AppError;
use crate::query_executor::QueryResult;
use crate::sql_safety::validate_dataset_id;
use crate::state::AppState;

/// Build the SQL that calls the cql-to-elm host function with a properly escaped CQL text.
pub fn build_cql_translate_sql(cql_text: &str) -> String {
    format!("SELECT trex_fhir_cql_translate('{}')", cql_text.replace('\'', "''"))
}

/// Build the SQL that fetches the latest Library by URL (mirror of `measure::build_library_query_sql`).
pub fn build_cql_library_sql(schema_name: &str, library_url: &str) -> String {
    format!(
        "SELECT _raw FROM {}.\"library\" WHERE json_extract_string(_raw, '$.url') = '{}' AND NOT _is_deleted ORDER BY json_extract_string(_raw, '$.version') DESC LIMIT 1",
        schema_name,
        library_url.replace('\'', "''")
    )
}

/// Unwrap the ELM `library` field when the translator returns `{library: {...}}`.
pub fn unwrap_elm_library(elm: Value) -> Value {
    if let Some(library) = elm.get("library") {
        library.clone()
    } else {
        elm
    }
}

/// Classify a DuckDB error from the cql translator into either a "not loaded" BadRequest
/// or a generic BadRequest with the message embedded.
pub fn map_cql_translate_error(msg: &str) -> AppError {
    if msg.contains("does not exist") || msg.contains("trex_fhir_cql_translate") {
        AppError::BadRequest(
            "CQL text translation requires the cql2elm extension to be loaded. \
             Provide pre-compiled ELM JSON via the 'library' field instead."
                .to_string(),
        )
    } else {
        AppError::BadRequest(format!("CQL translation failed: {}", msg))
    }
}

/// Search a Library resource's `content` array for application/elm+json data and
/// return the decoded + parsed ELM JSON. Returns the original Library on error.
pub fn extract_elm_from_library_content(library: &Value) -> Result<Value, AppError> {
    let content = library
        .get("content")
        .and_then(|c| c.as_array())
        .ok_or_else(|| AppError::BadRequest("Library has no content".to_string()))?;

    for item in content {
        let content_type = item.get("contentType").and_then(|v| v.as_str()).unwrap_or("");
        if content_type == "application/elm+json" {
            if let Some(data) = item.get("data").and_then(|v| v.as_str()) {
                let decoded = base64_decode(data).map_err(|e| {
                    AppError::BadRequest(format!("Invalid base64 in Library content: {}", e))
                })?;
                let elm: Value = serde_json::from_str(&decoded).map_err(|e| {
                    AppError::BadRequest(format!("Invalid ELM JSON in Library: {}", e))
                })?;
                return Ok(elm);
            }
        }
    }

    Err(AppError::BadRequest(
        "Library has no application/elm+json content".to_string(),
    ))
}

pub async fn evaluate_cql(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let schema_name = state.qualified_schema(&dataset_id);

    let elm = if let Some(library) = body.get("library") {
        library.clone()
    } else if let Some(cql_text) = body.get("cql").and_then(|v| v.as_str()) {
        translate_cql_to_elm(&state, cql_text).await?
    } else if let Some(library_url) = body.get("libraryUrl").and_then(|v| v.as_str()) {
        load_library_elm(&state, &schema_name, library_url).await?
    } else {
        return Err(AppError::BadRequest(
            "Request must include 'library' (ELM JSON), 'cql' (CQL text), or 'libraryUrl'".to_string(),
        ));
    };

    let elm_library: ElmLibrary = serde_json::from_value(elm)
        .map_err(|e| AppError::BadRequest(format!("Invalid ELM JSON: {}", e)))?;

    let sql = compiler::compile_library(&elm_library, &schema_name)
        .map_err(|e| AppError::BadRequest(format!("CQL compilation error: {}", e)))?;

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(sql).await {
        QueryResult::Select { columns, rows } => {
            let parameters = build_parameters_response(&elm_library, &columns, &rows);
            Ok(Json(parameters))
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] CQL execution error: {}", e);
            Err(AppError::Internal("CQL execution failed".to_string()))
        }
        _ => Ok(Json(json!({
            "resourceType": "Parameters",
            "parameter": []
        }))),
    }
}

async fn translate_cql_to_elm(state: &AppState, cql_text: &str) -> Result<Value, AppError> {
    let sql = build_cql_translate_sql(cql_text);
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

            Ok(unwrap_elm_library(elm))
        }
        QueryResult::Error(e) => Err(map_cql_translate_error(&e)),
        _ => Err(AppError::Internal(
            "Unexpected result from CQL translation".to_string(),
        )),
    }
}

async fn load_library_elm(
    state: &AppState,
    schema_name: &str,
    library_url: &str,
) -> Result<Value, AppError> {
    let sql = build_cql_library_sql(schema_name, library_url);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => {
            let raw = rows
                .first()
                .and_then(|r| r.first())
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::NotFound(format!("Library not found: {}", library_url))
                })?;

            let library: Value = serde_json::from_str(raw)
                .map_err(|e| {
                    eprintln!("[fhir] Invalid Library JSON: {}", e);
                    AppError::Internal("Invalid Library JSON".to_string())
                })?;

            extract_elm_from_library_content(&library)
        }
        QueryResult::Error(e) => {
            if e.contains("does not exist") || e.contains("Table") {
                Err(AppError::NotFound(
                    "Library resource type not available in this dataset".to_string(),
                ))
            } else {
                eprintln!("[fhir] Failed to query Library: {}", e);
                Err(AppError::Internal(
                    "Failed to query Library".to_string(),
                ))
            }
        }
        _ => Err(AppError::NotFound(format!(
            "Library not found: {}",
            library_url
        ))),
    }
}

fn base64_decode(input: &str) -> Result<String, String> {
    let chars: Vec<u8> = input.bytes().filter(|b| *b != b'\n' && *b != b'\r' && *b != b' ').collect();
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
        let a = if chars[i] == b'=' { 0 } else { decode_char(chars[i], table)? };
        let b = if i + 1 < chars.len() && chars[i + 1] != b'=' { decode_char(chars[i + 1], table)? } else { 0 };
        let c = if i + 2 < chars.len() && chars[i + 2] != b'=' { decode_char(chars[i + 2], table)? } else { 0 };
        let d = if i + 3 < chars.len() && chars[i + 3] != b'=' { decode_char(chars[i + 3], table)? } else { 0 };

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

fn build_parameters_response(
    library: &ElmLibrary,
    columns: &[String],
    rows: &[Vec<Value>],
) -> Value {
    // Result name comes from the last non-Patient expression.
    let result_name = library
        .statements
        .as_ref()
        .and_then(|s| {
            s.defs
                .iter()
                .rev()
                .find(|d| d.name != "Patient")
                .map(|d| d.name.as_str())
        })
        .unwrap_or("result");

    let mut parameters = Vec::new();

    if !rows.is_empty() && !columns.is_empty() {
        // Prefer _raw column for resource results; fall back to column 0
        let value_col_idx = columns
            .iter()
            .position(|c| c == "_raw")
            .unwrap_or(0);

        let values: Vec<&Value> = rows
            .iter()
            .filter_map(|row| row.get(value_col_idx))
            .collect();

        if values.len() == 1 {
            parameters.push(json!({
                "name": result_name,
                "valueString": values[0].to_string()
            }));
        } else if !values.is_empty() {
            let parts: Vec<Value> = values
                .iter()
                .map(|v| {
                    json!({
                        "name": "result",
                        "valueString": v.to_string()
                    })
                })
                .collect();
            parameters.push(json!({
                "name": result_name,
                "part": parts
            }));
        }
    }

    json!({
        "resourceType": "Parameters",
        "parameter": parameters
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cql::elm_types::ElmLibrary;
    use serde_json::json;

    fn empty_library() -> ElmLibrary {
        ElmLibrary {
            identifier: None,
            parameters: None,
            statements: None,
            includes: None,
            usings: None,
            valueSets: None,
            codeSystems: None,
            codes: None,
            contexts: None,
        }
    }

    #[test]
    fn base64_decodes_ascii() {
        assert_eq!(base64_decode("aGVsbG8=").unwrap(), "hello");
        assert_eq!(base64_decode("aGVsbG8gd29ybGQ=").unwrap(), "hello world");
    }

    #[test]
    fn base64_decodes_no_padding() {
        assert_eq!(base64_decode("Zm9v").unwrap(), "foo");
    }

    #[test]
    fn base64_decodes_ignoring_whitespace() {
        assert_eq!(base64_decode("aGVs\nbG8=").unwrap(), "hello");
        assert_eq!(base64_decode("aGVs bG8=").unwrap(), "hello");
    }

    #[test]
    fn base64_rejects_invalid_char() {
        assert!(base64_decode("aGVsbG8!").is_err());
    }

    #[test]
    fn build_parameters_response_empty_rows() {
        let lib = empty_library();
        let v = build_parameters_response(&lib, &[], &[]);
        assert_eq!(v["resourceType"], "Parameters");
        assert_eq!(v["parameter"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn build_parameters_response_single_row_uses_raw_column() {
        let lib = empty_library();
        let columns = vec!["_id".to_string(), "_raw".to_string()];
        let rows = vec![vec![json!("p1"), json!({"resourceType": "Patient"})]];
        let v = build_parameters_response(&lib, &columns, &rows);
        let p = &v["parameter"][0];
        assert!(p["valueString"].as_str().unwrap().contains("Patient"));
    }

    #[test]
    fn build_parameters_response_multiple_rows_creates_parts() {
        let lib = empty_library();
        let columns = vec!["v".to_string()];
        let rows = vec![vec![json!("a")], vec![json!("b")]];
        let v = build_parameters_response(&lib, &columns, &rows);
        let parts = v["parameter"][0]["part"].as_array().unwrap();
        assert_eq!(parts.len(), 2);
    }

    #[test]
    fn cql_translate_sql_escapes_quotes() {
        let sql = build_cql_translate_sql("define x: 'foo'");
        assert_eq!(sql, "SELECT trex_fhir_cql_translate('define x: ''foo''')");
    }

    #[test]
    fn cql_translate_sql_basic() {
        let sql = build_cql_translate_sql("define x: 1");
        assert_eq!(sql, "SELECT trex_fhir_cql_translate('define x: 1')");
    }

    #[test]
    fn cql_library_sql_includes_url_filter() {
        let sql = build_cql_library_sql("\"db\".\"ds\"", "urn:lib");
        assert!(sql.contains("'urn:lib'"));
        assert!(sql.contains("\"library\""));
        assert!(sql.contains("LIMIT 1"));
    }

    #[test]
    fn unwrap_elm_library_with_library_key() {
        let elm = json!({"library": {"identifier": {"id": "L1"}}});
        let inner = unwrap_elm_library(elm);
        assert_eq!(inner["identifier"]["id"], "L1");
    }

    #[test]
    fn unwrap_elm_library_without_library_key() {
        let elm = json!({"identifier": {"id": "L1"}});
        let inner = unwrap_elm_library(elm);
        assert_eq!(inner["identifier"]["id"], "L1");
    }

    #[test]
    fn map_cql_translate_error_when_extension_missing() {
        let err = map_cql_translate_error("function trex_fhir_cql_translate does not exist");
        match err {
            AppError::BadRequest(m) => {
                assert!(m.contains("cql2elm extension to be loaded"));
            }
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn map_cql_translate_error_generic() {
        let err = map_cql_translate_error("syntax error at line 5");
        match err {
            AppError::BadRequest(m) => assert!(m.contains("syntax error at line 5")),
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn extract_elm_finds_application_elm_json() {
        // base64 of `{"library":{"identifier":{"id":"L1"}}}`
        let b64 = "eyJsaWJyYXJ5Ijp7ImlkZW50aWZpZXIiOnsiaWQiOiJMMSJ9fX0=";
        let lib = json!({
            "content": [
                {"contentType": "text/cql", "data": "ignored"},
                {"contentType": "application/elm+json", "data": b64}
            ]
        });
        let elm = extract_elm_from_library_content(&lib).unwrap();
        // returns the outer JSON (library wrapper preserved)
        assert_eq!(elm["library"]["identifier"]["id"], "L1");
    }

    #[test]
    fn extract_elm_errors_when_no_content() {
        let lib = json!({"resourceType": "Library"});
        let err = extract_elm_from_library_content(&lib).unwrap_err();
        match err {
            AppError::BadRequest(m) => assert!(m.contains("no content")),
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn extract_elm_errors_when_no_elm_json() {
        let lib = json!({
            "content": [{"contentType": "text/cql", "data": "ignored"}]
        });
        let err = extract_elm_from_library_content(&lib).unwrap_err();
        match err {
            AppError::BadRequest(m) => assert!(m.contains("application/elm+json")),
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn extract_elm_errors_on_bad_base64() {
        let lib = json!({
            "content": [{"contentType": "application/elm+json", "data": "!!!"}]
        });
        let err = extract_elm_from_library_content(&lib).unwrap_err();
        match err {
            AppError::BadRequest(m) => assert!(m.contains("Invalid base64")),
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn extract_elm_errors_on_bad_elm_json() {
        // base64 of "not json"
        let b64 = "bm90IGpzb24=";
        let lib = json!({
            "content": [{"contentType": "application/elm+json", "data": b64}]
        });
        let err = extract_elm_from_library_content(&lib).unwrap_err();
        match err {
            AppError::BadRequest(m) => assert!(m.contains("Invalid ELM JSON")),
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }
}
