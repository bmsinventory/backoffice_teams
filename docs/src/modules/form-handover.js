/**
 * form-handover.js — "ใบส่งมอบแบบฟอร์ม" ของแท็บแบบฟอร์ม (form-tracker.js)
 * สร้างเอกสารส่งมอบจากรายการแบบฟอร์มของโครงการตรง ๆ แทนการ copy ไปจัดใน Excel เองทุกโครงการ
 * มี "ชื่อตามสัญญา" = ส่วนตามสัญญา (เรียงตามเลขหน้าชื่อตามสัญญา 1→n) · ไม่มี = "แบบฟอร์มเพิ่มเติม" (ลำดับเริ่ม 1 ใหม่)
 * ค่าที่กรอก (หัวเรื่อง/ผู้ลงนาม) จำไว้ในเครื่องต่อโครงการ — ผู้ลงนามซ้ายตั้งต้นจากเจ้าของไซต์ (เลือกเปลี่ยนจากรายชื่อพนักงานได้)
 * ผู้ลงนามขวาตั้งต้นจากหน้า "พิมพ์เอกสาร" ถ้าเคยบันทึกไว้ · ปุ่ม "ผู้ติดต่อ รพ." เติมชื่อ/ตำแหน่งจากผู้ติดต่อในข้อมูลสถานพยาบาล (หลายคน = เลือกจากรายการ)
 */
(function () {
  var STORE_KEY = 'bms_ftk_handover_v1';
  var PDOC_KEY = 'bms_project_print_documents_v1';
  var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var COMPANY = 'บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด';
  var cfg = null, cfgPid = '';

  function esc(s) { return window.esc(s == null ? '' : String(s)); }
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function thaiDate(iso) {
    if (!iso) return '';
    var a = iso.split('-').map(Number);
    return a[2] + ' ' + THAI_MONTHS[a[1] - 1] + ' ' + (a[0] + 543);
  }
  // ── วันที่สั้นแบบในเอกสารเดิม: 28/8/2569 ──
  function shortDate(s) {
    var d = s ? new Date(s) : null;
    return d && !isNaN(d) ? d.getDate() + '/' + (d.getMonth() + 1) + '/' + (d.getFullYear() + 543) : '';
  }

  function loadCfg(pid) {
    var saved = (readJson(STORE_KEY)[pid]) || {};
    var pdoc = (readJson(PDOC_KEY).projects || {})[pid] || {};
    var p = window.imtProject(pid);
    var hosp = (window.pdocHospitalLabel && window.pdocHospitalLabel(p)) || (p && p.name) || '';
    // ผู้ลงนามซ้าย (BMS) ตั้งต้น = เจ้าของไซต์ของโครงการต้นทาง + ตำแหน่งจากข้อมูลพนักงาน (แบบเดียวกับพิมพ์รายงานปัญหา)
    var sp = window.ProjectTeam.source(p, window.PROJECTS || []);
    var owner = sp ? (window.staffNameByRef(sp.siteOwnerId) || sp.siteOwner || '') : '';
    var leftName = saved.leftName || owner || pdoc.leftName || '';
    cfg = {
      title: saved.title || 'ใบส่งมอบฟอร์มในระบบ BMS-INVENTORY',
      hospital: saved.hospital || hosp,
      date: window.todayStr(),
      onlyDone: !!saved.onlyDone,
      siteOwner: owner,
      leftName: leftName, leftPos: saved.leftPos || window.imtStaffPositionByName(leftName) || pdoc.leftPos || '',
      leftInst: saved.leftInst || COMPANY,
      rightName: saved.rightName || pdoc.rightName || '', rightPos: saved.rightPos || pdoc.rightPos || '',
      rightInst: saved.rightInst || pdoc.rightInst || hosp,
    };
    cfgPid = pid;
  }
  function saveCfg() {
    var all = readJson(STORE_KEY), c = Object.assign({}, cfg);
    delete c.date; delete c.siteOwner; // วันที่จัดทำ = วันนี้เสมอเมื่อเปิดใหม่ · เจ้าของไซต์อ่านจากโครงการทุกครั้ง
    all[cfgPid] = c;
    writeJson(STORE_KEY, all);
  }
  function readForm() {
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    cfg.title = v('fho-title'); cfg.hospital = v('fho-hospital'); cfg.date = v('fho-date');
    cfg.onlyDone = !!(document.getElementById('fho-only-done') || {}).checked;
    cfg.leftName = v('fho-left-name'); cfg.leftPos = v('fho-left-pos'); cfg.leftInst = v('fho-left-inst');
    cfg.rightName = v('fho-right-name'); cfg.rightPos = v('fho-right-pos'); cfg.rightInst = v('fho-right-inst');
    saveCfg();
  }

  // ── รายการในเอกสาร แยก 2 ส่วนตามการมีชื่อตามสัญญา (ไม่ใช่ประเภท — ใบตั้งต้นอย่าง "ขออนุมัติ…" อยู่ส่วนเพิ่มเติม)
  // ตามสัญญาเรียงตามเลขสัญญา · เพิ่มเติมเรียงตามคลังแล้วตามลำดับในคลัง (เหมือนบนจอ) ──
  function sections(pid) {
    var groups = window.FORM_GROUPS.filter(function (g) { return g.projectId === pid; });
    function gOf(id) { return groups.find(function (g) { return g.id === id; }); }
    var items = window.FORM_ITEMS.filter(function (i) { return i.projectId === pid && (!cfg.onlyDone || i.status === 'done'); })
      .sort(function (a, b) {
        var ga = gOf(a.groupId), gb = gOf(b.groupId);
        return ((ga ? ga.order : 0) - (gb ? gb.order : 0)) || (a.order - b.order);
      })
      .map(function (i) {
        var g = gOf(i.groupId);
        // ชื่อตามสัญญานับเฉพาะประเภท "แบบฟอร์มตามสัญญา" — ประเภทอื่นที่มีค่าค้างไว้ถือว่าไม่มี
        var cn = i.formType === 'form_contract' ? (i.contractName || '').trim() : '';
        return {
          group: g ? g.name : '', name: i.name, contract: cn || '-',
          owner: i.ownerId ? (window.staffNameByRef(i.ownerId) || '') : '',
          done: i.doneDate ? shortDate(i.doneDate) : '',
          note: i.description || '', base: !!cn, no: window.ftkContractNo(cn),
        };
      });
    return {
      base: items.filter(function (r) { return r.base; }).sort(function (a, b) { return a.no - b.no; }), // sort ของ JS คงลำดับเดิมเมื่อเลขเท่ากัน
      extra: items.filter(function (r) { return !r.base; }),
    };
  }

  // ── Modal ตั้งค่า ──
  window.openFtkHandover = function () {
    var pid = window.imtCurrentProjectId;
    if (!pid || !window.imtProject(pid)) return;
    if (cfgPid !== pid || !cfg) loadCfg(pid);
    var s = sections(pid);
    var hc = hospContacts();
    var f =function (id, label, val, ph) { return '<div class="f-group"><label class="f-label">'+label+'</label><input class="f-input" id="'+id+'" value="'+esc(val)+'" placeholder="'+esc(ph||'')+'"></div>'; };
    document.getElementById('m-ftk-handover-body').innerHTML =
        f('fho-title', 'หัวเรื่องเอกสาร', cfg.title)
      + '<div class="fho-grid2">' + f('fho-hospital', 'หน่วยงาน', cfg.hospital)
      +   '<div class="f-group"><label class="f-label">วันที่จัดทำ</label><input type="date" class="f-input" id="fho-date" value="'+esc(cfg.date)+'"></div></div>'
      + '<label class="fho-check"><input type="checkbox" id="fho-only-done"'+(cfg.onlyDone?' checked':'')+' onchange="window.ftkHandoverCount()"> เฉพาะแบบฟอร์มที่ดำเนินการแล้ว</label>'
      + '<div class="fho-count" id="fho-count">'+countText(s)+'</div>'
      + '<div class="fho-sec">ผู้ลงนามท้ายเอกสาร</div>'
      + '<div class="fho-grid2 fho-signs">'
      +   '<div class="fho-sign fho-sign-l"><div class="fho-sign-hd"><span class="fho-side">ซ้าย</span><div><b>ผู้ส่งมอบ — BMS</b><small>ลงนามฝั่งซ้ายของเอกสาร</small></div>'
      +     (cfg.siteOwner ? '<button type="button" class="fho-owner" onclick="window.ftkHandoverUseOwner()" title="ใช้เจ้าของไซต์ของโครงการ: '+esc(cfg.siteOwner)+'">↺ ใช้เจ้าของไซต์</button>' : '')+'</div>'
      +     '<div class="fho-sign-bd"><div class="f-group"><label class="f-label">ชื่อ-นามสกุล</label>'
      +       '<div id="fho-left-name-wrap" style="position:relative;"><input class="f-input" id="fho-left-name" autocomplete="off" spellcheck="false" value="'+esc(cfg.leftName)+'" placeholder="พิมพ์ค้นหา หรือเลือกจากรายชื่อพนักงาน">'
      +       '<div id="fho-left-name-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;"><div id="fho-left-name-list" style="max-height:260px;overflow-y:auto;"></div></div></div>'+'</div>'
      +     f('fho-left-pos', 'ตำแหน่ง', cfg.leftPos, 'เช่น ผู้จัดการโครงการติดตั้งระบบคลังสินค้า')+f('fho-left-inst', 'หน่วยงาน', cfg.leftInst)+'</div></div>'
      +   '<div class="fho-sign fho-sign-r"><div class="fho-sign-hd"><span class="fho-side">ขวา</span><div><b>ผู้รับมอบ — สถานพยาบาล</b><small>ลงนามฝั่งขวาของเอกสาร</small></div>'
      +     (hc.length ? '<button type="button" class="fho-owner" id="fho-contact-btn" onclick="window.ftkHandoverContacts(event)" title="ใช้ชื่อ/ตำแหน่งจากข้อมูลผู้ติดต่อของสถานพยาบาล">👥 ผู้ติดต่อ รพ.'+(hc.length > 1 ? ' ('+hc.length+') ▾' : '')+'</button>'
      +       '<div class="fho-pick" id="fho-contact-pick" style="display:none;">'+hc.map(function (c, i) {
                return '<button type="button" onclick="window.ftkHandoverPickContact('+i+')"><b>'+esc(c.name)+(c.nickname ? ' <span>('+esc(c.nickname)+')</span>' : '')+'</b>'
                  + '<small>'+esc(c.position || 'ไม่ระบุตำแหน่ง')+(c.phone ? ' · '+esc(c.phone) : '')+'</small></button>';
              }).join('')+'</div>' : '')+'</div>'
      +     '<div class="fho-sign-bd">'+f('fho-right-name', 'ชื่อ-นามสกุล', cfg.rightName)+f('fho-right-pos', 'ตำแหน่ง', cfg.rightPos)+f('fho-right-inst', 'หน่วยงาน', cfg.rightInst)+'</div></div>'
      + '</div>';
    window.openM('m-ftk-handover');
    window._initImtSignerCombobox({ id: 'fho-left-name', onPick: syncLeftPos });
  };
  // ── เลือกชื่อแล้วเติมตำแหน่งจากข้อมูลพนักงาน (ชื่อที่พิมพ์เองไม่ตรงใคร = คงตำแหน่งเดิมไว้) ──
  function syncLeftPos() {
    var pos = window.imtStaffPositionByName(document.getElementById('fho-left-name').value);
    if (pos) document.getElementById('fho-left-pos').value = pos;
  }
  // ── ผู้ลงนามขวาจากผู้ติดต่อของ รพ. (ข้อมูลสถานพยาบาล) — 1 คนเติมทันที · หลายคนเปิดรายการให้เลือก ──
  function hospContacts() {
    var h = window.pdocHospital && window.pdocHospital(window.imtProject(cfgPid));
    return ((h && h.contacts) || []).filter(function (c) { return (c.name || '').trim(); });
  }
  function closeContactPick() {
    var el = document.getElementById('fho-contact-pick');
    if (el) el.style.display = 'none';
    document.removeEventListener('click', closeContactPick);
  }
  window.ftkHandoverContacts = function (ev) {
    var list = hospContacts();
    if (list.length === 1) return window.ftkHandoverPickContact(0);
    var el = document.getElementById('fho-contact-pick');
    if (el.style.display !== 'none') return closeContactPick();
    ev.stopPropagation();
    el.style.display = '';
    document.addEventListener('click', closeContactPick);
  };
  window.ftkHandoverPickContact = function (i) {
    var c = hospContacts()[i];
    closeContactPick();
    if (!c) return;
    document.getElementById('fho-right-name').value = c.name.trim();
    document.getElementById('fho-right-pos').value = (c.position || '').trim();
  };
  window.ftkHandoverUseOwner = function () {
    document.getElementById('fho-left-name').value = cfg.siteOwner;
    syncLeftPos();
  };
  function countText(s) {
    var n = s.base.length + s.extra.length;
    if (!n) return '⚠ ไม่มีแบบฟอร์มที่จะใส่ในเอกสาร';
    var c = window.ftkContractCoverage(cfgPid);
    var gap = c.missing.length + c.fillable.length;
    return '📄 '+n+' รายการ · ตามสัญญา '+s.base.length+' · แบบฟอร์มเพิ่มเติม '+s.extra.length
      + (c.total && gap ? '<br><span class="fho-warn">⚠ แบบฟอร์มตามสัญญายังไม่ครบ ('+c.have.length+'/'+c.total+') ขาด: '
          + c.missing.concat(c.fillable.map(function (x) { return x.tpl; })).map(function (t) { return esc(t.contractName); }).join(', ')
          + ' — ดูแถบ "แบบฟอร์มตามสัญญา" เหนือรายการคลัง</span>' : '');
  }
  window.ftkHandoverCount = function () {
    cfg.onlyDone = document.getElementById('fho-only-done').checked;
    document.getElementById('fho-count').innerHTML = countText(sections(cfgPid));
  };

  // ── เอกสารพิมพ์ (A4 แนวนอน) ──
  function rowsHtml(list) {
    return list.map(function (r, i) {
      return '<tr><td class="c">'+(i+1)+'</td><td class="c">'+esc(r.group)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.contract)+'</td>'
        + '<td class="c">'+esc(r.owner)+'</td><td class="c">'+esc(r.done)+'</td><td></td><td>'+esc(r.note)+'</td></tr>';
    }).join('');
  }
  function docHtml() {
    var s = sections(cfgPid), img = new URL('img/BMS-Header.jpg', location.href).href;
    var body = rowsHtml(s.base)
      + (s.base.length && s.extra.length ? '<tr class="sec"><td colspan="8">แบบฟอร์มเพิ่มเติม</td></tr>' : '')
      + rowsHtml(s.extra)
      + '<tr><td></td><td colspan="2" class="c"><b>*** หมายเหตุ :</b></td><td colspan="5"></td></tr>';
    var sign = function (name, pos, inst) {
      return '<div><div class="line">………………………………………………</div><div>('+(esc(name)||'………………………………………')+')</div>'
        + '<div>ตำแหน่ง '+(esc(pos)||'………………………………')+'</div>'+(inst?'<div>'+esc(inst)+'</div>':'')+'</div>';
    };
    return '<div class="doc"><img class="logo" src="'+esc(img)+'" alt="BMS"><h1>'+esc(cfg.title)+'</h1>'
      + '<table><colgroup><col style="width:11mm"><col style="width:27mm"><col><col style="width:58mm"><col style="width:34mm"><col style="width:24mm"><col style="width:28mm"><col style="width:30mm"></colgroup>'
      + '<thead><tr class="info"><th colspan="2">หน่วยงาน :</th><th colspan="3" class="l">'+esc(cfg.hospital)+'</th><th colspan="3" class="r">วันที่จัดทำ : '+esc(thaiDate(cfg.date))+'</th></tr>'
      + '<tr><th>ลำดับ</th><th>หน่วยงานที่ใช้</th><th>ชื่อแบบฟอร์มที่แสดงในหน้าจอโปรแกรม</th><th>ชื่อแบบฟอร์มตามสัญญา</th><th>ผู้ดำเนินการ</th><th>วันที่แล้วเสร็จ</th><th>ลายเซ็นตรวจรับ</th><th>หมายเหตุ</th></tr></thead>'
      + '<tbody>'+body+'</tbody></table>'
      + '<div class="signs">'+sign(cfg.leftName, cfg.leftPos, cfg.leftInst)+sign(cfg.rightName, cfg.rightPos, cfg.rightInst)+'</div></div>';
  }
  var PRINT_CSS = '@page{size:A4 landscape;margin:10mm}'
    + 'body{margin:0;font-family:"TH SarabunPSK","Sarabun",sans-serif;color:#000;background:#fff}'
    + '.doc{padding:0}.logo{height:16mm;display:block}'
    + 'h1{font-size:17px;text-align:center;margin:0 0 6px}'
    + 'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}'
    + 'th,td{border:1px solid #000;padding:3px 5px;vertical-align:top;word-wrap:break-word}'
    + 'thead th{background:#f0f0f0}tr.info th{background:#fff;text-align:center}th.l{text-align:left!important}th.r{text-align:right!important}'
    + 'td.c{text-align:center}tr{page-break-inside:avoid}tr.sec td{text-align:center;font-weight:700}'
    + '.signs{display:flex;justify-content:space-around;margin-top:28px;text-align:center;font-size:14px;line-height:1.7;page-break-inside:avoid}'
    + '.actions{position:fixed;top:10px;right:10px}.actions button{margin-left:6px;padding:6px 14px;cursor:pointer}'
    + '@media print{.actions{display:none}}';

  window.ftkHandoverPrint = function () {
    readForm();
    var popup = window.open('', '_blank', 'width=1100,height=780,scrollbars=yes');
    if (!popup) { window.showToast && window.showToast('Popup ถูกบล็อก กรุณาอนุญาต popup แล้วลองใหม่', 'danger'); return; }
    popup.document.open();
    popup.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>'+esc(cfg.title)+'</title><style>'+PRINT_CSS+'</style></head><body>'
      + docHtml() + '<div class="actions"><button onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button><button onclick="window.close()">ปิด</button></div>'
      + '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    popup.document.close();
  };

  window.ftkHandoverExcel = async function () {
    readForm();
    if (!(await window.LibLoader.need('xlsx'))) return;
    var s = sections(cfgPid);
    var toRow = function (r, i) { return [i+1, r.group, r.name, r.contract, r.owner, r.done, '', r.note]; };
    var aoa = [[cfg.title], ['หน่วยงาน : '+cfg.hospital, '', '', '', '', 'วันที่จัดทำ : '+thaiDate(cfg.date)], [],
      ['ลำดับ', 'หน่วยงานที่ใช้', 'ชื่อแบบฟอร์มที่แสดงในหน้าจอโปรแกรม', 'ชื่อแบบฟอร์มตามสัญญา', 'ผู้ดำเนินการ', 'วันที่แล้วเสร็จ', 'ลายเซ็นตรวจรับ', 'หมายเหตุ']]
      .concat(s.base.map(toRow))
      .concat(s.base.length && s.extra.length ? [['', '', 'แบบฟอร์มเพิ่มเติม']] : [])
      .concat(s.extra.map(toRow))
      .concat([[], ['', '', '('+(cfg.leftName||'')+')', '', '', '('+(cfg.rightName||'')+')'],
        ['', '', 'ตำแหน่ง '+(cfg.leftPos||''), '', '', 'ตำแหน่ง '+(cfg.rightPos||'')],
        ['', '', cfg.leftInst||'', '', '', cfg.rightInst||'']]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:6},{wch:14},{wch:50},{wch:34},{wch:22},{wch:13},{wch:16},{wch:18}];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ใบส่งมอบ');
    XLSX.writeFile(wb, 'ใบส่งมอบแบบฟอร์ม_'+(cfg.hospital||'').replace(/[^a-zA-Z0-9ก-๙.]+/g, '_')+'_'+window.todayStr()+'.xlsx');
  };
})();
