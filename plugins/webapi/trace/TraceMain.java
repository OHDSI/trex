/* Exercises the trexsql Clojure/JNA code paths the WebAPI native lib needs at
 * runtime (the same ones TrexSQLAutoConfiguration drives), so the native-image
 * tracing agent records the reflection/resource/JNI metadata. Each call is
 * isolated so one failure still lets later calls (and the agent) run. */
import java.util.HashMap;
import java.util.Map;

public class TraceMain {
    interface Step { void run() throws Throwable; }

    static void step(String label, Step s) {
        try { s.run(); System.out.println("OK   " + label); }
        catch (Throwable t) { System.out.println("WARN " + label + ": " + t); }
    }

    public static void main(String[] args) throws Exception {
        Class<?> T = Class.forName("org.trex.Trexsql");

        Map<String, Object> cfg = new HashMap<>();
        cfg.put("cache-path", "/tmp/trexcache");
        cfg.put("allow-unsigned-extensions", Boolean.TRUE);
        T.getMethod("init", Map.class).invoke(null, cfg);
        System.out.println("OK   Trexsql.init");

        step("query",               () -> T.getMethod("query", String.class).invoke(null, "SELECT 1 AS x"));
        step("execute",             () -> T.getMethod("execute", String.class).invoke(null, "CREATE TABLE t(a INTEGER)"));
        step("isRunning",           () -> T.getMethod("isRunning").invoke(null));
        step("getLoadedExtensions", () -> T.getMethod("getLoadedExtensions").invoke(null));
        step("getDatabase",         () -> T.getMethod("getDatabase").invoke(null));
        step("searchVocab",         () -> T.getMethod("searchVocab", String.class, Map.class).invoke(null, "aspirin", new HashMap<>()));
        step("renderCirceToSql",    () -> T.getMethod("renderCirceToSql", String.class, Map.class).invoke(null, "{}", new HashMap<>()));

        // The webapi-facing gen-classes the AutoConfiguration loads reflectively.
        step("TrexSQLPlugin.new",   () -> Class.forName("org.trex.webapi.TrexSQLPlugin").getDeclaredConstructor().newInstance());
        step("TrexSQLSearchProvider.load", () -> Class.forName("org.trex.webapi.TrexSQLSearchProvider"));
        step("TrexServlet.new",     () -> Class.forName("org.trex.TrexServlet").getDeclaredConstructor().newInstance());

        step("shutdown",            () -> T.getMethod("shutdown").invoke(null));
        System.out.println("trace done");
    }
}
