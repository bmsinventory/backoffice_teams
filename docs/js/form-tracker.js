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

  function pbarHtml(pct, color) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="pbar"><div class="pbar-fill" style="width:'+pct+'%;background:'+(color||'var(--violet)')+'"></div></div>';
  }

  // ================================================================
  // MAIN — เรียกจาก dispatcher ของ impl-tracker.js (window.imtCurrentProjectId เดียวกันทุกแท็บ)
  // ================================================================
  window.ftkSetFilter = function (key, value) {
    window.ftkFilter = window.ftkFilter || {};
    window.ftkFilter[key] = value;
    window.renderImplTracker();
  };
  window.ftkToggleHideDone = function (checked) {
    window.ftkHideDone = checked;
    window.renderImplTracker();
  };

  function ftkFilteredItems(pid) {
    var f = window.ftkFilter || {};
    var q = (f.q || '').toLowerCase();
    var hideDone = window.ftkHideDone !== false;
    return ftkItemsOfProject(pid).filter(function (i) {
      if (hideDone && i.status === 'done') return false;
      if (q && i.name.toLowerCase().indexOf(q) === -1) return false;
      if (f.groupId && i.groupId !== f.groupId) return false;
      if (f.formType && i.formType !== f.formType) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.owner && i.owner !== f.owner) return false;
      return true;
    });
  }

  function ftkItemRowHtml(item, idx, staffOpts, canEdit, canDel) {
    var st = ftkStatus(item.status);
    var doneDate = item.status === 'done' && item.updatedAt ? fd(item.updatedAt) : '-';
    var ownerOptsHtml = ['<option value="">— ไม่ระบุ —</option>'].concat(staffOpts.map(function (o) {
      return '<option value="'+esc(o.n)+'"'+(item.owner===o.n?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');
    var formTypeOptsHtml = ['<option value="">— ไม่ระบุ —</option>'].concat(window.FORM_TYPE.map(function (ft) {
      return '<option value="'+ft.id+'"'+(item.formType===ft.id?' selected':'')+'>'+esc(ft.label)+'</option>';
    })).join('');
    var statusOptsHtml = window.FORM_STATUS.map(function (s) {
      return '<option value="'+s.id+'"'+(item.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>';
    }).join('');
    var ft = window.FORM_TYPE.find(function (x) { return x.id === item.formType; });
    var ftColor = ft ? ft.color : '#9ba3b8';
    // ── data-label ทุก td ใช้กับเลย์เอาต์การ์ดบนมือถือ (.ftk-table ใน media query <768px จะซ่อน thead แล้ว
    // แสดงชื่อ label นี้แทนหัวตารางที่มองไม่เห็น) ──
    return '<tr>'
      + '<td class="ftk-no" data-label="ลำดับ">'+idx+'</td>'
      + '<td data-label="แบบฟอร์ม"><textarea class="ftk-name-input" rows="1" '+(canEdit?'':'disabled')+' oninput="this.style.height=\'\';this.style.height=this.scrollHeight+\'px\'" onchange="window.ftkSetItemField(\''+item.id+'\',\'form_name\',this.value)">'+esc(item.name)+'</textarea></td>'
      + '<td data-label="ประเภท"><select class="ftk-sel ftk-sel-pill" style="background:'+ftColor+'18;color:'+ftColor+';" '+(canEdit?'':'disabled')+' onchange="window.ftkSetItemField(\''+item.id+'\',\'form_type\',this.value)">'+formTypeOptsHtml+'</select></td>'
      + '<td data-label="สถานะ"><select class="ftk-sel ftk-sel-pill" style="background:'+st.color+'18;color:'+st.color+';" '+(canEdit?'':'disabled')+' onchange="window.ftkSetItemField(\''+item.id+'\',\'status\',this.value)">'+statusOptsHtml+'</select></td>'
      + '<td data-label="ผู้จัดทำ"><select class="ftk-sel" '+(canEdit?'':'disabled')+' onchange="window.ftkSetItemField(\''+item.id+'\',\'owner\',this.value)">'+ownerOptsHtml+'</select></td>'
      // ── native <input type=date> โชว์ปี ค.ศ. เสมอ (บังคับเป็น พ.ศ. ผ่าน CSS/HTML ไม่ได้) — ซ่อน input จริง
      // ไว้แบบโปร่งใสทับเต็มพื้นที่ แต่ปกติคลิกในเนื้อ input (ที่มองไม่เห็นแล้ว) จะแค่โฟกัสไปที่ช่อง วัน/เดือน/ปี
      // ให้พิมพ์เอง ไม่เปิดปฏิทินให้อัตโนมัติ (browser เปิดปฏิทินเฉพาะคลิกไอคอนเล็ก ๆ ที่ตอนนี้มองไม่เห็นแล้ว) —
      // เรียก showPicker() เองตอนคลิกที่ไหนก็ได้ในเซลล์ กันปัญหา "กดแล้วไม่เห็นตัวเลือกวันที่" ──
      + '<td data-label="วันที่รับเอกสาร"><div class="ftk-date-picker">'
      +   '<input type="date" class="ftk-date-input" value="'+esc(item.receivedDate||'')+'" '+(canEdit?'':'disabled')+' onclick="try{this.showPicker&&this.showPicker();}catch(e){}" onchange="window.ftkSetItemField(\''+item.id+'\',\'received_date\',this.value)">'
      +   '<span class="ftk-date-display">'+(item.receivedDate ? fd(item.receivedDate) : '-')+'</span>'
      + '</div></td>'
      + '<td class="ftk-date" data-label="วันที่ดำเนินการ">'+doneDate+'</td>'
      + '<td class="ftk-note-cell" data-label="หมายเหตุ"><input class="ftk-note" value="'+esc(item.description||'')+'" '+(canEdit?'':'disabled')+' placeholder="—" onchange="window.ftkSetItemField(\''+item.id+'\',\'description\',this.value)"></td>'
      + '<td data-label="ลบ">'+(canDel ? '<button class="m-x" onclick="window.askDel(\'form_item\',\''+item.id+'\',\''+esc(item.name)+'\')" title="ลบ">🗑️</button>' : '')+'</td>'
      + '</tr>';
  }

  // ── บันทึกการแก้ไข inline ทีละ field (ประเภท/สถานะ/ผู้จัดทำ/หมายเหตุ/ชื่อ) — updated_at ถูก bump ทุกครั้ง
  // ที่แก้ไข เพื่อให้ "วันที่ดำเนินการ" ถูกต้องเสมอตอนสถานะเป็น "ดำเนินการแล้ว" ──
  window.ftkSetItemField = async function (itemId, field, value) {
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var item = window.FORM_ITEMS.find(function (i) { return i.id === itemId; });
    if (!item) return;
    var row = {
      project_id: item.projectId, group_id: item.groupId, form_name: item.name, form_type: item.formType,
      status: item.status, owner: item.owner, description: item.description, sort_order: item.order,
      received_date: item.receivedDate || null,
    };
    var overrides = {}; overrides[field] = value; overrides.updated_at = new Date().toISOString();
    Object.assign(row, overrides);
    window.ftkApplyLocal('FORM_ITEMS', itemId, row);
    window.renderImplTracker();
    await window.updateDoc(window.getDocRef('FORM_ITEMS', itemId), overrides).catch(window.showDbError);
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
  // TEMPLATE — รายชื่อเอกสารแบบฟอร์มมาตรฐาน (ใช้ร่วมกันทุกโครงการ/ทุกคลัง ไม่ผูก project/group) ตั้งไว้
  // ล่วงหน้าแล้วดึงมาเพิ่มเป็นแบบฟอร์มในคลังไหนก็ได้แบบเร็ว (ติ๊กเลือกหลายรายการพร้อมกัน) แทนพิมพ์เองทีละใบ
  // ================================================================
  function ftkTemplatesSorted() { return window.FORM_TEMPLATES.slice().sort(function (a,b) { return a.order - b.order; }); }

  // ── เปิด modal — ส่ง groupId มาด้วย = โหมด "ดึงมาใช้" (มีติ๊กเลือก+ปุ่มนำเข้า), ไม่ส่ง = โหมดจัดการรายชื่ออย่างเดียว ──
  window.openFtkTemplateModal = function (groupId) {
    window.ftkTemplatePickGroupId = groupId || null;
    renderFtkTemplateModal();
    window.openM('m-ftk-template');
  };

  function renderFtkTemplateModal() {
    var pickMode = !!window.ftkTemplatePickGroupId;
    var canAdd = window.canAdd(window.IMPL_MODULE);
    var canDel = window.canDel(window.IMPL_MODULE);
    var tpls = ftkTemplatesSorted();
    var existingNames = pickMode
      ? ftkItemsOfGroup(window.ftkTemplatePickGroupId).map(function (i) { return i.name.trim().toLowerCase(); })
      : [];
    var rows = tpls.map(function (t) {
      var already = pickMode && existingNames.indexOf(t.name.trim().toLowerCase()) !== -1;
      var chk = pickMode
        ? '<input type="checkbox" class="ftk-tpl-chk" data-name="'+esc(t.name)+'" '+(already?'disabled checked':'')+'>'
        : '';
      return '<div class="ftk-tpl-row'+(already?' ftk-tpl-row-dim':'')+'">'
        + '<label class="ftk-tpl-chklbl">'+chk+'<span>'+esc(t.name)+(already?' <small>(มีอยู่แล้ว)</small>':'')+'</span></label>'
        + (canDel ? '<button class="m-x" onclick="window.askDel(\'form_template\',\''+t.id+'\',\''+esc(t.name)+'\')" title="ลบ">🗑️</button>' : '')
        + '</div>';
    }).join('') || '<div style="text-align:center;color:var(--txt3);font-size:12.5px;padding:20px;">ยังไม่มี Template — พิมพ์ชื่อเอกสารด้านล่างเพื่อเพิ่ม</div>';
    var addRow = canAdd
      ? '<input class="f-input" style="margin-top:10px;" placeholder="+ พิมพ์ชื่อเอกสารมาตรฐานแล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddTemplate(this);}">'
      : '';
    document.getElementById('m-ftk-template-body').innerHTML = '<div class="ftk-tpl-list">'+rows+'</div>'+addRow;
    document.getElementById('m-ftk-template-title').textContent = pickMode ? 'ดึงแบบฟอร์มจาก Template' : 'จัดการ Template ชื่อเอกสาร';
    var importBtn = document.getElementById('m-ftk-template-import');
    if (importBtn) importBtn.style.display = pickMode ? '' : 'none';
  }
  window.renderFtkTemplateModal = renderFtkTemplateModal; // ── ให้ modals.js เรียก refresh หลังลบรายการได้ ──

  window.ftkQuickAddTemplate = async function (inputEl) {
    var name = inputEl.value.trim();
    if (!name || !window.canAdd(window.IMPL_MODULE)) return;
    if (window.FORM_TEMPLATES.some(function (t) { return t.name.trim().toLowerCase() === name.toLowerCase(); })) { inputEl.value = ''; return; }
    var id = window.ftkUid('FTL');
    var row = { name: name, sort_order: window.FORM_TEMPLATES.length + 1 };
    inputEl.value = '';
    window.ftkApplyLocal('FORM_TEMPLATES', id, row);
    renderFtkTemplateModal();
    await window.setDoc(window.getDocRef('FORM_TEMPLATES', id), row).catch(window.showDbError);
  };

  // ── นำเข้ารายการที่ติ๊กไว้เป็นแบบฟอร์มใหม่ในคลังปลายทาง — ตั้งประเภทเริ่มต้นเป็น "แบบฟอร์มตั้งต้น" (form_base)
  // ให้ต่างจากรายการที่พิมพ์เพิ่มเองแบบเร็ว (form_new) ตั้งแต่แรกโดยไม่ต้องเปลี่ยนทีหลัง ──
  window.ftkImportFromTemplate = async function () {
    var groupId = window.ftkTemplatePickGroupId, pid = window.imtCurrentProjectId;
    if (!groupId || !pid || !window.canAdd(window.IMPL_MODULE)) return;
    var checked = Array.prototype.slice.call(document.querySelectorAll('.ftk-tpl-chk:checked:not(:disabled)'));
    if (!checked.length) return;
    var startOrder = ftkItemsOfGroup(groupId).length;
    for (var i = 0; i < checked.length; i++) {
      var id = window.ftkUid('FIT');
      var row = {
        project_id: pid, group_id: groupId, form_name: checked[i].dataset.name, form_type: 'form_base',
        status: 'not_started', owner: '', description: '',
        sort_order: startOrder + i + 1, updated_at: new Date().toISOString(),
      };
      window.ftkApplyLocal('FORM_ITEMS', id, row);
      await window.setDoc(window.getDocRef('FORM_ITEMS', id), row).catch(window.showDbError);
    }
    window.closeM('m-ftk-template');
    window.renderImplTracker();
  };

  // ================================================================
  // PRINT SUMMARY / IMAGE EXPORT — สรุปการจัดทำแบบฟอร์มภาพเดียว ออกแบบเป็นเอกสารแนวตั้งสัดส่วน A4
  // (794px @96dpi ตั้งความกว้างตอน clone ด้านล่าง) โทนสีเดียวกับแบรนด์แอป (violet/indigo/teal) — เป็นภาพ
  // ส่งต่อทางไลน์/อีเมล ไม่ใช่กระดาษพิมพ์จริง จึงออกแบบให้มีสีสัน/การ์ด/เงาได้เต็มที่ ไม่ใช้ชุด .ppc-* ขาวดำ
  // ของ impl-tracker (ดู .ftkp-* ใน form-tracker.css) — ซ่อนไว้ไม่ให้เห็นบนจอปกติผ่าน .imt-print-only ──
  function ftkPctColor(pct) { return pct >= 100 ? '#06d6a0' : pct > 0 ? '#4361ee' : '#9ba3b8'; }

  function ftkBarPanelHtml(title, counts) {
    var rows = counts.map(function (x) {
      return '<div class="ftkp-bar-row">'
        + '<div class="ftkp-bar-row-top">'
        +   '<span class="ftkp-bar-dot" style="background:'+x.color+';"></span>'
        +   '<span class="ftkp-bar-label">'+(x.icon?x.icon+' ':'')+esc(x.label)+'</span>'
        +   '<span class="ftkp-bar-val">'+x.n+' ใบ · '+x.pct+'%</span>'
        + '</div>'
        + '<div class="ftkp-bar-track"><div class="ftkp-bar-fill" style="width:'+x.pct+'%;background:'+x.color+';"></div></div>'
        + '</div>';
    }).join('') || '<div style="font-size:11.5px;color:#9ba3b8;">ไม่มีข้อมูล</div>';
    return '<div class="ftkp-panel"><div class="ftkp-panel-title">'+title+'</div>'+rows+'</div>';
  }

  function ftkPrintSummaryHtml(proj, pid, groups, allItems) {
    var overallPct = window.calcFormProjectProgress(pid);

    // ── สถานะ: โชว์เป็น stat tile บน Hero ครบทุกสถานะ (รวมสถานะที่มี 0 ใบด้วย ไม่กรองทิ้ง) แทนกราฟแท่งแยก
    // ต่างหาก — เดิมมีทั้งการ์ด "เสร็จแล้ว/ยังไม่เสร็จ" ด้านบน และกราฟแยกสถานะด้านล่างซ้ำข้อมูลเดียวกัน ──
    var statusStats = window.FORM_STATUS.map(function (st) {
      var n = allItems.filter(function (i) { return i.status === st.id; }).length;
      return { label: st.label, icon: st.icon, color: st.color, n: n };
    });

    // ── แยกตามประเภท (รวม "ไม่ระบุประเภท" เป็นแท่งเพิ่มถ้ามี ไม่ให้ยอดรวมขาดหาย) ──
    var typeCounts = window.FORM_TYPE.map(function (ft) {
      var n = allItems.filter(function (i) { return i.formType === ft.id; }).length;
      return { label: ft.label, icon: '🏷️', color: ft.color, n: n, pct: allItems.length ? Math.round(n/allItems.length*100) : 0 };
    }).filter(function (x) { return x.n > 0; });
    var typedIds = window.FORM_TYPE.map(function (ft) { return ft.id; });
    var untypedN = allItems.filter(function (i) { return !i.formType || typedIds.indexOf(i.formType) === -1; }).length;
    if (untypedN) typeCounts.push({ label:'ไม่ระบุประเภท', icon:'🏷️', color:'#9ba3b8', n:untypedN, pct: allItems.length ? Math.round(untypedN/allItems.length*100) : 0 });

    // ── รายละเอียดจัดกลุ่มตามคลัง — คอลัมน์เดียวเรียงลงมา (อ่านง่ายกว่าบนเอกสารแนวตั้งแคบ) แต่ละใบมีจุดสี
    // ตามสถานะ + ชื่อ + ผู้จัดทำ + วันที่ดำเนินการ (ถ้าเสร็จแล้ว) ──
    var groupsHtml = groups.map(function (g) {
      var gItems = allItems.filter(function (i) { return i.groupId === g.id; }).sort(function (a,b) { return a.order - b.order; });
      if (!gItems.length) return '';
      var gDone = gItems.filter(function (i) { return i.status === 'done'; }).length;
      var gPct = Math.round(gDone / gItems.length * 100);
      var color = ftkPctColor(gPct);
      var itemsHtml = gItems.map(function (i) {
        var st = ftkStatus(i.status);
        return '<div class="ftkp-item-row">'
          + '<span class="ftkp-item-dot" style="background:'+st.color+';"></span>'
          + '<span class="ftkp-item-name'+(i.status==='done'?' done':'')+'">'+esc(i.name)+'</span>'
          + (i.owner ? '<span class="ftkp-item-meta">👤 '+esc(i.owner)+'</span>' : '')
          + (i.status==='done' && i.updatedAt ? '<span class="ftkp-item-date">'+fd(i.updatedAt)+'</span>' : '')
          + '</div>';
      }).join('');
      return '<div class="ftkp-group">'
        + '<div class="ftkp-group-head" style="border-left-color:'+color+';">'
        +   '<span class="ftkp-group-name">🏬 '+esc(g.name)+'</span>'
        +   '<span class="ftkp-group-pct" style="color:'+color+';">'+gDone+'/'+gItems.length+' · '+gPct+'%</span>'
        + '</div>'
        + itemsHtml
        + '</div>';
    }).join('') || '<div style="font-size:12px;color:#9ba3b8;text-align:center;padding:20px;">ยังไม่มีแบบฟอร์ม</div>';

    return '<div class="imt-print-only ftk-print-page"><div class="ftkp-doc">'
      + '<div class="ftkp-header">'
      +   '<div class="ftkp-header-eyebrow">📄 สรุปการจัดทำแบบฟอร์ม</div>'
      +   '<div class="ftkp-header-title">'+esc(proj.name)+'</div>'
      +   '<div class="ftkp-header-sub">'
      +     (proj.hospitalName ? '👤 PM: '+esc(proj.hospitalName)+' · ' : '')
      +     (proj.pm ? '🔧 ผู้ติดตั้ง: '+esc(proj.pm)+' · ' : '')
      +     'พิมพ์เมื่อ '+fd(new Date().toISOString())
      +   '</div>'
      + '</div>'
      + '<div class="ftkp-body">'
      +   '<div class="ftkp-hero">'
      +     '<div class="ftkp-hero-pct-row"><span class="ftkp-hero-pct">'+overallPct+'%</span><span class="ftkp-hero-pct-lbl">ความคืบหน้ารวม</span></div>'
      +     '<div class="ftkp-hero-bar-track"><div class="ftkp-hero-bar-fill" style="width:'+overallPct+'%;"></div></div>'
      +     '<div class="ftkp-stats">'
      +       '<div class="ftkp-stat"><div class="ftkp-stat-icon" style="background:#4361ee18;color:#4361ee;">📄</div><div><b>'+allItems.length+'</b><span>แบบฟอร์มทั้งหมด</span></div></div>'
      +       statusStats.map(function (s) { return '<div class="ftkp-stat"><div class="ftkp-stat-icon" style="background:'+s.color+'18;color:'+s.color+';">'+s.icon+'</div><div><b>'+s.n+'</b><span>'+esc(s.label)+'</span></div></div>'; }).join('')
      +     '</div>'
      +   '</div>'
      +   ftkBarPanelHtml('🏷️ แยกตามประเภท', typeCounts)
      +   '<div class="ftkp-detail-title">📋 รายละเอียดแบบฟอร์มทั้งหมด</div>'
      +   groupsHtml
      + '</div>'
      + '<div class="ftkp-footer">Backoffice Teams · ติดตามสถานะโครงการ</div>'
      + '</div></div>';
  }

  // ── Export เป็นรูปภาพ (PNG): clone .ftk-print-page ไปวางนอกจอกว้าง 794px (สัดส่วนความกว้าง A4 @96dpi —
  // สูงปล่อยตามเนื้อหาจริง ไม่ตัดหน้ากระดาษ) แล้วจับภาพด้วย html2canvas เหมือน window.exportImtReportImage()
  // ของ impl-tracker.js ──
  window.exportFtkReportImage = async function () {
    if (!window.html2canvas) { window.showAlert && window.showAlert('ยังโหลดไลบรารีสร้างรูปภาพไม่เสร็จ ลองใหม่อีกครั้ง', 'error'); return; }
    var src = document.querySelector('.ftk-print-page');
    if (!src) { window.showAlert && window.showAlert('ไม่พบข้อมูลสำหรับสร้างรูปภาพ กรุณาเลือกโครงการก่อน', 'error'); return; }
    var proj = window.imtProject(window.imtCurrentProjectId);
    var clone = src.cloneNode(true);
    clone.style.cssText = 'display:block;position:fixed;top:-100000px;left:0;width:794px;height:auto;max-height:none;overflow:visible;background:#fff;';
    document.body.appendChild(clone);
    // รอ 2 เฟรมให้เบราว์เซอร์ layout เนื้อหาที่ clone มาให้เสร็จก่อน ค่อยวัดขนาดจริง (กันวัดขนาดผิดจนภาพถูกตัด)
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    try {
      var capW = clone.scrollWidth, capH = clone.scrollHeight;
      var canvas = await window.html2canvas(clone, {
        scale: 2, backgroundColor: '#ffffff',
        width: capW, height: capH, windowWidth: capW, windowHeight: capH,
      });
      var safeName = (proj ? proj.name : 'FormTracker').replace(/[^a-zA-Z0-9ก-๙]+/g, '_');
      var link = document.createElement('a');
      link.download = 'FormTracker_' + safeName + '_' + new Date().toISOString().slice(0,10) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      window.showAlert && window.showAlert('สร้างรูปภาพไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally {
      document.body.removeChild(clone);
    }
  };

  window.exportFtkReport = function () {
    var pid = window.imtCurrentProjectId;
    var proj = window.imtProject(pid);
    if (!proj) return;
    if (!window.XLSX) { window.showAlert && window.showAlert('ยังโหลด XLSX library ไม่เสร็จ', 'error'); return; }
    // ── เรียงตามคลัง (ตาม sort_order ของคลัง) แล้วตามลำดับแบบฟอร์มในคลังนั้น ให้ตรงกับลำดับที่เห็นบนจอ ──
    function groupOrder(gid) { var g = ftkGroup(gid); return g ? g.order : 0; }
    var items = ftkItemsOfProject(pid).slice().sort(function (a, b) {
      var go = groupOrder(a.groupId) - groupOrder(b.groupId);
      return go !== 0 ? go : (a.order - b.order);
    });
    var headers = ['ลำดับ', 'คลัง', 'แบบฟอร์ม', 'ประเภท', 'สถานะ', 'ผู้จัดทำ', 'วันที่รับเอกสาร', 'วันที่ดำเนินการ', 'หมายเหตุ'];
    var rows = items.map(function (i, idx) {
      var g = ftkGroup(i.groupId);
      var ft = window.FORM_TYPE.find(function (x) { return x.id === i.formType; });
      var doneDate = i.status === 'done' && i.updatedAt ? fd(i.updatedAt) : '';
      var recvDate = i.receivedDate ? fd(i.receivedDate) : '';
      return [idx+1, g?g.name:'', i.name, ft?ft.label:'', ftkStatus(i.status).label, i.owner||'', recvDate, doneDate, i.description||''];
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Forms');
    XLSX.writeFile(wb, 'FormTracker_'+proj.name+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  };

  window.renderImtForms = function (mount) {
    var pid = window.imtCurrentProjectId;
    var proj = pid ? window.imtProject(pid) : null;
    if (!proj) { mount.innerHTML = window.imtProjectPicker(); return; }

    var groups = ftkGroupsOf(pid);
    var allItems = ftkItemsOfProject(pid);
    var filtered = ftkFilteredItems(pid);
    var f = window.ftkFilter || {};
    var hideDone = window.ftkHideDone !== false;
    var canEdit = window.canEdit(window.IMPL_MODULE);
    var canAdd = window.canAdd(window.IMPL_MODULE);
    var canDel = window.canDel(window.IMPL_MODULE);
    var overallPct = window.calcFormProjectProgress(pid);

    var header = '<div class="ftk-header">'
      + '<div class="ftk-header-title">📄 แบบฟอร์มของโครงการนี้</div>'
      + '<div class="ftk-header-pbar">'+pbarHtml(overallPct)+'<span>'+overallPct+'%</span></div>'
      + '<div style="flex:1"></div>'
      + '<button class="btn btn-ghost btn-sm ftk-btn-desktop" onclick="window.openFtkTemplateModal(null)" title="จัดการรายชื่อเอกสารมาตรฐาน">📐 Template</button>'
      + '<button class="btn btn-xls btn-sm ftk-btn-desktop" onclick="window.exportFtkReport()">📥 Excel</button>'
      + '<button class="btn btn-pri btn-sm" onclick="window.exportFtkReportImage()">📷 บันทึกเป็นรูปภาพ</button>'
      + '</div>';

    var groupOpts = ['<option value="">ทุกคลัง</option>'].concat(groups.map(function (g) { return '<option value="'+g.id+'"'+(f.groupId===g.id?' selected':'')+'>'+esc(g.name)+'</option>'; })).join('');
    var formTypeOpts = ['<option value="">ทุกประเภท</option>'].concat(window.FORM_TYPE.map(function (ft) { return '<option value="'+ft.id+'"'+(f.formType===ft.id?' selected':'')+'>'+esc(ft.label)+'</option>'; })).join('');
    var statusOpts = ['<option value="">ทุกสถานะ</option>'].concat(window.FORM_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(f.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; })).join('');
    var staffOpts = window.imtProjectTeamStaff(pid).map(function (s) {
      var nick = s.nickname || s.name;
      return { n:nick, label:s.name+' ('+nick+')' };
    }).sort(function (a,b) { return a.label.localeCompare(b.label, 'th'); });
    var ownerOpts = ['<option value="">ทุกคน</option>'].concat(staffOpts.map(function (o) {
      return '<option value="'+esc(o.n)+'"'+(f.owner===o.n?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');

    var filterBar = '<div class="ftk-filterbar">'
      + '<div class="t-search"><input placeholder="ค้นหาแบบฟอร์ม..." value="'+esc(f.q||'')+'" oninput="window.ftkSetFilter(\'q\',this.value)"></div>'
      + '<select class="t-sel" onchange="window.ftkSetFilter(\'groupId\',this.value)">'+groupOpts+'</select>'
      + '<select class="t-sel" onchange="window.ftkSetFilter(\'formType\',this.value)">'+formTypeOpts+'</select>'
      + '<select class="t-sel" onchange="window.ftkSetFilter(\'status\',this.value)">'+statusOpts+'</select>'
      + '<select class="t-sel" onchange="window.ftkSetFilter(\'owner\',this.value)">'+ownerOpts+'</select>'
      + '<label class="ftk-hidedone-chk"><input type="checkbox" '+(hideDone?'checked':'')+' onchange="window.ftkToggleHideDone(this.checked)"> แสดงเฉพาะที่ยังไม่เสร็จ</label>'
      + '</div>';

    var groupsHtml = groups.map(function (g) {
      var gAll = allItems.filter(function (i) { return i.groupId === g.id; });
      // ── เรียงตาม sort_order เสมอ (ไม่พึ่งลำดับที่ FORM_ITEMS ส่งกลับมาจาก realtime ซึ่งไม่รับประกันคงที่ —
      // ไม่งั้นแค่แก้สถานะ/ผู้จัดทำก็ทำให้แถวสลับตำแหน่งไปมาโดยไม่ได้ตั้งใจ) ──
      var rows = filtered.filter(function (i) { return i.groupId === g.id; }).sort(function (a,b) { return a.order - b.order; });
      var gDone = gAll.filter(function (i) { return i.status === 'done'; }).length;
      var gPct = gAll.length ? Math.round(gDone / gAll.length * 100) : 0;
      var rowsHtml = rows.map(function (i, idx) { return ftkItemRowHtml(i, idx+1, staffOpts, canEdit, canDel); }).join('')
        || '<tr><td colspan="9" style="text-align:center;color:var(--txt3);padding:14px;">ไม่มีแบบฟอร์มที่ตรงตัวกรองในคลังนี้</td></tr>';
      var quickAdd = canAdd
        ? '<tr class="ftk-quickadd"><td colspan="8"><input class="f-input" placeholder="+ พิมพ์ชื่อแบบฟอร์มแล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddItem(this,\''+g.id+'\',\''+pid+'\');}"></td>'
          + '<td><button class="btn btn-ghost btn-sm" onclick="window.openFtkTemplateModal(\''+g.id+'\')" title="ดึงจาก Template">📐</button></td></tr>'
        : '';
      return '<div class="ftk-group">'
        + '<div class="ftk-group-head">'
        +   '<span class="ftk-group-icon">🏬</span>'
        +   '<input class="ftk-group-name-input" value="'+esc(g.name)+'" '+(canEdit?'':'disabled')+' onchange="window.ftkRenameGroup(\''+g.id+'\',this.value)">'
        +   '<span class="ftk-group-meta">'+gDone+'/'+gAll.length+' เสร็จแล้ว · '+gPct+'%</span>'
        +   (canDel ? '<button class="m-x" onclick="window.askDel(\'form_group\',\''+g.id+'\',\''+esc(g.name)+'\')" title="ลบคลัง">🗑️</button>' : '')
        + '</div>'
        + '<div class="dtable-inner"><table class="ftk-table"><thead><tr>'
        +   '<th class="ftk-no">#</th><th>แบบฟอร์ม</th><th>ประเภท</th><th>สถานะ</th><th>ผู้จัดทำ</th><th>วันที่รับเอกสาร</th><th>วันที่ดำเนินการ</th><th>หมายเหตุ</th><th></th>'
        + '</tr></thead><tbody>'+rowsHtml+quickAdd+'</tbody></table></div>'
        + '</div>';
    }).join('');

    var addGroup = canAdd
      ? '<div class="ftk-group"><div class="ftk-group-addbar"><input class="f-input" placeholder="+ พิมพ์ชื่อคลังใหม่แล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.ftkQuickAddGroup(this,\''+pid+'\');}"></div></div>'
      : '';

    var body = groups.length
      ? groupsHtml + addGroup
      : '<div class="ftk-empty-hero"><div class="ftk-empty-icon">🏬</div><div class="ftk-empty-title">ยังไม่มีคลังแบบฟอร์มในโครงการนี้</div><div class="ftk-empty-sub">พิมพ์ชื่อคลังด้านล่างแล้วกด Enter เพื่อเริ่มต้น</div></div>' + addGroup;

    var printOnly = ftkPrintSummaryHtml(proj, pid, groups, allItems);

    mount.innerHTML = header + filterBar + '<div class="ftk-scroll">'+body+'</div>' + printOnly;
    // ── ช่องชื่อแบบฟอร์มเป็น textarea แถวเดียวที่ขยายสูงอัตโนมัติ (แสดงชื่อยาว ๆ ครบ ไม่ตัดทิ้ง) — rows="1"
    // ตอน render ครั้งแรกยังไม่พอสำหรับข้อความที่ยาวเกิน 1 บรรทัด ต้องคำนวณความสูงจริงหลัง mount เข้า DOM แล้ว ──
    mount.querySelectorAll('.ftk-name-input').forEach(function (ta) { ta.style.height = ''; ta.style.height = ta.scrollHeight + 'px'; });
  };

})();
