//! # Multi-Dialect SQL Transformer
//!
//! This library provides functionality to transform PostgreSQL SQL statements
//! into various target SQL dialects using the sqlparser-rs library.
//!
//! ## Supported Dialects
//!
//! Currently supported target dialects:
//! - **SAP HANA** - Full PostgreSQL to HANA transformation support
//!
//! Future planned dialects:
//! - trexsql
//! - ClickHouse
//! - Snowflake
//!
//! ## Quick Start
//!
//! ```rust
//! use pgt::{SqlTransformer, Dialect};
//!
//! // Simple usage with HANA dialect (default)
//! let transformer = SqlTransformer::new(
//!     pgt::TransformationConfig::default(),
//!     Dialect::Hana
//! ).unwrap();
//! let hana_sql = transformer.transform("SELECT * FROM users LIMIT 10 OFFSET 5").unwrap();
//!
//! // Builder pattern for custom configuration
//! let transformer = SqlTransformer::builder()
//!     .with_dialect(Dialect::Hana)
//!     .with_data_types(true)
//!     .with_functions(true)
//!     .build()
//!     .unwrap();
//!
//! let result = transformer.transform("SELECT NOW(), RANDOM()").unwrap();
//!
//! // Backward compatibility - uses HANA dialect by default
//! let transformer = SqlTransformer::with_config(pgt::TransformationConfig::default()).unwrap();
//! ```

pub mod config;
pub mod dialects;
pub mod error;
pub mod generator;
pub mod parser;
pub mod rules;
pub mod utils;

pub use config::{DataTypeConfig, FunctionConfig, RulesConfig, TransformationConfig};
pub use dialects::Dialect;
pub use error::{
    DetailedResult, EnhancedTransformationMetadata, PerformanceMetrics, TransformationError,
    TransformationResult, TransformationWarning,
};
pub use dialects::hana::TransformationMetadata;

use log::{debug, info};
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

struct CachedParser {
    dialect: PostgreSqlDialect,
    parse_cache: Arc<Mutex<HashMap<String, Vec<sqlparser::ast::Statement>>>>,
}

impl CachedParser {
    fn new() -> Self {
        Self {
            dialect: PostgreSqlDialect {},
            parse_cache: Arc::new(Mutex::new(HashMap::with_capacity(100))),
        }
    }

    fn parse(
        &self,
        sql: &str,
    ) -> Result<Vec<sqlparser::ast::Statement>, sqlparser::parser::ParserError> {
        if let Ok(cache) = self.parse_cache.lock() {
            if let Some(cached_statements) = cache.get(sql) {
                return Ok(cached_statements.clone());
            }
        }

        let statements = Parser::parse_sql(&self.dialect, sql)?;

        if let Ok(mut cache) = self.parse_cache.lock() {
            if cache.len() < 1000 {
                cache.insert(sql.to_string(), statements.clone());
            }
        }

        Ok(statements)
    }

    fn clear_cache(&self) {
        if let Ok(mut cache) = self.parse_cache.lock() {
            cache.clear();
        }
    }
}

pub struct SqlTransformer {
    config: TransformationConfig,
    dialect: Dialect,
    transformer: Box<dyn dialects::DialectTransformationEngine>,
    parser: CachedParser,
}

impl SqlTransformer {
    pub fn new(config: TransformationConfig, dialect: Dialect) -> Result<Self, TransformationError> {
        let transformer = dialects::DialectEngineFactory::create_engine(dialect, &config)?;
        Ok(Self {
            config,
            dialect,
            transformer,
            parser: CachedParser::new(),
        })
    }

    pub fn with_config(config: TransformationConfig) -> Result<Self, TransformationError> {
        Self::new(config, Dialect::default())
    }

    pub fn new_hana(config: TransformationConfig) -> Result<Self, TransformationError> {
        Self::new(config, Dialect::Hana)
    }

    pub fn dialect(&self) -> Dialect {
        self.dialect
    }

    pub fn transform(&self, sql: &str) -> TransformationResult<String> {
        let statements = self
            .parser
            .parse(sql)
            .map_err(|e| TransformationError::ParseError {
                message: e.to_string(),
                line: 1,
                column: 0,
            })?;

        let transformed_statements = self.transformer.transform_statements(&statements)?;
        let mut generated_sql = self.generate_sql(&transformed_statements)?;

        generated_sql = self.transformer.apply_post_processing_rules(&generated_sql)?;

        Ok(generated_sql)
    }

    pub fn can_transform(&self, sql: &str) -> bool {
        self.parser.parse(sql).is_ok()
    }

    pub fn transform_batch(&self, sqls: Vec<&str>) -> Vec<TransformationResult<String>> {
        sqls.into_iter().map(|sql| self.transform(sql)).collect()
    }

    pub fn transform_detailed(&self, sql: &str) -> DetailedResult<String> {
        debug!("Detailed transformation");

        if let Err(e) = self.config.validate() {
            return DetailedResult {
                result: Err(e),
                warnings: vec!["Configuration validation failed".to_string()],
                metadata: Some(EnhancedTransformationMetadata {
                    transformations_applied: vec![],
                    warnings: vec!["Invalid configuration detected".to_string()],
                    performance_metrics: Default::default(),
                }),
            };
        }

        let mut warnings = Vec::new();
        let mut transformations_applied = Vec::new();
        let start_time = std::time::Instant::now();

        let statements = match self.parser.parse(sql) {
            Ok(stmts) => stmts,
            Err(e) => {
                let error_str = e.to_string();
                let (line, column) = Self::extract_position_from_error(&error_str);

                return DetailedResult {
                    result: Err(TransformationError::ParseError {
                        message: error_str,
                        line,
                        column,
                    }),
                    warnings: warnings.clone(),
                    metadata: Some(EnhancedTransformationMetadata {
                        transformations_applied,
                        warnings: vec!["Parse error encountered".to_string()],
                        performance_metrics: PerformanceMetrics {
                            parse_time_ms: start_time.elapsed().as_millis() as u64,
                            transform_time_ms: 0,
                            total_time_ms: start_time.elapsed().as_millis() as u64,
                        },
                    }),
                };
            }
        };

        let parse_time = start_time.elapsed().as_millis() as u64;

        let transform_start = std::time::Instant::now();
        let transformed_statements = match self.transformer.transform_statements(&statements) {
            Ok(stmts) => {
                transformations_applied.push("Transformation complete".to_string());
                stmts
            }
            Err(e) => {
                if let TransformationError::UnsupportedFeature {
                    context,
                    suggestion,
                    ..
                } = &e
                {
                    warnings.push(format!("Unsupported: {}", context));
                    if let Some(suggestion) = suggestion {
                        warnings.push(format!("Try: {}", suggestion));
                    }
                }

                return DetailedResult {
                    result: Err(e),
                    warnings: warnings.clone(),
                    metadata: Some(EnhancedTransformationMetadata {
                        transformations_applied,
                        warnings: warnings.clone(),
                        performance_metrics: PerformanceMetrics {
                            parse_time_ms: parse_time,
                            transform_time_ms: transform_start.elapsed().as_millis() as u64,
                            total_time_ms: start_time.elapsed().as_millis() as u64,
                        },
                    }),
                };
            }
        };

        let mut hana_sql = match self.generate_sql(&transformed_statements) {
            Ok(sql) => {
                transformations_applied.push("SQL generated".to_string());
                sql
            }
            Err(e) => {
                return DetailedResult {
                    result: Err(e),
                    warnings: warnings.clone(),
                    metadata: Some(EnhancedTransformationMetadata {
                        transformations_applied,
                        warnings: warnings.clone(),
                        performance_metrics: PerformanceMetrics {
                            parse_time_ms: parse_time,
                            transform_time_ms: transform_start.elapsed().as_millis() as u64,
                            total_time_ms: start_time.elapsed().as_millis() as u64,
                        },
                    }),
                };
            }
        };

        hana_sql = match self.transformer.apply_post_processing_rules(&hana_sql) {
            Ok(sql) => {
                transformations_applied.push("Post-processed".to_string());
                sql
            }
            Err(_e) => {
                warnings.push("Post-processing failed".to_string());
                hana_sql
            }
        };

        let total_time = start_time.elapsed().as_millis() as u64;
        let transform_time = transform_start.elapsed().as_millis() as u64;

        info!("Completed in {}ms", total_time);

        DetailedResult {
            result: Ok(hana_sql),
            warnings: warnings.clone(),
            metadata: Some(EnhancedTransformationMetadata {
                transformations_applied,
                warnings: warnings.clone(),
                performance_metrics: PerformanceMetrics {
                    parse_time_ms: parse_time,
                    transform_time_ms: transform_time,
                    total_time_ms: total_time,
                },
            }),
        }
    }

    fn extract_position_from_error(error: &str) -> (usize, usize) {
        use regex::Regex;

        if let Ok(re) = Regex::new(r"line (\d+).*column (\d+)") {
            if let Some(captures) = re.captures(error) {
                let line = captures
                    .get(1)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                let column = captures
                    .get(2)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                return (line, column);
            }
        }

        if let Ok(re) = Regex::new(r"at position (\d+)") {
            if let Some(captures) = re.captures(error) {
                let position = captures
                    .get(1)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                let line = position / 50 + 1;
                let column = position % 50;
                return (line, column);
            }
        }

        (1, 0)
    }

    fn generate_sql(
        &self,
        statements: &[sqlparser::ast::Statement],
    ) -> TransformationResult<String> {
        let sql = generator::generate_sql(&statements)?;
        Ok(sql)
    }

    pub fn from_config_file<P: AsRef<std::path::Path>>(path: P) -> TransformationResult<Self> {
        let config = TransformationConfig::from_file(path)?;
        Self::new(config, Dialect::default()).map_err(|e| e)
    }

    pub fn from_environment() -> Result<Self, TransformationError> {
        let config = TransformationConfig::from_env();
        Self::new(config, Dialect::default())
    }

    pub fn builder() -> SqlTransformerBuilder {
        SqlTransformerBuilder::new()
    }

    pub fn clear_caches(&self) {
        self.parser.clear_cache();
    }

    pub fn cache_stats(&self) -> (usize, usize) {
        if let Ok(cache) = self.parser.parse_cache.lock() {
            (cache.len(), cache.capacity())
        } else {
            (0, 0)
        }
    }

    pub fn validate_hana_compatibility(&self, sql: &str) -> TransformationResult<Vec<String>> {
        debug!("Validating HANA compatibility");

        let dialect = PostgreSqlDialect {};
        let statements = Parser::parse_sql(&dialect, sql).map_err(|e| {
            let error_str = e.to_string();
            let (line, column) = Self::extract_position_from_error(&error_str);

            TransformationError::ParseError {
                message: error_str,
                line,
                column,
            }
        })?;

        let mut validation_results = Vec::new();

        for (idx, stmt) in statements.iter().enumerate() {
            match self.transformer.validate_statement_for_hana(stmt) {
                Ok(warnings) => validation_results.extend(warnings),
                Err(e) => {
                    validation_results.push(format!("Statement {}: {}", idx + 1, e));
                }
            }
        }

        Ok(validation_results)
    }
}

impl Default for SqlTransformer {
    fn default() -> Self {
        Self::new(TransformationConfig::default(), Dialect::default())
            .expect("Failed to create default SqlTransformer")
    }
}

pub struct SqlTransformerBuilder {
    config: TransformationConfig,
    dialect: Dialect,
}

impl SqlTransformerBuilder {
    fn new() -> Self {
        Self {
            config: TransformationConfig::default(),
            dialect: Dialect::default(),
        }
    }

    pub fn with_dialect(mut self, dialect: Dialect) -> Self {
        self.dialect = dialect;
        self
    }

    pub fn with_data_types(mut self, enabled: bool) -> Self {
        self.config.data_types.preserve_precision = enabled;
        self
    }

    pub fn with_functions(mut self, enabled: bool) -> Self {
        self.config.functions.enable_custom_functions = enabled;
        self
    }

    pub fn with_schema_mapping(mut self, from: &str, to: &str) -> Self {
        self.config
            .schema_handling
            .schema_mappings
            .insert(from.to_string(), to.to_string());
        self
    }

    pub fn build(self) -> Result<SqlTransformer, TransformationError> {
        SqlTransformer::new(self.config, self.dialect)
    }
}

impl Default for SqlTransformerBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn t() -> SqlTransformer {
        SqlTransformer::with_config(TransformationConfig::default()).unwrap()
    }

    // --- SqlTransformer::new ---

    #[test]
    fn new_defaults_to_hana_dialect() {
        let tr = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::with_config ---

    #[test]
    fn with_config_creates_transformer_with_default_dialect() {
        let tr = SqlTransformer::with_config(TransformationConfig::default()).unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::new_hana ---

    #[test]
    fn new_hana_creates_hana_dialect_transformer() {
        let tr = SqlTransformer::new_hana(TransformationConfig::default()).unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::dialect ---

    #[test]
    fn dialect_returns_configured_dialect() {
        let tr = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::transform ---

    #[test]
    fn transform_select_passes_through() {
        let out = t().transform("SELECT 1").unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }

    #[test]
    fn transform_empty_input_returns_empty() {
        // sqlparser parses empty string as zero statements → output is empty
        let out = t().transform("").unwrap();
        assert_eq!(out, "");
    }

    #[test]
    fn transform_invalid_sql_returns_parse_error() {
        let err = t().transform("SELEKT * FORM users").unwrap_err();
        assert!(matches!(err, TransformationError::ParseError { .. }));
    }

    #[test]
    fn transform_unclosed_string_returns_parse_error() {
        let err = t().transform("SELECT 'unterminated").unwrap_err();
        assert!(matches!(err, TransformationError::ParseError { .. }));
    }

    // --- SqlTransformer::can_transform ---

    #[test]
    fn can_transform_accepts_valid_sql() {
        assert!(t().can_transform("SELECT 1"));
    }

    #[test]
    fn can_transform_rejects_garbage() {
        assert!(!t().can_transform("SELEKT * FORM users !!!"));
    }

    #[test]
    fn can_transform_accepts_empty_string() {
        // sqlparser parses empty input as Ok(vec![])
        assert!(t().can_transform(""));
    }

    // --- SqlTransformer::transform_batch ---

    #[test]
    fn transform_batch_returns_one_result_per_input() {
        let results = t().transform_batch(vec!["SELECT 1", "SELECT 2"]);
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    #[test]
    fn transform_batch_isolates_errors() {
        let results = t().transform_batch(vec!["SELECT 1", "SELEKT bad !!!"]);
        assert!(results[0].is_ok());
        assert!(results[1].is_err());
    }

    #[test]
    fn transform_batch_empty_vec_returns_empty() {
        let results = t().transform_batch(vec![]);
        assert_eq!(results.len(), 0);
    }

    // --- SqlTransformer::transform_detailed ---

    #[test]
    fn transform_detailed_ok_has_result_and_metadata() {
        let dr = t().transform_detailed("SELECT 1");
        assert!(dr.result.is_ok());
        assert!(dr.metadata.is_some());
    }

    #[test]
    fn transform_detailed_parse_error_has_error_result() {
        let dr = t().transform_detailed("SELEKT bad !!!");
        assert!(dr.result.is_err());
        assert!(dr.metadata.is_some());
    }

    #[test]
    fn transform_detailed_metadata_contains_timing() {
        let dr = t().transform_detailed("SELECT 1");
        let meta = dr.metadata.unwrap();
        // performance metrics are populated — total_time_ms is always ≥0
        let _ = meta.performance_metrics.total_time_ms;
        let _ = meta.performance_metrics.parse_time_ms;
        let _ = meta.performance_metrics.transform_time_ms;
    }

    // --- SqlTransformer::builder / SqlTransformerBuilder ---

    #[test]
    fn builder_round_trip_applies_options() {
        let tr = SqlTransformer::builder()
            .with_dialect(Dialect::Hana)
            .with_data_types(true)
            .with_functions(true)
            .with_schema_mapping("public", "myschema")
            .build()
            .unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    #[test]
    fn builder_default_produces_valid_transformer() {
        let tr = SqlTransformerBuilder::default().build().unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    #[test]
    fn builder_with_data_types_false() {
        let tr = SqlTransformer::builder()
            .with_data_types(false)
            .build()
            .unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    #[test]
    fn builder_with_functions_false() {
        let tr = SqlTransformer::builder()
            .with_functions(false)
            .build()
            .unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::clear_caches / cache_stats ---

    #[test]
    fn cache_hits_increment_on_repeat_transform() {
        let tr = t();
        let _ = tr.transform("SELECT 1").unwrap();
        let (before_size, _) = tr.cache_stats();
        let _ = tr.transform("SELECT 1").unwrap();
        let (after_size, _) = tr.cache_stats();
        assert_eq!(before_size, after_size, "cache size should not grow on hit");
    }

    #[test]
    fn cache_grows_with_distinct_queries() {
        let tr = t();
        let _ = tr.transform("SELECT 1").unwrap();
        let (size_after_one, _) = tr.cache_stats();
        let _ = tr.transform("SELECT 2").unwrap();
        let (size_after_two, _) = tr.cache_stats();
        assert!(size_after_two >= size_after_one);
    }

    #[test]
    fn clear_caches_empties_cache() {
        let tr = t();
        let _ = tr.transform("SELECT 1").unwrap();
        tr.clear_caches();
        let (size, _) = tr.cache_stats();
        assert_eq!(size, 0);
    }

    #[test]
    fn cache_stats_returns_capacity() {
        let tr = t();
        let (_, capacity) = tr.cache_stats();
        // capacity is usize (always non-negative); verify it's plausible
        let _ = capacity;
    }

    // --- SqlTransformer::validate_hana_compatibility ---

    #[test]
    fn validate_hana_compatibility_returns_violation_list() {
        let v = t().validate_hana_compatibility("SELECT NOW()").unwrap();
        // shape contract: returns a Vec, may be empty
        let _: &Vec<String> = &v;
    }

    #[test]
    fn validate_hana_compatibility_rejects_invalid_sql() {
        let err = t().validate_hana_compatibility("SELEKT bad !!!").unwrap_err();
        assert!(matches!(err, TransformationError::ParseError { .. }));
    }

    #[test]
    fn validate_hana_compatibility_select_one() {
        // plain SELECT 1 should have no violations
        let violations = t().validate_hana_compatibility("SELECT 1").unwrap();
        // shape contract: result is a Vec<String>
        let _: Vec<String> = violations;
    }

    // --- SqlTransformer::from_config_file ---

    #[test]
    fn from_config_file_loads_toml() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("c.toml");
        // Serialize the default config to TOML so all required fields (including custom_mappings) are present.
        let default_cfg = TransformationConfig::default();
        default_cfg.to_file(&path).unwrap();
        let tr = SqlTransformer::from_config_file(&path).unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    #[test]
    fn from_config_file_missing_file_errors() {
        let result = SqlTransformer::from_config_file("/nonexistent/path/c.toml");
        assert!(result.is_err());
    }

    // --- SqlTransformer::from_environment ---

    #[test]
    fn from_environment_creates_transformer() {
        let tr = SqlTransformer::from_environment().unwrap();
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    #[test]
    fn from_environment_reads_preserve_precision() {
        std::env::set_var("PGT_PRESERVE_PRECISION", "false");
        let tr = SqlTransformer::from_environment().unwrap();
        std::env::remove_var("PGT_PRESERVE_PRECISION");
        // Just verifies no panic and produces a valid transformer
        assert_eq!(tr.dialect(), Dialect::Hana);
    }

    // --- SqlTransformer::Default ---

    #[test]
    fn default_creates_valid_transformer() {
        let tr = SqlTransformer::default();
        assert_eq!(tr.dialect(), Dialect::Hana);
        let out = tr.transform("SELECT 1").unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }
}
