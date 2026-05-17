use std::env;
use std::fs;
use std::path::Path;
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

/// Start services from SWARM_CONFIG after all extensions are loaded.
fn start_swarm_services(conn: &Connection, swarm_json: &str, swarm_node: &str) {
    let node_key = format!("\"{}\"", swarm_node);
    let node_start = match swarm_json.find(&node_key) {
        Some(pos) => pos,
        None => return,
    };

    let after_node = &swarm_json[node_start..];
    let ext_start = match after_node.find("\"extensions\"") {
        Some(pos) => node_start + pos,
        None => return,
    };

    let rest = &swarm_json[ext_start..];
    let arr_start = match rest.find('[') {
        Some(pos) => ext_start + pos,
        None => return,
    };

    let arr_bytes = swarm_json[arr_start..].as_bytes();
    let mut depth = 0i32;
    let mut arr_end = arr_start;
    for (i, &b) in arr_bytes.iter().enumerate() {
        match b {
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    arr_end = arr_start + i + 1;
                    break;
                }
            }
            _ => {}
        }
    }

    let extensions_str = &swarm_json[arr_start..arr_end];
    let mut pos = 0;
    while let Some(name_start) = extensions_str[pos..].find("\"name\"") {
        let abs = pos + name_start;
        let after_name = &extensions_str[abs + 6..];
        let colon = match after_name.find(':') {
            Some(p) => p,
            None => break,
        };
        let after_colon = &after_name[colon + 1..];
        let q1 = match after_colon.find('"') {
            Some(p) => p,
            None => break,
        };
        let after_q1 = &after_colon[q1 + 1..];
        let q2 = match after_q1.find('"') {
            Some(p) => p,
            None => break,
        };
        let ext_name = &after_q1[..q2];

        let search_start = abs + 6 + colon + 1 + q1 + 1 + q2 + 1;
        let remaining = &extensions_str[search_start..];

        let config_json = if let Some(cfg_pos) = remaining.find("\"config\"") {
            let after_cfg = &remaining[cfg_pos + 8..];
            if let Some(brace) = after_cfg.find('{') {
                let obj_start_abs = search_start + cfg_pos + 8 + brace;
                let obj_bytes = extensions_str[obj_start_abs..].as_bytes();
                let mut d = 0i32;
                let mut obj_end = obj_start_abs;
                for (i, &b) in obj_bytes.iter().enumerate() {
                    match b {
                        b'{' => d += 1,
                        b'}' => {
                            d -= 1;
                            if d == 0 {
                                obj_end = obj_start_abs + i + 1;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                Some(extensions_str[obj_start_abs..obj_end].to_string())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(cfg) = &config_json {
            let start_sql = match ext_name {
                "trexas" => {
                    let escaped = cfg.replace('\'', "''");
                    Some(format!("SELECT trex_start_server_with_config('{escaped}')"))
                }
                "pgwire" => {
                    let v: Vec<&str> = cfg.split('"').collect();
                    let mut host = "0.0.0.0";
                    let mut port = 5432u64;
                    for i in 0..v.len() {
                        if v[i] == "host" {
                            if let Some(h) = v.get(i + 2) { host = h; }
                        }
                    }
                    if let Some(p) = cfg.find("\"port\"") {
                        let after = &cfg[p + 6..];
                        if let Some(colon) = after.find(':') {
                            let num_str: String = after[colon + 1..].chars()
                                .skip_while(|c| c.is_whitespace())
                                .take_while(|c| c.is_ascii_digit())
                                .collect();
                            if let Ok(p) = num_str.parse() { port = p; }
                        }
                    }
                    Some(format!("SELECT start_pgwire_server('{host}', {port}, '', '')"))
                }
                _ => None,
            };

            if let Some(sql) = start_sql {
                print!("Starting service '{ext_name}' ... ");
                match conn.execute(&sql, []) {
                    Ok(_) => println!("ok"),
                    Err(e) => println!("FAILED: {e}"),
                }
            }
        }

        pos = search_start;
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let check_mode = args.iter().any(|a| a == "--check");

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
    let ext_path = Path::new(&ext_dir);
    if ext_path.is_dir() {
        match fs::read_dir(ext_path) {
            Ok(entries) => {
                // Collect and sort extension paths, ensuring pool.trex loads first
                // (other extensions depend on the shared connection pool).
                let mut ext_paths: Vec<_> = entries
                    .flatten()
                    .filter_map(|entry| {
                        let path = match entry.path().canonicalize() {
                            Ok(p) => p,
                            Err(e) => {
                                println!("Warning: could not resolve {}: {e}", entry.path().display());
                                return None;
                            }
                        };
                        if let Ok(canonical_ext) = ext_path.canonicalize() {
                            if !path.starts_with(&canonical_ext) {
                                println!("Warning: skipping {} (outside extension dir)", path.display());
                                return None;
                            }
                        }
                        let ext = path.extension().and_then(|e| e.to_str()).map(|s| s.to_string());
                        if ext.as_deref() == Some("trex") || ext.as_deref() == Some("duckdb_extension") {
                            Some(path)
                        } else {
                            None
                        }
                    })
                    .collect();

                ext_paths.sort_by(|a, b| {
                    let a_is_pool = a.file_stem().and_then(|s| s.to_str()) == Some("pool");
                    let b_is_pool = b.file_stem().and_then(|s| s.to_str()) == Some("pool");
                    match (a_is_pool, b_is_pool) {
                        (true, false) => std::cmp::Ordering::Less,
                        (false, true) => std::cmp::Ordering::Greater,
                        _ => a.cmp(b),
                    }
                });

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
            }
            Err(e) => println!("Warning: could not read extension dir {ext_dir}: {e}"),
        }
    } else {
        println!("Warning: extension dir {ext_dir} does not exist");
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
        let attach_sql = format!("ATTACH '{safe_url}' AS _config (TYPE postgres)");
        match conn.execute(&attach_sql, []) {
            Ok(_) => println!("ok"),
            Err(e) => println!("FAILED: {}", redact_url(&e.to_string())),
        }
    }

    // Run core schema migrations via the migration extension
    if let Ok(schema_dir) = env::var("SCHEMA_DIR") {
        let safe_dir = schema_dir.replace('\'', "''");
        let migration_sql = format!(
            "SELECT * FROM trex_migration_run_schema('{safe_dir}', 'trexdb', '_config')"
        );
        print!("Running core schema migrations ... ");
        match conn.execute(&migration_sql, []) {
            Ok(_) => println!("ok"),
            Err(e) => eprintln!("FAILED: {e}"),
        }
    }

    // Re-run SWARM_CONFIG service startup after all extensions are loaded.
    // The db.trex orchestrator runs during db.trex init (before trexas/pgwire
    // are loaded), so its LOAD calls fail. Now all extensions are available.
    if let Ok(swarm_json) = env::var("SWARM_CONFIG") {
        if let Ok(swarm_node) = env::var("SWARM_NODE") {
            start_swarm_services(&conn, &swarm_json, &swarm_node);
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
