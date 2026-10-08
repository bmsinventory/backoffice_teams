/**
 * training.js — ระบบอบรม (/training/) ใน Backoffice — ฝังเป็น iframe ?embed=1 (หน้าใน iframe ซ่อนแถบเมนูของตัวเอง แถบควบคุมอยู่ที่นี่)
 *   1) เมนู "ระบบอบรม" (#view-training)      → ?view=overview  ภาพรวมทุกโครงการ + ตั้งค่ากลาง (หลักสูตรอบรม/คลังแบบทดสอบ/ใบประกาศ)
 *   2) ติดตามสถานะโครงการ › แท็บ "🎓 อบรม" (renderImtTraining) → ?project=<รหัสโครงการ>  งานอบรมของโครงการนั้น
 *      แถบควบคุม = เมนูซ้าย (จัดกลุ่ม งานอบรม / ติดตามผล / ตั้งค่า) รวมแท็บย่อยผู้ดูแลไว้ในเมนูเดียว · มือถือพับเป็นปุ่ม ☰
 * โดเมนเดียวกัน → เรียก showPage / embedGo ของหน้าใน iframe ได้ตรง ๆ และใช้ session Login เดียวกัน
 * หน้าใน iframe แจ้งสถานะกลับผ่าน window.trnEmbedState(state, iframe) (ดู _embedNotify ใน src/modules/training-app.js)
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return window.esc(s == null ? '' : String(s)); };

  // เมนูซ้ายของแท็บอบรมของโครงการ — id = หน้าใน iframe หรือ "admin:<แท็บย่อยผู้ดูแล>" (ADMIN_TABS ใน src/modules/training-app.js)
  var IMT_NAV = [
    { g: 'งานอบรม', items: [
      { id: 'track',               icon: '📋', label: 'ตรวจสอบรายชื่อ' },
      { id: 'checkin',             icon: '📷', label: 'เช็คชื่อ' },
      { id: 'admin:registrations', icon: '👥', label: 'ผู้ลงทะเบียน' },
    ] },
    { g: 'ติดตามผล', items: [
      { id: 'analytics',           icon: '📊', label: 'Analytics' },
      { id: 'admin:survey',        icon: '⭐', label: 'ผลประเมิน' },
      { id: 'admin:loginverify',   icon: '🛡️', label: 'ตรวจสอบสิทธิ์' },
      { id: 'admin:keyentry',      icon: '🔢', label: 'ตรวจสอบคีย์ยอด' },
    ] },
    { g: 'ตั้งค่า', items: [
      { id: 'admin:categories',    icon: '🗂️', label: 'หลักสูตรอบรม' },
      { id: 'admin:sessions',      icon: '📅', label: 'รอบอบรม' },
      { id: 'admin:quiz',          icon: '✏️', label: 'ผลสอบ & ใบประกาศ' },
      { id: 'admin:masters',       icon: '📚', label: 'ข้อมูลพื้นฐาน' },
      { id: 'admin:projsettings',  icon: '⚙️', label: 'ตั้งค่าโครงการ' },
    ] },
  ];
  var states = {};
  function win(id) { var f = $(id); try { return f && f.contentWindow; } catch (e) { return null; } }

  function renderSide() {
    var st = states['imt-trn-frame'] || {}, el = $('imt-trn-side');
    if (!el) return;
    var wrap = $('imt-trn-wrap');
    // ยังไม่เปิดอบรม/ไม่อยู่ทีม → ไม่มีเมนู (หน้าใน iframe แสดงวิธีเปิดอบรม)
    if (!st.site) { el.innerHTML = ''; if (wrap) wrap.classList.add('no-side'); return; }
    if (wrap) wrap.classList.remove('no-side');
    var allowed = st.tabs; // null = ยังไม่ Login → แสดงทุกเมนู (กดแล้วหน้าใน iframe ขอ Login เอง)
    var cur = null;
    var groups = IMT_NAV.map(function (g) {
      var items = g.items.filter(function (it) {
        return it.id.indexOf('admin:') !== 0 || !allowed || allowed.indexOf(it.id.slice(6)) !== -1;
      });
      if (!items.length) return '';
      return '<div class="trn-side-g">' + esc(g.g) + '</div>' + items.map(function (it) {
        var on = st.page === it.id;
        if (on) cur = it;
        return '<div class="trn-side-item' + (on ? ' on' : '') + '" onclick="window.trnSideGo(\'' + it.id + '\')">'
          + '<span class="trn-side-ic">' + it.icon + '</span>' + esc(it.label) + '</div>';
      }).join('');
    }).join('');
    var open = el.classList.contains('open');
    el.innerHTML = '<button class="trn-side-toggle" onclick="window.trnSideToggle()">☰ <span>' + (cur ? cur.icon + ' ' + esc(cur.label) : 'เมนูอบรม') + '</span><span class="trn-side-caret">' + (open ? '▲' : '▼') + '</span></button>'
      + '<div class="trn-side-list">' + groups
      + '<div class="trn-side-g">แชร์ให้ผู้เข้าอบรม</div>'
      + Object.keys(SHARE).map(function (k) {
        return '<div class="trn-side-item" onclick="window.trnShare(\'' + k + '\')" title="' + esc(SHARE[k].desc) + '">'
          + '<span class="trn-side-ic">' + SHARE[k].icon + '</span>' + esc(SHARE[k].label) + '<span class="trn-side-hint">แชร์</span></div>';
      }).join('')
      + '<div class="trn-side-g">ช่วยเหลือ</div>'
      + '<a class="trn-side-item" href="training/?page=manual" target="_blank" rel="noopener"><span class="trn-side-ic">📖</span>คู่มือ<span class="trn-side-hint">↗</span></a>'
      + '</div>';
  }

  // ── แชร์ลิงก์สำหรับผู้เข้าอบรม (ไม่ต้อง Login) — popup: QR (ฉายจอ/ปริ้นแปะ — บันทึกรูปได้) + ช่องลิงก์ (คัดลอก / เปิดหน้า) ──
  var SHARE = {
    reg:    { icon: '🔗', label: 'ลงทะเบียน',   page: '',       desc: 'ผู้เข้าอบรมลงทะเบียนและเช็คชื่อเข้าอบรมด้วยตัวเอง' },
    survey: { icon: '📝', label: 'แบบประเมิน',  page: 'survey', desc: 'แบบประเมินความพึงพอใจหลังอบรม' },
  };
  var shareKind = 'reg';
  function shareInfo() {
    var st = states['imt-trn-frame'] || {}, s = SHARE[shareKind];
    return { s: s, url: publicUrl(st.site, s.page) };
  }
  window.trnShare = function (kind) {
    var st = states['imt-trn-frame'] || {};
    if (!st.site || !SHARE[kind]) return;
    var el = $('imt-trn-side');
    if (el) el.classList.remove('open'); // มือถือ: พับเมนูก่อนเปิด popup
    shareKind = kind;
    var i = shareInfo();
    $('m-trn-share-title').textContent = 'แชร์ลิงก์ ' + i.s.label;
    $('m-trn-share-body').innerHTML =
      '<p class="trn-share-desc">' + esc(i.s.desc) + (st.siteName ? '<br><b>' + esc(st.siteName) + '</b>' : '') + '</p>'
      + '<div id="trn-share-qr" class="trn-share-qr"></div>'
      + '<button class="trn-share-qrdl" onclick="window.trnShareDo(\'qr\')" title="บันทึกรูป QR ไว้ฉายจอหรือปริ้นแปะหน้าห้องอบรม">⬇️ บันทึกรูป QR</button>'
      // ช่องลิงก์ = คัดลอก / เปิดหน้า ในตัว (ไม่ต้องมีปุ่มคัดลอกลิงก์แยก)
      + '<div class="trn-share-urlbox">'
      +   '<input class="trn-share-url" readonly value="' + esc(i.url) + '" onclick="this.select()">'
      +   '<button onclick="window.trnShareDo(\'copy\')" title="คัดลอกลิงก์">📋</button>'
      +   '<a href="' + esc(i.url) + '" target="_blank" rel="noopener" title="เปิดหน้า">↗</a>'
      + '</div>';
    var qrBox = $('trn-share-qr');
    if (window.QRCode) {
      try { new window.QRCode(qrBox, { text: i.url, width: 200, height: 200, correctLevel: window.QRCode.CorrectLevel.M }); }
      catch (e) { qrBox.textContent = 'สร้าง QR ไม่สำเร็จ'; }
    } else qrBox.innerHTML = '<span class="trn-share-desc">(โหลด QR ไม่ได้ — ใช้ลิงก์ด้านล่าง)</span>';
    window.openM('m-trn-share');
  };
  window.trnShareDo = function (act) {
    var i = shareInfo();
    if (act === 'copy') {
      var ok = function () { window.showToast('คัดลอกลิงก์แล้ว', 'success'); };
      if (navigator.clipboard) navigator.clipboard.writeText(i.url).then(ok, function () { window.prompt('คัดลอกลิงก์', i.url); });
      else window.prompt('คัดลอกลิงก์', i.url);
      return;
    }
    if (act === 'qr') {
      var c = document.querySelector('#trn-share-qr canvas'), img = document.querySelector('#trn-share-qr img');
      var src = c ? c.toDataURL('image/png') : (img && img.src);
      if (!src) return;
      var a = document.createElement('a');
      a.href = src; a.download = 'QR_' + (shareKind === 'survey' ? 'แบบประเมิน' : 'ลงทะเบียน') + '_' + ((states['imt-trn-frame'] || {}).site || '') + '.png';
      a.click();
    }
  };
  window.trnSideToggle = function () {
    var el = $('imt-trn-side');
    if (!el) return;
    el.classList.toggle('open');
    renderSide();
  };
  window.trnSideGo = function (id) {
    var w = win('imt-trn-frame'), el = $('imt-trn-side');
    if (el) el.classList.remove('open'); // มือถือ: เลือกแล้วพับเมนู
    if (!w) return;
    if (w.embedGo) w.embedGo(id); else if (w.showPage) w.showPage(id);
    renderSide();
  };

  // ลิงก์สำหรับผู้เข้าอบรมของโครงการ (ไม่ต้อง Login) — หน้าลงทะเบียน/เช็คชื่อ และแบบประเมิน
  function publicUrl(site, page) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'training/';
    return base + '?' + (page ? 'page=' + page + '&' : '') + 'site=' + encodeURIComponent(site);
  }
  // ── ปุ่มของหน้าใน iframe (Export Excel / CSV / นำเข้าข้อมูล ...) — แสดงท้ายแถวแท็บของโครงการ (imtSetPtabExtra)
  // แทนแถวหัวของหน้าใน iframe (ซ่อนด้วย CSS .trn-embed-proj) · กดแล้ว click ปุ่มจริงใน iframe
  // จึงซ่อน/แสดงตามสิทธิ์และแท็บย่อยเหมือนเดิมโดยไม่ต้องรู้จักแต่ละปุ่ม ──
  var HEAD_ICONS = { 'ti-file-spreadsheet': '📊', 'ti-file-text': '📄', 'ti-table-import': '📥', 'ti-sparkles': '✨' };
  function headBtns() {
    var w = win('imt-trn-frame');
    try {
      var d = w && w.document, page = d && d.querySelector('.page.active');
      if (!page) return [];
      return Array.prototype.filter.call(page.querySelectorAll(':scope > .section-header button'), function (b) {
        return w.getComputedStyle(b).display !== 'none';
      });
    } catch (e) { return []; }
  }
  function syncHeadBtns() {
    if (!window.imtSetPtabExtra || window.imtTab !== 'training') return;
    window.imtSetPtabExtra(headBtns().map(function (b, i) {
      var ic = b.querySelector('i'), cls = ic ? Object.keys(HEAD_ICONS).filter(function (k) { return ic.classList.contains(k); })[0] : null;
      var kind = b.classList.contains('btn-success') ? 'btn-teal' : b.classList.contains('btn-primary') ? 'btn-pri' : 'btn-ghost';
      return '<button class="btn ' + kind + ' btn-sm" onclick="window.trnHeadBtn(' + i + ')"' + (b.title ? ' title="' + esc(b.title) + '"' : '') + '>'
        + (cls ? HEAD_ICONS[cls] + ' ' : '') + esc(b.textContent.trim()) + '</button>';
    }).join(''));
  }
  window.trnHeadBtn = function (i) { var b = headBtns()[i]; if (b) b.click(); };

  // ภาพรวม (trn-frame) ไม่มีแถบควบคุม — สนใจเฉพาะสถานะของแท็บอบรมของโครงการ (เมนูซ้าย)
  window.trnEmbedState = function (s, frameEl) {
    if (!frameEl || frameEl.id !== 'imt-trn-frame') return;
    states['imt-trn-frame'] = Object.assign(states['imt-trn-frame'] || {}, s || {});
    renderSide();
    syncHeadBtns();
  };

  // ── 1) เมนู "ระบบอบรม" — เปิดครั้งแรกค่อยโหลด iframe (ไม่ถ่วงการเปิด Backoffice) ──
  window.renderTraining = function () {
    var f = $('trn-frame');
    if (f && !f.getAttribute('src')) f.setAttribute('src', 'training/?embed=1&admin=1&view=overview');
  };
  // จากแท็บอบรมของโครงการ (ปุ่ม "จัดการหลักสูตรกลาง") → เมนูระบบอบรม แท็บที่ระบุ (cats / quiz / cert)
  window.trnOpenCentral = function (tab) {
    var f = $('trn-frame'), w = win('trn-frame');
    if (f && !f.getAttribute('src')) f.setAttribute('src', 'training/?embed=1&admin=1&view=overview&tab=' + encodeURIComponent(tab));
    else if (w && w.ovTab) w.ovTab(tab);
    var btn = document.querySelector('#sidebar .nav-btn[onclick*="\'training\'"]');
    window.goView('training', btn);
  };

  // ── 2) ติดตามสถานะโครงการ › แท็บ "🎓 อบรม"
  // หน้าอบรมอยู่ในกล่องถาวร (#imt-trn-wrap ข้าง #imt-content) — ไม่ถูกลบตอนติดตามสถานะโครงการ render ซ้ำ/สลับแท็บ
  // (ย้าย iframe ใน DOM = โหลดใหม่ จึงซ่อน/แสดงแทน) · สลับโครงการ = ให้หน้าเดิมโหลดข้อมูลโครงการใหม่ (embedOpenProject) ──
  function imtWrap() {
    var w = $('imt-trn-wrap');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'imt-trn-wrap'; w.className = 'imt-trn'; w.style.display = 'none';
    w.innerHTML = '<nav class="trn-side" id="imt-trn-side"></nav>'
      + '<iframe id="imt-trn-frame" class="trn-frame" title="การอบรมของโครงการ" allow="camera; clipboard-write"></iframe>';
    $('view-impl-tracker').appendChild(w);
    return w;
  }
  // เรียกจาก dispatcher ของติดตามสถานะโครงการทุกครั้ง — แท็บอื่นซ่อนหน้าอบรม คืนพื้นที่ให้ #imt-content
  window.imtTrainingShow = function (on) {
    if (on) return; // แท็บอบรม: renderImtTraining จัดการเอง
    var w = $('imt-trn-wrap'), m = $('imt-content');
    if (w) w.style.display = 'none';
    if (m) m.style.display = 'flex';
  };
  window.renderImtTraining = function (mount) {
    var pid = window.imtCurrentProjectId;
    if (!pid || !window.imtProject(pid)) { window.imtTrainingShow(false); mount.innerHTML = window.imtProjectPicker(); return; }
    mount.innerHTML = ''; mount.style.display = 'none';
    imtWrap().style.display = 'flex';
    var f = $('imt-trn-frame'), w = win('imt-trn-frame');
    if (f.dataset.pid === pid) { syncHeadBtns(); return; } // กลับมาแท็บอบรม — แถวแท็บถูก render ใหม่ ใส่ปุ่มของหน้าอีกครั้ง
    var reuse = f.dataset.pid && w && w.embedOpenProject; // หน้าอบรมโหลดไว้แล้ว → สลับโครงการในหน้าเดิม
    f.dataset.pid = pid;
    states['imt-trn-frame'] = {};
    renderSide();
    if (reuse) w.embedOpenProject(pid);
    else f.setAttribute('src', 'training/?embed=1&admin=1&project=' + encodeURIComponent(pid));
  };
  // ── จากภาพรวม (กดแถวโครงการ) → ติดตามสถานะโครงการ › แท็บอบรมของโครงการนั้น ──
  window.trnOpenProject = function (pid) {
    window.imtCurrentProjectId = pid;
    window.imtTab = 'training';
    var btn = document.querySelector('#sidebar .nav-btn[onclick*="\'impl_tracker\'"]');
    window.goView('impl_tracker', btn);
  };
})();
