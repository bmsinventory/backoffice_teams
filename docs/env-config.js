// ── Supabase endpoint (ค่านี้ใช้ตอนรัน local / GitHub Pages เท่านั้น) ──
// บน Docker/production: docker-entrypoint.sh จะสร้างไฟล์นี้ใหม่จาก env-config.template.js
// ทับไฟล์นี้ทุกครั้งที่ container start โดยใช้ ENV SUPABASE_URL / SUPABASE_ANON_KEY
window.SUPABASE_URL      = 'https://backoffice-teams.bmscloud.in.th';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2MDY5OTg0LCJleHAiOjE5NDM3NDk5ODR9.87h6yNOOf2UIVLygJp-hap-Y0n37xQ7OzPfv7HTlrbY';

// ── LOCAL TEST MODE (ไม่บังคับ) ──
// true  = ไม่ต่อ backend, เก็บข้อมูลใน localStorage ของ browser (มีข้อมูล demo, แก้อะไรก็ไม่กระทบของจริง)
// false / ไม่ใส่ = ต่อ backend จริงตาม SUPABASE_URL ข้างบน
window.LOCAL_TEST_MODE = false;
