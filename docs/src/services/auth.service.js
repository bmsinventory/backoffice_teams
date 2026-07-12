/**
 * auth.service.js — Authentication Service
 * จัดการ login, logout, user session, และ seed data
 * ต้องโหลดหลัง supabase.service.js และ utils/
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

  // ── Seed Database (ถ้า Supabase ว่างเปล่า) ──
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

    // Remember me
    var remEl = document.getElementById('l-rem');
    if (remEl && remEl.checked) window.StorageService.setRememberedUser(usr.username);
    else window.StorageService.clearRememberedUser();

    // Set current user & switch to app view
    window.cu = usr;
    document.getElementById('login').style.display = 'none';
    document.getElementById('wrap').style.display = 'flex';

    // Reset views & nav (clear all — permission-aware default view set after setupUser)
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('on'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('on'); });
    document.querySelectorAll('.bottom-nav-item').forEach(function (n) { n.classList.remove('active'); });
    try { history.replaceState(null, '', location.pathname); } catch (e) {}

    if (window.isDbLoaded) {
      window.setupUser && window.setupUser();
      window.renderAll && window.renderAll();
      window._goDefaultView && window._goDefaultView();
    } else {
      window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
      window.setupUser && window.setupUser();
      var waitRender = setInterval(function () {
        if (window.isDbLoaded) {
          clearInterval(waitRender);
          window.renderAll && window.renderAll();
          window._goDefaultView && window._goDefaultView();
        }
      }, 300);
      setTimeout(function () {
        clearInterval(waitRender);
        window.renderAll && window.renderAll();
        window._goDefaultView && window._goDefaultView();
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
    if (remUser && uEl) uEl.value = remUser;
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

  // ── Initialize: seed + start realtime ──
  seedDatabaseIfEmpty().then(function () {
    window.RealtimeService && window.RealtimeService.setup();
    window.ImplTrackerService && window.ImplTrackerService.setup();
  }).catch(function (e) {
    console.warn('[auth.service] init error:', e.message);
  });

})();
