use serde_json::Value;

use crate::fhir::resource_registry::ResourceRegistry;

pub struct ValidationResult {
    pub issues: Vec<ValidationIssue>,
}

pub struct ValidationIssue {
    pub severity: IssueSeverity,
    pub code: &'static str,
    pub diagnostics: String,
    pub path: Option<String>,
}

pub enum IssueSeverity {
    Error,
    Warning,
}

impl ValidationResult {
    pub fn is_valid(&self) -> bool {
        !self.issues.iter().any(|i| matches!(i.severity, IssueSeverity::Error))
    }

    pub fn to_operation_outcome(&self) -> Value {
        let issues: Vec<Value> = self
            .issues
            .iter()
            .map(|issue| {
                let mut obj = serde_json::json!({
                    "severity": match issue.severity {
                        IssueSeverity::Error => "error",
                        IssueSeverity::Warning => "warning",
                    },
                    "code": issue.code,
                    "diagnostics": issue.diagnostics,
                });
                if let Some(ref path) = issue.path {
                    obj["expression"] = Value::Array(vec![Value::String(path.clone())]);
                }
                obj
            })
            .collect();

        serde_json::json!({
            "resourceType": "OperationOutcome",
            "issue": issues
        })
    }
}

pub fn validate_resource(
    resource: &Value,
    expected_type: &str,
    registry: &ResourceRegistry,
) -> ValidationResult {
    let mut issues = Vec::new();

    let obj = match resource.as_object() {
        Some(o) => o,
        None => {
            issues.push(ValidationIssue {
                severity: IssueSeverity::Error,
                code: "structure",
                diagnostics: "Resource must be a JSON object".to_string(),
                path: None,
            });
            return ValidationResult { issues };
        }
    };

    let resource_type = match obj.get("resourceType").and_then(|v| v.as_str()) {
        Some(rt) => rt,
        None => {
            issues.push(ValidationIssue {
                severity: IssueSeverity::Error,
                code: "required",
                diagnostics: "Missing required field 'resourceType'".to_string(),
                path: Some("resourceType".to_string()),
            });
            return ValidationResult { issues };
        }
    };

    if resource_type != expected_type {
        issues.push(ValidationIssue {
            severity: IssueSeverity::Error,
            code: "value",
            diagnostics: format!(
                "resourceType '{}' does not match endpoint type '{}'",
                resource_type, expected_type
            ),
            path: Some("resourceType".to_string()),
        });
        return ValidationResult { issues };
    }

    if !registry.is_known_type(resource_type) {
        issues.push(ValidationIssue {
            severity: IssueSeverity::Error,
            code: "not-supported",
            diagnostics: format!("Unknown resource type: '{}'", resource_type),
            path: Some("resourceType".to_string()),
        });
    }

    if obj.contains_key("id") {
        issues.push(ValidationIssue {
            severity: IssueSeverity::Warning,
            code: "informational",
            diagnostics: "Client-provided 'id' will be ignored; server assigns resource IDs"
                .to_string(),
            path: Some("id".to_string()),
        });
    }

    ValidationResult { issues }
}

pub fn validate_resource_update(
    resource: &Value,
    expected_type: &str,
    expected_id: &str,
    registry: &ResourceRegistry,
) -> ValidationResult {
    let mut issues = Vec::new();

    let obj = match resource.as_object() {
        Some(o) => o,
        None => {
            issues.push(ValidationIssue {
                severity: IssueSeverity::Error,
                code: "structure",
                diagnostics: "Resource must be a JSON object".to_string(),
                path: None,
            });
            return ValidationResult { issues };
        }
    };

    let resource_type = match obj.get("resourceType").and_then(|v| v.as_str()) {
        Some(rt) => rt,
        None => {
            issues.push(ValidationIssue {
                severity: IssueSeverity::Error,
                code: "required",
                diagnostics: "Missing required field 'resourceType'".to_string(),
                path: Some("resourceType".to_string()),
            });
            return ValidationResult { issues };
        }
    };

    if resource_type != expected_type {
        issues.push(ValidationIssue {
            severity: IssueSeverity::Error,
            code: "value",
            diagnostics: format!(
                "resourceType '{}' does not match endpoint type '{}'",
                resource_type, expected_type
            ),
            path: Some("resourceType".to_string()),
        });
        return ValidationResult { issues };
    }

    if !registry.is_known_type(resource_type) {
        issues.push(ValidationIssue {
            severity: IssueSeverity::Error,
            code: "not-supported",
            diagnostics: format!("Unknown resource type: '{}'", resource_type),
            path: Some("resourceType".to_string()),
        });
    }

    if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
        if id != expected_id {
            issues.push(ValidationIssue {
                severity: IssueSeverity::Error,
                code: "value",
                diagnostics: format!(
                    "Resource id '{}' does not match URL id '{}'",
                    id, expected_id
                ),
                path: Some("id".to_string()),
            });
        }
    }

    ValidationResult { issues }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fhir::resource_registry::ResourceRegistry;
    use serde_json::json;

    fn empty_registry() -> ResourceRegistry {
        ResourceRegistry::new()
    }

    #[test]
    fn non_object_resource_is_structure_error() {
        let r = empty_registry();
        let res = validate_resource(&json!("not an object"), "Patient", &r);
        assert!(!res.is_valid());
        assert_eq!(res.issues[0].code, "structure");
    }

    #[test]
    fn missing_resource_type_is_required_error() {
        let r = empty_registry();
        let res = validate_resource(&json!({}), "Patient", &r);
        assert!(!res.is_valid());
        assert_eq!(res.issues[0].code, "required");
        assert_eq!(res.issues[0].path.as_deref(), Some("resourceType"));
    }

    #[test]
    fn mismatched_resource_type_is_value_error() {
        let r = empty_registry();
        let res = validate_resource(
            &json!({"resourceType": "Observation"}),
            "Patient",
            &r,
        );
        assert!(!res.is_valid());
        assert_eq!(res.issues[0].code, "value");
    }

    #[test]
    fn unknown_resource_type_is_not_supported() {
        let r = empty_registry();
        let res = validate_resource(
            &json!({"resourceType": "Patient"}),
            "Patient",
            &r,
        );
        assert!(!res.is_valid());
        assert!(res.issues.iter().any(|i| i.code == "not-supported"));
    }

    #[test]
    fn client_id_emits_warning_only() {
        let r = empty_registry();
        let res = validate_resource(
            &json!({"resourceType": "Patient", "id": "abc"}),
            "Patient",
            &r,
        );
        assert!(res.issues.iter().any(|i| {
            matches!(i.severity, IssueSeverity::Warning) && i.path.as_deref() == Some("id")
        }));
    }

    #[test]
    fn update_mismatched_id_is_value_error() {
        let r = empty_registry();
        let res = validate_resource_update(
            &json!({"resourceType": "Patient", "id": "other"}),
            "Patient",
            "expected-id",
            &r,
        );
        assert!(res
            .issues
            .iter()
            .any(|i| i.code == "value" && i.path.as_deref() == Some("id")));
    }

    #[test]
    fn update_matching_id_does_not_emit_id_error() {
        let r = empty_registry();
        let res = validate_resource_update(
            &json!({"resourceType": "Patient", "id": "abc"}),
            "Patient",
            "abc",
            &r,
        );
        assert!(!res.issues.iter().any(|i| {
            i.code == "value" && i.path.as_deref() == Some("id")
        }));
    }

    #[test]
    fn operation_outcome_includes_expression_when_path_set() {
        let r = empty_registry();
        let res = validate_resource(&json!({}), "Patient", &r);
        let oo = res.to_operation_outcome();
        assert_eq!(oo["resourceType"], "OperationOutcome");
        assert_eq!(oo["issue"][0]["expression"][0], "resourceType");
    }
}
