use serde_json::{json, Value};

use crate::query_executor::{QueryResult, RequestConn};
use crate::sql_safety::to_qualified_schema;

/// Build the INSERT that creates a new export-job row.
pub fn build_create_job_sql(
    meta_schema: &str,
    job_id: &str,
    dataset_id: &str,
    resource_types: Option<&[String]>,
) -> String {
    let types_str = resource_types.map(|ts| ts.join(",")).unwrap_or_default();
    format!(
        "INSERT INTO {meta}._export_jobs (id, dataset_id, status, resource_types, created_at) \
         VALUES ('{id}', '{ds}', 'accepted', '{types}', CURRENT_TIMESTAMP)",
        meta = meta_schema,
        id = job_id,
        ds = dataset_id.replace('\'', "''"),
        types = types_str.replace('\'', "''")
    )
}

/// Build the SELECT that fetches a job by id.
pub fn build_get_job_sql(meta_schema: &str, job_id: &str) -> String {
    format!(
        "SELECT id, dataset_id, status, resource_types, created_at, completed_at, output_files, error_message \
         FROM {}._export_jobs WHERE id = '{}'",
        meta_schema,
        job_id.replace('\'', "''")
    )
}

/// Build the UPDATE statement that mutates a job's status (+ optional output_files / error_message).
pub fn build_update_job_sql(
    meta_schema: &str,
    job_id: &str,
    status: ExportStatus,
    output_files: Option<&str>,
    error_message: Option<&str>,
) -> String {
    let mut updates = vec![format!("status = '{}'", status.as_str())];

    if status == ExportStatus::Complete || status == ExportStatus::Error {
        updates.push("completed_at = CURRENT_TIMESTAMP".to_string());
    }

    if let Some(files) = output_files {
        updates.push(format!("output_files = '{}'", files.replace('\'', "''")));
    }

    if let Some(err) = error_message {
        updates.push(format!("error_message = '{}'", err.replace('\'', "''")));
    }

    format!(
        "UPDATE {}._export_jobs SET {} WHERE id = '{}'",
        meta_schema,
        updates.join(", "),
        job_id.replace('\'', "''")
    )
}

/// Build the SELECT that pulls `_raw` rows from a resource table for export.
pub fn build_export_select_sql(schema_name: &str, resource_type: &str) -> String {
    format!(
        "SELECT _raw FROM {}.\"{}\" WHERE NOT _is_deleted",
        schema_name,
        resource_type.to_lowercase()
    )
}

/// Build the per-resource-type entry in the export `output` array.
pub fn build_export_output_entry(
    dataset_id: &str,
    resource_type: &str,
    job_id: &str,
    count: usize,
) -> Value {
    json!({
        "type": resource_type,
        "url": format!("/{}/{}/$export/{}/{}.ndjson", dataset_id, resource_type, job_id, resource_type.to_lowercase()),
        "count": count
    })
}

/// Map a `(columns, row)` pair returned from `_export_jobs` into a JSON object keyed by column name.
pub fn row_to_job_object(columns: &[String], row: &[Value]) -> Value {
    let mut job = serde_json::Map::new();
    for (i, col) in columns.iter().enumerate() {
        if let Some(val) = row.get(i) {
            job.insert(col.clone(), val.clone());
        }
    }
    Value::Object(job)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ExportStatus {
    Accepted,
    InProgress,
    Complete,
    Error,
}

impl ExportStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExportStatus::Accepted => "accepted",
            ExportStatus::InProgress => "in-progress",
            ExportStatus::Complete => "complete",
            ExportStatus::Error => "error",
        }
    }
}

pub async fn create_export_job(
    conn: &RequestConn,
    dataset_id: &str,
    resource_types: Option<&[String]>,
    meta_schema: &str,
) -> Result<String, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let sql = build_create_job_sql(meta_schema, &job_id, dataset_id, resource_types);

    match conn.execute(sql).await {
        QueryResult::Error(e) => Err(format!("Failed to create export job: {}", e)),
        _ => Ok(job_id),
    }
}

pub async fn get_export_job(
    conn: &RequestConn,
    job_id: &str,
    meta_schema: &str,
) -> Result<Option<Value>, String> {
    let sql = build_get_job_sql(meta_schema, job_id);

    match conn.execute(sql).await {
        QueryResult::Select { columns, rows } => {
            if rows.is_empty() {
                return Ok(None);
            }
            Ok(Some(row_to_job_object(&columns, &rows[0])))
        }
        QueryResult::Error(e) => Err(format!("Failed to query export job: {}", e)),
        _ => Ok(None),
    }
}

pub async fn update_export_job_status(
    conn: &RequestConn,
    job_id: &str,
    status: ExportStatus,
    output_files: Option<&str>,
    error_message: Option<&str>,
    meta_schema: &str,
) -> Result<(), String> {
    let sql = build_update_job_sql(meta_schema, job_id, status, output_files, error_message);

    match conn.execute(sql).await {
        QueryResult::Error(e) => Err(format!("Failed to update export job: {}", e)),
        _ => Ok(()),
    }
}

/// Execute an export job. Owns its own RequestConn so the connection lives for
/// the entire background job, independent of the originating HTTP request.
pub async fn execute_export(
    dataset_id: &str,
    job_id: &str,
    resource_types: &[String],
    db_name: &str,
) -> Result<Vec<(String, usize)>, String> {
    let schema_name = to_qualified_schema(db_name, dataset_id);
    let meta_schema = crate::sql_safety::to_qualified_meta_schema(db_name);
    let mut results = Vec::new();

    let conn = RequestConn::new()?;

    update_export_job_status(&conn, job_id, ExportStatus::InProgress, None, None, &meta_schema).await?;

    for rt in resource_types {
        let sql = build_export_select_sql(&schema_name, rt);

        match conn.execute(sql).await {
            QueryResult::Select { rows, .. } => {
                results.push((rt.clone(), rows.len()));
            }
            QueryResult::Error(e) => {
                if !e.contains("does not exist") {
                    return Err(format!("Export failed for {}: {}", rt, e));
                }
            }
            _ => {}
        }
    }

    let output: Vec<Value> = results
        .iter()
        .filter(|(_, count)| *count > 0)
        .map(|(rt, count)| build_export_output_entry(dataset_id, rt, job_id, *count))
        .collect();

    let output_json = serde_json::to_string(&output).unwrap_or_default();
    update_export_job_status(
        &conn,
        job_id,
        ExportStatus::Complete,
        Some(&output_json),
        None,
        &meta_schema,
    )
    .await?;

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_status_as_str_maps_all_variants() {
        assert_eq!(ExportStatus::Accepted.as_str(), "accepted");
        assert_eq!(ExportStatus::InProgress.as_str(), "in-progress");
        assert_eq!(ExportStatus::Complete.as_str(), "complete");
        assert_eq!(ExportStatus::Error.as_str(), "error");
    }

    #[test]
    fn export_status_partial_eq() {
        assert_eq!(ExportStatus::Accepted, ExportStatus::Accepted);
        assert_ne!(ExportStatus::Accepted, ExportStatus::Complete);
        assert_ne!(ExportStatus::InProgress, ExportStatus::Error);
    }

    #[test]
    fn export_status_clone_copy() {
        let s = ExportStatus::Complete;
        let s2 = s; // Copy
        assert_eq!(s, s2);
        let s3 = s.clone();
        assert_eq!(s, s3);
    }

    #[test]
    fn create_job_sql_includes_types_csv() {
        let types = vec!["Patient".to_string(), "Observation".to_string()];
        let sql = build_create_job_sql("\"db\".\"meta\"", "job1", "ds1", Some(&types));
        assert!(sql.starts_with("INSERT INTO \"db\".\"meta\"._export_jobs"));
        assert!(sql.contains("'job1'"));
        assert!(sql.contains("'ds1'"));
        assert!(sql.contains("'Patient,Observation'"));
        assert!(sql.contains("'accepted'"));
    }

    #[test]
    fn create_job_sql_with_no_types_is_empty_string() {
        let sql = build_create_job_sql("\"db\".\"meta\"", "job1", "ds1", None);
        assert!(sql.contains("''")); // empty types literal
    }

    #[test]
    fn create_job_sql_escapes_dataset_id() {
        let sql = build_create_job_sql("\"m\"", "job1", "ds'1", None);
        assert!(sql.contains("'ds''1'"));
    }

    #[test]
    fn get_job_sql_selects_all_columns() {
        let sql = build_get_job_sql("\"db\".\"meta\"", "abc");
        for col in &["id", "dataset_id", "status", "resource_types", "created_at", "completed_at", "output_files", "error_message"] {
            assert!(sql.contains(col), "missing column: {}", col);
        }
        assert!(sql.contains("'abc'"));
    }

    #[test]
    fn update_sql_status_only() {
        let sql = build_update_job_sql("\"m\"", "j1", ExportStatus::InProgress, None, None);
        assert!(sql.contains("status = 'in-progress'"));
        assert!(!sql.contains("completed_at"));
        assert!(!sql.contains("output_files"));
        assert!(!sql.contains("error_message"));
    }

    #[test]
    fn update_sql_complete_sets_completed_at() {
        let sql = build_update_job_sql("\"m\"", "j1", ExportStatus::Complete, Some("[]"), None);
        assert!(sql.contains("status = 'complete'"));
        assert!(sql.contains("completed_at = CURRENT_TIMESTAMP"));
        assert!(sql.contains("output_files = '[]'"));
    }

    #[test]
    fn update_sql_error_includes_error_message() {
        let sql = build_update_job_sql("\"m\"", "j1", ExportStatus::Error, None, Some("boom"));
        assert!(sql.contains("status = 'error'"));
        assert!(sql.contains("completed_at = CURRENT_TIMESTAMP"));
        assert!(sql.contains("error_message = 'boom'"));
    }

    #[test]
    fn update_sql_escapes_apostrophes() {
        let sql = build_update_job_sql(
            "\"m\"",
            "j1",
            ExportStatus::Error,
            Some("o'k"),
            Some("can't"),
        );
        assert!(sql.contains("'o''k'"));
        assert!(sql.contains("'can''t'"));
    }

    #[test]
    fn export_select_sql_lowercases_table() {
        let sql = build_export_select_sql("\"db\".\"ds\"", "MedicationRequest");
        assert!(sql.contains("\"medicationrequest\""));
        assert!(sql.contains("NOT _is_deleted"));
    }

    #[test]
    fn export_output_entry_url_uses_lowercase_filename() {
        let entry = build_export_output_entry("ds", "Patient", "abc-def", 3);
        assert_eq!(entry["type"], "Patient");
        assert_eq!(entry["count"], 3);
        assert_eq!(
            entry["url"],
            "/ds/Patient/$export/abc-def/patient.ndjson"
        );
    }

    #[test]
    fn job_object_from_row_uses_column_names_as_keys() {
        let cols = vec!["id".to_string(), "status".to_string()];
        let row = vec![json!("j1"), json!("accepted")];
        let obj = row_to_job_object(&cols, &row);
        assert_eq!(obj["id"], "j1");
        assert_eq!(obj["status"], "accepted");
    }
}
