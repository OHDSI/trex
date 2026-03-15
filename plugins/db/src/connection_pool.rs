//! Connection pool for parallel DuckDB query execution in the db plugin.
//!
//! Provides two APIs:
//! - `submit(sql)` — channel-based, zero-contention for pure SQL execution
//! - `with_connection(closure)` — for operations needing direct `&Connection`

use crossbeam_channel::{unbounded, Receiver, Sender};
use duckdb::arrow::datatypes::Schema;
use duckdb::arrow::record_batch::RecordBatch;
use duckdb::{params, Connection};
use std::panic::{self, AssertUnwindSafe};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};

pub struct PoolRequest {
    pub query: String,
    pub response_tx: tokio::sync::oneshot::Sender<PoolResult>,
}

pub enum PoolResult {
    Rows {
        schema: Arc<Schema>,
        batches: Vec<RecordBatch>,
    },
    Executed,
    Error(String),
}

struct Worker {
    handle: Option<JoinHandle<()>>,
}

/// Connection pool distributing work across pre-cloned DuckDB connections.
pub struct ConnectionPool {
    senders: Vec<Sender<PoolRequest>>,
    workers: Vec<Worker>,
    direct_connections: Vec<Mutex<Connection>>,
    next_worker: AtomicUsize,
    next_direct: AtomicUsize,
}

impl Drop for ConnectionPool {
    fn drop(&mut self) {
        self.senders.clear();
        for worker in &mut self.workers {
            if let Some(handle) = worker.handle.take() {
                let _ = handle.join();
            }
        }
    }
}

impl ConnectionPool {
    pub fn new(connection: &Connection, pool_size: usize) -> Result<Self, String> {
        if pool_size == 0 {
            return Err("pool_size must be > 0".into());
        }

        // Clone connections for worker threads
        let mut worker_connections = Vec::with_capacity(pool_size);
        for i in 0..pool_size {
            worker_connections.push(
                connection
                    .try_clone()
                    .map_err(|e| format!("worker connection clone {i}: {e}"))?,
            );
        }

        // Clone connections for direct access
        let mut direct = Vec::with_capacity(pool_size);
        for i in 0..pool_size {
            direct.push(Mutex::new(
                connection
                    .try_clone()
                    .map_err(|e| format!("direct connection clone {i}: {e}"))?,
            ));
        }

        let mut senders = Vec::with_capacity(pool_size);
        let mut workers = Vec::with_capacity(pool_size);

        for (i, conn) in worker_connections.into_iter().enumerate() {
            let (tx, rx): (Sender<PoolRequest>, Receiver<PoolRequest>) = unbounded();
            senders.push(tx);
            let handle = thread::Builder::new()
                .name(format!("db-pool-worker-{i}"))
                .spawn(move || worker_loop(conn, rx))
                .map_err(|e| format!("spawn worker {i}: {e}"))?;
            workers.push(Worker {
                handle: Some(handle),
            });
        }

        Ok(Self {
            senders,
            workers,
            direct_connections: direct,
            next_worker: AtomicUsize::new(0),
            next_direct: AtomicUsize::new(0),
        })
    }

    /// Submit a SQL query for execution on a worker thread.
    pub fn submit(&self, query: String) -> tokio::sync::oneshot::Receiver<PoolResult> {
        let idx = self.next_worker.fetch_add(1, Ordering::Relaxed) % self.senders.len();
        let sender = &self.senders[idx];
        let (response_tx, response_rx) = tokio::sync::oneshot::channel();

        if let Err(e) = sender.send(PoolRequest { query, response_tx }) {
            let (tx, rx) = tokio::sync::oneshot::channel();
            let _ = tx.send(PoolResult::Error(format!("pool worker closed: {e}")));
            return rx;
        }

        response_rx
    }

    /// Run a closure with direct access to a pooled connection.
    pub fn with_connection<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&Connection) -> Result<R, String>,
    {
        let idx =
            self.next_direct.fetch_add(1, Ordering::Relaxed) % self.direct_connections.len();
        let conn = self.direct_connections[idx]
            .lock()
            .map_err(|e| format!("Failed to lock direct connection: {e}"))?;
        f(&conn)
    }
}

fn worker_loop(conn: Connection, receiver: Receiver<PoolRequest>) {
    while let Ok(req) = receiver.recv() {
        let result = panic::catch_unwind(AssertUnwindSafe(|| execute_query(&conn, &req.query)));
        let pool_result = match result {
            Ok(r) => r,
            Err(panic_err) => {
                let msg = extract_panic_message(panic_err);
                eprintln!("db pool query panicked: {msg}");
                PoolResult::Error(format!("query panicked: {msg}"))
            }
        };
        let _ = req.response_tx.send(pool_result);
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

fn execute_query(conn: &Connection, query: &str) -> PoolResult {
    let trimmed = query.trim();
    let upper = trimmed.to_uppercase();

    if is_result_returning_query(&upper) {
        match execute_select(conn, trimmed) {
            Ok((schema, batches)) => PoolResult::Rows { schema, batches },
            Err(e) => PoolResult::Error(e),
        }
    } else {
        match execute_non_select(conn, trimmed) {
            Ok(()) => PoolResult::Executed,
            Err(e) => PoolResult::Error(e),
        }
    }
}

fn is_result_returning_query(upper: &str) -> bool {
    upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("SHOW")
        || upper.starts_with("DESCRIBE")
        || upper.starts_with("EXPLAIN")
        || upper.starts_with("TABLE")
        || upper.starts_with("VALUES")
        || upper.starts_with("FROM")
        || (upper.starts_with("PRAGMA") && !is_action_pragma(upper))
}

fn is_action_pragma(upper: &str) -> bool {
    let after_pragma = upper["PRAGMA".len()..].trim_start();
    after_pragma.starts_with("CREATE_FTS_INDEX")
        || after_pragma.starts_with("DROP_FTS_INDEX")
        || after_pragma.starts_with("COPY_DATABASE")
        || after_pragma.starts_with("IMPORT_DATABASE")
}

fn execute_select(
    conn: &Connection,
    query: &str,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let mut stmt = conn.prepare(query).map_err(|e| format!("prepare: {e}"))?;
    let arrow_result = stmt
        .query_arrow(params![])
        .map_err(|e| format!("query: {e}"))?;
    Ok((arrow_result.get_schema(), arrow_result.collect()))
}

fn execute_non_select(conn: &Connection, query: &str) -> Result<(), String> {
    conn.execute_batch(query)
        .map_err(|e| format!("exec: {e}"))?;
    Ok(())
}

// --- Global pool singleton ---

static POOL: OnceLock<Arc<ConnectionPool>> = OnceLock::new();

pub fn init_pool(connection: &Connection, pool_size: usize) -> Result<(), String> {
    let pool = ConnectionPool::new(connection, pool_size)?;
    POOL.set(Arc::new(pool))
        .map_err(|_| "Connection pool already initialised".to_string())
}

pub fn get_pool() -> Result<Arc<ConnectionPool>, String> {
    POOL.get()
        .cloned()
        .ok_or_else(|| "Connection pool not initialised".to_string())
}

/// Helper: submit SQL and block for `PoolResult::Rows`.
pub fn submit_query_blocking(sql: &str) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let pool = get_pool()?;
    let rx = pool.submit(sql.to_string());
    match rx.blocking_recv() {
        Ok(PoolResult::Rows { schema, batches }) => Ok((schema, batches)),
        Ok(PoolResult::Executed) => Ok((Arc::new(Schema::empty()), vec![])),
        Ok(PoolResult::Error(e)) => Err(e),
        Err(e) => Err(format!("pool channel closed: {e}")),
    }
}

/// Helper: submit SQL and block, expecting execution (no rows).
pub fn submit_exec_blocking(sql: &str) -> Result<(), String> {
    let pool = get_pool()?;
    let rx = pool.submit(sql.to_string());
    match rx.blocking_recv() {
        Ok(PoolResult::Rows { .. }) => Ok(()),
        Ok(PoolResult::Executed) => Ok(()),
        Ok(PoolResult::Error(e)) => Err(e),
        Err(e) => Err(format!("pool channel closed: {e}")),
    }
}
