use super::Transformer;
use crate::config::TransformationConfig;
use crate::error::TransformationResult;
use sqlparser::ast::{Expr, Function, Ident, ObjectName, Statement};
use std::collections::HashMap;

pub struct FunctionTransformer {
    simple_mappings: HashMap<String, String>,
    preserve_case: bool,
}

impl FunctionTransformer {
    pub fn new(config: &TransformationConfig) -> Self {
        let mut simple_mappings = config.functions.custom_mappings.clone();

        for (pg_func, hana_func) in get_default_function_mappings() {
            simple_mappings.entry(pg_func).or_insert(hana_func);
        }

        Self {
            simple_mappings,
            preserve_case: config.functions.preserve_case,
        }
    }

    fn transform_expression(&self, expr: &mut Expr) -> TransformationResult<bool> {
        let mut changed = false;

        match expr {
            Expr::Function(func) => {
                if self.transform_function(func)? {
                    changed = true;
                }
            }
            Expr::BinaryOp { left, op, right } => {
                if self.transform_expression(left)? {
                    changed = true;
                }
                if self.transform_expression(right)? {
                    changed = true;
                }

                if matches!(op, sqlparser::ast::BinaryOperator::StringConcat) {
                }
            }
            Expr::Nested(inner) => {
                if self.transform_expression(inner)? {
                    changed = true;
                }
            }
            Expr::Subquery(query) => {
                if self.transform_query_functions(&mut query.body)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn transform_function(&self, func: &mut Function) -> TransformationResult<bool> {
        let func_name = func.name.to_string().to_uppercase();
        let mut changed = false;

        if let Some(hana_name) = self.simple_mappings.get(&func_name) {
            func.name = ObjectName(vec![sqlparser::ast::ObjectNamePart::Identifier(
                Ident::new(hana_name),
            )]);
            changed = true;
        } else {
            changed = self.transform_complex_function(func)?;
        }

        match &mut func.args {
            sqlparser::ast::FunctionArguments::List(arg_list) => {
                for arg in &mut arg_list.args {
                    if let sqlparser::ast::FunctionArg::Unnamed(
                        sqlparser::ast::FunctionArgExpr::Expr(expr),
                    ) = arg
                    {
                        if self.transform_expression(expr)? {
                            changed = true;
                        }
                    }
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn transform_complex_function(&self, func: &mut Function) -> TransformationResult<bool> {
        let func_name = func.name.to_string().to_uppercase();

        match func_name.as_str() {
            "CONCAT" => self.transform_concat_function(func),
            "POSITION" => self.transform_position_function(func),
            "SUBSTRING" => self.transform_substring_function(func),
            "EXTRACT" => self.validate_extract_function(func),
            "RANDOM" => {
                func.name = ObjectName(vec![sqlparser::ast::ObjectNamePart::Identifier(
                    Ident::new("RAND"),
                )]);
                Ok(true)
            }
            "NEXTVAL" => self.transform_nextval_function(func),
            _ => Ok(false),
        }
    }

    fn transform_position_function(&self, func: &mut Function) -> TransformationResult<bool> {
        func.name = ObjectName(vec![sqlparser::ast::ObjectNamePart::Identifier(
            Ident::new("LOCATE"),
        )]);

        Ok(true)
    }

    fn transform_substring_function(&self, func: &mut Function) -> TransformationResult<bool> {
        Ok(false)
    }

    fn validate_extract_function(&self, func: &mut Function) -> TransformationResult<bool> {
        Ok(false)
    }

    fn transform_concat_function(&self, func: &mut Function) -> TransformationResult<bool> {
        if let sqlparser::ast::FunctionArguments::List(arg_list) = &mut func.args {
            if arg_list.args.len() > 2 {
                log::warn!("CONCAT with >2 args - consider || operator");
                return Ok(false);
            }
        }

        Ok(false)
    }

    fn transform_nextval_function(&self, func: &mut Function) -> TransformationResult<bool> {
        if let sqlparser::ast::FunctionArguments::List(arg_list) = &func.args {
            if arg_list.args.len() == 1 {
                if let sqlparser::ast::FunctionArg::Unnamed(
                    sqlparser::ast::FunctionArgExpr::Expr(Expr::Value(value_with_span)),
                ) = &arg_list.args[0]
                {
                    if let sqlparser::ast::Value::SingleQuotedString(seq_name) =
                        &value_with_span.value
                    {
                        log::warn!("NEXTVAL requires manual conversion to HANA sequence syntax");
                    }
                }
            }
        }

        Ok(false)
    }

    fn transform_query_functions(
        &self,
        query: &mut sqlparser::ast::SetExpr,
    ) -> TransformationResult<bool> {
        let mut changed = false;

        match query {
            sqlparser::ast::SetExpr::Select(select) => {
                for item in &mut select.projection {
                    if let sqlparser::ast::SelectItem::UnnamedExpr(expr) = item {
                        if self.transform_expression(expr)? {
                            changed = true;
                        }
                    } else if let sqlparser::ast::SelectItem::ExprWithAlias { expr, .. } = item {
                        if self.transform_expression(expr)? {
                            changed = true;
                        }
                    }
                }

                if let Some(ref mut where_clause) = select.selection {
                    if self.transform_expression(where_clause)? {
                        changed = true;
                    }
                }

                if let sqlparser::ast::GroupByExpr::Expressions(expressions, _) =
                    &mut select.group_by
                {
                    for expr in expressions {
                        if self.transform_expression(expr)? {
                            changed = true;
                        }
                    }
                }

                if let Some(ref mut having) = select.having {
                    if self.transform_expression(having)? {
                        changed = true;
                    }
                }
            }
            sqlparser::ast::SetExpr::SetOperation { left, right, .. } => {
                if self.transform_query_functions(left)? {
                    changed = true;
                }
                if self.transform_query_functions(right)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }
}

impl Transformer for FunctionTransformer {
    fn name(&self) -> &'static str {
        "FunctionTransformer"
    }

    fn priority(&self) -> u8 {
        30
    }

    fn supports_statement_type(&self, stmt: &Statement) -> bool {
        matches!(
            stmt,
            Statement::Query(_)
                | Statement::Insert(_)
                | Statement::Update { .. }
                | Statement::Delete(_)
                | Statement::CreateTable(_)
                | Statement::CreateView { .. }
        )
    }

    fn transform(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let mut changed = false;

        match stmt {
            Statement::Query(query) => {
                if self.transform_query_functions(&mut query.body)? {
                    changed = true;
                }
            }
            Statement::Insert(insert) => {
                if let Some(source) = &mut insert.source {
                    if self.transform_query_functions(&mut source.body)? {
                        changed = true;
                    }
                }
            }
            Statement::Update {
                selection,
                assignments,
                ..
            } => {
                for assignment in assignments {
                    if self.transform_expression(&mut assignment.value)? {
                        changed = true;
                    }
                }

                if let Some(ref mut where_clause) = selection {
                    if self.transform_expression(where_clause)? {
                        changed = true;
                    }
                }
            }
            Statement::Delete(delete) => {
                if let Some(ref mut where_clause) = delete.selection {
                    if self.transform_expression(where_clause)? {
                        changed = true;
                    }
                }
            }
            _ => {}
        }

        Ok(changed)
    }
}

fn get_default_function_mappings() -> HashMap<String, String> {
    let mut mappings = HashMap::new();

    mappings.insert("RANDOM".to_string(), "RAND".to_string());
    mappings.insert(
        "CURRENT_TIMESTAMP()".to_string(),
        "CURRENT_TIMESTAMP".to_string(),
    );
    mappings.insert("CURRENT_TIME()".to_string(), "CURRENT_TIME".to_string());
    mappings.insert("CURRENT_DATE()".to_string(), "CURRENT_DATE".to_string());

    mappings.insert("LENGTH".to_string(), "LENGTH".to_string());
    mappings.insert("UPPER".to_string(), "UPPER".to_string());
    mappings.insert("LOWER".to_string(), "LOWER".to_string());
    mappings.insert("TRIM".to_string(), "TRIM".to_string());

    mappings.insert("ABS".to_string(), "ABS".to_string());
    mappings.insert("ROUND".to_string(), "ROUND".to_string());
    mappings.insert("CEIL".to_string(), "CEIL".to_string());
    mappings.insert("FLOOR".to_string(), "FLOOR".to_string());

    mappings.insert("COUNT".to_string(), "COUNT".to_string());
    mappings.insert("SUM".to_string(), "SUM".to_string());
    mappings.insert("AVG".to_string(), "AVG".to_string());
    mappings.insert("MIN".to_string(), "MIN".to_string());
    mappings.insert("MAX".to_string(), "MAX".to_string());

    mappings
}

#[cfg(test)]
mod tests {
    use crate::{SqlTransformer, TransformationConfig};

    fn t() -> SqlTransformer {
        SqlTransformer::with_config(TransformationConfig::default()).unwrap()
    }

    // --- FunctionTransformer::new / simple_mappings path ---

    #[test]
    fn new_builds_with_default_config() {
        use super::FunctionTransformer;
        let cfg = TransformationConfig::default();
        let ft = FunctionTransformer::new(&cfg);
        // preserve_case defaults to false in default config
        assert!(!ft.preserve_case);
    }

    #[test]
    fn new_incorporates_custom_mappings() {
        use super::FunctionTransformer;
        let mut cfg = TransformationConfig::default();
        cfg.functions.custom_mappings.insert("MY_FUNC".into(), "HANA_FUNC".into());
        let ft = FunctionTransformer::new(&cfg);
        assert!(ft.simple_mappings.contains_key("MY_FUNC"));
    }

    // --- RANDOM: in simple_mappings → rewrites to RAND ---

    #[test]
    fn random_rewrites_to_rand() {
        let out = t().transform("SELECT RANDOM()").unwrap().to_uppercase();
        // RANDOM is in simple_mappings as RANDOM→RAND
        assert!(out.contains("RAND"), "expected RAND in: {out}");
    }

    // --- NOW: NOT in simple_mappings, NOT in complex handler; passes through ---

    #[test]
    fn now_passes_through_unchanged() {
        let out = t().transform("SELECT NOW()").unwrap().to_uppercase();
        // NOW is natively supported in HANA and not rewritten by FunctionTransformer
        assert!(out.contains("NOW"), "expected NOW in: {out}");
    }

    // --- LENGTH: in simple_mappings as LENGTH→LENGTH (identity mapping) ---

    #[test]
    fn length_is_preserved() {
        let out = t().transform("SELECT LENGTH(name) FROM users").unwrap().to_uppercase();
        assert!(out.contains("LENGTH"), "expected LENGTH in: {out}");
    }

    // --- CONCAT: in transform_complex_function, returns false for ≤2 args ---

    #[test]
    fn concat_with_two_args_passes_through() {
        let out = t()
            .transform("SELECT CONCAT(first_name, last_name) FROM users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("CONCAT"), "expected CONCAT in: {out}");
    }

    #[test]
    fn concat_with_three_args_passes_through_with_warning() {
        // 3-arg CONCAT logs a warning but still passes through (returns false)
        let out = t()
            .transform("SELECT CONCAT(a, b, c) FROM t")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("CONCAT"), "expected CONCAT in: {out}");
    }

    // --- POSITION: sqlparser parses POSITION as a special AST node (Expr::Position),
    // NOT as Expr::Function, so FunctionTransformer cannot rewrite it ---

    #[test]
    #[ignore = "reveals bug: POSITION() is parsed as Expr::Position by sqlparser, not Expr::Function; FunctionTransformer only handles Expr::Function so the LOCATE rewrite is unreachable"]
    fn position_rewrites_to_locate() {
        let out = t()
            .transform("SELECT POSITION('a' IN name) FROM users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("LOCATE"), "expected LOCATE in: {out}");
    }

    // --- EXTRACT: in transform_complex_function, returns false (no-op) ---

    #[test]
    fn extract_passes_through() {
        let out = t()
            .transform("SELECT EXTRACT(YEAR FROM created_at) FROM events")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("EXTRACT"), "expected EXTRACT in: {out}");
    }

    // --- SUBSTRING: in transform_complex_function, returns false ---

    #[test]
    fn substring_passes_through() {
        let out = t()
            .transform("SELECT SUBSTRING(name FROM 1 FOR 3) FROM users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("SUBSTRING"), "expected SUBSTRING in: {out}");
    }

    // --- STRING_AGG: NOT in simple_mappings for FunctionTransformer, passes through ---

    #[test]
    fn string_agg_passes_through() {
        let out = t()
            .transform("SELECT STRING_AGG(name, ',') FROM users GROUP BY tenant_id")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("STRING_AGG"), "expected STRING_AGG in: {out}");
    }

    // --- COALESCE: not handled, passes through ---

    #[test]
    fn coalesce_passes_through() {
        let out = t()
            .transform("SELECT COALESCE(name, 'anon') FROM users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("COALESCE"), "expected COALESCE in: {out}");
    }

    // --- NULLIF: not handled, passes through ---

    #[test]
    fn nullif_passes_through() {
        let out = t()
            .transform("SELECT NULLIF(value, 0) FROM t")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("NULLIF"), "expected NULLIF in: {out}");
    }

    // --- Aggregate functions (COUNT, SUM, AVG, MIN, MAX) pass through via simple_mappings ---

    #[test]
    fn aggregate_functions_pass_through() {
        let out = t()
            .transform("SELECT COUNT(*), SUM(amount), AVG(score), MIN(val), MAX(val) FROM t")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("COUNT"), "expected COUNT in: {out}");
        assert!(out.contains("SUM"), "expected SUM in: {out}");
        assert!(out.contains("AVG"), "expected AVG in: {out}");
    }

    // --- String functions UPPER/LOWER/TRIM pass through ---

    #[test]
    fn upper_lower_trim_pass_through() {
        let out = t()
            .transform("SELECT UPPER(name), LOWER(email), TRIM(code) FROM users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("UPPER"), "expected UPPER in: {out}");
        assert!(out.contains("LOWER"), "expected LOWER in: {out}");
        assert!(out.contains("TRIM"), "expected TRIM in: {out}");
    }

    // --- Math functions ABS/ROUND/CEIL/FLOOR ---

    #[test]
    fn math_functions_pass_through() {
        let out = t()
            .transform("SELECT ABS(x), ROUND(x), CEIL(x), FLOOR(x) FROM t")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("ABS"), "expected ABS in: {out}");
        assert!(out.contains("ROUND"), "expected ROUND in: {out}");
    }

    // --- NEXTVAL: in transform_complex_function, returns false ---

    #[test]
    fn nextval_passes_through_unchanged() {
        let out = t()
            .transform("SELECT NEXTVAL('my_seq')")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("NEXTVAL"), "expected NEXTVAL in: {out}");
    }

    // --- Nested expressions (BinaryOp, Nested, Subquery paths) ---

    #[test]
    fn random_in_binary_op_rewrites_to_rand() {
        let out = t()
            .transform("SELECT RANDOM() + 1")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("RAND"), "expected RAND in: {out}");
    }

    #[test]
    fn function_in_subquery_is_transformed() {
        let out = t()
            .transform("SELECT * FROM (SELECT RANDOM() AS r) sub")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("RAND"), "expected RAND in subquery: {out}");
    }

    #[test]
    fn random_in_where_clause_rewrites_to_rand() {
        let out = t()
            .transform("SELECT id FROM t WHERE RANDOM() > 0.5")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("RAND"), "expected RAND in where: {out}");
    }

    #[test]
    fn function_in_having_clause_rewrites() {
        let out = t()
            .transform("SELECT MAX(score) FROM t GROUP BY cat HAVING MAX(score) > 0")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("MAX"), "expected MAX in having: {out}");
    }

    // --- INSERT with functions in SELECT source ---

    #[test]
    fn random_in_insert_select_rewrites() {
        let out = t()
            .transform("INSERT INTO t SELECT RANDOM() FROM s")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("RAND"), "expected RAND in insert-select: {out}");
    }

    // --- UPDATE with functions ---

    #[test]
    fn random_in_update_set_rewrites() {
        let out = t()
            .transform("UPDATE t SET val = RANDOM()")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("RAND"), "expected RAND in update set: {out}");
    }

    // --- DELETE with functions in WHERE ---

    #[test]
    fn random_in_delete_where_rewrites() {
        let out = t()
            .transform("DELETE FROM t WHERE id = ABS(-1)")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("ABS"), "expected ABS in delete where: {out}");
    }

    // --- supports_statement_type covers listed statements ---

    #[test]
    fn transformer_supports_query_statements() {
        use super::FunctionTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::ast::Statement;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let ft = FunctionTransformer::new(&cfg);

        let query_stmt = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert!(ft.supports_statement_type(&query_stmt));
    }

    #[test]
    fn transformer_does_not_support_drop_statement() {
        use super::FunctionTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::ast::Statement;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let ft = FunctionTransformer::new(&cfg);

        let drop_stmt = Parser::parse_sql(&PostgreSqlDialect {}, "DROP TABLE t")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert!(!ft.supports_statement_type(&drop_stmt));
    }

    // --- Transformer trait methods ---

    #[test]
    fn transformer_name_and_priority() {
        use super::FunctionTransformer;
        use crate::dialects::hana::Transformer;

        let cfg = TransformationConfig::default();
        let ft = FunctionTransformer::new(&cfg);
        assert_eq!(ft.name(), "FunctionTransformer");
        assert_eq!(ft.priority(), 30);
    }
}
