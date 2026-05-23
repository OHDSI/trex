use serde_json::{json, Value};

use crate::query_executor::{QueryResult, RequestConn};
use crate::schema::sql_builder;
use crate::state::AppState;

/// Stamp id and meta (versionId, lastUpdated) on a resource object used by upsert.
pub fn stamp_upsert_meta(resource: &mut Value, id: &str, version: i64, now: &str) {
    if let Some(obj) = resource.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.to_string()));
        obj.insert(
            "meta".to_string(),
            json!({
                "versionId": version.to_string(),
                "lastUpdated": now
            }),
        );
    }
}

/// Build the parameterized INSERT into `_history` used by the upsert path.
pub fn build_upsert_history_sql(schema: &str, current_version: i64) -> String {
    format!(
        "INSERT INTO {schema}._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) \
         VALUES ($1, $2, {version}, CURRENT_TIMESTAMP, $3, false)",
        schema = schema,
        version = current_version,
    )
}

pub struct UpsertResult {
    pub version: i64,
    pub is_new: bool,
}

/// Shared upsert logic: reads current version, writes history, stamps meta, upserts.
/// Mirrors the pattern in crud.rs::update_resource.
///
/// When `outer_conn` is `Some`, all queries run on the caller's connection and
/// the caller is responsible for the surrounding transaction (required for
/// transaction bundles). When `outer_conn` is `None`, this function creates
/// its own RequestConn and wraps the read-modify-write sequence in BEGIN/COMMIT.
pub async fn upsert_resource(
    state: &AppState,
    schema: &str,
    resource_type: &str,
    id: &str,
    resource: &mut Value,
    transform_spec: &str,
    column_names: &[String],
    outer_conn: Option<&RequestConn>,
) -> Result<UpsertResult, String> {
    match outer_conn {
        Some(conn) => {
            upsert_resource_inner(
                state, schema, resource_type, id, resource, transform_spec, column_names, conn, false,
            )
            .await
        }
        None => {
            let conn = state.new_request_conn()?;
            upsert_resource_inner(
                state, schema, resource_type, id, resource, transform_spec, column_names, &conn, true,
            )
            .await
        }
    }
}

async fn upsert_resource_inner(
    _state: &AppState,
    schema: &str,
    resource_type: &str,
    id: &str,
    resource: &mut Value,
    transform_spec: &str,
    column_names: &[String],
    conn: &RequestConn,
    owns_transaction: bool,
) -> Result<UpsertResult, String> {
    let table_name = resource_type.to_lowercase();

    if owns_transaction {
        if let QueryResult::Error(e) = conn.execute("BEGIN TRANSACTION".to_string()).await {
            return Err(format!("Failed to begin transaction: {}", e));
        }
    }

    let check_sql = format!(
        "SELECT _version_id::VARCHAR, _raw FROM {schema}.\"{table}\" WHERE _id = $1",
        schema = schema,
        table = table_name,
    );

    let check_result = conn.execute_params(check_sql, vec![id.to_string()]).await;

    let (current_version, is_new, current_raw) = match check_result {
        QueryResult::Select { rows, .. } => {
            if rows.is_empty() {
                (0i64, true, String::new())
            } else {
                let v = rows[0]
                    .get(0)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(1);
                let raw = rows[0]
                    .get(1)
                    .and_then(|v| v.as_str())
                    .unwrap_or("{}")
                    .to_string();
                (v, false, raw)
            }
        }
        QueryResult::Error(e) => {
            if owns_transaction {
                let _ = conn.execute("ROLLBACK".to_string()).await;
            }
            return Err(format!("Failed to check resource: {}", e));
        }
        _ => (0, true, String::new()),
    };

    let new_version = current_version + 1;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    stamp_upsert_meta(resource, id, new_version, &now);

    let raw_json = serde_json::to_string(&resource)
        .map_err(|e| format!("JSON serialize: {}", e))?;

    if !is_new {
        let history_sql = build_upsert_history_sql(schema, current_version);
        let params = vec![id.to_string(), resource_type.to_string(), current_raw];
        if let QueryResult::Error(e) = conn.execute_params(history_sql, params).await {
            if owns_transaction {
                let _ = conn.execute("ROLLBACK".to_string()).await;
            }
            return Err(format!("History write failed for {}/{}: {}", resource_type, id, e));
        }
    }

    let upsert_sql = sql_builder::build_upsert_sql(
        schema,
        &table_name,
        new_version,
        transform_spec,
        column_names,
    );

    let params = vec![id.to_string(), raw_json];
    if let QueryResult::Error(e) = conn.execute_params(upsert_sql, params).await {
        if owns_transaction {
            let _ = conn.execute("ROLLBACK".to_string()).await;
        }
        return Err(format!("Upsert failed: {}", e));
    }

    if owns_transaction {
        if let QueryResult::Error(e) = conn.execute("COMMIT".to_string()).await {
            return Err(format!("Failed to commit transaction: {}", e));
        }
    }

    Ok(UpsertResult {
        version: new_version,
        is_new,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stamp_upsert_meta_sets_fields() {
        let mut r = json!({"resourceType": "Patient"});
        stamp_upsert_meta(&mut r, "x", 3, "2026-05-23T10:00:00Z");
        assert_eq!(r["id"], "x");
        assert_eq!(r["meta"]["versionId"], "3");
        assert_eq!(r["meta"]["lastUpdated"], "2026-05-23T10:00:00Z");
    }

    #[test]
    fn stamp_upsert_meta_overwrites_existing() {
        let mut r = json!({"id": "old", "meta": {"versionId": "99"}});
        stamp_upsert_meta(&mut r, "new", 1, "now");
        assert_eq!(r["id"], "new");
        assert_eq!(r["meta"]["versionId"], "1");
    }

    #[test]
    fn stamp_upsert_meta_noop_on_non_object() {
        let mut r = json!("string");
        stamp_upsert_meta(&mut r, "x", 1, "now");
        assert_eq!(r, json!("string"));
    }

    #[test]
    fn upsert_history_sql_embeds_current_version() {
        let sql = build_upsert_history_sql("\"db\".\"ds\"", 7);
        assert!(sql.contains("\"db\".\"ds\"._history"));
        assert!(sql.contains(", 7, "));
        assert!(sql.contains("$1"));
        assert!(sql.contains("$2"));
        assert!(sql.contains("$3"));
        assert!(sql.contains("_is_deleted"));
    }

    #[test]
    fn upsert_result_holds_version_and_is_new() {
        let r = UpsertResult { version: 5, is_new: true };
        assert_eq!(r.version, 5);
        assert!(r.is_new);
    }
}
