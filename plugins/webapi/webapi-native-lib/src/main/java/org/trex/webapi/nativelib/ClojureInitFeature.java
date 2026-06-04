package org.trex.webapi.nativelib;

import java.lang.reflect.Method;
import org.graalvm.nativeimage.hosted.Feature;

/**
 * native-image Feature that build-time-initializes the Clojure namespaces which do
 * {@code (set! *warn-on-reflection* true)} at load (e.g. {@code clojure.pprint},
 * {@code clojure.stacktrace}).
 *
 * <p>Their AOT {@code load()} calls {@code Var.set} on {@code *warn-on-reflection*},
 * which throws "Can't change/establish root binding ... with set" unless a thread
 * binding is in effect. graal-build-time runs those initializers (on the builder JVM)
 * without such a binding, so they fail. Here, on the builder thread and before
 * analysis, we push a binding for the compiler vars and force the namespaces to load,
 * so they are build-time-initialized successfully. This must run before graal-build-time
 * touches them — declared via {@link #getRequiredFeatures()} / registration order and
 * the explicit force-load below.
 */
public final class ClojureInitFeature implements Feature {

    /** Namespaces whose load does (set! *warn-on-reflection* ...) and would otherwise fail. */
    private static final String[] NAMESPACES = {"clojure.pprint", "clojure.stacktrace"};

    @Override
    public void beforeAnalysis(BeforeAnalysisAccess access) {
        ClassLoader cl = access.getApplicationClassLoader();
        try {
            Class<?> rt = Class.forName("clojure.lang.RT", true, cl);
            Class<?> var = Class.forName("clojure.lang.Var", true, cl);
            Class<?> associative = Class.forName("clojure.lang.Associative", true, cl);
            Class<?> symbol = Class.forName("clojure.lang.Symbol", true, cl);
            Class<?> ifn = Class.forName("clojure.lang.IFn", true, cl);

            Method varOf = rt.getMethod("var", String.class, String.class);
            Method mapUniqueKeys = rt.getMethod("mapUniqueKeys", Object[].class);
            Method pushBindings = var.getMethod("pushThreadBindings", associative);
            Method popBindings = var.getMethod("popThreadBindings");
            Method intern = symbol.getMethod("intern", String.class);
            Method invoke1 = ifn.getMethod("invoke", Object.class);

            Object warnOnReflection = varOf.invoke(null, "clojure.core", "*warn-on-reflection*");
            Object uncheckedMath = varOf.invoke(null, "clojure.core", "*unchecked-math*");
            Object requireFn = varOf.invoke(null, "clojure.core", "require");

            Object bindings = mapUniqueKeys.invoke(null,
                    (Object) new Object[]{warnOnReflection, Boolean.FALSE, uncheckedMath, Boolean.FALSE});

            pushBindings.invoke(null, bindings);
            try {
                for (String ns : NAMESPACES) {
                    invoke1.invoke(requireFn, intern.invoke(null, ns));
                }
            } finally {
                popBindings.invoke(null);
            }
        } catch (Throwable t) {
            throw new RuntimeException(
                    "ClojureInitFeature: failed to build-time-initialize *warn-on-reflection* namespaces", t);
        }
    }
}
