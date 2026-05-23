use tokio::sync::oneshot;
use uuid::Uuid;

use etl::pipeline_registry::{registry, PipelineMode, PipelineState};

/// Helper to mint a unique pipeline name for tests sharing the global registry.
fn unique_name(prefix: &str) -> String {
    format!("{}_{}", prefix, Uuid::new_v4().simple())
}

/// Drop guard that deregisters a pipeline name even if the test panics.
struct Cleanup(String);
impl Drop for Cleanup {
    fn drop(&mut self) {
        registry().deregister(&self.0);
    }
}

// --- PipelineMode ---

#[test]
fn pipeline_mode_as_str_round_trip() {
    for mode in [PipelineMode::CopyAndCdc, PipelineMode::CdcOnly, PipelineMode::CopyOnly] {
        let s = mode.as_str();
        assert_eq!(PipelineMode::from_str(s).unwrap(), mode);
    }
}

#[test]
fn pipeline_mode_from_str_case_insensitive() {
    assert_eq!(PipelineMode::from_str("COPY_AND_CDC").unwrap(), PipelineMode::CopyAndCdc);
    assert_eq!(PipelineMode::from_str("CDC_ONLY").unwrap(), PipelineMode::CdcOnly);
}

#[test]
fn pipeline_mode_from_str_invalid() {
    let err = PipelineMode::from_str("nope").unwrap_err();
    assert!(err.contains("Invalid mode"));
    assert!(err.contains("copy_and_cdc"));
}

// --- PipelineState ---

#[test]
fn pipeline_state_as_str_all_variants() {
    assert_eq!(PipelineState::Starting.as_str(), "starting");
    assert_eq!(PipelineState::Snapshotting.as_str(), "snapshotting");
    assert_eq!(PipelineState::Streaming.as_str(), "streaming");
    assert_eq!(PipelineState::Stopping.as_str(), "stopping");
    assert_eq!(PipelineState::Stopped.as_str(), "stopped");
    assert_eq!(PipelineState::Error.as_str(), "error");
}

// --- Registry: reserve + lookup ---

#[test]
fn registry_reserve_then_find_in_get_all_info() {
    let name = unique_name("res");
    let _cleanup = Cleanup(name.clone());
    let (tx, _rx) = oneshot::channel();

    registry()
        .reserve(&name, "host=h", "pub1", PipelineMode::CopyAndCdc, tx)
        .unwrap();

    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Starting);
    assert_eq!(info.mode, PipelineMode::CopyAndCdc);
    assert_eq!(info.connection_string, "host=h");
    assert_eq!(info.publication, "pub1");
    assert!(info.snapshot_enabled);
    assert_eq!(info.rows_replicated, 0);
}

#[test]
fn registry_reserve_dedup_rejects_existing_name() {
    let name = unique_name("dup");
    let _cleanup = Cleanup(name.clone());
    let (tx1, _rx1) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CdcOnly, tx1).unwrap();

    let (tx2, _rx2) = oneshot::channel();
    let err = registry().reserve(&name, "h", "p", PipelineMode::CdcOnly, tx2).unwrap_err();
    assert!(err.contains("already exists"));
}

#[test]
fn registry_snapshot_enabled_flag_per_mode() {
    let cases = [
        (PipelineMode::CopyAndCdc, true),
        (PipelineMode::CopyOnly, true),
        (PipelineMode::CdcOnly, false),
    ];
    for (mode, expected) in cases {
        let name = unique_name("snap");
        let _cleanup = Cleanup(name.clone());
        let (tx, _rx) = oneshot::channel();
        registry().reserve(&name, "h", "p", mode.clone(), tx).unwrap();

        let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
        assert_eq!(info.snapshot_enabled, expected, "mode={:?}", mode);
    }
}

// --- Registry: state transitions ---

#[test]
fn registry_update_state_changes_state() {
    let name = unique_name("upd");
    let _cleanup = Cleanup(name.clone());
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CopyAndCdc, tx).unwrap();

    registry().update_state(&name, PipelineState::Snapshotting);
    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Snapshotting);
}

#[test]
fn registry_transition_to_streaming_only_from_snapshotting() {
    let name = unique_name("ts");
    let _cleanup = Cleanup(name.clone());
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CopyAndCdc, tx).unwrap();

    // From Starting → no-op.
    registry().transition_to_streaming_once(&name);
    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Starting);

    // From Snapshotting → transitions.
    registry().update_state(&name, PipelineState::Snapshotting);
    registry().transition_to_streaming_once(&name);
    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Streaming);

    // Already Streaming → no-op.
    registry().transition_to_streaming_once(&name);
    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Streaming);
}

#[test]
fn registry_update_stats_accumulates_and_sets_last_activity() {
    let name = unique_name("st");
    let _cleanup = Cleanup(name.clone());
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CopyAndCdc, tx).unwrap();

    registry().update_stats(&name, 10);
    registry().update_stats(&name, 5);

    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.rows_replicated, 15);
    assert!(info.last_activity.is_some());
}

#[test]
fn registry_set_error_transitions_to_error_and_records_message() {
    let name = unique_name("err");
    let _cleanup = Cleanup(name.clone());
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CopyAndCdc, tx).unwrap();

    registry().set_error(&name, "boom");

    let info = registry().get_all_info().into_iter().find(|i| i.name == name).unwrap();
    assert_eq!(info.state, PipelineState::Error);
    assert_eq!(info.error_message.as_deref(), Some("boom"));
}

// --- Registry: missing-pipeline calls are no-ops ---

#[test]
fn registry_methods_on_missing_pipeline_are_noops() {
    let missing = unique_name("missing");
    // None of these must panic, and none of them must silently create an entry.
    registry().update_state(&missing, PipelineState::Streaming);
    registry().transition_to_streaming_once(&missing);
    registry().update_stats(&missing, 1);
    registry().set_error(&missing, "x");

    assert!(
        registry().get_all_info().iter().all(|i| i.name != missing),
        "calls on missing pipeline must not create an entry"
    );
}

#[test]
fn registry_stop_on_missing_pipeline_returns_err() {
    let missing = unique_name("stop");
    let err = registry().stop(&missing).unwrap_err();
    assert!(err.contains("not found"));
}

// --- Registry: stop + deregister ---

#[test]
fn registry_stop_returns_ok_and_removes_pipeline() {
    let name = unique_name("rm");
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CdcOnly, tx).unwrap();

    let msg = registry().stop(&name).unwrap();
    assert!(msg.contains(&name));
    assert!(registry().get_all_info().iter().all(|i| i.name != name));
}

#[test]
fn registry_deregister_removes_without_signaling() {
    let name = unique_name("dereg");
    let (tx, _rx) = oneshot::channel();
    registry().reserve(&name, "h", "p", PipelineMode::CdcOnly, tx).unwrap();

    registry().deregister(&name);
    assert!(registry().get_all_info().iter().all(|i| i.name != name));
}
