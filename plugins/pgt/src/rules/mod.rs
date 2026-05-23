pub mod mappings;
pub mod patterns;

use crate::config::RulesConfig;
use crate::error::{TransformationError, TransformationResult};
use sqlparser::ast::Statement;
use std::collections::HashMap;

pub struct TransformationRules {
    data_type_rules: HashMap<String, String>,
    function_rules: HashMap<String, String>,
    pattern_rules: Vec<PatternRule>,
    validation_rules: Vec<ValidationRule>,
    config: RulesConfig,
}

#[derive(Debug, Clone)]
pub struct ValidationRule {
    pub name: String,
    pub description: String,
    pub check: fn(&Statement) -> Result<(), String>,
    pub suggestion: String,
}

#[derive(Debug, Clone)]
pub struct PostTransformationRule {
    pub name: String,
    pub pattern: String,
    pub replacement: String,
    pub enabled: bool,
}

impl TransformationRules {
    pub fn new(config: RulesConfig) -> Self {
        let mut rules = Self {
            data_type_rules: HashMap::new(),
            function_rules: HashMap::new(),
            pattern_rules: Vec::new(),
            validation_rules: Vec::new(),
            config,
        };

        rules.initialize_validation_rules();

        rules
    }

    fn initialize_validation_rules(&mut self) {
        self.validation_rules.push(ValidationRule {
            name: "single_identity_column".to_string(),
            description: "HANA allows only one IDENTITY column per table".to_string(),
            check: Self::check_single_identity_column,
            suggestion: "Use sequences for additional columns".to_string(),
        });

        self.validation_rules.push(ValidationRule {
            name: "no_pg_extensions".to_string(),
            description: "PostgreSQL extensions not supported".to_string(),
            check: Self::check_no_extensions,
            suggestion: "Remove PostgreSQL extensions".to_string(),
        });

        self.validation_rules.push(ValidationRule {
            name: "hana_reserved_words".to_string(),
            description: "Avoid HANA reserved words".to_string(),
            check: Self::check_reserved_words,
            suggestion: "Quote or rename identifiers".to_string(),
        });
    }

    pub fn validate_hana_compatibility(
        &self,
        statements: &[Statement],
    ) -> TransformationResult<()> {
        if !self.config.validate_hana_compatibility {
            return Ok(());
        }

        let mut violations = Vec::new();
        let mut suggestions = Vec::new();

        for statement in statements {
            for rule in &self.validation_rules {
                if let Err(violation) = (rule.check)(statement) {
                    violations.push(format!("{}: {}", rule.name, violation));
                    suggestions.push(rule.suggestion.clone());
                }
            }
        }

        if !violations.is_empty() && self.config.enable_strict_mode {
            return Err(TransformationError::ValidationError {
                hana_rule_violations: violations,
                suggestions,
            });
        }

        Ok(())
    }

    fn check_single_identity_column(stmt: &Statement) -> Result<(), String> {
        use sqlparser::ast::{ColumnOption, GeneratedAs, Statement};

        if let Statement::CreateTable(create_table) = stmt {
            let identity_count = create_table
                .columns
                .iter()
                .filter(|col| {
                    col.options.iter().any(|opt| {
                        matches!(
                            opt.option,
                            ColumnOption::Generated {
                                generated_as: GeneratedAs::Always | GeneratedAs::ByDefault,
                                ..
                            }
                        )
                    })
                })
                .count();

            if identity_count > 1 {
                return Err(format!(
                    "Table '{}' has {} IDENTITY columns, but HANA allows only one",
                    create_table.name, identity_count
                ));
            }
        }

        Ok(())
    }

    fn check_no_extensions(stmt: &Statement) -> Result<(), String> {
        let stmt_str = stmt.to_string().to_uppercase();
        if stmt_str.contains("CREATE EXTENSION") {
            return Err("PostgreSQL extensions are not supported in HANA".to_string());
        }
        Ok(())
    }

    fn check_reserved_words(stmt: &Statement) -> Result<(), String> {
        let reserved_words = get_hana_reserved_words();
        let stmt_str = stmt.to_string().to_uppercase();

        for word in &reserved_words {
            if stmt_str.contains(&format!(" {} ", word)) || stmt_str.contains(&format!("({}", word))
            {
                return Err(format!("'{}' is HANA reserved", word));
            }
        }

        Ok(())
    }

    pub fn apply_transformation_rules(&self, sql: &str) -> TransformationResult<String> {
        let mut result = sql.to_string();

        if *self
            .config
            .transformation_rules
            .get("remove_pg_extensions")
            .unwrap_or(&false)
        {
            result = self.remove_postgresql_extensions(&result);
        }

        if *self
            .config
            .transformation_rules
            .get("preserve_comments")
            .unwrap_or(&true)
        {
        }

        if *self
            .config
            .transformation_rules
            .get("convert_arrays_to_json")
            .unwrap_or(&false)
        {
            result = self.convert_arrays_to_json(&result);
        }

        Ok(result)
    }

    fn remove_postgresql_extensions(&self, sql: &str) -> String {
        use regex::Regex;

        let extension_regex = Regex::new(r"(?i)CREATE\s+EXTENSION[^;]*;").unwrap();
        extension_regex
            .replace_all(sql, |caps: &regex::Captures| format!("-- {}", &caps[0]))
            .to_string()
    }

    fn convert_arrays_to_json(&self, sql: &str) -> String {
        use regex::Regex;

        let array_regex = Regex::new(r"(?i)TEXT\[\]").unwrap();
        let mut result = array_regex.replace_all(sql, "NCLOB").to_string();

        let array_literal_regex = Regex::new(r"ARRAY\[([^\]]+)\]").unwrap();
        result = array_literal_regex
            .replace_all(&result, r#"'[$1]'"#)
            .to_string();

        result
    }

    pub fn add_data_type_rule(&mut self, from: String, to: String) {
        self.data_type_rules.insert(from, to);
    }

    pub fn add_function_rule(&mut self, from: String, to: String) {
        self.function_rules.insert(from, to);
    }

    pub fn add_pattern_rule(&mut self, rule: PatternRule) {
        self.pattern_rules.push(rule);
    }

    pub fn get_data_type_mapping(&self, data_type: &str) -> Option<&String> {
        self.data_type_rules.get(data_type)
    }

    pub fn get_function_mapping(&self, function: &str) -> Option<&String> {
        self.function_rules.get(function)
    }

    pub fn get_pattern_rules(&self) -> &[PatternRule] {
        &self.pattern_rules
    }
}

impl Default for TransformationRules {
    fn default() -> Self {
        Self::new(RulesConfig::default())
    }
}

fn get_hana_reserved_words() -> Vec<String> {
    vec![
        "OBJECT".to_string(),
        "SYSTEM".to_string(),
        "VIEW".to_string(),
        "TABLE".to_string(),
        "INDEX".to_string(),
        "SCHEMA".to_string(),
        "USER".to_string(),
        "GROUP".to_string(),
        "ROLE".to_string(),
        "PROCEDURE".to_string(),
        "FUNCTION".to_string(),
        "TRIGGER".to_string(),
        "SEQUENCE".to_string(),
        "TYPE".to_string(),
        "DOMAIN".to_string(),
        "CONSTRAINT".to_string(),
        "PRIMARY".to_string(),
        "FOREIGN".to_string(),
        "UNIQUE".to_string(),
        "CHECK".to_string(),
        "DEFAULT".to_string(),
        "IDENTITY".to_string(),
        "GENERATED".to_string(),
        "ALWAYS".to_string(),
        "ORDER".to_string(),
        "GROUP".to_string(),
        "HAVING".to_string(),
        "WHERE".to_string(),
        "SELECT".to_string(),
        "FROM".to_string(),
        "INSERT".to_string(),
        "UPDATE".to_string(),
        "DELETE".to_string(),
        "CREATE".to_string(),
        "ALTER".to_string(),
        "DROP".to_string(),
        "GRANT".to_string(),
        "REVOKE".to_string(),
    ]
}

pub struct PatternRule {
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub replacement: String,
    pub conditions: Vec<RuleCondition>,
}

pub enum RuleCondition {
    StatementType(String),
    ContextContains(String),
    NotInContext(String),
}

impl PatternRule {
    pub fn new(name: &str, description: &str, pattern: &str, replacement: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            pattern: pattern.to_string(),
            replacement: replacement.to_string(),
            conditions: Vec::new(),
        }
    }

    pub fn with_condition(mut self, condition: RuleCondition) -> Self {
        self.conditions.push(condition);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::RulesConfig;
    use sqlparser::dialect::PostgreSqlDialect;
    use sqlparser::parser::Parser;

    fn rules() -> TransformationRules {
        TransformationRules::new(RulesConfig::default())
    }

    fn parse(sql: &str) -> Vec<Statement> {
        Parser::parse_sql(&PostgreSqlDialect {}, sql).expect("failed to parse SQL")
    }

    // ---- TransformationRules::new ----

    #[test]
    fn new_creates_empty_rules() {
        let r = rules();
        assert!(r.get_data_type_mapping("ANYTHING").is_none());
        assert!(r.get_function_mapping("ANYTHING").is_none());
        assert!(r.get_pattern_rules().is_empty());
    }

    #[test]
    fn default_impl_creates_rules() {
        let r = TransformationRules::default();
        assert!(r.get_pattern_rules().is_empty());
    }

    // ---- add/get data type rule ----

    #[test]
    fn add_and_get_data_type_rule() {
        let mut r = rules();
        r.add_data_type_rule("SERIAL".into(), "INTEGER GENERATED ALWAYS AS IDENTITY".into());
        assert_eq!(
            r.get_data_type_mapping("SERIAL").map(|s| s.as_str()),
            Some("INTEGER GENERATED ALWAYS AS IDENTITY"),
        );
    }

    #[test]
    fn get_data_type_mapping_returns_none_for_unknown() {
        let r = rules();
        assert!(r.get_data_type_mapping("UNICORN").is_none());
    }

    #[test]
    fn overwrite_data_type_rule_takes_new_value() {
        let mut r = rules();
        r.add_data_type_rule("TEXT".into(), "NCLOB".into());
        r.add_data_type_rule("TEXT".into(), "NVARCHAR(MAX)".into());
        assert_eq!(
            r.get_data_type_mapping("TEXT").map(|s| s.as_str()),
            Some("NVARCHAR(MAX)"),
        );
    }

    // ---- add/get function rule ----

    #[test]
    fn add_and_get_function_rule() {
        let mut r = rules();
        r.add_function_rule("NOW".into(), "CURRENT_TIMESTAMP".into());
        assert_eq!(
            r.get_function_mapping("NOW").map(|s| s.as_str()),
            Some("CURRENT_TIMESTAMP"),
        );
    }

    #[test]
    fn get_function_mapping_returns_none_for_unknown() {
        let r = rules();
        assert!(r.get_function_mapping("UNICORN").is_none());
    }

    // ---- add/get pattern rule ----

    #[test]
    fn add_pattern_rule_appears_in_list() {
        let mut r = rules();
        let count_before = r.get_pattern_rules().len();
        r.add_pattern_rule(PatternRule::new("x", "desc", "foo", "bar"));
        assert_eq!(r.get_pattern_rules().len(), count_before + 1);
    }

    #[test]
    fn pattern_rule_fields_accessible() {
        let rule = PatternRule::new("my_rule", "my desc", r"\bNOW\(\)", "CURRENT_TIMESTAMP");
        assert_eq!(rule.name, "my_rule");
        assert_eq!(rule.description, "my desc");
        assert_eq!(rule.pattern, r"\bNOW\(\)");
        assert_eq!(rule.replacement, "CURRENT_TIMESTAMP");
        assert!(rule.conditions.is_empty());
    }

    #[test]
    fn pattern_rule_with_condition_appends_condition() {
        let rule = PatternRule::new("r", "d", "p", "repl")
            .with_condition(RuleCondition::StatementType("SELECT".into()));
        assert_eq!(rule.conditions.len(), 1);
    }

    // ---- PatternRule::with_condition for all RuleCondition variants ----

    #[test]
    fn rule_condition_statement_type_variant() {
        let rule = PatternRule::new("r", "d", "p", "repl")
            .with_condition(RuleCondition::StatementType("SELECT".into()));
        assert!(matches!(rule.conditions[0], RuleCondition::StatementType(_)));
    }

    #[test]
    fn rule_condition_context_contains_variant() {
        let rule = PatternRule::new("r", "d", "p", "repl")
            .with_condition(RuleCondition::ContextContains("some text".into()));
        assert!(matches!(rule.conditions[0], RuleCondition::ContextContains(_)));
    }

    #[test]
    fn rule_condition_not_in_context_variant() {
        let rule = PatternRule::new("r", "d", "p", "repl")
            .with_condition(RuleCondition::NotInContext("excluded".into()));
        assert!(matches!(rule.conditions[0], RuleCondition::NotInContext(_)));
    }

    // ---- apply_transformation_rules ----

    #[test]
    fn apply_transformation_rules_passthrough_when_no_rules_configured() {
        let r = rules();
        let out = r.apply_transformation_rules("SELECT 1").unwrap();
        assert!(out.to_uppercase().contains("SELECT"));
    }

    #[test]
    fn apply_transformation_rules_remove_extensions_when_enabled() {
        let mut config = RulesConfig::default();
        config
            .transformation_rules
            .insert("remove_pg_extensions".into(), true);
        let r = TransformationRules::new(config);
        let sql = "CREATE EXTENSION IF NOT EXISTS pgcrypto; SELECT 1;";
        let out = r.apply_transformation_rules(sql).unwrap();
        // The implementation comments out the extension statement with "--" prefix
        // so it should start with a comment marker
        assert!(
            out.starts_with("--") || !out.to_uppercase().contains("CREATE EXTENSION"),
            "extension should be commented out or removed, got: {out}"
        );
    }

    #[test]
    fn apply_transformation_rules_convert_arrays_when_enabled() {
        let mut config = RulesConfig::default();
        config
            .transformation_rules
            .insert("convert_arrays_to_json".into(), true);
        let r = TransformationRules::new(config);
        let sql = "CREATE TABLE t (tags TEXT[])";
        let out = r.apply_transformation_rules(sql).unwrap();
        // TEXT[] should be replaced with NCLOB
        assert!(
            out.contains("NCLOB") || !out.contains("TEXT[]"),
            "array type should be converted, got: {out}"
        );
    }

    // ---- validate_hana_compatibility ----

    #[test]
    fn validate_hana_compatibility_ok_for_simple_select() {
        let r = rules();
        let stmts = parse("SELECT 1");
        // default config has validate_hana_compatibility = true, enable_strict_mode = false
        // so should return Ok(()) even for simple selects
        assert!(r.validate_hana_compatibility(&stmts).is_ok());
    }

    #[test]
    fn validate_hana_compatibility_disabled_config_always_ok() {
        let mut config = RulesConfig::default();
        config.validate_hana_compatibility = false;
        let r = TransformationRules::new(config);
        // Even with problematic SQL, validation should pass when disabled
        let stmts = parse("SELECT 1");
        assert!(r.validate_hana_compatibility(&stmts).is_ok());
    }

    #[test]
    fn validate_hana_compatibility_strict_mode_returns_error_on_violation() {
        let mut config = RulesConfig::default();
        config.validate_hana_compatibility = true;
        config.enable_strict_mode = true;
        let r = TransformationRules::new(config);
        // Two IDENTITY columns should violate the single identity column rule
        let sql = "CREATE TABLE t (id INTEGER GENERATED ALWAYS AS IDENTITY, id2 INTEGER GENERATED ALWAYS AS IDENTITY, name TEXT)";
        let stmts = parse(sql);
        let result = r.validate_hana_compatibility(&stmts);
        assert!(
            result.is_err(),
            "strict mode should error on multiple IDENTITY columns"
        );
    }

    #[test]
    fn validate_hana_compatibility_non_strict_ok_on_violation() {
        let config = RulesConfig::default(); // strict_mode = false
        let r = TransformationRules::new(config);
        let sql = "CREATE TABLE t (id INTEGER GENERATED ALWAYS AS IDENTITY, id2 INTEGER GENERATED ALWAYS AS IDENTITY, name TEXT)";
        let stmts = parse(sql);
        // non-strict mode should NOT return an error (violations are recorded but not escalated)
        assert!(r.validate_hana_compatibility(&stmts).is_ok());
    }

    #[test]
    fn multiple_data_type_rules_all_stored() {
        let mut r = rules();
        r.add_data_type_rule("SERIAL".into(), "INTEGER IDENTITY".into());
        r.add_data_type_rule("TEXT".into(), "NCLOB".into());
        r.add_data_type_rule("UUID".into(), "NVARCHAR(36)".into());
        assert!(r.get_data_type_mapping("SERIAL").is_some());
        assert!(r.get_data_type_mapping("TEXT").is_some());
        assert!(r.get_data_type_mapping("UUID").is_some());
    }

    #[test]
    fn multiple_function_rules_all_stored() {
        let mut r = rules();
        r.add_function_rule("NOW".into(), "CURRENT_TIMESTAMP".into());
        r.add_function_rule("RANDOM".into(), "RAND".into());
        assert!(r.get_function_mapping("NOW").is_some());
        assert!(r.get_function_mapping("RANDOM").is_some());
    }

    #[test]
    fn get_pattern_rules_returns_slice() {
        let mut r = rules();
        r.add_pattern_rule(PatternRule::new("a", "da", "pa", "ra"));
        r.add_pattern_rule(PatternRule::new("b", "db", "pb", "rb"));
        let rules_slice = r.get_pattern_rules();
        assert_eq!(rules_slice.len(), 2);
        assert_eq!(rules_slice[0].name, "a");
        assert_eq!(rules_slice[1].name, "b");
    }
}
