//! Local connections for operations that need direct `&Connection` access
//! (e.g. registering ArrowVTab, using appender). These can't go through
//! the C ABI string-based interface.
//!
//! Reads go through the session-based pool API (`crate::pool`) when possible.
//! Only complex operations that need closures use these local connections.

use duckdb::Connection;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};

static LOCAL_CONNS: OnceLock<Vec<Mutex<Connection>>> = OnceLock::new();
static NEXT: AtomicUsize = AtomicUsize::new(0);

pub fn init(connection: &Connection, pool_size: usize) -> Result<(), String> {
    let mut conns = Vec::with_capacity(pool_size);
    for i in 0..pool_size {
        conns.push(Mutex::new(
            connection
                .try_clone()
                .map_err(|e| format!("local conn clone {i}: {e}"))?,
        ));
    }
    LOCAL_CONNS
        .set(conns)
        .map_err(|_| "local connections already initialized".to_string())
}

/// Run a closure with direct access to a local connection (round-robin).
pub fn with_connection<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, String>,
{
    let conns = LOCAL_CONNS
        .get()
        .ok_or("local connections not initialized")?;
    let idx = NEXT.fetch_add(1, Ordering::Relaxed) % conns.len();
    let guard = conns[idx]
        .lock()
        .map_err(|e| format!("local conn lock: {e}"))?;
    f(&guard)
}

#[cfg(test)]
mod tests {
    //! Inline tests for the local connections pool.
    //!
    //! `LOCAL_CONNS` is a process-global `OnceLock`. Production code
    //! initializes it once at extension load. Under `cargo test --lib` it
    //! is never initialized, so `with_connection` always returns the
    //! "not initialized" error. We exercise both the early-out path and
    //! the call-shape (closure never invoked when uninitialized).
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn with_connection_without_init_errors() {
        let err = with_connection(|_| Ok::<(), String>(())).unwrap_err();
        assert!(
            err.contains("not initialized"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn with_connection_does_not_invoke_closure_when_uninitialized() {
        // Track whether the closure ran. If LOCAL_CONNS is unset, the
        // function must short-circuit and return Err before calling `f`.
        let called = AtomicBool::new(false);
        let result: Result<i32, String> = with_connection(|_| {
            called.store(true, Ordering::SeqCst);
            Ok(0)
        });
        assert!(result.is_err());
        assert!(
            !called.load(Ordering::SeqCst),
            "closure must not be invoked when uninitialized"
        );
    }

    #[test]
    fn with_connection_propagates_error_type_string() {
        // Closure return type is `Result<R, String>`; the wrapper preserves it.
        let r: Result<String, String> = with_connection(|_| Ok("ok".to_string()));
        // Err because uninitialized, but compile-time confirms the generic R.
        assert!(r.is_err());
    }
}
