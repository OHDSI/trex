use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use duckdb::{Config, Connection};

/// Redact credentials from error messages to avoid leaking them in logs
fn redact_url(msg: &str) -> String {
    let mut result = msg.to_string();
    for key in ["password=", "user="] {
        while let Some(start) = result.find(key) {
            let val_start = start + key.len();
            let end = result[val_start..].find(|c: char| c.is_whitespace() || c == '&' || c == '\'' || c == '"')
                .map(|i| val_start + i)
                .unwrap_or(result.len());
            result.replace_range(val_start..end, "***");
        }
    }
    result
}

fn is_data_node() -> bool {
    let cfg = match env::var("SWARM_CONFIG") {
        Ok(v) => v,
        Err(_) => return true, // standalone fallback
    };
    let node = match env::var("SWARM_NODE") {
        Ok(v) => v,
        Err(_) => return true,
    };
    let parsed: serde_json::Value = match serde_json::from_str(&cfg) {
        Ok(v) => v,
        Err(_) => return true,
    };
    parsed
        .get("nodes")
        .and_then(|n| n.get(&node))
        .and_then(|n| n.get("data_node"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Split a PATH-style, colon-separated EXTENSION_DIR value into directories.
fn parse_extension_dirs(val: &str) -> Vec<String> {
    val.split(':')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Sort so pool.trex loads first (other extensions depend on the shared
/// connection pool); everything else is lexicographic.
fn sort_extension_paths(paths: &mut [PathBuf]) {
    paths.sort_by(|a, b| {
        let a_is_pool = a.file_stem().and_then(|s| s.to_str()) == Some("pool");
        let b_is_pool = b.file_stem().and_then(|s| s.to_str()) == Some("pool");
        match (a_is_pool, b_is_pool) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let a_str = a.to_string_lossy();
                let b_str = b.to_string_lossy();
                a_str.cmp(&b_str)
            }
        }
    });
}

/// Collect loadable extension files (.trex / .duckdb_extension) across all
/// dirs, applying the per-dir canonicalize containment check, then sort with
/// pool.trex first globally.
fn collect_extension_paths(dirs: &[String]) -> Vec<PathBuf> {
    let mut ext_paths: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        let ext_path = Path::new(dir);
        if !ext_path.is_dir() {
            println!("Warning: extension dir {dir} does not exist");
            continue;
        }
        match fs::read_dir(ext_path) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let path = match entry.path().canonicalize() {
                        Ok(p) => p,
                        Err(e) => {
                            println!(
                                "Warning: could not resolve {}: {e}",
                                entry.path().display()
                            );
                            continue;
                        }
                    };
                    if let Ok(canonical_ext) = ext_path.canonicalize() {
                        if !path.starts_with(&canonical_ext) {
                            println!(
                                "Warning: skipping {} (outside extension dir)",
                                path.display()
                            );
                            continue;
                        }
                    }
                    let ext = path.extension().and_then(|e| e.to_str());
                    if ext == Some("trex") || ext == Some("duckdb_extension") {
                        ext_paths.push(path);
                    }
                }
            }
            Err(e) => println!("Warning: could not read extension dir {dir}: {e}"),
        }
    }
    sort_extension_paths(&mut ext_paths);
    ext_paths
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let check_mode = args.iter().any(|a| a == "--check");
    // `trex bundle <entrypoint> <output>`: compile a Deno worker to an eszip via
    // trexas trex_create_bundle(), then exit. Used at image-build time.
    let bundle_mode = args.get(1).map(|s| s == "bundle").unwrap_or(false);

    let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| ":memory:".to_string());
    let ext_dir = env::var("EXTENSION_DIR")
        .unwrap_or_else(|_| "/usr/lib/trexsql/extensions".to_string());

    println!("Opening database: {db_path}");
    let config = Config::default()
        .allow_unsigned_extensions()
        .expect("Failed to set config");
    let conn = Connection::open_with_flags(&db_path, config)
        .expect("Failed to open database");

    conn.execute_batch("SET autoinstall_known_extensions=true; SET autoload_known_extensions=true;")
        .expect("Failed to enable autoinstall/autoload");

    let mut loaded = 0u32;
    let mut failures = 0u32;
    // EXTENSION_DIR may be a colon-separated list; the entrypoint appends the
    // gated /usr/lib/trexsql/extensions-dx dir when TREX_DX_ENABLED=true.
    let ext_paths = collect_extension_paths(&parse_extension_dirs(&ext_dir));
    for path in &ext_paths {
        let path_str = path.display().to_string();
        let safe_path = path_str.replace("'", "''");
        print!("Loading extension: {path_str} ... ");
        match conn.execute(&format!("LOAD '{safe_path}'"), []) {
            Ok(_) => {
                println!("ok");
                loaded += 1;
            }
            Err(e) => {
                println!("FAILED: {e}");
                failures += 1;
            }
        }
    }

    // Runs after extensions load (trexas provides trex_create_bundle) and before
    // the postgres attach, which bundling does not need.
    if bundle_mode {
        let entrypoint = args.get(2).cloned().unwrap_or_default();
        let output = args.get(3).cloned().unwrap_or_default();
        if entrypoint.is_empty() || output.is_empty() {
            eprintln!("usage: trex bundle <entrypoint> <output>");
            process::exit(2);
        }
        let safe_entry = entrypoint.replace('\'', "''");
        let safe_output = output.replace('\'', "''");
        println!("Bundling {entrypoint} -> {output}");
        let sql =
            format!("SELECT trex_create_bundle('{safe_entry}', '{safe_output}')");
        match conn.query_row(&sql, [], |row| row.get::<usize, String>(0)) {
            // Returns a status VARCHAR; "Error ..." means the bundle failed.
            Ok(msg) => {
                println!("{msg}");
                if msg.contains("Error") {
                    process::exit(1);
                }
                return;
            }
            Err(e) => {
                eprintln!("Bundle failed: {e}");
                process::exit(1);
            }
        }
    }

    // Attach PostgreSQL as _config so extensions can access the configuration database
    if let Ok(database_url) = env::var("DATABASE_URL") {
        let safe_url = database_url.replace('\'', "''");
        print!("Attaching config database ... ");
        match conn.execute("INSTALL postgres", []) {
            Ok(_) => {}
            Err(e) => {
                println!("FAILED to install postgres scanner: {e}");
            }
        }
        // Cap on real connections the postgres extension opens per attached
        // catalog. Must be >= TREX_POOL_SIZE, else pooled sessions that touch
        // `_config.*` race for too few Postgres slots and fail with
        // "PostgresConnectionPool maximum connection count exceeded". The
        // extension default is 64; keep this in lockstep with the pool size.
        let pg_connection_limit: usize = env::var("TREX_PG_CONNECTION_LIMIT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1024)
            .max(1);
        if let Err(e) = conn.execute(
            &format!("SET pg_connection_limit = {pg_connection_limit}"),
            [],
        ) {
            println!("WARN: failed to set pg_connection_limit: {e}");
        }
        let attach_sql = format!("ATTACH '{safe_url}' AS _config (TYPE postgres)");
        match conn.execute(&attach_sql, []) {
            Ok(_) => println!("ok"),
            Err(e) => println!("FAILED: {}", redact_url(&e.to_string())),
        }
    }

    // Run core schema migrations via the migration extension
    if let Ok(schema_dir) = env::var("SCHEMA_DIR") {
        if is_data_node() {
            let safe_dir = schema_dir.replace('\'', "''");
            let migration_sql = format!(
                "SELECT * FROM trex_migration_run_schema('{safe_dir}', 'trexdb', '_config')"
            );
            print!("Running core schema migrations ... ");
            match conn.execute(&migration_sql, []) {
                Ok(_) => println!("ok"),
                Err(e) => eprintln!("FAILED: {e}"),
            }
        } else {
            println!("Skipping schema migrations (this node is not a data node)");
        }
    }

    if check_mode {
        if failures > 0 {
            println!("{failures} extension(s) failed to load");
            process::exit(1);
        }
        if loaded == 0 {
            println!("No extensions found in {ext_dir}");
            process::exit(1);
        }
        println!("All {loaded} extension(s) loaded successfully");
        return;
    }

    eprintln!("TrexSQL ready. Waiting for shutdown signal...");

    #[cfg(unix)]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let shutdown = Arc::new(AtomicBool::new(false));

        signal_hook::flag::register(signal_hook::consts::SIGTERM, Arc::clone(&shutdown))
            .expect("Failed to register SIGTERM handler");
        signal_hook::flag::register(signal_hook::consts::SIGINT, Arc::clone(&shutdown))
            .expect("Failed to register SIGINT handler");

        while !shutdown.load(Ordering::Acquire) {
            std::thread::park_timeout(std::time::Duration::from_secs(1));
        }
    }

    #[cfg(not(unix))]
    {
        std::thread::park();
    }

    eprintln!("Shutting down.");
    drop(conn);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_extension_dirs_splits_on_colon() {
        assert_eq!(
            parse_extension_dirs("/usr/lib/trexsql/extensions:/usr/lib/trexsql/extensions-dx"),
            vec![
                "/usr/lib/trexsql/extensions".to_string(),
                "/usr/lib/trexsql/extensions-dx".to_string()
            ]
        );
    }

    #[test]
    fn parse_extension_dirs_single_dir_and_trimming() {
        assert_eq!(
            parse_extension_dirs("/usr/lib/trexsql/extensions"),
            vec!["/usr/lib/trexsql/extensions".to_string()]
        );
        assert_eq!(parse_extension_dirs(" /a : :/b:"), vec!["/a".to_string(), "/b".to_string()]);
    }

    #[test]
    fn sort_extension_paths_puts_pool_first_across_dirs() {
        let mut paths = vec![
            PathBuf::from("/ext-dx/devx_ext.trex"),
            PathBuf::from("/ext/trexas.trex"),
            PathBuf::from("/ext/pool.trex"),
            PathBuf::from("/ext/aaa.trex"),
        ];
        sort_extension_paths(&mut paths);
        assert_eq!(paths[0], PathBuf::from("/ext/pool.trex"));
        assert_eq!(paths[1], PathBuf::from("/ext-dx/devx_ext.trex"));
        assert_eq!(paths[2], PathBuf::from("/ext/aaa.trex"));
        assert_eq!(paths[3], PathBuf::from("/ext/trexas.trex"));
    }

    #[test]
    fn collect_extension_paths_walks_multiple_dirs() {
        // Manual temp dirs (no tempfile dep in this crate).
        let base = std::env::temp_dir().join(format!("trex-ext-test-{}", std::process::id()));
        let dir_a = base.join("a");
        let dir_b = base.join("b");
        fs::create_dir_all(&dir_a).unwrap();
        fs::create_dir_all(&dir_b).unwrap();
        fs::write(dir_a.join("zeta.trex"), b"x").unwrap();
        fs::write(dir_a.join("ignored.txt"), b"x").unwrap();
        fs::write(dir_b.join("pool.trex"), b"x").unwrap();

        let dirs = vec![
            dir_a.to_string_lossy().to_string(),
            dir_b.to_string_lossy().to_string(),
            base.join("missing").to_string_lossy().to_string(), // nonexistent: warn + skip
        ];
        let paths = collect_extension_paths(&dirs);

        let names: Vec<String> = paths
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["pool.trex".to_string(), "zeta.trex".to_string()]);

        fs::remove_dir_all(&base).unwrap();
    }
}
