use std::sync::Arc;
use std::thread;
use std::time::SystemTime;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::fhir::resource_registry::ResourceRegistry;
use crate::fhir::search_parameter::SearchParamRegistry;
use crate::fhir::structure_definition::DefinitionRegistry;
use crate::query_executor::RequestConn;
use crate::router::build_router;
use crate::server_registry::{ServerHandle, ServerRegistry};
use crate::state::AppState;
use crate::init_fhir_meta;

const FHIR_PROFILES_RESOURCES: &str = include_str!("../data/profiles-resources.json");
const FHIR_PROFILES_TYPES: &str = include_str!("../data/profiles-types.json");
const FHIR_SEARCH_PARAMETERS: &str = include_str!("../data/search-parameters.json");

pub fn load_default_definitions() -> Result<DefinitionRegistry, String> {
    DefinitionRegistry::load_from_json(FHIR_PROFILES_RESOURCES, FHIR_PROFILES_TYPES)
}

pub fn load_search_parameters() -> Result<SearchParamRegistry, String> {
    SearchParamRegistry::load_from_json(FHIR_SEARCH_PARAMETERS)
}

pub fn start_fhir_server(host: String, port: u16, db_name: String, _db_path: String) -> Result<String, String> {
    if ServerRegistry::instance().is_server_running(&host, port) {
        return Err(format!("FHIR server already running on {}:{}", host, port));
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // Gate so the spawned thread doesn't race ahead of the parent's
    // register_server call. If it did and failed instantly, its
    // deregister-on-exit would happen before the registry entry was
    // ever inserted — and the parent's later register would leave a
    // phantom entry pointing at a dead thread.
    let (registered_tx, registered_rx) = std::sync::mpsc::sync_channel::<()>(1);

    let server_host = host.clone();
    let server_port = port;
    let success_host = host.clone();

    // Cloned hostname for the thread's deregister-on-exit guard.
    let cleanup_host = host.clone();

    let thread_handle = thread::Builder::new()
        .name(format!("fhir-server-{}:{}", host, port))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            // Wait for the parent to finish register_server. If the
            // parent dropped the sender (registration failed), bail.
            if registered_rx.recv().is_err() {
                return Ok(());
            }

            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    // Runtime build failed — make absolutely sure the
                    // registry entry doesn't leak.
                    ServerRegistry::instance()
                        .deregister_server(&cleanup_host, server_port);
                    return Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
                }
            };

            let result = rt.block_on(async move {
                {
                    let init_conn = RequestConn::new().map_err(|e| {
                        eprintln!("[fhir] ERROR: Failed to clone host connection: {e}");
                        std::io::Error::new(std::io::ErrorKind::Other, e)
                    })?;
                    init_fhir_meta(&init_conn, &db_name).await;
                }

                eprintln!("[fhir] Loading FHIR R4 StructureDefinitions...");
                let definitions = load_default_definitions().map_err(|e| {
                    eprintln!("[fhir] ERROR: Failed to load FHIR definitions: {e}");
                    std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to load FHIR definitions: {}", e),
                    )
                })?;
                let resource_count = definitions.resources.len();
                let type_count = definitions.types.len();
                eprintln!(
                    "[fhir] Loaded {} resource types and {} data types",
                    resource_count, type_count
                );

                let registry = Arc::new(ResourceRegistry::with_definitions(definitions));

                eprintln!("[fhir] Loading FHIR R4 SearchParameter definitions...");
                let search_params = load_search_parameters().map_err(|e| {
                    eprintln!("[fhir] ERROR: Failed to load search parameters: {e}");
                    std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Failed to load search parameters: {}", e),
                    )
                })?;
                let search_params = Arc::new(search_params);
                eprintln!("[fhir] Search parameters loaded");

                let state = Arc::new(AppState::new(registry, search_params, db_name));
                let app = build_router(state);

                let addr = format!("{}:{}", server_host, server_port);
                let listener = TcpListener::bind(&addr).await.map_err(|e| {
                    eprintln!("[fhir] ERROR: Failed to bind {addr}: {e}");
                    e
                })?;

                eprintln!(
                    "[fhir] Server listening on {}:{}",
                    server_host, server_port
                );

                axum::serve(listener, app)
                    .with_graceful_shutdown(async {
                        let _ = shutdown_rx.await;
                        eprintln!("[fhir] Received shutdown signal");
                    })
                    .await?;

                Ok(())
            });

            if let Err(ref e) = result {
                eprintln!("[fhir] ERROR: Server thread exiting with error: {e}");
            }

            // Always deregister this server's registry entry on thread
            // exit — whether the body returned Ok (graceful shutdown) or
            // Err (init_fhir_meta / definition load / TcpListener::bind
            // failure). Without this, an internal failure after the outer
            // fn registers the handle leaves a phantom entry visible in
            // trex_fhir_status(). If stop_server already removed the
            // entry as part of an explicit shutdown, this is a harmless
            // no-op.
            ServerRegistry::instance()
                .deregister_server(&cleanup_host, server_port);

            result
        })
        .map_err(|e| format!("Failed to spawn FHIR server thread: {}", e))?;

    let server_handle = ServerHandle {
        thread_handle,
        shutdown_tx,
        start_time: SystemTime::now(),
    };

    ServerRegistry::instance().register_server(host.clone(), port, server_handle)?;

    // Now that the registry entry is in place, release the gate so the
    // spawned thread can begin its work. If the thread later fails or
    // panics, its deregister-on-exit guard will clean up the entry.
    let _ = registered_tx.send(());

    Ok(format!(
        "Started FHIR R4 server on {}:{}",
        success_host, port
    ))
}

pub fn stop_fhir_server(host: &str, port: u16) -> Result<String, String> {
    ServerRegistry::instance().stop_server(host, port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_default_definitions_succeeds() {
        let defs = load_default_definitions().expect("FHIR R4 definitions must parse");
        let names = defs.resource_type_names();
        assert!(
            names.len() >= 100,
            "expected at least 100 resource types, got {}",
            names.len()
        );
        assert!(names.iter().any(|n| n == "Patient"));
        assert!(names.iter().any(|n| n == "Observation"));
    }

    #[test]
    fn load_search_parameters_succeeds() {
        let params = load_search_parameters().expect("FHIR R4 search parameters must parse");
        let patient_params = params.params_for_type("Patient");
        assert!(
            !patient_params.is_empty(),
            "expected Patient to have search parameters"
        );
    }
}
