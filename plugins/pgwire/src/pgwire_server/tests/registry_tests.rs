//! W1 — `ServerRegistry` & lifecycle tests.
//!
//! Two construction techniques are used:
//!   * Synthetic `ServerHandle` (cheap, no socket) — for tests that assert
//!     on registry internals via `ServerRegistry::new()`.
//!   * End-to-end `start_pgwire_server_capi` / `stop_pgwire_server` — for
//!     real lifecycle / port-release / restart assertions, runs against the
//!     process-wide singleton with cleanup.

use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use std::time::Duration;

use crate::server_registry::{ServerHandle, ServerRegistry};
use tokio::sync::oneshot;

use super::common::{free_port, start_test_server};

/// Build a synthetic ServerHandle that does no real work but exposes the
/// registry contract (thread + oneshot + start_time + credentials). The
/// spawned thread waits for shutdown and exits, mirroring the real lifecycle.
fn make_synthetic_handle(db_credentials: &str) -> ServerHandle {
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let thread_handle = thread::Builder::new()
        .name("test-synthetic-server".to_string())
        .spawn(move || {
            // Block until shutdown; ignore the result of the recv (channel
            // closed when sender dropped is also fine).
            let _ = futures::executor::block_on(shutdown_rx);
            Ok::<_, Box<dyn std::error::Error + Send + Sync>>(())
        })
        .expect("spawn synthetic test thread");
    ServerHandle {
        thread_handle,
        shutdown_tx,
        start_time: std::time::SystemTime::now(),
        db_credentials: db_credentials.to_string(),
    }
}

// ---------- Pure constructors / helpers ----------

#[test]
fn new_registry_is_empty() {
    let reg = ServerRegistry::new();
    assert!(reg.get_servers_info().is_empty());
    assert!(!reg.is_server_running("127.0.0.1", 5432));
}

#[test]
fn server_key_formats_host_and_port() {
    assert_eq!(ServerRegistry::server_key("127.0.0.1", 5432), "127.0.0.1:5432");
    assert_eq!(ServerRegistry::server_key("localhost", 0), "localhost:0");
    assert_eq!(ServerRegistry::server_key("", 1), ":1");
}

// ---------- is_server_running / register_server ----------

#[test]
fn is_server_running_reflects_registration() {
    let reg = ServerRegistry::new();
    assert!(!reg.is_server_running("127.0.0.1", 7001));
    reg.register_server("127.0.0.1".to_string(), 7001, make_synthetic_handle(""))
        .expect("register");
    assert!(reg.is_server_running("127.0.0.1", 7001));
    // Different port is still unregistered.
    assert!(!reg.is_server_running("127.0.0.1", 7002));
    let _ = reg.stop_server("127.0.0.1", 7001);
}

#[test]
fn register_server_rejects_duplicate_host_port() {
    let reg = ServerRegistry::new();
    reg.register_server("127.0.0.1".to_string(), 7100, make_synthetic_handle(""))
        .expect("first register");
    let err = reg
        .register_server("127.0.0.1".to_string(), 7100, make_synthetic_handle(""))
        .expect_err("duplicate should fail");
    assert!(
        err.contains("already running"),
        "expected 'already running' in {err:?}",
    );
    let _ = reg.stop_server("127.0.0.1", 7100);
}

// ---------- update_db_credentials / get_db_credentials ----------

#[test]
fn update_db_credentials_errors_on_empty_registry() {
    let reg = ServerRegistry::new();
    let err = reg
        .update_db_credentials("127.0.0.1", 1234, "anything".to_string())
        .expect_err("empty registry should fail");
    assert!(
        err.contains("No servers"),
        "expected 'No servers' in {err:?}",
    );
}

#[test]
fn update_db_credentials_mutates_all_entries_and_returns_count() {
    let reg = ServerRegistry::new();
    reg.register_server("127.0.0.1".to_string(), 7201, make_synthetic_handle("old1"))
        .unwrap();
    reg.register_server("127.0.0.1".to_string(), 7202, make_synthetic_handle("old2"))
        .unwrap();
    reg.register_server("127.0.0.1".to_string(), 7203, make_synthetic_handle("old3"))
        .unwrap();

    let msg = reg
        .update_db_credentials("ignored", 0, "fresh".to_string())
        .expect("update");
    assert!(msg.contains("3 server"), "expected count in {msg:?}");

    assert_eq!(reg.get_db_credentials("127.0.0.1", 7201).as_deref(), Some("fresh"));
    assert_eq!(reg.get_db_credentials("127.0.0.1", 7202).as_deref(), Some("fresh"));
    assert_eq!(reg.get_db_credentials("127.0.0.1", 7203).as_deref(), Some("fresh"));

    for p in [7201, 7202, 7203] {
        let _ = reg.stop_server("127.0.0.1", p);
    }
}

#[test]
fn get_db_credentials_absent_returns_none() {
    let reg = ServerRegistry::new();
    assert!(reg.get_db_credentials("127.0.0.1", 9999).is_none());
}

#[test]
fn get_db_credentials_present_returns_value() {
    let reg = ServerRegistry::new();
    reg.register_server("127.0.0.1".to_string(), 7300, make_synthetic_handle("hello"))
        .unwrap();
    assert_eq!(reg.get_db_credentials("127.0.0.1", 7300).as_deref(), Some("hello"));
    let _ = reg.stop_server("127.0.0.1", 7300);
}

// ---------- stop_server ----------

#[test]
fn stop_server_succeeds_for_running_server() {
    let reg = ServerRegistry::new();
    reg.register_server("127.0.0.1".to_string(), 7400, make_synthetic_handle(""))
        .unwrap();
    let msg = reg.stop_server("127.0.0.1", 7400).expect("stop");
    assert!(msg.contains("Stopped pgwire server"), "got: {msg}");
    assert!(!reg.is_server_running("127.0.0.1", 7400));
}

#[test]
fn stop_server_errors_for_unknown_host_port() {
    let reg = ServerRegistry::new();
    let err = reg.stop_server("127.0.0.1", 7401).expect_err("stop missing");
    assert!(err.contains("No server running"), "got: {err}");
}

// ---------- get_servers_info ----------

#[test]
fn get_servers_info_reflects_state() {
    let reg = ServerRegistry::new();
    assert!(reg.get_servers_info().is_empty());

    reg.register_server("127.0.0.1".to_string(), 7500, make_synthetic_handle("creds1"))
        .unwrap();
    let info = reg.get_servers_info();
    assert_eq!(info.len(), 1);
    let (host, port, uptime, has_creds) = &info[0];
    assert_eq!(host, "127.0.0.1");
    assert_eq!(*port, 7500);
    assert!(*uptime < 60, "uptime should be small right after register: {uptime}");
    assert!(*has_creds);

    // Add a second server with empty credentials.
    reg.register_server("127.0.0.1".to_string(), 7501, make_synthetic_handle(""))
        .unwrap();
    let info = reg.get_servers_info();
    assert_eq!(info.len(), 2);
    // has_credentials must be false for the empty-creds entry.
    let empty = info.iter().find(|(_, p, _, _)| *p == 7501).expect("7501");
    assert!(!empty.3, "empty credentials should produce has_credentials=false");

    let _ = reg.stop_server("127.0.0.1", 7500);
    let _ = reg.stop_server("127.0.0.1", 7501);
    assert!(reg.get_servers_info().is_empty());
}

#[test]
fn get_servers_info_uptime_increases() {
    let reg = ServerRegistry::new();
    reg.register_server("127.0.0.1".to_string(), 7510, make_synthetic_handle(""))
        .unwrap();
    let t0 = reg.get_servers_info()[0].2;
    thread::sleep(Duration::from_millis(1100));
    let t1 = reg.get_servers_info()[0].2;
    assert!(t1 >= t0, "uptime should be non-decreasing: t0={t0} t1={t1}");
    let _ = reg.stop_server("127.0.0.1", 7510);
}

// ---------- instance() singleton ----------

#[test]
fn instance_returns_same_singleton() {
    let a = ServerRegistry::instance();
    let b = ServerRegistry::instance();
    assert!(std::ptr::eq(a, b), "instance() must return the same &'static");
}

// ---------- End-to-end lifecycle (real server boot) ----------

#[test]
fn start_stop_restart_same_port() {
    // Reserve a port. Reuse the SAME port across two start_/stop_ cycles to
    // prove that `stop_server` joins the thread before returning, so the
    // listener has been released.
    let port = free_port();
    crate::start_pgwire_server_capi("127.0.0.1".to_string(), port, Some("test-pw"), String::new())
        .expect("first start");
    crate::stop_pgwire_server("127.0.0.1", port).expect("first stop");
    crate::start_pgwire_server_capi("127.0.0.1".to_string(), port, Some("test-pw"), String::new())
        .expect("restart on same port");
    crate::stop_pgwire_server("127.0.0.1", port).expect("second stop");
}

#[test]
fn duplicate_start_on_singleton_fails() {
    let (port, _guard) = start_test_server(Some("test-pw"), "");
    // Second start on same port must fail through the singleton's duplicate
    // check (either at `is_server_running` early-out or `register_server`).
    let err = crate::start_pgwire_server_capi(
        "127.0.0.1".to_string(),
        port,
        Some("test-pw"),
        String::new(),
    )
    .expect_err("duplicate start should fail");
    assert!(
        err.contains("already running"),
        "expected 'already running' in {err:?}",
    );
}

/// SECURITY REGRESSION: an empty or absent password must NOT start the server.
///
/// Before this fix, `password = None` or `Some("")` silently fell back to a
/// `NoopHandler` startup handler that accepted EVERY connection without any
/// credential check. Combined with the d2e compose config (which sets no
/// `password` key, so `service_functions` substitutes `''`) and a `0.0.0.0`
/// bind, this exposed an unauthenticated SQL endpoint. Authentication is now
/// mandatory: an empty/None password is rejected and no listener is opened.
#[test]
fn empty_or_missing_password_is_rejected() {
    for password in [None, Some("")] {
        let port = free_port();
        let err = crate::start_pgwire_server_capi(
            "127.0.0.1".to_string(),
            port,
            password,
            String::new(),
        )
        .expect_err("server must refuse to start without a password");
        assert!(
            err.contains("without a password"),
            "expected mandatory-auth error for {password:?}, got {err:?}",
        );
        // The server must never have registered / bound a listener.
        assert!(
            !ServerRegistry::instance().is_server_running("127.0.0.1", port),
            "no server should be running after a rejected start for {password:?}",
        );
    }
}

#[test]
fn stop_pgwire_server_errors_on_unknown_singleton_entry() {
    // Pick a port that nothing on the singleton has registered.
    let port = free_port();
    let err = crate::stop_pgwire_server("127.0.0.1", port)
        .expect_err("stop on unknown port should fail");
    assert!(err.contains("No server running"), "got: {err}");
}

// ---------- Concurrency ----------

#[test]
fn concurrent_register_and_stop_no_deadlock() {
    let reg: &'static ServerRegistry = Box::leak(Box::new(ServerRegistry::new()));
    // Use a shared atomic counter so each thread gets a distinct port number.
    static NEXT_PORT: AtomicU16 = AtomicU16::new(7700);

    let mut handles = Vec::new();
    for _ in 0..8 {
        let h = thread::spawn(move || {
            let port = NEXT_PORT.fetch_add(1, Ordering::Relaxed);
            reg.register_server(
                "127.0.0.1".to_string(),
                port,
                make_synthetic_handle("c"),
            )
            .expect("register");
            // Brief delay to allow more interleaving with other threads.
            thread::sleep(Duration::from_millis(5));
            reg.stop_server("127.0.0.1", port).expect("stop");
        });
        handles.push(h);
    }
    for h in handles {
        h.join().expect("thread join");
    }
    assert!(reg.get_servers_info().is_empty(), "registry should be empty after concurrent stop");
}
