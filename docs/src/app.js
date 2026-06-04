/**
 * app.js — Application Entry Point
 * เริ่มต้นระบบ: setup user session, render all modules, PWA install
 *
 * Load Order ที่ถูกต้อง (ดู index.html):
 *   1. Supabase SDK
 *   2. src/config/api.config.js
 *   3. src/config/app.config.js
 *   4. src/config/routes.config.js
 *   5. src/utils/*.util.js
 *   6. src/services/supabase.service.js
 *   7. src/services/storage.service.js
 *   8. src/services/realtime.service.js
 *   9. src/services/auth.service.js
 *  10. src/router.js
 *  11. js/*.js (feature modules)
 *  12. src/app.js  ← this file
 */
(function () {

  // ── Setup User Session (sidebar UI, permissions, element visibility) ──
  window.setupUser = function () {
    var cu = window.cu;
    if (!cu) return;

    // Update avatar & name in sidebar (IDs match index.html: u-av, u-name, u-role)
    var uAv   = document.getElementById('u-av');
    var uName = document.getElementById('u-name');
    var uRole = document.getElementById('u-role');
    var roleColors = {
      admin:  'linear-gradient(135deg,#ff6b6b,#ffa62b)',
      pm:     'linear-gradient(135deg,#7c5cfc,#4cc9f0)',
      viewer: 'linear-gradient(135deg,#06d6a0,#4cc9f0)',
    };
    if (uAv) {
      uAv.textContent = (cu.name || cu.username || '?').charAt(0).toUpperCase();
      uAv.style.background = roleColors[cu.role] || 'linear-gradient(135deg,#7c5cfc,#ff6b6b)';
    }
    if (uName) uName.textContent = cu.name || cu.username || '';
    if (uRole) uRole.textContent = window.roleLabel ? window.roleLabel(cu.role) : (cu.role || '');

    // Show/hide role-based CSS class elements
    var isAdm  = window.isAdmin && window.isAdmin();
    var canAdm = window.canView && window.canView('admin');
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.style.display = (isAdm || canAdm) ? '' : 'none';
    });
    document.querySelectorAll('.ce-only').forEach(function (el) {
      el.style.display = (window.ce && window.ce()) ? '' : 'none';
    });
    document.querySelectorAll('.cl-only').forEach(function (el) {
      el.style.display = (window.cl && window.cl()) ? '' : 'none';
    });
    document.querySelectorAll('.targets-only').forEach(function (el) {
      el.style.display = (isAdm || (window.canView && window.canView('targets'))) ? '' : 'none';
    });

    // Import button (topbar) — admin only
    var btnImport = document.getElementById('btn-import-top');
    if (btnImport) btnImport.style.display = isAdm ? '' : 'none';

    // Admin sub-tab visibility (Users + Roles tabs are admin-only)
    var atUsers = document.getElementById('at-users');
    var atRoles = document.getElementById('at-roles');
    if (atUsers) atUsers.style.display = isAdm ? '' : 'none';
    if (atRoles) atRoles.style.display = isAdm ? '' : 'none';

    // Nav button visibility per permission
    var navModules = [
      'overview','kanban','projects','advance','lodging',
      'workload','availability','calendar','leave','timesheet',
      'cost','budget','targets','hospital','contract','worklog','holiday',
    ];
    navModules.forEach(function (m) {
      var btn = document.querySelector('.nav-btn[onclick*="\'' + m + '\'"]');
      if (!btn) return;
      var canSee = window.canView ? window.canView(m) : true;
      btn.style.display = canSee ? '' : 'none';
      if (!canSee) btn.classList.remove('on');
    });


    // Bottom nav (mobile) — hide items user can't access
    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(function (btn) {
      var m = btn.getAttribute('data-view');
      if (!m) return;
      var canSee = window.canView ? window.canView(m) : true;
      btn.style.display = canSee ? '' : 'none';
    });

    // Sync advance overdue badge
    window.updateBadge && window.updateBadge();
  };

  // ── Update Advance Overdue Badge ──
  window.updateBadge = function () {
    var pd  = window.pd;
    var now = new Date();
    var ov  = (window.ADVANCES || []).filter(function (a) {
      return a.ddate && pd(a.ddate) < now && a.status !== 'cleared';
    }).length;

    var nb = document.getElementById('adv-nb');
    if (nb) { nb.textContent = ov; nb.style.display = ov ? '' : 'none'; }

    var bNb = document.getElementById('bnav-adv-badge');
    if (bNb) { bNb.textContent = ov; bNb.style.display = ov ? '' : 'none'; }

    var td = document.getElementById('tp-overdue');
    var tt = document.getElementById('tp-overdue-txt');
    if (ov > 0) {
      if (td) td.style.display = 'flex';
      if (tt) tt.textContent = ov + ' Advance เกินกำหนด';
    } else {
      if (td) td.style.display = 'none';
    }
  };

  // ── Render All Active Views ──
  window.renderAll = function () {
    if (!window.cu || !window.isDbLoaded) return;

    // Render overview only if user has permission and it's active
    var ovEl = document.getElementById('view-overview');
    if (window.renderOverview && ovEl && ovEl.classList.contains('on') && (!window.canView || window.canView('overview'))) {
      window.renderOverview();
    }

    // Re-render whichever view is currently active
    var renders = {
      'view-kanban':       'renderKanban',
      'view-projects':     'renderProjects',
      'view-advance':      'renderAdvance',
      'view-lodging':      'renderLodging',
      'view-workload':     'renderWorkload',
      'view-calendar':     'renderCalendar',
      'view-leave':        'renderLeave',
      'view-timesheet':    'renderTimesheet',
      'view-cost':         'renderCost',
      'view-budget':       'renderBudget',
      'view-availability': 'renderAvailability',
      'view-holidays':     'renderHolidays',
      'view-hospital':     'renderHspDashboard',
      'view-contract':     'renderContract',
      'view-targets':      'renderTargets',
      'view-worklog':      'renderWorkLog',
    };

    Object.keys(renders).forEach(function (viewId) {
      var renderFn = renders[viewId];
      var el = document.getElementById(viewId);
      if (el && el.classList.contains('on') && typeof window[renderFn] === 'function') {
        window[renderFn]();
      }
    });

    // Always sync badges after any data update
    window.updateBadge && window.updateBadge();
  };

  // ── PWA Install Prompt ──
  var _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _deferredPrompt = e;
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'flex';
  });

  window.pwaInstall = function () {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(function () { _deferredPrompt = null; });
  };

  // ── Register Service Worker + auto-reload on update ──
  if ('serviceWorker' in navigator) {
    var _swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (_swRefreshing) return;
      _swRefreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('[app] SW register failed:', err);
    });
  }

  // ── DOM Ready: restore remembered login + bind login form ──
  document.addEventListener('DOMContentLoaded', function () {
    var remUser = window.StorageService && window.StorageService.getRememberedUser();
    var uEl  = document.getElementById('lu');
    var remEl = document.getElementById('l-rem');
    if (remUser && uEl) { uEl.value = remUser; if (remEl) remEl.checked = true; }

    // Enter key on username/password inputs → login
    ['lu', 'lp'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.doLogin && window.doLogin(); });
    });
  });

  console.log('[app] BMS Backoffice initialized');

})();
