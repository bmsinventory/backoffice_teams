/**
 * ask-ai.js — 🤖 ถาม AI (ปุ่มบน topbar) — ถามเป็นภาษาคน แล้วได้รายการจากข้อมูลจริงในระบบ
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
    return String(s || '').toLowerCase().replace(/โรงพยาบาล|รพ\.?|รพสต\.?|สสอ\.?|สสจ\.?/g, '').replace(/[\s\-_.,()]+/g, '');
  }
  // needle คั่นคำที่ใช้แทนกันได้ด้วย | (เช่น "lis|แล็บ") — ตรงคำใดคำหนึ่งก็ผ่าน
  function has(hay, needle) {
    if (!needle) return true;
    var h = norm(hay);
    return String(needle).split('|').some(function (n) { n = norm(n); return n && h.indexOf(n) >= 0; });
  }

  // ── ทีมงาน ──
  function staff(id) { return (window.STAFF || []).find(function (s) { return s.id === id; }); }
  function nick(id) { var s = staff(id); return s ? (s.nickname || s.name) : (id || ''); }
  // คืน { ids, needle } ของทีมงานที่ตรงชื่อ — ref บางตารางเก็บเป็นชื่อแทน id จึงเทียบชื่อด้วย
  function personQuery(q) {
    if (!q) return null;
    var ids = {};
    (window.STAFF || []).forEach(function (s) { if (has(s.nickname, q) || has(s.name, q)) ids[s.id] = true; });
    return { ids: ids, needle: q, found: Object.keys(ids).length > 0 };
  }
  function personHit(pq, ref) {
    if (!pq) return true;
    if (!ref) return false;
    if (pq.ids[ref]) return true;
    var s = staff(ref);
    return has(s ? (s.nickname + ' ' + s.name) : ref, pq.needle);
  }

  function hospName(id) { var h = (window.HOSPITALS || []).find(function (x) { return x.id === id; }); return h ? h.name : ''; }
  function implProj(id) { return (window.IMPL_PROJECTS || []).find(function (x) { return x.id === id; }) || {}; }
  function proj(id) { return (window.PROJECTS || []).find(function (x) { return x.id === id; }) || {}; }
  function lbl(list, id) { var x = (list || []).find(function (o) { return o.id === id; }); return x ? x.label : id; }

  // ══ แหล่งข้อมูลที่ค้นได้ — แต่ละตัวคืนรายการ { key(ใช้จัดกลุ่ม), title, meta, badge, go } ══
  // f = เงื่อนไขจาก AI (ผ่าน cleanPlan แล้ว) · today = 'YYYY-MM-DD'
  var SOURCES = {
    tickets: {
      label: 'Helpdesk Ticket', icon: '🎧', mod: ['helpdesk'], uses: ['priority', 'unassigned', 'overdue', 'minAgeDays'],
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
            go: "window.askAiGo('ticket','" + t.id + "')",
          };
        });
      },
    },
    issues: {
      label: 'ปัญหาการใช้งาน (ติดตามสถานะโครงการ)', icon: '🩹', mod: ['impl_tracker', 'all_issues'], uses: ['severity', 'minAgeDays'],
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
          if (f.hospital && !has(p.name + ' ' + p.hospitalName, f.hospital)) return false;
          if (f.keyword && !has([i.problem, i.category, i.department, i.solution].join(' '), f.keyword)) return false;
          return true;
        }).map(function (i) {
          var p = implProj(i.projectId), age = ageDays(i.createdAt);
          return {
            sortAge: age, sortDate: i.createdAt,
            key: { hospital: p.name || '(ไม่ระบุโครงการ)', person: i.fixedById ? nick(i.fixedById) : '(ยังไม่มีผู้แก้)', category: i.category || '(ไม่ระบุกลุ่มปัญหา)', department: i.department || '(ไม่ระบุแผนก)' },
            title: String(i.problem || '-').slice(0, 120),
            meta: [p.name, i.category, i.department, lbl(window.IMPL_ISSUE_STATUS, i.status), i.status !== 'closed' ? 'ค้าง ' + age + ' วัน' : (i.fixedDate ? 'แก้ ' + window.fd(i.fixedDate) : '')].filter(Boolean).join(' · '),
            badge: lbl(window.IMPL_SEVERITY, i.severity),
            go: "window.askAiGo('issue','" + i.id + "','" + i.projectId + "')",
          };
        });
      },
    },
    tasks: {
      label: 'งานในโครงการติดตั้ง', icon: '🛠️', mod: ['impl_tracker'], uses: ['priority', 'overdue'],
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
            meta: [p.name, t.due ? 'กำหนด ' + window.fd(t.due) : '', t.ownerId ? '👷 ' + nick(t.ownerId) : '', lbl(window.IMPL_STATUS, t.status)].filter(Boolean).join(' · '),
            badge: window.imtIsOverdue && window.imtIsOverdue(t) ? 'เกินกำหนด' : '',
            go: "window.askAiGo('task','" + t.id + "','" + t.projectId + "')",
          };
        });
      },
    },
    projects: {
      label: 'โครงการ', icon: '🗂️', mod: ['projects'], uses: [],
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
            key: { hospital: hospName(p.hospitalId) || p.name, person: team[0] || '(ยังไม่มีทีม)', category: p.status, department: '-' },
            title: p.name || '-',
            meta: [(p.start ? window.fd(p.start) : '?') + (p.end ? ' – ' + window.fd(p.end) : ''), team.length ? '👥 ' + team.join(', ') : 'ยังไม่มีทีม', 'ความคืบหน้า ' + (p.progress || 0) + '%'].join(' · '),
            badge: '',
            go: "window.askAiGo('project','" + p.id + "')",
          };
        });
      },
    },
    leaves: {
      label: 'การลางาน', icon: '🏖️', mod: ['leave'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        var LV = { sick: 'ลาป่วย', vacation: 'ลาพักร้อน', personal: 'ลากิจ', maternity: 'ลาคลอด', ordain: 'ลาบวช', other: 'ลา' };
        return (window.LEAVES || []).filter(function (l) {
          if (l.status === 'rejected') return false;
          if (f.status === 'open' && l.status !== 'pending') return false;
          if (f.status === 'closed' && l.status !== 'approved') return false;
          if ((f.dateFrom || f.dateTo) && !overlap(l.startDate, l.endDate, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, l.staffId)) return false;
          if (f.keyword && !has((LV[l.leaveType] || '') + ' ' + l.note, f.keyword)) return false;
          return true;
        }).map(function (l) {
          return {
            sortAge: -new Date(l.startDate).getTime() / DAY, sortDate: l.startDate,
            key: { hospital: '-', person: nick(l.staffId), category: LV[l.leaveType] || 'ลา', department: (staff(l.staffId) || {}).dept || '-' },
            title: nick(l.staffId) + ' — ' + (LV[l.leaveType] || 'ลา'),
            meta: window.fd(l.startDate) + (l.endDate && l.endDate !== l.startDate ? ' – ' + window.fd(l.endDate) : '') + (l.note ? ' · ' + l.note : ''),
            badge: l.status === 'pending' ? 'รออนุมัติ' : '',
            go: "window.askAiGo('leave')",
          };
        });
      },
    },
    free_staff: {
      label: 'ทีมงานที่ว่าง', icon: '👥', mod: ['availability', 'workload'], uses: [],
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
            meta: [s.dept, s.role, 'ว่าง ' + window.fd(from) + (to !== from ? ' – ' + window.fd(to) : '')].filter(Boolean).join(' · '),
            badge: '',
            go: "window.askAiGo('availability')",
          };
        });
      },
    },
    advances: {
      label: 'Advance', icon: '💰', mod: ['advance'], uses: ['overdue'],
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
            meta: [lbl(window.AFLW, a.status), a.amount ? window.fca(a.amount) + ' บาท' : '', a.rdate ? 'ขอ ' + window.fd(a.rdate) : '', a.ddate ? 'ครบกำหนดเคลียร์ ' + window.fd(a.ddate) : ''].filter(Boolean).join(' · '),
            badge: '',
            go: "window.askAiGo('advance')",
          };
        });
      },
    },
  };

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
    };
    var allowed = Object.keys(SOURCES).filter(canSource);
    var cats = (window.HELPDESK_CATEGORIES || []).filter(function (c) { return c.active; }).map(function (c) { return c.name; }).slice(0, 40);
    var d = new Date(today);
    return 'คุณแปลคำถามภาษาไทยของทีมติดตั้งระบบโรงพยาบาล ให้เป็นเงื่อนไขค้นหา ตอบเป็น JSON อย่างเดียว ไม่ต้องอธิบาย\n'
      + 'วันนี้: ' + today + ' (' + ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][d.getDay()] + ') — แปลงคำอย่าง "วันนี้ / พรุ่งนี้ / สัปดาห์หน้า (จันทร์–ศุกร์) / เดือนนี้" เป็นวันที่ ค.ศ. YYYY-MM-DD\n'
      + 'แหล่งข้อมูลที่เลือกได้ (source):\n- ' + allowed.map(function (k) { return src[k]; }).join('\n- ') + '\n'
      + (cats.length ? 'หมวดของ Ticket: ' + cats.join(', ') + '\n' : '')
      + 'รูปแบบ JSON:\n'
      + '{"source":"ชื่อแหล่งข้อมูล หรือ none ถ้าคำถามไม่เกี่ยวกับข้อมูลข้างต้น",'
      + '"understood":"สรุปสั้น ๆ 1 ประโยคว่าเข้าใจคำถามว่าอะไร",'
      + '"hospital":"ชื่อ รพ./โครงการ ที่ถามถึง (ไม่มีให้ว่าง)",'
      + '"keyword":"คำค้นในหัวข้อ/รายละเอียด/หมวด เช่น ชื่อระบบ LIS, PACS, ปริ้นเตอร์ — คำที่ใช้แทนกันได้คั่นด้วย | เช่น lis|แล็บ (ไม่มีให้ว่าง)",'
      + '"person":"ชื่อหรือชื่อเล่นทีมงานที่ถามถึง (ไม่มีให้ว่าง)",'
      + '"status":"open (ยังค้าง/ยังไม่เสร็จ/รออนุมัติ) | closed (เสร็จ/ปิดแล้ว) | all",'
      + '"priority":["p1","p2"] (เฉพาะ tickets: ด่วนมาก=p1, ด่วน=p1,p2 · tasks ใช้ low/medium/high/urgent) หรือ [],'
      + '"severity":["high","critical"] (เฉพาะ issues) หรือ [],'
      + '"minAgeDays":ตัวเลขจำนวนวันที่ค้างขั้นต่ำ เช่น "ค้างเกิน 7 วัน" = 8 · ไม่ระบุ = 0,'
      + '"unassigned":true ถ้าถามหาเรื่องที่ยังไม่มีคนรับผิดชอบ,'
      + '"overdue":true ถ้าถามหาเรื่องที่เกินกำหนด/เกิน SLA/เลยกำหนดเคลียร์,'
      + '"dateFrom":"YYYY-MM-DD หรือ ว่าง","dateTo":"YYYY-MM-DD หรือ ว่าง",'
      + '"groupBy":"hospital | person | category | department | none — ใช้เมื่อถามว่า รพ.ไหน/ใคร/หมวดไหน/แผนกไหน มากที่สุด หรือขอสรุปแยกตามกลุ่ม",'
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
      source: str(r.source),
      understood: str(r.understood),
      hospital: str(r.hospital), keyword: str(r.keyword), person: str(r.person),
      status: st === 'open' || st === 'closed' ? st : 'all',
      priority: arr(r.priority), severity: arr(r.severity),
      minAgeDays: Math.max(0, parseInt(r.minAgeDays, 10) || 0),
      unassigned: r.unassigned === true, overdue: r.overdue === true,
      dateFrom: dt(r.dateFrom), dateTo: dt(r.dateTo),
      groupBy: ['hospital', 'person', 'category', 'department'].indexOf(gb) >= 0 ? gb : '',
      sort: str(r.sort) === 'newest' ? 'newest' : 'oldest',
    };
  }

  // ── ป้ายเงื่อนไขที่ใช้ค้นจริง — ให้ผู้ใช้เห็นว่าระบบกรองด้วยอะไร (ตรวจได้ว่า AI แปลถูกไหม) ──
  // src.uses = เงื่อนไขพิเศษที่แหล่งนั้นใช้กรองจริง — ไม่แสดงป้ายที่ไม่มีผล (เช่น Priority ตอนสลับไปค้นปัญหาการใช้งาน)
  function chips(f, src) {
    var use = function (k) { return src.uses.indexOf(k) >= 0; };
    var c = [];
    if (f.hospital) c.push('🏥 ' + f.hospital);
    if (f.keyword) c.push('🔎 ' + f.keyword.split('|').join(' / '));
    if (f.person) c.push('👷 ' + f.person);
    if (f.status !== 'all') c.push(f.status === 'open' ? 'ยังค้าง' : 'เสร็จแล้ว');
    if (f.priority.length && use('priority')) c.push('Priority ' + f.priority.join(', ').toUpperCase());
    if (f.severity.length && use('severity')) c.push('ความรุนแรง ' + f.severity.map(function (s) { return lbl(window.IMPL_SEVERITY, s); }).join(', '));
    if (f.minAgeDays && use('minAgeDays')) c.push('ค้าง ≥ ' + f.minAgeDays + ' วัน');
    if (f.unassigned && use('unassigned')) c.push('ยังไม่มอบหมาย');
    if (f.overdue && use('overdue')) c.push('เกินกำหนด');
    if (f.dateFrom || f.dateTo) c.push('📅 ' + (f.dateFrom ? window.fd(f.dateFrom) : '…') + ' – ' + (f.dateTo ? window.fd(f.dateTo) : '…'));
    if (f.groupBy) c.push('แยกตาม' + { hospital: ' รพ./โครงการ', person: 'คน', category: 'หมวด', department: 'แผนก' }[f.groupBy]);
    return c.map(function (x) { return '<span class="ask-chip">' + esc(x) + '</span>'; }).join('');
  }

  var MAX_ROWS = 50;
  function rowHtml(r) {
    return '<div class="ask-row" onclick="' + r.go + '">'
      + '<div class="ask-row-t">' + (r.badge ? '<span class="ask-badge">' + esc(r.badge) + '</span>' : '') + esc(r.title) + '</div>'
      + '<div class="ask-row-m">' + esc(r.meta) + '</div></div>';
  }

  function render(f, src, rows) {
    var head = '<div class="ask-understood">🤖 AI เข้าใจว่า: <b>' + esc(f.understood || '-') + '</b></div>'
      + '<div class="ask-chips"><span class="ask-chip src">' + src.icon + ' ' + esc(src.label) + '</span>' + chips(f, src) + '</div>';
    if (!rows.length) return head + '<div class="ask-empty"><div class="ask-empty-ic">🔍</div>ไม่พบรายการที่ตรงเงื่อนไข<br><span style="font-size:12px;">ลองถามให้กว้างขึ้น หรือเปลี่ยนคำค้น</span></div>';

    rows.sort(function (a, b) { return f.sort === 'newest' ? String(b.sortDate || '').localeCompare(String(a.sortDate || '')) : b.sortAge - a.sortAge; });
    var body;
    if (f.groupBy) {
      var g = {};
      rows.forEach(function (r) { var k = r.key[f.groupBy] || '-'; (g[k] = g[k] || []).push(r); });
      var keys = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; });
      var max = g[keys[0]].length;
      body = '<div class="ask-sum">พบ <b>' + rows.length + '</b> รายการ ใน <b>' + keys.length + '</b> กลุ่ม</div>'
        + keys.map(function (k, i) {
          return '<details class="ask-grp"' + (i === 0 && keys.length <= 3 ? ' open' : '') + '><summary>'
            + '<span class="ask-grp-n">' + esc(k) + '</span>'
            + '<span class="ask-bar"><i style="width:' + Math.max(4, Math.round(g[k].length / max * 100)) + '%"></i></span>'
            + '<b class="ask-grp-c">' + g[k].length + '</b></summary>'
            + g[k].slice(0, MAX_ROWS).map(rowHtml).join('')
            + (g[k].length > MAX_ROWS ? '<div class="ask-more">และอีก ' + (g[k].length - MAX_ROWS) + ' รายการ</div>' : '')
            + '</details>';
        }).join('');
    } else {
      body = '<div class="ask-sum">พบ <b>' + rows.length + '</b> รายการ' + (rows.length > MAX_ROWS ? ' (แสดง ' + MAX_ROWS + ' รายการแรก)' : '') + '</div>'
        + rows.slice(0, MAX_ROWS).map(rowHtml).join('');
    }
    return head + body + '<div class="ai-card-note">* AI แปลคำถามเป็นเงื่อนไขเท่านั้น — รายการและตัวเลขค้นจากข้อมูลจริงในระบบ ณ ตอนนี้ · คลิกรายการเพื่อเปิดดู</div>';
  }

  // ══ UI ══
  var EXAMPLES = [
    { src: 'issues', q: 'รพ.ไหนมีปัญหาค้างเกิน 7 วันมากที่สุด' },
    { src: 'tickets', q: 'Ticket P1/P2 ที่ยังไม่มอบหมาย' },
    { src: 'tickets', q: 'Ticket ที่เกิน SLA แยกตามคนรับผิดชอบ' },
    { src: 'free_staff', q: 'สัปดาห์หน้าใครว่างบ้าง' },
    { src: 'tasks', q: 'งานที่เกินกำหนดแยกตามโครงการ' },
    { src: 'leaves', q: 'เดือนนี้ใครลาบ้าง' },
    { src: 'advances', q: 'Advance ที่เลยกำหนดเคลียร์' },
  ];

  function modal() {
    var m = document.getElementById('m-ask-ai');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'overlay'; m.id = 'm-ask-ai';
    m.onclick = function (e) { if (e.target === m) window.closeM('m-ask-ai'); };
    m.innerHTML = '<div class="modal lg ask-modal">'
      + '<div class="ask-hero">'
      + '<button class="m-x ask-x" onclick="window.closeM(\'m-ask-ai\')" aria-label="ปิด">✕</button>'
      + '<div class="ask-hero-t"><span class="ask-spark">✨</span>ถาม AI</div>'
      + '<div class="ask-hero-s">ถามเป็นภาษาคนได้เลย — ระบบค้นจากข้อมูลจริงให้ คลิกผลลัพธ์เพื่อเปิดดูต่อ</div>'
      + '<form class="ask-form" onsubmit="event.preventDefault();window.askAiRun();">'
      + '<span class="ask-ic">🔎</span>'
      + '<input id="ask-q" autocomplete="off" placeholder="เช่น รพ.ไหนมีปัญหา LIS ค้างเกิน 7 วัน" oninput="window.askAiInput(this)">'
      + '<button id="ask-btn" class="ask-go" type="submit" aria-label="ถาม">ถาม ↵</button></form>'
      + '<div class="ask-kbd"><kbd>Enter</kbd> ถาม · <kbd>Ctrl</kbd>+<kbd>K</kbd> เปิดได้จากทุกหน้า · <kbd>Esc</kbd> ปิด</div>'
      + '</div>'
      + '<div class="m-body ask-body">'
      + '<div id="ask-ex"></div>'
      + '<div id="ask-out"></div></div></div>';
    document.body.appendChild(m);
    return m;
  }

  window.askAiOpen = function () {
    modal();
    var ex = EXAMPLES.filter(function (e) { return canSource(e.src); });
    document.getElementById('ask-ex').innerHTML = ex.length
      ? '<div class="ask-sec">💡 ลองถามแบบนี้</div><div class="ask-sugs">' + ex.map(function (e) {
          var s = SOURCES[e.src];
          return '<button type="button" class="ask-sug" onclick="window.askAiExample(this)" data-q="' + esc(e.q) + '">'
            + '<span class="ask-sug-ic">' + s.icon + '</span>'
            + '<span class="ask-sug-tx"><b>' + esc(e.q) + '</b><small>' + esc(s.label) + '</small></span></button>';
        }).join('') + '</div>'
      : '';
    document.getElementById('ask-ex').style.display = document.getElementById('ask-out').innerHTML ? 'none' : '';
    window.openM('m-ask-ai');
    setTimeout(function () { var i = document.getElementById('ask-q'); if (i) { i.focus(); i.select(); } }, 50);
  };
  window.askAiExample = function (b) { document.getElementById('ask-q').value = b.getAttribute('data-q'); window.askAiRun(); };
  // ล้างช่องคำถามจนว่าง → กลับไปหน้าแรก (แสดงตัวอย่างคำถามอีกครั้ง)
  window.askAiInput = function (i) {
    if (i.value.trim()) return;
    _seq++; _last = null;
    document.getElementById('ask-out').innerHTML = '';
    document.getElementById('ask-ex').style.display = '';
    document.getElementById('ask-btn').disabled = false;
  };

  // ── คำว่า "ปัญหา" อาจหมายถึง Ticket หรือปัญหาในโครงการติดตั้งก็ได้ — มีลิงก์สลับแหล่งข้อมูลโดยใช้เงื่อนไขเดิม (ไม่ต้องถาม AI ใหม่) ──
  var ALT = { tickets: 'issues', issues: 'tickets' };
  var _last = null;
  function show() {
    var f = _last.f, src = SOURCES[f.source], alt = ALT[f.source];
    var pq = personQuery(f.person);
    document.getElementById('ask-out').innerHTML =
      (pq && !pq.found ? '<div class="ai-flag" style="margin-bottom:6px;">ไม่พบทีมงานชื่อ "' + esc(f.person) + '" ในรายชื่อ — ค้นจากชื่อที่บันทึกไว้ในรายการแทน</div>' : '')
      + render(f, src, src.run(f, _last.today))
      + (alt && canSource(alt) ? '<div class="ask-alt"><a href="javascript:void(0)" onclick="window.askAiSwitch(\'' + alt + '\')">'
        + SOURCES[alt].icon + ' ค้นด้วยเงื่อนไขเดียวกันใน ' + esc(SOURCES[alt].label) + ' แทน →</a></div>' : '');
  }
  window.askAiSwitch = function (src) { if (_last && canSource(src)) { _last.f.source = src; show(); } };

  var _seq = 0;
  window.askAiRun = async function () {
    var q = document.getElementById('ask-q').value.trim();
    var out = document.getElementById('ask-out'), btn = document.getElementById('ask-btn');
    if (!q) return;
    var allowed = Object.keys(SOURCES).filter(canSource);
    if (!allowed.length) { out.innerHTML = '<div class="ask-empty">บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลที่ถาม AI ได้</div>'; return; }
    var my = ++_seq, today = iso(today0());
    btn.disabled = true;
    document.getElementById('ask-ex').style.display = 'none';
    out.innerHTML = '<div class="ask-loading"><span class="ask-dots"><i></i><i></i><i></i></span>AI กำลังทำความเข้าใจคำถาม…</div>'
      + '<div class="ask-skel"></div><div class="ask-skel"></div><div class="ask-skel short"></div>';
    try {
      var f = cleanPlan(await window.aiChatJson(systemPrompt(today), q, { maxTokens: 400, temperature: 0 }));
      if (my !== _seq) return;
      if (!canSource(f.source)) {
        out.innerHTML = '<div class="ask-empty"><div class="ask-empty-ic">🤔</div>' + esc(f.understood || 'คำถามนี้ยังค้นจากข้อมูลในระบบไม่ได้')
          + '<div class="ask-chips" style="justify-content:center;margin:10px 0 0;">' + allowed.map(function (k) { return '<span class="ask-chip">' + SOURCES[k].icon + ' ' + esc(SOURCES[k].label) + '</span>'; }).join('') + '</div>'
          + '<div style="font-size:11.5px;margin-top:6px;">ถามได้เกี่ยวกับเรื่องข้างบนนี้</div></div>';
        return;
      }
      _last = { f: f, today: today };
      show();
    } catch (e) {
      if (my === _seq) out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
    } finally {
      if (my === _seq) btn.disabled = false;
    }
  };

  // ── คลิกรายการ → ปิด popup แล้วเปิดหน้าที่เกี่ยวข้อง ──
  window.askAiGo = function (type, id, pid) {
    window.closeM('m-ask-ai');
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
  };

  // ── คีย์ลัด Ctrl+K / ⌘K เปิดช่องถาม AI ──
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && window.cu) { e.preventDefault(); window.askAiOpen(); }
  });

})();
