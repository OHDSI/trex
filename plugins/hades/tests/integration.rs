/// Integration tests for the hades DuckDB extension.
///
/// This file delegates to the `hades-tests` workspace member, which uses the
/// `bundled` DuckDB feature so that `Connection::open_in_memory()` works in a
/// test binary (the `loadable-extension` feature used by the main `hades` crate
/// is incompatible with direct DuckDB calls in test binaries).
///
/// To run the integration tests directly:
///   cargo test -p hades-tests --test integration
#[test]
fn run_integration_tests_via_hades_tests_crate() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let hades_tests_dir = std::path::Path::new(manifest_dir).join("hades-tests");

    let status = std::process::Command::new(env!("CARGO"))
        .args(["test", "--test", "integration"])
        .current_dir(&hades_tests_dir)
        .status()
        .expect("failed to run cargo test in hades-tests");

    assert!(
        status.success(),
        "hades-tests integration tests failed (exit code: {:?})",
        status.code()
    );
}
