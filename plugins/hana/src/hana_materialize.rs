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
}
