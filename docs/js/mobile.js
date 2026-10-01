/* ================================================================
   mobile.js  —  Mobile & Dark Mode Utilities
   BMS Backoffice Management System
================================================================ */

// ── Dark Mode ───────────────────────────────────────────────
(function initDarkMode() {
  var saved = localStorage.getItem('_bms_dark');
  var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = saved === 'dark' || (saved === null && sysDark);
  if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  else if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  updateDMIcon(isDark);
})();

function updateDMIcon(isDark) {
  var btn = document.getElementById('dm-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

window.toggleDarkMode = function () {
  var cur = document.documentElement.getAttribute('data-theme');
  var isDark = cur === 'dark' ||
    (cur !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('_bms_dark', 'light');
    updateDMIcon(false);
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('_bms_dark', 'dark');
    updateDMIcon(true);
  }
};

// Sync when system preference changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('_bms_dark')) {
      document.documentElement.removeAttribute('data-theme');
      updateDMIcon(e.matches);
    }
  });
}

// ── Table → Card View (mobile) ──────────────────────────────
window.initMobileTable = function (scope) {
  if (window.innerWidth > 768) return;
  var tables = (scope || document).querySelectorAll('.dtable-inner table, .m-tbl');
  tables.forEach(function (table) {
    var headers = [];
    table.querySelectorAll('thead th').forEach(function (th) {
      headers.push(th.textContent.trim());
    });
    if (!headers.length) return;
    // Always re-apply data-label to all rows (handles re-renders)
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      tds.forEach(function (td, i) {
        if (headers[i]) td.setAttribute('data-label', headers[i]);
        mCardCell(td, tr);
      });
    });
    table.classList.add('m-card-table');
  });
};

// ── การ์ดตารางบนมือถือ: จัดความกว้างตามความยาวข้อความ (เดิมทุกช่อง 2 คอลัมน์เท่ากัน ข้อความยาวตกบรรทัด 3–5 บรรทัด)
// ช่องยาว (> 22 ตัวอักษร / มีแถบความคืบหน้า) = เต็มแถว · ช่องสั้น = ครึ่งแถว · ข้อความยาวมาก (> 90) ตัดที่ 3 บรรทัด + "…"
// (แถวที่กดเปิดรายละเอียดได้อยู่แล้วไม่ต้องกางในการ์ด — แถวที่กดไม่ได้ แตะข้อความเพื่อกาง/พับ) ──
var M_WIDE = 22, M_CLAMP = 90;
function mCardCell(td, tr) {
  if (td.hasAttribute('colspan')) return;
  var txt = (td.textContent || '').replace(/\s+/g, ' ').trim();
  td.classList.toggle('m-wide', txt.length > M_WIDE || !!td.querySelector('.pbar, .aio-mini-stack'));
  if (txt.length <= M_CLAMP || td.querySelector('.m-clampbox') || td.querySelector('button, input, select, textarea, a')) return;
  var box = document.createElement('div');
  box.className = 'm-clampbox';
  while (td.firstChild) box.appendChild(td.firstChild);
  td.appendChild(box);
  if (!tr.hasAttribute('onclick')) {
    box.classList.add('m-clamp-tap');
    box.addEventListener('click', function (e) { e.stopPropagation(); box.classList.toggle('open'); });
  }
}

// ── ปุ่มแถบเครื่องมือบนจอเล็ก: ย่อเหลือไอคอน (อีโมจินำหน้า) ข้อความเก็บใน .btn-lbl (ซ่อนที่ ≤480px ใน responsive.css)
// + title ไว้ดูเมื่อกดค้าง · ใช้กับปุ่มใน .toolbar และปุ่มที่ใส่ class .m-icon-btn เอง — ปุ่มที่ไม่มีอีโมจินำหน้าไม่แตะ ──
var M_ICON_RE = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic})*)\s+(\S[\s\S]*)$/u;
window.compactToolbarButtons = function (scope) {
  (scope || document).querySelectorAll('.toolbar .btn, .m-icon-btn').forEach(function (btn) {
    if (btn.children.length) return; // มี element ข้างในแล้ว (ย่อแล้ว หรือมี badge) — ไม่แตะ
    var m = (btn.textContent || '').trim().match(M_ICON_RE);
    if (!m) return;
    if (!btn.title) btn.title = m[2];
    btn.textContent = m[1];
    var lbl = document.createElement('span');
    lbl.className = 'btn-lbl';
    lbl.textContent = m[2];
    btn.appendChild(lbl);
  });
};

// ── Dropdown บนมือถือ: รายการตัวเลือกวาดเองแทนของ browser ─────────────────
// รายการที่ browser เปิดให้ (native select popup) ตกแต่งด้วย CSS ไม่ได้ ตัวอักษรใหญ่ไม่เข้ากับส่วนอื่น (เห็นชัดใน
// Chrome โหมดจำลองมือถือ) → บนจอ ≤768px เปิดรายการของเราเองแทน ใช้ได้กับ <select> ทุกตัว (ไม่มี multiple ในระบบ)
// เลือกแล้วตั้งค่า + ยิง event "change" ให้ onchange เดิมทำงานตามปกติ ไม่ต้องแก้หน้าไหนเลย ──
(function initMobileSelect() {
  var panel = null, curSel = null, touchY = null;
  function isMobile() { return window.innerWidth <= 768; }
  function close() {
    if (panel) panel.remove();
    panel = null; curSel = null;
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', close);
  }
  // แตะนอกรายการ = ปิด · แตะช่องเดิมซ้ำ ปล่อยให้ mousedown/touchend สลับเปิด-ปิดเอง (กันปิดแล้วเปิดใหม่ทันที)
  function outside(e) { if (panel && !panel.contains(e.target) && !(curSel && curSel.contains(e.target))) close(); }
  function open(sel) {
    close();
    curSel = sel;
    panel = document.createElement('div');
    panel.className = 'm-select-panel';
    panel.setAttribute('role', 'listbox');
    Array.prototype.forEach.call(sel.children, function (node) {
      if (node.tagName === 'OPTGROUP') {
        var h = document.createElement('div'); h.className = 'm-select-group'; h.textContent = node.label; panel.appendChild(h);
        Array.prototype.forEach.call(node.children, addOpt);
      } else if (node.tagName === 'OPTION') addOpt(node);
    });
    function addOpt(o) {
      if (o.hidden) return;
      var it = document.createElement('div');
      it.className = 'm-select-opt' + (o.selected ? ' on' : '') + (o.disabled ? ' off' : '');
      it.setAttribute('role', 'option');
      it.textContent = o.textContent;
      if (!o.disabled) it.addEventListener('click', function () {
        var changed = sel.value !== o.value;
        sel.value = o.value;
        close();
        if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      panel.appendChild(it);
    }
    document.body.appendChild(panel);
    // วางใต้ช่อง ถ้าที่ข้างล่างไม่พอ (เช่น ปุ่มท้าย popup) ให้ขึ้นข้างบน
    var r = sel.getBoundingClientRect(), vw = window.innerWidth, vv = window.visualViewport;
    var vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    var w = Math.min(Math.max(r.width, 200), vw - 16);
    panel.style.width = w + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    var below = vh - r.bottom - 12, above = r.top - 12;
    if (below >= 180 || below >= above) { panel.style.top = (r.bottom + 4) + 'px'; panel.style.maxHeight = Math.max(96, below) + 'px'; }
    else { panel.style.bottom = (window.innerHeight - r.top + 4) + 'px'; panel.style.maxHeight = Math.max(96, above) + 'px'; }
    var on = panel.querySelector('.m-select-opt.on');
    if (on) panel.scrollTop = on.offsetTop - panel.clientHeight / 2 + on.offsetHeight / 2;
    setTimeout(function () {
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', close);
    }, 0);
  }
  function target(e) {
    var sel = e.target && e.target.closest ? e.target.closest('select') : null;
    return sel && !sel.disabled && !sel.multiple && isMobile() ? sel : null;
  }
  // เมาส์ (รวม Chrome โหมดจำลองมือถือ): กัน native popup ที่ mousedown
  document.addEventListener('mousedown', function (e) {
    var sel = target(e); if (!sel) return;
    e.preventDefault();
    if (curSel === sel) close(); else open(sel);
  }, true);
  // จอสัมผัส: เปิดตอนยกนิ้ว (ถ้าไม่ได้เลื่อนหน้าจอ) และกัน native picker ที่ touchend
  document.addEventListener('touchstart', function (e) { touchY = target(e) ? e.touches[0].clientY : null; }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    var sel = target(e); if (!sel || touchY === null) return;
    var moved = Math.abs(e.changedTouches[0].clientY - touchY) > 10; touchY = null;
    if (moved) return;
    e.preventDefault();
    if (curSel === sel) close(); else open(sel);
  }, { capture: true, passive: false });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel) close(); });
  // หน้าจอเลื่อน/เปลี่ยน view → ปิดรายการ (ตำแหน่งเดิมไม่ตรงช่องแล้ว)
  document.addEventListener('scroll', function (e) { if (panel && !panel.contains(e.target)) close(); }, true);
})();

// Re-init on content change (MutationObserver)
var _cardObs = null;
function startTableObserver() {
  if (!window.MutationObserver) return;
  if (_cardObs) _cardObs.disconnect();
  _cardObs = new MutationObserver(function (mutations) {
    for (var m of mutations) {
      if (m.addedNodes.length > 0) {
        clearTimeout(window._cardInitTimer);
        window._cardInitTimer = setTimeout(function () {
          window.initMobileTable();
          window.compactToolbarButtons();
        }, 200);
        break;
      }
    }
  });
  var content = document.getElementById('content');
  if (content) _cardObs.observe(content, { childList: true, subtree: true });
}

// ── Bottom Navigation ──────────────────────────────────────
function updateBottomNav(viewId) {
  document.querySelectorAll('.bottom-nav-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

// Patch goView to also sync bottom-nav indicator (router.js defines goView first)
function patchGoView() {
  if (!window.goView || window.goView._patched) return;
  var orig = window.goView;
  window.goView = function (viewId, btn) {
    orig(viewId, btn);
    updateBottomNav(viewId);
  };
  window.goView._patched = true;
}

// ── Bottom nav badge sync ───────────────────────────────────
function syncBottomBadges() {
  var advNb = document.getElementById('adv-nb');
  var bAdvNb = document.getElementById('bnav-adv-badge');
  if (advNb && bAdvNb) {
    bAdvNb.textContent = advNb.textContent;
    bAdvNb.style.display = advNb.style.display;
  }
}

// ── Resize handler ─────────────────────────────────────────
window.addEventListener('resize', function () {
  if (window.innerWidth <= 768) {
    window.initMobileTable();
  }
});

// ── Init on DOMContentLoaded ───────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  startTableObserver();
  patchGoView();
});

// ── Init after data loads (called from auth-sb.js) ─────────
window._mobileInit = function () {
  patchGoView();
  window.initMobileTable();
  window.compactToolbarButtons();
  syncBottomBadges();
  // Re-sync every 3s for badge updates
  setInterval(syncBottomBadges, 3000);
};
