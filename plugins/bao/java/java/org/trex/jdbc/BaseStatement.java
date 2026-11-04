package org.trex.jdbc;

// Generated: every method of java.sql.PreparedStatement throws SQLFeatureNotSupportedException
// unless a subclass overrides it.
@SuppressWarnings({"deprecation", "unchecked"})
abstract class BaseStatement implements java.sql.PreparedStatement {

    static java.sql.SQLFeatureNotSupportedException unsupported(String m) {
        return new java.sql.SQLFeatureNotSupportedException("trexsql: " + m + " is not supported");
    }

    @Override
    public void addBatch() throws java.sql.SQLException {
        throw unsupported("addBatch");
    }

    @Override
    public void addBatch(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("addBatch");
    }

    @Override
    public void cancel() throws java.sql.SQLException {
        throw unsupported("cancel");
    }

    @Override
    public void clearBatch() throws java.sql.SQLException {
        throw unsupported("clearBatch");
    }

    @Override
    public void clearParameters() throws java.sql.SQLException {
        throw unsupported("clearParameters");
    }

    @Override
    public void clearWarnings() throws java.sql.SQLException {
        throw unsupported("clearWarnings");
    }

    @Override
    public void close() throws java.sql.SQLException {
        throw unsupported("close");
    }

    @Override
    public void closeOnCompletion() throws java.sql.SQLException {
        throw unsupported("closeOnCompletion");
    }

    @Override
    public boolean execute() throws java.sql.SQLException {
        throw unsupported("execute");
    }

    @Override
    public boolean execute(java.lang.String a0, int[] a1) throws java.sql.SQLException {
        throw unsupported("execute");
    }

    @Override
    public boolean execute(java.lang.String a0, java.lang.String[] a1) throws java.sql.SQLException {
        throw unsupported("execute");
    }

    @Override
    public boolean execute(java.lang.String a0, int a1) throws java.sql.SQLException {
        throw unsupported("execute");
    }

    @Override
    public boolean execute(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("execute");
    }

    @Override
    public int[] executeBatch() throws java.sql.SQLException {
        throw unsupported("executeBatch");
    }

    @Override
    public java.sql.ResultSet executeQuery() throws java.sql.SQLException {
        throw unsupported("executeQuery");
    }

    @Override
    public java.sql.ResultSet executeQuery(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("executeQuery");
    }

    @Override
    public int executeUpdate() throws java.sql.SQLException {
        throw unsupported("executeUpdate");
    }

    @Override
    public int executeUpdate(java.lang.String a0, int[] a1) throws java.sql.SQLException {
        throw unsupported("executeUpdate");
    }

    @Override
    public int executeUpdate(java.lang.String a0, java.lang.String[] a1) throws java.sql.SQLException {
        throw unsupported("executeUpdate");
    }

    @Override
    public int executeUpdate(java.lang.String a0, int a1) throws java.sql.SQLException {
        throw unsupported("executeUpdate");
    }

    @Override
    public int executeUpdate(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("executeUpdate");
    }

    @Override
    public java.sql.Connection getConnection() throws java.sql.SQLException {
        throw unsupported("getConnection");
    }

    @Override
    public int getFetchDirection() throws java.sql.SQLException {
        throw unsupported("getFetchDirection");
    }

    @Override
    public int getFetchSize() throws java.sql.SQLException {
        throw unsupported("getFetchSize");
    }

    @Override
    public java.sql.ResultSet getGeneratedKeys() throws java.sql.SQLException {
        throw unsupported("getGeneratedKeys");
    }

    @Override
    public int getMaxFieldSize() throws java.sql.SQLException {
        throw unsupported("getMaxFieldSize");
    }

    @Override
    public int getMaxRows() throws java.sql.SQLException {
        throw unsupported("getMaxRows");
    }

    @Override
    public java.sql.ResultSetMetaData getMetaData() throws java.sql.SQLException {
        throw unsupported("getMetaData");
    }

    @Override
    public boolean getMoreResults() throws java.sql.SQLException {
        throw unsupported("getMoreResults");
    }

    @Override
    public boolean getMoreResults(int a0) throws java.sql.SQLException {
        throw unsupported("getMoreResults");
    }

    @Override
    public java.sql.ParameterMetaData getParameterMetaData() throws java.sql.SQLException {
        throw unsupported("getParameterMetaData");
    }

    @Override
    public int getQueryTimeout() throws java.sql.SQLException {
        throw unsupported("getQueryTimeout");
    }

    @Override
    public java.sql.ResultSet getResultSet() throws java.sql.SQLException {
        throw unsupported("getResultSet");
    }

    @Override
    public int getResultSetConcurrency() throws java.sql.SQLException {
        throw unsupported("getResultSetConcurrency");
    }

    @Override
    public int getResultSetHoldability() throws java.sql.SQLException {
        throw unsupported("getResultSetHoldability");
    }

    @Override
    public int getResultSetType() throws java.sql.SQLException {
        throw unsupported("getResultSetType");
    }

    @Override
    public int getUpdateCount() throws java.sql.SQLException {
        throw unsupported("getUpdateCount");
    }

    @Override
    public java.sql.SQLWarning getWarnings() throws java.sql.SQLException {
        throw unsupported("getWarnings");
    }

    @Override
    public boolean isCloseOnCompletion() throws java.sql.SQLException {
        throw unsupported("isCloseOnCompletion");
    }

    @Override
    public boolean isClosed() throws java.sql.SQLException {
        throw unsupported("isClosed");
    }

    @Override
    public boolean isPoolable() throws java.sql.SQLException {
        throw unsupported("isPoolable");
    }

    @Override
    public boolean isWrapperFor(java.lang.Class<?> a0) throws java.sql.SQLException {
        throw unsupported("isWrapperFor");
    }

    @Override
    public void setArray(int a0, java.sql.Array a1) throws java.sql.SQLException {
        throw unsupported("setArray");
    }

    @Override
    public void setAsciiStream(int a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("setAsciiStream");
    }

    @Override
    public void setAsciiStream(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("setAsciiStream");
    }

    @Override
    public void setAsciiStream(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("setAsciiStream");
    }

    @Override
    public void setBigDecimal(int a0, java.math.BigDecimal a1) throws java.sql.SQLException {
        throw unsupported("setBigDecimal");
    }

    @Override
    public void setBinaryStream(int a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("setBinaryStream");
    }

    @Override
    public void setBinaryStream(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("setBinaryStream");
    }

    @Override
    public void setBinaryStream(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("setBinaryStream");
    }

    @Override
    public void setBlob(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("setBlob");
    }

    @Override
    public void setBlob(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("setBlob");
    }

    @Override
    public void setBlob(int a0, java.sql.Blob a1) throws java.sql.SQLException {
        throw unsupported("setBlob");
    }

    @Override
    public void setBoolean(int a0, boolean a1) throws java.sql.SQLException {
        throw unsupported("setBoolean");
    }

    @Override
    public void setByte(int a0, byte a1) throws java.sql.SQLException {
        throw unsupported("setByte");
    }

    @Override
    public void setBytes(int a0, byte[] a1) throws java.sql.SQLException {
        throw unsupported("setBytes");
    }

    @Override
    public void setCharacterStream(int a0, java.io.Reader a1, int a2) throws java.sql.SQLException {
        throw unsupported("setCharacterStream");
    }

    @Override
    public void setCharacterStream(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("setCharacterStream");
    }

    @Override
    public void setCharacterStream(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("setCharacterStream");
    }

    @Override
    public void setClob(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("setClob");
    }

    @Override
    public void setClob(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("setClob");
    }

    @Override
    public void setClob(int a0, java.sql.Clob a1) throws java.sql.SQLException {
        throw unsupported("setClob");
    }

    @Override
    public void setCursorName(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("setCursorName");
    }

    @Override
    public void setDate(int a0, java.sql.Date a1, java.util.Calendar a2) throws java.sql.SQLException {
        throw unsupported("setDate");
    }

    @Override
    public void setDate(int a0, java.sql.Date a1) throws java.sql.SQLException {
        throw unsupported("setDate");
    }

    @Override
    public void setDouble(int a0, double a1) throws java.sql.SQLException {
        throw unsupported("setDouble");
    }

    @Override
    public void setEscapeProcessing(boolean a0) throws java.sql.SQLException {
        throw unsupported("setEscapeProcessing");
    }

    @Override
    public void setFetchDirection(int a0) throws java.sql.SQLException {
        throw unsupported("setFetchDirection");
    }

    @Override
    public void setFetchSize(int a0) throws java.sql.SQLException {
        throw unsupported("setFetchSize");
    }

    @Override
    public void setFloat(int a0, float a1) throws java.sql.SQLException {
        throw unsupported("setFloat");
    }

    @Override
    public void setInt(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("setInt");
    }

    @Override
    public void setLong(int a0, long a1) throws java.sql.SQLException {
        throw unsupported("setLong");
    }

    @Override
    public void setMaxFieldSize(int a0) throws java.sql.SQLException {
        throw unsupported("setMaxFieldSize");
    }

    @Override
    public void setMaxRows(int a0) throws java.sql.SQLException {
        throw unsupported("setMaxRows");
    }

    @Override
    public void setNCharacterStream(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("setNCharacterStream");
    }

    @Override
    public void setNCharacterStream(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("setNCharacterStream");
    }

    @Override
    public void setNClob(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("setNClob");
    }

    @Override
    public void setNClob(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("setNClob");
    }

    @Override
    public void setNClob(int a0, java.sql.NClob a1) throws java.sql.SQLException {
        throw unsupported("setNClob");
    }

    @Override
    public void setNString(int a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("setNString");
    }

    @Override
    public void setNull(int a0, int a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("setNull");
    }

    @Override
    public void setNull(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("setNull");
    }

    @Override
    public void setObject(int a0, java.lang.Object a1, int a2, int a3) throws java.sql.SQLException {
        throw unsupported("setObject");
    }

    @Override
    public void setObject(int a0, java.lang.Object a1, int a2) throws java.sql.SQLException {
        throw unsupported("setObject");
    }

    @Override
    public void setObject(int a0, java.lang.Object a1) throws java.sql.SQLException {
        throw unsupported("setObject");
    }

    @Override
    public void setPoolable(boolean a0) throws java.sql.SQLException {
        throw unsupported("setPoolable");
    }

    @Override
    public void setQueryTimeout(int a0) throws java.sql.SQLException {
        throw unsupported("setQueryTimeout");
    }

    @Override
    public void setRef(int a0, java.sql.Ref a1) throws java.sql.SQLException {
        throw unsupported("setRef");
    }

    @Override
    public void setRowId(int a0, java.sql.RowId a1) throws java.sql.SQLException {
        throw unsupported("setRowId");
    }

    @Override
    public void setSQLXML(int a0, java.sql.SQLXML a1) throws java.sql.SQLException {
        throw unsupported("setSQLXML");
    }

    @Override
    public void setShort(int a0, short a1) throws java.sql.SQLException {
        throw unsupported("setShort");
    }

    @Override
    public void setString(int a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("setString");
    }

    @Override
    public void setTime(int a0, java.sql.Time a1, java.util.Calendar a2) throws java.sql.SQLException {
        throw unsupported("setTime");
    }

    @Override
    public void setTime(int a0, java.sql.Time a1) throws java.sql.SQLException {
        throw unsupported("setTime");
    }

    @Override
    public void setTimestamp(int a0, java.sql.Timestamp a1, java.util.Calendar a2) throws java.sql.SQLException {
        throw unsupported("setTimestamp");
    }

    @Override
    public void setTimestamp(int a0, java.sql.Timestamp a1) throws java.sql.SQLException {
        throw unsupported("setTimestamp");
    }

    @Override
    public void setURL(int a0, java.net.URL a1) throws java.sql.SQLException {
        throw unsupported("setURL");
    }

    @Override
    public void setUnicodeStream(int a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("setUnicodeStream");
    }

    @Override
    public <T> T unwrap(java.lang.Class<T> a0) throws java.sql.SQLException {
        throw unsupported("unwrap");
    }
}
