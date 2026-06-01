use duckdb::core::{DataChunkHandle, Inserter, LogicalTypeId};
use duckdb::vscalar::{ScalarFunctionSignature, VScalar};
use duckdb::vtab::arrow::WritableVector;

use crate::dialect::{default_target, Dialect, NativeScannerDialect, SourceConfig};
use crate::exec::PoolExecutor;
use crate::runner::run_cache;

pub struct CacheCreateScalar;

fn read_string(
    input: &mut DataChunkHandle,
    col: usize,
    row: usize,
) -> Result<String, Box<dyn std::error::Error>> {
    let v = input.flat_vector(col);
    let slice = v.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
    let mut cell = *slice
        .get(row)
        .ok_or_else(|| -> Box<dyn std::error::Error> { "input row index out of bounds".into() })?;
    Ok(duckdb::types::DuckString::new(&mut cell).as_str().to_string())
}

impl VScalar for CacheCreateScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let rows = input.len();
        if rows == 0 {
            return Err("no input provided".into());
        }
        let num_cols = input.num_columns();
        let out = output.flat_vector();

        for row in 0..rows {
            let dialect_str = read_string(input, 0, row)?;
            let source = read_string(input, 1, row)?;
            let schema = read_string(input, 2, row)?;
            let target_arg = if num_cols >= 4 {
                Some(read_string(input, 3, row)?)
            } else {
                None
            };

            let dialect = Dialect::from_str(&dialect_str)
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

            let effective_schema = dialect.effective_schema(&schema);
            let target = match target_arg {
                Some(t) if !t.trim().is_empty() => t,
                _ => default_target(dialect, &effective_schema),
            };

            let cfg = SourceConfig { source, schema, target };
            let exec = PoolExecutor::new()
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            let scanner = NativeScannerDialect::new(dialect);

            let summary = run_cache(&exec, &scanner, &cfg)
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            let response = serde_json::to_string(&summary)?;

            out.insert(row, &response);
        }
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![
            // 3-arg: (dialect, source, schema)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
            // 4-arg: (dialect, source, schema, target)
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into(),
            ),
        ]
    }
}
