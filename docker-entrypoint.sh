#!/bin/sh
set -eu

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "[entrypoint] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set — app will fail to connect."
fi

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY}' \
  < /usr/share/nginx/html/env-config.template.js \
  > /usr/share/nginx/html/env-config.js

# ── nginx config ── proxy /helpdesk-ai/ → vLLM (MedGemma) เฉพาะเมื่อกำหนด VLLM_UPSTREAM ──
NGINX_TPL=/etc/nginx/templates/default.conf.template
NGINX_OUT=/etc/nginx/conf.d/default.conf
if [ -n "${VLLM_UPSTREAM:-}" ]; then
  envsubst '${VLLM_UPSTREAM} ${VLLM_API_KEY}' < "$NGINX_TPL" > "$NGINX_OUT"
  echo "[entrypoint] helpdesk-ai proxy: ENABLED"
else
  # ตัด block ระหว่าง marker ออก เพื่อให้ nginx สตาร์ทได้แม้ไม่ตั้ง VLLM_*
  sed '/# >>> AI PROXY >>>/,/# <<< AI PROXY <<</d' "$NGINX_TPL" > "$NGINX_OUT"
  echo "[entrypoint] helpdesk-ai proxy: disabled (VLLM_UPSTREAM not set)"
fi

exec "$@"
