use std::collections::BTreeMap;
use std::error::Error;

use crate::{HanaConnection, HanaError};

pub(crate) fn parse_session_vars(json: &str) -> Result<BTreeMap<String, String>, Box<dyn Error>> {
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

pub(crate) fn apply_session_vars(conn: &HanaConnection, vars: &BTreeMap<String, String>) -> Result<(), Box<dyn Error>> {
    for (k, v) in vars {
        match k.as_str() {
            "APPLICATION" => { conn.set_application(v)?; }
            "APPLICATIONUSER" => { conn.set_application_user(v)?; }
            _ => { /* unknown client-info key: ignore */ }
        }
    }
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
}
