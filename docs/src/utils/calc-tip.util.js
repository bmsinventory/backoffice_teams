/**
 * calc-tip.util.js — ปุ่ม ⓘ "คำนวณจากอะไร" ข้างตัวเลขสรุป (การ์ด KPI / ยอดรวม / %)
 *   window.calcTip(text)  → HTML ของปุ่ม ⓘ  · text ขึ้นบรรทัดใหม่ด้วย \n
 *   HTML ตรง ๆ: <span class="calc-tip" tabindex="0" data-calc="...">i</span>
 * ชี้เมาส์ / โฟกัส / แตะ (มือถือ) → แสดงกล่องคำอธิบาย · กดที่ ⓘ ไม่ทำให้การ์ดที่ครอบอยู่ถูกคลิกไปด้วย
 * ใช้ทั้ง Backoffice (index.html) และระบบอบรม (training/index.html) — สไตล์อยู่ที่ src/styles/components/calc-tip.css
 */
(function () {
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.calcTip = function (text) {
    if (!text) return '';
    return '<span class="calc-tip" tabindex="0" role="button" aria-label="วิธีคำนวณ" data-html2canvas-ignore data-calc="' + escAttr(text) + '">i</span>';
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // escape + วงเล็บ (...) เป็นตัวจาง
  function rich(s) {
    return esc(s).replace(/\(([^()]*)\)/g, '<span class="ct-dim">($1)</span>');
  }
  var FORMULA = /[÷×]|\s−\s/;
  var KV = /^(.{1,32}?)\s=\s(.+)$/;

  // แปลงข้อความ tip เป็นโครงสร้างอ่านง่าย:
  //   "หัวข้อ = คำอธิบาย" → ป้ายหัวข้อ + คำอธิบาย · บรรทัดสูตร (÷ × −) → กล่องสูตร
  //   "ก ≥ 1 · ข ≥ 2" (ท่อนสั้น ๆ คั่น ·) → ชิป · บรรทัดว่าง → เส้นคั่น
  function format(text) {
    var out = [];
    String(text).split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) { out.push('<div class="ct-sep"></div>'); return; }
      if (/^=\s/.test(line)) { out.push('<div class="ct-f">' + esc(line) + '</div>'); return; }
      var segs = line.split(/\s·\s/);
      if (segs.length > 1 && segs.every(function (s) { return KV.test(s); })) {
        segs.forEach(function (s) { out.push(row(s)); });
        return;
      }
      if (segs.length > 1 && segs.every(function (s) { return s.length <= 32; }) && !KV.test(segs[0])) {
        out.push('<div class="ct-chips">' + segs.map(function (s) { return '<span class="ct-chip">' + rich(s) + '</span>'; }).join('') + '</div>');
        return;
      }
      if (KV.test(line)) { out.push(row(line)); return; }
      out.push(FORMULA.test(line) ? '<div class="ct-f">' + esc(line) + '</div>' : '<div class="ct-p">' + rich(line) + '</div>');
    });
    return out.join('');
  }
  function row(s) {
    var m = s.match(KV);
    return '<div class="ct-row"><span class="ct-k">' + esc(m[1]) + '</span>'
      + (FORMULA.test(m[2]) ? '<span class="ct-v ct-v-f">' + esc(m[2]) : '<span class="ct-v">' + rich(m[2])) + '</span></div>';
  }

  var pop = null, cur = null, pinned = false;

  function show(el) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'calc-tip-pop';
      pop.setAttribute('role', 'tooltip');
      document.body.appendChild(pop);
    }
    cur = el;
    pop.innerHTML = format(el.getAttribute('data-calc') || '');
    pop.classList.add('on');
    var r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, vw - pw - 8));
    var top = r.bottom + 8;
    if (top + ph > vh - 8 && r.top - ph - 8 > 8) top = r.top - ph - 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function hide() {
    if (pop) pop.classList.remove('on');
    cur = null; pinned = false;
  }

  function tipOf(e) { return e.target && e.target.closest ? e.target.closest('.calc-tip') : null; }

  document.addEventListener('mouseover', function (e) { var t = tipOf(e); if (t && !pinned) show(t); });
  document.addEventListener('mouseout', function (e) { var t = tipOf(e); if (t && t === cur && !pinned) hide(); });
  document.addEventListener('focusin', function (e) { var t = tipOf(e); if (t) show(t); });
  document.addEventListener('focusout', function (e) { var t = tipOf(e); if (t && t === cur) hide(); });
  // capture: กันไม่ให้ onclick ของการ์ด/แถวที่ครอบ ⓘ ทำงาน
  document.addEventListener('click', function (e) {
    var t = tipOf(e);
    if (!t) { if (pinned) hide(); return; }
    e.preventDefault(); e.stopPropagation();
    if (pinned && cur === t) { hide(); return; }
    show(t); pinned = true;
  }, true);
  document.addEventListener('keydown', function (e) {
    var t = tipOf(e);
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); show(t); pinned = true; }
    else if (e.key === 'Escape' && cur) hide();
  }, true);
  window.addEventListener('scroll', function () { if (cur) hide(); }, true);
  window.addEventListener('resize', function () { if (cur) hide(); });
})();
