/**
 * impl-tracker.js — Implementation Tracker: Render Functions
 * Module: ติดตามงานโครงการติดตั้งระบบ (Project → Phase → Task → Checklist)
 * ใช้ window.getColRef/getDocRef/setDoc/updateDoc/deleteDoc (db.service.js เดิม)
 * และ window.calcTaskProgress/calcPhaseProgress/calcProjectProgress/imtLogActivity ฯลฯ
 * (impl-tracker.service.js) — ห้ามเรียก setDoc ตรง ๆ โดยไม่ผ่าน optimistic update
 */
(function () {
  var esc = window.esc, fd = window.fd, pd = window.pd;

  // ── Lookup Helpers ──
  // ระหว่าง render (window.imtIndexPass) ใช้ดัชนีกลุ่มแทนการ .filter/.find ทั้ง array ซ้ำ ๆ ในลูป —
  // กลุ่มคงลำดับเดิมของ array (ตัวแรกของกลุ่ม = ผลของ find) · slice ก่อน sort เพราะกลุ่มใช้ร่วมกัน ──
  function imtGrp(jsName, key, val) { var g = window.imtGroupOf(jsName, key, val); return g ? g.slice() : null; }
  function imtFirst(jsName, id) { var g = window.imtGroupOf(jsName, 'id', id); return g ? g[0] : window[jsName].find(function (x) { return x.id === id; }); }
  function imtProject(id) { return imtFirst('IMPL_PROJECTS', id); }
  window.imtProject = imtProject; // ── ให้ form-tracker.js (แท็บ "แบบฟอร์ม") เรียกใช้ได้ ไม่ต้อง lookup ซ้ำ ──
  function imtPhase(id)   { return imtFirst('IMPL_PHASES', id); }
  function imtTask(id)    { return imtFirst('IMPL_TASKS', id); }
  function imtPhasesOf(pid)    { return (imtGrp('IMPL_PHASES', 'projectId', pid) || window.IMPL_PHASES.filter(function (p) { return p.projectId === pid; })).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfPhase(id) { return (imtGrp('IMPL_TASKS', 'phaseId', id) || window.IMPL_TASKS.filter(function (t) { return t.phaseId === id; })).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfProject(pid) { return (imtGrp('IMPL_TASKS', 'projectId', pid) || window.IMPL_TASKS.filter(function (t) { return t.projectId === pid; })).sort(function (a,b) { return a.order - b.order; }); }
  function imtChecklistOf(tid) { return (imtGrp('IMPL_CHECKLIST_ITEMS', 'taskId', tid) || window.IMPL_CHECKLIST_ITEMS.filter(function (c) { return c.taskId === tid; })).sort(function (a,b) { return a.order - b.order; }); }
  function imtCommentsOf(tid)  { return window.IMPL_COMMENTS.filter(function (c) { return c.taskId === tid; }).sort(function (a,b) { return (a.createdAt||'').localeCompare(b.createdAt||''); }); }
  function imtAttachmentsOf(tid) { return window.IMPL_ATTACHMENTS.filter(function (a) { return a.taskId === tid; }); }
  function imtIssue(id)        { return imtFirst('IMPL_ISSUES', id); }
  function imtIssuesOfProject(pid) { return (imtGrp('IMPL_ISSUES', 'projectId', pid) || window.IMPL_ISSUES.filter(function (i) { return i.projectId === pid; })).sort(function (a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }); }

  // ── สร้าง row เต็มสำหรับ imtApplyLocal('IMPL_TASKS', ...) จาก Task object ปัจจุบัน + overrides
  // (เช่น {status:'done'}) — ต้องรวม sort_order เสมอ ไม่งั้น transform จะ default เป็น 99 ทำให้ลำดับ Task
  // ในโครงการเพี้ยนไปทันทีทุกครั้งที่มีการอัปเดตสถานะแบบไม่ผ่านฟอร์ม "แก้ไข Task" เต็ม (เจอบั๊กนี้มาแล้ว
  // ใน imtMarkDone/imtDrop — รวมเป็น helper เดียวกันเพื่อกันพลาดซ้ำ) ──
  function imtTaskRow(t, overrides) {
    return Object.assign({
      phase_id:t.phaseId, project_id:t.projectId, task_name:t.name, description:t.description,
      owner:t.ownerId, start_date:t.start, due_date:t.due, priority:t.priority, status:t.status,
      progress_percent:t.progress, sort_order:t.order,
    }, overrides || {});
  }

  function imtStatus(id)      { return window.IMPL_STATUS.find(function (s) { return s.id === id; }) || window.IMPL_STATUS[0]; }
  function imtIssueStatus(id) { return window.IMPL_ISSUE_STATUS.find(function (s) { return s.id === id; }) || window.IMPL_ISSUE_STATUS[0]; }

  // ── สีสุขภาพของ Phase อ้างอิงจาก % ความคืบหน้าจริง (ไม่ใช่ field สถานะที่ตั้งเองซึ่งบางทีลืมอัปเดต) —
  // ใช้ร่วมกันทั้งกราฟและการ์ดรายละเอียด Phase ในหน้า Report กันสีไม่ตรงกันระหว่างสองที่ ──
  function imtPhaseHealthColor(pct) {
    if (pct >= 100) return imtStatus('done').color;
    if (pct > 0) return imtStatus('in_progress').color;
    return imtStatus('not_started').color;
  }

  function statusTag(st) { return '<span class="tag" style="background:'+st.color+'18;color:'+st.color+'">'+st.icon+' '+esc(st.label)+'</span>'; }
  var pbarHtml = window.pbarHtml;
  // ── หาโครงการต้นทาง (window.PROJECTS) ของโครงการ impl-tracker หนึ่งๆ — ตรรกะอยู่ที่ src/utils/project-team.util.js
  // ที่เดียว (ใช้ร่วมกับหน้าปัญหาทั้งหมด และระบบอบรม) ป้องกันแต่ละจุดเดาโครงการต้นทาง/ทีมงานไม่ตรงกัน ──
  function imtResolveSourceProject(proj) { return window.ProjectTeam.source(proj, window.PROJECTS); }

  // ── ทีมงานของโครงการ (ตามโครงการต้นทางที่ผูกไว้/เดาไว้) —
  // ใช้จำกัดตัวเลือก "ผู้รับผิดชอบ" ให้เลือกได้เฉพาะคนที่อยู่ในทีมโครงการจริง ไม่ใช่พนักงานทั้งบริษัท ──
  function imtProjectTeamStaff(pid) {
    var seen = {};
    return window.ProjectTeam.staffIds(imtProject(pid), window.PROJECTS).map(function (sid) { return window.gSt(sid); })
      .filter(function (s) { return s && s.id && !seen[s.id] && (seen[s.id] = true); });
  }
  window.imtProjectTeamStaff = imtProjectTeamStaff; // ── ใช้ร่วมกับแท็บ "แบบฟอร์ม" (form-tracker.js) กันซ้ำ ──

  // ── Markup ของ combobox "ผู้รับผิดชอบ" — รูปแบบเดียวกับ combobox เลือกโครงการ (ค้นหา + คลิกเลือก
  // + position:fixed กันโดน overflow ของ modal ตัด) แทน input+datalist เดิม (บาง browser ไม่โชว์ label) ──
  // ── ค่าที่เลือก (#imt-t-owner) = รหัสพนักงาน ──
  function imtStaffComboMarkup(curId, disabled) {
    if (disabled) return '<input class="f-input" value="'+esc(window.staffNickByRef(curId)||'-')+'" disabled><input type="hidden" id="imt-t-owner" value="'+esc(curId||'')+'">';
    return '<div id="imt-t-owner-wrap" style="position:relative;">'
      +   '<input id="imt-t-owner-cmb-input" type="text" class="f-input" placeholder="ค้นหาหรือเลือกชื่อ..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
      +   '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
      +   '<input type="hidden" id="imt-t-owner" value="'+esc(curId||'')+'">'
      +   '<div id="imt-t-owner-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
      +     '<div id="imt-t-owner-list" style="max-height:220px;overflow-y:auto;"></div>'
      +   '</div>'
      + '</div>';
  }

  // ── Searchable Combobox: เลือก "ผู้รับผิดชอบ" จากทีมงานของโครงการเท่านั้น (ไม่ใช่พนักงานทั้งบริษัท) —
  // แบบเดียวกับ _initImtProjCombobox แต่ไม่มีการจัดกลุ่ม เพราะทีมงานต่อโครงการมีไม่กี่คน ──
  window._initImtStaffCombobox = (function () {
    var IH = 34;
    function hi(txt, q) {
      if (!q) return esc(txt);
      var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
      while (i < txt.length) {
        var x = lt.indexOf(lq, i);
        if (x < 0) { out += esc(txt.slice(i)); break; }
        out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
        i = x + lq.length;
      }
      return out;
    }
    return function (staffList, curId) {
      var inp = document.getElementById('imt-t-owner-cmb-input'), drop = document.getElementById('imt-t-owner-drop'),
        lst = document.getElementById('imt-t-owner-list'), hid = document.getElementById('imt-t-owner');
      if (!inp || !drop || !lst || !hid) return;
      var UNASSIGNED = '— ไม่ระบุผู้รับผิดชอบ —';
      var label = function (s) { var nick = s.nickname || s.name; return s.name + ' (' + nick + ')'; };
      var items = staffList.map(function (s) { return { id:s.id, label:label(s) }; });
      var selId = curId || '', q = '', fi = -1, flat = [], dt = null, isOpen = false;
      var curStaff = window.staffByRef(selId); // ผู้รับผิดชอบเดิมที่ไม่อยู่ในทีมแล้ว ยังแสดงชื่อได้
      var selLabel = curStaff ? label(curStaff) : '';
      function bFlat(sq) {
        var f = [], lq = sq.toLowerCase();
        if (!sq) f.push({ id:'', label:UNASSIGNED, unbound:true });
        items.forEach(function (it) { if (!sq || it.label.toLowerCase().indexOf(lq) !== -1) f.push(it); });
        return f;
      }
      function render() {
        if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบชื่อ' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
        lst.innerHTML = flat.map(function (it, idx) {
          var foc = idx === fi, isSel = !it.unbound && it.id === selId;
          return '<div class="imto-i" data-id="' + esc(it.id) + '" data-label="' + esc(it.label) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:' + (it.unbound ? 'var(--txt3);font-style:italic;' : 'var(--txt1);') + '">'
            + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
            + (it.unbound ? esc(it.label) : hi(it.label, q))
            + '</div>';
        }).join('');
      }
      function positionDrop() { window.placeDropdown(inp, drop, lst, 260); }
      function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selLabel; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
      function selItem(id, lbl) { selId = id; selLabel = id ? lbl : ''; hid.value = id; closeDrop(); hid.dispatchEvent(new Event('change')); }
      lst.addEventListener('click', function (e) { var it = e.target.closest('.imto-i'); if (it) selItem(it.dataset.id, it.dataset.label); });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.imto-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); render(); }, 150); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].id, flat[fi].label); }
      });
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('imt-t-owner-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target)) closeDrop(); });
      inp.value = selLabel; flat = bFlat(''); render();
    };
  })();

  // ── Tab Bar ── ("ปัญหา" คือ Issue Log ที่เคยตัดออกไปเพราะไม่ได้ใช้งาน — รื้อฟื้นกลับมาพร้อมปรับฟิลด์ใหม่
  // ให้ตรงกับรายงานสรุปปัญหาการใช้งานโปรแกรมรายโครงการที่ รพ. เซ็นรับทราบ แทน Google Sheet แยกไฟล์เดิม)
  // ── 2 ระดับ: แถวบน = มุมมองรวม (ทุกโครงการ / รายโครงการ / Template) · หัวโครงการ + แท็บของโครงการ (TABS_NEED_PROJECT)
  // แสดงเมื่ออยู่ในโครงการ ให้รู้ทันทีว่ากำลังดูโครงการไหน ──
  var TABS = [
    { id:'dashboard', label:'ทุกโครงการ',       icon:'📊' },
    { id:'workspace', label:'งาน',              icon:'🗃️' },
    { id:'issues',    label:'ปัญหา',             icon:'🩹' },
    { id:'forms',     label:'แบบฟอร์ม',          icon:'📄' },
    { id:'training',  label:'อบรม',              icon:'🎓' }, // ระบบอบรมของโครงการ (src/modules/training.js — 1 โครงการ = 1 การอบรม)
    { id:'calendar',  label:'Calendar',          icon:'📅' },
    { id:'report',    label:'Report',            icon:'📈' },
    { id:'print',     label:'พิมพ์เอกสาร',       icon:'🖨️' },
    { id:'templates', label:'Template',          icon:'📐' },
  ];
  // แท็บที่ต้องใช้ project switcher (ทุกแท็บยกเว้น dashboard ซึ่งเป็นมุมมองรวมทุกโครงการอยู่แล้ว)
  var TABS_NEED_PROJECT = ['workspace','issues','forms','training','calendar','report','print'];

  window.imtGoTab = function (tab) {
    window.imtTab = tab;
    if (TABS_NEED_PROJECT.indexOf(tab) !== -1) window.imtLastProjTab = tab; // ปุ่ม "รายโครงการ" กลับมาแท็บล่าสุด
    // ── แท็บที่ต้องมีโครงการ (งาน/แบบฟอร์ม/Calendar/Report) แต่ยังไม่มีโครงการ "กำลังดู" อยู่ — auto-select ให้
    // แทนที่จะโผล่หน้าเปล่า ๆ ให้เลือกเอง (เริ่มแอปยังคงอยู่ที่ Dashboard ตามปกติ ไม่ถูกเรียกจุดนี้จนกว่าจะกดเข้าแท็บ) ──
    if (tab === 'training' && !window.canView('training')) tab = window.imtTab = 'workspace';
    if (TABS_NEED_PROJECT.indexOf(tab) !== -1 && !window.imtCurrentProjectId) window.imtIndexPass(_imtAutoSelectProject);
    window.renderImplTracker();
  };

  window.imtSelectProject = function (pid) {
    window.imtCurrentProjectId = pid;
    window.imtTab = 'workspace';
    window.renderImplTracker();
  };

  // ── ดริลดาวน์จากกราฟ/การ์ดในหน้า Report → แท็บ "งาน" พร้อมตัวกรองที่ตรงกับสิ่งที่คลิก
  // รีเซ็ตตัวกรองอื่นทั้งหมดก่อน กันกรณีมีตัวกรองเดิมค้างอยู่จนผลลัพธ์กลายเป็นว่างเปล่า ──
  window.imtGoToTaskStatus = function (statusId) {
    window.imtTaskFilter = { q:'', status:statusId, owner:'', phaseId:'' };
    window.imtGoTab('workspace');
  };
  window.imtGoToPhaseTasks = function (phaseId) {
    window.imtTaskFilter = { q:'', status:'', owner:'', phaseId:phaseId };
    window.imtGoTab('workspace');
  };

  // ── Project Switcher: สลับโครงการได้จากทุกแท็บโดยไม่ต้องย้อนกลับ Dashboard ──
  window.imtSwitchProject = function (pid) {
    window.imtCurrentProjectId = pid;
    window.renderImplTracker();
  };

  var _imtSwitcherPending = null;
  // ── หัวโครงการ: { top: ชื่อโครงการ (combobox ค้นหา/สลับ) + ความคืบหน้า + สถานะ — วางในแถวบนสุดต่อจากแท็บหลัก,
  //               tabs: แถวแท็บของโครงการ } ──
  function renderProjectHeader() {
    _imtSwitcherPending = null;
    var none = { top: '', tabs: '' };
    if (TABS_NEED_PROJECT.indexOf(window.imtTab) === -1) return none;
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) return none; // ยังไม่เลือกโครงการ — แต่ละแท็บมี empty-state picker ของตัวเองอยู่แล้ว ไม่ต้องซ้ำ
    // ── ตัวกรอง "แสดงเฉพาะโครงการที่ยังไม่เสร็จ" ในตัวเลือกโครงการ — ค่าเริ่มต้นติ๊กไว้ (undefined !== false → true)
    // ซ่อนโครงการที่เสร็จแล้ว 100% ออกจากรายการให้สลับ แต่ยังคงโครงการที่กำลังดูอยู่ตอนนี้ไว้เสมอ ──
    var hideDoneProjects = window.imtHideDoneProjects !== false;
    var switchableProjects = window.IMPL_PROJECTS.filter(function (p) {
      return !hideDoneProjects || p.id === pid || imtProjectHealth(p).level !== 'done';
    });
    // ── ตัวเลือกเป็น combobox ค้นหา + จัดกลุ่มตามประเภทงาน (typeId ยืมจากโครงการต้นทาง) — ผูก listener
    // หลัง renderTabs ใส่ markup ลง DOM แล้ว (ดู _imtSwitcherPending ใน renderTabs) ──
    _imtSwitcherPending = {
      pid: pid,
      items: switchableProjects.map(function (p) { var sp = imtResolveSourceProject(p); return { id: p.id, name: p.name, typeId: sp ? sp.typeId : '' }; })
    };
    var pct = window.calcProjectProgress(proj);
    var h = imtProjectHealth(proj);
    var hideDoneChk = '<label class="imt-hidedone-chk imt-ph-chk" title="ตัวเลือกโครงการแสดงเฉพาะโครงการที่ยังไม่เสร็จ">'
      + '<input type="checkbox" '+(hideDoneProjects?'checked':'')+' onchange="window.imtToggleHideDoneProjects(this.checked)"> เฉพาะที่ยังไม่เสร็จ'
      + '</label>';
    var ptabs = TABS.filter(function (t) {
      return TABS_NEED_PROJECT.indexOf(t.id) !== -1 && (t.id !== 'training' || window.canView('training'));
    }).map(function (t) {
      return '<div class="adv-subtab'+(window.imtTab===t.id?' on':'')+'" onclick="window.imtGoTab(\''+t.id+'\')">'+t.icon+' '+t.label+'</div>';
    }).join('');
    return {
      top: '<div class="imt-phead-top">'
        +   '<div class="imt-phead-pick">'+window.projectComboHtml('imt-sw-cmb', 'imt-sw-pid', 'ค้นหาหรือเลือกโครงการ...', 'width:100%;min-width:0;')+'</div>'
        +   '<div class="imt-phead-meta">'
        +     '<div class="imt-switcher-progress"><div class="imt-switcher-pbar">'+pbarHtml(pct)+'</div><span class="imt-phead-pct">'+pct+'%</span>'+window.calcTip("ความคืบหน้าโครงการ = ค่าเฉลี่ยของทุก Phase\nPhase = ค่าเฉลี่ยของทุกงานใน Phase\nงาน = Checklist ที่ติ๊กแล้ว ÷ Checklist ทั้งหมด (ไม่มี Checklist: เสร็จแล้ว = 100%)")+'</div>'
        +     '<span class="imt-phead-badge" style="color:'+h.color+';background:'+h.color+'1a;border-color:'+h.color+'40;">'+h.icon+' '+esc(h.label)+'</span>'+(h.score !== null ? window.calcTip('ระดับจากคะแนนสุขภาพ '+h.score+'/100\n'+"คะแนนสุขภาพ 0–100 (สูง = ดี) เริ่มที่ 100 แล้วหัก 4 ด้าน (รวมเต็ม 90 ปรับเป็นสเกล 100):\n• ช้ากว่าแผน สูงสุด 35 (ช้า 30% = หักเต็ม)\n• งานเกินกำหนด สูงสุด 25 (งานละ 4 + วันที่เกินนานสุด ÷ 2)\n• ปัญหาค้าง สูงสุด 20 (น้ำหนักตามความรุนแรง ต่ำ1/กลาง2/สูง4/วิกฤต8, ค้าง ≥14 วัน +1, ×2)\n• ไม่เคลื่อนไหวเกิน 7 วัน สูงสุด 10\nเลยกำหนดจบ = ไม่เกิน 59 · มีงานเกินกำหนด = ไม่เกิน 79\n< 60 ล่าช้า · 60–79 ต้องติดตามพิเศษ · ≥ 80 ปกติ") : '')
        +     hideDoneChk
        +   '</div>'
        + '</div>',
      tabs: '<div class="imt-phead">'
        + '<div class="imt-ptabs-row"><div class="imt-ptabs"><div class="adv-seg">'+ptabs+'</div></div>'
        +   '<div class="imt-ptab-extra" id="imt-ptab-extra"></div></div>' // ข้อมูล/ปุ่มของแท็บที่เปิดอยู่ (imtSetPtabExtra)
        + '</div>'
    };
  }

  // ── ช่องท้ายแถวแท็บของโครงการ — แท็บใส่ความคืบหน้า/ปุ่ม action ของตัวเองไว้ตรงนี้ แทนแถวหัวแยกเหนือตัวกรอง ──
  window.imtSetPtabExtra = function (html) {
    var el = document.getElementById('imt-ptab-extra');
    if (el) el.innerHTML = html || '';
  };

  function renderTabs() {
    var el = document.getElementById('imt-tabs');
    if (!el) return;
    var inProj = TABS_NEED_PROJECT.indexOf(window.imtTab) !== -1;
    var top = [
      { on: window.imtTab === 'dashboard', go: "window.imtGoTab('dashboard')", icon: '📊', label: 'ทุกโครงการ' },
      { on: inProj, go: "window.imtGoTab(window.imtLastProjTab||'workspace')", icon: '🗂️', label: 'รายโครงการ' },
      { on: window.imtTab === 'templates', go: "window.imtGoTab('templates')", icon: '📐', label: 'Template' },
    ];
    var tabsHtml = top.map(function (t) {
      return '<div class="adv-subtab'+(t.on?' on':'')+'" onclick="'+t.go+'">'+t.icon+' '+t.label+'</div>';
    }).join('');
    tabsHtml = '<div class="adv-seg">'+tabsHtml+'</div>'; // สวิตช์ segmented แบบเดียวกับเมนู งบประมาณ & ค่าใช้จ่าย
    var addBtn = window.canAdd(window.IMPL_MODULE)
      ? '<button class="btn btn-pri btn-sm imt-tabs-addbtn" onclick="window.openImtProjectModal(null)">+<span class="btn-label"> เพิ่มโครงการ</span></button>' : '';
    // ปุ่ม 🤖 AI สรุปภาพรวม อยู่แถวบนข้างปุ่มเพิ่มโครงการ (เฉพาะแท็บทุกโครงการ) — เป็นคำสั่งระดับหน้า ไม่ใช่ตัวกรอง
    var aiBtn = window.imtTab === 'dashboard' && window.IMPL_PROJECTS.length
      ? '<button class="btn btn-pri btn-sm imt-ai-btn imt-tabs-addbtn" onclick="window.imtRunAiOverview()"'+(_imtAiOverview && _imtAiOverview.loading ? ' disabled' : '')+' title="ให้ AI สรุปว่าโครงการไหนต้องติดตาม และควรทำอะไรเพิ่ม">🤖<span class="btn-label"> AI สรุปภาพรวม</span></button>' : '';
    var ph = renderProjectHeader();
    var tabsRow = '<div class="imt-tabs-row'+(ph.top?' has-proj':'')+'"><div class="imt-tabs-scroll">'+tabsHtml+'</div>'+ph.top+aiBtn+addBtn+'</div>';
    el.innerHTML = tabsRow + ph.tabs;
    if (_imtSwitcherPending) {
      var sw = _imtSwitcherPending;
      window.initProjectCombobox(window.projectComboIds('imt-sw-cmb', 'imt-sw-pid'), sw.items, sw.pid,
        function (id) { if (id && id !== window.imtCurrentProjectId) window.imtSwitchProject(id); }, { fixed: true, minWidth: 340 });
    }
  }

  // ── เลือกโครงการที่ยังไม่เสร็จ/ไม่ถูกยกเลิก และมีวันสิ้นสุดใกล้ที่สุด (เร่งด่วนที่สุด) ให้เป็นโครงการ "กำลังดู"
  // อัตโนมัติ — เรียกจาก imtGoTab ตอนกดเข้าแท็บที่ต้องมีโครงการเท่านั้น (ดูจุดเรียกด้านบน) ──
  function _imtAutoSelectProject() {
    if (!window.IMPL_PROJECTS || !window.IMPL_PROJECTS.length) return;
    var ongoing = window.IMPL_PROJECTS.filter(function (p) {
      var lvl = imtProjectHealth(p).level;
      return p.end && lvl !== 'done' && lvl !== 'cancelled';
    });
    var pool = ongoing.length ? ongoing : window.IMPL_PROJECTS.filter(function (p) { return p.end; });
    if (!pool.length) return;
    pool.sort(function (a, b) { return pd(a.end) - pd(b.end); });
    window.imtCurrentProjectId = pool[0].id;
  }

  // ── Main Dispatcher ──
  window.renderImplTracker = function () { window.imtIndexPass(renderImplTrackerNow); };
  function renderImplTrackerNow() {
    renderTabs();
    var mount = document.getElementById('imt-content');
    if (!mount) return;
    if (window.imtTrainingShow) window.imtTrainingShow(window.imtTab === 'training'); // หน้าอบรม (src/modules/training.js) อยู่กล่องแยก ซ่อนเมื่ออยู่แท็บอื่น
    var fns = {
      dashboard: renderImtDashboard, workspace: renderImtWorkspace, issues: renderImtIssues,
      forms: function (m) { window.renderImtForms && window.renderImtForms(m); },
      training: function (m) { window.renderImtTraining && window.renderImtTraining(m); },
      print: function (m) { window.renderImtPrintDocuments && window.renderImtPrintDocuments(m); },
      calendar: renderImtCalendar, report: renderImtReport, templates: renderImtTemplates,
    };
    (fns[window.imtTab] || renderImtDashboard)(mount);
  }

  // ── % ที่ "ควรได้" ณ วันนี้ คิดจากกำหนดของแต่ละงาน ถ่วงแบบเดียวกับ calcProjectProgress (งาน → Phase → โครงการ)
  // จึงเทียบกับ % จริงได้ตรง ๆ — งานมีวันเริ่ม = ไล่เชิงเส้นจากวันเริ่มถึงสิ้นวันครบกำหนด, ไม่มีวันเริ่ม = 0% จนพ้นวันครบกำหนด,
  // งานไม่มีกำหนด/ยกเลิก = ใช้ % จริงของงานนั้น (ไม่ดึงค่าให้ต่าง) · คืน null ถ้าไม่มีงานไหนมีวันครบกำหนดเลย ──
  function imtPlannedProgress(pid, today) {
    var phases = imtPhasesOf(pid), hasDue = false, now = today.getTime();
    if (!phases.length) return null;
    var sum = phases.reduce(function (s, ph) {
      var tasks = imtTasksOfPhase(ph.id);
      if (!tasks.length) return s;
      return s + tasks.reduce(function (ts, t) {
        if (!t.due || t.status === 'cancelled') return ts + window.calcTaskProgress(t);
        hasDue = true;
        var end = pd(t.due).getTime() + 86400000, st = t.start ? pd(t.start).getTime() : null;
        if (now >= end) return ts + 100;
        if (st === null || now <= st || end <= st) return ts;
        return ts + (now - st) / (end - st) * 100;
      }, 0) / tasks.length;
    }, 0);
    return hasDue ? Math.round(sum / phases.length) : null;
  }

  // ── วันที่มีความเคลื่อนไหวล่าสุดของโครงการ (activity log / แก้ไขงาน / ปัญหา) — ใช้จับ "โครงการเงียบ"
  // ซึ่งมักเป็นโครงการที่มีปัญหาแต่ไม่มีใครอัปเดต ──
  function imtLastUpdate(p) {
    var last = String(p.updatedAt || p.createdAt || '').slice(0, 10);
    function bump(v) { v = String(v || '').slice(0, 10); if (v > last) last = v; }
    (window.imtGroupOf('IMPL_ACTIVITY_LOG', 'projectId', p.id) || window.IMPL_ACTIVITY_LOG).forEach(function (a) { if (a.projectId === p.id) bump(a.createdAt); });
    (window.imtGroupOf('IMPL_TASKS', 'projectId', p.id) || window.IMPL_TASKS).forEach(function (t) { if (t.projectId === p.id) bump(t.updatedAt); });
    (window.imtGroupOf('IMPL_ISSUES', 'projectId', p.id) || window.IMPL_ISSUES).forEach(function (i) { if (i.projectId === p.id) bump(i.updatedAt || i.createdAt); });
    return last;
  }

  var IMT_SEVERITY_WEIGHT = { low:1, medium:2, high:4, critical:8 };
  var IMT_SILENT_DAYS = 7;
  function imtScoreColor(score) { return score >= 80 ? 'var(--teal)' : score >= 60 ? 'var(--amber)' : 'var(--coral)'; }

  // ── Project Health: ให้ PM เห็นได้ทันทีว่าโครงการไหนล่าช้า/ต้องติดตามพิเศษ/ปกติ — ระดับคิดจาก Health Score ด้านล่าง ──
  // ── ภายในรอบ render เดียวกันคำนวณครั้งเดียวต่อโครงการ (ถูกเรียกซ้ำจากหัวโครงการ/Dashboard/comparator ของ sort) ──
  function imtProjectHealth(p) {
    var memo = window.imtPassMemo('health'), hit = memo ? memo.get(p) : undefined;
    if (hit) return hit;
    var h = imtProjectHealthCalc(p);
    if (memo) memo.set(p, h);
    return h;
  }
  function imtProjectHealthCalc(p) {
    var tasks = imtTasksOfProject(p.id);
    var today = new Date(new Date().toDateString());
    var dayDiff = function (d) { return Math.round((today - pd(String(d).slice(0,10))) / 86400000); };
    var overdueTasks = tasks.filter(function (t) { return window.imtIsOverdue(t); })
      .sort(function (a,b) { return (a.due||'').localeCompare(b.due||''); });
    var overdue = overdueTasks.length;
    var dueSoon = tasks.filter(function (t) { return window.imtIsDueSoon(t, 3); }).length;
    var progress = window.calcProjectProgress(p);
    var lastUpdate = imtLastUpdate(p);
    var silentDays = lastUpdate ? dayDiff(lastUpdate) : null;
    var base = { progress:progress, overdue:overdue, dueSoon:dueSoon, expected:null, gap:0, score:null, reason:'', lastUpdate:lastUpdate, silentDays:silentDays };

    if (p.status === 'cancelled') {
      return Object.assign(base, { level:'cancelled', label:'ยกเลิก', color:'#6c757d', icon:'🚫', overdue:0, dueSoon:0 });
    }
    if (p.status === 'done' || progress >= 100) {
      return Object.assign(base, { level:'done', label:'เสร็จสมบูรณ์', color:'#4361ee', icon:'🏁', dueSoon:0 });
    }

    // ── เป้าหมาย: ใช้กำหนดของงานจริงก่อน (แม่นกว่า เพราะงานไม่ได้กระจายเท่า ๆ กันตลอดโครงการ)
    // ไม่มีงานไหนตั้งวันครบกำหนดไว้ → ย้อนไปใช้สัดส่วนเวลาจากวันเริ่ม–วันจบโครงการแบบเดิม ──
    var expected = imtPlannedProgress(p.id, today);
    if (expected === null && p.start && p.end) {
      var s = pd(p.start).getTime(), e = pd(p.end).getTime();
      if (e > s) expected = Math.max(0, Math.min(100, Math.round((today.getTime() - s) / (e - s) * 100)));
    }
    var pastEnd = p.end && pd(p.end) < today;
    var gap = expected !== null ? Math.max(0, expected - progress) : 0;

    // ── Health Score 0–100 (สูง = ดี): หักคะแนนตาม 4 ด้าน รวมเต็ม 90 แล้วปรับสเกลเป็น 100
    // (ด้านงบประมาณอีก 10% ยังคิดไม่ได้จนกว่า impl_projects จะเชื่อมกับสัญญา/ค่าใช้จ่าย) ──
    var openIss = (window.imtGroupOf('IMPL_ISSUES', 'projectId', p.id) || window.IMPL_ISSUES).filter(function (i) { return i.projectId === p.id && i.status !== 'closed'; });
    var issW = openIss.reduce(function (w, i) { return w + (IMT_SEVERITY_WEIGHT[i.severity] || 2) + (dayDiff(i.createdAt || today.toISOString()) >= 14 ? 1 : 0); }, 0);
    var maxOverdueDays = overdue ? dayDiff(overdueTasks[0].due) : 0;
    var pen = {
      gap:     Math.min(35, gap * 35 / 30),
      overdue: Math.min(25, overdue * 4 + maxOverdueDays / 2),
      issue:   Math.min(20, issW * 2),
      stale:   silentDays !== null && silentDays > IMT_SILENT_DAYS ? Math.min(10, (silentDays - IMT_SILENT_DAYS) / 2) : 0,
    };
    var score = Math.max(0, Math.round(100 - (pen.gap + pen.overdue + pen.issue + pen.stale) * 100 / 90));
    var worst = Object.keys(pen).sort(function (a,b) { return pen[b] - pen[a]; })[0];
    var hiIss = openIss.filter(function (i) { return i.severity === 'high' || i.severity === 'critical'; }).length;
    var endDays = pastEnd ? dayDiff(p.end) : 0;
    var reason = pastEnd ? 'เลยกำหนดจบ ' + endDays + ' วัน' + (overdue ? ' · งานเกินกำหนด ' + overdue + ' งาน' : '')
      : !pen[worst] ? ''
      : worst === 'gap' ? 'ช้ากว่าแผน ' + gap + '%'
      : worst === 'overdue' ? 'งานเกินกำหนด ' + overdue + ' งาน · นานสุด ' + maxOverdueDays + ' วัน (' + overdueTasks[0].name + ')'
      : worst === 'issue' ? 'ปัญหาค้าง ' + openIss.length + ' เรื่อง' + (hiIss ? ' (สูง/วิกฤต ' + hiIss + ')' : '')
      : 'ไม่มีความเคลื่อนไหว ' + silentDays + ' วัน';

    // ── ระดับ = คะแนน (สีป้ายกับสีคะแนนต้องตรงกันเสมอ ไม่งั้น "ล่าช้า 86" ดูขัดกันเอง): <60 ล่าช้า · <80 ติดตามพิเศษ · ≥80 ปกติ
    // กฎบังคับ: เลยกำหนดจบโครงการ = ล่าช้าเสมอ (คะแนนไม่เกิน 59) · มีงานเกินกำหนด = อย่างน้อยติดตามพิเศษ (คะแนนไม่เกิน 79) ──
    if (pastEnd) score = Math.min(score, 59);
    else if (overdue) score = Math.min(score, 79);
    Object.assign(base, { expected:expected, gap:gap, score:score, reason:reason });

    if (score < 60) return Object.assign(base, { level:'delayed', label:'ล่าช้า', color:'#ff6b6b', icon:'🔴' });
    if (score < 80) return Object.assign(base, { level:'risk', label:'ต้องติดตามพิเศษ', color:'#ffa62b', icon:'🟡' });
    return Object.assign(base, { level:'ontrack', label:'ปกติ', color:'#06d6a0', icon:'🟢' });
  }

  var IMT_HEALTH_ORDER = { delayed:0, risk:1, ontrack:2, done:3, cancelled:4 };

  // การ์ดโครงการแบบเดียวกับที่ใช้ใน Dashboard — reuse ทั้ง Dashboard และ Project Picker (หน้า "งาน"/Calendar
  // ตอนยังไม่ได้เลือกโครงการ) เพื่อให้เห็นสถานะ/กำหนดจบ/ความคืบหน้าตั้งแต่ตอนเลือกโครงการ ไม่ต้องเข้าไปดูก่อนถึงจะรู้
  function imtHealthCardHtml(p, h, opts) {
    h = h || imtProjectHealth(p);
    var flag = h.overdue ? '<span class="imt-hcard-flag" style="color:var(--coral)">⏰ เกินกำหนด '+h.overdue+' งาน</span>'
      : h.dueSoon ? '<span class="imt-hcard-flag" style="color:var(--amber)">⏳ ใกล้ครบกำหนด '+h.dueSoon+' งาน</span>' : '';
    var endInfo = '';
    if (p.end) {
      var diffDays = Math.round((pd(p.end) - new Date(new Date().toDateString())) / 86400000);
      if (h.level === 'done' || h.level === 'cancelled') endInfo = 'กำหนดจบ '+fd(p.end);
      else if (diffDays < 0) endInfo = '<span style="color:var(--coral);font-weight:700;">เลยกำหนดจบ '+(-diffDays)+' วัน</span>';
      else endInfo = 'เหลือ '+diffDays+' วันถึงกำหนดจบ';
    }

    // ── expandable: ใช้ในหน้าเลือกโครงการ (projectPicker) ให้ดูรายการ Task ที่ยังไม่เสร็จ
    // และกดอัปเดตสถานะได้ทันทีโดยไม่ต้องเข้าไปหน้า "งาน" เต็มก่อน ──
    var expandHtml = '';
    if (opts && opts.expandable) {
      var remaining = imtTasksOfProject(p.id).filter(function (t) { return t.status !== 'done' && t.status !== 'cancelled'; });
      var soleProject = window.IMPL_PROJECTS.length === 1;
      var manualState = window['_imtPickerExpand_'+p.id];
      var expanded = manualState === true || (soleProject && manualState !== false);
      expandHtml = '<div class="imt-hcard-expand-hint" onclick="event.stopPropagation();window.imtTogglePickerCard(\''+p.id+'\')">'
        + (expanded ? '▲ ซ่อนรายการงาน' : '▼ ดูงานที่เหลือ ('+remaining.length+')') + '</div>';
      if (expanded) {
        remaining.sort(function (a,b) {
          var ao = window.imtIsOverdue(a) ? 0 : 1, bo = window.imtIsOverdue(b) ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return (a.due||'9999-99-99').localeCompare(b.due||'9999-99-99');
        });
        var rows = remaining.slice(0, 12).map(function (t) {
          var st = imtStatus(t.status);
          var overdue = window.imtIsOverdue(t);
          var dueLabel = t.due ? (overdue ? '<span style="color:var(--coral);font-weight:700;">'+fd(t.due)+'</span>' : fd(t.due)) : '—';
          return '<div class="imt-picker-task-row" onclick="event.stopPropagation();window.imtOpenTaskFromDash(\''+t.id+'\',\''+p.id+'\')">'
            + '<span class="tag" style="background:'+st.color+'18;color:'+st.color+';flex-shrink:0;">'+st.icon+'</span>'
            + '<span class="imt-picker-task-name">'+esc(t.name)+'</span>'
            + '<span class="imt-picker-task-due">'+dueLabel+'</span>'
            + '</div>';
        }).join('') || '<div style="color:var(--txt3);font-size:11.5px;padding:8px 0;text-align:center;">🎉 ไม่มีงานค้าง</div>';
        var more = remaining.length > 12 ? '<div class="imt-dash-more">และอีก '+(remaining.length - 12)+' งาน</div>' : '';
        expandHtml += '<div class="imt-picker-tasklist" onclick="event.stopPropagation();">'
          + rows + more
          + '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;" onclick="window.imtSelectProject(\''+p.id+'\')">เปิดดูแบบเต็ม (Phase / List / Kanban) →</button>'
          + '</div>';
      }
    }

    var scoreHtml = h.score !== null
      ? '<span class="imt-hcard-score" style="color:'+imtScoreColor(h.score)+';border-color:'+imtScoreColor(h.score)+'" >'+h.score+'</span>'+window.calcTip("คะแนนสุขภาพ 0–100 (สูง = ดี) เริ่มที่ 100 แล้วหัก 4 ด้าน (รวมเต็ม 90 ปรับเป็นสเกล 100):\n• ช้ากว่าแผน สูงสุด 35 (ช้า 30% = หักเต็ม)\n• งานเกินกำหนด สูงสุด 25 (งานละ 4 + วันที่เกินนานสุด ÷ 2)\n• ปัญหาค้าง สูงสุด 20 (น้ำหนักตามความรุนแรง ต่ำ1/กลาง2/สูง4/วิกฤต8, ค้าง ≥14 วัน +1, ×2)\n• ไม่เคลื่อนไหวเกิน 7 วัน สูงสุด 10\nเลยกำหนดจบ = ไม่เกิน 59 · มีงานเกินกำหนด = ไม่เกิน 79\n< 60 ล่าช้า · 60–79 ต้องติดตามพิเศษ · ≥ 80 ปกติ") : '';
    var progressTxt = h.expected !== null && h.score !== null
      ? 'ได้จริง '+h.progress+'% · ควรได้ '+h.expected+'%' + (h.gap ? ' <b style="color:'+(h.gap>20?'var(--coral)':h.gap>8?'var(--amber)':'var(--txt2)')+'">(ช้า '+h.gap+'%)</b>' : '')
      : h.progress+'% เสร็จแล้ว';
    var silent = h.silentDays !== null && h.silentDays >= IMT_SILENT_DAYS;
    var updTxt = h.silentDays === null ? '' : h.silentDays <= 0 ? 'อัปเดตวันนี้' : 'อัปเดต '+h.silentDays+' วันก่อน';
    var footHtml = h.score !== null && (h.reason || updTxt)
      ? '<div class="imt-hcard-foot"><span class="imt-hcard-reason" title="'+esc(h.reason)+'">'+(h.reason ? '⚠ '+esc(h.reason) : '')+'</span>'
        + '<span'+(silent?' style="color:var(--coral);font-weight:700;"':'')+'>'+(silent?'💤 ':'🕒 ')+updTxt+'</span></div>' : '';

    return '<div class="imt-pcard imt-hcard" style="border-left:4px solid '+h.color+';" onclick="window.imtSelectProject(\''+p.id+'\')">'
      + '<div class="imt-hcard-top"><span class="imt-hcard-badge" style="background:'+h.color+'18;color:'+h.color+'">'+h.icon+' '+h.label+'</span><span class="imt-hcard-top-r">'+flag+scoreHtml+'</span></div>'
      + '<div class="imt-pcard-title">'+esc(p.name)+'</div>'
      + '<div class="imt-pcard-sub">👤 '+esc(p.siteOwner||'—')+' &nbsp;·&nbsp; 🔧 '+esc(p.installer||'—')+'</div>'
      + '<div class="imt-hcard-pbar-wrap">'+pbarHtml(h.progress, h.color)+(h.expected!==null?'<div class="imt-hcard-expected" style="left:'+h.expected+'%" title="ควรได้ตามกำหนดการ ~'+h.expected+'%"></div>':'')+'</div>'
      + '<div class="imt-pcard-meta"><span>'+progressTxt+'</span><span>'+endInfo+'</span></div>'
      + footHtml
      + expandHtml
      + '</div>';
  }

  window.imtTogglePickerCard = function (pid) {
    window['_imtPickerExpand_'+pid] = !(window['_imtPickerExpand_'+pid] === true || (window.IMPL_PROJECTS.length === 1 && window['_imtPickerExpand_'+pid] !== false));
    window.renderImplTracker();
  };

  window.imtSetDashHealthFilter = function (level) {
    window.imtDashHealthFilter = level;
    window.renderImplTracker();
  };

  // ── ซ่อนโครงการที่เสร็จแล้ว 100% ออกจากรายการ/ตัวกรองโครงการ ค่าเริ่มต้นติ๊กไว้ (undefined !== false → true)
  // ใช้ร่วมกันทั้ง Dashboard (การ์ดสุขภาพโครงการ) และ projectPicker (ตัวกรองโครงการในแท็บ งาน/Calendar/Report) ──
  window.imtToggleHideDoneProjects = function (checked) {
    window.imtHideDoneProjects = checked;
    window.renderImplTracker();
  };

  // เปิด Task modal จาก Dashboard (ยังไม่ได้เลือกโครงการอยู่) — ต้อง set imtCurrentProjectId ก่อน
  // ไม่งั้น saveImtTask จะบันทึกด้วย project_id ผิด (อ้างอิง imtCurrentProjectId เดิมที่ค้างอยู่)
  window.imtOpenTaskFromDash = function (taskId, projectId) {
    window.imtCurrentProjectId = projectId;
    window.openImtTaskModal(taskId);
  };

  // ── 🤖 AI สรุปภาพรวม: โครงการไหนต้องติดตาม + ควรทำอะไรเพิ่ม — ข้อเท็จจริงทุกตัวคำนวณในโค้ด (สุขภาพโครงการ/
  // งานเกินกำหนด/ปัญหา/ความเสี่ยง/ความเคลื่อนไหวล่าสุด) ส่งให้ AI วิเคราะห์ · เก็บผลไว้ข้ามการ render ซ้ำ ──
  var _imtAiOverview = null; // { loading, text, error, at }
  function imtAiOverviewFacts() {
    var today = new Date(new Date().toDateString());
    var dayDiff = function (d) { return Math.round((today - pd(String(d).slice(0,10))) / 86400000); };
    var rows = window.IMPL_PROJECTS.map(function (p) { return { p:p, h:imtProjectHealth(p) }; })
      .filter(function (x) { return x.h.level !== 'done' && x.h.level !== 'cancelled'; })
      .sort(function (a,b) { return IMT_HEALTH_ORDER[a.h.level] - IMT_HEALTH_ORDER[b.h.level] || b.h.overdue - a.h.overdue; });
    var n = { delayed:0, risk:0, ontrack:0 };
    rows.forEach(function (x) { n[x.h.level]++; });
    var lines = ['วันนี้: ' + fd(window.ymd(today)),
      'โครงการที่ยังไม่เสร็จ ' + rows.length + ' โครงการ: ล่าช้า ' + n.delayed + ' · ต้องติดตามพิเศษ ' + n.risk + ' · ปกติ ' + n.ontrack];
    rows.slice(0, 30).forEach(function (x, i) {
      var p = x.p, h = x.h, pid = p.id;
      var tasks = imtTasksOfProject(pid);
      var overdueT = tasks.filter(function (t) { return window.imtIsOverdue(t); })
        .sort(function (a,b) { return (a.due||'').localeCompare(b.due||''); });
      var stuck = tasks.filter(function (t) { return t.status === 'issue' || t.status === 'review'; });
      var openIss = (window.IMPL_ISSUES || []).filter(function (s) { return s.projectId === pid && s.status !== 'closed'; });
      var acts = (window.IMPL_ACTIVITY_LOG || []).filter(function (a) { return a.projectId === pid; })
        .sort(function (a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); });
      var endTxt = p.end ? (dayDiff(p.end) > 0 ? 'เลยกำหนดจบ ' + dayDiff(p.end) + ' วัน' : 'เหลือ ' + (-dayDiff(p.end)) + ' วันถึงกำหนดจบ') : 'ไม่มีกำหนดจบ';
      lines.push('', (i + 1) + ') ' + p.name + ' [' + h.label + ']',
        '   ความคืบหน้า ' + h.progress + '%' + (h.expected !== null ? ' (ตามแผนควรได้ ~' + h.expected + '%)' : '') + ' · ' + endTxt + (p.installer ? ' · ผู้ดูแล ' + p.installer : ''),
        '   คะแนนสุขภาพ ' + h.score + '/100' + (h.reason ? ' · สาเหตุหลัก: ' + h.reason : ''));
      if (overdueT.length) lines.push('   งานเกินกำหนด ' + overdueT.length + ' งาน: ' + overdueT.slice(0, 3).map(function (t) {
        return t.name + ' (เกิน ' + dayDiff(t.due) + ' วัน' + (t.owner ? ', ' + t.owner : '') + ')'; }).join('; '));
      if (h.dueSoon) lines.push('   งานใกล้ครบกำหนดใน 3 วัน ' + h.dueSoon + ' งาน');
      if (stuck.length) lines.push('   งานสถานะมีปัญหา/รอตรวจสอบ ' + stuck.length + ' งาน: ' + stuck.slice(0, 3).map(function (t) { return t.name + ' (' + imtStatus(t.status).label + ')'; }).join('; '));
      if (openIss.length) {
        var oldest = openIss.reduce(function (m, s) { return Math.max(m, dayDiff(s.createdAt || today.toISOString())); }, 0);
        lines.push('   ปัญหาการใช้งานค้าง ' + openIss.length + ' เรื่อง (ค้างนานสุด ' + oldest + ' วัน)');
      }
      lines.push('   อัปเดตล่าสุด: ' + (acts.length ? dayDiff(acts[0].createdAt) + ' วันก่อน' : 'ยังไม่มีการอัปเดต'));
    });
    if (rows.length > 30) lines.push('', '(และโครงการสถานะปกติอีก ' + (rows.length - 30) + ' โครงการ ไม่ได้แสดงรายละเอียด)');
    return { text: lines.join('\n'), count: rows.length };
  }
  window.imtRunAiOverview = async function () {
    if (_imtAiOverview && _imtAiOverview.loading) return;
    var facts = window.imtIndexPass(imtAiOverviewFacts);
    if (!facts.count) { window.showAlert && window.showAlert('ไม่มีโครงการที่ยังไม่เสร็จให้สรุป', 'warn'); return; }
    _imtAiOverview = { loading:true };
    window.renderImplTracker();
    try {
      var text = await window.aiChat(
        'คุณเป็นที่ปรึกษา PM โครงการติดตั้งระบบซอฟต์แวร์โรงพยาบาล วิเคราะห์สถานะทุกโครงการจากข้อมูลที่ให้ แล้วเขียนสรุปภาษาไทยสำหรับหัวหน้าทีม '
        + 'ใช้หัวข้อ "## ภาพรวม" (2–3 bullet), "## โครงการที่ต้องติดตาม" (เรียงจากเร่งด่วนสุด แต่ละ bullet: **ชื่อโครงการ** — ปัญหาหลักที่เห็นจากข้อมูล → สิ่งที่ควรทำทันที), '
        + '"## คำแนะนำเพิ่มเติม" (3–5 ข้อ เชิงปฏิบัติ เช่น ปรับแผน/เพิ่มคน/นัดประชุมกับ รพ./ติดตามผู้รับผิดชอบ) · '
        + 'ไม่ต้องใส่โครงการสถานะปกติที่ไม่มีประเด็น · อ้างตัวเลขตามข้อมูลเท่านั้น ห้ามแต่งเพิ่ม · กระชับ',
        facts.text, { maxTokens: 1500, temperature: 0.3 });
      _imtAiOverview = { text:text, at:new Date() };
    } catch (e) {
      _imtAiOverview = { error:String(e.message || e) };
    }
    window.renderImplTracker();
  };
  window.imtCloseAiOverview = function () { _imtAiOverview = null; window.renderImplTracker(); };
  window.imtCopyAiOverview = function () {
    if (!_imtAiOverview || !_imtAiOverview.text || !navigator.clipboard) return;
    navigator.clipboard.writeText(_imtAiOverview.text.replace(/\*\*/g, '')).then(function () { window.showAlert && window.showAlert('คัดลอกบทสรุปแล้ว', 'success'); });
  };
  function imtAiOverviewHtml() {
    var s = _imtAiOverview;
    if (!s) return '';
    var body = s.loading ? '<div style="color:var(--txt3);font-size:12.5px;">⏳ AI กำลังวิเคราะห์ทุกโครงการ… (อาจใช้เวลาสักครู่)</div>'
      : s.error ? '<div style="color:var(--coral);font-size:12.5px;">' + esc(s.error) + '</div>'
      : '<div class="ai-text">' + window.aiTextToHtml(s.text) + '</div>';
    return '<div class="ai-card" style="margin-bottom:16px;">'
      + '<div class="ai-card-head"><div class="sec-label" style="margin:0;">🤖 AI สรุปภาพรวม — โครงการที่ต้องติดตาม</div><div style="flex:1"></div>'
      +   (s.text ? '<button class="btn btn-ghost btn-sm" onclick="window.imtRunAiOverview()">🔁 สรุปใหม่</button><button class="btn btn-ghost btn-sm" onclick="window.imtCopyAiOverview()">📋 คัดลอก</button>' : '')
      +   '<button class="btn btn-ghost btn-sm" onclick="window.imtCloseAiOverview()">✕</button></div>'
      + body
      + (s.text ? '<div class="ai-card-note">* สรุปโดย AI จากข้อมูลในระบบ ณ ' + s.at.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) + ' น. — ตรวจสอบก่อนนำไปใช้</div>' : '')
      + '</div>';
  }

  // ================================================================
  // DASHBOARD — ภาพรวมทุกโครงการ (มุมมองข้ามโครงการเสมอ ไม่ผูกกับ imtCurrentProjectId)
  // ออกแบบให้จบใน ~1 หน้าจอ: KPI → ตารางโครงการ (แถวละโครงการ) → 2 กล่องแท็บ (ต้องจัดการ / ภาระงาน)
  // → "วิเคราะห์เพิ่มเติม" พับไว้ · รายการในกล่องเลื่อนภายในกล่องเอง ไม่ยืดหน้า
  // ================================================================

  // ── แท็บในกล่อง Dashboard: สลับด้วย class (ไม่ render ใหม่ทั้งหน้า) และจำแท็บล่าสุดไว้ข้ามการ render ──
  window.imtDashTabs = window.imtDashTabs || {};
  window.imtDashSetTab = function (group, id) {
    window.imtDashTabs[group] = id;
    document.querySelectorAll('[data-imt-tabs="'+group+'"] [data-tab]').forEach(function (el) { el.classList.toggle('on', el.dataset.tab === id); });
  };
  function imtDashPanel(group, title, tabs) {
    var cur = window.imtDashTabs[group];
    if (!tabs.some(function (t) { return t.id === cur; })) cur = tabs[0].id;
    return '<div class="dtable-inner imt-dpanel" data-imt-tabs="'+group+'">'
      + '<div class="imt-dpanel-head">'+(title ? '<div class="sec-label">'+title+'</div>' : '')+'<div class="imt-dpanel-tabs">'
      + tabs.map(function (t) {
          return '<button type="button" class="imt-dtab'+(t.id===cur?' on':'')+'" data-tab="'+t.id+'" onclick="window.imtDashSetTab(\''+group+'\',\''+t.id+'\')">'
            + t.label + (t.n !== undefined ? ' <b>'+t.n+'</b>' : '') + '</button>';
        }).join('')
      + '</div></div>'
      + tabs.map(function (t) { return '<div class="imt-dpanel-body'+(t.id===cur?' on':'')+'" data-tab="'+t.id+'">'+t.html+'</div>'; }).join('')
      + '</div>';
  }
  function imtDashEmpty(txt) { return '<div class="imt-dash-empty">'+txt+'</div>'; }

  // ── แถวโครงการในตาราง: คะแนน · ชื่อ · ความคืบหน้าเทียบแผน · แถบ Phase · สาเหตุหลัก · กำหนดจบ · อัปเดตล่าสุด ──
  function imtDashProjectRow(p, h) {
    var active = h.level !== 'done' && h.level !== 'cancelled';
    var scoreCell = active
      ? '<span class="imt-pt-score" style="color:'+h.color+';border-color:'+h.color+';background:'+h.color+'14" title="'+h.label+' · คะแนนสุขภาพ '+h.score+'/100">'+h.score+'</span>'
      : '<span class="imt-pt-score" style="color:'+h.color+';border-color:'+h.color+'" title="'+h.label+'">'+h.icon+'</span>';

    var prog = '<div class="imt-hcard-pbar-wrap">'+pbarHtml(h.progress, h.color)
      + (active && h.expected !== null ? '<div class="imt-hcard-expected" style="left:'+h.expected+'%" title="ควรได้ตามกำหนดการ ~'+h.expected+'%"></div>' : '')+'</div>'
      + '<div class="imt-pt-small">'+h.progress+'%'+(active && h.expected !== null ? ' · ควรได้ '+h.expected+'%' : '')
      + (active && h.gap > 8 ? ' <b style="color:'+(h.gap > 20 ? 'var(--coral)' : 'var(--amber)')+'">ช้า '+h.gap+'%</b>' : '')+'</div>';

    // แถบ Phase: ช่องละ Phase · สีแดง = มีงานเกินกำหนด · ใต้แถบบอกว่าติด/อยู่ที่ Phase ไหน
    var phases = imtPhasesOf(p.id), firstOverdue = null, firstOpen = null;
    var segs = phases.map(function (ph) {
      var pct = window.calcPhaseProgress(ph), st = imtPhaseStatus(ph);
      var od = imtTasksOfPhase(ph.id).filter(function (t) { return window.imtIsOverdue(t); }).length;
      if (od && !firstOverdue) firstOverdue = { ph:ph, od:od };
      if (!firstOpen && pct < 100 && st.id !== 'cancelled') firstOpen = ph;
      var c = od ? 'var(--coral)' : st.color;
      return '<i style="--c:'+c+'" title="'+esc(ph.name)+' — '+pct+'% · '+esc(st.label)+(od ? ' · เกินกำหนด '+od+' งาน' : '')+'"><u style="width:'+pct+'%"></u></i>';
    }).join('');
    var at = firstOverdue ? '<span style="color:var(--coral);">⛔ ติดที่ '+esc(firstOverdue.ph.name)+'</span>'
      : firstOpen ? '▶ '+esc(firstOpen.name) : phases.length ? '✅ ครบทุก Phase' : '—';
    var phaseCell = phases.length ? '<div class="imt-pt-segs">'+segs+'</div><div class="imt-pt-small imt-pt-ell">'+at+'</div>' : '<div class="imt-pt-small">ยังไม่มี Phase</div>';

    var reasonCell = active && h.reason
      ? '<div class="imt-pt-reason" style="color:'+h.color+'" title="'+esc(h.reason)+'">'+esc(h.reason)+'</div>' : '<div class="imt-pt-small">—</div>';
    if (active && h.dueSoon) reasonCell += '<div class="imt-pt-small" style="color:var(--amber);">⏳ ใกล้ครบกำหนด '+h.dueSoon+' งาน</div>';

    var endCell = '—';
    if (p.end) {
      var diff = Math.round((pd(p.end) - new Date(new Date().toDateString())) / 86400000);
      endCell = !active ? fd(p.end)
        : diff < 0 ? '<span style="color:var(--coral);font-weight:700;">เลย '+(-diff)+' วัน</span>'
        : diff === 0 ? '<span style="color:var(--amber);font-weight:700;">วันนี้</span>' : 'เหลือ '+diff+' วัน';
    }
    var silent = active && h.silentDays !== null && h.silentDays >= IMT_SILENT_DAYS;
    var updCell = h.silentDays === null ? '—' : (silent ? '<span style="color:var(--coral);font-weight:700;">💤 ' : '<span>')
      + (h.silentDays <= 0 ? 'วันนี้' : h.silentDays+' วันก่อน') + '</span>';

    return '<div class="imt-pt-row" onclick="window.imtSelectProject(\''+p.id+'\')">'
      + '<div class="imt-pt-c-s">'+scoreCell+'</div>'
      + '<div class="imt-pt-c-n"><div class="imt-pt-name">'+esc(p.name)+'</div><div class="imt-pt-small imt-pt-ell">👤 '+esc(p.siteOwner||'—')+' · 🔧 '+esc(p.installer||'—')+'</div></div>'
      + '<div class="imt-pt-c-p">'+prog+'</div>'
      + '<div class="imt-pt-c-ph">'+phaseCell+'</div>'
      + '<div class="imt-pt-c-r">'+reasonCell+'</div>'
      + '<div class="imt-pt-c-e"><span class="imt-pt-mlabel">กำหนดจบ </span>'+endCell+'</div>'
      + '<div class="imt-pt-c-u"><span class="imt-pt-mlabel">อัปเดต </span>'+updCell+'</div>'
      + '</div>';
  }

  function renderImtDashboard(mount) {
    var tasks = window.IMPL_TASKS;
    var todayD = new Date(new Date().toDateString());
    var ageDays = function (d) { return Math.round((todayD - pd(String(d).slice(0,10))) / 86400000); };

    // ── สุขภาพโครงการ: เรียงตามระดับ แล้วคะแนนต่ำสุด (แย่สุด) ขึ้นก่อนภายในระดับเดียวกัน ──
    var health = window.IMPL_PROJECTS.map(function (p) { return { p:p, h:imtProjectHealth(p) }; });
    health.sort(function (a,b) { return IMT_HEALTH_ORDER[a.h.level] - IMT_HEALTH_ORDER[b.h.level] || (a.h.score === null ? 101 : a.h.score) - (b.h.score === null ? 101 : b.h.score); });
    var counts = { delayed:0, risk:0, ontrack:0 };
    health.forEach(function (x) { if (counts[x.h.level] !== undefined) counts[x.h.level]++; });
    var activeHealth = health.filter(function (x) { return x.h.level !== 'done' && x.h.level !== 'cancelled'; });
    var isSilent = function (x) { return x.h.silentDays !== null && x.h.silentDays >= IMT_SILENT_DAYS; };
    var silentCount = activeHealth.filter(isSilent).length;
    var activePids = {};
    activeHealth.forEach(function (x) { activePids[x.p.id] = true; });

    // ── KPI ภาพรวมพอร์ต: กี่โครงการ · สุขภาพรวม · งานค้าง · ปัญหาค้าง · โครงการที่เงียบหาย ──
    var avgScore = activeHealth.length ? Math.round(activeHealth.reduce(function (s,x) { return s + x.h.score; }, 0) / activeHealth.length) : null;
    var overdueActive = tasks.filter(function (t) { return activePids[t.projectId] && window.imtIsOverdue(t); }).length;
    var openIssues = window.IMPL_ISSUES.filter(function (i) { return i.status !== 'closed'; });
    var hiOpenIssues = openIssues.filter(function (i) { return i.severity === 'high' || i.severity === 'critical'; }).length;
    var kpis = [
      { k:'กำลังดำเนินการ', tip:'โครงการที่ยังไม่เสร็จและไม่ถูกยกเลิก', v:activeHealth.length+' <small>โครงการ</small>', color:'var(--indigo)' },
      { k:'คะแนนสุขภาพเฉลี่ย', tip:"ค่าเฉลี่ยคะแนนสุขภาพของโครงการที่กำลังดำเนินการ\nคะแนนสุขภาพ 0–100 (สูง = ดี) เริ่มที่ 100 แล้วหัก 4 ด้าน (รวมเต็ม 90 ปรับเป็นสเกล 100):\n• ช้ากว่าแผน สูงสุด 35 (ช้า 30% = หักเต็ม)\n• งานเกินกำหนด สูงสุด 25 (งานละ 4 + วันที่เกินนานสุด ÷ 2)\n• ปัญหาค้าง สูงสุด 20 (น้ำหนักตามความรุนแรง ต่ำ1/กลาง2/สูง4/วิกฤต8, ค้าง ≥14 วัน +1, ×2)\n• ไม่เคลื่อนไหวเกิน 7 วัน สูงสุด 10\nเลยกำหนดจบ = ไม่เกิน 59 · มีงานเกินกำหนด = ไม่เกิน 79\n< 60 ล่าช้า · 60–79 ต้องติดตามพิเศษ · ≥ 80 ปกติ", v:avgScore === null ? '—' : avgScore+'<small>/100</small>', color:avgScore === null ? 'var(--txt3)' : imtScoreColor(avgScore) },
      { k:'งานเกินกำหนด', tip:'งานของโครงการที่กำลังดำเนินการ ที่เลยวันครบกำหนดแล้วแต่ยังไม่เสร็จ/ไม่ยกเลิก', v:overdueActive+' <small>งาน</small>', color:overdueActive ? 'var(--coral)' : 'var(--teal)' },
      { k:'ปัญหาที่ยังเปิด', tip:'ปัญหาทุกโครงการที่สถานะยังไม่ "เสร็จแล้ว" · สูง/วิกฤต = ความรุนแรงระดับสูงหรือวิกฤต', v:openIssues.length+(hiOpenIssues ? ' <small style="color:var(--coral)">สูง/วิกฤต '+hiOpenIssues+'</small>' : ' <small>เรื่อง</small>'), color:openIssues.length ? 'var(--amber)' : 'var(--teal)' },
      { k:'ไม่เคลื่อนไหว ≥'+IMT_SILENT_DAYS+' วัน', tip:'โครงการที่กำลังดำเนินการ และไม่มีการบันทึก/แก้ไขงาน/ปัญหาใด ๆ มาแล้ว ≥ '+IMT_SILENT_DAYS+' วัน', v:silentCount+' <small>โครงการ</small>', color:silentCount ? 'var(--coral)' : 'var(--teal)', go:"window.imtSetDashHealthFilter('silent')" },
    ];
    var kpiHtml = '<div class="imt-kpis">' + kpis.map(function (s) {
      return '<div class="imt-kpi" style="--c:'+s.color+(s.go ? ';cursor:pointer;" onclick="'+s.go : '')+'"><div class="imt-kpi-k">'+s.k+window.calcTip(s.tip)+'</div><div class="imt-kpi-v">'+s.v+'</div></div>';
    }).join('') + '</div>';

    // ── ตัวกรอง + ตารางโครงการ ──
    var filter = window.imtDashHealthFilter || 'all';
    var chips = [
      { id:'all',     label:'ทั้งหมด',            n:health.length },
      { id:'delayed', label:'🔴 ล่าช้า',           n:counts.delayed },
      { id:'risk',    label:'🟡 ต้องติดตามพิเศษ',  n:counts.risk },
      { id:'ontrack', label:'🟢 ปกติ',             n:counts.ontrack },
      { id:'silent',  label:'💤 ไม่เคลื่อนไหว',     n:silentCount },
    ];
    var chipsHtml = chips.map(function (c) {
      return '<div class="imt-health-chip'+(filter===c.id?' on':'')+'" onclick="window.imtSetDashHealthFilter(\''+c.id+'\')">'+c.label+' <b>'+c.n+'</b></div>';
    }).join('');
    var hideDoneProjects = window.imtHideDoneProjects !== false;
    var hideDoneProjectsChk = '<label class="imt-hidedone-chk" style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--txt2);white-space:nowrap;cursor:pointer;margin-left:auto;">'
      + '<input type="checkbox" '+(hideDoneProjects?'checked':'')+' onchange="window.imtToggleHideDoneProjects(this.checked)"> แสดงเฉพาะโครงการที่ยังไม่เสร็จ'
      + '</label>';

    var shown = filter === 'all' ? health
      : filter === 'silent' ? activeHealth.filter(isSilent)
      : health.filter(function (x) { return x.h.level === filter; });
    if (hideDoneProjects) shown = shown.filter(function (x) { return x.h.level !== 'done'; });
    var tableHtml = '<div class="dtable-inner imt-ptable">'
      + '<div class="imt-pt-row imt-pt-head"><div>คะแนน'+window.calcTip("คะแนนสุขภาพ 0–100 (สูง = ดี) เริ่มที่ 100 แล้วหัก 4 ด้าน (รวมเต็ม 90 ปรับเป็นสเกล 100):\n• ช้ากว่าแผน สูงสุด 35 (ช้า 30% = หักเต็ม)\n• งานเกินกำหนด สูงสุด 25 (งานละ 4 + วันที่เกินนานสุด ÷ 2)\n• ปัญหาค้าง สูงสุด 20 (น้ำหนักตามความรุนแรง ต่ำ1/กลาง2/สูง4/วิกฤต8, ค้าง ≥14 วัน +1, ×2)\n• ไม่เคลื่อนไหวเกิน 7 วัน สูงสุด 10\nเลยกำหนดจบ = ไม่เกิน 59 · มีงานเกินกำหนด = ไม่เกิน 79\n< 60 ล่าช้า · 60–79 ต้องติดตามพิเศษ · ≥ 80 ปกติ")+'</div><div>โครงการ</div><div>ความคืบหน้า (จริง/แผน)'+window.calcTip("ความคืบหน้าโครงการ = ค่าเฉลี่ยของทุก Phase\nPhase = ค่าเฉลี่ยของทุกงานใน Phase\nงาน = Checklist ที่ติ๊กแล้ว ÷ Checklist ทั้งหมด (ไม่มี Checklist: เสร็จแล้ว = 100%)\n\nควรได้ (ตามแผน) = คิดจากกำหนดของแต่ละงาน ถ่วงแบบเดียวกับ % จริง: งานที่เลยวันครบกำหนดแล้ว = 100%, งานที่มีวันเริ่ม = ไล่เชิงเส้นจากวันเริ่มถึงวันครบกำหนด\nถ้าไม่มีงานไหนตั้งวันครบกำหนด ใช้สัดส่วนเวลาวันเริ่ม–วันจบโครงการแทน\nช้า = ควรได้ − ได้จริง")+'</div><div>Phase'+window.calcTip('1 ช่อง = 1 Phase · ความยาวแถบ = % ของ Phase · สีแดง = มีงานเกินกำหนด')+'</div><div>สาเหตุหลัก'+window.calcTip('ด้านที่ถูกหักคะแนนมากที่สุด (หรือ เลยกำหนดจบโครงการ)')+'</div><div>กำหนดจบ</div><div>อัปเดต'+window.calcTip('วันที่มีความเคลื่อนไหวล่าสุด: บันทึกกิจกรรม / แก้ไขงาน / ปัญหา')+'</div></div>'
      + (shown.length ? shown.map(function (x) { return imtDashProjectRow(x.p, x.h); }).join('') : imtDashEmpty('ไม่มีโครงการในหมวดนี้'))
      + '</div>';

    var healthById = {};
    health.forEach(function (x) { healthById[x.p.id] = x.h; });

    function dashRow(t, badgeHtml) {
      var p = imtProject(t.projectId);
      return '<div class="imt-dash-row" onclick="window.imtOpenTaskFromDash(\''+t.id+'\',\''+t.projectId+'\')">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">'+esc(t.name)+'</div>'
        + '<div class="imt-dash-row-sub">'+esc(p?p.name:'—')+(t.owner?' · 👤 '+esc(t.owner):'')+'</div></div>'
        + '<div class="imt-dash-row-badge">'+badgeHtml+'</div>'
        + '</div>';
    }

    // ── 📌 ต้องจัดการ: งานเกินกำหนด / 7 วันข้างหน้า / ปัญหาค้างนาน ──
    var overdueList = tasks.filter(function (t) { return window.imtIsOverdue(t); })
      .map(function (t) { return { t:t, days:ageDays(t.due) }; })
      .sort(function (a,b) { return b.days - a.days; });
    var overdueHtml = overdueList.length
      ? overdueList.map(function (x) { return dashRow(x.t, '<span style="color:var(--coral);">เกิน '+x.days+' วัน</span>'); }).join('')
      : imtDashEmpty('ไม่มีงานเกินกำหนด 🎉');

    var upcomingList = tasks.filter(function (t) { return window.imtIsDueSoon(t, 7); })
      .map(function (t) { return { t:t, diff:-ageDays(t.due) }; })
      .sort(function (a,b) { return a.diff - b.diff; });
    var upcomingHtml = upcomingList.length
      ? upcomingList.map(function (x) {
          var label = x.diff === 0 ? 'วันนี้' : x.diff === 1 ? 'พรุ่งนี้' : 'อีก '+x.diff+' วัน';
          return dashRow(x.t, '<span style="color:'+(x.diff<=1?'var(--amber)':'var(--txt2)')+';">'+label+'</span>');
        }).join('')
      : imtDashEmpty('ไม่มีงานครบกำหนดใน 7 วัน');

    var agingList = openIssues.map(function (i) { return { i:i, p:imtProject(i.projectId), days:ageDays(i.createdAt || todayD.toISOString()) }; })
      .filter(function (x) { return x.p && x.p.status !== 'cancelled' && x.days >= 7; })
      .sort(function (a,b) { return b.days - a.days; });
    var agingHtml = agingList.length
      ? agingList.map(function (x) {
          var sev = (window.IMPL_SEVERITY || []).find(function (s) { return s.id === x.i.severity; }) || { label:x.i.severity, color:'var(--txt3)' };
          return '<div class="imt-dash-row" onclick="window.imtCurrentProjectId=\''+x.p.id+'\';window.imtGoTab(\'issues\');">'
            + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">'+esc(x.i.problem || '(ไม่มีรายละเอียด)')+'</div>'
            + '<div class="imt-dash-row-sub"><span style="color:'+sev.color+';font-weight:700;">● '+esc(sev.label)+'</span> · '+esc(x.p.name)+(x.i.department?' · '+esc(x.i.department):'')+'</div></div>'
            + '<div class="imt-dash-row-badge" style="color:'+(x.days>=30?'var(--coral)':x.days>=14?'var(--amber)':'var(--txt2)')+';">ค้าง '+x.days+' วัน</div></div>';
        }).join('')
      : imtDashEmpty('ไม่มีปัญหาที่ค้างเกิน 7 วัน 🎉');

    // ── 👥 ภาระงาน: รายคน (เจ้าของ Task ข้ามทุกโครงการที่กำลังดำเนินการ) / PM (ระดับโครงการ) ──
    var ownerMap = {}, unassigned = 0, noDue = 0;
    tasks.forEach(function (t) {
      if (!activePids[t.projectId] || t.status === 'done' || t.status === 'cancelled') return;
      if (!t.due) noDue++;
      if (!t.ownerId) { unassigned++; return; }
      var k = window.staffNameByRef(t.ownerId); // ชื่อ-นามสกุล (t.owner = ชื่อเล่น)
      var o = ownerMap[k] = ownerMap[k] || { name:k, open:0, overdue:0, soon:0, pids:{} };
      o.open++;
      if (window.imtIsOverdue(t)) o.overdue++; else if (window.imtIsDueSoon(t, 7)) o.soon++;
      o.pids[t.projectId] = true;
    });
    var owners = Object.keys(ownerMap).map(function (k) { return ownerMap[k]; })
      .sort(function (a,b) { return b.overdue - a.overdue || b.open - a.open; });
    var workloadHtml = (unassigned || noDue ? '<div class="imt-dash-note">⚠ '
        + [unassigned ? 'ไม่มีผู้รับผิดชอบ <b>'+unassigned+'</b> งาน' : '', noDue ? 'ไม่มีวันครบกำหนด <b>'+noDue+'</b> งาน' : ''].filter(Boolean).join(' · ') + '</div>' : '')
      + (owners.length ? owners.map(function (o) {
          return '<div class="imt-dash-row" style="cursor:default;">'
            + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">👤 '+esc(o.name)+'</div>'
            + '<div class="imt-dash-row-sub">'+Object.keys(o.pids).length+' โครงการ · ค้าง '+o.open+' งาน'+(o.soon?' · ครบใน 7 วัน '+o.soon:'')+'</div></div>'
            + '<div class="imt-dash-row-badge">'+(o.overdue?'<span style="color:var(--coral);">⏰ เกิน '+o.overdue+'</span>':'<span style="color:var(--teal);">✓</span>')+'</div></div>';
        }).join('') : imtDashEmpty('ยังไม่มีงานที่ระบุผู้รับผิดชอบ'));

    var pmMap = {};
    // PM = เจ้าของไซต์ (site_owner) ของโครงการต้นทาง
    window.IMPL_PROJECTS.forEach(function (p) {
      var n = p.siteOwner || 'ไม่ระบุ PM';
      (pmMap[n] = pmMap[n] || []).push(p);
    });
    var pmRows = Object.keys(pmMap).map(function (name) {
      var active = pmMap[name].filter(function (p) { return p.status !== 'done' && p.status !== 'cancelled'; });
      var red  = active.filter(function (p) { return healthById[p.id] && healthById[p.id].level === 'delayed'; }).length;
      var risk = active.filter(function (p) { return healthById[p.id] && healthById[p.id].level === 'risk'; }).length;
      return { name:name, active:active.length, red:red, risk:risk };
    }).filter(function (x) { return x.active > 0; })
      .sort(function (a,b) { return (b.red - a.red) || (b.risk - a.risk) || (b.active - a.active); });
    var pmHtml = pmRows.length ? pmRows.map(function (x) {
      var badge = (x.red ? '<span style="color:var(--coral);">🔴 '+x.red+'</span> ' : '') + (x.risk ? '<span style="color:var(--amber);">🟡 '+x.risk+'</span>' : '')
        || '<span style="color:var(--teal);">🟢 ปกติ</span>';
      return '<div class="imt-dash-row" style="cursor:default;">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">👤 '+esc(x.name)+'</div>'
        + '<div class="imt-dash-row-sub">'+x.active+' โครงการที่กำลังดำเนินการ</div></div>'
        + '<div class="imt-dash-row-badge">'+badge+'</div></div>';
    }).join('') : imtDashEmpty('ยังไม่มีข้อมูล PM');

    // ── 📊 วิเคราะห์เพิ่มเติม: การ์ดกราฟเล็ก 5 ใบเห็นพร้อมกัน (แทนแท็บรายการเดิมที่ต้องกดทีละแท็บ)
    // กราฟวาดด้วย HTML/CSS ล้วน (ไม่ต้องโหลดไลบรารี) · hover ดูตัวเลขผ่าน title ──
    // ส่วนย่อยภายในการ์ด — รวมเรื่องเดียวกันไว้การ์ดเดียว (งาน / ปัญหา) แทนการ์ดแยกที่มีที่ว่างเหลือเยอะ
    function chartSec(title, sub, body) {
      return '<div class="imt-csec"><div class="imt-csec-h">'+title+(sub ? '<span>'+sub+'</span>' : '')+'</div>'+body+'</div>';
    }
    function chartCard(title, sub, body) {
      return '<div class="dtable-inner imt-ccard"><div class="imt-ccard-h">'+title+(sub ? '<span>'+sub+'</span>' : '')+'</div>'+body+'</div>';
    }
    // แถบแนวนอน: ป้าย | แถบ | ค่า — ค่าที่แสดงอยู่ในสีตัวอักษรปกติ สีแถบใช้บอกความหมายเท่านั้น
    // stacked = ป้ายอยู่บรรทัดบนเต็มความกว้าง แถบอยู่ล่าง (ใช้กับป้ายยาว เช่น ชื่อโครงการ)
    function hbars(rows, stacked) {
      var max = Math.max.apply(null, rows.map(function (x) { return x.v; }).concat([1]));
      return '<div class="imt-hb'+(stacked ? ' imt-hb-stacked' : '')+'">' + rows.map(function (x) {
        return '<div class="imt-hb-row" title="'+x.tip+'"'+(x.go ? ' style="cursor:pointer;" onclick="'+x.go+'"' : '')+'>'
          + '<div class="imt-hb-lbl">'+x.label+'</div>'
          + '<div class="imt-hb-track">'+x.segs.map(function (s) { return '<div style="width:'+(s.v / max * 100)+'%;background:'+s.c+'"></div>'; }).join('')+'</div>'
          + '<div class="imt-hb-val">'+x.txt+'</div></div>';
      }).join('') + '</div>';
    }
    function legend(items) {
      return '<div class="imt-clegend">'+items.map(function (l) { return '<span><i style="background:'+l[0]+'"></i>'+l[1]+'</span>'; }).join('')+'</div>';
    }

    // 1) สถานะงาน: แถบ 100% แบ่งตามสถานะ + ตัวเลขเด่น "% เสร็จ"
    var stCounts = window.IMPL_STATUS.map(function (st) { return { st:st, n:tasks.filter(function (t) { return t.status === st.id; }).length }; })
      .filter(function (x) { return x.n > 0; });
    var stTotal = stCounts.reduce(function (s,x) { return s + x.n; }, 0);
    var stDone = (stCounts.find(function (x) { return x.st.id === 'done'; }) || { n:0 }).n;
    var statusSec = chartSec('สถานะงาน', '', stTotal
      ? '<div class="imt-chero"><b>'+Math.round(stDone / stTotal * 100)+'%</b> เสร็จแล้ว</div>'
        + '<div class="imt-stack">'+stCounts.map(function (x) {
            return '<div style="flex:'+x.n+';background:'+x.st.color+'" title="'+esc(x.st.label)+': '+x.n+' งาน ('+Math.round(x.n / stTotal * 100)+'%)"></div>';
          }).join('')+'</div>'
        + '<div class="imt-clegend imt-clegend-col">'+stCounts.map(function (x) {
            return '<span><i style="background:'+x.st.color+'"></i>'+x.st.icon+' '+esc(x.st.label)+'<b>'+x.n+'</b></span>';
          }).join('')+'</div>'
      : imtDashEmpty('ยังไม่มีงาน'));

    // 2) ความเคลื่อนไหว 14 วันล่าสุด: แท่งรายวัน (วันที่ไม่มีใครอัปเดต = ขีดเทาเตี้ย เห็นช่องโหว่ชัด) + ใครอัปเดตมากสุด
    var dkey = function (dt) { return dt.getFullYear()+'-'+('0'+(dt.getMonth()+1)).slice(-2)+'-'+('0'+dt.getDate()).slice(-2); };
    var days = [];
    for (var di = 13; di >= 0; di--) { var dd = new Date(todayD); dd.setDate(dd.getDate() - di); days.push({ d:dd, key:dkey(dd), n:0 }); }
    var dayIdx = {}, actors = {};
    days.forEach(function (x) { dayIdx[x.key] = x; });
    window.IMPL_ACTIVITY_LOG.forEach(function (a) {
      var dt = new Date(a.createdAt); if (isNaN(dt)) return;
      var day = dayIdx[dkey(dt)]; if (!day) return;
      day.n++;
      var n = a.actor || 'ระบบ'; actors[n] = (actors[n] || 0) + 1;
    });
    var dayMax = Math.max.apply(null, days.map(function (x) { return x.n; }).concat([1]));
    var dayTotal = days.reduce(function (s,x) { return s + x.n; }, 0);
    var idleDays = days.filter(function (x) { return !x.n; }).length;
    var DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];
    var topActors = Object.keys(actors).sort(function (a,b) { return actors[b] - actors[a]; }).slice(0, 3);
    var activityCard = chartCard('🕒 ความเคลื่อนไหว 14 วันล่าสุด', dayTotal+' รายการ · เฉลี่ย '+Math.round(dayTotal / 14)+'/วัน',
      '<div class="imt-dcols">'+days.map(function (x, i) {
        var isMax = x.n === dayMax && x.n > 0, isToday = i === days.length - 1;
        return '<div class="imt-dcol'+(x.n ? '' : ' idle')+(isToday ? ' today' : '')+'" title="'+fd(x.key)+' ('+DOW[x.d.getDay()]+'): '+x.n+' รายการ">'
          + '<div class="imt-dcol-bar" style="height:'+(x.n ? Math.max(6, x.n / dayMax * 100) : 4)+'%">'+(isMax || isToday && x.n ? '<em>'+x.n+'</em>' : '')+'</div>'
          + '<span>'+x.d.getDate()+'</span></div>';
      }).join('')+'</div>'
      + (idleDays ? '<div class="imt-cfoot" style="color:var(--amber);">⚠ ไม่มีการอัปเดตเลย '+idleDays+' วัน</div>' : '')
      + (topActors.length ? '<div class="imt-ccard-sub">อัปเดตมากสุด</div>' + hbars(topActors.map(function (n) {
          return { label:'👤 '+esc(n), v:actors[n], segs:[{ v:actors[n], c:'var(--violet)' }], txt:String(actors[n]), tip:esc(n)+': '+actors[n]+' รายการ ('+Math.round(actors[n] / dayTotal * 100)+'%)' };
        })) : ''));

    // 3) กลุ่มปัญหา: แถบแนวนอน สีเดียว (ขนาด) + % ของทั้งหมด
    var issueCatCounts = {};
    window.IMPL_ISSUES.forEach(function (i) { var c = i.category || 'ไม่ระบุ'; issueCatCounts[c] = (issueCatCounts[c] || 0) + 1; });
    var issTotal = window.IMPL_ISSUES.length;
    var issueCatSec = chartSec('กลุ่มปัญหาที่พบบ่อย', '', issTotal
      ? hbars(Object.keys(issueCatCounts).sort(function (a,b) { return issueCatCounts[b] - issueCatCounts[a]; }).slice(0, 6).map(function (c) {
          var n = issueCatCounts[c], pct = Math.round(n / issTotal * 100);
          return { label:esc(c), v:n, segs:[{ v:n, c:'var(--indigo)' }], txt:n+' <small>'+pct+'%</small>', tip:esc(c)+': '+n+' เรื่อง ('+pct+'%)' };
        }))
      : imtDashEmpty('ยังไม่มีข้อมูลปัญหา'));

    // 4) โครงการที่มีปัญหามาก: แถบซ้อน ปิดแล้ว (เขียว) + ยังเปิด (เหลือง) — กดไปแท็บปัญหาของโครงการนั้น
    var projIssueRows = window.IMPL_PROJECTS.map(function (p) {
      var list = (window.imtGroupOf('IMPL_ISSUES', 'projectId', p.id) || window.IMPL_ISSUES).filter(function (i) { return i.projectId === p.id; });
      var open = list.filter(function (i) { return i.status !== 'closed'; }).length;
      return { p:p, n:list.length, open:open };
    }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var projIssueSec = chartSec('โครงการที่แจ้งปัญหามากสุด', '', projIssueRows.length
      ? legend([['var(--teal)','แก้แล้ว'],['var(--amber)','ยังเปิด']])
        + hbars(projIssueRows.map(function (x) {
            return { label:esc(x.p.name), v:x.n, segs:[{ v:x.n - x.open, c:'var(--teal)' }, { v:x.open, c:'var(--amber)' }],
              txt:x.n+(x.open ? ' <small style="color:var(--amber)">เปิด '+x.open+'</small>' : ''), tip:esc(x.p.name)+': ทั้งหมด '+x.n+' · ยังเปิด '+x.open,
              go:"window.imtCurrentProjectId='"+x.p.id+"';window.imtGoTab('issues');" };
          }), true)
      : imtDashEmpty('ยังไม่มีปัญหาบันทึกไว้ในระบบ'));

    // 5) Phase ที่มีปัญหาซ้ำ: จุด 1 จุด = 1 โครงการที่มี Phase ชื่อนี้ · จุดแดง = Phase นั้นติด (งานเกินกำหนด/ล่าช้า/มีปัญหา)
    // อ่านได้ทันทีว่า "ติดกี่โครงการจากทั้งหมด" และชี้จุดเพื่อดูว่าโครงการไหน (เฉพาะ Phase ที่มีอย่างน้อย 2 โครงการ) ──
    var phaseGroups = {};
    window.IMPL_PHASES.forEach(function (ph) { var key = (ph.name || '').trim(); if (key) (phaseGroups[key] = phaseGroups[key] || []).push(ph); });
    var phaseRows = Object.keys(phaseGroups).map(function (name) {
      var list = phaseGroups[name].map(function (ph) {
        var bad = ph.status === 'delayed' || ph.status === 'issue' || imtTasksOfPhase(ph.id).some(function (t) { return window.imtIsOverdue(t); });
        return { ph:ph, p:imtProject(ph.projectId), bad:bad };
      }).sort(function (a,b) { return b.bad - a.bad; });
      var problematic = list.filter(function (x) { return x.bad; }).length;
      return { name:name, list:list, total:list.length, problematic:problematic };
    }).filter(function (x) { return x.total >= 2 && x.problematic >= 1; })
      .sort(function (a,b) { return (b.problematic / b.total) - (a.problematic / a.total) || b.problematic - a.problematic; }).slice(0, 4);
    var phaseSec = chartSec('Phase ที่ติดซ้ำหลายโครงการ', '', phaseRows.length
      ? legend([['var(--coral)','ติด (เกินกำหนด/มีปัญหา)'],['var(--surface3)','ปกติ']])
        + '<div class="imt-waffle-list">' + phaseRows.map(function (x) {
          var pct = Math.round(x.problematic / x.total * 100);
          return '<div class="imt-waffle-row"><div class="imt-waffle-h"><b>'+esc(x.name)+'</b><span><b style="color:'+(pct >= 50 ? 'var(--coral)' : 'var(--amber)')+'">ติด '+x.problematic+'</b> จาก '+x.total+' โครงการ</span></div>'
            + '<div class="imt-waffle">'+x.list.map(function (it) {
                return '<i class="'+(it.bad ? 'bad' : '')+'" title="'+esc(it.p ? it.p.name : '—')+(it.bad ? ' — ติด' : ' — ปกติ')+'"'
                  + (it.p ? ' onclick="window.imtSelectProject(\''+it.p.id+'\')"' : '')+'></i>';
              }).join('')+'</div></div>';
        }).join('') + '</div>'
      : imtDashEmpty('ยังไม่พบ Phase ที่ติดซ้ำกันหลายโครงการ 🎉'));

    var issOpen = window.IMPL_ISSUES.filter(function (i) { return i.status !== 'closed'; }).length;
    var taskCard  = chartCard('📋 งาน', stTotal+' งาน', statusSec + phaseSec);
    var issueCard = chartCard('🩹 ปัญหาการใช้งาน', issTotal+' เรื่อง · ยังเปิด '+issOpen, issueCatSec + projIssueSec);

    if (!window.IMPL_PROJECTS.length) { mount.innerHTML = imtDashEmpty('ยังไม่มีโครงการ'); return; }
    mount.innerHTML =
      kpiHtml
      + '<div class="imt-health-strip">'+chipsHtml+hideDoneProjectsChk+'</div>'
      + imtAiOverviewHtml()
      + '<div class="imt-dash-wrap">' + tableHtml + '</div>'
      + '<div class="imt-dash-grid">'
      +   imtDashPanel('todo', '📌 ต้องจัดการ', [
            { id:'overdue',  label:'⏰ เกินกำหนด',     n:overdueList.length,  html:overdueHtml },
            { id:'upcoming', label:'📅 7 วันข้างหน้า',  n:upcomingList.length, html:upcomingHtml },
            { id:'aging',    label:'🩹 ปัญหาค้าง ≥7 วัน', n:agingList.length,  html:agingHtml },
          ])
      +   imtDashPanel('team', '👥 ภาระงาน', [
            { id:'people', label:'รายคน', html:workloadHtml },
            { id:'pm',     label:'PM',    html:pmHtml },
          ])
      + '</div>'
      + '<details class="imt-dash-more-sec"'+(window.imtDashMoreOpen !== false ? ' open' : '')+' ontoggle="window.imtDashMoreOpen=this.open">'
      +   '<summary>📊 วิเคราะห์เพิ่มเติม</summary>'
      +   '<div class="imt-cgrid">' + taskCard + activityCard + issueCard + '</div>'
      + '</details>';
  }

  // ── Searchable Grouped Combobox: เลือกโครงการต้นทาง (window.PROJECTS) ตอนสร้างโครงการใหม่ —
  // รูปแบบเดียวกับตัวเลือกโครงการใน Advance (_initAdvCombobox) / จัดหาที่พัก (_initLdCombobox):
  // จัดกลุ่มตามประเภทโครงการ (PTYPES) พับ/ขยายได้ + ค้นหา + คีย์บอร์ด + virtualized list ──
  window._initImtProjCombobox = (function () {
    var IH = 36, HH = 30, BUF = 6;
    function hi(txt, q) {
      if (!q) return esc(txt);
      var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
      while (i < txt.length) {
        var x = lt.indexOf(lq, i);
        if (x < 0) { out += esc(txt.slice(i)); break; }
        out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
        i = x + lq.length;
      }
      return out;
    }
    return function (projects, curPid, opts) {
      opts = opts || {};
      var inp = document.getElementById('imt-p-cmb-input'), drop = document.getElementById('imt-p-cmb-drop'),
        lst = document.getElementById('imt-p-cmb-list'), hid = document.getElementById('imt-p-source');
      if (!inp || !drop || !lst || !hid) return;
      var tmap = {}, tord = [];
      (window.PTYPES || []).forEach(function (t) { tmap[t.id] = { id:t.id, label:t.label, color:t.color||'var(--txt3)', items:[] }; tord.push(t.id); });
      projects.forEach(function (p) {
        if (tmap[p.typeId]) tmap[p.typeId].items.push(p);
        else { if (!tmap['__x__']) { tmap['__x__'] = { id:'__x__', label:'Project อื่น ๆ', color:'var(--txt3)', items:[] }; tord.push('__x__'); } tmap['__x__'].items.push(p); }
      });
      tord = tord.filter(function (tid) { return tmap[tid] && tmap[tid].items.length > 0; });
      var selId = curPid || '', selName = '', col = new Set(), q = '', fi = -1, flat = [], dt = null, isOpen = false;
      var _cp = projects.find(function (p) { return p.id === selId; });
      selName = _cp ? _cp.name : (opts.unboundLabel && !selId ? opts.unboundLabel : '');
      function bFlat(sq) {
        var f = [], lq = sq.toLowerCase();
        if (!sq && opts.unboundLabel) f.push({ k:'i', id:'', name:opts.unboundLabel, unbound:true });
        if (sq) { projects.forEach(function (p) { if (p.name.toLowerCase().indexOf(lq) !== -1) f.push({ k:'i', id:p.id, name:p.name }); }); }
        else { tord.forEach(function (tid) { var g = tmap[tid]; if (!g || !g.items.length) return; f.push({ k:'h', tid:tid, label:g.label, color:g.color, count:g.items.length }); if (!col.has(tid)) g.items.forEach(function (p) { f.push({ k:'i', id:p.id, name:p.name }); }); }); }
        return f;
      }
      function render() {
        if (!flat.length) { lst.innerHTML = '<div style="padding:24px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบโครงการ' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
        var offs = [], tot = 0; flat.forEach(function (it) { offs.push(tot); tot += (it.k === 'h' ? HH : IH); });
        var st = lst.scrollTop, vh = lst.clientHeight || 260, si = 0, ei = flat.length;
        for (var i = 0; i < flat.length; i++) { if (offs[i] + (flat[i].k === 'h' ? HH : IH) > st - BUF * IH) { si = i; break; } }
        for (var j = si; j < flat.length; j++) { if (offs[j] > st + vh + BUF * IH) { ei = j; break; } }
        var topH = offs[si] || 0, botH = tot - (ei < flat.length ? offs[ei] : tot);
        var html = '<div style="height:' + topH + 'px"></div>';
        flat.slice(si, ei).forEach(function (it, r) {
          var idx = si + r;
          if (it.k === 'h') {
            var cc = col.has(it.tid);
            html += '<div class="imtc-h" data-tid="' + esc(it.tid) + '" style="height:' + HH + 'px;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;font-size:10px;font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);color:' + esc(it.color) + ';user-select:none;position:sticky;top:0;z-index:2;"><span style="width:7px;height:7px;border-radius:50%;background:' + esc(it.color) + ';flex-shrink:0;display:inline-block;"></span><span>' + esc(it.label) + '</span><span style="font-size:9px;color:var(--txt3);margin-left:2px;">(' + it.count + ')</span><span style="margin-left:auto;font-size:9px;opacity:.5;">' + (cc ? '▶' : '▼') + '</span></div>';
          } else {
            var foc = idx === fi, isSel = it.id === selId;
            html += '<div class="imtc-i" data-id="' + esc(it.id) + '" data-name="' + esc(it.name) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:' + (it.unbound ? 'var(--txt3);font-style:italic;' : 'var(--txt1);') + '">' + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '') + (it.unbound ? esc(it.name) : hi(it.name, q)) + '</div>';
          }
        });
        html += '<div style="height:' + botH + 'px"></div>';
        lst.innerHTML = html;
      }
      // ── ตำแหน่ง dropdown ใช้ position:fixed คำนวณจาก getBoundingClientRect ของ input เอง (ไม่ใช้
      // position:absolute ผูกกับ .m-body) เพราะ .m-body มี overflow-y:auto — ถ้าโมดัลเนื้อหาสั้น (เช่น
      // ฟอร์ม "เพิ่มโครงการใหม่" มีแค่ 2 ช่อง) กล่อง dropdown ที่ยื่นเกินขอบเนื้อหาจะถูกครอบตัดจนเห็นแค่
      // บางส่วน — fixed positioning ไม่ถูกครอบตัดโดย overflow ของ ancestor เลย ──
      function positionDrop() { window.placeDropdown(inp, drop, lst, 360); }
      function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
      function selProj(id, name) { selId = id; selName = name; hid.value = id; closeDrop(); hid.dispatchEvent(new Event('change')); }
      lst.addEventListener('click', function (e) {
        var h = e.target.closest('.imtc-h'), it = e.target.closest('.imtc-i');
        if (h) { var tid = h.dataset.tid; if (col.has(tid)) col.delete(tid); else col.add(tid); flat = bFlat(q); fi = -1; render(); }
        else if (it) selProj(it.dataset.id, it.dataset.name);
      });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.imtc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      lst.addEventListener('scroll', render);
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 200); });
      inp.addEventListener('keydown', function (e) {
        var iis = flat.map(function (it, i) { return it.k === 'i' ? i : -1; }).filter(function (i) { return i >= 0; });
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); var ci = iis.indexOf(fi); fi = ci < 0 ? iis[0] : iis[ci+1] !== undefined ? iis[ci+1] : iis[ci]; render(); scFi(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); var ci2 = iis.indexOf(fi); fi = ci2 <= 0 ? iis[0] : iis[ci2-1]; render(); scFi(); }
        else if (e.key === 'Enter') { e.preventDefault(); var it = flat[fi]; if (it && it.k === 'i') selProj(it.id, it.name); }
      });
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('imt-p-cmb-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
      function scFi() { if (fi < 0) return; var top = 0; for (var i = 0; i < fi; i++) top += flat[i] ? (flat[i].k === 'h' ? HH : IH) : 0; if (top < lst.scrollTop) lst.scrollTop = top; else if (top + IH > lst.scrollTop + lst.clientHeight) lst.scrollTop = top + IH - lst.clientHeight; }
      inp.value = selName; flat = bFlat(''); render();
    };
  })();

  // ── รายชื่อโครงการต้นทางให้เลือกตอน "เพิ่มโครงการใหม่" — ตัดโครงการที่ถูกเพิ่มเข้า Impl Tracker ไปแล้ว
  // ออกเสมอไม่ว่าจะติ๊กหรือไม่ (มี IMPL_PROJECTS ผูก sourceProjectId อยู่แล้ว) กันสร้างโครงการซ้ำซ้อน —
  // ไม่ติ๊ก (ค่าเริ่มต้น) = เฉพาะโครงการที่ยังไม่จบ (ไม่มีวันสิ้นสุด หรือวันสิ้นสุดยังมาไม่ถึง)
  // ติ๊ก "แสดงโครงการทั้งหมดในปีนี้" (imtToggleProjComboShowYear) = กว้างขึ้นเป็นทุกโครงการที่วันสิ้นสุด
  // อยู่ในปี ค.ศ. ปัจจุบัน (รวมโครงการที่จบไปแล้วในปีนี้ด้วย) — ใช้ตอนต้องย้อนไปหาโครงการที่เพิ่งจบไป ──
  function imtSrcProjectsForNew(showYear) {
    var linkedIds = {};
    (window.IMPL_PROJECTS || []).forEach(function (p) { if (p.sourceProjectId) linkedIds[p.sourceProjectId] = true; });
    var notAdded = (window.PROJECTS || []).filter(function (sp) { return !linkedIds[sp.id]; });
    if (showYear) {
      var curYear = new Date().getFullYear();
      return notAdded.filter(function (sp) { return sp.end && pd(sp.end).getFullYear() === curYear; });
    }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return notAdded.filter(function (sp) { return !sp.end || pd(sp.end) >= today; });
  }
  // ── สลับติ๊ก "แสดงโครงการทั้งหมดในปีนี้" — สร้าง markup combobox ใหม่ทั้งชุด (ไม่ใช่แค่เรียก
  // _initImtProjCombobox ซ้ำบน element เดิม) เพราะฟังก์ชันนั้นผูก event listener ใหม่ทับของเดิมทุกครั้งที่
  // เรียก โดยไม่ถอดตัวเก่าออกก่อน เรียกซ้ำบน element เดิมจะเกิด listener ซ้อนกันจนคลิก/พิมพ์ทำงานผิดปกติ ──
  window.imtToggleProjComboShowYear = function (showYear) {
    var container = document.getElementById('imt-p-cmb-container');
    if (!container) return;
    var curVal = (document.getElementById('imt-p-source') || {}).value || '';
    container.innerHTML = imtProjComboMarkup('');
    var projects = imtSrcProjectsForNew(showYear);
    window._initImtProjCombobox && window._initImtProjCombobox(projects, curVal);
  };

  // ── Markup ของ combobox เลือกโครงการ ใช้ร่วมกันทั้งฟอร์ม "เพิ่มโครงการใหม่" และ "แก้ไขโครงการ" —
  // ตำแหน่ง dropdown คำนวณเป็น position:fixed ใน JS (ดู positionDrop ด้านบน) ไม่ต้องกำหนด top/left ที่นี่ ──
  function imtProjComboMarkup(hiddenValue, onchangeAttr) {
    return '<div id="imt-p-cmb-wrap" style="position:relative;">'
      +   '<input id="imt-p-cmb-input" type="text" class="f-input" placeholder="ค้นหาหรือเลือกโครงการ..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
      +   '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
      +   '<input type="hidden" id="imt-p-source" value="'+esc(hiddenValue||'')+'"'+(onchangeAttr?' onchange="'+onchangeAttr+'"':'')+'>'
      +   '<div id="imt-p-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
      +     '<div id="imt-p-cmb-list" style="max-height:260px;overflow-y:auto;"></div>'
      +   '</div>'
      + '</div>';
  }

  window.openImtProjectModal = function (id) {
    window.imtEditProjectId = id;
    var body = document.getElementById('m-imt-project-body');

    if (!id) {
      // ── สร้างใหม่: เลือกโครงการต้นทาง + Template เท่านั้น ข้อมูลอื่น (ชื่อ/PM/วันที่)
      // ดึงมาจากโครงการต้นทางให้อัตโนมัติตอนบันทึก ไม่ต้องโชว์ในฟอร์ม ──
      // แสดงเฉพาะโครงการที่ยังไม่ถูกเพิ่มเข้า Impl Tracker — กันสร้างโครงการซ้ำซ้อนกับที่มีอยู่แล้ว
      var tplOptions = '<option value="">— ไม่ใช้ Template —</option>' + window.IMPL_TEMPLATES.map(function (t) { return '<option value="'+t.id+'">'+esc(t.name)+'</option>'; }).join('');
      var availSrcProjects = imtSrcProjectsForNew(false);
      body.innerHTML =
        '<div class="f-group"><label class="f-label">เลือกโครงการ *</label>'
        +   '<div id="imt-p-cmb-container">' + imtProjComboMarkup('') + '</div>'
        +   '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2);margin-top:6px;cursor:pointer;">'
        +     '<input type="checkbox" id="imt-p-show-year" onchange="window.imtToggleProjComboShowYear(this.checked)"> แสดงโครงการทั้งหมดในปีนี้'
        +   '</label>'
        + '</div>'
        + '<div class="f-group"><label class="f-label">ใช้ Template Checklist</label><select class="f-input" id="imt-p-template">'+tplOptions+'</select></div>';
      document.getElementById('m-imt-project-title').textContent = 'เพิ่มโครงการใหม่';
      document.getElementById('m-imt-project-foot').style.display = window.canAdd(window.IMPL_MODULE) ? '' : 'none';
      window.openM('m-imt-project');
      window._initImtProjCombobox && window._initImtProjCombobox(availSrcProjects, '');
      return;
    }

    // ── แก้ไขโครงการที่มีอยู่แล้ว: เปลี่ยนโครงการต้นทางได้จากตัวเลือก "เลือกโครงการ" เท่านั้น —
    // ชื่อ/วันที่เริ่ม-สิ้นสุด/เจ้าของไซต์/ผู้ติดตั้ง ดึงมาจากโครงการต้นทางเสมอ แก้ไขตรงๆ ในนี้ไม่ได้
    // (ต้องไปแก้ที่โครงการต้นทางในโมดูล "โครงการ" แทน) ──
    var p = imtProject(id);
    var canEdit = window.canEdit(window.IMPL_MODULE);
    var initSp = imtResolveSourceProject(p);
    var curSrcId = initSp ? initSp.id : '';
    var srcFieldHtml = canEdit
      ? imtProjComboMarkup(curSrcId, 'window.imtEditProjectSourceChanged(this.value)')
      : '<input class="f-input" value="'+esc(initSp?initSp.name:'— ไม่ผูกกับโครงการ —')+'" disabled><input type="hidden" id="imt-p-source" value="'+esc(curSrcId)+'">';
    body.innerHTML =
      '<div class="f-group"><label class="f-label">เลือกโครงการ</label>' + srcFieldHtml + '</div>'
      + '<div class="f-grid"><div class="f-group"><label class="f-label">วันเริ่มต้น</label><input class="f-input" id="imt-p-start-view" value="'+(initSp&&initSp.start?fd(initSp.start):'-')+'" disabled></div>'
      + '<div class="f-group"><label class="f-label">วันสิ้นสุด</label><input class="f-input" id="imt-p-end-view" value="'+(initSp&&initSp.end?fd(initSp.end):'-')+'" disabled></div></div>'
      + '<div class="f-grid"><div class="f-group"><label class="f-label">🏢 เจ้าของไซต์</label><input class="f-input" id="imt-p-owner-view" value="'+esc(initSp?(initSp.siteOwner||'-'):'-')+'" disabled></div>'
      + '<div class="f-group"><label class="f-label">👷 ชื่อผู้ติดตั้ง</label><input class="f-input" id="imt-p-installer-view" value="'+esc(initSp?(initSp.installer||'-'):'-')+'" disabled></div></div>'
      + '<div class="f-group"><label class="f-label">สถานะ</label><select class="f-input" id="imt-p-status" '+(canEdit?'':'disabled')+'>'+window.IMPL_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(p.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; }).join('')+'</select></div>'
      + '<div style="font-size:11px;color:var(--txt3);margin-top:-4px;">วันที่/เจ้าของไซต์/ผู้ติดตั้ง ดึงมาจากโครงการต้นทางอัตโนมัติ แก้ไขตรงนี้ไม่ได้ — ถ้าต้องแก้ ให้ไปแก้ที่โครงการต้นทางในโมดูล "โครงการ"</div>';
    document.getElementById('m-imt-project-title').textContent = 'แก้ไขโครงการ';
    document.getElementById('m-imt-project-foot').style.display = canEdit ? '' : 'none';
    window.openM('m-imt-project');
    if (canEdit) {
      // แสดงเฉพาะโครงการที่ยังไม่สิ้นสุด เหมือนตอนสร้างใหม่ — แต่ถ้าโครงการที่ผูกอยู่ตอนนี้จบไปแล้ว
      // ให้ยังคงแสดงเป็นตัวเลือกอยู่ (unshift เข้าไป) จะได้ไม่หายไปจากลิสต์จนดูเหมือนข้อมูลหาย
      var todayEditP = new Date(); todayEditP.setHours(0,0,0,0);
      var availEditProjects = (window.PROJECTS||[]).filter(function (sp) { return sp.end && pd(sp.end) >= todayEditP; });
      if (initSp && !availEditProjects.find(function (x) { return x.id === initSp.id; })) availEditProjects.unshift(initSp);
      window._initImtProjCombobox && window._initImtProjCombobox(availEditProjects, curSrcId, { unboundLabel:'— ไม่ผูกกับโครงการ (กำหนดเอง) —' });
    }
  };

  // ── สลับ "เลือกโครงการ" ในฟอร์มแก้ไข: อัปเดตช่องอ่านอย่างเดียวทั้งหมดให้ตรงกับโครงการที่เพิ่งเลือกทันที ──
  window.imtEditProjectSourceChanged = function (srcId) {
    var sp = srcId ? (window.PROJECTS||[]).find(function (x) { return x.id === srcId; }) : null;
    var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.value = val || '-'; };
    set('imt-p-start-view', sp && sp.start ? fd(sp.start) : '-');
    set('imt-p-end-view', sp && sp.end ? fd(sp.end) : '-');
    set('imt-p-owner-view', sp ? (sp.siteOwner || '-') : '-');
    set('imt-p-installer-view', sp ? (sp.installer || '-') : '-');
  };

  window.saveImtProject = async function () {
    var id = window.imtEditProjectId;
    var isNew = !id;
    var row, name;

    if (isNew) {
      if (!window.canAdd(window.IMPL_MODULE)) return;
      var srcId = document.getElementById('imt-p-source').value;
      if (!srcId) { window.showAlert && window.showAlert('กรุณาเลือกโครงการ', 'error'); return; }
      var sp = (window.PROJECTS||[]).find(function (x) { return x.id === srcId; });
      if (!sp) return;
      name = sp.name;
      id = window.imtUid('IPJ');
      row = {
        project_name: name,
        start_date: sp.start || null,
        end_date: sp.end || null,
        status: 'not_started',
        progress_percent: 0,
        source_project_id: srcId,
      };
      var templateId = document.getElementById('imt-p-template').value;
      row.template_id = templateId;
      window.closeM('m-imt-project');
      window.imtApplyLocal('IMPL_PROJECTS', id, row);
      await window.setDoc(window.getDocRef('IMPL_PROJECTS', id), row);
      // ── ถ้า apply Template ล้มเหลว (เช่น ยังไม่ได้รัน migration เพิ่มคอลัมน์ล่าสุด) ต้องเห็น error
      // ชัดเจนแทนที่จะเงียบหายไป — โครงการเองสร้างสำเร็จแล้วก่อนหน้านี้ ไม่ต้อง rollback ──
      if (templateId) {
        try { await window.imtApplyTemplate(templateId, id, row.start_date, row.end_date); }
        catch (e) { window.showDbError ? window.showDbError(e) : console.error('[impl-tracker] imtApplyTemplate error', e); }
      }
      window.imtLogActivity(id, 'project', id, 'create', 'สร้างโครงการ '+name);
      window.renderImplTracker();
      return;
    }

    if (!window.canEdit(window.IMPL_MODULE)) return;
    var curP = imtProject(id);
    var editSrcId = document.getElementById('imt-p-source').value;
    var editSp = editSrcId ? (window.PROJECTS||[]).find(function (x) { return x.id === editSrcId; }) : null;
    name = editSp ? editSp.name : curP.name;
    row = {
      project_name: name,
      start_date: editSp ? (editSp.start || null) : (curP.start || null),
      end_date: editSp ? (editSp.end || null) : (curP.end || null),
      status: document.getElementById('imt-p-status').value,
      source_project_id: editSrcId || '',
    };
    window.closeM('m-imt-project');
    window.imtApplyLocal('IMPL_PROJECTS', id, row);
    await window.setDoc(window.getDocRef('IMPL_PROJECTS', id), row);
    window.imtLogActivity(id, 'project', id, 'update', 'แก้ไขโครงการ '+name);
    window.renderImplTracker();
  };

  // ================================================================
  // WORKSPACE — "งาน": Phase Accordion + List + Kanban รวมเป็นแท็บเดียว
  // สลับมุมมองด้วย window.imtBoardView: 'card' (Phase, default) | 'list' | 'kanban'
  // filter ใช้ window.imtTaskFilter: { q, status, owner, phaseId }
  // ================================================================
  function imtFilteredTasks(list) {
    var f = window.imtTaskFilter || {};
    var q = (f.q || '').toLowerCase();
    return list.filter(function (t) {
      if (q && t.name.toLowerCase().indexOf(q) === -1) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.owner && t.ownerId !== f.owner) return false; // f.owner = รหัสพนักงาน
      if (f.phaseId && t.phaseId !== f.phaseId) return false;
      return true;
    });
  }

  window.imtSetBoardView = function (view) {
    window.imtBoardView = view;
    window.renderImplTracker();
  };

  window.imtSetTaskFilter = function (key, value) {
    window.imtTaskFilter = window.imtTaskFilter || {};
    window.imtTaskFilter[key] = value;
    window.renderImplTracker();
  };

  function renderImtWorkspace(mount) {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) {
      mount.innerHTML = projectPicker();
      return;
    }
    var phases = imtPhasesOf(pid);
    var view = window.imtBoardView || 'card';

    // ── เมนูซ้ายแบบเดียวกับแท็บ "อบรม" (.trn-side*) — มุมมอง (Phase/List/Kanban) + จัดการโครงการ
    // แทนแถวหัวเดิมเหนือตัวกรอง ให้พื้นที่แนวตั้งเหลือแสดงงานได้มากขึ้น · มือถือพับเป็นปุ่ม ☰ ──
    var VIEWS = [{ id:'card', icon:'📋', label:'Phase' }, { id:'list', icon:'📃', label:'List' }, { id:'kanban', icon:'🗃️', label:'Kanban' }];
    var curView = VIEWS.filter(function (v) { return v.id === view; })[0] || VIEWS[0];
    var sideItem = function (on, onclick, icon, label, cls) {
      return '<div class="trn-side-item'+(on?' on':'')+(cls?' '+cls:'')+'" onclick="'+onclick+'"><span class="trn-side-ic">'+icon+'</span>'+label+'</div>';
    };
    var actions = (window.canAdd(window.IMPL_MODULE) ? sideItem(false, 'window.openImtPhaseModal(null)', '➕', 'เพิ่ม Phase') : '')
      + (window.canAdd(window.IMPL_MODULE) && phases.length ? sideItem(false, 'window.imtSaveProjectAsTemplate(\''+pid+'\')', '📐', 'บันทึกเป็น Template') : '')
      + (window.canEdit(window.IMPL_MODULE) ? sideItem(false, 'window.openImtProjectModal(\''+pid+'\')', '✏️', 'แก้ไขโครงการ') : '')
      + (window.canDel(window.IMPL_MODULE) ? sideItem(false, 'window.askDel(\'imt_project\',\''+pid+'\',\''+esc(proj.name).replace(/'/g,'')+'\')', '🗑️', 'ลบโครงการ', 'imt-ws-danger') : '');
    var side = '<nav class="trn-side">'
      + '<button class="trn-side-toggle" onclick="this.parentNode.classList.toggle(\'open\')">☰ <span>'+curView.icon+' '+curView.label+'</span><span class="trn-side-caret">▼</span></button>'
      + '<div class="trn-side-list">'
      +   '<div class="trn-side-g">มุมมอง</div>'
      +   VIEWS.map(function (v) { return sideItem(view === v.id, 'window.imtSetBoardView(\''+v.id+'\')', v.icon, v.label); }).join('')
      +   (actions ? '<div class="imt-ws-actions-grp"><div class="trn-side-g">จัดการโครงการ</div>'+actions+'</div>' : '')
      + '</div>'
      + '</nav>';

    var f = window.imtTaskFilter || {};
    // ── ตัวกรอง "ผู้รับผิดชอบ" ใช้ทีมงานของโครงการต้นทาง (imtProjectTeamStaff — แหล่งเดียวกับที่ใช้เติม
    // ตัวเลือกตอนมอบหมายงานใน Task modal) ไม่ใช่พนักงานทั้งบริษัท และไม่ใช่แค่คนที่ถูกมอบหมายไปแล้ว
    // (เผื่อยังมอบหมายไม่ครบทุกคน) — แสดงป้ายกำกับเป็น "ชื่อ-นามสกุล (ชื่อเล่น)" ให้อ่านง่ายขึ้น ──
    var ownerOpts = ['<option value="">ทุกคน</option>'].concat(imtProjectTeamStaff(pid).map(function (s) {
      var nick = s.nickname || s.name;
      return { id:s.id, label:s.name+' ('+nick+')' };
    }).sort(function (a,b) { return a.label.localeCompare(b.label, 'th'); }).map(function (o) {
      return '<option value="'+esc(o.id)+'"'+(f.owner===o.id?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');
    var phaseOpts = ['<option value="">ทุก Phase</option>'].concat(phases.map(function (p) { return '<option value="'+p.id+'"'+(f.phaseId===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; })).join('');
    var statusOpts = ['<option value="">ทุกสถานะ</option>'].concat(window.IMPL_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(f.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; })).join('');
    // ── ซ่อน Phase ที่เสร็จ 100% แล้ว ค่าเริ่มต้นติ๊กไว้ (undefined !== false → true) กันไม่ให้ผู้ใช้ต้องไล่
    // เลื่อนผ่าน Phase ที่จบไปแล้วทุกครั้งที่เข้าหน้านี้ ──
    var hideDone = window.imtHideDonePhases !== false;
    var hideDoneChk = '<label class="imt-hidedone-chk" style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--txt2);white-space:nowrap;cursor:pointer;">'
      + '<input type="checkbox" '+(hideDone?'checked':'')+' onchange="window.imtToggleHideDonePhases(this.checked)"> แสดงเฉพาะ Phase ที่ยังไม่เสร็จ'
      + '</label>';
    var filterBar = '<div class="imt-ws-filterbar">'
      + '<div class="t-search"><input placeholder="ค้นหางาน..." value="'+esc(f.q||'')+'" oninput="window.imtSetTaskFilter(\'q\',this.value)"></div>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'status\',this.value)">'+statusOpts+'</select>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'owner\',this.value)">'+ownerOpts+'</select>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'phaseId\',this.value)">'+phaseOpts+'</select>'
      + hideDoneChk
      + '<div style="flex:1"></div>'
      + (window.canAdd(window.IMPL_MODULE) && view !== 'card' && phases.length ? '<button class="btn btn-pri btn-sm" onclick="window.openImtTaskModal(null,\'\')">+ Task</button>' : '')
      + '</div>';

    var body;
    if (view === 'list') body = renderTaskListView(pid);
    else if (view === 'kanban') body = renderTaskKanbanView(pid);
    else {
      // ── กรองด้วย Phase (dropdown "รายการ") และ/หรือ checkbox "ซ่อน Phase ที่เสร็จแล้ว" ให้แสดงเฉพาะ Phase
      // ที่ตรงเงื่อนไข ไม่ใช่ทุก Phase แต่เลขลำดับ "Phase N" ยังอ้างอิงตำแหน่งจริงใน phases ทั้งหมด
      // (ไม่ใช่ตำแหน่งหลังกรอง) ──
      var phasesToShow = f.phaseId ? phases.filter(function (p) { return p.id === f.phaseId; }) : phases;
      if (hideDone) phasesToShow = phasesToShow.filter(function (p) { return window.calcPhaseProgress(p) < 100; });
      body = phasesToShow.map(function (ph) {
        var idx = phases.findIndex(function (p) { return p.id === ph.id; });
        return renderPhaseAccordion(ph, idx, phases.length);
      }).join('') || (phases.length
        ? '<div class="imt-empty-hero" style="padding:40px 20px;"><div class="imt-empty-icon">🎉</div><div class="imt-empty-title">ทุก Phase เสร็จสมบูรณ์แล้ว</div><div class="imt-empty-sub">ยกเลิกติ๊ก "แสดงเฉพาะ Phase ที่ยังไม่เสร็จ" ด้านบนเพื่อดู Phase ทั้งหมด</div></div>'
        : '<div class="imt-empty-hero" style="padding:40px 20px;"><div class="imt-empty-icon">📋</div><div class="imt-empty-title">ยังไม่มี Phase ในโครงการนี้</div><div class="imt-empty-sub">กด "+ Phase" ด้านบนเพื่อเริ่มสร้างหมวดงาน</div></div>');
    }

    // ── เก็บ/คืนตำแหน่ง scroll ของพื้นที่เนื้อหา (ไม่ใช่ header/filterbar) กัน re-render แล้วจอกระโดดกลับขึ้นบนสุด
    // เช่นตอนกดบันทึกใน Task modal ซึ่งจบด้วย window.renderImplTracker() เสมอ ──
    var prevScrollEl = mount.querySelector('.imt-ws-scroll');
    var prevScrollTop = prevScrollEl ? prevScrollEl.scrollTop : 0;
    mount.innerHTML = '<div class="imt-trn">' + side
      + '<div class="imt-ws-main">' + filterBar + '<div class="imt-ws-scroll" style="padding:'+(view==='kanban'?'0':'16px 24px')+';overflow-y:auto;flex:1;">'+body+'</div></div>'
      + '</div>';
    var scrollEl = mount.querySelector('.imt-ws-scroll');
    if (scrollEl) scrollEl.scrollTop = prevScrollTop;
  }

  window.imtToggleHideDonePhases = function (checked) {
    window.imtHideDonePhases = checked;
    window.renderImplTracker();
  };

  window.imtProjectPicker = function () { return projectPicker(); }; // ── ใช้ร่วมกับแท็บ "แบบฟอร์ม" ──
  function projectPicker() {
    var hideDoneProjects = window.imtHideDoneProjects !== false;
    var rows = window.IMPL_PROJECTS.slice().sort(function (a,b) { return IMT_HEALTH_ORDER[imtProjectHealth(a).level] - IMT_HEALTH_ORDER[imtProjectHealth(b).level]; });
    if (hideDoneProjects) rows = rows.filter(function (p) { return imtProjectHealth(p).level !== 'done'; });
    var cards = rows.map(function (p) { return imtHealthCardHtml(p, null, { expandable:true }); }).join('')
      || (window.IMPL_PROJECTS.length
        ? '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:13px;padding:60px 20px;">🎉 ทุกโครงการเสร็จแล้ว 100% — ยกเลิกติ๊ก "แสดงเฉพาะโครงการที่ยังไม่เสร็จ" ด้านบนเพื่อดูโครงการทั้งหมด</div>'
        : '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:13px;padding:60px 20px;">ยังไม่มีโครงการ — กด "+ เพิ่มโครงการ" ที่มุมขวาบนเพื่อเริ่มต้น</div>');
    var hideDoneProjectsChk = '<label class="imt-hidedone-chk" style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:12.5px;color:var(--txt2);white-space:nowrap;cursor:pointer;margin-bottom:12px;">'
      + '<input type="checkbox" '+(hideDoneProjects?'checked':'')+' onchange="window.imtToggleHideDoneProjects(this.checked)"> แสดงเฉพาะโครงการที่ยังไม่เสร็จ'
      + '</label>';
    return '<div style="max-width:1000px;margin:0 auto;padding-top:20px;">'+hideDoneProjectsChk+'<div class="imt-pgrid">'+cards+'</div></div>';
  }

  // ── สถานะ Phase: คำนวณจากงานข้างในเอง (เดิมใช้ค่าที่ตั้งมือในฟอร์ม Phase ซึ่งมักค้าง "ยังไม่เริ่ม" แม้งานเสร็จ 100%)
  // ยกเว้นสถานะพิเศษที่คำนวณจากงานไม่ได้ (ล่าช้า/มีปัญหา/รอตรวจสอบ/ยกเลิก) — ตั้งไว้ในฟอร์มก็ยังใช้ค่านั้น ──
  var IMT_PHASE_MANUAL_STATUS = ['delayed', 'issue', 'review', 'cancelled'];
  function imtPhaseStatus(ph) {
    if (IMT_PHASE_MANUAL_STATUS.indexOf(ph.status) > -1) return imtStatus(ph.status);
    var tasks = imtTasksOfPhase(ph.id).filter(function (t) { return t.status !== 'cancelled'; });
    var id = window.calcPhaseProgress(ph) >= 100 && tasks.length ? 'done'
      : tasks.some(function (t) { return t.status !== 'not_started' || window.calcTaskProgress(t) > 0; }) ? 'in_progress'
      : 'not_started';
    return imtStatus(id);
  }

  function renderPhaseAccordion(ph, idx, total) {
    var allTasks = imtTasksOfPhase(ph.id);
    var tasks = imtFilteredTasks(allTasks);
    var pct = window.calcPhaseProgress(ph);
    var st = imtPhaseStatus(ph);
    var open = window['_imtOpenPhase_'+ph.id] !== false; // เปิดโดย default
    var canEdit = window.canEdit(window.IMPL_MODULE);
    // ── idx/total อ้างอิงตำแหน่งจริงใน allTasks (ไม่ใช่ tasks ที่ถูกกรอง) กันเลขลำดับ/ลากสลับตำแหน่งพัง
    // เวลามีตัวกรองค้นหา/สถานะอยู่ ยังต้องได้เลขลำดับที่ตรงกับตำแหน่งจริงใน Phase เสมอ ──
    var taskCards = tasks.map(function (t) {
      var realIdx = allTasks.findIndex(function (x) { return x.id === t.id; });
      return renderTaskCard(t, realIdx, allTasks.length);
    }).join('') || '<div style="color:var(--txt3);font-size:12px;padding:8px 0;">ไม่มี Task ที่ตรงเงื่อนไขในหมวดนี้</div>';
    // ── ลากสลับลำดับ Phase แทนปุ่ม ▲▼ เดิม (drag handle อยู่ที่ตัวหัวข้อ Phase เท่านั้น ไม่รวม body
    // ที่มี Task card ซึ่ง draggable ของตัวเองอยู่ด้วย กันสับสนเรื่อง drag target ซ้อนกัน) ──
    var dragAttrs = canEdit
      ? ' draggable="true" ondragstart="window.imtPhaseDragStart(event,\''+ph.id+'\')" ondragover="window.imtPhaseDragOver(event)" ondragleave="window.imtPhaseDragLeave(event)" ondrop="window.imtPhaseDrop(event,\''+ph.id+'\')" ondragend="window.imtPhaseDragEnd()"'
      : '';
    return '<div class="imt-phase'+(open?' open':'')+'" id="imt-phase-'+ph.id+'" style="border-left:4px solid '+st.color+';">'
      + '<div class="imt-phase-head" onclick="window.imtTogglePhase(\''+ph.id+'\')"'+dragAttrs+'>'
      +   '<span class="imt-phase-caret">▶</span><span class="imt-phase-num">Phase '+(idx+1)+'</span><span class="imt-phase-name">'+esc(ph.name)+'</span>'
      +   statusTag(st) + '<div class="imt-phase-pbar">'+pbarHtml(pct)+'</div><span style="font-size:11px;font-weight:700;width:34px;text-align:right;">'+pct+'%</span>'+window.calcTip("ความคืบหน้า Phase = ค่าเฉลี่ยของทุกงานใน Phase\nงาน = Checklist ที่ติ๊กแล้ว ÷ Checklist ทั้งหมด (ไม่มี Checklist: เสร็จแล้ว = 100%)")
      +   (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-sec btn-sm" title="เพิ่ม Task" onclick="event.stopPropagation();window.openImtTaskModal(null,\''+ph.id+'\')">+<span class="btn-label"> Task</span></button>' : '')
      +   (window.canDel(window.IMPL_MODULE) ? '<button class="btn btn-red btn-sm" title="ลบ Phase" onclick="event.stopPropagation();window.askDel(\'imt_phase\',\''+ph.id+'\',\''+esc(ph.name)+'\')">🗑️<span class="btn-label"> ลบ</span></button>' : '')
      + '</div>'
      + '<div class="imt-phase-body"><div class="imt-tgrid">'+taskCards+'</div></div>'
      + '</div>';
  }

  window.imtTogglePhase = function (phaseId) {
    var key = '_imtOpenPhase_'+phaseId;
    window[key] = window[key] === false ? true : false;
    window.renderImplTracker();
  };

  // ── ลากสลับลำดับ Phase: จัดเรียง sort_order ใหม่ทั้งหมดตามตำแหน่งที่ลากวาง (เหมือน imtTaskDrop) ──
  window.imtPhaseDragStart = function (ev, phaseId) {
    window.imtDragPhaseId = phaseId;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', phaseId); } catch (e) {}
  };
  window.imtPhaseDragOver = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('imt-phase-dragover');
  };
  window.imtPhaseDragLeave = function (ev) {
    ev.currentTarget.classList.remove('imt-phase-dragover');
  };
  window.imtPhaseDragEnd = function () {
    document.querySelectorAll('.imt-phase-dragover').forEach(function (el) { el.classList.remove('imt-phase-dragover'); });
  };
  window.imtPhaseDrop = async function (ev, targetPhaseId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('imt-phase-dragover');
    var draggedId = window.imtDragPhaseId;
    window.imtDragPhaseId = null;
    if (!draggedId || draggedId === targetPhaseId) return;
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var list = imtPhasesOf(window.imtCurrentProjectId);
    var fromIdx = list.findIndex(function (p) { return p.id === draggedId; });
    if (fromIdx < 0) return;
    var moved = list.splice(fromIdx, 1)[0];
    var toIdx = list.findIndex(function (p) { return p.id === targetPhaseId; });
    if (toIdx < 0) return;
    list.splice(toIdx, 0, moved);
    var changed = [];
    list.forEach(function (p, i) {
      var newOrder = i + 1;
      if (p.order !== newOrder) {
        changed.push({ id:p.id, order:newOrder });
        window.imtApplyLocal('IMPL_PHASES', p.id, { project_id:p.projectId, phase_name:p.name, description:p.description, status:p.status, sort_order:newOrder, progress_percent:p.progress });
      }
    });
    window.renderImplTracker();
    await Promise.all(changed.map(function (c) {
      return window.updateDoc(window.getDocRef('IMPL_PHASES', c.id), { sort_order:c.order });
    })).catch(window.showDbError);
  };

  function renderTaskCard(t, idx, total) {
    var ck = imtChecklistOf(t.id);
    var doneCk = ck.filter(function (c) { return c.done; }).length;
    var pct = window.calcTaskProgress(t);
    var overdue = window.imtIsOverdue(t);
    var st = imtStatus(t.status);
    var canEdit = window.canEdit(window.IMPL_MODULE);
    // ── เลขลำดับนับแยกตาม Phase (1,2,3... เริ่มใหม่ทุก Phase) — idx มาจากตำแหน่งจริงใน allTasks ของ Phase นั้น ──
    var orderBadge = typeof idx === 'number' ? '<span class="imt-tcard-order">'+(idx+1)+'</span>' : '';
    var dragAttrs = canEdit
      ? ' draggable="true" ondragstart="window.imtTaskDragStart(event,\''+t.id+'\',\''+t.phaseId+'\')" ondragover="window.imtTaskDragOver(event)" ondragleave="window.imtTaskDragLeave(event)" ondrop="window.imtTaskDrop(event,\''+t.id+'\',\''+t.phaseId+'\')" ondragend="window.imtTaskDragEnd(event)"'
      : '';
    return '<div class="imt-tcard'+(overdue?' overdue':'')+'"'+dragAttrs+' style="border-left:3px solid '+st.color+';" onclick="window.openImtTaskModal(\''+t.id+'\')">'
      + '<div class="imt-tcard-head">'+orderBadge+'<div class="imt-tcard-name">'+esc(t.name)+'</div></div>'
      // ── แบบกะทัดรัด: สถานะ / Checklist / ผู้รับผิดชอบ / กำหนดส่ง รวมเป็นบรรทัดเดียว (ตัดขึ้นบรรทัดใหม่เองถ้าการ์ดแคบ)
      // ผู้รับผิดชอบแสดงเฉพาะเมื่อมีค่า แถบความคืบหน้าบางไว้ท้ายการ์ด ──
      + '<div class="imt-tcard-meta">'
      +   statusTag(st)
      +   (ck.length ? '<span title="Checklist ที่ติ๊กแล้ว / ทั้งหมด">☑ '+doneCk+'/'+ck.length+'</span>' : '')
      +   (t.owner ? '<span class="imt-tcard-owner" title="ผู้รับผิดชอบ">👤 '+esc(t.owner)+'</span>' : '')
      +   (t.due ? '<span class="imt-tcard-due" title="กำหนดส่ง">⏰ '+fd(t.due)+'</span>' : '')
      + '</div>'
      + pbarHtml(pct, st.color)
      + '</div>';
  }

  // ── ลากสลับลำดับ Task (Card view) — จำกัดแค่ลากภายใน Phase เดียวกัน (ลากข้าม Phase จะไม่ทำอะไร
  // เพราะต้องแก้ phase_id ด้วย ซึ่งไม่ใช่จุดประสงค์ของการ "เรียงลำดับ" ในหน้านี้) ──
  window.imtTaskDragStart = function (ev, taskId, phaseId) {
    window.imtDragTaskId = taskId;
    window.imtDragTaskPhaseId = phaseId;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', taskId); } catch (e) {}
  };
  window.imtTaskDragOver = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('imt-tcard-dragover');
  };
  window.imtTaskDragLeave = function (ev) {
    ev.currentTarget.classList.remove('imt-tcard-dragover');
  };
  window.imtTaskDragEnd = function () {
    document.querySelectorAll('.imt-tcard-dragover').forEach(function (el) { el.classList.remove('imt-tcard-dragover'); });
  };
  window.imtTaskDrop = async function (ev, targetTaskId, targetPhaseId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('imt-tcard-dragover');
    var draggedId = window.imtDragTaskId, draggedPhaseId = window.imtDragTaskPhaseId;
    window.imtDragTaskId = null; window.imtDragTaskPhaseId = null;
    if (!draggedId || draggedId === targetTaskId) return;
    if (draggedPhaseId !== targetPhaseId) return;
    if (!window.canEdit(window.IMPL_MODULE)) return;
    var list = imtTasksOfPhase(targetPhaseId);
    var fromIdx = list.findIndex(function (x) { return x.id === draggedId; });
    if (fromIdx < 0) return;
    var moved = list.splice(fromIdx, 1)[0];
    var toIdx = list.findIndex(function (x) { return x.id === targetTaskId; });
    if (toIdx < 0) return;
    list.splice(toIdx, 0, moved);
    // reassign sort_order 1..n ตามลำดับใหม่ทั้งหมด (รองรับลากข้ามหลายตำแหน่งในครั้งเดียว ไม่ใช่แค่สลับคู่ข้างเคียง)
    var changed = [];
    list.forEach(function (tk, i) {
      var newOrder = i + 1;
      if (tk.order !== newOrder) {
        changed.push({ id:tk.id, order:newOrder });
        window.imtApplyLocal('IMPL_TASKS', tk.id, imtTaskRow(tk, { sort_order:newOrder }));
      }
    });
    window.renderImplTracker();
    await Promise.all(changed.map(function (c) {
      return window.updateDoc(window.getDocRef('IMPL_TASKS', c.id), { sort_order:c.order });
    })).catch(window.showDbError);
  };

  // ── List view: จัดกลุ่มตาม Phase (เรียง Phase น้อยไปมากตาม imtPhasesOf) แทนตารางเรียงเดี่ยว
  // แต่ละกลุ่มมีแถวหัวข้อ Phase คั่น ทำให้เห็นว่างานไหนอยู่ Phase ไหนโดยไม่ต้องอ่านคอลัมน์ Phase ทีละแถว ──
  function renderTaskListView(pid) {
    var filtered = imtFilteredTasks(imtTasksOfProject(pid));
    var phases = imtPhasesOf(pid);
    var hideDone = window.imtHideDonePhases !== false;
    var rowsHtml = phases.map(function (ph, idx) {
      if (hideDone && window.calcPhaseProgress(ph) >= 100) return '';
      var phaseTasks = filtered.filter(function (t) { return t.phaseId === ph.id; });
      if (!phaseTasks.length) return '';
      var pct = window.calcPhaseProgress(ph);
      var headHtml = '<tr class="imt-list-phasehead"><td colspan="5">'
        + '<span class="imt-phase-num">Phase '+(idx+1)+'</span> '+esc(ph.name)
        + '<span style="float:right;color:var(--txt3);">'+phaseTasks.length+' งาน · '+pct+'%</span></td></tr>';
      var taskRows = phaseTasks.map(function (t) {
        var st = imtStatus(t.status);
        var tpct = window.calcTaskProgress(t);
        return '<tr onclick="window.openImtTaskModal(\''+t.id+'\')"'+(window.imtIsOverdue(t)?' class="hl-err"':'')+'>'
          + '<td>'+esc(t.name)+'</td>'
          + '<td>'+esc(t.owner||'-')+'</td><td>'+(t.due?fd(t.due):'-')+'</td>'
          + '<td>'+statusTag(st)+'</td><td style="width:130px;">'+pbarHtml(tpct, st.color)+'</td>'
          + '</tr>';
      }).join('');
      return headHtml + taskRows;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:30px;">ไม่พบงานที่ตรงเงื่อนไข</td></tr>';
    return '<div class="dtable-inner"><table><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th><th>สถานะ</th><th>ความคืบหน้า</th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';
  }

  // ── Kanban view: ภายในแต่ละคอลัมน์สถานะ จัดกลุ่มการ์ดตาม Phase (เรียงน้อยไปมาก) แทนเรียงคละกัน
  // การ์ดยังลากเปลี่ยนสถานะข้ามคอลัมน์ได้ตามเดิม กลุ่ม Phase เป็นแค่การจัดเรียง/ป้ายกำกับภายในคอลัมน์ ──
  function renderTaskKanbanView(pid) {
    var tasks = imtFilteredTasks(imtTasksOfProject(pid));
    var phases = imtPhasesOf(pid);
    var hideDone = window.imtHideDonePhases !== false;
    var cols = window.IMPL_STATUS.map(function (st) {
      var items = tasks.filter(function (t) { return t.status === st.id; });
      var body = phases.map(function (ph, idx) {
        if (hideDone && window.calcPhaseProgress(ph) >= 100) return '';
        var phItems = items.filter(function (t) { return t.phaseId === ph.id; });
        if (!phItems.length) return '';
        var cards = phItems.map(function (t) {
          return '<div class="imt-tcard" draggable="'+window.canEdit(window.IMPL_MODULE)+'" ondragstart="window.imtDrag(event,\''+t.id+'\')" onclick="window.openImtTaskModal(\''+t.id+'\')">'
            + '<div class="imt-tcard-name">'+esc(t.name)+'</div>'
            + '<div class="imt-tcard-foot"><span>👤 '+esc(t.owner||'-')+'</span><span>'+(t.due?fd(t.due):'')+'</span></div>'
            + '</div>';
        }).join('');
        return '<div class="imt-kb-phasegroup"><div class="imt-kb-phaselbl"><span class="imt-phase-num">Phase '+(idx+1)+'</span> '+esc(ph.name)+'</div>'+cards+'</div>';
      }).join('');
      return '<div class="imt-col" ondragover="event.preventDefault();this.classList.add(\'imt-col-drop\')" ondragleave="this.classList.remove(\'imt-col-drop\')" ondrop="window.imtDrop(event,\''+st.id+'\')">'
        + '<div class="imt-col-head"><span class="led" style="background:'+st.color+'"></span><b style="font-size:12px;">'+st.icon+' '+st.label+'</b><span class="kb-cnt" style="margin-left:auto;">'+items.length+'</span></div>'
        + '<div class="imt-col-body">'+(body||'<div class="kb-empty">ไม่มีงาน</div>')+'</div></div>';
    }).join('');
    return '<div id="imt-board">'+cols+'</div>';
  }

  window.openImtPhaseModal = function (id) {
    window.imtEditPhaseId = id;
    var ph = id ? imtPhase(id) : { name:'', description:'', status:'not_started' };
    var body = document.getElementById('m-imt-phase-body');
    body.innerHTML =
      '<div class="f-group"><label class="f-label">ชื่อ Phase / หมวดงาน *</label><input class="f-input" id="imt-ph-name" value="'+esc(ph.name)+'"></div>'
      + '<div class="f-group"><label class="f-label">รายละเอียด</label><textarea class="f-input" id="imt-ph-desc">'+esc(ph.description)+'</textarea></div>'
      // สถานะ: ปกติ "อัตโนมัติ" (คำนวณจากงาน — ดู imtPhaseStatus) · ตั้งเองได้เฉพาะสถานะที่คำนวณจากงานไม่ได้
      + '<div class="f-group"><label class="f-label">สถานะ</label><select class="f-input" id="imt-ph-status">'
      +   '<option value="not_started">🔄 อัตโนมัติตามงาน (ยังไม่เริ่ม / กำลังดำเนินการ / เสร็จแล้ว)</option>'
      +   window.IMPL_STATUS.filter(function (s) { return IMT_PHASE_MANUAL_STATUS.indexOf(s.id) > -1; }).map(function (s) { return '<option value="'+s.id+'"'+(ph.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; }).join('')
      + '</select></div>';
    document.getElementById('m-imt-phase-title').textContent = id ? 'แก้ไข Phase' : 'เพิ่ม Phase ใหม่';
    window.openM('m-imt-phase');
  };

  window.saveImtPhase = async function () {
    var id = window.imtEditPhaseId;
    var isNew = !id;
    var name = document.getElementById('imt-ph-name').value.trim();
    if (!name) { window.showAlert && window.showAlert('กรุณาระบุชื่อ Phase', 'error'); return; }
    var pid = window.imtCurrentProjectId;
    if (isNew) id = window.imtUid('IPH');
    var row = {
      project_id: pid, phase_name: name,
      description: document.getElementById('imt-ph-desc').value.trim(),
      status: document.getElementById('imt-ph-status').value,
      sort_order: isNew ? (imtPhasesOf(pid).length + 1) : imtPhase(id).order,
      progress_percent: 0,
    };
    window.closeM('m-imt-phase');
    window.imtApplyLocal('IMPL_PHASES', id, row);
    await window.setDoc(window.getDocRef('IMPL_PHASES', id), row);
    window.imtLogActivity(pid, 'phase', id, isNew ? 'create' : 'update', (isNew?'สร้าง Phase ':'แก้ไข Phase ')+name);
    window.renderImplTracker();
  };

  // ── Task Modal (Detail: checklist / comment / attachment / activity / issue / status) ──
  window.openImtTaskModal = function (id, phaseId) {
    window.imtEditTaskId = id;
    var t = id ? imtTask(id) : { phaseId:phaseId, name:'', description:'', owner:'', start:'', due:'', priority:'medium', status:'not_started', progress:0 };
    document.getElementById('m-imt-task-title').textContent = id ? 'รายละเอียดงาน' : 'เพิ่ม Task ใหม่';
    var canEdit = window.canEdit(window.IMPL_MODULE) || window.canAdd(window.IMPL_MODULE);
    var needsPhaseSelect = !id && !phaseId;
    var phaseFieldHtml = needsPhaseSelect
      ? '<div class="f-group"><label class="f-label">Phase *</label><select class="f-input" id="imt-t-phase">'+imtPhasesOf(window.imtCurrentProjectId).map(function (ph) { return '<option value="'+ph.id+'">'+esc(ph.name)+'</option>'; }).join('')+'</select></div>'
      : '';

    // ── บอกที่มาของรายชื่อทีมงานใน "ผู้รับผิดชอบ" ให้เห็นชัดว่าดึงจากโครงการต้นทางไหน — ช่วยจับได้ทันที
    // ถ้าโครงการ impl-tracker นี้ยังไม่ได้ผูก/ผูกผิดโครงการ แทนที่จะเดางงว่าทำไมรายชื่อไม่ตรง ──
    var teamSrcProj = imtResolveSourceProject(imtProject(window.imtCurrentProjectId));
    var teamHint = teamSrcProj
      ? '<div style="font-size:10.5px;color:var(--txt3);margin-top:-8px;margin-bottom:10px;">ทีมงานจากโครงการ: '+esc(teamSrcProj.name)+'</div>'
      : '<div style="font-size:10.5px;color:var(--coral);margin-top:-8px;margin-bottom:10px;">⚠️ โครงการนี้ยังไม่ได้ผูกกับโครงการต้นทาง — ไปที่ "แก้ไขโครงการ" เพื่อเลือกโครงการก่อน จะได้ดึงรายชื่อทีมงานมาให้เลือกได้</div>';

    var formHtml =
      '<div class="sec-label" style="margin-bottom:12px;">ข้อมูลทั่วไป</div>'
      + '<div class="f-group"><label class="f-label">ชื่องาน *</label><input class="f-input" id="imt-t-name" value="'+esc(t.name)+'" '+(canEdit?'':'disabled')+'></div>'
      + phaseFieldHtml
      + '<div class="f-group"><label class="f-label">รายละเอียด</label><textarea class="f-input" id="imt-t-desc" '+(canEdit?'':'disabled')+'>'+esc(t.description)+'</textarea></div>'
      + teamHint
      + '<div class="f-grid"><div class="f-group"><label class="f-label">👤 ผู้รับผิดชอบ</label>' + imtStaffComboMarkup(t.ownerId, !canEdit) + '</div>'
      + '<div class="f-group"><label class="f-label">⚡ ระดับความสำคัญ</label><select class="f-input" id="imt-t-priority" '+(canEdit?'':'disabled')+'>'+window.IMPL_PRIORITY.map(function (p) { return '<option value="'+p.id+'"'+(t.priority===p.id?' selected':'')+'>'+p.label+'</option>'; }).join('')+'</select></div></div>'
      + '<div class="f-grid"><div class="f-group"><label class="f-label">📅 วันเริ่มต้น</label><input type="date" class="f-input" id="imt-t-start" value="'+esc(t.start)+'" '+(canEdit?'':'disabled')+'></div>'
      + '<div class="f-group"><label class="f-label">⏰ กำหนดเสร็จ (Due Date)</label><input type="date" class="f-input" id="imt-t-due" value="'+esc(t.due)+'" '+(canEdit?'':'disabled')+'></div></div>'
      + '<div class="f-group"><label class="f-label">🚦 สถานะ</label>'
      +   '<select class="f-input imt-status-select" id="imt-t-status" '+(canEdit?'':'disabled')+' style="background-color:'+imtStatus(t.status).color+'22;color:'+imtStatus(t.status).color+';border-color:'+imtStatus(t.status).color+'55;" onchange="window.imtSetTaskStatusField(this.value)">'
      +     window.IMPL_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(t.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; }).join('')
      +   '</select>'
      + '</div>';

    var checklistHtml = '', commentHtml = '', attachHtml = '';
    if (id) {
      var ck = imtChecklistOf(id);
      var ckDone = ck.filter(function(c){return c.done;}).length;
      var ckPct = ck.length ? Math.round((ckDone / ck.length) * 100) : 0;
      var ckRows = ck.map(function (c) {
        return '<div class="imt-ck-row"><input type="checkbox" '+(c.done?'checked':'')+' '+(canEdit?'':'disabled')+' onchange="window.imtToggleChecklist(\''+c.id+'\')">'
          + '<div style="flex:1;"><div class="imt-ck-name'+(c.done?' done':'')+'">'+esc(c.name)+'</div>'
          + (c.done ? '<div style="font-size:10px;color:var(--txt3);">✓ '+fd(c.doneDate)+(c.doneBy?(' โดย '+esc(c.doneBy)):'')+'</div>' : '')
          + '</div>' + (canEdit ? '<button class="m-x" onclick="window.imtRemoveChecklistItem(\''+c.id+'\')">✕</button>' : '') + '</div>';
      }).join('') || '<div style="color:var(--txt3);font-size:12px;">ยังไม่มี Checklist</div>';

      // ── ปุ่ม "✅ Mark as Done" ย้ายมาไว้ที่หัวข้อ "เช็คลิสต์" (มุมซ้ายบนของส่วนนี้) เฉพาะตอนมี Checklist
      // มากกว่า 1 รายการ — กรณีมีแค่ 1 รายการ ติ๊ก Checkbox รายการเดียวก็เพียงพอ (auto เปลี่ยนสถานะให้เองใน
      // imtToggleChecklist แล้ว ไม่ต้องมีปุ่มซ้ำ) กรณีไม่มี Checklist เลย ปุ่มนี้จะไปอยู่ที่ท้าย modal แทน ──
      var markDoneInChecklist = (canEdit && t.status !== 'done' && ck.length > 1)
        ? '<button class="btn btn-teal btn-sm" onclick="window.imtMarkDone(\''+id+'\')">✅ Mark as Done</button>'
        : '';
      // ── จัดชิดซ้ายด้วยกันทั้งคู่ (ไม่ใช้ .sec-head แบบ space-between ที่จะดันปุ่มไปสุดขวาแถวซึ่งกว้างเท่า modal) ──
      checklistHtml = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><div class="sec-label" style="margin-bottom:0;">เช็คลิสต์ ('+ckDone+'/'+ck.length+')</div>'+markDoneInChecklist+'</div>'
        + (ck.length ? '<div style="margin-bottom:10px;">'+pbarHtml(ckPct, 'var(--teal)')+'</div>' : '')
        + ckRows
        + (canEdit ? '<div style="display:flex;gap:8px;margin-top:10px;"><input class="f-input" id="imt-t-ck-input" placeholder="พิมพ์รายการแล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.imtAddChecklistItem(\''+id+'\');}"><button class="btn btn-sec btn-sm" onclick="window.imtAddChecklistItem(\''+id+'\')">+ เพิ่ม</button></div>' : '');

      var comments = imtCommentsOf(id);
      commentHtml = '<div class="sec-label" style="margin-bottom:8px;">ความคิดเห็น</div>'
        + comments.map(function (c) { return '<div class="imt-comment"><div class="imt-comment-head"><b>'+esc(c.author)+'</b><span>'+fd(c.createdAt)+'</span></div>'+esc(c.text)+'</div>'; }).join('')
        + '<div style="display:flex;gap:8px;margin-top:10px;"><input class="f-input" id="imt-t-comment-input" placeholder="เขียนความคิดเห็น..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.imtAddComment(\''+id+'\');}"><button class="btn btn-sec btn-sm" onclick="window.imtAddComment(\''+id+'\')">ส่ง</button></div>';

      var atts = imtAttachmentsOf(id);
      attachHtml = '<div class="sec-label" style="margin-bottom:8px;">ไฟล์แนบ</div>'
        + atts.map(function (a) { return '<div class="m-row"><a href="'+esc(a.fileUrl)+'" target="_blank" download="'+esc(a.fileName)+'" style="flex:1;color:var(--indigo);">📎 '+esc(a.fileName)+'</a><button class="m-x" onclick="window.imtDeleteAttachmentUI(\''+a.id+'\')">✕</button></div>'; }).join('')
        + (canEdit ? '<input type="file" id="imt-t-file-input" style="margin-top:8px;" onchange="window.imtHandleFileInput(\''+id+'\',this)">' : '');
    }

    document.getElementById('m-imt-task-body').innerHTML = formHtml
      + (id ? '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">' + checklistHtml
             + '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">' + commentHtml
             + '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">' + attachHtml
        : '');

    var foot = document.getElementById('m-imt-task-foot');
    // ปุ่ม "ลบ" ไว้ซ้ายมือสุด แยกจากปุ่มบันทึก/Mark as Done ทางขวา — margin-right:auto ดันปุ่มอื่น
    // ที่ตามมาไปชิดขวาตาม justify-content:flex-end ปกติของ .m-foot กันกดลบพลาดเวลาจะกดบันทึก
    // ── ปุ่ม "✅ Mark as Done" อยู่ตรงนี้เฉพาะกรณีไม่มี Checklist เลย (ck ยังไม่ถูกกำหนดถ้า !id จึงเช็ค id
    // ก่อนเสมอ) — ถ้ามี Checklist ปุ่มจะย้ายไปอยู่ที่หัวข้อ "เช็คลิสต์" แทน (ดูตอนสร้าง checklistHtml) ──
    foot.innerHTML = (id && window.canDel(window.IMPL_MODULE) ? '<button class="btn btn-red" style="margin-right:auto;" onclick="window.askDel(\'imt_task\',\''+id+'\',\''+esc(t.name)+'\')">ลบ</button>' : '')
      + (id && canEdit && t.status !== 'done' && (!ck || !ck.length) ? '<button class="btn btn-teal" onclick="window.imtMarkDone(\''+id+'\')">✅ Mark as Done</button>' : '')
      + (canEdit ? '<button class="btn btn-pri" onclick="window.saveImtTask(\''+(phaseId||(t.phaseId||''))+'\')">💾 บันทึก</button>' : '');
    window.openM('m-imt-task');
    if (canEdit) window._initImtStaffCombobox && window._initImtStaffCombobox(imtProjectTeamStaff(window.imtCurrentProjectId), t.ownerId);
  };

  window.imtSetTaskStatusField = function (statusId) {
    var sel = document.getElementById('imt-t-status');
    if (!sel) return;
    var st = imtStatus(statusId);
    sel.style.backgroundColor = st.color + '22';
    sel.style.color = st.color;
    sel.style.borderColor = st.color + '55';
  };

  window.saveImtTask = async function (phaseId) {
    var id = window.imtEditTaskId;
    var isNew = !id;
    var name = document.getElementById('imt-t-name').value.trim();
    if (!name) { window.showAlert && window.showAlert('กรุณาระบุชื่องาน', 'error'); return; }
    var phaseSelectEl = document.getElementById('imt-t-phase');
    var finalPhaseId = phaseSelectEl ? phaseSelectEl.value : phaseId;
    if (!finalPhaseId) { window.showAlert && window.showAlert('กรุณาเพิ่ม Phase ก่อนสร้างงาน', 'error'); return; }
    var pid = window.imtCurrentProjectId;
    if (isNew) id = window.imtUid('ITK');
    var oldStatus = isNew ? null : imtTask(id).status;
    var newStatus = document.getElementById('imt-t-status').value;
    var row = {
      phase_id: finalPhaseId, project_id: pid, task_name: name,
      description: document.getElementById('imt-t-desc').value.trim(),
      owner: document.getElementById('imt-t-owner').value, // รหัสพนักงาน
      start_date: document.getElementById('imt-t-start').value || null,
      due_date: document.getElementById('imt-t-due').value || null,
      priority: document.getElementById('imt-t-priority').value,
      status: newStatus,
      sort_order: isNew ? (imtTasksOfPhase(finalPhaseId).length + 1) : imtTask(id).order,
      updated_at: new Date().toISOString(),
    };
    window.closeM('m-imt-task');
    window.imtApplyLocal('IMPL_TASKS', id, row);
    await window.setDoc(window.getDocRef('IMPL_TASKS', id), row);
    // ย้ายสถานะเป็น "เสร็จแล้ว" → ติ๊ก Checklist ที่เหลือให้ครบอัตโนมัติ (ไม่ต้องไล่ติ๊กเองทีละอัน)
    // เช็คเฉพาะตอน "เพิ่งเปลี่ยน" มาเป็น done เท่านั้น (oldStatus !== 'done') ไม่งั้นถ้า Task เป็น done
    // อยู่แล้ว แล้วผู้ใช้ติ๊กออกบาง Checklist ในหน้านี้เอง กด "บันทึก" ซ้ำจะไปบังคับติ๊กกลับให้ครบทุกครั้ง ──
    if (newStatus === 'done' && oldStatus !== 'done') {
      var undoneItems = imtChecklistOf(id).filter(function (c) { return !c.done; });
      for (var ci = 0; ci < undoneItems.length; ci++) await window.imtToggleChecklist(undoneItems[ci].id, true);
    }
    if (isNew) window.imtLogActivity(pid, 'task', id, 'create', 'สร้างงาน '+name);
    else if (oldStatus !== newStatus) window.imtLogActivity(pid, 'task', id, 'status_change', 'เปลี่ยนสถานะ "'+name+'" เป็น '+imtStatus(newStatus).label);
    else window.imtLogActivity(pid, 'task', id, 'update', 'แก้ไขงาน '+name);
    window.renderImplTracker();
  };

  window.imtMarkDone = async function (id) {
    var t = imtTask(id); if (!t) return;
    var ck = imtChecklistOf(id);
    var ops = ck.filter(function (c) { return !c.done; });
    for (var i = 0; i < ops.length; i++) await window.imtToggleChecklist(ops[i].id, true);
    var nowIso = new Date().toISOString();
    window.imtApplyLocal('IMPL_TASKS', id, imtTaskRow(t, { status:'done', updated_at:nowIso }));
    await window.updateDoc(window.getDocRef('IMPL_TASKS', id), { status:'done', updated_at:nowIso });
    window.imtLogActivity(t.projectId, 'task', id, 'status_change', 'ทำเครื่องหมาย "'+t.name+'" เสร็จแล้ว');
    window.closeM('m-imt-task');
    window.renderImplTracker();
  };

  // ── Checklist ──
  window.imtToggleChecklist = async function (ckId, forceDone) {
    var c = window.IMPL_CHECKLIST_ITEMS.find(function (x) { return x.id === ckId; });
    if (!c) return;
    var done = forceDone !== undefined ? forceDone : !c.done;
    var actor = window.meId(); // รหัสผู้ใช้ (users.id)
    var row = { task_id:c.taskId, checklist_name:c.name, is_done:done, done_date: done ? window.todayStr() : null, done_by: done ? actor : '', remark:c.remark, sort_order:c.order };
    window.imtApplyLocal('IMPL_CHECKLIST_ITEMS', ckId, row);
    await window.setDoc(window.getDocRef('IMPL_CHECKLIST_ITEMS', ckId), row);
    var t = imtTask(c.taskId);
    if (t) window.imtLogActivity(t.projectId, 'checklist', ckId, 'update', (done?'✓ ทำเสร็จ: ':'☐ ยกเลิกทำ: ')+c.name);
    // ── Task ที่มี Checklist แค่ 1 รายการ: ติ๊กเสร็จ = งานเสร็จเลย เปลี่ยนสถานะเป็น "เสร็จแล้ว" อัตโนมัติ
    // ทำเฉพาะตอนติ๊ก "เข้า" เท่านั้น (ไม่ทำตอนติ๊กออก กันไปบังคับดึงสถานะกลับโดยที่ผู้ใช้ไม่ได้สั่ง) ──
    if (t && done && imtChecklistOf(t.id).length === 1 && t.status !== 'done') {
      var taskDoneIso = new Date().toISOString();
      window.imtApplyLocal('IMPL_TASKS', t.id, imtTaskRow(t, { status:'done', updated_at:taskDoneIso }));
      await window.updateDoc(window.getDocRef('IMPL_TASKS', t.id), { status:'done', updated_at:taskDoneIso });
      window.imtLogActivity(t.projectId, 'task', t.id, 'status_change', 'เปลี่ยนสถานะ "'+t.name+'" เป็น '+imtStatus('done').label);
    }
    if (document.getElementById('m-imt-task').classList.contains('on')) window.openImtTaskModal(window.imtEditTaskId, window.imtEditPhaseId);
    window.renderImplTracker();
  };

  window.imtAddChecklistItem = async function (taskId) {
    var input = document.getElementById('imt-t-ck-input');
    var name = input ? input.value.trim() : '';
    if (!name) { if (input) input.focus(); return; }
    var id = window.imtUid('ICK');
    var order = imtChecklistOf(taskId).length + 1;
    var row = { task_id:taskId, checklist_name:name, is_done:false, sort_order:order };
    window.imtApplyLocal('IMPL_CHECKLIST_ITEMS', id, row);
    await window.setDoc(window.getDocRef('IMPL_CHECKLIST_ITEMS', id), row);
    window.openImtTaskModal(taskId, window.imtEditPhaseId);
    var newInput = document.getElementById('imt-t-ck-input');
    if (newInput) newInput.focus();
    window.renderImplTracker();
  };

  window.imtRemoveChecklistItem = async function (ckId) {
    window.imtRemoveLocal('IMPL_CHECKLIST_ITEMS', ckId);
    await window.deleteDoc(window.getDocRef('IMPL_CHECKLIST_ITEMS', ckId));
    window.openImtTaskModal(window.imtEditTaskId, window.imtEditPhaseId);
    window.renderImplTracker();
  };

  // ── Comment ──
  window.imtAddComment = async function (taskId) {
    var input = document.getElementById('imt-t-comment-input');
    var text = input.value.trim();
    if (!text) return;
    var id = window.imtUid('ICM');
    var author = window.meId(); // รหัสผู้ใช้ (users.id)
    var row = { task_id:taskId, author:author, comment_text:text };
    window.imtApplyLocal('IMPL_COMMENTS', id, row);
    await window.setDoc(window.getDocRef('IMPL_COMMENTS', id), row);
    var t = imtTask(taskId);
    if (t) window.imtLogActivity(t.projectId, 'comment', id, 'comment', author+' แสดงความคิดเห็นในงาน "'+t.name+'"');
    window.openImtTaskModal(taskId, window.imtEditPhaseId);
  };

  // ── Attachment ──
  window.imtHandleFileInput = async function (taskId, inputEl) {
    var file = inputEl.files[0];
    if (!file) return;
    try {
      await window.imtUploadAttachment(taskId, file);
      var t = imtTask(taskId);
      if (t) window.imtLogActivity(t.projectId, 'attachment', taskId, 'attach', 'แนบไฟล์ '+file.name);
      window.openImtTaskModal(taskId, window.imtEditPhaseId);
    } catch (e) { window.showDbError(e); }
  };

  window.imtDeleteAttachmentUI = async function (attId) {
    await window.imtDeleteAttachment(attId);
    window.openImtTaskModal(window.imtEditTaskId, window.imtEditPhaseId);
  };

  // ================================================================
  // TASK BOARD — Drag & Drop handlers (ใช้ร่วมกับ renderTaskKanbanView ด้านบน)
  // ================================================================
  window.imtDrag = function (ev, taskId) { window.imtDragTaskId = taskId; };
  window.imtDrop = async function (ev, statusId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('imt-col-drop');
    var taskId = window.imtDragTaskId;
    var t = imtTask(taskId);
    if (!t || !window.canEdit(window.IMPL_MODULE)) return;
    var oldStatus = t.status;
    var dropIso = new Date().toISOString();
    window.imtApplyLocal('IMPL_TASKS', taskId, imtTaskRow(t, { status:statusId, updated_at:dropIso }));
    window.renderImplTracker();
    await window.updateDoc(window.getDocRef('IMPL_TASKS', taskId), { status:statusId, updated_at:dropIso }).catch(window.showDbError);
    if (oldStatus !== statusId) window.imtLogActivity(t.projectId, 'task', taskId, 'status_change', 'ลาก "'+t.name+'" ไปที่ '+imtStatus(statusId).label);
  };

  // ================================================================
  // CALENDAR (Month Grid ตาม Due Date)
  // ================================================================
  window.imtCalNav = function (dir) {
    window.imtCalM += dir;
    if (window.imtCalM < 0) { window.imtCalM = 11; window.imtCalY--; }
    if (window.imtCalM > 11) { window.imtCalM = 0; window.imtCalY++; }
    window.renderImplTracker();
  };

  window.renderImtCalendar = function () { renderImtCalendar(document.getElementById('imt-content')); };
  // ================================================================
  // ปัญหา (Issue Log) — สรุปปัญหาการใช้งานโปรแกรมรายโครงการ ที่ รพ. แจ้งเข้ามาหลังติดตั้ง/ระหว่างใช้งานจริง
  // คนละบริบทกับ Helpdesk (ticket ลูกค้าเรียลไทม์มี SLA) — ผูกกับ IMPL_PROJECTS โดยตรง
  // เพื่อทดแทน Google Sheet แยกไฟล์ต่อโครงการเดิม + ดูภาพรวมข้ามโครงการได้ใน Dashboard (renderImtDashboard)
  // ================================================================
  window.imtSetIssueFilter = function (key, val) {
    window.imtIssueFilter = window.imtIssueFilter || {};
    window.imtIssueFilter[key] = val;
    window.renderImplTracker();
  };

  function imtFilteredIssues(pid) {
    var f = window.imtIssueFilter || {};
    return imtIssuesOfProject(pid).filter(function (i) {
      if (f.status && i.status !== f.status) return false;
      if (f.category && i.category !== f.category) return false;
      if (f.q) {
        var q = f.q.toLowerCase();
        if ((i.department + ' ' + i.reportedBy + ' ' + i.problem).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  // ── กลุ่มปัญหา: ใช้ "หมวดปัญหา" ชุดเดียวกับที่ Admin ตั้งค่าไว้ใน Helpdesk (window.HELPDESK_CATEGORIES)
  // แทนรายการคงที่แยกต่างหาก กันไม่ให้มี taxonomy ปัญหาซ้ำซ้อนสองชุดในระบบ — เก็บเป็นชื่อ (text) ไม่ใช่ id
  // เหมือนเดิม (ไม่ผูก FK ข้ามโมดูล ตาราง impl_issues ยังคงแยกอิสระจาก helpdesk_tickets) ──
  function imtIssueCategories() {
    return (window.HELPDESK_CATEGORIES || []).filter(function (c) { return c.active !== false; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (c) { return c.name; });
  }

  // ── รายชื่อหน่วยงาน/แผนกที่เคยแจ้งไว้แล้วในโครงการนี้ — ดึงจากข้อมูลปัญหาที่บันทึกจริง ไม่ต้องมี
  // รายการตายตัวให้ Admin มาคอยเพิ่ม/ดูแลแยกต่างหาก (ยิ่งมีคนแจ้งมากขึ้น ตัวเลือกก็ยิ่งครบขึ้นเอง) ──
  function imtIssueDepartments(pid) {
    var seen = {}, out = [];
    imtIssuesOfProject(pid).forEach(function (i) {
      var d = (i.department || '').trim();
      if (d && !seen[d]) { seen[d] = true; out.push(d); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'th'); });
  }

  function renderImtIssues(mount) {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) { mount.innerHTML = projectPicker(); return; }

    var all = imtIssuesOfProject(pid);
    var openN = all.filter(function (i) { return i.status === 'open'; }).length;
    var progN = all.filter(function (i) { return i.status === 'in_progress'; }).length;
    var doneN = all.filter(function (i) { return i.status === 'closed'; }).length;

    // ── ปุ่ม action อยู่ท้ายแถวแท็บของโครงการ (imtSetPtabExtra) ไม่มีแถวหัวแยก ──
    var header = '<div class="imt-ws-actions">'
      +     '<button class="btn btn-xls btn-sm" onclick="window.exportImtIssuesExcel()" title="ส่งออก Excel">📥<span class="btn-label"> Excel</span></button>'
      +     '<button class="btn btn-ghost btn-sm" onclick="window.openImtIssuePrintModal()" title="พิมพ์รายงานสรุปให้ รพ. เซ็นรับทราบ">🖨️<span class="btn-label"> พิมพ์รายงาน</span></button>'
      +     '<button class="btn btn-ghost btn-sm" onclick="window.imtOpenPublicDashboard()" title="เปิด/คัดลอกลิงก์ Dashboard สาธารณะของ รพ. นี้ ไม่ต้อง login — ใช้นำเสนอตอนสรุปงานได้">🖼️<span class="btn-label"> Dashboard</span></button>'
      +     (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-ghost btn-sm" onclick="window.openImtBulkModal()" title="วางแชท LINE หรือเปิดไฟล์บันทึกแชท (.txt) / บันทึกประชุม ให้ AI แยกเป็นปัญหาหลายข้อในครั้งเดียว">🤖<span class="btn-label"> วางแชท LINE (AI)</span></button>' : '')
      +     (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-pri btn-sm" onclick="window.openImtIssueModal(null)">+<span class="btn-label"> แจ้งปัญหาใหม่</span></button>' : '')
      + '</div>';

    var f = window.imtIssueFilter || {};
    var catOpts = ['<option value="">ทุกกลุ่มปัญหา</option>'].concat(imtIssueCategories().map(function (c) {
      return '<option value="'+esc(c)+'"'+(f.category===c?' selected':'')+'>'+esc(c)+'</option>';
    })).join('');
    var filterBar = '<div class="imt-ws-filterbar imt-issue-filterbar">'
      + '<div class="t-search"><input placeholder="ค้นหาปัญหา/หน่วยงาน..." value="'+esc(f.q||'')+'" oninput="window.imtSetIssueFilter(\'q\',this.value)"></div>'
      // ── ตัวกรองสถานะ = ชิปพร้อมจำนวน (แทน select "ทุกสถานะ") · กดชิป = กรองสถานะนั้น
      // มือถือเหลือไอคอน+ตัวเลข (ซ่อน .lbl — มี title บอกชื่อเต็ม) ──
      + '<div class="imt-iss-stats">' + [['', '🗂️', 'ทั้งหมด', all.length, 'var(--indigo)'], ['open', '🔴', 'รอดำเนินการ', openN, 'var(--coral)'],
          ['in_progress', '🔵', 'กำลังดำเนินการ', progN, 'var(--indigo)'], ['closed', '✅', 'ดำเนินการแล้ว', doneN, 'var(--teal)']].map(function (c) {
          return '<button type="button" class="imt-iss-chip' + ((f.status || '') === c[0] ? ' on' : '') + '" style="--c:' + c[4] + '" title="' + c[2] + '"'
            + ' onclick="window.imtSetIssueFilter(\'status\',\'' + c[0] + '\')">' + c[1] + '<span class="lbl"> ' + c[2] + '</span> <b>' + c[3] + '</b></button>';
        }).join('') + '</div>'
      + '<select class="t-sel" onchange="window.imtSetIssueFilter(\'category\',this.value)">'+catOpts+'</select>'
      + '<button class="btn btn-ghost btn-sm imt-iss-ai" onclick="window.openImtFixerBlogModal()" title="ให้ AI สรุปว่าผู้แก้ไขแต่ละคนแก้ปัญหาอะไรไปบ้าง ในรูปแบบบทความ Blog">✍️ AI สรุปผู้แก้ไข</button>'
      + '</div>';

    var rows = imtFilteredIssues(pid);
    // ── รายการปัญหาแบบการ์ด (แทนตาราง 10 คอลัมน์ที่อ่านยากและไม่เห็นวิธีแก้) — ใช้เลย์เอาต์เดียวกันทั้งคอม/มือถือ
    // หัวการ์ด: ลำดับ · สถานะ · กลุ่มปัญหา · วันที่รับ | เนื้อหา: ❓ ปัญหา แล้ว 💡 วิธีการแก้ไข (เรียงบน-ล่างทุกขนาดจอ)
    // | ท้ายการ์ด: หน่วยงาน · ผู้แจ้ง · ผู้รับ · ผู้แก้ไข+วันที่ (ชื่อไม่มีคำนำหน้า ให้สั้น) ──
    var nm = function (ref) { return window.nameKey(window.staffNameByRef(ref)); };
    var cardsHtml = rows.map(function (i, idx) {
      var st = imtIssueStatus(i.status);
      var meta = [
        i.department ? '🏥 ' + esc(i.department) : '',
        i.reportedBy ? '👤 ผู้แจ้ง ' + esc(i.reportedBy) : '',
        i.receivedById ? '📥 รับโดย ' + esc(nm(i.receivedById)) : '',
        i.fixedById ? '🔧 แก้โดย ' + esc(nm(i.fixedById)) + (i.fixedDate ? ' · ' + fd(i.fixedDate) : '') : '',
      ].filter(Boolean).map(function (x) { return '<span>' + x + '</span>'; }).join('');
      return '<div class="imt-iss-card" onclick="window.openImtIssueModal(\''+i.id+'\')">'
        + '<div class="imt-iss-head"><span class="imt-iss-no">#' + (idx + 1) + '</span>' + statusTag(st)
        +   (i.category ? '<span class="imt-iss-cat">' + esc(i.category) + '</span>' : '')
        +   '<span class="imt-iss-date">📅 ' + fd(i.createdAt) + '</span></div>'
        + '<div class="imt-iss-body">'
        +   '<div class="imt-iss-box prob"><div class="imt-iss-lbl">❓ ปัญหา</div><div class="imt-iss-txt clamp">' + esc(i.problem || '-') + '</div>'
        +     '<button type="button" class="imt-iss-more" onclick="event.stopPropagation();window.imtIssMore(this)">ดูเพิ่มเติม ▾</button></div>'
        +   '<div class="imt-iss-box sol' + (i.solution ? '' : ' empty') + '"><div class="imt-iss-lbl">💡 วิธีการแก้ไข</div><div class="imt-iss-txt">' + (i.solution ? esc(i.solution) : 'ยังไม่ได้บันทึกวิธีแก้') + '</div></div>'
        + '</div>'
        + (meta ? '<div class="imt-iss-meta">' + meta + '</div>' : '')
        + '</div>';
    }).join('') || '<div class="imt-iss-empty">' + (all.length ? 'ไม่มีปัญหาที่ตรงตัวกรอง' : 'ยังไม่มีปัญหาที่บันทึกไว้ในโครงการนี้') + '</div>';

    window.imtSetPtabExtra(header);
    mount.innerHTML = filterBar
      + '<div class="imt-ws-scroll imt-iss-list" style="padding:0 24px 24px;overflow-y:auto;flex:1;">'+cardsHtml+'</div>'
      + '<div class="imt-print-only" id="imt-issue-print-doc"></div>';
    imtIssFitMore(mount);
  }

  // ── "❓ ปัญหา" แสดงแค่ 2 บรรทัด (ไล่ดูรายการได้เร็ว) · ปุ่ม "ดูเพิ่มเติม" โชว์เฉพาะข้อความที่ถูกตัดจริง ──
  function imtIssFitMore(root) {
    root.querySelectorAll('.imt-iss-txt.clamp').forEach(function (t) {
      var btn = t.nextElementSibling;
      // เกินจริงอย่างน้อยครึ่งบรรทัด (สระบน/วรรณยุกต์ไทยทำให้สูงเกินกล่องไม่กี่ px แม้ข้อความพอดี 2 บรรทัด)
      var half = (parseFloat(getComputedStyle(t).lineHeight) || 20) / 2;
      if (btn && t.scrollHeight - t.clientHeight < half) btn.style.display = 'none';
    });
  }
  window.imtIssMore = function (btn) {
    var t = btn.previousElementSibling, open = t.classList.toggle('open');
    btn.textContent = open ? 'ย่อ ▴' : 'ดูเพิ่มเติม ▾';
  }

  // ── กรอก "ผู้แก้ไข" + "วันที่แก้ไขปัญหา" ครบทั้งคู่ = ถือว่าจบงานแล้ว เปลี่ยนสถานะเป็น "ดำเนินการแล้ว"
  // (closed) ให้อัตโนมัติทันทีที่กรอกครบ กันลืมไปเปลี่ยนสถานะเองแยกต่างหาก — saveImtIssue() มีการเช็คซ้ำ
  // อีกชั้นตอนบันทึกด้วย เผื่อ event ไม่ทันทำงาน ──
  window.imtCheckIssueAutoClose = function () {
    var fixedByEl = document.getElementById('imt-is-fixed-by'), fixedDateEl = document.getElementById('imt-is-fixed-date'), statusEl = document.getElementById('imt-is-status');
    if (!fixedByEl || !fixedDateEl || !statusEl) return;
    if (fixedByEl.value.trim() && fixedDateEl.value) statusEl.value = 'closed';
  };

  // ── AI แนะนำกลุ่มปัญหา + วิธีแก้ — อ้างอิงปัญหาเก่าที่คล้ายกัน (มีวิธีแก้บันทึกไว้แล้ว) จากทุกโครงการ
  // ให้น้ำหนักโครงการประเภทเดียวกันมากกว่า · แสดงผลเป็นคำแนะนำ มีปุ่ม "ใช้ค่านี้" ให้คนตัดสินใจเองเสมอ ──
  var _imtAiLast = null;
  function imtProjectTypeId(pid) { var sp = imtResolveSourceProject(imtProject(pid)); return sp ? sp.typeId : ''; }
  // ค้นจากคลังความรู้กลาง (ai-knowledge.js — ชุดเดียวกับ Helpdesk/AI ตอบอัตโนมัติ) · โครงการประเภทเดียวกันได้คะแนนเพิ่ม
  // คืน { found (ผลค้นเต็ม ใช้ทำ prompt), similar: [{ problem, solution, category, from }] (แสดงในการ์ด) }
  async function imtAiSimilarIssues(text, pid, excludeId) {
    var myType = imtProjectTypeId(pid), typeCache = {};
    var found = await window.aiKnowledgeSearch(text, {
      excludeIssueId: excludeId, top: 5,
      boost: function (e) {
        if (e.type !== 'impl' || !myType) return 0;
        if (!(e.projectId in typeCache)) typeCache[e.projectId] = imtProjectTypeId(e.projectId);
        return typeCache[e.projectId] === myType ? 0.08 : 0;
      },
    });
    var similar = found.knowledge.map(function (e) {
      var cat = e.type === 'ticket' ? ((window.HELPDESK_CATEGORIES || []).find(function (c) { return c.id === e.category; }) || {}).name : e.category;
      var from = e.type === 'impl' ? (imtProject(e.projectId) || {}).name || e.source : e.type === 'ticket' ? 'ศูนย์ช่วยเหลือ ' + e.ref : e.source;
      return { problem: e.problem, solution: e.fix, category: cat || '', from: from };
    });
    return { found: found, similar: similar };
  }
  window.imtAiSuggestIssue = async function (btn) {
    var out = document.getElementById('imt-is-ai-out');
    var problem = ((document.getElementById('imt-is-problem') || {}).value || '').trim();
    if (!out) return;
    if (!problem) { window.showAlert && window.showAlert('กรอกรายละเอียดปัญหาก่อน', 'warn'); return; }
    var oldTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังวิเคราะห์...'; }
    out.innerHTML = '<div style="font-size:12px;color:var(--txt3);padding:6px 0;">⏳ กำลังวิเคราะห์...</div>';
    try {
      var pid = window.imtCurrentProjectId;
      var cats = imtIssueCategories();
      var kb = await imtAiSimilarIssues(problem, pid, window.imtEditIssueId), sim = kb.similar;
      var proj = imtProject(pid);
      var user = 'กลุ่มปัญหาที่เลือกได้ (ตอบชื่อให้ตรงตัวอักษร):\n' + cats.map(function (c) { return '- ' + c; }).join('\n')
        + '\n\nโครงการ: ' + ((proj && proj.name) || '-')
        + '\nแผนกที่แจ้ง: ' + (((document.getElementById('imt-is-dept') || {}).value || '').trim() || '-')
        + '\nรายละเอียดปัญหา: ' + problem.slice(0, 1500)
        + '\n\n' + window.aiKnowledge.promptBlock(kb.found, { internal: true });
      var res = await window.aiChatJson(
        'คุณเป็นผู้ช่วยทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล วิเคราะห์ปัญหาการใช้งานที่ รพ. แจ้ง แล้วตอบ "เฉพาะ JSON" รูปแบบ: '
        + '{"category":"<ชื่อกลุ่มปัญหาจากรายการ หรือ empty ถ้าไม่แน่ใจ>","solution_hint":"<แนวทางแก้ไขภาษาไทย 1–4 ประโยค>",'
        + '"problem_std":"<รายละเอียดปัญหาที่เรียบเรียงใหม่ให้เป็นมาตรฐาน>",'
        + '"confidence":"low|medium|high","reason":"<เหตุผลสั้น ๆ>"} · ถ้ามีปัญหาเก่าที่คล้ายกัน ให้อิงวิธีแก้เหล่านั้นเป็นหลัก'
        + ' · problem_std: เรียบเรียงรายละเอียดปัญหาเดิมเป็นภาษาไทยทางการ กระชับ ชัดเจน 1–3 ประโยค ขึ้นต้นด้วยระบบ/เมนูที่พบปัญหา (ถ้ารู้)'
        + ' ตามด้วยอาการที่พบ และผลกระทบ (ถ้ามีในข้อมูล) — คงข้อเท็จจริง ชื่อเมนู ตัวเลข รหัส ไว้ครบ ห้ามเพิ่มข้อมูลที่ไม่มีในต้นฉบับ'
        + ' ห้ามใส่วิธีแก้ ห้ามใช้คำลงท้าย/คำสุภาพแบบแชท (ครับ ค่ะ คะ นะ)',
        user, { maxTokens: 900 });
      _imtAiLast = {
        category: cats.indexOf(res.category) > -1 ? res.category : '',
        solution: String(res.solution_hint || '').trim(),
        problemStd: String(res.problem_std || '').trim(),
        confidence: res.confidence || '', reason: String(res.reason || '').trim(), similar: sim,
      };
      imtAiAutoFill(_imtAiLast);
      out.innerHTML = imtAiChoicesHtml(_imtAiLast) + imtAiCardHtml(_imtAiLast);
    } catch (e) {
      out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
    }
  };
  // ── ข้อเสนอที่ต้องให้คนเลือก "ใช้ (แทนที่ทั้งหมด) / ไม่ใช้" — แสดงนอกการ์ดย่อ เห็นทันทีไม่ต้องกดขยาย ──
  // รายละเอียดปัญหาแบบมาตรฐาน: เสนอเสมอถ้าต่างจากเดิม · วิธีแก้ไข: เฉพาะตอนช่องมีข้อความอยู่แล้ว (ช่องว่างเติมให้เลย)
  var IMT_AI_CHOICE = {
    problem:  { field: 'imt-is-problem',  key: 'problemStd', label: '📝 AI เรียบเรียงรายละเอียดปัญหาให้เป็นมาตรฐาน' },
    solution: { field: 'imt-is-solution', key: 'solution',   label: '💡 AI แนะนำวิธีการแก้ไข (ช่องนี้มีข้อความอยู่แล้ว)' },
  };
  function imtAiChoicesHtml(s) {
    return (s.pending || []).map(function (k) {
      var c = IMT_AI_CHOICE[k];
      return '<div class="imt-ai-choice" data-k="' + k + '">'
        + '<div class="imt-ai-choice-l">' + c.label + '</div>'
        + '<div class="imt-ai-choice-t">' + esc(s[c.key]) + '</div>'
        + '<div class="imt-ai-choice-b">'
        +   '<button type="button" class="btn btn-pri btn-sm" onclick="window.imtAiChoose(\'' + k + '\',true)">✓ ใช้ข้อความนี้ (แทนที่ทั้งหมด)</button>'
        +   '<button type="button" class="btn btn-ghost btn-sm" onclick="window.imtAiChoose(\'' + k + '\',false)">ไม่ใช้</button>'
        + '</div></div>';
    }).join('');
  }
  window.imtAiChoose = function (k, use) {
    var s = _imtAiLast, c = IMT_AI_CHOICE[k];
    var box = document.querySelector('#imt-is-ai-out .imt-ai-choice[data-k="' + k + '"]');
    if (!s || !c) return;
    s.pending = (s.pending || []).filter(function (x) { return x !== k; });
    var el = document.getElementById(c.field);
    if (use && el) { el.value = s[c.key]; imtMarkInvalid(el, false); window.aiFlagField(el, true); }
    if (box) box.outerHTML = '<div class="imt-ai-choice-done">' + (use ? '✓ ใช้ข้อความจาก AI แทนที่แล้ว' : 'ไม่ใช้ — คงข้อความเดิมไว้') + ' · ' + c.label.replace(/^\S+\s/, '') + '</div>';
  };
  function imtAiCardHtml(s) {
    var conf = { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' }[s.confidence] || s.confidence || '-';
    var hasSolutionBox = !!document.getElementById('imt-is-solution');
    var filled = '<span class="ai-use" style="color:var(--teal);font-size:11.5px;font-weight:700;">✓ เติมให้แล้ว</span>';
    var solFilled = s.solution && hasSolutionBox && (s.pending || []).indexOf('solution') < 0;
    // แบบย่อ 1 บรรทัด (กลุ่มปัญหา) กด "ดูเพิ่มเติม" เพื่อดูแนวทางแก้/ปัญหาเก่าที่คล้ายกัน
    var filledAny = s.category || solFilled;
    return window.aiSuggestHtml({
      title: 'AI',
      summary: (s.category ? 'กลุ่ม: ' + esc(s.category) : '<span style="color:var(--txt3);">ไม่แน่ใจกลุ่มปัญหา</span>')
        + (s.solution ? ' · มีแนวทางแก้' : '') + (filledAny ? ' <span style="color:var(--teal);">✓ เติมให้แล้ว</span>' : ''),
      actions: s.solution && !hasSolutionBox ? '<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;" onclick="window.imtAiCopyHint()">คัดลอกแนวทางแก้</button>' : '',
      body: '<div style="color:var(--txt3);font-size:11px;margin:4px 0;">ความมั่นใจ ' + esc(conf) + (s.similar.length ? ' · อ้างอิงปัญหาเก่า ' + s.similar.length + ' รายการ' : '') + '</div>'
      + '<div class="ai-row"><span>กลุ่มปัญหา: <b>' + esc(s.category || '— AI ไม่แน่ใจ —') + '</b></span>'
      +   (s.category ? filled : '') + '</div>'
      + (s.solution ? '<div class="ai-row" style="align-items:flex-start;"><span>แนวทางแก้ไข: ' + esc(s.solution) + '</span>'
      // แจ้งปัญหาใหม่ยังไม่มีช่อง "วิธีการแก้ไข" → คงปุ่มคัดลอกไว้ให้
      +   (hasSolutionBox ? (solFilled ? filled : '') : '<button type="button" class="btn btn-ghost btn-sm ai-use" onclick="window.imtAiCopyHint()">คัดลอก</button>') + '</div>' : '')
      + (s.similar.length ? '<details style="font-size:11.5px;margin-top:4px;"><summary style="cursor:pointer;color:var(--txt2);">ปัญหาเก่าที่คล้ายกัน</summary>'
      +   s.similar.map(function (x) {
            return '<div style="padding:4px 0;border-bottom:1px dashed var(--border);"><b>' + esc(String(x.problem).slice(0, 120)) + '</b>'
              + '<div style="color:var(--txt3);">' + esc(x.from) + ' · วิธีแก้: ' + esc(String(x.solution).slice(0, 200)) + '</div></div>';
          }).join('') + '</details>' : '')
      + (s.reason ? '<div style="font-size:11px;color:var(--txt3);margin-top:4px;">เหตุผล: ' + esc(s.reason) + '</div>' : '')
      + '<div style="font-size:10.5px;color:var(--txt3);margin-top:4px;">* AI ช่วยแนะนำเท่านั้น ตรวจสอบก่อนใช้เสมอ</div>',
    });
  }
  // ── เติมกลุ่มปัญหาจากผล AI ให้ทันที พร้อมป้ายสีแดงว่ามาจาก AI · วิธีแก้ไข: ช่องว่าง = ใส่ให้เลย,
  // มีข้อความอยู่แล้ว = ให้เลือกใช้ (แทนที่ทั้งหมด) หรือไม่ · รายละเอียดปัญหาแบบมาตรฐาน = ให้เลือกเสมอ
  // (s.pending = รายการที่รอให้เลือก ดู imtAiChoicesHtml) · แจ้งปัญหาใหม่ไม่มีช่องวิธีแก้ไข ──
  function imtAiAutoFill(s) {
    s.pending = [];
    var c = document.getElementById('imt-is-cat');
    if (c && s.category) { c.value = s.category; imtMarkInvalid(c, false); window.aiFlagField(c, c.value === s.category); }
    var pr = document.getElementById('imt-is-problem');
    if (pr && s.problemStd && s.problemStd !== pr.value.trim()) s.pending.push('problem');
    var ta = document.getElementById('imt-is-solution');
    if (ta && s.solution) {
      if (!ta.value.trim()) { ta.value = s.solution; window.aiFlagField(ta, true); }
      else if (ta.value.trim() !== s.solution) s.pending.push('solution');
    }
  }
  window.imtAiCopyHint = function () {
    var s = _imtAiLast; if (!s || !s.solution || !navigator.clipboard) return;
    navigator.clipboard.writeText(s.solution).then(function () { window.showAlert && window.showAlert('คัดลอกแนวทางแก้ไขแล้ว', 'success'); });
  };

  // ── วางแชท LINE (ไฟล์ .txt / ข้อความ) / บันทึกประชุม → AI แยกเป็นปัญหาการใช้งานหลายข้อ ──
  // อ่านแชท/เลือกช่วงวันที่ และขั้นตรวจทาน ใช้ตัวกลางใน src/utils/chat-import.util.js (lineChat / aiReview)
  // ส่วนนี้กำหนดเฉพาะของโครงการ: ค่าเริ่มต้นผู้แจ้ง/หน่วยงาน/ผู้รับปัญหา, คำสั่ง AI, ช่องของปัญหา และการบันทึก ──
  function imtBkVal(id) { return ((document.getElementById(id) || {}).value || '').trim(); }
  // ── ตัวเลือก "ผู้รับปัญหา" จากรายชื่อในระบบ: ทีมโครงการก่อน แล้วพนักงานอื่นแยกกลุ่มตามแผนก (เรียงระดับตำแหน่ง) · ค่า = รหัสพนักงาน
  // ค่าเดิมที่ไม่อยู่ในรายชื่อ (พนักงานที่ปิดใช้งาน/ถูกลบ) แทรกไว้บนสุดให้ยังเลือกค้างได้ ──
  function imtReceiverOptions(pid, cur) {
    var team = imtProjectTeamStaff(pid), inTeam = {};
    team.forEach(function (s) { inTeam[s.id] = true; });
    var others = (window.STAFF || []).filter(function (s) { return s.active !== false && s.name && !inTeam[s.id]; });
    var opt = function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.name) + (s.nickname ? ' (' + esc(s.nickname) + ')' : '') + '</option>'; };
    var known = team.concat(others).some(function (s) { return s.id === cur; });
    return (cur && !known ? '<option value="' + esc(cur) + '" selected>' + esc(window.staffNameByRef(cur) || '(พนักงานที่ถูกลบ)') + '</option>' : '')
      + (cur ? '' : '<option value="">-- เลือกผู้รับปัญหา --</option>')
      + (team.length ? '<optgroup label="ทีมโครงการ">' + team.slice().sort(window.sortStaffByRank).map(opt).join('') + '</optgroup>' : '')
      + window.staffOptionsGrouped(others, cur, true);
  }
  window.openImtBulkModal = function () {
    var pid = window.imtCurrentProjectId, proj = imtProject(pid);
    if (!proj) return;
    var curStaffId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
    var deptOpts = imtIssueDepartments(pid).map(function (d) { return '<option value="' + esc(d) + '">'; }).join('');
    document.getElementById('m-imt-bulk-body').innerHTML =
      '<div id="imtbk-step1">'
      + '<div style="font-size:12.5px;margin-bottom:8px;">โครงการ: <b>' + esc(proj.name) + '</b></div>'
      + window.lineChat.panelHtml('imtbk')
      + '<div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;">'
      +   '<div class="f-group"><label class="f-label">ผู้แจ้ง (ถ้าแชทไม่ระบุ)</label><input class="f-input" id="imt-bk-rep" placeholder="ชื่อผู้แจ้ง"></div>'
      +   '<div class="f-group"><label class="f-label">หน่วยงาน (ถ้าแชทไม่ระบุ)</label><input class="f-input" id="imt-bk-dept" list="imt-bk-dept-dl" placeholder="เช่น ห้องจ่ายยา IPD"><datalist id="imt-bk-dept-dl">' + deptOpts + '</datalist></div>'
      +   '<div class="f-group"><label class="f-label">ผู้รับปัญหา <span class="imt-req">*</span></label><select class="f-input" id="imt-bk-recv">' + imtReceiverOptions(pid, curStaffId) + '</select></div>'
      + '</div>'
      + '<button type="button" class="btn btn-ghost btn-sm" onclick="window.imtBulkParse(this)">🤖 ให้ AI แยกปัญหา</button>'
      + '<div id="imtbk-out" style="margin-top:12px;"></div>'
      + '</div>'
      + '<div id="imtbk-step2" class="air-step2" style="display:none;"><div id="imtbk-review"></div></div>';
    window.aiReview.reset('m-imt-bulk', 'm-imt-bulk-foot');
    window.openM('m-imt-bulk');
    window.lineChat.bind('imtbk', {});
    setTimeout(function () { var el = document.getElementById('imtbk-src'); if (el) el.focus(); }, 60);
  };
  window.imtBulkParse = async function (btn) {
    var out = document.getElementById('imtbk-out');
    var c = window.lineChat.collect('imtbk');
    if (c.error) { window.showAlert && window.showAlert(c.error, 'warn'); return; }
    var pid = window.imtCurrentProjectId, cats = imtIssueCategories(), depts = imtIssueDepartments(pid);
    var team = imtProjectTeamStaff(pid);
    var sys = 'คุณเป็นผู้ช่วยทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล อ่านข้อความที่วางมา (แชท LINE / บันทึกประชุม / รายการปัญหา) '
      + 'แล้วแยกเป็น "ปัญหาการใช้งานโปรแกรม" ทีละข้อ ' + (c.numbered ? 'แต่ละบรรทัดขึ้นต้นด้วยเลขข้อความ (#) ' : '')
      + 'ตอบ "เฉพาะ JSON" รูปแบบ: {"items":[{"problem":"<สรุปปัญหาให้ชัด 1–2 ประโยค ภาษาไทย>","department":"<หน่วยงาน/แผนกที่แจ้ง หรือ empty>",'
      + '"reported_by":"<ชื่อผู้แจ้ง หรือ empty>","category":"<ชื่อกลุ่มปัญหาจากรายการ หรือ empty>",'
      + '"solved":true|false,"solution":"<วิธีแก้ ถ้าข้อความบอกว่าแก้แล้ว หรือ empty>","handled_by":"<ชื่อทีมงานที่แก้เรื่องนี้ หรือ empty>"'
      + (c.numbered ? ',"first_msg":<เลขข้อความที่เริ่มแจ้ง>,"last_msg":<เลขข้อความสุดท้ายของเรื่องนี้>,"msgs":[<เลขข้อความที่เกี่ยวกับเรื่องนี้โดยตรงเท่านั้น — แจ้ง/ถาม-ตอบ/ส่งข้อมูล/ยืนยันว่าแก้แล้ว ไม่รวมทักทาย/ขอบคุณ/สติกเกอร์/เรื่องอื่นที่คุยแทรก>]' : '') + '}]} '
      + 'กฎ: ข้อความทักทาย/ขอบคุณ/สติกเกอร์/รูป/นัดหมาย/คุยเรื่องอื่นที่ไม่ใช่ปัญหา ให้ข้าม · ปัญหาเดียวกันที่พูดซ้ำหลายข้อความ ให้รวมเป็นข้อเดียว · '
      + 'ผู้แจ้งคือฝั่งโรงพยาบาล ไม่ใช่คนในรายชื่อทีมงาน · ห้ามแต่งข้อมูลที่ไม่มีในข้อความ · หน่วยงานให้ใช้ชื่อจากรายการที่มีอยู่ถ้าตรงกัน';
    var ctx = 'กลุ่มปัญหาที่เลือกได้ (ตอบชื่อให้ตรงตัวอักษร):\n' + cats.map(function (x) { return '- ' + x; }).join('\n')
      + (depts.length ? '\n\nหน่วยงานที่เคยแจ้งในโครงการนี้:\n' + depts.slice(0, 60).join(', ') : '')
      + (team.length ? '\n\nรายชื่อทีมงานของเรา (ไม่ใช่ผู้แจ้ง):\n' + team.map(function (x) { return x.name + (x.nickname ? ' (' + x.nickname + ')' : ''); }).join(', ') : '');
    var oldTxt = btn.textContent, raw = [];
    btn.disabled = true;
    out.innerHTML = '';
    try {
      for (var k = 0; k < c.chunks.length; k++) {
        btn.textContent = '⏳ AI กำลังแยกปัญหา' + (c.chunks.length > 1 ? ' ส่วนที่ ' + (k + 1) + '/' + c.chunks.length : '') + '...';
        var res = await window.aiChatJson(sys, ctx + '\n\n--- ข้อความ ---\n' + c.chunks[k], { maxTokens: 3500 });
        (Array.isArray(res.items) ? res.items : []).forEach(function (x) { raw.push(x); });
      }
      var existing = imtIssuesOfProject(pid), items = [];
      raw.forEach(function (x) {
        var problem = String(x.problem || '').trim(), solution = String(x.solution || '').trim();
        if (!problem) return;
        var ex = window.lineChat.excerpt(c.msgs, x.first_msg, x.last_msg, x.msgs), closed = x.solved === true && !!solution;
        var fixer = closed ? window.lineChat.matchPerson(x.handled_by, team) : null;
        var it = {
          problem: problem,
          department: String(x.department || '').trim(),
          reportedBy: String(x.reported_by || '').trim(),
          category: cats.indexOf(x.category) > -1 ? x.category : '',
          status: closed ? 'closed' : 'open',
          solution: solution,
          fixedBy: fixer ? fixer.id : '', // รหัสพนักงาน
          fixedDate: closed ? String(ex.endAt || '').slice(0, 10) : '',
          createdAt: ex.createdAt, whenLabel: ex.whenLabel, chat: ex.chat, dup: '',
        };
        // ซ้ำกับปัญหาเดิมของโครงการ หรือซ้ำกับข้อก่อนหน้าในรอบนี้ (ก้อนแชทคาบเกี่ยว)
        var dup = null, best = 0;
        existing.forEach(function (e) { var sc = window.aiTextSim(problem, e.problem); if (sc > best) { best = sc; dup = e; } });
        if (best >= 0.6) it.dup = 'อาจซ้ำกับปัญหาเดิม: ' + String(dup.problem).slice(0, 60);
        else if (items.some(function (y) { return window.aiTextSim(problem, y.problem) >= 0.7; })) it.dup = 'อาจซ้ำกับข้อก่อนหน้าในรายการนี้';
        items.push(it);
      });
      if (!items.length) { out.innerHTML = '<div style="font-size:12px;color:var(--txt3);">AI ไม่พบปัญหาในข้อความนี้</div>'; return; }
      imtBulkReview(items);
    } catch (e) {
      out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
    } finally {
      btn.disabled = false; btn.textContent = oldTxt;
    }
  };
  // ── ขั้นตรวจทาน: กำหนดช่องของปัญหาให้ aiReview ──
  function imtBulkReview(items) {
    var pid = window.imtCurrentProjectId, proj = imtProject(pid);
    var stOf = function (id) { return window.IMPL_ISSUE_STATUS.find(function (x) { return x.id === id; }) || window.IMPL_ISSUE_STATUS[0]; };
    window.aiReview.mount({
      modalId: 'm-imt-bulk', step1Id: 'imtbk-step1', step2Id: 'imtbk-step2', reviewId: 'imtbk-review', footId: 'm-imt-bulk-foot',
      items: items, unit: 'รายการ',
      ctxHtml: function () {
        var recv = window.staffNameByRef(imtBkVal('imt-bk-recv'));
        return '📁 <b>' + esc(proj ? proj.name : '') + '</b> · ผู้รับปัญหา: ' + (recv ? esc(recv) : '<span style="color:var(--coral);">ยังไม่ระบุ</span>');
      },
      title: function (x) { return x.problem; },
      card: function (x) {
        var st = stOf(x.status);
        return {
          done: x.status === 'closed',
          status: '<span class="air-st" style="color:' + st.color + ';">' + st.icon + ' ' + esc(st.label) + '</span>',
          chips: [
            ['🏢', 'หน่วยงาน', x.department || imtBkVal('imt-bk-dept')],
            ['👤', 'ผู้แจ้ง', x.reportedBy || imtBkVal('imt-bk-rep')],
            ['🗂', 'กลุ่มปัญหา', x.category],
          ].concat(x.status === 'closed' ? [['🔧', 'ผู้แก้ไข', window.staffNameByRef(x.fixedBy)]] : []),
          note: x.status === 'closed' && String(x.solution || '').trim() ? '<div class="air-fix"><b>วิธีแก้:</b> ' + esc(x.solution) + '</div>' : '',
        };
      },
      missing: function (x) {
        var m = [];
        if (!String(x.problem || '').trim()) m.push('รายละเอียดปัญหา');
        if (!String(x.department || '').trim() && !imtBkVal('imt-bk-dept')) m.push('หน่วยงาน');
        if (!String(x.reportedBy || '').trim() && !imtBkVal('imt-bk-rep')) m.push('ผู้แจ้ง');
        if (!x.category) m.push('กลุ่มปัญหา');
        return m;
      },
      filters: [['open', '🔴 ยังไม่แก้', function (x) { return x.status !== 'closed'; }], ['done', '✅ แก้แล้ว', function (x) { return x.status === 'closed'; }]],
      statusKey: 'status',
      statuses: window.IMPL_ISSUE_STATUS.map(function (x) { return { v: x.id, label: x.icon + ' ' + x.label, cls: x.id === 'closed' ? 'done' : x.id === 'open' ? 'open' : '' }; }),
      fields: function (x, i, h) {
        var team = imtProjectTeamStaff(pid);
        var defDept = imtBkVal('imt-bk-dept'), defRep = imtBkVal('imt-bk-rep');
        return h.fld('รายละเอียดปัญหา', '<textarea class="f-input' + h.bad('รายละเอียดปัญหา') + '" rows="3"' + h.txt('problem', 1) + '>' + esc(x.problem) + '</textarea>', 1)
          + '<div class="air-grid">'
          +   h.fld('หน่วยงาน', '<input class="f-input' + h.bad('หน่วยงาน') + '" list="imt-bk-dept-dl" value="' + esc(x.department) + '" placeholder="' + esc(defDept ? 'ค่าเริ่มต้น: ' + defDept : 'หน่วยงาน') + '"' + h.txt('department') + '>', 1)
          +   h.fld('ผู้แจ้ง', '<input class="f-input' + h.bad('ผู้แจ้ง') + '" value="' + esc(x.reportedBy) + '" placeholder="' + esc(defRep ? 'ค่าเริ่มต้น: ' + defRep : 'ชื่อผู้แจ้ง') + '"' + h.txt('reportedBy') + '>', 1)
          +   h.fld('กลุ่มปัญหา', '<select class="f-input' + h.bad('กลุ่มปัญหา') + '"' + h.pick('category') + '>' + h.opt('', '-- เลือก --', !x.category) + imtIssueCategories().map(function (c) { return h.opt(c, c, c === x.category); }).join('') + '</select>', 1)
          + '</div>'
          + (x.status === 'closed'
            ? h.fld('วิธีการแก้ไข', '<textarea class="f-input" rows="2"' + h.txt('solution') + '>' + esc(x.solution) + '</textarea>')
              + '<div class="air-grid">'
              +   h.fld('ผู้แก้ไข', '<select class="f-input"' + h.pick('fixedBy') + '>' + h.opt('', '— ไม่ระบุ —', !x.fixedBy) + team.map(function (s) { var nk = s.nickname || s.name; return h.opt(s.id, s.name + ' (' + nk + ')', s.id === x.fixedBy); }).join('') + '</select>')
              +   h.fld('วันที่แก้ไขปัญหา', '<input type="date" class="f-input" value="' + esc(x.fixedDate) + '"' + h.pick('fixedDate') + '>')
              + '</div>'
            : '');
      },
      beforeSave: function () {
        if (imtBkVal('imt-bk-recv')) return true;
        window.showAlert && window.showAlert('กรุณาระบุผู้รับปัญหาก่อน', 'warn'); // ช่องอยู่ขั้นที่ 1 — พากลับไปกรอก
        window.aiReview.back();
        var el = document.getElementById('imt-bk-recv'); imtMarkInvalid(el, true); if (el) el.focus();
        return false;
      },
      saveOne: function (x) {
        var closed = x.status === 'closed';
        return window.imtAddIssue({
          projectId: pid, problem: String(x.problem).trim(),
          department: String(x.department || '').trim() || imtBkVal('imt-bk-dept'),
          reportedBy: String(x.reportedBy || '').trim() || imtBkVal('imt-bk-rep'),
          category: x.category, status: x.status, solution: String(x.solution || '').trim(),
          receivedById: imtBkVal('imt-bk-recv'), receivedDate: x.createdAt || '',
          fixedById: closed ? x.fixedBy : '', fixedDate: closed ? x.fixedDate : '',
        });
      },
      onDone: function (made) {
        window.imtLogActivity(pid, 'issue', '', 'create', 'แยกปัญหาจากแชท/ข้อความด้วย AI ' + made + ' รายการ');
        window.closeM('m-imt-bulk');
        window.showAlert && window.showAlert('บันทึกปัญหา ' + made + ' รายการแล้ว', 'success');
        window.renderImplTracker();
      },
      onFail: function (made) {
        if (made) window.imtLogActivity(pid, 'issue', '', 'create', 'แยกปัญหาจากแชท/ข้อความด้วย AI ' + made + ' รายการ');
        window.renderImplTracker();
      },
    });
  }

  // ── แจ้งปัญหาใหม่: สลับแสดงส่วน "การแก้ไข" ตามสถานะ — "ดำเนินการแล้ว" = ใส่เข้า DOM (วันที่แก้ = วันนี้ ถ้ายังว่าง)
  // สถานะอื่น = เอาออกจาก DOM ทั้งก้อน (saveImtIssue/AI ถือว่าไม่มีช่องนี้) แต่จำค่าที่พิมพ์ไว้ เผื่อสลับกลับมา ──
  var _imtResolutionHtml = '';
  var _imtResolutionStash = null;
  window.imtToggleIssueResolution = function () {
    var wrap = document.getElementById('imt-is-res-wrap'), statusEl = document.getElementById('imt-is-status');
    if (!wrap || !statusEl) return;
    var sol = document.getElementById('imt-is-solution');
    if (statusEl.value !== 'closed') {
      if (sol) {
        _imtResolutionStash = { solution: sol.value, fixedBy: document.getElementById('imt-is-fixed-by').value, fixedDate: document.getElementById('imt-is-fixed-date').value };
        wrap.innerHTML = '';
      }
      return;
    }
    if (sol) return;
    wrap.innerHTML = _imtResolutionHtml;
    var st = _imtResolutionStash;
    if (st) {
      document.getElementById('imt-is-solution').value = st.solution;
      document.getElementById('imt-is-fixed-by').value = st.fixedBy;
    }
    var fdEl = document.getElementById('imt-is-fixed-date');
    var now = new Date(); // วันที่ตามเวลาเครื่อง (toISOString เป็น UTC — ก่อน 7 โมงเช้าจะได้วันก่อนหน้า)
    fdEl.value = (st && st.fixedDate) || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
    setTimeout(function () { var el = document.getElementById('imt-is-solution'); if (el) el.focus(); }, 30);
  };

  // ── Add/Edit Modal ──
  window.openImtIssueModal = function (id) {
    _imtResolutionStash = null;
    window.imtEditIssueId = id;
    var pid = window.imtCurrentProjectId;
    var cats = imtIssueCategories();
    var curStaffId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
    var i = id ? imtIssue(id) : { department:'', reportedBy:'', problem:'', category:'', status:'open', solution:'', receivedById:curStaffId, fixedById:'', fixedDate:'', createdAt:new Date().toISOString() };
    var catOpts = '<option value="">--ระบุกลุ่มปัญหา--</option>' + cats.map(function (c) { return '<option value="'+esc(c)+'"'+(i.category===c?' selected':'')+'>'+esc(c)+'</option>'; }).join('');
    var stOpts = window.IMPL_ISSUE_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(i.status===s.id?' selected':'')+'>'+s.icon+' '+esc(s.label)+'</option>'; }).join('');
    // ── "ผู้แก้ไข" เลือกจากทีมงานของโครงการนี้ (imtProjectTeamStaff — แหล่งเดียวกับ "ผู้รับผิดชอบ" ในแท็บ "งาน")
    // ค่าที่เลือก = รหัสพนักงาน ──
    var teamStaff = imtProjectTeamStaff(pid);
    var curTeamMember = teamStaff.find(function (s) { return s.id === curStaffId; });
    // ยังไม่มีใครแก้จริง (fixedById ว่าง) → เดาให้เป็นคน Login เอง (ถ้าอยู่ในทีมโครงการนี้) กดบันทึกได้เลยไม่ต้องเลือกเอง
    var defaultFixedBy = i.fixedById || (curTeamMember ? curTeamMember.id : '');
    // ผู้แก้ไขเดิมที่ไม่อยู่ในทีมโครงการแล้ว — แทรกตัวเลือกไว้ ไม่งั้น <select> ตกไปที่ "— ไม่ระบุ —" ดูเหมือนข้อมูลหาย
    var extraFixedByOpt = '';
    if (defaultFixedBy && !teamStaff.some(function (s) { return s.id === defaultFixedBy; })) {
      var extraLabel = (window.staffNameByRef(defaultFixedBy) || '(พนักงานที่ถูกลบ)') + ' (ไม่อยู่ในทีมโครงการนี้)';
      extraFixedByOpt = '<option value="' + esc(defaultFixedBy) + '" selected>' + esc(extraLabel) + '</option>';
    }
    var fixedByOpts = ['<option value="">— ไม่ระบุ —</option>', extraFixedByOpt].concat(teamStaff.map(function (s) {
      var nick = s.nickname || s.name;
      return { id:s.id, label:s.name+' ('+nick+')' };
    }).sort(function (a, b) { return a.label.localeCompare(b.label, 'th'); }).map(function (o) {
      return '<option value="'+esc(o.id)+'"'+(defaultFixedBy===o.id?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');
    // ครั้งแรก (แจ้งปัญหาใหม่) แสดงแค่ข้อมูลรับแจ้ง — ส่วน "การแก้ไข" (วิธีแก้/ผู้แก้ไข/วันที่แก้)
    // ยังไม่มีข้อมูลจริง เลยซ่อนไว้ก่อน ยกเว้นเลือกสถานะ "ดำเนินการแล้ว" (แก้จบตั้งแต่ตอนแจ้ง) ให้แสดงทันที
    // (ดู imtToggleIssueResolution) — ตอนกดแก้ไขปัญหาที่บันทึกไว้แล้วแสดงเสมอ และเน้นให้เด่น
    // เพราะตอนกดแก้ไขส่วนใหญ่ก็เพื่อมาลงรายละเอียดตรงนี้เป็นหลัก ──
    _imtResolutionHtml =
      '<div style="border:1.5px solid var(--violet);background:rgba(124,92,252,.06);border-radius:10px;margin-top:14px;padding:12px 14px;">'
        + '<div class="f-label" style="font-weight:700;color:var(--violet);margin-bottom:2px;">🔧 การแก้ไข</div>'
        + '<div class="f-group"><label class="f-label">วิธีการแก้ไข</label><textarea class="f-input" id="imt-is-solution" rows="4" placeholder="พิมพ์รายละเอียดการแก้ไขที่นี่...">'+esc(i.solution)+'</textarea></div>'
        + '<div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        +   '<div class="f-group"><label class="f-label">ผู้แก้ไข</label><select class="f-input" id="imt-is-fixed-by" onchange="window.imtCheckIssueAutoClose()">'+fixedByOpts+'</select></div>'
        +   '<div class="f-group"><label class="f-label">วันที่แก้ไขปัญหา</label><input type="date" class="f-input" id="imt-is-fixed-date" value="'+esc(i.fixedDate||'')+'" onchange="window.imtCheckIssueAutoClose()"></div>'
        + '</div>'
      + '</div>';
    var resolutionSection = '<div id="imt-is-res-wrap">' + (id || i.status === 'closed' ? _imtResolutionHtml : '') + '</div>';
    // หน่วยงาน/แผนกที่แจ้ง — แนะนำจากชื่อที่เคยพิมพ์ไว้แล้วในโครงการนี้ผ่าน <datalist> ของเบราว์เซอร์เอง
    // (พิมพ์ค้นแล้วเลือกได้ หรือจะพิมพ์ชื่อใหม่ก็ยังทำได้ตามปกติ) ไม่ต้องมีรายการตายตัวให้ดูแลเพิ่ม
    var deptOpts = imtIssueDepartments(pid).map(function (d) { return '<option value="'+esc(d)+'">'; }).join('');
    var body = document.getElementById('m-imt-issue-body');
    body.innerHTML =
      '<div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +   '<div class="f-group"><label class="f-label">ผู้แจ้งปัญหา <span class="imt-req">*</span></label><input class="f-input" id="imt-is-reported-by" value="'+esc(i.reportedBy)+'" placeholder="ชื่อผู้แจ้ง"></div>'
      +   '<div class="f-group"><label class="f-label">หน่วยงาน/แผนกที่แจ้ง <span class="imt-req">*</span></label><input class="f-input" id="imt-is-dept" value="'+esc(i.department)+'" placeholder="เช่น ห้องจ่ายยา IPD" list="imt-dept-datalist"><datalist id="imt-dept-datalist">'+deptOpts+'</datalist></div>'
      + '</div>'
      + '<div class="f-group"><label class="f-label">รายละเอียดปัญหา <span class="imt-req">*</span></label><textarea class="f-input" id="imt-is-problem" rows="5">'+esc(i.problem)+'</textarea>'
      +   '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="window.imtAiSuggestIssue(this)">🤖 AI แนะนำกลุ่มปัญหา / วิธีแก้</button>'
      +   '<div id="imt-is-ai-out"></div></div>'
      + '<div class="imt-issue-row3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
      +   '<div class="f-group"><label class="f-label">กลุ่มปัญหา <span class="imt-req">*</span></label><select class="f-input" id="imt-is-cat">'+catOpts+'</select></div>'
      +   '<div class="f-group"><label class="f-label">สถานะ <span class="imt-req">*</span></label><select class="f-input" id="imt-is-status"' + (id ? '' : ' onchange="window.imtToggleIssueResolution()"') + '>'+stOpts+'</select></div>'
      +   '<div class="f-group"><label class="f-label">ผู้รับปัญหา <span class="imt-req">*</span></label><select class="f-input" id="imt-is-received-by">'+imtReceiverOptions(pid, i.receivedById)+'</select></div>'
      + '</div>'
      + resolutionSection;
    document.getElementById('m-imt-issue-title').textContent = id ? 'แก้ไขปัญหา' : 'แจ้งปัญหาใหม่';
    var dateLbl = document.getElementById('m-imt-issue-date');
    if (dateLbl) dateLbl.textContent = 'รับเมื่อ ' + fd(i.createdAt);
    var foot = document.getElementById('m-imt-issue-foot');
    foot.innerHTML = (id && window.canDel(window.IMPL_MODULE)
        ? '<button class="btn btn-ghost imt-ws-danger" onclick="window.closeM(\'m-imt-issue\');window.askDel(\'imt_issue\',\''+id+'\',\''+esc((i.problem||'').slice(0,40).replace(/'/g,''))+'\')">🗑️ ลบ</button>'
        : '')
      + '<div style="flex:1"></div>'
      + '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-issue\')">ยกเลิก</button>'
      + '<button class="btn btn-pri" onclick="window.saveImtIssue()">💾 บันทึก</button>';
    window.openM('m-imt-issue');
    // แก้ไขปัญหาที่มีอยู่แล้ว มักเปิดมาเพื่อลงรายละเอียดการแก้ไขเป็นหลัก — โฟกัสให้พิมพ์ได้เลย
    if (id) setTimeout(function () { var el = document.getElementById('imt-is-solution'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 60);
  };

  window.saveImtIssue = async function () {
    var id = window.imtEditIssueId;
    var isNew = !id;
    var reportedByEl = document.getElementById('imt-is-reported-by'), deptEl = document.getElementById('imt-is-dept');
    var problemEl = document.getElementById('imt-is-problem'), catEl = document.getElementById('imt-is-cat');
    var statusEl = document.getElementById('imt-is-status'), receivedByEl = document.getElementById('imt-is-received-by');
    var reportedBy = reportedByEl.value.trim(), department = deptEl.value.trim(), problem = problemEl.value.trim();
    var category = catEl.value, status = statusEl.value, receivedBy = receivedByEl.value.trim();

    var miss = [];
    [[reportedByEl, reportedBy], [deptEl, department], [problemEl, problem], [catEl, category], [statusEl, status], [receivedByEl, receivedBy]]
      .forEach(function (pair) { imtMarkInvalid(pair[0], !pair[1]); if (!pair[1]) miss.push(pair[0]); });
    if (miss.length) {
      window.showAlert && window.showAlert('กรุณากรอกข้อมูลที่จำเป็น (มี * สีแดง) ให้ครบ', 'error');
      if (miss[0] && miss[0].focus) miss[0].focus();
      return;
    }

    var pid = window.imtCurrentProjectId;
    // ส่วน "การแก้ไข" ไม่แสดงตอนแจ้งปัญหาใหม่ (ดู openImtIssueModal) — element เลยอาจไม่มีอยู่ใน DOM
    var solutionEl = document.getElementById('imt-is-solution');
    var fixedByEl = document.getElementById('imt-is-fixed-by');
    var fixedDateEl = document.getElementById('imt-is-fixed-date');
    // เช็คซ้ำอีกชั้นตอนบันทึก (ไม่พึ่ง onchange ของ UI อย่างเดียว) — กรอกผู้แก้ไข + วันที่แก้ไขครบ
    // ถือว่าจบงานแล้ว บังคับสถานะเป็น "ดำเนินการแล้ว" เสมอ ไม่ว่า dropdown จะเลือกไว้เป็นอะไรก็ตาม
    if (fixedByEl && fixedDateEl && fixedByEl.value.trim() && fixedDateEl.value) status = 'closed';
    var data = {
      projectId: pid,
      department: department,
      reportedBy: reportedBy,
      problem: problem,
      category: category,
      status: status,
      solution: solutionEl ? solutionEl.value.trim() : '',
      receivedById: receivedBy, // รหัสพนักงาน
      fixedById: fixedByEl ? fixedByEl.value : '',
      fixedDate: fixedDateEl ? fixedDateEl.value : '',
    };
    window.closeM('m-imt-issue');
    var savedId = id;
    if (isNew) savedId = await window.imtAddIssue(data);
    else await window.imtUpdateIssue(id, data);
    window.imtLogActivity(pid, 'issue', savedId || '', isNew ? 'create' : 'update', (isNew ? 'แจ้งปัญหาใหม่: ' : 'แก้ไขปัญหา: ') + problem.slice(0, 60));
    window.renderImplTracker();
  };

  // ── Export: Excel (ดิบทุกคอลัมน์ — เก็บ backup/audit) ──
  window.exportImtIssuesExcel = function () {
    var pid = window.imtCurrentProjectId;
    var rows = imtIssuesOfProject(pid).map(function (i) {
      return [fd(i.createdAt), i.reportedBy, i.department, i.problem, i.category, imtIssueStatus(i.status).label, i.solution, i.receivedBy, i.fixedBy, i.fixedDate ? fd(i.fixedDate) : ''];
    });
    var headers = ['วันที่รับ','ผู้แจ้ง','หน่วยงาน','ปัญหา','กลุ่มปัญหา','สถานะ','วิธีการแก้ไข','ผู้รับปัญหา','ผู้แก้ไข','วันที่แก้ไข'];
    _imtDoExport(headers, rows, 'ปัญหาโครงการ_' + (imtProject(pid) || {}).name);
  };

  // ── Export: รูปภาพเอกสารสรุป (letterhead + ตาราง + ช่องเซ็นชื่อ) — ให้พิมพ์/แนบส่งให้ รพ. เซ็นรับทราบ
  // ทำแบบเดียวกับ exportImtReportImage เดิม (html2canvas ของ .imt-print-only ที่ซ่อนไว้) ไม่เปิด browser
  // print dialog เพราะโมดูลนี้เคยตัดฟีเจอร์ Print/PDF ออกไปแล้ว (ดูคอมเมนต์หัว impl-tracker.css) ──
  // ── หัวข้อรายงานสรุปปัญหา (เลือกในหน้าต่างพิมพ์) · ค่าเริ่มต้นเดาจากชื่อโครงการ ──
  var IMT_ISSUE_PRINT_TITLES = [
    'ไฟล์สรุปปัญหาการใช้งานโปรแกรม BMS-INVENTORY',
    'ไฟล์สรุปปัญหาการใช้งานโปรแกรม BMS-HOSxP XE ระบบงานครุภัณฑ์',
    'ไฟล์สรุปปัญหาการใช้งานโปรแกรม BMS-HOSxP XE',
  ];
  function imtIssuePrintTitleDefault(proj) {
    var n = String((proj && proj.name) || '');
    return IMT_ISSUE_PRINT_TITLES[/inventory/i.test(n) ? 0 : /ครุภัณฑ์/.test(n) ? 1 : 2];
  }

  function imtIssuePrintDocHtml(pid, opts) {
    var proj = imtProject(pid);
    var rows = imtIssuesOfProject(pid).filter(function (i) {
      var d = (i.createdAt || '').slice(0, 10);
      if (opts.from && d < opts.from) return false;
      if (opts.to && d > opts.to) return false;
      return true;
    }).sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });

    var trs = rows.map(function (i, idx) {
      var st = imtIssueStatus(i.status);
      return '<tr>'
        + '<td class="n">'+(idx + 1)+'</td>'
        + '<td class="dt">'+fd(i.createdAt)+'</td>'
        + '<td>'+esc(i.department||'-')+'</td>'
        + '<td>'+esc(i.problem)+'</td>'
        + '<td>'+esc(i.category||'-')+'</td>'
        + '<td>'+esc(st.label)+'</td>'
        + '<td>'+esc(i.solution||'—')+'</td>'
        // ผู้รับปัญหา/ผู้แก้ไข: ชื่อ-นามสกุลไม่มีคำนำหน้า (nameKey ตัด นาย/นาง/นางสาว/น.ส.)
        + '<td>'+esc(window.nameKey(window.staffNameByRef(i.receivedById)) || '—')+'</td>'
        + '<td>'+esc(window.nameKey(window.staffNameByRef(i.fixedById)) || '—')+'</td>'
        + '<td class="dt">'+(i.fixedDate?fd(i.fixedDate):'—')+'</td>'
        + '</tr>';
    });
    if (!trs.length) trs = ['<tr><td colspan="10" style="text-align:center;color:#888;padding:16px;">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>'];

    // ── ช่องลงนามเป็นแถวสุดท้ายของตาราง รวมกลุ่มกับแถวข้อมูลแถวสุดท้าย (tbody.keep = ห้ามตัดหน้ากลางกลุ่ม)
    // → ไม่พอที่หน้าเดิม browser จะยกแถวสุดท้าย "พร้อม" ช่องลงนามไปหน้าใหม่ด้วยกัน ช่องลงนามไม่ตกไปอยู่หน้าเปล่าลำพัง
    // (เดิมอยู่นอกตาราง ตัดหน้าก่อนช่องลงนามได้อิสระ) ──
    var signRow = '<tr class="sign"><td colspan="10"><div class="imt-idoc-sign">'
      +   '<div class="imt-idoc-sb"><div class="imt-idoc-line"></div><div class="imt-idoc-nm">('+esc(opts.signLName||'')+')</div><div>ตำแหน่ง '+esc(opts.signLPos||'')+'</div><div>'+esc(opts.signLOrg||'')+'</div></div>'
      +   '<div class="imt-idoc-sb"><div class="imt-idoc-line"></div><div class="imt-idoc-nm">('+esc(opts.signRName||'')+')</div><div>ตำแหน่ง '+esc(opts.signRPos||'')+'</div><div>'+esc(opts.signROrg||'')+'</div></div>'
      + '</div></td></tr>';
    var bodyHtml = (trs.length > 1 ? '<tbody>' + trs.slice(0, -1).join('') + '</tbody>' : '')
      + '<tbody class="keep">' + trs[trs.length - 1] + signRow + '</tbody>';

    return '<div class="imt-idoc">'
      + '<div class="imt-idoc-head"><img class="imt-idoc-headerimg" src="img/BMS-Header.jpg" alt="บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด"></div>'
      + '<div class="imt-idoc-title">'+esc(opts.title || imtIssuePrintTitleDefault(proj))+'</div>'
      // ── กำหนดความกว้างคอลัมน์ตายตัวด้วย <colgroup> (คู่กับ table-layout:fixed ใน CSS) กัน 10 คอลัมน์
      // รวมกันกว้างเกินหน้ากระดาษ A4 แนวนอน — ไม่งั้นตัวอักษรใหญ่ขึ้น (14px) + ข้อความยาว (ปัญหา/วิธีแก้)
      // จะดันตารางกว้างล้นออกไปทางขวาจนถูกตัดตอนพิมพ์ ──
      + '<table class="imt-idoc-tbl">'
      +   '<colgroup><col style="width:4%"><col style="width:8%"><col style="width:9%"><col style="width:19%">'
      +   '<col style="width:8%"><col style="width:8%"><col style="width:19%"><col style="width:8%">'
      +   '<col style="width:8%"><col style="width:9%"></colgroup>'
      // ── แถวเว้นระยะ (.sp) ใน thead/tfoot — browser พิมพ์ thead/tfoot ซ้ำทุกหน้า จึงได้ระยะขอบบน/ล่างทุกแผ่น
      // (@page margin เป็น 0 กันหัว/ท้ายกระดาษของ browser · padding ของกล่องเอกสารมีผลแค่ต้นแผ่นแรก/ท้ายแผ่นสุดท้าย
      // แผ่นที่ 2 เป็นต้นไปเลยชิดขอบกระดาษ) ──
      +   '<thead><tr class="sp"><th colspan="10"></th></tr><tr>'
      +   '<th>ลำดับ</th><th>วันที่รับปัญหา</th><th>หน่วยงาน</th><th>ปัญหา</th><th>กลุ่มปัญหา</th><th>สถานะ</th>'
      +   '<th>วิธีการแก้ไข</th><th>ผู้รับปัญหา</th><th>ผู้แก้ไข</th><th>วันที่แก้ไขปัญหา</th>'
      + '</tr></thead><tfoot><tr class="sp"><td colspan="10"></td></tr></tfoot>' + bodyHtml + '</table>'
      + '</div>';
  }

  // ── หาตำแหน่ง+แผนก (STAFF.role + STAFF.dept ต่อกันเป็นชื่อตำแหน่งเดียว ไม่มีตัวคั่น เช่น "ผู้จัดการ
  // โครงการ"+"ติดตั้งระบบคลังสินค้า" → "ผู้จัดการโครงการติดตั้งระบบคลังสินค้า") จากชื่อพนักงาน — ใช้ทั้ง
  // ค่าเริ่มต้นตอนเปิด modal และตอนพิมพ์ชื่อใหม่เอง (รูปแบบเดียวกับ posDept ใน site-notice-form.js) ──
  // เทียบชื่อแบบไม่สนคำนำหน้า/ช่องว่าง (window.sameName) — "เจ้าของไซต์" เก่าเก็บแค่ชื่อ-นามสกุล
  function imtStaffPositionByName(name) {
    var s = (window.STAFF || []).find(function (x) { return window.sameName(x.name, name); });
    if (!s) return '';
    return (s.role || '') + (s.dept || '');
  }
  window.imtOnIssueSignLNameChange = function () {
    var nameEl = document.getElementById('iip-lname'), posEl = document.getElementById('iip-lpos');
    if (!nameEl || !posEl) return;
    var pos = imtStaffPositionByName(nameEl.value);
    if (pos) posEl.value = pos;
  };

  // ── ข้อความแสดงโรงพยาบาลของ combobox ผู้ลงนามฝั่ง รพ.: ชื่อ + จังหวัด (ไม่มีรหัสสถานพยาบาลปน) —
  // ใช้ร่วมกันทั้งตอน pre-select, ตอนเลือกจาก dropdown, และตอนพิมพ์เอกสารจริง ให้ตรงกันทุกจุด ──
  function imtHospDisplayText(h) {
    return h.name + (h.province ? ' จ.' + h.province : '');
  }

  // ── Searchable Combobox: เลือก "โรงพยาบาล" จาก window.HOSPITALS สำหรับช่อง "โรงพยาบาล/หน่วยงาน"
  // ของผู้ลงนามฝั่ง รพ. ตอนพิมพ์รายงาน (พิมพ์ค้นหาแบบเดียวกับ "โรงพยาบาล" ตอนแจ้งปัญหาใน Helpdesk —
  // ดู _initHdHospCombobox/hdHospComboMarkup ใน helpdesk.js — แต่เก็บ id คนละชุดเพราะคนละโมดัล/โมดัล
  // ไม่เปิดพร้อมกัน) ต่างจาก Helpdesk ตรงที่ยอมให้พิมพ์ชื่อหน่วยงานที่ไม่อยู่ในรายการ รพ. ได้ด้วย (ฟิลด์เดิม
  // เป็น "กรอกเอง" ล้วน ๆ อยู่แล้ว) — พิมพ์แก้ไขข้อความเองเมื่อไหร่ ตัด id ที่เคยเลือกไว้ทิ้งทันที กัน
  // printImtIssues() หยิบชื่อ รพ. เดิมไปพิมพ์ทั้งที่ผู้ใช้แก้ข้อความไปแล้ว ──
  window._initImtHospCombobox = (function () {
    var IH = 34;
    function hi(txt, q) {
      if (!q) return esc(txt);
      var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
      while (i < txt.length) {
        var x = lt.indexOf(lq, i);
        if (x < 0) { out += esc(txt.slice(i)); break; }
        out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
        i = x + lq.length;
      }
      return out;
    }
    return function (curId, curText) {
      var inp = document.getElementById('iip-hosp-cmb-input'), drop = document.getElementById('iip-hosp-cmb-drop'),
        lst = document.getElementById('iip-hosp-cmb-list'), hid = document.getElementById('iip-rhosp');
      if (!inp || !drop || !lst || !hid) return;
      var items = (window.HOSPITALS || []).slice()
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'th'); })
        .map(function (h) { var full = imtHospDisplayText(h); return { id: h.id, full: full, label: (h.code ? h.code + ' ' : '') + full }; });
      var selId = curId || '', q = '', fi = -1, flat = [], dt = null, isOpen = false;
      function bFlat(sq) {
        var f = [], lq = sq.toLowerCase();
        items.forEach(function (it) { if (!sq || it.label.toLowerCase().indexOf(lq) !== -1) f.push(it); });
        return f;
      }
      function render() {
        if (!flat.length) { lst.innerHTML = '<div style="padding:16px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบโรงพยาบาล — พิมพ์ชื่อหน่วยงานเองได้เลย</div>'; return; }
        lst.innerHTML = flat.map(function (it, idx) {
          var foc = idx === fi, isSel = it.id === selId;
          return '<div class="imthc-i" data-id="' + esc(it.id) + '" data-name="' + esc(it.full) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">'
            + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
            + hi(it.label, q) + '</div>';
        }).join('');
      }
      // ── ช่องนี้มักอยู่ท้ายฟอร์ม (ใกล้ขอบล่าง modal) — พื้นที่ด้านล่างเหลือน้อยจนรายการยาว ๆ (รพ. เป็น
      // ร้อยรายการ) ถูกบีบเตี้ยจนแทบเลือกไม่ได้ ถ้าเหลือที่ด้านบน input มากกว่า ให้เปิด dropdown ขึ้น
      // ด้านบนแทน (เหมือน native <select> ที่เบราว์เซอร์ทำให้อัตโนมัติ) ──
      function positionDrop() { window.placeDropdown(inp, drop, lst, 320); }
      function openDrop() { if (isOpen) return; isOpen = true; flat = bFlat(inp.value.trim()); fi = -1; lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
      function selItem(id, name, label) { selId = id; hid.value = id; inp.value = label; closeDrop(); }
      lst.addEventListener('click', function (e) { var it = e.target.closest('.imthc-i'); if (it) selItem(it.dataset.id, it.dataset.name, it.dataset.name); });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.imthc-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      // พิมพ์แก้เอง → ไม่ผูกกับ รพ. ที่เคยเลือกไว้แล้ว (เก็บแค่ข้อความดิบ ไม่มีรหัสปน)
      inp.addEventListener('input', function () { selId = ''; hid.value = ''; if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 150); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].id, flat[fi].name, flat[fi].name); }
      });
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('iip-hosp-cmb-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
      inp.value = curText || '';
    };
  })();

  // ── Markup ของ combobox "โรงพยาบาล/หน่วยงาน" (ผู้ลงนามฝั่ง รพ.) ──
  function imtHospComboMarkup(hiddenId, text) {
    return '<div id="iip-hosp-cmb-wrap" style="position:relative;">'
      +   '<input id="iip-hosp-cmb-input" type="text" class="f-input" placeholder="พิมพ์ค้นหาชื่อโรงพยาบาล หรือกรอกหน่วยงานเอง..." autocomplete="off" spellcheck="false" style="padding-right:28px;">'
      +   '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
      +   '<input type="hidden" id="iip-rhosp" value="'+esc(hiddenId||'')+'">'
      +   '<div id="iip-hosp-cmb-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
      +     '<div id="iip-hosp-cmb-list" style="max-height:260px;overflow-y:auto;"></div>'
      +   '</div>'
      + '</div>';
  }

  // ── Searchable Combobox: เลือก "ชื่อ-นามสกุล" ผู้ลงนามฝั่งบริษัท จากพนักงานทั้งบริษัท (window.STAFF —
  // ไม่จำกัดแค่ทีมงานโครงการนี้ เพราะเจ้าของไซต์อาจไม่ได้อยู่ในทีม task ของโครงการโดยตรง) ใช้ id ช่อง
  // #iip-lname เดิมตรง ๆ ไม่เปลี่ยน จึงไม่กระทบ imtOnIssueSignLNameChange()/printImtIssues() ที่อ่านค่า
  // จากช่องนี้อยู่แล้ว — พิมพ์ชื่อที่ไม่ตรงกับพนักงานคนไหนก็ยังได้เหมือนเดิม (ฟิลด์นี้เป็น "กรอกเอง" มาแต่แรก) ──
  window._initImtSignerCombobox = (function () {
    var IH = 40;
    function hi(txt, q) {
      if (!q) return esc(txt);
      var lt = txt.toLowerCase(), lq = q.toLowerCase(), out = '', i = 0;
      while (i < txt.length) {
        var x = lt.indexOf(lq, i);
        if (x < 0) { out += esc(txt.slice(i)); break; }
        out += esc(txt.slice(i, x)) + '<mark style="background:#ffd60a66;border-radius:2px;padding:0 1px;">' + esc(txt.slice(x, x + lq.length)) + '</mark>';
        i = x + lq.length;
      }
      return out;
    }
    return function () {
      var inp = document.getElementById('iip-lname'), drop = document.getElementById('iip-lname-drop'),
        lst = document.getElementById('iip-lname-list');
      if (!inp || !drop || !lst) return;
      var items = (window.STAFF || []).filter(function (s) { return s.active !== false; }).sort(window.sortStaffByDeptRank)
        .map(function (s) { return { name: s.name, sub: (s.role || '') + (s.role && s.dept ? ' · ' : '') + (s.dept || '') }; });
      var q = '', fi = -1, flat = [], dt = null, isOpen = false;
      function bFlat(sq) {
        var f = [], lq = sq.toLowerCase();
        items.forEach(function (it) { if (!sq || it.name.toLowerCase().indexOf(lq) !== -1) f.push(it); });
        return f;
      }
      function render() {
        if (!flat.length) { lst.innerHTML = '<div style="padding:16px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบชื่อพนักงาน — พิมพ์ชื่อเองได้เลย</div>'; return; }
        lst.innerHTML = flat.map(function (it, idx) {
          var foc = idx === fi, isSel = it.name === inp.value.trim();
          return '<div class="imtsg-i" data-name="' + esc(it.name) + '" data-idx="' + idx + '" style="min-height:' + IH + 'px;display:flex;flex-direction:column;justify-content:center;gap:1px;padding:5px 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:var(--txt1);">'
            + '<div>' + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;">✓</span>' : '') + hi(it.name, q) + '</div>'
            + (it.sub ? '<div style="font-size:10.5px;color:var(--txt3);">' + esc(it.sub) + '</div>' : '')
            + '</div>';
        }).join('');
      }
      function positionDrop() { window.placeDropdown(inp, drop, lst, 260); }
      function openDrop() { if (isOpen) return; isOpen = true; flat = bFlat(inp.value.trim()); fi = -1; lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
      function selItem(name) { inp.value = name; closeDrop(); window.imtOnIssueSignLNameChange(); }
      lst.addEventListener('click', function (e) { var it = e.target.closest('.imtsg-i'); if (it) selItem(it.dataset.name); });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.imtsg-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); lst.scrollTop = 0; render(); }, 150); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].name); }
      });
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('iip-lname-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target) && !drop.contains(e.target)) closeDrop(); });
    };
  })();

  window.openImtIssuePrintModal = function () {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) return;
    // ค่าที่กรอกล่าสุด (ช่วงวันที่/ผู้ลงนาม/หัวข้อ) จำแยกรายโครงการ — เปลี่ยนโครงการแล้วต้องได้วันเริ่ม-สิ้นสุดของโครงการใหม่
    // (เดิมจำค่าเดียวร่วมกันทุกโครงการ เปลี่ยนโครงการแล้วช่วงวันที่ยังค้างของโครงการก่อน)
    var o = (window.imtIssuePrintOpts || {})[pid] || {};
    // ── ผู้ลงนามฝั่งบริษัท: ดึงชื่อจาก "เจ้าของไซต์" ของโครงการต้นทาง (window.PROJECTS.siteOwner —
    // ฟิลด์เดียวกับที่ใช้ทั่วทั้งแอป ดู projects.js) + ตำแหน่งจากข้อมูลพนักงานตามชื่อนั้น ──
    var sp = imtResolveSourceProject(proj);
    var siteOwnerName = sp ? (sp.siteOwner || '') : '';
    // ── "โรงพยาบาล/หน่วยงาน" ฝั่งผู้ลงนาม รพ. — ถ้าเคยพิมพ์/เลือกไว้แล้วใช้ค่านั้น ไม่งั้นใช้ รพ. ของโครงการ (ถ้ามี) หรือปล่อยว่างให้พิมพ์
    // ค้นหาเอง ── ยังไม่เคยกรอก → ตั้งต้นจากโรงพยาบาลของโครงการ (เมนูโครงการ › 🏥 โรงพยาบาล)
    var srcHosp = sp && sp.hospitalId ? (window.HOSPITALS || []).find(function (h) { return h.id === sp.hospitalId; }) : null;
    var defOrgText = o.signROrg != null ? o.signROrg : (srcHosp ? imtHospDisplayText(srcHosp) : '');
    var defOrgHosp = (window.HOSPITALS || []).find(function (h) { return imtHospDisplayText(h) === defOrgText; });
    var body = document.getElementById('m-imt-issue-print-body');
    var curTitle = IMT_ISSUE_PRINT_TITLES.indexOf(o.title) > -1 ? o.title : imtIssuePrintTitleDefault(proj);
    body.innerHTML =
      '<div class="f-group"><label class="f-label">หัวข้อรายงาน <span class="imt-req">*</span></label><select class="f-input" id="iip-title">'
      +   IMT_ISSUE_PRINT_TITLES.map(function (t) { return '<option'+(t === curTitle ? ' selected' : '')+'>'+esc(t)+'</option>'; }).join('')
      + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +   '<div class="f-group"><label class="f-label">จากวันที่ <span class="imt-req">*</span></label><input type="date" class="f-input" id="iip-from" value="'+esc(o.from != null ? o.from : (proj.start||''))+'"></div>'
      +   '<div class="f-group"><label class="f-label">ถึงวันที่ <span class="imt-req">*</span></label><input type="date" class="f-input" id="iip-to" value="'+esc(o.to != null ? o.to : (proj.end||''))+'"></div>'
      + '</div>'
      + '<div class="sec-label" style="margin:14px 0 6px;">🏢 ผู้ลงนามฝั่งบริษัท (เจ้าของไซต์ของโครงการ)</div>'
      + '<div class="f-group"><label class="f-label">ชื่อ-นามสกุล <span class="imt-req">*</span></label><div id="iip-lname-wrap" style="position:relative;">'
      +   '<input class="f-input" id="iip-lname" autocomplete="off" spellcheck="false" oninput="window.imtOnIssueSignLNameChange()" value="'+esc(o.signLName != null ? o.signLName : siteOwnerName)+'">'
      +   '<div id="iip-lname-drop" style="display:none;z-index:9500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);overflow:hidden;">'
      +     '<div id="iip-lname-list" style="max-height:260px;overflow-y:auto;"></div>'
      +   '</div>'
      + '</div></div>'
      + '<div class="f-group"><label class="f-label">ตำแหน่ง <span class="imt-req">*</span></label><input class="f-input" id="iip-lpos" value="'+esc(o.signLPos != null ? o.signLPos : imtStaffPositionByName(o.signLName != null ? o.signLName : siteOwnerName))+'" placeholder="เช่น ผู้จัดการโครงการติดตั้งระบบ..."></div>'
      + '<div class="f-group"><label class="f-label">บริษัท <span class="imt-req">*</span></label><input class="f-input" id="iip-lorg" value="'+esc(o.signLOrg != null ? o.signLOrg : 'บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด')+'"></div>'
      + '<div class="sec-label" style="margin:14px 0 6px;">🏥 ผู้ลงนามฝั่งโรงพยาบาล</div>'
      + '<div class="f-group"><label class="f-label">ชื่อ-นามสกุล <span class="imt-req">*</span></label><input class="f-input" id="iip-rname" value="'+esc(o.signRName||'')+'"></div>'
      + '<div class="f-group"><label class="f-label">ตำแหน่ง <span class="imt-req">*</span></label><input class="f-input" id="iip-rpos" value="'+esc(o.signRPos||'')+'"></div>'
      + '<div class="f-group"><label class="f-label">โรงพยาบาล/หน่วยงาน <span class="imt-req">*</span></label>' + imtHospComboMarkup(defOrgHosp ? defOrgHosp.id : '', defOrgText) + '</div>';
    window.openM('m-imt-issue-print');
    window._initImtSignerCombobox();
    window._initImtHospCombobox(defOrgHosp ? defOrgHosp.id : '', defOrgText);
  };

  // ── Dashboard สาธารณะ (impl-dashboard.html) — ลิงก์ดูภาพรวมความคืบหน้า/ปัญหาของ รพ. นี้ ไม่ต้อง login
  // ใช้ token แบบเดียวกับ help.html?t=<token> (help.html ใช้ helpdesk_tickets.access_token) — ครั้งแรกที่กด
  // ยังไม่มี token จะ generate สุ่ม 40 ตัวอักษรแล้วบันทึกไว้ที่ project (ใช้ตลอดไป ไม่เปลี่ยนทุกครั้งที่กด)
  // แล้วคัดลอกลิงก์ + เปิดแท็บใหม่ให้เลย ให้กดปุ่มเดียวจบทั้งดู/คัดลอกไปนำเสนอ ──
  function imtToken40() {
    var s = '', ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 40; i++) s += ch.charAt(Math.floor(Math.random() * ch.length));
    return s;
  }
  window.imtOpenPublicDashboard = async function () {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) return;
    var token = proj.dashboardToken;
    if (!token) {
      token = imtToken40();
      var row = {
        project_name: proj.name, start_date: proj.start || null, end_date: proj.end || null,
        status: proj.status, progress_percent: proj.progress, template_id: proj.templateId,
        source_project_id: proj.sourceProjectId, dashboard_token: token, created_at: proj.createdAt,
      };
      window.imtApplyLocal('IMPL_PROJECTS', pid, row);
      try {
        await window.setDoc(window.getDocRef('IMPL_PROJECTS', pid), { dashboard_token: token }, { merge: true });
      } catch (e) { window.showDbError && window.showDbError(e); return; }
    }
    var url = new URL('impl-dashboard.html?t=' + encodeURIComponent(token), location.href).href;
    try { await navigator.clipboard.writeText(url); window.showAlert && window.showAlert('คัดลอกลิงก์ Dashboard แล้ว', 'success'); }
    catch (e) { window.showAlert && window.showAlert('เปิด Dashboard แล้ว (คัดลอกลิงก์อัตโนมัติไม่สำเร็จ)', 'info'); }
    window.open(url, '_blank');
  };

  // ── พิมพ์เอกสารสรุปปัญหาจริงผ่าน browser print dialog (window.print()) — ต่างจาก exportImtReportImage
  // เดิมของแท็บ Report ที่ตั้งใจให้เป็นรูปภาพเท่านั้น เอกสารนี้ต้องออกมาเป็นกระดาษให้ รพ. เซ็นรับทราบจริง ๆ
  // จึงต้องพิมพ์ตรง ไม่ใช่แนบไฟล์ภาพ — ซ่อน UI อื่นทั้งหมดด้วย @media print scoped ที่ impl-tracker.css
  // (ตาม pattern เดียวกับ site-notice-form.css/expense-form.css) ──
  function imtMarkInvalid(el, bad) {
    if (!el) return;
    el.classList.toggle('invalid', !!bad);
    if (bad && !el._invb) { el._invb = 1; ['input', 'change'].forEach(function (ev) { el.addEventListener(ev, function () { el.classList.remove('invalid'); }); }); }
  }

  // ── @page เป็น at-rule ระดับเอกสารพิมพ์ทั้งหมด ใช้ scope ด้วย body[data-view] ไม่ได้ — ฉีด/ถอด
  // "size: A4 landscape" เฉพาะตอนพิมพ์จริงจากหน้านี้ กันไปทับ @page (portrait) ของเอกสารประกอบ Adv./
  // หนังสือแจ้งเข้าไซต์ ที่โหลดมาก่อนหน้าใน main.css ──
  function imtSetPrintLandscape(on) {
    var el = document.getElementById('imt-print-landscape');
    if (!el) {
      el = document.createElement('style');
      el.id = 'imt-print-landscape';
      el.textContent = '@page { size: A4 landscape; margin: 0; }';
      document.head.appendChild(el);
    }
    el.disabled = !on;
  }

  window.printImtIssues = function () {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) return;
    var fromEl = document.getElementById('iip-from'), toEl = document.getElementById('iip-to');
    var lnameEl = document.getElementById('iip-lname'), lposEl = document.getElementById('iip-lpos'), lorgEl = document.getElementById('iip-lorg');
    var rnameEl = document.getElementById('iip-rname'), rposEl = document.getElementById('iip-rpos');
    var rOrgEl = document.getElementById('iip-hosp-cmb-input');
    // ── "โรงพยาบาล/หน่วยงาน" ฝั่งผู้ลงนาม รพ.: ถ้าเลือกจากรายการ รพ. จริง ใช้ "ชื่อ + จังหวัด" (imtHospDisplayText)
    // ไม่มีรหัสสถานพยาบาลปนมาด้วย (ช่องพิมพ์ค้นหาโชว์รหัสไว้ช่วยแยกแยะระหว่างเลือก แต่ตอนพิมพ์เอกสารไม่ต้องมี)
    // ── ถ้าพิมพ์ชื่อหน่วยงานเองไม่ตรงกับ รพ. ไหนเลย ใช้ข้อความที่พิมพ์ไว้ตรง ๆ ──
    var rHospId = (document.getElementById('iip-rhosp') || {}).value || '';
    var rHosp = rHospId ? (window.HOSPITALS || []).find(function (h) { return h.id === rHospId; }) : null;
    var rOrgTyped = (rOrgEl || {}).value.trim();

    var miss = [];
    [[fromEl, fromEl.value], [toEl, toEl.value], [lnameEl, lnameEl.value.trim()], [lposEl, lposEl.value.trim()],
      [lorgEl, lorgEl.value.trim()], [rnameEl, rnameEl.value.trim()], [rposEl, rposEl.value.trim()], [rOrgEl, rOrgTyped]]
      .forEach(function (pair) { imtMarkInvalid(pair[0], !pair[1]); if (!pair[1]) miss.push(pair[0]); });
    if (miss.length) {
      window.showAlert && window.showAlert('กรุณากรอกข้อมูลให้ครบทุกช่องก่อนพิมพ์', 'error');
      if (miss[0] && miss[0].focus) miss[0].focus();
      return;
    }

    window.imtIssuePrintOpts = window.imtIssuePrintOpts || {};
    var opts = window.imtIssuePrintOpts[pid] = {
      title: (document.getElementById('iip-title') || {}).value || imtIssuePrintTitleDefault(proj),
      from: fromEl.value, to: toEl.value,
      signLName: lnameEl.value.trim(), signLPos: lposEl.value.trim(), signLOrg: lorgEl.value.trim(),
      signRName: rnameEl.value.trim(), signRPos: rposEl.value.trim(), signROrg: rHosp ? imtHospDisplayText(rHosp) : rOrgTyped,
    };
    window.closeM('m-imt-issue-print');
    var host = document.getElementById('imt-issue-print-doc');
    if (!host) { window.showAlert && window.showAlert('เปิดแท็บ "ปัญหา" ของโครงการนี้ค้างไว้ก่อนพิมพ์', 'error'); return; }
    host.innerHTML = imtIssuePrintDocHtml(pid, opts);
    setTimeout(function () {
      imtSetPrintLandscape(true);
      window.addEventListener('afterprint', function _off() {
        window.removeEventListener('afterprint', _off);
        imtSetPrintLandscape(false);
      });
      window.print();
      imtSetPrintLandscape(false);
    }, 50);
  };

  function renderImtCalendar(mount) {
    var pid = window.imtCurrentProjectId;
    if (!imtProject(pid)) { mount.innerHTML = projectPicker(); return; }
    var tasks = imtTasksOfProject(pid);
    var y = window.imtCalY, m = window.imtCalM;
    var first = new Date(y, m, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var prevDays = new Date(y, m, 0).getDate();

    // ── ตัวเลือกเดือนอยู่ท้ายแถวแท็บของโครงการ (imtSetPtabExtra) — ให้ปฏิทินได้พื้นที่แนวตั้งเต็มที่ ──
    var toolbar = '<div class="month-nav"><button class="mnav-btn" onclick="window.imtCalNav(-1)">‹</button>'
      + '<div class="month-lbl">'+window.THMON[m]+' '+(y+543)+'</div><button class="mnav-btn" onclick="window.imtCalNav(1)">›</button></div>';

    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push({ d: prevDays - startDow + i + 1, other:true });
    for (var d = 1; d <= daysInMonth; d++) cells.push({ d:d, other:false, y:y, m:m });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length, other:true });

    var cellsHtml = cells.map(function (c) {
      if (c.other) return '<div class="imt-cal-cell other-month"><div class="imt-cal-daynum">'+c.d+'</div></div>';
      var ds = c.y + '-' + String(c.m+1).padStart(2,'0') + '-' + String(c.d).padStart(2,'0');
      var dayTasks = tasks.filter(function (t) { return t.due === ds; });
      var items = dayTasks.map(function (t) {
        var st = imtStatus(t.status);
        return '<div class="imt-cal-item" style="background:'+st.color+'18;color:'+st.color+'" onclick="window.openImtTaskModal(\''+t.id+'\')" title="'+esc(t.name)+'">'+esc(t.name)+'</div>';
      }).join('');
      return '<div class="imt-cal-cell"><div class="imt-cal-daynum">'+c.d+'</div>'+items+'</div>';
    }).join('');

    var dow = window.DNAMES.map(function (d) { return '<div class="imt-cal-dow">'+d+'</div>'; }).join('');
    window.imtSetPtabExtra(toolbar);
    mount.innerHTML = '<div class="imt-cal-grid">'+dow+cellsHtml+'</div>';
  }

  // ================================================================
  // REPORT — สรุป + Export Excel + Print (Save as PDF)
  // ================================================================
  async function _imtDoExport(headers, rows, filename) {
    if (!(await window.LibLoader.need('xlsx'))) return;
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, filename + '_' + window.todayStr() + '.xlsx');
  }

  window.exportImtReport = function () {
    var pid = window.imtCurrentProjectId;
    var tasks = pid ? imtTasksOfProject(pid) : window.IMPL_TASKS;
    var headers = ['Phase', 'งาน', 'ผู้รับผิดชอบ', 'กำหนดเสร็จ', 'สถานะ', 'ความคืบหน้า (%)'];
    var rows = tasks.map(function (t) {
      var ph = imtPhase(t.phaseId);
      return [ph?ph.name:'', t.name, t.owner, t.due, imtStatus(t.status).label, window.calcTaskProgress(t)];
    });
    _imtDoExport(headers, rows, 'ImplTracker_Report');
  };

  // ── Export เป็นรูปภาพ (PNG): แบ่งเป็นหลายภาพ สัดส่วนประมาณ A4 แนวตั้ง (กว้าง 1000 สูงไม่เกิน IMT_IMG_MAX_H)
  // เดิมได้ภาพเดียวยาวเหยียดตามเนื้อหา — โครงการที่ Checklist เยอะ ภาพยาวมากจนเปิดในไลน์/มือถือแล้วอ่านไม่ออก
  // ภาพแรก = หัวเรื่อง + กราฟ + สรุป 3 ช่อง ตามด้วย Phase · ภาพถัดไป = หัวเรื่องย่อ + Phase ที่เหลือ
  // ไล่เติมทีละแถวลงคอลัมน์ซ้าย → ขวา → ภาพใหม่ วัดความสูงจริงจาก DOM · Phase ที่ถูกตัดข้ามคอลัมน์/ภาพขึ้นหัวว่า "(ต่อ)" ──
  var IMT_IMG_W = 1000, IMT_IMG_MAX_H = 1414;
  function imtNextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); }

  window.exportImtReportImage = async function () {
    if (!(await window.LibLoader.need('html2canvas'))) return;
    var src = document.querySelector('.imt-print-page');
    if (!src) { window.showAlert && window.showAlert('ไม่พบข้อมูลสำหรับสร้างรูปภาพ กรุณาเลือกโครงการก่อน', 'error'); return; }
    var proj = imtProject(window.imtCurrentProjectId);
    var projName = proj ? proj.name : 'Report';
    var srcBox = src.querySelector('.imt-print-checklist');
    var topParts = ['.ppc-header-card', '.ppc-chart', '.ppc-summary']
      .map(function (s) { return srcBox.querySelector(s); }).filter(Boolean);
    var groups = Array.prototype.slice.call(srcBox.querySelectorAll('.ppc-group'));

    var pages = [];
    function newPage() {
      var page = document.createElement('div');
      page.className = 'imt-print-page';
      page.style.cssText = 'display:block;position:fixed;top:-100000px;left:0;width:'+IMT_IMG_W+'px;box-sizing:border-box;height:auto;max-height:none;overflow:visible;background:#fff;padding:24px;';
      var box = document.createElement('div');
      box.className = 'imt-print-checklist';
      if (!pages.length) {
        topParts.forEach(function (el) { box.appendChild(el.cloneNode(true)); });
      } else {
        box.innerHTML = '<div class="ppc-header-card" style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #000;">'
          + '<div class="ppc-title" style="font-size:16px;">'+esc(projName)+'</div></div>';
      }
      var pno = document.createElement('div');
      pno.className = 'ppc-subtitle';
      pno.style.cssText = 'text-align:right;margin:-6px 0 8px;';
      pno.textContent = 'ภาพที่ 0/0'; // จองความสูงไว้ตอนวัด เลขจริงใส่ทีหลังเมื่อรู้จำนวนภาพ
      box.appendChild(pno);
      var cols = document.createElement('div');
      cols.className = 'ppc-cols';
      cols.innerHTML = '<div class="ppc-col"></div><div class="ppc-col"></div>';
      box.appendChild(cols);
      page.appendChild(box);
      document.body.appendChild(page);
      var p = { el: page, pno: pno, cols: cols.children, colIdx: 0 };
      pages.push(p);
      return p;
    }
    var over = function (p) { return p.el.scrollHeight > IMT_IMG_MAX_H; };

    try {
      var cur = newPage();
      groups.forEach(function (g) {
        var head = g.querySelector('.ppc-phase-head');
        var rows = Array.prototype.slice.call(g.children).filter(function (c) { return c !== head; });
        var shell = null, contd = false;
        function openShell() {
          shell = document.createElement('div');
          shell.className = 'ppc-group';
          var h = head.cloneNode(true);
          if (contd) h.querySelector('.ppc-phase').textContent += ' (ต่อ)';
          shell.appendChild(h);
          cur.cols[cur.colIdx].appendChild(shell);
        }
        function nextColumn() {
          if (cur.colIdx === 0) cur.colIdx = 1; else cur = newPage();
        }
        openShell();
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i].cloneNode(true);
          shell.appendChild(r);
          if (!over(cur)) continue;
          // คอลัมน์ว่าง (มีแค่หัว Phase + แถวนี้) แต่ยังล้น: ยอมให้เกิน ย้ายไปก็ไม่ดีขึ้น
          if (shell.parentNode.firstChild === shell && shell.children.length <= 2) continue;
          shell.removeChild(r);
          // ไม่ทิ้งหัวข้องาน (ppc-task-row) ค้างไว้ท้ายคอลัมน์โดยไม่มี Checklist ใต้มัน — ยกไปพร้อมกัน
          var carry = [];
          while (shell.children.length > 2 && shell.lastChild.classList.contains('ppc-task-row')) carry.unshift(shell.removeChild(shell.lastChild));
          // หัว Phase ไม่มีแถวติดอยู่เลย → ไม่เหลือหัวเปล่า ๆ ไว้ท้ายคอลัมน์ ย้ายไปทั้งก้อน
          var placed = shell.children.length > 1;
          if (!placed) shell.remove();
          contd = contd || placed;
          nextColumn();
          openShell();
          carry.forEach(function (c) { shell.appendChild(c); });
          shell.appendChild(r);
        }
      });

      await imtNextFrame();
      var n = pages.length;
      pages.forEach(function (p, i) { if (n > 1) p.pno.textContent = 'ภาพที่ '+(i + 1)+'/'+n; else p.pno.remove(); });
      var safeName = projName.replace(/[^a-zA-Z0-9ก-๙]+/g, '_');
      var base = 'ImplTracker_' + safeName + '_' + window.todayStr();
      for (var pi = 0; pi < n; pi++) {
        var el = pages[pi].el;
        var capW = el.scrollWidth, capH = el.scrollHeight;
        var canvas = await window.html2canvas(el, {
          scale: 2, backgroundColor: '#ffffff',
          width: capW, height: capH, windowWidth: capW, windowHeight: capH,
        });
        var link = document.createElement('a');
        link.download = base + (n > 1 ? '_' + (pi + 1) + 'of' + n : '') + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        // เว้นจังหวะระหว่างไฟล์ ไม่ให้เบราว์เซอร์รวบดาวน์โหลดหลายไฟล์ติดกันจนบางไฟล์หาย
        if (pi < n - 1) await new Promise(function (r) { setTimeout(r, 400); });
      }
      if (n > 1) window.showAlert && window.showAlert('บันทึกรูปภาพแล้ว ' + n + ' ภาพ', 'success');
    } catch (e) {
      window.showAlert && window.showAlert('สร้างรูปภาพไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally {
      pages.forEach(function (p) { p.el.remove(); });
    }
  };

  window.renderImtReport = function () { renderImtReport(document.getElementById('imt-content')); };
  function renderImtReport(mount) {
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) { mount.innerHTML = projectPicker(); return; }
    // Report/Print แสดงเฉพาะโครงการที่เลือกอยู่เท่านั้น (ไม่รวมทุกโครงการ) ทั้งเพื่อให้พิมพ์พอดี 1 หน้า
    // และให้ Phase เรียงลำดับ (น้อยไปมาก) ถูกต้องเสมอ — imtPhasesOf() เรียงตาม sort_order ให้แล้ว
    var tasks = imtTasksOfProject(pid);
    var phases = imtPhasesOf(pid);
    var overallPct = window.calcProjectProgress(proj);

    // ── สรุปสัปดาห์ด้วย AI: อยู่ในแถบเดียวกับ Excel/บันทึกรูปภาพ — กด "สรุปด้วย AI" แล้วเปิด Popup
    // แยกต่างหาก (m-imt-ai-summary) แทนกล่องขยาย/พับเดิม ไม่กินพื้นที่หน้า Report ตอนยังไม่ได้กด ──
    var aiDate = window.imtAiSelectedDate || window.todayStr();
    // ── อยู่ท้ายแถวแท็บของโครงการ (imtSetPtabExtra) เหมือนแท็บปัญหา/แบบฟอร์ม ──
    var toolbar = '<input type="date" class="f-input" id="imt-ai-date" style="max-width:150px;" value="'+esc(aiDate)+'" oninput="window.imtAiSelectedDate=this.value">'
      + '<button class="btn btn-pri btn-sm" onclick="window.imtGenerateAiWeekSummary()">✨ สรุปด้วย AI</button>'
      + '<button class="btn btn-xls btn-sm" onclick="window.exportImtReport()">📥 Excel</button>'
      + '<button class="btn btn-pri btn-sm" onclick="window.exportImtReportImage()">📷 บันทึกเป็นรูปภาพ</button>';

    // ── สรุปภาพรวม: ใช้ร่วมกันทั้ง hero การ์ดบนจอ และกราฟแท่งในสรุปสำหรับพิมพ์ด้านล่าง ──
    var doneCount = tasks.filter(function (t) { return t.status === 'done'; }).length;
    var overdueCount = tasks.filter(function (t) { return window.imtIsOverdue(t); }).length;
    var statusCounts = window.IMPL_STATUS.map(function (st) {
      var n = tasks.filter(function (t) { return t.status === st.id; }).length;
      return { st:st, n:n, pct: tasks.length ? Math.round((n / tasks.length) * 100) : 0 };
    }).filter(function (x) { return x.n > 0; });

    // ── ข้อมูลจากแท็บอื่นของโครงการ: ปัญหา (IMPL_ISSUES) + แบบฟอร์ม (FORM_GROUPS/FORM_ITEMS) ──
    var issues = imtIssuesOfProject(pid);
    var issueCounts = window.IMPL_ISSUE_STATUS.map(function (s) {
      return { st:s, n: issues.filter(function (i) { return i.status === s.id; }).length };
    });
    var openIssueN = issues.filter(function (i) { return i.status !== 'closed'; }).length;
    var formItems = window.FORM_ITEMS.filter(function (i) { return i.projectId === pid; });
    var formDoneN = formItems.filter(function (i) { return i.status === 'done'; }).length;
    var formPct = window.calcFormProjectProgress(pid);
    var formGroups = window.FORM_GROUPS.filter(function (g) { return g.projectId === pid; })
      .sort(function (a,b) { return a.order - b.order; })
      .map(function (g) {
        var its = formItems.filter(function (i) { return i.groupId === g.id; });
        var done = its.filter(function (i) { return i.status === 'done'; }).length;
        return { g:g, n:its.length, done:done, pct: its.length ? Math.round(done / its.length * 100) : 0 };
      });

    // ── งานเกินกำหนด (เกินมากสุดก่อน) + กำหนดการ 14 วันข้างหน้า (ใกล้สุดก่อน) — เกณฑ์เดียวกับหน้า "ทุกโครงการ" ──
    var today0 = new Date(new Date().toDateString());
    var overdueList = tasks.filter(function (t) { return window.imtIsOverdue(t); })
      .map(function (t) { return { t:t, days:Math.round((today0 - pd(t.due)) / 86400000) }; })
      .sort(function (a,b) { return b.days - a.days; });
    var upcomingList = tasks.filter(function (t) { return window.imtIsDueSoon(t, 14); })
      .map(function (t) { return { t:t, diff:Math.round((pd(t.due) - today0) / 86400000) }; })
      .sort(function (a,b) { return a.diff - b.diff; });

    // ── Hero: ring ความคืบหน้างาน + ตัวเลขเด่น 4 ตัว (งาน/แบบฟอร์ม/ปัญหาค้าง/ล่าช้า) + ชิปสถานะงาน
    // (แทนกราฟสรุปสถานะ/ความคืบหน้าตาม Phase เดิม ที่ซ้ำกับการ์ด Phase ด้านล่าง) · กดแต่ละตัว = ไปแท็บนั้น ──
    // การ์ด KPI: หัวข้อ + ตัวเลขใหญ่ + คำอธิบายสั้น (+ แถบความคืบหน้าถ้ามี) · สีตามความหมาย (เขียว = ดี, แดง = ต้องดู)
    var heroStat = function (o) {
      return '<div class="imt-report-kpi" style="--c:'+o.color+'" onclick="'+o.onclick+'">'
        + '<div class="imt-report-kpi-lbl"><span class="imt-report-kpi-ic">'+o.icon+'</span>'+o.label+window.calcTip(o.tip)+'</div>'
        + '<div class="imt-report-kpi-val">'+o.val+'</div>'
        + (o.bar != null ? '<div class="imt-report-kpi-bar"><span style="width:'+o.bar+'%"></span></div>' : '')
        + '<div class="imt-report-kpi-sub">'+o.sub+'</div>'
        + '</div>';
    };
    var donePct = tasks.length ? Math.round(doneCount / tasks.length * 100) : 0;
    // แถบสถานะงานแบบซ้อน (สัดส่วนทั้งหมด = 100%) + คำอธิบายสีด้านล่าง กดได้ = ไปงานสถานะนั้น
    var statusBar = statusCounts.length
      ? '<div class="imt-report-status">'
        + '<div class="imt-report-status-head"><span>สถานะงานทั้งหมด '+tasks.length+' งาน</span></div>'
        + '<div class="imt-report-status-bar">' + statusCounts.map(function (x) {
            return '<span style="flex:'+x.n+';background:'+x.st.color+'" title="'+esc(x.st.label)+' '+x.n+' งาน ('+x.pct+'%)" onclick="window.imtGoToTaskStatus(\''+x.st.id+'\')"></span>';
          }).join('') + '</div>'
        + '<div class="imt-report-status-legend">' + statusCounts.map(function (x) {
            return '<button type="button" title="ดูงานสถานะนี้" onclick="window.imtGoToTaskStatus(\''+x.st.id+'\')">'
              + '<i style="background:'+x.st.color+'"></i>'+esc(x.st.label)+' <b>'+x.n+'</b> <small>('+x.pct+'%)</small></button>';
          }).join('') + '</div>'
        + '</div>'
      : '';
    var heroHtml = '<div class="imt-report-hero">'
      + '<div class="imt-report-hero-ring" style="--pct:'+overallPct+'"><span><b>'+overallPct+'%</b><small>ความคืบหน้ารวม'+window.calcTip("ความคืบหน้าโครงการ = ค่าเฉลี่ยของทุก Phase\nPhase = ค่าเฉลี่ยของทุกงานใน Phase\nงาน = Checklist ที่ติ๊กแล้ว ÷ Checklist ทั้งหมด (ไม่มี Checklist: เสร็จแล้ว = 100%)")+'</small></span></div>'
      + '<div class="imt-report-hero-body">'
      +   '<div class="imt-report-hero-stats">'
      +     heroStat({ icon:'📋', label:'งานเสร็จแล้ว', color:'var(--teal)', onclick:"window.imtGoTab('workspace')",
                       val: doneCount+'<small> / '+tasks.length+'</small>', bar: donePct, sub: 'คิดเป็น '+donePct+'% ของงานทั้งหมด',
                       tip: 'งานที่สถานะ "เสร็จแล้ว" / งานทั้งหมดของโครงการ' })
      +     heroStat({ icon:'📄', label:'แบบฟอร์มเสร็จ', color:'var(--sky)', onclick:"window.imtGoTab('forms')",
                       val: formPct+'<small>%</small>', bar: formPct, sub: formDoneN+' จาก '+formItems.length+' ฉบับ',
                       tip: 'แบบฟอร์มที่เสร็จแล้ว ÷ แบบฟอร์มทั้งหมดของโครงการ × 100' })
      +     heroStat({ icon:'🩹', label:'ปัญหาค้าง', color: openIssueN ? 'var(--coral)' : 'var(--teal)', onclick:"window.imtIssueFilter={};window.imtGoTab('issues')",
                       val: openIssueN+'<small> เรื่อง</small>', sub: openIssueN ? 'จากทั้งหมด '+issues.length+' เรื่อง' : (issues.length ? 'แก้ครบทั้ง '+issues.length+' เรื่อง ✓' : 'ไม่มีปัญหา ✓'),
                       tip: 'ปัญหาของโครงการที่สถานะยังไม่ "เสร็จแล้ว"' })
      +     heroStat({ icon:'⏰', label:'งานล่าช้า', color: overdueCount ? 'var(--coral)' : 'var(--teal)', onclick:"window.imtGoTab('workspace')",
                       val: overdueCount+'<small> งาน</small>', sub: overdueCount ? 'เลยกำหนดแล้ว ต้องติดตาม' : 'ทุกงานอยู่ในกำหนด ✓',
                       tip: 'งานที่เลยวันครบกำหนดแล้ว แต่ยังไม่เสร็จ/ไม่ยกเลิก' })
      +   '</div>'
      +   statusBar
      + '</div>'
      + '</div>';

    var taskRow = function (t, badgeHtml) {
      var ph = imtPhase(t.phaseId);
      return '<div class="imt-dash-row" onclick="window.openImtTaskModal(\''+t.id+'\')">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">'+esc(t.name)+'</div>'
        + '<div class="imt-dash-row-sub">'+esc(ph ? ph.name : '—')+(t.owner?' · 👤 '+esc(t.owner):'')+'</div></div>'
        + '<div class="imt-dash-row-badge">'+badgeHtml+'</div></div>';
    };
    var moreRow = function (n) { return n > 0 ? '<div class="imt-dash-more">และอีก '+n+' งาน</div>' : ''; };
    var emptyRow = function (txt) { return '<div class="imt-report-empty">'+txt+'</div>'; };
    var card = function (title, body) { return '<div class="dtable-inner imt-report-card"><div class="sec-label">'+title+'</div>'+body+'</div>'; };

    var overdueHtml = overdueList.length
      ? overdueList.slice(0, 6).map(function (x) { return taskRow(x.t, '<span style="color:var(--coral);">เกิน '+x.days+' วัน</span>'); }).join('') + moreRow(overdueList.length - 6)
      : emptyRow('ไม่มีงานเกินกำหนด 🎉');
    var upcomingHtml = upcomingList.length
      ? upcomingList.slice(0, 6).map(function (x) {
          var label = x.diff === 0 ? 'วันนี้' : x.diff === 1 ? 'พรุ่งนี้' : 'อีก '+x.diff+' วัน';
          return taskRow(x.t, '<span style="color:'+(x.diff<=1?'var(--amber)':'var(--txt2)')+';">'+label+'</span>');
        }).join('') + moreRow(upcomingList.length - 6)
      : emptyRow('ไม่มีงานครบกำหนดใน 14 วันข้างหน้า');

    // ── สรุปปัญหา: ชิปตามสถานะ (กด = แท็บปัญหากรองสถานะนั้น) + กลุ่มปัญหาที่พบบ่อย 3 อันดับ ──
    var catCount = {};
    issues.forEach(function (i) { var c = i.category || 'ไม่ระบุ'; catCount[c] = (catCount[c] || 0) + 1; });
    var topCats = Object.keys(catCount).map(function (c) { return { name:c, n:catCount[c] }; })
      .sort(function (a,b) { return b.n - a.n; }).slice(0, 3);
    var barRow = function (label, n, pct, color, sub) {
      return '<div class="imt-report-bar"><span class="imt-report-bar-lbl" title="'+esc(label)+'">'+esc(label)+'</span>'
        + '<span class="imt-report-bar-track"><span style="width:'+pct+'%;background:'+color+';"></span></span>'
        + '<span class="imt-report-bar-val">'+(sub || n)+'</span></div>';
    };
    var issueHtml = issues.length
      ? '<div class="imt-report-chips">' + issueCounts.map(function (x) {
          return '<button type="button" class="imt-iss-chip" style="--c:'+x.st.color+'" onclick="window.imtIssueFilter={status:\''+x.st.id+'\'};window.imtGoTab(\'issues\')">'
            + x.st.icon+' '+esc(x.st.label)+' <b>'+x.n+'</b></button>';
        }).join('') + '</div>'
        + '<div class="imt-report-sub">กลุ่มปัญหาที่พบบ่อย</div>'
        + topCats.map(function (c) { return barRow(c.name, c.n, Math.round(c.n / topCats[0].n * 100), 'var(--indigo)'); }).join('')
      : emptyRow('ยังไม่มีปัญหาที่บันทึกไว้');

    // ── แบบฟอร์มรายคลัง: เสร็จ/ทั้งหมด + แถบ % (สีตามเกณฑ์เดียวกับ Phase) ──
    var formHtml = formGroups.length
      ? formGroups.map(function (x) { return barRow(x.g.name, x.n, x.pct, imtPhaseHealthColor(x.pct), x.done+'/'+x.n); }).join('')
      : emptyRow('ยังไม่มีคลังแบบฟอร์ม');

    var summaryGrid = '<div class="imt-report-grid">'
      + card('⏰ งานเกินกำหนด', overdueHtml)
      + card('📅 ครบกำหนดใน 14 วันข้างหน้า', upcomingHtml)
      + card('🩹 สรุปปัญหา <a class="imt-report-link" onclick="window.imtIssueFilter={};window.imtGoTab(\'issues\')">ดูทั้งหมด →</a>', issueHtml)
      + card('📄 แบบฟอร์มรายคลัง <a class="imt-report-link" onclick="window.imtGoTab(\'forms\')">ดูทั้งหมด →</a>', formHtml)
      + '</div>';

    // ── การ์ด Phase แทนตาราง — เพิ่มข้อมูลผู้รับผิดชอบ/ช่วงวันที่/จุดเสี่ยง (ล่าช้า/มีปัญหา) ให้ DM/PM
    // เห็นภาพรวมได้ชัดโดยไม่ต้องเปิดเข้าไปดูทีละ Task — คลิกที่การ์ดเพื่อดูรายการ Task ของ Phase นั้นได้เลย
    // (เหมือนคลิกแท่งกราฟด้านบน) สีอ้างอิงจาก % จริงเหมือนกราฟ ไม่ใช้ field สถานะที่อาจลืมอัปเดต ──
    var phaseCards = phases.map(function (p, idx) {
      var pTasks = imtTasksOfPhase(p.id);
      var pct = window.calcPhaseProgress(p);
      var color = imtPhaseHealthColor(pct);
      var overdueCnt = pTasks.filter(function (t) { return window.imtIsOverdue(t); }).length;
      var issueCnt = pTasks.filter(function (t) { return t.status === 'issue'; }).length;
      var owners = pTasks.map(function (t) { return t.owner; }).filter(Boolean);
      var ownerCount = Array.from(new Set(owners)).length;
      var starts = pTasks.map(function (t) { return t.start; }).filter(Boolean).sort();
      var dues = pTasks.map(function (t) { return t.due; }).filter(Boolean).sort();
      var dateRange = (starts.length && dues.length) ? (fd(starts[0])+' - '+fd(dues[dues.length-1])) : '';
      var stDelayed = imtStatus('delayed'), stIssue = imtStatus('issue');
      var riskBadges = (overdueCnt ? '<span class="tag" style="background:'+stDelayed.color+'18;color:'+stDelayed.color+';">'+stDelayed.icon+' ล่าช้า '+overdueCnt+'</span>' : '')
        + (issueCnt ? '<span class="tag" style="background:'+stIssue.color+'18;color:'+stIssue.color+';">'+stIssue.icon+' มีปัญหา '+issueCnt+'</span>' : '');
      return '<div class="imt-report-pcard" onclick="window.imtGoToPhaseTasks(\''+p.id+'\')">'
        + '<div class="imt-report-pcard-top"><span><span class="imt-phase-num">Phase '+(idx+1)+'</span> <span class="imt-report-pcard-name">'+esc(p.name)+'</span></span><span class="imt-report-pcard-pct" style="color:'+color+'">'+pct+'%'+window.calcTip("ความคืบหน้า Phase = ค่าเฉลี่ยของทุกงานใน Phase\nงาน = Checklist ที่ติ๊กแล้ว ÷ Checklist ทั้งหมด (ไม่มี Checklist: เสร็จแล้ว = 100%)")+'</span></div>'
        + pbarHtml(pct, color)
        + '<div class="imt-report-pcard-meta">'+pTasks.length+' งาน'+(ownerCount?' · 👤 '+ownerCount+' คน':'')+(dateRange?' · 📅 '+dateRange:'')+'</div>'
        + (riskBadges ? '<div class="imt-report-pcard-risk">'+riskBadges+'</div>' : '')
        + '</div>';
    }).join('') || '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);padding:24px;">ไม่มีข้อมูล Phase</div>';
    var phaseGrid = '<div class="sec-label" style="margin:4px 24px 10px;">รายละเอียดตาม Phase</div><div class="imt-report-phasegrid">'+phaseCards+'</div>';

    // ── สรุปสำหรับพิมพ์ (แสดงเฉพาะตอนสั่งพิมพ์/Save as PDF ไม่โชว์บนหน้าจอปกติ) ──
    // การ์ดหัวเรื่อง + กราฟแท่งสรุปสถานะ (จำนวน + ร้อยละ) + รายการ Checklist จัดกลุ่มตาม Phase
    // แต่ละรายการมีไอคอนสถานะของงาน + เส้นประ + วันที่ทำ (ถ้ายังไม่ทำ เว้นจุดไข่ปลาให้เขียนเอง)
    // จัดเป็นคอลัมน์คู่ ตัวอักษรเล็กกะทัดรัด ให้พอดี 1 หน้ากระดาษ A4 ──
    var maxN = Math.max.apply(null, statusCounts.map(function (x) { return x.n; }).concat([1]));
    var chartHtml = statusCounts.map(function (x) {
      var barPct = Math.round((x.n / maxN) * 100);
      return '<div class="ppc-chart-row">'
        + '<span class="ppc-chart-lbl">'+x.st.icon+' '+esc(x.st.label)+'</span>'
        + '<span class="ppc-chart-bar-wrap"><span class="ppc-chart-bar" style="width:'+barPct+'%;background:'+x.st.color+';"></span></span>'
        + '<span class="ppc-chart-val">'+x.n+' ('+x.pct+'%)</span>'
        + '</div>';
    }).join('');

    // สร้างรายการต่อ Phase ก่อน แล้วค่อยแบ่งเป็น 2 คอลัมน์เอง (ไม่ใช้ CSS column-count) เพราะ multi-column
    // ผสมกับ overflow:hidden ตอนพิมพ์ มีปัญหาในเบราว์เซอร์บางตัวที่ยังดันเนื้อหาล้นไปหน้า 2 อยู่ดี —
    // แบ่งคอลัมน์เองด้วย plain flex ทำให้ overflow:hidden ตัดเนื้อหาส่วนเกินได้จริงตามที่ต้องการ
    var phaseGroups = phases.map(function (ph, phIdx) {
      var itemRows = [];
      imtTasksOfPhase(ph.id).forEach(function (t) {
        var tst = imtStatus(t.status);
        var ck = imtChecklistOf(t.id);
        // ── Task ไม่มี Checklist เลย: เดิมแถวของ Task นี้จะหายไปจากรายงานทั้งหมด (ลูปด้านล่างวนตาม
        // Checklist เท่านั้น) — ให้แสดงชื่องานเป็นบรรทัดเดียวแทน ใช้วันที่อัปเดตล่าสุดของ Task เอง
        // (updatedAt) แทน doneDate ของ Checklist ที่ไม่มีให้ใช้ในกรณีนี้ ──
        if (!ck.length) {
          itemRows.push('<div class="ppc-row'+(t.status==='done' ? ' ppc-row-done' : '')+'">'
            + '<span class="ppc-status-ic" title="'+esc(tst.label)+'">'+tst.icon+'</span>'
            + '<span class="ppc-item">'+esc(t.name)+'</span>'
            + (t.status==='done' && t.updatedAt ? '<span class="ppc-date">'+fd(t.updatedAt)+'</span>' : '')
            + '</div>');
          return;
        }
        // ── Task มี Checklist: แสดงชื่องานเป็นหัวข้อย่อย (ตัวบาง เบากว่าหัว Phase ที่เป็นตัวหนา) แล้วซ้อน
        // Checklist แต่ละรายการเป็นแถวย่อหน้าไว้ข้างใต้ ให้เห็นชัดว่า Checklist ไหนเป็นของ Task ไหน ──
        itemRows.push('<div class="ppc-task-row"><span class="ppc-status-ic" title="'+esc(tst.label)+'">'+tst.icon+'</span><span class="ppc-task-name">'+esc(t.name)+'</span></div>');
        // ── ซ่อนรายการ Checklist ที่ชื่อซ้ำกับชื่อ Task เป๊ะ (มักเกิดจากตอนสร้าง Checklist พิมพ์ชื่องานซ้ำ
        // เป็นรายการแรก) กันไม่ให้ขึ้นซ้ำกับหัวข้อ Task ที่เพิ่งแสดงไปด้านบนแล้ว ──
        ck.filter(function (c) { return c.name.trim() !== t.name.trim(); }).forEach(function (c) {
          // ── แถวย่อยใช้ไอคอนติ๊ก ☑/☐ ตามสถานะของ Checklist แต่ละรายการเอง (ไม่ใช่ไอคอนสถานะของ Task ที่ซ้ำ
          // เหมือนกันทุกแถวแบบเดิม ไม่สื่อความหมายเพิ่มอะไรเลย) ให้เห็นชัดว่ารายการไหนเสร็จ/ยังไม่เสร็จจริง ──
          var ckIcon = c.done ? '☑' : '☐';
          itemRows.push('<div class="ppc-row ppc-sub'+(c.done ? ' ppc-row-done' : '')+'">'
            + '<span class="ppc-status-ic ppc-ck-ic'+(c.done?' done':'')+'">'+ckIcon+'</span>'
            + '<span class="ppc-item">'+esc(c.name)+'</span>'
            + (c.done && c.doneDate ? '<span class="ppc-date">'+fd(c.doneDate)+'</span>' : '')
            + '</div>');
        });
      });
      return { name:ph.name, num:phIdx+1, color:imtPhaseStatus(ph).color, pct:window.calcPhaseProgress(ph), rows:itemRows };
    }).filter(function (g) { return g.rows.length; });

    function ppcGroupHtml(g) {
      return '<div class="ppc-group">'
        + '<div class="ppc-phase-head" style="border-left-color:'+g.color+';">'
        +   '<span class="ppc-phase">Phase '+g.num+': '+esc(g.name)+'</span>'
        +   '<span class="ppc-phase-pct" style="color:'+g.color+';">'+g.pct+'%</span>'
        + '</div>'
        + g.rows.join('')
        + '</div>';
    }
    // แบ่งคอลัมน์แบบรักษาลำดับ Phase น้อยไปมากเสมอ (คอลัมน์ 1 = Phase ต้นๆ ทั้งหมด ก่อนตัดไปคอลัมน์ 2)
    // แทนการสลับใส่ทีละ Phase ตามยอดบรรทัดที่น้อยกว่า ซึ่งทำให้ลำดับ Phase สลับสับสนไม่เรียงกัน
    var totalRows = phaseGroups.reduce(function (s, g) { return s + g.rows.length; }, 0);
    var col1 = [], col2 = [], col1Rows = 0, splitDone = false;
    phaseGroups.forEach(function (g) {
      if (!splitDone && col1Rows < totalRows / 2) { col1.push(g); col1Rows += g.rows.length; }
      else { splitDone = true; col2.push(g); }
    });
    var phaseGroupsHtml = phaseGroups.length
      ? '<div class="ppc-col">'+col1.map(ppcGroupHtml).join('')+'</div><div class="ppc-col">'+col2.map(ppcGroupHtml).join('')+'</div>'
      : '<div>ไม่มีข้อมูล Checklist</div>';

    // ── สรุป 3 ช่องในรูปภาพ: ปัญหา / แบบฟอร์ม / งานเกินกำหนด (5 อันดับแรก) ──
    var ppcSummary = '<div class="ppc-summary">'
      + '<div class="ppc-sum-box"><div class="ppc-sum-h">🩹 ปัญหา ('+issues.length+')</div>'
      +   issueCounts.map(function (x) { return '<div>'+x.st.icon+' '+esc(x.st.label)+' <b>'+x.n+'</b></div>'; }).join('')
      + '</div>'
      + '<div class="ppc-sum-box"><div class="ppc-sum-h">📄 แบบฟอร์ม '+formPct+'% ('+formDoneN+'/'+formItems.length+')</div>'
      +   (formGroups.map(function (x) { return '<div>'+esc(x.g.name)+' <b>'+x.done+'/'+x.n+'</b></div>'; }).join('') || '<div>—</div>')
      + '</div>'
      + '<div class="ppc-sum-box"><div class="ppc-sum-h">⏰ งานเกินกำหนด ('+overdueList.length+')</div>'
      +   (overdueList.slice(0, 5).map(function (x) { return '<div>'+esc(x.t.name)+' <b>เกิน '+x.days+' วัน</b></div>'; }).join('') || '<div>ไม่มี 🎉</div>')
      + '</div>'
      + '</div>';

    var printOnly = '<div class="imt-print-only imt-print-page"><div class="imt-print-checklist">'
      + '<div class="ppc-header-card">'
      +   '<div class="ppc-title">'+esc(proj.name)+'</div>'
      +   '<div class="ppc-subtitle">'
      +     (proj.siteOwner ? '👤 PM: '+esc(proj.siteOwner)+' · ' : '')
      +     (proj.installer ? '🔧 ผู้ติดตั้ง: '+esc(proj.installer)+' · ' : '')
      +     'งานทั้งหมด '+tasks.length+' · พิมพ์เมื่อ '+fd(new Date().toISOString())
      +   '</div>'
      +   '<div class="ppc-progress-row"><div class="ppc-progress-num">'+overallPct+'%</div>'
      +     '<div class="ppc-progress-bar-wrap"><div class="ppc-progress-bar" style="width:'+overallPct+'%;"></div></div></div>'
      + '</div>'
      + '<div class="ppc-chart">'+chartHtml+'</div>'
      + ppcSummary
      + '<div class="ppc-cols">'+phaseGroupsHtml+'</div>'
      + '</div></div>';

    window.imtSetPtabExtra(toolbar);
    mount.innerHTML = heroHtml + summaryGrid + phaseGrid + printOnly;
  }

  // ================================================================
  // AI WEEKLY SUMMARY — เลือกวัน → สรุป "ทำไปแล้ว" (วันนั้น) + "ยังไม่ได้ทำ" (สัปดาห์ปัจจุบัน)
  // ใช้ตัวเรียก AI กลาง (src/services/ai.service.js — vLLM ภายใน ไม่ต้องใช้ API Key) ──
  function imtWeekRange(dateStr) {
    var d = pd(dateStr);
    var dow = d.getDay(); // 0=Sun..6=Sat
    var diffToMon = (dow === 0 ? -6 : 1 - dow);
    var start = new Date(d); start.setDate(d.getDate() + diffToMon);
    var end = new Date(start); end.setDate(start.getDate() + 6);
    var toStr = function (x) { return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    return { start:start, end:end, startStr:toStr(start), endStr:toStr(end) };
  }

  function imtLocalDateStr(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  window.imtGenerateAiWeekSummary = async function () {
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) return;

    var dateInput = document.getElementById('imt-ai-date');
    var selDate = (dateInput && dateInput.value) || window.todayStr();
    window.imtAiSelectedDate = selDate;

    var wk = imtWeekRange(selDate);
    var tasks = imtTasksOfProject(pid);

    // ทำไปแล้ว: ดึงจาก Activity Log ตรง ๆ (บันทึกทุกครั้งที่มีการอัปเดตงาน/checklist/สถานะ) ของวันที่เลือก
    var doneActs = window.IMPL_ACTIVITY_LOG
      .filter(function (a) { return a.projectId === pid && imtLocalDateStr(a.createdAt) === selDate; })
      .sort(function (a,b) { return (a.createdAt||'').localeCompare(b.createdAt||''); });

    // ยังไม่ได้ทำ: งานที่ยังไม่เสร็จ ซึ่งกำหนดเสร็จอยู่ในสัปดาห์นี้ หรือเลยกำหนดมาแล้ว (ค้างสะสมมาถึงสัปดาห์นี้)
    var notDone = tasks.filter(function (t) {
      return t.status !== 'done' && t.status !== 'cancelled' && t.due && pd(t.due) <= wk.end;
    });

    var doneLines = doneActs.length
      ? doneActs.map(function (a) { return '- ' + (a.detail || '') + (a.actor ? (' (โดย ' + a.actor + ')') : ''); }).join('\n')
      : '(ไม่มีการอัปเดตงานในวันนี้)';

    var pendingLines = notDone.length
      ? notDone.map(function (t) {
          var ph = imtPhase(t.phaseId);
          var overdueTag = window.imtIsOverdue(t) ? ' [เลยกำหนด]' : '';
          return '- [' + (ph ? ph.name : '-') + '] ' + t.name + ' (กำหนดเสร็จ ' + fd(t.due) + ', สถานะ: ' + imtStatus(t.status).label + ')' + overdueTag;
        }).join('\n')
      : '(ไม่มีงานค้างในสัปดาห์นี้)';

    var system = 'คุณเป็นผู้ช่วยสรุปความคืบหน้าโครงการ IT ให้ผู้บริหารอ่านทางแชท LINE ได้ทันที เขียนเป็นภาษาไทย กระชับ ทางการแบบเป็นกันเอง ห้ามทักทายหรือลงท้ายด้วยคำถาม\n'
      + 'ห้ามใช้สัญลักษณ์ Markdown เด็ดขาด (ห้ามมี **, ##, - นำหน้าบรรทัด) เพราะ LINE ไม่รองรับ ให้ใช้อีโมจินำหน้าแทนทุกจุด:\n'
      + '- หัวข้อ "สิ่งที่ทำไปแล้ว" ให้ขึ้นต้นด้วย 📌 สิ่งที่ทำไปแล้ว\n'
      + '- หัวข้อ "สิ่งที่ยังไม่ได้ทำ" ให้ขึ้นต้นด้วย ⏳ สิ่งที่ยังไม่ได้ทำ\n'
      + '- แต่ละรายการย่อยขึ้นต้นด้วย ✅ (ถ้าทำแล้ว) หรือ ▪️ (ถ้ายังไม่ทำ) แทนเครื่องหมาย -\n'
      + 'เขียนสรุปเป็น 2 หัวข้อตามรูปแบบข้างต้น แบบอ่านง่าย ความยาวรวมไม่เกิน 200 คำ';
    var user = 'โครงการ: ' + proj.name + (proj.siteOwner ? ' (PM: ' + proj.siteOwner + ')' : '') + '\n'
      + 'วันที่เลือกดู: ' + fd(selDate) + '\n'
      + 'สัปดาห์ปัจจุบัน: ' + fd(wk.startStr) + ' - ' + fd(wk.endStr) + '\n\n'
      + 'รายการที่ทำไปแล้วในวันที่ ' + fd(selDate) + ':\n' + doneLines + '\n\n'
      + 'งานที่ยังไม่เสร็จซึ่งอยู่ในสัปดาห์นี้หรือเลยกำหนดมาแล้ว:\n' + pendingLines;

    // แสดงผลเป็น Popup แยก (m-imt-ai-summary) — เปิดทันทีพร้อมสถานะกำลังโหลด แล้วค่อยเติมผลลัพธ์ทีหลัง ──
    var out = document.getElementById('m-imt-ai-summary-body');
    var foot = document.getElementById('m-imt-ai-summary-foot');
    foot.innerHTML = '';
    out.innerHTML = '<div style="color:var(--txt3);">⏳ กำลังให้ AI สรุปให้...</div>';
    window.openM('m-imt-ai-summary');

    try {
      var text = await window.aiChat(system, user, { maxTokens: 700, temperature: 0.3 });
      // กันเหนียว เผื่อโมเดลยังใส่ markdown มาแม้สั่งห้ามแล้ว (LINE แสดงเป็นดอกจัน/สัญลักษณ์ดิบ ไม่ใช่ตัวหนา)
      text = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^-\s+/gm, '▪️ ');
      out.innerHTML = '<div>' + esc(text).replace(/\n/g,'<br>') + '</div>';
      out.dataset.raw = text;
      foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-ai-summary\')">ปิด</button>'
        + '<button class="btn btn-teal" onclick="window.imtCopyAiSummary()">📋 คัดลอกส่ง LINE</button>';
    } catch (e) {
      out.innerHTML = '<div style="color:var(--coral);">' + esc(String(e.message || e)) + '</div>';
      foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-ai-summary\')">ปิด</button>'
        + '<button class="btn btn-pri" onclick="window.imtGenerateAiWeekSummary()">🔁 ลองใหม่</button>';
    }
  };

  window.imtCopyAiSummary = function () {
    var out = document.getElementById('m-imt-ai-summary-body');
    var text = out && out.dataset ? out.dataset.raw : '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      window.showAlert && window.showAlert('คัดลอกแล้ว พร้อมวางส่ง LINE', 'success');
    });
  };

  // ================================================================
  // AI สรุปผู้แก้ไข → บทความ Blog — เลือกผู้แก้ไข (หรือทุกคน) + ช่วงวันที่แก้ไข แล้วให้ AI เรียบเรียง
  // ว่าแต่ละคนแก้ปัญหาอะไรไปบ้าง · ใช้เฉพาะปัญหาที่มีผู้แก้ไข (fixedById) · ตัวเลขโค้ดนับเอง AI แค่เรียบเรียง
  // ทุกคน = เรียก AI ทีละคน (ข้อมูลต่อคนไม่ยาวเกินโมเดลรับไหว) แล้วต่อผลเป็นบทความเดียว ──
  function imtFixerIssues(pid, from, to) {
    return imtIssuesOfProject(pid).filter(function (i) {
      if (!i.fixedById) return false;
      var d = i.fixedDate || imtLocalDateStr(i.createdAt);
      return (!from || d >= from) && (!to || d <= to);
    });
  }
  window.openImtFixerBlogModal = function () {
    var pid = window.imtCurrentProjectId;
    if (!imtProject(pid)) return;
    var counts = {};
    imtFixerIssues(pid).forEach(function (i) { counts[i.fixedById] = (counts[i.fixedById] || 0) + 1; });
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var body = document.getElementById('m-imt-fixer-blog-body');
    var foot = document.getElementById('m-imt-fixer-blog-foot');
    if (!ids.length) {
      body.innerHTML = '<div style="color:var(--txt3);">ยังไม่มีปัญหาที่บันทึก "ผู้แก้ไข" ไว้ในโครงการนี้</div>';
      foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-fixer-blog\')">ปิด</button>';
      window.openM('m-imt-fixer-blog');
      return;
    }
    var today = new Date(), weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    body.innerHTML =
      '<div class="f-group"><label class="f-label">ผู้แก้ไข</label><select class="f-input" id="ifb-fixer" onchange="window.imtFixerBlogDays()">'
      +   '<option value="">ทุกคน (แยกหัวข้อตามผู้แก้ไข) — ' + ids.length + ' คน</option>'
      +   ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(window.staffNameByRef(id) || '(ไม่พบชื่อ)') + ' — ' + counts[id] + ' เรื่อง</option>'; }).join('')
      + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +   '<div class="f-group"><label class="f-label">แก้ไขตั้งแต่วันที่</label><input type="date" class="f-input" id="ifb-from" value="' + imtLocalDateStr(weekAgo) + '" onchange="window.imtFixerBlogDays()"></div>'
      +   '<div class="f-group"><label class="f-label">ถึงวันที่</label><input type="date" class="f-input" id="ifb-to" value="' + imtLocalDateStr(today) + '" onchange="window.imtFixerBlogDays()"></div>'
      + '</div>'
      + '<div style="color:var(--txt3);font-size:12px;">เว้นวันที่ว่าง = ทุกช่วงเวลา</div>'
      + '<div id="ifb-days"></div>'
      + '<div id="ifb-out" style="margin-top:14px;"></div>';
    foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-fixer-blog\')">ปิด</button>'
      + '<button class="btn btn-ghost" id="ifb-copy" style="display:none;" onclick="window.imtCopyFixerBlog()">📋 คัดลอกบทความ</button>'
      + '<button class="btn btn-pri" id="ifb-run" onclick="window.imtRunFixerBlog()">✍️ ให้ AI สรุป</button>';
    window.openM('m-imt-fixer-blog');
    window.imtFixerBlogDays();
  };
  // ── วันที่มีการแก้ไข (ตามผู้แก้ไขที่เลือก) เป็นปุ่มให้กด — ไม่ต้องเดาวันเอง · กด = เลือกวันนั้นวันเดียว
  // วันที่อยู่ในช่วงที่เลือกไว้จะถูกไฮไลต์ + บอกจำนวนเรื่องในช่วง ──
  window.imtFixerBlogDays = function () {
    var box = document.getElementById('ifb-days');
    if (!box) return;
    var fixer = document.getElementById('ifb-fixer').value;
    var from = document.getElementById('ifb-from').value, to = document.getElementById('ifb-to').value;
    var days = {};
    imtFixerIssues(window.imtCurrentProjectId).forEach(function (i) {
      if (fixer && i.fixedById !== fixer) return;
      var d = i.fixedDate || imtLocalDateStr(i.createdAt);
      if (d) days[d] = (days[d] || 0) + 1;
    });
    var keys = Object.keys(days).sort().reverse();
    var inRange = 0;
    var chips = keys.map(function (d) {
      var on = (!from || d >= from) && (!to || d <= to);
      if (on) inRange += days[d];
      var label = new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
      return '<button type="button" class="ifb-day' + (on ? ' on' : '') + '" onclick="window.imtFixerBlogPickDay(\'' + d + '\')">'
        + esc(label) + ' <b>' + days[d] + '</b></button>';
    }).join('');
    box.innerHTML = '<div class="ifb-days-head">วันที่มีการแก้ไข (' + keys.length + ' วัน) · ในช่วงที่เลือก <b>' + inRange + '</b> เรื่อง'
      + ' <a href="javascript:void(0)" onclick="window.imtFixerBlogPickDay(\'\')">ทุกวัน</a></div>'
      + '<div class="ifb-days">' + (chips || '<span style="color:var(--txt3);">—</span>') + '</div>';
  };
  window.imtFixerBlogPickDay = function (d) {
    document.getElementById('ifb-from').value = d;
    document.getElementById('ifb-to').value = d;
    window.imtFixerBlogDays();
  };

  // ── ส่งให้ AI เกลาข้อความทีละชุด (20 เรื่อง) กันคำตอบ JSON ยาวจนถูกตัด · คืน [{problem, solution}] ตามลำดับเดิม
  // ข้อไหน AI ตอบไม่ครบ → ใช้ข้อความเดิมที่บันทึกไว้แทน (ไม่ให้เรื่องหายจากรายงาน) ──
  var IMT_FIXER_BLOG_SYS = 'คุณเป็นผู้ช่วยเรียบเรียงรายการปัญหาที่แก้ไขแล้วของทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล เพื่อนำไปลง Blog '
    + 'เกลาข้อความ "ปัญหา" และ "วิธีการแก้ไข" ของแต่ละข้อให้เป็นภาษาไทยที่กระชับ อ่านง่าย 1 ประโยค ไม่ต้องขึ้นต้นด้วยคำว่าปัญหา/วิธีแก้ '
    + 'คงความหมายเดิม ห้ามแต่งเพิ่ม ตัดชื่อบุคคล/ข้อมูลส่วนบุคคลออก ถ้าไม่มีวิธีแก้ให้ตอบ "-"\n'
    + 'ตอบ JSON เท่านั้น ครบทุกข้อตามลำดับ: {"items":[{"no":1,"problem":"...","solution":"..."}]}';
  var _cutTxt = function (s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  async function imtFixerBlogPolish(list) {
    var out = [];
    for (var s = 0; s < list.length; s += 20) {
      var chunk = list.slice(s, s + 20), got = {};
      var user = chunk.map(function (i, k) {
        return (k + 1) + '. ปัญหา: ' + _cutTxt(i.problem, 300) + '\n   วิธีแก้: ' + (_cutTxt(i.solution, 300) || '-');
      }).join('\n');
      var res = await window.aiChatJson(IMT_FIXER_BLOG_SYS, user, { maxTokens: 2500, temperature: 0.2 });
      (res.items || []).forEach(function (x) { if (x && x.no) got[x.no] = x; });
      chunk.forEach(function (i, k) {
        var a = got[k + 1] || {};
        out.push({ problem: String(a.problem || '').trim() || _cutTxt(i.problem, 300), solution: String(a.solution || '').trim() || _cutTxt(i.solution, 300) || '-' });
      });
    }
    return out;
  }
  // ── AI เขียนย่อหน้าสรุปงานของผู้แก้ไข 1 คน (ภาพรวมว่าแก้อะไรไปบ้าง) จากรายการที่เกลาแล้ว · ตัวเลขโค้ดนับให้ AI ห้ามนับเอง
  // AI ล้ม → ไม่มีย่อหน้าสรุป แต่รายการปัญหา/วิธีแก้ยังออกครบ ──
  var IMT_FIXER_SUMMARY_SYS = 'คุณเป็นผู้ช่วยเขียนสรุปผลงานของเจ้าหน้าที่ทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล เพื่อนำไปลง Blog '
    + 'เขียนย่อหน้าสรุปงานภาษาไทย 2-4 ประโยค ในมุมมองบุคคลที่สาม ว่าแก้ไขปัญหาด้านใดไปบ้าง เน้นภาพรวมและกลุ่มงานหลัก '
    + 'ใช้ตัวเลขตามที่ให้มาเท่านั้น ห้ามแต่งเพิ่ม ไม่ต้องไล่ทุกข้อ ไม่ต้องขึ้นต้นด้วยชื่อหัวข้อ\n'
    + 'ตอบ JSON เท่านั้น: {"summary":"..."}';
  async function imtFixerBlogSummary(name, list, polished, period) {
    var cats = {};
    list.forEach(function (i) { var c = i.category || 'อื่น ๆ'; cats[c] = (cats[c] || 0) + 1; });
    var user = 'ผู้แก้ไข: ' + name + '\nช่วงเวลา: ' + period + '\nจำนวนที่แก้ไข: ' + list.length + ' เรื่อง\n'
      + 'แยกกลุ่ม: ' + Object.keys(cats).map(function (c) { return c + ' ' + cats[c] + ' เรื่อง'; }).join(', ') + '\n'
      + 'ปัญหาที่แก้:\n' + polished.slice(0, 40).map(function (x, k) { return (k + 1) + '. ' + _cutTxt(x.problem, 120); }).join('\n');
    try {
      var res = await window.aiChatJson(IMT_FIXER_SUMMARY_SYS, user, { maxTokens: 800, temperature: 0.3 });
      return String(res.summary || '').trim();
    } catch (e) { return ''; }
  }
  // ── จัดรูปแบบ: ชื่อกลุ่มปัญหา แล้วตามด้วย "ปัญหา : / วิธีการแก้ไข :" ย่อหน้าเข้า 3 ช่อง · กลุ่มที่มีหลายเรื่องขึ้นก่อน ──
  function imtFixerBlogFormat(list, polished) {
    var cats = {}, order = [];
    list.forEach(function (i, k) {
      var c = i.category || 'อื่น ๆ';
      if (!cats[c]) { cats[c] = []; order.push(c); }
      cats[c].push(polished[k]);
    });
    order.sort(function (a, b) { return cats[b].length - cats[a].length; });
    return order.map(function (c) {
      return c + '\n' + cats[c].map(function (x) { return '   ปัญหา : ' + x.problem + '\n   วิธีการแก้ไข : ' + x.solution; }).join('\n\n');
    }).join('\n\n');
  }

  var _imtFixerBlog = null; // { text } ผลล่าสุด สำหรับคัดลอก
  window.imtRunFixerBlog = async function () {
    var pid = window.imtCurrentProjectId, proj = imtProject(pid);
    var out = document.getElementById('ifb-out'), runBtn = document.getElementById('ifb-run'), copyBtn = document.getElementById('ifb-copy');
    if (!proj || !out || runBtn.disabled) return;
    var fixer = document.getElementById('ifb-fixer').value;
    var from = document.getElementById('ifb-from').value, to = document.getElementById('ifb-to').value;
    var all = imtFixerIssues(pid, from, to);
    var groups = {};
    all.forEach(function (i) { (groups[i.fixedById] = groups[i.fixedById] || []).push(i); });
    var ids = fixer ? (groups[fixer] ? [fixer] : []) : Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    if (!ids.length) { out.innerHTML = '<div style="color:var(--coral);">ไม่มีปัญหาที่แก้ไขในช่วงวันที่เลือก</div>'; return; }

    var thd = function (d) { return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); };
    var period = from && to ? (from === to ? thd(from) : thd(from) + ' – ' + thd(to)) : from ? 'ตั้งแต่ ' + thd(from) : to ? 'ถึง ' + thd(to) : 'ทุกช่วงเวลา';
    runBtn.disabled = true; copyBtn.style.display = 'none';
    var parts = [];
    var render = function (note) {
      out.innerHTML = '<div class="ai-card"><div style="white-space:pre-wrap;font-size:13px;line-height:1.7;">' + esc(parts.join('\n\n\n')) + '</div>'
        + (note ? '<div style="color:var(--txt3);font-size:12.5px;margin-top:8px;">' + note + '</div>' : '') + '</div>';
    };
    try {
      for (var k = 0; k < ids.length; k++) {
        var list = groups[ids[k]], name = window.staffNameByRef(ids[k]) || '-';
        render('⏳ AI กำลังสรุปของ ' + esc(name) + (ids.length > 1 ? ' (' + (k + 1) + '/' + ids.length + ')' : '') + '…');
        var polished = await imtFixerBlogPolish(list);
        var summary = await imtFixerBlogSummary(name, list, polished, period);
        // ขึ้นชื่อผู้แก้ไข + ย่อหน้าสรุปงาน นำแต่ละช่วงเสมอ ให้รู้ว่าเป็นผลงานของใคร
        parts.push('👤 ' + name + ' — แก้ไข ' + list.length + ' เรื่อง (' + period + ')\n\n'
          + (summary ? summary + '\n\n' : '') + imtFixerBlogFormat(list, polished));
      }
      render('* เรียบเรียงโดย AI จากข้อมูลในระบบ — ตรวจสอบก่อนเผยแพร่');
      _imtFixerBlog = { text: parts.join('\n\n\n') };
      copyBtn.style.display = '';
      runBtn.textContent = '🔁 สรุปใหม่';
    } catch (e) {
      render('');
      out.insertAdjacentHTML('beforeend', '<div style="color:var(--coral);margin-top:8px;">' + esc(String(e.message || e)) + '</div>');
      if (parts.length) { _imtFixerBlog = { text: parts.join('\n\n\n') }; copyBtn.style.display = ''; }
    }
    runBtn.disabled = false;
  };
  window.imtCopyFixerBlog = function () {
    if (!_imtFixerBlog || !navigator.clipboard) return;
    navigator.clipboard.writeText(_imtFixerBlog.text).then(function () { window.showAlert && window.showAlert('คัดลอกแล้ว', 'success'); });
  };

  // ================================================================
  // TEMPLATE MANAGEMENT — สร้าง/แก้ไข Checklist Template (Phase → Task)
  // ใช้ตอนสร้างโครงการใหม่ (Apply Template) หรือ "บันทึกเป็น Template" จากโครงการที่มีอยู่
  // ================================================================
  window.renderImtTemplates = function () { renderImtTemplates(document.getElementById('imt-content')); };
  function renderImtTemplates(mount) {
    var toolbar = '<div class="toolbar"><div style="flex:1"></div>'
      + (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-pri btn-sm" onclick="window.openImtTemplateModal(null)">+ สร้าง Template</button>' : '') + '</div>';
    var cards = window.IMPL_TEMPLATES.map(function (t) {
      var phaseCount = (t.structure && t.structure.phases) ? t.structure.phases.length : 0;
      var taskCount = (t.structure && t.structure.phases) ? t.structure.phases.reduce(function (s,p) { return s + (p.tasks||[]).length; }, 0) : 0;
      return '<div class="imt-pcard" onclick="window.openImtTemplateModal(\''+t.id+'\')">'
        + '<div class="imt-pcard-title">'+esc(t.name)+'</div>'
        + '<div class="imt-pcard-sub">'+esc(t.description||'-')+'</div>'
        + '<div class="imt-pcard-meta"><span>'+phaseCount+' Phase</span><span>'+taskCount+' Task</span></div>'
        + (window.canDel(window.IMPL_MODULE) ? '<button class="btn btn-red btn-sm" style="margin-top:8px;" onclick="event.stopPropagation();window.askDel(\'imt_template\',\''+t.id+'\',\''+esc(t.name)+'\')">ลบ</button>' : '')
        + '</div>';
    }).join('') || '<div style="padding:40px;text-align:center;color:var(--txt3);">ยังไม่มี Template — กด "+ สร้าง Template" หรือเปิดโครงการแล้วกด "บันทึกเป็น Template"</div>';
    mount.innerHTML = toolbar + '<div class="imt-pgrid">'+cards+'</div>';
  }

  // Task ใน Template draft เก็บเป็น {name, days, checklist} เสมอ (days=null = ให้ระบบประเมินอัตโนมัติจากชื่องาน,
  // checklist=[] = ยังไม่กำหนด จะใช้ชื่อ Task เป็นรายการ Checklist เดียวตอน apply เหมือนเดิม)
  // — normalize รองรับ Template เก่าที่เคยเก็บเป็น string ล้วน หรือ {name,days} ที่ยังไม่มี checklist
  function _imtTplNormTask(tk) { return typeof tk === 'string' ? { name:tk, days:null, checklist:[] } : { name:(tk&&tk.name)||'', days:(tk&&tk.days)||null, checklist:(tk&&tk.checklist)||[] }; }

  window.openImtTemplateModal = function (id) {
    window.imtEditTemplateId = id;
    var tpl = id ? window.IMPL_TEMPLATES.find(function (x) { return x.id === id; }) : null;
    if (tpl) {
      window.imtTplDraft = {
        name: tpl.name, description: tpl.description,
        phases: ((tpl.structure && tpl.structure.phases) || []).map(function (p) { return { name:p.phase_name, tasks:(p.tasks||[]).map(_imtTplNormTask) }; }),
      };
    } else {
      window.imtTplDraft = { name:'', description:'', phases:[{ name:'', tasks:[{ name:'', days:null, checklist:[] }] }] };
    }
    document.getElementById('m-imt-template-title').textContent = id ? 'แก้ไข Template' : 'สร้าง Template ใหม่';
    renderTplBuilderBody();
    window.openM('m-imt-template');
  };

  // ── สร้าง Template จากโครงสร้าง Phase/Task ของโครงการที่มีอยู่แล้ว (ไม่ต้องพิมพ์ใหม่)
  // ถ้า Task มีวันเริ่ม/วันแล้วเสร็จอยู่แล้ว ใช้ระยะเวลาที่เกิดขึ้นจริงเป็นค่า "จำนวนวัน" เลย (แม่นกว่าให้เดาใหม่) ──
  window.imtSaveProjectAsTemplate = function (pid) {
    var proj = imtProject(pid);
    if (!proj) return;
    var phases = imtPhasesOf(pid);
    window.imtEditTemplateId = null;
    window.imtTplDraft = {
      name: proj.name + ' (Template)',
      description: 'สร้างจากโครงการ "'+proj.name+'"',
      phases: phases.map(function (ph) {
        return { name:ph.name, tasks: imtTasksOfPhase(ph.id).map(function (t) {
          var days = null;
          if (t.start && t.due) { var n = Math.round((pd(t.due) - pd(t.start)) / 86400000) + 1; days = n > 0 ? n : null; }
          var ck = imtChecklistOf(t.id).map(function (c) { return c.name; });
          return { name:t.name, days:days, checklist:ck };
        }) };
      }),
    };
    document.getElementById('m-imt-template-title').textContent = 'บันทึกเป็น Template ใหม่';
    renderTplBuilderBody();
    window.openM('m-imt-template');
  };

  function renderTplBuilderBody() {
    var d = window.imtTplDraft;
    var body = document.getElementById('m-imt-template-body');
    var phasesHtml = d.phases.map(function (ph, pi) {
      var tasksHtml = ph.tasks.map(function (tk, ti) {
        var guess = window.imtEstimateTaskWeight(tk.name);
        var ckList = tk.checklist || [];
        // ── สถานะพับ/ขยาย: ถ้ายังไม่เคยกดเปิด/ปิดเองในรอบนี้ (undefined) ให้ default ตามว่ามีรายการอยู่แล้วหรือไม่
        // กันปัญหา Checklist ที่มีอยู่แล้ว (เช่นจาก "บันทึกเป็น Template") ถูกซ่อนไว้จนดูเหมือนหายไป ──
        var ckKey = '_imtTplCkOpen_'+pi+'_'+ti;
        var ckOpen = window[ckKey] !== undefined ? window[ckKey] === true : ckList.length > 0;
        var ckRows = ckList.map(function (ckName, ci) {
          return '<div class="imt-tpl-ckrow"><span class="imt-tpl-ckdot">☑</span><input class="f-input" value="'+esc(ckName)+'" placeholder="รายการ Checklist" oninput="window.imtTplUpdateChecklistItem('+pi+','+ti+','+ci+',this.value)">'
            + '<button class="m-x" onclick="window.imtTplRemoveChecklistItem('+pi+','+ti+','+ci+')">✕</button></div>';
        }).join('');
        var ckToggleLabel = ckList.length ? ('☑ Checklist ('+ckList.length+')') : '+ เพิ่ม Checklist';
        var ckBlock = ckOpen
          ? '<div class="imt-tpl-cklist">' + ckRows
            + '<div class="imt-tpl-ckrow imt-tpl-ckadd"><input class="f-input" id="imt-tpl-ckinput-'+pi+'-'+ti+'" placeholder="พิมพ์รายการแล้วกด Enter..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.imtTplAddChecklistItem('+pi+','+ti+');}"><button class="btn btn-ghost btn-sm" onclick="window.imtTplAddChecklistItem('+pi+','+ti+')">+ เพิ่ม</button></div>'
            + '</div>'
          : '';
        // ── ลากสลับลำดับ Task แทนปุ่ม ▲▼ เดิม — drag handle อยู่ที่ตัวแถว .m-row เท่านั้น (ไม่รวม
        // ckBlock ด้านล่างที่มี input ของตัวเอง กันชนกับการลากเลือกข้อความในช่อง Checklist) ──
        var taskDragAttrs = ' draggable="true" ondragstart="window.imtTplTaskDragStart(event,'+pi+','+ti+')" ondragover="window.imtTplTaskDragOver(event)" ondragleave="window.imtTplTaskDragLeave(event)" ondrop="window.imtTplTaskDrop(event,'+pi+','+ti+')" ondragend="window.imtTplTaskDragEnd()"';
        return '<div class="imt-tpltask" id="imt-tpltask-'+pi+'-'+ti+'">'
          + '<div class="m-row" style="margin-bottom:0;"'+taskDragAttrs+'><span class="imt-tpl-draghandle" title="ลากเพื่อสลับลำดับ Task">⠿</span><input class="f-input" style="flex:1;" value="'+esc(tk.name)+'" placeholder="ชื่อ Task" oninput="window.imtTplUpdateTask('+pi+','+ti+',this.value)">'
          +   '<input type="number" min="0.5" step="0.5" class="f-input imt-tpl-days" value="'+(tk.days!=null?esc(String(tk.days)):'')+'" placeholder="~'+guess+'ว." title="จำนวนวันโดยประมาณ (เว้นว่าง = ให้ระบบประเมินอัตโนมัติจากชื่องาน)" oninput="window.imtTplUpdateTaskDays('+pi+','+ti+',this.value)">'
          +   '<button class="btn btn-ghost btn-sm" style="white-space:nowrap;" onclick="window.imtTplToggleChecklist('+pi+','+ti+')">'+ckToggleLabel+'</button>'
          +   '<button class="m-x" onclick="window.imtTplRemoveTask('+pi+','+ti+')">✕</button></div>'
          + ckBlock
          + '</div>';
      }).join('');
      // ── ลากสลับลำดับ Phase แทนปุ่ม ▲▼ เดิม ──
      var phaseDragAttrs = ' draggable="true" ondragstart="window.imtTplPhaseDragStart(event,'+pi+')" ondragover="window.imtTplPhaseDragOver(event)" ondragleave="window.imtTplPhaseDragLeave(event)" ondrop="window.imtTplPhaseDrop(event,'+pi+')" ondragend="window.imtTplPhaseDragEnd()"';
      return '<div class="imt-tplphase" id="imt-tplphase-'+pi+'">'
        + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"'+phaseDragAttrs+'><span class="imt-tpl-draghandle" title="ลากเพื่อสลับลำดับ Phase">⠿</span>'
        +   '<span class="imt-phase-num">Phase '+(pi+1)+'</span>'
        +   '<input class="f-input" style="flex:1;font-weight:700;" value="'+esc(ph.name)+'" placeholder="ชื่อ Phase" oninput="window.imtTplUpdatePhaseName('+pi+',this.value)">'
        +   '<button class="btn btn-red btn-sm" onclick="window.imtTplRemovePhase('+pi+')">ลบ Phase</button>'
        + '</div>'
        + tasksHtml
        + '<button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="window.imtTplAddTask('+pi+')">+ เพิ่ม Task</button>'
        + '</div>';
    }).join('');

    body.innerHTML =
      '<div class="f-group"><label class="f-label">ชื่อ Template *</label><input class="f-input" id="imt-tpl-name" value="'+esc(d.name)+'" oninput="window.imtTplDraft.name=this.value"></div>'
      + '<div class="f-group"><label class="f-label">รายละเอียด</label><textarea class="f-input" id="imt-tpl-desc" oninput="window.imtTplDraft.description=this.value">'+esc(d.description)+'</textarea></div>'
      + '<div class="sec-head"><div class="sec-label">โครงสร้าง Phase / Task</div><button class="btn btn-ghost btn-sm" onclick="window.imtTplAddPhase()">+ เพิ่ม Phase</button></div>'
      + '<div style="font-size:11px;color:var(--txt3);margin:-2px 0 10px;">ช่อง "จำนวนวัน" ไม่บังคับกรอก — เว้นว่างไว้ ระบบจะประเมินให้เองจากชื่องาน (เช่น "ติดตั้ง/ทดสอบ" ใช้เวลามากกว่า "เซ็นเอกสาร/ส่งมอบ") ตอนสร้างโครงการจาก Template นี้'
        + '<br>กด "+ เพิ่ม Checklist" ที่ Task เพื่อกำหนดรายการ Checklist ย่อยไว้ล่วงหน้า — ถ้าไม่กำหนด ระบบจะสร้าง Checklist 1 รายการชื่อเดียวกับ Task ให้อัตโนมัติเหมือนเดิม</div>'
      + phasesHtml;
  }

  // หลังเพิ่ม Phase/Task ใหม่ ต้อง scroll+focus ให้เห็นทันที เพราะ modal body ยาวมาก
  // (template ต้นแบบมี 7 phase / 47 task) ไม่งั้นรายการใหม่จะถูกเพิ่มไปอยู่ล่างสุดแบบมองไม่เห็น
  function _imtTplScrollFocus(elId, inputSelector) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    var input = inputSelector ? el.querySelector(inputSelector) : el.querySelector('input');
    if (input) setTimeout(function () { input.focus(); }, 300);
  }

  window.imtTplAddPhase = function () {
    window.imtTplDraft.phases.push({ name:'', tasks:[{ name:'', days:null, checklist:[] }] });
    var newIdx = window.imtTplDraft.phases.length - 1;
    renderTplBuilderBody();
    _imtTplScrollFocus('imt-tplphase-'+newIdx);
  };
  window.imtTplRemovePhase = function (pi) { window.imtTplDraft.phases.splice(pi,1); renderTplBuilderBody(); };
  window.imtTplAddTask = function (pi) {
    window.imtTplDraft.phases[pi].tasks.push({ name:'', days:null, checklist:[] });
    var newTi = window.imtTplDraft.phases[pi].tasks.length - 1;
    renderTplBuilderBody();
    _imtTplScrollFocus('imt-tpltask-'+pi+'-'+newTi);
  };
  window.imtTplRemoveTask  = function (pi, ti) { window.imtTplDraft.phases[pi].tasks.splice(ti,1); renderTplBuilderBody(); };
  window.imtTplUpdatePhaseName = function (pi, v) { window.imtTplDraft.phases[pi].name = v; };
  window.imtTplUpdateTask      = function (pi, ti, v) { window.imtTplDraft.phases[pi].tasks[ti].name = v; };
  window.imtTplUpdateTaskDays  = function (pi, ti, v) { window.imtTplDraft.phases[pi].tasks[ti].days = v ? Number(v) : null; };

  // ── ลากสลับลำดับ Phase ใน Template Builder (แก้ array ใน draft ตรง ๆ ไม่ต้องรอบันทึกก็เห็นผลทันที) ──
  window.imtTplPhaseDragStart = function (ev, pi) {
    window.imtTplDragPhaseIdx = pi;
    ev.dataTransfer.effectAllowed = 'move';
  };
  window.imtTplPhaseDragOver = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('imt-tplphase-dragover');
  };
  window.imtTplPhaseDragLeave = function (ev) {
    ev.currentTarget.classList.remove('imt-tplphase-dragover');
  };
  window.imtTplPhaseDragEnd = function () {
    document.querySelectorAll('.imt-tplphase-dragover').forEach(function (el) { el.classList.remove('imt-tplphase-dragover'); });
  };
  window.imtTplPhaseDrop = function (ev, targetPi) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('imt-tplphase-dragover');
    var fromPi = window.imtTplDragPhaseIdx;
    window.imtTplDragPhaseIdx = null;
    if (fromPi == null || fromPi === targetPi) return;
    var phases = window.imtTplDraft.phases;
    var targetRef = phases[targetPi];
    var moved = phases.splice(fromPi, 1)[0];
    phases.splice(phases.indexOf(targetRef), 0, moved);
    renderTplBuilderBody();
  };

  // ── ลากสลับลำดับ Task ใน Template Builder (จำกัดแค่ภายใน Phase เดียวกัน) ──
  window.imtTplTaskDragStart = function (ev, pi, ti) {
    window.imtTplDragTaskPi = pi;
    window.imtTplDragTaskTi = ti;
    ev.dataTransfer.effectAllowed = 'move';
  };
  window.imtTplTaskDragOver = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('imt-tpltask-dragover');
  };
  window.imtTplTaskDragLeave = function (ev) {
    ev.currentTarget.classList.remove('imt-tpltask-dragover');
  };
  window.imtTplTaskDragEnd = function () {
    document.querySelectorAll('.imt-tpltask-dragover').forEach(function (el) { el.classList.remove('imt-tpltask-dragover'); });
  };
  window.imtTplTaskDrop = function (ev, targetPi, targetTi) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('imt-tpltask-dragover');
    var fromPi = window.imtTplDragTaskPi, fromTi = window.imtTplDragTaskTi;
    window.imtTplDragTaskPi = null; window.imtTplDragTaskTi = null;
    if (fromPi == null || fromTi == null) return;
    if (fromPi !== targetPi || fromTi === targetTi) return;
    var tasks = window.imtTplDraft.phases[fromPi].tasks;
    var targetRef = tasks[targetTi];
    var moved = tasks.splice(fromTi, 1)[0];
    tasks.splice(tasks.indexOf(targetRef), 0, moved);
    renderTplBuilderBody();
  };

  // ── Checklist ย่อยของแต่ละ Task ใน Template (พับ/ขยายทีละ Task กันรกตอนมีหลาย Task) ──
  window.imtTplToggleChecklist = function (pi, ti) {
    var key = '_imtTplCkOpen_'+pi+'_'+ti;
    window[key] = window[key] !== true;
    renderTplBuilderBody();
    if (window[key]) _imtTplScrollFocus('imt-tpltask-'+pi+'-'+ti, '#imt-tpl-ckinput-'+pi+'-'+ti);
  };
  window.imtTplAddChecklistItem = function (pi, ti) {
    var input = document.getElementById('imt-tpl-ckinput-'+pi+'-'+ti);
    var v = input ? input.value.trim() : '';
    if (!v) return;
    var tk = window.imtTplDraft.phases[pi].tasks[ti];
    if (!tk.checklist) tk.checklist = [];
    tk.checklist.push(v);
    window['_imtTplCkOpen_'+pi+'_'+ti] = true;
    renderTplBuilderBody();
    _imtTplScrollFocus('imt-tpltask-'+pi+'-'+ti, '#imt-tpl-ckinput-'+pi+'-'+ti);
  };
  window.imtTplRemoveChecklistItem = function (pi, ti, ci) {
    window.imtTplDraft.phases[pi].tasks[ti].checklist.splice(ci,1);
    renderTplBuilderBody();
  };
  window.imtTplUpdateChecklistItem = function (pi, ti, ci, v) { window.imtTplDraft.phases[pi].tasks[ti].checklist[ci] = v; };

  window.saveImtTemplate = async function () {
    var d = window.imtTplDraft;
    var name = (d.name||'').trim();
    if (!name) { window.showAlert && window.showAlert('กรุณาระบุชื่อ Template', 'error'); return; }
    var phases = d.phases.map(function (p, i) {
      return { phase_name: (p.name||'').trim() || ('Phase '+(i+1)), sort_order: i+1,
        tasks: p.tasks.map(function (t) {
          return { name:(t.name||'').trim(), days:t.days||null,
            checklist:(t.checklist||[]).map(function (c) { return (c||'').trim(); }).filter(Boolean) };
        }).filter(function (t) { return t.name; }) };
    }).filter(function (p) { return p.tasks.length; });
    if (!phases.length) { window.showAlert && window.showAlert('กรุณาเพิ่มอย่างน้อย 1 Phase ที่มี Task', 'error'); return; }
    var id = window.imtEditTemplateId || window.imtUid('ITPL');
    var row = { template_name: name, description: (d.description||'').trim(), structure: { phases: phases } };
    window.closeM('m-imt-template');
    window.imtApplyLocal('IMPL_TEMPLATES', id, row);
    await window.setDoc(window.getDocRef('IMPL_TEMPLATES', id), row);
    window.renderImplTracker();
  };

  // ══════════════════════════════════════════════════════════════════════
  // นำเข้าปัญหาการใช้งานเก่าจากระบบเดิม (Excel) — เรียกจากปุ่ม "นำเข้า" กลาง (modals.js execImport)
  // 1 ไฟล์ = 1 โครงการ (เลือกโครงการปลายทางในหน้าพรีวิวก่อนกดนำเข้าจริง) ใช้ pattern เดียวกับ
  // hdImportFromFile ใน helpdesk.js (อ่าน Excel → จับคู่คอลัมน์ด้วย synonym → พรีวิว → ยืนยันแล้วค่อยเขียนจริง)
  // ══════════════════════════════════════════════════════════════════════
  // ── ทั้ง 2 ไฟล์นี้โหลดแบบ <script type="module"> คนละโมดูล ไม่แชร์ scope กัน (ต่างจาก classic
  // script ที่ function ระดับบนสุดจะกลาย เป็น global อัตโนมัติ) — hdNorm/hdParseDate ใน helpdesk.js
  // จึงเรียกจากที่นี่ไม่ได้ ต้องมีสำเนาของตัวเองแยกต่างหาก (เจอบั๊กนี้จริงตอนทดสอบ) ──
  function imtNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s._-]/g, '').trim(); }
  function imtParseDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 10000) {
      var d0 = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d0)) return d0.toISOString();
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (m) {
      var yy = Number(m[3]); if (yy >= 2500) yy -= 543;
      var d1 = new Date(yy, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
      return isNaN(d1) ? '' : d1.toISOString();
    }
    var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m2) {
      var y2 = Number(m2[1]); if (y2 >= 2500) y2 -= 543;
      var d2 = new Date(y2, Number(m2[2]) - 1, Number(m2[3]), Number(m2[4] || 0), Number(m2[5] || 0));
      return isNaN(d2) ? '' : d2.toISOString();
    }
    var d3 = new Date(s);
    return isNaN(d3) ? '' : d3.toISOString();
  }

  var IMT_ISSUE_IMPORT_COLS = [
    { key: 'created_at',  syn: ['created_at', 'date', 'วันที่แจ้ง', 'วันที่', 'วันแจ้ง'] },
    { key: 'department',  syn: ['department', 'dept', 'หน่วยงาน', 'แผนก'] },
    { key: 'reported_by', syn: ['reported_by', 'reporter', 'ผู้แจ้ง', 'ชื่อผู้แจ้ง'] },
    { key: 'problem',     syn: ['problem', 'description', 'detail', 'ปัญหา', 'รายละเอียด', 'รายละเอียดปัญหา'], req: true },
    { key: 'category',    syn: ['category', 'หมวด', 'ประเภท', 'หมวดปัญหา', 'กลุ่มปัญหา'] },
    { key: 'severity',    syn: ['severity', 'ความรุนแรง'] },
    { key: 'status',      syn: ['status', 'สถานะ'] },
    { key: 'solution',    syn: ['solution', 'fix', 'วิธีแก้ไข', 'วิธีแก้', 'การแก้ไข', 'แนวทางแก้ไข'] },
    { key: 'received_by', syn: ['received_by', 'ผู้รับเรื่อง', 'ผู้รับแจ้ง'] },
    { key: 'fixed_by',    syn: ['fixed_by', 'resolved_by', 'ผู้แก้ไข', 'คนแก้ไข', 'ผู้ดำเนินการ'] },
    { key: 'fixed_date',  syn: ['fixed_date', 'resolved_at', 'closed_at', 'วันที่แก้ไข', 'วันที่ปิด', 'วันที่เสร็จ'] },
  ];

  function imtNormIssueStatus(v) {
    var q = imtNorm(v);
    var ids = (window.IMPL_ISSUE_STATUS || []).map(function (s) { return s.id; });
    if (ids.indexOf(q) > -1) return q;
    if (/เสร็จ|ปิด|done|resolve|แก้ไขแล้ว|ดำเนินการแล้ว/.test(q)) return 'closed';
    if (/กำลัง|progress|ดำเนินการอยู่/.test(q)) return 'in_progress';
    return 'open';
  }
  function imtNormSeverity(v) {
    var q = imtNorm(v);
    var ids = (window.IMPL_SEVERITY || []).map(function (s) { return s.id; });
    if (ids.indexOf(q) > -1) return q;
    if (/วิกฤต|critical/.test(q)) return 'critical';
    if (/สูง|high/.test(q)) return 'high';
    if (/น้อย|low/.test(q)) return 'low';
    return 'medium';
  }

  // ── "ผู้รับปัญหา/ผู้แก้ไข" ในไฟล์นำเข้าพิมพ์เป็นชื่อเล่นหรือชื่อ-นามสกุลเต็มก็ได้ → แปลงเป็นรหัสพนักงาน
  // หาไม่เจอ → เว้นว่าง และนับไว้แจ้งในสรุปผล (unmatched) ──
  function imtImportStaffId(v, unmatched) {
    var s = String(v || '').trim();
    if (!s) return '';
    var staff = window.staffByRef(s) || window.staffByName(s);
    if (!staff) unmatched.push(s);
    return staff ? staff.id : '';
  }

  function imtIssueImportParse(objs, unmatched) {
    return (objs || []).map(function (o, idx) {
      var rec = {};
      Object.keys(o).forEach(function (k) {
        var nk = imtNorm(k);
        var col = IMT_ISSUE_IMPORT_COLS.find(function (c) { return c.syn.some(function (s) { return imtNorm(s) === nk; }); });
        if (col && rec[col.key] == null) rec[col.key] = o[k];
      });
      var errs = [];
      var problem = String(rec.problem || '').trim();
      if (!problem) errs.push('ไม่มีรายละเอียดปัญหา');
      var createdIso = imtParseDate(rec.created_at) || new Date().toISOString();
      var status = imtNormIssueStatus(rec.status);
      var fixedIso = imtParseDate(rec.fixed_date) || (status === 'closed' ? createdIso : '');
      return {
        row: idx + 2,
        ok: errs.length === 0,
        errs: errs,
        data: {
          department: String(rec.department || '').trim(),
          reportedBy: String(rec.reported_by || '').trim(),
          problem: problem,
          category: String(rec.category || '').trim(),
          severity: imtNormSeverity(rec.severity),
          status: status,
          solution: String(rec.solution || '').trim(),
          receivedById: imtImportStaffId(rec.received_by, unmatched),
          fixedById: imtImportStaffId(rec.fixed_by, unmatched),
          fixedDate: fixedIso ? fixedIso.slice(0, 10) : '',
          createdAt: createdIso,
        },
      };
    });
  }

  window.imtDownloadIssueImportTemplate = async function () {
    if (!(await window.LibLoader.need('xlsx'))) return;
    var headers = ['created_at', 'department', 'reported_by', 'problem', 'category', 'severity', 'status', 'solution', 'received_by', 'fixed_by', 'fixed_date'];
    var example = ['2025-11-20', 'แผนกผู้ป่วยใน', 'คุณสมชาย', 'พิมพ์ใบสั่งยาไม่ออก', 'รายงาน / พิมพ์เอกสาร', 'ปานกลาง', 'ดำเนินการแล้ว', 'ตั้งค่าเครื่องพิมพ์เริ่มต้นใหม่', 'สมหญิง', 'สมหญิง ใจดี', '2025-11-21'];
    var guide = [
      ['คำแนะนำการกรอก'],
      ['problem', 'รายละเอียดปัญหา — จำเป็น'],
      ['status', 'รอดำเนินการ / กำลังดำเนินการ / ดำเนินการแล้ว (เว้นว่าง = รอดำเนินการ)'],
      ['severity', 'น้อย / ปานกลาง / สูง / วิกฤต (เว้นว่าง = ปานกลาง)'],
      ['category', 'ชื่อหมวดปัญหา (ไม่บังคับ)'],
      ['created_at', 'วันที่แจ้งปัญหา'],
      ['fixed_date', 'วันที่แก้ไขเสร็จ (ถ้าสถานะ = ดำเนินการแล้ว แต่ไม่ระบุ จะใช้วันที่แจ้งแทน)'],
      ['received_by / fixed_by', 'ผู้รับปัญหา / ผู้แก้ไข — พิมพ์ชื่อเล่นหรือชื่อ-นามสกุลเต็มก็ได้ ระบบจะจับคู่กับรายชื่อพนักงานให้อัตโนมัติ (ไม่พบ = เว้นว่าง)'],
      ['รูปแบบวันที่', 'YYYY-MM-DD หรือ DD/MM/YYYY (รองรับปี พ.ศ.)'],
      ['หมายเหตุ', '1 ไฟล์ = 1 โครงการ ต้องเลือกโครงการปลายทางก่อนนำเข้า'],
    ];
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([headers, example]), 'issues');
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(guide), 'คำแนะนำ');
    window.XLSX.writeFile(wb, 'Template_IMPL_ISSUES_import.xlsx');
  };

  // ── เรียกตรงจาก modals.js execImport (หน้าแรกของ modal นำเข้ากลาง ไม่ต้องเปิดป๊อบอับซ้อนอีกชั้น) —
  // ประมวลผลไฟล์ + (ถ้าติ๊กไว้) ลบปัญหาเดิมเฉพาะโครงการที่เลือก + เขียนแถวใหม่ ครบในคลิกเดียว
  // สำเร็จครบ → ปิดหน้าต่าง + toast · มีแถวผิด/ข้าม/ไม่พบชื่อ → ค้างหน้าต่างไว้ แสดงรายการแถวที่มีปัญหา ──
  window.imtRunIssueImportInline = async function (file, pid, clearFirst) {
    var alertBox = function (kind, title, items, foot) { window._importAlert && window._importAlert(kind, title, items, foot); };
    if (!(window.canAdd && window.canAdd(window.IMPL_MODULE))) { alertBox('error', 'ไม่มีสิทธิ์นำเข้าปัญหา Impl Tracker'); return; }
    if (!pid) { alertBox('error', 'กรุณาเลือกโครงการปลายทางก่อน'); return; }
    if (!file) { alertBox('error', 'กรุณาเลือกไฟล์ก่อน'); return; }
    window._importProgress && window._importProgress(0, 0, 'กำลังอ่านไฟล์');
    if (!(await window.LibLoader.need('xlsx'))) { alertBox('error', 'โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ', [], 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); return; }
    var proj = imtProject(pid);

    var objs;
    try {
      var buf = await file.arrayBuffer();
      var wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      objs = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
    } catch (err) {
      alertBox('error', 'อ่านไฟล์ไม่ได้', [String(err.message || err)], 'ตรวจว่าเป็นไฟล์ .xlsx / .xls / .csv ที่ไม่เสียหาย และไม่ได้เปิดค้างใน Excel');
      return;
    }
    if (!objs.length) { alertBox('error', 'ไม่พบข้อมูลในไฟล์', [], 'ข้อมูลต้องอยู่ในชีตแรก แถวแรกเป็นหัวคอลัมน์'); return; }
    // ── หัวคอลัมน์ไม่ตรงเลย (เช่น เลือกไฟล์ผิด/ข้อมูลไม่ได้อยู่ชีตแรก) → บอกหัวคอลัมน์ที่เจอให้เทียบ ──
    var heads = Object.keys(objs[0]);
    var probCol = IMT_ISSUE_IMPORT_COLS.find(function (c) { return c.key === 'problem'; });
    if (!heads.some(function (h) { return probCol.syn.some(function (s) { return imtNorm(s) === imtNorm(h); }); })) {
      alertBox('error', 'ไม่พบคอลัมน์ "problem" (รายละเอียดปัญหา) ในชีตแรกของไฟล์',
        ['หัวคอลัมน์ที่พบ: ' + heads.slice(0, 15).join(', ')],
        'ใช้หัวคอลัมน์ตามไฟล์ตัวอย่าง (เปิด "ยังไม่มีไฟล์? ดาวน์โหลดไฟล์ตัวอย่าง" ด้านล่าง)');
      return;
    }
    var unmatched = [];
    var parsed = imtIssueImportParse(objs, unmatched);
    var rows = parsed.filter(function (p) { return p.ok; });
    var badRows = parsed.filter(function (p) { return !p.ok; });
    if (!rows.length) { alertBox('error', 'ไม่มีแถวที่นำเข้าได้เลย — ทุกแถวไม่มีรายละเอียดปัญหา (คอลัมน์ problem ว่าง)'); return; }

    // ── หลอดความคืบหน้า — นับรวมแถวที่ลบก่อนนำเข้าด้วย ──
    var toDelete = clearFirst ? (window.IMPL_ISSUES || []).filter(function (x) { return x.projectId === pid; }) : [];
    var total = toDelete.length + rows.length, step = 0;
    var prog = function (label) { window._importProgress && window._importProgress(step, total, label); };
    var errors = [];
    var errText = function (e) { return String((e && (e.message || e.details || e.hint)) || e || 'ไม่ทราบสาเหตุ'); };

    // ── ลบปัญหาเดิม "เฉพาะของโครงการที่เลือกไว้" ก่อนนำเข้า (กรณีนำเข้าซ้ำ) — กรองด้วย projectId
    // ทุกครั้งกันพลาดลบข้ามโครงการอื่นโดยไม่ตั้งใจ ──
    if (toDelete.length) {
      prog('กำลังลบปัญหาเดิม');
      var delFailed = {};
      for (var j = 0; j < toDelete.length; j++) {
        try { await window.deleteDoc(window.getDocRef('IMPL_ISSUES', toDelete[j].id)); }
        catch (e) { delFailed[toDelete[j].id] = 1; errors.push('ลบปัญหาเดิมไม่สำเร็จ: ' + (toDelete[j].problem || toDelete[j].id).slice(0, 40) + ' — ' + errText(e)); }
        step++; prog('กำลังลบปัญหาเดิม');
      }
      window.IMPL_ISSUES = (window.IMPL_ISSUES || []).filter(function (x) { return x.projectId !== pid || delFailed[x.id]; });
    }

    var done = 0, failed = 0;
    prog('กำลังนำเข้า');
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].data;
      try {
        var id = window.imtUid('ISSU');
        var row = {
          project_id: pid, task_id: '',
          department: d.department, reported_by: d.reportedBy, problem: d.problem,
          category: d.category, severity: d.severity, status: d.status, solution: d.solution,
          received_by: d.receivedById, fixed_by: d.fixedById, fixed_date: d.fixedDate || null,
          created_at: d.createdAt,
        };
        await window.setDoc(window.getDocRef('IMPL_ISSUES', id), row);
        window.imtApplyLocal('IMPL_ISSUES', id, row); // ใส่ลงหน้าจอเฉพาะแถวที่บันทึกสำเร็จ
        done++;
      } catch (e) {
        failed++;
        errors.push('แถวที่ ' + rows[i].row + ' (' + d.problem.slice(0, 30) + ') — ' + errText(e));
        console.warn('[impl issue import] row', rows[i].row, e);
      }
      step++; prog('กำลังนำเข้า');
    }

    window._importProgress && window._importProgress(null);
    if (window._von && window._von('view-impl-tracker')) window.renderImplTracker && window.renderImplTracker();
    var projName = proj ? proj.name : pid;
    var uniqUnmatched = Array.from(new Set(unmatched));

    if (!errors.length && !badRows.length && !uniqUnmatched.length) {
      window.closeM('m-import');
      window.showAlert && window.showAlert('นำเข้าปัญหาเข้าโครงการ "' + projName + '" สำเร็จครบ ' + done + ' รายการ', 'success');
      return;
    }
    // ── มีปัญหาบางส่วน → ค้างหน้าต่างไว้ให้อ่านรายละเอียด · ล้างไฟล์ที่เลือกกันกดนำเข้าซ้ำโดยไม่ตั้งใจ ──
    var items = errors.slice();
    badRows.forEach(function (b) { items.push('แถวที่ ' + b.row + ' — ข้าม: ' + b.errs.join(', ')); });
    if (uniqUnmatched.length) items.push('ไม่พบชื่อพนักงาน (ช่องผู้รับเรื่อง/ผู้แก้ไขเว้นว่างไว้): ' + uniqUnmatched.join(', '));
    var fileEl = document.getElementById('import-file');
    if (fileEl) { fileEl.value = ''; window._importFileChanged && window._importFileChanged(); }
    alertBox(failed || errors.length ? 'error' : 'warn',
      (done ? 'นำเข้าสำเร็จ ' + done + ' จาก ' + parsed.length + ' แถว' : 'นำเข้าไม่สำเร็จ') + ' — โครงการ "' + projName + '"'
        + (failed ? ' · ผิดพลาด ' + failed + ' แถว' : '') + (badRows.length ? ' · ข้าม ' + badRows.length + ' แถว' : ''),
      items,
      failed || badRows.length
        ? 'แก้ไขแถวที่มีปัญหาในไฟล์ แล้วนำเข้าใหม่ — ถ้าจะนำเข้าทั้งไฟล์อีกรอบ ให้ติ๊ก "ลบปัญหาเดิมของโครงการนี้" ก่อน เพื่อไม่ให้ข้อมูลซ้ำ'
        : 'ข้อมูลถูกนำเข้าครบแล้ว — แก้ชื่อพนักงานที่ไม่พบได้ในหน้าแก้ไขปัญหา');
    window.showAlert && window.showAlert((done ? 'นำเข้าได้ ' + done + ' จาก ' + parsed.length + ' แถว' : 'นำเข้าไม่สำเร็จ') + ' — ดูรายการแถวที่มีปัญหาในหน้าต่างนำเข้า', failed && !done ? 'error' : 'warn');
  };

})();
