/**
 * string.util.js — String & ID Utilities
 */
(function () {

  // ── Escape HTML (prevent XSS) ──
  window.esc = function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  // ── Generate Short Random ID ──
  window.uid = function () {
    return Math.random().toString(36).slice(2, 9);
  };

  // ── Role Label ──
  window.roleLabel = function (r) {
    return r === 'pm' ? 'DM/PM' : r === 'viewer' ? 'Viewer' : r ? r.toUpperCase() : '';
  };

  // ── Lookup Helpers (cached lookups against global stores) ──
  window.gS  = function (id) { return window.STAGES.find(function (s) { return s.id === id; }) || { label:id, color:'#9ba3b8' }; };
  window.gT  = function (id) { return window.PTYPES.find(function (t) { return t.id === id; }) || { label:id, color:'#9ba3b8' }; };
  window.gG  = function (id) { return window.PGROUPS.find(function (g) { return g.id === id; }) || null; };
  window.gSt = function (id) { return window.STAFF.find(function (s) { return s.id === id; }) || { name:'?', dept:'' }; };
  // ── เทียบชื่อคนโดยไม่สนคำนำหน้า/ช่องว่าง — ข้อมูลพนักงานเปลี่ยนเป็น "คำนำหน้า+ชื่อ+นามสกุล" แล้ว แต่ข้อมูลเก่า
  // (เช่น เจ้าของไซต์/ผู้ติดตั้งในโครงการ) เก็บแค่ "ชื่อ นามสกุล" — เทียบตรงตัวจะหาไม่เจอ ──
  window.nameKey  = function (n) { return String(n || '').replace(/^\s*(นาย|นางสาว|นาง|น\.ส\.)\s*/, '').replace(/\s+/g, ' ').trim(); };
  window.sameName = function (a, b) { var k = window.nameKey(a); return !!k && k === window.nameKey(b); };
  // ── ช่องที่เก็บ "คน" เก็บเป็นรหัสพนักงาน (staff.id) ทั้งหมด → หาพนักงาน/ชื่อปัจจุบันจากรหัส
  // หาไม่เจอ (พนักงานถูกลบ) → null / '' ──
  window.staffByRef = function (id) {
    if (!id) return null;
    return (window.STAFF || []).find(function (s) { return s.id === id; }) || null;
  };
  window.staffNameByRef = function (id) { var s = window.staffByRef(id); return s ? s.name : ''; };
  // ชื่อเล่น (ไม่มีชื่อเล่น → ชื่อเต็ม) — สำหรับจุดที่แสดงชื่อเล่น เช่น ผู้รับผิดชอบงานใน Impl Tracker
  window.staffNickByRef = function (id) { var s = window.staffByRef(id); return s ? (s.nickname || s.name) : ''; };
  // ── ชื่อที่พิมพ์/นำเข้าจากไฟล์หรือ AI → พนักงาน (ใช้ตอนรับข้อมูลเข้าเท่านั้น ข้อมูลที่บันทึกเป็นรหัสเสมอ)
  // ชื่อเต็มไม่สนคำนำหน้า (sameName) หรือชื่อเล่นที่ไม่ซ้ำกับคนอื่น · หาไม่เจอ → null ──
  window.staffByName = function (text) {
    text = String(text || '').trim();
    if (!text) return null;
    var list = window.STAFF || [];
    var byNick = list.filter(function (s) { return s.nickname && s.nickname === text; });
    return list.find(function (s) { return window.sameName(s.name, text); }) || (byNick.length === 1 ? byNick[0] : null);
  };

  // ── ผู้ใช้ระบบ (users.id) — ช่อง "ใครทำ" (ผู้ติ๊ก checklist / ผู้เขียนความเห็น / ผู้แนบไฟล์ / ผู้อนุมัติ ฯลฯ)
  // เก็บเป็นรหัสผู้ใช้ · แสดงชื่อพนักงานที่ผูกไว้ ไม่ผูก → ชื่อผู้ใช้ · หาไม่เจอ (ผู้ใช้ถูกลบ) → '' ──
  window.meId = function () { return (window.cu && window.cu.id) || ''; };
  window.userNameById = function (id) {
    if (!id) return '';
    var u = (window.USERS || []).find(function (x) { return x.id === id; });
    if (!u) return '';
    var s = u.staffId && window.staffByRef(u.staffId);
    return s ? s.name : (u.name || u.username || '');
  };

  // ── ตำแหน่ง/แผนกของพนักงาน — staff.position / staff.department เก็บเป็นรหัส (positions.id / departments.id) ──
  window.positionById = function (id) { return id ? (window.POSITIONS || []).find(function (p) { return p.id === id; }) || null : null; };
  window.positionLabel = function (id) { var p = window.positionById(id); return p ? p.label : ''; };
  window.deptLabel = function (id) {
    var d = id && (window.DEPT_LIST || []).find(function (x) { return x.id === id; });
    return d ? d.label : '';
  };
  // ── ลำดับตำแหน่ง (positions.rank: 1 = สูงสุด, ไม่กำหนด = 99) — ใช้เรียงรายชื่อพนักงานจากตำแหน่งสูงสุดก่อน
  // ตำแหน่งเท่ากัน → เรียงตามชื่อ ──
  window.positionRank = function (positionId) { var p = window.positionById(positionId); return p ? p.rank : 99; };
  window.sortPositionsByRank = function (a, b) { return (a.rank || 99) - (b.rank || 99) || (a.label || '').localeCompare(b.label || '', 'th'); };
  window.sortStaffByRank = function (a, b) {
    return window.positionRank(a.positionId) - window.positionRank(b.positionId) || (a.name || '').localeCompare(b.name || '', 'th');
  };
  // ── ตัวเลือกรายชื่อพนักงาน: กลุ่มแผนก (ตามตัวอักษร, ไม่ระบุแผนกไว้ท้าย) → ระดับตำแหน่ง → ชื่อ ──
  window.sortStaffByDeptRank = function (a, b) {
    var da = a.dept || '', db = b.dept || '';
    if (da !== db) return !da ? 1 : !db ? -1 : da.localeCompare(db, 'th');
    return window.sortStaffByRank(a, b);
  };
  // <option> แบ่งกลุ่มด้วย <optgroup data-staff label="แผนก"> · withNick → "ชื่อ (ชื่อเล่น)"
  // data-staff = ให้ staff-combo.util.js เปลี่ยน select นี้เป็นช่องพิมพ์ค้นหาได้ · data-sub = ชื่อเล่น (แสดงด้านขวา/ใช้ค้นหา)
  window.staffOptionsGrouped = function (list, selectedId, withNick) {
    var html = '', cur = null;
    list.slice().sort(window.sortStaffByDeptRank).forEach(function (s) {
      var d = s.dept || 'ไม่ระบุแผนก';
      if (d !== cur) { html += (cur !== null ? '</optgroup>' : '') + '<optgroup data-staff label="' + window.esc(d) + '">'; cur = d; }
      html += '<option value="' + window.esc(s.id) + '"' + (s.nickname ? ' data-sub="' + window.esc(s.nickname) + '"' : '') + (selectedId && s.id === selectedId ? ' selected' : '') + '>'
        + window.esc(s.name) + (withNick && s.nickname ? ' (' + window.esc(s.nickname) + ')' : '') + '</option>';
    });
    return html + (cur !== null ? '</optgroup>' : '');
  };
  window.gC  = function (i)  { return window.PCOLS[i % window.PCOLS.length]; };
  window.avC = function (i)  { return window.AVBG[i % window.AVBG.length]; };

  // ── Team Member helpers ──
  window._vtMember = function (team, staffId, fallbackStart, fallbackEnd) {
    if (!team || !team.length) return null;
    if (typeof team[0] === 'object') {
      var found = team.find(function (t) { return t.sid === staffId; });
      if (!found) return null;
      return { sid:found.sid, s:found.s||fallbackStart||'', e:found.e||fallbackEnd||'' };
    }
    return team.includes(staffId) ? { sid:staffId, s:fallbackStart||'', e:fallbackEnd||'' } : null;
  };

  window._vtMembers = function (team, fallbackStart, fallbackEnd) {
    if (!team || !team.length) return [];
    return team.map(function (t) {
      if (typeof t === 'object') return { sid:t.sid, s:t.s||fallbackStart||'', e:t.e||fallbackEnd||'' };
      return { sid:t, s:fallbackStart||'', e:fallbackEnd||'' };
    }).filter(function (m) { return m.sid; });
  };

})();
