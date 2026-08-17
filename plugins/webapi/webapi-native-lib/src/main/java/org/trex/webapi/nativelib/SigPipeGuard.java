package org.trex.webapi.nativelib;

import org.graalvm.nativeimage.ImageInfo;
import org.graalvm.nativeimage.c.function.CFunction;
import org.graalvm.word.PointerBase;
import org.graalvm.word.WordFactory;

/**
 * Makes a peer-closed socket survivable inside whatever process hosts this library.
 *
 * <p>Substrate installs no signal handlers in a shared library — {@code native-image
 * --expert-options-all} documents {@code -R:?EnableSignalHandling} as "disabled for a
 * shared library" — so SIGPIPE keeps the host process default of <em>terminate</em>. A
 * stock JVM sets SIGPIPE to {@code SIG_IGN} during startup, and that is what normally
 * turns a write to a closed socket into an {@code IOException}. Without it the
 * {@code close_notify} write during TLS teardown kills the host process outright: no
 * exception, no stack trace, no log line. It presents as a certificate or OIDC problem
 * when it is neither.
 *
 * <p>Enabling {@code -R:+EnableSignalHandling} does <em>not</em> fix this — measured,
 * not assumed: the build accepts the flag and the library still dies with exit 141.
 * That subsystem installs the segfault/exit handlers without setting SIGPIPE. Hence
 * this class calls libc {@code signal(2)} directly and depends on no Substrate signal
 * support at all.
 *
 * <p>Only SIGPIPE is touched, and only when the host has not installed its own handler.
 * Signal disposition is process-global, so a library has no business overriding a choice
 * its host made deliberately. {@code signal()} returns the previous disposition, which
 * makes one call both the probe and the fix: if the return value shows a real handler,
 * it goes straight back.
 *
 * <p>See {@code docs/design/webapi-native-sigpipe.md}.
 */
final class SigPipeGuard {

    /** SIGPIPE on Linux and macOS. */
    private static final int SIGPIPE = 13;

    /** {@code SIG_DFL} — the default disposition, i.e. terminate the process. */
    private static final long SIG_DFL = 0L;

    /** {@code SIG_IGN} — ignore, which makes the failing write return EPIPE instead. */
    private static final long SIG_IGN = 1L;

    /** {@code SIG_ERR}, returned by {@code signal()} on failure. */
    private static final long SIG_ERR = -1L;

    private SigPipeGuard() {
    }

    @CFunction("signal")
    private static native PointerBase signal(int signum, PointerBase handler);

    /**
     * Sets SIGPIPE to {@code SIG_IGN} unless the host already installed a handler.
     *
     * <p>Never throws: a library that cannot adjust a signal must still boot.
     *
     * @return {@code "ignored"} when SIGPIPE is now ignored, {@code
     *         "host-handler-preserved"} when the host owned it and was left untouched,
     *         or {@code "unavailable: <reason>"} when the disposition could not be read
     *         at all (notably on a stock JVM, where there is no libc binding).
     */
    static String install() {
        if (!ImageInfo.inImageRuntimeCode()) {
            return "unavailable: not running in a native image";
        }
        try {
            PointerBase previous = signal(SIGPIPE, WordFactory.pointer(SIG_IGN));
            long prev = previous.rawValue();

            if (prev == SIG_ERR) {
                return "unavailable: signal(SIGPIPE) returned SIG_ERR";
            }
            if (prev == SIG_DFL || prev == SIG_IGN) {
                // Was the lethal default, or already ignored. Either way it is ignored now.
                return "ignored";
            }
            // The host installed a real handler. Put it back and leave its choice alone.
            signal(SIGPIPE, previous);
            return "host-handler-preserved";
        } catch (Throwable t) {
            return "unavailable: " + t.getClass().getSimpleName();
        }
    }
}
