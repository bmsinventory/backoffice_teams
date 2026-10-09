/**
 * auth.service.js — Authentication Service
 * จัดการ login, logout, user session
 * ต้องโหลดหลัง db.service.js และ utils/
 */
(function () {

  // ── Backward-compat: window.auth.currentUser ──
  window.auth = {};
  Object.defineProperty(window.auth, 'currentUser', {
    get: function () { return window.cu || null; },
    configurable: true,
  });

  // ── Login UI Reset ──
  function _loginBtnReset() {
    var btn  = document.getElementById('login-btn');
    var txt  = document.getElementById('lbtn-txt');
    var spin = document.getElementById('lbtn-spin');
    if (btn)  btn.disabled = false;
    if (txt)  txt.style.display = '';
    if (spin) spin.style.display = 'none';
  }

  // ── Perform Login ──
  function doLoginNow(username, password) {
    var errEl    = document.getElementById('lerr');
    var errMsg   = document.getElementById('lerr-msg');
    var infoEl   = document.getElementById('linfo');
    var searchList = window.USERS || [];
    var usr = searchList.find(function (x) {
      return x.username === username && x.password === password && x.active !== false;
    });

    if (!usr) {
      if (errMsg) errMsg.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
      if (errEl)  errEl.style.display = 'flex';
      if (infoEl) infoEl.style.display = 'none';
      _loginBtnReset();
      return;
    }

    // Remember me — จำทั้ง username และ password (base64 เบา ๆ ใน StorageService) เมื่อติ๊กไว้
    var remEl = document.getElementById('l-rem');
    var remember = !!(remEl && remEl.checked);
    if (remember) {
      window.StorageService.setRememberedUser(usr.username);
      window.StorageService.setRememberedPassword(password);
    } else {
      window.StorageService.clearRememberedUser();
      window.StorageService.clearRememberedPassword();
    }
    // เก็บ session ไว้ — กด Refresh แล้วไม่ต้องล็อกอินใหม่ (ดู _restoreSession)
    window.StorageService.setSession({ uid: usr.id, sig: _sessSig(usr) }, remember);
    _enterApp(usr, false);
  }

  // ── ลายเซ็น session (ตัวจริง src/utils/session.util.js — ใช้ร่วมกับระบบอบรม/ระบบสอบ) ──
  function _sessSig(u) { return window.BmsSession.sig(u); }

  // ── เข้าสู่หน้าแอป (หลังตรวจรหัสผ่าน หรือกู้ session หลัง Refresh) ──
  // restore = true → กลับไปหน้าที่เปิดค้างไว้ก่อน Refresh (#ชื่อหน้า ใน URL) แทนหน้าเริ่มต้นตามสิทธิ์
  function _enterApp(usr, restore) {
    // Set current user & switch to app view
    window.cu = usr;
    window.syncWebPush && window.syncWebPush();
    window.preloadTraining && window.preloadTraining();
    window.saveDataCache && window.saveDataCache();
    document.getElementById('login').style.display = 'none';
    document.getElementById('wrap').style.display = 'flex';

    // Reset views & nav (clear all — permission-aware default view set after setupUser)
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('on'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('on'); });
    document.querySelectorAll('.bottom-nav-item').forEach(function (n) { n.classList.remove('active'); });

    // ── รักษา deep link (เช่น #leave=LV123&approve=1 จากลิงก์แจ้งเตือน) ข้ามหน้า login ──
    // ต้องเป็น hash แบบ "module=itemId&params" (มี "=") เท่านั้นถึงถือว่าเป็นลิงก์แจ้งเตือนจริง — hash
    // เปล่า ๆ แค่ชื่อ module (เช่น #kanban, #all_issues) เป็นแค่ร่องรอยจาก history.replaceState ตอนสลับ
    // view ปกติ (ดู goTo ใน router.js) ไม่ใช่ deep link ที่ตั้งใจ ถ้านับรวมด้วยจะทำให้ผู้ใช้ล็อกอินใหม่แล้ว
    // ถูกพากลับไป view เดิมที่ค้างอยู่ในแถบ URL เสมอ แทนที่จะเข้า default view ตามสิทธิ์ตามปกติ ──
    var _dlHash = location.hash.replace('#', '');
    var _dlEq = _dlHash.indexOf('=');
    var _dlModule = _dlEq > -1 ? _dlHash.slice(0, _dlEq) : '';
    var _hasDeepLink = !!(_dlEq > -1 && _dlModule && window.ROUTE_MAP && window.ROUTE_MAP[_dlModule]);
    // Refresh: hash เปล่า ๆ ชื่อหน้า (เช่น #kanban) คือหน้าที่เปิดค้างอยู่ → กลับไปหน้าเดิม
    var _restoreView = restore && !_hasDeepLink && window.ROUTE_MAP && window.ROUTE_MAP[_dlHash] ? _dlHash : '';
    if (!_hasDeepLink && !_restoreView) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    var _goAfterLoad = _hasDeepLink ? window._handleDeepLink
      : _restoreView ? function () { window.goView && window.goView(_restoreView); }
      : window._goDefaultView;

    if (window.isDbLoaded) {
      window.setupUser && window.setupUser();
      window.renderAll && window.renderAll();
      _goAfterLoad && _goAfterLoad();
      window.maybeStartTour && window.maybeStartTour();  // ครั้งแรกที่เข้าใช้ → ทัวร์แนะนำเมนู (src/modules/tour.js)
    } else {
      window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
      window.setupUser && window.setupUser();
      var waitRender = setInterval(function () {
        if (window.isDbLoaded) {
          clearInterval(waitRender);
          window.renderAll && window.renderAll();
          _goAfterLoad && _goAfterLoad();
          window.maybeStartTour && window.maybeStartTour();
        }
      }, 300);
      setTimeout(function () {
        clearInterval(waitRender);
        window.renderAll && window.renderAll();
        _goAfterLoad && _goAfterLoad();
      }, 15000);
    }
  }

  // ── Public Login Function ──
  window.doLogin = function () {
    var u    = (document.getElementById('lu') || {}).value || '';
    var p    = (document.getElementById('lp') || {}).value || '';
    var errEl  = document.getElementById('lerr');
    var errMsg = document.getElementById('lerr-msg');

    if (!u.trim() || !p) {
      if (errMsg) errMsg.textContent = 'กรุณากรอก Username และ Password';
      if (errEl)  errEl.style.display = 'flex';
      return;
    }

    var btn  = document.getElementById('login-btn');
    var txt  = document.getElementById('lbtn-txt');
    var spin = document.getElementById('lbtn-spin');
    if (btn)  btn.disabled = true;
    if (txt)  txt.style.display = 'none';
    if (spin) spin.style.display = 'inline-block';
    if (errEl)  errEl.style.display = 'none';

    if (window.isDbLoaded) {
      doLoginNow(u.trim(), p);
    } else {
      var infoEl = document.getElementById('linfo');
      if (infoEl) { infoEl.textContent = 'กำลังเชื่อมต่อฐานข้อมูล...'; infoEl.style.display = 'block'; }
      var attempt = 0;
      window._loginRetryInterval = setInterval(function () {
        attempt++;
        if (window.isDbLoaded) {
          clearInterval(window._loginRetryInterval);
          if (infoEl) infoEl.style.display = 'none';
          doLoginNow(u.trim(), p);
        } else if (attempt > 30) {
          clearInterval(window._loginRetryInterval);
          if (errMsg) errMsg.textContent = 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่';
          if (errEl)  errEl.style.display = 'flex';
          if (infoEl) infoEl.style.display = 'none';
          _loginBtnReset();
        }
      }, 500);
    }
  };

  // ── "ลืมรหัสผ่าน?" หน้า Login → กรอก Username ส่งคำขอถึง Admin (users.pw_reset_requested_at → กระดิ่งของ Admin)
  // Admin ตั้งรหัสใหม่ใน Admin Panel › ผู้ใช้งานระบบ แล้วคำขอจะหายเอง ──
  function _closeForgot() { var m = document.getElementById('pw-forgot'); if (m) m.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _closeForgot(); });
  window.openForgotPassword = function () {
    _closeForgot();
    var uEl = document.getElementById('lu');
    var m = document.createElement('div');
    m.id = 'pw-forgot';
    m.innerHTML = '<div class="pwf-box" role="dialog" aria-modal="true" aria-labelledby="pwf-title">'
      + '<div class="pwf-head"><b id="pwf-title">🔑 ลืมรหัสผ่าน</b><button type="button" class="pwf-x" aria-label="ปิด">✕</button></div>'
      + '<p class="pwf-p">กรอกชื่อผู้ใช้ Admin จะเห็นคำขอที่กระดิ่งแจ้งเตือน แล้วตั้งรหัสผ่านใหม่ให้</p>'
      + '<label class="f-label" for="pwf-user">Username</label>'
      + '<input class="f-input" id="pwf-user" autocomplete="username" value="' + window.esc(uEl ? uEl.value.trim() : '') + '">'
      + '<div class="pwf-msg" id="pwf-msg"></div>'
      + '<div class="pwf-foot"><button type="button" class="btn btn-pri" id="pwf-send">ส่งคำขอ</button></div></div>';
    document.body.appendChild(m);
    m.querySelector('.pwf-x').onclick = _closeForgot;
    var inp = document.getElementById('pwf-user'), btn = document.getElementById('pwf-send'), msg = document.getElementById('pwf-msg');
    var setMsg = function (t, kind) { msg.textContent = t; msg.className = 'pwf-msg' + (kind ? ' ' + kind : ''); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
    setTimeout(function () { inp.focus(); }, 50);
    btn.onclick = async function () {
      var name = (inp.value || '').trim();
      if (!name) { setMsg('กรอกชื่อผู้ใช้ก่อน', 'err'); return; }
      btn.disabled = true;
      try {
        for (var i = 0; i < 30 && !window.isDbLoaded; i++) await new Promise(function (r) { setTimeout(r, 500); });
        var u = (window.USERS || []).find(function (x) { return x.username === name && x.active !== false; });
        if (u) await window.updateDoc(window.getDocRef('USERS', u.id), { pw_reset_requested_at: new Date().toISOString() });
        // ตอบเหมือนกันทุกกรณี — ไม่บอกว่ามีชื่อผู้ใช้นี้ในระบบหรือไม่
        setMsg('ส่งคำขอแล้ว ถ้ามีบัญชีนี้ในระบบ Admin จะตั้งรหัสผ่านใหม่ให้ แล้วแจ้งกลับ', 'ok');
      } catch (e) {
        // ส่วนใหญ่ = ยังไม่ได้รัน SQL เพิ่มคอลัมน์ users.pw_reset_requested_at (ดู db-schema.sql)
        console.warn('[forgot-password] บันทึกคำขอไม่สำเร็จ:', (e && (e.message || e.details)) || e);
        setMsg('ส่งคำขอไม่สำเร็จ กรุณาติดต่อ Admin โดยตรง', 'err');
        btn.disabled = false;
      }
    };
  };

  // ── Logout ──
  window.doLogout = function () {
    window.disableWebPush && window.disableWebPush(true);
    window.cu = null;
    window.StorageService.clearSession();
    window.clearDataCache && window.clearDataCache(); // ข้อมูลที่เก็บไว้ในเครื่อง (db.service.js) — ไม่ทิ้งไว้ให้คนถัดไป
    window.resetTraining && window.resetTraining();
    if (window._loginRetryInterval) { clearInterval(window._loginRetryInterval); window._loginRetryInterval = null; }
    window.closeMobSidebar && window.closeMobSidebar();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    document.getElementById('wrap').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    _loginBtnReset();
    var uEl = document.getElementById('lu');
    var pEl = document.getElementById('lp');
    var errEl = document.getElementById('lerr');
    var infoEl = document.getElementById('linfo');
    if (uEl) uEl.value = '';
    if (pEl) pEl.value = '';
    if (errEl) errEl.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
    var remUser = window.StorageService.getRememberedUser();
    var remPass = window.StorageService.getRememberedPassword();
    if (remUser && uEl) uEl.value = remUser;
    if (remPass && pEl) pEl.value = remPass;
  };

  // ── Toggle login password show/hide ──
  window.toggleLoginPw = function () {
    var inp      = document.getElementById('lp');
    var showIcon = document.getElementById('eye-show');
    var hideIcon = document.getElementById('eye-hide');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (showIcon) showIcon.style.display = inp.type === 'text' ? 'none' : '';
    if (hideIcon) hideIcon.style.display = inp.type === 'text' ? '' : 'none';
  };

  // ── Bind login button click on DOM ready ──
  document.addEventListener('DOMContentLoaded', function () {
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', function () {
      window.doLogin && window.doLogin();
    });
  });

  // ── กู้ session หลัง Refresh: ซ่อนหน้าล็อกอินทันที (ไม่ให้วาบ) รอข้อมูลผู้ใช้โหลด แล้วตรวจว่ายังใช้ได้
  // (บัญชียังเปิดอยู่ + รหัสผ่านไม่เปลี่ยน) → เข้าแอปต่อหน้าเดิม · ไม่ผ่าน/โหลดไม่ทัน → ลบ session กลับหน้าล็อกอิน ──
  function _restoreSession() {
    var root = document.documentElement;
    var sess = window.StorageService.getSession();
    if (!sess || !sess.uid) { root.classList.remove('boot-sess'); return; }
    var loginEl = document.getElementById('login');
    if (loginEl) loginEl.style.display = 'none';
    window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (!window.isDbLoaded && tries < 300) return; // รอสูงสุด ~30 วินาที
      clearInterval(t);
      var list = window.USERS || [];
      var usr = window.isDbLoaded && list.find(function (x) { return x.id === sess.uid && x.active !== false; });
      if (usr && _sessSig(usr) === sess.sig) {
        window.hideLoader && window.hideLoader();
        _enterApp(usr, true);
        root.classList.remove('boot-sess');
        return;
      }
      window.StorageService.clearSession();
      window.hideLoader && window.hideLoader();
      root.classList.remove('boot-sess');
      if (loginEl) loginEl.style.display = 'flex';
    }, 100);
  }
  document.addEventListener('DOMContentLoaded', _restoreSession);

  // ── Initialize: start realtime (รอให้ service ที่โหลดทีหลังพร้อมก่อน) ──
  document.addEventListener('DOMContentLoaded', function () {
    window.RealtimeService && window.RealtimeService.setup();
    window.ImplTrackerService && window.ImplTrackerService.setup();
    window.FormTrackerService && window.FormTrackerService.setup();
  });

})();
