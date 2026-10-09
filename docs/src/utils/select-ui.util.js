/**
 * select-ui.util.js — แทนรายการตัวเลือกของ <select> (popup ของระบบปฏิบัติการ ซึ่งหน้าตาต่างกันทุกเครื่อง)
 * ด้วยแผงตัวเลือกชุดเดียวกันทุกเครื่อง: จอกว้าง = แผงลอยใต้ช่อง · มือถือ (≤ 640px) = แผ่นเลื่อนขึ้นจากล่าง
 *   - ใช้ event delegation ที่ document → ครอบคลุม <select> ทุกตัวในหน้า รวมตัวที่สร้างทีหลัง ไม่ต้อง init ทีละตัว
 *   - ค่าจริงยังอยู่ที่ <select> เดิม (โค้ดเดิมอ่าน/ตั้ง .value, innerHTML, onchange ได้เหมือนเดิม) — เลือกแล้วยิง input + change
 *   - รองรับ optgroup · option disabled/hidden · ช่องค้นหาเมื่อมีตัวเลือกเกิน 8 รายการ · คีย์บอร์ด (↑ ↓ Enter Esc)
 *   - ข้าม: select[multiple], size > 1, disabled, [data-native]
 * สไตล์: src/styles/components/select-ui.css · โหลดโดย src/utils/training-page.util.js ทุกส่วนของ /training/
 */
(function () {
  var MOBILE = window.matchMedia('(max-width:640px)');
  var root = null, panel = null, list = null, search = null, cur = null, active = -1, touchStart = null;

  function eligible(el) {
    return el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.disabled && !el.hasAttribute('data-native');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // หัวแผง (มือถือ): ชื่อช่องจาก label ที่อยู่ใกล้ที่สุด
  function titleOf(sel) {
    if (sel.getAttribute('aria-label')) return sel.getAttribute('aria-label');
    if (sel.id) { var l = document.querySelector('label[for="' + sel.id + '"]'); if (l) return l.textContent.trim(); }
    for (var p = sel.parentElement, k = 0; p && k < 3; p = p.parentElement, k++) {
      var lb = p.querySelector('label,.form-label,.reg-field-label');
      if (lb && !lb.contains(sel)) return lb.textContent.replace('*', '').trim();
    }
    return 'เลือกรายการ';
  }

  function items() { return list ? [].slice.call(list.querySelectorAll('.sui-opt:not(.off):not([hidden])')) : []; }
  function setActive(i) {
    var arr = items(); if (!arr.length) return;
    active = (i + arr.length) % arr.length;
    arr.forEach(function (b, k) { b.classList.toggle('kb', k === active); });
    arr[active].scrollIntoView({ block: 'nearest' });
  }

  function place() {
    if (!cur || !panel || root.classList.contains('sheet')) return;
    var r = cur.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) { close(); return; }
    var w = Math.min(Math.max(r.width, 240), vw - 16);
    var below = vh - r.bottom - 10, above = r.top - 10;
    var up = below < 220 && above > below;
    panel.style.width = w + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    panel.style.maxHeight = Math.min(360, up ? above : below) + 'px';
    if (up) { panel.style.top = 'auto'; panel.style.bottom = (vh - r.top + 6) + 'px'; }
    else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom + 6) + 'px'; }
    panel.classList.toggle('up', up);
  }

  function open(sel) {
    close();
    cur = sel; active = -1;
    var sheet = MOBILE.matches, html = '', n = 0;
    var opt = function (o) {
      if (o.hidden) return '';
      n++;
      var on = o.selected;
      return '<button type="button" class="sui-opt' + (on ? ' on' : '') + (o.disabled ? ' off' : '') + '" data-i="' + o.index + '" aria-selected="' + on + '"' + (o.disabled ? ' disabled' : '') + '>'
        + '<span>' + esc(o.textContent) + '</span></button>';
    };
    [].forEach.call(sel.children, function (c) {
      if (c.tagName === 'OPTGROUP') {
        var inner = [].map.call(c.children, opt).join('');
        if (inner) html += '<div class="sui-grp"><div class="sui-grp-h">' + esc(c.label) + '</div>' + inner + '</div>';
      } else if (c.tagName === 'OPTION') html += opt(c);
    });
    root = document.createElement('div');
    root.className = 'sui' + (sheet ? ' sheet' : '');
    root.innerHTML = (sheet ? '<div class="sui-bd"></div>' : '')
      + '<div class="sui-panel" role="listbox">'
      + (sheet ? '<div class="sui-grab"></div><div class="sui-title"><span>' + esc(titleOf(sel)) + '</span><button type="button" class="sui-x" aria-label="ปิด"><i class="ti ti-x"></i></button></div>' : '')
      + (n > 8 ? '<div class="sui-search"><i class="ti ti-search"></i><input type="text" placeholder="ค้นหา..." autocomplete="off"></div>' : '')
      + '<div class="sui-list">' + (html || '<div class="sui-empty">ไม่มีตัวเลือก</div>') + '</div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.sui-panel');
    list = root.querySelector('.sui-list');
    search = root.querySelector('.sui-search input');
    sel.classList.add('sui-open');
    sel.setAttribute('aria-expanded', 'true');
    place();

    root.addEventListener('click', function (e) {
      var b = e.target.closest('.sui-opt');
      if (b && !b.disabled) { pick(+b.dataset.i); return; }
      if (e.target.closest('.sui-x') || e.target.classList.contains('sui-bd')) close(true);
    });
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase(), any = false;
        list.querySelectorAll('.sui-opt').forEach(function (b) { var m = !q || b.textContent.toLowerCase().indexOf(q) >= 0; b.hidden = !m; if (m) any = true; });
        list.querySelectorAll('.sui-grp').forEach(function (g) { g.hidden = !g.querySelector('.sui-opt:not([hidden])'); });
        var em = list.querySelector('.sui-empty');
        if (!any && !em) list.insertAdjacentHTML('beforeend', '<div class="sui-empty">ไม่พบตัวเลือกที่ค้นหา</div>');
        if (any && em) em.remove();
        active = -1;
      });
      if (!sheet) search.focus({ preventScroll: true });
    }
    var on = list.querySelector('.sui-opt.on');
    if (on) on.scrollIntoView({ block: 'center' });
  }

  function close(refocus) {
    if (!root) return;
    var r = root, s = cur;
    root = panel = list = search = cur = null;
    if (s) { s.classList.remove('sui-open'); s.setAttribute('aria-expanded', 'false'); if (refocus) s.focus({ preventScroll: true }); }
    r.classList.add('closing');
    setTimeout(function () { r.remove(); }, 160);
  }

  function pick(i) {
    var s = cur;
    close(true);
    if (!s || s.selectedIndex === i) return;
    s.selectedIndex = i;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── เปิดแผงแทน popup ของระบบ ──
  // เมาส์: กันที่ mousedown (popup ของระบบเปิดตอนนี้)
  document.addEventListener('mousedown', function (e) {
    var sel = e.target.closest && e.target.closest('select');
    if (root && !e.target.closest('.sui') && sel !== cur) close();
    if (e.button !== 0 || !eligible(sel)) return;
    e.preventDefault();
    sel.focus({ preventScroll: true });
    if (cur === sel) close(); else open(sel);
  }, true);
  // จอสัมผัส: แตะแล้วยกนิ้ว (ไม่ได้ลาก) → ยกเลิก click/focus ของระบบที่จะเปิดตัวเลือกเดิม แล้วเปิดแผงของเรา
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, sel: e.target.closest && e.target.closest('select') };
    if (root && !e.target.closest('.sui') && touchStart.sel !== cur) close();
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    var st = touchStart; touchStart = null;
    if (!st || !eligible(st.sel)) return;
    var t = e.changedTouches[0];
    if (Math.abs(t.clientX - st.x) > 10 || Math.abs(t.clientY - st.y) > 10) return; // ลากเลื่อนหน้า ไม่ใช่แตะ
    e.preventDefault();
    if (cur === st.sel) close(); else open(st.sel);
  }, { capture: true, passive: false });

  // คีย์บอร์ด: ช่องที่โฟกัสอยู่ Enter/Space/Alt+↓/F4 = เปิด · แผงเปิดอยู่ ↑ ↓ Enter Esc Tab
  document.addEventListener('keydown', function (e) {
    if (root) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { var a = items()[active] || (search && items().length === 1 && items()[0]); if (a) { e.preventDefault(); pick(+a.dataset.i); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close();
      return;
    }
    var sel = document.activeElement;
    if (!eligible(sel)) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); open(sel); }
  }, true);

  // เลื่อนหน้า/ย่อขยาย: แผงลอยตามช่อง · เลื่อนในแผงเองไม่ต้องทำอะไร
  window.addEventListener('scroll', function (e) { if (root && !(e.target.closest && e.target.closest('.sui'))) place(); }, true);
  // ย่อขยายหน้าต่าง: แผงลอยปิด · แผ่นล่างของมือถือคงไว้ (คีย์บอร์ดเด้งตอนพิมพ์ค้นหาก็ resize)
  window.addEventListener('resize', function () { if (root && !root.classList.contains('sheet')) close(); });
})();
