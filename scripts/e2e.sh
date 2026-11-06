#!/bin/sh
# One-command browser test (Task 8c). Run from the repository root:  sh scripts/e2e.sh
# First time only:  (cd frontend && npm install && npx playwright install chromium)
set -e
cd "$(dirname "$0")/../backend"
[ -f .venv/bin/activate ] && . .venv/bin/activate
export E2E_PYTHON="$(command -v python)"
cd ../frontend
npx playwright test "$@"
