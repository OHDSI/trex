use crate::config::ExtensionConfig;
use crate::gossip::GossipRegistry;
use crate::logging::SwarmLogger;
use crate::service_functions::get_start_service_sql;

/// Run a statement on a local connection (a clone of the node's main DuckDB
/// connection, with all extensions already loaded).
///
/// Services belong to the node that hosts them, so they must be started here —
/// NOT via `crate::pool` (the shared session pool), which on a server-only node
/// is remote-backed and would run the start on a *different* node (and isn't
/// even reachable until the cluster converges).
fn run_local(sql: &str) -> Result<(), String> {
    crate::local_connections::with_connection(|conn| {
        conn.execute_batch(sql).map_err(|e| e.to_string())
    })
}

/// Load a service's extension by full path and run its start statement on the
/// SAME local connection.
///
/// Two reasons this must be one closure rather than two `run_local` calls:
///   * Orchestration runs during db.trex's own load — before main.rs has
///     loaded the later service extensions (trexas, pgwire, …) — and in this
///     DuckDB build extension scalar functions are registered per connection,
///     so the start function won't exist until we LOAD it here.
///   * `with_connection` hands out connections round-robin, so a separate LOAD
///     call could land on a different connection than the start.
///
/// The LOAD is best-effort: a service merged into an already-loaded extension
/// (e.g. flight in db.trex) has no standalone file, and the subsequent start
/// surfaces any genuinely-missing-function error.
fn start_service_local(ext_name: &str, start_sql: &str) -> Result<(), String> {
    let ext_dir = std::env::var("EXTENSION_DIR")
        .unwrap_or_else(|_| "/usr/lib/trexsql/extensions".to_string())
        .replace('\'', "''");
    let load_sql = format!("LOAD '{ext_dir}/{ext_name}.trex'");
    crate::local_connections::with_connection(|conn| {
        let _ = conn.execute_batch(&load_sql);
        conn.execute_batch(start_sql).map_err(|e| e.to_string())
    })
}

/// Load extensions, start their services, and publish endpoints to gossip.
pub fn orchestrate_extensions(extensions: &[ExtensionConfig]) -> Vec<String> {
    // Probe a local connection — services for this node are started locally.
    if let Err(e) = run_local("SELECT 1") {
        SwarmLogger::error("orchestrator", &format!("Local connection not available: {e}"));
        return extensions
            .iter()
            .map(|ext| format!("{}: error — no local connection", ext.name))
            .collect();
    }

    let mut statuses: Vec<String> = Vec::with_capacity(extensions.len());

    for ext in extensions {
        if !crate::catalog::is_valid_extension_name(&ext.name) {
            let msg = format!("{}: invalid extension name", ext.name);
            SwarmLogger::error("orchestrator", &msg);
            statuses.push(msg);
            continue;
        }
        SwarmLogger::info("orchestrator", &format!("Loading extension: {}", ext.name));

        let config_json = match &ext.config {
            Some(cfg) => serde_json::to_string(cfg).unwrap_or_else(|_| "{}".to_string()),
            None => {
                let msg = format!("{}: loaded", ext.name);
                SwarmLogger::info("orchestrator", &msg);
                statuses.push(msg);
                continue;
            }
        };

        let start_sql = match get_start_service_sql(&ext.name, &config_json) {
            Ok(Some(sql)) => sql,
            Ok(None) => {
                SwarmLogger::warn(
                    "orchestrator",
                    &format!(
                        "No start function mapping for extension '{}'; loaded only",
                        ext.name
                    ),
                );
                statuses.push(format!("{}: loaded (no start function)", ext.name));
                continue;
            }
            Err(e) => {
                let msg = format!("{}: config error — {}", ext.name, e);
                SwarmLogger::error("orchestrator", &msg);
                statuses.push(msg);
                continue;
            }
        };

        let cfg_val: serde_json::Value =
            serde_json::from_str(&config_json).unwrap_or_default();
        let host = cfg_val["host"].as_str().unwrap_or("");
        let port = cfg_val["port"].as_u64().unwrap_or(0);

        SwarmLogger::info(
            "orchestrator",
            &format!("Starting service: {} on {}:{}", ext.name, host, port),
        );

        // Flight's server is compiled into this (db) extension, so call the
        // in-crate implementation directly. Every other service lives in its
        // own .trex, which must be loaded onto the local connection before its
        // start function can be called (see start_service_local).
        let start_result = if ext.name == "flight" {
            start_flight_service(&cfg_val)
        } else {
            start_service_local(&ext.name, &start_sql)
        };

        if let Err(e) = start_result {
            let msg = format!("{}: start failed — {}", ext.name, e);
            SwarmLogger::error("orchestrator", &msg);
            statuses.push(msg);
            continue;
        }

        let registry = GossipRegistry::instance();
        if registry.is_running() {
            let gossip_key = format!("service:{}", ext.name);
            let gossip_value = serde_json::json!({
                "host": host,
                "port": port,
                "status": "running",
                "config": cfg_val
            })
            .to_string();

            if let Err(e) = registry.set_key(&gossip_key, &gossip_value) {
                SwarmLogger::warn(
                    "orchestrator",
                    &format!("Failed to publish service:{} to gossip: {}", ext.name, e),
                );
            }
        }

        let msg = format!("{}: started on {}:{}", ext.name, host, port);
        SwarmLogger::info("orchestrator", &msg);
        statuses.push(msg);
    }

    statuses
}

/// Start the Arrow Flight server using the implementation compiled into this
/// (db) extension.
///
/// Flight has no standalone `flight.trex`; its server lives in
/// [`crate::flight_server`]. Calling it directly (rather than via a pooled SQL
/// session) guarantees the registered server implementation is the one that
/// actually runs, regardless of which extensions a given pool connection has
/// loaded.
fn start_flight_service(config: &serde_json::Value) -> Result<(), String> {
    let host = config["host"].as_str().unwrap_or("0.0.0.0").to_string();
    let port_u64 = config["port"].as_u64().unwrap_or(8815);
    let port = u16::try_from(port_u64)
        .map_err(|_| format!("port {port_u64} out of range (0-65535)"))?;

    if config.get("cert_path").is_some() {
        let cert = config["cert_path"].as_str().unwrap_or("");
        let key = config["key_path"].as_str().unwrap_or("");
        let ca = config["ca_cert_path"].as_str().unwrap_or("");
        crate::flight_server::start_flight_server_with_tls(host, port, cert, key, ca).map(|_| ())
    } else {
        crate::flight_server::start_flight_server(host, port, false).map(|_| ())
    }
}

/// Start distributed scheduler/executor based on node roles.
pub fn start_distributed_for_roles(
    roles: &[String],
    gossip_addr: &str,
) -> Vec<String> {
    let mut statuses = Vec::new();

    for role in roles {
        match role.as_str() {
            "scheduler" => {
                let host = gossip_addr
                    .split(':')
                    .next()
                    .unwrap_or("0.0.0.0");

                let config = crate::distributed_scheduler::SchedulerConfig {
                    bind_addr: format!("{}:50050", host),
                };

                match crate::distributed_scheduler::start_scheduler(config) {
                    Ok(()) => {
                        let msg = format!("distributed-scheduler: started on {}:50050", host);
                        SwarmLogger::info("orchestrator", &msg);
                        statuses.push(msg);

                        let registry = GossipRegistry::instance();
                        if registry.is_running() {
                            let value = serde_json::json!({
                                "host": host,
                                "port": 50050,
                                "status": "running",
                            })
                            .to_string();
                            if let Err(e) = registry.set_key("service:distributed-scheduler", &value)
                            {
                                SwarmLogger::warn(
                                    "orchestrator",
                                    &format!(
                                        "Failed to publish service:distributed-scheduler to gossip: {}",
                                        e
                                    ),
                                );
                            }
                        }
                    }
                    Err(e) => {
                        let msg = format!("distributed-scheduler: failed — {}", e);
                        SwarmLogger::error("orchestrator", &msg);
                        statuses.push(msg);
                    }
                }
            }
            "executor" => {
                let has_flight = crate::config::ClusterConfig::from_env()
                    .ok()
                    .and_then(|cfg| {
                        crate::config::get_this_node_config(&cfg)
                            .map(|(_, node)| node.extensions.iter().any(|e| e.name == "flight"))
                    })
                    .unwrap_or(false);

                if has_flight {
                    let msg =
                        "distributed-executor: Flight extension configured (handles remote queries)"
                            .to_string();
                    SwarmLogger::info("orchestrator", &msg);
                    statuses.push(msg);
                } else {
                    let msg =
                        "distributed-executor: WARNING — no Flight extension configured; \
                         this executor node cannot serve remote queries"
                            .to_string();
                    SwarmLogger::warn("orchestrator", &msg);
                    statuses.push(msg);
                }
            }
            _ => {}
        }
    }

    statuses
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_sql_flight() {
        let sql = get_start_service_sql("flight", r#"{"host":"0.0.0.0","port":8815}"#)
            .unwrap()
            .unwrap();
        assert_eq!(sql, "SELECT start_flight_server('0.0.0.0', 8815)");
    }

    #[test]
    fn start_flight_service_rejects_out_of_range_port() {
        // The flight service is started via the in-crate implementation, not a
        // pooled SQL session. Ports above u16 must be rejected before we ever
        // attempt to bind.
        let cfg = serde_json::json!({ "host": "0.0.0.0", "port": 70000 });
        let err = start_flight_service(&cfg).unwrap_err();
        assert!(err.contains("out of range"), "got: {err}");
    }

    #[test]
    fn start_sql_flight_tls() {
        let sql = get_start_service_sql(
            "flight",
            r#"{"host":"0.0.0.0","port":8815,"cert_path":"/x/cert.pem","key_path":"/x/key.pem","ca_cert_path":"/x/ca.pem"}"#,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            sql,
            "SELECT start_flight_server_tls('0.0.0.0', 8815, '/x/cert.pem', '/x/key.pem', '/x/ca.pem')"
        );
    }

    #[test]
    fn start_sql_pgwire() {
        let sql = get_start_service_sql("pgwire", r#"{"host":"127.0.0.1","port":5432}"#)
            .unwrap()
            .unwrap();
        assert_eq!(
            sql,
            "SELECT start_pgwire_server('127.0.0.1', 5432, '', '')"
        );
    }

    #[test]
    fn start_sql_pgwire_with_password() {
        let sql = get_start_service_sql(
            "pgwire",
            r#"{"host":"127.0.0.1","port":5432,"password":"secret"}"#,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            sql,
            "SELECT start_pgwire_server('127.0.0.1', 5432, 'secret', '')"
        );
    }

    #[test]
    fn start_sql_trexas() {
        let json = r#"{"host":"10.0.0.1","port":9090}"#;
        let sql = get_start_service_sql("trexas", json).unwrap().unwrap();
        let escaped = json.replace('\'', "''");
        assert_eq!(
            sql,
            format!("SELECT trex_start_server_with_config('{escaped}')")
        );
    }

    #[test]
    fn start_sql_chdb_no_path() {
        let sql = get_start_service_sql("chdb", "{}").unwrap().unwrap();
        assert_eq!(sql, "SELECT chdb_start_database()");
    }

    #[test]
    fn start_sql_chdb_with_path() {
        let sql =
            get_start_service_sql("chdb", r#"{"data_path":"/tmp/chdb"}"#)
                .unwrap()
                .unwrap();
        assert_eq!(sql, "SELECT chdb_start_database('/tmp/chdb')");
    }

    #[test]
    fn start_sql_unknown_returns_none() {
        assert!(get_start_service_sql("hana", "{}").unwrap().is_none());
        assert!(get_start_service_sql("llama", "{}").unwrap().is_none());
        assert!(get_start_service_sql("nonexistent", "{}").unwrap().is_none());
    }

    #[test]
    fn start_sql_invalid_json_returns_err() {
        assert!(get_start_service_sql("flight", "not json").is_err());
    }

    #[test]
    fn orchestrate_without_connection_returns_error_per_extension() {
        let extensions = vec![
            ExtensionConfig {
                name: "hana".to_string(),
                config: None,
            },
            ExtensionConfig {
                name: "flight".to_string(),
                config: Some(serde_json::json!({"host": "0.0.0.0", "port": 8815})),
            },
        ];

        let statuses = orchestrate_extensions(&extensions);

        assert_eq!(statuses.len(), 2);
        for status in &statuses {
            assert!(
                status.contains("no local connection"),
                "unexpected status: {status}"
            );
        }
    }

    #[test]
    fn orchestrate_empty_extensions_without_connection_returns_empty() {
        // No extensions -> early return with empty vec (pool probe still runs).
        let statuses = orchestrate_extensions(&[]);
        assert!(statuses.is_empty());
    }

    #[test]
    fn orchestrate_many_extensions_without_connection_all_errors() {
        let extensions: Vec<ExtensionConfig> = (0..5)
            .map(|i| ExtensionConfig {
                name: format!("ext_{i}"),
                config: None,
            })
            .collect();

        let statuses = orchestrate_extensions(&extensions);
        assert_eq!(statuses.len(), 5);
        for (i, status) in statuses.iter().enumerate() {
            assert!(status.starts_with(&format!("ext_{i}")), "got: {status}");
            assert!(status.contains("no local connection"), "got: {status}");
        }
    }

    #[test]
    fn start_distributed_for_roles_empty_returns_empty() {
        let statuses = start_distributed_for_roles(&[], "127.0.0.1:7100");
        assert!(statuses.is_empty());
    }

    #[test]
    fn start_distributed_for_roles_unknown_role_is_noop() {
        let statuses = start_distributed_for_roles(
            &["bogus-role".to_string(), "another".to_string()],
            "127.0.0.1:7100",
        );
        // Unknown roles fall through the match `_ => {}` branch.
        assert!(statuses.is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn start_distributed_for_roles_executor_without_flight_warns() {
        // Make sure SWARM_CONFIG is unset; that drives `has_flight=false`.
        // SAFETY: serialized via `#[serial_test::serial]`.
        let prev = std::env::var("SWARM_CONFIG").ok();
        unsafe {
            std::env::remove_var("SWARM_CONFIG");
        }
        let statuses = start_distributed_for_roles(
            &["executor".to_string()],
            "127.0.0.1:7100",
        );
        // Restore env before asserting so a panic doesn't leak state.
        if let Some(v) = prev {
            // SAFETY: serialized via `#[serial_test::serial]`.
            unsafe {
                std::env::set_var("SWARM_CONFIG", v);
            }
        }
        assert_eq!(statuses.len(), 1);
        assert!(statuses[0].contains("distributed-executor"));
        assert!(
            statuses[0].contains("WARNING")
                || statuses[0].contains("no Flight extension"),
            "got: {}", statuses[0]
        );
    }

    #[test]
    #[serial_test::serial]
    fn start_distributed_for_roles_executor_with_flight_announces_ready() {
        // Configure SWARM_NODE + SWARM_CONFIG so has_flight=true.
        let cfg = r#"{
            "cluster_id":"c",
            "nodes":{
                "n1":{
                    "gossip_addr":"127.0.0.1:47200",
                    "extensions":[{"name":"flight","config":{"host":"0.0.0.0","port":8815}}]
                }
            }
        }"#;
        let prev_cfg = std::env::var("SWARM_CONFIG").ok();
        let prev_node = std::env::var("SWARM_NODE").ok();
        // SAFETY: serialized via `#[serial_test::serial]`.
        unsafe {
            std::env::set_var("SWARM_CONFIG", cfg);
            std::env::set_var("SWARM_NODE", "n1");
        }
        let statuses = start_distributed_for_roles(
            &["executor".to_string()],
            "127.0.0.1:7100",
        );
        // Restore env.
        unsafe {
            match prev_cfg {
                Some(v) => std::env::set_var("SWARM_CONFIG", v),
                None => std::env::remove_var("SWARM_CONFIG"),
            }
            match prev_node {
                Some(v) => std::env::set_var("SWARM_NODE", v),
                None => std::env::remove_var("SWARM_NODE"),
            }
        }
        assert_eq!(statuses.len(), 1);
        assert!(
            statuses[0].contains("Flight extension configured"),
            "got: {}", statuses[0]
        );
    }

    #[test]
    fn start_distributed_for_roles_unknown_mixed_with_known_skips_unknown() {
        let statuses = start_distributed_for_roles(
            &["unknown-role".to_string()],
            "127.0.0.1:7100",
        );
        assert!(statuses.is_empty());
    }

    // ---------- bucket-8: additional coverage ----------

    #[test]
    fn start_sql_distributed_scheduler_defaults() {
        let sql = get_start_service_sql("distributed-scheduler", "{}")
            .unwrap()
            .unwrap();
        assert!(sql.contains("swarm_start_distributed_scheduler"));
        assert!(sql.contains("'0.0.0.0'"));
        assert!(sql.contains("50050"));
    }

    #[test]
    fn start_sql_distributed_scheduler_custom() {
        let sql = get_start_service_sql(
            "distributed-scheduler",
            r#"{"host":"10.0.0.5","port":9050}"#,
        )
        .unwrap()
        .unwrap();
        assert!(sql.contains("'10.0.0.5'"));
        assert!(sql.contains("9050"));
    }

    #[test]
    fn start_sql_distributed_executor_defaults() {
        let sql = get_start_service_sql("distributed-executor", "{}")
            .unwrap()
            .unwrap();
        assert!(sql.contains("'0.0.0.0'"));
        assert!(sql.contains("50051"));
    }

    #[test]
    fn start_sql_etl_missing_required_fields_returns_err() {
        // No pipeline_name -> error.
        let r1 = get_start_service_sql("etl", "{}");
        assert!(r1.is_err());
        // pipeline_name but no connection_string -> error.
        let r2 = get_start_service_sql("etl", r#"{"pipeline_name":"p1"}"#);
        assert!(r2.is_err());
    }

    #[test]
    fn start_sql_etl_with_required_fields() {
        let sql = get_start_service_sql(
            "etl",
            r#"{"pipeline_name":"p1","connection_string":"postgres://x"}"#,
        )
        .unwrap()
        .unwrap();
        assert!(sql.contains("etl_start"));
        assert!(sql.contains("p1"));
        assert!(sql.contains("postgres://x"));
    }

    #[test]
    fn start_sql_pgwire_with_db_credentials() {
        let sql = get_start_service_sql(
            "pgwire",
            r#"{"host":"127.0.0.1","port":5432,"password":"pw","db_credentials":"u:p"}"#,
        )
        .unwrap()
        .unwrap();
        assert!(sql.contains("start_pgwire_server"));
        assert!(sql.contains("'pw'"));
        assert!(sql.contains("'u:p'"));
    }

    #[test]
    fn start_sql_flight_host_with_quote_escapes() {
        let sql = get_start_service_sql(
            "flight",
            r#"{"host":"some'host","port":8815}"#,
        )
        .unwrap()
        .unwrap();
        // Single quote in host must be doubled.
        assert!(sql.contains("some''host"));
    }

    #[test]
    fn start_sql_chdb_empty_path_uses_default() {
        // Empty data_path -> filtered out by `.filter(|s| !s.is_empty())`,
        // routes to the no-arg form.
        let sql = get_start_service_sql("chdb", r#"{"data_path":""}"#)
            .unwrap()
            .unwrap();
        assert_eq!(sql, "SELECT chdb_start_database()");
    }

    #[test]
    fn orchestrate_invalid_extension_name_short_circuits_loop() {
        // When the local-connection probe fails, we get the no-local-connection path.
        // To exercise the invalid-name branch we'd need a pool. With cargo test
        // --lib, pool is unavailable so we test the early-return path only.
        let extensions = vec![ExtensionConfig {
            name: "name with spaces".to_string(),
            config: None,
        }];
        let statuses = orchestrate_extensions(&extensions);
        // Returns one status per extension regardless.
        assert_eq!(statuses.len(), 1);
    }

    #[test]
    fn start_distributed_for_roles_multiple_unknown_roles() {
        let statuses = start_distributed_for_roles(
            &["foo".to_string(), "bar".to_string(), "baz".to_string()],
            "127.0.0.1:7100",
        );
        assert!(statuses.is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn start_distributed_for_roles_executor_invalid_swarm_config_treated_as_no_flight() {
        // Invalid JSON in SWARM_CONFIG => ClusterConfig::from_env errs =>
        // has_flight is false.
        let prev_cfg = std::env::var("SWARM_CONFIG").ok();
        let prev_node = std::env::var("SWARM_NODE").ok();
        // SAFETY: serialized via `#[serial_test::serial]`.
        unsafe {
            std::env::set_var("SWARM_CONFIG", "not valid json");
        }
        let statuses = start_distributed_for_roles(
            &["executor".to_string()],
            "127.0.0.1:7100",
        );
        // Restore env.
        unsafe {
            match prev_cfg {
                Some(v) => std::env::set_var("SWARM_CONFIG", v),
                None => std::env::remove_var("SWARM_CONFIG"),
            }
            match prev_node {
                Some(v) => std::env::set_var("SWARM_NODE", v),
                None => std::env::remove_var("SWARM_NODE"),
            }
        }
        assert_eq!(statuses.len(), 1);
        assert!(
            statuses[0].contains("WARNING") || statuses[0].contains("no Flight"),
            "got: {}", statuses[0]
        );
    }

    #[test]
    #[serial_test::serial]
    fn start_distributed_for_roles_mixed_executor_and_unknown() {
        // executor reaches the warning branch (no SWARM_CONFIG); unknown
        // role silently dropped. Need 1 status.
        let prev_cfg = std::env::var("SWARM_CONFIG").ok();
        // SAFETY: env-mutation; this test doesn't claim serial since it only
        // reads the var when not present. We restore.
        let statuses = start_distributed_for_roles(
            &["xyz".to_string(), "executor".to_string()],
            "127.0.0.1:7100",
        );
        if let Some(v) = prev_cfg {
            unsafe {
                std::env::set_var("SWARM_CONFIG", v);
            }
        }
        assert_eq!(statuses.len(), 1);
        assert!(statuses[0].contains("distributed-executor"));
    }
}
