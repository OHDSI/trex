use crate::error::{TransformationError, TransformationResult};
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;

pub struct PostgreSqlParser {
    dialect: PostgreSqlDialect,
}

impl PostgreSqlParser {
    pub fn new() -> Self {
        Self {
            dialect: PostgreSqlDialect {},
        }
    }

    pub fn parse(&self, sql: &str) -> TransformationResult<Vec<sqlparser::ast::Statement>> {
        Parser::parse_sql(&self.dialect, sql).map_err(|e| TransformationError::ParseError {
            message: e.to_string(),
            line: 0,
            column: 0,
        })
    }

    pub fn validate_syntax(&self, sql: &str) -> TransformationResult<()> {
        self.parse(sql)?;
        Ok(())
    }

    pub fn parse_statement(&self, sql: &str) -> TransformationResult<sqlparser::ast::Statement> {
        let statements = self.parse(sql)?;

        if statements.is_empty() {
            return Err(TransformationError::ParseError {
                message: "No statements found".to_string(),
                line: 0,
                column: 0,
            });
        }

        if statements.len() > 1 {
            return Err(TransformationError::ParseError {
                message: "Multiple statements found, expected single statement".to_string(),
                line: 0,
                column: 0,
            });
        }

        Ok(statements.into_iter().next().unwrap())
    }
}

impl Default for PostgreSqlParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_select() {
        let p = PostgreSqlParser::new();
        let stmts = p.parse("SELECT 1").unwrap();
        assert_eq!(stmts.len(), 1);
    }

    #[test]
    fn parse_multi_statement() {
        let p = PostgreSqlParser::new();
        let stmts = p.parse("SELECT 1; SELECT 2;").unwrap();
        assert_eq!(stmts.len(), 2);
    }

    #[test]
    fn parse_statement_rejects_multi() {
        let p = PostgreSqlParser::new();
        assert!(p.parse_statement("SELECT 1; SELECT 2;").is_err());
    }

    #[test]
    fn parse_statement_rejects_empty() {
        let p = PostgreSqlParser::new();
        assert!(p.parse_statement("").is_err());
    }

    #[test]
    fn parse_statement_accepts_single() {
        let p = PostgreSqlParser::new();
        let stmt = p.parse_statement("SELECT 42").unwrap();
        assert!(matches!(stmt, sqlparser::ast::Statement::Query(_)));
    }

    #[test]
    fn validate_syntax_accepts_valid() {
        let p = PostgreSqlParser::new();
        p.validate_syntax("SELECT 1").unwrap();
    }

    #[test]
    fn validate_syntax_rejects_garbage() {
        let p = PostgreSqlParser::new();
        assert!(p.validate_syntax("SELEKT FORM").is_err());
    }

    #[test]
    fn default_constructs_equivalent_to_new() {
        let p = PostgreSqlParser::default();
        let stmts = p.parse("SELECT 1").unwrap();
        assert_eq!(stmts.len(), 1);
    }
}
