-- =============================================================
-- Implementation Tracker (impl_tracker) — Migration
-- Module ใหม่: ติดตามงานโครงการติดตั้งระบบ (Project → Phase → Task → Checklist)
-- ไม่กระทบตารางเดิมใด ๆ ในระบบ — รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- =============================================================

-- ── TEMPLATES (checklist ต้นแบบ นำไป apply สร้าง Phase/Task/Checklist ให้โครงการใหม่) ──
CREATE TABLE IF NOT EXISTS impl_templates (
  id            TEXT PRIMARY KEY,
  template_name TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  structure     JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROJECTS ──
CREATE TABLE IF NOT EXISTS impl_projects (
  id               TEXT PRIMARY KEY,
  project_name     TEXT DEFAULT '',
  hospital_name    TEXT DEFAULT '',
  start_date       DATE,
  end_date         DATE,
  project_manager  TEXT DEFAULT '',
  status           TEXT DEFAULT 'not_started',
  progress_percent NUMERIC DEFAULT 0,
  template_id      TEXT DEFAULT '',
  source_project_id TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── PHASES ──
CREATE TABLE IF NOT EXISTS impl_phases (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  phase_name       TEXT DEFAULT '',
  description      TEXT DEFAULT '',
  sort_order       INTEGER DEFAULT 99,
  status           TEXT DEFAULT 'not_started',
  progress_percent NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── TASKS ──
CREATE TABLE IF NOT EXISTS impl_tasks (
  id               TEXT PRIMARY KEY,
  phase_id         TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  task_name        TEXT DEFAULT '',
  description      TEXT DEFAULT '',
  owner            TEXT DEFAULT '',
  start_date       DATE,
  due_date         DATE,
  priority         TEXT DEFAULT 'medium',
  status           TEXT DEFAULT 'not_started',
  progress_percent NUMERIC DEFAULT 0,
  sort_order       INTEGER DEFAULT 99,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── CHECKLIST ITEMS ──
CREATE TABLE IF NOT EXISTS impl_checklist_items (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  checklist_name TEXT DEFAULT '',
  is_done        BOOLEAN DEFAULT false,
  done_date      DATE,
  done_by        TEXT DEFAULT '',
  remark         TEXT DEFAULT '',
  sort_order     INTEGER DEFAULT 99,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMMENTS (ต่อ Task) ──
CREATE TABLE IF NOT EXISTS impl_comments (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  author       TEXT DEFAULT '',
  comment_text TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── ATTACHMENTS (ต่อ Task, ไฟล์จริงเก็บใน Supabase Storage bucket "impl-attachments") ──
CREATE TABLE IF NOT EXISTS impl_attachments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  file_name   TEXT DEFAULT '',
  file_url    TEXT DEFAULT '',
  file_size   NUMERIC DEFAULT 0,
  uploaded_by TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ACTIVITY LOG ──
CREATE TABLE IF NOT EXISTS impl_activity_log (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id   TEXT DEFAULT '',
  action      TEXT DEFAULT '',
  detail      TEXT DEFAULT '',
  actor       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_impl_phases_project_id    ON impl_phases (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_phase_id        ON impl_tasks (phase_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_project_id       ON impl_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_due_date          ON impl_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_impl_checklist_task_id       ON impl_checklist_items (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_comments_task_id        ON impl_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_attachments_task_id     ON impl_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_activity_project_id     ON impl_activity_log (project_id);

-- =============================================================
-- ROW LEVEL SECURITY (เปิดใช้ + policy anon-all เหมือนตารางเดิมทุกตัว
-- เพราะระบบใช้ app-level auth ไม่ใช่ Supabase Auth)
-- =============================================================
ALTER TABLE impl_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_phases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_activity_log    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'impl_templates','impl_projects','impl_phases','impl_tasks','impl_checklist_items',
    'impl_comments','impl_attachments','impl_activity_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- =============================================================
-- REALTIME (ต้อง ADD TABLE เข้า publication ไม่งั้น onSnapshot จะไม่ได้รับ
-- update แบบ realtime แม้ query ครั้งแรกจะทำงานปกติ — เช็คก่อนว่ามีอยู่แล้วหรือยัง
-- เพื่อให้รันซ้ำได้โดยไม่ error)
-- =============================================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'impl_templates','impl_projects','impl_phases','impl_tasks','impl_checklist_items',
    'impl_comments','impl_attachments','impl_activity_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;

-- =============================================================
-- STORAGE BUCKET (สำหรับไฟล์แนบใน Task) — สร้างผ่าน SQL ได้ตรง ๆ
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('impl-attachments', 'impl-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "impl_attachments_public_read" ON storage.objects;
CREATE POLICY "impl_attachments_public_read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'impl-attachments');

DROP POLICY IF EXISTS "impl_attachments_anon_write" ON storage.objects;
CREATE POLICY "impl_attachments_anon_write" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'impl-attachments');

DROP POLICY IF EXISTS "impl_attachments_anon_delete" ON storage.objects;
CREATE POLICY "impl_attachments_anon_delete" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'impl-attachments');

-- =============================================================
-- SEED: Template มาตรฐาน "ระบบบริหารคลังสินค้า (INV / PostgreSQL)"
-- แปลงจาก Checklist ที่แนบ — 7 หมวดงาน (Phase) / 47 รายการ (Task)
-- แต่ละ Task สร้าง Checklist Item เริ่มต้น 1 รายการชื่อเดียวกับ Task
-- (ผู้ใช้แก้ไข/เพิ่มรายละเอียดเพิ่มเติมได้หลัง apply เข้าโครงการจริง)
-- =============================================================
INSERT INTO impl_templates (id, template_name, description, structure) VALUES (
  'TPL_INV_STD',
  'ระบบบริหารคลังสินค้า (INV / PostgreSQL) - มาตรฐาน',
  'Checklist งานติดตั้งระบบบริหารคลังสินค้า แปลงจากไฟล์ ck list.pdf',
  '{
    "phases": [
      {
        "phase_name": "ข้อมูลพื้นฐาน",
        "sort_order": 1,
        "tasks": [
          "ข้อมูลรายชื่อคลังใหญ่/ชื่อคลังย่อย",
          "ข้อมูลประเภทรายการ/กลุ่มรายการ/ชนิดรายการ",
          "ข้อมูลรายการสินค้า แยกตามคลัง",
          "บริษัทผู้จำหน่าย/ผู้ผลิต",
          "รายชื่อกรรมการตรวจรับ",
          "ข้อมูลงบประมาณ",
          "Login เข้าใช้งานระบบ"
        ]
      },
      {
        "phase_name": "Server AND Database",
        "sort_order": 2,
        "tasks": [
          "ลง PostgreSQL",
          "Config PostgreSQL",
          "ลง Bouncer",
          "สร้างฐานข้อมูลจริง และทดสอบระบบ",
          "ทำ Auto Backup ข้อมูล"
        ]
      },
      {
        "phase_name": "จัดเตรียมข้อมูลในฐานข้อมูล",
        "sort_order": 3,
        "tasks": [
          "จัดเตรียม User Login (อ้างอิงจากฐานจริง)",
          "จัดเตรียม User Group (สร้างในฐานจริง แล้ว Transfer)",
          "รันทศนิยมในฐาน INV",
          "ตรวจสอบการกด Store Procedure ฐาน INV",
          "สร้างคลังใหญ่ BMS (ID : 99)",
          "สร้างหน่วยงาน BMS / คลังย่อยค้างจ่ายยา (ID : 100 / 99)",
          "สร้างบริษัท 01.ยอดยกมาตั้งต้นระบบ (ID : 999)",
          "ตั้งค่า Stock doc setting เลขที่ใบเบิก",
          "ตั้งค่าข้อมูลตาราง stock vendor ที่ stock vendor_type_id = 99 1 บริษัท",
          "ตั้งค่า Prefix คลัง (กรณี รพ.ต้องการรันเลขเอกสารแยกคลัง)"
        ]
      },
      {
        "phase_name": "เอกสารแบบฟอร์ม",
        "sort_order": 4,
        "tasks": [
          "ติดตามรูปแบบเอกสารแบบฟอร์มจาก รพ.",
          "นำเอกสารแบบฟอร์มที่จัดทำเสร็จแล้วไปให้เจ้าหน้าที่ตรวจสอบ",
          "เซ็นต์ยืนยันการตรวจสอบแบบฟอร์ม (หลังจากตรวจเสร็จ)",
          "จัดทำเอกสารส่งมอบงานในส่วนของแบบฟอร์ม"
        ]
      },
      {
        "phase_name": "อบรมการใช้งานระบบ",
        "sort_order": 5,
        "tasks": [
          "เครื่อง Computer / Notebook",
          "เครื่อง Projecter",
          "คู่มือสำหรับแจกผู้เข้าอบรมการใช้งาน",
          "แบบทดสอบ UnitTest",
          "Power Point สำหรับใช้ในการอบรม",
          "ติดตามรายชื่อผู้อบรม",
          "เอกสารใบเซ็นต์ชื่อ",
          "ใบแจ้งปัญหาในการเข้าร่วมรับการอบรม"
        ]
      },
      {
        "phase_name": "รายงาน",
        "sort_order": 6,
        "tasks": [
          "ติดตามรายงานตามสัญญา 5 รายงาน",
          "นำรายงานไปให้เจ้าหน้าที่ตรวจสอบ",
          "เซ็นต์ยืนยันการตรวจสอบรายงาน (หลังจากตรวจเสร็จ)"
        ]
      },
      {
        "phase_name": "เอกสารส่งมอบงาน",
        "sort_order": 7,
        "tasks": [
          "เอกสารข้อมูลพื้นฐานทั้งหมดในระบบ",
          "เอกสารติดตั้งระบบปฏิบัติการ Linux และฐานข้อมูล PostgreSQL",
          "เอกสารจัดทำแบบฟอร์มในระบบบริหารคลังสินค้า",
          "เอกสารใบเซ็นชื่อเข้าร่วมรับการอบรมการใช้งาน",
          "เอกสารรายละเอียดตารางอบรมการใช้งาน",
          "เอกสารรายละเอียดตารางคีย์ยอดตั้งต้นระบบ",
          "เอกสารรายละเอียดตารางติดตั้งการใช้งานระบบ",
          "เอกสารสรุปปัญหาการใช้งาน",
          "เอกสารใบเซ็นชื่อ Stand by การใช้งานระบบ",
          "เอกสารใบเซ็นชื่ออบรมผู้ดูแลระบบ"
        ]
      }
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET structure = EXCLUDED.structure, template_name = EXCLUDED.template_name, description = EXCLUDED.description;

-- =============================================================
-- ROLLBACK (รันบล็อกนี้เพื่อถอนการติดตั้ง module นี้ทั้งหมด — ไม่กระทบตารางเดิม)
-- =============================================================
-- DROP TABLE IF EXISTS impl_activity_log, impl_attachments, impl_comments,
--   impl_checklist_items, impl_tasks, impl_phases, impl_projects, impl_templates CASCADE;
-- DELETE FROM storage.buckets WHERE id = 'impl-attachments';
-- (impl_issues / impl_risks ถูกลบไปแล้วแยกต่างหาก — ดู supabase-drop-impl-issues-risks.sql)
