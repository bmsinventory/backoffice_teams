/**
 * router.js — SPA Client-Side Router
 * จัดการการสลับ View, อัปเดต nav buttons, topbar title, และ deep links
 */
(function () {

  // ── Navigate to a module (low-level, no render trigger) ──
  window.goTo = function (moduleId, opts) {
    opts = opts || {};
    var viewId = (window.ROUTE_MAP && window.ROUTE_MAP[moduleId]) || ('view-' + moduleId);

    // Permission check — 'all_issues' ไม่ได้ขึ้นกับระบบ can()/ROLE_PERMISSIONS (ไม่ได้ลงทะเบียนใน
    // PERM_MODULES โดยตั้งใจ) จำกัดสิทธิ์แบบตายตัวด้วย window.ce() (PM/Admin) แทน
    var _canSeeModule = moduleId === 'all_issues' ? (window.ce && window.ce()) : (!window.canView || window.canView(moduleId));
    if (!_canSeeModule) {
      console.warn('[router] No permission to view:', moduleId);
      return;
    }

    // Hide all views
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('on'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('on'); });
    document.querySelectorAll('.bottom-nav-item').forEach(function (n) { n.classList.remove('active'); });

    // Show target view
    var view = document.getElementById(viewId);
    if (view) { view.style.display = ''; view.classList.add('on'); }

    // Track active module on <body> (used to scope view-specific @media print rules
    // so one view's print CSS never hides/blanks another view's print output)
    document.body.setAttribute('data-view', moduleId);

    // Activate nav button
    var navBtn = document.querySelector('.nav-btn[onclick*="\'' + moduleId + '\'"]');
    if (navBtn) navBtn.classList.add('on');
    var bottomBtn = document.querySelector('.bottom-nav-item[data-view="' + moduleId + '"]');
    if (bottomBtn) bottomBtn.classList.add('active');

    // Update topbar title ('all_issues' ไม่ได้อยู่ใน PERM_MODULES โดยตั้งใจ — ดูเหตุผลด้านบน)
    var mod = window.PERM_MODULES && window.PERM_MODULES.find(function (m) { return m.id === moduleId; });
    var titleEl = document.getElementById('tp-title');
    if (titleEl) titleEl.textContent = mod ? mod.label : (moduleId === 'all_issues' ? 'ปัญหาทุกโครงการ' : moduleId);

    // Update URL hash (deep link)
    if (!opts.silent) {
      try { history.replaceState(null, '', '#' + moduleId); } catch (e) {}
    }

    // Close mobile sidebar
    if (window.closeMobSidebar) window.closeMobSidebar();
  };

  // ── goView: main navigation called by HTML nav buttons ──
  // Wraps goTo + triggers the render function for the target view
  window.goView = function (id, el) {
    // Permission check with user-visible alert — 'all_issues' จำกัดสิทธิ์ด้วย window.ce() แบบตายตัว
    // (ดูหมายเหตุใน goTo ด้านบน) แทนระบบ can()/ROLE_PERMISSIONS ปกติ
    var _canSee = id === 'all_issues' ? (window.ce && window.ce()) : (!window.canView || window.canView(id));
    if (!_canSee) {
      window.showAlert && window.showAlert('คุณไม่มีสิทธิ์เข้าถึง Module นี้', 'warn');
      return;
    }
    window.goTo(id);

    // Trigger per-view render
    if (id === 'hospital') {
      window._hspPopulateFilters && window._hspPopulateFilters();
      if (window._hspViewMode === 'dashboard') { window.renderHspDashboard && window.renderHspDashboard(); }
      else if (window._hspViewMode === 'analysis') { window.renderHspAnalysis && window.renderHspAnalysis(); }
      else if (window._hspViewMode === 'summary') { window.renderHspSummary && window.renderHspSummary(); }
      else { window.renderHospital && window.renderHospital(); }
    } else if (id === 'availability') {
      window.avlPopulateDept && window.avlPopulateDept();
      var avlS = document.getElementById('avl-start');
      var avlE = document.getElementById('avl-end');
      if (avlS && !avlS.value) { var t = new Date(); avlS.value = t.toISOString().slice(0, 10); }
      if (avlE && !avlE.value) { var t2 = new Date(); t2.setDate(t2.getDate() + 29); avlE.value = t2.toISOString().slice(0, 10); }
      window.renderAvailability && window.renderAvailability();
    } else {
      var _renderMap = {
        overview:   'renderOverview',
        kanban:     'renderKanban',
        projects:   'renderProjects',
        advance:    'renderAdvance',
        expense_form: 'renderExpenseForm',
        lodging:    'renderLodging',
        workload:   'renderWorkload',
        calendar:   'renderCalendar',
        leave:      'renderLeave',
        timesheet:  'renderTimesheet',
        cost:       'renderCost',
        budget:     'renderBudget',
        holiday:    'renderHolidays',
        targets:    'renderTargets',
        contract:   'renderContract',
        worklog:    'renderWorkLog',
        impl_tracker: 'renderImplTracker',
        helpdesk:   'renderHelpdesk',
        all_issues: 'renderAllIssuesOverview',
      };
      if (id === 'overview' || id === 'kanban' || id === 'projects') {
        window.runAutoStage && window.runAutoStage(true);
      }
      var fn = _renderMap[id];
      if (fn && typeof window[fn] === 'function') window[fn]();
    }
  };

  // ── Sidebar: desktop collapse + mobile open/close ──
  window.toggleSB = function () {
    if (window.innerWidth <= 768) {
      window.toggleMobSidebar();
    } else {
      var sb = document.getElementById('sidebar');
      var btn = sb && sb.querySelector('.sb-toggle');
      if (sb) sb.classList.toggle('slim');
      if (btn) btn.textContent = sb.classList.contains('slim') ? '▶' : '◀';
    }
  };

  window.toggleMobSidebar = function () {
    var sb = document.getElementById('sidebar');
    var ov = document.getElementById('mob-sb-overlay');
    var isOpen = sb && sb.classList.contains('mob-open');
    if (sb) sb.classList.toggle('mob-open', !isOpen);
    if (ov) ov.classList.toggle('on', !isOpen);
  };

  window.closeMobSidebar = function () {
    var sb = document.getElementById('sidebar');
    var ov = document.getElementById('mob-sb-overlay');
    if (sb) sb.classList.remove('mob-open');
    if (ov) ov.classList.remove('on');
  };

  // ── Force Sync: re-render active view and update status timestamp ──
  window.forceSync = function () {
    var stat = document.getElementById('tp-status');
    if (stat) stat.innerHTML = '<span class="pulse ok"></span> กำลังโหลด...';
    window.renderAll && window.renderAll();
    setTimeout(function () {
      if (!stat) return;
      var now = new Date();
      var t = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);
      window._lastSyncTime = t;
      stat.innerHTML = '<span class="pulse ok"></span> ' + t;
    }, 400);
  };

  // ── Handle Deep Links from URL hash ──
  // รองรับ param ต่อท้ายด้วย & เช่น #leave=LV123&approve=1 (จากลิงก์แจ้งเตือน BMS Notify) เท่านั้น —
  // ต้องมี "=" จริง ๆ ถึงถือเป็น deep link ที่ตั้งใจ hash เปล่า ๆ แค่ชื่อ module (เช่น #kanban ที่ค้างอยู่
  // ใน URL จาก history.replaceState ตอนสลับ view ปกติ — ดู goTo ด้านล่าง) ไม่ทำอะไร ปล่อยให้ view เริ่มต้น
  // ("Overview" ที่ฝัง class="view on" ไว้ใน index.html อยู่แล้ว) แสดงตามปกติ กันผู้ใช้ล็อกอิน/รีเฟรชใหม่
  // แล้วถูกพากลับไป view เดิมที่ค้างอยู่ในแถบ URL ทุกครั้งโดยไม่ตั้งใจ ──
  window._handleDeepLink = function () {
    var hash = location.hash.replace('#', '');
    if (!hash) return;
    var eqIdx = hash.indexOf('=');
    if (eqIdx > -1) {
      var module = hash.slice(0, eqIdx);
      var rest = hash.slice(eqIdx + 1).split('&');
      var itemId = rest[0];
      var params = {};
      rest.slice(1).forEach(function (p) {
        var i = p.indexOf('=');
        if (i > -1) params[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
      });
      if (module && window.ROUTE_MAP && window.ROUTE_MAP[module]) {
        window.goView(module);
        setTimeout(function () {
          var card = document.querySelector('[data-leave-id="' + itemId + '"]');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '2px solid var(--violet)';
            card.style.boxShadow = '0 0 0 5px rgba(124,92,252,.25)';
            setTimeout(function () { card.style.outline = ''; card.style.boxShadow = ''; }, 2500);
          }
          // ── ลิงก์ "อนุมัติด่วน" จากแจ้งเตือน — เปิดกล่องยืนยันอนุมัติทันที (ยังต้องกดยืนยันอีกที กันกดพลาด) ──
          if (module === 'leave' && params.approve === '1' && window.approveLeave) {
            var lv = (window.LEAVES || []).find(function (x) { return x.id === itemId; });
            if (lv && lv.status === 'pending') window.approveLeave(itemId);
          }
        }, 350);
      }
    }
    // hash เปล่า ๆ ไม่มี "=" (เช่น #kanban, #all_issues ค้างจาก history.replaceState) — ไม่ทำอะไร
  };

  // ── Navigate to first accessible view after login ──
  window._goDefaultView = function () {
    var modules = [
      'overview','kanban','projects','advance','lodging','workload',
      'availability','calendar','leave','timesheet','cost','budget',
      'targets','hospital','contract','worklog','holiday',
    ];
    var first = modules.find(function (m) {
      return !window.canView || window.canView(m);
    });
    if (first) window.goView(first);
  };

  // ── Backward-compat: showView(id) ──
  window.showView = function (id, navEl) {
    window.goView(id);
  };

})();
