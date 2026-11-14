#!/usr/bin/env bash
# Go back to the image tag that ran before the last deploy:  scripts/deploy/rollback.sh [tag]
# (Database migrations are not undone; restore a backup if a migration must be reversed.)
source "$(dirname "$0")/common.sh"
TAG="${1:-$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)}"
if [ -z "$TAG" ]; then
  echo "No previous tag recorded. Run: scripts/deploy/rollback.sh <image-tag>" >&2
  exit 1
fi
echo "Rolling back to IMAGE_TAG=$TAG"
set_env_value IMAGE_TAG "$TAG"
"${COMPOSE[@]}" pull web backend scheduler
"${COMPOSE[@]}" up -d --remove-orphans
wait_healthy && echo "$TAG" > "$STATE_DIR/current_tag" && echo "Rolled back to $TAG."
