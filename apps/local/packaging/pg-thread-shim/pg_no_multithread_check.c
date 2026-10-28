// Interpose pthread_is_threaded_np() to always return 0.
//
// PostgreSQL's postmaster calls pthread_is_threaded_np() during startup and
// aborts with "postmaster became multithreaded during startup" if non-zero.
// On macOS 26+ basic system calls during postmaster startup lazily spawn
// threads via GCD/XPC, tripping the check. Upstream removes the check; this
// shim achieves the same at runtime via DYLD interposing (no rebuild needed).
//
// The local edition packages this dylib next to the platform binary on macOS;
// internal/platform injects it via DYLD_INSERT_LIBRARIES (see pgEnv). The
// extracted PostgreSQL binaries are ad-hoc re-signed at packaging time so the
// injection is honored despite their hardened-runtime signature.
//
// Compile: cc -dynamiclib -arch <arm64|x86_64> -O2 -o pg_no_multithread_check.dylib pg_no_multithread_check.c
// Usage:   DYLD_INSERT_LIBRARIES=/path/to/pg_no_multithread_check.dylib postgres ...
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

static int my_pthread_is_threaded_np(void) {
    return 0;
}

__attribute__((used, section("__DATA,__interpose")))
static struct {
    void *replacement;
    void *replacee;
} _interpose_pthread_is_threaded_np = {
    (void *)my_pthread_is_threaded_np,
    (void *)pthread_is_threaded_np,
};
