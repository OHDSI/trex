//! Shared DuckDB connection pool — leasing facility.
//!
//! This crate is a DuckDB extension (`pool.trex`) loaded before all other
//! extensions. It initialises the shared pool in its `extension_entrypoint`
//! and exports `#[no_mangle] extern "C"` functions that consumer extensions
//! discover via `dlsym` at runtime.
//!
//! The pool is a bounded set of cloned DuckDB Connections served through a
//! crossbeam channel. A session leases a Connection on creation, runs queries
//! directly against it, and returns it on destroy after a fixed cleanup
//! sequence. There is no SQL routing, classification, or state replay.
//!
//! Consumer extensions depend on the `trex-pool-client` rlib, which provides
//! safe Rust wrappers around the C ABI.

use crossbeam_channel::{bounded, Receiver, Sender};
pub use duckdb;
pub use duckdb::arrow;
use duckdb::arrow::datatypes::Schema;
use duckdb::arrow::record_batch::RecordBatch;
use duckdb::Connection;
use std::collections::HashMap;
use std::os::raw::c_void;
use std::panic::{self, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tracing::warn;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PoolBackend {
    Local,
    Remote,
}

/// Decide which backend the pool serves. Reads SWARM_CONFIG + SWARM_NODE
/// directly to avoid pulling in trex-db's full config crate.
pub fn decide_backend() -> PoolBackend {
    let cfg = match std::env::var("SWARM_CONFIG").ok() {
        Some(s) => s,
        None => return PoolBackend::Local,
    };
    let node = match std::env::var("SWARM_NODE").ok() {
        Some(s) => s,
        None => return PoolBackend::Local,
    };
    let parsed: serde_json::Value = match serde_json::from_str(&cfg) {
        Ok(v) => v,
        Err(_) => return PoolBackend::Local,
    };
    let nodes = match parsed.get("nodes").and_then(|v| v.as_object()) {
        Some(n) => n,
        None => return PoolBackend::Local,
    };
    let this = match nodes.get(&node) {
        Some(n) => n,
        None => return PoolBackend::Local,
    };
    let is_data = this.get("data_node").and_then(|v| v.as_bool()).unwrap_or(true);
    if is_data { PoolBackend::Local } else { PoolBackend::Remote }
}

static BACKEND: std::sync::OnceLock<PoolBackend> = std::sync::OnceLock::new();

pub fn backend() -> PoolBackend {
    *BACKEND.get_or_init(decide_backend)
}

const REMOTE_BIT: u64 = 1u64 << 63;

fn remote_id_to_pool_id(id: u64) -> u64 {
    id | REMOTE_BIT
}

fn pool_id_to_remote_id(id: u64) -> u64 {
    id & !REMOTE_BIT
}

fn is_remote_id(id: u64) -> bool {
    id & REMOTE_BIT != 0
}

struct SharedPool {
    sender: Sender<Connection>,
    receiver: Receiver<Connection>,
}

static POOL: OnceLock<Arc<SharedPool>> = OnceLock::new();

struct SessionEntry {
    /// Holds the Connection while the session is alive. `None` only between
    /// `destroy_session` removing the entry from the map and the cleanup +
    /// channel send returning the Connection to the pool.
    conn: Option<Connection>,
    /// Set when a query may have left non-replayable session state behind
    /// (temp tables, prepared statements, SET, attached extensions, …).
    /// Gates the expensive cleanup branch in `destroy_session`.
    dirty: Arc<AtomicBool>,
}

static SESSIONS: OnceLock<Mutex<HashMap<u64, SessionEntry>>> = OnceLock::new();
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

thread_local! {
    /// Reason the most recent `trex_pool_session_create` on THIS thread returned
    /// 0. The C ABI signals failure only via a 0 id, so the descriptive error
    /// (e.g. the remote backend's "no service:flight entry from a data node yet")
    /// is stashed here for `trex_pool_session_create_last_error` to surface.
    static LAST_CREATE_ERR: std::cell::RefCell<Vec<u8>> = const { std::cell::RefCell::new(Vec::new()) };
}

fn sessions() -> &'static Mutex<HashMap<u64, SessionEntry>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_pool() -> Result<&'static Arc<SharedPool>, String> {
    POOL.get().ok_or_else(|| "pool not initialised".to_string())
}

/// Initialise the shared pool from an existing Connection. Clones it
/// `pool_size` times and seeds the channel.
pub fn init_from_connection(conn: &Connection, pool_size: usize) -> Result<(), String> {
    if pool_size == 0 {
        return Err("pool_size must be > 0".to_string());
    }
    let (sender, receiver) = bounded::<Connection>(pool_size);
    for i in 0..pool_size {
        let c = conn
            .try_clone()
            .map_err(|e| format!("pool clone {i}: {e}"))?;
        sender
            .send(c)
            .map_err(|e| format!("pool seed {i}: {e}"))?;
    }
    POOL.set(Arc::new(SharedPool { sender, receiver }))
        .map_err(|_| "pool already initialised".to_string())?;
    Ok(())
}

/// Initialise the shared pool from a raw `duckdb_database` handle.
///
/// # Safety
///
/// `db_ptr` must be a valid `duckdb_database` handle that outlives the pool.
pub unsafe fn init(db_ptr: *mut c_void, pool_size: usize) -> Result<(), String> {
    let base_conn = Connection::open_from_raw(db_ptr.cast())
        .map_err(|e| format!("open_from_raw: {e}"))?;
    init_from_connection(&base_conn, pool_size)?;
    // base_conn must outlive the pool (which is 'static).
    std::mem::forget(base_conn);
    Ok(())
}

/// Maximum time `create_local_session` waits for a free pooled Connection
/// before giving up. Override with `TREX_POOL_LEASE_TIMEOUT_MS`.
///
/// Without a bound, an exhausted pool (leaked or long-parked sessions — e.g. a
/// devx generation request that never completes) makes every subsequent lease
/// block forever: pgwire connections and the function runtime alike hang, and
/// the only recovery is a node restart. A bounded wait turns that unrecoverable
/// hard freeze into a per-request error the caller can surface and retry.
fn lease_timeout() -> std::time::Duration {
    parse_lease_timeout(std::env::var("TREX_POOL_LEASE_TIMEOUT_MS").ok())
}

/// Pure parser for `lease_timeout` — falls back to the default for a missing,
/// empty, non-numeric, or zero value (a zero or negative wait would defeat the
/// purpose, reintroducing the indefinite block / immediate spurious failures).
fn parse_lease_timeout(raw: Option<String>) -> std::time::Duration {
    const DEFAULT_LEASE_TIMEOUT_MS: u64 = 30_000;
    let ms = raw
        .and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(DEFAULT_LEASE_TIMEOUT_MS);
    std::time::Duration::from_millis(ms)
}

/// Lease a Connection from the pool and register a session for it. Waits up to
/// `lease_timeout()` for a Connection (channel backpressure when exhausted),
/// then returns an error rather than blocking forever.
pub fn create_local_session() -> Result<u64, String> {
    let pool = get_pool()?;
    let timeout = lease_timeout();
    let conn = pool.receiver.recv_timeout(timeout).map_err(|e| match e {
        crossbeam_channel::RecvTimeoutError::Timeout => format!(
            "pool exhausted: no DuckDB connection available within {timeout:?}; \
             raise TREX_POOL_SIZE or investigate leaked/long-held sessions"
        ),
        crossbeam_channel::RecvTimeoutError::Disconnected => {
            "pool receiver closed".to_string()
        }
    })?;
    let id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    sessions()
        .lock()
        .expect("sessions lock poisoned")
        .insert(
            id,
            SessionEntry {
                conn: Some(conn),
                dirty: Arc::new(AtomicBool::new(false)),
            },
        );
    Ok(id)
}

/// Execute SQL on the session's leased Connection.
pub fn session_execute_local(
    session_id: u64,
    sql: &str,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    session_execute_params_local(session_id, sql, &[])
}

/// Execute parameterised SQL on the session's leased Connection. The
/// SESSIONS mutex is released before the query runs so other sessions are
/// unaffected by a long-running statement.
pub fn session_execute_params_local(
    session_id: u64,
    sql: &str,
    params: &[String],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let (conn, dirty) = take_conn(session_id)?;
    if sql_may_dirty_session(sql) {
        dirty.store(true, Ordering::Relaxed);
    }
    let result = panic::catch_unwind(AssertUnwindSafe(|| run_query(&conn, sql, params)));
    return_conn(session_id, conn);
    match result {
        Ok(r) => r,
        Err(panic_err) => {
            let msg = extract_panic_message(panic_err);
            warn!(error = %msg, "session query panicked");
            Err(format!("query panicked: {msg}"))
        }
    }
}

/// Coarse substring check for SQL that may leave non-replayable session
/// state behind. Exists because the catalog scan in `cleanup_connection`
/// dominates per-request latency on the FHIR write hot path
/// (BEGIN/INSERT/COMMIT, no temp tables, no PREPARE). False positives only
/// re-run the existing cleanup; false negatives are acceptable.
fn sql_may_dirty_session(sql: &str) -> bool {
    let upper = sql.to_uppercase();
    upper.contains("TEMP")
        || upper.contains("PREPARE")
        || upper.contains("DECLARE")
        || upper.contains("ATTACH")
        || upper.contains('#')
        || upper.contains("PG_TEMP")
        || upper.contains("SET ")
        || upper.contains("USE ")
        || upper.contains("INSTALL")
        || upper.contains("LOAD")
}

/// Briefly take the Connection out of the SessionEntry so the SESSIONS lock
/// is not held across query execution. The Connection is `try_clone`-derived,
/// so cloning it again here would cost a DuckDB call per query — instead we
/// move the option in/out under the lock.
fn take_conn(session_id: u64) -> Result<(Connection, Arc<AtomicBool>), String> {
    let mut map = sessions().lock().expect("sessions lock poisoned");
    let entry = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("session {session_id} not found"))?;
    let conn = entry
        .conn
        .take()
        .ok_or_else(|| format!("session {session_id} busy"))?;
    Ok((conn, Arc::clone(&entry.dirty)))
}

fn return_conn(session_id: u64, conn: Connection) {
    let mut map = sessions().lock().expect("sessions lock poisoned");
    if let Some(entry) = map.get_mut(&session_id) {
        entry.conn = Some(conn);
    }
}

fn run_query(
    conn: &Connection,
    sql: &str,
    params: &[String],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let mut stmt = conn.prepare(sql).map_err(|e| format!("prepare: {e}"))?;
    let param_refs: Vec<&dyn duckdb::types::ToSql> =
        params.iter().map(|s| s as &dyn duckdb::types::ToSql).collect();
    let arrow_result = stmt
        .query_arrow(param_refs.as_slice())
        .map_err(|e| format!("query exec: {e}"))?;
    let schema = arrow_result.get_schema();
    let batches: Vec<RecordBatch> = arrow_result.collect();
    Ok((schema, batches))
}

/// Destroy a session: remove from the map, run the cleanup sequence on the
/// leased Connection, then return it to the pool channel.
pub fn destroy_local_session(session_id: u64) {
    let (conn, dirty) = {
        let mut map = sessions().lock().expect("sessions lock poisoned");
        match map.remove(&session_id) {
            Some(entry) => (entry.conn, entry.dirty),
            None => return,
        }
    };
    let Some(conn) = conn else { return };

    if dirty.load(Ordering::Relaxed) {
        cleanup_connection(&conn);
    } else if let Err(e) = conn.execute_batch("ROLLBACK") {
        warn!(error = %e, "cleanup ROLLBACK failed");
    }

    if let Ok(pool) = get_pool() {
        if let Err(e) = pool.sender.send(conn) {
            warn!(error = %e, session_id, "failed to return connection to pool");
        }
    }
}

fn do_retry_remote_create(
    delay: std::time::Duration,
    attempts: u32,
) -> Result<u64, String> {
    let mut last_err = "no attempts made".to_string();
    for _ in 0..attempts {
        match trex_db_client::create_remote_session() {
            Ok(id) => return Ok(id),
            Err(e) => {
                last_err = e;
                std::thread::sleep(delay);
            }
        }
    }
    Err(format!("create_remote_session: {}", last_err))
}

#[cfg(test)]
fn retry_remote_create_for_test(
    delay: std::time::Duration,
    attempts: u32,
) -> Result<u64, String> {
    do_retry_remote_create(delay, attempts)
}

/// Lease a session. Dispatches to the local pool when this node is a data
/// node, or to a remote data node via trex-db-client when this node is a
/// server-only node. Remote ids are tagged with REMOTE_BIT so the caller can
/// pass them back to `session_execute` / `destroy_session` without knowing.
pub fn create_session() -> Result<u64, String> {
    match backend() {
        PoolBackend::Local => create_local_session(),
        PoolBackend::Remote => do_retry_remote_create(
            std::time::Duration::from_millis(200),
            25, // ~5 s total tolerance for gossip convergence
        ).map(remote_id_to_pool_id),
    }
}

/// Execute SQL on a session — routes to the local pool or to trex-db-client
/// based on the REMOTE_BIT in `session_id`.
pub fn session_execute(
    session_id: u64,
    sql: &str,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    if is_remote_id(session_id) {
        let remote = pool_id_to_remote_id(session_id);
        trex_db_client::remote_session_execute(remote, sql)
    } else {
        session_execute_local(session_id, sql)
    }
}

/// Execute parameterised SQL — routes to the local pool or, for a remote
/// session, ships the SQL + positional string params to the data node where
/// they bind against the local pool there.
pub fn session_execute_params(
    session_id: u64,
    sql: &str,
    params: &[String],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    if is_remote_id(session_id) {
        let remote = pool_id_to_remote_id(session_id);
        return trex_db_client::remote_session_execute_params(remote, sql, params);
    }
    session_execute_params_local(session_id, sql, params)
}

/// Destroy a session — routes by REMOTE_BIT. Silent no-op on unknown ids.
pub fn destroy_session(session_id: u64) {
    if is_remote_id(session_id) {
        trex_db_client::destroy_remote_session(pool_id_to_remote_id(session_id));
    } else {
        destroy_local_session(session_id)
    }
}

fn cleanup_connection(conn: &Connection) {
    if let Err(e) = conn.execute_batch("ROLLBACK") {
        warn!(error = %e, "cleanup ROLLBACK failed");
    }
    if let Err(e) = conn.execute_batch("RESET ALL") {
        warn!(error = %e, "cleanup RESET ALL failed");
    }
    if let Err(e) = conn.execute_batch("DEALLOCATE ALL") {
        warn!(error = %e, "cleanup DEALLOCATE ALL failed");
    }
    drop_temp_tables(conn);
}

fn drop_temp_tables(conn: &Connection) {
    let names: Vec<String> = match conn.prepare(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema='main' AND table_catalog='temp'",
    ) {
        Ok(mut stmt) => match stmt.query_map(duckdb::params![], |row| row.get::<_, String>(0)) {
            Ok(rows) => rows.filter_map(Result::ok).collect(),
            Err(e) => {
                warn!(error = %e, "cleanup enumerate temp tables failed");
                return;
            }
        },
        Err(e) => {
            warn!(error = %e, "cleanup prepare temp-table query failed");
            return;
        }
    };

    for name in names {
        let escaped = name.replace('"', "\"\"");
        let sql = format!("DROP TABLE IF EXISTS temp.main.\"{escaped}\"");
        if let Err(e) = conn.execute_batch(&sql) {
            warn!(error = %e, table = %name, "cleanup drop temp table failed");
        }
    }
}

fn extract_panic_message(err: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = err.downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = err.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    }
}

/// Serialize Arrow RecordBatches to IPC stream format.
fn serialize_arrow_ipc(
    schema: &Arc<Schema>,
    batches: &[RecordBatch],
) -> Result<Vec<u8>, String> {
    use arrow_ipc::writer::StreamWriter;

    let mut buf = Vec::new();
    let mut writer = StreamWriter::try_new(&mut buf, schema)
        .map_err(|e| format!("ipc writer init: {e}"))?;

    for batch in batches {
        writer.write(batch).map_err(|e| format!("ipc write batch: {e}"))?;
    }
    writer.finish().map_err(|e| format!("ipc finish: {e}"))?;

    Ok(buf)
}


const DEFAULT_POOL_SIZE: usize = 1024;

#[duckdb_loadable_macros::duckdb_entrypoint_c_api(ext_name = "pool")]
pub unsafe fn extension_entrypoint(con: Connection) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let pool_size: usize = std::env::var("TREX_POOL_SIZE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_POOL_SIZE)
        .max(1);

    // pg-compat shim: `regclass` is not a DuckDB type, so `'schema.tbl'::regclass`
    // casts error with a catalog lookup failure. Stub it as a VARCHAR alias so the
    // cast parses and round-trips the relation name instead of erroring. Registered
    // on the base connection before cloning, so the shared catalog makes it visible
    // to every pooled clone and every other consumer (pgwire, db/flight, direct
    // callers). IF NOT EXISTS keeps it idempotent across reboots on an on-disk DB.
    // This is a stub, not real regclass: there is no name<->OID resolution.
    if let Err(e) = con.execute_batch("CREATE TYPE IF NOT EXISTS regclass AS VARCHAR") {
        warn!(error = %e, "failed to register regclass pg-compat stub");
    }

    init_from_connection(&con, pool_size)
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

    Ok(())
}

//
// C ABI — discovered by consumer extensions via dlsym.
//

/// Opaque handle for Arrow IPC result. Contains serialized IPC stream bytes.
/// Must be freed with `trex_pool_arrow_result_free`.
pub struct CArrowResult {
    data: Vec<u8>,
    error: Option<String>,
}

/// Check if the Arrow result is an error.
#[no_mangle]
pub extern "C" fn trex_pool_arrow_result_is_error(result: *const CArrowResult) -> i32 {
    if result.is_null() { return 1; }
    let r = unsafe { &*result };
    if r.error.is_some() { 1 } else { 0 }
}

/// Get the Arrow IPC bytes from a result. Sets `out_ptr` and `out_len`.
/// Returns 0 on success, 1 if no data (write result or error).
#[no_mangle]
pub extern "C" fn trex_pool_arrow_result_data(
    result: *const CArrowResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    if result.is_null() { return 1; }
    let r = unsafe { &*result };
    if r.data.is_empty() {
        return 1;
    }
    unsafe {
        *out_ptr = r.data.as_ptr();
        *out_len = r.data.len();
    }
    0
}

/// Get the error message from an Arrow result.
#[no_mangle]
pub extern "C" fn trex_pool_arrow_result_error(
    result: *const CArrowResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) {
    if result.is_null() { return; }
    let r = unsafe { &*result };
    if let Some(ref e) = r.error {
        unsafe {
            *out_ptr = e.as_ptr();
            *out_len = e.len();
        }
    }
}

/// Free an Arrow result handle.
#[no_mangle]
pub extern "C" fn trex_pool_arrow_result_free(result: *mut CArrowResult) {
    if !result.is_null() {
        unsafe { drop(Box::from_raw(result)); }
    }
}

/// Lease a Connection and register a session for it. Returns 0 on failure
/// (pool not initialised, sender closed, or — on a server-only node — the remote
/// data node unreachable). The failure reason is stashed for
/// `trex_pool_session_create_last_error`.
#[no_mangle]
pub extern "C" fn trex_pool_session_create() -> u64 {
    match create_session() {
        Ok(id) => {
            LAST_CREATE_ERR.with(|c| c.borrow_mut().clear());
            id
        }
        Err(e) => {
            LAST_CREATE_ERR.with(|c| *c.borrow_mut() = e.into_bytes());
            0
        }
    }
}

/// Borrow the reason the last `trex_pool_session_create` on this thread failed.
/// The pointer is valid until the next create call on the same thread; callers
/// copy it immediately. Empty when the last create succeeded.
#[no_mangle]
pub unsafe extern "C" fn trex_pool_session_create_last_error(
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) {
    LAST_CREATE_ERR.with(|c| {
        let b = c.borrow();
        *out_ptr = b.as_ptr();
        *out_len = b.len();
    });
}

/// Execute SQL within a session, returning Arrow IPC bytes.
#[no_mangle]
pub extern "C" fn trex_pool_session_execute_arrow(
    session_id: u64,
    sql_ptr: *const u8,
    sql_len: usize,
) -> *mut CArrowResult {
    trex_pool_session_execute_params_arrow(
        session_id, sql_ptr, sql_len,
        std::ptr::null(), std::ptr::null(), 0,
    )
}

/// Execute parameterized SQL within a session, returning Arrow IPC bytes.
#[no_mangle]
pub extern "C" fn trex_pool_session_execute_params_arrow(
    session_id: u64,
    sql_ptr: *const u8,
    sql_len: usize,
    params_ptrs: *const *const u8,
    params_lens: *const usize,
    params_count: usize,
) -> *mut CArrowResult {
    let sql = unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(sql_ptr, sql_len)) };
    let params: Vec<String> = if params_count > 0 && !params_ptrs.is_null() && !params_lens.is_null() {
        unsafe {
            let ptrs = std::slice::from_raw_parts(params_ptrs, params_count);
            let lens = std::slice::from_raw_parts(params_lens, params_count);
            ptrs.iter().zip(lens.iter()).map(|(&p, &l)| {
                std::str::from_utf8_unchecked(std::slice::from_raw_parts(p, l)).to_string()
            }).collect()
        }
    } else {
        Vec::new()
    };
    let cresult = match session_execute_params(session_id, sql, &params) {
        Ok((schema, batches)) => match serialize_arrow_ipc(&schema, &batches) {
            Ok(data) => CArrowResult { data, error: None },
            Err(e) => CArrowResult { data: Vec::new(), error: Some(e) },
        },
        Err(e) => CArrowResult { data: Vec::new(), error: Some(e) },
    };
    Box::into_raw(Box::new(cresult))
}

/// Destroy a session: clean up its Connection and return it to the pool.
#[no_mangle]
pub extern "C" fn trex_pool_session_destroy(session_id: u64) {
    destroy_session(session_id);
}

#[cfg(test)]
mod backend_tests {
    use super::*;

    #[test]
    fn decide_backend_dispatches_by_config() {
        // local: no env vars set
        std::env::remove_var("SWARM_CONFIG");
        std::env::remove_var("SWARM_NODE");
        assert!(matches!(decide_backend(), PoolBackend::Local));

        // remote: data_node false
        std::env::set_var("SWARM_NODE", "server");
        std::env::set_var(
            "SWARM_CONFIG",
            r#"{"cluster_id":"c","nodes":{"server":{"gossip_addr":"127.0.0.1:7101","data_node":false}}}"#,
        );
        assert!(matches!(decide_backend(), PoolBackend::Remote));

        // local: data_node true
        std::env::set_var("SWARM_NODE", "data");
        std::env::set_var(
            "SWARM_CONFIG",
            r#"{"cluster_id":"c","nodes":{"data":{"gossip_addr":"127.0.0.1:7100","data_node":true}}}"#,
        );
        assert!(matches!(decide_backend(), PoolBackend::Local));

        std::env::remove_var("SWARM_CONFIG");
        std::env::remove_var("SWARM_NODE");
    }

    #[test]
    fn is_remote_id_detects_high_bit() {
        assert!(!is_remote_id(0));
        assert!(!is_remote_id(1));
        assert!(!is_remote_id(u64::MAX >> 1));
        assert!(is_remote_id(REMOTE_BIT));
        assert!(is_remote_id(REMOTE_BIT | 7));
    }

    #[test]
    fn pool_id_round_trip_preserves_remote_id() {
        let remote = 42u64;
        let pool = remote_id_to_pool_id(remote);
        assert!(is_remote_id(pool));
        assert_eq!(pool_id_to_remote_id(pool), remote);
    }

    #[test]
    fn remote_create_retries_then_gives_up() {
        let start = std::time::Instant::now();
        let result = retry_remote_create_for_test(std::time::Duration::from_millis(50), 3);
        let elapsed = start.elapsed();
        // 3 attempts with 50ms sleep between attempts ≈ 150ms total. Allow
        // a generous bound so the test isn't flaky on a loaded CI host.
        assert!(elapsed.as_millis() >= 100, "elapsed too short: {:?}", elapsed);
        assert!(elapsed.as_millis() < 2000, "elapsed too long: {:?}", elapsed);
        assert!(result.is_err(), "should fail when no data node available");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_array::{Int32Array, StringArray};
    use arrow_schema::{DataType, Field};

    // --- parse_lease_timeout: bounds the pool lease wait ---

    #[test]
    fn parse_lease_timeout_uses_default_for_absent_or_invalid() {
        let default = std::time::Duration::from_millis(30_000);
        assert_eq!(parse_lease_timeout(None), default);
        assert_eq!(parse_lease_timeout(Some(String::new())), default);
        assert_eq!(parse_lease_timeout(Some("abc".into())), default);
        // Zero would reintroduce an unbounded/immediate-fail wait — reject it.
        assert_eq!(parse_lease_timeout(Some("0".into())), default);
    }

    #[test]
    fn parse_lease_timeout_honours_valid_override() {
        assert_eq!(
            parse_lease_timeout(Some("5000".into())),
            std::time::Duration::from_millis(5000)
        );
        // Surrounding whitespace is tolerated.
        assert_eq!(
            parse_lease_timeout(Some("  1500  ".into())),
            std::time::Duration::from_millis(1500)
        );
    }

    // --- sql_may_dirty_session: substring dispatcher for cleanup branch ---

    #[test]
    fn sql_may_dirty_session_flags_temp_table_creation() {
        assert!(sql_may_dirty_session("CREATE TEMP TABLE foo (a INT)"));
        // Lowercase must also match (function uppercases input).
        assert!(sql_may_dirty_session("create temp table foo (a int)"));
    }

    #[test]
    fn sql_may_dirty_session_flags_each_dirtying_keyword() {
        let dirtying = [
            "PREPARE s AS SELECT 1",
            "DECLARE c CURSOR FOR SELECT 1",
            "ATTACH 'x.db' AS x",
            "SELECT * FROM #scratch",
            "SELECT * FROM pg_temp.foo",
            "SET memory_limit='1GB'",
            "USE main",
            "INSTALL httpfs",
            "LOAD httpfs",
        ];
        for sql in dirtying {
            assert!(
                sql_may_dirty_session(sql),
                "expected dirty for {sql:?}"
            );
        }
    }

    #[test]
    fn sql_may_dirty_session_passes_through_hot_path_write() {
        // The FHIR write hot path (BEGIN/INSERT/COMMIT) must not trigger
        // the expensive cleanup branch.
        assert!(!sql_may_dirty_session("BEGIN"));
        assert!(!sql_may_dirty_session(
            "INSERT INTO observations VALUES (1, 'x')"
        ));
        assert!(!sql_may_dirty_session("COMMIT"));
        assert!(!sql_may_dirty_session("SELECT 1"));
    }

    // --- extract_panic_message: downcasts the three payload shapes ---

    #[test]
    fn extract_panic_message_handles_str_string_and_unknown() {
        let from_str: Box<dyn std::any::Any + Send> = Box::new("boom");
        assert_eq!(extract_panic_message(from_str), "boom");

        let from_string: Box<dyn std::any::Any + Send> = Box::new(String::from("kaboom"));
        assert_eq!(extract_panic_message(from_string), "kaboom");

        // Neither &str nor String — should fall through to the default.
        let from_other: Box<dyn std::any::Any + Send> = Box::new(42u32);
        assert_eq!(extract_panic_message(from_other), "unknown panic");
    }

    // --- serialize_arrow_ipc: Arrow IPC stream round-trip ---

    #[test]
    fn serialize_arrow_ipc_roundtrips_schema_and_rows() {
        let schema = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int32, false),
            Field::new("name", DataType::Utf8, false),
        ]));
        let batch = RecordBatch::try_new(
            Arc::clone(&schema),
            vec![
                Arc::new(Int32Array::from(vec![1, 2, 3])),
                Arc::new(StringArray::from(vec!["a", "b", "c"])),
            ],
        )
        .expect("build batch");

        let bytes = serialize_arrow_ipc(&schema, std::slice::from_ref(&batch))
            .expect("serialize");
        assert!(!bytes.is_empty());

        let cursor = std::io::Cursor::new(bytes);
        let reader = arrow_ipc::reader::StreamReader::try_new(cursor, None)
            .expect("ipc reader");
        assert_eq!(reader.schema().as_ref(), schema.as_ref());
        let read_batches: Vec<RecordBatch> = reader.map(|r| r.expect("batch")).collect();
        assert_eq!(read_batches.len(), 1);
        assert_eq!(read_batches[0].num_rows(), 3);
        assert_eq!(read_batches[0].num_columns(), 2);
    }

    #[test]
    fn serialize_arrow_ipc_emits_header_for_empty_batch_list() {
        // Even with zero batches, the writer must emit a valid stream
        // (schema + EOS marker) so consumers can still read the schema.
        let schema = Arc::new(Schema::new(vec![Field::new("x", DataType::Int32, false)]));
        let bytes = serialize_arrow_ipc(&schema, &[]).expect("serialize empty");
        assert!(!bytes.is_empty());

        let cursor = std::io::Cursor::new(bytes);
        let reader = arrow_ipc::reader::StreamReader::try_new(cursor, None)
            .expect("ipc reader");
        assert_eq!(reader.schema().as_ref(), schema.as_ref());
        assert_eq!(reader.count(), 0);
    }

    // --- CArrowResult C ABI: null + empty + error/data branches ---

    #[test]
    fn carrow_result_is_error_treats_null_as_error() {
        // Null pointer must be reported as an error (defensive default).
        assert_eq!(trex_pool_arrow_result_is_error(std::ptr::null()), 1);

        let ok = Box::into_raw(Box::new(CArrowResult { data: vec![1, 2, 3], error: None }));
        let err = Box::into_raw(Box::new(CArrowResult {
            data: Vec::new(),
            error: Some("nope".into()),
        }));
        assert_eq!(trex_pool_arrow_result_is_error(ok), 0);
        assert_eq!(trex_pool_arrow_result_is_error(err), 1);
        trex_pool_arrow_result_free(ok);
        trex_pool_arrow_result_free(err);
    }

    #[test]
    fn carrow_result_data_exposes_bytes_only_when_present() {
        // Empty data returns 1 (no data); populated data returns 0 and the
        // out-params point at the buffer.
        let empty = Box::into_raw(Box::new(CArrowResult {
            data: Vec::new(),
            error: None,
        }));
        let mut p: *const u8 = std::ptr::null();
        let mut l: usize = 0;
        assert_eq!(trex_pool_arrow_result_data(empty, &mut p, &mut l), 1);
        assert!(p.is_null());
        assert_eq!(l, 0);

        let full = Box::into_raw(Box::new(CArrowResult {
            data: vec![9, 8, 7, 6],
            error: None,
        }));
        assert_eq!(trex_pool_arrow_result_data(full, &mut p, &mut l), 0);
        assert_eq!(l, 4);
        let slice = unsafe { std::slice::from_raw_parts(p, l) };
        assert_eq!(slice, &[9, 8, 7, 6]);

        trex_pool_arrow_result_free(empty);
        trex_pool_arrow_result_free(full);
    }

    #[test]
    fn carrow_result_error_writes_message_bytes_when_set() {
        let r = Box::into_raw(Box::new(CArrowResult {
            data: Vec::new(),
            error: Some("boom".to_string()),
        }));
        let mut p: *const u8 = std::ptr::null();
        let mut l: usize = 0;
        trex_pool_arrow_result_error(r, &mut p, &mut l);
        assert_eq!(l, 4);
        let bytes = unsafe { std::slice::from_raw_parts(p, l) };
        assert_eq!(bytes, b"boom");
        trex_pool_arrow_result_free(r);
    }
}
