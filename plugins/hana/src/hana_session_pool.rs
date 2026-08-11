use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeId},
    vscalar::{ScalarFunctionSignature, VScalar},
    vtab::arrow::WritableVector,
};
use hdbconnect::HdbError;

use crate::HanaConnection;

/// A pooled connection and when it last served a statement, so the idle sweep
/// can drop connections whose owner never evicted them.
struct Entry {
    conn: HanaConnection,
    last_used: Instant,
}

/// Session-keyed HANA connections. Key = (session_id, connection url). One
/// connection per session, so `#temp` tables and session variables survive
/// between statements.
static POOL: OnceLock<Mutex<HashMap<(u64, String), Entry>>> = OnceLock::new();

fn pool() -> &'static Mutex<HashMap<(u64, String), Entry>> {
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `session_id == 0` means "no session" — never pooled.
const NO_SESSION: u64 = 0;

/// How long a pooled connection may sit unused before the sweep drops it.
const DEFAULT_IDLE_TTL_SECS: u64 = 600;

fn parse_idle_ttl_secs(raw: Option<&str>) -> u64 {
    raw.and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|secs| *secs > 0)
        .unwrap_or(DEFAULT_IDLE_TTL_SECS)
}

fn idle_ttl() -> Duration {
    static TTL: OnceLock<Duration> = OnceLock::new();
    *TTL.get_or_init(|| {
        let raw = std::env::var("HANA_SESSION_IDLE_TTL_SECS").ok();
        Duration::from_secs(parse_idle_ttl_secs(raw.as_deref()))
    })
}

/// Idle at or beyond the TTL counts as expired.
fn is_expired(last_used: Instant, now: Instant, ttl: Duration) -> bool {
    now.duration_since(last_used) >= ttl
}

pub fn parse_session_id(s: &str) -> u64 {
    s.trim().parse::<u64>().unwrap_or(NO_SESSION)
}

/// Returns a HANA connection for this session. For `session_id == 0` a fresh
/// connection is returned every call (legacy behavior). Otherwise the session's
/// cached connection is returned, created on first use and replaced if broken.
pub fn get_or_create(session_id: u64, url: &str) -> Result<HanaConnection, HdbError> {
    if session_id == NO_SESSION {
        return HanaConnection::new(url.to_string());
    }

    let key = (session_id, url.to_string());

    // Fast path: drop connections idle past the TTL, then return a live cached
    // one. is_broken() is a local check, safe to run under the lock; a broken
    // entry is dropped so we reconnect below.
    {
        let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
        let now = Instant::now();
        let ttl = idle_ttl();
        pool.retain(|_key, entry| !is_expired(entry.last_used, now, ttl));
        if let Some(entry) = pool.get_mut(&key) {
            if !entry.conn.is_broken().unwrap_or(true) {
                entry.last_used = now;
                return Ok(entry.conn.clone());
            }
            pool.remove(&key);
        }
    }

    // Connect without holding the lock so a slow HANA handshake never blocks other
    // sessions or disconnect-time eviction. Re-lock only to publish; if another
    // thread published first, keep theirs and drop our duplicate.
    let conn = HanaConnection::new(url.to_string())?;
    let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
    let entry = pool.entry(key).or_insert(Entry {
        conn,
        last_used: Instant::now(),
    });
    entry.last_used = Instant::now();
    Ok(entry.conn.clone())
}

/// Drop every cached connection for this session. Returns how many were removed.
/// Dropping the connection closes the HANA session, discarding its `#temp` tables.
pub fn evict(session_id: u64) -> usize {
    if session_id == NO_SESSION {
        return 0;
    }
    let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
    let before = pool.len();
    pool.retain(|(sid, _url), _entry| *sid != session_id);
    before - pool.len()
}

/// DuckDB scalar `trex_hana_evict_session(session_id VARCHAR) -> VARCHAR`.
/// Lets the pgwire layer close a session's pooled HANA connection (dropping its
/// `#temp` tables) via SQL, without depending on the `hana` crate directly.
pub struct HanaEvictSessionScalar;

impl VScalar for HanaEvictSessionScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let session_id_vector = input.flat_vector(0);
        let session_id_slice =
            session_id_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let flat_vector = output.flat_vector();
        for row in 0..input.len() {
            let session_id_str = {
                let mut binding = session_id_slice[row];
                duckdb::types::DuckString::new(&mut binding).as_str().to_string()
            };
            let n = evict(parse_session_id(&session_id_str));
            flat_vector.insert(row, &format!("evicted {}", n));
        }
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![LogicalTypeId::Varchar.into()],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_session_id_defaults_to_zero() {
        assert_eq!(parse_session_id(""), 0);
        assert_eq!(parse_session_id("not-a-number"), 0);
        assert_eq!(parse_session_id("42"), 42);
    }

    #[test]
    fn evict_of_no_session_is_noop() {
        assert_eq!(evict(0), 0);
    }

    #[test]
    fn expiry_is_measured_against_idle_time() {
        let ttl = Duration::from_secs(600);
        let now = Instant::now();
        assert!(!is_expired(now - Duration::from_secs(1), now, ttl));
        assert!(is_expired(now - Duration::from_secs(601), now, ttl));
        // Exactly at the TTL counts as expired.
        assert!(is_expired(now - ttl, now, ttl));
    }

    #[test]
    fn idle_ttl_falls_back_to_the_default() {
        assert_eq!(parse_idle_ttl_secs(None), DEFAULT_IDLE_TTL_SECS);
        assert_eq!(parse_idle_ttl_secs(Some("not-a-number")), DEFAULT_IDLE_TTL_SECS);
        // Zero would evict a connection the moment it is published.
        assert_eq!(parse_idle_ttl_secs(Some("0")), DEFAULT_IDLE_TTL_SECS);
        assert_eq!(parse_idle_ttl_secs(Some(" 45 ")), 45);
    }
}
