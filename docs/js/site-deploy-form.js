const { esc, fd } = window;

// ── DOM value helpers (module-local, mirrors ecf* helpers in expense-form.js) ──
function sdfV(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function sdfChecked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
function sdfNumOrBlank(id) {
  var v = (sdfV(id) || '').trim();
  if (!v) return '';
  var n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? '' : n;
}

// ── Searchable Combobox: เลือก "สถานที่" จาก window.HOSPITALS (พิมพ์ค้นหาหรือคลิกเลือก, position:fixed
// dropdown กันโดน overflow ของ .ecf-panel ตัด) — pattern เดียวกับ _initImtProjCombobox/_initImtStaffCombobox
// ใน impl-tracker.js แต่ init() มี guard กันผูก event ซ้ำ เพราะฟอร์มนี้ไม่ได้ rebuild DOM ทุกครั้งที่เปิดฟอร์มใหม่
// (ต่างจาก impl-tracker ที่ rebuild body ของ modal ใหม่ทุกครั้ง) ──
window._sdfSiteCombo = (function () {
  var inp, drop, lst, hid, bound = false;
  var items = [];
  var selId = '', selName = '', q = '', fi = -1, flat = [], dt = null, isOpen = false;
  var IH = 34;

  function hi(txt, qq) {
    if (!qq) return esc(txt);
    var lt = txt.toLowerCase(), lq = qq.toLowerCase(), out = '', i = 0;
    while (i < txt.length) {
      var x = lt.indexOf(lq, i);
      if (x < 0) { out += esc(txt.slice(i)); break; }
      out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
      i = x + lq.length;
    }
    return out;
  }
  function bFlat(sq) {
    var f = [], lq = sq.toLowerCase();
    items.forEach(function (it) { if (!sq || it.name.toLowerCase().indexOf(lq) !== -1) f.push(it); });
    return f;
  }
  function render() {
    if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบโรงพยาบาล' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
    lst.innerHTML = flat.map(function (it, idx) {
      var foc = idx === fi, isSel = it.id === selId;
      return '<div class="sdfc-i" data-id="' + esc(it.id) + '" data-name="' + esc(it.name) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">'
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
    lst.style.maxHeight = Math.max(140, Math.min(260, availH)) + 'px';
  }
  function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); }
  function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; window.removeEventListener('resize', positionDrop); }
  function selItem(id, name) {
    selId = id; selName = name;
    if (hid) hid.value = id;
    closeDrop();
    if (hid) hid.dispatchEvent(new Event('change'));
  }

  return {
    init: function (hospitalsList) {
      inp = document.getElementById('sdf-site-cmb-input');
      drop = document.getElementById('sdf-site-cmb-drop');
      lst = document.getElementById('sdf-site-cmb-list');
      hid = document.getElementById('sdf-site-hospital-id');
      if (!inp || !drop || !lst || !hid) return;
      items = (hospitalsList || []).map(function (h) { return { id: h.id, name: h.name }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });
      if (bound) return;
      bound = true;
      lst.addEventListener('click', function (e) { var it = e.target.closest('.sdfc-i'); if (it) selItem(it.dataset.id, it.dataset.name); });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.sdfc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      inp.addEventListener('input', function () {
        if (!isOpen) openDrop();
        // เคลียร์ selId/selName ตามที่พิมพ์ (ต่างจาก imtProjCombobox/imtStaffCombobox เดิมที่ต้องเลือกจาก
        // list เท่านั้น) — "สถานที่" ยอมให้พิมพ์อิสระได้ ถ้าไม่ตรงกับโรงพยาบาลใดก็เก็บเป็นข้อความที่พิมพ์เอง
        // ต้องอัปเดต selName ทุกครั้งที่พิมพ์ ไม่งั้น closeDrop() จะ snap ค่ากลับไปเป็นชื่อที่เคยเลือกไว้ก่อนหน้า
        selId = ''; selName = inp.value; if (hid) hid.value = '';
        clearTimeout(dt);
        dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); render(); window.sdfRenderPreview(); }, 150);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].id, flat[fi].name); }
      });
      document.addEventListener('mousedown', function (e) {
        var wrap = document.getElementById('sdf-site-cmb-wrap');
        if (wrap && !wrap.contains(e.target) && drop && !drop.contains(e.target)) closeDrop();
      });
    },
    setValue: function (id, freeText) {
      var h = items.find(function (x) { return x.id === id; });
      selId = h ? h.id : '';
      selName = h ? h.name : (freeText || '');
      if (hid) hid.value = selId;
      if (inp) inp.value = selName;
    },
  };
})();

window.sdfInitSiteCombo = function () { window._sdfSiteCombo.init(window.HOSPITALS); };

// ── Markup ของ combobox "สถานที่" ──
function sdfSiteComboMarkup() {
  return '<div id="sdf-site-cmb-wrap" style="position:relative;">'
    + '<input id="sdf-site-cmb-input" type="text" class="f-input" placeholder="พิมพ์ค้นหาหรือเลือกโรงพยาบาล..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
    + '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
    + '<input type="hidden" id="sdf-site-hospital-id" value="" onchange="window.sdfOnHospitalChange()">'
    + '<div id="sdf-site-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
    + '<div id="sdf-site-cmb-list" style="max-height:260px;overflow-y:auto;"></div>'
    + '</div>'
    + '</div>';
}

// ── Build Static Shell (input panel + preview panel) — called once by expense-form.js into #ecf-ac02-wrap ──
window.sdfBuildHtml = function () {
  var deptOpts = window.SDF_DEPTS.map(function (c) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">' +
      '<input type="radio" name="sdf-dept" id="sdf-dept-' + c.key + '" value="' + c.key + '" ' + (c.key === 'other' ? 'checked' : '') + ' onchange="window.sdfOnDeptChange()">' +
      esc(c.label) + '</label>';
  }).join('');

  return `
  <div class="ecf-layout">
    <!-- INPUT PANEL -->
    <div class="ecf-panel no-print">
      <div class="f-group">
        <label class="f-label">แผนก</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;">${deptOpts}</div>
        <div id="sdf-dept-other-wrap" style="margin-top:6px;">
          <input class="f-input" id="sdf-dept-other-note" placeholder="ระบุรายละเอียด เช่น ระบบงานครุภัณฑ์ ฯลฯ" oninput="window.sdfRenderPreview()">
        </div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">สถานที่ (พิมพ์ค้นหาชื่อโรงพยาบาล)</label>${sdfSiteComboMarkup()}</div>
        <div class="f-group"><label class="f-label">จังหวัด</label><input class="f-input" id="sdf-province" oninput="window.sdfRenderPreview()"></div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">📋 งาน</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;align-items:center;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="sdf-work-open" onchange="window.sdfRenderPreview()"> เปิดไซต์ใหม่
          </label>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;color:var(--txt3);white-space:nowrap;">สัญญา/ใบเสนอราคาเลขที่</span>
            <input class="f-input" id="sdf-contract-no" oninput="window.sdfRenderPreview()" style="flex:1;padding:5px 8px;font-size:12px;">
          </div>

          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="sdf-work-percontract" onchange="window.sdfRenderPreview()"> งานตามงวดสัญญา
          </label>
          <div style="display:flex;align-items:center;gap:4px;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="sdf-work-revisit" onchange="window.sdfRenderPreview()"> Revisit
            </label>
            <input class="f-input" id="sdf-revisit-no" placeholder="ครั้งที่" oninput="window.sdfRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
            <span style="font-size:12px;color:var(--txt3);">/</span>
            <input class="f-input" id="sdf-revisit-total" placeholder="ทั้งหมด" oninput="window.sdfRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
          </div>

          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="sdf-work-fixissue" onchange="window.sdfRenderPreview()"> งานแก้ปัญหา (ตามเอกสารแนบ)
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="sdf-work-closecontract" onchange="window.sdfRenderPreview()"> งานปิดงวดสัญญา
          </label>

          <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="sdf-work-other" onchange="window.sdfRenderPreview()"> อื่นๆ
            </label>
            <input class="f-input" id="sdf-work-other-note" placeholder="ระบุรายละเอียด" oninput="window.sdfRenderPreview()" style="flex:1;padding:5px 8px;font-size:12px;">
          </div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--indigo);margin-bottom:10px;">📞 การติดต่อลูกค้า</div>
        <div class="f-group" id="sdf-contact-pick-wrap" style="display:none;">
          <label class="f-label">เลือกผู้ติดต่อ (โรงพยาบาลนี้มีมากกว่า 1 คน)</label>
          <select class="f-input" id="sdf-contact-pick" onchange="window.sdfOnContactPickChange()"></select>
        </div>
        <div class="f-grid" style="gap:8px 10px;">
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">ลูกค้า</label><input class="f-input" id="sdf-customer-name" oninput="window.sdfRenderPreview()" style="padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">แผนก</label><input class="f-input" id="sdf-customer-dept" oninput="window.sdfRenderPreview()" style="padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">Email</label><input class="f-input" id="sdf-customer-email" oninput="window.sdfRenderPreview()" style="padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">โทร</label><input class="f-input" id="sdf-customer-phone" oninput="window.sdfRenderPreview()" style="padding:6px 10px;"></div>
        </div>
      </div>

      <div class="f-group">
        <label class="f-label">การเตรียมความพร้อม</label>
        <textarea class="f-input" id="sdf-preparation-notes" rows="7" oninput="window.sdfRenderPreview()"></textarea>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:10px;">💰 บันทึกทางบัญชี (แผนกบัญชี — ไม่บังคับ)</div>
        <div class="f-grid" style="gap:8px 10px;">
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">ทดรองจ่ายรวม (ใบ)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-slip-count" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">เก็บเงินได้แล้ว (บาท)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-collected" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">ทดรองจ่ายเป็นเงินรวม (บาท)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-total" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">คงเหลือ (บาท)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-remaining" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">ค่าใช้จ่ายที่ใช้ไปแล้ว (บาท)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-used" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label" style="margin-bottom:3px;">คงเหลือยังไม่เคลียร์ ADV. (ใบ)</label><input type="text" inputmode="decimal" class="f-input" id="sdf-adv-uncleared" oninput="window.sdfRenderPreview()" style="text-align:right;padding:6px 10px;"></div>
        </div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">ผู้จัดทำ</label><input class="f-input" id="sdf-preparer-name" oninput="window.sdfRenderPreview()"></div>
        <div class="f-group"><label class="f-label">วันที่จัดทำ</label><input type="date" class="f-input" id="sdf-preparer-date" onchange="window.sdfRenderPreview()"></div>
      </div>
    </div>

    <!-- PREVIEW / PRINT PANEL -->
    <div class="ecf-preview-wrap">
      <div id="sdf-print-area" class="sdf-sheet"></div>
    </div>
  </div>
  `;
};

// ── Preview Renderer (reads current DOM values, regenerates print sheet only) ──
window.sdfRenderPreview = function () {
  var area = document.getElementById('sdf-print-area');
  if (!area) return;

  var deptKey = 'other';
  var deptEl = document.querySelector('input[name="sdf-dept"]:checked');
  if (deptEl) deptKey = deptEl.value;

  var deptBoxes = window.SDF_DEPTS.map(function (c) {
    var on = c.key === deptKey;
    var otherNote = (c.key === 'other' && on && sdfV('sdf-dept-other-note').trim())
      ? ' <span class="sdf-fill">' + esc(sdfV('sdf-dept-other-note').trim()) + '</span>' : '';
    return '<div class="sdf-cbx"><span class="sdf-box">' + (on ? '✓' : '') + '</span>' + esc(c.label) + otherNote + '</div>';
  }).join('');

  var revisitLine = sdfChecked('sdf-work-revisit')
    ? (esc(sdfV('sdf-revisit-no')) || '&nbsp;') + ' / ' + (esc(sdfV('sdf-revisit-total')) || '&nbsp;')
    : '&nbsp;&nbsp;/&nbsp;&nbsp;';

  var fmtAdv = function (id) {
    var v = sdfV(id).trim();
    return v ? esc(v) : '&nbsp;';
  };

  area.innerHTML = `
    <div class="sdf-head">
      <div class="sdf-head-co">
        <div class="sdf-co-name">บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด</div>
        <div class="sdf-co-addr">เลขที่ 2 ชั้น 2 ซ.สุขสวัสดิ์ 33 แขวง/เขต ราษฎร์บูรณะ กรุงเทพมหานคร</div>
        <div class="sdf-co-addr">โทรศัพท์ 0-2873-0291 โทรสาร 0-2873-0292</div>
        <div class="sdf-co-addr">เลขที่ประจำตัวผู้เสียภาษี 0105548152334</div>
      </div>
    </div>
    <div class="sdf-title">แบบฟอร์มการออกปฏิบัติงาน</div>

    <div class="sdf-box-section">
      <div class="sdf-row"><span class="sdf-lbl">แผนก</span><div class="sdf-cat-grid">${deptBoxes}</div></div>
    </div>

    <div class="sdf-box-section">
      <div class="sdf-row"><span class="sdf-lbl">สถานที่</span><span class="sdf-fill sdf-grow">${esc(sdfV('sdf-site-cmb-input')) || '&nbsp;'}</span><span class="sdf-lbl">จังหวัด</span><span class="sdf-fill">${esc(sdfV('sdf-province')) || '&nbsp;'}</span></div>
    </div>

    <div class="sdf-box-section">
      <div class="sdf-work-grid">
        <div class="sdf-cbx"><span class="sdf-box">${sdfChecked('sdf-work-open') ? '✓' : ''}</span>เปิดไซต์ใหม่</div>
        <div class="sdf-cbx">สัญญาเลขที่ / ใบเสนอราคาเลขที่ <span class="sdf-fill">${esc(sdfV('sdf-contract-no')) || '&nbsp;'}</span></div>
        <div class="sdf-cbx"><span class="sdf-box">${sdfChecked('sdf-work-percontract') ? '✓' : ''}</span>งานตามงวดสัญญา</div>
        <div class="sdf-cbx"><span class="sdf-box">${sdfChecked('sdf-work-revisit') ? '✓' : ''}</span>Revisit ครั้งที่ <span class="sdf-fill">${revisitLine}</span></div>
        <div class="sdf-cbx"><span class="sdf-box">${sdfChecked('sdf-work-fixissue') ? '✓' : ''}</span>งานแก้ปัญหา ( ระบุปัญหาตามเอกสารแนบ )</div>
        <div class="sdf-cbx"><span class="sdf-box">${sdfChecked('sdf-work-closecontract') ? '✓' : ''}</span>งานปิดงวดสัญญา</div>
        <div class="sdf-cbx sdf-span2"><span class="sdf-box">${sdfChecked('sdf-work-other') ? '✓' : ''}</span>อื่นๆ <span class="sdf-fill sdf-grow">${esc(sdfV('sdf-work-other-note')) || '&nbsp;'}</span></div>
      </div>
    </div>

    <div class="sdf-box-section">
      <div class="sdf-cat-lbl">การติดต่อลูกค้า</div>
      <div class="sdf-contact-grid">
        <span class="sdf-lbl">ลูกค้า</span><span class="sdf-fill">${esc(sdfV('sdf-customer-name')) || '&nbsp;'}</span><span class="sdf-lbl">แผนก</span><span class="sdf-fill">${esc(sdfV('sdf-customer-dept')) || '&nbsp;'}</span>
        <span class="sdf-lbl">Email</span><span class="sdf-fill">${esc(sdfV('sdf-customer-email')) || '&nbsp;'}</span><span class="sdf-lbl">โทร</span><span class="sdf-fill">${esc(sdfV('sdf-customer-phone')) || '&nbsp;'}</span>
      </div>
    </div>

    <div class="sdf-box-section">
      <div class="sdf-cat-lbl">การเตรียมความพร้อม :</div>
      <div class="sdf-fill sdf-prep">${esc(sdfV('sdf-preparation-notes')) || '&nbsp;'}</div>
    </div>

    <div class="sdf-box-section">
      <div class="sdf-cat-lbl">บันทึกทางบัญชี ( แผนก บัญชี )</div>
      <div class="sdf-acc-grid">
        <div>ทดรองจ่ายรวม <span class="sdf-fill">${fmtAdv('sdf-adv-slip-count')}</span> ใบ</div>
        <div>เก็บเงินได้แล้ว <span class="sdf-fill">${fmtAdv('sdf-adv-collected')}</span> บาท</div>
        <div>ทดรองจ่ายเป็นเงินรวม <span class="sdf-fill">${fmtAdv('sdf-adv-total')}</span> บาท</div>
        <div>คงเหลือ <span class="sdf-fill">${fmtAdv('sdf-adv-remaining')}</span> บาท</div>
        <div>ค่าใช้จ่ายที่ใช้ไปแล้ว <span class="sdf-fill">${fmtAdv('sdf-adv-used')}</span> บาท</div>
        <div>คงเหลือยังไม่เคลียร์ ADV. <span class="sdf-fill">${fmtAdv('sdf-adv-uncleared')}</span> ใบ</div>
      </div>
    </div>

    <div class="sdf-sign-block">
      <div>ผู้จัดทำ <span class="sdf-sign-line"></span></div>
      <div>( <span class="sdf-fill sdf-sign-name">${esc(sdfV('sdf-preparer-name')) || '&nbsp;'}</span> )</div>
      <div class="sdf-sign-date">${sdfV('sdf-preparer-date') ? fd(sdfV('sdf-preparer-date')) : '..... / ..... / .....'}</div>
    </div>

    <div class="sdf-formno">FM-AC-02</div>
  `;
};

// ── Department Change: toggle the "อื่นๆ" detail field ──
window.sdfOnDeptChange = function () {
  var wrap = document.getElementById('sdf-dept-other-wrap');
  var isOther = document.getElementById('sdf-dept-other');
  if (wrap) wrap.style.display = (isOther && isOther.checked) ? '' : 'none';
  window.sdfRenderPreview();
};

// ── Hospital Change (fired by #sdf-site-hospital-id's onchange, dispatched from the combobox
// when a hospital is picked) — auto-fills จังหวัด + ข้อมูลผู้ติดต่อ ──
window.sdfOnHospitalChange = function () {
  var hidEl = document.getElementById('sdf-site-hospital-id');
  var hospital = hidEl && hidEl.value ? window.HOSPITALS.find(function (h) { return h.id === hidEl.value; }) : null;
  var prov = document.getElementById('sdf-province');
  if (prov && hospital) prov.value = hospital.province || '';
  window.sdfApplyHospitalContacts(hospital, { autofill: true });
  window.sdfRenderPreview();
};

function sdfFillContactFields(c) {
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
  set('sdf-customer-name', c ? c.name : '');
  set('sdf-customer-dept', c ? c.position : '');
  set('sdf-customer-email', c ? c.email : '');
  set('sdf-customer-phone', c ? c.phone : '');
}

// ── ผู้ติดต่อของโรงพยาบาลที่เลือก: มี 1 คน → ดึงมาเติมให้เลย, มากกว่า 1 คน → โชว์ dropdown ให้เลือก ──
window.sdfApplyHospitalContacts = function (hospital, opts) {
  opts = opts || {};
  var contacts = (hospital && hospital.contacts) || [];
  var wrap = document.getElementById('sdf-contact-pick-wrap');
  var sel = document.getElementById('sdf-contact-pick');
  var chosenIdx = 0;
  if (contacts.length > 1) {
    if (wrap) wrap.style.display = '';
    if (sel) {
      sel.innerHTML = contacts.map(function (c, i) {
        return '<option value="' + i + '">' + esc(c.name || ('ผู้ติดต่อ ' + (i + 1))) + '</option>';
      }).join('');
      if (opts.matchName) {
        var found = contacts.findIndex(function (c) { return c.name === opts.matchName; });
        if (found >= 0) chosenIdx = found;
      }
      sel.value = String(chosenIdx);
    }
  } else {
    if (wrap) wrap.style.display = 'none';
  }
  if (opts.autofill !== false) sdfFillContactFields(contacts[chosenIdx] || null);
};

window.sdfOnContactPickChange = function () {
  var hidEl = document.getElementById('sdf-site-hospital-id');
  var hospital = hidEl && hidEl.value ? window.HOSPITALS.find(function (h) { return h.id === hidEl.value; }) : null;
  var idx = parseInt(sdfV('sdf-contact-pick'), 10) || 0;
  sdfFillContactFields(hospital && hospital.contacts ? hospital.contacts[idx] : null);
  window.sdfRenderPreview();
};

// ── Save / Load / New ──
window.sdfGatherData = function () {
  var deptEl = document.querySelector('input[name="sdf-dept"]:checked');
  return {
    dept_key: deptEl ? deptEl.value : 'other',
    dept_other_note: sdfV('sdf-dept-other-note').trim(),
    hospital_id: (document.getElementById('sdf-site-hospital-id') || {}).value || '',
    site_location: sdfV('sdf-site-cmb-input').trim(),
    province: sdfV('sdf-province').trim(),
    work_open_new_site: sdfChecked('sdf-work-open'),
    work_per_contract: sdfChecked('sdf-work-percontract'),
    work_other: sdfChecked('sdf-work-other'),
    work_other_note: sdfV('sdf-work-other-note').trim(),
    contract_no: sdfV('sdf-contract-no').trim(),
    work_revisit: sdfChecked('sdf-work-revisit'),
    revisit_no: sdfV('sdf-revisit-no').trim(),
    revisit_total: sdfV('sdf-revisit-total').trim(),
    work_fix_issue: sdfChecked('sdf-work-fixissue'),
    work_close_contract: sdfChecked('sdf-work-closecontract'),
    customer_name: sdfV('sdf-customer-name').trim(),
    customer_dept: sdfV('sdf-customer-dept').trim(),
    customer_email: sdfV('sdf-customer-email').trim(),
    customer_phone: sdfV('sdf-customer-phone').trim(),
    preparation_notes: sdfV('sdf-preparation-notes').trim(),
    adv_slip_count: sdfNumOrBlank('sdf-adv-slip-count') === '' ? null : sdfNumOrBlank('sdf-adv-slip-count'),
    adv_collected_amount: sdfNumOrBlank('sdf-adv-collected') === '' ? null : sdfNumOrBlank('sdf-adv-collected'),
    adv_total_amount: sdfNumOrBlank('sdf-adv-total') === '' ? null : sdfNumOrBlank('sdf-adv-total'),
    adv_remaining_amount: sdfNumOrBlank('sdf-adv-remaining') === '' ? null : sdfNumOrBlank('sdf-adv-remaining'),
    adv_used_amount: sdfNumOrBlank('sdf-adv-used') === '' ? null : sdfNumOrBlank('sdf-adv-used'),
    adv_uncleared_count: sdfNumOrBlank('sdf-adv-uncleared') === '' ? null : sdfNumOrBlank('sdf-adv-uncleared'),
    preparer_name: sdfV('sdf-preparer-name').trim(),
    preparer_date: sdfV('sdf-preparer-date') || null,
  };
};

window.sdfSave = async function () {
  if (!window.canEdit('expense_form')) return;
  var data = window.sdfGatherData();
  if (!data.site_location) { alert('กรุณากรอกสถานที่'); return; }
  var id = window.sdfEditId || window.sdfUid();
  try {
    await window.setDoc(window.getDocRef('SITE_DEPLOY_FORMS', id), data);
    window.sdfApplyLocal(id, data);
    window.sdfEditId = id;
    window.sdfRefreshSavedList();
    var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = id;
  } catch (e) { window.showDbError ? window.showDbError(e) : console.error(e); }
};

window.sdfNewForm = function () {
  window.sdfInitSiteCombo();
  window.sdfEditId = null;
  ['sdf-dept-other-note','sdf-province','sdf-work-other-note','sdf-contract-no',
   'sdf-revisit-no','sdf-revisit-total','sdf-customer-name','sdf-customer-dept','sdf-customer-email',
   'sdf-customer-phone','sdf-adv-slip-count','sdf-adv-collected','sdf-adv-total','sdf-adv-remaining',
   'sdf-adv-used','sdf-adv-uncleared','sdf-preparer-name'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var prepDate = document.getElementById('sdf-preparer-date'); if (prepDate) prepDate.value = new Date().toISOString().slice(0, 10);
  ['sdf-work-open','sdf-work-percontract','sdf-work-other','sdf-work-revisit','sdf-work-fixissue','sdf-work-closecontract'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.checked = false;
  });
  var deptOther = document.getElementById('sdf-dept-other'); if (deptOther) deptOther.checked = true;
  var prep = document.getElementById('sdf-preparation-notes'); if (prep) prep.value = window.SDF_PREP_DEFAULT;
  window._sdfSiteCombo.setValue('');
  var pickWrap = document.getElementById('sdf-contact-pick-wrap'); if (pickWrap) pickWrap.style.display = 'none';
  var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = '';
  window.sdfOnDeptChange();
};

window.sdfLoadForm = function (id) {
  if (!id) { window.sdfNewForm(); return; }
  var f = window.SITE_DEPLOY_FORMS.find(function (x) { return x.id === id; });
  if (!f) return;
  window.sdfEditId = id;
  var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.value = (val === null || val === undefined) ? '' : val; };
  var setChk = function (elId, val) { var el = document.getElementById(elId); if (el) el.checked = !!val; };
  set('sdf-dept-other-note', f.deptOtherNote);
  window._sdfSiteCombo.setValue(f.hospitalId, f.siteLocation);
  set('sdf-province', f.province);
  setChk('sdf-work-open', f.workOpenNewSite);
  setChk('sdf-work-percontract', f.workPerContract);
  setChk('sdf-work-other', f.workOther);
  set('sdf-work-other-note', f.workOtherNote);
  set('sdf-contract-no', f.contractNo);
  setChk('sdf-work-revisit', f.workRevisit);
  set('sdf-revisit-no', f.revisitNo);
  set('sdf-revisit-total', f.revisitTotal);
  setChk('sdf-work-fixissue', f.workFixIssue);
  setChk('sdf-work-closecontract', f.workCloseContract);
  set('sdf-customer-name', f.customerName);
  set('sdf-customer-dept', f.customerDept);
  set('sdf-customer-email', f.customerEmail);
  set('sdf-customer-phone', f.customerPhone);
  set('sdf-preparation-notes', f.preparationNotes);
  set('sdf-adv-slip-count', f.advSlipCount);
  set('sdf-adv-collected', f.advCollectedAmount);
  set('sdf-adv-total', f.advTotalAmount);
  set('sdf-adv-remaining', f.advRemainingAmount);
  set('sdf-adv-used', f.advUsedAmount);
  set('sdf-adv-uncleared', f.advUnclearedCount);
  set('sdf-preparer-name', f.preparerName);
  set('sdf-preparer-date', f.preparerDate);
  var radio = document.getElementById('sdf-dept-' + f.deptKey); if (radio) radio.checked = true;
  window.sdfOnDeptChange();
  var hospital = f.hospitalId ? window.HOSPITALS.find(function (h) { return h.id === f.hospitalId; }) : null;
  window.sdfApplyHospitalContacts(hospital, { autofill:false, matchName:f.customerName });
  window.sdfRenderPreview();
};

window.sdfRefreshSavedList = function () {
  var sel = document.getElementById('ecf-saved-select');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">— ฟอร์มใหม่ —</option>' + window.SITE_DEPLOY_FORMS.map(function (f) {
    return '<option value="' + f.id + '">' + esc(f.siteLocation || f.id) + ' — ' + esc(f.customerName || '') + ' (' + fd(f.createdAt) + ')</option>';
  }).join('');
  sel.value = cur;
};
