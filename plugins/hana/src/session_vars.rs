use std::collections::BTreeMap;
use std::error::Error;

use crate::{HanaConnection, HanaError};

pub(crate) fn parse_session_vars(json: &str) -> Result<BTreeMap<String, String>, Box<dyn Error>> {
    let trimmed = json.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
        return Ok(BTreeMap::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| HanaError::new(&format!("Invalid session_vars_json: {}", e)))?;
    let obj = value
        .as_object()
        .ok_or_else(|| HanaError::new("session_vars_json must be a JSON object"))?;
    let mut map = BTreeMap::new();
    for (k, v) in obj {
        let key = k.to_ascii_uppercase();
        if key != "APPLICATION" && key != "APPLICATIONUSER" {
            return Err(HanaError::new(&format!(
                "Unrecognized HANA session variable: {}",
                k
            )));
        }
        if let Some(s) = v.as_str() {
            map.insert(key, s.to_string());
        } else {
            map.insert(key, v.to_string());
        }
    }
    Ok(map)
}

pub(crate) fn apply_session_vars(conn: &HanaConnection, vars: &BTreeMap<String, String>) -> Result<(), Box<dyn Error>> {
    // These values belong to the current query, not to the pooled connection.
    // Clear omitted values so attribution from a previous query cannot leak.
    conn.set_application(
        vars.get("APPLICATION")
            .map(String::as_str)
            .unwrap_or(""),
    )?;
    conn.set_application_user(
        vars.get("APPLICATIONUSER")
            .map(String::as_str)
            .unwrap_or(""),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_parse_session_vars_normalizes_supported_keys() {
        let vars =
            parse_session_vars(r#"{"application":"wizard","ApplicationUser":"alice"}"#)
                .unwrap();
        assert_eq!(vars.get("APPLICATION").map(String::as_str), Some("wizard"));
        assert_eq!(
            vars.get("APPLICATIONUSER").map(String::as_str),
            Some("alice")
        );
    }

    #[test]
    fn test_parse_session_vars_rejects_unknown_keys() {
        let error = parse_session_vars(r#"{"APLICATION":"wizard"}"#)
            .unwrap_err()
            .to_string();
        assert!(error.contains("APLICATION"));
    }

    #[test]
    fn test_parse_session_vars_treats_null_as_absent() {
        assert!(parse_session_vars("NULL").unwrap().is_empty());
        assert!(parse_session_vars("null").unwrap().is_empty());
    }
}
