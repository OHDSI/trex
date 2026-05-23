use axum::body::Body;
use axum::extract::{DefaultBodyLimit, MatchedPath};
use axum::http::{header, Request, Response};
use axum::middleware::{self, Next};
use axum::routing::{delete, get, post, put};
use axum::Router;
use std::sync::Arc;
use std::time::Instant;

use crate::handlers;
use crate::state::AppState;

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/metrics", get(handlers::health::metrics))
        .route("/datasets", post(handlers::dataset::create_dataset))
        .route("/datasets", get(handlers::dataset::list_datasets))
        .route("/datasets/{dataset_id}", get(handlers::dataset::get_dataset))
        .route(
            "/datasets/{dataset_id}",
            delete(handlers::dataset::delete_dataset),
        )
        .route(
            "/datasets/{dataset_id}",
            put(handlers::dataset::update_dataset),
        )
        .route(
            "/{dataset_id}/metadata",
            get(handlers::metadata::get_metadata),
        )
        .route(
            "/{dataset_id}/{resource_type}",
            get(handlers::search::search_resources),
        )
        .route(
            "/{dataset_id}/{resource_type}",
            post(handlers::crud::create_resource),
        )
        .route(
            "/{dataset_id}/{resource_type}/{resource_id}",
            get(handlers::crud::read_resource),
        )
        .route(
            "/{dataset_id}/{resource_type}/{resource_id}",
            put(handlers::crud::update_resource),
        )
        .route(
            "/{dataset_id}/{resource_type}/{resource_id}",
            delete(handlers::crud::delete_resource),
        )
        .route(
            "/{dataset_id}/{resource_type}/{resource_id}/_history",
            get(handlers::history::resource_history),
        )
        .route(
            "/{dataset_id}/{resource_type}/{resource_id}/_history/{version_id}",
            get(handlers::history::read_resource_version),
        )
        .route("/{dataset_id}", post(handlers::bundle::process_bundle))
        .route(
            "/{dataset_id}/Measure/$evaluate-measure",
            get(handlers::measure::evaluate_measure),
        )
        .route(
            "/{dataset_id}/Measure/$evaluate-measure",
            post(handlers::measure::evaluate_measure),
        )
        .route(
            "/{dataset_id}/Measure/{measure_id}/$evaluate-measure",
            get(handlers::measure::evaluate_measure_instance),
        )
        .route(
            "/{dataset_id}/Measure/{measure_id}/$evaluate-measure",
            post(handlers::measure::evaluate_measure_instance),
        )
        .route("/{dataset_id}/$cql", post(handlers::cql::evaluate_cql))
        .route(
            "/{dataset_id}/$import",
            post(handlers::import::import_ndjson),
        )
        .route(
            "/{dataset_id}/$export",
            get(handlers::export::system_export),
        )
        .route(
            "/{dataset_id}/$export/status/{job_id}",
            get(handlers::export::export_status),
        )
        .route(
            "/{dataset_id}/{resource_type}/$export",
            get(handlers::export::type_export),
        )
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100 MB
        .layer(middleware::from_fn(logging_middleware))
        .layer(middleware::from_fn(fhir_content_type_middleware))
        .with_state(state)
}

async fn logging_middleware(request: Request<Body>, next: Next) -> Response<Body> {
    let start = Instant::now();
    let method = request.method().clone();
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    let uri = request.uri().to_string();

    let response = next.run(request).await;

    let duration_ms = start.elapsed().as_millis();
    let status = response.status().as_u16();

    eprintln!(
        "{{\"level\":\"info\",\"method\":\"{}\",\"path\":\"{}\",\"uri\":\"{}\",\"status\":{},\"duration_ms\":{}}}",
        method, path, uri, status, duration_ms
    );

    response
}

async fn fhir_content_type_middleware(request: Request<Body>, next: Next) -> Response<Body> {
    let path = request.uri().path().to_string();
    let mut response = next.run(request).await;

    if is_fhir_endpoint_path(&path) {
        if let Some(ct) = response.headers().get(header::CONTENT_TYPE) {
            if ct.to_str().unwrap_or("").contains("application/json") {
                response.headers_mut().insert(
                    header::CONTENT_TYPE,
                    "application/fhir+json; charset=utf-8".parse().unwrap(),
                );
            }
        }
    }

    response
}

/// Whether a request path should have its `application/json` response rewritten to
/// `application/fhir+json`. The infra endpoints (`/health`, `/metrics`, `/datasets`)
/// are excluded so callers can keep using plain JSON tooling.
pub fn is_fhir_endpoint_path(path: &str) -> bool {
    !path.starts_with("/health")
        && !path.starts_with("/metrics")
        && !path.starts_with("/datasets")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::response::IntoResponse;
    use axum::routing::get;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[test]
    fn is_fhir_endpoint_excludes_infra_paths() {
        assert!(!is_fhir_endpoint_path("/health"));
        assert!(!is_fhir_endpoint_path("/health/ready"));
        assert!(!is_fhir_endpoint_path("/metrics"));
        assert!(!is_fhir_endpoint_path("/datasets"));
        assert!(!is_fhir_endpoint_path("/datasets/abc"));
    }

    #[test]
    fn is_fhir_endpoint_includes_resource_paths() {
        assert!(is_fhir_endpoint_path("/ds1/Patient"));
        assert!(is_fhir_endpoint_path("/ds1/Patient/abc"));
        assert!(is_fhir_endpoint_path("/ds1/metadata"));
    }

    /// Mount the production middleware over a tiny test route that returns
    /// `application/json`. Hitting a FHIR-prefixed path should yield the
    /// rewritten `application/fhir+json` content type.
    #[tokio::test(flavor = "current_thread")]
    async fn middleware_rewrites_json_on_fhir_path() {
        async fn handler() -> axum::Json<serde_json::Value> {
            axum::Json(serde_json::json!({"ok": true}))
        }

        let app: Router = Router::new()
            .route("/ds1/Patient", get(handler))
            .layer(middleware::from_fn(fhir_content_type_middleware));

        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/ds1/Patient")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap().to_str().unwrap();
        assert!(ct.contains("application/fhir+json"), "got: {}", ct);

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(body["ok"], true);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn middleware_leaves_health_json_alone() {
        async fn handler() -> axum::Json<serde_json::Value> {
            axum::Json(serde_json::json!({"status": "ok"}))
        }

        let app: Router = Router::new()
            .route("/health", get(handler))
            .layer(middleware::from_fn(fhir_content_type_middleware));

        let resp = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap().to_str().unwrap();
        // Excluded path: original application/json passes through unchanged.
        assert!(ct.contains("application/json"), "got: {}", ct);
        assert!(!ct.contains("fhir+json"), "got: {}", ct);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn middleware_leaves_text_plain_alone_on_fhir_path() {
        async fn handler() -> axum::response::Response {
            (StatusCode::OK, [("content-type", "text/plain")], "hi").into_response()
        }

        let app: Router = Router::new()
            .route("/ds1/Patient", get(handler))
            .layer(middleware::from_fn(fhir_content_type_middleware));

        let resp = app
            .oneshot(Request::builder().uri("/ds1/Patient").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap().to_str().unwrap();
        assert!(ct.contains("text/plain"), "got: {}", ct);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn logging_middleware_passes_request_through() {
        async fn handler() -> &'static str {
            "ok"
        }

        let app: Router = Router::new()
            .route("/x", get(handler))
            .layer(middleware::from_fn(logging_middleware));

        let resp = app
            .oneshot(Request::builder().uri("/x").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body_bytes[..], b"ok");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn build_router_constructs_routes_and_serves_metrics() {
        // Build the full production router with a real (no-defs) AppState.
        // /metrics doesn't need a DB connection, so it should return 200.
        let registry = crate::fhir::resource_registry::ResourceRegistry::new();
        let search_params = crate::fhir::search_parameter::SearchParamRegistry::load_from_json(
            r#"{"resourceType":"Bundle","entry":[]}"#,
        )
        .unwrap();
        let state = std::sync::Arc::new(crate::state::AppState::new(
            std::sync::Arc::new(registry),
            std::sync::Arc::new(search_params),
            "memory".to_string(),
        ));

        let app = build_router(state);

        let resp = app
            .oneshot(Request::builder().uri("/metrics").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap().to_str().unwrap();
        assert!(ct.contains("text/plain"), "got: {}", ct);
    }
}
