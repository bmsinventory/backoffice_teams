/**
 * helpdesk.js — Helpdesk (ศูนย์ช่วยเหลือ) UI
 * โมดูล 'helpdesk' — คิวงาน / ของฉัน / แดชบอร์ด / สรุปรายสัปดาห์ (AI) + หน้ารายละเอียด Ticket + modal "+ แจ้งแทน"
 * เก็บเฉพาะปัญหาลูกค้า (โรงพยาบาล) · หน้า public = docs/help.html
 */
const { esc, fd, fca, pd, gSt } = window;

// ── helpers ─────────────────────────────────────────────────────────────
function hdStatus(id) { return (window.HD_STATUS || []).find(function (s) { return s.id === id; }) || { id: id, label: id, color: '#9ba3b8', icon: '•', open: true }; }
function hdPri(id)    { return (window.HD_PRIORITY || []).find(function (p) { return p.id === id; }) || { id: id, short: id, label: id, color: '#9ba3b8' }; }
function hdCat(id)    { return (window.HELPDESK_CATEGORIES || []).find(function (c) { return c.id === id; }) || null; }
// ชื่อพนักงาน — ไม่ได้ระบุ/หาไม่เจอ → ค่าว่าง (gSt() กลางคืน "?" ซึ่งไม่สื่อความหมายในหน้านี้)
function hdStaffName(id) { var s = id && (window.STAFF || []).find(function (x) { return x.id === id; }); return (s && s.name) || ''; }
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
  hdLiveStop();
  root.classList.remove('hd-fit', 'hd-info-open');
  hdRenderList(root);
};

window.hdGo = function (tab) { window.hdTab = tab; window.hdOpenId = null; window.hdPage = 1; window.renderHelpdesk(); };
window.hdOpen = function (id) { window.hdOpenId = id; window.renderHelpdesk(); };
window.hdBack = function () { window.hdOpenId = null; window.renderHelpdesk(); };
// มือถือ: การ์ดข้อมูล Ticket เปิดเป็นแผงเต็มจอทับแชท (จอกว้างแสดงคอลัมน์ขวาตลอด ปุ่มนี้ซ่อน)
window.hdToggleInfo = function (on) { var r = document.getElementById('view-helpdesk'); if (r) r.classList.toggle('hd-info-open', !!on); };

// ── LIST (queue / mine / dashboard) ────────────────────────────────────
function hdRenderList(root) {
  var tab = window.hdTab || 'queue';
  var canAdd = window.canAdd && window.canAdd('helpdesk');
  var tabs = [
    { id: 'queue', label: 'คิวงาน' },
    { id: 'mine', label: 'ของฉัน' },
    { id: 'dashboard', label: 'แดชบอร์ด' },
    { id: 'weekly', label: '🤖 สรุปรายสัปดาห์' },
    { id: 'kb', label: '📚 คลังความรู้' },
  ];
  var tabsHtml = tabs.map(function (x) {
    return '<button class="af-tab' + (tab === x.id ? ' on' : '') + '" onclick="window.hdGo(\'' + x.id + '\')">' + x.label + '</button>';
  }).join('');

  var body = '';
  if (tab === 'dashboard') body = hdDashboardHtml();
  else if (tab === 'weekly') body = hdWkHtml();
  else if (tab === 'kb') body = '<div id="hd-kb-wrap" style="padding:16px 20px 28px;"><div style="color:var(--txt3);font-size:13px;">⏳ กำลังโหลดคลังความรู้...</div></div>';
  else body = hdQueueHtml(tab === 'mine');

  root.innerHTML =
    '<div class="af-tabs" style="position:sticky;top:0;z-index:11;background:var(--surface);border-bottom:1px solid var(--border);padding:0 20px;display:flex;gap:4px;align-items:center;">'
    + tabsHtml
    + '<div style="flex:1"></div>'
    + (canAdd ? '<button class="btn btn-ghost btn-sm" style="margin:6px 6px 6px 0;" onclick="window.hdShowPublicFormLink()">🔗 ลิงก์ฟอร์มแจ้งเอง</button>' : '')
    + (canAdd ? '<button class="btn btn-ghost btn-sm" style="margin:6px 6px 6px 0;" onclick="window.hdLineOpen()" title="วางแชท LINE หรือเปิดไฟล์บันทึกแชท ให้ AI แยกเป็นหลาย Ticket">🤖 วางแชท LINE</button>' : '')
    + (canAdd ? '<button class="btn btn-pri btn-sm" style="margin:6px 0;" onclick="window.hdOpenModal(null)">+ แจ้งแทน</button>' : '')
    + '</div>'
    + '<div id="hd-body">' + body + '</div>';

  if (tab === 'dashboard') hdRenderCharts();
  if (tab === 'weekly') hdWkAfterRender();
  if (tab === 'kb') hdKbLoad();
}

// ── QUEUE (คิวงาน / ของฉัน) ─────────────────────────────────────────────
// แถบ "มุมมอง" แทนตัวกรองสถานะ — ค่าเริ่มต้น "ต้องทำตอนนี้" (เกิน/ใกล้ SLA, ยังไม่มอบหมาย, ลูกค้าตอบรอเราตอบ)
// x = ข้อมูลคำนวณของแถว { open, sla, wait } จาก hdQInfo()
var HD_VIEWS = [
  { id: 'now', label: '🔴 ต้องทำตอนนี้', hot: true, fn: function (t, x) {
    return x.open && (x.sla.state === 'breach' || x.sla.state === 'warn' || !t.assigneeId || x.wait === 'reply' || t.status === 'reopened');
  } },
  { id: 'reply', label: '💬 ลูกค้าตอบกลับ', hot: true, fn: function (t, x) { return x.wait === 'reply'; } },
  { id: 'unassigned', label: '👤 ยังไม่มอบหมาย', hot: true, fn: function (t, x) { return x.open && !t.assigneeId; } },
  { sep: true },
  { id: 'doing', label: '🛠 กำลังทำ', fn: function (t) { return ['new', 'triage', 'assigned', 'in_progress', 'reopened'].indexOf(t.status) >= 0; } },
  { id: 'pending', label: '⏸ รอผู้แจ้ง', fn: function (t) { return t.status === 'pending_user'; } },
  { id: 'resolved', label: '✅ แก้แล้ว รอปิด', fn: function (t) { return t.status === 'resolved'; } },
  { id: 'closed', label: '📦 ปิด / ยกเลิก', fn: function (t) { return t.status === 'closed' || t.status === 'cancelled'; } },
  { id: 'all', label: 'ทั้งหมด', fn: function () { return true; } },
];
var HD_CH_ICON = { line: '💬', web: '🌐', phone: '📞', import: '📥' };
var HD_WAIT = { team: '⏳ รอทีม', user: '⏸ รอผู้แจ้ง', reply: '💬 ลูกค้าตอบ รอเราตอบ' };

// ระยะเวลาแบบอ่านง่าย: 25 นาที / 3 ชม. 10 น. / 1 วัน 5 ชม.
function hdDur(ms) {
  var mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return mins + ' นาที';
  var h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return h + ' ชม.' + (m ? ' ' + m + ' น.' : '');
  return Math.floor(h / 24) + ' วัน' + (h % 24 ? ' ' + (h % 24) + ' ชม.' : '');
}
function hdAgo(iso) {
  var ms = Date.now() - new Date(iso);
  if (!iso || isNaN(ms)) return '-';
  return ms < 60000 ? 'เมื่อสักครู่' : hdDur(ms) + 'ก่อน';
}

// สถานะ SLA ของแถว: breach | warn | ok | paused | done (+ ข้อความ/เปอร์เซ็นต์เวลาที่ใช้ไป)
function hdSlaInfo(t) {
  var st = hdStatus(t.status), now = Date.now();
  if (!st.open) {
    var end = t.resolvedAt || t.closedAt;
    if (t.status === 'cancelled' || !end) return { state: 'done' };
    var met = !t.resolutionBreached && (!t.resolutionDue || new Date(end) <= new Date(t.resolutionDue));
    return { state: 'done', used: hdDur(new Date(end) - new Date(t.createdAt || end)), met: met,
      over: met || !t.resolutionDue ? '' : hdDur(new Date(end) - new Date(t.resolutionDue)) };
  }
  var due = t.resolutionDue ? new Date(t.resolutionDue) : null;
  var start = new Date(t.createdAt || now), total = due ? due - start : 0;
  var pctAt = function (ts) { return total > 0 ? Math.min(100, Math.max(0, (ts - start) / total * 100)) : 100; };
  if (st.pauseSla) {
    var since = new Date(t.pendingSince || t.updatedAt || now);
    return { state: 'paused', txt: 'หยุดนับ · รอ ' + hdDur(now - since), pct: due ? pctAt(since) : 0 };
  }
  if (!due) return { state: 'ok', txt: 'ไม่มี SLA', pct: 0 };
  var left = due - now;
  if (left < 0) return { state: 'breach', txt: 'เกิน ' + hdDur(-left), pct: 100 };
  return { state: left < 0.2 * total ? 'warn' : 'ok', txt: 'เหลือ ' + hdDur(left), pct: pctAt(now) };
}
var HD_SLA_RANK = { breach: 0, warn: 1, ok: 2, paused: 3, done: 4 };

// ── ความเคลื่อนไหวล่าสุดของแต่ละ Ticket (comment ล่าสุด) — ใช้บอก "รอใคร" + บรรทัดข้อความใต้หัวข้อ
// cache ผูกกับ updatedAt: ลูกค้าตอบ (help.html อัปเดต updated_at) → ดึงใหม่เอง · ทีมงานตอบ → hdAddEvent เรียก hdLastForget
var _hdLast = {}, _hdLastBusy = false;
window.hdLastForget = function (id) { delete _hdLast[id]; };
function hdLastOk(t) { var c = _hdLast[t.id]; return c && c.key === (t.updatedAt || t.createdAt); }
async function hdLastEnsure(list) {
  if (_hdLastBusy) return; // รอบที่กำลังดึงอยู่ จะวาดใหม่แล้วเรียกซ้ำเองตอนเสร็จ
  var need = list.filter(function (t) { return !hdLastOk(t); });
  var db = window.getDb && window.getDb();
  if (!need.length || !db) return;
  _hdLastBusy = true;
  try {
    for (var i = 0; i < need.length; i += 100) {
      var part = need.slice(i, i + 100);
      var r = await db.from('helpdesk_ticket_events').select('ticket_id,actor_type,actor_id,body,is_internal,created_at')
        .eq('type', 'comment').in('ticket_id', part.map(function (t) { return t.id; })).order('created_at', { ascending: false });
      if (r.error) console.warn('[helpdesk] last events:', r.error);
      var got = {};
      (r.data || []).forEach(function (e) {
        var g = got[e.ticket_id] || (got[e.ticket_id] = { last: null, pub: null });
        if (!g.last) g.last = e;
        if (!g.pub && !e.is_internal) g.pub = e;
      });
      // ทุกตัวที่ขอ (รวมที่ไม่มี comment / ดึงพลาด) จด key ไว้ กันดึงซ้ำวนไม่จบ
      part.forEach(function (t) { _hdLast[t.id] = Object.assign({ key: t.updatedAt || t.createdAt, last: null, pub: null }, got[t.id]); });
    }
  } finally { _hdLastBusy = false; }
  var tab = window.hdTab || 'queue';
  if (!window.hdOpenId && (tab === 'queue' || tab === 'mine')) hdQueueRedraw();
}

function hdWait(t, open) {
  if (!open) return '';
  if (t.status === 'pending_user') return 'user';
  var c = _hdLast[t.id];
  return c && c.pub && c.pub.actor_type === 'reporter' ? 'reply' : 'team';
}
function hdQInfo(t) {
  var open = hdStatus(t.status).open;
  return { open: open, sla: hdSlaInfo(t), wait: hdWait(t, open) };
}
function hdEvWho(e) {
  if (e.actor_type === 'reporter') return 'ผู้แจ้ง';
  return hdStaffName(e.actor_id) || 'ทีมงาน';
}

// ตัวกรองทั้งหมดยกเว้น "มุมมอง" (แถบมุมมองใช้นับตัวเลขของแต่ละปุ่มจากชุดนี้)
function hdFiltered(mineOnly) {
  var f = window.hdFilter || {};
  var meId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  return (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (mineOnly) { if (!meId || t.assigneeId !== meId) return false; }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === '-' ? t.assigneeId : (f.assignee && t.assigneeId !== f.assignee)) return false;
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

function hdQRow(t, x, no, meId, canEditHd) {
  var st = hdStatus(t.status), pr = hdPri(t.priority), h = hdHosp(t.hospitalId), cat = hdCat(t.categoryId);
  var c = _hdLast[t.id] || {}, L = c.last;
  var title = t.subject || t.description || '(ไม่มีรายละเอียด)';
  var age = x.open
    ? '<div class="hd-q-sub' + (Date.now() - new Date(t.createdAt) > 2 * 864e5 ? ' old' : '') + '">' + (HD_CH_ICON[t.channel] || '') + ' ค้าง ' + hdDur(Date.now() - new Date(t.createdAt)) + '</div>'
    : '<div class="hd-q-sub">' + (HD_CH_ICON[t.channel] || '') + ' ' + hdDT(t.createdAt).slice(0, 10) + '</div>';
  var line2 = (cat ? '<span class="hd-q-cat">' + esc(cat.name) + '</span>' : '')
    + (L ? '<span class="hd-q-msg">' + (L.is_internal ? '🔒 ' : '') + esc(hdEvWho(L)) + ': ' + esc(String(L.body || '').split('\n')[0]) + '</span>' : '')
    + (t.reopenedCount ? '<span class="hd-q-flag">♻️ เปิดซ้ำ ' + t.reopenedCount + '</span>' : '');
  var sla = x.sla, slaHtml;
  if (sla.state === 'done') {
    slaHtml = sla.used
      ? '<div class="hd-q-done">ใช้ ' + sla.used + ' ' + (sla.met ? '<span class="ok">✓</span>' : '<span class="bad">✗ เกิน ' + sla.over + '</span>') + '</div>'
        + '<div class="hd-q-sub">' + (t.csatScore != null ? '⭐ ' + t.csatScore + '/5' : t.status === 'resolved' ? 'รอประเมิน' : '') + '</div>'
      : '<span class="hd-q-sub">—</span>';
  } else {
    slaHtml = '<div class="hd-q-sla">' + esc(sla.txt) + '</div><span class="hd-q-bar"><i style="width:' + Math.round(sla.pct) + '%"></i></span>';
  }
  var owner = hdStaffName(t.assigneeId);
  var ownerHtml = owner ? esc(owner)
    : (x.open && canEditHd && meId
      ? '<button class="btn btn-pri btn-sm hd-q-take" onclick="event.stopPropagation();window.hdSetField(\'' + t.id + '\',\'assigneeId\',\'' + meId + '\')">รับงาน</button>'
      : '<span class="hd-q-sub">—</span>');
  return '<tr class="hd-q-row s-' + sla.state + '" tabindex="0" onclick="window.hdOpen(\'' + t.id + '\')" onkeydown="if(event.key===\'Enter\')window.hdOpen(\'' + t.id + '\')">'
    + '<td class="hd-q-no">' + no + '</td>'
    + '<td><div class="hd-q-tk">' + esc(t.ticketNo) + '</div>' + age + '</td>'
    + '<td class="hd-q-subj"><div class="hd-q-title" title="' + esc(t.description || title) + '">' + esc(title) + '</div>'
    + (line2 ? '<div class="hd-q-line2' + (x.wait === 'reply' ? ' reply' : '') + '">' + line2 + '</div>' : '') + '</td>'
    + '<td><div class="hd-q-hosp">' + esc((h && h.name) || '-') + '</div>' + (t.reporterName ? '<div class="hd-q-sub">' + esc(t.reporterName) + '</div>' : '') + '</td>'
    + '<td><span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span></td>'
    + '<td><span class="hd-pill" style="color:' + st.color + ';background:' + st.color + '1e;">' + st.icon + ' ' + esc(st.label) + '</span>'
    + (x.wait ? '<div class="hd-q-wait w-' + x.wait + '">' + HD_WAIT[x.wait] + '</div>' : '') + '</td>'
    + '<td class="hd-q-owner">' + ownerHtml + '</td>'
    + '<td>' + slaHtml + '</td>'
    + '<td class="hd-q-upd"><b>' + hdAgo(t.updatedAt || t.createdAt) + '</b>' + (L ? esc(hdEvWho(L)) : '') + '</td>'
    + '</tr>';
}

function hdQueueHtml(mineOnly) {
  var f = window.hdFilter || {};
  var meId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  var canEditHd = window.canEdit && window.canEdit('helpdesk');
  var base = hdFiltered(mineOnly).map(function (t) { return { t: t, x: hdQInfo(t) }; });

  var viewId = f.view || 'now';
  var view = HD_VIEWS.find(function (v) { return v.id === viewId; }) || HD_VIEWS[0];
  var viewsHtml = HD_VIEWS.map(function (v) {
    if (v.sep) return '<span class="hd-view-sep"></span>';
    var n = base.filter(function (r) { return v.fn(r.t, r.x); }).length;
    return '<button class="hd-view' + (v.id === view.id ? ' on' : '') + (v.hot && n ? ' hot' : '') + '" onclick="window.hdSetFilter(\'view\',\'' + v.id + '\')">'
      + v.label + '<span class="n">' + n + '</span></button>';
  }).join('');

  // เรียง: ด่วนตาม SLA ก่อน (เกิน → ใกล้เกิน → ปกติ → หยุดนับ → จบแล้ว) · งานเปิดเรียงตาม due · งานจบเรียงใหม่ → เก่า
  var rows = base.filter(function (r) { return view.fn(r.t, r.x); }).sort(function (a, b) {
    var d = HD_SLA_RANK[a.x.sla.state] - HD_SLA_RANK[b.x.sla.state];
    if (d) return d;
    if (a.x.open) return (a.t.resolutionDue || '9').localeCompare(b.t.resolutionDue || '9');
    return (b.t.resolvedAt || b.t.updatedAt || '').localeCompare(a.t.resolvedAt || a.t.updatedAt || '');
  });

  var staffOpts = '<option value="">ผู้รับผิดชอบ: ทั้งหมด</option><option value="-"' + (f.assignee === '-' ? ' selected' : '') + '>— ยังไม่มอบหมาย —</option>'
    + (window.STAFF || []).filter(function (s) { return s.active; })
      .map(function (s) { return '<option value="' + s.id + '"' + (f.assignee === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
  var catOpts = '<option value="">หมวด: ทั้งหมด</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '"' + (f.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  var prOpts = '<option value="">Priority: ทั้งหมด</option>' + (window.HD_PRIORITY || [])
    .map(function (p) { return '<option value="' + p.id + '"' + (f.priority === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  var groupOpts = [['', 'จัดกลุ่ม: ไม่จัด'], ['hosp', 'จัดกลุ่ม: ตาม รพ.'], ['owner', 'จัดกลุ่ม: ตามผู้รับผิดชอบ'], ['wait', 'จัดกลุ่ม: ตามรอใคร']]
    .map(function (g) { return '<option value="' + g[0] + '"' + ((f.group || '') === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('');
  var pageSize = window.hdPageSize || 50;
  var pageSizeOpts = [50, 100, 500, 1000].map(function (n) { return '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' แถว/หน้า</option>'; }).join('');

  var toolbar =
    '<div class="toolbar" style="position:sticky;top:0;z-index:10;background:var(--surface);flex-wrap:wrap;">'
    + '<div class="t-search"><input id="hd-q" placeholder="ค้นหา เลขที่ / หัวข้อ / ผู้แจ้ง / รพ." value="' + esc(f.q || '') + '" oninput="window.hdSetFilter(\'q\',this.value)"></div>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'priority\',this.value)">' + prOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'assignee\',this.value)">' + staffOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'category\',this.value)">' + catOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'group\',this.value)">' + groupOpts + '</select>'
    + '<div style="flex:1"></div>'
    + '<select class="t-sel" onchange="window.hdSetPageSize(this.value)">' + pageSizeOpts + '</select>'
    + '</div>'
    + '<div class="hd-views">' + viewsHtml + '</div>';

  var cnt = function (s) { return rows.filter(function (r) { return r.x.sla.state === s; }).length; };
  var unassigned = base.filter(function (r) { return r.x.open && !r.t.assigneeId; }).length;
  var bits = [];
  if (cnt('breach')) bits.push('<span class="bad">เกิน SLA ' + cnt('breach') + '</span>');
  if (cnt('warn')) bits.push('<span class="warn">ใกล้เกิน ' + cnt('warn') + '</span>');
  var unInView = rows.filter(function (r) { return r.x.open && !r.t.assigneeId; }).length;
  if (unInView) bits.push('ยังไม่มอบหมาย ' + unInView);
  var summary = '<div class="hd-q-count"><span><b>' + rows.length + '</b> เรื่อง' + (rows.length < base.length ? ' จาก ' + base.length : '') + '</span>'
    + (bits.length ? '<span class="bits">' + bits.join(' · ') + '</span>' : '')
    + '<span class="sort">เรียงตาม: ใกล้หมด SLA ก่อน</span>'
    + (unassigned && canEditHd ? '<button class="btn btn-ghost btn-sm" onclick="window.hdAiAssignBulk()" title="ให้ AI แนะนำผู้รับผิดชอบจากประสบการณ์และงานค้างของแต่ละคน">🤖 AI จัดคนให้ (' + unassigned + ')</button>' : '')
    + '</div>';

  var totalRows = rows.length;
  var totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  window.hdPage = Math.min(Math.max(1, window.hdPage || 1), totalPages);
  var page = window.hdPage;
  var pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  var keyFn = {
    hosp: function (r) { return '🏥 ' + ((hdHosp(r.t.hospitalId) || {}).name || 'ไม่ระบุ รพ.'); },
    owner: function (r) { return '👤 ' + (hdStaffName(r.t.assigneeId) || 'ยังไม่มอบหมาย'); },
    wait: function (r) { return HD_WAIT[r.x.wait] || '✅ จบแล้ว'; },
  }[f.group];
  var groups = [], gIdx = {};
  pageRows.forEach(function (r, i) {
    r.no = (page - 1) * pageSize + i + 1;
    var k = keyFn ? keyFn(r) : '';
    if (!(k in gIdx)) { gIdx[k] = groups.length; groups.push({ k: k, items: [] }); }
    groups[gIdx[k]].items.push(r);
  });
  var trs = groups.map(function (g) {
    return (g.k ? '<tr class="hd-q-g"><td colspan="9">' + esc(g.k) + '<span>' + g.items.length + '</span></td></tr>' : '')
      + g.items.map(function (r) { return hdQRow(r.t, r.x, r.no, meId, canEditHd); }).join('');
  }).join('');

  var table =
    '<div class="hd-q-wrap"><table class="hd-q">'
    + '<thead><tr><th>#</th><th>เลขที่ / อายุ</th><th>เรื่อง · ข้อความล่าสุด</th><th>รพ. / ผู้แจ้ง</th><th>P</th><th>สถานะ · รอใคร</th><th>ผู้รับผิดชอบ</th><th>SLA</th><th>ล่าสุด</th></tr></thead>'
    + '<tbody>' + (trs || '<tr><td colspan="9" class="hd-q-empty">' + (view.id === 'now' ? 'ไม่มีเรื่องที่ต้องทำตอนนี้ 🎉' : 'ไม่มี Ticket') + '</td></tr>') + '</tbody></table></div>';

  var pager = totalPages > 1
    ? '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:0 24px 24px;">'
      + '<span style="font-size:12px;color:var(--txt3);">หน้า ' + page + ' / ' + totalPages + ' (ทั้งหมด ' + totalRows + ' รายการ)</span>'
      + '<button class="btn btn-ghost btn-sm"' + (page <= 1 ? ' disabled' : '') + ' onclick="window.hdGoPage(-1)">← ย้อนกลับ</button>'
      + '<button class="btn btn-ghost btn-sm"' + (page >= totalPages ? ' disabled' : '') + ' onclick="window.hdGoPage(1)">ถัดไป →</button>'
      + '</div>'
    : '';

  // งานเปิดทั้งหมด (ใช้นับ "ลูกค้าตอบกลับ") + แถวในหน้านี้ → โหลดข้อความล่าสุดที่ยังไม่มี/เก่าแล้ว
  var needLast = base.filter(function (r) { return r.x.open; }).map(function (r) { return r.t; })
    .concat(pageRows.map(function (r) { return r.t; }));
  setTimeout(function () { hdLastEnsure(needLast); }, 0);

  return toolbar + summary + table + pager;
}

// วาดคิวใหม่ — คงโฟกัส/ตำแหน่งเคอร์เซอร์ช่องค้นหาไว้ (พิมพ์ค้นหาอยู่จะได้ไม่หลุด)
function hdQueueRedraw() {
  var b = document.getElementById('hd-body'); if (!b) return;
  var a = document.activeElement, sel = a && a.id === 'hd-q' ? [a.selectionStart, a.selectionEnd] : null;
  b.innerHTML = hdQueueHtml((window.hdTab || 'queue') === 'mine');
  if (sel) { var i = document.getElementById('hd-q'); if (i) { i.focus(); i.setSelectionRange(sel[0], sel[1]); } }
}

window.hdSetPageSize = function (val) {
  window.hdPageSize = parseInt(val, 10) || 50;
  window.hdPage = 1;
  hdQueueRedraw();
};

window.hdGoPage = function (delta) {
  window.hdPage = (window.hdPage || 1) + delta;
  hdQueueRedraw();
};

window.hdSetFilter = function (key, val) {
  window.hdFilter = window.hdFilter || {};
  window.hdFilter[key] = val;
  window.hdPage = 1;
  hdQueueRedraw();
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

  // ปิดงาน/ยกเลิกแล้ว = ล็อก: พิมพ์/ตอบกลับ/แก้ข้อมูลไม่ได้ เหลือแค่เปิดงานใหม่ (ผ่านปุ่ม หรือเปลี่ยนสถานะ)
  var locked = t.status === 'closed' || t.status === 'cancelled';
  var dis = canEdit && !locked ? '' : ' disabled';
  var sla = hdSlaCell(t);

  // วาด Ticket เดิมซ้ำ (realtime: ลูกค้าตอบ/เพื่อนร่วมทีมแก้) → เก็บข้อความที่กำลังพิมพ์ไว้ ไม่ให้หาย
  var oldTa = document.getElementById('hd-reply');
  var draft = oldTa && root._hdId === t.id ? {
    txt: oldTa.value, focus: document.activeElement === oldTa, s: oldTa.selectionStart, e: oldTa.selectionEnd,
    internal: !!(document.getElementById('hd-reply-internal') || {}).checked,
  } : null;
  // วาด Ticket เดิมซ้ำ (เช่นหลังกดส่ง) → คงตำแหน่งเลื่อนหน้า + แชทเดิมไว้ระหว่างโหลดใหม่
  // (เดิมแชทหดเหลือ "กำลังโหลด..." หน้าเลยเด้งขึ้นบน ต้องเลื่อนลงมาหากล่องพิมพ์ทุกครั้ง)
  var oldChat = root._hdId === t.id && document.getElementById('hd-events');
  var keep = oldChat ? { scroll: root.scrollTop, html: oldChat.innerHTML, raw: oldChat._html, chatTop: oldChat.scrollTop } : null;
  root._hdId = t.id;
  root.classList.add('hd-fit'); // หน้ารายละเอียด = พอดีจอ (ดู helpdesk.css)

  root.innerHTML =
    '<div class="hd-dhead" style="padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:10;">'
    // มือถือ: แถวเดียวพอดีจอ — ← · เลขที่ · สถานะ ···· ℹ️ · 🤖 · 📞 (ปุ่มเหลือแค่ไอคอน: ซ่อน .hd-h-lbl)
    // ไม่แสดง Priority (ดูในแผง ℹ️ ได้) และปุ่มคัดลอกลิงก์/ข้อความ (.hd-h-desk) — ดู helpdesk.css
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdBack()" title="กลับไปคิวงาน">←<span class="hd-h-lbl"> คิวงาน</span></button>'
    + '<b class="hd-h-no" style="font-family:var(--mono);">' + esc(t.ticketNo) + '</b>'
    + '<span class="hd-pill hd-h-st" style="color:' + st.color + ';background:' + st.color + '1e;">' + st.icon + ' ' + esc(st.label) + '</span>'
    + '<span class="hd-pill hd-h-desk" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span>'
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost btn-sm hd-info-btn" onclick="window.hdToggleInfo(true)" title="ข้อมูล Ticket">ℹ️</button>' // มือถือเท่านั้น
    + (canEdit && !locked ? '<button class="btn btn-ghost btn-sm" onclick="window.hdAiRunDetail(\'' + t.id + '\',this)" title="AI วิเคราะห์">🤖<span class="hd-h-lbl"> AI วิเคราะห์</span></button>' : '')
    + (canEdit && !st.open ? '<button id="hd-kb-btn" class="btn btn-ghost btn-sm" style="display:none;" onclick="window.hdKbOpen(\'' + t.id + '\')" title="ให้ AI สรุปสาเหตุ/วิธีแก้จากบทสนทนา เก็บเข้าคลังความรู้">📚<span class="hd-h-lbl"> บันทึกวิธีแก้</span></button>' : '')
    + (t.priority === hdCriticalPriority() ? '<button class="btn btn-pri btn-sm" style="background:var(--coral,#e5484d)" onclick="window.open(\'' + hdJitsiUrl(t.ticketNo) + '\',\'_blank\')" title="เข้าร่วมสาย">📞<span class="hd-h-lbl"> เข้าร่วมสาย</span></button>' : '')
    + '<button class="btn btn-ghost btn-sm hd-h-desk" onclick="window.hdCopyLink(\'' + t.id + '\')">🔗 คัดลอกลิงก์</button>'
    + '<button class="btn btn-ghost btn-sm hd-h-desk" onclick="window.hdCopyMsg(\'' + t.id + '\')">📋 คัดลอกข้อความ</button>'
    + '</div>'
    + '<div id="hd-ai-detail" style="padding:0 20px;"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 320px;gap:16px;padding:16px 20px 32px;align-items:start;" class="hd-detail-grid">'
    //  LEFT
    + '<div class="hd-left">'
    + '<div class="ov-card hd-desc-wrap" style="margin-bottom:14px;">'
    + '<div class="ov-card-title">รายละเอียดปัญหา</div>'
    + '<div class="hd-desc-card">' + esc(t.description || '(ไม่มีรายละเอียด)') + '</div>'
    + '</div>'
    + '<div class="ov-card hd-chat-card"><div class="ov-card-title">💬 บทสนทนา / ไทม์ไลน์</div><div id="hd-events" class="hd-chat"><div class="hd-chat-empty">กำลังโหลด...</div></div>'
    + (canEdit && locked
      ? '<div class="hd-locked">🔒 งานนี้' + (t.status === 'cancelled' ? 'ถูกยกเลิก' : 'ปิด') + 'แล้ว — ไม่สามารถพิมพ์หรือตอบกลับได้ หากต้องดำเนินการต่อ กด <b>♻️ เปิดงานใหม่</b> ในส่วนข้อมูล Ticket</div>'
      : '')
    + (canEdit && !locked
      // กล่องพิมพ์แบบแชท: ข้อความ + ไฟล์ที่แนบ + แถบเครื่องมือ (📎 แนบไฟล์ · โน้ตภายใน · AI ร่าง) อยู่ในกรอบเดียว
      // ลากไฟล์มาวางทั้งกล่อง / Ctrl+V วางภาพได้ ──
      ? '<div class="hd-composer" id="hd-composer">'
      +   '<textarea id="hd-reply" class="hd-comp-ta" rows="2" placeholder="พิมพ์ข้อความ..." title="ลากไฟล์มาวาง หรือ Ctrl+V วางภาพได้"></textarea>'
      +   '<div class="att-list" id="hd-reply-files-list"></div><div class="att-err" id="hd-reply-files-err"></div>'
      +   '<div class="hd-comp-bar">'
      +     window.attPickerHtml('hd-reply-files', { compact: true, accept: window.HD_ATTACH_ACCEPT, hint: window.HD_ATTACH_HINT })
      +     '<label class="hd-comp-note" title="ไม่แสดงให้ผู้แจ้งเห็น"><input type="checkbox" id="hd-reply-internal"> 🔒 โน้ตภายใน</label>'
      +     '<div style="flex:1"></div>'
      +     '<button type="button" class="hd-comp-ai" onclick="window.hdAiDraftReplyRun(\'' + t.id + '\',this)" title="ให้ AI ร่างข้อความตอบผู้แจ้งจากรายละเอียดและบทสนทนา">🤖<span class="hd-comp-lbl"> ร่างข้อความตอบ</span></button>'
      +     '<button type="button" class="btn btn-pri btn-sm hd-comp-send" onclick="window.hdSendReply(\'' + t.id + '\',null)">ส่ง ➤</button>'
      +   '</div>'
      + '</div>'
      + '<div class="hd-reply-acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'
      + '<button class="btn btn-ghost btn-sm" onclick="window.hdSendReply(\'' + t.id + '\',\'pending_user\')" title="สถานะเป็น รอข้อมูลจากผู้แจ้ง — นาฬิกา SLA หยุดนับระหว่างรอ">⏳ ส่ง แล้วรอผู้แจ้งตอบ</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.hdSendReply(\'' + t.id + '\',\'resolved\')" title="สถานะเป็น แก้ไขแล้ว — ผู้แจ้งตรวจ/ให้คะแนนได้ ยังไม่ปิดงาน">✅ ส่ง แล้วแจ้งว่าแก้ไขเสร็จ</button>'
      + '</div>'
      : '')
    + '</div>'
    + '</div>'
    //  RIGHT
    + '<div class="ov-card hd-right">'
    // หัวการ์ด: ชื่อ + ปุ่มจัดการงานมุมขวา (ปิดงาน/เปิดงานใหม่ · ลบ)
    + '<div class="hd-card-head"><div class="ov-card-title" style="margin:0;">ข้อมูล Ticket</div><div class="hd-card-acts">'
    +   '<button class="btn btn-ghost btn-sm hd-info-close" onclick="window.hdToggleInfo(false)" title="ปิด">✕</button>' // มือถือเท่านั้น
    +   (canEdit && !locked ? '<button class="btn btn-ghost btn-sm" style="font-weight:700;" onclick="window.hdCloseTicket(\'' + t.id + '\')" title="ปิดงาน — หลังปิดจะพิมพ์/ตอบกลับไม่ได้">🔒 ปิดงาน</button>' : '')
    +   (canEdit && locked ? '<button class="btn btn-ghost btn-sm" onclick="window.hdSetField(\'' + t.id + '\',\'status\',\'reopened\')" title="เปิดงานใหม่เพื่อดำเนินการ/ตอบกลับต่อ">♻️ เปิดงานใหม่</button>' : '')
    +   (canEdit && window.canDel && window.canDel('helpdesk') ? '<button class="btn btn-ghost btn-sm" style="color:var(--coral);" onclick="window.hdDelete(\'' + t.id + '\')" title="ลบ Ticket">🗑️ ลบ</button>' : '')
    + '</div></div>'
    + '<div class="hd-field-grid">'
    + '<div><label class="hd-lbl">สถานะ</label><select class="t-sel hd-sel-tinted" style="width:100%;color:' + st.color + ';border-color:' + st.color + '55;background:' + st.color + '14;" onchange="window.hdSetField(\'' + t.id + '\',\'status\',this.value)"' + (canEdit ? '' : ' disabled') + '>' + stSel + '</select></div>'
    + '<div><label class="hd-lbl">Priority</label><select class="t-sel hd-sel-tinted" style="width:100%;color:' + pr.color + ';border-color:' + pr.color + '55;background:' + pr.color + '14;" onchange="window.hdSetField(\'' + t.id + '\',\'priority\',this.value)"' + dis + '>' + prSel + '</select></div>'
    + '<div><label class="hd-lbl">ผู้รับผิดชอบ' + (canEdit && st.open ? ' <a href="javascript:void(0)" class="hd-ai-link" onclick="window.hdAiAssignOne(\'' + t.id + '\')">🤖 แนะนำ</a>' : '') + '</label><select class="t-sel" style="width:100%" onchange="window.hdSetField(\'' + t.id + '\',\'assigneeId\',this.value)"' + dis + '>' + asSel + '</select></div>'
    + '<div><label class="hd-lbl">หมวดปัญหา</label><select class="t-sel" style="width:100%" onchange="window.hdSetField(\'' + t.id + '\',\'categoryId\',this.value)"' + dis + '>' + catSel + '</select></div>'
    + '<div id="hd-ai-assign" style="grid-column:1/-1;"></div>'
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
    + '</div>'
    + '</div>';

  if (canEdit && !locked) window.attPickerInit('hd-reply-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, dropOn: 'hd-composer', keep: !!draft });
  var ta = document.getElementById('hd-reply');
  if (ta && draft) {
    ta.value = draft.txt;
    var cb = document.getElementById('hd-reply-internal'); if (cb) cb.checked = draft.internal;
    if (draft.focus) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(draft.s, draft.e); } catch (e) {} }
  }
  if (keep) {
    var chat = document.getElementById('hd-events');
    chat.innerHTML = keep.html; chat._html = keep.raw; chat.scrollTop = keep.chatTop;
    root.scrollTop = keep.scroll;
  }
  hdLoadEvents(t);
  hdLiveStart(t.id);
}

// ── Realtime ของ Ticket ที่เปิดดูอยู่: ลูกค้าตอบ/แนบไฟล์ หรือเพื่อนร่วมทีมตอบ → บทสนทนาอัปเดตเองไม่ต้องกด F5
// (ตาราง helpdesk_tickets มี realtime ทั้งรายการอยู่แล้วใน helpdesk.service.js — ตรงนี้ฟังเฉพาะ events/ไฟล์แนบของ Ticket นี้)
// ถ้า channel ต่อไม่ติด → ดึงใหม่ทุก 20 วินาทีแทน · ออกจากหน้ารายละเอียด/เปลี่ยน Ticket → ปิด channel ──
var _hdLive = { id: null, ch: null, ok: false, timer: null, poll: null };
function hdLiveStart(id) {
  if (_hdLive.id === id && _hdLive.ch) return;
  hdLiveStop();
  var db = window.getDb && window.getDb();
  if (!db || !db.channel) return;
  var f = 'ticket_id=eq.' + id;
  var soon = function () { clearTimeout(_hdLive.timer); _hdLive.timer = setTimeout(hdLiveRefresh, 400); };
  _hdLive.id = id;
  _hdLive.ch = db.channel('hd-ticket-' + id + '-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'helpdesk_ticket_events', filter: f }, soon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'helpdesk_attachments', filter: f }, soon)
    .subscribe(function (s) { _hdLive.ok = s === 'SUBSCRIBED'; });
  _hdLive.poll = setInterval(function () { if (!_hdLive.ok && !document.hidden) hdLiveRefresh(); }, 20000);
}
function hdLiveStop() {
  clearTimeout(_hdLive.timer); clearInterval(_hdLive.poll);
  var db = window.getDb && window.getDb();
  if (_hdLive.ch && db) db.removeChannel(_hdLive.ch);
  _hdLive = { id: null, ch: null, ok: false, timer: null, poll: null };
}
function hdLiveRefresh() {
  if (window.hdOpenId !== _hdLive.id) { hdLiveStop(); return; }
  var t = (window.HELPDESK_TICKETS || []).find(function (x) { return x.id === _hdLive.id; });
  if (t) hdLoadEvents(t, true);
}
document.addEventListener('visibilitychange', function () { if (!document.hidden && _hdLive.id) hdLiveRefresh(); });

function hdAttachHtml(list) {
  if (!list || !list.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">' + list.map(function (a) {
    if (window.hdIsImage && window.hdIsImage(a.mime, a.file_name)) {
      return '<a href="' + esc(a.file_url) + '" target="_blank" title="' + esc(a.file_name) + '">'
        + '<img src="' + esc(a.file_url) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"></a>';
    }
    var kb = a.size_bytes ? ' · ' + Math.max(1, Math.round(a.size_bytes / 1024)) + ' KB' : '';
    return '<a href="' + esc(a.file_url) + '" target="_blank" download="' + esc(a.file_name) + '" style="font-size:12px;color:var(--violet);border:1px solid var(--border);border-radius:8px;padding:4px 10px;">📎 ' + esc(a.file_name) + kb + '</a>';
  }).join('') + '</div>';
}

// ── บทสนทนาแบบ LINE/Messenger: ทีมงานขวา ฟองเขียว · ผู้แจ้ง (ลูกค้า) ซ้าย อวาตาร์+ชื่อ (โน้ตภายใน = ฟองส้ม, วิธีแก้เข้าคลังความรู้ = ฟองเขียวอ่อน)
// เหตุการณ์ระบบ (เปลี่ยนสถานะ/มอบหมาย/แก้ข้อมูล) = บรรทัดเล็กกลางจอ · คั่นเมื่อขึ้นวันใหม่ · ข้อความยาวย่อไว้ กด "ดูทั้งหมด"
// กล่องสูงจำกัด เลื่อนดูได้ และเลื่อนไปข้อความล่าสุดให้เอง ──
function hdChatDay(iso) {
  var d = new Date(iso); if (isNaN(d)) return '';
  var TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return d.getDate() + ' ' + TH[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}
function hdChatTime(iso) {
  var d = new Date(iso); if (isNaN(d)) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// ชื่อทีมงานในแชท — หาพนักงานไม่เจอ (บัญชีถูกลบ/ไม่มี actor_id) → ใช้คำว่า "ทีมงาน"
function hdChatStaff(id) { return hdStaffName(id) || 'ทีมงาน'; }
window.hdChatMore = function (btn) {
  var body = btn.previousElementSibling, open = body.classList.toggle('open');
  btn.textContent = open ? 'ย่อ ▴' : 'ดูทั้งหมด ▾';
};
async function hdLoadEvents(t, live) {
  if (!document.getElementById('hd-events')) return;
  var evs = await window.hdFetchEvents(t.id, true); // ฝั่งทีมเห็นโน้ตภายในด้วย
  var atts = await window.hdFetchAttachments(t.id);
  var box = document.getElementById('hd-events'); // ดึงหลัง await — ระหว่างรอหน้าอาจถูกวาดใหม่แล้ว
  if (!box || window.hdOpenId !== t.id) return;
  var kbBtn = document.getElementById('hd-kb-btn'); // ปิดงานแล้วแต่ยังไม่มีวิธีแก้ในคลังความรู้ → โชว์ปุ่มให้บันทึก
  if (kbBtn) kbBtn.style.display = evs.some(hdIsKbEvent) ? 'none' : '';
  var byEvent = {};
  (atts || []).forEach(function (a) { (byEvent[a.event_id || ''] = byEvent[a.event_id || ''] || []).push(a); });
  if (!evs.length && !atts.length) { box.innerHTML = '<div class="hd-chat-empty">ยังไม่มีความเคลื่อนไหว</div>'; return; }
  var lastDay = '', html = '', prev = null; // prev = ข้อความก่อนหน้า (ใช้จัดกลุ่มแบบ LINE)
  evs.forEach(function (e) {
    var day = hdChatDay(e.created_at);
    if (day && day !== lastDay) { html += '<div class="hd-chat-day"><span>' + day + '</span></div>'; lastDay = day; prev = null; }
    var time = hdChatTime(e.created_at), files = byEvent[e.id];
    // เหตุการณ์ระบบ → ป้ายเล็กกลางจอ
    if (e.type !== 'comment') {
      var meta = (window.HD_EVENT_TYPE || {})[e.type] || { icon: '•' };
      var txt = e.type === 'status_change' && e.meta
        ? 'เปลี่ยนสถานะ ' + (hdStatus(e.meta.from).label || e.meta.from || '') + ' → ' + (hdStatus(e.meta.to).label || e.meta.to || '')
        : (e.body || meta.label || '');
      var by = e.actor_type === 'reporter' ? 'ผู้แจ้ง' : e.actor_type === 'system' ? '' : hdChatStaff(e.actor_id);
      html += '<div class="hd-chat-sys"><span>' + meta.icon + ' ' + esc(txt) + (by ? ' · โดย ' + esc(by) : '') + ' · ' + time + '</span></div>'
        + (files ? '<div class="hd-chat-sys">' + hdAttachHtml(files) + '</div>' : '');
      prev = null;
      return;
    }
    // ข้อความ → แถวแชท: ฝั่งทีมงานเป็น "เรา" → ทีมงานขวา ฟองเขียว (+ชื่อ เพราะมีหลายคน) / ผู้แจ้งซ้าย อวาตาร์+ชื่อ
    // (หน้าลูกค้า help.html ใช้รูปแบบเดียวกันแต่สลับข้าง: ลูกค้าขวา ทีมงานซ้าย)
    var fromCust = e.actor_type === 'reporter', mine = !fromCust;
    var kb = hdIsKbEvent(e), note = e.is_internal && !kb;
    var who = fromCust ? (t.reporterName || 'ผู้แจ้ง') : hdChatStaff(e.actor_id);
    var key = (fromCust ? 'r:' : 'a:' + (e.actor_id || '')) + (note ? ':n' : '') + (kb ? ':k' : '');
    // ข้อความต่อเนื่องจากคนเดิม (ห่างไม่เกิน 5 นาที) → ไม่ซ้ำชื่อ/อวาตาร์
    var cont = prev && prev.key === key && (new Date(e.created_at) - new Date(prev.at)) < 5 * 60000;
    prev = { key: key, at: e.created_at };
    var body = String(e.body || '');
    if (body === '(แนบไฟล์)' && files) body = ''; // ส่งแค่ไฟล์ → โชว์ไฟล์อย่างเดียว
    var long = body.length > 280 || body.split('\n').length > 6;
    var tag = note ? '<span class="hd-bub-tag">🔒 โน้ตภายใน</span>' : kb ? '<span class="hd-bub-tag kb">📚 วิธีแก้ (คลังความรู้)</span>' : '';
    html += '<div class="hd-row ' + (mine ? 'me' : 'them') + (cont ? ' cont' : '') + '">'
      + (mine ? '' : '<div class="hd-av" title="' + esc(who) + '">' + esc(who.charAt(0)) + '</div>')
      + '<div class="hd-col">'
      +   (cont ? '' : '<div class="hd-name">' + esc(who) + '</div>')
      +   '<div class="hd-line">'
      +     '<div class="hd-bub' + (note ? ' note' : '') + (kb ? ' kb' : '') + '">' + tag
      +       (body ? '<div class="hd-bub-body' + (long ? ' clamp' : '') + '">' + esc(body) + '</div>'
                + (long ? '<button type="button" class="hd-msg-more" onclick="window.hdChatMore(this)">ดูทั้งหมด ▾</button>' : '') : '')
      +       (files ? hdAttachHtml(files) : '')
      +     '</div>'
      +     '<span class="hd-time">' + time + '</span>'
      +   '</div>'
      + '</div></div>';
  });
  if (byEvent['']) html += '<div class="hd-chat-sys"><span>📎 ไฟล์แนบ</span></div><div class="hd-chat-sys">' + hdAttachHtml(byEvent['']) + '</div>';
  if (live && box._html === html) return; // realtime แต่ไม่มีอะไรเปลี่ยน → ไม่วาดซ้ำ (ข้อความที่กดขยายไว้ไม่หุบ)
  // realtime: เลื่อนไปข้อความใหม่เฉพาะตอนอยู่ท้ายแชทอยู่แล้ว — ถ้ากำลังเลื่อนอ่านข้อความเก่า ไม่ดึงกลับลงล่าง
  var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80, keepTop = box.scrollTop;
  box.innerHTML = html;
  box._html = html;
  box.scrollTop = !live || atBottom ? box.scrollHeight : keepTop; // เปิดมาเห็นข้อความล่าสุด
  if (!box._stickBound) { // อยู่ท้ายแชท → รูปแนบโหลดเสร็จ/กล่องเปลี่ยนขนาด ก็ยังเห็นข้อความล่าสุด
    box._stickBound = true; box._stick = true;
    var stick = function () { if (box._stick) box.scrollTop = box.scrollHeight; };
    box.addEventListener('scroll', function () { box._stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40; });
    box.addEventListener('load', stick, true);
    if (window.ResizeObserver) new ResizeObserver(stick).observe(box);
  }
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
  if (val === 'closed' && !t.closedAt) {
    patch.closed_at = now;
    if (!t.resolvedAt) { // ปิดงานตรงจากสถานะที่ยังไม่ "แก้ไขแล้ว" — นับเป็นแก้เสร็จด้วย (SLA/สถิติ/ลิงก์ติดตามของลูกค้า)
      patch.resolved_at = now;
      var exp2 = new Date(); exp2.setDate(exp2.getDate() + 30);
      patch.public_view_expires_at = exp2.toISOString();
    }
  }
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
    var wasOpen = hdStatus(t.status).open;
    return hdWriteFull(id, tr.patch, tr.evt).then(function () {
      if (wasOpen && (val === 'resolved' || val === 'closed')) hdKbPromptIfMissing(id);
    });
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
    return hdWriteFull(id, p, { type: 'assignment', body: val ? ('มอบหมายให้ ' + hdStaffName(val)) : 'ยกเลิกการมอบหมาย' });
  }
  if (field === 'categoryId') {
    return hdWriteFull(id, { category_id: val }, { type: 'field_change', body: 'ปรับหมวดปัญหา' });
  }
};

window.hdSendReply = async function (id, thenStatus) {
  var t = hdTicket(id); if (!t) return;
  if (t.status === 'closed' || t.status === 'cancelled') { window.showAlert && window.showAlert('งานนี้ปิดแล้ว — เปิดงานใหม่ก่อนจึงตอบกลับได้', 'warn'); return; }
  var ta = document.getElementById('hd-reply');
  var internalCb = document.getElementById('hd-reply-internal');
  var files = window.attPickerFiles('hd-reply-files');
  var txt = (ta && ta.value || '').trim();
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
      // ส่งแล้ว → ล้างกล่องพิมพ์ทันที (ก่อนวาดหน้าใหม่ — ไม่งั้นระบบ "คงข้อความที่พิมพ์ค้าง" จะคืนข้อความ/ไฟล์ที่ส่งไปแล้วกลับมา)
      if (ta) ta.value = '';
      if (internalCb) internalCb.checked = false;
      window.attPickerClear('hd-reply-files');
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
    if ((thenStatus === 'resolved' || thenStatus === 'closed') && hdStatus(t.status).open) hdKbPromptIfMissing(id);
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
};

// ── ปิดงาน (ปุ่มเดียว): มีข้อความ/ไฟล์ที่พิมพ์ค้างไว้ → ส่งก่อนแล้วปิด · ไม่มี → ปิดเลย
// ยืนยันก่อนเสมอ เพราะหลังปิดจะพิมพ์/ตอบกลับไม่ได้ (ทั้งทีมงานและลูกค้า) จนกว่าจะเปิดงานใหม่ ──
window.hdCloseTicket = function (id) {
  var t = hdTicket(id); if (!t) return;
  var hasMsg = !!(((document.getElementById('hd-reply') || {}).value || '').trim() || window.attPickerFiles('hd-reply-files').length);
  window.showConfirm('ปิดงาน ' + t.ticketNo + ' ?'
    + (hasMsg ? '\nข้อความที่พิมพ์ไว้จะถูกส่งก่อนปิดงาน' : '')
    + '\nหลังปิดงานจะพิมพ์หรือตอบกลับไม่ได้ (กด "เปิดงานใหม่" ได้ภายหลัง)', function () {
    if (hasMsg) window.hdSendReply(id, 'closed');
    else window.hdSetField(id, 'status', 'closed');
  }, { icon: '🔒', title: 'ปิดงาน', okText: hasMsg ? 'ส่งข้อความและปิดงาน' : 'ปิดงาน' });
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
    function positionDrop() { window.placeDropdown(inp, drop, lst, 280); }
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
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('hdf-hosp-cmb-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
    // ให้โค้ดเลือกโรงพยาบาลแทนผู้ใช้ได้ (เช่น จับคู่จากชื่อกลุ่ม LINE) — ต้องตั้งทั้งค่าซ่อน (ที่ใช้บันทึก) และข้อความที่แสดง
    inp._hdSetHosp = function (id) {
      var it = items.find(function (x) { return x.id === id; });
      if (!it) return;
      selItem(it.id, it.label);
      inp.value = it.label; // selItem เขียนชื่อลงช่องผ่าน closeDrop ซึ่งไม่ทำงานเมื่อรายการไม่ได้เปิดอยู่
    };
    if (initItem) hid.value = initItem.id;
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
    function positionDrop() { window.placeDropdown(inp, drop, lst, 300); }
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
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('hdf-sys-cmb-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
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
  var lineBody = document.getElementById('m-hd-line-body');
  if (lineBody) lineBody.innerHTML = ''; // หน้าต่างแยกแชทใช้ id ช่องโรงพยาบาล/ระบบชุดเดียวกัน — ล้างทิ้งกัน id ซ้ำ
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
    (t ? '' : '<div class="hd-line-hint">แชทเดียวมีหลายเรื่อง? <a href="javascript:void(0)" onclick="window.closeM(\'m-hd\');window.hdLineOpen()">🤖 วางแชท LINE ให้ AI แยกเป็นหลาย Ticket</a></div>')
    + '<div class="f-grid">'
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

// ── สร้าง Ticket ใหม่ช่องทาง LINE — ใช้ร่วมกัน: ฟอร์ม "+ แจ้งแทน" และ "วางแชท LINE ให้ AI แยก"
// opts: createdAt (เวลาแจ้งจริงในแชท) · resolvedAt + resolution (แก้แล้วในแชท → ปิดงาน + เก็บวิธีแก้เข้าคลังความรู้)
//       chat (ข้อความแชทต้นทาง → โน้ตภายใน) · sysNote · silent (ไม่ส่งแจ้งเตือนเรื่องด่วน) ──
async function hdCreateTicket(common, opts) {
  opts = opts || {};
  var id = window.hdUid();
  var createdIso = opts.createdAt || new Date().toISOString();
  var due = window.hdCalcDue(common.priority, createdIso);
  var me = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  var row = Object.assign({
    id: id,
    ticket_no: await window.hdNextTicketNo(),
    channel: 'line',
    status: common.assignee_id ? 'assigned' : 'new',
    access_token: window.hdGenToken(),
    sla_policy_id: due.slaPolicyId,
    first_response_due: due.firstResponseDue,
    resolution_due: due.resolutionDue,
    reopened_count: 0,
    pending_total_mins: 0,
    frt_breached: false,
    resolution_breached: false,
    tags: [],
    created_by: me || (window.cu && window.cu.id) || '',
    created_at: createdIso,
  }, common);
  if (opts.resolvedAt) {
    var exp = new Date(opts.resolvedAt); exp.setDate(exp.getDate() + 30);
    Object.assign(row, { status: 'resolved', resolved_at: opts.resolvedAt, first_response_at: opts.resolvedAt, public_view_expires_at: exp.toISOString() });
  }

  // เลขที่ชนกัน (มีคนสร้าง Ticket พร้อมกัน เช่น ลูกค้าแจ้งผ่านฟอร์ม) → ขอเลขใหม่แล้วลองอีก สูงสุด 5 ครั้ง
  for (var attempt = 0; ; attempt++) {
    try { await window.setDoc(window.getDocRef('HELPDESK_TICKETS', id), row); break; }
    catch (e) {
      var msg = String((e && (e.message || e.details)) || '');
      var dupNo = ((e && e.code === '23505') || /duplicate key/i.test(msg)) && /ticket_no/.test(msg);
      if (!dupNo || attempt >= 4) throw e;
      row.ticket_no = await window.hdNextTicketNo();
    }
  }
  window.hdApplyLocal(id, row);
  var sysEv = await window.hdAddEvent(id, { type: 'system', actorType: 'system', body: opts.sysNote || 'สร้าง Ticket จากช่องทาง LINE' });
  if (opts.chat) await window.hdAddEvent(id, { type: 'comment', actorType: 'agent', actorId: me, body: 'ข้อความจากแชท LINE:\n' + opts.chat, isInternal: true });
  if (common.assignee_id) await window.hdAddEvent(id, { type: 'assignment', body: 'มอบหมายให้ ' + hdStaffName(common.assignee_id) });
  if (opts.resolvedAt) {
    await window.hdAddEvent(id, { type: 'status_change', meta: { from: row.assignee_id ? 'assigned' : 'new', to: 'resolved' } });
    if (opts.resolution) {
      await window.hdAddEvent(id, { type: 'comment', actorType: 'agent', actorId: me, body: 'วิธีแก้ไข: ' + opts.resolution, isInternal: true });
      window.hdKbInvalidate && window.hdKbInvalidate();
    }
  }
  if (!opts.silent && common.priority === hdCriticalPriority() && window.sendHdUrgentNotify) {
    var hName = (hdHosp(common.hospital_id) || {}).name || '-';
    window.sendHdUrgentNotify(
      '🔴 **ตั๋วด่วนที่สุด — ทำงานไม่ได้เลย**'
      + '\n🎫 เลขที่: **' + row.ticket_no + '**'
      + '\n🏢 โรงพยาบาล: ' + hName
      + '\n👤 ผู้แจ้ง: ' + (common.reporter_name || '-') + (common.reporter_phone ? ' · ' + common.reporter_phone : '')
      + '\n📝 ' + String(common.description || '').slice(0, 200)
      + '\n📞 เข้าร่วมคุยสด: ' + hdJitsiUrl(row.ticket_no)
    );
  }
  return { id: id, row: row, sysEv: sysEv };
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
    var created = await hdCreateTicket(common);
    var id = created.id, row = created.row, sysEv = created.sysEv;

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
  if (ta.value.trim() && !(await window.confirmAsync('ช่องข้อความมีข้อความที่พิมพ์ไว้อยู่แล้ว\nต้องการแทนที่ด้วยข้อความที่ AI ร่างให้หรือไม่?',
    { icon: '🤖', title: 'แทนที่ข้อความเดิม?', okText: 'แทนที่ด้วยร่างจาก AI', okColor: 'var(--violet)' }))) return;
  var oldTxt = btn ? btn.innerHTML : ''; // innerHTML — ปุ่มในกล่องพิมพ์มี <span> ป้ายที่ซ่อนบนมือถือ
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
    if (btn) { btn.disabled = false; btn.innerHTML = oldTxt; }
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
  var oldTxt = btn ? btn.innerHTML : ''; // innerHTML — ปุ่มมี <span> ป้ายที่ซ่อนบนมือถือ
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
    if (btn) { btn.disabled = false; btn.innerHTML = oldTxt; }
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

// ── AI แนะนำผู้รับผิดชอบ — ตัวเลขประกอบ (งานค้าง / เคยแก้หมวด-ระบบ-รพ. เดียวกัน / ลาวันนี้) คำนวณจากข้อมูลจริง
// แล้วให้ AI เลือกโดยอ่านรายละเอียดปัญหาประกอบ · AI ล่ม/ตอบคนนอกรายชื่อ → ใช้คะแนนจากตัวเลขแทน · คนกดมอบหมายเองเสมอ ──
function hdTodayYmd() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hdAssignPool() {
  var all = window.HELPDESK_TICKETS || [], today = hdTodayYmd();
  var active = (window.STAFF || []).filter(function (s) { return s.active; });
  var handled = {};
  all.forEach(function (t) { if (t.assigneeId) handled[t.assigneeId] = true; });
  // คนที่เคยรับงาน Helpdesk มาก่อน — ยังไม่มีประวัติเลย (เพิ่งเริ่มใช้) ใช้พนักงานทุกคนแทน
  var pool = active.filter(function (s) { return handled[s.id]; });
  if (pool.length < 2) pool = active;
  return pool.map(function (s) {
    var mine = all.filter(function (t) { return t.assigneeId === s.id; });
    var onLeave = (window.LEAVES || []).some(function (l) { return l.staffId === s.id && l.status === 'approved' && l.startDate <= today && l.endDate >= today; });
    return {
      staff: s, onLeave: onLeave,
      open: mine.filter(function (t) { return hdStatus(t.status).open; }).length,
      done: mine.filter(function (t) { return !hdStatus(t.status).open && t.status !== 'cancelled'; }),
    };
  });
}
function hdAssignExp(p, t) {
  var cat = 0, sys = 0, hosp = 0;
  p.done.forEach(function (d) {
    if (t.categoryId && d.categoryId === t.categoryId) cat++;
    if (t.sourceSystem && d.sourceSystem === t.sourceSystem) sys++;
    if (t.hospitalId && d.hospitalId === t.hospitalId) hosp++;
  });
  return { cat: cat, sys: sys, hosp: hosp, score: Math.min(cat, 10) * 3 + Math.min(sys, 10) * 2 + Math.min(hosp, 10) - p.open * 1.5 };
}
// คืน [{ ticketId, staffId, reason, alts:[staffId] }] ตามลำดับ tickets
window.hdAiSuggestAssignees = async function (tickets) {
  var pool = hdAssignPool().filter(function (p) { return !p.onLeave; });
  if (!pool.length) throw new Error('ไม่มีพนักงานที่พร้อมรับงานวันนี้');
  var nick = function (s) { return s.nickname || s.name; };
  var per = tickets.map(function (t) {
    return { t: t, ranked: pool.map(function (p) { return { p: p, e: hdAssignExp(p, t) }; }).sort(function (a, b) { return b.e.score - a.e.score; }) };
  });
  var sys = 'คุณเป็นหัวหน้าทีม Helpdesk ซอฟต์แวร์โรงพยาบาล เลือกผู้รับผิดชอบให้แต่ละ Ticket จากรายชื่อทีมงานที่ให้เท่านั้น '
    + 'หลักการ: คนที่เคยแก้หมวด/ระบบ/รพ. เดียวกันมาก่อนได้เปรียบ แต่ต้องกระจายงาน ไม่ให้กองที่คนเดียว (ดูงานค้างประกอบ) · '
    + 'เรื่องด่วน (P1/P2) ให้คนที่มีประสบการณ์ตรงที่สุด · ตอบ "เฉพาะ JSON": {"assign":[{"ticket":"<เลขที่>","staff_id":"<id>","reason":"<เหตุผลสั้น ๆ ภาษาไทย>"}]}';
  var user = 'ทีมงาน (id · ชื่อ · งานค้างตอนนี้):\n' + pool.map(function (p) { return p.staff.id + ' · ' + nick(p.staff) + ' · ค้าง ' + p.open; }).join('\n')
    + '\n\nTicket ที่ต้องมอบหมาย:\n' + per.map(function (x) {
      var t = x.t, cat = hdCat(t.categoryId), h = hdHosp(t.hospitalId);
      var exp = x.ranked.filter(function (r) { return r.e.cat + r.e.sys + r.e.hosp > 0; }).slice(0, 4).map(function (r) {
        return nick(r.p.staff) + ' (หมวดเดียวกัน ' + r.e.cat + ', ระบบเดียวกัน ' + r.e.sys + ', รพ.เดียวกัน ' + r.e.hosp + ')';
      }).join(', ');
      return '- ' + t.ticketNo + ' [' + hdPri(t.priority).short + '] ' + (cat ? 'หมวด ' + cat.name + ' · ' : '') + (t.sourceSystem ? 'ระบบ ' + t.sourceSystem + ' · ' : '')
        + (h ? h.name + ' · ' : '') + String(t.description || t.subject || '').slice(0, 300).replace(/\s+/g, ' ')
        + '\n  เคยแก้เรื่องคล้ายกัน: ' + (exp || 'ไม่มีข้อมูล');
    }).join('\n');
  var ai = {};
  try {
    var res = await window.aiChatJson(sys, user, { maxTokens: 300 + tickets.length * 120 });
    (Array.isArray(res.assign) ? res.assign : []).forEach(function (a) { if (a && a.ticket) ai[a.ticket] = a; });
  } catch (e) { console.warn('[helpdesk] AI assign → ใช้คะแนนแทน:', e); }
  var extra = {}; // งานที่แนะนำไปแล้วในรอบนี้ — ถ่วงคะแนนตอนใช้คะแนนแทน AI ไม่ให้กองคนเดียว
  return per.map(function (x) {
    var a = ai[x.t.ticketNo];
    var staffId = a && pool.some(function (p) { return p.staff.id === a.staff_id; }) ? a.staff_id : '';
    var reason = staffId ? String(a.reason || '').trim() : '';
    if (!staffId) {
      var load = function (r) { return r.p.open + (extra[r.p.staff.id] || 0); };
      var adj = function (r) { return r.e.score - 1.5 * (extra[r.p.staff.id] || 0); };
      // คะแนนเท่ากัน → ให้คนที่งานค้างน้อยกว่า
      staffId = x.ranked.slice().sort(function (p, q) { return (adj(q) - adj(p)) || (load(p) - load(q)); })[0].p.staff.id;
      reason = 'เลือกจากประสบการณ์เรื่องคล้ายกันและจำนวนงานค้าง';
    }
    extra[staffId] = (extra[staffId] || 0) + 1;
    return { ticketId: x.t.id, staffId: staffId, reason: reason,
      alts: x.ranked.map(function (r) { return r.p.staff.id; }).filter(function (id) { return id !== staffId; }).slice(0, 3) };
  });
};

window.hdAiAssignOne = async function (id) {
  var t = hdTicket(id), out = document.getElementById('hd-ai-assign');
  if (!t || !out) return;
  out.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0;">⏳ AI กำลังเลือกผู้รับผิดชอบ...</div>';
  try {
    var r = (await window.hdAiSuggestAssignees([t]))[0];
    var pick = function (sid, label) { return '<a href="javascript:void(0)" onclick="window.hdSetField(\'' + id + '\',\'assigneeId\',\'' + sid + '\')">' + label + '</a>'; };
    out.innerHTML = window.aiSuggestHtml({
      title: 'AI', open: true,
      summary: 'แนะนำ: <b>' + esc(hdStaffName(r.staffId) || '-') + '</b>',
      actions: r.staffId !== t.assigneeId
        ? '<button type="button" class="btn btn-pri btn-sm" style="padding:2px 10px;font-size:11px;min-height:0;" onclick="window.hdSetField(\'' + id + '\',\'assigneeId\',\'' + r.staffId + '\')">มอบหมาย</button>'
        : '<span style="color:var(--teal);font-size:11px;font-weight:700;">✓ คนปัจจุบัน</span>',
      body: (r.reason ? '<div style="font-size:12px;">เหตุผล: ' + esc(r.reason) + '</div>' : '')
        + (r.alts.length ? '<div style="font-size:11.5px;color:var(--txt3);margin-top:4px;">ตัวเลือกอื่น: ' + r.alts.map(function (a) { return pick(a, esc(hdStaffName(a) || a)); }).join(' · ') + '</div>' : '')
        + '<div style="font-size:10.5px;color:var(--txt3);margin-top:4px;">* AI ช่วยแนะนำเท่านั้น กดมอบหมายเองเสมอ</div>',
    });
  } catch (e) {
    out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
  }
};

// ── AI จัดคนให้ทุกเรื่องที่ยังไม่มอบหมายในครั้งเดียว (ด่วนก่อน / เก่าก่อน สูงสุด 20 เรื่อง) ──
window.hdAiAssignBulk = async function () {
  var list = (window.HELPDESK_TICKETS || []).filter(function (t) { return hdStatus(t.status).open && !t.assigneeId; })
    .sort(function (a, b) { return (a.priority || '').localeCompare(b.priority || '') || (a.createdAt || '').localeCompare(b.createdAt || ''); })
    .slice(0, 20);
  if (!list.length) return;
  var body = document.getElementById('m-hd-assign-body'), foot = document.getElementById('m-hd-assign-foot');
  body.innerHTML = '<div style="font-size:12.5px;color:var(--txt3);padding:24px 0;text-align:center;">⏳ AI กำลังจัดคนให้ ' + list.length + ' เรื่อง...</div>';
  foot.innerHTML = '<div style="flex:1"></div><button class="btn btn-ghost" onclick="window.closeM(\'m-hd-assign\')">ยกเลิก</button>';
  window.openM('m-hd-assign');
  var sug;
  try { sug = await window.hdAiSuggestAssignees(list); }
  catch (e) { body.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>'; return; }
  var staff = (window.STAFF || []).filter(function (s) { return s.active; });
  body.innerHTML = '<div class="ai-flag" style="margin:0 0 6px;">🤖 ผู้รับผิดชอบด้านล่างแนะนำโดย AI — เปลี่ยนได้ก่อนกดมอบหมาย</div>'
    + sug.map(function (r) {
      var t = hdTicket(r.ticketId), pr = hdPri(t.priority), h = hdHosp(t.hospitalId);
      var opts = staff.map(function (s) { return '<option value="' + s.id + '"' + (s.id === r.staffId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
      return '<div class="hd-as-row" data-id="' + t.id + '">'
        + '<input type="checkbox" class="hd-as-chk" checked onchange="window.hdAiAssignFoot()">'
        + '<div class="hd-as-main"><div><b style="font-family:var(--mono);font-size:12px;">' + esc(t.ticketNo) + '</b> '
        +   '<span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span> '
        +   '<span style="font-size:11.5px;color:var(--txt3);">' + esc((h && h.name) || '') + '</span></div>'
        +   '<div class="hd-as-desc">' + esc(t.description || t.subject || '') + '</div>'
        +   (r.reason ? '<div class="hd-as-why">💡 ' + esc(r.reason) + '</div>' : '')
        + '</div>'
        + '<select class="f-input hd-as-sel">' + opts + '</select>'
        + '</div>';
    }).join('');
  window.hdAiAssignFoot();
};
window.hdAiAssignFoot = function () {
  var n = document.querySelectorAll('#m-hd-assign-body .hd-as-chk:checked').length;
  document.getElementById('m-hd-assign-foot').innerHTML = '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost" onclick="window.closeM(\'m-hd-assign\')">ยกเลิก</button>'
    + '<button class="btn btn-pri" id="hd-as-save" onclick="window.hdAiAssignSave()"' + (n ? '' : ' disabled') + '>📌 มอบหมาย ' + n + ' เรื่อง</button>';
};
window.hdAiAssignSave = async function () {
  var rows = [].slice.call(document.querySelectorAll('#m-hd-assign-body .hd-as-row'))
    .filter(function (el) { return el.querySelector('.hd-as-chk').checked; });
  var btn = document.getElementById('hd-as-save');
  if (btn) btn.disabled = true;
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (btn) btn.textContent = '⏳ ' + (i + 1) + '/' + rows.length;
    var id = rows[i].getAttribute('data-id'), sid = rows[i].querySelector('.hd-as-sel').value, t = hdTicket(id);
    if (!t || t.assigneeId || !sid) continue; // มีคนมอบหมายไปแล้วระหว่างนั้น → ข้าม
    await window.hdSetField(id, 'assigneeId', sid);
    n++;
  }
  window.closeM('m-hd-assign');
  window.showAlert && window.showAlert('มอบหมายแล้ว ' + n + ' เรื่อง', 'success');
};

// ── คลังความรู้: ปิดงานแล้ว → AI สรุป "สาเหตุ + วิธีแก้" จากบทสนทนา ให้คนตรวจ/แก้แล้วบันทึกเป็นโน้ตภายใน
// "วิธีแก้ไข: ..." ซึ่ง hdAiSimilar ใช้เป็นตัวอย่างให้ AI แนะนำเรื่องใหม่ + แสดงในแท็บ "คลังความรู้" ให้ทีมค้นเอง ──
function hdIsKbEvent(e) { return e.type === 'comment' && /^วิธีแก้ไข\s*[:：]/.test(e.body || ''); }
async function hdKbPromptIfMissing(id) {
  if (!(window.canEdit && window.canEdit('helpdesk'))) return;
  var evs = await window.hdFetchEvents(id, true);
  if (!evs.some(hdIsKbEvent)) window.hdKbOpen(id, evs);
}
window.hdKbOpen = async function (id, evs) {
  var t = hdTicket(id); if (!t) return;
  window._hdKbId = id;
  document.getElementById('m-hd-kb-body').innerHTML =
    '<div style="font-size:12px;color:var(--txt3);margin-bottom:10px;"><b style="font-family:var(--mono);">' + esc(t.ticketNo) + '</b> · ' + esc(String(t.description || t.subject || '').slice(0, 160)) + '</div>'
    + '<div class="f-group"><label class="f-label">สาเหตุของปัญหา</label><textarea class="f-input" id="hd-kb-cause" rows="2" placeholder="(ถ้าทราบ)"></textarea></div>'
    + '<div class="f-group"><label class="f-label">วิธีแก้ไข <span class="hd-req">*</span></label><textarea class="f-input" id="hd-kb-fix" rows="5" placeholder="ขั้นตอนที่ทำจริง ให้ทีมงานคนอื่นทำตามได้"></textarea></div>'
    + '<div id="hd-kb-status" style="font-size:12px;color:var(--txt3);">⏳ AI กำลังสรุปจากบทสนทนา...</div>';
  window.openM('m-hd-kb');
  var st = function (msg) { var el = document.getElementById('hd-kb-status'); if (el) el.textContent = msg; };
  try {
    if (!evs) evs = await window.hdFetchEvents(id, true);
    var convo = evs.filter(function (e) { return e.type === 'comment' && e.body; }).slice(-20).map(function (e) {
      return '[' + (e.actor_type === 'reporter' ? 'ผู้แจ้ง' : 'ทีมงาน') + (e.is_internal ? ' · โน้ตภายใน' : '') + '] ' + String(e.body).slice(0, 600);
    }).join('\n');
    var cat = hdCat(t.categoryId);
    var r = await window.aiChatJson(
      'คุณเป็นผู้ช่วยทีม Helpdesk ซอฟต์แวร์โรงพยาบาล สรุป Ticket ที่แก้ไขเสร็จแล้วเป็นบันทึกคลังความรู้ ให้ทีมงานคนอื่นแก้ปัญหาแบบเดียวกันได้เอง '
      + 'ตอบ "เฉพาะ JSON": {"cause":"<สาเหตุ 1–2 ประโยค หรือ empty ถ้าไม่ทราบ>","fix":"<ขั้นตอนแก้ไขที่ทำจริง เป็นข้อ ๆ สั้น กระชับ หรือ empty>"} '
      + 'ห้ามแต่งขั้นตอนที่ไม่มีในบทสนทนา ถ้าบทสนทนาไม่บอกวิธีแก้ ให้ fix เป็น empty',
      'หัวข้อ: ' + (t.subject || '-') + '\n' + (t.sourceSystem ? 'ระบบ: ' + t.sourceSystem + '\n' : '') + (cat ? 'หมวด: ' + cat.name + '\n' : '')
      + 'รายละเอียดปัญหา: ' + String(t.description || '').slice(0, 1500) + '\n\nบทสนทนา (เก่า → ใหม่):\n' + (convo || '(ไม่มี)'),
      { maxTokens: 600 });
    if (window._hdKbId !== id) return;
    var causeEl = document.getElementById('hd-kb-cause'), fixEl = document.getElementById('hd-kb-fix');
    var cause = String(r.cause || '').trim(), fix = String(r.fix || '').trim();
    if (causeEl && cause && !causeEl.value.trim()) { causeEl.value = cause; window.aiFlagField(causeEl, true); }
    if (fixEl && fix && !fixEl.value.trim()) { fixEl.value = fix; window.aiFlagField(fixEl, true); }
    st(fix ? '' : 'บทสนทนาไม่ได้บอกวิธีแก้ — พิมพ์วิธีแก้เองได้เลย');
  } catch (e) {
    st('AI สรุปไม่สำเร็จ (' + (e.message || e) + ') — พิมพ์วิธีแก้เองได้เลย');
  }
};
window.hdKbSave = async function () {
  var id = window._hdKbId, t = hdTicket(id); if (!t) return;
  var fixEl = document.getElementById('hd-kb-fix'), fix = (fixEl.value || '').trim();
  var cause = ((document.getElementById('hd-kb-cause') || {}).value || '').trim();
  hdMarkInvalid(fixEl, !fix);
  if (!fix) { fixEl.focus(); return; }
  try {
    await window.hdAddEvent(id, {
      type: 'comment', actorType: 'agent', actorId: (window.cu && (window.cu.staffId || window.cu.staff_id)) || '',
      body: 'วิธีแก้ไข: ' + fix + (cause ? '\nสาเหตุ: ' + cause : ''), isInternal: true,
    });
    window.hdKbInvalidate();
    window.closeM('m-hd-kb');
    window.showAlert && window.showAlert('บันทึกเข้าคลังความรู้แล้ว', 'success');
    if (window.hdOpenId === id) window.renderHelpdesk();
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
};

// ── แท็บ "คลังความรู้" — ค้นอาการ/วิธีแก้ (ตรงตัวอักษร หรือคล้ายกันแบบ bigram) + กรองหมวด ──
async function hdKbLoad() {
  window._hdKbList = await window.hdKbFetch();
  var wrap = document.getElementById('hd-kb-wrap'); if (!wrap) return;
  var f = window.hdKbFilter || {};
  var catOpts = '<option value="">หมวด: ทั้งหมด</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '"' + (f.cat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  wrap.innerHTML = '<div class="toolbar" style="padding:0 0 12px;flex-wrap:wrap;">'
    + '<div class="t-search"><input id="hd-kb-q" placeholder="ค้นหาอาการ / วิธีแก้ เช่น พิมพ์ใบสั่งยาไม่ออก" value="' + esc(f.q || '') + '" oninput="window.hdKbSetFilter(\'q\',this.value)"></div>'
    + '<select class="t-sel" onchange="window.hdKbSetFilter(\'cat\',this.value)">' + catOpts + '</select>'
    + '</div><div id="hd-kb-list"></div>';
  hdKbRenderList();
}
window.hdKbSetFilter = function (k, v) {
  window.hdKbFilter = window.hdKbFilter || {};
  window.hdKbFilter[k] = v;
  hdKbRenderList();
};
function hdKbRenderList() {
  var box = document.getElementById('hd-kb-list'); if (!box) return;
  var f = window.hdKbFilter || {}, q = (f.q || '').trim().toLowerCase(), all = window._hdKbList || [];
  var rows = all.filter(function (k) { return !f.cat || k.categoryId === f.cat; });
  if (q) {
    rows = rows.map(function (k) {
      var txt = k.subject + ' ' + k.description + ' ' + k.fix + ' ' + k.sourceSystem;
      return { k: k, s: txt.toLowerCase().indexOf(q) > -1 ? 1 : window.aiTextSim(q, txt) };
    }).filter(function (x) { return x.s >= 0.25; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.k; });
  }
  var total = rows.length;
  box.innerHTML = '<div style="font-size:12px;color:var(--txt3);margin-bottom:10px;">ในคลัง ' + all.length + ' รายการ'
    + (q || f.cat ? ' · ตรงเงื่อนไข ' + total : '') + (total > 100 ? ' (แสดง 100 รายการแรก)' : '')
    + ' · เพิ่มเข้าคลังเมื่อปิดงาน Ticket (AI ช่วยสรุปวิธีแก้)</div>'
    + (rows.slice(0, 100).map(function (k) {
      var cat = hdCat(k.categoryId), h = hdHosp(k.hospitalId);
      return '<div class="hd-kb-card">'
        + '<div class="hd-kb-q">' + esc(k.subject || String(k.description).slice(0, 80)) + '</div>'
        + (k.description && k.description !== k.subject ? '<div class="hd-kb-desc">' + esc(k.description) + '</div>' : '')
        + '<div class="hd-kb-fix">' + esc(k.fix) + '</div>'
        + '<div class="hd-kb-meta">' + (cat ? '<span class="tag">' + esc(cat.name) + '</span>' : '')
        +   (k.sourceSystem ? '<span>' + esc(k.sourceSystem) + '</span>' : '') + (h ? '<span>' + esc(h.name) + '</span>' : '')
        +   '<a href="javascript:void(0)" onclick="window.hdOpen(\'' + k.ticketId + '\')">' + esc(k.ticketNo) + ' ↗</a></div>'
        + '</div>';
    }).join('') || '<div style="text-align:center;color:var(--txt3);padding:40px 0;font-size:13px;">'
      + (q || f.cat ? 'ไม่พบรายการที่ตรงกัน' : 'ยังไม่มีรายการ — เมื่อปิดงาน Ticket ระบบจะให้ AI ช่วยสรุปวิธีแก้เข้าคลังนี้') + '</div>');
}

// ══ วางแชท LINE → AI แยกเป็นหลาย Ticket ══════════════════════════════
// อ่านแชท/เลือกช่วงวันที่ และขั้นตรวจทาน ใช้ตัวกลางใน src/utils/chat-import.util.js (lineChat / aiReview)
// ส่วนนี้กำหนดเฉพาะของ Helpdesk: โรงพยาบาล/ระบบ/กลุ่ม LINE, คำสั่ง AI, ช่องของ Ticket และการสร้าง Ticket ──
// ชื่อในแชท (เช่น "เอก BMS") → พนักงานในระบบ
function hdLineStaff(name) {
  return hdMatchStaff(name) || window.lineChat.matchPerson(name, (window.STAFF || []).filter(function (x) { return x.active; }));
}
function hdLineDefSys() { return (document.getElementById('hdf-sys') || {}).value || ''; }

window.hdLineOpen = function () {
  var mb = document.getElementById('m-hd-body');
  if (mb) mb.innerHTML = ''; // ฟอร์ม "+ แจ้งแทน" ใช้ id ช่องโรงพยาบาล/ระบบชุดเดียวกัน — ล้างทิ้งกัน id ซ้ำ
  window._hdLineHospAuto = false;
  document.getElementById('m-hd-line-body').innerHTML =
    '<div id="hdl-step1">'
    + window.lineChat.panelHtml('hdl')
    + '<div class="f-grid" style="margin-top:4px;">'
    + '<div class="f-group" style="grid-column:span 2"><label class="f-label">โรงพยาบาล <span class="hd-req">*</span></label>' + hdHospComboMarkup('') + '</div>'
    + '<div class="f-group"><label class="f-label">ระบบที่ใช้งาน (ค่าเริ่มต้น) <span class="hd-req">*</span></label>' + hdSysComboMarkup('') + '</div>'
    + '<div class="f-group"><label class="f-label">กลุ่ม LINE</label><input id="hdl-line" class="f-input" placeholder="ดึงจากไฟล์แชทอัตโนมัติ หรือพิมพ์เอง"></div>'
    + '</div>'
    + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.hdLineRun(this)">🤖 ให้ AI แยกปัญหา</button>'
    + '<div id="hdl-out" style="margin-top:12px;"></div>'
    + '</div>'
    + '<div id="hdl-step2" class="air-step2" style="display:none;"><div id="hdl-review"></div></div>';
  window.aiReview.reset('m-hd-line', 'm-hd-line-foot');
  window.openM('m-hd-line');
  window._initHdHospCombobox('');
  window._initHdSysCombobox('');
  window.lineChat.bind('hdl', {
    onFile: function (grp) { var el = document.getElementById('hdl-line'); if (el) el.value = grp; }, // เปิดไฟล์ใหม่ = ชื่อกลุ่มของไฟล์นั้น
    onScan: function (grp) {
      if (!grp) return;
      var lineEl = document.getElementById('hdl-line');
      if (lineEl && !lineEl.value) lineEl.value = grp;
      // ชื่อกลุ่มมักมีชื่อ รพ. → เลือกโรงพยาบาลให้ (ครั้งเดียว ถ้ายังไม่ได้เลือก)
      var hid = document.getElementById('hdf-hosp'), hInp = document.getElementById('hdf-hosp-cmb-input');
      if (!hid || hid.value || window._hdLineHospAuto || !hInp || !hInp._hdSetHosp) return;
      var core = function (s) { return String(s || '').toLowerCase().replace(/โรงพยาบาล|รพ\.?|\s+/g, ''); };
      var g = core(grp), best = null;
      (window.HOSPITALS || []).forEach(function (h) { var c = core(h.name); if (c.length >= 3 && g.indexOf(c) > -1 && (!best || c.length > core(best.name).length)) best = h; });
      if (best) { window._hdLineHospAuto = true; hInp._hdSetHosp(best.id); }
    },
  });
};

window.hdLineRun = async function (btn) {
  var out = document.getElementById('hdl-out');
  var c = window.lineChat.collect('hdl');
  if (c.error) { window.showAlert && window.showAlert(c.error, 'warn'); return; }
  var cats = (window.HELPDESK_CATEGORIES || []).filter(function (x) { return x.active !== false; });
  var prods = (window.HSP_PRODUCTS || []).map(function (x) { return x.name; }).filter(Boolean);
  var staff = (window.STAFF || []).filter(function (s) { return s.active; });
  var sys = 'คุณเป็นผู้ช่วยทีม Helpdesk ซอฟต์แวร์โรงพยาบาล อ่านแชท LINE ระหว่างเจ้าหน้าที่โรงพยาบาลกับทีมงาน แล้วแยกเป็น "เรื่องแจ้งปัญหา/ขอความช่วยเหลือ" ทีละเรื่อง '
    + (c.numbered ? 'แต่ละบรรทัดขึ้นต้นด้วยเลขข้อความ (#) ' : '')
    + 'ตอบ "เฉพาะ JSON": {"items":[{"description":"<สรุปปัญหาให้ชัด 1–3 ประโยค ภาษาไทย>","reporter_name":"<ชื่อผู้แจ้งฝั่ง รพ. ตามชื่อในแชท>",'
    + '"category_id":"<id หมวด หรือ empty>","priority":"p1|p2|p3|p4","system":"<ชื่อระบบจากรายการ หรือ empty>",'
    + '"first_msg":<เลขข้อความที่เริ่มแจ้ง>,"last_msg":<เลขข้อความสุดท้ายของเรื่องนี้>,"resolved":true|false,'
    + '"resolution":"<สิ่งที่ทีมทำจนแก้ได้ ถ้าแชทบอกว่าแก้แล้ว หรือ empty>","handled_by":"<ชื่อทีมงานที่ดูแลเรื่องนี้ในแชท หรือ empty>"}]} '
    + 'กฎ: ข้ามคำทักทาย/ขอบคุณ/สติกเกอร์/รูป/นัดหมาย/เรื่องที่ไม่ใช่ปัญหา · เรื่องเดียวกันที่คุยต่อเนื่องหลายข้อความ ให้รวมเป็นเรื่องเดียว · '
    + 'ผู้แจ้งคือฝั่งโรงพยาบาล ไม่ใช่คนในรายชื่อทีมงาน · ห้ามแต่งข้อมูลที่ไม่มีในแชท';
  var ctx = 'หมวดปัญหา (id — ชื่อ):\n' + cats.map(function (x) { return x.id + ' — ' + x.name; }).join('\n')
    + '\n\nPriority: ' + (window.HD_PRIORITY || []).map(function (x) { return x.id + ' = ' + x.label; }).join(' · ')
    + ' (p1 = ใช้งานไม่ได้ทั้งระบบ · p4 = สอบถาม/ขอปรับเล็กน้อย)'
    + (prods.length ? '\n\nระบบที่ใช้งาน (ตอบชื่อให้ตรง):\n' + prods.slice(0, 150).join(', ') : '')
    + '\n\nรายชื่อทีมงานของเรา (ไม่ใช่ผู้แจ้ง):\n' + staff.map(function (s) { return s.name + (s.nickname ? ' (' + s.nickname + ')' : ''); }).slice(0, 80).join(', ');

  var oldTxt = btn.textContent, raw = [];
  btn.disabled = true;
  out.innerHTML = '';
  try {
    for (var k = 0; k < c.chunks.length; k++) {
      btn.textContent = '⏳ AI กำลังอ่านแชท' + (c.chunks.length > 1 ? ' ส่วนที่ ' + (k + 1) + '/' + c.chunks.length : '') + '...';
      var res = await window.aiChatJson(sys, ctx + '\n\n--- แชท ---\n' + c.chunks[k], { maxTokens: 3500 });
      (Array.isArray(res.items) ? res.items : []).forEach(function (x) { raw.push(x); });
    }
    var catIds = cats.map(function (x) { return x.id; });
    var prodBy = {}; prods.forEach(function (n) { prodBy[n.toLowerCase()] = n; });
    var items = [];
    raw.forEach(function (x) {
      var desc = String(x.description || '').trim();
      if (!desc) return;
      var ex = window.lineChat.excerpt(c.msgs, x.first_msg, x.last_msg);
      var createdAt = ex.createdAt || new Date().toISOString(), handler = hdLineStaff(x.handled_by);
      var it = {
        description: desc,
        reporterName: String(x.reporter_name || '').trim(),
        categoryId: catIds.indexOf(x.category_id) > -1 ? x.category_id : '',
        priority: ['p1', 'p2', 'p3', 'p4'].indexOf(x.priority) > -1 ? x.priority : 'p3',
        system: prodBy[String(x.system || '').trim().toLowerCase()] || '',
        resolved: x.resolved === true,
        resolution: String(x.resolution || '').trim(),
        createdAt: createdAt,
        resolvedAt: x.resolved === true ? (ex.endAt || createdAt) : '',
        whenLabel: ex.whenLabel, chat: ex.chat,
        assigneeId: handler ? handler.id : '',
        dup: '',
      };
      // ซ้ำกับ Ticket เดิม (แจ้งใกล้วันเดียวกัน + ข้อความคล้าย) หรือซ้ำกับเรื่องก่อนหน้าในรอบนี้ (ก้อนแชทคาบเกี่ยว)
      var t0 = new Date(createdAt).getTime();
      var old = (window.HELPDESK_TICKETS || []).find(function (t) {
        return t.createdAt && Math.abs(new Date(t.createdAt).getTime() - t0) < 3 * 864e5 && window.aiTextSim(desc, t.description) >= 0.55;
      });
      if (old) it.dup = 'อาจซ้ำกับ ' + old.ticketNo + ': ' + String(old.description || '').slice(0, 50);
      else if (items.some(function (y) { return window.aiTextSim(desc, y.description) >= 0.7; })) it.dup = 'อาจซ้ำกับเรื่องก่อนหน้าในรายการนี้';
      items.push(it);
    });
    if (!items.length) { out.innerHTML = '<div style="font-size:12px;color:var(--txt3);">AI ไม่พบเรื่องแจ้งปัญหาในช่วงนี้</div>'; return; }
    // ผู้รับผิดชอบ: ทีมงานที่ดูแลในแชท → ถ้าไม่มี ให้ AI แนะนำ (ประสบการณ์ + งานค้าง) → ถ้า AI ล่ม ใช้คน Login
    var need = items.filter(function (it) { return !it.assigneeId; });
    if (need.length) {
      btn.textContent = '⏳ AI กำลังจัดผู้รับผิดชอบ...';
      var hosp = (document.getElementById('hdf-hosp') || {}).value || '';
      try {
        var sug = await window.hdAiSuggestAssignees(need.map(function (it, n) {
          return { id: 'L' + n, ticketNo: 'เรื่อง' + (n + 1), categoryId: it.categoryId, sourceSystem: it.system || hdLineDefSys(), hospitalId: hosp, priority: it.priority, description: it.description };
        }));
        sug.forEach(function (r, n) { need[n].assigneeId = r.staffId; need[n].assignWhy = r.reason; });
      } catch (e) {
        var me = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
        need.forEach(function (it) { it.assigneeId = me; });
      }
    }
    hdLineReview(items);
  } catch (e) {
    out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = oldTxt;
  }
};

// ── ขั้นตรวจทาน: กำหนดช่องของ Ticket ให้ aiReview ──
function hdLineReview(items) {
  window.aiReview.mount({
    modalId: 'm-hd-line', step1Id: 'hdl-step1', step2Id: 'hdl-step2', reviewId: 'hdl-review', footId: 'm-hd-line-foot',
    items: items, unit: 'Ticket',
    ctxHtml: function () {
      var h = hdHosp((document.getElementById('hdf-hosp') || {}).value), sys = hdLineDefSys();
      var grp = ((document.getElementById('hdl-line') || {}).value || '').trim();
      return '🏥 <b>' + esc((h && h.name) || 'ยังไม่เลือกโรงพยาบาล') + '</b>' + (sys ? ' · 💻 ' + esc(sys) : '') + (grp ? ' · 💬 ' + esc(grp) : '');
    },
    title: function (x) { return x.description; },
    card: function (x) {
      var pr = hdPri(x.priority), cat = hdCat(x.categoryId), stName = hdStaffName(x.assigneeId), defSys = hdLineDefSys();
      return {
        done: !!x.resolved,
        status: x.resolved ? '<span class="air-st done">✅ แก้แล้วในแชท</span>' : '<span class="air-st open">🔴 รอดำเนินการ</span>',
        badges: '<span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span>',
        chips: [
          ['👤', 'ผู้แจ้ง', x.reporterName],
          ['🗂', 'หมวด', cat && cat.name],
          ['💻', 'ระบบ', x.system || (defSys ? defSys + ' (ค่าเริ่มต้น)' : '')],
          ['👷', 'ผู้รับผิดชอบ', stName, x.assignWhy ? 'AI: ' + x.assignWhy : ''],
        ],
        note: x.resolved && String(x.resolution || '').trim() ? '<div class="air-fix"><b>วิธีแก้:</b> ' + esc(x.resolution) + '</div>' : '',
      };
    },
    missing: function (x) {
      var m = [];
      if (!String(x.description || '').trim()) m.push('รายละเอียด');
      if (!String(x.reporterName || '').trim()) m.push('ผู้แจ้ง');
      if (!x.categoryId) m.push('หมวดปัญหา');
      if (!x.system && !hdLineDefSys()) m.push('ระบบ');
      if (!x.assigneeId) m.push('ผู้รับผิดชอบ');
      return m;
    },
    filters: [['open', '🔴 รอดำเนินการ', function (x) { return !x.resolved; }], ['done', '✅ แก้แล้วในแชท', function (x) { return !!x.resolved; }]],
    statusKey: 'resolved',
    statuses: [{ v: false, label: '🔴 รอดำเนินการ', cls: 'open' }, { v: true, label: '✅ แก้แล้วในแชท (ปิดงาน)', cls: 'done' }],
    fields: function (x, i, h) {
      var cats = (window.HELPDESK_CATEGORIES || []).filter(function (c) { return c.active !== false; });
      var prods = (window.HSP_PRODUCTS || []).map(function (p) { return p.name; }).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'th'); });
      var staff = (window.STAFF || []).filter(function (s) { return s.active; }), defSys = hdLineDefSys();
      return h.fld('รายละเอียดปัญหา', '<textarea class="f-input' + h.bad('รายละเอียด') + '" rows="3"' + h.txt('description', 1) + '>' + esc(x.description) + '</textarea>', 1)
        + '<div class="air-grid">'
        +   h.fld('ผู้แจ้ง', '<input class="f-input' + h.bad('ผู้แจ้ง') + '" value="' + esc(x.reporterName) + '"' + h.txt('reporterName', 1) + '>', 1)
        +   h.fld('หมวดปัญหา', '<select class="f-input' + h.bad('หมวดปัญหา') + '"' + h.pick('categoryId') + '>' + h.opt('', '-- เลือก --', !x.categoryId) + cats.map(function (c) { return h.opt(c.id, c.name, c.id === x.categoryId); }).join('') + '</select>', 1)
        +   h.fld('Priority', '<select class="f-input"' + h.pick('priority') + '>' + (window.HD_PRIORITY || []).map(function (p) { return h.opt(p.id, p.label, p.id === x.priority); }).join('') + '</select>')
        +   h.fld('ระบบที่ใช้งาน', '<select class="f-input' + h.bad('ระบบ') + '"' + h.pick('system') + '>' + h.opt('', defSys ? '(ค่าเริ่มต้น: ' + defSys + ')' : '-- เลือก --', !x.system) + prods.map(function (nm) { return h.opt(nm, nm, nm === x.system); }).join('') + '</select>', 1)
        + '</div>'
        + h.fld('ผู้รับผิดชอบ', '<select class="f-input' + h.bad('ผู้รับผิดชอบ') + '"' + h.pick('assigneeId') + '>' + h.opt('', '-- เลือก --', !x.assigneeId) + staff.map(function (s) { return h.opt(s.id, s.name, s.id === x.assigneeId); }).join('') + '</select>'
            + (x.assignWhy ? '<span class="air-why">💡 AI: ' + esc(x.assignWhy) + '</span>' : ''), 1)
        + (x.resolved ? h.fld('วิธีแก้ไข (เก็บเข้าคลังความรู้)', '<textarea class="f-input" rows="2"' + h.txt('resolution') + '>' + esc(x.resolution) + '</textarea>') : '');
    },
    beforeSave: function () {
      if ((document.getElementById('hdf-hosp') || {}).value) return true;
      window.showAlert && window.showAlert('กรุณาเลือกโรงพยาบาลก่อน', 'warn'); // ช่องโรงพยาบาลอยู่ขั้นที่ 1 — พากลับไปเลือก
      window.aiReview.back();
      var hv = document.getElementById('hdf-hosp-cmb-input'); hdMarkInvalid(hv, true); if (hv) hv.focus();
      return false;
    },
    saveOne: function (x) {
      var desc = String(x.description).trim();
      return hdCreateTicket({
        hospital_id: document.getElementById('hdf-hosp').value,
        line_group_ref: ((document.getElementById('hdl-line') || {}).value || '').trim(),
        reporter_name: String(x.reporterName).trim(), reporter_phone: '',
        source_system: x.system || hdLineDefSys(), category_id: x.categoryId, subject: desc.slice(0, 60), description: desc,
        priority: x.priority || 'p3', assignee_id: x.assigneeId, updated_at: new Date().toISOString(),
      }, {
        createdAt: x.createdAt, chat: x.chat, silent: true,
        sysNote: 'สร้าง Ticket จากแชท LINE (AI แยกปัญหา)',
        resolvedAt: x.resolved ? (x.resolvedAt || x.createdAt) : '', resolution: x.resolved ? String(x.resolution || '').trim() : '',
      });
    },
    onDone: function (made, todo) {
      var closedN = todo.filter(function (x) { return x.resolved; }).length;
      window.closeM('m-hd-line');
      window.showAlert && window.showAlert('สร้าง Ticket จากแชท LINE ' + made + ' เรื่อง' + (closedN ? ' (ปิดงานแล้ว ' + closedN + ')' : ''), 'success');
      window.renderHelpdesk();
    },
    onFail: function () { window.renderHelpdesk(); },
  });
}

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
    + kpi('📋', 'เปิดค้าง', open.length, (function () {
        var un = open.filter(function (t) { return !t.assigneeId; }).length;
        return !open.length ? 'ไม่มีงานค้าง' : un ? 'ยังไม่มอบหมาย ' + un + ' เรื่อง' : 'มอบหมายครบแล้ว';
      })(), 'neu')
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
    return '<tr style="cursor:pointer" onclick="window.hdOpen(\'' + t.id + '\')"><td style="font-family:var(--mono);font-size:12px;">' + esc(t.ticketNo) + '</td><td>' + esc(t.subject || '-') + '</td><td>' + esc(hdStaffName(t.assigneeId)) + '</td><td><span class="hd-pill hd-' + sla.cls + '">' + esc(sla.txt) + '</span></td></tr>';
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
    return { name: id === '__unassigned__' ? 'ยังไม่มอบหมาย' : (hdStaffName(id) || id), count: byAssignee[id], unassigned: id === '__unassigned__' };
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

// ── สรุปรายสัปดาห์ (AI) ────────────────────────────────────────────────
// ตัวเลข/ตารางทุกช่องคำนวณจากข้อมูลในระบบเอง (ไม่ให้ AI นับ กันตัวเลขแต่ง) แล้วค่อยส่ง "สถิติ + รายการ Ticket ย่อ"
// ให้ AI เขียนบทสรุป · ถ้า Ticket เยอะเกินจะส่งรอบเดียว แบ่งเป็นชุดให้ AI สรุปย่อยก่อน แล้วรวมเป็นบทสรุปเดียว
// ไม่บันทึกผลลง DB — สร้างใหม่ทุกครั้งที่กด (เก็บไว้ในหน่วยความจำ เปลี่ยนสัปดาห์/ตัวกรองแล้วกลับมายังเห็นอยู่)
var HD_WK_DAY = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
var HD_WK_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
var _hdWkEv = {};      // ticketId → comment events (เก่า → ใหม่) ใช้ดึง "วิธีแก้ไข"
var _hdWkAi = null;    // { key, loading, progress, text, error }

function hdWkMonday(d) {
  d = new Date(d); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}
function hdWkYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function hdWkD(d, withYear) { return d.getDate() + ' ' + HD_WK_MON[d.getMonth()] + (withYear ? ' ' + (d.getFullYear() + 543) : ''); }
function hdWkState() {
  if (!window.hdWk) window.hdWk = { start: hdWkYmd(hdWkMonday(new Date())), group: '', hosp: '' };
  return window.hdWk;
}
function hdWkKey() { var s = hdWkState(); return s.start + '|' + s.group + '|' + s.hosp; }
// แหล่งที่มา: ชื่อกลุ่ม LINE ถ้ากรอกไว้ ไม่งั้นใช้ชื่อช่องทาง
function hdWkSrc(t) {
  var g = String(t.lineGroupRef || '').trim();
  if (g) return g;
  if (t.channel === 'line') return 'LINE (ไม่ระบุกลุ่ม)';
  var ch = (window.HD_CHANNEL || []).find(function (c) { return c.id === t.channel; });
  return ch ? ch.label.replace(/\s*\(.*\)$/, '') : (t.channel || 'ไม่ระบุ');
}
function hdWkHospName(id) { var h = hdHosp(id); return h ? h.name : 'ไม่ระบุ รพ.'; }
function hdWkCatName(id) { var c = hdCat(id); return c ? c.name : '(ไม่ระบุหมวด)'; }
function hdWkFmtDur(min) {
  if (min == null) return '—';
  if (min < 60) return Math.round(min) + ' นาที';
  if (min < 1440) return (min / 60).toFixed(1) + ' ชม.';
  return (min / 1440).toFixed(1) + ' วัน';
}
function hdWkAvg(list, fn) {
  var v = list.map(fn).filter(function (n) { return n != null && n > 0 && isFinite(n); });
  return v.length ? v.reduce(function (s, n) { return s + n; }, 0) / v.length : null;
}
function hdWkMins(a, b) { return a && b ? (new Date(b) - new Date(a)) / 60000 : null; }
function hdWkMetSla(t) {
  var frtOk = !t.firstResponseDue || (t.firstResponseAt && new Date(t.firstResponseAt) <= new Date(t.firstResponseDue));
  var resOk = !t.resolutionDue || (t.resolvedAt && new Date(t.resolvedAt) <= new Date(t.resolutionDue));
  return frtOk && resOk;
}
function hdWkCount(list, keyFn) {
  var m = {};
  list.forEach(function (t) { var k = keyFn(t); (m[k] = m[k] || []).push(t); });
  return Object.keys(m).map(function (k) { return { key: k, list: m[k] }; }).sort(function (a, b) { return b.list.length - a.list.length; });
}

// ── คำนวณข้อมูลทั้งสัปดาห์ตามตัวกรองปัจจุบัน ──
function hdWkData() {
  var st = hdWkState();
  var s = new Date(st.start + 'T00:00:00'), e = new Date(s), ps = new Date(s);
  e.setDate(e.getDate() + 7); ps.setDate(ps.getDate() - 7);
  var now = new Date(), cutoff = e < now ? e : now, isCurrent = e > now;
  var inRange = function (iso, a, b) { if (!iso) return false; var d = new Date(iso); return d >= a && d < b; };
  var all = (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (st.group && hdWkSrc(t) !== st.group) return false;
    if (st.hosp && t.hospitalId !== st.hosp) return false;
    return true;
  });
  var live = all.filter(function (t) { return t.status !== 'cancelled'; });
  var inW = live.filter(function (t) { return inRange(t.createdAt, s, e); });
  var prevW = live.filter(function (t) { return inRange(t.createdAt, ps, s); });
  var resW = live.filter(function (t) { return inRange(t.resolvedAt, s, e); });
  // งานค้าง ณ สิ้นสัปดาห์ — สัปดาห์ปัจจุบันใช้สถานะจริงตอนนี้ · สัปดาห์ที่ผ่านมาแล้วดูจากเวลาที่แก้เสร็จ
  var openEnd = live.filter(function (t) {
    if (new Date(t.createdAt || 0) >= e) return false;
    if (isCurrent) return hdStatus(t.status).open;
    return !t.resolvedAt ? hdStatus(t.status).open : new Date(t.resolvedAt) >= e;
  });
  var overdue = openEnd.filter(function (t) { return t.resolutionDue && new Date(t.resolutionDue) < cutoff; });
  var rated = resW.filter(function (t) { return t.csatScore != null; });
  return {
    s: s, e: e, isCurrent: isCurrent, cutoff: cutoff, all: all,
    inW: inW, prevW: prevW, resW: resW, openEnd: openEnd, overdue: overdue,
    cancelled: all.filter(function (t) { return t.status === 'cancelled' && inRange(t.createdAt, s, e); }).length,
    urgent: inW.filter(function (t) { return t.priority === 'p1' || t.priority === 'p2'; }),
    reopened: live.filter(function (t) { return (t.reopenedCount || 0) > 0 && (inRange(t.createdAt, s, e) || inRange(t.resolvedAt, s, e)); }),
    frt: hdWkAvg(inW, function (t) { return hdWkMins(t.createdAt, t.firstResponseAt); }),
    mttr: hdWkAvg(resW, function (t) { return hdWkMins(t.createdAt, t.resolvedAt); }),
    slaPct: resW.length ? Math.round(resW.filter(hdWkMetSla).length / resW.length * 100) : null,
    csat: rated.length ? rated.reduce(function (a, t) { return a + t.csatScore; }, 0) / rated.length : null,
    csatN: rated.length,
  };
}

// ── วิธีแก้ไขของ Ticket: บันทึกคลังความรู้ "วิธีแก้ไข:" ก่อน ไม่มีก็ใช้ข้อความล่าสุดของทีมงาน ──
function hdWkFix(id) {
  var evs = _hdWkEv[id];
  if (!evs) return null;
  var kb = evs.filter(hdIsKbEvent).pop();
  if (kb) return { src: 'kb', text: String(kb.body).replace(/^วิธีแก้ไข\s*[:：]\s*/, '').replace(/\nสาเหตุ\s*[:：][\s\S]*$/, '').trim() };
  var last = evs.filter(function (e) { return e.actor_type === 'agent' && String(e.body || '').trim(); }).pop();
  return last ? { src: 'reply', text: String(last.body).trim() } : { src: '', text: '' };
}
async function hdWkLoadEvents(ids) {
  var need = ids.filter(function (id) { return !_hdWkEv[id]; });
  var db = window.getDb && window.getDb();
  if (!need.length || !db) return;
  for (var i = 0; i < need.length; i += 150) {
    var part = need.slice(i, i + 150);
    var r = await db.from('helpdesk_ticket_events').select('ticket_id,type,body,actor_type,is_internal,created_at')
      .eq('type', 'comment').in('ticket_id', part).order('created_at', { ascending: true });
    if (r.error) { console.warn('[helpdesk] weekly events:', r.error); return; }
    part.forEach(function (id) { _hdWkEv[id] = []; });
    (r.data || []).forEach(function (ev) { _hdWkEv[ev.ticket_id].push(ev); });
  }
}

window.hdWkShift = function (n) {
  var st = hdWkState(), d = new Date(st.start + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  if (d > new Date()) return;
  st.start = hdWkYmd(d);
  window.renderHelpdesk();
};
window.hdWkPick = function (v) { if (!v) return; hdWkState().start = hdWkYmd(hdWkMonday(new Date(v + 'T00:00:00'))); window.renderHelpdesk(); };
window.hdWkSet = function (k, v) { hdWkState()[k] = v; window.renderHelpdesk(); };
// กดการ์ดกลุ่ม LINE = กรองทั้งหน้าเป็นกลุ่มนั้น (กดซ้ำ = ยกเลิก)
window.hdWkGroup = function (g) { var st = hdWkState(); st.group = st.group === g ? '' : g; window.renderHelpdesk(); };
// ตัวกรองรายการติดตาม — เปลี่ยนเฉพาะตาราง ไม่ render ทั้งหน้า
window.hdWkTrack = function (k) {
  hdWkState().track = k;
  var el = document.getElementById('hd-wk-track');
  if (el) el.innerHTML = hdWkTrackHtml(hdWkData());
};

// เรื่องทั้งหมดที่ต้องติดตามในสัปดาห์: รับเข้า + ปิดในสัปดาห์ + ค้างยกมาจากสัปดาห์ก่อน
function hdWkTracked(D) {
  var seen = {}, out = [];
  D.inW.concat(D.resW, D.openEnd).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; out.push(t); } });
  return out;
}
function hdWkIsCarry(t, D) { return new Date(t.createdAt || 0) < D.s; }
function hdWkIsDone(t, D) { return D.openEnd.indexOf(t) < 0; }

var HD_WK_TRACK = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'open', label: '⏳ ค้าง' },
  { id: 'overdue', label: '🔥 เกิน SLA' },
  { id: 'urgent', label: '🚨 ด่วน P1/P2' },
  { id: 'carry', label: '↪ ยกมาจากสัปดาห์ก่อน' },
  { id: 'done', label: '✅ แก้เสร็จ' },
];
function hdWkTrackFilter(id, D) {
  return function (t) {
    if (id === 'open') return !hdWkIsDone(t, D);
    if (id === 'overdue') return D.overdue.indexOf(t) >= 0;
    if (id === 'urgent') return t.priority === 'p1' || t.priority === 'p2';
    if (id === 'carry') return hdWkIsCarry(t, D);
    if (id === 'done') return hdWkIsDone(t, D);
    return true;
  };
}

function hdWkTrackHtml(D) {
  var st = hdWkState(), cur = st.track || 'all', all = hdWkTracked(D);
  var chips = '<div class="hd-wk-chips hd-wk-noprint">' + HD_WK_TRACK.map(function (f) {
    var c = all.filter(hdWkTrackFilter(f.id, D)).length;
    return '<button class="hd-wk-fchip' + (cur === f.id ? ' on' : '') + '" onclick="window.hdWkTrack(\'' + f.id + '\')">' + f.label + ' <b>' + c + '</b></button>';
  }).join('') + '</div>';
  // ค้างขึ้นก่อน (เกิน SLA → ด่วน → เก่าสุด) แล้วค่อยเรื่องที่แก้เสร็จ
  var rank = function (t) { return hdWkIsDone(t, D) ? 3 : D.overdue.indexOf(t) >= 0 ? 0 : (t.priority === 'p1' || t.priority === 'p2') ? 1 : 2; };
  var list = all.filter(hdWkTrackFilter(cur, D)).sort(function (a, b) {
    return rank(a) - rank(b) || new Date(a.createdAt) - new Date(b.createdAt);
  });
  if (!list.length) return chips + '<div class="hd-wk-empty">ไม่มีรายการ</div>';
  var rows = list.map(function (t) {
    var s = hdStatus(t.status), p = hdPri(t.priority), f = hdWkFix(t.id), done = hdWkIsDone(t, D), c = new Date(t.createdAt);
    var tags = (D.overdue.indexOf(t) >= 0 ? '<span class="hd-pill hd-bad">เกิน SLA</span>' : '')
      + ((t.reopenedCount || 0) > 0 ? '<span class="hd-pill hd-warn">เปิดซ้ำ ' + t.reopenedCount + '</span>' : '')
      + (hdWkIsCarry(t, D) ? '<span class="hd-pill hd-neu">ยกมา</span>' : '');
    var dur = done && t.resolvedAt ? '<span class="hd-wk-ok">แก้ใน ' + hdWkFmtDur(hdWkMins(t.createdAt, t.resolvedAt)) + '</span>'
      : '<span class="hd-wk-wait">ค้าง ' + hdWkFmtDur(hdWkMins(t.createdAt, D.cutoff)) + '</span>';
    var fix = !f ? '<span class="hd-wk-muted">⏳</span>'
      : !f.text ? '<span class="hd-wk-muted">' + (done ? '— ไม่มีบันทึกวิธีแก้ —' : '— ยังไม่มีการตอบ —') + '</span>'
      : (f.src === 'kb' ? '<span title="จากคลังความรู้">📚 </span>' : done ? '' : '<span class="hd-wk-muted">ล่าสุด: </span>') + esc(f.text.slice(0, 200)) + (f.text.length > 200 ? '…' : '');
    return '<tr class="hd-wk-row' + (done ? '' : ' open') + '" onclick="window.hdOpen(\'' + t.id + '\')">'
      + '<td><div class="mono">' + esc(t.ticketNo) + '</div><div class="hd-wk-muted">' + HD_WK_DAY[(c.getDay() + 6) % 7] + ' ' + c.getDate() + '/' + (c.getMonth() + 1) + ' ' + String(c.getHours()).padStart(2, '0') + ':' + String(c.getMinutes()).padStart(2, '0') + '</div></td>'
      + '<td><div>' + esc(hdWkSrc(t)) + '</div><div class="hd-wk-muted">' + esc(hdWkHospName(t.hospitalId)) + (t.reporterName ? ' · ' + esc(t.reporterName) : '') + '</div></td>'
      + '<td class="hd-wk-prob"><div>' + esc(String(t.subject || t.description || '-').slice(0, 110)) + '</div><div class="hd-wk-muted">' + esc(hdWkCatName(t.categoryId)) + (t.sourceSystem ? ' · ' + esc(t.sourceSystem) : '') + '</div></td>'
      + '<td><span class="hd-wk-pri" style="color:' + p.color + ';border-color:' + p.color + '">' + esc(p.short) + '</span></td>'
      + '<td><span class="hd-wk-st" style="color:' + s.color + ';background:' + hdHexA(s.color, .13) + '">' + s.icon + ' ' + esc(s.label) + '</span><div class="hd-wk-tags">' + tags + '</div></td>'
      + '<td>' + esc(hdStaffName(t.assigneeId) || 'ยังไม่มอบหมาย') + '<div class="hd-wk-muted">' + dur + '</div></td>'
      + '<td class="hd-wk-fix">' + fix + '</td></tr>';
  }).join('');
  return chips + '<div class="hd-wk-scroll"><table class="t-table hd-wk-tbl"><thead><tr><th>เลขที่ / แจ้งเมื่อ</th><th>กลุ่ม LINE / รพ.</th><th>ปัญหา</th><th>P</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>การแก้ไข / ความคืบหน้าล่าสุด</th></tr></thead><tbody>'
    + rows + '</tbody></table></div>';
}

// รายการแท่งแนวนอน (magnitude ข้ามหมวด → hue เดียว) · ตัวเลขเป็นสีตัวอักษรปกติ ไม่ใช่สีแท่ง
function hdWkBars(title, groups, nameFn, opt) {
  opt = opt || {};
  var max = groups.reduce(function (m, g) { return Math.max(m, g.list.length); }, 0) || 1;
  var rows = groups.slice(0, opt.limit || 8).map(function (g) {
    var open = g.list.filter(function (t) { return hdStatus(t.status).open; }).length;
    var name = nameFn(g.key);
    return '<div class="hd-wk-bar" title="' + esc(name + ': ' + g.list.length + ' เรื่อง' + (open ? ' · ค้าง ' + open : '')) + '">'
      + '<div class="hd-wk-bar-l">' + esc(name) + '</div>'
      + '<div class="hd-wk-bar-t"><div class="hd-wk-bar-f" style="width:' + Math.max(3, g.list.length / max * 100) + '%"></div></div>'
      + '<div class="hd-wk-bar-n"><b>' + g.list.length + '</b>' + (open ? ' <span class="hd-wk-wait">ค้าง ' + open + '</span>' : '') + '</div></div>';
  }).join('');
  var more = groups.length > (opt.limit || 8) ? '<div class="hd-wk-muted" style="margin-top:6px;">และอีก ' + (groups.length - (opt.limit || 8)) + ' รายการ</div>' : '';
  return '<div class="ov-card hd-wk-card"><div class="ov-card-title">' + title + '</div>' + (rows ? rows + more : '<div class="hd-wk-empty">ไม่มีข้อมูล</div>') + '</div>';
}

function hdWkHtml() {
  var st = hdWkState(), D = hdWkData();
  var eLast = new Date(D.e); eLast.setDate(eLast.getDate() - 1);
  var range = hdWkD(D.s) + ' – ' + hdWkD(eLast, true);
  var tracked = hdWkTracked(D);

  // ── ตัวกรอง ──
  var srcs = {}, hosps = {};
  (window.HELPDESK_TICKETS || []).forEach(function (t) { srcs[hdWkSrc(t)] = 1; if (t.hospitalId) hosps[t.hospitalId] = 1; });
  var grpOpts = '<option value="">กลุ่ม LINE / ช่องทาง: ทั้งหมด</option>' + Object.keys(srcs).sort().map(function (g) {
    return '<option value="' + esc(g) + '"' + (st.group === g ? ' selected' : '') + '>' + esc(g) + '</option>';
  }).join('');
  var hospOpts = '<option value="">รพ.: ทั้งหมด</option>' + Object.keys(hosps).map(function (id) { return { id: id, name: hdWkHospName(id) }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); }).map(function (h) {
      return '<option value="' + esc(h.id) + '"' + (st.hosp === h.id ? ' selected' : '') + '>' + esc(h.name) + '</option>';
    }).join('');
  var toolbar = '<div class="toolbar hd-wk-noprint hd-wk-bar-top">'
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdWkShift(-1)" title="สัปดาห์ก่อน">◀</button>'
    + '<input type="date" class="t-sel" value="' + st.start + '" max="' + hdWkYmd(new Date()) + '" onchange="window.hdWkPick(this.value)" title="เลือกวันใดก็ได้ในสัปดาห์">'
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdWkShift(1)" title="สัปดาห์ถัดไป"' + (D.isCurrent ? ' disabled' : '') + '>▶</button>'
    + '<select class="t-sel" onchange="window.hdWkSet(\'group\',this.value)">' + grpOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdWkSet(\'hosp\',this.value)">' + hospOpts + '</select>'
    + (st.group || st.hosp ? '<button class="btn btn-ghost btn-sm" onclick="window.hdWk.group=\'\';window.hdWk.hosp=\'\';window.renderHelpdesk()">✕ ล้างตัวกรอง</button>' : '')
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ พิมพ์ / PDF</button>'
    + '<button class="btn btn-pri btn-sm" onclick="window.hdWkRunAi()"' + (_hdWkAi && _hdWkAi.loading ? ' disabled' : '') + '>🤖 สรุปด้วย AI</button>'
    + '</div>';

  // ── หัวรายงาน + สถานะรวม 1 บรรทัด ──
  var health = D.overdue.length ? { cls: 'bad', txt: '🔴 มี ' + D.overdue.length + ' เรื่องเกิน SLA ต้องเร่งดำเนินการ' }
    : D.openEnd.length ? { cls: 'warn', txt: '🟡 ค้าง ' + D.openEnd.length + ' เรื่อง (ยังไม่เกิน SLA)' }
    : { cls: 'good', txt: '🟢 เคลียร์งานครบ ไม่มีเรื่องค้าง' };
  var head = '<div class="hd-wk-head"><div>'
    + '<div class="hd-wk-title">📊 สรุปงานศูนย์ช่วยเหลือ · ' + range + (D.isCurrent ? ' <span class="hd-wk-tag">สัปดาห์นี้ ยังไม่จบ</span>' : '') + '</div>'
    + '<div class="hd-wk-sub">' + esc([st.group, st.hosp ? hdWkHospName(st.hosp) : ''].filter(Boolean).join(' · ') || 'ทุกกลุ่ม LINE / ทุกช่องทาง · ทุก รพ.') + '</div></div>'
    + '<div class="hd-wk-health hd-wk-' + health.cls + '">' + health.txt + '</div></div>';

  // ── ภาพรวม: 3 การ์ด (ปริมาณงาน / ความเร็ว & คุณภาพ / ความเสี่ยง) ──
  var diff = D.prevW.length ? Math.round((D.inW.length - D.prevW.length) / D.prevW.length * 100) : null;
  var closeRate = tracked.length ? Math.round((tracked.length - D.openEnd.length) / tracked.length * 100) : null;
  var unassigned = D.openEnd.filter(function (t) { return !t.assigneeId; }).length;
  var carry = tracked.filter(function (t) { return hdWkIsCarry(t, D); }).length;
  function stat(label, val, sub, cls) {
    return '<div class="hd-wk-stat"><div class="k">' + label + '</div><div class="v' + (cls ? ' hd-wk-' + cls : '') + '">' + val + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }
  var lvl = function (v, good, warn, higherBetter) {
    if (v == null) return '';
    return higherBetter ? (v >= good ? 'good' : v >= warn ? 'warn' : 'bad') : (v <= good ? 'good' : v <= warn ? 'warn' : 'bad');
  };
  var overview = '<div class="hd-wk-ov">'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">📦 ปริมาณงาน</div><div class="hd-wk-stats">'
    +   stat('รับใหม่', D.inW.length, diff == null ? 'สัปดาห์ก่อน ' + D.prevW.length : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(diff) + '% จาก ' + D.prevW.length)
    +   stat('แก้เสร็จ', D.resW.length, carry ? 'รวมยกมา ' + carry : '')
    +   stat('ค้าง', D.openEnd.length, D.isCurrent ? 'ตอนนี้' : 'สิ้นสัปดาห์', D.openEnd.length ? 'warn' : 'good')
    + '</div>' + (closeRate == null ? '' : '<div class="hd-wk-prog" title="ปิดแล้ว ' + closeRate + '% ของเรื่องที่ต้องดูแลในสัปดาห์"><div style="width:' + closeRate + '%"></div></div><div class="hd-wk-muted">ปิดแล้ว ' + closeRate + '% ของ ' + tracked.length + ' เรื่องที่ดูแลในสัปดาห์</div>') + '</div>'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">⏱️ ความเร็ว & คุณภาพ</div><div class="hd-wk-stats">'
    +   stat('ตอบครั้งแรก', hdWkFmtDur(D.frt), 'เฉลี่ย')
    +   stat('แก้เสร็จใน', hdWkFmtDur(D.mttr), 'เฉลี่ย')
    +   stat('ตรง SLA', D.slaPct == null ? '—' : D.slaPct + '%', '', lvl(D.slaPct, 90, 70, true))
    +   stat('พึงพอใจ', D.csat == null ? '—' : D.csat.toFixed(1), D.csatN ? D.csatN + ' รีวิว' : 'ยังไม่มีคะแนน', lvl(D.csat, 4.5, 3.5, true))
    + '</div></div>'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">🚨 ความเสี่ยง</div><div class="hd-wk-stats">'
    +   stat('เกิน SLA', D.overdue.length, 'ยังค้าง', D.overdue.length ? 'bad' : 'good')
    +   stat('ด่วน P1/P2', D.urgent.length, 'รับเข้า', D.urgent.length ? 'warn' : '')
    +   stat('เปิดซ้ำ', D.reopened.length, '', D.reopened.length ? 'warn' : '')
    +   stat('ไม่มีผู้รับผิดชอบ', unassigned, 'ที่ค้าง', unassigned ? 'bad' : '')
    + '</div></div></div>';

  // ── แนวโน้ม 8 สัปดาห์ + รายวัน/รายชั่วโมง ──
  var dayCnt = [0, 0, 0, 0, 0, 0, 0], hourCnt = {};
  D.inW.forEach(function (t) { var d = new Date(t.createdAt); dayCnt[(d.getDay() + 6) % 7]++; hourCnt[d.getHours()] = (hourCnt[d.getHours()] || 0) + 1; });
  var dMax = Math.max.apply(null, dayCnt) || 1;
  var peakH = Object.keys(hourCnt).sort(function (a, b) { return hourCnt[b] - hourCnt[a]; }).slice(0, 3)
    .map(function (h) { return String(h).padStart(2, '0') + ':00 น. (' + hourCnt[h] + ')'; });
  var days = '<div class="hd-wk-days">' + HD_WK_DAY.map(function (d, i) {
    var day = new Date(D.s); day.setDate(day.getDate() + i);
    return '<div class="hd-wk-day" title="' + d + ' ' + day.getDate() + ': ' + dayCnt[i] + ' เรื่อง"><div class="col"><div style="height:' + (dayCnt[i] / dMax * 100) + '%"></div></div>'
      + '<div class="v">' + dayCnt[i] + '</div><div class="k">' + d + ' ' + day.getDate() + '</div></div>';
  }).join('') + '</div>' + (peakH.length ? '<div class="hd-wk-muted">⏰ แจ้งเข้ามามากช่วง ' + esc(peakH.join(' · ')) + '</div>' : '');
  var timeRow = '<div class="hd-wk-grid">'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">📈 แนวโน้ม 8 สัปดาห์ (รับเข้า / แก้เสร็จ)</div><div style="height:190px;position:relative"><canvas id="hd-wk-c-trend"></canvas></div></div>'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">📅 รับเข้ารายวัน</div>' + days + '</div>'
    + '</div>';

  // ── 1) กลุ่ม LINE: การ์ดต่อกลุ่ม (กด = กรองทั้งหน้า) ──
  var prevSrc = {}; D.prevW.forEach(function (t) { var k = hdWkSrc(t); prevSrc[k] = (prevSrc[k] || 0) + 1; });
  var groups = hdWkCount(tracked, hdWkSrc).map(function (g) {
    var inG = g.list.filter(function (t) { return D.inW.indexOf(t) >= 0; });
    var openG = g.list.filter(function (t) { return !hdWkIsDone(t, D); });
    var overG = g.list.filter(function (t) { return D.overdue.indexOf(t) >= 0; }).length;
    var doneG = g.list.length - openG.length;
    var hs = hdWkCount(g.list, function (t) { return t.hospitalId; }).map(function (h) { return hdWkHospName(h.key); });
    var cats = hdWkCount(g.list, function (t) { return t.categoryId; }).slice(0, 2).map(function (c) { return hdWkCatName(c.key) + ' ' + c.list.length; });
    var pv = prevSrc[g.key] || 0, d = inG.length - pv;
    var cls = overG ? 'bad' : openG.length ? 'warn' : 'good';
    return '<div class="hd-wk-gc hd-wk-gc-' + cls + (st.group === g.key ? ' on' : '') + '" onclick="window.hdWkGroup(' + esc(JSON.stringify(g.key)) + ')" title="กดเพื่อดูเฉพาะกลุ่มนี้">'
      + '<div class="hd-wk-gc-h"><b>' + esc(g.key) + '</b><span class="hd-wk-gc-tr">' + (pv || inG.length ? (d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '±0') + ' จากสัปดาห์ก่อน' : '') + '</span></div>'
      + '<div class="hd-wk-muted hd-wk-ell">🏥 ' + esc(hs.slice(0, 3).join(', ') + (hs.length > 3 ? ' +' + (hs.length - 3) : '')) + '</div>'
      + '<div class="hd-wk-gc-n"><span><b>' + inG.length + '</b> รับใหม่</span><span><b>' + doneG + '</b> ปิดแล้ว</span><span class="' + (openG.length ? 'hd-wk-wait' : '') + '"><b>' + openG.length + '</b> ค้าง</span>' + (overG ? '<span class="hd-wk-bad"><b>' + overG + '</b> เกิน SLA</span>' : '') + '</div>'
      + '<div class="hd-wk-prog"><div style="width:' + Math.round(doneG / g.list.length * 100) + '%"></div></div>'
      + (cats.length ? '<div class="hd-wk-muted hd-wk-ell">🗂️ ' + esc(cats.join(' · ')) + '</div>' : '')
      + '</div>';
  }).join('');
  var sec1 = '<div class="hd-sec-title">📥 1. งานจากกลุ่ม LINE / ช่องทาง <span class="hd-wk-muted">— กดการ์ดเพื่อดูเฉพาะกลุ่มนั้น</span></div><div class="hd-wk-pad">'
    + (groups ? '<div class="hd-wk-gcs">' + groups + '</div>' : '<div class="ov-card hd-wk-empty">ไม่มีเรื่องในสัปดาห์นี้</div>')
    + (D.cancelled ? '<div class="hd-wk-muted" style="margin-top:8px;">🚫 ยกเลิก ' + D.cancelled + ' เรื่อง (ไม่นับรวม)</div>' : '') + '</div>';

  // ── 2) ติดตามรายเรื่อง ──
  var sec2 = '<div class="hd-sec-title">📋 2. ติดตามรายเรื่อง</div><div class="hd-wk-pad"><div class="ov-card hd-wk-card" id="hd-wk-track">' + hdWkTrackHtml(D) + '</div></div>';

  // ── 3) ภาพรวมปัญหา ──
  var priGroups = (window.HD_PRIORITY || []).map(function (p) { return { key: p.id, list: tracked.filter(function (t) { return t.priority === p.id; }) }; }).filter(function (g) { return g.list.length; });
  var sec3 = '<div class="hd-sec-title">🧩 3. ภาพรวมปัญหา</div><div class="hd-wk-pad"><div class="hd-wk-grid2">'
    + hdWkBars('🗂️ หมวดปัญหา', hdWkCount(tracked, function (t) { return t.categoryId; }), hdWkCatName)
    + hdWkBars('💻 ระบบ', hdWkCount(tracked, function (t) { return t.sourceSystem || '(ไม่ระบุระบบ)'; }), function (k) { return k; })
    + hdWkBars('🏥 รพ. ที่แจ้งมากที่สุด', hdWkCount(tracked, function (t) { return t.hospitalId; }), hdWkHospName)
    + hdWkBars('🚦 ความเร่งด่วน', priGroups, function (k) { return hdPri(k).label; })
    + '</div></div>';

  // ── 4) การแก้ไข & ทีมงาน ──
  var staffMap = {};
  var sf = function (id) { return staffMap[id] = staffMap[id] || { id: id, got: 0, done: [], open: 0, over: 0 }; };
  D.inW.forEach(function (t) { sf(t.assigneeId).got++; });
  D.resW.forEach(function (t) { sf(t.assigneeId).done.push(t); });
  D.openEnd.forEach(function (t) { var x = sf(t.assigneeId); x.open++; if (D.overdue.indexOf(t) >= 0) x.over++; });
  var staffRows = Object.keys(staffMap).map(function (k) { return staffMap[k]; })
    .sort(function (a, b) { return b.done.length - a.done.length || b.got - a.got; }).map(function (x) {
      var r = x.done.filter(function (t) { return t.csatScore != null; });
      return '<tr><td>' + esc(x.id ? (hdStaffName(x.id) || x.id) : '⚠️ ยังไม่มอบหมาย') + '</td><td class="num">' + x.got + '</td><td class="num"><b>' + x.done.length + '</b></td>'
        + '<td class="num' + (x.open ? ' hd-wk-wait' : '') + '">' + x.open + (x.over ? ' <span class="hd-wk-bad">(' + x.over + ' เกิน)</span>' : '') + '</td>'
        + '<td class="num">' + hdWkFmtDur(hdWkAvg(x.done, function (t) { return hdWkMins(t.createdAt, t.resolvedAt); })) + '</td>'
        + '<td class="num">' + (r.length ? (r.reduce(function (a, t) { return a + t.csatScore; }, 0) / r.length).toFixed(1) : '—') + '</td></tr>';
    }).join('');
  var sec4 = '<div class="hd-sec-title">🛠️ 4. การแก้ไข & ทีมงาน</div><div class="hd-wk-pad"><div class="hd-wk-grid">'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">👤 ผลงานรายคน</div><div class="hd-wk-scroll"><table class="t-table hd-wk-tbl"><thead><tr><th>ผู้รับผิดชอบ</th><th class="num">รับเข้า</th><th class="num">แก้เสร็จ</th><th class="num">ค้าง</th><th class="num">เวลาแก้เฉลี่ย</th><th class="num">CSAT</th></tr></thead><tbody>'
    +   (staffRows || '<tr><td colspan="6" class="hd-wk-empty">ไม่มีข้อมูล</td></tr>') + '</tbody></table></div></div>'
    + '<div class="ov-card hd-wk-card" id="hd-wk-kb">' + hdWkKbHtml(D) + '</div>'
    + '</div></div>';

  return '<div id="hd-wk-doc">' + toolbar + head + '<div id="hd-wk-ai">' + hdWkAiHtml() + '</div>' + overview + '<div class="hd-wk-pad">' + timeRow + '</div>' + sec1 + sec2 + sec3 + sec4 + '</div>';
}

// การบันทึกวิธีแก้: เรื่องที่แก้เสร็จมีบันทึกเข้าคลังความรู้กี่เรื่อง (ช่วยให้ทีมแก้ปัญหาซ้ำได้เร็วขึ้น)
function hdWkKbHtml(D) {
  var done = D.resW, n = done.length;
  var loaded = done.every(function (t) { return _hdWkEv[t.id]; });
  var title = '<div class="ov-card-title">📚 การบันทึกวิธีแก้</div>';
  if (!n) return title + '<div class="hd-wk-empty">ไม่มีเรื่องที่แก้เสร็จในสัปดาห์นี้</div>';
  if (!loaded) return title + '<div class="hd-wk-muted">⏳ กำลังโหลด...</div>';
  var kb = done.filter(function (t) { var f = hdWkFix(t.id); return f && f.src === 'kb'; });
  var reply = done.filter(function (t) { var f = hdWkFix(t.id); return f && f.src === 'reply'; }).length;
  var none = n - kb.length - reply, pct = Math.round(kb.length / n * 100);
  var miss = done.filter(function (t) { return kb.indexOf(t) < 0; });
  return title + '<div class="hd-wk-stats">'
    + '<div class="hd-wk-stat"><div class="k">เข้าคลังความรู้</div><div class="v hd-wk-' + (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad') + '">' + kb.length + '/' + n + '</div><div class="s">' + pct + '%</div></div>'
    + '<div class="hd-wk-stat"><div class="k">มีแค่ข้อความตอบ</div><div class="v">' + reply + '</div></div>'
    + '<div class="hd-wk-stat"><div class="k">ไม่มีบันทึกเลย</div><div class="v' + (none ? ' hd-wk-bad' : '') + '">' + none + '</div></div></div>'
    + '<div class="hd-wk-prog"><div style="width:' + pct + '%"></div></div>'
    + (miss.length ? '<div class="hd-wk-muted" style="margin-top:8px;">ยังไม่บันทึกเข้าคลังความรู้: ' + miss.slice(0, 8).map(function (t) {
      return '<a href="javascript:void(0)" onclick="window.hdOpen(\'' + t.id + '\')">' + esc(t.ticketNo) + '</a>';
    }).join(', ') + (miss.length > 8 ? ' …' : '') + '</div>' : '<div class="hd-wk-muted" style="margin-top:8px;">✅ บันทึกครบทุกเรื่อง</div>');
}

// กราฟแนวโน้ม 8 สัปดาห์ — 2 series (รับเข้า/แก้เสร็จ) ใช้คู่สีเดียวกับแดชบอร์ดที่ผ่าน validate_palette แล้ว
function hdWkRenderChart() {
  var cv = document.getElementById('hd-wk-c-trend');
  window._hdCharts = window._hdCharts || {};
  if (window._hdCharts.wk) { try { window._hdCharts.wk.destroy(); } catch (e) {} delete window._hdCharts.wk; }
  if (!cv || !window.Chart) return;
  var st = hdWkState(), D = hdWkData();
  var labels = [], inN = [], outN = [];
  for (var i = 7; i >= 0; i--) {
    var a = new Date(D.s); a.setDate(a.getDate() - i * 7);
    var b = new Date(a); b.setDate(b.getDate() + 7);
    var inR = function (iso) { if (!iso) return false; var d = new Date(iso); return d >= a && d < b; };
    labels.push(hdWkD(a));
    inN.push(D.all.filter(function (t) { return t.status !== 'cancelled' && inR(t.createdAt); }).length);
    outN.push(D.all.filter(function (t) { return t.status !== 'cancelled' && inR(t.resolvedAt); }).length);
  }
  var css = getComputedStyle(document.body), dark = hdIsDark();
  var grid = (css.getPropertyValue('--border') || '#e2e5ec').trim(), ink2 = (css.getPropertyValue('--txt2') || '#5a6075').trim(), ink3 = (css.getPropertyValue('--txt3') || '#9ba3b8').trim();
  var cIn = '#4361ee', cOut = dark ? '#199e70' : '#1baf7a';
  var tick = { color: ink3, font: { size: 10.5 } };
  window._hdCharts.wk = new Chart(cv, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'รับเข้า', data: inN, borderColor: cIn, backgroundColor: cIn, borderWidth: 2, tension: .3, pointRadius: 4, pointHoverRadius: 6 },
      { label: 'แก้เสร็จ', data: outN, borderColor: cOut, backgroundColor: cOut, borderWidth: 2, tension: .3, pointRadius: 4, pointHoverRadius: 6 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: ink2, font: { size: 11 }, boxWidth: 10, usePointStyle: true } } },
      scales: { x: { grid: { display: false }, ticks: tick }, y: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tick) } } },
  });
}

// หลัง render: กราฟ + โหลดบทสนทนาของเรื่องที่ติดตาม แล้วเติมเฉพาะส่วนที่ใช้ (ไม่ render ทั้งหน้าซ้ำ)
async function hdWkAfterRender() {
  hdWkRenderChart();
  var ids = hdWkTracked(hdWkData()).map(function (t) { return t.id; });
  if (!ids.some(function (id) { return !_hdWkEv[id]; })) return;
  await hdWkLoadEvents(ids);
  if (window.hdTab !== 'weekly') return;
  var D = hdWkData(), tr = document.getElementById('hd-wk-track'), kb = document.getElementById('hd-wk-kb');
  if (tr) tr.innerHTML = hdWkTrackHtml(D);
  if (kb) kb.innerHTML = hdWkKbHtml(D);
}

// ── AI ──
function hdWkAiHtml() {
  var a = _hdWkAi;
  if (!a || a.key !== hdWkKey()) return '';
  var body = a.loading ? '<div class="hd-wk-muted" id="hd-wk-ai-prog">⏳ ' + esc(a.progress || 'AI กำลังวิเคราะห์ข้อมูล…') + '</div>'
    : a.error ? '<div style="color:var(--coral);font-size:12.5px;">' + esc(a.error) + '</div>'
    : '<div class="ai-text">' + window.aiTextToHtml(a.text) + '</div>';
  return '<div class="hd-wk-pad"><div class="ai-card"><div class="ai-card-head"><div class="sec-label" style="margin:0;">🤖 บทสรุปจาก AI</div><div style="flex:1"></div>'
    + (a.text ? '<button class="btn btn-ghost btn-sm hd-wk-noprint" onclick="window.hdWkCopyAi()" title="คัดลอกไปวางในกลุ่ม LINE">📋 คัดลอกส่ง LINE</button>' : '')
    + (a.loading ? '' : '<button class="btn btn-ghost btn-sm hd-wk-noprint" onclick="window.hdWkCloseAi()">✕</button>')
    + '</div>' + body + (a.text ? '<div class="ai-card-note">* สรุปโดย AI จากข้อมูล Ticket ในระบบ — ตัวเลขในตารางด้านล่างคำนวณจากระบบโดยตรง ตรวจสอบก่อนนำไปใช้</div>' : '')
    + '</div></div>';
}
function hdWkAiRefresh() { var el = document.getElementById('hd-wk-ai'); if (el && window.hdTab === 'weekly') el.innerHTML = hdWkAiHtml(); }
window.hdWkCloseAi = function () { _hdWkAi = null; hdWkAiRefresh(); };

function hdWkStatsText(D) {
  var st = hdWkState(), eLast = new Date(D.e); eLast.setDate(eLast.getDate() - 1);
  var top = function (list, keyFn, nameFn, k) {
    return hdWkCount(list, keyFn).slice(0, k).map(function (g) { return nameFn(g.key) + ' ' + g.list.length; }).join(' · ') || '-';
  };
  var id = function (x) { return x; };
  return [
    'สัปดาห์: ' + hdWkD(D.s, true) + ' – ' + hdWkD(eLast, true) + (D.isCurrent ? ' (สัปดาห์ปัจจุบัน ยังไม่จบ)' : ''),
    'ขอบเขต: ' + ([st.group, st.hosp ? hdWkHospName(st.hosp) : ''].filter(Boolean).join(' · ') || 'ทุกกลุ่ม LINE/ช่องทาง ทุก รพ.'),
    'รับเรื่องใหม่ ' + D.inW.length + ' (สัปดาห์ก่อน ' + D.prevW.length + ') · แก้เสร็จ ' + D.resW.length + ' · ค้าง' + (D.isCurrent ? 'ตอนนี้ ' : 'สิ้นสัปดาห์ ') + D.openEnd.length
      + ' · เกิน SLA ที่ยังค้าง ' + D.overdue.length + ' · ด่วน P1/P2 ' + D.urgent.length + ' · เปิดซ้ำ ' + D.reopened.length + (D.cancelled ? ' · ยกเลิก ' + D.cancelled : ''),
    'เวลาตอบครั้งแรกเฉลี่ย ' + hdWkFmtDur(D.frt) + ' · เวลาแก้เฉลี่ย ' + hdWkFmtDur(D.mttr) + ' · ตรง SLA ' + (D.slaPct == null ? '-' : D.slaPct + '%')
      + ' · ความพึงพอใจ ' + (D.csat == null ? '-' : D.csat.toFixed(1) + '/5 (' + D.csatN + ' รีวิว)'),
    'แยกตามกลุ่ม LINE/ช่องทาง: ' + top(D.inW, hdWkSrc, id, 12),
    'แยกตามหมวด: ' + top(D.inW, function (t) { return t.categoryId; }, hdWkCatName, 10),
    'แยกตามระบบ: ' + top(D.inW, function (t) { return t.sourceSystem || '(ไม่ระบุระบบ)'; }, id, 8),
    'รพ. ที่แจ้งมากสุด: ' + top(D.inW, function (t) { return t.hospitalId; }, hdWkHospName, 8),
    'ผู้แก้เสร็จมากสุด: ' + top(D.resW, function (t) { return t.assigneeId; }, function (k) { return hdStaffName(k) || 'ยังไม่มอบหมาย'; }, 8),
  ].join('\n');
}
function hdWkTicketLine(t, D) {
  var f = hdWkFix(t.id), flags = [];
  if (D.overdue.indexOf(t) >= 0) flags.push('เกิน SLA');
  if ((t.reopenedCount || 0) > 0) flags.push('เปิดซ้ำ ' + t.reopenedCount);
  var c = new Date(t.createdAt);
  return '#' + t.ticketNo + ' | ' + c.getDate() + '/' + (c.getMonth() + 1) + ' | ' + hdWkHospName(t.hospitalId) + ' | ' + hdWkSrc(t) + ' | ' + hdWkCatName(t.categoryId)
    + (t.sourceSystem ? ' | ' + t.sourceSystem : '') + ' | ' + hdPri(t.priority).short + ' | ' + hdStatus(t.status).label + (flags.length ? ' (' + flags.join(', ') + ')' : '')
    + ' | ผู้รับผิดชอบ: ' + (hdStaffName(t.assigneeId) || '-')
    + '\n  ปัญหา: ' + String(t.description || t.subject || '-').replace(/\s+/g, ' ').slice(0, 220)
    + '\n  การแก้ไข: ' + (f && f.text ? f.text.replace(/\s+/g, ' ').slice(0, 220) : '-');
}

window.hdWkRunAi = async function () {
  if (_hdWkAi && _hdWkAi.loading) return;
  var D = hdWkData(), key = hdWkKey();
  var tks = hdWkTracked(D);
  if (!tks.length) { window.showAlert && window.showAlert('สัปดาห์นี้ยังไม่มีข้อมูลให้สรุป', 'warn'); return; }
  _hdWkAi = { key: key, loading: true, progress: 'กำลังรวบรวมบทสนทนาและวิธีแก้ไข…' };
  window.renderHelpdesk();
  var prog = function (msg) { _hdWkAi.progress = msg; var el = document.getElementById('hd-wk-ai-prog'); if (el) el.textContent = '⏳ ' + msg; };
  try {
    await hdWkLoadEvents(tks.map(function (t) { return t.id; }));
    tks.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var lines = tks.map(function (t) { return hdWkTicketLine(t, D); });
    // แบ่งชุดตามความยาว — โมเดลรับข้อความได้จำกัด
    var chunks = [], cur = '';
    lines.forEach(function (l) { if (cur && cur.length + l.length > 9000) { chunks.push(cur); cur = ''; } cur += l + '\n'; });
    if (cur) chunks.push(cur);
    var stats = hdWkStatsText(D), material;
    if (chunks.length === 1) material = 'รายการ Ticket (' + tks.length + ' เรื่อง):\n' + chunks[0];
    else {
      var notes = [];
      for (var i = 0; i < chunks.length; i++) {
        prog('AI กำลังอ่าน Ticket ชุดที่ ' + (i + 1) + '/' + chunks.length + '…');
        notes.push(await window.aiChat(
          'คุณเป็นผู้ช่วยทีม Helpdesk ซอฟต์แวร์โรงพยาบาล อ่านรายการ Ticket แล้วจัดกลุ่มปัญหาที่คล้ายกัน เขียนเป็น bullet ภาษาไทยสั้น ๆ: '
          + '"- <กลุ่มปัญหา> (<จำนวน> เรื่อง: <รพ.> ) — สาเหตุที่พบ: ... — วิธีแก้ที่ใช้: ..." และระบุเรื่องค้าง/เกิน SLA/เปิดซ้ำที่น่ากังวล '
          + 'ใช้เฉพาะข้อมูลที่ให้ ห้ามแต่งวิธีแก้ที่ไม่มีในข้อมูล',
          chunks[i], { maxTokens: 900, temperature: 0.2 }));
      }
      material = 'บันทึกสรุปย่อยจาก Ticket ทั้งหมด ' + tks.length + ' เรื่อง (แบ่งอ่านเป็น ' + chunks.length + ' ชุด):\n' + notes.join('\n');
    }
    prog('AI กำลังเขียนบทสรุปประจำสัปดาห์…');
    var text = await window.aiChat(
      'คุณเป็นหัวหน้าทีม Helpdesk ซอฟต์แวร์โรงพยาบาล (HOSxP ฯลฯ) เขียนรายงานสรุปงานประจำสัปดาห์ภาษาไทย ให้ผู้บริหารและทีมอ่าน '
      + 'ใช้หัวข้อตามลำดับนี้: "## ภาพรวมสัปดาห์", "## งานที่ได้รับจากกลุ่ม LINE", "## ภาพรวมปัญหา", "## การแก้ไข", "## เรื่องที่ต้องติดตาม", "## ข้อเสนอแนะสัปดาห์หน้า" '
      + '· ภาพรวมปัญหา: จัดกลุ่มปัญหาที่คล้ายกัน บอกจำนวน รพ. ที่เกี่ยวข้อง และปัญหาที่เกิดซ้ำ (อาจเป็นต้นเหตุเชิงระบบ) '
      + '· การแก้ไข: สรุปวิธีแก้ของแต่ละกลุ่มปัญหา และวิธีที่ควรเก็บเข้าคลังความรู้ · เรื่องที่ต้องติดตาม: อ้างเลขที่ Ticket '
      + '· ข้อเสนอแนะ 3–5 ข้อ เจาะจง ทำได้จริง (เช่น อบรมผู้ใช้ รพ. ใด, แก้ระบบ/ตั้งค่า, ทำคู่มือ, เพิ่มคน) '
      + '· แต่ละหัวข้อเป็น bullet สั้น กระชับ อ้างตัวเลขจริงจากสถิติ ห้ามแต่งตัวเลขหรือข้อมูลที่ไม่มี ถ้าข้อมูลส่วนไหนไม่มีให้บอกว่าไม่มี',
      'สถิติ (คำนวณจากระบบ ถูกต้องแล้ว):\n' + stats + '\n\n' + material, { maxTokens: 2200, temperature: 0.3 });
    _hdWkAi = { key: key, text: text };
  } catch (e) {
    _hdWkAi = { key: key, error: 'AI สรุปไม่สำเร็จ: ' + (e.message || e) };
  }
  if (window.hdTab === 'weekly') window.renderHelpdesk();
};
window.hdWkCopyAi = function () {
  if (!_hdWkAi || !_hdWkAi.text) return;
  var D = hdWkData(), eLast = new Date(D.e); eLast.setDate(eLast.getDate() - 1);
  var txt = '📊 สรุปงานศูนย์ช่วยเหลือ สัปดาห์ ' + hdWkD(D.s) + ' – ' + hdWkD(eLast, true) + '\n'
    + _hdWkAi.text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*#{1,4}\s+(.*)$/gm, '\n▶ $1').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
  hdCopy(txt, 'คัดลอกบทสรุปแล้ว — วางในกลุ่ม LINE ได้เลย');
};

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

window.hdDownloadImportTemplate = async function () {
  if (!(await window.LibLoader.need('xlsx'))) return;
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

async function hdImportProcess(file) {
  var box = document.getElementById('hd-import-status');
  var runBtn = document.getElementById('m-hd-import-run');
  window._hdImportRows = null; if (runBtn) runBtn.disabled = true;
  if (!file) { if (box) box.innerHTML = ''; return; }
  if (!(await window.LibLoader.need('xlsx'))) { box.innerHTML = ''; return; }
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
          var byName = d.resolvedById ? hdStaffName(d.resolvedById) : d.resolvedByName;
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
    return '<div class="hdopt-row" style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span class="hdopt-id" style="font-size:11px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:24px;">' + esc(p.id) + '</span>'
      + '<input type="color" class="hdopt-color" data-id="' + p.id + '" value="' + esc(p.color) + '" style="width:34px;height:34px;border:2px solid var(--border);border-radius:8px;cursor:pointer;padding:2px;background:transparent;">'
      + '<input class="f-input hdopt-label" data-id="' + p.id + '" value="' + esc(p.label) + '" style="flex:1;padding:6px 10px;">'
      + '</div>';
  }).join('');

  var priOpts4 = function (sel) { return (window.HD_PRIORITY || []).map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join(''); };
  var urgRows = (window.HD_URGENCY || []).map(function (u) {
    return '<div class="hdopt-row" style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span class="hdopt-id" style="font-size:10.5px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:52px;">' + esc(u.id) + '</span>'
      + '<input class="f-input hdopt-label" data-id="' + u.id + '" value="' + esc(u.label) + '" style="flex:1;padding:6px 10px;">'
      + '<select class="f-input hdopt-pri" data-id="' + u.id + '" style="width:150px;padding:6px 10px;">' + priOpts4(u.priority) + '</select>'
      + '</div>';
  }).join('');

  var stRows = (window.HD_STATUS || []).map(function (s) {
    return '<div class="hdopt-row" style="display:flex;align-items:center;gap:10px;padding:7px 0;">'
      + '<span class="hdopt-id" style="font-size:10px;font-family:\'JetBrains Mono\',monospace;color:var(--txt3);width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(s.id) + '</span>'
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
