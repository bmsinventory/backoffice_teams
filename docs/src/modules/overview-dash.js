/* ================================================================
   OVERVIEW-DASH.JS — แดชบอร์ด Overview
   พยากรณ์ (เลื่อนเวลา) · KPI วันนี้ · กราฟ 3D · ภาระงานรายบุคคล (รูปคน) · popup รายละเอียดเมื่อกดกราฟ
   renderOverview() ใน overview.js คำนวณตัวกรองแล้วเรียก window.ovDash.render(ctx)
   กราฟ: ECharts (+ ECharts-GL สำหรับวงแหวน/แท่ง 3D จริง) โหลดตอนใช้ผ่าน LibLoader · ไม่มี WebGL → วาด 2D
================================================================ */
(function () {
  var DAY = 86400000;
  var MS = window.THMON_SHORT;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.esc(s); };
  var fc = function (n) { return window.fc(n); };
  var fd = function (s) { return window.fd(s); };
  var pd = function (s) { return window.pd(s); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var S = { wTab: lsGet('ov_wtab') || 'watch', mode3d: lsGet('ov_3d') !== '0', rotate: !reduceMotion, scen: 'base', sel: null, selKey: '', pView: lsGet('ov_pview') === 'matrix' ? 'matrix' : 'people', pMonth: null, pDept: lsGet('ov_pdept') || '', timer: null };
  var D = null, charts = {}, CLICK = {}, hasGL = false, glTried = false, libState = 0, libP = null, ro = null, wired = false;

  // ── สถานการณ์พยากรณ์: เดือนที่ปิดโครงการเทียบกับเดือนที่สิ้นสุด (lag, สัดส่วน) + ตัวคูณยอดขายใหม่ ──
  var SCEN = {
    low:  { lab: 'ระวัง',     out: 0.75, split: [[1, .4], [2, .3], [3, .3]], txt: 'ปิดช้ากว่าวันสิ้นสุด 1–3 เดือน และยอดขายใหม่ลดลง 25%' },
    base: { lab: 'คาดการณ์', out: 1,    split: [[1, .7], [2, .3]],           txt: 'ปิดหลังวันสิ้นสุด 1–2 เดือน และยอดขายใหม่เท่าค่าเฉลี่ยปีนี้' },
    push: { lab: 'เร่งปิดงาน', out: 1.15, split: [[0, 1]],                  txt: 'ปิดตรงเดือนที่สิ้นสุด (งานค้างปิดเดือนนี้) และยอดขายใหม่เพิ่ม 15%' },
  };
  var HL = { ok: { l: 'ปกติ', c: '--teal', k: 'ok' }, risk: { l: 'เสี่ยง', c: '--amber', k: 'warn' }, late: { l: 'ล่าช้า', c: '--coral', k: 'crit' }, done: { l: 'เสร็จ', c: '--txt3', k: 'mut' } };

  /* ───────── helpers ───────── */
  function C(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#9ba3b8'; }
  function col(c) { return c && c.indexOf('--') === 0 ? C(c) : (c || '#9ba3b8'); }
  function shade(c, amt) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || ''); if (!m) return c;
    var h = m[1]; if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(h, 16), f = function (v) { return Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt); };
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function rgba(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c;
    var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function fmtM(n) {
    n = n || 0; var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + '฿' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1e3) return s + '฿' + Math.round(a / 1e3) + 'K';
    return s + '฿' + Math.round(a);
  }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function sevOf(r) { return r < .5 ? 'crit' : (r < .85 ? 'warn' : 'ok'); }
  function memsOf(p) { return Array.from(new Set((p.members && p.members.length ? p.members.map(function (m) { return m.sid; }) : (p.team || [])).filter(Boolean))); }
  function nick(sid) { var s = D && D.staffIdx.get(sid); return s ? (s.nickname || (s.name || '').split(' ')[0]) : ''; }
  function healthOf(p, today) { return window.projectHealth(p, today).k; }
  function lvOf(v) { return v >= 4 ? { c: '--coral', l: 'เกินกำลัง' } : v === 3 ? { c: '--amber', l: 'เต็มมือ' } : v >= 1 ? { c: '--sky', l: 'ปกติ' } : { c: '--teal', l: 'ว่าง' }; }
  function canSee(m) { return !window.canView || window.canView(m); }
  function webgl() { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } }

  /* ───────── data model ───────── */
  function build(ctx) {
    var today = ctx.now, curY = today.getFullYear();
    var yrBE = Number(ctx.yr) || (curY + 543), Y = yrBE - 543;
    var NOW = Y === curY ? today.getMonth() : (Y < curY ? 12 : 0);
    var N = Y === curY ? 18 : 12; // ปีปัจจุบัน → มองไปข้างหน้าถึง มิ.ย. ปีถัดไป
    var inF = function (p) { return p.status !== 'cancelled' && (!ctx.grp.length || ctx.grp.includes(p.groupId)) && (!ctx.typ.length || ctx.typ.includes(p.typeId)); };
    var all = (window.PROJECTS || []).filter(inF);
    var mIdx = function (s) { var d = pd(s); return (d.getFullYear() - Y) * 12 + d.getMonth(); };
    var staffIdx = new Map(); (window.STAFF || []).forEach(function (s) { if (!staffIdx.has(s.id)) staffIdx.set(s.id, s); });

    // ── การเงิน: โครงการที่เริ่มในปีที่เลือก (+ ปีถัดไปเมื่อมองล่วงหน้า) ──
    var fin = all.filter(function (p) { var y = Number(window.getYearBE(p.start)); return y === yrBE || (N > 12 && y === yrBE + 1); });
    var signed = zeros(N), closedA = zeros(N), closedL = [], pipe = [];
    fin.forEach(function (p) {
      var cost = Number(p.cost) || 0, si = p.start ? mIdx(p.start) : -1;
      if (si >= 0 && si < N) signed[si] += cost;
      if (p.stage === 'close') {
        var ci = p.end ? mIdx(p.end) : si; if (ci < 0) ci = 0;
        if (Y === curY && ci > NOW) ci = NOW; // ปิดก่อนวันสิ้นสุด → นับเดือนนี้
        if (ci < N) { closedA[ci] += cost; (closedL[ci] || (closedL[ci] = [])).push(p); }
      } else {
        var e = p.end ? mIdx(p.end) : si + 1; if (e < NOW) e = NOW;
        pipe.push({ e: e, cost: cost, p: p });
      }
    });
    var tgtOf = function (y) {
      var en = (window.YEAR_TARGETS || []).find(function (t) { return String(t.year) === String(y); });
      if (!en || !en.byType) return 0;
      return Object.keys(en.byType).reduce(function (s, tid) { return s + ((!ctx.typ.length || ctx.typ.includes(tid)) ? (Number(en.byType[tid]) || 0) : 0); }, 0);
    };
    var tY = tgtOf(yrBE), tN = tgtOf(yrBE + 1), tNA = !(tN > 0); if (tNA) tN = tY;
    var tgtCum = []; for (var i = 0; i < N; i++) tgtCum[i] = i < 12 ? tY / 12 * (i + 1) : tY + tN / 12 * (i - 11);
    var pastN = Math.min(NOW, 12), avgSigned = pastN ? sum(signed.slice(0, pastN)) / pastN : 0;
    function fcast(k) {
      var sc = SCEN[k], cl = closedA.slice(), out = signed.slice(), j;
      pipe.forEach(function (x) { sc.split.forEach(function (s) { var m = x.e + s[0]; if (m < N) cl[m] += x.cost * s[1]; }); });
      for (j = NOW + 1; j < N; j++) {
        var f = avgSigned * sc.out;
        if (f > signed[j]) { var add = f - signed[j]; out[j] = f; sc.split.forEach(function (s) { var m = j + 3 + s[0]; if (m < N) cl[m] += add * s[1]; }); }
      }
      var lo = cl.slice(), hi = cl.slice();
      for (j = NOW; j < N; j++) { var u = .07 * (j - NOW + 1); lo[j] = cl[j] * (1 - u); hi[j] = cl[j] * (1 + u); }
      var cum = [], cLo = [], cHi = [], cOut = [], back = [], a = 0, l = 0, h = 0, o = 0;
      for (j = 0; j < N; j++) { a += cl[j]; l += lo[j]; h += hi[j]; o += out[j]; cum[j] = a; cLo[j] = l; cHi[j] = h; cOut[j] = o; back[j] = o - a; }
      return { closed: cl, out: out, cum: cum, cLo: cLo, cHi: cHi, cOut: cOut, back: back };
    }
    var FC = { low: fcast('low'), base: fcast('base'), push: fcast('push') };

    // ── ภาระงาน: โครงการที่ช่วงวันเริ่ม–สิ้นสุดคาบเกี่ยวกับเดือน (ทั้งรายประเภทและรายคน) ──
    var mS = [], mE = []; for (i = 0; i < N; i++) { mS[i] = new Date(Y, i, 1); mE[i] = new Date(Y, i + 1, 0, 23, 59, 59); }
    var wl = zeros(N), wlType = {}, wlP = [], staffCnt = new Map();
    all.forEach(function (p) {
      if (!p.start || !p.end) return;
      var ps = pd(p.start), pe = pd(p.end), ms = memsOf(p);
      for (var k = 0; k < N; k++) {
        if (ps <= mE[k] && pe >= mS[k]) {
          wl[k]++; (wlType[p.typeId] || (wlType[p.typeId] = zeros(N)))[k]++; (wlP[k] || (wlP[k] = [])).push(p);
          ms.forEach(function (sid) { var a = staffCnt.get(sid); if (!a) { a = zeros(N); staffCnt.set(sid, a); } a[k]++; });
        }
      }
    });
    var staff = (window.STAFF || []).filter(function (s) { return s.active; }).map(function (s) { return { s: s, cnt: staffCnt.get(s.id) || zeros(N) }; });
    var m0 = Y === curY ? today.getMonth() : (Y < curY ? 11 : 0);
    var overAt = function (k) { return staff.filter(function (x) { return x.cnt[k] > 3; }).length; };
    var freeAt = function (k) { return staff.filter(function (x) { return x.cnt[k] === 0; }).length; };

    // ── Adv. ──
    var isOverAdv = function (a) { return (a.status === 'disbursed' || a.status === 'clearing') && a.ddate && pd(a.ddate) < today; };
    var advOpen = (ctx.fAdvs || []).filter(function (a) { return a.status !== 'cleared'; });
    var advGroups = (window.AFLW || []).filter(function (f) { return f.id !== 'cleared'; }).map(function (f) {
      return { n: f.label, c: f.color, items: advOpen.filter(function (a) { return a.status === f.id && !isOverAdv(a); }) };
    });
    advGroups.push({ n: 'เลยกำหนด', c: '--coral', items: advOpen.filter(isOverAdv), over: true });

    // ── Helpdesk ──
    var canHd = canSee('helpdesk');
    var openSt = {}; (window.HD_STATUS || []).forEach(function (s) { openSt[s.id] = s.open !== false; });
    var nowTs = Date.now();
    var tickets = canHd ? (window.HELPDESK_TICKETS || []).filter(function (t) { return openSt[t.status]; }) : [];
    var breached = function (t) { return t.resolutionBreached || (t.resolutionDue && new Date(t.resolutionDue).getTime() < nowTs); };
    var hd = (window.HD_PRIORITY || []).map(function (pr) {
      var it = tickets.filter(function (t) { return t.priority === pr.id; });
      return { id: pr.id, n: pr.label, c: pr.color, items: it, br: it.filter(breached).length };
    });

    // ── สุขภาพโครงการ ──
    var openP = ctx.fProjs.filter(function (p) { return healthOf(p, today) !== 'done'; });
    var donePending = ctx.fProjs.filter(function (p) { return p.stage !== 'close' && p.status !== 'cancelled' && (p.progress === 100 || p.status === 'completed' || (p.end && pd(p.end) < today)); });

    // ── ศูนย์รวมสิ่งที่ต้องจัดการ ──
    var acts = [];
    var advOver = advGroups[advGroups.length - 1].items;
    if (advOver.length) acts.push({ sev: 'crit', n: 'Adv. เลยกำหนดเคลียร์', m: advOver.length + ' รายการ รวม ' + fc(sum(advOver.map(function (a) { return a.amount || 0; }))), v: advOver.length, open: function () { advModal(advGroups.length - 1); } });
    var late = openP.filter(function (p) { return healthOf(p, today) === 'late'; });
    if (late.length) acts.push({ sev: 'crit', n: 'โครงการเลยวันสิ้นสุด', m: esc(late[0].name) + (late.length > 1 ? ' และอีก ' + (late.length - 1) + ' โครงการ' : ''), v: late.length, open: function () { healthModal('late'); } });
    var hdBr = tickets.filter(breached);
    if (hdBr.length) acts.push({ sev: 'crit', n: 'Helpdesk เกิน SLA', m: hd.filter(function (h) { return h.br; }).map(function (h) { return h.n + ' ' + h.br; }).join(' · '), v: hdBr.length, open: function () { ticketModal('เกิน SLA', hdBr); } });
    if (canSee('lodging')) {
      var d30 = new Date(today.getTime() + 30 * DAY);
      var lodg = openP.filter(function (p) {
        if (!p.start || pd(p.start) < today || pd(p.start) > d30) return false;
        var l = (window.LODGINGS || []).filter(function (x) { return x.pid === p.id; });
        return l.length && !l.some(function (x) { return x.approvedDaily === 'yes' || x.approvedMonthly === 'yes'; });
      });
      if (lodg.length) acts.push({ sev: 'warn', n: 'ที่พักยังไม่อนุมัติ', m: 'โครงการที่เริ่มภายใน 30 วัน', v: lodg.length, open: function () { listModal('ที่พักยังไม่อนุมัติ', 'โครงการที่เริ่มภายใน 30 วัน', '--amber', lodg.map(projRow), 'lodging'); } });
    }
    var advPend = advOpen.filter(function (a) { return a.status === 'pending'; });
    if (advPend.length) acts.push({ sev: 'warn', n: 'Adv. รออนุมัติ', m: 'รวม ' + fc(sum(advPend.map(function (a) { return a.amount || 0; }))), v: advPend.length, open: function () { advModal(advGroups.findIndex(function (g) { return g.n === ((window.AFLW || []).find(function (f) { return f.id === 'pending'; }) || {}).label; })); } });
    if (canSee('impl_tracker') && window.imtIsOverdue) {
      var od = (window.IMPL_TASKS || []).filter(window.imtIsOverdue);
      if (od.length) acts.push({ sev: 'warn', n: 'งานติดตั้งเกินกำหนด', m: 'ใน ' + new Set(od.map(function (t) { return t.projectId; })).size + ' โครงการ (ติดตามสถานะโครงการ)', v: od.length, view: 'impl_tracker' });
    }
    if (canSee('leave')) {
      var lv = (window.LEAVES || []).filter(function (l) { return l.status === 'pending'; });
      if (lv.length) acts.push({ sev: 'info', n: 'ใบลารออนุมัติ', m: lv.slice(0, 3).map(function (l) { return nick(l.staffId); }).filter(Boolean).join(', '), v: lv.length, view: 'leave' });
    }

    var yrFrac = Y === curY ? (today - new Date(Y, 0, 1)) / (new Date(Y + 1, 0, 1) - new Date(Y, 0, 1)) : (Y < curY ? 1 : 0);
    var annual = (window.PROJECTS || []).filter(function (p) { return Number(window.getYearBE(p.start)) === yrBE && (!ctx.grp.length || ctx.grp.includes(p.groupId)); });

    return {
      ctx: ctx, today: today, Y: Y, yrBE: yrBE, NOW: NOW, N: N, curY: curY, yrFrac: yrFrac, staffIdx: staffIdx,
      signed: signed, closedA: closedA, closedL: closedL, pipe: pipe, tY: tY, tN: tN, tNA: tNA, tgtCum: tgtCum, FC: FC,
      wl: wl, wlType: wlType, wlP: wlP, staff: staff, overAt: overAt, freeAt: freeAt, m0: m0,
      advGroups: advGroups, advOpen: advOpen, canHd: canHd, tickets: tickets, hd: hd, breached: breached,
      openP: openP, donePending: donePending, acts: acts, annual: annual,
      closedSum: sum(ctx.fProjs.filter(function (p) { return p.stage === 'close'; }).map(function (p) { return Number(p.cost) || 0; })),
    };
  }
  var mLabel = function (i) { return MS[i % 12] + ' ' + String((D.yrBE + (i >= 12 ? 1 : 0)) % 100); };
  var mLabelL = function (i) { return MS[i % 12] + ' ' + (D.yrBE + (i >= 12 ? 1 : 0)); };

  /* ───────── popup ───────── */
  var lastFocus = null;
  function modalEl() {
    var m = $('ovd-modal'); if (m) return m;
    m = document.createElement('div'); m.id = 'ovd-modal'; m.className = 'ovd-modal'; m.hidden = true;
    m.innerHTML = '<div class="ovd-mbox" role="dialog" aria-modal="true" aria-labelledby="ovd-m-title"><div class="ovd-mh"><div><p class="ovd-eyebrow" id="ovd-m-kicker"></p><h3 id="ovd-m-title"></h3></div><button type="button" class="ovd-x" aria-label="ปิดหน้าต่าง">✕</button></div><div class="ovd-mstats" id="ovd-m-stats"></div><div class="ovd-mbody" id="ovd-m-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.ovd-x')) { closeModal(); return; }
      var r = e.target.closest('[data-act]'); if (!r) return;
      var a = r.getAttribute('data-act').split(':'), id = a.slice(1).join(':');
      closeModal();
      if (a[0] === 'staff') { staffModal(id, D.m0); return; }
      if (a[0] === 'proj' && window.openProjModal) window.openProjModal(id);
      else if (a[0] === 'adv') { window.goView('advance'); if (window.openAdvModal) setTimeout(function () { window.openAdvModal(id); }, 60); }
      else if (a[0] === 'hd') { window.goView('helpdesk'); if (window.hdOpen) setTimeout(function () { window.hdOpen(id); }, 60); }
      else if (a[0] === 'view') window.goView(id);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) closeModal(); });
    return m;
  }
  function openModal(o) {
    var m = modalEl(); lastFocus = document.activeElement;
    $('ovd-m-kicker').innerHTML = '<span class="ovd-sw" style="background:' + col(o.color) + '"></span>' + esc(o.kicker);
    $('ovd-m-title').textContent = o.title;
    $('ovd-m-stats').innerHTML = (o.stats || []).map(function (s) { return '<div><span>' + s[0] + '</span><b class="' + (s[2] || '') + '">' + s[1] + '</b></div>'; }).join('');
    var rows = o.rows || null, MAX = 100, list = '';
    if (rows) {
      var body = rowsHtml(rows.slice(0, MAX));
      list = '<h4>' + (o.listTitle || 'รายการ') + ' <span>' + rows.length + '</span></h4>' + (rows.length ? '<div class="ovd-list">' + body + '</div>' + (rows.length > MAX ? '<p class="ovd-mfoot">แสดง ' + MAX + ' จาก ' + rows.length + ' รายการ</p>' : '') : '<p class="ovd-mfoot">' + (o.empty || 'ไม่มีรายการ') + '</p>');
    }
    $('ovd-m-body').innerHTML = (o.html || '') + list + (o.view ? '<button type="button" class="btn btn-ghost btn-sm ovd-mgo" data-act="view:' + o.view + '">ไปที่เมนูนี้ ›</button>' : '') + (o.foot ? '<p class="ovd-mfoot">' + o.foot + '</p>' : '');
    m.hidden = false; m.querySelector('.ovd-x').focus();
  }
  function liHtml(r) {
    var tag = r.act ? 'button type="button" data-act="' + r.act + '"' : 'div';
    return '<' + tag + ' class="ovd-li"><div class="ovd-li-n">' + r.n + '<div class="ovd-li-m">' + (r.chip ? '<span class="ovd-chip ' + r.chip[0] + '">' + r.chip[1] + '</span>' : '') + (r.due ? '<span class="ovd-chip ' + r.due[0] + '">' + r.due[1] + '</span>' : '') + '<span>' + (r.m || '') + '</span></div></div><div class="ovd-li-r">' + (r.r ? '<b>' + r.r + '</b>' : '') + (r.r2 ? '<span>' + r.r2 + '</span>' : '') + '</div></' + (r.act ? 'button' : 'div') + '>';
  }
  // รายการโครงการ → จัดกลุ่มตามประเภทโครงการ (สีของประเภท) · รายการอื่นแสดงเรียงตามเดิม
  function rowsHtml(shown) {
    if (!shown.length || !shown.every(function (r) { return r.grp; })) return shown.map(liHtml).join('');
    var order = (window.PTYPES || []).map(function (t) { return t.id; }), groups = {};
    shown.forEach(function (r) { (groups[r.grp.id] || (groups[r.grp.id] = { g: r.grp, rows: [] })).rows.push(r); });
    return Object.keys(groups).sort(function (a, b) { return (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999); }).map(function (k) {
      var g = groups[k];
      return '<section class="ovd-grp" style="--gc:' + col(g.g.color) + '"><div class="ovd-gh"><span class="ovd-sw"></span><b>' + esc(g.g.label) + '</b><span>' + g.rows.length + ' โครงการ · ' + fc(sum(g.rows.map(function (r) { return r.cost || 0; }))) + '</span></div>' + g.rows.map(liHtml).join('') + '</section>';
    }).join('');
  }
  function closeModal() { var m = $('ovd-modal'); if (m) m.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function projRow(p) {
    var ph = window.projectHealth(p, D.today), h = HL[ph.k], t = window.gT(p.typeId), s = window.gS(p.stage);
    var team = memsOf(p).map(nick).filter(Boolean);
    var dl = h.k !== 'mut' && p.end ? Math.ceil((pd(p.end) - D.today) / DAY) : null;
    return { grp: { id: p.typeId || '', label: t.label, color: t.color }, cost: Number(p.cost) || 0, due: dl == null ? null : (dl < 0 ? ['crit', 'เลย ' + (-dl) + ' วัน'] : [ph.k === 'risk' ? 'warn' : 'mut', dl === 0 ? 'ครบวันนี้' : 'เหลือ ' + dl + ' วัน']), n: esc(p.name), m: esc(s.label) + (team.length ? ' · ' + esc(team.slice(0, 4).join(', ')) + (team.length > 4 ? ' +' + (team.length - 4) : '') : '') + ' · ' + fd(p.start) + ' – ' + fd(p.end),
      r: p.cost ? fc(p.cost) : '—', r2: 'คืบหน้า ' + (p.progress || 0) + '%' + (ph.expected != null && ph.k !== 'done' ? ' / แผน ' + ph.expected + '%' : ''), chip: [h.k, ph.reason ? h.l + ' · ' + ph.reason : h.l], act: 'proj:' + p.id };
  }
  function listModal(title, kicker, color, rows, view) { openModal({ kicker: kicker, title: title, color: color, rows: rows, listTitle: 'รายการ', view: view }); }
  function advRow(a) {
    var p = (window.PROJECTS || []).find(function (x) { return x.id === a.pid; }), f = (window.AFLW || []).find(function (x) { return x.id === a.status; }) || { label: a.status };
    var over = (a.status === 'disbursed' || a.status === 'clearing') && a.ddate && pd(a.ddate) < D.today;
    return { n: p ? esc(p.name) : '—', m: (a.ddate ? 'ครบกำหนดเคลียร์ ' + fd(a.ddate) : 'ยังไม่กำหนดวันเคลียร์'), r: fc(a.amount || 0), chip: [over ? 'crit' : (a.status === 'pending' ? 'warn' : 'info'), over ? 'เลยกำหนด' : f.label], act: 'adv:' + a.id };
  }
  function advModal(i) {
    var g = D.advGroups[i]; if (!g) return;
    openModal({ kicker: 'เงินทดรองจ่าย (Adv.)', title: 'สถานะ: ' + g.n, color: g.c, view: 'advance',
      stats: [['จำนวน', g.items.length + ' รายการ'], ['ยอดรวม', fc(sum(g.items.map(function (a) { return a.amount || 0; }))), g.over ? 'crit' : '']],
      rows: g.items.slice().sort(function (a, b) { return (a.ddate || '9').localeCompare(b.ddate || '9'); }).map(advRow), listTitle: 'รายการ Adv.' });
  }
  function ticketModal(title, items, color) {
    var hosp = function (id) { var h = (window.HOSPITALS || []).find(function (x) { return x.id === id; }); return h ? h.name : ''; };
    openModal({ kicker: 'Helpdesk ที่ยังเปิด', title: title, color: color || '--coral', view: 'helpdesk',
      stats: [['เปิดอยู่', items.length + ' เรื่อง'], ['เกิน SLA', items.filter(D.breached).length + ' เรื่อง', 'crit'], ['ยังไม่มอบหมาย', items.filter(function (t) { return !t.assigneeId; }).length + ' เรื่อง']],
      listTitle: 'Ticket', rows: items.slice().sort(function (a, b) { return (D.breached(b) ? 1 : 0) - (D.breached(a) ? 1 : 0) || String(a.createdAt).localeCompare(String(b.createdAt)); }).map(function (t) {
        var age = t.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(t.createdAt).getTime()) / DAY)) : null;
        var who = t.assigneeId ? ((window.USERS || []).find(function (u) { return u.id === t.assigneeId; }) || {}).name || nick(t.assigneeId) : '';
        return { n: esc((t.ticketNo ? t.ticketNo + ' · ' : '') + (t.subject || '')), m: esc([hosp(t.hospitalId), who || 'ยังไม่มอบหมาย'].filter(Boolean).join(' · ')), r2: age != null ? 'เปิดมา ' + age + ' วัน' : '', chip: D.breached(t) ? ['crit', 'เกิน SLA'] : ['ok', 'ตาม SLA'], act: 'hd:' + t.id };
      }) });
  }
  function healthModal(k) {
    var h = HL[k], ps = D.openP.filter(function (p) { return healthOf(p, D.today) === k; });
    openModal({ kicker: 'สุขภาพโครงการที่ยังเปิด', title: h.l, color: h.c, stats: [['จำนวน', ps.length + ' โครงการ'], ['สัดส่วน', pct(ps.length, D.openP.length) + '%'], ['มูลค่ารวม', fc(sum(ps.map(function (p) { return Number(p.cost) || 0; })))]],
      rows: ps.sort(function (a, b) { return String(a.end).localeCompare(String(b.end)); }).map(projRow), listTitle: 'โครงการ' });
  }
  function staffModal(sid, m) {
    var x = D.staff.find(function (z) { return z.s.id === sid; }); if (!x) return;
    var vals = x.cnt.slice(0, 12), v = vals[m], lv = lvOf(v), mx = Math.max.apply(null, vals.concat([1])), peak = vals.indexOf(Math.max.apply(null, vals));
    var strip = '<div class="ovd-strip">' + vals.map(function (c, i) { return '<div class="' + (i === m ? 'on' : '') + '" title="' + MS[i] + ': ' + c + '"><i style="height:' + Math.round(c / Math.max(5, mx) * 100) + '%;background:var(' + lvOf(c).c + ')"></i><span>' + MS[i] + '</span></div>'; }).join('') + '</div>';
    var ps = (D.wlP[m] || []).filter(function (p) { return memsOf(p).includes(sid); });
    openModal({ kicker: 'ภาระงานรายบุคคล', title: (x.s.nickname ? x.s.nickname + ' · ' : '') + x.s.name, color: lv.c,
      stats: [[mLabelL(m), v + ' โครงการ', v >= 4 ? 'crit' : (v === 3 ? 'warn' : '')], ['ระดับ', lv.l], ['เฉลี่ยทั้งปี', (sum(vals) / 12).toFixed(1) + ' โครงการ'], ['เดือนที่หนักสุด', MS[peak] + ' (' + vals[peak] + ')']],
      html: strip, listTitle: 'โครงการใน ' + mLabelL(m), rows: ps.map(projRow), empty: 'ไม่มีโครงการในเดือนนี้' });
  }

  /* ───────── 3D primitives ───────── */
  function axisBase() {
    return { axisLine: { lineStyle: { color: C('--border2') } }, axisTick: { show: false },
      axisLabel: { color: C('--txt2'), fontFamily: 'Plus Jakarta Sans, Noto Sans Thai', fontSize: 11 }, splitLine: { lineStyle: { color: C('--border'), type: 'dashed' } } };
  }
  function ax(extra) { var a = axisBase(); Object.keys(extra || {}).forEach(function (k) { a[k] = k === 'axisLabel' ? Object.assign(a.axisLabel, extra[k]) : extra[k]; }); return a; }
  function tip(extra) { return Object.assign({ backgroundColor: C('--surface'), borderColor: C('--border'), textStyle: { color: C('--txt'), fontFamily: 'Plus Jakarta Sans, Noto Sans Thai', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15)' }, extra || {}); }
  function legend(extra) { return Object.assign({ top: 0, left: 0, textStyle: { color: C('--txt2'), fontSize: 11.5, fontFamily: 'Plus Jakarta Sans, Noto Sans Thai' }, itemWidth: 10, itemHeight: 10, icon: 'roundRect' }, extra || {}); }
  var shadowPtr = { type: 'shadow', shadowStyle: { color: 'rgba(124,92,252,.06)' } };
  function empty(text) { return { graphic: { type: 'text', left: 'center', top: 'middle', style: { text: text, fill: C('--txt3'), font: '12px Plus Jakarta Sans, Noto Sans Thai' } } }; }

  // แท่งทรงกล่อง (custom series) value = [xIndex, top, base, raw]
  function cube(name, color, rows, o) {
    o = Object.assign({ offset: 0, ratio: .5, ghost: false, yAxisIndex: 0, depth: 1 }, o || {});
    var colorAt = function (i) { return Array.isArray(color) ? color[i] : color; };
    return { name: name, type: 'custom', yAxisIndex: o.yAxisIndex, itemStyle: { color: Array.isArray(color) ? color[0] : color },
      data: rows.map(function (r) { return { value: r }; }), encode: { x: 0, y: [1, 2] },
      renderItem: function (p, api) {
        var top = api.value(1), base = api.value(2); if (!(top > base)) return null;
        var a = api.coord([api.value(0), top]), b = api.coord([api.value(0), base]);
        var band = api.size([1, 0])[0], w = Math.max(5, band * o.ratio), cx = a[0] + o.offset * band;
        var L = cx - w / 2, R = cx + w / 2, T = a[1], B = b[1], c = colorAt(p.dataIndex), op = o.ghost ? .3 : 1, G = echarts.graphic.LinearGradient;
        if (!S.mode3d) return { type: 'rect', shape: { x: L, y: T, width: w, height: B - T, r: [4, 4, 0, 0] }, style: { fill: c, opacity: op } };
        var d = Math.min(w * .62 * o.depth, 24), dy = d * .6, kids = [];
        if (base <= 0 && !o.ghost) { var s = Math.min(w * .9, 30); kids.push({ type: 'polygon', shape: { points: [[R, B], [R + d, B - dy], [R + d + s, B - dy], [R + s, B]] }, style: { fill: new G(0, 0, 1, 0, [{ offset: 0, color: 'rgba(0,0,0,.22)' }, { offset: 1, color: 'rgba(0,0,0,0)' }]) } }); }
        kids.push({ type: 'polygon', shape: { points: [[L, B], [L, T], [R, T], [R, B]] }, style: { fill: new G(0, 0, 1, 0, [{ offset: 0, color: shade(c, .22) }, { offset: .55, color: c }, { offset: 1, color: shade(c, -.1) }]), opacity: op } });
        kids.push({ type: 'polygon', shape: { points: [[L, B], [L, T], [R, T], [R, B]] }, style: { fill: new G(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,255,255,.12)' }, { offset: 1, color: 'rgba(0,0,0,.16)' }]), opacity: op } });
        kids.push({ type: 'polygon', shape: { points: [[R, B], [R, T], [R + d, T - dy], [R + d, B - dy]] }, style: { fill: new G(0, 0, 0, 1, [{ offset: 0, color: shade(c, -.28) }, { offset: 1, color: shade(c, -.48) }]), opacity: op } });
        kids.push({ type: 'polygon', shape: { points: [[L, T], [L + d, T - dy], [R + d, T - dy], [R, T]] }, style: { fill: new G(0, 0, 1, 1, [{ offset: 0, color: shade(c, .55) }, { offset: 1, color: shade(c, .25) }]), opacity: op } });
        kids.push({ type: 'polyline', shape: { points: [[L, B], [L, T], [R, T], [R + d, T - dy]] }, style: { stroke: 'rgba(255,255,255,.55)', lineWidth: 1, fill: null, opacity: op } });
        return { type: 'group', children: kids };
      } };
  }
  // พื้น 3D ใต้กราฟแท่ง
  function floor() {
    return { type: 'custom', silent: true, z: 1, tooltip: { show: false }, data: [[0, 0]], encode: { x: 0, y: 1 },
      renderItem: function (p) {
        if (!S.mode3d) return null;
        var cs = p.coordSys, Dp = 20, Dy = Dp * .6, y = cs.y + cs.height, x0 = cs.x, x1 = cs.x + cs.width, G = echarts.graphic.LinearGradient, b2 = C('--border2');
        return { type: 'group', children: [
          { type: 'polygon', shape: { points: [[x0, y], [x0 + Dp, y - Dy], [x1 + Dp, y - Dy], [x1, y]] }, style: { fill: new G(0, 0, 0, 1, [{ offset: 0, color: C('--surface2') }, { offset: 1, color: C('--surface3') }]) } },
          { type: 'polygon', shape: { points: [[x0, y], [x1, y], [x1, y + 6], [x0, y + 6]] }, style: { fill: b2 } },
          { type: 'polygon', shape: { points: [[x1, y], [x1 + Dp, y - Dy], [x1 + Dp, y - Dy + 6], [x1, y + 6]] }, style: { fill: shade(b2, -.15) } },
        ] };
      } };
  }
  function topLabels(vals, fmt) {
    return { type: 'scatter', data: vals.map(function (v, i) { return [i, v]; }), symbolSize: 0, silent: true, tooltip: { show: false },
      label: { show: true, position: 'top', distance: S.mode3d ? 22 : 6, color: C('--txt'), fontWeight: 800, fontSize: 12, formatter: function (p) { return p.value[1] ? (fmt ? fmt(p.value[1]) : p.value[1]) : ''; } } };
  }
  // วงแหวน 3D (echarts-gl surface) — ชิ้นละ series
  function sliceEq(s, e, k, h) {
    var sr = s * Math.PI * 2, er = e * Math.PI * 2;
    var cl = function (u) { return u < sr ? sr : (u > er ? er : u); };
    return { u: { min: -Math.PI, max: Math.PI * 3, step: Math.PI / 40 }, v: { min: 0, max: Math.PI * 2, step: Math.PI / 20 },
      x: function (u, v) { return Math.cos(cl(u)) * (1 + Math.cos(v) * k); },
      y: function (u, v) { return Math.sin(cl(u)) * (1 + Math.cos(v) * k); },
      z: function (u, v) { if (u < -Math.PI * .5) return Math.sin(u); if (u > Math.PI * 2.5) return Math.sin(u) * h * .1; return Math.sin(v) > 0 ? h * .1 : -1; } };
  }
  function donutOpt(items, force2d, fmtV) {
    var total = sum(items.map(function (i) { return i.v; })), shown = items.filter(function (i) { return i.v > 0; });
    if (!total) return empty('ไม่มีข้อมูล');
    var tt = tip({ formatter: function (p) { var it = shown[p.seriesType === 'pie' ? p.dataIndex : p.seriesIndex]; return it ? '<b>' + esc(it.n) + '</b><br>' + (fmtV ? fmtV(it.v) : it.v.toLocaleString()) + ' (' + pct(it.v, total) + '%)' : ''; } });
    if (!S.mode3d || force2d || !hasGL) {
      return { tooltip: Object.assign(tt, { trigger: 'item' }), series: [{ type: 'pie', radius: ['52%', '80%'], center: ['50%', '52%'], label: { show: false },
        itemStyle: { borderColor: C('--surface'), borderWidth: 3, borderRadius: 6 }, data: shown.map(function (i) { return { name: i.n, value: i.v, itemStyle: { color: col(i.c) } }; }) }] };
    }
    var k = (1 - .55) / (1 + .55), acc = 0;
    return { tooltip: tt, xAxis3D: { min: -1, max: 1 }, yAxis3D: { min: -1, max: 1 }, zAxis3D: { min: -1, max: 1 },
      grid3D: { show: false, boxHeight: 34, top: '-10%', viewControl: { alpha: 42, beta: 10, distance: 185, rotateSensitivity: 0, zoomSensitivity: 0, panSensitivity: 0, autoRotate: false },
        light: { main: { intensity: 1.35, alpha: 60, beta: -30, shadow: false }, ambient: { intensity: .38 } }, postEffect: { enable: false } },
      series: shown.map(function (i) { var s = acc / total; acc += i.v; return { name: i.n, type: 'surface', parametric: true, shading: 'lambert', wireframe: { show: false }, itemStyle: { color: col(i.c) }, parametricEquation: sliceEq(s, acc / total, k, 13) }; }) };
  }
  function donutLegend(id, items, fmtV) {
    var el = $(id); if (!el) return; var total = sum(items.map(function (i) { return i.v; }));
    el.innerHTML = items.map(function (i) { return '<div><span class="ovd-sw" style="background:' + col(i.c) + '"></span><span>' + esc(i.n) + '</span><b>' + (fmtV ? fmtV(i.v) : i.v.toLocaleString()) + '</b><em>' + pct(i.v, total) + '%</em></div>'; }).join('');
  }

  /* ───────── chart registry ───────── */
  function bind(c, id) {
    c.on('click', function (p) { var k = CLICK[id]; if (k && k.item) k.item(p); });
    var zr = c.getZr();
    zr.on('click', function (e) {
      var k = CLICK[id]; if (!k || !k.axis) return;
      var pt = [e.offsetX, e.offsetY]; if (!c.containPixel({ gridIndex: 0 }, pt)) return;
      var r = c.convertFromPixel({ gridIndex: 0 }, pt), i = Math.round(Array.isArray(r) ? r[0] : r);
      if (i >= 0) k.axis(i);
    });
    zr.on('mousemove', function (e) { var k = CLICK[id]; if (k && k.axis && c.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) zr.setCursorStyle('pointer'); });
  }
  // กันกระตุก: (1) วาดทีละตัวต่อเฟรม (2) ข้อมูลเดิม → ไม่วาดซ้ำ (3) อัปเดตข้อมูล → ไม่เล่นแอนิเมชันใหม่
  //            (4) กราฟที่ยังมองไม่เห็นเก็บไว้วาดตอนแสดง (5) ECharts-GL โหลดเสร็จ → สร้างใหม่เฉพาะกราฟที่ใช้ GL
  var GL_IDS = { 'ovd-c-share': 1, 'ovd-c-health': 1, 'ovd-c-res': 1, 'ovd-c-heat': 1 };
  var queue = [], qRun = false, hiddenB = {};
  function mount(id, build) {
    queue = queue.filter(function (q) { return q.id !== id; });
    queue.push({ id: id, build: build });
    if (!qRun) { qRun = true; requestAnimationFrame(runQueue); }
  }
  function runQueue() {
    var t0 = performance.now();
    do { var q = queue.shift(); if (q) mountNow(q.id, q.build); } while (queue.length && performance.now() - t0 < 10);
    if (queue.length) requestAnimationFrame(runQueue); else qRun = false;
  }
  function sigOf(o) { try { return JSON.stringify(o, function (k, v) { return typeof v === 'function' ? undefined : v; }); } catch (e) { return String(Math.random()); } }
  function mountNow(id, build) {
    var el = $(id); if (!el || !window.echarts) return;
    if (!el.getClientRects().length) { hiddenB[id] = build; return; }
    delete hiddenB[id];
    var key = (GL_IDS[id] && S.mode3d && hasGL ? 'g' : 'f') + (S.mode3d ? '3' : '2'), c = charts[id];
    if (c && (c.isDisposed() || c.__k !== key || c.getDom() !== el)) { if (!c.isDisposed()) c.dispose(); c = null; }
    var opt, sig;
    try { opt = build(false); sig = sigOf(opt); } catch (err) { console.warn('[ovDash]', id, err); opt = null; }
    if (c && opt && c.__sig === sig) return;
    var fresh = !c;
    if (fresh) { c = echarts.init(el); c.__k = key; charts[id] = c; bind(c, id); if (ro) ro.observe(el); }
    try {
      if (!opt) throw new Error('build');
      if (!fresh) opt.animation = false;
      c.setOption(opt, { notMerge: true }); c.__sig = sig;
    } catch (err) {
      console.warn('[ovDash]', id, err);
      try { c.dispose(); c = echarts.init(el); c.__k = 'x'; charts[id] = c; bind(c, id); c.setOption(build(true), { notMerge: true }); } catch (e2) { console.warn('[ovDash]', id, e2); }
    }
  }
  // แสดงกราฟที่ค้างไว้ตอนซ่อน (เช่น สลับไปมุมมองทั้งปี)
  function flushHidden() { Object.keys(hiddenB).forEach(function (id) { var el = $(id); if (el && el.getClientRects().length) mount(id, hiddenB[id]); }); }

  /* ───────── forecast (เลื่อนเวลา) ───────── */
  function fcOpt() {
    var f = D.FC[S.scen], N = D.N, NOW = D.NOW, hasT = D.tY > 0, sel = S.sel;
    var M = function (x) { return x == null ? null : +(x / 1e6).toFixed(2); };
    var act = [], fcl = [], lo = [], hi = [];
    for (var i = 0; i < N; i++) {
      act[i] = i < NOW ? f.cum[i] : null;
      var anchor = i === NOW - 1, fut = i >= NOW;
      fcl[i] = fut || anchor ? f.cum[i] : null;
      lo[i] = fut || anchor ? f.cLo[i] : null; hi[i] = fut || anchor ? f.cHi[i] : null;
    }
    var at = function (j) { return f.cum[j]; }, vSel = at(sel), tSel = D.tgtCum[sel], gap = tSel - vSel;
    var d3 = S.mode3d, sh = function (c) { return d3 ? { shadowColor: c, shadowBlur: 14, shadowOffsetY: 10 } : {}; };
    var teal = C('--teal'), vio = C('--violet'), hasFc = NOW < N;
    var others = hasFc ? Object.keys(SCEN).filter(function (k) { return k !== S.scen; }).map(function (k) {
      var o = D.FC[k]; return { name: SCEN[k].lab, type: 'line', data: o.cum.map(function (v, j) { return j >= NOW - 1 ? M(v) : null; }), symbol: 'none', smooth: .25, z: 2,
        lineStyle: { width: 1.5, type: 'dotted', color: C('--txt3') }, itemStyle: { color: C('--txt3') },
        endLabel: { show: true, formatter: function (p) { return SCEN[k].lab + ' ' + p.value + 'M'; }, color: C('--txt3'), fontSize: 10.5 } };
    }) : [];
    var marks = [];
    if (hasFc) marks.push({ xAxis: NOW, lineStyle: { color: C('--txt3'), type: 'solid', width: 1 }, label: { formatter: 'วันนี้', color: C('--txt2'), position: 'insideEndTop', fontWeight: 700 } });
    if (N > 12) marks.push({ xAxis: 11, lineStyle: { color: C('--border2'), type: 'dashed', width: 1 }, label: { formatter: 'สิ้นปี ' + (D.yrBE % 100), color: C('--txt3'), position: 'insideEndTop' } });
    var cursor = [];
    if (hasT && gap > 0) cursor.push([{ coord: [sel, M(vSel)], lineStyle: { color: C('--coral'), width: 2.5, type: 'solid' }, label: { show: true, formatter: 'ขาด ' + fmtM(gap), position: 'middle', color: '#fff', backgroundColor: C('--coral'), padding: [3, 7], borderRadius: 6, fontWeight: 700, fontSize: 11 } }, { coord: [sel, M(tSel)] }]);
    cursor.push({ xAxis: sel, lineStyle: { color: vio, width: 1.5, type: 'solid', opacity: .6 }, label: { show: false } });
    return {
      grid: { left: 8, right: hasFc ? 100 : 56, top: 28, bottom: 8, containLabel: true },
      tooltip: tip({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C('--border2') } }, formatter: function (ps) {
        var j = ps[0].dataIndex, v = at(j);
        return '<b>' + mLabelL(j) + '</b> · ' + (j < NOW ? 'เกิดขึ้นจริง' : 'พยากรณ์ (' + SCEN[S.scen].lab + ')') + '<br>ปิดสะสม: <b>' + fc(v) + '</b>' + (j >= NOW ? '<br>ช่วงที่เป็นไปได้: ' + fmtM(f.cLo[j]) + ' – ' + fmtM(f.cHi[j]) : '') +
          (hasT ? '<br>เป้าหมายสะสม: <b>' + fc(D.tgtCum[j]) + '</b>' + (D.tgtCum[j] > v ? '<br><span style="color:' + C('--coral') + '">ขาดเป้า ' + fc(D.tgtCum[j] - v) + '</span>' : '') : '');
      } }),
      xAxis: ax({ type: 'category', boundaryGap: false, data: Array.apply(null, Array(N)).map(function (_, j) { return mLabel(j); }) }),
      yAxis: ax({ type: 'value', name: 'ล้านบาท (สะสมตั้งแต่ ม.ค.)', nameTextStyle: { color: C('--txt3'), fontSize: 11, align: 'left' }, axisLabel: { formatter: function (x) { return x + 'M'; } } }),
      series: [].concat(
        hasT ? [{ name: 'เป้าหมาย', type: 'line', data: D.tgtCum.map(M), symbol: 'none', z: 3, lineStyle: Object.assign({ width: 2.5, type: [8, 5], color: vio }, sh(rgba(vio, .35))), itemStyle: { color: vio },
          endLabel: { show: true, formatter: function (p) { return 'เป้า ' + p.value + 'M'; }, color: vio, fontWeight: 700, fontSize: 11 } }] : [],
        [{ name: 'marks', type: 'line', data: [], silent: true, tooltip: { show: false }, markLine: { silent: true, symbol: 'none', animation: false, data: marks },
          markArea: hasFc ? { silent: true, itemStyle: { color: 'rgba(124,92,252,.05)' }, data: [[{ xAxis: NOW }, { xAxis: N - 1 }]], label: { show: true, position: 'insideTop', formatter: 'ช่วงพยากรณ์', color: C('--txt3'), fontSize: 11, offset: [0, 18] } } : undefined },
        { name: 'ล่าง', type: 'line', stack: 'band', data: lo.map(M), symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, z: 1 },
        { name: 'ช่วงที่เป็นไปได้', type: 'line', stack: 'band', data: hi.map(function (h, j) { return h == null ? null : M(h - lo[j]); }), symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1, areaStyle: { color: teal, opacity: .18 } }],
        others,
        [{ name: 'เกิดขึ้นจริง', type: 'line', data: act.map(M), smooth: .25, symbol: 'circle', symbolSize: 7, z: 5, lineStyle: Object.assign({ width: 4, color: teal }, sh(rgba(teal, .45))), itemStyle: { color: teal },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: rgba(teal, .35) }, { offset: 1, color: rgba(teal, 0) }]) } },
        { name: 'พยากรณ์', type: 'line', data: fcl.map(M), smooth: .25, symbol: 'none', z: 5, lineStyle: Object.assign({ width: 4, type: [10, 6], color: teal }, sh(rgba(teal, .35))), itemStyle: { color: teal },
          endLabel: hasFc ? { show: true, formatter: function (p) { return SCEN[S.scen].lab + ' ' + p.value + 'M'; }, color: teal, fontWeight: 800, fontSize: 11 } : undefined },
        { name: 'cursor', type: 'line', data: [], silent: true, tooltip: { show: false },
          markLine: { symbol: ['none', 'none'], animationDurationUpdate: 400, data: cursor },
          markPoint: { symbol: 'circle', symbolSize: 14, itemStyle: { color: C('--surface'), borderColor: teal, borderWidth: 4 },
            label: { show: true, position: 'top', distance: 8, formatter: fmtM(vSel), color: C('--txt'), fontWeight: 800, fontSize: 12, backgroundColor: C('--surface'), padding: [3, 6], borderRadius: 6, borderColor: C('--border'), borderWidth: 1 },
            data: [{ coord: [sel, M(vSel)] }] } }]
      ) };
  }
  CLICK['ovd-c-fc'] = { axis: function (i) { stopPlay(); setSel(i); } };

  function renderFcSide() {
    var f = D.FC[S.scen], i = S.sel, NOW = D.NOW, N = D.N, sc = SCEN[S.scen], fut = i >= NOW, hasFc = NOW < N, hasT = D.tY > 0;
    $('ovd-fc-month').textContent = mLabelL(i);
    var kd = $('ovd-fc-kind'); kd.textContent = fut ? (i === NOW ? 'เดือนนี้ · พยากรณ์ ' + sc.lab : 'พยากรณ์ · ' + sc.lab) : 'ข้อมูลจริง'; kd.className = 'ovd-chip ' + (fut ? 'info' : 'ok');
    var cum = f.cum[i], pace = D.tgtCum[i], r = hasT ? cum / pace : 1;
    $('ovd-fc-head').innerHTML = (fut ? 'ถ้าเป็นแบบ "' + sc.lab + '" ถึง ' + mLabelL(i) + ' จะปิดโครงการสะสมได้ <b>' + fmtM(cum) + '</b>' : 'ถึง ' + mLabelL(i) + ' ปิดโครงการได้จริง <b>' + fmtM(cum) + '</b>') +
      (hasT ? ' จากเป้า ' + fmtM(pace) + ' · ทำได้ <b class="ovd-' + sevOf(r) + '">' + pct(cum, pace) + '%</b>' + (pace > cum ? ' · ขาด <b class="ovd-crit">' + fmtM(pace - cum) + '</b>' : '') : ' · <span class="ovd-muted">ยังไม่ได้ตั้งเป้าปีนี้ (เมนู เป้าหมายทีม)</span>');
    var tot = D.wl[i], over = D.overAt(i), free = D.freeAt(i), bPrev = i > 0 ? f.back[i - 1] : 0;
    var kp = [
      ['ปิดโครงการสะสม', fmtM(cum), hasT ? sevOf(r) : '', fut ? 'ช่วง ' + fmtM(f.cLo[i]) + ' – ' + fmtM(f.cHi[i]) + (hasT ? ' · ' + pct(cum, pace) + '% ของเป้าตามเวลา' : '') : (hasT ? pct(cum, pace) + '% ของเป้าตามเวลา (' + fmtM(pace) + ')' : 'ตั้งแต่ ม.ค.')],
      ['ออกโครงการสะสม', fmtM(f.cOut[i]), hasT ? sevOf(f.cOut[i] / pace) : '', hasT ? pct(f.cOut[i], pace) + '% ของเป้าตามเวลา' : 'ตั้งแต่ ม.ค.'],
      ['งานค้างรอปิด', fmtM(f.back[i]), '', 'ออกแล้วยังไม่ปิด · ' + (f.back[i] >= bPrev ? 'เพิ่มขึ้น ' : 'ลดลง ') + fmtM(Math.abs(f.back[i] - bPrev)) + ' จากเดือนก่อน'],
      ['ภาระทีม', tot + ' โครงการ', over > 6 ? 'crit' : (over > 2 ? 'warn' : 'ok'), 'เกินกำลัง ' + over + ' คน · ว่าง ' + free + ' คน'],
    ];
    $('ovd-fc-kpis').innerHTML = kp.map(function (k) { return '<div><span>' + k[0] + '</span><b class="ovd-' + k[2] + '">' + k[1] + '</b><small>' + k[3] + '</small></div>'; }).join('');
    var ins = [];
    if (hasT) ins.push(fut ? [sevOf(r), 'ถึง ' + mLabelL(i) + ' คาดปิดสะสม ' + fmtM(cum) + ' (' + pct(cum, pace) + '% ของเป้าตามเวลา)', 'ช่วงที่เป็นไปได้ ' + fmtM(f.cLo[i]) + ' – ' + fmtM(f.cHi[i]) + ' · สถานการณ์ "' + sc.lab + '"']
      : [sevOf(r), 'ข้อมูลจริง ' + mLabelL(i) + ': ปิดสะสม ' + fmtM(cum) + ' = ' + pct(cum, D.tY) + '% ของเป้าทั้งปี', 'ตามสัดส่วนเวลาควรได้ ' + pct(i + 1, 12) + '% (' + fmtM(pace) + ')']);
    if (hasT && hasFc && i < 12) {
      var ye = f.cum[11], yeP = D.FC.push.cum[11];
      ins.push([sevOf(ye / D.tY), 'คาดปิดทั้งปี ' + D.yrBE + ' ≈ ' + fmtM(ye) + ' (' + pct(ye, D.tY) + '% ของเป้า)' + (D.tY > ye ? ' · ขาด ' + fmtM(D.tY - ye) : ''), S.scen === 'push' ? 'เป็นกรณีที่ดีที่สุดแล้ว ควรเพิ่มยอดขายใหม่หรือทบทวนเป้า' : 'ถ้าเร่งปิดงานค้าง จะได้ ' + fmtM(yeP) + ' (+' + fmtM(yeP - ye) + ')']);
    } else if (hasT && i >= 12) {
      var h1 = f.cum[Math.min(17, N - 1)] - f.cum[11];
      ins.push([sevOf(h1 / (D.tN / 2)), 'ครึ่งปีแรก ' + (D.yrBE + 1) + ' คาดปิด ' + fmtM(h1) + ' (' + pct(h1, D.tN / 2) + '% ของเป้าครึ่งปี)', D.tNA ? 'ยังไม่ได้ตั้งเป้าปี ' + (D.yrBE + 1) + ' จึงใช้เท่ากับปีนี้ไปก่อน' : 'ตามเป้าที่ตั้งไว้ในระบบ']);
    }
    ins.push([over > 6 ? 'crit' : (over > 2 ? 'warn' : 'ok'), mLabelL(i) + ': ' + tot + ' โครงการพร้อมกัน · เกินกำลัง ' + over + ' คน', over > 6 ? 'ควรเลื่อนหรือกระจายงาน หรือเพิ่มคนชั่วคราว' : (over > 2 ? 'เฝ้าระวังคนที่รับงานซ้อน' : 'กำลังคนเพียงพอ')]);
    $('ovd-fc-ins').innerHTML = ins.map(function (x) { return '<div class="ovd-ins ovd-sev-' + x[0] + '"><span class="ovd-dot"></span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');
    // slider
    var rg = $('ovd-fc-range'); rg.max = N - 1; rg.value = i;
    var pos = function (j) { return 'calc(11px + (100% - 22px) * ' + (j / (N - 1)) + ')'; };
    $('ovd-fc-ticks').innerHTML = Array.apply(null, Array(N)).map(function (_, j) { return '<button type="button" data-i="' + j + '" class="' + (j === i ? 'on' : '') + (j % 3 && j !== NOW ? ' minor' : '') + '" style="left:' + pos(j) + '">' + mLabel(j) + '</button>'; }).join('') +
      (hasFc ? '<span class="ovd-nowtag" style="left:' + pos(NOW) + '">▲ วันนี้</span>' : '');
    var p = hasFc ? NOW / (N - 1) * 100 : 100;
    rg.style.background = 'linear-gradient(90deg,var(--violet) 0 ' + p + '%,transparent ' + p + '%),repeating-linear-gradient(45deg,var(--surface3) 0 6px,var(--border2) 6px 12px)';
    $('ovd-fc-scen').hidden = !hasFc;
    $('ovd-fc-scen').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.s === S.scen); });
    $('ovd-fc-note').innerHTML = hasFc
      ? 'วิธีพยากรณ์: ใช้วันสิ้นสุดของโครงการที่ยังไม่ปิดเป็นตัวบอกเดือนที่จะปิด · <b>' + sc.lab + '</b> = ' + sc.txt + ' · ช่วงความเชื่อมั่นกว้างขึ้น ±7% ต่อเดือน' + (N > 12 && D.tNA && hasT ? ' · เป้าปี ' + (D.yrBE + 1) + ' ยังไม่ได้ตั้ง ใช้เท่าปีนี้ไปก่อน' : '') + ' · นับมูลค่าตามเดือนของวันสิ้นสุดโครงการ · กดที่กราฟเพื่อเลือกเดือน'
      : 'ปีที่เลือกผ่านไปแล้ว แสดงเฉพาะข้อมูลจริง (นับมูลค่าตามเดือนของวันสิ้นสุดโครงการ) · กดที่กราฟเพื่อเลือกเดือน';
  }
  function setSel(i) {
    S.sel = Math.max(0, Math.min(D.N - 1, i)); renderFcSide();
    var c = charts['ovd-c-fc'];
    if (c && !c.isDisposed()) { try { var o = fcOpt(); c.__sig = sigOf(o); o.animation = false; c.setOption(o, { notMerge: true }); } catch (e) { console.warn('[ovDash] fc', e); } }
  }
  function stopPlay() {
    if (S.timer) clearInterval(S.timer); S.timer = null;
    var b = $('ovd-fc-play'); if (b) { b.setAttribute('aria-pressed', 'false'); b.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i><span>เล่นไทม์ไลน์</span>'; }
  }
  function togglePlay() {
    if (S.timer) { stopPlay(); return; }
    if (S.sel >= D.N - 1) setSel(0);
    var b = $('ovd-fc-play'); b.setAttribute('aria-pressed', 'true'); b.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i><span>หยุด</span>';
    S.timer = setInterval(function () {
      var v = $('view-overview');
      if (!D || S.sel >= D.N - 1 || !v || !v.classList.contains('on')) { stopPlay(); return; }
      setSel(S.sel + 1);
    }, 1100);
  }

  /* ───────── HTML parts ───────── */
  function renderKpis() {
    var ctx = D.ctx, tot = ctx.totalBudget || 0, cl = D.closedSum, hasT = D.tY > 0, yf = D.yrFrac;
    var paceChip = function (r) { return !hasT ? ['mut', 'ไม่มีเป้า'] : (r >= yf * .95 ? ['ok', 'ตามเวลา'] : (r >= yf * .6 ? ['warn', 'ต่ำกว่าเวลา'] : ['crit', 'ต้องเร่ง'])); };
    var h = ctx.health, active = ctx.fProjs.length - h.completed, nS = D.staff.length, busy = nS - D.freeAt(D.m0), over = D.overAt(D.m0), eff = pct(busy, nS);
    var advDis = D.advOpen.filter(function (a) { return a.status === 'disbursed' || a.status === 'clearing'; }), advOver = D.advGroups[D.advGroups.length - 1].items;
    var dp = D.donePending;
    var K = [
      { lb: 'เป้าหมายปี ' + D.yrBE, v: hasT ? fc(D.tY) : '—', s: hasT ? 'ตั้งที่เมนู เป้าหมายทีม' : 'ยังไม่ได้ตั้งเป้าปีนี้', m: [hasT ? 1 : 0, '--violet'], chip: ['info', 'ทั้งปี'] },
      { lb: 'ออกโครงการแล้ว', v: fc(tot), s: hasT ? pct(tot, D.tY) + '% ของเป้า' + (D.tY > tot ? ' · ต้องหาเพิ่ม ' + fmtM(D.tY - tot) : '') : ctx.fProjs.length + ' โครงการ', m: [hasT ? tot / D.tY : 0, '--indigo'], pace: hasT && yf < 1 ? yf : null, chip: paceChip(hasT ? tot / D.tY : 0) },
      { lb: 'ปิดโครงการ (รับรู้รายได้)', v: fc(cl), s: hasT ? pct(cl, D.tY) + '% ของเป้า · ควรเป็น ' + Math.round(yf * 100) + '% ตามเวลา' : pct(cl, tot) + '% ของมูลค่าที่ออก', m: [hasT ? cl / D.tY : (tot ? cl / tot : 0), '--teal'], pace: hasT && yf < 1 ? yf : null, chip: paceChip(hasT ? cl / D.tY : 0) },
      { lb: 'ออกแล้วยังไม่ปิด', v: fc(Math.max(0, tot - cl)), s: 'งานเสร็จ/เลยกำหนดรอปิด ' + dp.length + ' โครงการ (' + fmtM(sum(dp.map(function (p) { return Number(p.cost) || 0; }))) + ')', m: [tot ? (tot - cl) / tot : 0, '--amber'], chip: dp.length ? ['warn', 'รอปิด ' + dp.length] : ['ok', 'ไม่มีค้าง'], act: 'pending' },
      { lb: 'โครงการ', v: active + '<small> / ' + ctx.fProjs.length + '</small>', s: 'กำลังดำเนินการ · เสร็จแล้ว ' + h.completed, m: [ctx.fProjs.length ? h.completed / ctx.fProjs.length : 0, '--teal'], chip: h.delayed ? ['crit', 'ล่าช้า ' + h.delayed] : (h.atRisk ? ['warn', 'เสี่ยง ' + h.atRisk] : ['ok', 'ตามแผน']), act: h.delayed ? 'late' : (h.atRisk ? 'risk' : '') },
      { lb: 'การใช้ทีมงาน', v: eff + '%', s: busy + ' จาก ' + nS + ' คนมีงานเดือน ' + MS[D.m0] + ' · เกินกำลัง ' + over + ' คน', m: [eff / 100, '--sky'], chip: over ? ['warn', 'เกินกำลัง ' + over] : ['ok', 'สมดุล'] },
      { lb: 'Adv. ค้างเคลียร์', v: fc(sum(advDis.map(function (a) { return a.amount || 0; }))), s: advDis.length + ' รายการ · เลยกำหนด ' + advOver.length + ' (' + fmtM(sum(advOver.map(function (a) { return a.amount || 0; }))) + ')', m: [advDis.length ? advOver.length / advDis.length : 0, '--coral'], chip: advOver.length ? ['crit', 'เลยกำหนด ' + advOver.length] : ['ok', 'ปกติ'], act: advOver.length ? 'advover' : '' },
      D.canHd
        ? { lb: 'Helpdesk เปิดอยู่', v: String(D.tickets.length), s: 'เกิน SLA ' + D.tickets.filter(D.breached).length + ' · ยังไม่มอบหมาย ' + D.tickets.filter(function (t) { return !t.assigneeId; }).length, m: [D.tickets.length ? 1 - D.tickets.filter(D.breached).length / D.tickets.length : 1, '--teal'], chip: D.tickets.filter(D.breached).length ? ['crit', 'ตาม SLA ' + pct(D.tickets.length - D.tickets.filter(D.breached).length, D.tickets.length) + '%'] : ['ok', 'ตาม SLA'], act: D.tickets.length ? 'hd' : '' }
        : { lb: 'ใกล้ครบกำหนด', v: String(ctx.critCount), s: 'โครงการที่สิ้นสุดภายใน 30 วัน', m: [0, '--amber'], chip: ctx.critCount ? ['warn', 'ติดตาม'] : ['ok', 'ปกติ'], act: ctx.critCount ? 'due' : '' },
    ];
    $('ovd-kpis').innerHTML = K.map(function (k) {
      var tag = k.act ? 'button type="button" data-kpi="' + k.act + '"' : 'div';
      return '<' + tag + ' class="ovd-kpi"><div class="ovd-kpi-lb"><span>' + k.lb + '</span><span class="ovd-chip ' + k.chip[0] + '">' + k.chip[1] + '</span></div><div class="ovd-kpi-v">' + k.v + '</div>' +
        '<div class="ovd-meter"><i style="width:' + Math.min(100, Math.max(0, k.m[0] * 100)) + '%;background:var(' + k.m[1] + ')"></i>' + (k.pace != null ? '<span class="ovd-pace" style="left:' + (k.pace * 100) + '%" title="สัดส่วนเวลาที่ผ่านไปของปี"></span>' : '') + '</div><div class="ovd-kpi-s">' + k.s + '</div></' + (k.act ? 'button' : 'div') + '>';
    }).join('');
    $('ovd-today').textContent = 'ข้อมูล ณ ' + fd(D.today) + (D.Y === D.curY ? ' · ผ่านไป ' + Math.round(yf * 100) + '% ของปี' : '');
  }
  function onKpi(k) {
    if (k === 'pending') openModal({ kicker: 'ออกแล้วยังไม่ปิด', title: 'งานเสร็จ/เลยกำหนด รอปิดโครงการ', color: '--amber', stats: [['จำนวน', D.donePending.length + ' โครงการ'], ['มูลค่า', fc(sum(D.donePending.map(function (p) { return Number(p.cost) || 0; })))]], rows: D.donePending.map(projRow), listTitle: 'โครงการ' });
    else if (k === 'late' || k === 'risk') healthModal(k);
    else if (k === 'advover') advModal(D.advGroups.length - 1);
    else if (k === 'due') { S.wTab = 'due'; renderWatch(); $('ovd-watch').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (k === 'hd') ticketModal('Ticket ที่ยังเปิดทั้งหมด', D.tickets, '--teal');
  }
  // พนักงานตามแผนกที่เลือก (ว่าง = ทุกแผนก)
  function pStaff() { return S.pDept ? D.staff.filter(function (x) { return (x.s.deptId || '') === S.pDept; }) : D.staff; }
  function fillDept() {
    var seen = {}, opts = [];
    D.staff.forEach(function (x) { var k = x.s.deptId || ''; if (!(k in seen)) { seen[k] = 1; opts.push({ id: k, l: k ? (x.s.dept || k) : 'ไม่ระบุแผนก', n: 0 }); } });
    opts.forEach(function (o) { o.n = D.staff.filter(function (x) { return (x.s.deptId || '') === o.id; }).length; });
    opts.sort(function (a, b) { return (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.l.localeCompare(b.l, 'th'); });
    if (S.pDept && !seen.hasOwnProperty(S.pDept)) S.pDept = '';
    $('ovd-dept').innerHTML = '<option value="">ทุกแผนก (' + D.staff.length + ' คน)</option>' + opts.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === S.pDept ? ' selected' : '') + '>' + esc(o.l) + ' (' + o.n + ' คน)</option>'; }).join('');
  }
  function renderPeople() {
    var m = S.pMonth;
    $('ovd-people-month').innerHTML = MS.map(function (x, i) { return '<button type="button" data-m="' + i + '" aria-pressed="' + (i === m) + '" class="' + (D.Y === D.curY && i === D.today.getMonth() ? 'now' : '') + '">' + x + '</button>'; }).join('');
    var rows = pStaff().map(function (x) { return { x: x, v: x.cnt[m] }; }).sort(function (a, b) { return b.v - a.v || String(a.x.s.nickname || a.x.s.name).localeCompare(String(b.x.s.nickname || b.x.s.name), 'th'); });
    var cnt = { 'เกินกำลัง': 0, 'เต็มมือ': 0, 'ปกติ': 0, 'ว่าง': 0 }; rows.forEach(function (r) { cnt[lvOf(r.v).l]++; });
    $('ovd-people-sum').innerHTML = '<b>' + mLabelL(m) + '</b>' + [['เกินกำลัง', '--coral'], ['เต็มมือ', '--amber'], ['ปกติ', '--sky'], ['ว่าง', '--teal']].map(function (k) { return '<span class="ovd-chip mut"><span class="ovd-sw" style="background:var(' + k[1] + ')"></span>' + k[0] + ' ' + cnt[k[0]] + ' คน</span>'; }).join('');
    var HEAD = 'M30 2a14 14 0 1 1 0 28a14 14 0 1 1 0-28Z', TORSO = 'M8 92V54c0-11 8-19 19-19h6c11 0 19 8 19 19v38c0 3-2 5-5 5H13c-3 0-5-2-5-5Z', BODY = HEAD + ' ' + TORSO;
    $('ovd-people').innerHTML = rows.length ? rows.map(function (r, i) {
      var lv = lvOf(r.v), h = Math.min(1, r.v / 5) * 95, id = 'ovdpc' + i, nm = r.x.s.nickname || (r.x.s.name || '').split(' ')[0];
      return '<button type="button" class="ovd-pf" data-sid="' + esc(r.x.s.id) + '" title="' + esc(r.x.s.name) + ': ' + r.v + ' โครงการ (' + lv.l + ')"><svg viewBox="0 0 60 104" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + BODY + '"/></clipPath>' +
        '<radialGradient id="' + id + 'g" cx=".3" cy=".25" r=".95"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#fff" stop-opacity=".08"/><stop offset=".75" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient></defs>' +
        (S.mode3d ? '<ellipse cx="30" cy="99" rx="22" ry="4" fill="var(--txt)" opacity=".12"/>' : '') +
        '<path d="' + BODY + '" fill="var(--surface3)" stroke="var(--border2)" stroke-width="1"/><g clip-path="url(#' + id + ')"><rect class="ovd-fill" x="0" width="60" y="' + (97 - h) + '" height="' + h + '" fill="var(' + lv.c + ')"/>' +
        (S.mode3d ? '<path d="' + HEAD + '" fill="url(#' + id + 'g)"/><path d="' + TORSO + '" fill="url(#' + id + 'g)"/>' : '') + '</g></svg>' +
        '<span class="ovd-pf-n">' + esc(nm) + '</span><span class="ovd-pf-c"><b style="color:var(' + lv.c + ')">' + r.v + '</b> โครงการ · ' + lv.l + '</span></button>';
    }).join('') : '<p class="ovd-muted">' + (S.pDept ? 'ไม่มีพนักงานในแผนกนี้' : 'ไม่มีพนักงานที่ใช้งานอยู่') + '</p>';
  }
  function syncPeopleView() {
    var pv = S.pView === 'people';
    $('ovd-v-people').setAttribute('aria-pressed', pv); $('ovd-v-matrix').setAttribute('aria-pressed', !pv);
    $('ovd-people-view').hidden = !pv; $('ovd-c-heat').hidden = pv;
    $('ovd-rot').hidden = pv || !S.mode3d || !hasGL;
    if (!pv) requestAnimationFrame(function () { flushHidden(); var c = charts['ovd-c-heat']; if (c && !c.isDisposed()) c.resize(); });
  }
  function renderActs() {
    var sc = { crit: 'var(--coral)', warn: 'var(--amber)', info: 'var(--indigo)' };
    $('ovd-acts').innerHTML = D.acts.length ? D.acts.map(function (a, i) {
      return '<button type="button" class="ovd-act" data-i="' + i + '"><span class="ovd-act-bar" style="background:' + sc[a.sev] + '"></span><div><div class="ovd-act-n">' + a.n + '</div><div class="ovd-act-m">' + a.m + '</div></div><div class="ovd-act-v" style="color:' + sc[a.sev] + '">' + a.v + '</div></button>';
    }).join('') : '<p class="ovd-muted" style="text-align:center;padding:24px 0">ไม่มีเรื่องค้างที่ต้องจัดการ 🎉</p>';
  }
  var WTABS = [['watch', 'ต้องจับตา'], ['wait', 'รอปิดโครงการ'], ['due', 'ใกล้ครบกำหนด 30 วัน'], ['all', 'ทั้งหมด']];
  function watchLists() {
    var t = D.today, ps = D.ctx.fProjs, hk = function (p) { return healthOf(p, t); }, end = function (p) { return p.end ? +pd(p.end) : 9e15; };
    var rank = { late: 0, risk: 1, ok: 2, done: 3 };
    return {
      watch: D.openP.filter(function (p) { var k = hk(p); return k === 'late' || k === 'risk'; }).sort(function (a, b) { return end(a) - end(b); }),
      wait: D.donePending.slice().sort(function (a, b) { return (Number(b.cost) || 0) - (Number(a.cost) || 0); }),
      due: D.openP.filter(function (p) { return p.end && Math.ceil((pd(p.end) - t) / DAY) <= 30; }).sort(function (a, b) { return end(a) - end(b); }),
      all: ps.filter(function (p) { return p.status !== 'cancelled'; }).sort(function (a, b) { return rank[hk(a)] - rank[hk(b)] || end(a) - end(b); }),
    };
  }
  function renderWatch() {
    var L = watchLists(), MAXW = 10;
    if (!L[S.wTab]) S.wTab = 'watch';
    $('ovd-watch-tabs').innerHTML = WTABS.map(function (w) { return '<button type="button" data-w="' + w[0] + '" aria-pressed="' + (w[0] === S.wTab) + '">' + w[1] + ' <span class="ovd-tab-n">' + L[w[0]].length + '</span></button>'; }).join('');
    var list = L[S.wTab];
    $('ovd-watch').innerHTML = list.length ? '<div class="ovd-list">' + rowsHtml(list.slice(0, MAXW).map(projRow)) + '</div>'
      : '<p class="ovd-muted" style="text-align:center;padding:28px 0">' + ({ watch: 'ไม่มีโครงการล่าช้าหรือเสี่ยง 🎉', wait: 'ไม่มีโครงการค้างรอปิด 🎉', due: 'ไม่มีโครงการครบกำหนดใน 30 วัน', all: 'ไม่มีโครงการตามตัวกรอง' })[S.wTab] + '</p>';
    $('ovd-watch-more').textContent = list.length > MAXW ? 'แสดง ' + MAXW + ' จาก ' + list.length + ' โครงการ' : '';
  }
  function renderHtml() {
    var ctx = D.ctx, h = ctx.health;
    renderKpis();
    $('ovd-port-sub').textContent = ctx.fProjs.length + ' โครงการ · กำลังดำเนินการ ' + (ctx.fProjs.length - h.completed) + ' · เสร็จแล้ว ' + h.completed;
    $('ovd-res-sub').textContent = 'ทีมงาน ' + D.staff.length + ' คน · มีงานเดือน ' + mLabelL(D.m0) + ' ' + pct(D.staff.length - D.freeAt(D.m0), D.staff.length) + '%';
    donutLegend('ovd-lg-share', shareItems(), fmtM);
    donutLegend('ovd-lg-health', healthItems());
    donutLegend('ov-resource-legend', resItems());
    $('ovd-hd-card').hidden = !D.canHd;
    if (D.canHd) $('ovd-hd-sub').textContent = D.tickets.length + ' เรื่อง · เกิน SLA ' + D.tickets.filter(D.breached).length + ' · ยังไม่มอบหมาย ' + D.tickets.filter(function (t) { return !t.assigneeId; }).length;
    renderActs(); renderWatch(); fillDept(); renderPeople(); syncPeopleView(); renderFcSide();
    $('ov-m3d').setAttribute('aria-pressed', S.mode3d); $('ov-m2d').setAttribute('aria-pressed', !S.mode3d);
    document.getElementById('view-overview').classList.toggle('ovd-3d', S.mode3d);
  }
  function shareItems() {
    return (window.PTYPES || []).map(function (t) { return { id: t.id, n: t.label, c: t.color, v: sum(D.ctx.fProjs.filter(function (p) { return p.typeId === t.id; }).map(function (p) { return Number(p.cost) || 0; })) }; }).filter(function (x) { return x.v > 0; });
  }
  function healthItems() { var h = D.ctx.health; return [{ k: 'ok', n: 'ปกติ', v: h.onTrack, c: '--teal' }, { k: 'risk', n: 'เสี่ยง', v: h.atRisk, c: '--amber' }, { k: 'late', n: 'ล่าช้า', v: h.delayed, c: '--coral' }]; }
  function resItems() {
    var m = D.m0, at = function (f) { return D.staff.filter(function (x) { return f(x.cnt[m]); }); };
    return [{ n: 'เกินกำลัง (>3)', c: '--coral', list: at(function (v) { return v > 3; }) }, { n: 'ปกติ (1–3)', c: '--indigo', list: at(function (v) { return v >= 1 && v <= 3; }) }, { n: 'ว่าง', c: '--teal', list: at(function (v) { return v === 0; }) }]
      .map(function (r) { r.v = r.list.length; return r; });
  }

  /* ───────── charts ───────── */
  // ภาระงานรายบุคคล × เดือน (3D) — กรองตามแผนกที่เลือก
  function drawHeat() {
    if (!D || libState !== 2) return;
    var rowsH = pStaff().slice().sort(function (a, b) { return sum(b.cnt.slice(0, 12)) - sum(a.cnt.slice(0, 12)); });
    var heat = []; rowsH.forEach(function (x, si) { for (var m = 0; m < 12; m++) heat.push([si, m, x.cnt[m]]); });
    CLICK['ovd-c-heat'] = { item: function (p) { var v = p.value || (p.data && p.data.value); if (v && rowsH[v[0]]) staffModal(rowsH[v[0]].s.id, v[1]); } };
    mount('ovd-c-heat', function (f2) {
      if (!rowsH.length) return empty(S.pDept ? 'ไม่มีพนักงานในแผนกนี้' : 'ไม่มีพนักงานที่ใช้งานอยู่');
      var names = rowsH.map(function (x) { return x.s.nickname || (x.s.name || '').split(' ')[0]; });
      var pieces = [{ min: 0, max: 0, color: C('--teal') }, { min: 1, max: 2, color: C('--sky') }, { min: 3, max: 3, color: C('--amber') }, { min: 4, max: 999, color: C('--coral') }];
      var tt = tip({ formatter: function (p) { var v = p.value || p.data.value; return '<b>' + esc(names[v[0]]) + '</b> · ' + MS[v[1]] + '<br>' + v[2] + ' โครงการพร้อมกัน<br><span style="color:' + C('--txt3') + '">กดเพื่อดูรายละเอียด</span>'; } });
      var mx = Math.max(5, Math.max.apply(null, heat.map(function (h) { return h[2]; })));
      if (!S.mode3d || f2 || !hasGL) {
        return { tooltip: tt, grid: { left: 4, right: 12, top: 8, bottom: 4, containLabel: true }, visualMap: { type: 'piecewise', show: false, dimension: 2, pieces: pieces },
          xAxis: ax({ type: 'category', data: names, axisLabel: { interval: 0, rotate: names.length > 16 ? 45 : 0 } }), yAxis: ax({ type: 'category', data: MS, inverse: true }),
          series: [{ type: 'heatmap', data: heat, itemStyle: { borderColor: C('--surface'), borderWidth: 3, borderRadius: 4 }, label: { show: true, color: '#1a1d2e', fontSize: 11, fontWeight: 700 } }] };
      }
      // ป้ายแกนมีพื้นทึบ — ไม่ให้จางไปกับ postEffect/พื้นหลัง
      var lab = { color: C('--txt'), fontSize: 13, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Noto Sans Thai', backgroundColor: C('--surface'), padding: [2, 5], borderRadius: 4 };
      return { tooltip: tt, visualMap: { type: 'piecewise', show: false, dimension: 2, pieces: pieces },
        xAxis3D: { type: 'category', data: names, name: '', axisLabel: Object.assign({ interval: 0, textStyle: lab }, lab) },
        yAxis3D: { type: 'category', data: MS, name: '', axisLabel: Object.assign({ interval: 0, textStyle: lab }, lab) },
        zAxis3D: { type: 'value', name: '', max: mx, minInterval: 1, axisLabel: Object.assign({ textStyle: lab }, lab) },
        grid3D: { boxWidth: Math.min(260, 14 * names.length + 40), boxDepth: 110, boxHeight: 42, top: -10,
          axisLine: { lineStyle: { color: C('--border2') } }, axisTick: { show: false }, splitLine: { lineStyle: { color: C('--border') } }, axisPointer: { show: false }, environment: 'none',
          viewControl: { alpha: 26, beta: 32, distance: 210, minDistance: 150, maxDistance: 360, autoRotate: S.rotate, autoRotateSpeed: 5, autoRotateAfterStill: 4, damping: .85 },
          light: { main: { intensity: 1.3, shadow: true, shadowQuality: 'high', alpha: 48, beta: 28 }, ambient: { intensity: .35 } },
          postEffect: { enable: true, SSAO: { enable: true, radius: 3, intensity: 1.3, quality: 'medium' }, FXAA: { enable: true } } },
        series: [{ type: 'bar3D', data: heat.map(function (d) { return { value: d }; }), shading: 'lambert', bevelSize: .3, bevelSmoothness: 4, itemStyle: { opacity: .96 }, emphasis: { label: { show: false }, itemStyle: { color: C('--violet') } } }] };
    });
  }
  function drawCharts() {
    if (!D || libState !== 2) return;
    var NOW = D.NOW;
    mount('ovd-c-fc', fcOpt);

    // เป้าหมายเทียบผลงาน
    var tr = (window._ovTgtRows || []);
    CLICK['ovd-c-target'] = { axis: function (i) {
      var r = tr[i]; if (!r) return;
      var ps = D.annual.filter(function (p) { return (r.typeIds || []).includes(p.typeId); });
      openModal({ kicker: 'เป้าหมายเทียบผลงาน · ปี ' + D.yrBE, title: r.name, color: r.color,
        stats: [['เป้าหมาย', r.tgt ? fc(r.tgt) : 'ไม่ได้ตั้งเป้า'], ['ออกโครงการ', fc(r.total) + (r.tgt ? ' · ' + r.pctT + '%' : '')], ['ปิดโครงการ', fc(r.closed) + (r.tgt ? ' · ' + r.pctC + '%' : '')], ['ต้องหาเพิ่ม', r.tgt ? fc(r.needFind) : '—', r.needFind > 0 ? 'crit' : ''], ['ต้องปิดเพิ่ม', r.tgt ? fc(r.needClose) : '—', r.needClose > 0 ? 'crit' : '']],
        rows: ps.map(projRow), listTitle: 'โครงการในกลุ่มนี้' });
    } };
    mount('ovd-c-target', function () {
      if (!tr.length) return empty('ยังไม่ได้ตั้งเป้าหมายปีนี้');
      return { grid: { left: 8, right: 36, top: 50, bottom: 8, containLabel: true }, legend: legend({ data: ['เป้าหมาย', 'ออกโครงการ', 'ปิดโครงการ'] }),
        tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var r = tr[ps[0].value[0]]; if (!r) return ''; var pc = function (x) { return r.tgt ? ' <span style="color:' + C('--txt3') + '">(' + pct(x, r.tgt) + '%)</span>' : ''; };
          return '<b>' + esc(r.name) + '</b><br>เป้าหมาย: <b>' + (r.tgt ? fc(r.tgt) : '—') + '</b><br>ออกโครงการ: <b>' + fc(r.total) + '</b>' + pc(r.total) + '<br>ปิดโครงการ: <b>' + fc(r.closed) + '</b>' + pc(r.closed) + (r.needFind > 0 ? '<br><span style="color:' + C('--coral') + '">ต้องหาเพิ่ม ' + fc(r.needFind) + '</span>' : '') + '<br><span style="color:' + C('--txt3') + '">กดเพื่อดูรายละเอียด</span>'; } }),
        xAxis: ax({ type: 'category', data: tr.map(function (r) { return r.name; }), axisLabel: { interval: 0, width: 90, overflow: 'break' } }),
        yAxis: ax({ type: 'value', axisLabel: { formatter: fmtM } }),
        series: [cube('เป้าหมาย', C('--violet'), tr.map(function (r, i) { return [i, r.tgt, 0]; }), { offset: -.26, ratio: .2, depth: .5 }),
          cube('ออกโครงการ', C('--indigo'), tr.map(function (r, i) { return [i, r.total, 0]; }), { offset: 0, ratio: .2, depth: .5 }),
          cube('ปิดโครงการ', C('--teal'), tr.map(function (r, i) { return [i, r.closed, 0]; }), { offset: .26, ratio: .2, depth: .5 }), floor()] };
    });

    // สัดส่วนมูลค่าตามประเภท
    var sh = shareItems();
    CLICK['ovd-c-share'] = { item: function (p) {
      var it = sh.filter(function (x) { return x.v > 0; })[p.seriesType === 'pie' ? p.dataIndex : p.seriesIndex]; if (!it) return;
      var ps = D.ctx.fProjs.filter(function (x) { return x.typeId === it.id; });
      openModal({ kicker: 'สัดส่วนมูลค่าตามประเภท', title: it.n, color: it.c, stats: [['มูลค่า', fc(it.v)], ['สัดส่วน', pct(it.v, D.ctx.totalBudget) + '%'], ['ยังไม่ปิด', ps.filter(function (x) { return x.stage !== 'close'; }).length + ' โครงการ']], rows: ps.map(projRow), listTitle: 'โครงการ' });
    } };
    mount('ovd-c-share', function (f2) { return donutOpt(sh, f2, fc); });

    // ยอดปิดโครงการรายเดือน (12 เดือนของปีที่เลือก)
    var f = D.FC[S.scen], m12 = MS.slice();
    CLICK['ovd-c-rev'] = { axis: function (i) {
      if (i > 11) return;
      var ps = i < NOW ? (D.closedL[i] || []) : D.pipe.filter(function (x) { return x.e === i; }).map(function (x) { return x.p; });
      openModal({ kicker: 'ยอดปิดโครงการรายเดือน', title: mLabelL(i), color: '--teal',
        stats: [[i < NOW ? 'ปิดแล้ว' : 'คาดว่าจะปิด (' + SCEN[S.scen].lab + ')', fc(f.closed[i])], ['ยอดสะสม', fc(f.cum[i])]].concat(D.tY ? [['เป้าตามเวลา', fc(D.tgtCum[i])], ['ส่วนต่าง', fc(f.cum[i] - D.tgtCum[i]), f.cum[i] < D.tgtCum[i] ? 'crit' : 'ok']] : []),
        listTitle: i < NOW ? 'โครงการที่ปิด (ตามเดือนวันสิ้นสุด)' : 'โครงการที่กำหนดสิ้นสุดเดือนนี้ (ยังไม่ปิด)', rows: ps.map(projRow) });
    } };
    mount('ovd-c-rev', function () {
      var a = axisBase(), cumA = f.cum.slice(0, 12).map(function (v, i) { return i < NOW ? v : null; }), cumF = f.cum.slice(0, 12).map(function (v, i) { return i >= NOW - 1 ? v : null; });
      return { grid: { left: 8, right: 14, top: 50, bottom: 8, containLabel: true },
        legend: legend({ data: ['ปิดแล้ว', 'คาดว่าจะปิด', 'ยอดสะสม'].concat(D.tY ? ['เป้าสะสม'] : []) }),
        tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var i = ps[0].dataIndex; return '<b>' + mLabelL(i) + '</b><br>' + (i < NOW ? 'ปิดแล้ว' : 'คาดว่าจะปิด') + ': <b>' + fc(f.closed[i]) + '</b><br>ยอดสะสม: <b>' + fc(f.cum[i]) + '</b>' + (D.tY ? '<br>เป้าสะสม: <b>' + fc(D.tgtCum[i]) + '</b>' : '') + '<br><span style="color:' + C('--txt3') + '">กดเพื่อดูโครงการ</span>'; } }),
        xAxis: ax({ type: 'category', data: m12 }),
        yAxis: [ax({ type: 'value', name: 'รายเดือน', nameTextStyle: { color: C('--txt3'), fontSize: 11 }, axisLabel: { formatter: fmtM } }), Object.assign(ax({ type: 'value', name: 'สะสม', nameTextStyle: { color: C('--txt3'), fontSize: 11 }, axisLabel: { formatter: fmtM } }), { splitLine: { show: false } })],
        series: [cube('ปิดแล้ว', C('--teal'), f.closed.slice(0, 12).map(function (v, i) { return [i, i < NOW ? v : 0, 0]; }), { ratio: .46 }),
          cube('คาดว่าจะปิด', C('--teal'), f.closed.slice(0, 12).map(function (v, i) { return [i, i >= NOW ? v : 0, 0]; }), { ratio: .46, ghost: true }),
          { name: 'ยอดสะสม', type: 'line', yAxisIndex: 1, data: cumA, smooth: .3, symbolSize: 6, z: 5, lineStyle: { width: 3, color: C('--indigo') }, itemStyle: { color: C('--indigo') } },
          { name: 'ยอดสะสม ', type: 'line', yAxisIndex: 1, data: cumF, smooth: .3, symbol: 'none', z: 5, lineStyle: { width: 2, type: 'dashed', color: C('--indigo') }, itemStyle: { color: C('--indigo') } }]
          .concat(D.tY ? [{ name: 'เป้าสะสม', type: 'line', yAxisIndex: 1, data: D.tgtCum.slice(0, 12), symbol: 'none', z: 4, lineStyle: { width: 2, type: [6, 4], color: C('--violet') }, itemStyle: { color: C('--violet') } }] : [])
          .concat([floor()]) };
    });

    // Adv.
    CLICK['ovd-c-adv'] = { axis: advModal };
    mount('ovd-c-adv', function () {
      var g = D.advGroups;
      if (!D.advOpen.length) return empty('ไม่มี Adv. ค้าง');
      return { grid: { left: 4, right: 34, top: 28, bottom: 4, containLabel: true },
        tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var x = g[ps[0].dataIndex]; return '<b>' + esc(x.n) + '</b>: ' + x.items.length + ' รายการ · ' + fc(sum(x.items.map(function (a) { return a.amount || 0; }))); } }),
        xAxis: ax({ type: 'category', data: g.map(function (x) { return x.n; }), axisLabel: { interval: 0, fontSize: 10 } }),
        yAxis: ax({ type: 'value', minInterval: 1 }),
        series: [cube('Adv.', g.map(function (x) { return col(x.c); }), g.map(function (x, i) { return [i, x.items.length, 0]; }), { ratio: .46 }), topLabels(g.map(function (x) { return x.items.length; })), floor()] };
    });

    // Stage
    var st = (window.STAGES || []).map(function (s) { return { s: s, ps: D.ctx.fProjs.filter(function (p) { return p.stage === s.id; }) }; });
    CLICK['ovd-c-stage'] = { axis: function (i) {
      var x = st[i]; if (!x) return;
      openModal({ kicker: 'โครงการตาม Stage', title: x.s.label, color: x.s.color, stats: [['จำนวน', x.ps.length + ' โครงการ'], ['สัดส่วน', pct(x.ps.length, D.ctx.fProjs.length) + '%'], ['มูลค่ารวม', fc(sum(x.ps.map(function (p) { return Number(p.cost) || 0; })))]], rows: x.ps.map(projRow), listTitle: 'โครงการ' });
    } };
    mount('ovd-c-stage', function () {
      return { grid: { left: 4, right: 36, top: 30, bottom: 4, containLabel: true },
        tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var x = st[ps[0].dataIndex]; return '<b>' + esc(x.s.label) + '</b>: ' + x.ps.length + ' โครงการ'; } }),
        xAxis: ax({ type: 'category', data: st.map(function (x) { return x.s.label; }), axisLabel: { interval: 0, rotate: st.length > 5 ? 25 : 0, fontSize: 10 } }),
        yAxis: ax({ type: 'value', minInterval: 1 }),
        series: [cube('Stage', st.map(function (x) { return x.s.color; }), st.map(function (x, i) { return [i, x.ps.length, 0]; }), { ratio: .5 }), topLabels(st.map(function (x) { return x.ps.length; })), floor()] };
    });

    // สุขภาพโครงการ
    var hi = healthItems();
    CLICK['ovd-c-health'] = { item: function (p) { var it = hi.filter(function (x) { return x.v > 0; })[p.seriesType === 'pie' ? p.dataIndex : p.seriesIndex]; if (it) healthModal(it.k); } };
    mount('ovd-c-health', function (f2) { return donutOpt(hi, f2); });

    // ภาระงานรายเดือน (ซ้อนตามประเภท)
    var types = (window.PTYPES || []).filter(function (t) { return D.wlType[t.id] && sum(D.wlType[t.id].slice(0, 12)); });
    var totals = D.wl.slice(0, 12);
    CLICK['ovd-c-work'] = { axis: function (i) {
      if (i > 11) return;
      var lvS = D.staff.map(function (x) { return { x: x, v: x.cnt[i] }; }), over = lvS.filter(function (x) { return x.v > 3; }).sort(function (a, b) { return b.v - a.v; });
      openModal({ kicker: 'ภาระงานรายเดือน', title: mLabelL(i), color: '--violet',
        stats: [['โครงการทั้งหมด', totals[i] + ' โครงการ'], ['เกินกำลัง', over.length + ' คน', over.length ? 'crit' : ''], ['ว่าง', D.freeAt(i) + ' คน', 'ok']],
        html: '<h4>คนที่เกินกำลังเดือนนี้ <span>' + over.length + '</span></h4><div class="ovd-tchips">' + (over.map(function (x) { return '<span class="ovd-chip crit">' + esc(x.x.s.nickname || x.x.s.name) + ' · ' + x.v + '</span>'; }).join('') || '<span class="ovd-muted">ไม่มี</span>') + '</div>',
        listTitle: 'โครงการที่ดำเนินอยู่', rows: (D.wlP[i] || []).map(projRow) });
    } };
    mount('ovd-c-work', function () {
      if (!types.length) return empty('ไม่มีโครงการที่มีวันเริ่ม–วันสิ้นสุด');
      var base = zeros(12);
      var series = types.map(function (t) { var rows = D.wlType[t.id].slice(0, 12).map(function (v, i) { var r = [i, base[i] + v, base[i], v]; base[i] += v; return r; }); return cube(t.label, t.color, rows, { ratio: .5 }); });
      series.push(topLabels(totals)); series.push(floor());
      return { grid: { left: 4, right: 36, top: 50, bottom: 4, containLabel: true }, legend: legend({ data: types.map(function (t) { return t.label; }), type: 'scroll' }),
        tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var i = ps[0].dataIndex; return '<b>' + mLabelL(i) + ' · ' + totals[i] + ' โครงการ</b><br>' + types.filter(function (t) { return D.wlType[t.id][i]; }).map(function (t) { return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + t.color + ';margin-right:5px"></span>' + esc(t.label) + ': <b>' + D.wlType[t.id][i] + '</b>'; }).join('<br>') + '<br><span style="color:' + C('--txt3') + '">กดเพื่อดูรายละเอียด</span>'; } }),
        xAxis: ax({ type: 'category', data: m12 }), yAxis: ax({ type: 'value', minInterval: 1 }), series: series };
    });

    // สถานะทีมงาน
    var ri = resItems();
    CLICK['ovd-c-res'] = { item: function (p) {
      var it = ri.filter(function (x) { return x.v > 0; })[p.seriesType === 'pie' ? p.dataIndex : p.seriesIndex]; if (!it) return;
      openModal({ kicker: 'สถานะทีมงาน · ' + mLabelL(D.m0), title: it.n, color: it.c, stats: [['จำนวน', it.v + ' คน'], ['สัดส่วน', pct(it.v, D.staff.length) + '%']],
        rows: it.list.slice().sort(function (a, b) { return b.cnt[D.m0] - a.cnt[D.m0]; }).map(function (x) { return { n: esc((x.s.nickname ? x.s.nickname + ' · ' : '') + x.s.name), m: lvOf(x.cnt[D.m0]).l, r: x.cnt[D.m0] + ' โครงการ', act: 'staff:' + x.s.id }; }), listTitle: 'รายชื่อ (กดเพื่อดูภาระงานรายเดือน)' });
    } };
    mount('ovd-c-res', function (f2) { return donutOpt(ri, f2); });

    drawHeat();

    // Helpdesk
    if (D.canHd) {
      CLICK['ovd-c-hd'] = { axis: function (i) { var h = D.hd[i]; if (h) ticketModal(h.n, h.items, h.c); } };
      mount('ovd-c-hd', function () {
        if (!D.tickets.length) return empty('ไม่มี Ticket ที่เปิดอยู่');
        return { grid: { left: 4, right: 36, top: 44, bottom: 4, containLabel: true }, legend: legend({ data: ['เปิดอยู่', 'เกิน SLA'] }),
          tooltip: tip({ trigger: 'axis', axisPointer: shadowPtr, formatter: function (ps) { var h = D.hd[ps[0].dataIndex]; return '<b>' + esc(h.n) + '</b><br>เปิดอยู่: <b>' + h.items.length + '</b><br>เกิน SLA: <b style="color:' + C('--coral') + '">' + h.br + '</b><br><span style="color:' + C('--txt3') + '">กดเพื่อดูรายการ</span>'; } }),
          xAxis: ax({ type: 'category', data: D.hd.map(function (h) { return h.n; }) }), yAxis: ax({ type: 'value', minInterval: 1 }),
          series: [cube('เปิดอยู่', D.hd.map(function (h) { return h.c; }), D.hd.map(function (h, i) { return [i, h.items.length, 0]; }), { offset: -.14, ratio: .3, depth: .7 }),
            cube('เกิน SLA', C('--coral'), D.hd.map(function (h, i) { return [i, h.br, 0]; }), { offset: .2, ratio: .18, depth: .6 }), floor()] };
      });
    }
  }

  /* ───────── libs ───────── */
  function ensureLibs() {
    if (libState === 2) return Promise.resolve(true);
    if (libState === 1) return libP;
    libState = 1;
    document.querySelectorAll('#view-overview .ovd-chart').forEach(function (el) { if (!el.childElementCount) el.setAttribute('data-loading', 'กำลังโหลดกราฟ…'); });
    libP = window.LibLoader.want('echarts').then(function (ok) {
      libState = ok ? 2 : 0;
      document.querySelectorAll('#view-overview .ovd-chart').forEach(function (el) { if (ok) el.removeAttribute('data-loading'); else el.setAttribute('data-loading', 'โหลดกราฟไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วเปิดหน้านี้ใหม่'); });
      return ok;
    });
    return libP;
  }
  function ensureGL() {
    if (glTried || !S.mode3d) return;
    glTried = true;
    if (!webgl()) return;
    window.LibLoader.want('echartsgl').then(function (ok) { if (ok) { hasGL = true; drawCharts(); if (D) syncPeopleView(); } });
  }

  /* ───────── wiring (ครั้งเดียว) ───────── */
  function wire() {
    if (wired) return; wired = true;
    var rz = {}, rzT = 0;
    if (window.ResizeObserver) ro = new ResizeObserver(function (en) {
      en.forEach(function (e) { rz[e.target.id] = 1; });
      if (!rzT) rzT = requestAnimationFrame(function () { rzT = 0; Object.keys(rz).forEach(function (id) { var c = charts[id]; if (c && !c.isDisposed()) c.resize(); }); rz = {}; flushHidden(); });
    });
    new MutationObserver(function () { if (D && libState === 2) drawCharts(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    $('ovd-fc-range').addEventListener('input', function (e) { stopPlay(); setSel(+e.target.value); });
    $('ovd-fc-ticks').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { stopPlay(); setSel(+b.dataset.i); } });
    $('ovd-fc-scen').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.scen = b.dataset.s; renderFcSide(); drawCharts(); });
    $('ovd-fc-play').addEventListener('click', togglePlay);
    $('ovd-v-people').addEventListener('click', function () { S.pView = 'people'; lsSet('ov_pview', 'people'); syncPeopleView(); });
    $('ovd-v-matrix').addEventListener('click', function () { S.pView = 'matrix'; lsSet('ov_pview', 'matrix'); syncPeopleView(); });
    $('ovd-rot').addEventListener('click', function (e) {
      S.rotate = !S.rotate; e.currentTarget.querySelector('span').textContent = S.rotate ? 'หยุดหมุน' : 'หมุนอัตโนมัติ';
      var c = charts['ovd-c-heat']; if (c && hasGL && S.mode3d) c.setOption({ grid3D: { viewControl: { autoRotate: S.rotate } } });
    });
    $('ovd-dept').addEventListener('change', function (e) { S.pDept = e.target.value; lsSet('ov_pdept', S.pDept); renderPeople(); drawHeat(); });
    $('ovd-people-month').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.pMonth = +b.dataset.m; renderPeople(); } });
    $('ovd-people').addEventListener('click', function (e) { var b = e.target.closest('.ovd-pf'); if (b) staffModal(b.dataset.sid, S.pMonth); });
    $('ovd-watch-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.wTab = b.dataset.w; lsSet('ov_wtab', S.wTab); renderWatch(); });
    $('ovd-watch').addEventListener('click', function (e) { var r = e.target.closest('[data-act]'); if (r && window.openProjModal) window.openProjModal(r.getAttribute('data-act').split(':').slice(1).join(':')); });
    $('ovd-acts').addEventListener('click', function (e) { var b = e.target.closest('.ovd-act'); if (!b) return; var a = D.acts[+b.dataset.i]; if (!a) return; if (a.open) a.open(); else if (a.view) window.goView(a.view); });
    $('ovd-kpis').addEventListener('click', function (e) { var b = e.target.closest('[data-kpi]'); if (b) onKpi(b.dataset.kpi); });
    if (!S.rotate) $('ovd-rot').querySelector('span').textContent = 'หมุนอัตโนมัติ';
  }

  (window.requestIdleCallback || setTimeout)(function () { if (window.LibLoader) window.LibLoader.want('echarts'); });

  window.ovDash = {
    render: function (ctx) {
      if (!$('ovd-c-fc')) return;
      wire();
      D = build(ctx);
      var key = D.yrBE + '|' + D.N + '|' + D.NOW;
      if (S.selKey !== key) { S.selKey = key; S.sel = D.NOW < D.N ? D.NOW : D.N - 1; S.pMonth = D.Y === D.curY ? D.today.getMonth() : 0; stopPlay(); }
      if (S.sel > D.N - 1) S.sel = D.N - 1;
      renderHtml();
      clearTimeout(S.drawT);
      S.drawT = setTimeout(function () { ensureLibs().then(function (ok) { if (ok) { drawCharts(); ensureGL(); } }); }, libState === 2 ? 120 : 0);
    },
    setMode: function (on) {
      S.mode3d = !!on; lsSet('ov_3d', on ? '1' : '0');
      if (!D) return;
      renderHtml(); ensureGL(); drawCharts();
    },
  };
})();
