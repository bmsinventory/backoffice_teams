# Migration Runbook — ย้ายทั้งระบบไปเซิร์ฟเวอร์ใหม่ (self-hosted, ทุกอย่างอยู่ใน Docker)

ทำตามลำดับ อย่าข้าม — แต่ละ phase อ้างอิงผลจาก phase ก่อนหน้า
แทนที่ค่าที่เป็น `<...>` ด้วยค่าจริงทุกจุด

---

## Phase 1 — เตรียมเซิร์ฟเวอร์ใหม่

```bash
# ติดตั้ง Docker + Docker Compose (ถ้ายังไม่มี) ตามวิธีของ distro
docker --version
docker compose version
nginx -v
certbot --version
```

ต้องมี domain 2 ชื่อ ชี้ DNS มาที่ IP เซิร์ฟเวอร์นี้ไว้ล่วงหน้า:
- `app.<DOMAIN>` — สำหรับหน้าเว็บ (frontend)
- `api.<DOMAIN>` — สำหรับ Supabase API (backend)

---

## Phase 2 — ตั้ง Self-hosted Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

สร้างคีย์ใหม่ทั้งชุด (**ห้ามใช้คีย์จาก Supabase Cloud เดิม** ต้องเป็นชุดใหม่สำหรับ instance นี้เท่านั้น) — ใช้ script ของ repo supabase เอง (`utils/generate-keys.sh`) ไม่ใช่ `deploy/scripts/generate-keys.mjs` เดิม เพราะ `.env.example` เวอร์ชันปัจจุบันต้องการ secret มากกว่าที่ script เดิมของโปรเจกต์รองรับ (ขาด SECRET_KEY_BASE, VAULT_ENC_KEY, PG_META_CRYPTO_KEY, LOGFLARE tokens, S3 keys ฯลฯ — ถ้าใช้ script เดิมค่าพวกนี้จะค้างเป็นค่า default ที่ไม่ปลอดภัย):

```bash
# รันในโฟลเดอร์ supabase/docker ที่ clone มา (มี .env จาก cp .env.example .env แล้ว)
sh utils/generate-keys.sh --update-env
# เขียน JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY / SECRET_KEY_BASE / VAULT_ENC_KEY /
# PG_META_CRYPTO_KEY / LOGFLARE_*_ACCESS_TOKEN / S3_PROTOCOL_* / MINIO_ROOT_PASSWORD /
# POSTGRES_PASSWORD / DASHBOARD_PASSWORD ลง .env ให้อัตโนมัติ (ค่าเดิมถูก backup เป็น .env.old)
```

แก้ไฟล์ `supabase/docker/.env` เพิ่มอีกแค่บรรทัดต่อไปนี้ (ค่าอื่นที่ script เติมให้แล้วปล่อยตามนั้นได้):

```
DASHBOARD_USERNAME=<ตั้งเอง>
SITE_URL=https://app.<DOMAIN>
API_EXTERNAL_URL=https://api.<DOMAIN>/auth/v1
SUPABASE_PUBLIC_URL=https://api.<DOMAIN>
```

รัน stack:

```bash
docker compose up -d
docker compose ps   # ทุก service ต้อง Up/healthy
```

> หมายเหตุ: ถ้าเซิร์ฟเวอร์มี Postgres ตัวอื่นครองพอร์ต 5432 อยู่แล้ว หรือพอร์ต 6543 ถูกใช้/สงวนไว้ ให้แก้ `POSTGRES_PORT`/`POOLER_PROXY_PORT_TRANSACTION` ใน `.env` เป็นพอร์ตอื่นก่อน `docker compose up` (พบเจอปัญหานี้ตอนทดสอบบน Windows local)

---

## Phase 3 — สร้าง Schema

```bash
docker compose exec -T db psql -U postgres -d postgres \
  < /path/to/backoffice_teams-supabase/db-schema.sql
```

ตรวจว่าตาราง/RLS/bucket ถูกสร้างครบ (เปิด Supabase Studio ที่ `http://<SERVER_IP>:8000` ล็อกอินด้วย DASHBOARD_USERNAME/PASSWORD ที่ตั้งไว้ ดูใน Table Editor + Storage)

---

## Phase 4 — Migrate ข้อมูล (จาก Supabase Cloud → instance ใหม่)

หา connection string ของ Cloud project เดิมจาก Dashboard → Project Settings → Database → Connection string (URI)

```bash
# บนเครื่องที่เข้าถึง Cloud ได้ (ต้องลง postgresql-client)
pg_dump "<CLOUD_CONNECTION_STRING>" \
  --data-only --schema=public \
  --exclude-table=schema_migrations \
  > backup_data.sql

scp backup_data.sql user@<SERVER_IP>:/tmp/

# บนเซิร์ฟเวอร์ใหม่
docker compose exec -T db psql -U postgres -d postgres < /tmp/backup_data.sql
```

ตรวจ row count เทียบ Cloud vs ใหม่ให้ตรงกันในตารางหลัก (staff, projects, advances, timesheets ฯลฯ)

> หมายเหตุ: PK ทุกตารางเป็น TEXT ที่ generate ฝั่งแอป ไม่ใช่ serial — ไม่ต้อง reset sequence

---

## Phase 5 — Migrate ไฟล์แนบ (Storage)

```bash
cd /path/to/backoffice_teams-supabase/migration
npm install

OLD_SUPABASE_URL="https://zsxllqiygochmldmtpgc.supabase.co" \
OLD_SERVICE_ROLE_KEY="<service_role key ของ Cloud project เดิม จาก Dashboard>" \
NEW_SUPABASE_URL="https://api.<DOMAIN>" \
NEW_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY จาก Phase 2>" \
node migrate-storage.mjs
```

ถ้ามี `failed-uploads.json` เกิดขึ้น ให้เปิดดูรายการที่พลาดแล้วรันซ้ำเฉพาะไฟล์นั้น

---

## Phase 6 — แก้ URL ไฟล์แนบเก่าให้ชี้ domain ใหม่

แก้ `migration/fix-file-urls.sql` ให้ `new_domain` เป็น `https://api.<DOMAIN>` แล้วรัน:

```bash
docker compose exec -T db psql -U postgres -d postgres \
  < /path/to/backoffice_teams-supabase/migration/fix-file-urls.sql
```

เช็คว่า query สุดท้ายในสคริปต์คืนค่า 0 แถวก่อน commit (ถ้ารันผ่าน psql ตรงๆ แบบนี้ transaction จะ commit อัตโนมัติเมื่อจบไฟล์ — ถ้าอยากเช็คก่อน ให้รันทีละคำสั่งผ่าน `psql -U postgres -d postgres` แบบ interactive แทน)

---

## Phase 7 — ชี้ Frontend ไปที่ Supabase instance ใหม่

แก้ `deploy/docker-compose.yml`:

```yaml
environment:
  SUPABASE_URL: "https://api.<DOMAIN>"
  SUPABASE_ANON_KEY: "<ANON_KEY จาก Phase 2>"
```

- ปุ่ม AI ช่วยวิเคราะห์เรียก `https://vllm-gemma.bmscloud.in.th` จากเบราว์เซอร์ และ worker ตอบกลับอัตโนมัติใช้ปลายทางเดียวกัน (ไม่ใช้คีย์) ค่าเริ่มต้นจึงไม่ต้องตั้งเพิ่ม หากต้องเปลี่ยนปลายทางให้กำหนด `AI_BASE` ใน environment ของ frontend container
- หลังอัปเดตเวอร์ชันที่มี AI ตอบกลับอัตโนมัติ ต้องรัน `db-schema.sql` ก่อน restart/rebuild frontend เพื่อสร้างคิว, Audit Log, trigger และ RPC ของ worker

```bash
docker compose up -d   # ไม่ต้อง rebuild image — env var อ่านใหม่ตอน container start
```

---

## Phase 8 — nginx + SSL

Copy 2 ไฟล์จาก `deploy/nginx/` ไปที่ `/etc/nginx/sites-available/` บนเซิร์ฟเวอร์ใหม่ แก้ `YOURDOMAIN.com` เป็น domain จริง แล้ว:

```bash
ln -s /etc/nginx/sites-available/frontend.conf /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/supabase-api.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

certbot --nginx -d app.<DOMAIN>
certbot --nginx -d api.<DOMAIN>
```

---

## Phase 9 — ทดสอบให้ครบก่อน cutover จริง

- [ ] เปิด `https://app.<DOMAIN>` login ได้, เห็นข้อมูลครบ
- [ ] CRUD ทุกโมดูลหลัก (staff, projects, advance, timesheet)
- [ ] เปิดไฟล์แนบเก่า (จาก IMPL_ATTACHMENTS) เปิดได้จริง
- [ ] อัปโหลดไฟล์แนบใหม่สำเร็จ
- [ ] เปิด 2 browser พร้อมกัน แก้ข้อมูล เช็คว่า realtime sync เห็นการเปลี่ยนแปลงแบบ live
- [ ] ตั้ง AI Auto Reply เป็นเวลารอ 1 นาทีในระบบทดสอบ: ยืนยันว่า AI ตอบเพียงครั้งเดียว และยกเลิกทันทีเมื่อเจ้าหน้าที่ตอบก่อนครบเวลา
- [ ] ทดสอบวันหยุด/ช่วงทีมพัก, P1/P2 แบบรับเรื่องเท่านั้น และปิด AI กลับก่อนนำขึ้น production หากยังไม่พร้อมใช้งานจริง
- [ ] ทดสอบบนมือถือ + ลอง install PWA

---

## Phase 10 — Cutover

1. แจ้งผู้ใช้ล่วงหน้าเรื่อง maintenance window + URL ใหม่
2. Freeze การเขียนข้อมูลฝั่ง Cloud เดิม (ปิดหน้าแอปเก่าชั่วคราว)
3. รัน Phase 4-6 ซ้ำเฉพาะข้อมูล/ไฟล์ที่เปลี่ยนหลัง dump รอบแรก (delta sync)
4. ตรวจสอบผ่าน Phase 9 อีกรอบ
5. ประกาศ URL ใหม่ให้ผู้ใช้ (คนที่ install PWA ต้องลบของเก่า/ติดตั้งใหม่)

---

## Phase 11 — หลัง Live

```bash
# ตั้ง cron backup รายวัน (ตัวอย่าง crontab -e)
0 2 * * * docker compose -f /path/to/supabase/docker/docker-compose.yml exec -T db \
  pg_dump -U postgres postgres | gzip > /backups/db_$(date +\%F).sql.gz
```

- [ ] Firewall: ปิด port Postgres (5432)/internal ไม่ให้เปิดสู่ internet เปิดแค่ 80/443 ผ่าน nginx
- [ ] Monitor log 3-7 วันแรก (`docker compose logs -f`, nginx error log)
- [ ] เก็บ Supabase Cloud project เดิมไว้เป็น fallback อย่างน้อย 1-2 สัปดาห์ ก่อนปิด
