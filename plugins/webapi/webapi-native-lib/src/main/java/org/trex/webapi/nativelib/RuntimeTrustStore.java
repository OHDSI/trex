package org.trex.webapi.nativelib;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * Builds a JVM truststore at runtime: the trust anchors this JVM already has,
 * plus extra CA certificate(s) read from a PEM file.
 *
 * <p>Everything here is constructed at runtime and deliberately depends on
 * nothing but the JDK, so it works inside a GraalVM native image (whose
 * {@code cacerts} is baked at build time and ignores the OS trust store) and
 * remains unit-testable outside one.
 *
 * <p>The union is materialized as a single {@link KeyStore} of trust anchors
 * rather than by chaining two {@link X509TrustManager}s and catching failures
 * from the first. One stock PKIX validation pass over all anchors keeps the
 * JDK's cert-path diagnostics intact, cannot mask a partial public-CA failure
 * behind a retry, and does not silently widen client-certificate trust.
 */
final class RuntimeTrustStore {

    private RuntimeTrustStore() {
    }

    /** Result of merging the JVM's default anchors with extra CA certificates. */
    record Merged(KeyStore keyStore,
                  int defaultAnchorCount,
                  int extraCertCount,
                  List<String> warnings,
                  List<String> descriptions) {
    }

    /** A merged truststore written to disk, with the password needed to read it. */
    record Persisted(Path path, String password) {
    }

    /**
     * Trust anchors this JVM validates against by default.
     *
     * <p>Reads whatever the running image actually trusts: the build-time
     * {@code cacerts} baked into the native image, or an operator-supplied
     * {@code javax.net.ssl.trustStore} if one is already set.
     */
    static X509Certificate[] defaultTrustAnchors() throws GeneralSecurityException {
        TrustManagerFactory tmf =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init((KeyStore) null);
        for (TrustManager tm : tmf.getTrustManagers()) {
            if (tm instanceof X509TrustManager x509) {
                return x509.getAcceptedIssuers();
            }
        }
        throw new GeneralSecurityException(
                "no X509TrustManager from " + tmf.getAlgorithm() + " (cannot read default anchors)");
    }

    /**
     * Merge {@code defaults} and the X.509 certificates in {@code pem} into one
     * in-memory truststore.
     *
     * <p>Trust is only ever widened: every default anchor is carried over. Each
     * extra certificate is inspected and anything suspicious (a leaf rather than
     * a CA, an expired CA) is reported in {@link Merged#warnings()} but still
     * added — misconfiguration should be loud, not fatal.
     *
     * @throws CertificateException if {@code pem} is not parseable at all
     */
    static Merged merge(X509Certificate[] defaults, InputStream pem)
            throws GeneralSecurityException, IOException {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);

        int defaultCount = 0;
        for (X509Certificate anchor : defaults) {
            ks.setCertificateEntry("jdk-root-" + defaultCount++, anchor);
        }

        List<String> warnings = new ArrayList<>();
        List<String> descriptions = new ArrayList<>();
        int extraCount = 0;
        for (Certificate c : CertificateFactory.getInstance("X.509").generateCertificates(pem)) {
            if (!(c instanceof X509Certificate x509)) {
                warnings.add("entry " + extraCount + " is a " + c.getType()
                        + " certificate, not X.509; skipped");
                continue;
            }
            warnings.addAll(inspect(x509, extraCount));
            descriptions.add(describe(x509));
            ks.setCertificateEntry("webapi-extra-ca-" + extraCount++, x509);
        }

        return new Merged(ks, defaultCount, extraCount, List.copyOf(warnings), List.copyOf(descriptions));
    }

    /** Trust managers over {@code ks} using the JDK's stock PKIX implementation. */
    static TrustManager[] trustManagers(KeyStore ks) throws GeneralSecurityException {
        TrustManagerFactory tmf =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);
        return tmf.getTrustManagers();
    }

    /**
     * Write {@code ks} as a PKCS12 file readable only by this user, under a
     * freshly generated password.
     *
     * <p>Needed because {@link javax.net.ssl.SSLContext#setDefault} is invisible
     * to libraries that build their own context via
     * {@code TrustManagerFactory.init((KeyStore) null)} — Apache HttpClient,
     * OkHttp and most JDBC TLS stacks do exactly that, and consult the
     * {@code javax.net.ssl.trustStore*} system properties instead. Pointing
     * those properties at this file is what makes the extra CA apply to outbound
     * TLS generally rather than only to code paths using the JVM default context.
     *
     * <p>The file is deleted on JVM exit.
     */
    static Persisted persist(KeyStore ks) throws GeneralSecurityException, IOException {
        // new SecureRandom(), not getInstanceStrong(): the latter resolves to
        // NativePRNGBlocking on Linux and can stall startup waiting on /dev/random
        // in a fresh container. urandom is ample for a throwaway local password.
        byte[] entropy = new byte[24];
        new SecureRandom().nextBytes(entropy);
        String password = HexFormat.of().formatHex(entropy);

        Path file = createOwnerOnlyTempFile();
        file.toFile().deleteOnExit();
        try (OutputStream out = Files.newOutputStream(file)) {
            ks.store(out, password.toCharArray());
        }
        return new Persisted(file, password);
    }

    private static Path createOwnerOnlyTempFile() throws IOException {
        try {
            return Files.createTempFile("webapi-truststore-", ".p12",
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        } catch (UnsupportedOperationException e) {
            // Non-POSIX filesystem: fall back to default permissions.
            return Files.createTempFile("webapi-truststore-", ".p12");
        }
    }

    /** Misconfigurations worth shouting about, in the order they bite operators. */
    private static List<String> inspect(X509Certificate cert, int index) {
        List<String> warnings = new ArrayList<>();
        String at = "entry " + index + " (" + cert.getSubjectX500Principal() + ")";
        if (cert.getBasicConstraints() == -1) {
            warnings.add(at + " is not a CA certificate (no basicConstraints CA:true);"
                    + " a leaf/server certificate cannot anchor a chain");
        }
        try {
            cert.checkValidity();
        } catch (java.security.cert.CertificateExpiredException e) {
            warnings.add(at + " expired on " + cert.getNotAfter());
        } catch (java.security.cert.CertificateNotYetValidException e) {
            warnings.add(at + " is not valid until " + cert.getNotBefore());
        }
        return warnings;
    }

    /** Enough identity to confirm from a log which CA was actually loaded. */
    private static String describe(X509Certificate cert) {
        return "subject=" + cert.getSubjectX500Principal()
                + " issuer=" + cert.getIssuerX500Principal()
                + " notAfter=" + cert.getNotAfter()
                + " sha256=" + fingerprint(cert);
    }

    private static String fingerprint(X509Certificate cert) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
        } catch (GeneralSecurityException e) {
            return "unavailable (" + e + ")";
        }
    }
}
