//! Shared fixtures for pgwire test submodules.
//!
//! Declared as `#[cfg(test)] mod common;` at the top of `pgwire_server.rs`.
//! Sibling test submodules reach helpers via `use super::common::*;`.
//!
//! Helpers here MUST be append-only — multiple workstreams use this file.

#![allow(dead_code)]

use std::net::TcpListener as StdListener;

/// Bind to an ephemeral port on 127.0.0.1, return the assigned port, and
/// release the listener so the test can re-bind. Race window is small but
/// non-zero; tests that hit EADDRINUSE should retry once.
pub fn free_port() -> u16 {
    let l = StdListener::bind("127.0.0.1:0").expect("bind ephemeral port");
    l.local_addr().expect("local_addr").port()
}

/// RAII guard that stops the pgwire server on drop. Use with
/// `start_pgwire_server_capi` so leaked ports don't accumulate.
pub struct TestServerGuard {
    pub host: String,
    pub port: u16,
}

impl Drop for TestServerGuard {
    fn drop(&mut self) {
        // Best-effort: ignore errors from already-stopped servers.
        let _ = crate::stop_pgwire_server(&self.host, self.port);
    }
}

/// Start a pgwire server bound to an ephemeral 127.0.0.1 port.
/// Returns the assigned port + RAII guard.
///
/// `password` of `None` or `Some("")` runs without auth.
pub fn start_test_server(
    password: Option<&str>,
    db_credentials: &str,
) -> (u16, TestServerGuard) {
    let port = free_port();
    crate::start_pgwire_server_capi(
        "127.0.0.1".to_string(),
        port,
        password,
        db_credentials.to_string(),
    )
    .expect("start_pgwire_server_capi");
    (
        port,
        TestServerGuard {
            host: "127.0.0.1".to_string(),
            port,
        },
    )
}

/// Open a tokio-postgres client. Caller must `await` the connection driver
/// in a tokio task — convenience wrapper for tests.
pub async fn connect_pg(
    port: u16,
    user: &str,
    password: &str,
    dbname: &str,
) -> tokio_postgres::Client {
    let conn_str = format!(
        "host=127.0.0.1 port={} user={} password={} dbname={}",
        port, user, password, dbname,
    );
    let (client, connection) = tokio_postgres::connect(&conn_str, tokio_postgres::NoTls)
        .await
        .expect("tokio-postgres connect");
    tokio::spawn(async move {
        let _ = connection.await;
    });
    client
}
