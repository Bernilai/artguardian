#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h "${PGBOUNCER_HOST:-pgbouncer}" -p "${PGBOUNCER_PORT:-6432}" -U "${POSTGRES_USER:-artguardian}"; do
  echo "PostgreSQL not ready, waiting 2s..."
  sleep 2
done
echo "PostgreSQL is ready."

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
