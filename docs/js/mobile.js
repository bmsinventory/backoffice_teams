/* ================================================================
   mobile.js  —  Mobile & Dark Mode Utilities
   BMS Backoffice Management System
================================================================ */

// ── Dark Mode ───────────────────────────────────────────────
(function initDarkMode() {
  var saved = localStorage.getItem('_bms_dark');
  var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = saved === 'dark' || (saved === null && sysDark);
  if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  else if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  updateDMIcon(isDark);
})();

function updateDMIcon(isDark) {
  var btn = document.getElementById('dm-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

window.toggleDarkMode = function () {
  var cur = document.documentElement.getAttribute('data-theme');
  var isDark = cur === 'dark' ||
    (cur !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('_bms_dark', 'light');
    updateDMIcon(false);
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('_bms_dark', 'dark');
    updateDMIcon(true);
  }
};

// Sync when system preference changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('_bms_dark')) {
      document.documentElement.removeAttribute('data-theme');
      updateDMIcon(e.matches);
    }
  });
}

// ── Table → Card View (mobile) ──────────────────────────────
window.initMobileTable = function (scope) {
  if (window.innerWidth > 768) return;
  var tables = (scope || document).querySelectorAll('.dtable-inner table, .m-tbl');
  tables.forEach(function (table) {
    if (table.dataset.mobileCard) return;
    table.dataset.mobileCard = '1';
    var headers = [];
    table.querySelectorAll('thead th').forEach(function (th) {
      headers.push(th.textContent.trim());
    });
    if (!headers.length) return;
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      tds.forEach(function (td, i) {
        if (headers[i]) td.setAttribute('data-label', headers[i]);
      });
    });
    table.classList.add('m-card-table');
  });
};

// Re-init on content change (MutationObserver)
var _cardObs = null;
function startTableObserver() {
  if (!window.MutationObserver) return;
  if (_cardObs) _cardObs.disconnect();
  _cardObs = new MutationObserver(function (mutations) {
    for (var m of mutations) {
      if (m.addedNodes.length > 0) {
        clearTimeout(window._cardInitTimer);
        window._cardInitTimer = setTimeout(function () {
          window.initMobileTable();
        }, 200);
        break;
      }
    }
  });
  var content = document.getElementById('content');
  if (content) _cardObs.observe(content, { childList: true, subtree: true });
}

// ── Bottom Navigation ──────────────────────────────────────
function updateBottomNav(viewId) {
  document.querySelectorAll('.bottom-nav-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

window._origGoView = window.goView;
// Wrap goView to sync bottom nav
function patchGoView() {
  if (!window.goView || window.goView._patched) return;
  var orig = window.goView;
  window.goView = function (viewId, btn) {
    orig(viewId, btn);
    updateBottomNav(viewId);
    // Close mobile sidebar if open
    if (window.innerWidth <= 768) {
      var sb = document.getElementById('sidebar');
      var ov = document.getElementById('mob-sb-overlay');
      if (sb) sb.classList.remove('mob-open');
      if (ov) ov.classList.remove('on');
    }
  };
  window.goView._patched = true;
}

// ── Bottom nav badge sync ───────────────────────────────────
function syncBottomBadges() {
  var advNb = document.getElementById('adv-nb');
  var leaveNb = document.getElementById('leave-nb');
  var bAdvNb = document.getElementById('bnav-adv-badge');
  var bLeaveNb = document.getElementById('bnav-leave-badge');
  if (advNb && bAdvNb) {
    var t = advNb.textContent;
    bAdvNb.textContent = t;
    bAdvNb.style.display = advNb.style.display;
  }
  if (leaveNb && bLeaveNb) {
    var t2 = leaveNb.textContent;
    bLeaveNb.textContent = t2;
    bLeaveNb.style.display = leaveNb.style.display;
  }
}

// ── Resize handler ─────────────────────────────────────────
window.addEventListener('resize', function () {
  if (window.innerWidth <= 768) {
    window.initMobileTable();
  }
});

// ── Init on DOMContentLoaded ───────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  startTableObserver();
  patchGoView();
});

// ── Init after data loads (called from auth-sb.js) ─────────
window._mobileInit = function () {
  patchGoView();
  window.initMobileTable();
  syncBottomBadges();
  // Re-sync every 3s for badge updates
  setInterval(syncBottomBadges, 3000);
};
