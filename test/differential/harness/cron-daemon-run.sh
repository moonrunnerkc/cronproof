#!/usr/bin/env bash
# Run a real cron daemon across a DST transition and print the fire log
# (one fake-UTC ISO timestamp per job execution), between BEGIN_FIRES /
# END_FIRES markers, plus the scheduler and tzdb versions.
#
# The daemon runs under libfaketime (a timestamp file gives it the fake
# clock) plus a no-sleep shim (its per-minute sleep returns near-instant).
# A controller loop steps the fake UTC clock through the window, so the
# daemon races through every minute in seconds while still seeing the
# real forward and backward clock jumps its DST logic keys off.
#
# Args: DAEMON(cron|cronie) ZONE EXPRESSION WINDOW_START_ISO WINDOW_END_ISO
set -u

DAEMON="$1"; ZONE="$2"; EXPR="$3"; WIN_START="$4"; WIN_END="$5"

if command -v dnf >/dev/null 2>&1; then
  # Fedora / RHEL family, which ships cronie.
  dnf install -y -q cronie libfaketime gcc glibc-langpack-en tzdata >/dev/null 2>&1
  CRON_BIN="/usr/sbin/crond"; CRON_ARGS="-n"
  PKG="cronie"
else
  # Debian family, which ships Vixie cron as "cron".
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq cron libfaketime tzdata coreutils gcc >/dev/null 2>&1
  CRON_BIN="$(command -v cron)"; CRON_ARGS="-f"
  PKG="cron"
fi

gcc -shared -fPIC -O2 -o /tmp/nosleep.so /work/nosleep-shim.c
FAKE_LIB="$(find /usr/lib /usr/lib64 -name 'libfaketime.so.1' 2>/dev/null | head -1)"

ln -sf "/usr/share/zoneinfo/$ZONE" /etc/localtime
echo "$ZONE" > /etc/timezone
: > /tmp/fires.log
# cron strips LD_PRELOAD from a job's environment, so the job re-injects
# faketime itself and reads the held fake clock from the timestamp file.
JOB="LD_PRELOAD=/tmp/nosleep.so:$FAKE_LIB FAKETIME_TIMESTAMP_FILE=/tmp/ft FAKETIME_NO_CACHE=1 TZ=UTC /bin/date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S.000Z >> /tmp/fires.log 2>&1"
printf '%s root %s\n' "$EXPR" "$JOB" > /etc/cron.d/probe
chmod 0644 /etc/cron.d/probe

START_EPOCH="$(date -u -d "$WIN_START" +%s)"
END_EPOCH="$(date -u -d "$WIN_END" +%s)"
# The fake clock is a real-relative UTC offset (fake = real + offset), so
# it is unambiguous across the fold even though the system zone is set to
# the target zone for the daemon's DST logic. Seed it at the start.
printf '%s\n' "$((START_EPOCH - $(date -u +%s)))" > /tmp/ft

LD_PRELOAD="/tmp/nosleep.so:$FAKE_LIB" FAKETIME_TIMESTAMP_FILE=/tmp/ft FAKETIME_NO_CACHE=1 \
  "$CRON_BIN" $CRON_ARGS >/tmp/cron.log 2>&1 &
CRON_PID=$!

# Controller: step the fake UTC clock minute by minute, holding each
# minute long enough for the daemon to fire and the job to read the held
# instant. The offset is recomputed each step against the real clock so
# fake time lands on the target UTC minute. The local fold and gap fall
# out of the zone as UTC advances monotonically through the transition.
write_offset() {
  printf '%s\n' "$1" > /tmp/ft.next
  mv -f /tmp/ft.next /tmp/ft
}
e=$((START_EPOCH - (START_EPOCH % 60) + 30))
while [ "$e" -le "$END_EPOCH" ]; do
  write_offset "$((e - $(date -u +%s)))"
  e=$((e + 60))
  sleep 0.3
done
sleep 1
kill "$CRON_PID" 2>/dev/null

if command -v rpm >/dev/null 2>&1; then
  echo "SCHED_VERSION=$(rpm -q --qf '%{VERSION}-%{RELEASE}' "$PKG" 2>/dev/null)"
  echo "TZDB_VERSION=$(rpm -q --qf '%{VERSION}' tzdata 2>/dev/null)"
else
  echo "SCHED_VERSION=$(dpkg-query -W -f='${Version}' "$PKG" 2>/dev/null)"
  echo "TZDB_VERSION=$(dpkg-query -W -f='${Version}' tzdata 2>/dev/null)"
fi
echo "BEGIN_FIRES"
cat /tmp/fires.log
echo "END_FIRES"
