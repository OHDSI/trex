use sqlparser::ast::Statement;

pub struct SqlValidator;

impl SqlValidator {
    pub fn new() -> Self {
        Self
    }

    pub fn validate_statement(&self, _stmt: &Statement) -> Result<(), String> {
        Ok(())
    }

    pub fn has_unsupported_features(&self, _stmt: &Statement) -> bool {
        false
    }

    pub fn validate_hana_syntax(
        &self,
        _sql: &str,
    ) -> Result<ValidationResult, crate::error::TransformationError> {
        Ok(ValidationResult::new())
    }
}

impl Default for SqlValidator {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    pub fn new() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn has_warnings(&self) -> bool {
        !self.warnings.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlparser::dialect::PostgreSqlDialect;
    use sqlparser::parser::Parser;

    fn first(sql: &str) -> sqlparser::ast::Statement {
        Parser::parse_sql(&PostgreSqlDialect {}, sql)
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
    }

    #[test]
    fn validator_constructs() {
        let _ = SqlValidator::new();
    }

    #[test]
    fn default_constructs() {
        let _ = SqlValidator::default();
    }

    #[test]
    fn validate_statement_accepts_select() {
        let v = SqlValidator::new();
        v.validate_statement(&first("SELECT 1")).unwrap();
    }

    #[test]
    fn validate_statement_accepts_insert() {
        let v = SqlValidator::new();
        v.validate_statement(&first("INSERT INTO t (a) VALUES (1)")).unwrap();
    }

    #[test]
    fn has_unsupported_features_default_false_for_select() {
        let v = SqlValidator::new();
        assert!(!v.has_unsupported_features(&first("SELECT 1")));
    }

    #[test]
    fn validate_hana_syntax_returns_valid_result_for_select() {
        let v = SqlValidator::new();
        let result = v.validate_hana_syntax("SELECT 1").unwrap();
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn validation_result_new_is_valid() {
        let r = ValidationResult::new();
        assert!(r.is_valid);
        assert!(r.errors.is_empty());
        assert!(r.warnings.is_empty());
    }

    #[test]
    fn validation_result_starts_clean() {
        let r = ValidationResult::new();
        assert!(!r.has_warnings());
    }

    #[test]
    fn validation_result_has_warnings_when_populated() {
        let mut r = ValidationResult::new();
        r.warnings.push("some warning".to_string());
        assert!(r.has_warnings());
    }
}
