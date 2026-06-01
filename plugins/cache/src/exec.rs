use duckdb::types::{Type, ValueRef};
use duckdb::Connection;
use trex_pool_client::arrow_array::{Array, RecordBatch, StringArray};

/// Render a single-column value as text. Covers the types the cache loop reads:
/// string identifiers (`Text`) and integer counts. Returns `Err` for any
/// unhandled DuckDB type so callers detect mis-rendered data rather than
/// silently producing Rust debug output.
fn value_to_string(v: ValueRef<'_>) -> Result<String, String> {
    match v {
        ValueRef::Null => Ok(String::new()),
        ValueRef::Boolean(b) => Ok(b.to_string()),
        ValueRef::TinyInt(i) => Ok(i.to_string()),
        ValueRef::SmallInt(i) => Ok(i.to_string()),
        ValueRef::Int(i) => Ok(i.to_string()),
        ValueRef::BigInt(i) => Ok(i.to_string()),
        ValueRef::HugeInt(i) => Ok(i.to_string()),
        ValueRef::UTinyInt(i) => Ok(i.to_string()),
        ValueRef::USmallInt(i) => Ok(i.to_string()),
        ValueRef::UInt(i) => Ok(i.to_string()),
        ValueRef::UBigInt(i) => Ok(i.to_string()),
        ValueRef::Float(f) => Ok(f.to_string()),
        ValueRef::Double(f) => Ok(f.to_string()),
        ValueRef::Text(bytes) => Ok(String::from_utf8_lossy(bytes).into_owned()),
        other => Err(format!("query_strings: unsupported column value type: {other:?}")),
    }
}

/// Abstraction over "run SQL against the local store". Allows the cache loop to
/// be driven by the production pool-client or by an in-process connection in tests.
pub trait SqlExecutor {
    /// Execute a statement, discarding any result set.
    fn execute(&self, sql: &str) -> Result<(), String>;
    /// Execute a query returning a single text column; collect its values.
    fn query_strings(&self, sql: &str) -> Result<Vec<String>, String>;
}

/// Executor backed by a real `duckdb::Connection` (tests, and any in-process use).
pub struct DuckDbExecutor<'a> {
    pub con: &'a Connection,
}

impl<'a> DuckDbExecutor<'a> {
    pub fn new(con: &'a Connection) -> Self {
        Self { con }
    }
}

impl<'a> SqlExecutor for DuckDbExecutor<'a> {
    fn execute(&self, sql: &str) -> Result<(), String> {
        self.con.execute_batch(sql).map_err(|e| e.to_string())
    }

    fn query_strings(&self, sql: &str) -> Result<Vec<String>, String> {
        let mut stmt = self.con.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                value_to_string(row.get_ref(0)?).map_err(|msg| {
                    duckdb::Error::InvalidColumnType(0, msg, Type::Null)
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }
}

/// Extract column 0 (expected Utf8) of each batch into a Vec, skipping nulls.
pub fn string_column_0(batches: &[RecordBatch]) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for batch in batches {
        if batch.num_columns() == 0 {
            continue;
        }
        let arr = batch
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or_else(|| "expected a text column in query result".to_string())?;
        for i in 0..arr.len() {
            if !arr.is_null(i) {
                out.push(arr.value(i).to_string());
            }
        }
    }
    Ok(out)
}

/// Executor backed by a pool-client session. The session is pinned to one
/// pooled Connection from creation to destroy, so ATTACH and the subsequent
/// CREATE TABLE statements share state.
pub struct PoolExecutor {
    session_id: u64,
}

impl PoolExecutor {
    pub fn new() -> Result<Self, String> {
        Ok(Self { session_id: trex_pool_client::create_session()? })
    }
}

impl Drop for PoolExecutor {
    fn drop(&mut self) {
        let _ = trex_pool_client::destroy_session(self.session_id);
    }
}

impl SqlExecutor for PoolExecutor {
    fn execute(&self, sql: &str) -> Result<(), String> {
        trex_pool_client::session_execute(self.session_id, sql).map(|_| ())
    }

    fn query_strings(&self, sql: &str) -> Result<Vec<String>, String> {
        let (_schema, batches) = trex_pool_client::session_execute(self.session_id, sql)?;
        string_column_0(&batches)
    }
}
