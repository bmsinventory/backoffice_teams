# เปิดใช้งาน Web Push

Web Push ชุดนี้แจ้งเตือน Ticket ใหม่และข้อความตอบกลับจากผู้แจ้ง แม้ผู้ใช้ปิดหน้า WebApp แล้ว โดยมีส่วนประกอบ 3 ส่วน:

1. Service Worker แสดง Notification บนอุปกรณ์
2. ตาราง `web_push_subscriptions` และ `web_push_jobs` ใน Supabase
3. Container `push-worker` ส่งข้อความด้วย VAPID โดยเก็บ Private Key ไว้ฝั่งเซิร์ฟเวอร์เท่านั้น

## ติดตั้ง

รัน schema ล่าสุดกับฐานข้อมูล:

```bash
docker compose exec -T db psql -U postgres -d postgres < /path/to/db-schema.sql
```

สร้าง VAPID key หนึ่งครั้ง (ต้องใช้คู่เดิมตลอด หากเปลี่ยนคีย์ผู้ใช้ต้องเปิดแจ้งเตือนใหม่):

```bash
docker run --rm node:20-alpine sh -c "npx --yes web-push generate-vapid-keys"
```

คัดลอก `deploy/.env.example` เป็น `deploy/.env` แล้วกรอกเฉพาะ VAPID:

- `VAPID_PUBLIC_KEY` และ `VAPID_PRIVATE_KEY` จากคำสั่งด้านบน
- `VAPID_SUBJECT` เป็น `mailto:` ของผู้ดูแลระบบ

`SERVICE_ROLE_KEY` ใช้ค่าที่มีอยู่แล้วใน `.env` ของ Supabase โดยโหลดไฟล์เดิมเข้า Docker Compose โดยตรง ไม่ต้องคัดลอกคีย์มาเก็บซ้ำในโปรเจกต์นี้

จากโฟลเดอร์ `deploy` สร้างและเริ่มระบบ:

```bash
docker compose \
  --env-file ./deploy/.env \
  --env-file /path/to/supabase/docker/.env \
  -f ./deploy/docker-compose.yml up -d --build
docker compose ps
docker compose logs -f push-worker
```

## เปิดบนอุปกรณ์ผู้ใช้

เข้า WebApp ผ่าน HTTPS แล้วเข้าสู่ระบบ กดกระดิ่งมุมขวาบน และเลือก **เปิดแจ้งเตือนเมื่อปิด WebApp** จากนั้นกดอนุญาตในเบราว์เซอร์

- Windows/Android: รองรับผ่าน Chrome หรือ Edge
- iPhone/iPad: เพิ่ม WebApp ลงหน้าจอโฮมก่อน แล้วเปิดจากไอคอนที่ติดตั้ง จึงจะขอสิทธิ์ Push ได้

เมื่อกด Notification ระบบจะเปิด Ticket ที่เกี่ยวข้องโดยตรง

## ตรวจสอบ

```sql
SELECT id, user_name, active, updated_at FROM web_push_subscriptions ORDER BY updated_at DESC;
SELECT id, status, attempts, last_error, created_at FROM web_push_jobs ORDER BY created_at DESC LIMIT 20;
```

ห้ามนำ `VAPID_PRIVATE_KEY` หรือ `SUPABASE_SERVICE_ROLE_KEY` ใส่ใน `docs/`, JavaScript ฝั่งหน้าเว็บ หรือ commit ลง Git
