use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use hdbconnect::HdbError;

use crate::HanaConnection;

/// Session-keyed HANA connections. Key = (pgwire session_id, connection url).
/// A single pgwire client session reuses one HANA connection across all its
/// statements so HANA session-local `#temp` tables survive between statements.
static POOL: OnceLock<Mutex<HashMap<(u64, String), HanaConnection>>> = OnceLock::new();

fn pool() -> &'static Mutex<HashMap<(u64, String), HanaConnection>> {
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `session_id == 0` means "no session" — never pooled.
const NO_SESSION: u64 = 0;

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
    let mut pool = pool().lock().expect("HANA session pool mutex poisoned");

    if let Some(conn) = pool.get(&key) {
        // is_broken() -> HdbResult<bool>; treat an error as broken.
        let broken = conn.is_broken().unwrap_or(true);
        if !broken {
            return Ok(conn.clone());
        }
        pool.remove(&key);
    }

    let conn = HanaConnection::new(url.to_string())?;
    pool.insert(key, conn.clone());
    Ok(conn)
}

/// Drop every cached connection for this session. Returns how many were removed.
/// Dropping the connection closes the HANA session, discarding its `#temp` tables.
pub fn evict(session_id: u64) -> usize {
    if session_id == NO_SESSION {
        return 0;
    }
    let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
    let before = pool.len();
    pool.retain(|(sid, _url), _conn| *sid != session_id);
    before - pool.len()
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
}
