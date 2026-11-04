use std::ffi::CString;
use std::os::raw::c_char;

use arrow_array::{
    Array, BinaryArray, BooleanArray, Date32Array, Decimal128Array, Float32Array, Float64Array,
    Int16Array, Int32Array, Int64Array, Int8Array, LargeBinaryArray, LargeStringArray,
    RecordBatch, StringArray, StringViewArray, Time64MicrosecondArray, TimestampMicrosecondArray,
    TimestampMillisecondArray, TimestampNanosecondArray, TimestampSecondArray, UInt16Array,
    UInt32Array, UInt64Array, UInt8Array,
};
use arrow_schema::{DataType, Schema, TimeUnit as ArrowTimeUnit};
use duckdb::types::{TimeUnit, Value};
use duckdb::Connection;

pub struct TrexResult {
    column_names: Vec<CString>,
    column_types: Vec<i32>,
    rows: Vec<Vec<Value>>,
    current_row: isize, // -1 initially; trexsql_result_next increments
}

impl TrexResult {
    pub fn from_query(conn: &Connection, sql: &str) -> Result<Self, String> {
        let mut stmt = conn.prepare(sql).map_err(|e| format!("{e}"))?;
        let mut rows_iter = stmt.query([]).map_err(|e| format!("{e}"))?;

        // Column info is only available after query() has been called
        let (column_count, column_names, column_types) = {
            let s = rows_iter.as_ref().expect("statement should be available");
            let names: Vec<CString> = s
                .column_names()
                .into_iter()
                .map(|n| CString::new(n).unwrap_or_else(|_| CString::new("?").unwrap()))
                .collect();
            let types: Vec<i32> = (0..s.column_count())
                .map(|i| column_type_code(&s.column_type(i)))
                .collect();
            (s.column_count(), names, types)
        };

        let mut rows = Vec::new();
        while let Some(row) = rows_iter.next().map_err(|e| format!("{e}"))? {
            let mut values = Vec::with_capacity(column_count);
            for i in 0..column_count {
                let val = row
                    .get_ref(i)
                    .map(|v| v.to_owned())
                    .unwrap_or(Value::Null);
                values.push(val);
            }
            rows.push(values);
        }

        Ok(TrexResult {
            column_names,
            column_types,
            rows,
            current_row: -1,
        })
    }

    /// Build a result from Arrow batches returned by a pool session.
    pub fn from_pool_batches(schema: &Schema, batches: &[RecordBatch]) -> Result<Self, String> {
        let column_names: Vec<CString> = schema
            .fields()
            .iter()
            .map(|f| CString::new(f.name().as_str()).unwrap_or_else(|_| CString::new("?").unwrap()))
            .collect();
        let ncols = column_names.len();
        let column_types: Vec<i32> = schema
            .fields()
            .iter()
            .map(|f| column_type_code(f.data_type()))
            .collect();

        let mut rows = Vec::new();
        for batch in batches {
            for r in 0..batch.num_rows() {
                let mut values = Vec::with_capacity(ncols);
                for c in 0..ncols {
                    values.push(arrow_value(batch.column(c).as_ref(), r));
                }
                rows.push(values);
            }
        }

        Ok(TrexResult {
            column_names,
            column_types,
            rows,
            current_row: -1,
        })
    }

    pub fn column_count(&self) -> i32 {
        self.column_names.len() as i32
    }

    /// Returned pointer is owned by the result; valid until result is freed.
    pub fn column_name(&self, col: i32) -> *const c_char {
        match self.column_names.get(col as usize) {
            Some(name) => name.as_ptr(),
            None => std::ptr::null(),
        }
    }

    /// Column type as a `TYPE_*` code; `TYPE_OTHER` for out-of-range columns.
    pub fn column_type(&self, col: i32) -> i32 {
        self.column_types.get(col as usize).copied().unwrap_or(TYPE_OTHER)
    }

    pub fn next(&mut self) -> bool {
        self.current_row += 1;
        (self.current_row as usize) < self.rows.len()
    }

    fn current_value(&self, col: i32) -> Option<&Value> {
        if self.current_row < 0 {
            return None;
        }
        self.rows
            .get(self.current_row as usize)
            .and_then(|row| row.get(col as usize))
    }

    pub fn is_null(&self, col: i32) -> bool {
        match self.current_value(col) {
            Some(Value::Null) | None => true,
            _ => false,
        }
    }

    /// Caller must free with trexsql_free_string.
    pub fn get_string(&self, col: i32) -> Option<CString> {
        let val = self.current_value(col)?;
        let s = value_to_string(val);
        CString::new(s).ok()
    }

    pub fn get_long(&self, col: i32) -> i64 {
        match self.current_value(col) {
            Some(v) => value_to_long(v),
            None => 0,
        }
    }

    pub fn get_double(&self, col: i32) -> f64 {
        match self.current_value(col) {
            Some(v) => value_to_double(v),
            None => 0.0,
        }
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Boolean(b) => b.to_string(),
        Value::TinyInt(i) => i.to_string(),
        Value::SmallInt(i) => i.to_string(),
        Value::Int(i) => i.to_string(),
        Value::BigInt(i) => i.to_string(),
        Value::HugeInt(i) => i.to_string(),
        Value::UTinyInt(i) => i.to_string(),
        Value::USmallInt(i) => i.to_string(),
        Value::UInt(i) => i.to_string(),
        Value::UBigInt(i) => i.to_string(),
        Value::Float(f) => f.to_string(),
        Value::Double(f) => f.to_string(),
        Value::Decimal(d) => format!("{d}"),
        Value::Text(s) => s.clone(),
        Value::Blob(b) => hex::encode(b),
        Value::Timestamp(_, us) => format!("{us}"),
        Value::Date32(d) => d.to_string(),
        Value::Time64(_, t) => t.to_string(),
        _ => format!("{v:?}"),
    }
}

fn value_to_long(v: &Value) -> i64 {
    match v {
        Value::Boolean(b) => *b as i64,
        Value::TinyInt(i) => *i as i64,
        Value::SmallInt(i) => *i as i64,
        Value::Int(i) => *i as i64,
        Value::BigInt(i) => *i,
        Value::HugeInt(i) => *i as i64,
        Value::UTinyInt(i) => *i as i64,
        Value::USmallInt(i) => *i as i64,
        Value::UInt(i) => *i as i64,
        Value::UBigInt(i) => *i as i64,
        Value::Float(f) => *f as i64,
        Value::Double(f) => *f as i64,
        // Temporal values as epoch offsets: timestamps in microseconds, dates in
        // days, times in microseconds since midnight.
        Value::Timestamp(unit, t) => unit.to_micros(*t),
        Value::Date32(d) => *d as i64,
        Value::Time64(unit, t) => unit.to_micros(*t),
        _ => 0,
    }
}

// Column type codes reported by trexsql_result_column_type.
pub const TYPE_OTHER: i32 = 0;
pub const TYPE_BOOLEAN: i32 = 1;
pub const TYPE_INTEGER: i32 = 2;
pub const TYPE_BIGINT: i32 = 3;
pub const TYPE_DOUBLE: i32 = 4;
pub const TYPE_DECIMAL: i32 = 5;
pub const TYPE_VARCHAR: i32 = 6;
pub const TYPE_DATE: i32 = 7;
pub const TYPE_TIMESTAMP: i32 = 8;
pub const TYPE_TIME: i32 = 9;
pub const TYPE_BLOB: i32 = 10;

fn column_type_code(t: &DataType) -> i32 {
    match t {
        DataType::Boolean => TYPE_BOOLEAN,
        DataType::Int8 | DataType::Int16 | DataType::Int32 | DataType::UInt8 | DataType::UInt16 => {
            TYPE_INTEGER
        }
        DataType::Int64 | DataType::UInt32 => TYPE_BIGINT,
        DataType::Float16 | DataType::Float32 | DataType::Float64 => TYPE_DOUBLE,
        // Beyond i64: reported as decimal so callers read them as text.
        DataType::UInt64 | DataType::Decimal128(_, _) | DataType::Decimal256(_, _) => TYPE_DECIMAL,
        DataType::Utf8 | DataType::LargeUtf8 | DataType::Utf8View => TYPE_VARCHAR,
        DataType::Date32 | DataType::Date64 => TYPE_DATE,
        DataType::Timestamp(_, _) => TYPE_TIMESTAMP,
        DataType::Time32(_) | DataType::Time64(_) => TYPE_TIME,
        DataType::Binary | DataType::LargeBinary | DataType::BinaryView => TYPE_BLOB,
        _ => TYPE_OTHER,
    }
}

fn value_to_double(v: &Value) -> f64 {
    match v {
        Value::Boolean(b) => if *b { 1.0 } else { 0.0 },
        Value::TinyInt(i) => *i as f64,
        Value::SmallInt(i) => *i as f64,
        Value::Int(i) => *i as f64,
        Value::BigInt(i) => *i as f64,
        Value::HugeInt(i) => *i as f64,
        Value::UTinyInt(i) => *i as f64,
        Value::USmallInt(i) => *i as f64,
        Value::UInt(i) => *i as f64,
        Value::UBigInt(i) => *i as f64,
        Value::Float(f) => *f as f64,
        Value::Double(f) => *f,
        _ => 0.0,
    }
}

// Convert one cell of an Arrow array (from a pool session) to a duckdb Value.
// Covers the scalar types trex/bao queries return; unhandled types map to Null.
fn arrow_value(array: &dyn Array, row: usize) -> Value {
    if array.is_null(row) {
        return Value::Null;
    }
    let any = array.as_any();
    let v = match array.data_type() {
        DataType::Boolean => any.downcast_ref::<BooleanArray>().map(|a| Value::Boolean(a.value(row))),
        DataType::Int8 => any.downcast_ref::<Int8Array>().map(|a| Value::TinyInt(a.value(row))),
        DataType::Int16 => any.downcast_ref::<Int16Array>().map(|a| Value::SmallInt(a.value(row))),
        DataType::Int32 => any.downcast_ref::<Int32Array>().map(|a| Value::Int(a.value(row))),
        DataType::Int64 => any.downcast_ref::<Int64Array>().map(|a| Value::BigInt(a.value(row))),
        DataType::UInt8 => any.downcast_ref::<UInt8Array>().map(|a| Value::UTinyInt(a.value(row))),
        DataType::UInt16 => any.downcast_ref::<UInt16Array>().map(|a| Value::USmallInt(a.value(row))),
        DataType::UInt32 => any.downcast_ref::<UInt32Array>().map(|a| Value::UInt(a.value(row))),
        DataType::UInt64 => any.downcast_ref::<UInt64Array>().map(|a| Value::UBigInt(a.value(row))),
        DataType::Float32 => any.downcast_ref::<Float32Array>().map(|a| Value::Float(a.value(row))),
        DataType::Float64 => any.downcast_ref::<Float64Array>().map(|a| Value::Double(a.value(row))),
        DataType::Utf8 => any.downcast_ref::<StringArray>().map(|a| Value::Text(a.value(row).to_string())),
        DataType::LargeUtf8 => any.downcast_ref::<LargeStringArray>().map(|a| Value::Text(a.value(row).to_string())),
        DataType::Date32 => any.downcast_ref::<Date32Array>().map(|a| Value::Date32(a.value(row))),
        DataType::Utf8View => any.downcast_ref::<StringViewArray>().map(|a| Value::Text(a.value(row).to_string())),
        // Kept as text; column_type reports TYPE_DECIMAL so callers parse it exactly.
        DataType::Decimal128(_, _) => any.downcast_ref::<Decimal128Array>().map(|a| Value::Text(a.value_as_string(row))),
        DataType::Timestamp(unit, _) => match unit {
            ArrowTimeUnit::Second => any.downcast_ref::<TimestampSecondArray>().map(|a| Value::Timestamp(TimeUnit::Second, a.value(row))),
            ArrowTimeUnit::Millisecond => any.downcast_ref::<TimestampMillisecondArray>().map(|a| Value::Timestamp(TimeUnit::Millisecond, a.value(row))),
            ArrowTimeUnit::Microsecond => any.downcast_ref::<TimestampMicrosecondArray>().map(|a| Value::Timestamp(TimeUnit::Microsecond, a.value(row))),
            ArrowTimeUnit::Nanosecond => any.downcast_ref::<TimestampNanosecondArray>().map(|a| Value::Timestamp(TimeUnit::Nanosecond, a.value(row))),
        },
        DataType::Time64(ArrowTimeUnit::Microsecond) => any.downcast_ref::<Time64MicrosecondArray>().map(|a| Value::Time64(TimeUnit::Microsecond, a.value(row))),
        DataType::Binary => any.downcast_ref::<BinaryArray>().map(|a| Value::Blob(a.value(row).to_vec())),
        DataType::LargeBinary => any.downcast_ref::<LargeBinaryArray>().map(|a| Value::Blob(a.value(row).to_vec())),
        _ => None,
    };
    // Lists, structs, UUIDs etc.: Arrow's own rendering rather than losing the value.
    v.or_else(|| {
        duckdb::arrow::util::display::array_value_to_string(array, row)
            .ok()
            .map(Value::Text)
    })
    .unwrap_or(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;

    #[test]
    fn test_query_result() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (id INTEGER, name VARCHAR)").unwrap();
        conn.execute_batch("INSERT INTO t VALUES (1, 'hello'), (2, 'world')").unwrap();

        let mut result = TrexResult::from_query(&conn, "SELECT id, name FROM t ORDER BY id").unwrap();
        assert_eq!(result.column_count(), 2);

        let name0 = unsafe { CStr::from_ptr(result.column_name(0)) };
        assert_eq!(name0.to_str().unwrap(), "id");
        let name1 = unsafe { CStr::from_ptr(result.column_name(1)) };
        assert_eq!(name1.to_str().unwrap(), "name");

        assert!(result.next());
        assert_eq!(result.get_long(0), 1);
        let s = result.get_string(1).unwrap();
        assert_eq!(s.to_str().unwrap(), "hello");

        assert!(result.next());
        assert_eq!(result.get_long(0), 2);
        let s = result.get_string(1).unwrap();
        assert_eq!(s.to_str().unwrap(), "world");

        assert!(!result.next());
    }

    #[test]
    fn test_column_types_and_temporal_longs() {
        let conn = Connection::open_in_memory().unwrap();
        let mut r = TrexResult::from_query(
            &conn,
            "SELECT true b, 1::INTEGER i, 2::BIGINT l, 1.5::DOUBLE d, 1.25::DECIMAL(10,2) n, \
             'x' s, DATE '1970-01-03' dt, TIMESTAMP '1970-01-01 00:00:01' ts, \
             TIME '00:00:02' t, '\\x01'::BLOB bl, [1] lst",
        )
        .unwrap();
        let expected = [
            TYPE_BOOLEAN, TYPE_INTEGER, TYPE_BIGINT, TYPE_DOUBLE, TYPE_DECIMAL, TYPE_VARCHAR,
            TYPE_DATE, TYPE_TIMESTAMP, TYPE_TIME, TYPE_BLOB, TYPE_OTHER,
        ];
        for (i, t) in expected.iter().enumerate() {
            assert_eq!(r.column_type(i as i32), *t, "column {i}");
        }
        assert_eq!(r.column_type(99), TYPE_OTHER);
        assert!(r.next());
        assert_eq!(r.get_long(6), 2);
        assert_eq!(r.get_long(7), 1_000_000);
        assert_eq!(r.get_long(8), 2_000_000);
    }

    #[test]
    fn test_column_types_without_rows() {
        let conn = Connection::open_in_memory().unwrap();
        let r = TrexResult::from_query(&conn, "SELECT 1::BIGINT AS l WHERE false").unwrap();
        assert_eq!(r.column_type(0), TYPE_BIGINT);
    }

    #[test]
    fn test_session_queries_unprepared() {
        let db = crate::engine::TrexDatabase::open_session().unwrap();
        db.execute("CREATE TEMP TABLE s (id INTEGER, d DECIMAL(10,2), ts TIMESTAMP, l INTEGER[])").unwrap();
        db.execute("INSERT INTO s VALUES (1, 1.25, TIMESTAMP '1970-01-01 00:00:01', [1, 2])").unwrap();
        let mut r = db.query("SELECT id, d, ts, l, 'x' AS v FROM s").unwrap();
        assert_eq!(
            (0..5).map(|i| r.column_type(i)).collect::<Vec<_>>(),
            vec![TYPE_INTEGER, TYPE_DECIMAL, TYPE_TIMESTAMP, TYPE_OTHER, TYPE_VARCHAR]
        );
        assert!(r.next());
        assert_eq!(r.get_long(0), 1);
        assert_eq!(r.get_string(1).unwrap().to_str().unwrap(), "1.25");
        assert_eq!(r.get_long(2), 1_000_000);
        assert_eq!(r.get_string(3).unwrap().to_str().unwrap(), "[1, 2]");
        assert!(!r.next());
        let empty = db.query("SELECT 1::BIGINT AS b WHERE false").unwrap();
        assert_eq!(empty.column_type(0), TYPE_BIGINT);
        assert!(db.query("SELECT * FROM missing").err().unwrap().contains("missing"));
        let count = db.query("INSERT INTO s VALUES (2, 0, NULL, NULL)").unwrap();
        assert_eq!(count.column_count(), 1);
    }

    #[test]
    fn test_null_handling() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (x INTEGER)").unwrap();
        conn.execute_batch("INSERT INTO t VALUES (NULL)").unwrap();

        let mut result = TrexResult::from_query(&conn, "SELECT x FROM t").unwrap();
        assert!(result.next());
        assert!(result.is_null(0));
        assert_eq!(result.get_long(0), 0);
    }
}
