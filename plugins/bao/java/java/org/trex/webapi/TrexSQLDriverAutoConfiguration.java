package org.trex.webapi;

import org.springframework.boot.autoconfigure.AutoConfiguration;

/**
 * Registers the jdbc:trexsql:// driver used by sources with dialect trexdb.
 * Unconditional: it loads no native code until a connection is opened, and
 * keeps DriverManager from depending on service discovery through the plugin
 * class loader.
 */
@AutoConfiguration
public class TrexSQLDriverAutoConfiguration {

    static {
        org.trex.jdbc.TrexsqlDriver.register();
    }
}
