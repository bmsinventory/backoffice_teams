/**
 * helpdesk.js — Helpdesk (ศูนย์ช่วยเหลือ) UI
 * โมดูล 'helpdesk' — คิวงาน / ของฉัน / แดชบอร์ด / สรุปรายสัปดาห์ (AI) + หน้ารายละเอียด Ticket + modal "+ แจ้งแทน"
 * เก็บเฉพาะปัญหาลูกค้า (โรงพยาบาล) · หน้า public = docs/help.html
 */
const { esc, fd, fca, pd, gSt } = window;

// ── helpers ─────────────────────────────────────────────────────────────
// ดัชนี id → ตำแหน่ง ของ array กลาง (STAFF/HOSPITALS/หมวด/สถานะ) — สร้างครั้งเดียวต่อรอบ render แทน .find ทุกแถว
// (เดิม O(แถว × ขนาด array)) · ล้างทิ้งเองเมื่อจบงาน sync รอบนี้ (microtask) + เช็กความยาว/ตรวจ id ซ้ำ กันข้อมูลเปลี่ยนกลางรอบ
// ผลเหมือน .find(x => x.id === id) ทุกกรณี (ตัวแรกที่ id ตรงกัน, ไม่เจอ = undefined)
var _hdIdx = null;
function hdById(arr, id) {
  if (!_hdIdx) { _hdIdx = new Map(); Promise.resolve().then(function () { _hdIdx = null; }); }
  var c = _hdIdx.get(arr);
  if (!c || c.len !== arr.length) {
    var pos = new Map();
    for (var i = 0; i < arr.length; i++) if (!pos.has(arr[i].id)) pos.set(arr[i].id, i);
    c = { len: arr.length, pos: pos };
    _hdIdx.set(arr, c);
  }
  var p = c.pos.get(id);
  if (p === undefined) return undefined;
  var x = arr[p];
  if (x && x.id === id) return x;
  _hdIdx.delete(arr); // ข้อมูลถูกแทนที่กลางรอบ → หาแบบเดิม
  return arr.find(function (y) { return y.id === id; });
}
function hdStatus(id) { return hdById(window.HD_STATUS || [], id) || { id: id, label: id, color: '#9ba3b8', icon: '•', open: true }; }
function hdPri(id)    { return hdById(window.HD_PRIORITY || [], id) || { id: id, short: id, label: id, color: '#9ba3b8' }; }
function hdCat(id)    { return hdById(window.HELPDESK_CATEGORIES || [], id) || null; }
// ชื่อพนักงาน — ไม่ได้ระบุ/หาไม่เจอ → ค่าว่าง (gSt() กลางคืน "?" ซึ่งไม่สื่อความหมายในหน้านี้)
function hdStaffName(id) { var s = id && hdById(window.STAFF || [], id); return (s && s.name) || ''; }
function hdHosp(id)   { return hdById(window.HOSPITALS || [], id) || null; }

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
  try { return new URL('help.html', window.location.href).href; }
  catch (e) { return 'help.html'; }
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
  window.hdBackfillLegacyAssignedStatus && window.hdBackfillLegacyAssignedStatus(window.HELPDESK_TICKETS || []);

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
    { id: 'recur', label: '🔁 ปัญหาที่พบบ่อย' },
    { id: 'weekly', label: '🤖 สรุปรายงาน' },
    { id: 'kb', label: '📚 คลังความรู้' },
  ];
  var tabsHtml = tabs.map(function (x) {
    return '<button class="af-tab' + (tab === x.id ? ' on' : '') + '" onclick="window.hdGo(\'' + x.id + '\')">' + x.label + '</button>';
  }).join('');

  var body = '';
  if (tab === 'dashboard') body = hdDashboardHtml();
  else if (tab === 'recur') body = hdRcHtml();
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
  if (tab === 'queue' || tab === 'mine') hdQueueAfterRender();
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
var HD_TKNO_COLL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
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
  if (e.actor_type === 'ai') return 'AI ผู้ช่วย';
  return hdStaffName(e.actor_id) || 'ทีมงาน';
}

// ตัวกรองทั้งหมดยกเว้น "มุมมอง" (แถบมุมมองใช้นับตัวเลขของแต่ละปุ่มจากชุดนี้)
function hdFiltered(mineOnly) {
  var f = window.hdFilter || {};
  var meId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  var q = f.q ? f.q.toLowerCase() : '';
  return (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (mineOnly) { if (!meId || t.assigneeId !== meId) return false; }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === '-' ? t.assigneeId : (f.assignee && t.assigneeId !== f.assignee)) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.q) {
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

  // เรียงตามเลขที่ Ticket จากมากไปน้อย (natural sort เพื่อให้ส่วนตัวเลขเรียงแบบตัวเลขจริง)
  // ใช้ Intl.Collator ตัวเดียว (= localeCompare(…, 'en', {numeric, sensitivity}) แต่ไม่สร้าง collator ใหม่ทุกครั้งที่เทียบ)
  var rows = base.filter(function (r) { return view.fn(r.t, r.x); });
  rows.forEach(function (r) { r.kNo = String(r.t.ticketNo || ''); r.kAt = String(r.t.createdAt || ''); });
  rows.sort(function (a, b) {
    var d = HD_TKNO_COLL.compare(b.kNo, a.kNo);
    return d || b.kAt.localeCompare(a.kAt);
  });

  var catOpts = '<option value="">หมวด: ทั้งหมด</option>' + (window.HELPDESK_CATEGORIES || [])
    .map(function (c) { return '<option value="' + c.id + '"' + (f.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  var prOpts = '<option value="">Priority: ทั้งหมด</option>' + (window.HD_PRIORITY || [])
    .map(function (p) { return '<option value="' + p.id + '"' + (f.priority === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
  var groupOpts = [['', 'จัดกลุ่ม: ไม่จัด'], ['hosp', 'จัดกลุ่ม: ตาม รพ.'], ['owner', 'จัดกลุ่ม: ตามผู้รับผิดชอบ'], ['wait', 'จัดกลุ่ม: ตามรอใคร']]
    .map(function (g) { return '<option value="' + g[0] + '"' + ((f.group || '') === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('');
  var pageSize = window.hdPageSize || 50;
  var pageSizeOpts = [50, 100, 500, 1000].map(function (n) { return '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' แถว/หน้า</option>'; }).join('');

  var toolbar =
    '<div class="toolbar hd-q-toolbar">'
    + '<div class="t-search"><input id="hd-q" placeholder="ค้นหา เลขที่ / หัวข้อ / ผู้แจ้ง / รพ." value="' + esc(f.q || '') + '" oninput="window.hdSetFilter(\'q\',this.value)"></div>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'priority\',this.value)">' + prOpts + '</select>'
    + hdStaffComboMarkup('hd-fas', 't-sel', false, 'ผู้รับผิดชอบ: ทั้งหมด', 'width:230px;')
    + '<select class="t-sel" onchange="window.hdSetFilter(\'category\',this.value)">' + catOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdSetFilter(\'group\',this.value)">' + groupOpts + '</select>'
    + '<div class="hd-q-spacer"></div>'
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
    + '<span class="sort">เรียงตาม: เลขที่มากไปน้อย</span>'
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
    + '<thead><tr><th>#</th><th>เลขที่ / อายุ ↓</th><th>เรื่อง · ข้อความล่าสุด</th><th>รพ. / ผู้แจ้ง</th><th>P</th><th>สถานะ · รอใคร</th><th>ผู้รับผิดชอบ</th><th>SLA' + window.calcTip('เวลาที่เหลือก่อนครบกำหนดแก้เสร็จ · แถบ = % ของเวลาที่ใช้ไปแล้ว\nใกล้เกิน = เหลือน้อยกว่า 20% ของเวลาทั้งหมด\nรอผู้แจ้ง = หยุดนับระหว่างรอ\nเรื่องที่จบแล้ว = เวลาที่ใช้ทั้งหมด และ ✓/✗ ทันกำหนดหรือไม่') + '</th><th>ล่าสุด</th></tr></thead>'
    + '<tbody>' + (trs || '<tr><td colspan="9" class="hd-q-empty">' + (view.id === 'now' ? 'ไม่มีเรื่องที่ต้องทำตอนนี้ 🎉' : 'ไม่มี Ticket') + '</td></tr>') + '</tbody></table></div>';

  var pager = totalPages > 1
    ? '<div class="hd-q-pager">'
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
  hdQueueAfterRender();
  if (sel) { var i = document.getElementById('hd-q'); if (i) { i.focus(); i.setSelectionRange(sel[0], sel[1]); } }
}

// ตัวกรองผู้รับผิดชอบ = combobox ค้นหาได้ + จัดกลุ่มตามแผนก — ต้อง init ใหม่ทุกครั้งที่วาด toolbar
function hdQueueAfterRender() {
  if (!document.getElementById('hd-fas')) return;
  window._initHdStaffCombobox('hd-fas', (window.hdFilter || {}).assignee || '', function (sid) { window.hdSetFilter('assignee', sid); }, { filter: true });
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
    + (canEdit && !st.open ? '<button id="hd-kb-btn" class="btn btn-ghost btn-sm" style="display:none;" onclick="window.hdKbOpen(\'' + t.id + '\')" title="ให้ AI สรุปสาเหตุ/วิธีแก้จากบทสนทนา เก็บเข้าคลังความรู้">📚<span class="hd-h-lbl"> บันทึกวิธีแก้</span></button>' : '')
    + (t.priority === hdCriticalPriority() ? '<button class="btn btn-pri btn-sm" style="background:var(--coral,#e5484d)" onclick="window.open(\'' + hdJitsiUrl(t.ticketNo) + '\',\'_blank\')" title="เข้าร่วมสาย">📞<span class="hd-h-lbl"> เข้าร่วมสาย</span></button>' : '')
    + '<button class="btn btn-ghost btn-sm hd-h-desk" onclick="window.hdCopyLink(\'' + t.id + '\')">🔗 คัดลอกลิงก์</button>'
    + '<button class="btn btn-ghost btn-sm hd-h-desk" onclick="window.hdCopyMsg(\'' + t.id + '\')">📋 คัดลอกข้อความ</button>'
    + '</div>'
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
    + '<div><label class="hd-lbl">ผู้รับผิดชอบ' + (canEdit && st.open ? ' <a href="javascript:void(0)" class="hd-ai-link" onclick="window.hdAiAssignOne(\'' + t.id + '\')">🤖 แนะนำ</a>' : '') + '</label>' + hdStaffComboMarkup('hd-as', 't-sel', !!dis) + '</div>'
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
    + (t.csatScore != null ? '<div id="hd-customer-feedback" class="hd-feedback"><div class="hd-feedback-loading">กำลังโหลดความคิดเห็นจากผู้แจ้ง...</div></div>' : '')
    + '</div>'
    + '</div>';

  window._initHdStaffCombobox('hd-as', t.assigneeId || '', function (sid) { window.hdSetField(t.id, 'assigneeId', sid); });
  if (canEdit && !locked) window.attPickerInit('hd-reply-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, dropOn: 'hd-composer', keep: !!draft });
  var ta = document.getElementById('hd-reply');
  if (ta) ta.addEventListener('keydown', function (e) {
    // Enter sends the reply; Shift+Enter keeps the normal newline behavior.
    // Ignore IME composition so selecting a Thai suggestion never sends early.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!ta.dataset.sending) window.hdSendReply(t.id, null);
  });
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
  if (t.csatScore != null) hdLoadCustomerFeedback(t.id);
  hdLiveStart(t.id);
}

// ความคิดเห็นในแบบประเมินถูกเก็บแยกจาก event เพื่อรองรับข้อมูลเก่าด้วย จึงโหลดมาแสดงในหน้าทีมโดยตรง
async function hdLoadCustomerFeedback(ticketId) {
  var box = document.getElementById('hd-customer-feedback');
  var db = window.getDb && window.getDb();
  if (!box || !db) return;
  var r = await db.from('helpdesk_ratings').select('score,comment,would_recommend,created_at')
    .eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1);
  box = document.getElementById('hd-customer-feedback');
  if (!box || window.hdOpenId !== ticketId) return;
  var x = r.data && r.data[0];
  if (!x) { box.innerHTML = '<div class="hd-feedback-empty">ยังไม่มีรายละเอียดความคิดเห็น</div>'; return; }
  box.innerHTML = '<div class="hd-feedback-head"><span>เสียงจากผู้แจ้ง</span><b>⭐ ' + Number(x.score || 0) + '/5</b></div>'
    + (x.comment ? '<div class="hd-feedback-comment">“' + esc(x.comment) + '”</div>' : '<div class="hd-feedback-empty">ไม่ได้เขียนความคิดเห็นเพิ่มเติม</div>')
    + '<div class="hd-feedback-meta">' + (x.would_recommend ? '✓ แนะนำบริการนี้' : '— ไม่ได้เลือกแนะนำบริการ')
    + (x.created_at ? ' · ' + hdDT(x.created_at) : '') + '</div>';
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
    var fromCust = e.actor_type === 'reporter', isAi = e.actor_type === 'ai', mine = !fromCust;
    var kb = hdIsKbEvent(e), note = e.is_internal && !kb;
    var who = fromCust ? (t.reporterName || 'ผู้แจ้ง') : isAi ? 'AI ผู้ช่วย' : hdChatStaff(e.actor_id);
    var key = (fromCust ? 'r:' : isAi ? 'ai:' : 'a:' + (e.actor_id || '')) + (note ? ':n' : '') + (kb ? ':k' : '');
    // ข้อความต่อเนื่องจากคนเดิม (ห่างไม่เกิน 5 นาที) → ไม่ซ้ำชื่อ/อวาตาร์
    var cont = prev && prev.key === key && (new Date(e.created_at) - new Date(prev.at)) < 5 * 60000;
    prev = { key: key, at: e.created_at };
    var body = String(e.body || '');
    if (body === '(แนบไฟล์)' && files) body = ''; // ส่งแค่ไฟล์ → โชว์ไฟล์อย่างเดียว
    var long = body.length > 280 || body.split('\n').length > 6;
    var tag = note ? '<span class="hd-bub-tag">🔒 โน้ตภายใน</span>' : kb ? '<span class="hd-bub-tag kb">📚 วิธีแก้ (คลังความรู้)</span>' : isAi ? '<span class="hd-bub-tag">🤖 AI ตอบอัตโนมัติ</span>' : '';
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
      +     (mine && !note
              ? '<span class="hd-meta"><span class="hd-read' + (t.reporterLastReadAt && new Date(t.reporterLastReadAt) >= new Date(e.created_at) ? ' seen' : '') + '">'
                + (t.reporterLastReadAt && new Date(t.reporterLastReadAt) >= new Date(e.created_at) ? 'อ่านแล้ว' : 'ส่งแล้ว')
                + '</span><span class="hd-time">' + time + '</span></span>'
              : '<span class="hd-time">' + time + '</span>')
      +   '</div>'
      + '</div></div>';
  });
  if (byEvent['']) html += '<div class="hd-chat-sys"><span>📎 ไฟล์แนบ</span></div><div class="hd-chat-sys">' + hdAttachHtml(byEvent['']) + '</div>';
  hdMarkAgentRead(t, evs);
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

// เปิดบทสนทนาอยู่และหน้าจอมองเห็นได้จริง → บันทึกว่าทีมงานเห็นข้อความล่าสุดจากผู้แจ้งแล้ว
// ไม่แตะ updated_at เพราะการอ่านอย่างเดียวไม่ควรดัน Ticket ขึ้นเป็นกิจกรรมล่าสุด
function hdMarkAgentRead(t, evs) {
  if (document.visibilityState === 'hidden') return;
  var latest = (evs || []).filter(function (e) {
    return e.type === 'comment' && e.actor_type === 'reporter' && !e.is_internal;
  }).pop();
  if (!latest || (t.agentLastReadAt && new Date(t.agentLastReadAt) >= new Date(latest.created_at))) return;
  if (!window.updateDoc || !window.getDocRef) return;
  var readAt = new Date().toISOString();
  t.agentLastReadAt = readAt; // กัน realtime/poll รอบถัดไปเขียนซ้ำระหว่างรอข้อมูลกลับมา
  window.updateDoc(window.getDocRef('HELPDESK_TICKETS', t.id), { agent_last_read_at: readAt })
    .catch(function (e) { console.warn('[helpdesk] mark read:', e); });
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
    priority: t.priority, status: t.status, assignee_id: t.assigneeId, sla_policy_id: t.slaPolicyId,
    first_response_at: t.firstResponseAt || null, first_response_due: t.firstResponseDue || null,
    resolution_due: t.resolutionDue || null, resolved_at: t.resolvedAt || null, closed_at: t.closedAt || null,
    pending_since: t.pendingSince || null, pending_total_mins: t.pendingTotalMins,
    frt_breached: t.frtBreached, resolution_breached: t.resolutionBreached, reopened_count: t.reopenedCount,
    csat_score: t.csatScore, access_token: t.accessToken, public_view_expires_at: t.publicViewExpiresAt || null,
    rated_at: t.ratedAt || null, tags: t.tags, created_by: t.createdBy,
    agent_last_read_at: t.agentLastReadAt || null,
    reporter_last_read_at: t.reporterLastReadAt || null, created_at: t.createdAt,
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
      window.updateBadge && window.updateBadge();
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
    // A triaged ticket is ready to leave "กำลังจัดหมวด" once both
    // category and assignee are known. Keep the existing new -> assigned
    // behavior, and also cover either order of filling the two fields.
    if (val && (t.status === 'new' || (t.status === 'triage' && t.categoryId))) p.status = 'assigned';
    return hdWriteFull(id, p, { type: 'assignment', body: val ? ('มอบหมายให้ ' + hdStaffName(val)) : 'ยกเลิกการมอบหมาย' });
  }
  if (field === 'categoryId') {
    var catPatch = { category_id: val };
    if (val && t.status === 'triage' && t.assigneeId) catPatch.status = 'assigned';
    return hdWriteFull(id, catPatch, { type: 'field_change', body: 'ปรับหมวดปัญหา' });
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
  if (ta && ta.dataset.sending) return;
  if (ta) ta.dataset.sending = '1';
  var isInternal = !!(internalCb && internalCb.checked);
  try {
    if (txt || files.length) {
      var ev = await window.hdAddEvent(id, {
        type: 'comment', actorType: 'agent',
        actorId: (window.cu && (window.cu.staffId || window.cu.staff_id)) || '',
        body: txt || '(แนบไฟล์)', isInternal: isInternal,
      });
      var by = window.meId(); // รหัสผู้ใช้ (users.id)
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
  finally { if (ta) delete ta.dataset.sending; }
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
// ตรง ๆ (ไม่ใช่ id) เพราะ source_system ในตาราง tickets เป็น free-text ตามชื่อที่เลือก
// ใช้ได้หลายที่ด้วย prefix ของ id (ค่าเริ่มต้น hdf-sys · การ์ดใน "วางแชท LINE" = hdl-sys)
// opts (ไม่บังคับ): onPick(name) เรียกเมื่อเลือกใหม่ · emptyLabel = ข้อความของรายการว่าง (เลือกเพื่อล้างค่า) ──
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
  return function (curName, pfx, opts) {
    pfx = pfx || 'hdf-sys'; opts = opts || {};
    var inp = document.getElementById(pfx + '-cmb-input'), drop = document.getElementById(pfx + '-cmb-drop'),
      lst = document.getElementById(pfx + '-cmb-list'), hid = document.getElementById(pfx);
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
        // ค้นหาแล้วยังคงแสดงหัวกลุ่ม — พิมพ์ชื่อกลุ่ม (เช่น "Smart") ก็ได้ทั้งกลุ่ม
        gord.forEach(function (gid) {
          var g = gmap[gid], gHit = (g.label || '').toLowerCase().indexOf(lq) !== -1;
          var its = g.items.filter(function (p) { return gHit || (p.name || '').toLowerCase().indexOf(lq) !== -1; });
          if (!its.length) return;
          f.push({ k: 'h', gid: gid, label: g.label, color: g.color, count: its.length });
          its.forEach(function (p) { f.push({ k: 'i', name: p.name }); });
        });
      } else {
        if (opts.emptyLabel) f.push({ k: 'i', name: '', empty: true });
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
        return '<div class="hdsc-i" data-name="' + esc(it.name) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:' + (it.empty ? 'var(--txt3)' : 'var(--txt1)') + ';">'
          + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
          + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"' + (it.empty ? '' : ' title="' + esc(it.name) + '"') + '>' + (it.empty ? esc(opts.emptyLabel) : hi(it.name, q)) + '</span></div>';
      }).join('');
    }
    function positionDrop() { window.placeDropdown(inp, drop, lst, 300, 300); } // ช่องแคบ (เช่นการ์ดใน "วางแชท LINE") → dropdown กว้างอย่างน้อย 300px
    // scroll listener ต้อง capture:true เพราะ scroll ไม่ bubble — จับ scroll ของ .m-body ที่ครอบ input
    // นี้อยู่ด้วย (ดูคอมเมนต์เดียวกันใน _initHdHospCombobox ด้านบน) ──
    function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
    function selItem(name) {
      var changed = name !== selName;
      selName = name; hid.value = name; inp.classList.remove('hd-invalid'); closeDrop(); hid.dispatchEvent(new Event('change'));
      if (changed && opts.onPick) opts.onPick(name);
    }
    lst.addEventListener('mousedown', function (e) { e.preventDefault(); }); // คลิกในรายการไม่ให้ input เสีย focus
    lst.addEventListener('click', function (e) {
      var h = e.target.closest('.hdsc-h'), it = e.target.closest('.hdsc-i');
      if (h) { var gid = h.dataset.gid; if (col.has(gid)) col.delete(gid); else col.add(gid); flat = bFlat(q); fi = -1; render(); }
      else if (it) selItem(it.dataset.name);
    });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.hdsc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); flat = bFlat(q); fi = q ? flat.findIndex(function (it) { return it.k === 'i'; }) : -1; lst.scrollTop = 0; render(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      var iis = flat.map(function (it, i) { return it.k === 'i' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (e.key === 'Escape') { closeDrop(); return; }
      if (e.key === 'Tab') { closeDrop(); return; }
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); var ci = iis.indexOf(fi); fi = ci < 0 ? iis[0] : (iis[ci + 1] !== undefined ? iis[ci + 1] : iis[ci]); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); var ci2 = iis.indexOf(fi); fi = ci2 <= 0 ? iis[0] : iis[ci2 - 1]; render(); }
      else if (e.key === 'Enter') { e.preventDefault(); var it2 = flat[fi]; if (it2 && it2.k === 'i') selItem(it2.name); }
    });
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById(pfx + '-cmb-wrap'); if (!wrap || !document.body.contains(inp)) { document.removeEventListener('mousedown', onOut); closeDrop(); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
    hid.value = selName; inp.value = selName; flat = bFlat(''); render();
  };
})();

// ── Markup ของ combobox "ระบบที่ใช้งาน" — pfx/cls/placeholder ไม่บังคับ (ค่าเริ่มต้น = ฟอร์ม "+ แจ้งแทน") ──
function hdSysComboMarkup(hiddenValue, pfx, cls, placeholder) {
  pfx = pfx || 'hdf-sys';
  return '<div id="' + pfx + '-cmb-wrap" style="position:relative;">'
    + '<input id="' + pfx + '-cmb-input" type="text" class="' + (cls || 'f-input') + '" placeholder="' + esc(placeholder || 'พิมพ์ค้นหาระบบที่ใช้งาน...') + '" autocomplete="off" spellcheck="false" style="width:100%;padding-right:28px;cursor:pointer;">'
    + '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
    + '<input type="hidden" id="' + pfx + '" value="' + esc(hiddenValue || '') + '">'
    + '<div id="' + pfx + '-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
    + '<div id="' + pfx + '-cmb-list" style="max-height:300px;overflow-y:auto;"></div>'
    + '</div>'
    + '</div>';
}

// ── Searchable Combobox: เลือก "ผู้รับผิดชอบ" จาก window.STAFF — จัดกลุ่มตามแผนก (พับ/กางกลุ่มได้)
// แบบเดียวกับ "ระบบที่ใช้งาน" · พิมพ์ค้นหาได้ทั้งชื่อ / ชื่อเล่น / แผนก · ใช้ได้หลายที่ด้วย prefix ของ id
// (ฟอร์ม "+ แจ้งแทน" = hdf-assignee · แผงข้อมูล Ticket = hd-as) — hidden field (id = prefix) เก็บ staff id
// onPick (ไม่บังคับ) เรียกเมื่อผู้ใช้เลือกคนใหม่
// opts.filter = โหมดตัวกรองคิวงาน (hd-fas): '' = ทั้งหมด · '-' = ยังไม่มอบหมาย ──
window._initHdStaffCombobox = (function () {
  var IH = 34, HH = 28;
  // เรียง ก-ฮ ตามชื่อจริง — ตัดคำนำหน้า (นาย/นางสาว/นาง/น.ส./ดร.) ออกก่อน ไม่งั้นจะเรียงตามคำนำหน้าแทน
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
  return function (pfx, curId, onPick, opts) {
    var isFilter = !!(opts && opts.filter), ALL = 'ผู้รับผิดชอบ: ทั้งหมด';
    var inp = document.getElementById(pfx + '-cmb-input'), drop = document.getElementById(pfx + '-cmb-drop'),
      lst = document.getElementById(pfx + '-cmb-list'), hid = document.getElementById(pfx);
    if (!inp || !drop || !lst || !hid) return;
    var NONE = '— ยังไม่มอบหมาย —', NODEPT = 'ไม่ระบุแผนก';
    var staff = (window.STAFF || []).filter(function (s) { return s.active || s.id === curId; })
      .sort(window.sortStaffByRank); // ในกลุ่มแผนก → ระดับตำแหน่งสูงสุดก่อน
    // ลำดับกลุ่มตามรายการแผนก (DEPT_LIST เรียงชื่อแล้ว) → แผนกที่ไม่อยู่ในรายการ → ไม่ระบุแผนก ไว้ท้ายสุด
    var gmap = {}, gord = [];
    (window.DEPT_LIST || []).forEach(function (d) { if (!gmap[d.label]) { gmap[d.label] = []; gord.push(d.label); } });
    staff.forEach(function (s) {
      var d = s.dept || NODEPT;
      if (!gmap[d]) { gmap[d] = []; if (d !== NODEPT) gord.push(d); }
      gmap[d].push(s);
    });
    if (gmap[NODEPT]) gord.push(NODEPT);
    gord = gord.filter(function (d) { return gmap[d].length > 0; });
    var mine = staff.find(function (s) { return s.id === curId; });
    var selId = mine || (isFilter && curId === '-') ? curId : '', col = new Set(), q = '', fi = -1, flat = [], dt = null, isOpen = false;
    function lbl(id) { if (isFilter && id === '-') return NONE; var s = staff.find(function (x) { return x.id === id; }); return s ? s.name : ''; }
    function bFlat(sq) {
      var f = [], lq = sq.toLowerCase();
      if (sq) {
        staff.forEach(function (s) {
          if ([s.name, s.nickname, s.dept].join(' ').toLowerCase().indexOf(lq) !== -1) f.push({ k: 'i', id: s.id, name: s.name || '', sub: s.dept || '' });
        });
      } else {
        if (isFilter) f.push({ k: 'i', id: '', name: ALL, sub: '' }, { k: 'i', id: '-', name: NONE, sub: '' });
        else f.push({ k: 'i', id: '', name: NONE, sub: '' });
        gord.forEach(function (d) {
          f.push({ k: 'h', gid: d, label: d, count: gmap[d].length });
          if (!col.has(d)) gmap[d].forEach(function (s) { f.push({ k: 'i', id: s.id, name: s.name || '', sub: s.nickname && s.nickname !== s.name ? s.nickname : '' }); });
        });
      }
      return f;
    }
    function render() {
      if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบรายชื่อ' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
      lst.innerHTML = flat.map(function (it, idx) {
        if (it.k === 'h') {
          var cc = col.has(it.gid);
          return '<div class="hdac-h" data-gid="' + esc(it.gid) + '" style="height:' + HH + 'px;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;font-size:10.5px;font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);color:var(--txt2);user-select:none;">'
            + '<span>🏢 ' + esc(it.label) + '</span><span style="font-size:9px;color:var(--txt3);margin-left:2px;">(' + it.count + ')</span>'
            + '<span style="margin-left:auto;font-size:9px;opacity:.5;">' + (cc ? '▶' : '▼') + '</span></div>';
        }
        var foc = idx === fi, isSel = it.id === selId;
        return '<div class="hdac-i" data-id="' + esc(it.id) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;gap:6px;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:' + (it.id && it.id !== '-' ? 'var(--txt1)' : 'var(--txt3)') + ';">'
          + (isSel ? '<span style="color:var(--teal);font-size:10px;flex-shrink:0;">✓</span>' : '')
          + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + hi(it.name, q) + '</span>'
          + (it.sub ? '<span style="margin-left:auto;padding-left:8px;font-size:11px;color:var(--txt3);white-space:nowrap;">' + hi(it.sub, q) + '</span>' : '')
          + '</div>';
      }).join('');
    }
    function positionDrop() { window.placeDropdown(inp, drop, lst, 320, 240); }
    // scroll listener ต้อง capture:true — ดูคอมเมนต์เดียวกันใน _initHdHospCombobox ด้านบน
    function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); render(); positionDrop(); drop.style.display = 'block'; inp.select(); scrollToSel(); window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = lbl(selId); window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
    function scrollToSel() { var el = selId && lst.querySelector('.hdac-i[data-id="' + selId + '"]'); lst.scrollTop = el ? Math.max(0, el.offsetTop - 80) : 0; }
    function selItem(id) {
      var changed = id !== selId;
      selId = id; hid.value = id; inp.classList.remove('hd-invalid'); closeDrop();
      if (changed) { hid.dispatchEvent(new Event('change')); if (onPick) onPick(id); }
    }
    lst.addEventListener('mousedown', function (e) { e.preventDefault(); }); // คลิกในรายการไม่ให้ input เสีย focus
    lst.addEventListener('click', function (e) {
      var h = e.target.closest('.hdac-h'), it = e.target.closest('.hdac-i');
      if (h) { var gid = h.dataset.gid; if (col.has(gid)) col.delete(gid); else col.add(gid); flat = bFlat(q); fi = -1; render(); }
      else if (it) selItem(it.dataset.id);
    });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.hdac-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = q ? 0 : -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      var iis = flat.map(function (it, i) { return it.k === 'i' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (e.key === 'Escape') { closeDrop(); return; }
      if (e.key === 'Tab') { closeDrop(); return; }
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); var ci = iis.indexOf(fi); fi = ci < 0 ? iis[0] : (iis[ci + 1] !== undefined ? iis[ci + 1] : iis[ci]); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); var ci2 = iis.indexOf(fi); fi = ci2 <= 0 ? iis[0] : iis[ci2 - 1]; render(); }
      else if (e.key === 'Enter') { e.preventDefault(); var it2 = flat[fi]; if (it2 && it2.k === 'i') selItem(it2.id); }
    });
    document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById(pfx + '-cmb-wrap'); if (!wrap || !document.body.contains(inp)) { document.removeEventListener('mousedown', onOut); closeDrop(); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
    hid.value = selId; inp.value = lbl(selId);
  };
})();

// ── Markup ของ combobox "ผู้รับผิดชอบ" — cls = คลาสของช่อง (f-input ในฟอร์ม / t-sel ในแผงข้อมูล Ticket) ──
function hdStaffComboMarkup(pfx, cls, disabled, ph, wrapStyle) {
  return '<div id="' + pfx + '-cmb-wrap" style="position:relative;' + (wrapStyle || '') + '">'
    + '<input id="' + pfx + '-cmb-input" type="text" class="' + cls + '" placeholder="' + (ph || '— ยังไม่มอบหมาย — (พิมพ์ค้นหาชื่อ)') + '" autocomplete="off" spellcheck="false" style="width:100%;padding-right:28px;cursor:pointer;"' + (disabled ? ' disabled' : '') + '>'
    + (cls === 't-sel' ? '' : '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>')
    + '<input type="hidden" id="' + pfx + '">'
    + '<div id="' + pfx + '-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
    + '<div id="' + pfx + '-cmb-list" style="max-height:320px;overflow-y:auto;"></div>'
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
  var defaultAssignee = t ? (t.assigneeId || '') : ''; // Ticket ใหม่ปล่อยว่างให้ AI จัดคนจากประสบการณ์/ภาระงาน

  var full = ' style="grid-column:span 2"';
  var catUrg = t
    ? '<div class="f-group"' + full + '><label class="f-label">หมวดปัญหา <span class="hd-req">*</span></label><select id="hdf-cat" class="f-input" onchange="window.hdModalCatChange()">' + catOpts + '</select></div>'
    : '<div class="f-group"><label class="f-label">หมวดปัญหา <span style="color:var(--txt3);font-weight:400">(AI จัดให้)</span></label><select id="hdf-cat" class="f-input" onchange="window.hdModalCatChange()">' + catOpts + '</select></div>'
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
      + (t ? '' : '<div class="ai-flag" style="margin-top:7px;color:var(--violet);">🤖 เมื่อบันทึก AI จะจัดหมวด Priority และผู้รับผิดชอบให้อัตโนมัติ · ทีมแก้ไขภายหลังได้</div>')
      + '</div>'
    // หมวด/ความเร่งด่วนอยู่ใต้รายละเอียด — Ticket ใหม่ปล่อยหมวดว่างได้เพื่อให้ AI จัดให้ตอนบันทึก
    + catUrg
    + '<div class="f-group"><label class="f-label">Priority</label><select id="hdf-pri" class="f-input">' + prOpts + '</select></div>'
    + '<div class="f-group"><label class="f-label">ผู้รับผิดชอบ' + (t ? ' <span class="hd-req">*</span>' : ' <span style="color:var(--txt3);font-weight:400">(AI จัดให้)</span>') + '</label>' + hdStaffComboMarkup('hdf-assignee', 'f-input') + '</div>'
    + (t ? '' : '<div class="f-group"' + full + '><label class="f-label">แนบไฟล์ / รูป <span style="color:var(--txt3);font-weight:400">(เลือกได้หลายไฟล์)</span></label>'
      + window.attPickerHtml('hdf-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT }) + '</div>')
    + '</div>';

  window.openM('m-hd');
  window._initHdHospCombobox(t ? t.hospitalId : '');
  window._initHdSysCombobox(t ? t.sourceSystem : '');
  window._initHdStaffCombobox('hdf-assignee', defaultAssignee);
  if (!t) window.attPickerInit('hdf-files', { accept: window.HD_ATTACH_ACCEPT, max: window.HD_ATTACH_MAX, hint: window.HD_ATTACH_HINT });
};
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
async function hdAutoTriageCommon(common) {
  var next = Object.assign({}, common), analysis = null, usedAiCategory = false;
  var cats = (window.HELPDESK_CATEGORIES || []).filter(function (c) { return c.active !== false; });
  if (!next.category_id) {
    try {
      analysis = await window.hdAiAnalyze({
        description: next.description,
        sourceSystem: next.source_system,
        hospitalName: ((hdHosp(next.hospital_id) || {}).name || ''),
        hospitalId: next.hospital_id,
      });
      if (analysis.categoryId) { next.category_id = analysis.categoryId; usedAiCategory = true; }
      if (analysis.priority) next.priority = analysis.priority;
    } catch (e) {
      console.warn('[helpdesk] auto triage category:', e);
    }
  }
  // AI ตอบหมวดไม่ตรงรายการ/ไม่พร้อมใช้งาน → ใช้หมวด "อื่น ๆ" เป็น safety net
  // เพื่อให้ Ticket เข้าคิวได้เสมอและทีมเปลี่ยนหมวดได้ทันที
  if (!next.category_id) {
    var fallbackCat = cats.find(function (c) { return c.id === 'CAT_OTHER'; }) || cats[cats.length - 1] || null;
    if (fallbackCat) next.category_id = fallbackCat.id;
  }
  if (!next.assignee_id) {
    try {
      var sug = (await window.hdAiSuggestAssignees([{
        id: 'AUTO' + Date.now(), ticketNo: 'Ticket ใหม่', categoryId: next.category_id,
        sourceSystem: next.source_system, hospitalId: next.hospital_id,
        priority: next.priority || 'p3', description: next.description,
      }]))[0];
      if (sug && sug.staffId) next.assignee_id = sug.staffId;
    } catch (e2) {
      console.warn('[helpdesk] auto triage assignee:', e2);
    }
  }
  var cat = hdCat(next.category_id), who = hdStaffName(next.assignee_id);
  var note = 'AI รับเรื่องอัตโนมัติ: หมวด ' + ((cat && cat.name) || 'ยังไม่ระบุ')
    + ' · Priority ' + hdPri(next.priority || 'p3').short
    + ' · ผู้รับผิดชอบ ' + (who || 'ยังไม่พบทีมงานที่พร้อมรับงาน')
    + (analysis && analysis.reason ? ' · ' + analysis.reason : usedAiCategory ? '' : ' · ใช้หมวดสำรอง');
  return { common: next, note: note };
}

async function hdCreateTicket(common, opts) {
  opts = opts || {};
  var auto = { common: common, note: '' };
  // ค่าที่ทีมเลือกเองจากหน้าตรวจทานยังคงเดิม ส่วนช่องที่ว่าง AI จะเติมให้ก่อนสร้าง Ticket
  if (!opts.resolvedAt && (!common.category_id || !common.assignee_id)) auto = await hdAutoTriageCommon(common);
  common = auto.common;
  var id = window.hdUid();
  var createdIso = opts.createdAt || new Date().toISOString();
  var due = window.hdCalcDue(common.priority, createdIso);
  var me = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
  var row = Object.assign({
    id: id,
    ticket_no: await window.hdNextTicketNo(),
    channel: 'line',
    status: common.assignee_id && common.category_id ? 'assigned' : 'triage',
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
  if (auto.note) await window.hdAddEvent(id, { type: 'field_change', actorType: 'ai', body: auto.note, isInternal: true });
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
  var sysEl = document.getElementById('hdf-sys'), sysVisEl = document.getElementById('hdf-sys-cmb-input'), assigneeEl = document.getElementById('hdf-assignee'), assigneeVisEl = document.getElementById('hdf-assignee-cmb-input');
  var hosp = (hospEl || {}).value || '';
  var desc = ((descEl || {}).value || '').trim();
  var reporterName = ((nameEl || {}).value || '').trim();
  var categoryId = (catEl || {}).value || '';
  var sourceSystem = (sysEl || {}).value || '';
  var assignee = (assigneeEl || {}).value || '';
  var miss = [];
  hdMarkInvalid(hospVisEl, !hosp); if (!hosp) miss.push(hospVisEl);
  hdMarkInvalid(nameEl, !reporterName); if (!reporterName) miss.push(nameEl);
  if (window.hdEditId) { hdMarkInvalid(catEl, !categoryId); if (!categoryId) miss.push(catEl); }
  if (urgEl) { hdMarkInvalid(urgEl, !urgEl.value); if (!urgEl.value) miss.push(urgEl); }
  hdMarkInvalid(sysVisEl, !sourceSystem); if (!sourceSystem) miss.push(sysVisEl);
  if (window.hdEditId) { hdMarkInvalid(assigneeVisEl, !assignee); if (!assignee) miss.push(assigneeVisEl); }
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
      var by = window.meId(); // รหัสผู้ใช้ (users.id)
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
    ta.value = await window.hdAiDraftReply(t, evs);
    var cb = document.getElementById('hd-reply-internal'); if (cb) cb.checked = false;
    ta.focus();
    window.showAlert && window.showAlert('ร่างข้อความแล้ว — ตรวจทาน/แก้ไขก่อนกดส่ง', 'success');
  } catch (e) {
    window.showAlert && window.showAlert(String(e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldTxt; }
  }
};

// ── แนะนำผู้รับผิดชอบอัตโนมัติ: เรียงตามประสบการณ์ระบบ > หมวด > รพ. เดียวกัน แล้วใช้งานค้างตัดสินเมื่อเท่ากัน
// · มีผู้สมัครหลายคน → ให้ AI อ่านรายละเอียดปัญหาแล้วเลือกจากผู้สมัครของเรื่องนั้นเท่านั้น (ตอบนอกรายชื่อ/ล่ม → อันดับ 1)
// · ไม่มีประวัติตรงระบบ → ใช้ผู้รับผิดชอบเริ่มต้นของหมวด หรือคนที่งานค้างน้อยสุด · ทีมเปลี่ยนคนได้เสมอ ──
function hdTodayYmd() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hdAssignPool() {
  var all = window.HELPDESK_TICKETS || [], today = hdTodayYmd();
  return (window.STAFF || []).filter(function (s) { return s.active; }).map(function (s) {
    var mine = all.filter(function (t) { return t.assigneeId === s.id; });
    var onLeave = (window.LEAVES || []).some(function (l) { return l.staffId === s.id && l.status === 'approved' && l.startDate <= today && l.endDate >= today; });
    return {
      staff: s, onLeave: onLeave,
      open: mine.filter(function (t) { return hdStatus(t.status).open; }).length,
      done: mine.filter(function (t) { return !hdStatus(t.status).open && t.status !== 'cancelled'; }),
    };
  }).filter(function (p) { return !p.onLeave; });
}
function hdAssignExp(p, t) {
  var cat = 0, sys = 0, hosp = 0;
  p.done.forEach(function (d) {
    if (t.sourceSystem && d.sourceSystem === t.sourceSystem) {
      sys++;
      if (t.categoryId && d.categoryId === t.categoryId) cat++;
      if (t.hospitalId && d.hospitalId === t.hospitalId) hosp++;
    }
  });
  return { cat: cat, sys: sys, hosp: hosp, score: Math.min(sys, 20) * 3 + Math.min(cat, 10) * 2 + Math.min(hosp, 10) };
}
function hdAssignFacts(r) {
  return 'เคยแก้ระบบนี้ ' + r.e.sys + ' เรื่อง' + (r.e.cat ? ' · หมวดเดียวกัน ' + r.e.cat : '') + (r.e.hosp ? ' · รพ.เดียวกัน ' + r.e.hosp : '') + ' · ค้าง ' + r.p.open;
}
// คืน [{ ticketId, staffId ('' = ไม่มีผู้สมัคร), reason, alts:[staffId] }] ตามลำดับ tickets
window.hdAiSuggestAssignees = async function (tickets) {
  var pool = hdAssignPool();
  var nick = function (s) { return s.nickname || s.name; };
  var per = tickets.map(function (t) {
    var ranked = pool.map(function (p) { return { p: p, e: hdAssignExp(p, t) }; })
      .filter(function (r) { return r.e.sys > 0; })
      .sort(function (a, b) { return (b.e.score - a.e.score) || (a.p.open - b.p.open); });
    return { t: t, ranked: ranked };
  });
  var ask = per.filter(function (x) { return x.ranked.length > 1; });
  var ai = {};
  if (ask.length) {
    var sys = 'คุณเป็นหัวหน้าทีม Helpdesk ซอฟต์แวร์โรงพยาบาล เลือกผู้รับผิดชอบให้แต่ละ Ticket "จากผู้สมัครของ Ticket นั้นเท่านั้น" '
      + '(ทุกคนเคยแก้ระบบเดียวกันมาแล้ว) · ดูรายละเอียดปัญหาประกอบ คนที่เคยแก้ระบบ/หมวด/รพ. เดียวกันมากกว่าได้เปรียบ งานค้างใช้ตัดสินเมื่อประสบการณ์ใกล้กัน · '
      + 'เรื่องด่วน (P1/P2) ให้คนที่มีประสบการณ์ตรงที่สุด · ห้ามเลือกคนนอกรายชื่อผู้สมัคร · '
      + 'ตอบ "เฉพาะ JSON": {"assign":[{"ticket":"<เลขที่>","staff_id":"<id>","reason":"<เหตุผลสั้น ๆ ภาษาไทย>"}]}';
    var user = 'Ticket ที่ต้องมอบหมาย:\n' + ask.map(function (x) {
      var t = x.t, cat = hdCat(t.categoryId), h = hdHosp(t.hospitalId);
      return '- ' + t.ticketNo + ' [' + hdPri(t.priority).short + '] ' + (cat ? 'หมวด ' + cat.name + ' · ' : '') + 'ระบบ ' + t.sourceSystem + ' · '
        + (h ? h.name + ' · ' : '') + String(t.description || t.subject || '').slice(0, 300).replace(/\s+/g, ' ')
        + '\n  ผู้สมัคร (id · ชื่อ · ประวัติ):\n' + x.ranked.slice(0, 6).map(function (r) { return '  ' + r.p.staff.id + ' · ' + nick(r.p.staff) + ' · ' + hdAssignFacts(r); }).join('\n');
    }).join('\n');
    try {
      var res = await window.aiChatJson(sys, user, { maxTokens: 300 + ask.length * 120 });
      (Array.isArray(res.assign) ? res.assign : []).forEach(function (a) { if (a && a.ticket) ai[a.ticket] = a; });
    } catch (e) { console.warn('[helpdesk] AI assign → ใช้อันดับประสบการณ์แทน:', e); }
  }
  return per.map(function (x) {
    var t = x.t;
    if (!x.ranked.length) {
      var cat = hdCat(t.categoryId), def = cat && cat.defaultAssigneeId;
      var fallback = (def && pool.find(function (p) { return p.staff.id === def; }))
        || pool.slice().sort(function (a, b) { return a.open - b.open || String(a.staff.name || '').localeCompare(String(b.staff.name || ''), 'th'); })[0];
      if (!fallback) return { ticketId: t.id, staffId: '', alts: [], reason: 'ยังไม่มีทีมงานที่พร้อมรับงาน' };
      return { ticketId: t.id, staffId: fallback.staff.id,
        alts: pool.filter(function (p) { return p.staff.id !== fallback.staff.id; }).sort(function (a, b) { return a.open - b.open; }).slice(0, 3).map(function (p) { return p.staff.id; }),
        reason: def && fallback.staff.id === def ? 'ผู้รับผิดชอบเริ่มต้นของหมวด · ค้าง ' + fallback.open : 'ยังไม่มีประวัติตรงระบบ · เลือกคนที่งานค้างน้อยสุด (' + fallback.open + ' เรื่อง)' };
    }
    var a = ai[t.ticketNo];
    var pick = (a && x.ranked.find(function (r) { return r.p.staff.id === a.staff_id; })) || x.ranked[0];
    var why = a && pick.p.staff.id === a.staff_id ? String(a.reason || '').trim() : '';
    return { ticketId: t.id, staffId: pick.p.staff.id, reason: (why ? why + ' · ' : '') + hdAssignFacts(pick),
      alts: x.ranked.map(function (r) { return r.p.staff.id; }).filter(function (id) { return id !== pick.p.staff.id; }).slice(0, 3) };
  });
};

window.hdAiAssignOne = async function (id) {
  var t = hdTicket(id), out = document.getElementById('hd-ai-assign');
  if (!t || !out) return;
  out.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0;">⏳ AI กำลังเลือกผู้รับผิดชอบ...</div>';
  try {
    var r = (await window.hdAiSuggestAssignees([t]))[0];
    if (!r.staffId) { out.innerHTML = '<div class="ai-out" style="font-size:12px;">❗ ' + esc(r.reason) + '</div>'; return; }
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
  body.innerHTML = '<div class="ai-flag" style="margin:0 0 6px;">🤖 แนะนำเฉพาะคนที่เคยแก้ระบบเดียวกันมาก่อน — เรื่องที่ยังไม่มีใครเคยแก้ ให้เลือกเอง · เปลี่ยนได้ก่อนกดมอบหมาย</div>'
    + sug.map(function (r) {
      var t = hdTicket(r.ticketId), pr = hdPri(t.priority), h = hdHosp(t.hospitalId);
      var opts = '<option value=""' + (r.staffId ? '' : ' selected') + '>— เลือกเอง —</option>' + staff.map(function (s) { return '<option value="' + s.id + '"' + (s.id === r.staffId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
      return '<div class="hd-as-row" data-id="' + t.id + '">'
        + '<input type="checkbox" class="hd-as-chk"' + (r.staffId ? ' checked' : '') + ' onchange="window.hdAiAssignFoot()">'
        + '<div class="hd-as-main"><div><b style="font-family:var(--mono);font-size:12px;">' + esc(t.ticketNo) + '</b> '
        +   '<span class="hd-pill" style="color:' + pr.color + ';background:' + pr.color + '1e;">' + esc(pr.short) + '</span> '
        +   '<span style="font-size:11.5px;color:var(--txt3);">' + esc((h && h.name) || '') + '</span></div>'
        +   '<div class="hd-as-desc">' + esc(t.description || t.subject || '') + '</div>'
        +   (r.reason ? '<div class="hd-as-why">' + (r.staffId ? '💡 ' : '❗ ') + esc(r.reason) + '</div>' : '')
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
      body: 'วิธีแก้ไข: ' + fix + (cause ? '\nสาเหตุ: ' + cause : ''), isInternal: false,
    });
    window.hdKbInvalidate();
    window.closeM('m-hd-kb');
    window.showAlert && window.showAlert('บันทึกวิธีแก้แล้ว — ผู้แจ้งและทีมงานเห็นข้อมูลนี้', 'success');
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
// ทีมงานที่ดูแลเรื่องในแชท: id ที่ AI ตอบ (ต้องอยู่ในรายชื่อจริง) → ไม่มีค่อยเทียบชื่อแบบเข้ม (ต้องตรงคนเดียว)
function hdLineStaff(id, name) {
  var list = (window.STAFF || []).filter(function (x) { return x.active; });
  return list.find(function (s) { return id && s.id === String(id).trim(); }) || window.lineChat.matchPerson(name, list);
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
    + '"first_msg":<เลขข้อความที่เริ่มแจ้ง>,"last_msg":<เลขข้อความสุดท้ายของเรื่องนี้>,"msgs":[<เลขข้อความที่เกี่ยวกับเรื่องนี้โดยตรงเท่านั้น — แจ้ง/ถาม-ตอบ/ส่งข้อมูล/ยืนยันว่าแก้แล้ว ไม่รวมทักทาย/ขอบคุณ/สติกเกอร์/เรื่องอื่นที่คุยแทรก>],"resolved":true|false,'
    + '"resolution":"<สิ่งที่ทีมทำจนแก้ได้ ถ้าแชทบอกว่าแก้แล้ว หรือ empty>","handled_by":"<ชื่อทีมงานที่ดูแลเรื่องนี้ ตามที่เห็นในแชท หรือ empty>",'
    + '"handled_by_id":"<id ของคนนั้นจากรายชื่อทีมงาน — ใส่เฉพาะเมื่อมั่นใจว่าเป็นคนเดียวกัน ไม่แน่ใจให้ empty ห้ามเดา>"}]} '
    + 'กฎ: ข้ามคำทักทาย/ขอบคุณ/สติกเกอร์/รูป/นัดหมาย/เรื่องที่ไม่ใช่ปัญหา · เรื่องเดียวกันที่คุยต่อเนื่องหลายข้อความ ให้รวมเป็นเรื่องเดียว · '
    + 'ผู้แจ้งคือฝั่งโรงพยาบาล ไม่ใช่คนในรายชื่อทีมงาน · ห้ามแต่งข้อมูลที่ไม่มีในแชท';
  var ctx = 'หมวดปัญหา (id — ชื่อ):\n' + cats.map(function (x) { return x.id + ' — ' + x.name; }).join('\n')
    + '\n\nPriority: ' + (window.HD_PRIORITY || []).map(function (x) { return x.id + ' = ' + x.label; }).join(' · ')
    + ' (p1 = ใช้งานไม่ได้ทั้งระบบ · p4 = สอบถาม/ขอปรับเล็กน้อย)'
    + (prods.length ? '\n\nระบบที่ใช้งาน (ตอบชื่อให้ตรง):\n' + prods.slice(0, 150).join(', ') : '')
    + '\n\nรายชื่อทีมงานของเรา (ไม่ใช่ผู้แจ้ง) — id · ชื่อ (ชื่อเล่น):\n' + staff.map(function (s) { return s.id + ' · ' + s.name + (s.nickname ? ' (' + s.nickname + ')' : ''); }).join('\n');

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
      var ex = window.lineChat.excerpt(c.msgs, x.first_msg, x.last_msg, x.msgs);
      var createdAt = ex.createdAt || new Date().toISOString(), handler = hdLineStaff(x.handled_by_id, x.handled_by);
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
        assignWhy: handler ? '💬 ดูแลเรื่องนี้ในแชท' : '',
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
    // ผู้รับผิดชอบ: ทีมงานที่ดูแลในแชท → ถ้าไม่มี แนะนำจากคนที่เคยแก้ระบบเดียวกัน → ไม่มีใครเคยแก้ ปล่อยว่างให้เลือกเอง
    var need = items.filter(function (it) { return !it.assigneeId; });
    if (need.length) {
      btn.textContent = '⏳ AI กำลังจัดผู้รับผิดชอบ...';
      var hosp = (document.getElementById('hdf-hosp') || {}).value || '';
      try {
        var sug = await window.hdAiSuggestAssignees(need.map(function (it, n) {
          return { id: 'L' + n, ticketNo: 'เรื่อง' + (n + 1), categoryId: it.categoryId, sourceSystem: it.system || hdLineDefSys(), hospitalId: hosp, priority: it.priority, description: it.description };
        }));
        sug.forEach(function (r, n) { need[n].assigneeId = r.staffId; need[n].assignWhy = (r.staffId ? '🤖 ' : '❗ ') + r.reason; });
      } catch (e) {
        need.forEach(function (it) { it.assignWhy = '❗ แนะนำผู้รับผิดชอบไม่สำเร็จ — เลือกเอง'; });
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
          ['👷', 'ผู้รับผิดชอบ', stName, x.assignWhy || ''],
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
      var defSys = hdLineDefSys();
      return h.fld('รายละเอียดปัญหา', '<textarea class="f-input' + h.bad('รายละเอียด') + '" rows="3"' + h.txt('description', 1) + '>' + esc(x.description) + '</textarea>', 1)
        + '<div class="air-grid c2">'
        +   h.fld('ผู้แจ้ง', '<input class="f-input' + h.bad('ผู้แจ้ง') + '" value="' + esc(x.reporterName) + '"' + h.txt('reporterName', 1) + '>', 1)
        +   h.fld('Priority', '<select class="f-input"' + h.pick('priority') + '>' + (window.HD_PRIORITY || []).map(function (p) { return h.opt(p.id, p.label, p.id === x.priority); }).join('') + '</select>')
        +   h.fld('หมวดปัญหา', '<select class="f-input' + h.bad('หมวดปัญหา') + '"' + h.pick('categoryId') + '>' + h.opt('', '-- เลือก --', !x.categoryId) + cats.map(function (c) { return h.opt(c.id, c.name, c.id === x.categoryId); }).join('') + '</select>', 1)
        // ระบบที่ใช้งาน = combobox ค้นหา/จัดกลุ่มตามกลุ่ม Product (ผูกใน afterFields) — ใช้ div เหตุผลเดียวกับผู้รับผิดชอบด้านล่าง
        +   '<div class="air-f"><span>ระบบที่ใช้งาน <b class="air-req">*</b></span>'
        +     hdSysComboMarkup(x.system || '', 'hdl-sys', 'f-input' + h.bad('ระบบ'), defSys ? '(ค่าเริ่มต้น: ' + defSys + ') พิมพ์ค้นหา...' : 'พิมพ์ค้นหาระบบที่ใช้งาน...') + '</div>'
        // ผู้รับผิดชอบ = combobox ค้นหา/จัดกลุ่มตามแผนก (ผูกใน afterFields) — ใช้ div ไม่ใช่ <label> ของ h.fld
        // เพราะคลิกรายการใน dropdown ที่อยู่ใน label จะถูกส่งต่อเป็นคลิกที่ช่อง ทำให้ dropdown เปิดซ้ำ
        +   '<div class="air-f full"><span>ผู้รับผิดชอบ <b class="air-req">*</b></span>' + hdStaffComboMarkup('hdl-as', 'f-input' + h.bad('ผู้รับผิดชอบ'))
              + (x.assignWhy ? '<span class="air-why">' + esc(x.assignWhy) + '</span>' : '') + '</div>'
        + '</div>'
        + (x.resolved ? h.fld('วิธีแก้ไข (เก็บเข้าคลังความรู้)', '<textarea class="f-input" rows="2"' + h.txt('resolution') + '>' + esc(x.resolution) + '</textarea>') : '');
    },
    afterFields: function (x, i) {
      var defSys = hdLineDefSys();
      window._initHdSysCombobox(x.system || '', 'hdl-sys', {
        emptyLabel: defSys ? '— ใช้ค่าเริ่มต้น: ' + defSys + ' —' : '— ไม่ระบุ —',
        onPick: function (nm) { window.aiReview.set(i, 'system', nm); },
      });
      window._initHdStaffCombobox('hdl-as', x.assigneeId || '', function (sid) { window.aiReview.set(i, 'assigneeId', sid); });
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

// สรุป Ticket ตาม "ระบบที่ใช้งาน" (sourceSystem เก็บเป็นชื่อ) — Top 10 เรียงมาก→น้อย ที่เหลือรวมเป็น "อื่นๆ"
var HD_SYS_TOP = 10;
function hdSystemEntries(all) {
  var map = {};
  all.forEach(function (t) {
    var name = String(t.sourceSystem || '').trim() || '(ไม่ระบุ)';
    var e = map[name] || (map[name] = { name: name, open: 0, closed: 0, cats: {} });
    if (hdStatus(t.status).open) e.open++; else e.closed++;
    var cn = (hdCat(t.categoryId) || {}).name || '(ไม่ระบุหมวด)';
    e.cats[cn] = (e.cats[cn] || 0) + 1;
  });
  var list = Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return (b.open + b.closed) - (a.open + a.closed); });
  if (list.length <= HD_SYS_TOP) return list;
  var rest = list.slice(HD_SYS_TOP - 1);
  var other = { name: 'อื่นๆ (' + rest.length + ' ระบบ)', open: 0, closed: 0, cats: {} };
  rest.forEach(function (e) {
    other.open += e.open; other.closed += e.closed;
    Object.keys(e.cats).forEach(function (c) { other.cats[c] = (other.cats[c] || 0) + e.cats[c]; });
  });
  return list.slice(0, HD_SYS_TOP - 1).concat([other]);
}

// ── ช่วงเวลาของแดชบอร์ด: เดือน / ไตรมาส (นับตามปีงบ ต.ค.–ก.ย.) / ปีงบ / ปีปฏิทิน ──
// off = เลื่อนย้อนหลังกี่ช่วง (0 = ช่วงปัจจุบัน, -1 = ช่วงก่อน ...) · ค่าเริ่มต้น = เดือนนี้
// ช่วงปัจจุบันยังไม่จบ → เทียบกับ "ช่วงเดียวกัน" ของช่วงก่อน (ยาวเท่ากัน) ไม่ใช่ทั้งช่วง กันตัวเลขลดลงหลอก ๆ
var HD_TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
var HD_PER_KINDS = [
  { id: 'month', label: 'เดือน', prev: 'เดือนก่อน' },
  { id: 'quarter', label: 'ไตรมาส', prev: 'ไตรมาสก่อน' },
  { id: 'fy', label: 'ปีงบฯ', prev: 'ปีงบก่อน' },
  { id: 'year', label: 'ปีปฏิทิน', prev: 'ปีก่อน' },
];
window.hdPer = window.hdPer || { kind: 'month', off: 0 };
window.hdPerKind = function (k) { window.hdPer = { kind: k, off: 0 }; window.renderHelpdesk(); };
window.hdPerShift = function (d) { window.hdPer.off = Math.min(0, (window.hdPer.off || 0) + d); window.renderHelpdesk(); };

function hdBE2(y) { return String(y + 543).slice(-2); }
function hdPerBounds(kind, off) {
  var n = new Date(), Y = n.getFullYear(), M = n.getMonth(), s, e, label;
  if (kind === 'quarter') {
    s = new Date(Y, Math.floor(M / 3) * 3 + 3 * off, 1); e = new Date(s.getFullYear(), s.getMonth() + 3, 1);
    var fy = s.getMonth() >= 9 ? s.getFullYear() + 1 : s.getFullYear();
    var last = new Date(e.getFullYear(), e.getMonth() - 1, 1);
    label = 'Q' + (((s.getMonth() + 3) % 12) / 3 + 1) + ' ปีงบ ' + hdBE2(fy) + ' (' + HD_TH_MON[s.getMonth()] + '–' + HD_TH_MON[last.getMonth()] + ' ' + hdBE2(last.getFullYear()) + ')';
  } else if (kind === 'fy') {
    var fs = (M >= 9 ? Y : Y - 1) + off;
    s = new Date(fs, 9, 1); e = new Date(fs + 1, 9, 1);
    label = 'ปีงบ ' + (fs + 1 + 543) + ' (ต.ค. ' + hdBE2(fs) + '–ก.ย. ' + hdBE2(fs + 1) + ')';
  } else if (kind === 'year') {
    s = new Date(Y + off, 0, 1); e = new Date(Y + off + 1, 0, 1);
    label = 'ปี ' + (Y + off + 543);
  } else {
    s = new Date(Y, M + off, 1); e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    label = HD_TH_MON[s.getMonth()] + ' ' + hdBE2(s.getFullYear());
  }
  return { s: s.getTime(), e: e.getTime(), label: label };
}
// ช่วงที่เลือก + ช่วงเทียบ + ตัวแบ่งกราฟแนวโน้ม (เดือน=รายวัน, ไตรมาส=รายสัปดาห์, ปี=รายเดือน)
function hdPerRange() {
  var p = window.hdPer || { kind: 'month', off: 0 };
  var kind = HD_PER_KINDS.some(function (k) { return k.id === p.kind; }) ? p.kind : 'month';
  var cur = hdPerBounds(kind, p.off || 0), prev = hdPerBounds(kind, (p.off || 0) - 1);
  var now = Date.now(), ongoing = cur.e > now;
  var kd = HD_PER_KINDS.filter(function (k) { return k.id === kind; })[0];
  return {
    kind: kind, off: p.off || 0, s: cur.s, e: cur.e, label: cur.label, ongoing: ongoing,
    axisEnd: ongoing ? now : cur.e,
    ps: prev.s, pe: ongoing ? prev.s + (now - cur.s) : prev.e,
    cmp: ongoing ? 'ช่วงเดียวกัน' + kd.prev : kd.prev,
    gran: kind === 'month' ? 'day' : kind === 'quarter' ? 'week' : 'month',
  };
}
function hdInRange(v, s, e) { if (!v) return false; var x = new Date(v).getTime(); return x >= s && x < e; }

// ตัวชี้วัดของช่วงเวลา — เข้าใหม่/FRT นับจาก Ticket ที่ "เปิด" ในช่วง ส่วน MTTR/SLA/เปิดซ้ำ/CSAT นับจากที่ "ปิด" ในช่วง
function hdPerStats(all, s, e) {
  var inP = all.filter(function (t) { return hdInRange(t.createdAt, s, e); });
  var done = all.filter(function (t) { return hdInRange(t.resolvedAt, s, e); });
  function avgMins(list, a, b) {
    var v = list.map(function (t) { return (new Date(t[b]) - new Date(t[a])) / 60000; }).filter(function (n) { return n > 0 && isFinite(n); });
    return v.length ? v.reduce(function (x, n) { return x + n; }, 0) / v.length : null;
  }
  // คิดจากเวลาจริงเทียบ due (ไม่พึ่ง flag ที่ยังไม่มี cron ตั้ง)
  function metSla(t) {
    var frtOk = !t.firstResponseDue || (t.firstResponseAt && new Date(t.firstResponseAt) <= new Date(t.firstResponseDue));
    var resOk = !t.resolutionDue || (t.resolvedAt && new Date(t.resolvedAt) <= new Date(t.resolutionDue));
    return frtOk && resOk;
  }
  var rated = done.filter(function (t) { return t.csatScore != null; });
  return {
    inP: inP, done: done,
    frt: avgMins(inP.filter(function (t) { return t.firstResponseAt; }), 'createdAt', 'firstResponseAt'),
    mttr: avgMins(done, 'createdAt', 'resolvedAt'),
    comp: done.length ? Math.round(done.filter(metSla).length / done.length * 100) : null,
    reopen: done.length ? Math.round(done.filter(function (t) { return (t.reopenedCount || 0) > 0; }).length / done.length * 100) : null,
    csat: rated.length ? rated.reduce(function (x, t) { return x + t.csatScore; }, 0) / rated.length : null,
    rated: rated.length,
  };
}

function hdDashboardHtml() {
  var all = window.HELPDESK_TICKETS || [];
  var open = all.filter(function (t) { return hdStatus(t.status).open; });
  var R = hdPerRange();
  var cur = hdPerStats(all, R.s, R.e), prv = hdPerStats(all, R.ps, R.pe);
  var breach = open.filter(hdOverdue).length;

  function fmtDur(min) {
    if (min == null) return '—';
    if (min < 60) return Math.round(min) + ' นาที';
    if (min < 1440) return (min / 60).toFixed(1) + ' ชม.';
    return (min / 1440).toFixed(1) + ' วัน';
  }
  // เทียบช่วงก่อน — mode: 'pct' (% เปลี่ยน) / 'pts' (ต่างกี่จุด %) / 'num' (ต่างเท่าไร) · better: 'up'|'down'|null (null = ไม่ตัดสินดี/แย่)
  function delta(c, p, mode, better) {
    if (c == null || p == null) return null;
    var d, txt;
    if (mode === 'pct') { if (!p) return null; d = (c - p) / p * 100; txt = Math.abs(Math.round(d)) + '%'; }
    else if (mode === 'pts') { d = c - p; txt = Math.abs(d) + ' จุด'; }
    else { d = c - p; txt = Math.abs(d).toFixed(1); }
    var r = Math.round(d * 10) / 10;
    var cls = !r || !better ? 'neu' : ((r > 0) === (better === 'up') ? 'good' : 'bad');
    return { cls: cls, txt: (r > 0 ? '▲ ' : r < 0 ? '▼ ' : '● ') + txt + ' จาก' + R.cmp };
  }
  function kpi(icon, label, val, sub, accent, dl, tip) {
    return '<div class="hd-kpi hd-acc-' + (accent || 'neu') + '">'
      + '<div class="hd-kpi-top"><span class="hd-kpi-icon">' + icon + '</span><span class="hd-kpi-lbl">' + esc(label) + window.calcTip(tip) + '</span></div>'
      + '<div class="hd-kpi-val">' + val + '</div>'
      + (sub ? '<div class="hd-kpi-sub">' + esc(sub) + '</div>' : '')
      + (dl ? '<div class="hd-kpi-sub hd-dl-' + dl.cls + '">' + esc(dl.txt) + '</div>' : '')
      + '</div>';
  }
  var compAccent = cur.comp == null ? 'neu' : cur.comp >= 90 ? 'good' : cur.comp >= 70 ? 'warn' : 'bad';
  var reopenAccent = cur.reopen == null ? 'neu' : cur.reopen <= 5 ? 'good' : cur.reopen <= 15 ? 'warn' : 'bad';
  var csatAccent = cur.csat == null ? 'neu' : cur.csat >= 4.5 ? 'good' : cur.csat >= 3.5 ? 'warn' : 'bad';
  var csatPrev = prv.csat == null ? null : Math.round(prv.csat * 10) / 10;
  var kpis = '<div class="hd-kpi-grid">'
    + kpi('📥', 'เข้าใหม่', cur.inP.length, 'ปิดแล้วในช่วงนี้ ' + cur.done.length + ' เรื่อง', 'neu', delta(cur.inP.length, prv.inP.length, 'pct', null), 'จำนวน Ticket ที่เปิดในช่วงเวลาที่เลือก\nปิดแล้วในช่วงนี้ = Ticket ที่แก้เสร็จในช่วงนี้ (เปิดเมื่อไรก็ได้)\nบรรทัดล่าง = เทียบ % กับช่วงก่อนหน้า')
    + kpi('⚡', 'FRT เฉลี่ย', fmtDur(cur.frt), 'เวลาตอบกลับครั้งแรก', 'neu', delta(cur.frt, prv.frt, 'pct', 'down'), 'ค่าเฉลี่ยของ (เวลาตอบครั้งแรก − เวลาเปิด Ticket)\nนับเฉพาะ Ticket ที่เปิดในช่วงนี้และตอบแล้ว')
    + kpi('🛠️', 'MTTR เฉลี่ย', fmtDur(cur.mttr), 'เวลาแก้ไขเฉลี่ย', 'neu', delta(cur.mttr, prv.mttr, 'pct', 'down'), 'ค่าเฉลี่ยของ (เวลาแก้เสร็จ − เวลาเปิด Ticket)\nนับจาก Ticket ที่แก้เสร็จในช่วงนี้')
    + kpi('🎯', 'ตรงตาม SLA', cur.comp == null ? '—' : cur.comp + '%', 'ของที่ปิดในช่วงนี้', compAccent, delta(cur.comp, prv.comp, 'pts', 'up'), "Ticket ที่แก้เสร็จในช่วงนี้และตรง SLA ÷ Ticket ที่แก้เสร็จในช่วงนี้ × 100\nตรง SLA = ตอบครั้งแรกทันกำหนด และ แก้เสร็จทันกำหนด (ถ้า Ticket ไม่มีกำหนดข้อใด ถือว่าผ่านข้อนั้น)\nเขียว ≥ 90% · ส้ม ≥ 70%")
    + kpi('♻️', 'เปิดซ้ำ', cur.reopen == null ? '—' : cur.reopen + '%', 'ของที่ปิดในช่วงนี้', reopenAccent, delta(cur.reopen, prv.reopen, 'pts', 'down'), 'Ticket ที่แก้เสร็จในช่วงนี้และเคยถูกเปิดซ้ำ ÷ Ticket ที่แก้เสร็จในช่วงนี้ × 100')
    + kpi('⭐', 'CSAT', cur.csat == null ? '—' : cur.csat.toFixed(1) + ' / 5', cur.rated ? cur.rated + ' รีวิว' : 'ยังไม่มีคะแนน', csatAccent,
        delta(cur.csat == null ? null : Math.round(cur.csat * 10) / 10, csatPrev, 'num', 'up'), 'คะแนนความพึงพอใจเฉลี่ย (เต็ม 5) ของ Ticket ที่แก้เสร็จในช่วงนี้และผู้แจ้งให้คะแนนแล้ว')
    + '</div>';

  // หัว section "ภาพรวม" + ตัวเลือกช่วงเวลา อยู่แถวเดียวกัน (ปุ่มเลือกแบบ + เลื่อนช่วง จับกลุ่มไว้ด้วยกันทางขวา)
  var perCtrl = '<div class="hd-per-ctrl">'
    + '<div class="hd-per-seg">' + HD_PER_KINDS.map(function (k) {
        return '<button class="' + (R.kind === k.id ? 'on' : '') + '" onclick="window.hdPerKind(\'' + k.id + '\')">' + k.label + '</button>';
      }).join('') + '</div>'
    + '<div class="hd-per-nav">'
    +   '<button onclick="window.hdPerShift(-1)" title="ช่วงก่อนหน้า">◀</button>'
    +   '<span class="hd-per-lbl">' + esc(R.label) + (R.ongoing ? ' <em>ถึงวันนี้</em>' : '') + '</span>'
    +   '<button onclick="window.hdPerShift(1)" title="ช่วงถัดไป"' + (R.off >= 0 ? ' disabled' : '') + '>▶</button>'
    + '</div>'
    + (R.off < 0 ? '<button class="hd-per-today" onclick="window.hdPerKind(\'' + R.kind + '\')">ปัจจุบัน</button>' : '')
    + '</div>';

  // span = จำนวนคอลัมน์ (จาก 3) ที่การ์ดกินบนจอกว้าง · height = ความสูงขั้นต่ำ — กราฟยืดเต็มการ์ดเมื่อการ์ดข้าง ๆ แถวเดียวกันสูงกว่า
  function chartCard(title, canvasId, height, hasData, emptyMsg, span, tip) {
    var body = hasData
      ? '<div class="hd-chart-body" style="min-height:' + height + 'px;"><canvas id="' + canvasId + '"></canvas></div>'
      : '<div class="hd-chart-empty" style="min-height:' + height + 'px;">' + esc(emptyMsg || 'ยังไม่มีข้อมูล') + '</div>';
    return '<div class="ov-card hd-card' + (span === 2 ? ' hd-span2' : '') + '"><div class="ov-card-title">' + title + window.calcTip(tip) + '</div>' + body + '</div>';
  }
  var hasIn = cur.inP.length > 0, noIn = 'ไม่มี Ticket ในช่วงนี้';
  var granTxt = R.gran === 'day' ? 'รายวัน' : R.gran === 'week' ? 'รายสัปดาห์' : 'รายเดือน';
  // แถวบน = แนวโน้ม + สัดส่วน Priority · แถวล่าง = จัดอันดับ 3 มุม (หมวด / ระบบ / รพ.) สูงเท่ากัน
  var charts = '<div class="hd-dash-grid">'
    + chartCard('📊 Ticket เข้า/ปิด ' + granTxt, 'hd-c-trend', 230, hasIn || cur.done.length > 0, noIn, 2, 'เข้า = จำนวน Ticket ที่เปิดในแต่ละช่อง · ปิด = จำนวนที่แก้เสร็จในแต่ละช่อง')
    + chartCard('🚦 การกระจาย Priority', 'hd-c-pri', 230, hasIn, noIn, null, 'จำนวน Ticket ที่เปิดในช่วงนี้ แยกตามระดับความสำคัญ')
    + chartCard('🗂️ แยกตามหมวดปัญหา', 'hd-c-cat', 300, hasIn, noIn, null, 'จำนวน Ticket ที่เปิดในช่วงนี้ แยกตามหมวดปัญหา')
    + chartCard('🖥️ แยกตามระบบที่ใช้งาน', 'hd-c-sys', 300, hasIn, noIn, null, 'Ticket ที่เปิดในช่วงนี้ แยกตามระบบ · แบ่งตามสถานะปัจจุบัน (เปิดอยู่ / ปิดแล้ว)')
    + chartCard('🏥 รพ. ที่แจ้งบ่อยที่สุด', 'hd-c-hosp', 300, cur.inP.some(function (t) { return t.hospitalId; }), noIn, null, '8 อันดับ รพ. ที่มี Ticket เปิดในช่วงนี้มากที่สุด')
    + '</div>';

  // ── สถานะ ณ ตอนนี้ (ไม่ขึ้นกับช่วงเวลาที่เลือก) — KPI 2 ใบซ้อนกันเป็นคอลัมน์แรก ตามด้วยกราฟ 2 ใบ ──
  var un = open.filter(function (t) { return !t.assigneeId; }).length;
  var nowGrid = '<div class="hd-dash-grid hd-now-grid">'
    + '<div class="hd-now-kpis">'
    +   kpi('📋', 'เปิดค้าง', open.length, !open.length ? 'ไม่มีงานค้าง' : un ? 'ยังไม่มอบหมาย ' + un + ' เรื่อง' : 'มอบหมายครบแล้ว', 'neu', null, 'Ticket ทุกเรื่องที่สถานะยังเปิดอยู่ ณ ตอนนี้ (ไม่ขึ้นกับช่วงเวลา)')
    +   kpi('🔥', 'เกิน SLA', breach, breach ? 'ต้องเร่งดำเนินการ' : 'ไม่มี — ดีมาก', breach ? 'bad' : 'good', null, 'Ticket ที่ยังเปิดอยู่ และเลยกำหนดแก้เสร็จแล้ว')
    + '</div>'
    + chartCard('⏳ อายุ Ticket ค้าง', 'hd-c-age', 200, open.length > 0, 'ไม่มีงานค้าง', null, 'Ticket ที่ยังเปิดอยู่ แบ่งตามอายุ = วันนี้ − วันที่เปิด Ticket')
    + chartCard('👤 ภาระงานตามผู้รับผิดชอบ', 'hd-c-assignee', 200, open.length > 0, 'ไม่มีงานค้าง', null, 'จำนวน Ticket ที่ยังเปิดอยู่ของแต่ละคน (8 อันดับแรก) · สีส้ม = ยังไม่มอบหมาย')
    + '</div>';

  // ตารางเสี่ยงเกิน SLA
  var risk = open.filter(function (t) { return t.resolutionDue; })
    .sort(function (a, b) { return new Date(a.resolutionDue) - new Date(b.resolutionDue); }).slice(0, 12);
  var riskRows = risk.map(function (t) {
    var sla = hdSlaCell(t);
    return '<tr style="cursor:pointer" onclick="window.hdOpen(\'' + t.id + '\')"><td style="font-family:var(--mono);font-size:12px;">' + esc(t.ticketNo) + '</td><td>' + esc(t.subject || '-') + '</td><td>' + esc(hdStaffName(t.assigneeId)) + '</td><td><span class="hd-pill hd-' + sla.cls + '">' + esc(sla.txt) + '</span></td></tr>';
  }).join('');
  var riskTable = '<div class="hd-dash-block"><div class="ov-card" style="padding:0;overflow:hidden;"><div class="ov-card-title" style="padding:14px 18px;margin:0;">⏰ เสี่ยง/เกิน SLA' + window.calcTip('Ticket ที่ยังเปิดอยู่และมีกำหนดแก้เสร็จ เรียงจากกำหนดใกล้ที่สุด (12 เรื่องแรก)\nSLA คงเหลือ = กำหนดแก้เสร็จ − ตอนนี้ · ติดลบ = เกินแล้ว · สีส้ม = เหลือน้อยกว่า 20% ของเวลาทั้งหมด') + '</div><div style="overflow-x:auto;"><table class="t-table" style="min-width:520px;"><thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>ผู้รับผิดชอบ</th><th>SLA คงเหลือ</th></tr></thead><tbody>' + (riskRows || '<tr><td colspan="4" style="text-align:center;color:var(--txt3);padding:24px;">ไม่มี</td></tr>') + '</tbody></table></div></div></div>';

  return '<div class="hd-dash">'
    + '<div class="hd-dash-head"><div class="hd-dash-h">📊 ภาพรวม</div>' + perCtrl + '</div>'
    + kpis + charts
    + '<div class="hd-dash-head hd-dash-now"><div class="hd-dash-h">📌 สถานะ ณ ตอนนี้ <span>ไม่ขึ้นกับช่วงเวลาที่เลือก</span></div></div>'
    + nowGrid + riskTable
    + '</div>';
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
  // การ์ดกว้าง 1/3 จอ — ตัดชื่อยาว ๆ บนแกน (ชื่อเต็มยังเห็นใน tooltip)
  var tickShort = Object.assign({ callback: function (v) { var l = String(this.getLabelForValue(v)); return l.length > 20 ? l.slice(0, 19) + '…' : l; } }, tickOpt);

  // ช่วงเวลาที่เลือก — กราฟส่วน "ภาพรวม" ใช้ Ticket ที่เปิดในช่วงนี้ (perT) · ส่วน "ณ ตอนนี้" ใช้ทั้งหมด
  var R = hdPerRange();
  var perT = all.filter(function (t) { return hdInRange(t.createdAt, R.s, R.e); });

  // trend — แบ่งช่องตามช่วง (เดือน=รายวัน / ไตรมาส=รายสัปดาห์ / ปี=รายเดือน) ถึงวันนี้ถ้าช่วงยังไม่จบ
  // 2 series (เข้า/ปิด) ต้องแยกตัวตนจริง ใช้คู่สี categorical
  var bins = [];
  for (var bs = new Date(R.s); bs.getTime() < R.axisEnd;) {
    var be = R.gran === 'day' ? new Date(bs.getFullYear(), bs.getMonth(), bs.getDate() + 1)
      : R.gran === 'week' ? new Date(bs.getFullYear(), bs.getMonth(), bs.getDate() + 7)
      : new Date(bs.getFullYear(), bs.getMonth() + 1, 1);
    var lbl = R.gran === 'month' ? HD_TH_MON[bs.getMonth()] + ' ' + hdBE2(bs.getFullYear())
      : String(bs.getDate()).padStart(2, '0') + '/' + String(bs.getMonth() + 1).padStart(2, '0');
    bins.push({ s: bs.getTime(), e: Math.min(be.getTime(), R.e), lbl: lbl });
    bs = be;
  }
  var days = bins.map(function (b) { return b.lbl; });
  // นับลงช่องในรอบเดียว (แปลงวันที่ครั้งเดียวต่อ Ticket) แทน filter ทั้งชุดทุกช่อง — ช่องไม่ทับกัน ผลเท่าเดิม
  var inD = bins.map(function () { return 0; }), outD = bins.map(function () { return 0; });
  var binAdd = function (cnt, v) {
    if (!v) return;
    var x = new Date(v).getTime();
    for (var bi = 0; bi < bins.length; bi++) { if (x >= bins[bi].s && x < bins[bi].e) { cnt[bi]++; return; } }
  };
  all.forEach(function (t) { binAdd(inD, t.createdAt); binAdd(outD, t.resolvedAt); });
  var cTrend = document.getElementById('hd-c-trend');
  if (cTrend) window._hdCharts.trend = new Chart(cTrend, {
    type: 'line',
    data: { labels: days, datasets: [
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
  var catData = cats.map(function (c) { return perT.filter(function (t) { return t.categoryId === c.id; }).length; })
    .concat([perT.filter(function (t) { return !t.categoryId; }).length]);
  var cCat = document.getElementById('hd-c-cat');
  if (cCat) window._hdCharts.cat = new Chart(cCat, {
    type: 'bar',
    data: { labels: catLabels, datasets: [{ label: 'Ticket', data: catData, backgroundColor: vzCat, borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { grid: { display: false }, ticks: tickOpt } } },
  });

  // by system (Ticket ที่เปิดในช่วงนี้ · สถานะปัจจุบัน) — hue เดียว: ปิดแล้ว = จาง / เปิดอยู่ = เข้ม (เน้นส่วนที่ยังค้าง) · tooltip บอกหมวดปัญหาที่พบบ่อย
  var sysEntries = hdSystemEntries(perT);
  var cSys = document.getElementById('hd-c-sys');
  if (cSys) window._hdCharts.sys = new Chart(cSys, {
    type: 'bar',
    data: { labels: sysEntries.map(function (e) { return e.name; }), datasets: [
      { label: 'เปิดอยู่', data: sysEntries.map(function (e) { return e.open; }), backgroundColor: vzCat, borderRadius: 4, maxBarThickness: 20 },
      { label: 'ปิดแล้ว', data: sysEntries.map(function (e) { return e.closed; }), backgroundColor: hdHexA(vzCat, dark ? .4 : .3), borderRadius: 4, maxBarThickness: 20 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: Object.assign({ position: 'bottom' }, legendOpt),
        tooltip: { callbacks: { footer: function (items) {
          var e = sysEntries[items[0].dataIndex];
          var top = Object.keys(e.cats).map(function (c) { return [c, e.cats[c]]; })
            .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
          return ['รวม ' + (e.open + e.closed) + ' เรื่อง', 'หมวดที่พบบ่อย:'].concat(top.map(function (x) { return '• ' + x[0] + ' (' + x[1] + ')'; }));
        } } } },
      scales: { x: { stacked: true, beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { stacked: true, grid: { display: false }, ticks: tickShort } } },
  });

  // priority donut — คงสีที่ Admin ตั้งไว้ (identity เดียวกับ badge ทุกจุดในแอป ไม่สุ่ม palette ใหม่)
  var prLabels = (window.HD_PRIORITY || []).map(function (p) { return p.short; });
  var prData = (window.HD_PRIORITY || []).map(function (p) { return perT.filter(function (t) { return t.priority === p.id; }).length; });
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

  // รพ. ที่แจ้งปัญหาบ่อยที่สุดในช่วงที่เลือก — ช่วยเห็นว่าที่ไหนต้องการความช่วยเหลือมากเป็นพิเศษ
  var byHosp = {};
  perT.forEach(function (t) { if (!t.hospitalId) return; byHosp[t.hospitalId] = (byHosp[t.hospitalId] || 0) + 1; });
  var hospEntries = Object.keys(byHosp).map(function (id) {
    var h = hdHosp(id);
    return { name: h ? ((h.code ? h.code + ' ' : '') + h.name) : id, count: byHosp[id] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
  var cHosp = document.getElementById('hd-c-hosp');
  if (cHosp) window._hdCharts.hosp = new Chart(cHosp, {
    type: 'bar',
    data: { labels: hospEntries.map(function (e) { return e.name; }), datasets: [{ label: 'Ticket', data: hospEntries.map(function (e) { return e.count; }), backgroundColor: vzHosp, borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: grid }, ticks: Object.assign({ precision: 0 }, tickOpt) }, y: { grid: { display: false }, ticks: tickShort } } },
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
  if (!window.hdWk) window.hdWk = { period: 'week', start: hdWkYmd(hdWkMonday(new Date())), group: '', hosp: '' };
  return window.hdWk;
}
function hdWkKey() { var s = hdWkState(); return s.period + '|' + s.start + '|' + s.group + '|' + s.hosp; }

// ── ช่วงเวลา: รายสัปดาห์ / รายเดือน / รายปี ──
var HD_WK_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
var HD_WK_PERIOD = {
  week:  { label: 'รายสัปดาห์', unit: 'สัปดาห์' },
  month: { label: 'รายเดือน',   unit: 'เดือน' },
  year:  { label: 'รายปี',      unit: 'ปี' },
};
function hdWkP() { return HD_WK_PERIOD[hdWkState().period] || HD_WK_PERIOD.week; }
// วันเริ่มต้นของช่วงที่มีวัน d อยู่
function hdWkStartOf(d, period) {
  d = new Date(d); d.setHours(0, 0, 0, 0);
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === 'year') return new Date(d.getFullYear(), 0, 1);
  return hdWkMonday(d);
}
// เลื่อนวันเริ่มต้นไป n ช่วง
function hdWkAdd(d, n, period) {
  d = new Date(d);
  if (period === 'month') d.setMonth(d.getMonth() + n);
  else if (period === 'year') d.setFullYear(d.getFullYear() + n);
  else d.setDate(d.getDate() + n * 7);
  return d;
}
// ชื่อช่วง เช่น "20 ก.ค. – 26 ก.ค. 2569" / "กรกฎาคม 2569" / "ปี 2569"
function hdWkRangeLabel(s, e, period) {
  if (period === 'month') return HD_WK_MONTH[s.getMonth()] + ' ' + (s.getFullYear() + 543);
  if (period === 'year') return 'ปี ' + (s.getFullYear() + 543);
  var eLast = new Date(e); eLast.setDate(eLast.getDate() - 1);
  return hdWkD(s) + ' – ' + hdWkD(eLast, true);
}
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

// ── คำนวณข้อมูลทั้งช่วง (สัปดาห์/เดือน/ปี) ตามตัวกรองปัจจุบัน ──
function hdWkData() {
  var st = hdWkState();
  var s = new Date(st.start + 'T00:00:00'), e = hdWkAdd(s, 1, st.period), ps = hdWkAdd(s, -1, st.period);
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
  // งานค้าง ณ สิ้นช่วง — ช่วงปัจจุบันใช้สถานะจริงตอนนี้ · ช่วงที่ผ่านมาแล้วดูจากเวลาที่แก้เสร็จ
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
    // Set ของชุดเดียวกัน — ใช้เช็ก "อยู่ในชุดไหม" แทน indexOf ในลูป (เดิม O(n×m))
    inSet: new Set(inW), openSet: new Set(openEnd), overSet: new Set(overdue),
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
  var st = hdWkState(), d = hdWkAdd(new Date(st.start + 'T00:00:00'), n, st.period);
  if (d > new Date()) return;
  st.start = hdWkYmd(d);
  window.renderHelpdesk();
};
// v = "YYYY-MM-DD" (สัปดาห์) / "YYYY-MM" (เดือน) / "YYYY" (ปี)
window.hdWkPick = function (v) {
  if (!v) return;
  var st = hdWkState(), p = v.split('-');
  st.start = hdWkYmd(hdWkStartOf(new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1), st.period));
  window.renderHelpdesk();
};
// เลือกเดือน/ปีจาก dropdown (รายเดือน) — ถ้าเลือกเกินเดือนปัจจุบันให้ถอยมาเดือนปัจจุบัน
window.hdWkPickYM = function (y, m) {
  var d = new Date(+y, +m, 1), cur = hdWkStartOf(new Date(), 'month');
  hdWkState().start = hdWkYmd(d > cur ? cur : d);
  window.renderHelpdesk();
};
// เปลี่ยนมุมมอง — กดแล้วไปที่สัปดาห์/เดือน/ปี ปัจจุบันเสมอ
window.hdWkPeriod = function (p) {
  var st = hdWkState();
  st.period = p; st.start = hdWkYmd(hdWkStartOf(new Date(), p)); st.trackPage = 0;
  window.renderHelpdesk();
};
window.hdWkSet = function (k, v) { var st = hdWkState(); st[k] = v; st.trackPage = 0; window.renderHelpdesk(); };
// กดการ์ดกลุ่ม LINE = กรองทั้งหน้าเป็นกลุ่มนั้น (กดซ้ำ = ยกเลิก)
window.hdWkGroup = function (g) { var st = hdWkState(); st.group = st.group === g ? '' : g; st.trackPage = 0; window.renderHelpdesk(); };
// ตัวกรองรายการติดตาม — เปลี่ยนเฉพาะตาราง ไม่ render ทั้งหน้า
window.hdWkTrack = function (k) {
  var st = hdWkState();
  st.track = k; st.trackPage = 0;
  var el = document.getElementById('hd-wk-track');
  if (el) el.innerHTML = hdWkTrackHtml(hdWkData());
};
// เปลี่ยนหน้าตารางติดตาม (ทีละ HD_WK_PAGE แถว)
window.hdWkTrackPage = function (p) {
  hdWkState().trackPage = p;
  var el = document.getElementById('hd-wk-track');
  if (!el) return;
  el.innerHTML = hdWkTrackHtml(hdWkData());
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
};
var HD_WK_PAGE = 50;

// เรื่องทั้งหมดที่ต้องติดตามในช่วง: รับเข้า + ปิดในช่วง + ค้างยกมาจากช่วงก่อน
function hdWkTracked(D) {
  var seen = {}, out = [];
  D.inW.concat(D.resW, D.openEnd).forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; out.push(t); } });
  return out;
}
function hdWkIsCarry(t, D) { return new Date(t.createdAt || 0) < D.s; }
function hdWkIsDone(t, D) { return !D.openSet.has(t); }
function hdWkIsOver(t, D) { return D.overSet.has(t); }

var HD_WK_TRACK = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'open', label: '⏳ ค้าง' },
  { id: 'overdue', label: '🔥 เกิน SLA' },
  { id: 'urgent', label: '🚨 ด่วน P1/P2' },
  { id: 'carry', label: '↪ ยกมาจาก' },   // + "<สัปดาห์|เดือน|ปี>ก่อน" ตอนแสดง
  { id: 'done', label: '✅ แก้เสร็จ' },
];
function hdWkTrackFilter(id, D) {
  return function (t) {
    if (id === 'open') return !hdWkIsDone(t, D);
    if (id === 'overdue') return hdWkIsOver(t, D);
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
    return '<button class="hd-wk-fchip' + (cur === f.id ? ' on' : '') + '" onclick="window.hdWkTrack(\'' + f.id + '\')">' + f.label + (f.id === 'carry' ? hdWkP().unit + 'ก่อน' : '') + ' <b>' + c + '</b></button>';
  }).join('') + '</div>';
  // ค้างขึ้นก่อน (เกิน SLA → ด่วน → เก่าสุด) แล้วค่อยเรื่องที่แก้เสร็จ
  var rank = function (t) { return hdWkIsDone(t, D) ? 3 : hdWkIsOver(t, D) ? 0 : (t.priority === 'p1' || t.priority === 'p2') ? 1 : 2; };
  // คำนวณ rank/เวลาเปิดไว้ก่อนเรียง (ไม่แปลงวันที่ซ้ำทุกครั้งที่เทียบ) — ลำดับเหมือนเดิม
  var list = all.filter(hdWkTrackFilter(cur, D)).map(function (t) { return { t: t, r: rank(t), c: new Date(t.createdAt) - 0 }; })
    .sort(function (a, b) { return a.r - b.r || a.c - b.c; })
    .map(function (x) { return x.t; });
  if (!list.length) return chips + '<div class="hd-wk-empty">ไม่มีรายการ</div>';
  var pages = Math.ceil(list.length / HD_WK_PAGE), pg = Math.min(Math.max(st.trackPage || 0, 0), pages - 1), from = pg * HD_WK_PAGE;
  var pager = pages < 2 ? '' : '<div class="hd-wk-pager hd-wk-noprint">'
    + '<button class="hd-wk-fchip"' + (pg ? ' onclick="window.hdWkTrackPage(' + (pg - 1) + ')"' : ' disabled') + '>‹ ก่อนหน้า</button>'
    + '<span class="hd-wk-muted">แถว ' + (from + 1) + '–' + Math.min(from + HD_WK_PAGE, list.length) + ' จาก ' + list.length + ' · หน้า ' + (pg + 1) + '/' + pages + '</span>'
    + '<button class="hd-wk-fchip"' + (pg < pages - 1 ? ' onclick="window.hdWkTrackPage(' + (pg + 1) + ')"' : ' disabled') + '>ถัดไป ›</button></div>';
  var rows = list.slice(from, from + HD_WK_PAGE).map(function (t) {
    var s = hdStatus(t.status), p = hdPri(t.priority), f = hdWkFix(t.id), done = hdWkIsDone(t, D), c = new Date(t.createdAt);
    var tags = (hdWkIsOver(t, D) ? '<span class="hd-pill hd-bad">เกิน SLA</span>' : '')
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
    + rows + '</tbody></table></div>' + pager;
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
  var st = hdWkState(), D = hdWkData(), P = hdWkP();
  var range = hdWkRangeLabel(D.s, D.e, st.period);
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
  var today = hdWkYmd(new Date()), picker;
  // ปีที่เลือกได้: ปีปัจจุบัน ย้อนไปถึงปีของ Ticket แรก (แสดงเป็น พ.ศ.)
  var y0 = new Date().getFullYear(), selY = +st.start.slice(0, 4), selM = +st.start.slice(5, 7) - 1;
  var yMin = Math.min(selY, (window.HELPDESK_TICKETS || []).reduce(function (m, t) { return t.createdAt ? Math.min(m, new Date(t.createdAt).getFullYear()) : m; }, y0));
  var yOpts = '';
  for (var y = y0; y >= yMin; y--) yOpts += '<option value="' + y + '"' + (selY === y ? ' selected' : '') + '>' + (st.period === 'year' ? 'ปี ' : '') + (y + 543) + '</option>';
  if (st.period === 'month') {
    var mOpts = HD_WK_MONTH.map(function (n, i) {
      var future = selY === y0 && i > new Date().getMonth();
      return '<option value="' + i + '"' + (selM === i ? ' selected' : '') + (future ? ' disabled' : '') + '>' + n + '</option>';
    }).join('');
    picker = '<select class="t-sel" onchange="window.hdWkPickYM(' + selY + ',this.value)" title="เลือกเดือน">' + mOpts + '</select>'
      + '<select class="t-sel" onchange="window.hdWkPickYM(this.value,' + selM + ')" title="เลือกปี พ.ศ.">' + yOpts + '</select>';
  } else if (st.period === 'year') {
    picker = '<select class="t-sel" onchange="window.hdWkPick(this.value)" title="เลือกปี พ.ศ.">' + yOpts + '</select>';
  } else {
    picker = '<input type="date" class="t-sel" value="' + st.start + '" max="' + today + '" onchange="window.hdWkPick(this.value)" title="เลือกวันใดก็ได้ในสัปดาห์">';
  }
  var seg = '<div class="hd-wk-seg" role="group" aria-label="มุมมอง">' + Object.keys(HD_WK_PERIOD).map(function (k) {
    return '<button type="button" class="' + (st.period === k ? 'on' : '') + '" onclick="window.hdWkPeriod(\'' + k + '\')">' + HD_WK_PERIOD[k].label + '</button>';
  }).join('') + '</div>';
  var toolbar = '<div class="toolbar hd-wk-noprint hd-wk-bar-top">'
    + seg
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdWkShift(-1)" title="' + P.unit + 'ก่อน">◀</button>'
    + picker
    + '<button class="btn btn-ghost btn-sm" onclick="window.hdWkShift(1)" title="' + P.unit + 'ถัดไป"' + (D.isCurrent ? ' disabled' : '') + '>▶</button>'
    + '<select class="t-sel" onchange="window.hdWkSet(\'group\',this.value)">' + grpOpts + '</select>'
    + '<select class="t-sel" onchange="window.hdWkSet(\'hosp\',this.value)">' + hospOpts + '</select>'
    + (st.group || st.hosp ? '<button class="btn btn-ghost btn-sm" onclick="window.hdWk.group=\'\';window.hdWk.hosp=\'\';window.renderHelpdesk()" title="ล้างตัวกรอง" aria-label="ล้างตัวกรอง">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>' : '')
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ พิมพ์ / PDF</button>'
    + '<button class="btn btn-pri btn-sm" onclick="window.hdWkRunAi()"' + (_hdWkAi && _hdWkAi.loading ? ' disabled' : '') + '>🤖 สรุปด้วย AI</button>'
    + '</div>';

  // ── หัวรายงาน + สถานะรวม 1 บรรทัด ──
  var health = D.overdue.length ? { cls: 'bad', txt: '🔴 มี ' + D.overdue.length + ' เรื่องเกิน SLA ต้องเร่งดำเนินการ' }
    : D.openEnd.length ? { cls: 'warn', txt: '🟡 ค้าง ' + D.openEnd.length + ' เรื่อง (ยังไม่เกิน SLA)' }
    : { cls: 'good', txt: '🟢 เคลียร์งานครบ ไม่มีเรื่องค้าง' };
  var head = '<div class="hd-wk-head"><div>'
    + '<div class="hd-wk-title">📊 สรุปงานศูนย์ช่วยเหลือ · ' + range + (D.isCurrent ? ' <span class="hd-wk-tag">' + P.unit + 'นี้ ยังไม่จบ</span>' : '') + '</div>'
    + '<div class="hd-wk-sub">' + esc([st.group, st.hosp ? hdWkHospName(st.hosp) : ''].filter(Boolean).join(' · ') || 'ทุกกลุ่ม LINE / ทุกช่องทาง · ทุก รพ.') + '</div></div>'
    + '<div class="hd-wk-health hd-wk-' + health.cls + '">' + health.txt + '</div></div>';

  // ── ภาพรวม: 3 การ์ด (ปริมาณงาน / ความเร็ว & คุณภาพ / ความเสี่ยง) ──
  var diff = D.prevW.length ? Math.round((D.inW.length - D.prevW.length) / D.prevW.length * 100) : null;
  var closeRate = tracked.length ? Math.round((tracked.length - D.openEnd.length) / tracked.length * 100) : null;
  var unassigned = D.openEnd.filter(function (t) { return !t.assigneeId; }).length;
  var carry = tracked.filter(function (t) { return hdWkIsCarry(t, D); }).length;
  function stat(label, val, sub, cls, tip) {
    return '<div class="hd-wk-stat"><div class="k">' + label + window.calcTip(tip) + '</div><div class="v' + (cls ? ' hd-wk-' + cls : '') + '">' + val + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }
  var lvl = function (v, good, warn, higherBetter) {
    if (v == null) return '';
    return higherBetter ? (v >= good ? 'good' : v >= warn ? 'warn' : 'bad') : (v <= good ? 'good' : v <= warn ? 'warn' : 'bad');
  };
  var overview = '<div class="hd-wk-ov">'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">📦 ปริมาณงาน</div><div class="hd-wk-stats">'
    +   stat('รับใหม่', D.inW.length, diff == null ? P.unit + 'ก่อน ' + D.prevW.length : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(diff) + '% จาก ' + D.prevW.length, '', 'Ticket ที่เปิดในช่วงนี้ (ไม่นับที่ยกเลิก) · เทียบ % กับช่วงก่อนหน้า')
    +   stat('แก้เสร็จ', D.resW.length, carry ? 'รวมยกมา ' + carry : '', '', 'Ticket ที่แก้เสร็จในช่วงนี้ (เปิดเมื่อไรก็ได้)\nยกมา = เรื่องที่ดูแลในช่วงนี้แต่เปิดก่อนช่วงนี้')
    +   stat('ค้าง', D.openEnd.length, D.isCurrent ? 'ตอนนี้' : 'สิ้น' + P.unit, D.openEnd.length ? 'warn' : 'good', 'Ticket ที่เปิดก่อนสิ้นช่วงและยังไม่เสร็จ ณ สิ้นช่วง (ช่วงปัจจุบัน = ยังเปิดอยู่ตอนนี้)\nแถบล่าง: ปิดแล้ว % = (เรื่องที่ดูแล − ค้าง) ÷ เรื่องที่ดูแล × 100\nเรื่องที่ดูแล = รับใหม่ + แก้เสร็จ + ค้าง (ไม่นับซ้ำ)')
    + '</div>' + (closeRate == null ? '' : '<div class="hd-wk-prog" title="ปิดแล้ว ' + closeRate + '% ของเรื่องที่ต้องดูแลใน' + P.unit + '"><div style="width:' + closeRate + '%"></div></div><div class="hd-wk-muted">ปิดแล้ว ' + closeRate + '% ของ ' + tracked.length + ' เรื่องที่ดูแลใน' + P.unit + '</div>') + '</div>'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">⏱️ ความเร็ว & คุณภาพ</div><div class="hd-wk-stats">'
    +   stat('ตอบครั้งแรก', hdWkFmtDur(D.frt), 'เฉลี่ย', '', 'ค่าเฉลี่ยของ (เวลาตอบครั้งแรก − เวลาเปิด) ของ Ticket ที่รับใหม่ในช่วงนี้')
    +   stat('แก้เสร็จใน', hdWkFmtDur(D.mttr), 'เฉลี่ย', '', 'ค่าเฉลี่ยของ (เวลาแก้เสร็จ − เวลาเปิด) ของ Ticket ที่แก้เสร็จในช่วงนี้')
    +   stat('ตรง SLA', D.slaPct == null ? '—' : D.slaPct + '%', '', lvl(D.slaPct, 90, 70, true), "ที่แก้เสร็จในช่วงนี้และตรง SLA ÷ ที่แก้เสร็จในช่วงนี้ × 100\nตรง SLA = ตอบครั้งแรกทันกำหนด และ แก้เสร็จทันกำหนด (ถ้า Ticket ไม่มีกำหนดข้อใด ถือว่าผ่านข้อนั้น)")
    +   stat('พึงพอใจ', D.csat == null ? '—' : D.csat.toFixed(1), D.csatN ? D.csatN + ' รีวิว' : 'ยังไม่มีคะแนน', lvl(D.csat, 4.5, 3.5, true), 'คะแนนเฉลี่ย (เต็ม 5) ของ Ticket ที่แก้เสร็จในช่วงนี้และได้รับคะแนน')
    + '</div></div>'
    + '<div class="ov-card hd-wk-ovc"><div class="ov-card-title">🚨 ความเสี่ยง</div><div class="hd-wk-stats">'
    +   stat('เกิน SLA', D.overdue.length, 'ยังค้าง', D.overdue.length ? 'bad' : 'good', 'เรื่องค้างที่เลยกำหนดแก้เสร็จแล้ว (ณ สิ้นช่วง หรือ ณ ตอนนี้)')
    +   stat('ด่วน P1/P2', D.urgent.length, 'รับเข้า', D.urgent.length ? 'warn' : '', 'Ticket ที่รับใหม่ในช่วงนี้ที่ Priority = P1 หรือ P2')
    +   stat('เปิดซ้ำ', D.reopened.length, '', D.reopened.length ? 'warn' : '', 'Ticket ที่เคยถูกเปิดซ้ำ และเปิดหรือแก้เสร็จในช่วงนี้')
    +   stat('ไม่มีผู้รับผิดชอบ', unassigned, 'ที่ค้าง', unassigned ? 'bad' : '', 'เรื่องค้างที่ยังไม่ได้มอบหมายผู้รับผิดชอบ')
    + '</div></div></div>';

  // ── แนวโน้มย้อนหลัง + รับเข้าแยกย่อยในช่วง (สัปดาห์ = รายวัน, เดือน = รายวันที่, ปี = รายเดือน) + รายชั่วโมง ──
  var isYear = st.period === 'year', isMonth = st.period === 'month';
  var nB = isYear ? 12 : isMonth ? Math.round((D.e - D.s) / 864e5) : 7;
  var dayCnt = [], hourCnt = {};
  for (var bi = 0; bi < nB; bi++) dayCnt.push(0);
  D.inW.forEach(function (t) {
    var d = new Date(t.createdAt);
    dayCnt[isYear ? d.getMonth() : isMonth ? d.getDate() - 1 : (d.getDay() + 6) % 7]++;
    hourCnt[d.getHours()] = (hourCnt[d.getHours()] || 0) + 1;
  });
  var dMax = Math.max.apply(null, dayCnt) || 1;
  var peakH = Object.keys(hourCnt).sort(function (a, b) { return hourCnt[b] - hourCnt[a]; }).slice(0, 3)
    .map(function (h) { return String(h).padStart(2, '0') + ':00 น. (' + hourCnt[h] + ')'; });
  var days = '<div class="hd-wk-days' + (isMonth ? ' dense' : '') + '" style="grid-template-columns:repeat(' + nB + ',1fr)">' + dayCnt.map(function (n, i) {
    var name, k;
    if (isYear) { name = HD_WK_MONTH[i]; k = HD_WK_MON[i]; }
    else {
      var day = new Date(D.s); day.setDate(day.getDate() + i);
      var dn = HD_WK_DAY[(day.getDay() + 6) % 7];
      name = dn + ' ' + day.getDate(); k = isMonth ? String(day.getDate()) : dn + ' ' + day.getDate();
    }
    return '<div class="hd-wk-day" title="' + name + ': ' + n + ' เรื่อง"><div class="col"><div style="height:' + (n / dMax * 100) + '%"></div></div>'
      + '<div class="v">' + n + '</div><div class="k">' + k + '</div></div>';
  }).join('') + '</div>' + (peakH.length ? '<div class="hd-wk-muted">⏰ แจ้งเข้ามามากช่วง ' + esc(peakH.join(' · ')) + '</div>' : '');
  var timeRow = '<div class="hd-wk-grid">'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">📈 แนวโน้ม ' + HD_WK_TREND_N[st.period] + ' ' + P.unit + ' ถึง' + P.unit + 'ที่เลือก (รับเข้า / แก้เสร็จ)</div>'
    + '<div class="hd-wk-muted" style="margin:-4px 0 6px;">' + esc([st.group, st.hosp ? hdWkHospName(st.hosp) : ''].filter(Boolean).join(' · ') || 'ทุกกลุ่ม LINE / ทุกช่องทาง · ทุก รพ.') + ' · แถบไฮไลต์ = ' + range + '</div>'
    + '<div style="height:190px;position:relative"><canvas id="hd-wk-c-trend"></canvas></div></div>'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">📅 รับเข้า' + (isYear ? 'รายเดือน' : 'รายวัน') + '</div>' + days + '</div>'
    + '</div>';

  // ── 1) กลุ่ม LINE: การ์ดต่อกลุ่ม (กด = กรองทั้งหน้า) ──
  var prevSrc = {}; D.prevW.forEach(function (t) { var k = hdWkSrc(t); prevSrc[k] = (prevSrc[k] || 0) + 1; });
  var groups = hdWkCount(tracked, hdWkSrc).map(function (g) {
    var inG = g.list.filter(function (t) { return D.inSet.has(t); });
    var openG = g.list.filter(function (t) { return !hdWkIsDone(t, D); });
    var overG = g.list.filter(function (t) { return hdWkIsOver(t, D); }).length;
    var doneG = g.list.length - openG.length;
    var hs = hdWkCount(g.list, function (t) { return t.hospitalId; }).map(function (h) { return hdWkHospName(h.key); });
    var cats = hdWkCount(g.list, function (t) { return t.categoryId; }).slice(0, 2).map(function (c) { return hdWkCatName(c.key) + ' ' + c.list.length; });
    var pv = prevSrc[g.key] || 0, d = inG.length - pv;
    var cls = overG ? 'bad' : openG.length ? 'warn' : 'good';
    return '<div class="hd-wk-gc hd-wk-gc-' + cls + (st.group === g.key ? ' on' : '') + '" onclick="window.hdWkGroup(' + esc(JSON.stringify(g.key)) + ')" title="กดเพื่อดูเฉพาะกลุ่มนี้">'
      + '<div class="hd-wk-gc-h"><b>' + esc(g.key) + '</b><span class="hd-wk-gc-tr">' + (pv || inG.length ? (d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '±0') + ' จาก' + P.unit + 'ก่อน' : '') + '</span></div>'
      + '<div class="hd-wk-muted hd-wk-ell">🏥 ' + esc(hs.slice(0, 3).join(', ') + (hs.length > 3 ? ' +' + (hs.length - 3) : '')) + '</div>'
      + '<div class="hd-wk-gc-n"><span><b>' + inG.length + '</b> รับใหม่</span><span><b>' + doneG + '</b> ปิดแล้ว</span><span class="' + (openG.length ? 'hd-wk-wait' : '') + '"><b>' + openG.length + '</b> ค้าง</span>' + (overG ? '<span class="hd-wk-bad"><b>' + overG + '</b> เกิน SLA</span>' : '') + '</div>'
      + '<div class="hd-wk-prog"><div style="width:' + Math.round(doneG / g.list.length * 100) + '%"></div></div>'
      + (cats.length ? '<div class="hd-wk-muted hd-wk-ell">🗂️ ' + esc(cats.join(' · ')) + '</div>' : '')
      + '</div>';
  }).join('');
  var sec1 = '<div class="hd-sec-title">📥 1. งานจากกลุ่ม LINE / ช่องทาง <span class="hd-wk-muted">— กดการ์ดเพื่อดูเฉพาะกลุ่มนั้น</span></div><div class="hd-wk-pad">'
    + (groups ? '<div class="hd-wk-gcs">' + groups + '</div>' : '<div class="ov-card hd-wk-empty">ไม่มีเรื่องใน' + P.unit + 'นี้</div>')
    + (D.cancelled ? '<div class="hd-wk-muted" style="margin-top:8px;">🚫 ยกเลิก ' + D.cancelled + ' เรื่อง (ไม่นับรวม)</div>' : '') + '</div>';

  // ── 2) ภาพรวมปัญหา ──
  var priGroups = (window.HD_PRIORITY || []).map(function (p) { return { key: p.id, list: tracked.filter(function (t) { return t.priority === p.id; }) }; }).filter(function (g) { return g.list.length; });
  var sec2 = '<div class="hd-sec-title">🧩 2. ภาพรวมปัญหา</div><div class="hd-wk-pad"><div class="hd-wk-grid2">'
    + hdWkBars('🗂️ หมวดปัญหา', hdWkCount(tracked, function (t) { return t.categoryId; }), hdWkCatName)
    + hdWkBars('💻 ระบบ', hdWkCount(tracked, function (t) { return t.sourceSystem || '(ไม่ระบุระบบ)'; }), function (k) { return k; })
    + hdWkBars('🏥 รพ. ที่แจ้งมากที่สุด', hdWkCount(tracked, function (t) { return t.hospitalId; }), hdWkHospName)
    + hdWkBars('🚦 ความเร่งด่วน', priGroups, function (k) { return hdPri(k).label; })
    + '</div></div>';

  // ── 3) การแก้ไข & ทีมงาน ──
  var staffMap = {};
  var sf = function (id) { return staffMap[id] = staffMap[id] || { id: id, got: 0, done: [], open: 0, over: 0 }; };
  D.inW.forEach(function (t) { sf(t.assigneeId).got++; });
  D.resW.forEach(function (t) { sf(t.assigneeId).done.push(t); });
  D.openEnd.forEach(function (t) { var x = sf(t.assigneeId); x.open++; if (hdWkIsOver(t, D)) x.over++; });
  var staffRows = Object.keys(staffMap).map(function (k) { return staffMap[k]; })
    .sort(function (a, b) { return b.done.length - a.done.length || b.got - a.got; }).map(function (x) {
      var r = x.done.filter(function (t) { return t.csatScore != null; });
      return '<tr><td>' + esc(x.id ? (hdStaffName(x.id) || x.id) : '⚠️ ยังไม่มอบหมาย') + '</td><td class="num">' + x.got + '</td><td class="num"><b>' + x.done.length + '</b></td>'
        + '<td class="num' + (x.open ? ' hd-wk-wait' : '') + '">' + x.open + (x.over ? ' <span class="hd-wk-bad">(' + x.over + ' เกิน)</span>' : '') + '</td>'
        + '<td class="num">' + hdWkFmtDur(hdWkAvg(x.done, function (t) { return hdWkMins(t.createdAt, t.resolvedAt); })) + '</td>'
        + '<td class="num">' + (r.length ? (r.reduce(function (a, t) { return a + t.csatScore; }, 0) / r.length).toFixed(1) : '—') + '</td></tr>';
    }).join('');
  var sec3 = '<div class="hd-sec-title">🛠️ 3. การแก้ไข & ทีมงาน</div><div class="hd-wk-pad"><div class="hd-wk-grid">'
    + '<div class="ov-card hd-wk-card"><div class="ov-card-title">👤 ผลงานรายคน</div><div class="hd-wk-scroll"><table class="t-table hd-wk-tbl"><thead><tr><th>ผู้รับผิดชอบ</th><th class="num">รับเข้า</th><th class="num">แก้เสร็จ</th><th class="num">ค้าง</th><th class="num">เวลาแก้เฉลี่ย</th><th class="num">CSAT</th></tr></thead><tbody>'
    +   (staffRows || '<tr><td colspan="6" class="hd-wk-empty">ไม่มีข้อมูล</td></tr>') + '</tbody></table></div></div>'
    + '<div class="ov-card hd-wk-card" id="hd-wk-kb">' + hdWkKbHtml(D) + '</div>'
    + '</div></div>';

  // ── 4) ติดตามรายเรื่อง (ดูรายละเอียด → ไว้ล่างสุด) ──
  var sec4 = '<div class="hd-sec-title">📋 4. ติดตามรายเรื่อง</div><div class="hd-wk-pad"><div class="ov-card hd-wk-card" id="hd-wk-track">' + hdWkTrackHtml(D) + '</div></div>';

  return '<div id="hd-wk-doc">' + toolbar + head + '<div id="hd-wk-ai">' + hdWkAiHtml() + '</div>' + overview + '<div class="hd-wk-pad">' + timeRow + '</div>' + sec1 + sec2 + sec3 + sec4 + '</div>';
}

// การบันทึกวิธีแก้: เรื่องที่แก้เสร็จมีบันทึกเข้าคลังความรู้กี่เรื่อง (ช่วยให้ทีมแก้ปัญหาซ้ำได้เร็วขึ้น)
function hdWkKbHtml(D) {
  var done = D.resW, n = done.length;
  var loaded = done.every(function (t) { return _hdWkEv[t.id]; });
  var title = '<div class="ov-card-title">📚 การบันทึกวิธีแก้</div>';
  if (!n) return title + '<div class="hd-wk-empty">ไม่มีเรื่องที่แก้เสร็จใน' + hdWkP().unit + 'นี้</div>';
  if (!loaded) return title + '<div class="hd-wk-muted">⏳ กำลังโหลด...</div>';
  var kb = done.filter(function (t) { var f = hdWkFix(t.id); return f && f.src === 'kb'; });
  var reply = done.filter(function (t) { var f = hdWkFix(t.id); return f && f.src === 'reply'; }).length;
  var none = n - kb.length - reply, pct = Math.round(kb.length / n * 100);
  var kbSet = new Set(kb);
  var miss = done.filter(function (t) { return !kbSet.has(t); });
  return title + '<div class="hd-wk-stats">'
    + '<div class="hd-wk-stat"><div class="k">เข้าคลังความรู้' + window.calcTip('เรื่องที่แก้เสร็จในช่วงนี้ที่มีบันทึก "วิธีแก้ไข" เข้าคลังความรู้ ÷ เรื่องที่แก้เสร็จทั้งหมด') + '</div><div class="v hd-wk-' + (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad') + '">' + kb.length + '/' + n + '</div><div class="s">' + pct + '%</div></div>'
    + '<div class="hd-wk-stat"><div class="k">มีแค่ข้อความตอบ</div><div class="v">' + reply + '</div></div>'
    + '<div class="hd-wk-stat"><div class="k">ไม่มีบันทึกเลย</div><div class="v' + (none ? ' hd-wk-bad' : '') + '">' + none + '</div></div></div>'
    + '<div class="hd-wk-prog"><div style="width:' + pct + '%"></div></div>'
    + (miss.length ? '<div class="hd-wk-muted" style="margin-top:8px;">ยังไม่บันทึกเข้าคลังความรู้: ' + miss.slice(0, 8).map(function (t) {
      return '<a href="javascript:void(0)" onclick="window.hdOpen(\'' + t.id + '\')">' + esc(t.ticketNo) + '</a>';
    }).join(', ') + (miss.length > 8 ? ' …' : '') + '</div>' : '<div class="hd-wk-muted" style="margin-top:8px;">✅ บันทึกครบทุกเรื่อง</div>');
}

// กราฟแนวโน้มย้อนหลัง (8 สัปดาห์ / 12 เดือน / 5 ปี) — 2 series (รับเข้า/แก้เสร็จ) ใช้คู่สีเดียวกับแดชบอร์ดที่ผ่าน validate_palette แล้ว
var HD_WK_TREND_N = { week: 8, month: 12, year: 5 };
function hdWkRenderChart() {
  var cv = document.getElementById('hd-wk-c-trend');
  window._hdCharts = window._hdCharts || {};
  if (window._hdCharts.wk) { try { window._hdCharts.wk.destroy(); } catch (e) {} delete window._hdCharts.wk; }
  if (!cv || !window.Chart) return;
  var st = hdWkState(), D = hdWkData();
  var labels = [], inN = [], outN = [];
  // แปลงวันที่ของ Ticket ครั้งเดียว (ms · ไม่มีค่า = null) แล้วนับทุกช่วงจากชุดนี้ แทนการ new Date ซ้ำทุกช่วง
  var tms = D.all.filter(function (t) { return t.status !== 'cancelled'; }).map(function (t) {
    return { c: t.createdAt ? new Date(t.createdAt).getTime() : null, r: t.resolvedAt ? new Date(t.resolvedAt).getTime() : null };
  });
  for (var i = HD_WK_TREND_N[st.period] - 1; i >= 0; i--) {
    var a = hdWkAdd(D.s, -i, st.period), b = hdWkAdd(a, 1, st.period), am = a.getTime(), bm = b.getTime();
    var inR = function (x) { return x !== null && x >= am && x < bm; };
    labels.push(st.period === 'year' ? String(a.getFullYear() + 543) : st.period === 'month' ? HD_WK_MON[a.getMonth()] + ' ' + String(a.getFullYear() + 543).slice(2) : hdWkD(a));
    inN.push(tms.filter(function (x) { return inR(x.c); }).length);
    outN.push(tms.filter(function (x) { return inR(x.r); }).length);
  }
  var css = getComputedStyle(document.body), dark = hdIsDark();
  var grid = (css.getPropertyValue('--border') || '#e2e5ec').trim(), ink2 = (css.getPropertyValue('--txt2') || '#5a6075').trim(), ink3 = (css.getPropertyValue('--txt3') || '#9ba3b8').trim();
  var cIn = '#4361ee', cOut = dark ? '#199e70' : '#1baf7a';
  var tick = { color: ink3, font: { size: 10.5 } };
  // จุดสุดท้าย = ช่วงที่เลือกในตัวกรอง → จุดใหญ่ + แถบพื้นหลัง ให้เห็นว่าตรงกับการ์ดสรุปด้านบน
  var last = labels.length - 1;
  var ptR = labels.map(function (_, i) { return i === last ? 6 : 3; });
  var selBand = {
    id: 'hdWkSel',
    beforeDatasetsDraw: function (c) {
      var x = c.scales.x, area = c.chartArea, w = last > 0 ? x.getPixelForValue(last) - x.getPixelForValue(last - 1) : area.right - area.left;
      var cx = x.getPixelForValue(last), ctx = c.ctx;
      ctx.save(); ctx.fillStyle = hdHexA(cIn, dark ? .16 : .09);
      ctx.fillRect(Math.max(area.left, cx - w / 2), area.top, Math.min(area.right, cx + w / 2) - Math.max(area.left, cx - w / 2), area.bottom - area.top);
      ctx.restore();
    },
  };
  window._hdCharts.wk = new Chart(cv, {
    type: 'line',
    plugins: [selBand],
    data: { labels: labels, datasets: [
      { label: 'รับเข้า', data: inN, borderColor: cIn, backgroundColor: cIn, borderWidth: 2, tension: .3, pointRadius: ptR, pointHoverRadius: 7 },
      { label: 'แก้เสร็จ', data: outN, borderColor: cOut, backgroundColor: cOut, borderWidth: 2, tension: .3, pointRadius: ptR, pointHoverRadius: 7 },
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
  var st = hdWkState(), P = hdWkP();
  var top = function (list, keyFn, nameFn, k) {
    return hdWkCount(list, keyFn).slice(0, k).map(function (g) { return nameFn(g.key) + ' ' + g.list.length; }).join(' · ') || '-';
  };
  var id = function (x) { return x; };
  return [
    'ช่วงเวลา (' + P.label + '): ' + hdWkRangeLabel(D.s, D.e, st.period) + (D.isCurrent ? ' (' + P.unit + 'ปัจจุบัน ยังไม่จบ)' : ''),
    'ขอบเขต: ' + ([st.group, st.hosp ? hdWkHospName(st.hosp) : ''].filter(Boolean).join(' · ') || 'ทุกกลุ่ม LINE/ช่องทาง ทุก รพ.'),
    'รับเรื่องใหม่ ' + D.inW.length + ' (' + P.unit + 'ก่อน ' + D.prevW.length + ') · แก้เสร็จ ' + D.resW.length + ' · ค้าง' + (D.isCurrent ? 'ตอนนี้ ' : 'สิ้น' + P.unit + ' ') + D.openEnd.length
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
  if (hdWkIsOver(t, D)) flags.push('เกิน SLA');
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
  var D = hdWkData(), key = hdWkKey(), P = hdWkP();
  var tks = hdWkTracked(D);
  if (!tks.length) { window.showAlert && window.showAlert(hdWkP().unit + 'นี้ยังไม่มีข้อมูลให้สรุป', 'warn'); return; }
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
    prog('AI กำลังเขียนบทสรุปประจำ' + P.unit + '…');
    var text = await window.aiChat(
      'คุณเป็นหัวหน้าทีม Helpdesk ซอฟต์แวร์โรงพยาบาล (HOSxP ฯลฯ) เขียนรายงานสรุปงานประจำ' + P.unit + 'ภาษาไทย ให้ผู้บริหารและทีมอ่าน '
      + 'ใช้หัวข้อตามลำดับนี้: "## ภาพรวม' + P.unit + '", "## งานที่ได้รับจากกลุ่ม LINE", "## ภาพรวมปัญหา", "## การแก้ไข", "## เรื่องที่ต้องติดตาม", "## ข้อเสนอแนะ' + P.unit + 'หน้า" '
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
  var D = hdWkData(), st = hdWkState();
  var txt = '📊 สรุปงานศูนย์ช่วยเหลือ' + (st.period === 'week' ? ' สัปดาห์ ' : ' ') + hdWkRangeLabel(D.s, D.e, st.period) + '\n'
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

// ── ADMIN PANEL: "AI ตอบกลับอัตโนมัติ" ───────────────────────────────────
function hdAiAutoCfg() {
  var b = window.HD_AI_AUTO_DEFAULTS || {}, c = window.HD_AI_AUTO_REPLY || {};
  return Object.assign({}, b, c, {
    schedule: Object.assign({}, b.schedule || {}, c.schedule || {}),
    priority_modes: Object.assign({}, b.priority_modes || {}, c.priority_modes || {}),
    team_breaks: Array.isArray(c.team_breaks) ? c.team_breaks.slice() : [],
    channels: Array.isArray(c.channels) ? c.channels.slice() : [],
    allowed_category_ids: Array.isArray(c.allowed_category_ids) ? c.allowed_category_ids.slice() : [],
    allowed_hospital_ids: Array.isArray(c.allowed_hospital_ids) ? c.allowed_hospital_ids.slice() : [],
  });
}
function hdAiScopeSummary(id, values, allLabel, unit) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = values.length ? ('ใช้เฉพาะ ' + values.length + ' ' + unit + 'ที่เลือก') : allLabel;
  el.classList.toggle('specific', values.length > 0);
}
function hdAiAutoBreakRows() {
  var box = document.getElementById('hd-ai-break-list'); if (!box) return;
  var rows = (window._hdAiBreakDraft || []).map(function (x, i) {
    return '<div class="hd-ai-break-row"><div><b>' + esc(x.name || 'ช่วงทีมพัก') + '</b><span>' + esc(String(x.start_at || '').replace('T', ' ')) + ' → ' + esc(String(x.end_at || '').replace('T', ' ')) + '</span></div>'
      + '<button type="button" class="btn btn-red btn-sm" onclick="window.hdAiAutoBreakRemove(' + i + ')">ลบ</button></div>';
  }).join('');
  box.innerHTML = rows || '<div class="hd-ai-empty">ยังไม่มีช่วงทีมพักพิเศษ</div>';
}
window.hdAiAutoBreakAdd = function () {
  var name = ((document.getElementById('hd-ai-break-name') || {}).value || '').trim() || 'ช่วงทีมพัก';
  var start = (document.getElementById('hd-ai-break-start') || {}).value || '';
  var end = (document.getElementById('hd-ai-break-end') || {}).value || '';
  if (!start || !end || end <= start) { window.showAlert && window.showAlert('กรุณาระบุวันเวลาเริ่มและสิ้นสุดให้ถูกต้อง', 'warn'); return; }
  window._hdAiBreakDraft = window._hdAiBreakDraft || [];
  window._hdAiBreakDraft.push({ id:'BRK' + Date.now(), name:name, start_at:start, end_at:end, enabled:true });
  document.getElementById('hd-ai-break-name').value = '';
  document.getElementById('hd-ai-break-start').value = '';
  document.getElementById('hd-ai-break-end').value = '';
  hdAiAutoBreakRows();
};
window.hdAiAutoBreakRemove = function (i) {
  window._hdAiBreakDraft = (window._hdAiBreakDraft || []).filter(function (_, n) { return n !== i; });
  hdAiAutoBreakRows();
};
window.renderHdAiAutoAdmin = function () {
  var c = document.getElementById('adm-body'); if (!c) return;
  var titleEl = document.getElementById('adm-head-title');
  if (titleEl) titleEl.innerHTML = '🤖 AI ตอบกลับอัตโนมัติ';
  var cfg = hdAiAutoCfg(), canE = window.canEdit && window.canEdit('admin');
  window._hdAiBreakDraft = (cfg.team_breaks || []).map(function (x) { return Object.assign({}, x); });
  var days = [[1,'จันทร์'],[2,'อังคาร'],[3,'พุธ'],[4,'พฤหัสบดี'],[5,'ศุกร์'],[6,'เสาร์'],[0,'อาทิตย์']];
  var dayRows = days.map(function (d) {
    var s = cfg.schedule[d[0]] || { enabled:false, start:'08:30', end:'17:30' };
    return '<div class="hd-ai-day" data-day="' + d[0] + '"><label><input class="hd-ai-day-on" type="checkbox"' + (s.enabled ? ' checked' : '') + '> ' + d[1] + '</label>'
      + '<input class="f-input hd-ai-day-start" type="time" value="' + esc(s.start || '08:30') + '"><span>ถึง</span>'
      + '<input class="f-input hd-ai-day-end" type="time" value="' + esc(s.end || '17:30') + '"></div>';
  }).join('');
  var priRows = (window.HD_PRIORITY || []).map(function (p) {
    var v = (cfg.priority_modes || {})[p.id] || 'off';
    return '<label class="hd-ai-priority"><span style="color:' + esc(p.color) + '">' + esc(p.short || p.label) + '</span><select class="f-input" data-hd-ai-priority="' + esc(p.id) + '">'
      + '<option value="guide"' + (v === 'guide' ? ' selected' : '') + '>แนะนำจากคลังความรู้</option>'
      + '<option value="ack_only"' + (v === 'ack_only' ? ' selected' : '') + '>รับเรื่องเท่านั้น</option>'
      + '<option value="off"' + (v === 'off' ? ' selected' : '') + '>ไม่ตอบอัตโนมัติ</option></select></label>';
  }).join('');
  var cats = (window.HELPDESK_CATEGORIES || []).filter(function (x) { return x.active !== false; });
  var hosps = (window.HOSPITALS || []).slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'th'); });
  var ch = cfg.channels || [];
  c.innerHTML = '<fieldset class="hd-ai-auto"' + (canE ? '' : ' disabled') + '>'
    + '<div class="hd-ai-hero"><div><div class="hd-ai-hero-title">ให้ AI ตอบเมื่อลูกค้ายังไม่ได้รับคำตอบ</div><div>ทำงานบนเซิร์ฟเวอร์ได้แม้ไม่มีคนเปิดหน้าเว็บ · ยกเลิกคิวทันทีเมื่อเจ้าหน้าที่ตอบ</div></div>'
    + '<label class="hd-ai-switch"><input id="hd-ai-enabled" type="checkbox"' + (cfg.enabled ? ' checked' : '') + '><span></span><b>' + (cfg.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน') + '</b></label></div>'

    + '<section class="hd-ai-card"><h3>⏱️ เงื่อนไขและเวลารอ</h3><div class="hd-ai-grid">'
    + '<label class="f-group"><span class="f-label">ช่วงที่อนุญาตให้ AI ทำงาน</span><select id="hd-ai-mode" class="f-input"><option value="all_hours"' + (cfg.mode === 'all_hours' ? ' selected' : '') + '>ทุกช่วงเวลา เมื่อคนยังไม่ตอบ</option><option value="outside_only"' + (cfg.mode === 'outside_only' ? ' selected' : '') + '>เฉพาะนอกเวลาทำการ/ทีมพัก</option></select></label>'
    + '<label class="f-group"><span class="f-label">ในเวลาทำการ (นาที)</span><input id="hd-ai-delay-business" class="f-input" type="number" min="0" max="1440" value="' + Number(cfg.business_delay_minutes || 0) + '"></label>'
    + '<label class="f-group"><span class="f-label">นอกเวลาทำการ (นาที)</span><input id="hd-ai-delay-off" class="f-input" type="number" min="0" max="1440" value="' + Number(cfg.off_hours_delay_minutes || 0) + '"></label>'
    + '<label class="f-group"><span class="f-label">วันหยุด/ทีมพัก (นาที)</span><input id="hd-ai-delay-holiday" class="f-input" type="number" min="0" max="1440" value="' + Number(cfg.holiday_delay_minutes || 0) + '"></label>'
    + '<label class="f-group"><span class="f-label">ลูกค้าถามต่อหลัง AI ตอบ (นาที)</span><input id="hd-ai-followup" class="f-input" type="number" min="0" max="1440" value="' + Number(cfg.followup_delay_minutes || 0) + '"></label>'
    + '<label class="f-group"><span class="f-label">ตอบสูงสุดก่อนมีคนเข้ามา</span><input id="hd-ai-max" class="f-input" type="number" min="1" max="10" value="' + Number(cfg.max_auto_replies || 2) + '"></label>'
    + '<label class="f-group"><span class="f-label">ทีมยังไม่ตอบ AI กลับมาตอบใหม่หลัง (ชั่วโมง, 0 = ไม่กลับมา)</span><input id="hd-ai-return" class="f-input" type="number" min="0" max="168" value="' + Number(cfg.return_after_hours || 0) + '"></label>'
    + '</div><label class="f-group"><span class="f-label">ข้อความเมื่อตอบครบจำนวน (ส่ง 1 ครั้ง แล้วรอเจ้าหน้าที่)</span><textarea id="hd-ai-handoff" class="f-input" rows="2">' + esc(cfg.handoff_message || '') + '</textarea></label>'
    + '<div class="hd-ai-note">เริ่มจับเวลาจากข้อความล่าสุดของลูกค้า · ลูกค้าส่งเพิ่มจะเริ่มนับใหม่ · ถ้าเคยมีคำตอบ AI แล้วจะใช้เวลารอ "ถามต่อ" แทน · การเปิดอ่าน/โน้ตภายในไม่ถือว่าเป็นการตอบ · เจ้าหน้าที่ตอบเมื่อไรตัวนับเริ่มใหม่ · ถ้าแจ้งรอทีมแล้วทีมยังไม่ตอบตามชั่วโมงที่ตั้ง AI จะกลับมาตอบข้อความล่าสุดของลูกค้าอีกรอบ</div></section>'

    + '<section class="hd-ai-card"><h3>🗓️ เวลาทำการและวันหยุด</h3><div class="hd-ai-days">' + dayRows + '</div>'
    + '<label class="hd-ai-check"><input id="hd-ai-use-holidays" type="checkbox"' + (cfg.use_holidays ? ' checked' : '') + '> ใช้ปฏิทินวันหยุดบริษัทและให้ AI ทำงานแบบวันหยุดตลอดวัน</label>'
    + '<div class="hd-ai-subtitle">ช่วงทีมพัก/AI Only พิเศษ</div><div class="hd-ai-break-add"><input id="hd-ai-break-name" class="f-input" placeholder="ชื่อ เช่น ปิดประชุมบริษัท"><input id="hd-ai-break-start" class="f-input" type="datetime-local"><input id="hd-ai-break-end" class="f-input" type="datetime-local"><button type="button" class="btn btn-ghost" onclick="window.hdAiAutoBreakAdd()">+ เพิ่มช่วง</button></div><div id="hd-ai-break-list"></div></section>'

    + '<section class="hd-ai-card"><h3>🛡️ ขอบเขตและความปลอดภัย</h3><div class="hd-ai-priorities">' + priRows + '</div>'
    + '<div class="hd-ai-scope"><div class="hd-ai-channel-box"><span class="f-label">ช่องทางที่อนุญาต</span><span class="hd-ai-inline-check"><label><input type="checkbox" data-hd-ai-channel="web"' + (ch.indexOf('web') >= 0 ? ' checked' : '') + '> เว็บ</label><label title="บันทึกคำตอบใน Timeline/ลิงก์ Ticket ไม่ได้ส่งเข้ากลุ่ม LINE โดยตรง"><input type="checkbox" data-hd-ai-channel="line"' + (ch.indexOf('line') >= 0 ? ' checked' : '') + '> LINE (ผ่านลิงก์ Ticket)</label><label><input type="checkbox" data-hd-ai-channel="phone"' + (ch.indexOf('phone') >= 0 ? ' checked' : '') + '> โทรศัพท์</label></span></div>'
    + '<div class="hd-ai-scope-rules"><div class="hd-ai-scope-field"><div><span class="f-label">หมวดที่อนุญาต</span><small id="hd-ai-cat-summary" class="hd-ai-scope-summary"></small></div><div id="hd-ai-categories" class="hd-ai-ms"></div></div>'
    + '<div class="hd-ai-scope-field"><div><span class="f-label">โรงพยาบาลที่อนุญาต</span><small id="hd-ai-hosp-summary" class="hd-ai-scope-summary"></small></div><div id="hd-ai-hospitals" class="hd-ai-ms wide"></div></div></div></div>'
    + '<div class="hd-ai-note">P1/P2 ค่าเริ่มต้นจะเพียงรับเรื่องและแจ้งว่าทีมกำลังติดตาม · AI ไม่ปิดงาน ไม่เปลี่ยนสถานะ และไม่รับปากเวลาแทนทีม</div></section>'

    + '<section class="hd-ai-card"><h3>🧾 การเก็บ Log</h3>'
    + '<div class="hd-ai-grid"><label class="f-group"><span class="f-label">AI Audit หลังปิดงาน (วัน)</span><input id="hd-ai-audit-days" class="f-input" type="number" min="30" max="3650" value="' + Number(cfg.audit_log_days || 180) + '"></label>'
    + '<label class="f-group"><span class="f-label">ผล AI ดิบที่ไม่ได้ส่ง (วัน)</span><input id="hd-ai-raw-days" class="f-input" type="number" min="1" max="365" value="' + Number(cfg.raw_log_days || 30) + '"></label>'
    + '<label class="f-group"><span class="f-label">Log เทคนิค/Error (วัน)</span><input id="hd-ai-tech-days" class="f-input" type="number" min="30" max="3650" value="' + Number(cfg.technical_log_days || 365) + '"></label></div>'
    + '<div class="hd-ai-note">ข้อความที่ส่งจริงเก็บใน Timeline ตามอายุ Ticket · Audit ไม่คัดลอกบทสนทนาทั้งชุด และระบบล้างข้อมูลหมดอายุอัตโนมัติทุกวัน</div></section>'
    + (canE ? '<div class="hd-ai-save"><button type="button" class="btn btn-pri" onclick="window.saveHdAiAutoSettings()">💾 บันทึกการตั้งค่า</button></div>' : '')
    + '</fieldset>';
  hdAiAutoBreakRows();
  var catPicker = document.getElementById('hd-ai-categories');
  catPicker._msSelected = (cfg.allowed_category_ids || []).slice();
  window.msFilter(catPicker, cats.map(function (x) { return { value:x.id, label:x.name }; }), {
    placeholder:'ทุกหมวด', searchable:true, searchPlaceholder:'ค้นหาหมวด...',
    onChange:function (v) { hdAiScopeSummary('hd-ai-cat-summary', v, 'ใช้ได้ทุกหมวด', 'หมวด'); },
  });
  hdAiScopeSummary('hd-ai-cat-summary', window.msValues(catPicker), 'ใช้ได้ทุกหมวด', 'หมวด');
  var hospPicker = document.getElementById('hd-ai-hospitals');
  hospPicker._msSelected = (cfg.allowed_hospital_ids || []).slice();
  window.msFilter(hospPicker, hosps.map(function (x) {
    var prov = String(x.province || '').replace(/^(จ\.|จังหวัด)\s*/, '').trim();
    return { value:x.id, label:(x.code ? x.code + ' · ' : '') + x.name + (prov ? ' · จ.' + prov : '') };
  }), {
    placeholder:'ทุกโรงพยาบาล', searchable:true, searchPlaceholder:'ค้นหารหัส ชื่อ หรือจังหวัด...',
    onChange:function (v) { hdAiScopeSummary('hd-ai-hosp-summary', v, 'ใช้ได้ทุกโรงพยาบาล', 'แห่ง'); },
  });
  hdAiScopeSummary('hd-ai-hosp-summary', window.msValues(hospPicker), 'ใช้ได้ทุกโรงพยาบาล', 'แห่ง');
  var en = document.getElementById('hd-ai-enabled');
  if (en) en.addEventListener('change', function () { var b = this.parentNode.querySelector('b'); if (b) b.textContent = this.checked ? 'เปิดใช้งาน' : 'ปิดใช้งาน'; });
};
window.saveHdAiAutoSettings = async function () {
  if (!(window.canEdit && window.canEdit('admin'))) return;
  function n(id, fallback, min, max) { var v = Number((document.getElementById(id) || {}).value); return isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback; }
  function chosen(id) { return window.msValues ? window.msValues(id) : []; }
  var schedule = {}, badSchedule = false;
  document.querySelectorAll('.hd-ai-day').forEach(function (row) {
    var item = { enabled:row.querySelector('.hd-ai-day-on').checked, start:row.querySelector('.hd-ai-day-start').value || '08:30', end:row.querySelector('.hd-ai-day-end').value || '17:30' };
    if (item.enabled && item.end <= item.start) badSchedule = true;
    schedule[row.dataset.day] = item;
  });
  if (badSchedule) { window.showAlert && window.showAlert('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มในทุกวันที่เปิดทำการ', 'warn'); return; }
  var pm = {};
  document.querySelectorAll('[data-hd-ai-priority]').forEach(function (el) { pm[el.dataset.hdAiPriority] = el.value; });
  var channels = Array.prototype.map.call(document.querySelectorAll('[data-hd-ai-channel]:checked'), function (el) { return el.dataset.hdAiChannel; });
  if (!channels.length) { window.showAlert && window.showAlert('กรุณาเลือกอย่างน้อย 1 ช่องทาง', 'warn'); return; }
  var cfg = {
    enabled: !!(document.getElementById('hd-ai-enabled') || {}).checked,
    mode: (document.getElementById('hd-ai-mode') || {}).value || 'all_hours', timezone:'Asia/Bangkok',
    business_delay_minutes:n('hd-ai-delay-business',10,0,1440), off_hours_delay_minutes:n('hd-ai-delay-off',3,0,1440), holiday_delay_minutes:n('hd-ai-delay-holiday',3,0,1440),
    followup_delay_minutes:n('hd-ai-followup',1,0,1440), max_auto_replies:n('hd-ai-max',2,1,10), return_after_hours:n('hd-ai-return',24,0,168),
    use_holidays:!!(document.getElementById('hd-ai-use-holidays') || {}).checked,
    channels:channels,
    allowed_category_ids:chosen('hd-ai-categories'), allowed_hospital_ids:chosen('hd-ai-hospitals'), priority_modes:pm, schedule:schedule,
    team_breaks:(window._hdAiBreakDraft || []).slice(),
    handoff_message:((document.getElementById('hd-ai-handoff') || {}).value || '').trim(),
    audit_log_days:n('hd-ai-audit-days',180,30,3650), raw_log_days:n('hd-ai-raw-days',30,1,365), technical_log_days:n('hd-ai-tech-days',365,30,3650),
  };
  try {
    await window.setDoc(window.getDocRef('SETTINGS', 'app'), { helpdesk_ai_auto_reply:cfg }, { merge:true });
    window.HD_AI_AUTO_REPLY = cfg;
    window.showAlert && window.showAlert('บันทึกการตั้งค่า AI ตอบกลับอัตโนมัติแล้ว', 'success');
    window.admTab('hd_ai_auto');
  } catch (e) { window.showDbError ? window.showDbError(e) : alert(e.message || e); }
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

  var obj = { id: id, name: name, defaultPriority: pri, parentId: '', defaultAssigneeId: '', sort: sort, active: active };
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

// ══ ปัญหาที่พบบ่อย / พบซ้ำ (แท็บ "🔁 ปัญหาซ้ำ") ═══════════════════════
// จัดกลุ่ม Ticket ที่เป็นปัญหาเดียวกัน → ดูว่าเกิดที่ รพ. ไหนบ้าง แนวโน้มเพิ่ม/ลด แล้วบันทึกสาเหตุ + แผนจัดการ (HELPDESK_PROBLEMS)
// AI รวมกลุ่ม/ตั้งชื่อปัญหา/เสนอแนวทางป้องกันเสมอ — จัดกลุ่มด้วยความคล้ายของข้อความ (bigram) เป็นข้อมูลตั้งต้นให้ AI
// แผนผูกกับกลุ่มด้วย group_key หรือ Ticket ที่ซ้อนกัน (key ของกลุ่มแบบ sim = Ticket แรกในช่วง เปลี่ยนได้เมื่อช่วงเลื่อน) ──
var HD_RC_DAYS = [[30, '30 วัน'], [90, '3 เดือน'], [180, '6 เดือน'], [365, '1 ปี'], [0, 'ทั้งหมด']];
var HD_RC_SORT = [['n', 'เรื่องมากสุด'], ['h', 'รพ. มากสุด'], ['rise', 'เพิ่มขึ้นเร็ว'], ['recent', 'เกิดล่าสุด']];
var HD_RC_PAGE = 30;
window.hdRc = window.hdRc || { days: 90, min: 2, sys: '', cat: '', sort: 'n', open: {}, hf: {}, show: HD_RC_PAGE, pst: 'active', view: 'issues' };
window.hdRc.view = window.hdRc.view || 'issues';
window.hdRcSet = function (k, v) {
  window.hdRc[k] = v;
  if (k !== 'pst') { window.hdRc.show = HD_RC_PAGE; window.hdRc.open = {}; window.hdRc.hf = {}; }
  hdRcRedraw();
};
window.hdRcView = function (view) {
  window.hdRc.view = view === 'plans' ? 'plans' : 'issues';
  hdRcRedraw();
};
window.hdRcToggle = function (i) {
  var g = (window._hdRcVis || [])[i]; if (!g) return;
  window.hdRc.open[g.key] = !window.hdRc.open[g.key];
  hdRcRedraw();
};
window.hdRcMore = function () { window.hdRc.show += HD_RC_PAGE; hdRcRedraw(); };
function hdRcRedraw() {
  var b = document.getElementById('hd-body');
  if (b && window.hdTab === 'recur' && !window.hdOpenId) b.innerHTML = hdRcHtml();
}

// จำผล bigram ต่อข้อความ — hdRcAfterPlan เรียกกับ Ticket ทั้งหมดทุกการ์ด/ทุกแผนทุกรอบวาด (ผลเป็นแบบอ่านอย่างเดียว ใช้ร่วมกันได้)
var _hdRcBigMemo = new Map();
function hdRcBig(s) {
  var src = String(s || ''), hit = _hdRcBigMemo.get(src);
  if (hit) return hit;
  var t = src.toLowerCase().replace(/[\s\p{P}\p{S}\d]+/gu, ''), o = {}, n = 0;
  for (var i = 0; i < t.length - 1; i++) { var k = t.substr(i, 2); if (!o[k]) { o[k] = 1; n++; } }
  if (_hdRcBigMemo.size > 20000) _hdRcBigMemo.clear();
  hit = { o: o, n: n };
  _hdRcBigMemo.set(src, hit);
  return hit;
}
function hdRcDice(A, B) {
  if (!A.n || !B.n) return 0;
  var a = A.n <= B.n ? A : B, b = a === A ? B : A, hit = 0;
  for (var k in a.o) if (b.o[k]) hit++;
  return 2 * hit / (A.n + B.n);
}
// ข้อความที่ใช้เทียบ: หัวข้อ (สั้นเกินไปค่อยต่อรายละเอียดช่วงต้น)
function hdRcText(t) {
  var s = String(t.subject || '').trim();
  return s.length >= 8 ? s : s + ' ' + String(t.description || '').slice(0, 120);
}
function hdRcSys(t) { return String(t.sourceSystem || '').trim(); }
// ข้อความเต็มของปัญหา — หัวข้อ Ticket ส่วนใหญ่ = รายละเอียด 60 ตัวอักษรแรก (ถูกตัดกลางคำ) → ใช้รายละเอียดแทนเมื่อหัวข้อเป็นแค่ส่วนต้น
function hdRcFull(t) {
  var s = String(t.subject || '').replace(/\s+/g, ' ').trim(), d = String(t.description || '').replace(/\s+/g, ' ').trim();
  if (d && (!s || d.indexOf(s) === 0)) return d.length > 200 ? d.slice(0, 200) + '…' : d;
  return s || d || '(ไม่มีหัวข้อ)';
}
function hdRcTop(arr) {
  var c = {}, best = '', bn = 0;
  arr.forEach(function (v) { if (!v) return; c[v] = (c[v] || 0) + 1; if (c[v] > bn) { bn = c[v]; best = v; } });
  return best;
}
function hdRcDate(iso) { var d = new Date(iso); return !iso || isNaN(d) ? '-' : d.getDate() + ' ' + HD_TH_MON[d.getMonth()] + ' ' + hdBE2(d.getFullYear()); }
function hdRcAgo(iso) {
  var d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return !iso || isNaN(d) ? '-' : d <= 0 ? 'วันนี้' : d === 1 ? 'เมื่อวาน' : d + ' วันก่อน';
}
function hdRcToday() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
function hdRcPSt(id) { return (window.HD_PROB_STATUS || []).find(function (s) { return s.id === id; }) || { id: id, label: id || '-', cls: 'hd-neu' }; }
function hdRcPType(id) { return (window.HD_PROB_TYPE || []).find(function (s) { return s.id === id; }) || null; }
function hdRcPlanOverdue(p) { return !!p.dueDate && p.status !== 'done' && p.status !== 'monitoring' && String(p.dueDate).slice(0, 10) < hdRcToday(); }

// Ticket ในช่วงเวลา + หมวด (ไม่นับที่ยกเลิก) — ทุกระบบงาน: AI วิเคราะห์ครั้งเดียวทุกระบบ ตัวกรองระบบใช้ตอนแสดงผล
function hdRcBase() {
  var S = window.hdRc, since = S.days ? Date.now() - S.days * 864e5 : 0;
  return (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (t.status === 'cancelled') return false;
    if (since && new Date(t.createdAt || 0).getTime() < since) return false;
    if (S.cat && t.categoryId !== S.cat) return false;
    return true;
  });
}

// กลุ่มตั้งต้นจากความคล้ายของข้อความ — เป็นข้อมูลส่งให้ AI และใช้แสดงระหว่างรอ/เมื่อ AI ล่ม
var _hdRcSim = { sig: '', groups: [] };
function hdRcSimGroups(base) {
  var S = window.hdRc;
  var sig = [S.days, S.sys, S.cat, base.map(function (t) { return t.id + t.updatedAt; }).join(',')].join('|');
  if (_hdRcSim.sig === sig) return _hdRcSim.groups;
  var groups = [];
  // จัดกลุ่มแบบโลภ: เรียงเก่า→ใหม่ เทียบกับ Ticket ตัวแทนของแต่ละกลุ่ม · ต่างระบบหักคะแนนกันปนกัน
  base.slice().sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); }).forEach(function (t) {
    var B = hdRcBig(hdRcText(t)), sys = hdRcSys(t), best = null, bs = 0;
    groups.forEach(function (g) {
      var s = hdRcDice(B, g.big);
      if (sys && g.sys && sys !== g.sys) s -= 0.1;
      if (s > bs) { bs = s; best = g; }
    });
    if (best && bs >= 0.5) best.list.push(t);
    else groups.push({ key: 'sim:' + t.id, big: B, sys: sys, list: [t] });
  });
  var mid = hdRcMid(base);
  groups.forEach(function (g) {
    hdRcFill(g, mid);
    var top = hdRcTop(g.list.map(function (t) { return String(t.subject || '').trim(); }));
    g.title = hdRcFull(g.list.find(function (t) { return String(t.subject || '').trim() === top; }) || g.list[0]);
  });
  _hdRcSim = { sig: sig, groups: groups };
  return groups;
}
// กึ่งกลางช่วงเวลา — ใช้แบ่งครึ่งแรก/ครึ่งหลังดูแนวโน้ม
function hdRcMid(base) {
  var S = window.hdRc, now = Date.now(), start = S.days ? now - S.days * 864e5
    : base.reduce(function (m, t) { return Math.min(m, new Date(t.createdAt || now).getTime()); }, now);
  return (start + now) / 2;
}
// สถิติของกลุ่ม: หมวด/ระบบที่พบมากสุด, รพ., ค้าง, ล่าสุด, แนวโน้ม (a = ครึ่งแรก, b = ครึ่งหลัง)
function hdRcFill(g, mid) {
  var L = g.list.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
  g.catId = hdRcTop(L.map(function (t) { return t.categoryId; }));
  g.sys = hdRcTop(L.map(hdRcSys));
  var hc = {};
  L.forEach(function (t) { var h = t.hospitalId || ''; hc[h] = (hc[h] || 0) + 1; });
  g.hosps = Object.keys(hc).map(function (h) { return { id: h, n: hc[h] }; }).sort(function (a, b) { return b.n - a.n; });
  g.hospN = g.hosps.filter(function (h) { return h.id; }).length;
  g.openN = L.filter(function (t) { return hdStatus(t.status).open; }).length;
  g.last = L[0].createdAt;
  g.a = L.filter(function (t) { return new Date(t.createdAt).getTime() < mid; }).length;
  g.b = L.length - g.a;
}

// ── AI สรุป: ส่งกลุ่มจากความคล้ายของข้อความให้ AI รวมกลุ่มที่เป็นปัญหาเดียวกันจริง ตั้งชื่อปัญหาเอง
// พร้อมสาเหตุที่น่าจะเป็น + แนวทางป้องกัน (รวมได้เฉพาะระบบงานเดียวกัน) · ผลเก็บใน localStorage ต่อชุดตัวกรอง (ช่วงเวลา/หมวด) — เปิดแท็บซ้ำ
// ไม่เรียก AI ใหม่ · Ticket ที่เข้ามาหลังวิเคราะห์ ถูกนับเข้าปัญหาเดิมผ่านกลุ่มข้อความที่อยู่ร่วมกัน (กด "วิเคราะห์ใหม่" ได้) ──
var HD_RC_AI_LS = 'hd_rc_ai_v2', HD_RC_AI_MAXG = 120;
var _hdRcAi = { store: null, busy: {}, err: {} };
function hdRcAiKey() { var S = window.hdRc; return S.days + '|' + S.cat; }
function hdRcAiStore() {
  if (!_hdRcAi.store) { try { _hdRcAi.store = JSON.parse(localStorage.getItem(HD_RC_AI_LS) || '{}') || {}; } catch (e) { _hdRcAi.store = {}; } }
  return _hdRcAi.store;
}
function hdRcAiPut(key, R) {
  var st = hdRcAiStore();
  st[key] = R;
  Object.keys(st).sort(function (a, b) { return (st[b].at || '').localeCompare(st[a].at || ''); }).slice(6).forEach(function (k) { delete st[k]; });
  try { localStorage.setItem(HD_RC_AI_LS, JSON.stringify(st)); } catch (e) {}
}
function hdRcAiGroups(base) {
  var sim = hdRcSimGroups(base), R = hdRcAiStore()[hdRcAiKey()];
  sim.forEach(function (g) { g.raw = !!R; }); // raw = AI วิเคราะห์แล้วแต่ไม่นับเป็นปัญหาซ้ำ (แยกไปส่วนท้ายหน้า)
  if (!R) return sim; // ยังไม่มีผล AI → แสดงกลุ่มตามข้อความไปก่อน
  var owner = {};
  R.problems.forEach(function (p, i) { p.ids.forEach(function (id) { owner[id] = i; }); });
  var out = R.problems.map(function (p) { return { list: [], ai: p }; }), rest = [];
  sim.forEach(function (g) {
    var hit = -1;
    g.list.some(function (t) { if (owner[t.id] != null) { hit = owner[t.id]; return true; } return false; });
    if (hit >= 0) out[hit].list = out[hit].list.concat(g.list); else rest.push(g);
  });
  var mid = hdRcMid(base);
  out = out.filter(function (g) { return g.list.length; });
  out.forEach(function (g) {
    hdRcFill(g, mid);
    g.key = 'ai:' + g.list[g.list.length - 1].id;
    g.title = g.ai.name;
  });
  return out.concat(rest);
}
var HD_RC_AI_SUM_PROMPT =
  'คุณเป็นหัวหน้าทีม Helpdesk ของบริษัทซอฟต์แวร์โรงพยาบาล ได้รับกลุ่ม Ticket ที่ระบบจัดกลุ่มอัตโนมัติด้วยความคล้ายของข้อความ ' +
  '(อาจแยกผิด — ปัญหาเดียวกันที่เขียนต่างกันอาจอยู่คนละกลุ่ม) ' +
  'ให้รวมกลุ่มที่เป็นปัญหาเดียวกันจริง (เกิดที่ส่วน/ฟังก์ชันเดียวกันของระบบ และน่าจะมาจากสาเหตุเดียวกัน) ' +
  'แล้วสรุปเฉพาะปัญหาที่เกิดซ้ำ (รวมแล้วตั้งแต่ 2 เรื่องขึ้นไป) ตั้งชื่อปัญหาเองให้สั้น ชัด เข้าใจง่าย และเสนอแนวทางป้องกันไม่ให้เกิดซ้ำ ' +
  'ตอบ "เฉพาะ JSON" (ไม่มีข้อความอื่น ไม่มี markdown) รูปแบบ: ' +
  '{"overview":"<ภาพรวม 2–3 ประโยค: ปัญหาซ้ำหลักคืออะไร ควรเร่งจัดการเรื่องไหนก่อน เพราะอะไร>",' +
  '"overall_prevention":"<แนวทางป้องกันภาพรวม 3–5 ข้อ ที่ช่วยลดปัญหาซ้ำโดยรวม เรียงตามลำดับความสำคัญและขึ้นบรรทัดใหม่ทุกข้อ>",' +
  '"problems":[{"name":"<ชื่อปัญหา>","groups":["G1","G7"],"part":"<ส่วน/ฟังก์ชันของระบบที่เกิดปัญหา>",' +
  '"cause":"<สาเหตุที่น่าจะเป็น 1–2 ประโยค>","prevention":"<แนวทางป้องกัน 1–3 ข้อ ขึ้นบรรทัดใหม่ทุกข้อ>",' +
  '"plan_type":"fix|config|training|manual|dev|monitor"}]}. ' +
  'fix=แก้ Bug/ข้อมูลถาวร, config=ปรับตั้งค่า, training=อบรมผู้ใช้, manual=ทำคู่มือ/FAQ, dev=ส่งทีมพัฒนา, monitor=เฝ้าระวัง. ' +
  'รวมได้เฉพาะกลุ่มที่เป็นระบบเดียวกันเท่านั้น (ต่างระบบ = คนละปัญหา) · แต่ละกลุ่ม (G) อยู่ได้ในปัญหาเดียว · เรียงปัญหาจากสำคัญมากไปน้อย (จำนวนเรื่อง จำนวน รพ. ผลกระทบต่อการให้บริการ) · ' +
  'ห้ามแต่งข้อเท็จจริงที่ไม่มีในข้อมูล ถ้าไม่แน่ใจสาเหตุให้บอกว่าต้องตรวจสอบอะไร';
window.hdRcAiRun = async function () {
  var key = hdRcAiKey();
  if (_hdRcAi.busy[key]) return;
  var base = hdRcBase();
  if (!base.length) return;
  _hdRcAi.busy[key] = true; delete _hdRcAi.err[key];
  hdRcRedraw();
  try {
    var sim = hdRcSimGroups(base).slice().sort(function (a, b) { return b.list.length - a.list.length; }).slice(0, HD_RC_AI_MAXG);
    var sample = function (g) {
      var seen = {}, out = [];
      g.list.forEach(function (t) {
        var s = hdRcFull(t).slice(0, 120);
        if (s && !seen[s] && out.length < 3) { seen[s] = 1; out.push(s); }
      });
      return out.join(' / ');
    };
    var S = window.hdRc, dl = (HD_RC_DAYS.find(function (d) { return d[0] === S.days; }) || [0, ''])[1];
    var user = 'ช่วงข้อมูล: ' + dl + (S.cat && hdCat(S.cat) ? ' · หมวด ' + hdCat(S.cat).name : '')
      + ' · Ticket ทั้งหมด ' + base.length + ' เรื่อง'
      + '\n\nกลุ่ม (รหัส | จำนวนเรื่อง | จำนวน รพ. | ระบบ | ตัวอย่างหัวข้อ):\n'
      + sim.map(function (g, i) { return 'G' + (i + 1) + ' | ' + g.list.length + ' เรื่อง | ' + g.hospN + ' รพ. | ' + (g.sys || '-') + ' | ' + sample(g); }).join('\n');
    var out = await window.aiChatJson(HD_RC_AI_SUM_PROMPT, user, { maxTokens: 4000 });
    var used = {}, types = (window.HD_PROB_TYPE || []).map(function (x) { return x.id; });
    var problems = (Array.isArray(out.problems) ? out.problems : []).map(function (p) {
      var ids = [], sys = null; // กันรวมข้ามระบบงาน: รับเฉพาะกลุ่มที่ระบบเดียวกับกลุ่มแรก (ที่เหลือแสดงเป็นกลุ่มตามข้อความ)
      (Array.isArray(p.groups) ? p.groups : []).forEach(function (gid) {
        var g = sim[parseInt(String(gid).replace(/\D/g, ''), 10) - 1];
        if (!g || used[g.key] || (sys !== null && (g.sys || '') !== sys)) return;
        if (sys === null) sys = g.sys || '';
        used[g.key] = 1; g.list.forEach(function (t) { ids.push(t.id); });
      });
      return {
        name: String(p.name || '').trim(), part: String(p.part || '').trim(), cause: String(p.cause || '').trim(),
        prevention: String(p.prevention || '').trim(), type: types.indexOf(p.plan_type) >= 0 ? p.plan_type : '', ids: ids,
      };
    }).filter(function (p) { return p.name && p.ids.length; });
    hdRcAiPut(key, {
      at: new Date().toISOString(), n: base.length, overview: String(out.overview || '').trim(),
      overallPrevention: String(out.overall_prevention || '').trim(), problems: problems,
      maxAt: base.reduce(function (m, t) { return (t.createdAt || '') > m ? t.createdAt : m; }, ''),
    });
    window.hdRc.open = {};
  } catch (e) {
    _hdRcAi.err[key] = 'AI วิเคราะห์ไม่สำเร็จ: ' + ((e && e.message) || e);
  } finally {
    delete _hdRcAi.busy[key];
    hdRcRedraw();
  }
};
function hdRcOverviewHtml(text) {
  var clean = String(text || '').replace(/\r/g, '').trim();
  if (!clean) return '';
  var parts = clean
    .replace(/([.!?。])\s*/g, '$1\n')
    .split(/\n+|\s+(?=(?:และ(?:ปัญหา|การขอ|การแก้|การยกเลิก)|ควร|เนื่องจาก|ดังนั้น|ส่งผลให้))/)
    .map(function (x) { return x.replace(/^(?:[-•]\s*|\d+[.)]\s*)/, '').trim(); })
    .filter(Boolean);
  return '<ol class="hd-rc-ai-o">' + parts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
}

function hdRcPreventionHtml(text) {
  var steps = String(text || '').split(/\n+/).map(function (x) { return x.replace(/^(?:[-•]\s*|\d+[.)]\s*)/, '').trim(); }).filter(Boolean);
  if (!steps.length) return '';
  return '<details class="hd-rc-ai-summary hd-rc-ai-prevention">'
    + '<summary><span>💡 แนวทางป้องกันภาพรวม</span><span class="hd-rc-ai-toggle"></span></summary>'
    + '<ol class="hd-rc-ai-actions">'
    + steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('')
    + '</ol></details>';
}

// กล่องสรุปจาก AI ด้านบนรายการ (+ สั่งวิเคราะห์อัตโนมัติเมื่อยังไม่มีผลของตัวกรองชุดนี้)
function hdRcAiBox(base) {
  var key = hdRcAiKey(), R = hdRcAiStore()[key];
  if (!base.length) return '';
  if (_hdRcAi.busy[key]) return '<div class="hd-rc-ai"><div class="hd-rc-ai-h">⏳ AI กำลังวิเคราะห์ปัญหาซ้ำจาก ' + base.length + ' Ticket...</div>'
    + '<div class="hd-rc-ai-m">อาจใช้เวลาสักครู่ — ระหว่างนี้แสดงกลุ่มตามความคล้ายของข้อความไปก่อน</div></div>';
  var err = _hdRcAi.err[key];
  if (!R && !err) { setTimeout(window.hdRcAiRun, 0); return '<div class="hd-rc-ai"><div class="hd-rc-ai-h">⏳ AI กำลังเริ่มวิเคราะห์...</div></div>'; }
  var btn = '<button class="btn btn-ghost btn-sm" onclick="window.hdRcAiRun()">🔄 วิเคราะห์ใหม่</button>';
  if (!R) return '<div class="hd-rc-ai bad"><div class="hd-rc-ai-h">⚠️ ' + esc(err) + btn + '</div><div class="hd-rc-ai-m">แสดงกลุ่มตามความคล้ายของข้อความแทน</div></div>';
  var fresh = base.filter(function (t) { return (t.createdAt || '') > (R.maxAt || ''); }).length;
  return '<div class="hd-rc-ai">'
    + '<div class="hd-rc-ai-h">🤖 AI สรุปปัญหาซ้ำ' + btn + '</div>'
    + (R.overview ? '<details class="hd-rc-ai-summary" open><summary><span>ภาพรวม</span><span class="hd-rc-ai-toggle"></span></summary>' + hdRcOverviewHtml(R.overview) + '</details>' : '')
    + hdRcPreventionHtml(R.overallPrevention)
    + '<div class="hd-rc-ai-meta">'
    + '<span class="hd-rc-ai-stat">🕒 <span>วิเคราะห์เมื่อ</span> <strong>' + esc(hdDT(R.at)) + '</strong></span>'
    + '<span class="hd-rc-ai-stat">🎫 <strong>' + R.n + '</strong> <span>Ticket</span></span>'
    + '<span class="hd-rc-ai-stat">📌 <strong>' + R.problems.length + '</strong> <span>ปัญหาที่พบ</span></span>'
    + '</div>'
    + (fresh ? '<div class="hd-rc-ai-alert">● มี Ticket ใหม่หลังการวิเคราะห์ <strong>' + fresh + ' เรื่อง</strong> — ควรวิเคราะห์ใหม่เพื่ออัปเดตผล</div>' : '')
    + (err ? '<div class="hd-rc-ai-error">⚠️ ' + esc(err) + '</div>' : '')
    + '<div class="hd-rc-ai-note">ℹ️ ชื่อปัญหา สาเหตุ และแนวทางป้องกันสร้างโดย AI โปรดตรวจสอบความถูกต้องก่อนนำไปใช้</div>'
    + '</div>';
}


// แผนที่ผูกกับกลุ่ม: key ตรงกันก่อน ไม่มีค่อยดู Ticket ที่ซ้อนกัน
function hdRcPlanOf(g) {
  var P = window.HELPDESK_PROBLEMS || [], ids = {};
  g.list.forEach(function (t) { ids[t.id] = 1; });
  return P.find(function (p) { return p.groupKey === g.key; })
    || P.find(function (p) { return p.ticketIds.some(function (id) { return ids[id]; }); }) || null;
}
// Ticket ที่เกิดใหม่หลังบันทึกแผน (ปัญหาเดียวกันยังเกิดซ้ำไหม) — หัวข้อคล้ายชื่อปัญหา/Ticket ในแผน
function hdRcAfterPlan(p) {
  var known = {}, refs = [hdRcBig(p.title)];
  p.ticketIds.forEach(function (id) { known[id] = 1; });
  (window.HELPDESK_TICKETS || []).forEach(function (t) { if (known[t.id] && refs.length < 6) refs.push(hdRcBig(hdRcText(t))); });
  return (window.HELPDESK_TICKETS || []).filter(function (t) {
    if (t.status === 'cancelled' || (t.createdAt || '') <= p.createdAt) return false;
    if (known[t.id]) return true; // ถูกรวมเข้าแผนตอนแก้แผนครั้งหลัง = ปัญหาเดิมที่เกิดซ้ำ
    if (p.sourceSystem && hdRcSys(t) && hdRcSys(t) !== p.sourceSystem) return false;
    var B = hdRcBig(hdRcText(t));
    return refs.some(function (R) { return hdRcDice(B, R) >= 0.5; });
  });
}

function hdRcHtml() {
  var S = window.hdRc, canEdit = window.canEdit && window.canEdit('helpdesk');
  var all = hdRcBase(), groups = hdRcAiGroups(all);
  var sysOf = function (x) { return x || '(ไม่ระบุระบบ)'; };
  var rep = groups.filter(function (g) { return g.list.length >= S.min && !g.raw; });
  var raw = groups.filter(function (g) { return g.list.length >= S.min && g.raw; });
  // ระบบงาน: นับปัญหาซ้ำ/เรื่องต่อระบบ (ใช้ทำแถบตัวกรอง + ลำดับหัวข้อ) — เรียงเรื่องมากสุดก่อน
  var sysStat = {};
  rep.forEach(function (g) { var k = sysOf(g.sys), s = sysStat[k] || (sysStat[k] = { name: k, p: 0, n: 0 }); s.p++; s.n += g.list.length; });
  var sysOrder = Object.keys(sysStat).map(function (k) { return sysStat[k]; }).sort(function (a, b) { return b.n - a.n; });
  var sysRank = {}; sysOrder.forEach(function (s, i) { sysRank[s.name] = i; });
  if (S.sys && !sysStat[S.sys]) sysStat[S.sys] = { name: S.sys, p: 0, n: 0 };

  var base = S.sys ? all.filter(function (t) { return sysOf(hdRcSys(t)) === S.sys; }) : all;
  var vis = rep.filter(function (g) { return !S.sys || sysOf(g.sys) === S.sys; });
  var sorters = {
    n: function (a, b) { return b.list.length - a.list.length || b.hospN - a.hospN; },
    h: function (a, b) { return b.hospN - a.hospN || b.list.length - a.list.length; },
    rise: function (a, b) { return (b.b - b.a) - (a.b - a.a) || b.list.length - a.list.length; },
    recent: function (a, b) { return (b.last || '').localeCompare(a.last || ''); },
  };
  var sorter = sorters[S.sort] || sorters.n;
  vis.sort(function (a, b) { return sysRank[sysOf(a.sys)] - sysRank[sysOf(b.sys)] || sorter(a, b); }); // จัดเป็นหมวดตามระบบงาน
  var rawVis = raw.filter(function (g) { return !S.sys || sysOf(g.sys) === S.sys; }).sort(sorter);
  vis.concat(rawVis).forEach(function (g) { g.plan = hdRcPlanOf(g); });
  window._hdRcVis = vis.concat(rawVis); // index ของการ์ด: ปัญหาซ้ำก่อน ตามด้วยกลุ่มที่ AI ไม่นับ

  // ── ตัวเลือก ──
  function opts(list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  // เลือกระบบงาน — จำนวนในวงเล็บ = ปัญหาซ้ำของระบบนั้น
  var sysBar = sysOrder.length ? '<select class="t-sel" title="ระบบงาน" onchange="window.hdRcSet(\'sys\',this.value)">'
    + opts([['', '🖥️ ระบบงาน: ทั้งหมด (' + rep.length + ')']].concat(sysOrder.map(function (s) { return [s.name, s.name + ' (' + s.p + ')']; })), S.sys)
    + '</select>' : '';
  var ctrl = '<div class="hd-rc-ctrl">'
    + '<select class="t-sel hd-rc-days" title="ช่วงเวลาที่นำมาวิเคราะห์" onchange="window.hdRcSet(\'days\',+this.value)">' + opts(HD_RC_DAYS.map(function (d) { return [d[0], 'ช่วง: ' + d[1]]; }), S.days) + '</select>'
    + '<select class="t-sel" title="นับเป็นปัญหาซ้ำเมื่อเกิดตั้งแต่กี่ครั้ง" onchange="window.hdRcSet(\'min\',+this.value)">' + opts([[2, 'ซ้ำ ≥ 2 ครั้ง'], [3, 'ซ้ำ ≥ 3 ครั้ง'], [5, 'ซ้ำ ≥ 5 ครั้ง'], [10, 'ซ้ำ ≥ 10 ครั้ง']], S.min) + '</select>'
    + '<select class="t-sel hd-rc-cat" onchange="window.hdRcSet(\'cat\',this.value)">' + opts([['', 'หมวด: ทั้งหมด']].concat((window.HELPDESK_CATEGORIES || []).map(function (c) { return [c.id, c.name]; })), S.cat) + '</select>'
    + '<select class="t-sel hd-rc-sort" onchange="window.hdRcSet(\'sort\',this.value)">' + opts(HD_RC_SORT.map(function (s) { return [s[0], 'เรียง: ' + s[1]]; }), S.sort) + '</select>'
    + sysBar
    + '</div>';

  // ── KPI ──
  var inRep = vis.reduce(function (n, g) { return n + g.list.length; }, 0);
  var hs = {}; vis.forEach(function (g) { g.hosps.forEach(function (h) { if (h.id) hs[h.id] = 1; }); });
  var planned = vis.filter(function (g) { return g.plan; }).length;
  var overdue = (window.HELPDESK_PROBLEMS || []).filter(hdRcPlanOverdue).length;
  function kpi(icon, label, val, sub, accent, tip) {
    return '<div class="hd-kpi hd-acc-' + accent + '"><div class="hd-kpi-top"><span class="hd-kpi-icon">' + icon + '</span><span class="hd-kpi-lbl">' + esc(label) + window.calcTip(tip) + '</span></div>'
      + '<div class="hd-kpi-val">' + val + '</div><div class="hd-kpi-sub">' + esc(sub) + '</div></div>';
  }
  var kpis = '<div class="hd-kpi-grid hd-rc-kpis">'
    + kpi('🔁', 'กลุ่มปัญหาซ้ำ', vis.length, 'เกิดตั้งแต่ ' + S.min + ' ครั้งขึ้นไป', 'neu', 'จำนวนกลุ่มปัญหาที่มี Ticket ในช่วงนี้ตั้งแต่ ' + S.min + ' เรื่องขึ้นไป (ไม่นับที่ยกเลิก)')
    + kpi('🎫', 'Ticket ในกลุ่มซ้ำ', inRep, base.length ? 'คิดเป็น ' + Math.round(inRep / base.length * 100) + '% ของ ' + base.length + ' เรื่อง' : 'ไม่มี Ticket ในช่วงนี้', base.length && inRep / base.length >= 0.5 ? 'warn' : 'neu', 'ผลรวม Ticket ของทุกกลุ่มปัญหาซ้ำ ÷ Ticket ทั้งหมดในช่วงนี้ × 100\nยิ่งสูง = แก้ที่ต้นเหตุแล้วลดงานได้มาก')
    + kpi('🏥', 'รพ. ที่พบปัญหาซ้ำ', Object.keys(hs).length, 'จำนวน รพ. ไม่ซ้ำกัน', 'neu', 'จำนวนโรงพยาบาลที่มี Ticket อยู่ในกลุ่มปัญหาซ้ำอย่างน้อย 1 กลุ่ม')
    + kpi('📝', 'มีแผนจัดการแล้ว', planned + ' / ' + vis.length, !vis.length ? '-' : vis.length - planned ? 'ยังไม่มีแผน ' + (vis.length - planned) + ' กลุ่ม' : 'ครบทุกกลุ่ม', !vis.length ? 'neu' : planned === vis.length ? 'good' : planned ? 'warn' : 'bad', 'กลุ่มปัญหาซ้ำที่บันทึกสาเหตุ/แผนจัดการแล้ว ÷ กลุ่มปัญหาซ้ำทั้งหมด')
    + kpi('⏰', 'แผนเลยกำหนด', overdue, overdue ? 'ต้องติดตาม' : 'ไม่มี', overdue ? 'bad' : 'good', 'แผนทั้งหมด (ไม่ขึ้นกับช่วงเวลา) ที่เลยวันกำหนดเสร็จ และสถานะยังไม่ใช่ "ติดตามผล" หรือ "แก้ถาวรแล้ว"')
    + '</div>';

  // ── การ์ดกลุ่มปัญหา แบ่งหัวข้อตามระบบงาน ──
  var list = '', curSys = null;
  vis.slice(0, S.show).forEach(function (g, i) {
    var k = sysOf(g.sys);
    if (k !== curSys) {
      curSys = k;
      var st = sysStat[k] || { p: 0, n: 0 };
      list += '<div class="hd-rc-sec"><span>🖥️ ' + esc(k) + '</span><em>' + st.p + ' ปัญหา · ' + st.n + ' เรื่อง</em></div>';
    }
    list += hdRcCard(g, i, canEdit);
  });
  list = vis.length
    ? list + (vis.length > S.show ? '<div style="text-align:center;"><button class="btn btn-ghost btn-sm" onclick="window.hdRcMore()">แสดงเพิ่ม (เหลือ ' + (vis.length - S.show) + ' กลุ่ม)</button></div>' : '')
    : '<div class="hd-rc-empty">ไม่พบปัญหาที่เกิดซ้ำตั้งแต่ ' + S.min + ' ครั้งในช่วงนี้' + (S.min > 2 ? ' — ลองลดเกณฑ์ หรือขยายช่วงเวลา' : '') + '</div>';
  // เรื่องที่ข้อความคล้ายกันแต่ AI ไม่นับเป็นปัญหาซ้ำ (เช่น แจ้งเรื่องเดิมซ้ำ/ติดตามงาน/คำขอเฉพาะครั้ง) — พับไว้ กดดูได้
  if (rawVis.length) {
    list += '<button type="button" class="hd-rc-rawh" onclick="window.hdRcRawToggle()">' + (S.rawOpen ? '▾' : '▸')
      + ' 📎 เรื่องที่ข้อความคล้ายกันแต่ AI ไม่นับเป็นปัญหาซ้ำ <b>' + rawVis.length + ' กลุ่ม</b>'
      + '<em>มักเป็นเรื่องเดิมที่แจ้งซ้ำ ติดตามงาน หรือคำขอเฉพาะครั้ง — ไม่ได้ตั้งชื่อ/เสนอแนวทางป้องกัน</em></button>';
    if (S.rawOpen) rawVis.forEach(function (g, j) { list += hdRcCard(g, vis.length + j, canEdit); });
  }

  var planCount = (window.HELPDESK_PROBLEMS || []).length;
  var tabs = '<div class="hd-rc-tabs" role="tablist" aria-label="มุมมองปัญหาที่พบบ่อย">'
    + '<button type="button" role="tab" aria-selected="' + (S.view === 'issues') + '" class="' + (S.view === 'issues' ? 'on' : '') + '" onclick="window.hdRcView(\'issues\')"><span>🔁 ปัญหาที่พบ</span><b>' + vis.length + '</b></button>'
    + '<button type="button" role="tab" aria-selected="' + (S.view === 'plans') + '" class="' + (S.view === 'plans' ? 'on' : '') + '" onclick="window.hdRcView(\'plans\')"><span>📋 แผนจัดการ</span><b>' + planCount + '</b></button>'
    + '</div>';
  var headMeta = S.view === 'plans'
    ? planCount + ' แผนทั้งหมด'
    : base.length + ' Ticket ในช่วงนี้' + (S.sys ? ' · ' + esc(S.sys) : '');
  var content = S.view === 'plans'
    ? hdRcPlansHtml(canEdit)
    : hdRcAiBox(all) + kpis + '<div class="hd-rc-list">' + list + '</div>';

  return '<div class="hd-dash hd-rc">'
    + '<div class="hd-rc-toolbar"><div class="hd-dash-h">🔁 ปัญหาที่พบบ่อย <span>' + headMeta + '</span></div>'
    + tabs + (S.view === 'issues' ? ctrl : hdRcPlanFiltersHtml()) + '</div>'
    + content
    + '</div>';
}
window.hdRcRawToggle = function () { window.hdRc.rawOpen = !window.hdRc.rawOpen; hdRcRedraw(); };
// ดูปัญหาที่พบใน รพ. นั้น: เปิดการ์ด + กรองรายการ Ticket เฉพาะ รพ. (กดซ้ำ = ดูทั้งหมด)
window.hdRcHosp = function (i, h) {
  var g = (window._hdRcVis || [])[i]; if (!g) return;
  var S = window.hdRc;
  S.hf[g.key] = S.open[g.key] && S.hf[g.key] === h ? '' : h;
  S.open[g.key] = true;
  hdRcRedraw();
};

function hdRcHospName(id) { return id ? ((hdHosp(id) || {}).name || id) : 'ไม่ระบุ รพ.'; }

function hdRcCard(g, i, canEdit) {
  var S = window.hdRc, open = !!S.open[g.key], p = g.plan, n = g.list.length, d = g.b - g.a;
  var hf = open ? S.hf[g.key] || '' : '';
  var hk = function (h) { return h.id || '-'; }; // '-' = ไม่ระบุ รพ. ('' = ไม่กรอง)
  var hosp = function (h) { return '\'' + esc(hk(h)).replace(/'/g, '') + '\''; };
  var tTip = ' title="ครึ่งหลังของช่วง ' + g.b + ' เรื่อง · ครึ่งแรก ' + g.a + ' เรื่อง"';
  var trend = d > 0 ? '<span class="hd-pill hd-bad"' + tTip + '>▲ เพิ่มขึ้น</span>' : d < 0 ? '<span class="hd-pill hd-ok"' + tTip + '>▼ ลดลง</span>' : '';
  var chips = g.hosps.slice(0, 6).map(function (h) {
    var rep = h.n >= 2 && h.id;
    return '<button type="button" class="hd-rc-chip' + (rep ? ' rep' : '') + (hf === hk(h) ? ' on' : '') + '" title="ดูปัญหาที่พบที่ ' + esc(hdRcHospName(h.id)) + (rep ? ' (เกิดซ้ำ ' + h.n + ' ครั้ง)' : '') + '"'
      + ' onclick="event.stopPropagation();window.hdRcHosp(' + i + ',' + hosp(h) + ')">'
      + esc(hdRcHospName(h.id)) + (h.n > 1 ? ' <b>×' + h.n + '</b>' : '') + '</button>';
  }).join('') + (g.hosps.length > 6 ? '<span class="hd-rc-chip more">+' + (g.hosps.length - 6) + ' รพ.</span>' : '');
  var after = p ? hdRcAfterPlan(p).length : 0;
  var side = (p
    ? '<span class="hd-pill ' + hdRcPSt(p.status).cls + '">' + (hdRcPSt(p.status).icon || '') + ' ' + esc(hdRcPSt(p.status).label) + '</span>'
      + (hdRcPlanOverdue(p) ? '<span class="hd-pill hd-bad">เลยกำหนด</span>' : '')
      + (after ? '<span class="hd-pill hd-warn" title="Ticket ที่เกิดใหม่หลังบันทึกแผน">เกิดอีก ' + after + '</span>' : '')
    : (canEdit ? '<button class="btn btn-pri btn-sm" onclick="event.stopPropagation();window.hdRcPlanOpen(' + i + ')">📝 วางแผน</button>' : '<span class="hd-pill hd-neu">ยังไม่มีแผน</span>'))
    + '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.hdRcToggle(' + i + ')">' + (open ? '▴ ซ่อน' : '🔍 ดูปัญหาที่พบ') + '</button>';

  var body = '';
  if (open) {
    var planBox = p
      ? '<div class="hd-rc-plan">'
        + '<div class="hd-rc-plan-h"><b>📝 แผนจัดการ</b>'
        +   (hdRcPType(p.planType) ? '<span class="tag">' + esc(hdRcPType(p.planType).label) + '</span>' : '')
        +   (p.ownerId ? '<span>👤 ' + esc(hdStaffName(p.ownerId) || '-') + '</span>' : '')
        +   (p.dueDate ? '<span' + (hdRcPlanOverdue(p) ? ' class="bad"' : '') + '>📅 กำหนด ' + esc(hdRcDate(p.dueDate)) + '</span>' : '')
        +   (canEdit ? '<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="window.hdRcPlanOpen(' + i + ')">✏️ แก้แผน</button>' : '')
        + '</div>'
        + (p.rootCause ? '<div class="hd-rc-pf"><span>สาเหตุ</span><div>' + esc(p.rootCause) + '</div></div>' : '')
        + (p.actionPlan ? '<div class="hd-rc-pf"><span>แผนดำเนินการ</span><div>' + esc(p.actionPlan) + '</div></div>' : '')
        + (p.result ? '<div class="hd-rc-pf"><span>ผลลัพธ์ / ติดตามผล</span><div>' + esc(p.result) + '</div></div>' : '')
        + (after ? '<div class="hd-rc-pf warn"><span>⚠️ เกิดซ้ำหลังบันทึกแผน</span><div>' + after + ' เรื่อง (หลัง ' + esc(hdRcDate(p.createdAt)) + ')</div></div>' : '')
        + '</div>'
      : '';
    var aiBox = g.ai && (g.ai.cause || g.ai.prevention)
      ? '<div class="hd-rc-plan ai"><div class="hd-rc-plan-h"><b>🤖 AI วิเคราะห์</b>' + (g.ai.type && hdRcPType(g.ai.type) ? '<span class="tag">' + esc(hdRcPType(g.ai.type).label) + '</span>' : '') + '</div>'
        + (g.ai.cause ? '<div class="hd-rc-pf"><span>สาเหตุที่น่าจะเป็น</span><div>' + esc(g.ai.cause) + '</div></div>' : '')
        + (g.ai.prevention ? '<div class="hd-rc-pf"><span>แนวทางป้องกัน</span><div>' + esc(g.ai.prevention) + '</div></div>' : '')
        + '</div>'
      : '';
    var hospRows = g.hosps.map(function (h) {
      return '<div class="hd-wk-bar hd-rc-hb' + (hf === hk(h) ? ' on' : '') + '" title="ดูปัญหาที่พบที่ รพ. นี้" onclick="window.hdRcHosp(' + i + ',' + hosp(h) + ')"><div class="hd-wk-bar-l">' + esc(hdRcHospName(h.id)) + '</div><div class="hd-wk-bar-t"><div class="hd-wk-bar-f" style="width:' + Math.max(4, h.n / g.hosps[0].n * 100) + '%"></div></div><div class="hd-wk-bar-n"><b>' + h.n + '</b></div></div>';
    }).join('');
    var shown = hf ? g.list.filter(function (t) { return (t.hospitalId || '-') === hf; }) : g.list;
    var limited = shown.slice(0, 100), grouped = Object.create(null);
    limited.forEach(function (t) {
      var key = t.hospitalId || '-';
      (grouped[key] || (grouped[key] = [])).push(t);
    });
    var hospOrder = g.hosps.map(hk).filter(function (key) { return grouped[key]; });
    Object.keys(grouped).forEach(function (key) { if (hospOrder.indexOf(key) < 0) hospOrder.push(key); });
    function ticketRow(t) {
      var st = hdStatus(t.status), desc = String(t.description || '').trim();
      return '<tr onclick="window.hdOpen(\'' + t.id + '\')" title="เปิดดู Ticket">'
        + '<td><div class="hd-rc-no">' + esc(t.ticketNo) + '</div><div class="hd-wk-muted" style="white-space:nowrap">' + esc(hdRcDate(t.createdAt)) + '</div></td>'
        + (desc && t.subject && desc.indexOf(String(t.subject).trim()) !== 0 // หัวข้อไม่ใช่แค่ส่วนต้นของรายละเอียด → แสดงทั้งสอง
          ? '<td><div class="hd-rc-ts">' + esc(t.subject) + '</div><div class="hd-rc-td">' + esc(desc) + '</div></td>'
          : '<td><div class="hd-rc-ts hd-rc-tsf">' + esc(desc || t.subject || '-') + '</div></td>')
        + '<td><span class="hd-pill" style="color:' + st.color + ';background:' + hdHexA(st.color, .14) + '">' + st.icon + ' ' + esc(st.label) + '</span></td></tr>';
    }
    var rows = hospOrder.map(function (key) {
      var tickets = grouped[key];
      return '<tr class="hd-rc-hosp-group"><th colspan="3"><span>🏥 ' + esc(hdRcHospName(key === '-' ? '' : key)) + '</span><b>' + tickets.length + ' เรื่อง</b></th></tr>'
        + tickets.map(ticketRow).join('');
    }).join('');
    body = '<div class="hd-rc-body">' + planBox + aiBox
      + '<div class="hd-rc-cols">'
      +   '<div><div class="hd-rc-sub">🏥 พบที่ รพ. (' + g.hosps.length + ') <span>กดเพื่อดูเฉพาะ รพ.</span></div>' + hospRows + '</div>'
      +   '<div style="min-width:0"><div class="hd-rc-sub">🔍 ปัญหาที่พบ (' + shown.length + (hf ? ' จาก ' + n : '') + ')'
      +     (hf ? ' · ' + esc(hdRcHospName(hf === '-' ? '' : hf)) + ' <a href="javascript:void(0)" onclick="window.hdRcHosp(' + i + ',\'' + esc(hf).replace(/'/g, '') + '\')">แสดงทุก รพ.</a>' : '')
      +     (shown.length > 100 ? ' <span>แสดง 100 เรื่องล่าสุด</span>' : '') + '</div>'
      +     '<div class="hd-rc-tw"><table class="t-table hd-rc-tbl"><thead><tr><th>เลขที่</th><th>ปัญหาที่แจ้ง</th><th>สถานะ</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
      + '</div></div>';
  }

  return '<div class="hd-rc-card' + (open ? ' open' : '') + '">'
    + '<div class="hd-rc-head" onclick="window.hdRcToggle(' + i + ')">'
    +   '<div class="hd-rc-n"><b>' + n + '</b><span>เรื่อง</span></div>'
    +   '<div class="hd-rc-main">'
    +     '<div class="hd-rc-title">' + esc(p ? p.title : g.title) + '</div>'
    +     '<div class="hd-rc-meta">'
    +       (g.ai && g.ai.part ? '<span class="tag">🧩 ' + esc(g.ai.part) + '</span>' : '')
    +       (hdCat(g.catId) ? '<span class="tag">' + esc(hdCat(g.catId).name) + '</span>' : '')
    +       (g.raw && g.sys ? '<span>🖥️ ' + esc(g.sys) + '</span>' : '')
    +       '<span>🏥 ' + g.hospN + ' รพ.</span>'
    +       (g.openN ? '<span class="warn">ค้าง ' + g.openN + '</span>' : '')
    +       '<span>ล่าสุด ' + esc(hdRcAgo(g.last)) + '</span>'
    +       trend
    +     '</div>'
    +     '<div class="hd-rc-chips">' + chips + '</div>'
    +     (g.ai && g.ai.prevention && !p && !open ? '<div class="hd-rc-prev"><b>💡 แนวทางป้องกัน (AI):</b> ' + esc(g.ai.prevention.replace(/\s*\n\s*/g, ' · ')) + '</div>' : '')
    +   '</div>'
    +   '<div class="hd-rc-side">' + side + '</div>'
    + '</div>'
    + body
    + '</div>';
}

// ── ตารางแผนจัดการทั้งหมด (ไม่ขึ้นกับช่วงเวลา/ตัวกรองด้านบน) ──
function hdRcPlanFilterFns() {
  return {
    active: function (p) { return p.status !== 'done' && p.status !== 'monitoring'; },
    overdue: hdRcPlanOverdue,
    done: function (p) { return p.status === 'done' || p.status === 'monitoring'; },
    all: function () { return true; },
  };
}
function hdRcPlanFiltersHtml() {
  var S = window.hdRc, all = window.HELPDESK_PROBLEMS || [];
  var segs = [['active', 'ยังไม่เสร็จ'], ['overdue', 'เลยกำหนด'], ['done', 'เสร็จ / ติดตามผล'], ['all', 'ทั้งหมด']];
  var fns = hdRcPlanFilterFns();
  return '<div class="hd-per-seg hd-rc-plan-filters" role="group" aria-label="กรองแผนตามสถานะ">' + segs.map(function (s) {
    return '<button class="' + (S.pst === s[0] ? 'on' : '') + '" aria-pressed="' + (S.pst === s[0]) + '" onclick="window.hdRcSet(\'pst\',\'' + s[0] + '\')">' + s[1] + ' (' + all.filter(fns[s[0]]).length + ')</button>';
  }).join('') + '</div>';
}
function hdRcPlansHtml(canEdit) {
  var S = window.hdRc, all = window.HELPDESK_PROBLEMS || [];
  var fns = hdRcPlanFilterFns();
  var list = all.filter(fns[S.pst] || fns.active).sort(function (a, b) {
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  var rows = list.map(function (p) {
    var st = hdRcPSt(p.status), ty = hdRcPType(p.planType), after = hdRcAfterPlan(p).length;
    return '<tr' + (canEdit ? ' onclick="window.hdRcPlanEdit(\'' + p.id + '\')"' : '') + '>'
      + '<td><div class="hd-rc-pt">' + esc(p.title) + '</div><div class="hd-wk-muted">' + esc([(hdCat(p.categoryId) || {}).name, p.sourceSystem].filter(Boolean).join(' · ')) + '</div></td>'
      + '<td>' + (ty ? esc(ty.label) : '-') + '</td>'
      + '<td>' + esc(hdStaffName(p.ownerId) || '-') + '</td>'
      + '<td' + (hdRcPlanOverdue(p) ? ' class="hd-rc-od"' : '') + ' style="white-space:nowrap">' + (p.dueDate ? esc(hdRcDate(p.dueDate)) : '-') + '</td>'
      + '<td><span class="hd-pill ' + st.cls + '">' + (st.icon || '') + ' ' + esc(st.label) + '</span></td>'
      + '<td style="white-space:nowrap">' + p.ticketIds.length + ' เรื่อง · ' + p.hospitalIds.length + ' รพ.' + (after ? '<div><span class="hd-pill hd-warn">เกิดอีก ' + after + '</span></div>' : '') + '</td>'
      + '<td class="hd-wk-muted" style="white-space:nowrap">' + esc(hdRcAgo(p.updatedAt)) + '</td></tr>';
  }).join('');
  return '<div class="ov-card hd-rc-plans">'
    + '<div class="hd-rc-plans-h"><div class="ov-card-title" style="margin:0;">📋 แผนจัดการปัญหา' + window.calcTip('แผนทั้งหมดที่บันทึกไว้ (ไม่ขึ้นกับช่วงเวลา/ตัวกรองด้านบน)\nเกิดอีก = Ticket ปัญหาเดียวกันที่เข้ามาใหม่หลังบันทึกแผน — ใช้ดูว่าแผนได้ผลหรือยัง') + '</div></div>'
    + '<div style="overflow-x:auto;"><table class="t-table hd-rc-tbl" style="min-width:820px;"><thead><tr><th>ปัญหา</th><th>แนวทาง</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>สถานะ</th><th>ขอบเขต</th><th>อัปเดต</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="7" class="hd-rc-plans-empty">' + (all.length ? 'ไม่มีแผนในสถานะนี้' : 'ยังไม่มีแผน — กลับไปที่แท็บ “ปัญหาที่พบ” แล้วกด “📝 วางแผน”') + '</td></tr>')
    + '</tbody></table></div></div>';
}

// ── หน้าต่างบันทึกแผน ──
window.hdRcPlanOpen = function (i) {
  var g = (window._hdRcVis || [])[i]; if (!g) return;
  hdRcPlanModal(g, g.plan || hdRcPlanOf(g));
};
window.hdRcPlanEdit = function (id) {
  var p = (window.HELPDESK_PROBLEMS || []).find(function (x) { return x.id === id; });
  if (p) hdRcPlanModal(null, p);
};
function hdRcPlanTickets(c) {
  if (c.g) return c.g.list;
  var ids = {}; c.plan.ticketIds.forEach(function (id) { ids[id] = 1; });
  return (window.HELPDESK_TICKETS || []).filter(function (t) { return ids[t.id]; });
}
function hdRcPlanModal(g, p) {
  window._hdRcCtx = { g: g, plan: p };
  var ai = (!p && g && g.ai) || {}; // แผนใหม่จากผลสรุป AI → เติมสาเหตุ/แนวทาง/แผนให้ตั้งต้น
  var tickets = hdRcPlanTickets(window._hdRcCtx);
  var hs = {}; tickets.forEach(function (t) { if (t.hospitalId) hs[t.hospitalId] = 1; });
  var catId = g ? g.catId : p.categoryId, sys = g ? g.sys : p.sourceSystem;
  var title = p ? p.title : g.title;
  function sel(list, cur) { return list.map(function (o) { return '<option value="' + o.id + '"' + (cur === o.id ? ' selected' : '') + '>' + (o.icon ? o.icon + ' ' : '') + esc(o.label) + '</option>'; }).join(''); }
  document.getElementById('m-hd-prob-title').textContent = p ? 'แผนจัดการปัญหา' : 'วิเคราะห์ & วางแผนจัดการปัญหา';
  document.getElementById('m-hd-prob-del').style.display = p ? '' : 'none';
  document.getElementById('m-hd-prob-body').innerHTML =
    '<div class="hdp-info">🎫 ' + tickets.length + ' เรื่อง · 🏥 ' + Object.keys(hs).length + ' รพ.'
    + (hdCat(catId) ? ' · ' + esc(hdCat(catId).name) : '') + (sys ? ' · 🖥️ ' + esc(sys) : '')
    + (tickets.length ? ' · ' + esc(hdRcDate(tickets[tickets.length - 1].createdAt)) + ' – ' + esc(hdRcDate(tickets[0].createdAt)) : '')
    + (g && p ? '<div class="hdp-note">กดบันทึกแล้ว Ticket ใหม่ของกลุ่มนี้จะถูกผูกเข้ากับแผนด้วย</div>' : '')
    + '</div>'
    + '<div class="f-grid">'
    + '<div class="f-group" style="grid-column:span 2"><label class="f-label">ชื่อปัญหา <span class="hd-req">*</span></label><input id="hdp-title" class="f-input" value="' + esc(title) + '" placeholder="เช่น พิมพ์ใบสั่งยาไม่ออกหลังอัปเดตเวอร์ชัน"></div>'
    + '<div class="f-group" style="grid-column:span 2"><label class="f-label">สาเหตุ / ผลการวิเคราะห์ <a href="javascript:void(0)" class="hd-ai-link" id="hdp-ai" onclick="window.hdRcPlanAi()">🤖 ให้ AI ช่วยวิเคราะห์</a></label>'
    +   '<textarea id="hdp-cause" class="f-input" rows="3" placeholder="ทำไมจึงเกิดซ้ำ เช่น ตั้งค่าเครื่องพิมพ์ไม่ตรงหลังลงเวอร์ชันใหม่, ผู้ใช้ใหม่ยังไม่ได้อบรม">' + esc(p ? p.rootCause : ai.cause || '') + '</textarea></div>'
    + '<div class="f-group"><label class="f-label">แนวทางจัดการ</label><select id="hdp-type" class="f-input"><option value="">— เลือก —</option>' + sel(window.HD_PROB_TYPE || [], p ? p.planType : ai.type || '') + '</select></div>'
    + '<div class="f-group"><label class="f-label">สถานะ</label><select id="hdp-status" class="f-input">' + sel(window.HD_PROB_STATUS || [], p ? p.status : 'analyzing') + '</select></div>'
    + '<div class="f-group" style="grid-column:span 2"><label class="f-label">แผนดำเนินการ</label>'
    +   '<textarea id="hdp-plan" class="f-input" rows="4" placeholder="1. ...&#10;2. ...">' + esc(p ? p.actionPlan : ai.prevention || '') + '</textarea></div>'
    + '<div class="f-group"><label class="f-label">ผู้รับผิดชอบ</label>' + hdStaffComboMarkup('hdp-owner', 'f-input', false, '— เลือกผู้รับผิดชอบ — (พิมพ์ค้นหาชื่อ)') + '</div>'
    + '<div class="f-group"><label class="f-label">กำหนดเสร็จ</label><input id="hdp-due" type="date" class="f-input" value="' + esc(p && p.dueDate ? String(p.dueDate).slice(0, 10) : '') + '"></div>'
    + '<div class="f-group" style="grid-column:span 2"><label class="f-label">ผลลัพธ์ / ติดตามผล</label>'
    +   '<textarea id="hdp-result" class="f-input" rows="2" placeholder="ทำแล้วได้ผลอย่างไร ยังเกิดซ้ำไหม">' + esc(p ? p.result : '') + '</textarea></div>'
    + '</div>';
  window._initHdStaffCombobox('hdp-owner', p ? p.ownerId : '');
  if (!p && g && g.ai) ['hdp-title', 'hdp-cause', 'hdp-type', 'hdp-plan'].forEach(function (id) { var el = document.getElementById(id); if (el && el.value) window.aiFlagField(el, true); }); // ค่าตั้งต้นจากผลสรุป AI
  window.openM('m-hd-prob');
}

window.hdRcPlanSave = async function () {
  var c = window._hdRcCtx; if (!c) return;
  var v = function (id) { return ((document.getElementById(id) || {}).value || '').trim(); };
  var title = v('hdp-title');
  if (!title) { window.showAlert('กรุณาระบุชื่อปัญหา', 'warn'); return; }
  var p = c.plan, g = c.g, now = new Date().toISOString(), uid = (window.cu && window.cu.id) || '';
  var ids = p ? p.ticketIds.slice() : [];
  if (g) g.list.forEach(function (t) { if (ids.indexOf(t.id) < 0) ids.push(t.id); });
  var known = {}; ids.forEach(function (id) { known[id] = 1; });
  var hids = p ? p.hospitalIds.slice() : [];
  (window.HELPDESK_TICKETS || []).forEach(function (t) { if (known[t.id] && t.hospitalId && hids.indexOf(t.hospitalId) < 0) hids.push(t.hospitalId); });
  var id = p ? p.id : 'HP' + Date.now() + Math.floor(Math.random() * 1000);
  var row = {
    group_key: g ? g.key : p.groupKey, title: title,
    category_id: g ? g.catId : p.categoryId, source_system: g ? g.sys : p.sourceSystem,
    ticket_ids: ids, hospital_ids: hids,
    root_cause: v('hdp-cause'), plan_type: v('hdp-type'), action_plan: v('hdp-plan'),
    owner_id: v('hdp-owner'), due_date: v('hdp-due') || null, status: v('hdp-status') || 'analyzing', result: v('hdp-result'),
    created_by: p ? p.createdBy : uid, updated_by: uid,
    created_at: p ? p.createdAt : now, updated_at: now,
  };
  var btn = document.getElementById('m-hd-prob-save');
  if (btn) btn.disabled = true;
  try {
    await window.setDoc(window.getDocRef('HELPDESK_PROBLEMS', id), row);
    var obj = window.hdProbFromRow(Object.assign({ id: id }, row));
    window.HELPDESK_PROBLEMS = [obj].concat((window.HELPDESK_PROBLEMS || []).filter(function (x) { return x.id !== id; }));
    window.closeM('m-hd-prob');
    window.showAlert('บันทึกแผนจัดการปัญหาแล้ว', 'success');
    hdRcRedraw();
  } catch (e) {
    window.showAlert('บันทึกไม่สำเร็จ: ' + ((e && e.message) || e), 'error');
  } finally { if (btn) btn.disabled = false; }
};

window.hdRcPlanDelete = function () {
  var p = window._hdRcCtx && window._hdRcCtx.plan; if (!p) return;
  window.showConfirm('ลบแผน "' + p.title + '" ?', async function () {
    try {
      await window.deleteDoc(window.getDocRef('HELPDESK_PROBLEMS', p.id));
      window.HELPDESK_PROBLEMS = (window.HELPDESK_PROBLEMS || []).filter(function (x) { return x.id !== p.id; });
      window.closeM('m-hd-prob');
      window.showAlert('ลบแผนแล้ว', 'success');
      hdRcRedraw();
    } catch (e) { window.showAlert('ลบไม่สำเร็จ: ' + ((e && e.message) || e), 'error'); }
  });
};

// ── AI ช่วยวิเคราะห์สาเหตุร่วม + เสนอแผน จาก Ticket ในกลุ่ม (+ วิธีแก้ที่บันทึกในคลังความรู้) ──
var HD_RC_AI_PROMPT =
  'คุณเป็นหัวหน้าทีม Helpdesk ของบริษัทซอฟต์แวร์โรงพยาบาล ได้รับกลุ่มปัญหาที่ลูกค้าแจ้งเข้ามาซ้ำ ๆ ' +
  'ให้วิเคราะห์สาเหตุร่วม (root cause) และเสนอแผนป้องกันไม่ให้เกิดซ้ำ ' +
  'ตอบ "เฉพาะ JSON" (ไม่มีข้อความอื่น ไม่มี markdown) รูปแบบ: ' +
  '{"title":"<ชื่อปัญหาสั้น ๆ ภาษาไทย>",' +
  '"root_cause":"<สาเหตุที่น่าจะเป็น พร้อมหลักฐานจากข้อมูล เช่น เกิดกับ รพ. ไหน ระบบไหน ช่วงไหน 2–4 ประโยค>",' +
  '"plan_type":"fix|config|training|manual|dev|monitor",' +
  '"action_plan":"<แผนเป็นข้อ 1. 2. 3. ที่ทำได้จริง ขึ้นบรรทัดใหม่ทุกข้อ>"}. ' +
  'fix=แก้ Bug/ข้อมูลถาวร, config=ปรับตั้งค่า, training=อบรมผู้ใช้, manual=ทำคู่มือ/FAQ, dev=ส่งทีมพัฒนา, monitor=เฝ้าระวัง. ' +
  'ห้ามแต่งข้อเท็จจริงที่ไม่มีในข้อมูล ถ้าข้อมูลไม่พอให้ระบุในแผนว่าต้องเก็บข้อมูลอะไรเพิ่ม';
window.hdRcPlanAi = async function () {
  var c = window._hdRcCtx; if (!c) return;
  var link = document.getElementById('hdp-ai');
  if (link && link.dataset.busy) return;
  if (link) { link.dataset.busy = '1'; link.textContent = '⏳ กำลังวิเคราะห์...'; }
  try {
    var tickets = hdRcPlanTickets(c), ids = {};
    tickets.forEach(function (t) { ids[t.id] = 1; });
    var fixes = {};
    try { (await window.hdKbFetch()).forEach(function (k) { if (ids[k.ticketId]) fixes[k.ticketId] = k.fix; }); } catch (e) {}
    var hc = {};
    tickets.forEach(function (t) { var nm = hdRcHospName(t.hospitalId); hc[nm] = (hc[nm] || 0) + 1; });
    var catId = c.g ? c.g.catId : c.plan.categoryId, sys = c.g ? c.g.sys : c.plan.sourceSystem;
    var user = 'จำนวน ' + tickets.length + ' เรื่อง จาก ' + Object.keys(hc).length + ' รพ.'
      + (hdCat(catId) ? ' · หมวด ' + hdCat(catId).name : '') + (sys ? ' · ระบบ ' + sys : '')
      + '\nรพ. ที่พบ: ' + Object.keys(hc).sort(function (a, b) { return hc[b] - hc[a]; }).map(function (k) { return k + ' ×' + hc[k]; }).join(', ')
      + '\n\nรายการปัญหา (ใหม่ → เก่า):\n'
      + tickets.slice(0, 25).map(function (t, i) {
          return (i + 1) + ') [' + hdRcDate(t.createdAt) + '] [' + hdRcHospName(t.hospitalId) + '] '
            + (t.subject || '') + ' — ' + String(t.description || '').replace(/\s+/g, ' ').slice(0, 160)
            + (fixes[t.id] ? '\n   วิธีแก้ที่ใช้: ' + String(fixes[t.id]).replace(/\s+/g, ' ').slice(0, 160) : '');
        }).join('\n');
    var out = await window.aiChatJson(HD_RC_AI_PROMPT, user, { maxTokens: 900 });
    var put = { 'hdp-title': String(out.title || '').trim(), 'hdp-cause': String(out.root_cause || '').trim(), 'hdp-plan': String(out.action_plan || '').trim() };
    var typeOk = (window.HD_PROB_TYPE || []).some(function (x) { return x.id === out.plan_type; });
    var apply = function (replace) {
      Object.keys(put).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && put[id] && (replace || !el.value.trim())) { el.value = put[id]; window.aiFlagField && window.aiFlagField(el, true); }
      });
      var ty = document.getElementById('hdp-type');
      if (ty && typeOk && (replace || !ty.value)) ty.value = out.plan_type;
    };
    var filled = ['hdp-cause', 'hdp-plan'].some(function (id) { var el = document.getElementById(id); return el && el.value.trim(); });
    if (!filled) apply(false);
    else {
      apply(false);
      window.showConfirm('AI วิเคราะห์เสร็จแล้ว แต่ช่องสาเหตุ/แผนมีข้อความเดิมอยู่ — แทนที่ด้วยผลจาก AI ไหม?', function () { apply(true); },
        { icon: '🤖', title: 'ผลวิเคราะห์จาก AI', okText: 'แทนที่' });
    }
  } catch (e) {
    window.showAlert('AI วิเคราะห์ไม่สำเร็จ: ' + ((e && e.message) || e), 'error');
  } finally {
    if (link) { delete link.dataset.busy; link.textContent = '🤖 ให้ AI ช่วยวิเคราะห์'; }
  }
};
