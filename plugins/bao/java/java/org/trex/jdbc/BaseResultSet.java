package org.trex.jdbc;

// Generated: every method of java.sql.ResultSet throws SQLFeatureNotSupportedException
// unless a subclass overrides it.
@SuppressWarnings({"deprecation", "unchecked"})
abstract class BaseResultSet implements java.sql.ResultSet {

    static java.sql.SQLFeatureNotSupportedException unsupported(String m) {
        return new java.sql.SQLFeatureNotSupportedException("trexsql: " + m + " is not supported");
    }

    @Override
    public boolean absolute(int a0) throws java.sql.SQLException {
        throw unsupported("absolute");
    }

    @Override
    public void afterLast() throws java.sql.SQLException {
        throw unsupported("afterLast");
    }

    @Override
    public void beforeFirst() throws java.sql.SQLException {
        throw unsupported("beforeFirst");
    }

    @Override
    public void cancelRowUpdates() throws java.sql.SQLException {
        throw unsupported("cancelRowUpdates");
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
    public void deleteRow() throws java.sql.SQLException {
        throw unsupported("deleteRow");
    }

    @Override
    public int findColumn(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("findColumn");
    }

    @Override
    public boolean first() throws java.sql.SQLException {
        throw unsupported("first");
    }

    @Override
    public java.sql.Array getArray(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getArray");
    }

    @Override
    public java.sql.Array getArray(int a0) throws java.sql.SQLException {
        throw unsupported("getArray");
    }

    @Override
    public java.io.InputStream getAsciiStream(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getAsciiStream");
    }

    @Override
    public java.io.InputStream getAsciiStream(int a0) throws java.sql.SQLException {
        throw unsupported("getAsciiStream");
    }

    @Override
    public java.math.BigDecimal getBigDecimal(java.lang.String a0, int a1) throws java.sql.SQLException {
        throw unsupported("getBigDecimal");
    }

    @Override
    public java.math.BigDecimal getBigDecimal(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getBigDecimal");
    }

    @Override
    public java.math.BigDecimal getBigDecimal(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("getBigDecimal");
    }

    @Override
    public java.math.BigDecimal getBigDecimal(int a0) throws java.sql.SQLException {
        throw unsupported("getBigDecimal");
    }

    @Override
    public java.io.InputStream getBinaryStream(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getBinaryStream");
    }

    @Override
    public java.io.InputStream getBinaryStream(int a0) throws java.sql.SQLException {
        throw unsupported("getBinaryStream");
    }

    @Override
    public java.sql.Blob getBlob(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getBlob");
    }

    @Override
    public java.sql.Blob getBlob(int a0) throws java.sql.SQLException {
        throw unsupported("getBlob");
    }

    @Override
    public boolean getBoolean(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getBoolean");
    }

    @Override
    public boolean getBoolean(int a0) throws java.sql.SQLException {
        throw unsupported("getBoolean");
    }

    @Override
    public byte getByte(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getByte");
    }

    @Override
    public byte getByte(int a0) throws java.sql.SQLException {
        throw unsupported("getByte");
    }

    @Override
    public byte[] getBytes(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getBytes");
    }

    @Override
    public byte[] getBytes(int a0) throws java.sql.SQLException {
        throw unsupported("getBytes");
    }

    @Override
    public java.io.Reader getCharacterStream(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getCharacterStream");
    }

    @Override
    public java.io.Reader getCharacterStream(int a0) throws java.sql.SQLException {
        throw unsupported("getCharacterStream");
    }

    @Override
    public java.sql.Clob getClob(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getClob");
    }

    @Override
    public java.sql.Clob getClob(int a0) throws java.sql.SQLException {
        throw unsupported("getClob");
    }

    @Override
    public int getConcurrency() throws java.sql.SQLException {
        throw unsupported("getConcurrency");
    }

    @Override
    public java.lang.String getCursorName() throws java.sql.SQLException {
        throw unsupported("getCursorName");
    }

    @Override
    public java.sql.Date getDate(java.lang.String a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getDate");
    }

    @Override
    public java.sql.Date getDate(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getDate");
    }

    @Override
    public java.sql.Date getDate(int a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getDate");
    }

    @Override
    public java.sql.Date getDate(int a0) throws java.sql.SQLException {
        throw unsupported("getDate");
    }

    @Override
    public double getDouble(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getDouble");
    }

    @Override
    public double getDouble(int a0) throws java.sql.SQLException {
        throw unsupported("getDouble");
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
    public float getFloat(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getFloat");
    }

    @Override
    public float getFloat(int a0) throws java.sql.SQLException {
        throw unsupported("getFloat");
    }

    @Override
    public int getHoldability() throws java.sql.SQLException {
        throw unsupported("getHoldability");
    }

    @Override
    public int getInt(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getInt");
    }

    @Override
    public int getInt(int a0) throws java.sql.SQLException {
        throw unsupported("getInt");
    }

    @Override
    public long getLong(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getLong");
    }

    @Override
    public long getLong(int a0) throws java.sql.SQLException {
        throw unsupported("getLong");
    }

    @Override
    public java.sql.ResultSetMetaData getMetaData() throws java.sql.SQLException {
        throw unsupported("getMetaData");
    }

    @Override
    public java.io.Reader getNCharacterStream(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getNCharacterStream");
    }

    @Override
    public java.io.Reader getNCharacterStream(int a0) throws java.sql.SQLException {
        throw unsupported("getNCharacterStream");
    }

    @Override
    public java.sql.NClob getNClob(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getNClob");
    }

    @Override
    public java.sql.NClob getNClob(int a0) throws java.sql.SQLException {
        throw unsupported("getNClob");
    }

    @Override
    public java.lang.String getNString(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getNString");
    }

    @Override
    public java.lang.String getNString(int a0) throws java.sql.SQLException {
        throw unsupported("getNString");
    }

    @Override
    public <T> T getObject(java.lang.String a0, java.lang.Class<T> a1) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public java.lang.Object getObject(java.lang.String a0, java.util.Map<java.lang.String, java.lang.Class<?>> a1) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public java.lang.Object getObject(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public <T> T getObject(int a0, java.lang.Class<T> a1) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public java.lang.Object getObject(int a0, java.util.Map<java.lang.String, java.lang.Class<?>> a1) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public java.lang.Object getObject(int a0) throws java.sql.SQLException {
        throw unsupported("getObject");
    }

    @Override
    public java.sql.Ref getRef(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getRef");
    }

    @Override
    public java.sql.Ref getRef(int a0) throws java.sql.SQLException {
        throw unsupported("getRef");
    }

    @Override
    public int getRow() throws java.sql.SQLException {
        throw unsupported("getRow");
    }

    @Override
    public java.sql.RowId getRowId(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getRowId");
    }

    @Override
    public java.sql.RowId getRowId(int a0) throws java.sql.SQLException {
        throw unsupported("getRowId");
    }

    @Override
    public java.sql.SQLXML getSQLXML(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getSQLXML");
    }

    @Override
    public java.sql.SQLXML getSQLXML(int a0) throws java.sql.SQLException {
        throw unsupported("getSQLXML");
    }

    @Override
    public short getShort(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getShort");
    }

    @Override
    public short getShort(int a0) throws java.sql.SQLException {
        throw unsupported("getShort");
    }

    @Override
    public java.sql.Statement getStatement() throws java.sql.SQLException {
        throw unsupported("getStatement");
    }

    @Override
    public java.lang.String getString(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getString");
    }

    @Override
    public java.lang.String getString(int a0) throws java.sql.SQLException {
        throw unsupported("getString");
    }

    @Override
    public java.sql.Time getTime(java.lang.String a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getTime");
    }

    @Override
    public java.sql.Time getTime(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getTime");
    }

    @Override
    public java.sql.Time getTime(int a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getTime");
    }

    @Override
    public java.sql.Time getTime(int a0) throws java.sql.SQLException {
        throw unsupported("getTime");
    }

    @Override
    public java.sql.Timestamp getTimestamp(java.lang.String a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getTimestamp");
    }

    @Override
    public java.sql.Timestamp getTimestamp(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getTimestamp");
    }

    @Override
    public java.sql.Timestamp getTimestamp(int a0, java.util.Calendar a1) throws java.sql.SQLException {
        throw unsupported("getTimestamp");
    }

    @Override
    public java.sql.Timestamp getTimestamp(int a0) throws java.sql.SQLException {
        throw unsupported("getTimestamp");
    }

    @Override
    public int getType() throws java.sql.SQLException {
        throw unsupported("getType");
    }

    @Override
    public java.net.URL getURL(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getURL");
    }

    @Override
    public java.net.URL getURL(int a0) throws java.sql.SQLException {
        throw unsupported("getURL");
    }

    @Override
    public java.io.InputStream getUnicodeStream(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("getUnicodeStream");
    }

    @Override
    public java.io.InputStream getUnicodeStream(int a0) throws java.sql.SQLException {
        throw unsupported("getUnicodeStream");
    }

    @Override
    public java.sql.SQLWarning getWarnings() throws java.sql.SQLException {
        throw unsupported("getWarnings");
    }

    @Override
    public void insertRow() throws java.sql.SQLException {
        throw unsupported("insertRow");
    }

    @Override
    public boolean isAfterLast() throws java.sql.SQLException {
        throw unsupported("isAfterLast");
    }

    @Override
    public boolean isBeforeFirst() throws java.sql.SQLException {
        throw unsupported("isBeforeFirst");
    }

    @Override
    public boolean isClosed() throws java.sql.SQLException {
        throw unsupported("isClosed");
    }

    @Override
    public boolean isFirst() throws java.sql.SQLException {
        throw unsupported("isFirst");
    }

    @Override
    public boolean isLast() throws java.sql.SQLException {
        throw unsupported("isLast");
    }

    @Override
    public boolean isWrapperFor(java.lang.Class<?> a0) throws java.sql.SQLException {
        throw unsupported("isWrapperFor");
    }

    @Override
    public boolean last() throws java.sql.SQLException {
        throw unsupported("last");
    }

    @Override
    public void moveToCurrentRow() throws java.sql.SQLException {
        throw unsupported("moveToCurrentRow");
    }

    @Override
    public void moveToInsertRow() throws java.sql.SQLException {
        throw unsupported("moveToInsertRow");
    }

    @Override
    public boolean next() throws java.sql.SQLException {
        throw unsupported("next");
    }

    @Override
    public boolean previous() throws java.sql.SQLException {
        throw unsupported("previous");
    }

    @Override
    public void refreshRow() throws java.sql.SQLException {
        throw unsupported("refreshRow");
    }

    @Override
    public boolean relative(int a0) throws java.sql.SQLException {
        throw unsupported("relative");
    }

    @Override
    public boolean rowDeleted() throws java.sql.SQLException {
        throw unsupported("rowDeleted");
    }

    @Override
    public boolean rowInserted() throws java.sql.SQLException {
        throw unsupported("rowInserted");
    }

    @Override
    public boolean rowUpdated() throws java.sql.SQLException {
        throw unsupported("rowUpdated");
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
    public <T> T unwrap(java.lang.Class<T> a0) throws java.sql.SQLException {
        throw unsupported("unwrap");
    }

    @Override
    public void updateArray(java.lang.String a0, java.sql.Array a1) throws java.sql.SQLException {
        throw unsupported("updateArray");
    }

    @Override
    public void updateArray(int a0, java.sql.Array a1) throws java.sql.SQLException {
        throw unsupported("updateArray");
    }

    @Override
    public void updateAsciiStream(java.lang.String a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateAsciiStream(java.lang.String a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateAsciiStream(java.lang.String a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateAsciiStream(int a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateAsciiStream(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateAsciiStream(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateAsciiStream");
    }

    @Override
    public void updateBigDecimal(java.lang.String a0, java.math.BigDecimal a1) throws java.sql.SQLException {
        throw unsupported("updateBigDecimal");
    }

    @Override
    public void updateBigDecimal(int a0, java.math.BigDecimal a1) throws java.sql.SQLException {
        throw unsupported("updateBigDecimal");
    }

    @Override
    public void updateBinaryStream(java.lang.String a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBinaryStream(java.lang.String a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBinaryStream(java.lang.String a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBinaryStream(int a0, java.io.InputStream a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBinaryStream(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBinaryStream(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateBinaryStream");
    }

    @Override
    public void updateBlob(java.lang.String a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBlob(java.lang.String a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBlob(java.lang.String a0, java.sql.Blob a1) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBlob(int a0, java.io.InputStream a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBlob(int a0, java.io.InputStream a1) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBlob(int a0, java.sql.Blob a1) throws java.sql.SQLException {
        throw unsupported("updateBlob");
    }

    @Override
    public void updateBoolean(java.lang.String a0, boolean a1) throws java.sql.SQLException {
        throw unsupported("updateBoolean");
    }

    @Override
    public void updateBoolean(int a0, boolean a1) throws java.sql.SQLException {
        throw unsupported("updateBoolean");
    }

    @Override
    public void updateByte(java.lang.String a0, byte a1) throws java.sql.SQLException {
        throw unsupported("updateByte");
    }

    @Override
    public void updateByte(int a0, byte a1) throws java.sql.SQLException {
        throw unsupported("updateByte");
    }

    @Override
    public void updateBytes(java.lang.String a0, byte[] a1) throws java.sql.SQLException {
        throw unsupported("updateBytes");
    }

    @Override
    public void updateBytes(int a0, byte[] a1) throws java.sql.SQLException {
        throw unsupported("updateBytes");
    }

    @Override
    public void updateCharacterStream(java.lang.String a0, java.io.Reader a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateCharacterStream(java.lang.String a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateCharacterStream(java.lang.String a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateCharacterStream(int a0, java.io.Reader a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateCharacterStream(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateCharacterStream(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateCharacterStream");
    }

    @Override
    public void updateClob(java.lang.String a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateClob(java.lang.String a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateClob(java.lang.String a0, java.sql.Clob a1) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateClob(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateClob(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateClob(int a0, java.sql.Clob a1) throws java.sql.SQLException {
        throw unsupported("updateClob");
    }

    @Override
    public void updateDate(java.lang.String a0, java.sql.Date a1) throws java.sql.SQLException {
        throw unsupported("updateDate");
    }

    @Override
    public void updateDate(int a0, java.sql.Date a1) throws java.sql.SQLException {
        throw unsupported("updateDate");
    }

    @Override
    public void updateDouble(java.lang.String a0, double a1) throws java.sql.SQLException {
        throw unsupported("updateDouble");
    }

    @Override
    public void updateDouble(int a0, double a1) throws java.sql.SQLException {
        throw unsupported("updateDouble");
    }

    @Override
    public void updateFloat(java.lang.String a0, float a1) throws java.sql.SQLException {
        throw unsupported("updateFloat");
    }

    @Override
    public void updateFloat(int a0, float a1) throws java.sql.SQLException {
        throw unsupported("updateFloat");
    }

    @Override
    public void updateInt(java.lang.String a0, int a1) throws java.sql.SQLException {
        throw unsupported("updateInt");
    }

    @Override
    public void updateInt(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("updateInt");
    }

    @Override
    public void updateLong(java.lang.String a0, long a1) throws java.sql.SQLException {
        throw unsupported("updateLong");
    }

    @Override
    public void updateLong(int a0, long a1) throws java.sql.SQLException {
        throw unsupported("updateLong");
    }

    @Override
    public void updateNCharacterStream(java.lang.String a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateNCharacterStream");
    }

    @Override
    public void updateNCharacterStream(java.lang.String a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateNCharacterStream");
    }

    @Override
    public void updateNCharacterStream(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateNCharacterStream");
    }

    @Override
    public void updateNCharacterStream(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateNCharacterStream");
    }

    @Override
    public void updateNClob(java.lang.String a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNClob(java.lang.String a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNClob(java.lang.String a0, java.sql.NClob a1) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNClob(int a0, java.io.Reader a1, long a2) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNClob(int a0, java.io.Reader a1) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNClob(int a0, java.sql.NClob a1) throws java.sql.SQLException {
        throw unsupported("updateNClob");
    }

    @Override
    public void updateNString(java.lang.String a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("updateNString");
    }

    @Override
    public void updateNString(int a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("updateNString");
    }

    @Override
    public void updateNull(java.lang.String a0) throws java.sql.SQLException {
        throw unsupported("updateNull");
    }

    @Override
    public void updateNull(int a0) throws java.sql.SQLException {
        throw unsupported("updateNull");
    }

    @Override
    public void updateObject(java.lang.String a0, java.lang.Object a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateObject");
    }

    @Override
    public void updateObject(java.lang.String a0, java.lang.Object a1) throws java.sql.SQLException {
        throw unsupported("updateObject");
    }

    @Override
    public void updateObject(int a0, java.lang.Object a1, int a2) throws java.sql.SQLException {
        throw unsupported("updateObject");
    }

    @Override
    public void updateObject(int a0, java.lang.Object a1) throws java.sql.SQLException {
        throw unsupported("updateObject");
    }

    @Override
    public void updateRef(java.lang.String a0, java.sql.Ref a1) throws java.sql.SQLException {
        throw unsupported("updateRef");
    }

    @Override
    public void updateRef(int a0, java.sql.Ref a1) throws java.sql.SQLException {
        throw unsupported("updateRef");
    }

    @Override
    public void updateRow() throws java.sql.SQLException {
        throw unsupported("updateRow");
    }

    @Override
    public void updateRowId(java.lang.String a0, java.sql.RowId a1) throws java.sql.SQLException {
        throw unsupported("updateRowId");
    }

    @Override
    public void updateRowId(int a0, java.sql.RowId a1) throws java.sql.SQLException {
        throw unsupported("updateRowId");
    }

    @Override
    public void updateSQLXML(java.lang.String a0, java.sql.SQLXML a1) throws java.sql.SQLException {
        throw unsupported("updateSQLXML");
    }

    @Override
    public void updateSQLXML(int a0, java.sql.SQLXML a1) throws java.sql.SQLException {
        throw unsupported("updateSQLXML");
    }

    @Override
    public void updateShort(java.lang.String a0, short a1) throws java.sql.SQLException {
        throw unsupported("updateShort");
    }

    @Override
    public void updateShort(int a0, short a1) throws java.sql.SQLException {
        throw unsupported("updateShort");
    }

    @Override
    public void updateString(java.lang.String a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("updateString");
    }

    @Override
    public void updateString(int a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("updateString");
    }

    @Override
    public void updateTime(java.lang.String a0, java.sql.Time a1) throws java.sql.SQLException {
        throw unsupported("updateTime");
    }

    @Override
    public void updateTime(int a0, java.sql.Time a1) throws java.sql.SQLException {
        throw unsupported("updateTime");
    }

    @Override
    public void updateTimestamp(java.lang.String a0, java.sql.Timestamp a1) throws java.sql.SQLException {
        throw unsupported("updateTimestamp");
    }

    @Override
    public void updateTimestamp(int a0, java.sql.Timestamp a1) throws java.sql.SQLException {
        throw unsupported("updateTimestamp");
    }

    @Override
    public boolean wasNull() throws java.sql.SQLException {
        throw unsupported("wasNull");
    }
}
