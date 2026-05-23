use super::Transformer;
use crate::config::TransformationConfig;
use crate::error::TransformationResult;
use sqlparser::ast::{ColumnDef, DataType, Statement};
use std::collections::HashMap;

pub struct DataTypeTransformer {
    mappings: HashMap<String, String>,
    preserve_precision: bool,
}

impl DataTypeTransformer {
    pub fn new(config: &TransformationConfig) -> Self {
        let mut mappings = config.data_types.custom_mappings.clone();

        for (pg_type, hana_type) in get_default_mappings() {
            mappings.entry(pg_type).or_insert(hana_type);
        }

        Self {
            mappings,
            preserve_precision: config.data_types.preserve_precision,
        }
    }

    pub fn transform_data_type(&self, data_type: &mut DataType) -> TransformationResult<bool> {
        let mut changed = false;

        match data_type {
            DataType::Custom(object_name, type_values) => {
                let type_name = object_name.to_string().to_uppercase();

                if let Some(hana_type) = self.mappings.get(&type_name) {
                    if let Ok(new_type) = parse_hana_type(hana_type) {
                        *data_type = new_type;
                        changed = true;
                    }
                }
            }
            DataType::Varchar(length) => {
                *data_type = DataType::Nvarchar(length.clone());
                changed = true;
            }
            DataType::Char(length) => {
                *data_type = DataType::Nvarchar(length.clone());
                changed = true;
            }
            DataType::Text => {
                *data_type = DataType::Clob(None);
                changed = true;
            }
            DataType::JSON => {
                *data_type = DataType::Clob(None);
                changed = true;
            }
            DataType::Boolean => {}
            DataType::Integer(display) => {}
            DataType::BigInt(display) => {}
            DataType::Timestamp(precision, timezone) => {
                if *timezone == sqlparser::ast::TimezoneInfo::WithTimeZone {
                    *data_type =
                        DataType::Timestamp(precision.clone(), sqlparser::ast::TimezoneInfo::None);
                    changed = true;
                }
            }
            DataType::Array(element_type) => {
                *data_type = DataType::Clob(None);
                changed = true;
            }
            _ => {}
        }

        Ok(changed)
    }
}

impl Transformer for DataTypeTransformer {
    fn name(&self) -> &'static str {
        "DataTypeTransformer"
    }

    fn priority(&self) -> u8 {
        10
    }

    fn supports_statement_type(&self, stmt: &Statement) -> bool {
        matches!(
            stmt,
            Statement::CreateTable(_)
                | Statement::AlterTable { .. }
                | Statement::CreateIndex { .. }
        )
    }

    fn transform(&self, stmt: &mut Statement) -> TransformationResult<bool> {
        let mut changed = false;

        match stmt {
            Statement::CreateTable(create_table) => {
                for column in &mut create_table.columns {
                    if self.transform_column_data_type(column)? {
                        changed = true;
                    }
                }
            }
            Statement::AlterTable { operations, .. } => {
                for operation in operations {
                    match operation {
                        sqlparser::ast::AlterTableOperation::AddColumn { column_def, .. } => {
                            if self.transform_column_data_type(column_def)? {
                                changed = true;
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }

        Ok(changed)
    }
}

impl DataTypeTransformer {
    fn transform_column_data_type(&self, column: &mut ColumnDef) -> TransformationResult<bool> {
        let mut changed = false;

        if self.transform_data_type(&mut column.data_type)? {
            changed = true;
        }

        let mut is_serial_column = false;
        let mut is_bigserial_column = false;

        for option in &column.options {
            if let sqlparser::ast::ColumnOption::Default(expr) = &option.option {
                if let sqlparser::ast::Expr::Function(func) = expr {
                    if func.name.to_string().to_lowercase() == "nextval" {
                        if matches!(column.data_type, DataType::Integer(_)) {
                            is_serial_column = true;
                        } else if matches!(column.data_type, DataType::BigInt(_)) {
                            is_bigserial_column = true;
                        }
                        break;
                    }
                }
            }
        }

        if is_serial_column {
            column.options.retain(|opt| {
                !matches!(opt.option, sqlparser::ast::ColumnOption::Default(ref expr)
                    if matches!(expr, sqlparser::ast::Expr::Function(ref func)
                        if func.name.to_string().to_lowercase() == "nextval"))
            });

            column.options.push(sqlparser::ast::ColumnOptionDef {
                name: None,
                option: sqlparser::ast::ColumnOption::Generated {
                    generated_as: sqlparser::ast::GeneratedAs::ByDefault,
                    sequence_options: None,
                    generation_expr: None,
                    generation_expr_mode: None,
                    generated_keyword: true,
                },
            });
            changed = true;
        } else if is_bigserial_column {
            column.options.retain(|opt| {
                !matches!(opt.option, sqlparser::ast::ColumnOption::Default(ref expr)
                    if matches!(expr, sqlparser::ast::Expr::Function(ref func)
                        if func.name.to_string().to_lowercase() == "nextval"))
            });

            column.options.push(sqlparser::ast::ColumnOptionDef {
                name: None,
                option: sqlparser::ast::ColumnOption::Generated {
                    generated_as: sqlparser::ast::GeneratedAs::ByDefault,
                    sequence_options: None,
                    generation_expr: None,
                    generation_expr_mode: None,
                    generated_keyword: true,
                },
            });
            changed = true;
        }

        Ok(changed)
    }
}

fn get_default_mappings() -> HashMap<String, String> {
    let mut mappings = HashMap::new();

    mappings.insert("SERIAL".to_string(), "INTEGER".to_string());
    mappings.insert("BIGSERIAL".to_string(), "BIGINT".to_string());
    mappings.insert("TEXT".to_string(), "NCLOB".to_string());
    mappings.insert("JSON".to_string(), "NCLOB".to_string());
    mappings.insert("JSONB".to_string(), "NCLOB".to_string());
    mappings.insert("UUID".to_string(), "NVARCHAR(36)".to_string());
    mappings.insert("INET".to_string(), "NVARCHAR(45)".to_string());
    mappings.insert("MACADDR".to_string(), "NVARCHAR(17)".to_string());
    mappings.insert("BYTEA".to_string(), "BLOB".to_string());

    mappings
}

fn parse_hana_type(type_str: &str) -> Result<DataType, String> {
    let type_str = type_str.to_uppercase();

    match type_str.as_str() {
        "NCLOB" => Ok(DataType::Clob(None)),
        "BLOB" => Ok(DataType::Blob(None)),
        "INTEGER" => Ok(DataType::Integer(None)),
        "BIGINT" => Ok(DataType::BigInt(None)),
        s if s.starts_with("NVARCHAR(") && s.ends_with(')') => {
            let len_str = &s[9..s.len() - 1];
            if let Ok(length) = len_str.parse::<u64>() {
                Ok(DataType::Nvarchar(Some(
                    sqlparser::ast::CharacterLength::IntegerLength { length, unit: None },
                )))
            } else {
                Err(format!("Invalid NVARCHAR length: {}", len_str))
            }
        }
        s if s.starts_with("NCHAR(") && s.ends_with(')') => {
            let len_str = &s[6..s.len() - 1];
            if let Ok(length) = len_str.parse::<u64>() {
                Ok(DataType::Nvarchar(Some(
                    sqlparser::ast::CharacterLength::IntegerLength { length, unit: None },
                )))
            } else {
                Err(format!("Invalid NCHAR length: {}", len_str))
            }
        }
        _ => Err(format!("Unsupported HANA type: {}", type_str)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::TransformationConfig;
    use sqlparser::ast::{
        ArrayElemTypeDef, DataType, ObjectName, ObjectNamePart, TimezoneInfo,
    };

    fn transformer() -> DataTypeTransformer {
        DataTypeTransformer::new(&TransformationConfig::default())
    }

    fn make_custom(name: &str) -> DataType {
        DataType::Custom(
            ObjectName(vec![ObjectNamePart::Identifier(
                sqlparser::ast::Ident::new(name),
            )]),
            vec![],
        )
    }

    // --- DataTypeTransformer::new ---

    #[test]
    fn new_creates_transformer_without_panicking() {
        let _t = transformer();
    }

    #[test]
    fn new_with_custom_mapping_includes_it() {
        let mut config = TransformationConfig::default();
        config
            .data_types
            .custom_mappings
            .insert("MYTYPE".to_string(), "NCLOB".to_string());
        let t = DataTypeTransformer::new(&config);
        let mut dt = make_custom("mytype");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    // --- transform_data_type: Varchar ---

    #[test]
    fn varchar_no_length_becomes_nvarchar() {
        let t = transformer();
        let mut dt = DataType::Varchar(None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Nvarchar(None)));
    }

    #[test]
    fn varchar_with_length_becomes_nvarchar_with_same_length() {
        let t = transformer();
        let mut dt = DataType::Varchar(Some(
            sqlparser::ast::CharacterLength::IntegerLength { length: 100, unit: None },
        ));
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 100),
            other => panic!("expected Nvarchar(100), got {:?}", other),
        }
    }

    // --- transform_data_type: Char ---

    #[test]
    fn char_becomes_nvarchar() {
        let t = transformer();
        let mut dt = DataType::Char(None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Nvarchar(None)));
    }

    #[test]
    fn char_with_length_becomes_nvarchar_same_length() {
        let t = transformer();
        let mut dt = DataType::Char(Some(
            sqlparser::ast::CharacterLength::IntegerLength { length: 20, unit: None },
        ));
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 20),
            other => panic!("expected Nvarchar(20), got {:?}", other),
        }
    }

    // --- transform_data_type: Text ---

    #[test]
    fn text_becomes_clob() {
        let t = transformer();
        let mut dt = DataType::Text;
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    // --- transform_data_type: JSON ---

    #[test]
    fn json_becomes_clob() {
        let t = transformer();
        let mut dt = DataType::JSON;
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    // --- transform_data_type: Boolean (no-op) ---

    #[test]
    fn boolean_is_no_op() {
        let t = transformer();
        let mut dt = DataType::Boolean;
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(!changed);
        assert!(matches!(dt, DataType::Boolean));
    }

    // --- transform_data_type: Integer (no-op) ---

    #[test]
    fn integer_is_no_op() {
        let t = transformer();
        let mut dt = DataType::Integer(None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(!changed);
        assert!(matches!(dt, DataType::Integer(None)));
    }

    // --- transform_data_type: BigInt (no-op) ---

    #[test]
    fn bigint_is_no_op() {
        let t = transformer();
        let mut dt = DataType::BigInt(None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(!changed);
        assert!(matches!(dt, DataType::BigInt(None)));
    }

    // --- transform_data_type: Timestamp ---

    #[test]
    fn timestamp_with_timezone_stripped() {
        let t = transformer();
        let mut dt = DataType::Timestamp(None, TimezoneInfo::WithTimeZone);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Timestamp(_, tz) => assert_eq!(tz, TimezoneInfo::None),
            other => panic!("expected Timestamp, got {:?}", other),
        }
    }

    #[test]
    fn timestamp_without_timezone_is_no_op() {
        let t = transformer();
        let mut dt = DataType::Timestamp(None, TimezoneInfo::None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(!changed);
    }

    #[test]
    fn timestamp_tz_preserves_precision() {
        let t = transformer();
        let mut dt = DataType::Timestamp(Some(6), TimezoneInfo::WithTimeZone);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Timestamp(Some(p), tz) => {
                assert_eq!(p, 6);
                assert_eq!(tz, TimezoneInfo::None);
            }
            other => panic!("expected Timestamp(6, None), got {:?}", other),
        }
    }

    // --- transform_data_type: Array ---

    #[test]
    fn array_becomes_clob() {
        let t = transformer();
        let mut dt = DataType::Array(ArrayElemTypeDef::None);
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    // --- transform_data_type: Custom (via default mappings) ---

    #[test]
    fn custom_serial_becomes_integer() {
        let t = transformer();
        let mut dt = make_custom("SERIAL");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Integer(None)));
    }

    #[test]
    fn custom_bigserial_becomes_bigint() {
        let t = transformer();
        let mut dt = make_custom("BIGSERIAL");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::BigInt(None)));
    }

    #[test]
    fn custom_text_via_mapping_becomes_clob() {
        // default mappings map TEXT → NCLOB
        let t = transformer();
        let mut dt = make_custom("TEXT");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    #[test]
    fn custom_json_via_mapping_becomes_clob() {
        let t = transformer();
        let mut dt = make_custom("JSON");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    #[test]
    fn custom_jsonb_becomes_clob() {
        let t = transformer();
        let mut dt = make_custom("JSONB");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Clob(None)));
    }

    #[test]
    fn custom_uuid_becomes_nvarchar36() {
        let t = transformer();
        let mut dt = make_custom("UUID");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 36),
            other => panic!("expected Nvarchar(36), got {:?}", other),
        }
    }

    #[test]
    fn custom_inet_becomes_nvarchar45() {
        let t = transformer();
        let mut dt = make_custom("INET");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 45),
            other => panic!("expected Nvarchar(45), got {:?}", other),
        }
    }

    #[test]
    fn custom_macaddr_becomes_nvarchar17() {
        let t = transformer();
        let mut dt = make_custom("MACADDR");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 17),
            other => panic!("expected Nvarchar(17), got {:?}", other),
        }
    }

    #[test]
    fn custom_bytea_becomes_blob() {
        let t = transformer();
        let mut dt = make_custom("BYTEA");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Blob(None)));
    }

    #[test]
    fn custom_unknown_type_is_no_op() {
        let t = transformer();
        let mut dt = make_custom("UNKNOWNPGTYPE");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(!changed);
    }

    #[test]
    fn custom_type_name_is_case_insensitive() {
        // "serial" lowercase should still map to INTEGER
        let t = transformer();
        let mut dt = make_custom("serial");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Integer(None)));
    }

    // --- parse_hana_type (tested indirectly via custom mappings) ---

    #[test]
    fn parse_nvarchar_with_valid_length_via_custom_mapping() {
        let mut config = TransformationConfig::default();
        config
            .data_types
            .custom_mappings
            .insert("MYUUID".to_string(), "NVARCHAR(36)".to_string());
        let t = DataTypeTransformer::new(&config);
        let mut dt = make_custom("MYUUID");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 36),
            other => panic!("expected Nvarchar(36), got {:?}", other),
        }
    }

    #[test]
    fn parse_nchar_with_valid_length_via_custom_mapping() {
        let mut config = TransformationConfig::default();
        config
            .data_types
            .custom_mappings
            .insert("MYCHAR".to_string(), "NCHAR(10)".to_string());
        let t = DataTypeTransformer::new(&config);
        let mut dt = make_custom("MYCHAR");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        match dt {
            DataType::Nvarchar(Some(sqlparser::ast::CharacterLength::IntegerLength {
                length,
                ..
            })) => assert_eq!(length, 10),
            other => panic!("expected Nvarchar(10) from NCHAR, got {:?}", other),
        }
    }

    #[test]
    fn parse_blob_via_custom_mapping() {
        let mut config = TransformationConfig::default();
        config
            .data_types
            .custom_mappings
            .insert("MYBINARY".to_string(), "BLOB".to_string());
        let t = DataTypeTransformer::new(&config);
        let mut dt = make_custom("MYBINARY");
        let changed = t.transform_data_type(&mut dt).unwrap();
        assert!(changed);
        assert!(matches!(dt, DataType::Blob(None)));
    }

    // --- transform via Transformer trait (CREATE TABLE end-to-end) ---

    #[test]
    fn create_table_varchar_column_becomes_nvarchar() {
        use crate::{Dialect, SqlTransformer};
        let t = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        let result = t.transform("CREATE TABLE t (col VARCHAR(50))").unwrap();
        // NVARCHAR(50) contains "NVARCHAR", not just "VARCHAR" without the N prefix
        assert!(result.to_uppercase().contains("NVARCHAR(50)"));
    }

    #[test]
    fn create_table_text_column_becomes_clob() {
        use crate::{Dialect, SqlTransformer};
        let t = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        let result = t.transform("CREATE TABLE t (col TEXT)").unwrap();
        assert!(result.to_uppercase().contains("CLOB") || result.to_uppercase().contains("NCLOB"));
    }

    #[test]
    fn alter_table_add_column_varchar_becomes_nvarchar() {
        use crate::{Dialect, SqlTransformer};
        let t = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        let result = t
            .transform("ALTER TABLE t ADD COLUMN col VARCHAR(100)")
            .unwrap();
        assert!(result.contains("NVARCHAR"));
    }

    #[test]
    fn create_table_timestamptz_column_strips_timezone() {
        use crate::{Dialect, SqlTransformer};
        let t = SqlTransformer::new(TransformationConfig::default(), Dialect::Hana).unwrap();
        let result = t
            .transform("CREATE TABLE t (ts TIMESTAMP WITH TIME ZONE)")
            .unwrap();
        // Should not contain WITH TIME ZONE in output
        assert!(!result.to_uppercase().contains("WITH TIME ZONE"));
    }
}
