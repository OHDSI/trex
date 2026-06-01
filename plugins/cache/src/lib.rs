extern crate duckdb;
#[cfg(feature = "loadable-extension")]
extern crate duckdb_loadable_macros;
#[cfg(feature = "loadable-extension")]
extern crate libduckdb_sys;

pub mod dialect;
pub mod exec;
pub mod runner;
pub mod sql;

#[cfg(feature = "loadable-extension")]
mod cache_create;

#[cfg(feature = "loadable-extension")]
use duckdb::Connection;
#[cfg(feature = "loadable-extension")]
use std::error::Error;

#[cfg(feature = "loadable-extension")]
#[duckdb_loadable_macros::duckdb_entrypoint_c_api()]
pub unsafe fn extension_entrypoint(con: Connection) -> Result<(), Box<dyn Error>> {
    con.register_scalar_function::<cache_create::CacheCreateScalar>("trex_cache_create")
        .expect("Failed to register trex_cache_create scalar function");
    Ok(())
}
