use duckdb::{
    core::{DataChunkHandle, LogicalTypeId, Inserter},
    vtab::arrow::WritableVector,
    vscalar::{VScalar, ScalarFunctionSignature},
};
use std::error::Error;
use std::panic::{self, AssertUnwindSafe};
use crate::HanaError;

/// Word-boundary keywords used to keep `BEGIN…END` blocks intact while splitting.
fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Resolve a completed word against block state.
/// `pending_end` means the previous word was a bare `END` whose role
/// (block-close vs `END IF`/`END WHILE`/…) was not yet known.
///
/// Known limitation: only `BEGIN`/`END` are tracked. A `CASE` expression
/// (which ends in a bare `END`) inside a block, or a bare transaction
/// `BEGIN` in a multi-statement string, can mis-track depth. Neither occurs
/// in the SqlRender HANA output this guards (`DO BEGIN IF EXISTS … END IF; END;`).
fn classify_word(word: &str, block_depth: &mut u32, pending_end: &mut bool) {
    if word.is_empty() {
        return;
    }
    if *pending_end {
        // The previous token was `END`. This word decides its meaning.
        const CONTROL_TERMINATORS: &[&str] = &["if", "case", "loop", "while", "for"];
        *pending_end = false;
        if CONTROL_TERMINATORS.contains(&word) {
            // `END IF` / `END WHILE` / … — closes a control structure, not the block.
            return;
        }
        // The previous `END` closed a BEGIN block.
        *block_depth = block_depth.saturating_sub(1);
        // Fall through: this word may itself be BEGIN/END.
    }
    match word {
        "begin" => *block_depth += 1,
        "end" => *pending_end = true,
        _ => {}
    }
}

pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current_statement = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    // BEGIN…END block tracking so inner `;` (HANA `DO BEGIN … END;`) never splits.
    let mut block_depth: u32 = 0;
    let mut word = String::new();
    let mut pending_end = false;

    while let Some(c) = chars.next() {
        if in_single_quote {
            current_statement.push(c);
            if c == '\'' {
                if chars.peek() == Some(&'\'') {
                    current_statement.push(chars.next().unwrap());
                } else {
                    in_single_quote = false;
                }
            }
            continue;
        }
        if in_double_quote {
            current_statement.push(c);
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current_statement.push(chars.next().unwrap());
                } else {
                    in_double_quote = false;
                }
            }
            continue;
        }

        // Accumulate words for BEGIN/END detection; flush at any non-word char.
        if is_word_char(c) {
            word.push(c.to_ascii_lowercase());
            current_statement.push(c);
            continue;
        }
        // Non-word char: finish the pending word first.
        classify_word(&word, &mut block_depth, &mut pending_end);
        word.clear();

        match c {
            '-' if chars.peek() == Some(&'-') => {
                chars.next();
                for c2 in chars.by_ref() {
                    if c2 == '\n' {
                        current_statement.push('\n');
                        break;
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                chars.next();
                let mut depth = 1u32;
                while depth > 0 {
                    match chars.next() {
                        Some('*') if chars.peek() == Some(&'/') => {
                            chars.next();
                            depth -= 1;
                        }
                        Some('/') if chars.peek() == Some(&'*') => {
                            chars.next();
                            depth += 1;
                        }
                        None => break,
                        _ => {}
                    }
                }
            }
            '\'' => {
                current_statement.push(c);
                in_single_quote = true;
            }
            '"' => {
                current_statement.push(c);
                in_double_quote = true;
            }
            ';' => {
                // A bare `END` immediately before `;` (e.g. `END;`) resolves here.
                if pending_end {
                    block_depth = block_depth.saturating_sub(1);
                    pending_end = false;
                }
                if block_depth > 0 {
                    // Inside a BEGIN…END block: keep the semicolon, don't split.
                    current_statement.push(';');
                } else {
                    let trimmed = current_statement.trim();
                    if !trimmed.is_empty() {
                        statements.push(trimmed.to_string());
                    }
                    current_statement.clear();
                }
            }
            _ => {
                current_statement.push(c);
            }
        }
    }

    // Flush any trailing word (does not affect output, only block state).
    classify_word(&word, &mut block_depth, &mut pending_end);

    let trimmed = current_statement.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }

    statements
}

pub struct HanaExecuteScalar;

impl VScalar for HanaExecuteScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let connection_string_vector = input.flat_vector(0);
        let sql_statement_vector = input.flat_vector(1);
        
        let connection_string_slice = connection_string_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let sql_statement_slice = sql_statement_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        
        let connection_string = {
            let mut binding = connection_string_slice[0];
            duckdb::types::DuckString::new(&mut binding).as_str().to_string()
        };
        
        let sql_statement = {
            let mut binding = sql_statement_slice[0];
            duckdb::types::DuckString::new(&mut binding).as_str().to_string()
        };

        let session_id = if input.num_columns() > 2 {
            let session_id_vector = input.flat_vector(2);
            let session_id_slice = session_id_vector.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
            let session_id_str = {
                let mut binding = session_id_slice[0];
                duckdb::types::DuckString::new(&mut binding).as_str().to_string()
            };
            crate::hana_session_pool::parse_session_id(&session_id_str)
        } else {
            0
        };

        let statements_executed = execute_hana_statement(&connection_string, &sql_statement, session_id)?;
        let result = format!("{} statement(s) executed", statements_executed);

        let flat_vector = output.flat_vector();
        flat_vector.insert(0, &result);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into()
            ),
            ScalarFunctionSignature::exact(
                vec![
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                    LogicalTypeId::Varchar.into(),
                ],
                LogicalTypeId::Varchar.into()
            ),
        ]
    }
}

/// hdbconnect 0.31's `prepare().execute()` (and `.statement()`/`.dml()`/`.exec()`)
/// reject any statement HANA answers with an affected-row-count — e.g.
/// `CREATE TABLE ... AS SELECT` — with the client-side error "found an
/// affected-row-count > 0, expected a single Success", even though the statement
/// DID execute on HANA. This identifies that specific client-side limitation so
/// it can be treated as a successful execution rather than a real failure.
fn is_benign_affected_rowcount_error(msg: &str) -> bool {
    msg.contains("affected-row-count") && msg.contains("expected a single Success")
}

fn execute_hana_statement(connection_string: &str, sql_statement: &str, session_id: u64) -> Result<usize, Box<dyn Error>> {
    let connection = match panic::catch_unwind(AssertUnwindSafe(|| {
        crate::hana_session_pool::get_or_create(session_id, connection_string)
    })) {
        Ok(Ok(conn)) => conn,
        Ok(Err(e)) => return Err(Box::new(HanaError::connection(
            &format!("Connection failed: {}", e),
            None,
            None,
            "execute_hana_statement"
        ))),
        Err(panic_err) => {
            let panic_msg = if let Some(s) = panic_err.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_err.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic during HANA connection".to_string()
            };
            return Err(Box::new(HanaError::connection(
                &format!("Connection panicked: {}", panic_msg),
                None,
                None,
                "execute_hana_statement"
            )));
        }
    };

    let statements = split_sql_statements(sql_statement);

    if statements.is_empty() {
        return Ok(0);
    }

    let mut total_affected = 0usize;

    for (idx, stmt) in statements.iter().enumerate() {
        match connection.prepare(stmt) {
            Ok(mut prepared) => {
                match prepared.execute(&()) {
                    Ok(_) => {
                        total_affected += 1;
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        if is_benign_affected_rowcount_error(&msg) {
                            crate::HanaLogger::warn(
                                "execute_hana_statement",
                                &format!(
                                    "Statement {} of {} returned an affected-row-count; hdbconnect 0.31 reports this as an error but HANA executed it — treating as success: {}",
                                    idx + 1,
                                    statements.len(),
                                    msg
                                ),
                            );
                            total_affected += 1;
                        } else {
                            return Err(Box::new(HanaError::query(
                                &format!("Failed to execute statement {} of {}: {}", idx + 1, statements.len(), e),
                                Some(stmt),
                                None,
                                "execute_hana_statement"
                            )));
                        }
                    }
                }
            }
            Err(e) => return Err(Box::new(HanaError::query(
                &format!("Failed to prepare statement {} of {}: {}", idx + 1, statements.len(), e),
                Some(stmt),
                None,
                "execute_hana_statement"
            )))
        }
    }

    Ok(total_affected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_single_statement() {
        let sql = "SELECT * FROM users";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT * FROM users"]);
    }

    #[test]
    fn test_split_single_statement_with_trailing_semicolon() {
        let sql = "SELECT * FROM users;";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT * FROM users"]);
    }

    #[test]
    fn test_split_multiple_statements() {
        let sql = "SELECT * FROM users; INSERT INTO logs (msg) VALUES ('test'); DELETE FROM temp";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            "SELECT * FROM users",
            "INSERT INTO logs (msg) VALUES ('test')",
            "DELETE FROM temp"
        ]);
    }

    #[test]
    fn test_semicolon_in_single_quoted_string() {
        let sql = "SELECT * FROM users WHERE name = 'hello;world'; SELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            "SELECT * FROM users WHERE name = 'hello;world'",
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_semicolon_in_double_quoted_identifier() {
        let sql = r#"SELECT * FROM "table;name"; SELECT 1"#;
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            r#"SELECT * FROM "table;name""#,
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_escaped_single_quotes() {
        let sql = "INSERT INTO t (col) VALUES ('it''s a ; test'); SELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            "INSERT INTO t (col) VALUES ('it''s a ; test')",
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_escaped_double_quotes() {
        let sql = r#"SELECT * FROM "say ""hello;world"""; SELECT 1"#;
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            r##"SELECT * FROM "say ""hello;world""""##,
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_mixed_quotes() {
        let sql = r#"SELECT 'semicolon "in" single;quotes' FROM "double;quotes"; SELECT 1"#;
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            r#"SELECT 'semicolon "in" single;quotes' FROM "double;quotes""#,
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_empty_statements_are_skipped() {
        let sql = "SELECT 1;; ; SELECT 2";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn test_whitespace_only_statements_are_skipped() {
        let sql = "SELECT 1;   \n\t  ; SELECT 2";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn test_empty_input() {
        let sql = "";
        let result = split_sql_statements(sql);
        assert!(result.is_empty());
    }

    #[test]
    fn test_whitespace_only_input() {
        let sql = "   \n\t  ";
        let result = split_sql_statements(sql);
        assert!(result.is_empty());
    }

    #[test]
    fn test_multiline_statements() {
        let sql = "CREATE TABLE foo (\n  id INT,\n  name VARCHAR(100)\n);\nINSERT INTO foo VALUES (1, 'test')";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            "CREATE TABLE foo (\n  id INT,\n  name VARCHAR(100)\n)",
            "INSERT INTO foo VALUES (1, 'test')"
        ]);
    }

    #[test]
    fn test_line_comment_stripped() {
        let sql = "-- this is a comment\nSELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1"]);
    }

    #[test]
    fn test_line_comment_after_statement() {
        let sql = "SELECT 1; -- trailing comment\nSELECT 2";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn test_line_comment_between_statements() {
        let sql = "SELECT 1;\n-- middle comment\nSELECT 2";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn test_block_comment_stripped() {
        let sql = "/* block comment */ SELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1"]);
    }

    #[test]
    fn test_block_comment_between_statements() {
        let sql = "SELECT 1; /* comment */ SELECT 2";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    #[test]
    fn test_nested_block_comments() {
        let sql = "/* outer /* inner */ still comment */ SELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec!["SELECT 1"]);
    }

    #[test]
    fn test_comment_like_in_single_quotes_preserved() {
        let sql = "SELECT '-- not a comment' FROM t; SELECT 1";
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            "SELECT '-- not a comment' FROM t",
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_comment_like_in_double_quotes_preserved() {
        let sql = r#"SELECT * FROM "/* not a comment */"; SELECT 1"#;
        let result = split_sql_statements(sql);
        assert_eq!(result, vec![
            r#"SELECT * FROM "/* not a comment */""#,
            "SELECT 1"
        ]);
    }

    #[test]
    fn test_only_comments() {
        let sql = "-- just a comment\n/* another comment */";
        let result = split_sql_statements(sql);
        assert!(result.is_empty());
    }

    #[test]
    fn benign_affected_rowcount_error_detected() {
        // The exact hdbconnect 0.31 message for CREATE TABLE AS SELECT etc.
        assert!(is_benign_affected_rowcount_error(
            "Implementation error: found an affected-row-count > 0, expected a single Success"
        ));
    }

    #[test]
    fn real_hana_errors_not_treated_as_benign() {
        assert!(!is_benign_affected_rowcount_error(
            "invalid table name: Could not find table/view FOO in schema BAR"
        ));
        assert!(!is_benign_affected_rowcount_error("syntax error near 'SELCT'"));
        assert!(!is_benign_affected_rowcount_error(""));
        // Must require BOTH markers, not just one.
        assert!(!is_benign_affected_rowcount_error("affected-row-count was 5"));
        assert!(!is_benign_affected_rowcount_error("expected a single Success row"));
    }

    #[test]
    fn keeps_hana_anonymous_block_intact() {
        let sql = "DO BEGIN IF EXISTS (SELECT 1 FROM tables WHERE x=UPPER('s.t')) \
                   THEN DROP TABLE s.t; END IF; END;";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 1, "block must stay one statement, got {out:?}");
        assert!(out[0].contains("END IF") && out[0].trim_end().ends_with("END"));
    }

    #[test]
    fn keeps_block_then_splits_following_statement() {
        let sql = "DO BEGIN DECLARE v INT = 1; END;\nCREATE TABLE s.t (id INT);";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 2, "got {out:?}");
        assert!(out[0].starts_with("DO BEGIN"));
        assert!(out[1].starts_with("CREATE TABLE"));
    }

    #[test]
    fn handles_nested_begin_end() {
        let sql = "DO BEGIN BEGIN INSERT INTO a VALUES (1); END; INSERT INTO b VALUES (2); END;";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 1, "got {out:?}");
    }

    #[test]
    fn plain_statements_still_split() {
        assert_eq!(
            split_sql_statements("SELECT 1; SELECT 2"),
            vec!["SELECT 1", "SELECT 2"]
        );
    }

    #[test]
    fn semicolon_in_string_inside_block_is_safe() {
        let sql = "DO BEGIN INSERT INTO a VALUES ('x;y'); END;";
        let out = split_sql_statements(sql);
        assert_eq!(out.len(), 1, "got {out:?}");
    }
}
