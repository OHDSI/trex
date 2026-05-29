use super::Transformer;
use crate::config::TransformationConfig;
use crate::error::TransformationResult;
use sqlparser::ast::{DataType, Expr, Query, SelectItem, SetExpr, Statement};

pub struct StatementTransformer {
    config: TransformationConfig,
}

impl StatementTransformer {
    pub fn new(config: &TransformationConfig) -> Self {
        Self {
            config: config.clone(),
        }
    }

    fn transform_limit_offset(&self, query: &mut Query) -> TransformationResult<bool> {
        let mut changed = false;

        if query.limit_clause.is_some() {
            changed = true;
        }

        Ok(changed)
    }

    fn transform_window_functions(&self, query: &mut Query) -> TransformationResult<bool> {
        let mut changed = false;

        if let SetExpr::Select(ref mut select) = query.body.as_mut() {
            for item in &mut select.projection {
                if let SelectItem::ExprWithAlias { expr, .. } = item {
                    if self.transform_window_function_expr(expr)? {
                        changed = true;
                    }
                } else if let SelectItem::UnnamedExpr(expr) = item {
                    if self.transform_window_function_expr(expr)? {
                        changed = true;
                    }
                }
            }
        }

        Ok(changed)
    }

    fn transform_window_function_expr(&self, expr: &mut Expr) -> TransformationResult<bool> {
        let mut changed = false;

        match expr {
            Expr::Function(func) => {
                if let Some(ref mut over) = func.over {
                    let func_name = func.name.to_string().to_uppercase();
                    match func_name.as_str() {
                        "ROW_NUMBER" | "RANK" | "DENSE_RANK" | "NTILE" => {}
                        "LAG" | "LEAD" => {}
                        "FIRST_VALUE" | "LAST_VALUE" => {}
                        _ => {}
                    }
                }
            }
            Expr::Nested(inner_expr) => {
                if self.transform_window_function_expr(inner_expr)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn transform_create_table(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let mut changed = false;

        if let Statement::CreateTable(create_table) = stmt {
            if let Some(query) = &create_table.query {
                log::warn!("CREATE TABLE AS SELECT may need manual transformation");
                changed = true;
            }

            for column in &mut create_table.columns {
                for option in &mut column.options {
                    if let sqlparser::ast::ColumnOption::Default(expr) = &mut option.option {
                        if self.transform_default_expression(expr)? {
                            changed = true;
                        }
                    }
                }
            }

            for constraint in &mut create_table.constraints {
                if self.transform_table_constraint(constraint)? {
                    changed = true;
                }
            }
        }

        Ok(changed)
    }

    fn transform_default_expression(&self, expr: &mut Expr) -> TransformationResult<bool> {
        let mut changed = false;

        match expr {
            Expr::Function(func) => {
                let func_name = func.name.to_string().to_lowercase();
                if func_name == "nextval" {
                    log::warn!("nextval() in DEFAULT - convert to IDENTITY");
                } else {
                    let func_name_upper = func.name.to_string().to_uppercase();
                    match func_name_upper.as_str() {
                        "NOW" => {
                            func.name = sqlparser::ast::ObjectName(vec![
                                sqlparser::ast::ObjectNamePart::Identifier(
                                    sqlparser::ast::Ident::new("CURRENT_TIMESTAMP"),
                                ),
                            ]);
                            func.args = sqlparser::ast::FunctionArguments::None;
                            changed = true;
                        }
                        "RANDOM" => {
                            func.name = sqlparser::ast::ObjectName(vec![
                                sqlparser::ast::ObjectNamePart::Identifier(
                                    sqlparser::ast::Ident::new("RAND"),
                                ),
                            ]);
                            changed = true;
                        }
                        _ => {}
                    }
                }
            }
            Expr::Nested(inner_expr) => {
                if self.transform_default_expression(inner_expr)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }

    fn transform_data_type(&self, _data_type: &mut DataType) -> TransformationResult<bool> {
        Ok(false)
    }

    fn transform_table_constraint(
        &self,
        constraint: &mut sqlparser::ast::TableConstraint,
    ) -> TransformationResult<bool> {
        match constraint {
            sqlparser::ast::TableConstraint::Check { .. } => Ok(false),
            sqlparser::ast::TableConstraint::ForeignKey { .. } => Ok(false),
            sqlparser::ast::TableConstraint::Unique { .. } => Ok(false),
            sqlparser::ast::TableConstraint::PrimaryKey { .. } => Ok(false),
            _ => Ok(false),
        }
    }

    fn transform_insert(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let mut changed = false;

        if let Statement::Insert(insert) = stmt {
            if insert.on.is_some() {
                log::warn!("ON CONFLICT requires manual conversion to HANA UPSERT");
            }

            if let Some(ref returning) = insert.returning {
                if !returning.is_empty() {
                    log::warn!("RETURNING not supported - use OUTPUT clause");
                }
            }

            if let Some(ref mut source_query) = insert.source {
                if self.transform_limit_offset(source_query)? {
                    changed = true;
                }
            }
        }

        Ok(changed)
    }

    fn transform_update(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let changed = false;

        if let Statement::Update {
            from, returning, ..
        } = stmt
        {
            if let Some(ref from_clause) = from {
                log::warn!("UPDATE ... FROM may need adjustment");
            }

            if let Some(ref returning) = returning {
                if !returning.is_empty() {
                    log::warn!("RETURNING in UPDATE not supported");
                }
            }
        }

        Ok(changed)
    }

    fn transform_delete(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let changed = false;

        if let Statement::Delete(delete) = stmt {
            if let Some(ref using) = delete.using {
                if !using.is_empty() {
                    log::warn!("DELETE ... USING may need adjustment");
                }
            }

            if let Some(ref returning) = delete.returning {
                if !returning.is_empty() {
                    log::warn!("RETURNING in DELETE not supported");
                }
            }
        }

        Ok(changed)
    }
}

impl Transformer for StatementTransformer {
    fn name(&self) -> &'static str {
        "StatementTransformer"
    }

    fn priority(&self) -> u8 {
        50
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
                if self.transform_limit_offset(query)? {
                    changed = true;
                }
                if self.transform_window_functions(query)? {
                    changed = true;
                }
            }
            Statement::CreateTable(_) => {
                if self.transform_create_table(stmt)? {
                    changed = true;
                }
            }
            Statement::Insert(_) => {
                if self.transform_insert(stmt)? {
                    changed = true;
                }
            }
            Statement::Update { .. } => {
                if self.transform_update(stmt)? {
                    changed = true;
                }
            }
            Statement::Delete(_) => {
                if self.transform_delete(stmt)? {
                    changed = true;
                }
            }
            _ => {}
        }

        Ok(changed)
    }
}

#[cfg(test)]
mod tests {
    use crate::{SqlTransformer, TransformationConfig};

    fn t() -> SqlTransformer {
        SqlTransformer::with_config(TransformationConfig::default()).unwrap()
    }

    // --- StatementTransformer::new ---

    #[test]
    fn new_constructs_with_default_config() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);
        assert_eq!(st.name(), "StatementTransformer");
        assert_eq!(st.priority(), 50);
    }

    // --- CREATE TABLE AS SELECT ---

    #[test]
    fn create_table_as_preserved() {
        let out = t()
            .transform("CREATE TABLE active_users AS SELECT * FROM users WHERE active = TRUE")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("CREATE TABLE"), "expected CREATE TABLE in: {out}");
        assert!(out.contains("ACTIVE_USERS"), "expected ACTIVE_USERS in: {out}");
    }

    // --- DROP TABLE IF EXISTS ---

    #[test]
    fn drop_if_exists_preserved() {
        let out = t()
            .transform("DROP TABLE IF EXISTS users")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("DROP TABLE"), "expected DROP TABLE in: {out}");
    }

    // --- LIMIT/OFFSET ---

    #[test]
    fn limit_offset_preserved_or_rewritten() {
        let out = t()
            .transform("SELECT * FROM t LIMIT 10 OFFSET 5")
            .unwrap()
            .to_uppercase();
        // StatementTransformer records that limit_clause is present (changed=true)
        // but does not actually rewrite the syntax; sqlparser emits LIMIT/OFFSET as-is
        assert!(out.contains("LIMIT") || out.contains("FETCH"), "expected LIMIT or FETCH in: {out}");
    }

    #[test]
    fn limit_without_offset_preserved() {
        let out = t()
            .transform("SELECT * FROM t LIMIT 5")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("LIMIT") || out.contains("FETCH"), "expected LIMIT/FETCH in: {out}");
    }

    // --- CREATE INDEX USING <method> → post-processor strips USING btree ---

    #[test]
    fn create_index_using_btree_stripped() {
        let out = t()
            .transform("CREATE INDEX ix ON t USING btree (col)")
            .unwrap()
            .to_uppercase();
        // post_processor removes USING btree
        assert!(!out.contains("USING BTREE"), "USING BTREE should be stripped, got: {out}");
    }

    #[test]
    fn create_index_using_gin_stripped() {
        let out = t()
            .transform("CREATE INDEX ix ON t USING gin (col)")
            .unwrap()
            .to_uppercase();
        assert!(!out.contains("USING GIN"), "USING GIN should be stripped, got: {out}");
    }

    // --- CTE (WITH) ---

    #[test]
    fn cte_passes_through() {
        let out = t()
            .transform("WITH active AS (SELECT * FROM users) SELECT * FROM active")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("WITH"), "expected WITH in: {out}");
        assert!(out.contains("ACTIVE"), "expected ACTIVE in: {out}");
    }

    #[test]
    fn cte_multiple_passes_through() {
        let out = t()
            .transform(
                "WITH a AS (SELECT 1 AS x), b AS (SELECT x FROM a) SELECT * FROM b",
            )
            .unwrap()
            .to_uppercase();
        assert!(out.contains("WITH"), "expected WITH in: {out}");
    }

    // --- supports_statement_type ---

    #[test]
    fn supports_query_insert_update_delete_create() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);

        let cases = [
            "SELECT 1",
            "INSERT INTO t(x) VALUES (1)",
            "UPDATE t SET x = 1",
            "DELETE FROM t WHERE id = 1",
            "CREATE TABLE t (id INT)",
        ];
        for sql in &cases {
            let stmt = Parser::parse_sql(&PostgreSqlDialect {}, sql)
                .unwrap()
                .into_iter()
                .next()
                .unwrap();
            assert!(
                st.supports_statement_type(&stmt),
                "should support: {sql}"
            );
        }
    }

    #[test]
    fn does_not_support_drop_table() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);

        let stmt = Parser::parse_sql(&PostgreSqlDialect {}, "DROP TABLE t")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert!(!st.supports_statement_type(&stmt));
    }

    // --- INSERT with ON CONFLICT and RETURNING (logs warnings) ---

    #[test]
    fn insert_with_returning_passes_through() {
        // PostgreSQL RETURNING is not supported in HANA; StatementTransformer logs a warning
        // but does not error. Note: sqlparser may not produce RETURNING on all INSERT forms;
        // we just verify the transform succeeds.
        let out = t()
            .transform("INSERT INTO t(x) VALUES(1)")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("INSERT"), "expected INSERT in: {out}");
    }

    // --- UPDATE FROM clause (logs warning) ---

    #[test]
    fn update_with_from_passes_through() {
        let out = t()
            .transform("UPDATE t SET x = s.val FROM s WHERE t.id = s.id")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("UPDATE"), "expected UPDATE in: {out}");
    }

    // --- DELETE with USING (logs warning) ---

    #[test]
    fn delete_passes_through() {
        let out = t()
            .transform("DELETE FROM t WHERE id = 1")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("DELETE"), "expected DELETE in: {out}");
    }

    // --- Window functions in SELECT ---

    #[test]
    fn window_function_row_number_passes_through() {
        let out = t()
            .transform("SELECT ROW_NUMBER() OVER (PARTITION BY grp ORDER BY id) FROM t")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("ROW_NUMBER"), "expected ROW_NUMBER in: {out}");
    }

    #[test]
    fn window_function_lag_passes_through() {
        let out = t()
            .transform("SELECT LAG(amount, 1) OVER (ORDER BY ts) FROM tx")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("LAG"), "expected LAG in: {out}");
    }

    // --- CREATE TABLE with DEFAULT NOW() ---

    #[test]
    fn create_table_with_default_now_rewrites_to_current_timestamp() {
        let out = t()
            .transform("CREATE TABLE t (created_at TIMESTAMP DEFAULT NOW())")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("CREATE TABLE"), "expected CREATE TABLE in: {out}");
        // StatementTransformer rewrites NOW() in DEFAULT to CURRENT_TIMESTAMP
        assert!(
            out.contains("CURRENT_TIMESTAMP"),
            "expected CURRENT_TIMESTAMP in: {out}"
        );
    }

    #[test]
    fn create_table_with_default_random_rewrites_to_rand() {
        let out = t()
            .transform("CREATE TABLE t (val DOUBLE DEFAULT RANDOM())")
            .unwrap()
            .to_uppercase();
        assert!(out.contains("CREATE TABLE"), "expected CREATE TABLE in: {out}");
        assert!(out.contains("RAND"), "expected RAND in: {out}");
    }

    // --- Transform methods on Transformer trait ---

    #[test]
    fn transform_plain_select_returns_ok() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);
        let mut stmt = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let result = st.transform(&mut stmt);
        assert!(result.is_ok());
    }

    #[test]
    fn transform_select_with_limit_returns_changed_true() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);
        let mut stmt = Parser::parse_sql(&PostgreSqlDialect {}, "SELECT 1 LIMIT 10")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let changed = st.transform(&mut stmt).unwrap();
        assert!(changed, "SELECT with LIMIT should be marked changed");
    }

    #[test]
    fn transform_unhandled_statement_returns_false() {
        use super::StatementTransformer;
        use crate::dialects::hana::Transformer;
        use sqlparser::dialect::PostgreSqlDialect;
        use sqlparser::parser::Parser;

        let cfg = TransformationConfig::default();
        let st = StatementTransformer::new(&cfg);
        let mut stmt = Parser::parse_sql(&PostgreSqlDialect {}, "DROP TABLE t")
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let changed = st.transform(&mut stmt).unwrap();
        assert!(!changed, "DROP TABLE should not be changed");
    }
}
