-- =============================================================
-- Expense Clearing Form (expense_clearing_forms) — Migration
-- Module ใหม่: ฟอร์มดิจิทัลของ "FM-AC-01 EXPENSE CLEARING" (ใบเบิกเงินทดรองจ่าย)
-- แยกอิสระจากตาราง advances เดิม — ไม่กระทบตารางเดิมใด ๆ ในระบบ
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS expense_clearing_forms (
  id                    TEXT PRIMARY KEY,
  form_no               TEXT DEFAULT '',
  project_id            TEXT DEFAULT '',
  category_key          TEXT DEFAULT 'other',   -- data_center|inventory|lis|mkt|implement|training|other
  category_other_note   TEXT DEFAULT '',        -- รายละเอียดเพิ่มเติมเมื่อเลือก category_key = 'other'
  staff_name            TEXT DEFAULT '',
  staff_phone           TEXT DEFAULT '',
  work_start            DATE,
  work_end              DATE,
  work_location         TEXT DEFAULT '',
  assigned_task         TEXT DEFAULT '',
  requested_amount      NUMERIC DEFAULT 0,
  people_count          INTEGER DEFAULT 1,
  travel_fuel_toll      NUMERIC DEFAULT 0,
  travel_transport      NUMERIC DEFAULT 0,
  travel_other          NUMERIC DEFAULT 0,
  lodging_nights        INTEGER DEFAULT 0,
  lodging_rooms         INTEGER DEFAULT 0,
  lodging_rate          NUMERIC DEFAULT 0,
  workers               JSONB DEFAULT '[]'::jsonb,   -- [{name:''}] สูงสุด 12 คน
  others                JSONB DEFAULT '[]'::jsonb,   -- [{note:'', amount:0}] รายการอื่นๆ หลายรายการ
  total_amount          NUMERIC DEFAULT 0,
  note_schedule_signed  BOOLEAN DEFAULT false,
  note_letter_sent      BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecf_project_id ON expense_clearing_forms (project_id);
CREATE INDEX IF NOT EXISTS idx_ecf_created_at ON expense_clearing_forms (created_at);

-- =============================================================
-- ROW LEVEL SECURITY (เปิดใช้ + policy anon-all เหมือนตารางเดิมทุกตัว
-- เพราะระบบใช้ app-level auth ไม่ใช่ Supabase Auth)
-- =============================================================
ALTER TABLE expense_clearing_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_expense_clearing_forms" ON expense_clearing_forms;
CREATE POLICY "anon_all_expense_clearing_forms" ON expense_clearing_forms
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- =============================================================
-- REALTIME (ต้อง ADD TABLE เข้า publication ไม่งั้น onSnapshot จะไม่ได้รับ
-- update แบบ realtime แม้ query ครั้งแรกจะทำงานปกติ — เช็คก่อนว่ามีอยู่แล้วหรือยัง
-- เพื่อให้รันซ้ำได้โดยไม่ error)
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'expense_clearing_forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE expense_clearing_forms;
  END IF;
END $$;

-- =============================================================
-- ROLLBACK (รันบล็อกนี้เพื่อถอนการติดตั้ง module นี้ทั้งหมด — ไม่กระทบตารางเดิม)
-- =============================================================
-- DROP TABLE IF EXISTS expense_clearing_forms CASCADE;
