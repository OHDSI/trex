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
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{channel, Receiver, Sender},
        Mutex,
    },
    thread,
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

// A Graal isolate thread is bound to the OS thread that created it and must only
// be called from there. DuckDB runs scalar functions on a transient thread pool
// with small stacks, so the isolate is owned by one dedicated large-stack thread
// and start/stop/status are marshalled to it over a channel.
enum Cmd {
    Start(Sender<String>),
    Stop(Sender<String>),
    Status(Sender<String>),
}

static WEBAPI_TX: Mutex<Option<Sender<Cmd>>> = Mutex::new(None);

// duckdb_database handle of the host trex engine instance, captured at extension
// load. Passed to webapi_start so the embedded WebAPI (bao) connects to this same
// instance (shared catalog + cache files) instead of opening its own ":memory:"
// database. 0 = no host handle, in which case the WebAPI opens its own instance
// (e.g. when running standalone on the JVM rather than as a DuckDB extension).
static WEBAPI_HOST_DB: AtomicU64 = AtomicU64::new(0);

// Large stack so WebAPI's deep native-image call chains can't overflow it.
const WEBAPI_STACK_SIZE: usize = 512 * 1024 * 1024;

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

/// dlopen libwebapi-native.so, resolve the symbols, and create a Graal isolate.
/// MUST run on the dedicated isolate thread — the returned isolate-thread pointer
/// is only valid there.
unsafe fn load_lib() -> std::result::Result<WebApiLib, String> {
    let path = std::env::var(LIB_ENV).unwrap_or_else(|_| DEFAULT_LIB.to_string());
    let c_path = std::ffi::CString::new(path.clone()).map_err(|e| e.to_string())?;
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
    Ok(WebApiLib { start, stop, status, thread })
}

/// Body of the dedicated isolate thread: load the library here (so the isolate
/// thread is bound to this OS thread), report init status, then serve commands
/// on this same thread until the channel closes.
fn isolate_thread_main(cmd_rx: Receiver<Cmd>, init_tx: Sender<std::result::Result<(), String>>) {
    let lib = match unsafe { load_lib() } {
        Ok(lib) => lib,
        Err(e) => {
            let _ = init_tx.send(Err(e));
            return;
        }
    };
    let _ = init_tx.send(Ok(()));

    // All FFI into the isolate happens here, on the thread that created it.
    while let Ok(cmd) = cmd_rx.recv() {
        unsafe {
            match cmd {
                Cmd::Start(reply) => {
                    // Hand the host duckdb_database pointer (decimal string) to the
                    // embedded WebAPI so it shares this engine instance; "0" when
                    // absent (WebAPI then opens its own database). The CString lives
                    // until after start() returns (the call is synchronous).
                    let host_db = WEBAPI_HOST_DB.load(Ordering::SeqCst);
                    let cfg = std::ffi::CString::new(host_db.to_string()).unwrap_or_default();
                    let _ = reply.send(cstr_to_string(
                        (lib.start)(lib.thread, cfg.as_ptr() as *mut c_char),
                    ));
                }
                Cmd::Stop(reply) => {
                    let _ = reply.send(cstr_to_string((lib.stop)(lib.thread)));
                }
                Cmd::Status(reply) => {
                    let _ = reply.send(cstr_to_string((lib.status)(lib.thread)));
                }
            }
        }
    }
}

/// Lazily spawn the dedicated isolate thread (idempotent) and return a sender to it.
fn ensure_thread() -> std::result::Result<Sender<Cmd>, String> {
    let mut guard = WEBAPI_TX
        .lock()
        .map_err(|_| "webapi lock poisoned".to_string())?;
    if let Some(tx) = guard.as_ref() {
        return Ok(tx.clone());
    }
    let (cmd_tx, cmd_rx) = channel::<Cmd>();
    let (init_tx, init_rx) = channel::<std::result::Result<(), String>>();
    thread::Builder::new()
        .name("webapi-isolate".to_string())
        .stack_size(WEBAPI_STACK_SIZE)
        .spawn(move || isolate_thread_main(cmd_rx, init_tx))
        .map_err(|e| format!("spawn webapi isolate thread failed: {e}"))?;
    // Block until the thread has loaded the lib + created the isolate, so init
    // errors surface to the caller and a failed attempt can be retried later.
    match init_rx.recv() {
        Ok(Ok(())) => {
            *guard = Some(cmd_tx.clone());
            Ok(cmd_tx)
        }
        Ok(Err(e)) => Err(e),
        Err(e) => Err(format!("webapi isolate thread init failed: {e}")),
    }
}

unsafe fn cstr_to_string(p: *mut c_char) -> String {
    if p.is_null() {
        "(null)".to_string()
    } else {
        CStr::from_ptr(p).to_string_lossy().into_owned()
    }
}

/// Send a command to the dedicated isolate thread and block for its reply.
fn call(make_cmd: impl FnOnce(Sender<String>) -> Cmd) -> String {
    let tx = match ensure_thread() {
        Ok(tx) => tx,
        Err(e) => return format!("error: {e}"),
    };
    let (reply_tx, reply_rx) = channel::<String>();
    if tx.send(make_cmd(reply_tx)).is_err() {
        return "error: webapi isolate thread is not running".to_string();
    }
    match reply_rx.recv() {
        Ok(s) => s,
        Err(e) => format!("error: webapi reply channel closed: {e}"),
    }
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
        let msg = call(Cmd::Start);
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
        let msg = call(Cmd::Stop);
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
        let msg = call(Cmd::Status);
        emit(output, &msg);
        Ok(())
    }
    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(vec![], LogicalTypeId::Varchar.into())]
    }
}

#[duckdb_entrypoint_c_api()]
pub unsafe fn extension_entrypoint(con: Connection) -> Result<(), Box<dyn Error>> {
    // Capture the host engine's duckdb_database so webapi_start can pass it to the
    // embedded WebAPI, which then shares this instance instead of opening its own.
    WEBAPI_HOST_DB.store(con.raw_database() as usize as u64, Ordering::SeqCst);
    con.register_scalar_function::<WebApiStart>("webapi_start")
        .expect("register webapi_start");
    con.register_scalar_function::<WebApiStop>("webapi_stop")
        .expect("register webapi_stop");
    con.register_scalar_function::<WebApiStatus>("webapi_status")
        .expect("register webapi_status");
    Ok(())
}
