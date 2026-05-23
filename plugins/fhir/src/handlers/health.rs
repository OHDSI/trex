use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::state::AppState;

static REQUEST_COUNT: AtomicU64 = AtomicU64::new(0);
static ERROR_COUNT: AtomicU64 = AtomicU64::new(0);

pub fn increment_request_count() {
    REQUEST_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn increment_error_count() {
    ERROR_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let db_ok = match state.new_request_conn() {
        Ok(conn) => match conn.execute("SELECT 1".to_string()).await {
            crate::query_executor::QueryResult::Select { .. } => true,
            crate::query_executor::QueryResult::Execute { .. } => true,
            _ => false,
        },
        Err(_) => false,
    };

    if db_ok {
        (
            StatusCode::OK,
            Json(json!({"status": "healthy", "database": "connected"})),
        )
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"status": "unhealthy"})),
        )
    }
}

fn format_metrics_body(requests: u64, errors: u64) -> String {
    format!(
        "# HELP fhir_requests_total Total FHIR requests\n\
         # TYPE fhir_requests_total counter\n\
         fhir_requests_total {}\n\
         # HELP fhir_errors_total Total FHIR errors\n\
         # TYPE fhir_errors_total counter\n\
         fhir_errors_total {}\n",
        requests, errors
    )
}

pub async fn metrics() -> impl IntoResponse {
    let requests = REQUEST_COUNT.load(Ordering::Relaxed);
    let errors = ERROR_COUNT.load(Ordering::Relaxed);

    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        format_metrics_body(requests, errors),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_body_contains_counter_values() {
        let body = format_metrics_body(42, 7);
        assert!(body.contains("fhir_requests_total 42"));
        assert!(body.contains("fhir_errors_total 7"));
    }

    #[test]
    fn metrics_body_includes_prometheus_help_and_type() {
        let body = format_metrics_body(0, 0);
        assert!(body.contains("# HELP fhir_requests_total"));
        assert!(body.contains("# TYPE fhir_requests_total counter"));
        assert!(body.contains("# HELP fhir_errors_total"));
        assert!(body.contains("# TYPE fhir_errors_total counter"));
    }

    #[test]
    fn metrics_body_handles_zero_counters() {
        let body = format_metrics_body(0, 0);
        assert!(body.contains("fhir_requests_total 0"));
        assert!(body.contains("fhir_errors_total 0"));
    }

    #[test]
    fn increment_request_count_increases_atomic() {
        let before = REQUEST_COUNT.load(Ordering::Relaxed);
        increment_request_count();
        let after = REQUEST_COUNT.load(Ordering::Relaxed);
        assert!(after > before);
    }

    #[test]
    fn increment_error_count_increases_atomic() {
        let before = ERROR_COUNT.load(Ordering::Relaxed);
        increment_error_count();
        let after = ERROR_COUNT.load(Ordering::Relaxed);
        assert!(after > before);
    }
}
