use duckdb_neo::{
    bind_arguments::BindArgument,
    connection::{Context, FFILink},
    data_chunk::VectorCollection,
    error::{DuckDBError, Error},
    signature::{FunctionParameter, FunctionParameterKind},
    value::Value,
    vector::{Unknown, Vector},
    DuckDBType, Result,
};

/// Positional-only parameter named like v1's unnamed ones (`col0`, `col1`, ...).
pub fn positional<T: DuckDBType>(index: usize) -> FunctionParameter {
    FunctionParameter::new::<T>(format!("col{}", index)).kind(FunctionParameterKind::PositionalOnly)
}

// v1 raised bind failures as Binder Errors and init/exec/scalar failures as Invalid Input Errors.
pub fn bind_error(e: Box<dyn std::error::Error>) -> Error {
    match e.downcast::<Error>() {
        Ok(e) => *e,
        Err(e) => Error { code: DuckDBError::QueryBinder, message: e.to_string() },
    }
}

pub fn exec_error(e: impl std::fmt::Display) -> Error {
    Error { code: DuckDBError::InputInvalid, message: e.to_string() }
}

fn arg_value(arguments: &[BindArgument], index: usize) -> Result<&Value> {
    let argument = arguments
        .get(index)
        .ok_or_else(|| Error { code: DuckDBError::QueryBinder, message: format!("missing argument {}", index) })?;
    // Unresolved prepared parameter: DuckDB rebinds once the value is known.
    argument.value.as_ref().ok_or_else(|| Error {
        code: DuckDBError::QueryParameterNotResolved,
        message: "table function arguments must be constant".to_string(),
    })
}

/// String form of a bound VARCHAR argument; SQL NULL renders as "NULL".
pub fn arg_string(arguments: &[BindArgument], index: usize) -> Result<String> {
    Ok(arg_value(arguments, index)?.get::<String>()?.unwrap_or_else(|| "NULL".to_string()))
}

/// Like [`arg_string`] for an `ANY` argument, cast to VARCHAR first as v1 did for named parameters.
pub fn arg_varchar(context: &Context, arguments: &[BindArgument], index: usize) -> Result<String> {
    let value = context.value_cast(arg_value(arguments, index)?, &String::logical_type(context)?)?;
    Ok(value.get::<String>()?.unwrap_or_else(|| "NULL".to_string()))
}

pub fn input_string(vectors: &VectorCollection, column: usize, row: usize) -> Result<String> {
    let reader = vectors.get_vector_at::<String>(column)?.reader()?;
    Ok(reader.get(row)?.unwrap_or_default().to_string())
}

/// Write one VARCHAR per row; `None` rows become NULL.
pub fn write_strings(output: Vector<'_, Unknown>, values: &[Option<String>]) -> Result<()> {
    let mut output = output.cast::<String>()?;
    output.set_size(values.len())?;
    let mut writer = output.writer()?;
    for (row, value) in values.iter().enumerate() {
        writer.set(row, value.as_deref())?;
    }
    Ok(())
}
