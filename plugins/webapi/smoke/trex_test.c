/* End-to-end test of the webapi.trex DuckDB extension: open a trexsql/DuckDB
 * connection, LOAD the extension, then drive webapi_start/status as SQL functions.
 * webapi_start dlopens libwebapi-native.so and boots the embedded WebAPI server. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "duckdb.h"

static int q(duckdb_connection con, const char *sql, char **out) {
    duckdb_result res;
    if (duckdb_query(con, sql, &res) == DuckDBError) {
        fprintf(stderr, "QUERY ERROR [%s]: %s\n", sql, duckdb_result_error(&res));
        duckdb_destroy_result(&res);
        return 1;
    }
    if (out && duckdb_row_count(&res) > 0) {
        char *v = duckdb_value_varchar(&res, 0, 0);
        *out = v ? strdup(v) : NULL;
        if (v) duckdb_free(v);
    }
    duckdb_destroy_result(&res);
    return 0;
}

int main(void) {
    duckdb_database db;
    duckdb_connection con;
    duckdb_config cfg;
    duckdb_create_config(&cfg);
    duckdb_set_config(cfg, "allow_unsigned_extensions", "true");

    char *err = NULL;
    if (duckdb_open_ext(":memory:", &db, cfg, &err) == DuckDBError) {
        fprintf(stderr, "open failed: %s\n", err ? err : "(unknown)");
        return 2;
    }
    duckdb_destroy_config(&cfg);
    duckdb_connect(db, &con);
    printf("DUCKDB_OPEN_OK\n"); fflush(stdout);

    if (q(con, "LOAD '/app/webapi.trex'", NULL)) {
        fprintf(stderr, "LOAD webapi.trex failed\n");
        return 3;
    }
    printf("EXTENSION_LOADED\n"); fflush(stdout);

    char *started = NULL;
    q(con, "SELECT webapi_start()", &started);
    printf("WEBAPI_START=%s\n", started ? started : "(null)"); fflush(stdout);
    free(started);

    for (int i = 0; i < 150; i++) {
        char *st = NULL;
        q(con, "SELECT webapi_status()", &st);
        printf("WEBAPI_STATUS=%s\n", st ? st : "(null)"); fflush(stdout);
        free(st);
        sleep(2);
    }
    return 0;
}
