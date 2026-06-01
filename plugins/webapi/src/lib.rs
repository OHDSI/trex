extern crate duckdb;
extern crate duckdb_loadable_macros;
extern crate libduckdb_sys;

use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeId},
    vscalar::{ScalarFunctionSignature, VScalar},
    vtab::arrow::WritableVector,
    Connection, Result,
};
use duckdb_loadable_macros::duckdb_entrypoint_c_api;
use std::{
    error::Error,
    ffi::{c_char, c_int, c_void, CStr},
    ptr,
    sync::Mutex,
};

// ---------------------------------------------------------------------------
// FFI into libwebapi-native.so (GraalVM shared library built from WebAPI).
//
// The symbols are resolved lazily via dlopen so the extension loads even when
// the WebAPI library is absent (webapi_* functions then return a clear error).
// ---------------------------------------------------------------------------

#[allow(non_camel_case_types)]
type graal_isolate_t = c_void;
#[allow(non_camel_case_types)]
type graal_isolatethread_t = c_void;

type CreateIsolateFn = unsafe extern "C" fn(
    *mut c_void,
    *mut *mut graal_isolate_t,
    *mut *mut graal_isolatethread_t,
) -> c_int;
type StartFn = unsafe extern "C" fn(*mut graal_isolatethread_t, *mut c_char) -> *mut c_char;
type StopOrStatusFn = unsafe extern "C" fn(*mut graal_isolatethread_t) -> *mut c_char;

struct WebApiLib {
    start: StartFn,
    stop: StopOrStatusFn,
    status: StopOrStatusFn,
    thread: *mut graal_isolatethread_t,
}

// The Graal isolate thread is only ever used behind the WEBAPI mutex.
unsafe impl Send for WebApiLib {}

static WEBAPI: Mutex<Option<WebApiLib>> = Mutex::new(None);

const LIB_ENV: &str = "WEBAPI_NATIVE_LIB";
const DEFAULT_LIB: &str = "libwebapi-native.so";

unsafe fn dlsym_or<T>(handle: *mut c_void, name: &[u8]) -> std::result::Result<T, String> {
    let sym = libc_dlsym(handle, name.as_ptr() as *const c_char);
    if sym.is_null() {
        return Err(format!("symbol {} not found", String::from_utf8_lossy(name)));
    }
    // Transmute the void* to the requested fn pointer type. Sizes match (both pointer-sized).
    Ok(std::mem::transmute_copy::<*mut c_void, T>(&sym))
}

// Minimal libc bindings (avoid pulling the `libc`/`libloading` crates to keep the
// extension dependency-light; these three are always present on the platforms we target).
extern "C" {
    fn dlopen(filename: *const c_char, flag: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    fn dlerror() -> *mut c_char;
}
const RTLD_NOW: c_int = 2;
const RTLD_GLOBAL: c_int = 0x100;

unsafe fn libc_dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void {
    dlsym(handle, name)
}

/// Resolve and initialise the WebAPI native library + a Graal isolate. Idempotent.
fn ensure_loaded(lib_guard: &mut Option<WebApiLib>) -> std::result::Result<(), String> {
    if lib_guard.is_some() {
        return Ok(());
    }
    let path = std::env::var(LIB_ENV).unwrap_or_else(|_| DEFAULT_LIB.to_string());
    let c_path = std::ffi::CString::new(path.clone()).map_err(|e| e.to_string())?;
    unsafe {
        let handle = dlopen(c_path.as_ptr(), RTLD_NOW | RTLD_GLOBAL);
        if handle.is_null() {
            let err = dlerror();
            let msg = if err.is_null() {
                "unknown".to_string()
            } else {
                CStr::from_ptr(err).to_string_lossy().into_owned()
            };
            return Err(format!("dlopen({path}) failed: {msg}"));
        }
        let create: CreateIsolateFn = dlsym_or(handle, b"graal_create_isolate\0")?;
        let start: StartFn = dlsym_or(handle, b"webapi_start\0")?;
        let stop: StopOrStatusFn = dlsym_or(handle, b"webapi_stop\0")?;
        let status: StopOrStatusFn = dlsym_or(handle, b"webapi_status\0")?;

        let mut isolate: *mut graal_isolate_t = ptr::null_mut();
        let mut thread: *mut graal_isolatethread_t = ptr::null_mut();
        if create(ptr::null_mut(), &mut isolate, &mut thread) != 0 || thread.is_null() {
            return Err("graal_create_isolate failed".to_string());
        }
        *lib_guard = Some(WebApiLib { start, stop, status, thread });
        Ok(())
    }
}

unsafe fn cstr_to_string(p: *mut c_char) -> String {
    if p.is_null() {
        "(null)".to_string()
    } else {
        CStr::from_ptr(p).to_string_lossy().into_owned()
    }
}

/// Run a closure against the loaded library, producing a status string.
fn with_lib<F: FnOnce(&WebApiLib) -> String>(f: F) -> String {
    let mut guard = match WEBAPI.lock() {
        Ok(g) => g,
        Err(_) => return "error: webapi lock poisoned".to_string(),
    };
    if let Err(e) = ensure_loaded(&mut guard) {
        return format!("error: {e}");
    }
    f(guard.as_ref().unwrap())
}

fn emit(output: &mut dyn WritableVector, value: &str) {
    let owned = value.to_string();
    let flat_vector = output.flat_vector();
    flat_vector.insert(0, &owned);
}

struct WebApiStart;
impl VScalar for WebApiStart {
    type State = ();
    unsafe fn invoke(
        _: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let msg = with_lib(|lib| cstr_to_string((lib.start)(lib.thread, ptr::null_mut())));
        let n = input.len().max(1);
        for _ in 0..n {
            emit(output, &msg);
        }
        Ok(())
    }
    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(vec![], LogicalTypeId::Varchar.into())]
    }
}

struct WebApiStop;
impl VScalar for WebApiStop {
    type State = ();
    unsafe fn invoke(
        _: &Self::State,
        _input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let msg = with_lib(|lib| cstr_to_string((lib.stop)(lib.thread)));
        emit(output, &msg);
        Ok(())
    }
    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(vec![], LogicalTypeId::Varchar.into())]
    }
}

struct WebApiStatus;
impl VScalar for WebApiStatus {
    type State = ();
    unsafe fn invoke(
        _: &Self::State,
        _input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let msg = with_lib(|lib| cstr_to_string((lib.status)(lib.thread)));
        emit(output, &msg);
        Ok(())
    }
    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(vec![], LogicalTypeId::Varchar.into())]
    }
}

#[duckdb_entrypoint_c_api()]
pub unsafe fn extension_entrypoint(con: Connection) -> Result<(), Box<dyn Error>> {
    con.register_scalar_function::<WebApiStart>("webapi_start")
        .expect("register webapi_start");
    con.register_scalar_function::<WebApiStop>("webapi_stop")
        .expect("register webapi_stop");
    con.register_scalar_function::<WebApiStatus>("webapi_status")
        .expect("register webapi_status");
    Ok(())
}
