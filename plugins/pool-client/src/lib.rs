//! Safe Rust client for the trex_pool DuckDB extension.
//!
//! This is an rlib (statically linked into each consumer cdylib) that
//! discovers the pool's C ABI functions via `dlsym(RTLD_DEFAULT, ...)`
//! at first use. The pool exposes a session-leasing facility — sessions
//! own a Connection from creation until destroy.

pub use arrow_array;
pub use arrow_ipc;
pub use arrow_schema;

use arrow_array::RecordBatch;
use arrow_schema::Schema;
use std::sync::{Arc, OnceLock};

type FnSessionCreate = unsafe extern "C" fn() -> u64;
type FnSessionExecuteArrow = unsafe extern "C" fn(u64, *const u8, usize) -> *mut Opaque;
type FnSessionExecuteParamsArrow = unsafe extern "C" fn(u64, *const u8, usize, *const *const u8, *const usize, usize) -> *mut Opaque;
type FnSessionDestroy = unsafe extern "C" fn(u64);

type FnArrowIsError = unsafe extern "C" fn(*const Opaque) -> i32;
type FnArrowData = unsafe extern "C" fn(*const Opaque, *mut *const u8, *mut usize) -> i32;
type FnArrowError = unsafe extern "C" fn(*const Opaque, *mut *const u8, *mut usize);
type FnArrowFree = unsafe extern "C" fn(*mut Opaque);
type FnLastError = unsafe extern "C" fn(*mut *const u8, *mut usize);

/// Opaque pointer for C ABI result handles.
#[repr(C)]
pub struct Opaque {
    _opaque: [u8; 0],
}

struct PoolFns {
    session_create: FnSessionCreate,
    session_execute_arrow: FnSessionExecuteArrow,
    session_execute_params_arrow: FnSessionExecuteParamsArrow,
    session_destroy: FnSessionDestroy,
    arrow_is_error: FnArrowIsError,
    arrow_data: FnArrowData,
    arrow_error: FnArrowError,
    arrow_free: FnArrowFree,
    // Optional: absent on pool.trex builds predating create-error reporting.
    session_create_last_error: Option<FnLastError>,
}

static POOL_FNS: OnceLock<Option<PoolFns>> = OnceLock::new();

fn get_fns() -> Result<&'static PoolFns, String> {
    let fns = POOL_FNS.get_or_init(|| unsafe { discover_pool_fns() });
    fns.as_ref()
        .ok_or_else(|| "trex_pool extension not loaded".to_string())
}

unsafe fn discover_pool_fns() -> Option<PoolFns> {
    // DuckDB loads extensions with RTLD_LOCAL, so symbols aren't visible via
    // RTLD_DEFAULT. We need to find the pool.trex handle and promote it to
    // RTLD_GLOBAL, or search for symbols in all loaded libraries.
    //
    // Strategy: try RTLD_DEFAULT first (works if pool was loaded with RTLD_GLOBAL).
    // If that fails, scan /proc/self/maps for the loaded pool library and dlopen
    // it with RTLD_NOLOAD to get its handle, then look up symbols from that
    // handle.
    let handle = {
        let test = libc::dlsym(
            libc::RTLD_DEFAULT,
            b"trex_pool_session_create\0".as_ptr() as *const _,
        );
        if !test.is_null() {
            libc::RTLD_DEFAULT
        } else {
            let mut found = std::ptr::null_mut();
            if let Ok(maps) = std::fs::read_to_string("/proc/self/maps") {
                for line in maps.lines() {
                    if let Some(path_start) = line.find('/') {
                        let path = &line[path_start..];
                        let basename = path.rsplit('/').next().unwrap_or("");
                        if (basename.starts_with("pool.") || basename.starts_with("libpool."))
                            && (basename.ends_with(".trex") || basename.ends_with(".so"))
                        {
                            let c_path = std::ffi::CString::new(path).ok();
                            if let Some(ref cp) = c_path {
                                let h = libc::dlopen(
                                    cp.as_ptr(),
                                    libc::RTLD_NOLOAD | libc::RTLD_NOW,
                                );
                                if !h.is_null() {
                                    found = h;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            if found.is_null() {
                return None;
            }
            found
        }
    };

    macro_rules! sym {
        ($name:expr) => {{
            let name = concat!($name, "\0");
            let ptr = libc::dlsym(handle, name.as_ptr() as *const _);
            if ptr.is_null() {
                return None;
            }
            std::mem::transmute(ptr)
        }};
    }

    // Optional: absent on pool.trex builds predating create-error reporting.
    let session_create_last_error: Option<FnLastError> = {
        let name = "trex_pool_session_create_last_error\0";
        let ptr = libc::dlsym(handle, name.as_ptr() as *const _);
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute(ptr))
        }
    };

    Some(PoolFns {
        session_create: sym!("trex_pool_session_create"),
        session_execute_arrow: sym!("trex_pool_session_execute_arrow"),
        session_execute_params_arrow: sym!("trex_pool_session_execute_params_arrow"),
        session_destroy: sym!("trex_pool_session_destroy"),
        arrow_is_error: sym!("trex_pool_arrow_result_is_error"),
        arrow_data: sym!("trex_pool_arrow_result_data"),
        arrow_error: sym!("trex_pool_arrow_result_error"),
        arrow_free: sym!("trex_pool_arrow_result_free"),
        session_create_last_error,
    })
}

fn arrow_result_to_batches(
    fns: &PoolFns,
    result: *mut Opaque,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    if result.is_null() {
        return Err("null result from pool".to_string());
    }
    unsafe {
        if (fns.arrow_is_error)(result) != 0 {
            let err = read_error_str(|p, l| (fns.arrow_error)(result, p, l));
            (fns.arrow_free)(result);
            return Err(err);
        }

        let mut ptr: *const u8 = std::ptr::null();
        let mut len: usize = 0;
        let rc = (fns.arrow_data)(result, &mut ptr, &mut len);

        if rc != 0 || ptr.is_null() || len == 0 {
            (fns.arrow_free)(result);
            return Ok((Arc::new(Schema::empty()), vec![]));
        }

        let ipc_bytes = std::slice::from_raw_parts(ptr, len).to_vec();
        (fns.arrow_free)(result);

        deserialize_arrow_ipc(&ipc_bytes)
    }
}

unsafe fn read_error_str(
    f: impl FnOnce(*mut *const u8, *mut usize),
) -> String {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    f(&mut ptr, &mut len);
    if !ptr.is_null() && len > 0 {
        std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)).to_string()
    } else {
        "unknown pool error".to_string()
    }
}

fn deserialize_arrow_ipc(
    data: &[u8],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    use arrow_ipc::reader::StreamReader;
    use std::io::Cursor;

    let cursor = Cursor::new(data);
    let reader =
        StreamReader::try_new(cursor, None).map_err(|e| format!("ipc reader init: {e}"))?;
    let schema = reader.schema();
    let batches: Result<Vec<_>, _> = reader.collect();
    let batches = batches.map_err(|e| format!("ipc read batch: {e}"))?;
    Ok((schema, batches))
}


/// Lease a Connection from the pool and create a session bound to it.
/// Blocks if the pool is exhausted.
pub fn create_session() -> Result<u64, String> {
    let fns = get_fns()?;
    let id = unsafe { (fns.session_create)() };
    if id == 0 {
        // Surface the real reason the pool stashed (e.g. the remote backend's
        // "no service:flight entry from a data node yet") instead of a bare
        // "create_session failed". Falls back on older pool.trex.
        let detail = fns
            .session_create_last_error
            .map(|f| unsafe { read_error_str(|p, l| f(p, l)) })
            .filter(|s| !s.is_empty() && s != "unknown pool error");
        match detail {
            Some(reason) => Err(format!("create_session failed: {reason}")),
            None => Err("create_session failed".to_string()),
        }
    } else {
        Ok(id)
    }
}

/// Execute SQL within a session, returning Arrow RecordBatches.
pub fn session_execute(
    session_id: u64,
    sql: &str,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let fns = get_fns()?;
    let result = unsafe {
        (fns.session_execute_arrow)(session_id, sql.as_ptr(), sql.len())
    };
    arrow_result_to_batches(fns, result)
}

/// Execute parameterized SQL within a session, returning Arrow RecordBatches.
pub fn session_execute_params(
    session_id: u64,
    sql: &str,
    params: &[String],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let fns = get_fns()?;
    let ptrs: Vec<*const u8> = params.iter().map(|s| s.as_ptr()).collect();
    let lens: Vec<usize> = params.iter().map(|s| s.len()).collect();
    let result = unsafe {
        (fns.session_execute_params_arrow)(
            session_id,
            sql.as_ptr(), sql.len(),
            ptrs.as_ptr(), lens.as_ptr(), params.len(),
        )
    };
    arrow_result_to_batches(fns, result)
}

/// Destroy a session: cleanup its Connection and return it to the pool.
pub fn destroy_session(session_id: u64) -> Result<(), String> {
    let fns = get_fns()?;
    unsafe { (fns.session_destroy)(session_id) };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_array::{ArrayRef, Int32Array, RecordBatch, StringArray};
    use arrow_ipc::writer::StreamWriter;
    use arrow_schema::{DataType, Field, Schema};
    use std::sync::Arc;

    /// In a unit-test binary the trex_pool extension is never loaded, so symbol
    /// discovery must fail with the documented error string. This pins the
    /// behavior of `get_fns`.
    #[test]
    fn get_fns_reports_extension_not_loaded() {
        let err = match get_fns() {
            Ok(_) => panic!("expected error in unit-test process"),
            Err(e) => e,
        };
        assert!(
            err.contains("trex_pool extension not loaded"),
            "unexpected error: {err}"
        );
    }

    /// All public entry points must propagate the "extension not loaded" error
    /// rather than panic or invoke unresolved FFI symbols.
    #[test]
    fn public_entry_points_propagate_discovery_failure() {
        let err = create_session().expect_err("expected discovery failure");
        assert!(err.contains("trex_pool extension not loaded"), "got: {err}");

        let err = session_execute(1, "SELECT 1").expect_err("expected discovery failure");
        assert!(err.contains("trex_pool extension not loaded"), "got: {err}");

        let err = session_execute_params(1, "SELECT ?", &["x".to_string()])
            .expect_err("expected discovery failure");
        assert!(err.contains("trex_pool extension not loaded"), "got: {err}");

        let err = destroy_session(1).expect_err("expected discovery failure");
        assert!(err.contains("trex_pool extension not loaded"), "got: {err}");
    }

    /// Empty IPC payloads must be rejected by the reader-init step, not silently
    /// succeed. This protects callers from misinterpreting an empty buffer as a
    /// valid empty stream.
    #[test]
    fn deserialize_arrow_ipc_rejects_empty_input() {
        let err = deserialize_arrow_ipc(&[]).expect_err("empty buffer must not parse");
        assert!(err.starts_with("ipc reader init:"), "unexpected: {err}");
    }

    /// Non-IPC garbage must be rejected by the reader-init step.
    #[test]
    fn deserialize_arrow_ipc_rejects_garbage() {
        let err = deserialize_arrow_ipc(b"not an arrow stream")
            .expect_err("garbage must not parse");
        assert!(err.starts_with("ipc reader init:"), "unexpected: {err}");
    }

    fn ipc_bytes_for_test_batch() -> (Arc<Schema>, RecordBatch, Vec<u8>) {
        let schema = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int32, false),
            Field::new("name", DataType::Utf8, false),
        ]));
        let ids: ArrayRef = Arc::new(Int32Array::from(vec![1, 2, 3]));
        let names: ArrayRef = Arc::new(StringArray::from(vec!["a", "b", "c"]));
        let batch = RecordBatch::try_new(schema.clone(), vec![ids, names]).unwrap();

        let mut buf = Vec::new();
        {
            let mut writer = StreamWriter::try_new(&mut buf, schema.as_ref()).unwrap();
            writer.write(&batch).unwrap();
            writer.finish().unwrap();
        }
        (schema, batch, buf)
    }

    /// Round-trip: a real Arrow IPC stream written by the writer must come back
    /// with an equivalent schema and identical batch contents. This substitutes
    /// for the plan's "TCP request/response roundtrip" — the wire format here
    /// is Arrow IPC over the FFI boundary, not bytes over a socket.
    #[test]
    fn deserialize_arrow_ipc_roundtrips_real_batch() {
        let (orig_schema, orig_batch, bytes) = ipc_bytes_for_test_batch();
        let (schema, batches) = deserialize_arrow_ipc(&bytes).expect("ipc parse");

        assert_eq!(schema.fields().len(), orig_schema.fields().len());
        for (a, b) in schema.fields().iter().zip(orig_schema.fields().iter()) {
            assert_eq!(a.name(), b.name());
            assert_eq!(a.data_type(), b.data_type());
        }
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].num_rows(), orig_batch.num_rows());
        assert_eq!(batches[0].num_columns(), orig_batch.num_columns());

        let ids = batches[0]
            .column(0)
            .as_any()
            .downcast_ref::<Int32Array>()
            .unwrap();
        assert_eq!(ids.values(), &[1, 2, 3]);

        let names = batches[0]
            .column(1)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert_eq!(names.value(0), "a");
        assert_eq!(names.value(1), "b");
        assert_eq!(names.value(2), "c");
    }

    /// Truncated IPC stream (header only, no end marker) must surface as a
    /// reader-init error rather than partial data.
    #[test]
    fn deserialize_arrow_ipc_rejects_truncated_stream() {
        let (_, _, bytes) = ipc_bytes_for_test_batch();
        // Lop off the tail to corrupt the stream.
        let truncated = &bytes[..bytes.len() / 2];
        let err = deserialize_arrow_ipc(truncated)
            .expect_err("truncated stream must not parse");
        assert!(
            err.starts_with("ipc reader init:") || err.starts_with("ipc read batch:"),
            "unexpected: {err}"
        );
    }
}
