#!/bin/sh
set -eu

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "[entrypoint] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set — app will fail to connect."
fi

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY}' \
  < /usr/share/nginx/html/env-config.template.js \
  > /usr/share/nginx/html/env-config.js

# ── DNS ให้ facehub.js (ngx.fetch) เรียก FaceHub / Supabase ได้ — ใช้ nameserver ของ container เอง ──
NS=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
echo "resolver ${NS:-1.1.1.1} valid=300s ipv6=off;" > /etc/nginx/conf.d/00-resolver.conf

if [ -z "${FACEHUB_API_KEY:-}" ] || [ -z "${FACEHUB_HCODE:-}" ]; then
  echo "[entrypoint] FACEHUB_API_KEY / FACEHUB_HCODE not set — face login disabled."
fi

exec "$@"
