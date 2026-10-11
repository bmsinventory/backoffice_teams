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

  // ── Perform Login — ฐานข้อมูลตรวจรหัสผ่าน (bo_login) ได้ token ของ session กลับมา (src/utils/session.util.js)
  // เบราว์เซอร์ไม่มีรหัสผ่านของใครเลย · ผิด 10 ครั้งติด = ล็อก 15 นาที ──
  async function doLoginNow(username, password) {
    var errEl    = document.getElementById('lerr');
    var errMsg   = document.getElementById('lerr-msg');
    var infoEl   = document.getElementById('linfo');
    var showErr = function (msg) {
      if (errMsg) errMsg.textContent = msg;
      if (errEl)  errEl.style.display = 'flex';
      if (infoEl) infoEl.style.display = 'none';
      _loginBtnReset();
    };
    var remEl = document.getElementById('l-rem');
    var remember = !!(remEl && remEl.checked);

    var r;
    try { r = await window.BmsSession.login(window.getDb(), username, password, remember); }
    catch (e) { console.error('[auth] login', e); showErr('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่'); return; }
    var usr = r.uid && (window.USERS || []).find(function (x) { return x.id === r.uid && x.active !== false; });
    if (r.error === 'locked') { showErr('ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว ลองใหม่ในอีก ' + (r.minutes || 15) + ' นาที'); return; }
    if (!usr) {
      if (r.uid) window.BmsSession.logout(window.getDb());
      showErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      window.LoginFace && window.LoginFace.react('error'); // ตัวการ์ตูนส่ายหัว (src/modules/login-face.js)
      return;
    }

    // รหัสเดาง่าย / รหัสตั้งต้นจาก Admin 123456 (src/utils/pw-policy.util.js) → ยังไม่เข้าแอป ตั้งรหัสใหม่บนการ์ด Login ก่อน
    // (ไม่ส่งรหัสเดาง่ายให้ตัวจัดการรหัสผ่านของเบราว์เซอร์ → Chrome ไม่เด้งเตือน "รหัสผ่านรั่วไหล")
    if (window.PwPolicy.weak(password, usr.username)) { _startPwFix(usr, username, password, remember); return; }
    window.PwPolicy.unflag();
    _finishLogin(usr, username, password, remember);
  }

  function _finishLogin(usr, username, password, remember) {
    // Remember me — จำแค่ชื่อผู้ใช้ (รหัสผ่านให้ตัวจัดการรหัสผ่านของเบราว์เซอร์จำ) · session อยู่ต่อแม้ปิดเบราว์เซอร์
    if (remember) window.StorageService.setRememberedUser(usr.username);
    else { window.StorageService.clearRememberedUser(); window.LoginFace && window.LoginFace.forget(); } // ไม่จดจำ = ไม่เก็บชื่อ/รูปไว้ในเครื่อง
    // ช่อง Login ไม่ได้อยู่ใน <form> เบราว์เซอร์จึงไม่ถามบันทึกรหัสเอง → ส่งให้ตัวจัดการรหัสผ่านของเบราว์เซอร์ (Chrome/Edge — ผู้ใช้กดยืนยันเอง)
    if (remember && window.PasswordCredential && navigator.credentials) {
      try { navigator.credentials.store(new window.PasswordCredential({ id: username, password: password, name: usr.name || username })).catch(function () {}); } catch (e) {}
    }
    window.LoginFace && window.LoginFace.splash(usr); // หน้าทักทายตัวการ์ตูน ระหว่างแอปโหลดด้านหลัง
    _enterApp(usr, false);
  }

  // ── รหัสเดาง่าย: บังคับตั้งรหัสใหม่บนการ์ด Login (.is-pwfix) ก่อนเข้าแอป ──
  // session ที่เพิ่งได้ใช้เปลี่ยนรหัส (bo_change_password) · ปิดแท็บ/Refresh ระหว่างนี้ = ถูกออกจากระบบ (flag — _restoreSession)
  // ช่อง #lp เดิมล้างค่าแล้วใช้เป็นช่องรหัสใหม่ — ห้ามซ่อน/ลบ: Chrome จะนับว่าล็อกอินสำเร็จด้วยรหัสเก่าแล้วเด้งเตือนรหัสรั่ว
  // ผู้ใช้พิมพ์รหัสใหม่ทับในช่องเดิม → ตอนเข้าแอป Chrome เห็นแค่ชื่อผู้ใช้ + รหัสใหม่
  var _pwFix = null;
  function _setLp(label, ph, ac) {
    var lp = document.getElementById('lp');
    document.getElementById('lp-label').textContent = label;
    lp.placeholder = ph; lp.setAttribute('autocomplete', ac);
    lp.type = 'password';
    var es = document.getElementById('eye-show'), eh = document.getElementById('eye-hide');
    if (es) es.style.display = ''; if (eh) eh.style.display = 'none';
    return lp;
  }
  function _startPwFix(usr, username, oldPw, remember) {
    _pwFix = { usr: usr, username: username, oldPw: oldPw, remember: remember };
    window.PwPolicy.flag(usr.id);
    var lp = _setLp('รหัสผ่านใหม่', 'อย่างน้อย 4 ตัว ห้ามเลขเรียง/ตัวซ้ำ', 'new-password');
    lp.value = '';
    document.getElementById('lu').readOnly = true;
    document.getElementById('lnp2').value = '';
    _pwFixMsg('');
    _loginBtnReset();
    document.querySelector('.lg-card').classList.add('is-pwfix');
    _weakPopup(usr);
  }
  // แจ้งเหตุผลเป็น popup (ไม่กินพื้นที่การ์ด) · ตัวการ์ตูนของผู้ใช้เกาะขอบบนขวา (LoginFace.figOf) ให้ดูเป็นมิตร ไม่น่าตกใจ
  // ช่อง #lp ยังอยู่ด้านหลังตามเดิม · ปิดแล้วโฟกัสช่องรหัสใหม่
  function _weakPopup(usr) {
    var fg = window.LoginFace ? window.LoginFace.figOf(usr) : null;
    var m = document.createElement('div');
    m.id = 'pw-weak';
    m.innerHTML = '<div class="pww-wrap">'
      + (fg ? '<div class="pww-fig" aria-hidden="true"><img src="' + window.esc(fg.url) + '" alt=""></div>' : '')
      + '<div class="pwf-box" role="alertdialog" aria-modal="true" aria-labelledby="pww-title">'
      + '<div class="pwf-head"><b id="pww-title">กรุณาตั้งรหัสผ่านใหม่</b></div>'
      + '<p class="pwf-p">รหัสที่ใช้อยู่เดาง่ายเกินไป (เช่น 1234, 123456) หรือเป็นรหัสตั้งต้นที่ Admin ให้มา ผู้อื่นอาจเข้าบัญชีคุณได้<br>ตั้งรหัสใหม่ก่อนเข้าสู่ระบบ</p>'
      + '<div class="pwf-foot"><button type="button" class="btn btn-pri" id="pww-ok">ตั้งรหัสใหม่</button></div></div></div>';
    document.body.appendChild(m);
    var close = function () {
      if (!m.parentNode) return;
      m.remove();
      document.removeEventListener('keydown', onKey, true);
      document.getElementById('lp').focus();
    };
    var onKey = function (e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    document.getElementById('pww-ok').onclick = close;
    setTimeout(function () { var b = document.getElementById('pww-ok'); if (b) b.focus(); }, 50);
  }
  function _pwFixMsg(msg) {
    var errEl = document.getElementById('lerr'), errMsg = document.getElementById('lerr-msg'), infoEl = document.getElementById('linfo');
    if (errMsg) errMsg.textContent = msg;
    if (errEl) errEl.style.display = msg ? 'flex' : 'none';
    if (infoEl) infoEl.style.display = 'none';
  }
  // สำเร็จ: ไม่ล้างค่า #lp (Chrome อ่านรหัสใหม่ตอนหน้า Login หายไป — doLogout ล้างให้ภายหลัง)
  function _pwFixEnd() {
    _pwFix = null;
    document.querySelector('.lg-card').classList.remove('is-pwfix');
    document.getElementById('lu').readOnly = false;
    document.getElementById('lnp2').value = '';
    _setLp('รหัสผ่าน', 'กรอกรหัสผ่าน', 'current-password');
    var b = document.getElementById('lpwfix-btn'); if (b) b.disabled = false;
  }
  window.savePwFix = async function () {
    var f = _pwFix, btn = document.getElementById('lpwfix-btn');
    if (!f || btn.disabled) return;
    var np = document.getElementById('lp').value, np2 = document.getElementById('lnp2').value;
    if (!np || !np2) return _pwFixMsg('กรุณากรอกรหัสผ่านใหม่และยืนยันให้ครบ');
    if (np !== np2) return _pwFixMsg('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (np.length < 4) return _pwFixMsg('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    if (np === f.oldPw) return _pwFixMsg('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
    if (window.PwPolicy.weak(np, f.usr.username)) return _pwFixMsg('รหัสผ่านนี้เดาง่ายเกินไป (เช่น เลขเรียง 1234, ตัวซ้ำ 0000, ชื่อผู้ใช้) กรุณาตั้งรหัสอื่น');
    btn.disabled = true;
    _pwFixMsg('');
    try {
      var res = await window.getDb().rpc('bo_change_password', { p_token: window.BmsSession.token(), p_old: f.oldPw, p_new: np });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) {
        btn.disabled = false;
        if (d.error === 'short') return _pwFixMsg('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
        window.cancelPwFix();
        return _pwFixMsg('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
      }
    } catch (e) { btn.disabled = false; return _pwFixMsg('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    window.PwPolicy.unflag();
    _pwFixEnd();
    _finishLogin(f.usr, f.username, np, f.remember);
    window.showAlert && window.showAlert('ตั้งรหัสผ่านใหม่เรียบร้อย', 'success');
  };
  // ยกเลิก = ปิด session ที่เพิ่งได้ กลับไปหน้าเข้าสู่ระบบ (เข้ามาใหม่ด้วยรหัสเดิมก็ยังต้องเปลี่ยน)
  window.cancelPwFix = function () {
    window.BmsSession.logout(window.getDb());
    _pwFixEnd();
    _pwFixMsg('');
    var lp = document.getElementById('lp'); lp.value = ''; lp.focus();
  };
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('lnp2');
    if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.savePwFix(); });
  });

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
    if (_pwFix) return window.savePwFix(); // Enter ในช่อง #lp ระหว่างตั้งรหัสใหม่
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
        // bo_request_pw_reset (db-schema.sql) — หน้าเว็บเขียนตาราง users ตรงไม่ได้แล้ว (เขียนได้เฉพาะ Admin)
        var res = await window.getDb().rpc('bo_request_pw_reset', { p_username: name });
        if (res.error) throw res.error;
        // ตอบเหมือนกันทุกกรณี — ไม่บอกว่ามีชื่อผู้ใช้นี้ในระบบหรือไม่
        setMsg('ส่งคำขอแล้ว ถ้ามีบัญชีนี้ในระบบ Admin จะตั้งรหัสผ่านใหม่ให้ แล้วแจ้งกลับ', 'ok');
      } catch (e) {
        console.warn('[forgot-password] บันทึกคำขอไม่สำเร็จ:', (e && (e.message || e.details)) || e);
        setMsg('ส่งคำขอไม่สำเร็จ กรุณาติดต่อ Admin โดยตรง', 'err');
        btn.disabled = false;
      }
    };
  };

  // ── วิดีโอแนะนำระบบ — เปิดได้จากหน้า Login โดยไม่ต้องเข้าสู่ระบบ (ไฟล์ video/showcase.mp4 โหลดเมื่อกดเท่านั้น) ──
  function _closeIntroVideo() { var m = document.getElementById('intro-video'); if (m) m.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _closeIntroVideo(); });
  window.openIntroVideo = function () {
    _closeIntroVideo();
    var m = document.createElement('div');
    m.id = 'intro-video';
    m.innerHTML = '<div class="ivid-box" role="dialog" aria-modal="true" aria-labelledby="ivid-title">'
      + '<div class="ivid-head"><div><b id="ivid-title">วิดีโอแนะนำ BMS Backoffice Workspace</b><span>1 นาที 32 วินาที · พร้อมเสียงบรรยาย</span></div><button type="button" class="ivid-x" aria-label="ปิด">✕</button></div>'
      + '<video src="video/showcase.mp4?v=4" poster="video/showcase-poster.jpg" controls autoplay playsinline preload="auto"></video></div>';
    document.body.appendChild(m);
    m.querySelector('.ivid-x').onclick = _closeIntroVideo;
    m.addEventListener('click', function (e) { if (e.target === m) _closeIntroVideo(); }); // กดพื้นหลังนอกวิดีโอ = ปิด
  };

  // ── หน้า Login: คำทักทายตามช่วงเวลา + นาฬิกา, ตัวเลขโมดูล/หมวดงาน, เลขเวอร์ชัน, แถบรายชื่อโมดูล, แสงตามเมาส์
  // วิดีโอพื้นหลังเล่นเฉพาะตอนหน้า Login แสดงอยู่ (เข้าระบบแล้ว #login ถูกซ่อน → หยุด ไม่กินเครื่อง) ──
  // ท้องฟ้าข้างคำทักทาย: ขึ้น 06:00 ตก 18:00 (ใกล้เคียงทั้งปีในไทย) · ดวงอาทิตย์/ดวงจันทร์เดินตามเส้นโค้ง ซ้าย→ขวา
  // สีท้องฟ้า: dawn 05–07 · day 07–17 · dusk 17–19 · night
  function updateLoginSky(d) {
    var sky = document.getElementById('lg-sky'), orb = document.getElementById('lg-orb');
    if (!sky || !orb) return;
    var min = d.getHours() * 60 + d.getMinutes(), isDay = min >= 360 && min < 1080;
    var p = ((isDay ? min - 360 : (min - 1080 + 1440) % 1440)) / 720; // 0 = เพิ่งขึ้น · 1 = กำลังตก
    var a = Math.PI * (1 - p), x = 60 + 40 * Math.cos(a), y = 54 - 40 * Math.sin(a);
    orb.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
    var h = d.getHours();
    sky.className = 'lg-sky ' + (isDay ? 'is-day' : 'is-night') + ' ' + (h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night');
    var left = Math.round((1 - p) * 720), txt = (left >= 60 ? Math.floor(left / 60) + ' ชม. ' : '') + (left % 60) + ' นาที';
    sky.title = 'อีก ' + txt + (isDay ? ' พระอาทิตย์ตก' : ' พระอาทิตย์ขึ้น');
  }

  function initLoginPage() {
    var login = document.getElementById('login');
    if (!login) return;
    var mods = window.PERM_MODULES || [];
    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    if (mods.length) {
      setText('lg-n-mod', mods.length);
      setText('lg-n-grp', mods.map(function (m) { return m.g; }).filter(function (g, i, a) { return a.indexOf(g) === i; }).length);
      var chips = mods.filter(function (m) { return m.id !== 'admin'; })
        .map(function (m) { return '<span>' + window.esc(m.label.replace(/^.*› /, '')) + '</span>'; }).join('');
      var mq = document.getElementById('lg-marq');
      if (mq) mq.innerHTML = chips + chips; // 2 ชุดต่อกัน → เลื่อนวนต่อเนื่อง (-50%)
    }
    setText('lg-ver', window.APP_VERSION || '');
    // ปุ่มมีอะไรใหม่: เรืองแสง + ป้าย NEW จนกว่าจะเปิดดูเวอร์ชันนี้บนเครื่องนี้
    var WN_KEY = '_bms_wn_login';
    var wnBtn = document.getElementById('lg-wn');
    var setWnOn = function (on) {
      if (!wnBtn) return;
      wnBtn.classList.toggle('lg-wn-on', on);
      wnBtn.querySelector('.lg-new').hidden = !on;
    };
    try { setWnOn(localStorage.getItem(WN_KEY) !== window.APP_VERSION); } catch (e) {}
    window.openLoginWhatsNew = function () {
      try { localStorage.setItem(WN_KEY, window.APP_VERSION); } catch (e) {}
      setWnOn(false);
      window.showWhatsNew(true);
    };

    // คำทักทาย: 05–11 เช้า · 12–16 บ่าย · 17–04 เย็น · อัปเดตทุกต้นนาที
    (function tick() {
      if (login.style.display !== 'none') {
        var d = new Date(), h = d.getHours();
        if (window.LoginFace) window.LoginFace.render(); // คำทักทาย + ชื่อเจ้าของเครื่อง (login-face.js)
        else setText('lg-greet', 'สวัสดีตอน' + (h >= 5 && h < 12 ? 'เช้า' : h >= 12 && h < 17 ? 'บ่าย' : 'เย็น'));
        updateLoginSky(d);
        setText('lg-time', d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.');
        setText('lg-date', d.toLocaleDateString('th-TH', { weekday: 'long' }) + 'ที่ ' + d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }));
      }
      setTimeout(tick, (60 - new Date().getSeconds()) * 1000);
    })();

    login.addEventListener('pointermove', function (e) {
      login.style.setProperty('--mx', e.clientX + 'px');
      login.style.setProperty('--my', e.clientY + 'px');
    });

    var bg = document.getElementById('login-bg');
    if (bg) new MutationObserver(function () {
      if (login.style.display === 'none') bg.pause(); else bg.play().catch(function () {});
    }).observe(login, { attributes: true, attributeFilter: ['style'] });
  }
  document.addEventListener('DOMContentLoaded', initLoginPage);

  // ── Logout ──
  window.doLogout = function () {
    window.disableWebPush && window.disableWebPush(true);
    window.cu = null;
    window.BmsSession.logout(window.getDb()); // ปิด session ที่ฐานข้อมูลด้วย (token เดิมใช้ต่อไม่ได้)
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
    if (remUser && uEl) uEl.value = remUser;
    window.LoginFace && window.LoginFace.render();
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

  // ── กู้ session หลัง Refresh: ซ่อนหน้าล็อกอินทันที (ไม่ให้วาบ) ถามฐานข้อมูลว่า session ยังใช้ได้ไหม
  // (ยังไม่หมดอายุ + บัญชียังเปิด + ไม่ได้เปลี่ยนรหัส/ออกจากระบบ · session แบบเดิมแลกเป็น token ให้เอง — session.util.js)
  // คู่กับรอข้อมูลผู้ใช้โหลด → เข้าแอปต่อหน้าเดิม · ไม่ผ่าน/โหลดไม่ทัน → ลบ session กลับหน้าล็อกอิน ──
  function _restoreSession() {
    var root = document.documentElement;
    var sess = window.StorageService.getSession();
    if (!sess || !sess.uid) { root.classList.remove('boot-sess'); return; }
    var loginEl = document.getElementById('login');
    if (loginEl) loginEl.style.display = 'none';
    window.showLoader && window.showLoader('กำลังโหลดข้อมูล...');
    var uid = null, checked = false;
    window.BmsSession.resolve(window.getDb()).then(function (id) { uid = id; }, function (e) {
      console.warn('[auth] ตรวจ session ไม่สำเร็จ', e);
    }).then(function () { checked = true; });
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if ((!window.isDbLoaded || !checked) && tries < 300) return; // รอสูงสุด ~30 วินาที
      clearInterval(t);
      var list = window.USERS || [];
      var usr = uid && window.isDbLoaded && list.find(function (x) { return x.id === uid && x.active !== false; });
      // ปิดแท็บ/Refresh ระหว่างบังคับตั้งรหัสใหม่ (รหัสเดาง่าย — _startPwFix) → ไม่ให้เข้า ต้องล็อกอินแล้วเปลี่ยนรหัสก่อน
      if (usr && window.PwPolicy.flagged(usr.id)) { window.BmsSession.logout(window.getDb()); usr = null; }
      if (usr) {
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

  // ── ตรวจ session ทุกชั่วโมงขณะใช้งาน (ต่ออายุให้ด้วย) — ถูกปิดไปแล้ว (Admin ตั้งรหัสใหม่/ปิดบัญชี/เปลี่ยนรหัสจากเครื่องอื่น)
  // → ออกจากระบบ · ติดต่อฐานข้อมูลไม่ได้ = ไม่ทำอะไร (ลองใหม่รอบหน้า) ──
  setInterval(function () {
    if (!window.cu) return;
    window.BmsSession.resolve(window.getDb()).then(function (id) {
      if (window.cu && !id) {
        window.doLogout();
        window.showAlert && window.showAlert('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่', 'warn');
      }
    }, function () {});
  }, 3600 * 1000);

  // ── Initialize: start realtime (รอให้ service ที่โหลดทีหลังพร้อมก่อน) ──
  document.addEventListener('DOMContentLoaded', function () {
    window.RealtimeService && window.RealtimeService.setup();
    window.ImplTrackerService && window.ImplTrackerService.setup();
    window.FormTrackerService && window.FormTrackerService.setup();
  });

})();
