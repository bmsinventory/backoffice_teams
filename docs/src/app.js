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
 *  11. src/modules/*.js (feature modules)
 *  12. src/app.js  ← this file
 */
(function () {

  // ── อวาตาร์ผู้ใช้ใน sidebar: มีรูปในคลังรูปแนะนำทีม (window.STAFF_FIGS, staff.id) → ใช้รูป · ไม่มี → ตัวอักษรแรก ──
  window.setUserAvatar = function () {
    var cu = window.cu, uAv = document.getElementById('u-av');
    if (!cu || !uAv) return;
    var topRole = window.myRoles()[0]; // กลุ่มลำดับแรก (sort_order) — ใช้สีอวาตาร์
    var grad = topRole ? 'linear-gradient(135deg,' + topRole.color + ',#4cc9f0)' : 'linear-gradient(135deg,#7c5cfc,#ff6b6b)';
    var fig = cu.staffId && (window.STAFF_FIGS || {})[cu.staffId];
    uAv.textContent = (cu.name || cu.username || '?').charAt(0).toUpperCase();
    uAv.classList.toggle('has-fig', !!fig);
    uAv.style.setProperty('--av-ring', topRole ? topRole.color : '#7c5cfc');
    window.LoginFace && window.LoginFace.save(cu, fig); // จำรูปไว้ทักทายที่หน้า Login (เฉพาะบัญชีที่ติ๊กจดจำ)
    uAv.style.background = fig ? 'url("' + String(fig.url).replace(/"/g, '%22') + '"), ' + grad : grad;
  };

  // ── Setup User Session (sidebar UI, permissions, element visibility) ──
  window.setupUser = function () {
    var cu = window.cu;
    if (!cu) return;

    // Update avatar & name in sidebar (IDs match index.html: u-av, u-name, u-role)
    var uName = document.getElementById('u-name');
    var uRole = document.getElementById('u-role');
    window.setUserAvatar();
    if (uName) uName.textContent = cu.name || cu.username || '';
    if (uRole) uRole.textContent = window.userRoleLabel(cu);
    window.showWhatsNew();

    // Show/hide role-based CSS class elements
    var isAdm  = window.isAdmin && window.isAdmin();
    var canAdm = window.canView && window.canView('admin');
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.style.display = (isAdm || canAdm) ? '' : 'none';
    });
    // data-perm="action:module" — แสดงเมื่อมีสิทธิ์นั้น (เช่น data-perm="add:projects")
    document.querySelectorAll('[data-perm]').forEach(function (el) {
      var p = el.getAttribute('data-perm').split(':');
      el.style.display = window.can(p[0], p[1]) ? '' : 'none';
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

    // Nav button visibility per permission
    var navModules = [
      'overview','kanban','projects','advance','lodging',
      'workload','availability','calendar','leave','timesheet',
      'cost','budget','targets','hospital','contract','worklog','holiday',
      'impl_tracker','all_issues','helpdesk','assist','training','server_request','team_showcase','team_map',
    ];
    navModules.forEach(function (m) {
      var btn = document.querySelector('.nav-btn[onclick*="\'' + m + '\'"]');
      if (!btn) return;
      var canSee = window.canView ? window.canView(m) : true;
      // ปุ่ม Advance รวมแท็บเอกสารประกอบไว้ด้วย — มีสิทธิ์อย่างใดอย่างหนึ่งก็แสดง
      if (m === 'advance' && window.canView && window.canView('expense_form')) canSee = true;
      // ปุ่ม งบประมาณ & ค่าใช้จ่าย รวมแท็บรายการค่าใช้จ่าย (cost) ไว้ด้วย
      if (m === 'budget' && window.canView && window.canView('cost')) canSee = true;
      // ปุ่ม ภาระงานทีม รวมแท็บทีมว่าง (availability) ไว้ด้วย
      if (m === 'workload' && window.canView && window.canView('availability')) canSee = true;
      // ปุ่ม ผู้ช่วยทีม รวมแท็บตรวจไฟล์ข้อมูลพื้นฐาน (datacheck) ไว้ด้วย
      if (m === 'assist' && window.canView && window.canView('datacheck')) canSee = true;
      // ปุ่ม จัดการวันหยุด (หมวดระบบ) — เฉพาะผู้เพิ่ม/แก้วันหยุดได้ · ทีมดูรายการวันหยุดจากปุ่มในปฏิทินทีม
      if (m === 'holiday') canSee = isAdm || !!(window.canAdd && window.canAdd('holiday')) || !!(window.canEdit && window.canEdit('holiday'));
      btn.style.display = canSee ? '' : 'none';
      if (!canSee) btn.classList.remove('on');
    });
    // หัวข้อหมวด "ระบบ" — แสดงเมื่อมีเมนูในหมวดให้เห็นอย่างน้อยหนึ่งปุ่ม
    var sysSec = document.getElementById('sb-sec-system');
    var holBtn = document.querySelector('.nav-btn[onclick*="\'holiday\'"]');
    if (sysSec) sysSec.style.display = (isAdm || canAdm || (holBtn && holBtn.style.display !== 'none')) ? '' : 'none';


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

    // Sync new-helpdesk-ticket badge — แจ้งเฉพาะ Ticket ใหม่ที่ทีมยังไม่ได้ตอบลูกค้า
    // การตอบภายนอกครั้งแรกจะบันทึก firstResponseAt; โน้ตภายในจะไม่ถือว่าเป็นการตอบ
    var hdNew = (window.HELPDESK_TICKETS || []).filter(function (t) {
      return t.status === 'new' && !t.firstResponseAt;
    }).length;
    var hdNb = document.getElementById('hd-nb');
    if (hdNb) { hdNb.textContent = hdNew; hdNb.style.display = hdNew ? '' : 'none'; }

    // กระดิ่งแจ้งเตือนมุมขวาบน — รวมทุกเรื่องข้างบน (เฉพาะหน้าที่ role ดูได้)
    var can = function (m) { return !window.canView || window.canView(m); };
    _notiItems = [
      { mod: 'advance',  icon: 'credit-card', n: can('advance')  ? ov    : 0, label: 'Advance เกินกำหนด' },
      { mod: 'leave',    icon: 'calendar-off', n: can('leave')    ? pend  : 0, label: 'การลาของคุณรออนุมัติ' },
      { mod: 'helpdesk', icon: 'headset', n: can('helpdesk') ? hdNew : 0, label: 'Ticket ใหม่ที่ยังไม่ได้ตอบ' },
      // คำขอจาก "ลืมรหัสผ่าน?" หน้า Login → Admin ตั้งรหัสใหม่ใน Admin Panel › ผู้ใช้งานระบบ
      { mod: 'pwreset', icon: 'key', label: 'คำขอรีเซ็ตรหัสผ่าน',
        n: window.isAdmin && window.isAdmin() ? (window.USERS || []).filter(function (u) { return u.resetRequestedAt; }).length : 0 },
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
    m.innerHTML = '<div class="nm-head">' + (window.appIcon ? window.appIcon('bell') : '') + ' การแจ้งเตือน</div>'
      + (_notiItems.length
        ? _notiItems.map(function (x) {
            return '<button type="button" data-mod="' + x.mod + '"><span class="nm-ic">' + (window.appIcon ? window.appIcon(x.icon) : '') + '</span>'
              + '<span class="nm-lbl">' + x.label + '</span><span class="nm-n">' + x.n + '</span></button>';
          }).join('')
        : '<div class="nm-empty">ไม่มีการแจ้งเตือน</div>')
      + (window.webPushMenuHtml ? window.webPushMenuHtml() : '')
      + (window.wlRemindMenuHtml ? window.wlRemindMenuHtml() : '');
  }
  window.refreshNotiMenu = _renderNotiMenu;
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
      var action = ev.target.closest('button[data-action]');
      if (action) {
        var act = action.getAttribute('data-action');
        if (act === 'web-push') window.toggleWebPush && window.toggleWebPush();
        else if (act === 'wlr-voice') window.wlRemindCycleVoice && window.wlRemindCycleVoice();
        else if (act === 'wlr-test') window.wlRemindTest && window.wlRemindTest();
        return;
      }
      var b = ev.target.closest('button[data-mod]');
      if (!b) return;
      var mod = b.getAttribute('data-mod');
      _closeNotiMenu();
      if (mod === 'pwreset') { window.admCur = 'users'; mod = 'admin'; } // คำขอรีเซ็ตรหัสผ่าน → Admin Panel › ผู้ใช้งานระบบ
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
      'view-team-map':     'renderTeamMap',
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

  // ── เมนูบัญชีผู้ใช้: กดชื่อผู้ใช้ท้าย sidebar → เปลี่ยนรหัสผ่าน / แนะนำการใช้งาน / ออกจากระบบ
  // วางเหนือแถวผู้ใช้ · sidebar แบบย่อ (เหลือแค่อวาตาร์) → วางด้านขวาแทน · ปิดเมื่อกดที่อื่น/Esc ──
  function _closeUserMenu() { var m = document.getElementById('user-menu'); if (m) m.remove(); }
  window.toggleUserMenu = function (e) {
    if (e) e.stopPropagation();
    if (document.getElementById('user-menu')) { _closeUserMenu(); return; }
    var row = e && e.currentTarget, cu = window.cu || {};
    var m = document.createElement('div');
    m.id = 'user-menu';
    m.innerHTML = '<div class="um-head"><b>' + window.esc(cu.name || cu.username || '') + '</b><span>'
      + window.esc(window.userRoleLabel(cu)) + '</span></div>'
      + '<button type="button" data-act="pw">🔒 เปลี่ยนรหัสผ่าน</button>'
      + '<button type="button" data-act="tour">🧭 แนะนำการใช้งาน</button>'
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
      else if (act === 'tour') window.startTour && window.startTour();
      else window.doLogout && window.doLogout();
    });
  };
  document.addEventListener('click', function (e) {
    var m = document.getElementById('user-menu');
    if (m && !m.contains(e.target)) _closeUserMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _closeUserMenu(); });

  // ── มีอะไรใหม่: popup รายการปรับแก้ของเวอร์ชันที่ผู้ใช้ยังไม่กดรับทราบ (src/config/changelog.config.js) ──
  // จำการรับทราบแยกตามผู้ใช้ (users.id) ในเบราว์เซอร์ — เวอร์ชันถัดไปจะเตือนใหม่อีกครั้ง
  var _whatsNewShown = false;
  function _verAckKey() { return '_bms_ver_ack_' + (window.cu && window.cu.id); }
  function _getVerAck() { try { return localStorage.getItem(_verAckKey()); } catch (e) { return null; } }

  // force = เปิดดูเองจากการคลิกเลขเวอร์ชัน (แสดงเวอร์ชันล่าสุดแม้รับทราบแล้ว)
  window.showWhatsNew = function (force) {
    var log = window.CHANGELOG || [];
    if (!log.length || (!window.cu && !force)) return; // ก่อนเข้าสู่ระบบเปิดได้เฉพาะกดเอง (ปุ่มมีอะไรใหม่ หน้าล็อกอิน)
    if (!force && (_whatsNewShown || _getVerAck() === window.APP_VERSION)) return;
    var ack = force ? null : _getVerAck();
    var seen = log.findIndex(function (v) { return v.version === ack; });
    // ยังไม่เคยรับทราบ/ไม่พบเวอร์ชันเดิมในรายการ → แสดงเฉพาะเวอร์ชันล่าสุด
    var list = log.slice(0, seen > 0 ? seen : 1);
    var esc = window.esc;
    var TYPES = { new: 'ใหม่', improve: 'ปรับปรุง', fix: 'แก้ไข' };
    var count = list.reduce(function (n, v) { return n + v.items.length; }, 0);
    document.getElementById('wn-ver').textContent = window.APP_VERSION;
    document.getElementById('wn-sub').textContent = (list[0].date ? 'อัปเดตเมื่อ ' + window.fd(list[0].date) + ' · ' : '')
      + count + ' รายการที่เปลี่ยน' + (list.length > 1 ? ' (รวม ' + list.length + ' เวอร์ชันที่คุณยังไม่ได้ดู)' : '');
    document.getElementById('wn-body').innerHTML = list.map(function (v) {
      return (list.length > 1 ? '<div class="wn-group">' + esc(v.version) + '</div>' : '')
        + v.items.map(function (it) {
          var t = TYPES[it.type] ? it.type : 'new';
          return '<div class="wn-item wn-' + t + '">'
            + '<div class="wn-ic">' + esc(it.icon || '✨') + '</div>'
            + '<div class="wn-main">'
            +   '<div class="wn-top"><span class="wn-tag">' + TYPES[t] + '</span><span class="wn-title">' + esc(it.title) + '</span></div>'
            +   (it.where ? '<div class="wn-where"><span>📍 อยู่ที่</span>' + esc(it.where) + '</div>' : '')
            +   (it.desc ? '<div class="wn-desc">' + esc(it.desc) + '</div>' : '')
            + '</div></div>';
        }).join('');
    }).join('');
    _whatsNewShown = true;
    // รอให้หน้าโหลดข้อมูลเสร็จก่อน ไม่ให้ซ้อนอยู่ใต้ตัวโหลด
    (function waitLoader() {
      if (document.querySelector('#sys-loader.on')) return setTimeout(waitLoader, 300);
      window.openM('m-whats-new');
      // เปิดมาแล้วเริ่มอ่านให้ฟังทันที ไม่ต้องกดเอง
      if (!_wnSpeaking) window.toggleWhatsNewSpeech();
    })();
  };

  window.ackWhatsNew = function () {
    if (window.cu) try { localStorage.setItem(_verAckKey(), window.APP_VERSION); } catch (e) {}
    window.closeM('m-whats-new');
  };

  // ── AI อ่านให้ฟัง: เสียง AI ภาษาไทย (src/services/tts.service.js → backend /api/tts) ──
  // เปิด popup แล้วเริ่มอ่านเอง: กล่าวทักทาย → บทนำ → หัวข้อทุกรายการ (ข้อละ 1 ท่อน) + ไฮไลต์รายการที่กำลังอ่าน
  var _wnSpeaking = false, _wnState = 'off';
  function _wnSpeechUi(state) { // 'off' | 'load' | 'wait' | 'on'
    _wnState = state;
    _wnSpeaking = state !== 'off';
    var b = document.getElementById('wn-speak');
    if (b) {
      b.classList.toggle('on', _wnSpeaking);
      b.querySelector('.wn-speak-ic').textContent = state === 'load' ? '⏳' : state === 'wait' ? '👆' : _wnSpeaking ? '⏹' : '🔊';
      b.querySelector('.wn-speak-lbl').textContent = state === 'load' ? 'กำลังเตรียมเสียง…'
        : state === 'wait' ? 'แตะที่ใดก็ได้เพื่อฟัง' : _wnSpeaking ? 'หยุดอ่าน' : 'AI อ่านให้ฟัง';
    }
    if (!_wnSpeaking) document.querySelectorAll('#wn-body .wn-reading').forEach(function (el) { el.classList.remove('wn-reading'); });
  }
  function _stopWhatsNewSpeech() {
    if (!_wnSpeaking) return;
    window.TTS.stop();
    _wnSpeechUi('off');
  }
  window.toggleWhatsNewSpeech = function () {
    if (_wnState === 'wait') return; // กดปุ่ม "แตะเพื่อฟัง" = การแตะที่ปลดล็อกเสียงแล้ว ไม่ใช่สั่งหยุด
    if (_wnSpeaking) return _stopWhatsNewSpeech();
    var items = Array.prototype.slice.call(document.querySelectorAll('#wn-body .wn-item'));
    // คิวคำพูด: ทักทาย → บทนำ → "ข้อ N <หัวข้อ>" ครบทุกรายการ
    var h = new Date().getHours();
    var name = (window.cu && (window.cu.name || window.cu.username)) || '';
    var queue = [
      { text: 'สวัสดี' + (h >= 5 && h < 12 ? 'ตอนเช้า' : h >= 12 && h < 17 ? 'ตอนบ่าย' : h >= 17 && h < 21 ? 'ตอนเย็น' : '') + 'ค่ะ' + (name ? ' คุณ' + name : '') },
      { text: 'ระบบอัปเดตเป็นเวอร์ชัน ' + window.APP_VERSION + ' แล้วนะคะ มีอะไรใหม่ทั้งหมด ' + items.length + ' ข้อ มาดูกันเลยค่ะ' },
    ];
    items.forEach(function (el, i) {
      queue.push({ text: 'ข้อ ' + (i + 1) + ' ' + el.querySelector('.wn-title').textContent, data: el });
    });
    _wnSpeechUi('load');
    window.TTS.play(queue, {
      onWait: function () { if (_wnSpeaking) _wnSpeechUi('wait'); },
      onPart: function (part) {
        if (!_wnSpeaking) return;
        _wnSpeechUi('on');
        var el = part.data;
        document.querySelectorAll('#wn-body .wn-reading').forEach(function (x) { if (x !== el) x.classList.remove('wn-reading'); });
        if (el && !el.classList.contains('wn-reading')) {
          el.classList.add('wn-reading');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      },
      onEnd: function () { _wnSpeechUi('off'); },
      onError: function (err) { _wnSpeechUi('off'); window.showToast(err.message, 'error'); },
    });
  };

  // ปิด popup ด้วยวิธีใดก็ตาม (ปุ่ม/Esc/คลิกนอกกรอบ) → หยุดอ่าน
  document.addEventListener('DOMContentLoaded', function () {
    var m = document.getElementById('m-whats-new');
    if (m) new MutationObserver(function () { if (!m.classList.contains('on')) _stopWhatsNewSpeech(); })
      .observe(m, { attributes: true, attributeFilter: ['class'] });
  });

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
    var verEl = document.getElementById('app-ver');
    if (verEl) verEl.textContent = window.APP_VERSION || '';
    // ฟอนต์กราฟทุกหน้าให้ตรงกับฟอนต์ของแอป (Chart.js โหลดแบบ defer → พร้อมก่อน DOMContentLoaded)
    if (window.Chart) window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    // กราฟถูกสร้างใหม่ทุกครั้งที่เข้าหน้า/ข้อมูลเปลี่ยน — แอนิเมชันเริ่มต้น 1 วินาทีแย่งเฟรมกับการวาดหน้า (เลื่อนจอกระตุก) จึงย่อให้สั้น
    if (window.Chart) window.Chart.defaults.animation.duration = 250;

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
