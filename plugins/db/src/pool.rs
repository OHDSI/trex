//! Thin wrappers around `trex_pool_client` session-based API for one-off queries.

use arrow_array::RecordBatch;
use arrow_schema::{Schema, SchemaRef};
use std::sync::Arc;

/// Execute a one-off SQL query via a short-lived session, returning Arrow batches.
pub fn execute(sql: &str) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let sid = trex_pool_client::create_session()?;
    let result = trex_pool_client::session_execute(sid, sql);
    let _ = trex_pool_client::destroy_session(sid);
    result
}

/// Execute a one-off SQL query via a short-lived session, returning Arrow batches.
/// Alias with explicit schema ref return for callers that need `SchemaRef`.
pub fn read_arrow(sql: &str) -> Result<(SchemaRef, Vec<RecordBatch>), String> {
    execute(sql)
}

/// Execute a one-off write statement via a short-lived session, discarding results.
pub fn write(sql: &str) -> Result<(), String> {
    let sid = trex_pool_client::create_session()?;
    let _ = trex_pool_client::session_execute(sid, sql);
    let _ = trex_pool_client::destroy_session(sid);
    Ok(())
}

#[cfg(test)]
mod tests {
    //! Inline tests for the pool wrapper.
    //!
    //! The trex_pool extension is loaded by DuckDB at runtime; from `cargo
    //! test --lib` it is not present, so `create_session()` returns the
    //! "trex_pool extension not loaded" error. We assert each wrapper
    //! surfaces that error (the same code path callers see in production
    //! when the pool extension is missing or fails to load).
    use super::*;

    fn assert_pool_not_loaded(err: &str) {
        let lower = err.to_lowercase();
        assert!(
            lower.contains("trex_pool") || lower.contains("not loaded"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn execute_without_pool_returns_error() {
        let err = execute("SELECT 1").unwrap_err();
        assert_pool_not_loaded(&err);
    }

    #[test]
    fn read_arrow_without_pool_returns_error() {
        // read_arrow is an alias for execute; same error path.
        let err = read_arrow("SELECT 42").unwrap_err();
        assert_pool_not_loaded(&err);
    }

    #[test]
    fn write_without_pool_returns_error() {
        let err = write("CREATE TABLE t(x INT)").unwrap_err();
        assert_pool_not_loaded(&err);
    }

    #[test]
    fn execute_accepts_empty_sql() {
        // Empty SQL is still routed through create_session, which is what
        // fails first when the pool is not loaded — verify we don't panic
        // on the empty case.
        let err = execute("").unwrap_err();
        assert_pool_not_loaded(&err);
    }

    #[test]
    fn write_with_large_sql_does_not_panic() {
        // Build a 4 KiB SQL string to exercise the str -> session path.
        let sql = format!("SELECT '{}'", "x".repeat(4096));
        let err = write(&sql).unwrap_err();
        assert_pool_not_loaded(&err);
    }
}
