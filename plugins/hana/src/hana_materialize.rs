use duckdb::{
    core::{DataChunkHandle, LogicalTypeId},
    vtab::arrow::WritableVector,
    vscalar::{VScalar, ScalarFunctionSignature},
};
use hdbconnect::HdbValue;
use std::error::Error;
use crate::HanaError;

fn parse_source_params(json: &str) -> Result<Vec<HdbValue<'static>>, Box<dyn Error>> {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| HanaError::new(&format!("Invalid source_params_json: {}", e)))?;
    let arr = value
        .as_array()
        .ok_or_else(|| HanaError::new("source_params_json must be a JSON array"))?;
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        out.push(json_scalar_to_hdb(item)?);
    }
    Ok(out)
}

fn json_scalar_to_hdb(item: &serde_json::Value) -> Result<HdbValue<'static>, Box<dyn Error>> {
    use serde_json::Value;
    Ok(match item {
        Value::Null => HdbValue::NULL,
        Value::Bool(b) => HdbValue::BOOLEAN(*b),
        Value::String(s) => HdbValue::STRING(s.clone()),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                HdbValue::BIGINT(i)
            } else {
                HdbValue::DOUBLE(n.as_f64().unwrap_or(0.0))
            }
        }
        other => HdbValue::STRING(other.to_string()),
    })
}

fn validate_schema_identifier(schema: &str) -> Result<(), Box<dyn Error>> {
    let s = schema.trim();
    if s.is_empty() {
        return Err(Box::new(HanaError::new("results_schema must not be empty")));
    }
    // Allow a bare HANA identifier or a double-quoted identifier; no whitespace,
    // semicolons, or quotes that could break out of the statement.
    let inner = if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        &s[1..s.len() - 1]
    } else {
        s
    };
    let ok = !inner.is_empty()
        && inner.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    if !ok {
        return Err(Box::new(HanaError::new(&format!(
            "Invalid results_schema identifier: {}",
            schema
        ))));
    }
    Ok(())
}

fn build_insert_sql(results_schema: &str, cohort_definition_id: i64) -> Result<String, Box<dyn Error>> {
    validate_schema_identifier(results_schema)?;
    Ok(format!(
        "INSERT INTO {}.COHORT (COHORT_DEFINITION_ID, SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE) VALUES ({}, ?, ?, ?)",
        results_schema, cohort_definition_id
    ))
}

pub struct HanaMaterializeCohortScalar;

impl VScalar for HanaMaterializeCohortScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        _input: &mut DataChunkHandle,
        _output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Err(Box::new(*HanaError::new("trex_hana_materialize_cohort not implemented")))
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(), // connection_string
                LogicalTypeId::Varchar.into(), // source_sql
                LogicalTypeId::Varchar.into(), // source_params_json
                LogicalTypeId::Varchar.into(), // results_schema
                LogicalTypeId::Bigint.into(),  // cohort_definition_id
                LogicalTypeId::Varchar.into(), // session_vars_json
            ],
            LogicalTypeId::Bigint.into(),      // processed_rows
        )]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hdbconnect::HdbValue;

    #[test]
    fn test_parse_params_empty() {
        assert!(parse_source_params("[]").unwrap().is_empty());
        assert!(parse_source_params("").unwrap().is_empty());
        assert!(parse_source_params("   ").unwrap().is_empty());
    }

    #[test]
    fn test_parse_params_mixed() {
        let v = parse_source_params(r#"["abc", 42, 3.5, true, null]"#).unwrap();
        assert_eq!(v.len(), 5);
        assert!(matches!(v[0], HdbValue::STRING(ref s) if s == "abc"));
        assert!(matches!(v[1], HdbValue::BIGINT(42)));
        assert!(matches!(v[2], HdbValue::DOUBLE(d) if (d - 3.5).abs() < 1e-9));
        assert!(matches!(v[3], HdbValue::BOOLEAN(true)));
        assert!(matches!(v[4], HdbValue::NULL));
    }

    #[test]
    fn test_parse_params_not_array_errors() {
        assert!(parse_source_params(r#"{"a":1}"#).is_err());
        assert!(parse_source_params("not json").is_err());
    }

    #[test]
    fn test_build_insert_sql_ok() {
        let sql = build_insert_sql("CACHEDB", 7).unwrap();
        assert_eq!(
            sql,
            "INSERT INTO CACHEDB.COHORT (COHORT_DEFINITION_ID, SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE) VALUES (7, ?, ?, ?)"
        );
    }

    #[test]
    fn test_build_insert_sql_allows_quoted_and_dotted() {
        assert!(build_insert_sql("MY_SCHEMA", 1).is_ok());
        assert!(build_insert_sql("\"My.Schema\"", 1).is_ok());
    }

    #[test]
    fn test_build_insert_sql_rejects_injection() {
        assert!(build_insert_sql("CACHEDB; DROP TABLE X", 1).is_err());
        assert!(build_insert_sql("a b", 1).is_err());
        assert!(build_insert_sql("", 1).is_err());
    }
}
