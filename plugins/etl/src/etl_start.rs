use std::collections::HashMap;
use std::sync::{Arc, Mutex, Once};
use std::thread;

use duckdb::core::{DataChunkHandle, Inserter, LogicalTypeId};
use duckdb::vtab::arrow::WritableVector;
use duckdb::vscalar::{ScalarFunctionSignature, VScalar};
use secrecy::SecretString;
use tokio::sync::oneshot;

use crate::credential_mask;
use crate::destination::DuckDbDestination;
use crate::pipeline_registry::{self, PipelineMode, PipelineState};
use crate::store::DuckDbStore;

/// rustls 0.23+ requires a CryptoProvider be installed before any TLS handshake.
/// Both `ring` and `aws-lc-rs` features are pulled in transitively (reqwest, etl-lib),
/// so auto-selection panics. We install `ring` explicitly (smaller, more portable).
static CRYPTO_INIT: Once = Once::new();

fn ensure_crypto_provider() {
    CRYPTO_INIT.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

struct PipelineParams {
    batch_size: usize,
    batch_timeout_ms: u64,
    retry_delay_ms: u64,
    retry_max_attempts: u32,
}

impl Default for PipelineParams {
    fn default() -> Self {
        Self {
            batch_size: 1000,
            batch_timeout_ms: 5000,
            retry_delay_ms: 10000,
            retry_max_attempts: 5,
        }
    }
}

pub struct EtlStartScalar;

impl VScalar for EtlStartScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let name_vector = input.flat_vector(0);
        let conn_vector = input.flat_vector(1);

        let name_slice =
            name_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let conn_slice =
            conn_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let pipeline_name = duckdb::types::DuckString::new(&mut { name_slice[0] })
            .as_str()
            .to_string();
        let connection_string = duckdb::types::DuckString::new(&mut { conn_slice[0] })
            .as_str()
            .to_string();

        let num_cols = input.num_columns();

        // Determine mode and params based on signature:
        //   2 cols: (name, conn) -> default mode, default params
        //   3 cols: (name, conn, mode) -> parse mode, default params
        //   6 cols: (name, conn, batch_size, batch_timeout, retry_delay, retry_max) -> default mode, parse params from col 2-5
        //   7 cols: (name, conn, mode, batch_size, batch_timeout, retry_delay, retry_max) -> parse mode, parse params from col 3-6
        let has_mode_col = num_cols == 3 || num_cols == 7;

        let mode_str = if has_mode_col {
            let mode_vector = input.flat_vector(2);
            let mode_slice =
                mode_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
            duckdb::types::DuckString::new(&mut { mode_slice[0] })
                .as_str()
                .to_string()
        } else {
            "copy_and_cdc".to_string()
        };

        let mode = PipelineMode::from_str(&mode_str)
            .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

        let params = if num_cols == 7 {
            // 7-param: mode at col 2, batch params at cols 3-6
            let batch_size_vector = input.flat_vector(3);
            let batch_timeout_vector = input.flat_vector(4);
            let retry_delay_vector = input.flat_vector(5);
            let retry_max_vector = input.flat_vector(6);

            let batch_size_slice = batch_size_vector.as_slice_with_len::<i32>(input.len());
            let batch_timeout_slice = batch_timeout_vector.as_slice_with_len::<i32>(input.len());
            let retry_delay_slice = retry_delay_vector.as_slice_with_len::<i32>(input.len());
            let retry_max_slice = retry_max_vector.as_slice_with_len::<i32>(input.len());

            let batch_size = batch_size_slice[0];
            let batch_timeout_ms = batch_timeout_slice[0];
            let retry_delay_ms = retry_delay_slice[0];
            let retry_max_attempts = retry_max_slice[0];

            if batch_size <= 0 {
                return Err("batch_size must be greater than 0".into());
            }
            if batch_timeout_ms <= 0 {
                return Err("batch_timeout_ms must be greater than 0".into());
            }
            if retry_delay_ms < 0 {
                return Err("retry_delay_ms must be >= 0".into());
            }
            if retry_max_attempts < 0 {
                return Err("retry_max_attempts must be >= 0".into());
            }

            PipelineParams {
                batch_size: batch_size as usize,
                batch_timeout_ms: batch_timeout_ms as u64,
                retry_delay_ms: retry_delay_ms as u64,
                retry_max_attempts: retry_max_attempts as u32,
            }
        } else if num_cols == 6 {
            // 6-param legacy: batch params at cols 2-5 (no mode column)
            let batch_size_vector = input.flat_vector(2);
            let batch_timeout_vector = input.flat_vector(3);
            let retry_delay_vector = input.flat_vector(4);
            let retry_max_vector = input.flat_vector(5);

            let batch_size_slice = batch_size_vector.as_slice_with_len::<i32>(input.len());
            let batch_timeout_slice = batch_timeout_vector.as_slice_with_len::<i32>(input.len());
            let retry_delay_slice = retry_delay_vector.as_slice_with_len::<i32>(input.len());
            let retry_max_slice = retry_max_vector.as_slice_with_len::<i32>(input.len());

            let batch_size = batch_size_slice[0];
            let batch_timeout_ms = batch_timeout_slice[0];
            let retry_delay_ms = retry_delay_slice[0];
            let retry_max_attempts = retry_max_slice[0];

            if batch_size <= 0 {
                return Err("batch_size must be greater than 0".into());
            }
            if batch_timeout_ms <= 0 {
                return Err("batch_timeout_ms must be greater than 0".into());
            }
            if retry_delay_ms < 0 {
                return Err("retry_delay_ms must be >= 0".into());
            }
            if retry_max_attempts < 0 {
                return Err("retry_max_attempts must be >= 0".into());
            }

            PipelineParams {
                batch_size: batch_size as usize,
                batch_timeout_ms: batch_timeout_ms as u64,
                retry_delay_ms: retry_delay_ms as u64,
                retry_max_attempts: retry_max_attempts as u32,
            }
        } else {
            PipelineParams::default()
        };

        let response = start_pipeline(&pipeline_name, &connection_string, mode, params)?;

        let flat_vector = output.flat_vector();
        flat_vector.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![
            // 2-param: (name, connection_string)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
            // 3-param: (name, connection_string, mode)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
            // 6-param legacy: (name, connection_string, batch_size, batch_timeout, retry_delay, retry_max)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
            // 7-param: (name, connection_string, mode, batch_size, batch_timeout, retry_delay, retry_max)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                    LogicalTypeId::Integer.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
        ]
    }
}

#[derive(Debug)]
pub(crate) struct ParsedConnParams {
    pub host: String,
    pub port: u16,
    pub dbname: String,
    pub username: String,
    pub password: Option<SecretString>,
    pub publication: String,
    pub schema_name: String,
}

fn parse_pipeline_params(
    connection_string: &str,
    mode: &PipelineMode,
) -> Result<ParsedConnParams, Box<dyn std::error::Error>> {
    let host = credential_mask::extract_param(connection_string, "host")
        .unwrap_or("localhost")
        .to_string();
    let port: u16 = credential_mask::extract_param(connection_string, "port")
        .unwrap_or("5432")
        .parse()?;
    let dbname = credential_mask::extract_param(connection_string, "dbname")
        .unwrap_or("postgres")
        .to_string();
    let username = credential_mask::extract_param(connection_string, "user")
        .unwrap_or("postgres")
        .to_string();
    let password = credential_mask::extract_param(connection_string, "password")
        .map(|p| SecretString::from(p.to_string()));

    let publication = match mode {
        PipelineMode::CopyOnly => {
            credential_mask::extract_param(connection_string, "publication")
                .unwrap_or("")
                .to_string()
        }
        _ => {
            credential_mask::extract_param(connection_string, "publication")
                .ok_or("connection string must include 'publication=<name>'")?
                .to_string()
        }
    };

    let schema_name = credential_mask::extract_param(connection_string, "schema")
        .unwrap_or("public")
        .to_string();

    Ok(ParsedConnParams {
        host,
        port,
        dbname,
        username,
        password,
        publication,
        schema_name,
    })
}

fn build_attach_name(pipeline_name: &str) -> String {
    format!("__etl_{}", pipeline_name.replace('-', "_"))
}

fn build_attach_sql(conn_str: &str, attach_name: &str) -> String {
    let stripped = strip_non_libpq_params(conn_str);
    let escaped_conn = stripped.replace('\'', "''");
    format!(
        "ATTACH IF NOT EXISTS '{}' AS \"{}\" (TYPE postgres, READ_ONLY)",
        escaped_conn, attach_name
    )
}

fn build_list_tables_sql(attach_name: &str, schema: &str) -> String {
    let escaped_schema = schema.replace('\'', "''");
    format!(
        "SELECT table_name FROM \"{}\".information_schema.tables WHERE table_schema = '{}'",
        attach_name, escaped_schema
    )
}

fn build_copy_table_sql(schema: &str, table: &str, attach_name: &str) -> String {
    let escaped_table = table.replace('"', "\"\"");
    let escaped_schema = schema.replace('"', "\"\"");
    format!(
        "CREATE TABLE IF NOT EXISTS \"{}\".\"{}\" AS SELECT * FROM \"{}\".\"{}\".\"{}\";",
        escaped_schema, escaped_table, attach_name, escaped_schema, escaped_table
    )
}

fn build_count_table_sql(schema: &str, table: &str) -> String {
    let escaped_schema = schema.replace('"', "\"\"");
    let escaped_table = table.replace('"', "\"\"");
    format!(
        "SELECT COUNT(*) FROM \"{}\".\"{}\"",
        escaped_schema, escaped_table
    )
}

fn build_detach_sql(attach_name: &str) -> String {
    format!("DETACH \"{}\"", attach_name)
}

fn start_pipeline(
    pipeline_name: &str,
    connection_string: &str,
    mode: PipelineMode,
    params: PipelineParams,
) -> Result<String, Box<dyn std::error::Error>> {
    ensure_crypto_provider();

    let parsed = parse_pipeline_params(connection_string, &mode)?;
    let ParsedConnParams {
        host,
        port,
        dbname,
        username,
        password,
        publication,
        schema_name,
    } = parsed;

    let masked_conn = credential_mask::mask_password(connection_string);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    pipeline_registry::registry()
        .reserve(
            pipeline_name,
            &masked_conn,
            &publication,
            mode.clone(),
            shutdown_tx,
        )
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

    // Verify the pool extension is loaded by leasing and immediately releasing a session.
    let probe_sid = trex_pool_client::create_session()
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
    let _ = trex_pool_client::destroy_session(probe_sid);

    let name = pipeline_name.to_string();
    let name_for_thread = pipeline_name.to_string();

    if mode == PipelineMode::CopyOnly {
        return start_copy_only_pipeline(
            &name,
            &name_for_thread,
            connection_string,
            &schema_name,
            shutdown_rx,
        );
    }

    let table_sync_copy = match mode {
        PipelineMode::CdcOnly => etl_lib::config::TableSyncCopyConfig::SkipAllTables,
        _ => etl_lib::config::TableSyncCopyConfig::IncludeAllTables,
    };

    let thread_result = thread::Builder::new()
        .name(format!("etl-pipeline-{}", pipeline_name))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;

            rt.block_on(async move {
                pipeline_registry::registry().update_state(&name, PipelineState::Starting);

                let schemas = Arc::new(Mutex::new(HashMap::new()));
                let destination =
                    DuckDbDestination::new(name.clone(), schemas.clone());
                let store = DuckDbStore::new(name.clone(), schemas);

                // Source PG TLS cert validation: by default the trusted root
                // store is empty, so only well-known CAs would pass — except
                // etl-lib seeds an empty RootCertStore, meaning self-signed
                // certs always fail. Operators can drop a PEM bundle at
                // /etc/trexsql/etl_pg_ca.pem to extend trust (e.g. for private
                // CAs or test fixtures with self-signed certs).
                let trusted_root_certs =
                    std::fs::read_to_string("/etc/trexsql/etl_pg_ca.pem").unwrap_or_default();

                let pg_config = etl_lib::config::PgConnectionConfig {
                    host,
                    port,
                    name: dbname,
                    username,
                    password,
                    tls: etl_lib::config::TlsConfig {
                        trusted_root_certs,
                        enabled: true,
                    },
                    keepalive: None,
                };

                let pipeline_config = etl_lib::config::PipelineConfig {
                    id: 1,
                    publication_name: publication,
                    pg_connection: pg_config,
                    batch: etl_lib::config::BatchConfig {
                        max_size: params.batch_size,
                        max_fill_ms: params.batch_timeout_ms,
                    },
                    table_error_retry_delay_ms: params.retry_delay_ms,
                    table_error_retry_max_attempts: params.retry_max_attempts,
                    max_table_sync_workers: 4,
                    table_sync_copy,
                    invalidated_slot_behavior: etl_lib::config::InvalidatedSlotBehavior::Error,
                };

                let mut pipeline = etl_lib::pipeline::Pipeline::new(
                    pipeline_config,
                    store,
                    destination,
                );

                pipeline_registry::registry()
                    .update_state(&name, PipelineState::Snapshotting);

                // `pipeline.start()` returns Ok once workers are spawned; the
                // workers then run until they finish or shutdown is requested.
                // We must await `pipeline.wait()` to actually drive workers to
                // completion, racing it against the external shutdown signal.
                if let Err(e) = pipeline.start().await {
                    pipeline_registry::registry()
                        .set_error(&name, &format!("{}", e));
                    return Err(format!("{}", e).into());
                }

                // Grab a shutdown handle *before* wait() consumes the pipeline.
                let shutdown_handle = pipeline.shutdown_tx();
                let wait_fut = pipeline.wait();
                tokio::pin!(wait_fut);

                tokio::select! {
                    result = &mut wait_fut => {
                        match result {
                            Ok(()) => {
                                pipeline_registry::registry()
                                    .update_state(&name, PipelineState::Stopped);
                            }
                            Err(e) => {
                                pipeline_registry::registry()
                                    .set_error(&name, &format!("{}", e));
                                return Err(format!("{}", e).into());
                            }
                        }
                    }
                    _ = shutdown_rx => {
                        // Twin of the copy_only fix below: write Stopping while
                        // we tear down workers, then set_state(Stopped) once
                        // shutdown completes (or set_error on shutdown failure).
                        // Without the final transition, `trex_etl_status()` would
                        // be stuck reporting "stopping" indefinitely.
                        pipeline_registry::registry()
                            .update_state(&name, PipelineState::Stopping);

                        // Signal workers to wind down, then drive wait_fut to
                        // completion so the final state reflects reality.
                        if let Err(e) = shutdown_handle.shutdown() {
                            pipeline_registry::registry()
                                .set_error(&name, &format!("shutdown signal failed: {}", e));
                            return Err(format!("shutdown signal failed: {}", e).into());
                        }

                        match wait_fut.await {
                            Ok(()) => {
                                pipeline_registry::registry()
                                    .update_state(&name, PipelineState::Stopped);
                            }
                            Err(e) => {
                                pipeline_registry::registry()
                                    .set_error(&name, &format!("{}", e));
                                return Err(format!("{}", e).into());
                            }
                        }
                    }
                }

                Ok(())
            })
        });

    match thread_result {
        Ok(handle) => {
            pipeline_registry::registry().set_thread_handle(&name_for_thread, handle);
        }
        Err(e) => {
            pipeline_registry::registry().deregister(&name_for_thread);
            return Err(format!("Failed to spawn pipeline thread: {}", e).into());
        }
    }

    Ok(format!("Pipeline '{}' started", pipeline_name))
}

fn start_copy_only_pipeline(
    name: &str,
    name_for_thread: &str,
    connection_string: &str,
    schema_name: &str,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<String, Box<dyn std::error::Error>> {
    let pipeline_name = name.to_string();
    let name_for_thread = name_for_thread.to_string();
    let conn_str = connection_string.to_string();
    let schema = schema_name.to_string();
    let attach_name = build_attach_name(&pipeline_name);

    let thread_result = thread::Builder::new()
        .name(format!("etl-copy-{}", pipeline_name))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            let mut shutdown = shutdown_rx;

            pipeline_registry::registry()
                .update_state(&pipeline_name, PipelineState::Starting);

            // ATTACH catalog state is per-connection; later SELECTs/CREATEs
            // against the attached source need the same direct conn.
            let session_id = trex_pool_client::create_session()
                .map_err(|e| format!("Failed to create session: {}", e))?;

            // Use a closure so we can clean up the session on any exit path.
            let result = (|| -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
                trex_pool_client::session_execute(session_id, "LOAD postgres")
                    .map_err(|e| format!("Failed to load postgres scanner: {}", e))?;

                // DuckDB's postgres scanner uses libpq directly and rejects
                // ETL-specific keys like `publication=` and `schema=`. Strip them
                // before ATTACH or libpq returns "invalid connection option".
                let attach_sql = build_attach_sql(&conn_str, &attach_name);
                trex_pool_client::session_execute(session_id, &attach_sql)
                    .map_err(|e| format!("Failed to attach source: {}", e))?;

                pipeline_registry::registry()
                    .update_state(&pipeline_name, PipelineState::Snapshotting);

                let tables: Vec<String> = {
                    let sql = build_list_tables_sql(&attach_name, &schema);
                    let (_schema, batches) = trex_pool_client::session_execute(session_id, &sql)
                        .map_err(|e| format!("Failed to query tables: {}", e))?;
                    extract_string_column(&batches, "table_name")
                };

                let mut had_error = false;
                for table in &tables {
                    match shutdown.try_recv() {
                        Ok(_) | Err(oneshot::error::TryRecvError::Closed) => {
                            pipeline_registry::registry()
                                .update_state(&pipeline_name, PipelineState::Stopping);
                            let _ = trex_pool_client::session_execute(
                                session_id,
                                &build_detach_sql(&attach_name),
                            );
                            return Ok(());
                        }
                        Err(oneshot::error::TryRecvError::Empty) => {}
                    }

                    let escaped_schema = schema.replace('"', "\"\"");

                    let copy_sql = build_copy_table_sql(&schema, table, &attach_name);

                    let ensure_schema_sql = format!(
                        "CREATE SCHEMA IF NOT EXISTS \"{}\"",
                        escaped_schema
                    );

                    if let Err(e) = trex_pool_client::session_execute(session_id, &ensure_schema_sql) {
                        eprintln!("etl: create schema error for '{}': {}", schema, e);
                    }
                    match trex_pool_client::session_execute(session_id, &copy_sql) {
                        Ok(_) => {
                            let count_sql = build_count_table_sql(&schema, table);
                            let row_count = trex_pool_client::session_execute(session_id, &count_sql)
                                .ok()
                                .and_then(|(_s, batches)| extract_i64_scalar(&batches))
                                .unwrap_or(0) as u64;
                            pipeline_registry::registry()
                                .update_stats(&pipeline_name, row_count);
                        }
                        Err(e) => {
                            eprintln!(
                                "etl: copy error for table '{}.{}': {}",
                                schema, table, e
                            );
                            had_error = true;
                        }
                    }
                }

                let _ = trex_pool_client::session_execute(
                    session_id,
                    &build_detach_sql(&attach_name),
                );

                if had_error {
                    pipeline_registry::registry()
                        .set_error(&pipeline_name, "Some tables failed to copy");
                } else {
                    pipeline_registry::registry()
                        .update_state(&pipeline_name, PipelineState::Stopped);
                }

                Ok(())
            })();

            let _ = trex_pool_client::destroy_session(session_id);

            // Surface any early-step failure (LOAD postgres, ATTACH, table query,
            // schema-create) to the registry. Without this, the thread returns Err
            // silently and the registry stays in its last set state (Starting or
            // Snapshotting), which is what made copy_only appear stuck.
            match &result {
                Ok(()) => {}
                Err(e) => {
                    let msg = format!("{}", e);
                    pipeline_registry::registry().set_error(&pipeline_name, &msg);
                }
            }
            result
        });

    match thread_result {
        Ok(handle) => {
            pipeline_registry::registry().set_thread_handle(&name_for_thread, handle);
        }
        Err(e) => {
            pipeline_registry::registry().deregister(&name_for_thread);
            return Err(format!("Failed to spawn pipeline thread: {}", e).into());
        }
    }

    Ok(format!("Pipeline '{}' started (copy_only)", name))
}

/// Strip ETL-specific keys (publication, schema) from a libpq-style connection
/// string. The DuckDB postgres scanner forwards the conn string to libpq, which
/// rejects unknown keys with `invalid connection option "<key>"`.
fn strip_non_libpq_params(conn_str: &str) -> String {
    const STRIP_KEYS: &[&str] = &["publication", "schema"];

    let mut result = String::with_capacity(conn_str.len());
    let mut remaining = conn_str;

    while !remaining.is_empty() {
        let trimmed = remaining.trim_start();
        let leading_ws_len = remaining.len() - trimmed.len();
        remaining = trimmed;
        if remaining.is_empty() {
            break;
        }

        let eq_pos = match remaining.find('=') {
            Some(pos) => pos,
            None => {
                if !result.is_empty() && !result.ends_with(' ') {
                    result.push(' ');
                }
                result.push_str(remaining);
                break;
            }
        };

        let key = &remaining[..eq_pos];
        let after_eq = &remaining[eq_pos + 1..];

        let (value, rest) = if after_eq.starts_with('\'') {
            if let Some(end_quote) = after_eq[1..].find('\'') {
                (&after_eq[..end_quote + 2], &after_eq[end_quote + 2..])
            } else {
                (after_eq, "")
            }
        } else {
            match after_eq.find(' ') {
                Some(sp) => (&after_eq[..sp], &after_eq[sp..]),
                None => (after_eq, ""),
            }
        };

        let is_strip_key = STRIP_KEYS
            .iter()
            .any(|k| key.eq_ignore_ascii_case(k));

        if !is_strip_key {
            if !result.is_empty() && leading_ws_len == 0 && !result.ends_with(' ') {
                result.push(' ');
            } else if !result.is_empty() && leading_ws_len > 0 {
                result.push(' ');
            }
            result.push_str(key);
            result.push('=');
            result.push_str(value);
        }

        remaining = rest;
    }

    result.trim().to_string()
}

/// Extract all values from a named VARCHAR column across Arrow RecordBatches.
fn extract_string_column(batches: &[trex_pool_client::arrow_array::RecordBatch], column: &str) -> Vec<String> {
    use trex_pool_client::arrow_array::Array;
    use trex_pool_client::arrow_array::cast::AsArray;

    let mut result = Vec::new();
    for batch in batches {
        if let Some(col_idx) = batch.schema().index_of(column).ok() {
            let array = batch.column(col_idx).as_string::<i32>();
            for i in 0..array.len() {
                if !array.is_null(i) {
                    result.push(array.value(i).to_string());
                }
            }
        }
    }
    result
}

/// Extract a single i64 scalar from the first column of the first row.
fn extract_i64_scalar(batches: &[trex_pool_client::arrow_array::RecordBatch]) -> Option<i64> {
    let batch = batches.first()?;
    if batch.num_rows() == 0 || batch.num_columns() == 0 {
        return None;
    }
    let col = batch.column(0);
    // Try common integer/count types
    if let Some(arr) = col.as_any().downcast_ref::<trex_pool_client::arrow_array::Int64Array>() {
        return Some(arr.value(0));
    }
    if let Some(arr) = col.as_any().downcast_ref::<trex_pool_client::arrow_array::Int32Array>() {
        return Some(arr.value(0) as i64);
    }
    if let Some(arr) = col.as_any().downcast_ref::<trex_pool_client::arrow_array::UInt64Array>() {
        return Some(arr.value(0) as i64);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use trex_pool_client::arrow_array::{
        Int32Array, Int64Array, RecordBatch, StringArray, UInt64Array,
    };
    use trex_pool_client::arrow_schema::{DataType, Field, Schema};

    // --- strip_non_libpq_params ---

    #[test]
    fn strip_removes_publication_key() {
        let s = strip_non_libpq_params("host=h port=5432 publication=mypub dbname=d");
        assert!(!s.contains("publication"));
        assert!(s.contains("host=h"));
        assert!(s.contains("port=5432"));
        assert!(s.contains("dbname=d"));
    }

    #[test]
    fn strip_removes_schema_key() {
        let s = strip_non_libpq_params("host=h schema=public dbname=d");
        assert!(!s.contains("schema"));
        assert!(s.contains("host=h"));
        assert!(s.contains("dbname=d"));
    }

    #[test]
    fn strip_removes_both_keys() {
        let s = strip_non_libpq_params("host=h publication=p schema=s dbname=d");
        assert!(!s.contains("publication"));
        assert!(!s.contains("schema"));
    }

    #[test]
    fn strip_is_case_insensitive() {
        let s = strip_non_libpq_params("host=h PUBLICATION=p SCHEMA=s");
        assert!(!s.to_lowercase().contains("publication="));
        assert!(!s.to_lowercase().contains("schema="));
    }

    #[test]
    fn strip_preserves_quoted_values() {
        let s = strip_non_libpq_params("host=h password='se cret' publication=p");
        assert!(s.contains("password='se cret'"));
        assert!(!s.contains("publication"));
    }

    #[test]
    fn strip_no_change_when_nothing_to_strip() {
        let s = strip_non_libpq_params("host=h port=5432 dbname=d");
        assert!(s.contains("host=h"));
        assert!(s.contains("port=5432"));
        assert!(s.contains("dbname=d"));
    }

    #[test]
    fn strip_empty_input() {
        assert_eq!(strip_non_libpq_params(""), "");
    }

    // --- extract_string_column ---

    #[test]
    fn extract_string_column_basic() {
        let schema = Arc::new(Schema::new(vec![
            Field::new("name", DataType::Utf8, true),
            Field::new("other", DataType::Int32, true),
        ]));
        let names = StringArray::from(vec![Some("alice"), Some("bob"), None]);
        let others = Int32Array::from(vec![1, 2, 3]);
        let batch = RecordBatch::try_new(
            schema,
            vec![Arc::new(names), Arc::new(others)],
        )
        .unwrap();

        let got = extract_string_column(&[batch], "name");
        assert_eq!(got, vec!["alice".to_string(), "bob".to_string()]);
    }

    #[test]
    fn extract_string_column_missing_column_returns_empty() {
        let schema = Arc::new(Schema::new(vec![Field::new("x", DataType::Utf8, true)]));
        let xs = StringArray::from(vec![Some("a")]);
        let batch = RecordBatch::try_new(schema, vec![Arc::new(xs)]).unwrap();

        let got = extract_string_column(&[batch], "missing");
        assert!(got.is_empty());
    }

    #[test]
    fn extract_string_column_no_batches() {
        let got = extract_string_column(&[], "any");
        assert!(got.is_empty());
    }

    // --- extract_i64_scalar ---

    #[test]
    fn extract_i64_scalar_int64() {
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::Int64, false)]));
        let arr = Int64Array::from(vec![42]);
        let batch = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        assert_eq!(extract_i64_scalar(&[batch]), Some(42));
    }

    #[test]
    fn extract_i64_scalar_int32_widened() {
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::Int32, false)]));
        let arr = Int32Array::from(vec![7]);
        let batch = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        assert_eq!(extract_i64_scalar(&[batch]), Some(7));
    }

    #[test]
    fn extract_i64_scalar_uint64() {
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::UInt64, false)]));
        let arr = UInt64Array::from(vec![100]);
        let batch = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        assert_eq!(extract_i64_scalar(&[batch]), Some(100));
    }

    #[test]
    fn extract_i64_scalar_empty_batches_returns_none() {
        assert_eq!(extract_i64_scalar(&[]), None);
    }

    #[test]
    fn extract_i64_scalar_zero_rows_returns_none() {
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::Int64, false)]));
        let arr = Int64Array::from(Vec::<i64>::new());
        let batch = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        assert_eq!(extract_i64_scalar(&[batch]), None);
    }

    #[test]
    fn extract_i64_scalar_unsupported_type_returns_none() {
        let schema = Arc::new(Schema::new(vec![Field::new("c", DataType::Utf8, false)]));
        let arr = StringArray::from(vec!["nope"]);
        let batch = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        assert_eq!(extract_i64_scalar(&[batch]), None);
    }

    // --- parse_pipeline_params ---

    #[test]
    fn parse_params_extracts_all_fields() {
        let conn = "host=db.example.com port=6543 dbname=mydb user=alice password=secret publication=pub1 schema=myschema";
        let p = parse_pipeline_params(conn, &PipelineMode::CopyAndCdc).unwrap();
        assert_eq!(p.host, "db.example.com");
        assert_eq!(p.port, 6543);
        assert_eq!(p.dbname, "mydb");
        assert_eq!(p.username, "alice");
        assert!(p.password.is_some());
        assert_eq!(p.publication, "pub1");
        assert_eq!(p.schema_name, "myschema");
    }

    #[test]
    fn parse_params_defaults() {
        // host=h is required by extract_param ordering — anything else
        // omitted should fall back to documented defaults.
        let p = parse_pipeline_params(
            "host=h publication=p",
            &PipelineMode::CopyAndCdc,
        ).unwrap();
        assert_eq!(p.host, "h");
        assert_eq!(p.port, 5432);
        assert_eq!(p.dbname, "postgres");
        assert_eq!(p.username, "postgres");
        assert!(p.password.is_none());
        assert_eq!(p.publication, "p");
        assert_eq!(p.schema_name, "public");
    }

    #[test]
    fn parse_params_publication_required_for_cdc() {
        let err = parse_pipeline_params("host=h", &PipelineMode::CopyAndCdc);
        assert!(err.is_err());
        let err = parse_pipeline_params("host=h", &PipelineMode::CdcOnly);
        assert!(err.is_err());
    }

    #[test]
    fn parse_params_publication_optional_for_copy_only() {
        let p = parse_pipeline_params("host=h", &PipelineMode::CopyOnly).unwrap();
        assert_eq!(p.publication, "");
    }

    #[test]
    fn parse_params_invalid_port_fails() {
        let err = parse_pipeline_params(
            "host=h port=notanumber publication=p",
            &PipelineMode::CopyAndCdc,
        );
        assert!(err.is_err());
    }

    // --- build_attach_name ---

    #[test]
    fn attach_name_basic() {
        assert_eq!(build_attach_name("pipeline"), "__etl_pipeline");
    }

    #[test]
    fn attach_name_dashes_become_underscores() {
        assert_eq!(build_attach_name("my-pipe-line"), "__etl_my_pipe_line");
    }

    // --- build_attach_sql ---

    #[test]
    fn attach_sql_strips_etl_keys() {
        let sql = build_attach_sql(
            "host=h publication=p schema=s",
            "__etl_p",
        );
        assert!(!sql.contains("publication"));
        assert!(!sql.contains("schema="));
        assert!(sql.contains("host=h"));
        assert!(sql.contains("ATTACH IF NOT EXISTS"));
        assert!(sql.contains("AS \"__etl_p\""));
        assert!(sql.contains("(TYPE postgres, READ_ONLY)"));
    }

    #[test]
    fn attach_sql_escapes_single_quotes_in_conn() {
        // A password with a literal apostrophe must be doubled inside the SQL.
        let sql = build_attach_sql("host=h password=ab'cd", "__etl_p");
        assert!(sql.contains("ab''cd"));
    }

    // --- build_list_tables_sql ---

    #[test]
    fn list_tables_sql_basic() {
        let sql = build_list_tables_sql("__etl_p", "public");
        assert_eq!(
            sql,
            "SELECT table_name FROM \"__etl_p\".information_schema.tables WHERE table_schema = 'public'"
        );
    }

    #[test]
    fn list_tables_sql_escapes_schema_apostrophe() {
        let sql = build_list_tables_sql("__etl_p", "a'b");
        assert!(sql.contains("'a''b'"));
    }

    // --- build_copy_table_sql ---

    #[test]
    fn copy_table_sql_basic() {
        let sql = build_copy_table_sql("public", "users", "__etl_p");
        assert_eq!(
            sql,
            "CREATE TABLE IF NOT EXISTS \"public\".\"users\" AS SELECT * FROM \"__etl_p\".\"public\".\"users\";"
        );
    }

    #[test]
    fn copy_table_sql_escapes_identifier_quotes() {
        let sql = build_copy_table_sql("sch\"x", "ta\"b", "__etl_p");
        // schema/table get embedded twice — once on dest side, once on source.
        assert!(sql.contains("\"sch\"\"x\".\"ta\"\"b\""));
    }

    // --- build_count_table_sql ---

    #[test]
    fn count_table_sql_basic() {
        let sql = build_count_table_sql("public", "users");
        assert_eq!(sql, "SELECT COUNT(*) FROM \"public\".\"users\"");
    }

    #[test]
    fn count_table_sql_escapes_quotes() {
        let sql = build_count_table_sql("s\"c", "t\"b");
        assert_eq!(sql, "SELECT COUNT(*) FROM \"s\"\"c\".\"t\"\"b\"");
    }

    // --- build_detach_sql ---

    #[test]
    fn detach_sql_basic() {
        assert_eq!(build_detach_sql("__etl_p"), "DETACH \"__etl_p\"");
    }
}
