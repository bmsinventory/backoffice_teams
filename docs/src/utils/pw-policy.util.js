/**
 * pw-policy.util.js — รหัสผ่านเดาง่ายห้ามใช้ (ตรวจในเครื่อง ไม่ส่งไปไหน)
 * เดาง่าย = เรียงกัน (1234, 123456, 4321, abcd, qwerty) · ตัวซ้ำ/ชุดซ้ำ (0000, 121212, 123123) · รหัสยอดนิยม (password, admin123) · เหมือนชื่อผู้ใช้
 * Admin ตั้ง/รีเซ็ตรหัสให้เป็น 123456 (DEFAULT) → ผู้ใช้เข้าระบบครั้งแรกถูกบังคับตั้งรหัสใหม่บนการ์ด Login (auth.service.js _startPwFix)
 * ใช้ที่: auth.service.js (Login + ตั้งรหัสใหม่) · admin.js (เปลี่ยนรหัสเอง · ปุ่มรีเซ็ตในฟอร์มผู้ใช้)
 */
(function () {
  var FLAG = '_bms_pw_weak'; // uid ที่ค้างอยู่หน้าตั้งรหัสใหม่ — ปิดแท็บ/Refresh ระหว่างนั้น session ที่ได้มาจะถูกปิด (auth.service.js _restoreSession)
  var SEQ = ['01234567890', '09876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba',
    'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa', 'zxcvbnm', 'mnbvcxz'];
  var COMMON = ['password', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'admin', 'admin123', 'administrator', 'root', 'user', 'test', 'guest',
    'abc123', 'a123456', '123456a', '1q2w3e4r', '1q2w3e', '1qaz2wsx', 'qwe123', 'qwerty123', 'iloveyou', 'welcome', 'letmein',
    'bms', 'bms123', 'bms1234', 'hosxp', 'hosxp123', 'backoffice'];

  window.PwPolicy = {
    DEFAULT: '123456',
    // true = เดาง่าย ห้ามใช้
    weak: function (pw, username) {
      var s = String(pw || '').toLowerCase();
      if (!s) return true;
      if (COMMON.indexOf(s) > -1) return true;
      if (username && s === String(username).toLowerCase()) return true;
      if (/^(.{1,3})\1+$/.test(s)) return true; // 0000 · 121212 · 123123 · abab
      if (s.length >= 3 && SEQ.some(function (q) { return q.indexOf(s) > -1; })) return true; // เรียงกันทั้งรหัส
      return false;
    },
    flag: function (uid) { try { localStorage.setItem(FLAG, uid); } catch (e) {} },
    flagged: function (uid) { try { return !!uid && localStorage.getItem(FLAG) === uid; } catch (e) { return false; } },
    unflag: function () { try { localStorage.removeItem(FLAG); } catch (e) {} },
  };
})();
