-- =============================================================
-- Site Deploy Form (site_deploy_forms) — Migration
-- Module ใหม่: ฟอร์มดิจิทัลของ "FM-AC-02 แบบฟอร์มการออกปฏิบัติงาน" (ออกไซต์งาน/ติดต่อลูกค้า/เตรียมความพร้อม)
-- เลือกได้เป็นฟอร์มที่ 2 ในหน้า "เอกสารประกอบ Adv." (module เดิม expense_form)
-- แยกอิสระจากตาราง expense_clearing_forms / advances เดิม — ไม่กระทบตารางเดิมใด ๆ ในระบบ
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS site_deploy_forms (
  id                    TEXT PRIMARY KEY,
  dept_key              TEXT DEFAULT 'other',   -- data_center|training|implement|lis|inventory|ma|other
  dept_other_note       TEXT DEFAULT '',        -- รายละเอียดเพิ่มเติมเมื่อเลือก dept_key = 'other'
  hospital_id           TEXT DEFAULT '',        -- อ้างอิง hospitals.id เมื่อเลือกจาก combobox (ว่าง = พิมพ์ชื่อเอง ไม่ผูกกับ hospital)
  site_location         TEXT DEFAULT '',
  province              TEXT DEFAULT '',
  work_open_new_site    BOOLEAN DEFAULT false,
  work_per_contract     BOOLEAN DEFAULT false,
  work_other            BOOLEAN DEFAULT false,
  work_other_note       TEXT DEFAULT '',
  contract_no           TEXT DEFAULT '',        -- สัญญาเลขที่ / ใบเสนอราคาเลขที่
  work_revisit          BOOLEAN DEFAULT false,
  revisit_no            TEXT DEFAULT '',        -- Revisit ครั้งที่ ..
  revisit_total         TEXT DEFAULT '',        -- Revisit / ทั้งหมด ..
  work_fix_issue        BOOLEAN DEFAULT false,
  work_close_contract   BOOLEAN DEFAULT false,
  customer_name         TEXT DEFAULT '',
  customer_dept         TEXT DEFAULT '',
  customer_email        TEXT DEFAULT '',
  customer_phone        TEXT DEFAULT '',
  preparation_notes     TEXT DEFAULT '',
  adv_slip_count        NUMERIC,
  adv_collected_amount  NUMERIC,
  adv_total_amount      NUMERIC,
  adv_remaining_amount  NUMERIC,
  adv_used_amount       NUMERIC,
  adv_uncleared_count   NUMERIC,
  preparer_name         TEXT DEFAULT '',
  preparer_date         DATE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdf_created_at ON site_deploy_forms (created_at);
CREATE INDEX IF NOT EXISTS idx_sdf_hospital_id ON site_deploy_forms (hospital_id);

-- =============================================================
-- ROW LEVEL SECURITY (เปิดใช้ + policy anon-all เหมือนตารางเดิมทุกตัว
-- เพราะระบบใช้ app-level auth ไม่ใช่ Supabase Auth)
-- =============================================================
ALTER TABLE site_deploy_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_site_deploy_forms" ON site_deploy_forms;
CREATE POLICY "anon_all_site_deploy_forms" ON site_deploy_forms
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
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'site_deploy_forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE site_deploy_forms;
  END IF;
END $$;

-- =============================================================
-- ROLLBACK (รันบล็อกนี้เพื่อถอนการติดตั้ง module นี้ทั้งหมด — ไม่กระทบตารางเดิม)
-- =============================================================
-- DROP TABLE IF EXISTS site_deploy_forms CASCADE;
