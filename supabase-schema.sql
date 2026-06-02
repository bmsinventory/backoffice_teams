-- =============================================================
-- Backoffice Teams — Supabase Schema
-- รันใน Supabase Dashboard → SQL Editor
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
  department  TEXT DEFAULT '',
  position    TEXT DEFAULT '',
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
  site_owner         TEXT DEFAULT '',
  installer_name     TEXT DEFAULT '',
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
  visits             JSONB DEFAULT '[]',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

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
  approved         TEXT DEFAULT '',
  approved_at      TEXT DEFAULT '',
  approved_by      TEXT DEFAULT '',
  approved_daily   TEXT DEFAULT '',
  approved_monthly TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
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
  approved_by    TEXT DEFAULT '',
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
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

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
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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
    EXECUTE format(
      'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- =============================================================
-- REALTIME
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE stages;
ALTER PUBLICATION supabase_realtime ADD TABLE ptypes;
ALTER PUBLICATION supabase_realtime ADD TABLE pgroups;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;
ALTER PUBLICATION supabase_realtime ADD TABLE departments;
ALTER PUBLICATION supabase_realtime ADD TABLE staff;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE advances;
ALTER PUBLICATION supabase_realtime ADD TABLE lodgings;
ALTER PUBLICATION supabase_realtime ADD TABLE holidays;
ALTER PUBLICATION supabase_realtime ADD TABLE leaves;
ALTER PUBLICATION supabase_realtime ADD TABLE timesheets;
ALTER PUBLICATION supabase_realtime ADD TABLE costs;
ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE hsp_products;
ALTER PUBLICATION supabase_realtime ADD TABLE hospitals;
ALTER PUBLICATION supabase_realtime ADD TABLE work_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;
