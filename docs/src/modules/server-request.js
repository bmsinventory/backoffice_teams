/**
 * server-request.js — 🖥 ขอใช้งานทีม Server (module 'server_request')
 *   คนนอกทีมกรอกคำขอที่หน้า public docs/server-request.html (เห็นปฏิทินวันว่างของทีม) →
 *   DM/PM อนุมัติ (สิทธิ์ "อนุมัติ" ของโมดูลนี้ใน Admin Panel) → จัดคน + ช่วงวันรายคน →
 *   ระบบสร้างโครงการให้อัตโนมัติ (ขึ้นปฏิทินทีม/ทีมว่าง/ภาระงานเหมือนโครงการปกติ)
 * ตาราง: server_requests, server_request_options · ค่าตั้ง: settings.app.srv_req_config
 * สิทธิ์: ดู = เห็นคำขอ · อนุมัติ = อนุมัติ/ไม่อนุมัติ · แก้ = จัดคน/ปิดงาน/ตั้งค่าตัวเลือก · ลบ = ลบคำขอ
 */
(function () {

  var esc = function (s) { return window.esc(s); };
  var REQS = [];           // คำขอทั้งหมด (ใหม่สุดก่อน)
  var OPTS = [];           // ตัวเลือกบนฟอร์ม (ทุก kind รวมที่ปิดใช้งาน)
  // read-only snapshot สำหรับ Ask AI — คืนสำเนาเพื่อไม่ให้ผู้เรียกแก้ state ภายในโมดูล
  window.askAiServerRequests = function () { return REQS.slice(); };
  var _tab = 'dashboard';  // dashboard | list | calendar | settings
  var _filter = 'pending'; // สถานะที่กรอง — เริ่มต้น = รออนุมัติ · '' = ทั้งหมด (งานที่ยังเปิดขึ้นก่อน)
  var _q = '';
  var _dashPeriod = (function () { try { return localStorage.getItem('srv_dash_period') || 'month'; } catch (e) { return 'month'; } })();
  var _dashAnchor = new Date();

  // ── Transform: raw DB row → app object ──
  function tReq(d) {
    return {
      id: d.id, reqNo: d.req_no || '', token: d.access_token || '',
      requesterName: d.requester_name || '', requesterTeam: d.requester_team || '',
      hospitalId: d.hospital_id || '', hospitalName: d.hospital_name || '', itName: d.it_name || '', itPhone: d.it_phone || '',
      workModeId: d.work_mode_id || '', dbTypeId: d.db_type_id || '',
      taskIds: Array.isArray(d.task_ids) ? d.task_ids : [], taskOther: d.task_other || '',
      phaseId: d.phase_id || '', start: d.start_date || '', end: d.end_date || '',
      headcount: Number(d.headcount) || 1, note: d.note || '', status: d.status || 'pending',
      decidedById: d.decided_by || '', decidedAt: d.decided_at || '', decisionNote: d.decision_note || '',
      assignees: Array.isArray(d.assignees) ? d.assignees : [],
      assignedById: d.assigned_by || '', assignedAt: d.assigned_at || '',
      projectId: d.project_id || '', createdAt: d.created_at || '', updatedAt: d.updated_at || '',
      _raw: d,
    };
  }
  function tOpt(d) {
    return { id: d.id, kind: d.kind || '', label: d.label || '', sort: Number(d.sort) || 0, active: d.active !== false };
  }

  function rerender() {
    var el = document.getElementById('view-server-request');
    if (el && el.classList.contains('on')) window.renderServerRequest();
    updateBadge();
  }
  window.onSnapshot(window.getColRef('SERVER_REQUESTS'), function (s) {
    REQS = s.docs.map(function (doc) { return tReq(doc.data()); })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    rerender();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'ขอใช้งานทีม Server'); });
  window.onSnapshot(window.getColRef('SERVER_REQUEST_OPTIONS'), function (s) {
    OPTS = s.docs.map(function (doc) { return tOpt(doc.data()); })
      .sort(function (a, b) { return a.sort - b.sort || a.label.localeCompare(b.label, 'th'); });
    rerender();
  }, function (e) { window.showDbErrorSoft && window.showDbErrorSoft(e, 'ตัวเลือกฟอร์มขอใช้งานทีม Server'); });

  // ── Helpers ──
  function cfg() { return window.SRV_REQ_CONFIG || {}; }
  // ดัชนี id → ตำแหน่ง (OPTS / HOSPITALS) สร้างครั้งเดียวต่อรอบ render แทน .find ทุกแถว (ค้นหา/รายการ เดิม O(คำขอ × รพ.))
  // ล้างทิ้งเองเมื่อจบงาน sync รอบนี้ + เช็กความยาว/ตรวจ id กันข้อมูลเปลี่ยนกลางรอบ · ผลเหมือน .find (ตัวแรกที่ id ตรง)
  var _idx = null;
  function findById(arr, id) {
    if (!_idx) { _idx = new Map(); Promise.resolve().then(function () { _idx = null; }); }
    var c = _idx.get(arr);
    if (!c || c.len !== arr.length) {
      var pos = new Map();
      for (var i = 0; i < arr.length; i++) if (!pos.has(arr[i].id)) pos.set(arr[i].id, i);
      c = { len: arr.length, pos: pos };
      _idx.set(arr, c);
    }
    var p = c.pos.get(id);
    if (p === undefined) return undefined;
    var x = arr[p];
    if (x && x.id === id) return x;
    _idx.delete(arr);
    return arr.find(function (y) { return y.id === id; });
  }
  function byId(id) { return REQS.find(function (r) { return r.id === id; }); }
  function optLabel(id) { var o = findById(OPTS, id); return o ? o.label : ''; }
  function optsOf(kind) { return OPTS.filter(function (o) { return o.kind === kind; }); }
  function hospLabel(r) {
    var h = r.hospitalId && findById(window.HOSPITALS || [], r.hospitalId);
    return h ? h.name : (r.hospitalName || '-');
  }
  function tasksText(r) {
    var t = r.taskIds.map(optLabel).filter(Boolean);
    if (r.taskOther) t.push('อื่นๆ: ' + r.taskOther);
    return t;
  }
  function fd(s) { return s ? window.fd(String(s).slice(0, 10)) : '-'; }
  function range(s, e) { return s === e ? fd(s) : fd(s) + ' – ' + fd(e); }
  function days(s, e) { return s && e ? Math.round((new Date(e) - new Date(s)) / 864e5) + 1 : 0; }
  function stBadge(st) {
    var m = window.SRV_STATUS[st] || { label: st, color: '#8a90a0' };
    return '<span class="srv-st" style="--st:' + m.color + '">' + esc(m.label) + '</span>';
  }
  function staffShort(sid) {
    var s = window.staffByRef ? window.staffByRef(sid) : (window.STAFF || []).find(function (x) { return x.id === sid; });
    return s ? (s.nickname || s.name) : sid;
  }
  function staffNotifyName(sid) {
    var s = window.staffByRef ? window.staffByRef(sid) : (window.STAFF || []).find(function (x) { return x.id === sid; });
    if (!s) return sid;
    return (s.name || s.nickname || sid) + (s.nickname && s.nickname !== s.name ? ' (' + s.nickname + ')' : '');
  }
  // สมาชิกทีม Server = พนักงาน (ใช้งานอยู่) ในแผนกที่ตั้งไว้ + รายชื่อที่เพิ่มเอง · ยังไม่ตั้ง = ทุกคน
  function teamStaff() {
    var c = cfg(), depts = c.teamDeptIds || [], extra = c.teamStaffIds || [];
    var all = (window.STAFF || []).filter(function (s) { return s.active; });
    if (!depts.length && !extra.length) return all;
    return all.filter(function (s) { return depts.indexOf(s.deptId) >= 0 || extra.indexOf(s.id) >= 0; });
  }
  function canApprove() { return window.canApprove && window.canApprove('server_request'); }
  function canEdit() { return window.canEdit && window.canEdit('server_request'); }
  function publicUrl(token) {
    return new URL('server-request.html' + (token ? '?t=' + encodeURIComponent(token) : ''), location.href).href;
  }
  function appLink(id) {
    var base = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? location.origin + location.pathname : 'https://backoffice-teams.bmscloud.in.th/';
    return base + '#server_request=' + id;
  }

  function updateBadge() {
    var nb = document.getElementById('srv-nb');
    if (!nb) return;
    var n = REQS.filter(function (r) { return r.status === 'pending' || (r.status === 'approved' && canEdit()); }).length;
    nb.textContent = n; nb.style.display = n ? '' : 'none';
  }

  // ── แจ้งเตือน BMS Notify (Token ตั้งที่ Admin › ตั้งค่าการแจ้งเตือน — settings.app.notify_server_token) ──
  window.srvNotify = async function (content) {
    var token = window.NOTIFY_SERVER_TOKEN || '';
    if (!token || !content) return;
    try {
      var url = (window.NOTIFY_PROXY_URL || '').trim() || 'https://api-notify.bmscloud.in.th/api/v1/push-notify';
      var res = await fetch(url, { method: 'POST', headers: { 'Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content, receiver: null }) });
      if (!res.ok) console.warn('Server request notify HTTP ' + res.status);
    } catch (e) { console.warn('Server request notify error:', e); }
  };
  function notifyText(r, head, approverName) {
    return head
      + '\n🧾 เลขที่: **' + r.reqNo + '**'
      + '\n🏥 ' + hospLabel(r)
      + '\n📅 ' + range(r.start, r.end) + ' (' + r.headcount + ' คน)'
      + '\n🛠 ' + tasksText(r).join(', ')
      + (approverName ? '\n👤ผู้อนุมัติ : ' + approverName : '')
      + (r.assignees.length ? '\n👥ทีม : ' + r.assignees.map(function (a) { return staffNotifyName(a.sid); }).join(', ') : '')
      + (r.decisionNote ? '\n📝 ' + r.decisionNote : '')
      + '\n[🔗 เปิดหน้าติดตามสถานะ](' + appLink(r.id) + ')';
  }

  async function saveReq(id, patch) {
    patch.updated_at = new Date().toISOString();
    await window.updateDoc(window.getDocRef('SERVER_REQUESTS', id), patch);
    var i = REQS.findIndex(function (r) { return r.id === id; });
    if (i >= 0) REQS[i] = tReq(Object.assign({}, REQS[i]._raw, patch));
    rerender();
    return REQS[i];
  }

  // ══ หน้าหลัก ══
  window.renderServerRequest = function () {
    var view = document.getElementById('view-server-request');
    if (!view) return;
    if (_tab === 'settings' && !canEdit()) _tab = 'list';
    view.innerHTML = '<div class="srv-wrap">'
      + '<div class="srv-head">'
      + '<div class="srv-tabs">'
      + '<button type="button" class="srv-tab' + (_tab === 'dashboard' ? ' on' : '') + '" onclick="window.srvTab(\'dashboard\')">' + window.appIcon('chart-donut') + ' ภาพรวม</button>'
      + '<button type="button" class="srv-tab' + (_tab === 'list' ? ' on' : '') + '" onclick="window.srvTab(\'list\')">' + window.appIcon('list-details') + ' คำขอ</button>'
      + '<button type="button" class="srv-tab' + (_tab === 'calendar' ? ' on' : '') + '" onclick="window.srvTab(\'calendar\')">' + window.appIcon('calendar-stats') + ' วันว่างของทีม</button>'
      + (canEdit() ? '<button type="button" class="srv-tab' + (_tab === 'settings' ? ' on' : '') + '" onclick="window.srvTab(\'settings\')">' + window.appIcon('settings') + ' ตั้งค่า</button>' : '')
      + '</div><div style="flex:1"></div>'
      + (_tab === 'list' ? '<button type="button" class="btn btn-xls btn-sm" onclick="window.srvExportExcel()" title="ส่งออกรายละเอียดคำขอทั้งหมดตามตัวกรอง/คำค้นที่เลือกอยู่">' + window.appIcon('file-spreadsheet') + ' ส่งออก Excel</button>' : '')
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.srvCopyPublic(this)" title="ส่งลิงก์นี้ให้คนนอกทีมกรอกคำขอ">' + window.appIcon('link') + ' คัดลอกลิงก์ฟอร์มขอ</button>'
      + '<a class="btn btn-pri btn-sm srv-create-request" href="server-request.html" target="_blank" rel="noopener"><span class="srv-create-request-emoji" aria-hidden="true">📝</span> กรอกคำขอแทน</a>'
      + '</div>'
      + '<div class="srv-body" id="srv-body"></div></div>';
    if (_tab === 'settings') renderSettings();
    else if (_tab === 'calendar') renderCalendar();
    else if (_tab === 'dashboard') renderDashboard();
    else renderList();
    updateBadge();
  };
  window.srvTab = function (t) { _tab = t; window.renderServerRequest(); };
  window.srvCopyPublic = function (btn) {
    var url = publicUrl();
    var done = function () { var o = btn.innerHTML; btn.textContent = '✅ คัดลอกแล้ว'; setTimeout(function () { btn.innerHTML = o; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done);
    else window.showAlert(url, 'info');
  };

  // ── รายการคำขอ ──
  //   _filter: สถานะใน SRV_STATUS · '' = ทั้งหมด · '_active' = กำลังทำวันนี้ · '_soon' = เริ่มภายใน 7 วัน
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var OPEN_ST = ['pending', 'approved', 'scheduled'];
  var _sort = 'start';  // start = วันเริ่มใกล้สุด · new = ส่งล่าสุด
  var _mode = (function () { try { return localStorage.getItem('srv_list_mode') || 'card'; } catch (e) { return 'card'; } })();
  var LIST_PAGE_SIZE = 25;
  var _page = 1;

  function todayIso() { return window.srvIso(new Date()); }
  function isActive(r, t) { return r.status === 'scheduled' && r.start <= t && r.end >= t; }
  function isSoon(r, t) { return OPEN_ST.indexOf(r.status) >= 0 && r.start > t && days(t, r.start) - 1 <= 7; }
  // ป้ายเวลา: เริ่มใน N วัน / กำลังดำเนินการ วันที่ x/y / เลยวันเริ่ม / ผ่านมาแล้ว
  function timing(r) {
    var t = todayIso();
    if (!r.start || r.status === 'rejected' || r.status === 'cancelled') return null;
    if (r.status === 'done') return null;
    if (r.start > t) {
      var d = days(t, r.start) - 1;
      return { cls: d <= 3 ? 'hot' : d <= 7 ? 'warn' : 'calm', txt: d === 1 ? 'เริ่มพรุ่งนี้' : 'เริ่มใน ' + d + ' วัน' };
    }
    if (r.end >= t) return r.status === 'scheduled'
      ? { cls: 'run', txt: 'กำลังดำเนินการ · วันที่ ' + days(r.start, t) + '/' + days(r.start, r.end) }
      : { cls: 'hot', txt: 'ถึงวันเริ่มแล้ว ยังไม่จัดคน' };
    return r.status === 'scheduled' ? { cls: 'warn', txt: 'เลยกำหนด รอปิดงาน' } : { cls: 'hot', txt: 'เลยวันเริ่มแล้ว' };
  }
  function ago(s) {
    if (!s) return '';
    var m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return m + ' นาทีที่แล้ว';
    if (m < 1440) return Math.floor(m / 60) + ' ชม.ที่แล้ว';
    if (m < 43200) return Math.floor(m / 1440) + ' วันที่แล้ว';
    return fd(s);
  }
  function avatar(sid) {
    var n = staffShort(sid) || '?', h = 0;
    for (var i = 0; i < String(sid).length; i++) h = (h * 31 + String(sid).charCodeAt(i)) % 360;
    return '<span class="srv-av" style="--h:' + h + '" title="' + esc(n) + '">' + esc(n.charAt(0)) + '</span>';
  }

  // ── Dashboard ภาพรวม: ช่วงเวลา / KPI / แนวโน้ม / ภาระทีม ──
  function isoDate(d) { return window.srvIso(new Date(d.getFullYear(), d.getMonth(), d.getDate())); }
  function addDate(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function dashRange() {
    var a = new Date(_dashAnchor.getFullYear(), _dashAnchor.getMonth(), _dashAnchor.getDate()), s, e;
    if (_dashPeriod === 'week') {
      var back = (a.getDay() + 6) % 7;
      s = addDate(a, -back); e = addDate(s, 6);
    } else if (_dashPeriod === 'year') {
      s = new Date(a.getFullYear(), 0, 1); e = new Date(a.getFullYear(), 11, 31);
    } else {
      s = new Date(a.getFullYear(), a.getMonth(), 1); e = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    }
    return { s: isoDate(s), e: isoDate(e), sd: s, ed: e };
  }
  function dashRangeLabel(x) {
    if (_dashPeriod === 'year') return 'ปี ' + (x.sd.getFullYear() + 543);
    if (_dashPeriod === 'month') return x.sd.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    return x.sd.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' – ' + x.ed.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function overlapDays(a, b, s, e) {
    var from = a > s ? a : s, to = b < e ? b : e;
    return from && to && from <= to ? days(from, to) : 0;
  }
  function inDashPeriod(r, x) { return !!overlapDays(r.start, r.end, x.s, x.e); }
  function reqDate(r) { return String(r.createdAt || '').slice(0, 10); }
  function fmtHours(n) {
    if (!isFinite(n) || n < 0) return '–';
    if (n < 24) return (Math.round(n * 10) / 10) + ' ชม.';
    return (Math.round(n / 24 * 10) / 10) + ' วัน';
  }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function dashboardBuckets(x) {
    var out = [], i, s, e;
    if (_dashPeriod === 'week') {
      for (i = 0; i < 7; i++) { s = addDate(x.sd, i); out.push({ s: isoDate(s), e: isoDate(s), label: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'][i] }); }
    } else if (_dashPeriod === 'year') {
      for (i = 0; i < 12; i++) { s = new Date(x.sd.getFullYear(), i, 1); e = new Date(x.sd.getFullYear(), i + 1, 0); out.push({ s: isoDate(s), e: isoDate(e), label: TH_MON[i] }); }
    } else {
      var cursor = new Date(x.sd), no = 1;
      while (cursor <= x.ed) {
        s = new Date(cursor); e = addDate(s, 6); if (e > x.ed) e = new Date(x.ed);
        out.push({ s: isoDate(s), e: isoDate(e), label: 'สัปดาห์ ' + no++ }); cursor = addDate(e, 1);
      }
    }
    out.forEach(function (b) {
      b.newCount = REQS.filter(function (r) { var d = reqDate(r); return d >= b.s && d <= b.e; }).length;
      b.workCount = REQS.filter(function (r) { return overlapDays(r.start, r.end, b.s, b.e) > 0 && r.status !== 'rejected' && r.status !== 'cancelled'; }).length;
    });
    return out;
  }
  function dashboardEmpty(title, detail) {
    return '<div class="srv-db-empty">' + window.appIcon('chart-bar-off') + '<b>' + title + '</b><span>' + detail + '</span></div>';
  }
  function dashArg(value) { return encodeURIComponent(String(value == null ? '' : value)).replace(/'/g, '%27'); }
  function renderDashboard() {
    var body = document.getElementById('srv-body'), x = dashRange(), today = todayIso();
    var list = REQS.filter(function (r) { return inDashPeriod(r, x); });
    var live = list.filter(function (r) { return r.status !== 'rejected' && r.status !== 'cancelled'; });
    var done = list.filter(function (r) { return r.status === 'done'; }).length;
    var pending = list.filter(function (r) { return r.status === 'pending'; }).length;
    var staffedNeed = live.reduce(function (n, r) { return n + (r.headcount || 0); }, 0);
    var staffedGot = live.reduce(function (n, r) { return n + Math.min(r.assignees.length, r.headcount || 0); }, 0);
    var demandDays = live.reduce(function (n, r) { return n + overlapDays(r.start, r.end, x.s, x.e) * (r.headcount || 0); }, 0);
    var allocatedDays = live.reduce(function (n, r) {
      return n + r.assignees.reduce(function (sum, a) { return sum + overlapDays(a.s || r.start, a.e || r.end, x.s, x.e); }, 0);
    }, 0);
    var decisions = list.filter(function (r) { return r.createdAt && r.decidedAt; }).map(function (r) { return (new Date(r.decidedAt) - new Date(r.createdAt)) / 36e5; }).filter(function (n) { return n >= 0; });
    var avgDecision = decisions.length ? decisions.reduce(function (a, b) { return a + b; }, 0) / decisions.length : NaN;
    var team = teamStaff(), periodDays = days(x.s, x.e), capacity = team.length * periodDays;
    var utilization = pct(allocatedDays, capacity);
    var statusKeys = Object.keys(window.SRV_STATUS), statusCounts = {}, totalStatus = list.length;
    statusKeys.forEach(function (st) { statusCounts[st] = list.filter(function (r) { return r.status === st; }).length; });
    var ringColors = statusKeys.map(function (st) { return (window.SRV_STATUS[st] || {}).color || '#9aa1ad'; });
    var ringPos = 0, ringParts = [];
    statusKeys.forEach(function (st, i) {
      var next = totalStatus ? ringPos + statusCounts[st] / totalStatus * 100 : ringPos;
      if (i === statusKeys.length - 1 && totalStatus) next = 100;
      ringParts.push(ringColors[i] + ' ' + ringPos + '% ' + next + '%'); ringPos = next;
    });
    if (!totalStatus) ringParts = ['var(--border) 0 100%'];
    var buckets = dashboardBuckets(x), maxBucket = Math.max.apply(null, buckets.map(function (b) { return Math.max(b.newCount, b.workCount); }).concat([1]));
    var taskMap = {};
    list.forEach(function (r) { tasksText(r).forEach(function (t) { taskMap[t] = (taskMap[t] || 0) + 1; }); });
    var tasks = Object.keys(taskMap).map(function (k) { return { name: k, n: taskMap[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    var maxTask = Math.max.apply(null, tasks.map(function (t) { return t.n; }).concat([1]));
    var staffMap = {};
    live.forEach(function (r) { r.assignees.forEach(function (a) { var n = overlapDays(a.s || r.start, a.e || r.end, x.s, x.e); if (n) staffMap[a.sid] = (staffMap[a.sid] || 0) + n; }); });
    var staffLoad = Object.keys(staffMap).map(function (sid) { return { sid: sid, n: staffMap[sid] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    var upcoming = REQS.filter(function (r) { return OPEN_ST.indexOf(r.status) >= 0 && r.start >= today; }).sort(function (a, b) { return a.start.localeCompare(b.start); }).slice(0, 5);
    var shortStaff = live.filter(function (r) { return r.status !== 'pending' && r.assignees.length < r.headcount; }).length;
    var overdue = REQS.filter(function (r) { return OPEN_ST.indexOf(r.status) >= 0 && r.start < today && r.status !== 'scheduled'; }).length;
    var dueSoon = REQS.filter(function (r) { return isSoon(r, today); }).length;

    function metric(icon, label, value, note, tone, status) {
      return '<button type="button" class="srv-db-metric" style="--st:' + tone + '" onclick="window.srvDashToList(\'' + (status || '') + '\')">'
        + '<span class="srv-db-metric-ic">' + window.appIcon(icon) + '</span><span class="srv-db-metric-main"><small>' + label + '</small><b>' + value + '</b><em>' + note + '</em></span>' + window.appIcon('chevron-right') + '</button>';
    }
    var periodButtons = ['week', 'month', 'year'].map(function (p, i) {
      return '<button type="button" class="' + (_dashPeriod === p ? 'on' : '') + '" onclick="window.srvDashPeriod(\'' + p + '\')">' + ['สัปดาห์', 'เดือน', 'ปี'][i] + '</button>';
    }).join('');
    var trendHtml = buckets.map(function (b) {
      return '<button type="button" class="srv-db-bar-col" onclick="window.srvDashOpenData(\'bucket\',\'' + dashArg(b.s + '|' + b.e) + '\')" title="' + esc(b.label) + ': รับใหม่ ' + b.newCount + ' · ให้บริการ ' + b.workCount + ' — คลิกดูรายการ"><div class="srv-db-bar-val">' + Math.max(b.newCount, b.workCount) + '</div>'
        + '<div class="srv-db-bars"><i style="height:' + Math.max(3, pct(b.workCount, maxBucket)) + '%"></i><i style="height:' + Math.max(3, pct(b.newCount, maxBucket)) + '%"></i></div><small>' + esc(b.label) + '</small></button>';
    }).join('');
    var statusHtml = statusKeys.filter(function (st) { return statusCounts[st]; }).map(function (st) {
      var m = window.SRV_STATUS[st]; return '<button type="button" class="srv-db-status" onclick="window.srvDashOpenData(\'status\',\'' + dashArg(st) + '\')" title="คลิกดูรายการสถานะ' + esc(m.label) + '"><i style="background:' + m.color + '"></i><span>' + esc(m.label) + '</span><b>' + statusCounts[st] + '</b><small>' + pct(statusCounts[st], totalStatus) + '%</small></button>';
    }).join('');
    var taskHtml = tasks.map(function (t) { return '<button type="button" class="srv-db-rank" onclick="window.srvDashOpenData(\'task\',\'' + dashArg(t.name) + '\')" title="คลิกดูรายการประเภทงาน ' + esc(t.name) + '"><span>' + esc(t.name) + '</span><i><em style="width:' + pct(t.n, maxTask) + '%"></em></i><b>' + t.n + '</b></button>'; }).join('');
    var loadHtml = staffLoad.map(function (s) {
      return '<button type="button" class="srv-db-person" onclick="window.srvDashOpenData(\'staff\',\'' + dashArg(s.sid) + '\')" title="คลิกดูงานของ ' + esc(staffShort(s.sid)) + '">' + avatar(s.sid) + '<span><b>' + esc(staffShort(s.sid)) + '</b><i><em style="width:' + Math.min(100, pct(s.n, periodDays)) + '%"></em></i></span><strong>' + s.n + ' วัน</strong></button>';
    }).join('');
    var upcomingHtml = upcoming.map(function (r) {
      var gap = days(today, r.start) - 1; return '<button type="button" class="srv-db-up" onclick="window.srvOpen(\'' + esc(r.id) + '\')"><span class="srv-db-up-date"><b>' + Number(r.start.slice(8)) + '</b><small>' + TH_MON[Number(r.start.slice(5, 7)) - 1] + '</small></span><span><b>' + esc(hospLabel(r)) + '</b><small>' + esc(tasksText(r).join(', ') || '-') + '</small></span><em>' + (gap === 0 ? 'วันนี้' : gap === 1 ? 'พรุ่งนี้' : 'อีก ' + gap + ' วัน') + '</em></button>';
    }).join('');
    var insight = function (icon, n, label, detail, cls, filter) {
      return '<button type="button" class="srv-db-alert ' + cls + '" onclick="window.srvDashToList(\'' + filter + '\')">' + window.appIcon(icon) + '<span><b>' + n + ' ' + label + '</b><small>' + detail + '</small></span>' + window.appIcon('arrow-up-right') + '</button>';
    };

    body.innerHTML = '<section class="srv-db-hero"><div><span class="srv-db-eyebrow">SERVICE OPERATIONS</span><h2>ภาพรวมการให้บริการทีม Server</h2><p>ติดตามคำขอ ความพร้อมทีม และประสิทธิภาพการให้บริการในมุมเดียว</p></div>'
      + '<div class="srv-db-period"><div class="srv-db-period-seg">' + periodButtons + '</div><div class="srv-db-date-nav"><button onclick="window.srvDashMove(-1)" title="ช่วงก่อนหน้า">' + window.appIcon('chevron-left') + '</button><b>' + esc(dashRangeLabel(x)) + '</b><button onclick="window.srvDashMove(1)" title="ช่วงถัดไป">' + window.appIcon('chevron-right') + '</button><button class="srv-db-today" onclick="window.srvDashToday()">วันนี้</button></div></div></section>'
      + '<div class="srv-db-metrics">'
      + metric('file-description', 'คำขอในช่วงนี้', list.length, demandDays + ' คน-วันตามความต้องการ', '#6d5dfc', '')
      + metric('circle-check', 'งานเสร็จสิ้น', done, pct(done, list.length) + '% ของคำขอทั้งหมด', '#0f9d6e', 'done')
      + metric('users-group', 'อัตราจัดคนครบ', pct(staffedGot, staffedNeed) + '%', staffedGot + ' จาก ' + staffedNeed + ' คน', '#0ea5c6', 'approved')
      + metric('clock-hour-4', 'เวลาพิจารณาเฉลี่ย', fmtHours(avgDecision), decisions.length + ' คำขอที่มีผลพิจารณา', '#c9820c', 'pending')
      + metric('calendar-stats', 'ภาระงานทีม', utilization + '%', allocatedDays + ' จาก ' + capacity + ' คน-วัน', '#e5484d', '_active')
      + '</div>'
      + '<div class="srv-db-grid">'
      + '<section class="srv-db-panel srv-db-trend"><header><div><h3>แนวโน้มคำขอและงานให้บริการ</h3><p>เปรียบเทียบคำขอที่รับใหม่กับงานที่ทีมต้องให้บริการจริง</p></div><div class="srv-db-legend"><span><i class="work"></i>งานให้บริการ</span><span><i class="new"></i>รับคำขอใหม่</span></div></header>'
      + (buckets.length ? '<div class="srv-db-chart">' + trendHtml + '</div>' : dashboardEmpty('ยังไม่มีข้อมูล', 'เมื่อมีคำขอ กราฟจะแสดงที่นี่')) + '</section>'
      + '<section class="srv-db-panel srv-db-status-panel"><header><div><h3>สัดส่วนสถานะ</h3><p>' + totalStatus + ' คำขอในช่วงนี้</p></div></header><div class="srv-db-status-body"><button type="button" class="srv-db-donut" onclick="window.srvDashOpenData(\'all\',\'\')" title="คลิกดูคำขอทั้งหมดในช่วงนี้" style="background:conic-gradient(' + ringParts.join(',') + ')"><span><b>' + totalStatus + '</b><small>คำขอ</small></span></button><div class="srv-db-status-list">' + (statusHtml || '<span class="srv-muted">ยังไม่มีข้อมูล</span>') + '</div></div></section>'
      + '<section class="srv-db-panel"><header><div><h3>ประเภทงานที่ขอมากที่สุด</h3><p>ช่วยวางแผนทักษะและทรัพยากรที่ต้องใช้</p></div></header>' + (taskHtml ? '<div class="srv-db-ranks">' + taskHtml + '</div>' : dashboardEmpty('ยังไม่มีประเภทงาน', 'ไม่พบคำขอในช่วงที่เลือก')) + '</section>'
      + '<section class="srv-db-panel"><header><div><h3>ภาระงานรายบุคคล</h3><p>จำนวนวันที่ถูกจัดงานในช่วงที่เลือก</p></div><span class="srv-db-cap">ทีม ' + team.length + ' คน</span></header>' + (loadHtml ? '<div class="srv-db-people">' + loadHtml + '</div>' : dashboardEmpty('ทีมยังไม่มีงานที่จัดคน', 'งานที่จัดคนแล้วจะแสดงภาระรายบุคคล')) + '</section>'
      + '<section class="srv-db-panel srv-db-attention"><header><div><h3>เรื่องที่ต้องดูแล</h3><p>รายการเสี่ยงที่ควรจัดการก่อน</p></div></header><div class="srv-db-alerts">'
      + insight('hourglass', pending, 'คำขอรออนุมัติ', 'รอ DM/PM พิจารณาในช่วงที่เลือก', pending ? 'warn' : 'ok', 'pending')
      + insight('user-exclamation', shortStaff, 'งานยังจัดคนไม่ครบ', 'อนุมัติแล้วแต่กำลังคนต่ำกว่าที่ขอ', shortStaff ? 'bad' : 'ok', 'approved')
      + insight('calendar-exclamation', dueSoon, 'งานเริ่มใน 7 วัน', overdue ? 'รวม ' + overdue + ' งานเลยวันเริ่ม' : 'ตรวจความพร้อมก่อนเริ่มงาน', dueSoon || overdue ? 'warn' : 'ok', '_soon')
      + '</div></section>'
      + '<section class="srv-db-panel srv-db-upcoming"><header><div><h3>งานที่กำลังจะเริ่ม</h3><p>เรียงตามวันเริ่มงานใกล้ที่สุด</p></div><button type="button" onclick="window.srvDashToList(\'_soon\')">ดูทั้งหมด ' + window.appIcon('arrow-right') + '</button></header>' + (upcomingHtml ? '<div class="srv-db-up-list">' + upcomingHtml + '</div>' : dashboardEmpty('ไม่มีงานที่กำลังจะเริ่ม', 'ยังไม่มีงานเปิดในอนาคต')) + '</section>'
      + '</div>';
  }
  window.srvDashPeriod = function (p) { _dashPeriod = p; _dashAnchor = new Date(); try { localStorage.setItem('srv_dash_period', p); } catch (e) { /* ignore */ } renderDashboard(); };
  window.srvDashMove = function (dir) { if (_dashPeriod === 'week') _dashAnchor.setDate(_dashAnchor.getDate() + dir * 7); else if (_dashPeriod === 'year') _dashAnchor.setFullYear(_dashAnchor.getFullYear() + dir); else _dashAnchor.setMonth(_dashAnchor.getMonth() + dir); renderDashboard(); };
  window.srvDashToday = function () { _dashAnchor = new Date(); renderDashboard(); };
  window.srvDashToList = function (st) { _filter = st || ''; _tab = 'list'; window.renderServerRequest(); };

  function dashPopupData(kind, value) {
    var x = dashRange();
    var list = REQS.filter(function (r) { return inDashPeriod(r, x); });
    var title = 'คำขอทั้งหมด';
    var rows = [];
    if (kind === 'bucket') {
      var p = String(value || '').split('|'), s = p[0] || x.s, e = p[1] || p[0] || x.e;
      var bucket = dashboardBuckets(x).find(function (b) { return b.s === s && b.e === e; });
      title = 'แนวโน้ม · ' + (bucket ? bucket.label : range(s, e));
      REQS.forEach(function (r) {
        var isNew = reqDate(r) >= s && reqDate(r) <= e;
        var isWork = r.status !== 'rejected' && r.status !== 'cancelled' && overlapDays(r.start, r.end, s, e) > 0;
        if (isNew || isWork) rows.push({ r: r, note: isNew && isWork ? 'รับใหม่ · ให้บริการ' : (isNew ? 'รับใหม่' : 'ให้บริการ') });
      });
    } else if (kind === 'status') {
      title = 'สถานะ · ' + ((window.SRV_STATUS[value] || {}).label || value);
      rows = list.filter(function (r) { return r.status === value; }).map(function (r) { return { r: r, note: 'ในช่วงที่เลือก' }; });
    } else if (kind === 'task') {
      title = 'ประเภทงาน · ' + value;
      rows = list.filter(function (r) { return tasksText(r).indexOf(value) >= 0; }).map(function (r) { return { r: r, note: 'ในช่วงที่เลือก' }; });
    } else if (kind === 'staff') {
      title = 'ภาระงาน · ' + staffShort(value);
      rows = list.filter(function (r) {
        return r.status !== 'rejected' && r.status !== 'cancelled' && r.assignees.some(function (a) { return a.sid === value && overlapDays(a.s || r.start, a.e || r.end, x.s, x.e) > 0; });
      }).map(function (r) {
        var a = r.assignees.find(function (z) { return z.sid === value; });
        return { r: r, note: a ? range(a.s || r.start, a.e || r.end) : 'ในช่วงที่เลือก' };
      });
    } else {
      rows = list.map(function (r) { return { r: r, note: 'ในช่วงที่เลือก' }; });
    }
    rows.sort(function (a, b) { return (a.r.start || '').localeCompare(b.r.start || '') || (b.r.createdAt || '').localeCompare(a.r.createdAt || ''); });
    return { title: title, range: x, rows: rows };
  }

  window.srvDashOpenData = function (kind, encodedValue) {
    var value = '';
    try { value = decodeURIComponent(encodedValue || ''); } catch (e) { value = encodedValue || ''; }
    var data = dashPopupData(kind, value), m = modal('m-srv-dash-data', 'srv-dash-modal');
    m.querySelector('.modal').className = 'modal xl srv-dash-modal';
    var rowsHtml = data.rows.map(function (item) {
      var r = item.r;
      return '<tr style="--st:' + (((window.SRV_STATUS[r.status] || {}).color) || '#8a90a0') + '" onclick="window.closeM(\'m-srv-dash-data\');window.srvOpen(\'' + esc(r.id) + '\')">'
        + '<td><b class="srv-dash-no">' + esc(r.reqNo || '-') + '</b><small>' + esc(r.requesterName || '-') + '</small></td>'
        + '<td><b>' + esc(hospLabel(r)) + '</b><small>' + esc(r.requesterTeam || '') + '</small></td>'
        + '<td>' + esc(range(r.start, r.end)) + '<small>' + r.headcount + ' คน</small></td>'
        + '<td>' + stBadge(r.status) + '</td>'
        + '<td class="srv-dash-task">' + esc(tasksText(r).join(', ') || '-') + '</td>'
        + '<td>' + esc(r.assignees.map(function (a) { return staffShort(a.sid); }).join(', ') || 'ยังไม่จัดคน') + '</td>'
        + '<td><span class="srv-dash-context">' + esc(item.note) + '</span></td></tr>';
    }).join('');
    var table = data.rows.length
      ? '<div class="srv-dash-table"><table class="srv-tbl"><thead><tr><th>เลขที่ / ผู้ขอ</th><th>โรงพยาบาล</th><th>ช่วงให้บริการ</th><th>สถานะ</th><th>ประเภทงาน</th><th>ผู้รับงาน</th><th>ข้อมูลในกราฟ</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
      : dashboardEmpty('ไม่พบรายการ', 'ไม่มีคำขอในข้อมูลกราฟส่วนนี้');
    m.querySelector('.modal').innerHTML = head('chart-bar', esc(data.title), 'm-srv-dash-data')
      + '<div class="m-body srv-dash-body"><div class="srv-dash-summary"><span>' + window.appIcon('calendar') + esc(dashRangeLabel(data.range)) + '</span><b>' + data.rows.length + ' รายการ</b></div>' + table + '</div>'
      + '<div class="m-foot"><button type="button" class="btn btn-ghost" onclick="window.closeM(\'m-srv-dash-data\')">ปิด</button></div>';
    window.openM('m-srv-dash-data');
  };

  // ส่งออก Excel จากหน้าคำขอ — รายละเอียดครบทุกช่องของคำขอตามตัวกรอง/คำค้นที่เลือกอยู่ + แยกชีตผู้รับงานรายคน
  window.srvExportExcel = async function () {
    if (!(await window.LibLoader.need('xlsx'))) return;
    var list = filteredList();
    if (!list.length) { window.showAlert('ไม่มีคำขอที่ตรงกับเงื่อนไขให้ส่งออก', 'info'); return; }
    var dt = function (s) { return s ? String(s).slice(0, 16).replace('T', ' ') : ''; };
    var stLabel = function (st) { return (window.SRV_STATUS[st] || {}).label || st; };
    var projName = function (r) { var p = r.projectId && (window.PROJECTS || []).find(function (x) { return x.id === r.projectId; }); return p ? p.name : ''; };
    var userName = function (id) { return id ? (window.userNameById(id) || '') : ''; };
    var t = todayIso();
    var headers = ['เลขที่คำขอ', 'สถานะ', 'สถานะเวลา', 'โรงพยาบาล', 'ผู้ขอ', 'ทีมผู้ขอ', 'IT ของ รพ.', 'เบอร์ IT',
      'ประเภทการทำงาน', 'ฐานข้อมูล', 'ประเภทงาน', 'งานอื่นๆ', 'ช่วงที่ต้องการ', 'วันเริ่ม', 'วันสิ้นสุด', 'จำนวนวัน',
      'จำนวนคนที่ขอ', 'จัดคนแล้ว', 'ผู้รับงาน (ช่วงวัน)', 'หมายเหตุผู้ขอ',
      'ผู้พิจารณา', 'วันที่พิจารณา', 'หมายเหตุผู้อนุมัติ', 'ผู้จัดคน', 'วันที่จัดคน', 'โครงการ',
      'วันที่ส่งคำขอ', 'แก้ไขล่าสุด', 'ลิงก์ติดตามสถานะ'];
    var rows = list.map(function (r) {
      var tm = timing(r);
      return [r.reqNo, stLabel(r.status), tm ? tm.txt : '', hospLabel(r), r.requesterName, r.requesterTeam, r.itName, r.itPhone,
        optLabel(r.workModeId), optLabel(r.dbTypeId), r.taskIds.map(optLabel).filter(Boolean).join(', '), r.taskOther, optLabel(r.phaseId),
        r.start, r.end, days(r.start, r.end) || '',
        r.headcount, r.assignees.length,
        r.assignees.map(function (a) { return staffNotifyName(a.sid) + (a.s ? ' (' + (a.s === (a.e || a.s) ? a.s : a.s + ' ถึง ' + (a.e || a.s)) + ')' : ''); }).join(', '),
        r.note,
        userName(r.decidedById), dt(r.decidedAt), r.decisionNote, userName(r.assignedById), dt(r.assignedAt), projName(r),
        dt(r.createdAt), dt(r.updatedAt), r.token ? publicUrl(r.token) : ''];
    });
    var asgRows = [];
    list.forEach(function (r) {
      r.assignees.forEach(function (a) {
        var s = a.s || r.start, e = a.e || a.s || r.end;
        asgRows.push([r.reqNo, hospLabel(r), stLabel(r.status), staffNotifyName(a.sid), s, e, days(s, e) || '']);
      });
    });
    var X = window.XLSX.utils, wb = X.book_new();
    var ws = X.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = [15, 14, 26, 34, 24, 22, 22, 14, 18, 16, 42, 24, 18, 12, 12, 9, 11, 10, 48, 40, 22, 17, 36, 22, 17, 34, 17, 17, 50].map(function (w) { return { wch: w }; });
    ws['!autofilter'] = { ref: 'A1:' + X.encode_col(headers.length - 1) + (rows.length + 1) };
    X.book_append_sheet(wb, ws, 'คำขอ');
    var wa = X.aoa_to_sheet([['เลขที่คำขอ', 'โรงพยาบาล', 'สถานะ', 'ผู้รับงาน', 'วันเริ่ม', 'วันสิ้นสุด', 'จำนวนวัน']].concat(asgRows));
    wa['!cols'] = [15, 34, 14, 32, 12, 12, 10].map(function (w) { return { wch: w }; });
    if (asgRows.length) wa['!autofilter'] = { ref: 'A1:G' + (asgRows.length + 1) };
    X.book_append_sheet(wb, wa, 'ผู้รับงาน');
    var fLabel = _filter === '_active' ? 'กำลังดำเนินการวันนี้' : _filter === '_soon' ? 'เริ่มภายใน 7 วัน' : _filter ? stLabel(_filter) : 'ทั้งหมด';
    X.book_append_sheet(wb, X.aoa_to_sheet([
      ['รายการคำขอใช้งานทีม Server'], ['ส่งออกเมื่อ', new Date().toLocaleString('th-TH')],
      ['ตัวกรอง', fLabel], ['คำค้น', _q.trim() || '-'], ['จำนวนคำขอ', list.length], ['จำนวนผู้รับงาน (แถว)', asgRows.length]
    ]), 'เงื่อนไข');
    window.XLSX.writeFile(wb, 'คำขอทีม_Server_' + t + '.xlsx');
  };
  // ปุ่มทำงานด่วนบนการ์ด/แถว ตามสถานะ + สิทธิ์
  function quickActs(r) {
    var id = esc(r.id), out = [];
    if (r.status === 'pending' && canApprove()) {
      out.push('<button type="button" class="srv-qa ok" onclick="event.stopPropagation();window.srvDecide(\'' + id + '\',\'approved\')">✓ อนุมัติ</button>');
      out.push('<button type="button" class="srv-qa no" onclick="event.stopPropagation();window.srvDecide(\'' + id + '\',\'rejected\')">✕ ไม่อนุมัติ</button>');
    }
    if (r.status === 'approved' && canEdit())
      out.push('<button type="button" class="srv-qa ok" onclick="event.stopPropagation();window.srvAssign(\'' + id + '\')">' + window.appIcon('users-plus') + ' จัดคน</button>');
    if (r.status === 'scheduled' && canEdit() && r.end && r.end < todayIso())
      out.push('<button type="button" class="srv-qa" onclick="event.stopPropagation();window.srvSetStatus(\'' + id + '\',\'done\')">🏁 ปิดงาน</button>');
    return out.join('');
  }

  // รายการตามตัวกรอง/คำค้น/การเรียงที่เลือกอยู่ (ใช้ทั้งหน้าคำขอและส่งออก Excel)
  function filteredList() {
    var t = todayIso(), n = _q.trim().toLowerCase();
    var list = REQS.filter(function (r) {
      if (_filter === '_active') { if (!isActive(r, t)) return false; }
      else if (_filter === '_soon') { if (!isSoon(r, t)) return false; }
      else if (_filter && r.status !== _filter) return false;
      if (!n) return true;
      return [r.reqNo, r.requesterName, r.requesterTeam, hospLabel(r), r.itName, r.itPhone, tasksText(r).join(' '),
        r.assignees.map(function (a) { return staffShort(a.sid); }).join(' ')].join(' ').toLowerCase().indexOf(n) >= 0;
    });
    list.sort(function (a, b) {
      // คำขอที่รออนุมัติต้องเห็นก่อนเสมอ แล้วจึงใช้ลำดับที่ผู้ใช้เลือก
      var pa = a.status === 'pending', pb = b.status === 'pending';
      if (pa !== pb) return pa ? -1 : 1;
      if (_sort === 'new') return (b.createdAt || '').localeCompare(a.createdAt || '');
      // งานที่ยังเปิดอยู่ขึ้นก่อน เรียงวันเริ่มใกล้สุด · ที่ปิดแล้วเรียงล่าสุดก่อน
      var oa = OPEN_ST.indexOf(a.status) >= 0, ob = OPEN_ST.indexOf(b.status) >= 0;
      if (oa !== ob) return oa ? -1 : 1;
      return oa ? (a.start || '').localeCompare(b.start || '') : (b.start || '').localeCompare(a.start || '');
    });
    return list;
  }

  function renderList() {
    var body = document.getElementById('srv-body');
    var t = todayIso();
    var counts = { '': REQS.length, _active: 0, _soon: 0 };
    REQS.forEach(function (r) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (isActive(r, t)) counts._active++;
      if (isSoon(r, t)) counts._soon++;
    });
    var list = filteredList();

    var totalPages = Math.max(1, Math.ceil(list.length / LIST_PAGE_SIZE));
    _page = Math.min(Math.max(1, _page), totalPages);
    var pageStart = (_page - 1) * LIST_PAGE_SIZE;
    var pageList = list.slice(pageStart, pageStart + LIST_PAGE_SIZE);
    var pagination = '';
    if (list.length > LIST_PAGE_SIZE) {
      var pageOptions = [];
      for (var p = 1; p <= totalPages; p++) {
        pageOptions.push('<option value="' + p + '"' + (p === _page ? ' selected' : '') + '>หน้า ' + p + '</option>');
      }
      pagination = '<nav class="srv-pagination" aria-label="เปลี่ยนหน้ารายการคำขอ">'
        + '<span>แสดง <b>' + (pageStart + 1) + '–' + Math.min(pageStart + LIST_PAGE_SIZE, list.length) + '</b> จาก <b>' + list.length + '</b> รายการ · หน้าละ ' + LIST_PAGE_SIZE + '</span>'
        + '<div><button type="button" onclick="window.srvPage(' + (_page - 1) + ')"' + (_page === 1 ? ' disabled' : '') + '>' + window.appIcon('chevron-left') + ' ก่อนหน้า</button>'
        + '<label><select class="f-input srv-page-select" onchange="window.srvPage(this.value)">' + pageOptions.join('') + '</select><span>จาก ' + totalPages + ' หน้า</span></label>'
        + '<button type="button" onclick="window.srvPage(' + (_page + 1) + ')"' + (_page === totalPages ? ' disabled' : '') + '>ถัดไป ' + window.appIcon('chevron-right') + '</button></div></nav>';
    }

    var chips = [''].concat(Object.keys(window.SRV_STATUS)).map(function (st) {
      var m = window.SRV_STATUS[st];
      return '<button type="button" class="srv-chip' + (_filter === st ? ' on' : '') + '"' + (m ? ' style="--st:' + m.color + '"' : '')
        + ' onclick="window.srvFilter(\'' + st + '\')">' + (m ? '<i class="srv-dot2"></i>' + esc(m.label) : 'ทั้งหมด') + ' <b>' + (counts[st] || 0) + '</b></button>';
    }).join('') + [
      { key: '_active', icon: 'tools', label: 'กำลังดำเนินการวันนี้', color: '#0f9d6e' },
      { key: '_soon', icon: 'calendar-time', label: 'เริ่มภายใน 7 วัน', color: '#e5484d' }
    ].map(function (x) {
      return '<button type="button" class="srv-chip srv-chip-quick' + (_filter === x.key ? ' on' : '') + '" style="--st:' + x.color + '" onclick="window.srvFilter(\'' + x.key + '\')">'
        + window.appIcon(x.icon) + esc(x.label) + ' <b>' + (counts[x.key] || 0) + '</b></button>';
    }).join('');
    var fLabel = _filter === '_active' ? 'กำลังดำเนินการวันนี้' : _filter === '_soon' ? 'เริ่มภายใน 7 วัน' : '';

    body.innerHTML = '<div class="srv-bar">'
      + '<div class="srv-toolbar"><div class="srv-bar-title">' + window.appIcon('filter') + '<span>ค้นหาและจัดเรียง</span></div>'
      + '<div class="srv-tools">'
      + '<div class="srv-search">' + window.appIcon('search') + '<input class="f-input srv-q" placeholder="ค้นหา เลขที่ / รพ. / ผู้ขอ / ผู้รับงาน" value="' + esc(_q) + '" oninput="window.srvSearch(this.value)"></div>'
      + '<select class="f-input srv-sort" onchange="window.srvSort(this.value)">'
      + '<option value="start"' + (_sort === 'start' ? ' selected' : '') + '>เรียง: วันเริ่มใกล้สุด</option>'
      + '<option value="new"' + (_sort === 'new' ? ' selected' : '') + '>เรียง: ส่งคำขอล่าสุด</option></select>'
      + '<div class="srv-seg">'
      + '<button type="button" class="' + (_mode === 'card' ? 'on' : '') + '" onclick="window.srvMode(\'card\')" title="การ์ด">' + window.appIcon('layout-grid') + '</button>'
      + '<button type="button" class="' + (_mode === 'table' ? 'on' : '') + '" onclick="window.srvMode(\'table\')" title="ตาราง">' + window.appIcon('list') + '</button>'
      + '</div></div></div>'
      + '<div class="srv-filter-row"><span class="srv-filter-label">ตัวกรอง</span><div class="srv-chips-row">' + chips + '</div></div></div>'
      + (fLabel ? '<div class="srv-fnote">กรอง: <b>' + fLabel + '</b> <button type="button" class="srv-ib" onclick="window.srvFilter(\'\')">✕ ล้าง</button></div>' : '')
      + (!list.length
        ? '<div class="srv-empty"><div class="srv-empty-ic">' + window.appIcon(REQS.length ? 'search-off' : 'server') + '</div>'
          + (REQS.length ? 'ไม่มีคำขอที่ตรงกับเงื่อนไข' : 'ยังไม่มีคำขอ — กด <b>คัดลอกลิงก์ฟอร์มขอ</b> แล้วส่งให้ทีมที่ต้องการใช้งาน') + '</div>'
        : (_mode === 'table' ? tableHtml(pageList)
        : '<div class="srv-list">' + pageList.map(cardHtml).join('') + '</div>') + pagination);
  }
  window.srvFilter = function (st) { _filter = (_filter === st && st.charAt(0) === '_') ? '' : st; _page = 1; renderList(); };
  window.srvSort = function (v) { _sort = v; _page = 1; renderList(); };
  window.srvMode = function (v) { _mode = v; try { localStorage.setItem('srv_list_mode', v); } catch (e) { /* ignore */ } renderList(); };
  window.srvSearch = function (v) {
    _q = v; _page = 1; renderList();
    var i = document.querySelector('.srv-q'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
  };
  window.srvPage = function (p) {
    _page = Math.max(1, Number(p) || 1);
    renderList();
    var first = document.querySelector('.srv-list, .srv-tbl-wrap');
    if (first) first.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // ผู้รับงาน: รูปย่อ + ชื่อ + ช่วงวันรายคน · แถบความคืบหน้า จัดแล้ว/ที่ขอ
  function staffing(r) {
    var got = r.assignees.length, need = r.headcount || 1;
    var pct = Math.min(100, Math.round(got / need * 100));
    return '<div class="srv-staff-pg"><span>จัดแล้ว <b>' + got + '</b> / ' + need + ' คน</span><i><em style="width:' + pct + '%"></em></i></div>'
      + (got ? '<div class="srv-people">' + r.assignees.map(function (a) {
          return '<div class="srv-person">' + avatar(a.sid) + '<div><b>' + esc(staffShort(a.sid)) + '</b>'
            + (a.s ? '<small>' + range(a.s, a.e || a.s) + '</small>' : '') + '</div></div>';
        }).join('') + '</div>'
        : '<div class="srv-none">' + window.appIcon('user-question') + ' ยังไม่ได้ระบุตัวคน</div>');
  }
  function colHead(icon, label) { return '<div class="srv-col-h">' + window.appIcon(icon) + ' ' + label + '</div>'; }
  function fact(icon, label, val) {
    return '<div class="srv-fact"><span class="srv-fact-ic">' + window.appIcon(icon) + '</span><div><small>' + label + '</small><b>' + (val || '<span class="srv-muted">-</span>') + '</b></div></div>';
  }

  // การ์ดแนวนอน: วันที่ | คำขอ | รายละเอียดงาน | ทีมผู้รับงาน | ผู้ติดต่อ | ปุ่มทำงาน
  function cardHtml(r) {
    var tasks = tasksText(r), tm = timing(r);
    var d = r.start ? new Date(r.start + 'T00:00:00') : null, e = r.end ? new Date(r.end + 'T00:00:00') : null;
    var st = window.SRV_STATUS[r.status] || { color: '#8a90a0' };
    var acts = quickActs(r), closed = r.status === 'rejected' || r.status === 'cancelled';
    var notes = (r.note ? '<div class="srv-note"><b>📝 หมายเหตุผู้ขอ:</b> ' + esc(r.note) + '</div>' : '')
      + (r.decisionNote ? '<div class="srv-note dec"><b>💬 ผู้อนุมัติ:</b> ' + esc(r.decisionNote) + '</div>' : '');
    return '<div class="srv-card" style="--st:' + st.color + '" onclick="window.srvOpen(\'' + esc(r.id) + '\')">'
      + '<div class="srv-card-grid' + (acts ? '' : ' no-acts') + '">'
      // วันที่
      + '<div class="srv-date">'
      + (d ? '<small>' + TH_MON[d.getMonth()] + ' ' + (d.getFullYear() + 543) + '</small><b>' + d.getDate() + '</b>'
          + (e && r.end !== r.start ? '<em>ถึง ' + e.getDate() + ' ' + TH_MON[e.getMonth()] + '</em>' : '<em>วันเดียว</em>')
          + '<span>' + days(r.start, r.end) + ' วัน</span>' : '<b>-</b>')
      + '</div>'
      // คำขอ
      + '<div class="srv-col srv-col-main">'
      + '<div class="srv-card-top"><span class="srv-no">' + esc(r.reqNo) + '</span>' + stBadge(r.status) + '</div>'
      + '<div class="srv-card-t" title="' + esc(hospLabel(r)) + '">' + window.appIcon('building-hospital') + ' ' + esc(hospLabel(r)) + '</div>'
      + '<div class="srv-range">' + window.appIcon('calendar') + ' ' + range(r.start, r.end) + '</div>'
      + (tm ? '<span class="srv-tm ' + tm.cls + '">' + esc(tm.txt) + '</span>' : '')
      + '</div>'
      // รายละเอียดงาน
      + '<div class="srv-col">' + colHead('tools', 'รายละเอียดงาน')
      + (tasks.length ? '<div class="srv-tags">' + tasks.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '<span class="srv-muted">-</span>')
      + '<div class="srv-facts">'
      + fact('map-pin', 'ประเภทการทำงาน', esc(optLabel(r.workModeId)))
      + fact('database', 'ฐานข้อมูล', esc(optLabel(r.dbTypeId)))
      + fact('clock', 'ช่วงที่ต้องการ', esc(optLabel(r.phaseId)))
      + fact('users', 'จำนวนคนที่ขอ', r.headcount + ' คน')
      + '</div></div>'
      // ทีมผู้รับงาน
      + '<div class="srv-col">' + colHead('users-group', 'ทีมผู้รับงาน')
      + (closed ? '<span class="srv-muted">— ' + esc(st.label || '') + ' —</span>' : staffing(r))
      + '</div>'
      // ผู้ติดต่อ
      + '<div class="srv-col">' + colHead('address-book', 'ผู้ติดต่อ')
      + '<div class="srv-contact">'
      + '<div>' + window.appIcon('user') + '<span><small>ผู้ขอ</small><b>' + esc(r.requesterName || '-') + '</b>' + (r.requesterTeam ? '<em>' + esc(r.requesterTeam) + '</em>' : '') + '</span></div>'
      + '<div>' + window.appIcon('headset') + '<span><small>IT ของ รพ.</small><b>' + esc(r.itName || '-') + '</b>'
      + (r.itPhone ? '<a href="tel:' + esc(r.itPhone) + '" onclick="event.stopPropagation()">📞 ' + esc(r.itPhone) + '</a>' : '') + '</span></div>'
      + '</div>'
      + '<div class="srv-ago" title="' + esc(fd(r.createdAt) + ' ' + String(r.createdAt).slice(11, 16)) + '">' + window.appIcon('history') + ' ส่งเมื่อ ' + ago(r.createdAt) + '</div>'
      + '</div>'
      // ปุ่ม
      + (acts ? '<div class="srv-card-acts">' + acts + '</div>' : '')
      + '</div>'
      + (notes ? '<div class="srv-notes">' + notes + '</div>' : '')
      + '</div>';
  }

  function tableHtml(list) {
    return '<div class="srv-tbl-wrap"><table class="srv-tbl"><thead><tr>'
      + '<th>เลขที่</th><th>โรงพยาบาล</th><th>ช่วงวันที่</th><th>รายละเอียดงาน</th><th>คน</th><th>สถานะ</th><th>ผู้ขอ</th><th></th>'
      + '</tr></thead><tbody>'
      + list.map(function (r) {
        var tm = timing(r), st = window.SRV_STATUS[r.status] || { color: '#8a90a0' };
        return '<tr style="--st:' + st.color + '" onclick="window.srvOpen(\'' + esc(r.id) + '\')">'
          + '<td><span class="srv-no">' + esc(r.reqNo) + '</span><br><small class="srv-muted">' + ago(r.createdAt) + '</small></td>'
          + '<td><b>' + esc(hospLabel(r)) + '</b><br><small class="srv-muted">' + esc([optLabel(r.workModeId), optLabel(r.dbTypeId)].filter(Boolean).join(' · ')) + '</small></td>'
          + '<td style="white-space:nowrap">' + range(r.start, r.end) + ' <small class="srv-muted">(' + days(r.start, r.end) + ' วัน)</small>'
          + (tm ? '<br><span class="srv-tm ' + tm.cls + '">' + esc(tm.txt) + '</span>' : '') + '</td>'
          + '<td class="srv-tbl-task">' + esc(tasksText(r).join(', ')) + '</td>'
          + '<td style="white-space:nowrap"><div class="srv-staff-av">' + r.assignees.map(function (a) { return avatar(a.sid); }).join('') + '</div>'
          + '<small class="srv-muted">' + r.assignees.length + '/' + r.headcount + ' คน</small></td>'
          + '<td>' + stBadge(r.status) + '</td>'
          + '<td>' + esc(r.requesterName) + (r.requesterTeam ? '<br><small class="srv-muted">' + esc(r.requesterTeam) + '</small>' : '') + '</td>'
          + '<td class="srv-tbl-act">' + quickActs(r) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  // ══ รายละเอียดคำขอ ══
  function modal(id, cls) {
    var m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.className = 'overlay'; m.id = id;
    m.innerHTML = '<div class="modal ' + (cls || '') + '"></div>';
    document.body.appendChild(m);
    return m;
  }
  function head(icon, title, closeId) {
    return '<div class="m-head"><div class="m-icon" style="background:rgba(124,92,252,.12)">' + window.appIcon(icon) + '</div>'
      + '<div class="m-title">' + title + '</div>'
      + '<button class="m-x" onclick="window.closeM(\'' + closeId + '\')">✕</button></div>';
  }
  function detailItem(icon, label, val, cls) {
    return '<div class="srv-detail-item ' + (cls || '') + '"><span class="srv-detail-item-ic">' + window.appIcon(icon) + '</span>'
      + '<div><small>' + esc(label) + '</small><div class="srv-detail-value">' + (val || '<span class="srv-muted">-</span>') + '</div></div></div>';
  }
  function detailSection(icon, title, content, cls) {
    return '<section class="srv-detail-card ' + (cls || '') + '"><div class="srv-detail-card-head"><span>' + window.appIcon(icon) + '</span><h3>' + esc(title) + '</h3></div>'
      + '<div class="srv-detail-card-body">' + content + '</div></section>';
  }

  window.srvOpen = function (id) {
    var r = byId(id);
    if (!r) { window.showAlert('ไม่พบคำขอนี้ (อาจถูกลบแล้ว)', 'warn'); return; }
    var m = modal('m-srv-view', 'srv-view-modal');
    m.querySelector('.modal').className = 'modal srv-view-modal';
    var proj = r.projectId && (window.PROJECTS || []).find(function (p) { return p.id === r.projectId; });
    var acts = [];
    if (r.status === 'pending' && canApprove()) {
      acts.push('<button class="btn btn-ghost" style="color:var(--coral)" onclick="window.srvDecide(\'' + r.id + '\',\'rejected\')">✕ ไม่อนุมัติ</button>');
      acts.push('<button class="btn btn-pri" onclick="window.srvDecide(\'' + r.id + '\',\'approved\')">✓ อนุมัติ</button>');
    }
    if ((r.status === 'approved' || r.status === 'scheduled') && canEdit())
      acts.push('<button class="btn btn-pri" onclick="window.srvAssign(\'' + r.id + '\')">' + window.appIcon('users-plus') + ' ' + (r.status === 'scheduled' ? 'แก้ไขการจัดคน' : 'จัดคน & สร้างโครงการ') + '</button>');
    if (r.status === 'scheduled' && canEdit())
      acts.push('<button class="btn btn-ghost" onclick="window.srvSetStatus(\'' + r.id + '\',\'done\')">🏁 ปิดงาน (เสร็จสิ้น)</button>');
    if ((r.status === 'rejected' || r.status === 'cancelled' || r.status === 'done') && canApprove())
      acts.push('<button class="btn btn-ghost" onclick="window.srvSetStatus(\'' + r.id + '\',\'pending\')">↩️ กลับไปรออนุมัติ</button>');
    if ((r.status === 'pending' || r.status === 'approved') && canEdit())
      acts.push('<button class="btn btn-ghost" onclick="window.srvSetStatus(\'' + r.id + '\',\'cancelled\')">ยกเลิกคำขอ</button>');
    if (window.canDel && window.canDel('server_request'))
      acts.unshift('<button class="btn btn-ghost" style="color:var(--coral);margin-right:auto" onclick="window.srvDelete(\'' + r.id + '\')">🗑 ลบ</button>');
    var timeline = [['ส่งคำขอ', r.createdAt, r.requesterName]];
    if (r.decidedAt) timeline.push([r.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติ', r.decidedAt, window.userNameById(r.decidedById)]);
    if (r.assignedAt) timeline.push(['จัดคน', r.assignedAt, window.userNameById(r.assignedById)]);

    var taskList = tasksText(r);
    var workInfo = '<div class="srv-detail-grid">'
      + detailItem('briefcase', 'ประเภทการทำงาน', esc(optLabel(r.workModeId)))
      + detailItem('database', 'ฐานข้อมูล', esc(optLabel(r.dbTypeId)))
      + detailItem('flag', 'ช่วงที่ต้องการใช้งาน', esc(optLabel(r.phaseId)), 'wide')
      + '</div>'
      + '<div class="srv-detail-block"><small>รายละเอียดงาน</small><div class="srv-task-list">'
      + (taskList.length ? taskList.map(function (t) { return '<span>' + window.appIcon('check') + esc(t) + '</span>'; }).join('') : '<span class="srv-muted">-</span>')
      + '</div></div>'
      + (r.note ? '<div class="srv-detail-note"><span>' + window.appIcon('note') + '</span><div><small>หมายเหตุ</small><p>' + esc(r.note).replace(/\n/g, '<br>') + '</p></div></div>' : '');
    var contactInfo = '<div class="srv-contact-grid">'
      + detailItem('user', 'ผู้ขอ', '<b>' + esc(r.requesterName || '-') + '</b>' + (r.requesterTeam ? '<span>' + esc(r.requesterTeam) + '</span>' : ''))
      + detailItem('headset', 'IT ของโรงพยาบาล', '<b>' + esc(r.itName || '-') + '</b>' + (r.itPhone ? '<a href="tel:' + esc(r.itPhone) + '">' + window.appIcon('phone') + esc(r.itPhone) + '</a>' : ''))
      + '</div>';
    var decisionInfo = (r.decisionNote ? detailItem('message-circle', 'หมายเหตุผู้อนุมัติ', esc(r.decisionNote), 'wide') : '')
      + (r.assignees.length ? detailItem('users', 'ผู้รับงาน', r.assignees.map(function (a) { return '<span class="srv-assignee"><b>' + esc(staffShort(a.sid)) + '</b><small>' + range(a.s, a.e) + '</small></span>'; }).join(''), 'wide') : '')
      + (proj ? detailItem('folders', 'โครงการ', '<a class="srv-detail-link" href="javascript:void(0)" onclick="window.closeM(\'m-srv-view\');window.goView(\'projects\');setTimeout(function(){window.openProjModal&&window.openProjModal(\'' + esc(proj.id) + '\')},300)">' + esc(proj.name) + window.appIcon('arrow-up-right') + '</a>', 'wide') : '');
    var historyInfo = '<div class="srv-history">' + timeline.map(function (t, i) {
        return '<div class="srv-history-item"><span class="srv-history-dot">' + window.appIcon(i === 0 ? 'send' : (t[0] === 'จัดคน' ? 'users-plus' : (r.status === 'rejected' ? 'x' : 'check'))) + '</span>'
          + '<div><b>' + esc(t[0]) + '</b><small>' + fd(t[1]) + ' เวลา ' + esc(String(t[1]).slice(11, 16)) + (t[2] ? ' · ' + esc(t[2]) : '') + '</small></div></div>';
      }).join('') + '</div>'
      + '<a class="srv-track-link" href="' + esc(publicUrl(r.token)) + '" target="_blank" rel="noopener">'
      + '<span>' + window.appIcon('link') + '</span><div><small>ลิงก์ติดตามของผู้ขอ</small><b>เปิดหน้าติดตาม</b></div>' + window.appIcon('arrow-up-right') + '</a>';

    m.querySelector('.modal').innerHTML = head('server', 'คำขอ ' + esc(r.reqNo) + ' ' + stBadge(r.status), 'm-srv-view')
      + '<div class="m-body srv-detail-body"><div class="srv-detail">'
      + '<div class="srv-detail-hero"><div class="srv-detail-hospital"><span class="srv-detail-hero-ic">' + window.appIcon('building-hospital') + '</span>'
      + '<div><small>โรงพยาบาล</small><h2>' + esc(hospLabel(r)) + '</h2></div></div>'
      + '<div class="srv-detail-summary">'
      + '<div title="ช่วงวันที่">' + window.appIcon('calendar') + '<span><b>' + range(r.start, r.end) + '</b><em>' + days(r.start, r.end) + ' วัน</em></span></div>'
      + '<div title="กำลังคนที่ต้องการ">' + window.appIcon('users') + '<span><b>' + r.headcount + ' คน</b></span></div>'
      + '</div></div>'
      + '<div class="srv-detail-columns"><div class="srv-detail-main">'
      + detailSection('tools', 'ข้อมูลงาน', workInfo)
      + '</div><div class="srv-detail-side">'
      + detailSection('address-book', 'ผู้ติดต่อ', contactInfo)
      + (decisionInfo ? detailSection('circle-check', 'ผลการพิจารณา', '<div class="srv-detail-grid">' + decisionInfo + '</div>') : '')
      + detailSection('history', 'ประวัติคำขอ', historyInfo, 'srv-history-card')
      + '</div></div>'
      + '</div>'
      + '</div>'
      + (acts.length ? '<div class="m-foot srv-foot">' + acts.join('') + '</div>' : '');
    window.openM('m-srv-view');
  };

  // ── อนุมัติ / ไม่อนุมัติ (ใส่หมายเหตุได้ · ไม่อนุมัติต้องใส่เหตุผล) ──
  window.srvDecide = function (id, decision) {
    var r = byId(id);
    if (!r || !canApprove()) return;
    var m = modal('m-srv-decide', 'sm');
    var ok = decision === 'approved';
    m.querySelector('.modal').innerHTML = head(ok ? 'circle-check' : 'circle-x', (ok ? 'อนุมัติ' : 'ไม่อนุมัติ') + 'คำขอ ' + esc(r.reqNo), 'm-srv-decide')
      + '<div class="m-body">'
      + '<div class="srv-dec-sum ' + (ok ? 'ok' : 'no') + '">'
      + '<div class="srv-dec-h">' + esc(hospLabel(r)) + '</div>'
      + '<div class="srv-dec-m"><span>' + range(r.start, r.end) + ' (' + days(r.start, r.end) + ' วัน)</span><span>' + r.headcount + ' คน</span>'
      + (optLabel(r.workModeId) ? '<span>' + esc(optLabel(r.workModeId)) + '</span>' : '') + '</div>'
      + '<div class="srv-dec-m"><span>ผู้ขอ: ' + esc(r.requesterName) + (r.requesterTeam ? ' · ' + esc(r.requesterTeam) : '') + '</span></div>'
      + '</div>'
      + '<div class="f-group" style="margin-bottom:0"><label class="f-label">' + (ok ? 'หมายเหตุ (ไม่บังคับ)' : 'เหตุผลที่ไม่อนุมัติ <span style="color:var(--coral)">*</span>') + '</label>'
      + '<textarea class="f-input" id="srv-dec-note" rows="3" placeholder="' + (ok ? 'เช่น ให้ประสานทีมหน้างานก่อนเข้า 1 วัน' : 'เช่น ช่วงวันที่ขอทีมไม่ว่าง เสนอเลื่อนเป็นสัปดาห์ถัดไป') + '"></textarea></div>'
      + (ok && canEdit() ? '<label class="srv-dec-opt"><input type="checkbox" id="srv-dec-assign" checked><div><b>จัดคนต่อทันทีหลังอนุมัติ</b><small>เปิดหน้าเลือกผู้รับงานให้อัตโนมัติ</small></div></label>' : '')
      + '</div><div class="m-foot">'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-srv-decide\')">ยกเลิก</button>'
      + '<button class="btn ' + (ok ? 'btn-pri' : '') + '"' + (ok ? '' : ' style="background:var(--coral);color:#fff"') + ' id="srv-dec-ok">' + (ok ? 'อนุมัติ' : 'ไม่อนุมัติ') + '</button></div>';
    var ico = m.querySelector('.m-icon');
    if (ico) ico.style.background = ok ? 'rgba(15,157,110,.12)' : 'rgba(229,72,77,.12)';
    window.openM('m-srv-decide');
    document.getElementById('srv-dec-ok').onclick = async function () {
      var note = document.getElementById('srv-dec-note').value.trim();
      if (!ok && !note) { window.showAlert('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'warn'); return; }
      var goAssign = ok && document.getElementById('srv-dec-assign') && document.getElementById('srv-dec-assign').checked;
      this.disabled = true;
      try {
        var nr = await saveReq(id, { status: decision, decided_by: window.meId(), decided_at: new Date().toISOString(), decision_note: note });
        window.closeM('m-srv-decide'); window.closeM('m-srv-view');
        window.showToast(ok ? 'อนุมัติแล้ว' : 'บันทึกไม่อนุมัติแล้ว', 'success');
        var approverName = window.userNameById(nr.decidedById)
          || (window.cu && (window.cu.name || window.cu.username)) || '';
        window.srvNotify(notifyText(nr, ok ? '✅ **อนุมัติคำขอใช้งานทีม Server**' : '❌ **ไม่อนุมัติคำขอใช้งานทีม Server**', ok ? approverName : ''));
        if (goAssign) window.srvAssign(id);
      } catch (e) { this.disabled = false; window.showDbError(e); }
    };
  };

  window.srvSetStatus = function (id, st) {
    var r = byId(id);
    if (!r) return;
    var label = (window.SRV_STATUS[st] || {}).label || st;
    var msg = st === 'cancelled' && r.projectId ? 'โครงการที่สร้างไว้จะถูกตั้งสถานะเป็นยกเลิกด้วย' : '';
    window.showConfirm('เปลี่ยนสถานะคำขอ ' + r.reqNo + ' เป็น "' + label + '"' + (msg ? '\n' + msg : ''), async function () {
      try {
        var patch = { status: st };
        if (st === 'pending') { patch.decided_by = ''; patch.decided_at = null; patch.decision_note = ''; }
        await saveReq(id, patch);
        if (st === 'cancelled' && r.projectId) await window.updateDoc(window.getDocRef('PROJECTS', r.projectId), { status: 'cancelled' });
        window.closeM('m-srv-view');
        window.showToast('อัปเดตสถานะแล้ว', 'success');
      } catch (e) { window.showDbError(e); }
    }, { icon: '🔄', title: 'ยืนยันเปลี่ยนสถานะ', okColor: 'var(--violet)', okText: 'ยืนยัน' });
  };

  window.srvDelete = function (id) {
    var r = byId(id);
    if (!r) return;
    var pid = r.projectId;
    window.showConfirm('ลบคำขอ ' + r.reqNo + ' ถาวร?' + (pid ? '\n(โครงการที่สร้างจากคำขอนี้ รวมถึงเบิก/ที่พัก/Timesheet ของโครงการ จะถูกลบด้วย)' : ''), async function () {
      try {
        // ── ลบโครงการที่ผูกกับคำขอไปพร้อมกัน (ตาม execDelete type 'project' + Timesheet ที่ระบบสร้างอัตโนมัติ) ──
        if (pid) {
          var batch = window.writeBatch();
          var ofPid = function (x) { return x.pid === pid; };
          (window.ADVANCES || []).filter(ofPid).forEach(function (a) { batch.delete(window.getDocRef('ADVANCES', a.id)); });
          (window.LODGINGS || []).filter(ofPid).forEach(function (l) { batch.delete(window.getDocRef('LODGINGS', l.id)); });
          (window.TIMESHEETS || []).filter(function (t) { return t.pid === pid && t.source === 'project'; })
            .forEach(function (t) { batch.delete(window.getDocRef('TIMESHEETS', t.id)); });
          batch.delete(window.getDocRef('PROJECTS', pid));
          await batch.commit();
          var notPid = function (x) { return x.pid !== pid; };
          window.ADVANCES = (window.ADVANCES || []).filter(notPid);
          window.LODGINGS = (window.LODGINGS || []).filter(notPid);
          window.TIMESHEETS = (window.TIMESHEETS || []).filter(function (t) { return !(t.pid === pid && t.source === 'project'); });
          window.PROJECTS = (window.PROJECTS || []).filter(function (p) { return p.id !== pid; });
        }
        await window.deleteDoc(window.getDocRef('SERVER_REQUESTS', id));
      } catch (e) { window.showDbError(e); return; }
      // ── อัปเดตหน้าจอแยกจาก try ข้างบน — ลบในฐานข้อมูลสำเร็จแล้ว ถ้าหน้าจอพังไม่ควรขึ้นหน้า "เชื่อมต่อฐานข้อมูลไม่ได้" ──
      REQS = REQS.filter(function (x) { return x.id !== id; });
      window.closeM('m-srv-view');
      window.showToast('ลบแล้ว' + (pid ? ' (รวมโครงการ)' : ''), 'success');
      rerender();
      if (pid) window.renderAll && window.renderAll();
    }, { title: 'ลบคำขอ', okText: 'ลบ' });
  };

  // ══ จัดคน & สร้างโครงการ ══
  var _asg = null; // { id, rows: [{ sid, on, s, e }] }
  window.srvAssign = function (id) {
    var r = byId(id);
    if (!r || !canEdit()) return;
    var cur = {}; r.assignees.forEach(function (a) { cur[a.sid] = a; });
    var team = teamStaff();
    // คนที่เคยถูกจัดแต่ไม่อยู่ในทีมแล้ว ก็ยังต้องแสดง (กันหายไปเงียบ ๆ ตอนแก้ไข)
    r.assignees.forEach(function (a) { if (!team.some(function (s) { return s.id === a.sid; })) { var s = window.staffByRef(a.sid); if (s) team.push(s); } });
    _asg = { id: id, rows: team.map(function (s) {
      var a = cur[s.id];
      return { sid: s.id, on: !!a, s: a ? a.s : r.start, e: a ? a.e : r.end };
    }) };
    var m = modal('m-srv-assign', 'lg');
    m.querySelector('.modal').innerHTML = head('users-plus', 'จัดคน — ' + esc(r.reqNo) + ' · ' + esc(hospLabel(r)), 'm-srv-assign')
      + '<div class="m-body">'
      + '<div class="srv-asg-info">ขอ <b>' + r.headcount + ' คน</b> · ' + range(r.start, r.end) + ' · ' + esc(tasksText(r).join(', ')) + '</div>'
      + '<div id="srv-asg-strip"></div>'
      + '<div class="srv-asg-list" id="srv-asg-list"></div>'
      + (!(cfg().teamDeptIds || []).length && !(cfg().teamStaffIds || []).length ? '<div class="srv-hint">ยังไม่ได้กำหนดสมาชิกทีม Server — แสดงพนักงานทุกคน (ตั้งค่าได้ที่แท็บ <b>ตั้งค่า</b>)</div>' : '')
      + '</div><div class="m-foot" style="display:flex;gap:8px;justify-content:flex-end;align-items:center;">'
      + '<span class="srv-muted" id="srv-asg-cnt" style="margin-right:auto"></span>'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-srv-assign\')">ยกเลิก</button>'
      + '<button class="btn btn-pri" id="srv-asg-save" onclick="window.srvAssignSave()">บันทึก & ' + (r.projectId ? 'อัปเดต' : 'สร้าง') + 'โครงการ</button></div>';
    renderAssignRows();
    window.openM('m-srv-assign');
  };

  function conflictsHtml(row, excludePid) {
    if (!row.s || !row.e) return '';
    var out = [];
    (window.getStaffOverlaps(row.sid, row.s, row.e, excludePid) || []).forEach(function (o) {
      out.push('<span class="srv-cf">' + esc(o.project.name) + ' ' + range(window.srvIso(o.from), window.srvIso(o.to)) + '</span>');
    });
    (window.getStaffLeaveConflicts(row.sid, row.s, row.e) || []).forEach(function (c) {
      out.push('<span class="srv-cf lv">' + c.emoji + ' ' + esc(c.label) + ' ' + range(c.leave.startDate, c.leave.endDate) + '</span>');
    });
    return out.length ? out.join('') : '<span class="srv-free">ว่าง</span>';
  }
  function renderAssignRows() {
    var r = byId(_asg.id);
    var list = document.getElementById('srv-asg-list');
    // คนว่างตลอดช่วงขึ้นก่อน แล้วตามด้วยคนที่ถูกเลือกไว้
    // คำนวณคะแนนติดงาน/ชื่อไว้ก่อนเรียง — เดิมเรียก busyScore (ไล่โครงการ+ลาทั้งหมด) ซ้ำทุกครั้งที่เทียบ
    var thColl = new Intl.Collator('th');
    var rows = _asg.rows.map(function (x) { return { x: x, busy: busyScore(x, r), name: staffShort(x.sid) }; }).sort(function (a, b) {
      return (b.x.on - a.x.on) || (a.busy - b.busy) || thColl.compare(a.name, b.name);
    }).map(function (k) { return k.x; });
    list.innerHTML = rows.map(function (x) {
      var s = window.staffByRef(x.sid) || {};
      var i = _asg.rows.indexOf(x);
      return '<div class="srv-asg-row' + (x.on ? ' on' : '') + '">'
        + '<label class="srv-asg-who"><input type="checkbox" ' + (x.on ? 'checked' : '') + ' onchange="window.srvAsgSet(' + i + ',\'on\',this.checked)">'
        + '<span><b>' + esc(s.nickname || s.name || x.sid) + '</b><small>' + esc(s.name || '') + (s.role ? ' · ' + esc(s.role) : '') + '</small></span></label>'
        + '<div class="srv-asg-dates"><input type="date" class="f-input" value="' + esc(x.s) + '" onchange="window.srvAsgSet(' + i + ',\'s\',this.value)">'
        + '<span>–</span><input type="date" class="f-input" value="' + esc(x.e) + '" onchange="window.srvAsgSet(' + i + ',\'e\',this.value)"></div>'
        + '<div class="srv-asg-cf">' + conflictsHtml(x, r.projectId) + '</div></div>';
    }).join('') || '<div class="srv-empty">ไม่มีพนักงานในทีม</div>';
    var n = _asg.rows.filter(function (x) { return x.on; }).length;
    var cnt = document.getElementById('srv-asg-cnt');
    cnt.innerHTML = 'เลือกแล้ว <b>' + n + '</b> / ' + r.headcount + ' คน' + (n && n < r.headcount ? ' <span style="color:var(--amber)">(น้อยกว่าที่ขอ)</span>' : '');
    renderStrip(r);
  }
  function busyScore(x, r) {
    return (window.getStaffOverlaps(x.sid, x.s, x.e, r.projectId) || []).length + (window.getStaffLeaveConflicts(x.sid, x.s, x.e) || []).length;
  }
  // แถบวันว่างรายวันตลอดช่วงคำขอ (จำนวนคนว่าง / ทั้งทีม)
  function renderStrip(r) {
    var el = document.getElementById('srv-asg-strip');
    if (!el || !r.start || !r.end) return;
    var map = freeMap(r.start, r.end, r);
    el.innerHTML = '<div class="srv-strip">' + Object.keys(map).map(function (d) {
      var x = map[d], cls = x.holiday || x.weekend ? 'off' : x.free === 0 ? 'none' : x.free < r.headcount ? 'low' : 'ok';
      return '<div class="srv-strip-d ' + cls + '" title="' + fd(d) + ' · ว่าง ' + x.free + '/' + x.total + ' คน' + (x.holiday ? ' · วันหยุด' : '') + '">'
        + '<small>' + Number(d.slice(8)) + '</small><b>' + x.free + '</b></div>';
    }).join('') + '</div><div class="srv-muted" style="margin:4px 0 12px;">ตัวเลข = จำนวนคนในทีมที่ว่างในวันนั้น (ไม่นับคำขอนี้)</div>';
  }
  // exclude = คำขอที่กำลังจัดคน — ไม่นับทั้งโครงการของมันและจำนวนคนที่มันกันไว้เอง
  function freeMap(from, to, exclude) {
    var team = teamStaff().map(function (s) { return s.id; });
    return window.srvTeamFreeByDay({
      staffIds: team, from: from, to: to,
      projects: (window.PROJECTS || []).filter(function (p) { return !exclude || p.id !== exclude.projectId; }),
      leaves: window.LEAVES || [],
      holidays: (window.HOLIDAYS || []).map(function (h) { return h.date; }),
      reserved: REQS.filter(function (x) { return x.status === 'approved' && x.start && x.end && !(exclude && x.id === exclude.id); })
        .map(function (x) { return { s: x.start, e: x.end, n: x.headcount }; }),
    });
  }
  window.srvAsgSet = function (i, k, v) {
    var x = _asg.rows[i];
    x[k] = v;
    if (k === 's' && x.e && v > x.e) x.e = v;
    if (k === 'e' && x.s && v < x.s) x.s = v;
    if (k !== 'on') x.on = true;
    renderAssignRows();
  };

  window.srvAssignSave = async function () {
    var r = byId(_asg.id);
    var sel = _asg.rows.filter(function (x) { return x.on; });
    if (!sel.length) { window.showAlert('กรุณาเลือกผู้รับงานอย่างน้อย 1 คน', 'warn'); return; }
    if (sel.some(function (x) { return !x.s || !x.e; })) { window.showAlert('กรุณาระบุช่วงวันที่ของผู้รับงานให้ครบ', 'warn'); return; }
    var assignees = sel.map(function (x) { return { sid: x.sid, s: x.s, e: x.e }; });
    var start = assignees.map(function (a) { return a.s; }).sort()[0];
    var end = assignees.map(function (a) { return a.e; }).sort().slice(-1)[0];
    var members = assignees.map(function (a) { return { id: 'M' + Date.now() + Math.floor(Math.random() * 1e5), sid: a.sid, s: a.s, e: a.e }; });
    var c = cfg();
    var groupId = c.groupId || ((window.PGROUPS || [])[0] || {}).id || '';
    var typeId = c.typeId || ((window.PTYPES || [])[0] || {}).id || '';
    var stage = (window.STAGES || []).slice().sort(function (a, b) { return a.order - b.order; })[0];
    var existing = r.projectId && (window.PROJECTS || []).find(function (p) { return p.id === r.projectId; });
    var pid = existing ? existing.id : 'P' + Date.now();
    var note = 'สร้างจากคำขอใช้งานทีม Server ' + r.reqNo
      + '\nงาน: ' + tasksText(r).join(', ')
      + (optLabel(r.dbTypeId) ? '\nฐานข้อมูล: ' + optLabel(r.dbTypeId) : '')
      + (optLabel(r.workModeId) ? '\nรูปแบบ: ' + optLabel(r.workModeId) : '')
      + (r.itName || r.itPhone ? '\nIT ติดต่อ: ' + [r.itName, r.itPhone].filter(Boolean).join(' ') : '')
      + '\nผู้ขอ: ' + r.requesterName + (r.requesterTeam ? ' (' + r.requesterTeam + ')' : '');
    var btn = document.getElementById('srv-asg-save');
    btn.disabled = true;
    try {
      if (existing) {
        // แก้แค่คน/ช่วงวัน — ส่วนอื่นของโครงการที่ PM อาจแก้ต่อในเมนูโครงการไว้แล้ว ห้ามทับ
        var upd = { members: members, team: members.map(function (m) { return m.sid; }), start_date: start, end_date: end, pm_staff_id: members[0].sid, status: 'active' };
        await window.updateDoc(window.getDocRef('PROJECTS', pid), upd);
      } else {
        var dbProj = {
          project_id: pid, project_name: (tasksText(r).join(', ') || 'Server') + ' : ' + hospLabel(r) + ' (' + r.reqNo + ')',
          group_id: groupId, type_id: typeId, stage_id: stage ? stage.id : '',
          site_owner: members[0].sid, installer_name: members[0].sid, pm_staff_id: members[0].sid,
          budget: 0, start_date: start, end_date: end, revisit_1: '', revisit_2: '', parent_project_id: '', revisit_round: 0,
          progress_pct: 0, note: note, status: 'active', team: members.map(function (m) { return m.sid; }), members: members,
          visits: [], is_border: false, contract_id: '', no_revisit: true, hospital_id: r.hospitalId || '',
        };
        await window.setDoc(window.getDocRef('PROJECTS', pid), dbProj);
        window._applyLocalDoc && window._applyLocalDoc('PROJECTS', pid, dbProj);
      }
      if (typeof window.tsSyncProject === 'function') await window.tsSyncProject(pid, members);
      var nr = await saveReq(r.id, { status: 'scheduled', assignees: assignees, assigned_by: window.meId(), assigned_at: new Date().toISOString(), project_id: pid });
      window.closeM('m-srv-assign'); window.closeM('m-srv-view');
      window.showToast((existing ? 'อัปเดต' : 'สร้าง') + 'โครงการและจัดคนแล้ว', 'success');
      window.renderAll && window.renderAll();
      window.srvNotify(notifyText(nr, '👥 **จัดคนทีม Server แล้ว**'));
    } catch (e) { window.showDbError(e); }
    finally { btn.disabled = false; }
  };

  // ══ ปฏิทินวันว่างของทีม — ตารางรายคน × รายวัน 1 เดือน (แบบปฏิทินทีม) ══
  var _calMonth = null, _calQ = '';
  var CAL_REQ_ST = ['pending', 'approved', 'scheduled'];
  var LEAVE_LABEL = { sick: '🤒 ลาป่วย', vacation: '🏖 ลาพักร้อน', personal: '📋 ลากิจ', maternity: '🤱 ลาคลอด', ordain: '🙏 ลาบวช', other: '📝 ลางาน' };
  function renderCalendar() {
    var body = document.getElementById('srv-body');
    if (!_calMonth) _calMonth = window.srvIso(new Date()).slice(0, 7);
    var y = Number(_calMonth.slice(0, 4)), m = Number(_calMonth.slice(5, 7));
    var lg = function (cls, label) { return '<span class="srv-lg"><i class="srv-tl-c ' + cls + '"></i>' + label + '</span>'; };
    body.innerHTML = '<div class="srv-bar srv-cal-bar">'
      + '<div class="month-nav"><button class="mnav-btn" onclick="window.srvCalNav(-1)">‹</button>'
      + '<span class="month-lbl">' + window.THMON[m - 1] + ' ' + (y + 543) + '</span>'
      + '<button class="mnav-btn" onclick="window.srvCalNav(1)">›</button></div>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.srvCalNav(0)">เดือนนี้</button>'
      + '<input class="f-input srv-q srv-cal-q" placeholder="🔍 พิมพ์ชื่อ/ชื่อเล่น" value="' + esc(_calQ) + '" oninput="window.srvCalSearch(this.value)">'
      + '<span class="srv-muted">ทีม Server ' + teamStaff().length + ' คน</span></div>'
      + '<div class="srv-legend">'
      + lg('free', 'ว่าง') + lg('proj', 'ติดโครงการ') + lg('leave', 'ลางาน') + lg('off', 'เสาร์-อาทิตย์ / วันหยุด')
      + '<span class="srv-lg-sep"></span>'
      + '<span class="srv-lg"><b class="srv-lg-n ok">5</b>คนว่างพอ</span>'
      + '<span class="srv-lg"><b class="srv-lg-n low">2</b>เหลือน้อย</span>'
      + '<span class="srv-lg"><b class="srv-lg-n none">0</b>ไม่มีคนว่าง</span>'
      + '<span class="srv-lg-sep"></span>'
      + CAL_REQ_ST.map(function (st) { return '<span class="srv-lg"><i class="srv-dot" style="background:' + window.SRV_STATUS[st].color + '"></i>คำขอ' + window.SRV_STATUS[st].label + '</span>'; }).join('')
      + '</div>'
      + '<div id="srv-cal-grid"></div>';
    renderCalGrid();
  }
  function renderCalGrid() {
    var grid = document.getElementById('srv-cal-grid');
    if (!grid) return;
    var y = Number(_calMonth.slice(0, 4)), m = Number(_calMonth.slice(5, 7));
    var map = freeMap(_calMonth + '-01', window.srvIso(new Date(y, m, 0)));
    var days = Object.keys(map);
    var team = teamStaff().slice().sort(function (a, b) { return staffShort(a.id).localeCompare(staffShort(b.id), 'th'); });
    var q = _calQ.trim().toLowerCase();
    var shown = q ? team.filter(function (s) { return [s.nickname, s.name, s.id].join(' ').toLowerCase().indexOf(q) >= 0; }) : team;
    var today = window.srvIso(new Date());
    var dayCls = function (d) { var x = map[d]; return (x.holiday || x.weekend ? ' off' : '') + (d === today ? ' today' : ''); };
    var cols = 'grid-template-columns:150px repeat(' + days.length + ',minmax(28px,1fr));';
    var row = function (cls, left, cells) { return '<div class="srv-tl-row ' + cls + '" style="' + cols + '"><div class="srv-tl-l">' + left + '</div>' + cells + '</div>'; };
    // หัวตาราง: วันที่ + ชื่อวัน
    var html = row('head', 'พนักงาน', days.map(function (d) {
      var dt = new Date(d + 'T00:00:00');
      return '<div class="srv-tl-h' + dayCls(d) + '"' + (map[d].holiday ? ' title="วันหยุด"' : '') + '><b>' + dt.getDate() + '</b><small>' + window.DNAMES[dt.getDay()] + '</small></div>';
    }).join(''));
    // แถวสรุป: คนว่าง/ทั้งทีม
    html += row('sum', 'คนว่าง', days.map(function (d) {
      var x = map[d];
      var cls = x.holiday || x.weekend ? 'off' : x.free === 0 ? 'none' : x.free <= Math.max(1, Math.floor(x.total / 4)) ? 'low' : 'ok';
      return '<div class="srv-tl-s ' + cls + (d === today ? ' today' : '') + '" title="' + fd(d) + ' · ว่าง ' + x.free + '/' + x.total + ' คน' + (x.reserved ? ' · กันไว้ ' + x.reserved + ' คน (อนุมัติแล้ว รอจัดคน)' : '') + '">' + x.free + '</div>';
    }).join(''));
    // แถวคำขอ: จุดสีตามสถานะ กดเปิดคำขอ
    html += row('req', 'คำขอ', days.map(function (d) {
      var rs = REQS.filter(function (r) { return r.start && r.end && CAL_REQ_ST.indexOf(r.status) >= 0 && r.start <= d && r.end >= d; });
      return '<div class="srv-tl-q' + dayCls(d) + '">' + rs.slice(0, 3).map(function (r) {
        return '<i class="srv-dot" style="background:' + window.SRV_STATUS[r.status].color + '" title="' + esc(r.reqNo + ' ' + hospLabel(r) + ' · ' + window.SRV_STATUS[r.status].label) + '" onclick="window.srvOpen(\'' + r.id + '\')"></i>';
      }).join('') + (rs.length > 3 ? '<em>+' + (rs.length - 3) + '</em>' : '') + '</div>';
    }).join(''));
    // แถวรายคน: พื้นหลังรายวัน (ว่าง/วันหยุด) + แถบชื่อโครงการ/ลางานคร่อมช่วงวัน (แบบปฏิทินทีม) ซ้อนกันได้หลายเลน
    var first = days[0], last = days[days.length - 1];
    var clip = function (sd, ed) {
      if (!sd || !ed || ed < first || sd > last) return null;
      return { a: days.indexOf(sd < first ? first : sd), b: days.indexOf(ed > last ? last : ed) };
    };
    html += shown.map(function (s) {
      var nFree = days.filter(function (d) { var x = map[d]; return !x.busy[s.id] && !x.holiday && !x.weekend; }).length;
      var evs = [];
      (window.PROJECTS || []).forEach(function (p, pi) {
        if (p.status === 'cancelled' || p.status === 'completed') return;
        var mems = (p.members && p.members.length) ? p.members
          : (p.team || []).map(function (sid) { return { sid: sid, s: p.start, e: p.end }; });
        var mine = mems.filter(function (m) { return m.sid === s.id && m.s && m.e; });
        if (!mine.length) return;
        var r = clip(mine.map(function (m) { return m.s; }).sort()[0], mine.map(function (m) { return m.e; }).sort().slice(-1)[0]);
        if (r) evs.push({ a: r.a, b: r.b, t: p.name || '', color: window.gC(pi), click: 'window.openProjModal(\'' + p.id + '\')' });
      });
      (window.LEAVES || []).forEach(function (lv) {
        if (lv.staffId !== s.id || lv.status === 'rejected') return;
        var r = clip(lv.startDate, lv.endDate);
        if (r) evs.push({ a: r.a, b: r.b, t: LEAVE_LABEL[lv.leaveType] || 'ลางาน', leave: true, click: 'window.openLeaveDetail(\'' + lv.id + '\')' });
      });
      evs.sort(function (x, y) { return x.a - y.a; });
      var lanes = [];
      evs.forEach(function (ev) { var l = 0; while (l < lanes.length && lanes[l] >= ev.a) l++; ev.lane = l; lanes[l] = ev.b; });
      var nl = Math.max(1, lanes.length);
      var cells = days.map(function (d, i) {
        var x = map[d], k = x.holiday || x.weekend ? 'off' : x.busy[s.id] ? 'busy' : 'free';
        var tip = staffShort(s.id) + ' · ' + fd(d) + ' · ' + (x.busy[s.id] ? (x.why[s.id] || []).join(', ') : k === 'off' ? 'วันหยุด' : 'ว่าง');
        return '<div class="srv-tl-c ' + k + (d === today ? ' today' : '') + '" style="grid-column:' + (i + 2) + ';grid-row:1/-1;" title="' + esc(tip) + '"></div>';
      }).join('');
      var bars = evs.map(function (ev) {
        var tip = ev.t + ' | ' + fd(days[ev.a]) + (ev.a !== ev.b ? ' – ' + fd(days[ev.b]) : '');
        return '<div class="srv-tl-bar' + (ev.leave ? ' leave' : '') + '" style="grid-column:' + (ev.a + 2) + '/' + (ev.b + 3) + ';grid-row:' + (ev.lane + 2) + ';'
          + (ev.leave ? '' : 'background:' + ev.color + ';') + '" title="' + esc(tip) + '" onclick="' + ev.click + '">' + esc(ev.t) + '</div>';
      }).join('');
      return '<div class="srv-tl-row srv-tl-pr" style="' + cols + 'grid-template-rows:4px repeat(' + nl + ',28px) 4px;">'
        + '<div class="srv-tl-l" style="grid-column:1;grid-row:1/-1;"><b>' + esc(staffShort(s.id)) + '</b><small>' + esc(s.name || '') + ' · ว่าง ' + nFree + ' วัน</small></div>'
        + cells + bars + '</div>';
    }).join('');
    grid.innerHTML = '<div class="srv-tl">' + html + '</div>'
      + (q && !shown.length ? '<div class="srv-empty">ไม่พบชื่อ "' + esc(_calQ) + '" ในทีม Server</div>' : '');
  }
  window.srvCalNav = function (n) {
    if (!n) _calMonth = null;
    else _calMonth = window.srvIso(new Date(Number(_calMonth.slice(0, 4)), Number(_calMonth.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
    renderCalendar();
  };
  window.srvCalSearch = function (v) { _calQ = v; renderCalGrid(); };

  // ══ ตั้งค่า: ตัวเลือกบนฟอร์ม + ทีม + โครงการ + แจ้งเตือน ══
  var _staffQ = '';        // คำค้นรายชื่อในแท็บตั้งค่า (คงไว้ตอน render ใหม่)
  function staffFull(s) { return esc(s.name) + (s.nickname && s.nickname !== s.name ? ' <small>(' + esc(s.nickname) + ')</small>' : ''); }
  function optUsed(id) {
    return REQS.filter(function (r) { return r.workModeId === id || r.dbTypeId === id || r.phaseId === id || r.taskIds.indexOf(id) >= 0; }).length;
  }

  function renderSettings() {
    var body = document.getElementById('srv-body');
    var c = cfg();
    var oldList = document.getElementById('srv-staff-list'), keepScroll = oldList ? oldList.scrollTop : 0;
    var kinds = window.SRV_OPTION_KINDS.map(function (k) {
      var list = optsOf(k.kind), on = list.filter(function (o) { return o.active; }).length;
      return '<div class="srv-set-card"><div class="srv-set-h"><b>' + esc(k.label) + '</b>'
        + '<span class="srv-tagm">' + (k.multi ? 'เลือกได้หลายข้อ' : 'เลือกได้ 1 ข้อ') + '</span>' + (k.required ? '<span class="srv-tagm req">บังคับ</span>' : '')
        + '<div style="flex:1"></div><span class="srv-muted">แสดง ' + on + '/' + list.length + '</span></div>'
        + '<div class="srv-opts">' + (list.length ? list.map(function (o, i) {
            var used = optUsed(o.id);
            return '<div class="srv-opt' + (o.active ? '' : ' off') + '">'
              + '<span class="srv-opt-mv"><button class="srv-ib" title="เลื่อนขึ้น" ' + (i ? '' : 'disabled') + ' onclick="window.srvOptMove(\'' + o.id + '\',-1)">▲</button>'
              + '<button class="srv-ib" title="เลื่อนลง" ' + (i < list.length - 1 ? '' : 'disabled') + ' onclick="window.srvOptMove(\'' + o.id + '\',1)">▼</button></span>'
              + '<span class="srv-opt-l" title="คลิกเพื่อแก้ไขข้อความ" onclick="window.srvOptEdit(\'' + o.id + '\')">' + esc(o.label) + '</span>'
              + (used ? '<span class="srv-opt-u" title="ถูกใช้ในคำขอ ' + used + ' รายการ">ใช้ ' + used + '</span>' : '')
              + '<label class="srv-sw" title="' + (o.active ? 'แสดงบนฟอร์ม — คลิกเพื่อซ่อน' : 'ซ่อนจากฟอร์ม — คลิกเพื่อแสดง') + '"><input type="checkbox"' + (o.active ? ' checked' : '') + ' onchange="window.srvOptToggle(\'' + o.id + '\')"><i></i></label>'
              + '<button class="srv-ib srv-opt-x" title="ลบ" onclick="window.srvOptDel(\'' + o.id + '\')">🗑</button></div>';
          }).join('') : '<div class="srv-muted" style="padding:6px 8px;">ยังไม่มีตัวเลือก</div>') + '</div>'
        + '<div class="srv-opt-add"><input class="f-input" data-kind="' + k.kind + '" placeholder="+ พิมพ์ตัวเลือกใหม่ แล้วกด Enter" onkeydown="if(event.key===\'Enter\')window.srvOptAdd(this,\'' + k.kind + '\')"></div>'
        + '</div>';
    }).join('');

    // ── สมาชิกทีม: เลือกทั้งแผนก (ปุ่ม) + รายชื่อแยกตามแผนก ค้นหาได้ ──
    var active = (window.STAFF || []).filter(function (s) { return s.active; }).sort(window.sortStaffByDeptRank);
    var depts = (window.DEPT_LIST || []).map(function (d) {
      var n = active.filter(function (s) { return s.deptId === d.id; }).length;
      var on = (c.teamDeptIds || []).indexOf(d.id) >= 0;
      return '<label class="srv-pill' + (on ? ' on' : '') + '"><input type="checkbox" class="srv-cfg-dept" value="' + esc(d.id) + '"' + (on ? ' checked' : '') + ' onchange="window.srvTeamChange()">'
        + '<span>' + (on ? '✓ ' : '') + esc(d.label) + '</span><small>' + n + '</small></label>';
    }).join('');
    var cur = null, rows = '';
    active.forEach(function (s) {
      var g = s.deptId || '';
      if (g !== cur) { rows += '<div class="srv-staff-g" data-dept="' + esc(g) + '">' + esc(s.dept || 'ไม่ระบุแผนก') + '</div>'; cur = g; }
      rows += '<label class="srv-staff-row" data-dept="' + esc(g) + '" data-q="' + esc((s.name + ' ' + (s.nickname || '') + ' ' + (s.dept || '')).toLowerCase()) + '">'
        + '<input type="checkbox" class="srv-cfg-staff" value="' + esc(s.id) + '"' + ((c.teamStaffIds || []).indexOf(s.id) >= 0 ? ' checked' : '') + ' onchange="window.srvTeamChange()">'
        + '<span class="srv-staff-n">' + staffFull(s) + '</span>'
        + (s.role ? '<span class="srv-staff-r">' + esc(s.role) + '</span>' : '')
        + '<span class="srv-staff-tag">ทั้งแผนก</span></label>';
    });
    var sel = function (id, list, val) {
      return '<select class="f-input" id="' + id + '" onchange="window.srvCfgSave()"><option value="">— ใช้รายการแรก —</option>' + (list || []).map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + esc(x.label) + '</option>';
      }).join('') + '</select>';
    };
    body.innerHTML = '<div class="srv-set-top"><span>การตั้งค่าในหน้านี้<b> บันทึกอัตโนมัติ </b>ทันทีที่แก้ไข</span><span class="srv-save-st" id="srv-cfg-st"></span></div>'
      + '<div class="srv-set">'
      + '<div class="srv-set-col">'
      + '<div class="srv-set-title">👥 สมาชิกทีม Server <span class="srv-cnt" id="srv-team-cnt"></span></div>'
      + '<div class="srv-set-card">'
      + '<div class="srv-muted" style="margin-bottom:10px;">ใช้คำนวณวันว่างบนฟอร์ม และเป็นรายชื่อตอนจัดคน · ยังไม่เลือกใคร = ใช้พนักงานทุกคน</div>'
      + '<div class="srv-step">① เลือกทั้งแผนก <span class="srv-muted">(คนที่เข้า/ออกแผนกจะอัปเดตเอง)</span></div>'
      + '<div class="srv-pills">' + (depts || '<span class="srv-muted">ยังไม่มีแผนก</span>') + '</div>'
      + '<div class="srv-step" style="margin-top:14px;">② เพิ่มรายบุคคล <span class="srv-muted">(คนนอกแผนกที่เลือก)</span></div>'
      + '<input class="f-input srv-staff-q" id="srv-staff-q" placeholder="🔍 ค้นหาชื่อ / ชื่อเล่น / แผนก" value="' + esc(_staffQ) + '" oninput="window.srvStaffFilter(this.value)">'
      + '<div class="srv-staff-list" id="srv-staff-list">' + (rows || '<div class="srv-muted" style="padding:10px;">ไม่มีพนักงาน</div>') + '</div>'
      + '<div class="srv-step" style="margin-top:14px;">สมาชิกที่เลือก</div><div class="srv-chips" id="srv-team-chips"></div>'
      + '</div>'
      + '<div class="srv-set-title" style="margin-top:8px;">⚙️ อื่นๆ</div>'
      + '<div class="srv-set-card"><div class="srv-set-h"><b>โครงการที่สร้างให้อัตโนมัติเมื่อจัดคน</b></div>'
      + '<div class="f-grid" style="grid-template-columns:1fr 1fr;"><div class="f-group"><label class="f-label">กลุ่มโครงการ</label>' + sel('srv-cfg-grp', window.PGROUPS, c.groupId) + '</div>'
      + '<div class="f-group"><label class="f-label">ประเภทโครงการ</label>' + sel('srv-cfg-type', window.PTYPES, c.typeId) + '</div></div></div>'
      + '<div class="srv-set-card"><div class="srv-set-h"><b>หน้าฟอร์มสำหรับคนภายนอก</b></div>'
      + '<div class="f-group"><label class="f-label">ข้อความแนะนำบนหัวฟอร์ม</label><textarea class="f-input" id="srv-cfg-intro" rows="2" placeholder="สำหรับแจ้งความจำนงในการให้ทีม Server เข้าทำงาน" oninput="window.srvCfgSaveLater()">' + esc(c.intro || '') + '</textarea></div>'
      + '<div class="srv-muted">Token แจ้งเตือน (BMS Notify) ตั้งที่ Admin Panel › ตั้งค่าการแจ้งเตือน</div></div>'
      + '</div>'
      + '<div class="srv-set-col">'
      + '<div class="srv-set-title">📝 ตัวเลือกบนฟอร์ม</div>'
      + '<div class="srv-hint">ปิดสวิตช์ = ซ่อนจากฟอร์ม (คำขอเก่ายังแสดงชื่อได้) · คลิกข้อความเพื่อแก้ไข · ลบได้เฉพาะตัวเลือกที่ยังไม่เคยถูกใช้</div>'
      + kinds
      + '</div></div>';
    syncTeam();
    window.srvStaffFilter(_staffQ);
    var nl = document.getElementById('srv-staff-list');
    if (nl) nl.scrollTop = keepScroll;
  }

  // อัปเดตหน้าจอทีม (คนในแผนกที่เลือก = ติ๊ก+ล็อก, จำนวน, ชิป) โดยไม่ render ใหม่ทั้งหน้า
  function syncTeam() {
    var depts = Array.from(document.querySelectorAll('.srv-cfg-dept')).filter(function (x) {
      x.closest('.srv-pill').classList.toggle('on', x.checked);
      x.nextElementSibling.textContent = (x.checked ? '✓ ' : '') + window.deptLabel(x.value);
      return x.checked;
    }).map(function (x) { return x.value; });
    var picked = [];
    document.querySelectorAll('.srv-staff-row').forEach(function (row) {
      var cb = row.querySelector('input'), inDept = depts.indexOf(row.dataset.dept) >= 0;
      if (inDept) { cb.dataset.own = cb.dataset.own || (cb.checked ? '1' : '0'); cb.checked = true; }
      else if (cb.dataset.own) { cb.checked = cb.dataset.own === '1'; delete cb.dataset.own; }
      cb.disabled = inDept;
      row.classList.toggle('dept', inDept);
      row.classList.toggle('on', cb.checked);
      if (cb.checked) picked.push(cb.value);
    });
    var cnt = document.getElementById('srv-team-cnt'), chips = document.getElementById('srv-team-chips');
    if (cnt) cnt.textContent = picked.length ? picked.length + ' คน' : 'ทุกคน';
    if (chips) chips.innerHTML = picked.length ? picked.map(function (id) {
      var s = window.staffByRef ? window.staffByRef(id) : null;
      return '<span class="srv-chip2">' + (s ? staffFull(s) : esc(id)) + '</span>';
    }).join('') : '<span class="srv-muted">ยังไม่ได้เลือก — ใช้พนักงานทุกคน</span>';
  }
  window.srvTeamChange = function () { syncTeam(); window.srvCfgSave(); };
  window.srvStaffFilter = function (q) {
    _staffQ = q || '';
    var t = _staffQ.trim().toLowerCase(), shown = {};
    document.querySelectorAll('.srv-staff-row').forEach(function (row) {
      var ok = !t || row.dataset.q.indexOf(t) >= 0;
      row.style.display = ok ? '' : 'none';
      if (ok) shown[row.dataset.dept] = 1;
    });
    document.querySelectorAll('.srv-staff-g').forEach(function (g) { g.style.display = shown[g.dataset.dept] ? '' : 'none'; });
  };

  // บันทึกค่าตั้งอัตโนมัติ (ไม่มีปุ่มบันทึก) · ช่องข้อความ = หน่วงหลังหยุดพิมพ์
  var _saveTimer = null;
  window.srvCfgSaveLater = function () { clearTimeout(_saveTimer); _saveTimer = setTimeout(window.srvCfgSave, 800); };
  window.srvCfgSave = async function () {
    clearTimeout(_saveTimer);
    var st = document.getElementById('srv-cfg-st');
    var vals = function (cls) { return Array.from(document.querySelectorAll('.' + cls + ':checked:not(:disabled)')).map(function (x) { return x.value; }); };
    var conf = {
      teamDeptIds: vals('srv-cfg-dept'), teamStaffIds: vals('srv-cfg-staff'),
      groupId: document.getElementById('srv-cfg-grp').value, typeId: document.getElementById('srv-cfg-type').value,
      intro: document.getElementById('srv-cfg-intro').value.trim(),
    };
    if (st) { st.className = 'srv-save-st ing'; st.textContent = 'กำลังบันทึก…'; }
    try {
      await window.setDoc(window.getDocRef('SETTINGS', 'app'), { srv_req_config: conf }, { merge: true });
      window.SRV_REQ_CONFIG = conf;
      if (st) { st.className = 'srv-save-st ok'; st.textContent = '✓ บันทึกแล้ว'; }
    } catch (e) {
      if (st) { st.className = 'srv-save-st err'; st.textContent = 'บันทึกไม่สำเร็จ'; }
      window.showDbError(e);
    }
  };

  // เพิ่มตัวเลือกจากช่องพิมพ์ท้ายการ์ด
  window.srvOptAdd = async function (inp, kind) {
    var label = inp.value.trim();
    if (!label) return;
    var dup = optsOf(kind).find(function (x) { return x.label.trim().toLowerCase() === label.toLowerCase(); });
    if (dup) { window.showAlert('มีตัวเลือก "' + dup.label + '" อยู่แล้ว', 'warn'); return; }
    var now = new Date().toISOString(), oid = window.srvUid('SRO');
    var data = { kind: kind, label: label, sort: optsOf(kind).reduce(function (mx, x) { return Math.max(mx, x.sort); }, 0) + 1, active: true, created_at: now, updated_at: now };
    inp.disabled = true;
    try {
      await window.setDoc(window.getDocRef('SERVER_REQUEST_OPTIONS', oid), data);
      if (!OPTS.some(function (x) { return x.id === oid; })) OPTS.push(tOpt(Object.assign({ id: oid }, data)));
      renderSettings();
      var again = document.querySelector('.srv-opt-add input[data-kind="' + kind + '"]');
      if (again) again.focus();
    } catch (e) { inp.disabled = false; window.showDbError(e); }
  };

  // ── เพิ่ม/แก้/ลบ/เรียง/เปิดปิด ตัวเลือก ──
  window.srvOptEdit = function (id, kind) {
    var o = id ? OPTS.find(function (x) { return x.id === id; }) : null;
    kind = o ? o.kind : kind;
    var k = window.SRV_OPTION_KINDS.find(function (x) { return x.kind === kind; }) || {};
    var m = modal('m-srv-opt', 'sm');
    m.querySelector('.modal').innerHTML = head('list-check', (o ? 'แก้ไข' : 'เพิ่ม') + 'ตัวเลือก — ' + esc(k.label || kind), 'm-srv-opt')
      + '<div class="m-body"><div class="f-group"><label class="f-label">ข้อความ <span style="color:var(--coral)">*</span></label>'
      + '<input class="f-input" id="srv-opt-l" value="' + esc(o ? o.label : '') + '"></div>'
      + '<label class="f-cb" style="display:flex;align-items:center;gap:8px;font-size:12.5px;"><input type="checkbox" id="srv-opt-a"' + (!o || o.active ? ' checked' : '') + '> เปิดใช้งาน (แสดงบนฟอร์ม)</label></div>'
      + '<div class="m-foot" style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-srv-opt\')">ยกเลิก</button>'
      + '<button class="btn btn-pri" id="srv-opt-save">บันทึก</button></div>';
    window.openM('m-srv-opt');
    var inp = document.getElementById('srv-opt-l');
    setTimeout(function () { inp.focus(); }, 50);
    inp.onkeydown = function (e) { if (e.key === 'Enter') document.getElementById('srv-opt-save').click(); };
    document.getElementById('srv-opt-save').onclick = async function () {
      var label = inp.value.trim();
      if (!label) { window.showAlert('กรุณากรอกข้อความ', 'warn'); return; }
      var dup = optsOf(kind).find(function (x) { return x.id !== (o && o.id) && x.label.trim().toLowerCase() === label.toLowerCase(); });
      if (dup) { window.showAlert('มีตัวเลือก "' + dup.label + '" อยู่แล้ว', 'warn'); return; }
      var now = new Date().toISOString();
      var oid = o ? o.id : window.srvUid('SRO');
      var sort = o ? o.sort : optsOf(kind).reduce(function (mx, x) { return Math.max(mx, x.sort); }, 0) + 1;
      var data = { kind: kind, label: label, sort: sort, active: document.getElementById('srv-opt-a').checked, updated_at: now };
      if (!o) data.created_at = now;
      this.disabled = true;
      try {
        await window.setDoc(window.getDocRef('SERVER_REQUEST_OPTIONS', oid), data, { merge: true });
        var row = tOpt(Object.assign({ id: oid }, data)), i = OPTS.findIndex(function (x) { return x.id === oid; });
        if (i >= 0) OPTS[i] = row; else OPTS.push(row);
        window.closeM('m-srv-opt'); renderSettings();
      } catch (e) { this.disabled = false; window.showDbError(e); }
    };
  };
  window.srvOptToggle = async function (id) {
    var o = OPTS.find(function (x) { return x.id === id; });
    if (!o) return;
    try {
      await window.updateDoc(window.getDocRef('SERVER_REQUEST_OPTIONS', id), { active: !o.active, updated_at: new Date().toISOString() });
      o.active = !o.active; renderSettings();
    } catch (e) { window.showDbError(e); }
  };
  window.srvOptMove = async function (id, dir) {
    var o = OPTS.find(function (x) { return x.id === id; });
    var list = optsOf(o.kind), i = list.indexOf(o), other = list[i + dir];
    if (!other) return;
    // เขียนลำดับใหม่ทั้งชุด (กันค่า sort ซ้ำจากข้อมูลเก่า)
    list.splice(i, 1); list.splice(i + dir, 0, o);
    try {
      await Promise.all(list.map(function (x, n) {
        if (x.sort === n + 1) return null;
        x.sort = n + 1;
        return window.updateDoc(window.getDocRef('SERVER_REQUEST_OPTIONS', x.id), { sort: n + 1 });
      }));
      OPTS.sort(function (a, b) { return a.sort - b.sort; });
      renderSettings();
    } catch (e) { window.showDbError(e); }
  };
  window.srvOptDel = function (id) {
    var o = OPTS.find(function (x) { return x.id === id; });
    if (!o) return;
    var used = REQS.filter(function (r) { return r.workModeId === id || r.dbTypeId === id || r.phaseId === id || r.taskIds.indexOf(id) >= 0; }).length;
    if (used) {
      window.showConfirm('"' + o.label + '" ถูกใช้ในคำขอแล้ว ' + used + ' รายการ จึงลบไม่ได้\nปิดใช้งานแทน? (ซ่อนจากฟอร์ม แต่คำขอเก่ายังแสดงชื่อได้)', function () {
        if (o.active) window.srvOptToggle(id);
      }, { icon: '🚫', title: 'ลบไม่ได้', okColor: 'var(--violet)', okText: 'ปิดใช้งาน' });
      return;
    }
    window.showConfirm('ลบตัวเลือก "' + o.label + '" ?', async function () {
      try {
        await window.deleteDoc(window.getDocRef('SERVER_REQUEST_OPTIONS', id));
        OPTS = OPTS.filter(function (x) { return x.id !== id; });
        renderSettings();
      } catch (e) { window.showDbError(e); }
    }, { title: 'ลบตัวเลือก', okText: 'ลบ' });
  };

  // ── Template + นำเข้าคำขอจาก Excel/CSV (ปุ่มนำเข้ากลางของระบบ) ──
  var SRV_IMPORT_HEADERS = [
    'req_no', 'requester_name', 'requester_team', 'hospital_code', 'hospital_name',
    'it_name', 'it_phone', 'work_mode', 'db_type', 'tasks', 'task_other', 'phase',
    'start_date', 'end_date', 'headcount', 'note', 'status', 'assignees', 'created_at',
  ];

  function srvImportNorm(v) {
    return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s_\-./()]+/g, '');
  }
  function srvImportVal(row, names) {
    var keys = Object.keys(row || {}), wanted = names.map(srvImportNorm);
    for (var i = 0; i < keys.length; i++) if (wanted.indexOf(srvImportNorm(keys[i])) >= 0) return row[keys[i]];
    return '';
  }
  function srvImportDate(v) {
    if (v instanceof Date && !isNaN(v)) return window.srvIso(v);
    if (typeof v === 'number' && window.XLSX && window.XLSX.SSF) {
      var dc = window.XLSX.SSF.parse_date_code(v);
      if (dc) return dc.y + '-' + String(dc.m).padStart(2, '0') + '-' + String(dc.d).padStart(2, '0');
    }
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    function ymd(y, m, d) {
      y = Number(y); m = Number(m); d = Number(d);
      var test = new Date(Date.UTC(y, m - 1, d));
      if (test.getUTCFullYear() !== y || test.getUTCMonth() !== m - 1 || test.getUTCDate() !== d) return '';
      return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
      var yy = Number(m[1]); if (yy >= 2500) yy -= 543;
      return ymd(yy, m[2], m[3]);
    }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
      var y = Number(m[3]); if (y < 100) y += 2000; if (y >= 2500) y -= 543;
      return ymd(y, m[2], m[1]);
    }
    var d = new Date(s); return isNaN(d) ? '' : window.srvIso(d);
  }
  function srvImportDateTime(v, fallback) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString();
    var s = String(v == null ? '' : v).trim();
    if (!s) return fallback;
    var date = srvImportDate(v), tm = s.match(/(?:\s|T)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (date) {
      var local = new Date(date + 'T' + (tm ? String(Number(tm[1])).padStart(2, '0') + ':' + tm[2] + ':' + (tm[3] || '00') : '00:00:00'));
      if (!isNaN(local)) return local.toISOString();
    }
    var d = new Date(s); return isNaN(d) ? fallback : d.toISOString();
  }
  function srvImportParts(v) {
    return String(v == null ? '' : v).split(/[|,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function srvImportOpt(kind, value) {
    var n = srvImportNorm(value);
    return OPTS.find(function (o) { return o.kind === kind && (srvImportNorm(o.id) === n || srvImportNorm(o.label) === n); });
  }
  function srvImportHospital(code, name) {
    var c = srvImportNorm(code), n = srvImportNorm(name);
    return (window.HOSPITALS || []).find(function (h) {
      return (c && (srvImportNorm(h.code) === c || srvImportNorm(h.id) === c)) || (n && srvImportNorm(h.name) === n);
    });
  }
  function srvImportStaff(value) {
    var n = srvImportNorm(value);
    return (window.STAFF || []).find(function (s) {
      return srvImportNorm(s.id) === n || srvImportNorm(s.name) === n || srvImportNorm(s.nickname) === n;
    });
  }
  function srvImportStatus(value) {
    var n = srvImportNorm(value), fromConfig = Object.keys(window.SRV_STATUS || {}).find(function (key) {
      return srvImportNorm((window.SRV_STATUS[key] || {}).label) === n;
    });
    if (fromConfig) return fromConfig;
    var map = {
      pending: 'pending', 'รออนุมัติ': 'pending',
      approved: 'approved', 'อนุมัติแล้วรอจัดคน': 'approved', 'อนุมัติแล้ว': 'approved',
      scheduled: 'scheduled', 'จัดคนแล้ว': 'scheduled',
      done: 'done', completed: 'done', 'เสร็จสิ้น': 'done',
      rejected: 'rejected', 'ไม่อนุมัติ': 'rejected',
      cancelled: 'cancelled', canceled: 'cancelled', 'ยกเลิก': 'cancelled',
    };
    return map[n] || '';
  }
  function srvImportToken() {
    var a = new Uint8Array(20);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function srvImportSignature(d) {
    var tasks = Array.isArray(d.task_ids) ? d.task_ids.slice().sort().join('|') : '';
    return [
      srvImportNorm(d.requester_name), srvImportNorm(d.hospital_id || d.hospital_name),
      String(d.start_date || ''), String(d.end_date || ''), srvImportNorm(d.work_mode_id),
      srvImportNorm(d.db_type_id), srvImportNorm(tasks), srvImportNorm(d.task_other),
    ].join('~');
  }

  window.srvDownloadImportTemplate = async function () {
    if (!(await window.LibLoader.need('xlsx'))) return;
    var example = [
      '', 'สมชาย ใจดี', 'ทีม Implement', '10669', '', 'คุณสมหญิง', '0812345678',
      (optsOf('work_mode')[0] || {}).label || 'เข้าไซต์งาน',
      (optsOf('db_type')[0] || {}).label || 'PostgreSQL',
      optsOf('task').slice(0, 2).map(function (o) { return o.label; }).join(' | '), '',
      (optsOf('phase')[0] || {}).label || '', '2026-10-15', '2026-10-17', 2,
      'หมายเหตุเพิ่มเติม', 'pending', '', '2026-10-09 09:00',
    ];
    var guide = [
      ['คู่มือ Template นำเข้า — ขอใช้งานทีม Server'],
      ['คอลัมน์', 'คำอธิบาย', 'จำเป็น'],
      ['req_no', 'เลขที่คำขอ เช่น SRV6910001 · เว้นว่างให้ระบบสร้าง · ถ้าตรงกับข้อมูลเดิมจะอัปเดตรายการนั้น', ''],
      ['requester_name', 'ชื่อผู้ขอ', '✅'], ['requester_team', 'ทีม/หน่วยงานของผู้ขอ', ''],
      ['hospital_code / hospital_name', 'ระบุรหัสหรือชื่อโรงพยาบาลอย่างใดอย่างหนึ่ง · ระบบจับคู่กับรายชื่อ รพ.', '✅'],
      ['it_name / it_phone', 'ชื่อและเบอร์โทร IT ของโรงพยาบาล', ''],
      ['work_mode / db_type / phase', 'ใส่ชื่อหรือรหัสให้ตรงกับชีต "ตัวเลือก"', ''],
      ['tasks', 'ใส่ชื่อหรือรหัสงานหลายรายการ คั่นด้วยเครื่องหมาย |', ''],
      ['task_other', 'รายละเอียดงานอื่นที่ไม่มีในตัวเลือก', ''],
      ['start_date / end_date', 'วันที่รูปแบบ YYYY-MM-DD หรือ DD/MM/YYYY (รองรับปี พ.ศ.)', '✅'],
      ['headcount', 'จำนวนคนที่ต้องการ · ค่าเริ่มต้น 1', ''],
      ['status', 'pending / approved / scheduled / done / rejected / cancelled', ''],
      ['assignees', 'ชื่อ ชื่อเล่น หรือรหัสพนักงานหลายคน คั่นด้วย | · ระบบใช้ช่วงวันที่เดียวกับคำขอ', ''],
      ['created_at', 'วันเวลาที่สร้าง เช่น 2026-10-09 09:00 · เว้นว่าง = เวลานำเข้า', ''],
      ['', 'ตัวเลือก "ลบ Data เก่าที่ซ้ำ": เทียบ req_no ก่อน; ถ้าเว้นเลขที่ จะเทียบชื่อผู้ขอ โรงพยาบาล ช่วงวันที่ และประเภทงาน', ''],
      ['', 'ระบบจะข้ามแถวที่ข้อมูลจำเป็นไม่ครบหรือจับคู่ตัวเลือก/เจ้าหน้าที่ไม่ได้ และแจ้งเลขแถวให้ตรวจแก้', ''],
    ];
    var wb = window.XLSX.utils.book_new();
    var ws = window.XLSX.utils.aoa_to_sheet([SRV_IMPORT_HEADERS, example]);
    ws['!cols'] = SRV_IMPORT_HEADERS.map(function (h) { return { wch: Math.max(14, Math.min(34, h.length + 5)) }; });
    window.XLSX.utils.book_append_sheet(wb, ws, 'คำขอทีม Server');
    var wg = window.XLSX.utils.aoa_to_sheet(guide); wg['!cols'] = [{ wch: 28 }, { wch: 82 }, { wch: 10 }];
    window.XLSX.utils.book_append_sheet(wb, wg, 'คำแนะนำ');
    var optionRows = [['ชนิด', 'รหัส', 'ชื่อ']];
    OPTS.forEach(function (o) { optionRows.push([o.kind, o.id, o.label]); });
    var wo = window.XLSX.utils.aoa_to_sheet(optionRows); wo['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 48 }];
    window.XLSX.utils.book_append_sheet(wb, wo, 'ตัวเลือก');
    var staffRows = [['รหัสพนักงาน', 'ชื่อ', 'ชื่อเล่น']].concat((window.STAFF || []).map(function (s) { return [s.id, s.name || '', s.nickname || '']; }));
    var wst = window.XLSX.utils.aoa_to_sheet(staffRows); wst['!cols'] = [{ wch: 20 }, { wch: 32 }, { wch: 18 }];
    window.XLSX.utils.book_append_sheet(wb, wst, 'พนักงาน');
    var hospitalRows = [['รหัสโรงพยาบาล', 'ชื่อโรงพยาบาล']].concat((window.HOSPITALS || []).map(function (h) { return [h.code || h.id, h.name || '']; }));
    var wh = window.XLSX.utils.aoa_to_sheet(hospitalRows); wh['!cols'] = [{ wch: 20 }, { wch: 52 }];
    window.XLSX.utils.book_append_sheet(wb, wh, 'โรงพยาบาล');
    window.XLSX.writeFile(wb, 'Template_SERVER_REQUESTS_import.xlsx');
  };

  window.srvImportFromFile = async function (file, removeDuplicates) {
    if (!(await window.LibLoader.need('xlsx'))) return;
    window._importProgress(0, 0, 'กำลังอ่านไฟล์');
    var wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = window.XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    if (!rows.length) throw new Error('ไม่พบข้อมูลในไฟล์');

    var snap = await window.getDocs(window.getColRef('SERVER_REQUESTS'));
    var rawExisting = snap.docs.map(function (d) { return d.data(); });
    var byNo = {};
    rawExisting.forEach(function (r) { if (r.req_no) byNo[String(r.req_no).trim().toUpperCase()] = r; });
    var usedNos = rawExisting.map(function (r) { return r.req_no; }).filter(Boolean);
    var seenInput = {}, seenSignature = {}, valid = [], bad = [];

    rows.forEach(function (row, idx) {
      var rowNo = idx + 2, errs = [];
      var reqNo = String(srvImportVal(row, ['req_no', 'เลขที่คำขอ']) || '').trim().toUpperCase();
      if (reqNo && seenInput[reqNo]) errs.push('เลขที่คำขอซ้ำกับแถว ' + seenInput[reqNo]);
      if (reqNo) seenInput[reqNo] = rowNo;
      var explicitReqNo = !!reqNo;
      var old = reqNo ? byNo[reqNo] : null;
      var requesterName = String(srvImportVal(row, ['requester_name', 'ชื่อผู้ขอ']) || '').trim();
      var requesterTeam = String(srvImportVal(row, ['requester_team', 'ทีมผู้ขอ', 'หน่วยงานผู้ขอ']) || '').trim();
      var hospCode = srvImportVal(row, ['hospital_code', 'รหัสโรงพยาบาล', 'รหัส รพ.']);
      var hospName = String(srvImportVal(row, ['hospital_name', 'ชื่อโรงพยาบาล', 'โรงพยาบาล']) || '').trim();
      var hosp = srvImportHospital(hospCode, hospName);
      var start = srvImportDate(srvImportVal(row, ['start_date', 'วันที่เริ่ม']));
      var end = srvImportDate(srvImportVal(row, ['end_date', 'วันที่สิ้นสุด']));
      if (!requesterName) errs.push('ไม่มีชื่อผู้ขอ');
      if (!hosp && !hospName) errs.push('ไม่พบโรงพยาบาลจากรหัส/ชื่อที่ระบุ');
      if (!start) errs.push('วันที่เริ่มไม่ถูกต้อง');
      if (!end) errs.push('วันที่สิ้นสุดไม่ถูกต้อง');
      if (start && end && end < start) errs.push('วันที่สิ้นสุดอยู่ก่อนวันที่เริ่ม');

      var workRaw = srvImportVal(row, ['work_mode', 'ประเภทการทำงาน']), work = workRaw ? srvImportOpt('work_mode', workRaw) : null;
      var dbRaw = srvImportVal(row, ['db_type', 'ประเภทฐานข้อมูล']), dbOpt = dbRaw ? srvImportOpt('db_type', dbRaw) : null;
      var phaseRaw = srvImportVal(row, ['phase', 'ช่วงที่ต้องการใช้งาน']), phase = phaseRaw ? srvImportOpt('phase', phaseRaw) : null;
      if (workRaw && !work) errs.push('ไม่พบประเภทการทำงาน "' + workRaw + '"');
      if (dbRaw && !dbOpt) errs.push('ไม่พบประเภทฐานข้อมูล "' + dbRaw + '"');
      if (phaseRaw && !phase) errs.push('ไม่พบช่วงใช้งาน "' + phaseRaw + '"');
      var taskIds = [], taskMiss = [];
      srvImportParts(srvImportVal(row, ['tasks', 'รายละเอียดงาน', 'งานที่ต้องการ'])).forEach(function (v) {
        var o = srvImportOpt('task', v); if (o) taskIds.push(o.id); else taskMiss.push(v);
      });
      if (taskMiss.length) errs.push('ไม่พบตัวเลือกงาน "' + taskMiss.join(', ') + '"');
      var taskOther = String(srvImportVal(row, ['task_other', 'งานอื่นๆ']) || '').trim();
      var signature = srvImportSignature({
        requester_name: requesterName, hospital_id: hosp ? hosp.id : '', hospital_name: hosp ? hosp.name : hospName,
        start_date: start, end_date: end, work_mode_id: work ? work.id : '', db_type_id: dbOpt ? dbOpt.id : '',
        task_ids: taskIds, task_other: taskOther,
      });
      if (removeDuplicates && seenSignature[signature]) errs.push('ข้อมูลซ้ำกับแถว ' + seenSignature[signature]);
      if (removeDuplicates) seenSignature[signature] = rowNo;
      var duplicateRows = removeDuplicates ? rawExisting.filter(function (r) { return srvImportSignature(r) === signature; }) : [];
      var deleteIds = [];
      if (removeDuplicates) {
        if (old) {
          deleteIds = duplicateRows.filter(function (r) { return r.id !== old.id; }).map(function (r) { return r.id; });
        } else if (!explicitReqNo && duplicateRows.length) {
          old = duplicateRows[0]; reqNo = old.req_no || '';
          deleteIds = duplicateRows.slice(1).map(function (r) { return r.id; });
        } else if (explicitReqNo && duplicateRows.length) {
          deleteIds = duplicateRows.map(function (r) { return r.id; });
        }
      }
      var assignees = [], staffMiss = [];
      srvImportParts(srvImportVal(row, ['assignees', 'ผู้รับผิดชอบ', 'เจ้าหน้าที่'])).forEach(function (v) {
        var s = srvImportStaff(v); if (s && !assignees.some(function (a) { return a.sid === s.id; })) assignees.push({ sid: s.id, s: start, e: end }); else if (!s) staffMiss.push(v);
      });
      if (staffMiss.length) errs.push('ไม่พบพนักงาน "' + staffMiss.join(', ') + '"');
      var statusRaw = srvImportVal(row, ['status', 'สถานะ']);
      var status = statusRaw ? srvImportStatus(statusRaw) : ((old && old.status) || 'pending');
      if (statusRaw && !status) errs.push('สถานะไม่ถูกต้อง "' + statusRaw + '"');
      var hcRaw = srvImportVal(row, ['headcount', 'จำนวนคน']), headcount = Number(hcRaw || 1);
      if (!Number.isFinite(headcount) || headcount < 1) errs.push('จำนวนคนต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
      headcount = Math.max(1, Math.round(headcount || 1));

      var now = new Date().toISOString();
      var createdAt = srvImportDateTime(srvImportVal(row, ['created_at', 'วันที่สร้าง']), (old && old.created_at) || now);
      if (!reqNo && !errs.length) {
        var createdDate = new Date(createdAt), prefix = window.srvReqNoPrefix(isNaN(createdDate) ? new Date() : createdDate);
        var max = 0;
        usedNos.forEach(function (n) { if (String(n || '').indexOf(prefix) === 0) max = Math.max(max, Number(String(n).slice(prefix.length)) || 0); });
        reqNo = prefix + String(max + 1).padStart(3, '0'); usedNos.push(reqNo);
      }
      if (errs.length) { bad.push('แถว ' + rowNo + ': ' + errs.join(' · ')); return; }
      if (usedNos.indexOf(reqNo) < 0) usedNos.push(reqNo);
      var id = old ? old.id : window.srvUid('SR');
      var data = {
        req_no: reqNo, access_token: (old && old.access_token) || srvImportToken(),
        requester_name: requesterName, requester_team: requesterTeam,
        hospital_id: hosp ? hosp.id : '', hospital_name: hosp ? hosp.name : hospName,
        it_name: String(srvImportVal(row, ['it_name', 'ชื่อ IT', 'ชื่อผู้ติดต่อ IT']) || '').trim(),
        it_phone: String(srvImportVal(row, ['it_phone', 'เบอร์ IT', 'เบอร์โทร IT']) || '').trim(),
        work_mode_id: work ? work.id : '', db_type_id: dbOpt ? dbOpt.id : '', task_ids: taskIds,
        task_other: taskOther, phase_id: phase ? phase.id : '',
        start_date: start, end_date: end, headcount: headcount,
        note: String(srvImportVal(row, ['note', 'หมายเหตุ']) || '').trim(), status: status,
        assignees: assignees, created_at: createdAt, updated_at: now,
      };
      valid.push({ id: id, data: data, update: !!old, deleteIds: deleteIds });
      byNo[reqNo] = Object.assign({ id: id }, data);
    });

    if (!valid.length) {
      window._importProgress(null);
      window._importAlert('error', 'ไม่พบแถวที่นำเข้าได้', bad, 'กรุณาแก้ข้อมูลตามเลขแถวแล้วเลือกไฟล์ใหม่');
      return;
    }
    var deleted = {}, deleteCount = 0;
    valid.forEach(function (r) { r.deleteIds.forEach(function (id) { if (!deleted[id]) { deleted[id] = true; deleteCount++; } }); });
    var totalOps = valid.length + deleteCount;
    window._importProgress(0, totalOps, deleteCount ? 'กำลังลบข้อมูลซ้ำ/นำเข้า' : 'กำลังนำเข้าคำขอทีม Server');
    var batch = window.writeBatch();
    Object.keys(deleted).forEach(function (id) { batch.delete(window.getDocRef('SERVER_REQUESTS', id)); });
    valid.forEach(function (r) {
      var ref = window.getDocRef('SERVER_REQUESTS', r.id);
      if (r.update) batch.update(ref, r.data); else batch.set(ref, r.data);
    });
    var done = 0;
    var progressLabel = deleteCount ? 'กำลังลบข้อมูลซ้ำ/นำเข้า' : 'กำลังนำเข้าคำขอทีม Server';
    await batch.commit(function () { done++; window._importProgress(done, totalOps, progressLabel); });
    window._importProgress(null);
    window.closeM('m-import');
    var skipped = bad.length ? ' · ข้าม ' + bad.length + ' แถว: ' + bad.slice(0, 3).join(' | ') + (bad.length > 3 ? ' | …' : '') : '';
    var removed = deleteCount ? ' · ลบ Data เก่าที่ซ้ำ ' + deleteCount + ' รายการ' : '';
    window.showAlert('นำเข้าคำขอใช้งานทีม Server สำเร็จ ' + valid.length + ' รายการ' + removed + skipped, bad.length ? 'warn' : 'success');
  };

})();
