use duckdb_neo::{
    duckdb_entrypoint_c_api_v2,
    extension::Extension,
    replacement_scan::ReplacementScanBuilder,
    scalar::ScalarFunctionBuilder,
    table_function::TableFunctionBuilder,
};
use std::error::Error;

mod hana_scan;
mod hana_execute;
mod hana_materialize;
mod hana_attach;
mod hana_state;
mod hana_replacement;
mod hana_catalog;
mod v2_util;
pub mod hana_session_pool;

pub use hana_scan::{
    validate_hana_connection, parse_hana_url, safe_hana_connect, redact_url_password,
    HanaError, LogLevel, HanaLogger,
    HanaScanVTab, HanaScanBindData, HanaScanInitData,
};
pub use hana_execute::{execute_hana_statement, HanaExecuteScalar};
pub use hana_session_pool::HanaEvictSessionScalar;
pub use hana_materialize::{run_materialize, HanaMaterializeCohortScalar};
pub use hana_attach::{HanaAttachVTab, HanaDetachScalar, HanaTablesVTab};
pub use hdbconnect::Connection as HanaConnection;

#[duckdb_entrypoint_c_api_v2(extension_name = "hana_scan", api_version = "v2.0.0")]
pub fn hana_scan_entrypoint(extension: &Extension) -> Result<(), Box<dyn Error>> {
    TableFunctionBuilder::new("trex_hana_scan", HanaScanVTab::signature(), HanaScanVTab).register(extension)?;
    // Deprecated alias for external consumers
    TableFunctionBuilder::new("hana_scan", HanaScanVTab::signature(), HanaScanVTab).register(extension)?;
    TableFunctionBuilder::new("trex_hana_query", HanaScanVTab::signature(), HanaScanVTab).register(extension)?;
    for signature in HanaExecuteScalar::signatures(extension)? {
        ScalarFunctionBuilder::new("trex_hana_execute", signature, HanaExecuteScalar).register(extension)?;
    }
    ScalarFunctionBuilder::new(
        "trex_hana_evict_session",
        HanaEvictSessionScalar::signature(extension)?,
        HanaEvictSessionScalar,
    )
    .register(extension)?;
    ScalarFunctionBuilder::new(
        "trex_hana_materialize_cohort",
        HanaMaterializeCohortScalar::signature(extension)?,
        HanaMaterializeCohortScalar,
    )
    .register(extension)?;
    TableFunctionBuilder::new("trex_hana_attach", HanaAttachVTab::signature(), HanaAttachVTab).register(extension)?;
    ScalarFunctionBuilder::new("trex_hana_detach", HanaDetachScalar::signature(extension)?, HanaDetachScalar)
        .register(extension)?;
    TableFunctionBuilder::new("trex_hana_tables", HanaTablesVTab::signature(), HanaTablesVTab).register(extension)?;
    ReplacementScanBuilder::new(hana_replacement::HanaReplacementScan).register(extension)?;
    hana_catalog::register(extension)?;
    Ok(())
}
