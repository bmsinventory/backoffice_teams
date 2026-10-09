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
          if (f.hospital && !has(p.name + ' ' + implHospName(p), f.hospital)) return false;
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
    timesheets: {
      label: 'Timesheet', icon: '⏱️', mod: ['timesheet'], uses: [],
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
            meta: [t.workDate ? window.fd(t.workDate) : '', p.name, t.category, t.description].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('timesheet')",
          };
        });
      },
    },
    costs: {
      label: 'รายการค่าใช้จ่าย', icon: '🧾', mod: ['cost', 'budget'], uses: [],
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
            meta: [c.costDate ? window.fd(c.costDate) : '', p.name, nick(c.staffId), c.receiptNo ? 'ใบเสร็จ ' + c.receiptNo : ''].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('cost')",
          };
        });
      },
    },
    lodgings: {
      label: 'ข้อมูลที่พัก', icon: '🛏️', mod: ['lodging'], uses: [],
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
      label: 'วันหยุด', icon: '📅', mod: ['holiday', 'calendar'], uses: [],
      run: function (f) {
        return (window.HOLIDAYS || []).filter(function (h) {
          if (!inRange(h.date, f.dateFrom, f.dateTo)) return false;
          if (f.keyword && !has(h.name + ' ' + h.type, f.keyword)) return false;
          return true;
        }).map(function (h) {
          return {
            sortAge: ageDays(h.date), sortDate: h.date,
            key: { hospital: '-', person: '-', category: h.type || 'วันหยุด', department: '-' },
            title: h.name || 'วันหยุด', meta: h.date ? window.fd(h.date) : '-', badge: '',
            go: "window.askAiGo('holiday')",
          };
        });
      },
    },
    contracts: {
      label: 'ข้อมูลสัญญา', icon: '📄', mod: ['contract'], uses: [],
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
            key: { hospital: c.customer || c.name || '-', person: '-', category: c.status || '-', department: '-' },
            title: c.name || c.customer || 'สัญญา',
            meta: [c.customer, c.startDate ? window.fd(c.startDate) : '', c.endDate ? 'ถึง ' + window.fd(c.endDate) : '', c.value ? (window.fca ? window.fca(c.value) : Number(c.value).toLocaleString('th-TH')) + ' บาท' : ''].filter(Boolean).join(' · '),
            badge: c.status || '', go: "window.askAiGo('contract')",
          };
        });
      },
    },
    work_logs: {
      label: 'บันทึกงาน', icon: '📝', mod: ['worklog'], uses: [],
      run: function (f) {
        var pq = personQuery(f.person);
        return (window.WORK_LOGS || []).filter(function (w) {
          var s = w.type === 'daily' ? w.date : w.startDate;
          var e = w.type === 'daily' ? w.date : w.endDate;
          if ((f.dateFrom || f.dateTo) && !overlap(s, e, f.dateFrom, f.dateTo)) return false;
          if (!personHit(pq, w.staffId)) return false;
          if (f.keyword && !has([w.title, w.detail, w.category, w.destination, w.locationType].join(' '), f.keyword)) return false;
          return true;
        }).map(function (w) {
          var s = w.type === 'daily' ? w.date : w.startDate, e = w.type === 'daily' ? w.date : w.endDate;
          return {
            sortAge: ageDays(s), sortDate: s,
            key: { hospital: w.destination || '-', person: nick(w.staffId) || '-', category: w.category || 'อื่น ๆ', department: (staff(w.staffId) || {}).dept || '-' },
            title: w.title || w.detail || 'บันทึกงาน',
            meta: [nick(w.staffId), s ? window.fd(s) : '', e && e !== s ? 'ถึง ' + window.fd(e) : '', w.destination, w.category].filter(Boolean).join(' · '),
            badge: '', go: "window.askAiGo('worklog')",
          };
        });
      },
    },
    hospitals: {
      label: 'รายชื่อโรงพยาบาล', icon: '🏥', mod: ['hospital'], uses: [],
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
      label: 'ข้อมูลทีมงาน', icon: '👤', mod: ['availability', 'workload', 'admin'], uses: [],
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
      label: 'เป้าหมายทีม', icon: '🎯', mod: ['targets'], uses: [],
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
      label: 'คำขอใช้งานทีม Server', icon: '🖥️', mod: ['server_request'], uses: [],
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
            key: { hospital: hospName(r.hospitalId) || r.hospitalName || '-', person: r.requesterName || '-', category: r.status || '-', department: r.requesterTeam || '-' },
            title: (r.reqNo ? r.reqNo + ' · ' : '') + (hospName(r.hospitalId) || r.hospitalName || 'คำขอทีม Server'),
            meta: [r.requesterName, r.requesterTeam, r.start ? window.fd(r.start) : '', r.end && r.end !== r.start ? 'ถึง ' + window.fd(r.end) : '', r.status].filter(Boolean).join(' · '),
            badge: r.status || '', go: "window.askAiGo('server_request')",
          };
        });
      },
    },
    forms: {
      label: 'เอกสารประกอบ Advance/ออกไซต์', icon: '📋', mod: ['expense_form'], uses: [],
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
              title: getTitle(x), meta: [kind, person, hospital, s ? window.fd(s) : '', e && e !== s ? 'ถึง ' + window.fd(e) : ''].filter(Boolean).join(' · '),
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
      label: 'คลังคำตอบผู้ช่วยทีม', icon: '💬', mod: ['assist'], uses: [],
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
    all_system: {
      label: 'ทุกข้อมูลในระบบ', icon: '🔎',
      mod: ['helpdesk', 'impl_tracker', 'all_issues', 'projects', 'leave', 'advance', 'timesheet', 'cost', 'budget', 'lodging', 'holiday', 'calendar', 'contract', 'worklog'],
      uses: [],
      run: function (f, today) {
        var eventSources = ['tickets', 'issues', 'tasks', 'projects', 'leaves', 'advances', 'timesheets', 'costs', 'lodgings', 'holidays', 'contracts', 'work_logs', 'server_requests', 'forms'];
        var rows = [];
        eventSources.forEach(function (key) {
          if (!canSource(key)) return;
          var src = SOURCES[key];
          src.run(f, today).forEach(function (row) {
            row.title = src.icon + ' ' + src.label + ' — ' + row.title;
            rows.push(row);
          });
        });
        return rows;
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
      timesheets: 'timesheets = Timesheet/ชั่วโมงทำงานของทีมงานในแต่ละโครงการ',
      costs: 'costs = รายการค่าใช้จ่าย/ต้นทุน/ใบเสร็จของโครงการ',
      lodgings: 'lodgings = ข้อมูลที่พัก/โรงแรมของแต่ละโครงการ',
      holidays: 'holidays = วันหยุดของบริษัท/วันหยุดราชการ',
      contracts: 'contracts = ข้อมูลสัญญา ลูกค้า มูลค่า และช่วงสัญญา',
      work_logs: 'work_logs = บันทึกงาน/แผนงานรายวันและแบบหลายวันของทีมงาน',
      hospitals: 'hospitals = รายชื่อและข้อมูลโรงพยาบาล เช่น จังหวัด ระบบที่ใช้ จำนวนเตียง',
      staff: 'staff = ข้อมูลทีมงาน แผนก ตำแหน่ง อีเมล เบอร์โทร และสถานะใช้งาน',
      targets: 'targets = เป้าหมายยอดทีมรายปี แยกตามประเภทโครงการ',
      all_system: 'all_system = ค้นหลายโมดูลพร้อมกัน เมื่อถามกว้าง ๆ ว่าในระบบมีอะไร/วันนี้มีอะไรบ้าง โดยไม่ได้ระบุเรื่องใดเรื่องหนึ่ง',
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
      source: str(r.source).toLowerCase(),
      understood: str(r.understood),
      hospital: str(r.hospital), keyword: str(r.keyword), person: str(r.person),
      status: ['open', 'closed', 'pending', 'approved', 'rejected'].indexOf(st) >= 0 ? st : 'all',
      priority: arr(r.priority), severity: arr(r.severity),
      minAgeDays: Math.max(0, parseInt(r.minAgeDays, 10) || 0),
      unassigned: r.unassigned === true, overdue: r.overdue === true,
      dateFrom: dt(r.dateFrom), dateTo: dt(r.dateTo),
      groupBy: ['hospital', 'person', 'category', 'department'].indexOf(gb) >= 0 ? gb : '',
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
    }
    if (f.source === 'all_system' && !/ยังค้าง|ยังไม่เสร็จ|เสร็จแล้ว|ปิดแล้ว|รออนุมัติ|อนุมัติแล้ว|ไม่อนุมัติ|ปฏิเสธ/.test(text)) f.status = 'all';
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
      tickets: /^(ticket|ทิกเก็ต|helpdesk)$/i,
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
      tickets: /ticket|ทิกเก็ต|helpdesk/gi,
      projects: /โครงการ|โปรเจกต์/g,
      hospitals: /ข้อมูลโรงพยาบาล|รายชื่อโรงพยาบาล|โรงพยาบาล|รพ\.?/g,
      staff: /ข้อมูลทีมงาน|รายชื่อทีมงาน|พนักงาน|ทีมงาน/g,
      all_system: /ข้อมูล|ในระบบ|ทั้งหมด|ทุกเรื่อง|ทุกอย่าง/g,
      server_requests: /คำขอ|ขอใช้|ทีม server|ทีมเซิร์ฟเวอร์|server request/gi,
      forms: /เอกสาร|แบบฟอร์ม|เอกสารประกอบ advance/gi,
      knowledge: /คลังคำตอบ|คำสั่งลัด|ผู้ช่วยทีม/g,
    };
    if (f.keyword && domainNoise[f.source]) {
      var meaningful = f.keyword.toLowerCase()
        .replace(/วันนี้|พรุ่งนี้|มะรืน|เดือนนี้|เดือนหน้า|สัปดาห์นี้|สัปดาห์หน้า|อาทิตย์นี้|อาทิตย์หน้า|ปีนี้|ปีหน้า/g, '')
        .replace(/มี|ไหม|หรือไม่|อะไร|ใคร|บ้าง|รายการ/g, '')
        .replace(domainNoise[f.source], '')
        .replace(/[\s\-_,.()]+/g, '');
      if (!meaningful) f.keyword = '';
    }
    if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) {
      var swap = f.dateFrom; f.dateFrom = f.dateTo; f.dateTo = swap;
    }
    return f;
  }

  // ── ป้ายเงื่อนไขที่ใช้ค้นจริง — ให้ผู้ใช้เห็นว่าระบบกรองด้วยอะไร (ตรวจได้ว่า AI แปลถูกไหม) ──
  // src.uses = เงื่อนไขพิเศษที่แหล่งนั้นใช้กรองจริง — ไม่แสดงป้ายที่ไม่มีผล (เช่น Priority ตอนสลับไปค้นปัญหาการใช้งาน)
  function chips(f, src) {
    var use = function (k) { return src.uses.indexOf(k) >= 0; };
    var c = [];
    if (f.hospital) c.push('🏥 ' + f.hospital);
    if (f.keyword) c.push('🔎 ' + f.keyword.split('|').join(' / '));
    if (f.person) c.push('👷 ' + f.person);
    if (f.status !== 'all') c.push({ open:'ยังค้าง', closed:'เสร็จแล้ว', pending:'รออนุมัติ', approved:'อนุมัติแล้ว', rejected:'ไม่อนุมัติ' }[f.status] || f.status);
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
      var f = applyQuestionRules(cleanPlan(await window.aiChatJson(systemPrompt(today), q, { maxTokens: 500, temperature: 0 })), q, today);
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
      if (my === _seq) {
        // ถ้าบริการ AI สะดุด คำถามที่มีชื่อโมดูล/ช่วงเวลาชัดยังค้นข้อมูลจริงต่อได้ด้วยกฎในโค้ด
        var fallback = applyQuestionRules(cleanPlan({ understood: 'ค้นหาตามคำถาม: ' + q }), q, today);
        if (canSource(fallback.source)) {
          _last = { f: fallback, today: today };
          show();
          out.innerHTML = '<div class="ai-flag" style="margin-bottom:6px;">AI ตีความภาษาไม่พร้อมชั่วคราว — ระบบค้นด้วยคำสำคัญและช่วงวันที่ที่ระบุให้แทน</div>' + out.innerHTML;
        } else {
          out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
        }
      }
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

  // ── คีย์ลัด Ctrl+K / ⌘K เปิดช่องถาม AI ──
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && window.cu) { e.preventDefault(); window.askAiOpen(); }
  });

})();
