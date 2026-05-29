use thiserror::Error;

#[derive(Error, Debug)]
pub enum TransformationError {
    #[error("Parse error: {message} at line {line}, column {column}")]
    ParseError {
        message: String,
        line: usize,
        column: usize,
    },

    #[error("Unsupported PostgreSQL feature: {feature}. Context: {context}")]
    UnsupportedFeature {
        feature: String,
        context: String,
        suggestion: Option<String>,
    },

    #[error("Data type transformation failed: {pg_type} -> {suggested_hana_type}: {context}")]
    DataTypeError {
        pg_type: String,
        suggested_hana_type: String,
        context: String,
    },

    #[error("Function transformation failed: {function}: {reason}")]
    FunctionError { function: String, reason: String },

    #[error("Configuration error: {message}")]
    ConfigError { message: String },

    #[error("HANA validation failed: {hana_rule_violations:?}")]
    ValidationError {
        hana_rule_violations: Vec<String>,
        suggestions: Vec<String>,
    },

    #[error("Partial transformation completed: {succeeded_statements} succeeded, {failed_statements} failed")]
    PartialTransformation {
        succeeded_statements: usize,
        failed_statements: usize,
        transformed_sql: Option<String>,
        errors: Vec<TransformationError>,
    },

    #[error("Schema transformation error: {message}")]
    SchemaError { message: String },

    #[error("Expression transformation error: {message}")]
    ExpressionError { message: String },

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[cfg(feature = "json_output")]
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct TransformationWarning {
    pub message: String,
    pub location: Option<SourceLocation>,
    pub severity: WarningSeverity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WarningSeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone)]
pub struct SourceLocation {
    pub line: usize,
    pub column: usize,
    pub file: Option<String>,
}

pub type TransformationResult<T> = Result<T, TransformationError>;

impl Clone for TransformationError {
    fn clone(&self) -> Self {
        match self {
            Self::ParseError {
                message,
                line,
                column,
            } => Self::ParseError {
                message: message.clone(),
                line: *line,
                column: *column,
            },
            Self::UnsupportedFeature {
                feature,
                context,
                suggestion,
            } => Self::UnsupportedFeature {
                feature: feature.clone(),
                context: context.clone(),
                suggestion: suggestion.clone(),
            },
            Self::DataTypeError {
                pg_type,
                suggested_hana_type,
                context,
            } => Self::DataTypeError {
                pg_type: pg_type.clone(),
                suggested_hana_type: suggested_hana_type.clone(),
                context: context.clone(),
            },
            Self::FunctionError { function, reason } => Self::FunctionError {
                function: function.clone(),
                reason: reason.clone(),
            },
            Self::ConfigError { message } => Self::ConfigError {
                message: message.clone(),
            },
            Self::ValidationError {
                hana_rule_violations,
                suggestions,
            } => Self::ValidationError {
                hana_rule_violations: hana_rule_violations.clone(),
                suggestions: suggestions.clone(),
            },
            Self::PartialTransformation {
                succeeded_statements,
                failed_statements,
                transformed_sql,
                errors,
            } => Self::PartialTransformation {
                succeeded_statements: *succeeded_statements,
                failed_statements: *failed_statements,
                transformed_sql: transformed_sql.clone(),
                errors: errors.clone(),
            },
            Self::SchemaError { message } => Self::SchemaError {
                message: message.clone(),
            },
            Self::ExpressionError { message } => Self::ExpressionError {
                message: message.clone(),
            },
            Self::IoError(e) => Self::IoError(std::io::Error::new(e.kind(), e.to_string())),
            #[cfg(feature = "json_output")]
            Self::SerializationError(e) => {
                Self::SerializationError(serde_json::Error::custom(e.to_string()))
            }
        }
    }
}

impl TransformationError {
    pub fn unsupported(feature: &str) -> Self {
        Self::UnsupportedFeature {
            feature: feature.to_string(),
            context: String::new(),
            suggestion: None,
        }
    }

    pub fn unsupported_with_context(
        feature: &str,
        context: &str,
        suggestion: Option<&str>,
    ) -> Self {
        Self::UnsupportedFeature {
            feature: feature.to_string(),
            context: context.to_string(),
            suggestion: suggestion.map(|s| s.to_string()),
        }
    }

    pub fn data_type(pg_type: &str, suggested_hana_type: &str, context: &str) -> Self {
        Self::DataTypeError {
            pg_type: pg_type.to_string(),
            suggested_hana_type: suggested_hana_type.to_string(),
            context: context.to_string(),
        }
    }

    pub fn function(function: &str, reason: &str) -> Self {
        Self::FunctionError {
            function: function.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn validation(hana_rule_violations: Vec<String>, suggestions: Vec<String>) -> Self {
        Self::ValidationError {
            hana_rule_violations,
            suggestions,
        }
    }

    pub fn partial_transformation(
        succeeded: usize,
        failed: usize,
        transformed_sql: Option<String>,
        errors: Vec<TransformationError>,
    ) -> Self {
        Self::PartialTransformation {
            succeeded_statements: succeeded,
            failed_statements: failed,
            transformed_sql,
            errors,
        }
    }

    pub fn config(message: &str) -> Self {
        Self::ConfigError {
            message: message.to_string(),
        }
    }
}

impl TransformationWarning {
    pub fn new(message: &str, severity: WarningSeverity) -> Self {
        Self {
            message: message.to_string(),
            location: None,
            severity,
        }
    }

    pub fn with_location(
        message: &str,
        severity: WarningSeverity,
        location: SourceLocation,
    ) -> Self {
        Self {
            message: message.to_string(),
            location: Some(location),
            severity,
        }
    }

    pub fn low(message: &str) -> Self {
        Self::new(message, WarningSeverity::Low)
    }

    pub fn medium(message: &str) -> Self {
        Self::new(message, WarningSeverity::Medium)
    }

    pub fn high(message: &str) -> Self {
        Self::new(message, WarningSeverity::High)
    }
}

impl std::fmt::Display for TransformationWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}", self.severity, self.message)?;
        if let Some(location) = &self.location {
            write!(f, " at line {}, column {}", location.line, location.column)?;
            if let Some(file) = &location.file {
                write!(f, " in {}", file)?;
            }
        }
        Ok(())
    }
}

impl SourceLocation {
    pub fn new(line: usize, column: usize) -> Self {
        Self {
            line,
            column,
            file: None,
        }
    }

    pub fn with_file(line: usize, column: usize, file: &str) -> Self {
        Self {
            line,
            column,
            file: Some(file.to_string()),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct PerformanceMetrics {
    pub parse_time_ms: u64,
    pub transform_time_ms: u64,
    pub total_time_ms: u64,
}

#[derive(Debug, Clone)]
pub struct DetailedResult<T> {
    pub result: TransformationResult<T>,
    pub warnings: Vec<String>,
    pub metadata: Option<EnhancedTransformationMetadata>,
}

#[derive(Debug, Clone)]
pub struct EnhancedTransformationMetadata {
    pub transformations_applied: Vec<String>,
    pub warnings: Vec<String>,
    pub performance_metrics: PerformanceMetrics,
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- TransformationError variant Display tests ---

    #[test]
    fn parse_error_display_includes_position() {
        let e = TransformationError::ParseError {
            message: "expected SELECT".into(),
            line: 3,
            column: 7,
        };
        let s = format!("{e}");
        assert!(s.contains("line 3"), "got: {s}");
        assert!(s.contains("column 7"), "got: {s}");
    }

    #[test]
    fn parse_error_display_includes_message() {
        let e = TransformationError::ParseError {
            message: "unexpected token".into(),
            line: 1,
            column: 1,
        };
        let s = format!("{e}");
        assert!(s.contains("unexpected token"), "got: {s}");
    }

    #[test]
    fn unsupported_feature_display() {
        let e = TransformationError::UnsupportedFeature {
            feature: "LISTEN".into(),
            context: "edge function".into(),
            suggestion: Some("use trigger".into()),
        };
        let s = format!("{e}");
        assert!(s.contains("LISTEN"), "got: {s}");
        assert!(s.contains("edge function"), "got: {s}");
    }

    #[test]
    fn data_type_error_display() {
        let e = TransformationError::DataTypeError {
            pg_type: "SERIAL".into(),
            suggested_hana_type: "INTEGER GENERATED ALWAYS".into(),
            context: "id column".into(),
        };
        let s = format!("{e}");
        assert!(s.contains("SERIAL"), "got: {s}");
        assert!(s.contains("INTEGER GENERATED ALWAYS"), "got: {s}");
        assert!(s.contains("id column"), "got: {s}");
    }

    #[test]
    fn function_error_display() {
        let e = TransformationError::FunctionError {
            function: "NOW".into(),
            reason: "no HANA equivalent".into(),
        };
        let s = format!("{e}");
        assert!(s.contains("NOW"), "got: {s}");
        assert!(s.contains("no HANA equivalent"), "got: {s}");
    }

    #[test]
    fn config_error_display() {
        let e = TransformationError::ConfigError {
            message: "missing key".into(),
        };
        let s = format!("{e}");
        assert!(s.contains("missing key"), "got: {s}");
    }

    #[test]
    fn validation_error_display() {
        let e = TransformationError::ValidationError {
            hana_rule_violations: vec!["X not allowed".into()],
            suggestions: vec!["use Y".into()],
        };
        let s = format!("{e}");
        assert!(s.contains("X not allowed"), "got: {s}");
    }

    #[test]
    fn partial_transformation_display() {
        let e = TransformationError::PartialTransformation {
            succeeded_statements: 5,
            failed_statements: 2,
            transformed_sql: Some("SELECT 1".into()),
            errors: vec![],
        };
        let s = format!("{e}");
        assert!(s.contains('5'), "got: {s}");
        assert!(s.contains('2'), "got: {s}");
    }

    #[test]
    fn schema_error_display() {
        let e = TransformationError::SchemaError {
            message: "bad schema".into(),
        };
        let s = format!("{e}");
        assert!(s.contains("bad schema"), "got: {s}");
    }

    #[test]
    fn expression_error_display() {
        let e = TransformationError::ExpressionError {
            message: "bad expr".into(),
        };
        let s = format!("{e}");
        assert!(s.contains("bad expr"), "got: {s}");
    }

    #[test]
    fn io_error_from_conversion() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let e: TransformationError = io.into();
        assert!(matches!(e, TransformationError::IoError(_)));
        let s = format!("{e}");
        assert!(s.contains("file missing"), "got: {s}");
    }

    // --- Constructor tests ---

    #[test]
    fn unsupported_constructor_sets_feature_and_empty_context() {
        let e = TransformationError::unsupported("LISTEN");
        match e {
            TransformationError::UnsupportedFeature {
                feature,
                context,
                suggestion,
            } => {
                assert_eq!(feature, "LISTEN");
                assert_eq!(context, "");
                assert!(suggestion.is_none());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn unsupported_with_context_keeps_all_fields() {
        let e = TransformationError::unsupported_with_context(
            "LISTEN",
            "edge function",
            Some("use trigger"),
        );
        match e {
            TransformationError::UnsupportedFeature {
                feature,
                context,
                suggestion,
            } => {
                assert_eq!(feature, "LISTEN");
                assert_eq!(context, "edge function");
                assert_eq!(suggestion.as_deref(), Some("use trigger"));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn unsupported_with_context_no_suggestion() {
        let e = TransformationError::unsupported_with_context("NOTIFY", "background", None);
        match e {
            TransformationError::UnsupportedFeature { suggestion, .. } => {
                assert!(suggestion.is_none());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn data_type_constructor_sets_fields() {
        let e = TransformationError::data_type("SERIAL", "INTEGER GENERATED ALWAYS", "id col");
        match e {
            TransformationError::DataTypeError {
                pg_type,
                suggested_hana_type,
                context,
            } => {
                assert_eq!(pg_type, "SERIAL");
                assert_eq!(suggested_hana_type, "INTEGER GENERATED ALWAYS");
                assert_eq!(context, "id col");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn function_constructor_sets_fields() {
        let e = TransformationError::function("NOW", "no hana equivalent");
        match e {
            TransformationError::FunctionError { function, reason } => {
                assert_eq!(function, "NOW");
                assert_eq!(reason, "no hana equivalent");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn function_constructor_display_includes_function_name() {
        let e = TransformationError::function("NOW", "no hana equivalent");
        assert!(format!("{e}").contains("NOW"));
    }

    #[test]
    fn validation_constructor_sets_fields() {
        let e = TransformationError::validation(
            vec!["X not allowed".into()],
            vec!["use Y".into()],
        );
        match e {
            TransformationError::ValidationError {
                hana_rule_violations,
                suggestions,
            } => {
                assert_eq!(hana_rule_violations, vec!["X not allowed"]);
                assert_eq!(suggestions, vec!["use Y"]);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn validation_constructor_display_includes_violation() {
        let e = TransformationError::validation(
            vec!["X not allowed".into()],
            vec!["use Y".into()],
        );
        assert!(format!("{e}").contains("X not allowed"));
    }

    #[test]
    fn partial_transformation_constructor_sets_fields() {
        let e = TransformationError::partial_transformation(
            3,
            1,
            Some("SELECT 1; SELECT 2;".into()),
            vec![],
        );
        match e {
            TransformationError::PartialTransformation {
                succeeded_statements,
                failed_statements,
                transformed_sql,
                errors,
            } => {
                assert_eq!(succeeded_statements, 3);
                assert_eq!(failed_statements, 1);
                assert_eq!(transformed_sql.as_deref(), Some("SELECT 1; SELECT 2;"));
                assert!(errors.is_empty());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn partial_transformation_with_nested_errors() {
        let inner = TransformationError::config("inner error");
        let e = TransformationError::partial_transformation(0, 1, None, vec![inner]);
        match e {
            TransformationError::PartialTransformation { errors, .. } => {
                assert_eq!(errors.len(), 1);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn config_constructor_sets_message() {
        let e = TransformationError::config("missing key");
        match e {
            TransformationError::ConfigError { message } => {
                assert_eq!(message, "missing key");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn config_constructor_display_includes_message() {
        let e = TransformationError::config("missing key");
        assert!(format!("{e}").contains("missing key"));
    }

    // --- Clone impl coverage ---

    #[test]
    fn parse_error_clones_correctly() {
        let e = TransformationError::ParseError {
            message: "msg".into(),
            line: 1,
            column: 2,
        };
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn unsupported_feature_clones_correctly() {
        let e = TransformationError::unsupported_with_context("A", "B", Some("C"));
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn data_type_error_clones_correctly() {
        let e = TransformationError::data_type("X", "Y", "Z");
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn function_error_clones_correctly() {
        let e = TransformationError::function("NOW", "reason");
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn config_error_clones_correctly() {
        let e = TransformationError::config("msg");
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn validation_error_clones_correctly() {
        let e = TransformationError::validation(vec!["v".into()], vec!["s".into()]);
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn partial_transformation_clones_correctly() {
        let e = TransformationError::partial_transformation(2, 1, Some("sql".into()), vec![]);
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn schema_error_clones_correctly() {
        let e = TransformationError::SchemaError { message: "schema msg".into() };
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn expression_error_clones_correctly() {
        let e = TransformationError::ExpressionError { message: "expr msg".into() };
        let c = e.clone();
        assert_eq!(format!("{e}"), format!("{c}"));
    }

    #[test]
    fn io_error_clones_correctly() {
        let io = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let e: TransformationError = io.into();
        let c = e.clone();
        assert!(matches!(c, TransformationError::IoError(_)));
    }

    // --- WarningSeverity tests ---

    #[test]
    fn warning_severity_eq() {
        assert_eq!(WarningSeverity::Low, WarningSeverity::Low);
        assert_eq!(WarningSeverity::Medium, WarningSeverity::Medium);
        assert_eq!(WarningSeverity::High, WarningSeverity::High);
        assert_ne!(WarningSeverity::Low, WarningSeverity::High);
        assert_ne!(WarningSeverity::Low, WarningSeverity::Medium);
        assert_ne!(WarningSeverity::Medium, WarningSeverity::High);
    }

    #[test]
    fn warning_severity_clones() {
        let s = WarningSeverity::High;
        assert_eq!(s.clone(), WarningSeverity::High);
    }

    // --- TransformationWarning constructors ---

    #[test]
    fn warning_new_sets_message_and_severity_no_location() {
        let w = TransformationWarning::new("something happened", WarningSeverity::Medium);
        assert_eq!(w.message, "something happened");
        assert_eq!(w.severity, WarningSeverity::Medium);
        assert!(w.location.is_none());
    }

    #[test]
    fn warning_constructors_low_medium_high() {
        let lo = TransformationWarning::low("x");
        let med = TransformationWarning::medium("x");
        let hi = TransformationWarning::high("x");
        assert_eq!(lo.severity, WarningSeverity::Low);
        assert_eq!(med.severity, WarningSeverity::Medium);
        assert_eq!(hi.severity, WarningSeverity::High);
    }

    #[test]
    fn warning_with_location_sets_all_fields() {
        let loc = SourceLocation::with_file(1, 2, "a.sql");
        let w = TransformationWarning::with_location("msg", WarningSeverity::Low, loc);
        let l = w.location.as_ref().unwrap();
        assert_eq!(l.line, 1);
        assert_eq!(l.column, 2);
        assert_eq!(l.file.as_deref(), Some("a.sql"));
        assert_eq!(w.message, "msg");
    }

    #[test]
    fn warning_display_includes_severity_and_message() {
        let w = TransformationWarning::high("critical warning");
        let s = format!("{w}");
        assert!(s.contains("critical warning"), "got: {s}");
        assert!(s.contains("High"), "got: {s}");
    }

    #[test]
    fn warning_display_with_location_includes_line_and_column() {
        let loc = SourceLocation::new(5, 10);
        let w = TransformationWarning::with_location("warning msg", WarningSeverity::Medium, loc);
        let s = format!("{w}");
        assert!(s.contains("line 5"), "got: {s}");
        assert!(s.contains("column 10"), "got: {s}");
    }

    #[test]
    fn warning_display_with_file_includes_filename() {
        let loc = SourceLocation::with_file(3, 7, "query.sql");
        let w = TransformationWarning::with_location("file warning", WarningSeverity::Low, loc);
        let s = format!("{w}");
        assert!(s.contains("query.sql"), "got: {s}");
    }

    #[test]
    fn warning_clones() {
        let w = TransformationWarning::high("test");
        let c = w.clone();
        assert_eq!(c.message, w.message);
        assert_eq!(c.severity, w.severity);
    }

    // --- SourceLocation tests ---

    #[test]
    fn source_location_new_has_no_file() {
        let l = SourceLocation::new(5, 6);
        assert_eq!(l.line, 5);
        assert_eq!(l.column, 6);
        assert!(l.file.is_none());
    }

    #[test]
    fn source_location_with_file_sets_all_fields() {
        let l = SourceLocation::with_file(10, 20, "x.sql");
        assert_eq!(l.line, 10);
        assert_eq!(l.column, 20);
        assert_eq!(l.file.as_deref(), Some("x.sql"));
    }

    #[test]
    fn source_location_clones() {
        let l = SourceLocation::with_file(1, 2, "f.sql");
        let c = l.clone();
        assert_eq!(c.line, 1);
        assert_eq!(c.column, 2);
        assert_eq!(c.file.as_deref(), Some("f.sql"));
    }

    // --- PerformanceMetrics tests ---

    #[test]
    fn performance_metrics_default_is_all_zeros() {
        let m = PerformanceMetrics::default();
        assert_eq!(m.parse_time_ms, 0);
        assert_eq!(m.transform_time_ms, 0);
        assert_eq!(m.total_time_ms, 0);
    }

    #[test]
    fn performance_metrics_field_assignment() {
        let m = PerformanceMetrics {
            parse_time_ms: 10,
            transform_time_ms: 20,
            total_time_ms: 30,
        };
        assert_eq!(m.parse_time_ms, 10);
        assert_eq!(m.transform_time_ms, 20);
        assert_eq!(m.total_time_ms, 30);
    }

    #[test]
    fn performance_metrics_clones() {
        let m = PerformanceMetrics {
            parse_time_ms: 5,
            transform_time_ms: 15,
            total_time_ms: 20,
        };
        let c = m.clone();
        assert_eq!(c.parse_time_ms, 5);
        assert_eq!(c.transform_time_ms, 15);
        assert_eq!(c.total_time_ms, 20);
    }

    // --- DetailedResult<T> tests ---

    #[test]
    fn detailed_result_ok_shape() {
        let r: DetailedResult<String> = DetailedResult {
            result: Ok("output".into()),
            warnings: vec!["w1".into()],
            metadata: None,
        };
        assert!(r.result.is_ok());
        assert_eq!(r.result.unwrap(), "output");
        assert_eq!(r.warnings.len(), 1);
        assert!(r.metadata.is_none());
    }

    #[test]
    fn detailed_result_err_shape() {
        let r: DetailedResult<String> = DetailedResult {
            result: Err(TransformationError::config("oops")),
            warnings: vec![],
            metadata: None,
        };
        assert!(r.result.is_err());
    }

    #[test]
    fn detailed_result_with_metadata() {
        let meta = EnhancedTransformationMetadata {
            transformations_applied: vec!["SERIAL->IDENTITY".into()],
            warnings: vec!["w".into()],
            performance_metrics: PerformanceMetrics {
                parse_time_ms: 1,
                transform_time_ms: 2,
                total_time_ms: 3,
            },
        };
        let r: DetailedResult<String> = DetailedResult {
            result: Ok("sql".into()),
            warnings: vec![],
            metadata: Some(meta),
        };
        let m = r.metadata.as_ref().unwrap();
        assert_eq!(m.transformations_applied, vec!["SERIAL->IDENTITY"]);
        assert_eq!(m.performance_metrics.total_time_ms, 3);
    }

    #[test]
    fn detailed_result_clones() {
        let r: DetailedResult<String> = DetailedResult {
            result: Ok("x".into()),
            warnings: vec!["w".into()],
            metadata: None,
        };
        let c = r.clone();
        assert!(c.result.is_ok());
        assert_eq!(c.warnings, vec!["w"]);
    }

    // --- EnhancedTransformationMetadata tests ---

    #[test]
    fn enhanced_metadata_field_shape() {
        let m = EnhancedTransformationMetadata {
            transformations_applied: vec!["rule1".into(), "rule2".into()],
            warnings: vec!["deprecated usage".into()],
            performance_metrics: PerformanceMetrics::default(),
        };
        assert_eq!(m.transformations_applied.len(), 2);
        assert_eq!(m.warnings.len(), 1);
        assert_eq!(m.performance_metrics.total_time_ms, 0);
    }

    #[test]
    fn enhanced_metadata_clones() {
        let m = EnhancedTransformationMetadata {
            transformations_applied: vec!["t1".into()],
            warnings: vec![],
            performance_metrics: PerformanceMetrics {
                parse_time_ms: 10,
                transform_time_ms: 5,
                total_time_ms: 15,
            },
        };
        let c = m.clone();
        assert_eq!(c.transformations_applied, vec!["t1"]);
        assert_eq!(c.performance_metrics.parse_time_ms, 10);
    }
}
