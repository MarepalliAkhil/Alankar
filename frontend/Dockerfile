# syntax=docker/dockerfile:1.7
# The "web" image: Caddy serving the built frontend (docs/DEPLOY.md). Build from the repo root:
#   docker build -f frontend/Dockerfile --build-arg SITE_URL=https://alankar.example.com -t alankar-web .
# The build needs the backend and shared folders too (the build counts tests for the For
# Zenotians page and reads shared/policy.json), so the context is the whole repository.

FROM node:22.11.0-bookworm-slim AS build
WORKDIR /repo
ARG SITE_URL
# Business details for the structured data in the built pages (empty = the demo labels).
ARG VITE_BUSINESS_NAME= VITE_BUSINESS_PHONE= VITE_BUSINESS_EMAIL= VITE_BUSINESS_STREET= \
    VITE_BUSINESS_CITY= VITE_BUSINESS_REGION= VITE_BUSINESS_POSTAL_CODE= VITE_BUSINESS_COUNTRY=IN
ENV VITE_SITE_URL=${SITE_URL} \
    VITE_BUSINESS_NAME=${VITE_BUSINESS_NAME} VITE_BUSINESS_PHONE=${VITE_BUSINESS_PHONE} \
    VITE_BUSINESS_EMAIL=${VITE_BUSINESS_EMAIL} VITE_BUSINESS_STREET=${VITE_BUSINESS_STREET} \
    VITE_BUSINESS_CITY=${VITE_BUSINESS_CITY} VITE_BUSINESS_REGION=${VITE_BUSINESS_REGION} \
    VITE_BUSINESS_POSTAL_CODE=${VITE_BUSINESS_POSTAL_CODE} \
    VITE_BUSINESS_COUNTRY=${VITE_BUSINESS_COUNTRY} \
    CI=true
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY . .
# Builds, prerenders every public route, writes sitemap, robots, llms.txt and the share images
# list, and fails if a source map appears (scripts/check-sourcemaps.mjs).
RUN test -n "${SITE_URL}" || (echo "Set --build-arg SITE_URL=https://your-domain" && exit 1)
RUN cd frontend && npm run build && npm run build:check
RUN node deploy/caddy/private-routes.mjs > /repo/private-routes.caddy
RUN ! find frontend/dist -name '*.map' | grep -q .

FROM caddy:2.8.4-alpine
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/private-routes.caddy /etc/caddy/private-routes.caddy
COPY --from=build /repo/frontend/dist /srv/site
EXPOSE 80 443
