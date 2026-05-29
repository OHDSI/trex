use crate::fhir::resource_registry::ResourceRegistry;
use crate::fhir::search_parameter::SearchParamRegistry;
use crate::query_executor::RequestConn;
use crate::sql_safety::{to_qualified_meta_schema, to_qualified_schema};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub registry: Arc<ResourceRegistry>,
    pub search_params: Arc<SearchParamRegistry>,
    pub db_name: String,
}

impl AppState {
    pub fn new(
        registry: Arc<ResourceRegistry>,
        search_params: Arc<SearchParamRegistry>,
        db_name: String,
    ) -> Self {
        Self {
            registry,
            search_params,
            db_name,
        }
    }

    pub fn new_request_conn(&self) -> Result<RequestConn, String> {
        RequestConn::new()
    }

    pub fn qualified_schema(&self, dataset_id: &str) -> String {
        to_qualified_schema(&self.db_name, dataset_id)
    }

    pub fn meta_schema(&self) -> String {
        to_qualified_meta_schema(&self.db_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fhir::resource_registry::ResourceRegistry;
    use crate::fhir::search_parameter::SearchParamRegistry;

    fn make_state(db: &str) -> AppState {
        let empty_bundle = r#"{"resourceType":"Bundle","entry":[]}"#;
        AppState::new(
            Arc::new(ResourceRegistry::new()),
            Arc::new(SearchParamRegistry::load_from_json(empty_bundle).unwrap()),
            db.to_string(),
        )
    }

    #[test]
    fn qualified_schema_hyphenates_to_underscore_and_quotes() {
        let s = make_state("memory");
        assert_eq!(s.qualified_schema("my-dataset"), "\"memory\".\"my_dataset\"");
    }

    #[test]
    fn meta_schema_is_qualified() {
        let s = make_state("memory");
        assert_eq!(s.meta_schema(), "\"memory\".\"_fhir_meta\"");
    }

    #[test]
    fn db_name_is_stored() {
        let s = make_state("custom_db");
        assert_eq!(s.db_name, "custom_db");
    }
}
