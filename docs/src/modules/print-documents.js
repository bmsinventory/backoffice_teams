/**
 * พิมพ์เอกสารของโครงการ — ฟีเจอร์อิสระจากระบบอบรม
 * ใช้เฉพาะข้อมูลโครงการ/สถานพยาบาล/ทีมงานที่ Backoffice โหลดไว้แล้ว
 */
(function () {
  var STORE_KEY = 'bms_project_print_documents_v1';
  var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var DEFAULT_TITLES = [
    'ใบลงชื่อ Stand by การใช้งานระบบงาน โปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมประชุมสรุป Flow การใช้งานโปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมประชุมสรุปปัญหาการใช้งานโปรแกรม BMS-INVENTORY',
    'ใบลงชื่อเข้าร่วมการจำลองคู่ขนาน SIT (System Integration Testing)',
    'ใบเซ็นชื่อคีย์ยอดตั้งต้นคลังย่อย โปรแกรม BMS-INVENTORY',
  ];
  var state = { pid:'', titles:[], config:{} };

  function esc(s) { return window.esc(s == null ? '' : String(s)); }
  function project() { return (window.IMPL_PROJECTS || []).find(function (p) { return p.id === window.imtCurrentProjectId; }) || null; }
  function sourceProject(p) { return p && window.ProjectTeam ? window.ProjectTeam.source(p, window.PROJECTS || []) : null; }
  function hospitalOf(p) {
    var src = sourceProject(p), hid = src && src.hospitalId;
    return (window.HOSPITALS || []).find(function (h) { return h.id === hid; }) || null;
  }
  function hospitalLabel(p) {
    var h = hospitalOf(p), src = sourceProject(p);
    if (h) return (h.name || '') + (h.province && !(h.name || '').includes(h.province) ? ' จ.' + String(h.province).replace(/^(จังหวัด|จ\.)\s*/, '') : '');
    return (src && src.name) || (p && p.name) || '';
  }
  function teamOf(p) {
    if (!p || !window.ProjectTeam) return [];
    var ids = window.ProjectTeam.staffIds(p, window.PROJECTS || []);
    return ids.map(function (id) { return (window.STAFF || []).find(function (s) { return s.id === id; }); }).filter(Boolean);
  }
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeStore(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function thaiDate(iso) {
    if (!iso) return '';
    var a = iso.split('-').map(Number);
    return a[2] + ' ' + THAI_MONTHS[a[1] - 1] + ' ' + (a[0] + 543);
  }
  function loadState(pid) {
    var all = readStore(), saved = (all.projects || {})[pid] || {};
    state.pid = pid;
    state.titles = Array.isArray(all.titles) && all.titles.length ? all.titles.slice() : DEFAULT_TITLES.slice();
    state.config = {
      title: saved.title || state.titles[0], date: window.todayStr(), rows: saved.rows || 25,
      showOfficer: !!saved.showOfficer, officer: saved.officer || '',
      leftName: saved.leftName || '', leftPos: saved.leftPos || '',
      rightName: saved.rightName || '', rightPos: saved.rightPos || '', rightInst: saved.rightInst || ''
    };
  }
  function saveState() {
    var all = readStore();
    all.titles = state.titles.slice();
    all.projects = all.projects || {};
    all.projects[state.pid] = Object.assign({}, state.config);
    writeStore(all);
  }
  function readForm() {
    var get = function (id) { return document.getElementById(id); };
    state.config.title = (get('pdoc-title-text').value || '').trim();
    state.config.date = get('pdoc-date').value;
    state.config.rows = Math.max(5, Math.min(100, Number(get('pdoc-rows').value) || 25));
    state.config.showOfficer = get('pdoc-show-officer').checked;
    state.config.officer = get('pdoc-officer').value || '';
    state.config.leftName = (get('pdoc-left-name').value || '').trim();
    state.config.leftPos = (get('pdoc-left-pos').value || '').trim();
    state.config.rightName = (get('pdoc-right-name').value || '').trim();
    state.config.rightPos = (get('pdoc-right-pos').value || '').trim();
    state.config.rightInst = (get('pdoc-right-inst').value || '').trim();
    return state.config;
  }

  function titleOptions() {
    return '<option value="">— เลือกหัวข้อ —</option>' + state.titles.map(function (t, i) {
      return '<option value="' + i + '">' + esc(t.length > 58 ? t.slice(0, 58) + '…' : t) + '</option>';
    }).join('');
  }
  function teamOptions(p) {
    var team = teamOf(p);
    return '<option value="">— ' + (team.length ? 'เลือกเจ้าหน้าที่' : 'โครงการนี้ยังไม่มีทีมงาน') + ' —</option>' + team.map(function (s) {
      var name = s.name || s.fullName || s.nickname || '';
      return '<option value="' + esc(name) + '"' + (state.config.officer === name ? ' selected' : '') + '>' + esc(name) + (s.position ? ' — ' + esc(s.position) : '') + '</option>';
    }).join('');
  }

  window.renderImtPrintDocuments = function (mount) {
    var p = project();
    if (!p) { mount.innerHTML = window.imtProjectPicker ? window.imtProjectPicker() : ''; return; }
    if (state.pid !== p.id) loadState(p.id);
    var hospital = hospitalLabel(p);
    if (!state.config.rightInst) state.config.rightInst = hospital;
    mount.style.display = 'flex';
    mount.innerHTML = '<div class="pdoc-app">'
      + '<aside class="pdoc-config">'
      +   '<section class="pdoc-card"><h3>หัวข้อเอกสาร</h3>'
      +     '<label>เลือกจากรายการ</label><select id="pdoc-title-select" onchange="pdocSelectTitle()">' + titleOptions() + '</select>'
      +     '<label>หรือพิมพ์หัวข้อเอง</label><textarea id="pdoc-title-text" rows="3" oninput="pdocUpdate()">' + esc(state.config.title) + '</textarea>'
      +     '<button class="btn btn-ghost btn-sm pdoc-wide" onclick="pdocManageTitles()">✏️ จัดการหัวข้อ (เพิ่ม / แก้ไข / ลบ)</button>'
      +   '</section>'
      +   '<section class="pdoc-card"><h3>ข้อมูลเอกสาร</h3>'
      +     '<label>สถานพยาบาล</label><input value="' + esc(hospital) + '" readonly>'
      +     '<label>วันที่</label><input type="date" id="pdoc-date" value="' + esc(state.config.date) + '" onchange="pdocUpdate()">'
      +     '<label>จำนวนแถว</label><select id="pdoc-rows" onchange="pdocUpdate()">' + [25,50,75,100].map(function (n) { return '<option value="'+n+'"'+(Number(state.config.rows)===n?' selected':'')+'>'+n+' แถว</option>'; }).join('') + '</select>'
      +     '<label class="pdoc-check"><input type="checkbox" id="pdoc-show-officer" onchange="pdocToggleOfficer()"' + (state.config.showOfficer ? ' checked' : '') + '> แสดงช่อง “เจ้าหน้าที่”</label>'
      +     '<div id="pdoc-officer-wrap"' + (state.config.showOfficer ? '' : ' hidden') + '><label>ชื่อเจ้าหน้าที่</label><select id="pdoc-officer" onchange="pdocUpdate()">' + teamOptions(p) + '</select></div>'
      +   '</section>'
      +   '<section class="pdoc-card"><h3>ผู้ลงนาม</h3>'
      +     '<div class="pdoc-signbox blue"><b>ซ้าย — BMS</b><input id="pdoc-left-name" placeholder="ชื่อ-นามสกุล" value="'+esc(state.config.leftName)+'" oninput="pdocUpdate()"><input id="pdoc-left-pos" placeholder="ตำแหน่ง" value="'+esc(state.config.leftPos)+'" oninput="pdocUpdate()"><small>บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด</small></div>'
      +     '<div class="pdoc-signbox"><b>ขวา — สถานพยาบาล</b><input id="pdoc-right-name" placeholder="ชื่อ-นามสกุล" value="'+esc(state.config.rightName)+'" oninput="pdocUpdate()"><input id="pdoc-right-pos" placeholder="ตำแหน่ง" value="'+esc(state.config.rightPos)+'" oninput="pdocUpdate()"><input id="pdoc-right-inst" placeholder="ชื่อหน่วยงาน / โรงพยาบาล" value="'+esc(state.config.rightInst)+'" oninput="pdocUpdate()"></div>'
      +     '<button class="btn btn-ghost btn-sm pdoc-wide" onclick="pdocSaveDefaults()">💾 บันทึกเป็นค่าเริ่มต้น</button>'
      +   '</section>'
      + '</aside>'
      + '<main class="pdoc-preview-panel"><div class="pdoc-preview-head"><span>ตัวอย่างเอกสาร</span><button class="btn btn-pri btn-sm" onclick="pdocPrint()">🖨️ พิมพ์เอกสาร</button></div><div id="pdoc-preview" class="pdoc-preview"></div></main>'
      + '</div>';
    window.pdocUpdate();
  };

  window.pdocSelectTitle = function () {
    var sel = document.getElementById('pdoc-title-select'), i = Number(sel.value);
    if (sel.value !== '' && state.titles[i]) document.getElementById('pdoc-title-text').value = state.titles[i];
    window.pdocUpdate();
  };
  window.pdocToggleOfficer = function () {
    document.getElementById('pdoc-officer-wrap').hidden = !document.getElementById('pdoc-show-officer').checked;
    window.pdocUpdate();
  };
  window.pdocUpdate = function () {
    var preview = document.getElementById('pdoc-preview');
    if (!preview) return;
    var cfg = readForm();
    preview.innerHTML = buildPages(cfg, false);
  };
  window.pdocSaveDefaults = function () {
    readForm(); saveState();
    if (window.showToast) window.showToast('บันทึกค่าเริ่มต้นแล้ว', 'success');
  };

  function buildRows(from, to) {
    var out = '';
    for (var i = from; i <= to; i++) out += '<tr><td>'+i+'</td><td></td><td></td><td></td><td></td></tr>';
    return out;
  }
  function signature(cfg, page, total) {
    return '<div class="pdoc-signatures"><div><i></i><span>('+(esc(cfg.leftName)||'ชื่อ-นามสกุล')+')</span><span>ตำแหน่ง '+(esc(cfg.leftPos)||'………………………………')+'</span><span>บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด</span></div><div><i></i><span>('+(esc(cfg.rightName)||'ชื่อ-นามสกุล')+')</span><span>ตำแหน่ง '+(esc(cfg.rightPos)||'………………………………')+'</span>'+(cfg.rightInst?'<span>'+esc(cfg.rightInst)+'</span>':'')+'</div></div>'+(total>1?'<div class="pdoc-page-no">หน้า '+page+' / '+total+'</div>':'');
  }
  function buildPages(cfg, printable) {
    var p = project(), hospital = hospitalLabel(p), perPage = 25, total = Math.ceil(cfg.rows / perPage) || 1, out = '';
    for (var page = 0; page < total; page++) {
      var from = page * perPage + 1, to = Math.min((page + 1) * perPage, cfg.rows);
      out += '<section class="pdoc-sheet'+(printable?' printable':'')+'"><header><img src="img/BMS-Header.jpg" alt="BMS"><h2>'+(esc(cfg.title)||'(กรุณาเลือกหัวข้อเอกสาร)')+'</h2><div class="pdoc-info"><span><b>สถานพยาบาล :</b> '+(esc(hospital)||'—')+'</span><span><b>วันที่ :</b> '+(esc(thaiDate(cfg.date))||'—')+(cfg.showOfficer?'<br><b>เจ้าหน้าที่ :</b> '+esc(cfg.officer||''):'')+'</span></div></header><table><colgroup><col class="num"><col><col class="mid"><col class="mid"><col class="sign"></colgroup><thead><tr><th>ลำดับ</th><th>ชื่อ – สกุล</th><th>ตำแหน่ง</th><th>แผนก</th><th>ลายมือชื่อ</th></tr></thead><tbody>'+buildRows(from,to)+'</tbody></table><div class="pdoc-grow"></div>'+signature(cfg,page+1,total)+'</section>';
    }
    return out;
  }
  window.pdocPrint = function () {
    var cfg = readForm(), popup = window.open('', '_blank', 'width=900,height=750,scrollbars=yes');
    if (!popup) { if (window.showToast) window.showToast('Popup ถูกบล็อก กรุณาอนุญาต popup แล้วลองใหม่', 'danger'); return; }
    var css = document.querySelector('link[href*="print-documents.css"]');
    var cssHref = css ? css.href : new URL('src/styles/modules/print-documents.css', location.href).href;
    popup.document.open();
    popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>'+esc(cfg.title||'เอกสาร')+'</title><link rel="stylesheet" href="'+esc(cssHref)+'"></head><body class="pdoc-print-body">'+buildPages(cfg,true)+'<div class="pdoc-print-actions"><button onclick="window.print()">🖨 พิมพ์</button><button onclick="window.close()">ปิด</button></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    popup.document.close();
  };

  window.pdocManageTitles = function () {
    var old = document.getElementById('pdoc-title-modal'); if (old) old.remove();
    var box = document.createElement('div'); box.id = 'pdoc-title-modal'; box.className = 'pdoc-modal';
    box.innerHTML = '<div class="pdoc-modal-card"><div class="pdoc-modal-head"><b>จัดการหัวข้อเอกสาร</b><button onclick="pdocCloseTitles()">×</button></div><div id="pdoc-title-list"></div><div class="pdoc-title-add"><textarea id="pdoc-new-title" rows="2" placeholder="พิมพ์หัวข้อใหม่..."></textarea><button class="btn btn-pri btn-sm" onclick="pdocAddTitle()">+ เพิ่ม</button></div><div class="pdoc-modal-foot"><button class="btn btn-ghost" onclick="pdocCloseTitles()">ปิด</button></div></div>';
    document.body.appendChild(box); renderTitleList();
  };
  function renderTitleList() {
    var el = document.getElementById('pdoc-title-list'); if (!el) return;
    el.innerHTML = state.titles.map(function (t, i) { return '<div class="pdoc-title-row"><span>'+esc(t)+'</span><button onclick="pdocEditTitle('+i+')">✏️</button><button onclick="pdocDeleteTitle('+i+')">🗑️</button></div>'; }).join('') || '<div class="pdoc-title-empty">ยังไม่มีหัวข้อ</div>';
  }
  window.pdocAddTitle = function () { var el=document.getElementById('pdoc-new-title'), v=el.value.trim(); if(!v)return; state.titles.push(v); el.value=''; saveState(); renderTitleList(); };
  window.pdocEditTitle = function (i) { var v=window.prompt('แก้ไขหัวข้อเอกสาร',state.titles[i]); if(v&&v.trim()){state.titles[i]=v.trim();saveState();renderTitleList();} };
  window.pdocDeleteTitle = function (i) { state.titles.splice(i,1); saveState(); renderTitleList(); };
  window.pdocCloseTitles = function () { var el=document.getElementById('pdoc-title-modal');if(el)el.remove(); var sel=document.getElementById('pdoc-title-select');if(sel)sel.innerHTML=titleOptions(); };
})();
