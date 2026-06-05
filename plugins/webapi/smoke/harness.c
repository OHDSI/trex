/* Minimal host that drives libwebapi-native.so exactly like the Rust extension:
 * dlopen -> graal_create_isolate -> webapi_start -> poll webapi_status.
 * Keeps the process alive so embedded Tomcat (daemon threads) keeps serving. */
#include <stdio.h>
#include <stdlib.h>
#include <dlfcn.h>
#include <unistd.h>

typedef int   (*create_fn)(void*, void**, void**);
typedef char* (*start_fn)(void*, char*);
typedef char* (*status_fn)(void*);

int main(void) {
    const char* lib = getenv("WEBAPI_NATIVE_LIB");
    if (!lib) lib = "/app/libwebapi-native.so";

    void* h = dlopen(lib, RTLD_NOW | RTLD_GLOBAL);
    if (!h) { fprintf(stderr, "dlopen failed: %s\n", dlerror()); return 2; }

    create_fn create = (create_fn) dlsym(h, "graal_create_isolate");
    start_fn  start  = (start_fn)  dlsym(h, "webapi_start");
    status_fn status = (status_fn) dlsym(h, "webapi_status");
    if (!create || !start || !status) { fprintf(stderr, "dlsym failed\n"); return 2; }

    void *isolate = NULL, *thread = NULL;
    if (create(NULL, &isolate, &thread) != 0 || !thread) {
        fprintf(stderr, "graal_create_isolate failed\n"); return 2;
    }
    fprintf(stdout, "ISOLATE_OK\n"); fflush(stdout);

    char* r = start(thread, NULL);
    fprintf(stdout, "WEBAPI_START=%s\n", r ? r : "(null)"); fflush(stdout);

    for (int i = 0; i < 150; i++) {
        char* s = status(thread);
        fprintf(stdout, "WEBAPI_STATUS=%s\n", s ? s : "(null)"); fflush(stdout);
        sleep(2);
    }
    return 0;
}
