// W4 — auth source, salt, statement-row-desc, and encode_batches_safely.
//
// TrexQueryHandler is NOT exercised end-to-end here: it depends on
// `trex_pool_client::create_session()`, which discovers the pool extension
// via `dlsym(RTLD_DEFAULT, ...)`. In a `cargo test` binary the pool isn't
// loaded, so create_session fails. That code path is exercised in production
// (and the .test SQL harness) instead.
#![allow(unused_imports)]

use super::*;
use duckdb::arrow::array::Int32Array;
use duckdb::arrow::datatypes::{DataType, Field, Schema};
use duckdb::arrow::record_batch::RecordBatch;
use pgwire::api::auth::{AuthSource, LoginInfo};
use pgwire::api::portal::Format;
use pgwire::api::results::FieldInfo;
use std::sync::Arc;

// ---------- random_salt ----------

#[test]
fn random_salt_is_ten_bytes() {
    let s = random_salt();
    assert_eq!(s.len(), 10);
}

#[test]
fn random_salt_entropy_two_calls_differ() {
    let a = random_salt();
    let b = random_salt();
    assert_ne!(a, b, "two salts should not be identical (entropy sanity)");
}

// ---------- SimpleAuthSource ----------

#[test]
fn simple_auth_source_debug_redacts_password() {
    let s = SimpleAuthSource::new("topsecret".to_string());
    let dbg = format!("{:?}", s);
    assert!(dbg.contains("[REDACTED]"), "Debug should redact: {dbg}");
    assert!(!dbg.contains("topsecret"), "Debug must not leak password: {dbg}");
}

fn dummy_login() -> LoginInfo<'static> {
    // LoginInfo::new takes Option<&str>, Option<&str>, &str. Inspecting the
    // pgwire crate shape: (user, database, host).
    LoginInfo::new(Some("u"), Some("db"), "127.0.0.1".to_string())
}

#[tokio::test]
async fn simple_auth_get_password_yields_salt_and_hash() {
    let s = SimpleAuthSource::new("pw".to_string());
    let pw = s.get_password(&dummy_login()).await.expect("get_password");
    let salt = pw.salt().clone().expect("salt present");
    let hash = pw.password();
    assert_eq!(salt.len(), 10, "salt must be 10 bytes (matches random_salt)");
    assert!(!hash.is_empty(), "hashed password must be non-empty");
}

#[tokio::test]
async fn simple_auth_two_calls_different_salts() {
    let s = SimpleAuthSource::new("pw".to_string());
    let a = s.get_password(&dummy_login()).await.unwrap();
    let b = s.get_password(&dummy_login()).await.unwrap();
    let salt_a = a.salt().clone().expect("salt a");
    let salt_b = b.salt().clone().expect("salt b");
    // Each invocation rolls a fresh salt → different salt + therefore
    // different hashed password even for the same input password.
    assert_ne!(salt_a, salt_b);
    assert_ne!(a.password(), b.password());
}

// NOTE on row_desc_from_stmt: this function takes a `duckdb::Statement` which
// can only be produced from a live `duckdb::Connection`. The duckdb crate in
// this workspace is configured for `vtab-loadable` (loadable extension) mode,
// so `Connection::open_in_memory()` panics in `cargo test` with
// "DuckDB API not initialized". The function is exercised in production via
// the loaded extension and covered by `test/sql/pgwire.test`.

// ---------- encode_batches_safely ----------

#[test]
fn encode_batches_safely_normal_input() {
    let schema = Arc::new(Schema::new(vec![Field::new("i", DataType::Int32, false)]));
    let rb = RecordBatch::try_new(
        schema.clone(),
        vec![Arc::new(Int32Array::from(vec![1, 2, 3]))],
    )
    .unwrap();
    let header = Arc::new(schema_to_field_info(&schema, &Format::UnifiedText).unwrap());
    let rows = encode_batches_safely(header, vec![rb]);
    assert_eq!(rows.len(), 3, "three Int32 rows");
    for r in &rows {
        assert!(r.is_ok(), "every row should encode cleanly: {:?}", r);
    }
}

#[test]
fn encode_batches_safely_empty_batches() {
    let schema = Arc::new(Schema::new(vec![Field::new("i", DataType::Int32, false)]));
    let header = Arc::new(schema_to_field_info(&schema, &Format::UnifiedText).unwrap());
    let rows = encode_batches_safely(header, vec![]);
    assert!(rows.is_empty());
}

#[test]
fn encode_batches_safely_zero_row_batch() {
    let schema = Arc::new(Schema::new(vec![Field::new("i", DataType::Int32, false)]));
    let rb = RecordBatch::try_new(
        schema.clone(),
        vec![Arc::new(Int32Array::from(Vec::<i32>::new()))],
    )
    .unwrap();
    let header = Arc::new(schema_to_field_info(&schema, &Format::UnifiedText).unwrap());
    let rows = encode_batches_safely(header, vec![rb]);
    assert!(rows.is_empty(), "zero-row batch produces no DataRows");
}

// NOTE: An induced-panic test for the panic-recovery branch is not included
// here. Constructing a RecordBatch whose rebuild/encode path panics reliably
// would require maintaining an unstable hand-rolled Array impl. The panic
// recovery path is observed indirectly when arrow-pg encounters malformed
// inputs in production; covering it here is not worth the brittleness.

// ---------- DuckDB 2.0 NULL-typed column (`SELECT NULL AS x`) ----------

#[test]
fn null_typed_column_encodes() {
    use duckdb::arrow::array::NullArray;
    let schema = Arc::new(Schema::new(vec![Field::new("x", DataType::Null, true)]));
    let header = schema_to_field_info(&schema, &Format::UnifiedText).unwrap();
    assert_eq!(header[0].datatype().oid(), 25, "NULL column is advertised as text");
    let rb = RecordBatch::try_new(schema, vec![Arc::new(NullArray::new(1))]).unwrap();
    let rows = encode_batches_safely(Arc::new(header), vec![rb]);
    assert_eq!(rows.len(), 1);
    assert!(rows[0].is_ok(), "NULL row must encode: {:?}", rows[0]);
}

// VARIANT decoding fails inside the pool session; the wire error must be
// SQLSTATE 0A000. The live round trip is covered by psql against the loaded
// extension, since cargo test has no DuckDB C API table.
#[test]
fn variant_column_encodes_or_errors_cleanly() {
    let msg = "query exec: Conversion error from type Variant at index: 0, decoding Variant columns is not supported";
    assert_eq!(exec_error_sqlstate(msg), "0A000");
    assert_eq!(exec_error_sqlstate("Catalog Error: table x does not exist"), "XX000");
}
