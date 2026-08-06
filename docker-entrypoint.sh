#!/bin/sh
set -eu

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "[entrypoint] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set — app will fail to connect."
fi

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY}' \
  < /usr/share/nginx/html/env-config.template.js \
  > /usr/share/nginx/html/env-config.js

exec "$@"
