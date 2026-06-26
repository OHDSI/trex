// Integration test for trex_hana_materialize_cohort.
//
// Gated on HANA_TEST_URL (read by common::HanaTestConfig::new()).
// Without a live HANA configured the test prints a skip message and returns
// immediately — the same pattern used by hana_integration.rs and
// extension_integration.rs.
//
// When HANA is available the test:
//   1. Creates a scratch schema (TREX_MAT_TEST) with a COHORT target table and
//      a SRC source table containing 5 explicit rows.
//   2. Calls trex_hana_materialize_cohort with HANA_MATERIALIZE_BATCH_SIZE=2
//      so that the flush-at-batch-size code path is exercised (batches of 2, 2,
//      then the trailing partial batch of 1).
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

/// Run a HANA DDL/DML statement through `trex_hana_execute`; panics on error.
fn exec_hana(db: &Connection, con: &str, hana_sql: &str) {
    let sql = format!("SELECT trex_hana_execute('{con}', '{hana_sql}')");
    let _: String = db
        .query_row(&sql, [], |row| row.get(0))
        .unwrap_or_else(|e| panic!("trex_hana_execute failed for [{hana_sql}]: {e}"));
}

/// Like `exec_hana` but silently ignores errors (used for best-effort cleanup).
fn try_exec_hana(db: &Connection, con: &str, hana_sql: &str) {
    let sql = format!("SELECT trex_hana_execute('{con}', '{hana_sql}')");
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
    let schema = "TREX_MAT_TEST";

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
    exec_hana(
        &db,
        &con,
        &format!(
            "CREATE COLUMN TABLE {schema}.SRC (\
             SUBJECT_ID INTEGER, \
             COHORT_START_DATE DATE, \
             COHORT_END_DATE DATE)"
        ),
    );

    // 5 explicit rows with SUBJECT_ID 1..5.
    for i in 1i64..=5 {
        exec_hana(
            &db,
            &con,
            &format!("INSERT INTO {schema}.SRC VALUES ({i}, CURRENT_DATE, CURRENT_DATE)"),
        );
    }

    // Force a tiny batch so that multiple flush cycles are exercised:
    // rows 1-2 → flush (processed=2), rows 3-4 → flush (processed=4),
    // row 5 → final partial flush (processed=5).
    #[allow(deprecated)]
    std::env::set_var("HANA_MATERIALIZE_BATCH_SIZE", "2");

    // --- Exercise trex_hana_materialize_cohort ---
    // The session_vars JSON `{"APPLICATION":"project-cohorts"}` contains
    // double quotes; embed it with Rust-escaped \" inside the SQL literal.
    let processed: i64 = db
        .query_row(
            &format!(
                "SELECT trex_hana_materialize_cohort(\
                    '{con}', \
                    'SELECT SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE FROM {schema}.SRC', \
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

    println!("✓ materialize_cohort_end_to_end PASSED");
}
