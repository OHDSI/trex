use duckdb_neo::{
    connection::Context,
    qualified_name::QualifiedName,
    replacement_scan::{ReplacementHandle, ReplacementScanCallbacks, ReplacementType},
    ToValue,
};

use crate::hana_state;

/// Resolves `HANA__<dbname>_<schema>_<table>` (and attached `<dbname>_<schema>.<table>`) to `hana_scan(...)`.
pub struct HanaReplacementScan;

impl ReplacementScanCallbacks for HanaReplacementScan {
    fn scan(&self, context: &Context, name: &QualifiedName, handle: ReplacementHandle<'_>) -> duckdb_neo::Result<()> {
        // Any failure here must leave the name unclaimed, never fail the query.
        let Ok(parts) = name.parts() else {
            return Ok(());
        };
        let Some((query, url)) = std::panic::catch_unwind(|| hana_state::resolve_scan(&parts)).ok().flatten() else {
            return Ok(());
        };
        handle.set_reference(ReplacementType::Table(QualifiedName::from_parts(&["hana_scan"])?))?;
        handle.add_parameter(query.value(context)?)?;
        handle.add_parameter(url.value(context)?)?;
        Ok(())
    }
}
