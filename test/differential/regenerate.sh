#!/usr/bin/env bash
# Regenerate every real-scheduler fixture from scratch. This is what
# `pnpm verify:real` runs. It needs Docker (for the daemons and the
# library runtimes) and a host systemd-analyze; CI does not run it,
# CI asserts the models against the committed fixtures instead.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
H="$REPO/test/differential/harness"
F="$REPO/test/differential/fixtures"
S="$REPO/test/differential/scenarios.json"

echo "[verify:real] cron-parser (node)"
docker run --rm -v "$REPO:/work:ro" -w /tmp node:20-slim bash -c '
  cp /work/test/differential/harness/cron-parser-observe.mjs /tmp/
  cd /tmp && npm init -y >/dev/null 2>&1 && npm install cron-parser@4 >/dev/null 2>&1
  node /tmp/cron-parser-observe.mjs /work/test/differential/scenarios.json' > "$F/cron-parser-luxon.json"

echo "[verify:real] node-cron (virtual clock)"
docker run --rm -v "$REPO:/work:ro" -w /tmp node:20-slim bash -c '
  cp /work/test/differential/harness/node-cron-observe.mjs /tmp/
  cd /tmp && npm init -y >/dev/null 2>&1 && npm install node-cron@3 >/dev/null 2>&1
  node /tmp/node-cron-observe.mjs /work/test/differential/scenarios.json' > "$F/node-cron.json"

echo "[verify:real] croniter and cronsim (python)"
docker run --rm -v "$REPO:/work:ro" python:3.12-slim bash -c '
  pip install --quiet croniter cronsim tzdata
  python /work/test/differential/harness/python-observe.py croniter /work/test/differential/scenarios.json' > "$F/croniter.json"
docker run --rm -v "$REPO:/work:ro" python:3.12-slim bash -c '
  pip install --quiet croniter cronsim tzdata
  python /work/test/differential/harness/python-observe.py cronsim /work/test/differential/scenarios.json' > "$F/cronsim.json"

echo "[verify:real] robfig/cron for k8s (go)"
docker run --rm -v "$REPO:/work:ro" golang:1.22 bash -c '
  set -e; mkdir -p /src && cd /src
  cp /work/test/differential/harness/robfig-observe.go main.go
  go mod init obs >/dev/null 2>&1
  go get github.com/robfig/cron/v3@v3.0.1 >/dev/null 2>&1
  go run . /work/test/differential/scenarios.json' > "$F/k8s-cronjob.json"

echo "[verify:real] systemd (host systemd-analyze)"
python3 "$H/systemd-observe.py" "$S" > "$F/systemd-timer.json"

echo "[verify:real] debian-cron (daemon under libfaketime)"
python3 "$H/cron-daemon-observe.py" cron "$S" > "$F/debian-cron.json"

echo "[verify:real] cronie (daemon under libfaketime)"
python3 "$H/cron-daemon-observe.py" cronie "$S" > "$F/cronie.json"

echo "[verify:real] done; fixtures written to $F"
