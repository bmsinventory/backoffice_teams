-- =============================================================
-- Implementation Tracker — เพิ่มคอลัมน์ sort_order ใน impl_tasks
-- ใช้ให้ผู้ใช้เรียงลำดับ Task ภายใน Phase ได้เอง (▲▼ เหมือน Phase เดิม)
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor (ปลอดภัย รันซ้ำได้ ไม่กระทบข้อมูลเดิม)
-- =============================================================
ALTER TABLE impl_tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 99;

-- Backfill: Task เดิมที่สร้างไว้ก่อนหน้านี้ทุกตัวมีค่า sort_order เป็น 99 เท่ากันหมด (เรียงไม่ได้)
-- จัดลำดับเริ่มต้นให้ตาม created_at ภายในแต่ละ Phase (เรียงตามลำดับที่เคยสร้างมาเดิม)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phase_id ORDER BY created_at, id) AS rn
  FROM impl_tasks
)
UPDATE impl_tasks t
SET sort_order = ranked.rn
FROM ranked
WHERE t.id = ranked.id AND t.sort_order = 99;
