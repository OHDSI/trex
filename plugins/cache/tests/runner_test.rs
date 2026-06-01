use cache::dialect::{AttachHandle, SourceConfig, SourceDialect};
use cache::exec::{DuckDbExecutor, SqlExecutor};
use cache::runner::run_cache;
use cache::sql::quote_ident;
use duckdb::Connection;

/// Test dialect: attaches another DuckDB database (built-in, no external scanner).
struct DuckDbSourceDialect;

impl SourceDialect for DuckDbSourceDialect {
    fn attach(&self, exec: &dyn SqlExecutor, alias: &str, cfg: &SourceConfig)
        -> Result<AttachHandle, String> {
        exec.execute(&format!(
            "ATTACH '{}' AS {} (TYPE duckdb, READ_ONLY)",
            cfg.source.replace('\'', "''"),
            quote_ident(alias)
        ))?;
        Ok(AttachHandle { alias: alias.to_string(), schema: cfg.schema.clone() })
    }
    fn list_tables(&self, exec: &dyn SqlExecutor, h: &AttachHandle) -> Result<Vec<String>, String> {
        exec.query_strings(&cache::sql::list_tables_sql(&h.alias, &h.schema))
    }
    fn source_ref(&self, h: &AttachHandle, table: &str) -> String {
        format!("{}.{}.{}", quote_ident(&h.alias), quote_ident(&h.schema), quote_ident(table))
    }
    fn detach(&self, exec: &dyn SqlExecutor, h: &AttachHandle) -> Result<(), String> {
        exec.execute(&format!("DETACH {}", quote_ident(&h.alias)))
    }
}

#[test]
fn copies_all_tables_from_source_into_target_schema() {
    let src_path = std::env::temp_dir()
        .join(format!("cache_runner_test_src_{}.duckdb", std::process::id()));
    let _ = std::fs::remove_file(&src_path);

    // Build a source database with two tables.
    {
        let src = Connection::open(&src_path).unwrap();
        src.execute_batch(
            "CREATE TABLE orders(id INTEGER, total DOUBLE);
             INSERT INTO orders VALUES (1, 9.5), (2, 4.0);
             CREATE TABLE users(id INTEGER, name VARCHAR);
             INSERT INTO users VALUES (1, 'ada');",
        )
        .unwrap();
    }

    // Run the cache into an in-memory local store.
    let local = Connection::open_in_memory().unwrap();
    let exec = DuckDbExecutor::new(&local);
    let cfg = SourceConfig {
        source: src_path.to_string_lossy().to_string(),
        schema: "main".to_string(),
        target: "src_cache".to_string(),
    };

    let summary = run_cache(&exec, &DuckDbSourceDialect, &cfg).unwrap();

    assert_eq!(summary.copied, 2);
    assert_eq!(summary.tables, vec!["orders".to_string(), "users".to_string()]);
    assert_eq!(summary.rows, 3); // 2 orders + 1 user
    assert_eq!(summary.target_schema, "src_cache");

    // Verify the data actually landed locally.
    let n: i64 = local
        .query_row("SELECT count(*) FROM src_cache.orders", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 2);

    let _ = std::fs::remove_file(&src_path);
}

#[test]
fn empty_source_schema_yields_warning() {
    let src_path = std::env::temp_dir().join(format!("cache_runner_empty_{}.duckdb", std::process::id()));
    let _ = std::fs::remove_file(&src_path);
    {
        let src = Connection::open(&src_path).unwrap();
        src.execute_batch("CREATE TABLE t(id INTEGER); INSERT INTO t VALUES (1);").unwrap();
    }
    let local = Connection::open_in_memory().unwrap();
    let exec = DuckDbExecutor::new(&local);
    let cfg = SourceConfig {
        source: src_path.to_string_lossy().to_string(),
        schema: "does_not_exist".to_string(),
        target: "empty_cache".to_string(),
    };
    let summary = run_cache(&exec, &DuckDbSourceDialect, &cfg).unwrap();
    assert_eq!(summary.copied, 0);
    assert!(summary.tables.is_empty());
    let w = summary.warning.expect("expected a warning for empty schema");
    assert!(w.contains("does_not_exist"), "warning should name the schema: {w}");
    let _ = std::fs::remove_file(&src_path);
}
