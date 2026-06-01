use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use serde::Serialize;

use crate::dialect::{AttachHandle, SourceConfig, SourceDialect};
use crate::exec::SqlExecutor;
use crate::sql::{copy_table, count_rows, create_schema};

static ALIAS_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_alias() -> String {
    format!("cache_src_{}", ALIAS_SEQ.fetch_add(1, Ordering::Relaxed))
}

#[derive(Debug, Serialize)]
pub struct Summary {
    pub tables: Vec<String>,
    pub copied: usize,
    pub rows: u64,
    pub target_schema: String,
    pub elapsed_ms: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

/// Snapshot every table of `cfg.schema` into the local `cfg.target` schema.
/// Fails the whole run on the first table error (drop+recreate is idempotent,
/// so re-running after a fix is safe). Always attempts DETACH on the way out.
pub fn run_cache(
    exec: &dyn SqlExecutor,
    dialect: &dyn SourceDialect,
    cfg: &SourceConfig,
) -> Result<Summary, String> {
    let started = Instant::now();
    let alias = next_alias();
    let handle = dialect.attach(exec, &alias, cfg)?;

    let result = copy_all(exec, dialect, &handle, cfg);
    // Best-effort detach regardless of outcome.
    let _ = dialect.detach(exec, &handle);
    let (tables, rows) = result?;

    let warning = if tables.is_empty() {
        Some(format!(
            "no tables found in source schema '{}' (attached catalog '{}'); \
             the source's catalog schema name may differ from the requested schema \
             for this dialect — verify the dialect's schema mapping",
            cfg.schema, handle.alias
        ))
    } else {
        None
    };

    Ok(Summary {
        copied: tables.len(),
        rows,
        tables,
        target_schema: cfg.target.clone(),
        elapsed_ms: started.elapsed().as_millis(),
        warning,
    })
}

fn copy_all(
    exec: &dyn SqlExecutor,
    dialect: &dyn SourceDialect,
    handle: &AttachHandle,
    cfg: &SourceConfig,
) -> Result<(Vec<String>, u64), String> {
    exec.execute(&create_schema(&cfg.target))?;
    let tables = dialect.list_tables(exec, handle)?;
    let mut rows: u64 = 0;
    for table in &tables {
        let src_ref = dialect.source_ref(handle, table);
        exec.execute(&copy_table(&cfg.target, table, &src_ref))
            .map_err(|e| format!("failed copying table '{table}': {e}"))?;
        let counts = exec.query_strings(&count_rows(&cfg.target, table))?;
        if let Some(c) = counts.first() {
            rows += c
                .parse::<u64>()
                .map_err(|e| format!("unexpected row count '{c}' for table '{table}': {e}"))?;
        }
    }
    Ok((tables, rows))
}
