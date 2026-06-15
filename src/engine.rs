use std::ffi::CString;
use std::mem::ManuallyDrop;
use std::os::raw::c_char;
use std::ptr;
use std::sync::Mutex;

use duckdb::ffi;
use duckdb::Connection;

use crate::result::TrexResult;

// A TrexDatabase is backed either by its own DuckDB connection, or by a session
// borrowed from the trex pool (so it shares the host engine's instance — same
// catalog, attached cache files, etc.).
enum Backend {
    DuckDb {
        conn: Mutex<ManuallyDrop<Connection>>,
        raw_db: ffi::duckdb_database,
        // Whether we own raw_db (and must close it on drop). False when wrapping
        // a handle owned by the host process.
        owns_db: bool,
    },
    // A pool session id (see plugins/pool). Queries route through trex_pool_client
    // so they run on the shared host instance; destroyed on drop.
    Pool {
        session_id: u64,
    },
}

pub struct TrexDatabase {
    backend: Backend,
}

unsafe impl Send for TrexDatabase {}
unsafe impl Sync for TrexDatabase {}

impl TrexDatabase {
    /// `flags`: bit 0 = allow unsigned extensions.
    pub fn open(path: &str, flags: u32) -> Result<Self, String> {
        unsafe {
            let mut config: ffi::duckdb_config = ptr::null_mut();
            if ffi::duckdb_create_config(&mut config) != ffi::DuckDBSuccess {
                return Err("Failed to create config".into());
            }

            if flags & 1 != 0 {
                let key = CString::new("allow_unsigned_extensions").unwrap();
                let val = CString::new("true").unwrap();
                ffi::duckdb_set_config(config, key.as_ptr(), val.as_ptr());
            }

            let c_path = CString::new(path).map_err(|e| e.to_string())?;
            let mut raw_db: ffi::duckdb_database = ptr::null_mut();
            let mut c_err: *mut c_char = ptr::null_mut();

            let rc = ffi::duckdb_open_ext(c_path.as_ptr(), &mut raw_db, config, &mut c_err);
            ffi::duckdb_destroy_config(&mut config);

            if rc != ffi::DuckDBSuccess {
                let msg = if c_err.is_null() {
                    "Failed to open database".to_string()
                } else {
                    let s = std::ffi::CStr::from_ptr(c_err).to_string_lossy().to_string();
                    ffi::duckdb_free(c_err as *mut std::ffi::c_void);
                    s
                };
                return Err(msg);
            }

            let conn = Connection::open_from_raw(raw_db)
                .map_err(|e| format!("Failed to create connection: {e}"))?;
            let _ = conn.execute_batch("CALL disable_logging()");

            Ok(TrexDatabase {
                backend: Backend::DuckDb {
                    conn: Mutex::new(ManuallyDrop::new(conn)),
                    raw_db,
                    owns_db: true,
                },
            })
        }
    }

    /// Wrap an existing host-owned `duckdb_database` (not closed on drop).
    ///
    /// # Safety
    /// `raw_db` must be a live handle from the same in-process DuckDB library.
    pub unsafe fn open_existing(raw_db: ffi::duckdb_database) -> Result<Self, String> {
        if raw_db.is_null() {
            return Err("open_existing: null database handle".into());
        }
        let conn = Connection::open_from_raw(raw_db)
            .map_err(|e| format!("Failed to connect to existing database: {e}"))?;
        let _ = conn.execute_batch("CALL disable_logging()");
        Ok(TrexDatabase {
            backend: Backend::DuckDb {
                conn: Mutex::new(ManuallyDrop::new(conn)),
                raw_db,
                owns_db: false,
            },
        })
    }

    /// Acquire a session from the trex pool so queries run on the shared host
    /// instance (same mechanism the runtime/pgwire use), rather than a private
    /// database. The pool must be initialised (trex runs inside the engine).
    pub fn open_pool_session() -> Result<Self, String> {
        let session_id = trex_pool_client::create_session()
            .map_err(|e| format!("Failed to acquire pool session: {e}"))?;
        Ok(TrexDatabase {
            backend: Backend::Pool { session_id },
        })
    }

    pub fn execute(&self, sql: &str) -> Result<(), String> {
        match &self.backend {
            Backend::DuckDb { conn, .. } => {
                let conn = conn.lock().map_err(|e| e.to_string())?;
                conn.execute_batch(sql).map_err(|e| format!("{e}"))
            }
            Backend::Pool { session_id } => {
                trex_pool_client::session_execute(*session_id, sql).map(|_| ())
            }
        }
    }

    pub fn query(&self, sql: &str) -> Result<TrexResult, String> {
        match &self.backend {
            Backend::DuckDb { conn, .. } => {
                let conn = conn.lock().map_err(|e| e.to_string())?;
                TrexResult::from_query(&conn, sql)
            }
            Backend::Pool { session_id } => {
                let (schema, batches) = trex_pool_client::session_execute(*session_id, sql)?;
                TrexResult::from_pool_batches(&schema, &batches)
            }
        }
    }

    /// The underlying `duckdb_database` (for the appender API). Null for pool
    /// sessions, where the appender path is unsupported (use SQL instead).
    pub fn raw_db(&self) -> ffi::duckdb_database {
        match &self.backend {
            Backend::DuckDb { raw_db, .. } => *raw_db,
            Backend::Pool { .. } => ptr::null_mut(),
        }
    }
}

impl Drop for TrexDatabase {
    fn drop(&mut self) {
        match &mut self.backend {
            Backend::DuckDb { conn, raw_db, owns_db } => {
                let conn = conn.get_mut().unwrap_or_else(|e| e.into_inner());
                unsafe { ManuallyDrop::drop(conn); }
                if *owns_db && !raw_db.is_null() {
                    unsafe { ffi::duckdb_close(raw_db); }
                }
            }
            Backend::Pool { session_id } => {
                let _ = trex_pool_client::destroy_session(*session_id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_memory() {
        let db = TrexDatabase::open(":memory:", 0).unwrap();
        db.execute("CREATE TABLE t (x INTEGER)").unwrap();
        db.execute("INSERT INTO t VALUES (42)").unwrap();
        let result = db.query("SELECT x FROM t").unwrap();
        assert_eq!(result.column_count(), 1);
    }

    #[test]
    fn test_open_unsigned() {
        let db = TrexDatabase::open(":memory:", 1).unwrap();
        db.execute("SELECT 1").unwrap();
    }

    #[test]
    fn test_execute_error() {
        let db = TrexDatabase::open(":memory:", 0).unwrap();
        let err = db.execute("SELECT * FROM nonexistent_table").unwrap_err();
        assert!(err.contains("nonexistent_table"));
    }

    #[test]
    fn test_error_handling() {
        crate::error::set_last_error("test error");
        let ptr = crate::error::last_error_ptr();
        assert!(!ptr.is_null());
        crate::error::clear_last_error();
        let ptr = crate::error::last_error_ptr();
        assert!(ptr.is_null());
    }
}
