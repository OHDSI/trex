use std::ffi::{CStr, CString};

use trexsql_engine::c_api::*;
use trexsql_engine::engine::TrexDatabase;

fn one_string(db: &TrexDatabase, sql: &str) -> String {
    let mut r = db.query(sql).unwrap();
    assert!(r.next());
    r.get_string(0).unwrap().to_string_lossy().into_owned()
}

#[test]
fn engine_reports_v2() {
    let db = TrexDatabase::open(":memory:", 0).unwrap();
    assert_eq!(one_string(&db, "SELECT version()"), "v2.0.0");
}

#[test]
fn attaches_v1_4_file_read_write() {
    let dir = std::env::temp_dir().join(format!("duckdb2_compat_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let copy = dir.join("v1_4_4.db");
    std::fs::copy(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/v1_4_4.db"), &copy).unwrap();

    let db = TrexDatabase::open(":memory:", 0).unwrap();
    db.execute(&format!("ATTACH '{}' AS f", copy.display())).unwrap();
    db.execute("INSERT INTO f.t VALUES (3)").unwrap();
    assert_eq!(one_string(&db, "SELECT sum(i)::VARCHAR FROM f.t"), "6");
    drop(db);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn c_api_open_existing_roundtrip() {
    // SAFETY: pointers come from trexsql_open and are checked non-null before use; closed once.
    unsafe {
        let path = CString::new(":memory:").unwrap();
        let owner = trexsql_open(path.as_ptr(), 1);
        assert!(!owner.is_null());
        let shared = trexsql_open_existing((*owner).raw_db());
        assert!(!shared.is_null());

        let sql = CString::new("SELECT 42").unwrap();
        let r = trexsql_query(shared, sql.as_ptr());
        assert!(!r.is_null(), "{:?}", CStr::from_ptr(trexsql_last_error()));
        assert_eq!(trexsql_result_next(r), 1);
        assert_eq!(trexsql_result_get_long(r, 0), 42);
        trexsql_result_close(r);
        trexsql_close(shared);
        trexsql_close(owner);
    }
}
