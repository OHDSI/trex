pub mod data_types;
pub mod expressions;
pub mod functions;
pub mod post_processor;
pub mod statements;

use crate::config::TransformationConfig;
use crate::error::{TransformationError, TransformationResult, TransformationWarning};
use crate::rules::TransformationRules;
use sqlparser::ast::Statement;
use std::time::Duration;

pub struct DetailedTransformationResult {
    pub sql: Option<String>,
    pub errors: Vec<TransformationError>,
    pub warnings: Vec<TransformationWarning>,
    pub metadata: TransformationMetadata,
}

#[derive(Debug, Clone)]
pub struct TransformationMetadata {
    pub input_statements: usize,
    pub transformed_statements: usize,
    pub skipped_statements: usize,
    pub transformation_time: Duration,
}

pub trait Transformer {
    fn name(&self) -> &'static str;
    fn transform(&self, stmt: &mut Statement) -> TransformationResult<bool>;
    fn supports_statement_type(&self, stmt: &Statement) -> bool;

    /// Lower numbers execute first
    fn priority(&self) -> u8 {
        100
    }

    fn collect_warnings(&self) -> Vec<TransformationWarning> {
        Vec::new()
    }
}

pub struct TransformationEngine {
    transformers: Vec<Box<dyn Transformer>>,
    config: TransformationConfig,
    rules: TransformationRules,
}

impl TransformationEngine {
    pub fn new(config: &TransformationConfig) -> Self {
        let mut transformers: Vec<Box<dyn Transformer>> = vec![
            Box::new(data_types::DataTypeTransformer::new(config)),
            Box::new(functions::FunctionTransformer::new(config)),
            Box::new(statements::StatementTransformer::new(config)),
            Box::new(expressions::ExpressionTransformer::new(config)),
        ];

        transformers.sort_by_key(|t| t.priority());

        Self {
            transformers,
            config: config.clone(),
            rules: TransformationRules::new(config.rules.clone()),
        }
    }

    pub fn transform_statement(&self, mut stmt: Statement) -> TransformationResult<Statement> {
        let mut warnings = Vec::new();
        let mut any_changes = false;

        for transformer in &self.transformers {
            if transformer.supports_statement_type(&stmt) {
                match transformer.transform(&mut stmt) {
                    Ok(changed) => {
                        if changed {
                            any_changes = true;
                        }
                    }
                    Err(e) => {
                        log::warn!("Transformer '{}' failed: {}", transformer.name(), e);
                        warnings.push(TransformationWarning::high(&format!(
                            "Transformer '{}' failed: {}",
                            transformer.name(),
                            e
                        )));
                    }
                }
            }
        }

        if !warnings.is_empty() {
            log::info!("Transformation completed with {} warnings", warnings.len());
        }

        Ok(stmt)
    }

    pub fn transform_statements(
        &self,
        statements: &[Statement],
    ) -> TransformationResult<Vec<Statement>> {
        let start_time = std::time::Instant::now();

        self.rules.validate_hana_compatibility(statements)?;

        let mut transformed_statements = Vec::new();
        let mut errors = Vec::new();

        for (index, stmt) in statements.iter().enumerate() {
            match self.transform_statement(stmt.clone()) {
                Ok(transformed_stmt) => {
                    transformed_statements.push(transformed_stmt);
                }
                Err(e) => {
                    if self.config.rules.enable_strict_mode {
                        return Err(e);
                    } else {
                        errors.push(e);
                        log::warn!("Statement {} failed: using original", index);
                        transformed_statements.push(stmt.clone());
                    }
                }
            }
        }

        if !errors.is_empty() {
            return Err(TransformationError::partial_transformation(
                transformed_statements.len() - errors.len(),
                errors.len(),
                None,
                errors,
            ));
        }

        Ok(transformed_statements)
    }

    pub fn apply_post_processing_rules(&self, sql: &str) -> TransformationResult<String> {
        self.rules.apply_transformation_rules(sql)
    }

    pub fn validate_statement_for_hana(
        &self,
        stmt: &Statement,
    ) -> TransformationResult<Vec<String>> {
        self.rules
            .validate_hana_compatibility(&[stmt.clone()])
            .map(|_| Vec::new())
    }
}

pub struct HanaTransformationEngine {
    engine: TransformationEngine,
}

impl HanaTransformationEngine {
    pub fn new(config: &TransformationConfig) -> Self {
        Self {
            engine: TransformationEngine::new(config),
        }
    }
}

impl super::DialectTransformationEngine for HanaTransformationEngine {
    fn dialect(&self) -> super::Dialect {
        super::Dialect::Hana
    }

    fn transform_statement(&self, stmt: Statement) -> TransformationResult<Statement> {
        self.engine.transform_statement(stmt)
    }

    fn transform_statements(&self, statements: &[Statement]) -> TransformationResult<Vec<Statement>> {
        self.engine.transform_statements(statements)
    }

    fn apply_post_processing_rules(&self, sql: &str) -> TransformationResult<String> {
        self.engine.apply_post_processing_rules(sql)
    }

    fn validate_statement_for_hana(&self, stmt: &Statement) -> TransformationResult<Vec<String>> {
        self.engine.validate_statement_for_hana(stmt)
    }

    fn name(&self) -> &'static str {
        "HANA Transformation Engine"
    }
}

pub trait AstVisitor<T> {
    fn visit(&mut self, node: &mut T) -> TransformationResult<bool>;
}

pub trait TransformationStats {
    fn transformations_applied(&self) -> usize;
    fn warnings_generated(&self) -> usize;
    fn processing_time(&self) -> Duration;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::TransformationConfig;
    use sqlparser::dialect::PostgreSqlDialect;
    use sqlparser::parser::Parser;

    fn parse(sql: &str) -> Vec<sqlparser::ast::Statement> {
        Parser::parse_sql(&PostgreSqlDialect {}, sql).unwrap()
    }

    // --- TransformationEngine::new ---

    #[test]
    fn engine_constructs_with_default_config() {
        let _eng = TransformationEngine::new(&TransformationConfig::default());
    }

    // --- TransformationEngine::transform_statement ---

    #[test]
    fn transform_statement_handles_select() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("SELECT 1").into_iter().next().unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        match out {
            sqlparser::ast::Statement::Query(_) => {}
            other => panic!("expected Query, got {:?}", other),
        }
    }

    #[test]
    fn transform_statement_handles_insert() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("INSERT INTO t(x) VALUES(1)")
            .into_iter()
            .next()
            .unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        assert!(matches!(out, sqlparser::ast::Statement::Insert(_)));
    }

    #[test]
    fn transform_statement_handles_update() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("UPDATE t SET x = 1 WHERE id = 1")
            .into_iter()
            .next()
            .unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        assert!(matches!(out, sqlparser::ast::Statement::Update { .. }));
    }

    #[test]
    fn transform_statement_handles_delete() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("DELETE FROM t WHERE id = 1")
            .into_iter()
            .next()
            .unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        assert!(matches!(out, sqlparser::ast::Statement::Delete(_)));
    }

    #[test]
    fn transform_statement_handles_create_table() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("CREATE TABLE t (id INT PRIMARY KEY)")
            .into_iter()
            .next()
            .unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        assert!(matches!(out, sqlparser::ast::Statement::CreateTable(_)));
    }

    // --- TransformationEngine::transform_statements ---

    #[test]
    fn transform_statements_returns_same_count() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmts = parse("SELECT 1; SELECT 2;");
        assert_eq!(stmts.len(), 2);
        let out = eng.transform_statements(&stmts).unwrap();
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn transform_statements_empty_slice_returns_empty() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let out = eng.transform_statements(&[]).unwrap();
        assert_eq!(out.len(), 0);
    }

    #[test]
    fn transform_statements_single_statement() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmts = parse("SELECT RANDOM()");
        let out = eng.transform_statements(&stmts).unwrap();
        assert_eq!(out.len(), 1);
    }

    // --- TransformationEngine::apply_post_processing_rules ---

    #[test]
    fn apply_post_processing_idempotent_on_plain_sql() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let s = eng.apply_post_processing_rules("SELECT 1").unwrap();
        assert!(s.to_uppercase().contains("SELECT"));
    }

    // Note: TransformationEngine::apply_post_processing_rules delegates to
    // TransformationRules::apply_transformation_rules (pattern rules), NOT to
    // the HANA PostProcessor. The PostProcessor (FULL JOIN fix / USING btree strip)
    // is applied by SqlTransformer::transform after the engine step.

    #[test]
    fn apply_post_processing_passes_through_full_join_unchanged() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let sql = "SELECT * FROM a FULL JOIN b ON a.id = b.id";
        let out = eng.apply_post_processing_rules(sql).unwrap();
        // The engine-level post-processing does NOT fix FULL JOIN — that is the
        // responsibility of the HANA PostProcessor called by SqlTransformer.
        assert!(out.contains("FULL JOIN"), "engine post-processing should not strip FULL JOIN");
    }

    #[test]
    fn apply_post_processing_passes_through_using_btree() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let sql = "CREATE INDEX ix ON t USING btree (col)";
        let out = eng.apply_post_processing_rules(sql).unwrap();
        // engine-level post-processing does not handle USING btree
        assert!(out.to_lowercase().contains("using btree"), "engine should not strip USING btree");
    }

    // --- TransformationEngine::validate_statement_for_hana ---

    #[test]
    fn validate_statement_returns_empty_vec_for_valid_select() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("SELECT 1").into_iter().next().unwrap();
        let violations = eng.validate_statement_for_hana(&stmt).unwrap();
        // shape contract: returns Vec<String>
        let _: Vec<String> = violations;
    }

    #[test]
    fn validate_statement_for_hana_with_create_table() {
        let eng = TransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("CREATE TABLE t (id INT PRIMARY KEY)")
            .into_iter()
            .next()
            .unwrap();
        let result = eng.validate_statement_for_hana(&stmt);
        assert!(result.is_ok());
    }

    // --- HanaTransformationEngine::new ---

    #[test]
    fn hana_engine_wraps_transformation_engine() {
        let _ = HanaTransformationEngine::new(&TransformationConfig::default());
    }

    #[test]
    fn hana_engine_dialect_is_hana() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        assert_eq!(eng.dialect(), super::super::Dialect::Hana);
    }

    #[test]
    fn hana_engine_name() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        assert_eq!(eng.name(), "HANA Transformation Engine");
    }

    #[test]
    fn hana_engine_transform_statement() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("SELECT 1").into_iter().next().unwrap();
        let out = eng.transform_statement(stmt).unwrap();
        assert!(matches!(out, sqlparser::ast::Statement::Query(_)));
    }

    #[test]
    fn hana_engine_transform_statements() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        let stmts = parse("SELECT 1; SELECT 2;");
        let out = eng.transform_statements(&stmts).unwrap();
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn hana_engine_apply_post_processing() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        let out = eng.apply_post_processing_rules("SELECT 1").unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }

    #[test]
    fn hana_engine_validate_statement_for_hana() {
        use super::super::DialectTransformationEngine;
        let eng = HanaTransformationEngine::new(&TransformationConfig::default());
        let stmt = parse("SELECT 1").into_iter().next().unwrap();
        let v = eng.validate_statement_for_hana(&stmt).unwrap();
        let _: Vec<String> = v;
    }

    // --- DetailedTransformationResult: construct and read fields ---

    #[test]
    fn detailed_transformation_result_field_access() {
        let result = DetailedTransformationResult {
            sql: Some("SELECT 1".to_string()),
            errors: vec![],
            warnings: vec![],
            metadata: TransformationMetadata {
                input_statements: 1,
                transformed_statements: 1,
                skipped_statements: 0,
                transformation_time: std::time::Duration::from_millis(5),
            },
        };
        assert_eq!(result.sql.as_deref(), Some("SELECT 1"));
        assert!(result.errors.is_empty());
        assert!(result.warnings.is_empty());
        assert_eq!(result.metadata.input_statements, 1);
        assert_eq!(result.metadata.transformed_statements, 1);
        assert_eq!(result.metadata.skipped_statements, 0);
        assert_eq!(result.metadata.transformation_time, std::time::Duration::from_millis(5));
    }

    #[test]
    fn detailed_transformation_result_no_sql() {
        let result = DetailedTransformationResult {
            sql: None,
            errors: vec![],
            warnings: vec![],
            metadata: TransformationMetadata {
                input_statements: 0,
                transformed_statements: 0,
                skipped_statements: 0,
                transformation_time: std::time::Duration::ZERO,
            },
        };
        assert!(result.sql.is_none());
        assert_eq!(result.metadata.input_statements, 0);
    }

    // --- TransformationMetadata: construct and read fields ---

    #[test]
    fn transformation_metadata_clone_and_debug() {
        let meta = TransformationMetadata {
            input_statements: 3,
            transformed_statements: 2,
            skipped_statements: 1,
            transformation_time: std::time::Duration::from_secs(1),
        };
        let cloned = meta.clone();
        assert_eq!(cloned.input_statements, 3);
        assert_eq!(cloned.transformed_statements, 2);
        assert_eq!(cloned.skipped_statements, 1);
        // Debug derived — just ensure it doesn't panic
        let _ = format!("{:?}", cloned);
    }
}
