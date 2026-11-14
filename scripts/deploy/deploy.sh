#!/usr/bin/env bash
# Deploy a tag (docs/DEPLOY.md):  scripts/deploy/deploy.sh <image-tag>   (default: latest)
# git pull, pull the images for that tag, restart, wait for /api/health/ and print the result.
# The tag that was running before is kept, so scripts/deploy/rollback.sh can go back to it.
source "$(dirname "$0")/common.sh"
TAG="${1:-latest}"
PREVIOUS="$(env_value IMAGE_TAG)"

git pull --ff-only
echo "Deploying IMAGE_TAG=$TAG (was ${PREVIOUS:-unset})"
set_env_value IMAGE_TAG "$TAG"
if ! "${COMPOSE[@]}" pull web backend scheduler; then
  set_env_value IMAGE_TAG "$PREVIOUS"
  echo "Could not pull images for $TAG. Nothing was changed." >&2
  exit 1
fi
[ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ] && echo "$PREVIOUS" > "$STATE_DIR/previous_tag"
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" ps
if wait_healthy; then
  echo "$TAG" > "$STATE_DIR/current_tag"
  echo "Deployed $TAG."
else
  echo "The new version is not healthy. To go back: scripts/deploy/rollback.sh" >&2
  exit 1
fi
