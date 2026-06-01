//! Discover a remote data node's Flight endpoint via gossip.

use crate::gossip::{GossipRegistry, NodeInfo, NodeKeyValueInfo};

/// True if `host` is a bind-all / unspecified address that a *peer* cannot dial.
/// A service may legitimately bind to `0.0.0.0` (all interfaces), but that value
/// is meaningless as a connect target — from another node `0.0.0.0` resolves to
/// the caller itself, not the advertiser.
pub(crate) fn is_unroutable_host(host: &str) -> bool {
    matches!(
        host.trim(),
        "" | "0.0.0.0" | "::" | "[::]" | "0:0:0:0:0:0:0:0"
    )
}

/// Extract the host portion from a `host:port` gossip address. Handles IPv4
/// (`10.0.0.1:4200` -> `10.0.0.1`) and bracketed IPv6 (`[::1]:4200` -> `[::1]`).
pub(crate) fn host_of(addr: &str) -> &str {
    match addr.rfind(':') {
        Some(i) => &addr[..i],
        None => addr,
    }
}

/// Return the gRPC endpoint URL ("http://host:port") of a data node's Flight
/// server, or an error if none has been advertised yet.
pub fn pick_data_node_flight_endpoint() -> Result<String, String> {
    let registry = GossipRegistry::instance();
    let nodes = registry.get_node_states()?;
    let kvs = registry.get_node_key_values()?;
    pick_from_inputs(&nodes, &kvs)
}

/// Pure helper for testing: pick a Flight endpoint from pre-fetched gossip data.
pub(crate) fn pick_from_inputs(
    nodes: &[NodeInfo],
    kvs: &[NodeKeyValueInfo],
) -> Result<String, String> {
    use std::collections::HashSet;
    let data_node_ids: HashSet<&str> = nodes
        .iter()
        .filter(|n| n.data_node == "true")
        .map(|n| n.node_id.as_str())
        .collect();

    if data_node_ids.is_empty() {
        return Err("no data node found in gossip".into());
    }

    for kv in kvs {
        if !data_node_ids.contains(kv.node_id.as_str()) {
            continue;
        }
        let flight_value = kv
            .key_values
            .iter()
            .find(|(k, _)| k == "service:flight")
            .map(|(_, v)| v.as_str());

        let flight_json = match flight_value {
            Some(v) => v,
            None => continue,
        };

        let parsed: serde_json::Value = match serde_json::from_str(flight_json) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let status = parsed.get("status").and_then(|v| v.as_str()).unwrap_or("");
        if status != "running" {
            continue;
        }

        let advertised = parsed.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let port = parsed.get("port").and_then(|v| v.as_u64()).unwrap_or(0);
        if port == 0 {
            continue;
        }
        // A data node binds Flight to 0.0.0.0 (all interfaces) but that's not a
        // dialable address from here. When the advertised host is unroutable,
        // fall back to the node's reachable gossip address host — the same
        // address gossip itself uses to talk to it.
        let host = if is_unroutable_host(advertised) {
            host_of(&kv.gossip_addr)
        } else {
            advertised
        };
        if !host.is_empty() {
            return Ok(format!("http://{host}:{port}"));
        }
    }
    Err("no service:flight entry from a data node yet".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node_info(node_id: &str, node_name: &str, gossip_addr: &str, data_node: &str, status: &str) -> NodeInfo {
        NodeInfo {
            node_id: node_id.into(),
            node_name: node_name.into(),
            gossip_addr: gossip_addr.into(),
            data_node: data_node.into(),
            status: status.into(),
        }
    }

    fn make_kv_info(node_id: &str, node_name: &str, gossip_addr: &str, kvs: Vec<(&str, &str)>) -> NodeKeyValueInfo {
        NodeKeyValueInfo {
            node_id: node_id.into(),
            node_name: node_name.into(),
            gossip_addr: gossip_addr.into(),
            key_values: kvs.into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        }
    }

    #[test]
    fn returns_error_when_no_data_nodes() {
        let result = pick_from_inputs(&[], &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no data node"));
    }

    #[test]
    fn skips_non_data_nodes_and_returns_first_data_match() {
        let nodes = vec![
            make_node_info("n1", "n1", "127.0.0.1:7100", "false", "alive"),
            make_node_info("n2", "n2", "127.0.0.1:7101", "true", "alive"),
        ];

        let kvs = vec![
            make_kv_info("n1", "n1", "127.0.0.1:7100", vec![
                ("service:flight", r#"{"host":"non-data-host","port":1,"status":"running"}"#),
            ]),
            make_kv_info("n2", "n2", "127.0.0.1:7101", vec![
                ("service:flight", r#"{"host":"data-host","port":50051,"status":"running"}"#),
            ]),
        ];

        let got = pick_from_inputs(&nodes, &kvs).unwrap();
        assert_eq!(got, "http://data-host:50051");
    }

    #[test]
    fn returns_error_when_no_service_flight_from_data_node() {
        let nodes = vec![
            make_node_info("n2", "n2", "127.0.0.1:7101", "true", "alive"),
        ];
        let kvs: Vec<NodeKeyValueInfo> = vec![];
        let result = pick_from_inputs(&nodes, &kvs);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no service:flight"));
    }

    #[test]
    fn falls_back_to_gossip_host_when_flight_host_unroutable() {
        // A data node binds Flight to 0.0.0.0 and advertises that verbatim.
        // The endpoint must be dialable, so the host comes from the node's
        // reachable gossip address, keeping the advertised Flight port.
        let nodes = vec![make_node_info(
            "n2",
            "n2",
            "172.21.0.4:4200",
            "true",
            "alive",
        )];
        let kvs = vec![make_kv_info("n2", "n2", "172.21.0.4:4200", vec![(
            "service:flight",
            r#"{"host":"0.0.0.0","port":50051,"status":"running"}"#,
        )])];

        let got = pick_from_inputs(&nodes, &kvs).unwrap();
        assert_eq!(got, "http://172.21.0.4:50051");
    }

    #[test]
    fn concrete_advertised_host_is_used_as_is() {
        let nodes = vec![make_node_info("n2", "n2", "172.21.0.4:4200", "true", "alive")];
        let kvs = vec![make_kv_info("n2", "n2", "172.21.0.4:4200", vec![(
            "service:flight",
            r#"{"host":"data-host","port":50051,"status":"running"}"#,
        )])];
        assert_eq!(pick_from_inputs(&nodes, &kvs).unwrap(), "http://data-host:50051");
    }

    #[test]
    fn is_unroutable_host_detects_bind_all_addresses() {
        for h in ["", "0.0.0.0", "::", "[::]", " 0.0.0.0 "] {
            assert!(is_unroutable_host(h), "expected {h:?} unroutable");
        }
        for h in ["trex-data", "172.21.0.4", "127.0.0.1"] {
            assert!(!is_unroutable_host(h), "expected {h:?} routable");
        }
    }

    #[test]
    fn host_of_strips_port_for_v4_and_v6() {
        assert_eq!(host_of("172.21.0.4:4200"), "172.21.0.4");
        assert_eq!(host_of("trex-data:4200"), "trex-data");
        assert_eq!(host_of("[::1]:4200"), "[::1]");
    }

    #[test]
    fn returns_error_when_flight_not_running() {
        let nodes = vec![
            make_node_info("n2", "n2", "127.0.0.1:7101", "true", "alive"),
        ];
        let kvs = vec![
            make_kv_info("n2", "n2", "127.0.0.1:7101", vec![
                ("service:flight", r#"{"host":"data-host","port":50051,"status":"stopped"}"#),
            ]),
        ];
        let result = pick_from_inputs(&nodes, &kvs);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no service:flight"));
    }
}
