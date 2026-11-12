//! SEAM: storage extension for `ATTACH 'hdbsql://…' AS h (TYPE hana)`. Not implemented yet.

use duckdb_neo::extension::Extension;
use std::error::Error;

pub fn register(_ext: &Extension) -> Result<(), Box<dyn Error>> {
    Ok(())
}
