// Integration test for trex_hana_materialize_cohort.
//
// Gated on HANA_TEST_URL (read by common::HanaTestConfig::new()).
// Without a live HANA configured the test prints a skip message and returns
// immediately — the same pattern used by hana_integration.rs and
// extension_integration.rs.
//
// When HANA is available the test:
//   1. Creates a scratch schema (TREX_MAT_TEST) with a COHORT target table and
//      a SRC source table with the REAL 4-column shape produced by d2e's
//      query-gen-svc: (COHORT_DEFINITION_ID, SUBJECT_ID, COHORT_START_DATE,
//      COHORT_END_DATE).  This verifies that the by-name column extraction
//      correctly ignores COHORT_DEFINITION_ID and picks the right 3 columns.
//   2. Calls trex_hana_materialize_cohort with HANA_MATERIALIZE_BATCH_SIZE=2
//      AND HANA_MATERIALIZE_FETCH_SIZE=2 so that both the insert-batch flush
//      boundary and the read-fetch boundary are crossed.
//   3. Asserts the returned processed-row count == 5.
//   4. Verifies the rows actually landed in HANA by querying COHORT directly
//      via HanaConnection and counting rows.
//   5. Drops the scratch schema (best-effort; also attempted at the start to
//      clean up debris from any previous failed run).

mod common;

use duckdb::Connection;
use hana_scan::{HanaConnection, HanaExecuteScalar, HanaMaterializeCohortScalar};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Open an in-memory DuckDB connection and register the two scalar functions
/// under test directly from the rlib.  We do NOT `LOAD` the .trex file because
/// the test binary already links against the hana_scan rlib; loading the cdylib
/// on top would produce duplicate-symbol conflicts.
fn make_test_db() -> Connection {
    let db = Connection::open_in_memory().expect("open in-memory DuckDB");
    db.register_scalar_function::<HanaExecuteScalar>("trex_hana_execute")
        .expect("register trex_hana_execute");
    db.register_scalar_function::<HanaMaterializeCohortScalar>("trex_hana_materialize_cohort")
        .expect("register trex_hana_materialize_cohort");
    db
}

/// Escape single quotes for safe embedding inside a SQL string literal.
fn esc(s: &str) -> String {
    s.replace('\'', "''")
}

/// Run a HANA DDL/DML statement through `trex_hana_execute`; panics on error.
fn exec_hana(db: &Connection, con: &str, hana_sql: &str) {
    let sql = format!(
        "SELECT trex_hana_execute('{}', '{}')",
        esc(con),
        esc(hana_sql)
    );
    let _: String = db
        .query_row(&sql, [], |row| row.get(0))
        .unwrap_or_else(|e| panic!("trex_hana_execute failed for [{hana_sql}]: {e}"));
}

/// Like `exec_hana` but silently ignores errors (used for best-effort cleanup).
fn try_exec_hana(db: &Connection, con: &str, hana_sql: &str) {
    let sql = format!(
        "SELECT trex_hana_execute('{}', '{}')",
        esc(con),
        esc(hana_sql)
    );
    let _ = db.query_row::<String, _, _>(&sql, [], |row| row.get(0));
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

#[test]
fn materialize_cohort_end_to_end() {
    common::setup();
    let config = common::HanaTestConfig::new();

    if config.should_skip {
        println!(
            "Skipping materialize_cohort_end_to_end: {}",
            config.skip_reason
        );
        return;
    }

    let con = config.connection_url.clone();
    // Per-process unique schema so concurrent/parallel runs (and debris from a
    // previously crashed run) don't collide.
    let schema = format!("TREX_MAT_TEST_{}", std::process::id());

    let db = make_test_db();

    // Best-effort cleanup in case a previous test run left this schema behind.
    try_exec_hana(&db, &con, &format!("DROP SCHEMA {schema} CASCADE"));

    // --- Create HANA fixtures ---
    exec_hana(&db, &con, &format!("CREATE SCHEMA {schema}"));
    exec_hana(
        &db,
        &con,
        &format!(
            "CREATE COLUMN TABLE {schema}.COHORT (\
             COHORT_DEFINITION_ID INTEGER, \
             SUBJECT_ID INTEGER, \
             COHORT_START_DATE DATE, \
             COHORT_END_DATE DATE)"
        ),
    );
    // SRC uses the REAL 4-column shape from d2e's query-gen-svc:
    // COHORT_DEFINITION_ID is projected first, matching what analytics-svc
    // sends as `source_sql`.  The by-name extraction must pick SUBJECT_ID,
    // COHORT_START_DATE, COHORT_END_DATE and ignore COHORT_DEFINITION_ID.
    exec_hana(
        &db,
        &con,
        &format!(
            "CREATE COLUMN TABLE {schema}.SRC (\
             COHORT_DEFINITION_ID INTEGER, \
             SUBJECT_ID INTEGER, \
             COHORT_START_DATE DATE, \
             COHORT_END_DATE DATE)"
        ),
    );

    // 5 explicit rows with SUBJECT_ID 1..5; COHORT_DEFINITION_ID is 99
    // (distinct from the target cohort id 42) to verify it is ignored.
    for i in 1i64..=5 {
        exec_hana(
            &db,
            &con,
            &format!(
                "INSERT INTO {schema}.SRC VALUES (99, {i}, CURRENT_DATE, CURRENT_DATE)"
            ),
        );
    }

    // Force tiny batch AND tiny fetch so that both the insert-batch flush
    // boundary and the read-fetch boundary are crossed:
    //   fetch: rows land in chunks of 2 → 3 round-trips
    //   batch: rows 1-2 → flush, rows 3-4 → flush, row 5 → partial flush
    #[allow(deprecated)]
    std::env::set_var("HANA_MATERIALIZE_BATCH_SIZE", "2");
    #[allow(deprecated)]
    std::env::set_var("HANA_MATERIALIZE_FETCH_SIZE", "2");

    // --- Exercise trex_hana_materialize_cohort ---
    // Source query matches the REAL d2e generated shape: 4 columns, COHORT_DEFINITION_ID first.
    // The session_vars JSON `{"APPLICATION":"project-cohorts"}` contains
    // double quotes; embed it with Rust-escaped \" inside the SQL literal.
    let con_esc = esc(&con);
    let processed: i64 = db
        .query_row(
            &format!(
                "SELECT trex_hana_materialize_cohort(\
                    '{con_esc}', \
                    'SELECT COHORT_DEFINITION_ID, SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE FROM {schema}.SRC', \
                    '[]', \
                    '{schema}', \
                    42, \
                    '{{\"APPLICATION\":\"project-cohorts\"}}'\
                )"
            ),
            [],
            |row| row.get(0),
        )
        .expect("trex_hana_materialize_cohort failed");

    assert_eq!(processed, 5, "Expected 5 processed rows, got {processed}");
    println!("✓ trex_hana_materialize_cohort returned {processed} (expected 5)");

    // --- Verify the rows landed in HANA ---
    // Connect directly (not through DuckDB) to count rows in COHORT.
    let hana_conn =
        HanaConnection::new(con.clone()).expect("HANA connection for post-condition check");
    let rs = hana_conn
        .query(&format!(
            "SELECT SUBJECT_ID FROM {schema}.COHORT WHERE COHORT_DEFINITION_ID = 42"
        ))
        .expect("verification query failed");
    let mut hana_count = 0i64;
    for row_res in rs {
        row_res.expect("error reading verification row");
        hana_count += 1;
    }
    assert_eq!(
        hana_count, 5,
        "Expected 5 rows in {schema}.COHORT for COHORT_DEFINITION_ID = 42, got {hana_count}"
    );
    println!(
        "✓ {schema}.COHORT has {hana_count} rows for COHORT_DEFINITION_ID = 42 (expected 5)"
    );

    // --- Cleanup ---
    try_exec_hana(&db, &con, &format!("DROP SCHEMA {schema} CASCADE"));
    #[allow(deprecated)]
    std::env::remove_var("HANA_MATERIALIZE_BATCH_SIZE");
    #[allow(deprecated)]
    std::env::remove_var("HANA_MATERIALIZE_FETCH_SIZE");

    println!("✓ materialize_cohort_end_to_end PASSED");
}
