-- =============================================================
-- Backoffice Teams — Backend DB Schema
-- รันใน SQL Editor ของฐานข้อมูล (PostgreSQL)
-- หมายเหตุ: publication ชื่อ `supabase_realtime` เป็น object จริงของ Realtime service — ห้ามเปลี่ยนชื่อ
-- =============================================================

-- ── STAGES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stages (
  id              TEXT PRIMARY KEY,
  stage_id        TEXT,
  label_th        TEXT DEFAULT '',
  label           TEXT DEFAULT '',
  color_hex       TEXT DEFAULT '#9ba3b8',
  color           TEXT DEFAULT '',
  "order"         INTEGER DEFAULT 99,
  auto_rule       TEXT DEFAULT '',
  auto_offset     NUMERIC DEFAULT 0,
  set_progress    NUMERIC DEFAULT -1,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PTYPES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ptypes (
  id        TEXT PRIMARY KEY,
  type_id   TEXT,
  label_th  TEXT DEFAULT '',
  label     TEXT DEFAULT '',
  color_hex TEXT DEFAULT '#9ba3b8',
  color     TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PGROUPS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pgroups (
  id        TEXT PRIMARY KEY,
  group_id  TEXT,
  label_th  TEXT DEFAULT '',
  label     TEXT DEFAULT '',
  color_hex TEXT DEFAULT '#4361ee',
  color     TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── POSITIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
  id          TEXT PRIMARY KEY,
  position_id TEXT,
  label_th    TEXT DEFAULT '',
  label       TEXT DEFAULT '',
  daily_rate  NUMERIC DEFAULT 0,
  rank        INTEGER DEFAULT 99,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEPARTMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id         TEXT PRIMARY KEY,
  dept_id    TEXT,
  label_th   TEXT DEFAULT '',
  label      TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── STAFF ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT,
  full_name   TEXT DEFAULT '',
  nickname    TEXT DEFAULT '',
  department  TEXT DEFAULT '',          -- departments.id
  position    TEXT DEFAULT '',          -- positions.id
  email       TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  is_active   BOOLEAN DEFAULT true,
  start_date  TEXT DEFAULT '',
  birth_date  TEXT DEFAULT '',
  remark      TEXT DEFAULT '',
  daily_rate  NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  username     TEXT DEFAULT '',
  password     TEXT DEFAULT '',
  name         TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  role         TEXT DEFAULT 'viewer',
  is_active    BOOLEAN DEFAULT true,
  staff_id     TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROJECTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT,
  project_name       TEXT DEFAULT '',
  group_id           TEXT DEFAULT '',
  site_owner         TEXT DEFAULT '',          -- เจ้าของไซต์ (staff.id)
  installer_name     TEXT DEFAULT '',          -- ผู้ติดตั้ง (staff.id)
  type_id            TEXT DEFAULT '',
  stage_id           TEXT DEFAULT 'pending',
  budget             NUMERIC DEFAULT 0,
  start_date         TEXT DEFAULT '',
  end_date           TEXT DEFAULT '',
  revisit_1          TEXT DEFAULT '',
  revisit_2          TEXT DEFAULT '',
  parent_project_id  TEXT DEFAULT '',
  revisit_round      INTEGER DEFAULT 0,
  progress_pct       NUMERIC DEFAULT 0,
  note               TEXT DEFAULT '',
  status             TEXT DEFAULT 'active',
  pm_staff_id        TEXT DEFAULT '',
  team               JSONB DEFAULT '[]',
  members            JSONB DEFAULT '[]',
  is_border          BOOLEAN DEFAULT false,
  contract_id        TEXT DEFAULT '',
  no_revisit         BOOLEAN DEFAULT false,
  visits             JSONB DEFAULT '[]',
  hospital_id        TEXT DEFAULT '',          -- โรงพยาบาลของโครงการ (hospitals.id) — ติดตามสถานะโครงการ/ระบบอบรมอ่านจากที่นี่
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS no_revisit BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hospital_id TEXT DEFAULT '';

-- ── ADVANCES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advances (
  id               TEXT PRIMARY KEY,
  advance_id       TEXT,
  project_id       TEXT DEFAULT '',
  purpose          TEXT DEFAULT '',
  amount_requested NUMERIC DEFAULT 0,
  amount_cleared   NUMERIC DEFAULT 0,
  request_date     TEXT DEFAULT '',
  due_date         TEXT DEFAULT '',
  status           TEXT DEFAULT 'draft',
  note             TEXT DEFAULT '',
  advance_no       TEXT DEFAULT '',
  expense_items    JSONB DEFAULT '[]',
  labor_items      JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── LODGINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lodgings (
  id               TEXT PRIMARY KEY,
  lodging_id       TEXT,
  project_id       TEXT DEFAULT '',
  lodging_name     TEXT DEFAULT '',
  map_url          TEXT DEFAULT '',
  phone            TEXT DEFAULT '',
  check_in         TEXT DEFAULT '',
  check_out        TEXT DEFAULT '',
  -- daily single/double
  ds_qty           NUMERIC DEFAULT 0,
  ds_rate          NUMERIC DEFAULT 0,
  dd_qty           NUMERIC DEFAULT 0,
  dd_rate          NUMERIC DEFAULT 0,
  d_total          NUMERIC DEFAULT 0,
  -- daily amenities
  d_wifi           BOOLEAN DEFAULT false,
  d_pillow         BOOLEAN DEFAULT false,
  d_blanket        BOOLEAN DEFAULT false,
  d_appliance      BOOLEAN DEFAULT false,
  d_parking        BOOLEAN DEFAULT false,
  d_ac             BOOLEAN DEFAULT false,
  d_fridge         BOOLEAN DEFAULT false,
  d_washer         BOOLEAN DEFAULT false,
  d_tv             BOOLEAN DEFAULT false,
  d_shower         BOOLEAN DEFAULT false,
  d_breakfast      BOOLEAN DEFAULT false,
  d_towel          BOOLEAN DEFAULT false,
  d_custom         TEXT DEFAULT '',
  d_deposit        NUMERIC DEFAULT 0,
  d_deposit_note   TEXT DEFAULT '',
  -- monthly single/double
  ms_qty           NUMERIC DEFAULT 0,
  ms_rate          NUMERIC DEFAULT 0,
  md_qty           NUMERIC DEFAULT 0,
  md_rate          NUMERIC DEFAULT 0,
  m_total          NUMERIC DEFAULT 0,
  -- monthly amenities
  m_wifi           BOOLEAN DEFAULT false,
  m_pillow         BOOLEAN DEFAULT false,
  m_blanket        BOOLEAN DEFAULT false,
  m_appliance      BOOLEAN DEFAULT false,
  m_parking        BOOLEAN DEFAULT false,
  m_ac             BOOLEAN DEFAULT false,
  m_fridge         BOOLEAN DEFAULT false,
  m_washer         BOOLEAN DEFAULT false,
  m_tv             BOOLEAN DEFAULT false,
  m_shower         BOOLEAN DEFAULT false,
  m_breakfast      BOOLEAN DEFAULT false,
  m_bedsheet       BOOLEAN DEFAULT false,
  m_towel          BOOLEAN DEFAULT false,
  m_custom         TEXT DEFAULT '',
  m_deposit        NUMERIC DEFAULT 0,
  m_deposit_note   TEXT DEFAULT '',
  m_water          TEXT DEFAULT '',
  m_electric       TEXT DEFAULT '',
  m_extras         TEXT DEFAULT '',
  m_incl_util      BOOLEAN DEFAULT false,
  -- totals / approval
  grand_total      NUMERIC DEFAULT 0,
  note             TEXT DEFAULT '',
  approved_daily      TEXT DEFAULT '',
  approved_monthly    TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── HOLIDAYS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holidays (
  id         TEXT PRIMARY KEY,
  holiday_id TEXT,
  name       TEXT DEFAULT '',
  date       TEXT DEFAULT '',
  type       TEXT DEFAULT 'national',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── LEAVES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id             TEXT PRIMARY KEY,
  leave_id       TEXT,
  staff_id       TEXT DEFAULT '',
  leave_type     TEXT DEFAULT 'other',
  start_date     TEXT DEFAULT '',
  end_date       TEXT DEFAULT '',
  substitute_id  TEXT DEFAULT '',
  note           TEXT DEFAULT '',
  status         TEXT DEFAULT 'pending',
  approved_by    TEXT DEFAULT '',            -- users.id
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── TIMESHEETS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
  id            TEXT PRIMARY KEY,
  timesheet_id  TEXT,
  project_id    TEXT DEFAULT '',
  staff_id      TEXT DEFAULT '',
  work_date     TEXT DEFAULT '',
  visit_start   TEXT DEFAULT '',
  visit_end     TEXT DEFAULT '',
  hours         NUMERIC DEFAULT 0,
  category      TEXT DEFAULT 'other',
  description   TEXT DEFAULT '',
  source        TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── COSTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS costs (
  id          TEXT PRIMARY KEY,
  cost_id     TEXT,
  project_id  TEXT DEFAULT '',
  staff_id    TEXT DEFAULT '',
  category    TEXT DEFAULT 'other',
  amount      NUMERIC DEFAULT 0,
  cost_date   TEXT DEFAULT '',
  description TEXT DEFAULT '',
  receipt_no  TEXT DEFAULT '',
  source      TEXT DEFAULT '',
  advance_id  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTRACTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                    TEXT PRIMARY KEY,
  contract_id           TEXT,
  project_name          TEXT DEFAULT '',
  customer_name         TEXT DEFAULT '',
  total_contract_value  NUMERIC DEFAULT 0,
  contract_sign_date    TEXT DEFAULT '',
  contract_start_date   TEXT DEFAULT '',
  end_date              TEXT DEFAULT '',
  note                  TEXT DEFAULT '',
  status                TEXT DEFAULT 'active',
  transactions          JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
-- migration for existing DB:
-- ALTER TABLE contracts ADD COLUMN IF NOT EXISTS transactions JSONB DEFAULT '[]';

-- ── HSP_PRODUCTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hsp_products (
  id         TEXT PRIMARY KEY,
  product_id TEXT,
  name       TEXT DEFAULT '',
  color      TEXT DEFAULT '#7c3aed',
  note       TEXT DEFAULT '',
  "group"    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── HOSPITALS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id          TEXT PRIMARY KEY,
  hospital_id TEXT,
  code        TEXT DEFAULT '',
  name        TEXT DEFAULT '',
  type        TEXT DEFAULT 'other',
  beds        INTEGER DEFAULT 0,
  province    TEXT DEFAULT '',
  district    TEXT DEFAULT '',
  tambon      TEXT DEFAULT '',
  address     TEXT DEFAULT '',
  tel         TEXT DEFAULT '',
  website     TEXT DEFAULT '',
  affiliation TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  contacts    JSONB DEFAULT '[]',
  products    JSONB DEFAULT '[]',
  systems     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- systems = { anydesk:[{label,ip,password}], database:[{label,ip,database,user,password}], config:[{label,hosxp,inv}] }
-- migration for existing DB:
-- ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS systems JSONB DEFAULT '{}';

-- ── WORK_LOGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_logs (
  id             TEXT PRIMARY KEY,
  uid            TEXT DEFAULT '',
  staff_id       TEXT DEFAULT '',
  type           TEXT DEFAULT 'daily',
  scope          TEXT DEFAULT 'personal',
  date           TEXT DEFAULT '',
  start_date     TEXT DEFAULT '',
  end_date       TEXT DEFAULT '',
  total_days     INTEGER DEFAULT 1,
  category       TEXT DEFAULT 'other',
  location_type  TEXT DEFAULT 'local',
  destination    TEXT DEFAULT '',
  title          TEXT DEFAULT '',
  detail         TEXT DEFAULT '',
  participants   JSONB DEFAULT '[]',
  created_at     TEXT DEFAULT ''
);

-- ── SETTINGS ────────────────────────────────────────────────
-- row id='app'              → การตั้งค่าระบบ
-- row id='role_permissions' → สิทธิ์ตาม role (admin/pm/viewer เป็น JSONB)
CREATE TABLE IF NOT EXISTS settings (
  id                         TEXT PRIMARY KEY,
  -- app settings
  notify_token               TEXT DEFAULT '',
  notify_advance_token       TEXT DEFAULT '',
  notify_project_token       TEXT DEFAULT '',
  notify_helpdesk_token      TEXT DEFAULT '',
  notify_training_token      TEXT DEFAULT '',
  helpdesk_ai_auto_reply     JSONB DEFAULT '{}',
  year_targets               JSONB DEFAULT '[]',
  tgt_grouped                BOOLEAN DEFAULT false,
  allowance_weekday_normal   NUMERIC DEFAULT 350,
  allowance_holiday_normal   NUMERIC DEFAULT 650,
  allowance_weekday_border   NUMERIC DEFAULT 650,
  allowance_holiday_border   NUMERIC DEFAULT 1250,
  -- role permissions (each role stored as JSONB)
  admin                      JSONB,
  pm                         JSONB,
  viewer                     JSONB,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- seed default settings rows
INSERT INTO settings (id) VALUES ('app')              ON CONFLICT (id) DO NOTHING;
INSERT INTO settings (id) VALUES ('role_permissions') ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_projects_stage_id    ON projects (stage_id);
CREATE INDEX IF NOT EXISTS idx_projects_group_id    ON projects (group_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects (status);
CREATE INDEX IF NOT EXISTS idx_advances_project_id  ON advances (project_id);
CREATE INDEX IF NOT EXISTS idx_advances_status      ON advances (status);
CREATE INDEX IF NOT EXISTS idx_lodgings_project_id  ON lodgings (project_id);
CREATE INDEX IF NOT EXISTS idx_leaves_staff_id      ON leaves (staff_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status        ON leaves (status);
CREATE INDEX IF NOT EXISTS idx_timesheets_project_id ON timesheets (project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff_id  ON timesheets (staff_id);
CREATE INDEX IF NOT EXISTS idx_costs_project_id     ON costs (project_id);
CREATE INDEX IF NOT EXISTS idx_costs_staff_id       ON costs (staff_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_staff_id   ON work_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_province   ON hospitals (province);
CREATE INDEX IF NOT EXISTS idx_hospitals_type       ON hospitals (type);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptypes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pgroups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE advances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lodgings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hsp_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings     ENABLE ROW LEVEL SECURITY;

-- อนุญาต anon ทำได้ทุก operation (ระบบใช้ app-level auth ไม่ใช่ Supabase Auth)
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'stages','ptypes','pgroups','positions','departments','staff','users',
    'projects','advances','lodgings','holidays','leaves','timesheets','costs',
    'contracts','hsp_products','hospitals','work_logs','settings'
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
-- REALTIME
-- =============================================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'stages','ptypes','pgroups','positions','departments','staff','users',
    'projects','advances','lodgings','holidays','leaves','timesheets','costs',
    'contracts','hsp_products','hospitals','work_logs','settings'
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
-- IMPLEMENTATION TRACKER (impl_tracker) — Module ติดตามงานโครงการติดตั้งระบบ
-- Project → Phase → Task → Checklist, แยกอิสระจากตาราง projects เดิม (คนละความหมาย)
-- =============================================================
CREATE TABLE IF NOT EXISTS impl_templates (
  id            TEXT PRIMARY KEY,
  template_name TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  structure     JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS impl_projects (
  id               TEXT PRIMARY KEY,
  project_name     TEXT DEFAULT '',
  start_date       DATE,
  end_date         DATE,
  status           TEXT DEFAULT 'not_started',
  progress_percent NUMERIC DEFAULT 0,
  template_id      TEXT DEFAULT '',
  source_project_id TEXT DEFAULT '',        -- โครงการต้นทาง (projects.id) — PM/ผู้ติดตั้ง/ทีม อ่านจากที่นี่
  dashboard_token  TEXT UNIQUE,              -- กุญแจลิงก์ Public Dashboard (impl-dashboard.html?t=<token>)
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS impl_tasks (
  id               TEXT PRIMARY KEY,
  phase_id         TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  task_name        TEXT DEFAULT '',
  description      TEXT DEFAULT '',
  owner            TEXT DEFAULT '',          -- ผู้รับผิดชอบ (staff.id)
  start_date       DATE,
  due_date         DATE,
  priority         TEXT DEFAULT 'medium',
  status           TEXT DEFAULT 'not_started',
  progress_percent NUMERIC DEFAULT 0,
  sort_order       INTEGER DEFAULT 99,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS impl_checklist_items (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  checklist_name TEXT DEFAULT '',
  is_done        BOOLEAN DEFAULT false,
  done_date      DATE,
  done_by        TEXT DEFAULT '',            -- users.id
  remark         TEXT DEFAULT '',
  sort_order     INTEGER DEFAULT 99,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS impl_comments (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  author       TEXT DEFAULT '',              -- users.id
  comment_text TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS impl_attachments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  file_name   TEXT DEFAULT '',
  file_url    TEXT DEFAULT '',
  file_size   NUMERIC DEFAULT 0,
  uploaded_by TEXT DEFAULT '',               -- users.id
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS impl_activity_log (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id   TEXT DEFAULT '',
  action      TEXT DEFAULT '',
  detail      TEXT DEFAULT '',
  actor       TEXT DEFAULT '',               -- users.id
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ปัญหาการใช้งานโปรแกรมรายโครงการ (แท็บ "ปัญหา") — สรุปปัญหาที่ รพ. แจ้งเข้ามาหลังติดตั้ง/ระหว่างใช้งานจริง
-- คนละบริบทกับ helpdesk_tickets (ticket ลูกค้าเรียลไทม์มี SLA) — ตารางนี้ผูกกับโครงการ ใช้พิมพ์เอกสารสรุป
-- ให้ รพ. เซ็นรับทราบเป็นรอบ ๆ แทน Google Sheet แยกไฟล์ต่อโครงการที่ใช้อยู่เดิม ──
CREATE TABLE IF NOT EXISTS impl_issues (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  task_id       TEXT DEFAULT '',   -- อ้างอิง task ที่เกี่ยวข้องได้ (ไม่บังคับ) ส่วนใหญ่ปัญหากลุ่มนี้ไม่ผูกกับ task ใดโดยเฉพาะ
  department    TEXT DEFAULT '',   -- หน่วยงาน/แผนกของ รพ. ที่แจ้งปัญหา
  reported_by   TEXT DEFAULT '',   -- ผู้แจ้งปัญหา (ชื่อคน รพ. ที่แจ้งเข้ามา)
  problem       TEXT DEFAULT '',
  category      TEXT DEFAULT '',   -- กลุ่มปัญหา (window.IMPL_ISSUE_CATEGORY)
  severity      TEXT DEFAULT 'medium',
  status        TEXT DEFAULT 'open',   -- open | in_progress | closed (window.IMPL_ISSUE_STATUS)
  solution      TEXT DEFAULT '',       -- วิธีการแก้ไข
  received_by   TEXT DEFAULT '',       -- ผู้รับปัญหา (staff.id)
  fixed_by      TEXT DEFAULT '',       -- ผู้แก้ไข (staff.id)
  fixed_date    DATE,                  -- วันที่แก้ไขปัญหา
  created_at    TIMESTAMPTZ DEFAULT NOW(),  -- วันที่รับปัญหา
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Migration: คอลัมน์ผู้แจ้งปัญหา (เพิ่มทีหลัง CREATE TABLE เดิม สำหรับ instance ที่สร้างตารางนี้ไปแล้ว) ──
ALTER TABLE impl_issues ADD COLUMN IF NOT EXISTS reported_by TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_impl_phases_project_id ON impl_phases (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_phase_id     ON impl_tasks (phase_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_project_id   ON impl_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_due_date     ON impl_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_impl_checklist_task_id  ON impl_checklist_items (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_comments_task_id   ON impl_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_attachments_task_id ON impl_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_impl_activity_project_id ON impl_activity_log (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_issues_project_id  ON impl_issues (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_issues_status      ON impl_issues (status);

-- ── Migration: ลิงก์ Public Dashboard รายโครงการ (impl-dashboard.html?t=<token>) — กด "🖼️ Dashboard"
-- ในแท็บ "ปัญหา" ของ Impl Tracker ครั้งแรกจะ generate token แบบสุ่มแล้วเก็บไว้ที่นี่ ให้เปิดดู/คัดลอกลิงก์
-- ไปนำเสนอนอกระบบได้โดยไม่ต้อง login (RLS ของ impl_projects เปิด anon อยู่แล้ว — token คือ "กุญแจ" ที่ทำให้
-- หน้า public เจาะจงได้แค่โครงการเดียว ไม่ใช่ตัว RLS เอง เหมือน helpdesk_tickets.access_token) ──
ALTER TABLE impl_projects ADD COLUMN IF NOT EXISTS dashboard_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_impl_projects_dash_token ON impl_projects (dashboard_token);

ALTER TABLE impl_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_phases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_activity_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE impl_issues          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'impl_templates','impl_projects','impl_phases','impl_tasks','impl_checklist_items',
    'impl_comments','impl_attachments','impl_activity_log','impl_issues'
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

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'impl_templates','impl_projects','impl_phases','impl_tasks','impl_checklist_items',
    'impl_comments','impl_attachments','impl_activity_log','impl_issues'
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

-- ── Storage bucket สำหรับไฟล์แนบของ Task (impl-tracker.service.js) ──
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('impl-attachments', 'impl-attachments', true)
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'DROP POLICY IF EXISTS "impl_bucket_all" ON storage.objects';
  EXECUTE 'CREATE POLICY "impl_bucket_all" ON storage.objects FOR ALL TO anon '
        || 'USING (bucket_id = ''impl-attachments'') WITH CHECK (bucket_id = ''impl-attachments'')';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ข้าม storage bucket/policy (%) — ให้สร้าง bucket impl-attachments (public) + policy anon เองใน Studio', SQLERRM;
END $$;

-- ================================================================
-- FORM TRACKER (form_tracker) — ส่วนย่อย "แบบฟอร์ม" ในหน้า "ติดตามโครงการติดตั้ง" (impl_tracker)
-- ไม่มี "โครงการแบบฟอร์ม" เป็นเอนทิตีของตัวเอง — ผูกตรงกับ impl_projects.id (project_id) เลย
-- เพราะเป็นข้อมูลของโครงการติดตั้งเดียวกัน ไม่ต้องมีโครงการซ้อนโครงการอีกชั้น
-- Group (คลัง) → Item (แบบฟอร์มแต่ละใบ) เป็นลำดับชั้นเดียว (ไม่มี Checklist/Comment/Attachment ซ้อนอีกชั้น
-- เพราะแบบฟอร์ม 1 ใบถือเป็นหน่วยเสร็จ/ไม่เสร็จเดียว)
-- ================================================================
DROP TABLE IF EXISTS form_projects CASCADE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_groups' AND column_name = 'form_project_id') THEN
    ALTER TABLE form_groups RENAME COLUMN form_project_id TO project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'form_items' AND column_name = 'form_project_id') THEN
    ALTER TABLE form_items RENAME COLUMN form_project_id TO project_id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS form_groups (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  group_name      TEXT DEFAULT '',
  sort_order      INTEGER DEFAULT 99,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_items (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  group_id        TEXT NOT NULL,
  form_name       TEXT DEFAULT '',
  form_type       TEXT DEFAULT '',
  status          TEXT DEFAULT 'not_started',
  owner           TEXT DEFAULT '',          -- ผู้จัดทำ (staff.id)
  received_date   DATE,
  description     TEXT DEFAULT '',
  sort_order      INTEGER DEFAULT 99,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Migration: เพิ่มคอลัมน์ "วันที่รับเอกสาร" ให้ตารางที่สร้างไปแล้วก่อนมีคอลัมน์นี้ ──
ALTER TABLE form_items ADD COLUMN IF NOT EXISTS received_date DATE;

-- ── Template: รายชื่อเอกสารแบบฟอร์มมาตรฐาน (ใช้ร่วมกันทุกโครงการ/ทุกคลัง — ไม่ผูกกับ project_id/group_id)
-- ตั้งไว้ล่วงหน้าเพื่อดึงมาเพิ่มเป็นแบบฟอร์มในคลังไหนก็ได้แบบเร็ว แทนพิมพ์ชื่อเองทีละใบ ──
CREATE TABLE IF NOT EXISTS form_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 99,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_groups_project_id ON form_groups (project_id);
CREATE INDEX IF NOT EXISTS idx_form_items_project_id  ON form_items (project_id);
CREATE INDEX IF NOT EXISTS idx_form_items_group_id    ON form_items (group_id);

ALTER TABLE form_groups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['form_groups','form_items','form_templates'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['form_groups','form_items','form_templates'];
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

-- ── Seed: รายชื่อเอกสารมาตรฐานงานจัดซื้อจัดจ้าง (แก้ไข/เพิ่ม/ลบเพิ่มเติมได้ภายหลังจากหน้า UI) ──
INSERT INTO form_templates (id, name, sort_order) VALUES
  ('FTPL01', 'ขออนุมัติแต่งตั้งคณะกรรมการจัดทำรายละเอียดคุณลักษณะเฉพาะ', 1),
  ('FTPL02', 'ขออนุมัติเบิกจ่ายเงิน', 2),
  ('FTPL03', 'ขออนุมัติประกาศผู้ชนะการเสนอราคา', 3),
  ('FTPL04', 'ขออนุมัติหลักการ', 4),
  ('FTPL05', 'คำสั่งแต่งตั้งคณะกรรมการจัดทำรายละเอียดคุณลักษณะเฉพาะ', 5),
  ('FTPL06', 'คำสั่งแต่งตั้งคณะกรรมการจัดทำรายละเอียดคุณลักษณะเฉพาะและคณะกรรมการตรวจรับพัสดุ', 6),
  ('FTPL07', 'คำสั่งแต่งตั้งคณะกรรมการตรวจรับพัสดุ', 7),
  ('FTPL08', 'บันทึกการต่อรองราคา', 8),
  ('FTPL09', 'แบบแสดงความบริสุทธิ์ใจในการจัดซื้อจัดจ้าง', 9),
  ('FTPL10', 'ใบตรวจรับพัสดุ', 10),
  ('FTPL11', 'ใบเบิกพัสดุ', 11),
  ('FTPL12', 'ใบส่งมอบงาน/พัสดุ', 12),
  ('FTPL13', 'ใบสั่งจ้าง', 13),
  ('FTPL14', 'ใบสั่งซื้อ', 14),
  ('FTPL15', 'ประกาศผู้ชนะการเสนอราคา', 15),
  ('FTPL16', 'รายงานขอซื้อขอจ้าง', 16),
  ('FTPL17', 'รายงานผลการจัดทำรายละเอียดคุณลักษณะเฉพาะ', 17),
  ('FTPL18', 'รายงานผลการตรวจรับพัสดุ', 18),
  ('FTPL19', 'รายงานผลการพิจารณาและขออนุมัติสั่งซื้อสั่งจ้าง', 19),
  ('FTPL20', 'รายละเอียดคุณลักษณะเฉพาะ', 20),
  ('FTPL21', 'รายละเอียดคุณลักษณะเฉพาะของพัสดุ', 21),
  ('FTPL22', 'รายละเอียดคุณลักษณะเฉพาะของยา', 22)
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- SITE FORMS — แบบฟอร์มหน้างาน 3 ประเภท (แจ้งเข้าปฏิบัติงาน / เคลียร์ค่าใช้จ่าย / แจ้งความจำนงเข้าดำเนินงาน)
-- เพิ่มผ่าน SQL Editor ตรงๆ ตอนแรก แล้วเพิ่งย้อนกลับมาบันทึกไว้ในไฟล์นี้ทีหลัง
-- ================================================================
CREATE TABLE IF NOT EXISTS expense_clearing_forms (
  id                    TEXT PRIMARY KEY,
  form_no               TEXT DEFAULT '',
  project_id            TEXT DEFAULT '',
  category_key          TEXT DEFAULT 'other',
  category_other_note   TEXT DEFAULT '',
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
  workers               JSONB DEFAULT '[]',
  others                JSONB DEFAULT '[]',
  total_amount          NUMERIC DEFAULT 0,
  note_schedule_signed  BOOLEAN DEFAULT false,
  note_letter_sent      BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_deploy_forms (
  id                      TEXT PRIMARY KEY,
  dept_key                TEXT DEFAULT 'other',
  dept_other_note         TEXT DEFAULT '',
  hospital_id             TEXT DEFAULT '',
  site_location            TEXT DEFAULT '',
  province                TEXT DEFAULT '',
  work_open_new_site      BOOLEAN DEFAULT false,
  work_per_contract       BOOLEAN DEFAULT false,
  work_other              BOOLEAN DEFAULT false,
  work_other_note         TEXT DEFAULT '',
  contract_no             TEXT DEFAULT '',
  work_revisit            BOOLEAN DEFAULT false,
  revisit_no              TEXT DEFAULT '',
  revisit_total           TEXT DEFAULT '',
  work_fix_issue          BOOLEAN DEFAULT false,
  work_close_contract     BOOLEAN DEFAULT false,
  customer_name           TEXT DEFAULT '',
  customer_dept           TEXT DEFAULT '',
  customer_email          TEXT DEFAULT '',
  customer_phone          TEXT DEFAULT '',
  preparation_notes       TEXT DEFAULT '',
  adv_slip_count          NUMERIC,
  adv_collected_amount    NUMERIC,
  adv_total_amount        NUMERIC,
  adv_remaining_amount    NUMERIC,
  adv_used_amount         NUMERIC,
  adv_uncleared_count     NUMERIC,
  preparer_name           TEXT DEFAULT '',
  preparer_date           DATE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_notice_forms (
  id                    TEXT PRIMARY KEY,
  doc_no                TEXT DEFAULT '',
  doc_date              DATE,
  requester_name        TEXT DEFAULT '',
  requester_position    TEXT DEFAULT '',
  requester_dept        TEXT DEFAULT '',
  attach_copies         TEXT DEFAULT '',
  attach_sheets         TEXT DEFAULT '',
  system_key            TEXT DEFAULT 'other',
  system_other_note     TEXT DEFAULT '',
  task_install          BOOLEAN DEFAULT false,
  task_revisit          BOOLEAN DEFAULT false,
  revisit_no            TEXT DEFAULT '',
  revisit_total         TEXT DEFAULT '',
  task_reply_lecturer   BOOLEAN DEFAULT false,
  task_ma               BOOLEAN DEFAULT false,
  ma_no                 TEXT DEFAULT '',
  ma_total              TEXT DEFAULT '',
  task_present          BOOLEAN DEFAULT false,
  present_type          TEXT DEFAULT '',
  task_other            BOOLEAN DEFAULT false,
  task_other_note       TEXT DEFAULT '',
  task_survey           BOOLEAN DEFAULT false,
  task_delivery         BOOLEAN DEFAULT false,
  delivery_no           TEXT DEFAULT '',
  delivery_total        TEXT DEFAULT '',
  task_copydata         BOOLEAN DEFAULT false,
  copydata_status       TEXT DEFAULT '',
  work_start            DATE,
  work_end              DATE,
  office_work_start     DATE,
  office_work_end       DATE,
  site_location          TEXT DEFAULT '',
  attendees             JSONB DEFAULT '[]',
  addressee_key         TEXT DEFAULT 'hospital_director',
  addressee_other_note  TEXT DEFAULT '',
  purpose_key           TEXT DEFAULT 'inform',
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

CREATE INDEX IF NOT EXISTS idx_ecf_project_id  ON expense_clearing_forms (project_id);
CREATE INDEX IF NOT EXISTS idx_ecf_created_at  ON expense_clearing_forms (created_at);
CREATE INDEX IF NOT EXISTS idx_sdf_hospital_id ON site_deploy_forms (hospital_id);
CREATE INDEX IF NOT EXISTS idx_sdf_created_at  ON site_deploy_forms (created_at);
CREATE INDEX IF NOT EXISTS idx_snl_created_at  ON site_notice_forms (created_at);

-- ── Migration: ช่วงวันที่ทำงานที่บริษัท (เตรียมงานก่อนออกไซต์) — แสดงเป็นบรรทัด "วันที่ดำเนินงาน ... สถานที่
-- บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด" แยกต่างหาก อยู่บนสุดเหนือบรรทัด work_start/work_end (สถานที่ปลายทาง)
-- เดิมในเอกสารพิมพ์ — ไม่บังคับกรอก เว้นว่างได้ถ้าไม่มีช่วงเตรียมงานที่บริษัทก่อนออกไซต์ ──
ALTER TABLE site_notice_forms ADD COLUMN IF NOT EXISTS office_work_start DATE;
ALTER TABLE site_notice_forms ADD COLUMN IF NOT EXISTS office_work_end DATE;

ALTER TABLE expense_clearing_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_deploy_forms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_notice_forms      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['expense_clearing_forms','site_deploy_forms','site_notice_forms'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['expense_clearing_forms','site_deploy_forms','site_notice_forms'];
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

-- ================================================================
-- HELPDESK — ศูนย์ช่วยเหลือ (เก็บเฉพาะปัญหาลูกค้า / โรงพยาบาล)
-- โมดูล 'helpdesk' ในแอป + หน้า public docs/help.html (ติดตาม + ประเมินผ่านลิงก์ token)
-- idempotent — รันซ้ำได้ทั้งไฟล์ (เหมือน section SITE FORMS ด้านบน)
-- ================================================================
CREATE TABLE IF NOT EXISTS helpdesk_categories (
  id                   TEXT PRIMARY KEY,
  name                 TEXT DEFAULT '',
  parent_id            TEXT DEFAULT '',
  default_priority     TEXT DEFAULT 'p3',
  default_assignee_id  TEXT DEFAULT '',
  active               BOOLEAN DEFAULT true,
  sort                 NUMERIC DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_sla_policies (
  id                    TEXT PRIMARY KEY,
  priority              TEXT UNIQUE,
  first_response_mins   NUMERIC DEFAULT 240,   -- นาทีทำการ (business_hours_only=true) หรือ นาทีปฏิทิน (false)
  resolution_mins       NUMERIC DEFAULT 4320,  -- 1 วันทำการ = 540 นาที (08:30–17:30)
  business_hours_only   BOOLEAN DEFAULT true,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id                     TEXT PRIMARY KEY,
  ticket_no              TEXT UNIQUE,
  channel                TEXT DEFAULT 'line',      -- line | web | phone | import
  hospital_id            TEXT DEFAULT '',          -- FK hospitals.id (บังคับในระดับแอป)
  reporter_name          TEXT DEFAULT '',
  reporter_phone         TEXT DEFAULT '',
  reporter_email         TEXT DEFAULT '',
  reporter_position      TEXT DEFAULT '',
  reporter_dept          TEXT DEFAULT '',
  line_group_ref         TEXT DEFAULT '',
  source_system          TEXT DEFAULT '',
  category_id            TEXT DEFAULT '',
  subject                TEXT DEFAULT '',
  description            TEXT DEFAULT '',
  priority               TEXT DEFAULT 'p3',        -- p1 | p2 | p3 | p4
  status                 TEXT DEFAULT 'new',       -- new triage assigned in_progress pending_user resolved closed reopened cancelled
  assignee_id            TEXT DEFAULT '',          -- FK staff.id
  sla_policy_id          TEXT DEFAULT '',
  first_response_at      TIMESTAMPTZ,
  first_response_due     TIMESTAMPTZ,
  resolution_due         TIMESTAMPTZ,
  resolved_at            TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ,
  pending_since          TIMESTAMPTZ,
  pending_total_mins     NUMERIC DEFAULT 0,
  frt_breached           BOOLEAN DEFAULT false,
  resolution_breached    BOOLEAN DEFAULT false,
  reopened_count         NUMERIC DEFAULT 0,
  csat_score             NUMERIC,                  -- cache จาก helpdesk_ratings (1–5)
  access_token           TEXT UNIQUE,              -- กุญแจลิงก์ help.html?t=<token>
  public_view_expires_at TIMESTAMPTZ,
  rated_at               TIMESTAMPTZ,
  tags                   JSONB DEFAULT '[]',
  created_by             TEXT DEFAULT '',          -- staff.id ที่กด "+ แจ้งแทน" ('' = ลูกค้ากรอกฟอร์มเว็บเอง)
  call_joined_at         TIMESTAMPTZ,              -- เวลาที่ลูกค้ากดเข้าห้องคุยสด Jitsi สำเร็จจริง (ปุ่ม "โทรด่วน")
  agent_last_read_at     TIMESTAMPTZ,              -- เวลาล่าสุดที่ทีมงานเปิดอ่านข้อความจากผู้แจ้ง
  reporter_last_read_at  TIMESTAMPTZ,              -- เวลาล่าสุดที่ผู้แจ้งเปิดอ่านข้อความจากทีมงาน
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_ticket_events (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT DEFAULT '',
  type         TEXT DEFAULT 'comment',   -- comment status_change assignment field_change attachment rating system
  actor_type   TEXT DEFAULT 'agent',     -- reporter | agent | ai | system
  actor_id     TEXT DEFAULT '',
  body         TEXT DEFAULT '',
  meta         JSONB DEFAULT '{}',
  is_internal  BOOLEAN DEFAULT false,    -- true = โน้ตภายใน ไม่แสดงใน help.html
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_attachments (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT DEFAULT '',
  event_id     TEXT DEFAULT '',
  file_name    TEXT DEFAULT '',
  file_url     TEXT DEFAULT '',
  mime         TEXT DEFAULT '',
  size_bytes   NUMERIC DEFAULT 0,
  uploaded_by  TEXT DEFAULT '',             -- users.id
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helpdesk_ratings (
  id                TEXT PRIMARY KEY,
  ticket_id         TEXT UNIQUE,
  score             NUMERIC DEFAULT 0,     -- 1–5
  comment           TEXT DEFAULT '',
  would_recommend   BOOLEAN,
  via_token         TEXT DEFAULT '',
  ip_hash           TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hd_tickets_status     ON helpdesk_tickets (status);
CREATE INDEX IF NOT EXISTS idx_hd_tickets_assignee   ON helpdesk_tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_hd_tickets_hospital   ON helpdesk_tickets (hospital_id);
CREATE INDEX IF NOT EXISTS idx_hd_tickets_token      ON helpdesk_tickets (access_token);
CREATE INDEX IF NOT EXISTS idx_hd_tickets_created_at ON helpdesk_tickets (created_at);
CREATE INDEX IF NOT EXISTS idx_hd_events_ticket_id   ON helpdesk_ticket_events (ticket_id);

ALTER TABLE helpdesk_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_sla_policies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_ticket_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_ratings        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['helpdesk_categories','helpdesk_sla_policies','helpdesk_tickets','helpdesk_ticket_events','helpdesk_attachments','helpdesk_ratings'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['helpdesk_categories','helpdesk_sla_policies','helpdesk_tickets','helpdesk_ticket_events','helpdesk_attachments','helpdesk_ratings'];
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

-- ── Seed: SLA policy เริ่มต้น (แก้ตัวเลขได้ภายหลัง) ──
-- resolution_mins คิดเป็น "นาทีทำการ" เมื่อ business_hours_only=true (1 วันทำการ = 540 นาที)
INSERT INTO helpdesk_sla_policies (id, priority, first_response_mins, resolution_mins, business_hours_only) VALUES
  ('SLA_P1', 'p1',   30,  240, false),
  ('SLA_P2', 'p2',   60,  540, true),
  ('SLA_P3', 'p3',  240, 1620, true),
  ('SLA_P4', 'p4',  540, 3780, true)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: หมวดปัญหาเริ่มต้น (แก้ไข/เพิ่ม/ลบผ่าน DB ได้ภายหลัง) ──
INSERT INTO helpdesk_categories (id, name, default_priority, sort) VALUES
  ('CAT_LOGIN',   'เข้าใช้งาน / ล็อกอินไม่ได้',        'p2', 1),
  ('CAT_HOSXP',   'BMS-HOSxP / XE ทำงานผิดปกติ',       'p2', 2),
  ('CAT_REPORT',  'รายงาน / พิมพ์เอกสาร',              'p3', 3),
  ('CAT_DATA',    'ข้อมูลผิดพลาด / ขอแก้ไขข้อมูล',     'p3', 4),
  ('CAT_HOWTO',   'สอบถามวิธีใช้งาน',                  'p4', 5),
  ('CAT_REQUEST', 'ขอปรับแต่ง / เพิ่มความสามารถ',      'p4', 6),
  ('CAT_OTHER',   'อื่น ๆ',                            'p3', 9)
ON CONFLICT (id) DO NOTHING;

-- ── Migration: คอลัมน์เก็บ override ป้าย/สี ของ Priority / สถานะ / ความเร่งด่วน HelpDesk
-- (id ชุดคงที่ตาย logic SLA/workflow อยู่ — Admin ปรับได้แค่ label/color/icon ไม่ใช่เพิ่ม-ลบรายการ) ──
ALTER TABLE settings ADD COLUMN IF NOT EXISTS helpdesk_priority_overrides JSONB DEFAULT '{}';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS helpdesk_status_overrides   JSONB DEFAULT '{}';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS helpdesk_urgency_overrides  JSONB DEFAULT '{}';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS helpdesk_ai_auto_reply JSONB DEFAULT '{}';

-- ── Migration: ปุ่ม "โทรด่วน" (Jitsi) — เก็บเวลาที่ลูกค้ากดเข้าห้องคุยสดสำเร็จจริง
-- ใช้แยกแยะ "กดปุ่ม" กับ "เข้าห้องสำเร็จ" เพื่อยิง BMS Notify เฉพาะตอนเข้าห้องจริง ──
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS call_joined_at TIMESTAMPTZ;

-- ── Migration: ใบตอบรับการอ่านสองทางในแชทหน้า Helpdesk
-- อัปเดตเมื่อทีมงาน/ผู้แจ้งเปิดบทสนทนาที่มีข้อความใหม่จากอีกฝั่ง (ไม่แก้ updated_at ของ Ticket) ──
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS agent_last_read_at TIMESTAMPTZ;
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS reporter_last_read_at TIMESTAMPTZ;

-- ── Migration: token แจ้งเตือน Helpdesk (ตั๋วด่วนที่สุด / ลูกค้าเข้าห้องคุยสดแล้ว) — ตั้งค่าที่
-- Admin Panel → 🔔 ตั้งค่าการแจ้งเตือน เหมือน notify_token/notify_advance_token/notify_project_token
-- หมายเหตุ: RLS ของตารางนี้เปิดกว้าง (FOR ALL TO anon) เหมือน 3 token เดิม — anon key รู้ค่านี้ได้
-- ถ้า query ตรง (ความเสี่ยงเดิมของโปรเจกต์ ไม่ใช่สิ่งใหม่ที่ token นี้เพิ่มขึ้นมา) ──
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_helpdesk_token TEXT DEFAULT '';

-- ── Migration: token กลาง แจ้งเตือนเมื่อมีคนลงทะเบียนอบรม (ใช้กับทุกโครงการ) — ตั้งค่าที่ Admin Panel → 🔔 ตั้งค่าการแจ้งเตือน
-- โครงการที่ต้องการแยกกลุ่ม/ปิดแจ้งเตือน ตั้งทับได้ที่ ⚙️ ตั้งค่าโครงการ (trn_settings.site_notify_tokens) ──
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_training_token TEXT DEFAULT '';

-- ── Storage bucket สำหรับไฟล์แนบ HelpDesk (รูปหน้าจอ / ไฟล์ error) ──
-- ต้องมี schema `storage` ของ Storage service อยู่แล้ว (self-hosted Supabase stack)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('helpdesk', 'helpdesk', true)
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'DROP POLICY IF EXISTS "hd_bucket_all" ON storage.objects';
  EXECUTE 'CREATE POLICY "hd_bucket_all" ON storage.objects FOR ALL TO anon '
        || 'USING (bucket_id = ''helpdesk'') WITH CHECK (bucket_id = ''helpdesk'')';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ข้าม storage bucket/policy (%) — ให้สร้าง bucket helpdesk (public) + policy anon เองใน Studio', SQLERRM;
END $$;

-- ── ลบ Gemini API Key เดิม (สรุปด้วย AI ใน Impl Tracker เปลี่ยนไปใช้ vLLM ภายในที่ไม่ต้องใช้คีย์แล้ว) ──
ALTER TABLE settings DROP COLUMN IF EXISTS imt_ai_key;

-- ── "ลืมรหัสผ่าน?" หน้า Login → ส่งคำขอถึง Admin (กระดิ่งแจ้งเตือน + ป้ายในรายชื่อผู้ใช้)
-- ล้างเป็น NULL เมื่อ Admin ตั้งรหัสใหม่ให้ ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS pw_reset_requested_at TIMESTAMPTZ;

-- ── ระดับตำแหน่ง (1 = สูงสุด, 99 = ไม่กำหนด) — เรียงรายชื่อพนักงานจากตำแหน่งสูงสุดก่อน ──
ALTER TABLE positions ADD COLUMN IF NOT EXISTS rank INTEGER DEFAULT 99;

-- ================================================================
-- ผู้ช่วยทีม (โมดูล 'assist') — คลังข้อความ/โค้ดที่ทีมเก็บไว้ พิมพ์ถามในหน้าแชทแล้วได้คำตอบกลับ
-- AI แค่ "เลือก" รายการที่ตรงคำถาม เนื้อหาที่แสดงดึงจากตารางนี้ตรงตัว (AI ไม่แก้โค้ด) · idempotent รันซ้ำได้
-- ================================================================
CREATE TABLE IF NOT EXISTS assist_replies (
  id          TEXT PRIMARY KEY,
  title       TEXT DEFAULT '',
  command     TEXT DEFAULT '',       -- คำสั่งลัด เช่น /update-hosxp (ไม่บังคับ)
  keywords    TEXT DEFAULT '',       -- คำที่ใช้เรียก คั่นด้วย , เช่น "อัปเดต hosxp, เปลี่ยนเวอร์ชัน"
  category    TEXT DEFAULT '',
  content     TEXT DEFAULT '',       -- ข้อความ — โค้ดครอบด้วย ``` จะแสดงเป็นกล่องโค้ดพร้อมปุ่มคัดลอก
  note        TEXT DEFAULT '',       -- คำเตือนก่อนใช้ เช่น "สำรองฐานข้อมูลก่อนรัน"
  active      BOOLEAN DEFAULT true,
  created_by  TEXT DEFAULT '',             -- users.id
  updated_by  TEXT DEFAULT '',             -- users.id
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assist_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_assist_replies" ON assist_replies;
CREATE POLICY "anon_all_assist_replies" ON assist_replies FOR ALL TO anon USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'assist_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE assist_replies;
  END IF;
END $$;

-- ================================================================
-- HELPDESK — แผนจัดการปัญหาที่พบซ้ำ (แท็บ "🔁 ปัญหาซ้ำ" ในศูนย์ช่วยเหลือ)
-- 1 แถว = 1 กลุ่มปัญหาที่วิเคราะห์แล้ว: สาเหตุ + แผนดำเนินการ + ผู้รับผิดชอบ + ติดตามผล
-- ผูกกับกลุ่มด้วย group_key และ ticket_ids (Ticket ในกลุ่มตอนบันทึก — ใช้จับคู่กลุ่มเดิมเมื่อช่วงเวลาเลื่อน
-- และนับ "เกิดซ้ำหลังเริ่มแผน") · idempotent รันซ้ำได้
-- ================================================================
CREATE TABLE IF NOT EXISTS helpdesk_problems (
  id             TEXT PRIMARY KEY,
  group_key      TEXT DEFAULT '',        -- ai:/sim:<ticket id ตัวแทนกลุ่ม>
  title          TEXT DEFAULT '',
  category_id    TEXT DEFAULT '',        -- helpdesk_categories.id
  source_system  TEXT DEFAULT '',
  ticket_ids     JSONB DEFAULT '[]',     -- helpdesk_tickets.id
  hospital_ids   JSONB DEFAULT '[]',     -- hospitals.id
  root_cause     TEXT DEFAULT '',        -- สาเหตุ / ผลการวิเคราะห์
  plan_type      TEXT DEFAULT '',        -- fix | config | training | manual | dev | monitor
  action_plan    TEXT DEFAULT '',
  owner_id       TEXT DEFAULT '',        -- staff.id
  due_date       DATE,
  status         TEXT DEFAULT 'analyzing', -- analyzing | planned | in_progress | done | monitoring
  result         TEXT DEFAULT '',        -- ผลลัพธ์ / ติดตามผล
  created_by     TEXT DEFAULT '',        -- users.id
  updated_by     TEXT DEFAULT '',        -- users.id
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE helpdesk_problems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_helpdesk_problems" ON helpdesk_problems;
CREATE POLICY "anon_all_helpdesk_problems" ON helpdesk_problems FOR ALL TO anon USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'helpdesk_problems'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helpdesk_problems;
  END IF;
END $$;

-- ================================================================
-- WEB PUSH — device subscriptions + durable delivery queue
-- ตัวส่ง (push-worker) รันอยู่ใน frontend container เดียวกับ nginx — ไม่ต้องตั้งค่าบน server เพิ่ม
-- VAPID private key คำนวณจากรหัสลับ push-worker/worker.secret (ฝังใน image ตอน build, ไม่อยู่ใน git)
-- ไม่เคยถูกเขียนลงฐานข้อมูล · ฐานข้อมูลเก็บแค่ public key · RPC ของตัวส่งต้องแนบรหัสลับนั้น
-- เปลี่ยนรหัสลับ → แก้ hash ใน _web_push_worker_check แล้วรันส่วนนี้ใหม่ (ผู้ใช้ต้องกดเปิดแจ้งเตือนใหม่)
-- ================================================================
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id          TEXT PRIMARY KEY,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_id     TEXT DEFAULT '',
  user_name   TEXT DEFAULT '',
  user_agent  TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_web_push_subscriptions" ON web_push_subscriptions;
-- No anon table policy: subscriptions contain device endpoints and may only be
-- read by service_role. Browsers register/unregister through write-only RPCs.

CREATE OR REPLACE FUNCTION register_web_push_subscription(
  p_id TEXT, p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT,
  p_user_id TEXT, p_user_name TEXT, p_user_agent TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO web_push_subscriptions
    (id, endpoint, p256dh, auth, user_id, user_name, user_agent, active, updated_at)
  VALUES
    (p_id, p_endpoint, p_p256dh, p_auth, p_user_id, p_user_name, p_user_agent, true, NOW())
  ON CONFLICT (id) DO UPDATE SET
    endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name,
    user_agent = EXCLUDED.user_agent, active = true, updated_at = NOW();
END $$;

CREATE OR REPLACE FUNCTION unregister_web_push_subscription(p_id TEXT, p_endpoint TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM web_push_subscriptions WHERE id = p_id AND endpoint = p_endpoint;
END $$;

REVOKE ALL ON FUNCTION register_web_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION unregister_web_push_subscription(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_web_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION unregister_web_push_subscription(TEXT, TEXT) TO anon;

CREATE TABLE IF NOT EXISTS web_push_jobs (
  id               TEXT PRIMARY KEY,
  source_type      TEXT NOT NULL,
  source_id        TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  last_error       TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_type, source_id)
);

ALTER TABLE web_push_jobs ENABLE ROW LEVEL SECURITY;
-- No anon policy: only database triggers and the worker RPCs below may access jobs.

-- เก็บแค่ public key (เปิดเผยได้) — private key อยู่ในตัวส่งเท่านั้น
CREATE TABLE IF NOT EXISTS web_push_config (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  public_key  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE web_push_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_web_push_public_key()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public_key FROM web_push_config WHERE id = 'main';
$$;

-- ตรวจรหัสลับของตัวส่ง (เทียบ SHA-256 ของ push-worker/worker.secret)
CREATE OR REPLACE FUNCTION _web_push_worker_check(p_secret TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF encode(sha256(convert_to(COALESCE(p_secret, ''), 'UTF8')), 'hex')
     <> 'bbfa9a22aa9f28fc5a0730cdf05a8a4fbf34bf9b0f020794fa3dc27b58d55388' THEN
    RAISE EXCEPTION 'web push worker: forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

-- ตัวส่ง: ประกาศ public key ที่ใช้อยู่ ให้หน้าเว็บนำไปขอรับการแจ้งเตือน
CREATE OR REPLACE FUNCTION web_push_worker_init(p_secret TEXT, p_public TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  INSERT INTO web_push_config (id, public_key) VALUES ('main', p_public)
  ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = NOW()
  WHERE web_push_config.public_key IS DISTINCT FROM EXCLUDED.public_key;
END $$;

-- ตัวส่ง: จองงานที่ถึงเวลา (ค้าง processing เกิน 5 นาที = container ดับกลางทาง → คืนเข้าคิว)
CREATE OR REPLACE FUNCTION web_push_worker_claim(p_secret TEXT, p_limit INTEGER DEFAULT 20)
RETURNS SETOF web_push_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE web_push_jobs SET status = 'pending'
   WHERE status = 'processing' AND next_attempt_at < NOW() - INTERVAL '5 minutes';
  RETURN QUERY
  UPDATE web_push_jobs j SET status = 'processing', attempts = j.attempts + 1, next_attempt_at = NOW()
   WHERE j.id IN (SELECT q.id FROM web_push_jobs q
                   WHERE q.status = 'pending' AND q.next_attempt_at <= NOW()
                   ORDER BY q.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;

-- ตัวส่ง: ปิดงาน — ล้มเหลวลองใหม่แบบเว้นระยะ (15 วิ → สูงสุด 15 นาที) ครบ 5 ครั้ง = failed
CREATE OR REPLACE FUNCTION web_push_worker_finish(p_secret TEXT, p_id TEXT, p_ok BOOLEAN, p_error TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE web_push_jobs SET
    status = CASE WHEN p_ok THEN 'sent' WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
    processed_at = CASE WHEN p_ok THEN NOW() ELSE processed_at END,
    next_attempt_at = CASE WHEN p_ok THEN next_attempt_at
      ELSE NOW() + LEAST(INTERVAL '15 minutes', INTERVAL '15 seconds' * POWER(2, GREATEST(attempts - 1, 0))) END,
    last_error = LEFT(COALESCE(p_error, ''), 1000)
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION web_push_worker_subscriptions(p_secret TEXT)
RETURNS TABLE (id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  RETURN QUERY SELECT s.id, s.endpoint, s.p256dh, s.auth FROM web_push_subscriptions s WHERE s.active;
END $$;

-- ตัวส่ง: endpoint หมดอายุ (404/410) → ปิดไว้
CREATE OR REPLACE FUNCTION web_push_worker_drop(p_secret TEXT, p_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE web_push_subscriptions SET active = false, updated_at = NOW() WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION get_web_push_public_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION web_push_worker_init(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION web_push_worker_claim(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION web_push_worker_finish(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION web_push_worker_subscriptions(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION web_push_worker_drop(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_web_push_public_key() TO anon;
GRANT EXECUTE ON FUNCTION web_push_worker_init(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION web_push_worker_claim(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION web_push_worker_finish(TEXT, TEXT, BOOLEAN, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION web_push_worker_subscriptions(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION web_push_worker_drop(TEXT, TEXT) TO anon;

CREATE OR REPLACE FUNCTION queue_helpdesk_ticket_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.created_by, '') = '' THEN
    INSERT INTO web_push_jobs (id, source_type, source_id, payload)
    VALUES (
      'ticket:' || NEW.id,
      'ticket', NEW.id,
      jsonb_build_object(
        'title', 'Ticket ใหม่ ' || COALESCE(NEW.ticket_no, ''),
        'body', COALESCE(NULLIF(NEW.reporter_name, ''), 'ผู้แจ้ง') || ': ' || LEFT(COALESCE(NEW.description, NEW.subject, 'แจ้งปัญหาใหม่'), 180),
        'tag', 'helpdesk-ticket-' || NEW.id,
        'ticketId', NEW.id
      )
    ) ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_helpdesk_ticket_web_push ON helpdesk_tickets;
CREATE TRIGGER trg_helpdesk_ticket_web_push
AFTER INSERT ON helpdesk_tickets
FOR EACH ROW EXECUTE FUNCTION queue_helpdesk_ticket_push();

CREATE OR REPLACE FUNCTION queue_helpdesk_message_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_no TEXT := '';
  r_name TEXT := '';
BEGIN
  IF NEW.type = 'comment' AND NEW.actor_type = 'reporter' THEN
    SELECT COALESCE(ticket_no, ''), COALESCE(reporter_name, '')
      INTO t_no, r_name FROM helpdesk_tickets WHERE id = NEW.ticket_id;
    INSERT INTO web_push_jobs (id, source_type, source_id, payload)
    VALUES (
      'message:' || NEW.id,
      'message', NEW.id,
      jsonb_build_object(
        'title', 'ข้อความใหม่ ' || t_no,
        'body', COALESCE(NULLIF(r_name, ''), 'ผู้แจ้ง') || ': ' || LEFT(COALESCE(NULLIF(NEW.body, ''), 'ส่งไฟล์แนบ'), 180),
        'tag', 'helpdesk-ticket-' || NEW.ticket_id,
        'ticketId', NEW.ticket_id
      )
    ) ON CONFLICT (source_type, source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_helpdesk_message_web_push ON helpdesk_ticket_events;
CREATE TRIGGER trg_helpdesk_message_web_push
AFTER INSERT ON helpdesk_ticket_events
FOR EACH ROW EXECUTE FUNCTION queue_helpdesk_message_push();

-- ================================================================
-- HELPDESK AI AUTO REPLY — durable queue + audit log
-- ใช้ worker.secret เดียวกับ Web Push แต่แยกคิว/สถานะออกจากกัน
-- ไม่มี anon table policy: worker เข้าถึงผ่าน RPC ที่ตรวจ secret เท่านั้น
-- ================================================================
CREATE TABLE IF NOT EXISTS helpdesk_ai_reply_jobs (
  id                TEXT PRIMARY KEY,
  inbound_event_id  TEXT NOT NULL UNIQUE,
  ticket_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending processing sent skipped failed
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  last_error        TEXT DEFAULT '',
  skip_reason       TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_ai_jobs_due ON helpdesk_ai_reply_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_hd_ai_jobs_ticket ON helpdesk_ai_reply_jobs (ticket_id, created_at);
ALTER TABLE helpdesk_ai_reply_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_helpdesk_ai_reply_jobs" ON helpdesk_ai_reply_jobs;

CREATE TABLE IF NOT EXISTS helpdesk_ai_audit_logs (
  id                TEXT PRIMARY KEY,
  job_id            TEXT DEFAULT '',
  ticket_id         TEXT DEFAULT '',
  inbound_event_id  TEXT DEFAULT '',
  action            TEXT NOT NULL DEFAULT '',       -- sent skipped error
  reason            TEXT DEFAULT '',
  confidence        TEXT DEFAULT '',
  response_kind     TEXT DEFAULT '',
  model             TEXT DEFAULT '',
  raw_response      TEXT DEFAULT '',                -- ผลดิบชั่วคราว; cleanup ล้างเร็วกว่าตัว audit
  metadata          JSONB DEFAULT '{}',
  raw_expires_at    TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hd_ai_audit_expiry ON helpdesk_ai_audit_logs (expires_at);
ALTER TABLE helpdesk_ai_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_helpdesk_ai_audit_logs" ON helpdesk_ai_audit_logs;

-- ลูกค้าส่งข้อความใหม่ → ยกเลิกคิวเก่าที่ยังไม่เริ่ม แล้วสร้างงานของข้อความล่าสุด
CREATE OR REPLACE FUNCTION queue_helpdesk_ai_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'comment' AND NEW.actor_type = 'reporter' AND NOT COALESCE(NEW.is_internal, false) THEN
    UPDATE helpdesk_ai_reply_jobs SET
      status = 'skipped', skip_reason = 'superseded_by_newer_customer_message',
      processed_at = NOW(), updated_at = NOW()
    WHERE ticket_id = NEW.ticket_id AND status = 'pending';

    INSERT INTO helpdesk_ai_reply_jobs (id, inbound_event_id, ticket_id, next_attempt_at)
    VALUES ('ai:' || NEW.id, NEW.id, NEW.ticket_id, NOW())
    ON CONFLICT (inbound_event_id) DO NOTHING;
  ELSIF NEW.type = 'comment' AND NEW.actor_type = 'agent' AND NOT COALESCE(NEW.is_internal, false) THEN
    UPDATE helpdesk_ai_reply_jobs SET
      status = 'skipped', skip_reason = 'human_replied_first',
      processed_at = NOW(), updated_at = NOW()
    WHERE ticket_id = NEW.ticket_id AND status IN ('pending','processing');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_helpdesk_ai_reply_queue ON helpdesk_ticket_events;
CREATE TRIGGER trg_helpdesk_ai_reply_queue
AFTER INSERT ON helpdesk_ticket_events
FOR EACH ROW EXECUTE FUNCTION queue_helpdesk_ai_reply();

-- Ticket ที่ลูกค้าสร้างผ่านฟอร์มมีรายละเอียดอยู่บนตัว Ticket (ยังไม่มี comment แรก)
CREATE OR REPLACE FUNCTION queue_helpdesk_ai_new_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.created_by, '') = '' AND COALESCE(NEW.channel, 'web') <> 'import' THEN
    INSERT INTO helpdesk_ai_reply_jobs (id, inbound_event_id, ticket_id, next_attempt_at)
    VALUES ('ai:ticket:' || NEW.id, 'ticket:' || NEW.id, NEW.id, NOW())
    ON CONFLICT (inbound_event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_helpdesk_ai_new_ticket ON helpdesk_tickets;
CREATE TRIGGER trg_helpdesk_ai_new_ticket
AFTER INSERT ON helpdesk_tickets
FOR EACH ROW EXECUTE FUNCTION queue_helpdesk_ai_new_ticket();

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_claim(p_secret TEXT, p_limit INTEGER DEFAULT 5)
RETURNS SETOF helpdesk_ai_reply_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE helpdesk_ai_reply_jobs SET status = 'pending', updated_at = NOW()
   WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes';
  RETURN QUERY
  UPDATE helpdesk_ai_reply_jobs j SET
    status = 'processing', attempts = j.attempts + 1, updated_at = NOW()
  WHERE j.id IN (
    SELECT q.id FROM helpdesk_ai_reply_jobs q
    WHERE q.status = 'pending' AND q.next_attempt_at <= NOW()
    ORDER BY q.created_at LIMIT LEAST(GREATEST(p_limit, 1), 20)
    FOR UPDATE SKIP LOCKED
  ) RETURNING j.*;
END $$;

-- ── คลังความรู้กลางของ AI ทุกจุด (ตอบอัตโนมัติ · AI ช่วยวิเคราะห์ · ร่างข้อความตอบ · แนะนำปัญหาโครงการ) ──
-- รวมทุกแหล่งในที่เดียว · การค้น/จัดอันดับอยู่ใน docs/src/services/ai-knowledge.js (ใช้ทั้งหน้าเว็บและ worker)
-- tickets: ทุกใบ (ยกเว้นยกเลิก) + วิธีแก้ที่บันทึก "วิธีแก้ไข:" + คำตอบทีมงาน (ไม่รวมโน้ตภายใน)
-- impl: ปัญหาทุกโครงการติดตั้ง ทั้งที่มี/ยังไม่มีวิธีแก้ · assist: ข้อความตอบกลับของผู้ช่วยทีม · problems: ปัญหาที่พบซ้ำ
-- ข้อมูลทุกตารางนี้ anon อ่านได้อยู่แล้ว (RLS anon_all) จึงเปิดให้หน้าเว็บเรียกได้โดยไม่เพิ่มสิทธิ์
CREATE OR REPLACE FUNCTION ai_knowledge_corpus()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tickets', COALESCE((
      SELECT jsonb_agg(to_jsonb(r0)) FROM (
        SELECT rt.id, rt.ticket_no, rt.subject, LEFT(rt.description, 600) AS description,
               rt.source_system, rt.category_id, rt.status,
               COALESCE((SELECT LEFT(regexp_replace(ke.body, '^วิธีแก้ไข\s*[:：]\s*', '', 'i'), 900)
                 FROM helpdesk_ticket_events ke
                 WHERE ke.ticket_id = rt.id AND ke.type = 'comment' AND ke.body ~* '^วิธีแก้ไข\s*[:：]'
                 ORDER BY ke.created_at DESC LIMIT 1), '') AS fix,
               COALESCE((SELECT LEFT(string_agg(re.body, ' / ' ORDER BY re.created_at), 900)
                 FROM helpdesk_ticket_events re
                 WHERE re.ticket_id = rt.id AND re.type = 'comment' AND re.actor_type = 'agent'
                   AND NOT COALESCE(re.is_internal, false) AND length(re.body) >= 15
                   AND re.body !~* '^วิธีแก้ไข\s*[:：]'), '') AS replies
        FROM helpdesk_tickets rt
        WHERE rt.status <> 'cancelled'
        ORDER BY rt.created_at DESC LIMIT 5000
      ) r0
    ), '[]'::jsonb),
    'impl', COALESCE((
      SELECT jsonb_agg(to_jsonb(i0)) FROM (
        SELECT ii.id, ii.project_id, LEFT(ii.problem, 600) AS problem, LEFT(COALESCE(ii.solution, ''), 900) AS solution,
               ii.category, ii.department, ii.status
        FROM impl_issues ii
        WHERE COALESCE(ii.problem, '') <> ''
        ORDER BY ii.updated_at DESC NULLS LAST LIMIT 5000
      ) i0
    ), '[]'::jsonb),
    'assist', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ar.id, 'title', ar.title, 'keywords', ar.keywords, 'category', ar.category,
        'content', LEFT(ar.content, 1200), 'note', ar.note))
      FROM assist_replies ar WHERE ar.active AND COALESCE(ar.content, '') <> ''
    ), '[]'::jsonb),
    'problems', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', hp.id, 'title', hp.title, 'source_system', hp.source_system, 'status', hp.status,
        'root_cause', LEFT(hp.root_cause, 600), 'action_plan', LEFT(hp.action_plan, 600), 'result', LEFT(hp.result, 400)))
      FROM helpdesk_problems hp WHERE COALESCE(hp.title, '') <> ''
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION ai_knowledge_corpus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_knowledge_corpus() TO anon, authenticated;

-- ── ข้อมูลของโรงพยาบาลผู้แจ้ง ให้ AI ใช้ประกอบนอกเหนือจากคลังความรู้ ──
-- ระบบที่ใช้ · โครงการติดตั้ง/สถานะ · Ticket ก่อนหน้าของ รพ. เดียวกัน (+คำตอบทีม) · ปัญหาในโครงการของ รพ. นี้
-- ไม่ส่ง hospitals.systems (รหัสผ่าน/AnyDesk/ฐานข้อมูล) และไม่ส่งรายชื่อผู้ติดต่อ
CREATE OR REPLACE FUNCTION ai_hospital_context(p_hospital_id TEXT, p_exclude_ticket TEXT DEFAULT '')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN COALESCE(p_hospital_id, '') = '' THEN '{}'::jsonb ELSE jsonb_build_object(
    'type', h.type, 'beds', h.beds, 'province', h.province,
    'products', COALESCE((SELECT jsonb_agg(hp.name ORDER BY hp.name) FROM hsp_products hp
      WHERE h.products ? hp.id), '[]'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(to_jsonb(p0)) FROM (
      SELECT p.project_name, COALESCE((SELECT NULLIF(s.label_th, '') FROM stages s WHERE s.id = p.stage_id OR s.stage_id = p.stage_id LIMIT 1), p.stage_id) AS stage,
             p.status, p.progress_pct, p.start_date, p.end_date
      FROM projects p WHERE p.hospital_id = h.id
      ORDER BY p.created_at DESC LIMIT 5) p0), '[]'::jsonb),
    'tickets', COALESCE((SELECT jsonb_agg(to_jsonb(t0)) FROM (
      SELECT t.ticket_no, LEFT(t.subject, 200) AS subject, t.status, t.source_system, t.created_at,
             COALESCE((SELECT LEFT(e.body, 400) FROM helpdesk_ticket_events e
               WHERE e.ticket_id = t.id AND e.type = 'comment' AND e.actor_type = 'agent' AND NOT COALESCE(e.is_internal, false)
               ORDER BY e.created_at DESC LIMIT 1), '') AS last_reply
      FROM helpdesk_tickets t
      WHERE t.hospital_id = h.id AND t.id <> COALESCE(p_exclude_ticket, '') AND t.status <> 'cancelled'
      ORDER BY t.created_at DESC LIMIT 8) t0), '[]'::jsonb),
    'issues', COALESCE((SELECT jsonb_agg(to_jsonb(i0)) FROM (
      SELECT LEFT(ii.problem, 300) AS problem, ii.status, LEFT(COALESCE(ii.solution, ''), 300) AS solution, ii.updated_at
      FROM impl_issues ii
      JOIN impl_projects ip ON ip.id = ii.project_id
      JOIN projects p ON p.id = ip.source_project_id AND p.hospital_id = h.id
      WHERE COALESCE(ii.problem, '') <> ''
      ORDER BY (ii.status = 'closed'), ii.updated_at DESC NULLS LAST LIMIT 10) i0), '[]'::jsonb)
  ) END
  FROM (SELECT 1) one LEFT JOIN hospitals h ON h.id = p_hospital_id;
$$;
REVOKE ALL ON FUNCTION ai_hospital_context(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_hospital_context(TEXT, TEXT) TO anon, authenticated;

-- Context ที่ worker ต้องใช้เท่านั้น: ไม่ส่งชื่อ/เบอร์/อีเมลผู้แจ้งไป AI
CREATE OR REPLACE FUNCTION helpdesk_ai_worker_context(p_secret TEXT, p_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out_json JSONB;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT jsonb_build_object(
    'job', to_jsonb(j),
    'ticket', jsonb_build_object(
      'id', t.id, 'ticket_no', t.ticket_no, 'channel', t.channel, 'hospital_id', t.hospital_id,
      'source_system', t.source_system, 'category_id', t.category_id, 'subject', t.subject,
      'description', t.description, 'priority', t.priority, 'status', t.status,
      'first_response_at', t.first_response_at, 'created_at', t.created_at
    ),
    'settings', COALESCE((SELECT s.helpdesk_ai_auto_reply FROM settings s WHERE s.id = 'app'), '{}'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(e0) ORDER BY e0.created_at) FROM (
        SELECT e.id, e.type, e.actor_type, e.actor_id, e.body, e.meta, e.created_at
        FROM helpdesk_ticket_events e
        WHERE e.ticket_id = t.id AND NOT COALESCE(e.is_internal, false)
        ORDER BY e.created_at DESC LIMIT 30
      ) e0
    ), '[]'::jsonb),
    'attachments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('event_id', a.event_id, 'file_name', a.file_name, 'mime', a.mime, 'created_at', a.created_at))
      FROM helpdesk_attachments a WHERE a.ticket_id = t.id
    ), '[]'::jsonb),
    'holidays', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', h.date, 'name', h.name)) FROM holidays h), '[]'::jsonb),
    'corpus', ai_knowledge_corpus(),
    'hospital', ai_hospital_context(t.hospital_id, t.id)
  ) INTO out_json
  FROM helpdesk_ai_reply_jobs j
  JOIN helpdesk_tickets t ON t.id = j.ticket_id
  WHERE j.id = p_id;
  RETURN COALESCE(out_json, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_reschedule(p_secret TEXT, p_id TEXT, p_when TIMESTAMPTZ, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE helpdesk_ai_reply_jobs SET status = 'pending', attempts = GREATEST(attempts - 1, 0),
    next_attempt_at = GREATEST(COALESCE(p_when, NOW()), NOW() + INTERVAL '5 seconds'),
    skip_reason = LEFT(COALESCE(p_reason, ''), 500), updated_at = NOW()
  WHERE id = p_id AND status = 'processing';
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_skip(
  p_secret TEXT, p_id TEXT, p_reason TEXT, p_raw_response TEXT DEFAULT '', p_metadata JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j helpdesk_ai_reply_jobs%ROWTYPE; cfg JSONB; audit_days INTEGER; raw_days INTEGER;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN; END IF;
  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb) INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30, COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  raw_days := LEAST(365, GREATEST(1, COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));
  UPDATE helpdesk_ai_reply_jobs SET status = 'skipped', skip_reason = LEFT(COALESCE(p_reason, ''), 500), processed_at = NOW(), updated_at = NOW() WHERE id = p_id;
  INSERT INTO helpdesk_ai_audit_logs (id, job_id, ticket_id, inbound_event_id, action, reason, raw_response, metadata, raw_expires_at, expires_at)
  VALUES ('AIL' || md5(random()::text || clock_timestamp()::text), j.id, j.ticket_id, j.inbound_event_id, 'skipped', LEFT(COALESCE(p_reason,''),1000), LEFT(COALESCE(p_raw_response,''),8000), COALESCE(p_metadata,'{}'::jsonb), NOW() + make_interval(days => raw_days), NOW() + make_interval(days => audit_days));
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_fail(p_secret TEXT, p_id TEXT, p_error TEXT, p_raw_response TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j helpdesk_ai_reply_jobs%ROWTYPE; cfg JSONB; tech_days INTEGER; raw_days INTEGER; final_fail BOOLEAN;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN; END IF;
  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb) INTO cfg FROM settings WHERE id = 'app';
  tech_days := LEAST(3650, GREATEST(30, COALESCE(NULLIF(cfg->>'technical_log_days','')::INTEGER, 365)));
  raw_days := LEAST(365, GREATEST(1, COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));
  final_fail := j.attempts >= 5;
  UPDATE helpdesk_ai_reply_jobs SET status = CASE WHEN final_fail THEN 'failed' ELSE 'pending' END,
    next_attempt_at = NOW() + LEAST(INTERVAL '15 minutes', INTERVAL '15 seconds' * POWER(2, GREATEST(attempts - 1, 0))),
    processed_at = CASE WHEN final_fail THEN NOW() ELSE processed_at END,
    last_error = LEFT(COALESCE(p_error,''),1000), updated_at = NOW() WHERE id = p_id;
  INSERT INTO helpdesk_ai_audit_logs (id, job_id, ticket_id, inbound_event_id, action, reason, raw_response, raw_expires_at, expires_at)
  VALUES ('AIL' || md5(random()::text || clock_timestamp()::text), j.id, j.ticket_id, j.inbound_event_id, 'error', LEFT(COALESCE(p_error,''),1000), LEFT(COALESCE(p_raw_response,''),8000), NOW() + make_interval(days => raw_days), NOW() + make_interval(days => tech_days));
END $$;

-- ส่งแบบ atomic: ล็อก job แล้วตรวจว่าคนยังไม่ตอบ/ไม่มีข้อความลูกค้าที่ใหม่กว่า ก่อน insert Timeline
CREATE OR REPLACE FUNCTION helpdesk_ai_worker_send(
  p_secret TEXT, p_id TEXT, p_body TEXT, p_model TEXT, p_confidence TEXT,
  p_kind TEXT, p_reason TEXT, p_raw_response TEXT DEFAULT ''
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j helpdesk_ai_reply_jobs%ROWTYPE; t helpdesk_tickets%ROWTYPE; inbound_at TIMESTAMPTZ;
        cfg JSONB; audit_days INTEGER; raw_days INTEGER; max_replies INTEGER; ai_count INTEGER; handoff_count INTEGER; last_agent TIMESTAMPTZ;
        return_hours INTEGER; inbound_id TEXT; event_id TEXT;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN 'not_processing'; END IF;
  -- revisit:<event> = งานนัดกลับมาตอบข้อความเดิม หลังแจ้งรอทีมแล้วทีมยังไม่ตอบ
  inbound_id := regexp_replace(j.inbound_event_id, '^revisit:', '');
  SELECT * INTO t FROM helpdesk_tickets WHERE id = j.ticket_id FOR UPDATE;
  SELECT created_at INTO inbound_at FROM helpdesk_ticket_events WHERE id = inbound_id;
  IF inbound_at IS NULL AND inbound_id = 'ticket:' || j.ticket_id THEN inbound_at := t.created_at; END IF;
  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb) INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30, COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  raw_days := LEAST(365, GREATEST(1, COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));
  max_replies := LEAST(10, GREATEST(1, COALESCE(NULLIF(cfg->>'max_auto_replies','')::INTEGER, 2)));
  return_hours := LEAST(168, GREATEST(0, COALESCE(NULLIF(cfg->>'return_after_hours','')::INTEGER, 24)));

  IF LOWER(COALESCE(cfg->>'enabled', 'false')) <> 'true' THEN
    PERFORM helpdesk_ai_worker_skip(p_secret, p_id, 'feature_disabled', p_raw_response, '{}'::jsonb); RETURN 'skipped';
  END IF;
  IF t.id IS NULL OR inbound_at IS NULL OR t.status IN ('resolved','closed','cancelled') THEN
    PERFORM helpdesk_ai_worker_skip(p_secret, p_id, 'ticket_not_open', p_raw_response, '{}'::jsonb); RETURN 'skipped';
  END IF;
  IF EXISTS (SELECT 1 FROM helpdesk_ticket_events e WHERE e.ticket_id = j.ticket_id AND e.created_at > inbound_at AND e.type = 'comment' AND e.actor_type = 'agent' AND NOT COALESCE(e.is_internal,false)) THEN
    PERFORM helpdesk_ai_worker_skip(p_secret, p_id, 'human_replied_first', p_raw_response, '{}'::jsonb); RETURN 'skipped';
  END IF;
  IF EXISTS (SELECT 1 FROM helpdesk_ticket_events e WHERE e.ticket_id = j.ticket_id AND e.created_at > inbound_at AND e.type = 'comment' AND e.actor_type = 'reporter' AND NOT COALESCE(e.is_internal,false)) THEN
    PERFORM helpdesk_ai_worker_skip(p_secret, p_id, 'superseded_by_newer_customer_message', p_raw_response, '{}'::jsonb); RETURN 'skipped';
  END IF;
  SELECT MAX(e.created_at) INTO last_agent FROM helpdesk_ticket_events e WHERE e.ticket_id = j.ticket_id AND e.type = 'comment' AND e.actor_type = 'agent' AND NOT COALESCE(e.is_internal,false);
  -- นับคำตอบ AI ตั้งแต่เจ้าหน้าที่ตอบล่าสุด และไม่เกิน return_after_hours ย้อนหลัง (ต้องตรงกับ push-worker)
  -- ไม่นับข้อความแจ้งรอทีม (kind=handoff) · ครบจำนวนแล้วส่ง handoff ได้ 1 ครั้งต่อรอบ
  SELECT COUNT(*) FILTER (WHERE COALESCE(e.meta->>'kind','') <> 'handoff'), COUNT(*) FILTER (WHERE e.meta->>'kind' = 'handoff')
    INTO ai_count, handoff_count
    FROM helpdesk_ticket_events e WHERE e.ticket_id = j.ticket_id AND e.type = 'comment' AND e.actor_type = 'ai'
      AND e.created_at > GREATEST(COALESCE(last_agent, '-infinity'::timestamptz),
        CASE WHEN return_hours > 0 THEN NOW() - make_interval(hours => return_hours) ELSE '-infinity'::timestamptz END);
  IF (p_kind = 'handoff' AND handoff_count > 0) OR (COALESCE(p_kind,'') <> 'handoff' AND ai_count >= max_replies) THEN
    PERFORM helpdesk_ai_worker_skip(p_secret, p_id, 'max_auto_replies_reached', p_raw_response, '{}'::jsonb); RETURN 'skipped';
  END IF;

  event_id := 'HDAI' || md5(random()::text || clock_timestamp()::text);
  INSERT INTO helpdesk_ticket_events (id, ticket_id, type, actor_type, actor_id, body, meta, is_internal, created_at)
  VALUES (event_id, j.ticket_id, 'comment', 'ai', 'ai-auto-reply', LEFT(COALESCE(p_body,''),3000),
    jsonb_build_object('ai_auto',true,'in_reply_to',inbound_id,'confidence',COALESCE(p_confidence,''),'kind',COALESCE(p_kind,''),'model',COALESCE(p_model,'')), false, NOW());
  -- แจ้งรอทีมแล้ว → นัดกลับมาตอบข้อความนี้อีกครั้งถ้าทีมยังไม่ตอบ (เจ้าหน้าที่ตอบ/ลูกค้าส่งข้อความใหม่ → trigger ยกเลิกงานนัดนี้)
  IF p_kind = 'handoff' AND return_hours > 0 THEN
    INSERT INTO helpdesk_ai_reply_jobs (id, inbound_event_id, ticket_id, next_attempt_at)
    VALUES ('ai:revisit:' || inbound_id, 'revisit:' || inbound_id, j.ticket_id, NOW() + make_interval(hours => return_hours) + INTERVAL '5 seconds')
    ON CONFLICT (inbound_event_id) DO NOTHING;
  END IF;
  UPDATE helpdesk_tickets SET first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW() WHERE id = j.ticket_id;
  UPDATE helpdesk_ai_reply_jobs SET status = 'sent', processed_at = NOW(), updated_at = NOW(), last_error = '', skip_reason = '' WHERE id = p_id;
  INSERT INTO helpdesk_ai_audit_logs (id, job_id, ticket_id, inbound_event_id, action, reason, confidence, response_kind, model, raw_response, metadata, raw_expires_at, expires_at)
  VALUES ('AIL' || md5(random()::text || clock_timestamp()::text), j.id, j.ticket_id, j.inbound_event_id, 'sent', LEFT(COALESCE(p_reason,''),1000), LEFT(COALESCE(p_confidence,''),20), LEFT(COALESCE(p_kind,''),30), LEFT(COALESCE(p_model,''),200), LEFT(COALESCE(p_raw_response,''),8000), jsonb_build_object('event_id',event_id), NOW() + make_interval(days => raw_days), NOW() + make_interval(days => audit_days));
  RETURN 'sent';
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_cleanup(p_secret TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg JSONB; audit_days INTEGER; tech_days INTEGER; cleared_raw INTEGER; deleted_audit INTEGER; deleted_orphan INTEGER; deleted_jobs INTEGER;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb) INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30, COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  tech_days := LEAST(3650, GREATEST(30, COALESCE(NULLIF(cfg->>'technical_log_days','')::INTEGER, 365)));
  UPDATE helpdesk_ai_audit_logs SET raw_response = '' WHERE raw_response <> '' AND raw_expires_at <= NOW(); GET DIAGNOSTICS cleared_raw = ROW_COUNT;
  -- Audit เริ่มนับอายุหลังปิด/ยกเลิก Ticket; Ticket ที่ยังเปิดอยู่จึงไม่เสียหลักฐานระหว่างดำเนินงาน
  DELETE FROM helpdesk_ai_audit_logs a USING helpdesk_tickets t
    WHERE t.id = a.ticket_id AND t.status IN ('resolved','closed','cancelled')
      AND COALESCE(t.closed_at, t.resolved_at, t.updated_at, t.created_at) < NOW() - make_interval(days => audit_days);
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;
  DELETE FROM helpdesk_ai_audit_logs a WHERE NOT EXISTS (SELECT 1 FROM helpdesk_tickets t WHERE t.id = a.ticket_id) AND a.expires_at <= NOW();
  GET DIAGNOSTICS deleted_orphan = ROW_COUNT;
  deleted_audit := deleted_audit + deleted_orphan;
  DELETE FROM helpdesk_ai_reply_jobs WHERE status IN ('sent','skipped','failed') AND processed_at < NOW() - make_interval(days => tech_days); GET DIAGNOSTICS deleted_jobs = ROW_COUNT;
  RETURN jsonb_build_object('raw_cleared',cleared_raw,'audit_deleted',deleted_audit,'jobs_deleted',deleted_jobs);
END $$;

REVOKE ALL ON FUNCTION helpdesk_ai_worker_claim(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_context(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_reschedule(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_skip(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_fail(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_send(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpdesk_ai_worker_cleanup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_claim(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_context(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_reschedule(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_skip(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_fail(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_send(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION helpdesk_ai_worker_cleanup(TEXT) TO anon;

-- ================================================================
-- SERVER REQUEST — ใบขอใช้งานทีม Server (แทน Google Form เดิม)
-- หน้า public docs/server-request.html (คนนอกทีมกรอกขอ + ติดตามผ่านลิงก์ token)
-- โมดูล 'server_request' ในแอป: อนุมัติ (สิทธิ์ approve) → จัดคน/ช่วงวัน → สร้างโครงการให้อัตโนมัติ
-- idempotent — รันซ้ำได้ทั้งไฟล์
-- ================================================================

-- ตัวเลือกบนฟอร์ม (เพิ่ม/แก้/ลบ/ปิดใช้งานได้ในแท็บ "ตั้งค่า" ของโมดูล)
--   kind: work_mode = ประเภทการทำงาน · db_type = ประเภทฐานข้อมูล · task = รายละเอียดงาน (เลือกได้หลายข้อ)
--         phase = ช่วงที่ต้องการใช้งาน
CREATE TABLE IF NOT EXISTS server_request_options (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  label       TEXT DEFAULT '',
  sort        NUMERIC DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_requests (
  id               TEXT PRIMARY KEY,
  req_no           TEXT UNIQUE,                -- SRV + ปี พ.ศ. 2 หลัก + เดือน + ลำดับ 3 หลัก
  access_token     TEXT DEFAULT '',            -- ลิงก์ติดตามของผู้ขอ (server-request.html?t=...)
  requester_name   TEXT DEFAULT '',
  requester_team   TEXT DEFAULT '',            -- ทีม/หน่วยงานของผู้ขอ
  hospital_id      TEXT DEFAULT '',            -- hospitals.id (ถ้าเลือกจากรายการ)
  hospital_name    TEXT DEFAULT '',            -- ชื่อที่ผู้ขอพิมพ์ (กรณีไม่มีในรายการ)
  it_name          TEXT DEFAULT '',            -- ชื่อ IT ของ รพ. ที่ให้ติดต่อ
  it_phone         TEXT DEFAULT '',            -- เบอร์โทร IT ของ รพ.
  work_mode_id     TEXT DEFAULT '',            -- server_request_options.id
  db_type_id       TEXT DEFAULT '',
  task_ids         JSONB DEFAULT '[]',
  task_other       TEXT DEFAULT '',
  phase_id         TEXT DEFAULT '',
  start_date       DATE,
  end_date         DATE,
  headcount        INTEGER DEFAULT 1,          -- จำนวนคนที่ต้องการ
  note             TEXT DEFAULT '',
  status           TEXT DEFAULT 'pending',     -- pending | approved | scheduled | done | rejected | cancelled
  decided_by       TEXT DEFAULT '',            -- users.id ผู้อนุมัติ/ไม่อนุมัติ
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT DEFAULT '',
  assignees        JSONB DEFAULT '[]',         -- [{ sid: staff.id, s: 'YYYY-MM-DD', e: 'YYYY-MM-DD' }]
  assigned_by      TEXT DEFAULT '',            -- users.id ผู้จัดคน
  assigned_at      TIMESTAMPTZ,
  project_id       TEXT DEFAULT '',            -- projects.id ที่สร้างจากคำขอนี้
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
-- กรณีเคยรันเวอร์ชันแรกแล้ว: แยกช่อง IT เป็นชื่อ/เบอร์ และตัดเบอร์/อีเมลผู้ขอออก
ALTER TABLE server_requests ADD COLUMN IF NOT EXISTS it_name  TEXT DEFAULT '';
ALTER TABLE server_requests ADD COLUMN IF NOT EXISTS it_phone TEXT DEFAULT '';
ALTER TABLE server_requests DROP COLUMN IF EXISTS it_contact;
ALTER TABLE server_requests DROP COLUMN IF EXISTS requester_phone;
ALTER TABLE server_requests DROP COLUMN IF EXISTS requester_email;
CREATE INDEX IF NOT EXISTS idx_srvreq_status     ON server_requests (status);
CREATE INDEX IF NOT EXISTS idx_srvreq_created_at ON server_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_srvreq_token      ON server_requests (access_token);

-- ค่าตั้งของโมดูล: { teamDeptIds:[], teamStaffIds:[], groupId, typeId, intro }
ALTER TABLE settings ADD COLUMN IF NOT EXISTS srv_req_config JSONB DEFAULT '{}';
-- BMS Notify Token ของคำขอใช้งานทีม Server (ตั้งที่ Admin › ตั้งค่าการแจ้งเตือน)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_server_token TEXT DEFAULT '';

-- ตัวเลือกเริ่มต้น (ตาม Google Form เดิม) — ใส่ครั้งแรกเท่านั้น แก้ภายหลังในแอปได้
INSERT INTO server_request_options (id, kind, label, sort) VALUES
  ('SRO_WM_1', 'work_mode', 'เข้าไซต์งาน', 1),
  ('SRO_WM_2', 'work_mode', 'ผ่าน Online / Zoom', 2),
  ('SRO_DB_1', 'db_type', 'MySQL', 1),
  ('SRO_DB_2', 'db_type', 'PostgreSQL', 2),
  ('SRO_TK_1', 'task', 'ติดตั้ง Server Master', 1),
  ('SRO_TK_2', 'task', 'ติดตั้ง Server Slave', 2),
  ('SRO_TK_3', 'task', 'ติดตั้ง Server Image', 3),
  ('SRO_TK_4', 'task', 'ติดตั้ง Server Log', 4),
  ('SRO_TK_5', 'task', 'จัดทำ Slave ใหม่', 5),
  ('SRO_TK_6', 'task', 'อบรมการดูแล Server', 6),
  ('SRO_TK_7', 'task', 'กรณีมีปัญหาเรื่องระบบ Backup', 7),
  ('SRO_PH_1', 'phase', 'ช่วงเข้าไซต์ใหม่', 1),
  ('SRO_PH_2', 'phase', 'ช่วงอบรม', 2),
  ('SRO_PH_3', 'phase', 'ช่วงทำ UT / SIT', 3),
  ('SRO_PH_4', 'phase', 'ช่วงขึ้นระบบ', 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE server_request_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_requests        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['server_request_options','server_requests'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;

-- ── ล้างของที่เลิกใช้: ตารางสำรองค่าเดิมของการแปลงชื่อ → รหัส (แปลงเสร็จแล้ว) ──
DROP TABLE IF EXISTS _mig_name_to_id_backup;

NOTIFY pgrst, 'reload schema';

-- ══ ดึงเฉพาะข้อมูลที่เปลี่ยน (แคชในเครื่อง docs/src/services/db.service.js) ══
-- แถวที่ถูกลบ (เก็บแค่ชื่อตาราง + id + เวลา) · ลบประวัติเก่ากว่า 90 วันเอง (หน้าเว็บที่แคชเก่ากว่า 7 วันดึงทั้งตารางใหม่อยู่แล้ว)
CREATE TABLE IF NOT EXISTS sync_deleted (
  tbl        TEXT        NOT NULL,
  id         TEXT        NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, id)
);
CREATE INDEX IF NOT EXISTS idx_sync_deleted_tbl_at ON sync_deleted (tbl, deleted_at);
ALTER TABLE sync_deleted ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sync_deleted_read" ON sync_deleted;
CREATE POLICY "sync_deleted_read" ON sync_deleted FOR SELECT USING (true); -- อ่านได้อย่างเดียว · เขียนผ่าน trigger เท่านั้น
GRANT SELECT ON sync_deleted TO anon, authenticated;

-- เพิ่ม/แก้แถว → ประทับเวลา (ทับค่าที่ส่งมาเสมอ)
CREATE OR REPLACE FUNCTION sync_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_at := clock_timestamp();
  RETURN NEW;
END $$;

-- ลบแถว → จดไว้ใน sync_deleted
CREATE OR REPLACE FUNCTION sync_log_delete() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO sync_deleted (tbl, id, deleted_at) VALUES (TG_TABLE_NAME, OLD.id::text, clock_timestamp())
    ON CONFLICT (tbl, id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  IF random() < 0.01 THEN DELETE FROM sync_deleted WHERE deleted_at < now() - interval '90 days'; END IF;
  RETURN OLD;
END $$;

-- ตารางที่ข้อมูลสะสมตามเวลา (ตรงกับ DELTA_TABLES ใน docs/src/services/db.service.js)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','advances','lodgings','leaves','timesheets','costs','work_logs','contracts','hospitals','hsp_products',
    'impl_projects','impl_phases','impl_tasks','impl_checklist_items','impl_issues','impl_comments','impl_attachments',
    'impl_activity_log','form_items','expense_clearing_forms','site_deploy_forms','site_notice_forms',
    'helpdesk_tickets','helpdesk_problems','assist_replies','server_requests']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'ข้าม % (ยังไม่มีตาราง)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sync_at TIMESTAMPTZ NOT NULL DEFAULT now()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (sync_at)', 'idx_' || t || '_sync_at', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_touch ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_sync_touch BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_touch()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_log_delete ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_sync_log_delete AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_log_delete()', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
