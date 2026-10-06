/**
 * helpdesk.service.js — Helpdesk (ศูนย์ช่วยเหลือ): Data Layer
 * ต้องโหลดหลัง db.service.js + helpdesk.config.js
 * ลงทะเบียน onSnapshot ของตัวเองแบบ background สำหรับ collection ของ helpdesk เอง (ไม่แตะ
 * realtime.service.js เดิม) เลียนแบบ pattern ของ site-notice-form.service.js — ข้อยกเว้นเดียวคือ
 * SETTINGS/app: ห้ามเปิด onSnapshot ซ้ำบน doc เดียวกับที่ realtime.service.js subscribe ไว้แล้ว
 * (Supabase realtime ไม่รองรับ เคยทำให้ ImplTrackerService/FormTrackerService.setup() พังตามไปด้วย)
 * จึงแค่ export window.hdApplySettingsOverrides ให้ realtime.service.js เรียกกลับมาแทน ──
 */
(function () {

  // ── Transform: raw DB row → app object ──
  function tTicket(d) {
    return {
      id: d.id,
      ticketNo: d.ticket_no || '',
      channel: d.channel || 'line',
      hospitalId: d.hospital_id || '',
      reporterName: d.reporter_name || '',
      reporterPhone: d.reporter_phone || '',
      reporterEmail: d.reporter_email || '',
      reporterPosition: d.reporter_position || '',
      reporterDept: d.reporter_dept || '',
      lineGroupRef: d.line_group_ref || '',
      sourceSystem: d.source_system || '',
      categoryId: d.category_id || '',
      subject: d.subject || '',
      description: d.description || '',
      priority: d.priority || 'p3',
      status: d.status || 'new',
      assigneeId: d.assignee_id || '',
      slaPolicyId: d.sla_policy_id || '',
      firstResponseAt: d.first_response_at || '',
      firstResponseDue: d.first_response_due || '',
      resolutionDue: d.resolution_due || '',
      resolvedAt: d.resolved_at || '',
      closedAt: d.closed_at || '',
      pendingSince: d.pending_since || '',
      pendingTotalMins: Number(d.pending_total_mins) || 0,
      frtBreached: d.frt_breached === true,
      resolutionBreached: d.resolution_breached === true,
      reopenedCount: Number(d.reopened_count) || 0,
      csatScore: d.csat_score == null ? null : Number(d.csat_score),
      accessToken: d.access_token || '',
      publicViewExpiresAt: d.public_view_expires_at || '',
      ratedAt: d.rated_at || '',
      tags: Array.isArray(d.tags) ? d.tags : [],
      createdBy: d.created_by || '',
      createdAt: d.created_at || '',
      updatedAt: d.updated_at || '',
    };
  }
  function tCategory(d) {
    return {
      id: d.id, name: d.name || '', parentId: d.parent_id || '',
      defaultPriority: d.default_priority || 'p3', defaultAssigneeId: d.default_assignee_id || '',
      active: d.active !== false, sort: Number(d.sort) || 0,
    };
  }
  function tSla(d) {
    return {
      id: d.id, priority: d.priority || '',
      firstResponseMins: Number(d.first_response_mins) || 240,
      resolutionMins: Number(d.resolution_mins) || 4320,
      businessHoursOnly: d.business_hours_only !== false,
      active: d.active !== false,
    };
  }

  // ── รวม default + override (label/color/icon/priority) เป็นชุดที่ใช้งานจริง — เรียกทุกครั้งที่
  // settings.app เปลี่ยน (ดู onSnapshot ท้ายไฟล์) ไม่แก้ default array ตรง ๆ กันข้อมูลเก่าค้างตอน
  // Admin ล้าง override กลับเป็นค่าเริ่มต้น ──
  function hdApplyOptionOverrides(defaults, overrides, fields) {
    return (defaults || []).map(function (base) {
      var ov = (overrides || {})[base.id], out = Object.assign({}, base);
      if (ov) fields.forEach(function (f) { if (ov[f] !== undefined && ov[f] !== null && String(ov[f]) !== '') out[f] = ov[f]; });
      return out;
    });
  }
  window.hdApplyOptionOverrides = hdApplyOptionOverrides; // ใช้ซ้ำใน helpdesk.js สำหรับ optimistic update หน้า Admin

  // ── ID / code generators (ตาม convention เดิม: prefix + Date.now()) ──
  window.hdUid = function () { return 'HD' + Date.now() + Math.floor(Math.random() * 1000); };

  window.hdGenTicketNo = function () {
    var now = new Date();
    var be2 = String((now.getFullYear() + 543) % 100).padStart(2, '0');
    var mm  = String(now.getMonth() + 1).padStart(2, '0');
    var prefix = 'HD' + be2 + mm;
    var nums = (window.HELPDESK_TICKETS || [])
      .filter(function (t) { return t.ticketNo && t.ticketNo.indexOf(prefix) === 0; })
      .map(function (t) { var n = parseInt(t.ticketNo.slice(prefix.length), 10); return isNaN(n) ? 0 : n; });
    var max = nums.length ? Math.max.apply(null, nums) : 0;
    return prefix + String(max + 1).padStart(4, '0');
  };

  // ── เลขที่ Ticket ถัดไป อ่านเลขล่าสุดจากฐานข้อมูลจริง — รายการในเครื่อง (HELPDESK_TICKETS) อาจยังไม่ทันล่าสุด
  // เช่น ตอนสร้างหลายใบติดกัน realtime ดึงข้อมูลเสร็จช้าแล้วทับรายการด้วยชุดเก่า ทำให้ได้เลขซ้ำ ──
  window.hdNextTicketNo = async function () {
    var local = window.hdGenTicketNo(), prefix = local.slice(0, 6);
    var n = parseInt(local.slice(prefix.length), 10) || 1;
    var db = window.getDb && window.getDb();
    if (db) {
      var r = await db.from('helpdesk_tickets').select('ticket_no').like('ticket_no', prefix + '%');
      (r.data || []).forEach(function (x) {
        var k = parseInt(String(x.ticket_no || '').slice(prefix.length), 10);
        if (!isNaN(k) && k >= n) n = k + 1;
      });
    }
    return prefix + String(n).padStart(4, '0');
  };

  window.hdGenToken = function () {
    var s = '';
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 40; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  };

  // ── Working-hours date math (ฝั่ง client — P0 ไม่มี pg_cron) ──
  function _ymd(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function _isHoliday(dt) {
    var key = _ymd(dt);
    return (window.HOLIDAYS || []).some(function (h) { return h.date === key; });
  }
  function _atMin(dt, minsOfDay) {
    var d = new Date(dt);
    d.setHours(Math.floor(minsOfDay / 60), minsOfDay % 60, 0, 0);
    return d;
  }
  window.hdAddWorkingMinutes = function (start, mins) {
    var BH = window.HD_BIZ_HOURS;
    var cur = new Date(start);
    var remaining = Math.max(0, Math.round(mins));
    var guard = 0;
    while (remaining > 0 && guard < 3000) {
      guard++;
      var isWorkday = BH.days.indexOf(cur.getDay()) > -1 && !_isHoliday(cur);
      if (!isWorkday) { cur = _atMin(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1), BH.startMin); continue; }
      var winStart = _atMin(cur, BH.startMin);
      var winEnd   = _atMin(cur, BH.endMin);
      if (cur < winStart) cur = winStart;
      if (cur >= winEnd) { cur = _atMin(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1), BH.startMin); continue; }
      var availMin = Math.floor((winEnd - cur) / 60000);
      if (availMin >= remaining) { cur = new Date(cur.getTime() + remaining * 60000); remaining = 0; }
      else { remaining -= availMin; cur = _atMin(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1), BH.startMin); }
    }
    return cur;
  };

  // ── คำนวณ due date จาก priority + เวลาเริ่ม ──
  window.hdCalcDue = function (priority, fromDate) {
    var from = fromDate ? new Date(fromDate) : new Date();
    var pol = (window.HELPDESK_SLA || []).find(function (p) { return p.priority === priority; });
    if (!pol) return { slaPolicyId: '', firstResponseDue: '', resolutionDue: '' };
    var frt, res;
    if (pol.businessHoursOnly) {
      frt = window.hdAddWorkingMinutes(from, pol.firstResponseMins);
      res = window.hdAddWorkingMinutes(from, pol.resolutionMins);
    } else {
      frt = new Date(from.getTime() + pol.firstResponseMins * 60000);
      res = new Date(from.getTime() + pol.resolutionMins * 60000);
    }
    return { slaPolicyId: pol.id, firstResponseDue: frt.toISOString(), resolutionDue: res.toISOString() };
  };

  // ── Optimistic Local Update (transform ใน realtime.service.js เป็น closure ส่วนตัว ไม่รู้จัก collection นี้) ──
  window.hdApplyLocal = function (id, rawData) {
    var arr = window.HELPDESK_TICKETS;
    var obj = tTicket(Object.assign({ id: id }, rawData));
    var idx = arr.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
  };
  window.hdRemoveLocal = function (id) {
    window.HELPDESK_TICKETS = window.HELPDESK_TICKETS.filter(function (x) { return x.id !== id; });
  };

  // ── Ticket events: อ่าน/เขียนตรงผ่าน raw client (ไม่ทำเป็น global store) ──
  window.hdFetchEvents = async function (ticketId, includeInternal) {
    var db = window.getDb && window.getDb();
    if (!db) return [];
    var q = db.from('helpdesk_ticket_events').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    if (!includeInternal) q = q.eq('is_internal', false);
    var res = await q;
    if (res.error) { console.warn('[helpdesk] fetchEvents:', res.error); return []; }
    return res.data || [];
  };

  window.hdAddEvent = async function (ticketId, ev) {
    var row = {
      id: window.hdUid(),
      ticket_id: ticketId,
      type: ev.type || 'comment',
      actor_type: ev.actorType || 'agent',
      actor_id: ev.actorId || '',
      body: ev.body || '',
      meta: ev.meta || {},
      is_internal: !!ev.isInternal,
    };
    if (ev.createdAt) row.created_at = ev.createdAt;   // ระบุเวลาย้อนหลัง (ใช้ตอนนำเข้าข้อมูลเก่า)
    await window.setDoc(window.getDocRef('HELPDESK_TICKET_EVENTS', row.id), row);
    window.hdLastForget && window.hdLastForget(ticketId); // คิวงานดึง "ข้อความล่าสุด" ของ Ticket นี้ใหม่
    return row;
  };

  // ── Attachments (Storage bucket: helpdesk) ──
  window.HD_ATTACH_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt';
  window.HD_ATTACH_HINT = 'รองรับ: รูปภาพ (jpg, jpeg, png, gif, webp) · PDF · Word (doc, docx) · Excel (xls, xlsx) · txt — ไม่เกิน 15MB/ไฟล์';
  window.HD_ATTACH_MAX = 15 * 1024 * 1024; // 15MB/ไฟล์

  window.hdUploadFile = async function (ticketId, eventId, file, uploadedBy) {
    var db = window.getDb && window.getDb();
    if (!db) throw new Error('ไม่ได้เชื่อมต่อฐานข้อมูล');
    if (file.size > window.HD_ATTACH_MAX) throw new Error('ไฟล์ "' + file.name + '" ใหญ่เกิน 15MB');
    var path = window.storageKey(ticketId, file.name);
    var up = await db.storage.from('helpdesk').upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (up.error) throw up.error;
    var pub = db.storage.from('helpdesk').getPublicUrl(path);
    var id = window.hdUid();
    var row = {
      id: id, ticket_id: ticketId, event_id: eventId || '',
      file_name: file.name, file_url: pub.data.publicUrl,
      mime: file.type || '', size_bytes: file.size, uploaded_by: uploadedBy || '',
    };
    await window.setDoc(window.getDocRef('HELPDESK_ATTACHMENTS', id), row);
    return row;
  };

  window.hdFetchAttachments = async function (ticketId) {
    var db = window.getDb && window.getDb();
    if (!db) return [];
    var res = await db.from('helpdesk_attachments').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    if (res.error) { console.warn('[helpdesk] fetchAttachments:', res.error); return []; }
    return res.data || [];
  };

  window.hdIsImage = function (mime, name) {
    return /^image\//.test(mime || '') || /\.(jpe?g|png|gif|webp)$/i.test(name || '');
  };

  // ── AI ช่วยวิเคราะห์ — ตัวเรียก AI กลางอยู่ที่ src/services/ai.service.js (aiChat / aiChatJson) ──

  // ── คลังความรู้ (Knowledge Base) = comment ในไทม์ไลน์ที่ขึ้นต้น "วิธีแก้ไข:" (บันทึกตอนปิดงาน / นำเข้าข้อมูลเก่า)
  // ใช้ทั้งแท็บ "คลังความรู้" และเป็นตัวอย่างให้ AI (hdAiSimilar) — cache สั้น ๆ กันยิงซ้ำถี่ ──
  var _kbCache = null, _kbAt = 0;
  window.hdKbInvalidate = function () { _kbCache = null; };
  window.hdKbFetch = async function () {
    if (_kbCache && Date.now() - _kbAt < 120000) return _kbCache;
    var db = window.getDb && window.getDb();
    if (!db) return [];
    var er = await db.from('helpdesk_ticket_events').select('ticket_id,body,actor_id,created_at')
      .eq('type', 'comment').like('body', 'วิธีแก้ไข%').order('created_at', { ascending: false }).limit(1000);
    if (er.error) { console.warn('[helpdesk] kbFetch:', er.error); return []; }
    var seen = {}, evs = [];
    (er.data || []).forEach(function (e) { // ต่อ Ticket เอาอันล่าสุด (เรียงใหม่ → เก่า)
      if (seen[e.ticket_id] || !/^วิธีแก้ไข\s*[:：]/.test(e.body || '')) return;
      seen[e.ticket_id] = true; evs.push(e);
    });
    var tk = {}, ids = evs.map(function (e) { return e.ticket_id; });
    for (var i = 0; i < ids.length; i += 150) {
      var tr = await db.from('helpdesk_tickets').select('id,ticket_no,subject,description,category_id,hospital_id,source_system')
        .in('id', ids.slice(i, i + 150));
      (tr.data || []).forEach(function (r) { tk[r.id] = r; });
    }
    _kbCache = evs.filter(function (e) { return tk[e.ticket_id]; }).map(function (e) {
      var r = tk[e.ticket_id];
      return {
        ticketId: r.id, ticketNo: r.ticket_no || '', subject: r.subject || '', description: r.description || '',
        categoryId: r.category_id || '', hospitalId: r.hospital_id || '', sourceSystem: r.source_system || '',
        fix: String(e.body || '').replace(/^วิธีแก้ไข\s*[:：]\s*/, ''), actorId: e.actor_id || '', at: e.created_at || '',
      };
    });
    _kbAt = Date.now();
    return _kbCache;
  };

  // เลือกรายการในคลังความรู้ที่คล้ายข้อความ เพื่อเป็น context ให้ AI (ความคล้ายแบบ bigram — รองรับภาษาไทย)
  // ── กรณีเก่าที่คล้ายกัน: คลังความรู้ Helpdesk + ปัญหาใน Impl Tracker ที่มีวิธีแก้แล้ว (ค้นร่วมกัน เรียงตามความคล้าย)
  // IMPL_ISSUES โหลดเบื้องหลังหลังล็อกอิน (ImplTrackerService) — ยังไม่มาก็ใช้แค่ฝั่ง Helpdesk ──
  window.hdAiSimilar = async function (text, limit) {
    var kb = (await window.hdKbFetch()).map(function (k) {
      return { score: window.aiTextSim(text, k.subject + ' ' + k.description), subject: k.subject, description: k.description, fix: 'วิธีแก้ไข: ' + k.fix, from: 'Ticket ' + k.ticketNo };
    });
    var impl = (window.IMPL_ISSUES || []).filter(function (x) { return (x.solution || '').trim() && (x.problem || '').trim(); }).map(function (x) {
      var p = (window.IMPL_PROJECTS || []).find(function (pp) { return pp.id === x.projectId; });
      return { score: window.aiTextSim(text, x.problem), subject: '', description: x.problem, fix: 'วิธีแก้ไข: ' + x.solution, from: 'ปัญหาโครงการ ' + ((p && p.name) || '') };
    });
    return kb.concat(impl).filter(function (x) { return x.score >= 0.2; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 3);
  };

  window.hdAiAnalyze = async function (opt) {
    opt = opt || {};
    var desc = String(opt.description || '').trim();
    if (!desc) throw new Error('ยังไม่มีรายละเอียดปัญหาให้วิเคราะห์');
    var cats = (window.HELPDESK_CATEGORIES || []).map(function (c) { return c.id + ' — ' + c.name; }).join('\n');
    var sim = [];
    try { sim = await window.hdAiSimilar(desc, 3); } catch (e) {}
    var simTxt = sim.length
      ? '\n\nกรณีเก่าที่คล้ายกัน (จาก Ticket และปัญหาในโครงการติดตั้ง — ใช้ประกอบการแนะนำวิธีแก้ไข):\n'
        + sim.map(function (x, i) { return (i + 1) + ') [' + x.from + '] ปัญหา: ' + (x.description || x.subject || '').slice(0, 200) + '\n   ' + x.fix.slice(0, 300); }).join('\n')
      : '';
    var user = 'รายการหมวดปัญหา (เลือก id ให้ตรงที่สุด):\n' + cats
      + '\n\n--- ปัญหาที่ต้องวิเคราะห์ ---\n'
      + (opt.hospitalName ? 'โรงพยาบาล: ' + opt.hospitalName + '\n' : '')
      + (opt.sourceSystem ? 'ระบบที่ใช้งาน: ' + opt.sourceSystem + '\n' : '')
      + 'รายละเอียด: ' + desc + simTxt;

    var out = await window.aiChatJson(window.HD_AI_SYSTEM_PROMPT, user, { maxTokens: 500 });
    var catOk = (window.HELPDESK_CATEGORIES || []).some(function (c) { return c.id === out.category_id; });
    return {
      categoryId: catOk ? out.category_id : '',
      priority: ['p1', 'p2', 'p3', 'p4'].indexOf(out.priority) > -1 ? out.priority : '',
      resolutionHint: String(out.resolution_hint || '').trim(),
      confidence: out.confidence || '',
      reason: String(out.reason || '').trim(),
      similarCount: sim.length,
    };
  };

  // ── ร่างข้อความตอบผู้แจ้ง (รพ.) จากรายละเอียด Ticket + บทสนทนาทั้งหมด (รวมโน้ตภายในเป็นข้อมูลประกอบ
  // แต่สั่งห้ามเปิดเผยตรง ๆ) — คืนข้อความล้วน ให้เจ้าหน้าที่ตรวจ/แก้ก่อนกดส่งเองเสมอ ──
  window.hdAiDraftReply = async function (t, events, hint) {
    var who = function (e) { return e.actor_type === 'reporter' ? 'ผู้แจ้ง' : e.actor_type === 'system' ? 'ระบบ' : 'ทีมงาน'; };
    var convo = (events || []).filter(function (e) { return e.type === 'comment' && e.body; }).slice(-12).map(function (e) {
      return '[' + who(e) + (e.is_internal ? ' · โน้ตภายใน' : '') + '] ' + String(e.body).slice(0, 500);
    }).join('\n');
    var st = ((window.HD_STATUS || []).find(function (s) { return s.id === t.status; }) || {}).label || t.status;
    var user = 'หัวข้อ: ' + (t.subject || '-') + '\n'
      + 'ผู้แจ้ง: ' + (t.reporterName || '-') + '\n'
      + 'สถานะปัจจุบัน: ' + st + '\n'
      + 'รายละเอียดปัญหา: ' + String(t.description || '').slice(0, 1500) + '\n'
      + (convo ? '\nบทสนทนาที่ผ่านมา (เก่า → ใหม่):\n' + convo + '\n' : '')
      + (hint ? '\nแนวทางแก้ไขที่ทีมพิจารณาอยู่: ' + hint + '\n' : '')
      + '\nร่างข้อความตอบกลับผู้แจ้งฉบับถัดไป';
    return window.aiChat(window.HD_AI_REPLY_PROMPT, user, { maxTokens: 500, temperature: 0.4 });
  };

  // ── Realtime Subscriptions (background, ไม่ block loader หลัก) ──
  var _renderTimer = null;
  function _rerenderIfOpen() {
    if (!window.cu) return;
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(function () {
      var el = document.getElementById('view-helpdesk');
      if (el && el.classList.contains('on') && window.renderHelpdesk) window.renderHelpdesk();
    }, 300);
  }

  window.onSnapshot(window.getColRef('HELPDESK_CATEGORIES'), function (s) {
    window.HELPDESK_CATEGORIES = s.docs.map(function (doc) { return tCategory(doc.data()); })
      .sort(function (a, b) { return a.sort - b.sort; });
    _rerenderIfOpen();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'หมวดปัญหา HelpDesk'); });

  window.onSnapshot(window.getColRef('HELPDESK_SLA_POLICIES'), function (s) {
    window.HELPDESK_SLA = s.docs.map(function (doc) { return tSla(doc.data()); });
    _rerenderIfOpen();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'SLA Policy'); });

  // ── Override label/color/icon ของ Priority/สถานะ/ความเร่งด่วน — เก็บใน settings.app เอกสารเดียวกับที่
  // realtime.service.js subscribe ไว้แล้ว (window.SETTINGS) ห้ามเปิด onSnapshot ซ้ำบน doc เดียวกันเด็ดขาด —
  // Supabase realtime client ไม่รองรับเพิ่ม postgres_changes callback บน channel ที่ subscribe() ไปแล้ว
  // (พังแบบ throw ตอน setup จนทำให้ ImplTrackerService/FormTrackerService ที่เรียกต่อจากกันไม่ทำงานเลยทั้งคู่)
  // realtime.service.js จึงเรียก window.hdApplySettingsOverrides(d) แทนหลัง onSnapshot ของมันทำงานทุกครั้ง ──
  window.hdApplySettingsOverrides = function (d) {
    d = d || {};
    window._hdOptionOverrides = {
      priority: d.helpdesk_priority_overrides || {},
      status: d.helpdesk_status_overrides || {},
      urgency: d.helpdesk_urgency_overrides || {},
    };
    window.HD_PRIORITY = hdApplyOptionOverrides(window.HD_PRIORITY_DEFAULTS, window._hdOptionOverrides.priority, ['label', 'color']);
    window.HD_STATUS   = hdApplyOptionOverrides(window.HD_STATUS_DEFAULTS,   window._hdOptionOverrides.status,   ['label', 'color', 'icon']);
    window.HD_URGENCY  = hdApplyOptionOverrides(window.HD_URGENCY_DEFAULTS,  window._hdOptionOverrides.urgency,  ['label', 'priority']);
    _rerenderIfOpen();
  };

  window.onSnapshot(window.getColRef('HELPDESK_TICKETS'), function (s) {
    window.HELPDESK_TICKETS = s.docs.map(function (doc) { return tTicket(doc.data()); })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    window.updateBadge && window.updateBadge();
    if (window._ownWrite && window._ownWrite.HELPDESK_TICKETS) return;
    _rerenderIfOpen();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'ศูนย์ช่วยเหลือ'); });

})();
