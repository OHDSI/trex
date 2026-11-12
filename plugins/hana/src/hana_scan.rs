use duckdb_neo::{
    bind_arguments::BindArgument,
    connection::{Context, FFILink},
    data_chunk::DataChunkRef,
    logical_type::LogicalTypeID as LogicalTypeId,
    signature::{FunctionParameter, FunctionParameterKind, SignatureBuilder},
    table_function::{BindFunctionHandle, ExecColumnInfo, InitColumnData, TableFunctionCallbacks},
    types::{Any, BlobValue},
    Parameters,
};
use std::error::Error;
use std::sync::Mutex;
use crate::v2_util::{arg_string, arg_varchar, bind_error, exec_error, positional};
use hdbconnect::{Connection as HanaConnection, Row};
use std::fmt;
use std::env;
use std::panic::{self, AssertUnwindSafe};

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
        env::var("HANA_LOG_LEVEL")
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

pub struct HanaLogger;

impl HanaLogger {
    pub fn log(level: LogLevel, category: &str, message: &str) {
        if level <= LogLevel::current() {
            eprintln!("[{}] {} {}", level.as_str(), category, message);
        }
    }
    pub fn log_with_context(level: LogLevel, category: &str, message: &str, context: &[(&str, &str)]) {
        if level <= LogLevel::current() {
            let context_str = context.iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join(" ");
            eprintln!("[{}] {} {} | {}", level.as_str(), category, message, context_str);
        }
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

macro_rules! hana_error {
    ($category:expr, $($arg:tt)*) => {
        HanaLogger::error($category, &format!($($arg)*))
    };
}
macro_rules! hana_warn {
    ($category:expr, $($arg:tt)*) => {
        HanaLogger::warn($category, &format!($($arg)*))
    };
}
macro_rules! hana_debug {
    ($category:expr, $($arg:tt)*) => {
        HanaLogger::debug($category, &format!($($arg)*))
    };
}
#[derive(Debug)]
pub enum HanaError {
    Connection { 
        message: String, 
        url: Option<String>,
        retry_count: Option<u32>,
        context: String,
    },
    Query { 
        message: String, 
        query: Option<String>,
        execution_time_ms: Option<u64>,
        context: String,
    },
    TypeConversion { 
        message: String, 
        source_type: Option<String>,
        target_type: Option<String>,
        column_name: Option<String>,
        row_index: Option<usize>,
    },
    Schema { 
        message: String, 
        table_name: Option<String>,
        context: String,
    },
    Configuration { 
        message: String, 
        parameter: Option<String>,
        provided_value: Option<String>,
        expected_format: Option<String>,
    },
    Resource { 
        message: String, 
        operation: String,
        allocated_bytes: Option<usize>,
    },
    Internal { 
        message: String, 
        error_code: Option<i32>,
        context: String,
    },
}
impl fmt::Display for HanaError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            HanaError::Connection { message, url, retry_count, context } => {
                write!(f, "HANA Connection Error: {}", message)?;
                if let Some(url) = url {
                    write!(f, " (URL: {})", redact_url_password(url))?;
                }
                if let Some(retries) = retry_count {
                    write!(f, " (Retries: {})", retries)?;
                }
                write!(f, " [Context: {}]", context)
            },
            HanaError::Query { message, query, execution_time_ms, context } => {
                write!(f, "HANA Query Error: {}", message)?;
                if let Some(query) = query {
                    let truncated = if query.len() > 100 { 
                        format!("{}...", &query[..97]) 
                    } else { 
                        query.clone() 
                    };
                    write!(f, " (Query: {})", truncated)?;
                }
                if let Some(time) = execution_time_ms {
                    write!(f, " (Execution time: {}ms)", time)?;
                }
                write!(f, " [Context: {}]", context)
            },
            HanaError::TypeConversion { message, source_type, target_type, column_name, row_index } => {
                write!(f, "HANA Type Conversion Error: {}", message)?;
                if let Some(col) = column_name {
                    write!(f, " (Column: {})", col)?;
                }
                if let Some(row) = row_index {
                    write!(f, " (Row: {})", row)?;
                }
                if let Some(src) = source_type {
                    if let Some(tgt) = target_type {
                        write!(f, " (Converting {} → {})", src, tgt)?;
                    }
                }
                Ok(())
            },
            HanaError::Schema { message, table_name, context } => {
                write!(f, "HANA Schema Error: {}", message)?;
                if let Some(table) = table_name {
                    write!(f, " (Table: {})", table)?;
                }
                write!(f, " [Context: {}]", context)
            },
            HanaError::Configuration { message, parameter, provided_value, expected_format } => {
                write!(f, "HANA Configuration Error: {}", message)?;
                if let Some(param) = parameter {
                    write!(f, " (Parameter: {})", param)?;
                }
                if let Some(value) = provided_value {
                    write!(f, " (Provided: {})", value)?;
                }
                if let Some(expected) = expected_format {
                    write!(f, " (Expected: {})", expected)?;
                }
                Ok(())
            },
            HanaError::Resource { message, operation, allocated_bytes } => {
                write!(f, "HANA Resource Error: {} (Operation: {})", message, operation)?;
                if let Some(bytes) = allocated_bytes {
                    write!(f, " (Memory: {} bytes)", bytes)?;
                }
                Ok(())
            },
            HanaError::Internal { message, error_code, context } => {
                write!(f, "HANA Internal Error: {}", message)?;
                if let Some(code) = error_code {
                    write!(f, " (Code: {})", code)?;
                }
                write!(f, " [Context: {}]", context)
            },
        }
    }
}

impl Error for HanaError {}

impl HanaError {
    pub fn connection(message: &str, url: Option<&str>, retry_count: Option<u32>, context: &str) -> Box<HanaError> {
        Box::new(HanaError::Connection {
            message: message.to_string(),
            url: url.map(|s| s.to_string()),
            retry_count,
            context: context.to_string(),
        })
    }
    pub fn query(message: &str, query: Option<&str>, execution_time_ms: Option<u64>, context: &str) -> Box<HanaError> {
        Box::new(HanaError::Query {
            message: message.to_string(),
            query: query.map(|s| s.to_string()),
            execution_time_ms,
            context: context.to_string(),
        })
    }
    pub fn type_conversion(message: &str, source_type: Option<&str>, target_type: Option<&str>, 
                          column_name: Option<&str>, row_index: Option<usize>) -> Box<HanaError> {
        Box::new(HanaError::TypeConversion {
            message: message.to_string(),
            source_type: source_type.map(|s| s.to_string()),
            target_type: target_type.map(|s| s.to_string()),
            column_name: column_name.map(|s| s.to_string()),
            row_index,
        })
    }
    pub fn schema(message: &str, table_name: Option<&str>, context: &str) -> Box<HanaError> {
        Box::new(HanaError::Schema {
            message: message.to_string(),
            table_name: table_name.map(|s| s.to_string()),
            context: context.to_string(),
        })
    }
    pub fn configuration(message: &str, parameter: Option<&str>, provided_value: Option<&str>, 
                         expected_format: Option<&str>) -> Box<HanaError> {
        Box::new(HanaError::Configuration {
            message: message.to_string(),
            parameter: parameter.map(|s| s.to_string()),
            provided_value: provided_value.map(|s| s.to_string()),
            expected_format: expected_format.map(|s| s.to_string()),
        })
    }
    pub fn resource(message: &str, operation: &str, allocated_bytes: Option<usize>) -> Box<HanaError> {
        Box::new(HanaError::Resource {
            message: message.to_string(),
            operation: operation.to_string(),
            allocated_bytes,
        })
    }
    pub fn internal(message: &str, error_code: Option<i32>, context: &str) -> Box<HanaError> {
        Box::new(HanaError::Internal {
            message: message.to_string(),
            error_code,
            context: context.to_string(),
        })
    }
    pub fn new(message: &str) -> Box<HanaError> {
        Box::new(HanaError::Internal {
            message: message.to_string(),
            error_code: None,
            context: "Legacy error constructor".to_string(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct HanaScanBindData {
    pub url: String,
    pub user: String,
    pub password: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub query: String,
    pub column_names: Vec<String>,
    pub column_types: Vec<LogicalTypeId>,
    /// Per-column flag: true when the source HANA type is a date/time type
    /// (serialised as a string) and the value should be normalised.
    pub temporal_cols: Vec<bool>,
    pub batch_size: usize,
    pub max_retries: u32,
    /// pgwire session id used to borrow a pooled HANA connection so bind's schema
    /// probe and init's data pull share one HANA session (0 = fresh connection).
    pub session_id: u64,
}

#[derive(Debug)]
pub struct HanaScanInitData {
    result_rows: Vec<Row>,
    current_row: Mutex<usize>,
}

fn map_hana_type(hana_type: hdbconnect::TypeId) -> LogicalTypeId {
    match hana_type {
        hdbconnect::TypeId::BOOLEAN => LogicalTypeId::Boolean,
        hdbconnect::TypeId::TINYINT => LogicalTypeId::SmallInt, // HANA TINYINT is u8 (0-255), doesn't fit trexsql i8
        hdbconnect::TypeId::SMALLINT => LogicalTypeId::SmallInt,
        hdbconnect::TypeId::INT => LogicalTypeId::Integer,
        hdbconnect::TypeId::BIGINT => LogicalTypeId::BigInt,
        hdbconnect::TypeId::REAL => LogicalTypeId::Float,
        hdbconnect::TypeId::DOUBLE => LogicalTypeId::Double,
        // HANA delivers DECIMAL columns via the FIXED* transport type ids.
        // Map the whole decimal family to DOUBLE so values arrive as a numeric
        // type (comparable / sortable / aggregatable) instead of opaque varchar.
        // Trade-off: precision beyond ~15 significant digits is not preserved.
        hdbconnect::TypeId::DECIMAL
        | hdbconnect::TypeId::FIXED8
        | hdbconnect::TypeId::FIXED12
        | hdbconnect::TypeId::FIXED16 => LogicalTypeId::Double,
        hdbconnect::TypeId::CHAR | hdbconnect::TypeId::VARCHAR | 
        hdbconnect::TypeId::NCHAR | hdbconnect::TypeId::NVARCHAR | 
        hdbconnect::TypeId::STRING | hdbconnect::TypeId::NSTRING |
        hdbconnect::TypeId::SHORTTEXT | hdbconnect::TypeId::ALPHANUM => LogicalTypeId::Varchar,
        hdbconnect::TypeId::BINARY | hdbconnect::TypeId::VARBINARY => LogicalTypeId::Blob,
        // Datetime types are serialised as VARCHAR strings because trexsql's
        // flat_vector.insert() only works on string-typed vectors.
        hdbconnect::TypeId::DAYDATE => LogicalTypeId::Varchar,
        hdbconnect::TypeId::SECONDTIME => LogicalTypeId::Varchar,
        hdbconnect::TypeId::LONGDATE | hdbconnect::TypeId::SECONDDATE => LogicalTypeId::Varchar,
        hdbconnect::TypeId::CLOB | hdbconnect::TypeId::NCLOB | hdbconnect::TypeId::TEXT => LogicalTypeId::Varchar,
        hdbconnect::TypeId::BLOB | hdbconnect::TypeId::BLOCATOR | hdbconnect::TypeId::BINTEXT => LogicalTypeId::Blob,
        hdbconnect::TypeId::GEOMETRY | hdbconnect::TypeId::POINT => LogicalTypeId::Varchar,
        _ => LogicalTypeId::Varchar,
    }
}

/// True for HANA date/time transport types, which `map_hana_type` serialises
/// to VARCHAR strings and which need timestamp normalisation on extraction.
fn is_temporal_type(t: hdbconnect::TypeId) -> bool {
    matches!(
        t,
        hdbconnect::TypeId::DAYDATE
            | hdbconnect::TypeId::SECONDTIME
            | hdbconnect::TypeId::LONGDATE
            | hdbconnect::TypeId::SECONDDATE
    )
}

/// Normalise HANA's ISO timestamp string to a SQL-friendly form:
/// `2024-01-15T12:34:56.7890000` -> `2024-01-15 12:34:56.789`
/// (space separator, trailing fractional zeros trimmed). DATE/TIME strings,
/// which contain no `T` and no `.`, pass through unchanged.
fn normalize_hana_timestamp(s: &str) -> String {
    let mut out = if s.len() > 10 && s.as_bytes()[10] == b'T' {
        let mut t = s.to_string();
        t.replace_range(10..11, " ");
        t
    } else {
        s.to_string()
    };
    if let Some(dot) = out.find('.') {
        let trimmed_len = out[dot + 1..].trim_end_matches('0').len();
        out.truncate(dot + 1 + trimmed_len);
        if out.ends_with('.') {
            out.truncate(dot);
        }
    }
    out
}

pub fn redact_url_password(url: &str) -> String {
    let scheme_len = if url.starts_with("hdbsqls://") {
        10
    } else if url.starts_with("hdbsql://") {
        9
    } else {
        return url.to_string();
    };
    let url_part = &url[scheme_len..];
    if let Some(at_pos) = url_part.rfind('@') {
        let auth_part = &url_part[..at_pos];
        let host_part = &url_part[at_pos..];
        if let Some(colon_pos) = auth_part.find(':') {
            let user = &auth_part[..colon_pos];
            return format!("{}{}:***{}", &url[..scheme_len], user, host_part);
        }
    }
    url.to_string()
}

pub fn parse_hana_url(url: &str) -> Result<(String, String, String, u16, String), Box<dyn Error>> {
    let scheme_len = if url.starts_with("hdbsqls://") {
        10
    } else if url.starts_with("hdbsql://") {
        9
    } else {
        return Err(HanaError::new("URL must start with hdbsql:// or hdbsqls://"));
    };
    let url_part = &url[scheme_len..];
    let at_pos = url_part
        .rfind('@')
        .ok_or_else(|| HanaError::new("Invalid URL format: missing '@' separator"))?;
    let auth_part = &url_part[..at_pos];
    let host_db_part = &url_part[at_pos + 1..];
    let colon_pos = auth_part
        .find(':')
        .ok_or_else(|| HanaError::new("Invalid URL format: missing ':' in credentials"))?;
    let user = &auth_part[..colon_pos];
    let password = &auth_part[colon_pos + 1..];
    if user.trim().is_empty() {
        return Err(HanaError::new("Username cannot be empty"));
    }
    if password.trim().is_empty() {
        return Err(HanaError::new("Password cannot be empty"));
    }
    let (host_db_base, _query_params) = host_db_part
        .split_once('?')
        .unwrap_or((host_db_part, ""));
    let (host_port, database) = host_db_base
        .split_once('/')
        .ok_or_else(|| HanaError::new("Invalid URL format: missing '/' before database"))?;
    let (host, port_str) = host_port
        .split_once(':')
        .ok_or_else(|| HanaError::new("Invalid URL format: missing ':' for port"))?;
    if host.trim().is_empty() {
        return Err(HanaError::new("Host cannot be empty"));
    }
    let port: u16 = port_str
        .parse()
        .map_err(|_| HanaError::new(&format!("Invalid port number: {}", port_str)))?;
    if port == 0 {
        return Err(HanaError::new("Port cannot be 0"));
    }
    if database.trim().is_empty() {
        return Err(HanaError::new("Database name cannot be empty"));
    }
    Ok((
        user.trim().to_string(),
        password.to_string(),
        host.trim().to_string(),
        port,
        database.trim().to_string(),
    ))
}

pub fn validate_hana_connection(url: &str) -> Result<(), Box<dyn Error>> {
    let (_user, _password, host, port, database) = parse_hana_url(url)?;
    if host.len() > 255 {
        return Err(HanaError::new("Host name too long (max 255 characters)"));
    }
    if database.len() > 128 {
        return Err(HanaError::new("Database name too long (max 128 characters)"));
    }
    if port < 30000 || port > 39999 {
        hana_warn!("CONN", "Port {} outside typical HANA range (30000-39999)", port);
    }
    Ok(())
}

pub fn safe_hana_connect(url: String) -> Result<HanaConnection, Box<dyn Error>> {
    let result = panic::catch_unwind(AssertUnwindSafe(|| {
        HanaConnection::new(url)
    }));

    match result {
        Ok(conn_result) => conn_result.map_err(|e| {
            HanaError::connection(
                &format!("Connection failed: {:?}", e),
                None,
                None,
                "safe_hana_connect"
            ) as Box<dyn Error>
        }),
        Err(panic_err) => {
            let panic_msg = if let Some(s) = panic_err.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_err.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic during HANA connection".to_string()
            };
            hana_error!("CONN", "Connection panicked: {}", panic_msg);
            Err(HanaError::connection(
                &format!("Connection panicked: {}", panic_msg),
                None,
                None,
                "safe_hana_connect"
            ))
        }
    }
}

pub struct HanaScanVTab;

impl HanaScanVTab {
    pub fn signature() -> SignatureBuilder {
        SignatureBuilder::new()
            .param(positional::<String>(0)) // query
            .param(positional::<String>(1)) // url
            // Optional pgwire session id; when supplied, bind and init borrow the
            // session's pooled HANA connection so session-local `#temp` tables survive.
            .param(
                FunctionParameter::new::<Any>("session_id")
                    .default_value(String::new())
                    .kind(FunctionParameterKind::Named),
            )
    }

    fn bind_inner(context: &Context, arguments: &[BindArgument]) -> std::result::Result<HanaScanBindData, Box<dyn Error>> {
        let query = arg_string(arguments, 0)?;
        // Strip trailing semicolons/whitespace. A trailing ';' breaks the
        // schema-detection wrap `SELECT * FROM (<query>) AS subquery LIMIT 1`,
        // which would silently collapse the result to one varchar column.
        let query = query.trim_end().trim_end_matches(';').trim_end().to_string();
        let url = arg_string(arguments, 1)?;
        let session_id = crate::hana_session_pool::parse_session_id(&arg_varchar(context, arguments, 2)?);
        validate_hana_connection(&url)?;
        let (user, password, host, port, database) = parse_hana_url(&url)?;
        let batch_size = std::env::var("HANA_BATCH_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1024);
        let max_retries = std::env::var("HANA_MAX_RETRIES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3);
        if batch_size == 0 || batch_size > 10000 {
            return Err(HanaError::new("Batch size must be between 1 and 10000"));
        }
        let fallback = || {
            (
                vec!["result".to_string()],
                vec![LogicalTypeId::Varchar],
                vec![false],
            )
        };
        let (column_names, column_types, temporal_cols) = match crate::hana_session_pool::get_or_create(session_id, &url) {
            Ok(connection) => match connection.prepare(&query) {
                Ok(_prepared) => {
                    match connection.query(&format!("SELECT * FROM ({}) AS subquery LIMIT 1", query)) {
                        Ok(result_set) => {
                            // metadata() clones an Arc, so the probe ResultSet
                            // can be dropped immediately. Releasing its cursor
                            // here is required because init reuses this same
                            // pooled connection for the real query.
                            let metadata = result_set.metadata();
                            drop(result_set);
                            let mut names = Vec::new();
                            let mut types = Vec::new();
                            let mut temporal = Vec::new();
                            for field_metadata in metadata.iter() {
                                let column_name = if field_metadata.displayname().is_empty() {
                                    field_metadata.columnname().to_string()
                                } else {
                                    field_metadata.displayname().to_string()
                                };
                                let hana_type = field_metadata.type_id();
                                names.push(column_name);
                                types.push(map_hana_type(hana_type));
                                temporal.push(is_temporal_type(hana_type));
                            }
                            if names.is_empty() {
                                fallback()
                            } else {
                                (names, types, temporal)
                            }
                        }
                        Err(e) => {
                            hana_warn!("SCHEMA", "Schema detection failed: {:?}", e);
                            fallback()
                        }
                    }
                }
                Err(e) => {
                    hana_warn!("SCHEMA", "Query prepare failed: {:?}", e);
                    fallback()
                }
            },
            Err(e) => {
                hana_warn!("SCHEMA", "Connection failed, using fallback: {}", e);
                fallback()
            }
        };
        Ok(HanaScanBindData {
            url,
            user,
            password,
            host,
            port,
            database,
            query,
            column_names,
            column_types,
            temporal_cols,
            batch_size,
            max_retries,
            session_id,
        })
    }

    fn init_inner(bind_data_ref: &HanaScanBindData) -> std::result::Result<HanaScanInitData, Box<dyn Error>> {
        let mut connection_result = None;
        let mut last_error = None;
        for attempt in 0..=bind_data_ref.max_retries {
            match crate::hana_session_pool::get_or_create(bind_data_ref.session_id, &bind_data_ref.url) {
                Ok(connection) => {
                    connection_result = Some(connection);
                    break;
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < bind_data_ref.max_retries {
                        hana_debug!("CONN", "Attempt {} failed, retrying ({}/{})",
                                   attempt + 1, attempt + 1, bind_data_ref.max_retries);
                        std::thread::sleep(std::time::Duration::from_millis(100 * (1 << attempt)));
                    }
                }
            }
        }
        match connection_result {
            Some(connection) => {
                let max_rows: usize = std::env::var("HANA_MAX_ROWS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10_000_000);
                match connection.query(&bind_data_ref.query) {
                    Ok(result_set) => {
                        let mut result_rows = Vec::new();
                        for row_result in result_set {
                            match row_result {
                                Ok(row) => {
                                    result_rows.push(row);
                                    if result_rows.len() > max_rows {
                                        return Err(HanaError::new(&format!(
                                            "Result set exceeds {} rows (HANA_MAX_ROWS). \
                                             Add a LIMIT clause or increase HANA_MAX_ROWS.",
                                            max_rows
                                        )));
                                    }
                                }
                                Err(e) => return Err(HanaError::new(&format!("Row read failed: {}", e))),
                            }
                        }
                        Ok(HanaScanInitData {
                            result_rows,
                            current_row: Mutex::new(0),
                        })
                    }
                    Err(e) => Err(HanaError::new(&format!("Query execution failed: {:?}", e))),
                }
            }
            None => {
                let error_msg = if let Some(e) = last_error {
                    format!("Connection failed after {} attempts: {}",
                           bind_data_ref.max_retries + 1, e)
                } else {
                    "Connection failed".to_string()
                };
                Err(HanaError::new(&error_msg))
            }
        }
    }
}

/// Output type for a mapped column; anything unexpected is emitted as VARCHAR.
fn output_type(type_id: LogicalTypeId) -> LogicalTypeId {
    match type_id {
        LogicalTypeId::Boolean
        | LogicalTypeId::SmallInt
        | LogicalTypeId::Integer
        | LogicalTypeId::BigInt
        | LogicalTypeId::Float
        | LogicalTypeId::Double
        | LogicalTypeId::Blob => type_id,
        _ => LogicalTypeId::Varchar,
    }
}

fn cell(row: &Row, col_idx: usize) -> Option<&hdbconnect::HdbValue<'static>> {
    (col_idx < row.len()).then(|| &row[col_idx]).filter(|v| !v.is_null())
}

fn write_column(
    output: &mut DataChunkRef<'_>,
    col_idx: usize,
    column_type: LogicalTypeId,
    is_temporal: bool,
    rows: &[Row],
) -> duckdb_neo::Result<()> {
    macro_rules! primitive {
        ($t:ty) => {{
            let mut vector = output.get_vector_at_mut::<$t>(col_idx)?;
            vector.set_size(rows.len())?;
            let mut writer = vector.writer()?;
            for (row_idx, row) in rows.iter().enumerate() {
                let value = cell(row, col_idx).and_then(|v| v.clone().try_into::<Option<$t>>().ok().flatten());
                writer.set(row_idx, value)?;
            }
        }};
    }
    match output_type(column_type) {
        // map_hana_type maps HANA TINYINT to SmallInt, so this vector is always i16
        LogicalTypeId::SmallInt => primitive!(i16),
        LogicalTypeId::Integer => primitive!(i32),
        LogicalTypeId::BigInt => primitive!(i64),
        LogicalTypeId::Float => primitive!(f32),
        LogicalTypeId::Double => primitive!(f64),
        LogicalTypeId::Boolean => primitive!(bool),
        LogicalTypeId::Blob => {
            let mut vector = output.get_vector_at_mut::<BlobValue>(col_idx)?;
            vector.set_size(rows.len())?;
            let mut writer = vector.writer()?;
            for (row_idx, row) in rows.iter().enumerate() {
                // HdbValue::try_into uses serde, which deserialises Vec<u8>
                // as a sequence (not a byte buffer) and fails for binary.
                // Match the in-memory byte variants directly instead.
                let bytes = match cell(row, col_idx) {
                    Some(hdbconnect::HdbValue::BINARY(bytes))
                    | Some(hdbconnect::HdbValue::GEOMETRY(bytes))
                    | Some(hdbconnect::HdbValue::POINT(bytes))
                    | Some(hdbconnect::HdbValue::DBSTRING(bytes)) => Some(bytes.as_slice()),
                    _ => None,
                };
                writer.set(row_idx, bytes)?;
            }
        }
        _ => {
            let mut vector = output.get_vector_at_mut::<String>(col_idx)?;
            vector.set_size(rows.len())?;
            let mut writer = vector.writer()?;
            for (row_idx, row) in rows.iter().enumerate() {
                let value = cell(row, col_idx)
                    .and_then(|v| v.clone().try_into::<Option<String>>().ok().flatten())
                    .map(|s| if is_temporal { normalize_hana_timestamp(&s) } else { s });
                writer.set(row_idx, value.as_deref())?;
            }
        }
    }
    Ok(())
}

impl TableFunctionCallbacks for HanaScanVTab {
    type BindData = HanaScanBindData;
    type GlobalState = HanaScanInitData;
    type LocalState = ();

    fn bind(
        &self,
        context: &Context,
        arguments: Vec<BindArgument>,
        bind_handle: BindFunctionHandle<'_>,
    ) -> duckdb_neo::Result<Self::BindData> {
        let bind_data = Self::bind_inner(context, &arguments).map_err(bind_error)?;
        // Track emitted names so we can de-duplicate: duckdb's binder rejects
        // duplicate result column names, which would otherwise hard-fail any
        // query (e.g. a join) that projects two same-named columns.
        let mut name_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for (name, type_id) in bind_data.column_names.iter().zip(bind_data.column_types.iter()) {
            let logical_type = context.logical_type_create_from_id(output_type(*type_id), Parameters::None)?;
            let count = name_counts.entry(name.clone()).or_insert(0);
            let unique_name = if *count == 0 { name.clone() } else { format!("{}_{}", name, count) };
            *count += 1;
            bind_handle.add_result_column(&unique_name, &logical_type)?;
        }
        Ok(bind_data)
    }

    fn init_global_state(
        &self,
        bind_data: &Self::BindData,
        _context: &Context,
        _column_data: InitColumnData<'_>,
    ) -> duckdb_neo::Result<(Option<Self::GlobalState>, Option<usize>)> {
        let init_data = Self::init_inner(bind_data).map_err(exec_error)?;
        Ok((Some(init_data), Some(1)))
    }

    fn exec(
        &self,
        bind_data: &Self::BindData,
        global_state: Option<&Self::GlobalState>,
        _local_state: Option<&mut Self::LocalState>,
        _context: &Context,
        mut output: DataChunkRef<'_>,
        _column_info: ExecColumnInfo<'_>,
    ) -> duckdb_neo::Result<()> {
        let init_data = global_state.ok_or_else(|| exec_error(HanaError::new("Scan state not initialized")))?;
        let mut current_row = init_data
            .current_row
            .lock()
            .map_err(|_| exec_error(HanaError::new("Lock error: current_row")))?;
        let total_rows = init_data.result_rows.len();
        if *current_row >= total_rows {
            return Ok(());
        }
        let batch_size = (total_rows - *current_row)
            .min(bind_data.batch_size)
            .min(output.capacity()?);
        let rows = &init_data.result_rows[*current_row..*current_row + batch_size];
        for (col_idx, column_type) in bind_data.column_types.iter().enumerate() {
            let is_temporal = bind_data.temporal_cols.get(col_idx).copied().unwrap_or(false);
            write_column(&mut output, col_idx, *column_type, is_temporal, rows)?;
        }
        *current_row += batch_size;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_parse_hana_url_valid() {
        let url = "hdbsql://testuser:testpass@localhost:30015/HDB";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.0, "testuser");
        assert_eq!(result.1, "testpass");
        assert_eq!(result.2, "localhost");
        assert_eq!(result.3, 30015);
        assert_eq!(result.4, "HDB");
    }
    #[test]
    fn test_parse_hana_url_with_query_params() {
        let url = "hdbsql://user:pass@server:30041/MYDB?ssl=true&timeout=30";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.0, "user");
        assert_eq!(result.1, "pass");
        assert_eq!(result.2, "server");
        assert_eq!(result.3, 30041);
        assert_eq!(result.4, "MYDB");
    }
    #[test]
    fn test_parse_hana_url_invalid_scheme() {
        let url = "mysql://user:pass@host:3306/db";
        let result = parse_hana_url(url);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("URL must start with hdbsql:// or hdbsqls://"));
    }
    #[test]
    fn test_parse_hana_url_ssl_scheme() {
        let url = "hdbsqls://user:pass@server:30041/MYDB";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.0, "user");
        assert_eq!(result.1, "pass");
        assert_eq!(result.2, "server");
        assert_eq!(result.3, 30041);
        assert_eq!(result.4, "MYDB");
    }
    #[test]
    fn test_parse_hana_url_ssl_with_tls_options() {
        let url = "hdbsqls://user:pass@server:30041/MYDB?use_mozillas_root_certificates";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.0, "user");
        assert_eq!(result.4, "MYDB");
    }
    #[test]
    fn test_parse_hana_url_ssl_with_cert_dir() {
        let url = "hdbsqls://user:pass@server:30041/MYDB?tls_certificate_dir=/path/to/certs";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.0, "user");
    }
    #[test]
    fn test_parse_hana_url_missing_auth() {
        let url = "hdbsql://localhost:30015/HDB";
        let result = parse_hana_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("missing '@' separator"));
    }
    #[test]
    fn test_parse_hana_url_missing_port() {
        let url = "hdbsql://user:pass@localhost/HDB";
        let result = parse_hana_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("missing ':' for port"));
    }
    #[test]
    fn test_parse_hana_url_invalid_port() {
        let url = "hdbsql://user:pass@localhost:abc/HDB";
        let result = parse_hana_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid port number"));
    }
    #[test]
    fn test_parse_hana_url_empty_credentials() {
        let url = "hdbsql://:@localhost:30015/HDB";
        let result = parse_hana_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Username cannot be empty"));
    }
    #[test]
    fn test_validate_hana_connection_valid() {
        let url = "hdbsql://user:pass@localhost:30015/HDB";
        let result = validate_hana_connection(url);
        assert!(result.is_ok());
    }
    #[test]
    fn test_validate_hana_connection_long_hostname() {
        let long_host = "a".repeat(256);
        let url = format!("hdbsql://user:pass@{}:30015/HDB", long_host);
        let result = validate_hana_connection(&url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Host name too long"));
    }
    #[test]
    fn test_validate_hana_connection_long_database() {
        let long_db = "a".repeat(129);
        let url = format!("hdbsql://user:pass@localhost:30015/{}", long_db);
        let result = validate_hana_connection(&url);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Database name too long"));
    }
    #[test]
    fn test_map_hana_type_integers() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::INT), LogicalTypeId::Integer);
        assert_eq!(map_hana_type(hdbconnect::TypeId::BIGINT), LogicalTypeId::BigInt);
        assert_eq!(map_hana_type(hdbconnect::TypeId::SMALLINT), LogicalTypeId::SmallInt);
        assert_eq!(map_hana_type(hdbconnect::TypeId::TINYINT), LogicalTypeId::SmallInt);
    }
    #[test]
    fn test_map_hana_type_floats() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::REAL), LogicalTypeId::Float);
        assert_eq!(map_hana_type(hdbconnect::TypeId::DOUBLE), LogicalTypeId::Double);
        // HANA delivers DECIMAL via the FIXED* transport ids; the whole
        // decimal family maps to DOUBLE so values arrive numeric.
        assert_eq!(map_hana_type(hdbconnect::TypeId::DECIMAL), LogicalTypeId::Double);
        assert_eq!(map_hana_type(hdbconnect::TypeId::FIXED8), LogicalTypeId::Double);
        assert_eq!(map_hana_type(hdbconnect::TypeId::FIXED12), LogicalTypeId::Double);
        assert_eq!(map_hana_type(hdbconnect::TypeId::FIXED16), LogicalTypeId::Double);
    }

    #[test]
    fn test_normalize_hana_timestamp() {
        assert_eq!(normalize_hana_timestamp("2024-01-15T12:34:56.7890000"), "2024-01-15 12:34:56.789");
        assert_eq!(normalize_hana_timestamp("2024-01-15T12:34:56.0000000"), "2024-01-15 12:34:56");
        assert_eq!(normalize_hana_timestamp("2024-01-15"), "2024-01-15");
        assert_eq!(normalize_hana_timestamp("12:34:56"), "12:34:56");
    }
    #[test]
    fn test_map_hana_type_strings() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::VARCHAR), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::CHAR), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::NVARCHAR), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::STRING), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::CLOB), LogicalTypeId::Varchar);
    }
    #[test]
    fn test_map_hana_type_dates() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::DAYDATE), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::SECONDTIME), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::LONGDATE), LogicalTypeId::Varchar);
        assert_eq!(map_hana_type(hdbconnect::TypeId::SECONDDATE), LogicalTypeId::Varchar);
    }
    #[test]
    fn test_map_hana_type_binary() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::BINARY), LogicalTypeId::Blob);
        assert_eq!(map_hana_type(hdbconnect::TypeId::VARBINARY), LogicalTypeId::Blob);
        assert_eq!(map_hana_type(hdbconnect::TypeId::BLOB), LogicalTypeId::Blob);
    }
    #[test]
    fn test_map_hana_type_boolean() {
        assert_eq!(map_hana_type(hdbconnect::TypeId::BOOLEAN), LogicalTypeId::Boolean);
    }
    #[test]
    fn test_hana_error_creation() {
        let error = HanaError::new("Test error message");
        assert!(format!("{}", error).contains("Test error message"));
        assert!(format!("{}", error).contains("HANA Internal Error"));
    }
    #[test]
    fn test_hana_error_display() {
        let error = HanaError::connection("Connection failed", Some("hdbsql://test"), Some(3), "bind phase");
        let display = format!("{}", error);
        assert!(display.contains("Connection failed"));
        assert!(display.contains("hdbsql://test"));
        assert!(display.contains("Retries: 3"));
        assert!(display.contains("bind phase"));
    }
    #[test]
    fn test_hana_scan_bind_data_clone() {
        let bind_data = HanaScanBindData {
            url: "hdbsql://user:pass@host:30015/db".to_string(),
            user: "user".to_string(),
            password: "pass".to_string(),
            host: "host".to_string(),
            port: 30015,
            database: "db".to_string(),
            query: "SELECT * FROM test".to_string(),
            column_names: vec!["col1".to_string(), "col2".to_string()],
            column_types: vec![LogicalTypeId::Integer, LogicalTypeId::Varchar],
            temporal_cols: vec![false, false],
            batch_size: 1024,
            max_retries: 3,
            session_id: 0,
        };
        let cloned = bind_data.clone();
        assert_eq!(bind_data.url, cloned.url);
        assert_eq!(bind_data.user, cloned.user);
        assert_eq!(bind_data.column_names, cloned.column_names);
        assert_eq!(bind_data.batch_size, cloned.batch_size);
    }
    #[test]
    fn test_url_parsing_edge_cases() {
        let url = "hdbsql://user:p!ss#word@host:30015/db";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.1, "p!ss#word");

        let url = "hdbsql://user:pass@host:30015/123";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.4, "123");

        let url = "hdbsql://user:pass@192.168.1.100:30015/db";
        let result = parse_hana_url(url).unwrap();
        assert_eq!(result.2, "192.168.1.100");
    }
    #[test]
    fn test_port_range_warnings() {
        let url = "hdbsql://user:pass@host:3306/db";
        let result = validate_hana_connection(url);
        assert!(result.is_ok());
    }
}
