use crate::error::AppError;
use crate::fhir::resource_registry::ResourceRegistry;

pub fn validate_dataset_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 128 {
        return Err(AppError::BadRequest(
            "Dataset ID must be 1-128 characters".to_string(),
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(AppError::BadRequest(
            "Dataset ID must contain only alphanumeric characters and hyphens".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_resource_type(resource_type: &str, registry: &ResourceRegistry) -> Result<(), AppError> {
    if resource_type.is_empty() || resource_type.len() > 64 {
        return Err(AppError::BadRequest(
            "Invalid resource type".to_string(),
        ));
    }
    if !resource_type
        .chars()
        .all(|c| c.is_ascii_alphanumeric())
    {
        return Err(AppError::BadRequest(format!(
            "Invalid resource type: '{}'",
            resource_type
        )));
    }
    if !registry.is_known_type(resource_type) {
        return Err(AppError::BadRequest(format!(
            "Unknown resource type: '{}'",
            resource_type
        )));
    }
    Ok(())
}

pub fn validate_fhir_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 64 {
        return Err(AppError::BadRequest(
            "Resource ID must be 1-64 characters".to_string(),
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
    {
        return Err(AppError::BadRequest(
            "Resource ID contains invalid characters".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_version_id(id: &str) -> Result<(), AppError> {
    match id.parse::<u64>() {
        Ok(v) if v > 0 => Ok(()),
        _ => Err(AppError::BadRequest(
            "Version ID must be a positive integer".to_string(),
        )),
    }
}

pub fn validate_uuid(id: &str) -> Result<(), AppError> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(AppError::BadRequest(
            "Invalid UUID format".to_string(),
        ));
    }
    Ok(())
}

pub fn escape_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub fn escape_string(value: &str) -> String {
    value.replace('\'', "''")
}

pub fn to_schema_name(dataset_id: &str) -> String {
    escape_identifier(&dataset_id.replace('-', "_"))
}

pub fn to_qualified_schema(db_name: &str, dataset_id: &str) -> String {
    format!(
        "{}.{}",
        escape_identifier(db_name),
        escape_identifier(&dataset_id.replace('-', "_"))
    )
}

pub fn to_qualified_meta_schema(db_name: &str) -> String {
    format!("{}.\"_fhir_meta\"", escape_identifier(db_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_dataset_id() {
        assert!(validate_dataset_id("my-dataset").is_ok());
        assert!(validate_dataset_id("abc123").is_ok());
        assert!(validate_dataset_id("").is_err());
        assert!(validate_dataset_id("a".repeat(129).as_str()).is_err());
        assert!(validate_dataset_id("bad;input").is_err());
        assert!(validate_dataset_id("bad'input").is_err());
        assert!(validate_dataset_id("bad\"input").is_err());
    }

    #[test]
    fn test_validate_fhir_id() {
        assert!(validate_fhir_id("abc-123").is_ok());
        assert!(validate_fhir_id("test.id_1").is_ok());
        assert!(validate_fhir_id("").is_err());
        assert!(validate_fhir_id("a".repeat(65).as_str()).is_err());
        assert!(validate_fhir_id("bad;id").is_err());
        assert!(validate_fhir_id("bad'id").is_err());
    }

    #[test]
    fn test_validate_version_id() {
        assert!(validate_version_id("1").is_ok());
        assert!(validate_version_id("42").is_ok());
        assert!(validate_version_id("0").is_err());
        assert!(validate_version_id("-1").is_err());
        assert!(validate_version_id("abc").is_err());
    }

    #[test]
    fn test_escape_identifier() {
        assert_eq!(escape_identifier("foo"), "\"foo\"");
        assert_eq!(escape_identifier("foo\"bar"), "\"foo\"\"bar\"");
    }

    #[test]
    fn test_escape_string() {
        assert_eq!(escape_string("hello"), "hello");
        assert_eq!(escape_string("it's"), "it''s");
    }

    #[test]
    fn test_to_schema_name() {
        assert_eq!(to_schema_name("my-dataset"), "\"my_dataset\"");
        assert_eq!(to_schema_name("plain"), "\"plain\"");
    }

    #[test]
    fn test_to_qualified_schema() {
        assert_eq!(
            to_qualified_schema("memory", "my-dataset"),
            "\"memory\".\"my_dataset\""
        );
        assert_eq!(
            to_qualified_schema("mydb", "plain"),
            "\"mydb\".\"plain\""
        );
    }

    #[test]
    fn test_to_qualified_meta_schema() {
        assert_eq!(
            to_qualified_meta_schema("memory"),
            "\"memory\".\"_fhir_meta\""
        );
        assert_eq!(
            to_qualified_meta_schema("mydb"),
            "\"mydb\".\"_fhir_meta\""
        );
    }

    #[test]
    fn test_validate_resource_type_rejects_empty() {
        let registry = ResourceRegistry::new();
        assert!(validate_resource_type("", &registry).is_err());
    }

    #[test]
    fn test_validate_resource_type_rejects_too_long() {
        let registry = ResourceRegistry::new();
        let long = "A".repeat(65);
        assert!(validate_resource_type(&long, &registry).is_err());
    }

    #[test]
    fn test_validate_resource_type_rejects_non_alphanumeric() {
        let registry = ResourceRegistry::new();
        assert!(validate_resource_type("Patient-1", &registry).is_err());
        assert!(validate_resource_type("Patient'", &registry).is_err());
        assert!(validate_resource_type("Pati ent", &registry).is_err());
    }

    #[test]
    fn test_validate_resource_type_rejects_unknown_type() {
        let registry = ResourceRegistry::new();
        // syntactically valid but not registered
        let err = validate_resource_type("Patient", &registry).unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("Unknown resource type"), "got: {}", msg);
    }

    #[test]
    fn test_validate_uuid_accepts_valid() {
        assert!(validate_uuid("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn test_validate_uuid_rejects_invalid() {
        assert!(validate_uuid("not-a-uuid").is_err());
        assert!(validate_uuid("").is_err());
        assert!(validate_uuid("550e8400-e29b-41d4-a716").is_err());
    }
}
