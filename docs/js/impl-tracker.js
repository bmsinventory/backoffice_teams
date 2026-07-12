/**
 * impl-tracker.js — Implementation Tracker: Render Functions
 * Module: ติดตามงานโครงการติดตั้งระบบ (Project → Phase → Task → Checklist)
 * ใช้ window.getColRef/getDocRef/setDoc/updateDoc/deleteDoc (supabase.service.js เดิม)
 * และ window.calcTaskProgress/calcPhaseProgress/calcProjectProgress/imtLogActivity ฯลฯ
 * (impl-tracker.service.js) — ห้ามเรียก setDoc ตรง ๆ โดยไม่ผ่าน optimistic update
 */
(function () {
  var esc = window.esc, fd = window.fd, pd = window.pd;

  // ── Lookup Helpers ──
  function imtProject(id) { return window.IMPL_PROJECTS.find(function (p) { return p.id === id; }); }
  function imtPhase(id)   { return window.IMPL_PHASES.find(function (p) { return p.id === id; }); }
  function imtTask(id)    { return window.IMPL_TASKS.find(function (t) { return t.id === id; }); }
  function imtPhasesOf(pid)    { return window.IMPL_PHASES.filter(function (p) { return p.projectId === pid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfPhase(id) { return window.IMPL_TASKS.filter(function (t) { return t.phaseId === id; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtTasksOfProject(pid) { return window.IMPL_TASKS.filter(function (t) { return t.projectId === pid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtChecklistOf(tid) { return window.IMPL_CHECKLIST_ITEMS.filter(function (c) { return c.taskId === tid; }).sort(function (a,b) { return a.order - b.order; }); }
  function imtCommentsOf(tid)  { return window.IMPL_COMMENTS.filter(function (c) { return c.taskId === tid; }).sort(function (a,b) { return (a.createdAt||'').localeCompare(b.createdAt||''); }); }
  function imtAttachmentsOf(tid) { return window.IMPL_ATTACHMENTS.filter(function (a) { return a.taskId === tid; }); }

  // ── สร้าง row เต็มสำหรับ imtApplyLocal('IMPL_TASKS', ...) จาก Task object ปัจจุบัน + overrides
  // (เช่น {status:'done'}) — ต้องรวม sort_order เสมอ ไม่งั้น transform จะ default เป็น 99 ทำให้ลำดับ Task
  // ในโครงการเพี้ยนไปทันทีทุกครั้งที่มีการอัปเดตสถานะแบบไม่ผ่านฟอร์ม "แก้ไข Task" เต็ม (เจอบั๊กนี้มาแล้ว
  // ใน imtMarkDone/imtDrop — รวมเป็น helper เดียวกันเพื่อกันพลาดซ้ำ) ──
  function imtTaskRow(t, overrides) {
    return Object.assign({
      phase_id:t.phaseId, project_id:t.projectId, task_name:t.name, description:t.description,
      owner:t.owner, start_date:t.start, due_date:t.due, priority:t.priority, status:t.status,
      progress_percent:t.progress, sort_order:t.order,
    }, overrides || {});
  }

  function lookupIn(list, id) { return list.find(function (x) { return x.id === id; }) || list[1] || { label:id, color:'#9ba3b8' }; }
  function imtStatus(id)      { return window.IMPL_STATUS.find(function (s) { return s.id === id; }) || window.IMPL_STATUS[0]; }
  function imtPriority(id)    { return lookupIn(window.IMPL_PRIORITY, id); }

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
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selLabel; window.removeEventListener('resize', positionDrop); }
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
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('imt-t-owner-wrap'); if (wrap && !wrap.contains(e.target)) { closeDrop(); document.removeEventListener('mousedown', onOut); } });
      inp.value = selLabel; flat = bFlat(''); render();
    };
  })();

  // ── Tab Bar ── (ตัด Issue Log/Risk Log ออกเพราะไม่ได้ใช้งาน, เพิ่ม Template)
  var TABS = [
    { id:'dashboard', label:'ภาพรวมทุกโครงการ', icon:'📊' },
    { id:'workspace', label:'งาน',              icon:'🗃️' },
    { id:'calendar',  label:'Calendar',          icon:'📅' },
    { id:'report',    label:'Report',            icon:'📈' },
    { id:'templates', label:'Template',          icon:'📐' },
  ];
  // แท็บที่ต้องใช้ project switcher (ทุกแท็บยกเว้น dashboard ซึ่งเป็นมุมมองรวมทุกโครงการอยู่แล้ว)
  var TABS_NEED_PROJECT = ['workspace','calendar','report'];

  window.imtGoTab = function (tab) {
    window.imtTab = tab;
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

  function renderProjectSwitcher() {
    if (TABS_NEED_PROJECT.indexOf(window.imtTab) === -1) return '';
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) return ''; // ยังไม่เลือกโครงการ — แต่ละแท็บมี empty-state picker ของตัวเองอยู่แล้ว ไม่ต้องซ้ำ
    var opts = window.IMPL_PROJECTS.map(function (p) { return '<option value="'+p.id+'"'+(p.id===pid?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('');
    return '<div class="imt-switcher">'
      + '<span class="imt-switcher-back" onclick="window.imtGoTab(\'dashboard\')">◀ ทุกโครงการ</span>'
      + '<span class="imt-switcher-lbl">กำลังดู:</span>'
      + '<select class="f-input imt-switcher-sel" onchange="window.imtSwitchProject(this.value)">' + opts + '</select>'
      + '<div class="imt-switcher-progress"><div class="imt-switcher-pbar">'+pbarHtml(window.calcProjectProgress(proj))+'</div><span style="font-size:11.5px;font-weight:700;">'+window.calcProjectProgress(proj)+'%</span></div>'
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
  }

  // ── Main Dispatcher ──
  window.renderImplTracker = function () {
    renderTabs();
    var mount = document.getElementById('imt-content');
    if (!mount) return;
    var fns = {
      dashboard: renderImtDashboard, workspace: renderImtWorkspace, calendar: renderImtCalendar,
      report: renderImtReport, templates: renderImtTemplates,
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

  // เปิด Task modal จาก Dashboard (ยังไม่ได้เลือกโครงการอยู่) — ต้อง set imtCurrentProjectId ก่อน
  // ไม่งั้น saveImtTask จะบันทึกด้วย project_id ผิด (อ้างอิง imtCurrentProjectId เดิมที่ค้างอยู่)
  window.imtOpenTaskFromDash = function (taskId, projectId) {
    window.imtCurrentProjectId = projectId;
    window.openImtTaskModal(taskId);
  };

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

    var statCards = stats.map(function (s) {
      return '<div class="stat-c"><div class="stat-icon" style="background:'+s.color+'18;color:'+s.color+'">'+s.icon+'</div>'
        + '<div class="stat-k">'+s.k+'</div><div class="stat-v">'+s.v+'</div></div>';
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

    var shown = filter === 'all' ? health : health.filter(function (x) { return x.h.level === filter; });
    var healthGrid = shown.length ? shown.map(function (x) { return imtHealthCardHtml(x.p, x.h); }).join('')
      : '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:12px;padding:24px;">ไม่มีโครงการในหมวดนี้</div>';

    var healthSection = window.IMPL_PROJECTS.length
      ? '<div class="imt-health-strip">'+chipsHtml+'</div><div class="imt-pgrid">'+healthGrid+'</div>'
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

    mount.innerHTML =
      healthSection
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">⏰ งานเกินกำหนด (ทุกโครงการ)</div>'+overdueHtml+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">📅 กำหนดการ 7 วันข้างหน้า</div>'+upcomingHtml+'</div>'
      + '</div>'
      + '<div class="stat-row" style="grid-template-columns:repeat(4,1fr);">'+statCards+'</div>'
      + '<div class="imt-dash-grid">'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">👤 ภาระงาน PM</div>'+pmHtml+'</div>'
      +   '<div class="dtable-inner" style="padding:18px;"><div class="sec-label" style="margin-bottom:12px;">🔁 Phase ที่มักมีปัญหาซ้ำ</div>'+phaseHtml+'</div>'
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
      function positionDrop() {
        var r = inp.getBoundingClientRect();
        var availH = window.innerHeight - r.bottom - 16;
        drop.style.position = 'fixed';
        drop.style.top = (r.bottom + 4) + 'px';
        drop.style.left = r.left + 'px';
        drop.style.width = r.width + 'px';
        drop.style.right = 'auto';
        lst.style.maxHeight = Math.max(160, Math.min(360, availH)) + 'px';
      }
      function openDrop() { if (isOpen) return; isOpen = true; q = ''; fi = -1; flat = bFlat(''); lst.scrollTop = 0; render(); positionDrop(); drop.style.display = 'block'; window.addEventListener('resize', positionDrop); }
      function closeDrop() { if (!isOpen) return; isOpen = false; drop.style.display = 'none'; inp.value = selName; window.removeEventListener('resize', positionDrop); }
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
      document.addEventListener('mousedown', function onOut(e) { var wrap = document.getElementById('imt-p-cmb-wrap'); if (wrap && !wrap.contains(e.target) && !drop.contains(e.target)) { closeDrop(); document.removeEventListener('mousedown', onOut); } });
      function scFi() { if (fi < 0) return; var top = 0; for (var i = 0; i < fi; i++) top += flat[i] ? (flat[i].k === 'h' ? HH : IH) : 0; if (top < lst.scrollTop) lst.scrollTop = top; else if (top + IH > lst.scrollTop + lst.clientHeight) lst.scrollTop = top + IH - lst.clientHeight; }
      inp.value = selName; flat = bFlat(''); render();
    };
  })();

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
      // แสดงเฉพาะโครงการที่ยังไม่สิ้นสุด (มีวันสิ้นสุด และยังไม่เลยวันนี้) — โครงการที่จบไปแล้วไม่ควรถูกเลือกมาเริ่มติดตามใหม่
      var tplOptions = '<option value="">— ไม่ใช้ Template —</option>' + window.IMPL_TEMPLATES.map(function (t) { return '<option value="'+t.id+'">'+esc(t.name)+'</option>'; }).join('');
      var todayImtP = new Date(); todayImtP.setHours(0,0,0,0);
      var availSrcProjects = (window.PROJECTS||[]).filter(function (sp) { return sp.end && pd(sp.end) >= todayImtP; });
      body.innerHTML =
        '<div class="f-group"><label class="f-label">เลือกโครงการ *</label>' + imtProjComboMarkup('') + '</div>'
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
    var filterBar = '<div class="imt-ws-filterbar">'
      + '<div class="t-search"><input placeholder="ค้นหางาน..." value="'+esc(f.q||'')+'" oninput="window.imtSetTaskFilter(\'q\',this.value)"></div>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'status\',this.value)">'+statusOpts+'</select>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'owner\',this.value)">'+ownerOpts+'</select>'
      + '<select class="t-sel" onchange="window.imtSetTaskFilter(\'phaseId\',this.value)">'+phaseOpts+'</select>'
      + '<div style="flex:1"></div>'
      + (window.canAdd(window.IMPL_MODULE) && view !== 'card' && phases.length ? '<button class="btn btn-pri btn-sm" onclick="window.openImtTaskModal(null,\'\')">+ Task</button>' : '')
      + '</div>';

    var body;
    if (view === 'list') body = renderTaskListView(pid);
    else if (view === 'kanban') body = renderTaskKanbanView(pid);
    else {
      // ── กรองด้วย Phase (dropdown "รายการ") ให้แสดงเฉพาะ Phase ที่ตรงเงื่อนไข ไม่ใช่ทุก Phase
      // แต่เลขลำดับ "Phase N" ยังอ้างอิงตำแหน่งจริงใน phases ทั้งหมด (ไม่ใช่ตำแหน่งหลังกรอง) ──
      var phasesToShow = f.phaseId ? phases.filter(function (p) { return p.id === f.phaseId; }) : phases;
      body = phasesToShow.map(function (ph) {
        var idx = phases.findIndex(function (p) { return p.id === ph.id; });
        return renderPhaseAccordion(ph, idx, phases.length);
      }).join('') || '<div class="imt-empty-hero" style="padding:40px 20px;"><div class="imt-empty-icon">📋</div><div class="imt-empty-title">ยังไม่มี Phase ในโครงการนี้</div><div class="imt-empty-sub">กด "+ Phase" ด้านบนเพื่อเริ่มสร้างหมวดงาน</div></div>';
    }

    mount.innerHTML = header + filterBar + '<div style="padding:'+(view==='kanban'?'0':'16px 24px')+';overflow-y:auto;flex:1;">'+body+'</div>';
  }

  function projectPicker() {
    var rows = window.IMPL_PROJECTS.slice().sort(function (a,b) { return IMT_HEALTH_ORDER[imtProjectHealth(a).level] - IMT_HEALTH_ORDER[imtProjectHealth(b).level]; });
    var cards = rows.map(function (p) { return imtHealthCardHtml(p, null, { expandable:true }); }).join('')
      || '<div style="grid-column:1/-1;text-align:center;color:var(--txt3);font-size:13px;padding:60px 20px;">ยังไม่มีโครงการ — กด "+ เพิ่มโครงการ" ที่มุมขวาบนเพื่อเริ่มต้น</div>';
    return '<div class="imt-pgrid" style="max-width:1000px;margin:0 auto;padding-top:20px;">'+cards+'</div>';
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
    var rowsHtml = phases.map(function (ph, idx) {
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
    var cols = window.IMPL_STATUS.map(function (st) {
      var items = tasks.filter(function (t) { return t.status === st.id; });
      var body = phases.map(function (ph, idx) {
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
        + atts.map(function (a) { return '<div class="m-row"><a href="'+esc(a.fileUrl)+'" target="_blank" style="flex:1;color:var(--indigo);">📎 '+esc(a.fileName)+'</a><button class="m-x" onclick="window.imtDeleteAttachmentUI(\''+a.id+'\')">✕</button></div>'; }).join('')
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
      owner: document.getElementById('imt-t-owner').value.trim(),
      start_date: document.getElementById('imt-t-start').value || null,
      due_date: document.getElementById('imt-t-due').value || null,
      priority: document.getElementById('imt-t-priority').value,
      status: newStatus,
      sort_order: isNew ? (imtTasksOfPhase(finalPhaseId).length + 1) : imtTask(id).order,
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
    window.imtApplyLocal('IMPL_TASKS', id, imtTaskRow(t, { status:'done' }));
    await window.updateDoc(window.getDocRef('IMPL_TASKS', id), { status:'done' });
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
      window.imtApplyLocal('IMPL_TASKS', t.id, imtTaskRow(t, { status:'done' }));
      await window.updateDoc(window.getDocRef('IMPL_TASKS', t.id), { status:'done' });
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
    window.imtApplyLocal('IMPL_TASKS', taskId, imtTaskRow(t, { status:statusId }));
    window.renderImplTracker();
    await window.updateDoc(window.getDocRef('IMPL_TASKS', taskId), { status:statusId }).catch(window.showDbError);
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
      + '<button class="btn btn-ghost btn-sm" onclick="window.imtOpenAiKeyModal()" title="ตั้งค่า API Key">🔑 API Key</button>'
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
        imtChecklistOf(t.id).forEach(function (c) {
          // งานที่ยังไม่เสร็จ: แสดงแค่ติ๊ก+ชื่อบรรทัดเดียว (ไม่มีช่องวันที่ให้กรอกอีกต่อไป — ใช้เป็น
          // ภาพสรุปสำหรับดู ไม่ใช่ฟอร์มให้เขียนด้วยมือ) ส่วนงานที่เสร็จแล้วต่อวันที่ทำเสร็จไว้ท้ายชื่อ
          itemRows.push('<div class="ppc-row'+(c.done ? ' ppc-row-done' : '')+'">'
            + '<span class="ppc-status-ic" title="'+esc(tst.label)+'">'+tst.icon+'</span>'
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
      +     (proj.hospitalName ? '🏥 '+esc(proj.hospitalName)+' · ' : '')
      +     (proj.pm ? 'PM: '+esc(proj.pm)+' · ' : '')
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
  // AI WEEKLY SUMMARY — เลือกวัน → สรุป "ทำไปแล้ว" (วันนั้น) + "ยังไม่ได้ทำ" (สัปดาห์ปัจจุบัน) ด้วย Gemini (ฟรี)
  // Key เก็บใน localStorage ของเบราว์เซอร์ผู้ใช้เท่านั้น — ไม่ commit ลงโค้ด ไม่ผ่าน server ของเรา
  // (repo นี้เป็น public repo จึงห้ามฝัง API key ไว้ในซอร์สโค้ดเด็ดขาด)
  // ================================================================
  var IMT_AI_KEY_STORAGE = 'imt_gemini_key';
  // ลองหลายโมเดลตามลำดับ เผื่อบางโมเดลโควตาเต็ม/ไม่เปิดให้ใช้กับ Key นี้ (ข้อผิดพลาด 404/429)
  // — ถ้า Key ผิดหรือไม่มีสิทธิ์เลย (401/403) จะหยุดลองทันทีเพราะโมเดลอื่นก็จะพังเหมือนกัน
  var IMT_AI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];

  async function imtCallGemini(apiKey, prompt, model) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    var data = await res.json();
    if (!res.ok) {
      var err = new Error((data.error && data.error.message) || ('เรียก AI ไม่สำเร็จ (HTTP ' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    var text = (parts || []).map(function (p) { return p.text || ''; }).join('');
    if (!text.trim()) throw new Error('ไม่ได้รับข้อความสรุปจาก AI');
    return text;
  }

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

  window.imtOpenAiKeyModal = function () {
    var input = document.getElementById('imt-ai-key-input');
    if (input) input.value = localStorage.getItem(IMT_AI_KEY_STORAGE) || '';
    window.openM('m-imt-ai-key');
  };

  window.imtSaveAiKey = function () {
    var val = (document.getElementById('imt-ai-key-input').value || '').trim();
    if (!val) { window.showAlert && window.showAlert('กรุณากรอก API Key', 'error'); return; }
    localStorage.setItem(IMT_AI_KEY_STORAGE, val);
    window.closeM('m-imt-ai-key');
    window.showAlert && window.showAlert('บันทึก API Key แล้ว', 'success');
    if (window.imtAiPendingGenerate) { window.imtAiPendingGenerate = false; window.imtGenerateAiWeekSummary(); }
  };

  window.imtGenerateAiWeekSummary = async function () {
    var pid = window.imtCurrentProjectId;
    var proj = pid ? imtProject(pid) : null;
    if (!proj) return;

    var dateInput = document.getElementById('imt-ai-date');
    var selDate = (dateInput && dateInput.value) || new Date().toISOString().slice(0,10);
    window.imtAiSelectedDate = selDate;

    var apiKey = localStorage.getItem(IMT_AI_KEY_STORAGE);
    if (!apiKey) { window.imtAiPendingGenerate = true; window.imtOpenAiKeyModal(); return; }

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

    var prompt = 'คุณเป็นผู้ช่วยสรุปความคืบหน้าโครงการ IT ให้ผู้บริหารอ่านทางแชท LINE ได้ทันที เขียนเป็นภาษาไทย กระชับ ทางการแบบเป็นกันเอง ห้ามทักทายหรือลงท้ายด้วยคำถาม\n'
      + 'ห้ามใช้สัญลักษณ์ Markdown เด็ดขาด (ห้ามมี **, ##, - นำหน้าบรรทัด) เพราะ LINE ไม่รองรับ ให้ใช้อีโมจินำหน้าแทนทุกจุด:\n'
      + '- หัวข้อ "สิ่งที่ทำไปแล้ว" ให้ขึ้นต้นด้วย 📌 สิ่งที่ทำไปแล้ว\n'
      + '- หัวข้อ "สิ่งที่ยังไม่ได้ทำ" ให้ขึ้นต้นด้วย ⏳ สิ่งที่ยังไม่ได้ทำ\n'
      + '- แต่ละรายการย่อยขึ้นต้นด้วย ✅ (ถ้าทำแล้ว) หรือ ▪️ (ถ้ายังไม่ทำ) แทนเครื่องหมาย -\n\n'
      + 'โครงการ: ' + proj.name + (proj.hospitalName ? ' (' + proj.hospitalName + ')' : '') + '\n'
      + 'วันที่เลือกดู: ' + fd(selDate) + '\n'
      + 'สัปดาห์ปัจจุบัน: ' + fd(wk.startStr) + ' - ' + fd(wk.endStr) + '\n\n'
      + 'รายการที่ทำไปแล้วในวันที่ ' + fd(selDate) + ':\n' + doneLines + '\n\n'
      + 'งานที่ยังไม่เสร็จซึ่งอยู่ในสัปดาห์นี้หรือเลยกำหนดมาแล้ว:\n' + pendingLines + '\n\n'
      + 'เขียนสรุปเป็น 2 หัวข้อตามรูปแบบข้างต้น แบบอ่านง่าย ความยาวรวมไม่เกิน 200 คำ';

    // แสดงผลเป็น Popup แยก (m-imt-ai-summary) แทนกล่องขยายในหน้าเดิม — เปิด popup ทันทีพร้อมสถานะ
    // กำลังโหลด แล้วค่อยเติมผลลัพธ์ทีหลัง ไม่บังเนื้อหาหลักของหน้า Report ระหว่างรอผล ──
    var out = document.getElementById('m-imt-ai-summary-body');
    var foot = document.getElementById('m-imt-ai-summary-foot');
    foot.innerHTML = '';
    out.innerHTML = '<div style="color:var(--txt3);">⏳ กำลังให้ AI สรุปให้...</div>';
    window.openM('m-imt-ai-summary');

    var text = null, lastErr = null;
    for (var mi = 0; mi < IMT_AI_MODELS.length; mi++) {
      try {
        text = await imtCallGemini(apiKey, prompt, IMT_AI_MODELS[mi]);
        break;
      } catch (e) {
        lastErr = e;
        // 401/403 = Key ผิดหรือไม่มีสิทธิ์ใช้ API นี้เลย — ลองโมเดลอื่นก็จะพังเหมือนกัน หยุดลองทันที
        if (e.status === 401 || e.status === 403) break;
        // 404 (ไม่มีโมเดลนี้) / 429 (โควตาเต็มเฉพาะโมเดลนี้) → ลองโมเดลถัดไปในลิสต์
      }
    }
    if (text) {
      // กันเหนียว เผื่อโมเดลยังใส่ markdown มาแม้สั่งห้ามแล้ว (LINE แสดงเป็นดอกจัน/สัญลักษณ์ดิบ ไม่ใช่ตัวหนา)
      text = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^-\s+/gm, '▪️ ');
      out.innerHTML = '<div>' + esc(text).replace(/\n/g,'<br>') + '</div>';
      out.dataset.raw = text;
      foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-ai-summary\')">ปิด</button>'
        + '<button class="btn btn-teal" onclick="window.imtCopyAiSummary()">📋 คัดลอกส่ง LINE</button>';
    } else {
      out.innerHTML = '<div style="color:var(--coral);">เกิดข้อผิดพลาด: ' + esc((lastErr && lastErr.message) || 'ไม่ทราบสาเหตุ') + '</div>'
        + '<div style="color:var(--txt3);font-size:11.5px;margin-top:6px;">ลองครบทุกโมเดลที่รองรับแล้วไม่สำเร็จ — ถ้าเจอ "quota exceeded, limit: 0" แปลว่า API Key นี้ผูกกับโปรเจกต์ Google Cloud ที่ไม่มีสิทธิ์ใช้งานฟรี ลองสร้าง Key ใหม่ที่ '
        +   '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> โดยเลือก "Create API key in new project" (โปรเจกต์ที่ยังไม่เคยผูก Billing มาก่อน)</div>';
      foot.innerHTML = '<button class="btn btn-ghost" onclick="window.closeM(\'m-imt-ai-summary\')">ปิด</button>';
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

})();
