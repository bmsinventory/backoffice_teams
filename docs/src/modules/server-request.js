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
  var _tab = 'list';       // list | settings
  var _filter = '';        // สถานะที่กรอง ('' = ทั้งหมด · งานที่ยังเปิดขึ้นก่อน)
  var _q = '';

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
  function byId(id) { return REQS.find(function (r) { return r.id === id; }); }
  function optLabel(id) { var o = OPTS.find(function (x) { return x.id === id; }); return o ? o.label : ''; }
  function optsOf(kind) { return OPTS.filter(function (o) { return o.kind === kind; }); }
  function hospLabel(r) {
    var h = r.hospitalId && (window.HOSPITALS || []).find(function (x) { return x.id === r.hospitalId; });
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
      + '<button type="button" class="srv-tab' + (_tab === 'list' ? ' on' : '') + '" onclick="window.srvTab(\'list\')">' + window.appIcon('list-details') + ' คำขอ</button>'
      + '<button type="button" class="srv-tab' + (_tab === 'calendar' ? ' on' : '') + '" onclick="window.srvTab(\'calendar\')">' + window.appIcon('calendar-stats') + ' วันว่างของทีม</button>'
      + (canEdit() ? '<button type="button" class="srv-tab' + (_tab === 'settings' ? ' on' : '') + '" onclick="window.srvTab(\'settings\')">' + window.appIcon('settings') + ' ตั้งค่า</button>' : '')
      + '</div><div style="flex:1"></div>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.srvCopyPublic(this)" title="ส่งลิงก์นี้ให้คนนอกทีมกรอกคำขอ">' + window.appIcon('link') + ' คัดลอกลิงก์ฟอร์มขอ</button>'
      + '<a class="btn btn-pri btn-sm" href="server-request.html?new=1" target="_blank" rel="noopener">' + window.appIcon('plus') + ' กรอกคำขอแทน</a>'
      + '</div>'
      + '<div class="srv-body" id="srv-body"></div></div>';
    if (_tab === 'settings') renderSettings();
    else if (_tab === 'calendar') renderCalendar();
    else renderList();
    updateBadge();
  };
  window.srvTab = function (t) { _tab = t; window.renderServerRequest(); };
  window.srvCopyPublic = function (btn) {
    var url = publicUrl() + '?new=1';
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

  function renderList() {
    var body = document.getElementById('srv-body');
    var t = todayIso();
    var counts = { '': REQS.length, _active: 0, _soon: 0 };
    REQS.forEach(function (r) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (isActive(r, t)) counts._active++;
      if (isSoon(r, t)) counts._soon++;
    });
    var n = _q.trim().toLowerCase();
    var list = REQS.filter(function (r) {
      if (_filter === '_active') { if (!isActive(r, t)) return false; }
      else if (_filter === '_soon') { if (!isSoon(r, t)) return false; }
      else if (_filter && r.status !== _filter) return false;
      if (!n) return true;
      return [r.reqNo, r.requesterName, r.requesterTeam, hospLabel(r), r.itName, r.itPhone, tasksText(r).join(' '),
        r.assignees.map(function (a) { return staffShort(a.sid); }).join(' ')].join(' ').toLowerCase().indexOf(n) >= 0;
    });
    if (_sort === 'start') list.sort(function (a, b) {
      // งานที่ยังเปิดอยู่ขึ้นก่อน เรียงวันเริ่มใกล้สุด · ที่ปิดแล้วเรียงล่าสุดก่อน
      var oa = OPEN_ST.indexOf(a.status) >= 0, ob = OPEN_ST.indexOf(b.status) >= 0;
      if (oa !== ob) return oa ? -1 : 1;
      return oa ? (a.start || '').localeCompare(b.start || '') : (b.start || '').localeCompare(a.start || '');
    });

    var kpi = function (key, icon, label, color, sub) {
      return '<button type="button" class="srv-kpi' + (_filter === key ? ' on' : '') + '" style="--st:' + color + '" onclick="window.srvFilter(\'' + key + '\')">'
        + '<span class="srv-kpi-ic">' + window.appIcon(icon) + '</span>'
        + '<span class="srv-kpi-tx"><b>' + (counts[key] || 0) + '</b><span>' + label + '</span><small>' + sub + '</small></span></button>';
    };
    var chips = [''].concat(Object.keys(window.SRV_STATUS)).map(function (st) {
      var m = window.SRV_STATUS[st];
      return '<button type="button" class="srv-chip' + (_filter === st ? ' on' : '') + '"' + (m ? ' style="--st:' + m.color + '"' : '')
        + ' onclick="window.srvFilter(\'' + st + '\')">' + (m ? '<i class="srv-dot2"></i>' + esc(m.label) : 'ทั้งหมด') + ' <b>' + (counts[st] || 0) + '</b></button>';
    }).join('');
    var fLabel = _filter === '_active' ? 'กำลังดำเนินการวันนี้' : _filter === '_soon' ? 'เริ่มภายใน 7 วัน' : '';

    body.innerHTML = '<div class="srv-kpis">'
      + kpi('pending', 'hourglass', 'รออนุมัติ', window.SRV_STATUS.pending.color, 'รอ DM/PM พิจารณา')
      + kpi('approved', 'users-plus', 'รอจัดคน', window.SRV_STATUS.approved.color, 'อนุมัติแล้ว ยังไม่ระบุตัวคน')
      + kpi('_active', 'tools', 'กำลังดำเนินการ', '#0f9d6e', 'ทีมอยู่หน้างานวันนี้')
      + kpi('_soon', 'calendar-time', 'เริ่มภายใน 7 วัน', '#e5484d', 'งานที่ใกล้ถึงวันเริ่ม')
      + '</div>'
      + '<div class="srv-bar">'
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
      + '<div class="srv-filter-row"><span class="srv-filter-label">สถานะ</span><div class="srv-chips-row">' + chips + '</div></div></div>'
      + (fLabel ? '<div class="srv-fnote">กรอง: <b>' + fLabel + '</b> <button type="button" class="srv-ib" onclick="window.srvFilter(\'\')">✕ ล้าง</button></div>' : '')
      + (!list.length
        ? '<div class="srv-empty"><div class="srv-empty-ic">' + window.appIcon(REQS.length ? 'search-off' : 'server') + '</div>'
          + (REQS.length ? 'ไม่มีคำขอที่ตรงกับเงื่อนไข' : 'ยังไม่มีคำขอ — กด <b>คัดลอกลิงก์ฟอร์มขอ</b> แล้วส่งให้ทีมที่ต้องการใช้งาน') + '</div>'
        : _mode === 'table' ? tableHtml(list)
        : '<div class="srv-list">' + list.map(cardHtml).join('') + '</div>');
  }
  window.srvFilter = function (st) { _filter = (_filter === st && st.charAt(0) === '_') ? '' : st; renderList(); };
  window.srvSort = function (v) { _sort = v; renderList(); };
  window.srvMode = function (v) { _mode = v; try { localStorage.setItem('srv_list_mode', v); } catch (e) { /* ignore */ } renderList(); };
  window.srvSearch = function (v) {
    _q = v; renderList();
    var i = document.querySelector('.srv-q'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
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
  function row(label, val) {
    return '<div class="srv-dl"><div>' + esc(label) + '</div><div>' + (val || '<span class="srv-muted">-</span>') + '</div></div>';
  }

  window.srvOpen = function (id) {
    var r = byId(id);
    if (!r) { window.showAlert('ไม่พบคำขอนี้ (อาจถูกลบแล้ว)', 'warn'); return; }
    var m = modal('m-srv-view', 'lg');
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
    acts.push('<button class="btn btn-ghost" onclick="window.closeM(\'m-srv-view\')">ปิด</button>');

    var timeline = [['ส่งคำขอ', r.createdAt, r.requesterName]];
    if (r.decidedAt) timeline.push([r.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติ', r.decidedAt, window.userNameById(r.decidedById)]);
    if (r.assignedAt) timeline.push(['จัดคน', r.assignedAt, window.userNameById(r.assignedById)]);

    m.querySelector('.modal').innerHTML = head('server', 'คำขอ ' + esc(r.reqNo) + ' ' + stBadge(r.status), 'm-srv-view')
      + '<div class="m-body">'
      + '<div class="srv-sec">ข้อมูลงาน</div>'
      + row('โรงพยาบาล', esc(hospLabel(r)))
      + row('ช่วงวันที่', range(r.start, r.end) + ' <span class="srv-muted">(' + days(r.start, r.end) + ' วัน)</span>')
      + row('จำนวนคนที่ต้องการ', r.headcount + ' คน')
      + row('ประเภทการทำงาน', esc(optLabel(r.workModeId)))
      + row('ฐานข้อมูล', esc(optLabel(r.dbTypeId)))
      + row('รายละเอียดงาน', tasksText(r).map(function (t) { return '• ' + esc(t); }).join('<br>'))
      + row('ช่วงที่ต้องการใช้งาน', esc(optLabel(r.phaseId)))
      + row('หมายเหตุ', esc(r.note).replace(/\n/g, '<br>'))
      + '<div class="srv-sec">ผู้ติดต่อ</div>'
      + row('ผู้ขอ', esc(r.requesterName) + (r.requesterTeam ? ' · ' + esc(r.requesterTeam) : ''))
      + row('IT ของ รพ.', esc(r.itName) + (r.itPhone ? ' · <a href="tel:' + esc(r.itPhone) + '">' + esc(r.itPhone) + '</a>' : ''))
      + (r.assignees.length || r.decisionNote ? '<div class="srv-sec">ผลการพิจารณา</div>' : '')
      + (r.decisionNote ? row('หมายเหตุผู้อนุมัติ', esc(r.decisionNote)) : '')
      + (r.assignees.length ? row('ผู้รับงาน', r.assignees.map(function (a) { return '<b>' + esc(staffShort(a.sid)) + '</b> ' + range(a.s, a.e); }).join('<br>')) : '')
      + (proj ? row('โครงการ', '<a href="javascript:void(0)" onclick="window.closeM(\'m-srv-view\');window.goView(\'projects\');setTimeout(function(){window.openProjModal&&window.openProjModal(\'' + esc(proj.id) + '\')},300)">' + esc(proj.name) + '</a>') : '')
      + '<div class="srv-sec">ประวัติ</div>'
      + '<div class="srv-tl">' + timeline.map(function (t) {
          return '<div><b>' + esc(t[0]) + '</b> · ' + fd(t[1]) + ' ' + esc(String(t[1]).slice(11, 16)) + (t[2] ? ' · ' + esc(t[2]) : '') + '</div>';
        }).join('') + '</div>'
      + row('ลิงก์ติดตามของผู้ขอ', '<a href="' + esc(publicUrl(r.token)) + '" target="_blank" rel="noopener">เปิดหน้าติดตาม</a>')
      + '</div>'
      + '<div class="m-foot srv-foot">' + acts.join('') + '</div>';
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
    var rows = _asg.rows.slice().sort(function (a, b) {
      return (b.on - a.on) || (busyScore(a, r) - busyScore(b, r)) || staffShort(a.sid).localeCompare(staffShort(b.sid), 'th');
    });
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
  function renderCalendar() {
    var body = document.getElementById('srv-body');
    if (!_calMonth) _calMonth = window.srvIso(new Date()).slice(0, 7);
    var y = Number(_calMonth.slice(0, 4)), m = Number(_calMonth.slice(5, 7));
    var lg = function (cls, label) { return '<span class="srv-lg"><i class="srv-tl-c ' + cls + '"></i>' + label + '</span>'; };
    body.innerHTML = '<div class="srv-bar">'
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
    // แถวรายคน
    html += shown.map(function (s) {
      var nFree = days.filter(function (d) { var x = map[d]; return !x.busy[s.id] && !x.holiday && !x.weekend; }).length;
      return row('', '<b>' + esc(staffShort(s.id)) + '</b><small>' + esc(s.name || '') + ' · ว่าง ' + nFree + ' วัน</small>', days.map(function (d) {
        var x = map[d], k = x.busy[s.id] || (x.holiday || x.weekend ? 'off' : 'free');
        var tip = staffShort(s.id) + ' · ' + fd(d) + ' · ' + (k === 'free' ? 'ว่าง' : k === 'off' ? 'วันหยุด' : (x.why[s.id] || []).join(', '));
        return '<div class="srv-tl-c ' + k + (d === today ? ' today' : '') + '" title="' + esc(tip) + '"></div>';
      }).join(''));
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

})();
