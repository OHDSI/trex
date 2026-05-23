use serde_json::Value;

use crate::query_executor::{QueryResult, RequestConn};

/// Build the SQL that deletes prior expansion rows for a given ValueSet URL.
pub fn build_delete_expansion_sql(schema_name: &str, valueset_url: &str) -> String {
    format!(
        "DELETE FROM {schema}._valueset_expansion WHERE valueset_url = '{url}'",
        schema = schema_name,
        url = valueset_url.replace('\'', "''")
    )
}

/// Build the SQL that inserts one expansion row.
pub fn build_insert_expansion_sql(
    schema_name: &str,
    valueset_url: &str,
    valueset_version: &str,
    code: &str,
    system: &str,
    display: &str,
) -> String {
    format!(
        "INSERT INTO {schema}._valueset_expansion (valueset_url, valueset_version, code, system, display) \
         VALUES ('{url}', '{ver}', '{code}', '{sys}', '{disp}')",
        schema = schema_name,
        url = valueset_url.replace('\'', "''"),
        ver = valueset_version.replace('\'', "''"),
        code = code.replace('\'', "''"),
        sys = system.replace('\'', "''"),
        disp = display.replace('\'', "''")
    )
}

/// Build the SELECT that checks whether `code` exists in the given ValueSet expansion.
pub fn build_lookup_sql(
    schema_name: &str,
    valueset_url: &str,
    system: &str,
    code: &str,
) -> String {
    format!(
        "SELECT 1 FROM {schema}._valueset_expansion \
         WHERE valueset_url = '{url}' AND system = '{sys}' AND code = '{code}' LIMIT 1",
        schema = schema_name,
        url = valueset_url.replace('\'', "''"),
        sys = system.replace('\'', "''"),
        code = code.replace('\'', "''")
    )
}

pub async fn expand_valueset(
    conn: &RequestConn,
    schema_name: &str,
    valueset: &Value,
) -> Result<usize, String> {
    let url = valueset
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("ValueSet missing 'url'")?;

    let version = valueset
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let contains = valueset
        .get("expansion")
        .and_then(|e| e.get("contains"))
        .and_then(|c| c.as_array());

    let entries = match contains {
        Some(arr) => arr,
        None => return Ok(0),
    };

    let _ = conn.execute(build_delete_expansion_sql(schema_name, url)).await;

    let mut count = 0;
    for entry in entries {
        count += insert_expansion_entry(conn, schema_name, url, version, entry).await?;
    }

    Ok(count)
}

fn insert_expansion_entry<'a>(
    conn: &'a RequestConn,
    schema_name: &'a str,
    valueset_url: &'a str,
    valueset_version: &'a str,
    entry: &'a Value,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<usize, String>> + Send + 'a>> {
    Box::pin(async move {
    let code = entry.get("code").and_then(|v| v.as_str()).unwrap_or("");
    let system = entry.get("system").and_then(|v| v.as_str()).unwrap_or("");
    let display = entry.get("display").and_then(|v| v.as_str()).unwrap_or("");

    if code.is_empty() {
        return Ok(0);
    }

    let sql = build_insert_expansion_sql(
        schema_name, valueset_url, valueset_version, code, system, display,
    );

    match conn.execute(sql).await {
        QueryResult::Error(e) => Err(format!("Failed to insert expansion entry: {}", e)),
        _ => {
            let mut total = 1;
            if let Some(children) = entry.get("contains").and_then(|c| c.as_array()) {
                for child in children {
                    total += insert_expansion_entry(
                        conn,
                        schema_name,
                        valueset_url,
                        valueset_version,
                        child,
                    )
                    .await?;
                }
            }
            Ok(total)
        }
    }
    })
}

pub async fn code_in_valueset(
    conn: &RequestConn,
    schema_name: &str,
    valueset_url: &str,
    system: &str,
    code: &str,
) -> Result<bool, String> {
    let sql = build_lookup_sql(schema_name, valueset_url, system, code);

    match conn.execute(sql).await {
        QueryResult::Select { rows, .. } => Ok(!rows.is_empty()),
        QueryResult::Error(e) => Err(format!("ValueSet lookup failed: {}", e)),
        _ => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_sql_escapes_quotes() {
        let sql = build_delete_expansion_sql("\"db\".\"ds\"", "http://o'r/vs");
        assert!(sql.starts_with("DELETE FROM \"db\".\"ds\"._valueset_expansion"));
        assert!(sql.contains("'http://o''r/vs'"));
    }

    #[test]
    fn insert_sql_includes_all_columns() {
        let sql = build_insert_expansion_sql(
            "\"db\".\"ds\"",
            "http://vs",
            "1.0",
            "C1",
            "http://snomed",
            "Disp",
        );
        assert!(sql.contains("'http://vs'"));
        assert!(sql.contains("'1.0'"));
        assert!(sql.contains("'C1'"));
        assert!(sql.contains("'http://snomed'"));
        assert!(sql.contains("'Disp'"));
        assert!(sql.contains("(valueset_url, valueset_version, code, system, display)"));
    }

    #[test]
    fn insert_sql_escapes_each_param() {
        let sql = build_insert_expansion_sql(
            "\"db\".\"ds\"",
            "u'rl",
            "v'er",
            "c'ode",
            "s'ys",
            "d'isp",
        );
        assert!(sql.contains("'u''rl'"));
        assert!(sql.contains("'v''er'"));
        assert!(sql.contains("'c''ode'"));
        assert!(sql.contains("'s''ys'"));
        assert!(sql.contains("'d''isp'"));
    }

    #[test]
    fn lookup_sql_builds_select_with_filters() {
        let sql = build_lookup_sql("\"db\".\"ds\"", "http://vs", "http://sys", "code1");
        assert!(sql.starts_with("SELECT 1 FROM \"db\".\"ds\"._valueset_expansion"));
        assert!(sql.contains("valueset_url = 'http://vs'"));
        assert!(sql.contains("system = 'http://sys'"));
        assert!(sql.contains("code = 'code1'"));
        assert!(sql.contains("LIMIT 1"));
    }
}
