// W3 — Arrow→PG type mapping, decimal/timestamp/interval formatters, schema rewrites.
#![allow(unused_imports)]

use super::*;
use duckdb::arrow::array::{
    Array, ArrayRef, Decimal128Array, Int32Array, Int64Array,
    IntervalDayTimeArray, IntervalMonthDayNanoArray, IntervalYearMonthArray,
    StringArray, TimestampMicrosecondArray, TimestampMillisecondArray,
    TimestampNanosecondArray, TimestampSecondArray,
};
use duckdb::arrow::datatypes::{
    DataType, Field, IntervalDayTime, IntervalMonthDayNano, IntervalUnit, Schema, TimeUnit,
};
use duckdb::arrow::record_batch::RecordBatch;
use pgwire::api::{portal::Format, Type};
use rstest::rstest;
use std::sync::Arc;

// ---------- arrow_type_to_pg_type ----------

#[rstest]
#[case(DataType::Boolean, Type::BOOL)]
#[case(DataType::Int8, Type::INT2)]
#[case(DataType::Int16, Type::INT2)]
#[case(DataType::Int32, Type::INT4)]
#[case(DataType::Int64, Type::INT8)]
#[case(DataType::UInt8, Type::INT2)]
#[case(DataType::UInt16, Type::INT2)]
#[case(DataType::UInt32, Type::INT4)]
#[case(DataType::UInt64, Type::INT8)]
#[case(DataType::Float16, Type::FLOAT4)]
#[case(DataType::Float32, Type::FLOAT4)]
#[case(DataType::Float64, Type::FLOAT8)]
#[case(DataType::Decimal128(10, 2), Type::NUMERIC)]
#[case(DataType::Decimal256(38, 4), Type::NUMERIC)]
#[case(DataType::Utf8, Type::TEXT)]
#[case(DataType::LargeUtf8, Type::TEXT)]
#[case(DataType::Date32, Type::DATE)]
#[case(DataType::Date64, Type::DATE)]
#[case(DataType::Time32(TimeUnit::Second), Type::TIME)]
#[case(DataType::Time64(TimeUnit::Microsecond), Type::TIME)]
#[case(DataType::Binary, Type::BYTEA)]
#[case(DataType::LargeBinary, Type::BYTEA)]
fn arrow_type_to_pg_type_branches(#[case] arrow: DataType, #[case] expected: Type) {
    assert_eq!(arrow_type_to_pg_type(&arrow), expected);
}

#[test]
fn arrow_type_to_pg_type_timestamp_with_tz_is_timestamptz() {
    let dt = DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into()));
    assert_eq!(arrow_type_to_pg_type(&dt), Type::TIMESTAMPTZ);
}

#[test]
fn arrow_type_to_pg_type_timestamp_without_tz_is_timestamp() {
    let dt = DataType::Timestamp(TimeUnit::Microsecond, None);
    assert_eq!(arrow_type_to_pg_type(&dt), Type::TIMESTAMP);
}

#[test]
fn arrow_type_to_pg_type_unknown_falls_back_to_text() {
    // Struct, List, etc. fall through to the catch-all TEXT mapping.
    let dt = DataType::Struct(vec![Field::new("a", DataType::Int32, false)].into());
    assert_eq!(arrow_type_to_pg_type(&dt), Type::TEXT);
}

// ---------- format_i128_with_scale ----------

#[rstest]
#[case(0_i128, 0_i8, "0")]
#[case(1234, 0, "1234")]
#[case(1234, 2, "12.34")]
#[case(5, 3, "0.005")]
#[case(-1234, 2, "-12.34")]
#[case(-5, 3, "-0.005")]
#[case(123, -3, "123")] // negative scale defensively treated as 0
fn format_i128_with_scale_branches(#[case] v: i128, #[case] scale: i8, #[case] expected: &str) {
    assert_eq!(format_i128_with_scale(v, scale), expected);
}

#[test]
fn format_i128_with_scale_min_zero_scale() {
    // i128::MIN as string (negative number, no overflow on unsigned_abs).
    let s = format_i128_with_scale(i128::MIN, 0);
    assert_eq!(s, i128::MIN.to_string());
}

#[test]
fn format_i128_with_scale_min_with_scale() {
    // Last two digits become fractional. Magnitude of i128::MIN ends in "08".
    let s = format_i128_with_scale(i128::MIN, 2);
    // Must start with '-' and contain a single '.' two positions from end.
    assert!(s.starts_with('-'));
    let dot = s.rfind('.').unwrap();
    assert_eq!(s.len() - dot - 1, 2, "two fractional digits in {s}");
}

#[test]
fn format_i128_with_scale_max_scale_38() {
    // i128::MAX with scale 38 → 0.<38 digits>.
    let s = format_i128_with_scale(i128::MAX, 38);
    assert!(s.starts_with('0') || s.starts_with('1'),
        "should start with 0 or 1 magnitude: {s}");
    assert!(s.contains('.'));
}

// ---------- format_decimal128_as_utf8 ----------

#[test]
fn format_decimal128_handles_nulls_and_negatives() {
    let arr = Decimal128Array::from(vec![Some(123_i128), None, Some(-456_i128)])
        .with_precision_and_scale(10, 2)
        .unwrap();
    let out = format_decimal128_as_utf8(&arr, 2);
    let s = out.as_any().downcast_ref::<StringArray>().expect("StringArray");
    assert_eq!(s.len(), 3);
    assert_eq!(s.value(0), "1.23");
    assert!(s.is_null(1));
    assert_eq!(s.value(2), "-4.56");
}

#[test]
fn format_decimal128_empty_array() {
    let arr = Decimal128Array::from(Vec::<Option<i128>>::new())
        .with_precision_and_scale(10, 2)
        .unwrap();
    let out = format_decimal128_as_utf8(&arr, 2);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(s.len(), 0);
}

#[test]
fn format_decimal128_full_width_value() {
    // A value past i64::MAX (~9.22e18) is fine for i128.
    let big: i128 = (i64::MAX as i128) * 10 + 7;
    let arr = Decimal128Array::from(vec![Some(big)])
        .with_precision_and_scale(38, 10)
        .unwrap();
    let out = format_decimal128_as_utf8(&arr, 10);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(s.value(0), format_i128_with_scale(big, 10));
}

// ---------- format_timestamptz_as_utf8 ----------

#[test]
fn format_timestamptz_epoch_microsecond() {
    let arr = TimestampMicrosecondArray::from(vec![Some(0_i64)]).with_timezone("+00:00");
    let out = format_timestamptz_as_utf8(&arr, &TimeUnit::Microsecond);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(s.value(0), "1970-01-01 00:00:00.000000+00");
}

#[test]
fn format_timestamptz_non_epoch_microsecond() {
    use chrono::{TimeZone, Utc};
    // Construct the instant deterministically with chrono so the test doesn't
    // hinge on hand-computed epoch arithmetic.
    let dt = Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap();
    let micros = dt.timestamp() * 1_000_000 + 123_456;
    let arr = TimestampMicrosecondArray::from(vec![Some(micros)]).with_timezone("UTC");
    let out = format_timestamptz_as_utf8(&arr, &TimeUnit::Microsecond);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(s.value(0), "2026-01-02 03:04:05.123456+00");
}

#[test]
fn format_timestamptz_all_units_match_same_instant() {
    use chrono::{TimeZone, Utc};
    let dt = Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap();
    let secs: i64 = dt.timestamp();
    let s_arr = TimestampSecondArray::from(vec![Some(secs)]);
    let ms_arr = TimestampMillisecondArray::from(vec![Some(secs * 1_000)]);
    let us_arr = TimestampMicrosecondArray::from(vec![Some(secs * 1_000_000)]);
    let ns_arr = TimestampNanosecondArray::from(vec![Some(secs * 1_000_000_000)]);
    let s = format_timestamptz_as_utf8(&s_arr, &TimeUnit::Second);
    let ms = format_timestamptz_as_utf8(&ms_arr, &TimeUnit::Millisecond);
    let us = format_timestamptz_as_utf8(&us_arr, &TimeUnit::Microsecond);
    let ns = format_timestamptz_as_utf8(&ns_arr, &TimeUnit::Nanosecond);
    let to_str = |a: ArrayRef| {
        a.as_any().downcast_ref::<StringArray>().unwrap().value(0).to_string()
    };
    let v_s = to_str(s);
    let v_ms = to_str(ms);
    let v_us = to_str(us);
    let v_ns = to_str(ns);
    assert_eq!(v_s, v_ms);
    assert_eq!(v_ms, v_us);
    assert_eq!(v_us, v_ns);
    assert!(v_s.starts_with("2026-01-02 03:04:05"));
}

#[test]
fn format_timestamptz_preserves_null() {
    let arr = TimestampMicrosecondArray::from(vec![Some(0_i64), None]);
    let out = format_timestamptz_as_utf8(&arr, &TimeUnit::Microsecond);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert!(!s.is_null(0));
    assert!(s.is_null(1));
}

// ---------- format_interval_day_micros ----------

#[rstest]
#[case(0, 0, 0, "0 years 0 mons 0 days 00:00:00")]
#[case(13, 0, 0, "1 years 1 mons 0 days 00:00:00")]
#[case(0, 0, 1_500_000, "0 years 0 mons 0 days 00:00:01.500000")]
fn format_interval_day_micros_basic(
    #[case] months: i32,
    #[case] days: i32,
    #[case] micros: i64,
    #[case] expected: &str,
) {
    assert_eq!(format_interval_day_micros(months, days, micros), expected);
}

#[test]
fn format_interval_day_micros_negative_time() {
    // Negative micros → leading '-' on the time component.
    // div_euclid(-1_500_000, 1_000_000) = -2; rem_euclid = 500_000.
    // So -1.5s → "-00:00:02.500000" (= -2s + 0.5s = -1.5s).
    let out = format_interval_day_micros(0, 0, -1_500_000);
    assert_eq!(out, "0 years 0 mons 0 days -00:00:02.500000");
}

#[test]
fn format_interval_day_micros_multi_unit() {
    // 2 days + 1h1m1s = 3661 seconds = 3_661_000_000 micros.
    let out = format_interval_day_micros(0, 2, 3_661_000_000);
    assert_eq!(out, "0 years 0 mons 2 days 01:01:01");
}

// ---------- format_interval_as_utf8 ----------

#[test]
fn format_interval_year_month_basic() {
    let arr = IntervalYearMonthArray::from(vec![Some(25)]); // 2y 1m
    let out = format_interval_as_utf8(&arr, &IntervalUnit::YearMonth);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(s.value(0), "2 years 1 mons");
}

#[test]
fn format_interval_day_time_matches_helper() {
    let days = 1_i32;
    let millis = 2_000_i32; // 2 seconds
    let arr = IntervalDayTimeArray::from(vec![Some(IntervalDayTime::new(days, millis))]);
    let out = format_interval_as_utf8(&arr, &IntervalUnit::DayTime);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    let expected = format_interval_day_micros(0, days, (millis as i64) * 1_000);
    assert_eq!(s.value(0), expected);
}

#[test]
fn format_interval_month_day_nano_matches_helper() {
    let months = 1_i32;
    let days = 2_i32;
    let nanos: i64 = 3_000_000_000; // 3 seconds
    let arr = IntervalMonthDayNanoArray::from(vec![Some(IntervalMonthDayNano::new(
        months, days, nanos,
    ))]);
    let out = format_interval_as_utf8(&arr, &IntervalUnit::MonthDayNano);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    let expected = format_interval_day_micros(months, days, nanos / 1_000);
    assert_eq!(s.value(0), expected);
}

#[test]
fn format_interval_year_month_null_preserved() {
    // The bug-fix that this whole function exists for: NULLs in interval
    // arrays must reach the wire as NULL, not as a leaked buffer slot.
    let arr = IntervalYearMonthArray::from(vec![Some(12), None, Some(0)]);
    let out = format_interval_as_utf8(&arr, &IntervalUnit::YearMonth);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert!(!s.is_null(0));
    assert!(s.is_null(1));
    assert!(!s.is_null(2));
}

#[test]
fn format_interval_day_time_null_preserved() {
    let arr = IntervalDayTimeArray::from(vec![
        Some(IntervalDayTime::new(1, 0)),
        None,
    ]);
    let out = format_interval_as_utf8(&arr, &IntervalUnit::DayTime);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert!(!s.is_null(0));
    assert!(s.is_null(1));
}

#[test]
fn format_interval_month_day_nano_null_preserved() {
    let arr = IntervalMonthDayNanoArray::from(vec![
        Some(IntervalMonthDayNano::new(0, 1, 0)),
        None,
    ]);
    let out = format_interval_as_utf8(&arr, &IntervalUnit::MonthDayNano);
    let s = out.as_any().downcast_ref::<StringArray>().unwrap();
    assert!(!s.is_null(0));
    assert!(s.is_null(1));
}

// ---------- is_duckdb_non_query_schema ----------

#[test]
fn is_duckdb_non_query_schema_success_bool() {
    let s = Schema::new(vec![Field::new("Success", DataType::Boolean, false)]);
    assert!(is_duckdb_non_query_schema(&s));
}

#[test]
fn is_duckdb_non_query_schema_count_int64() {
    let s = Schema::new(vec![Field::new("Count", DataType::Int64, false)]);
    assert!(is_duckdb_non_query_schema(&s));
}

#[test]
fn is_duckdb_non_query_schema_case_sensitive() {
    // Lowercase 'success' is NOT the magic schema.
    let s = Schema::new(vec![Field::new("success", DataType::Boolean, false)]);
    assert!(!is_duckdb_non_query_schema(&s));
}

#[test]
fn is_duckdb_non_query_schema_two_columns_is_false() {
    let s = Schema::new(vec![
        Field::new("a", DataType::Int32, false),
        Field::new("b", DataType::Int32, false),
    ]);
    assert!(!is_duckdb_non_query_schema(&s));
}

#[test]
fn is_duckdb_non_query_schema_one_column_wrong_name() {
    let s = Schema::new(vec![Field::new("result", DataType::Int64, false)]);
    assert!(!is_duckdb_non_query_schema(&s));
}

#[test]
fn is_duckdb_non_query_schema_empty_schema_is_false() {
    let s = Schema::new(Vec::<Field>::new());
    assert!(!is_duckdb_non_query_schema(&s));
}

// ---------- schema_to_field_info ----------

#[test]
fn schema_to_field_info_two_fields() {
    let s = Schema::new(vec![
        Field::new("a", DataType::Int32, false),
        Field::new("b", DataType::Utf8, true),
    ]);
    let fields = schema_to_field_info(&s, &Format::UnifiedText).unwrap();
    assert_eq!(fields.len(), 2);
    assert_eq!(fields[0].name(), "a");
    assert_eq!(fields[1].name(), "b");
}

#[test]
fn schema_to_field_info_text_format_consistent() {
    let s = Schema::new(vec![Field::new("c", DataType::Int64, false)]);
    let text = schema_to_field_info(&s, &Format::UnifiedText).unwrap();
    let binary = schema_to_field_info(&s, &Format::UnifiedBinary).unwrap();
    // Differ in format byte but match in name/type.
    assert_eq!(text[0].name(), binary[0].name());
    assert_eq!(text[0].datatype(), binary[0].datatype());
}

// ---------- extract_panic_message ----------

#[test]
fn extract_panic_message_from_static_str() {
    let panic: Box<dyn std::any::Any + Send> = Box::new("static str panic");
    assert_eq!(extract_panic_message(panic), "static str panic");
}

#[test]
fn extract_panic_message_from_owned_string() {
    let panic: Box<dyn std::any::Any + Send> = Box::new(String::from("owned panic"));
    assert_eq!(extract_panic_message(panic), "owned panic");
}

#[test]
fn extract_panic_message_unknown_type() {
    let panic: Box<dyn std::any::Any + Send> = Box::new(42_i32);
    assert_eq!(extract_panic_message(panic), "unknown panic");
}

// ---------- rebuild_record_batch_for_pg additional coverage ----------

#[test]
fn rebuild_record_batch_timestamptz_becomes_utf8() {
    let arr = TimestampMicrosecondArray::from(vec![Some(0_i64)]).with_timezone("+00:00");
    let schema = Arc::new(Schema::new(vec![Field::new(
        "ts",
        DataType::Timestamp(TimeUnit::Microsecond, Some("+00:00".into())),
        false,
    )]));
    let rb = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
    let casted = rebuild_record_batch_for_pg(rb);
    assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
    let col = casted.column(0).as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(col.value(0), "1970-01-01 00:00:00.000000+00");
}

#[test]
fn rebuild_record_batch_decimal128_becomes_utf8() {
    let arr = Decimal128Array::from(vec![Some(12345_i128)])
        .with_precision_and_scale(10, 2)
        .unwrap();
    let schema = Arc::new(Schema::new(vec![Field::new(
        "d",
        DataType::Decimal128(10, 2),
        false,
    )]));
    let rb = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
    let casted = rebuild_record_batch_for_pg(rb);
    assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
    let col = casted.column(0).as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(col.value(0), "123.45");
}

#[test]
fn rebuild_record_batch_interval_becomes_utf8_with_nulls() {
    let arr = IntervalYearMonthArray::from(vec![Some(13), None]);
    let schema = Arc::new(Schema::new(vec![Field::new(
        "iv",
        DataType::Interval(IntervalUnit::YearMonth),
        true,
    )]));
    let rb = RecordBatch::try_new(schema, vec![Arc::new(arr)]).unwrap();
    let casted = rebuild_record_batch_for_pg(rb);
    assert_eq!(casted.schema().field(0).data_type(), &DataType::Utf8);
    let col = casted.column(0).as_any().downcast_ref::<StringArray>().unwrap();
    assert_eq!(col.value(0), "1 years 1 mons");
    assert!(col.is_null(1));
}

#[test]
fn rebuild_record_batch_mixed_only_converts_needed_column() {
    let int_arr = Int32Array::from(vec![1, 2, 3]);
    let dec_arr = Decimal128Array::from(vec![Some(100_i128), Some(200), Some(300)])
        .with_precision_and_scale(10, 2)
        .unwrap();
    let schema = Arc::new(Schema::new(vec![
        Field::new("i", DataType::Int32, false),
        Field::new("d", DataType::Decimal128(10, 2), false),
    ]));
    let rb = RecordBatch::try_new(schema, vec![Arc::new(int_arr), Arc::new(dec_arr)]).unwrap();
    let casted = rebuild_record_batch_for_pg(rb);
    assert_eq!(casted.schema().field(0).data_type(), &DataType::Int32);
    assert_eq!(casted.schema().field(1).data_type(), &DataType::Utf8);
}
