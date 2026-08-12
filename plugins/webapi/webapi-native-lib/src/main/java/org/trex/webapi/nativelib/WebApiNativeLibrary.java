package org.trex.webapi.nativelib;

import java.io.IOException;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;

import org.graalvm.nativeimage.IsolateThread;
import org.graalvm.nativeimage.c.function.CEntryPoint;
import org.graalvm.nativeimage.c.type.CCharPointer;
import org.graalvm.nativeimage.c.type.CTypeConversion;
import org.ohdsi.webapi.WebApi;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

public final class WebApiNativeLibrary {

    private WebApiNativeLibrary() {
    }

    private static final AtomicReference<ConfigurableApplicationContext> CONTEXT = new AtomicReference<>();

    /** Guards the process-global TLS trust install so a start/stop/start cycle does it once. */
    private static final AtomicBoolean TRUST_APPLIED = new AtomicBoolean(false);

    @CEntryPoint(name = "webapi_start")
    public static CCharPointer start(IsolateThread thread, CCharPointer argsJson) {
        if (CONTEXT.get() != null) {
            return cstr("already-running");
        }
        try {
            // Load-bearing ordering: configure JVM TLS trust BEFORE Spring (and
            // therefore SunJSSE / the OIDC client) initializes any SSLContext. This
            // native image bakes its default truststore at build time and ignores the
            // OS store / update-ca-certificates, so an internal self-signed CA must be
            // injected here at runtime. Keep this first; nothing above it may touch TLS.
            applyExtraTrustFromEnv();
            System.setProperty("trexsql.use.pool", "true");
            SpringApplication app = new SpringApplication(WebApi.class);
            app.setMainApplicationClass(WebApi.class);
            app.setRegisterShutdownHook(false);
            ConfigurableApplicationContext ctx = app.run();
            if (!CONTEXT.compareAndSet(null, ctx)) {
                // Lost a race with a concurrent start; close the extra context.
                ctx.close();
                return cstr("already-running");
            }
            return cstr("started");
        } catch (Throwable t) {
            return cstr("error: " + rootMessage(t));
        }
    }

    @CEntryPoint(name = "webapi_stop")
    public static CCharPointer stop(IsolateThread thread) {
        ConfigurableApplicationContext ctx = CONTEXT.getAndSet(null);
        if (ctx == null) {
            return cstr("not-running");
        }
        try {
            ctx.close();
            return cstr("stopped");
        } catch (Throwable t) {
            return cstr("error: " + rootMessage(t));
        }
    }

    @CEntryPoint(name = "webapi_status")
    public static CCharPointer status(IsolateThread thread) {
        ConfigurableApplicationContext ctx = CONTEXT.get();
        boolean running = ctx != null && ctx.isActive();
        return cstr(running ? "running" : "stopped");
    }

    /**
     * Env-driven TLS trust for the embedded native WebAPI.
     *
     * <p>WEBAPI_TRUST_CERTS = path to a PEM file holding one or more CA certificates
     * (e.g. /usr/src/cert/ca.pem). When set, the JVM's default trust anchors and
     * these extra CA(s) are merged into one runtime truststore, so both public TLS
     * and internal self-signed TLS (Logto/Caddy OIDC discovery, JWKS, token,
     * userinfo) succeed. Built at runtime so it is independent of the native
     * image's build-time truststore.
     *
     * <p>A source the operator explicitly configured but that cannot yield trust —
     * missing, unreadable, unparseable, or holding no certificates — <b>aborts
     * startup</b>: {@code start} returns {@code error: …} instead of {@code started}.
     * The alternative is a server that reports success and then fails at OIDC
     * discovery with a handshake error hundreds of log lines later, phrased entirely
     * differently. Content problems (an expired CA, a leaf rather than a CA) and a
     * failure to persist the PKCS12 stay warn-and-continue. Unset or blank is a
     * no-op, so deployments that do not use this are untouched.
     *
     * <p><b>This mutates process-global JVM TLS state</b> — the default
     * {@link SSLContext}, the default {@link HttpsURLConnection} socket factory,
     * and the {@code javax.net.ssl.trustStore*} system properties. That is
     * intended: a shared library has no narrower scope to configure, and the two
     * mechanisms cover different consumers (the properties reach libraries that
     * build their own {@code TrustManagerFactory} and never look at the default
     * context). Trust is only ever <i>widened</i> — every anchor the JVM already
     * had is carried over — which is what bounds the blast radius.
     *
     * <p>Must run before anything initializes an {@code SSLContext} or reads those
     * system properties, i.e. before Spring bootstraps. Keep the call first in
     * {@link #start}; a TLS consumer that runs earlier would silently miss this
     * and reintroduce the handshake failures this exists to fix.
     */
    private static void applyExtraTrustFromEnv() {
        applyExtraTrust(System.getenv("WEBAPI_TRUST_CERTS"));
    }

    /**
     * {@link #applyExtraTrustFromEnv()} with the path passed in, so the failure
     * paths are testable without an environment variable. Package-private for that
     * reason only.
     *
     * @throws RuntimeTrustStore.InvalidTrustSource if {@code caPath} is set but the
     *         trust it configures cannot be installed — this propagates out of
     *         {@link #start} and the host receives {@code error: …} rather than
     *         {@code started}
     */
    static void applyExtraTrust(String caPath) {
        if (caPath == null || caPath.isBlank()) {
            return;
        }
        if (!TRUST_APPLIED.compareAndSet(false, true)) {
            System.out.println("[webapi-native-lib] runtime TLS trust already installed; skipping");
            return;
        }
        try {
            X509Certificate[] defaults = RuntimeTrustStore.defaultTrustAnchors();
            RuntimeTrustStore.Merged merged = RuntimeTrustStore.require(defaults, Path.of(caPath));

            for (String warning : merged.warnings()) {
                System.err.println("[webapi-native-lib] WEBAPI_TRUST_CERTS=" + caPath + ": " + warning);
            }
            for (String description : merged.descriptions()) {
                System.out.println("[webapi-native-lib] trusting extra CA: " + description);
            }

            // KeyManagers are rebuilt from javax.net.ssl.keyStore* rather than passed as
            // null: SSLContext.init does NOT fall back to those properties (SunJSSE
            // substitutes a dummy key manager holding no keys), so replacing the default
            // context with null here would silently drop the client certificate of a
            // mutual-TLS deployment — and only when WEBAPI_TRUST_CERTS is set.
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(RuntimeTrustStore.defaultKeyManagers(),
                    RuntimeTrustStore.trustManagers(merged.keyStore()), null);
            SSLContext.setDefault(ctx);
            HttpsURLConnection.setDefaultSSLSocketFactory(ctx.getSocketFactory());

            // Reach the libraries that build their own context from the system
            // properties rather than the default one. An operator-supplied
            // truststore wins: its anchors are already folded into the merge above
            // (they come back from defaultTrustAnchors), so overriding the path
            // would only lose their explicit configuration.
            if (System.getProperty("javax.net.ssl.trustStore") == null) {
                // Independently non-fatal: the default SSLContext above is already
                // installed and useful on its own, so a failure to write the PKCS12
                // must not discard it.
                try {
                    RuntimeTrustStore.Persisted store = RuntimeTrustStore.persist(merged.keyStore());
                    System.setProperty("javax.net.ssl.trustStore", store.path().toString());
                    System.setProperty("javax.net.ssl.trustStoreType", "PKCS12");
                    System.setProperty("javax.net.ssl.trustStorePassword", store.password());
                    System.out.println("[webapi-native-lib] merged truststore at " + store.path());

                    // Whether a native image honours a RUNTIME change to these properties
                    // depends on the GraalVM build, which is why the toolchain is pinned.
                    // Re-read the anchors the way HttpClient/OkHttp/JDBC would, so a
                    // regression shows up as a log line instead of a TLS failure much
                    // later. A warning, not fatal: the default SSLContext installed above
                    // already carries the extra CA regardless.
                    int expected = merged.defaultAnchorCount() + merged.extraCertCount();
                    int visible = RuntimeTrustStore.visibleAnchorCount();
                    if (visible >= expected) {
                        System.out.println("[webapi-native-lib] runtime truststore verified: "
                                + visible + " anchors visible to a fresh TrustManagerFactory");
                    } else {
                        System.err.println("[webapi-native-lib] WARNING: javax.net.ssl.trustStore"
                                + " did not take effect (" + visible + " anchors visible, expected "
                                + expected + "); libraries that build their own"
                                + " TrustManagerFactory will NOT trust the extra CA(s)");
                    }
                } catch (Throwable t) {
                    System.err.println("[webapi-native-lib] could not persist the merged truststore: "
                            + t + "; the default SSLContext still trusts the extra CA(s), but"
                            + " libraries that build their own TrustManagerFactory will not");
                    t.printStackTrace();
                }
            } else {
                System.out.println("[webapi-native-lib] javax.net.ssl.trustStore already set to "
                        + System.getProperty("javax.net.ssl.trustStore")
                        + "; leaving it alone — libraries that build their own TrustManagerFactory"
                        + " will not see the extra CA(s)");
            }

            System.out.println("[webapi-native-lib] installed runtime TLS trust ("
                    + merged.defaultAnchorCount() + " default anchors + "
                    + merged.extraCertCount() + " cert(s) from " + caPath + ")");
        } catch (RuntimeTrustStore.InvalidTrustSource e) {
            TRUST_APPLIED.set(false);
            throw new RuntimeTrustStore.InvalidTrustSource("WEBAPI_TRUST_CERTS=" + caPath
                    + " is set but unusable — " + e.getMessage()
                    + "; refusing to start without the TLS trust it configures");
        } catch (GeneralSecurityException | IOException | RuntimeException e) {
            // IOException joins this clause because defaultKeyManagers() reads a keystore
            // file: a configured-but-unreadable javax.net.ssl.keyStore must be fatal for
            // the same reason a bad WEBAPI_TRUST_CERTS is, not silently degraded.
            TRUST_APPLIED.set(false);
            e.printStackTrace();
            throw new RuntimeTrustStore.InvalidTrustSource("WEBAPI_TRUST_CERTS=" + caPath
                    + " is set but the runtime TLS trust could not be installed ("
                    + e.getClass().getSimpleName()
                    + (e.getMessage() != null ? ": " + e.getMessage() : "") + ")");
        }
    }

    private static CCharPointer cstr(String s) {
        CTypeConversion.CCharPointerHolder holder = CTypeConversion.toCString(s == null ? "" : s);
        return holder.get();
    }

    private static String rootMessage(Throwable t) {
        Throwable cur = t;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        return cur.getClass().getSimpleName() + (msg != null ? ": " + msg : "");
    }
}
