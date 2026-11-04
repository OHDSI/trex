//! Queries on a raw connection without preparing them.
//!
//! A session routed to a remote server with `CONNECT 'quack:…'` cannot run
//! prepared statements: DuckDB prepares by running a `PREPARE`, which the
//! routed session forwards, so it is never registered locally. Plain
//! `duckdb_query` calls are forwarded whole, so sessions use them for every
//! statement and read results through the Arrow C interface.

use std::ffi::{CStr, CString};
use std::mem::MaybeUninit;
use std::os::raw::c_char;

use arrow_array::{RecordBatch, StructArray};
use duckdb::arrow::ffi::{from_ffi, FFI_ArrowArray, FFI_ArrowSchema};
use duckdb::ffi;

use crate::result::TrexResult;

/// Runs `sql` (one or more statements) on `con`; the result is the last statement's.
///
/// # Safety
/// `con` must be a live connection.
pub unsafe fn query(con: ffi::duckdb_connection, sql: &str) -> Result<TrexResult, String> {
    let c_sql = CString::new(sql).map_err(|e| e.to_string())?;
    let mut res = MaybeUninit::<ffi::duckdb_result>::zeroed();
    let rc = ffi::duckdb_query(con, c_sql.as_ptr(), res.as_mut_ptr());
    let mut res = res.assume_init();
    let out = if rc != ffi::DuckDBSuccess {
        Err(result_error(&mut res).unwrap_or_else(|| "query failed".to_string()))
    } else {
        read(&mut res)
    };
    ffi::duckdb_destroy_result(&mut res);
    out
}

unsafe fn result_error(res: &mut ffi::duckdb_result) -> Option<String> {
    let p = ffi::duckdb_result_error(res);
    if p.is_null() {
        None
    } else {
        Some(CStr::from_ptr(p).to_string_lossy().into_owned())
    }
}

unsafe fn error_data(e: ffi::duckdb_error_data) -> Result<(), String> {
    if e.is_null() {
        return Ok(());
    }
    let mut e = e;
    let has = ffi::duckdb_error_data_has_error(e);
    let msg = if has {
        let p = ffi::duckdb_error_data_message(e);
        Some(if p.is_null() {
            "Arrow conversion failed".to_string()
        } else {
            CStr::from_ptr(p).to_string_lossy().into_owned()
        })
    } else {
        None
    };
    ffi::duckdb_destroy_error_data(&mut e);
    match msg {
        Some(m) => Err(m),
        None => Ok(()),
    }
}

unsafe fn read(res: &mut ffi::duckdb_result) -> Result<TrexResult, String> {
    let ncols = ffi::duckdb_column_count(res) as usize;
    let mut names: Vec<*const c_char> = Vec::with_capacity(ncols);
    let mut types: Vec<ffi::duckdb_logical_type> = Vec::with_capacity(ncols);
    for i in 0..ncols {
        names.push(ffi::duckdb_column_name(res, i as u64));
        types.push(ffi::duckdb_column_logical_type(res, i as u64));
    }
    let mut options = ffi::duckdb_result_get_arrow_options(res);
    let out = read_batches(res, options, &mut names, &mut types);
    for t in types.iter_mut() {
        ffi::duckdb_destroy_logical_type(t);
    }
    ffi::duckdb_destroy_arrow_options(&mut options);
    out
}

unsafe fn read_batches(
    res: &mut ffi::duckdb_result,
    options: ffi::duckdb_arrow_options,
    names: &mut [*const c_char],
    types: &mut [ffi::duckdb_logical_type],
) -> Result<TrexResult, String> {
    let mut ffi_schema = FFI_ArrowSchema::empty();
    error_data(ffi::duckdb_to_arrow_schema(
        options,
        types.as_mut_ptr(),
        names.as_mut_ptr(),
        names.len() as u64,
        &mut ffi_schema as *mut FFI_ArrowSchema as *mut ffi::ArrowSchema,
    ))?;
    let schema = arrow_schema::Schema::try_from(&ffi_schema).map_err(|e| e.to_string())?;

    let mut batches = Vec::new();
    loop {
        let mut chunk = ffi::duckdb_fetch_chunk(*res);
        if chunk.is_null() {
            break;
        }
        if ffi::duckdb_data_chunk_get_size(chunk) == 0 {
            ffi::duckdb_destroy_data_chunk(&mut chunk);
            break;
        }
        let mut array = FFI_ArrowArray::empty();
        let converted = ffi::duckdb_data_chunk_to_arrow(
            options,
            chunk,
            &mut array as *mut FFI_ArrowArray as *mut ffi::ArrowArray,
        );
        ffi::duckdb_destroy_data_chunk(&mut chunk);
        error_data(converted)?;
        let data = from_ffi(array, &ffi_schema).map_err(|e| e.to_string())?;
        batches.push(RecordBatch::from(StructArray::from(data)));
    }
    if let Some(e) = result_error(res) {
        return Err(e);
    }
    TrexResult::from_pool_batches(&schema, &batches)
}
