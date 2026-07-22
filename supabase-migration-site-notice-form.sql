-- =============================================================
-- Site Notice Letter (site_notice_forms) — Migration
-- Module ใหม่: ฟอร์มดิจิทัลของ "หนังสือแจ้งหน่วยงานภายนอก" (แจ้ง รพ./หน่วยงานก่อนออกไซต์)
-- เลือกได้เป็นฟอร์มที่ 3 ในหน้า "เอกสารประกอบ Adv." (module เดิม expense_form) คู่กับ FM-AC-01 / FM-AC-02
-- แยกอิสระจากตาราง expense_clearing_forms / site_deploy_forms / advances เดิม — ไม่กระทบตารางเดิมใด ๆ ในระบบ
-- รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS site_notice_forms (
  id                    TEXT PRIMARY KEY,
  doc_no                TEXT DEFAULT '',
  doc_date              DATE,
  requester_name        TEXT DEFAULT '',
  requester_position    TEXT DEFAULT '',
  requester_dept        TEXT DEFAULT '',
  attach_copies         TEXT DEFAULT '',        -- สิ่งที่ส่งมาด้วย จำนวน...ฉบับ
  attach_sheets         TEXT DEFAULT '',        -- สิ่งที่ส่งมาด้วย จำนวน...แผ่น
  system_key            TEXT DEFAULT 'other',   -- hosxp|hosxp_xe|data_center|inventory|other
  system_other_note     TEXT DEFAULT '',        -- รายละเอียดเพิ่มเติมเมื่อเลือก system_key = 'other'
  task_install          BOOLEAN DEFAULT false,  -- เข้าปฏิบัติงานติดตั้ง
  task_revisit          BOOLEAN DEFAULT false,
  revisit_no            TEXT DEFAULT '',
  revisit_total         TEXT DEFAULT '',
  task_reply_lecturer   BOOLEAN DEFAULT false,  -- ตอบกลับวิทยากร
  task_ma               BOOLEAN DEFAULT false,
  ma_no                 TEXT DEFAULT '',
  ma_total               TEXT DEFAULT '',
  task_present          BOOLEAN DEFAULT false,  -- นำเสนอโปรแกรม เชิงรุก/เชิงรับ
  present_type          TEXT DEFAULT '',        -- เชิงรุก|เชิงรับ
  task_other            BOOLEAN DEFAULT false,
  task_other_note       TEXT DEFAULT '',
  task_survey           BOOLEAN DEFAULT false,  -- สำรวจระบบ
  task_delivery         BOOLEAN DEFAULT false,  -- ส่งมอบงาน งวดที่
  delivery_no           TEXT DEFAULT '',
  delivery_total        TEXT DEFAULT '',
  task_copydata         BOOLEAN DEFAULT false,  -- ขอคัดลอกฐานข้อมูล
  copydata_status       TEXT DEFAULT '',        -- signed|unsigned
  work_start            DATE,
  work_end              DATE,
  site_location         TEXT DEFAULT '',
  attendees             JSONB DEFAULT '[]',     -- [{ name, position }] รายชื่อผู้เข้าปฏิบัติงาน
  addressee_key         TEXT DEFAULT 'hospital_director', -- hospital_director|health_office|other
  addressee_other_note  TEXT DEFAULT '',
  purpose_key           TEXT DEFAULT 'inform',  -- inform|committee
  contract_no           TEXT DEFAULT '',
  contract_amount       NUMERIC,
  contract_date         DATE,
  quote_no              TEXT DEFAULT '',
  deliver_mail          BOOLEAN DEFAULT false,
  deliver_email         BOOLEAN DEFAULT false,
  email_to              TEXT DEFAULT '',
  email_cc              TEXT DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snl_created_at ON site_notice_forms (created_at);

-- =============================================================
-- ROW LEVEL SECURITY (เปิดใช้ + policy anon-all เหมือนตารางเดิมทุกตัว
-- เพราะระบบใช้ app-level auth ไม่ใช่ Supabase Auth)
-- =============================================================
ALTER TABLE site_notice_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_site_notice_forms" ON site_notice_forms;
CREATE POLICY "anon_all_site_notice_forms" ON site_notice_forms
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
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'site_notice_forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE site_notice_forms;
  END IF;
END $$;

-- =============================================================
-- ROLLBACK (รันบล็อกนี้เพื่อถอนการติดตั้ง module นี้ทั้งหมด — ไม่กระทบตารางเดิม)
-- =============================================================
-- DROP TABLE IF EXISTS site_notice_forms CASCADE;
