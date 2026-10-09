/**
 * icons.util.js — one icon vocabulary for the whole backoffice UI (Backoffice + ระบบอบรม).
 * โค้ดเรียกไอคอนด้วยชื่อ Tabler (appIcon('folder') / <i class="ti ti-folder">) แต่แสดงผลเป็นอีโมจิสี —
 * ชื่อที่ไม่มีใน TI_EMOJI (ปุ่มควบคุม เช่น ปิด/ลูกศร/เมนู/ตัวหมุนโหลด) ยังเป็นเส้น Tabler
 */
(function () {
  'use strict';

  var MODULE_ICONS = {
    overview: 'chart-bar',
    kanban: 'layout-kanban',
    projects: 'folder',
    advance: 'credit-card',
    expense_form: 'receipt-2',
    lodging: 'bed',
    impl_tracker: 'timeline-event',
    all_issues: 'alert-hexagon',
    training: 'school',
    timesheet: 'clock-hour-4',
    cost: 'receipt',
    budget: 'wallet',
    workload: 'chart-arrows-vertical',
    availability: 'users-group',
    calendar: 'calendar-event',
    holiday: 'calendar-star',
    leave: 'calendar-off',
    worklog: 'notes',
    targets: 'target-arrow',
    helpdesk: 'headset',
    assist: 'messages',
    server_request: 'server',
    hospital: 'building-hospital',
    contract: 'file-description',
    admin: 'settings',
    pwreset: 'key'
  };

  var MODULE_TONES = {
    overview:     { color:'#2563eb', bg:'rgba(37,99,235,.14)',  end:'#60a5fa', shadow:'rgba(37,99,235,.25)' },
    kanban:       { color:'#7c3aed', bg:'rgba(124,58,237,.14)', end:'#a78bfa', shadow:'rgba(124,58,237,.25)' },
    projects:     { color:'#d97706', bg:'rgba(217,119,6,.15)',  end:'#f59e0b', shadow:'rgba(217,119,6,.25)' },
    advance:      { color:'#4f46e5', bg:'rgba(79,70,229,.14)',  end:'#818cf8', shadow:'rgba(79,70,229,.25)' },
    expense_form: { color:'#7c3aed', bg:'rgba(124,58,237,.14)', end:'#c084fc', shadow:'rgba(124,58,237,.25)' },
    lodging:      { color:'#db2777', bg:'rgba(219,39,119,.14)', end:'#f472b6', shadow:'rgba(219,39,119,.25)' },
    impl_tracker: { color:'#ea580c', bg:'rgba(234,88,12,.14)',  end:'#fb923c', shadow:'rgba(234,88,12,.25)' },
    all_issues:   { color:'#dc2626', bg:'rgba(220,38,38,.13)',  end:'#f87171', shadow:'rgba(220,38,38,.24)' },
    training:     { color:'#0891b2', bg:'rgba(8,145,178,.14)',  end:'#22d3ee', shadow:'rgba(8,145,178,.25)' },
    timesheet:    { color:'#0f766e', bg:'rgba(15,118,110,.14)', end:'#2dd4bf', shadow:'rgba(15,118,110,.25)' },
    cost:         { color:'#059669', bg:'rgba(5,150,105,.14)',  end:'#34d399', shadow:'rgba(5,150,105,.25)' },
    budget:       { color:'#16a34a', bg:'rgba(22,163,74,.14)',  end:'#4ade80', shadow:'rgba(22,163,74,.25)' },
    workload:     { color:'#9333ea', bg:'rgba(147,51,234,.14)', end:'#c084fc', shadow:'rgba(147,51,234,.25)' },
    availability: { color:'#7c3aed', bg:'rgba(124,58,237,.14)', end:'#a78bfa', shadow:'rgba(124,58,237,.25)' },
    calendar:     { color:'#0284c7', bg:'rgba(2,132,199,.14)',  end:'#38bdf8', shadow:'rgba(2,132,199,.25)' },
    holiday:      { color:'#ca8a04', bg:'rgba(202,138,4,.15)',  end:'#facc15', shadow:'rgba(202,138,4,.25)' },
    leave:        { color:'#e11d48', bg:'rgba(225,29,72,.13)',  end:'#fb7185', shadow:'rgba(225,29,72,.24)' },
    worklog:      { color:'#c2410c', bg:'rgba(194,65,12,.14)',  end:'#fb923c', shadow:'rgba(194,65,12,.25)' },
    targets:      { color:'#c026d3', bg:'rgba(192,38,211,.13)', end:'#e879f9', shadow:'rgba(192,38,211,.24)' },
    helpdesk:     { color:'#0e7490', bg:'rgba(14,116,144,.14)', end:'#22d3ee', shadow:'rgba(14,116,144,.25)' },
    assist:       { color:'#8b5cf6', bg:'rgba(139,92,246,.14)', end:'#c084fc', shadow:'rgba(139,92,246,.25)' },
    server_request: { color:'#0891b2', bg:'rgba(8,145,178,.14)', end:'#22d3ee', shadow:'rgba(8,145,178,.25)' },
    hospital:     { color:'#0369a1', bg:'rgba(3,105,161,.14)',  end:'#38bdf8', shadow:'rgba(3,105,161,.25)' },
    contract:     { color:'#475569', bg:'rgba(71,85,105,.14)',  end:'#94a3b8', shadow:'rgba(71,85,105,.25)' },
    admin:        { color:'#334155', bg:'rgba(51,65,85,.14)',   end:'#64748b', shadow:'rgba(51,65,85,.25)' },
    pwreset:      { color:'#d97706', bg:'rgba(217,119,6,.15)',  end:'#f59e0b', shadow:'rgba(217,119,6,.25)' },
    more:         { color:'#64748b', bg:'rgba(100,116,139,.14)',end:'#94a3b8', shadow:'rgba(100,116,139,.24)' }
  };

  // ชื่อไอคอน Tabler → อีโมจิสี (เมนูหลักตรงกับแถบซ้ายเดิม) · ชื่อที่ไม่อยู่ในนี้ = คงเป็นเส้น Tabler
  var TI_EMOJI = {
    // เมนู / โมดูล
    'chart-bar':'📊', 'layout-kanban':'🗂️', 'folder':'📁', 'credit-card':'💳', 'receipt-2':'🧾', 'receipt':'💵',
    'bed':'🏨', 'timeline-event':'🛠️', 'alert-hexagon':'🩹', 'school':'🎓', 'clock-hour-4':'⏱️', 'wallet':'💰',
    'chart-arrows-vertical':'🏢', 'users-group':'👥', 'calendar-event':'📅', 'calendar-star':'🎌', 'calendar-off':'🏖️',
    'notes':'📝', 'target-arrow':'🎯', 'headset':'🎧', 'messages':'💬', 'server':'🖥️', 'building-hospital':'🏥',
    'file-description':'📄', 'settings':'⚙️', 'key':'🔑', 'layout-grid':'🧩', 'dashboard':'📊',
    // กราฟ / รายงาน
    'chart-line':'📈', 'trending-up':'📈', 'chart-pie':'🥧', 'chart-donut':'🍩', 'chart-donut-3':'🍩', 'chart-dots':'📉',
    'chart-bar-popular':'📊', 'chart-radar':'🕸️', 'table-heat-map':'🌡️', 'presentation':'📽️', 'count':'🔢', 'list-numbers':'🔢',
    // เอกสาร / ไฟล์
    'file-text':'📃', 'file-spreadsheet':'📗', 'file-import':'📥', 'file-export':'📤', 'table-import':'📥',
    'database-export':'📤', 'database-plus':'🗄️', 'database':'🗄️', 'download':'⬇️', 'upload':'⬆️', 'file-certificate':'📜',
    'clipboard-list':'📋', 'clipboard-check':'📋', 'clipboard-off':'📋', 'list-details':'📋', 'list':'📋', 'list-check':'☑️',
    'books':'📚', 'book':'📘', 'bookmark':'🔖', 'paperclip':'📎', 'link':'🔗', 'external-link':'↗️', 'copy':'📑',
    'printer':'🖨️', 'photo':'🖼️', 'photo-down':'🖼️', 'camera':'📷', 'camera-off':'📷',
    'signature':'✍️', 'text-caption':'🔤', 'box':'📦', 'category':'🏷️', 'category-plus':'🏷️', 'tag':'🏷️', 'address-book':'📇',
    // การกระทำ
    'plus':'➕', 'circle-plus':'➕', 'edit':'✏️', 'pencil':'✏️', 'pencil-plus':'✏️', 'pencil-check':'✏️', 'edit-off':'✏️',
    'trash':'🗑️', 'trash-x':'🗑️', 'device-floppy':'💾', 'send':'📤', 'refresh':'🔄', 'restore':'♻️', 'repeat':'🔁',
    'arrow-back-up':'↩️', 'search':'🔍', 'search-off':'🔍', 'user-search':'🔍', 'calendar-search':'🔍', 'filter-off':'🧹',
    'eye':'👁️', 'eye-off':'🙈', 'eye-check':'👀', 'sparkles':'✨', 'wand':'🪄', 'bulb':'💡', 'bolt':'⚡',
    'login':'🔐', 'git-merge':'🔀', 'arrows-shuffle':'🔀', 'adjustments':'🎛️', 'palette':'🎨', 'player-play':'▶️',
    'keyboard':'⌨️', 'volume':'🔊', 'brand-line':'💚', 'thumb-up':'👍', 'thumb-down':'👎', 'heart-filled':'❤️',
    'heart-handshake':'🤝', 'mood-sad':'😢', 'mood-empty':'😐', 'walk':'🚶', 'armchair':'🪑', 'environment':'🌿',
    // สถานะ
    'check':'✅', 'circle-check':'✅', 'circle-check-filled':'✅', 'check-all':'✅', 'checkbox':'☑️', 'square-check':'☑️',
    'alert-triangle':'⚠️', 'alert-circle':'❗', 'info-circle':'ℹ️', 'help-circle':'❓', 'hourglass':'⏳',
    'clock':'🕐', 'clock-check':'🕐', 'clock-exclamation':'⏰', 'history':'🕘', 'wifi-off':'📵', 'message-off':'🔕',
    'bell':'🔔', 'bell-exclamation':'🔔', 'bell-off':'🔕', 'star':'⭐', 'award':'🏅', 'trophy':'🏆', 'certificate':'📜',
    'lock':'🔒', 'shield-lock':'🔐', 'shield-check':'🛡️', 'shield-x':'⛔', 'flame':'🔥', 'urgent':'🚨',
    // วันเวลา
    'calendar':'📆', 'calendar-plus':'📆', 'calendar-x':'📆', 'calendar-check':'📆', 'calendar-time':'📆',
    'calendar-stats':'🗓️', 'calendar-month':'🗓️',
    // คน / องค์กร / สถานที่
    'user':'👤', 'users':'👥', 'users-plus':'👥', 'users-minus':'👥', 'user-check':'👤', 'user-plus':'👤', 'user-x':'👤',
    'user-question':'👤', 'user-star':'👨‍💼', 'id-badge':'🪪', 'id-badge-2':'🪪', 'briefcase':'💼', 'building':'🏢',
    'building-community':'🏘️', 'building-warehouse':'🏭', 'building-off':'🏢', 'map-pin':'📍', 'map-2':'🗺️',
    'mail':'✉️', 'mail-forward':'📨', 'mail-check':'📨', 'mail-off':'✉️', 'message-2':'💬', 'ticket':'🎫',
    'tool':'🔧', 'tools':'🛠️', 'heart-rate-monitor':'🩺', 'moon':'🌙', 'sun':'☀️'
  };

  function cleanName(name) {
    return String(name || 'circle').replace(/^ti(?:\s+ti-|-)/, '').replace(/[^a-z0-9-]/gi, '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  // ชื่อที่เป็นอีโมจิอยู่แล้ว (เช่น icon ใน config) ใช้ตรงๆ
  function emojiFor(name) {
    var raw = String(name || '');
    if (/[^\x00-\x7f]/.test(raw)) return raw;
    return TI_EMOJI[cleanName(raw)] || '';
  }

  window.moduleIcon = function (moduleId) {
    return MODULE_ICONS[moduleId] || 'layout-grid';
  };
  window.applyModuleTone = function (el, moduleId) {
    if (!el) return;
    var tone = MODULE_TONES[moduleId] || MODULE_TONES.more;
    el.setAttribute('data-icon-tone', moduleId || 'more');
    el.style.setProperty('--icon-color', tone.color);
    el.style.setProperty('--icon-bg', tone.bg);
    el.style.setProperty('--icon-end', tone.end);
    el.style.setProperty('--icon-shadow', tone.shadow);
  };
  window.appIcon = function (name, className, label) {
    var emo = emojiFor(name), extra = className ? ' ' + className : '';
    return (emo
        ? '<i class="emo-ic' + extra + '" aria-hidden="true">' + emo + '</i>'
        : '<i class="ti ti-' + cleanName(name) + extra + '" aria-hidden="true"></i>')
      + (label ? '<span class="sr-only">' + esc(label) + '</span>' : '');
  };

  // <i class="ti ti-xxx ..."> ใน HTML/เทมเพลตของโมดูล → <i class="emo-ic"> อีโมจิ (คงแท็ก i ไว้ให้ CSS เดิมที่เล็ง "> i" ยังใช้ได้)
  // ใส่ class="no-icon" ที่ตัวแม่เพื่อคงเส้น Tabler ไว้
  var TI_RE = /(?:^|\s)ti-([a-z0-9-]+)/;
  function upgradeEl(el) {
    var cls = el.getAttribute('class') || '', m = cls.match(TI_RE);
    var emo = m && TI_EMOJI[m[1]];
    if (!emo || !el.parentNode || el.closest('.no-icon')) return;
    var ic = document.createElement('i');
    ic.className = ('emo-ic ' + cls.replace(/(?:^|\s)ti(?:-[a-z0-9-]+)?(?=\s|$)/g, ' ')).replace(/\s+/g, ' ').trim();
    ic.setAttribute('aria-hidden', 'true');
    if (el.id) ic.id = el.id;
    if (el.title) ic.title = el.title;
    var st = el.getAttribute('style');
    if (st) ic.setAttribute('style', st);
    ic.textContent = emo;
    el.parentNode.replaceChild(ic, el);
  }
  function upgradeTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches('.ti')) return upgradeEl(root);
    root.querySelectorAll('.ti').forEach(upgradeEl);
  }

  // ระบบอบรมใส่ script หลัง DOMContentLoaded แล้ว → เริ่มทันที
  function init() {
    var wrap = document.body;
    document.querySelectorAll('.nav-btn').forEach(function (nav) {
      var call = nav.getAttribute('onclick') || '';
      var match = call.match(/goView\(['"]([^'"]+)/);
      if (match) window.applyModuleTone(nav, match[1]);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(function (nav) {
      window.applyModuleTone(nav, nav.getAttribute('data-view') || 'more');
    });
    window.applyModuleTone(document.getElementById('tp-title'), 'overview');
    upgradeTree(wrap);
    // โมดูลบางตัวสลับไอคอนด้วยการเปลี่ยน className (เช่น ti-eye ↔ ti-eye-off) → ดู class ด้วย
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') upgradeTree(mutation.target);
        else mutation.addedNodes.forEach(upgradeTree);
      });
    }).observe(wrap, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
