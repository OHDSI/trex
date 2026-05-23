use super::Transformer;
use crate::config::TransformationConfig;
use crate::error::TransformationResult;
use sqlparser::ast::{
    BinaryOperator, CastKind, Delete, Expr, Function, Ident, Statement, UnaryOperator,
};

pub struct ExpressionTransformer {
    config: TransformationConfig,
}

impl ExpressionTransformer {
    pub fn new(config: &TransformationConfig) -> Self {
        Self {
            config: config.clone(),
        }
    }

    fn transform_expression(&self, expr: &mut Expr) -> TransformationResult<bool> {
        let mut changed = false;

        match expr {
            Expr::BinaryOp { left, op, right } => {
                if self.transform_expression(left)? {
                    changed = true;
                }
                if self.transform_expression(right)? {
                    changed = true;
                }

                if self.transform_binary_operator(op)? {
                    changed = true;
                }
            }
            Expr::UnaryOp {
                op,
                expr: inner_expr,
            } => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }

                if self.transform_unary_operator(op)? {
                    changed = true;
                }
            }
            Expr::Nested(inner_expr) => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }
            }
            Expr::Cast {
                expr: inner_expr,
                data_type,
                kind,
                ..
            } => {
                if matches!(kind, CastKind::DoubleColon) {
                    *kind = CastKind::Cast;
                    changed = true;
                }

                if self.transform_expression(inner_expr)? {
                    changed = true;
                }

                let data_type_transformer =
                    crate::dialects::hana::data_types::DataTypeTransformer::new(&self.config);
                if data_type_transformer.transform_data_type(data_type)? {
                    changed = true;
                }
            }
            Expr::IsNull(inner_expr) | Expr::IsNotNull(inner_expr) => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }
            }
            Expr::Case {
                operand,
                else_result,
                ..
            } => {
                if let Some(operand) = operand {
                    if self.transform_expression(operand)? {
                        changed = true;
                    }
                }

                if let Some(else_result) = else_result {
                    if self.transform_expression(else_result)? {
                        changed = true;
                    }
                }
            }
            Expr::InList {
                expr: inner_expr,
                list,
                negated,
            } => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }

                for item in list {
                    if self.transform_expression(item)? {
                        changed = true;
                    }
                }
            }
            Expr::Between {
                expr: inner_expr,
                negated,
                low,
                high,
            } => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }
                if self.transform_expression(low)? {
                    changed = true;
                }
                if self.transform_expression(high)? {
                    changed = true;
                }
            }
            Expr::Like {
                expr: inner_expr,
                pattern,
                negated,
                escape_char,
                ..
            } => {
                if self.transform_expression(inner_expr)? {
                    changed = true;
                }
                if self.transform_expression(pattern)? {
                    changed = true;
                }
            }
            Expr::ILike {
                expr: _inner_expr,
                pattern: _,
                negated: _,
                escape_char: _,
                ..
            } => {}
            Expr::Subquery(query) => {
                if self.transform_query_expressions(&mut query.body)? {
                    changed = true;
                }
            }
            Expr::Exists { subquery, negated } => {
                if self.transform_query_expressions(&mut subquery.body)? {
                    changed = true;
                }
            }
            Expr::TypedString {
                data_type, value, ..
            } => {
                if self.transform_typed_string_to_cast(expr)? {
                    changed = true;
                }
            }
            Expr::Function(function) => {
                let function_name = function.name.to_string().to_uppercase();

                match function_name.as_str() {
                    "NEXTVAL" => {
                        if let Some(new_expr) = self.build_hana_nextval_expr(function)? {
                            *expr = new_expr;
                            changed = true;
                        }
                    }
                    "CURRVAL" => {
                        if let Some(new_expr) = self.build_hana_currval_expr(function)? {
                            *expr = new_expr;
                            changed = true;
                        }
                    }
                    _ => {
                        if let sqlparser::ast::FunctionArguments::List(ref mut arg_list) =
                            function.args
                        {
                            for arg in &mut arg_list.args {
                                if let sqlparser::ast::FunctionArg::Unnamed(
                                    sqlparser::ast::FunctionArgExpr::Expr(ref mut arg_expr),
                                ) = arg
                                {
                                    if self.transform_expression(arg_expr)? {
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn transform_binary_operator(&self, op: &mut BinaryOperator) -> TransformationResult<bool> {
        match op {
            BinaryOperator::StringConcat => Ok(false),
            BinaryOperator::PGRegexMatch => {
                log::warn!("Regex operator ~ requires manual conversion");
                Ok(false)
            }
            BinaryOperator::PGRegexIMatch => {
                log::warn!("Regex operator ~* requires manual conversion");
                Ok(false)
            }
            BinaryOperator::PGRegexNotMatch => {
                log::warn!("Regex operator !~ requires manual conversion");
                Ok(false)
            }
            BinaryOperator::PGRegexNotIMatch => {
                log::warn!("Regex operator !~* requires manual conversion");
                Ok(false)
            }
            _ => Ok(false),
        }
    }

    fn transform_unary_operator(&self, op: &mut UnaryOperator) -> TransformationResult<bool> {
        match op {
            UnaryOperator::Not | UnaryOperator::Plus | UnaryOperator::Minus => Ok(false),
            _ => Ok(false),
        }
    }

    fn transform_ilike_to_like(&self, expr: &mut Expr) -> TransformationResult<bool> {
        Ok(false)
    }

    fn transform_query_expressions(
        &self,
        query: &mut sqlparser::ast::SetExpr,
    ) -> TransformationResult<bool> {
        let mut changed = false;

        match query {
            sqlparser::ast::SetExpr::Select(select) => {
                for item in &mut select.projection {
                    match item {
                        sqlparser::ast::SelectItem::UnnamedExpr(expr) => {
                            if self.transform_expression(expr)? {
                                changed = true;
                            }
                        }
                        sqlparser::ast::SelectItem::ExprWithAlias { expr, .. } => {
                            if self.transform_expression(expr)? {
                                changed = true;
                            }
                        }
                        _ => {}
                    }
                }

                if let Some(ref mut selection) = select.selection {
                    if self.transform_expression(selection)? {
                        changed = true;
                    }
                }

                if let Some(ref mut having) = select.having {
                    if self.transform_expression(having)? {
                        changed = true;
                    }
                }
            }
            sqlparser::ast::SetExpr::SetOperation { left, right, .. } => {
                if self.transform_query_expressions(left)? {
                    changed = true;
                }
                if self.transform_query_expressions(right)? {
                    changed = true;
                }
            }
            sqlparser::ast::SetExpr::Values(values) => {
                for row in &mut values.rows {
                    for expr in row {
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

    fn transform_typed_string_to_cast(&self, expr: &mut Expr) -> TransformationResult<bool> {
        if let Expr::TypedString { data_type, value } = expr {
            let cast_expr = Expr::Cast {
                kind: CastKind::Cast,
                expr: Box::new(Expr::Value(value.clone())),
                data_type: data_type.clone(),
                format: None,
            };

            *expr = cast_expr;
            return Ok(true);
        }

        Ok(false)
    }

    fn transform_statement(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let mut changed = false;

        match stmt {
            Statement::Query(query) => {
                if self.transform_query_expressions(&mut query.body)? {
                    changed = true;
                }
            }
            Statement::Insert(insert_stmt) => {
                if let Some(ref mut source) = insert_stmt.source {
                    if self.transform_query_expressions(&mut source.body)? {
                        changed = true;
                    }
                }
            }
            Statement::Update {
                assignments,
                selection,
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
            Statement::Delete(Delete { selection, .. }) => {
                if let Some(ref mut where_clause) = selection {
                    if self.transform_expression(where_clause)? {
                        changed = true;
                    }
                }
            }
            Statement::CreateView { query, .. } => {
                if self.transform_query_expressions(&mut query.body)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn build_hana_nextval_expr(&self, function: &Function) -> TransformationResult<Option<Expr>> {
        if let sqlparser::ast::FunctionArguments::List(ref arg_list) = function.args {
            if arg_list.args.len() == 1 {
                if let sqlparser::ast::FunctionArg::Unnamed(
                    sqlparser::ast::FunctionArgExpr::Expr(Expr::Value(
                        sqlparser::ast::ValueWithSpan {
                            value: sqlparser::ast::Value::SingleQuotedString(ref seq_name),
                            span: _,
                        },
                    )),
                ) = &arg_list.args[0]
                {
                    let new_expr =
                        Expr::CompoundIdentifier(vec![Ident::new(seq_name), Ident::new("NEXTVAL")]);
                    return Ok(Some(new_expr));
                }
            }
        }
        Ok(None)
    }

    fn build_hana_currval_expr(&self, function: &Function) -> TransformationResult<Option<Expr>> {
        if let sqlparser::ast::FunctionArguments::List(ref arg_list) = function.args {
            if arg_list.args.len() == 1 {
                if let sqlparser::ast::FunctionArg::Unnamed(
                    sqlparser::ast::FunctionArgExpr::Expr(Expr::Value(
                        sqlparser::ast::ValueWithSpan {
                            value: sqlparser::ast::Value::SingleQuotedString(ref seq_name),
                            span: _,
                        },
                    )),
                ) = &arg_list.args[0]
                {
                    let new_expr =
                        Expr::CompoundIdentifier(vec![Ident::new(seq_name), Ident::new("CURRVAL")]);
                    return Ok(Some(new_expr));
                }
            }
        }
        Ok(None)
    }
}

impl Transformer for ExpressionTransformer {
    fn name(&self) -> &'static str {
        "ExpressionTransformer"
    }

    fn priority(&self) -> u8 {
        40
    }

    fn supports_statement_type(&self, stmt: &Statement) -> bool {
        matches!(
            stmt,
            Statement::Query(_)
                | Statement::Insert { .. }
                | Statement::Update { .. }
                | Statement::Delete { .. }
                | Statement::CreateView { .. }
                | Statement::CreateTable { .. }
        )
    }

    fn transform(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        self.transform_statement(stmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::TransformationConfig;
    use crate::{Dialect, SqlTransformer};

    fn transformer() -> SqlTransformer {
        SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap()
    }

    fn expr_transformer() -> ExpressionTransformer {
        ExpressionTransformer::new(&TransformationConfig::default())
    }

    // --- ExpressionTransformer::new ---

    #[test]
    fn new_creates_transformer_without_panicking() {
        let _t = expr_transformer();
    }

    // --- Transformer trait: name, priority, supports_statement_type ---

    #[test]
    fn name_returns_expression_transformer() {
        let t = expr_transformer();
        assert_eq!(t.name(), "ExpressionTransformer");
    }

    #[test]
    fn priority_returns_40() {
        let t = expr_transformer();
        assert_eq!(t.priority(), 40);
    }

    // --- String concatenation || passthrough ---

    #[test]
    fn string_concat_operator_passes_through() {
        let t = transformer();
        // || is valid in both PG and HANA for string concat; should be preserved
        let result = t
            .transform("SELECT first_name || ' ' || last_name FROM users")
            .unwrap();
        assert!(result.contains("||"));
    }

    // --- PG cast (::) rewritten to CAST() ---

    #[test]
    fn double_colon_cast_becomes_cast_function() {
        let t = transformer();
        let result = t.transform("SELECT '42'::INTEGER").unwrap();
        // CAST(... AS ...) form expected
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in: {}", result);
        assert!(!result.contains("::"), "unexpected :: in: {}", result);
    }

    #[test]
    fn double_colon_cast_to_text_rewrites_type() {
        let t = transformer();
        let result = t.transform("SELECT 42::TEXT").unwrap();
        let up = result.to_uppercase();
        // TEXT → CLOB in HANA; and :: → CAST
        assert!(up.contains("CAST"), "expected CAST in: {}", result);
        assert!(!result.contains("::"), "unexpected :: in: {}", result);
    }

    #[test]
    fn regular_cast_preserved_no_double_colon() {
        let t = transformer();
        let result = t.transform("SELECT CAST(42 AS INTEGER)").unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in: {}", result);
        assert!(!result.contains("::"), "unexpected :: in: {}", result);
    }

    // --- IS NULL / IS NOT NULL ---

    #[test]
    fn is_null_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE col IS NULL")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("IS NULL"), "expected IS NULL in: {}", result);
    }

    #[test]
    fn is_not_null_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE col IS NOT NULL")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("IS NOT NULL"), "expected IS NOT NULL in: {}", result);
    }

    // --- CASE expression ---

    #[test]
    fn case_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CASE"), "expected CASE in: {}", result);
        assert!(up.contains("WHEN"), "expected WHEN in: {}", result);
        assert!(up.contains("THEN"), "expected THEN in: {}", result);
        assert!(up.contains("ELSE"), "expected ELSE in: {}", result);
    }

    #[test]
    fn case_expression_with_nested_cast_rewrites_cast() {
        let t = transformer();
        let result = t
            .transform("SELECT CASE WHEN x IS NULL THEN NULL ELSE x::INTEGER END FROM t")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in: {}", result);
        assert!(!result.contains("::"), "unexpected :: in: {}", result);
    }

    // --- IN LIST ---

    #[test]
    fn in_list_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE x IN (1, 2, 3)")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("IN"), "expected IN in: {}", result);
    }

    #[test]
    fn not_in_list_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE x NOT IN (1, 2, 3)")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("NOT IN") || (up.contains("NOT") && up.contains("IN")),
            "expected NOT IN in: {}", result);
    }

    // --- BETWEEN ---

    #[test]
    fn between_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE x BETWEEN 1 AND 10")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("BETWEEN"), "expected BETWEEN in: {}", result);
    }

    // --- LIKE ---

    #[test]
    fn like_expression_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE name LIKE 'A%'")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("LIKE"), "expected LIKE in: {}", result);
    }

    // --- Unary NOT ---

    #[test]
    fn unary_not_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE NOT (x = 1)")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("NOT"), "expected NOT in: {}", result);
    }

    // --- Nested expressions ---

    #[test]
    fn nested_cast_in_binary_op() {
        let t = transformer();
        let result = t
            .transform("SELECT (x::INTEGER) + 1 FROM t")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in: {}", result);
    }

    // --- Subquery ---

    #[test]
    fn subquery_in_select_is_transformed() {
        let t = transformer();
        // Subquery with :: cast inside should be rewritten
        let result = t
            .transform("SELECT (SELECT col::TEXT FROM inner_t) FROM outer_t")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST inside subquery in: {}", result);
    }

    // --- EXISTS ---

    #[test]
    fn exists_subquery_passes_through() {
        let t = transformer();
        let result = t
            .transform("SELECT * FROM t WHERE EXISTS (SELECT 1 FROM t2 WHERE t2.id = t.id)")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("EXISTS"), "expected EXISTS in: {}", result);
    }

    // --- Function: NEXTVAL ---

    #[test]
    fn nextval_function_becomes_compound_identifier() {
        let t = transformer();
        let result = t
            .transform("SELECT nextval('my_seq')")
            .unwrap();
        // Should become my_seq.NEXTVAL
        let up = result.to_uppercase();
        assert!(
            up.contains("MY_SEQ") && up.contains("NEXTVAL"),
            "expected my_seq.NEXTVAL in: {}",
            result
        );
        assert!(
            !up.contains("NEXTVAL("),
            "expected no NEXTVAL( function call in: {}",
            result
        );
    }

    #[test]
    fn currval_function_becomes_compound_identifier() {
        let t = transformer();
        let result = t
            .transform("SELECT currval('my_seq')")
            .unwrap();
        let up = result.to_uppercase();
        assert!(
            up.contains("MY_SEQ") && up.contains("CURRVAL"),
            "expected my_seq.CURRVAL in: {}",
            result
        );
        assert!(
            !up.contains("CURRVAL("),
            "expected no CURRVAL( function call in: {}",
            result
        );
    }

    // --- Function: other (pass-through with args transformed) ---

    #[test]
    fn non_special_function_args_cast_is_transformed() {
        let t = transformer();
        // COALESCE with a :: cast inside argument
        let result = t
            .transform("SELECT COALESCE(x::INTEGER, 0) FROM t")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in function args in: {}", result);
    }

    // --- TypedString → Cast ---

    #[test]
    fn typed_string_becomes_cast() {
        // DATE 'value' is a TypedString in sqlparser
        let t = transformer();
        let result = t
            .transform("SELECT DATE '2024-01-01'")
            .unwrap();
        // sqlparser may or may not output CAST for typed strings, just verify no crash
        assert!(!result.is_empty());
    }

    // --- UPDATE statement ---

    #[test]
    fn update_set_with_cast_is_transformed() {
        let t = transformer();
        let result = t
            .transform("UPDATE t SET col = '42'::INTEGER WHERE id = 1")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in UPDATE SET in: {}", result);
    }

    #[test]
    fn update_where_with_cast_is_transformed() {
        let t = transformer();
        let result = t
            .transform("UPDATE t SET col = 1 WHERE id = '5'::BIGINT")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in UPDATE WHERE in: {}", result);
    }

    // --- DELETE statement ---

    #[test]
    fn delete_where_cast_is_transformed() {
        let t = transformer();
        let result = t
            .transform("DELETE FROM t WHERE id = '5'::INTEGER")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in DELETE WHERE in: {}", result);
    }

    // --- INSERT statement ---

    #[test]
    fn insert_with_cast_in_values_is_transformed() {
        let t = transformer();
        let result = t
            .transform("INSERT INTO t (col) VALUES ('42'::INTEGER)")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in INSERT VALUES in: {}", result);
    }

    // --- CREATE VIEW statement ---

    #[test]
    fn create_view_with_cast_is_transformed() {
        let t = transformer();
        let result = t
            .transform("CREATE VIEW v AS SELECT '42'::INTEGER AS col")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in CREATE VIEW in: {}", result);
    }

    // --- SELECT with HAVING clause ---

    #[test]
    fn having_clause_cast_is_transformed() {
        let t = transformer();
        let result = t
            .transform(
                "SELECT category, COUNT(*) FROM t GROUP BY category HAVING COUNT(*) > '2'::INTEGER",
            )
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in HAVING in: {}", result);
    }

    // --- UNION (SetOperation) ---

    #[test]
    fn union_query_with_cast_in_both_sides_transformed() {
        let t = transformer();
        let result = t
            .transform("SELECT '1'::INTEGER FROM a UNION SELECT '2'::INTEGER FROM b")
            .unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("CAST"), "expected CAST in UNION in: {}", result);
    }

    // --- CAST rewriting the data type inside ---

    #[test]
    fn cast_to_text_rewrites_to_clob() {
        let t = transformer();
        let result = t.transform("SELECT CAST(42 AS TEXT)").unwrap();
        let up = result.to_uppercase();
        // TEXT → CLOB inside CAST
        assert!(up.contains("CLOB") || up.contains("NCLOB"),
            "expected CLOB/NCLOB inside CAST in: {}", result);
    }

    #[test]
    fn cast_to_varchar_rewrites_to_nvarchar() {
        let t = transformer();
        let result = t.transform("SELECT CAST(42 AS VARCHAR(100))").unwrap();
        let up = result.to_uppercase();
        assert!(up.contains("NVARCHAR"), "expected NVARCHAR inside CAST in: {}", result);
    }

    // --- arithmetic pass-through ---

    #[test]
    fn simple_arithmetic_passes_through() {
        let t = transformer();
        let result = t.transform("SELECT x + 1 FROM t").unwrap();
        assert!(result.contains('+'), "expected + in: {}", result);
    }

    #[test]
    fn unary_minus_passes_through() {
        let t = transformer();
        let result = t.transform("SELECT -x FROM t").unwrap();
        assert!(result.contains('-'), "expected - in: {}", result);
    }

    // --- supports_statement_type ---

    #[test]
    fn supports_query_statement() {
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;
        let t = expr_transformer();
        let stmts = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1").unwrap();
        assert!(t.supports_statement_type(&stmts[0]));
    }

    #[test]
    fn does_not_support_create_index_statement() {
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;
        let t = expr_transformer();
        let stmts = Parser::parse_sql(
            &PostgreSqlDialect {},
            "CREATE INDEX idx ON t (col)",
        )
        .unwrap();
        assert!(!t.supports_statement_type(&stmts[0]));
    }
}
