FROM nginx:alpine

COPY docs/ /usr/share/nginx/html/
# ประทับเวอร์ชันแคชของ Service Worker ใหม่ทุกครั้งที่ build — sw.js เปลี่ยน = เบราว์เซอร์/PWA รู้ว่ามีเวอร์ชันใหม่
RUN V=$(date +%s) && sed -i "s/'bms-app-v[0-9]*'/'bms-app-v$V'/; s/'bms-img-v[0-9]*'/'bms-img-v$V'/" /usr/share/nginx/html/sw.js
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ตัวส่ง Web Push รันคู่ nginx ใน container นี้ (ไม่ต้องเพิ่ม service บน server) · worker.secret มาจากเครื่องที่ build (ไม่อยู่ใน git)
COPY push-worker/ /opt/push-worker/
RUN apk add --no-cache nodejs npm && cd /opt/push-worker && npm ci --omit=dev && npm cache clean --force && apk del npm
COPY docker-entrypoint.sh /docker-entrypoint.sh

# ตัด CR (CRLF จากการ checkout บน Windows) กัน container สตาร์ทไม่ขึ้น: "exec /docker-entrypoint.sh: no such file or directory"
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
# คำขอข้อมูลผ่าน nginx นี้ (บีบอัด gzip) → API_UPSTREAM · ว่าง = ใช้ SUPABASE_URL · API_PROXY=0 = ปิด (ดู docker-entrypoint.sh)
ENV API_UPSTREAM=""
ENV API_PROXY="1"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
