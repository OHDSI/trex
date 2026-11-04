package org.trex.jdbc;

// Generated: every method of java.sql.Connection throws SQLFeatureNotSupportedException
// unless a subclass overrides it.
@SuppressWarnings({"deprecation", "unchecked"})
abstract class BaseConnection implements java.sql.Connection {

    static java.sql.SQLFeatureNotSupportedException unsupported(String m) {
        return new java.sql.SQLFeatureNotSupportedException("trexsql: " + m + " is not supported");
    }

    @Override
    public void abort(java.util.concurrent.Executor a0) throws java.sql.SQLException {
        throw unsupported("abort");
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
    public void commit() throws java.sql.SQLException {
        throw unsupported("commit");
    }

    @Override
    public java.sql.Array createArrayOf(java.lang.String a0, java.lang.Object[] a1) throws java.sql.SQLException {
        throw unsupported("createArrayOf");
    }

    @Override
    public java.sql.Blob createBlob() throws java.sql.SQLException {
        throw unsupported("createBlob");
    }

    @Override
    public java.sql.Clob createClob() throws java.sql.SQLException {
        throw unsupported("createClob");
    }

    @Override
    public java.sql.NClob createNClob() throws java.sql.SQLException {
        throw unsupported("createNClob");
    }

    @Override
    public java.sql.SQLXML createSQLXML() throws java.sql.SQLException {
        throw unsupported("createSQLXML");
    }

    @Override
    public java.sql.Statement createStatement() throws java.sql.SQLException {
        throw unsupported("createStatement");
    }

    @Override
    public java.sql.Statement createStatement(int a0, int a1, int a2) throws java.sql.SQLException {
        throw unsupported("createStatement");
    }

    @Override
    public java.sql.Statement createStatement(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("createStatement");
    }

    @Override
    public java.sql.Struct createStruct(java.lang.String a0, java.lang.Object[] a1) throws java.sql.SQLException {
        throw unsupported("createStruct");
    }

    @Override
    public boolean getAutoCommit() throws java.sql.SQLException {
        throw unsupported("getAutoCommit");
    }

    @Override
    public java.lang.String getCatalog() throws java.sql.SQLException {
        throw unsupported("getCatalog");
    }

    @Override
    public java.util.Properties getClientInfo() throws java.sql.SQLException {
        throw unsupported("getClientInfo");
    }

    @Override
    public java.lang.String getClientInfo(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getClientInfo");
    }

    @Override
    public int getHoldability() throws java.sql.SQLException {
        throw unsupported("getHoldability");
    }

    @Override
    public java.sql.DatabaseMetaData getMetaData() throws java.sql.SQLException {
        throw unsupported("getMetaData");
    }

    @Override
    public int getNetworkTimeout() throws java.sql.SQLException {
        throw unsupported("getNetworkTimeout");
    }

    @Override
    public java.lang.String getSchema() throws java.sql.SQLException {
        throw unsupported("getSchema");
    }

    @Override
    public int getTransactionIsolation() throws java.sql.SQLException {
        throw unsupported("getTransactionIsolation");
    }

    @Override
    public java.util.Map<java.lang.String, java.lang.Class<?>> getTypeMap() throws java.sql.SQLException {
        throw unsupported("getTypeMap");
    }

    @Override
    public java.sql.SQLWarning getWarnings() throws java.sql.SQLException {
        throw unsupported("getWarnings");
    }

    @Override
    public boolean isClosed() throws java.sql.SQLException {
        throw unsupported("isClosed");
    }

    @Override
    public boolean isReadOnly() throws java.sql.SQLException {
        throw unsupported("isReadOnly");
    }

    @Override
    public boolean isValid(int a0) throws java.sql.SQLException {
        throw unsupported("isValid");
    }

    @Override
    public boolean isWrapperFor(java.lang.Class<?> a0) throws java.sql.SQLException {
        throw unsupported("isWrapperFor");
    }

    @Override
    public java.lang.String nativeSQL(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("nativeSQL");
    }

    @Override
    public java.sql.CallableStatement prepareCall(java.lang.String a0, int a1, int a2, int a3) throws java.sql.SQLException {
        throw unsupported("prepareCall");
    }

    @Override
    public java.sql.CallableStatement prepareCall(java.lang.String a0, int a1, int a2) throws java.sql.SQLException {
        throw unsupported("prepareCall");
    }

    @Override
    public java.sql.CallableStatement prepareCall(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("prepareCall");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0, int[] a1) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0, java.lang.String[] a1) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0, int a1, int a2, int a3) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0, int a1, int a2) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0, int a1) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public java.sql.PreparedStatement prepareStatement(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("prepareStatement");
    }

    @Override
    public void releaseSavepoint(java.sql.Savepoint a0) throws java.sql.SQLException {
        throw unsupported("releaseSavepoint");
    }

    @Override
    public void rollback() throws java.sql.SQLException {
        throw unsupported("rollback");
    }

    @Override
    public void rollback(java.sql.Savepoint a0) throws java.sql.SQLException {
        throw unsupported("rollback");
    }

    @Override
    public void setAutoCommit(boolean a0) throws java.sql.SQLException {
        throw unsupported("setAutoCommit");
    }

    @Override
    public void setCatalog(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("setCatalog");
    }

    @Override
    public void setClientInfo(java.lang.String a0, java.lang.String a1) throws java.sql.SQLClientInfoException {
        throw new java.sql.SQLClientInfoException("trexsql: setClientInfo is not supported", null);
    }

    @Override
    public void setClientInfo(java.util.Properties a0) throws java.sql.SQLClientInfoException {
        throw new java.sql.SQLClientInfoException("trexsql: setClientInfo is not supported", null);
    }

    @Override
    public void setHoldability(int a0) throws java.sql.SQLException {
        throw unsupported("setHoldability");
    }

    @Override
    public void setNetworkTimeout(java.util.concurrent.Executor a0, int a1) throws java.sql.SQLException {
        throw unsupported("setNetworkTimeout");
    }

    @Override
    public void setReadOnly(boolean a0) throws java.sql.SQLException {
        throw unsupported("setReadOnly");
    }

    @Override
    public java.sql.Savepoint setSavepoint() throws java.sql.SQLException {
        throw unsupported("setSavepoint");
    }

    @Override
    public java.sql.Savepoint setSavepoint(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("setSavepoint");
    }

    @Override
    public void setSchema(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("setSchema");
    }

    @Override
    public void setTransactionIsolation(int a0) throws java.sql.SQLException {
        throw unsupported("setTransactionIsolation");
    }

    @Override
    public void setTypeMap(java.util.Map<java.lang.String, java.lang.Class<?>> a0) throws java.sql.SQLException {
        throw unsupported("setTypeMap");
    }

    @Override
    public <T> T unwrap(java.lang.Class<T> a0) throws java.sql.SQLException {
        throw unsupported("unwrap");
    }
}
