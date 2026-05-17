extern crate duckdb;
extern crate duckdb_loadable_macros;
extern crate libduckdb_sys;

mod compile;
mod dag;
mod freshness;
mod parser;
mod plan;
mod project;
mod run;
mod seed;
mod state;
mod test;

use duckdb::Connection;
use libduckdb_sys as ffi;
use std::cell::Cell;
use std::error::Error;

thread_local! {
    /// When set, `execute_sql` and `query_sql` route through this session.
    static ACTIVE_SESSION: Cell<Option<u64>> = const { Cell::new(None) };
}

/// Set the thread-local active session. Returns the previous value.
pub fn set_active_session(session_id: Option<u64>) -> Option<u64> {
    ACTIVE_SESSION.with(|c| c.replace(session_id))
}

fn active_session() -> Option<u64> {
    ACTIVE_SESSION.with(|c| c.get())
}

/// Read-only public accessor for the thread-local active session id.
/// Used by sibling modules (e.g. `freshness`) that need to know whether
/// to lease their own pool session or piggy-back on an existing one.
pub fn active_session_public() -> Option<u64> {
    active_session()
}

pub fn execute_sql(sql: &str) -> Result<(), Box<dyn Error>> {
    if let Some(sid) = active_session() {
        trex_pool_client::session_execute(sid, sql)
            .map(|_| ())
            .map_err(|e| -> Box<dyn Error> { e.into() })
    } else {
        let sid = trex_pool_client::create_session()
            .map_err(|e| -> Box<dyn Error> { e.into() })?;
        let result = trex_pool_client::session_execute(sid, sql).map(|_| ());
        let _ = trex_pool_client::destroy_session(sid);
        result.map_err(|e| -> Box<dyn Error> { e.into() })
    }
}

pub struct QueryRow {
    pub columns: Vec<String>,
}

pub fn query_sql(sql: &str) -> Result<Vec<QueryRow>, Box<dyn Error>> {
    let (_schema, batches) = if let Some(sid) = active_session() {
        trex_pool_client::session_execute(sid, sql)
            .map_err(|e| -> Box<dyn Error> { e.into() })?
    } else {
        let sid = trex_pool_client::create_session()
            .map_err(|e| -> Box<dyn Error> { e.into() })?;
        let result = trex_pool_client::session_execute(sid, sql);
        let _ = trex_pool_client::destroy_session(sid);
        result.map_err(|e| -> Box<dyn Error> { e.into() })?
    };

    let mut rows = Vec::new();
    for batch in &batches {
        for r in 0..batch.num_rows() {
            let mut columns = Vec::new();
            for c in 0..batch.num_columns() {
                let col = batch.column(c);
                let val = if col.is_null(r) {
                    String::new()
                } else {
                    arrow_value_to_string(col.as_ref(), r)
                };
                columns.push(val);
            }
            rows.push(QueryRow { columns });
        }
    }
    Ok(rows)
}

fn arrow_value_to_string(array: &dyn trex_pool_client::arrow_array::Array, row: usize) -> String {
    use trex_pool_client::arrow_array::*;
    use trex_pool_client::arrow_schema::DataType;

    match array.data_type() {
        DataType::Utf8 => array.as_any().downcast_ref::<StringArray>().unwrap().value(row).to_string(),
        DataType::LargeUtf8 => array.as_any().downcast_ref::<LargeStringArray>().unwrap().value(row).to_string(),
        DataType::Int8 => array.as_any().downcast_ref::<Int8Array>().unwrap().value(row).to_string(),
        DataType::Int16 => array.as_any().downcast_ref::<Int16Array>().unwrap().value(row).to_string(),
        DataType::Int32 => array.as_any().downcast_ref::<Int32Array>().unwrap().value(row).to_string(),
        DataType::Int64 => array.as_any().downcast_ref::<Int64Array>().unwrap().value(row).to_string(),
        DataType::UInt8 => array.as_any().downcast_ref::<UInt8Array>().unwrap().value(row).to_string(),
        DataType::UInt16 => array.as_any().downcast_ref::<UInt16Array>().unwrap().value(row).to_string(),
        DataType::UInt32 => array.as_any().downcast_ref::<UInt32Array>().unwrap().value(row).to_string(),
        DataType::UInt64 => array.as_any().downcast_ref::<UInt64Array>().unwrap().value(row).to_string(),
        DataType::Float32 => array.as_any().downcast_ref::<Float32Array>().unwrap().value(row).to_string(),
        DataType::Float64 => array.as_any().downcast_ref::<Float64Array>().unwrap().value(row).to_string(),
        DataType::Boolean => array.as_any().downcast_ref::<BooleanArray>().unwrap().value(row).to_string(),
        DataType::Decimal128(_, scale) => {
            let raw = array.as_any().downcast_ref::<Decimal128Array>().unwrap().value(row);
            format_decimal_string(&raw.to_string(), *scale as i32)
        }
        DataType::Decimal256(_, scale) => {
            let raw = array.as_any().downcast_ref::<Decimal256Array>().unwrap().value(row);
            format_decimal_string(&raw.to_string(), *scale as i32)
        }
        DataType::Date32 => {
            let days = array.as_any().downcast_ref::<Date32Array>().unwrap().value(row);
            chrono::DateTime::from_timestamp(days as i64 * 86400, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_default()
        }
        DataType::Timestamp(_, _) => array.as_any().downcast_ref::<TimestampMicrosecondArray>()
            .map(|a| chrono::DateTime::from_timestamp_micros(a.value(row))
                .map(|dt| dt.to_rfc3339()).unwrap_or_default())
            .unwrap_or_default(),
        DataType::Binary => format_hex(array.as_any().downcast_ref::<BinaryArray>().unwrap().value(row)),
        DataType::LargeBinary => format_hex(array.as_any().downcast_ref::<LargeBinaryArray>().unwrap().value(row)),
        _ => String::new(),
    }
}

/// Format a stringified integer (raw decimal value) with a given scale into
/// the conventional decimal text form. Pure string manipulation — preserves
/// full precision regardless of integer width (i128, i256).
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

fn format_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(2 + bytes.len() * 2);
    s.push_str("\\x");
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

pub fn escape_sql_ident(s: &str) -> String {
    s.replace('"', "\"\"")
}

pub fn escape_sql_str(s: &str) -> String {
    s.replace('\'', "''")
}


unsafe fn extension_entrypoint(connection: Connection) -> Result<(), Box<dyn Error>> {
    connection.register_table_function::<compile::CompileVTab>("trex_transform_compile")?;
    connection.register_table_function::<plan::PlanVTab>("trex_transform_plan")?;
    connection.register_table_function::<run::RunVTab>("trex_transform_run")?;
    connection.register_table_function::<seed::SeedVTab>("trex_transform_seed")?;
    connection.register_table_function::<test::TestVTab>("trex_transform_test")?;
    connection.register_table_function::<freshness::FreshnessVTab>("trex_transform_freshness")?;
    Ok(())
}

unsafe fn transform_init_c_api_internal(
    info: ffi::duckdb_extension_info,
    access: *const ffi::duckdb_extension_access,
) -> Result<bool, Box<dyn Error>> {
    let have_api_struct = ffi::duckdb_rs_extension_api_init(info, access, "v1.3.2").unwrap();

    if !have_api_struct {
        return Ok(false);
    }

    let db: ffi::duckdb_database = *(*access).get_database.unwrap()(info);

    // Pool already initialized by db plugin
    let connection = Connection::open_from_raw(db.cast())?;
    extension_entrypoint(connection)?;

    Ok(true)
}

#[no_mangle]
pub unsafe extern "C" fn transform_init_c_api(
    info: ffi::duckdb_extension_info,
    access: *const ffi::duckdb_extension_access,
) -> bool {
    let init_result = transform_init_c_api_internal(info, access);

    if let Err(x) = init_result {
        let error_c_string = std::ffi::CString::new(x.to_string());
        match error_c_string {
            Ok(e) => {
                (*access).set_error.unwrap()(info, e.as_ptr());
            }
            Err(_) => {
                let error_msg =
                    c"An error occurred but the extension failed to allocate an error string";
                (*access).set_error.unwrap()(info, error_msg.as_ptr());
            }
        }
        return false;
    }

    init_result.unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use trex_pool_client::arrow_array::*;

    #[test]
    fn format_decimal_basic() {
        assert_eq!(format_decimal_string("12345", 2), "123.45");
        assert_eq!(format_decimal_string("-12345", 2), "-123.45");
        assert_eq!(format_decimal_string("12345", 0), "12345");
        assert_eq!(format_decimal_string("5", 3), "0.005");
        assert_eq!(format_decimal_string("-5", 3), "-0.005");
    }

    #[test]
    fn format_decimal_negative_scale() {
        assert_eq!(format_decimal_string("123", -2), "12300");
        assert_eq!(format_decimal_string("-7", -1), "-70");
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
    fn format_hex_bytes() {
        assert_eq!(format_hex(&[0xDE, 0xAD, 0xBE, 0xEF]), "\\xdeadbeef");
        assert_eq!(format_hex(&[]), "\\x");
    }

    #[test]
    fn arrow_value_decimal128() {
        let arr = Decimal128Array::from(vec![12345i128])
            .with_precision_and_scale(10, 2)
            .unwrap();
        assert_eq!(arrow_value_to_string(&arr, 0), "123.45");
    }

    #[test]
    fn arrow_value_int_and_float() {
        let i = Int32Array::from(vec![42]);
        assert_eq!(arrow_value_to_string(&i, 0), "42");
        let f = Float64Array::from(vec![1.5]);
        assert_eq!(arrow_value_to_string(&f, 0), "1.5");
    }

    #[test]
    fn arrow_value_unsigned() {
        let u = UInt32Array::from(vec![123u32]);
        assert_eq!(arrow_value_to_string(&u, 0), "123");
    }
}
