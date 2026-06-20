package org.trex.webapi.nativelib;

import java.util.concurrent.atomic.AtomicReference;

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
