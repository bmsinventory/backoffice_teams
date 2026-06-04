/**
 * router.js — SPA Client-Side Router
 * จัดการการสลับ View, อัปเดต nav buttons, topbar title, และ deep links
 */
(function () {

  // ── Navigate to a module ──
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
      try { history.replaceState(null, '', '#' + moduleId); } catch {}
    }

    // Close mobile sidebar
    var sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('mob-open')) {
      sb.classList.remove('mob-open');
      var overlay = document.getElementById('mob-sb-overlay');
      if (overlay) overlay.classList.remove('on');
    }
  };

  // ── Handle Deep Links from URL hash ──
  window._handleDeepLink = function () {
    var hash = location.hash.replace('#', '');
    if (hash && window.ROUTE_MAP && window.ROUTE_MAP[hash]) {
      window.goTo(hash, { silent:true });
    }
  };

  // ── Backward-compat: existing onclick handlers call showView(id) ──
  window.showView = function (id, navEl) {
    window.goTo(id);
    if (typeof window.renderAll === 'function') {
      var renderFn = 'render' + id.charAt(0).toUpperCase() + id.slice(1).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      if (typeof window[renderFn] === 'function') window[renderFn]();
    }
  };

})();
