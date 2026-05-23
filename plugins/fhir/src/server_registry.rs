use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct ServerHandle {
    #[allow(dead_code)]
    pub thread_handle: JoinHandle<Result<(), Box<dyn std::error::Error + Send + Sync>>>,
    pub shutdown_tx: oneshot::Sender<()>,
    pub start_time: std::time::SystemTime,
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

    pub fn server_key(host: &str, port: u16) -> String {
        format!("{}:{}", host, port)
    }

    pub fn is_server_running(&self, host: &str, port: u16) -> bool {
        let servers = self.servers.lock().unwrap();
        let key = Self::server_key(host, port);
        servers.contains_key(&key)
    }

    pub fn register_server(
        &self,
        host: String,
        port: u16,
        handle: ServerHandle,
    ) -> Result<(), String> {
        let mut servers = self.servers.lock().unwrap();
        let key = Self::server_key(&host, port);

        if servers.contains_key(&key) {
            return Err(format!("Server already running on {}:{}", host, port));
        }

        servers.insert(key, handle);
        Ok(())
    }

    /// Remove a registry entry without joining the thread. Used by the
    /// spawned server thread itself to clean up its own entry on exit
    /// (Ok or Err). This prevents phantom entries when the thread fails
    /// internally (bind error, definition load error, etc.) after the
    /// outer fn already registered the handle.
    pub fn deregister_server(&self, host: &str, port: u16) {
        let mut servers = self.servers.lock().unwrap();
        let key = Self::server_key(host, port);
        servers.remove(&key);
    }

    pub fn stop_server(&self, host: &str, port: u16) -> Result<String, String> {
        // Remove the handle while holding the lock briefly so that a
        // concurrent caller can't observe a half-stopped server, then drop
        // the lock before joining the thread (joining can block).
        let handle = {
            let mut servers = self.servers.lock().unwrap();
            let key = Self::server_key(host, port);
            match servers.remove(&key) {
                Some(h) => h,
                None => return Err(format!("No server running on {}:{}", host, port)),
            }
        };

        // Send shutdown signal — graceful shutdown of axum::serve.
        let _ = handle.shutdown_tx.send(());

        // Wait for the server thread to actually exit so that the port is
        // released before we return. Without this, an immediate restart on
        // the same port can race with the previous bind.
        match handle.thread_handle.join() {
            Ok(Ok(())) => {}
            Ok(Err(e)) => eprintln!("[fhir] server thread exited with error: {}", e),
            Err(_) => eprintln!("[fhir] server thread panicked during shutdown"),
        }
        Ok(format!("Stopped FHIR server on {}:{}", host, port))
    }

    pub fn get_servers_info(&self) -> Vec<(String, u16, u64)> {
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
                server_info.push((host, port, uptime_secs));
            }
        }

        server_info
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_key_formats_host_port() {
        assert_eq!(ServerRegistry::server_key("127.0.0.1", 8080), "127.0.0.1:8080");
        assert_eq!(ServerRegistry::server_key("0.0.0.0", 0), "0.0.0.0:0");
    }

    #[test]
    fn empty_registry_reports_not_running() {
        let r = ServerRegistry::new();
        assert!(!r.is_server_running("127.0.0.1", 8080));
    }

    #[test]
    fn stop_missing_server_returns_err() {
        let r = ServerRegistry::new();
        let res = r.stop_server("127.0.0.1", 8080);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("No server running"));
    }

    #[test]
    fn empty_registry_get_servers_info_empty() {
        let r = ServerRegistry::new();
        assert!(r.get_servers_info().is_empty());
    }

    #[test]
    fn deregister_missing_is_noop() {
        let r = ServerRegistry::new();
        r.deregister_server("127.0.0.1", 8080);
    }
}
