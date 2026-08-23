package org.trex.webapi.nativelib;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;

/**
 * Covers the decision that a WEBAPI_TRUST_CERTS the operator set but that cannot
 * yield trust aborts startup rather than booting a server without it.
 */
class WebApiNativeLibraryTrustTest {

    private static Path fixturePath(String name) throws Exception {
        return Path.of(WebApiNativeLibraryTrustTest.class.getResource("/certs/" + name).toURI());
    }

    /**
     * The fatal paths reset the TRUST_APPLIED guard before throwing, so these
     * tests can run in any order and repeatedly. None of them reaches
     * SSLContext.setDefault, so no global JVM TLS state is touched -- which is
     * exactly why only the failure paths are unit-tested here. The success path
     * mutates process-global state and is covered by the smoke test instead.
     */
    @Test
    void anUnsetOrBlankEnvVarIsANoOp() {
        assertDoesNotThrow(() -> WebApiNativeLibrary.applyExtraTrust(null));
        assertDoesNotThrow(() -> WebApiNativeLibrary.applyExtraTrust(""));
        assertDoesNotThrow(() -> WebApiNativeLibrary.applyExtraTrust("   "));
    }

    @Test
    void aMissingTrustCertsPathAbortsStartupWithActionableContext() {
        RuntimeTrustStore.InvalidTrustSource e = assertThrows(
                RuntimeTrustStore.InvalidTrustSource.class,
                () -> WebApiNativeLibrary.applyExtraTrust("/no/such/ca.pem"));

        assertTrue(e.getMessage().contains("WEBAPI_TRUST_CERTS"), e.getMessage());
        assertTrue(e.getMessage().contains("/no/such/ca.pem"), e.getMessage());
        assertNull(e.getCause(), "rootMessage() would unwrap a cause and hide this message");
    }

    @Test
    void anUnparseableTrustCertsFileAbortsStartup() throws Exception {
        assertThrows(RuntimeTrustStore.InvalidTrustSource.class,
                () -> WebApiNativeLibrary.applyExtraTrust(fixturePath("garbage.pem").toString()));
    }

    @Test
    void aTrustCertsFileWithNoCertificatesAbortsStartup() throws Exception {
        assertThrows(RuntimeTrustStore.InvalidTrustSource.class,
                () -> WebApiNativeLibrary.applyExtraTrust(fixturePath("empty.pem").toString()));
    }
}
