use chdb_rust::query_result::QueryResult;

/// Trait abstracting over a chdb-style query result so that `SafeQueryResult`
/// can be unit-tested with an in-process fake (which can panic deterministically)
/// without depending on a real chdb session.
pub trait QueryResultLike {
    fn data_utf8(&self) -> Result<String, Box<dyn std::error::Error>>;
    fn data_utf8_lossy(&self) -> String;
    fn rows_read(&self) -> u64;
    fn bytes_read(&self) -> u64;
    fn elapsed(&self) -> std::time::Duration;
}

impl QueryResultLike for QueryResult {
    fn data_utf8(&self) -> Result<String, Box<dyn std::error::Error>> {
        QueryResult::data_utf8(self).map_err(|e| -> Box<dyn std::error::Error> {
            format!("{}", e).into()
        })
    }

    fn data_utf8_lossy(&self) -> String {
        QueryResult::data_utf8_lossy(self).to_string()
    }

    fn rows_read(&self) -> u64 {
        QueryResult::rows_read(self)
    }

    fn bytes_read(&self) -> u64 {
        QueryResult::bytes_read(self)
    }

    fn elapsed(&self) -> std::time::Duration {
        QueryResult::elapsed(self)
    }
}

pub struct SafeQueryResult<T: QueryResultLike = QueryResult> {
    inner: T,
}

impl<T: QueryResultLike> SafeQueryResult<T> {
    pub fn new(result: T) -> Self {
        Self { inner: result }
    }

    pub fn safe_data_utf8(&self) -> Result<String, Box<dyn std::error::Error>> {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.inner.data_utf8()
        })) {
            Ok(result) => result.map_err(|e| format!("Data access error: {}", e).into()),
            Err(_) => self.fallback_data_access()
        }
    }

    fn fallback_data_access(&self) -> Result<String, Box<dyn std::error::Error>> {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.inner.data_utf8_lossy()
        })) {
            Ok(result) => Ok(result),
            Err(_) => Err("Result data corrupted".into())
        }
    }

    pub fn rows_read(&self) -> u64 {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.inner.rows_read()
        })) {
            Ok(rows) => rows,
            Err(_) => 0,
        }
    }

    pub fn bytes_read(&self) -> u64 {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.inner.bytes_read()
        })) {
            Ok(bytes) => bytes,
            Err(_) => 0,
        }
    }

    pub fn elapsed(&self) -> std::time::Duration {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.inner.elapsed()
        })) {
            Ok(duration) => duration,
            Err(_) => std::time::Duration::from_secs(0),
        }
    }
}

pub fn safe_execute_query(
    session: &chdb_rust::session::Session,
    query: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        session.execute(query, None)
    })) {
        Ok(result) => {
            match result {
                Ok(query_result) => {
                    let safe_result = SafeQueryResult::new(query_result);
                    safe_result.safe_data_utf8()
                },
                Err(e) => Err(format!("Execution error: {}", e).into()),
            }
        },
        Err(_) => Err("Execution panic".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::time::Duration;

    /// A configurable fake that lets each method panic or return a value.
    #[derive(Default)]
    struct PanickingResult {
        panic_on_data_utf8: bool,
        panic_on_data_utf8_lossy: bool,
        panic_on_rows_read: bool,
        panic_on_bytes_read: bool,
        panic_on_elapsed: bool,
        data_utf8_value: Option<String>,
        data_utf8_lossy_value: String,
        rows_read_value: u64,
        bytes_read_value: u64,
        elapsed_value: Duration,
        // For assertions about which paths were taken.
        data_utf8_calls: Cell<u32>,
        data_utf8_lossy_calls: Cell<u32>,
    }

    impl QueryResultLike for PanickingResult {
        fn data_utf8(&self) -> Result<String, Box<dyn std::error::Error>> {
            self.data_utf8_calls.set(self.data_utf8_calls.get() + 1);
            if self.panic_on_data_utf8 {
                panic!("forced panic in data_utf8");
            }
            Ok(self.data_utf8_value.clone().unwrap_or_default())
        }

        fn data_utf8_lossy(&self) -> String {
            self.data_utf8_lossy_calls
                .set(self.data_utf8_lossy_calls.get() + 1);
            if self.panic_on_data_utf8_lossy {
                panic!("forced panic in data_utf8_lossy");
            }
            self.data_utf8_lossy_value.clone()
        }

        fn rows_read(&self) -> u64 {
            if self.panic_on_rows_read {
                panic!("forced panic in rows_read");
            }
            self.rows_read_value
        }

        fn bytes_read(&self) -> u64 {
            if self.panic_on_bytes_read {
                panic!("forced panic in bytes_read");
            }
            self.bytes_read_value
        }

        fn elapsed(&self) -> Duration {
            if self.panic_on_elapsed {
                panic!("forced panic in elapsed");
            }
            self.elapsed_value
        }
    }

    #[test]
    fn safe_data_utf8_returns_primary_value_when_no_panic() {
        let fake = PanickingResult {
            data_utf8_value: Some("primary".to_string()),
            data_utf8_lossy_value: "lossy".to_string(),
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let got = safe.safe_data_utf8().expect("should succeed");
        assert_eq!(got, "primary");
    }

    #[test]
    fn safe_data_utf8_falls_back_to_lossy_when_primary_panics() {
        let fake = PanickingResult {
            panic_on_data_utf8: true,
            data_utf8_lossy_value: "lossy-fallback".to_string(),
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let got = safe.safe_data_utf8().expect("should fall back");
        assert_eq!(got, "lossy-fallback");
        assert_eq!(safe.inner.data_utf8_lossy_calls.get(), 1);
    }

    #[test]
    fn safe_data_utf8_errors_when_both_paths_panic() {
        let fake = PanickingResult {
            panic_on_data_utf8: true,
            panic_on_data_utf8_lossy: true,
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let err = safe.safe_data_utf8().expect_err("should error");
        assert!(format!("{}", err).contains("corrupted"));
    }

    #[test]
    fn rows_read_returns_zero_when_underlying_panics() {
        let fake = PanickingResult {
            panic_on_rows_read: true,
            rows_read_value: 999,
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let got = safe.rows_read();
        assert_eq!(got, 0);
    }

    #[test]
    fn rows_read_returns_value_when_underlying_does_not_panic() {
        let fake = PanickingResult {
            rows_read_value: 42,
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        assert_eq!(safe.rows_read(), 42);
    }

    #[test]
    fn bytes_read_returns_value_when_underlying_does_not_panic() {
        let fake = PanickingResult {
            bytes_read_value: 12345,
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        assert_eq!(safe.bytes_read(), 12345);
    }

    #[test]
    fn bytes_read_returns_zero_when_underlying_panics() {
        let fake = PanickingResult {
            panic_on_bytes_read: true,
            bytes_read_value: 7,
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let got = safe.bytes_read();
        assert_eq!(got, 0);
    }

    #[test]
    fn elapsed_returns_zero_duration_on_panic() {
        let fake = PanickingResult {
            panic_on_elapsed: true,
            elapsed_value: Duration::from_secs(5),
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        let got = safe.elapsed();
        assert_eq!(got, Duration::from_secs(0));
    }

    #[test]
    fn elapsed_returns_value_when_underlying_does_not_panic() {
        let fake = PanickingResult {
            elapsed_value: Duration::from_millis(750),
            ..Default::default()
        };
        let safe = SafeQueryResult::new(fake);
        assert_eq!(safe.elapsed(), Duration::from_millis(750));
    }
}
