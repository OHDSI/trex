package org.trex.jdbc;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.SQLWarning;
import java.sql.Statement;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Forward-only, read-only view over a materialised result. */
final class TrexsqlResultSet extends BaseResultSet {

    private final TrexsqlStatement statement;
    private final NativeEngine.Rows rows;
    private final int limit;
    private final Map<String, Integer> labels = new HashMap<>();
    private int index = -1;
    private boolean wasNull;
    private boolean closed;
    private int fetchSize;

    TrexsqlResultSet(TrexsqlStatement statement, NativeEngine.Rows rows, int maxRows) {
        this.statement = statement;
        this.rows = rows;
        this.limit = maxRows > 0 ? Math.min(maxRows, rows.rows.size()) : rows.rows.size();
        for (int i = rows.names.length - 1; i >= 0; i--) {
            labels.put(rows.names[i].toLowerCase(Locale.ROOT), i + 1);
        }
    }

    NativeEngine.Rows rows() {
        return rows;
    }

    private void checkOpen() throws SQLException {
        if (closed) {
            throw new SQLException("trexsql: result set is closed");
        }
    }

    private Object raw(int column) throws SQLException {
        checkOpen();
        if (index < 0 || index >= limit) {
            throw new SQLException("trexsql: no current row");
        }
        if (column < 1 || column > rows.names.length) {
            throw new SQLException("trexsql: column index " + column + " out of range");
        }
        Object v = rows.rows.get(index)[column - 1];
        wasNull = v == null;
        return v;
    }

    void closeQuietly() {
        closed = true;
    }

    @Override
    public boolean next() throws SQLException {
        checkOpen();
        if (index < limit) {
            index++;
        }
        return index < limit;
    }

    @Override
    public void close() throws SQLException {
        if (!closed) {
            closed = true;
            if (statement != null) {
                statement.resultClosed();
            }
        }
    }

    @Override
    public boolean isClosed() {
        return closed;
    }

    @Override
    public boolean wasNull() {
        return wasNull;
    }

    @Override
    public int findColumn(String label) throws SQLException {
        Integer i = labels.get(label.toLowerCase(Locale.ROOT));
        if (i == null) {
            throw new SQLException("trexsql: no column named " + label);
        }
        return i;
    }

    @Override
    public ResultSetMetaData getMetaData() {
        return new TrexsqlResultSetMetaData(rows);
    }

    @Override
    public Statement getStatement() {
        return statement;
    }

    // --- getters by index ---

    @Override
    public Object getObject(int column) throws SQLException {
        return raw(column);
    }

    @Override
    public <T> T getObject(int column, Class<T> type) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (type.isInstance(v)) {
            return type.cast(v);
        }
        Object converted;
        if (type == String.class) {
            converted = getString(column);
        } else if (type == Integer.class) {
            converted = getInt(column);
        } else if (type == Long.class) {
            converted = getLong(column);
        } else if (type == Double.class) {
            converted = getDouble(column);
        } else if (type == Float.class) {
            converted = getFloat(column);
        } else if (type == Short.class) {
            converted = getShort(column);
        } else if (type == Byte.class) {
            converted = getByte(column);
        } else if (type == Boolean.class) {
            converted = getBoolean(column);
        } else if (type == BigDecimal.class) {
            converted = getBigDecimal(column);
        } else if (type == Date.class) {
            converted = getDate(column);
        } else if (type == Timestamp.class) {
            converted = getTimestamp(column);
        } else if (type == Time.class) {
            converted = getTime(column);
        } else if (type == LocalDate.class) {
            converted = getDate(column).toLocalDate();
        } else if (type == LocalDateTime.class) {
            converted = getTimestamp(column).toLocalDateTime();
        } else if (type == LocalTime.class) {
            converted = getTime(column).toLocalTime();
        } else {
            throw new SQLException("trexsql: cannot convert " + v.getClass().getName() + " to " + type.getName());
        }
        return type.cast(converted);
    }

    @Override
    public String getString(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal) {
            return ((BigDecimal) v).toPlainString();
        }
        return v.toString();
    }

    @Override
    public String getNString(int column) throws SQLException {
        return getString(column);
    }

    @Override
    public boolean getBoolean(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean) {
            return (Boolean) v;
        }
        if (v instanceof Number) {
            return ((Number) v).doubleValue() != 0;
        }
        String s = v.toString().trim();
        return s.equalsIgnoreCase("true") || s.equals("1") || s.equalsIgnoreCase("t") || s.equalsIgnoreCase("y");
    }

    private Number number(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof Number) {
            return (Number) v;
        }
        if (v instanceof Boolean) {
            return ((Boolean) v) ? 1 : 0;
        }
        try {
            return new BigDecimal(v.toString().trim());
        } catch (NumberFormatException e) {
            throw new SQLException("trexsql: '" + v + "' is not a number", e);
        }
    }

    @Override
    public byte getByte(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.byteValue();
    }

    @Override
    public short getShort(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.shortValue();
    }

    @Override
    public int getInt(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.intValue();
    }

    @Override
    public long getLong(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.longValue();
    }

    @Override
    public float getFloat(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.floatValue();
    }

    @Override
    public double getDouble(int column) throws SQLException {
        Number n = number(column);
        return n == null ? 0 : n.doubleValue();
    }

    @Override
    public BigDecimal getBigDecimal(int column) throws SQLException {
        Number n = number(column);
        if (n == null) {
            return null;
        }
        if (n instanceof BigDecimal) {
            return (BigDecimal) n;
        }
        if (n instanceof Double || n instanceof Float) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        return BigDecimal.valueOf(n.longValue());
    }

    @Override
    public BigDecimal getBigDecimal(int column, int scale) throws SQLException {
        BigDecimal d = getBigDecimal(column);
        return d == null ? null : d.setScale(scale, RoundingMode.HALF_UP);
    }

    @Override
    public byte[] getBytes(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof byte[]) {
            return (byte[]) v;
        }
        return v.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Override
    public Date getDate(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof Date) {
            return (Date) v;
        }
        if (v instanceof Timestamp) {
            return Date.valueOf(((Timestamp) v).toLocalDateTime().toLocalDate());
        }
        try {
            return Date.valueOf(LocalDate.parse(v.toString().trim().substring(0, 10)));
        } catch (RuntimeException e) {
            throw new SQLException("trexsql: '" + v + "' is not a date", e);
        }
    }

    @Override
    public Date getDate(int column, Calendar cal) throws SQLException {
        return getDate(column);
    }

    @Override
    public Timestamp getTimestamp(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof Timestamp) {
            return (Timestamp) v;
        }
        if (v instanceof Date) {
            return Timestamp.valueOf(((Date) v).toLocalDate().atStartOfDay());
        }
        try {
            return Timestamp.valueOf(LocalDateTime.parse(v.toString().trim().replace(' ', 'T')));
        } catch (RuntimeException e) {
            throw new SQLException("trexsql: '" + v + "' is not a timestamp", e);
        }
    }

    @Override
    public Timestamp getTimestamp(int column, Calendar cal) throws SQLException {
        return getTimestamp(column);
    }

    @Override
    public Time getTime(int column) throws SQLException {
        Object v = raw(column);
        if (v == null) {
            return null;
        }
        if (v instanceof Time) {
            return (Time) v;
        }
        if (v instanceof Timestamp) {
            return Time.valueOf(((Timestamp) v).toLocalDateTime().toLocalTime());
        }
        try {
            return Time.valueOf(LocalTime.parse(v.toString().trim()));
        } catch (RuntimeException e) {
            throw new SQLException("trexsql: '" + v + "' is not a time", e);
        }
    }

    @Override
    public Time getTime(int column, Calendar cal) throws SQLException {
        return getTime(column);
    }

    // --- getters by label ---

    @Override
    public Object getObject(String label) throws SQLException {
        return getObject(findColumn(label));
    }

    @Override
    public <T> T getObject(String label, Class<T> type) throws SQLException {
        return getObject(findColumn(label), type);
    }

    @Override
    public String getString(String label) throws SQLException {
        return getString(findColumn(label));
    }

    @Override
    public String getNString(String label) throws SQLException {
        return getNString(findColumn(label));
    }

    @Override
    public boolean getBoolean(String label) throws SQLException {
        return getBoolean(findColumn(label));
    }

    @Override
    public byte getByte(String label) throws SQLException {
        return getByte(findColumn(label));
    }

    @Override
    public short getShort(String label) throws SQLException {
        return getShort(findColumn(label));
    }

    @Override
    public int getInt(String label) throws SQLException {
        return getInt(findColumn(label));
    }

    @Override
    public long getLong(String label) throws SQLException {
        return getLong(findColumn(label));
    }

    @Override
    public float getFloat(String label) throws SQLException {
        return getFloat(findColumn(label));
    }

    @Override
    public double getDouble(String label) throws SQLException {
        return getDouble(findColumn(label));
    }

    @Override
    public BigDecimal getBigDecimal(String label) throws SQLException {
        return getBigDecimal(findColumn(label));
    }

    @Override
    public BigDecimal getBigDecimal(String label, int scale) throws SQLException {
        return getBigDecimal(findColumn(label), scale);
    }

    @Override
    public byte[] getBytes(String label) throws SQLException {
        return getBytes(findColumn(label));
    }

    @Override
    public Date getDate(String label) throws SQLException {
        return getDate(findColumn(label));
    }

    @Override
    public Date getDate(String label, Calendar cal) throws SQLException {
        return getDate(findColumn(label));
    }

    @Override
    public Timestamp getTimestamp(String label) throws SQLException {
        return getTimestamp(findColumn(label));
    }

    @Override
    public Timestamp getTimestamp(String label, Calendar cal) throws SQLException {
        return getTimestamp(findColumn(label));
    }

    @Override
    public Time getTime(String label) throws SQLException {
        return getTime(findColumn(label));
    }

    @Override
    public Time getTime(String label, Calendar cal) throws SQLException {
        return getTime(findColumn(label));
    }

    // --- cursor state ---

    @Override
    public boolean isBeforeFirst() {
        return index < 0 && limit > 0;
    }

    @Override
    public boolean isAfterLast() {
        return index >= limit && limit > 0;
    }

    @Override
    public boolean isFirst() {
        return index == 0 && limit > 0;
    }

    @Override
    public boolean isLast() {
        return index == limit - 1 && limit > 0;
    }

    @Override
    public int getRow() {
        return index >= 0 && index < limit ? index + 1 : 0;
    }

    @Override
    public int getType() {
        return ResultSet.TYPE_FORWARD_ONLY;
    }

    @Override
    public int getConcurrency() {
        return ResultSet.CONCUR_READ_ONLY;
    }

    @Override
    public int getHoldability() {
        return ResultSet.CLOSE_CURSORS_AT_COMMIT;
    }

    @Override
    public int getFetchDirection() {
        return ResultSet.FETCH_FORWARD;
    }

    @Override
    public void setFetchDirection(int direction) throws SQLException {
        if (direction != ResultSet.FETCH_FORWARD) {
            throw unsupported("fetch direction");
        }
    }

    @Override
    public void setFetchSize(int rows) {
        fetchSize = rows;
    }

    @Override
    public int getFetchSize() {
        return fetchSize;
    }

    @Override
    public SQLWarning getWarnings() {
        return null;
    }

    @Override
    public void clearWarnings() {
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
