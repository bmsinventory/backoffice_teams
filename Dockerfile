FROM nginx:alpine

COPY docs/ /usr/share/nginx/html/
# ประทับเวอร์ชันแคชของ Service Worker ใหม่ทุกครั้งที่ build — sw.js เปลี่ยน = เบราว์เซอร์/PWA รู้ว่ามีเวอร์ชันใหม่
RUN V=$(date +%s) && sed -i "s/'bms-app-v[0-9]*'/'bms-app-v$V'/; s/'bms-img-v[0-9]*'/'bms-img-v$V'/" /usr/share/nginx/html/sw.js
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Backend เข้าสู่ระบบด้วยใบหน้า (njs) — โหลดโมดูล js + ส่ง ENV ของ FaceHub/Supabase เข้า nginx ให้ facehub.js อ่านได้
COPY facehub.js /etc/nginx/njs/facehub.js
RUN sed -i '1i load_module modules/ngx_http_js_module.so;\nenv FACEHUB_URL;\nenv FACEHUB_API_KEY;\nenv FACEHUB_HCODE;\nenv SUPABASE_URL;\nenv SUPABASE_ANON_KEY;' /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

# ตัด CR (CRLF จากการ checkout บน Windows) กัน container สตาร์ทไม่ขึ้น: "exec /docker-entrypoint.sh: no such file or directory"
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
ENV FACEHUB_URL="https://facehub.bmscloud.in.th"
ENV FACEHUB_API_KEY=""
ENV FACEHUB_HCODE="99999"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
