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
      team: d.team || '',
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
      defaultTeam: d.default_team || '', active: d.active !== false, sort: Number(d.sort) || 0,
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
  window.hdTransformTicket = tTicket;

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
    var safe = String(file.name).replace(/[^\w.\-]+/g, '_');
    var path = ticketId + '/' + Date.now() + '_' + safe;
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

  window.hdDeleteAttachment = async function (att) {
    var db = window.getDb && window.getDb();
    if (db && att.file_url) {
      var marker = '/helpdesk/';
      var idx = att.file_url.indexOf(marker);
      if (idx >= 0) { try { await db.storage.from('helpdesk').remove([att.file_url.slice(idx + marker.length)]); } catch (e) {} }
    }
    await window.deleteDoc(window.getDocRef('HELPDESK_ATTACHMENTS', att.id));
  };

  window.hdIsImage = function (mime, name) {
    return /^image\//.test(mime || '') || /\.(jpe?g|png|gif|webp)$/i.test(name || '');
  };

  // ── AI ช่วยวิเคราะห์ (เรียกผ่าน nginx proxy /helpdesk-ai/ เท่านั้น) ─────────
  var _hdAiModel = null;
  window.hdAiModel = async function () {
    if (_hdAiModel) return _hdAiModel;
    var res = await fetch(window.HD_AI_BASE + '/v1/models', { headers: { 'Accept': 'application/json' } });
    if (res.status === 404 || res.status === 502 || res.status === 503) throw new Error('ระบบยังไม่เปิดใช้งาน AI — ติดต่อผู้ดูแลระบบ');
    if (!res.ok) throw new Error('เรียก AI ไม่สำเร็จ (HTTP ' + res.status + ')');
    var d = await res.json();
    _hdAiModel = (d.data && d.data[0] && d.data[0].id) || (d.data && d.data[0]) || 'medgemma';
    return _hdAiModel;
  };

  function _hdWords(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (w) { return w.length >= 3; });
  }
  // เลือก Ticket เก่าที่ปิดแล้ว + คล้ายข้อความ เพื่อเป็น context ให้ AI
  window.hdAiSimilar = async function (text, limit) {
    var db = window.getDb && window.getDb();
    if (!db) return [];
    var res = await db.from('helpdesk_tickets').select('id,subject,description,category_id,status,resolved_at')
      .in('status', ['resolved', 'closed']).order('resolved_at', { ascending: false }).limit(150);
    if (res.error) return [];
    var evMap = {};
    // วิธีแก้ไขเก็บเป็น comment ในไทม์ไลน์ — ดึง event ล่าสุดต่อ ticket ที่ขึ้นต้น "วิธีแก้ไข:"
    var ids = (res.data || []).map(function (r) { return r.id; });
    if (ids.length) {
      var er = await db.from('helpdesk_ticket_events').select('ticket_id,body,created_at')
        .in('ticket_id', ids).eq('type', 'comment').order('created_at', { ascending: true });
      (er.data || []).forEach(function (e) {
        if (/^วิธีแก้ไข\s*[:：]/.test(e.body || '')) evMap[e.ticket_id] = e.body;
      });
    }
    var qw = _hdWords(text);
    return (res.data || []).map(function (r) {
      var hay = _hdWords((r.subject || '') + ' ' + (r.description || ''));
      var score = qw.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
      return { score: score, subject: r.subject, description: r.description, fix: evMap[r.id] || '' };
    }).filter(function (x) { return x.score > 0 && x.fix; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 3);
  };

  function _hdParseJson(txt) {
    var m = String(txt || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    var body = m ? m[1] : txt;
    var s = body.indexOf('{'), e = body.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('AI ตอบไม่เป็น JSON');
    return JSON.parse(body.slice(s, e + 1));
  }

  window.hdAiAnalyze = async function (opt) {
    opt = opt || {};
    var desc = String(opt.description || '').trim();
    if (!desc) throw new Error('ยังไม่มีรายละเอียดปัญหาให้วิเคราะห์');
    var model = await window.hdAiModel();
    var cats = (window.HELPDESK_CATEGORIES || []).map(function (c) { return c.id + ' — ' + c.name; }).join('\n');
    var sim = [];
    try { sim = await window.hdAiSimilar(desc, 3); } catch (e) {}
    var simTxt = sim.length
      ? '\n\nตัวอย่าง Ticket เก่าที่คล้ายกัน (ใช้ประกอบการแนะนำวิธีแก้ไข):\n'
        + sim.map(function (x, i) { return (i + 1) + ') ปัญหา: ' + (x.description || x.subject || '').slice(0, 200) + '\n   ' + x.fix.slice(0, 300); }).join('\n')
      : '';
    var user = 'รายการหมวดปัญหา (เลือก id ให้ตรงที่สุด):\n' + cats
      + '\n\n--- ปัญหาที่ต้องวิเคราะห์ ---\n'
      + (opt.hospitalName ? 'โรงพยาบาล: ' + opt.hospitalName + '\n' : '')
      + (opt.sourceSystem ? 'ระบบที่ใช้งาน: ' + opt.sourceSystem + '\n' : '')
      + 'รายละเอียด: ' + desc + simTxt;

    var res = await fetch(window.HD_AI_BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model, temperature: 0.2, max_tokens: 500,
        messages: [
          { role: 'system', content: window.HD_AI_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error('AI วิเคราะห์ไม่สำเร็จ (HTTP ' + res.status + ')');
    var data = await res.json();
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    var out = _hdParseJson(content);
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
    if (window._ownWrite && window._ownWrite.HELPDESK_TICKETS) return;
    _rerenderIfOpen();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'ศูนย์ช่วยเหลือ'); });

})();
