-- =============================================================
-- Implementation Tracker — เก็บ Gemini API Key ส่วนกลางใน Supabase
-- ให้ Admin ตั้งค่าครั้งเดียว ผู้ใช้ทุกคนใช้ "สรุปด้วย AI" ได้เลยโดยไม่ต้องกรอก Key เอง
-- ไม่กระทบตารางเดิมใด ๆ ในระบบ — รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- (ถ้าสร้างฐานข้อมูลใหม่ด้วย supabase-schema.sql ตัวล่าสุดอยู่แล้ว ไม่ต้องรันไฟล์นี้ซ้ำ)
-- =============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS imt_ai_key TEXT DEFAULT '';
