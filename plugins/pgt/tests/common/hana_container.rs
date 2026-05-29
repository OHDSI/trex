//! Testcontainers harness for SAP HANA Express. Gated behind `hana-it`.
//!
//! Use only in integration tests that need a live HDB. Default `cargo test`
//! does NOT pull or start the image.
//!
//! NOTE: `testcontainers-modules` 0.8.0 does not ship a dedicated `hana` module.
//! This file uses the `GenericImage` recipe targeting `saplabs/hanaexpress:latest`
//! on port 39041 as the documented fallback. The public API (`start_hana()` →
//! `HanaHarness`) is identical to what a native `Hana` module would expose.

use hdbconnect::Connection;
use testcontainers::{
    core::{IntoContainerPort, WaitFor},
    runners::SyncRunner,
    Container, GenericImage,
};

pub struct HanaHarness {
    _container: Container<GenericImage>,
    pub url: String,
    pub connection: Connection,
}

pub fn start_hana() -> HanaHarness {
    // Image: saplabs/hanaexpress:latest
    // Port:  39041 (HANA SQL/MDX port)
    // Wait:  stdout message emitted by the express startup script
    let container = GenericImage::new("saplabs/hanaexpress", "latest")
        .with_exposed_port(39041_u16.tcp())
        .with_wait_for(WaitFor::message_on_stdout("Startup finished!"))
        .start()
        .expect("failed to start HANA Express container");

    let port = container
        .get_host_port_ipv4(39041_u16.tcp())
        .expect("HANA port not exposed");

    let url = format!("hdbsql://SYSTEM:HXEHana1@localhost:{}", port);
    let connection = Connection::new(url.as_str()).expect("failed to connect to HANA");

    HanaHarness {
        _container: container,
        url,
        connection,
    }
}
