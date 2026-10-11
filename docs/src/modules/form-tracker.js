/**
 * form-tracker.js — "แบบฟอร์ม" แท็บย่อยของหน้า "ติดตามโครงการติดตั้ง" (impl_tracker)
 * ไม่มีโครงการ/permission module ของตัวเอง — ใช้ window.imtCurrentProjectId และ window.IMPL_MODULE
 * ร่วมกับ impl-tracker.js ทั้งหมด (Group (คลัง) → Item (แบบฟอร์ม) ผูกตรงกับ impl project เดียวกัน)
 * เรียกผ่าน window.renderImtForms(mount) จาก dispatcher ใน impl-tracker.js
 */
(function () {
  var esc = window.esc, fd = window.fd;

  function ftkGroup(id)    { return window.FORM_GROUPS.find(function (g) { return g.id === id; }); }
  function ftkGroupsOf(pid)     { return window.FORM_GROUPS.filter(function (g) { return g.projectId === pid; }).sort(function (a,b) { return a.order - b.order; }); }
  function ftkItemsOfGroup(gid) { return window.FORM_ITEMS.filter(function (i) { return i.groupId === gid; }).sort(function (a,b) { return a.order - b.order; }); }
  function ftkItemsOfProject(pid) { return window.FORM_ITEMS.filter(function (i) { return i.projectId === pid; }); }
  function ftkStatus(id) { return window.FORM_STATUS.find(function (s) { return s.id === id; }) || window.FORM_STATUS[0]; }

  var pbarHtml = window.pbarHtml;

  // ================================================================
  // ตามสัญญา — แบบฟอร์มที่มี "ชื่อตามสัญญา" = อยู่ส่วนตามสัญญาของใบส่งมอบ (ไม่มี = แบบฟอร์มเพิ่มเติม)
  // ชุดตามสัญญาที่ต้องมีครบ = Template แถบ "แบบฟอร์มตามสัญญา" ของประเภทโครงการ + ใช้ร่วม · เรียงตามเลขหน้าชื่อตามสัญญา ("12. …", "9 …")
  // ================================================================
  function ftkNorm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  // ── ตามสัญญาผูก 1:1 — ชื่อตามสัญญา (normalized) ที่แบบฟอร์มในโครงการผูกไว้แล้ว { name: itemId } · exceptId = ไม่นับแถวนี้ ──
  function ftkUsedContracts(pid, exceptId) {
    var used = {};
    ftkItemsOfProject(pid).forEach(function (i) {
      var k = i.formType === 'form_contract' ? ftkNorm(i.contractName) : '';
      if (k && i.id !== exceptId) used[k] = i.id;
    });
    return used;
  }
  // ── แบบฟอร์มตามสัญญาแถวอื่นในโครงการที่ซ้ำกับ item: ชื่อแบบฟอร์มเดียวกัน หรือผูกชื่อตามสัญญาของ Template ที่ชื่อเอกสารตรงกับ item ──
  function ftkContractDupOf(item) {
    var n = ftkNorm(item.name);
    var tplNames = window.FORM_TEMPLATES.filter(function (t) { return t.kind === 'contract' && t.contractName && ftkTplInScope(t, item.projectId) && ftkNorm(t.name) === n; })
      .map(function (t) { return ftkNorm(t.contractName); });
    return ftkItemsOfProject(item.projectId).find(function (i) {
      return i.id !== item.id && i.formType === 'form_contract'
        && (ftkNorm(i.name) === n || tplNames.indexOf(ftkNorm(i.contractName)) !== -1);
    });
  }
  window.ftkContractNo = function (s) { var m = /^\s*(\d+)/.exec(s || ''); return m ? Number(m[1]) : 9999; };
  // ── เทียบโครงการกับชุดตามสัญญา: have = มีแบบฟอร์มที่ชื่อตามสัญญาตรงแล้ว · fillable = มีแบบฟอร์มชื่อเอกสารตรง
  // แต่ยังไม่ได้กรอกชื่อตามสัญญา (เติมให้ได้) · missing = ยังไม่มีในโครงการเลย ──
  window.ftkContractCoverage = function (pid) {
    var items = ftkItemsOfProject(pid);
    var tpls = window.FORM_TEMPLATES.filter(function (t) { return t.kind === 'contract' && t.contractName && ftkTplInScope(t, pid); })
      .sort(function (a, b) { return window.ftkContractNo(a.contractName) - window.ftkContractNo(b.contractName) || a.order - b.order; });
    var res = { total: tpls.length, have: [], fillable: [], missing: [] };
    // ชื่อตามสัญญานับเฉพาะประเภท "แบบฟอร์มตามสัญญา" (ประเภทอื่นไม่มีช่องนี้แล้ว ค่าที่ค้างไว้ไม่นับ)
    function cn(i) { return i.formType === 'form_contract' ? ftkNorm(i.contractName) : ''; }
    tpls.forEach(function (t) {
      if (items.some(function (i) { return cn(i) === ftkNorm(t.contractName); })) { res.have.push(t); return; }
      var hits = items.filter(function (i) { return !cn(i) && ftkNorm(i.name) === ftkNorm(t.name); });
      if (hits.length) res.fillable.push({ tpl: t, items: hits }); else res.missing.push(t);
    });
    return res;
  };

  // ── แถบความครบตามสัญญา เหนือรายการคลัง — ไม่มี Template ตามสัญญา = ไม่แสดง ──
  // ── บรรทัดเดียว: "ตามสัญญายังขาด n ใบ" + [ดูว่าขาดใบไหน] + เลือกคลัง/ผู้จัดทำ + [เพิ่มทั้ง n ใบ]
  // รายชื่อใบที่ขาดพับไว้ (กดดูเมื่ออยากรู้) · ครบแล้วเหลือแถบเขียวบาง ๆ ──
  window.ftkCbarOpen = false;
  window.ftkToggleCbar = function () { window.ftkCbarOpen = !window.ftkCbarOpen; window.renderImplTracker(); };
  // ผู้จัดทำตั้งต้น = คนที่ถือแบบฟอร์มในโครงการนี้มากที่สุด (ส่วนใหญ่ทำคนเดียวทั้งโครงการ)
  function ftkMainOwner(pid) {
    var cnt = {}, best = '', max = 0;
    ftkItemsOfProject(pid).forEach(function (i) { if (i.ownerId) cnt[i.ownerId] = (cnt[i.ownerId] || 0) + 1; });
    Object.keys(cnt).forEach(function (k) { if (cnt[k] > max) { max = cnt[k]; best = k; } });
    return best;
  }
  function ftkContractBarHtml(pid, groups, canEdit, canAdd) {
    var c = window.ftkContractCoverage(pid);
    if (!c.total) return '';
    var n = c.have.length, miss = c.missing.length;
    var tip = window.calcTip('นับแบบฟอร์มในโครงการที่ "ชื่อตามสัญญา" ตรงกับ Template แถบตามสัญญา\nใบส่งมอบ: มีชื่อตามสัญญา = ส่วนตามสัญญา (เรียงตามเลข) · ไม่มี = แบบฟอร์มเพิ่มเติม');
    if (n === c.total) return '<div class="ftk-cbar done"><div class="ftk-cbar-head"><span class="ftk-cbar-ok">✅ แบบฟอร์มตามสัญญาครบ '+n+'/'+c.total+'</span>'+tip+'</div></div>';
    var chip = function (t) { return '<span class="ftk-cbar-chip" title="'+esc(t.name)+'">'+esc(t.contractName)+'</span>'; };
    var head = '<div class="ftk-cbar-head">'
      + '<span class="ftk-cbar-msg">แบบฟอร์มตามสัญญา'
      +   (miss ? ' ยังขาด <b>'+miss+' ใบ</b>' : '')
      +   (c.fillable.length ? (miss ? ' ·' : '') + ' ชื่อตรงแต่ยังไม่ผูก <b>'+c.fillable.length+' ใบ</b>' : '')
      +   ' <span class="ftk-cbar-sub">(มี '+n+' จาก '+c.total+')</span>'+tip+'</span>'
      + '<button type="button" class="ftk-cbar-toggle" aria-expanded="'+window.ftkCbarOpen+'" onclick="window.ftkToggleCbar()">'+(window.ftkCbarOpen ? 'ซ่อนรายการ' : 'ดูว่าใบไหน')+'</button>'
      + '<span class="ftk-cbar-add">';
    if (c.fillable.length && canEdit)
      head += '<button type="button" class="btn btn-ghost btn-sm" onclick="window.ftkFillContractNames()">✨ ผูกชื่อตามสัญญา ('+c.fillable.length+')</button>';
    if (miss && canAdd && groups.length) {
      var gOpts = groups.map(function (g) { return '<option value="'+g.id+'">'+esc(g.name)+'</option>'; }).join('');
      var main = ftkMainOwner(pid);
      var oOpts = '<option value="">ยังไม่มอบหมาย</option>' + (window.ftkStaffOpts || []).map(function (o) {
        return '<option value="'+esc(o.id)+'"'+(o.id===main?' selected':'')+'>'+esc(o.label)+'</option>';
      }).join('');
      head += (groups.length > 1 ? '<select class="t-sel" id="ftk-cbar-group" aria-label="คลังที่จะเพิ่ม">'+gOpts+'</select>'
               : '<input type="hidden" id="ftk-cbar-group" value="'+groups[0].id+'">')
        + '<select class="t-sel" id="ftk-cbar-owner" aria-label="ผู้จัดทำของใบที่เพิ่ม">'+oOpts+'</select>'
        + '<button type="button" class="btn btn-pri btn-sm" onclick="window.ftkAddMissingContract(document.getElementById(\'ftk-cbar-group\').value,document.getElementById(\'ftk-cbar-owner\').value)">+ เพิ่มทั้ง '+miss+' ใบ</button>';
    }
    head += '</span></div>';
    var list = !window.ftkCbarOpen ? '' : ''
      + (miss ? '<div class="ftk-cbar-line"><span class="ftk-cbar-lbl">ยังไม่มีในโครงการ</span>'+c.missing.map(chip).join('')+'</div>' : '')
      + (c.fillable.length ? '<div class="ftk-cbar-line"><span class="ftk-cbar-lbl">ชื่อตรงแต่ยังไม่มีชื่อตามสัญญา</span>'+c.fillable.map(function (x) { return chip(x.tpl); }).join('')+'</div>' : '');
    return '<div class="ftk-cbar">' + head + list + '</div>';
  }

  // ── เติมชื่อตามสัญญาให้แบบฟอร์มที่ชื่อเอกสารตรงกับ Template ตามสัญญา (เฉพาะที่ยังว่าง) + ตั้งประเภทเป็นตามสัญญา ──
  window.ftkFillContractNames = async function () {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var c = window.ftkContractCoverage(window.imtCurrentProjectId), now = new Date().toISOString(), jobs = [];
    // ตามสัญญาผูก 1:1 — ชื่อเอกสารตรงหลายแถว เติมให้แถวแรกแถวเดียว (แถวที่เหลือเป็นแบบฟอร์มเพิ่มเติม)
    c.fillable.forEach(function (x) {
      var item = x.items[0];
      var o = { contract_name: x.tpl.contractName, form_type: 'form_contract', updated_at: now };
      window.ftkApplyLocal('FORM_ITEMS', item.id, Object.assign(ftkItemRow(item), o));
      jobs.push(window.updateDoc(window.getDocRef('FORM_ITEMS', item.id), o));
    });
    window.renderImplTracker();
    await Promise.all(jobs).catch(window.showDbError);
  };

  // ── เพิ่มแบบฟอร์มตามสัญญาที่ยังขาดทั้งหมดลงคลังที่เลือก (ถ้าแต่ละใบอยู่ต่างคลัง ให้ดึงทีละคลังจาก 📐 แทน) ──
  window.ftkAddMissingContract = async function (groupId, ownerId) {
    var pid = window.imtCurrentProjectId;
    if (!groupId || !pid || !window.canAdd(window.IMPL_MODULE)) return;
    var c = window.ftkContractCoverage(pid), start = ftkItemsOfGroup(groupId).length, now = new Date().toISOString();
    var rows = c.missing.map(function (t, i) {
      return { id: window.ftkUid('FIT') + i, row: {
        project_id: pid, group_id: groupId, form_name: t.name, contract_name: t.contractName, form_type: 'form_contract',
        status: 'not_started', owner: ownerId || '', description: '', sort_order: start + i + 1, updated_at: now,
      } };
    });
    if (!rows.length) return;
    rows.forEach(function (r) { window.ftkApplyLocal('FORM_ITEMS', r.id, r.row); });
    window.ftkCbarOpen = false;
    window.renderImplTracker();
    var g = ftkGroup(groupId);
    ftkShowUndo('เพิ่มแบบฟอร์มตามสัญญา ' + rows.length + ' ใบเข้า ' + (g ? g.name : 'คลัง')
      + (ownerId ? ' · ผู้จัดทำ ' + (window.staffNameByRef(ownerId) || '') : ''), { remove: rows.map(function (r) { return r.id; }) });
    await Promise.all(rows.map(function (r) { return window.setDoc(window.getDocRef('FORM_ITEMS', r.id), r.row); })).catch(window.showDbError);
  };

  // ================================================================
  // MAIN — เรียกจาก dispatcher ของ impl-tracker.js (window.imtCurrentProjectId เดียวกันทุกแท็บ)
  // ================================================================
  window.ftkSetFilter = function (key, value) {
    window.ftkFilter = window.ftkFilter || {};
    window.ftkFilter[key] = value;
    window.imtRenderKeepFocus('ftk-q');
  };
  // ── ล้างคำค้น + ตัวกรองทั้งหมด (คงตัวกรองสถานะไว้) ──
  window.ftkClearFilters = function () {
    window.ftkFilter = Object.assign(window.ftkFilter || {}, { q:'', groupId:'', formType:'', owner:'' });
    window.renderImplTracker();
  };
  window.ftkCollapsed = window.ftkCollapsed || {};   // คลังที่ย่อไว้ (group id → true)
  window.ftkSel = window.ftkSel || {};               // แบบฟอร์มที่ติ๊กเลือกไว้ สำหรับแก้หลายรายการพร้อมกัน

  // ── ftkFilter.status: 'open' = ยังไม่เสร็จ (ค่าเริ่มต้น) · '' = ทั้งหมด · หรือรหัสสถานะ
  // ignoreStatus = นับจำนวนให้ชิปสถานะ (ใช้ตัวกรองอื่นครบ ยกเว้นสถานะ) ──
  function ftkFilteredItems(pid, ignoreStatus) {
    var f = window.ftkFilter || {};
    var q = (f.q || '').toLowerCase();
    return ftkItemsOfProject(pid).filter(function (i) {
      if (!ignoreStatus) {
        if (f.status === 'open' && i.status === 'done') return false;
        if (f.status && f.status !== 'open' && i.status !== f.status) return false;
      }
      if (q && (i.name + ' ' + (i.contractName || '') + ' ' + (window.staffNameByRef(i.ownerId) || '')).toLowerCase().indexOf(q) === -1) return false;
      if (f.groupId && i.groupId !== f.groupId) return false;
      if (f.formType && i.formType !== f.formType) return false;
      if (f.owner && i.ownerId !== f.owner) return false; // f.owner = รหัสพนักงาน
      return true;
    });
  }

  // ── สถานะแบบ segmented ชิดขวาของแถบกรอง (แทน dropdown สถานะ + ติ๊ก "เฉพาะที่ยังไม่เสร็จ") กดครั้งเดียวกรองได้ทันที
  // ชื่อย่อ (กำลังทำ/เสร็จแล้ว) ให้ทั้งแถบอยู่ในแถวเดียว · "ทั้งหมด" ไว้ท้ายสุด ──
  var FTK_STATUS_SHORT = { in_progress: 'กำลังทำ', done: 'เสร็จแล้ว' };
  function ftkStatusChipsHtml(pid) {
    var f = window.ftkFilter || {};
    var base = ftkFilteredItems(pid, true);
    var chips = [
      { id:'open', label:'ยังไม่เสร็จ', color:'var(--violet)', n: base.filter(function (i) { return i.status !== 'done'; }).length },
    // ไม่แสดง "รอดำเนินการ" — ซ้ำกับ "ยังไม่เสร็จ" (ยังไม่เสร็จ = รอดำเนินการ + กำลังดำเนินการ)
    ].concat(window.FORM_STATUS.filter(function (s) { return s.id !== 'not_started'; }).map(function (s) {
      return { id:s.id, label:FTK_STATUS_SHORT[s.id] || s.label, title:s.label, color:s.color, n: base.filter(function (i) { return i.status === s.id; }).length };
    })).concat([{ id:'', label:'ทั้งหมด', n: base.length }]);
    return '<div class="ftk-seg" role="group" aria-label="กรองตามสถานะ">' + chips.map(function (c) {
      var on = (f.status || '') === c.id;
      return '<button type="button" class="ftk-seg-btn'+(on?' on':'')+'" aria-pressed="'+on+'"'+(c.title?' title="'+esc(c.title)+'"':'')+(c.color?' style="--c:'+c.color+'"':'')+' onclick="window.ftkSetFilter(\'status\',\''+c.id+'\')">'
        + (c.color?'<i></i>':'')+esc(c.label)+'<b>'+c.n+'</b></button>';
    }).join('') + '</div>';
  }

  // ── ย่อ/ขยายคลัง ──
  window.ftkToggleGroup = function (gid) {
    window.ftkCollapsed[gid] = !window.ftkCollapsed[gid];
    window.renderImplTracker();
  };

  // ── เลือกหลายรายการ: ติ๊กแล้วอัปเดตเฉพาะแถบ/แถวที่เกี่ยวข้อง ไม่ re-render ทั้งหน้า (ตำแหน่งเลื่อนไม่กระโดด) ──
  function ftkSelIds() { return Object.keys(window.ftkSel).filter(function (k) { return window.ftkSel[k]; }); }
  function ftkBulkBarHtml(staffOpts) {
    var n = ftkSelIds().length;
    if (!n) return '';
    var stOpts = '<option value="">เปลี่ยนสถานะ…</option>' + window.FORM_STATUS.map(function (s) { return '<option value="'+s.id+'">'+s.icon+' '+esc(s.label)+'</option>'; }).join('');
    var owOpts = '<option value="">มอบหมายผู้จัดทำ…</option><option value="__none">— ยังไม่มอบหมาย —</option>'
      + staffOpts.map(function (o) { return '<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>'; }).join('');
    return '<b>เลือก '+n+' รายการ</b>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.ftkBulkSet(\'status\',\'in_progress\')">เริ่มทำทั้งหมด</button>'
      + '<button type="button" class="btn btn-sm ftk-btn-done" onclick="window.ftkBulkSet(\'status\',\'done\')">เสร็จทั้งหมด</button>'
      + '<select class="t-sel" aria-label="เปลี่ยนสถานะรายการที่เลือก" onchange="if(this.value)window.ftkBulkSet(\'status\',this.value)">'+stOpts+'</select>'
      + '<select class="t-sel" aria-label="มอบหมายผู้จัดทำรายการที่เลือก" onchange="if(this.value)window.ftkBulkSet(\'owner\',this.value===\'__none\'?\'\':this.value)">'+owOpts+'</select>'
      + ftkBulkDateHtml('received_date', '📥 วันที่รับ…', 'ตั้งวันที่รับเอกสารให้รายการที่เลือก')
      + ftkBulkDateHtml('done_date', '✅ วันที่เสร็จ…', 'ตั้งวันที่ดำเนินการแล้วให้รายการที่เลือก (รายการที่ยังไม่เสร็จจะเปลี่ยนเป็น "ดำเนินการแล้ว")')
      + (window.canDel(window.IMPL_MODULE) ? '<button type="button" class="btn btn-red btn-sm" onclick="window.ftkBulkDel()">🗑️ ลบที่เลือก</button>' : '')
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.ftkClearSel()">ยกเลิกการเลือก</button>';
  }
  function ftkBulkDateHtml(field, label, title) {
    return '<div class="ftk-date-picker ftk-bulk-date" title="'+esc(title)+'">'
      + '<input type="date" class="ftk-date-input" aria-label="'+esc(title)+'" onclick="try{this.showPicker&&this.showPicker();}catch(e){}" onchange="if(this.value)window.ftkBulkSet(\''+field+'\',this.value)">'
      + '<span class="ftk-date-display">'+label+'</span></div>';
  }
  window.ftkBulkDel = function () {
    var ids = ftkSelIds().filter(function (id) { return window.FORM_ITEMS.some(function (i) { return i.id === id; }); });
    if (!ids.length) return;
    window.askDel('form_items', ids, 'แบบฟอร์มที่เลือก ' + ids.length + ' รายการ');
  };
  function ftkRefreshBulkBar() {
    var bar = document.getElementById('ftk-bulkbar');
    if (!bar) return;
    bar.innerHTML = ftkBulkBarHtml(window.ftkStaffOpts || []);
    bar.hidden = !ftkSelIds().length;
  }
  window.ftkToggleSel = function (el, itemId) {
    window.ftkSel[itemId] = el.checked;
    el.closest('tr').classList.toggle('ftk-row-sel', el.checked);
    ftkRefreshBulkBar();
  };
  window.ftkToggleSelGroup = function (el) {
    el.closest('table').querySelectorAll('tbody .ftk-chk').forEach(function (c) {
      c.checked = el.checked;
      window.ftkSel[c.dataset.id] = el.checked;
      c.closest('tr').classList.toggle('ftk-row-sel', el.checked);
    });
    ftkRefreshBulkBar();
  };
  window.ftkClearSel = function () { window.ftkSel = {}; window.renderImplTracker(); };

  // ================================================================
  // ลดงานซ้ำ — เปลี่ยนสถานะเป็น "กำลังดำเนินการ"/"ดำเนินการแล้ว" แล้วยังไม่มีวันที่รับเอกสาร = ลงวันนี้ให้เอง
  // ทุกการเปลี่ยนหลายแถว (ปุ่มขั้นถัดไป / แก้หลายรายการ / มอบหมายทั้งคลัง / เพิ่มใบที่ขาด) มีแถบ "เลิกทำ" 8 วินาที
  // ================================================================
  // ── ตั้งวันที่เสร็จ = ถือว่าเสร็จแล้ว · เปลี่ยนเป็น "ดำเนินการแล้ว" ไม่มีวันเสร็จ = ลงวันนี้ · ถอยสถานะกลับ = ล้างวันเสร็จ ──
  function ftkAutoDates(item, overrides) {
    if (overrides.done_date) overrides.status = 'done';
    if (overrides.status && overrides.status !== 'not_started' && !item.receivedDate && overrides.received_date === undefined)
      overrides.received_date = overrides.done_date || window.todayStr();
    if (overrides.status === 'done' && !item.doneDate && overrides.done_date === undefined) overrides.done_date = window.todayStr();
    if (overrides.status && overrides.status !== 'done' && item.doneDate) overrides.done_date = null;
    return overrides;
  }
  // ── อัปเดตหลายแถวพร้อมกัน (optimistic) + เก็บค่าเดิมไว้ให้ "เลิกทำ" ──
  async function ftkUpdateMany(ids, makeOverrides, undoMsg) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var now = new Date().toISOString(), snaps = [], jobs = [];
    ids.forEach(function (id) {
      var item = window.FORM_ITEMS.find(function (i) { return i.id === id; });
      var o = item && makeOverrides(item);
      if (!o) return;
      snaps.push({ id: id, row: Object.assign(ftkItemRow(item), { updated_at: item.updatedAt || now }) });
      o = ftkAutoDates(item, o);
      o.updated_at = now;
      window.ftkApplyLocal('FORM_ITEMS', id, Object.assign(ftkItemRow(item), o));
      jobs.push(window.updateDoc(window.getDocRef('FORM_ITEMS', id), o));
    });
    if (!snaps.length) return;
    window.ftkSel = {};
    window.renderImplTracker();
    if (undoMsg) ftkShowUndo(undoMsg(snaps.length), { restore: snaps });
    await Promise.all(jobs).catch(window.showDbError);
  }
  var ftkUndoTimer = null, ftkUndoData = null;
  function ftkShowUndo(msg, data) {
    ftkUndoData = data;
    var el = document.getElementById('ftk-undo');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ftk-undo'; el.className = 'ftk-undo'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = '<span>' + esc(msg) + '</span><button type="button" onclick="window.ftkUndo()">เลิกทำ</button>';
    el.hidden = false;
    clearTimeout(ftkUndoTimer);
    ftkUndoTimer = setTimeout(function () { el.hidden = true; ftkUndoData = null; }, 8000);
  }
  window.ftkUndo = async function () {
    var d = ftkUndoData, el = document.getElementById('ftk-undo');
    ftkUndoData = null; clearTimeout(ftkUndoTimer);
    if (el) el.hidden = true;
    if (!d) return;
    var jobs = [];
    (d.restore || []).forEach(function (s) {
      window.ftkApplyLocal('FORM_ITEMS', s.id, s.row);
      jobs.push(window.updateDoc(window.getDocRef('FORM_ITEMS', s.id), {
        status: s.row.status, owner: s.row.owner, received_date: s.row.received_date, done_date: s.row.done_date, updated_at: s.row.updated_at,
      }));
    });
    (d.remove || []).forEach(function (id) {
      window.FORM_ITEMS = window.FORM_ITEMS.filter(function (i) { return i.id !== id; });
      jobs.push(window.deleteDoc(window.getDocRef('FORM_ITEMS', id)));
    });
    window.renderImplTracker();
    await Promise.all(jobs).catch(window.showDbError);
  };

  // ── ปุ่มขั้นถัดไปในแถว: รอดำเนินการ → "เริ่มทำ" · กำลังดำเนินการ → "เสร็จแล้ว" (กดครั้งเดียว ไม่ต้องเปิด dropdown) ──
  var FTK_NEXT = { not_started: { to: 'in_progress', label: 'เริ่มทำ' }, in_progress: { to: 'done', label: 'เสร็จแล้ว' } };
  window.ftkNextStep = function (itemId) {
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    var nx = item && FTK_NEXT[item.status];
    if (!nx) return;
    ftkUpdateMany([itemId], function () { return { status: nx.to }; }, function () {
      return (nx.to === 'done' ? 'เสร็จแล้ว' : 'เริ่มทำแล้ว') + ' · ' + item.name
        + (!item.receivedDate ? ' (ลงวันที่รับเอกสารเป็นวันนี้ให้แล้ว)' : '');
    });
  };

  window.ftkBulkSet = function (field, value) {
    var st = field === 'status' ? ftkStatus(value).label : '';
    return ftkUpdateMany(ftkSelIds(), function () { var o = {}; o[field] = value; return o; }, function (n) {
      return field === 'status' ? 'เปลี่ยน ' + n + ' รายการเป็น "' + st + '"'
        : field === 'received_date' ? 'ตั้งวันที่รับ ' + fd(value) + ' ให้ ' + n + ' รายการแล้ว'
        : field === 'done_date' ? 'ตั้งวันที่เสร็จ ' + fd(value) + ' ให้ ' + n + ' รายการแล้ว'
        : 'มอบหมายผู้จัดทำ ' + n + ' รายการแล้ว';
    });
  };

  // ── มอบหมายผู้จัดทำทั้งคลังในครั้งเดียว (แทนเลือกทีละแถว) ──
  window.ftkSetGroupOwner = function (groupId, ownerId, selEl) {
    if (selEl) selEl.value = '';
    if (!ownerId) return;
    var v = ownerId === '__none' ? '' : ownerId;
    var ids = ftkItemsOfGroup(groupId).filter(function (i) { return (i.ownerId || '') !== v; }).map(function (i) { return i.id; });
    if (!ids.length) { window.showToast('ทุกแบบฟอร์มในคลังนี้เป็นผู้จัดทำคนนี้อยู่แล้ว', 'info'); return; }
    var g = ftkGroup(groupId);
    ftkUpdateMany(ids, function () { return { owner: v }; }, function (n) {
      return (v ? 'มอบหมาย ' + (window.staffNameByRef(v) || '') : 'ล้างผู้จัดทำ') + ' ' + n + ' รายการใน ' + (g ? g.name : 'คลังนี้');
    });
  };

  // ── "+ ชื่อตามสัญญา": ช่องชื่อตามสัญญาที่ว่างถูกซ่อนไว้ (ไม่เปลืองบรรทัดทุกแถว) กดแล้วค่อยเปิดให้พิมพ์ ──
  window.ftkShowContract = function (btn) {
    var ta = btn.closest('td').querySelector('.ftk-contract-input');
    btn.hidden = true; ta.hidden = false; window.ftkAutoGrow(ta); ta.focus();
  };

  function ftkItemRow(item) {
    return {
      project_id: item.projectId, group_id: item.groupId, form_name: item.name, contract_name: item.contractName, form_type: item.formType,
      status: item.status, owner: item.ownerId, description: item.description, sort_order: item.order,
      received_date: item.receivedDate || null, done_date: item.doneDate || null,
    };
  }

  var FTK_TYPE_SHORT = { form_new: 'ใหม่', form_base: 'ตั้งต้น', form_contract: 'ตามสัญญา' };
  function ftkItemRowHtml(item, idx, staffOpts, canEdit, canDel) {
    var st = ftkStatus(item.status);
    // ผู้จัดทำเดิมที่ไม่อยู่ในทีมโครงการแล้ว ยังต้องแสดงชื่อ ไม่ใช่กลายเป็น "ไม่ระบุ"
    var curOwner = item.ownerId && !staffOpts.some(function (o) { return o.id === item.ownerId; })
      ? [{ id:item.ownerId, label:window.staffNameByRef(item.ownerId) || '(พนักงานที่ถูกลบ)' }] : [];
    var ownerOptsHtml = ['<option value="">— ยังไม่มอบหมาย —</option>'].concat(curOwner.concat(staffOpts).map(function (o) {
      return '<option value="'+esc(o.id)+'"'+(item.ownerId===o.id?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');
    // ── ป้ายประเภทชื่อสั้น (ตั้งต้น/ตามสัญญา/ใหม่) · ตามสัญญาที่มีเลขข้อ โชว์ "สัญญา ข้อ n" ในป้ายเดียว ──
    var cNo = item.formType === 'form_contract' ? window.ftkContractNo(item.contractName) : 9999;
    var formTypeOptsHtml = ['<option value="">ไม่ระบุ</option>'].concat(window.FORM_TYPE.map(function (ft) {
      var lbl = FTK_TYPE_SHORT[ft.id] || ft.label;
      if (ft.id === 'form_contract' && item.formType === ft.id && cNo < 9999) lbl = 'สัญญา ข้อ ' + cNo;
      return '<option value="'+ft.id+'"'+(item.formType===ft.id?' selected':'')+' title="'+esc(ft.label)+'">'+esc(lbl)+'</option>';
    })).join('');
    var statusOptsHtml = window.FORM_STATUS.map(function (s) {
      return '<option value="'+s.id+'"'+(item.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>';
    }).join('');
    var ft = window.FORM_TYPE.find(function (x) { return x.id === item.formType; });
    var ftColor = ft ? ft.color : '#9ba3b8';
    var sel = !!window.ftkSel[item.id];
    // ── ชื่อตามสัญญาใช้เฉพาะประเภท "แบบฟอร์มตามสัญญา" — ประเภทอื่นไม่แสดงช่องนี้เลย ──
    var isContractType = item.formType === 'form_contract';
    var hasContract = isContractType && !!(item.contractName || '').trim();
    var aiMapping = !!window.ftkAiMapping[item.id];
    // ── data-label ทุก td ใช้กับเลย์เอาต์การ์ดบนมือถือ (<768px ซ่อน thead แล้วแสดง label นี้แทน) ──
    return '<tr class="'+(sel?'ftk-row-sel':'')+'">'
      + '<td class="ftk-no" data-label="ลำดับ">'
      +   (canEdit
            ? '<label class="ftk-chk-wrap" title="เลือกเพื่อแก้หลายรายการพร้อมกัน"><input type="checkbox" class="ftk-chk" data-id="'+item.id+'" aria-label="เลือก '+esc(item.name)+'"'+(sel?' checked':'')+' onchange="window.ftkToggleSel(this,\''+item.id+'\')"><span>'+idx+'</span></label>'
            : idx)
      + '</td>'
      // ── ประเภทเป็นคอลัมน์ป้ายสีหน้าชื่อ (เห็นทันทีว่าใบไหนตามสัญญาข้อไหน) ──
      + '<td class="ftk-type-cell" data-label="ประเภท"><select class="ftk-sel ftk-sel-pill ftk-type-pill" aria-label="ประเภท" title="'+esc(ft ? ft.label : 'ไม่ระบุประเภท')+(hasContract ? ' — อยู่ส่วนตามสัญญาของใบส่งมอบ' : '')+'" style="background:'+ftColor+'1f;color:'+ftColor+';" '+(canEdit?'':'disabled')+' onchange="window.ftkSetFormType(\''+item.id+'\',this.value)">'+formTypeOptsHtml+'</select></td>'
      + '<td data-label="แบบฟอร์ม"><textarea class="ftk-name-input" rows="1" aria-label="ชื่อแบบฟอร์ม" '+(canEdit?'':'disabled')+' oninput="window.ftkAutoGrow(this)" onchange="window.ftkSetItemField(\''+item.id+'\',\'form_name\',this.value)">'+esc(item.name)+'</textarea>'
      // ── บรรทัดรองเฉพาะตามสัญญา: ชื่อตามสัญญา (ซ่อนถ้าตรงกับชื่อแบบฟอร์ม) / ปุ่มเติมชื่อตามสัญญา ──
      +   (aiMapping ? '<div class="ftk-sub"><span class="ftk-ai-mapping">🤖 AI กำลังจับคู่ชื่อตามสัญญา…</span></div>'
            : isContractType && !hasContract && canEdit ? '<div class="ftk-sub"><button type="button" class="ftk-add-contract" onclick="window.ftkShowContract(this)">+ ชื่อตามสัญญา</button>'
              + '<button type="button" class="ftk-add-contract" onclick="window.ftkAutoContract(\''+item.id+'\')">🤖 ให้ AI จับคู่</button></div>' : '')
      +   (!isContractType ? '</td>' : '<textarea class="ftk-name-input ftk-contract-input" rows="1" '+(hasContract && ftkNorm(item.contractName) !== ftkNorm(item.name)?'':'hidden ')+(canEdit?'':'disabled')+' placeholder="ชื่อตามสัญญา" aria-label="ชื่อตามสัญญา" title="ชื่อแบบฟอร์มตามสัญญา (ใช้ในใบส่งมอบแบบฟอร์ม)" oninput="window.ftkAutoGrow(this)" onchange="window.ftkSetContractName(\''+item.id+'\',this)">'+esc(item.contractName)+'</textarea></td>')
      // ── สถานะ + ปุ่มขั้นถัดไป (เริ่มทำ / เสร็จแล้ว) กดครั้งเดียว ──
      + '<td data-label="สถานะ"><div class="ftk-st">'
      +   '<select class="ftk-sel ftk-sel-pill" aria-label="สถานะ" style="background:'+st.color+'18;color:'+st.color+';" '+(canEdit?'':'disabled')+' onchange="window.ftkSetItemField(\''+item.id+'\',\'status\',this.value)">'+statusOptsHtml+'</select>'
      +   (canEdit && FTK_NEXT[item.status] ? '<button type="button" class="ftk-next'+(item.status==='in_progress'?' to-done':'')+'" onclick="window.ftkNextStep(\''+item.id+'\')">'+FTK_NEXT[item.status].label+'</button>' : '')
      + '</div></td>'
      + '<td data-label="ผู้จัดทำ"><select class="ftk-sel'+(item.ownerId?'':' ftk-owner-none')+'" aria-label="ผู้จัดทำ" '+(canEdit?'':'disabled')+' onchange="window.ftkSetItemField(\''+item.id+'\',\'owner\',this.value)">'+ownerOptsHtml+'</select></td>'
      // ── วันที่รับเอกสาร + วันที่ดำเนินการ รวมคอลัมน์เดียว — native <input type=date> โชว์ปี ค.ศ. เสมอ จึงซ่อน
      // input จริงแบบโปร่งใสทับเต็มช่องแล้วโชว์ fd() (พ.ศ.) แทน; showPicker() ตอนคลิกที่ไหนก็ได้ในช่อง ──
      // ── บรรทัดเดียว: [วันรับ (แก้ได้)] → [วันเสร็จ] ──
      + '<td data-label="รับ → เสร็จ"><div class="ftk-dates">'
      +   '<div class="ftk-date-picker" title="วันที่รับเอกสาร (เริ่มทำแล้วลงวันนี้ให้อัตโนมัติ)">'
      +     '<input type="date" class="ftk-date-input" aria-label="วันที่รับเอกสาร" value="'+esc(item.receivedDate||'')+'" '+(canEdit?'':'disabled')+' onclick="try{this.showPicker&&this.showPicker();}catch(e){}" onchange="window.ftkSetItemField(\''+item.id+'\',\'received_date\',this.value)">'
      +     '<span class="ftk-date-display'+(item.receivedDate?'':' empty')+'">'+(item.receivedDate ? fd(item.receivedDate) : 'รับ —')+'</span>'
      +   '</div>'
      +   '<span class="ftk-dates-arrow" aria-hidden="true">→</span>'
      +   '<div class="ftk-date-picker" title="วันที่ดำเนินการแล้ว (กดเสร็จแล้วลงวันนี้ให้อัตโนมัติ · ตั้งวันที่ = เปลี่ยนเป็นดำเนินการแล้ว)">'
      +     '<input type="date" class="ftk-date-input" aria-label="วันที่ดำเนินการแล้ว" value="'+esc(item.doneDate||'')+'" '+(canEdit?'':'disabled')+' onclick="try{this.showPicker&&this.showPicker();}catch(e){}" onchange="if(this.value)window.ftkSetItemField(\''+item.id+'\',\'done_date\',this.value)">'
      +     '<span class="ftk-date-display'+(item.doneDate?'':' empty')+'">'+(item.doneDate ? fd(item.doneDate) : '—')+'</span>'
      +   '</div>'
      + '</div></td>'
      + '<td class="ftk-note-cell" data-label="หมายเหตุ"><input class="ftk-note" aria-label="หมายเหตุ" value="'+esc(item.description||'')+'" '+(canEdit?'':'disabled')+' placeholder="—" onchange="window.ftkSetItemField(\''+item.id+'\',\'description\',this.value)"></td>'
      + '<td class="ftk-del-cell" data-label="ลบ">'+(canDel ? '<button class="m-x ftk-del" onclick="window.askDel(\'form_item\',\''+item.id+'\',\''+esc(item.name)+'\')" title="ลบแบบฟอร์ม" aria-label="ลบแบบฟอร์ม">🗑️</button>' : '')+'</td>'
      + '</tr>';
  }

  // ── บันทึกการแก้ไข inline ทีละ field (ประเภท/สถานะ/ผู้จัดทำ/หมายเหตุ/ชื่อ/วันที่) — วันรับ/วันเสร็จลงให้เองใน ftkAutoDates ──
  window.ftkSetItemField = function (itemId, field, value) {
    var overrides = {}; overrides[field] = value; // ผู้จัดทำ = รหัสพนักงาน
    return ftkSetItemFields(itemId, overrides);
  };
  async function ftkSetItemFields(itemId, overrides) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    if (!item) return;
    ftkAutoDates(item, overrides);
    overrides.updated_at = new Date().toISOString();
    window.ftkApplyLocal('FORM_ITEMS', itemId, Object.assign(ftkItemRow(item), overrides));
    window.renderImplTracker();
    await window.updateDoc(window.getDocRef('FORM_ITEMS', itemId), overrides).catch(window.showDbError);
  }

  // ── พิมพ์ชื่อตามสัญญาเอง — ผูก 1:1: ชื่อที่แบบฟอร์มอื่นในโครงการใช้อยู่แล้ว ไม่บันทึก แจ้งว่าผูกกับใบไหน แล้วคืนค่าเดิม ──
  window.ftkSetContractName = function (itemId, el) {
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    if (!item) return;
    var v = el.value.trim();
    var otherId = v && ftkUsedContracts(item.projectId, itemId)[ftkNorm(v)];
    if (otherId) {
      var other = window.FORM_ITEMS.find(function (i) { return i.id === otherId; });
      window.showToast('ชื่อตามสัญญา "' + esc(v) + '" ผูกกับแบบฟอร์ม "' + esc(other ? other.name : '') + '" อยู่แล้ว — แบบฟอร์มตามสัญญาผูกได้ 1 ต่อ 1 เท่านั้น', 'warn');
      el.value = item.contractName || '';
      return;
    }
    return window.ftkSetItemField(itemId, 'contract_name', v);
  };

  // ── เปลี่ยนประเภท: เป็น "แบบฟอร์มตามสัญญา" → ให้ AI จับคู่ชื่อตามสัญญาให้อัตโนมัติ (ถ้ายังไม่มี)
  // ประเภทอื่น → ล้างชื่อตามสัญญาทิ้ง (ไม่งั้นใบส่งมอบยังนับเป็นส่วนตามสัญญาทั้งที่มองไม่เห็นช่องแล้ว) ──
  window.ftkSetFormType = async function (itemId, value) {
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    if (!item) return;
    if (value !== 'form_contract') return ftkSetItemFields(itemId, { form_type: value, contract_name: '' });
    // ── ตามสัญญามีได้ 1 ใบ: แบบฟอร์มชื่อเดียวกัน (หรือ Template ตามสัญญาของชื่อนี้) ถูกผูกในคลังอื่นแล้ว
    // → popup บอกว่าอยู่คลังไหน ไม่บันทึก แล้ว re-render ให้ dropdown กลับเป็นประเภทเดิม ──
    var dup = ftkContractDupOf(item);
    if (dup) {
      var g = ftkGroup(dup.groupId);
      window.showAlert('มีแบบฟอร์มตามสัญญา "' + dup.name + '" แล้ว' + (g ? ' ที่ ' + g.name : '')
        + (dup.contractName ? ' (' + dup.contractName + ')' : '') + ' — แบบฟอร์มตามสัญญามีได้ 1 ใบเท่านั้น', 'warn');
      window.renderImplTracker();
      return;
    }
    // ชื่อตามสัญญาเก่าที่ค้างอยู่ ถ้าแถวอื่นผูกไปแล้ว (1:1) ล้างทิ้งแล้วให้ AI จับคู่ใหม่
    var keep = ftkNorm(item.contractName) && !ftkUsedContracts(item.projectId, itemId)[ftkNorm(item.contractName)];
    await ftkSetItemFields(itemId, keep ? { form_type: value } : { form_type: value, contract_name: '' });
    if (!keep) window.ftkAutoContract(itemId);
  };

  // ── จับคู่ชื่อแบบฟอร์มกับ Template แถบตามสัญญา — เลือกจากใบที่ยังไม่มีใครในโครงการใช้เท่านั้น
  // ชื่อเอกสารตรงกันเป๊ะ = ใช้เลย ไม่ต้องถาม AI · AI ใช้ไม่ได้ = ใช้ใบที่ข้อความคล้ายที่สุด (≥ 0.5) ──
  window.ftkAiMapping = window.ftkAiMapping || {};
  window.ftkAutoContract = async function (itemId) {
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    if (!item || !window.canEdit(window.IMPL_MODULE) || window.ftkAiMapping[itemId]) return;
    var used = ftkUsedContracts(item.projectId, itemId);
    var cands = window.FORM_TEMPLATES.filter(function (t) { return t.kind === 'contract' && t.contractName && ftkTplInScope(t, item.projectId) && !used[ftkNorm(t.contractName)]; })
      .sort(function (a, b) { return window.ftkContractNo(a.contractName) - window.ftkContractNo(b.contractName); });
    if (!cands.length) { window.showToast('ไม่มีชื่อตามสัญญาที่ยังว่าง (Template แถบตามสัญญาถูกใช้ครบแล้ว หรือยังไม่ได้ตั้งไว้)', 'warn'); return; }

    var pick = cands.find(function (t) { return ftkNorm(t.name) === ftkNorm(item.name) || ftkNorm(t.contractName) === ftkNorm(item.name); });
    if (!pick) {
      window.ftkAiMapping[itemId] = true;
      window.renderImplTracker();
      try {
        var list = cands.map(function (t, i) { return i + ') ชื่อเอกสาร: ' + t.name + ' | ชื่อตามสัญญา: ' + t.contractName; }).join('\n');
        var r = await window.aiChatJson(
          'คุณจับคู่ชื่อแบบฟอร์มในโปรแกรมโรงพยาบาลกับรายการแบบฟอร์มตามสัญญา เลือกรายการที่หมายถึงเอกสารเดียวกันที่สุด'
          + ' ตอบเป็น JSON เท่านั้น: {"index": <เลขรายการ>} ถ้าไม่มีรายการไหนตรงเลยให้ตอบ {"index": null}',
          'ชื่อแบบฟอร์ม: ' + item.name + '\n\nรายการตามสัญญา:\n' + list,
          { maxTokens: 60, temperature: 0 });
        var n = r && r.index;
        if (typeof n === 'number' && cands[n]) pick = cands[n];
      } catch (e) {
        var best = null, bestSim = 0;
        cands.forEach(function (t) {
          var s = Math.max(window.aiTextSim(item.name, t.name), window.aiTextSim(item.name, t.contractName));
          if (s > bestSim) { bestSim = s; best = t; }
        });
        if (bestSim >= 0.5) pick = best;
      }
      delete window.ftkAiMapping[itemId];
    }
    var cur = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    // ระหว่างรอ AI แถวอื่นอาจผูกชื่อนี้ไปก่อนแล้ว (เปลี่ยนประเภทหลายแถวพร้อมกัน) — 1:1 จึงไม่ใช้ซ้ำ
    if (pick && ftkUsedContracts(item.projectId, itemId)[ftkNorm(pick.contractName)]) pick = null;
    // ระหว่างรอ AI ผู้ใช้อาจเปลี่ยนประเภทกลับหรือพิมพ์ชื่อเองไปแล้ว — ไม่ทับ
    if (!pick || !cur || cur.formType !== 'form_contract' || (cur.contractName || '').trim()) {
      window.renderImplTracker();
      if (!pick && cur && cur.formType === 'form_contract') window.showToast('AI หาชื่อตามสัญญาที่ตรงกับ "' + esc(item.name) + '" ไม่เจอ — กด "+ ชื่อตามสัญญา" เพื่อพิมพ์เอง', 'warn');
      return;
    }
    await ftkSetItemFields(itemId, { contract_name: pick.contractName });
    window.showToast('AI จับคู่ชื่อตามสัญญา: ' + esc(pick.contractName), 'success');
  };

  // ── เพิ่มแบบฟอร์มใหม่แบบเร็ว (พิมพ์ชื่อ + Enter) — ค่าเริ่มต้นประเภทเป็น "แบบฟอร์มใหม่" แก้ได้ทีหลังจาก dropdown ──
  window.ftkQuickAddItem = async function (inputEl, groupId, projectId) {
    var name = inputEl.value.trim();
    if (!name || !window.canAdd(window.IMPL_MODULE)) return;
    var id = window.ftkUid('FIT');
    var row = {
      project_id: projectId, group_id: groupId, form_name: name, form_type: 'form_new',
      status: 'not_started', owner: '', description: '',
      sort_order: ftkItemsOfGroup(groupId).length + 1, updated_at: new Date().toISOString(),
    };
    inputEl.value = '';
    window.ftkApplyLocal('FORM_ITEMS', id, row);
    window.renderImplTracker();
    await window.setDoc(window.getDocRef('FORM_ITEMS', id), row).catch(window.showDbError);
  };

  // ── เพิ่มคลังใหม่แบบเร็ว (พิมพ์ชื่อ + Enter) ──
  window.ftkQuickAddGroup = async function (inputEl, projectId) {
    var name = inputEl.value.trim();
    if (!name || !window.canAdd(window.IMPL_MODULE)) return;
    var id = window.ftkUid('FGR');
    var row = { project_id: projectId, group_name: name, sort_order: ftkGroupsOf(projectId).length + 1 };
    inputEl.value = '';
    window.ftkApplyLocal('FORM_GROUPS', id, row);
    window.renderImplTracker();
    await window.setDoc(window.getDocRef('FORM_GROUPS', id), row).catch(window.showDbError);
  };

  // ── แก้ไขชื่อคลัง (inline) — ชื่อว่างไม่บันทึก แค่ re-render กลับเป็นชื่อเดิม ──
  window.ftkRenameGroup = async function (groupId, value) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var name = value.trim();
    if (!name) { window.renderImplTracker(); return; }
    var g = ftkGroup(groupId);
    if (!g || g.name === name) return;
    window.ftkApplyLocal('FORM_GROUPS', groupId, { project_id: g.projectId, group_name: name, sort_order: g.order });
    window.renderImplTracker();
    await window.updateDoc(window.getDocRef('FORM_GROUPS', groupId), { group_name: name }).catch(window.showDbError);
  };

  // ================================================================
  // TEMPLATE — รายชื่อเอกสารแบบฟอร์ม (ไม่ผูก project/group) ตั้งไว้ล่วงหน้าแล้ว
  // ดึงมาเพิ่มเป็นแบบฟอร์มในคลังไหนก็ได้แบบเร็ว (ติ๊กเลือกหลายรายการพร้อมกัน) แทนพิมพ์เองทีละใบ
  // แยก 2 รายการไม่ปนกันตาม kind: 'standard' = แบบฟอร์มมาตรฐาน (ชื่อเอกสารอย่างเดียว) ·
  // 'contract' = แบบฟอร์มตามสัญญา (ชื่อเอกสาร + ชื่อแบบฟอร์มตามสัญญา) — เพิ่มในแถบไหน = เป็นชนิดนั้น
  // ดึงไปใช้ได้ประเภท form_base / form_contract ตามลำดับ (ตามสัญญาติดชื่อตามสัญญาไปด้วย)
  // ผูกประเภทโครงการได้ 1 ประเภท (ptype_id = PTYPES.id) · ว่าง = ใช้ร่วมทุกประเภท — โครงการใช้ได้เฉพาะ Template
  // ประเภทเดียวกับโครงการต้นทาง + ใช้ร่วม (ตอนดึงไปใช้ / เทียบชุดตามสัญญา / AI จับคู่ชื่อตามสัญญา)
  // ================================================================
  var FTK_TPL_KINDS = [
    { id:'standard', icon:'📋', label:'แบบฟอร์มมาตรฐาน', formType:'form_base' },
    { id:'contract', icon:'📑', label:'แบบฟอร์มตามสัญญา', formType:'form_contract' },
  ];
  function ftkTplKind(id) { return FTK_TPL_KINDS.find(function (k) { return k.id === id; }) || FTK_TPL_KINDS[0]; }
  function ftkTemplatesOf(kind) {
    // ── ตามสัญญาเรียงตามเลขหน้าชื่อตามสัญญา (1→n เหมือนใบส่งมอบ) · ที่ยังไม่มีเลขต่อท้ายตามลำดับที่เพิ่ม ──
    return window.FORM_TEMPLATES.filter(function (t) { return t.kind === kind; }).sort(function (a,b) {
      return (kind === 'contract' ? window.ftkContractNo(a.contractName) - window.ftkContractNo(b.contractName) : 0) || a.order - b.order;
    });
  }
  // ── ประเภทของ impl project = ประเภทของโครงการต้นทาง (ไม่มีต้นทาง/ไม่ระบุ = '') ──
  function ftkProjTypeId(pid) { var p = pid && window.imtProject(pid), s = p && p.source; return (s && s.typeId) || ''; }
  // ── Template ที่โครงการใช้ได้: ใช้ร่วม + ประเภทเดียวกับโครงการ ──
  function ftkTplInScope(t, pid) { return !t.ptypeId || t.ptypeId === ftkProjTypeId(pid); }
  function ftkPtype(id) { return (window.PTYPES || []).find(function (p) { return p.id === id; }); }
  function ftkPtypeLabel(id) { var p = id && ftkPtype(id); return !id ? 'ใช้ร่วมทุกประเภท' : p ? p.label : 'ประเภทที่ถูกลบแล้ว'; }
  function ftkPtypeColor(id) { var p = id && ftkPtype(id); return (p && p.color) || 'var(--txt3)'; }
  // ── กลุ่มประเภทในรายการ: (ประเภทที่ให้ขึ้นก่อน) → ใช้ร่วม → ตามลำดับ PTYPES → ประเภทที่ถูกลบแล้วแต่ยังมี Template ค้าง ──
  function ftkTplSectionIds(firstId) {
    var ids = [''].concat((window.PTYPES || []).map(function (p) { return p.id; }));
    window.FORM_TEMPLATES.forEach(function (t) { if (t.ptypeId && ids.indexOf(t.ptypeId) === -1) ids.push(t.ptypeId); });
    return firstId ? [firstId].concat(ids.filter(function (x) { return x !== firstId; })) : ids;
  }
  function ftkPtypeOpts(sel) {
    var ids = ftkTplSectionIds('');
    if (sel && ids.indexOf(sel) === -1) ids.push(sel);
    return ids.map(function (id) { return '<option value="'+esc(id)+'"'+(id===sel?' selected':'')+'>'+esc(ftkPtypeLabel(id))+'</option>'; }).join('');
  }
  // ── ห้ามชื่อซ้ำในชนิดเดียวกันที่โครงการเดียวกันเห็นพร้อมกันได้ (ประเภทเดียวกัน หรือฝั่งใดฝั่งหนึ่งเป็นใช้ร่วม) ──
  function ftkTplNameTaken(kind, ptypeId, name, exceptId) {
    var n = name.trim().toLowerCase();
    return window.FORM_TEMPLATES.some(function (t) {
      return t.kind === kind && t.id !== exceptId && (!t.ptypeId || !ptypeId || t.ptypeId === ptypeId) && t.name.trim().toLowerCase() === n;
    });
  }
  function ftkTplRow(t, patch) {
    return Object.assign({ name: t.name, kind: t.kind, contract_name: t.contractName, ptype_id: t.ptypeId, sort_order: t.order, created_at: t.createdAt }, patch);
  }
  function ftkTplQ(t) { return (t.name + ' ' + (t.contractName || '')).toLowerCase(); }
  var FTK_ENTER_BLUR = 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"';

  // ── เปิด modal — ส่ง groupId มาด้วย = โหมด "ดึงมาใช้" (มีติ๊กเลือก+ปุ่มนำเข้า), ไม่ส่ง = โหมดจัดการรายชื่ออย่างเดียว ──
  window.openFtkTemplateModal = function (groupId) {
    window.ftkTemplatePickGroupId = groupId || null;
    window.ftkTplShowAll = false;
    renderFtkTemplateModal();
    window.openM('m-ftk-template');
  };

  function renderFtkTemplateModal() {
    var pickMode = !!window.ftkTemplatePickGroupId;
    var canAdd = window.canAdd(window.IMPL_MODULE) && !pickMode;
    var canDel = window.canDel(window.IMPL_MODULE) && !pickMode;
    var canEdit = window.canEdit(window.IMPL_MODULE) && !pickMode;
    var tab = ftkTplKind(window.ftkTplTab).id;
    var projType = pickMode ? ftkProjTypeId(window.imtCurrentProjectId) : '';
    var secIds = ftkTplSectionIds(projType);
    var existingNames = pickMode
      ? ftkItemsOfGroup(window.ftkTemplatePickGroupId).map(function (i) { return i.name.trim().toLowerCase(); })
      : [];
    var usedContracts = pickMode ? ftkUsedContracts(window.imtCurrentProjectId) : {};
    // ── ส่วนที่แยกตามแถบ (ช่องเพิ่ม/หัวคอลัมน์/รายการ) render ไว้ครบทั้ง 2 ชุด สลับแถบ/ประเภทแค่ซ่อน/แสดง
    // — รายการที่ติ๊กไว้/คำค้นไม่หายตอนสลับ ──
    function kindAttr(k) { return ' data-kind="'+k+'"'+(k===tab?'':' hidden'); }

    var lists = FTK_TPL_KINDS.map(function (k) {
      var isC = k.id === 'contract';
      var all = ftkTemplatesOf(k.id);
      // ── จัดเป็นกลุ่มตามประเภทโครงการ เลขลำดับนับใหม่ในแต่ละกลุ่ม ──
      var secs = secIds.map(function (pt) {
        var tpls = all.filter(function (t) { return t.ptypeId === pt; });
        if (!tpls.length) return '';
        var rows = tpls.map(function (t, idx) {
          // ตามสัญญาผูก 1:1 — ชื่อตามสัญญาที่มีแบบฟอร์มในโครงการผูกไว้แล้ว ดึงซ้ำไม่ได้ (แม้อยู่คนละคลัง)
          var bound = isC && pickMode && !!usedContracts[ftkNorm(t.contractName)];
          var already = bound || existingNames.indexOf(t.name.trim().toLowerCase()) !== -1;
          // ── มาตรฐาน: ชื่อเอกสารคอลัมน์เดียว · ตามสัญญา: ชื่อเอกสาร (ชื่อในโปรแกรม) | ชื่อแบบฟอร์มตามสัญญา ──
          var nameCell, cCell = '', ptCell = '';
          if (canEdit) {
            nameCell = '<textarea class="ftk-tpl-name" rows="1" aria-label="ชื่อเอกสาร" placeholder="— ยังไม่ระบุ —" oninput="window.ftkAutoGrow(this)" '+FTK_ENTER_BLUR+' onchange="window.ftkSetTemplateName(\''+t.id+'\',this)">'+esc(t.name)+'</textarea>';
            if (isC) cCell = '<textarea class="ftk-tpl-name ftk-tpl-cname" rows="1" aria-label="ชื่อแบบฟอร์มตามสัญญา" placeholder="— ยังไม่ระบุ —" oninput="window.ftkAutoGrow(this)" '+FTK_ENTER_BLUR+' onchange="window.ftkSetTemplateContract(\''+t.id+'\',this)">'+esc(t.contractName)+'</textarea>';
            ptCell = '<select class="ftk-tpl-pt" aria-label="ประเภทโครงการ" title="ย้ายไปประเภทโครงการอื่น" onchange="window.ftkSetTemplatePtype(\''+t.id+'\',this)">'+ftkPtypeOpts(pt)+'</select>';
          } else {
            nameCell = '<span class="ftk-tpl-text">'+esc(t.name)+(bound?' <small>(ผูกกับแบบฟอร์มในโครงการแล้ว)</small>':already?' <small>(มีอยู่แล้ว)</small>':'')+'</span>';
            if (isC) cCell = '<span class="ftk-tpl-text ftk-tpl-ctext">'+(esc(t.contractName)||'—')+'</span>';
          }
          var cells = nameCell + cCell + ptCell;
          // ── โหมดดึงมาใช้: ห่อทั้งแถวด้วย label + ช่องติ๊ก คลิกตรงไหนก็ติ๊กได้ ──
          if (pickMode) cells = '<label class="ftk-tpl-chklbl"><input type="checkbox" class="ftk-tpl-chk" data-id="'+esc(t.id)+'" '+(already?'disabled checked':'')+' onchange="window.ftkTplSelChanged()">'+cells+'</label>';
          if (canDel) cells += '<button class="ftk-tpl-del" onclick="window.askDel(\'form_template\',\''+t.id+'\',\''+esc(t.name)+'\')" title="ลบ">🗑️</button>';
          // ── โหมดจัดการ: เลขลำดับกลายเป็นช่องติ๊กตอนชี้ — เลือกหลายรายการเพื่อย้ายประเภทพร้อมกัน ──
          var no = canEdit
            ? '<label class="ftk-tpl-no ftk-tpl-no-chk" title="เลือกเพื่อย้ายประเภทหลายรายการพร้อมกัน"><input type="checkbox" class="ftk-tpl-mchk" data-id="'+esc(t.id)+'" aria-label="เลือก" onchange="window.ftkTplSelChanged()"><span>'+(idx+1)+'</span></label>'
            : '<span class="ftk-tpl-no">'+(idx+1)+'</span>';
          return '<div class="ftk-tpl-row'+(already?' ftk-tpl-row-dim':'')+'" data-q="'+esc(ftkTplQ(t))+'">' + no + cells + '</div>';
        }).join('');
        var secChk = pickMode || canEdit
          ? '<input type="checkbox" class="ftk-tpl-secchk" aria-label="เลือกทั้งหมดในกลุ่มนี้" title="เลือกทั้งหมดในกลุ่มนี้" onchange="window.ftkTplCheckSection(this)">' : '';
        return '<div class="ftk-tpl-sec" data-pt="'+esc(pt)+'" style="--pt:'+ftkPtypeColor(pt)+'">'
          + '<div class="ftk-tpl-sec-head">'+secChk+'<span class="ftk-tpl-dot"></span>'
          +   '<span class="ftk-tpl-sec-name">'+(pt && pt === projType ? 'เฉพาะ ' : '')+esc(ftkPtypeLabel(pt))+'</span>'
          +   '<span class="ftk-tpl-cnt">'+tpls.length+'</span></div>'
          + rows + '</div>';
      }).join('');
      return '<div class="ftk-tpl-list"'+kindAttr(k.id)+'>'+secs
        + '<div class="ftk-tpl-empty" hidden>ยังไม่มี'+k.label+'ในกลุ่มนี้'+(canAdd?' — กรอกชื่อด้านบนเพื่อเพิ่ม':'')+'</div></div>';
    }).join('');

    var tabsHtml = '<div class="ftk-tpl-tabs">' + FTK_TPL_KINDS.map(function (k) {
      return '<button class="ftk-tpl-tab'+(k.id===tab?' on':'')+'" data-kind="'+k.id+'" onclick="window.ftkSetTplTab(\''+k.id+'\')">'
        + k.icon+' '+k.label+' <span class="ftk-tpl-cnt">0</span></button>';
    }).join('') + '</div>';
    // ── ช่องเพิ่ม: ชื่อเอกสารช่องเดียวทั้ง 2 แถบ — ชื่อตามสัญญาไปกรอกในแถวทีหลัง · ผูกประเภทที่เลือกอยู่ด้านซ้าย ──
    var addEnter = 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddTemplate(this);}"';
    var adds = !canAdd ? '' : FTK_TPL_KINDS.map(function (k) {
      return '<div class="ftk-tpl-add"'+kindAttr(k.id)+'>'
        + '<input class="f-input ftk-tpl-add-name" placeholder="+ ชื่อเอกสาร แล้วกด Enter" '+addEnter+'>'
        + '</div>';
    }).join('');
    var heads = FTK_TPL_KINDS.map(function (k) {
      return '<div class="ftk-tpl-head"'+kindAttr(k.id)+'><span class="ftk-tpl-no">#</span>'
        + '<span class="ftk-tpl-head-name">ชื่อเอกสาร</span>'
        + (k.id === 'contract' ? '<span class="ftk-tpl-head-name">ชื่อแบบฟอร์มตามสัญญา</span>' : '')
        + (canEdit ? '<span class="ftk-tpl-head-pt">ประเภทโครงการ</span>' : '')
        + (canDel ? '<span class="ftk-tpl-head-del"></span>' : '') + '</div>';
    }).join('');
    // ── โหมดจัดการ: แถบเลือกหลายรายการ → ย้ายประเภทพร้อมกัน ──
    var bulk = !canEdit ? '' : '<div class="ftk-tpl-bulk" hidden><span>เลือก <b class="ftk-tpl-bulk-n">0</b> รายการ</span>'
      + '<select class="t-sel" aria-label="ย้ายไปประเภทโครงการ" onchange="window.ftkTplBulkPtype(this)"><option value="__none">ย้ายไปประเภท...</option>'+ftkPtypeOpts(null)+'</select>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.ftkTplClearSel()">ยกเลิก</button></div>';
    // ── โหมดดึงมาใช้: บอกว่ากรองตามประเภทไหน + เปิดดูประเภทอื่นได้ ──
    var scope = !pickMode ? '' : '<div class="ftk-tpl-scope"><span>'
      + (projType
        ? 'แสดง Template ของ <b style="color:'+ftkPtypeColor(projType)+'">'+esc(ftkPtypeLabel(projType))+'</b> + ใช้ร่วมทุกประเภท'
        : 'โครงการนี้ยังไม่ระบุประเภท — แสดงเฉพาะ Template ใช้ร่วมทุกประเภท')
      + '</span><label class="ftk-tpl-showall"><input type="checkbox"'+(window.ftkTplShowAll?' checked':'')+' onchange="window.ftkTplToggleAll(this.checked)"> แสดงประเภทอื่นด้วย</label></div>';
    // ── โหมดจัดการ: รายการประเภทโครงการด้านซ้าย (มือถือเป็นแถบเลื่อนแนวนอน) ──
    var side = pickMode ? '' : '<nav class="ftk-tpl-side" aria-label="ประเภทโครงการ"><div class="ftk-tpl-side-title">ประเภทโครงการ</div>'
      + ['__all'].concat(secIds).map(function (pt) {
        var lbl = pt === '__all' ? 'ทั้งหมด' : pt ? ftkPtypeLabel(pt) : 'ใช้ร่วมทุกประเภท';
        return '<button type="button" class="ftk-tpl-side-item" data-pt="'+esc(pt)+'" style="--pt:'+(pt==='__all'?'var(--txt)':ftkPtypeColor(pt))+'" onclick="window.ftkSetTplType(this.dataset.pt)">'
          + '<span class="ftk-tpl-dot'+(pt==='__all'?' all':'')+'"></span><span class="ftk-tpl-side-name">'+esc(lbl)+'</span><span class="ftk-tpl-cnt">0</span></button>';
      }).join('') + '</nav>';
    // ── แถบบน (แถบสลับ + ค้นหา/ช่องเพิ่มแถวเดียวกัน + หัวคอลัมน์) ติดหัว modal ตอนเลื่อน ──
    var toolbar = '<div class="ftk-tpl-toolbar">' + tabsHtml + scope
      + '<div class="ftk-tpl-tools"><input class="f-input ftk-tpl-search" placeholder="🔍 ค้นหาชื่อเอกสาร / ชื่อตามสัญญา..." value="'+esc(window.ftkTplQuery||'')+'" oninput="window.ftkFilterTemplates(this.value)">' + adds + '</div>'
      + bulk + heads + '</div>';
    document.getElementById('m-ftk-template-body').innerHTML = '<div class="ftk-tpl-layout'+(pickMode?' pick':'')+'">' + side
      + '<div class="ftk-tpl-main">' + toolbar + lists
      + '<div class="ftk-tpl-nomatch" style="display:none;">ไม่พบรายการที่ค้นหา</div></div></div>';
    window.ftkFilterTemplates(window.ftkTplQuery || '');
    window.ftkTplSelChanged();
    // ── ปรับความสูงช่องชื่อหลัง modal แสดงผลแล้ว (ตอน render ยังซ่อนอยู่ scrollHeight = 0) ──
    requestAnimationFrame(function () { document.querySelectorAll('#m-ftk-template-body .ftk-tpl-name').forEach(window.ftkAutoGrow); });
    document.getElementById('m-ftk-template-title').textContent = pickMode ? 'ดึงแบบฟอร์มจาก Template' : 'จัดการ Template ชื่อเอกสาร';
    var importBtn = document.getElementById('m-ftk-template-import');
    if (importBtn) importBtn.style.display = pickMode ? '' : 'none';
  }
  window.renderFtkTemplateModal = renderFtkTemplateModal; // ── ให้ modals.js เรียก refresh หลังลบรายการได้ ──

  // ── สลับแถบแบบไม่ render ใหม่ (ช่องติ๊ก/คำค้นคงอยู่) ──
  window.ftkSetTplTab = function (kind) {
    window.ftkTplTab = kind;
    var body = document.getElementById('m-ftk-template-body');
    body.querySelectorAll('.ftk-tpl-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.kind === kind); });
    body.querySelectorAll('.ftk-tpl-list, .ftk-tpl-add, .ftk-tpl-head').forEach(function (el) { el.hidden = el.dataset.kind !== kind; });
    window.ftkFilterTemplates(window.ftkTplQuery || '');
    requestAnimationFrame(function () { body.querySelectorAll('.ftk-tpl-list:not([hidden]) .ftk-tpl-name').forEach(window.ftkAutoGrow); });
  };
  // ── เลือกประเภทด้านซ้าย (โหมดจัดการ) · '__all' = ทั้งหมด, '' = ใช้ร่วม ──
  window.ftkSetTplType = function (pt) {
    window.ftkTplType = pt;
    window.ftkFilterTemplates(window.ftkTplQuery || '');
    var body = document.getElementById('m-ftk-template-body');
    requestAnimationFrame(function () { body.querySelectorAll('.ftk-tpl-list:not([hidden]) .ftk-tpl-name').forEach(window.ftkAutoGrow); });
  };
  window.ftkTplToggleAll = function (on) {
    window.ftkTplShowAll = on;
    window.ftkFilterTemplates(window.ftkTplQuery || '');
  };

  // ── ค้นหา + กรองตามประเภท แบบซ่อน/แสดงแถวเดิม ไม่ render ใหม่ (ช่องที่กำลังพิมพ์อยู่ไม่หลุด) — จำคำค้นไว้ให้คงอยู่หลังเพิ่ม/ลบ
  // นับจำนวนบนแถบ/รายการประเภทใหม่ตามที่มองเห็น ──
  window.ftkFilterTemplates = function (q) {
    window.ftkTplQuery = q;
    var s = (q || '').trim().toLowerCase();
    var body = document.getElementById('m-ftk-template-body');
    var pick = !!window.ftkTemplatePickGroupId, projType = pick ? ftkProjTypeId(window.imtCurrentProjectId) : '';
    var sel = window.ftkTplType == null ? '__all' : window.ftkTplType;
    if (!pick && !body.querySelector('.ftk-tpl-side-item[data-pt="'+sel+'"]')) sel = window.ftkTplType = '__all';
    function secOn(pt) { return pick ? (window.ftkTplShowAll || !pt || pt === projType) : (sel === '__all' || sel === pt); }
    var cnt = {}, active = { inScope: 0, shown: 0 };
    body.querySelectorAll('.ftk-tpl-list').forEach(function (list) {
      var inScope = 0, shown = 0;
      list.querySelectorAll('.ftk-tpl-sec').forEach(function (sec) {
        var on = secOn(sec.dataset.pt), rows = sec.querySelectorAll('.ftk-tpl-row'), n = 0;
        rows.forEach(function (r) {
          var hit = !s || r.dataset.q.indexOf(s) !== -1;
          r.style.display = hit ? '' : 'none';
          if (hit) n++;
        });
        sec.hidden = !on || !n;
        if (on) { inScope += rows.length; shown += n; }
        if (!list.hidden) cnt[sec.dataset.pt] = rows.length;
      });
      list.querySelector('.ftk-tpl-empty').hidden = inScope > 0;
      var tabCnt = body.querySelector('.ftk-tpl-tab[data-kind="'+list.dataset.kind+'"] .ftk-tpl-cnt');
      if (tabCnt) tabCnt.textContent = inScope;
      if (!list.hidden) active = { inScope: inScope, shown: shown };
    });
    var total = 0;
    Object.keys(cnt).forEach(function (k) { total += cnt[k]; });
    body.querySelectorAll('.ftk-tpl-side-item').forEach(function (b) {
      var pt = b.dataset.pt;
      b.classList.toggle('on', pt === sel);
      b.querySelector('.ftk-tpl-cnt').textContent = pt === '__all' ? total : (cnt[pt] || 0);
    });
    body.querySelectorAll('.ftk-tpl-add-name').forEach(function (inp) {
      inp.placeholder = '+ ชื่อเอกสาร' + (sel !== '__all' && sel ? ' ('+ftkPtypeLabel(sel)+')' : sel === '' ? ' (ใช้ร่วมทุกประเภท)' : '') + ' แล้วกด Enter';
    });
    var nm = body.querySelector('.ftk-tpl-nomatch');
    if (nm) nm.style.display = s && !active.shown && active.inScope ? '' : 'none';
  };

  // ── ช่องติ๊กทั้งกลุ่มประเภท — ติ๊ก/เอาออกเฉพาะแถวที่มองเห็น (ตามคำค้น) ──
  window.ftkTplCheckSection = function (cb) {
    cb.closest('.ftk-tpl-sec').querySelectorAll('.ftk-tpl-row').forEach(function (r) {
      if (r.style.display === 'none') return;
      var c = r.querySelector('.ftk-tpl-chk:not(:disabled), .ftk-tpl-mchk');
      if (c) c.checked = cb.checked;
    });
    window.ftkTplSelChanged();
  };
  // ── อัปเดตจำนวนที่เลือก: โหมดจัดการ = แถบย้ายประเภท · โหมดดึงมาใช้ = ตัวเลขบนปุ่มนำเข้า ──
  window.ftkTplSelChanged = function () {
    var body = document.getElementById('m-ftk-template-body');
    var n = body.querySelectorAll('.ftk-tpl-mchk:checked').length;
    var bulk = body.querySelector('.ftk-tpl-bulk');
    if (bulk) { bulk.hidden = !n; bulk.querySelector('.ftk-tpl-bulk-n').textContent = n; }
    body.classList.toggle('ftk-tpl-selecting', n > 0);
    var importBtn = document.getElementById('m-ftk-template-import');
    if (importBtn && window.ftkTemplatePickGroupId) {
      var p = body.querySelectorAll('.ftk-tpl-chk:checked:not(:disabled)').length;
      importBtn.textContent = p ? '📥 นำเข้า ' + p + ' รายการ' : '📥 นำเข้ารายการที่เลือก';
    }
  };
  window.ftkTplClearSel = function () {
    document.querySelectorAll('#m-ftk-template-body .ftk-tpl-mchk, #m-ftk-template-body .ftk-tpl-secchk').forEach(function (c) { c.checked = false; });
    window.ftkTplSelChanged();
  };

  window.ftkQuickAddTemplate = async function (inputEl) {
    if (!window.canAdd(window.IMPL_MODULE)) return;
    var box = inputEl.closest('.ftk-tpl-add');
    var kind = ftkTplKind(box.dataset.kind).id;
    var pt = window.ftkTplType && window.ftkTplType !== '__all' ? window.ftkTplType : '';
    var name = inputEl.value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    if (ftkTplNameTaken(kind, pt, name)) {
      window.showToast('มีชื่อเอกสาร "'+esc(name)+'" ใน'+ftkTplKind(kind).label+'ที่ใช้กับประเภทนี้อยู่แล้ว', 'warn');
      return;
    }
    var id = window.ftkUid('FTL');
    var row = { name: name, kind: kind, ptype_id: pt, sort_order: ftkTemplatesOf(kind).length + 1 };
    window.ftkApplyLocal('FORM_TEMPLATES', id, row);
    renderFtkTemplateModal();
    var next = document.querySelector('#m-ftk-template-body .ftk-tpl-add:not([hidden]) .ftk-tpl-add-name');
    if (next) next.focus(); // ── พิมพ์รายการถัดไปต่อได้เลย ──
    await window.setDoc(window.getDocRef('FORM_TEMPLATES', id), row).catch(window.showDbError);
  };

  window.ftkAutoGrow = function (el) { el.style.height = ''; el.style.height = el.scrollHeight + 'px'; };

  // ── แก้ชื่อ Template: ห้ามว่าง/ห้ามซ้ำในชนิดเดียวกัน (ถ้าไม่ผ่านคืนค่าเดิม) — มีผลกับการดึงไปใช้ครั้งต่อไปเท่านั้น
  // แบบฟอร์มที่ดึงไปในโครงการแล้วเป็นสำเนา ไม่เปลี่ยนตาม ──
  window.ftkSetTemplateName = async function (tplId, el) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var t = window.FORM_TEMPLATES.find(function (x) { return x.id === tplId; });
    if (!t) return;
    var v = el.value.replace(/\s+/g, ' ').trim();
    var dup = v && ftkTplNameTaken(t.kind, t.ptypeId, v, tplId);
    if (!v || dup) {
      el.value = t.name; window.ftkAutoGrow(el);
      if (dup) window.showToast('มีชื่อเอกสาร "'+esc(v)+'" ใน'+ftkTplKind(t.kind).label+'ที่ใช้กับประเภทนี้อยู่แล้ว', 'warn');
      return;
    }
    if (v === t.name) return;
    el.value = v;
    window.ftkApplyLocal('FORM_TEMPLATES', tplId, ftkTplRow(t, { name: v }));
    el.closest('.ftk-tpl-row').dataset.q = ftkTplQ(window.FORM_TEMPLATES.find(function (x) { return x.id === tplId; }));
    await window.updateDoc(window.getDocRef('FORM_TEMPLATES', tplId), { name: v }).catch(window.showDbError);
  };

  // ── แก้ชื่อแบบฟอร์มตามสัญญา (เฉพาะ kind='contract') — ว่างได้ ──
  window.ftkSetTemplateContract = async function (tplId, el) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var t = window.FORM_TEMPLATES.find(function (x) { return x.id === tplId; });
    if (!t) return;
    var v = el.value.replace(/\s+/g, ' ').trim();
    el.value = v; window.ftkAutoGrow(el);
    if (v === t.contractName) return;
    window.ftkApplyLocal('FORM_TEMPLATES', tplId, ftkTplRow(t, { contract_name: v }));
    el.closest('.ftk-tpl-row').dataset.q = ftkTplQ(window.FORM_TEMPLATES.find(function (x) { return x.id === tplId; }));
    await window.updateDoc(window.getDocRef('FORM_TEMPLATES', tplId), { contract_name: v }).catch(window.showDbError);
  };

  // ── ย้าย Template ไปประเภทโครงการอื่น (1 ประเภท / ว่าง = ใช้ร่วม) — ชื่อชนกับรายการที่ประเภทปลายทางเห็นอยู่ = ไม่ย้าย ──
  function ftkTplMovable(t, pt) { return t && t.ptypeId !== pt && !ftkTplNameTaken(t.kind, pt, t.name, t.id); }
  window.ftkSetTemplatePtype = async function (tplId, el) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var t = window.FORM_TEMPLATES.find(function (x) { return x.id === tplId; });
    var pt = el.value;
    if (!t || t.ptypeId === pt) return;
    if (!ftkTplMovable(t, pt)) {
      el.value = t.ptypeId;
      window.showToast('ย้ายไม่ได้ — มีชื่อเอกสาร "'+esc(t.name)+'" ที่ใช้กับ '+esc(ftkPtypeLabel(pt))+' อยู่แล้ว', 'warn');
      return;
    }
    window.ftkApplyLocal('FORM_TEMPLATES', tplId, ftkTplRow(t, { ptype_id: pt }));
    renderFtkTemplateModal();
    await window.updateDoc(window.getDocRef('FORM_TEMPLATES', tplId), { ptype_id: pt }).catch(window.showDbError);
  };
  window.ftkTplBulkPtype = async function (sel) {
    var pt = sel.value;
    sel.value = '__none';
    if (pt === '__none' || !window.canEdit(window.IMPL_MODULE)) return;
    var ids = Array.prototype.map.call(document.querySelectorAll('#m-ftk-template-body .ftk-tpl-mchk:checked'), function (c) { return c.dataset.id; });
    var moved = [], skipped = 0;
    ids.forEach(function (id) {
      var t = window.FORM_TEMPLATES.find(function (x) { return x.id === id; });
      if (!t || t.ptypeId === pt) return;
      if (!ftkTplMovable(t, pt)) { skipped++; return; }
      window.ftkApplyLocal('FORM_TEMPLATES', id, ftkTplRow(t, { ptype_id: pt }));
      moved.push(id);
    });
    renderFtkTemplateModal();
    window.showToast('ย้าย '+moved.length+' รายการไป '+esc(ftkPtypeLabel(pt))+(skipped ? ' · ข้าม '+skipped+' รายการที่ชื่อซ้ำกับประเภทปลายทาง' : ''), skipped ? 'warn' : 'success');
    for (var i = 0; i < moved.length; i++) {
      await window.updateDoc(window.getDocRef('FORM_TEMPLATES', moved[i]), { ptype_id: pt }).catch(window.showDbError);
    }
  };

  // ── นำเข้ารายการที่ติ๊กไว้ (ติ๊กได้ทั้ง 2 แถบในครั้งเดียว) เป็นแบบฟอร์มใหม่ในคลังปลายทาง — ประเภทตามชนิด Template:
  // มาตรฐาน → "แบบฟอร์มตั้งต้น" (form_base) · ตามสัญญา → "แบบฟอร์มตามสัญญา" (form_contract) + ชื่อตามสัญญาติดไปด้วย
  // ให้ต่างจากรายการที่พิมพ์เพิ่มเองแบบเร็ว (form_new) ตั้งแต่แรกโดยไม่ต้องเปลี่ยนทีหลัง ──
  window.ftkImportFromTemplate = async function () {
    var groupId = window.ftkTemplatePickGroupId, pid = window.imtCurrentProjectId;
    if (!groupId || !pid || !window.canAdd(window.IMPL_MODULE)) return;
    var checked = Array.prototype.slice.call(document.querySelectorAll('.ftk-tpl-chk:checked:not(:disabled)'));
    if (!checked.length) return;
    var startOrder = ftkItemsOfGroup(groupId).length, used = ftkUsedContracts(pid);
    for (var i = 0; i < checked.length; i++) {
      var tpl = window.FORM_TEMPLATES.find(function (t) { return t.id === checked[i].dataset.id; });
      if (!tpl) continue;
      // ตามสัญญาผูก 1:1 — ข้ามใบที่ชื่อตามสัญญาถูกผูกไปแล้ว (Template 2 ใบชื่อตามสัญญาซ้ำกันก็เอาแค่ใบแรก)
      if (tpl.kind === 'contract' && tpl.contractName) {
        if (used[ftkNorm(tpl.contractName)]) continue;
        used[ftkNorm(tpl.contractName)] = true;
      }
      var id = window.ftkUid('FIT');
      var row = {
        project_id: pid, group_id: groupId, form_name: tpl.name, form_type: ftkTplKind(tpl.kind).formType,
        status: 'not_started', owner: '', description: '',
        sort_order: ++startOrder, updated_at: new Date().toISOString(),
      };
      if (tpl.kind === 'contract' && tpl.contractName) row.contract_name = tpl.contractName;
      window.ftkApplyLocal('FORM_ITEMS', id, row);
      await window.setDoc(window.getDocRef('FORM_ITEMS', id), row).catch(window.showDbError);
    }
    window.closeM('m-ftk-template');
    window.renderImplTracker();
  };

  window.exportFtkReport = async function () {
    var pid = window.imtCurrentProjectId;
    var proj = window.imtProject(pid);
    if (!proj) return;
    if (!(await window.LibLoader.need('xlsx'))) return;
    // ── เรียงตามคลัง (ตาม sort_order ของคลัง) แล้วตามลำดับแบบฟอร์มในคลังนั้น ให้ตรงกับลำดับที่เห็นบนจอ ──
    function groupOrder(gid) { var g = ftkGroup(gid); return g ? g.order : 0; }
    var items = ftkItemsOfProject(pid).slice().sort(function (a, b) {
      var go = groupOrder(a.groupId) - groupOrder(b.groupId);
      return go !== 0 ? go : (a.order - b.order);
    });
    var headers = ['ลำดับ', 'คลัง', 'แบบฟอร์ม', 'ชื่อตามสัญญา', 'ประเภท', 'สถานะ', 'ผู้จัดทำ', 'วันที่รับเอกสาร', 'วันที่ดำเนินการ', 'หมายเหตุ'];
    var rows = items.map(function (i, idx) {
      var g = ftkGroup(i.groupId);
      var ft = window.FORM_TYPE.find(function (x) { return x.id === i.formType; });
      var doneDate = i.doneDate ? fd(i.doneDate) : '';
      var recvDate = i.receivedDate ? fd(i.receivedDate) : '';
      return [idx+1, g?g.name:'', i.name, i.formType==='form_contract'?(i.contractName||''):'', ft?ft.label:'', ftkStatus(i.status).label, i.owner||'', recvDate, doneDate, i.description||''];
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Forms');
    XLSX.writeFile(wb, 'FormTracker_'+proj.name+'_'+window.todayStr()+'.xlsx');
  };

  window.renderImtForms = function (mount) {
    var pid = window.imtCurrentProjectId;
    var proj = pid ? window.imtProject(pid) : null;
    if (!proj) { mount.innerHTML = window.imtProjectPicker(); return; }

    var groups = ftkGroupsOf(pid);
    var allItems = ftkItemsOfProject(pid);
    var filtered = ftkFilteredItems(pid);
    var f = window.ftkFilter || {};
    var canEdit = window.canEdit(window.IMPL_MODULE);
    var canAdd = window.canAdd(window.IMPL_MODULE);
    var canDel = window.canDel(window.IMPL_MODULE);
    var overallPct = window.calcFormProjectProgress(pid);

    // ── ความคืบหน้ารวม + ปุ่ม อยู่ท้ายแถวแท็บของโครงการ (imtSetPtabExtra) ไม่มีแถวหัวแยก ──
    var header = '<div class="ftk-header">'
      + '<div class="ftk-header-pbar">'+pbarHtml(overallPct)+'<span>'+overallPct+'%</span>'+window.calcTip('ความคืบหน้าแบบฟอร์มของโครงการนี้\n= แบบฟอร์มที่สถานะ "เสร็จแล้ว" ÷ แบบฟอร์มทั้งหมดของโครงการ (ทุกคลัง) × 100')+'</div>'
      + '<button class="btn btn-ghost btn-sm ftk-btn-desktop" onclick="window.openFtkTemplateModal(null)" title="จัดการรายชื่อเอกสารมาตรฐาน">📐 Template</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="window.openFtkHandover()" title="สร้างใบส่งมอบแบบฟอร์มจากรายการในโครงการนี้ (พิมพ์ / PDF / Excel)">📄 ใบส่งมอบ</button>'
      + '<button class="btn btn-xls btn-sm ftk-btn-desktop" onclick="window.exportFtkReport()">📥 Excel</button>'
      + '</div>';

    var groupOpts = ['<option value="">ทั้งหมด</option>'].concat(groups.map(function (g) { return '<option value="'+g.id+'"'+(f.groupId===g.id?' selected':'')+'>'+esc(g.name)+'</option>'; })).join('');
    var formTypeOpts = ['<option value="">ทั้งหมด</option>'].concat(window.FORM_TYPE.map(function (ft) { return '<option value="'+ft.id+'"'+(f.formType===ft.id?' selected':'')+'>'+esc(ft.label)+'</option>'; })).join('');
    var staffOpts = window.imtProjectTeamStaff(pid).map(function (s) {
      var nick = s.nickname || s.name;
      return { id:s.id, label:s.name+' ('+nick+')' };
    }).sort(function (a,b) { return a.label.localeCompare(b.label, 'th'); });
    window.ftkStaffOpts = staffOpts;   // ใช้ตอนวาดแถบ "เลือก n รายการ" ใหม่โดยไม่ re-render ทั้งหน้า
    var ownerOpts = ['<option value="">ทุกคน</option>'].concat(staffOpts.map(function (o) {
      return '<option value="'+esc(o.id)+'"'+(f.owner===o.id?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');

    // ── รายการที่เลือกไว้แต่ถูกลบ/ไม่อยู่ในโครงการนี้แล้ว ไม่ต้องนับ ──
    Object.keys(window.ftkSel).forEach(function (id) { if (!allItems.some(function (i) { return i.id === id; })) delete window.ftkSel[id]; });

    // ── ตัวกรองแบบ pill แยกกัน: ยังไม่กรอง = ป้าย + ลูกศร · กรองอยู่ = ไฮไลต์สี + ปุ่ม × ล้างเฉพาะตัวนั้น ──
    function pill(key, label, opts) {
      return '<div class="ftk-pill'+(f[key]?' on':'')+'" data-sui-anchor>'
        + '<label><span>'+label+'</span><select aria-label="กรองตาม'+label+'" onchange="window.ftkSetFilter(\''+key+'\',this.value)">'+opts+'</select></label>'
        + (f[key] ? '<button type="button" class="ftk-pill-x" aria-label="ล้างตัวกรอง'+label+'" title="ล้างตัวกรอง'+label+'" onclick="window.ftkSetFilter(\''+key+'\',\'\')">×</button>' : '')
        + '</div>';
    }
    var nActive = ['q','groupId','formType','owner'].filter(function (k) { return f[k]; }).length;
    // ── แถวเดียว: สถานะ (ใช้บ่อยสุด) ชิดซ้าย · ช่องค้นหายืดเต็มช่องกลาง · ตัวกรอง pill + ล้างทั้งหมด ชิดขวา ──
    var filterBar = '<div class="ftk-filterbar">'
      + ftkStatusChipsHtml(pid)
      + '<label class="ftk-search'+(f.q?' on':'')+'"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
      +   '<input id="ftk-q" placeholder="ค้นหาชื่อแบบฟอร์ม หรือผู้จัดทำ..." aria-label="ค้นหาแบบฟอร์ม" value="'+esc(f.q||'')+'" oninput="window.ftkSetFilter(\'q\',this.value)">'
      +   (f.q ? '<button type="button" class="ftk-search-x" aria-label="ล้างคำค้น" title="ล้างคำค้น" onclick="event.preventDefault();window.ftkSetFilter(\'q\',\'\')">×</button>' : '')
      + '</label>'
      + '<div class="ftk-pills">'
      +   pill('groupId', 'คลัง', groupOpts)
      +   pill('formType', 'ประเภท', formTypeOpts)
      +   pill('owner', 'ผู้จัดทำ', ownerOpts)
      +   (nActive > 1 ? '<button type="button" class="ftk-clear" onclick="window.ftkClearFilters()">ล้างทั้งหมด</button>' : '')
      + '</div>'
      + '</div>'
      + '<div id="ftk-bulkbar" class="ftk-bulkbar"'+(ftkSelIds().length?'':' hidden')+'>'+ftkBulkBarHtml(staffOpts)+'</div>';

    var filtering = !!(f.q || f.groupId || f.formType || f.owner);
    var groupsHtml = groups.map(function (g) {
      var gAll = allItems.filter(function (i) { return i.groupId === g.id; });
      // ── เรียงตาม sort_order เสมอ (ไม่พึ่งลำดับที่ FORM_ITEMS ส่งกลับมาจาก realtime ซึ่งไม่รับประกันคงที่ —
      // ไม่งั้นแค่แก้สถานะ/ผู้จัดทำก็ทำให้แถวสลับตำแหน่งไปมาโดยไม่ได้ตั้งใจ) ──
      var rows = filtered.filter(function (i) { return i.groupId === g.id; }).sort(function (a,b) { return a.order - b.order; });
      // ── ค้นหา/กรองอยู่แล้วคลังนี้ไม่มีรายการตรง → ซ่อนทั้งคลัง ไม่ต้องโชว์หัวคลังเปล่า ๆ ──
      if (filtering && !rows.length) return '';
      var gDone = gAll.filter(function (i) { return i.status === 'done'; }).length;
      var gPct = gAll.length ? Math.round(gDone / gAll.length * 100) : 0;
      var open = !window.ftkCollapsed[g.id];
      var emptyMsg = gAll.length && f.status === 'open' ? '🎉 แบบฟอร์มในคลังนี้ดำเนินการครบแล้ว' : 'ไม่มีแบบฟอร์มที่ตรงตัวกรองในคลังนี้';
      var rowsHtml = rows.map(function (i, idx) { return ftkItemRowHtml(i, idx+1, staffOpts, canEdit, canDel); }).join('')
        || '<tr class="ftk-empty-row"><td colspan="8">'+emptyMsg+'</td></tr>';
      var quickAdd = canAdd
        ? '<tr class="ftk-quickadd"><td colspan="7"><input class="f-input" placeholder="+ พิมพ์ชื่อแบบฟอร์มแล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddItem(this,\''+g.id+'\',\''+pid+'\');}"></td>'
          + '<td><button class="btn btn-ghost btn-sm" onclick="window.openFtkTemplateModal(\''+g.id+'\')" title="ดึงจาก Template">📐</button></td></tr>'
        : '';
      return '<div class="ftk-group'+(open?'':' ftk-collapsed')+'">'
        + '<div class="ftk-group-head">'
        +   '<button type="button" class="ftk-group-toggle" aria-expanded="'+open+'" aria-label="'+(open?'ย่อ':'ขยาย')+'คลัง '+esc(g.name)+'" onclick="window.ftkToggleGroup(\''+g.id+'\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>'
        +   '<input class="ftk-group-name-input" aria-label="ชื่อคลัง" value="'+esc(g.name)+'" '+(canEdit?'':'disabled')+' onchange="window.ftkRenameGroup(\''+g.id+'\',this.value)">'
        // ── มอบหมายผู้จัดทำทั้งคลังในครั้งเดียว (เลือกแล้วทำทันที มีแถบเลิกทำ) ──
        +   (canEdit && gAll.length && staffOpts.length ? '<select class="t-sel ftk-group-owner" aria-label="มอบหมายผู้จัดทำทั้งคลัง '+esc(g.name)+'" title="ตั้งผู้จัดทำให้ทุกแบบฟอร์มในคลังนี้ทีเดียว" onchange="window.ftkSetGroupOwner(\''+g.id+'\',this.value,this)">'
            + '<option value="">👤 มอบหมายทั้งคลัง…</option>'
            + staffOpts.map(function (o) { return '<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>'; }).join('')
            + '<option value="__none">— ล้างผู้จัดทำทั้งคลัง —</option></select>' : '')
        +   '<span class="ftk-group-meta">'+gDone+'/'+gAll.length+' เสร็จ</span>'
        +   '<span class="ftk-group-pbar">'+pbarHtml(gPct)+'</span>'
        +   '<span class="ftk-group-pct">'+gPct+'%'+window.calcTip('แบบฟอร์มที่ "เสร็จแล้ว" ÷ แบบฟอร์มทั้งหมดในคลังนี้ × 100 (ไม่ขึ้นกับตัวกรอง)')+'</span>'
        +   (canDel ? '<button class="m-x ftk-del" onclick="window.askDel(\'form_group\',\''+g.id+'\',\''+esc(g.name)+'\')" title="ลบคลัง" aria-label="ลบคลัง">🗑️</button>' : '')
        + '</div>'
        + (open
          ? '<div class="dtable-inner"><table class="ftk-table"><thead><tr>'
            +   '<th class="ftk-no">'+(canEdit && rows.length ? '<input type="checkbox" class="ftk-chk" aria-label="เลือกทั้งหมดในคลังนี้" title="เลือกทั้งหมดในคลังนี้" onchange="window.ftkToggleSelGroup(this)">' : '#')+'</th>'
            +   '<th>ประเภท</th><th>แบบฟอร์ม</th><th>สถานะ</th><th>ผู้จัดทำ</th><th>รับ → เสร็จ</th><th>หมายเหตุ</th><th></th>'
            + '</tr></thead><tbody>'+rowsHtml+quickAdd+'</tbody></table></div>'
          : '')
        + '</div>';
    }).join('');
    if (filtering && !groupsHtml) groupsHtml = '<div class="ftk-empty-hero"><div class="ftk-empty-icon">🔍</div><div class="ftk-empty-title">ไม่พบแบบฟอร์มที่ตรงกับการค้นหา</div><div class="ftk-empty-sub">ลองเปลี่ยนคำค้น หรือล้างตัวกรอง</div></div>';
    var addGroup = canAdd
      ? '<div class="ftk-group"><div class="ftk-group-addbar"><input class="f-input" placeholder="+ พิมพ์ชื่อคลังใหม่แล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddGroup(this,\''+pid+'\');}"></div></div>'
      : '';

    var body = groups.length
      ? groupsHtml + addGroup
      : '<div class="ftk-empty-hero"><div class="ftk-empty-icon">🏬</div><div class="ftk-empty-title">ยังไม่มีคลังแบบฟอร์มในโครงการนี้</div><div class="ftk-empty-sub">พิมพ์ชื่อคลังด้านล่างแล้วกด Enter เพื่อเริ่มต้น</div></div>' + addGroup;

    window.imtSetPtabExtra(header);
    mount.innerHTML = filterBar + ftkContractBarHtml(pid, groups, canEdit, canAdd) + '<div class="ftk-scroll">'+body+'</div>';
    // ── ช่องชื่อแบบฟอร์มเป็น textarea แถวเดียวที่ขยายสูงอัตโนมัติ (แสดงชื่อยาว ๆ ครบ ไม่ตัดทิ้ง) — rows="1"
    // ตอน render ครั้งแรกยังไม่พอสำหรับข้อความที่ยาวเกิน 1 บรรทัด ต้องคำนวณความสูงจริงหลัง mount เข้า DOM แล้ว ──
    mount.querySelectorAll('.ftk-name-input').forEach(function (ta) { ta.style.height = ''; ta.style.height = ta.scrollHeight + 'px'; });
  };

})();
