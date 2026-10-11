/**
 * ask-ai.js — 🤖 ถาม AI (บอทลอยมุมขวาล่าง เปิดเป็นหน้าต่างแชท) — ถามเป็นภาษาคน แล้วได้รายการจากข้อมูลจริงในระบบ
 *   เช่น "รพ.ไหนมีปัญหา LIS ค้างเกิน 7 วัน", "สัปดาห์หน้าใครว่าง", "Ticket P1 ที่ยังไม่มอบหมาย"
 *
 * หลักการ: AI ทำหน้าที่ "แปลคำถามเป็นเงื่อนไขค้นหา" (JSON) เท่านั้น — การค้น/นับ/ตัวเลขทุกตัวทำในโค้ดนี้
 * จากข้อมูลที่โหลดไว้แล้วในหน้า (window.HELPDESK_TICKETS, IMPL_ISSUES, PROJECTS ฯลฯ) → ไม่มีตัวเลขที่ AI แต่งเอง
 * และแสดง "AI เข้าใจว่า…" ให้ผู้ใช้ตรวจว่าแปลคำถามถูกไหม · ค้นเฉพาะแหล่งข้อมูลที่ผู้ใช้มีสิทธิ์ดู (canView)
 * ตัวเรียก AI กลาง: src/services/ai.service.js
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var DAY = 86400000;

  // ── วันที่ ──
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function dateOf(s) { return String(s || '').slice(0, 10); }
  function ageDays(s) { return s ? Math.floor((Date.now() - new Date(s).getTime()) / DAY) : 0; }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  function overlap(s, e, from, to) { if (!s) return false; e = e || s; return (!to || s <= to) && (!from || e >= from); }

  // ── จับคู่ข้อความแบบหลวม ๆ — ตัดช่องว่าง/คำนำหน้า "รพ." ออก (ผู้ใช้พิมพ์ "รพ.ขอนแก่น" ข้อมูลเก็บ "โรงพยาบาลขอนแก่น") ──
  function norm(s) {
    // ตัดวรรณยุกต์/ไม้ไต่คู้/การันต์ด้วย — ผู้ใช้พิมพ์ "ทุงช้าง" ต้องเจอ "ทุ่งช้าง"
    return String(s || '').toLowerCase().replace(/โรงพยาบาล|รพ\.?|รพสต\.?|สสอ\.?|สสจ\.?/g, '').replace(/[\u0E47-\u0E4C]/g, '').replace(/[\s\-_.,()]+/g, '');
  }
  // needle คั่นคำที่ใช้แทนกันได้ด้วย | (เช่น "lis|แล็บ") — ตรงคำใดคำหนึ่งก็ผ่าน
  function has(hay, needle) {
    if (!needle) return true;
    var h = norm(hay);
    return String(needle).split('|').some(function (n) { n = norm(n); return n && h.indexOf(n) >= 0; });
  }

  // ── ทีมงาน ──
  function staff(id) { return window.staffByRef(id); }
  function nick(id) { return window.staffNickByRef(id); }
  // คืน { ids, needle } ของทีมงานที่ตรงชื่อ — ช่องที่เก็บคนทุกตารางเป็นรหัสพนักงาน
  function personQuery(q) {
    if (!q) return null;
    var ids = {};
    (window.STAFF || []).forEach(function (s) { if (has(s.nickname, q) || has(s.name, q)) ids[s.id] = true; });
    return { ids: ids, needle: q, found: Object.keys(ids).length > 0 };
  }
  function personHit(pq, id) { return !pq || (!!id && !!pq.ids[id]); }

  function hospName(id) { var h = (window.HOSPITALS || []).find(function (x) { return x.id === id; }); return h ? h.name : ''; }
  function implProj(id) { return (window.IMPL_PROJECTS || []).find(function (x) { return x.id === id; }) || {}; }
  function proj(id) { return (window.PROJECTS || []).find(function (x) { return x.id === id; }) || {}; }
  // ชื่อโรงพยาบาลของโครงการ impl — จากโครงการต้นทาง (projects.hospital_id)
  function implHospName(p) {
    var hid = p.source && p.source.hospitalId;
    var h = hid && (window.HOSPITALS || []).find(function (x) { return x.id === hid; });
    return h ? h.name : '';
  }
  function lbl(list, id) { var x = (list || []).find(function (o) { return o.id === id; }); return x ? x.label : id; }
  // รหัสสถานะ/ประเภทที่เก็บใน DB → คำไทย (ห้ามส่งรหัสอังกฤษไปให้ AI หรือแสดงผู้ใช้ — AI จะพูดตาม เช่น "both 3, national 2")
  var TH = {
    holiday: { national: 'วันหยุดราชการ', company: 'วันหยุดบริษัท', both: 'วันหยุดราชการและบริษัท', custom: 'วันหยุดอื่น ๆ' },
    project: { active: 'กำลังดำเนินการ', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก', on_hold: 'พักชั่วคราว', planning: 'วางแผน' },
    contract: { active: 'มีผลบังคับ', completed: 'สิ้นสุดแล้ว', cancelled: 'ยกเลิก' },
    serverReq: { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', scheduled: 'จัดคนแล้ว', done: 'เสร็จสิ้น', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' },
  };
  function th(map, v) { return TH[map][v] || v || ''; }

  // ── หน่วยนับ (ลักษณนาม) ของแต่ละแหล่งข้อมูล — ห้ามเรียกทุกอย่างว่า "รายการ" (คนลา 3 คน, วันหยุด 7 วัน, Ticket 5 เรื่อง) ──
  var UNIT = {
    tickets: 'เรื่อง', issues: 'เรื่อง', tasks: 'งาน', projects: 'โครงการ', leaves: 'ใบ', free_staff: 'คน', staff: 'คน',
    advances: 'รายการ', timesheets: 'รายการ', costs: 'รายการ', lodgings: 'แห่ง', holidays: 'วัน', contracts: 'สัญญา',
    work_logs: 'รายการ', hospitals: 'แห่ง', targets: 'รายการ', server_requests: 'คำขอ', forms: 'ฉบับ', knowledge: 'คำตอบ',
  };
  function unitOf(f) { return UNIT[f.source] || 'รายการ'; }
  // หน่วยของจำนวนในแต่ละกลุ่ม — ใบลาแยกตามคน = "ลา 2 ครั้ง" ไม่ใช่ "2 ใบ"
  function groupUnitOf(f) { return f.source === 'leaves' ? 'ครั้ง' : unitOf(f); }
  // การลา: ถามว่า "ใครลา/กี่คน" ต้องนับเป็นคน (คนเดียวลาหลายใบ นับ 1 คน)
  function peopleCount(rows) {
    var s = {};
    rows.forEach(function (r) { if (r.key.person && r.key.person !== '-') s[r.key.person] = 1; });
    return Object.keys(s).length;
  }
  // จำนวนที่พบ แบบที่คนพูด: "3 คน (ใบลา 4 ใบ)" · "7 วัน" · "5 เรื่อง"
  function countText(f, rows) {
    if (f.source === 'leaves') {
      var p = peopleCount(rows);
      return p + ' คน' + (p !== rows.length ? ' (ใบลา ' + rows.length + ' ใบ)' : '');
    }
    return rows.length + ' ' + unitOf(f);
  }
  // เก็บกวาดคำตอบ AI ก่อนแสดง (กันกรณี AI ไม่ทำตามรูปแบบ): วันที่ 13/10/2569 → 13 ต.ค. 2569 ·
  // บรรทัดที่มีแค่ "ครับ" ต่อท้ายบรรทัดก่อนหน้า · รหัสประเภทวันหยุดที่หลุดมา → คำไทย · บรรทัดว่างซ้อน
  function tidyAnswer(txt) {
    var lines = String(txt || '')
      .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, function (m, d, mo, y) { return +d + ' ' + TH_MON[+mo - 1] + ' ' + (+y < 2400 ? +y + 543 : +y); })
      .replace(/\b(national|company|both|custom)\b(?=\s*[\d:,)])/gi, function (m) { return TH.holiday[m.toLowerCase()]; })
      .split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = [];
    lines.forEach(function (l) {
      if (/^\s*(ครับ|ค่ะ)\s*[.!]?\s*$/.test(l) && out.length) out[out.length - 1] = out[out.length - 1].replace(/\s*$/, '') + 'ครับ';
      else out.push(l);
    });
    return out.join('\n');
  }
  // วันที่แบบอ่านง่าย "13 ต.ค. 2569" (แทน 13/10/2569 ที่ AI ยกไปตอบตรง ๆ แล้วดูยาก)
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function fdTh(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    if (!s || isNaN(d)) return '-';
    return d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  // ── คำอ่านสำหรับ 🔊 ฟังคำตอบ — ตัวเลข/วันที่เป็นคำ (ไม่ใช่ "10 ต.ค." หรือ "12,000") · ข้อความยาวตัดเหลือประโยคแรก ──
  function sayNum(n) { return window.TTS ? window.TTS.num(n) : String(n); }
  function sayDate(d) { return window.TTS ? window.TTS.date(d) : String(d || ''); }
  function sayText(s, max) {
    s = String(s || '').split(/\n/)[0].trim();
    max = max || 90;
    if (s.length <= max) return s;
    var cut = s.slice(0, max), sp = cut.lastIndexOf(' ');
    return sp > max / 2 ? cut.slice(0, sp) : cut;
  }
  function sayJoin() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  // ══ แหล่งข้อมูลที่ค้นได้ — แต่ละตัวคืนรายการ { key(ใช้จัดกลุ่ม), title, meta, badge, go } ══
  // f = เงื่อนไขจาก AI (ผ่าน cleanPlan แล้ว) · today = 'YYYY-MM-DD'
  var SOURCES = {
    tickets: {
      label: 'Helpdesk Ticket', icon: '🎧', filters: ['hospital', 'person', 'status', 'date', 'keyword'], mod: ['helpdesk'], uses: ['priority', 'unassigned', 'overdue', 'minAgeDays'],
      run: function (f) {
        var openSt = {}; (window.HD_STATUS || []).forEach(function (s) { openSt[s.id] = s.open !== false; });
        var cat = function (id) { var c = (window.HELPDESK_CATEGORIES || []).find(function (x) { return x.id === id; }); return c ? c.name : ''; };
        var pq = personQuery(f.person), now = Date.now();
        return (window.HELPDESK_TICKETS || []).filter(function (t) {
          var open = !!openSt[t.status];
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if (f.priority.length && f.priority.indexOf(t.priority) < 0) return false;
          if (f.unassigned && t.assigneeId) return false;
          if (f.overdue && !(t.resolutionBreached || (open && t.resolutionDue && new Date(t.resolutionDue).getTime() < now))) return false;
          if (f.minAgeDays && ageDays(t.createdAt) < f.minAgeDays) return false;
          if (!inRange(dateOf(t.createdAt), f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, t.assigneeId)) return false;
          if (f.hospital && !has(hospName(t.hospitalId) + ' ' + t.lineGroupRef, f.hospital)) return false;
          if (f.keyword && !has([t.subject, t.description, t.sourceSystem, cat(t.categoryId)].join(' '), f.keyword)) return false;
          return true;
        }).map(function (t) {
          var age = ageDays(t.createdAt);
          return {
            sortAge: age, sortDate: t.createdAt,
            key: { hospital: hospName(t.hospitalId) || '(ไม่ระบุ รพ.)', person: t.assigneeId ? nick(t.assigneeId) : '(ยังไม่มอบหมาย)', category: cat(t.categoryId) || '(ไม่ระบุหมวด)', department: t.reporterDept || '(ไม่ระบุแผนก)' },
            title: t.ticketNo + ' · ' + (t.subject || '-'),
            meta: [hospName(t.hospitalId), lbl(window.HD_STATUS, t.status), 'เปิดมา ' + age + ' วัน', t.assigneeId ? '👷 ' + nick(t.assigneeId) : 'ยังไม่มอบหมาย'].filter(Boolean).join(' · '),
            badge: String(t.priority || '').toUpperCase(),
            say: sayJoin(sayText(t.subject) || 'เรื่องไม่มีหัวข้อ', hospName(t.hospitalId) && 'จาก' + hospName(t.hospitalId),
              'เปิดมา ' + sayNum(age) + ' วัน', t.assigneeId ? nick(t.assigneeId) + ' รับผิดชอบอยู่' : 'ยังไม่มีคนรับเรื่อง'),
            go: "window.askAiGo('ticket','" + t.id + "')",
          };
        });
      },
    },
    issues: {
      label: 'ปัญหาการใช้งาน (ติดตามสถานะโครงการ)', icon: '🩹', filters: ['hospital', 'person', 'status', 'date', 'keyword'], mod: ['impl_tracker', 'all_issues'], uses: ['severity', 'minAgeDays'],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.IMPL_ISSUES || []).filter(function (i) {
          var open = i.status !== 'closed';
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if (f.severity.length && f.severity.indexOf(i.severity) < 0) return false;
          if (f.minAgeDays && (!open || ageDays(i.createdAt) < f.minAgeDays)) return false;
          if (!inRange(dateOf(i.createdAt), f.dateFrom, f.dateTo)) return false;
          if (pq && !personHit(pq, i.receivedById) && !personHit(pq, i.fixedById)) return false;
          var p = implProj(i.projectId);
          if (f.hospital && !has(p.name + ' ' + implHospName(p), f.hospital)) return false;
          if (f.keyword && !has([i.problem, i.category, i.department, i.solution].join(' '), f.keyword)) return false;
          return true;
        }).map(function (i) {
          var p = implProj(i.projectId), age = ageDays(i.createdAt);
          return {
            sortAge: age, sortDate: i.createdAt,
            key: { hospital: p.name || '(ไม่ระบุโครงการ)', person: i.fixedById ? nick(i.fixedById) : '(ยังไม่มีผู้แก้)', category: i.category || '(ไม่ระบุกลุ่มปัญหา)', department: i.department || '(ไม่ระบุแผนก)' },
            title: String(i.problem || '-').slice(0, 120),
            meta: [p.name, i.category, i.department, lbl(window.IMPL_ISSUE_STATUS, i.status), i.status !== 'closed' ? 'ค้าง ' + age + ' วัน' : (i.fixedDate ? 'แก้ ' + fdTh(i.fixedDate) : '')].filter(Boolean).join(' · '),
            badge: lbl(window.IMPL_SEVERITY, i.severity),
            say: sayJoin(sayText(i.problem), p.name && 'ที่โครงการ ' + p.name, i.status !== 'closed' ? 'ค้างมา ' + sayNum(age) + ' วัน' : 'แก้ไขแล้ว'),
            go: "window.askAiGo('issue','" + i.id + "','" + i.projectId + "')",
          };
        });
      },
    },
    tasks: {
      label: 'งานในโครงการติดตั้ง', icon: '🛠️', filters: ['hospital', 'person', 'status', 'date', 'keyword'], mod: ['impl_tracker'], uses: ['priority', 'overdue'],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.IMPL_TASKS || []).filter(function (t) {
          var open = t.status !== 'done' && t.status !== 'cancelled';
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if (f.overdue && !(window.imtIsOverdue && window.imtIsOverdue(t))) return false;
          if (f.priority.length && f.priority.indexOf(t.priority) < 0) return false;
          if ((f.dateFrom || f.dateTo) && !inRange(t.due, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, t.ownerId)) return false;
          if (f.hospital && !has(implProj(t.projectId).name, f.hospital)) return false;
          if (f.keyword && !has(t.name + ' ' + t.description, f.keyword)) return false;
          return true;
        }).map(function (t) {
          var p = implProj(t.projectId);
          return {
            sortAge: t.due ? -new Date(t.due).getTime() / DAY : 0, sortDate: t.due,
            key: { hospital: p.name || '-', person: t.ownerId ? nick(t.ownerId) : '(ไม่มีผู้รับผิดชอบ)', category: lbl(window.IMPL_STATUS, t.status), department: '-' },
            title: t.name || '-',
            meta: [p.name, t.due ? 'กำหนด ' + fdTh(t.due) : '', t.ownerId ? '👷 ' + nick(t.ownerId) : '', lbl(window.IMPL_STATUS, t.status)].filter(Boolean).join(' · '),
            badge: window.imtIsOverdue && window.imtIsOverdue(t) ? 'เกินกำหนด' : '',
            say: sayJoin(sayText(t.name), p.name && 'ของโครงการ ' + p.name, t.due && 'กำหนดเสร็จ' + sayDate(t.due), t.ownerId && nick(t.ownerId) + ' รับผิดชอบ'),
            go: "window.askAiGo('task','" + t.id + "','" + t.projectId + "')",
          };
        });
      },
    },
    projects: {
      label: 'โครงการ', icon: '🗂️', filters: ['hospital', 'person', 'status', 'date', 'keyword'], mod: ['projects'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        var mem = function (p) { return (p.members && p.members.length ? p.members.map(function (m) { return m.sid; }) : (p.team || [])); };
        return (window.PROJECTS || []).filter(function (p) {
          var open = p.status !== 'completed' && p.status !== 'cancelled';
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if ((f.dateFrom || f.dateTo) && !overlap(p.start, p.end, f.dateFrom, f.dateTo)) return false;
          if (pq && !mem(p).concat([p.siteOwnerId, p.installerId]).some(function (r) { return personHit(pq, r); })) return false;
          if (f.hospital && !has(p.name + ' ' + hospName(p.hospitalId), f.hospital)) return false;
          if (f.keyword && !has(p.name + ' ' + hospName(p.hospitalId), f.keyword)) return false;
          return true;
        }).map(function (p) {
          var team = mem(p).map(nick).filter(Boolean);
          return {
            sortAge: p.start ? -new Date(p.start).getTime() / DAY : 0, sortDate: p.start,
            key: { hospital: hospName(p.hospitalId) || p.name, person: team[0] || '(ยังไม่มีทีม)', category: th('project', p.status), department: '-' },
            title: p.name || '-',
            meta: [(p.start ? fdTh(p.start) : '?') + (p.end ? ' – ' + fdTh(p.end) : ''), team.length ? '👥 ' + team.join(', ') : 'ยังไม่มีทีม', 'ความคืบหน้า ' + (p.progress || 0) + '%'].join(' · '),
            badge: '',
            say: sayJoin(p.name, p.start && 'เริ่ม' + sayDate(p.start), 'ความคืบหน้า ' + sayNum(p.progress || 0) + ' เปอร์เซ็นต์'),
            go: "window.askAiGo('project','" + p.id + "')",
          };
        });
      },
    },
    leaves: {
      label: 'การลางาน', icon: '🏖️', filters: ['person', 'status', 'date', 'keyword'], mod: ['leave'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        var LV = { sick: 'ลาป่วย', vacation: 'ลาพักร้อน', personal: 'ลากิจ', maternity: 'ลาคลอด', ordain: 'ลาบวช', other: 'ลา' };
        return (window.LEAVES || []).filter(function (l) {
          if (f.status === 'rejected') { if (l.status !== 'rejected') return false; }
          else {
            if (l.status === 'rejected') return false;
            if ((f.status === 'open' || f.status === 'pending') && l.status !== 'pending') return false;
            if ((f.status === 'closed' || f.status === 'approved') && l.status !== 'approved') return false;
          }
          if ((f.dateFrom || f.dateTo) && !overlap(l.startDate, l.endDate, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, l.staffId)) return false;
          if (f.keyword && !has((LV[l.leaveType] || '') + ' ' + l.note, f.keyword)) return false;
          return true;
        }).map(function (l) {
          return {
            sortAge: -new Date(l.startDate).getTime() / DAY, sortDate: l.startDate,
            key: { hospital: '-', person: nick(l.staffId), category: LV[l.leaveType] || 'ลา', department: (staff(l.staffId) || {}).dept || '-' },
            title: nick(l.staffId) + ' — ' + (LV[l.leaveType] || 'ลา'),
            meta: fdTh(l.startDate) + (l.endDate && l.endDate !== l.startDate ? ' – ' + fdTh(l.endDate) : '') + (l.note ? ' · ' + l.note : ''),
            badge: l.status === 'pending' ? 'รออนุมัติ' : '',
            say: sayJoin(nick(l.staffId), LV[l.leaveType] || 'ลา',
              l.endDate && l.endDate !== l.startDate ? fdTh(l.startDate) + ' – ' + fdTh(l.endDate) : sayDate(l.startDate), // ช่วงวัน → tts อ่าน "ห้า และ หก ตุลาคม"
              l.status === 'pending' && 'รออนุมัติอยู่'),
            go: "window.askAiGo('leave')",
          };
        });
      },
    },
    free_staff: {
      label: 'ทีมงานที่ว่าง', icon: '👥', filters: ['person', 'date', 'keyword'], mod: ['availability', 'workload'], uses: [],
      run: function (f, today) {
        var from = f.dateFrom || today, to = f.dateTo || from;
        var busy = {};
        (window.PROJECTS || []).forEach(function (p) {
          if (p.status === 'cancelled' || !overlap(p.start, p.end, from, to)) return;
          (p.members && p.members.length ? p.members.map(function (m) { return m.sid; }) : (p.team || []))
            .forEach(function (sid) { (busy[sid] = busy[sid] || []).push('โครงการ ' + p.name); });
        });
        (window.LEAVES || []).forEach(function (l) {
          if (l.status === 'approved' && overlap(l.startDate, l.endDate, from, to)) (busy[l.staffId] = busy[l.staffId] || []).push('ลางาน');
        });
        return (window.STAFF || []).filter(function (s) {
          if (!s.active || busy[s.id]) return false;
          if (f.keyword && !has(s.dept + ' ' + s.role, f.keyword)) return false;
          return personHit(personQuery(f.person), s.id);
        }).map(function (s) {
          return {
            sortAge: 0, sortDate: s.nickname,
            key: { hospital: '-', person: s.nickname || s.name, category: s.role || '-', department: s.dept || '(ไม่ระบุแผนก)' },
            title: (s.nickname || '') + (s.name && s.name !== s.nickname ? ' (' + s.name + ')' : ''),
            meta: [s.dept, s.role, 'ว่าง ' + fdTh(from) + (to !== from ? ' – ' + fdTh(to) : '')].filter(Boolean).join(' · '),
            badge: '',
            say: sayJoin(s.nickname || s.name, s.dept && 'แผนก ' + s.dept),
            go: "window.askAiGo('availability')",
          };
        });
      },
    },
    advances: {
      label: 'Advance', icon: '💰', filters: ['hospital', 'status', 'date', 'keyword'], mod: ['advance'], uses: ['overdue'],
      run: function (f, today) {
        return (window.ADVANCES || []).filter(function (a) {
          var open = a.status !== 'cleared';
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if (f.overdue && !((a.status === 'disbursed' || a.status === 'clearing') && a.ddate && a.ddate < today)) return false;
          if (!inRange(a.rdate, f.dateFrom, f.dateTo)) return false;
          if (f.hospital && !has(proj(a.pid).name, f.hospital)) return false;
          if (f.keyword && !has(a.purpose + ' ' + a.note + ' ' + lbl(window.AFLW, a.status), f.keyword)) return false;
          return true;
        }).map(function (a) {
          var p = proj(a.pid);
          return {
            sortAge: ageDays(a.rdate), sortDate: a.rdate,
            key: { hospital: p.name || '-', person: '-', category: lbl(window.AFLW, a.status), department: '-' },
            title: (p.name || '-') + (a.advno ? ' · ' + a.advno : ''),
            meta: [lbl(window.AFLW, a.status), a.amount ? window.fca(a.amount) + ' บาท' : '', a.rdate ? 'ขอ ' + fdTh(a.rdate) : '', a.ddate ? 'ครบกำหนดเคลียร์ ' + fdTh(a.ddate) : ''].filter(Boolean).join(' · '),
            badge: '',
            say: sayJoin(p.name || 'ไม่ระบุโครงการ', a.amount && 'ยอด ' + sayNum(a.amount) + ' บาท', lbl(window.AFLW, a.status), a.ddate && 'ครบกำหนดเคลียร์' + sayDate(a.ddate)),
            go: "window.askAiGo('advance')",
          };
        });
      },
    },
    timesheets: {
      label: 'Timesheet', icon: '⏱️', filters: ['hospital', 'person', 'date', 'keyword'], mod: ['timesheet'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.TIMESHEETS || []).filter(function (t) {
          if (!inRange(t.workDate, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, t.staffId)) return false;
          var p = proj(t.pid);
          if (f.hospital && !has(p.name + ' ' + hospName(p.hospitalId), f.hospital)) return false;
          if (f.keyword && !has([t.category, t.description, p.name].join(' '), f.keyword)) return false;
          return true;
        }).map(function (t) {
          var p = proj(t.pid), s = staff(t.staffId) || {};
          return {
            sortAge: ageDays(t.workDate), sortDate: t.workDate,
            key: { hospital: p.name || '-', person: nick(t.staffId) || '-', category: t.category || 'อื่น ๆ', department: s.dept || '-' },
            title: (nick(t.staffId) || '-') + ' — ' + (Number(t.hours) || 0) + ' ชม.',
            meta: [t.workDate ? fdTh(t.workDate) : '', p.name, t.category, t.description].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('timesheet')",
            say: sayJoin(nick(t.staffId), 'ทำงาน ' + sayNum(Number(t.hours) || 0) + ' ชั่วโมง', p.name && 'ที่โครงการ ' + p.name, t.workDate && sayDate(t.workDate)),
          };
        });
      },
    },
    costs: {
      label: 'รายการค่าใช้จ่าย', icon: '🧾', filters: ['hospital', 'person', 'date', 'keyword'], mod: ['cost', 'budget'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.COSTS || []).filter(function (c) {
          if (!inRange(c.costDate, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, c.staffId)) return false;
          var p = proj(c.pid);
          if (f.hospital && !has(p.name + ' ' + hospName(p.hospitalId), f.hospital)) return false;
          if (f.keyword && !has([c.category, c.description, c.receiptNo, p.name].join(' '), f.keyword)) return false;
          return true;
        }).map(function (c) {
          var p = proj(c.pid), s = staff(c.staffId) || {};
          return {
            sortAge: ageDays(c.costDate), sortDate: c.costDate,
            key: { hospital: p.name || '-', person: nick(c.staffId) || '-', category: c.category || 'อื่น ๆ', department: s.dept || '-' },
            title: (c.description || c.category || 'ค่าใช้จ่าย') + ' — ' + (window.fca ? window.fca(c.amount || 0) : Number(c.amount || 0).toLocaleString('th-TH')) + ' บาท',
            meta: [c.costDate ? fdTh(c.costDate) : '', p.name, nick(c.staffId), c.receiptNo ? 'ใบเสร็จ ' + c.receiptNo : ''].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('cost')",
            say: sayJoin(sayText(c.description || c.category || 'ค่าใช้จ่าย'), sayNum(c.amount || 0) + ' บาท', p.name && 'ของโครงการ ' + p.name),
          };
        });
      },
    },
    lodgings: {
      label: 'ข้อมูลที่พัก', icon: '🛏️', filters: ['hospital', 'date', 'keyword'], mod: ['lodging'], uses: [],
      run: function (f) {
        return (window.LODGINGS || []).filter(function (l) {
          var p = proj(l.pid);
          if ((f.dateFrom || f.dateTo) && !overlap(p.start, p.end, f.dateFrom, f.dateTo)) return false;
          if (f.hospital && !has(p.name + ' ' + hospName(p.hospitalId), f.hospital)) return false;
          if (f.keyword && !has([l.name, l.note, l.phone, l.dCustom, l.mCustom, p.name].join(' '), f.keyword)) return false;
          return true;
        }).map(function (l) {
          var p = proj(l.pid), approved = l.approvedDaily === 'yes' || l.approvedMonthly === 'yes';
          return {
            sortAge: p.start ? -new Date(p.start).getTime() / DAY : 0, sortDate: p.start,
            key: { hospital: p.name || '-', person: '-', category: approved ? 'อนุมัติแล้ว' : 'รอพิจารณา', department: '-' },
            title: l.name || '(ไม่ระบุชื่อที่พัก)',
            meta: [p.name, l.phone, l.total ? (window.fca ? window.fca(l.total) : Number(l.total).toLocaleString('th-TH')) + ' บาท' : '', approved ? 'อนุมัติแล้ว' : 'ยังไม่อนุมัติ'].filter(Boolean).join(' · '),
            badge: approved ? 'อนุมัติ' : '', go: "window.askAiGo('lodging')",
          };
        });
      },
    },
    holidays: {
      label: 'วันหยุด', icon: '📅', filters: ['date', 'keyword'], mod: ['holiday', 'calendar'], uses: [],
      run: function (f) {
        return (window.HOLIDAYS || []).filter(function (h) {
          if (!inRange(h.date, f.dateFrom, f.dateTo)) return false;
          if (f.keyword && !has(h.name + ' ' + h.type + ' ' + th('holiday', h.type), f.keyword)) return false;
          return true;
        }).map(function (h) {
          return {
            sortAge: ageDays(h.date), sortDate: h.date,
            key: { hospital: '-', person: '-', category: th('holiday', h.type) || 'วันหยุด', department: '-' },
            title: h.name || 'วันหยุด', meta: [h.date ? fdTh(h.date) : '-', th('holiday', h.type)].filter(Boolean).join(' · '), badge: '',
            say: sayJoin(h.name || 'วันหยุด', sayDate(h.date)),
            go: "window.askAiGo('holiday')",
          };
        });
      },
    },
    contracts: {
      label: 'ข้อมูลสัญญา', icon: '📄', filters: ['hospital', 'status', 'date', 'keyword'], mod: ['contract'], uses: [],
      run: function (f) {
        return (window.CONTRACTS || []).filter(function (c) {
          var open = c.status !== 'completed' && c.status !== 'cancelled' && (!c.endDate || c.endDate >= iso(today0()));
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if ((f.dateFrom || f.dateTo) && !overlap(c.startDate || c.signDate, c.endDate || c.startDate || c.signDate, f.dateFrom, f.dateTo)) return false;
          if (f.hospital && !has(c.name + ' ' + c.customer, f.hospital)) return false;
          if (f.keyword && !has([c.name, c.customer, c.note, c.status].join(' '), f.keyword)) return false;
          return true;
        }).map(function (c) {
          return {
            sortAge: ageDays(c.startDate || c.signDate), sortDate: c.startDate || c.signDate,
            key: { hospital: c.customer || c.name || '-', person: '-', category: th('contract', c.status) || '-', department: '-' },
            title: c.name || c.customer || 'สัญญา',
            meta: [c.customer, c.startDate ? fdTh(c.startDate) : '', c.endDate ? 'ถึง ' + fdTh(c.endDate) : '', c.value ? (window.fca ? window.fca(c.value) : Number(c.value).toLocaleString('th-TH')) + ' บาท' : ''].filter(Boolean).join(' · '),
            badge: th('contract', c.status), go: "window.askAiGo('contract')",
          };
        });
      },
    },
    work_logs: {
      label: 'บันทึกงาน', icon: '📝', filters: ['hospital', 'person', 'date', 'keyword'], mod: ['worklog'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.WORK_LOGS || []).filter(function (w) {
          var s = w.type === 'daily' ? w.date : w.startDate;
          var e = w.type === 'daily' ? w.date : w.endDate;
          if ((f.dateFrom || f.dateTo) && !overlap(s, e, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, w.staffId)) return false;
          if (f.hospital && !has([w.destination, w.title, w.detail].join(' '), f.hospital)) return false;
          if (f.keyword && !has([w.title, w.detail, w.category, w.destination, w.locationType].join(' '), f.keyword)) return false;
          return true;
        }).map(function (w) {
          var s = w.type === 'daily' ? w.date : w.startDate, e = w.type === 'daily' ? w.date : w.endDate;
          return {
            sortAge: ageDays(s), sortDate: s,
            key: { hospital: w.destination || '-', person: nick(w.staffId) || '-', category: w.category || 'อื่น ๆ', department: (staff(w.staffId) || {}).dept || '-' },
            title: w.title || w.detail || 'บันทึกงาน',
            meta: [nick(w.staffId), s ? fdTh(s) : '', e && e !== s ? 'ถึง ' + fdTh(e) : '', w.destination, w.category].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('worklog')",
          };
        });
      },
    },
    hospitals: {
      label: 'รายชื่อโรงพยาบาล', icon: '🏥', filters: ['hospital', 'keyword'], mod: ['hospital'], uses: [],
      run: function (f) {
        return (window.HOSPITALS || []).filter(function (h) {
          if (f.hospital && !has(h.name + ' ' + h.code, f.hospital)) return false;
          if (f.keyword && !has([h.name, h.code, h.type, h.province, h.district, h.tambon, h.address, h.affiliation, h.note, JSON.stringify(h.systems || {})].join(' '), f.keyword)) return false;
          return true;
        }).map(function (h) {
          return {
            sortAge: 0, sortDate: h.name,
            key: { hospital: h.name || '-', person: '-', category: h.type || '-', department: h.province || '-' },
            title: h.name || h.code || 'โรงพยาบาล',
            meta: [h.code, h.province, h.district, h.beds ? h.beds + ' เตียง' : '', h.tel].filter(Boolean).join(' · '),
            badge: h.type || '', go: "window.askAiGo('hospital')",
          };
        });
      },
    },
    staff: {
      label: 'ข้อมูลทีมงาน', icon: '👤', filters: ['person', 'status', 'keyword'], mod: ['availability', 'workload', 'admin'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.STAFF || []).filter(function (s) {
          if (f.status === 'open' && s.active === false) return false;
          if (f.status === 'closed' && s.active !== false) return false;
          if (!personHit(pq, s.id)) return false;
          if (f.keyword && !has([s.name, s.nickname, s.dept, s.role, s.email, s.phone, s.remark].join(' '), f.keyword)) return false;
          return true;
        }).map(function (s) {
          return {
            sortAge: ageDays(s.start_date), sortDate: s.start_date || s.nickname,
            key: { hospital: '-', person: s.nickname || s.name, category: s.role || '-', department: s.dept || '-' },
            title: s.name || s.nickname || 'ทีมงาน',
            meta: [s.nickname, s.dept, s.role, s.email, s.phone, s.active === false ? 'ไม่ใช้งาน' : 'ใช้งาน'].filter(Boolean).join(' · '),
            badge: s.active === false ? 'ไม่ใช้งาน' : '', go: "window.askAiGo('staff')",
          };
        });
      },
    },
    targets: {
      label: 'เป้าหมายทีม', icon: '🎯', filters: ['keyword'], mod: ['targets'], uses: [],
      run: function (f) {
        var rows = [];
        (window.YEAR_TARGETS || []).forEach(function (y) {
          if (!y || !y.year || !y.byType) return;
          Object.keys(y.byType).forEach(function (typeId) {
            var typ = (window.PTYPES || []).find(function (x) { return x.id === typeId; }) || {};
            if (f.keyword && !has(typ.label, f.keyword)) return;
            rows.push({
              sortAge: 0, sortDate: String(y.year),
              key: { hospital: '-', person: '-', category: typ.label || typeId, department: '-' },
              title: 'เป้าหมาย ' + (typ.label || typeId) + ' ปี ' + y.year,
              meta: (window.fca ? window.fca(y.byType[typeId]) : Number(y.byType[typeId] || 0).toLocaleString('th-TH')) + ' บาท',
              badge: '', go: "window.askAiGo('targets')",
            });
          });
        });
        return rows;
      },
    },
    server_requests: {
      label: 'คำขอใช้งานทีม Server', icon: '🖥️', filters: ['hospital', 'person', 'status', 'date', 'keyword'], mod: ['server_request'], uses: [],
      run: function (f) {
        var list = window.askAiServerRequests ? window.askAiServerRequests() : [];
        return list.filter(function (r) {
          var open = ['pending', 'approved', 'scheduled'].indexOf(r.status) >= 0;
          if (f.status === 'open' && !open) return false;
          if (f.status === 'closed' && open) return false;
          if (['pending', 'approved', 'rejected'].indexOf(f.status) >= 0 && r.status !== f.status) return false;
          if ((f.dateFrom || f.dateTo) && !overlap(r.start, r.end, f.dateFrom, f.dateTo)) return false;
          if (f.hospital && !has(r.hospitalName + ' ' + hospName(r.hospitalId), f.hospital)) return false;
          if (f.person && !has(r.requesterName + ' ' + JSON.stringify(r.assignees || []), f.person)) return false;
          if (f.keyword && !has([r.reqNo, r.requesterName, r.requesterTeam, r.hospitalName, r.taskOther, r.note, r.status].join(' '), f.keyword)) return false;
          return true;
        }).map(function (r) {
          return {
            sortAge: ageDays(r.createdAt || r.start), sortDate: r.start || r.createdAt,
            key: { hospital: hospName(r.hospitalId) || r.hospitalName || '-', person: r.requesterName || '-', category: th('serverReq', r.status) || '-', department: r.requesterTeam || '-' },
            title: (r.reqNo ? r.reqNo + ' · ' : '') + (hospName(r.hospitalId) || r.hospitalName || 'คำขอทีม Server'),
            meta: [r.requesterName, r.requesterTeam, r.start ? fdTh(r.start) : '', r.end && r.end !== r.start ? 'ถึง ' + fdTh(r.end) : '', th('serverReq', r.status)].filter(Boolean).join(' · '),
            badge: th('serverReq', r.status), go: "window.askAiGo('server_request')",
          };
        });
      },
    },
    forms: {
      label: 'เอกสารประกอบ Advance/ออกไซต์', icon: '📋', filters: ['hospital', 'person', 'date', 'keyword'], mod: ['expense_form'], uses: [],
      run: function (f) {
        var rows = [];
        var add = function (kind, list, getStart, getEnd, getTitle, getPerson, getHospital, getText) {
          (list || []).forEach(function (x) {
            var s = getStart(x), e = getEnd(x) || s, person = getPerson(x), hospital = getHospital(x);
            if ((f.dateFrom || f.dateTo) && !overlap(s, e, f.dateFrom, f.dateTo)) return;
            if (f.person && !has(person, f.person)) return;
            if (f.hospital && !has(hospital, f.hospital)) return;
            if (f.keyword && !has(getText(x), f.keyword)) return;
            rows.push({
              sortAge: ageDays(s || x.createdAt), sortDate: s || x.createdAt,
              key: { hospital: hospital || '-', person: person || '-', category: kind, department: '-' },
              title: getTitle(x), meta: [kind, person, hospital, s ? fdTh(s) : '', e && e !== s ? 'ถึง ' + fdTh(e) : ''].filter(Boolean).join(' · '),
              badge: kind, go: "window.askAiGo('expense_form')",
            });
          });
        };
        add('ใบเคลียร์ค่าใช้จ่าย', window.EXPENSE_CLEARING_FORMS,
          function (x) { return x.workStart; }, function (x) { return x.workEnd; },
          function (x) { return x.formNo || x.assignedTask || 'ใบเคลียร์ค่าใช้จ่าย'; }, function (x) { return x.staffName; },
          function (x) { return x.workLocation; }, function (x) { return [x.formNo, x.categoryKey, x.categoryOtherNote, x.assignedTask, x.workLocation].join(' '); });
        add('แบบเตรียม Deploy', window.SITE_DEPLOY_FORMS,
          function (x) { return x.preparerDate || dateOf(x.createdAt); }, function (x) { return x.preparerDate || dateOf(x.createdAt); },
          function (x) { return x.siteLocation || x.customerName || 'แบบเตรียม Deploy'; }, function (x) { return x.preparerName; },
          function (x) { return hospName(x.hospitalId) || x.siteLocation; }, function (x) { return [x.deptKey, x.siteLocation, x.province, x.customerName, x.workOtherNote, x.preparationNotes].join(' '); });
        add('หนังสือแจ้งออกไซต์', window.SITE_NOTICE_FORMS,
          function (x) { return x.workStart || x.docDate; }, function (x) { return x.workEnd || x.workStart || x.docDate; },
          function (x) { return x.docNo || x.siteLocation || 'หนังสือแจ้งออกไซต์'; }, function (x) { return x.requesterName; },
          function (x) { return x.siteLocation; }, function (x) { return [x.docNo, x.systemKey, x.systemOtherNote, x.taskOtherNote, x.siteLocation, x.contractNo, x.quoteNo].join(' '); });
        return rows;
      },
    },
    knowledge: {
      label: 'คลังคำตอบผู้ช่วยทีม', icon: '💬', filters: ['status', 'keyword'], mod: ['assist'], uses: [],
      run: function (f) {
        var list = window.askAiAssistReplies ? window.askAiAssistReplies() : [];
        return list.filter(function (r) {
          if (f.status === 'open' && r.active === false) return false;
          if (f.status === 'closed' && r.active !== false) return false;
          if (f.keyword && !has([r.title, r.command, r.keywords, r.category, r.content, r.note].join(' '), f.keyword)) return false;
          return true;
        }).map(function (r) {
          return {
            sortAge: ageDays(r.updatedAt || r.createdAt), sortDate: r.updatedAt || r.createdAt,
            key: { hospital: '-', person: '-', category: r.category || 'ทั่วไป', department: '-' },
            title: r.title || r.command || 'คำตอบในคลัง',
            meta: [r.command, r.category, r.active === false ? 'ปิดใช้งาน' : 'ใช้งาน'].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('assist')",
          };
        });
      },
    },
    // "ปัญหา" เฉย ๆ อาจเป็น Ticket จากลูกค้า หรือปัญหาที่บันทึกในโครงการติดตั้ง — ค้นทั้งสองแหล่งพร้อมกัน
    problems: {
      label: 'ปัญหา (Ticket + ปัญหาการใช้งาน)', icon: '🩺', filters: ['hospital', 'person', 'status', 'date', 'keyword'],
      mod: ['helpdesk', 'impl_tracker', 'all_issues'], uses: ['priority', 'severity', 'unassigned', 'overdue', 'minAgeDays'],
      run: function (f, today) { return runMany(['tickets', 'issues'], f, today, true); },
    },
    all_system: {
      label: 'ทุกข้อมูลในระบบ', icon: '🔎', filters: ['hospital', 'person', 'status', 'date', 'keyword'],
      mod: ['helpdesk', 'impl_tracker', 'all_issues', 'projects', 'leave', 'advance', 'timesheet', 'cost', 'budget', 'lodging', 'holiday', 'calendar', 'contract', 'worklog', 'hospital', 'server_request', 'expense_form'],
      uses: [],
      run: function (f, today) {
        return runMany(['hospitals', 'tickets', 'issues', 'tasks', 'projects', 'leaves', 'advances', 'timesheets', 'costs', 'lodgings', 'holidays', 'contracts', 'work_logs', 'server_requests', 'forms'], f, today, false);
      },
    },
  };

  // ค้นหลายแหล่งรวมกัน — ข้ามแหล่งที่กรองตามเงื่อนไขที่ถามไม่ได้
  // (เช่นถามถึง รพ.ทุ่งช้าง ต้องไม่โผล่วันหยุดทั้งปีที่ไม่มีช่อง รพ. ให้กรอง)
  function runMany(keys, f, today, keepAll) {
    var rows = [];
    keys.forEach(function (key) {
      var src = SOURCES[key];
      if (!canSource(key)) return;
      if (!keepAll) {
        if (key === 'hospitals' && !f.hospital) return; // ข้อมูล รพ. แสดงเฉพาะเมื่อถามถึง รพ. นั้น
        var fl = src.filters || [];
        if (f.hospital && fl.indexOf('hospital') < 0) return;
        if (f.person && fl.indexOf('person') < 0) return;
        if (f.status !== 'all' && fl.indexOf('status') < 0) return;
        if ((f.dateFrom || f.dateTo) && fl.indexOf('date') < 0) return;
      }
      src.run(f, today).forEach(function (row) {
        row.title = src.icon + ' ' + src.label + ' — ' + row.title;
        row.key.source = src.label;
        rows.push(row);
      });
    });
    return rows;
  }

  function canSource(k) {
    var s = SOURCES[k];
    return !!s && (!window.canView || s.mod.some(function (m) { return window.canView(m); }));
  }

  // ── คำสั่งให้ AI แปลคำถาม → JSON (บอกเฉพาะแหล่งข้อมูลที่ผู้ใช้มีสิทธิ์) ──
  function systemPrompt(today) {
    var src = {
      tickets: 'tickets = Ticket แจ้งปัญหาจากลูกค้า/โรงพยาบาล (Helpdesk) มี Priority p1–p4',
      issues: 'issues = ปัญหาการใช้งานโปรแกรมที่บันทึกในโครงการติดตั้ง มีความรุนแรง low/medium/high/critical',
      tasks: 'tasks = งาน/Task ในแผนโครงการติดตั้ง (มีกำหนดเสร็จ ผู้รับผิดชอบ)',
      projects: 'projects = โครงการติดตั้ง (ช่วงวันที่ ทีมงาน)',
      leaves: 'leaves = ใบลาของทีมงาน',
      free_staff: 'free_staff = ใครว่าง/ไม่ติดโครงการและไม่ลา ในช่วงวันที่',
      advances: 'advances = เงินยืมทดรอง (Advance) ของโครงการ',
      timesheets: 'timesheets = Timesheet/ชั่วโมงทำงานของทีมงานในแต่ละโครงการ',
      costs: 'costs = รายการค่าใช้จ่าย/ต้นทุน/ใบเสร็จของโครงการ',
      lodgings: 'lodgings = ข้อมูลที่พัก/โรงแรมของแต่ละโครงการ',
      holidays: 'holidays = วันหยุดของบริษัท/วันหยุดราชการ',
      contracts: 'contracts = ข้อมูลสัญญา ลูกค้า มูลค่า และช่วงสัญญา',
      work_logs: 'work_logs = บันทึกงาน/แผนงานรายวันและแบบหลายวันของทีมงาน',
      hospitals: 'hospitals = รายชื่อและข้อมูลโรงพยาบาล เช่น จังหวัด ระบบที่ใช้ จำนวนเตียง',
      staff: 'staff = ข้อมูลทีมงาน แผนก ตำแหน่ง อีเมล เบอร์โทร และสถานะใช้งาน',
      targets: 'targets = เป้าหมายยอดทีมรายปี แยกตามประเภทโครงการ',
      problems: 'problems = ปัญหาทุกชนิดรวมกัน (Ticket + ปัญหาการใช้งานในโครงการ) — ใช้เมื่อถามถึง "ปัญหา" โดยไม่ได้ระบุว่า Ticket หรือปัญหาการใช้งาน',
      all_system: 'all_system = ค้นหลายโมดูลพร้อมกัน เมื่อถามกว้าง ๆ ว่าในระบบมีอะไร/รพ.นี้มีอะไรบ้าง โดยไม่ได้ระบุเรื่องใดเรื่องหนึ่ง (ห้ามใช้ถ้าคำถามระบุเรื่องชัด เช่น ปัญหา ลา โครงการ)',
      server_requests: 'server_requests = คำขอใช้งานทีม Server ช่วงงาน โรงพยาบาล ผู้ขอ และสถานะ',
      forms: 'forms = เอกสารเคลียร์ค่าใช้จ่าย แบบเตรียม Deploy และหนังสือแจ้งออกไซต์',
      knowledge: 'knowledge = คลังคำตอบ/คำสั่งลัดของผู้ช่วยทีม',
    };
    var allowed = Object.keys(SOURCES).filter(canSource);
    var cats = (window.HELPDESK_CATEGORIES || []).filter(function (c) { return c.active; }).map(function (c) { return c.name; }).slice(0, 40);
    var d = new Date(today);
    return 'คุณแปลคำถามภาษาไทยของทีมติดตั้งระบบโรงพยาบาล ให้เป็นเงื่อนไขค้นหา ตอบเป็น JSON อย่างเดียว ไม่ต้องอธิบาย\n'
      + 'วันนี้: ' + today + ' (' + ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][d.getDay()] + ') — แปลงคำอย่าง "วันนี้ / พรุ่งนี้ / สัปดาห์หน้า (จันทร์–ศุกร์) / เดือนนี้" เป็นวันที่ ค.ศ. YYYY-MM-DD\n'
      + 'แหล่งข้อมูลที่เลือกได้ (source):\n- ' + allowed.map(function (k) { return src[k]; }).join('\n- ') + '\n'
      + (cats.length ? 'หมวดของ Ticket: ' + cats.join(', ') + '\n' : '')
      + 'กติกา:\n'
      + '- hospital ใส่เฉพาะชื่อ รพ./โครงการ ไม่ต้องมีคำว่า รพ./โรงพยาบาล และไม่เอาคำอื่นในประโยคติดมา เช่น "รพ.ทุ่งช้างมีปัญหาไหม" → "ทุ่งช้าง"\n'
      + '- keyword ใส่เฉพาะคำที่ต้องเจอในเนื้อหารายการ (ชื่อระบบ/อาการ) ห้ามใส่ชื่อ รพ. ชื่อคน ชื่อหมวดข้อมูล หรือคำถามอย่าง ปัญหา/มี/ไหม/ยังไม่ได้แก้\n'
      + '- "ยังไม่ได้แก้ / ยังไม่เสร็จ / ค้าง / ยังเปิดอยู่" = status open · "แก้แล้ว / เสร็จแล้ว / ปิดแล้ว" = closed · ไม่ระบุ = all\n'
      + '- ถ้าถามจำนวน (กี่ / เท่าไร) ก็ยังต้องเลือก source ที่ใช้นับ\n'
      + 'ตัวอย่าง: "ปัญหา รพ.ทุงช้างมียังไม่ได้แก้ไขไหม" → {"source":"problems","understood":"ปัญหาของ รพ.ทุ่งช้างที่ยังไม่ได้แก้ไข","hospital":"ทุงช้าง","keyword":"","person":"","status":"open","priority":[],"severity":[],"minAgeDays":0,"unassigned":false,"overdue":false,"dateFrom":"","dateTo":"","groupBy":"","sort":"oldest"}\n'
      + 'ตัวอย่าง: "เดือนนี้แบมลากี่วัน" → source leaves, person "แบม", dateFrom/dateTo = ต้น/สิ้นเดือนนี้\n'
      + 'รูปแบบ JSON:\n'
      + '{"source":"ชื่อแหล่งข้อมูล หรือ none ถ้าคำถามไม่เกี่ยวกับข้อมูลข้างต้น",'
      + '"understood":"สรุปสั้น ๆ 1 ประโยคว่าเข้าใจคำถามว่าอะไร",'
      + '"hospital":"ชื่อ รพ./โครงการ ที่ถามถึง (ไม่มีให้ว่าง)",'
      + '"keyword":"คำค้นในหัวข้อ/รายละเอียด/หมวด เช่น ชื่อระบบ LIS, PACS, ปริ้นเตอร์ — คำที่ใช้แทนกันได้คั่นด้วย | เช่น lis|แล็บ (ไม่มีให้ว่าง)",'
      + '"person":"ชื่อหรือชื่อเล่นทีมงานที่ถามถึง (ไม่มีให้ว่าง)",'
      + '"status":"open (ยังค้าง/ยังไม่เสร็จ) | closed (เสร็จ/ปิดแล้ว) | pending (รออนุมัติ) | approved (อนุมัติแล้ว) | rejected (ไม่อนุมัติ) | all",'
      + '"priority":["p1","p2"] (เฉพาะ tickets: ด่วนมาก=p1, ด่วน=p1,p2 · tasks ใช้ low/medium/high/urgent) หรือ [],'
      + '"severity":["high","critical"] (เฉพาะ issues) หรือ [],'
      + '"minAgeDays":ตัวเลขจำนวนวันที่ค้างขั้นต่ำ เช่น "ค้างเกิน 7 วัน" = 8 · ไม่ระบุ = 0,'
      + '"unassigned":true ถ้าถามหาเรื่องที่ยังไม่มีคนรับผิดชอบ,'
      + '"overdue":true ถ้าถามหาเรื่องที่เกินกำหนด/เกิน SLA/เลยกำหนดเคลียร์,'
      + '"dateFrom":"YYYY-MM-DD หรือ ว่าง","dateTo":"YYYY-MM-DD หรือ ว่าง",'
      + '"groupBy":"hospital | person | category | department | source (แยกตามประเภทข้อมูล) | none — ใช้เมื่อถามว่า รพ.ไหน/ใคร/หมวดไหน/แผนกไหน มากที่สุด หรือขอสรุปแยกตามกลุ่ม",'
      + '"sort":"oldest | newest"}';
  }

  function cleanPlan(r) {
    r = r || {};
    var arr = function (v) { return Array.isArray(v) ? v.map(function (x) { return String(x).toLowerCase(); }).filter(Boolean) : []; };
    var str = function (v) { return typeof v === 'string' ? v.trim() : ''; };
    var dt = function (v) { v = str(v); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
    var st = str(r.status).toLowerCase();
    var gb = str(r.groupBy).toLowerCase();
    return {
      source: str(r.source).toLowerCase(),
      understood: str(r.understood),
      hospital: str(r.hospital), keyword: str(r.keyword), person: str(r.person),
      status: ['open', 'closed', 'pending', 'approved', 'rejected'].indexOf(st) >= 0 ? st : 'all',
      priority: arr(r.priority), severity: arr(r.severity),
      minAgeDays: Math.max(0, parseInt(r.minAgeDays, 10) || 0),
      unassigned: r.unassigned === true, overdue: r.overdue === true,
      dateFrom: dt(r.dateFrom), dateTo: dt(r.dateTo),
      groupBy: ['hospital', 'person', 'category', 'department', 'source'].indexOf(gb) >= 0 ? gb : '',
      sort: str(r.sort) === 'newest' ? 'newest' : 'oldest',
    };
  }

  // เรื่องที่ผู้ใช้ระบุชัด (ชื่อโมดูล/คำวันที่พื้นฐาน) ให้โค้ดตัดสินเอง ไม่ฝาก AI เดา
  // เพื่อกันเคส "เดือนนี้มีลาไหม" ถูกตีความเป็นเฉพาะใบลารออนุมัติ หรือได้ช่วงวันที่คลาดเคลื่อน
  function applyQuestionRules(f, q, today) {
    var text = String(q || '').toLowerCase().replace(/\s+/g, ' ');
    var d = new Date(today + 'T00:00:00');
    var setRange = function (a, b) { f.dateFrom = iso(a); f.dateTo = iso(b || a); };
    var first, last, day;

    if (/วันนี้/.test(text)) setRange(d);
    else if (/พรุ่งนี้/.test(text)) { day = new Date(d); day.setDate(day.getDate() + 1); setRange(day); }
    else if (/มะรืน/.test(text)) { day = new Date(d); day.setDate(day.getDate() + 2); setRange(day); }
    else if (/เดือนนี้|ประจำเดือน/.test(text)) {
      first = new Date(d.getFullYear(), d.getMonth(), 1);
      last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      setRange(first, last);
    } else if (/เดือนหน้า/.test(text)) {
      first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      last = new Date(d.getFullYear(), d.getMonth() + 2, 0);
      setRange(first, last);
    } else if (/สัปดาห์นี้|อาทิตย์นี้/.test(text)) {
      first = new Date(d); day = (d.getDay() + 6) % 7; first.setDate(first.getDate() - day);
      last = new Date(first); last.setDate(last.getDate() + 6); setRange(first, last);
    } else if (/สัปดาห์หน้า|อาทิตย์หน้า/.test(text)) {
      first = new Date(d); day = (d.getDay() + 6) % 7; first.setDate(first.getDate() - day + 7);
      last = new Date(first); last.setDate(last.getDate() + 6); setRange(first, last);
    } else if (/ปีนี้/.test(text)) {
      setRange(new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31));
    } else if (/ปีหน้า/.test(text)) {
      setRange(new Date(d.getFullYear() + 1, 0, 1), new Date(d.getFullYear() + 1, 11, 31));
    }

    // เรียงจากคำที่เฉพาะกว่าไปหาคำกว้างกว่า และ override เฉพาะเมื่อมีคำชัดเจนจริง
    var intents = [
      ['free_staff', /ใคร.{0,12}ว่าง|ทีม.{0,8}ว่าง|คน.{0,8}ว่าง|พร้อมรับงาน/],
      ['holidays', /วันหยุด|หยุดราชการ/],
      ['leaves', /ลางาน|ลาป่วย|ลากิจ|ลาพักร้อน|ลาคลอด|ลาบวช|ใบลา|ใครลา|มีลา/],
      ['timesheets', /timesheet|time sheet|ไทม์ชีต|ลงเวลา|ชั่วโมงทำงาน/],
      ['costs', /ค่าใช้จ่าย|ต้นทุน|ใบเสร็จ|งบประมาณ/],
      ['lodgings', /ที่พัก|โรงแรม|ค่าห้อง/],
      ['contracts', /สัญญา|มูลค่างาน/],
      ['work_logs', /บันทึกงาน|worklog|work log|แผนงานรายวัน/],
      ['targets', /เป้าหมาย|target/],
      ['advances', /advance|เงินยืม|ทดรอง|เคลียร์เงิน/],
      ['tickets', /ticket|ทิกเก็ต|helpdesk|sla/],
      ['issues', /ปัญหาการใช้งาน|issue|อุบัติการณ์/],
      ['problems', /ปัญหา|ใช้งานไม่ได้|ระบบล่ม|ใช้ไม่ได้|error|บั๊ก|bug/],
      ['tasks', /task|งานในโครงการ|งานที่.{0,8}(เกินกำหนด|ต้องทำ)/],
      ['projects', /โครงการ|โปรเจกต์/],
      ['hospitals', /รายชื่อ.{0,8}(โรงพยาบาล|รพ\.)|ข้อมูล.{0,8}(โรงพยาบาล|รพ\.)|โรงพยาบาล.{0,8}(จังหวัด|อำเภอ|เตียง|ระบบ)/],
      ['staff', /ข้อมูล.{0,8}(พนักงาน|ทีมงาน)|รายชื่อ.{0,8}(พนักงาน|ทีมงาน)|เบอร์.{0,8}(พนักงาน|ทีมงาน)|อีเมล.{0,8}(พนักงาน|ทีมงาน)/],
      ['server_requests', /คำขอ.{0,12}(ทีม server|ทีมเซิร์ฟเวอร์|server)|ขอใช้.{0,12}(ทีม server|ทีมเซิร์ฟเวอร์|server)/i],
      ['forms', /ใบเคลียร์ค่าใช้จ่าย|เอกสารประกอบ advance|แบบเตรียม deploy|หนังสือแจ้งออกไซต์/i],
      ['knowledge', /คลังคำตอบ|คำสั่งลัด|ผู้ช่วยทีม/],
      ['all_system', /ทุกเรื่อง|ทุกข้อมูล|ทั้งหมด.{0,8}ระบบ|ในระบบ.{0,8}ทั้งหมด|มีอะไรบ้าง/],
    ];
    intents.some(function (x) {
      if (x[1].test(text) && canSource(x[0])) { f.source = x[0]; return true; }
      return false;
    });

    // คำถามแทนตัว (ใคร/ที่ไหน) ต้องใช้เพื่อจัดกลุ่ม ไม่ใช่นำไปค้นเป็นชื่อจริง
    if (/^(ใคร|ใครบ้าง|คนไหน|ทีมงานคนไหน)$/.test(f.person)) f.person = '';
    if (/^(ไหน|ที่ไหน|รพ\.?ไหน|โรงพยาบาลไหน|โครงการไหน)$/.test(f.hospital)) f.hospital = '';

    // คำถามกว้างเรื่องลา หมายถึงใบลาที่เกิดขึ้นจริงทั้งหมด (อนุมัติแล้ว + รออนุมัติ)
    // จะกรองสถานะต่อเมื่อผู้ใช้เอ่ยสถานะนั้นอย่างชัดเจนเท่านั้น
    if (f.source === 'leaves') {
      if (/ไม่อนุมัติ|ถูกปฏิเสธ|ปฏิเสธ/.test(text)) f.status = 'rejected';
      else if (/รออนุมัติ|ยังไม่อนุมัติ/.test(text)) f.status = 'pending';
      else if (/อนุมัติแล้ว|อนุมัติเรียบร้อย/.test(text)) f.status = 'approved';
      else f.status = 'all';
    } else {
      // สถานะจากคำพูดตรง ๆ ไม่ฝาก AI — "ยังไม่ได้แก้ไข" ต้องได้เฉพาะที่ยังค้าง
      var openWord = /ยังไม่(ได้)?(แก้|ปิด|เสร็จ|ดำเนินการ|จบ)|ยังค้าง|ค้างอยู่|ค้างเกิน|ค้างนาน|(งาน|ปัญหา|เรื่อง)ค้าง|ค้างแก้|ยังเปิด|รอแก้|รอดำเนินการ|คงค้าง/.test(text);
      var closedWord = !openWord && /(แก้|แก้ไข|ปิด|เสร็จ|จบ)(เรียบร้อย)?แล้ว|แก้เสร็จ/.test(text);
      if (openWord) f.status = 'open';
      else if (closedWord) f.status = 'closed';
      else if (f.source === 'all_system' && !/รออนุมัติ|อนุมัติแล้ว|ไม่อนุมัติ|ปฏิเสธ/.test(text)) f.status = 'all';
    }
    // ชื่อโมดูลเป็นตัวบอกแหล่งข้อมูล ไม่ใช่ keyword ของแต่ละแถว เพราะ AI บางรุ่นเติมคำเหล่านี้มาเอง
    // เช่นค้นวันหยุดด้วย keyword "วันหยุด" จะไม่เจอชื่อวัน "วันจักรี" ทั้งที่อยู่ในตารางวันหยุด
    var genericKeyword = {
      leaves: /^(ลา|ลางาน|ใบลา)$/,
      holidays: /^(วันหยุด|หยุดราชการ)$/,
      timesheets: /^(timesheet|time sheet|ไทม์ชีต|ลงเวลา|ชั่วโมงทำงาน)$/i,
      costs: /^(ค่าใช้จ่าย|ต้นทุน|ใบเสร็จ|งบประมาณ)$/,
      lodgings: /^(ที่พัก|โรงแรม|ค่าห้อง)$/,
      contracts: /^(สัญญา|ข้อมูลสัญญา|มูลค่างาน)$/,
      work_logs: /^(บันทึกงาน|worklog|work log|แผนงานรายวัน)$/i,
      targets: /^(เป้าหมาย|target)$/i,
      advances: /^(advance|เงินยืม|เงินทดรอง|ทดรอง)$/i,
      tickets: /^(ticket|ทิกเก็ต|helpdesk|ปัญหา)$/i,
      issues: /^(ปัญหา|ปัญหาการใช้งาน|issue)$/i,
      problems: /^(ปัญหา|ปัญหาการใช้งาน|issue|ticket)$/i,
      projects: /^(โครงการ|โปรเจกต์)$/,
      hospitals: /^(โรงพยาบาล|รพ\.?|ข้อมูลโรงพยาบาล|รายชื่อโรงพยาบาล)$/,
      staff: /^(พนักงาน|ทีมงาน|ข้อมูลทีมงาน|รายชื่อทีมงาน)$/,
      all_system: /^(ข้อมูล|ทั้งหมด|ทุกข้อมูล|ทุกเรื่อง|อะไร|มีอะไร|มีอะไรบ้าง|ในระบบ)$/,
      server_requests: /^(คำขอทีม server|คำขอใช้ทีม server|ทีม server|server request)$/i,
      forms: /^(เอกสาร|แบบฟอร์ม|เอกสารประกอบ advance)$/i,
      knowledge: /^(คลังคำตอบ|คำสั่งลัด|ผู้ช่วยทีม)$/,
    };
    if (genericKeyword[f.source] && genericKeyword[f.source].test(f.keyword)) f.keyword = '';
    // กัน keyword ที่มีแต่คำประกอบคำถาม เช่น "เดือนนี้มีลาไหม" ซึ่งไม่ใช่ข้อความในแถวข้อมูล
    var domainNoise = {
      leaves: /ใบลา|ลางาน|ลา/g,
      holidays: /วันหยุด|หยุดราชการ/g,
      timesheets: /timesheet|time sheet|ไทม์ชีต|ลงเวลา|ชั่วโมงทำงาน/gi,
      costs: /ค่าใช้จ่าย|ต้นทุน|ใบเสร็จ|งบประมาณ/g,
      lodgings: /ที่พัก|โรงแรม|ค่าห้อง/g,
      contracts: /ข้อมูลสัญญา|สัญญา|มูลค่างาน/g,
      work_logs: /บันทึกงาน|worklog|work log|แผนงานรายวัน/gi,
      advances: /advance|เงินยืม|เงินทดรอง|ทดรอง/gi,
      tickets: /ticket|ทิกเก็ต|helpdesk|ปัญหา/gi,
      issues: /ปัญหาการใช้งาน|ปัญหา|issue/gi,
      problems: /ปัญหาการใช้งาน|ปัญหา|ticket|issue/gi,
      projects: /โครงการ|โปรเจกต์/g,
      hospitals: /ข้อมูลโรงพยาบาล|รายชื่อโรงพยาบาล|โรงพยาบาล|รพ\.?/g,
      staff: /ข้อมูลทีมงาน|รายชื่อทีมงาน|พนักงาน|ทีมงาน/g,
      all_system: /ข้อมูล|ในระบบ|ทั้งหมด|ทุกเรื่อง|ทุกอย่าง/g,
      server_requests: /คำขอ|ขอใช้|ทีม server|ทีมเซิร์ฟเวอร์|server request/gi,
      forms: /เอกสาร|แบบฟอร์ม|เอกสารประกอบ advance/gi,
      knowledge: /คลังคำตอบ|คำสั่งลัด|ผู้ช่วยทีม/g,
    };
    resolveHospital(f, q);
    // keyword ที่เหลือแต่คำถาม/คำบอกสถานะ/ชื่อ รพ./ชื่อคน (AI ชอบใส่ซ้ำ) ไม่ใช่ข้อความในแถวข้อมูล → ทิ้ง
    if (f.keyword) {
      var meaningful = norm(f.keyword
        .toLowerCase()
        .replace(/วันนี้|พรุ่งนี้|มะรืน|เดือนนี้|เดือนหน้า|สัปดาห์นี้|สัปดาห์หน้า|อาทิตย์นี้|อาทิตย์หน้า|ปีนี้|ปีหน้า/g, '')
        .replace(/ยังไม่ได้|ยังไม่|แก้ไข|แก้|ค้าง|เสร็จ|ปิด|แล้ว|ได้/g, '')
        .replace(/มี|ไหม|หรือไม่|อะไร|ใคร|บ้าง|รายการ|กี่|เท่าไร|เท่าไหร่/g, '')
        .replace(domainNoise[f.source] || /$^/, ''));
      [f.hospital, f.person].forEach(function (x) { if (x) meaningful = meaningful.split(norm(x)).join(''); });
      if (!meaningful.replace(/\|/g, '')) f.keyword = '';
    }
    // วันหยุด: ระบุประเภท (บริษัท/ราชการ) ให้กรองตามนั้น — "บริษัท" ตรงทั้งวันหยุดบริษัท และวันหยุดราชการและบริษัท
    if (f.source === 'holidays') {
      if (/บริษัท/.test(text)) f.keyword = 'บริษัท';
      else if (/ราชการ/.test(text)) f.keyword = 'ราชการ';
    }
    // "ที่เหลือ / ยังมาไม่ถึง / ต่อจากนี้" ของข้อมูลที่เป็นวันในอนาคต → เริ่มนับจากวันนี้ (ไม่เอาที่ผ่านไปแล้ว)
    if (['holidays', 'leaves', 'work_logs', 'server_requests'].indexOf(f.source) >= 0
      && /ที่เหลือ|เหลืออีก|ยังมาไม่ถึง|ยังไม่ถึง|ต่อจากนี้|จากนี้ไป|ที่จะถึง|กำลังจะมา|ข้างหน้า/.test(text)
      && (!f.dateFrom || f.dateFrom < today)) f.dateFrom = today;
    if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) {
      var swap = f.dateFrom; f.dateFrom = f.dateTo; f.dateTo = swap;
    }
    return f;
  }

  // ── ชื่อ รพ./โครงการ: ถ้า AI ไม่ได้ให้มา หาจากในคำถามเอง · ถ้าให้มาแต่ไม่ตรงชื่อไหนเลย (พิมพ์ผิด/ตกวรรณยุกต์)
  //    ใช้ชื่อในระบบที่คล้ายที่สุดแทน — กันผลว่างเปล่าทั้งที่มีข้อมูลอยู่ ──
  function placeNames() {
    var names = [];
    (window.HOSPITALS || []).forEach(function (h) { names.push(h.name); });
    (window.PROJECTS || []).forEach(function (p) { names.push(p.name); });
    (window.IMPL_PROJECTS || []).forEach(function (p) { names.push(p.name); });
    return names.filter(function (n) { return norm(n).length >= 3; });
  }
  function placeLabel(n) { return String(n).replace(/^(โรงพยาบาล|รพ\.?)\s*/, ''); }
  function resolveHospital(f, q) {
    var hs = (window.HOSPITALS || []).filter(function (h) { return norm(h.name).length >= 3; });
    if (!f.hospital) {
      var nq = norm(q), best = null;
      hs.forEach(function (h) { var n = norm(h.name); if (nq.indexOf(n) >= 0 && (!best || n.length > norm(best).length)) best = h.name; });
      if (best) f.hospital = placeLabel(best);
      return;
    }
    var names = placeNames();
    if (names.some(function (n) { return has(n, f.hospital); })) return;
    var top = null, topSim = 0;
    hs.forEach(function (h) {
      var sim = window.aiTextSim ? window.aiTextSim(norm(h.name), norm(f.hospital)) : 0;
      if (sim > topSim) { topSim = sim; top = h.name; }
    });
    if (top && topSim >= 0.5) { f.hospitalAsked = f.hospital; f.hospital = placeLabel(top); }
  }

  // ── ป้ายเงื่อนไขที่ใช้ค้นจริง — ให้ผู้ใช้เห็นว่าระบบกรองด้วยอะไร (ตรวจได้ว่า AI แปลถูกไหม) ──
  // src.uses = เงื่อนไขพิเศษที่แหล่งนั้นใช้กรองจริง — ไม่แสดงป้ายที่ไม่มีผล (เช่น Priority ตอนสลับไปค้นปัญหาการใช้งาน)
  function chips(f, src) {
    var use = function (k) { return src.uses.indexOf(k) >= 0; };
    var c = [];
    if (f.hospital) c.push('🏥 ' + f.hospital + (f.hospitalAsked ? ' (จาก "' + f.hospitalAsked + '")' : ''));
    if (f.keyword) c.push('🔎 ' + f.keyword.split('|').join(' / '));
    if (f.person) c.push('👷 ' + f.person);
    if (f.status !== 'all') c.push({ open:'ยังค้าง', closed:'เสร็จแล้ว', pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ' }[f.status] || f.status);
    if (f.priority.length && use('priority')) c.push('Priority ' + f.priority.join(', ').toUpperCase());
    if (f.severity.length && use('severity')) c.push('ความรุนแรง ' + f.severity.map(function (s) { return lbl(window.IMPL_SEVERITY, s); }).join(', '));
    if (f.minAgeDays && use('minAgeDays')) c.push('ค้าง ≥ ' + f.minAgeDays + ' วัน');
    if (f.unassigned && use('unassigned')) c.push('ยังไม่มอบหมาย');
    if (f.overdue && use('overdue')) c.push('เกินกำหนด');
    if (f.dateFrom || f.dateTo) c.push('📅 ' + (f.dateFrom ? fdTh(f.dateFrom) : '…') + ' – ' + (f.dateTo ? fdTh(f.dateTo) : '…'));
    if (f.groupBy) c.push('แยกตาม' + { hospital: ' รพ./โครงการ', person: 'คน', category: 'หมวด', department: 'แผนก', source: 'ประเภทข้อมูล' }[f.groupBy]);
    return c.map(function (x) { return '<span class="ask-chip">' + esc(x) + '</span>'; }).join('');
  }

  var MAX_ROWS = 50;
  function rowHtml(r) {
    return '<div class="ask-row" onclick="' + r.go + '">'
      + '<div class="ask-row-t">' + (r.badge ? '<span class="ask-badge">' + esc(r.badge) + '</span>' : '') + esc(r.title) + '</div>'
      + '<div class="ask-row-m">' + esc(r.meta) + '</div></div>';
  }

  function render(f, src, rows) {
    var head = '<div class="ask-understood"><span>🤖 AI เข้าใจว่า: <b>' + esc(beYear(f.understood) || '-') + '</b></span>' + speakBtn() + '</div>'
      + '<div class="ask-chips"><span class="ask-chip src">' + src.icon + ' ' + esc(src.label) + '</span>' + chips(f, src) + '</div>';
    if (!rows.length) return head + '<div class="ask-empty"><div class="ask-empty-ic">🔍</div>ไม่พบรายการที่ตรงเงื่อนไข<br><span style="font-size:12px;">ลองถามให้กว้างขึ้น หรือเปลี่ยนคำค้น</span></div>';

    rows.sort(function (a, b) { return f.sort === 'newest' ? String(b.sortDate || '').localeCompare(String(a.sortDate || '')) : b.sortAge - a.sortAge; });
    var body;
    if (f.groupBy) {
      var g = {};
      rows.forEach(function (r) { var k = r.key[f.groupBy] || '-'; (g[k] = g[k] || []).push(r); });
      var keys = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; });
      var max = g[keys[0]].length;
      body = '<div class="ask-sum">พบ ' + esc(countText(f, rows)).replace(/^(\d+)/, '<b>$1</b>') + ' ใน <b>' + keys.length + '</b> กลุ่ม</div>'
        + keys.map(function (k, i) {
          return '<details class="ask-grp"' + (i === 0 && keys.length <= 3 ? ' open' : '') + '><summary>'
            + '<span class="ask-grp-n">' + esc(k) + '</span>'
            + '<span class="ask-bar"><i style="width:' + Math.max(4, Math.round(g[k].length / max * 100)) + '%"></i></span>'
            + '<b class="ask-grp-c">' + g[k].length + '</b></summary>'
            + g[k].slice(0, MAX_ROWS).map(rowHtml).join('')
            + (g[k].length > MAX_ROWS ? '<div class="ask-more">และอีก ' + (g[k].length - MAX_ROWS) + ' ' + groupUnitOf(f) + '</div>' : '')
            + '</details>';
        }).join('');
    } else {
      body = '<div class="ask-sum">พบ ' + esc(countText(f, rows)).replace(/^(\d+)/, '<b>$1</b>') + (rows.length > MAX_ROWS ? ' (แสดง ' + MAX_ROWS + ' รายการแรก)' : '') + '</div>'
        + rows.slice(0, MAX_ROWS).map(rowHtml).join('');
    }
    // แชทแสดงแค่คำตอบ — ข้อมูลที่ค้นได้ทั้งหมด (สิ่งที่ AI เข้าใจ/เงื่อนไข/รายการคลิกได้) พับเก็บไว้ กดดูเมื่ออยากตรวจ
    // (สรุปคำตอบไม่ได้ → showAnswer กางออกให้เอง เพราะเหลือแค่รายการให้ดู)
    return '<div class="ask-answer"><span class="ask-dots"><i></i><i></i><i></i></span><span class="ask-typing">กำลังสรุปคำตอบ…</span></div>'
      + '<details class="ask-detail"><summary>📋 ดูข้อมูลทั้งหมด <span>' + esc(countText(f, rows)) + ' · ' + esc(src.label) + '</span></summary>'
      + head + body + '<div class="ai-card-note">* คำตอบ AI สรุปจากข้อมูลชุดนี้เท่านั้น — ค้นจากข้อมูลจริงในระบบ ณ ตอนนี้ · คลิกรายการเพื่อเปิดดู</div>'
      + '</details>';
  }
  function speakBtn() {
    return window.TTS ? '<button type="button" class="ask-speak" onclick="window.askAiSpeak(this)" title="ให้ AI อ่านคำตอบให้ฟัง">'
      + '<span class="ask-speak-ic">🔊</span><span class="ask-speak-lbl">ฟังคำตอบ</span></button>' : '';
  }
  // ปี ค.ศ. ที่ AI เขียนในข้อความ (เช่น "ปี 2026") → พ.ศ. ให้ตรงกับส่วนอื่นของระบบ
  function beYear(s) { return String(s || '').replace(/\b(20\d{2})\b/g, function (m, y) { return +y + 543; }); }

  // ══ UI: น้องบอทลอยมุมขวาล่าง กดแล้วเปิดหน้าต่างแชท — ถาม/ตอบต่อกันเป็นบทสนทนา ══
  var EXAMPLES = [
    { src: 'issues', q: 'รพ.ไหนมีปัญหาค้างเกิน 7 วันมากที่สุด' },
    { src: 'tickets', q: 'Ticket P1/P2 ที่ยังไม่มอบหมาย' },
    { src: 'tickets', q: 'Ticket ที่เกิน SLA แยกตามคนรับผิดชอบ' },
    { src: 'free_staff', q: 'สัปดาห์หน้าใครว่างบ้าง' },
    { src: 'tasks', q: 'งานที่เกินกำหนดแยกตามโครงการ' },
    { src: 'leaves', q: 'เดือนนี้ใครลาบ้าง' },
    { src: 'advances', q: 'Advance ที่เลยกำหนดเคลียร์' },
  ];

  // ตัวการ์ตูนบอท — สีไล่โทนอ้างอิง gradient #ask-bot-g ที่ประกาศไว้ใน svg ของปุ่มลอย (มีอยู่ตลอด)
  function botSvg(defs) {
    return '<svg class="ask-bot-svg" viewBox="0 0 64 64" aria-hidden="true">'
      + (defs ? '<defs><linearGradient id="ask-bot-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b6cff"/><stop offset="1" stop-color="#db2777"/></linearGradient></defs>' : '')
      + '<line x1="32" y1="5" x2="32" y2="14" stroke="#7c5cfc" stroke-width="3" stroke-linecap="round"/>'
      + '<circle class="ab-ant" cx="32" cy="6" r="4.2" fill="#ffd166"/>'
      + '<rect x="5" y="27" width="7" height="13" rx="3.5" fill="#7c5cfc"/><rect x="52" y="27" width="7" height="13" rx="3.5" fill="#db2777"/>'
      + '<rect x="9" y="14" width="46" height="40" rx="15" fill="url(#ask-bot-g)"/>'
      + '<rect x="15" y="21" width="34" height="24" rx="11" fill="#fff"/>'
      + '<g class="ab-eyes"><ellipse cx="25" cy="31" rx="3.3" ry="4.2" fill="#2b2d42"/><ellipse cx="39" cy="31" rx="3.3" ry="4.2" fill="#2b2d42"/>'
      + '<circle cx="26.2" cy="29.6" r="1.1" fill="#fff"/><circle cx="40.2" cy="29.6" r="1.1" fill="#fff"/></g>'
      + '<path d="M27.5 38q4.5 3.6 9 0" stroke="#2b2d42" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
      + '<circle cx="20" cy="38" r="2.2" fill="#ff8fab" opacity=".75"/><circle cx="44" cy="38" r="2.2" fill="#ff8fab" opacity=".75"/>'
      + '</svg>';
  }

  function ui() {
    var p = document.getElementById('ask-chat');
    if (p) return p;
    var fab = document.createElement('button');
    fab.type = 'button'; fab.id = 'ask-fab'; fab.className = 'ask-fab';
    fab.title = 'ถาม AI — ค้นข้อมูลด้วยภาษาพูด (Ctrl+K)'; fab.setAttribute('aria-label', 'ถาม AI');
    fab.onclick = function () { window.askAiToggle(); };
    fab.innerHTML = '<span class="ask-fab-tip">มีอะไรให้ช่วยไหม? 👋</span>' + botSvg(true)
      + '<span class="ask-fab-x" role="button" title="ซ่อนผู้ช่วย AI (เรียกกลับได้ที่แถบขอบขวา หรือ Ctrl+K)" aria-label="ซ่อนผู้ช่วย AI" onclick="event.stopPropagation();window.askAiHideFab(true)">✕</span>';
    document.body.appendChild(fab);
    // แถบเล็กขอบขวา — โผล่เมื่อซ่อนบอทไว้ กดเพื่อเรียกบอทกลับ
    var peek = document.createElement('button');
    peek.type = 'button'; peek.id = 'ask-peek'; peek.className = 'ask-peek';
    peek.title = 'แสดงผู้ช่วย AI'; peek.setAttribute('aria-label', 'แสดงผู้ช่วย AI');
    peek.onclick = function () { window.askAiHideFab(false); };
    peek.textContent = '🤖';
    document.body.appendChild(peek);
    paintFab();

    p = document.createElement('section');
    p.id = 'ask-chat'; p.className = 'ask-chat'; p.setAttribute('aria-label', 'แชทถาม AI');
    p.innerHTML = '<header class="ask-head">'
      + '<span class="ask-av">' + botSvg() + '</span>'
      + '<div class="ask-head-t"><b>ผู้ช่วย AI</b><small><i></i>ค้นจากข้อมูลจริงในระบบ</small></div>'
      + (window.TTS ? '<button type="button" class="ask-hbtn" id="ask-autoread" onclick="window.askAiAutoRead()"></button>' : '')
      + '<button type="button" class="ask-hbtn" onclick="window.askAiReset()" title="เริ่มแชทใหม่" aria-label="เริ่มแชทใหม่"><i class="ti ti-refresh" aria-hidden="true"></i></button>'
      + '<button type="button" class="ask-hbtn" onclick="window.askAiClose()" title="ปิด (Esc)" aria-label="ปิด"><i class="ti ti-x" aria-hidden="true"></i></button>'
      + '</header>'
      + '<div class="ask-msgs" id="ask-msgs"></div>'
      + '<form class="ask-form" onsubmit="event.preventDefault();window.askAiRun();">'
      + '<textarea id="ask-q" rows="1" autocomplete="off" placeholder="พิมพ์คำถาม แล้วกด Enter…" oninput="window.askAiGrow(this)" onkeydown="window.askAiKey(event)"></textarea>'
      + '<button id="ask-btn" class="ask-go" type="submit" aria-label="ส่งคำถาม"><i class="ti ti-send" aria-hidden="true"></i></button>'
      + '</form>';
    document.body.appendChild(p);
    paintAutoRead();
    return p;
  }

  function scrollEnd() { var m = document.getElementById('ask-msgs'); if (m) m.scrollTop = m.scrollHeight; }
  function addMsg(who, html) {
    var el = document.createElement('div');
    el.className = 'ask-msg ' + who;
    el.innerHTML = (who === 'bot' ? '<span class="ask-av sm">' + botSvg() + '</span>' : '') + '<div class="ask-bubble">' + html + '</div>';
    document.getElementById('ask-msgs').appendChild(el);
    scrollEnd();
    return el.querySelector('.ask-bubble');
  }

  function greet() {
    var ex = EXAMPLES.filter(function (e) { return canSource(e.src); });
    var name = window.cu && (window.cu.nickname || window.cu.name);
    addMsg('bot', 'สวัสดีครับ' + (name ? ' คุณ' + esc(name) : '') + ' 👋 ถามข้อมูลในระบบเป็นภาษาพูดได้เลย ผมจะค้นจากข้อมูลจริงให้ คลิกผลลัพธ์เพื่อเปิดดูต่อได้ครับ'
      + (ex.length ? '<div class="ask-sec">💡 ลองถามแบบนี้</div><div class="ask-sugs">' + ex.map(function (e) {
          return '<button type="button" class="ask-sug" onclick="window.askAiExample(this)" data-q="' + esc(e.q) + '">'
            + '<span class="ask-sug-ic" aria-hidden="true">' + SOURCES[e.src].icon + '</span>'
            + '<span class="ask-sug-tx"><b>' + esc(e.q) + '</b><small>' + esc(SOURCES[e.src].label) + '</small></span></button>';
        }).join('') + '</div>' : ''));
  }

  var _open = false, _owner = null;
  window.askAiOpen = function () {
    var p = ui();
    // ทักทายครั้งแรก / เปลี่ยนผู้ใช้ (ออกแล้วเข้าระบบด้วยบัญชีอื่น) → เริ่มแชทใหม่ ไม่ให้เห็นบทสนทนาของคนก่อน
    var who = window.cu && window.cu.id;
    if (!document.getElementById('ask-msgs').children.length || who !== _owner) { _owner = who; window.askAiReset(true); }
    _open = true;
    p.classList.add('on');
    document.body.classList.add('ask-open');
    scrollEnd();
    setTimeout(function () { var i = document.getElementById('ask-q'); if (i) i.focus(); }, 60);
  };
  window.askAiClose = function () {
    var p = document.getElementById('ask-chat');
    if (!p) return;
    _open = false;
    speakStop();
    p.classList.remove('on');
    document.body.classList.remove('ask-open');
  };
  // ── ซ่อน/แสดงบอทลอย — จำไว้ในเบราว์เซอร์ (ซ่อนแล้วยังเปิดแชทด้วย Ctrl+K ได้) ──
  var FAB_KEY = '_bms_ask_fab_off';
  function fabOff() { try { return localStorage.getItem(FAB_KEY) === '1'; } catch (e) { return false; } }
  function paintFab() { document.body.classList.toggle('ask-fab-off', fabOff()); }
  window.askAiHideFab = function (off) {
    try { localStorage.setItem(FAB_KEY, off ? '1' : '0'); } catch (e) {}
    if (off) window.askAiClose();
    paintFab();
  };
  window.askAiToggle = function () { _open ? window.askAiClose() : window.askAiOpen(); };
  // เริ่มแชทใหม่ — ล้างบทสนทนา ยกเลิกคำถามที่ค้างอยู่
  window.askAiReset = function (silent) {
    _seq++; _last = null; _busy = false;
    speakStop();
    document.getElementById('ask-msgs').innerHTML = '';
    document.getElementById('ask-btn').disabled = false;
    greet();
    if (!silent) document.getElementById('ask-q').focus();
  };
  window.askAiExample = function (b) { document.getElementById('ask-q').value = b.getAttribute('data-q'); window.askAiRun(); };
  // ช่องพิมพ์ขยายตามข้อความ (สูงสุด ~4 บรรทัด) · Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่
  window.askAiGrow = function (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 110) + 'px'; };
  window.askAiKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); window.askAiRun(); }
  };

  // ── คำว่า "ปัญหา" อาจหมายถึง Ticket หรือปัญหาในโครงการติดตั้งก็ได้ — มีลิงก์สลับแหล่งข้อมูลโดยใช้เงื่อนไขเดิม (ไม่ต้องถาม AI ใหม่) ──
  var ALT = { tickets: 'issues', issues: 'tickets' };
  var _last = null;
  // แสดงผลค้นลงบับเบิล แล้วให้ AI เขียนคำตอบภาษาคนจากรายการที่ค้นเจอ (เติมตามมาทีหลัง ไม่ต้องรอ)
  // noSummary = ไม่เรียก AI สรุป (เช่นเพิ่งเรียก AI ไม่สำเร็จ — ไม่ยิงซ้ำให้เซิร์ฟเวอร์หนักขึ้น)
  function openDetail(out) { var d = out.querySelector('.ask-detail'); if (d) d.open = true; }
  function showAnswer(out, q, f, today, prefix, noSummary) {
    var src = SOURCES[f.source], alt = ALT[f.source];
    var pq = personQuery(f.person);
    var rows = src.run(f, today);
    out.innerHTML = (prefix || '')
      + (pq && !pq.found ? '<div class="ai-flag" style="margin-bottom:6px;">ไม่พบทีมงานชื่อ "' + esc(f.person) + '" ในรายชื่อ — ค้นจากชื่อที่บันทึกไว้ในรายการแทน</div>' : '')
      + render(f, src, rows)
      + (alt && canSource(alt) ? '<div class="ask-alt"><a href="javascript:void(0)" onclick="window.askAiSwitch(\'' + alt + '\')">'
        + SOURCES[alt].icon + ' ค้นด้วยเงื่อนไขเดียวกันใน ' + esc(SOURCES[alt].label) + ' แทน →</a></div>' : '');
    out._ask = { f: f, rows: rows }; // ให้ 🔊 ฟังคำตอบ ประกอบประโยคจากข้อมูลจริง (rows ถูกเรียงตามที่แสดงแล้วใน render)
    scrollEnd();
    var box = out.querySelector('.ask-answer');
    if (!rows.length || noSummary) { if (box) box.remove(); openDetail(out); autoSpeak(out, _seq); return; }
    summarize(out, q, src, rows, f); // อ่านออกเสียงเองเมื่อสรุปเสร็จ
  }

  // ── AI สรุปคำตอบจากผลค้นจริง — ส่งจำนวนรวม/จำนวนแยกกลุ่มที่โค้ดนับไว้ + รายการ 30 แถวแรก ห้ามแต่งเพิ่ม ──
  var SUM_ROWS = 30;
  var COUNT_LBL = { source: 'แยกตามประเภทข้อมูล', hospital: 'แยกตาม รพ./โครงการ', person: 'แยกตามคน', category: 'แยกตามหมวด/สถานะ' };
  function countBy(rows, k) {
    var c = {};
    rows.forEach(function (r) { var v = r.key[k]; if (v && v !== '-') c[v] = (c[v] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 8).map(function (x) { return x + ' ' + c[x]; }).join(', ');
  }
  async function summarize(out, q, src, rows, f) {
    var box = out.querySelector('.ask-answer'), seq = _seq;
    if (!box) return;
    var counts = Object.keys(COUNT_LBL).map(function (k) { var t = countBy(rows, k); return t ? COUNT_LBL[k] + ': ' + t : ''; }).filter(Boolean).join('\n');
    var data = 'แหล่งข้อมูล: ' + src.label + '\n'
      + 'เงื่อนไขที่ใช้ค้น: ' + ((out.querySelector('.ask-chips') || {}).textContent || '-') + '\n'
      + 'จำนวนที่พบทั้งหมด: ' + countText(f, rows) + '\n'
      + 'หน่วยนับที่ต้องใช้: ' + (f.source === 'leaves' ? 'คน (นับจำนวนคนที่ลา คนเดียวลาหลายครั้งนับ 1 คน) · ใบลาใช้ "ใบ" · จำนวนครั้งที่แต่ละคนลาใช้ "ครั้ง"' : unitOf(f)) + '\n'
      + (counts ? counts + '\n' : '')
      + 'รายการ (' + Math.min(rows.length, SUM_ROWS) + ' แถวแรกจาก ' + rows.length + ' ตามลำดับที่แสดง):\n'
      + rows.slice(0, SUM_ROWS).map(function (r, i) { return (i + 1) + '. ' + (r.badge ? '[' + r.badge + '] ' : '') + r.title + ' — ' + r.meta; }).join('\n');
    var sys = 'คุณคือผู้ช่วย AI ของระบบ Backoffice ทีมติดตั้งระบบโรงพยาบาล ตอบคำถามผู้ใช้เป็นภาษาไทย โดยใช้ "ผลค้นจากฐานข้อมูล" ที่ให้มาเท่านั้น\n'
      + 'รูปแบบคำตอบ (สั้น อ่านง่าย คนทั่วไปเข้าใจทันที):\n'
      + '1) บรรทัดแรก = ตอบตรงคำถาม 1 ประโยค บอกจำนวนรวมครั้งเดียว ลงท้าย "ครับ" ในประโยคนี้ เช่น "มีวันหยุดที่ยังมาไม่ถึงอีก 7 วันครับ", "เดือนนี้มีคนลา 3 คนครับ"\n'
      + '   ใช้ "หน่วยนับที่ต้องใช้" ที่ให้มาเสมอ (คน / วัน / เรื่อง / โครงการ …) ห้ามเรียกทุกอย่างว่า "รายการ" · ถามว่าใคร/กี่คน ให้ตอบเป็นจำนวนคน\n'
      + '2) ตามด้วยรายการเป็นข้อ ๆ ขึ้นต้นด้วย "- " ไม่เกิน 5 ข้อ ข้อละ 1 บรรทัดสั้น ๆ รูปแบบ "ชื่อรายการ — รายละเอียดที่สำคัญที่สุด" เช่น "- วันคล้ายวันสวรรคต ร.9 — 13 ต.ค. 2569"\n'
      + '   เลือกรายการที่ตอบคำถามที่สุด (ใกล้ที่สุด / ค้างนานสุด / ด่วนสุด) เรียงตามนั้น\n'
      + '3) ถ้ามีมากกว่าที่ยกมา ปิดท้าย 1 บรรทัด "และอีก N <หน่วยนับเดียวกัน> กดดูข้อมูลทั้งหมดด้านล่างได้ครับ"\n'
      + 'ข้อห้าม:\n'
      + '- ห้ามพูดจำนวนรวมซ้ำ ห้ามมีข้อที่สรุปตัวเลขซ้ำกับบรรทัดแรก ห้ามแต่งข้อมูลที่ไม่มี (ตัวเลขรวมใช้ "จำนวนที่พบทั้งหมด" และจำนวนแยกกลุ่มที่ให้ไว้เท่านั้น)\n'
      + '- ห้ามใช้คำภาษาอังกฤษหรือรหัสภายในระบบ ใช้คำไทยตามที่ปรากฏในข้อมูล · วันที่เขียนแบบเดียวกับข้อมูล (เช่น 13 ต.ค. 2569)\n'
      + '- ห้ามตัวหนา ห้ามหัวข้อ ห้ามอธิบายวิธีค้น ห้ามขึ้นบรรทัดที่มีแค่คำว่า "ครับ"\n'
      + '- ถ้ารายการไม่ตรงกับสิ่งที่ถาม ให้บอกตรง ๆ ว่าข้อมูลที่ค้นได้อาจไม่ตรง และแนะนำให้ถามใหม่ให้ชัดขึ้น';
    try {
      var txt = await window.aiChat(sys, 'คำถาม: ' + q + '\n\nผลค้นจากฐานข้อมูล:\n' + data, {
        maxTokens: 500, temperature: 0.2, cache: true,
        // ผู้ใช้ถามเรื่องใหม่/ล้างแชทก่อนถึงคิว → ไม่ต้องส่งคำขอนี้แล้ว
        isStale: function () { return seq !== _seq || !box.isConnected; },
      });
      if (!box.isConnected) return;
      box.innerHTML = '<div class="ask-answer-t"><span>💬 คำตอบ</span>' + speakBtn() + '</div><div class="ask-answer-txt">' + window.aiTextToHtml(tidyAnswer(txt)) + '</div>';
    } catch (e) {
      if (!box.isConnected) return;
      box.remove(); // สรุปไม่ได้ก็ยังมีรายการจริงให้ดู (อ่านจากผลค้นแทน)
      openDetail(out);
    }
    scrollEnd();
    autoSpeak(out, seq);
  }

  // ── คำถามที่ไม่ใช่การค้นข้อมูล (วิธีใช้งาน / เมนูไหนทำอะไร) — ตอบจากรายชื่อเมนูที่ผู้ใช้มีสิทธิ์ ห้ามเดาข้อมูล ──
  async function generalAnswer(out, q, f, allowed) {
    var menus = (window.PERM_MODULES || []).filter(function (m) { return !window.canView || window.canView(m.id); })
      .map(function (m) { return m.g + ' › ' + m.label; }).join('\n');
    var chipsHtml = '<div class="ask-chips" style="margin:6px 0 0;">' + allowed.map(function (k) { return '<span class="ask-chip">' + SOURCES[k].icon + ' ' + esc(SOURCES[k].label) + '</span>'; }).join('') + '</div>';
    try {
      var txt = await window.aiChat('คุณคือผู้ช่วย AI ของระบบ Backoffice Teams (ระบบงานทีมติดตั้งระบบโรงพยาบาล) ตอบภาษาไทยสั้น ๆ สุภาพ ลงท้าย "ครับ"\n'
        + 'เมนูที่ผู้ใช้คนนี้เข้าได้:\n' + menus + '\n'
        + '- ถ้าถามวิธีใช้งาน ให้บอกว่าอยู่เมนูไหน และขั้นตอนคร่าว ๆ เท่าที่มั่นใจ ถ้าไม่แน่ใจให้แนะนำเปิดคู่มือการใช้งาน\n'
        + '- ถ้าถามข้อมูล/ตัวเลขในระบบ ห้ามเดาเด็ดขาด ให้แนะนำให้ถามใหม่โดยระบุเรื่อง เช่น ปัญหา, โครงการ, การลา, Ticket พร้อมชื่อ รพ./ช่วงเวลา\n'
        + '- คำถามทั่วไปที่ไม่เกี่ยวกับงาน ตอบได้สั้น ๆ', q, { maxTokens: 500, temperature: 0.3, cache: true });
      out.innerHTML = '<div class="ask-answer-txt">' + window.aiTextToHtml(txt) + '</div>'
        + '<div style="margin-top:8px;font-size:12px;">ค้นข้อมูลจริงได้จากเรื่องเหล่านี้ครับ</div>' + chipsHtml;
    } catch (e) {
      out.innerHTML = '🤔 ' + esc(f.understood || 'คำถามนี้ยังค้นจากข้อมูลในระบบไม่ได้')
        + '<div style="margin-top:8px;font-size:12px;">ถามได้เกี่ยวกับเรื่องเหล่านี้ครับ</div>' + chipsHtml;
    }
    scrollEnd();
  }

  window.askAiSwitch = function (src) {
    if (!_last || _busy || !canSource(src)) return;
    speakStop();
    _last = { f: Object.assign({}, _last.f, { source: src }), today: _last.today, q: _last.q };
    addMsg('me', esc('ค้นใน ' + SOURCES[src].label + ' แทน'));
    showAnswer(addMsg('bot', ''), _last.q, _last.f, _last.today);
  };

  var _seq = 0, _busy = false;
  window.askAiRun = async function () {
    var inp = document.getElementById('ask-q'), btn = document.getElementById('ask-btn');
    var q = inp.value.trim();
    if (!q || _busy) return;
    inp.value = ''; window.askAiGrow(inp);
    addMsg('me', esc(q));
    var allowed = Object.keys(SOURCES).filter(canSource);
    if (!allowed.length) { addMsg('bot', 'บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลที่ถาม AI ได้ครับ'); return; }
    var my = ++_seq, today = iso(today0());
    speakStop();
    _busy = true; btn.disabled = true;
    var out = addMsg('bot', '<span class="ask-dots"><i></i><i></i><i></i></span><span class="ask-typing">กำลังค้นข้อมูล…</span>');
    var done = function (html) { out.innerHTML = html; scrollEnd(); };
    try {
      var f = applyQuestionRules(cleanPlan(await window.aiChatJson(systemPrompt(today), q, { maxTokens: 500, temperature: 0, cache: true, isStale: function () { return my !== _seq; } })), q, today);
      if (my !== _seq) return;
      if (!canSource(f.source)) { await generalAnswer(out, q, f, allowed); return; }
      _last = { f: f, today: today, q: q };
      showAnswer(out, q, f, today);
    } catch (e) {
      if (my !== _seq) return;
      // ถ้าบริการ AI สะดุด คำถามที่มีชื่อโมดูล/ช่วงเวลาชัดยังค้นข้อมูลจริงต่อได้ด้วยกฎในโค้ด
      var fallback = applyQuestionRules(cleanPlan({ understood: 'ค้นหาตามคำถาม: ' + q }), q, today);
      if (canSource(fallback.source)) {
        _last = { f: fallback, today: today, q: q };
        showAnswer(out, q, fallback, today, '<div class="ai-flag" style="margin-bottom:6px;">AI ตีความภาษาไม่พร้อมชั่วคราว — ระบบค้นด้วยคำสำคัญและช่วงวันที่ที่ระบุให้แทน</div>', true);
      } else {
        done('<span style="color:var(--coral);">' + esc(String(e.message || e)) + '</span>');
      }
    } finally {
      if (my === _seq) { _busy = false; btn.disabled = false; }
    }
  };

  // ── 🔊 ฟังคำตอบ: AI อ่านสรุปผล (src/services/tts.service.js) — สิ่งที่เข้าใจ → จำนวนที่พบ → 5 รายการแรก / 3 กลุ่มแรก ──
  // อ่านจากคำตอบในบับเบิลนั้น (ตรงกับที่ผู้ใช้เห็นทุกตัวอักษร) + ไฮไลต์รายการที่กำลังอ่าน
  var SPEAK_ROWS = 5, SPEAK_GROUPS = 3;
  var _speaking = false, _speakBtn = null;
  function speakUi(state) { // 'off' | 'load' | 'on'
    _speaking = state !== 'off';
    var b = _speakBtn;
    if (b) {
      b.classList.toggle('on', _speaking);
      b.querySelector('.ask-speak-ic').textContent = state === 'load' ? '⏳' : _speaking ? '⏹' : '🔊';
      b.querySelector('.ask-speak-lbl').textContent = state === 'load' ? 'กำลังเตรียมเสียง…' : _speaking ? 'หยุดอ่าน' : 'ฟังคำตอบ';
    }
    if (!_speaking) {
      document.querySelectorAll('#ask-msgs .ask-reading').forEach(function (el) { el.classList.remove('ask-reading'); });
      _speakBtn = null;
    }
  }
  function speakStop() {
    if (!_speaking) return;
    window.TTS.stop();
    speakUi('off');
  }
  // ── ทำให้พูดเป็นธรรมชาติ (หลักการเดียวกันทุกจุดที่ใช้เสียง AI) ──
  // 1) เสียงเป็นผู้หญิง → ครับ/ผม เป็น ค่ะ/ฉัน  2) ตัดเลขที่รายการ/รหัสยาว ๆ (HD-2569-00012) ที่ฟังแล้วไม่รู้เรื่อง
  // 3) ตัวเลขเป็นคำอ่าน  4) แบ่งเป็นท่อนตามประโยค/ข้อ ไม่อ่านรวดเดียวทั้งก้อน และไม่แยกคำสั้น ๆ เป็นท่อนเดี่ยว (เสียงขาดเป็นห้วง)
  function speakable(s) {
    s = String(s || '')
      .replace(/ครับผม|ครับ/g, 'ค่ะ')
      .replace(/(^|\s)ผม(?=\s|จะ|ขอ|ค้น|พบ|เจอ|ได้|แนะนำ)/g, '$1ฉัน')
      .replace(/\b[A-Za-z]{1,6}[-_]?\d{2,}(?:[-_/]\d+)*\b/g, '')        // เลขที่เอกสาร/Ticket
      .replace(/\[|\]/g, ' ');
    if (window.TTS) s = window.TTS.expand(s);                           // วันที่ย่อ/ยอดเงิน/ตัวย่อ → คำอ่าน
    return s
      .replace(/(^|[^A-Za-z\d.])(\d+(?:\.\d+)?)(?!\d)/g, function (m, p, n) { return p + sayNum(n); }) // เลขที่เหลือ (ยกเว้นติดอักษรอังกฤษ เช่น P1)
      .replace(/\s{2,}/g, ' ').trim();
  }
  function intro(f) {
    var u = String(f.understood || '').replace(/^ค้นหาตามคำถาม[:：]?\s*/, '')
      .replace(/^(ผู้ใช้)?\s*(ต้องการ|อยาก)?\s*(ทราบ|ดู|รู้|ค้นหา|ค้น|หา|แสดง|สอบถาม|ถาม|ขอ)?\s*(ว่า)?\s*/, '').trim();
    return u ? 'ฉันค้นหา' + u + ' ให้แล้วค่ะ' : 'ฉันค้นข้อมูลให้แล้วค่ะ';
  }
  function rowSay(r) {
    return r.say || String(r.title || '').replace(/^[\w\-\/.]+\s*·\s*/, '').replace(/\s*[—·]\s*/g, ' ');
  }
  var ORDINAL = ['เริ่มจาก', 'ถัดมาคือ', 'ต่อด้วย', 'ถัดไปคือ'];
  function speechParts(out) {
    // มีคำตอบที่ AI สรุปแล้ว → อ่านคำตอบนั้นทีละย่อหน้า/ข้อ
    var ans = out.querySelector('.ask-answer-txt');
    if (ans && ans.textContent.trim()) {
      var blocks = Array.prototype.slice.call(ans.querySelectorAll('li, p'))
        .filter(function (el) { return !el.querySelector('li, p'); })
        .map(function (el) { return el.textContent; });
      if (!blocks.length) blocks = ans.innerText.split(/\n+/);
      return blocks.map(speakable).filter(Boolean).map(function (t) { return { text: t }; });
    }
    // ยังไม่มีคำตอบ AI (กำลังสรุป/สรุปไม่ได้) → ประกอบประโยคจากผลค้นจริง
    var d = out._ask;
    if (!d) return [];
    var f = d.f, rows = d.rows, parts = [{ text: speakable(intro(f)) }];
    if (!rows.length) return parts.concat([{ text: 'แต่ไม่พบรายการที่ตรงเงื่อนไขเลยค่ะ ลองถามให้กว้างขึ้น หรือเปลี่ยนคำค้นดูนะคะ' }]);
    var groups = out.querySelectorAll('.ask-grp');
    if (f.groupBy && groups.length) {
      var g = {};
      rows.forEach(function (r) { var k = r.key[f.groupBy] || '-'; g[k] = (g[k] || 0) + 1; });
      var keys = Object.keys(g).sort(function (a, b) { return g[b] - g[a]; });
      parts.push({ text: speakable('พบทั้งหมด ' + countText(f, rows) + ' แบ่งได้ ' + keys.length + ' กลุ่มค่ะ') });
      keys.slice(0, SPEAK_GROUPS).forEach(function (k, i, arr) {
        var lead = i === 0 ? 'กลุ่มที่มากที่สุดคือ' : i === arr.length - 1 && i > 1 ? 'และ' : 'รองลงมาคือ';
        parts.push({ text: speakable(lead + ' ' + k + ' ' + (f.source === 'leaves' ? 'ลา ' : 'มี ') + g[k] + ' ' + groupUnitOf(f)), data: groups[i] });
      });
      if (keys.length > SPEAK_GROUPS) parts.push({ text: 'ส่วนกลุ่มอื่น ๆ ดูต่อได้บนหน้าจอเลยค่ะ' });
      return parts;
    }
    var els = out.querySelectorAll('.ask-row'), n = Math.min(rows.length, SPEAK_ROWS);
    var unit = f.source === 'leaves' ? 'ใบ' : unitOf(f);
    if (rows.length === 1) return parts.concat([{ text: speakable('พบเพียง 1 ' + unit + ' คือ ' + rowSay(rows[0])), data: els[0] }]);
    parts.push({ text: speakable('พบทั้งหมด ' + countText(f, rows) + (rows.length > n ? ' ขอยกมาเล่าให้ฟัง ' + n + ' ' + unit + 'แรกนะคะ' : ' มีดังนี้ค่ะ')) });
    rows.slice(0, n).forEach(function (r, i) {
      var lead = i === n - 1 ? 'และสุดท้าย' : ORDINAL[Math.min(i, ORDINAL.length - 1)];
      parts.push({ text: speakable(lead + ' ' + rowSay(r)), data: els[i] });
    });
    if (rows.length > n) parts.push({ text: 'ที่เหลืออีก ' + sayNum(rows.length - n) + ' ' + unit + ' ดูต่อได้บนหน้าจอเลยค่ะ' });
    return parts;
  }
  // ── อ่านคำตอบให้ฟังอัตโนมัติ (ค่าเริ่มต้น = เปิด) — ปิด/เปิดที่ปุ่มลำโพงบนหัวแชท จำไว้ในเบราว์เซอร์ ──
  // อ่านเมื่อคำตอบสรุปเสร็จ (หรือสรุปไม่ได้/ไม่พบรายการ → อ่านจากผลค้น) เฉพาะคำตอบของคำถามล่าสุด และแชทยังเปิดอยู่
  var AUTO_KEY = '_bms_ask_autoread';
  function autoReadOn() { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; } }
  function paintAutoRead() {
    var b = document.getElementById('ask-autoread');
    if (!b) return;
    var on = autoReadOn();
    b.textContent = on ? '🔊' : '🔇';
    b.title = on ? 'อ่านคำตอบให้ฟังอัตโนมัติ: เปิด (กดเพื่อปิด)' : 'อ่านคำตอบให้ฟังอัตโนมัติ: ปิด (กดเพื่อเปิด)';
    b.setAttribute('aria-label', b.title);
  }
  window.askAiAutoRead = function () {
    var on = !autoReadOn();
    try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch (e) {}
    if (!on) speakStop();
    paintAutoRead();
  };
  function autoSpeak(out, seq) {
    if (!window.TTS || !autoReadOn() || !_open || seq !== _seq || !out.isConnected) return;
    var btn = out.querySelector('.ask-speak');
    if (btn) window.askAiSpeak(btn);
  }

  window.askAiSpeak = function (btn) {
    var same = _speakBtn === btn;
    speakStop();
    if (same) return; // กดปุ่มเดิมขณะอ่าน = หยุด
    _speakBtn = btn;
    speakUi('load');
    window.TTS.play(speechParts(btn.closest('.ask-bubble')), {
      onPart: function (part) {
        if (!_speaking || _speakBtn !== btn) return;
        speakUi('on');
        var el = part.data;
        document.querySelectorAll('#ask-msgs .ask-reading').forEach(function (x) { if (x !== el) x.classList.remove('ask-reading'); });
        if (el) { el.classList.add('ask-reading'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      },
      onEnd: function () { if (_speakBtn === btn) speakUi('off'); },
      onError: function (err) { if (_speakBtn === btn) speakUi('off'); window.showToast(err.message, 'error'); },
    });
  };

  // ── คลิกรายการ → เปิดหน้าที่เกี่ยวข้อง (จอแคบ: ปิดแชทก่อนให้เห็นหน้า · จอกว้าง: แชทลอยค้างไว้ถามต่อได้) ──
  window.askAiGo = function (type, id, pid) {
    if (window.innerWidth <= 768) window.askAiClose();
    if (type === 'ticket') { window.goView('helpdesk'); window.hdOpen && window.hdOpen(id); }
    else if (type === 'issue' || type === 'task') {
      window.imtCurrentProjectId = pid;
      window.goView('impl_tracker');
      setTimeout(function () {
        if (type === 'issue') { window.imtGoTab && window.imtGoTab('issues'); window.openImtIssueModal && window.openImtIssueModal(id); }
        else window.imtGoTab && window.imtGoTab('workspace');
      }, 60);
    }
    else if (type === 'project') { window.goView('projects'); window.openProjModal && window.openProjModal(id); }
    else if (type === 'leave') window.goView('leave');
    else if (type === 'availability') window.goView('availability');
    else if (type === 'advance') window.goView('advance');
    else if (type === 'timesheet') window.goView('timesheet');
    else if (type === 'cost') window.goView(window.canView && window.canView('cost') ? 'cost' : 'budget');
    else if (type === 'lodging') window.goView('lodging');
    else if (type === 'holiday') window.goView('holiday');
    else if (type === 'contract') window.goView('contract');
    else if (type === 'worklog') window.goView('worklog');
    else if (type === 'hospital') window.goView('hospital');
    else if (type === 'staff') window.goView(window.canView && window.canView('availability') ? 'availability' : (window.canView && window.canView('workload') ? 'workload' : 'admin'));
    else if (type === 'targets') window.goView('targets');
    else if (type === 'server_request') window.goView('server_request');
    else if (type === 'expense_form') window.goView('expense_form');
    else if (type === 'assist') window.goView('assist');
  };

  // ปุ่มบอทลอยพร้อมตั้งแต่โหลดหน้า (หน้า Login ทับไว้จนกว่าจะเข้าระบบ)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();

  // ── คีย์ลัด Ctrl+K / ⌘K เปิด-ปิดแชท · Esc ปิดแชท (ถ้ามี popup เปิดอยู่ ให้ Esc ปิด popup ก่อน) ──
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && window.cu) { e.preventDefault(); window.askAiToggle(); }
    else if (e.key === 'Escape' && _open && !document.querySelector('.overlay.on')) window.askAiClose();
  }, true); // capture: ตรวจก่อนตัวปิด popup ด้วย Esc (modals.js) จะเอา .on ออก

})();
