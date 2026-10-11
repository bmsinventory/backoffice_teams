/**
 * login-face.js — ตัวการ์ตูนของผู้ใช้บนหน้า Login (รูปจากคลังรูปแนะนำทีม · staff_figures)
 *  1. ยินดีต้อนรับกลับ: เครื่องที่ติ๊ก "จดจำการเข้าสู่ระบบ" เก็บชื่อ+รูปของเจ้าของเครื่องไว้ (localStorage _bms_face)
 *     ยังไม่มีรูป → ตัวการ์ตูนแทน (defaultFig) ใช้ทั้งบนการ์ด Login และหน้าทักทาย
 *     → ครั้งหน้าตัวการ์ตูนชะโงกออกมาจากหลังขอบซ้ายการ์ด Login + คำทักทายมีชื่อ · "ไม่ใช่คุณ…?" = ล้างทิ้ง
 *     ไม่ติ๊กจดจำ = ไม่เก็บ (ลบของเดิมด้วย) · ไม่ดึงรูป/ชื่อของใครจากฐานข้อมูลก่อน login
 *  2. ท่าทาง: พิมพ์รหัสผ่าน = ยืนตรงหลบหลังการ์ด เหลือครึ่งหน้า "ไม่แอบดูนะ" · รหัสผิด = ส่ายหัว
 *  3. เข้าระบบสำเร็จ = หน้าทักทายตัวการ์ตูนตัวใหญ่ ~1.6 วินาที (กดเพื่อข้าม) ระหว่างแอปโหลดอยู่ด้านหลัง
 *     + AI พูดทักทายตามช่วงเวลา (ปิดได้จากปุ่มลำโพง) · เสียงขอเตรียมไว้ตั้งแต่ตอนพิมพ์รหัสผ่าน
 * เรียกจาก: auth.service.js (react / forget / splash) · app.js setUserAvatar (save) · สไตล์: login.css
 */
(function () {
  var KEY = '_bms_face';
  var _bubbleT = null;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function store(f) { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) {} }
  function el(id) { return document.getElementById(id); }
  function greetBase() { var h = new Date().getHours(); return 'สวัสดีตอน' + (h >= 5 && h < 12 ? 'เช้า' : h >= 12 && h < 17 ? 'บ่าย' : 'เย็น'); }

  // ── AI พูดทักทายบนหน้าทักทาย (src/services/tts.service.js) · ปิด/เปิดจากปุ่มลำโพงบนหน้าทักทาย — จำไว้ในเบราว์เซอร์ ──
  var VOICE_KEY = '_bms_greet_voice';
  function voiceOn() { try { return localStorage.getItem(VOICE_KEY) !== '0'; } catch (e) { return true; } }
  function speechOf(nick) {
    var h = new Date().getHours();
    return [
      { text: greetBase() + 'ค่ะ คุณ' + nick },
      { text: 'ยินดีต้อนรับเข้าสู่ระบบค่ะ' },
      { text: h >= 5 && h < 12 ? 'ขอให้วันนี้เป็นวันที่ดีนะคะ' : h >= 12 && h < 17 ? 'สู้ ๆ กับงานช่วงบ่ายนะคะ' : 'ทำงานมาทั้งวันแล้ว อย่าลืมพักผ่อนด้วยนะคะ' },
    ];
  }

  // ยังไม่มีรูปในคลังรูปแนะนำทีม → ตัวการ์ตูนแทน (SVG สัดส่วน 3:5 เหมือนรูปจริง ยืนเต็มกรอบ) ตัวอักษรแรกของชื่อเล่นบนเสื้อ
  function defaultFig(nick) {
    var ch = window.esc(String(nick || '?').charAt(0).toUpperCase());
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500">'
      + '<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cfc"/><stop offset="1" stop-color="#4cc9f0"/></linearGradient></defs>'
      + '<rect x="104" y="378" width="40" height="100" rx="16" fill="#2b3350"/><rect x="156" y="378" width="40" height="100" rx="16" fill="#2b3350"/>'
      + '<ellipse cx="122" cy="484" rx="30" ry="14" fill="#f4f6fb"/><ellipse cx="178" cy="484" rx="30" ry="14" fill="#f4f6fb"/>'
      + '<rect x="58" y="250" width="40" height="110" rx="20" fill="url(#s)" transform="rotate(14 78 255)"/>'
      + '<rect x="202" y="250" width="40" height="110" rx="20" fill="url(#s)" transform="rotate(-14 222 255)"/>'
      + '<circle cx="62" cy="362" r="19" fill="#f3d2b3"/><circle cx="238" cy="362" r="19" fill="#f3d2b3"/>'
      + '<rect x="82" y="226" width="136" height="168" rx="52" fill="url(#s)"/>'
      + '<text x="150" y="330" text-anchor="middle" font-size="58" font-weight="700" fill="#fff" font-family="Plus Jakarta Sans,IBM Plex Sans Thai,sans-serif">' + ch + '</text>'
      + '<circle cx="150" cy="128" r="104" fill="#f3d2b3"/>'
      + '<path d="M46 124a104 104 0 0 1 208 0c-30-34-70-46-104-46s-74 12-104 46z" fill="#2b2f45"/>'
      + '<ellipse cx="112" cy="140" rx="11" ry="14" fill="#2b2f45"/><ellipse cx="188" cy="140" rx="11" ry="14" fill="#2b2f45"/>'
      + '<circle cx="116" cy="135" r="4" fill="#fff"/><circle cx="192" cy="135" r="4" fill="#fff"/>'
      + '<ellipse cx="92" cy="172" rx="14" ry="8" fill="#ff8a8a" opacity=".45"/><ellipse cx="208" cy="172" rx="14" ry="8" fill="#ff8a8a" opacity=".45"/>'
      + '<path d="M128 176q22 22 44 0" fill="none" stroke="#2b2f45" stroke-width="7" stroke-linecap="round"/>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ตัวการ์ตูนที่ตรงกับชื่อผู้ใช้ในช่อง Login ตอนนี้ (พิมพ์ชื่ออื่น = ไม่แสดง)
  function current() {
    var f = load(), u = ((el('lu') || {}).value || '').trim().toLowerCase();
    return f && f.u && u === String(f.u).toLowerCase() ? f : null;
  }

  function bubble(txt, ms) {
    var b = el('lg-bubble');
    if (!b) return;
    clearTimeout(_bubbleT);
    if (!txt) { b.classList.remove('on'); return; }
    b.textContent = txt;
    b.classList.add('on');
    if (ms) _bubbleT = setTimeout(function () { b.classList.remove('on'); }, ms);
  }

  function setState(cls) {
    var p = el('lg-peek');
    if (!p) return;
    p.classList.remove('is-hide', 'is-shake');
    if (cls) { void p.offsetWidth; p.classList.add(cls); } // reflow → เล่นแอนิเมชันซ้ำได้
  }

  // อัปเดตการ์ด Login ตามชื่อผู้ใช้ในช่อง: คำทักทาย + ตัวการ์ตูน + "ไม่ใช่คุณ…?"
  function render() {
    var f = current(), p = el('lg-peek'), img = el('lg-peek-img'), hint = el('lg-hint');
    var g = el('lg-greet');
    if (g) { g.textContent = greetBase() + (f && f.nick ? ' คุณ' + f.nick : ''); fitGreet(g); }
    if (p) {
      p.classList.toggle('on', !!f);
      var src = f ? (f.url || defaultFig(f.nick || f.name)) : '';
      if (f && img && img.getAttribute('src') !== src) img.src = src;
    }
    if (hint) {
      hint.innerHTML = f
        ? 'ใส่รหัสผ่านเพื่อเข้าใช้งานต่อ · <a href="#" id="lg-notme">ไม่ใช่คุณ' + window.esc(f.nick || f.name || '') + '?</a>'
        : 'เข้าสู่ระบบเพื่อเริ่มงานของทีมวันนี้';
      var a = el('lg-notme');
      if (a) a.onclick = function (e) { e.preventDefault(); notMe(); };
    }
  }

  // คำทักทายบรรทัดเดียวเสมอ (ไม่ให้ชื่อตกบรรทัด) — ยาวเกินที่ว่างข้างท้องฟ้า → ย่อตัวอักษรลงทีละ 1px (ต่ำสุด 16px)
  function fitGreet(g) {
    g.style.fontSize = '';
    if (!g.clientWidth) return; // หน้า Login ซ่อนอยู่
    var fs = parseFloat(getComputedStyle(g).fontSize);
    while (g.scrollWidth > g.clientWidth && fs > 16) { fs--; g.style.fontSize = fs + 'px'; }
  }

  function notMe() {
    window.LoginFace.forget();
    window.StorageService.clearRememberedUser();
    var u = el('lu'), r = el('l-rem');
    if (u) u.value = '';
    if (r) r.checked = false;
    bubble('');
    render();
    if (u) u.focus();
  }

  window.LoginFace = {
    render: render,
    forget: function () { try { localStorage.removeItem(KEY); } catch (e) {} },

    // เก็บชื่อ+รูปของเจ้าของเครื่อง — เฉพาะบัญชีที่ติ๊ก "จดจำ" ไว้ (app.js setUserAvatar เรียกทุกครั้งที่รูปเปลี่ยน)
    save: function (cu, fig) {
      if (!cu || !cu.username || window.StorageService.getRememberedUser() !== cu.username) return;
      var s = window.staffByRef && window.staffByRef(cu.staffId);
      store({ u: cu.username, name: cu.name || '', nick: (s && s.nickname) || cu.name || cu.username, url: fig ? fig.url : '' });
    },

    // ท่าทางบนหน้า Login: 'error' = ส่ายหัว
    react: function (type) {
      if (!current()) return;
      if (type === 'error') { setState('is-shake'); bubble('รหัสผ่านไม่ถูกนะ ลองใหม่อีกที 🤔', 2600); }
    },

    // รูปตัวการ์ตูนของผู้ใช้ (คลังรูปแนะนำทีม → รูปที่จำไว้ในเครื่อง → ตัวการ์ตูนแทน) — หน้าทักทาย / popup ตั้งรหัสใหม่ (auth.service.js)
    figOf: function (usr) {
      var s = window.staffByRef && window.staffByRef(usr.staffId);
      var f = load(), mine = f && f.u === usr.username ? f : null;
      var fig = usr.staffId && (window.STAFF_FIGS || {})[usr.staffId];
      var nick = (s && s.nickname) || usr.name || usr.username || '';
      return { url: fig ? fig.url : mine && mine.url ? mine.url : defaultFig(nick), nick: nick };
    },

    // หน้าทักทายหลังเข้าสู่ระบบสำเร็จ (แอปโหลดอยู่ด้านหลัง) + AI พูดทักทาย
    // มีเสียง = อยู่จนพูดจบ (สูงสุด 7 วิ) · กดเพื่อข้าม = ปิดหน้าทักทาย เสียงพูดต่อจนจบ · ปุ่มลำโพง = ปิด/เปิดเสียง จำไว้ในเบราว์เซอร์
    splash: function (usr) {
      var old = el('lg-splash');
      if (old) old.remove();
      var fg = window.LoginFace.figOf(usr), nick = fg.nick, talk = !!window.TTS && voiceOn();
      var m = document.createElement('div');
      m.id = 'lg-splash';
      m.innerHTML = '<div class="lgs-glow"></div>'
        + (window.TTS ? '<button type="button" class="lgs-voice' + (talk ? '' : ' off') + '" title="' + (talk ? 'ปิดเสียงทักทาย' : 'เปิดเสียงทักทาย') + '">' + (talk ? '🔊' : '🔇') + '</button>' : '')
        + '<div class="lgs-fig"><img src="' + window.esc(fg.url) + '" alt=""></div>'
        + '<div class="lgs-txt"><small>' + greetBase() + '</small><b>คุณ' + window.esc(nick) + '</b><span>กำลังเตรียมพื้นที่ทำงานของคุณ…</span></div>';
      document.body.appendChild(m);
      var t0 = Date.now(), done = !talk;
      var close = function () { if (!m.parentNode || m.classList.contains('out')) return; m.classList.add('out'); setTimeout(function () { m.remove(); }, 450); };
      var closeSoon = function () { done = true; m.classList.remove('talking'); setTimeout(close, Math.max(300, 1700 - (Date.now() - t0))); };
      m.addEventListener('click', close);
      var vb = m.querySelector('.lgs-voice');
      if (vb) vb.addEventListener('click', function (e) {
        e.stopPropagation();
        var on = !voiceOn();
        try { localStorage.setItem(VOICE_KEY, on ? '1' : '0'); } catch (er) {}
        vb.textContent = on ? '🔊' : '🔇';
        vb.title = on ? 'ปิดเสียงทักทาย' : 'เปิดเสียงทักทาย';
        vb.classList.toggle('off', !on);
        if (on) speak(); else { window.TTS.stop(); if (!done) closeSoon(); }
      });
      function speak() {
        done = false;
        m.classList.add('talking');
        window.TTS.play(speechOf(nick), {
          onEnd: closeSoon,
          onError: function (err) { console.warn('[greet] voice:', err && err.message); closeSoon(); },
        });
      }
      if (talk) speak();
      setTimeout(function () { if (done) close(); }, 1700);
      setTimeout(close, 7000);
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
    // รอ app.js ใส่ชื่อผู้ใช้ที่จดจำไว้ลงช่องก่อน (DOMContentLoaded ของ app.js ลงทะเบียนทีหลัง)
    setTimeout(function () {
      var login = el('login'), lu = el('lu'), lp = el('lp');
      if (!login || !lu) return;
      render();
      lu.addEventListener('input', render);
      window.addEventListener('resize', function () { var g = el('lg-greet'); if (g) fitGreet(g); });
      // ช่องรหัสผ่านทุกช่องบนการ์ด (รวมช่องยืนยันรหัสใหม่ #lnp2 — auth.service.js _startPwFix)
      var isPw = function (t) { return t.id === 'lp' || t.id === 'lnp2'; };
      login.addEventListener('focusin', function (e) {
        var f = current();
        if (!isPw(e.target) || !f) return;
        setState('is-hide'); bubble('ไม่แอบดูนะ 🙈');
        // ขอเสียงทักทายเตรียมไว้ระหว่างพิมพ์รหัสผ่าน — เข้าระบบแล้วพูดได้ทันที
        if (e.target.id === 'lp' && window.TTS && voiceOn()) window.TTS.preload(speechOf(f.nick || f.name || f.u));
      });
      login.addEventListener('focusout', function (e) { if (isPw(e.target)) { setState(''); bubble(''); } });
      if (current() && login.style.display !== 'none') {
        bubble('ยินดีต้อนรับกลับ! 👋', 2200);
        // จอที่มีเมาส์ → พร้อมพิมพ์รหัสผ่าน (มือถือไม่โฟกัส ไม่ให้คีย์บอร์ดเด้งบังจอ)
        if (lp && window.matchMedia('(hover: hover)').matches) setTimeout(function () { if (login.style.display !== 'none') lp.focus(); }, 2300);
      }
    }, 0);
  });
})();
