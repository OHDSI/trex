//! DataFusion `TableProvider` backed by a trexsql connection. Resolves schema
//! via `PRAGMA table_info` and delegates execution through `datafusion-federation`.

use std::any::Any;
use std::fmt;
use std::sync::Arc;

use std::collections::HashMap;

use arrow::array::{Array, StringArray};
use arrow::datatypes::{DataType, Field, Schema, SchemaRef, TimeUnit};
use async_trait::async_trait;
use datafusion::catalog::Session;
use datafusion::datasource::{TableProvider, TableType};
use datafusion::error::Result as DFResult;
use datafusion::logical_expr::Expr;
use datafusion::physical_plan::ExecutionPlan;
use datafusion_federation::sql::SQLFederationProvider;

use crate::duckdb_sql_executor::DuckDBSQLExecutor;

/// Maps a trexsql type string to Arrow `DataType`. Unknown types fall back to Utf8.
fn duckdb_type_to_arrow(type_str: &str) -> DataType {
    let upper = type_str.trim().to_uppercase();

    if upper.starts_with("DECIMAL") || upper.starts_with("NUMERIC") {
        return parse_decimal(&upper);
    }

    match upper.as_str() {
        "INTEGER" | "INT" | "INT4" | "SIGNED" => DataType::Int32,
        "BIGINT" | "INT8" | "LONG" => DataType::Int64,
        "SMALLINT" | "INT2" | "SHORT" => DataType::Int16,
        "TINYINT" | "INT1" => DataType::Int8,
        "UINTEGER" => DataType::UInt32,
        "UBIGINT" => DataType::UInt64,
        "USMALLINT" => DataType::UInt16,
        "UTINYINT" => DataType::UInt8,
        "HUGEINT" | "UHUGEINT" => DataType::Utf8,

        "FLOAT" | "FLOAT4" | "REAL" => DataType::Float32,
        "DOUBLE" | "FLOAT8" => DataType::Float64,

        "BOOLEAN" | "BOOL" | "LOGICAL" => DataType::Boolean,

        "VARCHAR" | "TEXT" | "STRING" | "CHAR" | "BPCHAR" => DataType::Utf8,
        "BLOB" | "BYTEA" | "BINARY" | "VARBINARY" => DataType::Binary,

        "DATE" => DataType::Date32,
        "TIME" | "TIME WITHOUT TIME ZONE" => DataType::Time64(TimeUnit::Microsecond),
        "TIMESTAMP" | "DATETIME" | "TIMESTAMP WITHOUT TIME ZONE" => {
            DataType::Timestamp(TimeUnit::Microsecond, None)
        }
        "TIMESTAMP WITH TIME ZONE" | "TIMESTAMPTZ" => {
            // Declared without timezone metadata to avoid a schema mismatch
            // against postgres_scanner, which emits the session timezone
            // (e.g. "Etc/UTC") rather than a static "UTC". A schema mismatch
            // between the declared schema and the streamed RecordBatches
            // crashes the engine on any TIMESTAMPTZ scan. DuckDB still stores
            // values as UTC microseconds so the underlying buffer is
            // unchanged; only the Arrow tz metadata is dropped at the
            // federation boundary. The `probe_actual_arrow_schema` call below
            // will re-attach the real tz string if the actual scan emits one.
            DataType::Timestamp(TimeUnit::Microsecond, None)
        }

        "INTERVAL" => DataType::Interval(arrow::datatypes::IntervalUnit::MonthDayNano),

        "UUID" => DataType::Utf8,

        _ => DataType::Utf8,
    }
}

fn parse_decimal(upper: &str) -> DataType {
    let default = DataType::Decimal128(38, 10);
    let start = match upper.find('(') {
        Some(i) => i + 1,
        None => return default,
    };
    let end = match upper.find(')') {
        Some(i) => i,
        None => return default,
    };
    let inner = &upper[start..end];
    let parts: Vec<&str> = inner.split(',').collect();
    if parts.len() != 2 {
        return default;
    }
    let precision: u8 = parts[0].trim().parse().unwrap_or(38);
    let scale: i8 = parts[1].trim().parse().unwrap_or(10);
    DataType::Decimal128(precision, scale)
}

/// trexsql may return notnull as BooleanArray or StringArray depending on mode.
fn notnull_value(col: &dyn Array, row: usize) -> bool {
    if let Some(arr) = col.as_any().downcast_ref::<arrow::array::BooleanArray>() {
        return arr.value(row);
    }
    if let Some(arr) = col.as_any().downcast_ref::<StringArray>() {
        return matches!(arr.value(row), "true" | "TRUE" | "1");
    }
    let s = arrow::util::display::array_value_to_string(col, row).unwrap_or_default();
    s != "0" && !s.is_empty() && s.to_lowercase() != "false"
}

/// Probe the actual Arrow schema produced when scanning a table. Used to
/// recover the real TIMESTAMP-with-tz metadata emitted by extensions like
/// postgres_scanner, which depend on the session timezone and cannot be
/// inferred from the textual `PRAGMA table_info` output. Errors are swallowed
/// because this is best-effort enrichment on top of the PRAGMA mapping.
fn probe_actual_arrow_schema(table_name: &str) -> Option<SchemaRef> {
    let sql = format!(
        "SELECT * FROM \"{}\" LIMIT 0",
        crate::catalog::escape_identifier(table_name)
    );
    let (schema, _batches) = crate::pool::read_arrow(&sql).ok()?;
    Some(schema)
}

pub struct DuckDBTableProvider {
    table_name: String,
    schema: SchemaRef,
    federation_provider: Arc<SQLFederationProvider>,
}

impl DuckDBTableProvider {
    pub fn new(table_name: &str, executor: Arc<DuckDBSQLExecutor>) -> DFResult<Self> {
        let schema = Self::resolve_schema(table_name)?;
        let federation_provider = Arc::new(SQLFederationProvider::new(executor));
        Ok(Self {
            table_name: table_name.to_string(),
            schema: Arc::new(schema),
            federation_provider,
        })
    }

    /// Resolve schema via `PRAGMA table_info`: name (col 1), type (col 2), notnull (col 3).
    ///
    /// For TIMESTAMP WITH TIME ZONE columns the textual mapping is unreliable when
    /// the table is backed by the postgres_scanner extension: the scanner emits the
    /// session timezone string (e.g. `Etc/UTC` or `Asia/Singapore`) as the Arrow
    /// timezone metadata, which does not always match the static `UTC` we declare
    /// from `PRAGMA table_info`. A schema mismatch between the declared schema and
    /// the streamed RecordBatches crashes the DataFusion runtime (SIGTERM in the
    /// host trex process). To avoid this, after building the candidate schema we
    /// probe the actual Arrow types via `SELECT * FROM "table" LIMIT 0` and let the
    /// probe's timestamp metadata override the static mapping. PRAGMA still wins
    /// for nullability because `LIMIT 0` always reports `nullable=true` across the
    /// federation boundary.
    fn resolve_schema(table_name: &str) -> DFResult<Schema> {
        let sql = format!("PRAGMA table_info(\"{}\")", crate::catalog::escape_identifier(table_name));
        let (_schema, batches) = crate::pool::read_arrow(&sql)
            .map_err(|e| datafusion::error::DataFusionError::Execution(
                format!("Failed to resolve schema for '{}': {e}", table_name)
            ))?;

        let mut fields = Vec::new();
        for batch in &batches {
            if batch.num_columns() < 4 {
                continue;
            }

            let name_col = batch
                .column(1)
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| {
                    datafusion::error::DataFusionError::Execution(
                        "PRAGMA table_info 'name' column is not a string".to_string(),
                    )
                })?;

            let type_col = batch
                .column(2)
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| {
                    datafusion::error::DataFusionError::Execution(
                        "PRAGMA table_info 'type' column is not a string".to_string(),
                    )
                })?;

            let notnull_col = batch.column(3);

            for row in 0..batch.num_rows() {
                let col_name = name_col.value(row);
                let col_type = type_col.value(row);

                let notnull = notnull_value(notnull_col, row);

                let arrow_type = duckdb_type_to_arrow(col_type);
                fields.push(Field::new(col_name, arrow_type, !notnull));
            }
        }

        if fields.is_empty() {
            return Err(datafusion::error::DataFusionError::Execution(format!(
                "Table '{}' not found or has no columns",
                table_name
            )));
        }

        // Probe the real Arrow schema and copy ANY column whose data_type
        // differs from the declared static-mapping type. Originally this was
        // limited to Timestamp(_,_) columns to dodge the "UTC" vs "Etc/UTC"
        // mismatch from postgres_scanner, but the same class of crash applies
        // to any future or unknown drift (Time64 unit, Decimal128 precision,
        // Interval kind, ...). A schema mismatch between the declared schema
        // and streamed RecordBatches crashes the DataFusion runtime (SIGTERM
        // in the host trex process), so widening the rescue here is strictly
        // safer than relying on the static mapping. Nullability is preserved
        // from PRAGMA because the probe's `LIMIT 0` always reports
        // nullable=true across the federation boundary.
        if let Some(actual) = probe_actual_arrow_schema(table_name) {
            let mut by_name: HashMap<&str, &Field> = HashMap::new();
            for f in actual.fields() {
                by_name.insert(f.name().as_str(), f.as_ref());
            }
            fields = fields
                .into_iter()
                .map(|f| match by_name.get(f.name().as_str()) {
                    Some(actual_field) if actual_field.data_type() != f.data_type() => {
                        Field::new(f.name(), actual_field.data_type().clone(), f.is_nullable())
                    }
                    _ => f,
                })
                .collect();
        }

        Ok(Schema::new(fields))
    }
}

impl fmt::Debug for DuckDBTableProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DuckDBTableProvider")
            .field("table_name", &self.table_name)
            .finish()
    }
}

#[async_trait]
impl TableProvider for DuckDBTableProvider {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn schema(&self) -> SchemaRef {
        Arc::clone(&self.schema)
    }

    fn table_type(&self) -> TableType {
        TableType::Base
    }

    async fn scan(
        &self,
        state: &dyn Session,
        projection: Option<&Vec<usize>>,
        filters: &[Expr],
        limit: Option<usize>,
    ) -> DFResult<Arc<dyn ExecutionPlan>> {
        let source = Arc::new(DuckDBTableSource::new(
            &self.table_name,
            Arc::clone(&self.schema),
            Arc::clone(&self.federation_provider),
        ));

        let adaptor =
            FederatedTableProviderAdaptor::new_with_provider(source, Arc::new(self.clone_inner()));

        adaptor.scan(state, projection, filters, limit).await
    }
}

impl DuckDBTableProvider {
    fn clone_inner(&self) -> DuckDBTableProviderInner {
        DuckDBTableProviderInner {
            schema: Arc::clone(&self.schema),
        }
    }
}

/// Schema-only fallback provider for the federation adaptor.
struct DuckDBTableProviderInner {
    schema: SchemaRef,
}

impl fmt::Debug for DuckDBTableProviderInner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DuckDBTableProviderInner").finish()
    }
}

#[async_trait]
impl TableProvider for DuckDBTableProviderInner {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn schema(&self) -> SchemaRef {
        Arc::clone(&self.schema)
    }

    fn table_type(&self) -> TableType {
        TableType::Base
    }

    async fn scan(
        &self,
        _state: &dyn Session,
        _projection: Option<&Vec<usize>>,
        _filters: &[Expr],
        _limit: Option<usize>,
    ) -> DFResult<Arc<dyn ExecutionPlan>> {
        Err(datafusion::error::DataFusionError::NotImplemented(
            "Direct scan on DuckDBTableProviderInner is not supported; \
             use the federated path"
                .to_string(),
        ))
    }
}

use datafusion::logical_expr::TableProviderFilterPushDown;
use datafusion_federation::{FederatedTableProviderAdaptor, FederatedTableSource, FederationProvider};

#[derive(Debug)]
struct DuckDBTableSource {
    table_name: String,
    schema: SchemaRef,
    federation_provider: Arc<SQLFederationProvider>,
}

impl DuckDBTableSource {
    fn new(
        table_name: &str,
        schema: SchemaRef,
        federation_provider: Arc<SQLFederationProvider>,
    ) -> Self {
        Self {
            table_name: table_name.to_string(),
            schema,
            federation_provider,
        }
    }
}

impl datafusion::logical_expr::TableSource for DuckDBTableSource {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn schema(&self) -> SchemaRef {
        Arc::clone(&self.schema)
    }

    fn table_type(&self) -> TableType {
        TableType::Base
    }

    fn supports_filters_pushdown(
        &self,
        filters: &[&Expr],
    ) -> DFResult<Vec<TableProviderFilterPushDown>> {
        Ok(vec![TableProviderFilterPushDown::Inexact; filters.len()])
    }
}

impl FederatedTableSource for DuckDBTableSource {
    fn federation_provider(&self) -> Arc<dyn FederationProvider> {
        Arc::clone(&self.federation_provider) as Arc<dyn FederationProvider>
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integer_types() {
        assert_eq!(duckdb_type_to_arrow("INTEGER"), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("INT"), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("INT4"), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("SIGNED"), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("BIGINT"), DataType::Int64);
        assert_eq!(duckdb_type_to_arrow("INT8"), DataType::Int64);
        assert_eq!(duckdb_type_to_arrow("LONG"), DataType::Int64);
        assert_eq!(duckdb_type_to_arrow("SMALLINT"), DataType::Int16);
        assert_eq!(duckdb_type_to_arrow("INT2"), DataType::Int16);
        assert_eq!(duckdb_type_to_arrow("TINYINT"), DataType::Int8);
        assert_eq!(duckdb_type_to_arrow("INT1"), DataType::Int8);
    }

    #[test]
    fn test_unsigned_types() {
        assert_eq!(duckdb_type_to_arrow("UINTEGER"), DataType::UInt32);
        assert_eq!(duckdb_type_to_arrow("UBIGINT"), DataType::UInt64);
        assert_eq!(duckdb_type_to_arrow("USMALLINT"), DataType::UInt16);
        assert_eq!(duckdb_type_to_arrow("UTINYINT"), DataType::UInt8);
    }

    #[test]
    fn test_hugeint_maps_to_utf8() {
        assert_eq!(duckdb_type_to_arrow("HUGEINT"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("UHUGEINT"), DataType::Utf8);
    }

    #[test]
    fn test_float_types() {
        assert_eq!(duckdb_type_to_arrow("FLOAT"), DataType::Float32);
        assert_eq!(duckdb_type_to_arrow("FLOAT4"), DataType::Float32);
        assert_eq!(duckdb_type_to_arrow("REAL"), DataType::Float32);
        assert_eq!(duckdb_type_to_arrow("DOUBLE"), DataType::Float64);
        assert_eq!(duckdb_type_to_arrow("FLOAT8"), DataType::Float64);
    }

    #[test]
    fn test_boolean() {
        assert_eq!(duckdb_type_to_arrow("BOOLEAN"), DataType::Boolean);
        assert_eq!(duckdb_type_to_arrow("BOOL"), DataType::Boolean);
        assert_eq!(duckdb_type_to_arrow("LOGICAL"), DataType::Boolean);
    }

    #[test]
    fn test_string_types() {
        assert_eq!(duckdb_type_to_arrow("VARCHAR"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("TEXT"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("STRING"), DataType::Utf8);
    }

    #[test]
    fn test_binary_types() {
        assert_eq!(duckdb_type_to_arrow("BLOB"), DataType::Binary);
        assert_eq!(duckdb_type_to_arrow("BYTEA"), DataType::Binary);
        assert_eq!(duckdb_type_to_arrow("BINARY"), DataType::Binary);
        assert_eq!(duckdb_type_to_arrow("VARBINARY"), DataType::Binary);
    }

    #[test]
    fn test_date_time_types() {
        assert_eq!(duckdb_type_to_arrow("DATE"), DataType::Date32);
        assert_eq!(
            duckdb_type_to_arrow("TIME"),
            DataType::Time64(TimeUnit::Microsecond)
        );
        assert_eq!(
            duckdb_type_to_arrow("TIMESTAMP"),
            DataType::Timestamp(TimeUnit::Microsecond, None)
        );
        assert_eq!(
            duckdb_type_to_arrow("DATETIME"),
            DataType::Timestamp(TimeUnit::Microsecond, None)
        );
        // TIMESTAMPTZ is declared without a timezone in the static mapping;
        // the actual tz string is filled in by `probe_actual_arrow_schema`
        // when the table is registered. See `duckdb_type_to_arrow`.
        assert_eq!(
            duckdb_type_to_arrow("TIMESTAMP WITH TIME ZONE"),
            DataType::Timestamp(TimeUnit::Microsecond, None)
        );
        assert_eq!(
            duckdb_type_to_arrow("TIMESTAMPTZ"),
            DataType::Timestamp(TimeUnit::Microsecond, None)
        );
    }

    #[test]
    fn test_interval() {
        assert_eq!(
            duckdb_type_to_arrow("INTERVAL"),
            DataType::Interval(arrow::datatypes::IntervalUnit::MonthDayNano)
        );
    }

    #[test]
    fn test_decimal() {
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL(10,2)"),
            DataType::Decimal128(10, 2)
        );
        assert_eq!(
            duckdb_type_to_arrow("NUMERIC(18,4)"),
            DataType::Decimal128(18, 4)
        );
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL"),
            DataType::Decimal128(38, 10)
        );
    }

    #[test]
    fn test_uuid_maps_to_utf8() {
        assert_eq!(duckdb_type_to_arrow("UUID"), DataType::Utf8);
    }

    #[test]
    fn test_unknown_type_fallback() {
        assert_eq!(duckdb_type_to_arrow("GEOMETRY"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("JSON"), DataType::Utf8);
    }

    #[test]
    fn test_case_insensitive() {
        assert_eq!(duckdb_type_to_arrow("integer"), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("Varchar"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("boolean"), DataType::Boolean);
    }

    // ---------- Additional coverage ----------

    #[test]
    fn test_type_with_surrounding_whitespace() {
        // duckdb_type_to_arrow trims and uppercases input.
        assert_eq!(duckdb_type_to_arrow("  integer  "), DataType::Int32);
        assert_eq!(duckdb_type_to_arrow("\tVARCHAR\n"), DataType::Utf8);
    }

    #[test]
    fn test_type_char_bpchar() {
        assert_eq!(duckdb_type_to_arrow("CHAR"), DataType::Utf8);
        assert_eq!(duckdb_type_to_arrow("BPCHAR"), DataType::Utf8);
    }

    #[test]
    fn test_time_without_time_zone_alias() {
        assert_eq!(
            duckdb_type_to_arrow("TIME WITHOUT TIME ZONE"),
            DataType::Time64(TimeUnit::Microsecond)
        );
        assert_eq!(
            duckdb_type_to_arrow("TIMESTAMP WITHOUT TIME ZONE"),
            DataType::Timestamp(TimeUnit::Microsecond, None)
        );
    }

    #[test]
    fn test_decimal_malformed_falls_back_to_default() {
        // Bad numeric inside DECIMAL(...) falls back to default precision/scale.
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL(abc,def)"),
            DataType::Decimal128(38, 10)
        );
        // Single value inside parens -> not a comma-separated pair.
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL(10)"),
            DataType::Decimal128(38, 10)
        );
        // Missing closing paren -> default.
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL(10,2"),
            DataType::Decimal128(38, 10)
        );
        // Missing opening paren (after the DECIMAL prefix) -> default.
        assert_eq!(
            duckdb_type_to_arrow("DECIMAL 10,2)"),
            DataType::Decimal128(38, 10)
        );
    }

    #[test]
    fn test_numeric_with_precision_and_scale() {
        assert_eq!(
            duckdb_type_to_arrow("NUMERIC(8,2)"),
            DataType::Decimal128(8, 2)
        );
        assert_eq!(
            duckdb_type_to_arrow("NUMERIC"),
            DataType::Decimal128(38, 10)
        );
    }

    #[test]
    fn test_decimal_lowercase_parses() {
        // The whole input is uppercased before parsing, so lowercase works.
        assert_eq!(
            duckdb_type_to_arrow("decimal(7,3)"),
            DataType::Decimal128(7, 3)
        );
    }

    #[test]
    fn test_empty_string_falls_back_to_utf8() {
        assert_eq!(duckdb_type_to_arrow(""), DataType::Utf8);
    }

    #[test]
    fn notnull_value_from_boolean_array() {
        let arr = arrow::array::BooleanArray::from(vec![Some(true), Some(false)]);
        assert!(notnull_value(&arr, 0));
        assert!(!notnull_value(&arr, 1));
    }

    #[test]
    fn notnull_value_from_string_array_truthy() {
        let arr = StringArray::from(vec!["true", "TRUE", "1"]);
        assert!(notnull_value(&arr, 0));
        assert!(notnull_value(&arr, 1));
        assert!(notnull_value(&arr, 2));
    }

    #[test]
    fn notnull_value_from_string_array_falsy() {
        let arr = StringArray::from(vec!["false", "0", "", "FALSE"]);
        assert!(!notnull_value(&arr, 0));
        assert!(!notnull_value(&arr, 1));
        assert!(!notnull_value(&arr, 2));
        // "FALSE" — string array path checks for exact match against
        // "true"|"TRUE"|"1" only. Anything else returns false.
        assert!(!notnull_value(&arr, 3));
    }

    #[test]
    fn notnull_value_from_int_array_truthy_path() {
        // For non-bool, non-string columns, falls back to display-based check.
        let arr = arrow::array::Int64Array::from(vec![1, 0, 5]);
        assert!(notnull_value(&arr, 0)); // "1"
        assert!(!notnull_value(&arr, 1)); // "0"
        assert!(notnull_value(&arr, 2)); // "5"
    }

    #[test]
    fn parse_decimal_extracts_precision_scale() {
        assert_eq!(parse_decimal("DECIMAL(10,2)"), DataType::Decimal128(10, 2));
        assert_eq!(parse_decimal("DECIMAL(38,10)"), DataType::Decimal128(38, 10));
    }

    #[test]
    fn parse_decimal_with_whitespace_in_args() {
        // Inner ' 10 , 2 ' should still parse.
        assert_eq!(
            parse_decimal("DECIMAL( 10 , 2 )"),
            DataType::Decimal128(10, 2)
        );
    }

    #[test]
    fn parse_decimal_default_on_invalid() {
        assert_eq!(parse_decimal("NOPAREN"), DataType::Decimal128(38, 10));
        assert_eq!(parse_decimal("(only_open"), DataType::Decimal128(38, 10));
    }

    #[test]
    fn duckdb_table_provider_inner_schema_clone() {
        // Ensure the inner provider returns the schema we constructed it with
        // and reports TableType::Base.
        let schema: SchemaRef = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let inner = DuckDBTableProviderInner {
            schema: Arc::clone(&schema),
        };
        assert_eq!(inner.schema(), schema);
        assert_eq!(inner.table_type(), TableType::Base);
    }

    #[tokio::test]
    async fn duckdb_table_provider_inner_scan_returns_not_implemented() {
        // Direct scan on the inner schema-only provider should not be used.
        let schema: SchemaRef = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let inner = DuckDBTableProviderInner { schema };
        let session = datafusion::execution::context::SessionContext::new();
        let state = session.state();
        let result = inner.scan(&state, None, &[], None).await;
        match result {
            Err(datafusion::error::DataFusionError::NotImplemented(msg)) => {
                assert!(msg.contains("not supported") || msg.contains("federated"));
            }
            other => panic!("expected NotImplemented, got {:?}", other),
        }
    }

    #[test]
    fn duckdb_table_provider_inner_debug_format() {
        let schema: SchemaRef = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let inner = DuckDBTableProviderInner { schema };
        let dbg = format!("{:?}", inner);
        assert!(dbg.contains("DuckDBTableProviderInner"));
    }

    #[test]
    fn duckdb_table_source_schema_and_filter_pushdown() {
        use datafusion::logical_expr::TableSource;
        let schema: SchemaRef = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("name", DataType::Utf8, true),
        ]));
        // Build the federation provider via a dummy executor handle.
        // SQLFederationProvider just wraps the executor; we don't run any SQL.
        let executor = Arc::new(DuckDBSQLExecutor);
        let provider = Arc::new(SQLFederationProvider::new(executor));
        let source = DuckDBTableSource::new("orders", Arc::clone(&schema), provider);

        assert_eq!(source.schema(), schema);
        assert_eq!(source.table_type(), TableType::Base);

        // Filter pushdown is always Inexact per filter.
        let expr = datafusion::prelude::col("id").gt(datafusion::prelude::lit(5));
        let exprs: Vec<&Expr> = vec![&expr, &expr];
        let pushed = source.supports_filters_pushdown(&exprs).unwrap();
        assert_eq!(pushed.len(), 2);
        for p in pushed {
            assert_eq!(p, TableProviderFilterPushDown::Inexact);
        }
    }

    #[test]
    fn duckdb_table_source_federation_provider_accessor() {
        let schema: SchemaRef = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let executor = Arc::new(DuckDBSQLExecutor);
        let provider = Arc::new(SQLFederationProvider::new(executor));
        let source = DuckDBTableSource::new("fed_test", schema, Arc::clone(&provider));
        let _ = source.federation_provider();
        // The accessor returns an Arc<dyn FederationProvider>; verify it's non-null
        // by formatting via Arc::strong_count (ensures we didn't take ownership).
        assert!(Arc::strong_count(&provider) >= 2);
    }

    #[test]
    fn duckdb_table_source_debug_format() {
        let schema: SchemaRef = Arc::new(Schema::new(vec![Field::new(
            "id",
            DataType::Int64,
            false,
        )]));
        let executor = Arc::new(DuckDBSQLExecutor);
        let provider = Arc::new(SQLFederationProvider::new(executor));
        let source = DuckDBTableSource::new("dbg_test", schema, provider);
        let dbg = format!("{:?}", source);
        assert!(dbg.contains("DuckDBTableSource"));
        assert!(dbg.contains("dbg_test"));
    }
}
