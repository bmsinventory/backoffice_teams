const { esc, fd, fca, gT } = window;
const setDoc = (...a) => window.setDoc(...a);

// ── DOM value helpers (module-local) ──
function ecfV(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function ecfChecked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
function ecfNum(id) { return parseFloat((ecfV(id) || '').replace(/,/g, '')) || 0; }
function ecfInt(id) { return parseInt(ecfV(id), 10) || 0; }
function ecfFmt2(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function ecfOthersTotal() {
  return Array.from(document.querySelectorAll('.ecf-other-amount-inp')).reduce(function (s, el) {
    return s + (parseFloat((el.value || '').replace(/,/g, '')) || 0);
  }, 0);
}

// ── Entry Point (idempotent — build DOM once, never rebuild while user is typing) ──
window.renderExpenseForm = function () {
  var root = document.getElementById('ecf-root');
  if (!root) return;
  if (window._ecfBuilt) { window.ecfRefreshActiveSavedList(); return; }
  window._ecfBuilt = true;
  root.innerHTML = ecfBuildHtml();
  window.ecfRefreshProjectCombobox();
  window.ecfRefreshSavedList();
  window.ecfSetWorkers(['']);
  window.ecfSetOthers([]);
  window.ecfRenderPreview();

  window.ecfActiveType = 'ac01';
  var sel = document.getElementById('ecf-form-type-select'); if (sel) sel.value = 'ac01';
  var ac02Wrap = document.getElementById('ecf-ac02-wrap');
  if (ac02Wrap) { ac02Wrap.innerHTML = window.sdfBuildHtml(); window.sdfNewForm(); }
  var ac03Wrap = document.getElementById('ecf-ac03-wrap');
  if (ac03Wrap) { ac03Wrap.innerHTML = window.snlBuildHtml(); window.snlInitCombos(); window.snlNewForm(); }

  if (!window.canEdit('expense_form')) {
    root.querySelectorAll('input, select, textarea, button.ecf-edit-btn').forEach(function (el) { el.disabled = true; });
  }
};

// ── Form-Type Switch (toggles between FM-AC-01 / FM-AC-02 sub-forms in the same page) ──
window.ecfSwitchFormType = function (type) {
  window.ecfActiveType = type;
  var ac01 = document.getElementById('ecf-ac01-wrap');
  var ac02 = document.getElementById('ecf-ac02-wrap');
  var ac03 = document.getElementById('ecf-ac03-wrap');
  if (ac01) ac01.style.display = (type === 'ac01') ? '' : 'none';
  if (ac02) ac02.style.display = (type === 'ac02') ? '' : 'none';
  if (ac03) ac03.style.display = (type === 'ac03') ? '' : 'none';
  window.ecfRefreshActiveSavedList();
  if (type === 'ac02') window.sdfRenderPreview();
  else if (type === 'ac03') window.snlRenderPreview();
  else window.ecfRenderPreview();
};

window.ecfRefreshActiveSavedList = function () {
  if (window.ecfActiveType === 'ac02') window.sdfRefreshSavedList();
  else if (window.ecfActiveType === 'ac03') window.snlRefreshSavedList();
  else window.ecfRefreshSavedList();
};

window.ecfDispatchLoad = function (id) {
  if (window.ecfActiveType === 'ac02') window.sdfLoadForm(id);
  else if (window.ecfActiveType === 'ac03') window.snlLoadForm(id);
  else window.ecfLoadForm(id);
};
window.ecfDispatchNew = function () {
  if (window.ecfActiveType === 'ac02') window.sdfNewForm();
  else if (window.ecfActiveType === 'ac03') window.snlNewForm();
  else window.ecfNewForm();
};
window.ecfDispatchSave = function () {
  if (window.ecfActiveType === 'ac02') window.sdfSave();
  else if (window.ecfActiveType === 'ac03') window.snlSave();
  else window.ecfSave();
};

// ── Build Static Shell (input panel + preview panel) ──
function ecfBuildHtml() {
  var catOpts = window.ECF_CATEGORIES.map(function (c) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">' +
      '<input type="radio" name="ecf-cat" id="ecf-cat-' + c.key + '" value="' + c.key + '" ' + (c.key === 'other' ? 'checked' : '') + ' onchange="window.ecfOnCatChange()">' +
      esc(c.label) + '</label>';
  }).join('');

  return `
  <div style="padding:16px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;" class="no-print">
    <span style="font-size:16px;">🧾</span>
    <select class="t-sel" id="ecf-form-type-select" onchange="window.ecfSwitchFormType(this.value)" style="font-size:14px;font-weight:800;min-width:260px;">
      <option value="ac01">เอกสารประกอบ Adv. (FM-AC-01)</option>
      <option value="ac02">แบบฟอร์มการออกปฏิบัติงาน (FM-AC-02)</option>
      <option value="ac03">หนังสือแจ้งออกไซต์ปฏิบัติงาน</option>
    </select>
    <div style="flex:1;"></div>
    <select class="t-sel" id="ecf-saved-select" onchange="window.ecfDispatchLoad(this.value)" style="min-width:220px;"></select>
    <button class="btn btn-ghost btn-sm ecf-edit-btn" onclick="window.ecfDispatchNew()">+ ฟอร์มใหม่</button>
    <button class="btn btn-teal btn-sm ecf-edit-btn" onclick="window.ecfDispatchSave()">💾 บันทึก</button>
    <button class="btn btn-pri btn-sm" onclick="window.ecfPrint()">🖨️ พิมพ์</button>
  </div>

  <div id="ecf-ac01-wrap">
  <div class="ecf-layout">
    <!-- INPUT PANEL -->
    <div class="ecf-panel no-print">
      <div class="f-group"><label class="f-label">เลขที่ฟอร์ม</label><input class="f-input" id="ecf-form-no" placeholder="เช่น BMS-ADV 6907027" oninput="window.ecfRenderPreview()"></div>

      <div class="f-group">
        <label class="f-label">อ้างอิงโครงการ (ไม่บังคับ — เลือกเพื่อดึงข้อมูลอัตโนมัติ)</label>
        <div id="ecf-proj-cmb-wrap" style="position:relative;">
          <input id="ecf-proj-cmb-input" type="text" class="f-input" placeholder="ค้นหาหรือเลือกโครงการ..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">
          <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>
          <input type="hidden" id="ecf-project-select">
          <div id="ecf-proj-cmb-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">
            <div id="ecf-proj-cmb-list" style="max-height:260px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">ชื่อ-สกุลผู้ปฏิบัติงาน</label><input class="f-input" id="ecf-staff-name" oninput="window.ecfRenderPreview()"></div>
        <div class="f-group"><label class="f-label">เบอร์โทรศัพท์</label><input class="f-input" id="ecf-staff-phone" oninput="window.ecfRenderPreview()"></div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">วันที่ปฏิบัติงาน (เริ่ม)</label><input type="date" class="f-input" id="ecf-work-start" onchange="window.ecfRenderPreview()"></div>
        <div class="f-group"><label class="f-label">ถึงวันที่</label><input type="date" class="f-input" id="ecf-work-end" onchange="window.ecfRenderPreview()"></div>
      </div>

      <div class="f-group"><label class="f-label">สถานที่ปฏิบัติงาน</label><input class="f-input" id="ecf-work-location" oninput="window.ecfRenderPreview()"></div>
      <div class="f-group"><label class="f-label">งานที่ได้รับมอบหมาย</label><textarea class="f-input" id="ecf-assigned-task" oninput="window.ecfRenderPreview()"></textarea></div>

      <div class="f-group">
        <label class="f-label">โครงการ</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;">${catOpts}</div>
        <div id="ecf-cat-other-wrap" style="margin-top:6px;">
          <input class="f-input" id="ecf-cat-other-note" placeholder="ระบุรายละเอียด เช่น งานเอกสาร, งานประชุม ฯลฯ" oninput="window.ecfRenderPreview()">
        </div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">ขอเบิกเงินทดรองจ่ายเป็นจำนวนเงิน (฿)</label><input type="text" class="f-input" id="ecf-requested-amount" readonly style="text-align:right;background:var(--surface2);cursor:not-allowed;"></div>
        <div class="f-group"><label class="f-label">จำนวนคน</label><input type="number" min="1" class="f-input" id="ecf-people-count" oninput="window.ecfRenderPreview()"></div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--indigo);margin-bottom:10px;">🚗 ค่าเดินทาง</div>
        <div class="f-grid">
          <div class="f-group"><label class="f-label">ค่าน้ำมัน และ ทางด่วน</label><input type="text" inputmode="decimal" class="f-input" id="ecf-travel-fuel-toll" oninput="window.ecfRenderPreview()" onblur="window.ecfFmtAmt(this)" onfocus="window.ecfUnfmtAmt(this)" style="text-align:right;"></div>
          <div class="f-group"><label class="f-label">ค่าโดยสารประจำทาง</label><input type="text" inputmode="decimal" class="f-input" id="ecf-travel-transport" oninput="window.ecfRenderPreview()" onblur="window.ecfFmtAmt(this)" onfocus="window.ecfUnfmtAmt(this)" style="text-align:right;"></div>
        </div>
        <div class="f-group"><label class="f-label">ค่าเดินทางระหว่างปฏิบัติงานและอื่นๆ</label><input type="text" inputmode="decimal" class="f-input" id="ecf-travel-other" oninput="window.ecfRenderPreview()" onblur="window.ecfFmtAmt(this)" onfocus="window.ecfUnfmtAmt(this)" style="text-align:right;"></div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:10px;">🏨 ค่าที่พัก</div>
        <div class="f-grid" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="f-group"><label class="f-label">จำนวนวันที่พัก</label><input type="number" min="0" class="f-input" id="ecf-lodging-nights" oninput="window.ecfRenderPreview()"></div>
          <div class="f-group"><label class="f-label">จำนวนห้อง</label><input type="number" min="0" class="f-input" id="ecf-lodging-rooms" oninput="window.ecfRenderPreview()"></div>
          <div class="f-group"><label class="f-label">ราคาต่อห้อง (฿)</label><input type="text" inputmode="decimal" class="f-input" id="ecf-lodging-rate" oninput="window.ecfRenderPreview()" onblur="window.ecfFmtAmt(this)" onfocus="window.ecfUnfmtAmt(this)" style="text-align:right;"></div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">📎 อื่นๆ — รายละเอียด / จำนวนเงิน (฿)</div>
        <div id="ecf-others-body"></div>
        <button class="btn btn-ghost btn-sm" onclick="window.ecfAddOtherRow()" style="margin-top:4px;font-size:11px;">+ เพิ่มรายการ</button>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">👥 รายชื่อผู้ปฏิบัติงาน (สูงสุด 12 คน)</div>
        <div id="ecf-workers-body"></div>
        <button class="btn btn-ghost btn-sm" onclick="window.ecfAddWorkerRow()" style="margin-top:4px;font-size:11px;">+ เพิ่มคน</button>
      </div>

      <div class="f-group">
        <label class="f-label">หมายเหตุ</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;"><input type="checkbox" id="ecf-note-schedule" checked onchange="window.ecfRenderPreview()"> ลงตารางปฏิบัติงานเรียบร้อย</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" id="ecf-note-letter" onchange="window.ecfRenderPreview()"> ทำหนังสือแจ้งเข้าปฏิบัติงานเรียบร้อย</label>
      </div>
    </div>

    <!-- PREVIEW / PRINT PANEL -->
    <div class="ecf-preview-wrap">
      <div id="ecf-print-area" class="ecf-sheet"></div>
    </div>
  </div>
  </div>
  <div id="ecf-ac02-wrap" style="display:none"></div>
  <div id="ecf-ac03-wrap" style="display:none"></div>
  `;
}

// ── Preview Renderer (reads current DOM values, regenerates print sheet only) ──
window.ecfRenderPreview = function () {
  var area = document.getElementById('ecf-print-area');
  if (!area) return;

  var catKey = 'other';
  var catEl = document.querySelector('input[name="ecf-cat"]:checked');
  if (catEl) catKey = catEl.value;

  var workerNames = Array.from(document.querySelectorAll('.ecf-worker-inp')).map(function (el) { return el.value.trim(); });
  while (workerNames.length < 12) workerNames.push('');

  var travelTotal  = ecfNum('ecf-travel-fuel-toll') + ecfNum('ecf-travel-transport') + ecfNum('ecf-travel-other');
  var lodgingTotal = ecfInt('ecf-lodging-nights') * ecfInt('ecf-lodging-rooms') * ecfNum('ecf-lodging-rate');
  var othersTotal  = ecfOthersTotal();
  var grandTotal   = travelTotal + lodgingTotal + othersTotal;

  // ขอเบิกเงินทดรองจ่ายเป็นจำนวนเงิน คำนวณอัตโนมัติ — ห้ามแก้ไขเอง
  var reqEl = document.getElementById('ecf-requested-amount');
  if (reqEl) reqEl.value = ecfFmt2(grandTotal);

  var catBoxes = window.ECF_CATEGORIES.map(function (c) {
    var on = c.key === catKey;
    var otherNote = (c.key === 'other' && on && ecfV('ecf-cat-other-note').trim())
      ? ' <span class="ecf-fill">' + esc(ecfV('ecf-cat-other-note').trim()) + '</span>' : '';
    return '<div class="ecf-cbx"><span class="ecf-box">' + (on ? '✓' : '') + '</span>' + esc(c.label) + otherNote + '</div>';
  }).join('');

  var workerCells = workerNames.map(function (n, i) {
    return '<div class="ecf-w-cell"><span class="ecf-w-idx">' + (i + 1) + ')</span> <span class="ecf-fill">' + (n ? esc(n) : '&nbsp;') + '</span></div>';
  }).join('');

  var othersItems = Array.from(document.querySelectorAll('.ecf-other-row')).map(function (row) {
    var noteEl = row.querySelector('.ecf-other-note-inp');
    var amtEl  = row.querySelector('.ecf-other-amount-inp');
    var note = noteEl ? noteEl.value.trim() : '';
    var amt  = amtEl ? (parseFloat((amtEl.value || '').replace(/,/g, '')) || 0) : 0;
    return (note || amt) ? { note: note, amt: amt } : null;
  }).filter(Boolean);

  // รวมรายการ "อื่นๆ" ไว้ใต้หัวข้อเดียว — แต่ละรายการยังเป็นแถวตารางจริงของตัวเอง (row-per-item) เพื่อให้
  // จำนวนเงินตรงกับรายละเอียดเสมอ ไม่ว่าคำอธิบายจะยาวกี่บรรทัดก็ตาม (คนละแถว flex อิสระแบบเดิมจะเลื่อนไม่ตรงกัน
  // ทันทีที่มีรายการใดขึ้นบรรทัดใหม่)
  var othersRowsHtml = othersItems.length
    ? '<tr><td colspan="2">อื่นๆ :</td></tr>' + othersItems.map(function (o) {
        return '<tr><td class="ecf-fill" style="padding-left:20px;">- ' + (o.note ? esc(o.note) : '&nbsp;') + '</td><td class="ecf-fill ecf-amt">' + (o.amt ? fca(o.amt) : '—') + '</td></tr>';
      }).join('')
    : '<tr><td>อื่นๆ : <span class="ecf-fill">&nbsp;</span></td><td class="ecf-fill ecf-amt">—</td></tr>';

  area.innerHTML = `
    <div class="ecf-head">
      <div class="ecf-head-co">
        <div class="ecf-co-name">บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด (สำนักงานใหญ่)</div>
        <div class="ecf-co-addr">เลขที่ 2 ชั้น 2 ซ.สุขสวัสดิ์ 33 แขวงราษฎร์บูรณะ เขตราษฎร์บูรณะ กรุงเทพมหานคร</div>
      </div>
      <div class="ecf-head-title">EXPENSE CLEARING</div>
    </div>
    <div class="ecf-formno">เลขที่&nbsp; <span class="ecf-fill">${esc(ecfV('ecf-form-no')) || '&nbsp;'}</span></div>

    <div class="ecf-row"><span class="ecf-lbl">ชื่อ-สกุล ผู้ปฏิบัติงาน</span><span class="ecf-fill ecf-grow">${esc(ecfV('ecf-staff-name')) || '&nbsp;'}</span><span class="ecf-lbl">เบอร์โทรศัพท์</span><span class="ecf-fill">${esc(ecfV('ecf-staff-phone')) || '&nbsp;'}</span></div>
    <div class="ecf-row"><span class="ecf-lbl">วันที่ปฏิบัติงาน</span><span class="ecf-fill">${fd(ecfV('ecf-work-start'))}</span><span class="ecf-lbl">ถึงวันที่</span><span class="ecf-fill">${fd(ecfV('ecf-work-end'))}</span><span class="ecf-lbl">สถานที่ปฏิบัติงาน</span><span class="ecf-fill ecf-grow">${esc(ecfV('ecf-work-location')) || '&nbsp;'}</span></div>
    <div class="ecf-row"><span class="ecf-lbl">งานที่ได้รับมอบหมาย</span><span class="ecf-fill ecf-grow">${esc(ecfV('ecf-assigned-task')) || '&nbsp;'}</span></div>

    <div class="ecf-cat-block">
      <div class="ecf-cat-lbl">โครงการ</div>
      <div class="ecf-cat-grid">${catBoxes}</div>
    </div>

    <div class="ecf-row"><span class="ecf-lbl">ขอเบิกเงินทดรองจ่ายเป็นจำนวนเงิน</span><span class="ecf-fill">${ecfFmt2(grandTotal)}</span><span class="ecf-lbl">บาท จำนวนคน</span><span class="ecf-fill">${esc(ecfV('ecf-people-count')) || '&nbsp;'}</span><span class="ecf-lbl">คน</span></div>

    <table class="ecf-table">
      <thead><tr><th>รายละเอียดการประมาณการเบิกเงินทดรองจ่าย</th><th>จำนวนเงิน</th></tr></thead>
      <tbody>
        <tr><td>ค่าน้ำมัน และ ทางด่วน</td><td class="ecf-fill ecf-amt">${ecfNum('ecf-travel-fuel-toll') ? fca(ecfNum('ecf-travel-fuel-toll')) : '—'}</td></tr>
        <tr><td>ค่าโดยสารประจำทาง (แนบเอกสาร **) รถตู้ / รถทัวร์ / เครื่องบิน / Taxi</td><td class="ecf-fill ecf-amt">${ecfNum('ecf-travel-transport') ? fca(ecfNum('ecf-travel-transport')) : '—'}</td></tr>
        <tr><td>ค่าเดินทางระหว่างปฏิบัติงานและอื่นๆ</td><td class="ecf-fill ecf-amt">${ecfNum('ecf-travel-other') ? fca(ecfNum('ecf-travel-other')) : '—'}</td></tr>
        <tr><td>ค่าที่พัก : จำนวนวันที่พัก <span class="ecf-fill">${esc(ecfV('ecf-lodging-nights')) || '0'}</span> วัน / จำนวนห้อง <span class="ecf-fill">${esc(ecfV('ecf-lodging-rooms')) || '0'}</span> ห้อง / ราคาต่อห้อง <span class="ecf-fill">${ecfV('ecf-lodging-rate') ? ecfFmt2(ecfNum('ecf-lodging-rate')) : '0.00'}</span> บาท</td><td class="ecf-fill ecf-amt">${lodgingTotal ? fca(lodgingTotal) : '—'}</td></tr>
        <tr><td><div class="ecf-workers-lbl">รายชื่อผู้ปฏิบัติงาน:</div><div class="ecf-workers-grid">${workerCells}</div></td><td></td></tr>
        ${othersRowsHtml}
      </tbody>
      <tfoot>
        <tr><td>รวม เงินทดรองจ่ายทั้งหมด</td><td class="ecf-fill ecf-amt ecf-total">${fca(grandTotal)}</td></tr>
        <tr><td>ค่าใช้จ่ายใช้จริง (FM-AC-05)</td><td class="ecf-amt">&nbsp;</td></tr>
        <tr><td>คงเหลือคืน - บริษัทฯ(+), พนักงาน (-)</td><td class="ecf-amt">&nbsp;</td></tr>
      </tfoot>
    </table>

    <div class="ecf-notes">
      <label><span class="ecf-box">${ecfChecked('ecf-note-schedule') ? '✓' : ''}</span> ลงตารางปฏิบัติงานเรียบร้อย</label>
      <label><span class="ecf-box">${ecfChecked('ecf-note-letter') ? '✓' : ''}</span> ทำหนังสือแจ้งเข้าปฏิบัติงานเรียบร้อย</label>
    </div>

    <div class="ecf-sign-grid">
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>ผู้ขอเบิก</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>PM / PM (แทน)</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>ผู้อนุมัติ</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>แผนกการเงิน</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>ผู้เคลียร์เงินทดรองจ่าย</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>ผู้รับคืนเงินทดรองจ่าย</div><div class="ecf-sign-date">___/___/___</div></div>
      <div class="ecf-sign"><div class="ecf-sign-line"></div><div>ผู้จัดการทั่วไป</div><div class="ecf-sign-date">___/___/___</div></div>
    </div>
  `;
};

// ── Category Change: toggle the "OFF. / Other" detail field ──
window.ecfOnCatChange = function () {
  var wrap = document.getElementById('ecf-cat-other-wrap');
  var isOther = document.getElementById('ecf-cat-other');
  if (wrap) wrap.style.display = (isOther && isOther.checked) ? '' : 'none';
  window.ecfRenderPreview();
};

// ── Amount Input Formatting (thousand separators, same UX pattern as Advance module) ──
window.ecfFmtAmt = function (el) {
  var n = parseFloat((el.value || '').replace(/,/g, ''));
  el.value = isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  window.ecfRenderPreview();
};
window.ecfUnfmtAmt = function (el) {
  var n = parseFloat((el.value || '').replace(/,/g, ''));
  el.value = isNaN(n) ? '' : n.toFixed(2);
};

// ── Worker Rows ──
window.ecfAddWorkerRow = function (name) {
  var body = document.getElementById('ecf-workers-body');
  if (!body) return;
  if (body.querySelectorAll('.ecf-worker-row').length >= 12) return;
  var rowId = 'ecfw' + Date.now() + Math.floor(Math.random() * 1000);
  var row = document.createElement('div');
  row.className = 'ecf-worker-row';
  row.id = rowId;
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input class="f-input ecf-worker-inp" placeholder="ชื่อ-นามสกุล" value="' + esc(name || '') + '" oninput="window.ecfRenderPreview()" style="font-size:12px;padding:6px 8px;">' +
    '<button class="btn btn-red btn-sm" onclick="window.ecfDelWorkerRow(\'' + rowId + '\')" style="padding:4px 8px;">✕</button>';
  body.appendChild(row);
};
window.ecfDelWorkerRow = function (rowId) {
  var el = document.getElementById(rowId);
  if (el) el.remove();
  if (!document.querySelectorAll('.ecf-worker-row').length) window.ecfAddWorkerRow('');
  window.ecfRenderPreview();
};
window.ecfSetWorkers = function (names) {
  var body = document.getElementById('ecf-workers-body');
  if (!body) return;
  body.innerHTML = '';
  (names && names.length ? names : ['']).slice(0, 12).forEach(function (n) { window.ecfAddWorkerRow(n); });
};

// ── Other Items (repeatable: detail + amount, replaces the old single-entry อื่นๆ fields) ──
window.ecfAddOtherRow = function (note, amount) {
  var body = document.getElementById('ecf-others-body');
  if (!body) return;
  var rowId = 'ecfo' + Date.now() + Math.floor(Math.random() * 1000);
  var row = document.createElement('div');
  row.className = 'ecf-other-row';
  row.id = rowId;
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input class="f-input ecf-other-note-inp" placeholder="รายละเอียด" value="' + esc(note || '') + '" oninput="window.ecfRenderPreview()" style="flex:2;font-size:12px;padding:6px 8px;">' +
    '<input type="text" inputmode="decimal" class="f-input ecf-other-amount-inp" placeholder="0.00" value="' + (amount ? ecfFmt2(amount) : '') + '" oninput="window.ecfRenderPreview()" onblur="window.ecfFmtAmt(this)" onfocus="window.ecfUnfmtAmt(this)" style="flex:1;font-size:12px;padding:6px 8px;text-align:right;">' +
    '<button class="btn btn-red btn-sm" onclick="window.ecfDelOtherRow(\'' + rowId + '\')" style="padding:4px 8px;">✕</button>';
  body.appendChild(row);
};
window.ecfDelOtherRow = function (rowId) {
  var el = document.getElementById(rowId);
  if (el) el.remove();
  if (!document.querySelectorAll('.ecf-other-row').length) window.ecfAddOtherRow('', '');
  window.ecfRenderPreview();
};
window.ecfSetOthers = function (items) {
  var body = document.getElementById('ecf-others-body');
  if (!body) return;
  body.innerHTML = '';
  (items && items.length ? items : [{ note:'', amount:0 }]).forEach(function (o) { window.ecfAddOtherRow(o.note, o.amount); });
};

// ── Project Auto-fill ──
// Searchable combobox (same UX + same "ที่ยังไม่ถึงวันเริ่มโครงการ" filter as the Site Notice Form's
// project picker) — refreshes the project list + resets/restores selection. Call with a pid to
// preselect it (loading a saved form), or no args to reset to unselected (new form / initial build).
window.ecfRefreshProjectCombobox = function (curPid) {
  var todayStr = new Date().toISOString().slice(0, 10);
  var projects = (window.PROJECTS || []).filter(function (p) { return p.start && p.start > todayStr; })
    .sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
  // ถ้าโหลดฟอร์มเดิมที่อ้างอิงโครงการซึ่งเลยวันเริ่มไปแล้ว ให้แทรกกลับเข้ามาด้วย ไม่งั้นค่าที่เคยเลือกไว้จะหายไปจาก dropdown
  if (curPid && !projects.some(function (p) { return p.id === curPid; })) {
    var cur = (window.PROJECTS || []).find(function (p) { return p.id === curPid; });
    if (cur) projects.unshift(cur);
  }
  window.initProjectCombobox(
    { wrapId: 'ecf-proj-cmb-wrap', inputId: 'ecf-proj-cmb-input', dropId: 'ecf-proj-cmb-drop', listId: 'ecf-proj-cmb-list', hiddenId: 'ecf-project-select' },
    projects, curPid || '',
    function () { window.ecfOnProjectChange(); }
  );
};

window.ecfOnProjectChange = function () {
  var pid = ecfV('ecf-project-select');
  if (!pid) return;
  var proj = window.PROJECTS.find(function (p) { return p.id === pid; });
  if (!proj) return;

  var ws = document.getElementById('ecf-work-start'); if (ws) ws.value = proj.start || '';
  var we = document.getElementById('ecf-work-end');   if (we) we.value = proj.end || '';
  var staffName = document.getElementById('ecf-staff-name'); if (staffName) staffName.value = proj.installer || '';
  var staffPhone = document.getElementById('ecf-staff-phone');
  if (staffPhone) {
    var installerStaff = proj.installer ? window.STAFF.find(function (s) { return s.name === proj.installer; }) : null;
    staffPhone.value = installerStaff ? (installerStaff.phone || '') : '';
  }
  var loc = document.getElementById('ecf-work-location'); if (loc) loc.value = proj.name || '';
  var task = document.getElementById('ecf-assigned-task'); if (task) task.value = proj.name || '';

  var catKey = window.ecfMatchCategory(gT(proj.typeId).label);
  var radio = document.getElementById('ecf-cat-' + catKey);
  if (radio) radio.checked = true;

  var mems = (proj.members && proj.members.length) ? proj.members : (proj.team || []).map(function (sid) { return { sid:sid }; });
  var names = mems.map(function (m) {
    var s = window.STAFF.find(function (x) { return x.id === m.sid; });
    return s ? s.name : '';
  }).filter(Boolean);
  window.ecfSetWorkers(names.length ? names : ['']);
  var pc = document.getElementById('ecf-people-count'); if (pc) pc.value = names.length || 1;

  window.ecfRenderPreview();
};

// ── Save / Load / New ──
window.ecfGatherData = function () {
  var catEl = document.querySelector('input[name="ecf-cat"]:checked');
  var workers = Array.from(document.querySelectorAll('.ecf-worker-inp'))
    .map(function (el) { return { name: el.value.trim() }; })
    .filter(function (w) { return w.name; });
  var others = Array.from(document.querySelectorAll('.ecf-other-row')).map(function (row) {
    var noteEl = row.querySelector('.ecf-other-note-inp');
    var amtEl  = row.querySelector('.ecf-other-amount-inp');
    return {
      note: noteEl ? noteEl.value.trim() : '',
      amount: amtEl ? (parseFloat((amtEl.value || '').replace(/,/g, '')) || 0) : 0,
    };
  }).filter(function (o) { return o.note || o.amount; });
  // ขอเบิกเงินทดรองจ่ายเป็นจำนวนเงิน = รวมค่าเดินทาง + ค่าที่พัก + อื่นๆ ทั้งหมด (คำนวณอัตโนมัติ ไม่รับค่าที่กรอกเอง)
  var grandSum = ecfNum('ecf-travel-fuel-toll') + ecfNum('ecf-travel-transport') + ecfNum('ecf-travel-other') +
                 (ecfInt('ecf-lodging-nights') * ecfInt('ecf-lodging-rooms') * ecfNum('ecf-lodging-rate')) +
                 others.reduce(function (s, o) { return s + o.amount; }, 0);
  return {
    form_no: ecfV('ecf-form-no').trim(),
    project_id: ecfV('ecf-project-select'),
    category_key: catEl ? catEl.value : 'other',
    category_other_note: ecfV('ecf-cat-other-note').trim(),
    staff_name: ecfV('ecf-staff-name').trim(),
    staff_phone: ecfV('ecf-staff-phone').trim(),
    work_start: ecfV('ecf-work-start'),
    work_end: ecfV('ecf-work-end'),
    work_location: ecfV('ecf-work-location').trim(),
    assigned_task: ecfV('ecf-assigned-task').trim(),
    requested_amount: grandSum,
    people_count: ecfInt('ecf-people-count') || workers.length || 1,
    travel_fuel_toll: ecfNum('ecf-travel-fuel-toll'),
    travel_transport: ecfNum('ecf-travel-transport'),
    travel_other: ecfNum('ecf-travel-other'),
    lodging_nights: ecfInt('ecf-lodging-nights'),
    lodging_rooms: ecfInt('ecf-lodging-rooms'),
    lodging_rate: ecfNum('ecf-lodging-rate'),
    workers: workers,
    others: others,
    total_amount: grandSum,
    note_schedule_signed: ecfChecked('ecf-note-schedule'),
    note_letter_sent: ecfChecked('ecf-note-letter'),
  };
};

window.ecfSave = async function () {
  if (!window.canEdit('expense_form')) return;
  var data = window.ecfGatherData();
  if (!data.staff_name) { alert('กรุณากรอกชื่อ-สกุลผู้ปฏิบัติงาน'); return; }
  var id = window.ecfEditId || window.ecfUid();
  try {
    await setDoc(window.getDocRef('EXPENSE_CLEARING_FORMS', id), data);
    window.ecfApplyLocal(id, data);
    window.ecfEditId = id;
    window.ecfRefreshSavedList();
    var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = id;
  } catch (e) { window.showDbError ? window.showDbError(e) : console.error(e); }
};

window.ecfNewForm = function () {
  window.ecfEditId = null;
  ['ecf-form-no','ecf-staff-name','ecf-staff-phone','ecf-work-start','ecf-work-end',
   'ecf-work-location','ecf-assigned-task','ecf-people-count','ecf-travel-fuel-toll',
   'ecf-travel-transport','ecf-travel-other','ecf-lodging-nights','ecf-lodging-rooms','ecf-lodging-rate',
   'ecf-cat-other-note'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  window.ecfRefreshProjectCombobox();
  var catOther = document.getElementById('ecf-cat-other'); if (catOther) catOther.checked = true;
  var ns = document.getElementById('ecf-note-schedule'); if (ns) ns.checked = true;
  var nl = document.getElementById('ecf-note-letter'); if (nl) nl.checked = false;
  window.ecfSetWorkers(['']);
  window.ecfSetOthers([]);
  var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = '';
  window.ecfOnCatChange();
};

window.ecfLoadForm = function (id) {
  if (!id) { window.ecfNewForm(); return; }
  var f = window.EXPENSE_CLEARING_FORMS.find(function (x) { return x.id === id; });
  if (!f) return;
  window.ecfEditId = id;
  var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.value = val; };
  set('ecf-form-no', f.formNo);
  window.ecfRefreshProjectCombobox(f.projectId || '');
  set('ecf-staff-name', f.staffName);
  set('ecf-staff-phone', f.staffPhone);
  set('ecf-work-start', f.workStart);
  set('ecf-work-end', f.workEnd);
  set('ecf-work-location', f.workLocation);
  set('ecf-assigned-task', f.assignedTask);
  set('ecf-people-count', f.peopleCount);
  set('ecf-travel-fuel-toll', f.travelFuelToll ? ecfFmt2(f.travelFuelToll) : '');
  set('ecf-travel-transport', f.travelTransport ? ecfFmt2(f.travelTransport) : '');
  set('ecf-travel-other', f.travelOther ? ecfFmt2(f.travelOther) : '');
  set('ecf-lodging-nights', f.lodgingNights || '');
  set('ecf-lodging-rooms', f.lodgingRooms || '');
  set('ecf-lodging-rate', f.lodgingRate ? ecfFmt2(f.lodgingRate) : '');
  window.ecfSetOthers(f.others || []);
  set('ecf-cat-other-note', f.categoryOtherNote);
  var radio = document.getElementById('ecf-cat-' + f.categoryKey); if (radio) radio.checked = true;
  window.ecfOnCatChange();
  var ns = document.getElementById('ecf-note-schedule'); if (ns) ns.checked = f.noteScheduleSigned;
  var nl = document.getElementById('ecf-note-letter'); if (nl) nl.checked = f.noteLetterSent;
  window.ecfSetWorkers((f.workers || []).map(function (w) { return w.name; }));
  window.ecfRenderPreview();
};

window.ecfRefreshSavedList = function () {
  var sel = document.getElementById('ecf-saved-select');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">— ฟอร์มใหม่ —</option>' + window.EXPENSE_CLEARING_FORMS.map(function (f) {
    return '<option value="' + f.id + '">' + esc(f.formNo || f.id) + ' — ' + esc(f.staffName || '') + ' (' + fd(f.workStart) + ')</option>';
  }).join('');
  sel.value = cur;
};

// ── Print ──
window.ecfPrint = function () { window.print(); };
