use etl::credential_mask::{extract_param, mask_password};

// --- mask_password: kv format ---

#[test]
fn mask_kv_password_basic() {
    let input = "host=localhost port=5432 user=postgres password=secret dbname=test";
    let masked = mask_password(input);
    assert_eq!(
        masked,
        "host=localhost port=5432 user=postgres password=*** dbname=test"
    );
}

#[test]
fn mask_kv_password_case_insensitive_key() {
    let masked = mask_password("PASSWORD=secret host=h");
    assert!(masked.contains("PASSWORD=***"));
    assert!(!masked.contains("secret"));
}

#[test]
fn mask_kv_password_quoted_value() {
    let masked = mask_password("password='s e c r e t' host=h");
    assert_eq!(masked, "password=*** host=h");
}

#[test]
fn mask_kv_password_unterminated_quote() {
    // Should not panic; remainder consumed as the value.
    let masked = mask_password("password='secret host=h");
    assert!(masked.contains("password=***"));
    assert!(!masked.contains("secret"));
}

#[test]
fn mask_kv_password_only_password() {
    assert_eq!(mask_password("password=secret"), "password=***");
}

#[test]
fn mask_kv_password_no_password_key() {
    let input = "host=localhost port=5432 dbname=test";
    assert_eq!(mask_password(input), input);
}

#[test]
fn mask_kv_password_empty_input() {
    assert_eq!(mask_password(""), "");
}

// --- mask_password: uri format ---

#[test]
fn mask_uri_password_postgresql_scheme() {
    let masked = mask_password("postgresql://user:secret@host:5432/db");
    assert_eq!(masked, "postgresql://user:***@host:5432/db");
}

#[test]
fn mask_uri_password_postgres_scheme() {
    let masked = mask_password("postgres://user:secret@host/db");
    assert_eq!(masked, "postgres://user:***@host/db");
}

#[test]
fn mask_uri_password_no_userinfo() {
    let input = "postgresql://host:5432/db";
    assert_eq!(mask_password(input), input);
}

#[test]
fn mask_uri_password_userinfo_no_colon() {
    // username only, no password — leave alone.
    let input = "postgresql://user@host/db";
    assert_eq!(mask_password(input), input);
}

// --- extract_param ---

#[test]
fn extract_param_basic_value() {
    let s = "host=localhost port=5432 dbname=test";
    assert_eq!(extract_param(s, "host"), Some("localhost"));
    assert_eq!(extract_param(s, "port"), Some("5432"));
    assert_eq!(extract_param(s, "dbname"), Some("test"));
}

#[test]
fn extract_param_quoted_value() {
    let s = "publication='my pub' host=h";
    assert_eq!(extract_param(s, "publication"), Some("my pub"));
}

#[test]
fn extract_param_missing_key() {
    assert_eq!(extract_param("host=h", "publication"), None);
}

#[test]
fn extract_param_rejects_partial_key_match() {
    // "ghosthost=val" must NOT match a search for "host".
    let s = "ghosthost=val host=real";
    assert_eq!(extract_param(s, "host"), Some("real"));
}

#[test]
fn extract_param_key_at_start() {
    assert_eq!(extract_param("publication=p host=h", "publication"), Some("p"));
}
