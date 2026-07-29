use duckdb::{Config, Connection};
use std::path::PathBuf;

fn extension_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // Navigate from hades-tests/ up to hades/ where the extension is built
    path.pop(); // hades/
    path.push("target");
    path.push("debug");

    #[cfg(target_os = "linux")]
    path.push("libhades.so");
    #[cfg(target_os = "macos")]
    path.push("libhades.dylib");
    #[cfg(target_os = "windows")]
    path.push("hades.dll");

    path
}

/// Appends DuckDB extension metadata to a buffer, matching the format from
/// `extension-ci-tools/scripts/append_extension_metadata.py`.
fn append_extension_metadata(buf: &mut Vec<u8>, abi_type: &str, duckdb_version: &str, platform: &str, ext_version: &str) {
    // start_signature: custom section marker for the metadata footer
    buf.push(0x00);     // 0 for custom section
    buf.push(147);      // 0x93
    buf.push(4);        // 0x04
    buf.push(16);       // length of name (16 bytes)
    buf.extend_from_slice(b"duckdb_signature"); // 16 bytes
    buf.push(128);      // 0x80
    buf.push(4);        // 0x04

    // padded_byte_string helper: pad to 32 bytes with NUL
    let pad = |s: &str| -> [u8; 32] {
        let mut arr = [0u8; 32];
        let b = s.as_bytes();
        let n = b.len().min(32);
        arr[..n].copy_from_slice(&b[..n]);
        arr
    };

    // Fields in order (FIELD8..FIELD1):
    buf.extend_from_slice(&pad(""));              // FIELD8 (unused)
    buf.extend_from_slice(&pad(""));              // FIELD7 (unused)
    buf.extend_from_slice(&pad(""));              // FIELD6 (unused)
    buf.extend_from_slice(&pad(abi_type));        // FIELD5 (abi_type)
    buf.extend_from_slice(&pad(ext_version));     // FIELD4 (extension_version)
    buf.extend_from_slice(&pad(duckdb_version));  // FIELD3 (duckdb_version)
    buf.extend_from_slice(&pad(platform));        // FIELD2 (duckdb_platform)
    buf.extend_from_slice(&pad("4"));             // FIELD1 (header signature = "4")

    // 256 bytes of empty signature space (for unsigned extensions)
    buf.extend_from_slice(&[0u8; 256]);
}

/// Builds a `.trex` file from `libhades.so` by appending DuckDB extension
/// metadata with abi_type = "C_STRUCT_UNSTABLE" (matching the `hades` Makefile
/// USE_UNSTABLE_C_API=1 setting) so DuckDB accepts the raw shared library.
fn trex_extension_path() -> PathBuf {
    let src = extension_path();
    assert!(src.exists(), "Extension not built at {}. Run `cargo build` first.", src.display());

    // DuckDB derives the init function name from the file stem: stem + "_init_c_api"
    // Our library exports "hades_init_c_api", so the file must be named "hades.trex"
    // (not "libhades.trex" which would look for "libhades_init_c_api")
    let mut dst = src.parent().unwrap().to_path_buf();
    dst.push("hades.trex");

    // Rebuild if .trex doesn't exist or doesn't have the expected size
    // (expected = .so size + 534 bytes of appended metadata)
    // This avoids stale .trex files created without proper metadata.
    let needs_rebuild = {
        let so_size = src.metadata().map(|m| m.len()).unwrap_or(0);
        let expected_trex_size = so_size + 534;
        match dst.metadata() {
            Ok(d) => d.len() != expected_trex_size,
            Err(_) => true,
        }
    };

    if needs_rebuild {
        let so_bytes = std::fs::read(&src).expect("read .so");
        let mut trex_bytes = so_bytes;

        // Detect platform
        #[cfg(target_os = "linux")]
        let platform = if cfg!(target_arch = "x86_64") { "linux_amd64" } else { "linux_arm64" };
        #[cfg(target_os = "macos")]
        let platform = if cfg!(target_arch = "x86_64") { "osx_amd64" } else { "osx_arm64" };
        #[cfg(target_os = "windows")]
        let platform = "windows_amd64";

        // USE_UNSTABLE_C_API=1 in the Makefile means abi_type=C_STRUCT_UNSTABLE
        append_extension_metadata(
            &mut trex_bytes,
            "C_STRUCT_UNSTABLE",
            "v1.2.0",   // min_duckdb_version from duckdb_entrypoint_c_api macro default
            platform,
            "v0.1.0",
        );

        std::fs::write(&dst, &trex_bytes).expect("write .trex");
    }

    dst
}

fn load_extension() -> Connection {
    let ext = trex_extension_path();
    let config = Config::default()
        .allow_unsigned_extensions()
        .expect("allow_unsigned_extensions config")
        .with("allow_extensions_metadata_mismatch", "true")
        .expect("allow_extensions_metadata_mismatch config");
    let db = Connection::open_in_memory_with_flags(config).expect("open db");
    db.execute(&format!("LOAD '{}'", ext.display()), []).unwrap();
    db
}

#[test]
fn extension_loads_successfully() {
    let _db = load_extension();
}

#[test]
fn hades_jobs_returns_empty() {
    let db = load_extension();
    let mut stmt = db.prepare("SELECT * FROM trex_hades_jobs()").unwrap();
    let count: usize = stmt.query_map([], |_row| Ok(())).unwrap().count();
    assert_eq!(count, 0);
}

#[test]
fn hades_envs_returns_empty_for_nonexistent_dir() {
    let db = load_extension();
    let mut stmt = db.prepare("SELECT * FROM trex_hades_envs('/nonexistent/path/that/does/not/exist')").unwrap();
    let count: usize = stmt.query_map([], |_row| Ok(())).unwrap().count();
    assert_eq!(count, 0);
}

#[test]
fn hades_status_returns_empty_for_unknown_job() {
    let db = load_extension();
    let mut stmt = db.prepare("SELECT * FROM trex_hades_status('nonexistent-job-id')").unwrap();
    let count: usize = stmt.query_map([], |_row| Ok(())).unwrap().count();
    assert_eq!(count, 0);
}

#[test]
fn hades_cancel_returns_not_found_for_unknown_job() {
    let db = load_extension();
    let mut stmt = db.prepare("SELECT trex_hades_cancel('nonexistent-job-id')").unwrap();
    let result: String = stmt.query_row([], |row| row.get(0)).unwrap();
    assert!(result.contains("not_found_or_not_running"), "Expected not_found response, got: {result}");
}
