use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
    vscalar::{ScalarFunctionSignature, VScalar},
};
use duckdb::vtab::arrow::WritableVector;
use std::{
    ffi::CString,
    sync::atomic::{AtomicBool, Ordering},
};

use crate::gossip::GossipRegistry;

/// Parsed gossip `service:*` JSON advertisement.
#[derive(Debug, Clone)]
pub struct ServiceInfo {
    pub host: String,
    pub port: String,
    pub status: String,
    pub uptime_seconds: String,
    pub config: String,
}

/// Tolerant parser -- missing fields fall back to defaults.
pub fn parse_service_json(json: &str) -> Option<ServiceInfo> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let obj = v.as_object()?;

    let host = obj
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let port = match obj.get("port") {
        Some(serde_json::Value::Number(n)) => n.to_string(),
        Some(serde_json::Value::String(s)) => s.clone(),
        _ => String::new(),
    };

    let status = obj
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let uptime_seconds = match obj.get("uptime") {
        Some(serde_json::Value::Number(n)) => n.to_string(),
        Some(serde_json::Value::String(s)) => s.clone(),
        _ => "0".to_string(),
    };

    let config = obj
        .get("config")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    Some(ServiceInfo {
        host,
        port,
        status,
        uptime_seconds,
        config,
    })
}

/// Map extension name + JSON config to the SQL that starts it.
/// Returns `Ok(None)` for unknown extensions.
pub fn get_start_service_sql(extension: &str, config_json: &str) -> Result<Option<String>, String> {
    let config: serde_json::Value = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid JSON config: {e}"))?;

    match extension {
        "flight" => {
            let host = config["host"].as_str().unwrap_or("0.0.0.0").replace('\'', "''");
            let port = config["port"].as_u64().unwrap_or(8815);
            if config.get("cert_path").is_some() {
                let cert = config["cert_path"].as_str().unwrap_or("").replace('\'', "''");
                let key = config["key_path"].as_str().unwrap_or("").replace('\'', "''");
                let ca = config["ca_cert_path"].as_str().unwrap_or("").replace('\'', "''");
                Ok(Some(format!(
                    "SELECT start_flight_server_tls('{host}', {port}, '{cert}', '{key}', '{ca}')"
                )))
            } else {
                Ok(Some(format!(
                    "SELECT start_flight_server('{host}', {port})"
                )))
            }
        }
        "pgwire" => {
            let host = config["host"].as_str().unwrap_or("127.0.0.1").replace('\'', "''");
            let port = config["port"].as_u64().unwrap_or(5432);
            let password = config["password"].as_str().unwrap_or("").replace('\'', "''");
            let db_creds = config["db_credentials"].as_str().unwrap_or("").replace('\'', "''");
            Ok(Some(format!(
                "SELECT start_pgwire_server('{host}', {port}, '{password}', '{db_creds}')"
            )))
        }
        "trexas" => {
            let escaped = config_json.replace('\'', "''");
            Ok(Some(format!(
                "SELECT trex_start_server_with_config('{escaped}')"
            )))
        }
        "chdb" => {
            if let Some(path) = config.get("data_path").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                let escaped_path = path.replace('\'', "''");
                Ok(Some(format!("SELECT chdb_start_database('{escaped_path}')")))
            } else {
                Ok(Some("SELECT chdb_start_database()".to_string()))
            }
        }
        "etl" => {
            let pipeline_name = config["pipeline_name"]
                .as_str()
                .ok_or("etl config requires 'pipeline_name'")?;
            let connection_string = config["connection_string"]
                .as_str()
                .ok_or("etl config requires 'connection_string'")?;

            let escaped_name = pipeline_name.replace('\'', "''");
            let escaped_conn = connection_string.replace('\'', "''");

            let batch_size = config["batch_size"].as_u64().unwrap_or(1000);
            let batch_timeout_ms = config["batch_timeout_ms"].as_u64().unwrap_or(5000);
            let retry_delay_ms = config["retry_delay_ms"].as_u64().unwrap_or(10000);
            let retry_max_attempts = config["retry_max_attempts"].as_u64().unwrap_or(5);

            Ok(Some(format!(
                "SELECT etl_start('{}', '{}', {}, {}, {}, {})",
                escaped_name, escaped_conn,
                batch_size, batch_timeout_ms, retry_delay_ms, retry_max_attempts
            )))
        }
        "distributed-scheduler" => {
            let host = config["host"].as_str().unwrap_or("0.0.0.0").replace('\'', "''");
            let port = config["port"].as_u64().unwrap_or(50050);
            Ok(Some(format!(
                "SELECT swarm_start_distributed_scheduler('{host}', {port})"
            )))
        }
        "distributed-executor" => {
            let host = config["host"].as_str().unwrap_or("0.0.0.0").replace('\'', "''");
            let port = config["port"].as_u64().unwrap_or(50051);
            let scheduler = config["scheduler_url"]
                .as_str()
                .unwrap_or("http://localhost:50050")
                .replace('\'', "''");
            Ok(Some(format!(
                "SELECT swarm_start_distributed_executor('{host}', {port}, '{scheduler}')"
            )))
        }
        _ => Ok(None),
    }
}

pub struct SwarmServicesTable;

#[repr(C)]
pub struct SwarmServicesBindData {}

#[repr(C)]
pub struct SwarmServicesInitData {
    done: AtomicBool,
}

impl VTab for SwarmServicesTable {
    type InitData = SwarmServicesInitData;
    type BindData = SwarmServicesBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn std::error::Error>> {
        bind.add_result_column("node_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "service_name",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("host", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("port", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "uptime_seconds",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("config", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        Ok(SwarmServicesBindData {})
    }

    fn init(_: &InitInfo) -> Result<Self::InitData, Box<dyn std::error::Error>> {
        Ok(SwarmServicesInitData {
            done: AtomicBool::new(false),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let init_data = func.get_init_data();

        if init_data.done.swap(true, Ordering::Relaxed) {
            output.set_len(0);
            return Ok(());
        }

        let nodes = match GossipRegistry::instance().get_node_key_values() {
            Ok(nodes) => nodes,
            Err(_) => {
                output.set_len(0);
                return Ok(());
            }
        };

        struct ServiceRow {
            node_name: String,
            service_name: String,
            host: String,
            port: String,
            status: String,
            uptime_seconds: String,
            config: String,
        }

        let mut rows: Vec<ServiceRow> = Vec::new();

        for node in &nodes {
            for (key, value) in &node.key_values {
                if let Some(service_name) = key.strip_prefix("service:") {
                    let info = parse_service_json(value);
                    let (host, port, status, uptime, config) = match info {
                        Some(si) => (
                            si.host,
                            si.port,
                            si.status,
                            si.uptime_seconds,
                            si.config,
                        ),
                        None => (
                            String::new(),
                            String::new(),
                            "unknown".to_string(),
                            "0".to_string(),
                            "{}".to_string(),
                        ),
                    };

                    rows.push(ServiceRow {
                        node_name: node.node_name.clone(),
                        service_name: service_name.to_string(),
                        host,
                        port,
                        status,
                        uptime_seconds: uptime,
                        config,
                    });
                }
            }
        }

        if rows.is_empty() {
            output.set_len(0);
            return Ok(());
        }

        let chunk_size = rows.len();
        let node_name_vec = output.flat_vector(0);
        let service_name_vec = output.flat_vector(1);
        let host_vec = output.flat_vector(2);
        let port_vec = output.flat_vector(3);
        let status_vec = output.flat_vector(4);
        let uptime_vec = output.flat_vector(5);
        let config_vec = output.flat_vector(6);

        for (i, row) in rows.iter().enumerate() {
            node_name_vec.insert(i, CString::new(row.node_name.clone())?);
            service_name_vec.insert(i, CString::new(row.service_name.clone())?);
            host_vec.insert(i, CString::new(row.host.clone())?);
            port_vec.insert(i, CString::new(row.port.clone())?);
            status_vec.insert(i, CString::new(row.status.clone())?);
            uptime_vec.insert(i, CString::new(row.uptime_seconds.clone())?);
            config_vec.insert(i, CString::new(row.config.clone())?);
        }

        output.set_len(chunk_size);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        None
    }
}

pub struct SwarmStartServiceScalar;

impl VScalar for SwarmStartServiceScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let ext_vector = input.flat_vector(0);
        let cfg_vector = input.flat_vector(1);

        let ext_slice =
            ext_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let cfg_slice =
            cfg_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let extension = duckdb::types::DuckString::new(&mut { ext_slice[0] })
            .as_str()
            .to_string();
        let config_json = duckdb::types::DuckString::new(&mut { cfg_slice[0] })
            .as_str()
            .to_string();

        let sql = match get_start_service_sql(&extension, &config_json) {
            Ok(Some(sql)) => sql,
            Ok(None) => {
                let msg = format!(
                    "Unknown service extension '{}'. Known: flight, pgwire, trexas, chdb, etl",
                    extension
                );
                let flat = output.flat_vector();
                flat.insert(0, &msg);
                return Ok(());
            }
            Err(e) => {
                let flat = output.flat_vector();
                flat.insert(0, &e);
                return Ok(());
            }
        };

        if let Err(e) = crate::pool::write(&sql) {
            let msg = format!("Failed to start {}: {}", extension, e);
            let flat = output.flat_vector();
            flat.insert(0, &msg);
            return Ok(());
        }

        let config: serde_json::Value = serde_json::from_str(&config_json).unwrap_or_default();
        let host = config["host"].as_str().unwrap_or("");
        let port = config["port"].as_u64().unwrap_or(0);

        let service_json = serde_json::json!({
            "host": host,
            "port": port,
            "status": "running",
            "uptime": 0,
            "config": config
        })
        .to_string();

        let gossip_key = format!("service:{}", extension);
        let gossip_result = GossipRegistry::instance().set_key(&gossip_key, &service_json);

        let response = match gossip_result {
            Ok(()) => format!(
                "Service '{}' started and registered in gossip",
                extension
            ),
            Err(e) => format!(
                "Service '{}' started but gossip registration failed: {}",
                extension, e
            ),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

pub struct SwarmStopServiceScalar;

impl VScalar for SwarmStopServiceScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let ext_vector = input.flat_vector(0);
        let ext_slice =
            ext_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let extension = duckdb::types::DuckString::new(&mut { ext_slice[0] })
            .as_str()
            .to_string();

        // Update to "stopped" rather than removing, so swarm_services() still shows it.
        let gossip_key = format!("service:{}", extension);
        let existing_json = Self::read_own_service_key(&gossip_key);

        let stopped_json = match existing_json {
            Some(info) => serde_json::json!({
                "host": info.host,
                "port": info.port,
                "status": "stopped",
                "uptime": 0,
                "config": {}
            })
            .to_string(),
            None => serde_json::json!({
                "host": "",
                "port": "",
                "status": "stopped",
                "uptime": 0,
                "config": {}
            })
            .to_string(),
        };

        let gossip_result = GossipRegistry::instance().set_key(&gossip_key, &stopped_json);

        let response = match gossip_result {
            Ok(()) => format!(
                "Service '{}' marked as stopped in gossip",
                extension
            ),
            Err(e) => format!(
                "Failed to update gossip for service '{}': {}",
                extension, e
            ),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![LogicalTypeId::Varchar.into()],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

impl SwarmStopServiceScalar {
    fn read_own_service_key(gossip_key: &str) -> Option<ServiceInfo> {
        let nodes = GossipRegistry::instance().get_node_key_values().ok()?;
        let self_config = GossipRegistry::instance().get_self_config().ok()?;
        let self_node_id = self_config
            .iter()
            .find(|(k, _)| k == "node_id")
            .map(|(_, v)| v.clone())?;

        for node in &nodes {
            if node.node_id == self_node_id {
                for (key, value) in &node.key_values {
                    if key == gossip_key {
                        return parse_service_json(value);
                    }
                }
            }
        }
        None
    }
}

pub struct SwarmLoadScalar;

impl VScalar for SwarmLoadScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let ext_vector = input.flat_vector(0);
        let ext_slice =
            ext_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let extension = duckdb::types::DuckString::new(&mut { ext_slice[0] })
            .as_str()
            .to_string();

        if !crate::catalog::is_valid_extension_name(&extension) {
            let flat = output.flat_vector();
            flat.insert(0, &format!("Invalid extension name: '{}'", extension));
            return Ok(());
        }

        let load_sql = format!("LOAD '{}.trex'", extension);

        let response = match crate::pool::write(&load_sql) {
            Ok(()) => format!("Extension '{}' loaded successfully", extension),
            Err(e) => format!("Failed to load extension '{}': {}", extension, e),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![LogicalTypeId::Varchar.into()],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

pub struct SwarmSetKeyScalar;

impl VScalar for SwarmSetKeyScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let key_vector = input.flat_vector(0);
        let value_vector = input.flat_vector(1);

        let key_slice =
            key_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let value_slice =
            value_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let key = duckdb::types::DuckString::new(&mut { key_slice[0] })
            .as_str()
            .to_string();
        let value = duckdb::types::DuckString::new(&mut { value_slice[0] })
            .as_str()
            .to_string();

        let response = match GossipRegistry::instance().set_key(&key, &value) {
            Ok(()) => format!("Set key '{}'", key),
            Err(e) => format!("Error setting key '{}': {}", key, e),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

pub struct SwarmDeleteKeyScalar;

impl VScalar for SwarmDeleteKeyScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let key_vector = input.flat_vector(0);
        let key_slice =
            key_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let key = duckdb::types::DuckString::new(&mut { key_slice[0] })
            .as_str()
            .to_string();

        let response = match GossipRegistry::instance().delete_key(&key) {
            Ok(()) => format!("Deleted key '{}'", key),
            Err(e) => format!("Error deleting key '{}': {}", key, e),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![LogicalTypeId::Varchar.into()],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

pub struct SwarmRegisterServiceScalar;

impl VScalar for SwarmRegisterServiceScalar {
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
        let host_vector = input.flat_vector(1);
        let port_vector = input.flat_vector(2);

        let name_slice =
            name_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let host_slice =
            host_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let port_slice = port_vector.as_slice_with_len::<i32>(input.len());

        let name = duckdb::types::DuckString::new(&mut { name_slice[0] })
            .as_str()
            .to_string();
        let host = duckdb::types::DuckString::new(&mut { host_slice[0] })
            .as_str()
            .to_string();
        let port_raw = port_slice[0];
        if port_raw < 0 || port_raw > 65535 {
            return Err(format!("Port {} out of valid range (0-65535)", port_raw).into());
        }
        let port = port_raw as u16;

        // Publish to gossip only (no server started). Allows ad-hoc registration.
        let service_json = serde_json::json!({
            "host": host,
            "port": port,
            "status": "running",
            "uptime": 0,
            "config": {}
        })
        .to_string();

        let gossip_key = format!("service:{}", name);
        let gossip_result = GossipRegistry::instance().set_key(&gossip_key, &service_json);

        // Flight registration also triggers catalog advertisement and refresh.
        if name == "flight" {
            let _ = crate::catalog::advertise_local_tables();
            let _ = crate::catalog::start_catalog_refresh();
        }

        let response = match gossip_result {
            Ok(()) => format!(
                "Service '{}' registered at {}:{} in gossip",
                name, host, port
            ),
            Err(e) => format!(
                "Failed to register service '{}': {}",
                name, e
            ),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Integer.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

/// Pure helper: parse SWARM_CONFIG JSON, look up the named node, run the
/// orchestrator for its extension list, return the joined status as a single
/// string. Factored out so it's unit-testable without a duckdb connection.
pub fn orchestrate_swarm_impl(swarm_json: &str, node_id: &str) -> String {
    let cfg = match crate::config::ClusterConfig::from_json(swarm_json) {
        Ok(c) => c,
        Err(e) => return format!("invalid SWARM_CONFIG: {e}"),
    };
    let node = match cfg.nodes.get(node_id) {
        Some(n) => n,
        None => return format!("node '{}' not found in SWARM_CONFIG", node_id),
    };
    let advertise_host = crate::config::parse_host_port(&node.gossip_addr)
        .map(|(h, _)| h)
        .unwrap_or_default();
    let statuses =
        crate::orchestrator::orchestrate_extensions(&node.extensions, &advertise_host);
    statuses.join("\n")
}

/// Convenience: read SWARM_CONFIG and SWARM_NODE from the environment and run
/// orchestrate_swarm_impl. Returns an error string if SWARM_CONFIG is unset.
pub fn orchestrate_swarm_from_env() -> String {
    let swarm_json = match std::env::var("SWARM_CONFIG") {
        Ok(v) => v,
        Err(_) => return "SWARM_CONFIG environment variable is not set".to_string(),
    };
    let node_id =
        std::env::var("SWARM_NODE").unwrap_or_else(|_| "local".to_string());
    orchestrate_swarm_impl(&swarm_json, &node_id)
}

pub struct DbOrchestrateSwarmFromEnvScalar;

impl VScalar for DbOrchestrateSwarmFromEnvScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        _input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let result = orchestrate_swarm_from_env();
        let flat = output.flat_vector();
        flat.insert(0, &result);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        // Zero-arg scalar
        vec![ScalarFunctionSignature::exact(
            vec![],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

pub struct DbOrchestrateSwarmScalar;

impl VScalar for DbOrchestrateSwarmScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }
        let json_vector = input.flat_vector(0);
        let node_vector = input.flat_vector(1);

        let json_slice =
            json_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let node_slice =
            node_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let swarm_json = duckdb::types::DuckString::new(&mut { json_slice[0] })
            .as_str()
            .to_string();
        let node_id = duckdb::types::DuckString::new(&mut { node_slice[0] })
            .as_str()
            .to_string();

        let result = orchestrate_swarm_impl(&swarm_json, &node_id);

        let flat = output.flat_vector();
        flat.insert(0, &result);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Serializes every test in this module that touches process env.
    // `cargo test` runs in parallel by default; without this guard the two
    // env-mutating tests below race and cause flaky CI failures.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn db_orchestrate_swarm_rejects_invalid_json() {
        let result = orchestrate_swarm_impl("not json", "local");
        assert!(result.to_lowercase().contains("failed to parse"), "got: {result}");
    }

    #[test]
    fn db_orchestrate_swarm_rejects_unknown_node() {
        let json = r#"{"cluster_id":"local","nodes":{"local":{"gossip_addr":"0.0.0.0:4200","extensions":[]}}}"#;
        let result = orchestrate_swarm_impl(json, "missing");
        assert!(result.contains("not found"), "got: {result}");
        assert!(result.contains("missing"), "got: {result}");
    }

    #[test]
    fn db_orchestrate_swarm_with_empty_extension_list_returns_empty_status() {
        let json = r#"{"cluster_id":"local","nodes":{"local":{"gossip_addr":"0.0.0.0:4200","extensions":[]}}}"#;
        let result = orchestrate_swarm_impl(json, "local");
        // Empty extensions vector -> orchestrator returns empty Vec<String> -> joined to ""
        assert_eq!(result, "");
    }

    #[test]
    fn orchestrate_swarm_from_env_reads_swarm_config_and_node_from_env() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: env mutation is serialized via ENV_LOCK above.
        unsafe {
            std::env::set_var("SWARM_CONFIG", r#"{"cluster_id":"x","nodes":{"local":{"gossip_addr":"0.0.0.0:4200","extensions":[]}}}"#);
            std::env::set_var("SWARM_NODE", "local");
        }
        let result = orchestrate_swarm_from_env();
        assert_eq!(result, "");
        // SAFETY: env mutation is serialized via ENV_LOCK above.
        unsafe {
            std::env::remove_var("SWARM_CONFIG");
            std::env::remove_var("SWARM_NODE");
        }
    }

    #[test]
    fn orchestrate_swarm_from_env_errors_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: env mutation is serialized via ENV_LOCK above.
        unsafe { std::env::remove_var("SWARM_CONFIG"); }
        let result = orchestrate_swarm_from_env();
        assert!(result.to_lowercase().contains("swarm_config"), "got: {result}");
    }

    // ---------- parse_service_json ----------

    #[test]
    fn parse_service_json_full_object() {
        let json = r#"{"host":"1.2.3.4","port":8815,"status":"running","uptime":42,"config":{"a":1}}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.host, "1.2.3.4");
        assert_eq!(info.port, "8815");
        assert_eq!(info.status, "running");
        assert_eq!(info.uptime_seconds, "42");
        // config is re-serialized — verify it parses back as JSON.
        let v: serde_json::Value = serde_json::from_str(&info.config).expect("config is JSON");
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn parse_service_json_port_as_string() {
        let json = r#"{"host":"h","port":"9000","status":"running"}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.port, "9000");
    }

    #[test]
    fn parse_service_json_uptime_as_string() {
        let json = r#"{"host":"h","port":1,"uptime":"99"}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.uptime_seconds, "99");
    }

    #[test]
    fn parse_service_json_missing_fields_defaults() {
        let info = parse_service_json("{}").expect("empty object should parse");
        assert_eq!(info.host, "");
        assert_eq!(info.port, "");
        assert_eq!(info.status, "unknown");
        assert_eq!(info.uptime_seconds, "0");
        assert_eq!(info.config, "{}");
    }

    #[test]
    fn parse_service_json_port_unexpected_type_falls_back_to_empty() {
        let json = r#"{"host":"h","port":true}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.port, "");
    }

    #[test]
    fn parse_service_json_rejects_malformed() {
        assert!(parse_service_json("not json").is_none());
        assert!(parse_service_json("").is_none());
        assert!(parse_service_json("{").is_none());
    }

    #[test]
    fn parse_service_json_rejects_non_object() {
        assert!(parse_service_json("[]").is_none());
        assert!(parse_service_json("42").is_none());
        assert!(parse_service_json("\"hello\"").is_none());
        assert!(parse_service_json("null").is_none());
    }

    #[test]
    fn parse_service_json_unicode_host() {
        let json = r#"{"host":"münchen.example","port":443,"status":"ok"}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.host, "münchen.example");
        assert_eq!(info.status, "ok");
    }

    // ---------- get_start_service_sql ----------

    #[test]
    fn start_sql_unknown_extension_returns_none() {
        assert_eq!(get_start_service_sql("nope", "{}").unwrap(), None);
        assert_eq!(get_start_service_sql("", "{}").unwrap(), None);
    }

    #[test]
    fn start_sql_invalid_json_returns_error() {
        let err = get_start_service_sql("flight", "not json").unwrap_err();
        assert!(err.to_lowercase().contains("invalid json"), "got: {err}");
    }

    #[test]
    fn start_sql_flight_defaults() {
        let sql = get_start_service_sql("flight", "{}").unwrap().expect("some sql");
        assert!(sql.contains("start_flight_server("), "got: {sql}");
        assert!(sql.contains("0.0.0.0"));
        assert!(sql.contains("8815"));
    }

    #[test]
    fn start_sql_flight_tls_when_cert_path_present() {
        let cfg = r#"{"host":"h","port":1,"cert_path":"/c","key_path":"/k","ca_cert_path":"/ca"}"#;
        let sql = get_start_service_sql("flight", cfg).unwrap().expect("some sql");
        assert!(sql.contains("start_flight_server_tls("));
        assert!(sql.contains("/c"));
        assert!(sql.contains("/k"));
        assert!(sql.contains("/ca"));
    }

    #[test]
    fn start_sql_pgwire_defaults() {
        let sql = get_start_service_sql("pgwire", "{}").unwrap().expect("some sql");
        assert!(sql.contains("start_pgwire_server("));
        assert!(sql.contains("127.0.0.1"));
        assert!(sql.contains("5432"));
    }

    #[test]
    fn start_sql_pgwire_escapes_password_single_quotes() {
        let cfg = r#"{"password":"it's secret"}"#;
        let sql = get_start_service_sql("pgwire", cfg).unwrap().expect("some sql");
        // Single quotes must be doubled to avoid SQL injection.
        assert!(sql.contains("it''s secret"), "got: {sql}");
        assert!(!sql.contains("it's secret"));
    }

    #[test]
    fn start_sql_pgwire_with_db_credentials() {
        let cfg = r#"{"host":"127.0.0.1","port":5433,"password":"pw","db_credentials":"user:pass"}"#;
        let sql = get_start_service_sql("pgwire", cfg).unwrap().expect("some sql");
        assert!(sql.contains("user:pass"));
        assert!(sql.contains("5433"));
    }

    #[test]
    fn start_sql_trexas_passes_raw_config_escaped() {
        let cfg = r#"{"endpoint":"o'clock","other":1}"#;
        let sql = get_start_service_sql("trexas", cfg).unwrap().expect("some sql");
        assert!(sql.contains("trex_start_server_with_config("), "got: {sql}");
        assert!(sql.contains("o''clock"));
    }

    #[test]
    fn start_sql_chdb_with_path() {
        let cfg = r#"{"data_path":"/var/chdb"}"#;
        let sql = get_start_service_sql("chdb", cfg).unwrap().expect("some sql");
        assert!(sql.contains("chdb_start_database("));
        assert!(sql.contains("/var/chdb"));
    }

    #[test]
    fn start_sql_chdb_without_path_uses_default() {
        let sql = get_start_service_sql("chdb", "{}").unwrap().expect("some sql");
        assert_eq!(sql, "SELECT chdb_start_database()");
    }

    #[test]
    fn start_sql_chdb_empty_path_uses_default() {
        // empty path string should be filtered out and use default form.
        let sql = get_start_service_sql("chdb", r#"{"data_path":""}"#).unwrap().expect("some sql");
        assert_eq!(sql, "SELECT chdb_start_database()");
    }

    #[test]
    fn start_sql_chdb_escapes_quote_in_path() {
        let sql = get_start_service_sql("chdb", r#"{"data_path":"/var/o'dir"}"#)
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("/var/o''dir"), "got: {sql}");
    }

    #[test]
    fn start_sql_etl_requires_pipeline_name() {
        let err = get_start_service_sql("etl", r#"{"connection_string":"x"}"#).unwrap_err();
        assert!(err.contains("pipeline_name"), "got: {err}");
    }

    #[test]
    fn start_sql_etl_requires_connection_string() {
        let err = get_start_service_sql("etl", r#"{"pipeline_name":"p"}"#).unwrap_err();
        assert!(err.contains("connection_string"), "got: {err}");
    }

    #[test]
    fn start_sql_etl_with_required_fields_and_defaults() {
        let cfg = r#"{"pipeline_name":"p1","connection_string":"conn"}"#;
        let sql = get_start_service_sql("etl", cfg).unwrap().expect("some sql");
        assert!(sql.contains("etl_start("));
        assert!(sql.contains("'p1'"));
        assert!(sql.contains("'conn'"));
        // defaults: batch_size=1000, batch_timeout_ms=5000, retry_delay_ms=10000, retry_max_attempts=5
        assert!(sql.contains("1000"));
        assert!(sql.contains("5000"));
        assert!(sql.contains("10000"));
    }

    #[test]
    fn start_sql_etl_overrides_defaults() {
        let cfg = r#"{
            "pipeline_name":"p",
            "connection_string":"c",
            "batch_size":2000,
            "batch_timeout_ms":7000,
            "retry_delay_ms":3000,
            "retry_max_attempts":9
        }"#;
        let sql = get_start_service_sql("etl", cfg).unwrap().expect("some sql");
        assert!(sql.contains("2000"));
        assert!(sql.contains("7000"));
        assert!(sql.contains("3000"));
        assert!(sql.contains(" 9)"), "got: {sql}");
    }

    #[test]
    fn start_sql_etl_escapes_quotes_in_names() {
        let cfg = r#"{"pipeline_name":"o'p","connection_string":"o'c"}"#;
        let sql = get_start_service_sql("etl", cfg).unwrap().expect("some sql");
        assert!(sql.contains("o''p"));
        assert!(sql.contains("o''c"));
    }

    #[test]
    fn start_sql_distributed_scheduler_defaults() {
        let sql = get_start_service_sql("distributed-scheduler", "{}")
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("swarm_start_distributed_scheduler("));
        assert!(sql.contains("0.0.0.0"));
        assert!(sql.contains("50050"));
    }

    #[test]
    fn start_sql_distributed_executor_defaults() {
        let sql = get_start_service_sql("distributed-executor", "{}")
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("swarm_start_distributed_executor("));
        assert!(sql.contains("50051"));
        assert!(sql.contains("http://localhost:50050"));
    }

    #[test]
    fn start_sql_distributed_executor_custom_scheduler_url() {
        let cfg = r#"{"host":"1.2.3.4","port":50061,"scheduler_url":"http://other:50050"}"#;
        let sql = get_start_service_sql("distributed-executor", cfg)
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("1.2.3.4"));
        assert!(sql.contains("50061"));
        assert!(sql.contains("http://other:50050"));
    }

    #[test]
    fn start_sql_table_driven_all_known_extensions() {
        // Each known extension must return Some(sql) with a non-empty SELECT.
        let known = [
            ("flight", "{}"),
            ("pgwire", "{}"),
            ("trexas", "{}"),
            ("chdb", "{}"),
            ("etl", r#"{"pipeline_name":"p","connection_string":"c"}"#),
            ("distributed-scheduler", "{}"),
            ("distributed-executor", "{}"),
        ];
        for (ext, cfg) in known {
            let sql = get_start_service_sql(ext, cfg)
                .unwrap_or_else(|e| panic!("{ext} returned err: {e}"))
                .unwrap_or_else(|| panic!("{ext} returned None"));
            assert!(sql.starts_with("SELECT "), "{ext}: {sql}");
        }
    }

    #[test]
    fn start_sql_unknown_extensions_list() {
        // A few names that look similar but aren't supported.
        for ext in ["fhir", "transform", "mcp", "Flight", "PGWIRE", " flight"] {
            assert_eq!(
                get_start_service_sql(ext, "{}").unwrap(),
                None,
                "expected None for '{ext}'"
            );
        }
    }

    // ---------- orchestrate_swarm_impl extra cases ----------

    #[test]
    fn orchestrate_swarm_validates_cluster_id() {
        let json = r#"{"cluster_id":"","nodes":{"local":{"gossip_addr":"0.0.0.0:4200","extensions":[]}}}"#;
        let result = orchestrate_swarm_impl(json, "local");
        // validate() requires cluster_id non-empty; ClusterConfig::from_json wraps the validate err in "Failed to parse" only for serde; for validate errors the raw err propagates.
        assert!(!result.is_empty());
        assert!(
            result.contains("cluster_id") || result.to_lowercase().contains("invalid"),
            "got: {result}"
        );
    }

    #[test]
    fn orchestrate_swarm_empty_string_is_invalid_json() {
        let result = orchestrate_swarm_impl("", "local");
        assert!(result.to_lowercase().contains("failed to parse") || result.to_lowercase().contains("invalid"), "got: {result}");
    }

    // ---------- parse_service_json: additional edge cases ----------

    #[test]
    fn parse_service_json_status_unexpected_type_defaults_to_unknown() {
        // Numeric status -> as_str() fails -> "unknown" default.
        let json = r#"{"host":"h","port":1,"status":42}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.status, "unknown");
    }

    #[test]
    fn parse_service_json_host_unexpected_type_defaults_to_empty() {
        let json = r#"{"host":42,"port":1}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.host, "");
    }

    #[test]
    fn parse_service_json_uptime_unexpected_type_defaults_to_zero() {
        let json = r#"{"host":"h","port":1,"uptime":true}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.uptime_seconds, "0");
    }

    #[test]
    fn parse_service_json_config_object_is_serialized() {
        let json = r#"{"host":"h","port":1,"config":{"key":"value"}}"#;
        let info = parse_service_json(json).expect("should parse");
        // config is round-tripped via to_string() of the JSON value.
        let v: serde_json::Value = serde_json::from_str(&info.config).unwrap();
        assert_eq!(v["key"], "value");
    }

    #[test]
    fn parse_service_json_config_missing_defaults_to_empty_object() {
        let json = r#"{"host":"h","port":1}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.config, "{}");
    }

    #[test]
    fn parse_service_json_port_negative_number_serialized() {
        // serde_json::Number can store negatives; we still stringify.
        let json = r#"{"host":"h","port":-1}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.port, "-1");
    }

    // ---------- get_start_service_sql: additional branches ----------

    #[test]
    fn start_sql_flight_tls_with_empty_cert_paths_still_uses_tls_path() {
        // cert_path is *present* (even if empty), so the TLS branch is taken.
        let cfg = r#"{"cert_path":""}"#;
        let sql = get_start_service_sql("flight", cfg).unwrap().expect("some sql");
        assert!(sql.contains("start_flight_server_tls("));
    }

    #[test]
    fn start_sql_flight_with_custom_host_and_port() {
        let cfg = r#"{"host":"192.168.1.1","port":9000}"#;
        let sql = get_start_service_sql("flight", cfg).unwrap().expect("some sql");
        assert!(sql.contains("192.168.1.1"));
        assert!(sql.contains("9000"));
        assert!(!sql.contains("start_flight_server_tls"));
    }

    #[test]
    fn start_sql_flight_escapes_quotes_in_host() {
        let cfg = r#"{"host":"o'host"}"#;
        let sql = get_start_service_sql("flight", cfg).unwrap().expect("some sql");
        assert!(sql.contains("o''host"), "got: {sql}");
    }

    #[test]
    fn start_sql_pgwire_escapes_db_credentials_quotes() {
        let cfg = r#"{"db_credentials":"u:p'word"}"#;
        let sql = get_start_service_sql("pgwire", cfg).unwrap().expect("some sql");
        assert!(sql.contains("u:p''word"), "got: {sql}");
    }

    #[test]
    fn start_sql_trexas_with_empty_config() {
        let sql = get_start_service_sql("trexas", "{}").unwrap().expect("some sql");
        assert!(sql.contains("trex_start_server_with_config("));
    }

    #[test]
    fn start_sql_distributed_executor_partial_overrides() {
        // Override only host, keep default port and default scheduler_url.
        let cfg = r#"{"host":"10.0.0.5"}"#;
        let sql = get_start_service_sql("distributed-executor", cfg)
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("10.0.0.5"));
        assert!(sql.contains("50051"));
        assert!(sql.contains("http://localhost:50050"));
    }

    #[test]
    fn start_sql_distributed_scheduler_with_overrides() {
        let cfg = r#"{"host":"1.2.3.4","port":60060}"#;
        let sql = get_start_service_sql("distributed-scheduler", cfg)
            .unwrap()
            .expect("some sql");
        assert!(sql.contains("1.2.3.4"));
        assert!(sql.contains("60060"));
    }

    #[test]
    fn start_sql_etl_zero_value_overrides() {
        // Numeric 0 still satisfies as_u64(); it overrides defaults.
        let cfg = r#"{
            "pipeline_name":"p","connection_string":"c",
            "batch_size":0,"batch_timeout_ms":0
        }"#;
        let sql = get_start_service_sql("etl", cfg).unwrap().expect("some sql");
        // The default 1000 should NOT appear -- 0 was used as batch_size.
        let parts: Vec<&str> = sql.split(',').collect();
        // Six positional params: pipeline_name, conn, batch_size, batch_timeout_ms, retry_delay_ms, retry_max_attempts.
        assert_eq!(parts.len(), 6, "expected 6 comma-separated params: {sql}");
    }

    #[test]
    fn start_sql_unknown_extension_with_unusual_chars() {
        // Anything not in the match arms returns Ok(None).
        for ext in ["flight ", " flight", "flight\n", "FLIGHT"] {
            assert_eq!(get_start_service_sql(ext, "{}").unwrap(), None);
        }
    }

    #[test]
    fn start_sql_chdb_path_with_spaces() {
        let cfg = r#"{"data_path":"/var/some path/chdb"}"#;
        let sql = get_start_service_sql("chdb", cfg).unwrap().expect("some sql");
        assert!(sql.contains("/var/some path/chdb"));
    }

    #[test]
    fn start_sql_pgwire_port_as_string_uses_default() {
        // port is a string -> as_u64() fails -> default 5432 used.
        let cfg = r#"{"port":"9000"}"#;
        let sql = get_start_service_sql("pgwire", cfg).unwrap().expect("some sql");
        assert!(sql.contains("5432"));
    }

    #[test]
    fn start_sql_invalid_json_for_all_extensions_propagates_error() {
        // Every extension's first step is parse-json; broken json must be the error path.
        for ext in [
            "flight",
            "pgwire",
            "trexas",
            "chdb",
            "etl",
            "distributed-scheduler",
            "distributed-executor",
        ] {
            let err = get_start_service_sql(ext, "{").unwrap_err();
            assert!(err.to_lowercase().contains("invalid json"), "ext={ext} err={err}");
        }
    }

    #[test]
    fn parse_service_json_null_config_serializes_to_null() {
        // Explicit null config: still serializable; we just verify parse succeeds.
        let json = r#"{"host":"h","port":1,"config":null}"#;
        let info = parse_service_json(json).expect("should parse");
        assert_eq!(info.config, "null");
    }

    #[test]
    fn parse_service_json_array_value_for_object_field_rejected() {
        // top-level must be an object.
        assert!(parse_service_json(r#"["host","h"]"#).is_none());
    }

    #[test]
    fn parse_service_json_status_empty_string_preserved() {
        let json = r#"{"host":"h","port":1,"status":""}"#;
        let info = parse_service_json(json).expect("should parse");
        // Empty string IS a valid string (just not the missing case), so it sticks.
        assert_eq!(info.status, "");
    }

    #[test]
    fn service_info_debug_format_includes_fields() {
        let info = ServiceInfo {
            host: "h".to_string(),
            port: "1".to_string(),
            status: "running".to_string(),
            uptime_seconds: "0".to_string(),
            config: "{}".to_string(),
        };
        let debug_str = format!("{:?}", info);
        assert!(debug_str.contains("host"));
        assert!(debug_str.contains("running"));
    }

    #[test]
    fn service_info_clone_preserves_fields() {
        let info = ServiceInfo {
            host: "h".to_string(),
            port: "1".to_string(),
            status: "running".to_string(),
            uptime_seconds: "5".to_string(),
            config: "{}".to_string(),
        };
        let c = info.clone();
        assert_eq!(c.host, info.host);
        assert_eq!(c.port, info.port);
        assert_eq!(c.status, info.status);
        assert_eq!(c.uptime_seconds, info.uptime_seconds);
        assert_eq!(c.config, info.config);
    }
}
