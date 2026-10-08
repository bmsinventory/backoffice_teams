/* แบบทดสอบหลังอบรม (ผู้เข้าอบรม ไม่ต้อง Login) — หน้าตาอยู่ใน <template id="trn-page-quiz"> ของ training/index.html
     ?page=quiz&site=รหัสโครงการ[&cat=หลักสูตรอบรม]  → เลือกแบบทดสอบ (ชุดจากคลังกลางที่หลักสูตรอบรมเลือก) → ยืนยันตัวตน → สอบ → ผล (ผ่าน = ส่งใบประกาศทางอีเมล)
     ?page=quiz&cert=เลขที่ใบประกาศ                  → ดู/ตรวจสอบ/ดาวน์โหลดใบประกาศ (ลิงก์ในอีเมล + QR บนใบ)
   ข้อสอบไม่มีเฉลยมาที่หน้าเว็บ — เริ่ม/ส่งผ่าน trn_quiz_start / trn_quiz_submit (ตรวจคะแนนในฐานข้อมูล · db-training.sql)
   ใบประกาศ/อีเมล = src/utils/trn-cert.util.js (ใช้ร่วมกับหน้าผู้ดูแล src/modules/training-quiz.js) */
const _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const _qs = new URLSearchParams(location.search);
const SITE = _qs.get('site') || '';
const EMAIL_KEY = 'tq_email';
const CH = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'];

let _quizzes = [], _quiz = null, _project = '', _regs = null, _who = null, _att = null, _ans = [], _timer = null, _deadline = 0, _sending = false;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const errMsg = e => (e && (e.message || e.details)) || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
function show(id) { document.querySelectorAll('.tq-screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
function toast(msg, type) {
  const t = $('tq-toast'); t.textContent = msg; t.className = 'tq-toast show ' + (type || '');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500);
}
function fail(title, sub) { $('tq-msg').innerHTML = `<div class="tq-empty"><i class="ti ti-mood-sad"></i><b>${esc(title)}</b><span>${esc(sub || '')}</span></div>`; show('sc-msg'); }
const remembered = () => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } };

/* ══ เสียงประกอบ — สังเคราะห์ด้วย Web Audio (ไม่มีไฟล์เสียง) · ปุ่มลำโพงบนแถบหัว เปิด/ปิด (จำไว้ในเครื่อง) ══ */
const Sfx = (() => {
  let ctx = null, on = true;
  try { on = localStorage.getItem('tq_sound') !== '0'; } catch (e) {}
  const ac = () => {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    return ctx;
  };
  const unlock = () => {
    if (!on) return Promise.resolve(false);
    const c = ac();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    return c.resume().then(() => c.state === 'running').catch(() => false);
  };
  // โน้ตเดียว: hz เริ่มหลัง at วินาที ยาว dur · to = เลื่อนความถี่ไปถึง
  function note(hz, at = 0, dur = .15, type = 'sine', vol = .15, to) {
    const c = ac(); if (!c) return;
    const schedule = () => {
      if (c.state !== 'running') return;
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(hz, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
    };
    if (c.state === 'running') schedule();
    else unlock().then(ok => { if (ok) schedule(); });
  }
  const play = f => { if (on) try { f(); } catch (e) {} };
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // แต่ละตัวเลือกเสียงต่างกัน (บันไดเสียงเพนทาโทนิก)
  return {
    get on() { return on; },
    set(v) { on = v; try { localStorage.setItem('tq_sound', v ? '1' : '0'); } catch (e) {} },
    unlock,
    pick: j => play(() => { note(SCALE[j % 6], 0, .09, 'triangle', .14); note(SCALE[j % 6] * 2, .05, .14, 'sine', .06); }),
    start: () => play(() => [392, 523.25, 659.25, 783.99].forEach((h, i) => note(h, i * .07, .2, 'triangle', .12))),
    milestone: () => play(() => { note(783.99, 0, .12, 'triangle', .12); note(1046.5, .1, .25, 'triangle', .12); }),
    complete: () => play(() => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((h, i) => note(h, i * .08, .35, 'triangle', .11))),
    whoosh: () => play(() => note(200, 0, .35, 'sawtooth', .035, 900)),
    tick: () => play(() => note(1250, 0, .04, 'square', .045)),
    count: () => play(() => { note(660, 0, .14, 'triangle', .13); note(1320, .02, .1, 'sine', .04); }),
    pop: () => play(() => { note(110 + Math.random() * 80, 0, .3, 'triangle', .07, 45); note(1800 + Math.random() * 600, .05, .25, 'sine', .015, 900); }),
    warn: () => play(() => { note(330, 0, .14, 'square', .05); note(262, .16, .22, 'square', .05); }),
    pass: () => play(() => {
      [523.25, 659.25, 783.99].forEach((h, i) => note(h, i * .12, .22, 'triangle', .13));
      [523.25, 659.25, 783.99, 1046.5].forEach(h => note(h, .42, 1.1, 'triangle', .08)); note(1568, .42, 1.1, 'sine', .05);
    }),
    fail: () => play(() => [392, 329.63, 261.63].forEach((h, i) => note(h, i * .22, i === 2 ? .55 : .25, 'triangle', .1))),
  };
})();
// Production browsers (especially iOS/Safari) allow Web Audio only after a real
// user gesture. Unlock early so delayed sounds such as countdown/result can play.
document.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true, passive: true });
document.addEventListener('keydown', () => Sfx.unlock(), { capture: true });
function toggleSound() { Sfx.set(!Sfx.on); soundIcon(); Sfx.pick(2); }
function soundIcon() {
  const b = $('tq-sound');
  b.innerHTML = `<i class="ti ti-volume${Sfx.on ? '' : '-off'}"></i>`;
  b.classList.toggle('off', !Sfx.on); b.title = Sfx.on ? 'ปิดเสียง' : 'เปิดเสียง';
}
soundIcon();

/* ══ เอฟเฟกต์ — คลื่นตอนกด · ประกายตอนเลือกคำตอบ · ป้ายฉลองกลางจอ ══ */
const CC = ['#7c5cfc', '#4361ee', '#f59e0b', '#ec4899', '#06b6a4', '#ef4444']; // สีตัวเลือก ก–ฉ (ตรงกับ CSS .tq-choice.c0–c5)
document.addEventListener('pointerdown', e => {
  const c = e.target.closest('.tq-choice, .tq-btn, .tq-quiz');
  if (!c || c.disabled) return;
  const r = c.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
  s.className = 'tq-ripple';
  Object.assign(s.style, { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' });
  c.appendChild(s); setTimeout(() => s.remove(), 650);
});
function burst(el, color) {
  const r = el.getBoundingClientRect(), box = document.createElement('div');
  box.className = 'tq-burst';
  box.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`;
  box.innerHTML = Array.from({ length: 14 }, (x, k) => {
    const a = k / 14 * Math.PI * 2 + Math.random() * .4, d = 26 + Math.random() * 30;
    return `<i style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${k % 3 ? color : '#fbbf24'}"></i>`;
  }).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 700);
}
function cheer(icon, text) {
  document.querySelector('.tq-cheer')?.remove();
  const el = document.createElement('div');
  el.className = 'tq-cheer'; el.innerHTML = `<i class="ti ti-${icon}"></i>${text}`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1900);
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

/* ══ ฉากใหญ่ — นับถอยหลังก่อนเริ่ม · สอบผ่าน = พลุ + ปืนพลุกระดาษ (วาดบน canvas) · ยังไม่ผ่าน = สติกเกอร์ปลอบใจ ══ */
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const Fx = (() => {
  const COL = ['#fbbf24', '#fde68a', '#f72585', '#4cc9f0', '#7c5cfc', '#06d6a0', '#ff8fab', '#ffffff'];
  const rnd = (a, b) => a + Math.random() * (b - a), any = a => a[Math.random() * a.length | 0];
  let cv = null, g = null, ps = [], until = 0;
  function size() {
    const k = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * k; cv.height = innerHeight * k; g.setTransform(k, 0, 0, k, 0, 0);
  }
  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.className = 'tq-fx-canvas'; g = cv.getContext('2d');
    document.body.appendChild(cv); size(); addEventListener('resize', size);
    requestAnimationFrame(loop);
  }
  function loop() {
    g.clearRect(0, 0, innerWidth, innerHeight);
    ps = ps.filter(step);
    if (ps.length || Date.now() < until) requestAnimationFrame(loop);
    else { removeEventListener('resize', size); cv.remove(); cv = null; }
  }
  function step(p) {
    p.life--;
    if (p.k === 'rocket') { // พุ่งขึ้นพร้อมหางประกาย → ถึงยอด (ความเร็วใกล้ 0) แล้วระเบิด
      p.x += p.vx; p.y += p.vy; p.vy += .12;
      g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(p.x, p.y, 2.6, 0, 7); g.fill();
      ps.push({ k: 'spark', x: p.x, y: p.y, vx: rnd(-.5, .5), vy: rnd(.3, 1), c: '#fde68a', life: 16, max: 16, s: 1.5, gr: .02 });
      if (p.vy < -1) return true;
      explode(p.x, p.y, p.c); return false;
    }
    if (p.k === 'spark') {
      p.vx *= .965; p.vy = p.vy * .965 + p.gr; p.x += p.vx; p.y += p.vy;
      g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); g.globalAlpha = 1;
      return p.life > 0;
    }
    // พลุกระดาษ: แผ่นสี่เหลี่ยมหมุน พลิก และส่ายตามลม
    p.vx *= .985; p.vy = Math.min(p.vy + .2, 4.5); p.t += .08;
    p.x += p.vx + Math.sin(p.t) * .9; p.y += p.vy; p.r += p.vr;
    g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.t * 2)); g.fillStyle = p.c;
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    return p.life > 0 && p.y < innerHeight + 40;
  }
  function explode(x, y, c) {
    ensure(); Sfx.pop();
    const n = 64, c2 = any(COL);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, v = rnd(2.2, 6.4), l = rnd(45, 80) | 0;
      ps.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: k % 3 ? c : c2, life: l, max: l, s: rnd(1.4, 2.8), gr: .05 });
    }
  }
  function rocket() {
    ensure();
    const h = innerHeight * rnd(.45, .75);
    ps.push({ k: 'rocket', x: innerWidth * rnd(.12, .88), y: innerHeight, vx: rnd(-1.2, 1.2), vy: -Math.sqrt(.24 * h), c: any(COL), life: 400 });
  }
  function paper(x, y, vx, vy) {
    ps.push({ k: 'conf', x, y, vx, vy, c: any(COL), w: rnd(6, 11), h: rnd(10, 16), r: rnd(0, 6), vr: rnd(-.2, .2), t: rnd(0, 6), life: 600 });
  }
  function cannon(right) {
    ensure();
    for (let k = 0; k < 90; k++) paper(right ? innerWidth + 10 : -10, innerHeight * .85, (right ? -1 : 1) * rnd(4, 14), -rnd(9, 19));
  }
  function shower() { ensure(); for (let k = 0; k < 120; k++) paper(rnd(0, innerWidth), rnd(-200, -10), rnd(-1, 1), rnd(1, 3)); }
  return {
    boom: (x, y) => { if (!calm()) explode(x, y, any(COL)); },
    celebrate() {
      if (calm()) return;
      until = Date.now() + 6000; ensure();
      cannon(false); cannon(true);
      setTimeout(shower, 700);
      for (let i = 0; i < 10; i++) setTimeout(rocket, 300 + i * 420);
      setTimeout(() => { cannon(false); cannon(true); }, 2600);
    },
  };
})();
function countdown() {
  if (calm()) return Sfx.start();
  const el = document.createElement('div'), seq = ['3', '2', '1', 'เริ่ม!'];
  el.className = 'tq-count'; document.body.appendChild(el);
  let k = 0;
  (function next() {
    if (k === seq.length) { el.classList.add('out'); return setTimeout(() => el.remove(), 350); }
    el.innerHTML = `<b class="${k === 3 ? 'go' : ''}">${seq[k]}</b>`;
    k === 3 ? Sfx.start() : Sfx.count();
    k++; setTimeout(next, 750);
  })();
}
// สติกเกอร์น้องโมจิร้องไห้ ถือป้าย "สู้ๆ" ใต้เมฆฝน (SVG วาดเอง)
function sticker() {
  return `<svg class="tq-stk" viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="tq-stk-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddd6fe"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
    <g class="cloud"><circle cx="146" cy="34" r="14" fill="#cbd5e1"/><circle cx="162" cy="30" r="17" fill="#cbd5e1"/><circle cx="178" cy="36" r="12" fill="#cbd5e1"/><rect x="134" y="34" width="54" height="14" rx="7" fill="#cbd5e1"/></g>
    <path class="drop" d="M148 54l-3 7a3 3 0 0 0 6 0z" fill="#60a5fa"/><path class="drop d2" d="M164 54l-3 7a3 3 0 0 0 6 0z" fill="#60a5fa"/><path class="drop d3" d="M178 52l-3 7a3 3 0 0 0 6 0z" fill="#60a5fa"/>
    <ellipse cx="100" cy="184" rx="58" ry="8" fill="rgba(15,23,42,.12)"/>
    <g class="body">
      <path d="M100 52c42 0 70 32 70 72 0 36-28 56-70 56s-70-20-70-56c0-40 28-72 70-72z" fill="url(#tq-stk-g)"/>
      <ellipse cx="72" cy="80" rx="16" ry="9" fill="#fff" opacity=".55" transform="rotate(-25 72 80)"/>
      <path d="M62 100q10-8 22-6M138 100q-10-8-22-6" stroke="#4c1d95" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <ellipse cx="78" cy="116" rx="8" ry="10" fill="#2e1065"/><ellipse cx="122" cy="116" rx="8" ry="10" fill="#2e1065"/>
      <circle cx="81" cy="112" r="3" fill="#fff"/><circle cx="125" cy="112" r="3" fill="#fff"/><circle cx="76" cy="120" r="1.5" fill="#fff"/><circle cx="120" cy="120" r="1.5" fill="#fff"/>
      <ellipse cx="62" cy="134" rx="10" ry="6" fill="#f9a8d4" opacity=".75"/><ellipse cx="138" cy="134" rx="10" ry="6" fill="#f9a8d4" opacity=".75"/>
      <path d="M90 140q10-8 20 0" stroke="#4c1d95" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <path class="tear" d="M130 124c0 0-6 9-6 13a6 6 0 0 0 12 0c0-4-6-13-6-13z" fill="#7dd3fc"/>
      <g class="sign"><rect x="66" y="150" width="68" height="30" rx="10" fill="#fff" stroke="#f472b6" stroke-width="3"/>
        <text x="100" y="171" text-anchor="middle" font-size="16" font-weight="800" fill="#db2777" font-family="'Noto Sans Thai',sans-serif">สู้ๆ นะ!</text>
        <circle cx="66" cy="164" r="8" fill="#c4b5fd"/><circle cx="134" cy="164" r="8" fill="#c4b5fd"/></g>
    </g></svg>`;
}
function spotlight(r, pass, canRetry) {
  const near = r.pass_percent - r.percent <= 15;
  const tip = !canRetry ? 'ใช้สิทธิ์สอบครบแล้ว — ติดต่อผู้ดูแลการอบรมได้เลยนะ'
    : near ? 'ขาดอีกแค่นิดเดียว ทบทวนอีกหน่อยรอบหน้าผ่านแน่นอน 💪' : 'ทบทวนเนื้อหาอีกนิด แล้วกลับมาลุยใหม่นะ 💜';
  const el = document.createElement('div');
  el.className = 'tq-ov ' + (pass ? 'pass' : 'fail');
  el.innerHTML = pass ? `<div class="tq-ov-rays"></div><div class="tq-ov-box">
      <div class="tq-hero-fx" aria-hidden="true"><i></i><i></i><i></i>${'<b></b>'.repeat(6)}</div>
      <div class="tq-emblem" title="แตะเพื่อจุดพลุ">
        <span class="tq-orbit o1"><em></em></span><span class="tq-orbit o2"><em></em></span><span class="tq-orbit o3"><em></em></span>
        <div class="tq-emblem-core"><i class="ti ti-trophy"></i></div></div>
      <div class="tq-eyebrow"><i class="ti ti-sparkles"></i>สอบผ่านแล้ว · Congratulations</div>
      <h2 class="tq-ov-title">ยินดีด้วย! เก่งมาก 🎉</h2>
      <div class="tq-ov-score">0%</div>
      <div class="tq-ov-sub">ตอบถูก ${r.score}/${r.total} ข้อ · เกณฑ์ผ่าน ${r.pass_percent}%<br>ใบประกาศกำลังส่งไปที่อีเมลของคุณ</div>
      <button class="tq-btn tq-btn-go" data-close><i class="ti ti-award"></i>ดูผลสอบ</button></div>`
    : `<div class="tq-ov-box">
      <div class="tq-hearts" aria-hidden="true">${'<i class="ti ti-heart-filled"></i>'.repeat(6)}</div>
      ${sticker()}
      <h2 class="tq-ov-title">${near ? 'เกือบแล้ว! อีกนิดเดียวเอง' : 'ไม่เป็นไรนะ~ ลองใหม่ได้'}</h2>
      <div class="tq-ov-score">0%</div>
      <div class="tq-ov-sub">ตอบถูก ${r.score}/${r.total} ข้อ · เกณฑ์ผ่าน ${r.pass_percent}%<br>${tip}</div>
      <div class="tq-ov-acts">${canRetry ? '<button class="tq-btn" data-retry><i class="ti ti-refresh"></i>ลองอีกครั้ง</button>' : ''}
        <button class="tq-btn ghost" data-close><i class="ti ti-bulb"></i>ดูเฉลย + คำอธิบาย</button></div></div>`;
  document.body.appendChild(el);
  const onKey = e => e.key === 'Escape' && close();
  function close() {
    if (el.classList.contains('out')) return;
    el.classList.add('out'); removeEventListener('keydown', onKey); setTimeout(() => el.remove(), 300);
  }
  addEventListener('keydown', onKey);
  el.addEventListener('click', e => {
    if (e.target.closest('.tq-emblem')) return Fx.boom(e.clientX, e.clientY);
    if (e.target.closest('[data-retry]')) { close(); return retry(); }
    if (e.target === el || e.target.closest('[data-close]')) close();
  });
  setTimeout(() => countUp(el.querySelector('.tq-ov-score'), Math.round(r.percent)), 350);
  if (pass) { Sfx.pass(); Fx.celebrate(); } else Sfx.fail();
}

/* ══ เริ่มต้น ══ */
(async function init() {
  const cert = _qs.get('cert');
  if (cert) return showCert(cert);
  if (!SITE) return fail('ลิงก์ไม่ถูกต้อง', 'กรุณาเปิดจากลิงก์ที่ผู้ดูแลการอบรมส่งให้');
  try {
    const [lR, cR] = await Promise.all([
      _sb.from('trn_locations').select('name').eq('code', SITE).maybeSingle(),
      // หลักสูตรอบรม (ของกลาง) ที่เปิดในโครงการนี้และเปิดสอบอยู่ · แบบทดสอบผูกที่หลักสูตร
      _sb.from('trn_site_categories').select('cat_id,trn_categories!inner(id,name,quiz_id)').eq('site', SITE).eq('quiz_open', true).not('trn_categories.quiz_id', 'is', null).order('cat_id'),
    ]);
    _project = lR.data?.name || SITE;
    $('tq-site').textContent = _project;
    // แบบทดสอบมาจากคลังกลาง — 1 รายการต่อหลักสูตรอบรม (สองหลักสูตรใช้ชุดเดียวกันได้ · สิทธิ์สอบนับแยกตามโครงการ)
    const cats = (cR.data || []).map(x => x.trn_categories).filter(c => c && c.quiz_id);
    const qR = cats.length ? await _sb.from('trn_quizzes').select('*').in('id', [...new Set(cats.map(c => c.quiz_id))]).eq('is_active', true) : { data: [] };
    _quizzes = cats.map(c => { const q = (qR.data || []).find(x => x.id === c.quiz_id); return q && { ...q, cat_id: c.id, name: q.title }; }).filter(Boolean);
  } catch (e) { return fail('โหลดข้อมูลไม่สำเร็จ', 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
  const want = +_qs.get('cat');
  const q = want ? _quizzes.find(x => x.cat_id === want) : _quizzes.length === 1 ? _quizzes[0] : null;
  if (q) return pick(q.cat_id);
  if (!_quizzes.length) return fail('ยังไม่มีแบบทดสอบที่เปิดให้ทำ', 'กรุณาติดต่อผู้ดูแลการอบรม');
  $('tq-list').innerHTML = _quizzes.map(x => `<button class="tq-quiz" onclick="pick(${x.cat_id})">
    <i class="ti ti-pencil-check"></i><div><b>${esc(x.name)}</b><span>${quizInfo(x)}</span></div><i class="ti ti-chevron-right"></i></button>`).join('');
  show('sc-list');
})();

function quizInfo(q) {
  return [`${q.questions_count} ข้อ`, `ผ่าน ${q.pass_percent}%`, q.time_limit_min ? `${q.time_limit_min} นาที` : 'ไม่จับเวลา',
    q.max_attempts ? `สอบได้ ${q.max_attempts} ครั้ง` : 'สอบได้ไม่จำกัด'].join(' · ');
}

/* ══ ยืนยันตัวตน: ผู้ลงทะเบียน (ค้นชื่อ) หรือ คนนอกรายชื่อ (กรอกเอง) ══ */
async function pick(catId) {
  _quiz = _quizzes.find(x => x.cat_id === catId);
  $('tq-quiz-name').textContent = _quiz.name;
  const q = _quiz;
  $('tq-quiz-info').innerHTML = [['list-numbers', q.questions_count, 'ข้อสอบ'], ['target-arrow', `${q.pass_percent}%`, 'เกณฑ์ผ่าน'],
    ['clock', q.time_limit_min || '∞', q.time_limit_min ? 'นาที' : 'ไม่จับเวลา'], ['repeat', q.max_attempts || '∞', q.max_attempts ? 'ครั้งที่สอบได้' : 'สอบได้ไม่จำกัด']]
    .map(([i, v, t], k) => `<div class="tq-stat" style="--d:${k}"><i class="ti ti-${i}"></i><b>${v}</b><span>${t}</span></div>`).join('');
  $('tq-email').value = $('tq-o-email').value = remembered();
  setMode('reg');
  show('sc-who');
  if (!_regs) {
    const [rR, dR] = await Promise.all([
      // คำนำหน้า/แผนก เก็บเป็นรหัสรายการหลัก — ดึงชื่อมาพร้อมกัน (embed ผ่าน foreign key)
      _sb.from('trn_registrations').select('id,fname,lname,position,email,pm:trn_master_items!trn_registrations_prefix_id_fkey(value),dm:trn_master_items!trn_registrations_dept_id_fkey(value),trn_sessions!inner(site,cat_id)').eq('trn_sessions.site', SITE),
      _sb.from('trn_master_items').select('value').eq('type', 'dept').eq('site', SITE).order('sort_order'),
    ]);
    _regs = (rR.data || []).map(r => ({ ...r, prefix: r.pm?.value || '', dept: r.dm?.value || '', name: `${r.pm?.value || ''}${r.fname} ${r.lname}`, catId: r.trn_sessions?.cat_id }));
    $('tq-depts').innerHTML = (dR.data || []).map(d => `<option value="${esc(d.value)}">`).join('');
  }
}
function setMode(m) {
  document.querySelectorAll('.tq-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  $('tq-mode-reg').style.display = m === 'reg' ? '' : 'none';
  $('tq-mode-out').style.display = m === 'out' ? '' : 'none';
  _who = null; $('tq-picked').style.display = 'none'; $('tq-search').value = ''; $('tq-results').innerHTML = '';
}
function searchReg() {
  const q = norm($('tq-search').value);
  const el = $('tq-results');
  if (q.length < 2) { el.innerHTML = ''; return; }
  const hit = (_regs || []).filter(r => norm(r.name).includes(q) || norm(r.fname + ' ' + r.lname).includes(q))
    .sort((a, b) => (b.catId === _quiz.cat_id) - (a.catId === _quiz.cat_id));
  const seen = new Set(), list = hit.filter(r => { const k = norm(r.name) + '|' + norm(r.dept); return !seen.has(k) && seen.add(k); }).slice(0, 8);
  el.innerHTML = list.length
    ? list.map(r => `<button class="tq-person" onclick="pickReg(${r.id})"><b>${esc(r.name)}</b><span>${esc([r.position, r.dept].filter(Boolean).join(' · ') || '-')}</span></button>`).join('')
    : `<div class="tq-hint">ไม่พบชื่อนี้ในรายชื่อผู้ลงทะเบียน — <a href="#" onclick="setMode('out');return false;">กรอกข้อมูลเอง</a></div>`;
}
function pickReg(id) {
  const r = _regs.find(x => x.id === id);
  _who = { reg: r.id };
  $('tq-picked-name').textContent = r.name;
  $('tq-picked-sub').textContent = [r.position, r.dept].filter(Boolean).join(' · ');
  if (r.email && !$('tq-email').value) $('tq-email').value = r.email;
  $('tq-results').innerHTML = ''; $('tq-search').value = '';
  $('tq-picked').style.display = '';
}
function unpick() { _who = null; $('tq-picked').style.display = 'none'; $('tq-search').focus(); }

async function start() {
  const out = $('tq-mode-out').style.display !== 'none';
  let p;
  if (out) {
    p = { p_site: SITE, p_cat: _quiz.cat_id, p_email: $('tq-o-email').value.trim(), p_reg: null, p_name: $('tq-o-name').value.trim(),
      p_dept: $('tq-o-dept').value.trim(), p_position: $('tq-o-pos').value.trim() };
    if (!p.p_name) return toast('กรุณากรอกชื่อ-นามสกุล', 'err');
    if (!p.p_dept) return toast('กรุณากรอกหน่วยงาน', 'err');
  } else {
    if (!_who) return toast('กรุณาค้นหาและเลือกชื่อของคุณ', 'err');
    p = { p_site: SITE, p_cat: _quiz.cat_id, p_email: $('tq-email').value.trim(), p_reg: _who.reg };
  }
  if (!emailOk(p.p_email)) return toast('กรุณากรอกอีเมลให้ถูกต้อง — ใบประกาศจะส่งไปที่อีเมลนี้', 'err');
  const btn = $('tq-start'); btn.disabled = true; btn.innerHTML = '<span class="tq-spin"></span>กำลังเตรียมข้อสอบ...';
  const { data, error } = await _sb.rpc('trn_quiz_start', p);
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i>เริ่มทำแบบทดสอบ';
  if (error) return toast(errMsg(error), 'err');
  try { localStorage.setItem(EMAIL_KEY, p.p_email); } catch (e) {}
  _att = data;
  try { _ans = JSON.parse(sessionStorage.getItem('tq_ans_' + _att.attempt_id) || '[]'); } catch (e) { _ans = []; }
  renderQuiz();
  countdown();
}

/* ══ ทำข้อสอบ — คำตอบจำไว้ในแท็บนี้ (รีเฟรชแล้วเริ่มใหม่ได้ชุดเดิม คำตอบไม่หาย) ══ */
function renderQuiz() {
  const qs = _att.questions;
  $('tq-q-title').textContent = _quiz.name;
  $('tq-dots').innerHTML = qs.map((q, i) => `<button class="tq-dot" onclick="jump(${i})">${i + 1}</button>`).join('');
  $('tq-qs').innerHTML = qs.map((q, i) => `<div class="tq-q${_ans[i] != null ? ' answered' : ''}" id="tq-q${i}" style="--d:${i}">
    <div class="tq-q-head"><span class="tq-q-no"><small>ข้อ</small>${i + 1}</span><div class="tq-q-text">${esc(q.question)}</div>
      <span class="tq-q-done"><i class="ti ti-check"></i><span>ตอบแล้ว</span></span></div>
    <div class="tq-choices">${q.choices.map((c, j) => `<label class="tq-choice c${j % 6}${_ans[i] === j ? ' on' : ''}">
      <input type="radio" name="q${i}" ${_ans[i] === j ? 'checked' : ''} onchange="answer(${i},${j})"><span class="tq-ch">${CH[j] || j + 1}</span><span class="tq-ct">${esc(c)}</span><i class="ti ti-circle-check-filled tq-tick"></i></label>`).join('')}</div>
  </div>`).join('');
  progress();
  watchCurrent();
  clearInterval(_timer);
  $('tq-timer').style.display = _att.time_limit_min ? '' : 'none';
  if (_att.time_limit_min) {
    // เวลาจากเครื่องแม่ข่าย (นาฬิกาในเครื่องผู้สอบเพี้ยนได้)
    _deadline = Date.now() + (new Date(_att.started_at).getTime() + _att.time_limit_min * 60000 - new Date(_att.now).getTime());
    tick(); _timer = setInterval(tick, 1000);
  }
  show('sc-quiz');
}
function answer(i, j) {
  const first = _ans[i] == null;
  _ans[i] = j;
  const labs = document.querySelectorAll(`#tq-q${i} .tq-choice`);
  labs.forEach((l, k) => l.classList.toggle('on', k === j));
  $('tq-q' + i).classList.add('answered');
  try { sessionStorage.setItem('tq_ans_' + _att.attempt_id, JSON.stringify(_ans)); } catch (e) {}
  progress();
  burst(labs[j].querySelector('.tq-ch'), CC[j % 6]);
  navigator.vibrate?.(12);
  bump(document.querySelector('.tq-ring'));
  // ตอบข้อใหม่ → ฉลองเมื่อผ่าน 25/50/75% และครบทุกข้อ · เลื่อนไปข้อถัดไปที่ยังไม่ได้ตอบ (เปลี่ยนคำตอบเดิมไม่เลื่อน)
  if (first) {
    const n = _att.questions.length, d = _ans.filter(x => x != null).length;
    const m = [[.25, 'bolt', 'ไปได้ดี! ผ่านไป 25%'], [.5, 'flame', 'ครึ่งทางแล้ว สู้ต่อ!'], [.75, 'rocket', 'อีกนิดเดียว!']]
      .find(([p]) => (d - 1) / n < p && d / n >= p);
    if (d === n) { Sfx.complete(); cheer('confetti', 'ตอบครบทุกข้อแล้ว!'); }
    else if (m && n >= 4) { Sfx.milestone(); cheer(m[1], m[2]); }
    else Sfx.pick(j);
    const next = [...Array(n).keys()].map(k => (i + 1 + k) % n).find(k => _ans[k] == null);
    setTimeout(() => (next != null ? $('tq-q' + next) : $('tq-submit')).scrollIntoView({ behavior: 'smooth', block: next != null ? 'start' : 'center' }), 350);
  } else Sfx.pick(j);
}
function jump(i) { $('tq-q' + i).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
let _obs = null;
function watchCurrent() { // ไฮไลต์เลขข้อที่กำลังดูอยู่ในแถบด้านบน
  _obs?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  _obs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = +e.target.id.slice(4), dots = $('tq-dots').children;
    [...dots].forEach((d, k) => d.classList.toggle('cur', k === i));
    document.querySelectorAll('.tq-q').forEach((q, k) => q.classList.toggle('cur', k === i));
    const d = dots[i], box = $('tq-dots');
    if (d) box.scrollTo({ left: d.offsetLeft - box.clientWidth / 2 + d.offsetWidth / 2, behavior: 'smooth' });
  }), { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('.tq-q').forEach(q => _obs.observe(q));
}
const CHEER = [[0, 'rocket', 'เริ่มกันเลย! เลือกคำตอบที่ถูกที่สุด'], [.01, 'bolt', 'เริ่มต้นได้ดี ลุยต่อเลย'],
  [.5, 'flame', 'ไปได้สวย! เกินครึ่งแล้ว'], [.8, 'sparkles', 'อีกนิดเดียว ใกล้ครบแล้ว'], [1, 'confetti', 'ตอบครบแล้ว! พร้อมส่งคำตอบ']];
function progress() {
  const n = _att.questions.length, done = _att.questions.filter((q, i) => _ans[i] != null).length, r = done / n, pct = Math.round(r * 100);
  const [, icon, msg] = CHEER.filter(c => r >= c[0]).pop();
  const t = $('tq-prog-txt');
  t.innerHTML = `<i class="ti ti-${icon}"></i>${msg} · ${done}/${n}`;
  t.classList.toggle('done', done === n);
  $('tq-prog-bar').style.width = pct + '%';
  $('tq-ring-fg').setAttribute('stroke-dasharray', `${pct} 100`);
  $('tq-ring-txt').textContent = pct + '%';
  [...$('tq-dots').children].forEach((d, i) => d.classList.toggle('done', _ans[i] != null));
  const b = $('tq-submit'); delete b.dataset.warn;
  b.classList.remove('warn'); b.classList.toggle('ready', done === n);
  b.innerHTML = done === n ? '<i class="ti ti-send"></i>ส่งคำตอบ' : `<i class="ti ti-send"></i>ส่งคำตอบ (${done}/${n})`;
}
function tick() {
  const s = Math.max(0, Math.round((_deadline - Date.now()) / 1000));
  const el = $('tq-timer');
  el.innerHTML = `<i class="ti ti-clock"></i>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('low', s <= 60);
  if (s === 60) Sfx.warn(); else if (s > 0 && s <= 10) Sfx.tick();
  if (s === 0) { clearInterval(_timer); toast('หมดเวลา — ส่งคำตอบอัตโนมัติ', 'err'); submit(true); }
}
async function submit(auto) {
  if (_sending) return;
  const n = _att.questions.length, left = _att.questions.filter((q, i) => _ans[i] == null).length;
  const b = $('tq-submit');
  if (!auto && left && !b.dataset.warn) { // กดครั้งแรกเตือน · กดซ้ำ = ส่ง
    Sfx.warn(); b.dataset.warn = 1; b.classList.add('warn'); b.innerHTML = `<i class="ti ti-alert-triangle"></i>ยังไม่ได้ตอบ ${left} ข้อ — กดอีกครั้งเพื่อส่ง`;
    const first = _att.questions.findIndex((q, i) => _ans[i] == null);
    $('tq-q' + first)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  _sending = true; b.disabled = true; b.innerHTML = '<span class="tq-spin"></span>กำลังตรวจคำตอบ...';
  Sfx.whoosh();
  const answers = Array.from({ length: n }, (x, i) => _ans[i] ?? null);
  const { data, error } = await _sb.rpc('trn_quiz_submit', { p_attempt: _att.attempt_id, p_answers: answers });
  _sending = false; b.disabled = false; progress();
  if (error) return toast(errMsg(error), 'err');
  clearInterval(_timer);
  try { sessionStorage.removeItem('tq_ans_' + _att.attempt_id); } catch (e) {}
  renderResult(data, answers);
}

/* ══ ผลสอบ — ข้อที่ตอบผิด: เฉลย + คำอธิบายของผู้ออกข้อสอบ (r.review จาก trn_quiz_submit) + คำอธิบายจาก AI ══ */
function renderResult(r, answers) {
  const pass = r.status === 'PASS';
  const ok = r.correct || [], fix = r.review || [], qs = _att.questions;
  const st = qs.map((q, i) => ok[i] ? 'ok' : answers[i] == null ? 'skip' : 'bad');
  const nOk = st.filter(x => x === 'ok').length, nSkip = st.filter(x => x === 'skip').length, nBad = qs.length - nOk - nSkip;
  $('tq-res-card').className = 'tq-card tq-res ' + (pass ? 'pass' : 'fail');
  $('tq-res-head').innerHTML = `${pass ? '<div class="tq-res-icon ok"><i class="ti ti-trophy"></i></div>' : `<div class="tq-res-stk">${sticker()}</div>`}
    <div class="tq-res-score" id="tq-res-score">0%</div>
    <div class="tq-res-badge ${pass ? 'ok' : 'bad'}"><i class="ti ti-${pass ? 'rosette-discount-check' : 'alert-circle'}"></i>${pass ? 'ผ่านการทดสอบ' : 'ยังไม่ผ่านการทดสอบ'}</div>
    <div class="tq-res-msg">${pass ? 'ยอดเยี่ยม! ยินดีด้วยกับความสำเร็จ 🎉' : 'ไม่เป็นไร ทบทวนอีกนิดแล้วลองใหม่ได้ 💪'}</div>
    <div class="tq-res-stats">
      <div class="ok"><b>${nOk}</b><span>ตอบถูก</span></div>
      <div class="bad"><b>${nBad}</b><span>ตอบผิด</span></div>
      ${nSkip ? `<div class="skip"><b>${nSkip}</b><span>ไม่ได้ตอบ</span></div>` : ''}
      <div><b>${r.pass_percent}%</b><span>เกณฑ์ผ่าน</span></div>
    </div>
    ${r.late ? '<div class="tq-hint" style="margin-top:10px;">ส่งคำตอบเกินเวลาที่กำหนด — ไม่นับคะแนน</div>' : ''}`;
  $('tq-res-mail').innerHTML = pass ? '<div class="tq-mail"><span class="tq-spin dark"></span>กำลังส่งใบประกาศไปที่อีเมล...</div>' : '';
  const canRetry = !pass && r.attempts_left !== 0;
  $('tq-res-actions').innerHTML = pass ? '' : canRetry
    ? `<button class="tq-btn" onclick="retry()"><i class="ti ti-refresh"></i>ทำแบบทดสอบอีกครั้ง${r.attempts_left != null ? ` (เหลือ ${r.attempts_left} ครั้ง)` : ''}</button>`
    : '<div class="tq-hint">ใช้สิทธิ์สอบครบแล้ว — กรุณาติดต่อผู้ดูแลการอบรม</div>';
  const fl = $('tq-res-filter'), rv = $('tq-res-review');
  fl.innerHTML = [['all', 'ทั้งหมด', qs.length], ['bad', 'ข้อที่ผิด', qs.length - nOk], ['ok', 'ข้อที่ถูก', nOk]]
    .map(([k, t, c]) => `<button class="tq-rf${k === 'all' ? ' active' : ''}" data-f="${k}"${c ? '' : ' disabled'}>${t} <b>${c}</b></button>`).join('');
  fl.onclick = e => {
    const b = e.target.closest('.tq-rf'); if (!b || b.disabled) return;
    fl.querySelectorAll('.tq-rf').forEach(x => x.classList.toggle('active', x === b));
    rv.dataset.f = b.dataset.f;
  };
  rv.dataset.f = 'all';
  const tag = { ok: ['circle-check-filled', 'ถูก'], bad: ['circle-x-filled', 'ผิด'], skip: ['circle-minus', 'ไม่ได้ตอบ'] };
  rv.innerHTML = qs.map((q, i) => `<div class="tq-rv ${st[i]}" style="--d:${i}">
    <span class="tq-rv-no">${i + 1}</span>
    <div class="tq-rv-body"><div class="tq-rv-top"><div class="tq-rv-q">${esc(q.question)}</div>
    <span class="tq-rv-tag"><i class="ti ti-${tag[st[i]][0]}"></i>${tag[st[i]][1]}</span></div>
    <div class="tq-rv-a"><span>คำตอบของคุณ</span>${answers[i] == null ? '<i>ไม่ได้ตอบ</i>' : esc(q.choices[answers[i]])}</div>
    ${fix[i] ? `<div class="tq-rv-fix"><i class="ti ti-circle-check"></i><span>คำตอบที่ถูก: <b>${CH[fix[i].answer] || ''}. ${esc(q.choices[fix[i].answer])}</b></span></div>
      ${fix[i].explanation ? `<div class="tq-rv-exp"><i class="ti ti-bulb"></i><span>${esc(fix[i].explanation)}</span></div>` : ''}
      ${window.aiChat ? `<div class="tq-rv-ai" id="tq-ai${i}"><span class="tq-spin dark"></span>AI กำลังอธิบายข้อนี้...</div>` : ''}` : ''}</div></div>`).join('');
  explainWrong(fix, answers);
  show('sc-result');
  countUp($('tq-res-score'), Math.round(r.percent));
  if (pass) mailCert(r.cert_id);
  spotlight(r, pass, canRetry);
}
// AI อธิบายทีละข้อ (ยิงพร้อมกัน ข้อไหนเสร็จแสดงก่อน) — ยึดเฉลยจากฐานข้อมูล AI แค่อธิบายเหตุผล
function explainWrong(fix, answers) {
  if (!window.aiChat) return;
  const sys = 'คุณเป็นวิทยากรผู้ใจดี อธิบายข้อสอบหลังการอบรมการใช้งานระบบโปรแกรมในโรงพยาบาลให้ผู้เข้าอบรมเข้าใจ '
    + 'ตอบเป็นภาษาไทย 2–4 ประโยค เป็นกันเอง ให้กำลังใจ บอกว่าทำไมคำตอบที่ถูกจึงถูก และถ้าผู้สอบเลือกผิด บอกสั้น ๆ ว่าตัวเลือกนั้นต่างอย่างไร '
    + 'ถือว่าเฉลยที่ให้มาถูกต้องเสมอ ห้ามโต้แย้งเฉลย ห้ามแต่งเมนู/ขั้นตอนที่ไม่มีในข้อมูล ไม่ใช้หัวข้อ ไม่ใช้ตัวหนา';
  _att.questions.forEach((q, i) => {
    const f = fix[i]; if (!f) return;
    const user = `คำถาม: ${q.question}\nตัวเลือก:\n${q.choices.map((c, j) => `${CH[j] || j + 1}. ${c}`).join('\n')}\n`
      + `คำตอบที่ถูก: ${CH[f.answer]}. ${q.choices[f.answer]}\n`
      + `ผู้สอบตอบ: ${answers[i] == null ? '(ไม่ได้ตอบ)' : `${CH[answers[i]]}. ${q.choices[answers[i]]}`}\n`
      + (f.explanation ? `คำอธิบายจากผู้ออกข้อสอบ: ${f.explanation}\n` : '');
    window.aiChat(sys, user, { maxTokens: 400, temperature: 0.3 })
      .then(t => {
        const el = $('tq-ai' + i); if (!el) return;
        el.classList.add('done');
        el.innerHTML = `<i class="ti ti-sparkles"></i><div><b>AI อธิบายเพิ่มเติม</b><span>${esc(t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*#+\s*/gm, '')).replace(/\n+/g, '<br>')}</span></div>`;
      })
      .catch(() => { const el = $('tq-ai' + i); if (el) el.innerHTML = '<span class="tq-rv-ai-off">AI อธิบายไม่ได้ในขณะนี้</span>'; });
  });
}
function countUp(el, to) {
  const t0 = performance.now(), dur = 1200;
  (function f(t) {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + '%';
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}
async function mailCert(certId) {
  const box = $('tq-res-mail');
  try {
    const [cR, st] = await Promise.all([_sb.from('trn_quiz_certs').select('*').eq('cert_id', certId).single(), TrnCert.settings(_sb)]);
    const cert = cR.data;
    const res = cert.email_status === 'sent' ? { ok: true } : await TrnCert.sendEmail(_sb, cert, st, _project);
    box.innerHTML = res.ok
      ? `<div class="tq-mail ok"><i class="ti ti-mail-check"></i><div><p>ส่งใบประกาศไปที่ <b>${esc(cert.email)}</b> แล้ว</p><span>เลขที่ ${esc(cert.cert_id)} · หากไม่พบ ให้ตรวจสอบในกล่องจดหมายขยะ (Spam)</span></div></div>`
      : `<div class="tq-mail bad"><i class="ti ti-mail-off"></i><div><p>ส่งอีเมลไม่สำเร็จ</p><span>ผลสอบผ่านถูกบันทึกแล้ว — ผู้ดูแลการอบรมจะส่งใบประกาศไปที่ ${esc(cert.email)} ให้อีกครั้ง</span></div></div>`;
  } catch (e) {
    box.innerHTML = '<div class="tq-mail bad"><i class="ti ti-mail-off"></i><div><p>ส่งอีเมลไม่สำเร็จ</p><span>ผลสอบผ่านถูกบันทึกแล้ว — ผู้ดูแลการอบรมจะส่งใบประกาศให้อีกครั้ง</span></div></div>';
  }
}
function retry() { _att = null; _ans = []; show('sc-who'); }

/* ══ ใบประกาศ (ลิงก์ในอีเมล / QR) — ตรวจสอบสถานะ + ดาวน์โหลด PDF ══ */
async function showCert(id) {
  const [cR, st] = await Promise.all([_sb.from('trn_quiz_certs').select('*').eq('cert_id', id).maybeSingle(), TrnCert.settings(_sb)]);
  const c = cR.data;
  if (!c) return fail('ไม่พบใบประกาศเลขที่นี้', id);
  const [lR] = await Promise.all([_sb.from('trn_locations').select('name').eq('code', c.site).maybeSingle(), TrnCert.enrich(_sb, c)]);
  const project = lR.data?.name || '';
  $('tq-site').textContent = project || 'ใบประกาศ';
  document.title = 'ใบประกาศ ' + c.cert_id + ' — BMS Training';
  $('tq-cert-status').innerHTML = c.is_revoked
    ? `<div class="tq-verify bad"><i class="ti ti-shield-x"></i><div><b>ใบประกาศนี้ถูกยกเลิกแล้ว</b><span>เลขที่ ${esc(c.cert_id)}</span></div></div>`
    : `<div class="tq-verify ok"><i class="ti ti-shield-check"></i><div><b>ใบประกาศถูกต้อง</b><span>${esc(c.full_name)} · ${esc(c.quiz_title)} · เลขที่ ${esc(c.cert_id)}</span></div></div>`;
  const style = document.createElement('style'); style.textContent = TrnCert.css; document.head.appendChild(style);
  $('tq-cert-box').innerHTML = `<div class="tq-cert-scale${c.is_revoked ? ' revoked' : ''}">${TrnCert.html(c, st, project)}</div>`;
  $('tq-cert-dl').style.display = c.is_revoked ? 'none' : '';
  $('tq-cert-dl').onclick = async () => {
    const b = $('tq-cert-dl'); b.disabled = true; b.innerHTML = '<span class="tq-spin"></span>กำลังสร้าง PDF...';
    try { await TrnCert.pdf($('tq-cert-box').querySelector('.tc-cert'), `${c.cert_id}.pdf`); }
    catch (e) { toast('สร้าง PDF ไม่สำเร็จ ลองใหม่อีกครั้ง', 'err'); }
    b.disabled = false; b.innerHTML = '<i class="ti ti-download"></i>ดาวน์โหลด PDF';
  };
  document.querySelector('.tq-wrap').classList.add('wide');
  show('sc-cert');
  fitCert(); window.addEventListener('resize', fitCert);
}
function fitCert() {
  const box = $('tq-cert-box'), el = box.querySelector('.tc-cert');
  if (!el) return;
  const k = Math.min(1, box.clientWidth / 1123);
  el.style.transform = `scale(${k})`; el.style.transformOrigin = '0 0';
  box.style.height = (794 * k) + 'px';
}
