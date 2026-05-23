use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tokio::sync::oneshot;

pub struct ServerHandle {
    pub thread_handle: Option<JoinHandle<Result<(), Box<dyn std::error::Error + Send + Sync>>>>,
    pub shutdown_tx: oneshot::Sender<()>,
    pub start_time: std::time::SystemTime,
    pub tls_enabled: bool,
}

pub struct ServerRegistry {
    servers: Arc<Mutex<HashMap<String, ServerHandle>>>,
}

impl ServerRegistry {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn instance() -> &'static ServerRegistry {
        static INSTANCE: std::sync::OnceLock<ServerRegistry> = std::sync::OnceLock::new();
        INSTANCE.get_or_init(|| ServerRegistry::new())
    }

    fn server_key(host: &str, port: u16) -> String {
        format!("{}:{}", host, port)
    }

    /// Atomically check availability and reserve a slot before spawning.
    pub fn reserve(
        &self,
        host: &str,
        port: u16,
        shutdown_tx: oneshot::Sender<()>,
        tls_enabled: bool,
    ) -> Result<(), String> {
        let mut servers = self.servers.lock().unwrap();
        let key = Self::server_key(host, port);

        if servers.contains_key(&key) {
            return Err(format!("Server already running on {}:{}", host, port));
        }

        servers.insert(
            key,
            ServerHandle {
                thread_handle: None,
                shutdown_tx,
                start_time: std::time::SystemTime::now(),
                tls_enabled,
            },
        );
        Ok(())
    }

    /// Attach the spawned thread handle to a reserved slot.
    pub fn set_thread_handle(
        &self,
        host: &str,
        port: u16,
        handle: JoinHandle<Result<(), Box<dyn std::error::Error + Send + Sync>>>,
    ) {
        let mut servers = self.servers.lock().unwrap();
        let key = Self::server_key(host, port);
        if let Some(entry) = servers.get_mut(&key) {
            entry.thread_handle = Some(handle);
        }
    }

    /// Remove a reserved slot (e.g. when thread spawn fails).
    pub fn deregister(&self, host: &str, port: u16) {
        let mut servers = self.servers.lock().unwrap();
        let key = Self::server_key(host, port);
        servers.remove(&key);
    }

    pub fn stop_server(&self, host: &str, port: u16) -> Result<String, String> {
        let handle = {
            let mut servers = self.servers.lock().unwrap();
            let key = Self::server_key(host, port);
            servers.remove(&key)
        };

        if let Some(handle) = handle {
            let _ = handle.shutdown_tx.send(());
            if let Some(th) = handle.thread_handle {
                let _ = th.join();
            }
            Ok(format!("Server {}:{} stopped", host, port))
        } else {
            Err(format!("No server running on {}:{}", host, port))
        }
    }

    pub fn get_servers_info(&self) -> Vec<(String, u16, u64, bool)> {
        let servers = self.servers.lock().unwrap();
        let mut server_info = Vec::new();

        for (key, handle) in servers.iter() {
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() == 2 {
                let host = parts[0].to_string();
                let port = parts[1].parse::<u16>().unwrap_or(0);
                let uptime_secs = handle
                    .start_time
                    .elapsed()
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let tls_enabled = handle.tls_enabled;

                server_info.push((host, port, uptime_secs, tls_enabled));
            }
        }

        server_info
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_shutdown() -> oneshot::Sender<()> {
        let (tx, _rx) = oneshot::channel::<()>();
        tx
    }

    #[test]
    fn new_registry_has_no_servers() {
        let reg = ServerRegistry::new();
        assert!(reg.get_servers_info().is_empty());
    }

    #[test]
    fn server_key_formats_host_and_port() {
        assert_eq!(ServerRegistry::server_key("127.0.0.1", 8080), "127.0.0.1:8080");
        assert_eq!(ServerRegistry::server_key("0.0.0.0", 0), "0.0.0.0:0");
    }

    #[test]
    fn reserve_inserts_a_slot() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9001, make_shutdown(), false).unwrap();
        let info = reg.get_servers_info();
        assert_eq!(info.len(), 1);
        let (host, port, _uptime, tls) = &info[0];
        assert_eq!(host, "127.0.0.1");
        assert_eq!(*port, 9001);
        assert!(!*tls);
    }

    #[test]
    fn reserve_twice_same_address_errors() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9002, make_shutdown(), true).unwrap();
        let err = reg.reserve("127.0.0.1", 9002, make_shutdown(), true).unwrap_err();
        assert!(err.contains("already running"), "got: {err}");
        assert!(err.contains("9002"), "got: {err}");
    }

    #[test]
    fn reserve_different_ports_both_succeed() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9003, make_shutdown(), false).unwrap();
        reg.reserve("127.0.0.1", 9004, make_shutdown(), true).unwrap();
        assert_eq!(reg.get_servers_info().len(), 2);
    }

    #[test]
    fn deregister_removes_slot() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9005, make_shutdown(), false).unwrap();
        assert_eq!(reg.get_servers_info().len(), 1);
        reg.deregister("127.0.0.1", 9005);
        assert!(reg.get_servers_info().is_empty());
    }

    #[test]
    fn deregister_missing_is_noop() {
        let reg = ServerRegistry::new();
        // Should not panic
        reg.deregister("127.0.0.1", 65000);
        assert!(reg.get_servers_info().is_empty());
    }

    #[test]
    fn stop_server_missing_returns_err() {
        let reg = ServerRegistry::new();
        let err = reg.stop_server("127.0.0.1", 9999).unwrap_err();
        assert!(err.contains("No server running"), "got: {err}");
    }

    #[test]
    fn stop_server_removes_reserved_slot() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9006, make_shutdown(), false).unwrap();
        let msg = reg.stop_server("127.0.0.1", 9006).unwrap();
        assert!(msg.contains("9006"), "got: {msg}");
        assert!(msg.contains("stopped"), "got: {msg}");
        assert!(reg.get_servers_info().is_empty());
    }

    #[test]
    fn stop_server_after_reserve_then_stop_can_reserve_again() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9007, make_shutdown(), false).unwrap();
        reg.stop_server("127.0.0.1", 9007).unwrap();
        // The slot is free again
        reg.reserve("127.0.0.1", 9007, make_shutdown(), true).unwrap();
        let info = reg.get_servers_info();
        assert_eq!(info.len(), 1);
        assert!(info[0].3, "expected tls_enabled=true after re-reserve");
    }

    #[test]
    fn set_thread_handle_attaches_to_reserved_slot() {
        let reg = ServerRegistry::new();
        reg.reserve("127.0.0.1", 9008, make_shutdown(), false).unwrap();
        // Spawn a trivial thread that exits immediately.
        let th = std::thread::spawn(|| -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            Ok(())
        });
        reg.set_thread_handle("127.0.0.1", 9008, th);
        // stop_server should now join the thread cleanly.
        reg.stop_server("127.0.0.1", 9008).unwrap();
    }

    #[test]
    fn set_thread_handle_on_missing_slot_is_noop() {
        let reg = ServerRegistry::new();
        let th = std::thread::spawn(|| -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            Ok(())
        });
        reg.set_thread_handle("127.0.0.1", 9009, th);
        // Slot still does not exist
        assert!(reg.get_servers_info().is_empty());
    }

    #[test]
    fn get_servers_info_reports_uptime_and_tls_flags() {
        let reg = ServerRegistry::new();
        reg.reserve("10.0.0.1", 9100, make_shutdown(), true).unwrap();
        reg.reserve("10.0.0.2", 9101, make_shutdown(), false).unwrap();
        let info = reg.get_servers_info();
        assert_eq!(info.len(), 2);
        let mut sorted = info.clone();
        sorted.sort_by_key(|t| t.1);
        assert_eq!(sorted[0].0, "10.0.0.1");
        assert_eq!(sorted[0].1, 9100);
        assert!(sorted[0].3);
        assert_eq!(sorted[1].0, "10.0.0.2");
        assert_eq!(sorted[1].1, 9101);
        assert!(!sorted[1].3);
        // Uptime should be a small number of seconds.
        assert!(sorted[0].2 < 5);
    }

    #[test]
    fn registry_instance_returns_same_singleton() {
        let a = ServerRegistry::instance() as *const ServerRegistry;
        let b = ServerRegistry::instance() as *const ServerRegistry;
        assert_eq!(a, b);
    }
}
