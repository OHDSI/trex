// HANA entry-point SQL. Split out of trex_lib.js so it is testable without
// ext:core/mod.js.

function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildHanaScanSql(query, connectionUrl, sessionId) {
  return `select * from trex_hana_scan(${quoteSqlString(query)}, ${
    quoteSqlString(connectionUrl)
  }, session_id = ${quoteSqlString(sessionId)})`;
}

export function buildHanaExecuteSql(connectionUrl, sql, sessionId) {
  return `select trex_hana_execute(${quoteSqlString(connectionUrl)}, ${
    quoteSqlString(sql)
  }, ${quoteSqlString(sessionId)})`;
}

export function buildHanaEvictSessionSql(sessionId) {
  return `select trex_hana_evict_session(${quoteSqlString(sessionId)})`;
}
