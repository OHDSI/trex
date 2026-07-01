use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeId},
    vscalar::{ScalarFunctionSignature, VScalar},
    vtab::arrow::WritableVector,
};
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

    // Fast path: return a live cached connection. is_broken() is a local check,
    // safe to run under the lock; a broken entry is dropped so we reconnect below.
    {
        let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
        if let Some(conn) = pool.get(&key) {
            if !conn.is_broken().unwrap_or(true) {
                return Ok(conn.clone());
            }
            pool.remove(&key);
        }
    }

    // Connect without holding the lock so a slow HANA handshake never blocks other
    // sessions or disconnect-time eviction. Re-lock only to publish; if another
    // thread published first, keep theirs and drop our duplicate.
    let conn = HanaConnection::new(url.to_string())?;
    let mut pool = pool().lock().expect("HANA session pool mutex poisoned");
    Ok(pool.entry(key).or_insert(conn).clone())
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
}
