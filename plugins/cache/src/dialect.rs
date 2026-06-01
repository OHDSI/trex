use crate::exec::SqlExecutor;
use crate::sql::list_tables_sql;
use crate::sql::quote_ident;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Postgres,
    MySql,
    Sqlite,
    BigQuery,
}

impl Dialect {
    pub fn from_str(s: &str) -> Result<Dialect, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "postgres" | "postgresql" => Ok(Dialect::Postgres),
            "mysql" => Ok(Dialect::MySql),
            "sqlite" => Ok(Dialect::Sqlite),
            "bigquery" => Ok(Dialect::BigQuery),
            other => Err(format!("unsupported dialect '{other}' (expected one of: postgres, mysql, sqlite, bigquery)")),
        }
    }

    /// The DuckDB ATTACH `TYPE` token for this dialect.
    pub fn attach_type(&self) -> &'static str {
        match self {
            Dialect::Postgres => "postgres",
            Dialect::MySql => "mysql",
            Dialect::Sqlite => "sqlite",
            Dialect::BigQuery => "bigquery",
        }
    }

    /// Short name used for default target-schema naming.
    pub fn name(&self) -> &'static str {
        self.attach_type()
    }

    /// Whether the scanner supports the READ_ONLY attach option.
    pub fn supports_read_only(&self) -> bool {
        // BigQuery is inherently read-only and rejects the option.
        !matches!(self, Dialect::BigQuery)
    }

    /// The attached-catalog schema that actually holds the tables.
    /// SQLite always uses `main`; others use the requested schema.
    pub fn effective_schema(&self, requested: &str) -> String {
        match self {
            Dialect::Sqlite => "main".to_string(),
            _ => requested.to_string(),
        }
    }
}

/// Double single-quotes for embedding inside a single-quoted SQL literal.
fn escape_literal(s: &str) -> String {
    s.replace('\'', "''")
}

/// Build the `ATTACH` statement for a source connection.
pub fn build_attach_sql(dialect: Dialect, source: &str, alias: &str) -> String {
    let opts = if dialect.supports_read_only() {
        format!("TYPE {}, READ_ONLY", dialect.attach_type())
    } else {
        format!("TYPE {}", dialect.attach_type())
    };
    format!(
        "ATTACH '{}' AS {} ({})",
        escape_literal(source),
        quote_ident(alias),
        opts
    )
}

/// Default local target schema name when the caller omits `target`.
pub fn default_target(dialect: Dialect, effective_schema: &str) -> String {
    format!("{}_{}", dialect.name(), effective_schema)
}

/// Resolved inputs for one cache run.
#[derive(Debug, Clone)]
pub struct SourceConfig {
    pub source: String,
    pub schema: String,
    pub target: String,
}

/// Opaque handle returned by `attach`, describing how to reach source tables.
#[derive(Debug, Clone)]
pub struct AttachHandle {
    pub alias: String,
    pub schema: String,
}

/// Per-dialect behaviour. v1 has one impl; a custom-function HANA impl can be
/// added later without changing the runner.
pub trait SourceDialect {
    fn attach(&self, exec: &dyn SqlExecutor, alias: &str, cfg: &SourceConfig)
        -> Result<AttachHandle, String>;
    fn list_tables(&self, exec: &dyn SqlExecutor, handle: &AttachHandle)
        -> Result<Vec<String>, String>;
    fn source_ref(&self, handle: &AttachHandle, table: &str) -> String;
    fn detach(&self, exec: &dyn SqlExecutor, handle: &AttachHandle) -> Result<(), String>;
}

/// Dialects integrated via DuckDB native `ATTACH … (TYPE …)`.
pub struct NativeScannerDialect {
    pub dialect: Dialect,
}

impl NativeScannerDialect {
    pub fn new(dialect: Dialect) -> Self {
        Self { dialect }
    }
}

impl SourceDialect for NativeScannerDialect {
    fn attach(&self, exec: &dyn SqlExecutor, alias: &str, cfg: &SourceConfig)
        -> Result<AttachHandle, String> {
        exec.execute(&build_attach_sql(self.dialect, &cfg.source, alias))?;
        Ok(AttachHandle {
            alias: alias.to_string(),
            schema: self.dialect.effective_schema(&cfg.schema),
        })
    }

    fn list_tables(&self, exec: &dyn SqlExecutor, handle: &AttachHandle)
        -> Result<Vec<String>, String> {
        exec.query_strings(&list_tables_sql(&handle.alias, &handle.schema))
    }

    fn source_ref(&self, handle: &AttachHandle, table: &str) -> String {
        format!(
            "{}.{}.{}",
            quote_ident(&handle.alias),
            quote_ident(&handle.schema),
            quote_ident(table)
        )
    }

    fn detach(&self, exec: &dyn SqlExecutor, handle: &AttachHandle) -> Result<(), String> {
        exec.execute(&format!("DETACH {}", quote_ident(&handle.alias)))
    }
}
