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

  var pop = null, cur = null, pinned = false;

  function show(el) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'calc-tip-pop';
      pop.setAttribute('role', 'tooltip');
      document.body.appendChild(pop);
    }
    cur = el;
    pop.textContent = el.getAttribute('data-calc') || '';
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
