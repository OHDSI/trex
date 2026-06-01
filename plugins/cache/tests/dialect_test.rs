use cache::dialect::Dialect;
use cache::dialect::{build_attach_sql, default_target};

#[test]
fn parses_known_dialects_case_insensitively() {
    assert_eq!(Dialect::from_str("postgres").unwrap(), Dialect::Postgres);
    assert_eq!(Dialect::from_str("POSTGRES").unwrap(), Dialect::Postgres);
    assert_eq!(Dialect::from_str("mysql").unwrap(), Dialect::MySql);
    assert_eq!(Dialect::from_str("sqlite").unwrap(), Dialect::Sqlite);
    assert_eq!(Dialect::from_str("bigquery").unwrap(), Dialect::BigQuery);
}

#[test]
fn rejects_unknown_dialect() {
    let err = Dialect::from_str("oracle").unwrap_err();
    assert!(err.contains("oracle"), "error should name the bad dialect: {err}");
}

#[test]
fn exposes_attach_type_and_name() {
    assert_eq!(Dialect::Postgres.attach_type(), "postgres");
    assert_eq!(Dialect::Postgres.name(), "postgres");
    assert_eq!(Dialect::MySql.attach_type(), "mysql");
}

#[test]
fn builds_attach_sql_with_read_only_for_postgres() {
    let sql = build_attach_sql(Dialect::Postgres, "host=db dbname=app", "src_1");
    assert_eq!(
        sql,
        "ATTACH 'host=db dbname=app' AS \"src_1\" (TYPE postgres, READ_ONLY)"
    );
}

#[test]
fn builds_attach_sql_without_read_only_for_bigquery() {
    let sql = build_attach_sql(Dialect::BigQuery, "project=my-proj", "src_1");
    assert_eq!(sql, "ATTACH 'project=my-proj' AS \"src_1\" (TYPE bigquery)");
}

#[test]
fn escapes_single_quotes_in_connection_string() {
    let sql = build_attach_sql(Dialect::Sqlite, "/tmp/o'brien.db", "src_1");
    assert_eq!(sql, "ATTACH '/tmp/o''brien.db' AS \"src_1\" (TYPE sqlite, READ_ONLY)");
}

#[test]
fn default_target_is_dialect_underscore_schema() {
    assert_eq!(default_target(Dialect::Postgres, "public"), "postgres_public");
    assert_eq!(default_target(Dialect::Sqlite, "main"), "sqlite_main");
}
