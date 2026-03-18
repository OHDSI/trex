use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmLibrary {
    pub identifier: Option<ElmIdentifier>,
    #[serde(default)]
    pub parameters: Option<ElmParameterDefs>,
    #[serde(default)]
    pub statements: Option<ElmStatements>,
    #[serde(default)]
    pub includes: Option<ElmIncludeDefs>,
    #[serde(rename = "usings", default)]
    pub usings: Option<ElmUsingDefs>,
    #[serde(default)]
    pub valueSets: Option<ElmValueSetDefs>,
    #[serde(default)]
    pub codeSystems: Option<ElmCodeSystemDefs>,
    #[serde(default)]
    pub codes: Option<ElmCodeDefs>,
    #[serde(default)]
    pub contexts: Option<ElmContextDefs>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmIdentifier {
    pub id: Option<String>,
    pub version: Option<String>,
    pub system: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmParameterDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmParameterDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmParameterDef {
    pub name: String,
    #[serde(rename = "accessLevel", default)]
    pub access_level: Option<String>,
    #[serde(rename = "parameterTypeSpecifier")]
    pub parameter_type_specifier: Option<ElmTypeSpecifier>,
    pub default: Option<Box<ElmExpression>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmStatements {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmExpressionDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmExpressionDef {
    pub name: String,
    pub context: Option<String>,
    #[serde(rename = "accessLevel", default)]
    pub access_level: Option<String>,
    pub expression: Box<ElmExpression>,
    #[serde(rename = "resultTypeSpecifier")]
    pub result_type_specifier: Option<ElmTypeSpecifier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmIncludeDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmIncludeDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmIncludeDef {
    #[serde(rename = "localIdentifier")]
    pub local_identifier: String,
    pub path: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmUsingDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmUsingDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmUsingDef {
    #[serde(rename = "localIdentifier")]
    pub local_identifier: String,
    pub uri: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmValueSetDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmValueSetDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmValueSetDef {
    pub name: String,
    pub id: String,
    #[serde(rename = "accessLevel", default)]
    pub access_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCodeSystemDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmCodeSystemDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCodeSystemDef {
    pub name: String,
    pub id: String,
    #[serde(rename = "accessLevel", default)]
    pub access_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCodeDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmCodeDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCodeDef {
    pub name: String,
    pub id: String,
    pub display: Option<String>,
    #[serde(rename = "codeSystem")]
    pub code_system: Option<ElmCodeSystemRef>,
    #[serde(rename = "accessLevel", default)]
    pub access_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCodeSystemRef {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmContextDefs {
    #[serde(rename = "def", default)]
    pub defs: Vec<ElmContextDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmContextDef {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ElmTypeSpecifier {
    NamedTypeSpecifier {
        name: String,
    },
    ListTypeSpecifier {
        #[serde(rename = "elementType")]
        element_type: Box<ElmTypeSpecifier>,
    },
    IntervalTypeSpecifier {
        #[serde(rename = "pointType")]
        point_type: Box<ElmTypeSpecifier>,
    },
    TupleTypeSpecifier {
        #[serde(default)]
        element: Vec<ElmTupleElementDef>,
    },
    ChoiceTypeSpecifier {
        #[serde(default)]
        choice: Vec<ElmTypeSpecifier>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmTupleElementDef {
    pub name: String,
    #[serde(rename = "elementType")]
    pub element_type: ElmTypeSpecifier,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ElmExpression {
    Retrieve {
        #[serde(rename = "dataType")]
        data_type: String,
        #[serde(rename = "templateId")]
        template_id: Option<String>,
        #[serde(rename = "codeProperty")]
        code_property: Option<String>,
        codes: Option<Box<ElmExpression>>,
        #[serde(rename = "dateProperty")]
        date_property: Option<String>,
        #[serde(rename = "dateRange")]
        date_range: Option<Box<ElmExpression>>,
    },
    Property {
        source: Option<Box<ElmExpression>>,
        path: String,
        scope: Option<String>,
        #[serde(rename = "resultTypeName")]
        result_type_name: Option<String>,
    },
    FunctionRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
        #[serde(default)]
        operand: Vec<ElmExpression>,
    },

    Query {
        source: Vec<ElmAliasedQuerySource>,
        #[serde(rename = "let", default)]
        let_clauses: Vec<ElmLetClause>,
        relationship: Option<Vec<ElmRelationship>>,
        #[serde(rename = "where")]
        where_clause: Option<Box<ElmExpression>>,
        #[serde(rename = "return")]
        return_clause: Option<ElmReturnClause>,
        sort: Option<ElmSortClause>,
    },
    AliasRef {
        name: String,
    },

    Literal {
        #[serde(rename = "valueType")]
        value_type: Option<String>,
        value: Option<String>,
    },
    Null {
        #[serde(rename = "resultTypeName")]
        result_type_name: Option<String>,
    },
    #[serde(rename = "List")]
    ListExpr {
        #[serde(default)]
        element: Vec<ElmExpression>,
    },
    Tuple {
        #[serde(default)]
        element: Vec<ElmTupleElement>,
    },

    Equal {
        operand: [Box<ElmExpression>; 2],
    },
    NotEqual {
        operand: [Box<ElmExpression>; 2],
    },
    Less {
        operand: [Box<ElmExpression>; 2],
    },
    LessOrEqual {
        operand: [Box<ElmExpression>; 2],
    },
    Greater {
        operand: [Box<ElmExpression>; 2],
    },
    GreaterOrEqual {
        operand: [Box<ElmExpression>; 2],
    },
    Equivalent {
        operand: [Box<ElmExpression>; 2],
    },

    And {
        operand: [Box<ElmExpression>; 2],
    },
    Or {
        operand: [Box<ElmExpression>; 2],
    },
    Not {
        operand: Box<ElmExpression>,
    },
    IsTrue {
        operand: Box<ElmExpression>,
    },
    IsFalse {
        operand: Box<ElmExpression>,
    },

    Add {
        operand: [Box<ElmExpression>; 2],
    },
    Subtract {
        operand: [Box<ElmExpression>; 2],
    },
    Multiply {
        operand: [Box<ElmExpression>; 2],
    },
    Divide {
        operand: [Box<ElmExpression>; 2],
    },
    Modulo {
        operand: [Box<ElmExpression>; 2],
    },
    Negate {
        operand: Box<ElmExpression>,
    },

    Concatenate {
        #[serde(default)]
        operand: Vec<ElmExpression>,
    },

    As {
        operand: Box<ElmExpression>,
        #[serde(rename = "asType")]
        as_type: Option<String>,
        #[serde(rename = "asTypeSpecifier")]
        as_type_specifier: Option<ElmTypeSpecifier>,
        strict: Option<bool>,
    },
    Is {
        operand: Box<ElmExpression>,
        #[serde(rename = "isType")]
        is_type: Option<String>,
        #[serde(rename = "isTypeSpecifier")]
        is_type_specifier: Option<ElmTypeSpecifier>,
    },
    ToBoolean {
        operand: Box<ElmExpression>,
    },
    ToInteger {
        operand: Box<ElmExpression>,
    },
    ToDecimal {
        operand: Box<ElmExpression>,
    },
    ToString {
        operand: Box<ElmExpression>,
    },
    ToDateTime {
        operand: Box<ElmExpression>,
    },
    ToDate {
        operand: Box<ElmExpression>,
    },

    Exists {
        operand: Box<ElmExpression>,
    },
    IsNull {
        operand: Box<ElmExpression>,
    },
    Coalesce {
        #[serde(default)]
        operand: Vec<ElmExpression>,
    },
    #[serde(rename = "If")]
    IfExpr {
        condition: Box<ElmExpression>,
        then: Box<ElmExpression>,
        #[serde(rename = "else")]
        else_clause: Box<ElmExpression>,
    },
    Case {
        comparand: Option<Box<ElmExpression>>,
        #[serde(rename = "caseItem", default)]
        case_items: Vec<ElmCaseItem>,
        #[serde(rename = "else")]
        else_clause: Box<ElmExpression>,
    },

    ExpressionRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
    },
    ParameterRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
    },
    ValueSetRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
    },
    CodeRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
    },
    CodeSystemRef {
        name: String,
        #[serde(rename = "libraryName")]
        library_name: Option<String>,
    },

    InValueSet {
        code: Box<ElmExpression>,
        valueset: Box<ElmExpression>,
    },
    In {
        operand: [Box<ElmExpression>; 2],
    },
    Contains {
        operand: [Box<ElmExpression>; 2],
    },

    Count {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Sum {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Min {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Max {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Avg {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    First {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Last {
        #[serde(alias = "operand")]
        source: Box<ElmExpression>,
    },
    Distinct {
        operand: Box<ElmExpression>,
    },
    Flatten {
        operand: Box<ElmExpression>,
    },
    SingletonFrom {
        operand: Box<ElmExpression>,
    },

    Interval {
        low: Option<Box<ElmExpression>>,
        high: Option<Box<ElmExpression>>,
        #[serde(rename = "lowClosed", default = "default_true")]
        low_closed: bool,
        #[serde(rename = "highClosed", default = "default_true")]
        high_closed: bool,
    },

    Now {},
    Today {},
    DateTime {
        year: Box<ElmExpression>,
        month: Option<Box<ElmExpression>>,
        day: Option<Box<ElmExpression>>,
        hour: Option<Box<ElmExpression>>,
        minute: Option<Box<ElmExpression>>,
        second: Option<Box<ElmExpression>>,
    },
    Date {
        year: Box<ElmExpression>,
        month: Option<Box<ElmExpression>>,
        day: Option<Box<ElmExpression>>,
    },

    // String functions
    Length {
        operand: Box<ElmExpression>,
    },
    Upper {
        operand: Box<ElmExpression>,
    },
    Lower {
        operand: Box<ElmExpression>,
    },
    StartsWith {
        operand: [Box<ElmExpression>; 2],
    },
    EndsWith {
        operand: [Box<ElmExpression>; 2],
    },
    Substring {
        #[serde(rename = "stringToSub")]
        string_to_sub: Box<ElmExpression>,
        #[serde(rename = "startIndex")]
        start_index: Box<ElmExpression>,
        length: Option<Box<ElmExpression>>,
    },
    PositionOf {
        pattern: Box<ElmExpression>,
        string: Box<ElmExpression>,
    },
    Combine {
        source: Box<ElmExpression>,
        separator: Option<Box<ElmExpression>>,
    },
    Split {
        #[serde(rename = "stringToSplit")]
        string_to_split: Box<ElmExpression>,
        separator: Box<ElmExpression>,
    },
    Replace {
        argument: Box<ElmExpression>,
        pattern: Box<ElmExpression>,
        substitution: Box<ElmExpression>,
    },
    Matches {
        operand: [Box<ElmExpression>; 2],
    },

    // Math functions
    Abs {
        operand: Box<ElmExpression>,
    },
    Round {
        operand: Box<ElmExpression>,
        precision: Option<Box<ElmExpression>>,
    },
    Floor {
        operand: Box<ElmExpression>,
    },
    Ceiling {
        operand: Box<ElmExpression>,
    },
    Truncate {
        operand: Box<ElmExpression>,
    },
    Ln {
        operand: Box<ElmExpression>,
    },
    Exp {
        operand: Box<ElmExpression>,
    },
    Power {
        operand: [Box<ElmExpression>; 2],
    },

    // Temporal comparisons
    Before {
        operand: [Box<ElmExpression>; 2],
    },
    After {
        operand: [Box<ElmExpression>; 2],
    },
    SameOrBefore {
        operand: [Box<ElmExpression>; 2],
    },
    SameOrAfter {
        operand: [Box<ElmExpression>; 2],
    },
    DurationBetween {
        operand: [Box<ElmExpression>; 2],
        precision: Option<String>,
    },
    DifferenceBetween {
        operand: [Box<ElmExpression>; 2],
        precision: Option<String>,
    },
    CalculateAge {
        operand: Box<ElmExpression>,
        precision: Option<String>,
    },
    CalculateAgeAt {
        operand: [Box<ElmExpression>; 2],
        precision: Option<String>,
    },

    // Set operations
    Union {
        operand: [Box<ElmExpression>; 2],
    },
    Intersect {
        operand: [Box<ElmExpression>; 2],
    },
    Except {
        operand: [Box<ElmExpression>; 2],
    },

    #[serde(other)]
    Unsupported,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmTupleElement {
    pub name: String,
    pub value: ElmExpression,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmAliasedQuerySource {
    pub alias: String,
    pub expression: ElmExpression,
    #[serde(rename = "resultTypeSpecifier")]
    pub result_type_specifier: Option<ElmTypeSpecifier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmLetClause {
    pub identifier: String,
    pub expression: ElmExpression,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ElmRelationship {
    With {
        alias: String,
        expression: ElmExpression,
        #[serde(rename = "suchThat")]
        such_that: Option<ElmExpression>,
    },
    Without {
        alias: String,
        expression: ElmExpression,
        #[serde(rename = "suchThat")]
        such_that: Option<ElmExpression>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmReturnClause {
    pub expression: Box<ElmExpression>,
    pub distinct: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmSortClause {
    #[serde(rename = "by", default)]
    pub by: Vec<ElmSortByItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmSortByItem {
    pub direction: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElmCaseItem {
    pub when: ElmExpression,
    pub then: ElmExpression,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_elm() {
        let json = r#"{
            "identifier": {"id": "Test", "version": "1.0.0"},
            "statements": {
                "def": [
                    {
                        "name": "InDemographic",
                        "context": "Patient",
                        "expression": {
                            "type": "GreaterOrEqual",
                            "operand": [
                                {
                                    "type": "Property",
                                    "path": "birthDate"
                                },
                                {
                                    "type": "Literal",
                                    "valueType": "{urn:hl7-org:elm-types:r1}Date",
                                    "value": "2000-01-01"
                                }
                            ]
                        }
                    }
                ]
            }
        }"#;

        let lib: ElmLibrary = serde_json::from_str(json).unwrap();
        assert_eq!(lib.identifier.unwrap().id.unwrap(), "Test");
        let stmts = lib.statements.unwrap();
        assert_eq!(stmts.defs.len(), 1);
        assert_eq!(stmts.defs[0].name, "InDemographic");
    }

    #[test]
    fn test_parse_retrieve() {
        let json = r#"{
            "type": "Retrieve",
            "dataType": "{http://hl7.org/fhir}Condition",
            "codeProperty": "code"
        }"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        match expr {
            ElmExpression::Retrieve { data_type, .. } => {
                assert_eq!(data_type, "{http://hl7.org/fhir}Condition");
            }
            _ => panic!("Expected Retrieve"),
        }
    }

    #[test]
    fn test_parse_query() {
        let json = r#"{
            "type": "Query",
            "source": [{
                "alias": "C",
                "expression": {
                    "type": "Retrieve",
                    "dataType": "{http://hl7.org/fhir}Condition"
                }
            }],
            "where": {
                "type": "Equal",
                "operand": [
                    {"type": "Property", "path": "status", "scope": "C"},
                    {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "active"}
                ]
            }
        }"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        match expr {
            ElmExpression::Query { source, where_clause, .. } => {
                assert_eq!(source.len(), 1);
                assert_eq!(source[0].alias, "C");
                assert!(where_clause.is_some());
            }
            _ => panic!("Expected Query"),
        }
    }

    #[test]
    fn test_parse_date() {
        let json = r#"{
            "type": "Date",
            "year": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "2024"},
            "month": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "6"},
            "day": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "15"}
        }"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        match expr {
            ElmExpression::Date { year, month, day } => {
                assert!(month.is_some());
                assert!(day.is_some());
                match *year {
                    ElmExpression::Literal { ref value, .. } => {
                        assert_eq!(value.as_deref(), Some("2024"));
                    }
                    _ => panic!("Expected Literal year"),
                }
            }
            _ => panic!("Expected Date"),
        }
    }

    #[test]
    fn test_parse_string_functions() {
        let json = r#"{"type": "Upper", "operand": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "hello"}}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Upper { .. }));

        let json = r#"{"type": "Length", "operand": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "hello"}}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Length { .. }));

        let json = r#"{"type": "StartsWith", "operand": [
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "hello"},
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "he"}
        ]}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::StartsWith { .. }));
    }

    #[test]
    fn test_parse_temporal_ops() {
        let json = r#"{"type": "Before", "operand": [
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2020-01-01"},
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2021-01-01"}
        ]}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Before { .. }));

        let json = r#"{"type": "DurationBetween", "precision": "Year", "operand": [
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2020-01-01"},
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2023-01-01"}
        ]}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        match expr {
            ElmExpression::DurationBetween { precision, .. } => {
                assert_eq!(precision.as_deref(), Some("Year"));
            }
            _ => panic!("Expected DurationBetween"),
        }
    }

    #[test]
    fn test_parse_math_functions() {
        let json = r#"{"type": "Abs", "operand": {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "-5"}}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Abs { .. }));

        let json = r#"{"type": "Power", "operand": [
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "2"},
            {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Integer", "value": "3"}
        ]}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Power { .. }));
    }

    #[test]
    fn test_parse_set_operations() {
        let json = r#"{"type": "Union", "operand": [
            {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"},
            {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}
        ]}"#;
        let expr: ElmExpression = serde_json::from_str(json).unwrap();
        assert!(matches!(expr, ElmExpression::Union { .. }));
    }
}
