package org.trex.jdbc;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.DriverPropertyInfo;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.logging.Logger;

/**
 * JDBC driver for trexsql.
 *
 * <pre>
 *   jdbc:trexdb://host[:port][?disable_ssl=true]   a remote trex server, over Quack
 *   jdbc:trexdb::memory:                           a private in-process engine
 * </pre>
 *
 * {@code jdbc:trexsql:} is accepted as an alias for sources stored before the rename.
 *
 * The access token is the {@code password} property (or a {@code token} URL
 * parameter). A remote connection opens a local engine and routes its whole
 * session to the server with {@code CONNECT}, so temp tables and transactions
 * live on the server for the lifetime of the connection.
 */
public final class TrexsqlDriver implements Driver {

    public static final String PREFIX = "jdbc:trexdb:";
    static final String LEGACY_PREFIX = "jdbc:trexsql:";
    static final String MEMORY = ":memory:";
    static final int MAJOR = 1;
    static final int MINOR = 0;

    static {
        try {
            DriverManager.registerDriver(new TrexsqlDriver());
        } catch (SQLException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    /** Forces class initialisation, which registers the driver. */
    public static void register() {
    }

    @Override
    public boolean acceptsURL(String url) {
        return url != null && (url.startsWith(PREFIX) || url.startsWith(LEGACY_PREFIX));
    }

    @Override
    public Connection connect(String url, Properties info) throws SQLException {
        if (!acceptsURL(url)) {
            return null;
        }
        Target target = Target.parse(url, info == null ? new Properties() : info);
        return new TrexsqlConnection(url, target);
    }

    @Override
    public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) {
        DriverPropertyInfo token = new DriverPropertyInfo("password", null);
        token.description = "Access token of the trex server";
        DriverPropertyInfo ssl = new DriverPropertyInfo("disable_ssl", "false");
        ssl.description = "Talk plain HTTP to the server (local or proxied deployments)";
        return new DriverPropertyInfo[] {token, ssl};
    }

    @Override
    public int getMajorVersion() {
        return MAJOR;
    }

    @Override
    public int getMinorVersion() {
        return MINOR;
    }

    @Override
    public boolean jdbcCompliant() {
        return false;
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        throw new SQLFeatureNotSupportedException("trexsql: getParentLogger is not supported");
    }

    /** Where a connection URL points. {@code host == null} means a local in-memory engine. */
    static final class Target {
        final String host;
        final int port;
        final String token;
        final boolean disableSsl;

        private Target(String host, int port, String token, boolean disableSsl) {
            this.host = host;
            this.port = port;
            this.token = token;
            this.disableSsl = disableSsl;
        }

        boolean isRemote() {
            return host != null;
        }

        static Target parse(String url, Properties info) throws SQLException {
            String rest = url.substring((url.startsWith(PREFIX) ? PREFIX : LEGACY_PREFIX).length());
            if (rest.equals(MEMORY)) {
                return new Target(null, -1, null, false);
            }
            if (!rest.startsWith("//")) {
                throw new SQLException("trexsql: expected jdbc:trexdb://host[:port] or jdbc:trexdb::memory:, got " + url);
            }
            URI uri;
            try {
                uri = new URI("trexsql:" + rest);
            } catch (URISyntaxException e) {
                throw new SQLException("trexsql: invalid URL " + url, e);
            }
            if (uri.getHost() == null || uri.getHost().isEmpty()) {
                throw new SQLException("trexsql: no host in " + url);
            }
            Map<String, String> params = query(uri.getRawQuery());
            String token = info.getProperty("password");
            if (token == null || token.isEmpty()) {
                token = params.get("token");
            }
            boolean disableSsl = Boolean.parseBoolean(
                    info.getProperty("disable_ssl", params.getOrDefault("disable_ssl", "false")));
            return new Target(uri.getHost(), uri.getPort(), token, disableSsl);
        }

        private static Map<String, String> query(String raw) {
            Map<String, String> out = new LinkedHashMap<>();
            if (raw == null || raw.isEmpty()) {
                return out;
            }
            for (String pair : raw.split("[&;]")) {
                int eq = pair.indexOf('=');
                String k = eq < 0 ? pair : pair.substring(0, eq);
                String v = eq < 0 ? "" : pair.substring(eq + 1);
                out.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
            }
            return out;
        }

        /** The {@code CONNECT} statement that routes the session to the server. */
        String connectSql() {
            StringBuilder sb = new StringBuilder("CONNECT ")
                    .append(Sql.literal("quack:" + host + (port > 0 ? ":" + port : "")));
            StringBuilder opts = new StringBuilder();
            if (token != null && !token.isEmpty()) {
                opts.append("TOKEN ").append(Sql.literal(token));
            }
            if (disableSsl) {
                if (opts.length() > 0) {
                    opts.append(", ");
                }
                opts.append("DISABLE_SSL true");
            }
            if (opts.length() > 0) {
                sb.append(" (").append(opts).append(')');
            }
            return sb.toString();
        }
    }
}
