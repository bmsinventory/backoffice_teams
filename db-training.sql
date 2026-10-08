-- =============================================================
-- ระบบอบรม (/training/) + แบบทดสอบหลังอบรมและใบประกาศ (/training/?page=quiz)
-- ย้ายมาจาก repo bms_training (เดิมอยู่บน Supabase Cloud แยก) — ตารางทั้งหมดขึ้นต้นด้วย trn_ กันชนกับตาราง Backoffice
-- บัญชีผู้ใช้/สิทธิ์ใช้ของ Backoffice (ตาราง users + สิทธิ์ "training") ไม่มีตาราง admin_users แยกแล้ว
-- รันใน Supabase Studio › SQL Editor ครั้งเดียว (รันซ้ำได้ ไม่ลบข้อมูล)
-- =============================================================

-- โรงพยาบาลของโครงการ — เลือกตอนเพิ่ม/แก้ไขโครงการ (เมนูโครงการ) ที่เดียว เปิดอบรมใช้ รพ. นี้เลย
-- (อยู่ใน db-schema.sql ด้วย — ใส่ตรงนี้สำหรับฐานข้อมูลที่สร้างไว้ก่อนแล้ว)
alter table projects add column if not exists hospital_id text default '';

-- ── ระบบอบรม ──────────────────────────────────────────────────
-- 1 โครงการ (ติดตามสถานะโครงการ — impl_projects) = 1 การอบรม · รพ. หนึ่งมีได้หลายโครงการ
-- รหัสโครงการ (code) = รหัส รพ.-ลำดับ เช่น 10700-01 — ใช้ในลิงก์ ?site= และคอลัมน์ site ของตาราง trn_* ที่แยกตามโครงการ (ประเภทอบรม/แบบทดสอบ/ค่าตั้งค่า = ของกลาง)
-- ชื่อ รพ. ไม่เก็บซ้ำ อ่านจาก hospitals · ชื่อโครงการอ่านจาก impl_projects
create table if not exists trn_sites (
  id            serial primary key,
  code          text    unique,                     -- รหัสโครงการ (ระบบตั้งให้ตอนเปิดอบรม)
  hospital_id   text    not null references hospitals(id) on delete cascade,
  project_id    text    unique references impl_projects(id) on delete set null, -- โครงการในติดตามสถานะโครงการ
  require_email boolean not null default false,   -- บังคับกรอกอีเมลตอนลงทะเบียน เฉพาะโครงการนี้
  created_at    timestamptz default now()
);

-- หน้าเว็บอ่านโครงการที่เปิดอบรมจาก view นี้ — เพิ่ม/ลบ/ตั้งค่าเขียนที่ trn_sites
-- name = ชื่อโครงการ (ยังไม่ผูกโครงการ = ชื่อ รพ.)
drop view if exists trn_locations;
create view trn_locations as
  select s.id, s.code, coalesce(nullif(p.project_name, ''), h.name) as name, s.require_email,
         s.hospital_id, h.name as hospital_name, s.project_id, s.created_at
  from trn_sites s
  join hospitals h on h.id = s.hospital_id
  left join impl_projects p on p.id = s.project_id;
grant select on trn_locations to anon, authenticated;

-- ประเภทการอบรม — ของกลาง ใช้ร่วมทุกโครงการ (จัดการที่เมนู "ระบบอบรม" › ประเภทอบรม)
-- แต่ละโครงการเปิดใช้ประเภทไหนบ้าง = trn_site_categories · แบบทดสอบผูกที่ประเภท (quiz_id — เพิ่มด้านล่างหลัง trn_quizzes)
create table if not exists trn_categories (
  id          serial primary key,
  name        text    not null,
  description text    not null default '',
  icon        text    not null default 'box',
  color       text    not null default 'blue',
  banner_url  text,
  created_at  timestamptz default now()
);
alter table trn_categories drop column if exists site;

-- ข้อมูลพื้นฐานของโครงการ: สถานที่ / แผนก / คำนำหน้า (วิทยากรใช้รายชื่อพนักงาน ไม่เก็บที่นี่)
-- ตารางอื่นอ้างด้วยรหัส (venue_id / dept_id / prefix_id) — แก้ชื่อที่นี่ที่เดียว · ที่ยังถูกใช้อยู่ลบไม่ได้ (restrict)
create table if not exists trn_master_items (
  id          serial primary key,
  type        text    not null,                     -- 'venue' | 'dept' | 'prefix'
  value       text    not null,
  sort_order  integer not null default 0,
  site        text    not null,
  unique(type, value, site)
);

-- รอบอบรม (ตามโครงการ) — ประเภทที่ยังมีรอบอบรมใช้อยู่ลบไม่ได้ (restrict)
create table if not exists trn_sessions (
  id          serial primary key,
  cat_id      integer references trn_categories(id) on delete restrict,
  name        text    not null,
  date        date    not null,
  time_start  text    not null default '09:00',
  time_end    text    not null default '16:00',
  venue_id    integer constraint trn_sessions_venue_id_fkey references trn_master_items(id) on delete restrict, -- สถานที่
  trainer     text    not null default '',        -- รหัสพนักงาน (staff.id) — วิทยากรเลือกจากรายชื่อพนักงาน
  capacity    integer not null default 20,
  site        text    not null,
  created_at  timestamptz default now()
);
alter table trn_sessions drop constraint if exists trn_sessions_cat_id_fkey;
alter table trn_sessions add constraint trn_sessions_cat_id_fkey foreign key (cat_id) references trn_categories(id) on delete restrict;

-- ประเภทอบรมที่เปิดในแต่ละโครงการ · quiz_open = เปิดให้สอบในโครงการนี้ (ปิดได้โดยไม่กระทบโครงการอื่น)
-- สร้างรอบอบรมประเภทไหน → เปิดประเภทนั้นในโครงการให้อัตโนมัติ (trigger ด้านล่าง)
create table if not exists trn_site_categories (
  site       text    not null,
  cat_id     integer not null references trn_categories(id) on delete cascade,
  quiz_open  boolean not null default true,
  created_at timestamptz default now(),
  primary key (site, cat_id)
);
create or replace function trn_session_enable_cat() returns trigger language plpgsql as $$
begin
  if new.cat_id is not null then
    insert into trn_site_categories (site, cat_id) values (new.site, new.cat_id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_trn_session_enable_cat on trn_sessions;
create trigger trg_trn_session_enable_cat after insert or update of cat_id, site on trn_sessions
  for each row execute function trn_session_enable_cat();

-- ผู้ลงทะเบียน / เช็คชื่อ
create table if not exists trn_registrations (
  id            serial primary key,
  session_id    integer references trn_sessions(id) on delete cascade,
  prefix_id     integer constraint trn_registrations_prefix_id_fkey references trn_master_items(id) on delete restrict, -- คำนำหน้า
  fname         text    not null,
  lname         text    not null,
  position      text    not null default '',
  dept_id       integer constraint trn_registrations_dept_id_fkey references trn_master_items(id) on delete restrict,   -- แผนก
  email         text,
  reg_date      date    not null default current_date,
  attended      boolean not null default false,
  attended_time text,
  is_walkin     boolean not null default false,     -- มาลงทะเบียนหน้างาน (ไม่ได้ลงล่วงหน้า)
  created_at    timestamptz default now()
);

-- ตรวจสอบสิทธิ์ Login ของผู้ใช้งาน รพ.
-- NULLS NOT DISTINCT (PostgreSQL 15+): คนที่ไม่มีแผนกก็ upsert ทับแถวเดิมได้ ไม่เพิ่มแถวซ้ำ
create table if not exists trn_login_verify (
  id           serial primary key,
  fname        text    not null,
  lname        text    not null,
  dept_id      integer constraint trn_login_verify_dept_id_fkey references trn_master_items(id) on delete restrict, -- แผนก
  position     text    not null default '',
  login_status text    not null default 'pending', -- 'has_login' | 'no_login' | 'disabled' | 'pending'
  notes        text    not null default '',
  site         text    not null,
  created_at   timestamptz default now(),
  constraint trn_login_verify_person_key unique nulls not distinct (fname, lname, dept_id, site)
);

-- ตรวจสอบคีย์ยอดรายแผนก (ลบแผนก → สถานะคีย์ยอดของแผนกนั้นหายตาม)
create table if not exists trn_key_entry_status (
  id         serial primary key,
  dept_id    integer not null constraint trn_key_entry_status_dept_id_fkey references trn_master_items(id) on delete cascade,
  site       text    not null,
  status     text    not null default 'not_keyed', -- 'keyed' | 'not_keyed'
  keyed_at   timestamptz,
  reason     text    not null default '',
  updated_at timestamptz default now(),
  constraint trn_key_entry_status_dept_site_key unique (dept_id, site)
);

-- แบบประเมินหลังอบรม (/training/?page=survey) — คะแนน 1–5
create table if not exists trn_survey_responses (
  id           bigserial primary key,
  site         text    not null,
  session_id   bigint  references trn_sessions(id) on delete set null,
  submitted_at timestamptz default now(),
  q1_1 smallint check (q1_1 between 1 and 5), q1_2 smallint check (q1_2 between 1 and 5),
  q1_3 smallint check (q1_3 between 1 and 5), q1_4 smallint check (q1_4 between 1 and 5),
  q1_5 smallint check (q1_5 between 1 and 5), q1_6 smallint check (q1_6 between 1 and 5),
  q2_1 smallint check (q2_1 between 1 and 5), q2_2 smallint check (q2_2 between 1 and 5),
  q2_3 smallint check (q2_3 between 1 and 5), q2_4 smallint check (q2_4 between 1 and 5),
  q2_5 smallint check (q2_5 between 1 and 5), q2_6 smallint check (q2_6 between 1 and 5),
  q2_7 smallint check (q2_7 between 1 and 5),
  q3_1 smallint check (q3_1 between 1 and 5), q3_2 smallint check (q3_2 between 1 and 5),
  q3_3 smallint check (q3_3 between 1 and 5), q3_4 smallint check (q3_4 between 1 and 5),
  q3_5 smallint check (q3_5 between 1 and 5), q3_6 smallint check (q3_6 between 1 and 5),
  q3_7 smallint check (q3_7 between 1 and 5), q3_8 smallint check (q3_8 between 1 and 5),
  q3_9 smallint check (q3_9 between 1 and 5), q3_10 smallint check (q3_10 between 1 and 5),
  q4_1 smallint check (q4_1 between 1 and 5), q4_2 smallint check (q4_2 between 1 and 5),
  q4_3 smallint check (q4_3 between 1 and 5), q4_4 smallint check (q4_4 between 1 and 5),
  q4_5 smallint check (q4_5 between 1 and 5),
  q5_1 smallint check (q5_1 between 1 and 5), q5_2 smallint check (q5_2 between 1 and 5),
  q5_3 smallint check (q5_3 between 1 and 5), q5_4 smallint check (q5_4 between 1 and 5),
  q5_5 smallint check (q5_5 between 1 and 5), q5_6 smallint check (q5_6 between 1 and 5),
  q5_7 smallint check (q5_7 between 1 and 5),
  q6_1 smallint check (q6_1 between 1 and 5), q6_2 smallint check (q6_2 between 1 and 5),
  q6_3 smallint check (q6_3 between 1 and 5), q6_4 smallint check (q6_4 between 1 and 5),
  q6_5 smallint check (q6_5 between 1 and 5),
  q6_6 boolean,                                    -- ต้องการอบรมเพิ่มเติม?
  comments text
);

-- ค่าตั้งค่าแบบ key/value ใช้ร่วมกันทั้งระบบอบรมและระบบสอบ (สิทธิ์ใช้หน้าสิทธิ์ของ Backoffice ไม่เก็บที่นี่)
-- (site_notify_tokens, site_name, org_name, cert_*, emailjs_* ...)
-- site_notify_tokens = JSON {รหัสโครงการ: token เฉพาะโครงการ | 'off' = ไม่แจ้งเตือน} · ไม่มี key = ใช้ token กลาง
-- (settings.notify_training_token ตั้งที่ Admin Panel → 🔔 ตั้งค่าการแจ้งเตือน)
create table if not exists trn_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz default now()
);

create index if not exists idx_trn_sessions_site     on trn_sessions(site);
create index if not exists idx_trn_regs_session      on trn_registrations(session_id);

-- ── สิทธิ์ (RLS) ─────────────────────────────────────────────
-- หน้าสาธารณะ (ลงทะเบียน / เช็คชื่อ / แบบประเมิน) ใช้คีย์สาธารณะ (anon) · แบบทดสอบมีสิทธิ์ของตัวเอง (ส่วนท้ายไฟล์)
do $$
declare t text;
begin
  foreach t in array array['trn_sites','trn_categories','trn_site_categories','trn_sessions','trn_registrations','trn_master_items',
    'trn_login_verify','trn_key_entry_status','trn_survey_responses','trn_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "trn_all" on %I', t);
    execute format('create policy "trn_all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ── Realtime (หน้าเช็คชื่อ/ผู้ลงทะเบียนอัปเดตเองไม่ต้อง F5) ──
do $$
declare t text;
begin
  foreach t in array array['trn_sites','trn_categories','trn_site_categories','trn_sessions','trn_registrations','trn_master_items']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── ที่เก็บไฟล์ (Storage) — รูปแบนเนอร์ประเภทอบรม ──
-- ชื่อไฟล์ในโค้ดไม่มีนามสกุล (proxy หน้าเซิร์ฟเวอร์ตีกลับ URL ที่ลงท้าย .jpg) — ชนิดไฟล์ใช้ contentType
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('trn-banners',      'trn-banners',      true, 5242880,  array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do nothing;

  execute 'drop policy if exists "trn_files_all" on storage.objects';
  execute 'create policy "trn_files_all" on storage.objects for all to anon '
       || 'using (bucket_id = ''trn-banners'') with check (bucket_id = ''trn-banners'')';
exception when others then
  raise notice 'ข้าม storage (%) — สร้าง bucket trn-banners (public) + policy anon เองใน Studio', sqlerrm;
end $$;

-- ── แบบทดสอบหลังอบรม + ใบประกาศ (src/modules/training-quiz.js · src/modules/training-quiz-take.js) ──────────────
-- คลังแบบทดสอบกลาง ใช้ร่วมทุกโครงการ · ประเภทอบรม (ของกลาง) เลือกชุดที่ใช้ (trn_categories.quiz_id) · เปิด/ปิดสอบรายโครงการ = trn_site_categories.quiz_open
-- สุ่มข้อจากคลังข้อสอบ · ผ่าน → ออกใบประกาศ ส่งทางอีเมล (EmailJS) · ผลสอบ/ใบประกาศแยกตามโครงการ (site)
-- ข้อที่มีคนสอบแล้วแก้คำถาม/ตัวเลือก/เฉลยไม่ได้ (ผลสอบเก่าจะไม่ตรง) — ปิดข้อเดิมแล้วเพิ่มข้อใหม่แทน
-- เฉลย (answer) และคำอธิบาย อ่านจากหน้าเว็บไม่ได้ — เริ่มสอบ/ส่งคำตอบผ่าน trn_quiz_start / trn_quiz_submit (ตรวจคะแนนในฐานข้อมูล)
--   ส่งคำตอบแล้ว trn_quiz_submit คืนเฉลย + คำอธิบาย เฉพาะข้อที่ตอบผิดของการสอบครั้งนั้น
-- ผู้ดูแลแก้ข้อสอบ/ลบผลสอบ/ยกเลิกใบประกาศ ผ่าน trn_quiz_admin (ตรวจ session ของ Backoffice + สิทธิ์ "อบรม")

create table if not exists trn_quizzes (
  id              serial  primary key,
  title           text    not null default '',     -- ชื่อแบบทดสอบ = ชื่อหลักสูตรบนใบประกาศ
  pass_percent    integer not null default 80 check (pass_percent between 1 and 100),
  questions_count integer not null default 10 check (questions_count > 0),  -- จำนวนข้อที่สุ่มต่อการสอบ
  max_attempts    integer not null default 0  check (max_attempts >= 0),     -- 0 = ไม่จำกัด
  time_limit_min  integer not null default 0  check (time_limit_min >= 0),   -- 0 = ไม่จับเวลา
  is_active       boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists trn_quiz_questions (
  id          serial  primary key,
  quiz_id     integer not null references trn_quizzes(id) on delete cascade,
  question    text    not null,
  choices     jsonb   not null default '[]',       -- ["ตัวเลือก 1", "ตัวเลือก 2", ...]
  answer      smallint not null default 0,         -- ลำดับตัวเลือกที่ถูก (เริ่ม 0) — ลับ
  explanation text    not null default '',         -- ลับ (ผู้ดูแลเห็นเท่านั้น)
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists trn_quiz_attempts (
  id           uuid    primary key default gen_random_uuid(),
  quiz_id      integer not null references trn_quizzes(id) on delete cascade,
  site         text    not null,
  cat_id       integer references trn_categories(id) on delete set null,  -- ประเภทอบรมที่เข้าสอบ
  reg_id      integer references trn_registrations(id) on delete set null, -- ว่าง = คนนอกรายชื่อผู้ลงทะเบียน
  full_name    text    not null,
  dept         text    not null default '',
  position     text    not null default '',
  email        text    not null,
  question_ids integer[] not null,                 -- ข้อที่สุ่มได้ (ตามลำดับที่แสดง)
  answers      smallint[],                         -- คำตอบที่เลือก ตรงลำดับ question_ids (null = ไม่ได้ตอบ)
  correct      boolean[],                          -- ถูก/ผิด รายข้อ (ตรวจในฐานข้อมูล)
  score        integer,
  total        integer,
  percent      numeric(5,2),
  status       text    not null default 'started' check (status in ('started','PASS','FAIL')),
  started_at   timestamptz default now(),
  completed_at timestamptz
);

-- เลขลำดับใบประกาศ นับใหม่ทุกปี พ.ศ. (แถวต่อปี · ล็อกแถวตอนออกเลข จึงไม่ซ้ำแม้ส่งพร้อมกัน) · เลขที่ยกเลิกแล้วไม่นำกลับมาใช้
create table if not exists trn_quiz_cert_counters (
  year integer primary key,
  last integer not null default 0
);
alter table trn_quiz_cert_counters enable row level security; -- ไม่มี policy = หน้าเว็บแตะไม่ได้ (ออกเลขผ่าน trn_quiz_submit เท่านั้น)
drop sequence if exists trn_quiz_cert_seq;
create table if not exists trn_quiz_certs (
  cert_id      text    primary key,                -- รหัสหน่วยงาน-รหัสหลักสูตร-ปี พ.ศ.-ลำดับในปี เช่น BMS-INV-2569-000001
  attempt_id   uuid    not null unique references trn_quiz_attempts(id) on delete cascade,
  site         text    not null,
  full_name    text    not null,
  email        text    not null,
  quiz_title   text    not null,
  percent      numeric(5,2) not null,
  issued_at    timestamptz default now(),
  is_revoked   boolean not null default false,
  email_status text    not null default 'pending' check (email_status in ('pending','sent','failed')),
  email_error  text    not null default '',
  emailed_at   timestamptz
);

create index if not exists idx_trn_quiz_q_quiz    on trn_quiz_questions(quiz_id);
create index if not exists idx_trn_quiz_att_quiz  on trn_quiz_attempts(quiz_id, email);
create index if not exists idx_trn_quiz_att_site  on trn_quiz_attempts(site);
create index if not exists idx_trn_quiz_cert_site on trn_quiz_certs(site);

create index if not exists idx_trn_quiz_att_qids on trn_quiz_attempts using gin (question_ids);

-- ประเภทอบรม → แบบทดสอบจากคลังกลาง (ผูกครั้งเดียว ใช้ทุกโครงการ) · เปิด/ปิดสอบรายโครงการอยู่ที่ trn_site_categories.quiz_open
-- (เพิ่มคอลัมน์ให้ตารางที่สร้างไว้แล้ว · trn_quizzes ไม่ผูกประเภทอบรมแล้ว — เอา cat_id ของรุ่นแรกออก)
alter table trn_categories    add column if not exists quiz_id   integer references trn_quizzes(id) on delete set null;
-- รหัสหลักสูตรในเลขใบประกาศ (เช่น INV → BMS-INV-2569-000001) · ว่าง = ไม่ใส่ส่วนนี้
alter table trn_categories    add column if not exists cert_code text not null default '';
alter table trn_categories    drop column if exists quiz_open;
-- ประเภทโครงการ (ptypes.type_id) — จัดกลุ่มหน้า "หลักสูตรอบรม" · ว่าง = ยังไม่ระบุ
alter table trn_categories    add column if not exists type_id   text not null default '';
alter table trn_quiz_attempts add column if not exists cat_id    integer references trn_categories(id) on delete set null;
alter table trn_quizzes       drop column if exists cat_id;

create or replace function trn_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_trn_quizzes_updated_at on trn_quizzes;
create trigger trg_trn_quizzes_updated_at before update on trn_quizzes for each row execute function trn_touch_updated_at();
drop trigger if exists trg_trn_quiz_q_updated_at on trn_quiz_questions;
create trigger trg_trn_quiz_q_updated_at before update on trn_quiz_questions for each row execute function trn_touch_updated_at();

-- ค่าเริ่มต้นใบประกาศ/อีเมล (แก้ได้ที่ แท็บอบรม › แบบทดสอบ › ตั้งค่าใบประกาศ)
insert into trn_settings (key, value) values
  ('org_name',            'บริษัท บีเอ็มเอส เมดิคอล จำกัด'),
  ('cert_title',          'ประกาศนียบัตร'),
  ('cert_prefix',         'BMS'),
  ('cert_color',          '#7c5cfc'),
  ('cert_signer_name',    ''),
  ('cert_signer_title',   ''),
  ('emailjs_service_id',  ''),
  ('emailjs_template_id', ''),
  ('emailjs_public_key',  '')
on conflict (key) do nothing;

-- ── สิทธิ์ ──
-- แบบทดสอบ (คลังกลาง): อ่านได้ เขียนผ่าน trn_quiz_admin เท่านั้น (ต้องมีสิทธิ์ "แก้ไข" — กระทบทุกโครงการ)
-- ข้อสอบ: อ่านได้เฉพาะคอลัมน์ที่ไม่ใช่เฉลย เขียนผ่าน trn_quiz_admin เท่านั้น
-- ผลสอบ/ใบประกาศ: อ่านได้ (หน้าผู้ดูแล/ตรวจสอบใบประกาศ) เขียนผ่านฟังก์ชันเท่านั้น · ใบประกาศแก้ได้เฉพาะสถานะการส่งอีเมล
alter table trn_quizzes        enable row level security;
alter table trn_quiz_questions enable row level security;
alter table trn_quiz_attempts  enable row level security;
alter table trn_quiz_certs     enable row level security;
drop policy if exists "trn_all"  on trn_quizzes;
drop policy if exists "trn_read" on trn_quizzes;
create policy "trn_read" on trn_quizzes for select using (true);
drop policy if exists "trn_read" on trn_quiz_questions;
create policy "trn_read" on trn_quiz_questions for select using (true);
drop policy if exists "trn_read" on trn_quiz_attempts;
create policy "trn_read" on trn_quiz_attempts for select using (true);
drop policy if exists "trn_read" on trn_quiz_certs;
create policy "trn_read" on trn_quiz_certs for select using (true);
drop policy if exists "trn_mail" on trn_quiz_certs;
create policy "trn_mail" on trn_quiz_certs for update using (true) with check (true);

revoke all on trn_quizzes, trn_quiz_questions, trn_quiz_attempts, trn_quiz_certs from anon, authenticated;
revoke usage on sequence trn_quizzes_id_seq from anon, authenticated;
grant select (id, quiz_id, question, choices, sort_order, is_active, created_at, updated_at) on trn_quiz_questions to anon, authenticated;
grant select on trn_quizzes, trn_quiz_attempts, trn_quiz_certs to anon, authenticated;
grant update (email_status, email_error, emailed_at) on trn_quiz_certs to anon, authenticated;

-- ผู้ใช้ Backoffice ที่ Login อยู่ + มีสิทธิ์หน้าอบรม — sig = djb2(id|password) แบบเดียวกับ src/utils/session.util.js
-- สิทธิ์ตรงกับ src/services/bo-auth.service.js: admin = ทุกอย่าง · role อื่นตาม settings.role_permissions[role].training[p_need] (ไม่ตั้ง = เฉพาะ pm)
-- p_need: view = งานของโครงการ (ผลสอบ/ใบประกาศ) · edit = แก้คลังแบบทดสอบกลาง
drop function if exists trn_staff_ok(text, text);
create or replace function trn_staff_ok(p_uid text, p_sig text, p_need text default 'view') returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  u    users;
  s    text;
  h    bigint := 5381;
  b36  text := '';
  v    text;
  i    int;
begin
  if coalesce(p_uid, '') = '' or coalesce(p_sig, '') = '' then return false; end if;
  select * into u from users where coalesce(nullif(user_id, ''), id) = p_uid limit 1;
  if not found or u.is_active is false then return false; end if;
  s := p_uid || '|' || coalesce(u.password, '');
  for i in 1 .. length(s) loop
    h := (h * 33 + ascii(substr(s, i, 1))) % 4294967296;
  end loop;
  loop
    b36 := substr('0123456789abcdefghijklmnopqrstuvwxyz', (h % 36)::int + 1, 1) || b36;
    h := h / 36;
    exit when h = 0;
  end loop;
  if b36 <> p_sig then return false; end if;
  if u.role = 'admin' then return true; end if;
  select to_jsonb(r) -> u.role -> 'training' ->> p_need into v from settings r where r.id = 'role_permissions';
  if v is null then return u.role = 'pm'; end if;
  return v = 'true';
end $$;
revoke execute on function trn_staff_ok(text, text, text) from public, anon, authenticated;

-- เริ่มสอบ — p_site = รหัสโครงการ · p_cat = ประเภทอบรม (ต้องเปิดในโครงการนั้นและเปิดสอบอยู่ · ใช้แบบทดสอบที่ประเภทผูกไว้)
-- p_reg = รหัสผู้ลงทะเบียน (ชื่อ/แผนก/ตำแหน่งใช้ของรายชื่อ) หรือ null = คนนอกรายชื่อ (กรอกเอง)
-- สิทธิ์สอบ/สอบผ่านแล้ว นับแยกตามโครงการ (แบบทดสอบชุดเดียวกันใช้หลายโครงการ)
-- มีชุดที่ยังทำค้าง (ยังไม่หมดเวลา) → ได้ชุดเดิม (รีเฟรช/ปิดหน้าไม่ได้ข้อสอบชุดใหม่) · คืนข้อสอบโดยไม่มีเฉลย
drop function if exists trn_quiz_start(int, text, int, text, text, text);
drop function if exists trn_quiz_start(text, int, text, int, text, text, text);
create or replace function trn_quiz_start(p_site text, p_cat int, p_email text, p_reg int default null,
  p_name text default '', p_dept text default '', p_position text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q    trn_quizzes;
  c    trn_categories;
  r    trn_registrations;
  a    trn_quiz_attempts;
  used int;
  ids  int[];
begin
  select x.* into c from trn_categories x join trn_site_categories sc on sc.cat_id = x.id
    where x.id = p_cat and sc.site = p_site and sc.quiz_open;
  if found then select * into q from trn_quizzes where id = c.quiz_id and is_active; end if;
  if q.id is null then raise exception 'ไม่พบแบบทดสอบ หรือปิดใช้งานอยู่'; end if;
  p_email := lower(trim(coalesce(p_email, '')));
  if p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'กรุณากรอกอีเมลให้ถูกต้อง (ใช้ส่งใบประกาศ)'; end if;
  if exists (select 1 from trn_quiz_attempts where quiz_id = q.id and site = p_site and email = p_email and status = 'PASS') then
    raise exception 'อีเมลนี้สอบผ่านแบบทดสอบนี้แล้ว — ใบประกาศส่งไปที่อีเมลนี้แล้ว';
  end if;
  if p_reg is not null then
    select x.* into r from trn_registrations x join trn_sessions s on s.id = x.session_id
      where x.id = p_reg and s.site = p_site;
    if not found then raise exception 'ไม่พบรายชื่อผู้ลงทะเบียน'; end if;
    -- คำนำหน้า/แผนกเก็บเป็นรหัสรายการหลัก
    p_name := trim(coalesce((select value from trn_master_items where id = r.prefix_id), '') || r.fname || ' ' || r.lname);
    p_dept := coalesce((select value from trn_master_items where id = r.dept_id), ''); p_position := r.position;
  end if;
  p_name := trim(coalesce(p_name, ''));
  if p_name = '' then raise exception 'กรุณากรอกชื่อ-นามสกุล'; end if;

  select * into a from trn_quiz_attempts
    where quiz_id = q.id and site = p_site and email = p_email and status = 'started'
      and (q.time_limit_min = 0 or started_at + make_interval(mins => q.time_limit_min) > now())
    order by started_at desc limit 1;
  if not found then
    -- ครั้งที่ใช้ไป = ส่งคำตอบแล้ว + เริ่มแล้วปล่อยให้หมดเวลา
    select count(*) into used from trn_quiz_attempts
      where quiz_id = q.id and site = p_site and email = p_email
        and (status <> 'started' or (q.time_limit_min > 0 and started_at + make_interval(mins => q.time_limit_min) <= now()));
    if q.max_attempts > 0 and used >= q.max_attempts then
      raise exception 'ทำแบบทดสอบครบ % ครั้งแล้ว', q.max_attempts;
    end if;
    select array_agg(id) into ids from (
      select id from trn_quiz_questions where quiz_id = q.id and is_active order by random() limit q.questions_count) x;
    if ids is null then raise exception 'แบบทดสอบนี้ยังไม่มีข้อสอบ'; end if;
    insert into trn_quiz_attempts (quiz_id, site, cat_id, reg_id, full_name, dept, position, email, question_ids)
      values (q.id, p_site, c.id, p_reg, p_name, coalesce(p_dept, ''), coalesce(p_position, ''), p_email, ids)
      returning * into a;
  end if;
  return jsonb_build_object(
    'attempt_id', a.id, 'full_name', a.full_name, 'email', a.email,
    'started_at', a.started_at, 'now', now(), 'time_limit_min', q.time_limit_min,
    'questions', (select jsonb_agg(jsonb_build_object('id', qq.id, 'question', qq.question, 'choices', qq.choices) order by k.ord)
                  from unnest(a.question_ids) with ordinality k(qid, ord) join trn_quiz_questions qq on qq.id = k.qid));
end $$;

-- ส่งคำตอบ — ตรวจในฐานข้อมูล · ผ่าน → ออกเลขใบประกาศ · ส่งซ้ำ (กดสองครั้ง) ได้ผลเดิม
-- เกินเวลาเกิน 2 นาที (เผื่อเน็ตช้า — หน้าเว็บส่งเองเมื่อหมดเวลา) → ไม่นับคำตอบ
create or replace function trn_quiz_submit(p_attempt uuid, p_answers smallint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a    trn_quiz_attempts;
  q    trn_quizzes;
  ok   boolean[];
  sc   int;
  tot  int;
  pct  numeric(5,2);
  cid  text;
  yr   int;
  seq  int;
  late boolean;
begin
  select * into a from trn_quiz_attempts where id = p_attempt for update;
  if not found then raise exception 'ไม่พบการสอบนี้'; end if;
  select * into q from trn_quizzes where id = a.quiz_id;
  if a.status = 'started' then
    late := q.time_limit_min > 0 and now() > a.started_at + make_interval(mins => q.time_limit_min + 2);
    select array_agg(not late and qq.answer = p_answers[k.ord] order by k.ord) into ok
      from unnest(a.question_ids) with ordinality k(qid, ord) join trn_quiz_questions qq on qq.id = k.qid;
    tot := coalesce(array_length(ok, 1), 0);
    sc  := (select count(*) from unnest(ok) x where x);
    pct := case when tot > 0 then round(sc * 100.0 / tot, 2) else 0 end;
    update trn_quiz_attempts set
      answers = case when late then null else p_answers[1:array_length(a.question_ids, 1)] end,
      correct = ok, score = sc, total = tot, percent = pct, completed_at = now(),
      status = case when tot > 0 and pct >= q.pass_percent then 'PASS' else 'FAIL' end
      where id = a.id returning * into a;
    if a.status = 'PASS' then
      -- เลขที่ = รหัสหน่วยงาน-รหัสหลักสูตร(ถ้ามี)-ปี พ.ศ.-ลำดับในปีนั้น เช่น BMS-INV-2569-000001
      yr := extract(year from now() at time zone 'Asia/Bangkok')::int + 543;
      insert into trn_quiz_cert_counters (year, last) values (yr, 1)
        on conflict (year) do update set last = trn_quiz_cert_counters.last + 1
        returning last into seq;
      cid := concat_ws('-',
               coalesce(nullif(upper(trim((select value from trn_settings where key = 'cert_prefix'))), ''), 'BMS'),
               nullif(upper(trim((select cert_code from trn_categories where id = a.cat_id))), ''),
               yr, lpad(seq::text, 6, '0'));
      insert into trn_quiz_certs (cert_id, attempt_id, site, full_name, email, quiz_title, percent)
        values (cid, a.id, a.site, a.full_name, a.email,
                q.title, a.percent);
    end if;
  end if;
  return jsonb_build_object(
    'status', a.status, 'score', a.score, 'total', a.total, 'percent', a.percent, 'pass_percent', q.pass_percent,
    'email', a.email, 'correct', to_jsonb(a.correct), 'late', a.answers is null and a.status <> 'started',
    -- เฉลยเฉพาะข้อที่ตอบผิด (ส่งคำตอบแล้วเท่านั้น) · ข้อที่ถูก = null
    'review', case when a.status <> 'started' then (select jsonb_agg(case when a.correct[k.ord] then null
        else jsonb_build_object('answer', qq.answer, 'explanation', qq.explanation) end order by k.ord)
      from unnest(a.question_ids) with ordinality k(qid, ord) join trn_quiz_questions qq on qq.id = k.qid) end,
    'cert_id', (select cert_id from trn_quiz_certs where attempt_id = a.id),
    'attempts_left', case when q.max_attempts = 0 then null else greatest(0, q.max_attempts -
      (select count(*) from trn_quiz_attempts where quiz_id = q.id and site = a.site and email = a.email and status <> 'started')) end);
end $$;

-- งานของผู้ดูแล (ต้อง Login Backoffice) — p_uid/p_sig = session จาก src/utils/session.util.js
-- คลังแบบทดสอบกลาง (กระทบทุกโครงการ — ต้องมีสิทธิ์ "แก้ไข"):
--   save_quiz      {id?, title, questions_count, pass_percent, time_limit_min, max_attempts, is_active} → สร้าง/แก้ คืนแถว
--   copy_quiz      {id, title}                       → สร้างชุดใหม่จากชุดเดิม (ตั้งค่า + ข้อที่ใช้งานอยู่) คืนแถว
--   delete_quiz    {id}                              → ลบได้เฉพาะชุดที่ยังไม่มีผู้สอบ (มีแล้ว = ปิดใช้งานแทน)
--   save_questions {quiz_id, rows:[...], delete_ids}  → เพิ่ม/แก้ (มี id = แก้) / ลบ
--                    ข้อที่มีคนสอบแล้ว: แก้คำถาม/ตัวเลือก/เฉลยไม่ได้ · ลบ = ปิดข้อแทน (ผลสอบเก่ายังตรง)
-- งานของโครงการ:
--   questions      {quiz_id}                         → ข้อสอบทั้งหมดพร้อมเฉลย (+ used = มีคนสอบข้อนี้แล้ว)
--   delete_attempt {id}                              → ลบผลสอบ (ใบประกาศของครั้งนั้นหายด้วย)
--   cert           {cert_id, is_revoked?, email?}    → ยกเลิก/คืนสถานะใบประกาศ · แก้อีเมลก่อนส่งใหม่
create or replace function trn_quiz_admin(p_uid text, p_sig text, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x   jsonb;
  n   int := 0;
  k   int := 0;
  ch  jsonb;
  ans int;
  qid int := (p_data ->> 'quiz_id')::int;
  q   trn_quizzes;
begin
  if not trn_staff_ok(p_uid, p_sig) then raise exception 'ไม่มีสิทธิ์ — กรุณาเข้าสู่ระบบใหม่'; end if;
  if p_action in ('save_quiz', 'copy_quiz', 'delete_quiz', 'save_questions') and not trn_staff_ok(p_uid, p_sig, 'edit') then
    raise exception 'ไม่มีสิทธิ์แก้ไขคลังแบบทดสอบกลาง (ต้องมีสิทธิ์ "แก้ไข" ของเมนูอบรม)';
  end if;

  if p_action = 'save_quiz' then
    if trim(coalesce(p_data ->> 'title', '')) = '' then raise exception 'กรุณาใส่ชื่อแบบทดสอบ'; end if;
    if p_data ->> 'id' is null then
      insert into trn_quizzes (title) values (trim(p_data ->> 'title')) returning * into q;
    else
      select * into q from trn_quizzes where id = (p_data ->> 'id')::int;
      if not found then raise exception 'ไม่พบแบบทดสอบ'; end if;
    end if;
    update trn_quizzes set
      title           = trim(p_data ->> 'title'),
      questions_count = coalesce((p_data ->> 'questions_count')::int, questions_count),
      pass_percent    = coalesce((p_data ->> 'pass_percent')::int,    pass_percent),
      time_limit_min  = coalesce((p_data ->> 'time_limit_min')::int,  time_limit_min),
      max_attempts    = coalesce((p_data ->> 'max_attempts')::int,    max_attempts),
      is_active       = coalesce((p_data ->> 'is_active')::boolean,   is_active)
      where id = q.id returning * into q;
    return to_jsonb(q);

  elsif p_action = 'copy_quiz' then
    insert into trn_quizzes (title, pass_percent, questions_count, max_attempts, time_limit_min)
      select coalesce(nullif(trim(p_data ->> 'title'), ''), s.title || ' (สำเนา)'), s.pass_percent, s.questions_count, s.max_attempts, s.time_limit_min
      from trn_quizzes s where s.id = (p_data ->> 'id')::int
      returning * into q;
    if q.id is null then raise exception 'ไม่พบแบบทดสอบต้นฉบับ'; end if;
    insert into trn_quiz_questions (quiz_id, question, choices, answer, explanation, sort_order)
      select q.id, question, choices, answer, explanation, sort_order
      from trn_quiz_questions where quiz_id = (p_data ->> 'id')::int and is_active;
    return to_jsonb(q);

  elsif p_action = 'delete_quiz' then
    if exists (select 1 from trn_quiz_attempts where quiz_id = (p_data ->> 'id')::int) then
      raise exception 'แบบทดสอบนี้มีผู้สอบแล้ว ลบไม่ได้ (ผลสอบและใบประกาศจะหาย) — ปิดใช้งานแทน';
    end if;
    delete from trn_quizzes where id = (p_data ->> 'id')::int;
    return jsonb_build_object('ok', true);

  elsif p_action = 'questions' then
    return coalesce((select jsonb_agg(to_jsonb(qq) || jsonb_build_object('used',
                       exists (select 1 from trn_quiz_attempts t where t.quiz_id = qq.quiz_id and qq.id = any(t.question_ids)))
                     order by qq.sort_order, qq.id)
                     from trn_quiz_questions qq where qq.quiz_id = qid), '[]');

  elsif p_action = 'save_questions' then
    -- ข้อที่มีคนสอบแล้ว → ปิดแทนลบ
    update trn_quiz_questions qq set is_active = false
      where qq.quiz_id = qid and qq.id in (select jsonb_array_elements_text(coalesce(p_data -> 'delete_ids', '[]'))::int)
        and exists (select 1 from trn_quiz_attempts t where t.quiz_id = qid and qq.id = any(t.question_ids));
    get diagnostics k = row_count;
    delete from trn_quiz_questions qq where qq.quiz_id = qid
      and qq.id in (select jsonb_array_elements_text(coalesce(p_data -> 'delete_ids', '[]'))::int)
      and not exists (select 1 from trn_quiz_attempts t where t.quiz_id = qid and qq.id = any(t.question_ids));
    for x in select * from jsonb_array_elements(coalesce(p_data -> 'rows', '[]')) loop
      ch  := coalesce(x -> 'choices', '[]');
      ans := coalesce((x ->> 'answer')::int, 0);
      if trim(coalesce(x ->> 'question', '')) = '' then raise exception 'มีข้อที่ยังไม่ได้ใส่คำถาม'; end if;
      if jsonb_typeof(ch) <> 'array' or jsonb_array_length(ch) < 2 then raise exception 'แต่ละข้อต้องมีอย่างน้อย 2 ตัวเลือก'; end if;
      if ans < 0 or ans >= jsonb_array_length(ch) then raise exception 'เฉลยไม่ตรงกับตัวเลือก: %', x ->> 'question'; end if;
      if x ? 'id' and x ->> 'id' is not null then
        if exists (select 1 from trn_quiz_questions o where o.id = (x ->> 'id')::int
                     and (o.question <> trim(x ->> 'question') or o.choices <> ch or o.answer <> ans))
           and exists (select 1 from trn_quiz_attempts t where t.quiz_id = qid and (x ->> 'id')::int = any(t.question_ids)) then
          raise exception 'ข้อ "%" มีผู้สอบแล้ว แก้คำถาม/ตัวเลือก/เฉลยไม่ได้ — ปิดข้อนี้แล้วเพิ่มข้อใหม่แทน', left(x ->> 'question', 60);
        end if;
        update trn_quiz_questions set question = trim(x ->> 'question'), choices = ch, answer = ans,
          explanation = coalesce(x ->> 'explanation', ''), sort_order = coalesce((x ->> 'sort_order')::int, sort_order),
          is_active = coalesce((x ->> 'is_active')::boolean, is_active)
          where id = (x ->> 'id')::int and quiz_id = qid;
      else
        insert into trn_quiz_questions (quiz_id, question, choices, answer, explanation, sort_order, is_active)
          values (qid, trim(x ->> 'question'), ch, ans, coalesce(x ->> 'explanation', ''),
                  coalesce((x ->> 'sort_order')::int, 0), coalesce((x ->> 'is_active')::boolean, true));
      end if;
      n := n + 1;
    end loop;
    return jsonb_build_object('saved', n, 'archived', k);

  elsif p_action = 'delete_attempt' then
    delete from trn_quiz_attempts where id = (p_data ->> 'id')::uuid;
    return jsonb_build_object('ok', true);
  elsif p_action = 'cert' then
    update trn_quiz_certs set
      is_revoked = coalesce((p_data ->> 'is_revoked')::boolean, is_revoked),
      email = coalesce(nullif(lower(trim(p_data ->> 'email')), ''), email)
      where cert_id = p_data ->> 'cert_id';
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'ไม่รู้จักคำสั่ง %', p_action;
end $$;

grant execute on function trn_quiz_start(text, int, text, int, text, text, text) to anon, authenticated;
grant execute on function trn_quiz_submit(uuid, smallint[]) to anon, authenticated;
grant execute on function trn_quiz_admin(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
