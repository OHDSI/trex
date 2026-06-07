// W2 — HANA routing, SQL wrap, and log sanitization tests.
#![allow(unused_imports)]

use super::*;
use base64::{Engine as _, engine::general_purpose};
use std::cell::Cell;
use serde_json::json;

// ---------- sanitize_log_message ----------

#[test]
fn sanitize_redacts_credentials_in_url() {
    let input = "Connecting to hdbsql://admin:s3cret@db.example.com:30015/SYSTEM";
    let out = sanitize_log_message(input);
    assert_eq!(
        out,
        "Connecting to hdbsql://[REDACTED]@db.example.com:30015/SYSTEM"
    );
}

#[test]
fn sanitize_passthrough_when_no_at_sign() {
    let input = "Connecting to hdbsql://db.example.com:30015/SYSTEM";
    assert_eq!(sanitize_log_message(input), input);
}

#[test]
fn sanitize_passthrough_when_no_scheme() {
    let input = "user:pass@host";
    assert_eq!(sanitize_log_message(input), input);
}

#[test]
fn sanitize_empty_string() {
    assert_eq!(sanitize_log_message(""), "");
}

// ---------- check_database_action ----------

fn b64(v: &serde_json::Value) -> String {
    general_purpose::STANDARD.encode(serde_json::to_string(v).unwrap().as_bytes())
}

#[test]
fn check_db_action_invalid_base64_is_skip() {
    assert!(matches!(
        check_database_action("anydb", "this is not base64!!!"),
        DatabaseAction::Skip
    ));
}

#[test]
fn check_db_action_valid_base64_but_invalid_utf8_is_skip() {
    let bad = general_purpose::STANDARD.encode([0xff, 0xfe, 0xfd]);
    assert!(matches!(check_database_action("x", &bad), DatabaseAction::Skip));
}

#[test]
fn check_db_action_invalid_json_is_skip() {
    let b = general_purpose::STANDARD.encode("not json");
    assert!(matches!(check_database_action("x", &b), DatabaseAction::Skip));
}

#[test]
fn check_db_action_non_array_json_is_skip() {
    let b = general_purpose::STANDARD.encode(r#"{"id":"x","dialect":"duckdb"}"#);
    assert!(matches!(check_database_action("x", &b), DatabaseAction::Skip));
}

#[test]
fn check_db_action_no_matching_id_is_skip() {
    let payload = json!([{"id": "other", "dialect": "duckdb"}]);
    assert!(matches!(check_database_action("target", &b64(&payload)), DatabaseAction::Skip));
}

#[test]
fn check_db_action_matching_duckdb_is_set_database() {
    let payload = json!([{"id": "mydb", "dialect": "duckdb"}]);
    assert!(matches!(
        check_database_action("mydb", &b64(&payload)),
        DatabaseAction::SetDatabase
    ));
}

#[test]
fn check_db_action_matching_hana_admin_returns_creds() {
    let payload = json!([{
        "id": "myhana",
        "dialect": "hana",
        "host": "hana.example.com",
        "port": 30015,
        "name": "HXE",
        "credentials": [
            {"userScope": "User", "username": "u1", "password": "p1"},
            {"userScope": "Admin", "username": "admin", "password": "secret"},
        ],
    }]);
    match check_database_action("myhana", &b64(&payload)) {
        DatabaseAction::UseHana(c) => {
            assert_eq!(c.host, "hana.example.com");
            assert_eq!(c.port, 30015);
            assert_eq!(c.name, "HXE");
            assert_eq!(c.username, "admin");
            assert_eq!(c.password, "secret");
        }
        other => panic!("expected UseHana, got {other:?}"),
    }
}

#[test]
fn check_db_action_hana_missing_host_port_name_is_skip() {
    let payload = json!([{
        "id": "h",
        "dialect": "hana",
        // host/port/name omitted
        "credentials": [{"userScope": "Admin", "username": "u", "password": "p"}],
    }]);
    assert!(matches!(check_database_action("h", &b64(&payload)), DatabaseAction::Skip));
}

#[test]
fn check_db_action_hana_no_admin_scope_is_skip() {
    let payload = json!([{
        "id": "h",
        "dialect": "hana",
        "host": "host", "port": 30015, "name": "n",
        "credentials": [{"userScope": "User", "username": "u", "password": "p"}],
    }]);
    assert!(matches!(check_database_action("h", &b64(&payload)), DatabaseAction::Skip));
}

#[test]
fn check_db_action_hana_admin_missing_password_is_skip() {
    let payload = json!([{
        "id": "h",
        "dialect": "hana",
        "host": "host", "port": 30015, "name": "n",
        "credentials": [{"userScope": "Admin", "username": "u"}],
    }]);
    assert!(matches!(check_database_action("h", &b64(&payload)), DatabaseAction::Skip));
}

// ---------- get_hana_credentials_if_available ----------
// These interact with the singleton ServerRegistry, so each test uses a
// unique host:port to avoid colliding with other tests in the binary.

#[test]
fn get_hana_creds_none_when_database_is_none() {
    assert!(get_hana_credentials_if_available(&None, "127.0.0.1", 1).is_none());
}

#[test]
fn get_hana_creds_none_when_no_server_registered() {
    // Singleton has no entry for this host:port → registry lookup is None.
    let port = super::common::free_port();
    assert!(get_hana_credentials_if_available(&Some("x".to_string()), "127.0.0.1", port).is_none());
}

#[test]
fn get_hana_creds_none_for_non_hana_dialect() {
    let payload = json!([{"id": "mydb", "dialect": "duckdb"}]);
    let (_port, _guard) = super::common::start_test_server(None, &b64(&payload));
    let got = get_hana_credentials_if_available(
        &Some("mydb".to_string()),
        &_guard.host,
        _guard.port,
    );
    assert!(got.is_none());
}

#[test]
fn get_hana_creds_some_for_hana_admin() {
    let payload = json!([{
        "id": "myhana",
        "dialect": "hana",
        "host": "h", "port": 30015, "name": "n",
        "credentials": [{"userScope": "Admin", "username": "u", "password": "p"}],
    }]);
    let (_port, _guard) = super::common::start_test_server(None, &b64(&payload));
    let got = get_hana_credentials_if_available(
        &Some("myhana".to_string()),
        &_guard.host,
        _guard.port,
    )
    .expect("hana creds");
    assert_eq!(got.username, "u");
    assert_eq!(got.password, "p");
}

// ---------- wrap_query_for_hana ----------

fn sample_creds() -> HanaCredentials {
    HanaCredentials {
        host: "host".to_string(),
        port: 30015,
        name: "DB".to_string(),
        username: "u".to_string(),
        password: "p".to_string(),
    }
}

#[test]
fn wrap_query_select_uses_hana_scan() {
    let q = "SELECT 1";
    let out = wrap_query_for_hana(q, &sample_creds());
    assert!(out.starts_with("SELECT * FROM trex_hana_scan("), "got {out:?}");
    assert!(out.contains("'SELECT 1'"));
    assert!(out.contains("hdbsql://u:p@host:30015/DB"));
}

#[test]
fn wrap_query_with_cte_uses_hana_scan() {
    let q = "WITH cte AS (SELECT 1) SELECT * FROM cte";
    let out = wrap_query_for_hana(q, &sample_creds());
    assert!(out.starts_with("SELECT * FROM trex_hana_scan("), "got {out:?}");
}

#[test]
fn wrap_query_lowercase_select_with_case_insensitive() {
    let q = "select 1";
    let out = wrap_query_for_hana(q, &sample_creds());
    assert!(out.starts_with("SELECT * FROM trex_hana_scan("));
    let q2 = "with cte as (select 1) select * from cte";
    let out2 = wrap_query_for_hana(q2, &sample_creds());
    assert!(out2.starts_with("SELECT * FROM trex_hana_scan("));
}

#[test]
fn wrap_query_dml_uses_hana_execute() {
    let q = "INSERT INTO t VALUES (1)";
    let out = wrap_query_for_hana(q, &sample_creds());
    assert!(out.starts_with("SELECT trex_hana_execute("), "got {out:?}");
    let q2 = "UPDATE t SET a = 1";
    let out2 = wrap_query_for_hana(q2, &sample_creds());
    assert!(out2.starts_with("SELECT trex_hana_execute("));
    let q3 = "DELETE FROM t";
    let out3 = wrap_query_for_hana(q3, &sample_creds());
    assert!(out3.starts_with("SELECT trex_hana_execute("));
}

#[test]
fn wrap_query_dml_passes_url_before_sql() {
    // trex_hana_execute(connection_url, sql): the URL argument must come
    // first, the statement second. Regression guard for the arg-order bug.
    let q = "INSERT INTO t VALUES (1)";
    let out = wrap_query_for_hana(q, &sample_creds());
    let url_pos = out.find("hdbsql://").expect("url present");
    let sql_pos = out.find("INSERT INTO t").expect("sql present");
    assert!(url_pos < sql_pos, "url must precede sql, got {out:?}");
    assert!(
        out.starts_with("SELECT trex_hana_execute('hdbsql://"),
        "got {out:?}"
    );
}

#[test]
fn wrap_query_doubles_single_quotes_in_query() {
    let q = "SELECT 'it''s'";
    let out = wrap_query_for_hana(q, &sample_creds());
    // Inside the wrapped SQL string literal, every ' is doubled. The
    // original `''` becomes `''''`, plus surrounding doubles for the
    // outer quotes (`'` → `''`).
    assert!(out.contains("''it''''s''"), "got {out:?}");
}

#[test]
fn wrap_query_doubles_quotes_in_credentials() {
    let creds = HanaCredentials {
        host: "ho'st".to_string(),
        port: 1,
        name: "n'a'me".to_string(),
        username: "us'er".to_string(),
        password: "pa'ss".to_string(),
    };
    let out = wrap_query_for_hana("SELECT 1", &creds);
    // Username, password, host, name all get single-quote doubling.
    assert!(out.contains("us''er"), "username quoting failed: {out}");
    assert!(out.contains("pa''ss"), "password quoting failed: {out}");
    assert!(out.contains("ho''st"), "host quoting failed: {out}");
    assert!(out.contains("n''a''me"), "name quoting failed: {out}");
}

// ---------- execute_with_fallback ----------

#[test]
fn execute_with_fallback_returns_primary_on_success() {
    let calls = Cell::new(0usize);
    let primary = "PRIMARY";
    let fallback = Some("FB");
    let r: Result<String, duckdb::Error> = execute_with_fallback(primary, fallback, |q| {
        calls.set(calls.get() + 1);
        Ok(q.to_string())
    });
    assert_eq!(r.unwrap(), "PRIMARY");
    assert_eq!(calls.get(), 1);
}

#[test]
fn execute_with_fallback_returns_error_when_fallback_none() {
    let calls = Cell::new(0usize);
    let r: Result<String, duckdb::Error> = execute_with_fallback("PRIMARY", None, |_q| {
        calls.set(calls.get() + 1);
        Err(duckdb::Error::QueryReturnedNoRows)
    });
    assert!(r.is_err());
    assert_eq!(calls.get(), 1);
}

#[test]
fn execute_with_fallback_uses_fallback_on_primary_error() {
    let calls = Cell::new(0usize);
    let r: Result<String, duckdb::Error> = execute_with_fallback("PRIMARY", Some("FB"), |q| {
        calls.set(calls.get() + 1);
        if q == "PRIMARY" {
            Err(duckdb::Error::QueryReturnedNoRows)
        } else {
            Ok(q.to_string())
        }
    });
    assert_eq!(r.unwrap(), "FB");
    assert_eq!(calls.get(), 2);
}
