use crate::error::TransformationResult;
use crate::dialects::hana::post_processor::PostProcessor;
use sqlparser::ast::Statement;

pub fn generate_hana_sql(statements: &[Statement]) -> TransformationResult<String> {
    let mut result = String::new();

    for (i, stmt) in statements.iter().enumerate() {
        if i > 0 {
            result.push_str(";\n\n");
        }

        result.push_str(&format!("{}", stmt));
    }

    if !statements.is_empty() {
        result.push(';');
    }

    let post_processor = PostProcessor::new();
    let processed_sql = post_processor.process(&result)?;

    Ok(processed_sql)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlparser::dialect::PostgreSqlDialect;
    use sqlparser::parser::Parser;

    #[test]
    fn generate_hana_sql_emits_select_keyword() {
        let stmts = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1").unwrap();
        let out = generate_hana_sql(&stmts).unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }

    #[test]
    fn generate_hana_sql_empty_input_returns_empty() {
        let out = generate_hana_sql(&[]).unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn generate_hana_sql_multi_statement_joins_with_semicolons() {
        let stmts = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1; SELECT 2").unwrap();
        let out = generate_hana_sql(&stmts).unwrap();
        assert!(out.contains(';'));
        assert!(out.to_uppercase().contains("SELECT"));
    }
}
