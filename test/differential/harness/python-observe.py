"""Observe croniter or cronsim fire sequences across DST transitions.

Usage: python-observe.py <croniter|cronsim> <scenarios.json>
Prints a fixture JSON to stdout.
"""
import json
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

try:
    from importlib.metadata import version as pkg_version
except ImportError:  # pragma: no cover
    pkg_version = lambda _name: "unknown"

library = sys.argv[1]
scenarios = json.load(open(sys.argv[2]))["scenarios"]


def parse_utc(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def fires_croniter(expr, zone, start, end):
    from croniter import croniter

    start_local = start.astimezone(ZoneInfo(zone))
    itr = croniter(expr, start_local)
    out = []
    for _ in range(1000):
        nxt = itr.get_next(datetime)
        nxt_utc = nxt.astimezone(timezone.utc)
        if nxt_utc > end:
            break
        out.append(nxt_utc)
    return out


def fires_cronsim(expr, zone, start, end):
    from cronsim import CronSim

    start_local = start.astimezone(ZoneInfo(zone))
    out = []
    for nxt in CronSim(expr, start_local):
        nxt_utc = nxt.astimezone(timezone.utc)
        if nxt_utc > end:
            break
        out.append(nxt_utc)
        if len(out) > 1000:
            break
    return out


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def observe(scenario):
    start = parse_utc(scenario["windowStartUtc"])
    end = parse_utc(scenario["windowEndUtc"])
    try:
        fn = fires_croniter if library == "croniter" else fires_cronsim
        fires = fn(scenario["expression"], scenario["zone"], start, end)
    except Exception as error:  # noqa: BLE001
        return {"id": scenario["id"], "error": f"{type(error).__name__}: {error}"}
    return {
        "id": scenario["id"],
        "expression": scenario["expression"],
        "zone": scenario["zone"],
        "direction": scenario["direction"],
        "windowStartUtc": scenario["windowStartUtc"],
        "windowEndUtc": scenario["windowEndUtc"],
        "observedFireInstantsUtc": [iso(f) for f in fires],
    }


try:
    tzdata_version = pkg_version("tzdata")
except Exception:  # noqa: BLE001
    tzdata_version = "system"

fixture = {
    "scheduler": library,
    "library": library,
    "schedulerVersion": pkg_version(library),
    "runtime": "python " + sys.version.split()[0],
    "tzdbVersion": tzdata_version,
    "capturedVia": "computed next-fire sequence over the window",
    "scenarios": [observe(s) for s in scenarios],
}
print(json.dumps(fixture, indent=2))
