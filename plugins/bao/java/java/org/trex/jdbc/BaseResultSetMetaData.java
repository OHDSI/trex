package org.trex.jdbc;

// Generated: every method of java.sql.ResultSetMetaData throws SQLFeatureNotSupportedException
// unless a subclass overrides it.
@SuppressWarnings({"deprecation", "unchecked"})
abstract class BaseResultSetMetaData implements java.sql.ResultSetMetaData {

    static java.sql.SQLFeatureNotSupportedException unsupported(String m) {
        return new java.sql.SQLFeatureNotSupportedException("trexsql: " + m + " is not supported");
    }

    @Override
    public java.lang.String getCatalogName(int a0) throws java.sql.SQLException {
        throw unsupported("getCatalogName");
    }

    @Override
    public java.lang.String getColumnClassName(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnClassName");
    }

    @Override
    public int getColumnCount() throws java.sql.SQLException {
        throw unsupported("getColumnCount");
    }

    @Override
    public int getColumnDisplaySize(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnDisplaySize");
    }

    @Override
    public java.lang.String getColumnLabel(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnLabel");
    }

    @Override
    public java.lang.String getColumnName(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnName");
    }

    @Override
    public int getColumnType(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnType");
    }

    @Override
    public java.lang.String getColumnTypeName(int a0) throws java.sql.SQLException {
        throw unsupported("getColumnTypeName");
    }

    @Override
    public int getPrecision(int a0) throws java.sql.SQLException {
        throw unsupported("getPrecision");
    }

    @Override
    public int getScale(int a0) throws java.sql.SQLException {
        throw unsupported("getScale");
    }

    @Override
    public java.lang.String getSchemaName(int a0) throws java.sql.SQLException {
        throw unsupported("getSchemaName");
    }

    @Override
    public java.lang.String getTableName(int a0) throws java.sql.SQLException {
        throw unsupported("getTableName");
    }

    @Override
    public boolean isAutoIncrement(int a0) throws java.sql.SQLException {
        throw unsupported("isAutoIncrement");
    }

    @Override
    public boolean isCaseSensitive(int a0) throws java.sql.SQLException {
        throw unsupported("isCaseSensitive");
    }

    @Override
    public boolean isCurrency(int a0) throws java.sql.SQLException {
        throw unsupported("isCurrency");
    }

    @Override
    public boolean isDefinitelyWritable(int a0) throws java.sql.SQLException {
        throw unsupported("isDefinitelyWritable");
    }

    @Override
    public int isNullable(int a0) throws java.sql.SQLException {
        throw unsupported("isNullable");
    }

    @Override
    public boolean isReadOnly(int a0) throws java.sql.SQLException {
        throw unsupported("isReadOnly");
    }

    @Override
    public boolean isSearchable(int a0) throws java.sql.SQLException {
        throw unsupported("isSearchable");
    }

    @Override
    public boolean isSigned(int a0) throws java.sql.SQLException {
        throw unsupported("isSigned");
    }

    @Override
    public boolean isWrapperFor(java.lang.Class<?> a0) throws java.sql.SQLException {
        throw unsupported("isWrapperFor");
    }

    @Override
    public boolean isWritable(int a0) throws java.sql.SQLException {
        throw unsupported("isWritable");
    }

    @Override
    public <T> T unwrap(java.lang.Class<T> a0) throws java.sql.SQLException {
        throw unsupported("unwrap");
    }
}
