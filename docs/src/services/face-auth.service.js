/**
 * face-auth.service.js — เข้าสู่ระบบด้วยใบหน้า (FaceHub) + ลืมรหัสผ่าน
 * เรียกเฉพาะ /api/face/* ของเว็บนี้ (Backend = facehub.js ใน nginx) — ห้ามเรียก FaceHub ตรงจากหน้าเว็บ
 * · Login: ทำท่าตามที่สุ่ม (กระพริบตา / ยิ้ม / หันหน้า) เพื่อยืนยันว่าเป็นคนจริง แล้วถ่ายหน้าตรงส่งไปสแกน
 * · ลงทะเบียน: ผู้ใช้ทำเองจากเมนูชื่อผู้ใช้ — ยืนยันรหัสผ่าน แล้วถ่ายอัตโนมัติ 3 มุม (ตรง / ซ้าย / ขวา)
 * ตรวจท่าทางด้วย MediaPipe Face Landmarker ในเบราว์เซอร์ (โหลดเมื่อเปิดกล้องครั้งแรกเท่านั้น)
 */
(function () {

  var API = '/api/face/';
  var MP_VER = '0.10.21';
  var MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  var TH = { eyeClose: 0.5, eyeOpen: 0.3, smile: 0.45, yaw: 15, frontYaw: 8, frontPitch: 12 };
  var HOLD = 8;          // จำนวนเฟรมที่ต้องนิ่งอยู่ในท่าก่อนถ่ายอัตโนมัติ
  var STILL = 1.5;       // ขยับหัวได้ไม่เกินกี่องศาต่อเฟรมถึงนับว่านิ่ง (กันภาพเบลอ)
  var TIMEOUT_MS = 45000;
  var CHALLENGE = {
    blink: { text: '😉 กระพริบตา', label: 'กระพริบ' },
    smile: { text: '😊 ยิ้ม', label: 'ยิ้ม' },
    left:  { text: '⬅️ หันหน้าไปทางซ้าย', label: 'หันซ้าย' },
    right: { text: '➡️ หันหน้าไปทางขวา', label: 'หันขวา' },
  };
  var POSES = [
    { text: '🙂 มองตรงเข้ากล้อง', label: 'ตรง', ok: function (y, p) { return Math.abs(y) < TH.frontYaw && Math.abs(p) < TH.frontPitch; } },
    { text: '⬅️ หันหน้าไปทางซ้ายเล็กน้อย', label: 'ซ้าย', ok: function (y) { return y >= TH.yaw; } },
    { text: '➡️ หันหน้าไปทางขวาเล็กน้อย', label: 'ขวา', ok: function (y) { return y <= -TH.yaw; } },
  ];

  // gen = รุ่นของหน้าต่างกล้อง (เพิ่มทุกครั้งที่เปิด/ปิด) — งานที่ค้างรอโหลด/รอ API จากหน้าต่างที่ปิดไปแล้ว
  // ต้องหยุดเอง ไม่เขียนทับหน้าต่างใหม่ (ตรวจด้วย alive(gen) หลัง await ทุกจุด)
  var S = { landmarker: null, stream: null, raf: 0, timer: 0, run: null, gen: 0 };
  var STALE = {};
  function alive(gen) { return gen === S.gen && !!$('face-modal'); }
  var esc = function (s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); };
  var $ = function (id) { return document.getElementById(id); };

  async function api(path, body) {
    var res = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || 'ระบบใบหน้าไม่ตอบกลับ (' + res.status + ')');
    return data || {};
  }

  // ── เปิดใช้งานเมื่อเซิร์ฟเวอร์ตั้งค่า FaceHub แล้ว (ทดสอบในเครื่องที่ไม่มี Backend → ปุ่มไม่แสดง) ──
  // FACE_DEMO = เซิร์ฟเวอร์ใช้คีย์ทดลองของ FaceHub → Role admin ใช้ใบหน้าไม่ได้ (เซิร์ฟเวอร์บังคับเอง หน้าเว็บแค่ซ่อนเมนู)
  window.FACE_LOGIN = false;
  window.FACE_DEMO = false;
  async function checkEnabled() {
    try { var c = await api('config'); window.FACE_LOGIN = !!c.enabled; window.FACE_DEMO = !!c.demo; } catch (e) { window.FACE_LOGIN = false; }
    var btn = $('face-login-btn');
    if (btn) btn.style.display = window.FACE_LOGIN ? '' : 'none';
  }
  document.addEventListener('DOMContentLoaded', checkEnabled);

  // ── หน้าต่างกล้อง ──
  function openModal(title) {
    closeModal();
    S.gen++;
    var m = document.createElement('div');
    m.id = 'face-modal';
    m.innerHTML = '<div class="face-box" role="dialog" aria-modal="true" aria-labelledby="face-title">'
      + '<div class="face-head"><b id="face-title">' + esc(title) + '</b><button type="button" class="face-x" aria-label="ปิด">✕</button></div>'
      + '<div id="face-body"></div></div>';
    document.body.appendChild(m);
    m.querySelector('.face-x').onclick = closeModal;
    return $('face-body');
  }
  function closeModal() {
    S.gen++;
    stopCamera();
    var m = $('face-modal');
    if (m) m.remove();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('face-modal')) closeModal(); });

  function camHtml() {
    return '<div class="face-cam"><video id="face-video" playsinline muted></video><div class="face-oval"></div></div>'
      + '<div class="face-instr" id="face-instr">กำลังเปิดกล้อง...</div>'
      + '<div class="face-steps" id="face-steps"></div>'
      + '<div class="face-msg" id="face-msg"></div>'
      + '<div class="face-foot" id="face-foot"></div>';
  }
  function setInstr(t) { var el = $('face-instr'); if (el) el.textContent = t; }
  function setMsg(t, kind) { var el = $('face-msg'); if (el) { el.textContent = t || ''; el.className = 'face-msg' + (kind ? ' ' + kind : ''); } }
  function setFoot(html) { var el = $('face-foot'); if (el) el.innerHTML = html; }
  function setSteps(labels, idx) {
    var el = $('face-steps');
    if (el) el.innerHTML = labels.map(function (l, i) {
      return '<span class="' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '">' + (i < idx ? '✓ ' : '') + esc(l) + '</span>';
    }).join('');
  }

  async function loadLandmarker() {
    if (S.landmarker) return S.landmarker;
    var vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER + '/vision_bundle.mjs');
    var files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER + '/wasm');
    S.landmarker = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MP_MODEL },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    });
    return S.landmarker;
  }
  function camError(e) {
    if (!window.isSecureContext) return 'กล้องใช้ได้เฉพาะเว็บที่เป็น https';
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กดอนุญาตกล้องในเบราว์เซอร์แล้วลองใหม่';
    if (n === 'NotFoundError') return 'ไม่พบกล้องบนเครื่องนี้';
    if (n === 'NotReadableError') return 'กล้องถูกโปรแกรมอื่นใช้อยู่ ปิดโปรแกรมนั้นแล้วลองใหม่';
    return 'เปิดกล้องไม่ได้: ' + ((e && e.message) || n || '');
  }
  async function startCamera(gen) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(camError({}));
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false }); }
    catch (e) { throw new Error(camError(e)); }
    // หน้าต่างถูกปิดระหว่างรออนุญาตกล้อง → ปิดกล้องของตัวเอง ไม่แตะกล้องของหน้าต่างใหม่
    if (!alive(gen)) { stream.getTracks().forEach(function (t) { t.stop(); }); throw STALE; }
    S.stream = stream;
    var v = $('face-video');
    v.srcObject = stream;
    try { await v.play(); } catch (e) {}
    return v;
  }
  function stopCamera() {
    if (S.raf) cancelAnimationFrame(S.raf);
    clearTimeout(S.timer);
    S.raf = 0; S.run = null;
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
  }
  // ถ่ายเฟรมจริงจากกล้อง (ไม่กลับด้าน) ย่อด้านยาวไม่เกิน 640px → base64 JPEG
  function capture(v) {
    var k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }
  function angles(res) {
    var m = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
    if (!m) return { yaw: 0, pitch: 0 };
    var d = m.data;
    return { yaw: Math.asin(Math.max(-1, Math.min(1, d[8]))) * 180 / Math.PI, pitch: Math.atan2(-d[9], d[10]) * 180 / Math.PI };
  }

  // วนอ่านเฟรม → step(f) คืน true เมื่อจบ · f = { face, yaw, pitch, eyeL, eyeR, smile, still }
  function runLoop(v, step) {
    var last = { yaw: 999, pitch: 999 }, token = {};
    S.run = token;
    S.timer = setTimeout(function () {
      if (S.run !== token) return;
      stopCamera();
      setInstr('หมดเวลา');
      setMsg('ทำท่าไม่ทันเวลา ลองใหม่อีกครั้ง', 'err');
      setFoot('<button type="button" class="btn btn-pri" data-face="retry">ลองใหม่</button>');
    }, TIMEOUT_MS);
    var loop = function () {
      if (S.run !== token) return;
      if (v.readyState >= 2 && v.videoWidth) {
        var res = null;
        try { res = S.landmarker.detectForVideo(v, performance.now()); } catch (e) {}
        if (res) {
          var f = { face: !!(res.faceLandmarks && res.faceLandmarks.length) };
          if (f.face) {
            var map = {};
            ((res.faceBlendshapes && res.faceBlendshapes[0]) ? res.faceBlendshapes[0].categories : []).forEach(function (c) { map[c.categoryName] = c.score; });
            var a = angles(res);
            f.yaw = a.yaw; f.pitch = a.pitch;
            f.eyeL = map.eyeBlinkLeft || 0; f.eyeR = map.eyeBlinkRight || 0;
            f.smile = Math.max(map.mouthSmileLeft || 0, map.mouthSmileRight || 0);
            f.still = Math.abs(a.yaw - last.yaw) + Math.abs(a.pitch - last.pitch) < STILL;
            last = a;
          }
          if (step(f)) { clearTimeout(S.timer); S.run = null; return; }
        }
      }
      S.raf = requestAnimationFrame(loop);
    };
    S.raf = requestAnimationFrame(loop);
  }

  // คืน video ที่พร้อมใช้ · null = ใช้กล้องไม่ได้ (แสดงสาเหตุแล้ว) · STALE = หน้าต่างถูกปิด/เปิดใหม่ไปแล้ว (ห้ามแตะ UI)
  async function prepareCamera(body) {
    var gen = S.gen;
    body.innerHTML = camHtml();
    setInstr('กำลังเตรียมกล้อง...');
    try {
      var lm = loadLandmarker(), v = await startCamera(gen);
      setInstr('กำลังโหลดตัวตรวจใบหน้า...');
      await lm;
      if (!alive(gen)) return STALE;
      return v;
    } catch (e) {
      if (e === STALE || !alive(gen)) return STALE;
      stopCamera();
      setInstr('ใช้กล้องไม่ได้');
      setMsg(String(e.message || e), 'err');
      return null;
    }
  }

  // ════════════ ยืนยันตัวตนด้วยใบหน้า (ใช้ทั้งเข้าสู่ระบบ และลืมรหัสผ่าน) ════════════
  // ทำท่าตามที่สุ่มให้ครบ แล้วถ่ายหน้าตรง → onImage(base64) · ปุ่ม "ลองใหม่" เปิด opener เดิมซ้ำ
  async function livenessCapture(title, opener, onImage) {
    var body = openModal(title);
    body.onclick = function (e) {
      var a = e.target.closest('[data-face]');
      if (!a) return;
      if (a.getAttribute('data-face') === 'retry') opener();
      else closeModal();
    };
    var v = await prepareCamera(body);
    if (v === STALE) return;
    if (!v) { setFoot('<button type="button" class="btn btn-ghost" data-face="close">ใช้รหัสผ่านแทน</button>'); return; }

    // สุ่มลำดับท่า: กระพริบตา + ยิ้ม + หันซ้ายหรือขวา แล้วจบด้วยถ่ายหน้าตรง
    var seq = ['blink', 'smile', Math.random() < 0.5 ? 'left' : 'right'].sort(function () { return Math.random() - 0.5; });
    var labels = seq.map(function (k) { return CHALLENGE[k].label; }).concat(['หน้าตรง']);
    var idx = 0, blinkPhase = 0, hold = 0;
    setSteps(labels, 0);
    setInstr(CHALLENGE[seq[0]].text);
    setFoot('<button type="button" class="btn btn-ghost" data-face="close">ยกเลิก</button>');

    runLoop(v, function (f) {
      if (!f.face) { setMsg('ไม่พบใบหน้า — จัดหน้าให้อยู่ในกรอบ'); hold = 0; return false; }
      setMsg('');
      if (idx < seq.length) {
        var act = seq[idx], pass = false;
        if (act === 'blink') {
          if (!blinkPhase) { if (f.eyeL > TH.eyeClose && f.eyeR > TH.eyeClose) blinkPhase = 1; }
          else if (f.eyeL < TH.eyeOpen && f.eyeR < TH.eyeOpen) pass = true;
        } else if (act === 'smile') pass = f.smile > TH.smile;
        else if (act === 'left') pass = f.yaw >= TH.yaw;
        else if (act === 'right') pass = f.yaw <= -TH.yaw;
        if (pass) {
          idx++; blinkPhase = 0; hold = 0;
          setSteps(labels, idx);
          setInstr(idx < seq.length ? CHALLENGE[seq[idx]].text : '🙂 มองตรงเข้ากล้อง แล้วนิ่งไว้');
        }
        return false;
      }
      // ผ่านทุกท่าแล้ว → ถ่ายหน้าตรง ตาเปิด นิ่ง ส่งไปสแกน
      var front = Math.abs(f.yaw) < TH.frontYaw && Math.abs(f.pitch) < TH.frontPitch && f.eyeL < 0.4 && f.eyeR < 0.4;
      hold = front && f.still ? hold + 1 : 0;
      setInstr(front && !f.still ? '🙂 นิ่งไว้สักครู่' : '🙂 มองตรงเข้ากล้อง แล้วนิ่งไว้');
      if (hold < HOLD) return false;
      var img = capture(v);
      stopCamera();
      setSteps(labels, labels.length);
      onImage(img);
      return true;
    });
  }

  // ════════════ เข้าสู่ระบบด้วยใบหน้า ════════════
  window.openFaceLogin = function () { livenessCapture('🙂 เข้าสู่ระบบด้วยใบหน้า', window.openFaceLogin, matchAndLogin); };

  async function matchAndLogin(img) {
    var gen = S.gen;
    setInstr('⏳ กำลังตรวจสอบใบหน้า...');
    setFoot('');
    var retry = '<button type="button" class="btn btn-ghost" data-face="close">ใช้รหัสผ่านแทน</button>'
      + '<button type="button" class="btn btn-pri" data-face="retry">ลองใหม่</button>';
    try {
      var r = await api('match', { image: img });
      if (!alive(gen)) return; // ปิดหน้าต่างระหว่างรอผล → ไม่เข้าระบบ
      if (!r.matched) {
        setInstr('ไม่พบใบหน้านี้ในระบบ');
        setMsg('ถ้ายังไม่เคยลงทะเบียนใบหน้า ให้เข้าสู่ระบบด้วยรหัสผ่าน แล้วกดชื่อผู้ใช้ → ลงทะเบียนใบหน้า', 'err');
        setFoot(retry);
        return;
      }
      var err = await window.loginWithUserId(r.user_id);
      if (!alive(gen)) return;
      if (err) { setInstr('เข้าสู่ระบบไม่ได้'); setMsg(err, 'err'); setFoot(retry); return; }
      closeModal();
    } catch (e) {
      if (!alive(gen)) return;
      setInstr('ตรวจสอบใบหน้าไม่สำเร็จ');
      setMsg(String(e.message || e), 'err');
      setFoot(retry);
    }
  }

  // ════════════ ลืมรหัสผ่าน ════════════
  // ลงทะเบียนใบหน้าไว้ → สแกนหน้าแล้วตั้งรหัสใหม่เองทันที (เซิร์ฟเวอร์เลือกบัญชีจากใบหน้า)
  // ไม่มีใบหน้า → กรอก Username ส่งคำขอถึง Admin (users.pw_reset_requested_at → กระดิ่งของ Admin)
  window.openForgotPassword = function () {
    var body = openModal('🔑 ลืมรหัสผ่าน');
    var uEl = $('lu');
    body.innerHTML = (window.FACE_LOGIN
        ? '<div class="face-opt"><b>🙂 ลงทะเบียนใบหน้าไว้แล้ว</b><p class="face-p">สแกนใบหน้ายืนยันตัวตน แล้วตั้งรหัสผ่านใหม่ได้ทันที</p>'
          + '<button type="button" class="btn btn-pri" id="fp-face">ยืนยันตัวตนด้วยใบหน้า</button></div>'
        : '')
      + '<div class="face-opt"><b>📨 ส่งคำขอถึง Admin</b><p class="face-p">กรอกชื่อผู้ใช้ Admin จะเห็นคำขอที่กระดิ่งแจ้งเตือน แล้วตั้งรหัสผ่านใหม่ให้</p>'
      + '<label class="f-label" for="fp-user">Username</label>'
      + '<input class="f-input" id="fp-user" autocomplete="username" value="' + esc(uEl ? uEl.value.trim() : '') + '">'
      + '<div class="face-msg" id="face-msg"></div>'
      + '<div class="face-foot"><button type="button" class="btn btn-ghost" id="fp-send">ส่งคำขอ</button></div></div>';
    if ($('fp-face')) $('fp-face').onclick = faceReset;
    $('fp-user').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('fp-send').click(); });
    $('fp-send').onclick = async function () {
      var name = ($('fp-user').value || '').trim();
      if (!name) { setMsg('กรอกชื่อผู้ใช้ก่อน', 'err'); return; }
      this.disabled = true;
      var gen = S.gen;
      try {
        await requestReset(name);
        if (!alive(gen)) return;
        // ตอบเหมือนกันทุกกรณี — ไม่บอกว่ามีชื่อผู้ใช้นี้ในระบบหรือไม่
        setMsg('ส่งคำขอแล้ว ถ้ามีบัญชีนี้ในระบบ Admin จะตั้งรหัสผ่านใหม่ให้ แล้วแจ้งกลับ', 'ok');
      } catch (e) {
        // ส่วนใหญ่ = ยังไม่ได้รัน SQL เพิ่มคอลัมน์ users.pw_reset_requested_at (ดู db-schema.sql)
        console.warn('[forgot-password] บันทึกคำขอไม่สำเร็จ:', (e && (e.message || e.details)) || e);
        if (!alive(gen)) return;
        setMsg('ส่งคำขอไม่สำเร็จ กรุณาติดต่อ Admin โดยตรง', 'err');
        this.disabled = false;
      }
    };
  };
  async function requestReset(name) {
    for (var i = 0; i < 30 && !window.isDbLoaded; i++) await new Promise(function (r) { setTimeout(r, 500); });
    var u = (window.USERS || []).find(function (x) { return x.username === name && x.active !== false; });
    if (!u) return;
    await window.updateDoc(window.getDocRef('USERS', u.id), { pw_reset_requested_at: new Date().toISOString() });
  }

  function faceReset() {
    livenessCapture('🔑 ยืนยันตัวตนด้วยใบหน้า', faceReset, function (img) {
      setInstr('ตั้งรหัสผ่านใหม่');
      setMsg('');
      var cam = document.querySelector('#face-body .face-cam');
      if (cam) cam.remove();
      $('face-steps').insertAdjacentHTML('afterend',
        '<div class="face-fields" id="fp-fields"><label class="f-label" for="fp-new">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label><input class="f-input" id="fp-new" type="password" autocomplete="new-password">'
        + '<label class="f-label" for="fp-new2">ยืนยันรหัสผ่านใหม่</label><input class="f-input" id="fp-new2" type="password" autocomplete="new-password"></div>');
      setFoot('<button type="button" class="btn btn-ghost" data-face="close">ยกเลิก</button><button type="button" class="btn btn-pri" id="fp-save">บันทึกรหัสผ่านใหม่</button>');
      setTimeout(function () { var p = $('fp-new'); if (p) p.focus(); }, 50);
      $('fp-save').onclick = async function () {
        var a = $('fp-new').value, b = $('fp-new2').value;
        if (a.length < 4) { setMsg('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร', 'err'); return; }
        if (a !== b) { setMsg('รหัสผ่านใหม่ไม่ตรงกัน', 'err'); return; }
        this.disabled = true;
        setMsg('⏳ กำลังบันทึก...');
        var gen = S.gen;
        try {
          var r = await api('reset', { image: img, password: a });
          if (!alive(gen)) return;
          $('fp-fields').remove();
          setInstr('✅ ตั้งรหัสผ่านใหม่เรียบร้อย');
          setMsg('เข้าสู่ระบบด้วยชื่อผู้ใช้ ' + r.username + ' และรหัสผ่านใหม่ได้เลย', 'ok');
          setFoot('<button type="button" class="btn btn-pri" data-face="close">เข้าสู่ระบบ</button>');
          var uEl = $('lu'), pEl = $('lp');
          if (uEl) uEl.value = r.username;
          if (pEl) pEl.value = '';
        } catch (e) {
          if (!alive(gen)) return;
          setMsg(String(e.message || e), 'err');
          setFoot('<button type="button" class="btn btn-ghost" data-face="close">ปิด</button><button type="button" class="btn btn-pri" data-face="retry">สแกนใหม่</button>');
        }
      };
    });
  }

  // ════════════ ลงทะเบียนใบหน้า (ผู้ใช้ทำเองจากเมนูชื่อผู้ใช้) ════════════
  window.openFaceEnroll = async function () {
    var cu = window.cu;
    if (!cu) return;
    var body = openModal('🙂 ลงทะเบียนใบหน้า');
    body.innerHTML = '<p class="face-p">ลงทะเบียนใบหน้าของ <b>' + esc(cu.name || cu.username) + '</b> เพื่อเข้าสู่ระบบด้วยใบหน้าครั้งต่อไป · ระบบจะถ่ายอัตโนมัติ 3 มุม (ตรง / ซ้าย / ขวา)</p>'
      + '<div class="face-status" id="face-status">กำลังตรวจสอบ...</div>'
      + '<label class="f-label" for="face-pw">ยืนยันรหัสผ่าน</label>'
      + '<input class="f-input" id="face-pw" type="password" autocomplete="current-password">'
      + '<div class="face-msg" id="face-msg"></div>'
      + '<div class="face-foot" id="face-foot"><button type="button" class="btn btn-ghost" id="face-remove" style="display:none">ลบใบหน้าที่ลงทะเบียนไว้</button>'
      + '<button type="button" class="btn btn-pri" id="face-start">เริ่มถ่ายใบหน้า</button></div>';
    setTimeout(function () { var p = $('face-pw'); if (p) p.focus(); }, 50);

    var gen = S.gen;
    api('status', { user_id: cu.id }).then(function (r) {
      var st = $('face-status'); if (!st || !alive(gen)) return;
      st.textContent = r.registered ? '✓ ลงทะเบียนใบหน้าไว้แล้ว — ถ่ายใหม่จะแทนที่ของเดิม' : 'ยังไม่ได้ลงทะเบียนใบหน้า';
      st.className = 'face-status' + (r.registered ? ' ok' : '');
      if (r.registered && $('face-remove')) $('face-remove').style.display = '';
    }).catch(function (e) { var st = $('face-status'); if (st && alive(gen)) st.textContent = String(e.message || e); });

    var pwOk = function () {
      var pw = ($('face-pw') || {}).value || '';
      if (!pw) { setMsg('กรอกรหัสผ่านก่อน', 'err'); return null; }
      if (pw !== cu.password) { setMsg('รหัสผ่านไม่ถูกต้อง', 'err'); return null; }
      return pw;
    };
    $('face-pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('face-start').click(); });
    $('face-start').onclick = function () { var pw = pwOk(); if (pw) enrollCapture(body, cu, pw); };
    $('face-remove').onclick = async function () {
      var pw = pwOk(); if (!pw) return;
      this.disabled = true;
      try {
        await api('remove', { username: cu.username, password: pw });
        if (!alive(gen)) return;
        $('face-status').textContent = 'ลบใบหน้าออกจากระบบแล้ว';
        $('face-status').className = 'face-status';
        this.style.display = 'none';
        setMsg('');
      } catch (e) { if (alive(gen)) { setMsg(String(e.message || e), 'err'); this.disabled = false; } }
    };
  };

  async function enrollCapture(body, cu, pw) {
    body.onclick = function (e) {
      var a = e.target.closest('[data-face]');
      if (!a) return;
      if (a.getAttribute('data-face') === 'retry') enrollCapture(body, cu, pw);
      else closeModal();
    };
    var v = await prepareCamera(body);
    if (v === STALE) return;
    if (!v) { setFoot('<button type="button" class="btn btn-ghost" data-face="close">ปิด</button>'); return; }
    var labels = POSES.map(function (p) { return p.label; }), idx = 0, hold = 0, shots = [];
    setSteps(labels, 0);
    setInstr(POSES[0].text);
    setFoot('<button type="button" class="btn btn-ghost" data-face="close">ยกเลิก</button>');
    runLoop(v, function (f) {
      if (!f.face) { setMsg('ไม่พบใบหน้า — จัดหน้าให้อยู่ในกรอบ'); hold = 0; return false; }
      setMsg('');
      var pose = POSES[idx];
      var inPose = pose.ok(f.yaw, f.pitch) && f.eyeL < 0.4 && f.eyeR < 0.4;
      hold = inPose && f.still ? hold + 1 : 0;
      setInstr(pose.text + (inPose && !f.still ? ' · นิ่งไว้สักครู่' : ''));
      if (hold < HOLD) return false;
      shots.push(capture(v));
      idx++; hold = 0;
      setSteps(labels, idx);
      if (idx < POSES.length) { setInstr(POSES[idx].text); return false; }
      stopCamera();
      submitEnroll(cu, pw, shots);
      return true;
    });
  }

  async function submitEnroll(cu, pw, shots) {
    var gen = S.gen;
    setInstr('⏳ กำลังลงทะเบียนใบหน้า...');
    setFoot('');
    try {
      await api('register', { username: cu.username, password: pw, images: shots });
      if (!alive(gen)) return;
      setInstr('✅ ลงทะเบียนใบหน้าเรียบร้อย');
      setMsg('ครั้งต่อไปกด "เข้าสู่ระบบด้วยใบหน้า" ที่หน้า Login ได้เลย', 'ok');
      setFoot('<button type="button" class="btn btn-pri" data-face="close">เสร็จสิ้น</button>');
    } catch (e) {
      if (!alive(gen)) return;
      setInstr('ลงทะเบียนไม่สำเร็จ');
      setMsg(String(e.message || e), 'err');
      setFoot('<button type="button" class="btn btn-ghost" data-face="close">ปิด</button><button type="button" class="btn btn-pri" data-face="retry">ถ่ายใหม่</button>');
    }
  }

})();
