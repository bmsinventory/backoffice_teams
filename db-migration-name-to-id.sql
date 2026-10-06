-- =============================================================
-- แปลงการเชื่อมโยงข้อมูลจาก "ชื่อ" เป็น "รหัส (ID)" ทั้งระบบ — รันครั้งเดียวใน SQL Editor (รันซ้ำได้ ไม่เสียหาย)
-- ต้องรัน "ก่อน" deploy โค้ดเวอร์ชันที่ใช้รหัส (โค้ดใหม่อ่านคอลัมน์รหัสเท่านั้น)
--
-- ค่าเดิมทุกช่องที่แปลงเก็บไว้ในตาราง _mig_name_to_id_backup (tbl, col, row_id, old_value, new_value)
-- ค่าที่หาคู่ไม่เจอ → ช่องนั้นเว้นว่าง (new_value = NULL ในตารางสำรอง) — ผลลัพธ์สุดท้ายของสคริปต์แสดงรายการเหล่านี้
-- ให้แก้เองในหน้าแอป · ตรวจครบแล้วลบตารางสำรองได้: DROP TABLE _mig_name_to_id_backup;
--
-- ช่องที่แปลง:
--   พนักงาน → staff.id      : projects.site_owner/installer_name, impl_tasks.owner, form_items.owner,
--                              impl_issues.received_by/fixed_by
--   ผู้ใช้ → users.id       : impl_checklist_items.done_by, impl_comments.author, impl_attachments.uploaded_by,
--                              impl_activity_log.actor, helpdesk_attachments.uploaded_by, leaves.approved_by,
--                              assist_replies.created_by/updated_by
--   แผนก/ตำแหน่งพนักงาน    : staff.department → departments.id · staff.position → positions.id
--   โครงการต้นทาง           : impl_projects.source_project_id ที่ว่าง → หาจากชื่อโครงการที่ตรงกันพอดี (ครั้งสุดท้าย)
--   ระบบอบรม (trn_master_items.id): trn_sessions.venue → venue_id · trn_registrations.dept/prefix → dept_id/prefix_id
--                              trn_login_verify.dept → dept_id · trn_key_entry_status.dept → dept_id
--                              (ค่าที่ยังไม่มีในรายการหลักของโครงการ → เพิ่มเข้ารายการหลักให้ ไม่มีข้อมูลหาย)
-- ลบคอลัมน์ที่เลิกใช้: impl_projects.hospital_name/project_manager (อ่านจากโครงการต้นทางแทน),
--   lodgings.approved/approved_at/approved_by/approved_daily_at/_by/approved_monthly_at/_by,
--   helpdesk_tickets.team, helpdesk_categories.default_team
-- =============================================================

BEGIN;

-- ── ตารางสำรองค่าเดิม ──
CREATE TABLE IF NOT EXISTS _mig_name_to_id_backup (
  tbl        TEXT NOT NULL,
  col        TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tbl, col, row_id)
);

-- ── ชื่อคนแบบไม่สนคำนำหน้า/ช่องว่างซ้ำ (เหมือน window.nameKey ในแอป) ──
CREATE OR REPLACE FUNCTION _mig_nk(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(regexp_replace(coalesce(t, ''), '^\s*(นาย|นางสาว|นาง|น\.ส\.)\s*', ''), '\s+', ' ', 'g'))
$$;

-- ── ข้อความเดิม → รหัส ตามชนิด (staff / user / dept / position) · หาไม่เจอหรือกำกวม (ตรงหลายคน) → NULL ──
CREATE OR REPLACE FUNCTION _mig_ref(p_kind TEXT, p_val TEXT) RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  t TEXT := btrim(coalesce(p_val, ''));
  r TEXT;
  n INT;
BEGIN
  IF t = '' THEN RETURN NULL; END IF;

  IF p_kind = 'staff' THEN
    SELECT coalesce(nullif(staff_id, ''), id) INTO r FROM staff WHERE coalesce(nullif(staff_id, ''), id) = t OR id = t LIMIT 1;
    IF FOUND THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(staff_id, ''), id)) INTO n, r FROM staff WHERE _mig_nk(full_name) = _mig_nk(t);
    IF n = 1 THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(staff_id, ''), id)) INTO n, r FROM staff WHERE btrim(nickname) = t;
    IF n = 1 THEN RETURN r; END IF;
    RETURN NULL;

  ELSIF p_kind = 'user' THEN
    SELECT coalesce(nullif(user_id, ''), id) INTO r FROM users WHERE coalesce(nullif(user_id, ''), id) = t OR id = t LIMIT 1;
    IF FOUND THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(user_id, ''), id)) INTO n, r FROM users WHERE t IN (btrim(name), btrim(display_name), btrim(username));
    IF n = 1 THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(user_id, ''), id)) INTO n, r FROM users WHERE _mig_nk(name) = _mig_nk(t);
    IF n = 1 THEN RETURN r; END IF;
    -- ชื่อพนักงานที่ผูกกับบัญชีผู้ใช้
    r := _mig_ref('staff', t);
    IF r IS NOT NULL THEN
      SELECT count(*), min(coalesce(nullif(user_id, ''), id)) INTO n, r FROM users WHERE staff_id = r;
      IF n = 1 THEN RETURN r; END IF;
    END IF;
    RETURN NULL;

  ELSIF p_kind = 'dept' THEN
    SELECT coalesce(nullif(dept_id, ''), id) INTO r FROM departments WHERE coalesce(nullif(dept_id, ''), id) = t OR id = t LIMIT 1;
    IF FOUND THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(dept_id, ''), id)) INTO n, r FROM departments WHERE btrim(coalesce(nullif(label_th, ''), label)) = t;
    IF n = 1 THEN RETURN r; END IF;
    RETURN NULL;

  ELSIF p_kind = 'position' THEN
    SELECT coalesce(nullif(position_id, ''), id) INTO r FROM positions WHERE coalesce(nullif(position_id, ''), id) = t OR id = t LIMIT 1;
    IF FOUND THEN RETURN r; END IF;
    SELECT count(*), min(coalesce(nullif(position_id, ''), id)) INTO n, r FROM positions WHERE btrim(coalesce(nullif(label_th, ''), label)) = t;
    IF n = 1 THEN RETURN r; END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'unknown kind %', p_kind;
END $$;

-- ── แปลงคอลัมน์หนึ่ง: สำรองค่าเดิม (ครั้งแรกเท่านั้น) แล้วเขียนรหัสทับ (หาไม่เจอ → '') ──
CREATE OR REPLACE FUNCTION _mig_conv(p_tbl TEXT, p_col TEXT, p_kind TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO _mig_name_to_id_backup (tbl, col, row_id, old_value, new_value)
     SELECT %L, %L, id::text, %I, _mig_ref(%L, %I) FROM %I WHERE coalesce(%I, '''') <> ''''
     ON CONFLICT (tbl, col, row_id) DO NOTHING',
    p_tbl, p_col, p_col, p_kind, p_col, p_tbl, p_col);
  EXECUTE format(
    'UPDATE %I t SET %I = coalesce(b.new_value, '''')
     FROM _mig_name_to_id_backup b
     WHERE b.tbl = %L AND b.col = %L AND b.row_id = t.id::text AND t.%I IS DISTINCT FROM coalesce(b.new_value, '''')',
    p_tbl, p_col, p_tbl, p_col, p_col);
END $$;

-- ══ 1) พนักงาน / ผู้ใช้ / แผนก / ตำแหน่ง ══
SELECT _mig_conv('staff',                'department',     'dept');
SELECT _mig_conv('staff',                'position',       'position');
SELECT _mig_conv('projects',             'site_owner',     'staff');
SELECT _mig_conv('projects',             'installer_name', 'staff');
SELECT _mig_conv('impl_tasks',           'owner',          'staff');
SELECT _mig_conv('form_items',           'owner',          'staff');
SELECT _mig_conv('impl_issues',          'received_by',    'staff');
SELECT _mig_conv('impl_issues',          'fixed_by',       'staff');
SELECT _mig_conv('impl_checklist_items', 'done_by',        'user');
SELECT _mig_conv('impl_comments',        'author',         'user');
SELECT _mig_conv('impl_attachments',     'uploaded_by',    'user');
SELECT _mig_conv('impl_activity_log',    'actor',          'user');
SELECT _mig_conv('helpdesk_attachments', 'uploaded_by',    'user');
SELECT _mig_conv('leaves',               'approved_by',    'user');
SELECT _mig_conv('assist_replies',       'created_by',     'user');
SELECT _mig_conv('assist_replies',       'updated_by',     'user');

-- ══ 2) โครงการต้นทางของ impl_projects ที่ยังไม่ได้ผูก — ชื่อโครงการตรงกันพอดีและไม่ซ้ำเท่านั้น ══
INSERT INTO _mig_name_to_id_backup (tbl, col, row_id, old_value, new_value)
SELECT 'impl_projects', 'source_project_id', ip.id, ip.project_name,
       (SELECT CASE WHEN count(*) = 1 THEN min(coalesce(nullif(p.project_id, ''), p.id)) END
          FROM projects p WHERE btrim(p.project_name) = btrim(ip.project_name))
FROM impl_projects ip
WHERE coalesce(ip.source_project_id, '') = ''
ON CONFLICT (tbl, col, row_id) DO NOTHING;
UPDATE impl_projects ip SET source_project_id = b.new_value
FROM _mig_name_to_id_backup b
WHERE b.tbl = 'impl_projects' AND b.col = 'source_project_id' AND b.row_id = ip.id
  AND b.new_value IS NOT NULL AND coalesce(ip.source_project_id, '') = '';

-- ══ 3) คอลัมน์ที่เลิกใช้ ══
ALTER TABLE impl_projects       DROP COLUMN IF EXISTS hospital_name;
ALTER TABLE impl_projects       DROP COLUMN IF EXISTS project_manager;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_at;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_by;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_daily_at;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_daily_by;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_monthly_at;
ALTER TABLE lodgings            DROP COLUMN IF EXISTS approved_monthly_by;
ALTER TABLE helpdesk_tickets    DROP COLUMN IF EXISTS team;
ALTER TABLE helpdesk_categories DROP COLUMN IF EXISTS default_team;

-- ══ 4) ระบบอบรม — สถานที่/แผนก/คำนำหน้า ผูกด้วย trn_master_items.id ══
-- ค่าที่ใช้อยู่แต่ยังไม่มีในรายการหลักของโครงการ → เพิ่มเข้ารายการหลัก (sort_order ท้ายสุด)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trn_sessions' AND column_name = 'venue') THEN
    INSERT INTO trn_master_items (type, value, site, sort_order)
    SELECT DISTINCT 'venue', btrim(s.venue), s.site, 999 FROM trn_sessions s
    WHERE btrim(coalesce(s.venue, '')) <> ''
      AND NOT EXISTS (SELECT 1 FROM trn_master_items m WHERE m.type = 'venue' AND m.site = s.site AND btrim(m.value) = btrim(s.venue))
    ON CONFLICT (type, value, site) DO NOTHING;

    ALTER TABLE trn_sessions ADD COLUMN IF NOT EXISTS venue_id INTEGER;
    UPDATE trn_sessions s SET venue_id = (SELECT min(m.id) FROM trn_master_items m
      WHERE m.type = 'venue' AND m.site = s.site AND btrim(m.value) = btrim(s.venue))
    WHERE btrim(coalesce(s.venue, '')) <> '';
    ALTER TABLE trn_sessions DROP COLUMN venue;
    ALTER TABLE trn_sessions ADD CONSTRAINT trn_sessions_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES trn_master_items(id) ON DELETE RESTRICT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trn_registrations' AND column_name = 'dept') THEN
    INSERT INTO trn_master_items (type, value, site, sort_order)
    SELECT DISTINCT x.type, x.val, x.site, 999 FROM (
      SELECT 'dept' AS type, btrim(r.dept) AS val, s.site FROM trn_registrations r JOIN trn_sessions s ON s.id = r.session_id
      UNION ALL
      SELECT 'prefix', btrim(r.prefix), s.site FROM trn_registrations r JOIN trn_sessions s ON s.id = r.session_id
    ) x
    WHERE x.val <> ''
      AND NOT EXISTS (SELECT 1 FROM trn_master_items m WHERE m.type = x.type AND m.site = x.site AND btrim(m.value) = x.val)
    ON CONFLICT (type, value, site) DO NOTHING;

    ALTER TABLE trn_registrations ADD COLUMN IF NOT EXISTS dept_id INTEGER;
    ALTER TABLE trn_registrations ADD COLUMN IF NOT EXISTS prefix_id INTEGER;
    UPDATE trn_registrations r SET
      dept_id   = (SELECT min(m.id) FROM trn_master_items m WHERE m.type = 'dept'   AND m.site = s.site AND btrim(m.value) = btrim(r.dept)),
      prefix_id = (SELECT min(m.id) FROM trn_master_items m WHERE m.type = 'prefix' AND m.site = s.site AND btrim(m.value) = btrim(r.prefix))
    FROM trn_sessions s WHERE s.id = r.session_id;
    ALTER TABLE trn_registrations DROP COLUMN dept;
    ALTER TABLE trn_registrations DROP COLUMN prefix;
    ALTER TABLE trn_registrations ADD CONSTRAINT trn_registrations_dept_id_fkey
      FOREIGN KEY (dept_id) REFERENCES trn_master_items(id) ON DELETE RESTRICT;
    ALTER TABLE trn_registrations ADD CONSTRAINT trn_registrations_prefix_id_fkey
      FOREIGN KEY (prefix_id) REFERENCES trn_master_items(id) ON DELETE RESTRICT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trn_login_verify' AND column_name = 'dept') THEN
    INSERT INTO trn_master_items (type, value, site, sort_order)
    SELECT DISTINCT 'dept', btrim(v.dept), v.site, 999 FROM trn_login_verify v
    WHERE btrim(coalesce(v.dept, '')) <> ''
      AND NOT EXISTS (SELECT 1 FROM trn_master_items m WHERE m.type = 'dept' AND m.site = v.site AND btrim(m.value) = btrim(v.dept))
    ON CONFLICT (type, value, site) DO NOTHING;

    ALTER TABLE trn_login_verify ADD COLUMN IF NOT EXISTS dept_id INTEGER;
    UPDATE trn_login_verify v SET dept_id = (SELECT min(m.id) FROM trn_master_items m
      WHERE m.type = 'dept' AND m.site = v.site AND btrim(m.value) = btrim(v.dept))
    WHERE btrim(coalesce(v.dept, '')) <> '';
    ALTER TABLE trn_login_verify DROP COLUMN dept; -- unique(fname,lname,dept,site) เดิมหลุดไปพร้อมคอลัมน์
    ALTER TABLE trn_login_verify ADD CONSTRAINT trn_login_verify_dept_id_fkey
      FOREIGN KEY (dept_id) REFERENCES trn_master_items(id) ON DELETE RESTRICT;
    -- NULLS NOT DISTINCT (PostgreSQL 15+): คนที่ไม่มีแผนกก็ upsert ทับแถวเดิมได้ ไม่เพิ่มแถวซ้ำ
    ALTER TABLE trn_login_verify ADD CONSTRAINT trn_login_verify_person_key
      UNIQUE NULLS NOT DISTINCT (fname, lname, dept_id, site);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trn_key_entry_status' AND column_name = 'dept') THEN
    DELETE FROM trn_key_entry_status WHERE btrim(coalesce(dept, '')) = '';
    INSERT INTO trn_master_items (type, value, site, sort_order)
    SELECT DISTINCT 'dept', btrim(k.dept), k.site, 999 FROM trn_key_entry_status k
    WHERE NOT EXISTS (SELECT 1 FROM trn_master_items m WHERE m.type = 'dept' AND m.site = k.site AND btrim(m.value) = btrim(k.dept))
    ON CONFLICT (type, value, site) DO NOTHING;

    ALTER TABLE trn_key_entry_status ADD COLUMN IF NOT EXISTS dept_id INTEGER;
    UPDATE trn_key_entry_status k SET dept_id = (SELECT min(m.id) FROM trn_master_items m
      WHERE m.type = 'dept' AND m.site = k.site AND btrim(m.value) = btrim(k.dept));
    ALTER TABLE trn_key_entry_status DROP COLUMN dept; -- unique(dept,site) เดิมหลุดไปพร้อมคอลัมน์
    ALTER TABLE trn_key_entry_status ALTER COLUMN dept_id SET NOT NULL;
    ALTER TABLE trn_key_entry_status ADD CONSTRAINT trn_key_entry_status_dept_id_fkey
      FOREIGN KEY (dept_id) REFERENCES trn_master_items(id) ON DELETE CASCADE;
    ALTER TABLE trn_key_entry_status ADD CONSTRAINT trn_key_entry_status_dept_site_key UNIQUE (dept_id, site);
  END IF;
END $$;

-- เริ่มสอบ: คำนำหน้า/แผนกของผู้ลงทะเบียนอ่านจากรายการหลัก (ส่วนที่เหลือเหมือนเดิมทุกอย่าง — ตัวจริงอยู่ใน db-training.sql)
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
grant execute on function trn_quiz_start(text, int, text, int, text, text, text) to anon, authenticated;

DROP FUNCTION _mig_conv(TEXT, TEXT, TEXT);
DROP FUNCTION _mig_ref(TEXT, TEXT);
DROP FUNCTION _mig_nk(TEXT);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ══ ผลลัพธ์: ค่าที่หาคู่ไม่เจอ (ช่องถูกเว้นว่างไว้) — แก้เองในแอปตามรายการนี้ ══
-- impl_projects/source_project_id = โครงการติดตามสถานะที่ยังไม่ได้ผูกโครงการต้นทาง (ทีม/PM จะไม่แสดง) → แก้ไขโครงการแล้วเลือกโครงการต้นทาง
SELECT tbl AS ตาราง, col AS คอลัมน์, row_id AS รหัสแถว, old_value AS ค่าเดิม
FROM _mig_name_to_id_backup
WHERE new_value IS NULL
ORDER BY 1, 2, 4;
