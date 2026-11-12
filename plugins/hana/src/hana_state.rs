use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone)]
pub struct TableAttachmentInfo {
    pub url: String,
    pub hana_schema: String,
    pub hana_table: String,
}

#[derive(Debug, Clone)]
pub struct AttachedDatabase {
    pub url: String,
    pub dbname: String,
    pub schema: String,
    pub table_names: Vec<String>,
}

#[derive(Debug, Default)]
pub struct HanaGlobalState {
    /// Key: uppercase `HANA__<dbname>_<schema>_<TABLE>`
    pub table_registry: HashMap<String, TableAttachmentInfo>,
    /// Key: `<dbname>|<schema>`
    pub attachments: HashMap<String, AttachedDatabase>,
}

static GLOBAL_STATE: OnceLock<RwLock<HanaGlobalState>> = OnceLock::new();

fn global_state() -> &'static RwLock<HanaGlobalState> {
    GLOBAL_STATE.get_or_init(|| RwLock::new(HanaGlobalState::default()))
}

pub fn read_state<F, R>(f: F) -> R
where
    F: FnOnce(&HanaGlobalState) -> R,
{
    let guard = global_state().read().expect("HANA global state read lock poisoned");
    f(&guard)
}

pub fn write_state<F, R>(f: F) -> R
where
    F: FnOnce(&mut HanaGlobalState) -> R,
{
    let mut guard = global_state().write().expect("HANA global state write lock poisoned");
    f(&mut guard)
}

pub fn prefixed_name(dbname: &str, schema: &str, table: &str) -> String {
    format!("HANA__{}_{}_{}", dbname, schema, table)
}

pub fn duckdb_schema_name(dbname: &str, schema: &str) -> String {
    format!("{}_{}", dbname, schema)
}

pub fn attachment_key(dbname: &str, schema: &str) -> String {
    format!("{}|{}", dbname, schema)
}

/// Escape `"` inside SQL identifiers: `"` -> `""`.
pub fn escape_identifier(s: &str) -> String {
    s.replace('"', "\"\"")
}

/// HANA (query, url) for a replacement-scan name, or `None` when the name is not ours.
///
/// The last part is matched against the flat `HANA__<dbname>_<schema>_<table>`
/// registry. Otherwise a `<dbname>_<schema>.<table>` name resolves to an attached
/// table, standing in for the per-attachment views v1 created over SQL.
pub fn resolve_scan(parts: &[String]) -> Option<(String, String)> {
    let table = parts.last()?;
    let upper = table.to_uppercase();
    read_state(|state| {
        if let Some(entry) = state.table_registry.get(&upper) {
            return Some((
                format!("SELECT * FROM \"{}\".\"{}\"", entry.hana_schema, entry.hana_table),
                entry.url.clone(),
            ));
        }
        let schema = parts.len().checked_sub(2).map(|i| parts[i].to_lowercase())?;
        let table = table.to_lowercase();
        state.attachments.values().find_map(|att| {
            if duckdb_schema_name(&att.dbname, &att.schema).to_lowercase() != schema {
                return None;
            }
            let hana_table = att.table_names.iter().find(|t| t.to_lowercase() == table)?;
            Some((
                format!(
                    "SELECT * FROM \"{}\".\"{}\"",
                    escape_identifier(&att.schema),
                    escape_identifier(hana_table)
                ),
                att.url.clone(),
            ))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prefixed_name() {
        assert_eq!(prefixed_name("dev", "SYS", "DUMMY"), "HANA__dev_SYS_DUMMY");
    }

    #[test]
    fn test_duckdb_schema_name() {
        assert_eq!(duckdb_schema_name("dev", "SYS"), "dev_SYS");
    }

    #[test]
    fn test_attachment_key() {
        assert_eq!(attachment_key("dev", "SYS"), "dev|SYS");
    }

    #[test]
    fn test_escape_identifier() {
        assert_eq!(escape_identifier("DUMMY"), "DUMMY");
        assert_eq!(escape_identifier(r#"ta"ble"#), r#"ta""ble"#);
        assert_eq!(escape_identifier(r#""""#), r#""""""#);
        assert_eq!(escape_identifier(""), "");
    }

    #[test]
    fn test_write_and_read_state() {
        write_state(|state| {
            state.table_registry.insert(
                "HANA__DEV_SYS_DUMMY".to_string(),
                TableAttachmentInfo {
                    url: "hdbsql://u:p@h:30015/HDB".to_string(),
                    hana_schema: "SYS".to_string(),
                    hana_table: "DUMMY".to_string(),
                },
            );
        });
        let found = read_state(|state| state.table_registry.contains_key("HANA__DEV_SYS_DUMMY"));
        assert!(found);
    }

    #[test]
    fn test_resolve_scan_flat_and_qualified() {
        write_state(|state| {
            state.table_registry.insert(
                "HANA__RS_SCH_T1".to_string(),
                TableAttachmentInfo {
                    url: "hdbsql://u:p@h:30015/HDB".to_string(),
                    hana_schema: "SCH".to_string(),
                    hana_table: "T1".to_string(),
                },
            );
            state.attachments.insert(
                attachment_key("rs", "SCH"),
                AttachedDatabase {
                    url: "hdbsql://u:p@h:30015/HDB".to_string(),
                    dbname: "rs".to_string(),
                    schema: "SCH".to_string(),
                    table_names: vec!["T1".to_string(), "My\"Tab".to_string()],
                },
            );
        });
        let parts = |p: &[&str]| p.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        let (query, url) = resolve_scan(&parts(&["hana__rs_sch_t1"])).unwrap();
        assert_eq!(query, r#"SELECT * FROM "SCH"."T1""#);
        assert_eq!(url, "hdbsql://u:p@h:30015/HDB");
        assert!(resolve_scan(&parts(&["main", "HANA__RS_SCH_T1"])).is_some());

        let (query, _) = resolve_scan(&parts(&["RS_sch", "my\"tab"])).unwrap();
        assert_eq!(query, r#"SELECT * FROM "SCH"."My""Tab""#);
        assert!(resolve_scan(&parts(&["memory", "rs_SCH", "t1"])).is_some());

        assert!(resolve_scan(&parts(&["T1"])).is_none());
        assert!(resolve_scan(&parts(&["rs_SCH", "T2"])).is_none());
        assert!(resolve_scan(&parts(&["other_SCH", "T1"])).is_none());
    }
}
