package org.trex.jdbc;

import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;

final class TrexsqlResultSetMetaData extends BaseResultSetMetaData {

    private final NativeEngine.Rows rows;

    TrexsqlResultSetMetaData(NativeEngine.Rows rows) {
        this.rows = rows;
    }

    private int type(int column) throws SQLException {
        if (column < 1 || column > rows.types.length) {
            throw new SQLException("trexsql: column index " + column + " out of range");
        }
        return rows.types[column - 1];
    }

    @Override
    public int getColumnCount() {
        return rows.names.length;
    }

    @Override
    public String getColumnName(int column) throws SQLException {
        type(column);
        return rows.names[column - 1];
    }

    @Override
    public String getColumnLabel(int column) throws SQLException {
        return getColumnName(column);
    }

    @Override
    public int getColumnType(int column) throws SQLException {
        switch (type(column)) {
            case NativeEngine.TYPE_BOOLEAN: return Types.BOOLEAN;
            case NativeEngine.TYPE_INTEGER: return Types.INTEGER;
            case NativeEngine.TYPE_BIGINT: return Types.BIGINT;
            case NativeEngine.TYPE_DOUBLE: return Types.DOUBLE;
            case NativeEngine.TYPE_DECIMAL: return Types.DECIMAL;
            case NativeEngine.TYPE_VARCHAR: return Types.VARCHAR;
            case NativeEngine.TYPE_DATE: return Types.DATE;
            case NativeEngine.TYPE_TIMESTAMP: return Types.TIMESTAMP;
            case NativeEngine.TYPE_TIME: return Types.TIME;
            case NativeEngine.TYPE_BLOB: return Types.BLOB;
            default: return Types.OTHER;
        }
    }

    @Override
    public String getColumnTypeName(int column) throws SQLException {
        switch (type(column)) {
            case NativeEngine.TYPE_BOOLEAN: return "BOOLEAN";
            case NativeEngine.TYPE_INTEGER: return "INTEGER";
            case NativeEngine.TYPE_BIGINT: return "BIGINT";
            case NativeEngine.TYPE_DOUBLE: return "DOUBLE";
            case NativeEngine.TYPE_DECIMAL: return "DECIMAL";
            case NativeEngine.TYPE_VARCHAR: return "VARCHAR";
            case NativeEngine.TYPE_DATE: return "DATE";
            case NativeEngine.TYPE_TIMESTAMP: return "TIMESTAMP";
            case NativeEngine.TYPE_TIME: return "TIME";
            case NativeEngine.TYPE_BLOB: return "BLOB";
            default: return "OTHER";
        }
    }

    @Override
    public String getColumnClassName(int column) throws SQLException {
        switch (type(column)) {
            case NativeEngine.TYPE_BOOLEAN: return Boolean.class.getName();
            case NativeEngine.TYPE_INTEGER: return Integer.class.getName();
            case NativeEngine.TYPE_BIGINT: return Long.class.getName();
            case NativeEngine.TYPE_DOUBLE: return Double.class.getName();
            case NativeEngine.TYPE_DECIMAL: return java.math.BigDecimal.class.getName();
            case NativeEngine.TYPE_DATE: return java.sql.Date.class.getName();
            case NativeEngine.TYPE_TIMESTAMP: return java.sql.Timestamp.class.getName();
            case NativeEngine.TYPE_TIME: return java.sql.Time.class.getName();
            case NativeEngine.TYPE_BLOB: return byte[].class.getName();
            default: return String.class.getName();
        }
    }

    @Override
    public int isNullable(int column) throws SQLException {
        type(column);
        return ResultSetMetaData.columnNullableUnknown;
    }

    @Override
    public boolean isSigned(int column) throws SQLException {
        int t = type(column);
        return t == NativeEngine.TYPE_INTEGER || t == NativeEngine.TYPE_BIGINT
                || t == NativeEngine.TYPE_DOUBLE || t == NativeEngine.TYPE_DECIMAL;
    }

    @Override
    public int getPrecision(int column) throws SQLException {
        type(column);
        return 0;
    }

    @Override
    public int getScale(int column) throws SQLException {
        type(column);
        return 0;
    }

    @Override
    public int getColumnDisplaySize(int column) throws SQLException {
        type(column);
        return Integer.MAX_VALUE;
    }

    @Override
    public String getTableName(int column) throws SQLException {
        type(column);
        return "";
    }

    @Override
    public String getSchemaName(int column) throws SQLException {
        type(column);
        return "";
    }

    @Override
    public String getCatalogName(int column) throws SQLException {
        type(column);
        return "";
    }

    @Override
    public boolean isAutoIncrement(int column) throws SQLException {
        type(column);
        return false;
    }

    @Override
    public boolean isCaseSensitive(int column) throws SQLException {
        return type(column) == NativeEngine.TYPE_VARCHAR;
    }

    @Override
    public boolean isSearchable(int column) throws SQLException {
        type(column);
        return true;
    }

    @Override
    public boolean isCurrency(int column) throws SQLException {
        type(column);
        return false;
    }

    @Override
    public boolean isReadOnly(int column) throws SQLException {
        type(column);
        return true;
    }

    @Override
    public boolean isWritable(int column) throws SQLException {
        type(column);
        return false;
    }

    @Override
    public boolean isDefinitelyWritable(int column) throws SQLException {
        type(column);
        return false;
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(this)) {
            return iface.cast(this);
        }
        throw new SQLException("trexsql: not a wrapper for " + iface.getName());
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) {
        return iface.isInstance(this);
    }
}
