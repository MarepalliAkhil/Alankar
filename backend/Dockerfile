# syntax=docker/dockerfile:1.7
# The "backend" image (also used by the scheduler). Build from the repo root:
#   docker build -f backend/Dockerfile -t alankar-backend .
# One ASGI process (Daphne) serves HTTP and the chat WebSockets (Django Channels).

FROM python:3.12.8-slim-bookworm AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /venv
COPY backend/requirements.txt /tmp/requirements.txt
RUN /venv/bin/pip install -r /tmp/requirements.txt

FROM python:3.12.8-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SALON_SKIP_ENV_FILE=1 \
    PATH=/venv/bin:$PATH \
    DJANGO_SETTINGS_MODULE=config.settings_production \
    SALON_PG_BIN=/usr/lib/postgresql/16/bin \
    TZ=Asia/Kolkata
# postgresql-client: pg_dump/pg_restore for backups; curl: health checks; tzdata: shop time.
# The scheduler is a plain loop (manage.py run_scheduler), so no cron binary is needed.
# PostgreSQL 16 client tools from the PostgreSQL project's own repository, matching the Azure
# server version (Debian's own client is older and pg_dump refuses a newer server).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tzdata \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSLo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /venv /venv
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/backend /app/shared /app/staticfiles /app/media /var/backups/alankar \
    && chown -R app:app /app /var/backups/alankar
WORKDIR /app/backend
COPY --chown=app:app shared /app/shared
COPY --chown=app:app backend /app/backend
COPY --chown=app:app scripts/deploy/entrypoint.sh scripts/deploy/backup.sh scripts/deploy/first_run.sh /app/deploy/
RUN rm -f /app/backend/.env && chmod +x /app/deploy/*.sh
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health/ -H "Host: localhost" || exit 1
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["server"]
