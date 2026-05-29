use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::AppError;
use crate::fhir::search_parameter;
use crate::query_executor::QueryResult;
use crate::sql_safety::{validate_dataset_id, validate_resource_type};
use crate::state::AppState;

/// Parse `_count` (max 1000, default 100) and `_offset` (default 0) from search params.
pub fn parse_pagination_params(params: &HashMap<String, String>) -> (usize, usize) {
    let count = params
        .get("_count")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(100)
        .min(1000);
    let offset = params
        .get("_offset")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    (count, offset)
}

/// Build the `&key=value` suffix from non-FHIR-control search params (those not starting with `_`).
pub fn build_search_suffix(params: &HashMap<String, String>) -> String {
    let query: String = params
        .iter()
        .filter(|(k, _)| !k.starts_with('_'))
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");
    if query.is_empty() {
        String::new()
    } else {
        format!("&{}", query)
    }
}

/// Build the `link` array (self + optional next + optional previous).
pub fn build_search_links(
    dataset_id: &str,
    resource_type: &str,
    count: usize,
    offset: usize,
    has_more: bool,
    search_suffix: &str,
) -> Vec<Value> {
    let mut link = vec![json!({
        "relation": "self",
        "url": format!("/{}/{}?_count={}&_offset={}{}", dataset_id, resource_type, count, offset, search_suffix)
    })];

    if has_more {
        link.push(json!({
            "relation": "next",
            "url": format!("/{}/{}?_count={}&_offset={}{}", dataset_id, resource_type, count, offset + count, search_suffix)
        }));
    }

    if offset > 0 {
        let prev_offset = if offset > count { offset - count } else { 0 };
        link.push(json!({
            "relation": "previous",
            "url": format!("/{}/{}?_count={}&_offset={}{}", dataset_id, resource_type, count, prev_offset, search_suffix)
        }));
    }

    link
}

pub async fn search_resources(
    State(state): State<Arc<AppState>>,
    Path((dataset_id, resource_type)): Path<(String, String)>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    validate_dataset_id(&dataset_id)?;
    validate_resource_type(&resource_type, &state.registry)?;

    let schema_name = state.qualified_schema(&dataset_id);
    let table_name = resource_type.to_lowercase();

    let (count, offset) = parse_pagination_params(&params);

    let search_where = search_parameter::generate_search_sql(
        &state.search_params,
        &state.registry,
        &resource_type,
        &params,
    )
    .map_err(|e| AppError::BadRequest(e))?;

    let where_clause = if search_where.is_empty() {
        "NOT _is_deleted".to_string()
    } else {
        format!("NOT _is_deleted AND ({})", search_where)
    };

    let sql = format!(
        "SELECT _raw FROM {schema}.\"{table}\" WHERE {where_clause} LIMIT {limit} OFFSET {offset}",
        schema = schema_name,
        table = table_name,
        where_clause = where_clause,
        limit = count + 1,
        offset = offset
    );

    let count_sql = format!(
        "SELECT COUNT(*)::VARCHAR as cnt FROM {schema}.\"{table}\" WHERE {where_clause}",
        schema = schema_name,
        table = table_name,
        where_clause = where_clause
    );

    let conn = state.new_request_conn().map_err(AppError::Internal)?;

    let total = match conn.execute(count_sql).await {
        QueryResult::Select { rows, .. } => rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0),
        _ => 0,
    };

    let result = match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => {
            let has_more = rows.len() > count;
            let entries: Vec<Value> = rows
                .iter()
                .take(count)
                .filter_map(|row| {
                    row.first()
                        .and_then(|v| v.as_str())
                        .and_then(|s| serde_json::from_str(s).ok())
                })
                .map(|resource: Value| {
                    json!({
                        "fullUrl": format!("{}/{}/{}",
                            dataset_id,
                            resource_type,
                            resource.get("id").and_then(|v| v.as_str()).unwrap_or("")
                        ),
                        "resource": resource,
                        "search": {"mode": "match"}
                    })
                })
                .collect();

            let search_suffix = build_search_suffix(&params);
            let link = build_search_links(
                &dataset_id,
                &resource_type,
                count,
                offset,
                has_more,
                &search_suffix,
            );

            let bundle = json!({
                "resourceType": "Bundle",
                "type": "searchset",
                "total": total,
                "link": link,
                "entry": entries
            });

            Ok(Json(bundle))
        }
        QueryResult::Error(e) => {
            if e.contains("does not exist") || e.contains("Table") {
                Err(AppError::NotFound(format!(
                    "Resource type '{}' not found in dataset '{}'",
                    resource_type, dataset_id
                )))
            } else {
                eprintln!("[fhir] Search failed: {}", e);
                Err(AppError::Internal("Search failed".to_string()))
            }
        }
        _ => Ok(Json(json!({
            "resourceType": "Bundle",
            "type": "searchset",
            "total": 0,
            "entry": []
        }))),
    };

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| ((*k).into(), (*v).into())).collect()
    }

    #[test]
    fn pagination_defaults() {
        assert_eq!(parse_pagination_params(&HashMap::new()), (100, 0));
    }

    #[test]
    fn pagination_caps_count_at_1000() {
        let p = params(&[("_count", "5000"), ("_offset", "200")]);
        assert_eq!(parse_pagination_params(&p), (1000, 200));
    }

    #[test]
    fn pagination_uses_defaults_on_invalid_values() {
        let p = params(&[("_count", "abc"), ("_offset", "xyz")]);
        assert_eq!(parse_pagination_params(&p), (100, 0));
    }

    #[test]
    fn pagination_accepts_valid_values() {
        let p = params(&[("_count", "25"), ("_offset", "50")]);
        assert_eq!(parse_pagination_params(&p), (25, 50));
    }

    #[test]
    fn search_suffix_empty_when_only_control_params() {
        let p = params(&[("_count", "10"), ("_offset", "0")]);
        assert_eq!(build_search_suffix(&p), "");
    }

    #[test]
    fn search_suffix_includes_non_control_params() {
        let p = params(&[("_count", "10"), ("name", "Smith")]);
        let s = build_search_suffix(&p);
        assert!(s.starts_with("&"));
        assert!(s.contains("name=Smith"));
        assert!(!s.contains("_count"));
    }

    #[test]
    fn links_self_only_when_no_more_no_offset() {
        let links = build_search_links("d1", "Patient", 10, 0, false, "");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0]["relation"], "self");
        assert_eq!(links[0]["url"], "/d1/Patient?_count=10&_offset=0");
    }

    #[test]
    fn links_include_next_when_has_more() {
        let links = build_search_links("d1", "Patient", 10, 0, true, "");
        assert_eq!(links.len(), 2);
        assert_eq!(links[1]["relation"], "next");
        assert_eq!(links[1]["url"], "/d1/Patient?_count=10&_offset=10");
    }

    #[test]
    fn links_include_previous_when_offset_positive() {
        let links = build_search_links("d1", "Patient", 10, 20, false, "");
        assert_eq!(links.len(), 2);
        assert_eq!(links[1]["relation"], "previous");
        assert_eq!(links[1]["url"], "/d1/Patient?_count=10&_offset=10");
    }

    #[test]
    fn links_previous_clamped_to_zero() {
        let links = build_search_links("d1", "Patient", 10, 5, false, "");
        assert_eq!(links[1]["relation"], "previous");
        assert_eq!(links[1]["url"], "/d1/Patient?_count=10&_offset=0");
    }

    #[test]
    fn links_self_next_previous_with_suffix() {
        let links = build_search_links("d1", "Patient", 10, 20, true, "&name=Smith");
        assert_eq!(links.len(), 3);
        let urls: Vec<&str> = links.iter().map(|l| l["url"].as_str().unwrap()).collect();
        assert!(urls[0].ends_with("&name=Smith"));
        assert!(urls[1].ends_with("&name=Smith"));
        assert!(urls[2].ends_with("&name=Smith"));
    }
}
