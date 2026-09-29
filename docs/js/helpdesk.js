/**
 * helpdesk.js — Helpdesk (ศูนย์ช่วยเหลือ) UI
 * โมดูล 'helpdesk' — คิวงาน / ของฉัน / แดชบอร์ด + หน้ารายละเอียด Ticket + modal "+ แจ้งแทน"
 * เก็บเฉพาะปัญหาลูกค้า (โรงพยาบาล) · หน้า public = docs/help.html
 */
const { esc, fd, fca, pd, gSt } = window;

// ── helpers ─────────────────────────────────────────────────────────────
function hdStatus(id) { return (window.HD_STATUS || []).find(function (s) { return s.id === id; }) || { id: id, label: id, color: '#9ba3b8', icon: '•', open: true }; }
function hdPri(id)    { return (window.HD_PRIORITY || []).find(function (p) { return p.id === id; }) || { id: id, short: id, label: id, color: '#9ba3b8' }; }
function hdCat(id)    { return (window.HELPDESK_CATEGORIES || []).find(function (c) { return c.id === id; }) || null; }
function hdHosp(id)   { return (window.HOSPITALS || []).find(function (h) { return h.id === id; }) || null; }

// ปุ่ม "โทรด่วน" (Jitsi) + แจ้งเตือนทีมงาน — trigger ที่ priority ของความเร่งด่วน "ทำงานไม่ได้เลย" (blocked)
// อ่านจาก window.HD_URGENCY สด ๆ (merge override ของ Admin แล้ว) แทนที่จะ hardcode 'p2' ตรง ๆ
function hdCriticalPriority() {
  var u = (window.HD_URGENCY || []).find(function (x) { return x.id === 'blocked'; });
  return (u && u.priority) || 'p2';
}
function hdJitsiUrl(ticketNo) { return 'https://jitsi1.hosxp.net/' + encodeURIComponent(ticketNo); }

function hdDT(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d)) return '-';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' +
    (d.getFullYear() + 543) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// P0: ไม่มี cron — คำนวณ "เกิน SLA" สด ๆ ฝั่ง client (open + เลย resolution_due)
function hdOverdue(t) {
  return hdStatus(t.status).open && t.resolutionDue && new Date(t.resolutionDue) < new Date();
}

// นาฬิกา SLA: คืน { txt, cls } เทียบ due กับตอนนี้ (นับเฉพาะ ticket ที่ยัง open)
function hdSlaCell(t) {
  var st = hdStatus(t.status);
  if (!st.open || !t.resolutionDue) {
    if (t.resolutionBreached) return { txt: 'เกิน SLA', cls: 'bad' };
    return { txt: '—', cls: 'neu' };
  }
  var diffMs = new Date(t.resolutionDue) - new Date();
  var over = diffMs < 0;
  var mins = Math.round(Math.abs(diffMs) / 60000);
  var h = Math.floor(mins / 60), m = mins % 60;
  var txt = (h >= 24 ? Math.floor(h / 24) + ' วัน ' + (h % 24) + ' ชม.' : h + ':' + String(m).padStart(2, '0') + ' ชม.');
  if (over) return { txt: '−' + txt, cls: 'bad' };
  if (diffMs < 0.2 * (new Date(t.resolutionDue) - new Date(t.createdAt || t.resolutionDue))) return { txt: txt, cls: 'warn' };
  return { txt: txt, cls: 'ok' };
}

function hdPublicUrl(t) {
  try { return new URL('help.html?t=' + encodeURIComponent(t.accessToken), window.location.href).href; }
  catch (e) { return 'help.html?t=' + t.accessToken; }
}

function hdCopy(text, okMsg) {
  function done() { window.showAlert && window.showAlert(okMsg || 'คัดลอกแล้ว', 'success'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { window.prompt('คัดลอกข้อความนี้:', text); });
  } else { window.prompt('คัดลอกข้อความนี้:', text); }
}
window.hdCopyLink = function (id) {
  var t = (window.HELPDESK_TICKETS || []).find(function (x) { return x.id === id; });
  if (t) hdCopy(hdPublicUrl(t), 'คัดลอกลิงก์แล้ว');
};
window.hdCopyMsg = function (id) {
  var t = (window.HELPDESK_TICKETS || []).find(function (x) { return x.id === id; });
  if (!t) return;
  var msg = 'รับเรื่องแล้วครับ เลขที่ ' + t.ticketNo + '\nติดตามสถานะ/ให้ข้อมูลเพิ่มได้ที่ ' + hdPublicUrl(t);
  hdCopy(msg, 'คัดลอกข้อความแล้ว');
};

// ── ลิงก์ฟอร์มสาธารณะ (ลูกค้าแจ้งเอง) + QR ────────────────────────────
function hdPublicFormUrl() {
  try { return new URL('help.html?new=1', window.location.href).href; }
  catch (e) { return 'help.html?new=1'; }
}
window.hdCopyPublicFormLink = function () { hdCopy(hdPublicFormUrl(), 'คัดลอกลิงก์ฟอร์มแล้ว'); };

window.hdShowPublicFormLink = function () {
  var url = hdPublicFormUrl();
  var body = document.getElementById('m-hd-link-body');
  if (!body) return;
  body.innerHTML =
    '<p style="font-size:12.5px;color:var(--txt2);margin:0 0 12px;">ส่งลิงก์นี้ให้ลูกค้าแจ้งปัญหาเอง (ไม่ต้อง login) หรือปริ้น QR แปะที่ รพ.</p>'
    + '<input class="f-input" style="text-align:center;font-size:12px;" readonly value="' + esc(url) + '" onclick="this.select()">'
    + '<div id="hd-link-qr" style="display:flex;justify-content:center;margin:16px 0 6px;"></div>'
    + '<a href="' + esc(url) + '" target="_blank" style="font-size:12px;color:var(--violet);font-weight:600;">เปิดหน้าฟอร์ม ↗</a>';
  var qrBox = document.getElementById('hd-link-qr');
  qrBox.innerHTML = '';
  if (window.QRCode) {
    try { new window.QRCode(qrBox, { text: url, width: 190, height: 190, correctLevel: window.QRCode.CorrectLevel.M }); }
    catch (e) { qrBox.textContent = 'สร้าง QR ไม่สำเร็จ'; }
  } else {
    qrBox.innerHTML = '<span style="font-size:11px;color:var(--txt3);">(โหลด QR ไม่ได้ — ใช้ลิงก์ด้านบน)</span>';
  }
  window.openM('m-hd-link');
};

// ── main render ─────────────────────────────────────────────────────────
window.renderHelpdesk = function () {
  if (window.canView && !window.canView('helpdesk')) return;
  var root = document.getElementById('view-helpdesk');
  if (!root) return;

  if (window.hdOpenId) {
    var t = (window.HELPDESK_TICKETS || []).find(function (x) { return x.id === window.hdOpenId; });
    if (t) { hdRenderDetail(root, t); return; }
    window.hdOpenId = null;
  }
  hdRenderList(root);
};

window.hdGo = function (tab) { window.hdTab = tab; window.hdOpenId = null; window.hdPage = 1; window.renderHelpdesk(); };
window.hdOpen = function (id) { window.hdOpenId = id; window.renderHelpdesk(); };
window.hdBack = function () { window.hdOpenId = null; window.renderHelpdesk(); };

// ── LIST (queue / mine / dashboard) ────────────────────────────────────
function hdRenderList(root) {
  var tab = window.hdTab || 'queue';
  var canAdd = window.canAdd && window.canAdd('helpdesk');
  var tabs = [
    { id: 'queue', label: 'คิวงาน' },
    { id: 'mine', label: 'ของฉัน' },
    { id: 'dashboard', label: 'แดชบอร์ด' },
  ];
  var tabsHtml = tabs.map(function (x) {
    return '<button class="af-tab' + (tab === x.id ? ' on' : '') + '" onclick="window.hdGo(\'' + x.id + '\')">' + x.label + '</button>';
  }).join('');

  var body = '';
  if (tab === 'dashboard') body = hdDashboardHtml();
  else body = hdQueueHtml(tab === 'mine');

  root.innerHTML =
    '<div class="af-tabs" style="position:sticky;top:0;z-index:11;background:var(--surface);border-bottom:1px solid var(--border);padding:0 20px;display:flex;gap:4px;align-items:center;">'
    + tabsHtml
    + '<div style="flex:1"></div>'
    + (canAdd ? '<button class="btn btn-ghost btn-sm" style="margin:6px 6px 6px 0;" onclick="window.hdShowPublicFormLink()">🔗 ลิงก์ฟอร์มแจ้งเอง</button>' : '')
    + (canAdd ? '<button class="btn btn-pri btn-sm" style="margin:6px 0;" onclick="window.hdOpenModal(null)">+ แจ้งแทน</button>' : '')
    + '</div>'
    + '<div id="hd-body">' + body + '</div>';

  if (tab === 'dashboard') hdRenderCharts();
}

function hdFiltered(mineOnly) {
  var f = window.hdFilter || {};
  var meId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  return (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (mineOnly) { if (!meId || t.assigneeId !== meId) return false; }
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee && t.assigneeId !== f.assignee) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.q) {
      var q = f.q.toLowerCase();
      var hay = (t.ticketNo + ' ' + t.subject + ' ' + t.description + ' ' + t.reporterName + ' ' +
        ((hdHosp(t.hospitalId) || {}).name || '')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

function hdQueueHtml(mineOnly) {
  var f = window.hdFilter || {};
  var rows = hdFiltered(mineOnly);
  // เรียงตามเลขที่แจ้ง (ticketNo) จากมากไปน้อย — ล่าสุดขึ้นก่อน
  rows.sort(function (a, b) { return (b.ticketNo || '').localeCompare(a.ticketNo || ''); });

  var all = window.HELPDESK_TICKETS || [];
  var openCnt = all.filter(function (t) { return hdStatus(t.status).open; }).length;
  var todayStr = new Date().toISOString().slice(0, 10);
  var newToday = all.filter(function (t) { return (t.createdAt || '').slice(0, 10) === todayStr; }).length;
  var breach = all.filter(hdOverdue).length;
  var pending = all.filter(function (t) { return t.status === 'pending_user'; }).length;

  var staffOpts = '<option value="">ผู้รับผิดชอบ: ทั้งหมด</option>' + (window.STAFF || []).filter(function (s) { return s.active; })
    .map(function (s) { return '<option value="' + s.id + '"' + (f.assignee === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
  var catOpts = '<option value="">หมวด: ทั้งหมด</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '"' + (f.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  var stOpts = '<option value="">สถานะ: ทั้งหมด</option>' + (window.HD_STATUS || [])
    .map(function (s) { return '<option value="' + s.id + '"' + (f.status === s.id ? ' selected' : '') + '>' + s.icon + ' ' + s.label + '</option>'; }).join('');
  var prOpts = '<option value="">Priority: ทั้งหมด</option>' + (window.HD_PRIORITY || [])
    .map(function (p) { return '<option value="' + p.id + '"' + (f.priority === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  var pageSize = window.hdPageSize || 50;
  var pageSizeOpts = [50, 100, 500, 1000].map(function (n) { return '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' แถว/หน้า</option>'; }).join('');

  var toolbar =
    '<div class="toolbar" style="position:sticky;top:0;z-index:10;background:var(--surface);flex-wrap:wrap;">'
    + '<div class="t-search"><input id="hd-q" placeholder="ค้นหา เลขที่ / หัวข้อ / ผู้แจ้ง / รพ." value="' + esc(f.q || '') + '" oninput="window.hdSetFilter(\'q\',this.value)"></div>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'status\',this.value)">' + stOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'priority\',this.value)">' + prOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'assignee\',this.value)">' + staffOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'category\',this.value)">' + catOpts + '</select>'
    + '<div style="flex:1"></div>'
    + '<select class="t-sel" onchange="window.hdSetPageSize(this.value)">' + pageSizeOpts + '</select>'
    + '</div>';

  var summary =
    '<div style="display:flex;gap:12px;padding:12px 24px;background:var(--bg);flex-wrap:wrap;font-size:12px;">'
    + '<span>เข้าใหม่วันนี้ <b>' + newToday + '</b></span>'
    + '<span>เปิดค้าง <b>' + openCnt + '</b></span>'
    + '<span style="color:var(--coral);">เกิน SLA <b>' + breach + '</b></span>'
    + '<span style="color:var(--amber);">รอผู้แจ้ง <b>' + pending + '</b></span>'
    + '</div>';

  var totalRows = rows.length;
  var totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  window.hdPage = Math.min(Math.max(1, window.hdPage || 1), totalPages);
  var page = window.hdPage;
  var pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  var trs = pageRows.map(function (t, i) {
    var st = hdStatus(t.status), pr = hdPri(t.priority), sla = hdSlaCell(t);
    var h = hdHosp(t.hospitalId);
    var rowBg = sla.cls === 'bad' ? 'background:rgba(229,72,77,.06);' : sla.cls === 'warn' ? 'background:rgba(201,130,12,.06);' : '';
    return '<tr style="cursor:pointer;' + rowBg + '" onclick="window.hdOpen(\'' + t.id + '\')">'
      + '<td style="font-size:12px;color:var(--txt3);">' + ((page - 1) * pageSize + i + 1) + '</td>'
      + '<td style="white-space:nowrap;font-family:var(--mono,monospace);font-size:12px;">' + esc(t.ticketNo) + '</td>'
      + '<td style="max-width:360px;white-space:normal;">' + esc(t.description || '(ไม่มีรายละเอียด)') + '</td>'
      + '<td style="font-size:12px;">' + esc((h && h.name) || '-') + (t.reporterName ? '<br><span style="color:var(--txt3)">' + esc(t.reporterName) + '</span>' : '') + '</td>'
      + '<td><span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span></td>'
      + '<td><span class="hd-pill" style="color:' + st.color + ';background:' + st.color + '1e;">' + st.icon + ' ' + esc(st.label) + '</span></td>'
      + '<td style="font-size:12px;">' + esc((gSt(t.assigneeId) || {}).name || (t.assigneeId ? '?' : '—')) + '</td>'
      + '<td><span class="hd-pill hd-' + sla.cls + '">' + esc(sla.txt) + '</span></td>'
      + '<td style="font-size:11px;color:var(--txt3);white-space:nowrap;">' + hdDT(t.updatedAt || t.createdAt) + '</td>'
      + '</tr>';
  }).join('');

  var table =
    '<div class="dtable-wrap" style="padding:0 12px 28px;"><div class="dtable-inner"><table style="min-width:900px;">'
    + '<thead><tr>'
    + '<th>ลำดับ</th><th>เลขที่</th><th>รายละเอียด</th><th>รพ. / ผู้แจ้ง</th><th>Priority</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>SLA คงเหลือ</th><th>อัปเดตล่าสุด</th>'
    + '</tr></thead><tbody>' + (trs || '<tr><td colspan="9" style="text-align:center;color:var(--txt3);padding:40px;">ไม่มี Ticket</td></tr>') + '</tbody></table></div></div>';

  var pager = totalPages > 1
    ? '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:0 24px 24px;">'
      + '<span style="font-size:12px;color:var(--txt3);">หน้า ' + page + ' / ' + totalPages + ' (ทั้งหมด ' + totalRows + ' รายการ)</span>'
      + '<button class="btn btn-ghost btn-sm"' + (page <= 1 ? ' disabled' : '') + ' onclick="window.hdGoPage(-1)">← ย้อนกลับ</button>'
      + '<button class="btn btn-ghost btn-sm"' + (page >= totalPages ? ' disabled' : '') + ' onclick="window.hdGoPage(1)">ถัดไป →</button>'
      + '</div>'
    : '';

  return toolbar + summary + table + pager;
}

window.hdSetPageSize = function (val) {
  window.hdPageSize = parseInt(val, 10) || 50;
  window.hdPage = 1;
  var b = document.getElementById('hd-body');
  if (b) b.innerHTML = hdQueueHtml((window.hdTab || 'queue') === 'mine');
};

window.hdGoPage = function (delta) {
  window.hdPage = (window.hdPage || 1) + delta;
  var b = document.getElementById('hd-body');
  if (b) b.innerHTML = hdQueueHtml((window.hdTab || 'queue') === 'mine');
};

window.hdSetFilter = function (key, val) {
  window.hdFilter = window.hdFilter || {};
  window.hdFilter[key] = val;
  window.hdPage = 1;
  var b = document.getElementById('hd-body');
  if (b) b.innerHTML = hdQueueHtml((window.hdTab || 'queue') === 'mine');
  if (key === 'q') { var i = document.getElementById('hd-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
};

// ── DETAIL ─────────────────────────────────────────────────────────────
function hdRenderDetail(root, t) {
  var canEdit = window.canEdit && window.canEdit('helpdesk');
  var st = hdStatus(t.status), pr = hdPri(t.priority), h = hdHosp(t.hospitalId);

  var stSel = (window.HD_STATUS || []).map(function (s) { return '<option value="' + s.id + '"' + (t.status === s.id ? ' selected' : '') + '>' + s.icon + ' ' + s.label + '</option>'; }).join('');
  var prSel = (window.HD_PRIORITY || []).map(function (p) { return '<option value="' + p.id + '"' + (t.priority === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  var asSel = '<option value="">— ยังไม่มอบหมาย —</option>' + (window.STAFF || []).filter(function (s) { return s.active; })
    .map(function (s) { return '<option value="' + s.id + '"' + (t.assigneeId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
  var catSel = '<option value="">— ไม่ระบุ —</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '"' + (t.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');

  var dis = canEdit ? '' : ' disabled';
  var sla = hdSlaCell(t);

  root.innerHTML =
    '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:10;">'
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdBack()">← คิวงาน</button>'
    + '<b style="font-family:var(--mono,monospace);">' + esc(t.ticketNo) + '</b>'
    + '<span class="hd-pill" style="color:' + st.color + ';background:' + st.color + '1e;">' + st.icon + ' ' + esc(st.label) + '</span>'
    + '<span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span>'
    + '<div style="flex:1"></div>'
    + (canEdit ? '<button class="btn btn-ghost btn-sm" onclick="window.hdAiRunDetail(\'' + t.id + '\',this)">🤖 AI วิเคราะห์</button>' : '')
    + (t.priority === hdCriticalPriority() ? '<button class="btn btn-pri btn-sm" style="background:var(--coral,#e5484d)" onclick="window.open(\'' + hdJitsiUrl(t.ticketNo) + '\',\'_blank\')">📞 เข้าร่วมสาย</button>' : '')
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdCopyLink(\'' + t.id + '\')">🔗 คัดลอกลิงก์</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdCopyMsg(\'' + t.id + '\')">📋 คัดลอกข้อความ</button>'
    + '</div>'
    + '<div id="hd-ai-detail" style="padding:0 20px;"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 320px;gap:16px;padding:16px 20px 32px;align-items:start;" class="hd-detail-grid">'
    //  LEFT
    + '<div>'
    + '<div class="ov-card" style="margin-bottom:14px;">'
    + '<div class="ov-card-title">รายละเอียดปัญหา</div>'
    + '<div class="hd-desc-card">' + esc(t.description || '(ไม่มีรายละเอียด)') + '</div>'
    + '</div>'
    + '<div class="ov-card"><div class="ov-card-title">💬 บทสนทนา / ไทม์ไลน์</div><ul id="hd-events" class="hd-tl" style="max-height:none;"><li class="who">กำลังโหลด...</li></ul>'
    + (canEdit
      ? '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">'
      + '<textarea id="hd-reply" rows="3" class="f-input" style="width:100%;resize:vertical;" placeholder="พิมพ์ข้อความ..."></textarea>'
      + '<div style="margin-top:6px;">' + window.attPickerHtml('hd-reply-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT }) + '</div>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin:6px 0;color:var(--txt2);"><input type="checkbox" id="hd-reply-internal"> โน้ตภายใน (ไม่แสดงให้ผู้แจ้งเห็น)</label>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button class="btn btn-pri btn-sm" onclick="window.hdSendReply(\'' + t.id + '\',null)">ส่ง</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.hdSendReply(\'' + t.id + '\',\'pending_user\')">ส่ง + ตั้งเป็นรอผู้แจ้ง</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.hdSendReply(\'' + t.id + '\',\'resolved\')">ส่ง + ปิดงาน (resolved)</button>'
      + '<div style="flex:1"></div>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.hdAiDraftReplyRun(\'' + t.id + '\',this)" title="ให้ AI ร่างข้อความตอบผู้แจ้งจากรายละเอียดและบทสนทนา">🤖 ร่างข้อความตอบ</button>'
      + '</div></div>'
      : '')
    + '</div>'
    + '</div>'
    //  RIGHT
    + '<div class="ov-card">'
    + '<div class="ov-card-title">ข้อมูล Ticket</div>'
    + '<div class="hd-field-grid">'
    + '<div><label class="hd-lbl">สถานะ</label><select class="t-sel hd-sel-tinted" style="width:100%;color:' + st.color + ';border-color:' + st.color + '55;background:' + st.color + '14;" onchange="window.hdSetField(\'' + t.id + '\',\'status\',this.value)"' + dis + '>' + stSel + '</select></div>'
    + '<div><label class="hd-lbl">Priority</label><select class="t-sel hd-sel-tinted" style="width:100%;color:' + pr.color + ';border-color:' + pr.color + '55;background:' + pr.color + '14;" onchange="window.hdSetField(\'' + t.id + '\',\'priority\',this.value)"' + dis + '>' + prSel + '</select></div>'
    + '<div><label class="hd-lbl">ผู้รับผิดชอบ</label><select class="t-sel" style="width:100%" onchange="window.hdSetField(\'' + t.id + '\',\'assigneeId\',this.value)"' + dis + '>' + asSel + '</select></div>'
    + '<div><label class="hd-lbl">หมวดปัญหา</label><select class="t-sel" style="width:100%" onchange="window.hdSetField(\'' + t.id + '\',\'categoryId\',this.value)"' + dis + '>' + catSel + '</select></div>'
    + '</div>'
    + '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0 12px;">'
    + '<div class="ov-card-title" style="margin-bottom:10px;">⏱ นาฬิกา SLA</div>'
    + '<div class="hd-info-grid">'
    + '<div class="full"><div class="k">ตอบครั้งแรก</div><div class="v">' + (t.firstResponseAt ? '<span class="hd-pill hd-ok">ตอบแล้ว ' + hdDT(t.firstResponseAt) + '</span>' : (t.firstResponseDue ? 'ครบกำหนด ' + hdDT(t.firstResponseDue) : '-')) + '</div></div>'
    + '<div class="full"><div class="k">ปิดงาน</div><div class="v"><span class="hd-pill hd-' + sla.cls + '">' + esc(sla.txt) + '</span>' + (t.resolutionDue ? ' <span style="color:var(--txt3)">(' + hdDT(t.resolutionDue) + ')</span>' : '') + '</div></div>'
    + '</div>'
    + '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0 12px;">'
    + '<div class="ov-card-title" style="margin-bottom:10px;">👤 ผู้แจ้ง</div>'
    + '<div class="hd-info-grid">'
    + '<div class="full"><div class="k">ชื่อ / ติดต่อ</div><div class="v">' + esc(t.reporterName || '-') + (t.reporterPhone ? ' · ' + esc(t.reporterPhone) : '') + '</div></div>'
    + '<div class="full"><div class="k">โรงพยาบาล</div><div class="v">' + esc((h && h.name) || '-') + '</div></div>'
    + (t.sourceSystem ? '<div><div class="k">ระบบ</div><div class="v">' + esc(t.sourceSystem) + '</div></div>' : '')
    + '<div><div class="k">ช่องทาง</div><div class="v">' + esc(((window.HD_CHANNEL || []).find(function (c) { return c.id === t.channel; }) || { label: t.channel }).label) + '</div></div>'
    + (t.lineGroupRef ? '<div class="full"><div class="k">กลุ่ม LINE</div><div class="v">' + esc(t.lineGroupRef) + '</div></div>' : '')
    + '<div><div class="k">แจ้งเมื่อ</div><div class="v">' + hdDT(t.createdAt) + '</div></div>'
    + (t.csatScore != null ? '<div><div class="k">คะแนน CSAT</div><div class="v"><b>' + t.csatScore + '/5</b></div></div>' : '')
    + '</div>'
    + (canEdit && (window.canDel && window.canDel('helpdesk')) ? '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0 12px;"><button class="btn btn-ghost btn-sm" style="color:var(--coral)" onclick="window.hdDelete(\'' + t.id + '\')">ลบ Ticket</button>' : '')
    + '</div>'
    + '</div>';

  if (canEdit) window.attPickerInit('hd-reply-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT });
  hdLoadEvents(t);
}

function hdAttachHtml(list) {
  if (!list || !list.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">' + list.map(function (a) {
    if (window.hdIsImage && window.hdIsImage(a.mime, a.file_name)) {
      return '<a href="' + esc(a.file_url) + '" target="_blank" title="' + esc(a.file_name) + '">'
        + '<img src="' + esc(a.file_url) + '" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"></a>';
    }
    var kb = a.size_bytes ? ' · ' + Math.max(1, Math.round(a.size_bytes / 1024)) + ' KB' : '';
    return '<a href="' + esc(a.file_url) + '" target="_blank" style="font-size:12px;color:var(--violet);border:1px solid var(--border);border-radius:8px;padding:4px 10px;">📎 ' + esc(a.file_name) + kb + '</a>';
  }).join('') + '</div>';
}

async function hdLoadEvents(t) {
  var box = document.getElementById('hd-events');
  if (!box) return;
  var evs = await window.hdFetchEvents(t.id, true); // ฝั่งทีมเห็นโน้ตภายในด้วย
  var atts = await window.hdFetchAttachments(t.id);
  if (!document.getElementById('hd-events')) return;
  var byEvent = {};
  (atts || []).forEach(function (a) { (byEvent[a.event_id || ''] = byEvent[a.event_id || ''] || []).push(a); });
  if (!evs.length && !atts.length) { box.innerHTML = '<li class="who" style="padding-top:0;">ยังไม่มีความเคลื่อนไหว</li>'; return; }
  var html = evs.map(function (e) {
    var meta = (window.HD_EVENT_TYPE || {})[e.type] || { icon: '•' };
    var who = e.actor_type === 'reporter' ? 'ผู้แจ้ง' : e.actor_type === 'system' ? 'ระบบ' : ((gSt(e.actor_id) || {}).name || 'ทีมงาน');
    var intern = e.is_internal ? ' <span class="hd-pill hd-warn">ภายใน</span>' : '';
    var bodyTxt = e.type === 'status_change' && e.meta ? ('เปลี่ยนสถานะ ' + (hdStatus(e.meta.from).label || e.meta.from || '') + ' → ' + (hdStatus(e.meta.to).label || e.meta.to || '')) : (e.body || '');
    return '<li><div class="ic">' + meta.icon + '</div><div class="who"><b>' + esc(who) + '</b>' + intern + ' · ' + hdDT(e.created_at) + '</div>'
      + '<div class="body">' + esc(bodyTxt) + '</div>'
      + hdAttachHtml(byEvent[e.id])
      + '</li>';
  }).join('');
  if (byEvent['']) html += '<li><div class="ic">📎</div><div class="who">ไฟล์แนบ</div>' + hdAttachHtml(byEvent['']) + '</li>';
  box.innerHTML = html;
}

// ── writes ─────────────────────────────────────────────────────────────
// ตาม pattern เดิมของระบบ (leave.js): เขียนทั้ง row เสมอผ่าน setDoc (upsert) ไม่ทำ partial patch
function hdTicket(id) { return (window.HELPDESK_TICKETS || []).find(function (x) { return x.id === id; }); }

function hdRawFromObj(t) {
  return {
    id: t.id, ticket_no: t.ticketNo, channel: t.channel, hospital_id: t.hospitalId,
    reporter_name: t.reporterName, reporter_phone: t.reporterPhone, reporter_email: t.reporterEmail,
    reporter_position: t.reporterPosition, reporter_dept: t.reporterDept, line_group_ref: t.lineGroupRef,
    source_system: t.sourceSystem, category_id: t.categoryId, subject: t.subject, description: t.description,
    priority: t.priority, status: t.status, assignee_id: t.assigneeId, team: t.team, sla_policy_id: t.slaPolicyId,
    first_response_at: t.firstResponseAt || null, first_response_due: t.firstResponseDue || null,
    resolution_due: t.resolutionDue || null, resolved_at: t.resolvedAt || null, closed_at: t.closedAt || null,
    pending_since: t.pendingSince || null, pending_total_mins: t.pendingTotalMins,
    frt_breached: t.frtBreached, resolution_breached: t.resolutionBreached, reopened_count: t.reopenedCount,
    csat_score: t.csatScore, access_token: t.accessToken, public_view_expires_at: t.publicViewExpiresAt || null,
    rated_at: t.ratedAt || null, tags: t.tags, created_by: t.createdBy, created_at: t.createdAt,
  };
}

// เขียน row เต็ม (current + patchRaw) + event (ถ้ามี)
async function hdWriteFull(id, patchRaw, evt) {
  var t = hdTicket(id); if (!t) return;
  var full = Object.assign(hdRawFromObj(t), patchRaw || {}, { updated_at: new Date().toISOString() });
  try {
    await window.setDoc(window.getDocRef('HELPDESK_TICKETS', id), full);
    window.hdApplyLocal(id, full);
    if (evt) await window.hdAddEvent(id, evt);
    window.renderHelpdesk();
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
}

// เปลี่ยนสถานะ → คืน raw patch + event (ไม่เขียน DB เอง)
function hdTransition(t, val) {
  var patch = { status: val };
  var now = new Date().toISOString();
  if (val === 'resolved' && !t.resolvedAt) {
    patch.resolved_at = now;
    var exp = new Date(); exp.setDate(exp.getDate() + 30);
    patch.public_view_expires_at = exp.toISOString();
  }
  if (val === 'closed' && !t.closedAt) patch.closed_at = now;
  if (val === 'reopened') { patch.reopened_count = (t.reopenedCount || 0) + 1; patch.resolved_at = null; patch.closed_at = null; }
  if (val === 'pending_user' && !t.pendingSince) patch.pending_since = now;
  if (t.status === 'pending_user' && val !== 'pending_user' && t.pendingSince) {
    var add = Math.max(0, Math.round((Date.now() - new Date(t.pendingSince)) / 60000));
    patch.pending_total_mins = (t.pendingTotalMins || 0) + add;
    patch.pending_since = null;
    if (t.resolutionDue) patch.resolution_due = new Date(new Date(t.resolutionDue).getTime() + add * 60000).toISOString();
  }
  return { patch: patch, evt: { type: 'status_change', meta: { from: t.status, to: val } } };
}

window.hdSetField = function (id, field, val) {
  var t = hdTicket(id); if (!t) return;
  if (field === 'status') {
    if (val === t.status) return;
    var tr = hdTransition(t, val);
    return hdWriteFull(id, tr.patch, tr.evt);
  }
  if (field === 'priority') {
    var due = window.hdCalcDue(val, t.createdAt);
    return hdWriteFull(id, {
      priority: val,
      sla_policy_id: due.slaPolicyId,
      first_response_due: t.firstResponseAt ? (t.firstResponseDue || null) : due.firstResponseDue,
      resolution_due: due.resolutionDue,
      resolution_breached: false,
    }, { type: 'field_change', body: 'ปรับ Priority เป็น ' + hdPri(val).short });
  }
  if (field === 'assigneeId') {
    var p = { assignee_id: val };
    if (val && t.status === 'new') p.status = 'assigned';
    return hdWriteFull(id, p, { type: 'assignment', body: val ? ('มอบหมายให้ ' + ((gSt(val) || {}).name || '')) : 'ยกเลิกการมอบหมาย' });
  }
  if (field === 'categoryId') {
    return hdWriteFull(id, { category_id: val }, { type: 'field_change', body: 'ปรับหมวดปัญหา' });
  }
};

window.hdSendReply = async function (id, thenStatus) {
  var ta = document.getElementById('hd-reply');
  var internalCb = document.getElementById('hd-reply-internal');
  var files = window.attPickerFiles('hd-reply-files');
  var txt = (ta && ta.value || '').trim();
  var t = hdTicket(id); if (!t) return;
  if (!txt && !files.length && !thenStatus) { window.showAlert && window.showAlert('พิมพ์ข้อความ หรือแนบไฟล์ก่อน', 'warn'); return; }
  var isInternal = !!(internalCb && internalCb.checked);
  try {
    if (txt || files.length) {
      var ev = await window.hdAddEvent(id, {
        type: 'comment', actorType: 'agent',
        actorId: (window.cu && (window.cu.staffId || window.cu.staff_id)) || '',
        body: txt || '(แนบไฟล์)', isInternal: isInternal,
      });
      var by = (window.cu && (window.cu.name || window.cu.username)) || '';
      for (var fi = 0; fi < files.length; fi++) {
        try { await window.hdUploadFile(id, ev.id, files[fi], by); }
        catch (ue) { window.showAlert && window.showAlert(String(ue.message || ue), 'warn'); }
      }
    }
    var patch = {};
    var evt = null;
    if (!t.firstResponseAt && !isInternal && (txt || files.length)) patch.first_response_at = new Date().toISOString();
    if (thenStatus && thenStatus !== t.status) {
      var tr = hdTransition(t, thenStatus);
      Object.assign(patch, tr.patch);
      evt = tr.evt;
    }
    if (Object.keys(patch).length) await hdWriteFull(id, patch, evt);
    else window.renderHelpdesk();
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
};

window.hdDelete = function (id) {
  var t = hdTicket(id); if (!t) return;
  window.showConfirm('ลบ Ticket ' + t.ticketNo + ' ?', async function () {
    try {
      await window.deleteDoc(window.getDocRef('HELPDESK_TICKETS', id));
      window.hdRemoveLocal(id);
      window.hdOpenId = null;
      window.renderHelpdesk();
    } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
  }, { icon: '⚠️', title: 'ยืนยันการลบ', okColor: 'var(--coral)', okText: 'ลบ' });
};

// ── Searchable Combobox: เลือก "โรงพยาบาล" จาก window.HOSPITALS (พิมพ์ค้นหาหรือคลิกเลือก) —
// pattern เดียวกับ _initImtProjCombobox/_initImtStaffCombobox ใน impl-tracker.js แต่ไม่ต้อง guard กันผูก
// event ซ้ำ เพราะ modal "+ แจ้งแทน" rebuild #m-hd-body ใหม่ทุกครั้งที่เปิด (DOM element ใหม่เสมอ) ──
window._initHdHospCombobox = (function () {
  var IH = 34;
  function hi(txt, q) {
    if (!q) return esc(txt);
    var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
    while (i < txt.length) {
      var x = lt.indexOf(lq, i);
      if (x < 0) { out += esc(txt.slice(i)); break; }
      out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
      i = x + lq.length;
    }
    return out;
  }
  return function (curId) {
    var inp = document.getElementById('hdf-hosp-cmb-input'), drop = document.getElementById('hdf-hosp-cmb-drop'),
      lst = document.getElementById('hdf-hosp-cmb-list'), hid = document.getElementById('hdf-hosp');
    if (!inp || !drop || !lst || !hid) return;
    var items = (window.HOSPITALS || []).slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'th'); })
      .map(function (h) { return { id: h.id, label: (h.code ? h.code + ' ' : '') + h.name }; });
    var selId = curId || '', q = '', fi = -1, flat = [], dt = null, isOpen = false;
    var initItem = items.find(function (it) { return it.id === selId; });
    var selLabel = initItem ? initItem.label : '';
    function bFlat(sq) {
      var f = [], lq = sq.toLowerCase();
      items.forEach(function (it) { if (!sq || it.label.toLowerCase().indexOf(lq) !== -1) f.push(it); });
      return f;
    }
    function render() {
      if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบโรงพยาบาล' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
      lst.innerHTML = flat.map(function (it, idx) {
        var foc = idx === fi, isSel = it.id === selId;
        return '<div class="hdhc-i" data-id="' + esc(it.id) + '" data-label="' + esc(it.label) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">'
          + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
          + hi(it.label, q) + '</div>';
      }).join('');
    }
    function positionDrop() {
      var r = inp.getBoundingClientRect();
      var availH = window.innerHeight - r.bottom - 16;
      drop.style.position = 'fixed';
      drop.style.top = (r.bottom + 4) + 'px';
      drop.style.left = r.left + 'px';
      drop.style.width = r.width + 'px';
      lst.style.maxHeight = Math.max(140, Math.min(280, availH)) + 'px';
    }
    // scroll listener ต้อง capture:true เพราะ scroll ไม่ bubble — จับ scroll ของ .m-body (โมดัลสูงเกินจอ
    // เลื่อนเนื้อหาในตัวเอง) ที่ครอบ input นี้อยู่ด้วย ไม่งั้น dropdown position:fixed จะค้างตำแหน่งเดิม
    // หลุดจาก input ทันทีที่เลื่อนโมดัล (เจอบ่อยบนมือถือที่ฟิลด์เยอะจนต้องเลื่อน) ──
    function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selLabel; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
    function selItem(id, label) { selId = id; selLabel = label; hid.value = id; inp.classList.remove('hd-invalid'); closeDrop(); hid.dispatchEvent(new Event('change')); }
    lst.addEventListener('click', function (e) { var it = e.target.closest('.hdhc-i'); if (it) selItem(it.dataset.id, it.dataset.label); });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.hdhc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrop(); return; }
      if (e.key === 'Tab') { closeDrop(); return; }
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].id, flat[fi].label); }
    });
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('hdf-hosp-cmb-wrap'); if (wrap && !wrap.contains(e.target) && !drop.contains(e.target)) { closeDrop(); document.removeEventListener('mousedown', onOut); } });
    inp.value = selLabel; flat = bFlat(''); render();
  };
})();

// ── Markup ของ combobox "โรงพยาบาล" ──
function hdHospComboMarkup(hiddenValue) {
  return '<div id="hdf-hosp-cmb-wrap" style="position:relative;">'
    + '<input id="hdf-hosp-cmb-input" type="text" class="f-input" placeholder="พิมพ์ค้นหาชื่อโรงพยาบาล..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
    + '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
    + '<input type="hidden" id="hdf-hosp" value="' + esc(hiddenValue || '') + '">'
    + '<div id="hdf-hosp-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
    + '<div id="hdf-hosp-cmb-list" style="max-height:280px;overflow-y:auto;"></div>'
    + '</div>'
    + '</div>';
}

// ── กลุ่ม Product — รายชื่อเดียวกับที่ใช้ใน admin.js (แท็บ "📦 Product") และ hospital.js
// (HSP_PROD_GROUPS) แต่ละไฟล์เก็บสำเนาตัวเองตาม convention เดิมของโปรเจกต์ ──
var HD_SYS_GRP = [
  { id: 'his_front',    label: 'HIS Front Office',  color: '#2563eb' },
  { id: 'his_back',     label: 'HIS Back Office',   color: '#7c3aed' },
  { id: 'interconnect', label: 'Interconnection',   color: '#0891b2' },
  { id: 'application',  label: 'Application',       color: '#059669' },
  { id: 'smart',        label: 'Smart Hospital',    color: '#d97706' },
];

// ── Searchable Combobox: เลือก "ระบบที่ใช้งาน" จาก window.HSP_PRODUCTS (คลัง Product เดิม) —
// พิมพ์ค้นหาได้เหมือนโรงพยาบาล + จัดกลุ่มตามกลุ่ม Product (พับ/กางกลุ่มได้) แบบเดียวกับ
// _initImtProjCombobox ใน impl-tracker.js ที่จัดกลุ่มตามประเภทงาน — hidden field เก็บ "ชื่อ Product"
// ตรง ๆ (ไม่ใช่ id) เพราะ source_system ในตาราง tickets เป็น free-text ตามชื่อที่เลือก ──
window._initHdSysCombobox = (function () {
  var IH = 34, HH = 28;
  function hi(txt, q) {
    if (!q) return esc(txt);
    var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
    while (i < txt.length) {
      var x = lt.indexOf(lq, i);
      if (x < 0) { out += esc(txt.slice(i)); break; }
      out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
      i = x + lq.length;
    }
    return out;
  }
  return function (curName) {
    var inp = document.getElementById('hdf-sys-cmb-input'), drop = document.getElementById('hdf-sys-cmb-drop'),
      lst = document.getElementById('hdf-sys-cmb-list'), hid = document.getElementById('hdf-sys');
    if (!inp || !drop || !lst || !hid) return;
    var gmap = {}, gord = [];
    HD_SYS_GRP.forEach(function (g) { gmap[g.id] = { id: g.id, label: g.label, color: g.color, items: [] }; gord.push(g.id); });
    (window.HSP_PRODUCTS || []).forEach(function (p) {
      var gid = gmap[p.group] ? p.group : '__x__';
      if (!gmap[gid]) { gmap[gid] = { id: gid, label: 'อื่น ๆ', color: 'var(--txt3)', items: [] }; gord.push(gid); }
      gmap[gid].items.push(p);
    });
    gord = gord.filter(function (gid) { return gmap[gid] && gmap[gid].items.length > 0; });
    gord.forEach(function (gid) { gmap[gid].items.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'th'); }); });
    var selName = curName || '', col = new Set(), q = '', fi = -1, flat = [], dt = null, isOpen = false;
    function bFlat(sq) {
      var f = [], lq = sq.toLowerCase();
      if (sq) {
        (window.HSP_PRODUCTS || []).forEach(function (p) { if ((p.name || '').toLowerCase().indexOf(lq) !== -1) f.push({ k: 'i', name: p.name }); });
      } else {
        gord.forEach(function (gid) {
          var g = gmap[gid]; if (!g || !g.items.length) return;
          f.push({ k: 'h', gid: gid, label: g.label, color: g.color, count: g.items.length });
          if (!col.has(gid)) g.items.forEach(function (p) { f.push({ k: 'i', name: p.name }); });
        });
      }
      return f;
    }
    function render() {
      if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบระบบ' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
      lst.innerHTML = flat.map(function (it, idx) {
        if (it.k === 'h') {
          var cc = col.has(it.gid);
          return '<div class="hdsc-h" data-gid="' + esc(it.gid) + '" style="height:' + HH + 'px;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;font-size:10px;font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);color:' + it.color + ';user-select:none;">'
            + '<span style="width:7px;height:7px;border-radius:50%;background:' + it.color + ';flex-shrink:0;display:inline-block;"></span>'
            + '<span>' + esc(it.label) + '</span><span style="font-size:9px;color:var(--txt3);margin-left:2px;">(' + it.count + ')</span>'
            + '<span style="margin-left:auto;font-size:9px;opacity:.5;">' + (cc ? '▶' : '▼') + '</span></div>';
        }
        var foc = idx === fi, isSel = it.name === selName;
        return '<div class="hdsc-i" data-name="' + esc(it.name) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">'
          + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
          + hi(it.name, q) + '</div>';
      }).join('');
    }
    function positionDrop() {
      var r = inp.getBoundingClientRect();
      var availH = window.innerHeight - r.bottom - 16;
      drop.style.position = 'fixed';
      drop.style.top = (r.bottom + 4) + 'px';
      drop.style.left = r.left + 'px';
      drop.style.width = r.width + 'px';
      lst.style.maxHeight = Math.max(140, Math.min(300, availH)) + 'px';
    }
    // scroll listener ต้อง capture:true เพราะ scroll ไม่ bubble — จับ scroll ของ .m-body ที่ครอบ input
    // นี้อยู่ด้วย (ดูคอมเมนต์เดียวกันใน _initHdHospCombobox ด้านบน) ──
    function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
    function selItem(name) { selName = name; hid.value = name; closeDrop(); hid.dispatchEvent(new Event('change')); }
    lst.addEventListener('click', function (e) {
      var h = e.target.closest('.hdsc-h'), it = e.target.closest('.hdsc-i');
      if (h) { var gid = h.dataset.gid; if (col.has(gid)) col.delete(gid); else col.add(gid); flat = bFlat(q); fi = -1; render(); }
      else if (it) selItem(it.dataset.name);
    });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.hdsc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      var iis = flat.map(function (it, i) { return it.k === 'i' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (e.key === 'Escape') { closeDrop(); return; }
      if (e.key === 'Tab') { closeDrop(); return; }
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); var ci = iis.indexOf(fi); fi = ci < 0 ? iis[0] : (iis[ci + 1] !== undefined ? iis[ci + 1] : iis[ci]); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); var ci2 = iis.indexOf(fi); fi = ci2 <= 0 ? iis[0] : iis[ci2 - 1]; render(); }
      else if (e.key === 'Enter') { e.preventDefault(); var it2 = flat[fi]; if (it2 && it2.k === 'i') selItem(it2.name); }
    });
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('hdf-sys-cmb-wrap'); if (wrap && !wrap.contains(e.target) && !drop.contains(e.target)) { closeDrop(); document.removeEventListener('mousedown', onOut); } });
    inp.value = selName; flat = bFlat(''); render();
  };
})();

// ── Markup ของ combobox "ระบบที่ใช้งาน" ──
function hdSysComboMarkup(hiddenValue) {
  return '<div id="hdf-sys-cmb-wrap" style="position:relative;">'
    + '<input id="hdf-sys-cmb-input" type="text" class="f-input" placeholder="พิมพ์ค้นหาระบบที่ใช้งาน..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
    + '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
    + '<input type="hidden" id="hdf-sys" value="' + esc(hiddenValue || '') + '">'
    + '<div id="hdf-sys-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
    + '<div id="hdf-sys-cmb-list" style="max-height:300px;overflow-y:auto;"></div>'
    + '</div>'
    + '</div>';
}

// ── MODAL "+ แจ้งแทน" ──────────────────────────────────────────────────
window.hdOpenModal = function (id) {
  window.hdEditId = id || null;
  var t = id ? hdTicket(id) : null;
  var catOpts = '<option value="">--เลือกหมวดปัญหา--</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '" data-pri="' + c.defaultPriority + '"' + (t && t.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  // ความเร่งด่วนเรียงจาก Priority ต่ำสุดมาก่อน (ป้องกันเลือก default เป็นเคสด่วนโดยไม่ตั้งใจ) — ค่าแรกในลิสต์ = ค่า default
  var urgSorted = (window.HD_URGENCY || []).slice().sort(function (a, b) { return parseInt(b.priority.slice(1), 10) - parseInt(a.priority.slice(1), 10); });
  var defaultUrgPriority = urgSorted.length ? urgSorted[0].priority : 'p4';
  var urgOpts = urgSorted.map(function (u, i) { return '<option value="' + u.priority + '"' + (i === 0 ? ' selected' : '') + '>' + esc(u.label) + '</option>'; }).join('');
  var priSorted = (window.HD_PRIORITY || []).slice().sort(function (a, b) { return parseInt(b.id.slice(1), 10) - parseInt(a.id.slice(1), 10); });
  var prOpts = priSorted.map(function (p) { return '<option value="' + p.id + '"' + ((t ? t.priority : defaultUrgPriority) === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  var curStaffId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  var defaultAssignee = t ? (t.assigneeId || '') : curStaffId; // ticket ใหม่ default มอบหมายให้คน Login เอง (แสดงชื่อจริง) / แก้ไข ticket คงค่าเดิมไว้
  var asOpts = '<option value=""' + (defaultAssignee === '' ? ' selected' : '') + '>— ยังไม่มอบหมาย —</option>'
    + (window.STAFF || []).filter(function (s) { return s.active; }).map(function (s) { return '<option value="' + s.id + '"' + (defaultAssignee === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');

  var full = ' style="grid-column:span 2"';
  var catUrg = t
    ? '<div class="f-group"' + full + '><label class="f-label">หมวดปัญหา <span class="hd-req">*</span></label><select id="hdf-cat" class="f-input" onchange="window.hdModalCatChange()">' + catOpts + '</select></div>'
    : '<div class="f-group"><label class="f-label">หมวดปัญหา <span class="hd-req">*</span></label><select id="hdf-cat" class="f-input" onchange="window.hdModalCatChange()">' + catOpts + '</select></div>'
      + '<div class="f-group"><label class="f-label">ความเร่งด่วน (ผู้แจ้งบอก) <span class="hd-req">*</span></label><select id="hdf-urg" class="f-input" onchange="window.hdModalUrgChange()">' + urgOpts + '</select></div>';

  document.getElementById('m-hd-title').textContent = t ? ('แก้ไข ' + t.ticketNo) : '+ แจ้งแทนลูกค้า (จาก LINE)';
  document.getElementById('m-hd-body').innerHTML =
    '<div class="f-grid">'
    + '<div class="f-group"' + full + '><label class="f-label">โรงพยาบาล <span class="hd-req">*</span></label>' + hdHospComboMarkup(t ? t.hospitalId : '') + '</div>'
    + '<div class="f-group"><label class="f-label">กลุ่ม LINE ที่แจ้งเข้ามา</label><input id="hdf-line" class="f-input" value="' + esc(t ? t.lineGroupRef : '') + '"></div>'
    + '<div class="f-group"><label class="f-label">ระบบที่ใช้งาน <span class="hd-req">*</span></label>' + hdSysComboMarkup(t ? t.sourceSystem : '') + '</div>'
    + '<div class="f-group"><label class="f-label">ชื่อผู้แจ้ง <span class="hd-req">*</span></label><input id="hdf-name" class="f-input" value="' + esc(t ? t.reporterName : '') + '"></div>'
    + '<div class="f-group"><label class="f-label">เบอร์ / LINE (ถ้ามี)</label><input id="hdf-phone" class="f-input" value="' + esc(t ? t.reporterPhone : '') + '"></div>'
    + '<div class="f-group"' + full + '><label class="f-label">รายละเอียดปัญหา <span class="hd-req">*</span> <span style="color:var(--txt3);font-weight:400">(วางข้อความจากแชตได้เลย)</span></label><textarea id="hdf-desc" rows="3" class="f-input">' + esc(t ? t.description : '') + '</textarea>'
      + '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="window.hdAiRunModal(this)">🤖 AI วิเคราะห์ (หมวด / Priority / แนวทางแก้)</button>'
      + '<div id="hdf-ai-out"></div></div>'
    // หมวด/ความเร่งด่วน อยู่ใต้รายละเอียด — กด AI วิเคราะห์แล้วเติมให้อัตโนมัติ (ดู hdAiAutoFillModal)
    + catUrg
    + '<div class="f-group"><label class="f-label">Priority</label><select id="hdf-pri" class="f-input">' + prOpts + '</select></div>'
    + '<div class="f-group"><label class="f-label">ผู้รับผิดชอบ <span class="hd-req">*</span></label><select id="hdf-assignee" class="f-input">' + asOpts + '</select></div>'
    + (t ? '' : '<div class="f-group"' + full + '><label class="f-label">แนบไฟล์ / รูป <span style="color:var(--txt3);font-weight:400">(เลือกได้หลายไฟล์)</span></label>'
      + window.attPickerHtml('hdf-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT }) + '</div>')
    + '</div>';

  window.openM('m-hd');
  window._initHdHospCombobox(t ? t.hospitalId : '');
  window._initHdSysCombobox(t ? t.sourceSystem : '');
  if (!t) window.attPickerInit('hdf-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT });
};
// ── เติมหมวด → ความเร่งด่วน → Priority จากผล AI (ลำดับสำคัญ: เลือกหมวด/เร่งด่วน จะตั้ง Priority ตามค่าตั้งต้นของมันเอง
// จึงตั้ง Priority ของ AI เป็นลำดับสุดท้ายให้ชนะ) ──
function hdAiAutoFillModal(s) {
  var cat = document.getElementById('hdf-cat'), urg = document.getElementById('hdf-urg'), pri = document.getElementById('hdf-pri');
  if (cat && s.categoryId) { cat.value = s.categoryId; window.hdModalCatChange(); window.aiFlagField(cat, cat.value === s.categoryId); }
  if (urg && s.priority && Array.prototype.some.call(urg.options, function (o) { return o.value === s.priority; })) { urg.value = s.priority; window.aiFlagField(urg, true); }
  if (pri && s.priority) { pri.value = s.priority; window.aiFlagField(pri, pri.value === s.priority); }
}
window.hdModalCatChange = function () {
  var sel = document.getElementById('hdf-cat');
  var pri = sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].getAttribute('data-pri');
  if (pri) { var p = document.getElementById('hdf-pri'); if (p) p.value = pri; window.aiFlagField(p, false); }
};
window.hdModalUrgChange = function () {
  var u = document.getElementById('hdf-urg');
  if (u && u.value) { var p = document.getElementById('hdf-pri'); if (p) p.value = u.value; window.aiFlagField(p, false); }
};

function hdMarkInvalid(el, bad) {
  if (!el) return;
  el.classList.toggle('hd-invalid', !!bad);
  if (bad && !el._hdInvBound) { el._hdInvBound = 1; el.addEventListener('input', function () { el.classList.remove('hd-invalid'); }); el.addEventListener('change', function () { el.classList.remove('hd-invalid'); }); }
}

window.hdSaveTicket = async function () {
  var hospEl = document.getElementById('hdf-hosp'), hospVisEl = document.getElementById('hdf-hosp-cmb-input'), descEl = document.getElementById('hdf-desc');
  var nameEl = document.getElementById('hdf-name'), catEl = document.getElementById('hdf-cat'), urgEl = document.getElementById('hdf-urg');
  var sysEl = document.getElementById('hdf-sys'), sysVisEl = document.getElementById('hdf-sys-cmb-input'), assigneeEl = document.getElementById('hdf-assignee');
  var hosp = (hospEl || {}).value || '';
  var desc = ((descEl || {}).value || '').trim();
  var reporterName = ((nameEl || {}).value || '').trim();
  var categoryId = (catEl || {}).value || '';
  var sourceSystem = (sysEl || {}).value || '';
  var assignee = (assigneeEl || {}).value || '';
  var miss = [];
  hdMarkInvalid(hospVisEl, !hosp); if (!hosp) miss.push(hospVisEl);
  hdMarkInvalid(nameEl, !reporterName); if (!reporterName) miss.push(nameEl);
  hdMarkInvalid(catEl, !categoryId); if (!categoryId) miss.push(catEl);
  if (urgEl) { hdMarkInvalid(urgEl, !urgEl.value); if (!urgEl.value) miss.push(urgEl); }
  hdMarkInvalid(sysVisEl, !sourceSystem); if (!sourceSystem) miss.push(sysVisEl);
  hdMarkInvalid(assigneeEl, !assignee); if (!assignee) miss.push(assigneeEl);
  hdMarkInvalid(descEl, !desc); if (!desc) miss.push(descEl);
  if (miss.length) {
    window.showAlert && window.showAlert('กรุณากรอกข้อมูลที่จำเป็น (มี * สีแดง) ให้ครบ', 'warn');
    if (miss[0] && miss[0].focus) miss[0].focus();
    return;
  }
  var priority = (document.getElementById('hdf-pri') || {}).value || 'p3';
  var subject = desc.slice(0, 60);

  var common = {
    hospital_id: hosp,
    line_group_ref: ((document.getElementById('hdf-line') || {}).value || '').trim(),
    reporter_name: reporterName,
    reporter_phone: ((document.getElementById('hdf-phone') || {}).value || '').trim(),
    source_system: sourceSystem,
    category_id: categoryId,
    subject: subject,
    description: desc,
    priority: priority,
    assignee_id: assignee,
    updated_at: new Date().toISOString(),
  };

  try {
    if (window.hdEditId) {
      var ex = hdTicket(window.hdEditId);
      if (!ex) { window.closeM('m-hd'); return; }
      var full = Object.assign(hdRawFromObj(ex), common);
      await window.setDoc(window.getDocRef('HELPDESK_TICKETS', window.hdEditId), full);
      window.hdApplyLocal(window.hdEditId, full);
      await window.hdAddEvent(window.hdEditId, { type: 'field_change', body: 'แก้ไขข้อมูล Ticket' });
      window.closeM('m-hd');
      window.renderHelpdesk();
      return;
    }
    var id = window.hdUid();
    var nowIso = new Date().toISOString();
    var due = window.hdCalcDue(priority, nowIso);
    var row = Object.assign({
      id: id,
      ticket_no: window.hdGenTicketNo(),
      channel: 'line',
      status: assignee ? 'assigned' : 'new',
      access_token: window.hdGenToken(),
      sla_policy_id: due.slaPolicyId,
      first_response_due: due.firstResponseDue,
      resolution_due: due.resolutionDue,
      reopened_count: 0,
      pending_total_mins: 0,
      frt_breached: false,
      resolution_breached: false,
      tags: [],
      created_by: (window.cu && (window.cu.staffId || window.cu.staff_id)) || (window.cu && window.cu.id) || '',
      created_at: nowIso,
    }, common);

    await window.setDoc(window.getDocRef('HELPDESK_TICKETS', id), row);
    window.hdApplyLocal(id, row);
    var sysEv = await window.hdAddEvent(id, { type: 'system', actorType: 'system', body: 'สร้าง Ticket จากช่องทาง LINE' });
    if (assignee) await window.hdAddEvent(id, { type: 'assignment', body: 'มอบหมายให้ ' + ((gSt(assignee) || {}).name || '') });
    if (priority === hdCriticalPriority() && window.sendHdUrgentNotify) {
      var hName = (hdHosp(hosp) || {}).name || '-';
      window.sendHdUrgentNotify(
        '🔴 **ตั๋วด่วนที่สุด — ทำงานไม่ได้เลย**'
        + '\n🎫 เลขที่: **' + row.ticket_no + '**'
        + '\n🏢 โรงพยาบาล: ' + hName
        + '\n👤 ผู้แจ้ง: ' + (reporterName || '-') + (common.reporter_phone ? ' · ' + common.reporter_phone : '')
        + '\n📝 ' + desc.slice(0, 200)
        + '\n📞 เข้าร่วมคุยสด: ' + hdJitsiUrl(row.ticket_no)
      );
    }

    var newFiles = window.attPickerFiles('hdf-files');
    if (newFiles.length) {
      var by = (window.cu && (window.cu.name || window.cu.username)) || '';
      for (var fi = 0; fi < newFiles.length; fi++) {
        try { await window.hdUploadFile(id, sysEv.id, newFiles[fi], by); }
        catch (ue) { window.showAlert && window.showAlert(String(ue.message || ue), 'warn'); }
      }
    }

    window.closeM('m-hd');
    window.hdOpenId = id;
    window.renderHelpdesk();

    var t = hdTicket(id);
    window.showConfirm('สร้าง Ticket ' + row.ticket_no + ' แล้ว — คัดลอกข้อความ + ลิงก์ไปวางในกลุ่ม LINE?', function () {
      window.hdCopyMsg(id);
    }, { icon: '✅', title: 'สำเร็จ', okText: 'คัดลอกข้อความ + ลิงก์', cancelText: 'ไว้ทีหลัง' });
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
};

// ── AI ร่างข้อความตอบผู้แจ้ง — วางลงช่องตอบกลับ (ปลดติ๊ก "โน้ตภายใน") ให้เจ้าหน้าที่ตรวจ/แก้ก่อนกดส่งเอง ──
window.hdAiDraftReplyRun = async function (id, btn) {
  var t = hdTicket(id); if (!t) return;
  var ta = document.getElementById('hd-reply'); if (!ta) return;
  if (ta.value.trim() && !confirm('ช่องข้อความมีข้อความอยู่แล้ว — แทนที่ด้วยร่างจาก AI?')) return;
  var oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังร่าง...'; }
  try {
    var evs = await window.hdFetchEvents(t.id, true);
    var last = window._hdAiLast;
    var hint = last && last.ticketId === id ? last.resolutionHint : '';
    ta.value = await window.hdAiDraftReply(t, evs, hint);
    var cb = document.getElementById('hd-reply-internal'); if (cb) cb.checked = false;
    ta.focus();
    window.showAlert && window.showAlert('ร่างข้อความแล้ว — ตรวจทาน/แก้ไขก่อนกดส่ง', 'success');
  } catch (e) {
    window.showAlert && window.showAlert(String(e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
  }
};

// ── AI ช่วยวิเคราะห์ (ตัวเรียก AI กลาง: src/services/ai.service.js) ────────────────
window._hdAiLast = null;

function hdAiCardHtml(sug, mode) {
  var conf = { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' }[sug.confidence] || sug.confidence || '-';
  var cat = (window.HELPDESK_CATEGORIES || []).find(function (c) { return c.id === sug.categoryId; });
  var pr = sug.priority ? hdPri(sug.priority) : null;
  var rows = '';
  // ฟอร์มแจ้งแทนลูกค้า (modal) เติมหมวด/Priority ให้อัตโนมัติแล้ว — แสดงป้าย "เติมให้แล้ว" แทนปุ่ม "ใช้ค่านี้"
  var useBtn = function (field) {
    return mode === 'modal' ? '<span class="ai-use" style="color:var(--teal);font-size:11.5px;font-weight:700;">✓ เติมให้แล้ว</span>'
      : '<button class="btn btn-ghost btn-sm ai-use" onclick="window.hdAiApply(\'' + mode + '\',\'' + field + '\')">ใช้ค่านี้</button>';
  };
  rows += '<div class="ai-row"><span>หมวด: <b>' + esc(cat ? cat.name : '— AI ไม่แน่ใจ —') + '</b></span>' + (cat ? useBtn('cat') : '') + '</div>';
  rows += '<div class="ai-row"><span>Priority: <b>' + esc(pr ? pr.label : '— AI ไม่แน่ใจ —') + '</b></span>' + (pr ? useBtn('pri') : '') + '</div>';
  if (sug.resolutionHint) {
    rows += '<div class="ai-row" style="align-items:flex-start;"><span>แนวทางแก้ไข: ' + esc(sug.resolutionHint) + '</span>'
      + '<button class="btn btn-ghost btn-sm ai-use" onclick="window.hdAiApply(\'' + mode + '\',\'fix\')">' + (mode === 'modal' ? 'คัดลอก' : 'ใส่โน้ตภายใน') + '</button></div>';
  }
  // แบบย่อ 1 บรรทัด (หมวด · Priority) กด "ดูเพิ่มเติม" เพื่อดูแนวทางแก้/เหตุผล/ปุ่มใช้ค่า
  return window.aiSuggestHtml({
    title: 'AI',
    summary: [cat ? esc(cat.name) : '', pr ? esc(pr.short || pr.label) : ''].filter(Boolean).join(' · ')
      + (mode === 'modal' && (cat || pr) ? ' <span style="color:var(--teal);">✓ เติมให้แล้ว</span>' : '')
      || '<span style="color:var(--txt3);">ไม่แน่ใจหมวด/Priority</span>',
    body: '<div style="color:var(--txt3);font-size:11px;margin:4px 0;">ความมั่นใจ ' + esc(conf) + (sug.similarCount ? ' · อ้างอิงงานเก่า ' + sug.similarCount + ' รายการ' : '') + '</div>'
      + rows
      + (sug.reason ? '<div style="font-size:11px;color:var(--txt3);margin-top:4px;">เหตุผล: ' + esc(sug.reason) + '</div>' : '')
      + '<div style="font-size:10.5px;color:var(--txt3);margin-top:4px;">* AI ช่วยแนะนำเท่านั้น เจ้าหน้าที่ตรวจสอบก่อนใช้เสมอ</div>',
  });
}

async function hdAiCommon(desc, hospId, sourceSystem, outEl, mode, btn) {
  if (!outEl) return;
  var oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังวิเคราะห์...'; }
  outEl.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0;">⏳ กำลังวิเคราะห์...</div>';
  try {
    var h = hospId ? hdHosp(hospId) : null;
    var sug = await window.hdAiAnalyze({ description: desc, hospitalName: h && h.name, sourceSystem: sourceSystem });
    sug.ticketId = mode === 'modal' ? '' : mode; // ให้ปุ่ม "ร่างข้อความตอบ" ใช้แนวทางแก้เฉพาะของ Ticket เดียวกัน
    window._hdAiLast = sug;
    if (mode === 'modal') hdAiAutoFillModal(sug);
    outEl.innerHTML = hdAiCardHtml(sug, mode);
  } catch (e) {
    outEl.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
  }
}

window.hdAiRunModal = function (btn) {
  var desc = ((document.getElementById('hdf-desc') || {}).value || '').trim();
  if (!desc) { window.showAlert && window.showAlert('กรอกรายละเอียดปัญหาก่อน', 'warn'); return; }
  hdAiCommon(desc, (document.getElementById('hdf-hosp') || {}).value || '',
    (document.getElementById('hdf-sys') || {}).value || '',
    document.getElementById('hdf-ai-out'), 'modal', btn);
};

window.hdAiRunDetail = function (id, btn) {
  var t = hdTicket(id); if (!t) return;
  hdAiCommon(t.description || t.subject || '', t.hospitalId, t.sourceSystem,
    document.getElementById('hd-ai-detail'), id, btn);
};

window.hdAiApply = function (mode, field) {
  var s = window._hdAiLast; if (!s) return;
  if (mode === 'modal') { // หมวด/Priority เติมอัตโนมัติแล้ว (hdAiAutoFillModal) — เหลือแค่คัดลอกแนวทางแก้
    if (field === 'fix' && s.resolutionHint) hdCopy(s.resolutionHint, 'คัดลอกแนวทางแก้ไขแล้ว');
    return;
  }
  // mode = ticket id (หน้ารายละเอียด)
  var id = mode;
  if (field === 'cat' && s.categoryId) window.hdSetField(id, 'categoryId', s.categoryId);
  else if (field === 'pri' && s.priority) window.hdSetField(id, 'priority', s.priority);
  else if (field === 'fix' && s.resolutionHint) {
    var ta = document.getElementById('hd-reply'), cb = document.getElementById('hd-reply-internal');
    if (ta) { ta.value = (ta.value ? ta.value + '\n' : '') + 'แนวทางแก้ไข (AI): ' + s.resolutionHint; ta.focus(); }
    if (cb) cb.checked = true;
  }
};

// ── DASHBOARD ──────────────────────────────────────────────────────────
// การเลือกสีกราฟยึดตาม skill "dataviz": magnitude-across-categories (จัดอันดับหมวด/
// ผู้รับผิดชอบ/รพ.) ใช้ hue เดียวต่อกราฟ (sequential) — ไม่ใช่หลายสีต่อแท่งเพราะแกนมีชื่อกำกับ
// อยู่แล้ว ส่วน "เข้า vs ปิด" เป็น 2 series ต้องแยกตัวตนจริงจึงใช้คู่สี categorical ที่ผ่านการ
// เช็ค CVD/contrast แล้ว (indigo/aqua) Priority ใช้สีที่ Admin ตั้งไว้เอง (เหมือนกันทุกจุดในแอป)
// อายุ Ticket ค้างใช้โทนสถานะ teal→amber→coral ของแอปเอง (ไล่ระดับความเร่งด่วน) ──
function hdIsDark() {
  var cur = document.documentElement.getAttribute('data-theme');
  return cur === 'dark' || (cur !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function hdHexA(hex, a) {
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  var n = parseInt(h, 16);
  if (isNaN(n) || h.length !== 6) return hex;
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function hdDashboardHtml() {
  var all = window.HELPDESK_TICKETS || [];
  var open = all.filter(function (t) { return hdStatus(t.status).open; });
  var now = Date.now();
  var wk = all.filter(function (t) { return now - new Date(t.createdAt || 0) < 7 * 864e5; });
  var wkPrev = all.filter(function (t) { var age = now - new Date(t.createdAt || 0); return age >= 7 * 864e5 && age < 14 * 864e5; });
  var closedWk = all.filter(function (t) { return t.resolvedAt && now - new Date(t.resolvedAt) < 30 * 864e5; });
  var breach = open.filter(hdOverdue).length;

  function avgMins(list, a, b) {
    var v = list.map(function (t) { return (new Date(t[b]) - new Date(t[a])) / 60000; }).filter(function (n) { return n > 0 && isFinite(n); });
    if (!v.length) return null;
    return v.reduce(function (s, n) { return s + n; }, 0) / v.length;
  }
  function fmtDur(min) {
    if (min == null) return '—';
    if (min < 60) return Math.round(min) + ' นาที';
    if (min < 1440) return (min / 60).toFixed(1) + ' ชม.';
    return (min / 1440).toFixed(1) + ' วัน';
  }
  var frt = avgMins(all.filter(function (t) { return t.firstResponseAt; }), 'createdAt', 'firstResponseAt');
  var mttr = avgMins(closedWk, 'createdAt', 'resolvedAt');
  var withRating = all.filter(function (t) { return t.csatScore != null; });
  var csatNum = withRating.length ? (withRating.reduce(function (s, t) { return s + t.csatScore; }, 0) / withRating.length) : null;
  var csat = csatNum == null ? '—' : csatNum.toFixed(1);
  var compBase = closedWk.length;
  // P0: คิดจากเวลาจริงเทียบ due (ไม่พึ่ง flag ที่ยังไม่มี cron ตั้ง)
  function metSla(t) {
    var frtOk = !t.firstResponseDue || (t.firstResponseAt && new Date(t.firstResponseAt) <= new Date(t.firstResponseDue));
    var resOk = !t.resolutionDue || (t.resolvedAt && new Date(t.resolvedAt) <= new Date(t.resolutionDue));
    return frtOk && resOk;
  }
  var comp = compBase ? Math.round(closedWk.filter(metSla).length / compBase * 100) : null;
  var reopen = compBase ? Math.round(closedWk.filter(function (t) { return (t.reopenedCount || 0) > 0; }).length / compBase * 100) : null;

  var wkSub = '';
  if (wkPrev.length) {
    var pct = Math.round((wk.length - wkPrev.length) / wkPrev.length * 100);
    wkSub = (pct > 0 ? '▲ ' : pct < 0 ? '▼ ' : '● ') + Math.abs(pct) + '% จากสัปดาห์ก่อน (' + wkPrev.length + ')';
  } else if (wk.length) wkSub = 'สัปดาห์ก่อนไม่มีข้อมูลเทียบ';

  function kpi(icon, label, val, sub, accent) {
    return '<div class="hd-kpi hd-acc-' + (accent || 'neu') + '">'
      + '<div class="hd-kpi-top"><span class="hd-kpi-icon">' + icon + '</span><span class="hd-kpi-lbl">' + esc(label) + '</span></div>'
      + '<div class="hd-kpi-val">' + val + '</div>'
      + (sub ? '<div class="hd-kpi-sub">' + esc(sub) + '</div>' : '')
      + '</div>';
  }
  var compAccent = comp == null ? 'neu' : comp >= 90 ? 'good' : comp >= 70 ? 'warn' : 'bad';
  var reopenAccent = reopen == null ? 'neu' : reopen <= 5 ? 'good' : reopen <= 15 ? 'warn' : 'bad';
  var csatAccent = csatNum == null ? 'neu' : csatNum >= 4.5 ? 'good' : csatNum >= 3.5 ? 'warn' : 'bad';
  var kpis = '<div class="hd-kpi-grid">'
    + kpi('📥', 'เข้าใหม่ (7 วัน)', wk.length, wkSub, 'neu')
    + kpi('📋', 'เปิดค้าง', open.length, '', 'neu')
    + kpi('🔥', 'เกิน SLA', breach, breach ? 'ต้องเร่งดำเนินการ' : 'ไม่มี — ดีมาก', breach ? 'bad' : 'good')
    + kpi('⚡', 'FRT เฉลี่ย', fmtDur(frt), 'เวลาตอบกลับครั้งแรก', 'neu')
    + kpi('🛠️', 'MTTR เฉลี่ย', fmtDur(mttr), 'เวลาแก้ไขเฉลี่ย (30 วัน)', 'neu')
    + kpi('🎯', 'ตรงตาม SLA', comp == null ? '—' : comp + '%', '30 วันล่าสุด', compAccent)
    + kpi('♻️', 'เปิดซ้ำ', reopen == null ? '—' : reopen + '%', '30 วันล่าสุด', reopenAccent)
    + kpi('⭐', 'CSAT', csat + (csat === '—' ? '' : ' / 5'), withRating.length ? withRating.length + ' รีวิว' : 'ยังไม่มีคะแนน', csatAccent)
    + '</div>';

  var hasOpenAssigned = open.length > 0;
  var hasRecentHosp = all.some(function (t) { return t.hospitalId && now - new Date(t.createdAt || 0) < 30 * 864e5; });
  function chartCard(title, canvasId, height, hasData, emptyMsg) {
    var body = hasData
      ? '<div style="height:' + height + 'px;position:relative"><canvas id="' + canvasId + '"></canvas></div>'
      : '<div class="hd-chart-empty" style="height:' + height + 'px;">' + esc(emptyMsg || 'ยังไม่มีข้อมูล') + '</div>';
    return '<div class="ov-card"><div class="ov-card-title">' + title + '</div>' + body + '</div>';
  }
  var charts = '<div class="hd-sec-title">📈 แนวโน้มและการกระจาย</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 24px 8px;" class="hd-chart-grid">'
    + chartCard('📊 Ticket เข้า/ปิด รายวัน (14 วัน)', 'hd-c-trend', 220, all.length > 0)
    + chartCard('🗂️ แยกตามหมวดปัญหา', 'hd-c-cat', 220, all.length > 0)
    + chartCard('🚦 การกระจาย Priority', 'hd-c-pri', 200, all.length > 0)
    + chartCard('⏳ อายุ Ticket ค้าง (เปิดอยู่)', 'hd-c-age', 200, open.length > 0)
    + '</div>'
    + '<div class="hd-sec-title">🧑‍💼 ภาระงาน &amp; Top Reporters</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 24px 28px;" class="hd-chart-grid">'
    + chartCard('👤 ภาระงานตามผู้รับผิดชอบ (เปิดอยู่)', 'hd-c-assignee', 220, hasOpenAssigned)
    + chartCard('🏥 รพ. ที่แจ้งปัญหาบ่อยที่สุด (30 วัน)', 'hd-c-hosp', 220, hasRecentHosp)
    + '</div>';

  // ตารางเสี่ยงเกิน SLA
  var risk = open.filter(function (t) { return t.resolutionDue; })
    .sort(function (a, b) { return new Date(a.resolutionDue) - new Date(b.resolutionDue); }).slice(0, 12);
  var riskRows = risk.map(function (t) {
    var sla = hdSlaCell(t);
    return '<tr style="cursor:pointer" onclick="window.hdOpen(\'' + t.id + '\')"><td style="font-family:var(--mono,monospace);font-size:12px;">' + esc(t.ticketNo) + '</td><td>' + esc(t.subject || '-') + '</td><td>' + esc((gSt(t.assigneeId) || {}).name || '—') + '</td><td><span class="hd-pill hd-' + sla.cls + '">' + esc(sla.txt) + '</span></td></tr>';
  }).join('');
  var riskTable = '<div style="padding:0 24px 32px;"><div class="ov-card" style="padding:0;overflow:hidden;"><div class="ov-card-title" style="padding:14px 18px;">⏰ เสี่ยง/เกิน SLA</div><div style="overflow-x:auto;"><table class="t-table" style="min-width:520px;"><thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>ผู้รับผิดชอบ</th><th>SLA คงเหลือ</th></tr></thead><tbody>' + (riskRows || '<tr><td colspan="4" style="text-align:center;color:var(--txt3);padding:24px;">ไม่มี</td></tr>') + '</tbody></table></div></div></div>';

  return '<div class="hd-sec-title">📊 ภาพรวม</div>' + kpis + charts + riskTable;
}

function hdRenderCharts() {
  if (!window.Chart) return;
  window._hdCharts = window._hdCharts || {};
  Object.keys(window._hdCharts).forEach(function (k) { try { window._hdCharts[k].destroy(); } catch (e) {} });
  window._hdCharts = {};
  var all = window.HELPDESK_TICKETS || [];
  var css = getComputedStyle(document.body);
  var grid = (css.getPropertyValue('--border') || '#e2e5ec').trim();
  var ink2 = (css.getPropertyValue('--txt2') || '#5a6075').trim();
  var ink3 = (css.getPropertyValue('--txt3') || '#9ba3b8').trim();
  var teal = (css.getPropertyValue('--teal') || '#06d6a0').trim();
  var amber = (css.getPropertyValue('--amber') || '#ffa62b').trim();
  var coral = (css.getPropertyValue('--coral') || '#ff6b6b').trim();
  var dark = hdIsDark();
  // ── palette ผ่าน scripts/validate_palette.js ของ skill dataviz แล้ว (adjacent + all-pairs
  // CVD และ contrast ผ่านทั้ง light/dark) — ดูคอมเมนต์หัว section ด้านบน ──
  var vzIn = '#4361ee', vzOut = dark ? '#199e70' : '#1baf7a';
  var vzCat = '#4361ee', vzAssignee = dark ? '#d95926' : '#eb6834', vzHosp = dark ? '#199e70' : '#1baf7a';
  var tickOpt = { color: ink3, font: { size: 10.5 } };
  var legendOpt = { labels: { color: ink2, font: { size: 11 }, boxWidth: 10, usePointStyle: true } };

  // trend 14d — 2 series (เข้า/ปิด) ต้องแยกตัวตนจริง ใช้คู่สี categorical
  var days = [];
  for (var i = 13; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  var inD = days.map(function (day) { return all.filter(function (t) { return (t.createdAt || '').slice(0, 10) === day; }).length; });
  var outD = days.map(function (day) { return all.filter(function (t) { return (t.resolvedAt || '').slice(0, 10) === day; }).length; });
  var cTrend = document.getElementById('hd-c-trend');
  if (cTrend) window._hdCharts.trend = new Chart(cTrend, {
    type: 'line',
    data: { labels: days.map(function (d) { return d.slice(5); }), datasets: [
      { label: 'เข้า', data: inD, borderColor: vzIn, backgroundColor: hdHexA(vzIn, .13), borderWidth: 2, tension: .3, fill: true, pointRadius: 0, pointHoverRadius: 4 },
      { label: 'ปิด', data: outD, borderColor: vzOut, backgroundColor: hdHexA(vzOut, .13), borderWidth: 2, tension: .3, fill: true, pointRadius: 0, pointHoverRadius: 4 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: Object.assign({ position: 'bottom' }, legendOpt) },
      scales: { x: { grid: { color: grid, display: false }, ticks: tickOpt }, y: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) } } },
  });

  // by category — magnitude ระหว่างหมวด (แกนมีชื่อกำกับแล้ว) ใช้ hue เดียว sequential
  var cats = (window.HELPDESK_CATEGORIES || []).slice().sort(function (a, b) { return a.sort - b.sort; });
  var catLabels = cats.map(function (c) { return c.name; }).concat(['(ไม่ระบุ)']);
  var catData = cats.map(function (c) { return all.filter(function (t) { return t.categoryId === c.id; }).length; })
    .concat([all.filter(function (t) { return !t.categoryId; }).length]);
  var cCat = document.getElementById('hd-c-cat');
  if (cCat) window._hdCharts.cat = new Chart(cCat, {
    type: 'bar',
    data: { labels: catLabels, datasets: [{ label: 'Ticket', data: catData, backgroundColor: vzCat, borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { grid: { display: false }, ticks: tickOpt } } },
  });

  // priority donut — คงสีที่ Admin ตั้งไว้ (identity เดียวกับ badge ทุกจุดในแอป ไม่สุ่ม palette ใหม่)
  var prLabels = (window.HD_PRIORITY || []).map(function (p) { return p.short; });
  var prData = (window.HD_PRIORITY || []).map(function (p) { return all.filter(function (t) { return t.priority === p.id; }).length; });
  var prCol = (window.HD_PRIORITY || []).map(function (p) { return p.color; });
  var cPri = document.getElementById('hd-c-pri');
  if (cPri) window._hdCharts.pri = new Chart(cPri, {
    type: 'doughnut',
    data: { labels: prLabels, datasets: [{ data: prData, backgroundColor: prCol, borderWidth: 2, borderColor: (css.getPropertyValue('--surface') || '#fff').trim() }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: Object.assign({ position: 'bottom' }, legendOpt) } },
  });

  // aging — ไล่ระดับความเร่งด่วนตามโทนสถานะของแอป (teal→amber→coral) ไม่ใช่สีสุ่มรายบัคเก็ต
  var openT = all.filter(function (t) { return hdStatus(t.status).open; });
  var buckets = (window.HD_AGING || []).map(function () { return 0; });
  openT.forEach(function (t) {
    var ageDays = (Date.now() - new Date(t.createdAt || Date.now())) / 864e5;
    for (var j = 0; j < window.HD_AGING.length; j++) { if (ageDays <= window.HD_AGING[j].maxDays) { buckets[j]++; break; } }
  });
  var agingColors = [teal, amber, hdHexA(coral, .6), coral];
  var cAge = document.getElementById('hd-c-age');
  if (cAge) window._hdCharts.age = new Chart(cAge, {
    type: 'bar',
    data: { labels: (window.HD_AGING || []).map(function (b) { return b.label; }), datasets: [{ label: 'ค้าง', data: buckets, backgroundColor: agingColors, borderRadius: 4, maxBarThickness: 46 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: tickOpt }, y: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) } } },
  });

  // ภาระงานตามผู้รับผิดชอบ (เฉพาะ ticket ที่เปิดอยู่) — เน้น "ยังไม่มอบหมาย" ด้วยสี amber (emphasis)
  var byAssignee = {};
  openT.forEach(function (t) { var key = t.assigneeId || '__unassigned__'; byAssignee[key] = (byAssignee[key] || 0) + 1; });
  var assigneeEntries = Object.keys(byAssignee).map(function (id) {
    return { name: id === '__unassigned__' ? 'ยังไม่มอบหมาย' : ((gSt(id) || {}).name || id), count: byAssignee[id], unassigned: id === '__unassigned__' };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
  var cAssignee = document.getElementById('hd-c-assignee');
  if (cAssignee) window._hdCharts.assignee = new Chart(cAssignee, {
    type: 'bar',
    data: { labels: assigneeEntries.map(function (e) { return e.name; }),
      datasets: [{ label: 'เปิดอยู่', data: assigneeEntries.map(function (e) { return e.count; }),
        backgroundColor: assigneeEntries.map(function (e) { return e.unassigned ? amber : vzAssignee; }), borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { grid: { display: false }, ticks: tickOpt } } },
  });

  // รพ. ที่แจ้งปัญหาบ่อยที่สุดใน 30 วัน — ช่วยเห็นว่าที่ไหนต้องการความช่วยเหลือมากเป็นพิเศษ
  var last30 = all.filter(function (t) { return Date.now() - new Date(t.createdAt || 0) < 30 * 864e5; });
  var byHosp = {};
  last30.forEach(function (t) { if (!t.hospitalId) return; byHosp[t.hospitalId] = (byHosp[t.hospitalId] || 0) + 1; });
  var hospEntries = Object.keys(byHosp).map(function (id) {
    var h = hdHosp(id);
    return { name: h ? ((h.code ? h.code + ' ' : '') + h.name) : id, count: byHosp[id] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
  var cHosp = document.getElementById('hd-c-hosp');
  if (cHosp) window._hdCharts.hosp = new Chart(cHosp, {
    type: 'bar',
    data: { labels: hospEntries.map(function (e) { return e.name; }), datasets: [{ label: 'Ticket', data: hospEntries.map(function (e) { return e.count; }), backgroundColor: vzHosp, borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { grid: { display: false }, ticks: tickOpt } } },
  });
}

// ── นำเข้าปัญหาเก่า (bulk import จาก Excel/CSV) ─────────────────────────
var HD_IMPORT_COLS = [
  { key: 'hospital',      syn: ['hospital', 'hospital_code', 'hospital_name', 'โรงพยาบาล', 'รพ', 'รพ.'], req: true },
  { key: 'reporter_name', syn: ['reporter_name', 'reporter', 'ผู้แจ้ง', 'ชื่อผู้แจ้ง', 'name'] },
  { key: 'phone',         syn: ['phone', 'tel', 'เบอร์', 'โทร', 'line', 'เบอร์ติดต่อ'] },
  { key: 'line_group',    syn: ['line_group', 'group', 'กลุ่มline', 'กลุ่มไลน์', 'กลุ่ม'] },
  { key: 'source_system', syn: ['source_system', 'system', 'ระบบ', 'ระบบที่ใช้งาน'] },
  { key: 'category',      syn: ['category', 'หมวด', 'ประเภท', 'หมวดปัญหา'] },
  { key: 'subject',       syn: ['subject', 'title', 'หัวข้อ', 'เรื่อง'] },
  { key: 'description',   syn: ['description', 'detail', 'รายละเอียด', 'ปัญหา', 'รายละเอียดปัญหา'], req: true },
  { key: 'priority',      syn: ['priority', 'ความสำคัญ', 'ความเร่งด่วน'] },
  { key: 'status',        syn: ['status', 'สถานะ'] },
  { key: 'assignee',      syn: ['assignee', 'owner', 'ผู้รับผิดชอบ', 'ผู้ดูแล'] },
  { key: 'resolution',    syn: ['resolution', 'solution', 'fix', 'วิธีแก้ไข', 'วิธีแก้', 'การแก้ไข', 'แนวทางแก้ไข'] },
  { key: 'resolved_by',   syn: ['resolved_by', 'fixed_by', 'ผู้แก้ไข', 'คนแก้ไข', 'ผู้ดำเนินการ'] },
  { key: 'created_at',    syn: ['created_at', 'date', 'วันที่แจ้ง', 'วันที่', 'วันแจ้ง'] },
  { key: 'resolved_at',   syn: ['resolved_at', 'closed_at', 'วันที่ปิด', 'วันที่เสร็จ', 'วันปิด'] },
];

function hdNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s._-]/g, '').trim(); }

function hdParseDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 10000) {
    var d0 = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d0)) return d0.toISOString();
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    var yy = Number(m[3]); if (yy >= 2500) yy -= 543;
    var d1 = new Date(yy, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    return isNaN(d1) ? '' : d1.toISOString();
  }
  var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m2) {
    var y2 = Number(m2[1]); if (y2 >= 2500) y2 -= 543;
    var d2 = new Date(y2, Number(m2[2]) - 1, Number(m2[3]), Number(m2[4] || 0), Number(m2[5] || 0));
    return isNaN(d2) ? '' : d2.toISOString();
  }
  var d3 = new Date(s);
  return isNaN(d3) ? '' : d3.toISOString();
}

function hdMatchHospital(v) {
  var q = hdNorm(v); if (!q) return null;
  var list = window.HOSPITALS || [];
  return list.find(function (h) { return hdNorm(h.code) === q || hdNorm(h.name) === q; })
    || list.find(function (h) { return h.code && hdNorm(h.code) === q; })
    || list.find(function (h) { return hdNorm(h.name).indexOf(q) > -1 || (q.length > 3 && q.indexOf(hdNorm(h.name)) > -1); })
    || null;
}
function hdMatchCategory(v) {
  var q = hdNorm(v); if (!q) return null;
  var list = window.HELPDESK_CATEGORIES || [];
  return list.find(function (c) { return hdNorm(c.id) === q || hdNorm(c.name) === q; })
    || list.find(function (c) { return hdNorm(c.name).indexOf(q) > -1; }) || null;
}
function hdMatchStaff(v) {
  var q = hdNorm(v); if (!q) return null;
  var list = (window.STAFF || []).filter(function (s) { return s.active; });
  return list.find(function (s) { return hdNorm(s.name) === q || hdNorm(s.nickname) === q; })
    || list.find(function (s) { return hdNorm(s.name).indexOf(q) > -1; }) || null;
}
function hdNormPriority(v) {
  var q = hdNorm(v);
  if (['p1', 'p2', 'p3', 'p4'].indexOf(q) > -1) return q;
  if (/วิกฤต|ด่วนมาก|critical|urgent/.test(q)) return 'p1';
  if (/สูง|high|ด่วน/.test(q)) return 'p2';
  if (/ต่ำ|low/.test(q)) return 'p4';
  return 'p3';
}
function hdNormStatus(v) {
  var q = hdNorm(v);
  var ids = (window.HD_STATUS || []).map(function (s) { return s.id; });
  if (ids.indexOf(q) > -1) return q;
  if (/เสร็จ|ปิด|done|resolve/.test(q)) return 'resolved';
  if (/ยกเลิก|cancel/.test(q)) return 'cancelled';
  if (/ดำเนิน|progress/.test(q)) return 'in_progress';
  return 'closed'; // ปัญหาเก่าโดยมากปิดแล้ว
}

// เรียกจากปุ่ม "นำเข้าข้อมูล" กลาง (modals.js execImport) — เปิด modal พรีวิว + โหลดไฟล์ที่เลือกไว้แล้ว
window.hdImportFromFile = function (file) {
  if (!(window.canAdd && window.canAdd('helpdesk')) && !(window.isAdmin && window.isAdmin())) {
    window.showAlert && window.showAlert('ไม่มีสิทธิ์นำเข้าปัญหา HelpDesk', 'warn'); return;
  }
  window._hdImportRows = null;
  document.getElementById('m-hd-import-body').innerHTML =
    '<p style="font-size:13px;color:var(--txt2);margin:0 0 12px;">นำเข้า Ticket เก่าจากไฟล์ Excel/CSV เข้าคิวงาน (ช่องทาง = นำเข้าจากระบบเดิม) '
    + '<a href="#" onclick="window.hdDownloadImportTemplate();return false;" style="color:var(--violet);font-weight:600;">↓ ดาวน์โหลดเทมเพลต</a></p>'
    + '<label class="f-label">ไฟล์ (.xlsx / .xls / .csv)</label>'
    + '<input type="file" id="hd-import-file" class="f-input" accept=".xlsx,.xls,.csv" onchange="window.hdImportFile(this.files)">'
    + '<div id="hd-import-status" style="margin-top:14px;"></div>';
  document.getElementById('m-hd-import-run').disabled = true;
  window.openM('m-hd-import');
  if (file) hdImportProcess(file);
};

window.hdDownloadImportTemplate = function () {
  if (!window.XLSX) { window.showAlert && window.showAlert('ไลบรารี Excel ยังไม่พร้อม', 'warn'); return; }
  var headers = ['hospital', 'reporter_name', 'phone', 'line_group', 'source_system', 'category', 'subject', 'description', 'priority', 'status', 'assignee', 'resolution', 'resolved_by', 'created_at', 'resolved_at'];
  var example = ['41510', 'คุณสมชาย', '0812345678', 'กลุ่ม รพ.A', 'BMS-HOSxP', 'รายงาน / พิมพ์เอกสาร', 'พิมพ์ใบสั่งยาไม่ออก', 'กดพิมพ์แล้วไม่มีอะไรเกิดขึ้น', 'p3', 'closed', 'สมหญิง', 'ตั้งค่าเครื่องพิมพ์เริ่มต้นใหม่ + ล้าง cache', 'สมหญิง', '2025-11-20 09:15', '2025-11-21 14:30'];
  var guide = [
    ['คำแนะนำการกรอก'],
    ['hospital', 'รหัส หรือ ชื่อโรงพยาบาล (ต้องตรงกับรายชื่อ รพ. ในระบบ) — จำเป็น'],
    ['description', 'รายละเอียดปัญหา — จำเป็น'],
    ['priority', 'p1 / p2 / p3 / p4 (เว้นว่าง = p3)'],
    ['status', 'new / triage / assigned / in_progress / pending_user / resolved / closed / cancelled (เว้นว่าง = closed)'],
    ['category', 'ชื่อหมวด หรือรหัส CAT_xxx (ไม่บังคับ)'],
    ['assignee', 'เจ้าหน้าที่ผู้รับผิดชอบ — ชื่อ หรือชื่อเล่น (ไม่บังคับ)'],
    ['resolution', 'วิธีแก้ไข — จะบันทึกลงไทม์ไลน์ของ Ticket (ไม่บังคับ)'],
    ['resolved_by', 'ชื่อคนแก้ไข — ถ้าไม่ระบุ assignee จะใช้ค่านี้แทน (ไม่บังคับ)'],
    ['created_at', 'วัน–เวลาที่แจ้ง'],
    ['resolved_at', 'วัน–เวลาที่แก้ไขเสร็จ (ใส่เวลาได้ เช่น 2025-11-21 14:30)'],
    ['รูปแบบวันที่', 'YYYY-MM-DD หรือ YYYY-MM-DD HH:mm หรือ DD/MM/YYYY หรือ DD/MM/YYYY HH:mm (รองรับปี พ.ศ.)'],
  ];
  var wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([headers, example]), 'tickets');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(guide), 'คำแนะนำ');
  window.XLSX.writeFile(wb, 'Template_HELPDESK_import.xlsx');
};

window.hdImportFile = function (files) { hdImportProcess(files && files[0]); };

function hdImportProcess(file) {
  var box = document.getElementById('hd-import-status');
  var runBtn = document.getElementById('m-hd-import-run');
  window._hdImportRows = null; if (runBtn) runBtn.disabled = true;
  if (!file) { if (box) box.innerHTML = ''; return; }
  if (!window.XLSX) { box.innerHTML = '<div style="color:var(--coral);font-size:12px;">ไลบรารี Excel ยังไม่พร้อม</div>'; return; }
  box.innerHTML = '<div style="font-size:12px;color:var(--txt3);">กำลังอ่านไฟล์...</div>';
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var objs = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
      var parsed = hdImportParse(objs);
      window._hdImportRows = parsed;
      hdImportPreview(parsed, file.name);
    } catch (err) {
      box.innerHTML = '<div style="color:var(--coral);font-size:12px;">อ่านไฟล์ไม่ได้: ' + esc(String(err.message || err)) + '</div>';
    }
  };
  reader.readAsArrayBuffer(file);
}

function hdImportParse(objs) {
  return (objs || []).map(function (o, idx) {
    var rec = {};
    Object.keys(o).forEach(function (k) {
      var nk = hdNorm(k);
      var col = HD_IMPORT_COLS.find(function (c) { return c.syn.some(function (s) { return hdNorm(s) === nk; }); });
      if (col && rec[col.key] == null) rec[col.key] = o[k];
    });
    var errs = [];
    var hosp = hdMatchHospital(rec.hospital);
    if (!hosp) errs.push('ไม่พบ รพ. "' + String(rec.hospital || '').slice(0, 30) + '"');
    var desc = String(rec.description || '').trim();
    if (!desc) errs.push('ไม่มีรายละเอียด');
    var createdIso = hdParseDate(rec.created_at) || new Date().toISOString();
    var status = hdNormStatus(rec.status);
    var resolvedIso = hdParseDate(rec.resolved_at) || ((status === 'resolved' || status === 'closed') ? createdIso : '');
    var cat = hdMatchCategory(rec.category);
    var fixedBy = hdMatchStaff(rec.resolved_by);
    var stf = hdMatchStaff(rec.assignee) || fixedBy;  // ไม่ระบุ assignee → ใช้คนแก้ไขแทน
    return {
      row: idx + 2,
      ok: errs.length === 0,
      errs: errs,
      data: {
        hospitalId: hosp ? hosp.id : '',
        hospitalName: hosp ? hosp.name : String(rec.hospital || ''),
        reporterName: String(rec.reporter_name || '').trim(),
        phone: String(rec.phone || '').trim(),
        lineGroup: String(rec.line_group || '').trim(),
        sourceSystem: String(rec.source_system || '').trim(),
        categoryId: cat ? cat.id : '',
        subject: String(rec.subject || '').trim() || desc.slice(0, 60),
        description: desc,
        priority: hdNormPriority(rec.priority),
        status: status,
        assigneeId: stf ? stf.id : '',
        resolution: String(rec.resolution || '').trim(),
        resolvedById: fixedBy ? fixedBy.id : (stf ? stf.id : ''),
        resolvedByName: String(rec.resolved_by || '').trim(),
        createdAt: createdIso,
        resolvedAt: resolvedIso,
      },
    };
  });
}

function hdImportPreview(parsed, filename) {
  var box = document.getElementById('hd-import-status');
  var runBtn = document.getElementById('m-hd-import-run');
  var okRows = parsed.filter(function (p) { return p.ok; });
  var badRows = parsed.filter(function (p) { return !p.ok; });
  if (!parsed.length) { box.innerHTML = '<div style="color:var(--coral);font-size:12px;">ไม่พบข้อมูลในไฟล์</div>'; return; }
  if (runBtn) runBtn.disabled = okRows.length === 0;

  var head = '<div style="background:rgba(6,214,160,.07);border:1px solid rgba(6,214,160,.3);border-radius:10px;padding:10px 14px;font-size:12px;">'
    + '<b style="color:var(--teal);">อ่านไฟล์สำเร็จ</b> · ' + esc(filename || '') + '<br>'
    + '<span class="hd-pill hd-ok" style="margin-top:6px;display:inline-block;">นำเข้าได้ ' + okRows.length + '</span> '
    + (badRows.length ? '<span class="hd-pill hd-bad" style="display:inline-block;">ข้าม ' + badRows.length + '</span>' : '')
    + '</div>';

  var sample = okRows.slice(0, 5).map(function (p) {
    var d = p.data;
    return '<tr><td>' + esc(d.hospitalName) + '</td><td>' + esc(d.subject) + '</td><td>' + hdPri(d.priority).short
      + '</td><td>' + esc(hdStatus(d.status).label) + '</td><td style="color:var(--txt3);">' + hdDT(d.createdAt) + '</td></tr>';
  }).join('');
  var sampleTbl = '<div style="margin-top:10px;overflow-x:auto;"><table class="t-table" style="min-width:480px;font-size:11.5px;">'
    + '<thead><tr><th>รพ.</th><th>หัวข้อ</th><th>Pri</th><th>สถานะ</th><th>วันที่แจ้ง</th></tr></thead><tbody>'
    + (sample || '<tr><td colspan="5" style="color:var(--txt3);">—</td></tr>') + '</tbody></table></div>';

  var badList = badRows.length
    ? '<details style="margin-top:10px;"><summary style="font-size:12px;color:var(--coral);cursor:pointer;">แถวที่ถูกข้าม (' + badRows.length + ')</summary>'
      + '<div style="font-size:11px;color:var(--txt3);max-height:140px;overflow:auto;margin-top:6px;">'
      + badRows.slice(0, 50).map(function (p) { return 'แถว ' + p.row + ': ' + esc(p.errs.join(', ')); }).join('<br>') + '</div></details>'
    : '';

  box.innerHTML = head + sampleTbl + badList;
}

window.hdImportRun = async function () {
  var parsed = window._hdImportRows || [];
  var rows = parsed.filter(function (p) { return p.ok; });
  if (!rows.length) return;
  window.showConfirm('นำเข้า ' + rows.length + ' Ticket เข้าระบบ?', async function () {
    var runBtn = document.getElementById('m-hd-import-run');
    var box = document.getElementById('hd-import-status');
    if (runBtn) runBtn.disabled = true;
    var counters = {};
    var done = 0, failed = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].data;
      try {
        var createdD = new Date(d.createdAt);
        var be2 = String((createdD.getFullYear() + 543) % 100).padStart(2, '0');
        var mm = String(createdD.getMonth() + 1).padStart(2, '0');
        var prefix = 'HD' + be2 + mm;
        if (counters[prefix] == null) {
          var existing = (window.HELPDESK_TICKETS || []).filter(function (t) { return t.ticketNo && t.ticketNo.indexOf(prefix) === 0; })
            .map(function (t) { var n = parseInt(t.ticketNo.slice(prefix.length), 10); return isNaN(n) ? 0 : n; });
          counters[prefix] = existing.length ? Math.max.apply(null, existing) : 0;
        }
        counters[prefix]++;
        var id = window.hdUid();
        var due = window.hdCalcDue(d.priority, d.createdAt);
        var nowIso = new Date().toISOString();
        var st = hdStatus(d.status);
        var expIso = null;
        if (!st.open) { var e2 = new Date(d.resolvedAt || d.createdAt); e2.setDate(e2.getDate() + 30); expIso = e2.toISOString(); }
        var row = {
          id: id,
          ticket_no: prefix + String(counters[prefix]).padStart(4, '0'),
          channel: 'import',
          hospital_id: d.hospitalId,
          reporter_name: d.reporterName,
          reporter_phone: d.phone,
          reporter_email: '',
          reporter_position: '',
          reporter_dept: '',
          line_group_ref: d.lineGroup,
          source_system: d.sourceSystem,
          category_id: d.categoryId,
          subject: d.subject,
          description: d.description,
          priority: d.priority,
          status: d.status,
          assignee_id: d.assigneeId,
          team: '',
          sla_policy_id: due.slaPolicyId,
          first_response_due: due.firstResponseDue,
          resolution_due: due.resolutionDue,
          first_response_at: (d.status !== 'new' && d.status !== 'triage') ? d.createdAt : null,
          resolved_at: (d.status === 'resolved' || d.status === 'closed') ? (d.resolvedAt || d.createdAt) : null,
          closed_at: d.status === 'closed' ? (d.resolvedAt || d.createdAt) : null,
          public_view_expires_at: expIso,
          pending_since: null,
          pending_total_mins: 0,
          frt_breached: false,
          resolution_breached: false,
          reopened_count: 0,
          csat_score: null,
          access_token: window.hdGenToken(),
          rated_at: null,
          tags: ['imported'],
          created_by: '',
          created_at: d.createdAt,
          updated_at: nowIso,
        };
        await window.setDoc(window.getDocRef('HELPDESK_TICKETS', id), row);
        window.hdApplyLocal(id, row);
        await window.hdAddEvent(id, { type: 'system', actorType: 'system', body: 'นำเข้าจากระบบเดิม', createdAt: d.createdAt });
        if (d.resolution) {
          var byName = d.resolvedById ? ((gSt(d.resolvedById) || {}).name || '') : d.resolvedByName;
          await window.hdAddEvent(id, {
            type: 'comment', actorType: 'agent', actorId: d.resolvedById,
            body: 'วิธีแก้ไข: ' + d.resolution + (byName ? '\n(โดย ' + byName + ')' : ''),
            createdAt: d.resolvedAt || d.createdAt,
          });
        }
        done++;
      } catch (e) { failed++; console.warn('[helpdesk import] row', rows[i].row, e); }
      if (box) box.innerHTML = '<div style="font-size:13px;">กำลังนำเข้า ' + (i + 1) + ' / ' + rows.length + ' ...</div>';
    }
    window.closeM('m-hd-import');
    window.showAlert && window.showAlert('นำเข้าสำเร็จ ' + done + ' รายการ' + (failed ? ' · ผิดพลาด ' + failed : ''), failed ? 'warn' : 'success');
    window.renderHelpdesk();
  }, { icon: '📥', title: 'ยืนยันการนำเข้า', okText: 'นำเข้า', okColor: 'var(--violet)' });
};

// ── ADMIN PANEL: "ตัวเลือกแจ้งปัญหา" ─────────────────────────────────────
// หมวดปัญหา/ระบบที่ใช้งาน เพิ่ม-แก้-ลบได้อิสระ (ตาราง DB ของตัวเอง) ส่วน Priority/สถานะ/
// ความเร่งด่วน เป็นชุด id คงที่ที่ผูก logic คำนวณ SLA/workflow ทั่วแอปอยู่ — ปรับได้แค่ label/สี/icon
// ผ่าน override เก็บใน settings.app (ดู hdApplyOptionOverrides ใน helpdesk.service.js) เรียกจาก
// admin.js → renderAdm() เหมือน renderNotifySettings ใน notify.js ──
window.renderHdOptionsAdmin = function () {
  var c = document.getElementById('adm-body'); if (!c) return;
  var titleEl = document.getElementById('adm-head-title');
  if (titleEl) titleEl.innerHTML = '🎧 ตัวเลือกแจ้งปัญหา';
  var canE = window.canEdit && window.canEdit('helpdesk');
  var canA = window.canAdd && window.canAdd('helpdesk');
  var canD = window.canDel && window.canDel('helpdesk');

  var cats = (window.HELPDESK_CATEGORIES || []).slice().sort(function (a, b) { return a.sort - b.sort; });
  var catRows = cats.map(function (x) {
    var pr = hdPri(x.defaultPriority);
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);">'
      + '<span style="flex:1;font-size:13px;font-weight:600;color:var(--txt);' + (x.active ? '' : 'opacity:.5;text-decoration:line-through;') + '">' + esc(x.name) + '</span>'
      + '<span class="tag" style="background:' + pr.color + '18;color:' + pr.color + ';font-size:11px;">' + esc(pr.short) + '</span>'
      + '<span style="font-size:11px;color:var(--txt3);width:30px;text-align:center;">#' + x.sort + '</span>'
      + '<div style="display:flex;gap:6px;">'
      + (canE ? '<button class="btn btn-ghost btn-sm" onclick="window.hdCatForm(\'' + x.id + '\')">✏️</button>' : '')
      + (canD ? '<button class="btn btn-red btn-sm" onclick="window.askDel(\'hdcat\',\'' + x.id + '\',\'' + esc(x.name) + '\')">🗑</button>' : '')
      + '</div></div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--txt3);font-size:12px;">ยังไม่มีหมวดปัญหา</div>';

  var priRows = (window.HD_PRIORITY || []).map(function (p) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span style="font-size:11px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:24px;">' + esc(p.id) + '</span>'
      + '<input type="color" class="hdopt-color" data-id="' + p.id + '" value="' + esc(p.color) + '" style="width:34px;height:34px;border:2px solid var(--border);border-radius:8px;cursor:pointer;padding:2px;background:transparent;">'
      + '<input class="f-input hdopt-label" data-id="' + p.id + '" value="' + esc(p.label) + '" style="flex:1;padding:6px 10px;">'
      + '</div>';
  }).join('');

  var priOpts4 = function (sel) { return (window.HD_PRIORITY || []).map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join(''); };
  var urgRows = (window.HD_URGENCY || []).map(function (u) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span style="font-size:10.5px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:52px;">' + esc(u.id) + '</span>'
      + '<input class="f-input hdopt-label" data-id="' + u.id + '" value="' + esc(u.label) + '" style="flex:1;padding:6px 10px;">'
      + '<select class="f-input hdopt-pri" data-id="' + u.id + '" style="width:150px;padding:6px 10px;">' + priOpts4(u.priority) + '</select>'
      + '</div>';
  }).join('');

  var stRows = (window.HD_STATUS || []).map(function (s) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span style="font-size:10px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(s.id) + '</span>'
      + '<input class="f-input hdopt-icon" data-id="' + s.id + '" value="' + esc(s.icon) + '" style="width:48px;padding:6px 8px;text-align:center;">'
      + '<input type="color" class="hdopt-color" data-id="' + s.id + '" value="' + esc(s.color) + '" style="width:34px;height:34px;border:2px solid var(--border);border-radius:8px;cursor:pointer;padding:2px;background:transparent;">'
      + '<input class="f-input hdopt-label" data-id="' + s.id + '" value="' + esc(s.label) + '" style="flex:1;padding:6px 10px;">'
      + (s.open === false ? '<span class="tag" style="background:var(--surface2);color:var(--txt3);font-size:10px;white-space:nowrap;">ปิดงาน</span>' : '<span class="tag" style="background:var(--teal)18;color:var(--teal);font-size:10px;white-space:nowrap;">เปิดอยู่</span>')
      + '</div>';
  }).join('');

  c.innerHTML =
    '<div style="max-width:760px;display:flex;flex-direction:column;gap:22px;">'
    + '<div style="background:rgba(124,92,252,.07);border:1px solid rgba(124,92,252,.2);border-radius:10px;padding:12px 16px;font-size:12px;color:var(--txt2);">'
    + '💡 หมวดปัญหา เพิ่ม-ลบได้อิสระ · "ระบบที่ใช้งาน" ในฟอร์มดึงมาจากคลัง Product โดยตรง (จัดการที่แท็บ "📦 Product") · ส่วน Priority/สถานะ/ความเร่งด่วน ปรับได้แค่ชื่อ-สี-ไอคอน (ผูก logic คำนวณ SLA อยู่ ไม่เพิ่ม-ลบระดับ)'
    + '</div>'

    + '<div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);">🗂️ หมวดปัญหา</div>'
    + (canA ? '<button class="btn btn-pri btn-sm" onclick="window.hdCatForm(null)">+ เพิ่มหมวดปัญหา</button>' : '')
    + '</div>'
    + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">' + catRows + '</div>'
    + '</div>'

    + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px;">🚦 Priority</div>'
    + '<div style="font-size:11px;color:var(--txt3);margin-bottom:10px;">ปรับชื่อ/สีได้ — ระดับความเร่งด่วนคงที่ 4 ระดับ (ผูกกับ SLA)</div>'
    + priRows
    + (canE ? '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-pri btn-sm" onclick="window.saveHdPriorityOptions()">💾 บันทึก</button><button class="btn btn-ghost btn-sm" onclick="window.resetHdOptionOverrides(\'priority\')">↩️ ค่าเริ่มต้น</button></div>' : '')
    + '</div>'

    + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px;">⚡ ความเร่งด่วน (ผู้แจ้งเลือกเอง)</div>'
    + '<div style="font-size:11px;color:var(--txt3);margin-bottom:10px;">ปรับชื่อ/Priority เริ่มต้นที่ map ให้ได้</div>'
    + urgRows
    + (canE ? '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-pri btn-sm" onclick="window.saveHdUrgencyOptions()">💾 บันทึก</button><button class="btn btn-ghost btn-sm" onclick="window.resetHdOptionOverrides(\'urgency\')">↩️ ค่าเริ่มต้น</button></div>' : '')
    + '</div>'

    + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px;">🔖 สถานะ Ticket</div>'
    + '<div style="font-size:11px;color:var(--txt3);margin-bottom:10px;">ปรับไอคอน/ชื่อ/สีได้ — สถานะและลำดับ workflow คงที่</div>'
    + stRows
    + (canE ? '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-pri btn-sm" onclick="window.saveHdStatusOptions()">💾 บันทึก</button><button class="btn btn-ghost btn-sm" onclick="window.resetHdOptionOverrides(\'status\')">↩️ ค่าเริ่มต้น</button></div>' : '')
    + '</div>'
    + '</div>';
};

// ── หมวดปัญหา — ใช้ modal m-hdlist ──
window._editHdListId = null;
window.hdCatForm = function (id) {
  window._editHdListId = (id && id !== 'null') ? id : null;
  var it = window._editHdListId ? (window.HELPDESK_CATEGORIES || []).find(function (x) { return x.id === window._editHdListId; }) : null;
  document.getElementById('m-hdlist-title').textContent = it ? 'แก้ไขหมวดปัญหา' : 'เพิ่มหมวดปัญหา';
  var badge = document.getElementById('m-hdlist-id-badge');
  if (window._editHdListId) { badge.textContent = 'ID: ' + window._editHdListId; badge.style.display = 'inline-block'; } else { badge.style.display = 'none'; }
  document.getElementById('hlf-name').value = it ? it.name : '';
  document.getElementById('hlf-sort').value = it ? it.sort : (((window.HELPDESK_CATEGORIES || []).length + 1) * 10);
  document.getElementById('hlf-active').checked = it ? it.active !== false : true;
  document.getElementById('hlf-pri').innerHTML = (window.HD_PRIORITY || [])
    .map(function (p) { return '<option value="' + p.id + '"' + ((it ? it.defaultPriority === p.id : p.id === 'p3') ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  window.openM('m-hdlist');
};
window.saveHdListItem = function () {
  if (!(window.canEdit && window.canEdit('helpdesk'))) return;
  var name = ((document.getElementById('hlf-name') || {}).value || '').trim();
  if (!name) { window.showAlert && window.showAlert('กรุณากรอกชื่อ', 'warn'); return; }
  var sort = parseFloat((document.getElementById('hlf-sort') || {}).value) || 0;
  var active = !!(document.getElementById('hlf-active') || {}).checked;
  var pri = (document.getElementById('hlf-pri') || {}).value || 'p3';
  var id = window._editHdListId || 'HDCAT' + Date.now();

  var obj = { id: id, name: name, defaultPriority: pri, parentId: '', defaultAssigneeId: '', defaultTeam: '', sort: sort, active: active };
  var idx = (window.HELPDESK_CATEGORIES || []).findIndex(function (x) { return x.id === id; });
  if (idx >= 0) window.HELPDESK_CATEGORIES[idx] = obj; else (window.HELPDESK_CATEGORIES = window.HELPDESK_CATEGORIES || []).push(obj);
  window.closeM('m-hdlist'); window.admTab('hd_options');
  window.setDoc(window.getDocRef('HELPDESK_CATEGORIES', id), { id: id, name: name, default_priority: pri, sort: sort, active: active })
    .catch(function (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); });
};

// ── Priority / สถานะ / ความเร่งด่วน — override label/สี/icon (ไม่ใช่เพิ่ม-ลบ id) ──
window.saveHdOptionOverrides = async function (kind, overridesObj) {
  if (!(window.canEdit && window.canEdit('helpdesk'))) return;
  var fieldsMap = { priority: ['label', 'color'], status: ['label', 'color', 'icon'], urgency: ['label', 'priority'] };
  var defaultsMap = { priority: window.HD_PRIORITY_DEFAULTS, status: window.HD_STATUS_DEFAULTS, urgency: window.HD_URGENCY_DEFAULTS };
  window._hdOptionOverrides = window._hdOptionOverrides || {};
  window._hdOptionOverrides[kind] = overridesObj;
  var merged = window.hdApplyOptionOverrides(defaultsMap[kind], overridesObj, fieldsMap[kind]);
  if (kind === 'priority') window.HD_PRIORITY = merged;
  else if (kind === 'status') window.HD_STATUS = merged;
  else if (kind === 'urgency') window.HD_URGENCY = merged;
  if (window.admCur === 'hd_options') window.admTab('hd_options');

  var patch = {};
  patch['helpdesk_' + kind + '_overrides'] = overridesObj;
  try {
    await window.setDoc(window.getDocRef('SETTINGS', 'app'), patch, { merge: true });
    window.showAlert && window.showAlert('บันทึกแล้ว', 'success');
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
};
window.saveHdPriorityOptions = function () {
  var ov = {};
  (window.HD_PRIORITY_DEFAULTS || []).forEach(function (base) {
    var lblEl = document.querySelector('.hdopt-label[data-id="' + base.id + '"]');
    var colEl = document.querySelector('.hdopt-color[data-id="' + base.id + '"]');
    ov[base.id] = { label: (lblEl && lblEl.value.trim()) || base.label, color: (colEl && colEl.value) || base.color };
  });
  window.saveHdOptionOverrides('priority', ov);
};
window.saveHdUrgencyOptions = function () {
  var ov = {};
  (window.HD_URGENCY_DEFAULTS || []).forEach(function (base) {
    var lblEl = document.querySelector('.hdopt-label[data-id="' + base.id + '"]');
    var priEl = document.querySelector('.hdopt-pri[data-id="' + base.id + '"]');
    ov[base.id] = { label: (lblEl && lblEl.value.trim()) || base.label, priority: (priEl && priEl.value) || base.priority };
  });
  window.saveHdOptionOverrides('urgency', ov);
};
window.saveHdStatusOptions = function () {
  var ov = {};
  (window.HD_STATUS_DEFAULTS || []).forEach(function (base) {
    var lblEl = document.querySelector('.hdopt-label[data-id="' + base.id + '"]');
    var colEl = document.querySelector('.hdopt-color[data-id="' + base.id + '"]');
    var icoEl = document.querySelector('.hdopt-icon[data-id="' + base.id + '"]');
    ov[base.id] = { label: (lblEl && lblEl.value.trim()) || base.label, color: (colEl && colEl.value) || base.color, icon: (icoEl && icoEl.value.trim()) || base.icon };
  });
  window.saveHdOptionOverrides('status', ov);
};
window.resetHdOptionOverrides = function (kind) {
  var kindLabel = kind === 'priority' ? 'Priority' : kind === 'status' ? 'สถานะ Ticket' : 'ความเร่งด่วน';
  window.showConfirm('รีเซ็ต "' + kindLabel + '" กลับเป็นค่าเริ่มต้นทั้งหมด?', function () {
    window.saveHdOptionOverrides(kind, {});
  }, { icon: '↩️', title: 'ยืนยันรีเซ็ต', okColor: 'var(--amber)', okText: 'รีเซ็ต' });
};
