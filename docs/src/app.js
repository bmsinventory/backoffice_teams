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

  // ── Setup User Session (sidebar UI, permissions) ──
  window.setupUser = function () {
    var cu = window.cu;
    if (!cu) return;

    // Update avatar & name in sidebar
    var uName = document.getElementById('user-name');
    var uRole = document.getElementById('user-role');
    var uAv   = document.getElementById('user-av');
    if (uName) uName.textContent = cu.name || cu.username || '';
    if (uRole) uRole.textContent = window.roleLabel ? window.roleLabel(cu.role) : (cu.role || '');
    if (uAv)   uAv.textContent   = (cu.name || cu.username || '?').charAt(0).toUpperCase();

    // Update topbar
    var tpUser = document.getElementById('tp-user');
    if (tpUser) tpUser.textContent = cu.name || cu.username || '';

    // Show/hide nav buttons by permission
    document.querySelectorAll('.nav-btn[data-module]').forEach(function (btn) {
      var moduleId = btn.getAttribute('data-module');
      btn.style.display = (window.canView && window.canView(moduleId)) ? '' : 'none';
    });
  };

  // ── Render All Active Views ──
  window.renderAll = function () {
    if (!window.cu || !window.isDbLoaded) return;

    // Overview is default — always render
    if (window.renderOverview) window.renderOverview();

    // Check active views and re-render
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

  // ── Register Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('[app] SW register failed:', err);
    });
  }

  // ── Restore remembered username on login form ──
  document.addEventListener('DOMContentLoaded', function () {
    var remUser = window.StorageService && window.StorageService.getRememberedUser();
    var uEl = document.getElementById('lu');
    var remEl = document.getElementById('l-rem');
    if (remUser && uEl) { uEl.value = remUser; if (remEl) remEl.checked = true; }

    // Enter key on login form
    ['lu', 'lp'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.doLogin && window.doLogin(); });
    });
  });

  console.log('[app] BMS Backoffice initialized');

})();
