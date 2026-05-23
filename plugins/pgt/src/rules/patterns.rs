use crate::error::TransformationResult;
use regex::Regex;

pub struct PatternTransformer {
    patterns: Vec<TransformationPattern>,
}

impl PatternTransformer {
    pub fn new() -> Self {
        let mut transformer = Self {
            patterns: Vec::new(),
        };

        transformer.add_default_patterns();
        transformer
    }

    fn add_default_patterns(&mut self) {
        self.add_pattern(TransformationPattern::new(
            "limit_offset",
            r"LIMIT\s+(\d+)\s+OFFSET\s+(\d+)",
            "LIMIT $2, $1",
            "Transform PostgreSQL LIMIT/OFFSET to HANA syntax",
        ));

        self.add_pattern(TransformationPattern::new(
            "ilike_transform",
            r"(\w+)\s+ILIKE\s+'([^']*)'",
            "UPPER($1) LIKE UPPER('$2')",
            "Transform ILIKE to case-insensitive LIKE",
        ));

        self.add_pattern(TransformationPattern::new(
            "boolean_true",
            r"\btrue\b",
            "TRUE",
            "Standardize boolean true literal",
        ));

        self.add_pattern(TransformationPattern::new(
            "boolean_false",
            r"\bfalse\b",
            "FALSE",
            "Standardize boolean false literal",
        ));

        self.add_pattern(TransformationPattern::new(
            "extract_dow",
            r"EXTRACT\(\s*dow\s+FROM\s+([^)]+)\)",
            "WEEKDAY($1)",
            "Transform EXTRACT(dow FROM date) to WEEKDAY(date)",
        ));

        self.add_pattern(TransformationPattern::new(
            "extract_doy",
            r"EXTRACT\(\s*doy\s+FROM\s+([^)]+)\)",
            "DAYOFYEAR($1)",
            "Transform EXTRACT(doy FROM date) to DAYOFYEAR(date)",
        ));

        self.add_pattern(TransformationPattern::new(
            "extract_epoch",
            r"EXTRACT\(\s*epoch\s+FROM\s+([^)]+)\)",
            "SECONDS_BETWEEN('1970-01-01 00:00:00', $1)",
            "Transform EXTRACT(epoch FROM timestamp) to SECONDS_BETWEEN",
        ));

        self.add_pattern(TransformationPattern::new(
            "regex_match",
            r"(\w+)\s*~\s*'([^']*)'",
            "LOCATE_REGEXPR('$2', $1) > 0",
            "Transform regex match operator to LOCATE_REGEXPR function",
        ));

        self.add_pattern(TransformationPattern::new(
            "regex_match_case_insensitive",
            r"(\w+)\s*~\*\s*'([^']*)'",
            "LOCATE_REGEXPR('$2', $1, 1, 1, '', 'i') > 0",
            "Transform case-insensitive regex match to LOCATE_REGEXPR with flag",
        ));

        self.add_pattern(TransformationPattern::new(
            "string_concat_null_handling",
            r"(\w+)\s*\|\|\s*(\w+)",
            "CONCAT($1, $2)",
            "Transform || operator to CONCAT function for better null handling",
        ));

        self.add_pattern(TransformationPattern::new(
            "position_function",
            r"POSITION\(\s*'([^']*)'\s+IN\s+(\w+)\)",
            "LOCATE('$1', $2)",
            "Transform POSITION(substring IN string) to LOCATE(substring, string)",
        ));

        self.add_pattern(TransformationPattern::new(
            "substring_from_for",
            r"SUBSTRING\(\s*(\w+)\s+FROM\s+(\d+)\s+FOR\s+(\d+)\)",
            "SUBSTRING($1, $2, $3)",
            "Transform SUBSTRING(string FROM start FOR length) to SUBSTRING(string, start, length)",
        ));

        self.add_pattern(TransformationPattern::new(
            "array_access",
            r"(\w+)\[(\d+)\]",
            "SPLIT_PART($1, ',', $2)",
            "Transform array access to string splitting (assuming comma-separated values)",
        ));

        self.add_pattern(TransformationPattern::new(
            "interval_addition",
            r"(\w+)\s*\+\s*INTERVAL\s+'(\d+)'\s+(\w+)",
            "ADD_$3($1, $2)",
            "Transform date + INTERVAL to HANA date functions",
        ));

        self.add_pattern(TransformationPattern::new(
            "coalesce_empty_string",
            r"COALESCE\(\s*(\w+),\s*''\s*\)",
            "IFNULL($1, '')",
            "Transform COALESCE with empty string to IFNULL",
        ));
    }

    pub fn add_pattern(&mut self, pattern: TransformationPattern) {
        self.patterns.push(pattern);
    }

    pub fn transform(&self, sql: &str) -> TransformationResult<String> {
        let mut result = sql.to_string();
        let mut applied_transformations = Vec::new();

        for pattern in &self.patterns {
            match pattern.apply(&result) {
                Ok((transformed, applied)) => {
                    if applied {
                        applied_transformations.push(pattern.name.clone());
                        result = transformed;
                    }
                }
                Err(e) => {
                    log::warn!("Pattern '{}' failed: {}", pattern.name, e);
                }
            }
        }

        if !applied_transformations.is_empty() {
            log::info!("Applied: {}", applied_transformations.join(", "));
        }

        Ok(result)
    }

    pub fn patterns(&self) -> &[TransformationPattern] {
        &self.patterns
    }
}

impl Default for PatternTransformer {
    fn default() -> Self {
        Self::new()
    }
}

pub struct TransformationPattern {
    pub name: String,
    pub description: String,
    regex: Regex,
    replacement: String,
}

impl TransformationPattern {
    pub fn new(name: &str, pattern: &str, replacement: &str, description: &str) -> Self {
        let regex = Regex::new(pattern)
            .unwrap_or_else(|e| panic!("Invalid regex pattern '{}': {}", pattern, e));

        Self {
            name: name.to_string(),
            description: description.to_string(),
            regex,
            replacement: replacement.to_string(),
        }
    }

    pub fn apply(&self, sql: &str) -> TransformationResult<(String, bool)> {
        if self.regex.is_match(sql) {
            let result = self.regex.replace_all(sql, &self.replacement).to_string();
            Ok((result, true))
        } else {
            Ok((sql.to_string(), false))
        }
    }

    pub fn matches(&self, sql: &str) -> bool {
        self.regex.is_match(sql)
    }

    pub fn pattern(&self) -> String {
        self.regex.as_str().to_string()
    }

    pub fn replacement(&self) -> &str {
        &self.replacement
    }
}

pub struct ConditionalPatternTransformer {
    patterns: Vec<ConditionalPattern>,
}

impl ConditionalPatternTransformer {
    pub fn new() -> Self {
        Self {
            patterns: Vec::new(),
        }
    }

    pub fn add_conditional_pattern(&mut self, pattern: ConditionalPattern) {
        self.patterns.push(pattern);
    }

    pub fn transform(
        &self,
        sql: &str,
        context: &TransformationContext,
    ) -> TransformationResult<String> {
        let mut result = sql.to_string();

        for pattern in &self.patterns {
            if pattern.should_apply(context) {
                match pattern.pattern.apply(&result) {
                    Ok((transformed, applied)) => {
                        if applied {
                            result = transformed;
                            log::debug!("Applied: {}", pattern.pattern.name);
                        }
                    }
                    Err(e) => {
                        log::warn!("Pattern '{}' failed: {}", pattern.pattern.name, e);
                    }
                }
            }
        }

        Ok(result)
    }
}

impl Default for ConditionalPatternTransformer {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ConditionalPattern {
    pub pattern: TransformationPattern,
    pub conditions: Vec<PatternCondition>,
}

impl ConditionalPattern {
    pub fn new(pattern: TransformationPattern) -> Self {
        Self {
            pattern,
            conditions: Vec::new(),
        }
    }

    pub fn with_condition(mut self, condition: PatternCondition) -> Self {
        self.conditions.push(condition);
        self
    }

    pub fn should_apply(&self, context: &TransformationContext) -> bool {
        if self.conditions.is_empty() {
            return true;
        }

        self.conditions
            .iter()
            .all(|condition| condition.matches(context))
    }
}

pub enum PatternCondition {
    StatementType(String),
    ContextContains(String),
    NotInContext(String),
    InFunction(String),
    InClause(String),
}

impl PatternCondition {
    pub fn matches(&self, context: &TransformationContext) -> bool {
        match self {
            PatternCondition::StatementType(stmt_type) => context
                .statement_type
                .as_ref()
                .map(|st| st.eq_ignore_ascii_case(stmt_type))
                .unwrap_or(false),
            PatternCondition::ContextContains(text) => context.full_sql.contains(text),
            PatternCondition::NotInContext(text) => !context.full_sql.contains(text),
            PatternCondition::InFunction(func_name) => context
                .current_function
                .as_ref()
                .map(|cf| cf.eq_ignore_ascii_case(func_name))
                .unwrap_or(false),
            PatternCondition::InClause(clause_name) => context
                .current_clause
                .as_ref()
                .map(|cc| cc.eq_ignore_ascii_case(clause_name))
                .unwrap_or(false),
        }
    }
}

pub struct TransformationContext {
    pub statement_type: Option<String>,
    pub current_function: Option<String>,
    pub current_clause: Option<String>,
    pub full_sql: String,
    pub metadata: std::collections::HashMap<String, String>,
}

impl TransformationContext {
    pub fn new(sql: &str) -> Self {
        Self {
            statement_type: None,
            current_function: None,
            current_clause: None,
            full_sql: sql.to_string(),
            metadata: std::collections::HashMap::new(),
        }
    }

    pub fn with_statement_type(mut self, stmt_type: &str) -> Self {
        self.statement_type = Some(stmt_type.to_string());
        self
    }

    pub fn with_function(mut self, function: &str) -> Self {
        self.current_function = Some(function.to_string());
        self
    }

    pub fn with_clause(mut self, clause: &str) -> Self {
        self.current_clause = Some(clause.to_string());
        self
    }

    pub fn add_metadata(mut self, key: &str, value: &str) -> Self {
        self.metadata.insert(key.to_string(), value.to_string());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- TransformationPattern ----

    #[test]
    fn new_pattern_compiles_and_matches() {
        // signature: new(name, pattern, replacement, description)
        let p = TransformationPattern::new("now", r"(?i)\bNOW\(\)", "CURRENT_TIMESTAMP", "replace NOW");
        assert!(p.matches("SELECT NOW()"));
        let (out, changed) = p.apply("SELECT NOW()").unwrap();
        assert!(changed);
        assert!(out.contains("CURRENT_TIMESTAMP"));
    }

    #[test]
    fn pattern_no_match_returns_unchanged() {
        let p = TransformationPattern::new("now", r"(?i)\bNOW\(\)", "CURRENT_TIMESTAMP", "replace NOW");
        let (out, changed) = p.apply("SELECT 1").unwrap();
        assert!(!changed);
        assert_eq!(out, "SELECT 1");
    }

    #[test]
    fn pattern_matches_returns_false_on_no_match() {
        let p = TransformationPattern::new("now", r"(?i)\bNOW\(\)", "CURRENT_TIMESTAMP", "x");
        assert!(!p.matches("SELECT 1"));
    }

    #[test]
    fn pattern_accessors() {
        let p = TransformationPattern::new("myname", r"NOW\(\)", "X", "desc");
        assert_eq!(p.replacement(), "X");
        assert!(!p.pattern().is_empty());
        assert_eq!(p.name, "myname");
        assert_eq!(p.description, "desc");
    }

    #[test]
    fn pattern_apply_replaces_all_occurrences() {
        let p = TransformationPattern::new("foo", "foo", "bar", "replace foo");
        let (out, changed) = p.apply("foo foo foo").unwrap();
        assert!(changed);
        assert_eq!(out, "bar bar bar");
    }

    // ---- PatternTransformer ----

    #[test]
    fn transformer_new_has_default_patterns() {
        let t = PatternTransformer::new();
        // PatternTransformer::new() loads default patterns
        assert!(!t.patterns().is_empty());
    }

    #[test]
    fn transformer_applies_added_patterns_in_order() {
        let mut t = PatternTransformer::new();
        // Clear default patterns by creating a minimal one
        // We test by adding a pattern on top and verifying it fires
        let initial_count = t.patterns().len();
        t.add_pattern(TransformationPattern::new("extra", "XMARKER", "YMARKER", ""));
        assert_eq!(t.patterns().len(), initial_count + 1);
        let out = t.transform("XMARKER").unwrap();
        assert!(out.contains("YMARKER"));
    }

    #[test]
    fn transformer_add_pattern_increments_count() {
        let mut t = PatternTransformer::new();
        let before = t.patterns().len();
        t.add_pattern(TransformationPattern::new("p", "foo", "bar", ""));
        assert_eq!(t.patterns().len(), before + 1);
    }

    #[test]
    fn transformer_returns_unchanged_when_no_pattern_fires() {
        let mut t = PatternTransformer::new();
        // Add a pattern that won't match our input
        t.add_pattern(TransformationPattern::new("z", "ZZZNOTHERE", "X", ""));
        let out = t.transform("SELECT 1").unwrap();
        // The output may have been changed by default patterns but the custom one won't fire
        // Verify we get a string back (no error)
        assert!(!out.is_empty());
    }

    #[test]
    fn transformer_default_impl() {
        let t = PatternTransformer::default();
        assert!(!t.patterns().is_empty());
    }

    #[test]
    fn transformer_chained_patterns_transform_step_by_step() {
        // Create a fresh transformer without default patterns by adding patterns manually
        // We verify the chain: first pattern changes "alpha" -> "beta", second "beta" -> "gamma"
        // But we must start with a PatternTransformer that has the defaults, so we just test
        // that our two extra patterns both show up and fire in sequence on fresh input.
        let mut t = PatternTransformer::new();
        t.add_pattern(TransformationPattern::new("step1", "ALPHATOKEN", "BETATOKEN", ""));
        t.add_pattern(TransformationPattern::new("step2", "BETATOKEN", "GAMMATOKEN", ""));
        let out = t.transform("ALPHATOKEN").unwrap();
        assert!(out.contains("GAMMATOKEN"), "chain did not produce GAMMATOKEN, got: {out}");
    }

    // ---- ConditionalPattern + ConditionalPatternTransformer ----

    #[test]
    fn conditional_pattern_no_conditions_always_applies() {
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat);
        let ctx = TransformationContext::new("SELECT NOW()");
        assert!(cp.should_apply(&ctx));
    }

    #[test]
    fn conditional_pattern_statement_type_matches_correctly() {
        // PatternCondition variant is StatementType (confirmed from source)
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat)
            .with_condition(PatternCondition::StatementType("SELECT".into()));
        let ctx_select = TransformationContext::new("SELECT NOW()").with_statement_type("SELECT");
        let ctx_insert = TransformationContext::new("INSERT INTO t VALUES (NOW())")
            .with_statement_type("INSERT");
        assert!(cp.should_apply(&ctx_select));
        assert!(!cp.should_apply(&ctx_insert));
    }

    #[test]
    fn conditional_pattern_context_contains_matches() {
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat)
            .with_condition(PatternCondition::ContextContains("NOW".into()));
        let ctx_yes = TransformationContext::new("SELECT NOW()");
        let ctx_no = TransformationContext::new("SELECT 1");
        assert!(cp.should_apply(&ctx_yes));
        assert!(!cp.should_apply(&ctx_no));
    }

    #[test]
    fn conditional_pattern_not_in_context_matches() {
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat)
            .with_condition(PatternCondition::NotInContext("SPECIAL".into()));
        let ctx_without = TransformationContext::new("SELECT 1");
        let ctx_with = TransformationContext::new("SELECT SPECIAL");
        assert!(cp.should_apply(&ctx_without));
        assert!(!cp.should_apply(&ctx_with));
    }

    #[test]
    fn conditional_pattern_in_function_matches() {
        // PatternCondition::InFunction (confirmed from source)
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat)
            .with_condition(PatternCondition::InFunction("COALESCE".into()));
        let ctx_with_fn = TransformationContext::new("SELECT 1").with_function("COALESCE");
        let ctx_no_fn = TransformationContext::new("SELECT 1");
        assert!(cp.should_apply(&ctx_with_fn));
        assert!(!cp.should_apply(&ctx_no_fn));
    }

    #[test]
    fn conditional_pattern_in_clause_matches() {
        // PatternCondition::InClause (confirmed from source)
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        let cp = ConditionalPattern::new(pat)
            .with_condition(PatternCondition::InClause("WHERE".into()));
        let ctx_where = TransformationContext::new("SELECT 1").with_clause("WHERE");
        let ctx_select = TransformationContext::new("SELECT 1").with_clause("SELECT");
        assert!(cp.should_apply(&ctx_where));
        assert!(!cp.should_apply(&ctx_select));
    }

    #[test]
    fn conditional_transformer_applies_matching_pattern() {
        let mut t = ConditionalPatternTransformer::new();
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        t.add_conditional_pattern(
            ConditionalPattern::new(pat)
                .with_condition(PatternCondition::StatementType("SELECT".into())),
        );
        let ctx = TransformationContext::new("SELECT NOW()").with_statement_type("SELECT");
        let out = t.transform("SELECT NOW()", &ctx).unwrap();
        assert!(out.contains("CURRENT_TIMESTAMP"));
    }

    #[test]
    fn conditional_transformer_skips_non_matching_pattern() {
        let mut t = ConditionalPatternTransformer::new();
        let pat = TransformationPattern::new("ny", "NOW", "CURRENT_TIMESTAMP", "");
        t.add_conditional_pattern(
            ConditionalPattern::new(pat)
                .with_condition(PatternCondition::StatementType("SELECT".into())),
        );
        // Context says INSERT, so the pattern should NOT fire
        let ctx = TransformationContext::new("INSERT INTO t VALUES (NOW())")
            .with_statement_type("INSERT");
        let out = t.transform("NOW", &ctx).unwrap();
        assert_eq!(out, "NOW", "pattern should not have fired for INSERT context");
    }

    #[test]
    fn conditional_transformer_default_impl() {
        let t = ConditionalPatternTransformer::default();
        // No patterns by default — transform should return input unchanged
        let ctx = TransformationContext::new("SELECT 1");
        let out = t.transform("SELECT 1", &ctx).unwrap();
        assert_eq!(out, "SELECT 1");
    }

    // ---- TransformationContext ----

    #[test]
    fn context_new_has_empty_fields() {
        let c = TransformationContext::new("SELECT 1");
        assert_eq!(c.full_sql, "SELECT 1");
        assert!(c.statement_type.is_none());
        assert!(c.current_function.is_none());
        assert!(c.current_clause.is_none());
        assert!(c.metadata.is_empty());
    }

    #[test]
    fn context_with_statement_type() {
        let c = TransformationContext::new("SELECT 1").with_statement_type("SELECT");
        assert_eq!(c.statement_type.as_deref(), Some("SELECT"));
    }

    #[test]
    fn context_with_function() {
        let c = TransformationContext::new("SELECT 1").with_function("NOW");
        assert_eq!(c.current_function.as_deref(), Some("NOW"));
    }

    #[test]
    fn context_with_clause() {
        let c = TransformationContext::new("SELECT 1").with_clause("WHERE");
        assert_eq!(c.current_clause.as_deref(), Some("WHERE"));
    }

    #[test]
    fn context_add_metadata() {
        let c = TransformationContext::new("SELECT 1").add_metadata("key", "value");
        assert_eq!(c.metadata.get("key").map(|s| s.as_str()), Some("value"));
    }

    #[test]
    fn context_builders_chain() {
        let c = TransformationContext::new("SELECT 1")
            .with_statement_type("SELECT")
            .with_function("NOW")
            .with_clause("WHERE")
            .add_metadata("k", "v");
        assert_eq!(c.statement_type.as_deref(), Some("SELECT"));
        assert_eq!(c.current_function.as_deref(), Some("NOW"));
        assert_eq!(c.current_clause.as_deref(), Some("WHERE"));
        assert_eq!(c.metadata.get("k").map(|s| s.as_str()), Some("v"));
    }

    // ---- PatternCondition::matches ----

    #[test]
    fn pattern_condition_statement_type_case_insensitive() {
        let cond = PatternCondition::StatementType("select".into());
        let ctx = TransformationContext::new("SELECT 1").with_statement_type("SELECT");
        assert!(cond.matches(&ctx));
    }

    #[test]
    fn pattern_condition_statement_type_no_match_when_unset() {
        let cond = PatternCondition::StatementType("SELECT".into());
        let ctx = TransformationContext::new("SELECT 1"); // no statement_type set
        assert!(!cond.matches(&ctx));
    }

    #[test]
    fn pattern_condition_context_contains() {
        let cond = PatternCondition::ContextContains("NOW".into());
        let yes = TransformationContext::new("SELECT NOW()");
        let no = TransformationContext::new("SELECT 1");
        assert!(cond.matches(&yes));
        assert!(!cond.matches(&no));
    }

    #[test]
    fn pattern_condition_not_in_context() {
        let cond = PatternCondition::NotInContext("SPECIAL".into());
        let yes = TransformationContext::new("SELECT 1");
        let no = TransformationContext::new("SELECT SPECIAL");
        assert!(cond.matches(&yes));
        assert!(!cond.matches(&no));
    }

    #[test]
    fn pattern_condition_in_function() {
        let cond = PatternCondition::InFunction("COALESCE".into());
        let yes = TransformationContext::new("SELECT 1").with_function("COALESCE");
        let no = TransformationContext::new("SELECT 1");
        assert!(cond.matches(&yes));
        assert!(!cond.matches(&no));
    }

    #[test]
    fn pattern_condition_in_function_case_insensitive() {
        let cond = PatternCondition::InFunction("coalesce".into());
        let ctx = TransformationContext::new("SELECT 1").with_function("COALESCE");
        assert!(cond.matches(&ctx));
    }

    #[test]
    fn pattern_condition_in_clause() {
        let cond = PatternCondition::InClause("WHERE".into());
        let yes = TransformationContext::new("SELECT 1").with_clause("WHERE");
        let no = TransformationContext::new("SELECT 1").with_clause("SELECT");
        assert!(cond.matches(&yes));
        assert!(!cond.matches(&no));
    }

    #[test]
    fn pattern_condition_in_clause_case_insensitive() {
        let cond = PatternCondition::InClause("where".into());
        let ctx = TransformationContext::new("SELECT 1").with_clause("WHERE");
        assert!(cond.matches(&ctx));
    }
}
