package org.trex.webapi.nativelib;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.attribute.PosixFilePermission;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.junit.jupiter.api.Test;

/**
 * Covers the runtime truststore merge that backs WEBAPI_TRUST_CERTS.
 *
 * <p>The regression these guard against is subtle and only shows up in
 * production: an extra CA that is added but does not actually widen trust, or —
 * worse — an extra CA that displaces the public roots, so internal TLS starts
 * working while every public HTTPS call quietly breaks. Each test therefore
 * asserts on the default anchors as well as the extra ones.
 *
 * <p>Fixtures in {@code src/test/resources/certs} are generated once with
 * openssl; {@code expired-ca.pem} has a fixed notAfter in the past so the
 * expiry warning is deterministic rather than time-dependent.
 */
class RuntimeTrustStoreTest {

    private static InputStream pem(String name) {
        InputStream in = RuntimeTrustStoreTest.class.getResourceAsStream("/certs/" + name);
        assertNotNull(in, "missing test fixture /certs/" + name);
        return in;
    }

    private static RuntimeTrustStore.Merged mergeFixture(String name) throws Exception {
        try (InputStream in = pem(name)) {
            return RuntimeTrustStore.merge(RuntimeTrustStore.defaultTrustAnchors(), in);
        }
    }

    private static X509Certificate loadCertificate(String name) throws Exception {
        try (InputStream in = pem(name)) {
            return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
        }
    }

    private static X509TrustManager firstX509(TrustManager[] managers) {
        for (TrustManager candidate : managers) {
            if (candidate instanceof X509TrustManager x509) {
                return x509;
            }
        }
        throw new AssertionError("no X509TrustManager among " + Arrays.toString(managers));
    }

    @Test
    void readsTheDefaultAnchorsOfTheRunningJvm() throws Exception {
        assertTrue(RuntimeTrustStore.defaultTrustAnchors().length > 0,
                "expected the JVM to trust at least one root out of the box");
    }

    @Test
    void mergeKeepsEveryDefaultAnchorAndAddsTheExtraCa() throws Exception {
        int defaults = RuntimeTrustStore.defaultTrustAnchors().length;
        RuntimeTrustStore.Merged merged = mergeFixture("ca1.pem");

        assertEquals(defaults, merged.defaultAnchorCount());
        assertEquals(1, merged.extraCertCount());
        assertEquals(defaults + 1, merged.keyStore().size(), "trust must widen, not replace");
        assertEquals(List.of(), merged.warnings());
    }

    @Test
    void mergeAddsEveryCertificateInABundle() throws Exception {
        int defaults = RuntimeTrustStore.defaultTrustAnchors().length;
        RuntimeTrustStore.Merged merged = mergeFixture("two-cas.pem");

        assertEquals(2, merged.extraCertCount());
        assertEquals(defaults + 2, merged.keyStore().size());
    }

    @Test
    void mergedStoreProducesAPkixTrustManagerOverTheUnion() throws Exception {
        int defaults = RuntimeTrustStore.defaultTrustAnchors().length;
        RuntimeTrustStore.Merged merged = mergeFixture("two-cas.pem");

        X509TrustManager tm = firstX509(RuntimeTrustStore.trustManagers(merged.keyStore()));
        X509Certificate[] issuers = tm.getAcceptedIssuers();
        assertEquals(defaults + 2, issuers.length);
        List<String> subjects = Arrays.stream(issuers)
                .map(c -> c.getSubjectX500Principal().getName())
                .toList();
        assertTrue(subjects.contains("CN=trex-test-ca-one"), subjects.toString());
        assertTrue(subjects.contains("CN=trex-test-ca-two"), subjects.toString());
    }

    /**
     * The behavioural claim of the whole feature: a chain issued by the internal CA
     * validates only because the merge added it. Asserting the default trust manager
     * rejects the same chain is what proves the merge is doing the work, and pairs
     * with {@link #mergeKeepsEveryDefaultAnchorAndAddsTheExtraCa()} — together they
     * say internal TLS starts working without public TLS being disturbed.
     */
    @Test
    void mergedTrustManagerValidatesAChainTheDefaultOneRejects() throws Exception {
        X509Certificate[] chain = { loadCertificate("leaf.pem") };

        X509TrustManager defaultTm = firstX509(RuntimeTrustStore.trustManagers(null));
        assertThrows(CertificateException.class,
                () -> defaultTm.checkServerTrusted(chain, "RSA"),
                "an internal CA chain must not already be trusted, or the test proves nothing");

        RuntimeTrustStore.Merged merged = mergeFixture("ca1.pem");
        firstX509(RuntimeTrustStore.trustManagers(merged.keyStore()))
                .checkServerTrusted(chain, "RSA");
    }

    @Test
    void describesEachExtraCaWithAFingerprint() throws Exception {
        RuntimeTrustStore.Merged merged = mergeFixture("ca1.pem");

        assertEquals(1, merged.descriptions().size());
        String description = merged.descriptions().get(0);
        assertTrue(description.contains("CN=trex-test-ca-one"), description);
        assertTrue(description.contains("sha256="), description);
    }

    @Test
    void anEmptyPemAddsNothingAndIsNotAnError() throws Exception {
        int defaults = RuntimeTrustStore.defaultTrustAnchors().length;
        RuntimeTrustStore.Merged merged = mergeFixture("empty.pem");

        assertEquals(0, merged.extraCertCount());
        assertEquals(defaults, merged.keyStore().size());
    }

    @Test
    void unparseablePemFailsSoTheCallerCanSkipInsteadOfTrustingNothing() {
        assertThrows(CertificateException.class, () -> mergeFixture("garbage.pem"));
    }

    @Test
    void warnsWhenGivenALeafCertificateInsteadOfACa() throws Exception {
        RuntimeTrustStore.Merged merged = mergeFixture("leaf.pem");

        assertEquals(1, merged.extraCertCount(), "still added; misconfiguration is loud, not fatal");
        assertTrue(merged.warnings().stream().anyMatch(w -> w.contains("not a CA certificate")),
                merged.warnings().toString());
    }

    @Test
    void warnsWhenTheExtraCaHasAlreadyExpired() throws Exception {
        RuntimeTrustStore.Merged merged = mergeFixture("expired-ca.pem");

        assertEquals(1, merged.extraCertCount());
        assertTrue(merged.warnings().stream().anyMatch(w -> w.contains("expired on")),
                merged.warnings().toString());
    }

    @Test
    void persistWritesAnOwnerOnlyPkcs12ThatReloadsWithTheGeneratedPassword() throws Exception {
        RuntimeTrustStore.Merged merged = mergeFixture("ca1.pem");
        RuntimeTrustStore.Persisted stored = RuntimeTrustStore.persist(merged.keyStore());

        try {
            Set<PosixFilePermission> perms = Files.getPosixFilePermissions(stored.path());
            assertEquals(Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE), perms,
                    "the truststore password is in a system property; the file must not be world-readable");

            KeyStore reloaded = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(stored.path())) {
                reloaded.load(in, stored.password().toCharArray());
            }
            assertEquals(merged.keyStore().size(), reloaded.size());
        } finally {
            Files.deleteIfExists(stored.path());
        }
    }

    private static java.nio.file.Path fixturePath(String name) throws Exception {
        return java.nio.file.Path.of(
                RuntimeTrustStoreTest.class.getResource("/certs/" + name).toURI());
    }

    @Test
    void requireRejectsAMissingFile() {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(),
                        java.nio.file.Path.of("/no/such/ca.pem")));
        assertTrue(e.getMessage().contains("/no/such/ca.pem"), e.getMessage());
    }

    @Test
    void requireRejectsAnUnparseablePem() {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(),
                        fixturePath("garbage.pem")));
        assertTrue(e.getMessage().contains("parse"), e.getMessage());
    }

    /**
     * merge() treats an empty PEM as a non-error on purpose -- it is policy-free.
     * The "explicitly configured but useless" judgement belongs to the caller, so
     * it lives here in require() and not there.
     */
    @Test
    void requireRejectsAPemHoldingNoCertificates() {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(),
                        fixturePath("empty.pem")));
        assertTrue(e.getMessage().contains("no X.509 certificates"), e.getMessage());
    }

    @Test
    void requireAcceptsAValidCa() throws Exception {
        int defaults = RuntimeTrustStore.defaultTrustAnchors().length;
        RuntimeTrustStore.Merged merged =
                RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(), fixturePath("ca1.pem"));

        assertEquals(1, merged.extraCertCount());
        assertEquals(defaults + 1, merged.keyStore().size());
    }

    /**
     * Content problems stay soft: the operator gets a loud warning and a running
     * server, because a wrong-but-parseable CA is a different mistake from a
     * mount that is not there.
     */
    @Test
    void requireStillAcceptsSoftMisconfigurations() throws Exception {
        RuntimeTrustStore.Merged leaf =
                RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(), fixturePath("leaf.pem"));
        assertTrue(leaf.warnings().stream().anyMatch(w -> w.contains("not a CA certificate")),
                leaf.warnings().toString());

        RuntimeTrustStore.Merged expired =
                RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(), fixturePath("expired-ca.pem"));
        assertTrue(expired.warnings().stream().anyMatch(w -> w.contains("expired on")),
                expired.warnings().toString());
    }

    /**
     * WebApiNativeLibrary.rootMessage() unwraps to the DEEPEST cause when building
     * the string handed back to the host process. A cause here would replace our
     * message with a bare NoSuchFileException and lose the WEBAPI_TRUST_CERTS
     * context entirely -- which is the whole point of failing loudly.
     */
    @Test
    void invalidTrustSourceCarriesNoCauseSoTheHostMessageSurvives() {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> RuntimeTrustStore.require(RuntimeTrustStore.defaultTrustAnchors(),
                        java.nio.file.Path.of("/no/such/ca.pem")));
        assertNull(e.getCause(), "a cause would be unwrapped by rootMessage() and hide this message");
    }

    /**
     * Zero default anchors means the JVM's own trust could not be read (e.g. an
     * operator-set javax.net.ssl.trustStore pointing at an unreadable file). If
     * require() built a store from that anyway, the resulting truststore would
     * hold only the extra CA and installing it would REPLACE trust instead of
     * widening it -- the central invariant of this feature.
     */
    @Test
    void requireRejectsZeroDefaultAnchorsRatherThanReplacingTrust() throws Exception {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> RuntimeTrustStore.require(new X509Certificate[0], fixturePath("ca1.pem")));
        assertTrue(e.getMessage().contains("widen"), e.getMessage());
        assertNull(e.getCause(), "a cause would be unwrapped by rootMessage() and hide this message");
    }

    /**
     * The counterpart of the self-check that runs in the native image: a library
     * building its own TrustManagerFactory from null must see the JVM's roots. In the
     * image this same call is made AFTER javax.net.ssl.trustStore is repointed, which
     * is what proves the runtime override reached those libraries.
     */
    @Test
    void visibleAnchorCountSeesTheJvmDefaults() {
        assertTrue(RuntimeTrustStore.visibleAnchorCount() > 0,
                "a library building its own TrustManagerFactory must see the JVM's roots");
    }

    @Test
    void defaultKeyManagersIsNullWhenNoKeyStoreConfigured() throws Exception {
        String prior = System.getProperty("javax.net.ssl.keyStore");
        System.clearProperty("javax.net.ssl.keyStore");
        try {
            assertNull(RuntimeTrustStore.defaultKeyManagers());
        } finally {
            if (prior != null) {
                System.setProperty("javax.net.ssl.keyStore", prior);
            }
        }
    }

    @Test
    void defaultKeyManagersThrowsWhenTheConfiguredKeyStoreCannotBeRead() throws Exception {
        String prior = System.getProperty("javax.net.ssl.keyStore");
        System.setProperty("javax.net.ssl.keyStore", "/no/such/keystore.p12");
        try {
            assertThrows(Exception.class, RuntimeTrustStore::defaultKeyManagers);
        } finally {
            if (prior == null) {
                System.clearProperty("javax.net.ssl.keyStore");
            } else {
                System.setProperty("javax.net.ssl.keyStore", prior);
            }
        }
    }
}
