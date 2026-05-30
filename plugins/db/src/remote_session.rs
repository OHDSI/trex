//! C-ABI surface used by trex-db-client (dlsym from the pool cdylib).
//!
//! Each "remote session" is a stable token + an endpoint string. Calls
//! transparently issue session-bound Flight requests against the data node
//! discovered via gossip.

use arrow_array::RecordBatch;
use arrow_schema::SchemaRef;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use uuid::Uuid;

use crate::flight_client;

struct RemoteEntry {
    endpoint: String,
    token: String,
}

static SESSIONS: OnceLock<Mutex<HashMap<u64, RemoteEntry>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn sessions() -> &'static Mutex<HashMap<u64, RemoteEntry>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .thread_name("trex-remote-session")
            .build()
            .expect("build remote-session tokio runtime")
    })
}

/// Lease a remote session. Resolves the data-node Flight endpoint via gossip,
/// generates a UUID token, performs the create_session action, and stores the
/// pairing.
pub fn create_remote_session() -> Result<u64, String> {
    let endpoint = crate::remote_endpoint::pick_data_node_flight_endpoint()?;
    let token = Uuid::new_v4().to_string();
    runtime().block_on(flight_client::create_session_on(&endpoint, &token))?;
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    sessions()
        .lock()
        .expect("remote sessions poisoned")
        .insert(id, RemoteEntry { endpoint, token });
    Ok(id)
}

/// Execute SQL on the remote session. Returns Arrow IPC stream bytes.
pub fn remote_session_execute_ipc(session_id: u64, sql: &str) -> Result<Vec<u8>, String> {
    let (endpoint, token) = {
        let map = sessions().lock().expect("remote sessions poisoned");
        let e = map.get(&session_id).ok_or_else(|| format!("session {session_id} not found"))?;
        (e.endpoint.clone(), e.token.clone())
    };
    let (schema, batches) =
        runtime().block_on(flight_client::query_node_with_session(&endpoint, &token, sql))?;
    serialize_ipc(&schema, &batches)
}

/// Destroy the remote session. Errors during destroy_session are logged but
/// not propagated — local cleanup proceeds regardless.
pub fn destroy_remote_session(session_id: u64) {
    let entry = sessions().lock().expect("remote sessions poisoned").remove(&session_id);
    if let Some(e) = entry {
        let _ = runtime().block_on(flight_client::destroy_session_on(&e.endpoint, &e.token));
    }
}

fn serialize_ipc(schema: &SchemaRef, batches: &[RecordBatch]) -> Result<Vec<u8>, String> {
    use arrow_ipc::writer::StreamWriter;
    let mut buf = Vec::new();
    {
        let mut writer = StreamWriter::try_new(&mut buf, schema)
            .map_err(|e| format!("ipc writer init: {e}"))?;
        for batch in batches {
            writer.write(batch).map_err(|e| format!("ipc write: {e}"))?;
        }
        writer.finish().map_err(|e| format!("ipc finish: {e}"))?;
    }
    Ok(buf)
}

// ----- C ABI -----

#[repr(C)]
pub struct CRemoteResult {
    is_error: i32,
    data: *mut u8,
    data_len: usize,
    error: *mut u8,
    error_len: usize,
}

#[no_mangle]
pub extern "C" fn trex_db_remote_session_create() -> u64 {
    match create_remote_session() {
        Ok(id) => id,
        Err(_) => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn trex_db_remote_session_execute(
    session_id: u64,
    sql_ptr: *const u8,
    sql_len: usize,
) -> *mut CRemoteResult {
    if sql_ptr.is_null() && sql_len != 0 {
        return box_error("sql_ptr is null with non-zero len".to_string());
    }
    let sql_bytes = if sql_len == 0 {
        &[][..]
    } else {
        std::slice::from_raw_parts(sql_ptr, sql_len)
    };
    let sql = match std::str::from_utf8(sql_bytes) {
        Ok(s) => s,
        Err(e) => return box_error(format!("sql utf8: {e}")),
    };
    match remote_session_execute_ipc(session_id, sql) {
        Ok(mut buf) => {
            buf.shrink_to_fit();
            let data = buf.as_mut_ptr();
            let len = buf.len();
            std::mem::forget(buf);
            Box::into_raw(Box::new(CRemoteResult {
                is_error: 0,
                data,
                data_len: len,
                error: std::ptr::null_mut(),
                error_len: 0,
            }))
        }
        Err(e) => box_error(e),
    }
}

unsafe fn box_error(msg: String) -> *mut CRemoteResult {
    let mut bytes = msg.into_bytes();
    bytes.shrink_to_fit();
    let ptr = bytes.as_mut_ptr();
    let len = bytes.len();
    std::mem::forget(bytes);
    Box::into_raw(Box::new(CRemoteResult {
        is_error: 1,
        data: std::ptr::null_mut(),
        data_len: 0,
        error: ptr,
        error_len: len,
    }))
}

#[no_mangle]
pub unsafe extern "C" fn trex_db_remote_session_result_is_error(r: *const CRemoteResult) -> i32 {
    (*r).is_error
}

#[no_mangle]
pub unsafe extern "C" fn trex_db_remote_session_result_data(
    r: *const CRemoteResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) {
    *out_ptr = (*r).data as *const u8;
    *out_len = (*r).data_len;
}

#[no_mangle]
pub unsafe extern "C" fn trex_db_remote_session_result_error(
    r: *const CRemoteResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) {
    *out_ptr = (*r).error as *const u8;
    *out_len = (*r).error_len;
}

#[no_mangle]
pub unsafe extern "C" fn trex_db_remote_session_result_free(r: *mut CRemoteResult) {
    if r.is_null() {
        return;
    }
    let boxed = Box::from_raw(r);
    if !boxed.data.is_null() {
        // shrink_to_fit() was called before forgetting the Vec, so
        // capacity == len and this reconstruction is sound.
        let _ = Vec::from_raw_parts(boxed.data, boxed.data_len, boxed.data_len);
    }
    if !boxed.error.is_null() {
        let _ = Vec::from_raw_parts(boxed.error, boxed.error_len, boxed.error_len);
    }
}

#[no_mangle]
pub extern "C" fn trex_db_remote_session_destroy(session_id: u64) {
    destroy_remote_session(session_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_array::Int32Array;
    use arrow_schema::{DataType, Field, Schema};

    #[test]
    fn next_id_increments_monotonically() {
        let a = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let b = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        assert!(b > a);
    }

    #[test]
    fn ipc_serialize_roundtrip() {
        let schema: SchemaRef = std::sync::Arc::new(Schema::new(vec![
            Field::new("a", DataType::Int32, false),
        ]));
        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![std::sync::Arc::new(Int32Array::from(vec![1, 2, 3]))],
        )
        .unwrap();
        let bytes = serialize_ipc(&schema, &[batch]).unwrap();

        let cursor = std::io::Cursor::new(bytes);
        let reader = arrow_ipc::reader::StreamReader::try_new(cursor, None).unwrap();
        let got: Vec<_> = reader.collect::<Result<_, _>>().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].num_rows(), 3);
    }
}
