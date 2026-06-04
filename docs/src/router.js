/**
 * router.js — SPA Client-Side Router
 * จัดการการสลับ View, อัปเดต nav buttons, topbar title, และ deep links
 */
(function () {

  // ── Navigate to a module (low-level, no render trigger) ──
  window.goTo = function (moduleId, opts) {
    opts = opts || {};
    var viewId = (window.ROUTE_MAP && window.ROUTE_MAP[moduleId]) || ('view-' + moduleId);

    // Permission check
    if (window.canView && !window.canView(moduleId) && moduleId !== 'overview') {
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

    // Activate nav button
    var navBtn = document.querySelector('.nav-btn[onclick*="\'' + moduleId + '\'"]');
    if (navBtn) navBtn.classList.add('on');
    var bottomBtn = document.querySelector('.bottom-nav-item[data-view="' + moduleId + '"]');
    if (bottomBtn) bottomBtn.classList.add('active');

    // Update topbar title
    var mod = window.PERM_MODULES && window.PERM_MODULES.find(function (m) { return m.id === moduleId; });
    var titleEl = document.getElementById('tp-title');
    if (titleEl) titleEl.textContent = mod ? mod.label : moduleId;

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
    // Permission check with user-visible alert
    if (window.canView && !window.canView(id) && id !== 'overview') {
      window.showAlert && window.showAlert('คุณไม่มีสิทธิ์เข้าถึง Module นี้', 'warn');
      return;
    }
    window.goTo(id);

    // Trigger per-view render
    if (id === 'hospital') {
      window._hspPopulateFilters && window._hspPopulateFilters();
      if (window._hspViewMode === 'dashboard') { window.renderHspDashboard && window.renderHspDashboard(); }
      else if (window._hspViewMode === 'analysis') { window.renderHspAnalysis && window.renderHspAnalysis(); }
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
      };
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

  // ── Force Sync (UI feedback only — data is always realtime) ──
  window.forceSync = function () {
    var stat = document.getElementById('tp-status');
    if (stat) {
      stat.innerHTML = '<span class="pulse ok"></span> ซิงค์แล้ว';
      setTimeout(function () { stat.innerHTML = '<span class="pulse ok"></span> Realtime'; }, 1500);
    }
  };

  // ── Handle Deep Links from URL hash ──
  window._handleDeepLink = function () {
    var hash = location.hash.replace('#', '');
    if (hash && window.ROUTE_MAP && window.ROUTE_MAP[hash]) {
      window.goView(hash);
    }
  };

  // ── Backward-compat: showView(id) ──
  window.showView = function (id, navEl) {
    window.goView(id);
  };

})();
