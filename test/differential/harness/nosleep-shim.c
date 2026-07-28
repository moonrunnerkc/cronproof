/*
 * LD_PRELOAD shim that collapses sleeping to near-instant, so a cron
 * daemon's per-minute sleep does not block real time. Combined with a
 * libfaketime timestamp file that an external controller steps, this
 * lets a real cron daemon race through a DST transition in seconds
 * while still observing the clock jumps its DST logic keys off. The
 * daemon's own timekeeping (time, gettimeofday, clock_gettime) is left
 * to libfaketime; only the blocking of sleep is removed here.
 */
#define _GNU_SOURCE
#include <time.h>
#include <unistd.h>
#include <sys/syscall.h>

/* A tiny real pause so the controller can advance the clock and the
 * daemon does not spin the CPU. Uses the raw syscall so neither this
 * shim's own sleep overrides nor libfaketime intercept it. */
static void tiny_pause(void) {
    struct timespec ts = {0, 2000000L}; /* 2 ms */
    syscall(SYS_clock_nanosleep, CLOCK_MONOTONIC, 0, &ts, (struct timespec *)0);
}

unsigned int sleep(unsigned int seconds) {
    (void)seconds;
    tiny_pause();
    return 0;
}

int usleep(useconds_t usec) {
    (void)usec;
    tiny_pause();
    return 0;
}

int nanosleep(const struct timespec *req, struct timespec *rem) {
    (void)req;
    if (rem) {
        rem->tv_sec = 0;
        rem->tv_nsec = 0;
    }
    tiny_pause();
    return 0;
}

int clock_nanosleep(clockid_t clockid, int flags, const struct timespec *req,
                    struct timespec *rem) {
    (void)clockid;
    (void)flags;
    (void)req;
    if (rem) {
        rem->tv_sec = 0;
        rem->tv_nsec = 0;
    }
    tiny_pause();
    return 0;
}
