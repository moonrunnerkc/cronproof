"""Observe systemd timer elapse sequences across DST transitions.

Uses `systemd-analyze calendar --base-time=... --iterations=...` with an
explicit TZ, which gives next-elapse times without a running system.
Reads scenarios.json (arg 1), prints a fixture JSON to stdout.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

scenarios = json.load(open(sys.argv[1]))["scenarios"]

# OnCalendar equivalents of the cron expressions used in the scenarios.
ONCALENDAR = {
    "30 2 * * *": "*-*-* 02:30:00",
    "30 1 * * *": "*-*-* 01:30:00",
    "*/15 * * * *": "*-*-* *:0/15:00",
}

UTC_LINE = re.compile(r"\(in UTC\):\s+\w+\s+([\d-]+ [\d:]+) UTC")


def parse_utc(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def observe(scenario):
    oncalendar = ONCALENDAR.get(scenario["expression"])
    if oncalendar is None:
        return {"id": scenario["id"], "error": f"no OnCalendar mapping for {scenario['expression']}"}
    zone = scenario["zone"]
    start = parse_utc(scenario["windowStartUtc"])
    end = parse_utc(scenario["windowEndUtc"])
    base_local = (start - timedelta(seconds=1)).astimezone(ZoneInfo(zone))
    base_arg = base_local.strftime("%Y-%m-%d %H:%M:%S")
    env = dict(os.environ, TZ=zone)
    result = subprocess.run(
        ["systemd-analyze", "calendar", f"--base-time={base_arg}", "--iterations=400", oncalendar],
        capture_output=True, text=True, env=env, check=False,
    )
    fires = []
    for match in UTC_LINE.finditer(result.stdout):
        instant = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if instant <= start:
            continue
        if instant > end:
            break
        fires.append(instant.strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    return {
        "id": scenario["id"],
        "expression": scenario["expression"],
        "onCalendar": oncalendar,
        "zone": zone,
        "direction": scenario["direction"],
        "windowStartUtc": scenario["windowStartUtc"],
        "windowEndUtc": scenario["windowEndUtc"],
        "observedFireInstantsUtc": fires,
    }


version = subprocess.run(["systemd-analyze", "--version"], capture_output=True, text=True, check=False)
tz_version = "unknown"
try:
    tz_version = open("/usr/share/zoneinfo/+VERSION").read().strip()
except OSError:
    pass

fixture = {
    "scheduler": "systemd-timer",
    "library": "systemd-analyze calendar",
    "schedulerVersion": version.stdout.splitlines()[0] if version.stdout else "unknown",
    "runtime": "systemd-analyze on the host",
    "tzdbVersion": tz_version,
    "capturedVia": "systemd-analyze calendar --base-time --iterations, elapse times in UTC",
    "scenarios": [observe(s) for s in scenarios],
}
print(json.dumps(fixture, indent=2))
