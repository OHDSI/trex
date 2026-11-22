use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::error::AppError;
use crate::query_executor::{QueryResult, RequestConn};
use crate::sql_safety::{
    escape_string, validate_dataset_id, validate_fhir_id, validate_resource_type,
};
use crate::state::AppState;

pub const ALLOW_EXPUNGE_ENV: &str = "FHIR__ALLOW_EXPUNGE";

/// Patient-owned resources removed by `_cascade=delete`: (resource type, Reference element).
/// Subset of the R4 Patient CompartmentDefinition restricted to elements that name the
/// record's subject; actor/author/member links (Group, Appointment, Patient.link …) are
/// left out because they would delete data belonging to other patients.
pub const PATIENT_CASCADE: &[(&str, &str)] = &[
    ("AdverseEvent", "subject"),
    ("AllergyIntolerance", "patient"),
    ("Basic", "subject"),
    ("BodyStructure", "patient"),
    ("CarePlan", "subject"),
    ("CareTeam", "subject"),
    ("ChargeItem", "subject"),
    ("Claim", "patient"),
    ("ClaimResponse", "patient"),
    ("ClinicalImpression", "subject"),
    ("Communication", "subject"),
    ("CommunicationRequest", "subject"),
    ("Composition", "subject"),
    ("Condition", "subject"),
    ("Consent", "patient"),
    ("Coverage", "beneficiary"),
    ("CoverageEligibilityRequest", "patient"),
    ("CoverageEligibilityResponse", "patient"),
    ("DetectedIssue", "patient"),
    ("DeviceRequest", "subject"),
    ("DeviceUseStatement", "subject"),
    ("DiagnosticReport", "subject"),
    ("DocumentManifest", "subject"),
    ("DocumentReference", "subject"),
    ("Encounter", "subject"),
    ("EnrollmentRequest", "candidate"),
    ("EpisodeOfCare", "patient"),
    ("ExplanationOfBenefit", "patient"),
    ("FamilyMemberHistory", "patient"),
    ("Flag", "subject"),
    ("Goal", "subject"),
    ("ImagingStudy", "subject"),
    ("Immunization", "patient"),
    ("ImmunizationEvaluation", "patient"),
    ("ImmunizationRecommendation", "patient"),
    ("Invoice", "subject"),
    ("List", "subject"),
    ("MeasureReport", "subject"),
    ("Media", "subject"),
    ("MedicationAdministration", "subject"),
    ("MedicationDispense", "subject"),
    ("MedicationRequest", "subject"),
    ("MedicationStatement", "subject"),
    ("MolecularSequence", "patient"),
    ("NutritionOrder", "patient"),
    ("Observation", "subject"),
    ("Procedure", "subject"),
    ("QuestionnaireResponse", "subject"),
    ("RelatedPerson", "patient"),
    ("RequestGroup", "subject"),
    ("ResearchSubject", "individual"),
    ("RiskAssessment", "subject"),
    ("ServiceRequest", "subject"),
    ("Specimen", "subject"),
    ("SupplyDelivery", "patient"),
    ("VisionPrescription", "patient"),
];

pub fn parse_allow_flag(value: Option<&str>) -> bool {
    matches!(
        value.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("true" | "1" | "yes")
    )
}

fn expunge_enabled() -> bool {
    parse_allow_flag(std::env::var(ALLOW_EXPUNGE_ENV).ok().as_deref())
}

/// Returns whether `_cascade=delete` was requested; any other `_cascade` value is rejected.
pub fn parse_cascade(params: &HashMap<String, String>) -> Result<bool, AppError> {
    match params.get("_cascade").map(String::as_str) {
        None => Ok(false),
        Some("delete") => Ok(true),
        Some(other) => Err(AppError::BadRequest(format!(
            "Unsupported _cascade value '{}' (only 'delete' is supported)",
            other
        ))),
    }
}

/// WHERE condition matching rows whose `element` references `Patient/{patient_id}`,
/// relative or absolute, optionally version-specific. `patient_id` must already be
/// validated as a FHIR id (alphanumerics, '-', '.', '_').
pub fn build_patient_reference_condition(element: &str, patient_id: &str) -> String {
    format!(
        "regexp_full_match(json_extract_string(_raw, '$.{element}.reference'), \
         '(.*/)?Patient/{id}(/_history/[^/]+)?')",
        element = element,
        id = patient_id.replace('.', "\\."),
    )
}

pub fn build_list_tables_sql(db_name: &str, dataset_id: &str) -> String {
    format!(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_catalog = '{db}' AND table_schema = '{schema}'",
        db = escape_string(db_name),
        schema = escape_string(&dataset_id.replace('-', "_")),
    )
}

pub fn build_expunge_history_by_id_sql(schema_name: &str, resource_type: &str, id: &str) -> String {
    format!(
        "DELETE FROM {schema}._history WHERE _resource_type = '{rtype}' AND _id = '{id}' RETURNING _id",
        schema = schema_name,
        rtype = escape_string(resource_type),
        id = escape_string(id),
    )
}

pub fn build_expunge_by_id_sql(schema_name: &str, resource_type: &str, id: &str) -> String {
    format!(
        "DELETE FROM {schema}.\"{table}\" WHERE _id = '{id}' RETURNING _id",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        id = escape_string(id),
    )
}

/// Removes every history version of matching resources, plus any older version that
/// matched even if the current one no longer does.
pub fn build_expunge_history_where_sql(
    schema_name: &str,
    resource_type: &str,
    condition: &str,
) -> String {
    format!(
        "DELETE FROM {schema}._history WHERE _resource_type = '{rtype}' AND \
         (_id IN (SELECT _id FROM {schema}.\"{table}\" WHERE {cond}) OR {cond}) RETURNING _id",
        schema = schema_name,
        rtype = escape_string(resource_type),
        table = resource_type.to_lowercase(),
        cond = condition,
    )
}

pub fn build_expunge_where_sql(schema_name: &str, resource_type: &str, condition: &str) -> String {
    format!(
        "DELETE FROM {schema}.\"{table}\" WHERE {cond} RETURNING _id",
        schema = schema_name,
        table = resource_type.to_lowercase(),
        cond = condition,
    )
}

pub fn build_expunge_response(resources: usize, versions: usize) -> Value {
    json!({
        "resourceType": "Parameters",
        "parameter": [
            { "name": "count", "valueInteger": resources },
            { "name": "historyCount", "valueInteger": versions }
        ]
    })
}

async fn exec_count(conn: &RequestConn, sql: String, label: &str) -> Result<usize, AppError> {
    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => Ok(rows.len()),
        QueryResult::Execute { rows_affected } => Ok(rows_affected),
        QueryResult::Json(_) => Ok(0),
        QueryResult::Error(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            eprintln!("[fhir] {} failed: {}", label, e);
            Err(AppError::Internal(format!("{} failed", label)))
        }
    }
}

/// POST /{ds}/{type}/{id}/$expunge — permanently removes a resource and all its
/// versions; `?_cascade=delete` on a Patient also removes its owned resources.
pub async fn expunge_resource(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type, resource_id)): Path<(String, String, String)>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    if !expunge_enabled() {
        return Err(AppError::Forbidden(format!(
            "$expunge is disabled; set {}=true to enable it",
            ALLOW_EXPUNGE_ENV
        )));
    }
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;
    validate_fhir_id(&resource_id)?;
    let cascade = parse_cascade(&params)?;
    if cascade && resource_type != "Patient" {
        return Err(AppError::BadRequest(
            "_cascade=delete is only supported for Patient".to_string(),
        ));
    }

    let schema_name = state.qualified_schema(&dataset_id);
    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    let tables: HashSet<String> = if cascade {
        match conn.execute(build_list_tables_sql(&state.db_name, &dataset_id)).await {
            QueryResult::Select { rows, .. } => rows
                .iter()
                .filter_map(|r| r.first().and_then(|v| v.as_str()).map(str::to_string))
                .collect(),
            QueryResult::Error(e) => {
                eprintln!("[fhir] Failed to list dataset tables: {}", e);
                return Err(AppError::Internal("Failed to list dataset tables".to_string()));
            }
            _ => HashSet::new(),
        }
    } else {
        HashSet::new()
    };

    if let QueryResult::Error(e) = conn.execute("BEGIN TRANSACTION".to_string()).await {
        eprintln!("[fhir] Failed to begin transaction: {}", e);
        return Err(AppError::Internal("Failed to begin transaction".to_string()));
    }

    let mut versions = exec_count(
        &conn,
        build_expunge_history_by_id_sql(&schema_name, &resource_type, &resource_id),
        "History expunge",
    )
    .await?;

    let mut resources = match conn
        .execute(build_expunge_by_id_sql(&schema_name, &resource_type, &resource_id))
        .await
    {
        QueryResult::Select { rows, .. } => rows.len(),
        QueryResult::Execute { rows_affected } => rows_affected,
        QueryResult::Error(e) => {
            let _ = conn.execute("ROLLBACK".to_string()).await;
            if e.contains("does not exist") {
                return Err(AppError::NotFound(format!(
                    "Resource type '{}' not found in dataset '{}'",
                    resource_type, dataset_id
                )));
            }
            eprintln!("[fhir] Failed to expunge resource: {}", e);
            return Err(AppError::Internal("Failed to expunge resource".to_string()));
        }
        QueryResult::Json(_) => 0,
    };

    if resources == 0 {
        let _ = conn.execute("ROLLBACK".to_string()).await;
        return Err(AppError::NotFound(format!(
            "{}/{} not found",
            resource_type, resource_id
        )));
    }

    for (rtype, element) in PATIENT_CASCADE.iter().filter(|_| cascade) {
        if !tables.contains(&rtype.to_lowercase()) {
            continue;
        }
        let cond = build_patient_reference_condition(element, &resource_id);
        versions += exec_count(
            &conn,
            build_expunge_history_where_sql(&schema_name, rtype, &cond),
            "Cascade history expunge",
        )
        .await?;
        resources += exec_count(
            &conn,
            build_expunge_where_sql(&schema_name, rtype, &cond),
            "Cascade expunge",
        )
        .await?;
    }

    if let QueryResult::Error(e) = conn.execute("COMMIT".to_string()).await {
        eprintln!("[fhir] Failed to commit expunge transaction: {}", e);
        return Err(AppError::Internal("Failed to commit transaction".to_string()));
    }

    // Flush the WAL so the deleted rows don't linger there; another writer can block it.
    let checkpoint = format!("CHECKPOINT {}", crate::sql_safety::escape_identifier(&state.db_name));
    if let QueryResult::Error(e) = conn.execute(checkpoint).await {
        eprintln!("[fhir] WARNING: checkpoint after expunge failed: {}", e);
    }

    Ok(Json(build_expunge_response(resources, versions)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allow_flag_parsing() {
        assert!(parse_allow_flag(Some("true")));
        assert!(parse_allow_flag(Some(" TRUE ")));
        assert!(parse_allow_flag(Some("1")));
        assert!(!parse_allow_flag(Some("false")));
        assert!(!parse_allow_flag(Some("")));
        assert!(!parse_allow_flag(None));
    }

    #[test]
    fn cascade_parsing() {
        let mut p = HashMap::new();
        assert!(!parse_cascade(&p).unwrap());
        p.insert("_cascade".to_string(), "delete".to_string());
        assert!(parse_cascade(&p).unwrap());
        p.insert("_cascade".to_string(), "yes".to_string());
        assert!(matches!(parse_cascade(&p), Err(AppError::BadRequest(_))));
    }

    #[test]
    fn reference_condition_escapes_dots_and_allows_absolute_and_versioned() {
        let c = build_patient_reference_condition("subject", "p.1");
        assert_eq!(
            c,
            "regexp_full_match(json_extract_string(_raw, '$.subject.reference'), \
             '(.*/)?Patient/p\\.1(/_history/[^/]+)?')"
        );
    }

    #[test]
    fn list_tables_sql_uses_unquoted_schema_name() {
        let sql = build_list_tables_sql("FHIR", "my-ds");
        assert!(sql.contains("table_catalog = 'FHIR'"));
        assert!(sql.contains("table_schema = 'my_ds'"));
    }

    #[test]
    fn expunge_by_id_sql() {
        assert_eq!(
            build_expunge_by_id_sql("\"db\".\"ds\"", "Patient", "p1"),
            "DELETE FROM \"db\".\"ds\".\"patient\" WHERE _id = 'p1' RETURNING _id"
        );
        assert_eq!(
            build_expunge_history_by_id_sql("\"db\".\"ds\"", "Patient", "p1"),
            "DELETE FROM \"db\".\"ds\"._history WHERE _resource_type = 'Patient' AND _id = 'p1' RETURNING _id"
        );
    }

    #[test]
    fn expunge_where_sql_covers_current_and_old_versions() {
        let sql = build_expunge_history_where_sql("\"db\".\"ds\"", "Observation", "COND");
        assert_eq!(
            sql,
            "DELETE FROM \"db\".\"ds\"._history WHERE _resource_type = 'Observation' AND \
             (_id IN (SELECT _id FROM \"db\".\"ds\".\"observation\" WHERE COND) OR COND) RETURNING _id"
        );
        assert_eq!(
            build_expunge_where_sql("\"db\".\"ds\"", "Observation", "COND"),
            "DELETE FROM \"db\".\"ds\".\"observation\" WHERE COND RETURNING _id"
        );
    }

    #[test]
    fn cascade_list_has_no_duplicates_and_excludes_patient() {
        let types: HashSet<_> = PATIENT_CASCADE.iter().map(|(t, _)| *t).collect();
        assert_eq!(types.len(), PATIENT_CASCADE.len());
        assert!(!types.contains("Patient"));
        assert!(!types.contains("Group"));
    }

    #[test]
    fn response_shape() {
        let v = build_expunge_response(3, 5);
        assert_eq!(v["resourceType"], "Parameters");
        assert_eq!(v["parameter"][0]["name"], "count");
        assert_eq!(v["parameter"][0]["valueInteger"], 3);
        assert_eq!(v["parameter"][1]["valueInteger"], 5);
    }
}
