//! Safe Rust client for trex_db's remote-session C ABI. Loaded as an rlib
//! by the pool cdylib so pool can route session calls to the data node.

pub use arrow_array;
pub use arrow_ipc;
pub use arrow_schema;

use arrow_array::RecordBatch;
use arrow_schema::Schema;
use std::sync::{Arc, OnceLock};

/// Opaque pointer for C ABI result handles.
#[repr(C)]
pub struct Opaque {
    _opaque: [u8; 0],
}

type FnCreate = unsafe extern "C" fn() -> u64;
type FnExecute = unsafe extern "C" fn(u64, *const u8, usize) -> *mut Opaque;
type FnExecuteParams =
    unsafe extern "C" fn(u64, *const u8, usize, *const u8, usize) -> *mut Opaque;
type FnDestroy = unsafe extern "C" fn(u64);
type FnIsError = unsafe extern "C" fn(*const Opaque) -> i32;
type FnData = unsafe extern "C" fn(*const Opaque, *mut *const u8, *mut usize);
type FnError = unsafe extern "C" fn(*const Opaque, *mut *const u8, *mut usize);
type FnFree = unsafe extern "C" fn(*mut Opaque);
type FnLastError = unsafe extern "C" fn(*mut *const u8, *mut usize);

struct DbFns {
    create: FnCreate,
    execute: FnExecute,
    // Optional: absent on db.trex builds predating parameterised remote support.
    execute_params: Option<FnExecuteParams>,
    destroy: FnDestroy,
    is_error: FnIsError,
    data: FnData,
    error: FnError,
    free: FnFree,
    // Optional: absent on db.trex builds predating create-error reporting.
    create_last_error: Option<FnLastError>,
}

static DB_FNS: OnceLock<Option<DbFns>> = OnceLock::new();

fn get_fns() -> Result<&'static DbFns, String> {
    let fns = DB_FNS.get_or_init(|| unsafe { discover_db_fns() });
    fns.as_ref()
        .ok_or_else(|| "trex_db extension not loaded".to_string())
}

unsafe fn discover_db_fns() -> Option<DbFns> {
    // DuckDB loads extensions with RTLD_LOCAL, so symbols aren't visible via
    // RTLD_DEFAULT. We need to find the db.trex handle and look up symbols from it.
    //
    // Strategy: try RTLD_DEFAULT first (works if db was loaded with RTLD_GLOBAL).
    // If that fails, scan /proc/self/maps for the loaded db library and dlopen
    // it with RTLD_NOLOAD to get its handle, then look up symbols from that handle.
    let handle = {
        let test = libc::dlsym(
            libc::RTLD_DEFAULT,
            b"trex_db_remote_session_create\0".as_ptr() as *const _,
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
                        if (basename.starts_with("db.") || basename.starts_with("libdb."))
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

    // Optional symbol: returns None (rather than aborting discovery) when the
    // loaded db.trex predates parameterised remote-session support.
    let execute_params: Option<FnExecuteParams> = {
        let name = "trex_db_remote_session_execute_params\0";
        let ptr = libc::dlsym(handle, name.as_ptr() as *const _);
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute(ptr))
        }
    };

    // Optional: absent on db.trex builds predating create-error reporting.
    let create_last_error: Option<FnLastError> = {
        let name = "trex_db_remote_session_create_last_error\0";
        let ptr = libc::dlsym(handle, name.as_ptr() as *const _);
        if ptr.is_null() {
            None
        } else {
            Some(std::mem::transmute(ptr))
        }
    };

    Some(DbFns {
        create: sym!("trex_db_remote_session_create"),
        execute: sym!("trex_db_remote_session_execute"),
        execute_params,
        destroy: sym!("trex_db_remote_session_destroy"),
        is_error: sym!("trex_db_remote_session_result_is_error"),
        data: sym!("trex_db_remote_session_result_data"),
        error: sym!("trex_db_remote_session_result_error"),
        free: sym!("trex_db_remote_session_result_free"),
        create_last_error,
    })
}

fn arrow_result_to_batches(
    fns: &DbFns,
    result: *mut Opaque,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    if result.is_null() {
        return Err("null result from db".to_string());
    }
    unsafe {
        if (fns.is_error)(result) != 0 {
            let err = read_error_str(|p, l| (fns.error)(result, p, l));
            (fns.free)(result);
            return Err(err);
        }

        let mut ptr: *const u8 = std::ptr::null();
        let mut len: usize = 0;
        (fns.data)(result, &mut ptr, &mut len);

        if ptr.is_null() || len == 0 {
            (fns.free)(result);
            return Ok((Arc::new(Schema::empty()), vec![]));
        }

        let ipc_bytes = std::slice::from_raw_parts(ptr, len).to_vec();
        (fns.free)(result);

        deserialize_arrow_ipc(&ipc_bytes)
    }
}

unsafe fn read_error_str(f: impl FnOnce(*mut *const u8, *mut usize)) -> String {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    f(&mut ptr, &mut len);
    if !ptr.is_null() && len > 0 {
        std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)).to_string()
    } else {
        "unknown db error".to_string()
    }
}

fn deserialize_arrow_ipc(data: &[u8]) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
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

/// Lease a remote session on the data node. Returns `Err` if discovery fails
/// or the data node is unavailable.
pub fn create_remote_session() -> Result<u64, String> {
    let fns = get_fns()?;
    let id = unsafe { (fns.create)() };
    if id == 0 {
        // Recover the real reason db.trex stashed (gossip discovery / Flight RPC)
        // rather than guessing. Falls back to the generic hint on older db.trex.
        let detail = fns
            .create_last_error
            .map(|f| unsafe { read_error_str(|p, l| f(p, l)) })
            .filter(|s| !s.is_empty() && s != "unknown db error");
        match detail {
            Some(reason) => Err(reason),
            None => {
                Err("create_remote_session failed (likely no data node available yet)".to_string())
            }
        }
    } else {
        Ok(id)
    }
}

/// Execute SQL on the remote session, returning Arrow record batches.
pub fn remote_session_execute(
    session_id: u64,
    sql: &str,
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let fns = get_fns()?;
    let result = unsafe { (fns.execute)(session_id, sql.as_ptr(), sql.len()) };
    arrow_result_to_batches(fns, result)
}

/// Execute parameterised SQL on the remote session, returning Arrow record
/// batches. `params` are positional, string-encoded values. Returns `Err` if
/// the loaded db.trex predates parameterised remote-session support.
pub fn remote_session_execute_params(
    session_id: u64,
    sql: &str,
    params: &[String],
) -> Result<(Arc<Schema>, Vec<RecordBatch>), String> {
    let fns = get_fns()?;
    let execute_params = fns.execute_params.ok_or_else(|| {
        "remote parameterised execution unavailable (db.trex too old)".to_string()
    })?;
    let params_json = serde_json::to_vec(params)
        .map_err(|e| format!("serialize remote params: {e}"))?;
    let result = unsafe {
        execute_params(
            session_id,
            sql.as_ptr(),
            sql.len(),
            params_json.as_ptr(),
            params_json.len(),
        )
    };
    arrow_result_to_batches(fns, result)
}

/// Destroy a remote session. Silent no-op if the symbol isn't loaded.
pub fn destroy_remote_session(session_id: u64) {
    if let Ok(fns) = get_fns() {
        unsafe { (fns.destroy)(session_id) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_fns_fails_cleanly_when_db_absent() {
        // In a unit test, db.trex isn't loaded, so dlsym discovery must
        // return None. This verifies the OnceLock<Option<...>> encoding and
        // the error path.
        assert!(get_fns().is_err());
    }
}
