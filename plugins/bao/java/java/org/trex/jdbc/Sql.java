package org.trex.jdbc;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** SQL text helpers: literals, client-side parameter binding, statement kind. */
final class Sql {

    private static final Set<String> QUERY_KEYWORDS = Set.of(
            "SELECT", "WITH", "VALUES", "FROM", "TABLE", "SHOW", "DESCRIBE", "SUMMARIZE",
            "EXPLAIN", "PRAGMA", "CALL");

    private Sql() {
    }

    static String literal(String s) {
        return "'" + s.replace("'", "''") + "'";
    }

    /** A JDBC parameter value as a SQL literal. */
    static String literal(Object v) throws SQLException {
        if (v == null) {
            return "NULL";
        }
        if (v instanceof String) {
            return literal((String) v);
        }
        if (v instanceof Boolean) {
            return ((Boolean) v) ? "TRUE" : "FALSE";
        }
        if (v instanceof BigDecimal) {
            return ((BigDecimal) v).toPlainString();
        }
        if (v instanceof Float || v instanceof Double) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                return literal(Double.toString(d)) + "::DOUBLE";
            }
            return Double.toString(d);
        }
        if (v instanceof Number) {
            return v.toString();
        }
        if (v instanceof java.sql.Date) {
            return "DATE " + literal(((java.sql.Date) v).toLocalDate().toString());
        }
        if (v instanceof java.sql.Time) {
            return "TIME " + literal(((java.sql.Time) v).toLocalTime().toString());
        }
        if (v instanceof java.sql.Timestamp) {
            return "TIMESTAMP " + literal(((java.sql.Timestamp) v).toLocalDateTime().toString());
        }
        if (v instanceof java.util.Date) {
            return literal(new java.sql.Timestamp(((java.util.Date) v).getTime()));
        }
        if (v instanceof LocalDate) {
            return "DATE " + literal(v.toString());
        }
        if (v instanceof LocalTime) {
            return "TIME " + literal(v.toString());
        }
        if (v instanceof LocalDateTime) {
            return "TIMESTAMP " + literal(v.toString());
        }
        if (v instanceof OffsetDateTime) {
            return "TIMESTAMPTZ " + literal(v.toString());
        }
        if (v instanceof byte[]) {
            StringBuilder sb = new StringBuilder("'");
            for (byte b : (byte[]) v) {
                sb.append(String.format("\\x%02X", b & 0xff));
            }
            return sb.append("'::BLOB").toString();
        }
        if (v instanceof Character || v instanceof Enum || v instanceof java.util.UUID) {
            return literal(v.toString());
        }
        throw new SQLException("trexsql: cannot bind a parameter of type " + v.getClass().getName());
    }

    /**
     * Replaces each {@code ?} placeholder outside quotes and comments with the
     * matching literal.
     */
    static String bind(String sql, List<Object> params) throws SQLException {
        if (params.isEmpty()) {
            return sql;
        }
        StringBuilder out = new StringBuilder(sql.length() + params.size() * 8);
        int n = 0;
        int i = 0;
        int len = sql.length();
        while (i < len) {
            char c = sql.charAt(i);
            if (c == '\'' || c == '"') {
                int end = closingQuote(sql, i, c);
                out.append(sql, i, end);
                i = end;
            } else if (c == '-' && i + 1 < len && sql.charAt(i + 1) == '-') {
                int end = sql.indexOf('\n', i);
                end = end < 0 ? len : end;
                out.append(sql, i, end);
                i = end;
            } else if (c == '/' && i + 1 < len && sql.charAt(i + 1) == '*') {
                int end = sql.indexOf("*/", i + 2);
                end = end < 0 ? len : end + 2;
                out.append(sql, i, end);
                i = end;
            } else if (c == '?') {
                if (n >= params.size()) {
                    throw new SQLException("trexsql: more placeholders than parameters");
                }
                out.append(literal(params.get(n++)));
                i++;
            } else {
                out.append(c);
                i++;
            }
        }
        if (n != params.size()) {
            throw new SQLException("trexsql: " + params.size() + " parameters for " + n + " placeholders");
        }
        return out.toString();
    }

    private static int closingQuote(String sql, int start, char q) {
        int i = start + 1;
        while (i < sql.length()) {
            if (sql.charAt(i) == q) {
                if (i + 1 < sql.length() && sql.charAt(i + 1) == q) {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        return sql.length();
    }

    /** True when the statement produces rows rather than an update count. */
    static boolean returnsRows(String sql) {
        return QUERY_KEYWORDS.contains(leadingKeyword(sql));
    }

    static String leadingKeyword(String sql) {
        int i = 0;
        int len = sql.length();
        while (i < len) {
            char c = sql.charAt(i);
            if (Character.isWhitespace(c) || c == '(') {
                i++;
            } else if (c == '-' && i + 1 < len && sql.charAt(i + 1) == '-') {
                int end = sql.indexOf('\n', i);
                i = end < 0 ? len : end + 1;
            } else if (c == '/' && i + 1 < len && sql.charAt(i + 1) == '*') {
                int end = sql.indexOf("*/", i + 2);
                i = end < 0 ? len : end + 2;
            } else {
                break;
            }
        }
        int start = i;
        while (i < len && Character.isLetter(sql.charAt(i))) {
            i++;
        }
        return sql.substring(start, i).toUpperCase(Locale.ROOT);
    }
}
