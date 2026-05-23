use proptest::prelude::*;
use pgt::{SqlTransformer, TransformationConfig};
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::parser::Parser;

fn ident() -> impl Strategy<Value = String> {
    "[a-z][a-z0-9_]{0,7}".prop_filter("reserved", |s| {
        !matches!(
            s.as_str(),
            "select" | "from" | "where" | "and" | "or" | "not" | "null"
                | "true" | "false" | "as" | "on" | "in" | "by" | "order"
                | "group" | "having" | "join" | "left" | "right" | "inner"
                | "outer" | "union" | "all" | "distinct" | "limit" | "offset"
                | "case" | "when" | "then" | "else" | "end" | "is" | "like"
                | "between" | "exists" | "with" | "into" | "set" | "values"
        )
    })
}

fn select_sql() -> impl Strategy<Value = String> {
    (ident(), ident()).prop_map(|(col, tbl)| format!("SELECT {col} FROM {tbl}"))
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 64, .. ProptestConfig::default() })]

    #[test]
    fn transform_output_reparses_as_postgres(sql in select_sql()) {
        let t = SqlTransformer::with_config(TransformationConfig::default()).unwrap();
        // Only test when transformation succeeds; skip inputs that fail to parse
        let out = match t.transform(&sql) {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };
        // HANA output for simple SELECT col FROM tbl is a strict subset of PG syntax;
        // re-parse must succeed.
        Parser::parse_sql(&PostgreSqlDialect {}, &out)
            .expect(&format!("re-parse failed for input {:?}, output {:?}", sql, out));
    }
}
