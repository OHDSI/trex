use etl_lib::types::{ArrayCell, Cell, Type};
use etl::type_mapping::{cell_to_sql_literal, pg_type_to_duckdb};

// --- pg_type_to_duckdb: every arm ---

#[test]
fn pg_type_scalar_arms() {
    assert_eq!(pg_type_to_duckdb(&Type::BOOL), "BOOLEAN");
    assert_eq!(pg_type_to_duckdb(&Type::INT2), "SMALLINT");
    assert_eq!(pg_type_to_duckdb(&Type::INT4), "INTEGER");
    assert_eq!(pg_type_to_duckdb(&Type::INT8), "BIGINT");
    assert_eq!(pg_type_to_duckdb(&Type::FLOAT4), "FLOAT");
    assert_eq!(pg_type_to_duckdb(&Type::FLOAT8), "DOUBLE");
    assert_eq!(pg_type_to_duckdb(&Type::NUMERIC), "DECIMAL");
    assert_eq!(pg_type_to_duckdb(&Type::OID), "UINTEGER");
}

#[test]
fn pg_type_text_arms() {
    assert_eq!(pg_type_to_duckdb(&Type::TEXT), "VARCHAR");
    assert_eq!(pg_type_to_duckdb(&Type::VARCHAR), "VARCHAR");
    assert_eq!(pg_type_to_duckdb(&Type::BPCHAR), "VARCHAR");
    assert_eq!(pg_type_to_duckdb(&Type::NAME), "VARCHAR");
}

#[test]
fn pg_type_temporal_arms() {
    assert_eq!(pg_type_to_duckdb(&Type::DATE), "DATE");
    assert_eq!(pg_type_to_duckdb(&Type::TIME), "TIME");
    assert_eq!(pg_type_to_duckdb(&Type::TIMESTAMP), "TIMESTAMP");
    assert_eq!(pg_type_to_duckdb(&Type::TIMESTAMPTZ), "TIMESTAMPTZ");
    assert_eq!(pg_type_to_duckdb(&Type::INTERVAL), "VARCHAR");
}

#[test]
fn pg_type_binary_uuid_json_arms() {
    assert_eq!(pg_type_to_duckdb(&Type::BYTEA), "BLOB");
    assert_eq!(pg_type_to_duckdb(&Type::UUID), "UUID");
    assert_eq!(pg_type_to_duckdb(&Type::JSON), "JSON");
    assert_eq!(pg_type_to_duckdb(&Type::JSONB), "JSON");
}

#[test]
fn pg_type_array_arms_collapse_to_varchar() {
    for t in [
        Type::BOOL_ARRAY, Type::INT2_ARRAY, Type::INT4_ARRAY, Type::INT8_ARRAY,
        Type::FLOAT4_ARRAY, Type::FLOAT8_ARRAY, Type::TEXT_ARRAY, Type::VARCHAR_ARRAY,
    ] {
        assert_eq!(pg_type_to_duckdb(&t), "VARCHAR", "array arm {:?}", t);
    }
}

#[test]
fn pg_type_unknown_arm_falls_back_to_varchar() {
    // CIDR is not enumerated explicitly — must hit the `_` arm.
    assert_eq!(pg_type_to_duckdb(&Type::CIDR), "VARCHAR");
}

// --- cell_to_sql_literal: every variant ---

#[test]
fn cell_null_and_bool() {
    assert_eq!(cell_to_sql_literal(&Cell::Null), "NULL");
    assert_eq!(cell_to_sql_literal(&Cell::Bool(true)), "TRUE");
    assert_eq!(cell_to_sql_literal(&Cell::Bool(false)), "FALSE");
}

#[test]
fn cell_integer_variants() {
    assert_eq!(cell_to_sql_literal(&Cell::I16(-32768)), "-32768");
    assert_eq!(cell_to_sql_literal(&Cell::I32(2_147_483_647)), "2147483647");
    assert_eq!(cell_to_sql_literal(&Cell::U32(4_294_967_295)), "4294967295");
    assert_eq!(cell_to_sql_literal(&Cell::I64(-9_223_372_036_854_775_808)), "-9223372036854775808");
}

#[test]
fn cell_numeric_is_quoted() {
    use etl_lib::types::PgNumeric;
    use std::str::FromStr;
    let n = PgNumeric::from_str("3.14").unwrap();
    let lit = cell_to_sql_literal(&Cell::Numeric(n));
    assert_eq!(lit, "'3.14'");
}

#[test]
fn cell_float_variants() {
    assert_eq!(cell_to_sql_literal(&Cell::F32(1.5)), "1.5");
    assert_eq!(cell_to_sql_literal(&Cell::F64(-2.25)), "-2.25");
}

#[test]
fn cell_string_quotes_escaped() {
    assert_eq!(cell_to_sql_literal(&Cell::String("hello".into())), "'hello'");
    assert_eq!(cell_to_sql_literal(&Cell::String("it's".into())), "'it''s'");
    assert_eq!(cell_to_sql_literal(&Cell::String("a''b".into())), "'a''''b'");
    assert_eq!(cell_to_sql_literal(&Cell::String(String::new())), "''");
}

#[test]
fn cell_bytes_hex_encoded() {
    let lit = cell_to_sql_literal(&Cell::Bytes(vec![0x00, 0xff, 0xab]));
    assert_eq!(lit, "'\\x00ffab'::BLOB");
    let empty = cell_to_sql_literal(&Cell::Bytes(vec![]));
    assert_eq!(empty, "'\\x'::BLOB");
}

#[test]
fn cell_uuid_is_quoted() {
    use uuid::Uuid;
    let u = Uuid::nil();
    let lit = cell_to_sql_literal(&Cell::Uuid(u));
    assert_eq!(lit, "'00000000-0000-0000-0000-000000000000'");
}

#[test]
fn cell_date_time_timestamp_quoted() {
    use chrono::{NaiveDate, NaiveTime, NaiveDateTime, DateTime, Utc};
    let d = NaiveDate::from_ymd_opt(2026, 5, 23).unwrap();
    assert_eq!(cell_to_sql_literal(&Cell::Date(d)), "'2026-05-23'");

    let t = NaiveTime::from_hms_opt(12, 0, 0).unwrap();
    assert_eq!(cell_to_sql_literal(&Cell::Time(t)), "'12:00:00'");

    let ts = NaiveDateTime::parse_from_str("2026-05-23 12:00:00", "%Y-%m-%d %H:%M:%S").unwrap();
    assert_eq!(cell_to_sql_literal(&Cell::Timestamp(ts)), "'2026-05-23 12:00:00'");

    let tstz: DateTime<Utc> = DateTime::parse_from_rfc3339("2026-05-23T12:00:00Z").unwrap().into();
    let lit = cell_to_sql_literal(&Cell::TimestampTz(tstz));
    assert!(lit.starts_with('\'') && lit.ends_with('\''));
    assert!(lit.contains("2026-05-23"));
}

#[test]
fn cell_json_quoted_and_escaped() {
    use serde_json::json;
    let v = json!({"k": "v's"});
    let lit = cell_to_sql_literal(&Cell::Json(v));
    assert!(lit.starts_with('\'') && lit.ends_with('\''));
    // Embedded single-quote must be doubled.
    assert!(lit.contains("v''s"));
}

#[test]
fn cell_array_uses_debug_format() {
    let arr = ArrayCell::I32(vec![Some(1), Some(2)]);
    let lit = cell_to_sql_literal(&Cell::Array(arr));
    assert_eq!(lit, "'I32([Some(1), Some(2)])'");
}
