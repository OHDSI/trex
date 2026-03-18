/// Build an INSERT ... SELECT that uses json_transform() to decompose _raw into typed columns.
pub fn build_insert_sql(
    schema: &str,
    table: &str,
    version: i64,
    transform_spec: &str,
    column_names: &[String],
) -> String {
    let escaped_spec = transform_spec.replace('\'', "''");
    let quoted_cols = quoted_column_list(column_names);
    let prefixed_cols = prefixed_column_list(column_names, "t");

    format!(
        "INSERT INTO {schema}.\"{table}\" (_id, _version_id, _last_updated, _is_deleted, _raw{col_suffix}) \
         SELECT $1, {version}, CURRENT_TIMESTAMP, false, $2::JSON{sel_suffix} \
         FROM (SELECT UNNEST(json_transform($2::JSON, '{spec}'))) AS t",
        schema = schema,
        table = table,
        version = version,
        spec = escaped_spec,
        col_suffix = if column_names.is_empty() { String::new() } else { format!(", {}", quoted_cols) },
        sel_suffix = if column_names.is_empty() { String::new() } else { format!(", {}", prefixed_cols) },
    )
}

/// Build an UPDATE ... FROM json_transform() to update typed columns alongside _raw.
pub fn build_update_sql(
    schema: &str,
    table: &str,
    version: i64,
    transform_spec: &str,
    column_names: &[String],
) -> String {
    let escaped_spec = transform_spec.replace('\'', "''");
    let set_cols = column_names
        .iter()
        .map(|c| format!("\"{}\" = t.\"{}\"", c, c))
        .collect::<Vec<_>>()
        .join(", ");

    let set_suffix = if column_names.is_empty() {
        String::new()
    } else {
        format!(", {}", set_cols)
    };

    format!(
        "UPDATE {schema}.\"{table}\" SET \
         _version_id = {version}, _last_updated = CURRENT_TIMESTAMP, \
         _is_deleted = false, _raw = $2::JSON{set_suffix} \
         FROM (SELECT UNNEST(json_transform($2::JSON, '{spec}'))) AS t \
         WHERE _id = $1",
        schema = schema,
        table = table,
        version = version,
        spec = escaped_spec,
        set_suffix = set_suffix,
    )
}

/// Build an INSERT OR REPLACE ... SELECT (for bundle PUT / upsert).
pub fn build_upsert_sql(
    schema: &str,
    table: &str,
    version: i64,
    transform_spec: &str,
    column_names: &[String],
) -> String {
    let escaped_spec = transform_spec.replace('\'', "''");
    let quoted_cols = quoted_column_list(column_names);
    let prefixed_cols = prefixed_column_list(column_names, "t");

    format!(
        "INSERT OR REPLACE INTO {schema}.\"{table}\" (_id, _version_id, _last_updated, _is_deleted, _raw{col_suffix}) \
         SELECT $1, {version}, CURRENT_TIMESTAMP, false, $2::JSON{sel_suffix} \
         FROM (SELECT UNNEST(json_transform($2::JSON, '{spec}'))) AS t",
        schema = schema,
        table = table,
        version = version,
        spec = escaped_spec,
        col_suffix = if column_names.is_empty() { String::new() } else { format!(", {}", quoted_cols) },
        sel_suffix = if column_names.is_empty() { String::new() } else { format!(", {}", prefixed_cols) },
    )
}

fn quoted_column_list(names: &[String]) -> String {
    names
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect::<Vec<_>>()
        .join(", ")
}

fn prefixed_column_list(names: &[String], prefix: &str) -> String {
    names
        .iter()
        .map(|c| format!("{}.\"{}\"", prefix, c))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fhir::resource_registry::ResourceRegistry;
    use crate::fhir_server::load_default_definitions;

    fn test_cols() -> Vec<String> {
        vec!["gender".into(), "birthDate".into(), "name".into()]
    }

    #[test]
    fn test_build_insert_sql_structure() {
        let cols = test_cols();
        let sql = build_insert_sql("\"test\"", "patient", 1, "{\"gender\": \"VARCHAR\"}", &cols);
        assert!(sql.starts_with("INSERT INTO \"test\".\"patient\""), "wrong prefix: {}", sql);
        assert!(sql.contains("\"gender\""), "missing column gender");
        assert!(sql.contains("\"birthDate\""), "missing column birthDate");
        assert!(sql.contains("t.\"gender\""), "missing select gender");
        assert!(sql.contains("t.\"birthDate\""), "missing select birthDate");
        assert!(sql.contains("json_transform($2::JSON,"), "missing json_transform");
        assert!(sql.contains("$1"), "missing $1 param");
        assert!(sql.contains("$2::JSON"), "missing $2 param");
    }

    #[test]
    fn test_build_update_sql_structure() {
        let cols = test_cols();
        let sql = build_update_sql("\"test\"", "patient", 2, "{\"gender\": \"VARCHAR\"}", &cols);
        assert!(sql.starts_with("UPDATE \"test\".\"patient\" SET"), "wrong prefix: {}", sql);
        assert!(sql.contains("\"gender\" = t.\"gender\""), "missing SET gender");
        assert!(sql.contains("WHERE _id = $1"), "missing WHERE clause");
        assert!(sql.contains("json_transform($2::JSON,"), "missing json_transform");
    }

    #[test]
    fn test_build_upsert_sql_structure() {
        let cols = test_cols();
        let sql = build_upsert_sql("\"test\"", "patient", 1, "{\"gender\": \"VARCHAR\"}", &cols);
        assert!(sql.starts_with("INSERT OR REPLACE INTO \"test\".\"patient\""), "wrong prefix: {}", sql);
        assert!(sql.contains("json_transform($2::JSON,"), "missing json_transform");
    }

    #[test]
    fn test_empty_columns() {
        let empty: Vec<String> = vec![];
        let sql = build_insert_sql("\"s\"", "t", 1, "{}", &empty);
        assert!(!sql.contains(", ,"), "should not have empty column list");
        assert!(sql.contains("_raw)"), "should end column list with _raw");
    }

    #[test]
    fn test_single_quote_escaping() {
        let sql = build_insert_sql("\"s\"", "t", 1, "{'key': 'val'}", &vec!["key".into()]);
        assert!(sql.contains("''key'': ''val''"), "should escape single quotes: {}", sql);
    }

    #[test]
    fn test_insert_sql_with_real_patient_spec() {
        let defs = load_default_definitions().expect("load defs");
        let registry = ResourceRegistry::with_definitions(defs);
        let spec = registry.get_json_transform("Patient").expect("transform");
        let cols = registry.get_column_names("Patient").expect("columns");

        let sql = build_insert_sql("\"myschema\"", "patient", 1, &spec, &cols);

        // Should be valid SQL structure
        assert!(sql.starts_with("INSERT INTO \"myschema\".\"patient\""));
        assert!(sql.contains("json_transform($2::JSON,"));
        // Should have gender, birthDate, name columns
        assert!(sql.contains("\"gender\""), "missing gender in: {}", &sql[..sql.len().min(500)]);
        assert!(sql.contains("\"birthDate\""), "missing birthDate");
        assert!(sql.contains("\"name\""), "missing name");
        // Should not contain resourceType
        assert!(!sql.contains("\"resourceType\""), "should not have resourceType column");
    }

    #[test]
    fn test_update_sql_with_real_patient_spec() {
        let defs = load_default_definitions().expect("load defs");
        let registry = ResourceRegistry::with_definitions(defs);
        let spec = registry.get_json_transform("Patient").expect("transform");
        let cols = registry.get_column_names("Patient").expect("columns");

        let sql = build_update_sql("\"myschema\"", "patient", 2, &spec, &cols);

        assert!(sql.starts_with("UPDATE \"myschema\".\"patient\" SET"));
        assert!(sql.contains("\"gender\" = t.\"gender\""));
        assert!(sql.contains("WHERE _id = $1"));
    }
}
