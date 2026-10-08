#!/bin/sh
set -eu

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "[entrypoint] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set — app will fail to connect."
fi

# ── คำขอข้อมูลผ่าน nginx นี้ (/db/rest/v1/ → API_UPSTREAM) เพื่อบีบอัด gzip — ดู env-config.template.js / nginx.conf
# API_UPSTREAM = ที่อยู่ Supabase (Kong) ที่ container เรียกถึง เช่น http://10.95.10.108:8000 (ตรงในเครื่อง เร็วสุด)
# ไม่ตั้ง = ใช้ SUPABASE_URL · API_PROXY=0 = ปิด (หน้าเว็บต่อ SUPABASE_URL ตรงแบบเดิม) ──
API_UPSTREAM="${API_UPSTREAM:-${SUPABASE_URL:-}}"
API_UPSTREAM="${API_UPSTREAM%/}"
if [ -n "$API_UPSTREAM" ] && [ "${API_PROXY:-1}" != "0" ]; then API_PROXY=1; else API_PROXY=0; fi
export API_PROXY
mkdir -p /etc/nginx/snippets
printf 'set $db_up "%s";\n' "$API_UPSTREAM" > /etc/nginx/snippets/db-upstream.conf
echo "[entrypoint] API proxy: ${API_PROXY} → ${API_UPSTREAM:-(none)}"

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY} ${WEB_PUSH_PUBLIC_KEY} ${API_PROXY}' \
  < /usr/share/nginx/html/env-config.template.js \
  > /usr/share/nginx/html/env-config.js

# ── DNS ให้ proxy_pass $db_up (ตัวแปร → resolve ตอนใช้งาน) หาชื่อโดเมนของ API_UPSTREAM ได้ — ใช้ nameserver ของ container เอง ──
NS=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
echo "resolver ${NS:-1.1.1.1} valid=300s ipv6=off;" > /etc/nginx/conf.d/00-resolver.conf

exec "$@"
