/**
 * dom.util.js — DOM Manipulation & UI State Utilities
 * showLoader, hideLoader, showDbError, และ DOM helpers
 */
(function () {

  // ── System Loader ──
  window.showLoader = function (txt) {
    var el   = document.getElementById('sys-loader');
    var text = document.getElementById('sys-loader-text');
    var pulse = document.querySelector('#sys-loader .pulse');
    if (text)  text.innerHTML = txt || 'กำลังโหลดข้อมูล...';
    if (pulse) pulse.style.display = 'inline-block';
    if (el)    el.classList.add('on');
  };

  window.hideLoader = function () {
    var el = document.getElementById('sys-loader');
    if (el) el.classList.remove('on');
  };

  // ── Database Error Display ──
  window.showDbError = function (err) {
    console.error('Database Error:', err);
    var errMsg   = err && err.message ? window.esc(err.message) : '';
    var isNoTable = errMsg.includes('does not exist') || errMsg.includes('relation') || errMsg.includes('42P01');

    var msg = '<div style="color:var(--coral);font-weight:bold;font-size:16px;margin-bottom:10px;">❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้</div>';
    msg += '<div style="font-size:13px;color:var(--txt);text-align:left;background:var(--surface2);padding:14px;border-radius:8px;border:1px solid var(--border);max-width:520px;line-height:1.7;">';

    if (isNoTable) {
      msg += '<strong style="color:var(--coral);">⚠ ตารางยังไม่ถูกสร้างในฐานข้อมูล</strong><br><br>';
      msg += 'กรุณารัน <code>db-schema.sql</code> ใน SQL Editor ของฐานข้อมูลก่อน<br><br>';
    } else {
      msg += '<strong>ตรวจสอบ:</strong><br>';
      msg += '1. รัน <code>db-schema.sql</code> ใน SQL Editor แล้วหรือไม่<br>';
      msg += '2. <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> (ENV) ถูกต้อง<br>';
      msg += '3. RLS policy อนุญาต <code>anon</code> หรือไม่<br>';
    }
    if (errMsg) msg += '<code style="font-size:11px;color:var(--coral);word-break:break-all;">' + errMsg + '</code>';
    msg += '</div>';
    msg += '<button onclick="location.reload()" style="margin-top:14px;padding:8px 20px;background:var(--violet);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">🔄 ลองใหม่</button>';

    var text  = document.getElementById('sys-loader-text');
    var pulse = document.querySelector('#sys-loader .pulse');
    var el    = document.getElementById('sys-loader');
    if (text)  text.innerHTML = msg;
    if (pulse) pulse.style.display = 'none';
    if (el)    el.classList.add('on');
  };

  // ── Toast Notifications (non-blocking, bottom-right, auto-dismiss) ──
  var _toastWrap = null;
  function _toastContainer() {
    if (_toastWrap && document.body.contains(_toastWrap)) return _toastWrap;
    _toastWrap = document.createElement('div');
    _toastWrap.id = 'toast-wrap';
    _toastWrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99998;display:flex;flex-direction:column;gap:8px;max-width:340px;';
    document.body.appendChild(_toastWrap);
    return _toastWrap;
  }
  var TOAST_STYLE = {
    info:    { bg: 'var(--violet, #7c5cfc)', ic: 'ℹ️' },
    success: { bg: '#22c55e', ic: '✅' },
    warn:    { bg: '#f59e0b', ic: '⚠️' },
    error:   { bg: 'var(--coral, #ef4444)', ic: '❌' },
  };
  window.showToast = function (msg, type) {
    var c = TOAST_STYLE[type] || TOAST_STYLE.info;
    var wrap = _toastContainer();
    var el = document.createElement('div');
    el.style.cssText = 'background:' + c.bg + ';color:#fff;padding:10px 14px;border-radius:10px;font-size:12.5px;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;align-items:flex-start;gap:8px;';
    el.innerHTML = '<span>' + c.ic + '</span><span style="flex:1;line-height:1.4;">' + msg + '</span>';
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s,transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(8px)';
      setTimeout(function () { el.remove(); }, 250);
    }, 4500);
  };

  // ── Database Error Display (soft variant — background/non-critical collections) ──
  // Unlike showDbError, this never covers the whole app: it just logs + shows a
  // dismissible toast, so a missing/unmigrated table on a background feature
  // (e.g. site_deploy_forms) doesn't lock users out of the rest of the app.
  window.showDbErrorSoft = function (err, label) {
    console.error('[DB Background Sync Error]' + (label ? ' (' + label + ')' : '') + ':', err);
    var msg = (label ? window.esc(label) + ': ' : '') + 'ซิงค์ข้อมูลบางส่วนไม่สำเร็จ (ดูรายละเอียดใน Console)';
    window.showToast(msg, 'warn');
  };

  // ── View Active Check ──
  window._von = function (id) {
    var el = document.getElementById(id);
    return el && el.classList.contains('on');
  };

  // ── แถบความคืบหน้า (pct 0-100) ──
  window.pbarHtml = function (pct, color) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="pbar"><div class="pbar-fill" style="width:' + pct + '%;background:' + (color || 'var(--violet)') + '"></div></div>';
  };

  // ── Highlight helper shared by the combobox widgets below ──
  function _cmbHi(txt, q) {
    if (!q) return window.esc(txt);
    var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
    while (i < txt.length) {
      var x = lt.indexOf(lq, i);
      if (x < 0) { out += window.esc(txt.slice(i)); break; }
      out += window.esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + window.esc(txt.slice(x, x + lq.length)) + '</mark>';
      i = x + lq.length;
    }
    return out;
  }

  // ── Generic Searchable Grouped Project Combobox ──
  // Used by the Advance "เลือกโครงการ" picker and the Site Notice Form project picker
  // (same search / grouping / keyboard-nav UX everywhere a project needs to be picked).
  // Safe to call repeatedly on the same DOM nodes: first call binds listeners,
  // later calls just refresh the project list + selection (via inp._cmbUpdate).
  // opts (ไม่บังคับ): allLabel = เพิ่มตัวเลือกบนสุด (ค่า '') เช่น "ทุกโครงการ" สำหรับช่องกรอง ·
  // fixed = วาง dropdown แบบ position:fixed (ใช้ในโมดัล — .m-body มี overflow ทำให้ dropdown ถูกครอบตัด) ·
  // minWidth = ความกว้างขั้นต่ำของ dropdown (px) เผื่อช่องแคบในแถบเครื่องมือ
  // ── วางตำแหน่ง dropdown แบบ position:fixed ให้อยู่ในจอเสมอ (ใช้ร่วมกันทุกช่องค้นหา-เลือก) ──
  // พื้นที่ด้านล่างไม่พอ (ช่องอยู่ล่างจอ / popup แบบ bottom-sheet บนมือถือ) → เปิดขึ้นด้านบนแทน ·
  // ความสูงจอใช้ visualViewport (คีย์บอร์ดมือถือเปิดแล้วจอเตี้ยลง) · จอแคบ: กว้างไม่เกินจอ
  var _lastDrop = null;
  window.placeDropdown = function (inp, drop, lst, maxH, minW) {
    maxH = maxH || 280;
    var vv = window.visualViewport, vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    var r = inp.getBoundingClientRect();
    var below = vh - r.bottom - 12, above = r.top - 12;
    var up = below < Math.min(maxH, 200) && above > below;
    var vw = window.innerWidth, w = Math.min(Math.max(r.width, minW || 0), vw - 16);
    drop.style.position = 'fixed';
    drop.style.right = 'auto';
    drop.style.width = w + 'px';
    drop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    if (up) { drop.style.top = 'auto'; drop.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
    else { drop.style.bottom = 'auto'; drop.style.top = (r.bottom + 4) + 'px'; }
    lst.style.maxHeight = Math.max(96, Math.min(maxH, up ? above : below)) + 'px';
    _lastDrop = { inp: inp, drop: drop, lst: lst, maxH: maxH, minW: minW };
  };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () {
    var d = _lastDrop;
    if (d && d.drop.style.display !== 'none' && document.body.contains(d.drop)) window.placeDropdown(d.inp, d.drop, d.lst, d.maxH, d.minW);
  });

  window.initProjectCombobox = function (elIds, projects, curPid, onSelect, opts) {
    opts = opts || {};
    var inp = document.getElementById(elIds.inputId), drop = document.getElementById(elIds.dropId),
        lst = document.getElementById(elIds.listId), hid = document.getElementById(elIds.hiddenId);
    if (!inp || !drop || !lst || !hid) return;

    if (inp._cmbUpdate) { inp._cmbOnSelect = onSelect; inp._cmbUpdate(projects, curPid); return; }
    inp._cmbOnSelect = onSelect;

    var IH = 36, HH = 30, BUF = 6;
    var curProjects = projects || [], tmap = {}, tord = [];
    var selId = curPid || '', selName = '', col = new Set(), q = '', fi = -1, flat = [], dt = null, isOpen = false;

    function rebuildGroups() {
      tmap = {}; tord = [];
      window.PTYPES.forEach(function (t) { tmap[t.id] = { id: t.id, label: t.label, color: t.color || 'var(--txt3)', items: [] }; tord.push(t.id); });
      curProjects.forEach(function (p) {
        if (tmap[p.typeId]) tmap[p.typeId].items.push(p);
        else { if (!tmap['__x__']) { tmap['__x__'] = { id: '__x__', label: 'Project อื่น ๆ', color: 'var(--txt3)', items: [] }; tord.push('__x__'); } tmap['__x__'].items.push(p); }
      });
      tord = tord.filter(function (tid) { return tmap[tid] && tmap[tid].items.length > 0; });
    }
    function bFlat(sq) {
      var f = [], lq = sq.toLowerCase();
      if (opts.allLabel && !sq) f.push({ k: 'i', id: '', name: opts.allLabel });
      if (sq) { curProjects.forEach(function (p) { if (p.name.toLowerCase().includes(lq)) f.push({ k: 'i', id: p.id, name: p.name }); }); }
      else { tord.forEach(function (tid) { var g = tmap[tid]; if (!g || !g.items.length) return; f.push({ k: 'h', tid: tid, label: g.label, color: g.color, count: g.items.length }); if (!col.has(tid)) g.items.forEach(function (p) { f.push({ k: 'i', id: p.id, name: p.name }); }); }); }
      return f;
    }
    function render() {
      if (!flat.length) { lst.innerHTML = '<div style="padding:24px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบโครงการ' + (q ? '<br><small style="opacity:.7;">' + window.esc(q) + '</small>' : '') + '</div>'; return; }
      var offs = [], tot = 0; flat.forEach(function (it) { offs.push(tot); tot += (it.k === 'h' ? HH : IH); });
      var st = lst.scrollTop, vh = lst.clientHeight || 260, si = 0, ei = flat.length;
      for (var i = 0; i < flat.length; i++) { if (offs[i] + (flat[i].k === 'h' ? HH : IH) > st - BUF * IH) { si = i; break; } }
      for (var j = si; j < flat.length; j++) { if (offs[j] > st + vh + BUF * IH) { ei = j; break; } }
      var topH = offs[si] || 0, botH = tot - (ei < flat.length ? offs[ei] : tot);
      var html = '<div style="height:' + topH + 'px"></div>';
      flat.slice(si, ei).forEach(function (it, r) {
        var idx = si + r;
        if (it.k === 'h') { var cc = col.has(it.tid); html += '<div class="adc-h" data-tid="' + window.esc(it.tid) + '" style="height:' + HH + 'px;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;font-size:10px;font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);color:' + window.esc(it.color) + ';user-select:none;position:sticky;top:0;z-index:2;"><span style="width:7px;height:7px;border-radius:50%;background:' + window.esc(it.color) + ';flex-shrink:0;display:inline-block;"></span><span>' + window.esc(it.label) + '</span><span style="font-size:9px;color:var(--txt3);margin-left:2px;">(' + it.count + ')</span><span style="margin-left:auto;font-size:9px;opacity:.5;">' + (cc ? '▶' : '▼') + '</span></div>'; }
        else { var foc = idx === fi, isSel = it.id === selId; html += '<div class="adc-i" data-id="' + window.esc(it.id) + '" data-name="' + window.esc(it.name) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">' + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '') + _cmbHi(it.name, q) + '</div>'; }
      });
      html += '<div style="height:' + botH + 'px"></div>';
      lst.innerHTML = html;
    }
    function positionDrop() {
      if (!opts.fixed && !opts.minWidth) return;
      var r = inp.getBoundingClientRect(), w = Math.max(r.width, opts.minWidth || 0);
      if (opts.fixed) { window.placeDropdown(inp, drop, lst, 360, opts.minWidth); return; }
      drop.style.right = 'auto';
      drop.style.width = w + 'px';
    }
    function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; if (opts.fixed) { window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); } }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; if (opts.fixed) { window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); } }
    function selProj(id, name) { selId = id; selName = name; hid.value = id; closeDrop(); inp._cmbOnSelect && inp._cmbOnSelect(id, name); }
    function scFi() { if (fi < 0) return; var top = 0; for (var i = 0; i < fi; i++) top += flat[i] ? (flat[i].k === 'h' ? HH : IH) : 0; if (top < lst.scrollTop) lst.scrollTop = top; else if (top + IH > lst.scrollTop + lst.clientHeight) lst.scrollTop = top + IH - lst.clientHeight; }

    lst.addEventListener('click', function (e) {
      var h = e.target.closest('.adc-h'), it = e.target.closest('.adc-i');
      if (h) { var tid = h.dataset.tid; if (col.has(tid)) col.delete(tid); else col.add(tid); flat = bFlat(q); fi = -1; render(); }
      else if (it) selProj(it.dataset.id, it.dataset.name);
    });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.adc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    lst.addEventListener('scroll', render);
    inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 200); });
    inp.addEventListener('keydown', function (e) {
      var iis = flat.map(function (it, i) { return it.k === 'i' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (e.key === 'Escape') { closeDrop(); return; }
      if (e.key === 'Tab') { closeDrop(); return; }
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); var ci = iis.indexOf(fi); fi = ci < 0 ? iis[0] : iis[ci + 1] !== undefined ? iis[ci + 1] : iis[ci]; render(); scFi(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); var ci2 = iis.indexOf(fi); fi = ci2 <= 0 ? iis[0] : iis[ci2 - 1]; render(); scFi(); }
      else if (e.key === 'Enter') { e.preventDefault(); var it = flat[fi]; if (it && it.k === 'i') selProj(it.id, it.name); }
    });
    document.addEventListener('mousedown', function onDocDown(e) {
      // combobox ถูกลบออกจาก DOM แล้ว (หน้าที่ render markup ใหม่ทุกครั้ง) — ถอด listener ทิ้ง กันสะสม
      if (!document.body.contains(inp)) { document.removeEventListener('mousedown', onDocDown); return; }
      var wrap = elIds.wrapId ? document.getElementById(elIds.wrapId) : inp.parentElement;
      if (wrap && !wrap.contains(e.target)) closeDrop();
    });

    inp._cmbUpdate = function (newProjects, newCurPid) {
      curProjects = newProjects || [];
      rebuildGroups();
      selId = newCurPid || '';
      var _cp = curProjects.find(function (p) { return p.id === selId; });
      selName = _cp ? _cp.name : (opts.allLabel && !selId ? opts.allLabel : '');
      hid.value = selId;
      inp.value = selName;
      col = new Set(); q = ''; fi = -1;
      if (isOpen) closeDrop();
      flat = bFlat('');
      render();
    };
    inp._cmbUpdate(curProjects, selId);
  };

  // ── Markup ของ project combobox ตามรูปแบบ id ชุดเดียวกัน: <key>-wrap / -input / -drop / -list
  // + hidden input (hiddenId) เก็บค่า project id — โค้ดเดิมที่อ่าน .value จาก hiddenId ใช้ต่อได้เลย ──
  window.projectComboHtml = function (key, hiddenId, placeholder, wrapStyle) {
    return '<div id="' + key + '-wrap" style="position:relative;' + (wrapStyle || '') + '">'
      + '<input id="' + key + '-input" type="text" class="f-input" placeholder="' + window.esc(placeholder || 'ค้นหาหรือเลือกโครงการ...') + '" autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
      + '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
      + '<input type="hidden" id="' + hiddenId + '">'
      + '<div id="' + key + '-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
      + '<div id="' + key + '-list" style="max-height:260px;overflow-y:auto;"></div></div></div>';
  };
  window.projectComboIds = function (key, hiddenId) {
    return { wrapId: key + '-wrap', inputId: key + '-input', dropId: key + '-drop', listId: key + '-list', hiddenId: hiddenId };
  };

  // ── Generic Searchable Flat Suggest Combobox ──
  // Free-text input + filtered dropdown suggestions (e.g. เลือกสถานที่ / ชื่อพนักงาน).
  // Unlike initProjectCombobox this does not require picking a listed item —
  // the input keeps whatever the user typed even if it matches nothing.
  window.initSuggestCombobox = function (cfg) {
    var inp = document.getElementById(cfg.inputId), drop = document.getElementById(cfg.dropId), lst = document.getElementById(cfg.listId);
    if (!inp || !drop || !lst) return;
    var q = '', fi = -1, items = [], dt = null, isOpen = false;

    function filtered() {
      var all = cfg.getItems() || [];
      if (!q) return all.slice(0, 50);
      var lq = q.toLowerCase();
      return all.filter(function (n) { return n.toLowerCase().indexOf(lq) !== -1; }).slice(0, 50);
    }
    function render() {
      items = filtered();
      if (!items.length) { lst.innerHTML = '<div style="padding:16px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบรายการ</div>'; return; }
      lst.innerHTML = items.map(function (name, idx) {
        var foc = idx === fi;
        return '<div class="sgc-i" data-idx="' + idx + '" style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : 'transparent') + ';color:var(--txt1);">' + _cmbHi(name, q) + '</div>';
      }).join('');
    }
    function openDrop() { isOpen = true; q = inp.value.trim(); fi = -1; render(); drop.style.display = 'block'; }
    function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; }
    function pick(name) { inp.value = name; closeDrop(); cfg.onSelect && cfg.onSelect(name); }

    lst.addEventListener('click', function (e) { var it = e.target.closest('.sgc-i'); if (it) pick(items[+it.dataset.idx]); });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.sgc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
    inp.addEventListener('focus', openDrop);
    inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; render(); }, 150); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrop(); return; }
      if (!isOpen && e.key === 'ArrowDown') { openDrop(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); fi = Math.min(fi + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fi = Math.max(fi - 1, 0); render(); }
      else if (e.key === 'Enter') { if (isOpen && fi >= 0 && items[fi]) { e.preventDefault(); pick(items[fi]); } }
    });
    document.addEventListener('mousedown', function (e) {
      var wrap = cfg.wrapId ? document.getElementById(cfg.wrapId) : inp.parentElement;
      if (wrap && !wrap.contains(e.target)) closeDrop();
    });
  };

  // ── ช่องแนบไฟล์แบบใช้ง่าย (แบบเดียวกับหน้า help.html ที่ลูกค้าแจ้งเอง) — คลิกเลือก / ลากวาง / Ctrl+V วางภาพ
  // + พรีวิว + ลบทีละไฟล์ · ตรวจชนิด/ขนาดทันทีตอนเลือก · ไฟล์เก็บใน window.attPickerFiles(id)
  // opts: { accept: '.jpg,.png,...', max: bytes, hint: 'ข้อความใต้ช่อง' } ──
  var _att = {}, _attOrder = [];
  function attFmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function attIcon(n) { return /\.pdf$/i.test(n) ? '📕' : /\.docx?$/i.test(n) ? '📘' : /\.xlsx?$/i.test(n) ? '📗' : '📄'; }
  // ── path ไฟล์บน Storage: ตัดจุดหน้านามสกุลออก (photo.jpg → photo_jpg) เพราะ Proxy หน้าเซิร์ฟเวอร์ดัก URL
  // ที่ลงท้าย .jpg/.png ไปหน้าเว็บแทน Supabase (ได้ 404) · ชนิดไฟล์เก็บใน contentType ตอนอัปโหลด จึงเปิดเป็นรูปได้ปกติ
  // ชื่อจริงเก็บใน file_name ของตาราง (ใช้แสดงผล/ตั้งชื่อตอนดาวน์โหลด) — help.html มีสำเนาแบบเดียวกัน ──
  window.storageKey = function (prefix, name) {
    return prefix + '/' + Date.now() + '_' + String(name || 'file').replace(/[^\w.\-]+/g, '_').replace(/\.(\w+)$/, '_$1');
  };
  window.attPickerHtml = function (id, opts) {
    opts = opts || {};
    // compact = ปุ่ม 📎 เล็ก ๆ อย่างเดียว (ใช้ในกล่องพิมพ์แบบแชท) — ผู้เรียกวาง <div id="{id}-list"> / "{id}-err" เอง
    // และส่ง opts.dropOn (id กล่องพิมพ์) ตอน init ให้ลากไฟล์มาวางทั้งกล่องได้
    if (opts.compact) {
      return '<input type="file" id="' + id + '" multiple accept="' + window.esc(opts.accept || '') + '" hidden>'
        + '<button type="button" class="att-btn" id="' + id + '-drop" title="แนบไฟล์ — ลากไฟล์มาวาง หรือกด Ctrl+V วางภาพได้' + (opts.hint ? '\n' + window.esc(opts.hint) : '') + '">📎</button>';
    }
    return '<div class="att-drop" id="' + id + '-drop" tabindex="0" role="button">'
      + '<input type="file" id="' + id + '" multiple accept="' + window.esc(opts.accept || '') + '" hidden>'
      + '<div class="att-drop-ic">📎</div>'
      + '<div class="att-drop-t"><b>คลิกเพื่อเลือกไฟล์</b> หรือลากไฟล์มาวางที่นี่</div>'
      + '<div class="att-drop-s">📋 แคปหน้าจอแล้วกด Ctrl+V วางได้เลย</div>'
      + '</div>'
      + (opts.hint ? '<div class="att-hint">' + window.esc(opts.hint) + '</div>' : '')
      + '<div class="att-err" id="' + id + '-err"></div>'
      + '<div class="att-list" id="' + id + '-list"></div>';
  };
  window.attPickerInit = function (id, opts) {
    opts = opts || {};
    // opts.keep = วาดหน้าเดิมซ้ำ (เช่น realtime) → คงไฟล์ที่เลือกไว้ ไม่ล้างทิ้ง
    _att[id] = { files: (opts.keep && _att[id] && _att[id].files) || [], ext: String(opts.accept || '').toLowerCase().split(',').filter(Boolean), max: opts.max || 0 };
    _attOrder = _attOrder.filter(function (k) { return k !== id; }).concat(id);
    var inp = document.getElementById(id), drop = document.getElementById(id + '-drop');
    if (!inp || !drop) return;
    drop.onclick = function () { inp.click(); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = function () { attAdd(id, inp.files); inp.value = ''; };
    var zone = (opts.dropOn && document.getElementById(opts.dropOn)) || drop; // พื้นที่รับลากวางไฟล์
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { attAdd(id, e.dataTransfer && e.dataTransfer.files); });
    renderAttList(id);
  };
  window.attPickerFiles = function (id) { return (_att[id] && _att[id].files) || []; };
  window.attPickerClear = function (id) { if (_att[id]) { _att[id].files = []; renderAttList(id); } }; // หลังส่งสำเร็จ
  function attAdd(id, list) {
    var st = _att[id]; if (!st) return;
    var bad = [];
    Array.prototype.forEach.call(list || [], function (f) {
      var ext = '.' + String(f.name).split('.').pop().toLowerCase();
      if (st.ext.length && st.ext.indexOf(ext) < 0) bad.push(f.name + ' (ไม่รองรับไฟล์ชนิดนี้)');
      else if (st.max && f.size > st.max) bad.push(f.name + ' (ใหญ่เกิน ' + Math.round(st.max / 1048576) + 'MB)');
      else if (!st.files.some(function (x) { return x.name === f.name && x.size === f.size; })) st.files.push(f);
    });
    var err = document.getElementById(id + '-err');
    if (err) err.textContent = bad.length ? '⚠ ไม่ได้แนบ: ' + bad.join(', ') : '';
    renderAttList(id);
  }
  function renderAttList(id) {
    var box = document.getElementById(id + '-list'); if (!box || !_att[id]) return;
    box.innerHTML = _att[id].files.map(function (f, i) {
      var isImg = /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp)$/i.test(f.name);
      var thumb = isImg ? '<img src="' + URL.createObjectURL(f) + '" alt="">' : '<span class="att-ic">' + attIcon(f.name) + '</span>';
      return '<div class="att-item">' + thumb
        + '<div class="att-meta"><div class="att-name" title="' + window.esc(f.name) + '">' + window.esc(f.name) + '</div><div class="att-size">' + attFmtSize(f.size) + '</div></div>'
        + '<button type="button" class="att-x" data-i="' + i + '" title="ลบไฟล์นี้">✕</button></div>';
    }).join('');
    box.querySelectorAll('.att-x').forEach(function (b) {
      b.onclick = function () { _att[id].files.splice(+b.getAttribute('data-i'), 1); renderAttList(id); };
    });
  }
  // วางภาพจากคลิปบอร์ด → ช่องแนบไฟล์ที่ init ล่าสุดและยังแสดงอยู่บนจอ (เช่น modal ที่เปิดทับหน้ารายละเอียด)
  document.addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length) return;
    var cur = _attOrder.slice().reverse().filter(function (k) { var d = document.getElementById(k + '-drop'); return d && d.offsetParent !== null; })[0];
    if (!cur) return;
    e.preventDefault();
    attAdd(cur, Array.prototype.map.call(files, function (f, i) {
      // ภาพจากคลิปบอร์ดชื่อซ้ำกันหมด ("image.png") — ตั้งชื่อใหม่ตามเวลา
      return /^image\.\w+$/i.test(f.name) ? new File([f], 'screenshot_' + Date.now() + '_' + i + '.' + f.name.split('.').pop(), { type: f.type }) : f;
    }));
  });

})();
