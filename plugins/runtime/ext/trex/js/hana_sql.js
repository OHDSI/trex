function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function serializeSessionVariables(sessionVariables) {
  return JSON.stringify(sessionVariables ?? {});
}

export function buildHanaScanSql(
  query,
  connectionUrl,
  sessionId,
  sessionVariables,
) {
  return `select * from trex_hana_scan(${quoteSqlString(query)}, ${
    quoteSqlString(connectionUrl)
  }, session_id = ${quoteSqlString(sessionId)}, session_vars_json = ${
    quoteSqlString(serializeSessionVariables(sessionVariables))
  })`;
}

export function buildHanaExecuteSql(
  connectionUrl,
  sql,
  sessionId,
  sessionVariables,
) {
  return `select trex_hana_execute(${quoteSqlString(connectionUrl)}, ${
    quoteSqlString(sql)
  }, ${quoteSqlString(sessionId)}, ${
    quoteSqlString(serializeSessionVariables(sessionVariables))
  })`;
}
