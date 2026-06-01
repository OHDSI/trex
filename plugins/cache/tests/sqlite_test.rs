use cache::dialect::{Dialect, NativeScannerDialect, SourceConfig};
use cache::exec::DuckDbExecutor;
use cache::runner::run_cache;
use duckdb::Connection;

#[test]
#[ignore = "requires the duckdb sqlite scanner; run with --ignored"]
fn caches_sqlite_source_schema() {
    // Create a SQLite source file using the sqlite scanner's writer.
    let src_path = std::env::temp_dir().join(format!("cache_sqlite_src_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&src_path);

    let local = Connection::open_in_memory().unwrap();
    local
        .execute_batch("INSTALL sqlite; LOAD sqlite;")
        .expect("sqlite scanner must be available for this test");

    // Seed the source via a throwaway attach (writable).
    local
        .execute_batch(&format!(
            "ATTACH '{}' AS seed (TYPE sqlite);
             CREATE TABLE seed.main.widgets(id INTEGER, label VARCHAR);
             INSERT INTO seed.main.widgets VALUES (1, 'a'), (2, 'b'), (3, 'c');
             DETACH seed;",
            src_path.to_string_lossy()
        ))
        .unwrap();

    let exec = DuckDbExecutor::new(&local);
    let cfg = SourceConfig {
        source: src_path.to_string_lossy().to_string(),
        schema: "main".to_string(),
        target: "sqlite_cache".to_string(),
    };
    let summary = run_cache(&exec, &NativeScannerDialect::new(Dialect::Sqlite), &cfg).unwrap();

    assert_eq!(summary.copied, 1);
    assert_eq!(summary.tables, vec!["widgets".to_string()]);
    assert_eq!(summary.rows, 3);

    let n: i64 = local
        .query_row("SELECT count(*) FROM sqlite_cache.widgets", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 3);

    let _ = std::fs::remove_file(&src_path);
}
