use duckdb::{
    core::{DataChunkHandle, LogicalTypeId},
    vtab::arrow::WritableVector,
    vscalar::{VScalar, ScalarFunctionSignature},
};
use hdbconnect::HdbValue;
use std::collections::BTreeMap;
use std::error::Error;
use std::panic::{self, AssertUnwindSafe};
use crate::{HanaConnection, HanaError, redact_url_password};

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

fn batch_size_from_env() -> usize {
    std::env::var("HANA_MATERIALIZE_BATCH_SIZE")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(30000)
}

fn fetch_size_from_env() -> u32 {
    std::env::var("HANA_MATERIALIZE_FETCH_SIZE")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(100_000)
}

fn parse_session_vars(json: &str) -> Result<BTreeMap<String, String>, Box<dyn Error>> {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return Ok(BTreeMap::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| HanaError::new(&format!("Invalid session_vars_json: {}", e)))?;
    let obj = value
        .as_object()
        .ok_or_else(|| HanaError::new("session_vars_json must be a JSON object"))?;
    let mut map = BTreeMap::new();
    for (k, v) in obj {
        if let Some(s) = v.as_str() {
            map.insert(k.clone(), s.to_string());
        } else {
            map.insert(k.clone(), v.to_string());
        }
    }
    Ok(map)
}

fn apply_session_vars(conn: &HanaConnection, vars: &BTreeMap<String, String>) -> Result<(), Box<dyn Error>> {
    for (k, v) in vars {
        match k.as_str() {
            "APPLICATION" => { conn.set_application(v)?; }
            "APPLICATIONUSER" => { conn.set_application_user(v)?; }
            _ => { /* unknown client-info key: ignore */ }
        }
    }
    Ok(())
}

fn connect(connection_string: &str) -> Result<HanaConnection, Box<dyn Error>> {
    match panic::catch_unwind(AssertUnwindSafe(|| HanaConnection::new(connection_string.to_string()))) {
        Ok(Ok(c)) => Ok(c),
        Ok(Err(e)) => Err(HanaError::new(&format!(
            "Connection failed ({}): {}",
            redact_url_password(connection_string),
            e
        ))),
        Err(_) => Err(HanaError::new("Connection panicked")),
    }
}

fn run_materialize(
    connection_string: &str,
    source_sql: &str,
    source_params_json: &str,
    results_schema: &str,
    cohort_definition_id: i64,
    session_vars_json: &str,
) -> Result<i64, Box<dyn Error>> {
    let params = parse_source_params(source_params_json)?;
    let insert_sql = build_insert_sql(results_schema, cohort_definition_id)?;
    let session_vars = parse_session_vars(session_vars_json)?;
    let batch_size = batch_size_from_env();

    let read_conn = connect(connection_string)?;
    let insert_conn = connect(connection_string)?;
    apply_session_vars(&read_conn, &session_vars)?;
    apply_session_vars(&insert_conn, &session_vars)?;
    read_conn.set_fetch_size(fetch_size_from_env())?;

    // Read side: streaming ResultSet.
    // Use query() for empty params (no bind values), prepared execute_row() when params present.
    let result_set = if params.is_empty() {
        read_conn.query(source_sql)?
    } else {
        let mut stmt = read_conn.prepare(source_sql)?;
        stmt.execute_row(params)?.into_result_set()?
    };

    let mut insert_stmt = insert_conn.prepare(&insert_sql)?;
    let mut processed: i64 = 0;
    let mut pending: usize = 0;

    for row_res in result_set {
        let row = row_res?;
        if row.len() < 3 {
            return Err(Box::new(*HanaError::new(
                "source query must return at least 3 columns (SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE)",
            )));
        }
        let mut vals: Vec<HdbValue<'static>> = row.into_iter().collect();
        vals.truncate(3);
        insert_stmt.add_row_to_batch(vals)?;
        pending += 1;
        if pending >= batch_size {
            insert_stmt.execute_batch()?;
            processed += pending as i64;
            pending = 0;
        }
    }
    if pending > 0 {
        insert_stmt.execute_batch()?;
        processed += pending as i64;
    }
    Ok(processed)
}

pub struct HanaMaterializeCohortScalar;

impl VScalar for HanaMaterializeCohortScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let read_varchar = |idx: usize| -> String {
            let v = input.flat_vector(idx);
            let slice = v.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
            let mut binding = slice[0];
            duckdb::types::DuckString::new(&mut binding).as_str().to_string()
        };

        let connection_string = read_varchar(0);
        let source_sql = read_varchar(1);
        let source_params_json = read_varchar(2);
        let results_schema = read_varchar(3);
        let cohort_definition_id = input.flat_vector(4).as_slice_with_len::<i64>(input.len())[0];
        let session_vars_json = read_varchar(5);

        let processed = run_materialize(
            &connection_string,
            &source_sql,
            &source_params_json,
            &results_schema,
            cohort_definition_id,
            &session_vars_json,
        )?;

        let mut out = output.flat_vector();
        out.as_mut_slice::<i64>()[0] = processed;
        Ok(())
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
    fn test_batch_size_default_and_override() {
        std::env::remove_var("HANA_MATERIALIZE_BATCH_SIZE");
        assert_eq!(batch_size_from_env(), 30000);
        std::env::set_var("HANA_MATERIALIZE_BATCH_SIZE", "5000");
        assert_eq!(batch_size_from_env(), 5000);
        std::env::set_var("HANA_MATERIALIZE_BATCH_SIZE", "0");
        assert_eq!(batch_size_from_env(), 30000); // 0/invalid falls back to default
        std::env::remove_var("HANA_MATERIALIZE_BATCH_SIZE");
    }

    #[test]
    fn test_apply_session_vars_rejects_non_object() {
        // A live connection isn't needed: parsing happens before any connection use.
        assert!(parse_session_vars("[1,2,3]").is_err());
        let m = parse_session_vars(r#"{"APPLICATION":"x","APPLICATIONUSER":"u"}"#).unwrap();
        assert_eq!(m.get("APPLICATION").map(String::as_str), Some("x"));
        assert_eq!(m.get("APPLICATIONUSER").map(String::as_str), Some("u"));
        assert!(parse_session_vars("{}").unwrap().is_empty());
        assert!(parse_session_vars("").unwrap().is_empty());
    }

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
