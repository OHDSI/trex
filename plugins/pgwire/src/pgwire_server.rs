use std::panic::{self, AssertUnwindSafe};
use std::sync::{Arc, Once};
use std::thread;
use std::time::SystemTime;

/// rustls 0.23+ requires a CryptoProvider be installed before any TLS handshake.
/// The pgwire crate's `server-api-aws-lc-rs` feature pulls in `aws-lc-rs`, while
/// other transitive deps pull `ring` — both providers are linked, so auto-selection
/// panics. We install `ring` explicitly (matches etl/db plugins for consistency).
///
/// Currently no TLS path in this crate exercises pgwire's TLS handshake. If a future
/// change enables the pgwire `ssl/tls` feature or adds a tokio-rustls listener,
/// call `ensure_crypto_provider()` from the TLS-enabling entry point — for example,
/// at the top of `start_pgwire_server_capi` (or any new `start_pgwire_server_tls`
/// variant) before binding the listener.
static CRYPTO_INIT: Once = Once::new();

#[allow(dead_code)]
pub(crate) fn ensure_crypto_provider() {
    CRYPTO_INIT.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

use duckdb::arrow::datatypes::Schema;
use duckdb::arrow::record_batch::RecordBatch;
use duckdb::params;
use async_trait::async_trait;
use futures::stream;
use serde_json;
use base64::{Engine as _, engine::general_purpose};

use pgwire::api::auth::StartupHandler;
use pgwire::api::auth::sasl::SASLAuthStartupHandler;
use pgwire::api::auth::sasl::scram::{gen_salted_password, ScramAuth};
use pgwire::api::auth::{AuthSource, DefaultServerParameterProvider, LoginInfo, Password};
use pgwire::api::query::{ExtendedQueryHandler, SimpleQueryHandler};
use pgwire::api::stmt::NoopQueryParser;
use pgwire::api::results::{Response, Tag, QueryResponse, DescribeStatementResponse, DescribePortalResponse, FieldInfo};
use pgwire::api::{PgWireServerHandlers, ClientInfo, Type};
use pgwire::api::portal::{Portal, Format};
use pgwire::api::stmt::StoredStatement;
use pgwire::error::{ErrorInfo, PgWireError, PgWireResult};
use pgwire::tokio::process_socket;

use tokio::net::TcpListener;
use tokio::sync::oneshot;

use arrow_pg::datatypes::{encode_recordbatch, into_pg_type};

use crate::get_describe_connection;
use crate::server_registry::{ServerHandle, ServerRegistry};

const DEBUG_LOGGING: bool = false;

#[inline]
fn log_debug(_msg: &str) {
    #[cfg(debug_assertions)]
    if DEBUG_LOGGING {
        eprintln!("[pgwire] {}", sanitize_log_message(_msg));
    }
}

/// Redact credentials from connection URLs and sensitive key=value patterns in log messages.
#[allow(dead_code)]
pub(crate) fn sanitize_log_message(msg: &str) -> String {
    // Redact credentials in connection URLs like hdbsql://user:pass@host
    let mut result = msg.to_string();
    // Pattern: protocol://user:password@host
    if let Some(proto_end) = result.find("://") {
        let after_proto = proto_end + 3;
        if let Some(at_pos) = result[after_proto..].find('@') {
            let abs_at = after_proto + at_pos;
            // Replace the user:password portion with [REDACTED]
            result.replace_range(after_proto..abs_at, "[REDACTED]");
        }
    }
    result
}

const SCRAM_ITERATIONS: usize = 4096;

#[derive(Clone)]
pub struct HanaCredentials {
    pub host: String,
    pub port: u16,
    pub name: String,
    pub username: String,
    pub password: String,
}

impl std::fmt::Debug for HanaCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HanaCredentials")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("name", &self.name)
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug)]
pub enum DatabaseAction {
    SetDatabase,
    UseHana(HanaCredentials),
    Skip,
}

pub fn check_database_action(database_name: &str, db_credentials: &str) -> DatabaseAction {
    if let Ok(decoded_bytes) = general_purpose::STANDARD.decode(db_credentials) {
        if let Ok(decoded_str) = String::from_utf8(decoded_bytes) {
            if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&decoded_str) {
                if let Some(databases) = json_value.as_array() {
                    for db in databases {
                        if let Some(db_id) = db.get("id").and_then(|v| v.as_str()) {
                            if db_id == database_name {
                                if let Some(dialect) = db.get("dialect").and_then(|v| v.as_str()) {
                                    if dialect == "hana" {
                                        if let (Some(host), Some(port), Some(name)) = (
                                            db.get("host").and_then(|v| v.as_str()),
                                            db.get("port").and_then(|v| v.as_u64()),
                                            db.get("name").and_then(|v| v.as_str())
                                        ) {
                                            if let Some(credentials_array) = db.get("credentials").and_then(|v| v.as_array()) {
                                                for cred in credentials_array {
                                                    if let Some(user_scope) = cred.get("userScope").and_then(|v| v.as_str()) {
                                                        if user_scope == "Admin" {
                                                            if let (Some(username), Some(password)) = (
                                                                cred.get("username").and_then(|v| v.as_str()),
                                                                cred.get("password").and_then(|v| v.as_str())
                                                            ) {
                                                                return DatabaseAction::UseHana(HanaCredentials {
                                                                    host: host.to_string(),
                                                                    port: port as u16,
                                                                    name: name.to_string(),
                                                                    username: username.to_string(),
                                                                    password: password.to_string(),
                                                                });
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        return DatabaseAction::Skip;
                                    } else {
                                        return DatabaseAction::SetDatabase;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    DatabaseAction::Skip
}

pub(crate) fn get_hana_credentials_if_available(
    database: &Option<String>,
    server_host: &str,
    server_port: u16,
) -> Option<HanaCredentials> {
    if let Some(db) = database {
        if let Some(db_credentials) = ServerRegistry::instance().get_db_credentials(server_host, server_port) {
            match check_database_action(db, &db_credentials) {
                DatabaseAction::UseHana(hana_creds) => {
                    Some(hana_creds)
                }
                _ => None
            }
        } else {
            None
        }
    } else {
        None
    }
}

/// Strip leading whitespace and SQL comments (`--` line and `/* */` block) so the
/// read-vs-write detection sees the first real keyword. SqlRender-generated SQL
/// (e.g. OHDSI DQD checks) prefixes every statement with a `/* ... */` header, so
/// without this a `SELECT` is misclassified as a write and never wrapped as a
/// `trex_hana_scan` read.
fn strip_leading_sql_noise(query: &str) -> &str {
    let mut rest = query.trim_start();
    loop {
        if let Some(after) = rest.strip_prefix("--") {
            rest = match after.find('\n') {
                Some(nl) => after[nl + 1..].trim_start(),
                None => "",
            };
        } else if let Some(after) = rest.strip_prefix("/*") {
            rest = match after.find("*/") {
                Some(end) => after[end + 2..].trim_start(),
                None => "",
            };
        } else {
            return rest;
        }
    }
}

pub(crate) fn wrap_query_for_hana(query: &str, hana_creds: &HanaCredentials, session_id: u64) -> String {
    let escaped_query = query.replace("'", "''");
    let escaped_username = hana_creds.username.replace("'", "''");
    let escaped_password = hana_creds.password.replace("'", "''");
    let escaped_host = hana_creds.host.replace("'", "''");
    let escaped_name = hana_creds.name.replace("'", "''");

    let leading = strip_leading_sql_noise(query).to_uppercase();
    if leading.starts_with("SELECT") || leading.starts_with("WITH") {
        // Read path: trex_hana_scan(query, url) returns a result set. The
        // `session_id` NAMED arg reuses the client session's HANA connection
        // (duckdb table functions can't overload by arity, hence a named arg).
        format!(
            "SELECT * FROM trex_hana_scan('{}', 'hdbsql://{}:{}@{}:{}/{}', session_id => '{}')",
            escaped_query,
            escaped_username,
            escaped_password,
            escaped_host,
            hana_creds.port,
            escaped_name,
            session_id
        )
    } else {
        // Write path: trex_hana_execute(connection_url, sql, session_id) -- URL
        // first, runs DML/DDL. `session_id` is the optional positional 3rd arg.
        format!(
            "SELECT trex_hana_execute('hdbsql://{}:{}@{}:{}/{}', '{}', '{}')",
            escaped_username,
            escaped_password,
            escaped_host,
            hana_creds.port,
            escaped_name,
            escaped_query,
            session_id
        )
    }
}

/// HANA sets session variables with a single-quoted name — `SET 'APPLICATION' =
/// 'x'`. Postgres and DuckDB require an identifier there, so the quoted form
/// unambiguously belongs to HANA and must be shipped through the passthrough
/// wrap. `UNSET '<NAME>'` already passes through: it does not begin with `SET`.
pub(crate) fn is_hana_session_variable_set(sql: &str) -> bool {
    let rest = strip_leading_sql_noise(sql).trim_start();
    let rest = match rest.get(..4) {
        Some(head) if head.eq_ignore_ascii_case("SET ") => &rest[4..],
        _ => return false,
    };
    let rest = rest.trim_start();
    // `SET SESSION '<NAME>' = ...` is equivalent to `SET '<NAME>' = ...`.
    let rest = match rest.get(..8) {
        Some(head) if head.eq_ignore_ascii_case("SESSION ") => rest[8..].trim_start(),
        _ => rest,
    };
    rest.starts_with('\'')
}

/// Transaction- and session-control statements manage the local DuckDB session
/// (and the pgwire connection's transaction/settings state), so they must run on
/// DuckDB directly and never be shipped to HANA through the passthrough wrap.
/// Drivers emit these implicitly — e.g. the Postgres JDBC driver sends `BEGIN`
/// on connect and Achilles issues `SET memory_limit = ...` — and HANA rejects
/// them. Matched after stripping leading whitespace/comments. HANA's own
/// `SET '<NAME>' = '<value>'` form is excluded — see `is_hana_session_variable_set`.
pub(crate) fn is_local_session_statement(sql: &str) -> bool {
    // HANA session-variable assignments must reach HANA, not the local session.
    if is_hana_session_variable_set(sql) {
        return false;
    }
    let upper = strip_leading_sql_noise(sql).trim_start().to_uppercase();
    const KEYWORDS: &[&str] = &[
        "BEGIN", "START TRANSACTION", "COMMIT", "END", "ROLLBACK", "ABORT",
        "SAVEPOINT", "RELEASE", "SET", "RESET", "SHOW", "DISCARD", "DEALLOCATE",
        "PRAGMA", "USE",
    ];
    KEYWORDS.iter().any(|kw| {
        upper == *kw
            || upper.strip_prefix(*kw).is_some_and(|rest| {
                rest.starts_with([' ', '\t', '\n', '\r', ';'])
            })
    })
}

pub(crate) fn execute_with_fallback<F, R>(
    primary_query: &str,
    fallback_query: Option<&str>,
    operation: F,
) -> Result<R, duckdb::Error>
where
    F: Fn(&str) -> Result<R, duckdb::Error>,
{
    let result = operation(primary_query);

    if let Err(ref primary_err) = result {
        if let Some(fb) = fallback_query {
            // For HANA writes/DDL (`trex_hana_execute`) the raw fallback only masks
            // the real failure behind a misleading "Schema does not exist" error,
            // so propagate the primary error.
            if primary_query.contains("trex_hana_execute") {
                return result;
            }
            // For the HANA read wrap (`trex_hana_scan`) the raw fallback is only
            // legitimate for system-catalog/metadata statements the JDBC driver
            // issues against pg_catalog/information_schema, which DuckDB can answer.
            // For a real table read (e.g. an OHDSI DQD check), falling back to raw
            // DuckDB just replaces the actual HANA error with a misleading
            // "Table does not exist", so propagate the primary error instead.
            if primary_query.contains("trex_hana_scan") && !is_metadata_query(fb) {
                return result;
            }
            log_debug(&format!(
                "HANA passthrough primary query failed, falling back: {primary_err} | query: {primary_query}"
            ));
            return operation(fb);
        }
    }
    result
}

/// Heuristic: does this statement target Postgres system catalogs / metadata
/// (the views the JDBC driver and clients introspect), as opposed to a user
/// table read? Used to decide whether a failed HANA read wrap may legitimately
/// fall back to raw DuckDB.
fn is_metadata_query(sql: &str) -> bool {
    let lower = sql.to_lowercase();
    lower.contains("pg_catalog")
        || lower.contains("information_schema")
        || lower.contains("pg_class")
        || lower.contains("pg_namespace")
        || lower.contains("pg_type")
        || lower.contains("pg_attribute")
}

/// Word-boundary keywords used to keep `BEGIN…END` blocks intact while splitting.
fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Resolve a completed word against block state.
/// `pending_end` means the previous word was a bare `END` whose role
/// (block-close vs `END IF`/`END WHILE`/…) was not yet known.
///
/// Known limitation: only `BEGIN`/`END` are tracked. A `CASE` expression
/// (which ends in a bare `END`) inside a block, or a bare transaction
/// `BEGIN` in a multi-statement string, can mis-track depth. Neither occurs
/// in the SqlRender HANA output this guards (`DO BEGIN IF EXISTS … END IF; END;`).
fn classify_word(word: &str, block_depth: &mut u32, pending_end: &mut bool) {
    if word.is_empty() {
        return;
    }
    if *pending_end {
        // The previous token was `END`. This word decides its meaning.
        const CONTROL_TERMINATORS: &[&str] = &["if", "case", "loop", "while", "for"];
        *pending_end = false;
        if CONTROL_TERMINATORS.contains(&word) {
            // `END IF` / `END WHILE` / … — closes a control structure, not the block.
            return;
        }
        // The previous `END` closed a BEGIN block.
        *block_depth = block_depth.saturating_sub(1);
        // Fall through: this word may itself be BEGIN/END.
    }
    match word {
        "begin" => *block_depth += 1,
        "end" => *pending_end = true,
        _ => {}
    }
}

/// Split a (possibly multi-statement) query on `;`, ignoring separators that
/// fall inside single-/double-quoted literals or `--` / `/* */` comments, and
/// never splitting on a `;` inside a `BEGIN…END` block (HANA anonymous blocks).
/// Mirrors the splitter in the hana plugin
/// (`plugins/hana/src/hana_execute.rs`); kept local because the pgwire crate
/// does not depend on the hana crate. Trims each statement and drops empties.
pub(crate) fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current_statement = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    // BEGIN…END block tracking so inner `;` (HANA `DO BEGIN … END;`) never splits.
    let mut block_depth: u32 = 0;
    let mut word = String::new();
    let mut pending_end = false;

    while let Some(c) = chars.next() {
        if in_single_quote {
            current_statement.push(c);
            if c == '\'' {
                if chars.peek() == Some(&'\'') {
                    current_statement.push(chars.next().unwrap());
                } else {
                    in_single_quote = false;
                }
            }
            continue;
        }
        if in_double_quote {
            current_statement.push(c);
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current_statement.push(chars.next().unwrap());
                } else {
                    in_double_quote = false;
                }
            }
            continue;
        }

        // Accumulate words for BEGIN/END detection; flush at any non-word char.
        if is_word_char(c) {
            word.push(c.to_ascii_lowercase());
            current_statement.push(c);
            continue;
        }
        // Non-word char: finish the pending word first.
        classify_word(&word, &mut block_depth, &mut pending_end);
        word.clear();

        match c {
            '-' if chars.peek() == Some(&'-') => {
                chars.next();
                for c2 in chars.by_ref() {
                    if c2 == '\n' {
                        current_statement.push('\n');
                        break;
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                chars.next();
                let mut depth = 1u32;
                while depth > 0 {
                    match chars.next() {
                        Some('*') if chars.peek() == Some(&'/') => {
                            chars.next();
                            depth -= 1;
                        }
                        Some('/') if chars.peek() == Some(&'*') => {
                            chars.next();
                            depth += 1;
                        }
                        None => break,
                        _ => {}
                    }
                }
            }
            '\'' => {
                current_statement.push(c);
                in_single_quote = true;
            }
            '"' => {
                current_statement.push(c);
                in_double_quote = true;
            }
            ';' => {
                // A bare `END` immediately before `;` (e.g. `END;`) resolves here.
                if pending_end {
                    block_depth = block_depth.saturating_sub(1);
                    pending_end = false;
                }
                if block_depth > 0 {
                    // Inside a BEGIN…END block: keep the semicolon, don't split.
                    current_statement.push(';');
                } else {
                    let trimmed = current_statement.trim();
                    if !trimmed.is_empty() {
                        statements.push(trimmed.to_string());
                    }
                    current_statement.clear();
                }
            }
            _ => {
                current_statement.push(c);
            }
        }
    }

    // Flush any trailing word (does not affect output, only block state).
    classify_word(&word, &mut block_depth, &mut pending_end);

    let trimmed = current_statement.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }

    statements
}

/// Postgres-only session parameters that libpq, the JDBC driver, and other
/// standard Postgres clients SET on connect. DuckDB doesn't recognize them,
/// so without this intercept the very first statement of a JDBC handshake
/// fails with "Catalog Error: unrecognized configuration parameter".
pub(crate) fn is_postgres_only_set(sql: &str) -> bool {
    let s = sql.trim_start();
    if s.len() < 4 || !s[..4].eq_ignore_ascii_case("SET ") {
        return false;
    }
    let mut rest = s[4..].trim_start();
    // SET LOCAL <name> ... and SET SESSION <name> ... are also valid.
    for prefix in ["LOCAL ", "SESSION "] {
        if rest.len() >= prefix.len() && rest[..prefix.len()].eq_ignore_ascii_case(prefix) {
            rest = rest[prefix.len()..].trim_start();
            break;
        }
    }
    let rest = rest.trim_start_matches('"');
    let name: String = rest.chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_')
        .collect();
    matches!(
        name.to_ascii_uppercase().as_str(),
        "EXTRA_FLOAT_DIGITS"
            | "APPLICATION_NAME"
            | "CLIENT_ENCODING"
            | "DATESTYLE"
            | "INTERVALSTYLE"
            | "TIMEZONE"
            | "STATEMENT_TIMEOUT"
            | "STANDARD_CONFORMING_STRINGS"
            | "SEARCH_PATH"
            | "BYTEA_OUTPUT"
            | "ROW_SECURITY"
            | "SESSION_AUTHORIZATION"
    )
}

pub fn random_salt() -> Vec<u8> {
    Vec::from(rand::random::<[u8; 10]>())
}

pub struct SimpleAuthSource {
    required_password: String,
}

impl std::fmt::Debug for SimpleAuthSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SimpleAuthSource")
            .field("required_password", &"[REDACTED]")
            .finish()
    }
}

impl SimpleAuthSource {
    pub fn new(password: String) -> Self {
        Self {
            required_password: password,
        }
    }
}

#[async_trait]
impl AuthSource for SimpleAuthSource {
    async fn get_password(&self, _login_info: &LoginInfo) -> PgWireResult<Password> {
        let salt = random_salt();
        let hash_password = gen_salted_password(&self.required_password, salt.as_ref(), SCRAM_ITERATIONS);
        Ok(Password::new(Some(salt), hash_password))
    }
}

#[derive(Clone)]
pub struct TrexQueryHandler {
    server_host: String,
    server_port: u16,
    worker_id: usize,
    session_id: u64,
}

impl TrexQueryHandler {
    pub fn new(host: String, port: u16, worker_id: usize, session_id: u64) -> Self {
        Self {
            server_host: host,
            server_port: port,
            worker_id,
            session_id,
        }
    }
}

/// Convert trexsql statement columns to pgwire field info (for describe operations)
pub(crate) fn row_desc_from_stmt(stmt: &duckdb::Statement, format: &Format) -> PgWireResult<Vec<FieldInfo>> {
    let columns = stmt.column_count();
    if columns == 1 {
        let name = stmt.column_name(0).cloned().unwrap_or_default();
        let datatype = stmt.column_type(0);
        let pg = into_pg_type(&datatype).unwrap_or(Type::TEXT);
        if (name == "Success" && pg == Type::BOOL) || (name == "Count" && pg == Type::INT8) {
            return Ok(Vec::new());
        }
    }
    (0..columns)
        .map(|idx| {
            let datatype = stmt.column_type(idx);
            let name = stmt.column_name(idx).map_or("unknown".to_string(), |v| v.clone());
            Ok(FieldInfo::new(
                name.to_string(),
                None,
                None,
                into_pg_type(&datatype).unwrap_or(Type::TEXT),
                format.format_for(idx),
            ))
        })
        .collect()
}

/// Detects DuckDB's synthetic result schemas for statements that have no
/// user-visible output. DuckDB returns `Success: bool` for control statements
/// (BEGIN/COMMIT/ROLLBACK/USE/SET) and `Count: int64` for DDL/DML, while real
/// queries name their columns from the projection. Treating these as
/// CommandComplete is required for libpq-based clients (psycopg2) which
/// otherwise see a RowDescription where they expect none.
pub(crate) fn is_duckdb_non_query_schema(schema: &duckdb::arrow::datatypes::Schema) -> bool {
    use duckdb::arrow::datatypes::DataType;
    let fields = schema.fields();
    if fields.len() != 1 {
        return false;
    }
    let f = &fields[0];
    matches!(
        (f.name().as_str(), f.data_type()),
        ("Success", DataType::Boolean) | ("Count", DataType::Int64)
    )
}

/// Convert Arrow schema to pgwire field info.
///
/// The pg type is derived from the *original* Arrow data type (so TIMESTAMPTZ
/// columns advertise OID 1184 to the client) even when the column is later
/// cast to Utf8 by `rebuild_record_batch_for_pg` for safe text encoding.
pub(crate) fn schema_to_field_info(schema: &duckdb::arrow::datatypes::Schema, format: &Format) -> PgWireResult<Vec<FieldInfo>> {
    schema.fields().iter().enumerate().map(|(idx, field)| {
        let pg_type = arrow_type_to_pg_type(field.data_type());
        Ok(FieldInfo::new(
            field.name().clone(),
            None,
            None,
            pg_type,
            format.format_for(idx),
        ))
    }).collect()
}

/// Convert Arrow data type to PostgreSQL type
pub(crate) fn arrow_type_to_pg_type(arrow_type: &duckdb::arrow::datatypes::DataType) -> Type {
    use duckdb::arrow::datatypes::DataType;
    match arrow_type {
        DataType::Boolean => Type::BOOL,
        DataType::Int8 | DataType::Int16 => Type::INT2,
        DataType::Int32 => Type::INT4,
        DataType::Int64 => Type::INT8,
        DataType::UInt8 | DataType::UInt16 => Type::INT2,
        DataType::UInt32 => Type::INT4,
        DataType::UInt64 => Type::INT8,
        DataType::Float16 | DataType::Float32 => Type::FLOAT4,
        DataType::Float64 => Type::FLOAT8,
        DataType::Decimal128(_, _) | DataType::Decimal256(_, _) => Type::NUMERIC,
        DataType::Utf8 | DataType::LargeUtf8 => Type::TEXT,
        DataType::Date32 | DataType::Date64 => Type::DATE,
        // Timestamp WITH timezone -> TIMESTAMPTZ (OID 1184).
        // Timestamp WITHOUT timezone -> TIMESTAMP (OID 1114).
        // arrow-pg's encoder relies on this distinction to format the value
        // (it formats DateTime<FixedOffset> for TIMESTAMPTZ, NaiveDateTime
        // for TIMESTAMP). Returning TIMESTAMP for a tz-aware column makes
        // text-mode encoding produce a value with no offset, but more
        // importantly the column is also pre-cast to Utf8 below to avoid
        // arrow-pg's Tz::from_str path, which panics on DuckDB's UTC offset
        // tz strings (e.g. "+00:00") that chrono-tz cannot parse as IANA.
        DataType::Timestamp(_, Some(_)) => Type::TIMESTAMPTZ,
        DataType::Timestamp(_, None) => Type::TIMESTAMP,
        DataType::Time32(_) | DataType::Time64(_) => Type::TIME,
        DataType::Binary | DataType::LargeBinary => Type::BYTEA,
        _ => Type::TEXT,
    }
}

pub(crate) fn extract_panic_message(err: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = err.downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = err.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    }
}

/// True when arrow-pg's encoder cannot natively encode this Arrow type and
/// we must pre-cast the column to Utf8 so the row encodes as TEXT.
///
/// `Timestamp(unit, Some(tz))` (TIMESTAMPTZ) is included here because
/// arrow-pg's encoder produces a `chrono::DateTime<FixedOffset>` value but
/// pgwire's `to_sql_text` path for that value rejects any pg_type other
/// than `TIMESTAMPTZ` — and arrow-pg's earlier tz parsing layer also chokes
/// on DuckDB's UTC-offset strings ("+00:00", "UTC+08:00") in some chrono-tz
/// builds. The simplest, panic-free fix is to pre-cast the column to Utf8
/// using DuckDB's own ISO-8601 formatter; the wire field still advertises
/// OID 1184 (TIMESTAMPTZ) via `arrow_type_to_pg_type`, so clients see the
/// correct column type while we ship the bytes as text.
pub(crate) fn needs_string_cast(dt: &duckdb::arrow::datatypes::DataType) -> bool {
    use duckdb::arrow::datatypes::DataType;
    match dt {
        DataType::Float16
        | DataType::Decimal256(_, _)
        | DataType::FixedSizeBinary(_)
        | DataType::Map(_, _)
        | DataType::Union(_, _)
        | DataType::RunEndEncoded(_, _)
        // Nested/composite types: arrow-pg's encoder has no path for these
        // and hangs on them, and the wire type is already TEXT
        // (`arrow_type_to_pg_type` maps them via its `_ => TEXT` arm), so we
        // stringify via `format_array_as_utf8`. FHIR tables use List<Struct>
        // (name, address, telecom, identifier, …) and Struct (code, subject,
        // value[x]) extensively, so plain `SELECT`s hit this path.
        | DataType::Struct(_)
        | DataType::List(_)
        | DataType::LargeList(_)
        | DataType::FixedSizeList(_, _) => true,
        DataType::Timestamp(_, Some(_)) => true,
        // Decimal128 at any precision is routed through our own i128
        // formatter because arrow-pg's encoder calls
        // `rust_decimal::Decimal::try_from_i128_with_scale`, which aborts
        // (SIGTERM) when the underlying i128 exceeds rust_decimal's 96-bit
        // mantissa — i.e. on full-width DECIMAL(38, *) values. We pre-format
        // every Decimal128 so the column reaches arrow-pg as Utf8; the wire
        // type is still NUMERIC because `arrow_type_to_pg_type` keys off the
        // *original* schema in `schema_to_field_info`.
        DataType::Decimal128(_, _) => true,
        // Interval columns are routed through our own formatter because
        // arrow-pg's encoder for `DataType::Interval(_)` reads `value(idx)`
        // from the underlying buffer without first checking the validity
        // bitmap — so a SQL NULL row leaks the stale buffer slot to the wire
        // (e.g. "62206777 years 4 mons 31872 days"). Our formatter honours
        // the bitmap and emits a wire NULL instead.
        DataType::Interval(_) => true,
        DataType::Dictionary(_, value_type) => !matches!(
            value_type.as_ref(),
            DataType::Utf8 | DataType::LargeUtf8
        ),
        _ => false,
    }
}

/// Allowlist of Arrow types arrow-pg's encoder handles natively and safely.
///
/// `rebuild_record_batch_for_pg` stringifies every column whose type is NOT
/// on this list (via a dedicated formatter or `format_array_as_utf8`), so an
/// unanticipated or newly-introduced Arrow type can never reach arrow-pg and
/// hang the process. This is deliberately deny-by-default: `needs_string_cast`
/// enumerates types we *know* are problematic, but a type missing from both
/// lists (e.g. `Duration`, `Decimal32`, the `*View` types) must still be
/// treated as unsafe rather than passed through. When in doubt, not safe.
///
/// tz-aware `Timestamp` is intentionally excluded — it is rewritten by a
/// dedicated formatter (`format_timestamptz_as_utf8`), not passed through.
pub(crate) fn is_passthrough_safe(dt: &duckdb::arrow::datatypes::DataType) -> bool {
    use duckdb::arrow::datatypes::DataType;
    match dt {
        DataType::Null
        | DataType::Boolean
        | DataType::Int8
        | DataType::Int16
        | DataType::Int32
        | DataType::Int64
        | DataType::UInt8
        | DataType::UInt16
        | DataType::UInt32
        | DataType::UInt64
        | DataType::Float32
        | DataType::Float64
        | DataType::Utf8
        | DataType::LargeUtf8
        | DataType::Date32
        | DataType::Date64
        | DataType::Time32(_)
        | DataType::Time64(_)
        | DataType::Timestamp(_, None)
        | DataType::Binary
        | DataType::LargeBinary => true,
        // Dictionaries of text encode fine; other value types do not.
        DataType::Dictionary(_, value) => {
            matches!(value.as_ref(), DataType::Utf8 | DataType::LargeUtf8)
        }
        _ => false,
    }
}

/// Format a DuckDB TIMESTAMPTZ column as a Utf8 array of ISO-8601 strings.
///
/// DuckDB stores TIMESTAMPTZ as an i64 count of microseconds since the UNIX
/// epoch in UTC, regardless of the Arrow field's `tz` metadata (which can be
/// an IANA name like "Etc/UTC" or a fixed offset like "+00:00"). We avoid
/// arrow's generic `cast` here because arrow-array's `Tz::from_str` rejects
/// IANA names when the crate is built without the `chrono-tz` feature
/// (which is the case in this build). Parsing UTC microseconds with chrono
/// directly sidesteps the timezone-string parsing entirely.
///
/// The output values include a `+00` offset so the string is unambiguous on
/// the wire as a TIMESTAMPTZ literal.
pub(crate) fn format_timestamptz_as_utf8(
    arr: &dyn duckdb::arrow::array::Array,
    unit: &duckdb::arrow::datatypes::TimeUnit,
) -> duckdb::arrow::array::ArrayRef {
    use chrono::{DateTime, Utc};
    use duckdb::arrow::array::{ArrayRef, PrimitiveArray, StringArray};
    use duckdb::arrow::datatypes::{
        TimeUnit, TimestampMicrosecondType, TimestampMillisecondType,
        TimestampNanosecondType, TimestampSecondType,
    };

    let len = arr.len();
    let mut out: Vec<Option<String>> = Vec::with_capacity(len);
    for i in 0..len {
        if arr.is_null(i) {
            out.push(None);
            continue;
        }
        let micros: i64 = match unit {
            TimeUnit::Second => arr
                .as_any()
                .downcast_ref::<PrimitiveArray<TimestampSecondType>>()
                .map(|a| a.value(i).saturating_mul(1_000_000))
                .unwrap_or(0),
            TimeUnit::Millisecond => arr
                .as_any()
                .downcast_ref::<PrimitiveArray<TimestampMillisecondType>>()
                .map(|a| a.value(i).saturating_mul(1_000))
                .unwrap_or(0),
            TimeUnit::Microsecond => arr
                .as_any()
                .downcast_ref::<PrimitiveArray<TimestampMicrosecondType>>()
                .map(|a| a.value(i))
                .unwrap_or(0),
            TimeUnit::Nanosecond => arr
                .as_any()
                .downcast_ref::<PrimitiveArray<TimestampNanosecondType>>()
                .map(|a| a.value(i) / 1_000)
                .unwrap_or(0),
        };
        let secs = micros.div_euclid(1_000_000);
        let nsecs = (micros.rem_euclid(1_000_000) as u32) * 1_000;
        let dt = DateTime::<Utc>::from_timestamp(secs, nsecs).unwrap_or_else(|| {
            DateTime::<Utc>::from_timestamp(0, 0).expect("epoch is valid")
        });
        // Postgres TIMESTAMPTZ wire text is e.g. "2026-01-01 00:00:00.123456+00".
        out.push(Some(dt.format("%Y-%m-%d %H:%M:%S%.6f+00").to_string()));
    }
    let arr: ArrayRef = std::sync::Arc::new(StringArray::from(out));
    arr
}

/// Format an Arrow `Decimal128Array` as a Utf8 array of decimal strings.
///
/// arrow-pg's encoder routes `Decimal128(p, s)` through
/// `rust_decimal::Decimal::try_from_i128_with_scale`, which aborts on the
/// full 38-digit mantissa (rust_decimal only supports a 96-bit / ~28-digit
/// significand). We bypass that path entirely by formatting the underlying
/// i128 ourselves, honouring the column scale, sign, and validity bitmap.
///
/// The wire field type stays NUMERIC because `arrow_type_to_pg_type` is
/// driven by the *original* schema in `schema_to_field_info`; psycopg2
/// parses NUMERIC text as `decimal.Decimal`, which round-trips losslessly.
pub(crate) fn format_decimal128_as_utf8(
    arr: &dyn duckdb::arrow::array::Array,
    scale: i8,
) -> duckdb::arrow::array::ArrayRef {
    use duckdb::arrow::array::{Array, ArrayRef, Decimal128Array, StringArray};

    let dec = arr
        .as_any()
        .downcast_ref::<Decimal128Array>()
        .expect("array must be Decimal128Array");
    let len = dec.len();
    let mut out: Vec<Option<String>> = Vec::with_capacity(len);
    for i in 0..len {
        if dec.is_null(i) {
            out.push(None);
            continue;
        }
        let v: i128 = dec.value(i);
        out.push(Some(format_i128_with_scale(v, scale)));
    }
    let arr: ArrayRef = std::sync::Arc::new(StringArray::from(out));
    arr
}

/// Format an i128 as a fixed-point decimal string with `scale` fractional
/// digits. Negative scales are treated as zero-scale (DuckDB rejects them
/// at parse time, but we handle defensively).
pub(crate) fn format_i128_with_scale(v: i128, scale: i8) -> String {
    let scale = if scale < 0 { 0 } else { scale as usize };
    if scale == 0 {
        return v.to_string();
    }
    let negative = v < 0;
    // Use unsigned magnitude to avoid issues at i128::MIN.
    let mag: u128 = v.unsigned_abs();
    let digits = mag.to_string();
    let formatted = if digits.len() <= scale {
        // Need leading "0." and zero-padding before the significant digits.
        let mut s = String::with_capacity(scale + 2);
        s.push_str("0.");
        for _ in 0..(scale - digits.len()) {
            s.push('0');
        }
        s.push_str(&digits);
        s
    } else {
        let split = digits.len() - scale;
        let mut s = String::with_capacity(digits.len() + 1);
        s.push_str(&digits[..split]);
        s.push('.');
        s.push_str(&digits[split..]);
        s
    };
    if negative {
        format!("-{}", formatted)
    } else {
        formatted
    }
}

/// Format an Arrow `Interval*Array` as a Utf8 array of Postgres-style
/// interval strings, honouring the validity bitmap.
///
/// arrow-pg's encoder for `DataType::Interval(_)` reads `value(idx)` from
/// the array without checking the null bitmap first, then constructs a
/// `pg_interval::Interval` from whatever bytes happened to occupy the slot
/// — so a SQL NULL row ships e.g. "62206777 years 4 mons 31872 days" on
/// the wire. We avoid that by checking `is_null` ourselves and emitting a
/// wire NULL (as `Option<String>::None` in the StringArray).
pub(crate) fn format_interval_as_utf8(
    arr: &dyn duckdb::arrow::array::Array,
    unit: &duckdb::arrow::datatypes::IntervalUnit,
) -> duckdb::arrow::array::ArrayRef {
    use duckdb::arrow::array::{
        Array, ArrayRef, IntervalDayTimeArray, IntervalMonthDayNanoArray,
        IntervalYearMonthArray, StringArray,
    };
    use duckdb::arrow::datatypes::{
        IntervalDayTimeType, IntervalMonthDayNanoType, IntervalUnit,
        IntervalYearMonthType,
    };

    let len = arr.len();
    let mut out: Vec<Option<String>> = Vec::with_capacity(len);
    for i in 0..len {
        if arr.is_null(i) {
            out.push(None);
            continue;
        }
        let s = match unit {
            IntervalUnit::YearMonth => {
                let a = arr
                    .as_any()
                    .downcast_ref::<IntervalYearMonthArray>()
                    .expect("IntervalYearMonthArray downcast");
                let months = IntervalYearMonthType::to_months(a.value(i));
                let years = months / 12;
                let mons = months % 12;
                format!("{} years {} mons", years, mons)
            }
            IntervalUnit::DayTime => {
                let a = arr
                    .as_any()
                    .downcast_ref::<IntervalDayTimeArray>()
                    .expect("IntervalDayTimeArray downcast");
                let (days, millis) = IntervalDayTimeType::to_parts(a.value(i));
                format_interval_day_micros(0, days, (millis as i64) * 1_000)
            }
            IntervalUnit::MonthDayNano => {
                let a = arr
                    .as_any()
                    .downcast_ref::<IntervalMonthDayNanoArray>()
                    .expect("IntervalMonthDayNanoArray downcast");
                let (months, days, nanos) = IntervalMonthDayNanoType::to_parts(a.value(i));
                format_interval_day_micros(months, days, nanos / 1_000)
            }
        };
        out.push(Some(s));
    }
    let arr: ArrayRef = std::sync::Arc::new(StringArray::from(out));
    arr
}

pub(crate) fn format_interval_day_micros(months: i32, days: i32, micros: i64) -> String {
    let years = months / 12;
    let mons = months % 12;
    let total_secs = micros.div_euclid(1_000_000);
    let usec = micros.rem_euclid(1_000_000);
    let abs_secs = total_secs.unsigned_abs();
    let sign = if total_secs < 0 { "-" } else { "" };
    let h = abs_secs / 3600;
    let m = (abs_secs / 60) % 60;
    let s = abs_secs % 60;
    if usec == 0 {
        format!(
            "{} years {} mons {} days {}{:02}:{:02}:{:02}",
            years, mons, days, sign, h, m, s
        )
    } else {
        format!(
            "{} years {} mons {} days {}{:02}:{:02}:{:02}.{:06}",
            years, mons, days, sign, h, m, s, usec
        )
    }
}

/// Stringify any Arrow array whose type arrow-pg's encoder cannot natively
/// handle (Union, Struct, List, Map, FixedSizeBinary, …) using arrow's own
/// `ArrayFormatter`, honouring the validity bitmap so SQL NULLs become wire
/// NULLs. This is the fallback for when arrow's generic `cast(col, Utf8)`
/// does not implement the conversion (notably Union/Map/FixedSizeBinary).
///
/// Without it, the raw array reaches arrow-pg, whose encoder has no path for
/// these types and hangs the whole trexsql process (pgwire shares the
/// in-process DuckDB with the FHIR server, so the hang freezes everything and
/// Docker restarts the container). FHIR resource tables store polymorphic
/// `value[x]` fields as a DuckDB UNION and use List<Struct> pervasively, so
/// this path is hit by ordinary `SELECT`s.
pub(crate) fn format_array_as_utf8(
    array: &dyn duckdb::arrow::array::Array,
) -> duckdb::arrow::array::ArrayRef {
    use duckdb::arrow::array::StringArray;
    use duckdb::arrow::util::display::{ArrayFormatter, FormatOptions};

    let options = FormatOptions::default();
    let out: Vec<Option<String>> = match ArrayFormatter::try_new(array, &options) {
        Ok(formatter) => (0..array.len())
            .map(|i| {
                if array.is_null(i) {
                    None
                } else {
                    Some(formatter.value(i).to_string())
                }
            })
            .collect(),
        // Truly unformattable Arrow type — emit all-NULL Utf8 of the same
        // length rather than hand the raw array to arrow-pg.
        Err(_) => (0..array.len()).map(|_| None).collect(),
    };
    std::sync::Arc::new(StringArray::from(out))
}

pub(crate) fn rebuild_record_batch_for_pg(rb: RecordBatch) -> RecordBatch {
    use duckdb::arrow::array::ArrayRef;
    use duckdb::arrow::compute::kernels::cast::cast;
    use duckdb::arrow::datatypes::{DataType, Field, Schema};

    let schema = rb.schema();
    // Deny-by-default: only return the batch untouched when every column is a
    // known-safe passthrough type. Anything else is rewritten below so it can
    // never reach arrow-pg as a type it might hang on.
    if schema.fields().iter().all(|f| is_passthrough_safe(f.data_type())) {
        return rb;
    }

    let mut new_fields = Vec::with_capacity(schema.fields().len());
    let mut new_columns: Vec<ArrayRef> = Vec::with_capacity(rb.num_columns());
    for (i, field) in schema.fields().iter().enumerate() {
        // TIMESTAMPTZ takes a dedicated path because arrow's generic `cast`
        // routes through `Tz::from_str`, which fails on IANA names like
        // "Etc/UTC" in builds without `chrono-tz` and would otherwise leave
        // the array un-converted — sending it back through arrow-pg's
        // encoder, which trips the same parse on the encoding path.
        if let DataType::Timestamp(unit, Some(_)) = field.data_type() {
            let casted = format_timestamptz_as_utf8(rb.column(i).as_ref(), unit);
            new_columns.push(casted);
            new_fields.push(Field::new(
                field.name(),
                DataType::Utf8,
                field.is_nullable(),
            ));
            continue;
        }
        // Decimal128 — bypass arrow-pg + rust_decimal (which aborts on
        // full-width DECIMAL(38, *) values) by formatting i128 ourselves.
        if let DataType::Decimal128(_, scale) = field.data_type() {
            let casted = format_decimal128_as_utf8(rb.column(i).as_ref(), *scale);
            new_columns.push(casted);
            new_fields.push(Field::new(
                field.name(),
                DataType::Utf8,
                field.is_nullable(),
            ));
            continue;
        }
        // Interval — bypass arrow-pg's encoder, which leaks the stale buffer
        // slot for SQL NULL rows because it skips the validity bitmap check.
        if let DataType::Interval(unit) = field.data_type() {
            let casted = format_interval_as_utf8(rb.column(i).as_ref(), unit);
            new_columns.push(casted);
            new_fields.push(Field::new(
                field.name(),
                DataType::Utf8,
                field.is_nullable(),
            ));
            continue;
        }
        // Any non-passthrough-safe type that wasn't handled by a dedicated
        // formatter above: try arrow's generic Utf8 cast, falling back to the
        // ArrayFormatter-based stringifier. Deny-by-default — covers Union,
        // Map, Struct, List, and any unanticipated type alike.
        if !is_passthrough_safe(field.data_type()) {
            match cast(rb.column(i), &DataType::Utf8) {
                Ok(casted) => {
                    new_columns.push(casted);
                    new_fields.push(Field::new(
                        field.name(),
                        DataType::Utf8,
                        field.is_nullable(),
                    ));
                    continue;
                }
                Err(_) => {
                    // arrow's generic cast has no Utf8 conversion for this
                    // type (Union, Map, FixedSizeBinary, Struct, List, …).
                    // Stringify via arrow's ArrayFormatter instead of handing
                    // the raw array to arrow-pg, whose encoder hangs on these.
                    let formatted = format_array_as_utf8(rb.column(i).as_ref());
                    new_columns.push(formatted);
                    new_fields.push(Field::new(
                        field.name(),
                        DataType::Utf8,
                        field.is_nullable(),
                    ));
                    continue;
                }
            }
        }
        new_columns.push(rb.column(i).clone());
        new_fields.push(field.as_ref().clone());
    }
    let new_schema = Arc::new(Schema::new(new_fields));
    RecordBatch::try_new(new_schema, new_columns).unwrap_or(rb)
}

pub(crate) fn rebuild_schema_for_pg(schema: &Schema) -> Schema {
    use duckdb::arrow::datatypes::{DataType, Field};
    if !schema.fields().iter().any(|f| needs_string_cast(f.data_type())) {
        return schema.clone();
    }
    let new_fields: Vec<Field> = schema
        .fields()
        .iter()
        .map(|f| {
            if needs_string_cast(f.data_type()) {
                Field::new(f.name(), DataType::Utf8, f.is_nullable())
            } else {
                f.as_ref().clone()
            }
        })
        .collect();
    Schema::new(new_fields)
}

pub(crate) fn encode_batches_safely(
    header: Arc<Vec<FieldInfo>>,
    batches: Vec<RecordBatch>,
) -> Vec<PgWireResult<pgwire::messages::data::DataRow>> {
    match panic::catch_unwind(AssertUnwindSafe(|| {
        batches
            .into_iter()
            .map(rebuild_record_batch_for_pg)
            .flat_map(|rb| encode_recordbatch(header.clone(), rb))
            .collect::<Vec<_>>()
    })) {
        Ok(rows) => rows,
        Err(p) => {
            let msg = extract_panic_message(p);
            vec![Err(PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                format!("Row encoding panicked: {}", msg),
            ))))]
        }
    }
}

#[async_trait]
impl SimpleQueryHandler for TrexQueryHandler {
    async fn do_query<C>(&self, _client: &mut C, query: &str) -> PgWireResult<Vec<Response>>
    where
        C: ClientInfo + Unpin + Send + Sync,
    {
        log_debug(&format!("SimpleQuery: {}", query));

        let login_info = LoginInfo::from_client_info(_client);
        if let Some(db) = login_info.database() {
            if let Some(db_credentials) = ServerRegistry::instance().get_db_credentials(&self.server_host, self.server_port) {
                if matches!(check_database_action(db, &db_credentials), DatabaseAction::SetDatabase) {
                    let use_sql = format!("USE \"{}\"", db.replace('"', "\"\""));
                    let session_id = self.session_id;
                    let result = tokio::task::spawn_blocking(move || {
                        trex_pool_client::session_execute(session_id, &use_sql).map(|_| ())
                    })
                    .await
                    .unwrap_or_else(|e| Err(format!("spawn error: {e}")));
                    if let Err(err) = result {
                        return Err(PgWireError::UserError(Box::new(ErrorInfo::new(
                            "ERROR".to_owned(),
                            "XX000".to_owned(),
                            format!("Failed to set database context: {}", err),
                        ))));
                    }
                }
            }
        }

        // HANA datasets are served through the pgwire HANA passthrough: when the
        // connection database resolves to a HANA credential, wrap each query with
        // trex_hana_scan/trex_hana_execute (falling back to the raw DuckDB query
        // for metadata/pg_catalog statements HANA can't answer). This mirrors the
        // do_describe_* handlers, which previously were the ONLY place the wrap ran.
        let database = login_info.database().map(|s| s.to_string());
        let hana_credentials =
            get_hana_credentials_if_available(&database, &self.server_host, self.server_port);

        let queries: Vec<String> = split_sql_statements(query);

        let mut responses = Vec::new();

        for sql in queries {
            // Apply PostgreSQL compatibility transformations.
            // Note: `::regclass` is handled natively now — the pool extension
            // registers a `regclass` VARCHAR type stub on the base connection at
            // init, so casts resolve everywhere without a string rewrite here.
            let sql = sql
                .replace("AND datallowconn AND NOT datistemplate", "AND NOT db.datname =('system') AND NOT db.datname =('temp')")
                .replace("pg_get_expr(ad.adbin, ad.adrelid, true)","pg_get_expr(ad.adbin, ad.adrelid)")
                .replace("pg_catalog.pg_relation_size(i.indexrelid)","''")
                .replace("pg_catalog.pg_stat_get_numscans(i.indexrelid)","''")
                .replace("pg_catalog.pg_inherits i,pg_catalog.pg_class c WHERE",
                "(select 0 as inhseqno, 0 as inhrelid, 0 as inhparent) as i join pg_catalog.pg_class as c ON")
                .replace("SELECT c.oid,c.*,t.relname as tabrelname,rt.relnamespace as refnamespace,d.description, null as consrc_copy",
                "SELECT c.oid,t.relname  as tabrelname,rt.relnamespace as refnamespace,d.description, null as consrc_copy");

            // Intercept Postgres-only session parameters that libpq/JDBC drivers
            // SET on connect. DuckDB rejects them; without this, every JDBC client
            // fails on the first SET statement before user SQL even runs.
            if is_postgres_only_set(&sql) {
                log_debug(&format!("Intercepting pg-compat SET: {}", sql));
                responses.push(Response::Execution(Tag::new("SET").with_rows(0)));
                continue;
            }

            log_debug(&format!("Submitting query: {}", sql));
            let (actual_sql, fallback_sql) = match &hana_credentials {
                Some(creds) if !is_local_session_statement(&sql) => {
                    (wrap_query_for_hana(&sql, creds, self.session_id), Some(sql.clone()))
                }
                _ => (sql.clone(), None),
            };
            let session_id = self.session_id;
            let (schema, batches): (Arc<Schema>, Vec<RecordBatch>) = tokio::task::spawn_blocking(move || {
                match trex_pool_client::session_execute(session_id, &actual_sql) {
                    Ok(v) => Ok(v),
                    Err(e) => match fallback_sql {
                        // Only fall back to raw DuckDB for the HANA read/metadata
                        // wrap (`trex_hana_scan`). For HANA writes/DDL
                        // (`trex_hana_execute`) propagate the real error instead of
                        // masking it behind a raw-DuckDB "Schema does not exist".
                        Some(fb) if !actual_sql.contains("trex_hana_execute") => {
                            log_debug(&format!(
                                "HANA passthrough primary query failed, falling back: {e} | query: {actual_sql}"
                            ));
                            trex_pool_client::session_execute(session_id, &fb)
                        }
                        _ => Err(e),
                    },
                }
            }).await.map_err(|e| {
                PgWireError::UserError(Box::new(ErrorInfo::new(
                    "ERROR".to_owned(),
                    "XX000".to_owned(),
                    format!("Query execution failed: {}", e),
                )))
            })?.map_err(|e| {
                PgWireError::UserError(Box::new(ErrorInfo::new(
                    "ERROR".to_owned(),
                    "XX000".to_owned(),
                    e,
                )))
            })?;

            if (schema.fields().is_empty() && batches.is_empty())
                || is_duckdb_non_query_schema(&schema)
            {
                log_debug("Got EXECUTE result");
                responses.push(Response::Execution(Tag::new("OK").with_rows(0)));
            } else {
                log_debug(&format!("Got SELECT result: {} batches", batches.len()));
                let header = Arc::new(schema_to_field_info(&schema, &Format::UnifiedText)?);
                let data = encode_batches_safely(header.clone(), batches);

                responses.push(Response::Query(QueryResponse::new(
                    header,
                    stream::iter(data.into_iter()),
                )));
            }
        }

        if responses.is_empty() {
            responses.push(Response::Execution(Tag::new("OK").with_rows(0)));
        }

        Ok(responses)
    }
}

#[async_trait]
impl ExtendedQueryHandler for TrexQueryHandler {
    type Statement = String;
    type QueryParser = NoopQueryParser;

    fn query_parser(&self) -> Arc<Self::QueryParser> {
        Arc::new(NoopQueryParser::new())
    }

    async fn do_query<C>(
        &self,
        _client: &mut C,
        portal: &Portal<Self::Statement>,
        _max_rows: usize,
    ) -> PgWireResult<Response>
    where
        C: ClientInfo + Unpin + Send + Sync,
    {
        let query = portal.statement.statement.clone();
        log_debug(&format!("ExtendedQuery: {}", query));

        // See SimpleQueryHandler::do_query for context.
        if is_postgres_only_set(&query) {
            log_debug(&format!("Intercepting pg-compat SET: {}", query));
            return Ok(Response::Execution(Tag::new("SET").with_rows(0)));
        }

        let login_info = LoginInfo::from_client_info(_client);
        if let Some(db) = login_info.database() {
            if let Some(db_credentials) = ServerRegistry::instance().get_db_credentials(&self.server_host, self.server_port) {
                if matches!(check_database_action(db, &db_credentials), DatabaseAction::SetDatabase) {
                    let use_sql = format!("USE \"{}\"", db.replace('"', "\"\""));
                    let session_id = self.session_id;
                    let result = tokio::task::spawn_blocking(move || {
                        trex_pool_client::session_execute(session_id, &use_sql).map(|_| ())
                    })
                    .await
                    .unwrap_or_else(|e| Err(format!("spawn error: {e}")));
                    if let Err(err) = result {
                        return Err(PgWireError::UserError(Box::new(ErrorInfo::new(
                            "ERROR".to_owned(),
                            "XX000".to_owned(),
                            format!("Failed to set database context: {}", err),
                        ))));
                    }
                }
            }
        }

        // HANA passthrough (see SimpleQueryHandler::do_query): wrap for HANA when the
        // connection database resolves to a HANA credential, else run as-is on DuckDB.
        let database = login_info.database().map(|s| s.to_string());
        let hana_credentials =
            get_hana_credentials_if_available(&database, &self.server_host, self.server_port);
        let (actual_query, fallback_query) = match &hana_credentials {
            Some(creds) if !is_local_session_statement(&query) => {
                (wrap_query_for_hana(&query, creds, self.session_id), Some(query.clone()))
            }
            _ => (query.clone(), None),
        };
        let session_id = self.session_id;
        let (schema, batches): (Arc<Schema>, Vec<RecordBatch>) = tokio::task::spawn_blocking(move || {
            match trex_pool_client::session_execute(session_id, &actual_query) {
                Ok(v) => Ok(v),
                Err(e) => match fallback_query {
                    // Only fall back to raw DuckDB for the HANA read/metadata wrap
                    // (`trex_hana_scan`). For HANA writes/DDL (`trex_hana_execute`)
                    // propagate the real error instead of masking it behind a
                    // raw-DuckDB "Schema does not exist".
                    Some(fb) if !actual_query.contains("trex_hana_execute") => {
                        log_debug(&format!(
                            "HANA passthrough primary query failed, falling back: {e} | query: {actual_query}"
                        ));
                        trex_pool_client::session_execute(session_id, &fb)
                    }
                    _ => Err(e),
                },
            }
        }).await.map_err(|e| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                format!("Query execution failed: {}", e),
            )))
        })?.map_err(|e| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                e,
            )))
        })?;

        if (schema.fields().is_empty() && batches.is_empty())
            || is_duckdb_non_query_schema(&schema)
        {
            Ok(Response::Execution(Tag::new("OK").with_rows(0)))
        } else {
            let header = Arc::new(schema_to_field_info(&schema, &Format::UnifiedText)?);
            let data = encode_batches_safely(header.clone(), batches);

            Ok(Response::Query(QueryResponse::new(
                header,
                stream::iter(data.into_iter()),
            )))
        }
    }

    async fn do_describe_statement<C>(
        &self,
        _client: &mut C,
        stmt: &StoredStatement<Self::Statement>,
    ) -> PgWireResult<DescribeStatementResponse>
    where
        C: ClientInfo + Unpin + Send + Sync,
    {
        let login_info = LoginInfo::from_client_info(_client);
        let database = login_info.database().map(|s| s.to_string());

        // Use the per-worker describe connection so USE DATABASE state is isolated
        // per session and doesn't leak between concurrent clients.
        let connection = get_describe_connection(self.worker_id).ok_or_else(|| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                "No describe connection available".to_owned(),
            )))
        })?;
        let statement = stmt.statement.clone();
        let param_types = stmt.parameter_types.clone();
        let server_host = self.server_host.clone();
        let server_port = self.server_port;
        let session_id = self.session_id;

        tokio::task::spawn_blocking(move || -> PgWireResult<DescribeStatementResponse> {
            let guard = connection.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let conn = &*guard;

            if let Some(db) = &database {
                if let Some(db_credentials) = ServerRegistry::instance().get_db_credentials(&server_host, server_port) {
                    match check_database_action(db, &db_credentials) {
                        DatabaseAction::SetDatabase => {
                            let _ = conn.execute(&format!("USE \"{}\"", db.replace('"', "\"\"")), params![]);
                        }
                        _ => {}
                    }
                }
            }

            let hana_credentials = get_hana_credentials_if_available(&database, &server_host, server_port);

            let (actual_statement, fallback_statement) = if let Some(hana_creds) = &hana_credentials {
                (wrap_query_for_hana(&statement, hana_creds, session_id), Some(statement.clone()))
            } else {
                (statement.clone(), None)
            };

            let fallback_ref = fallback_statement.as_deref();
            let stmt = execute_with_fallback(&actual_statement, fallback_ref, |query_str| {
                conn.prepare(query_str)
            }).map_err(|e| PgWireError::ApiError(Box::new(e)))?;

            let fields = row_desc_from_stmt(&stmt, &Format::UnifiedBinary)?;
            let param_types_unwrapped: Vec<Type> = param_types.into_iter().filter_map(|t| t).collect();
            Ok(DescribeStatementResponse::new(param_types_unwrapped, fields))
        })
        .await
        .map_err(|e| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                format!("Task execution failed: {}", e),
            )))
        })?
    }

    async fn do_describe_portal<C>(
        &self,
        _client: &mut C,
        portal: &Portal<Self::Statement>,
    ) -> PgWireResult<DescribePortalResponse>
    where
        C: ClientInfo + Unpin + Send + Sync,
    {
        let login_info = LoginInfo::from_client_info(_client);
        let database = login_info.database().map(|s| s.to_string());

        // Use the per-worker describe connection so USE DATABASE state is isolated
        // per session and doesn't leak between concurrent clients.
        let connection = get_describe_connection(self.worker_id).ok_or_else(|| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                "No describe connection available".to_owned(),
            )))
        })?;
        let statement = portal.statement.statement.clone();
        let format = portal.result_column_format.clone();
        let server_host = self.server_host.clone();
        let server_port = self.server_port;
        let session_id = self.session_id;

        tokio::task::spawn_blocking(move || -> PgWireResult<DescribePortalResponse> {
            let guard = connection.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let conn = &*guard;

            if let Some(db) = &database {
                if let Some(db_credentials) = ServerRegistry::instance().get_db_credentials(&server_host, server_port) {
                    match check_database_action(db, &db_credentials) {
                        DatabaseAction::SetDatabase => {
                            let _ = conn.execute(&format!("USE \"{}\"", db.replace('"', "\"\"")), params![]);
                        }
                        _ => {}
                    }
                }
            }

            let hana_credentials = get_hana_credentials_if_available(&database, &server_host, server_port);

            let (actual_statement, fallback_statement) = if let Some(hana_creds) = &hana_credentials {
                (wrap_query_for_hana(&statement, hana_creds, session_id), Some(statement.clone()))
            } else {
                (statement.clone(), None)
            };

            let fallback_ref = fallback_statement.as_deref();
            let stmt = execute_with_fallback(&actual_statement, fallback_ref, |query_str| {
                conn.prepare(query_str)
            }).map_err(|e| PgWireError::ApiError(Box::new(e)))?;

            let fields = row_desc_from_stmt(&stmt, &format)?;
            Ok(DescribePortalResponse::new(fields))
        })
        .await
        .map_err(|e| {
            PgWireError::UserError(Box::new(ErrorInfo::new(
                "ERROR".to_owned(),
                "XX000".to_owned(),
                format!("Task execution failed: {}", e),
            )))
        })?
    }
}

pub struct TrexPgWireServerWithAuth {
    query_handler: Arc<TrexQueryHandler>,
    password: String,
}

impl TrexPgWireServerWithAuth {
    pub fn new(
        password: String,
        host: String,
        port: u16,
        worker_id: usize,
        session_id: u64,
    ) -> Self {
        Self {
            query_handler: Arc::new(TrexQueryHandler::new(host, port, worker_id, session_id)),
            password,
        }
    }
}

impl PgWireServerHandlers for TrexPgWireServerWithAuth {
    fn simple_query_handler(&self) -> Arc<impl SimpleQueryHandler> {
        self.query_handler.clone()
    }

    fn extended_query_handler(&self) -> Arc<impl ExtendedQueryHandler> {
        self.query_handler.clone()
    }

    fn startup_handler(&self) -> Arc<impl StartupHandler> {
        let auth_source = SimpleAuthSource::new(self.password.clone());
        let parameter_provider = DefaultServerParameterProvider::default();
        let mut scram_auth = ScramAuth::new(Arc::new(auth_source));
        scram_auth.set_iterations(SCRAM_ITERATIONS);
        let sasl_handler = SASLAuthStartupHandler::new(Arc::new(parameter_provider))
            .with_scram(scram_auth);
        Arc::new(sasl_handler)
    }
}

pub fn start_pgwire_server_capi(
    host: String,
    port: u16,
    password: Option<&str>,
    db_credentials: String,
) -> Result<String, String> {
    if ServerRegistry::instance().is_server_running(&host, port) {
        return Err(format!("Server already running on {}:{}", host, port));
    }

    // Authentication is mandatory. A None/empty password previously fell back
    // to an unauthenticated `NoopHandler` that accepted EVERY connection — a
    // critical auth bypass, especially since the server is routinely bound to
    // a non-loopback address (e.g. 0.0.0.0 in the d2e compose config). Refuse
    // to start rather than silently exposing an open SQL endpoint.
    let required_password = match password {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => {
            return Err(
                "pgwire refuses to start without a password: authentication is mandatory"
                    .to_string(),
            )
        }
    };

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    let server_host = host.clone();
    let server_port = port;
    let success_host = host.clone();

    let thread_handle = thread::Builder::new()
        .name(format!("pgwire-server-{}:{}", host, port))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;

            let result = rt.block_on(async move {
                let listener = TcpListener::bind(format!("{}:{}", server_host, server_port)).await?;
                log_debug(&format!("Bound to {}:{}", server_host, server_port));

                let worker_counter = std::sync::atomic::AtomicUsize::new(0);

                loop {
                    tokio::select! {
                        _ = &mut shutdown_rx => {
                            log_debug("Received shutdown signal");
                            break;
                        }
                        result = listener.accept() => {
                            match result {
                                Ok((socket, addr)) => {
                                    log_debug(&format!("New connection from {:?}", addr));
                                    let worker_id = worker_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                    let session_id = match trex_pool_client::create_session() {
                                        Ok(id) => id,
                                        Err(e) => {
                                            // Surface WHY the session could not be opened (e.g.
                                            // "no service:flight entry from a data node yet")
                                            // rather than silently dropping the connection — the
                                            // client only sees "server closed the connection",
                                            // so this log is the operator's only diagnostic.
                                            eprintln!("pgwire: refusing connection — {e}");
                                            continue;
                                        }
                                    };
                                    let handlers = Arc::new(TrexPgWireServerWithAuth::new(required_password.clone(), server_host.clone(), server_port, worker_id, session_id));
                                    tokio::spawn(async move {
                                        log_debug("Processing socket...");
                                        let result = process_socket(socket, None, handlers).await;
                                        log_debug(&format!("Socket result: {:?}", result));
                                        // Close this session's HANA connection (dropping its
                                        // session-local #temp tables) on the still-live DuckDB
                                        // session before returning it to the pool. Best-effort.
                                        let _ = tokio::task::spawn_blocking(move || {
                                            trex_pool_client::session_execute(
                                                session_id,
                                                &format!("SELECT trex_hana_evict_session('{}')", session_id),
                                            )
                                        }).await;
                                        let _ = trex_pool_client::destroy_session(session_id);
                                    });
                                }
                                Err(e) => {
                                    log_debug(&format!("Accept error: {}", e));
                                    break;
                                }
                            }
                        }
                    }
                }

                Ok(())
            });
            
            result
        })
        .map_err(|e| format!("Failed to spawn server thread: {}", e))?;

    let start_time = SystemTime::now();
    let server_handle = ServerHandle {
        thread_handle,
        shutdown_tx,
        start_time,
        db_credentials,
    };
    
    ServerRegistry::instance().register_server(host.clone(), port, server_handle)?;

    Ok(format!("Started pgwire server on {}:{}", success_host, port))
}

pub fn stop_pgwire_server(host: &str, port: u16) -> Result<String, String> {
    ServerRegistry::instance().stop_server(host, port)
}

// Per-workstream test submodules. Files live at
// `src/pgwire_server/tests/*.rs`. `#[path]` here is resolved relative to the
// directory of the file containing the declaration (`src/`), so the explicit
// `pgwire_server/tests/...` prefix is required.
#[cfg(test)]
#[path = "pgwire_server/tests/common.rs"]
mod common;
#[cfg(test)]
#[path = "pgwire_server/tests/registry_tests.rs"]
mod registry_tests;
#[cfg(test)]
#[path = "pgwire_server/tests/hana_tests.rs"]
mod hana_tests;
#[cfg(test)]
#[path = "pgwire_server/tests/type_format_tests.rs"]
mod type_format_tests;
#[cfg(test)]
#[path = "pgwire_server/tests/handler_tests.rs"]
mod handler_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intercepts_jdbc_handshake_sets() {
        // The standard Postgres JDBC driver fires these on connect.
        assert!(is_postgres_only_set("SET extra_float_digits = 3"));
        assert!(is_postgres_only_set("SET application_name = 'd2e'"));
        assert!(is_postgres_only_set("SET client_encoding = 'UTF8'"));
        assert!(is_postgres_only_set("SET DateStyle = 'ISO'"));
        assert!(is_postgres_only_set("SET TimeZone = 'UTC'"));
        assert!(is_postgres_only_set("SET standard_conforming_strings = on"));
    }

    #[test]
    fn case_and_whitespace_insensitive() {
        assert!(is_postgres_only_set("set extra_float_digits = 3"));
        assert!(is_postgres_only_set("SET   extra_float_digits=3"));
        assert!(is_postgres_only_set("  SET extra_float_digits TO 3"));
        assert!(is_postgres_only_set("Set Extra_Float_Digits = 3"));
    }

    #[test]
    fn handles_quoted_identifier() {
        assert!(is_postgres_only_set("SET \"extra_float_digits\" = 3"));
    }

    #[test]
    fn handles_set_local_and_session() {
        assert!(is_postgres_only_set("SET LOCAL extra_float_digits = 3"));
        assert!(is_postgres_only_set("set local TimeZone = 'UTC'"));
        assert!(is_postgres_only_set("SET SESSION application_name = 'd2e'"));
    }

    #[test]
    fn does_not_intercept_duckdb_sets() {
        // DuckDB's own settings must still reach the engine.
        assert!(!is_postgres_only_set("SET threads = 4"));
        assert!(!is_postgres_only_set("SET memory_limit = '4GB'"));
        assert!(!is_postgres_only_set("SET schema = 'demo_cdm'"));
    }

    #[test]
    fn does_not_intercept_non_set_statements() {
        assert!(!is_postgres_only_set("SELECT 1"));
        assert!(!is_postgres_only_set("INSERT INTO t VALUES (1)"));
        assert!(!is_postgres_only_set(""));
        assert!(!is_postgres_only_set("SET")); // bare SET, no name
        assert!(!is_postgres_only_set("RESET extra_float_digits"));
        // SETOF is not a SET statement (would be inside e.g. CREATE FUNCTION).
        assert!(!is_postgres_only_set("SETOF integer"));
    }

    // -------- is_hana_session_variable_set / HANA SET passthrough --------

    #[test]
    fn detects_hana_quoted_session_variable_set() {
        assert!(is_hana_session_variable_set("SET 'APPLICATION' = 'd2e-WIZARD_x'"));
        assert!(is_hana_session_variable_set("set 'APPLICATIONUSER' = 'a@b.c'"));
        assert!(is_hana_session_variable_set("  SET   'PA_CONFIG_ID' = '7'"));
        assert!(is_hana_session_variable_set(
            "SET SESSION 'TEMPORAL_SYSTEM_TIME_AS_OF' = '2026-01-01'"
        ));
        assert!(is_hana_session_variable_set(
            "-- attribution\nSET 'APPLICATION' = 'x'"
        ));
    }

    #[test]
    fn does_not_detect_identifier_form_as_hana_session_variable() {
        assert!(!is_hana_session_variable_set("SET memory_limit = '4GB'"));
        assert!(!is_hana_session_variable_set("SET schema = 'demo_cdm'"));
        assert!(!is_hana_session_variable_set("SET \"extra_float_digits\" = 3"));
        assert!(!is_hana_session_variable_set("SET application_name = 'd2e'"));
        assert!(!is_hana_session_variable_set("SELECT 1"));
        assert!(!is_hana_session_variable_set("SET"));
        assert!(!is_hana_session_variable_set(""));
        assert!(!is_hana_session_variable_set("SETOF integer"));
    }

    #[test]
    fn hana_session_variable_set_is_not_a_local_statement() {
        // Must reach HANA through the passthrough wrap, not the local DuckDB session.
        assert!(!is_local_session_statement("SET 'APPLICATION' = 'd2e-WIZARD_x'"));
        assert!(!is_local_session_statement("SET SESSION 'APPLICATIONUSER' = 'a@b.c'"));
    }

    #[test]
    fn identifier_sets_and_txn_control_stay_local() {
        assert!(is_local_session_statement("SET memory_limit = '4GB'"));
        assert!(is_local_session_statement("SET schema = 'demo_cdm'"));
        assert!(is_local_session_statement("BEGIN"));
        assert!(is_local_session_statement("COMMIT"));
        assert!(is_local_session_statement("RESET ALL"));
    }

    #[test]
    fn pg_compat_intercept_ignores_hana_quoted_set() {
        // The pg-compat intercept runs first; it must not swallow the HANA form.
        assert!(!is_postgres_only_set("SET 'APPLICATION' = 'd2e-WIZARD_x'"));
        assert!(!is_postgres_only_set("SET SESSION 'APPLICATIONUSER' = 'a@b.c'"));
    }

    // -------- split_sql_statements --------

    #[test]
    fn split_basic_and_trailing_semicolon() {
        assert_eq!(split_sql_statements("SELECT 1"), vec!["SELECT 1"]);
        assert_eq!(split_sql_statements("SELECT 1;"), vec!["SELECT 1"]);
        assert_eq!(
            split_sql_statements("SELECT 1; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn split_drops_empty_and_whitespace_statements() {
        assert_eq!(
            split_sql_statements("SELECT 1;;  ; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
        assert!(split_sql_statements("   \n\t ").is_empty());
    }

    #[test]
    fn split_ignores_semicolons_in_literals_and_comments() {
        assert_eq!(
            split_sql_statements("SELECT 'a;b'; SELECT 2"),
            vec!["SELECT 'a;b'", "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements(r#"SELECT * FROM "t;n"; SELECT 2"#),
            vec![r#"SELECT * FROM "t;n""#, "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT 1; -- a; comment\nSELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn pgwire_keeps_hana_block_intact() {
        let sql = "DO BEGIN IF EXISTS (SELECT 1 FROM tables) THEN DROP TABLE s.t; END IF; END;";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 1, "got {out:?}");
    }

    #[test]
    fn pgwire_block_then_next_statement_splits() {
        let sql = "DO BEGIN DECLARE v INT = 1; END;\nCREATE TABLE s.t (id INT);";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 2, "got {out:?}");
    }

    #[test]
    fn pgwire_nested_begin_end() {
        let sql = "DO BEGIN BEGIN INSERT INTO a VALUES (1); END; INSERT INTO b VALUES (2); END;";
        assert_eq!(split_sql_statements(sql).len(), 1);
    }

    // -------- needs_string_cast / rebuild_*_for_pg --------

    #[test]
    fn needs_string_cast_unsupported() {
        use duckdb::arrow::datatypes::{DataType, Field, TimeUnit};
        assert!(needs_string_cast(&DataType::Float16));
        assert!(needs_string_cast(&DataType::Decimal256(76, 4)));
        assert!(needs_string_cast(&DataType::Decimal128(10, 2)));
        assert!(needs_string_cast(&DataType::FixedSizeBinary(16)));
        // TIMESTAMPTZ (Timestamp with timezone) must be cast to Utf8 to avoid
        // the arrow-pg Tz::from_str panic on non-IANA tz strings.
        assert!(needs_string_cast(&DataType::Timestamp(
            TimeUnit::Microsecond,
            Some("UTC".into()),
        )));
        assert!(needs_string_cast(&DataType::Timestamp(
            TimeUnit::Microsecond,
            Some("+00:00".into()),
        )));
        // TIMESTAMP without tz stays native — arrow-pg encodes it fine.
        assert!(!needs_string_cast(&DataType::Timestamp(
            TimeUnit::Microsecond,
            None,
        )));
        assert!(needs_string_cast(&DataType::Map(
            Arc::new(Field::new(
                "entries",
                DataType::Struct(
                    vec![
                        Field::new("key", DataType::Utf8, false),
                        Field::new("value", DataType::Int32, false),
                    ]
                    .into(),
                ),
                false,
            )),
            false,
        )));
        let dict_int_value = DataType::Dictionary(
            Box::new(DataType::Int32),
            Box::new(DataType::Int32),
        );
        assert!(needs_string_cast(&dict_int_value));
    }

    #[test]
    fn needs_string_cast_supported() {
        use duckdb::arrow::datatypes::DataType;
        assert!(!needs_string_cast(&DataType::Boolean));
        assert!(!needs_string_cast(&DataType::Int32));
        assert!(!needs_string_cast(&DataType::Int64));
        assert!(!needs_string_cast(&DataType::Float64));
        // Decimal128 IS routed through Utf8 — see needs_string_cast for why
        // (rust_decimal::try_from_i128_with_scale aborts on full-width
        // DECIMAL(38, *)). Verified in needs_string_cast_unsupported.
        assert!(!needs_string_cast(&DataType::Utf8));
        assert!(!needs_string_cast(&DataType::Date32));
        let dict_utf8_value = DataType::Dictionary(
            Box::new(DataType::Int32),
            Box::new(DataType::Utf8),
        );
        assert!(!needs_string_cast(&dict_utf8_value));
    }

    #[test]
    fn rebuild_schema_for_pg_replaces_unsupported_with_utf8() {
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let original = Schema::new(vec![
            Field::new("kept", DataType::Int32, false),
            Field::new("uuid", DataType::FixedSizeBinary(16), true),
            Field::new("score", DataType::Decimal256(76, 4), true),
        ]);
        let rebuilt = rebuild_schema_for_pg(&original);
        assert_eq!(rebuilt.field(0).data_type(), &DataType::Int32);
        assert_eq!(rebuilt.field(1).data_type(), &DataType::Utf8);
        assert_eq!(rebuilt.field(2).data_type(), &DataType::Utf8);
        assert!(rebuilt.field(1).is_nullable());
    }

    #[test]
    fn rebuild_schema_for_pg_passthrough_when_all_supported() {
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let original = Schema::new(vec![
            Field::new("a", DataType::Int32, false),
            Field::new("b", DataType::Utf8, false),
        ]);
        let rebuilt = rebuild_schema_for_pg(&original);
        assert_eq!(rebuilt, original);
    }

    #[test]
    fn rebuild_record_batch_fixed_size_binary_becomes_utf8() {
        // FixedSizeBinary is flagged as needing a string cast, but arrow's
        // generic `cast` kernel does not implement FixedSizeBinary→Utf8, so
        // it routes through the `format_array_as_utf8` fallback. The column
        // must reach arrow-pg as Utf8, never as a raw FixedSizeBinary.
        use duckdb::arrow::array::{FixedSizeBinaryArray, StringArray};
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let arr =
            FixedSizeBinaryArray::try_from_iter(vec![vec![0xDEu8, 0xAD]].into_iter())
                .unwrap();
        let schema = Arc::new(Schema::new(vec![Field::new(
            "b",
            DataType::FixedSizeBinary(2),
            false,
        )]));
        let rb = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        let casted = rebuild_record_batch_for_pg(rb);
        assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
        assert_eq!(casted.num_rows(), 1);
        let col = casted
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert!(!col.value(0).is_empty());
    }

    #[test]
    fn rebuild_record_batch_passthrough_for_supported_types() {
        use duckdb::arrow::array::Int32Array;
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let schema = Arc::new(Schema::new(vec![Field::new(
            "i",
            DataType::Int32,
            false,
        )]));
        let original = RecordBatch::try_new(
            schema,
            vec![Arc::new(Int32Array::from(vec![42]))],
        )
        .unwrap();
        let rebuilt = rebuild_record_batch_for_pg(original.clone());
        assert_eq!(rebuilt.schema().field(0).data_type(), &DataType::Int32);
        assert_eq!(rebuilt.num_rows(), 1);
    }

    #[test]
    fn needs_string_cast_flags_nested_types() {
        use duckdb::arrow::datatypes::{DataType, Field, Fields, UnionFields, UnionMode};
        let int = Arc::new(Field::new("x", DataType::Int32, false));
        assert!(needs_string_cast(&DataType::Struct(Fields::from(vec![
            int.clone()
        ]))));
        assert!(needs_string_cast(&DataType::List(int.clone())));
        assert!(needs_string_cast(&DataType::LargeList(int.clone())));
        assert!(needs_string_cast(&DataType::FixedSizeList(int.clone(), 2)));
        let ufields: UnionFields = [(0i8, int.clone())].into_iter().collect();
        assert!(needs_string_cast(&DataType::Union(ufields, UnionMode::Dense)));
    }

    #[test]
    fn rebuild_record_batch_struct_becomes_utf8() {
        use duckdb::arrow::array::{Array, ArrayRef, Int32Array, StringArray, StructArray};
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let struct_arr = StructArray::from(vec![(
            Arc::new(Field::new("x", DataType::Int32, false)),
            Arc::new(Int32Array::from(vec![7])) as ArrayRef,
        )]);
        let dt = struct_arr.data_type().clone();
        let schema = Arc::new(Schema::new(vec![Field::new("s", dt, true)]));
        let rb = RecordBatch::try_new(schema, vec![Arc::new(struct_arr)]).unwrap();
        let casted = rebuild_record_batch_for_pg(rb);
        assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
        let col = casted
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert!(col.value(0).contains('7'), "got {:?}", col.value(0));
    }

    #[test]
    fn rebuild_record_batch_list_becomes_utf8() {
        use duckdb::arrow::array::{Array, ListArray, StringArray};
        use duckdb::arrow::datatypes::{DataType, Field, Int32Type, Schema};
        let list = ListArray::from_iter_primitive::<Int32Type, _, _>(vec![Some(vec![
            Some(1),
            Some(2),
            Some(3),
        ])]);
        let dt = list.data_type().clone();
        let schema = Arc::new(Schema::new(vec![Field::new("l", dt, true)]));
        let rb = RecordBatch::try_new(schema, vec![Arc::new(list)]).unwrap();
        let casted = rebuild_record_batch_for_pg(rb);
        assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
        let col = casted
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert!(col.value(0).contains('1'), "got {:?}", col.value(0));
    }

    #[test]
    fn rebuild_record_batch_union_becomes_utf8() {
        use duckdb::arrow::array::{Array, ArrayRef, Int32Array, StringArray, UnionArray};
        use duckdb::arrow::buffer::ScalarBuffer;
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let ufields = [(0i8, Arc::new(Field::new("a", DataType::Int32, false)))]
            .into_iter()
            .collect();
        let type_ids = ScalarBuffer::<i8>::from(vec![0i8]);
        let offsets = ScalarBuffer::<i32>::from(vec![0i32]);
        let children: Vec<ArrayRef> = vec![Arc::new(Int32Array::from(vec![99]))];
        let union = UnionArray::try_new(ufields, type_ids, Some(offsets), children).unwrap();
        let dt = union.data_type().clone();
        let schema = Arc::new(Schema::new(vec![Field::new("v", dt, false)]));
        let rb = RecordBatch::try_new(schema, vec![Arc::new(union)]).unwrap();
        let casted = rebuild_record_batch_for_pg(rb);
        assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
        let col = casted
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert!(col.value(0).contains("99"), "got {:?}", col.value(0));
    }

    #[test]
    fn rebuild_record_batch_unanticipated_type_becomes_utf8() {
        // Deny-by-default: a type that the known-bad `needs_string_cast` list
        // never enumerated (here Duration) must still be stringified rather
        // than handed to arrow-pg, which could hang on it. This guards future
        // / unknown Arrow types — the column must never reach arrow-pg raw.
        use duckdb::arrow::array::{Array, DurationMicrosecondArray, StringArray};
        use duckdb::arrow::datatypes::{DataType, Field, Schema};
        let arr = DurationMicrosecondArray::from(vec![1_500_000i64]);
        // Sanity: this is exactly the gap — not on the known-bad list...
        assert!(!needs_string_cast(arr.data_type()));
        // ...but it is NOT passthrough-safe either, so it gets stringified.
        assert!(!is_passthrough_safe(arr.data_type()));
        let dt = arr.data_type().clone();
        let schema = Arc::new(Schema::new(vec![Field::new("d", dt, false)]));
        let rb = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
        let casted = rebuild_record_batch_for_pg(rb);
        assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
        let col = casted
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert!(!col.value(0).is_empty());
    }

    #[test]
    fn is_passthrough_safe_allowlist() {
        use duckdb::arrow::datatypes::{DataType, Field, TimeUnit};
        // Known-safe scalar types pass straight through to arrow-pg.
        assert!(is_passthrough_safe(&DataType::Int32));
        assert!(is_passthrough_safe(&DataType::Utf8));
        assert!(is_passthrough_safe(&DataType::Boolean));
        assert!(is_passthrough_safe(&DataType::Timestamp(TimeUnit::Microsecond, None)));
        // tz-aware timestamp is NOT a safe passthrough (custom formatter).
        assert!(!is_passthrough_safe(&DataType::Timestamp(
            TimeUnit::Microsecond,
            Some("UTC".into())
        )));
        // Nested + unknown types are never safe.
        assert!(!is_passthrough_safe(&DataType::List(Arc::new(Field::new(
            "x",
            DataType::Int32,
            true
        )))));
        assert!(!is_passthrough_safe(&DataType::Duration(TimeUnit::Second)));
    }
}
