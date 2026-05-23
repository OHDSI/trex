use crate::project::{load_project, FreshnessThreshold, SourceDef};
use crate::{escape_sql_ident, query_sql};
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
};
use std::error::Error;
use std::sync::atomic::{AtomicUsize, Ordering};

struct FreshnessResult {
    name: String,
    status: String,
    max_loaded_at: String,
    age_hours: f64,
    warn_after: String,
    error_after: String,
}

fn threshold_to_hours(threshold: &FreshnessThreshold) -> f64 {
    let count = threshold.count as f64;
    match threshold.period.as_str() {
        "minute" => count / 60.0,
        "hour" => count,
        "day" => count * 24.0,
        _ => count,
    }
}

fn threshold_to_string(threshold: &Option<FreshnessThreshold>) -> String {
    match threshold {
        Some(t) => format!("{} {}", t.count, t.period),
        None => String::new(),
    }
}

/// Builds the SQL used to read the freshest row's timestamp and its age in
/// hours for a single source. Pure: identifier-escapes inputs and formats
/// the statement exactly the way `check_freshness` issues it.
///
/// The two output columns are:
///   0. `MAX(loaded_at_field)::VARCHAR` — the freshest timestamp, or NULL
///      when the table is empty.
///   1. age in hours as a DOUBLE, NULL when MAX is NULL.
///
/// Two reasons we combine MAX(loaded_at) and the age-in-hours computation
/// into a single statement:
///   1. Halves the per-source round-trip count (1 query instead of 2).
///      The previous two-query design issued 2N pool requests for N
///      sources and was observed to deadlock for N >= 2 — even when all
///      queries were pinned to the same session, the 4th request (= 2nd
///      source's age query) would hang inside
///      `trex_pool_session_execute_arrow`. Folding the two into one
///      keeps the contract at exactly N pool calls.
///   2. Avoids re-serialising the timestamp through a VARCHAR cast and
///      back into a TIMESTAMP literal, which was the original source of
///      the TIMESTAMPTZ binder error. We still emit the max as VARCHAR
///      for the result row, but the age is computed entirely on the DB
///      side from the typed column.
///
/// CURRENT_TIMESTAMP is cast to TIMESTAMP (matching the prior
/// TIMESTAMP/TIMESTAMPTZ fix) so the subtraction binds for both TIMESTAMP
/// and TIMESTAMP WITH TIME ZONE `loaded_at_field`s.
fn build_freshness_query_sql(table_name: &str, source_schema: &str, loaded_at_field: &str) -> String {
    let esc_schema = escape_sql_ident(source_schema);
    let esc_name = escape_sql_ident(table_name);
    let esc_field = escape_sql_ident(loaded_at_field);
    format!(
        "SELECT MAX(\"{esc_field}\")::VARCHAR, \
         CASE WHEN MAX(\"{esc_field}\") IS NULL THEN NULL \
              ELSE EXTRACT(EPOCH FROM CURRENT_TIMESTAMP::TIMESTAMP \
                           - MAX(\"{esc_field}\")::TIMESTAMP) / 3600.0 \
         END \
         FROM \"{esc_schema}\".\"{esc_name}\""
    )
}

/// Pure freshness evaluator. Given a source's configured thresholds and
/// the two raw column values returned by `build_freshness_query_sql`
/// (`max_val` = MAX(field)::VARCHAR, `age_str` = age in hours as text),
/// produces the exact `FreshnessResult` row that `check_freshness` would
/// push.
///
/// Behaviour locked in by this function:
///   * Empty `max_val` (i.e. NULL MAX, empty table) ⇒
///     `status = "error"`, `max_loaded_at = "NULL"`, `age_hours = +inf`.
///   * Otherwise `age_str` is parsed as f64, falling back to +inf on
///     parse failure; status is then decided by the threshold ladder:
///       - if `error_after` is set and age >= error_threshold ⇒ "error"
///       - else if `warn_after` is set and age >= warn_threshold ⇒ "warn"
///       - else ⇒ "pass"
///   * `>=` is the comparison — exactly hitting the boundary trips the
///     threshold.
fn evaluate_freshness(source: &SourceDef, max_val: &str, age_str: &str) -> FreshnessResult {
    let (max_loaded_at, age_hours, status) = if max_val.is_empty() {
        ("NULL".to_string(), f64::INFINITY, "error".to_string())
    } else {
        let age = age_str.parse::<f64>().unwrap_or(f64::INFINITY);

        let status = if let Some(error_threshold) = &source.error_after {
            if age >= threshold_to_hours(error_threshold) {
                "error".to_string()
            } else if let Some(warn_threshold) = &source.warn_after {
                if age >= threshold_to_hours(warn_threshold) {
                    "warn".to_string()
                } else {
                    "pass".to_string()
                }
            } else {
                "pass".to_string()
            }
        } else if let Some(warn_threshold) = &source.warn_after {
            if age >= threshold_to_hours(warn_threshold) {
                "warn".to_string()
            } else {
                "pass".to_string()
            }
        } else {
            "pass".to_string()
        };

        (max_val.to_string(), age, status)
    };

    FreshnessResult {
        name: source.name.clone(),
        status,
        max_loaded_at,
        age_hours,
        warn_after: threshold_to_string(&source.warn_after),
        error_after: threshold_to_string(&source.error_after),
    }
}

fn check_freshness(
    sources: &[SourceDef],
    schema: &str,
) -> Result<Vec<FreshnessResult>, Box<dyn Error>> {
    let mut results = Vec::new();

    for source in sources {
        let sql = build_freshness_query_sql(&source.name, schema, &source.loaded_at_field);
        let combined = query_sql(&sql);

        match combined {
            Ok(rows) => {
                let row = rows.first();
                let max_val = row
                    .map(|r| r.columns.get(0).cloned().unwrap_or_default())
                    .unwrap_or_default();
                let age_str = row
                    .map(|r| r.columns.get(1).cloned().unwrap_or_default())
                    .unwrap_or_default();
                results.push(evaluate_freshness(source, &max_val, &age_str));
            }
            Err(_) => {
                results.push(FreshnessResult {
                    name: source.name.clone(),
                    status: "error".to_string(),
                    max_loaded_at: String::new(),
                    age_hours: -1.0,
                    warn_after: threshold_to_string(&source.warn_after),
                    error_after: threshold_to_string(&source.error_after),
                });
            }
        }
    }

    Ok(results)
}

#[repr(C)]
pub struct FreshnessBindData {
    path: String,
    schema: String,
}

#[repr(C)]
pub struct FreshnessInitData {
    results: Vec<FreshnessResult>,
    index: AtomicUsize,
}

pub struct FreshnessVTab;

impl VTab for FreshnessVTab {
    type InitData = FreshnessInitData;
    type BindData = FreshnessBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "max_loaded_at",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("age_hours", LogicalTypeHandle::from(LogicalTypeId::Double));
        bind.add_result_column(
            "warn_after",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column(
            "error_after",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        Ok(FreshnessBindData { path, schema })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
            )
        };

        let project = load_project(&path)?;

        if project.sources.is_empty() {
            return Ok(FreshnessInitData {
                results: Vec::new(),
                index: AtomicUsize::new(0),
            });
        }

        let results = check_freshness(&project.sources, &schema)?;

        Ok(FreshnessInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let name_vector = output.flat_vector(0);
        name_vector.insert(0, result.name.as_str());

        let status_vector = output.flat_vector(1);
        status_vector.insert(0, result.status.as_str());

        let loaded_at_vector = output.flat_vector(2);
        loaded_at_vector.insert(0, result.max_loaded_at.as_str());

        let mut age_vector = output.flat_vector(3);
        age_vector.as_mut_slice::<f64>()[0] = result.age_hours;

        let warn_vector = output.flat_vector(4);
        warn_vector.insert(0, result.warn_after.as_str());

        let error_vector = output.flat_vector(5);
        error_vector.insert(0, result.error_after.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        ])
    }
}

#[cfg(test)]
mod freshness_tests {
    use super::*;

    fn threshold(count: u32, period: &str) -> FreshnessThreshold {
        FreshnessThreshold {
            count,
            period: period.to_string(),
        }
    }

    #[test]
    fn threshold_to_hours_converts_minutes_to_fractional_hours() {
        let t = threshold(30, "minute");
        // 30 minutes is exactly half an hour.
        assert_eq!(
            threshold_to_hours(&t),
            0.5,
            "30 minutes should be 0.5 hours"
        );
    }

    #[test]
    fn threshold_to_hours_passes_hours_through_unchanged() {
        let t = threshold(5, "hour");
        assert_eq!(threshold_to_hours(&t), 5.0, "hour count is hours");
    }

    #[test]
    fn threshold_to_hours_converts_days_to_hours() {
        let t = threshold(2, "day");
        assert_eq!(
            threshold_to_hours(&t),
            48.0,
            "2 days should be 48 hours"
        );
    }

    #[test]
    fn threshold_to_hours_zero_count_is_zero_hours() {
        // Edge case: a zero count must yield zero hours regardless of unit.
        assert_eq!(threshold_to_hours(&threshold(0, "minute")), 0.0);
        assert_eq!(threshold_to_hours(&threshold(0, "hour")), 0.0);
        assert_eq!(threshold_to_hours(&threshold(0, "day")), 0.0);
    }

    #[test]
    fn threshold_to_hours_unknown_period_falls_back_to_raw_count() {
        // The implementation's wildcard arm returns the raw count for any
        // unrecognised period (e.g. "week"). Lock this behaviour in so a
        // future refactor doesn't silently change it.
        let t = threshold(3, "week");
        assert_eq!(
            threshold_to_hours(&t),
            3.0,
            "unknown period should fall through to the raw count"
        );
    }

    #[test]
    fn threshold_to_string_returns_empty_for_none() {
        let s = threshold_to_string(&None);
        assert_eq!(s, "", "None threshold must render as the empty string");
    }

    #[test]
    fn threshold_to_string_formats_some_as_count_space_period() {
        assert_eq!(
            threshold_to_string(&Some(threshold(12, "hour"))),
            "12 hour"
        );
        assert_eq!(
            threshold_to_string(&Some(threshold(1, "day"))),
            "1 day"
        );
        assert_eq!(
            threshold_to_string(&Some(threshold(45, "minute"))),
            "45 minute"
        );
    }

    #[test]
    fn threshold_to_string_does_not_pluralize_period() {
        // The formatter is a literal "{count} {period}" — it never appends
        // an 's'. Pin this so callers can rely on stable output.
        let s = threshold_to_string(&Some(threshold(7, "day")));
        assert!(
            !s.ends_with("days"),
            "period should be passed through verbatim, got: {s}"
        );
        assert_eq!(s, "7 day");
    }

    // NOTE: `check_freshness` itself is intentionally not unit-tested
    // here — it calls `query_sql`, which dispatches into a live DuckDB
    // pool session. The pure logic it delegates to lives in
    // `build_freshness_query_sql` and `evaluate_freshness`, both
    // exercised by `freshness_check_tests` below.
}

#[cfg(test)]
mod freshness_check_tests {
    //! Tests for the pure pieces of the freshness check path:
    //! `build_freshness_query_sql` (SQL string builder) and
    //! `evaluate_freshness` (status/result decision).
    //!
    //! These complement `freshness_tests`, which already covers the
    //! `threshold_to_hours` / `threshold_to_string` helpers.

    use super::*;

    fn threshold(count: u32, period: &str) -> FreshnessThreshold {
        FreshnessThreshold {
            count,
            period: period.to_string(),
        }
    }

    /// Build a `SourceDef` for tests with explicit thresholds. `name` and
    /// `loaded_at_field` are fixed because evaluate_freshness only reads
    /// `name`, `warn_after`, `error_after` — the SQL builder takes the
    /// field separately.
    fn source(
        warn: Option<FreshnessThreshold>,
        error: Option<FreshnessThreshold>,
    ) -> SourceDef {
        SourceDef {
            name: "orders".to_string(),
            loaded_at_field: "loaded_at".to_string(),
            warn_after: warn,
            error_after: error,
        }
    }

    // ---------- build_freshness_query_sql ----------

    #[test]
    fn build_sql_emits_expected_statement_for_simple_idents() {
        // Lock the literal SQL so any drift (whitespace, casts, column
        // order) is caught — DuckDB column positions are load-bearing
        // in `check_freshness`.
        let sql = build_freshness_query_sql("orders", "raw", "loaded_at");
        let expected = "SELECT MAX(\"loaded_at\")::VARCHAR, \
                        CASE WHEN MAX(\"loaded_at\") IS NULL THEN NULL \
                             ELSE EXTRACT(EPOCH FROM CURRENT_TIMESTAMP::TIMESTAMP \
                                          - MAX(\"loaded_at\")::TIMESTAMP) / 3600.0 \
                        END \
                        FROM \"raw\".\"orders\"";
        assert_eq!(sql, expected, "SQL must match byte-for-byte");
    }

    #[test]
    fn build_sql_escapes_embedded_double_quotes_in_idents() {
        // escape_sql_ident doubles internal `"` characters. Verify the
        // builder threads that through for schema, table and field.
        let sql = build_freshness_query_sql("ta\"ble", "sch\"ema", "fi\"eld");
        assert!(
            sql.contains("\"sch\"\"ema\".\"ta\"\"ble\""),
            "qualified name should have doubled quotes: {sql}"
        );
        assert!(
            sql.contains("MAX(\"fi\"\"eld\")::VARCHAR"),
            "field reference should have doubled quotes: {sql}"
        );
    }

    #[test]
    fn build_sql_selects_two_columns_in_fixed_order() {
        // `check_freshness` reads columns by index (0=max, 1=age), so
        // the SELECT list order is part of the contract.
        let sql = build_freshness_query_sql("t", "s", "f");
        // `rfind` because the CASE expression also contains "FROM"
        // (inside EXTRACT(EPOCH FROM ...)) — we want the outer FROM.
        let select_clause = sql[..sql.rfind(" FROM ").expect("has FROM")].trim();
        // First projection is MAX(...)::VARCHAR
        assert!(
            select_clause.starts_with("SELECT MAX(\"f\")::VARCHAR,"),
            "column 0 must be MAX as VARCHAR: {select_clause}"
        );
        // Second projection ends with `END` (closes the CASE expr).
        assert!(
            select_clause.ends_with("END"),
            "column 1 must be the CASE expression: {select_clause}"
        );
    }

    // ---------- evaluate_freshness ----------

    #[test]
    fn evaluate_empty_max_val_yields_error_with_infinite_age() {
        // Behaviour locked in: empty MAX (NULL from DB) is treated as
        // an error condition, regardless of thresholds.
        let src = source(Some(threshold(1, "hour")), Some(threshold(24, "hour")));
        let r = evaluate_freshness(&src, "", "");
        assert_eq!(r.status, "error", "empty max_val ⇒ error status");
        assert_eq!(r.max_loaded_at, "NULL", "empty max_val ⇒ literal \"NULL\"");
        assert!(
            r.age_hours.is_infinite() && r.age_hours.is_sign_positive(),
            "empty max_val ⇒ +∞ age, got {}",
            r.age_hours
        );
    }

    #[test]
    fn evaluate_empty_max_val_yields_error_even_without_thresholds() {
        // Empty MAX is unconditionally an error — thresholds aren't
        // consulted at all in that branch.
        let src = source(None, None);
        let r = evaluate_freshness(&src, "", "");
        assert_eq!(r.status, "error");
        assert_eq!(r.max_loaded_at, "NULL");
    }

    #[test]
    fn evaluate_age_below_warn_threshold_is_pass() {
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "2024-01-01 00:00:00", "1.5");
        assert_eq!(r.status, "pass", "1.5h < warn=2h ⇒ pass");
        assert_eq!(r.max_loaded_at, "2024-01-01 00:00:00");
        assert_eq!(r.age_hours, 1.5);
    }

    #[test]
    fn evaluate_age_between_warn_and_error_is_warn() {
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "2024-01-01 00:00:00", "3.0");
        assert_eq!(r.status, "warn", "2h <= 3h < 4h ⇒ warn");
    }

    #[test]
    fn evaluate_age_at_or_above_error_threshold_is_error() {
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "2024-01-01 00:00:00", "5.0");
        assert_eq!(r.status, "error", "5h >= error=4h ⇒ error");
    }

    #[test]
    fn evaluate_exact_warn_boundary_trips_warn() {
        // `>=` is the comparison: exactly hitting warn flips to warn.
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "ts", "2.0");
        assert_eq!(r.status, "warn", "age == warn threshold ⇒ warn (>=)");
    }

    #[test]
    fn evaluate_exact_error_boundary_trips_error() {
        // `>=` again: exactly at error threshold escalates past warn.
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "ts", "4.0");
        assert_eq!(r.status, "error", "age == error threshold ⇒ error (>=)");
    }

    #[test]
    fn evaluate_no_thresholds_set_is_always_pass() {
        // Source with neither warn_after nor error_after configured —
        // even a wildly stale row is "pass". This is the default and a
        // load-bearing surprise; lock it in.
        let src = source(None, None);
        let r = evaluate_freshness(&src, "2024-01-01 00:00:00", "9999.0");
        assert_eq!(r.status, "pass", "no thresholds ⇒ pass regardless of age");
        assert_eq!(r.warn_after, "");
        assert_eq!(r.error_after, "");
    }

    #[test]
    fn evaluate_only_warn_set_escalates_to_warn_then_stops() {
        let src = source(Some(threshold(2, "hour")), None);
        let young = evaluate_freshness(&src, "ts", "1.0");
        assert_eq!(young.status, "pass", "below warn ⇒ pass");
        let old = evaluate_freshness(&src, "ts", "100.0");
        // With only warn set, even huge ages cap at "warn" (no error
        // threshold to escalate to).
        assert_eq!(old.status, "warn", "above warn, no error ⇒ warn");
    }

    #[test]
    fn evaluate_only_error_set_skips_warn_entirely() {
        // No warn threshold ⇒ statuses are only "pass" or "error".
        let src = source(None, Some(threshold(4, "hour")));
        let below = evaluate_freshness(&src, "ts", "3.9");
        assert_eq!(below.status, "pass");
        let at = evaluate_freshness(&src, "ts", "4.0");
        assert_eq!(at.status, "error", "age >= error, no warn ⇒ error");
    }

    #[test]
    fn evaluate_unparseable_age_str_falls_back_to_infinity() {
        // Surprise: a garbage age string is silently coerced to +∞,
        // which then trips the highest configured threshold. This
        // behaviour is locked in so a future refactor doesn't quietly
        // start returning an error or "pass" instead.
        let src = source(Some(threshold(2, "hour")), Some(threshold(4, "hour")));
        let r = evaluate_freshness(&src, "ts", "not-a-number");
        assert_eq!(r.status, "error", "unparseable age ⇒ +∞ ⇒ error");
        assert!(r.age_hours.is_infinite(), "age fell back to ∞");
    }

    #[test]
    fn evaluate_populates_threshold_strings_from_source() {
        // The `warn_after` / `error_after` fields on the result are
        // human-readable echoes of the source config — independent of
        // status/age. Worth pinning.
        let src = source(Some(threshold(30, "minute")), Some(threshold(2, "day")));
        let r = evaluate_freshness(&src, "ts", "1.0");
        assert_eq!(r.warn_after, "30 minute");
        assert_eq!(r.error_after, "2 day");
        assert_eq!(r.name, "orders", "name copied from source");
    }
}

