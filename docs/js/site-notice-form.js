const { esc, fd } = window;

// ── DOM value helpers (module-local, mirrors ecf*/sdf* helpers) ──
function snlV(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function snlChecked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
function snlNumOrBlank(id) {
  var v = (snlV(id) || '').trim();
  if (!v) return '';
  var n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? '' : n;
}
function snlFmt2(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); }

// ── Project → Form Field Mapping Helpers ──
// ระบบ: ประเภทงาน (PTYPES.label) "คลังสินค้า" → BMS-INVENTORY, นอกนั้นทั้งหมด → อื่นๆ
function snlMatchSystemKey(label) {
  return (label || '').indexOf('คลังสินค้า') !== -1 ? 'inventory' : 'other';
}
// เรื่องที่ให้ดำเนินการ: อ้างอิงตาม ID กลุ่มงาน (PGROUPS.id) ตรงตัวตามที่กำหนด — ไม่เดาจากชื่อ ──
function snlMatchTaskKeyByGroupId(groupId) {
  switch (groupId) {
    case 'GRP17733355541902': return 'ma';
    case 'GRP17733355541904': return 'revisit';
    case 'GRP17733355541901':
    case 'GRP17733355541903': return 'install';
    default: return 'other';
  }
}

// ── Build Static Shell (input panel + preview panel) — called once by expense-form.js into #ecf-ac03-wrap ──
window.snlBuildHtml = function () {
  var sysOpts = window.SNL_SYSTEMS.map(function (c) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">' +
      '<input type="radio" name="snl-system" id="snl-system-' + c.key + '" value="' + c.key + '" ' + (c.key === 'other' ? 'checked' : '') + ' onchange="window.snlOnSystemChange()">' +
      esc(c.label) + '</label>';
  }).join('');
  var addresseeOpts = window.SNL_ADDRESSEES.map(function (c) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">' +
      '<input type="radio" name="snl-addressee" id="snl-addressee-' + c.key + '" value="' + c.key + '" ' + (c.key === 'hospital_director' ? 'checked' : '') + ' onchange="window.snlOnAddresseeChange()">' +
      esc(c.label) + '</label>';
  }).join('');
  var purposeOpts = window.SNL_PURPOSES.map(function (c) {
    return '<label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;cursor:pointer;margin-bottom:6px;">' +
      '<input type="radio" name="snl-purpose" id="snl-purpose-' + c.key + '" value="' + c.key + '" ' + (c.key === 'inform' ? 'checked' : '') + ' onchange="window.snlOnPurposeChange()" style="margin-top:2px;">' +
      '<span>' + esc(c.label) + '</span></label>';
  }).join('');
  var todayStr = new Date().toISOString().slice(0, 10);

  return `
  <div class="ecf-layout">
    <!-- INPUT PANEL -->
    <div class="ecf-panel no-print">
      <div class="f-grid">
        <div class="f-group"><label class="f-label">เลขที่เอกสาร (No.)</label><input class="f-input" id="snl-doc-no" oninput="window.snlRenderPreview()"></div>
        <div class="f-group"><label class="f-label">วันที่</label><input type="date" class="f-input" id="snl-doc-date" value="${todayStr}" onchange="window.snlRenderPreview()"></div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:8px;">🙋 ผู้ขอแจ้ง</div>
        <div class="f-grid" style="grid-template-columns:1.6fr 1fr 1fr;gap:10px;">
          <div class="f-group" style="margin-bottom:0;">
            <label class="f-label">ชื่อ-นามสกุล</label>
            <div id="snl-requester-name-wrap" style="position:relative;">
              <input class="f-input" id="snl-requester-name" autocomplete="off" oninput="window.snlOnRequesterNameChange()">
              <div id="snl-requester-name-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">
                <div id="snl-requester-name-list" style="max-height:220px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label">ตำแหน่ง</label><input class="f-input" id="snl-requester-position" oninput="window.snlRenderPreview()"></div>
          <div class="f-group" style="margin-bottom:0;"><label class="f-label">แผนก/ฝ่าย</label><input class="f-input" id="snl-requester-dept" oninput="window.snlRenderPreview()"></div>
        </div>
      </div>

      <div class="f-group">
        <label class="f-label">📁 เลือกโครงการติดตั้งระบบ (ที่ยังไม่ถึงวันเริ่มโครงการ)</label>
        <div id="snl-proj-cmb-wrap" style="position:relative;">
          <input id="snl-proj-cmb-input" type="text" class="f-input" placeholder="ค้นหาหรือเลือกโครงการ... (ไม่เลือก = กรอกข้อมูลเอง)" autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">
          <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>
          <input type="hidden" id="snl-project-pick">
          <div id="snl-proj-cmb-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">
            <div id="snl-proj-cmb-list" style="max-height:260px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <div class="f-group">
        <label class="f-label">ระบบ</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;">${sysOpts}</div>
        <div id="snl-system-other-wrap" style="margin-top:6px;">
          <input class="f-input" id="snl-system-other-note" placeholder="ระบุรายละเอียด เช่น ระบบงานครุภัณฑ์ ฯลฯ" oninput="window.snlRenderPreview()">
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">📋 เรื่องที่ให้ดำเนินการ</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;align-items:center;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="snl-task-install" onchange="window.snlRenderPreview()"> เข้าปฏิบัติงานติดตั้ง
          </label>
          <div style="display:flex;align-items:center;gap:4px;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-revisit" onchange="window.snlRenderPreview()"> Re-visit ครั้งที่
            </label>
            <input class="f-input" id="snl-revisit-no" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
            <span style="font-size:12px;color:var(--txt3);">/</span>
            <input class="f-input" id="snl-revisit-total" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
          </div>

          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="snl-task-reply-lecturer" onchange="window.snlRenderPreview()"> ตอบกลับวิทยากร
          </label>
          <div style="display:flex;align-items:center;gap:4px;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-ma" onchange="window.snlRenderPreview()"> MA ครั้งที่
            </label>
            <input class="f-input" id="snl-ma-no" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
            <span style="font-size:12px;color:var(--txt3);">/</span>
            <input class="f-input" id="snl-ma-total" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
          </div>

          <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <input type="checkbox" id="snl-task-survey" onchange="window.snlRenderPreview()"> สำรวจระบบ
          </label>
          <div style="display:flex;align-items:center;gap:4px;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-delivery" onchange="window.snlRenderPreview()"> ส่งมอบงาน งวดที่
            </label>
            <input class="f-input" id="snl-delivery-no" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
            <span style="font-size:12px;color:var(--txt3);">/</span>
            <input class="f-input" id="snl-delivery-total" oninput="window.snlRenderPreview()" style="width:46px;padding:5px 4px;font-size:12px;text-align:center;">
          </div>

          <div style="display:flex;align-items:center;gap:6px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-present" onchange="window.snlRenderPreview()"> นำเสนอโปรแกรม
            </label>
            <select class="f-input" id="snl-present-type" onchange="window.snlRenderPreview()" style="padding:5px 6px;font-size:12px;">
              <option value="">เชิงรุก/เชิงรับ</option>
              <option value="เชิงรุก">เชิงรุก</option>
              <option value="เชิงรับ">เชิงรับ</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-copydata" onchange="window.snlRenderPreview()"> ขอคัดลอกฐานข้อมูล
            </label>
            <select class="f-input" id="snl-copydata-status" onchange="window.snlRenderPreview()" style="padding:5px 6px;font-size:12px;">
              <option value="">เลือกสถานะสัญญา</option>
              <option value="signed">เซ็นสัญญาแล้ว</option>
              <option value="unsigned">ยังไม่เซ็นสัญญา</option>
            </select>
          </div>

          <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;">
              <input type="checkbox" id="snl-task-other" onchange="window.snlRenderPreview()"> อื่นๆ ระบุ
            </label>
            <input class="f-input" id="snl-task-other-note" oninput="window.snlRenderPreview()" style="flex:1;padding:5px 8px;font-size:12px;">
          </div>
        </div>
      </div>

      <div class="f-grid">
        <div class="f-group"><label class="f-label">วันที่ดำเนินงาน (เริ่ม)</label><input type="date" class="f-input" id="snl-work-start" onchange="window.snlRenderPreview()"></div>
        <div class="f-group"><label class="f-label">ถึงวันที่</label><input type="date" class="f-input" id="snl-work-end" onchange="window.snlRenderPreview()"></div>
      </div>
      <div class="f-group">
        <label class="f-label">สถานที่</label>
        <div id="snl-site-location-wrap" style="position:relative;">
          <input class="f-input" id="snl-site-location" autocomplete="off" oninput="window.snlOnSiteLocationChange()">
          <div id="snl-site-location-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">
            <div id="snl-site-location-list" style="max-height:220px;overflow-y:auto;"></div>
          </div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px;">👥 รายชื่อผู้เข้าปฏิบัติงาน (ใส่เฉพาะกรณีแจ้งออกหนังสือเพื่อเข้าปฏิบัติงาน)</div>
        <div id="snl-attendees-body"></div>
        <button class="btn btn-ghost btn-sm" onclick="window.snlAddAttendeeRow()" style="margin-top:4px;font-size:11px;">+ เพิ่มคน</button>
      </div>

      <div class="f-group">
        <label class="f-label">หนังสือแจ้งถึง</label>
        <div style="display:grid;grid-template-columns:1fr;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;">${addresseeOpts}</div>
        <div id="snl-addressee-other-wrap" style="margin-top:6px;display:none;">
          <input class="f-input" id="snl-addressee-other-note" placeholder="ระบุผู้รับหนังสือ" oninput="window.snlRenderPreview()">
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--indigo);margin-bottom:10px;">📨 หนังสือแจ้งเพื่อ</div>
        <div>${purposeOpts}</div>
        <div id="snl-committee-wrap" style="display:none;padding-left:22px;">
          <div class="f-grid">
            <div class="f-group"><label class="f-label">สัญญาเลขที่</label><input class="f-input" id="snl-contract-no" oninput="window.snlRenderPreview()"></div>
            <div class="f-group"><label class="f-label">จำนวน (บาท)</label><input type="text" inputmode="decimal" class="f-input" id="snl-contract-amount" oninput="window.snlRenderPreview()" style="text-align:right;"></div>
          </div>
          <div class="f-grid">
            <div class="f-group"><label class="f-label">ลงวันที่</label><input type="date" class="f-input" id="snl-contract-date" onchange="window.snlRenderPreview()"></div>
            <div class="f-group"><label class="f-label">ใบเสนอราคาเลขที่</label><input class="f-input" id="snl-quote-no" oninput="window.snlRenderPreview()"></div>
          </div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--violet);margin-bottom:10px;">📮 ช่องทางที่ต้องการให้จัดส่ง</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px;">
          <input type="checkbox" id="snl-deliver-mail" checked onchange="window.snlRenderPreview()"> ทางไปรษณีย์ :: จ่าหน้าซองถึง ผู้อำนวยการโรงพยาบาล
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;">
          <input type="checkbox" id="snl-deliver-email" checked onchange="window.snlRenderPreview()"> ทาง E-mail
        </label>
        <div class="f-group"><label class="f-label">E-mail</label><input class="f-input" id="snl-email-to" oninput="window.snlRenderPreview()"></div>
        <div class="f-group"><label class="f-label">CC E-mail (คั่นด้วยจุลภาค)</label><input class="f-input" id="snl-email-cc" oninput="window.snlRenderPreview()"></div>
      </div>
    </div>

    <!-- PREVIEW / PRINT PANEL -->
    <div class="ecf-preview-wrap">
      <div id="snl-print-area" class="snl-sheet"></div>
    </div>
  </div>
  `;
};

// ── Combobox Wiring (same searchable UX as the Advance project picker) ──
// snlInitCombos binds the persistent free-text suggest comboboxes once (สถานที่ / ชื่อ-นามสกุล) —
// safe to call only once since #ecf-ac03-wrap is built a single time and never re-rendered.
window.snlInitCombos = function () {
  window.initSuggestCombobox({
    wrapId: 'snl-site-location-wrap', inputId: 'snl-site-location', dropId: 'snl-site-location-drop', listId: 'snl-site-location-list',
    getItems: function () { return (window.HOSPITALS || []).map(function (h) { return h.name; }); },
    onSelect: function () { window.snlOnSiteLocationChange(); }
  });
  window.initSuggestCombobox({
    wrapId: 'snl-requester-name-wrap', inputId: 'snl-requester-name', dropId: 'snl-requester-name-drop', listId: 'snl-requester-name-list',
    getItems: function () { return (window.STAFF || []).filter(function (s) { return s.active !== false; }).map(function (s) { return s.name; }); },
    onSelect: function () { window.snlOnRequesterNameChange(); }
  });
};

// snlRefreshProjectCombobox rebuilds the future-project list + resets selection —
// call on every New/Load (initProjectCombobox itself is idempotent: first call binds
// listeners, later calls just update the data via inp._cmbUpdate).
window.snlRefreshProjectCombobox = function () {
  var todayStr = new Date().toISOString().slice(0, 10);
  var projects = (window.PROJECTS || []).filter(function (p) { return p.start && p.start > todayStr; })
    .sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
  window.initProjectCombobox(
    { wrapId: 'snl-proj-cmb-wrap', inputId: 'snl-proj-cmb-input', dropId: 'snl-proj-cmb-drop', listId: 'snl-proj-cmb-list', hiddenId: 'snl-project-pick' },
    projects, '',
    function () { window.snlOnProjectPick(); }
  );
};

// ── Preview Renderer (reads current DOM values, regenerates print sheet only) ──
window.snlRenderPreview = function () {
  var area = document.getElementById('snl-print-area');
  if (!area) return;

  var sysKey = 'other';
  var sysEl = document.querySelector('input[name="snl-system"]:checked');
  if (sysEl) sysKey = sysEl.value;
  var sysBoxes = window.SNL_SYSTEMS.map(function (c) {
    var on = c.key === sysKey;
    var otherNote = (c.key === 'other' && on && snlV('snl-system-other-note').trim())
      ? ' <span class="snl-fill">' + esc(snlV('snl-system-other-note').trim()) + '</span>' : '';
    return '<div class="snl-cbx"><span class="snl-box">' + (on ? '✓' : '') + '</span>' + esc(c.label) + otherNote + '</div>';
  }).join('');

  var revisitLine  = (esc(snlV('snl-revisit-no')) || '&nbsp;') + ' / ' + (esc(snlV('snl-revisit-total')) || '&nbsp;');
  var maLine       = (esc(snlV('snl-ma-no')) || '&nbsp;') + ' / ' + (esc(snlV('snl-ma-total')) || '&nbsp;');
  var deliveryLine = (esc(snlV('snl-delivery-no')) || '&nbsp;') + ' / ' + (esc(snlV('snl-delivery-total')) || '&nbsp;');
  var presentLine  = snlV('snl-present-type') ? ' <span class="snl-fill">' + esc(snlV('snl-present-type')) + '</span>' : ' เชิงรุก/เชิงรับ';
  var copydataLine = snlV('snl-copydata-status') === 'signed' ? ' <span class="snl-fill">เซ็นสัญญาแล้ว</span>'
    : snlV('snl-copydata-status') === 'unsigned' ? ' <span class="snl-fill">ยังไม่เซ็นสัญญา</span>'
    : ' เซ็นสัญญาแล้ว/ยังไม่เซ็นสัญญา';

  var addresseeKey = 'hospital_director';
  var addresseeEl = document.querySelector('input[name="snl-addressee"]:checked');
  if (addresseeEl) addresseeKey = addresseeEl.value;
  var addresseeBoxes = window.SNL_ADDRESSEES.map(function (c) {
    var on = c.key === addresseeKey;
    var otherNote = (c.key === 'other' && on && snlV('snl-addressee-other-note').trim())
      ? ' <span class="snl-fill">' + esc(snlV('snl-addressee-other-note').trim()) + '</span>' : '';
    return '<div class="snl-cbx"><span class="snl-box">' + (on ? '✓' : '') + '</span>' + esc(c.label) + otherNote + '</div>';
  }).join('');

  var purposeKey = 'inform';
  var purposeEl = document.querySelector('input[name="snl-purpose"]:checked');
  if (purposeEl) purposeKey = purposeEl.value;
  var purposeBoxes = window.SNL_PURPOSES.map(function (c) {
    var on = c.key === purposeKey;
    return '<div class="snl-cbx snl-cbx-wrap"><span class="snl-box">' + (on ? '✓' : '') + '</span>' + esc(c.label) + '</div>';
  }).join('');
  var committeeDetail = (purposeKey === 'committee') ? `
    <div class="snl-committee-detail">
      <div class="snl-row"><span class="snl-lbl">สัญญาเลขที่</span> <span class="snl-fill snl-grow">${esc(snlV('snl-contract-no')) || '&nbsp;'}</span></div>
      <div class="snl-row"><span class="snl-lbl">จำนวน</span> <span class="snl-fill snl-grow">${snlV('snl-contract-amount') ? snlFmt2(snlNumOrBlank('snl-contract-amount')) : '&nbsp;'}</span> <span class="snl-lbl">บาท</span></div>
      <div class="snl-row"><span class="snl-lbl">ลงวันที่</span> <span class="snl-fill snl-grow">${snlV('snl-contract-date') ? fd(snlV('snl-contract-date')) : '&nbsp;'}</span></div>
      <div class="snl-row"><span class="snl-lbl">ใบเสนอราคา เลขที่</span> <span class="snl-fill snl-grow">${esc(snlV('snl-quote-no')) || '&nbsp;'}</span></div>
    </div>
  ` : '';

  var attendeeRows = Array.from(document.querySelectorAll('.snl-attendee-row')).map(function (row, i) {
    var nameEl = row.querySelector('.snl-att-name-inp');
    var posEl  = row.querySelector('.snl-att-pos-inp');
    var name = nameEl ? nameEl.value.trim() : '';
    var pos  = posEl ? posEl.value.trim() : '';
    if (!name && !pos) return '';
    return '<div class="snl-att-row"><span class="snl-att-idx">' + (i + 1) + '.</span> <span class="snl-fill">' + (name ? esc(name) : '&nbsp;') + '</span> <span class="snl-lbl">ตำแหน่ง</span> <span class="snl-fill snl-grow">' + (pos ? esc(pos) : '&nbsp;') + '</span></div>';
  }).join('') || '<div class="snl-att-row">&nbsp;</div>';

  area.innerHTML = `
    <div class="snl-head">
      <div class="snl-head-co">
        <div class="snl-co-name">บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด (สำนักงานใหญ่)</div>
        <div class="snl-co-addr">เลขที่ 2 ชั้น 2 ซ.สุขสวัสดิ์ 33 แขวง/เขต ราษฎร์บูรณะ กรุงเทพมหานคร</div>
        <div class="snl-co-addr">โทรศัพท์ 0-2427-9991 โทรสาร 0-2873-0292</div>
        <div class="snl-co-addr">เลขที่ประจำตัวผู้เสียภาษี 0105548152334</div>
      </div>
      <div class="snl-formno">No. <span class="snl-fill">${esc(snlV('snl-doc-no')) || '&nbsp;'}</span></div>
    </div>

    <div class="snl-row">วันที่ <span class="snl-fill">${snlV('snl-doc-date') ? fd(snlV('snl-doc-date')) : '&nbsp;'}</span></div>

    <div class="snl-row">ชื่อ-นามสกุล <span class="snl-fill snl-grow">${esc(snlV('snl-requester-name')) || '&nbsp;'}</span> ตำแหน่ง <span class="snl-fill snl-grow">${esc(snlV('snl-requester-position')) || '&nbsp;'}</span> แผนก/ฝ่าย <span class="snl-fill">${esc(snlV('snl-requester-dept')) || '&nbsp;'}</span></div>
    <div class="snl-row">ขอแจ้งความประสงค์ทำหนังสือแจ้งหน่วยงานภายนอก</div>
    <div class="snl-row">สิ่งที่ส่งมาด้วย จำนวน <span class="snl-fill">1</span> ฉบับ <span class="snl-fill">1</span> แผ่น</div>

    <div class="snl-box-section">
      <div class="snl-cat-grid" style="grid-template-columns:repeat(2,1fr);">${sysBoxes}</div>
    </div>

    <div class="snl-box-section">
      <div class="snl-cat-lbl">เรื่องที่ให้ดำเนินการ</div>
      <div class="snl-work-grid">
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-install') ? '✓' : ''}</span>เข้าปฏิบัติงานติดตั้ง</div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-revisit') ? '✓' : ''}</span>Re-visit ครั้งที่ <span class="snl-fill">${revisitLine}</span></div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-reply-lecturer') ? '✓' : ''}</span>ตอบกลับวิทยากร</div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-ma') ? '✓' : ''}</span>MA ครั้งที่ <span class="snl-fill">${maLine}</span></div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-survey') ? '✓' : ''}</span>สำรวจระบบ</div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-delivery') ? '✓' : ''}</span>ส่งมอบงาน งวดที่ <span class="snl-fill">${deliveryLine}</span></div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-present') ? '✓' : ''}</span>นำเสนอโปรแกรม${presentLine}</div>
        <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-task-copydata') ? '✓' : ''}</span>ขอคัดลอกฐานข้อมูล${copydataLine}</div>
        <div class="snl-cbx snl-span2"><span class="snl-box">${snlChecked('snl-task-other') ? '✓' : ''}</span>อื่นๆ <span class="snl-fill snl-grow">${esc(snlV('snl-task-other-note')) || '&nbsp;'}</span></div>
      </div>
    </div>

    <div class="snl-row">วันที่ดำเนินงาน <span class="snl-fill">${snlV('snl-work-start') ? fd(snlV('snl-work-start')) : '&nbsp;'}</span> – <span class="snl-fill">${snlV('snl-work-end') ? fd(snlV('snl-work-end')) : '&nbsp;'}</span> สถานที่ <span class="snl-fill snl-grow">${esc(snlV('snl-site-location')) || '&nbsp;'}</span></div>

    <div class="snl-box-section">
      <div class="snl-cat-lbl">รายชื่อผู้เข้าปฏิบัติงาน (ใส่ข้อมูลเฉพาะกรณีแจ้งออกหนังสือเพื่อเข้าปฏิบัติงาน)</div>
      ${attendeeRows}
    </div>

    <div class="snl-box-section">
      <div class="snl-cat-lbl">หนังสือแจ้งถึง</div>
      <div class="snl-cat-grid" style="grid-template-columns:repeat(2,1fr);">${addresseeBoxes}</div>
    </div>

    <div class="snl-box-section">
      <div class="snl-cat-lbl">หนังสือแจ้งเพื่อ</div>
      ${purposeBoxes}
      ${committeeDetail}
    </div>

    <div class="snl-box-section">
      <div class="snl-cat-lbl">ช่องทางที่ต้องการให้จัดส่ง</div>
      <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-deliver-mail') ? '✓' : ''}</span>ทางไปรษณีย์ :: จ่าหน้าซองถึง ผู้อำนวยการโรงพยาบาล</div>
      <div class="snl-cbx"><span class="snl-box">${snlChecked('snl-deliver-email') ? '✓' : ''}</span>ทาง E-mail :: <span class="snl-fill snl-grow">${esc(snlV('snl-email-to')) || '&nbsp;'}</span></div>
      ${snlV('snl-email-cc').trim() ? '<div class="snl-cbx" style="padding-left:20px;">CC E-mail :: <span class="snl-fill snl-grow">' + esc(snlV('snl-email-cc').trim()) + '</span></div>' : ''}
    </div>
  `;
};

// ── Requester Name Change: auto-fill ตำแหน่ง/แผนก จากข้อมูลพนักงาน (window.STAFF) เมื่อพิมพ์ชื่อตรงกับพนักงานที่มีอยู่ ──
window.snlOnRequesterNameChange = function () {
  var name = snlV('snl-requester-name').trim();
  var staff = (window.STAFF || []).find(function (s) { return s.name === name; });
  if (staff) {
    var posEl = document.getElementById('snl-requester-position');
    var deptEl = document.getElementById('snl-requester-dept');
    if (posEl) posEl.value = staff.role || '';
    if (deptEl) deptEl.value = staff.dept || '';
  }
  window.snlRenderPreview();
};

// ── Site Location Change: เลือกชื่อโรงพยาบาลจาก datalist แล้วดึง Email ผู้ติดต่อมาเติมอัตโนมัติ
// (มากกว่า 1 Email คั่นด้วยจุลภาค) ──
window.snlOnSiteLocationChange = function () {
  var name = snlV('snl-site-location').trim();
  var hsp = (window.HOSPITALS || []).find(function (h) { return h.name === name; });
  if (hsp) {
    var emails = (hsp.contacts || []).map(function (c) { return (c.email || '').trim(); }).filter(Boolean);
    var uniqEmails = emails.filter(function (e, i) { return emails.indexOf(e) === i; });
    var emailEl = document.getElementById('snl-email-to');
    if (emailEl) emailEl.value = uniqEmails.join(',');
  }
  window.snlRenderPreview();
};

// ── Project Pick: ดึงข้อมูลจากโครงการติดตั้งระบบที่ยังไม่ถึงวันเริ่ม มาเติมฟอร์มอัตโนมัติ ──
window.snlOnProjectPick = function () {
  var pid = snlV('snl-project-pick');
  if (!pid) return;
  var p = (window.PROJECTS || []).find(function (x) { return x.id === pid; });
  if (!p) return;

  // 1) ระบบ ← ประเภทโครงการ
  var ptype = (window.PTYPES || []).find(function (t) { return t.id === p.typeId; });
  var sysKey = snlMatchSystemKey(ptype ? ptype.label : '');
  document.querySelectorAll('input[name="snl-system"]').forEach(function (r) { r.checked = (r.value === sysKey); });
  var sysOtherNoteEl = document.getElementById('snl-system-other-note');
  if (sysOtherNoteEl) sysOtherNoteEl.value = (sysKey === 'other' && ptype) ? ptype.label : '';
  window.snlOnSystemChange();

  // 2) เรื่องที่ให้ดำเนินการ ← กลุ่มโครงการ
  ['snl-task-install','snl-task-revisit','snl-task-reply-lecturer','snl-task-ma','snl-task-present',
   'snl-task-other','snl-task-survey','snl-task-delivery','snl-task-copydata'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.checked = false;
  });
  var pgroup = (window.PGROUPS || []).find(function (g) { return g.id === p.groupId; });
  var taskKey = snlMatchTaskKeyByGroupId(p.groupId);
  var taskEl = document.getElementById('snl-task-' + taskKey);
  if (taskEl) taskEl.checked = true;
  var taskOtherNoteEl = document.getElementById('snl-task-other-note');
  if (taskOtherNoteEl) taskOtherNoteEl.value = (taskKey === 'other' && pgroup) ? pgroup.label : '';

  // 3) วันที่ดำเนินงาน (เริ่ม) – ถึงวันที่
  var startEl = document.getElementById('snl-work-start'); if (startEl) startEl.value = p.start || '';
  var endEl = document.getElementById('snl-work-end'); if (endEl) endEl.value = p.end || '';

  // 4) รายชื่อผู้เข้าปฏิบัติงาน ← ทีมในโครงการ พร้อมตำแหน่ง
  var sids = (p.members && p.members.length ? p.members : (p.team || []).map(function (id) { return { sid: id }; }))
    .map(function (m) { return m.sid; });
  var attendees = sids.map(function (sid) {
    var s = (window.STAFF || []).find(function (x) { return x.id === sid; });
    if (!s) return null;
    var posDept = (s.role || '') + (s.dept || '');
    return { name: s.name, position: posDept };
  }).filter(Boolean);
  window.snlSetAttendees(attendees);

  window.snlRenderPreview();
};

// ── System / Addressee / Purpose Change: toggle detail fields ──
window.snlOnSystemChange = function () {
  var wrap = document.getElementById('snl-system-other-wrap');
  var isOther = document.getElementById('snl-system-other');
  if (wrap) wrap.style.display = (isOther && isOther.checked) ? '' : 'none';
  window.snlRenderPreview();
};
window.snlOnAddresseeChange = function () {
  var wrap = document.getElementById('snl-addressee-other-wrap');
  var isOther = document.getElementById('snl-addressee-other');
  if (wrap) wrap.style.display = (isOther && isOther.checked) ? '' : 'none';
  window.snlRenderPreview();
};
window.snlOnPurposeChange = function () {
  var wrap = document.getElementById('snl-committee-wrap');
  var isCommittee = document.getElementById('snl-purpose-committee');
  if (wrap) wrap.style.display = (isCommittee && isCommittee.checked) ? '' : 'none';
  window.snlRenderPreview();
};

// ── Attendee Rows ──
window.snlAddAttendeeRow = function (name, position) {
  var body = document.getElementById('snl-attendees-body');
  if (!body) return;
  if (body.querySelectorAll('.snl-attendee-row').length >= 12) return;
  var rowId = 'snla' + Date.now() + Math.floor(Math.random() * 1000);
  var row = document.createElement('div');
  row.className = 'snl-attendee-row';
  row.id = rowId;
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input class="f-input snl-att-name-inp" placeholder="ชื่อ-นามสกุล" value="' + esc(name || '') + '" oninput="window.snlRenderPreview()" style="flex:1;font-size:12px;padding:6px 8px;">' +
    '<input class="f-input snl-att-pos-inp" placeholder="ตำแหน่ง" value="' + esc(position || '') + '" oninput="window.snlRenderPreview()" style="flex:1;font-size:12px;padding:6px 8px;">' +
    '<button class="btn btn-red btn-sm" onclick="window.snlDelAttendeeRow(\'' + rowId + '\')" style="padding:4px 8px;">✕</button>';
  body.appendChild(row);
};
window.snlDelAttendeeRow = function (rowId) {
  var el = document.getElementById(rowId);
  if (el) el.remove();
  window.snlRenderPreview();
};
window.snlSetAttendees = function (items) {
  var body = document.getElementById('snl-attendees-body');
  if (!body) return;
  body.innerHTML = '';
  (items && items.length ? items : []).forEach(function (a) { window.snlAddAttendeeRow(a.name, a.position); });
};

// ── Save / Load / New ──
window.snlGatherData = function () {
  var sysEl = document.querySelector('input[name="snl-system"]:checked');
  var addresseeEl = document.querySelector('input[name="snl-addressee"]:checked');
  var purposeEl = document.querySelector('input[name="snl-purpose"]:checked');
  var attendees = Array.from(document.querySelectorAll('.snl-attendee-row')).map(function (row) {
    var nameEl = row.querySelector('.snl-att-name-inp');
    var posEl  = row.querySelector('.snl-att-pos-inp');
    return { name: nameEl ? nameEl.value.trim() : '', position: posEl ? posEl.value.trim() : '' };
  }).filter(function (a) { return a.name || a.position; });

  return {
    doc_no: snlV('snl-doc-no').trim(),
    doc_date: snlV('snl-doc-date') || null,
    requester_name: snlV('snl-requester-name').trim(),
    requester_position: snlV('snl-requester-position').trim(),
    requester_dept: snlV('snl-requester-dept').trim(),
    attach_copies: '1',
    attach_sheets: '1',
    system_key: sysEl ? sysEl.value : 'other',
    system_other_note: snlV('snl-system-other-note').trim(),
    task_install: snlChecked('snl-task-install'),
    task_revisit: snlChecked('snl-task-revisit'),
    revisit_no: snlV('snl-revisit-no').trim(),
    revisit_total: snlV('snl-revisit-total').trim(),
    task_reply_lecturer: snlChecked('snl-task-reply-lecturer'),
    task_ma: snlChecked('snl-task-ma'),
    ma_no: snlV('snl-ma-no').trim(),
    ma_total: snlV('snl-ma-total').trim(),
    task_present: snlChecked('snl-task-present'),
    present_type: snlV('snl-present-type'),
    task_other: snlChecked('snl-task-other'),
    task_other_note: snlV('snl-task-other-note').trim(),
    task_survey: snlChecked('snl-task-survey'),
    task_delivery: snlChecked('snl-task-delivery'),
    delivery_no: snlV('snl-delivery-no').trim(),
    delivery_total: snlV('snl-delivery-total').trim(),
    task_copydata: snlChecked('snl-task-copydata'),
    copydata_status: snlV('snl-copydata-status'),
    work_start: snlV('snl-work-start') || null,
    work_end: snlV('snl-work-end') || null,
    site_location: snlV('snl-site-location').trim(),
    attendees: attendees,
    addressee_key: addresseeEl ? addresseeEl.value : 'hospital_director',
    addressee_other_note: snlV('snl-addressee-other-note').trim(),
    purpose_key: purposeEl ? purposeEl.value : 'inform',
    contract_no: snlV('snl-contract-no').trim(),
    contract_amount: snlNumOrBlank('snl-contract-amount') === '' ? null : snlNumOrBlank('snl-contract-amount'),
    contract_date: snlV('snl-contract-date') || null,
    quote_no: snlV('snl-quote-no').trim(),
    deliver_mail: snlChecked('snl-deliver-mail'),
    deliver_email: snlChecked('snl-deliver-email'),
    email_to: snlV('snl-email-to').trim(),
    email_cc: snlV('snl-email-cc').trim(),
  };
};

window.snlSave = async function () {
  if (!window.canEdit('expense_form')) return;
  var data = window.snlGatherData();
  if (!data.site_location) { alert('กรุณากรอกสถานที่'); return; }
  var id = window.snlEditId || window.snlUid();
  try {
    await window.setDoc(window.getDocRef('SITE_NOTICE_FORMS', id), data);
    window.snlApplyLocal(id, data);
    window.snlEditId = id;
    window.snlRefreshSavedList();
    var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = id;
  } catch (e) { window.showDbError ? window.showDbError(e) : console.error(e); }
};

window.snlNewForm = function () {
  window.snlEditId = null;
  ['snl-doc-no','snl-requester-name','snl-requester-position','snl-requester-dept',
   'snl-system-other-note','snl-revisit-no','snl-revisit-total',
   'snl-ma-no','snl-ma-total','snl-present-type','snl-task-other-note','snl-delivery-no','snl-delivery-total',
   'snl-copydata-status','snl-work-start','snl-work-end','snl-site-location','snl-addressee-other-note',
   'snl-contract-no','snl-contract-amount','snl-contract-date','snl-quote-no','snl-email-to','snl-email-cc'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var docDateEl = document.getElementById('snl-doc-date'); if (docDateEl) docDateEl.value = new Date().toISOString().slice(0, 10);
  ['snl-task-install','snl-task-revisit','snl-task-reply-lecturer','snl-task-ma','snl-task-present',
   'snl-task-other','snl-task-survey','snl-task-delivery','snl-task-copydata'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.checked = false;
  });
  ['snl-deliver-mail','snl-deliver-email'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.checked = true;
  });
  var sysOther = document.getElementById('snl-system-other'); if (sysOther) sysOther.checked = true;
  var addresseeDefault = document.getElementById('snl-addressee-hospital_director'); if (addresseeDefault) addresseeDefault.checked = true;
  var purposeDefault = document.getElementById('snl-purpose-inform'); if (purposeDefault) purposeDefault.checked = true;
  window.snlSetAttendees([]);
  var sel = document.getElementById('ecf-saved-select'); if (sel) sel.value = '';
  window.snlOnSystemChange();
  window.snlOnAddresseeChange();
  window.snlOnPurposeChange();
  window.snlRefreshProjectCombobox();
};

window.snlLoadForm = function (id) {
  if (!id) { window.snlNewForm(); return; }
  var f = window.SITE_NOTICE_FORMS.find(function (x) { return x.id === id; });
  if (!f) return;
  window.snlEditId = id;
  var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.value = (val === null || val === undefined) ? '' : val; };
  var setChk = function (elId, val) { var el = document.getElementById(elId); if (el) el.checked = !!val; };
  set('snl-doc-no', f.docNo);
  set('snl-doc-date', f.docDate);
  set('snl-requester-name', f.requesterName);
  set('snl-requester-position', f.requesterPosition);
  set('snl-requester-dept', f.requesterDept);
  set('snl-system-other-note', f.systemOtherNote);
  var sysRadio = document.getElementById('snl-system-' + f.systemKey); if (sysRadio) sysRadio.checked = true;
  window.snlOnSystemChange();
  setChk('snl-task-install', f.taskInstall);
  setChk('snl-task-revisit', f.taskRevisit);
  set('snl-revisit-no', f.revisitNo);
  set('snl-revisit-total', f.revisitTotal);
  setChk('snl-task-reply-lecturer', f.taskReplyLecturer);
  setChk('snl-task-ma', f.taskMa);
  set('snl-ma-no', f.maNo);
  set('snl-ma-total', f.maTotal);
  setChk('snl-task-present', f.taskPresent);
  set('snl-present-type', f.presentType);
  setChk('snl-task-other', f.taskOther);
  set('snl-task-other-note', f.taskOtherNote);
  setChk('snl-task-survey', f.taskSurvey);
  setChk('snl-task-delivery', f.taskDelivery);
  set('snl-delivery-no', f.deliveryNo);
  set('snl-delivery-total', f.deliveryTotal);
  setChk('snl-task-copydata', f.taskCopydata);
  set('snl-copydata-status', f.copydataStatus);
  set('snl-work-start', f.workStart);
  set('snl-work-end', f.workEnd);
  set('snl-site-location', f.siteLocation);
  window.snlSetAttendees(f.attendees || []);
  var addresseeRadio = document.getElementById('snl-addressee-' + f.addresseeKey); if (addresseeRadio) addresseeRadio.checked = true;
  set('snl-addressee-other-note', f.addresseeOtherNote);
  window.snlOnAddresseeChange();
  var purposeRadio = document.getElementById('snl-purpose-' + f.purposeKey); if (purposeRadio) purposeRadio.checked = true;
  set('snl-contract-no', f.contractNo);
  set('snl-contract-amount', f.contractAmount === '' ? '' : snlFmt2(f.contractAmount));
  set('snl-contract-date', f.contractDate);
  set('snl-quote-no', f.quoteNo);
  window.snlOnPurposeChange();
  setChk('snl-deliver-mail', f.deliverMail);
  setChk('snl-deliver-email', f.deliverEmail);
  set('snl-email-to', f.emailTo);
  set('snl-email-cc', f.emailCc);
  window.snlRefreshProjectCombobox();
  window.snlRenderPreview();
};

window.snlRefreshSavedList = function () {
  var sel = document.getElementById('ecf-saved-select');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">— ฟอร์มใหม่ —</option>' + window.SITE_NOTICE_FORMS.map(function (f) {
    return '<option value="' + f.id + '">' + esc(f.docNo || f.id) + ' — ' + esc(f.siteLocation || '') + ' (' + fd(f.createdAt) + ')</option>';
  }).join('');
  sel.value = cur;
};
