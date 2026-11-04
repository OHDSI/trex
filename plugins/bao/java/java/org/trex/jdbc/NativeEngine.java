package org.trex.jdbc;

import com.sun.jna.Pointer;
import org.trex.TrexEngine;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/** Thin, error-checked access to the libtrexsql_engine C API. */
final class NativeEngine {

    // Column type codes of trexsql_result_column_type.
    static final int TYPE_OTHER = 0;
    static final int TYPE_BOOLEAN = 1;
    static final int TYPE_INTEGER = 2;
    static final int TYPE_BIGINT = 3;
    static final int TYPE_DOUBLE = 4;
    static final int TYPE_DECIMAL = 5;
    static final int TYPE_VARCHAR = 6;
    static final int TYPE_DATE = 7;
    static final int TYPE_TIMESTAMP = 8;
    static final int TYPE_TIME = 9;
    static final int TYPE_BLOB = 10;

    private NativeEngine() {
    }

    private static TrexEngine lib() {
        return TrexEngine.INSTANCE;
    }

    private static SQLException error(String context) {
        String msg = lib().trexsql_last_error();
        return new SQLException(msg == null ? "trexsql: " + context + " failed" : msg);
    }

    /** A private in-memory session; its statements run unprepared, so it can be routed with CONNECT. */
    static Pointer openSession() throws SQLException {
        Pointer db = lib().trexsql_open_session();
        if (db == null) {
            throw error("open");
        }
        return db;
    }

    static void close(Pointer db) {
        if (db != null) {
            lib().trexsql_close(db);
        }
    }

    /** Runs one or more statements without a result. */
    static void execute(Pointer db, String sql) throws SQLException {
        if (lib().trexsql_execute(db, sql) != 0) {
            throw error("execute");
        }
    }

    /** Runs a single statement and materialises its result. */
    static Rows query(Pointer db, String sql) throws SQLException {
        TrexEngine lib = lib();
        Pointer r = lib.trexsql_query(db, sql);
        if (r == null) {
            throw error("query");
        }
        try {
            int cols = lib.trexsql_result_column_count(r);
            String[] names = new String[cols];
            int[] types = new int[cols];
            for (int c = 0; c < cols; c++) {
                names[c] = lib.trexsql_result_column_name(r, c);
                types[c] = lib.trexsql_result_column_type(r, c);
            }
            List<Object[]> rows = new ArrayList<>();
            while (lib.trexsql_result_next(r) == 1) {
                Object[] row = new Object[cols];
                for (int c = 0; c < cols; c++) {
                    row[c] = lib.trexsql_result_is_null(r, c) == 1 ? null : value(lib, r, c, types[c]);
                }
                rows.add(row);
            }
            return new Rows(names, types, rows);
        } finally {
            lib.trexsql_result_close(r);
        }
    }

    private static Object value(TrexEngine lib, Pointer r, int c, int type) {
        switch (type) {
            case TYPE_BOOLEAN:
                return lib.trexsql_result_get_long(r, c) != 0;
            case TYPE_INTEGER:
                return (int) lib.trexsql_result_get_long(r, c);
            case TYPE_BIGINT:
                return lib.trexsql_result_get_long(r, c);
            case TYPE_DOUBLE:
                return lib.trexsql_result_get_double(r, c);
            case TYPE_DECIMAL:
                return new BigDecimal(string(lib, r, c));
            case TYPE_DATE:
                return java.sql.Date.valueOf(LocalDate.ofEpochDay(lib.trexsql_result_get_long(r, c)));
            case TYPE_TIMESTAMP: {
                long micros = lib.trexsql_result_get_long(r, c);
                LocalDateTime ldt = LocalDateTime.ofEpochSecond(
                        Math.floorDiv(micros, 1_000_000L),
                        (int) Math.floorMod(micros, 1_000_000L) * 1000,
                        ZoneOffset.UTC);
                return Timestamp.valueOf(ldt);
            }
            case TYPE_TIME:
                return java.sql.Time.valueOf(LocalTime.ofNanoOfDay(lib.trexsql_result_get_long(r, c) * 1000));
            case TYPE_BLOB:
                return HexFormat.of().parseHex(string(lib, r, c));
            default:
                return string(lib, r, c);
        }
    }

    private static String string(TrexEngine lib, Pointer r, int c) {
        Pointer p = lib.trexsql_result_get_string(r, c);
        if (p == null) {
            return null;
        }
        try {
            return p.getString(0, "UTF-8");
        } finally {
            lib.trexsql_free_string(p);
        }
    }

    /** A materialised result. */
    static final class Rows {
        final String[] names;
        final int[] types;
        final List<Object[]> rows;

        Rows(String[] names, int[] types, List<Object[]> rows) {
            this.names = names;
            this.types = types;
            this.rows = rows;
        }
    }
}
