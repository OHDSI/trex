package org.trex.jdbc;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.RowIdLifetime;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** The metadata Spring JDBC and connection pools ask for. */
final class TrexsqlDatabaseMetaData extends BaseDatabaseMetaData {

    private final TrexsqlConnection conn;

    TrexsqlDatabaseMetaData(TrexsqlConnection conn) {
        this.conn = conn;
    }

    @Override
    public Connection getConnection() {
        return conn;
    }

    @Override
    public String getURL() {
        return conn.url();
    }

    @Override
    public String getUserName() {
        return null;
    }

    @Override
    public String getDatabaseProductName() {
        return "TrexSQL";
    }

    @Override
    public String getDatabaseProductVersion() {
        return getDatabaseMajorVersion() + "." + getDatabaseMinorVersion();
    }

    @Override
    public int getDatabaseMajorVersion() {
        return 2;
    }

    @Override
    public int getDatabaseMinorVersion() {
        return 0;
    }

    @Override
    public String getDriverName() {
        return "TrexSQL JDBC";
    }

    @Override
    public String getDriverVersion() {
        return TrexsqlDriver.MAJOR + "." + TrexsqlDriver.MINOR;
    }

    @Override
    public int getDriverMajorVersion() {
        return TrexsqlDriver.MAJOR;
    }

    @Override
    public int getDriverMinorVersion() {
        return TrexsqlDriver.MINOR;
    }

    @Override
    public int getJDBCMajorVersion() {
        return 4;
    }

    @Override
    public int getJDBCMinorVersion() {
        return 2;
    }

    @Override
    public boolean isReadOnly() {
        return false;
    }

    @Override
    public boolean supportsBatchUpdates() {
        return true;
    }

    @Override
    public boolean supportsTransactions() {
        return true;
    }

    @Override
    public boolean supportsTransactionIsolationLevel(int level) {
        return level == Connection.TRANSACTION_SERIALIZABLE;
    }

    @Override
    public int getDefaultTransactionIsolation() {
        return Connection.TRANSACTION_SERIALIZABLE;
    }

    @Override
    public boolean supportsDataDefinitionAndDataManipulationTransactions() {
        return true;
    }

    @Override
    public boolean supportsGetGeneratedKeys() {
        return false;
    }

    @Override
    public boolean supportsSavepoints() {
        return false;
    }

    @Override
    public boolean supportsMultipleResultSets() {
        return false;
    }

    @Override
    public boolean supportsResultSetType(int type) {
        return type == ResultSet.TYPE_FORWARD_ONLY;
    }

    @Override
    public boolean supportsResultSetConcurrency(int type, int concurrency) {
        return type == ResultSet.TYPE_FORWARD_ONLY && concurrency == ResultSet.CONCUR_READ_ONLY;
    }

    @Override
    public boolean supportsResultSetHoldability(int holdability) {
        return holdability == ResultSet.CLOSE_CURSORS_AT_COMMIT;
    }

    @Override
    public int getResultSetHoldability() {
        return ResultSet.CLOSE_CURSORS_AT_COMMIT;
    }

    @Override
    public String getIdentifierQuoteString() {
        return "\"";
    }

    @Override
    public String getSearchStringEscape() {
        return "\\";
    }

    @Override
    public String getExtraNameCharacters() {
        return "";
    }

    @Override
    public String getSQLKeywords() {
        return "";
    }

    @Override
    public String getCatalogSeparator() {
        return ".";
    }

    @Override
    public String getSchemaTerm() {
        return "schema";
    }

    @Override
    public String getCatalogTerm() {
        return "catalog";
    }

    @Override
    public String getProcedureTerm() {
        return "procedure";
    }

    @Override
    public boolean storesLowerCaseIdentifiers() {
        return true;
    }

    @Override
    public boolean storesUpperCaseIdentifiers() {
        return false;
    }

    @Override
    public boolean storesMixedCaseIdentifiers() {
        return false;
    }

    @Override
    public boolean supportsMixedCaseIdentifiers() {
        return false;
    }

    @Override
    public boolean storesMixedCaseQuotedIdentifiers() {
        return true;
    }

    @Override
    public boolean supportsMixedCaseQuotedIdentifiers() {
        return true;
    }

    @Override
    public boolean nullsAreSortedHigh() {
        return false;
    }

    @Override
    public boolean nullsAreSortedLow() {
        return false;
    }

    @Override
    public boolean nullsAreSortedAtStart() {
        return false;
    }

    @Override
    public boolean nullsAreSortedAtEnd() {
        return true;
    }

    private static final String TABLE_TYPE =
            "CASE table_type WHEN 'BASE TABLE' THEN 'TABLE' ELSE table_type END";

    // Placeholders are bound client-side as literals, so this also works on a
    // session routed to a remote server, where the engine cannot prepare.
    @Override
    public ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
            throws SQLException {
        StringBuilder sql = new StringBuilder("SELECT table_catalog AS \"TABLE_CAT\", table_schema AS \"TABLE_SCHEM\", "
                + "table_name AS \"TABLE_NAME\", " + TABLE_TYPE + " AS \"TABLE_TYPE\", "
                + "NULL::VARCHAR AS \"REMARKS\", NULL::VARCHAR AS \"TYPE_CAT\", NULL::VARCHAR AS \"TYPE_SCHEM\", "
                + "NULL::VARCHAR AS \"TYPE_NAME\", NULL::VARCHAR AS \"SELF_REFERENCING_COL_NAME\", "
                + "NULL::VARCHAR AS \"REF_GENERATION\" FROM information_schema.tables WHERE true");
        List<Object> params = new ArrayList<>();
        if (catalog != null) {
            sql.append(" AND table_catalog = ?");
            params.add(catalog);
        }
        if (schemaPattern != null) {
            sql.append(" AND table_schema LIKE ? ESCAPE '\\'");
            params.add(schemaPattern);
        }
        if (tableNamePattern != null) {
            sql.append(" AND table_name LIKE ? ESCAPE '\\'");
            params.add(tableNamePattern);
        }
        if (types != null) {
            sql.append(" AND ").append(TABLE_TYPE).append(" IN (NULL");
            for (String t : types) {
                sql.append(", ?");
                params.add(t);
            }
            sql.append(")");
        }
        sql.append(" ORDER BY \"TABLE_TYPE\", \"TABLE_CAT\", \"TABLE_SCHEM\", \"TABLE_NAME\"");
        PreparedStatement ps = conn.prepareStatement(sql.toString());
        try {
            for (int i = 0; i < params.size(); i++) {
                ps.setObject(i + 1, params.get(i));
            }
            ResultSet rs = ps.executeQuery();
            ps.closeOnCompletion();
            return rs;
        } catch (SQLException e) {
            ps.close();
            throw e;
        }
    }

    @Override
    public RowIdLifetime getRowIdLifetime() {
        return RowIdLifetime.ROWID_UNSUPPORTED;
    }

    @Override
    public boolean supportsStoredProcedures() {
        return false;
    }

    @Override
    public boolean generatedKeyAlwaysReturned() {
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
