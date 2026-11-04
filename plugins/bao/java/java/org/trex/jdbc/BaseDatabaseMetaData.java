package org.trex.jdbc;

// Generated: every method of java.sql.DatabaseMetaData throws SQLFeatureNotSupportedException
// unless a subclass overrides it.
@SuppressWarnings({"deprecation", "unchecked"})
abstract class BaseDatabaseMetaData implements java.sql.DatabaseMetaData {

    static java.sql.SQLFeatureNotSupportedException unsupported(String m) {
        return new java.sql.SQLFeatureNotSupportedException("trexsql: " + m + " is not supported");
    }

    @Override
    public boolean allProceduresAreCallable() throws java.sql.SQLException {
        throw unsupported("allProceduresAreCallable");
    }

    @Override
    public boolean allTablesAreSelectable() throws java.sql.SQLException {
        throw unsupported("allTablesAreSelectable");
    }

    @Override
    public boolean autoCommitFailureClosesAllResultSets() throws java.sql.SQLException {
        throw unsupported("autoCommitFailureClosesAllResultSets");
    }

    @Override
    public boolean dataDefinitionCausesTransactionCommit() throws java.sql.SQLException {
        throw unsupported("dataDefinitionCausesTransactionCommit");
    }

    @Override
    public boolean dataDefinitionIgnoredInTransactions() throws java.sql.SQLException {
        throw unsupported("dataDefinitionIgnoredInTransactions");
    }

    @Override
    public boolean deletesAreDetected(int a0) throws java.sql.SQLException {
        throw unsupported("deletesAreDetected");
    }

    @Override
    public boolean doesMaxRowSizeIncludeBlobs() throws java.sql.SQLException {
        throw unsupported("doesMaxRowSizeIncludeBlobs");
    }

    @Override
    public boolean generatedKeyAlwaysReturned() throws java.sql.SQLException {
        throw unsupported("generatedKeyAlwaysReturned");
    }

    @Override
    public java.sql.ResultSet getAttributes(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getAttributes");
    }

    @Override
    public java.sql.ResultSet getBestRowIdentifier(java.lang.String a0, java.lang.String a1, java.lang.String a2, int a3, boolean a4) throws java.sql.SQLException {
        throw unsupported("getBestRowIdentifier");
    }

    @Override
    public java.lang.String getCatalogSeparator() throws java.sql.SQLException {
        throw unsupported("getCatalogSeparator");
    }

    @Override
    public java.lang.String getCatalogTerm() throws java.sql.SQLException {
        throw unsupported("getCatalogTerm");
    }

    @Override
    public java.sql.ResultSet getCatalogs() throws java.sql.SQLException {
        throw unsupported("getCatalogs");
    }

    @Override
    public java.sql.ResultSet getClientInfoProperties() throws java.sql.SQLException {
        throw unsupported("getClientInfoProperties");
    }

    @Override
    public java.sql.ResultSet getColumnPrivileges(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getColumnPrivileges");
    }

    @Override
    public java.sql.ResultSet getColumns(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getColumns");
    }

    @Override
    public java.sql.Connection getConnection() throws java.sql.SQLException {
        throw unsupported("getConnection");
    }

    @Override
    public java.sql.ResultSet getCrossReference(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3, java.lang.String a4, java.lang.String a5) throws java.sql.SQLException {
        throw unsupported("getCrossReference");
    }

    @Override
    public int getDatabaseMajorVersion() throws java.sql.SQLException {
        throw unsupported("getDatabaseMajorVersion");
    }

    @Override
    public int getDatabaseMinorVersion() throws java.sql.SQLException {
        throw unsupported("getDatabaseMinorVersion");
    }

    @Override
    public java.lang.String getDatabaseProductName() throws java.sql.SQLException {
        throw unsupported("getDatabaseProductName");
    }

    @Override
    public java.lang.String getDatabaseProductVersion() throws java.sql.SQLException {
        throw unsupported("getDatabaseProductVersion");
    }

    @Override
    public int getDefaultTransactionIsolation() throws java.sql.SQLException {
        throw unsupported("getDefaultTransactionIsolation");
    }

    @Override
    public int getDriverMajorVersion() {
        throw new UnsupportedOperationException("trexsql: getDriverMajorVersion is not supported");
    }

    @Override
    public int getDriverMinorVersion() {
        throw new UnsupportedOperationException("trexsql: getDriverMinorVersion is not supported");
    }

    @Override
    public java.lang.String getDriverName() throws java.sql.SQLException {
        throw unsupported("getDriverName");
    }

    @Override
    public java.lang.String getDriverVersion() throws java.sql.SQLException {
        throw unsupported("getDriverVersion");
    }

    @Override
    public java.sql.ResultSet getExportedKeys(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getExportedKeys");
    }

    @Override
    public java.lang.String getExtraNameCharacters() throws java.sql.SQLException {
        throw unsupported("getExtraNameCharacters");
    }

    @Override
    public java.sql.ResultSet getFunctionColumns(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getFunctionColumns");
    }

    @Override
    public java.sql.ResultSet getFunctions(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getFunctions");
    }

    @Override
    public java.lang.String getIdentifierQuoteString() throws java.sql.SQLException {
        throw unsupported("getIdentifierQuoteString");
    }

    @Override
    public java.sql.ResultSet getImportedKeys(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getImportedKeys");
    }

    @Override
    public java.sql.ResultSet getIndexInfo(java.lang.String a0, java.lang.String a1, java.lang.String a2, boolean a3, boolean a4) throws java.sql.SQLException {
        throw unsupported("getIndexInfo");
    }

    @Override
    public int getJDBCMajorVersion() throws java.sql.SQLException {
        throw unsupported("getJDBCMajorVersion");
    }

    @Override
    public int getJDBCMinorVersion() throws java.sql.SQLException {
        throw unsupported("getJDBCMinorVersion");
    }

    @Override
    public int getMaxBinaryLiteralLength() throws java.sql.SQLException {
        throw unsupported("getMaxBinaryLiteralLength");
    }

    @Override
    public int getMaxCatalogNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxCatalogNameLength");
    }

    @Override
    public int getMaxCharLiteralLength() throws java.sql.SQLException {
        throw unsupported("getMaxCharLiteralLength");
    }

    @Override
    public int getMaxColumnNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxColumnNameLength");
    }

    @Override
    public int getMaxColumnsInGroupBy() throws java.sql.SQLException {
        throw unsupported("getMaxColumnsInGroupBy");
    }

    @Override
    public int getMaxColumnsInIndex() throws java.sql.SQLException {
        throw unsupported("getMaxColumnsInIndex");
    }

    @Override
    public int getMaxColumnsInOrderBy() throws java.sql.SQLException {
        throw unsupported("getMaxColumnsInOrderBy");
    }

    @Override
    public int getMaxColumnsInSelect() throws java.sql.SQLException {
        throw unsupported("getMaxColumnsInSelect");
    }

    @Override
    public int getMaxColumnsInTable() throws java.sql.SQLException {
        throw unsupported("getMaxColumnsInTable");
    }

    @Override
    public int getMaxConnections() throws java.sql.SQLException {
        throw unsupported("getMaxConnections");
    }

    @Override
    public int getMaxCursorNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxCursorNameLength");
    }

    @Override
    public int getMaxIndexLength() throws java.sql.SQLException {
        throw unsupported("getMaxIndexLength");
    }

    @Override
    public int getMaxProcedureNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxProcedureNameLength");
    }

    @Override
    public int getMaxRowSize() throws java.sql.SQLException {
        throw unsupported("getMaxRowSize");
    }

    @Override
    public int getMaxSchemaNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxSchemaNameLength");
    }

    @Override
    public int getMaxStatementLength() throws java.sql.SQLException {
        throw unsupported("getMaxStatementLength");
    }

    @Override
    public int getMaxStatements() throws java.sql.SQLException {
        throw unsupported("getMaxStatements");
    }

    @Override
    public int getMaxTableNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxTableNameLength");
    }

    @Override
    public int getMaxTablesInSelect() throws java.sql.SQLException {
        throw unsupported("getMaxTablesInSelect");
    }

    @Override
    public int getMaxUserNameLength() throws java.sql.SQLException {
        throw unsupported("getMaxUserNameLength");
    }

    @Override
    public java.lang.String getNumericFunctions() throws java.sql.SQLException {
        throw unsupported("getNumericFunctions");
    }

    @Override
    public java.sql.ResultSet getPrimaryKeys(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getPrimaryKeys");
    }

    @Override
    public java.sql.ResultSet getProcedureColumns(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getProcedureColumns");
    }

    @Override
    public java.lang.String getProcedureTerm() throws java.sql.SQLException {
        throw unsupported("getProcedureTerm");
    }

    @Override
    public java.sql.ResultSet getProcedures(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getProcedures");
    }

    @Override
    public java.sql.ResultSet getPseudoColumns(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String a3) throws java.sql.SQLException {
        throw unsupported("getPseudoColumns");
    }

    @Override
    public int getResultSetHoldability() throws java.sql.SQLException {
        throw unsupported("getResultSetHoldability");
    }

    @Override
    public java.sql.RowIdLifetime getRowIdLifetime() throws java.sql.SQLException {
        throw unsupported("getRowIdLifetime");
    }

    @Override
    public java.lang.String getSQLKeywords() throws java.sql.SQLException {
        throw unsupported("getSQLKeywords");
    }

    @Override
    public int getSQLStateType() throws java.sql.SQLException {
        throw unsupported("getSQLStateType");
    }

    @Override
    public java.lang.String getSchemaTerm() throws java.sql.SQLException {
        throw unsupported("getSchemaTerm");
    }

    @Override
    public java.sql.ResultSet getSchemas() throws java.sql.SQLException {
        throw unsupported("getSchemas");
    }

    @Override
    public java.sql.ResultSet getSchemas(java.lang.String a0, java.lang.String a1) throws java.sql.SQLException {
        throw unsupported("getSchemas");
    }

    @Override
    public java.lang.String getSearchStringEscape() throws java.sql.SQLException {
        throw unsupported("getSearchStringEscape");
    }

    @Override
    public java.lang.String getStringFunctions() throws java.sql.SQLException {
        throw unsupported("getStringFunctions");
    }

    @Override
    public java.sql.ResultSet getSuperTables(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getSuperTables");
    }

    @Override
    public java.sql.ResultSet getSuperTypes(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getSuperTypes");
    }

    @Override
    public java.lang.String getSystemFunctions() throws java.sql.SQLException {
        throw unsupported("getSystemFunctions");
    }

    @Override
    public java.sql.ResultSet getTablePrivileges(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getTablePrivileges");
    }

    @Override
    public java.sql.ResultSet getTableTypes() throws java.sql.SQLException {
        throw unsupported("getTableTypes");
    }

    @Override
    public java.sql.ResultSet getTables(java.lang.String a0, java.lang.String a1, java.lang.String a2, java.lang.String[] a3) throws java.sql.SQLException {
        throw unsupported("getTables");
    }

    @Override
    public java.lang.String getTimeDateFunctions() throws java.sql.SQLException {
        throw unsupported("getTimeDateFunctions");
    }

    @Override
    public java.sql.ResultSet getTypeInfo() throws java.sql.SQLException {
        throw unsupported("getTypeInfo");
    }

    @Override
    public java.sql.ResultSet getUDTs(java.lang.String a0, java.lang.String a1, java.lang.String a2, int[] a3) throws java.sql.SQLException {
        throw unsupported("getUDTs");
    }

    @Override
    public java.lang.String getURL() throws java.sql.SQLException {
        throw unsupported("getURL");
    }

    @Override
    public java.lang.String getUserName() throws java.sql.SQLException {
        throw unsupported("getUserName");
    }

    @Override
    public java.sql.ResultSet getVersionColumns(java.lang.String a0, java.lang.String a1, java.lang.String a2) throws java.sql.SQLException {
        throw unsupported("getVersionColumns");
    }

    @Override
    public boolean insertsAreDetected(int a0) throws java.sql.SQLException {
        throw unsupported("insertsAreDetected");
    }

    @Override
    public boolean isCatalogAtStart() throws java.sql.SQLException {
        throw unsupported("isCatalogAtStart");
    }

    @Override
    public boolean isReadOnly() throws java.sql.SQLException {
        throw unsupported("isReadOnly");
    }

    @Override
    public boolean isWrapperFor(java.lang.Class<?> a0) throws java.sql.SQLException {
        throw unsupported("isWrapperFor");
    }

    @Override
    public boolean locatorsUpdateCopy() throws java.sql.SQLException {
        throw unsupported("locatorsUpdateCopy");
    }

    @Override
    public boolean nullPlusNonNullIsNull() throws java.sql.SQLException {
        throw unsupported("nullPlusNonNullIsNull");
    }

    @Override
    public boolean nullsAreSortedAtEnd() throws java.sql.SQLException {
        throw unsupported("nullsAreSortedAtEnd");
    }

    @Override
    public boolean nullsAreSortedAtStart() throws java.sql.SQLException {
        throw unsupported("nullsAreSortedAtStart");
    }

    @Override
    public boolean nullsAreSortedHigh() throws java.sql.SQLException {
        throw unsupported("nullsAreSortedHigh");
    }

    @Override
    public boolean nullsAreSortedLow() throws java.sql.SQLException {
        throw unsupported("nullsAreSortedLow");
    }

    @Override
    public boolean othersDeletesAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("othersDeletesAreVisible");
    }

    @Override
    public boolean othersInsertsAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("othersInsertsAreVisible");
    }

    @Override
    public boolean othersUpdatesAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("othersUpdatesAreVisible");
    }

    @Override
    public boolean ownDeletesAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("ownDeletesAreVisible");
    }

    @Override
    public boolean ownInsertsAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("ownInsertsAreVisible");
    }

    @Override
    public boolean ownUpdatesAreVisible(int a0) throws java.sql.SQLException {
        throw unsupported("ownUpdatesAreVisible");
    }

    @Override
    public boolean storesLowerCaseIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesLowerCaseIdentifiers");
    }

    @Override
    public boolean storesLowerCaseQuotedIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesLowerCaseQuotedIdentifiers");
    }

    @Override
    public boolean storesMixedCaseIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesMixedCaseIdentifiers");
    }

    @Override
    public boolean storesMixedCaseQuotedIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesMixedCaseQuotedIdentifiers");
    }

    @Override
    public boolean storesUpperCaseIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesUpperCaseIdentifiers");
    }

    @Override
    public boolean storesUpperCaseQuotedIdentifiers() throws java.sql.SQLException {
        throw unsupported("storesUpperCaseQuotedIdentifiers");
    }

    @Override
    public boolean supportsANSI92EntryLevelSQL() throws java.sql.SQLException {
        throw unsupported("supportsANSI92EntryLevelSQL");
    }

    @Override
    public boolean supportsANSI92FullSQL() throws java.sql.SQLException {
        throw unsupported("supportsANSI92FullSQL");
    }

    @Override
    public boolean supportsANSI92IntermediateSQL() throws java.sql.SQLException {
        throw unsupported("supportsANSI92IntermediateSQL");
    }

    @Override
    public boolean supportsAlterTableWithAddColumn() throws java.sql.SQLException {
        throw unsupported("supportsAlterTableWithAddColumn");
    }

    @Override
    public boolean supportsAlterTableWithDropColumn() throws java.sql.SQLException {
        throw unsupported("supportsAlterTableWithDropColumn");
    }

    @Override
    public boolean supportsBatchUpdates() throws java.sql.SQLException {
        throw unsupported("supportsBatchUpdates");
    }

    @Override
    public boolean supportsCatalogsInDataManipulation() throws java.sql.SQLException {
        throw unsupported("supportsCatalogsInDataManipulation");
    }

    @Override
    public boolean supportsCatalogsInIndexDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsCatalogsInIndexDefinitions");
    }

    @Override
    public boolean supportsCatalogsInPrivilegeDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsCatalogsInPrivilegeDefinitions");
    }

    @Override
    public boolean supportsCatalogsInProcedureCalls() throws java.sql.SQLException {
        throw unsupported("supportsCatalogsInProcedureCalls");
    }

    @Override
    public boolean supportsCatalogsInTableDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsCatalogsInTableDefinitions");
    }

    @Override
    public boolean supportsColumnAliasing() throws java.sql.SQLException {
        throw unsupported("supportsColumnAliasing");
    }

    @Override
    public boolean supportsConvert() throws java.sql.SQLException {
        throw unsupported("supportsConvert");
    }

    @Override
    public boolean supportsConvert(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("supportsConvert");
    }

    @Override
    public boolean supportsCoreSQLGrammar() throws java.sql.SQLException {
        throw unsupported("supportsCoreSQLGrammar");
    }

    @Override
    public boolean supportsCorrelatedSubqueries() throws java.sql.SQLException {
        throw unsupported("supportsCorrelatedSubqueries");
    }

    @Override
    public boolean supportsDataDefinitionAndDataManipulationTransactions() throws java.sql.SQLException {
        throw unsupported("supportsDataDefinitionAndDataManipulationTransactions");
    }

    @Override
    public boolean supportsDataManipulationTransactionsOnly() throws java.sql.SQLException {
        throw unsupported("supportsDataManipulationTransactionsOnly");
    }

    @Override
    public boolean supportsDifferentTableCorrelationNames() throws java.sql.SQLException {
        throw unsupported("supportsDifferentTableCorrelationNames");
    }

    @Override
    public boolean supportsExpressionsInOrderBy() throws java.sql.SQLException {
        throw unsupported("supportsExpressionsInOrderBy");
    }

    @Override
    public boolean supportsExtendedSQLGrammar() throws java.sql.SQLException {
        throw unsupported("supportsExtendedSQLGrammar");
    }

    @Override
    public boolean supportsFullOuterJoins() throws java.sql.SQLException {
        throw unsupported("supportsFullOuterJoins");
    }

    @Override
    public boolean supportsGetGeneratedKeys() throws java.sql.SQLException {
        throw unsupported("supportsGetGeneratedKeys");
    }

    @Override
    public boolean supportsGroupBy() throws java.sql.SQLException {
        throw unsupported("supportsGroupBy");
    }

    @Override
    public boolean supportsGroupByBeyondSelect() throws java.sql.SQLException {
        throw unsupported("supportsGroupByBeyondSelect");
    }

    @Override
    public boolean supportsGroupByUnrelated() throws java.sql.SQLException {
        throw unsupported("supportsGroupByUnrelated");
    }

    @Override
    public boolean supportsIntegrityEnhancementFacility() throws java.sql.SQLException {
        throw unsupported("supportsIntegrityEnhancementFacility");
    }

    @Override
    public boolean supportsLikeEscapeClause() throws java.sql.SQLException {
        throw unsupported("supportsLikeEscapeClause");
    }

    @Override
    public boolean supportsLimitedOuterJoins() throws java.sql.SQLException {
        throw unsupported("supportsLimitedOuterJoins");
    }

    @Override
    public boolean supportsMinimumSQLGrammar() throws java.sql.SQLException {
        throw unsupported("supportsMinimumSQLGrammar");
    }

    @Override
    public boolean supportsMixedCaseIdentifiers() throws java.sql.SQLException {
        throw unsupported("supportsMixedCaseIdentifiers");
    }

    @Override
    public boolean supportsMixedCaseQuotedIdentifiers() throws java.sql.SQLException {
        throw unsupported("supportsMixedCaseQuotedIdentifiers");
    }

    @Override
    public boolean supportsMultipleOpenResults() throws java.sql.SQLException {
        throw unsupported("supportsMultipleOpenResults");
    }

    @Override
    public boolean supportsMultipleResultSets() throws java.sql.SQLException {
        throw unsupported("supportsMultipleResultSets");
    }

    @Override
    public boolean supportsMultipleTransactions() throws java.sql.SQLException {
        throw unsupported("supportsMultipleTransactions");
    }

    @Override
    public boolean supportsNamedParameters() throws java.sql.SQLException {
        throw unsupported("supportsNamedParameters");
    }

    @Override
    public boolean supportsNonNullableColumns() throws java.sql.SQLException {
        throw unsupported("supportsNonNullableColumns");
    }

    @Override
    public boolean supportsOpenCursorsAcrossCommit() throws java.sql.SQLException {
        throw unsupported("supportsOpenCursorsAcrossCommit");
    }

    @Override
    public boolean supportsOpenCursorsAcrossRollback() throws java.sql.SQLException {
        throw unsupported("supportsOpenCursorsAcrossRollback");
    }

    @Override
    public boolean supportsOpenStatementsAcrossCommit() throws java.sql.SQLException {
        throw unsupported("supportsOpenStatementsAcrossCommit");
    }

    @Override
    public boolean supportsOpenStatementsAcrossRollback() throws java.sql.SQLException {
        throw unsupported("supportsOpenStatementsAcrossRollback");
    }

    @Override
    public boolean supportsOrderByUnrelated() throws java.sql.SQLException {
        throw unsupported("supportsOrderByUnrelated");
    }

    @Override
    public boolean supportsOuterJoins() throws java.sql.SQLException {
        throw unsupported("supportsOuterJoins");
    }

    @Override
    public boolean supportsPositionedDelete() throws java.sql.SQLException {
        throw unsupported("supportsPositionedDelete");
    }

    @Override
    public boolean supportsPositionedUpdate() throws java.sql.SQLException {
        throw unsupported("supportsPositionedUpdate");
    }

    @Override
    public boolean supportsResultSetConcurrency(int a0, int a1) throws java.sql.SQLException {
        throw unsupported("supportsResultSetConcurrency");
    }

    @Override
    public boolean supportsResultSetHoldability(int a0) throws java.sql.SQLException {
        throw unsupported("supportsResultSetHoldability");
    }

    @Override
    public boolean supportsResultSetType(int a0) throws java.sql.SQLException {
        throw unsupported("supportsResultSetType");
    }

    @Override
    public boolean supportsSavepoints() throws java.sql.SQLException {
        throw unsupported("supportsSavepoints");
    }

    @Override
    public boolean supportsSchemasInDataManipulation() throws java.sql.SQLException {
        throw unsupported("supportsSchemasInDataManipulation");
    }

    @Override
    public boolean supportsSchemasInIndexDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsSchemasInIndexDefinitions");
    }

    @Override
    public boolean supportsSchemasInPrivilegeDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsSchemasInPrivilegeDefinitions");
    }

    @Override
    public boolean supportsSchemasInProcedureCalls() throws java.sql.SQLException {
        throw unsupported("supportsSchemasInProcedureCalls");
    }

    @Override
    public boolean supportsSchemasInTableDefinitions() throws java.sql.SQLException {
        throw unsupported("supportsSchemasInTableDefinitions");
    }

    @Override
    public boolean supportsSelectForUpdate() throws java.sql.SQLException {
        throw unsupported("supportsSelectForUpdate");
    }

    @Override
    public boolean supportsStatementPooling() throws java.sql.SQLException {
        throw unsupported("supportsStatementPooling");
    }

    @Override
    public boolean supportsStoredFunctionsUsingCallSyntax() throws java.sql.SQLException {
        throw unsupported("supportsStoredFunctionsUsingCallSyntax");
    }

    @Override
    public boolean supportsStoredProcedures() throws java.sql.SQLException {
        throw unsupported("supportsStoredProcedures");
    }

    @Override
    public boolean supportsSubqueriesInComparisons() throws java.sql.SQLException {
        throw unsupported("supportsSubqueriesInComparisons");
    }

    @Override
    public boolean supportsSubqueriesInExists() throws java.sql.SQLException {
        throw unsupported("supportsSubqueriesInExists");
    }

    @Override
    public boolean supportsSubqueriesInIns() throws java.sql.SQLException {
        throw unsupported("supportsSubqueriesInIns");
    }

    @Override
    public boolean supportsSubqueriesInQuantifieds() throws java.sql.SQLException {
        throw unsupported("supportsSubqueriesInQuantifieds");
    }

    @Override
    public boolean supportsTableCorrelationNames() throws java.sql.SQLException {
        throw unsupported("supportsTableCorrelationNames");
    }

    @Override
    public boolean supportsTransactionIsolationLevel(int a0) throws java.sql.SQLException {
        throw unsupported("supportsTransactionIsolationLevel");
    }

    @Override
    public boolean supportsTransactions() throws java.sql.SQLException {
        throw unsupported("supportsTransactions");
    }

    @Override
    public boolean supportsUnion() throws java.sql.SQLException {
        throw unsupported("supportsUnion");
    }

    @Override
    public boolean supportsUnionAll() throws java.sql.SQLException {
        throw unsupported("supportsUnionAll");
    }

    @Override
    public <T> T unwrap(java.lang.Class<T> a0) throws java.sql.SQLException {
        throw unsupported("unwrap");
    }

    @Override
    public boolean updatesAreDetected(int a0) throws java.sql.SQLException {
        throw unsupported("updatesAreDetected");
    }

    @Override
    public boolean usesLocalFilePerTable() throws java.sql.SQLException {
        throw unsupported("usesLocalFilePerTable");
    }

    @Override
    public boolean usesLocalFiles() throws java.sql.SQLException {
        throw unsupported("usesLocalFiles");
    }
}
