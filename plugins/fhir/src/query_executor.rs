use trex_pool_client::arrow_array::{Array, RecordBatch};
use trex_pool_client::arrow_schema::{DataType, Schema, TimeUnit};
use std::sync::Arc;

#[derive(Debug)]
pub enum QueryResult {
    Select {
        rows: Vec<Vec<serde_json::Value>>,
        columns: Vec<String>,
    },
    Execute {
        rows_affected: usize,
    },
    Json(String),
    Error(String),
}

/// A leased session against the shared `trex_pool`. The session pins one
/// Connection for the lifetime of this `RequestConn` so transactions
/// (BEGIN/COMMIT/ROLLBACK) cannot interleave between concurrent FHIR requests.
/// On drop, the session is destroyed; the pool runs cleanup (ROLLBACK + RESET)
/// before returning the Connection to the shared pool.
pub struct RequestConn {
    session_id: u64,
}

impl RequestConn {
    pub fn new() -> Result<Self, String> {
        let session_id = trex_pool_client::create_session()?;
        Ok(Self { session_id })
    }

    pub async fn execute(&self, query: String) -> QueryResult {
        let session_id = self.session_id;
        tokio::task::spawn_blocking(move || {
            match trex_pool_client::session_execute(session_id, &query) {
                Ok((schema, batches)) => arrow_batches_to_query_result(&schema, &batches),
                Err(e) => QueryResult::Error(e),
            }
        })
        .await
        .unwrap_or_else(|_| QueryResult::Error("spawn_blocking failed".into()))
    }

    pub async fn execute_params(&self, query: String, params: Vec<String>) -> QueryResult {
        let session_id = self.session_id;
        tokio::task::spawn_blocking(move || {
            match trex_pool_client::session_execute_params(session_id, &query, &params) {
                Ok((schema, batches)) => arrow_batches_to_query_result(&schema, &batches),
                Err(e) => QueryResult::Error(e),
            }
        })
        .await
        .unwrap_or_else(|_| QueryResult::Error("spawn_blocking failed".into()))
    }
}

impl Drop for RequestConn {
    fn drop(&mut self) {
        let _ = trex_pool_client::destroy_session(self.session_id);
    }
}

fn arrow_batches_to_query_result(schema: &Arc<Schema>, batches: &[RecordBatch]) -> QueryResult {
    if schema.fields().is_empty() && batches.is_empty() {
        return QueryResult::Execute { rows_affected: 0 };
    }

    let columns: Vec<String> = schema
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();

    let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();
    for batch in batches {
        let batch_schema = batch.schema();
        for r in 0..batch.num_rows() {
            let mut row_values = Vec::with_capacity(batch.num_columns());
            for (i, field) in batch_schema.fields().iter().enumerate() {
                let col = batch.column(i);
                row_values.push(column_value_to_json(col.as_ref(), r, field.data_type()));
            }
            rows.push(row_values);
        }
    }
    QueryResult::Select { rows, columns }
}

/// Convert an Arrow value to a JSON string. FHIR handlers consume rows via
/// `serde_json::Value::as_str()`, so every cell is rendered as a JSON string
/// (or `Null`) regardless of the underlying Arrow type.
fn column_value_to_json(
    array: &dyn Array,
    row: usize,
    dt: &DataType,
) -> serde_json::Value {
    use trex_pool_client::arrow_array::*;
    use serde_json::Value as JV;

    if array.is_null(row) {
        return JV::Null;
    }
    match dt {
        DataType::Utf8 => {
            let a = array.as_any().downcast_ref::<StringArray>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::LargeUtf8 => {
            let a = array.as_any().downcast_ref::<LargeStringArray>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Boolean => {
            let a = array.as_any().downcast_ref::<BooleanArray>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Int8 => {
            let a = array.as_any().downcast_ref::<Int8Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Int16 => {
            let a = array.as_any().downcast_ref::<Int16Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Int32 => {
            let a = array.as_any().downcast_ref::<Int32Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Int64 => {
            let a = array.as_any().downcast_ref::<Int64Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::UInt8 => {
            let a = array.as_any().downcast_ref::<UInt8Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::UInt16 => {
            let a = array.as_any().downcast_ref::<UInt16Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::UInt32 => {
            let a = array.as_any().downcast_ref::<UInt32Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::UInt64 => {
            let a = array.as_any().downcast_ref::<UInt64Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Float32 => {
            let a = array.as_any().downcast_ref::<Float32Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Float64 => {
            let a = array.as_any().downcast_ref::<Float64Array>().unwrap();
            JV::String(a.value(row).to_string())
        }
        DataType::Decimal128(_, scale) => {
            let a = array.as_any().downcast_ref::<Decimal128Array>().unwrap();
            let value = a.value(row) as f64 / 10_f64.powi(*scale as i32);
            JV::String(value.to_string())
        }
        DataType::Date32 => {
            let a = array.as_any().downcast_ref::<Date32Array>().unwrap();
            let days = a.value(row);
            let ts = days as i64 * 86400;
            let dt = chrono::DateTime::from_timestamp(ts, 0)
                .unwrap_or(chrono::DateTime::UNIX_EPOCH);
            JV::String(dt.format("%Y-%m-%d").to_string())
        }
        DataType::Timestamp(TimeUnit::Microsecond, _) => {
            let a = array
                .as_any()
                .downcast_ref::<TimestampMicrosecondArray>()
                .unwrap();
            let micros = a.value(row);
            let dt = chrono::DateTime::from_timestamp_micros(micros)
                .unwrap_or(chrono::DateTime::UNIX_EPOCH);
            JV::String(dt.to_rfc3339())
        }
        DataType::Timestamp(TimeUnit::Millisecond, _) => {
            let a = array
                .as_any()
                .downcast_ref::<TimestampMillisecondArray>()
                .unwrap();
            let millis = a.value(row);
            let dt = chrono::DateTime::from_timestamp_millis(millis)
                .unwrap_or(chrono::DateTime::UNIX_EPOCH);
            JV::String(dt.to_rfc3339())
        }
        DataType::Timestamp(TimeUnit::Second, _) => {
            let a = array
                .as_any()
                .downcast_ref::<TimestampSecondArray>()
                .unwrap();
            let secs = a.value(row);
            let dt = chrono::DateTime::from_timestamp(secs, 0)
                .unwrap_or(chrono::DateTime::UNIX_EPOCH);
            JV::String(dt.to_rfc3339())
        }
        DataType::Timestamp(TimeUnit::Nanosecond, _) => {
            let a = array
                .as_any()
                .downcast_ref::<TimestampNanosecondArray>()
                .unwrap();
            let nanos = a.value(row);
            let dt = chrono::DateTime::from_timestamp_nanos(nanos);
            JV::String(dt.to_rfc3339())
        }
        DataType::Decimal256(_, scale) => {
            let a = array.as_any().downcast_ref::<Decimal256Array>().unwrap();
            JV::String(format_decimal_string(&a.value(row).to_string(), *scale as i32))
        }
        DataType::Date64 => {
            let a = array.as_any().downcast_ref::<Date64Array>().unwrap();
            let ms = a.value(row);
            let dt = chrono::DateTime::from_timestamp_millis(ms)
                .unwrap_or(chrono::DateTime::UNIX_EPOCH);
            JV::String(dt.format("%Y-%m-%d").to_string())
        }
        DataType::Time32(TimeUnit::Second) => {
            let a = array.as_any().downcast_ref::<Time32SecondArray>().unwrap();
            let s = a.value(row) as i64;
            JV::String(format!("{:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60))
        }
        DataType::Time32(TimeUnit::Millisecond) => {
            let a = array.as_any().downcast_ref::<Time32MillisecondArray>().unwrap();
            let ms = a.value(row) as i64;
            let s = ms / 1000;
            JV::String(format!(
                "{:02}:{:02}:{:02}.{:03}",
                s / 3600, (s % 3600) / 60, s % 60, ms % 1000
            ))
        }
        DataType::Time64(TimeUnit::Microsecond) => {
            let a = array.as_any().downcast_ref::<Time64MicrosecondArray>().unwrap();
            let us = a.value(row);
            let s = us / 1_000_000;
            JV::String(format!(
                "{:02}:{:02}:{:02}.{:06}",
                s / 3600, (s % 3600) / 60, s % 60, us % 1_000_000
            ))
        }
        DataType::Time64(TimeUnit::Nanosecond) => {
            let a = array.as_any().downcast_ref::<Time64NanosecondArray>().unwrap();
            let ns = a.value(row);
            let s = ns / 1_000_000_000;
            JV::String(format!(
                "{:02}:{:02}:{:02}.{:09}",
                s / 3600, (s % 3600) / 60, s % 60, ns % 1_000_000_000
            ))
        }
        DataType::Binary => {
            let a = array.as_any().downcast_ref::<BinaryArray>().unwrap();
            JV::String(format_hex_bytes(a.value(row)))
        }
        DataType::LargeBinary => {
            let a = array.as_any().downcast_ref::<LargeBinaryArray>().unwrap();
            JV::String(format_hex_bytes(a.value(row)))
        }
        _ => JV::Null,
    }
}

fn format_decimal_string(digits: &str, scale: i32) -> String {
    let (neg, digits) = if let Some(rest) = digits.strip_prefix('-') {
        (true, rest)
    } else {
        (false, digits)
    };
    let body = if scale <= 0 {
        let mut out = digits.to_string();
        for _ in 0..(-scale) {
            out.push('0');
        }
        out
    } else {
        let scale = scale as usize;
        if digits.len() <= scale {
            let mut frac = "0".repeat(scale - digits.len());
            frac.push_str(digits);
            format!("0.{}", frac)
        } else {
            let split = digits.len() - scale;
            format!("{}.{}", &digits[..split], &digits[split..])
        }
    };
    if neg { format!("-{}", body) } else { body }
}

fn format_hex_bytes(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(2 + bytes.len() * 2);
    s.push_str("\\x");
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::{column_value_to_json, format_decimal_string, format_hex_bytes};
    use trex_pool_client::arrow_array::*;
    use trex_pool_client::arrow_schema::{DataType, TimeUnit};

    #[test]
    fn format_decimal_basic() {
        assert_eq!(format_decimal_string("12345", 2), "123.45");
        assert_eq!(format_decimal_string("-12345", 2), "-123.45");
        assert_eq!(format_decimal_string("5", 3), "0.005");
    }

    #[test]
    fn format_decimal_high_precision() {
        let huge = "12345678901234567890123456789012345678";
        assert_eq!(
            format_decimal_string(huge, 10),
            "1234567890123456789012345678.9012345678"
        );
    }

    #[test]
    fn format_hex_basic() {
        assert_eq!(format_hex_bytes(&[0xDE, 0xAD, 0xBE, 0xEF]), "\\xdeadbeef");
    }

    #[test]
    fn arrow_to_json_decimal128() {
        let arr = Decimal128Array::from(vec![12345i128])
            .with_precision_and_scale(10, 2)
            .unwrap();
        let v = column_value_to_json(&arr, 0, &DataType::Decimal128(10, 2));
        assert_eq!(v, serde_json::Value::String("123.45".into()));
    }

    #[test]
    fn arrow_to_json_date64() {
        // 2024-01-01 = 1704067200 sec = 1704067200000 ms
        let arr = Date64Array::from(vec![1704067200000i64]);
        let v = column_value_to_json(&arr, 0, &DataType::Date64);
        assert_eq!(v, serde_json::Value::String("2024-01-01".into()));
    }

    #[test]
    fn arrow_to_json_time32_second() {
        // 12:34:56 = 12*3600 + 34*60 + 56 = 45296
        let arr = Time32SecondArray::from(vec![45296]);
        let v = column_value_to_json(&arr, 0, &DataType::Time32(TimeUnit::Second));
        assert_eq!(v, serde_json::Value::String("12:34:56".into()));
    }

    #[test]
    fn arrow_to_json_binary() {
        let arr = BinaryArray::from(vec![Some(&[0x01, 0xFE][..])]);
        let v = column_value_to_json(&arr, 0, &DataType::Binary);
        assert_eq!(v, serde_json::Value::String("\\x01fe".into()));
    }

    #[test]
    fn arrow_to_json_null_passthrough() {
        let arr = Int32Array::from(vec![None]);
        let v = column_value_to_json(&arr, 0, &DataType::Int32);
        assert_eq!(v, serde_json::Value::Null);
    }

    #[test]
    fn format_decimal_zero_or_negative_scale() {
        assert_eq!(format_decimal_string("123", 0), "123");
        assert_eq!(format_decimal_string("123", -2), "12300");
    }

    #[test]
    fn format_decimal_negative_value() {
        assert_eq!(format_decimal_string("-12345", 2), "-123.45");
        assert_eq!(format_decimal_string("-5", 3), "-0.005");
    }

    #[test]
    fn format_hex_empty_and_single_byte() {
        assert_eq!(format_hex_bytes(&[]), "\\x");
        assert_eq!(format_hex_bytes(&[0x00]), "\\x00");
        assert_eq!(format_hex_bytes(&[0xff]), "\\xff");
    }

    #[test]
    fn arrow_to_json_utf8_and_large_utf8() {
        let s = StringArray::from(vec![Some("hello")]);
        let v = column_value_to_json(&s, 0, &DataType::Utf8);
        assert_eq!(v, serde_json::Value::String("hello".into()));

        let ls = LargeStringArray::from(vec![Some("big")]);
        let v = column_value_to_json(&ls, 0, &DataType::LargeUtf8);
        assert_eq!(v, serde_json::Value::String("big".into()));
    }

    #[test]
    fn arrow_to_json_boolean() {
        let arr = BooleanArray::from(vec![Some(true), Some(false)]);
        assert_eq!(
            column_value_to_json(&arr, 0, &DataType::Boolean),
            serde_json::Value::String("true".into())
        );
        assert_eq!(
            column_value_to_json(&arr, 1, &DataType::Boolean),
            serde_json::Value::String("false".into())
        );
    }

    #[test]
    fn arrow_to_json_signed_integers() {
        assert_eq!(
            column_value_to_json(&Int8Array::from(vec![-12i8]), 0, &DataType::Int8),
            serde_json::Value::String("-12".into())
        );
        assert_eq!(
            column_value_to_json(&Int16Array::from(vec![-1234i16]), 0, &DataType::Int16),
            serde_json::Value::String("-1234".into())
        );
        assert_eq!(
            column_value_to_json(&Int32Array::from(vec![42i32]), 0, &DataType::Int32),
            serde_json::Value::String("42".into())
        );
        assert_eq!(
            column_value_to_json(
                &Int64Array::from(vec![9_999_999_999i64]),
                0,
                &DataType::Int64
            ),
            serde_json::Value::String("9999999999".into())
        );
    }

    #[test]
    fn arrow_to_json_unsigned_integers() {
        assert_eq!(
            column_value_to_json(&UInt8Array::from(vec![5u8]), 0, &DataType::UInt8),
            serde_json::Value::String("5".into())
        );
        assert_eq!(
            column_value_to_json(&UInt16Array::from(vec![500u16]), 0, &DataType::UInt16),
            serde_json::Value::String("500".into())
        );
        assert_eq!(
            column_value_to_json(&UInt32Array::from(vec![50000u32]), 0, &DataType::UInt32),
            serde_json::Value::String("50000".into())
        );
        assert_eq!(
            column_value_to_json(
                &UInt64Array::from(vec![9_999_999_999u64]),
                0,
                &DataType::UInt64
            ),
            serde_json::Value::String("9999999999".into())
        );
    }

    #[test]
    fn arrow_to_json_floats() {
        let v = column_value_to_json(
            &Float32Array::from(vec![1.5f32]),
            0,
            &DataType::Float32,
        );
        assert_eq!(v, serde_json::Value::String("1.5".into()));

        let v = column_value_to_json(
            &Float64Array::from(vec![3.14f64]),
            0,
            &DataType::Float64,
        );
        assert_eq!(v, serde_json::Value::String("3.14".into()));
    }

    #[test]
    fn arrow_to_json_date32() {
        // 2024-01-01 = 19723 days since epoch
        let arr = Date32Array::from(vec![19723]);
        let v = column_value_to_json(&arr, 0, &DataType::Date32);
        assert_eq!(v, serde_json::Value::String("2024-01-01".into()));
    }

    #[test]
    fn arrow_to_json_timestamp_units() {
        // 2024-01-01T00:00:00Z
        let secs = 1704067200i64;

        let arr = TimestampSecondArray::from(vec![secs]);
        let v = column_value_to_json(&arr, 0, &DataType::Timestamp(TimeUnit::Second, None));
        assert!(v.as_str().unwrap().starts_with("2024-01-01"));

        let arr = TimestampMillisecondArray::from(vec![secs * 1000]);
        let v = column_value_to_json(&arr, 0, &DataType::Timestamp(TimeUnit::Millisecond, None));
        assert!(v.as_str().unwrap().starts_with("2024-01-01"));

        let arr = TimestampMicrosecondArray::from(vec![secs * 1_000_000]);
        let v = column_value_to_json(&arr, 0, &DataType::Timestamp(TimeUnit::Microsecond, None));
        assert!(v.as_str().unwrap().starts_with("2024-01-01"));

        let arr = TimestampNanosecondArray::from(vec![secs * 1_000_000_000]);
        let v = column_value_to_json(&arr, 0, &DataType::Timestamp(TimeUnit::Nanosecond, None));
        assert!(v.as_str().unwrap().starts_with("2024-01-01"));
    }

    #[test]
    fn arrow_to_json_time_units() {
        // 01:00:00 = 3600 seconds
        let arr = Time32SecondArray::from(vec![3600]);
        let v = column_value_to_json(&arr, 0, &DataType::Time32(TimeUnit::Second));
        assert_eq!(v, serde_json::Value::String("01:00:00".into()));

        let arr = Time32MillisecondArray::from(vec![3_600_500]);
        let v = column_value_to_json(&arr, 0, &DataType::Time32(TimeUnit::Millisecond));
        let s = v.as_str().unwrap();
        assert!(s.starts_with("01:00:00."));

        let arr = Time64MicrosecondArray::from(vec![3_600_000_500i64]);
        let v = column_value_to_json(&arr, 0, &DataType::Time64(TimeUnit::Microsecond));
        let s = v.as_str().unwrap();
        assert!(s.starts_with("01:00:00."));

        let arr = Time64NanosecondArray::from(vec![3_600_000_000_500i64]);
        let v = column_value_to_json(&arr, 0, &DataType::Time64(TimeUnit::Nanosecond));
        let s = v.as_str().unwrap();
        assert!(s.starts_with("01:00:00."));
    }

    #[test]
    fn arrow_to_json_large_binary() {
        let arr = LargeBinaryArray::from(vec![Some(&[0xab, 0xcd][..])]);
        let v = column_value_to_json(&arr, 0, &DataType::LargeBinary);
        assert_eq!(v, serde_json::Value::String("\\xabcd".into()));
    }

    #[test]
    fn arrow_to_json_unsupported_type_returns_null() {
        // Use a Decimal256 with no test data — but unsupported via wildcard branch.
        // Float16 is an example of an unmapped type.
        let arr = Int32Array::from(vec![Some(1)]);
        let v = column_value_to_json(&arr, 0, &DataType::Float16);
        assert_eq!(v, serde_json::Value::Null);
    }
}
