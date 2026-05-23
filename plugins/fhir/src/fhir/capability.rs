use serde_json::{json, Value};

use crate::fhir::resource_registry::ResourceRegistry;
use crate::fhir::search_parameter::{SearchParamRegistry, SearchParamType};

pub fn build_capability_statement(
    registry: &ResourceRegistry,
    search_params: &SearchParamRegistry,
    dataset_id: &str,
) -> Value {
    let resource_types = registry.resource_type_names();

    let resources: Vec<Value> = resource_types
        .iter()
        .map(|rt| {
            let params = search_params.params_for_type(rt);
            let search_params_json: Vec<Value> = params
                .iter()
                .map(|p| {
                    json!({
                        "name": p.name,
                        "type": search_param_type_str(p.param_type),
                        "documentation": p.expression
                    })
                })
                .collect();

            let mut resource = json!({
                "type": rt,
                "interaction": [
                    {"code": "read"},
                    {"code": "create"},
                    {"code": "update"},
                    {"code": "delete"},
                    {"code": "search-type"},
                    {"code": "history-instance"}
                ],
                "versioning": "versioned",
                "readHistory": true,
                "updateCreate": true,
                "conditionalCreate": false,
                "conditionalRead": "not-supported",
                "conditionalUpdate": false,
                "conditionalDelete": "not-supported"
            });

            if !search_params_json.is_empty() {
                resource["searchParam"] = Value::Array(search_params_json);
            }

            resource
        })
        .collect();

    json!({
        "resourceType": "CapabilityStatement",
        "id": format!("{}-capability", dataset_id),
        "status": "active",
        "date": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        "kind": "instance",
        "software": {
            "name": "TrexSQL FHIR Server",
            "version": "0.1.0"
        },
        "implementation": {
            "description": format!("TrexSQL FHIR R4 Server - Dataset: {}", dataset_id)
        },
        "fhirVersion": "4.0.1",
        "format": ["json"],
        "rest": [{
            "mode": "server",
            "resource": resources,
            "interaction": [
                {"code": "transaction"},
                {"code": "batch"}
            ],
            "operation": [
                {
                    "name": "export",
                    "definition": "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/export"
                },
                {
                    "name": "cql",
                    "definition": "http://hl7.org/fhir/uv/cql/OperationDefinition/cql"
                }
            ]
        }]
    })
}

fn search_param_type_str(t: SearchParamType) -> &'static str {
    match t {
        SearchParamType::String => "string",
        SearchParamType::Token => "token",
        SearchParamType::Reference => "reference",
        SearchParamType::Date => "date",
        SearchParamType::Quantity => "quantity",
        SearchParamType::Number => "number",
        SearchParamType::Uri => "uri",
        SearchParamType::Composite => "composite",
        SearchParamType::Special => "special",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_capability_statement_structure() {
        let registry = ResourceRegistry::new();
        let search_params = SearchParamRegistry::load_from_json(r#"{
            "resourceType": "Bundle",
            "entry": []
        }"#).unwrap();

        let cs = build_capability_statement(&registry, &search_params, "test-ds");

        assert_eq!(cs["resourceType"], "CapabilityStatement");
        assert_eq!(cs["fhirVersion"], "4.0.1");
        assert_eq!(cs["kind"], "instance");
        assert_eq!(cs["status"], "active");
        assert!(cs["rest"].as_array().unwrap().len() == 1);
        assert_eq!(cs["rest"][0]["mode"], "server");
    }

    #[test]
    fn test_capability_id_includes_dataset() {
        let registry = ResourceRegistry::new();
        let search_params = SearchParamRegistry::load_from_json(r#"{"resourceType":"Bundle","entry":[]}"#).unwrap();
        let cs = build_capability_statement(&registry, &search_params, "mydata");
        assert_eq!(cs["id"], "mydata-capability");
        assert!(cs["implementation"]["description"]
            .as_str()
            .unwrap()
            .contains("mydata"));
    }

    #[test]
    fn test_capability_lists_resources_when_registry_populated() {
        let registry = ResourceRegistry::with_definitions(
            crate::fhir_server::load_default_definitions().expect("definitions"),
        );
        let search_params = crate::fhir_server::load_search_parameters().expect("search params");

        let cs = build_capability_statement(&registry, &search_params, "ds1");

        let resources = cs["rest"][0]["resource"].as_array().expect("resource array");
        assert!(resources.len() >= 100, "expected ≥100 resources, got {}", resources.len());

        let patient = resources.iter().find(|r| r["type"] == "Patient").expect("Patient resource");
        // Patient must list standard interactions
        let interactions: Vec<&str> = patient["interaction"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["code"].as_str().unwrap())
            .collect();
        assert!(interactions.contains(&"read"));
        assert!(interactions.contains(&"create"));
        assert!(interactions.contains(&"search-type"));

        // Patient should have search params attached
        assert!(patient.get("searchParam").is_some(), "Patient should have searchParam");
    }

    #[test]
    fn test_search_param_type_str_all_variants() {
        assert_eq!(search_param_type_str(SearchParamType::String), "string");
        assert_eq!(search_param_type_str(SearchParamType::Token), "token");
        assert_eq!(search_param_type_str(SearchParamType::Reference), "reference");
        assert_eq!(search_param_type_str(SearchParamType::Date), "date");
        assert_eq!(search_param_type_str(SearchParamType::Quantity), "quantity");
        assert_eq!(search_param_type_str(SearchParamType::Number), "number");
        assert_eq!(search_param_type_str(SearchParamType::Uri), "uri");
        assert_eq!(search_param_type_str(SearchParamType::Composite), "composite");
        assert_eq!(search_param_type_str(SearchParamType::Special), "special");
    }
}
