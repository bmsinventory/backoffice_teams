/**
 * app.js — Application Entry Point
 * เริ่มต้นระบบ: setup user session, render all modules, PWA install
 *
 * Load Order ที่ถูกต้อง (ดู index.html):
 *   1. PostgREST client library
 *   2. src/config/api.config.js
 *   3. src/config/app.config.js
 *   4. src/config/routes.config.js
 *   5. src/utils/*.util.js
 *   6. src/services/db.service.js
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
      'impl_tracker','all_issues','helpdesk',
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

    // Sync pending-leave badge — นับเฉพาะใบลาของผู้ใช้ที่ล็อกอินที่ยังรออนุมัติ ทุก Role รวม PM/Admin
    // (เดิมนับทุกใบให้ทุกคน กดเข้าไปแล้วไม่เจอใบลาของตัวเอง · ใบที่ต้องอนุมัติ PM/Admin ดูในหน้าการลางาน)
    var cu = window.cu || {};
    var pend = (window.LEAVES || []).filter(function (l) {
      return l.status === 'pending' && cu.staffId && l.staffId === cu.staffId;
    }).length;
    var lvNb = document.getElementById('leave-nb');
    if (lvNb) { lvNb.textContent = pend; lvNb.style.display = pend ? '' : 'none'; }

    // Sync new-helpdesk-ticket badge (นับ ticket ที่ยังไม่ได้ triage/assign)
    var hdNew = (window.HELPDESK_TICKETS || []).filter(function (t) { return t.status === 'new'; }).length;
    var hdNb = document.getElementById('hd-nb');
    if (hdNb) { hdNb.textContent = hdNew; hdNb.style.display = hdNew ? '' : 'none'; }

    // กระดิ่งแจ้งเตือนมุมขวาบน — รวมทุกเรื่องข้างบน (เฉพาะหน้าที่ role ดูได้)
    var can = function (m) { return !window.canView || window.canView(m); };
    _notiItems = [
      { mod: 'advance',  icon: '💳', n: can('advance')  ? ov    : 0, label: 'Advance เกินกำหนด' },
      { mod: 'leave',    icon: '🏖', n: can('leave')    ? pend  : 0, label: 'การลาของคุณรออนุมัติ' },
      { mod: 'helpdesk', icon: '🎧', n: can('helpdesk') ? hdNew : 0, label: 'Ticket ใหม่รอรับเรื่อง' },
    ].filter(function (x) { return x.n > 0; });
    var total = _notiItems.reduce(function (s, x) { return s + x.n; }, 0);
    var bc = document.getElementById('noti-count');
    if (bc) { bc.textContent = total > 99 ? '99+' : total; bc.style.display = total ? '' : 'none'; }
    var bell = document.getElementById('noti-bell');
    if (bell) bell.title = total ? 'แจ้งเตือน ' + total + ' รายการ' : 'ไม่มีการแจ้งเตือน';
    if (document.getElementById('noti-menu')) _renderNotiMenu();
  };

  // ── กระดิ่งแจ้งเตือน: กด → รายการแจ้งเตือน กดรายการ → ไปหน้านั้น · ปิดเมื่อกดที่อื่น/Esc ──
  var _notiItems = [];
  function _closeNotiMenu() { var m = document.getElementById('noti-menu'); if (m) m.remove(); }
  function _renderNotiMenu() {
    var m = document.getElementById('noti-menu');
    if (!m) return;
    m.innerHTML = '<div class="nm-head">🔔 การแจ้งเตือน</div>'
      + (_notiItems.length
        ? _notiItems.map(function (x) {
            return '<button type="button" data-mod="' + x.mod + '"><span class="nm-ic">' + x.icon + '</span>'
              + '<span class="nm-lbl">' + x.label + '</span><span class="nm-n">' + x.n + '</span></button>';
          }).join('')
        : '<div class="nm-empty">ไม่มีการแจ้งเตือน</div>');
  }
  window.toggleNotiMenu = function (e) {
    if (e) e.stopPropagation();
    if (document.getElementById('noti-menu')) { _closeNotiMenu(); return; }
    var m = document.createElement('div');
    m.id = 'noti-menu';
    document.body.appendChild(m);
    _renderNotiMenu();
    var r = document.getElementById('noti-bell').getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    m.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-mod]');
      if (!b) return;
      var mod = b.getAttribute('data-mod');
      _closeNotiMenu();
      window.goView(mod, document.querySelector('.nav-btn[onclick*="\'' + mod + '\'"]'));
    });
  };
  document.addEventListener('click', function (e) {
    var m = document.getElementById('noti-menu');
    if (m && !m.contains(e.target)) _closeNotiMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _closeNotiMenu(); });

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
      'view-expense-form': 'renderExpenseForm',
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
      'view-impl-tracker': 'renderImplTracker',
      'view-helpdesk':     'renderHelpdesk',
      'view-all-issues':   'renderAllIssuesOverview',
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

  // ── เมนูบัญชีผู้ใช้: กดชื่อผู้ใช้ท้าย sidebar → เปลี่ยนรหัสผ่าน / ออกจากระบบ (แทนปุ่ม 🔒 🚪 เดิมบน topbar)
  // วางเหนือแถวผู้ใช้ · sidebar แบบย่อ (เหลือแค่อวาตาร์) → วางด้านขวาแทน · ปิดเมื่อกดที่อื่น/Esc ──
  function _closeUserMenu() { var m = document.getElementById('user-menu'); if (m) m.remove(); }
  window.toggleUserMenu = function (e) {
    if (e) e.stopPropagation();
    if (document.getElementById('user-menu')) { _closeUserMenu(); return; }
    var row = e && e.currentTarget, cu = window.cu || {};
    var m = document.createElement('div');
    m.id = 'user-menu';
    m.innerHTML = '<div class="um-head"><b>' + window.esc(cu.name || cu.username || '') + '</b><span>'
      + window.esc(window.roleLabel ? window.roleLabel(cu.role) : (cu.role || '')) + '</span></div>'
      + '<button type="button" data-act="pw">🔒 เปลี่ยนรหัสผ่าน</button>'
      + '<button type="button" data-act="out" class="danger">🚪 ออกจากระบบ</button>';
    document.body.appendChild(m);
    var r = row ? row.getBoundingClientRect() : { left: 12, right: 12, top: window.innerHeight, bottom: window.innerHeight, width: 200 };
    if (r.width < 120) { m.style.left = (r.right + 8) + 'px'; m.style.bottom = Math.max(8, window.innerHeight - r.bottom) + 'px'; }
    else { m.style.left = Math.max(8, r.left) + 'px'; m.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
    m.addEventListener('click', function (ev) {
      var act = ev.target.closest('button') && ev.target.closest('button').getAttribute('data-act');
      if (!act) return;
      _closeUserMenu();
      window.closeMobSidebar && window.closeMobSidebar();
      if (act === 'pw') window.openChangePassword && window.openChangePassword();
      else window.doLogout && window.doLogout();
    });
  };
  document.addEventListener('click', function (e) {
    var m = document.getElementById('user-menu');
    if (m && !m.contains(e.target)) _closeUserMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _closeUserMenu(); });

  // ── New Version Available Banner ──
  // Shown instead of a silent forced reload, so an in-progress form isn't wiped out.
  window.showUpdateBanner = function () {
    if (document.getElementById('sw-update-banner')) return;
    var b = document.createElement('div');
    b.id = 'sw-update-banner';
    b.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;'
      + 'background:linear-gradient(135deg,#4361ee,#7c5cfc);color:#fff;padding:12px 14px 12px 18px;border-radius:14px;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:14px;font-size:13px;'
      + 'font-family:inherit;max-width:calc(100vw - 32px);';
    b.innerHTML = '<span>🚀 มีอัปเดตเวอร์ชันใหม่ของระบบ</span>'
      + '<button id="sw-update-btn" style="background:#fff;color:#4361ee;border:none;padding:7px 16px;border-radius:9px;font-weight:700;cursor:pointer;font-size:12.5px;white-space:nowrap;">โหลดใหม่ตอนนี้</button>'
      + '<button id="sw-update-dismiss" title="ปิด" style="background:transparent;color:#fff;border:none;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;opacity:.8;">✕</button>';
    document.body.appendChild(b);
    document.getElementById('sw-update-btn').onclick = function () { window.location.reload(); };
    document.getElementById('sw-update-dismiss').onclick = function () { b.remove(); };
  };

  // ── Service Worker: ลงทะเบียน + ตรวจเวอร์ชันใหม่ (จุดเดียวของทั้งแอป) ──
  // ตรวจทุก 5 นาที และทุกครั้งที่กลับมาเปิดแอป (PWA บนมือถือถูกพักไว้เบื้องหลัง ไม่ได้โหลดหน้าใหม่เอง)
  // มีเวอร์ชันใหม่ → ไม่มีฟอร์ม/ช่องพิมพ์ค้างอยู่ = โหลดใหม่ทันที (session อยู่ กลับหน้าเดิม) · กำลังกรอกอยู่ = แสดงแถบแจ้ง
  if ('serviceWorker' in navigator) {
    var _hadController = !!navigator.serviceWorker.controller;
    var _swNotified = false;
    function _busy() {
      var a = document.activeElement;
      return !!document.querySelector('.overlay.on:not(#sys-loader)') || !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    }
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // ครั้งแรกที่ติดตั้ง SW (ยังไม่เคยมีตัวคุมหน้า) = หน้านี้ใหม่อยู่แล้ว ไม่ต้องทำอะไร
      if (_swNotified || !_hadController) return;
      _swNotified = true;
      if (_busy()) window.showUpdateBanner(); else window.location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      setInterval(function () { reg.update().catch(function () {}); }, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') reg.update().catch(function () {});
      });
    }).catch(function (err) {
      console.warn('[app] SW register failed:', err);
    });
  }

  // ── DOM Ready: restore remembered login + bind login form ──
  document.addEventListener('DOMContentLoaded', function () {
    var remUser = window.StorageService && window.StorageService.getRememberedUser();
    var remPass = window.StorageService && window.StorageService.getRememberedPassword();
    var uEl  = document.getElementById('lu');
    var pEl  = document.getElementById('lp');
    var remEl = document.getElementById('l-rem');
    if (remUser && uEl) { uEl.value = remUser; if (remEl) remEl.checked = true; }
    if (remPass && pEl) { pEl.value = remPass; }

    // Enter key on username/password inputs → login
    ['lu', 'lp'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.doLogin && window.doLogin(); });
    });
  });

  console.log('[app] BMS Backoffice initialized');

})();
