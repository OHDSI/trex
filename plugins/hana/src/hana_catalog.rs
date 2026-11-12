//! `ATTACH 'hdbsql://…' AS h (TYPE hana [, SCHEMA 'S'])`: a read-only catalog of HANA schemas, tables and views,
//! each table read through `trex_hana_scan('SELECT * FROM "S"."T"', url)`.

use duckdb_neo::{
    Error as NeoError, FromValue, Result, ToValue,
    connection::Context,
    extension::Extension,
    storage_extension::{AttachInfo, NameList, StorageExtensionBuilder, StorageExtensionCallbacks, TableBind},
};
use std::error::Error;

use crate::hana_scan::{safe_hana_connect, validate_hana_connection};

pub struct HanaStorage;

pub struct HanaCatalog {
    url: String,
}

fn neo_error(error: Box<dyn Error>) -> NeoError {
    NeoError::invalid_input(error.to_string())
}

fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// The query that reads one table, as passed to `trex_hana_scan`.
pub(crate) fn scan_query(schema: &str, table: &str) -> String {
    format!("SELECT * FROM {}.{}", quote_identifier(schema), quote_identifier(table))
}

/// Runs a one-column query and reports every non-NULL string it returns.
fn list_names(url: &str, query: &str, names: &NameList<'_>) -> Result<()> {
    let connection = safe_hana_connect(url.to_owned()).map_err(neo_error)?;
    let rows = connection
        .query(query)
        .map_err(|e| NeoError::invalid_input(format!("HANA catalog query failed: {e}")))?;
    for row in rows {
        let row = row.map_err(|e| NeoError::invalid_input(format!("HANA catalog row read failed: {e}")))?;
        if let Ok(Some(name)) = row[0].clone().try_into::<Option<String>>() {
            names.add(&name)?;
        }
    }
    Ok(())
}

impl StorageExtensionCallbacks for HanaStorage {
    type Catalog = HanaCatalog;

    fn attach(&self, _context: &Context, info: &AttachInfo<'_>) -> Result<HanaCatalog> {
        let url = info.path()?.to_owned();
        validate_hana_connection(&url).map_err(neo_error)?;
        for (name, value) in info.options()? {
            match name.as_str() {
                "schema" => {
                    let schema = String::from_value(&value)?.unwrap_or_default();
                    if schema.is_empty() {
                        return Err(NeoError::invalid_input("HANA ATTACH option SCHEMA cannot be empty"));
                    }
                    info.set_default_schema(&schema)?;
                }
                other => {
                    return Err(NeoError::invalid_input(format!(
                        "Unrecognized option for HANA ATTACH \"{other}\" (supported: SCHEMA)"
                    )));
                }
            }
        }
        // Connect now so bad credentials fail the ATTACH rather than the first query.
        safe_hana_connect(url.clone()).map_err(neo_error)?;
        Ok(HanaCatalog { url })
    }

    fn list_schemas(&self, _context: &Context, catalog: &HanaCatalog, names: &NameList<'_>) -> Result<()> {
        list_names(
            &catalog.url,
            "SELECT SCHEMA_NAME FROM SYS.SCHEMAS WHERE HAS_PRIVILEGES = 'TRUE'",
            names,
        )
    }

    fn list_tables(&self, _context: &Context, catalog: &HanaCatalog, schema: &str, names: &NameList<'_>) -> Result<()> {
        let schema = quote_literal(schema);
        list_names(
            &catalog.url,
            &format!(
                "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = {schema} \
                 UNION SELECT VIEW_NAME FROM SYS.VIEWS WHERE SCHEMA_NAME = {schema}"
            ),
            names,
        )
    }

    fn bind_table(
        &self,
        context: &Context,
        catalog: &HanaCatalog,
        schema: &str,
        table: &str,
        bind: &TableBind<'_>,
    ) -> Result<()> {
        bind.set_function_name("trex_hana_scan")?;
        bind.add_parameter(scan_query(schema, table).as_str().value(context)?)?;
        bind.add_parameter(catalog.url.as_str().value(context)?)
    }
}

pub fn register(ext: &Extension) -> std::result::Result<(), Box<dyn Error>> {
    // An engine without the storage extension API (e.g. upstream DuckDB) hands over a shorter function table, so
    // calling into it would jump through garbage: leave ATTACH out instead.
    if !engine_has_storage_extension_api() {
        return Ok(());
    }
    StorageExtensionBuilder::new(HanaStorage).register(ext, "hana")?;
    Ok(())
}

/// Whether the engine binary exports the storage extension API, found through the shared object holding the static
/// library version string. Uses only functions every v2 engine has.
#[cfg(unix)]
fn engine_has_storage_extension_api() -> bool {
    use duckdb_neo::ffi;
    use std::ptr::null_mut;

    let mut version = ffi::duckdb_v2_str { ptr: std::ptr::null(), len: 0 };
    let rc = unsafe { ffi::duckdb_v2_library_version(&mut version, null_mut()) };
    if rc != ffi::DUCKDB_V2_ERROR::DUCKDB_V2_ERROR_NONE || version.ptr.is_null() {
        return false;
    }
    unsafe {
        let mut info: libc::Dl_info = std::mem::zeroed();
        if libc::dladdr(version.ptr as *const libc::c_void, &mut info) == 0 || info.dli_fname.is_null() {
            return false;
        }
        let mut handle = libc::dlopen(info.dli_fname, libc::RTLD_LAZY | libc::RTLD_NOLOAD);
        if handle.is_null() {
            // The main executable is not addressable by path on every platform.
            handle = libc::dlopen(std::ptr::null(), libc::RTLD_LAZY);
        }
        if handle.is_null() {
            return false;
        }
        let symbol = libc::dlsym(handle, c"duckdb_v2_storage_extension_create".as_ptr());
        libc::dlclose(handle);
        !symbol.is_null()
    }
}

#[cfg(not(unix))]
fn engine_has_storage_extension_api() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_query_quotes_identifiers() {
        assert_eq!(scan_query("CDM", "PERSON"), r#"SELECT * FROM "CDM"."PERSON""#);
        assert_eq!(scan_query("a\"b", "t"), r#"SELECT * FROM "a""b"."t""#);
    }

    #[test]
    fn quote_literal_escapes() {
        assert_eq!(quote_literal("O'Brien"), "'O''Brien'");
    }
}
