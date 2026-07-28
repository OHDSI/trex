package org.trex.webapi.nativelib;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.concurrent.atomic.AtomicReference;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

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

    @CEntryPoint(name = "webapi_start")
    public static CCharPointer start(IsolateThread thread, CCharPointer argsJson) {
        if (CONTEXT.get() != null) {
            return cstr("already-running");
        }
        try {
            // Configure JVM TLS trust BEFORE Spring (and therefore SunJSSE / the OIDC
            // client) initializes any SSLContext. This native image bakes its default
            // truststore at build time and ignores the OS store / update-ca-certificates,
            // so an internal self-signed CA must be injected here at runtime.
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
     * WEBAPI_TRUST_CERTS = path to a PEM file holding one or more CA certificates
     * (e.g. /usr/src/cert/ca.pem, written by the trex container command). When set,
     * a composite SSLContext is installed as the process default: it validates
     * against the JDK's built-in roots first and falls back to these extra CA(s),
     * so both public TLS and internal self-signed TLS (Logto/Caddy OIDC discovery,
     * JWKS, token, userinfo) succeed. Built at runtime so it is independent of the
     * native image's build-time truststore. Missing/empty/bad input is logged and
     * skipped rather than aborting startup.
     */
    private static void applyExtraTrustFromEnv() {
        String caPath = System.getenv("WEBAPI_TRUST_CERTS");
        if (caPath == null || caPath.isBlank()) {
            return;
        }
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore extraKs = KeyStore.getInstance(KeyStore.getDefaultType());
            extraKs.load(null, null);
            int count = 0;
            try (InputStream in = Files.newInputStream(Path.of(caPath))) {
                for (Certificate c : cf.generateCertificates(in)) {
                    extraKs.setCertificateEntry("webapi-extra-ca-" + (count++), c);
                }
            }
            if (count == 0) {
                System.err.println("[webapi-native-lib] WEBAPI_TRUST_CERTS=" + caPath
                        + " contained no certificates; skipping");
                return;
            }

            TrustManagerFactory defTmf =
                    TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            defTmf.init((KeyStore) null);
            TrustManagerFactory extraTmf =
                    TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            extraTmf.init(extraKs);

            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { composite(firstX509(defTmf), firstX509(extraTmf)) }, null);
            SSLContext.setDefault(ctx);
            HttpsURLConnection.setDefaultSSLSocketFactory(ctx.getSocketFactory());

            System.out.println("[webapi-native-lib] installed composite TLS trust (JDK roots + "
                    + count + " cert(s) from " + caPath + ")");
        } catch (Throwable t) {
            System.err.println("[webapi-native-lib] failed to apply WEBAPI_TRUST_CERTS from "
                    + caPath + ": " + t);
        }
    }

    private static X509TrustManager firstX509(TrustManagerFactory tmf) {
        for (TrustManager tm : tmf.getTrustManagers()) {
            if (tm instanceof X509TrustManager) {
                return (X509TrustManager) tm;
            }
        }
        throw new IllegalStateException("no X509TrustManager from " + tmf.getAlgorithm());
    }

    /** X509TrustManager that accepts a chain trusted by {@code base} OR by {@code extra}. */
    private static X509TrustManager composite(X509TrustManager base, X509TrustManager extra) {
        return new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {
                try {
                    base.checkClientTrusted(chain, authType);
                } catch (CertificateException e) {
                    extra.checkClientTrusted(chain, authType);
                }
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {
                try {
                    base.checkServerTrusted(chain, authType);
                } catch (CertificateException e) {
                    extra.checkServerTrusted(chain, authType);
                }
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                X509Certificate[] a = base.getAcceptedIssuers();
                X509Certificate[] b = extra.getAcceptedIssuers();
                X509Certificate[] all = new X509Certificate[a.length + b.length];
                System.arraycopy(a, 0, all, 0, a.length);
                System.arraycopy(b, 0, all, a.length, b.length);
                return all;
            }
        };
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
