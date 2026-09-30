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
  function imtProject(id) { return window.IMPL_PROJECTS.find(function (p) { return p.id === id; }); }
  window.imtProject = imtProject; // ── ให้ form-tracker.js (แท็บ "แบบฟอร์ม") เรียกใช้ได้ ไม่ต้อง lookup ซ้ำ ──
  function imtPhase(id)   { return window.IMPL_PHASES.find(function (p) { return p.id === id; }); }
  function imtTask(id)    { return window.IMPL_TASKS.find(function (t) { return t.id === id; }); }
  function imtPhasesOf(pid)    { return window.IMPL_PHASES.filter(function (p) { return p.projectId === pid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfPhase(id) { return window.IMPL_TASKS.filter(function (t) { return t.phaseId === id; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfProject(pid) { return window.IMPL_TASKS.filter(function (t) { return t.projectId === pid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtChecklistOf(tid) { return window.IMPL_CHECKLIST_ITEMS.filter(function (c) { return c.taskId === tid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtCommentsOf(tid)  { return window.IMPL_COMMENTS.filter(function (c) { return c.taskId === tid; }).sort(function (a,b) { return (a.createdAt||'').localeCompare(b.createdAt||''); }); }
  function imtAttachmentsOf(tid) { return window.IMPL_ATTACHMENTS.filter(function (a) { return a.taskId === tid; }); }
  function imtIssue(id)        { return window.IMPL_ISSUES.find(function (i) { return i.id === id; }); }
  function imtIssuesOfProject(pid) { return window.IMPL_ISSUES.filter(function (i) { return i.projectId === pid; }).sort(function (a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }); }

  // ── สร้าง row เต็มสำหรับ imtApplyLocal('IMPL_TASKS', ...) จาก Task object ปัจจุบัน + overrides
  // (เช่น {status:'done'}) — ต้องรวม sort_order เสมอ ไม่งั้น transform จะ default เป็น 99 ทำให้ลำดับ Task
  // ในโครงการเพี้ยนไปทันทีทุกครั้งที่มีการอัปเดตสถานะแบบไม่ผ่านฟอร์ม "แก้ไข Task" เต็ม (เจอบั๊กนี้มาแล้ว
  // ใน imtMarkDone/imtDrop — รวมเป็น helper เดียวกันเพื่อกันพลาดซ้ำ) ──
  function imtTaskRow(t, overrides) {
    return Object.assign({
      phase_id:t.phaseId, project_id:t.projectId, task_name:t.name, description:t.description,
      owner:window.staffIdByRef(t.ownerId), start_date:t.start, due_date:t.due, priority:t.priority, status:t.status,
      progress_percent:t.progress, sort_order:t.order,
    }, overrides || {});
  }

  function lookupIn(list, id) { return list.find(function (x) { return x.id === id; }) || list[1] || { label:id, color:'#9ba3b8' }; }
  function imtStatus(id)      { return window.IMPL_STATUS.find(function (s) { return s.id === id; }) || window.IMPL_STATUS[0]; }
  function imtPriority(id)    { return lookupIn(window.IMPL_PRIORITY, id); }
  function imtIssueStatus(id) { return window.IMPL_ISSUE_STATUS.find(function (s) { return s.id === id; }) || window.IMPL_ISSUE_STATUS[0]; }

  // ── สีสุขภาพของ Phase อ้างอิงจาก % ความคืบหน้าจริง (ไม่ใช่ field สถานะที่ตั้งเองซึ่งบางทีลืมอัปเดต) —
  // ใช้ร่วมกันทั้งกราฟและการ์ดรายละเอียด Phase ในหน้า Report กันสีไม่ตรงกันระหว่างสองที่ ──
  function imtPhaseHealthColor(pct) {
    if (pct >= 100) return imtStatus('done').color;
    if (pct > 0) return imtStatus('in_progress').color;
    return imtStatus('not_started').color;
  }

  function statusTag(st) { return '<span class="tag" style="background:'+st.color+'18;color:'+st.color+'">'+st.icon+' '+esc(st.label)+'</span>'; }
  function pbarHtml(pct, color) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="pbar"><div class="pbar-fill" style="width:'+pct+'%;background:'+(color||'var(--violet)')+'"></div></div>';
  }
  // ── หาโครงการต้นทาง (window.PROJECTS) ของโครงการ impl-tracker หนึ่งๆ — ใช้ sourceProjectId ถ้ามี
  // ไม่มีก็เดาจากชื่อที่ตรงกันพอดี (โครงการเก่าก่อนมีคอลัมน์นี้) ใช้ร่วมกันทั้งฟอร์ม "แก้ไขโครงการ"
  // และตัวกรองรายชื่อทีมงาน ป้องกันไม่ให้ 2 จุดนี้เดาไม่ตรงกันจนทีมงานที่แสดงผิดโครงการ ──
  function imtResolveSourceProject(proj) {
    if (!proj) return null;
    var srcId = proj.sourceProjectId;
    if (!srcId) {
      var guess = (window.PROJECTS||[]).find(function (x) { return x.name === proj.name; });
      if (guess) srcId = guess.id;
    }
    return srcId ? (window.PROJECTS||[]).find(function (x) { return x.id === srcId; }) : null;
  }

  // ── ทีมงานของโครงการ (ตามโครงการต้นทางที่ผูกไว้/เดาไว้) —
  // ใช้จำกัดตัวเลือก "ผู้รับผิดชอบ" ให้เลือกได้เฉพาะคนที่อยู่ในทีมโครงการจริง ไม่ใช่พนักงานทั้งบริษัท ──
  function imtProjectTeamStaff(pid) {
    var sp = imtResolveSourceProject(imtProject(pid));
    if (!sp) return [];
    var sids = (sp.members && sp.members.length ? sp.members : (sp.team||[]).map(function (id) { return { sid:id }; }))
      .map(function (m) { return m.sid; });
    var seen = {};
    return sids.map(function (sid) { return window.gSt(sid); })
      .filter(function (s) { return s && s.id && !seen[s.id] && (seen[s.id] = true); });
  }
  window.imtProjectTeamStaff = imtProjectTeamStaff; // ── ใช้ร่วมกับแท็บ "แบบฟอร์ม" (form-tracker.js) กันซ้ำ ──

  // ── Markup ของ combobox "ผู้รับผิดชอบ" — รูปแบบเดียวกับ combobox เลือกโครงการ (ค้นหา + คลิกเลือก
  // + position:fixed กันโดน overflow ของ modal ตัด) แทน input+datalist เดิม (บาง browser ไม่โชว์ label) ──
  function imtStaffComboMarkup(curNick, disabled) {
    if (disabled) return '<input class="f-input" value="'+esc(curNick||'-')+'" disabled><input type="hidden" id="imt-t-owner" value="'+esc(curNick||'')+'">';
    return '<div id="imt-t-owner-wrap" style="position:relative;">'
      +   '<input id="imt-t-owner-cmb-input" type="text" class="f-input" placeholder="ค้นหาหรือเลือกชื่อ..." autocomplete="off" spellcheck="false" style="padding-right:28px;cursor:pointer;">'
      +   '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:var(--txt3);">▼</span>'
      +   '<input type="hidden" id="imt-t-owner" value="'+esc(curNick||'')+'">'
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
    return function (staffList, curNick) {
      var inp = document.getElementById('imt-t-owner-cmb-input'), drop = document.getElementById('imt-t-owner-drop'),
        lst = document.getElementById('imt-t-owner-list'), hid = document.getElementById('imt-t-owner');
      if (!inp || !drop || !lst || !hid) return;
      var UNASSIGNED = '— ไม่ระบุผู้รับผิดชอบ —';
      var items = staffList.map(function (s) { var nick = s.nickname || s.name; return { nick:nick, label:s.name+' ('+nick+')' }; });
      var selNick = curNick || '', q = '', fi = -1, flat = [], dt = null, isOpen = false;
      var initItem = items.find(function (it) { return it.nick === selNick; });
      var selLabel = initItem ? initItem.label : selNick;
      function bFlat(sq) {
        var f = [], lq = sq.toLowerCase();
        if (!sq) f.push({ nick:'', label:UNASSIGNED, unbound:true });
        items.forEach(function (it) { if (!sq || it.label.toLowerCase().indexOf(lq) !== -1) f.push(it); });
        return f;
      }
      function render() {
        if (!flat.length) { lst.innerHTML = '<div style="padding:18px 12px;text-align:center;color:var(--txt3);font-size:12px;">ไม่พบชื่อ' + (q ? '<br><small style="opacity:.7;">' + esc(q) + '</small>' : '') + '</div>'; return; }
        lst.innerHTML = flat.map(function (it, idx) {
          var foc = idx === fi, isSel = !it.unbound && it.nick === selNick;
          return '<div class="imto-i" data-nick="' + esc(it.nick) + '" data-label="' + esc(it.label) + '" data-idx="' + idx + '" style="height:' + IH + 'px;display:flex;align-items:center;padding:0 12px;cursor:pointer;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.04);background:' + (foc ? 'var(--indigo)12' : isSel ? 'var(--teal)0d' : 'transparent') + ';color:' + (it.unbound ? 'var(--txt3);font-style:italic;' : 'var(--txt1);') + '">'
            + (isSel ? '<span style="color:var(--teal);margin-right:6px;font-size:10px;flex-shrink:0;">✓</span>' : '')
            + (it.unbound ? esc(it.label) : hi(it.label, q))
            + '</div>';
        }).join('');
      }
      function positionDrop() { window.placeDropdown(inp, drop, lst, 260); }
      function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); window.addEventListener('scroll', positionDrop, true); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selLabel; window.removeEventListener('resize', positionDrop); window.removeEventListener('scroll', positionDrop, true); }
      function selItem(nick, label) { selNick = nick; selLabel = nick ? label : ''; hid.value = nick; closeDrop(); hid.dispatchEvent(new Event('change')); }
      lst.addEventListener('click', function (e) { var it = e.target.closest('.imto-i'); if (it) selItem(it.dataset.nick, it.dataset.label); });
      lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.imto-i'); if (it) { var ni = +it.dataset.idx; if (ni !== fi) { fi = ni; render(); } } });
      inp.addEventListener('click', function () { if (isOpen) closeDrop(); else openDrop(); });
      inp.addEventListener('input', function () { if (!isOpen) openDrop(); clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); fi = -1; flat = bFlat(q); render(); }, 150); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrop(); return; }
        if (e.key === 'Tab') { closeDrop(); return; }
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { openDrop(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); fi = fi < flat.length - 1 ? fi + 1 : fi; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); fi = fi > 0 ? fi - 1 : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[fi]) selItem(flat[fi].nick, flat[fi].label); }
      });
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('imt-t-owner-wrap'); if (!wrap) { document.removeEventListener('mousedown', onOut); return; } if (!wrap.contains(e.target)) closeDrop(); });
      inp.value = selLabel; flat = bFlat(''); render();
    };
  })();

  // ── Tab Bar ── ("ปัญหา" คือ Issue Log ที่เคยตัดออกไปเพราะไม่ได้ใช้งาน — รื้อฟื้นกลับมาพร้อมปรับฟิลด์ใหม่
  // ให้ตรงกับรายงานสรุปปัญหาการใช้งานโปรแกรมรายโครงการที่ รพ. เซ็นรับทราบ แทน Google Sheet แยกไฟล์เดิม)
  var TABS = [
    { id:'dashboard', label:'ภาพรวมทุกโครงการ', icon:'📊' },
    { id:'workspace', label:'งาน',              icon:'🗃️' },
    { id:'issues',    label:'ปัญหา',             icon:'🩹' },
    { id:'forms',     label:'แบบฟอร์ม',          icon:'📄' },
    { id:'calendar',  label:'Calendar',          icon:'📅' },
    { id:'report',    label:'Report',            icon:'📈' },
    { id:'templates', label:'Template',          icon:'📐' },
  ];
  // แท็บที่ต้องใช้ project switcher (ทุกแท็บยกเว้น dashboard ซึ่งเป็นมุมมองรวมทุกโครงการอยู่แล้ว)
  var TABS_NEED_PROJECT = ['workspace','issues','forms','calendar','report'];

  window.imtGoTab = function (tab) {
    window.imtTab = tab;
    // ── แท็บที่ต้องมีโครงการ (งาน/แบบฟอร์ม/Calendar/Report) แต่ยังไม่มีโครงการ "กำลังดู" อยู่ — auto-select ให้
    // แทนที่จะโผล่หน้าเปล่า ๆ ให้เลือกเอง (เริ่มแอปยังคงอยู่ที่ Dashboard ตามปกติ ไม่ถูกเรียกจุดนี้จนกว่าจะกดเข้าแท็บ) ──
    if (TABS_NEED_PROJECT.indexOf(tab) !== -1 && !window.imtCurrentProjectId) _imtAutoSelectProject();
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
  function renderProjectSwitcher() {
    _imtSwitcherPending = null;
    if (TABS_NEED_PROJECT.indexOf(window.imtTab) === -1) return '';
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) return ''; // ยังไม่เลือกโครงการ — แต่ละแท็บมี empty-state picker ของตัวเองอยู่แล้ว ไม่ต้องซ้ำ
    // ── ตัวกรอง "แสดงเฉพาะโครงการที่ยังไม่เสร็จ" ในตัวเลือก "กำลังดู" — ค่าเริ่มต้นติ๊กไว้ (undefined !== false → true)
    // ซ่อนโครงการที่เสร็จแล้ว 100% ออกจากรายการให้สลับ แต่ยังคงโครงการที่กำลังดูอยู่ตอนนี้ไว้เสมอ (unshift ไม่หาย
    // จากตัวเลือกแม้จะเป็นโครงการที่เสร็จแล้ว) กันไม่ให้ dropdown แสดงค่าว่างเปล่าตอนกำลังดูโครงการที่เสร็จอยู่พอดี ──
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
    var hideDoneChk = '<label class="imt-hidedone-chk" style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--txt2);white-space:nowrap;cursor:pointer;margin-left:auto;">'
      + '<input type="checkbox" '+(hideDoneProjects?'checked':'')+' onchange="window.imtToggleHideDoneProjects(this.checked)"> แสดงเฉพาะโครงการที่ยังไม่เสร็จ'
      + '</label>';
    return '<div class="imt-switcher">'
      + '<span class="imt-switcher-back" onclick="window.imtGoTab(\'dashboard\')">◀ ทุกโครงการ</span>'
      + '<span class="imt-switcher-lbl">กำลังดู:</span>'
      + window.projectComboHtml('imt-sw-cmb', 'imt-sw-pid', 'ค้นหาหรือเลือกโครงการ...', 'width:300px;max-width:100%;flex:0 1 300px;min-width:0;')
      + '<div class="imt-switcher-progress"><div class="imt-switcher-pbar">'+pbarHtml(window.calcProjectProgress(proj))+'</div><span style="font-size:11.5px;font-weight:700;">'+window.calcProjectProgress(proj)+'%</span></div>'
      + hideDoneChk
      + '</div>';
  }

  function renderTabs() {
    var el = document.getElementById('imt-tabs');
    if (!el) return;
    var tabsHtml = TABS.map(function (t) {
      var on = window.imtTab === t.id;
      return '<div class="imt-tab'+(on?' on':'')+'" onclick="window.imtGoTab(\''+t.id+'\')">'+t.icon+' '+t.label+'</div>';
    }).join('');
    var addBtn = window.canAdd(window.IMPL_MODULE)
      ? '<button class="btn btn-pri btn-sm imt-tabs-addbtn" onclick="window.openImtProjectModal(null)">+ เพิ่มโครงการ</button>' : '';
    var tabsRow = '<div class="imt-tabs-row"><div class="imt-tabs-scroll">'+tabsHtml+'</div>'+addBtn+'</div>';
    el.innerHTML = tabsRow + renderProjectSwitcher();
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
  window.renderImplTracker = function () {
    renderTabs();
    var mount = document.getElementById('imt-content');
    if (!mount) return;
    var fns = {
      dashboard: renderImtDashboard, workspace: renderImtWorkspace, issues: renderImtIssues,
      forms: function (m) { window.renderImtForms && window.renderImtForms(m); },
      calendar: renderImtCalendar, report: renderImtReport, templates: renderImtTemplates,
    };
    (fns[window.imtTab] || renderImtDashboard)(mount);
  };

  // ── Project Health: ให้ PM เห็นได้ทันทีว่าโครงการไหนล่าช้า/ต้องติดตามพิเศษ/ปกติ ──
  // เกณฑ์: มีงานเกินกำหนด หรือผ่านวันสิ้นสุดโครงการแล้วยังไม่เสร็จ หรือคืบหน้าต่ำกว่าที่ควรตามไทม์ไลน์มาก → ล่าช้า
  // มีงานใกล้ครบกำหนด หรือคืบหน้าต่ำกว่าที่ควรเล็กน้อย → ต้องติดตามพิเศษ, นอกนั้น → ปกติ
  function imtProjectHealth(p) {
    var tasks = imtTasksOfProject(p.id);
    var overdue = tasks.filter(function (t) { return window.imtIsOverdue(t); }).length;
    var dueSoon = tasks.filter(function (t) { return window.imtIsDueSoon(t, 3); }).length;
    var progress = window.calcProjectProgress(p);
    var today = new Date(new Date().toDateString());

    if (p.status === 'cancelled') {
      return { level:'cancelled', label:'ยกเลิก', color:'#6c757d', icon:'🚫', progress:progress, overdue:0, dueSoon:0, expected:null };
    }
    if (p.status === 'done' || progress >= 100) {
      return { level:'done', label:'เสร็จสมบูรณ์', color:'#4361ee', icon:'🏁', progress:progress, overdue:overdue, dueSoon:0, expected:null };
    }

    var expected = null;
    if (p.start && p.end) {
      var s = pd(p.start).getTime(), e = pd(p.end).getTime();
      if (e > s) expected = Math.max(0, Math.min(100, Math.round((today.getTime() - s) / (e - s) * 100)));
    }
    var pastEnd = p.end && pd(p.end) < today;

    if (overdue > 0 || pastEnd || (expected !== null && progress < expected - 20)) {
      return { level:'delayed', label:'ล่าช้า', color:'#ff6b6b', icon:'🔴', progress:progress, overdue:overdue, dueSoon:dueSoon, expected:expected };
    }
    if (dueSoon > 0 || (expected !== null && progress < expected - 8)) {
      return { level:'risk', label:'ต้องติดตามพิเศษ', color:'#ffa62b', icon:'🟡', progress:progress, overdue:overdue, dueSoon:dueSoon, expected:expected };
    }
    return { level:'ontrack', label:'ปกติ', color:'#06d6a0', icon:'🟢', progress:progress, overdue:overdue, dueSoon:dueSoon, expected:expected };
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

    return '<div class="imt-pcard imt-hcard" style="border-left:4px solid '+h.color+';" onclick="window.imtSelectProject(\''+p.id+'\')">'
      + '<div class="imt-hcard-top"><span class="imt-hcard-badge" style="background:'+h.color+'18;color:'+h.color+'">'+h.icon+' '+h.label+'</span>'+flag+'</div>'
      + '<div class="imt-pcard-title">'+esc(p.name)+'</div>'
      + '<div class="imt-pcard-sub">🏥 '+esc(p.hospitalName||'—')+' &nbsp;·&nbsp; 👤 '+esc(p.pm||'—')+'</div>'
      + '<div class="imt-hcard-pbar-wrap">'+pbarHtml(h.progress, h.color)+(h.expected!==null?'<div class="imt-hcard-expected" style="left:'+h.expected+'%" title="เป้าหมายตามกำหนดการ ~'+h.expected+'%"></div>':'')+'</div>'
      + '<div class="imt-pcard-meta"><span>'+h.progress+'% เสร็จแล้ว</span><span>'+endInfo+'</span></div>'
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
    var lines = ['วันนี้: ' + fd(today.toISOString().slice(0,10)),
      'โครงการที่ยังไม่เสร็จ ' + rows.length + ' โครงการ: ล่าช้า ' + n.delayed + ' · ต้องติดตามพิเศษ ' + n.risk + ' · ปกติ ' + n.ontrack];
    rows.slice(0, 30).forEach(function (x, i) {
      var p = x.p, h = x.h, pid = p.id;
      var tasks = imtTasksOfProject(pid);
      var overdueT = tasks.filter(function (t) { return window.imtIsOverdue(t); })
        .sort(function (a,b) { return (a.due||'').localeCompare(b.due||''); });
      var stuck = tasks.filter(function (t) { return t.status === 'issue' || t.status === 'review'; });
      var openIss = (window.IMPL_ISSUES || []).filter(function (s) { return s.projectId === pid && s.status !== 'closed'; });
      var risks = (window.IMPL_RISKS || []).filter(function (r) { return r.projectId === pid && r.status === 'open'; });
      var impactLbl = function (id) { return ((window.IMPL_IMPACT || []).find(function (x) { return x.id === id; }) || { label:id }).label; };
      var acts = (window.IMPL_ACTIVITY_LOG || []).filter(function (a) { return a.projectId === pid; })
        .sort(function (a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); });
      var endTxt = p.end ? (dayDiff(p.end) > 0 ? 'เลยกำหนดจบ ' + dayDiff(p.end) + ' วัน' : 'เหลือ ' + (-dayDiff(p.end)) + ' วันถึงกำหนดจบ') : 'ไม่มีกำหนดจบ';
      lines.push('', (i + 1) + ') ' + p.name + ' [' + h.label + ']',
        '   ความคืบหน้า ' + h.progress + '%' + (h.expected !== null ? ' (ตามแผนควรได้ ~' + h.expected + '%)' : '') + ' · ' + endTxt + (p.pm ? ' · ผู้ดูแล ' + p.pm : ''));
      if (overdueT.length) lines.push('   งานเกินกำหนด ' + overdueT.length + ' งาน: ' + overdueT.slice(0, 3).map(function (t) {
        return t.name + ' (เกิน ' + dayDiff(t.due) + ' วัน' + (t.owner ? ', ' + t.owner : '') + ')'; }).join('; '));
      if (h.dueSoon) lines.push('   งานใกล้ครบกำหนดใน 3 วัน ' + h.dueSoon + ' งาน');
      if (stuck.length) lines.push('   งานสถานะมีปัญหา/รอตรวจสอบ ' + stuck.length + ' งาน: ' + stuck.slice(0, 3).map(function (t) { return t.name + ' (' + imtStatus(t.status).label + ')'; }).join('; '));
      if (openIss.length) {
        var oldest = openIss.reduce(function (m, s) { return Math.max(m, dayDiff(s.createdAt || today.toISOString())); }, 0);
        lines.push('   ปัญหาการใช้งานค้าง ' + openIss.length + ' เรื่อง (ค้างนานสุด ' + oldest + ' วัน)');
      }
      if (risks.length) lines.push('   ความเสี่ยงที่ยังเปิดอยู่: ' + risks.slice(0, 3).map(function (r) { return r.title + ' (ผลกระทบ' + impactLbl(r.impact) + ')'; }).join('; '));
      lines.push('   อัปเดตล่าสุด: ' + (acts.length ? dayDiff(acts[0].createdAt) + ' วันก่อน' : 'ยังไม่มีการอัปเดต'));
    });
    if (rows.length > 30) lines.push('', '(และโครงการสถานะปกติอีก ' + (rows.length - 30) + ' โครงการ ไม่ได้แสดงรายละเอียด)');
    return { text: lines.join('\n'), count: rows.length };
  }
  window.imtRunAiOverview = async function () {
    if (_imtAiOverview && _imtAiOverview.loading) return;
    var facts = imtAiOverviewFacts();
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
  // DASHBOARD — ภาพรวมทุกโครงการ (รวม Dashboard เดิม + รายการโครงการ เดิมเป็นหน้าเดียว
  // เป็นมุมมองข้ามโครงการเสมอ ไม่ผูกกับ imtCurrentProjectId)
  // ================================================================
  function renderImtDashboard(mount) {
    var tasks = window.IMPL_TASKS;
    var today = new Date().toISOString().slice(0,10);

    var overallProgress = window.IMPL_PROJECTS.length
      ? Math.round(window.IMPL_PROJECTS.reduce(function (s,p) { return s + window.calcProjectProgress(p); }, 0) / window.IMPL_PROJECTS.length) : 0;

    var doneCount    = tasks.filter(function (t) { return t.status === 'done'; }).length;
    var inProgCount  = tasks.filter(function (t) { return t.status === 'in_progress'; }).length;
    var delayedCount = tasks.filter(function (t) { return window.imtIsOverdue(t); }).length;
    var todayCount    = tasks.filter(function (t) { return t.due === today && t.status !== 'done' && t.status !== 'cancelled'; }).length;
    var dueSoonCount  = tasks.filter(function (t) { return window.imtIsDueSoon(t, 3); }).length;

    var stats = [
      { k:'จำนวนโครงการ',     v:window.IMPL_PROJECTS.length, icon:'🗂️', color:'var(--indigo)' },
      { k:'ความคืบหน้าเฉลี่ย', v:overallProgress+'%', icon:'📊', color:'var(--violet)' },
      { k:'งานทั้งหมด',       v:tasks.length,        icon:'📋', color:'var(--indigo)' },
      { k:'เสร็จแล้ว',        v:doneCount,            icon:'✅', color:'var(--teal)' },
      { k:'กำลังดำเนินการ',   v:inProgCount,          icon:'🔵', color:'var(--sky)' },
      { k:'ล่าช้า',           v:delayedCount,         icon:'⏰', color:'var(--coral)' },
      { k:'ต้องทำวันนี้',     v:todayCount,           icon:'📌', color:'var(--amber)' },
      { k:'ใกล้ครบกำหนด',     v:dueSoonCount,         icon:'⏳', color:'var(--amber)' },
    ];

    // ── การ์ดแนวนอน (ไอคอนซ้าย + label/value ซ้อนขวา) แทนแนวตั้งเดิม ให้กระชับกว่าเมื่อมีการ์ดพร้อมกัน 8 ใบ ──
    var statCards = stats.map(function (s) {
      return '<div class="stat-c imt-stat-c"><div class="stat-icon" style="background:'+s.color+'18;color:'+s.color+'">'+s.icon+'</div>'
        + '<div class="imt-stat-text"><div class="stat-k">'+s.k+'</div><div class="stat-v">'+s.v+'</div></div></div>';
    }).join('');

    var statusCounts = window.IMPL_STATUS.map(function (st) {
      return { st:st, n:tasks.filter(function (t) { return t.status === st.id; }).length };
    });
    var maxN = Math.max.apply(null, statusCounts.map(function (x) { return x.n; }).concat([1]));
    var statusChart = statusCounts.map(function (x) {
      var pct = Math.round((x.n / maxN) * 100);
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + '<div style="width:100px;font-size:11.5px;color:var(--txt2);flex-shrink:0;">'+x.st.icon+' '+esc(x.st.label)+'</div>'
        + '<div style="flex:1;background:var(--surface3);border-radius:8px;overflow:hidden;height:16px;"><div style="width:'+pct+'%;height:100%;background:'+x.st.color+';border-radius:8px;"></div></div>'
        + '<div style="width:28px;text-align:right;font-size:12px;font-weight:700;">'+x.n+'</div></div>';
    }).join('');

    var activity = window.IMPL_ACTIVITY_LOG.slice().sort(function (a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0, 10);
    var activityHtml = activity.map(function (a) {
      var ap = imtProject(a.projectId);
      return '<div class="imt-activity-item"><div class="imt-activity-dot"></div><div><b>'+esc(a.actor||'ระบบ')+'</b> '+esc(a.detail||a.action)+(ap?' <span style="color:var(--txt3);">— '+esc(ap.name)+'</span>':'')+'<div style="color:var(--txt3);font-size:10px;">'+fd(a.createdAt)+'</div></div></div>';
    }).join('') || '<div style="color:var(--txt3);font-size:12px;">ยังไม่มีกิจกรรม</div>';

    // ── Project Health: ส่วนที่สำคัญที่สุดสำหรับ PM — เห็นได้ทันทีว่าโครงการไหนต้องเข้าไปดูก่อน ──
    var health = window.IMPL_PROJECTS.map(function (p) { return { p:p, h:imtProjectHealth(p) }; });
    health.sort(function (a,b) { return IMT_HEALTH_ORDER[a.h.level] - IMT_HEALTH_ORDER[b.h.level]; });
    var counts = { delayed:0, risk:0, ontrack:0 };
    health.forEach(function (x) { if (counts[x.h.level] !== undefined) counts[x.h.level]++; });

    var filter = window.imtDashHealthFilter || 'all';
    var chips = [
      { id:'all',     label:'ทั้งหมด',              n:health.length },
      { id:'delayed', label:'🔴 ล่าช้า',             n:counts.delayed },
      { id:'risk',    label:'🟡 ต้องติดตามพิเศษ',    n:counts.risk },
      { id:'ontrack', label:'🟢 ปกติ',               n:counts.ontrack },
    ];
    var chipsHtml = chips.map(function (c) {
      return '<div class="imt-health-chip'+(filter===c.id?' on':'')+'" onclick="window.imtSetDashHealthFilter(\''+c.id+'\')">'+c.label+' <b>'+c.n+'</b></div>';
    }).join('');

    var hideDoneProjects = window.imtHideDoneProjects !== false;
    var hideDoneProjectsChk = '<label class="imt-hidedone-chk" style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--txt2);white-space:nowrap;cursor:pointer;margin-left:auto;">'
      + '<input type="checkbox" '+(hideDoneProjects?'checked':'')+' onchange="window.imtToggleHideDoneProjects(this.checked)"> แสดงเฉพาะโครงการที่ยังไม่เสร็จ'
      + '</label>';

    var shown = filter === 'all' ? health : health.filter(function (x) { return x.h.level === filter; });
    if (hideDoneProjects) shown = shown.filter(function (x) { return x.h.level !== 'done'; });
    var healthGrid = shown.length ? shown.map(function (x) { return imtHealthCardHtml(x.p, x.h); }).join('')
      : '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:12px;padding:24px;">ไม่มีโครงการในหมวดนี้</div>';

    var aiBtn = '<button class="btn btn-pri btn-sm imt-ai-btn m-icon-btn" onclick="window.imtRunAiOverview()"'+(_imtAiOverview && _imtAiOverview.loading ? ' disabled' : '')+' title="ให้ AI สรุปว่าโครงการไหนต้องติดตาม และควรทำอะไรเพิ่ม">🤖 AI สรุปภาพรวม</button>';
    var healthSection = window.IMPL_PROJECTS.length
      ? '<div class="imt-health-strip">'+chipsHtml+hideDoneProjectsChk+aiBtn+'</div>'+imtAiOverviewHtml()+'<div class="imt-pgrid">'+healthGrid+'</div>'
      : '';

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

    // ── งานเกินกำหนด (actionable, ทุกโครงการ) — เรียงเกินมากสุดก่อน ──
    var overdueList = tasks.filter(function (t) { return window.imtIsOverdue(t); })
      .map(function (t) { return { t:t, days:Math.round((new Date(new Date().toDateString()) - pd(t.due)) / 86400000) }; })
      .sort(function (a,b) { return b.days - a.days; });
    var overdueHtml = overdueList.length
      ? overdueList.slice(0, 8).map(function (x) { return dashRow(x.t, '<span style="color:var(--coral);">เกิน '+x.days+' วัน</span>'); }).join('')
        + (overdueList.length > 8 ? '<div class="imt-dash-more">และอีก '+(overdueList.length - 8)+' งาน</div>' : '')
      : '<div style="color:var(--txt3);font-size:12px;">ไม่มีงานเกินกำหนด 🎉</div>';

    // ── กำหนดการ 7 วันข้างหน้า (รวมทุกโครงการ ไม่ต้องเปิดทีละโครงการ) ──
    var upcomingList = tasks.filter(function (t) { return window.imtIsDueSoon(t, 7); })
      .map(function (t) { return { t:t, diff:Math.round((pd(t.due) - new Date(new Date().toDateString())) / 86400000) }; })
      .sort(function (a,b) { return a.diff - b.diff; });
    var upcomingHtml = upcomingList.length
      ? upcomingList.slice(0, 8).map(function (x) {
          var label = x.diff === 0 ? 'วันนี้' : x.diff === 1 ? 'พรุ่งนี้' : 'อีก '+x.diff+' วัน';
          return dashRow(x.t, '<span style="color:'+(x.diff<=1?'var(--amber)':'var(--txt2)')+';">'+label+'</span>');
        }).join('')
        + (upcomingList.length > 8 ? '<div class="imt-dash-more">และอีก '+(upcomingList.length - 8)+' งาน</div>' : '')
      : '<div style="color:var(--txt3);font-size:12px;">ไม่มีงานใกล้ครบกำหนดใน 7 วัน</div>';

    // ── ภาระงาน PM: PM คนไหนถือหลายโครงการ / มีโครงการติดโซนแดง-เหลืองกี่โครงการ ──
    var pmMap = {};
    window.IMPL_PROJECTS.forEach(function (p) {
      var pmName = p.pm || 'ไม่ระบุ PM';
      (pmMap[pmName] = pmMap[pmName] || []).push(p);
    });
    var pmRows = Object.keys(pmMap).map(function (name) {
      var active = pmMap[name].filter(function (p) { return p.status !== 'done' && p.status !== 'cancelled'; });
      var red  = active.filter(function (p) { return healthById[p.id] && healthById[p.id].level === 'delayed'; }).length;
      var risk = active.filter(function (p) { return healthById[p.id] && healthById[p.id].level === 'risk'; }).length;
      return { name:name, active:active.length, red:red, risk:risk };
    }).filter(function (x) { return x.active > 0; })
      .sort(function (a,b) { return (b.red - a.red) || (b.risk - a.risk) || (b.active - a.active); });
    var pmHtml = pmRows.length ? pmRows.map(function (x) {
      var badge = x.red ? '<span style="color:var(--coral);">🔴 '+x.red+'</span>'
        : x.risk ? '<span style="color:var(--amber);">🟡 '+x.risk+'</span>'
        : '<span style="color:var(--teal);">🟢 ปกติ</span>';
      return '<div class="imt-dash-row" style="cursor:default;">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">👤 '+esc(x.name)+'</div>'
        + '<div class="imt-dash-row-sub">'+x.active+' โครงการที่กำลังดำเนินการ</div></div>'
        + '<div class="imt-dash-row-badge">'+badge+'</div></div>';
    }).join('') : '<div style="color:var(--txt3);font-size:12px;">ยังไม่มีข้อมูล PM</div>';

    // ── Phase ที่มักมีปัญหาซ้ำ ๆ ข้ามโครงการ (สัญญาณปัญหาเชิงกระบวนการ ไม่ใช่ปัญหาโครงการเดียว) ──
    var phaseGroups = {};
    window.IMPL_PHASES.forEach(function (ph) {
      var key = (ph.name || '').trim();
      if (!key) return;
      (phaseGroups[key] = phaseGroups[key] || []).push(ph);
    });
    var phaseRows = Object.keys(phaseGroups).map(function (name) {
      var list = phaseGroups[name];
      var problematic = list.filter(function (ph) {
        if (ph.status === 'delayed' || ph.status === 'issue') return true;
        return imtTasksOfPhase(ph.id).some(function (t) { return window.imtIsOverdue(t); });
      }).length;
      return { name:name, total:list.length, problematic:problematic };
    }).filter(function (x) { return x.total >= 2 && x.problematic >= 1; })
      .sort(function (a,b) { return (b.problematic / b.total) - (a.problematic / a.total) || b.problematic - a.problematic; });
    var phaseHtml = phaseRows.length ? phaseRows.slice(0, 6).map(function (x) {
      var pct = Math.round((x.problematic / x.total) * 100);
      return '<div class="imt-dash-row" style="cursor:default;">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">'+esc(x.name)+'</div>'
        + '<div class="imt-dash-row-sub">มีปัญหา '+x.problematic+' จาก '+x.total+' โครงการ</div></div>'
        + '<div class="imt-dash-row-badge" style="color:'+(pct>=50?'var(--coral)':'var(--amber)')+';">'+pct+'%</div></div>';
    }).join('') : '<div style="color:var(--txt3);font-size:12px;">ยังไม่พบรูปแบบปัญหาที่ซ้ำกันหลายโครงการ</div>';

    // ── ปัญหาการใช้งานโปรแกรม (IMPL_ISSUES) ข้ามโครงการ — ตอบคำถามที่ Google Sheet แยกไฟล์ต่อโครงการเดิม
    // ตอบไม่ได้: "กลุ่มปัญหาไหนเกิดบ่อยที่สุด" และ "โครงการไหนมีปัญหาแจ้งเข้ามาเยอะเป็นพิเศษ" ──
    var issueCatCounts = {};
    window.IMPL_ISSUES.forEach(function (i) { var c = i.category || 'ไม่ระบุ'; issueCatCounts[c] = (issueCatCounts[c] || 0) + 1; });
    var issueCatRows = Object.keys(issueCatCounts).map(function (c) { return { name:c, n:issueCatCounts[c] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var maxIssueCat = Math.max.apply(null, issueCatRows.map(function (x) { return x.n; }).concat([1]));
    var issueCatHtml = issueCatRows.length ? issueCatRows.map(function (x) {
      var pct = Math.round((x.n / maxIssueCat) * 100);
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + '<div style="width:140px;font-size:11.5px;color:var(--txt2);flex-shrink:0;">'+esc(x.name)+'</div>'
        + '<div style="flex:1;background:var(--surface3);border-radius:8px;overflow:hidden;height:16px;"><div style="width:'+pct+'%;height:100%;background:var(--indigo);border-radius:8px;"></div></div>'
        + '<div style="width:28px;text-align:right;font-size:12px;font-weight:700;">'+x.n+'</div></div>';
    }).join('') : '<div style="color:var(--txt3);font-size:12px;">ยังไม่มีข้อมูลปัญหา</div>';

    var projIssueRows = window.IMPL_PROJECTS.map(function (p) {
      var list = window.IMPL_ISSUES.filter(function (i) { return i.projectId === p.id; });
      return { p:p, n:list.length, open: list.filter(function (i) { return i.status !== 'closed'; }).length };
    }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    var projIssueHtml = projIssueRows.length ? projIssueRows.map(function (x) {
      return '<div class="imt-dash-row" onclick="window.imtCurrentProjectId=\''+x.p.id+'\';window.imtGoTab(\'issues\');">'
        + '<div class="imt-dash-row-main"><div class="imt-dash-row-name">'+esc(x.p.name)+'</div>'
        + '<div class="imt-dash-row-sub">🏥 '+esc(x.p.hospitalName||'-')+' · เปิดอยู่ '+x.open+'</div></div>'
        + '<div class="imt-dash-row-badge">'+x.n+'</div></div>';
    }).join('') : '<div style="color:var(--txt3);font-size:12px;">ยังไม่มีปัญหาบันทึกไว้ในระบบ</div>';

    mount.innerHTML =
      healthSection
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">⏰ งานเกินกำหนด (ทุกโครงการ)</div>'+overdueHtml+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">📅 กำหนดการ 7 วันข้างหน้า</div>'+upcomingHtml+'</div>'
      + '</div>'
      + '<div class="stat-row imt-stat-row" style="grid-template-columns:repeat(4,1fr);">'+statCards+'</div>'
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">👤 ภาระงาน PM</div>'+pmHtml+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">🔁 Phase ที่มักมีปัญหาซ้ำ</div>'+phaseHtml+'</div>'
      + '</div>'
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">🩹 กลุ่มปัญหาที่พบบ่อยที่สุด (ทุกโครงการ)</div>'+issueCatHtml+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">🏥 โครงการที่มีปัญหาแจ้งเข้ามามากที่สุด</div>'+projIssueHtml+'</div>'
      + '</div>'
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">กราฟสถานะงาน (ทุกโครงการ)</div>'+statusChart+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">Recent Activity</div>'+activityHtml+'</div>'
      + '</div>';
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
        hospital_name: sp.siteOwner || '',
        project_manager: sp.installer || '',
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
      hospital_name: editSp ? (editSp.siteOwner || '') : (curP.hospitalName || ''),
      project_manager: editSp ? (editSp.installer || '') : (curP.pm || ''),
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
      if (f.owner && t.owner !== f.owner) return false;
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
    var pct = window.calcProjectProgress(proj);
    var view = window.imtBoardView || 'card';

    var viewTabsHtml = ['card','list','kanban'].map(function (v) {
      var lbl = v==='card' ? '📋 Phase' : v==='list' ? '📃 List' : '🗃️ Kanban';
      return '<div class="imt-viewtab'+(view===v?' on':'')+'" onclick="window.imtSetBoardView(\''+v+'\')">'+lbl+'</div>';
    }).join('');

    var header = '<div class="imt-ws-header">'
      +   '<div class="imt-ws-title-block">'
      +     '<div class="imt-ws-progress-ring" style="--pct:'+pct+'"><span>'+pct+'%</span></div>'
      +     '<div class="imt-ws-title">'+esc(proj.name)+'</div>'
      +   '</div>'
      +   '<div class="imt-viewswitch">'+viewTabsHtml+'</div>'
      +   '<div class="imt-ws-actions">'
      +     (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-pri btn-sm" onclick="window.openImtPhaseModal(null)" title="เพิ่ม Phase">+<span class="btn-label"> Phase</span></button>' : '')
      +     (window.canAdd(window.IMPL_MODULE) && phases.length ? '<button class="btn btn-ghost btn-sm" onclick="window.imtSaveProjectAsTemplate(\''+pid+'\')" title="บันทึกเป็น Template">📐<span class="btn-label"> บันทึกเป็น Template</span></button>' : '')
      +     (window.canEdit(window.IMPL_MODULE) ? '<button class="btn btn-ghost btn-sm" onclick="window.openImtProjectModal(\''+pid+'\')" title="แก้ไขโครงการ">✏️</button>' : '')
      +     (window.canDel(window.IMPL_MODULE) ? '<button class="btn btn-ghost btn-sm imt-ws-danger" onclick="window.askDel(\'imt_project\',\''+pid+'\',\''+esc(proj.name)+'\')" title="ลบโครงการ">🗑️</button>' : '')
      +   '</div>'
      + '</div>';

    var f = window.imtTaskFilter || {};
    // ── ตัวกรอง "ผู้รับผิดชอบ" ใช้ทีมงานของโครงการต้นทาง (imtProjectTeamStaff — แหล่งเดียวกับที่ใช้เติม
    // ตัวเลือกตอนมอบหมายงานใน Task modal) ไม่ใช่พนักงานทั้งบริษัท และไม่ใช่แค่คนที่ถูกมอบหมายไปแล้ว
    // (เผื่อยังมอบหมายไม่ครบทุกคน) — แสดงป้ายกำกับเป็น "ชื่อ-นามสกุล (ชื่อเล่น)" ให้อ่านง่ายขึ้น ──
    var ownerOpts = ['<option value="">ทุกคน</option>'].concat(imtProjectTeamStaff(pid).map(function (s) {
      var nick = s.nickname || s.name;
      return { n:nick, label:s.name+' ('+nick+')' };
    }).sort(function (a,b) { return a.label.localeCompare(b.label, 'th'); }).map(function (o) {
      return '<option value="'+esc(o.n)+'"'+(f.owner===o.n?' selected':'')+'>'+esc(o.label)+'</option>';
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
    mount.innerHTML = header + filterBar + '<div class="imt-ws-scroll" style="padding:'+(view==='kanban'?'0':'16px 24px')+';overflow-y:auto;flex:1;">'+body+'</div>';
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

  function renderPhaseAccordion(ph, idx, total) {
    var allTasks = imtTasksOfPhase(ph.id);
    var tasks = imtFilteredTasks(allTasks);
    var pct = window.calcPhaseProgress(ph);
    var st = imtStatus(ph.status);
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
      +   statusTag(st) + '<div class="imt-phase-pbar">'+pbarHtml(pct)+'</div><span style="font-size:11px;font-weight:700;width:34px;text-align:right;">'+pct+'%</span>'
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
      + statusTag(st)
      + pbarHtml(pct, st.color)
      + '<div class="imt-tcard-foot"><span>👤 '+esc(t.owner||'-')+'</span><span>'+(t.due?('⏰ '+fd(t.due)):'')+'</span></div>'
      + (ck.length ? '<div class="imt-tcard-ck">☑ '+doneCk+'/'+ck.length+' Checklist</div>' : '')
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
      + '<div class="f-group"><label class="f-label">สถานะ</label><select class="f-input" id="imt-ph-status">'+window.IMPL_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(ph.status===s.id?' selected':'')+'>'+s.icon+' '+s.label+'</option>'; }).join('')+'</select></div>';
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
    window.imtCurrentTaskId = id;
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
      + '<div class="f-grid"><div class="f-group"><label class="f-label">👤 ผู้รับผิดชอบ</label>' + imtStaffComboMarkup(t.owner, !canEdit) + '</div>'
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
    if (canEdit) window._initImtStaffCombobox && window._initImtStaffCombobox(imtProjectTeamStaff(window.imtCurrentProjectId), t.owner);
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
      owner: window.staffIdByRef(document.getElementById('imt-t-owner').value.trim()), // ช่องเลือกให้ชื่อเล่น → เก็บเป็นรหัสพนักงาน
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
    var actor = (window.cu && (window.cu.name || window.cu.username)) || '';
    var row = { task_id:c.taskId, checklist_name:c.name, is_done:done, done_date: done ? new Date().toISOString().slice(0,10) : null, done_by: done ? actor : '', remark:c.remark, sort_order:c.order };
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
    var author = (window.cu && (window.cu.name || window.cu.username)) || '';
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

  // ── "ผู้แก้ไข" เก็บเป็นชื่อเล่น (nickname) ในฐานข้อมูล (ดู fixedByOpts ใน openImtIssueModal — ตาม
  // convention เดียวกับ Task.owner) แต่ตารางทะเบียนต้องการโชว์ชื่อจริงให้อ่านง่ายกว่า — หาไม่เจอ
  // (เช่น พนักงานลาออกไปแล้ว/พิมพ์เอง) ก็ใช้ค่าที่เก็บไว้ตรง ๆ แทน ──
  function imtStaffNameByNick(nick) {
    if (!nick) return '';
    var s = (window.STAFF || []).find(function (x) { return (x.nickname || x.name) === nick; });
    return s ? s.name : nick;
  }

  function imtIssueStatC(k, v, icon, color) {
    return '<div class="stat-c imt-stat-c"><div class="stat-icon" style="background:'+color+'18;color:'+color+'">'+icon+'</div>'
      + '<div class="imt-stat-text"><div class="stat-k">'+k+'</div><div class="stat-v">'+v+'</div></div></div>';
  }

  function renderImtIssues(mount) {
    var pid = window.imtCurrentProjectId;
    var proj = imtProject(pid);
    if (!proj) { mount.innerHTML = projectPicker(); return; }

    var all = imtIssuesOfProject(pid);
    var openN = all.filter(function (i) { return i.status === 'open'; }).length;
    var progN = all.filter(function (i) { return i.status === 'in_progress'; }).length;
    var doneN = all.filter(function (i) { return i.status === 'closed'; }).length;

    // ── ชื่อโครงการซ้ำ (ตัวเลือก "กำลังดู" ด้านบนก็โชว์อยู่แล้ว) + KPI 4 ใบใหญ่ กินพื้นที่จอมือถือเยอะ
    // เกินไปก่อนจะเห็นรายการปัญหาสักใบ — ใส่ class เฉพาะจุด (imt-issue-ws-title/imt-issue-stat-row) ให้
    // ซ่อน/ย่อบนมือถือ (ดู responsive override ใน impl-tracker.css) โดยไม่กระทบแท็บอื่นที่ใช้ class ฐาน
    // เดียวกัน (imt-ws-title/imt-stat-row) ร่วมกันอยู่ ──
    var header = '<div class="imt-ws-header">'
      +   '<div class="imt-ws-title-block"><div class="imt-ws-title imt-issue-ws-title">🩹 ปัญหาการใช้งาน — '+esc(proj.name)+'</div></div>'
      +   '<div class="imt-ws-actions">'
      +     '<button class="btn btn-xls btn-sm" onclick="window.exportImtIssuesExcel()" title="ส่งออก Excel">📥<span class="btn-label"> Excel</span></button>'
      +     '<button class="btn btn-ghost btn-sm" onclick="window.openImtIssuePrintModal()" title="พิมพ์รายงานสรุปให้ รพ. เซ็นรับทราบ">🖨️<span class="btn-label"> พิมพ์รายงาน</span></button>'
      +     '<button class="btn btn-ghost btn-sm" onclick="window.imtOpenPublicDashboard()" title="เปิด/คัดลอกลิงก์ Dashboard สาธารณะของ รพ. นี้ ไม่ต้อง login — ใช้นำเสนอตอนสรุปงานได้">🖼️<span class="btn-label"> Dashboard</span></button>'
      +     (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-ghost btn-sm" onclick="window.openImtBulkModal()" title="วางแชท LINE หรือเปิดไฟล์บันทึกแชท (.txt) / บันทึกประชุม ให้ AI แยกเป็นปัญหาหลายข้อในครั้งเดียว">🤖<span class="btn-label"> วางแชท LINE (AI)</span></button>' : '')
      +     (window.canAdd(window.IMPL_MODULE) ? '<button class="btn btn-pri btn-sm" onclick="window.openImtIssueModal(null)">+<span class="btn-label"> แจ้งปัญหาใหม่</span></button>' : '')
      +   '</div>'
      + '</div>';

    var kpis = '<div class="stat-row imt-stat-row imt-issue-stat-row" style="grid-template-columns:repeat(4,1fr);margin:0 24px 12px;">'
      + imtIssueStatC('ทั้งหมด', all.length, '🗂️', 'var(--indigo)')
      + imtIssueStatC('รอดำเนินการ', openN, '🔴', 'var(--coral)')
      + imtIssueStatC('กำลังดำเนินการ', progN, '🔵', 'var(--indigo)')
      + imtIssueStatC('ดำเนินการแล้ว', doneN, '✅', 'var(--teal)')
      + '</div>';

    var f = window.imtIssueFilter || {};
    var catOpts = ['<option value="">ทุกกลุ่มปัญหา</option>'].concat(imtIssueCategories().map(function (c) {
      return '<option value="'+esc(c)+'"'+(f.category===c?' selected':'')+'>'+esc(c)+'</option>';
    })).join('');
    var stOpts = ['<option value="">ทุกสถานะ</option>'].concat(window.IMPL_ISSUE_STATUS.map(function (s) {
      return '<option value="'+s.id+'"'+(f.status===s.id?' selected':'')+'>'+esc(s.label)+'</option>';
    })).join('');
    var filterBar = '<div class="imt-ws-filterbar imt-issue-filterbar">'
      + '<div class="t-search"><input placeholder="ค้นหาปัญหา/หน่วยงาน..." value="'+esc(f.q||'')+'" oninput="window.imtSetIssueFilter(\'q\',this.value)"></div>'
      + '<select class="t-sel" onchange="window.imtSetIssueFilter(\'status\',this.value)">'+stOpts+'</select>'
      + '<select class="t-sel" onchange="window.imtSetIssueFilter(\'category\',this.value)">'+catOpts+'</select>'
      + '</div>';

    var rows = imtFilteredIssues(pid);
    // ── "ลำดับ" เป็นคอลัมน์แรกตามปกติ (ธรรมเนียมตาราง) — บนมือถือที่ .m-card-table ใช้คอลัมน์แรกเป็น
    // หัวการ์ดโดย default นั้นไม่เหมาะกับ "ลำดับ" (แค่ตัวเลข ไม่สื่อความหมาย) จึงจัดการแยกเฉพาะจุดผ่าน
    // class "imt-issues-tbl"/"imt-card-title" แทนการสลับลำดับคอลัมน์จริง — ดู responsive override ใน
    // impl-tracker.css ที่คืนคอลัมน์แรกเป็นช่องปกติ แล้วเลื่อนสิทธิ์ "หัวการ์ด" มาให้ td.imt-card-title
    // (ปัญหา) แทน โดยไม่กระทบลำดับคอลัมน์ desktop หรือ .m-card-table ตารางอื่นในแอป ──
    var rowsHtml = rows.map(function (i, idx) {
      var st = imtIssueStatus(i.status);
      return '<tr onclick="window.openImtIssueModal(\''+i.id+'\')">'
        + '<td style="text-align:center;">'+(idx + 1)+'</td>'
        + '<td class="imt-card-title" style="min-width:220px;max-width:420px;white-space:normal;overflow-wrap:anywhere;">'+esc(i.problem)+'</td>'
        + '<td>'+statusTag(st)+'</td>'
        + '<td style="white-space:nowrap;">'+fd(i.createdAt)+'</td>'
        + '<td><span class="tag">'+esc(i.category||'-')+'</span></td>'
        + '<td>'+esc(i.reportedBy||'-')+'</td>'
        + '<td>'+esc(i.department||'-')+'</td>'
        + '<td>'+esc(i.receivedBy||'-')+'</td>'
        + '<td>'+esc(i.fixedBy ? imtStaffNameByNick(i.fixedBy) : '-')+'</td>'
        + '<td style="white-space:nowrap;">'+(i.fixedDate?fd(i.fixedDate):'-')+'</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="10" style="text-align:center;color:var(--txt3);padding:30px;">ยังไม่มีปัญหาที่บันทึกไว้ในโครงการนี้</td></tr>';

    var table = '<div class="dtable-inner"><table class="imt-issues-tbl"><thead><tr>'
      + '<th>ลำดับ</th><th>ปัญหา</th><th>สถานะ</th><th>วันที่รับ</th><th>กลุ่มปัญหา</th><th>ผู้แจ้ง</th><th>หน่วยงาน</th><th>ผู้รับปัญหา</th><th>ผู้แก้ไข</th><th>วันที่แก้ไข</th>'
      + '</tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';

    mount.innerHTML = header + kpis + filterBar
      + '<div class="imt-ws-scroll" style="padding:0 24px 24px;overflow-y:auto;flex:1;">'+table+'</div>'
      + '<div class="imt-print-only" id="imt-issue-print-doc"></div>';
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
  function imtAiSimilarIssues(text, pid, excludeId) {
    var myType = imtProjectTypeId(pid), typeCache = {};
    return (window.IMPL_ISSUES || []).filter(function (x) { return x.id !== excludeId && (x.solution || '').trim(); })
      .map(function (x) {
        if (!(x.projectId in typeCache)) typeCache[x.projectId] = imtProjectTypeId(x.projectId);
        var score = window.aiTextSim(text, x.problem) + (myType && typeCache[x.projectId] === myType ? 0.08 : 0);
        return { issue: x, score: score };
      })
      .filter(function (r) { return r.score >= 0.2; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 5).map(function (r) { return r.issue; });
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
      var sim = imtAiSimilarIssues(problem, pid, window.imtEditIssueId);
      var proj = imtProject(pid);
      var user = 'กลุ่มปัญหาที่เลือกได้ (ตอบชื่อให้ตรงตัวอักษร):\n' + cats.map(function (c) { return '- ' + c; }).join('\n')
        + '\n\nโครงการ: ' + ((proj && proj.name) || '-')
        + '\nแผนกที่แจ้ง: ' + (((document.getElementById('imt-is-dept') || {}).value || '').trim() || '-')
        + '\nรายละเอียดปัญหา: ' + problem.slice(0, 1500)
        + (sim.length ? '\n\nปัญหาเก่าที่คล้ายกันและวิธีแก้ที่เคยใช้:\n' + sim.map(function (x, n) {
            return (n + 1) + ') [' + (x.category || '-') + '] ' + String(x.problem).slice(0, 200) + '\n   วิธีแก้: ' + String(x.solution).slice(0, 300);
          }).join('\n') : '');
      var res = await window.aiChatJson(
        'คุณเป็นผู้ช่วยทีมติดตั้งระบบซอฟต์แวร์โรงพยาบาล วิเคราะห์ปัญหาการใช้งานที่ รพ. แจ้ง แล้วตอบ "เฉพาะ JSON" รูปแบบ: '
        + '{"category":"<ชื่อกลุ่มปัญหาจากรายการ หรือ empty ถ้าไม่แน่ใจ>","solution_hint":"<แนวทางแก้ไขภาษาไทย 1–4 ประโยค>",'
        + '"confidence":"low|medium|high","reason":"<เหตุผลสั้น ๆ>"} · ถ้ามีปัญหาเก่าที่คล้ายกัน ให้อิงวิธีแก้เหล่านั้นเป็นหลัก',
        user, { maxTokens: 500 });
      _imtAiLast = {
        category: cats.indexOf(res.category) > -1 ? res.category : '',
        solution: String(res.solution_hint || '').trim(),
        confidence: res.confidence || '', reason: String(res.reason || '').trim(), similar: sim,
      };
      imtAiAutoFill(_imtAiLast);
      out.innerHTML = imtAiCardHtml(_imtAiLast);
    } catch (e) {
      out.innerHTML = '<div class="ai-out" style="color:var(--coral);font-size:12px;">' + esc(String(e.message || e)) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldTxt; }
    }
  };
  function imtAiCardHtml(s) {
    var conf = { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' }[s.confidence] || s.confidence || '-';
    var hasSolutionBox = !!document.getElementById('imt-is-solution');
    var filled = '<span class="ai-use" style="color:var(--teal);font-size:11.5px;font-weight:700;">✓ เติมให้แล้ว</span>';
    // แบบย่อ 1 บรรทัด (กลุ่มปัญหา) กด "ดูเพิ่มเติม" เพื่อดูแนวทางแก้/ปัญหาเก่าที่คล้ายกัน
    var filledAny = s.category || (s.solution && hasSolutionBox);
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
      +   (hasSolutionBox ? filled : '<button type="button" class="btn btn-ghost btn-sm ai-use" onclick="window.imtAiCopyHint()">คัดลอก</button>') + '</div>' : '')
      + (s.similar.length ? '<details style="font-size:11.5px;margin-top:4px;"><summary style="cursor:pointer;color:var(--txt2);">ปัญหาเก่าที่คล้ายกัน</summary>'
      +   s.similar.map(function (x) {
            return '<div style="padding:4px 0;border-bottom:1px dashed var(--border);"><b>' + esc(String(x.problem).slice(0, 120)) + '</b>'
              + '<div style="color:var(--txt3);">' + esc((imtProject(x.projectId) || {}).name || '') + ' · วิธีแก้: ' + esc(String(x.solution).slice(0, 200)) + '</div></div>';
          }).join('') + '</details>' : '')
      + (s.reason ? '<div style="font-size:11px;color:var(--txt3);margin-top:4px;">เหตุผล: ' + esc(s.reason) + '</div>' : '')
      + '<div style="font-size:10.5px;color:var(--txt3);margin-top:4px;">* AI ช่วยแนะนำเท่านั้น ตรวจสอบก่อนใช้เสมอ</div>',
    });
  }
  // ── เติมกลุ่มปัญหา + วิธีแก้ไขจากผล AI ให้ทันที (ไม่ต้องกดเลือก) พร้อมป้ายสีแดงว่ามาจาก AI ──
  // วิธีแก้ไข: ช่องว่าง = ใส่ให้เลย · มีข้อความอยู่แล้ว = ต่อท้าย (ไม่ซ้ำถ้ากด AI ซ้ำ) · แจ้งปัญหาใหม่ไม่มีช่องนี้
  function imtAiAutoFill(s) {
    var c = document.getElementById('imt-is-cat');
    if (c && s.category) { c.value = s.category; imtMarkInvalid(c, false); window.aiFlagField(c, c.value === s.category); }
    var ta = document.getElementById('imt-is-solution');
    if (ta && s.solution && ta.value.indexOf(s.solution) < 0) {
      ta.value = ta.value.trim() ? ta.value.trim() + '\n' + s.solution : s.solution;
      window.aiFlagField(ta, true);
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
  // ── ตัวเลือก "ผู้รับปัญหา" จากรายชื่อในระบบ: ทีมโครงการก่อน แล้วพนักงานอื่น · เก็บเป็นชื่อ (ตามข้อมูลเดิม)
  // ค่าเดิมที่ไม่อยู่ในรายชื่อ (เช่น ข้อมูลนำเข้า/คนนอกทีม) แทรกไว้บนสุดให้ยังเลือกค้างได้ ──
  function imtReceiverOptions(pid, cur) {
    var team = imtProjectTeamStaff(pid), inTeam = {};
    team.forEach(function (s) { inTeam[s.id] = true; });
    var others = (window.STAFF || []).filter(function (s) { return s.active !== false && s.name && !inTeam[s.id]; });
    var byName = function (a, b) { return a.name.localeCompare(b.name, 'th'); };
    var opt = function (s) { return '<option value="' + esc(s.name) + '"' + (s.name === cur ? ' selected' : '') + '>' + esc(s.name) + (s.nickname ? ' (' + esc(s.nickname) + ')' : '') + '</option>'; };
    var known = team.concat(others).some(function (s) { return s.name === cur; });
    return (cur && !known ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>' : '')
      + (cur ? '' : '<option value="">-- เลือกผู้รับปัญหา --</option>')
      + (team.length ? '<optgroup label="ทีมโครงการ">' + team.slice().sort(byName).map(opt).join('') + '</optgroup>' : '')
      + (others.length ? '<optgroup label="พนักงานอื่น">' + others.sort(byName).map(opt).join('') + '</optgroup>' : '');
  }
  window.openImtBulkModal = function () {
    var pid = window.imtCurrentProjectId, proj = imtProject(pid);
    if (!proj) return;
    var curName = (window.cu && (window.cu.name || window.cu.username)) || '';
    var deptOpts = imtIssueDepartments(pid).map(function (d) { return '<option value="' + esc(d) + '">'; }).join('');
    document.getElementById('m-imt-bulk-body').innerHTML =
      '<div id="imtbk-step1">'
      + '<div style="font-size:12.5px;margin-bottom:8px;">โครงการ: <b>' + esc(proj.name) + '</b></div>'
      + window.lineChat.panelHtml('imtbk')
      + '<div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;">'
      +   '<div class="f-group"><label class="f-label">ผู้แจ้ง (ถ้าแชทไม่ระบุ)</label><input class="f-input" id="imt-bk-rep" placeholder="ชื่อผู้แจ้ง"></div>'
      +   '<div class="f-group"><label class="f-label">หน่วยงาน (ถ้าแชทไม่ระบุ)</label><input class="f-input" id="imt-bk-dept" list="imt-bk-dept-dl" placeholder="เช่น ห้องจ่ายยา IPD"><datalist id="imt-bk-dept-dl">' + deptOpts + '</datalist></div>'
      +   '<div class="f-group"><label class="f-label">ผู้รับปัญหา <span class="imt-req">*</span></label><select class="f-input" id="imt-bk-recv">' + imtReceiverOptions(pid, curName) + '</select></div>'
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
      + (c.numbered ? ',"first_msg":<เลขข้อความที่เริ่มแจ้ง>,"last_msg":<เลขข้อความสุดท้ายของเรื่องนี้>' : '') + '}]} '
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
        var ex = window.lineChat.excerpt(c.msgs, x.first_msg, x.last_msg), closed = x.solved === true && !!solution;
        var fixer = closed ? window.lineChat.matchPerson(x.handled_by, team) : null;
        var it = {
          problem: problem,
          department: String(x.department || '').trim(),
          reportedBy: String(x.reported_by || '').trim(),
          category: cats.indexOf(x.category) > -1 ? x.category : '',
          status: closed ? 'closed' : 'open',
          solution: solution,
          fixedBy: fixer ? (fixer.nickname || fixer.name) : '',
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
        var recv = imtBkVal('imt-bk-recv');
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
          ].concat(x.status === 'closed' ? [['🔧', 'ผู้แก้ไข', x.fixedBy ? imtStaffNameByNick(x.fixedBy) : '']] : []),
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
              +   h.fld('ผู้แก้ไข', '<select class="f-input"' + h.pick('fixedBy') + '>' + h.opt('', '— ไม่ระบุ —', !x.fixedBy) + team.map(function (s) { var nk = s.nickname || s.name; return h.opt(nk, s.name + ' (' + nk + ')', nk === x.fixedBy); }).join('') + '</select>')
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
          receivedBy: imtBkVal('imt-bk-recv'), receivedDate: x.createdAt || '',
          fixedBy: closed ? x.fixedBy : '', fixedDate: closed ? x.fixedDate : '',
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

  // ── Add/Edit Modal ──
  window.openImtIssueModal = function (id) {
    window.imtEditIssueId = id;
    var pid = window.imtCurrentProjectId;
    var cats = imtIssueCategories();
    var curName = (window.cu && (window.cu.name || window.cu.username)) || '';
    var i = id ? imtIssue(id) : { department:'', reportedBy:'', problem:'', category:'', status:'open', solution:'', receivedBy:curName, fixedBy:'', fixedDate:'', createdAt:new Date().toISOString() };
    var catOpts = '<option value="">--ระบุกลุ่มปัญหา--</option>' + cats.map(function (c) { return '<option value="'+esc(c)+'"'+(i.category===c?' selected':'')+'>'+esc(c)+'</option>'; }).join('');
    var stOpts = window.IMPL_ISSUE_STATUS.map(function (s) { return '<option value="'+s.id+'"'+(i.status===s.id?' selected':'')+'>'+esc(s.label)+'</option>'; }).join('');
    // ── "ผู้แก้ไข" เลือกจากทีมงานของโครงการนี้เท่านั้น (imtProjectTeamStaff — แหล่งเดียวกับตัวกรอง
    // "ผู้รับผิดชอบ" ในแท็บ "งาน") เก็บเป็นชื่อเล่น (nickname) ตาม convention เดียวกับ Task.owner ──
    var teamStaff = imtProjectTeamStaff(pid);
    var curStaffId = (window.cu && (window.cu.staffId || window.cu.staff_id)) || '';
    var curTeamMember = teamStaff.find(function (s) { return s.id === curStaffId; });
    var curNick = curTeamMember ? (curTeamMember.nickname || curTeamMember.name) : '';
    // ยังไม่มีใครแก้จริง (fixedBy ว่าง) → เดาให้เป็นคน Login เอง (ถ้าอยู่ในทีมโครงการนี้) กดบันทึกได้เลยไม่ต้องเลือกเอง
    var defaultFixedBy = i.fixedBy || curNick;
    // ── ข้อมูลเก่า/นำเข้าจาก Excel อาจเก็บชื่อที่ไม่ตรงกับทีมงานปัจจุบันของโครงการนี้เป๊ะ ๆ (คนละชื่อเล่น/
    // ไม่ได้อยู่ในทีมที่ตั้งค่าไว้ตอนนี้แล้ว) — ถ้าไม่แทรกตัวเลือกนี้เข้าไปเอง <select> จะไม่มี option ไหน
    // ตรงกับค่าที่เก็บไว้เลย เบราว์เซอร์เลย fallback ไปเลือก "— ไม่ระบุ —" (option แรก) แทนโดยอัตโนมัติ
    // ทำให้ดูเหมือนข้อมูล "หายไป" ทั้งที่ยังอยู่ใน DB ปกติ (แค่ dropdown แสดงผิด) ──
    var extraFixedByOpt = '';
    if (defaultFixedBy && !teamStaff.some(function (s) { return (s.nickname || s.name) === defaultFixedBy; })) {
      var matchedStaff = (window.STAFF || []).find(function (s) { return (s.nickname || s.name) === defaultFixedBy; });
      var extraLabel = matchedStaff ? matchedStaff.name + ' (' + defaultFixedBy + ')' : defaultFixedBy + ' (ไม่อยู่ในทีมโครงการนี้)';
      extraFixedByOpt = '<option value="' + esc(defaultFixedBy) + '" selected>' + esc(extraLabel) + '</option>';
    }
    var fixedByOpts = ['<option value="">— ไม่ระบุ —</option>', extraFixedByOpt].concat(teamStaff.map(function (s) {
      var nick = s.nickname || s.name;
      return { n:nick, label:s.name+' ('+nick+')' };
    }).sort(function (a, b) { return a.label.localeCompare(b.label, 'th'); }).map(function (o) {
      return '<option value="'+esc(o.n)+'"'+(defaultFixedBy===o.n?' selected':'')+'>'+esc(o.label)+'</option>';
    })).join('');
    // ครั้งแรก (แจ้งปัญหาใหม่) แสดงแค่ข้อมูลรับแจ้ง — ส่วน "การแก้ไข" (วิธีแก้/ผู้แก้ไข/วันที่แก้)
    // ยังไม่มีข้อมูลจริง เลยซ่อนไว้ก่อน มาแสดงตอนกดแก้ไขปัญหาที่บันทึกไว้แล้วเท่านั้น — และเน้นให้เด่น
    // เพราะตอนกดแก้ไขส่วนใหญ่ก็เพื่อมาลงรายละเอียดตรงนี้เป็นหลัก ──
    var resolutionSection = id
      ? '<div style="border:1.5px solid var(--violet);background:rgba(124,92,252,.06);border-radius:10px;margin-top:14px;padding:12px 14px;">'
        + '<div class="f-label" style="font-weight:700;color:var(--violet);margin-bottom:2px;">🔧 การแก้ไข</div>'
        + '<div class="f-group"><label class="f-label">วิธีการแก้ไข</label><textarea class="f-input" id="imt-is-solution" rows="4" placeholder="พิมพ์รายละเอียดการแก้ไขที่นี่...">'+esc(i.solution)+'</textarea></div>'
        + '<div class="m-stack" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        +   '<div class="f-group"><label class="f-label">ผู้แก้ไข</label><select class="f-input" id="imt-is-fixed-by" onchange="window.imtCheckIssueAutoClose()">'+fixedByOpts+'</select></div>'
        +   '<div class="f-group"><label class="f-label">วันที่แก้ไขปัญหา</label><input type="date" class="f-input" id="imt-is-fixed-date" value="'+esc(i.fixedDate||'')+'" onchange="window.imtCheckIssueAutoClose()"></div>'
        + '</div>'
      + '</div>'
      : '';
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
      +   '<div class="f-group"><label class="f-label">สถานะ <span class="imt-req">*</span></label><select class="f-input" id="imt-is-status">'+stOpts+'</select></div>'
      +   '<div class="f-group"><label class="f-label">ผู้รับปัญหา <span class="imt-req">*</span></label><select class="f-input" id="imt-is-received-by">'+imtReceiverOptions(pid, i.receivedBy)+'</select></div>'
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
      receivedBy: receivedBy,
      fixedBy: fixedByEl ? fixedByEl.value.trim() : '',
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
    }).join('') || '<tr><td colspan="10" style="text-align:center;color:#888;padding:16px;">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>';

    return '<div class="imt-idoc">'
      + '<div class="imt-idoc-head"><img class="imt-idoc-headerimg" src="img/BMS-Header.jpg" alt="บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด"></div>'
      + '<div class="imt-idoc-title">ไฟล์สรุปปัญหาการใช้งานโปรแกรม '+esc(proj.name)+'</div>'
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
      + '</tr></thead><tfoot><tr class="sp"><td colspan="10"></td></tr></tfoot><tbody>'+trs+'</tbody></table>'
      + '<div class="imt-idoc-sign">'
      +   '<div class="imt-idoc-sb"><div class="imt-idoc-line"></div><div class="imt-idoc-nm">('+esc(opts.signLName||'')+')</div><div>ตำแหน่ง '+esc(opts.signLPos||'')+'</div><div>'+esc(opts.signLOrg||'')+'</div></div>'
      +   '<div class="imt-idoc-sb"><div class="imt-idoc-line"></div><div class="imt-idoc-nm">('+esc(opts.signRName||'')+')</div><div>ตำแหน่ง '+esc(opts.signRPos||'')+'</div><div>'+esc(opts.signROrg||'')+'</div></div>'
      + '</div>'
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
      var items = (window.STAFF || []).filter(function (s) { return s.active !== false; })
        .map(function (s) { return { name: s.name, sub: (s.role || '') + (s.role && s.dept ? ' · ' : '') + (s.dept || '') }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });
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
    var o = window.imtIssuePrintOpts || {};
    // ── ผู้ลงนามฝั่งบริษัท: ดึงชื่อจาก "เจ้าของไซต์" ของโครงการต้นทาง (window.PROJECTS.siteOwner —
    // ฟิลด์เดียวกับที่ใช้ทั่วทั้งแอป ดู projects.js) + ตำแหน่งจากข้อมูลพนักงานตามชื่อนั้น ──
    var sp = imtResolveSourceProject(proj);
    var siteOwnerName = sp ? (sp.siteOwner || '') : '';
    // ── "โรงพยาบาล/หน่วยงาน" ฝั่งผู้ลงนาม รพ. — ถ้าเคยพิมพ์/เลือกไว้แล้วใช้ค่านั้น ไม่งั้นปล่อยว่างให้พิมพ์
    // ค้นหาเอง ห้าม default จาก proj.hospitalName เพราะคอลัมน์นั้นดันเก็บชื่อ "เจ้าของไซต์" (คน) มาตั้งแต่
    // ตอนสร้างโครงการ (ดู saveImtProject: hospital_name = sp.siteOwner) ไม่ใช่ชื่อโรงพยาบาลจริง — ถ้าเอามา
    // ตั้ง default ตรงนี้ จะกลายเป็นโชว์ชื่อคน (บ่อยครั้งคือคน Login เอง) แทนชื่อ รพ. ──
    var defOrgText = o.signROrg != null ? o.signROrg : '';
    var defOrgHosp = (window.HOSPITALS || []).find(function (h) { return imtHospDisplayText(h) === defOrgText; });
    var body = document.getElementById('m-imt-issue-print-body');
    body.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
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
        project_name: proj.name, hospital_name: proj.hospitalName, start_date: proj.start || null, end_date: proj.end || null,
        project_manager: proj.pm, status: proj.status, progress_percent: proj.progress, template_id: proj.templateId,
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

    var opts = window.imtIssuePrintOpts = {
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

    var toolbar = '<div class="toolbar"><div class="month-nav"><button class="mnav-btn" onclick="window.imtCalNav(-1)">‹</button>'
      + '<div class="month-lbl">'+window.THMON[m]+' '+(y+543)+'</div><button class="mnav-btn" onclick="window.imtCalNav(1)">›</button></div></div>';

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
    mount.innerHTML = toolbar + '<div class="imt-cal-grid">'+dow+cellsHtml+'</div>';
  }

  // ================================================================
  // REPORT — สรุป + Export Excel + Print (Save as PDF)
  // ================================================================
  function _imtDoExport(headers, rows, filename) {
    if (!window.XLSX) { window.showAlert && window.showAlert('ยังโหลด XLSX library ไม่เสร็จ', 'error'); return; }
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, filename + '_' + new Date().toISOString().slice(0,10) + '.xlsx');
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

  // ── Export เป็นรูปภาพ (PNG): ไม่ตัดพื้นที่ตามหน้ากระดาษ A4 เหมือน Print — รูปจะสูงเท่าเนื้อหาจริง
  // ไม่มีที่ว่างเหลือทิ้ง เหมาะกว่าตอนต้องการส่งไฟล์ให้ผู้บริหารดูทางไลน์/อีเมลโดยไม่ต้องเปิด PDF ──
  window.exportImtReportImage = async function () {
    if (!window.html2canvas) { window.showAlert && window.showAlert('ยังโหลดไลบรารีสร้างรูปภาพไม่เสร็จ ลองใหม่อีกครั้ง', 'error'); return; }
    var src = document.querySelector('.imt-print-page');
    if (!src) { window.showAlert && window.showAlert('ไม่พบข้อมูลสำหรับสร้างรูปภาพ กรุณาเลือกโครงการก่อน', 'error'); return; }
    var proj = imtProject(window.imtCurrentProjectId);
    var clone = src.cloneNode(true);
    clone.style.cssText = 'display:block;position:fixed;top:-100000px;left:0;width:1000px;height:auto;max-height:none;overflow:visible;background:#fff;padding:24px;';
    document.body.appendChild(clone);
    // รอ 2 เฟรมให้เบราว์เซอร์ layout เนื้อหาที่ clone มาให้เสร็จก่อน ค่อยวัดขนาดจริง (กันวัดขนาดผิดจนภาพถูกตัด)
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    try {
      var capW = clone.scrollWidth, capH = clone.scrollHeight;
      var canvas = await window.html2canvas(clone, {
        scale: 2, backgroundColor: '#ffffff',
        width: capW, height: capH, windowWidth: capW, windowHeight: capH,
      });
      var safeName = (proj ? proj.name : 'Report').replace(/[^a-zA-Z0-9ก-๙]+/g, '_');
      var link = document.createElement('a');
      link.download = 'ImplTracker_' + safeName + '_' + new Date().toISOString().slice(0,10) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      window.showAlert && window.showAlert('สร้างรูปภาพไม่สำเร็จ: ' + (e.message || e), 'error');
    } finally {
      document.body.removeChild(clone);
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
    var aiDate = window.imtAiSelectedDate || new Date().toISOString().slice(0,10);
    var toolbar = '<div class="toolbar">'
      + '<input type="date" class="f-input" id="imt-ai-date" style="max-width:150px;" value="'+esc(aiDate)+'" oninput="window.imtAiSelectedDate=this.value">'
      + '<button class="btn btn-pri btn-sm" onclick="window.imtGenerateAiWeekSummary()">✨ สรุปด้วย AI</button>'
      + '<div style="flex:1"></div>'
      + '<button class="btn btn-xls btn-sm" onclick="window.exportImtReport()">📥 Excel</button>'
      + '<button class="btn btn-pri btn-sm" onclick="window.exportImtReportImage()">📷 บันทึกเป็นรูปภาพ</button></div>';

    // ── สรุปภาพรวม: ใช้ร่วมกันทั้ง hero การ์ดบนจอ และกราฟแท่งในสรุปสำหรับพิมพ์ด้านล่าง ──
    var doneCount = tasks.filter(function (t) { return t.status === 'done'; }).length;
    var overdueCount = tasks.filter(function (t) { return window.imtIsOverdue(t); }).length;
    var statusCounts = window.IMPL_STATUS.map(function (st) {
      var n = tasks.filter(function (t) { return t.status === st.id; }).length;
      return { st:st, n:n, pct: tasks.length ? Math.round((n / tasks.length) * 100) : 0 };
    }).filter(function (x) { return x.n > 0; });

    // ── Hero: ring ความคืบหน้ารวม + ตัวเลขเด่น (แทน stat card 4 ใบเดิม ให้ดูเป็น dashboard มากขึ้น) ──
    var heroHtml = '<div class="imt-report-hero">'
      + '<div class="imt-report-hero-ring" style="--pct:'+overallPct+'"><span>'+overallPct+'%</span></div>'
      + '<div class="imt-report-hero-stats">'
      +   '<div class="imt-report-hero-stat"><b>'+tasks.length+'</b><span>📋 งานทั้งหมด</span></div>'
      +   '<div class="imt-report-hero-stat"><b>'+doneCount+'</b><span>✅ เสร็จแล้ว</span></div>'
      +   '<div class="imt-report-hero-stat"><b>'+overdueCount+'</b><span>⏰ ล่าช้า</span></div>'
      + '</div>'
      + '</div>';

    // ── Charts: สรุปสถานะงาน + ความคืบหน้าตาม Phase เป็นกราฟแท่งแนวนอน (canvas วาดหลังใส่ innerHTML
    // ในฟังก์ชัน imtRenderReportCharts — ใช้ Chart.js เดียวกับหน้า Overview เพื่อความสอดคล้องกันทั้งระบบ) ──
    var chartsGrid = '<div class="imt-report-chartsgrid">'
      + '<div class="imt-report-chartcard"><div class="imt-report-chartcard-title">📊 สรุปสถานะงาน</div>'
      +   (statusCounts.length ? '<div class="imt-report-chartcard-canvaswrap" style="height:'+Math.max(150, statusCounts.length*36)+'px;"><canvas id="chart-imt-status"></canvas></div>' : '<div class="imt-report-chartcard-empty">ไม่มีข้อมูลงาน</div>')
      + '</div>'
      + '<div class="imt-report-chartcard"><div class="imt-report-chartcard-title">📈 ความคืบหน้าตาม Phase</div>'
      +   (phases.length ? '<div class="imt-report-chartcard-canvaswrap" style="height:'+Math.max(150, phases.length*36)+'px;"><canvas id="chart-imt-phase"></canvas></div>' : '<div class="imt-report-chartcard-empty">ยังไม่มี Phase</div>')
      + '</div>'
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
        + '<div class="imt-report-pcard-top"><span><span class="imt-phase-num">Phase '+(idx+1)+'</span> <span class="imt-report-pcard-name">'+esc(p.name)+'</span></span><span class="imt-report-pcard-pct" style="color:'+color+'">'+pct+'%</span></div>'
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
      return { name:ph.name, num:phIdx+1, color:imtStatus(ph.status).color, pct:window.calcPhaseProgress(ph), rows:itemRows };
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

    var printOnly = '<div class="imt-print-only imt-print-page"><div class="imt-print-checklist">'
      + '<div class="ppc-header-card">'
      +   '<div class="ppc-title">'+esc(proj.name)+'</div>'
      +   '<div class="ppc-subtitle">'
      +     (proj.hospitalName ? '👤 PM: '+esc(proj.hospitalName)+' · ' : '')
      +     (proj.pm ? '🔧 ผู้ติดตั้ง: '+esc(proj.pm)+' · ' : '')
      +     'งานทั้งหมด '+tasks.length+' · พิมพ์เมื่อ '+fd(new Date().toISOString())
      +   '</div>'
      +   '<div class="ppc-progress-row"><div class="ppc-progress-num">'+overallPct+'%</div>'
      +     '<div class="ppc-progress-bar-wrap"><div class="ppc-progress-bar" style="width:'+overallPct+'%;"></div></div></div>'
      + '</div>'
      + '<div class="ppc-chart">'+chartHtml+'</div>'
      + '<div class="ppc-cols">'+phaseGroupsHtml+'</div>'
      + '</div></div>';

    mount.innerHTML = toolbar + heroHtml + chartsGrid + phaseGrid + printOnly;
    imtRenderReportCharts(statusCounts, phases);
  }

  // ── กราฟหน้า Report: Chart.js เดียวกับที่ใช้ในหน้า Overview (window.cXxx.destroy() ก่อนสร้างใหม่
  // ทุกครั้งกันแคนวาสซ้อนกันตอน re-render) ต้องเรียกหลัง mount.innerHTML เท่านั้น เพราะต้องมี <canvas>
  // ในหน้าเว็บจริงแล้ว getElementById ถึงจะเจอ ──
  function imtRenderReportCharts(statusCounts, phases) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = 'Plus Jakarta Sans';
    Chart.defaults.color = '#9ba3b8';

    if (window.cImtStatus) { window.cImtStatus.destroy(); window.cImtStatus = null; }
    var ctxSt = document.getElementById('chart-imt-status');
    if (ctxSt && statusCounts.length) {
      window.cImtStatus = new Chart(ctxSt, {
        type: 'bar',
        data: {
          labels: statusCounts.map(function (x) { return x.st.icon+' '+x.st.label; }),
          datasets: [{
            data: statusCounts.map(function (x) { return x.n; }),
            backgroundColor: statusCounts.map(function (x) { return x.st.color+'cc'; }),
            borderColor: statusCounts.map(function (x) { return x.st.color; }),
            borderWidth: 1.5, borderRadius: 6, barThickness: 20,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          onHover: function (ev, els) { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
          onClick: function (ev, els) {
            if (!els.length) return;
            window.imtGoToTaskStatus(statusCounts[els[0].index].st.id);
          },
          plugins: {
            legend: { display:false },
            tooltip: { callbacks: { label: function (c) { var x = statusCounts[c.dataIndex]; return ' '+x.n+' งาน ('+x.pct+'%) — คลิกดูรายการ'; } } },
          },
          scales: {
            x: { grid:{color:'rgba(0,0,0,.06)'}, ticks:{font:{size:10}, precision:0} },
            y: { grid:{display:false}, ticks:{font:{size:11, weight:'600'}} },
          },
        },
      });
    }

    if (window.cImtPhase) { window.cImtPhase.destroy(); window.cImtPhase = null; }
    var ctxPh = document.getElementById('chart-imt-phase');
    if (ctxPh && phases.length) {
      var phasePct = phases.map(function (p) { return window.calcPhaseProgress(p); });
      var phaseColors = phasePct.map(imtPhaseHealthColor);
      window.cImtPhase = new Chart(ctxPh, {
        type: 'bar',
        data: {
          labels: phases.map(function (p, i) { return 'Phase '+(i+1)+': '+p.name; }),
          datasets: [{
            data: phasePct,
            backgroundColor: phaseColors.map(function (c) { return c+'cc'; }),
            borderColor: phaseColors, borderWidth: 1.5, borderRadius: 6, barThickness: 20,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          onHover: function (ev, els) { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
          onClick: function (ev, els) {
            if (!els.length) return;
            window.imtGoToPhaseTasks(phases[els[0].index].id);
          },
          plugins: {
            legend: { display:false },
            tooltip: { callbacks: { label: function (c) { return ' '+c.parsed.x+'% เสร็จ — คลิกดูงานใน Phase นี้'; } } },
          },
          scales: {
            x: { min:0, max:100, grid:{color:'rgba(0,0,0,.06)'}, ticks:{font:{size:10}, callback:function (v) { return v+'%'; }} },
            y: { grid:{display:false}, ticks:{font:{size:10.5, weight:'600'}} },
          },
        },
      });
    }
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
    var selDate = (dateInput && dateInput.value) || new Date().toISOString().slice(0,10);
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
    var user = 'โครงการ: ' + proj.name + (proj.hospitalName ? ' (' + proj.hospitalName + ')' : '') + '\n'
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

  // ── "ผู้แก้ไข" ในไฟล์นำเข้าจะพิมพ์เป็นชื่อเล่นหรือชื่อ-นามสกุลเต็มก็ได้ (เพื่อความง่าย ไม่ต้องเปิด
  // รายชื่อพนักงานไปหาว่าใครชื่อเล่นอะไร) — หาตัวตรงในระบบให้อัตโนมัติแล้วแปลงเป็นชื่อเล่นเก็บไว้เสมอ
  // (ตาม convention เดิมของ fixedBy ทั้งระบบ) หาไม่เจอเลยก็เก็บข้อความเดิมไว้ตามที่พิมพ์มา ──
  function imtResolveStaffToNick(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    var staff = (window.STAFF || []).find(function (x) { return (x.nickname && x.nickname === s) || (x.name && x.name === s); });
    return staff ? (staff.nickname || staff.name) : s;
  }

  function imtIssueImportParse(objs) {
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
          receivedBy: String(rec.received_by || '').trim(),
          fixedBy: imtResolveStaffToNick(rec.fixed_by),
          fixedDate: fixedIso ? fixedIso.slice(0, 10) : '',
          createdAt: createdIso,
        },
      };
    });
  }

  window.imtDownloadIssueImportTemplate = function () {
    if (!window.XLSX) { window.showAlert && window.showAlert('ไลบรารี Excel ยังไม่พร้อม', 'warn'); return; }
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
      ['fixed_by', 'ชื่อผู้แก้ไข — พิมพ์ชื่อเล่นหรือชื่อ-นามสกุลเต็มก็ได้ ระบบจะจับคู่กับรายชื่อพนักงานให้อัตโนมัติ'],
      ['รูปแบบวันที่', 'YYYY-MM-DD หรือ DD/MM/YYYY (รองรับปี พ.ศ.)'],
      ['หมายเหตุ', '1 ไฟล์ = 1 โครงการ ต้องเลือกโครงการปลายทางก่อนนำเข้า'],
    ];
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([headers, example]), 'issues');
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(guide), 'คำแนะนำ');
    window.XLSX.writeFile(wb, 'Template_IMPL_ISSUES_import.xlsx');
  };

  // ── เรียกตรงจาก modals.js execImport (หน้าแรกของ modal นำเข้ากลาง ไม่ต้องเปิดป๊อบอับซ้อนอีกชั้น) —
  // ประมวลผลไฟล์ + (ถ้าติ๊กไว้) ลบปัญหาเดิมเฉพาะโครงการที่เลือก + เขียนแถวใหม่ ครบในคลิกเดียว แล้วสรุปผล
  // เป็น toast (ไม่มีหน้าพรีวิวแยกต่างหากอีกต่อไป — เพื่อให้ใช้งานง่าย ไม่ต้องคลิกหลายรอบ) ──
  window.imtRunIssueImportInline = async function (file, pid, clearFirst) {
    var msgEl = document.getElementById('import-msg');
    if (!(window.canAdd && window.canAdd(window.IMPL_MODULE))) {
      if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">⚠ ไม่มีสิทธิ์นำเข้าปัญหา Impl Tracker</span>';
      return;
    }
    if (!pid) { if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">⚠ กรุณาเลือกโครงการปลายทางก่อน</span>'; return; }
    if (!file) { if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">⚠ กรุณาเลือกไฟล์ก่อน</span>'; return; }
    if (!window.XLSX) { if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">ไลบรารี Excel ยังไม่พร้อม</span>'; return; }
    var proj = imtProject(pid);

    if (msgEl) msgEl.innerHTML = '<span style="color:var(--txt3)">⏳ กำลังอ่านไฟล์...</span>';
    var objs;
    try {
      var buf = await file.arrayBuffer();
      var wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      objs = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
    } catch (err) {
      if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">อ่านไฟล์ไม่ได้: ' + esc(String(err.message || err)) + '</span>';
      return;
    }
    var parsed = imtIssueImportParse(objs);
    var rows = parsed.filter(function (p) { return p.ok; });
    var badRows = parsed.filter(function (p) { return !p.ok; });
    if (!parsed.length) { if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">⚠ ไม่พบข้อมูลในไฟล์</span>'; return; }
    if (!rows.length) { if (msgEl) msgEl.innerHTML = '<span style="color:var(--coral)">⚠ ไม่มีแถวที่นำเข้าได้เลย (ทุกแถวไม่มีรายละเอียดปัญหา)</span>'; return; }

    if (msgEl) msgEl.innerHTML = '<span style="color:var(--txt3)">⏳ กำลังนำเข้า...</span>';

    // ── หลอดความคืบหน้า (ตัวเดียวกับนำเข้า CSV ใน modals.js) — นับรวมแถวที่ลบก่อนนำเข้าด้วย ──
    var toDelete = clearFirst ? (window.IMPL_ISSUES || []).filter(function (x) { return x.projectId === pid; }) : [];
    var total = toDelete.length + rows.length, step = 0;
    var prog = function (label) { window._importProgress && window._importProgress(step, total, label); };

    // ── ลบปัญหาเดิม "เฉพาะของโครงการที่เลือกไว้" ก่อนนำเข้า (กรณีนำเข้าซ้ำ) — กรองด้วย projectId
    // ทุกครั้งกันพลาดลบข้ามโครงการอื่นโดยไม่ตั้งใจ ──
    if (toDelete.length) {
      prog('กำลังลบปัญหาเดิม');
      for (var j = 0; j < toDelete.length; j++) {
        try { await window.deleteDoc(window.getDocRef('IMPL_ISSUES', toDelete[j].id)); }
        catch (e) { console.warn('[impl issue import] delete old row failed', toDelete[j].id, e); }
        step++; prog('กำลังลบปัญหาเดิม');
      }
      window.IMPL_ISSUES = (window.IMPL_ISSUES || []).filter(function (x) { return x.projectId !== pid; });
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
          received_by: window.staffIdByRef(d.receivedBy), fixed_by: window.staffIdByRef(d.fixedBy), fixed_date: d.fixedDate || null,
          created_at: d.createdAt,
        };
        window.imtApplyLocal('IMPL_ISSUES', id, row);
        await window.setDoc(window.getDocRef('IMPL_ISSUES', id), row);
        done++;
      } catch (e) { failed++; console.warn('[impl issue import] row', rows[i].row, e); }
      step++; prog('กำลังนำเข้า');
    }

    window._importProgress && window._importProgress(null);
    window.closeM('m-import');
    var summary = 'นำเข้าปัญหาเข้าโครงการ "' + (proj ? proj.name : pid) + '" สำเร็จ ' + done + ' รายการ'
      + (badRows.length ? ' · ข้าม ' + badRows.length + ' รายการ (ไม่มีรายละเอียดปัญหา)' : '')
      + (failed ? ' · ผิดพลาด ' + failed : '');
    window.showAlert && window.showAlert(summary, failed ? 'warn' : 'success');
    if (window._von && window._von('view-impl-tracker')) window.renderImplTracker && window.renderImplTracker();
  };

})();
