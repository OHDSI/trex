use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::capability;
use crate::sql_safety::validate_dataset_id;
use crate::state::AppState;

/// Build the SELECT that checks whether a dataset row exists by id in `_datasets`.
pub fn build_dataset_exists_sql(meta_schema: &str, dataset_id: &str) -> String {
    format!(
        "SELECT id FROM {}._datasets WHERE id = '{}'",
        meta_schema,
        dataset_id.replace('\'', "''")
    )
}

pub async fn get_metadata(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;

    let check_sql = build_dataset_exists_sql(&state.meta_schema(), &dataset_id);
    let conn = state.new_request_conn().map_err(AppError::Internal)?;
    match conn.execute(check_sql).await {
        crate::query_executor::QueryResult::Select { rows, .. } if !rows.is_empty() => {}
        _ => {
            return Err(AppError::NotFound(format!(
                "Dataset '{}' not found",
                dataset_id
            )));
        }
    }

    let cs = capability::build_capability_statement(
        &state.registry,
        &state.search_params,
        &dataset_id,
    );

    Ok(Json(cs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dataset_exists_sql_escapes_quotes() {
        let sql = build_dataset_exists_sql("\"db\".\"meta\"", "d's");
        assert!(sql.starts_with("SELECT id FROM \"db\".\"meta\"._datasets"));
        assert!(sql.contains("'d''s'"));
    }

    #[test]
    fn dataset_exists_sql_plain() {
        let sql = build_dataset_exists_sql("\"m\"", "ds1");
        assert_eq!(sql, "SELECT id FROM \"m\"._datasets WHERE id = 'ds1'");
    }
}
