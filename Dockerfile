FROM nginx:alpine

COPY docs/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
# vLLM (MedGemma) — ตั้งค่าตอน deploy เท่านั้น (compose/secret) · ว่าง = ปิดปุ่ม AI
ENV VLLM_UPSTREAM=""
ENV VLLM_API_KEY=""

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
