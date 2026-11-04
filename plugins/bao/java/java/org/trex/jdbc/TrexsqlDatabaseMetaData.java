package org.trex.jdbc;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.RowIdLifetime;
import java.sql.SQLException;

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
