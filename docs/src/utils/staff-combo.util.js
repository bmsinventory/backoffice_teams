/**
 * staff-combo.util.js — ตัวเลือกรายชื่อพนักงาน (<select> ที่สร้างด้วย window.staffOptionsGrouped) แบบพิมพ์ค้นหาได้
 * หน้าตาเดียวกับ "ผู้รับผิดชอบ" ใน Helpdesk: กดที่ช่อง → ช่องพิมพ์ค้นหาวางทับช่องเดิม + รายการแบ่งกลุ่มแผนก (พับ/กางได้)
 *   - ใช้ event delegation ที่ document → ครอบคลุม <select> ทุกหน้า รวมตัวที่สร้างทีหลัง ไม่ต้อง init ทีละตัว
 *   - ค่าจริงยังอยู่ที่ <select> เดิม (โค้ดเดิมอ่าน/ตั้ง .value, innerHTML, onchange ได้เหมือนเดิม) — เลือกแล้วยิง input + change
 *   - ใช้กับ select ที่มี <optgroup data-staff> เท่านั้น · ข้าม select[multiple] / disabled
 *   - ค้นหาได้ทั้งชื่อ / ชื่อเล่น / แผนก · คีย์บอร์ด ↑ ↓ Enter Esc · พิมพ์ตัวอักษรตอนช่องโฟกัสอยู่ = เปิดพร้อมค้นหาเลย
 * สไตล์: src/styles/components/staff-combo.css
 */
(function () {
  var root = null, inp = null, lst = null, sel = null, flat = [], fi = -1, q = '', col = new Set(), dt = null;

  function eligible(el) {
    return el && el.tagName === 'SELECT' && !el.multiple && !el.disabled && !!el.querySelector('optgroup[data-staff]');
  }
  function hi(txt, s) {
    var e = window.esc;
    if (!s) return e(txt);
    var lt = txt.toLowerCase(), ls = s.toLowerCase(), out = '', i = 0;
    while (i < txt.length) {
      var x = lt.indexOf(ls, i);
      if (x < 0) { out += e(txt.slice(i)); break; }
      out += e(txt.slice(i, x)) + '<mark>' + e(txt.slice(x, x + ls.length)) + '</mark>';
      i = x + ls.length;
    }
    return out;
  }
  // option → รายการ: ชื่อ (ตัดชื่อเล่นในวงเล็บท้ายออก ไปแสดงด้านขวาแทน)
  function itemOf(o, grp) {
    var sub = o.getAttribute('data-sub') || '', name = o.textContent;
    if (sub && name.slice(-(sub.length + 3)) === ' (' + sub + ')') name = name.slice(0, -(sub.length + 3));
    return { k: 'i', i: o.index, v: o.value, name: name, sub: sub, grp: grp, off: o.disabled };
  }
  function build() {
    var f = [], ls = q.toLowerCase();
    [].forEach.call(sel.children, function (c) {
      if (c.tagName === 'OPTGROUP') {
        var its = [].filter.call(c.children, function (o) { return !o.hidden; }).map(function (o) { return itemOf(o, c.label); });
        if (!its.length) return;
        if (q) { its.forEach(function (it) { if ([it.name, it.sub, it.grp].join(' ').toLowerCase().indexOf(ls) !== -1) f.push(it); }); return; }
        f.push({ k: 'h', label: c.label, count: its.length });
        if (!col.has(c.label)) f.push.apply(f, its);
      } else if (c.tagName === 'OPTION' && !c.hidden && !q) f.push(itemOf(c, ''));
    });
    return f;
  }
  function render() {
    if (!flat.length) { lst.innerHTML = '<div class="scmb-empty">ไม่พบรายชื่อ' + (q ? '<br><small>' + window.esc(q) + '</small>' : '') + '</div>'; return; }
    lst.innerHTML = flat.map(function (it, idx) {
      if (it.k === 'h') {
        return '<div class="scmb-h" data-g="' + window.esc(it.label) + '"><span>🏢 ' + window.esc(it.label) + '</span><small>(' + it.count + ')</small>'
          + '<b>' + (col.has(it.label) ? '▶' : '▼') + '</b></div>';
      }
      var on = it.i === sel.selectedIndex;
      return '<div class="scmb-i' + (idx === fi ? ' kb' : '') + (on ? ' on' : '') + (it.off ? ' off' : '') + (it.v ? '' : ' none') + '" data-idx="' + idx + '">'
        + (on ? '<i>✓</i>' : '') + '<span class="scmb-n">' + hi(it.name, q) + '</span>'
        + (q && it.grp ? '<span class="scmb-s">' + hi(it.grp, q) + '</span>' : it.sub ? '<span class="scmb-s">' + hi(it.sub, q) + '</span>' : '')
        + '</div>';
    }).join('');
  }
  function place() {
    if (!sel || !document.body.contains(sel)) { close(); return; }
    var r = sel.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
    inp.style.left = r.left + 'px'; inp.style.top = r.top + 'px'; inp.style.width = r.width + 'px'; inp.style.height = r.height + 'px';
    window.placeDropdown(sel, root.querySelector('.scmb-drop'), lst, 320, 260);
  }
  function scrollToSel() { var el = lst.querySelector('.scmb-i.on'); lst.scrollTop = el ? Math.max(0, el.offsetTop - 80) : 0; }

  function open(s, initial) {
    close();
    sel = s; q = initial || ''; fi = -1; col = new Set();
    root = document.createElement('div');
    root.className = 'scmb';
    root.innerHTML = '<input type="text" class="scmb-inp ' + window.esc(s.className) + '" placeholder="พิมพ์ค้นหาชื่อ / ชื่อเล่น / แผนก..." autocomplete="off" spellcheck="false">'
      + '<div class="scmb-drop"><div class="scmb-list"></div></div>';
    document.body.appendChild(root);
    inp = root.querySelector('.scmb-inp'); lst = root.querySelector('.scmb-list');
    inp.value = q;
    flat = build(); if (q) fi = firstItem(); render(); place();
    if (!q) scrollToSel();
    inp.focus();
    lst.addEventListener('mousedown', function (e) { e.preventDefault(); }); // คลิกในรายการไม่ให้ช่องค้นหาเสีย focus
    lst.addEventListener('click', function (e) {
      var h = e.target.closest('.scmb-h'), it = e.target.closest('.scmb-i');
      if (h) { var g = h.getAttribute('data-g'); if (col.has(g)) col.delete(g); else col.add(g); flat = build(); fi = -1; render(); }
      else if (it) pick(flat[+it.getAttribute('data-idx')]);
    });
    lst.addEventListener('mousemove', function (e) { var it = e.target.closest('.scmb-i'); if (it && +it.getAttribute('data-idx') !== fi) { fi = +it.getAttribute('data-idx'); render(); } });
    inp.addEventListener('input', function () { clearTimeout(dt); dt = setTimeout(function () { q = inp.value.trim(); flat = build(); fi = q ? firstItem() : -1; lst.scrollTop = 0; render(); }, 120); });
    inp.addEventListener('keydown', onKey);
    inp.addEventListener('blur', function () { setTimeout(function () { if (root && document.activeElement !== inp) close(); }, 0); });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }
  function close() {
    if (!root) return;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    root.remove(); root = inp = lst = null;
    var s = sel; sel = null;
    return s;
  }
  function firstItem() { for (var i = 0; i < flat.length; i++) if (flat[i].k === 'i' && !flat[i].off) return i; return -1; }
  function pick(it) {
    if (!it || it.k !== 'i' || it.off) return;
    var s = sel, changed = s.selectedIndex !== it.i;
    s.selectedIndex = it.i;
    close(); s.focus();
    if (changed) { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function onKey(e) {
    var iis = flat.map(function (it, i) { return it.k === 'i' && !it.off ? i : -1; }).filter(function (i) { return i >= 0; });
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var s = close(); if (s) s.focus(); }
    else if (e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); var c = iis.indexOf(fi); fi = c < 0 ? iis[0] : (iis[c + 1] !== undefined ? iis[c + 1] : iis[c]); render(); keepVisible(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); var c2 = iis.indexOf(fi); fi = c2 <= 0 ? iis[0] : iis[c2 - 1]; render(); keepVisible(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[fi]); }
  }
  function keepVisible() { var el = lst.querySelector('.scmb-i.kb'); if (el) el.scrollIntoView({ block: 'nearest' }); }

  // กดที่ select → เปิดแทนรายการของระบบ (mousedown กัน popup เดิม · touchend สำหรับมือถือ)
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !eligible(e.target.closest && e.target.closest('select'))) return;
    e.preventDefault();
    open(e.target.closest('select'));
  }, true);
  document.addEventListener('touchend', function (e) {
    var s = e.target.closest && e.target.closest('select');
    if (!eligible(s)) return;
    e.preventDefault();
    open(s);
  }, { capture: true, passive: false });
  document.addEventListener('keydown', function (e) {
    var s = e.target;
    if (!eligible(s) || e.ctrlKey || e.metaKey) return;
    var printable = e.key.length === 1 && e.key !== ' ';
    if (printable || e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'F4') {
      e.preventDefault();
      open(s, printable ? e.key : '');
    }
  }, true);
  document.addEventListener('mousedown', function (e) { if (root && !root.contains(e.target) && !(sel && sel.contains(e.target))) close(); });
})();
