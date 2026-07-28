"""Assemble a real cron-daemon fixture by running each scenario in a
container across its DST transition.

Usage: cron-daemon-observe.py <cron|cronie> <scenarios.json>
Prints a fixture JSON to stdout. Requires docker.
"""
import json
import re
import subprocess
import sys

daemon = sys.argv[1]
scenarios = json.load(open(sys.argv[2]))["scenarios"]
harness_dir = __file__.rsplit("/", 1)[0]

FIRE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}\.\d{3}Z$")
KV = re.compile(r"^(SCHED_VERSION|TZDB_VERSION)=(.*)$")


def floor_minute(line):
    match = FIRE.match(line.strip())
    return f"{match.group(1)}:00.000Z" if match else None


IMAGE = {"cron": "debian:bookworm-slim", "cronie": "fedora:40"}


def run(scenario):
    proc = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{harness_dir}:/work:ro",
            IMAGE[daemon],
            "bash", "/work/cron-daemon-run.sh",
            daemon, scenario["zone"], scenario["expression"],
            scenario["windowStartUtc"], scenario["windowEndUtc"],
        ],
        capture_output=True, text=True, timeout=600, check=False,
    )
    out = proc.stdout
    sched_version = tzdb_version = "unknown"
    fires, in_block = [], False
    raw_lines = []
    for line in out.splitlines():
        kv = KV.match(line)
        if kv:
            if kv.group(1) == "SCHED_VERSION":
                sched_version = kv.group(2)
            else:
                tzdb_version = kv.group(2)
        if line == "BEGIN_FIRES":
            in_block = True
            continue
        if line == "END_FIRES":
            in_block = False
            continue
        if in_block:
            raw_lines.append(line)
            floored = floor_minute(line)
            if floored:
                fires.append(floored)
    unique = sorted(set(fires))
    return sched_version, tzdb_version, {
        "id": scenario["id"],
        "expression": scenario["expression"],
        "zone": scenario["zone"],
        "direction": scenario["direction"],
        "windowStartUtc": scenario["windowStartUtc"],
        "windowEndUtc": scenario["windowEndUtc"],
        "observedFireInstantsUtc": unique,
        "rawLog": "\n".join(raw_lines),
    }


results = []
sched_version = tzdb_version = "unknown"
for scenario in scenarios:
    sv, tv, observed = run(scenario)
    sched_version, tzdb_version = sv, tv
    results.append(observed)
    print(f"[{daemon}] {scenario['id']}: {observed['observedFireInstantsUtc']}", file=sys.stderr)

fixture = {
    "scheduler": "debian-cron" if daemon == "cron" else "cronie",
    "library": f"{daemon} daemon under libfaketime with a stepped clock",
    "schedulerVersion": sched_version,
    "runtime": "debian:bookworm-slim container",
    "tzdbVersion": tzdb_version,
    "capturedVia": "real daemon run; job appends the fake UTC instant on each execution",
    "scenarios": results,
}
print(json.dumps(fixture, indent=2))
