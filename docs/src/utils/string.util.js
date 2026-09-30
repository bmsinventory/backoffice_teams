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
  // ── ช่องที่เก็บ "คน" เป็นรหัสพนักงาน (เช่น เจ้าของไซต์/ผู้ติดตั้งของโครงการ) → หาพนักงาน/ชื่อปัจจุบัน
  // ข้อมูลเก่าที่ยังเป็นชื่อ (ก่อนรัน SQL แปลงเป็นรหัส) ก็หาเจอด้วย sameName · หาไม่เจอเลย → คืนค่าเดิม ──
  window.staffByRef = function (ref) {
    if (!ref) return null;
    var list = window.STAFF || [];
    var byNick = list.filter(function (s) { return s.nickname && s.nickname === ref; }); // ชื่อเล่น — ใช้เฉพาะเมื่อไม่ซ้ำ
    return list.find(function (s) { return s.id === ref; }) || list.find(function (s) { return window.sameName(s.name, ref); })
      || (byNick.length === 1 ? byNick[0] : null);
  };
  window.staffNameByRef = function (ref) { var s = window.staffByRef(ref); return s ? s.name : (ref || ''); };
  // ชื่อเล่น (ไม่มีชื่อเล่น → ชื่อเต็ม) — สำหรับจุดที่เดิมแสดงชื่อเล่น เช่น ผู้รับผิดชอบงานใน Impl Tracker
  window.staffNickByRef = function (ref) { var s = window.staffByRef(ref); return s ? (s.nickname || s.name) : (ref || ''); };
  // แปลงเป็นรหัสพนักงานก่อนบันทึก (รับได้ทั้งรหัส/ชื่อเต็ม/ชื่อเล่น) — หาไม่เจอ → คืนค่าเดิม ไม่ทิ้งข้อมูล
  window.staffIdByRef = function (ref) { var s = window.staffByRef(ref); return s ? s.id : (ref || ''); };
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
