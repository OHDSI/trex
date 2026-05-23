use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::structure_definition::DefinitionRegistry;
use crate::query_executor::{QueryResult, RequestConn};
use crate::sql_safety::validate_dataset_id;
use crate::state::AppState;

/// Validate that a create-dataset id contains only alphanumeric and hyphen characters.
pub fn validate_create_dataset_id(id: &str) -> Result<(), AppError> {
    if id.is_empty()
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        Err(AppError::BadRequest(
            "Dataset ID must contain only alphanumeric characters and hyphens".to_string(),
        ))
    } else {
        Ok(())
    }
}

/// Build the DDL that creates the `_history` table inside a dataset schema.
pub fn build_history_ddl(qualified_schema: &str) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS {schema}._history (
            _id VARCHAR NOT NULL,
            _resource_type VARCHAR NOT NULL,
            _version_id INTEGER NOT NULL,
            _last_updated TIMESTAMP NOT NULL,
            _raw JSON NOT NULL,
            _is_deleted BOOLEAN NOT NULL DEFAULT false,
            PRIMARY KEY (_id, _version_id)
        )",
        schema = qualified_schema
    )
}

/// Build the DDL that creates the `_valueset_expansion` table.
pub fn build_valueset_expansion_ddl(qualified_schema: &str) -> String {
    format!(
        "CREATE TABLE IF NOT EXISTS {}._valueset_expansion (
            valueset_url VARCHAR NOT NULL,
            valueset_version VARCHAR,
            code VARCHAR NOT NULL,
            system VARCHAR NOT NULL,
            display VARCHAR
        )",
        qualified_schema
    )
}

/// Build the comma-separated SQL list literal of properly-escaped resource type names
/// used inside `INSERT INTO ... _datasets (..., [..])`.
pub fn build_resource_types_sql_list(types: &[String]) -> String {
    types
        .iter()
        .map(|t| format!("'{}'", t.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Build the `INSERT INTO ..._datasets` SQL (with `$1`/`$2` placeholders for id/name).
pub fn build_insert_dataset_sql(meta_schema: &str, resource_types_sql: &str) -> String {
    format!(
        "INSERT INTO {meta}._datasets (id, name, status, resource_types) VALUES ($1, $2, 'active', [{list}])",
        meta = meta_schema,
        list = resource_types_sql,
    )
}

/// Build the success response body for create_dataset.
pub fn build_create_dataset_response(
    id: &str,
    name: &str,
    created_types: &[String],
    errors: &[String],
) -> Value {
    let mut response = json!({
        "id": id,
        "name": name,
        "status": "active",
        "resource_types": created_types,
        "resource_count": created_types.len()
    });

    if !errors.is_empty() {
        response["warnings"] = json!(errors);
    }

    response
}

/// Map (columns, row) into a serde_json object using column names as keys.
pub fn row_to_dataset_object(columns: &[String], row: &[Value]) -> Value {
    let mut obj = serde_json::Map::new();
    for (i, col) in columns.iter().enumerate() {
        if let Some(val) = row.get(i) {
            obj.insert(col.clone(), val.clone());
        }
    }
    Value::Object(obj)
}

/// Classify a dataset status string for delete_dataset preconditions.
/// Returns Err(Conflict) if the dataset is busy.
pub fn check_dataset_deletable(status: &str, dataset_id: &str) -> Result<(), AppError> {
    if status == "deleting" || status == "exporting" {
        Err(AppError::Conflict(format!(
            "Dataset '{}' has active operations (status: {})",
            dataset_id, status
        )))
    } else {
        Ok(())
    }
}

/// Determine whether an INSERT error message indicates a duplicate-key violation.
pub fn is_duplicate_dataset_error(msg: &str) -> bool {
    msg.contains("Duplicate") || msg.contains("duplicate") || msg.contains("UNIQUE")
}

/// Build the SELECT that returns a dataset's `id` and `name` for list/get queries.
pub fn build_select_dataset_sql(meta_schema: &str, dataset_id: &str) -> String {
    format!(
        "SELECT id, name, status, created_at, resource_types FROM {}._datasets WHERE id = '{}'",
        meta_schema,
        dataset_id.replace('\'', "''")
    )
}

/// Build the SELECT used by `delete_dataset` to fetch the status column.
pub fn build_select_dataset_status_sql(meta_schema: &str, dataset_id: &str) -> String {
    format!(
        "SELECT status FROM {}._datasets WHERE id = '{}'",
        meta_schema,
        dataset_id.replace('\'', "''")
    )
}

/// Build the UPDATE that marks a dataset row as `status = 'deleting'`.
pub fn build_mark_deleting_sql(meta_schema: &str, dataset_id: &str) -> String {
    format!(
        "UPDATE {}._datasets SET status = 'deleting' WHERE id = '{}'",
        meta_schema,
        dataset_id.replace('\'', "''")
    )
}

/// Build the DROP SCHEMA statement (always with `IF EXISTS ... CASCADE`).
pub fn build_drop_schema_sql(qualified_schema: &str) -> String {
    format!("DROP SCHEMA IF EXISTS {} CASCADE", qualified_schema)
}

/// Build the DELETE from `_datasets` statement.
pub fn build_delete_dataset_row_sql(meta_schema: &str, dataset_id: &str) -> String {
    format!(
        "DELETE FROM {}._datasets WHERE id = '{}'",
        meta_schema,
        dataset_id.replace('\'', "''")
    )
}

/// Build the UPDATE that appends new resource types to the dataset's `resource_types` list.
pub fn build_update_dataset_types_sql(
    meta_schema: &str,
    dataset_id: &str,
    new_types_sql: &str,
) -> String {
    format!(
        "UPDATE {}._datasets SET resource_types = list_concat(resource_types, [{}]) WHERE id = '{}'",
        meta_schema,
        new_types_sql,
        dataset_id.replace('\'', "''")
    )
}

/// Build the JSON response body for update_dataset (added types + skipped count).
pub fn build_update_dataset_response(
    dataset_id: &str,
    added: &[String],
    total_requested: usize,
) -> Value {
    json!({
        "id": dataset_id,
        "added_types": added,
        "skipped": total_requested - added.len()
    })
}

#[derive(Deserialize)]
pub struct CreateDatasetRequest {
    pub id: String,
    pub name: String,
    pub structure_definitions: Option<Value>,
}

pub async fn create_dataset(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateDatasetRequest>,
) -> Result<impl IntoResponse, AppError> {
    validate_create_dataset_id(&body.id)?;

    let qualified_schema = state.qualified_schema(&body.id);

    let (resource_type_names, custom_definitions) = if let Some(ref sd_bundle) = body.structure_definitions {
        parse_custom_definitions(sd_bundle)?
    } else {
        let names = state.registry.resource_type_names();
        if names.is_empty() {
            return Err(AppError::Internal(
                "No FHIR definitions loaded on server".to_string(),
            ));
        }
        (names, None)
    };

    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    create_dataset_inner(&state, &conn, body, resource_type_names, custom_definitions, qualified_schema).await
}

async fn create_dataset_inner(
    state: &Arc<AppState>,
    conn: &RequestConn,
    body: CreateDatasetRequest,
    resource_type_names: Vec<String>,
    custom_definitions: Option<DefinitionRegistry>,
    qualified_schema: String,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let create_schema_sql = format!("CREATE SCHEMA IF NOT EXISTS {}", qualified_schema);
    if let QueryResult::Error(e) = conn.execute(create_schema_sql).await {
        eprintln!("[fhir] Failed to create schema: {}", e);
        return Err(AppError::Internal("Failed to create schema".to_string()));
    }

    if let QueryResult::Error(e) = conn.execute(build_history_ddl(&qualified_schema)).await {
        eprintln!("[fhir] Failed to create _history table: {}", e);
        return Err(AppError::Internal(
            "Failed to create _history table".to_string(),
        ));
    }

    if let QueryResult::Error(e) = conn.execute(build_valueset_expansion_ddl(&qualified_schema)).await {
        eprintln!("[fhir] Failed to create _valueset_expansion table: {}", e);
        return Err(AppError::Internal(
            "Failed to create _valueset_expansion table".to_string(),
        ));
    }

    let mut created_types = Vec::new();
    let mut errors = Vec::new();

    if let Some(ref custom_defs) = custom_definitions {
        for type_name in &resource_type_names {
            match crate::schema::generator::generate_ddl(custom_defs, type_name, &qualified_schema) {
                Ok(ddl) => match conn.execute(ddl).await {
                    QueryResult::Error(e) => {
                        errors.push(format!("{}: {}", type_name, e));
                    }
                    _ => {
                        created_types.push(type_name.clone());
                    }
                },
                Err(e) => {
                    errors.push(format!("{}: {}", type_name, e));
                }
            }
        }
    } else {
        for type_name in &resource_type_names {
            match state.registry.get_ddl(type_name, &qualified_schema) {
                Ok(ddl) => match conn.execute(ddl).await {
                    QueryResult::Error(e) => {
                        errors.push(format!("{}: {}", type_name, e));
                    }
                    _ => {
                        created_types.push(type_name.clone());
                    }
                },
                Err(e) => {
                    errors.push(format!("{}: {}", type_name, e));
                }
            }
        }
    }

    if created_types.is_empty() {
        let _ = conn
            .execute(format!("DROP SCHEMA IF EXISTS {} CASCADE", qualified_schema))
            .await;
        eprintln!("[fhir] Failed to create any resource tables: {}", errors.join("; "));
        return Err(AppError::Internal(
            "Failed to create any resource tables".to_string(),
        ));
    }

    let resource_types_sql = build_resource_types_sql_list(&created_types);

    let meta = state.meta_schema();
    let insert_sql = build_insert_dataset_sql(&meta, &resource_types_sql);

    if let QueryResult::Error(e) = conn.execute_params(insert_sql, vec![body.id.clone(), body.name.clone()]).await {
        if is_duplicate_dataset_error(&e) {
            return Err(AppError::BadRequest(format!(
                "Dataset '{}' already exists",
                body.id
            )));
        }
        eprintln!("[fhir] Failed to register dataset: {}", e);
        return Err(AppError::Internal(
            "Failed to register dataset".to_string(),
        ));
    }

    let response = build_create_dataset_response(&body.id, &body.name, &created_types, &errors);
    Ok((StatusCode::CREATED, Json(response)))
}

fn parse_custom_definitions(
    bundle: &Value,
) -> Result<(Vec<String>, Option<DefinitionRegistry>), AppError> {
    let resource_type = bundle
        .get("resourceType")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if resource_type != "Bundle" {
        return Err(AppError::BadRequest(
            "structure_definitions must be a FHIR Bundle".to_string(),
        ));
    }

    let entries = bundle
        .get("entry")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::BadRequest("Bundle missing 'entry' array".to_string()))?;

    if entries.is_empty() {
        return Err(AppError::BadRequest(
            "structure_definitions Bundle is empty".to_string(),
        ));
    }

    let bundle_str = serde_json::to_string(bundle).map_err(|e| {
        eprintln!("[fhir] Failed to serialize custom definitions: {}", e);
        AppError::Internal("Failed to serialize custom definitions".to_string())
    })?;

    let empty_types = r#"{"resourceType":"Bundle","type":"collection","entry":[]}"#;

    let registry = DefinitionRegistry::load_from_json(&bundle_str, empty_types)
        .map_err(|e| AppError::BadRequest(format!("Invalid StructureDefinitions: {}", e)))?;

    let names = registry.resource_type_names();
    if names.is_empty() {
        return Err(AppError::BadRequest(
            "No valid resource StructureDefinitions found in Bundle".to_string(),
        ));
    }

    Ok((names, Some(registry)))
}

pub async fn list_datasets(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let meta = state.meta_schema();
    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let result = conn
        .execute(format!(
            "SELECT id, name, status, created_at, resource_types FROM {}._datasets",
            meta
        ))
        .await;

    match result {
        QueryResult::Select { rows, columns } => {
            let datasets: Vec<Value> = rows
                .iter()
                .map(|row| row_to_dataset_object(&columns, row))
                .collect();
            Ok(Json(Value::Array(datasets)))
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] Failed to list datasets: {}", e);
            Err(AppError::Internal("Failed to list datasets".to_string()))
        }
        _ => Ok(Json(json!([]))),
    }
}

pub async fn get_dataset(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let meta = state.meta_schema();
    let sql = build_select_dataset_sql(&meta, &dataset_id);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    let result = conn.execute(sql).await;

    match result {
        QueryResult::Select { rows, columns } => {
            if rows.is_empty() {
                return Err(AppError::NotFound(format!(
                    "Dataset '{}' not found",
                    dataset_id
                )));
            }
            Ok(Json(row_to_dataset_object(&columns, &rows[0])))
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] Failed to get dataset: {}", e);
            Err(AppError::Internal("Failed to get dataset".to_string()))
        }
        _ => Err(AppError::NotFound(format!(
            "Dataset '{}' not found",
            dataset_id
        ))),
    }
}

pub async fn delete_dataset(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let meta = state.meta_schema();
    let check_sql = build_select_dataset_status_sql(&meta, &dataset_id);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(check_sql).await {
        QueryResult::Select { rows, columns } => {
            if rows.is_empty() {
                return Err(AppError::NotFound(format!(
                    "Dataset '{}' not found",
                    dataset_id
                )));
            }
            if let Some(status_idx) = columns.iter().position(|c| c == "status") {
                if let Some(status) = rows[0].get(status_idx).and_then(|v| v.as_str()) {
                    check_dataset_deletable(status, &dataset_id)?;
                }
            }
        }
        QueryResult::Error(e) => {
            eprintln!("[fhir] Failed to check dataset: {}", e);
            return Err(AppError::Internal(
                "Failed to check dataset".to_string(),
            ));
        }
        _ => {
            return Err(AppError::NotFound(format!(
                "Dataset '{}' not found",
                dataset_id
            )));
        }
    }

    let _ = conn.execute(build_mark_deleting_sql(&meta, &dataset_id)).await;

    let qualified_schema = state.qualified_schema(&dataset_id);
    if let QueryResult::Error(e) = conn.execute(build_drop_schema_sql(&qualified_schema)).await {
        eprintln!("[fhir] Failed to drop schema: {}", e);
        return Err(AppError::Internal(
            "Failed to drop schema".to_string(),
        ));
    }

    let delete_sql = build_delete_dataset_row_sql(&meta, &dataset_id);
    if let QueryResult::Error(e) = conn.execute(delete_sql).await {
        eprintln!("[fhir] Failed to delete dataset record: {}", e);
        return Err(AppError::Internal(
            "Failed to delete dataset record".to_string(),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_dataset(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let meta = state.meta_schema();
    let check_sql = crate::handlers::metadata::build_dataset_exists_sql(&meta, &dataset_id);

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    match conn.execute(check_sql).await {
        QueryResult::Select { rows, .. } if !rows.is_empty() => {}
        _ => {
            return Err(AppError::NotFound(format!(
                "Dataset '{}' not found",
                dataset_id
            )));
        }
    }

    let sd_bundle = body
        .get("structure_definitions")
        .ok_or_else(|| AppError::BadRequest("Missing 'structure_definitions' field".to_string()))?;

    let (new_types, custom_defs) = parse_custom_definitions(sd_bundle)?;
    let qualified_schema = state.qualified_schema(&dataset_id);

    let mut added = Vec::new();
    let registry = custom_defs.as_ref().ok_or_else(|| {
        AppError::Internal("Expected custom definitions from parsed bundle".to_string())
    })?;

    for type_name in &new_types {
        match crate::schema::generator::generate_ddl(registry, type_name, &qualified_schema) {
            Ok(ddl) => {
                match conn.execute(ddl).await {
                    QueryResult::Error(e) => {
                        eprintln!("[fhir] Failed to create table for {}: {}", type_name, e);
                        return Err(AppError::Internal(format!(
                            "Failed to create table for {}",
                            type_name
                        )));
                    }
                    _ => added.push(type_name.clone()),
                }
            }
            Err(e) => {
                eprintln!("[fhir] Failed to generate DDL for {}: {}", type_name, e);
                return Err(AppError::Internal(format!(
                    "Failed to generate DDL for {}",
                    type_name
                )));
            }
        }
    }

    if !added.is_empty() {
        let new_types_sql = build_resource_types_sql_list(&added);
        let _ = conn
            .execute(build_update_dataset_types_sql(&meta, &dataset_id, &new_types_sql))
            .await;
    }

    Ok(Json(build_update_dataset_response(&dataset_id, &added, new_types.len())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn err_msg(res: Result<(Vec<String>, Option<DefinitionRegistry>), AppError>) -> String {
        match res {
            Err(AppError::BadRequest(m)) => m,
            Err(other) => panic!("expected BadRequest, got other AppError: {:?}", other),
            Ok(_) => panic!("expected BadRequest, got Ok"),
        }
    }

    #[test]
    fn rejects_non_bundle_resource() {
        let v = json!({"resourceType": "Patient"});
        let msg = err_msg(parse_custom_definitions(&v));
        assert!(msg.contains("must be a FHIR Bundle"), "got: {}", msg);
    }

    #[test]
    fn rejects_bundle_without_entry_array() {
        let v = json!({"resourceType": "Bundle"});
        let msg = err_msg(parse_custom_definitions(&v));
        assert!(msg.contains("Bundle missing 'entry' array"), "got: {}", msg);
    }

    #[test]
    fn rejects_empty_bundle() {
        let v = json!({"resourceType": "Bundle", "entry": []});
        let msg = err_msg(parse_custom_definitions(&v));
        assert!(msg.contains("is empty"), "got: {}", msg);
    }

    #[test]
    fn rejects_bundle_with_no_structure_definitions() {
        let v = json!({
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "id": "x"}}
            ]
        });
        let msg = err_msg(parse_custom_definitions(&v));
        assert!(
            msg.contains("Invalid StructureDefinitions") || msg.contains("No valid resource"),
            "got: {}",
            msg
        );
    }

    #[test]
    fn validate_create_dataset_id_accepts_valid() {
        assert!(validate_create_dataset_id("ds").is_ok());
        assert!(validate_create_dataset_id("ds-1").is_ok());
        assert!(validate_create_dataset_id("Abc123").is_ok());
    }

    #[test]
    fn validate_create_dataset_id_rejects_invalid() {
        assert!(validate_create_dataset_id("").is_err());
        assert!(validate_create_dataset_id("a b").is_err());
        assert!(validate_create_dataset_id("a'b").is_err());
        assert!(validate_create_dataset_id("a_b").is_err());
        assert!(validate_create_dataset_id("a.b").is_err());
    }

    #[test]
    fn history_ddl_contains_required_columns() {
        let sql = build_history_ddl("\"db\".\"ds\"");
        assert!(sql.contains("CREATE TABLE IF NOT EXISTS \"db\".\"ds\"._history"));
        for col in &["_id", "_resource_type", "_version_id", "_last_updated", "_raw", "_is_deleted"] {
            assert!(sql.contains(col), "missing column: {}", col);
        }
        assert!(sql.contains("PRIMARY KEY"));
    }

    #[test]
    fn valueset_expansion_ddl_contains_required_columns() {
        let sql = build_valueset_expansion_ddl("\"db\".\"ds\"");
        assert!(sql.contains("_valueset_expansion"));
        for col in &["valueset_url", "valueset_version", "code", "system", "display"] {
            assert!(sql.contains(col), "missing column: {}", col);
        }
    }

    #[test]
    fn resource_types_sql_list_escapes_quotes() {
        let list = build_resource_types_sql_list(&[
            "Patient".to_string(),
            "Observ'tion".to_string(),
        ]);
        assert_eq!(list, "'Patient', 'Observ''tion'");
    }

    #[test]
    fn resource_types_sql_list_empty() {
        assert_eq!(build_resource_types_sql_list(&[]), "");
    }

    #[test]
    fn insert_dataset_sql_uses_placeholders() {
        let sql = build_insert_dataset_sql("\"db\".\"_fhir_meta\"", "'Patient', 'Observation'");
        assert!(sql.contains("INSERT INTO \"db\".\"_fhir_meta\"._datasets"));
        assert!(sql.contains("$1"));
        assert!(sql.contains("$2"));
        assert!(sql.contains("['Patient', 'Observation']"));
        assert!(sql.contains("'active'"));
    }

    #[test]
    fn create_response_includes_basic_fields() {
        let resp = build_create_dataset_response("ds", "My DS", &["Patient".to_string()], &[]);
        assert_eq!(resp["id"], "ds");
        assert_eq!(resp["name"], "My DS");
        assert_eq!(resp["status"], "active");
        assert_eq!(resp["resource_count"], 1);
        assert!(resp.get("warnings").is_none());
    }

    #[test]
    fn create_response_includes_warnings_when_present() {
        let errors = vec!["Foo: oops".to_string()];
        let resp = build_create_dataset_response("ds", "My DS", &["Patient".to_string()], &errors);
        assert!(resp["warnings"].is_array());
        assert_eq!(resp["warnings"][0], "Foo: oops");
    }

    #[test]
    fn row_to_dataset_object_zips_columns_and_row() {
        let cols = vec!["id".to_string(), "name".to_string()];
        let row = vec![json!("d1"), json!("Demo")];
        let obj = row_to_dataset_object(&cols, &row);
        assert_eq!(obj["id"], "d1");
        assert_eq!(obj["name"], "Demo");
    }

    #[test]
    fn row_to_dataset_object_handles_shorter_row() {
        let cols = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let row = vec![json!(1)]; // missing b, c
        let obj = row_to_dataset_object(&cols, &row);
        assert_eq!(obj["a"], 1);
        assert!(obj.get("b").is_none());
    }

    #[test]
    fn check_dataset_deletable_blocks_busy_states() {
        assert!(check_dataset_deletable("deleting", "ds").is_err());
        assert!(check_dataset_deletable("exporting", "ds").is_err());
    }

    #[test]
    fn check_dataset_deletable_allows_other_states() {
        assert!(check_dataset_deletable("active", "ds").is_ok());
        assert!(check_dataset_deletable("paused", "ds").is_ok());
        assert!(check_dataset_deletable("", "ds").is_ok());
    }

    #[test]
    fn is_duplicate_dataset_error_matches_common_variants() {
        assert!(is_duplicate_dataset_error("Duplicate key value"));
        assert!(is_duplicate_dataset_error("violates UNIQUE constraint"));
        assert!(is_duplicate_dataset_error("duplicate row"));
        assert!(!is_duplicate_dataset_error("some other error"));
    }

    #[test]
    fn select_dataset_sql_contains_columns_and_filter() {
        let sql = build_select_dataset_sql("\"db\".\"m\"", "ds1");
        assert!(sql.contains("id, name, status, created_at, resource_types"));
        assert!(sql.contains("\"db\".\"m\"._datasets"));
        assert!(sql.contains("WHERE id = 'ds1'"));
    }

    #[test]
    fn select_dataset_sql_escapes_quotes() {
        let sql = build_select_dataset_sql("\"m\"", "d's");
        assert!(sql.contains("'d''s'"));
    }

    #[test]
    fn select_dataset_status_sql() {
        let sql = build_select_dataset_status_sql("\"m\"", "ds1");
        assert!(sql.starts_with("SELECT status FROM \"m\"._datasets"));
        assert!(sql.contains("'ds1'"));
    }

    #[test]
    fn mark_deleting_sql() {
        let sql = build_mark_deleting_sql("\"m\"", "ds1");
        assert!(sql.contains("UPDATE \"m\"._datasets"));
        assert!(sql.contains("status = 'deleting'"));
        assert!(sql.contains("WHERE id = 'ds1'"));
    }

    #[test]
    fn drop_schema_sql_has_cascade() {
        let sql = build_drop_schema_sql("\"db\".\"ds\"");
        assert_eq!(sql, "DROP SCHEMA IF EXISTS \"db\".\"ds\" CASCADE");
    }

    #[test]
    fn delete_dataset_row_sql() {
        let sql = build_delete_dataset_row_sql("\"m\"", "ds1");
        assert!(sql.starts_with("DELETE FROM \"m\"._datasets"));
        assert!(sql.contains("WHERE id = 'ds1'"));
    }

    #[test]
    fn update_dataset_types_sql_uses_list_concat() {
        let sql = build_update_dataset_types_sql("\"m\"", "ds1", "'Patient', 'Observation'");
        assert!(sql.contains("UPDATE \"m\"._datasets"));
        assert!(sql.contains("list_concat(resource_types, ['Patient', 'Observation'])"));
        assert!(sql.contains("WHERE id = 'ds1'"));
    }

    #[test]
    fn update_dataset_response_includes_skipped_count() {
        let resp = build_update_dataset_response(
            "ds1",
            &["Patient".to_string(), "Observation".to_string()],
            5,
        );
        assert_eq!(resp["id"], "ds1");
        assert_eq!(resp["added_types"][0], "Patient");
        assert_eq!(resp["skipped"], 3);
    }

    #[test]
    fn update_dataset_response_zero_skipped() {
        let resp = build_update_dataset_response("ds1", &["Patient".to_string()], 1);
        assert_eq!(resp["skipped"], 0);
    }
}
