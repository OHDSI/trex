use sqlparser::dialect::Dialect;

#[derive(Debug)]
pub struct HanaDialect;

impl HanaDialect {
    pub fn new() -> Self {
        Self
    }
}

impl Dialect for HanaDialect {
    fn identifier_quote_style(&self, _identifier: &str) -> Option<char> {
        Some('"')
    }

    fn is_identifier_start(&self, ch: char) -> bool {
        ch.is_ascii_lowercase() || ch.is_ascii_uppercase() || ch == '_' || ch == '$'
    }

    fn is_identifier_part(&self, ch: char) -> bool {
        ch.is_ascii_lowercase()
            || ch.is_ascii_uppercase()
            || ch.is_ascii_digit()
            || ch == '_'
            || ch == '$'
            || ch == '#'
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_constructs() {
        let _ = HanaDialect::new();
    }

    #[test]
    fn identifier_quote_style_is_double_quote() {
        let d = HanaDialect::new();
        assert_eq!(d.identifier_quote_style("any"), Some('"'));
    }

    #[test]
    fn is_identifier_start_accepts_letters_and_underscore() {
        let d = HanaDialect::new();
        assert!(d.is_identifier_start('a'));
        assert!(d.is_identifier_start('Z'));
        assert!(d.is_identifier_start('_'));
        assert!(d.is_identifier_start('$'));
        assert!(!d.is_identifier_start('1'));
        assert!(!d.is_identifier_start('-'));
    }

    #[test]
    fn is_identifier_part_accepts_digits_and_hash() {
        let d = HanaDialect::new();
        assert!(d.is_identifier_part('0'));
        assert!(d.is_identifier_part('9'));
        assert!(d.is_identifier_part('#'));
        assert!(d.is_identifier_part('_'));
        assert!(!d.is_identifier_part('-'));
        assert!(!d.is_identifier_part(' '));
    }
}
