#!/usr/bin/env sh
# Dependency audit (Linux/macOS). Needs internet. Run from the repository root: sh scripts/audit.sh
set -u
cd "$(dirname "$0")/../backend" || exit 1
pip install -r requirements-dev.txt -q
echo "=== pip-audit (Python) ==="; pip-audit -r requirements.txt; PYRC=$?
cd ../frontend || exit 1
echo "=== npm audit (production dependencies) ==="; npm audit --omit=dev; NPMRC=$?
echo "=== npm audit (dev tools, informational) ==="; npm audit
echo "pip-audit exit: $PYRC   npm audit (prod) exit: $NPMRC   (0 = nothing found)"
