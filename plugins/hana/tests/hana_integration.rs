use hana_scan::{
    validate_hana_connection, parse_hana_url, HanaConnection
};

mod common;

#[test]
fn test_hana_connection_basic() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_connection_basic: {}", config.skip_reason);
        return;
    }

    let result = validate_hana_connection(&config.connection_url);

    match result {
        Ok(_) => {
            println!("✓ HANA connection validation passed");
        }
        Err(e) => {
            println!("✗ HANA connection validation failed: {}", e);
            // Don't fail the test if HANA server is not available
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection validation failed: {}", e);
        }
    }
}

#[test]
fn test_hana_url_parsing() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_url_parsing: {}", config.skip_reason);
        return;
    }

    let result = parse_hana_url(&config.connection_url);

    match result {
        Ok((user, _password, host, port, database)) => {
            println!("✓ HANA URL parsing successful:");
            println!("  User: {}", user);
            println!("  Host: {}", host);
            println!("  Port: {}", port);
            println!("  Database: {}", database);

            assert!(!user.is_empty(), "User should not be empty");
            assert!(!host.is_empty(), "Host should not be empty");
            assert!(port > 0, "Port should be positive");
            assert!(!database.is_empty(), "Database should not be empty");
        }
        Err(e) => {
            panic!("URL parsing failed: {}", e);
        }
    }
}

#[test]
fn test_hana_simple_query() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_simple_query: {}", config.skip_reason);
        return;
    }

    let query = "SELECT 'Hello HANA' AS greeting FROM DUMMY";

    let connection_result = HanaConnection::new(config.connection_url.clone());

    match connection_result {
        Ok(connection) => {
            println!("✓ HANA connection established");

            let query_result = connection.query(query);

            match query_result {
                Ok(result_set) => {
                    println!("✓ Query executed successfully");

                    let mut count = 0;
                    for row_result in result_set {
                        match row_result {
                            Ok(_row) => {
                                count += 1;
                                println!("  Found row #{}", count);
                            }
                            Err(e) => {
                                println!("✗ Error reading row: {}", e);
                            }
                        }
                    }

                    println!("  Total rows: {}", count);
                    assert!(count > 0, "Should get at least one result from DUMMY table");
                }
                Err(e) => {
                    println!("✗ Query execution failed: {}", e);
                    panic!("Query failed: {}", e);
                }
            }
        }
        Err(e) => {
            println!("✗ HANA connection failed: {}", e);
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection failed: {}", e);
        }
    }
}

#[test]
fn test_hana_system_tables_query() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_system_tables_query: {}", config.skip_reason);
        return;
    }

    let query = "SELECT SCHEMA_NAME, TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = 'SYS' AND TABLE_NAME = 'DUMMY'";

    let connection_result = HanaConnection::new(config.connection_url.clone());

    match connection_result {
        Ok(connection) => {
            println!("✓ HANA connection established for system tables test");

            let query_result = connection.query(query);

            match query_result {
                Ok(result_set) => {
                    println!("✓ System tables query executed successfully");

                    let mut count = 0;
                    for row_result in result_set {
                        match row_result {
                            Ok(_row) => {
                                count += 1;
                                println!("  Found system table row #{}", count);
                            }
                            Err(e) => {
                                println!("✗ Error reading system table row: {}", e);
                            }
                        }
                    }

                    println!("  Total system table rows: {}", count);
                    assert!(count > 0, "Should find SYS.DUMMY table");
                }
                Err(e) => {
                    println!("✗ System tables query failed: {}", e);
                    panic!("System query failed: {}", e);
                }
            }
        }
        Err(e) => {
            println!("✗ HANA connection failed: {}", e);
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection failed: {}", e);
        }
    }
}

#[test]
fn test_hana_multi_column_with_datetime_functions() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_multi_column_with_datetime_functions: {}", config.skip_reason);
        return;
    }

    // Regression: queries with NOW()/CURRENT_TIMESTAMP must return all columns
    let query = "SELECT 'Alice' AS name, 42 AS age, CURRENT_TIMESTAMP AS ts FROM DUMMY";

    let connection_result = HanaConnection::new(config.connection_url.clone());

    match connection_result {
        Ok(connection) => {
            println!("✓ HANA connection established");

            // Detect schema via the same subquery approach used by the extension
            let schema_query = format!("SELECT * FROM ({}) AS subquery LIMIT 1", query);
            let query_result = connection.query(&schema_query);

            match query_result {
                Ok(result_set) => {
                    let metadata = result_set.metadata();
                    let column_count = metadata.len();
                    println!("  Column count: {}", column_count);
                    for field in metadata.iter() {
                        println!("    {} ({:?})", field.displayname(), field.type_id());
                    }
                    assert_eq!(
                        column_count, 3,
                        "Query with datetime functions must return all 3 columns, got {}",
                        column_count
                    );
                }
                Err(e) => {
                    panic!("Schema detection query failed: {}", e);
                }
            }
        }
        Err(e) => {
            println!("✗ HANA connection failed: {}", e);
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection failed: {}", e);
        }
    }
}

#[test]
fn test_hana_multi_column_values() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_multi_column_values: {}", config.skip_reason);
        return;
    }

    let query = "SELECT 'hello' AS col_a, 123 AS col_b, 'world' AS col_c FROM DUMMY";

    let connection_result = HanaConnection::new(config.connection_url.clone());

    match connection_result {
        Ok(connection) => {
            println!("✓ HANA connection established");

            let query_result = connection.query(query);

            match query_result {
                Ok(result_set) => {
                    let metadata = result_set.metadata();
                    let column_count = metadata.len();
                    assert_eq!(column_count, 3, "Should return 3 columns");

                    let mut row_count = 0;
                    for row_result in result_set {
                        match row_result {
                            Ok(row) => {
                                row_count += 1;
                                assert_eq!(row.len(), 3, "Each row should have 3 columns");
                                println!("  Row: {:?}", row);
                            }
                            Err(e) => {
                                panic!("Error reading row: {}", e);
                            }
                        }
                    }
                    assert!(row_count > 0, "Should have at least one row");
                }
                Err(e) => {
                    panic!("Query failed: {}", e);
                }
            }
        }
        Err(e) => {
            println!("✗ HANA connection failed: {}", e);
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection failed: {}", e);
        }
    }
}

#[test]
fn test_hana_error_handling() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!("Skipping test_hana_error_handling: {}", config.skip_reason);
        return;
    }

    let invalid_query = "SELECT * FROM non_existent_table_12345";

    let connection_result = HanaConnection::new(config.connection_url.clone());

    match connection_result {
        Ok(connection) => {
            println!("✓ HANA connection established for error handling test");

            let query_result = connection.query(invalid_query);

            match query_result {
                Ok(_result_set) => {
                    panic!("Expected query to fail, but it succeeded");
                }
                Err(e) => {
                    println!("✓ Error handling working correctly: {}", e);
                    assert!(!e.to_string().is_empty(), "Error message should not be empty");
                }
            }
        }
        Err(e) => {
            println!("✗ HANA connection failed: {}", e);
            if !common::is_hana_available(&config.connection_url) {
                println!("Skipping test due to HANA server unavailability");
                return;
            }
            panic!("Connection failed: {}", e);
        }
    }
}

/// Run a write/DDL statement, tolerating hdbconnect 0.31's
/// "affected-row-count > 0, expected a single Success" non-error
/// (the same quirk handled in hana_execute.rs).
fn run_write(conn: &HanaConnection, sql: &str) -> Result<(), String> {
    let mut prepared = conn.prepare(sql).map_err(|e| e.to_string())?;
    match prepared.execute(&()) {
        Ok(_) => Ok(()),
        Err(e) => {
            let m = e.to_string();
            if m.contains("affected-row-count") && m.contains("expected a single Success") {
                Ok(())
            } else {
                Err(m)
            }
        }
    }
}

fn count_rows(conn: &HanaConnection, sql: &str) -> Result<usize, String> {
    let rs = conn.query(sql).map_err(|e| e.to_string())?;
    let mut n = 0usize;
    for row in rs {
        row.map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

#[test]
fn test_hana_anonymous_block_executes_whole() {
    common::setup();
    let config = common::HanaTestConfig::new();
    if config.should_skip {
        println!("Skipping: {}", config.skip_reason);
        return;
    }
    let conn = HanaConnection::new(config.connection_url.clone()).expect("connect");
    // The shape SqlRender's hana dialect emits for DROP TABLE IF EXISTS:
    // a `DO BEGIN … ; … ; END;` block whose inner `;` must NOT be split.
    let block = "DO BEGIN IF EXISTS (SELECT * FROM (SELECT SCHEMA_NAME || '.' || TABLE_NAME \
                 AS combined_name, SCHEMA_NAME, TABLE_NAME FROM TABLES) \
                 WHERE combined_name=UPPER('ZZZ_NOPE.zzz_nope')) \
                 THEN DROP TABLE ZZZ_NOPE.zzz_nope; END IF; END;";
    run_write(&conn, block).expect("HANA must accept the whole anonymous block");
}

#[test]
fn test_hana_permanent_table_persists_across_connections() {
    // Phase 2B premise: permanent scratch tables survive the passthrough's
    // fresh-connection-per-statement model (each statement = new HANA session).
    common::setup();
    let config = common::HanaTestConfig::new();
    if config.should_skip {
        println!("Skipping: {}", config.skip_reason);
        return;
    }
    let url = config.connection_url.clone();
    // Unique schema per process so concurrent CI runners on a shared HANA don't collide.
    let schema = format!("ZZZ_ACH_IT_{}", std::process::id());
    let c1 = HanaConnection::new(url.clone()).expect("conn1");
    let _ = run_write(&c1, &format!("DROP SCHEMA {} CASCADE", schema)); // best-effort pre-clean
    run_write(&c1, &format!("CREATE SCHEMA {}", schema)).expect("create schema");
    run_write(&c1, &format!("CREATE TABLE {}.t (id INTEGER)", schema)).expect("create table");
    run_write(&c1, &format!("INSERT INTO {}.t VALUES (1)", schema)).expect("insert");
    drop(c1);

    let c2 = HanaConnection::new(url.clone()).expect("conn2"); // separate HANA session
    let n = count_rows(&c2, &format!("SELECT id FROM {}.t", schema)).expect("select");
    assert_eq!(n, 1, "permanent table must be visible from a separate connection");

    let _ = run_write(&c2, &format!("DROP SCHEMA {} CASCADE", schema)); // cleanup
}

#[test]
fn test_hana_local_temp_table_lost_across_connections() {
    // Root cause of Gap 2, at the HANA level: a LOCAL TEMPORARY TABLE created on
    // one connection is invisible to another — which is exactly why temp tables
    // cannot be used through the per-statement passthrough.
    common::setup();
    let config = common::HanaTestConfig::new();
    if config.should_skip {
        println!("Skipping: {}", config.skip_reason);
        return;
    }
    let url = config.connection_url.clone();
    let c1 = HanaConnection::new(url.clone()).expect("conn1");
    run_write(&c1, "CREATE LOCAL TEMPORARY TABLE #zz_it (id INTEGER)").expect("create temp");
    run_write(&c1, "INSERT INTO #zz_it VALUES (1)").expect("insert temp");
    assert_eq!(count_rows(&c1, "SELECT id FROM #zz_it").unwrap(), 1, "visible on its own session");

    let c2 = HanaConnection::new(url.clone()).expect("conn2");
    let res = count_rows(&c2, "SELECT id FROM #zz_it");
    assert!(res.is_err(), "temp table must NOT be visible from a separate connection, got {res:?}");
}

#[test]
fn test_hana_temp_table_persists_within_session() {
    // Session affinity: reusing the same session_id returns the same pooled HANA
    // connection, so a LOCAL TEMPORARY TABLE created via one handle is visible
    // through another handle for the same session.
    common::setup();
    let config = common::HanaTestConfig::new();
    if config.should_skip {
        println!("Skipping: {}", config.skip_reason);
        return;
    }
    let url = config.connection_url.clone();
    let session_id: u64 = 900_000 + std::process::id() as u64;

    hana_scan::hana_session_pool::evict(session_id);
    let c1 = hana_scan::hana_session_pool::get_or_create(session_id, &url).expect("conn1");
    let _ = run_write(&c1, "DROP TABLE #sess_probe"); // best-effort pre-clean
    run_write(&c1, "CREATE LOCAL TEMPORARY TABLE #sess_probe (id INTEGER)").expect("create temp");
    run_write(&c1, "INSERT INTO #sess_probe VALUES (7)").expect("insert temp");

    let c2 = hana_scan::hana_session_pool::get_or_create(session_id, &url).expect("conn2");
    let n = count_rows(&c2, "SELECT id FROM #sess_probe")
        .expect("#temp table must persist across get_or_create in same session");
    assert_eq!(n, 1, "#temp table must persist across get_or_create in same session");

    hana_scan::hana_session_pool::evict(session_id);
}

#[test]
fn test_hana_temp_table_absent_without_session() {
    // session_id 0 => a fresh connection (new HANA session) each call => the
    // LOCAL TEMPORARY TABLE created on the first handle is not visible on the second.
    common::setup();
    let config = common::HanaTestConfig::new();
    if config.should_skip {
        println!("Skipping: {}", config.skip_reason);
        return;
    }
    let url = config.connection_url.clone();

    let a = hana_scan::hana_session_pool::get_or_create(0, &url).expect("conn a");
    run_write(&a, "CREATE LOCAL TEMPORARY TABLE #nosess (id INTEGER)").expect("create temp");

    let b = hana_scan::hana_session_pool::get_or_create(0, &url).expect("conn b");
    let res = count_rows(&b, "SELECT id FROM #nosess");
    assert!(res.is_err(), "fresh (session 0) connection must not see the prior #temp, got {res:?}");
}
