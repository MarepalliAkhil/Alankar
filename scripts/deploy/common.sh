#!/usr/bin/env bash
# Shared settings for the server scripts (run from the repository folder on the VM).
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
STATE_DIR="$APP_DIR/.deploy"
mkdir -p "$STATE_DIR"

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

set_env_value() {
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >> "$ENV_FILE"
  fi
}

wait_healthy() {
  local domain url code body
  domain="$(env_value DOMAIN)"
  url="https://${domain}/api/health/"
  for _ in $(seq 1 40); do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null || true)"
    if echo "$body" | grep -q '"status":"ok"'; then
      echo "Healthy: $url -> $body"
      return 0
    fi
    sleep 5
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  echo "NOT healthy after 200 s: $url answered HTTP $code. Logs: ${COMPOSE[*]} logs --tail 100 backend" >&2
  return 1
}
