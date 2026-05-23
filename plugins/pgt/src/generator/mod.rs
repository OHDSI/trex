pub mod dialect;
pub mod main;

use crate::error::TransformationResult;
use sqlparser::ast::Statement;

pub fn generate_sql(statements: &[Statement]) -> TransformationResult<String> {
    main::generate_hana_sql(statements)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlparser::dialect::PostgreSqlDialect;
    use sqlparser::parser::Parser;

    #[test]
    fn generate_sql_emits_select_keyword() {
        let stmts = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1").unwrap();
        let out = generate_sql(&stmts).unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }

    #[test]
    fn generate_sql_empty_returns_empty() {
        let out = generate_sql(&[]).unwrap();
        assert!(out.is_empty());
    }
}
