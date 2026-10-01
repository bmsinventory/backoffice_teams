/**
 * auth.service.js — Authentication Service
 * จัดการ login, logout, user session, และ seed data
 * ต้องโหลดหลัง db.service.js และ utils/
 */
(function () {

  // ── Backward-compat: window.auth.currentUser ──
  window.auth = {};
  Object.defineProperty(window.auth, 'currentUser', {
    get: function () { return window.cu || null; },
    configurable: true,
  });

  // ── Default Users (fallback ถ้า DB ว่าง) ──
  var DEFAULT_USERS = [
    { id:'U1', username:'admin',  password:'admin123', role:'admin',  name:'Admin User',        active:true },
    { id:'U2', username:'pm1',    password:'pm1234',   role:'pm',     name:'Project Manager 1', active:true },
    { id:'U3', username:'viewer', password:'view1234', role:'viewer', name:'Viewer User',       active:true },
  ];

  // ── Seed Database (ถ้าฐานข้อมูลว่างเปล่า) ──
  async function seedDatabaseIfEmpty() {
    try {
      var deptsSnap = await window.getDocs(window.getColRef('DEPARTMENTS'));
      if (deptsSnap.empty) {
        var dBatch = window.writeBatch();
        ['ติดตั้งระบบคลังสินค้า','ติดตั้งระบบและดูแลหลังการขาย','ติดตั้งระบบบัญชี','แผนกวิเคราะห์ข้อมูล','แผนกฝึกอบรม'].forEach(function (name, i) {
          var did = 'DEPT_' + (i + 1);
          dBatch.set(window.getDocRef('DEPARTMENTS', did), { dept_id:did, label_th:name });
        });
        await dBatch.commit();
      }

      var usersSnap = await window.getDocs(window.getColRef('USERS'));
      if (usersSnap.empty) {
        var batch = window.writeBatch();
        DEFAULT_USERS.forEach(function (u) { batch.set(window.getDocRef('USERS', u.id), u); });
        [
          { id:'pending', label:'รอดำเนินการ', color:'#9ba3b8', order:1 },
          { id:'plan',    label:'วางแผน',      color:'#ffa62b', order:2 },
          { id:'exec',    label:'ดำเนินการ',   color:'#4361ee', order:3 },
          { id:'deliver', label:'ส่งมอบ',      color:'#7c5cfc', order:4 },
          { id:'close',   label:'ปิดโครงการ',  color:'#06d6a0', order:5 },
        ].forEach(function (s) { batch.set(window.getDocRef('STAGES', s.id), s); });
        [
          { id:'gen', label:'General', color:'#4361ee' },
          { id:'urg', label:'Urgent',  color:'#ff6b6b' },
        ].forEach(function (t) { batch.set(window.getDocRef('PTYPES', t.id), t); });
        await batch.commit();
      }
    } catch (err) {
      console.warn('[auth.service] seed error:', err.message);
    }
  }

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
    var searchList = (window.USERS && window.USERS.length > 0) ? window.USERS : DEFAULT_USERS;
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

  // ── ลายเซ็น session จาก id + รหัสผ่านปัจจุบัน — เปลี่ยนรหัสผ่านแล้ว session เก่าใช้ไม่ได้ (ไม่เก็บรหัสผ่านเอง) ──
  function _sessSig(u) {
    var s = String(u.id) + '|' + String(u.password || ''), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // ── เข้าสู่หน้าแอป (หลังตรวจรหัสผ่าน หรือกู้ session หลัง Refresh) ──
  // restore = true → กลับไปหน้าที่เปิดค้างไว้ก่อน Refresh (#ชื่อหน้า ใน URL) แทนหน้าเริ่มต้นตามสิทธิ์
  function _enterApp(usr, restore) {
    // Set current user & switch to app view
    window.cu = usr;
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
    } else {
      window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
      window.setupUser && window.setupUser();
      var waitRender = setInterval(function () {
        if (window.isDbLoaded) {
          clearInterval(waitRender);
          window.renderAll && window.renderAll();
          _goAfterLoad && _goAfterLoad();
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

  // ── Logout ──
  window.doLogout = function () {
    window.cu = null;
    window.StorageService.clearSession();
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
    var sess = window.StorageService.getSession();
    if (!sess || !sess.uid) return;
    var loginEl = document.getElementById('login');
    if (loginEl) loginEl.style.display = 'none';
    window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (!window.isDbLoaded && tries < 60) return; // รอสูงสุด ~30 วินาที
      clearInterval(t);
      var list = (window.USERS && window.USERS.length) ? window.USERS : DEFAULT_USERS;
      var usr = window.isDbLoaded && list.find(function (x) { return x.id === sess.uid && x.active !== false; });
      if (usr && _sessSig(usr) === sess.sig) { window.hideLoader && window.hideLoader(); _enterApp(usr, true); return; }
      window.StorageService.clearSession();
      window.hideLoader && window.hideLoader();
      if (loginEl) loginEl.style.display = 'flex';
    }, 500);
  }
  document.addEventListener('DOMContentLoaded', _restoreSession);

  // ── Initialize: seed + start realtime ──
  seedDatabaseIfEmpty().then(function () {
    window.RealtimeService && window.RealtimeService.setup();
    window.ImplTrackerService && window.ImplTrackerService.setup();
    window.FormTrackerService && window.FormTrackerService.setup();
  }).catch(function (e) {
    console.warn('[auth.service] init error:', e.message);
  });

})();
