package org.trex.webapi.nativelib;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * On a stock JVM the C interop is absent, so these tests exercise the
 * {@code unavailable:} path. That is the point: the guard must degrade quietly
 * rather than break a plain unit-test run or, worse, a real boot.
 *
 * <p>Whether the guard actually installs SIG_IGN can only be proven inside a real
 * native image, which is what the boot smoke test asserts via
 * {@code WEBAPI_STATUS=running} over HTTPS.
 */
class SigPipeGuardTest {

    @Test
    void installReportsAnOutcomeAndNeverThrows() {
        String outcome = SigPipeGuard.install();
        assertNotNull(outcome, "install() must always report an outcome");
        assertTrue(outcome.equals("ignored")
                        || outcome.equals("host-handler-preserved")
                        || outcome.startsWith("unavailable:"),
                "unexpected outcome: " + outcome);
    }

    @Test
    void installIsIdempotent() {
        SigPipeGuard.install();
        String second = SigPipeGuard.install();
        assertNotNull(second, "install() must always report an outcome");
        assertTrue(second.equals("ignored")
                        || second.equals("host-handler-preserved")
                        || second.startsWith("unavailable:"),
                "unexpected outcome on second call: " + second);
    }

    @Test
    void installOnAStockJvmReportsUnavailableRatherThanThrowing() {
        assertTrue(SigPipeGuard.install().startsWith("unavailable:"),
                "outside a native image there is no libc binding, so the guard must "
                        + "report unavailable instead of throwing UnsatisfiedLinkError");
    }
}
