//! Per-client session registry for the Flight server. Maps a client-supplied
//! token to a leased pool session id so DuckDB session state (USE, SET, temp
//! tables, prepared statements) survives across Flight requests.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

pub struct SessionRegistry {
    inner: Mutex<HashMap<String, Entry>>,
}

struct Entry {
    pool_session_id: u64,
    last_touched: Instant,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    /// Returns Some(pool_session_id) if a session for this token exists.
    pub fn resolve(&self, token: &str) -> Option<u64> {
        let mut map = self.inner.lock().expect("session registry poisoned");
        if let Some(entry) = map.get_mut(token) {
            entry.last_touched = Instant::now();
            Some(entry.pool_session_id)
        } else {
            None
        }
    }

    /// Insert or replace the mapping. Returns the previous pool session id, if any.
    pub fn put(&self, token: &str, pool_session_id: u64) -> Option<u64> {
        let mut map = self.inner.lock().expect("session registry poisoned");
        map.insert(
            token.to_string(),
            Entry { pool_session_id, last_touched: Instant::now() },
        )
        .map(|e| e.pool_session_id)
    }

    /// Insert only if no entry exists for `token`. Returns Some(existing_id) when
    /// an entry was already present (and the caller's value was NOT stored).
    /// Returns None when the insert succeeded.
    pub fn put_if_absent(&self, token: &str, pool_session_id: u64) -> Option<u64> {
        let mut map = self.inner.lock().expect("session registry poisoned");
        match map.entry(token.to_string()) {
            std::collections::hash_map::Entry::Occupied(e) => Some(e.get().pool_session_id),
            std::collections::hash_map::Entry::Vacant(slot) => {
                slot.insert(Entry { pool_session_id, last_touched: Instant::now() });
                None
            }
        }
    }

    pub fn remove(&self, token: &str) -> Option<u64> {
        let mut map = self.inner.lock().expect("session registry poisoned");
        map.remove(token).map(|e| e.pool_session_id)
    }

    /// Remove entries idle for longer than `ttl`. Returns the pool session ids
    /// of evicted entries so the caller can destroy them.
    pub fn sweep_idle(&self, ttl: std::time::Duration) -> Vec<u64> {
        let now = Instant::now();
        let mut map = self.inner.lock().expect("session registry poisoned");
        let stale: Vec<String> = map
            .iter()
            .filter_map(|(k, v)| {
                if now.duration_since(v.last_touched) > ttl {
                    Some(k.clone())
                } else {
                    None
                }
            })
            .collect();
        stale
            .into_iter()
            .filter_map(|k| map.remove(&k).map(|e| e.pool_session_id))
            .collect()
    }

    /// Spawn the idle-session sweeper exactly once. Subsequent calls are no-ops.
    pub fn start_sweeper(&'static self) -> Result<(), String> {
        use std::sync::atomic::{AtomicBool, Ordering};
        static STARTED: AtomicBool = AtomicBool::new(false);
        if STARTED.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        std::thread::Builder::new()
            .name("flight-session-sweeper".into())
            .spawn(move || {
                let ttl = std::time::Duration::from_secs(
                    std::env::var("TREX_FLIGHT_SESSION_TTL_SECS")
                        .ok()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(900),
                );
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    let evicted = self.sweep_idle(ttl);
                    for sid in evicted {
                        let _ = trex_pool_client::destroy_session(sid);
                    }
                }
            })
            .map_err(|e| format!("spawn flight-session-sweeper: {e}"))?;
        Ok(())
    }

    pub fn instance() -> &'static SessionRegistry {
        use std::sync::OnceLock;
        static INSTANCE: OnceLock<SessionRegistry> = OnceLock::new();
        INSTANCE.get_or_init(SessionRegistry::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_returns_inserted_session_id() {
        let r = SessionRegistry::new();
        assert!(r.resolve("a").is_none());
        let prev = r.put("a", 42);
        assert!(prev.is_none());
        assert_eq!(r.resolve("a"), Some(42));
    }

    #[test]
    fn put_returns_previous_id_on_replace() {
        let r = SessionRegistry::new();
        r.put("a", 1);
        let prev = r.put("a", 2);
        assert_eq!(prev, Some(1));
        assert_eq!(r.resolve("a"), Some(2));
    }

    #[test]
    fn remove_returns_and_clears() {
        let r = SessionRegistry::new();
        r.put("a", 7);
        assert_eq!(r.remove("a"), Some(7));
        assert!(r.resolve("a").is_none());
    }

    #[test]
    fn sweep_evicts_only_idle_entries() {
        use std::time::Duration;
        let r = SessionRegistry::new();
        r.put("fresh", 1);
        r.put("old", 2);
        // Force "old" past the TTL by rewriting its timestamp.
        {
            let mut map = r.inner.lock().unwrap();
            let e = map.get_mut("old").unwrap();
            e.last_touched = Instant::now() - Duration::from_secs(3600);
        }
        let evicted = r.sweep_idle(Duration::from_secs(60));
        assert_eq!(evicted, vec![2]);
        assert!(r.resolve("fresh").is_some());
        assert!(r.resolve("old").is_none());
    }

    #[test]
    fn instance_returns_singleton() {
        let a = SessionRegistry::instance() as *const _;
        let b = SessionRegistry::instance() as *const _;
        assert_eq!(a, b);
    }

    #[test]
    fn start_sweeper_is_idempotent() {
        assert!(SessionRegistry::instance().start_sweeper().is_ok());
        assert!(SessionRegistry::instance().start_sweeper().is_ok());
    }

    #[test]
    fn put_if_absent_returns_none_on_first_insert() {
        let r = SessionRegistry::new();
        assert!(r.put_if_absent("a", 1).is_none());
        assert_eq!(r.resolve("a"), Some(1));
    }

    #[test]
    fn put_if_absent_returns_existing_on_collision() {
        let r = SessionRegistry::new();
        r.put("a", 1);
        let existing = r.put_if_absent("a", 999);
        assert_eq!(existing, Some(1));
        // Original is preserved.
        assert_eq!(r.resolve("a"), Some(1));
    }
}
