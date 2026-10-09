-- Migration เฉพาะฟีเจอร์ Helpdesk AI Auto Reply
-- ไม่แก้ตาราง/โมดูลอื่น และรันซ้ำได้
-- ต้องมี Helpdesk + Web Push worker เดิมอยู่ก่อนแล้ว

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.settings') IS NULL
     OR to_regclass('public.helpdesk_tickets') IS NULL
     OR to_regclass('public.helpdesk_ticket_events') IS NULL
     OR to_regclass('public.helpdesk_attachments') IS NULL THEN
    RAISE EXCEPTION 'Helpdesk schema is missing; stop AI Auto Reply migration';
  END IF;
  IF to_regprocedure('public._web_push_worker_check(text)') IS NULL THEN
    RAISE EXCEPTION 'Web Push worker security function is missing; run the existing Web Push migration first';
  END IF;
END $$;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS helpdesk_ai_auto_reply JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS helpdesk_ai_reply_jobs (
  id                TEXT PRIMARY KEY,
  inbound_event_id  TEXT NOT NULL UNIQUE,
  ticket_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  last_error        TEXT DEFAULT '',
  skip_reason       TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hd_ai_jobs_due
  ON helpdesk_ai_reply_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_hd_ai_jobs_ticket
  ON helpdesk_ai_reply_jobs (ticket_id, created_at);
ALTER TABLE helpdesk_ai_reply_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_helpdesk_ai_reply_jobs" ON helpdesk_ai_reply_jobs;

CREATE TABLE IF NOT EXISTS helpdesk_ai_audit_logs (
  id                TEXT PRIMARY KEY,
  job_id            TEXT DEFAULT '',
  ticket_id         TEXT DEFAULT '',
  inbound_event_id  TEXT DEFAULT '',
  action            TEXT NOT NULL DEFAULT '',
  reason            TEXT DEFAULT '',
  confidence        TEXT DEFAULT '',
  response_kind     TEXT DEFAULT '',
  model             TEXT DEFAULT '',
  raw_response      TEXT DEFAULT '',
  metadata          JSONB DEFAULT '{}',
  raw_expires_at    TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hd_ai_audit_expiry
  ON helpdesk_ai_audit_logs (expires_at);
ALTER TABLE helpdesk_ai_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_helpdesk_ai_audit_logs" ON helpdesk_ai_audit_logs;

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
    ORDER BY q.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 20)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_context(p_secret TEXT, p_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out_json JSONB;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT jsonb_build_object(
    'job', to_jsonb(j),
    'ticket', jsonb_build_object(
      'id', t.id, 'ticket_no', t.ticket_no, 'channel', t.channel,
      'hospital_id', t.hospital_id, 'source_system', t.source_system,
      'category_id', t.category_id, 'subject', t.subject,
      'description', t.description, 'priority', t.priority,
      'status', t.status, 'first_response_at', t.first_response_at,
      'created_at', t.created_at
    ),
    'settings', COALESCE(
      (SELECT s.helpdesk_ai_auto_reply FROM settings s WHERE s.id = 'app'),
      '{}'::jsonb
    ),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(e0) ORDER BY e0.created_at)
      FROM (
        SELECT e.id, e.type, e.actor_type, e.actor_id, e.body, e.meta, e.created_at
        FROM helpdesk_ticket_events e
        WHERE e.ticket_id = t.id AND NOT COALESCE(e.is_internal, false)
        ORDER BY e.created_at DESC
        LIMIT 30
      ) e0
    ), '[]'::jsonb),
    'attachments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'event_id', a.event_id, 'file_name', a.file_name,
        'mime', a.mime, 'created_at', a.created_at
      ))
      FROM helpdesk_attachments a
      WHERE a.ticket_id = t.id
    ), '[]'::jsonb),
    'holidays', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', h.date, 'name', h.name))
      FROM holidays h
    ), '[]'::jsonb),
    -- คลังความรู้ทั้งหมด (วิธีแก้ล่าสุดต่อ Ticket) — worker เลือกเรื่องที่คล้ายเอง จึงห้ามตัดเหลือแค่ช่วงล่าสุด
    'knowledge', COALESCE((
      SELECT jsonb_agg(to_jsonb(k0))
      FROM (
        SELECT * FROM (
          SELECT DISTINCT ON (ke.ticket_id)
                 kt.id AS ticket_id, kt.subject, kt.description,
                 kt.source_system, kt.category_id,
                 regexp_replace(ke.body, '^วิธีแก้ไข\s*[:：]\s*', '', 'i') AS fix,
                 ke.created_at
          FROM helpdesk_ticket_events ke
          JOIN helpdesk_tickets kt ON kt.id = ke.ticket_id
          WHERE ke.type = 'comment' AND ke.body ~* '^วิธีแก้ไข\s*[:：]'
          ORDER BY ke.ticket_id, ke.created_at DESC
        ) d
        ORDER BY d.created_at DESC
        LIMIT 3000
      ) k0
    ), '[]'::jsonb),
    -- ปัญหาในโครงการติดตั้งที่มีวิธีแก้แล้ว (ชุดเดียวกับที่ปุ่ม AI ช่วยวิเคราะห์ใช้)
    'impl_knowledge', COALESCE((
      SELECT jsonb_agg(to_jsonb(i0))
      FROM (
        SELECT ii.problem, ii.solution AS fix, ii.category
        FROM impl_issues ii
        WHERE COALESCE(ii.solution,'') <> '' AND COALESCE(ii.problem,'') <> ''
        ORDER BY ii.updated_at DESC NULLS LAST
        LIMIT 3000
      ) i0
    ), '[]'::jsonb)
  ) INTO out_json
  FROM helpdesk_ai_reply_jobs j
  JOIN helpdesk_tickets t ON t.id = j.ticket_id
  WHERE j.id = p_id;

  RETURN COALESCE(out_json, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_reschedule(
  p_secret TEXT, p_id TEXT, p_when TIMESTAMPTZ, p_reason TEXT DEFAULT ''
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  UPDATE helpdesk_ai_reply_jobs SET
    status = 'pending', attempts = GREATEST(attempts - 1, 0),
    next_attempt_at = GREATEST(COALESCE(p_when, NOW()), NOW() + INTERVAL '5 seconds'),
    skip_reason = LEFT(COALESCE(p_reason, ''), 500), updated_at = NOW()
  WHERE id = p_id AND status = 'processing';
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_skip(
  p_secret TEXT, p_id TEXT, p_reason TEXT,
  p_raw_response TEXT DEFAULT '', p_metadata JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j helpdesk_ai_reply_jobs%ROWTYPE;
  cfg JSONB;
  audit_days INTEGER;
  raw_days INTEGER;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN; END IF;

  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb)
  INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30,
    COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  raw_days := LEAST(365, GREATEST(1,
    COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));

  UPDATE helpdesk_ai_reply_jobs SET
    status = 'skipped', skip_reason = LEFT(COALESCE(p_reason, ''), 500),
    processed_at = NOW(), updated_at = NOW()
  WHERE id = p_id;

  INSERT INTO helpdesk_ai_audit_logs (
    id, job_id, ticket_id, inbound_event_id, action, reason,
    raw_response, metadata, raw_expires_at, expires_at
  ) VALUES (
    'AIL' || md5(random()::text || clock_timestamp()::text),
    j.id, j.ticket_id, j.inbound_event_id, 'skipped',
    LEFT(COALESCE(p_reason,''),1000), LEFT(COALESCE(p_raw_response,''),8000),
    COALESCE(p_metadata,'{}'::jsonb),
    NOW() + make_interval(days => raw_days),
    NOW() + make_interval(days => audit_days)
  );
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_fail(
  p_secret TEXT, p_id TEXT, p_error TEXT, p_raw_response TEXT DEFAULT ''
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j helpdesk_ai_reply_jobs%ROWTYPE;
  cfg JSONB;
  tech_days INTEGER;
  raw_days INTEGER;
  final_fail BOOLEAN;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN; END IF;

  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb)
  INTO cfg FROM settings WHERE id = 'app';
  tech_days := LEAST(3650, GREATEST(30,
    COALESCE(NULLIF(cfg->>'technical_log_days','')::INTEGER, 365)));
  raw_days := LEAST(365, GREATEST(1,
    COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));
  final_fail := j.attempts >= 5;

  UPDATE helpdesk_ai_reply_jobs SET
    status = CASE WHEN final_fail THEN 'failed' ELSE 'pending' END,
    next_attempt_at = NOW() + LEAST(
      INTERVAL '15 minutes',
      INTERVAL '15 seconds' * POWER(2, GREATEST(attempts - 1, 0))
    ),
    processed_at = CASE WHEN final_fail THEN NOW() ELSE processed_at END,
    last_error = LEFT(COALESCE(p_error,''),1000), updated_at = NOW()
  WHERE id = p_id;

  INSERT INTO helpdesk_ai_audit_logs (
    id, job_id, ticket_id, inbound_event_id, action, reason,
    raw_response, raw_expires_at, expires_at
  ) VALUES (
    'AIL' || md5(random()::text || clock_timestamp()::text),
    j.id, j.ticket_id, j.inbound_event_id, 'error',
    LEFT(COALESCE(p_error,''),1000), LEFT(COALESCE(p_raw_response,''),8000),
    NOW() + make_interval(days => raw_days),
    NOW() + make_interval(days => tech_days)
  );
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_send(
  p_secret TEXT, p_id TEXT, p_body TEXT, p_model TEXT,
  p_confidence TEXT, p_kind TEXT, p_reason TEXT,
  p_raw_response TEXT DEFAULT ''
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j helpdesk_ai_reply_jobs%ROWTYPE;
  t helpdesk_tickets%ROWTYPE;
  inbound_at TIMESTAMPTZ;
  cfg JSONB;
  audit_days INTEGER;
  raw_days INTEGER;
  max_replies INTEGER;
  ai_count INTEGER;
  handoff_count INTEGER;
  return_hours INTEGER;
  inbound_id TEXT;
  last_agent TIMESTAMPTZ;
  event_id TEXT;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT * INTO j FROM helpdesk_ai_reply_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'processing' THEN RETURN 'not_processing'; END IF;

  -- revisit:<event> = งานนัดกลับมาตอบข้อความเดิม หลังแจ้งรอทีมแล้วทีมยังไม่ตอบ
  inbound_id := regexp_replace(j.inbound_event_id, '^revisit:', '');
  SELECT * INTO t FROM helpdesk_tickets WHERE id = j.ticket_id FOR UPDATE;
  SELECT created_at INTO inbound_at
  FROM helpdesk_ticket_events WHERE id = inbound_id;
  IF inbound_at IS NULL AND inbound_id = 'ticket:' || j.ticket_id THEN
    inbound_at := t.created_at;
  END IF;

  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb)
  INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30,
    COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  raw_days := LEAST(365, GREATEST(1,
    COALESCE(NULLIF(cfg->>'raw_log_days','')::INTEGER, 30)));
  max_replies := LEAST(10, GREATEST(1,
    COALESCE(NULLIF(cfg->>'max_auto_replies','')::INTEGER, 2)));
  return_hours := LEAST(168, GREATEST(0,
    COALESCE(NULLIF(cfg->>'return_after_hours','')::INTEGER, 24)));

  IF LOWER(COALESCE(cfg->>'enabled', 'false')) <> 'true' THEN
    PERFORM helpdesk_ai_worker_skip(
      p_secret, p_id, 'feature_disabled', p_raw_response, '{}'::jsonb
    );
    RETURN 'skipped';
  END IF;

  IF t.id IS NULL OR inbound_at IS NULL
     OR t.status IN ('resolved','closed','cancelled') THEN
    PERFORM helpdesk_ai_worker_skip(
      p_secret, p_id, 'ticket_not_open', p_raw_response, '{}'::jsonb
    );
    RETURN 'skipped';
  END IF;

  IF EXISTS (
    SELECT 1 FROM helpdesk_ticket_events e
    WHERE e.ticket_id = j.ticket_id AND e.created_at > inbound_at
      AND e.type = 'comment' AND e.actor_type = 'agent'
      AND NOT COALESCE(e.is_internal,false)
  ) THEN
    PERFORM helpdesk_ai_worker_skip(
      p_secret, p_id, 'human_replied_first', p_raw_response, '{}'::jsonb
    );
    RETURN 'skipped';
  END IF;

  IF EXISTS (
    SELECT 1 FROM helpdesk_ticket_events e
    WHERE e.ticket_id = j.ticket_id AND e.created_at > inbound_at
      AND e.type = 'comment' AND e.actor_type = 'reporter'
      AND NOT COALESCE(e.is_internal,false)
  ) THEN
    PERFORM helpdesk_ai_worker_skip(
      p_secret, p_id, 'superseded_by_newer_customer_message',
      p_raw_response, '{}'::jsonb
    );
    RETURN 'skipped';
  END IF;

  SELECT MAX(e.created_at) INTO last_agent
  FROM helpdesk_ticket_events e
  WHERE e.ticket_id = j.ticket_id AND e.type = 'comment'
    AND e.actor_type = 'agent' AND NOT COALESCE(e.is_internal,false);

  -- นับคำตอบ AI ตั้งแต่เจ้าหน้าที่ตอบล่าสุด และไม่เกิน return_after_hours ย้อนหลัง (ต้องตรงกับ push-worker)
  -- ไม่นับข้อความแจ้งรอทีม (kind=handoff) · ครบจำนวนแล้วส่ง handoff ได้ 1 ครั้งต่อรอบ
  SELECT COUNT(*) FILTER (WHERE COALESCE(e.meta->>'kind','') <> 'handoff'),
         COUNT(*) FILTER (WHERE e.meta->>'kind' = 'handoff')
  INTO ai_count, handoff_count
  FROM helpdesk_ticket_events e
  WHERE e.ticket_id = j.ticket_id AND e.type = 'comment'
    AND e.actor_type = 'ai'
    AND e.created_at > GREATEST(
      COALESCE(last_agent, '-infinity'::timestamptz),
      CASE WHEN return_hours > 0 THEN NOW() - make_interval(hours => return_hours)
           ELSE '-infinity'::timestamptz END
    );

  IF (p_kind = 'handoff' AND handoff_count > 0)
     OR (COALESCE(p_kind,'') <> 'handoff' AND ai_count >= max_replies) THEN
    PERFORM helpdesk_ai_worker_skip(
      p_secret, p_id, 'max_auto_replies_reached',
      p_raw_response, '{}'::jsonb
    );
    RETURN 'skipped';
  END IF;

  event_id := 'HDAI' || md5(random()::text || clock_timestamp()::text);
  INSERT INTO helpdesk_ticket_events (
    id, ticket_id, type, actor_type, actor_id,
    body, meta, is_internal, created_at
  ) VALUES (
    event_id, j.ticket_id, 'comment', 'ai', 'ai-auto-reply',
    LEFT(COALESCE(p_body,''),3000),
    jsonb_build_object(
      'ai_auto',true, 'in_reply_to',inbound_id,
      'confidence',COALESCE(p_confidence,''),
      'kind',COALESCE(p_kind,''), 'model',COALESCE(p_model,'')
    ),
    false, NOW()
  );

  -- แจ้งรอทีมแล้ว → นัดกลับมาตอบข้อความนี้อีกครั้งถ้าทีมยังไม่ตอบ
  -- (เจ้าหน้าที่ตอบ/ลูกค้าส่งข้อความใหม่ → trigger ยกเลิกงานนัดนี้)
  IF p_kind = 'handoff' AND return_hours > 0 THEN
    INSERT INTO helpdesk_ai_reply_jobs (id, inbound_event_id, ticket_id, next_attempt_at)
    VALUES ('ai:revisit:' || inbound_id, 'revisit:' || inbound_id, j.ticket_id,
            NOW() + make_interval(hours => return_hours) + INTERVAL '5 seconds')
    ON CONFLICT (inbound_event_id) DO NOTHING;
  END IF;

  UPDATE helpdesk_tickets SET
    first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW()
  WHERE id = j.ticket_id;

  UPDATE helpdesk_ai_reply_jobs SET
    status = 'sent', processed_at = NOW(), updated_at = NOW(),
    last_error = '', skip_reason = ''
  WHERE id = p_id;

  INSERT INTO helpdesk_ai_audit_logs (
    id, job_id, ticket_id, inbound_event_id, action, reason,
    confidence, response_kind, model, raw_response,
    metadata, raw_expires_at, expires_at
  ) VALUES (
    'AIL' || md5(random()::text || clock_timestamp()::text),
    j.id, j.ticket_id, j.inbound_event_id, 'sent',
    LEFT(COALESCE(p_reason,''),1000), LEFT(COALESCE(p_confidence,''),20),
    LEFT(COALESCE(p_kind,''),30), LEFT(COALESCE(p_model,''),200),
    LEFT(COALESCE(p_raw_response,''),8000),
    jsonb_build_object('event_id',event_id),
    NOW() + make_interval(days => raw_days),
    NOW() + make_interval(days => audit_days)
  );

  RETURN 'sent';
END $$;

CREATE OR REPLACE FUNCTION helpdesk_ai_worker_cleanup(p_secret TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg JSONB;
  audit_days INTEGER;
  tech_days INTEGER;
  cleared_raw INTEGER;
  deleted_audit INTEGER;
  deleted_orphan INTEGER;
  deleted_jobs INTEGER;
BEGIN
  PERFORM _web_push_worker_check(p_secret);
  SELECT COALESCE(helpdesk_ai_auto_reply, '{}'::jsonb)
  INTO cfg FROM settings WHERE id = 'app';
  audit_days := LEAST(3650, GREATEST(30,
    COALESCE(NULLIF(cfg->>'audit_log_days','')::INTEGER, 180)));
  tech_days := LEAST(3650, GREATEST(30,
    COALESCE(NULLIF(cfg->>'technical_log_days','')::INTEGER, 365)));

  UPDATE helpdesk_ai_audit_logs SET raw_response = ''
  WHERE raw_response <> '' AND raw_expires_at <= NOW();
  GET DIAGNOSTICS cleared_raw = ROW_COUNT;

  DELETE FROM helpdesk_ai_audit_logs a USING helpdesk_tickets t
  WHERE t.id = a.ticket_id AND t.status IN ('resolved','closed','cancelled')
    AND COALESCE(t.closed_at, t.resolved_at, t.updated_at, t.created_at)
        < NOW() - make_interval(days => audit_days);
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;

  DELETE FROM helpdesk_ai_audit_logs a
  WHERE NOT EXISTS (
    SELECT 1 FROM helpdesk_tickets t WHERE t.id = a.ticket_id
  ) AND a.expires_at <= NOW();
  GET DIAGNOSTICS deleted_orphan = ROW_COUNT;
  deleted_audit := deleted_audit + deleted_orphan;

  DELETE FROM helpdesk_ai_reply_jobs
  WHERE status IN ('sent','skipped','failed')
    AND processed_at < NOW() - make_interval(days => tech_days);
  GET DIAGNOSTICS deleted_jobs = ROW_COUNT;

  RETURN jsonb_build_object(
    'raw_cleared',cleared_raw,
    'audit_deleted',deleted_audit,
    'jobs_deleted',deleted_jobs
  );
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

COMMIT;

-- ตรวจหลังรัน: ต้องได้ 2 ตาราง, 2 trigger และคอลัมน์ตั้งค่า 1 รายการ
SELECT to_regclass('public.helpdesk_ai_reply_jobs') AS jobs_table,
       to_regclass('public.helpdesk_ai_audit_logs') AS audit_table;
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN ('trg_helpdesk_ai_reply_queue','trg_helpdesk_ai_new_ticket')
ORDER BY trigger_name;
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'settings'
  AND column_name = 'helpdesk_ai_auto_reply';
