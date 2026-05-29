use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Trace = 5,
}

impl LogLevel {
    pub fn from_str(s: &str) -> LogLevel {
        match s.to_uppercase().as_str() {
            "ERROR" => LogLevel::Error,
            "WARN" | "WARNING" => LogLevel::Warn,
            "INFO" => LogLevel::Info,
            "DEBUG" => LogLevel::Debug,
            "TRACE" => LogLevel::Trace,
            _ => LogLevel::Info,
        }
    }

    pub fn current() -> LogLevel {
        env::var("SWARM_LOG_LEVEL")
            .map(|s| LogLevel::from_str(&s))
            .unwrap_or(LogLevel::Info)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Error => "ERROR",
            LogLevel::Warn => "WARN",
            LogLevel::Info => "INFO",
            LogLevel::Debug => "DEBUG",
            LogLevel::Trace => "TRACE",
        }
    }
}

pub struct SwarmLogger;

impl SwarmLogger {
    fn timestamp() -> String {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let secs = duration.as_secs();
        let millis = duration.subsec_millis();
        format!("{}.{:03}", secs, millis)
    }

    /// Redact known sensitive patterns (passwords, tokens, credentials) from log messages.
    fn sanitize(message: &str) -> String {
        let mut result = message.to_string();
        // Redact password=... or password: ... patterns (case-insensitive)
        let patterns = [
            "password", "passwd", "secret", "token", "credential", "authorization",
        ];
        for pat in &patterns {
            // Match pattern followed by = or : or space, then a value (up to whitespace or quote)
            let lower = result.to_lowercase();
            let mut start = 0;
            while let Some(idx) = lower[start..].find(pat) {
                let abs_idx = start + idx;
                let after_key = abs_idx + pat.len();
                if after_key < result.len() {
                    let rest = &result[after_key..];
                    // Check for separator: =, :, or whitespace followed by value
                    if let Some(first_char) = rest.chars().next() {
                        if first_char == '=' || first_char == ':' {
                            let value_start = after_key + 1;
                            // Skip optional quotes/spaces
                            let value_bytes = result[value_start..].as_bytes();
                            let mut vs = 0;
                            while vs < value_bytes.len() && (value_bytes[vs] == b' ' || value_bytes[vs] == b'\'' || value_bytes[vs] == b'"') {
                                vs += 1;
                            }
                            let actual_start = value_start + vs;
                            // Find end of value
                            let mut ve = actual_start;
                            while ve < result.len() {
                                let c = result.as_bytes()[ve];
                                if c == b' ' || c == b'\'' || c == b'"' || c == b',' || c == b';' || c == b'\n' || c == b')' {
                                    break;
                                }
                                ve += 1;
                            }
                            if ve > actual_start {
                                result.replace_range(actual_start..ve, "[REDACTED]");
                            }
                        }
                    }
                }
                start = abs_idx + 1;
            }
        }
        result
    }

    pub fn log(level: LogLevel, category: &str, message: &str) {
        if level > LogLevel::current() {
            return;
        }
        let timestamp = Self::timestamp();
        let sanitized = Self::sanitize(message);
        eprintln!(
            "[{}] [{}] [{}] {}",
            timestamp,
            level.as_str(),
            category,
            sanitized
        );
    }

    pub fn log_with_context(
        level: LogLevel,
        category: &str,
        context: &[(&str, &str)],
        message: &str,
    ) {
        if level > LogLevel::current() {
            return;
        }
        let timestamp = Self::timestamp();
        let ctx_str = context
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join(" ");
        let sanitized_ctx = Self::sanitize(&ctx_str);
        let sanitized_msg = Self::sanitize(message);
        eprintln!(
            "[{}] [{}] [{}] [{}] {}",
            timestamp,
            level.as_str(),
            category,
            sanitized_ctx,
            sanitized_msg
        );
    }

    pub fn error(category: &str, message: &str) {
        Self::log(LogLevel::Error, category, message);
    }

    pub fn warn(category: &str, message: &str) {
        Self::log(LogLevel::Warn, category, message);
    }

    pub fn info(category: &str, message: &str) {
        Self::log(LogLevel::Info, category, message);
    }

    pub fn debug(category: &str, message: &str) {
        Self::log(LogLevel::Debug, category, message);
    }

    pub fn trace(category: &str, message: &str) {
        Self::log(LogLevel::Trace, category, message);
    }
}

#[macro_export]
macro_rules! swarm_error {
    ($category:expr, $($arg:tt)*) => {
        $crate::logging::SwarmLogger::error($category, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! swarm_warn {
    ($category:expr, $($arg:tt)*) => {
        $crate::logging::SwarmLogger::warn($category, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! swarm_info {
    ($category:expr, $($arg:tt)*) => {
        $crate::logging::SwarmLogger::info($category, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! swarm_debug {
    ($category:expr, $($arg:tt)*) => {
        $crate::logging::SwarmLogger::debug($category, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! swarm_trace {
    ($category:expr, $($arg:tt)*) => {
        $crate::logging::SwarmLogger::trace($category, &format!($($arg)*))
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Tests touching SWARM_LOG_LEVEL share the process env; serialize.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn log_level_ordering() {
        assert!(LogLevel::Error < LogLevel::Warn);
        assert!(LogLevel::Warn < LogLevel::Info);
        assert!(LogLevel::Info < LogLevel::Debug);
        assert!(LogLevel::Debug < LogLevel::Trace);
    }

    #[test]
    fn log_level_from_str_known_values() {
        assert_eq!(LogLevel::from_str("ERROR"), LogLevel::Error);
        assert_eq!(LogLevel::from_str("error"), LogLevel::Error);
        assert_eq!(LogLevel::from_str("WARN"), LogLevel::Warn);
        assert_eq!(LogLevel::from_str("WARNING"), LogLevel::Warn);
        assert_eq!(LogLevel::from_str("warning"), LogLevel::Warn);
        assert_eq!(LogLevel::from_str("INFO"), LogLevel::Info);
        assert_eq!(LogLevel::from_str("DEBUG"), LogLevel::Debug);
        assert_eq!(LogLevel::from_str("trace"), LogLevel::Trace);
    }

    #[test]
    fn log_level_from_str_unknown_defaults_to_info() {
        assert_eq!(LogLevel::from_str("verbose"), LogLevel::Info);
        assert_eq!(LogLevel::from_str(""), LogLevel::Info);
        assert_eq!(LogLevel::from_str("garbage"), LogLevel::Info);
    }

    #[test]
    fn log_level_as_str_roundtrip() {
        for level in &[
            LogLevel::Error,
            LogLevel::Warn,
            LogLevel::Info,
            LogLevel::Debug,
            LogLevel::Trace,
        ] {
            assert_eq!(LogLevel::from_str(level.as_str()), *level);
        }
    }

    #[test]
    #[serial_test::serial]
    fn log_level_current_uses_env() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: env mutation serialized via ENV_LOCK
        unsafe {
            std::env::set_var("SWARM_LOG_LEVEL", "WARN");
        }
        assert_eq!(LogLevel::current(), LogLevel::Warn);
        unsafe {
            std::env::set_var("SWARM_LOG_LEVEL", "TRACE");
        }
        assert_eq!(LogLevel::current(), LogLevel::Trace);
        unsafe {
            std::env::remove_var("SWARM_LOG_LEVEL");
        }
        assert_eq!(LogLevel::current(), LogLevel::Info);
    }

    #[test]
    #[serial_test::serial]
    fn log_level_current_invalid_falls_back_to_info() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: env mutation serialized via ENV_LOCK
        unsafe {
            std::env::set_var("SWARM_LOG_LEVEL", "not_a_level");
        }
        assert_eq!(LogLevel::current(), LogLevel::Info);
        unsafe {
            std::env::remove_var("SWARM_LOG_LEVEL");
        }
    }

    #[test]
    fn sanitize_redacts_password_equals_value() {
        let s = SwarmLogger::sanitize("user=alice password=hunter2 other=stuff");
        assert!(s.contains("password=[REDACTED]"), "got: {s}");
        assert!(!s.contains("hunter2"), "got: {s}");
        assert!(s.contains("user=alice"), "got: {s}");
    }

    #[test]
    fn sanitize_redacts_password_colon_value() {
        let s = SwarmLogger::sanitize("password:hunter2 trailing");
        assert!(s.contains("password:[REDACTED]"), "got: {s}");
        assert!(!s.contains("hunter2"));
    }

    #[test]
    fn sanitize_redacts_token_and_secret_and_credential() {
        let s = SwarmLogger::sanitize("token=abc secret=xyz credential=lmn");
        assert!(s.contains("token=[REDACTED]"));
        assert!(s.contains("secret=[REDACTED]"));
        assert!(s.contains("credential=[REDACTED]"));
        assert!(!s.contains("abc"));
        assert!(!s.contains("xyz"));
        assert!(!s.contains("lmn"));
    }

    #[test]
    fn sanitize_handles_case_insensitive_pattern() {
        let s = SwarmLogger::sanitize("PASSWORD=top_secret");
        assert!(!s.contains("top_secret"), "got: {s}");
    }

    #[test]
    fn sanitize_leaves_unrelated_text_untouched() {
        let s = SwarmLogger::sanitize("starting server on host:port=8815");
        // 'password' / 'token' / etc. not present so nothing is redacted
        assert_eq!(s, "starting server on host:port=8815");
    }

    #[test]
    fn sanitize_redacts_quoted_value() {
        let s = SwarmLogger::sanitize("password='hunter2' more");
        assert!(!s.contains("hunter2"), "got: {s}");
    }

    #[test]
    fn timestamp_is_non_empty_and_contains_dot() {
        let ts = SwarmLogger::timestamp();
        assert!(!ts.is_empty());
        assert!(ts.contains('.'), "got: {ts}");
    }

    #[test]
    #[serial_test::serial]
    fn log_filters_below_current_level() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // SAFETY: env mutation serialized via ENV_LOCK
        unsafe {
            std::env::set_var("SWARM_LOG_LEVEL", "ERROR");
        }
        // These should be filtered out -- mostly we're checking they don't panic.
        SwarmLogger::log(LogLevel::Debug, "test", "should be filtered");
        SwarmLogger::log(LogLevel::Info, "test", "should be filtered");
        SwarmLogger::log_with_context(
            LogLevel::Debug,
            "test",
            &[("k", "v")],
            "should be filtered",
        );
        // This one passes the level filter:
        SwarmLogger::log(LogLevel::Error, "test", "should emit");
        SwarmLogger::log_with_context(
            LogLevel::Error,
            "test",
            &[("k", "v")],
            "should emit",
        );
        unsafe {
            std::env::remove_var("SWARM_LOG_LEVEL");
        }
    }

    #[test]
    fn level_helper_methods_do_not_panic() {
        // Just exercise each helper for line coverage.
        SwarmLogger::error("cat", "e");
        SwarmLogger::warn("cat", "w");
        SwarmLogger::info("cat", "i");
        SwarmLogger::debug("cat", "d");
        SwarmLogger::trace("cat", "t");
    }
}
