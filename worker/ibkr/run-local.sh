#!/usr/bin/env bash
# Run the worker on this Mac against TWS / IB Gateway that is already logged in to the PAPER account.
# Keeps the Mac awake while it runs (caffeinate). Stop with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")"

PY=""
for p in python3.13 python3.12 python3.11 python3.10; do
  if command -v "$p" >/dev/null 2>&1; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3.10 or newer is required (install it from python.org)." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Missing .env: run  cp .env.example .env  and fill it in." >&2
  exit 1
fi

if pgrep -f "python -u worker.py" >/dev/null 2>&1; then
  echo "The worker is already running (another terminal). Only one copy can connect to TWS; stop it first with Ctrl+C there." >&2
  exit 1
fi

[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
exec caffeinate -i .venv/bin/python -u worker.py
